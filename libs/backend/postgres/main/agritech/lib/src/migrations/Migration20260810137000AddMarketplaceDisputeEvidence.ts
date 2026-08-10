// @requirements REQ-AGRITECH-LIFECYCLE-020
import { Migration } from '@mikro-orm/migrations';

/**
 * Adds provider-backed immutable dispute evidence, evidence-bound moderation,
 * and derived reputation signals. Raw evidence bytes remain outside PostgreSQL.
 */
export class Migration20260810137000AddMarketplaceDisputeEvidence extends Migration {
  override up(): void {
    this.addSql(`
      do $$
      begin
        if exists (select 1 from "marketplace_contract_disputes" where "status" = 'resolved') then
          raise exception 'resolved legacy disputes require evidence remediation before lifecycle evidence migration';
        end if;
      end $$;
    `);
    this.replaceProviderContracts(true);
    this.addSql(`
      alter table "marketplace_contract_disputes"
        drop constraint "ck__contract_disputes__resolution",
        add column "resolution_evidence_revision" int null,
        drop column "evidence_reference";
    `);
    this.addSql(`
      alter table "marketplace_contract_disputes"
        add constraint "ck__contract_disputes__resolution" check (
          ("status" = 'open' and "decision" is null and "resolution_evidence_revision" is null
            and "outcome_note" is null and "resolved_by_admin_id" is null and "resolved_at" is null
            and "resolution_idempotency_key" is null and "resolution_request_fingerprint" is null
            and "revision" = 0)
          or ("status" = 'resolved' and "decision" in ('dismissed', 'upheld_cancelled')
            and "resolution_evidence_revision" > 0 and btrim("outcome_note") <> ''
            and btrim("resolved_by_admin_id") <> '' and "resolved_at" is not null
            and btrim("resolution_idempotency_key") <> ''
            and "resolution_request_fingerprint" ~ '^[a-f0-9]{64}$' and "revision" = 1)
        );
    `);
    this.addEvidenceTables();
    this.addEvidenceFunctions();
    this.addEvidenceTriggers();
  }

  private addEvidenceTables(): void {
    this.addSql(`
      create table "marketplace_contract_dispute_evidence" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "dispute_id" uuid not null,
        "provider_operation_id" uuid not null,
        "dispute_revision" int not null,
        "revision" int not null,
        "uploaded_by_party" varchar(10) not null,
        "uploaded_by_tenant_id" varchar(100) not null,
        "uploaded_by_user_id" varchar(100) not null,
        "file_name" varchar(200) not null,
        "media_type" varchar(50) not null,
        "byte_size" int not null,
        "checksum_sha256" varchar(64) not null,
        "storage_reference" varchar(300) not null,
        "provider_mode" varchar(10) not null,
        "provider_name" varchar(100) not null,
        "provider_reference" varchar(200) not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_dispute_evidence_pkey" primary key ("id"),
        constraint "fk__contract_dispute_evidence__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__contract_dispute_evidence__dispute_id"
          foreign key ("dispute_id") references "marketplace_contract_disputes" ("id") on delete restrict,
        constraint "fk__contract_dispute_evidence__provider_operation_id"
          foreign key ("provider_operation_id") references "marketplace_provider_operations" ("id") on delete restrict,
        constraint "uq__contract_dispute_evidence__provider_operation" unique ("provider_operation_id"),
        constraint "uq__contract_dispute_evidence__dispute_revision" unique ("dispute_id", "revision"),
        constraint "ck__contract_dispute_evidence__party" check ("uploaded_by_party" in ('buyer', 'seller')),
        constraint "ck__contract_dispute_evidence__media_type"
          check ("media_type" in ('application/pdf', 'image/jpeg', 'image/png')),
        constraint "ck__contract_dispute_evidence__shape" check (
          "dispute_revision" >= 0 and "revision" > 0 and "byte_size" between 1 and 10485760
          and "checksum_sha256" ~ '^[a-f0-9]{64}$' and btrim("file_name") <> ''
          and btrim("storage_reference") <> '' and btrim("provider_name") <> ''
          and "provider_reference" ~ '^[!-~]{1,200}$' and "provider_mode" in ('mock', 'live')
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_contract_dispute_evidence__contract_id_ef48c1a2"
        on "marketplace_contract_dispute_evidence" ("contract_id", "created_at");
    `);
    this.addSql(`
      create table "marketplace_contract_dispute_resolution_evidence" (
        "id" uuid not null,
        "dispute_id" uuid not null,
        "evidence_id" uuid not null,
        "evidence_revision" int not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_dispute_resolution_evidence_pkey" primary key ("id"),
        constraint "fk__contract_dispute_resolution_evidence__dispute_id"
          foreign key ("dispute_id") references "marketplace_contract_disputes" ("id") on delete restrict,
        constraint "fk__contract_dispute_resolution_evidence__evidence_id"
          foreign key ("evidence_id") references "marketplace_contract_dispute_evidence" ("id") on delete restrict,
        constraint "uq__contract_dispute_resolution_evidence__dispute_evidence"
          unique ("dispute_id", "evidence_id"),
        constraint "ck__contract_dispute_resolution_evidence__revision" check ("evidence_revision" > 0)
      );
    `);
    this.addSql(`
      create table "marketplace_contract_reputation_signals" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "dispute_id" uuid not null,
        "dispute_revision" int not null,
        "subject_party" varchar(10) not null,
        "outcome" varchar(30) not null,
        "impact" varchar(10) not null default 'negative',
        "reason" varchar(30) not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_reputation_signals_pkey" primary key ("id"),
        constraint "fk__contract_reputation_signals__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__contract_reputation_signals__dispute_id"
          foreign key ("dispute_id") references "marketplace_contract_disputes" ("id") on delete restrict,
        constraint "uq__contract_reputation_signals__dispute_id" unique ("dispute_id"),
        constraint "ck__contract_reputation_signals__party" check ("subject_party" in ('buyer', 'seller')),
        constraint "ck__contract_reputation_signals__outcome"
          check ("outcome" in ('dispute_dismissed', 'dispute_upheld') and "impact" = 'negative'),
        constraint "ck__contract_reputation_signals__reason" check (
          "reason" in ('delivery_issue', 'quality_issue', 'quantity_issue', 'other')
          and "dispute_revision" > 0
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_contract_reputation_signals__contract_300c7c25"
        on "marketplace_contract_reputation_signals" ("contract_id", "created_at");
    `);
  }

  private addEvidenceFunctions(): void {
    this.addSql(`
      create function "guard_marketplace_contract_dispute_evidence_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract dispute evidence is immutable'
          using errcode = '23514', constraint = 'ck__contract_dispute_evidence__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_contract_dispute_evidence_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1
            from "marketplace_contract_disputes" dispute
            join "marketplace_provider_operations" operation on operation."id" = new."provider_operation_id"
           where dispute."id" = new."dispute_id" and dispute."contract_id" = new."contract_id"
             and dispute."status" = 'open' and dispute."revision" = new."dispute_revision"
             and operation."resource_type" = 'contract' and operation."resource_id" = new."contract_id"
             and operation."resource_revision" = new."dispute_revision"
             and operation."capability" = 'dispute_evidence_storage' and operation."status" = 'succeeded'
             and operation."actor_type" = case new."uploaded_by_party"
               when 'buyer' then 'contract_buyer' else 'contract_seller' end
             and operation."tenant_id" = new."uploaded_by_tenant_id"
             and operation."user_id" = new."uploaded_by_user_id"
             and operation."provider_mode" = new."provider_mode"
             and operation."provider_name" = new."provider_name"
             and operation."provider_reference" = new."provider_reference"
             and operation."receipt" ->> 'checksumSha256' = new."checksum_sha256"
             and operation."receipt" ->> 'fileName' = new."file_name"
             and operation."receipt" ->> 'mediaType' = new."media_type"
             and operation."receipt" ->> 'byteSize' = new."byte_size"::text
             and operation."receipt" ->> 'storageReference' = new."storage_reference"
        ) then
          raise exception 'marketplace contract dispute evidence is incoherent'
            using errcode = '23514', constraint = 'ck__contract_dispute_evidence__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_contract_dispute_resolution_evidence_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract dispute resolution evidence is immutable'
          using errcode = '23514', constraint = 'ck__contract_dispute_resolution_evidence__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_contract_reputation_signal_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract reputation signal is immutable'
          using errcode = '23514', constraint = 'ck__contract_reputation_signals__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_contract_dispute_resolution_coherence"() returns trigger as $$
      declare
        target_dispute_id uuid;
      begin
        if tg_table_name = 'marketplace_contract_disputes' then
          target_dispute_id := new."id";
        else
          target_dispute_id := new."dispute_id";
        end if;
        if exists (
          select 1
            from "marketplace_contract_disputes" dispute
           where dispute."id" = target_dispute_id and dispute."status" = 'resolved'
             and (
               not exists (
                 select 1 from "marketplace_contract_dispute_resolution_evidence" selected
                  where selected."dispute_id" = dispute."id"
               )
               or dispute."resolution_evidence_revision" is distinct from (
                 select max(evidence."revision")
                   from "marketplace_contract_dispute_evidence" evidence
                  where evidence."dispute_id" = dispute."id"
               )
               or exists (
                 select 1
                   from "marketplace_contract_dispute_resolution_evidence" selected
                   join "marketplace_contract_dispute_evidence" evidence on evidence."id" = selected."evidence_id"
                  where selected."dispute_id" = dispute."id"
                    and (evidence."dispute_id" <> dispute."id"
                      or selected."evidence_revision" <> evidence."revision"
                      or evidence."revision" > dispute."resolution_evidence_revision")
               )
               or not exists (
                 select 1 from "marketplace_contract_reputation_signals" signal
                  where signal."dispute_id" = dispute."id"
                    and signal."contract_id" = dispute."contract_id"
                    and signal."dispute_revision" = dispute."revision"
               )
             )
        ) then
          raise exception 'marketplace contract dispute resolution is incoherent'
            using errcode = '23514', constraint = 'ck__contract_dispute_resolution_evidence__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_contract_reputation_signal_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1
            from "marketplace_contract_disputes" dispute
           where dispute."id" = new."dispute_id" and dispute."contract_id" = new."contract_id"
             and dispute."status" = 'resolved' and dispute."revision" = new."dispute_revision"
             and dispute."reason" = new."reason"
             and new."outcome" = case dispute."decision"
               when 'upheld_cancelled' then 'dispute_upheld' else 'dispute_dismissed' end
             and new."subject_party" = case
               when dispute."decision" = 'upheld_cancelled' and dispute."opened_by_party" = 'buyer' then 'seller'
               when dispute."decision" = 'upheld_cancelled' and dispute."opened_by_party" = 'seller' then 'buyer'
               else dispute."opened_by_party"
             end
        ) then
          raise exception 'marketplace contract reputation signal is incoherent'
            using errcode = '23514', constraint = 'ck__contract_reputation_signals__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.replaceDisputeGuard(true);
  }

  private addEvidenceTriggers(): void {
    this.addSql(`
      create trigger "tr__contract_dispute_evidence__immutable"
        before update or delete on "marketplace_contract_dispute_evidence"
        for each row execute function "guard_marketplace_contract_dispute_evidence_immutable"();
    `);
    this.addSql(`
      create constraint trigger "ct__contract_dispute_evidence__coherence"
        after insert on "marketplace_contract_dispute_evidence"
        deferrable initially immediate for each row
        execute function "assert_marketplace_contract_dispute_evidence_coherence"();
    `);
    this.addSql(`
      create trigger "tr__contract_dispute_resolution_evidence__immutable"
        before update or delete on "marketplace_contract_dispute_resolution_evidence"
        for each row execute function "guard_marketplace_contract_dispute_resolution_evidence_immutable"();
    `);
    this.addSql(`
      create trigger "tr__contract_reputation_signals__immutable"
        before update or delete on "marketplace_contract_reputation_signals"
        for each row execute function "guard_marketplace_contract_reputation_signal_immutable"();
    `);
    this.addSql(`
      create constraint trigger "ct__contract_dispute_resolution__coherence"
        after update of "status" on "marketplace_contract_disputes"
        deferrable initially deferred for each row
        execute function "assert_marketplace_contract_dispute_resolution_coherence"();
    `);
    this.addSql(`
      create constraint trigger "ct__contract_dispute_resolution_evidence__coherence"
        after insert on "marketplace_contract_dispute_resolution_evidence"
        deferrable initially deferred for each row
        execute function "assert_marketplace_contract_dispute_resolution_coherence"();
    `);
    this.addSql(`
      create constraint trigger "ct__contract_reputation_signals__coherence"
        after insert on "marketplace_contract_reputation_signals"
        deferrable initially deferred for each row
        execute function "assert_marketplace_contract_reputation_signal_coherence"();
    `);
  }

  private replaceDisputeGuard(withEvidence: boolean): void {
    this.addSql(`drop trigger "tr__marketplace_contract_disputes__guard" on "marketplace_contract_disputes";`);
    this.addSql(`drop function "guard_marketplace_contract_dispute"();`);
    this.addSql(`
      create function "guard_marketplace_contract_dispute"() returns trigger as $$
      begin
        if tg_op = 'DELETE' then
          raise exception 'marketplace contract dispute cannot be deleted'
            using errcode = '23514', constraint = 'ck__contract_disputes__immutable_identity';
        end if;
        if tg_op = 'INSERT' then
          if new."status" <> 'open' or new."revision" <> 0 then
            raise exception 'marketplace contract dispute initial state is invalid'
              using errcode = '23514', constraint = 'ck__contract_disputes__transition';
          end if;
          return new;
        end if;
        if (new."id", new."contract_id", new."opened_by_party", new."opened_by_tenant_id",
            new."opened_by_user_id", new."reason", new."previous_fulfillment_status", new."created_at")
          is distinct from
           (old."id", old."contract_id", old."opened_by_party", old."opened_by_tenant_id",
            old."opened_by_user_id", old."reason", old."previous_fulfillment_status", old."created_at")
          or old."status" <> 'open' or new."status" <> 'resolved'
          or new."revision" <> old."revision" + 1
          ${
            withEvidence
              ? `or exists (
            select 1 from "marketplace_provider_operations" operation
             where operation."resource_type" = 'contract'
               and operation."resource_id" = old."contract_id"
               and operation."resource_revision" = old."revision"
               and operation."capability" = 'dispute_evidence_storage'
               and (operation."status" = 'started' or operation."reconciliation_required"
                 or (operation."status" = 'succeeded' and not exists (
                   select 1 from "marketplace_contract_dispute_evidence" evidence
                    where evidence."provider_operation_id" = operation."id"
                 )))
          )`
              : ''
          }
        then
          raise exception 'marketplace contract dispute transition is invalid'
            using errcode = '23514', constraint = 'ck__contract_disputes__transition';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_contract_disputes__guard"
        before insert or update or delete on "marketplace_contract_disputes"
        for each row execute function "guard_marketplace_contract_dispute"();
    `);
  }

  private replaceProviderContracts(withEvidence: boolean): void {
    this.addSql(`
      alter table "marketplace_provider_operations"
        drop constraint "ck__marketplace_provider_ops__capability",
        drop constraint "ck__marketplace_provider_ops__scope",
        drop constraint "ck__marketplace_provider_ops__request_descriptor";
    `);
    this.addSql(`drop index "uq__marketplace_provider_operations__resource_type_res_e15a456d";`);
    this.addSql(`
      create or replace function "marketplace_provider_descriptor_is_valid"(
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
          ${withEvidence ? `when 'dispute_evidence_storage' then 'store-dispute-evidence'` : ''}
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
            and btrim(coalesce(document ->> 'fileName', '')) <> '' and length(document ->> 'fileName') <= 200
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
    const evidenceCapability = withEvidence ? ", 'dispute_evidence_storage'" : '';
    this.addSql(`
      alter table "marketplace_provider_operations"
        add constraint "ck__marketplace_provider_ops__capability"
          check ("capability" in ('oneid_link', 'verification_documents', 'contract_artifact_storage'${evidenceCapability}, 'qualified_signature', 'promotion_billing', 'direct_payment', 'factoring')),
        add constraint "ck__marketplace_provider_ops__scope" check (
          ("capability" in ('oneid_link', 'verification_documents')
            and "resource_type" = 'verification' and "actor_type" = 'verification_subject')
          or ("capability" in ('contract_artifact_storage'${evidenceCapability}, 'qualified_signature', 'direct_payment', 'factoring')
            and "resource_type" = 'contract' and "actor_type" in ('contract_buyer', 'contract_seller'))
          or ("capability" = 'promotion_billing'
            and "resource_type" = 'promotion' and "actor_type" = 'promotion_owner')
        ),
        add constraint "ck__marketplace_provider_ops__request_descriptor" check (
          "marketplace_provider_descriptor_is_valid"(
            "request_descriptor", "capability", "resource_type", "resource_id", "resource_revision"
          )
        );
    `);
    const fingerprintCapabilities = withEvidence
      ? "('verification_documents', 'dispute_evidence_storage')"
      : "('verification_documents')";
    this.addSql(`
      create unique index "uq__marketplace_provider_operations__resource_type_res_e15a456d"
        on "marketplace_provider_operations" (
          "resource_type", "resource_id", "resource_revision", "capability", "actor_type",
          "tenant_id", "user_id", "request_fingerprint"
        ) where "status" in ('started', 'succeeded') and "capability" in ${fingerprintCapabilities};
    `);
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (select 1 from "marketplace_contract_dispute_evidence")
          or exists (select 1 from "marketplace_contract_dispute_resolution_evidence")
          or exists (select 1 from "marketplace_contract_reputation_signals")
          or exists (select 1 from "marketplace_contract_disputes" where "status" = 'resolved')
        then
          raise exception 'cannot downgrade marketplace dispute evidence after evidence or resolution traffic';
        end if;
      end $$;
    `);
    this.addSql(
      `drop trigger "ct__contract_reputation_signals__coherence" on "marketplace_contract_reputation_signals";`,
    );
    this.addSql(
      `drop trigger "ct__contract_dispute_resolution_evidence__coherence" on "marketplace_contract_dispute_resolution_evidence";`,
    );
    this.addSql(`drop trigger "ct__contract_dispute_resolution__coherence" on "marketplace_contract_disputes";`);
    this.addSql(
      `drop trigger "tr__contract_reputation_signals__immutable" on "marketplace_contract_reputation_signals";`,
    );
    this.addSql(
      `drop trigger "tr__contract_dispute_resolution_evidence__immutable" on "marketplace_contract_dispute_resolution_evidence";`,
    );
    this.addSql(`drop trigger "ct__contract_dispute_evidence__coherence" on "marketplace_contract_dispute_evidence";`);
    this.addSql(`drop trigger "tr__contract_dispute_evidence__immutable" on "marketplace_contract_dispute_evidence";`);
    this.addSql(`drop function "assert_marketplace_contract_reputation_signal_coherence"();`);
    this.addSql(`drop function "assert_marketplace_contract_dispute_resolution_coherence"();`);
    this.addSql(`drop function "guard_marketplace_contract_reputation_signal_immutable"();`);
    this.addSql(`drop function "guard_marketplace_contract_dispute_resolution_evidence_immutable"();`);
    this.addSql(`drop function "assert_marketplace_contract_dispute_evidence_coherence"();`);
    this.addSql(`drop function "guard_marketplace_contract_dispute_evidence_immutable"();`);
    this.replaceDisputeGuard(false);
    this.addSql(`drop table "marketplace_contract_reputation_signals";`);
    this.addSql(`drop table "marketplace_contract_dispute_resolution_evidence";`);
    this.addSql(`drop table "marketplace_contract_dispute_evidence";`);
    this.addSql(`
      alter table "marketplace_contract_disputes"
        drop constraint "ck__contract_disputes__resolution",
        drop column "resolution_evidence_revision",
        add column "evidence_reference" varchar(300) null;
    `);
    this.addSql(`
      alter table "marketplace_contract_disputes"
        add constraint "ck__contract_disputes__resolution" check (
          ("status" = 'open' and "decision" is null and "evidence_reference" is null
            and "outcome_note" is null and "resolved_by_admin_id" is null and "resolved_at" is null
            and "resolution_idempotency_key" is null and "resolution_request_fingerprint" is null and "revision" = 0)
          or ("status" = 'resolved' and "decision" in ('dismissed', 'upheld_cancelled')
            and btrim("evidence_reference") <> '' and btrim("outcome_note") <> ''
            and btrim("resolved_by_admin_id") <> '' and "resolved_at" is not null
            and btrim("resolution_idempotency_key") <> ''
            and "resolution_request_fingerprint" ~ '^[a-f0-9]{64}$' and "revision" = 1)
        );
    `);
    this.replaceProviderContracts(false);
  }
}
