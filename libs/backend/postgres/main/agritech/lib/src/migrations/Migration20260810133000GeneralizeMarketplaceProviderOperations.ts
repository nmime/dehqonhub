// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

/**
 * Generalizes the verification provider ledger for party-bound marketplace
 * capabilities. Provider calls remain outside transactions; this migration
 * owns only durable command, fencing, safe-receipt, and resource-anchor rules.
 */
export class Migration20260810133000GeneralizeMarketplaceProviderOperations extends Migration {
  override up(): void {
    this.addSql(`
      alter table "marketplace_provider_operations"
        drop constraint "fk__marketplace_provider_operations__verification_actor",
        drop constraint "uq__marketplace_provider_ops__actor_capability_resource_key",
        drop constraint "ck__marketplace_provider_ops__capability",
        drop constraint "ck__marketplace_provider_ops__resource",
        drop constraint "ck__marketplace_provider_ops__request_descriptor",
        drop constraint "ck__marketplace_provider_ops__receipt_state";
    `);
    this.addSql(`drop index "ix__marketplace_provider_operations__tenant_id_user_id_status";`);
    this.addSql(`
      alter table "marketplace_provider_operations"
        add column "actor_type" varchar(30) null,
        add column "provider_event_id" varchar(200) null,
        add column "result_fingerprint" varchar(64) null,
        add column "reconciliation_required" boolean not null default false,
        add column "reconciliation_reason" varchar(100) null;
    `);
    this.addSql(`
      update "marketplace_provider_operations"
         set "actor_type" = 'verification_subject',
             "receipt" = case
               when "status" = 'succeeded' then jsonb_build_object(
                 'legacyReceiptFingerprint',
                 md5("receipt"::text) || md5('marketplace-provider-receipt:' || "receipt"::text),
                 'migrated', true
               )
               else "receipt"
             end,
             "result_fingerprint" = case
               when "status" = 'succeeded' then
                 md5("result_snapshot"::text) || md5('marketplace-provider-result:' || "result_snapshot"::text)
               else null
             end;
    `);
    this.addSql(`alter table "marketplace_provider_operations" alter column "actor_type" set not null;`);

    this.addSql(`
      create function "marketplace_provider_descriptor_is_valid"(
        descriptor jsonb,
        provider_capability varchar,
        provider_resource_type varchar,
        provider_resource_id uuid,
        provider_resource_revision int
      ) returns boolean as $$
      declare
        document jsonb;
        expected_action varchar;
      begin
        if jsonb_typeof(descriptor) <> 'object'
          or pg_column_size(descriptor) > 4096
          or descriptor ->> 'resourceId' is distinct from provider_resource_id::text
          or descriptor ->> 'resourceType' is distinct from provider_resource_type
          or jsonb_typeof(descriptor -> 'resourceRevision') <> 'number'
          or descriptor ->> 'resourceRevision' !~ '^(0|[1-9][0-9]*)$'
          or (descriptor ->> 'resourceRevision')::int <> provider_resource_revision
        then
          return false;
        end if;

        expected_action := case provider_capability
          when 'oneid_link' then 'link-oneid'
          when 'verification_documents' then 'store-verification-document'
          when 'contract_artifact_storage' then 'store-contract-artifact'
          when 'qualified_signature' then 'qualify-contract-signature'
          when 'promotion_billing' then 'bill-listing-promotion'
          when 'direct_payment' then 'record-direct-payment'
          when 'factoring' then 'record-factoring'
          else null
        end;
        if expected_action is null or descriptor ->> 'action' is distinct from expected_action then
          return false;
        end if;

        if provider_capability = 'oneid_link' then
          return descriptor - array['action', 'resourceId', 'resourceRevision', 'resourceType'] = '{}'::jsonb;
        end if;
        if provider_capability = 'verification_documents' then
          document := descriptor -> 'document';
          return coalesce((
            descriptor - array['action', 'document', 'resourceId', 'resourceRevision', 'resourceType'] = '{}'::jsonb
            and jsonb_typeof(document) = 'object'
            and document - array['fileName', 'kind', 'mimeType', 'sha256', 'sizeBytes'] = '{}'::jsonb
            and btrim(coalesce(document ->> 'fileName', '')) <> ''
            and length(document ->> 'fileName') <= 200
            and document ->> 'fileName' !~ '[/\\\\]'
            and document ->> 'kind' in ('id', 'land', 'lease', 'cadastre', 'farm', 'machinery', 'warehouse', 'business', 'license')
            and document ->> 'mimeType' in ('application/pdf', 'image/jpeg', 'image/png')
            and document ->> 'sha256' ~ '^[a-f0-9]{64}$'
            and jsonb_typeof(document -> 'sizeBytes') = 'number'
            and document ->> 'sizeBytes' ~ '^[1-9][0-9]*$'
            and (document ->> 'sizeBytes')::int between 1 and 10485760
          ), false);
        end if;
        return coalesce((
          descriptor - array['action', 'parametersFingerprint', 'resourceId', 'resourceRevision', 'resourceType'] = '{}'::jsonb
          and descriptor ->> 'parametersFingerprint' ~ '^[a-f0-9]{64}$'
        ), false);
      exception when others then
        return false;
      end;
      $$ language plpgsql immutable;
    `);
    this.addSql(`
      create function "marketplace_provider_result_is_valid"(
        result_descriptor jsonb,
        provider_resource_type varchar,
        provider_resource_id uuid,
        provider_resource_revision int
      ) returns boolean as $$
      begin
        return coalesce((
          jsonb_typeof(result_descriptor) = 'object'
          and pg_column_size(result_descriptor) <= 4096
          and result_descriptor - array['completedAt', 'outcome', 'resourceId', 'resourceRevision', 'resourceType'] = '{}'::jsonb
          and result_descriptor ->> 'resourceId' is not distinct from provider_resource_id::text
          and result_descriptor ->> 'resourceType' is not distinct from provider_resource_type
          and jsonb_typeof(result_descriptor -> 'resourceRevision') = 'number'
          and result_descriptor ->> 'resourceRevision' ~ '^(0|[1-9][0-9]*)$'
          and (result_descriptor ->> 'resourceRevision')::int = provider_resource_revision
          and result_descriptor ->> 'outcome' ~ '^[a-z][a-z0-9_-]{0,79}$'
          and jsonb_typeof(result_descriptor -> 'completedAt') = 'string'
          and result_descriptor ->> 'completedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$'
          and (result_descriptor ->> 'completedAt')::timestamptz is not null
        ), false);
      exception when others then
        return false;
      end;
      $$ language plpgsql immutable;
    `);
    this.addSql(`
      create function "marketplace_provider_receipt_is_safe"(provider_receipt jsonb)
      returns boolean as $$
        select jsonb_typeof(provider_receipt) = 'object'
          and pg_column_size(provider_receipt) <= 4096
          and (select count(*) between 1 and 24 from jsonb_each(provider_receipt))
          and not exists (
            select 1
              from jsonb_each(provider_receipt) entry
             where entry.key !~ '^[a-z][a-zA-Z0-9_]{0,63}$'
                or entry.key ~* '(access[_-]?token|refresh[_-]?token|authorization|cookie|credential|document[_-]?bytes|private[_-]?key|raw|secret|payload|pinfl|tin)'
                or case jsonb_typeof(entry.value)
                  when 'null' then false
                  when 'boolean' then false
                  when 'number' then not (
                    entry.value #>> '{}' ~ '^-?(0|[1-9][0-9]*)$'
                    and (entry.value #>> '{}')::numeric between -9007199254740991 and 9007199254740991
                  )
                  when 'string' then length(entry.value #>> '{}') > 500 or entry.value #>> '{}' ~ '[[:cntrl:]]'
                  else true
                end
          );
      $$ language sql immutable strict;
    `);

    this.addSql(`
      alter table "marketplace_provider_operations"
        add constraint "uq__marketplace_provider_ops__scope_key"
          unique ("tenant_id", "user_id", "actor_type", "capability", "resource_type", "resource_id", "idempotency_key"),
        add constraint "ck__marketplace_provider_ops__capability"
          check ("capability" in ('oneid_link', 'verification_documents', 'contract_artifact_storage', 'qualified_signature', 'promotion_billing', 'direct_payment', 'factoring')),
        add constraint "ck__marketplace_provider_ops__scope" check (
          ("capability" in ('oneid_link', 'verification_documents')
            and "resource_type" = 'verification' and "actor_type" = 'verification_subject')
          or ("capability" in ('contract_artifact_storage', 'qualified_signature', 'direct_payment', 'factoring')
            and "resource_type" = 'contract' and "actor_type" in ('contract_buyer', 'contract_seller'))
          or ("capability" = 'promotion_billing'
            and "resource_type" = 'promotion' and "actor_type" = 'promotion_owner')
        ),
        add constraint "ck__marketplace_provider_ops__resource_revision" check ("resource_revision" >= 0),
        add constraint "ck__marketplace_provider_ops__request_descriptor" check (
          "marketplace_provider_descriptor_is_valid"(
            "request_descriptor", "capability", "resource_type", "resource_id", "resource_revision"
          )
        ),
        add constraint "ck__marketplace_provider_ops__request_fingerprint"
          check ("request_fingerprint" ~ '^[a-f0-9]{64}$'),
        add constraint "ck__marketplace_provider_ops__provider_reference"
          check ("provider_reference" is null or "provider_reference" ~ '^[!-~]{1,200}$'),
        add constraint "ck__marketplace_provider_ops__provider_event" check (
          ("provider_event_id" is null or "provider_event_id" ~ '^[!-~]{1,200}$')
          and ("status" <> 'succeeded' or "capability" not in ('direct_payment', 'factoring')
            or "provider_event_id" is not null)
        ),
        add constraint "ck__marketplace_provider_ops__safe_receipt"
          check ("receipt" is null or "marketplace_provider_receipt_is_safe"("receipt")),
        add constraint "ck__marketplace_provider_ops__result_descriptor" check (
          "status" <> 'succeeded'
          or "capability" in ('oneid_link', 'verification_documents')
          or "marketplace_provider_result_is_valid"(
            "result_snapshot", "resource_type", "resource_id", "resource_revision"
          )
        ),
        add constraint "ck__marketplace_provider_ops__result_fingerprint"
          check ("result_fingerprint" is null or "result_fingerprint" ~ '^[a-f0-9]{64}$'),
        add constraint "ck__marketplace_provider_ops__reconciliation"
          check ("reconciliation_required" = ("reconciliation_reason" is not null)
            and ("reconciliation_reason" is null or "reconciliation_reason" ~ '^[a-z][a-z0-9_-]{0,99}$')),
        add constraint "ck__marketplace_provider_ops__receipt_state" check (
          ("status" = 'succeeded' and "provider_reference" is not null and "receipt" is not null
            and "result_snapshot" is not null and "result_fingerprint" is not null
            and "error_code" is null and "lease_expires_at" is null)
          or ("status" = 'failed' and "provider_reference" is null and "receipt" is null
            and "result_snapshot" is null and "result_fingerprint" is null
            and "error_code" is not null and "lease_expires_at" is null)
          or ("status" = 'started' and "provider_reference" is null and "receipt" is null
            and "result_snapshot" is null and "result_fingerprint" is null
            and "error_code" is null and "lease_expires_at" is not null)
        );
    `);
    this.addSql(`
      create unique index "uq__marketplace_provider_operations__provider_mode_pro_24c07bd3"
        on "marketplace_provider_operations" ("provider_mode", "provider_name", "capability", "provider_event_id")
        where "provider_event_id" is not null;
    `);
    this.addSql(`
      create unique index "uq__marketplace_provider_operations__resource_type_res_7c8d5a0e"
        on "marketplace_provider_operations" (
          "resource_type", "resource_id", "resource_revision", "capability"
        )
        where "status" in ('started', 'succeeded')
          and "capability" in ('contract_artifact_storage', 'direct_payment', 'factoring');
    `);
    this.addSql(`
      create unique index "uq__marketplace_provider_operations__resource_type_res_60f8f54d"
        on "marketplace_provider_operations" (
          "resource_type", "resource_id", "resource_revision", "capability",
          "actor_type", "tenant_id", "user_id"
        )
        where "status" in ('started', 'succeeded') and "capability" = 'qualified_signature';
    `);
    this.addSql(`
      create unique index "uq__marketplace_provider_operations__resource_type_res_e15a456d"
        on "marketplace_provider_operations" (
          "resource_type", "resource_id", "resource_revision", "capability", "actor_type",
          "tenant_id", "user_id", "request_fingerprint"
        )
        where "status" in ('started', 'succeeded') and "capability" = 'verification_documents';
    `);
    this.addSql(`
      create index "ix__marketplace_provider_operations__tenant_id_user_id_e0057efd"
        on "marketplace_provider_operations" ("tenant_id", "user_id", "actor_type", "status");
    `);

    this.addSql(`
      create function "guard_marketplace_provider_operation"() returns trigger as $$
      begin
        if tg_op = 'INSERT' then
          if new."status" <> 'started' or new."attempt" <> 1 or new."lease_expires_at" is null then
            raise exception 'marketplace provider operation initial state is invalid'
              using errcode = '23514', constraint = 'ck__marketplace_provider_ops__transition';
          end if;
          return new;
        end if;
        if (
          new."tenant_id", new."user_id", new."actor_type", new."capability",
          new."resource_type", new."resource_id", new."resource_revision", new."idempotency_key",
          new."request_fingerprint", new."provider_mode", new."provider_name", new."created_at"
        ) is distinct from (
          old."tenant_id", old."user_id", old."actor_type", old."capability",
          old."resource_type", old."resource_id", old."resource_revision", old."idempotency_key",
          old."request_fingerprint", old."provider_mode", old."provider_name", old."created_at"
        ) or new."request_descriptor" is distinct from old."request_descriptor" then
          raise exception 'marketplace provider operation identity is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_provider_ops__immutable_identity';
        end if;
        if old."status" = 'succeeded'
          or new."updated_at" < old."updated_at"
          or not (
            (old."status" = 'started' and new."status" in ('succeeded', 'failed')
              and new."attempt" = old."attempt")
            or (old."status" = 'started' and new."status" = 'started'
              and new."attempt" = old."attempt" + 1
              and (old."lease_expires_at" is null or old."lease_expires_at" <= now()))
            or (old."status" = 'failed' and not old."reconciliation_required" and new."status" = 'started'
              and new."attempt" = old."attempt" + 1 and old."lease_expires_at" is null)
          )
        then
          raise exception 'marketplace provider operation transition is invalid'
            using errcode = '23514', constraint = 'ck__marketplace_provider_ops__transition';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_provider_ops__guard"
        before insert or update on "marketplace_provider_operations"
        for each row execute function "guard_marketplace_provider_operation"();
    `);

    this.addSql(`
      create function "enforce_marketplace_provider_operation_anchor"() returns trigger as $$
      begin
        if new."resource_type" = 'verification' and exists (
          select 1 from "marketplace_verifications" resource
           where resource."id" = new."resource_id"
             and resource."tenant_id" = new."tenant_id"
             and resource."user_id" = new."user_id"
             and new."actor_type" = 'verification_subject'
        ) then
          return new;
        end if;
        if new."resource_type" = 'contract' and new."actor_type" = 'contract_buyer' and exists (
          select 1 from "marketplace_contracts" resource
           where resource."id" = new."resource_id"
             and resource."binding_status" = 'resolved'
             and resource."tenant_id" = new."tenant_id"
             and resource."buyer_user_id" = new."user_id"
        ) then
          return new;
        end if;
        if new."resource_type" = 'contract' and new."actor_type" = 'contract_seller' and exists (
          select 1 from "marketplace_contracts" resource
           where resource."id" = new."resource_id"
             and resource."binding_status" = 'resolved'
             and resource."seller_tenant_id" = new."tenant_id"
             and resource."seller_user_id" = new."user_id"
        ) then
          return new;
        end if;
        if new."resource_type" = 'promotion' and exists (
          select 1 from "marketplace_listing_promotions" resource
           where resource."id" = new."resource_id"
             and resource."tenant_id" = new."tenant_id"
             and resource."actor_user_id" = new."user_id"
             and new."actor_type" = 'promotion_owner'
        ) then
          return new;
        end if;
        raise exception 'marketplace provider operation resource mismatch'
          using errcode = '23514', constraint = 'ck__marketplace_provider_ops__resource_anchor';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_provider_ops__resource_anchor"
        before insert or update of "tenant_id", "user_id", "actor_type", "resource_type", "resource_id"
        on "marketplace_provider_operations"
        for each row execute function "enforce_marketplace_provider_operation_anchor"();
    `);
    this.addSql(`
      create function "guard_marketplace_provider_resource_anchor"() returns trigger as $$
      declare
        old_row jsonb := to_jsonb(old);
        new_row jsonb := to_jsonb(new);
      begin
        if tg_table_name = 'marketplace_verifications' and exists (
          select 1 from "marketplace_provider_operations" operation
           where operation."resource_type" = 'verification'
             and operation."resource_id"::text = old_row ->> 'id'
             and (tg_op = 'DELETE'
               or (new_row ->> 'id', new_row ->> 'tenant_id', new_row ->> 'user_id')
                 is distinct from (old_row ->> 'id', old_row ->> 'tenant_id', old_row ->> 'user_id'))
        ) then
          raise exception 'marketplace provider operation resource anchor is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_provider_ops__resource_anchor';
        end if;
        if tg_table_name = 'marketplace_contracts' and exists (
          select 1 from "marketplace_provider_operations" operation
           where operation."resource_type" = 'contract'
             and operation."resource_id"::text = old_row ->> 'id'
             and (tg_op = 'DELETE'
               or (new_row ->> 'id', new_row ->> 'tenant_id', new_row ->> 'buyer_user_id',
                   new_row ->> 'seller_tenant_id', new_row ->> 'seller_user_id', new_row ->> 'binding_status')
                 is distinct from
                  (old_row ->> 'id', old_row ->> 'tenant_id', old_row ->> 'buyer_user_id',
                   old_row ->> 'seller_tenant_id', old_row ->> 'seller_user_id', old_row ->> 'binding_status'))
        ) then
          raise exception 'marketplace provider operation resource anchor is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_provider_ops__resource_anchor';
        end if;
        if tg_table_name = 'marketplace_listing_promotions' and exists (
          select 1 from "marketplace_provider_operations" operation
           where operation."resource_type" = 'promotion'
             and operation."resource_id"::text = old_row ->> 'id'
             and (tg_op = 'DELETE'
               or (new_row ->> 'id', new_row ->> 'tenant_id', new_row ->> 'actor_user_id')
                 is distinct from (old_row ->> 'id', old_row ->> 'tenant_id', old_row ->> 'actor_user_id'))
        ) then
          raise exception 'marketplace provider operation resource anchor is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_provider_ops__resource_anchor';
        end if;
        return case when tg_op = 'DELETE' then old else new end;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_verifications__provider_ops_anchor"
        before update or delete on "marketplace_verifications"
        for each row execute function "guard_marketplace_provider_resource_anchor"();
    `);
    this.addSql(`
      create trigger "tr__marketplace_contracts__provider_ops_anchor"
        before update or delete on "marketplace_contracts"
        for each row execute function "guard_marketplace_provider_resource_anchor"();
    `);
    this.addSql(`
      create trigger "tr__listing_promotions__provider_ops_anchor"
        before update or delete on "marketplace_listing_promotions"
        for each row execute function "guard_marketplace_provider_resource_anchor"();
    `);
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from "marketplace_provider_operations"
           where "capability" not in ('oneid_link', 'verification_documents')
              or "actor_type" <> 'verification_subject'
              or "resource_type" <> 'verification'
        ) then
          raise exception 'cannot downgrade marketplace provider operations after generalized capability traffic';
        end if;
      end;
      $$;
    `);
    this.addSql(`drop trigger "tr__listing_promotions__provider_ops_anchor" on "marketplace_listing_promotions";`);
    this.addSql(`drop trigger "tr__marketplace_contracts__provider_ops_anchor" on "marketplace_contracts";`);
    this.addSql(`drop trigger "tr__marketplace_verifications__provider_ops_anchor" on "marketplace_verifications";`);
    this.addSql(`drop function "guard_marketplace_provider_resource_anchor"();`);
    this.addSql(`drop trigger "tr__marketplace_provider_ops__resource_anchor" on "marketplace_provider_operations";`);
    this.addSql(`drop function "enforce_marketplace_provider_operation_anchor"();`);
    this.addSql(`drop trigger "tr__marketplace_provider_ops__guard" on "marketplace_provider_operations";`);
    this.addSql(`drop function "guard_marketplace_provider_operation"();`);
    this.addSql(`drop index "uq__marketplace_provider_operations__resource_type_res_e15a456d";`);
    this.addSql(`drop index "uq__marketplace_provider_operations__resource_type_res_60f8f54d";`);
    this.addSql(`drop index "uq__marketplace_provider_operations__resource_type_res_7c8d5a0e";`);
    this.addSql(`drop index "uq__marketplace_provider_operations__provider_mode_pro_24c07bd3";`);
    this.addSql(`drop index "ix__marketplace_provider_operations__tenant_id_user_id_e0057efd";`);
    this.addSql(`
      alter table "marketplace_provider_operations"
        drop constraint "uq__marketplace_provider_ops__scope_key",
        drop constraint "ck__marketplace_provider_ops__capability",
        drop constraint "ck__marketplace_provider_ops__scope",
        drop constraint "ck__marketplace_provider_ops__resource_revision",
        drop constraint "ck__marketplace_provider_ops__request_descriptor",
        drop constraint "ck__marketplace_provider_ops__request_fingerprint",
        drop constraint "ck__marketplace_provider_ops__provider_reference",
        drop constraint "ck__marketplace_provider_ops__provider_event",
        drop constraint "ck__marketplace_provider_ops__safe_receipt",
        drop constraint "ck__marketplace_provider_ops__result_descriptor",
        drop constraint "ck__marketplace_provider_ops__result_fingerprint",
        drop constraint "ck__marketplace_provider_ops__reconciliation",
        drop constraint "ck__marketplace_provider_ops__receipt_state";
    `);
    this.addSql(`
      alter table "marketplace_provider_operations"
        add constraint "fk__marketplace_provider_operations__verification_actor"
          foreign key ("resource_id", "tenant_id", "user_id")
          references "marketplace_verifications" ("id", "tenant_id", "user_id") on delete restrict,
        add constraint "uq__marketplace_provider_ops__actor_capability_resource_key"
          unique ("tenant_id", "user_id", "capability", "resource_type", "resource_id", "idempotency_key"),
        add constraint "ck__marketplace_provider_ops__capability"
          check ("capability" in ('oneid_link', 'verification_documents')),
        add constraint "ck__marketplace_provider_ops__resource"
          check ("resource_type" = 'verification' and "resource_revision" >= 0),
        add constraint "ck__marketplace_provider_ops__request_descriptor"
          check (jsonb_typeof("request_descriptor") = 'object'),
        add constraint "ck__marketplace_provider_ops__receipt_state" check (
          ("status" = 'succeeded' and "provider_reference" is not null and "receipt" is not null
            and "result_snapshot" is not null and "error_code" is null and "lease_expires_at" is null)
          or ("status" = 'failed' and "provider_reference" is null and "receipt" is null
            and "result_snapshot" is null and "error_code" is not null and "lease_expires_at" is null)
          or ("status" = 'started' and "provider_reference" is null and "receipt" is null
            and "result_snapshot" is null and "error_code" is null and "lease_expires_at" is not null)
        );
    `);
    this.addSql(`
      create index "ix__marketplace_provider_operations__tenant_id_user_id_status"
        on "marketplace_provider_operations" ("tenant_id", "user_id", "status");
    `);
    this.addSql(`
      alter table "marketplace_provider_operations"
        drop column "reconciliation_reason",
        drop column "reconciliation_required",
        drop column "result_fingerprint",
        drop column "provider_event_id",
        drop column "actor_type";
    `);
    this.addSql(`drop function "marketplace_provider_receipt_is_safe"(jsonb);`);
    this.addSql(`drop function "marketplace_provider_result_is_valid"(jsonb, varchar, uuid, int);`);
    this.addSql(`drop function "marketplace_provider_descriptor_is_valid"(jsonb, varchar, varchar, uuid, int);`);
  }
}
