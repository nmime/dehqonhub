// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

/**
 * Adds immutable contract artifacts, party QES records, settlement/fulfillment
 * state, audit events, commission records, and transactional notification intents.
 * Down is safe only before Stage 2 lifecycle traffic is accepted.
 */
export class Migration20260810134000AddMarketplaceContractLifecycle extends Migration {
  override up(): void {
    this.addSql(`
      create table "marketplace_contract_artifacts" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "provider_operation_id" uuid not null,
        "snapshot_revision" int not null default 1,
        "template_version" varchar(50) not null,
        "snapshot_fingerprint" varchar(64) not null,
        "checksum_sha256" varchar(64) not null,
        "media_type" varchar(50) not null,
        "byte_size" int not null,
        "storage_reference" varchar(300) not null,
        "provider_mode" varchar(10) not null,
        "provider_name" varchar(100) not null,
        "watermark" varchar(100) null,
        "content" bytea null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_artifacts_pkey" primary key ("id"),
        constraint "fk__marketplace_contract_artifacts__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__marketplace_contract_artifacts__provider_operation_id"
          foreign key ("provider_operation_id") references "marketplace_provider_operations" ("id") on delete restrict,
        constraint "uq__marketplace_contract_artifacts__contract_id" unique ("contract_id"),
        constraint "uq__marketplace_contract_artifacts__provider_operation_id" unique ("provider_operation_id"),
        constraint "uq__marketplace_contract_artifacts__storage_reference" unique ("storage_reference"),
        constraint "ck__contract_artifacts__fingerprints" check (
          "snapshot_fingerprint" ~ '^[a-f0-9]{64}$' and "checksum_sha256" ~ '^[a-f0-9]{64}$'
        ),
        constraint "ck__contract_artifacts__shape" check (
          "snapshot_revision" = 1 and "template_version" = 'dehqonhub-contract-v1'
          and "media_type" = 'application/pdf' and "byte_size" between 64 and 1048576
        ),
        constraint "ck__contract_artifacts__provider" check (
          ("provider_mode" = 'mock' and "content" is not null
            and "watermark" = 'MOCK PROVIDER — NOT A LEGAL CONTRACT')
          or ("provider_mode" = 'live' and "content" is null and "watermark" is null)
        )
      );
    `);

    this.addSql(`
      create table "marketplace_contract_signatures" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "artifact_id" uuid not null,
        "provider_operation_id" uuid not null,
        "party" varchar(10) not null,
        "party_tenant_id" varchar(100) not null,
        "party_user_id" varchar(100) not null,
        "party_partner_id" uuid not null,
        "artifact_checksum" varchar(64) not null,
        "snapshot_revision" int not null default 1,
        "provider_mode" varchar(10) not null,
        "provider_name" varchar(100) not null,
        "provider_reference" varchar(300) not null,
        "safe_receipt" jsonb not null,
        "signed_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_signatures_pkey" primary key ("id"),
        constraint "fk__marketplace_contract_signatures__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__marketplace_contract_signatures__artifact_id"
          foreign key ("artifact_id") references "marketplace_contract_artifacts" ("id") on delete restrict,
        constraint "fk__marketplace_contract_signatures__provider_operation_id"
          foreign key ("provider_operation_id") references "marketplace_provider_operations" ("id") on delete restrict,
        constraint "uq__marketplace_contract_signatures__contract_id_party" unique ("contract_id", "party"),
        constraint "uq__marketplace_contract_signatures__provider_operation_id" unique ("provider_operation_id"),
        constraint "ck__contract_signatures__party" check ("party" in ('buyer', 'seller')),
        constraint "ck__contract_signatures__provider" check (
          "provider_mode" in ('mock', 'live') and btrim("provider_name") <> '' and btrim("provider_reference") <> ''
        ),
        constraint "ck__contract_signatures__artifact" check (
          "snapshot_revision" = 1 and "artifact_checksum" ~ '^[a-f0-9]{64}$'
        ),
        constraint "ck__contract_signatures__safe_receipt" check (
          jsonb_typeof("safe_receipt") = 'object' and pg_column_size("safe_receipt") <= 4096
        )
      );
    `);

    this.addSql(`
      create table "marketplace_contract_settlements" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "kind" varchar(20) not null,
        "status" varchar(40) not null,
        "amount_uzs" numeric(15,0) not null,
        "currency" varchar(3) not null default 'UZS',
        "selected_by_tenant_id" varchar(100) not null,
        "selected_by_user_id" varchar(100) not null,
        "selection_idempotency_key" varchar(100) not null,
        "selection_request_fingerprint" varchar(64) not null,
        "buyer_consented_at" timestamptz null,
        "seller_consented_at" timestamptz null,
        "latest_provider_mode" varchar(10) not null default 'none',
        "reconciliation_state" varchar(10) not null default 'clear',
        "reconciliation_reason" varchar(100) null,
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_contract_settlements_pkey" primary key ("id"),
        constraint "fk__marketplace_contract_settlements__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "uq__marketplace_contract_settlements__contract_id" unique ("contract_id"),
        constraint "ck__contract_settlements__kind_status" check (
          ("kind" = 'direct_payment' and "status" in (
            'awaiting_buyer_confirmation', 'buyer_confirmed', 'seller_received'
          )) or ("kind" = 'factoring' and "status" in (
            'awaiting_consents', 'ready_to_request', 'approved', 'rejected', 'seller_paid', 'buyer_repaid', 'closed'
          ))
        ),
        constraint "ck__contract_settlements__amount" check (
          "amount_uzs" > 0 and "amount_uzs" = trunc("amount_uzs") and "currency" = 'UZS'
        ),
        constraint "ck__contract_settlements__selection" check (
          "selection_request_fingerprint" ~ '^[a-f0-9]{64}$' and btrim("selection_idempotency_key") <> ''
        ),
        constraint "ck__contract_settlements__consents" check (
          ("kind" = 'direct_payment' and "buyer_consented_at" is null and "seller_consented_at" is null)
          or ("kind" = 'factoring' and (
            "status" = 'awaiting_consents'
            or ("buyer_consented_at" is not null and "seller_consented_at" is not null)
          ))
        ),
        constraint "ck__contract_settlements__provider_mode" check (
          "latest_provider_mode" in ('none', 'mock', 'live')
        ),
        constraint "ck__contract_settlements__reconciliation" check (
          ("reconciliation_state" = 'clear' and "reconciliation_reason" is null)
          or ("reconciliation_state" = 'required' and btrim(coalesce("reconciliation_reason", '')) <> '')
        ),
        constraint "ck__contract_settlements__revision" check ("revision" >= 0)
      );
    `);

    this.addSql(`
      create table "marketplace_contract_lifecycle_events" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "sequence" int not null,
        "category" varchar(20) not null,
        "event_type" varchar(50) not null,
        "actor_party" varchar(10) not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "idempotency_key" varchar(100) null,
        "request_fingerprint" varchar(64) null,
        "provider_operation_id" uuid null,
        "provider_event_id" varchar(200) null,
        "provider_mode" varchar(10) not null default 'none',
        "provider_name" varchar(100) null,
        "provider_reference" varchar(300) null,
        "safe_receipt" jsonb null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_lifecycle_events_pkey" primary key ("id"),
        constraint "fk__contract_lifecycle_events__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__contract_lifecycle_events__provider_operation_id"
          foreign key ("provider_operation_id") references "marketplace_provider_operations" ("id") on delete restrict,
        constraint "uq__contract_lifecycle_events__contract_id_sequence" unique ("contract_id", "sequence"),
        constraint "uq__contract_lifecycle_events__provider_operation_id" unique ("provider_operation_id"),
        constraint "ck__contract_lifecycle_events__sequence" check ("sequence" > 0),
        constraint "ck__contract_lifecycle_events__category" check (
          "category" in ('artifact', 'signature', 'settlement', 'fulfillment', 'dispute', 'completion')
        ),
        constraint "ck__contract_lifecycle_events__party" check ("actor_party" in ('buyer', 'seller', 'admin')),
        constraint "ck__contract_lifecycle_events__idempotency" check (
          ("idempotency_key" is null and "request_fingerprint" is null)
          or (btrim("idempotency_key") <> '' and "request_fingerprint" ~ '^[a-f0-9]{64}$')
        ),
        constraint "ck__contract_lifecycle_events__provider" check (
          ("provider_mode" = 'none' and "provider_operation_id" is null and "provider_event_id" is null
            and "provider_name" is null and "provider_reference" is null and "safe_receipt" is null)
          or ("provider_mode" in ('mock', 'live') and "provider_operation_id" is not null
            and btrim(coalesce("provider_name", '')) <> '' and btrim(coalesce("provider_reference", '')) <> ''
            and jsonb_typeof("safe_receipt") = 'object' and pg_column_size("safe_receipt") <= 4096)
        )
      );
    `);
    this.addSql(`
      create unique index "uq__marketplace_contract_lifecycle_events__contract_id_ab13d8ba"
        on "marketplace_contract_lifecycle_events"
          ("contract_id", "actor_tenant_id", "actor_user_id", "event_type", "idempotency_key")
        where "idempotency_key" is not null;
    `);

    this.addSql(`
      create table "marketplace_contract_fulfillments" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "status" varchar(30) not null default 'awaiting_settlement',
        "revision" int not null default 0,
        "started_at" timestamptz null,
        "delivered_at" timestamptz null,
        "completed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_contract_fulfillments_pkey" primary key ("id"),
        constraint "fk__marketplace_contract_fulfillments__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "uq__marketplace_contract_fulfillments__contract_id" unique ("contract_id"),
        constraint "ck__contract_fulfillments__status" check (
          "status" in ('awaiting_settlement', 'ready', 'in_progress', 'delivered', 'disputed', 'cancelled', 'completed')
        ),
        constraint "ck__contract_fulfillments__revision" check ("revision" >= 0),
        constraint "ck__contract_fulfillments__timeline" check (
          ("status" in ('awaiting_settlement', 'ready') and "started_at" is null
            and "delivered_at" is null and "completed_at" is null)
          or ("status" in ('in_progress', 'disputed', 'cancelled') and "started_at" is not null and "completed_at" is null)
          or ("status" = 'delivered' and "started_at" is not null
            and "delivered_at" is not null and "completed_at" is null)
          or ("status" = 'completed' and "started_at" is not null
            and "delivered_at" is not null and "completed_at" is not null)
        )
      );
    `);

    this.addSql(`
      create table "marketplace_contract_disputes" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "opened_by_party" varchar(10) not null,
        "opened_by_tenant_id" varchar(100) not null,
        "opened_by_user_id" varchar(100) not null,
        "reason" varchar(30) not null,
        "status" varchar(10) not null default 'open',
        "previous_fulfillment_status" varchar(20) not null,
        "decision" varchar(30) null,
        "evidence_reference" varchar(300) null,
        "outcome_note" varchar(1000) null,
        "resolved_by_admin_id" varchar(100) null,
        "resolved_at" timestamptz null,
        "resolution_idempotency_key" varchar(100) null,
        "resolution_request_fingerprint" varchar(64) null,
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_disputes_pkey" primary key ("id"),
        constraint "fk__marketplace_contract_disputes__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "uq__marketplace_contract_disputes__contract_id" unique ("contract_id"),
        constraint "ck__contract_disputes__party" check ("opened_by_party" in ('buyer', 'seller')),
        constraint "ck__contract_disputes__reason" check (
          "reason" in ('delivery_issue', 'quality_issue', 'quantity_issue', 'other')
        ),
        constraint "ck__contract_disputes__status" check ("status" in ('open', 'resolved')),
        constraint "ck__contract_disputes__previous_status" check (
          "previous_fulfillment_status" in ('in_progress', 'delivered')
        ),
        constraint "ck__contract_disputes__resolution" check (
          ("status" = 'open' and "decision" is null and "evidence_reference" is null
            and "outcome_note" is null and "resolved_by_admin_id" is null and "resolved_at" is null
            and "resolution_idempotency_key" is null and "resolution_request_fingerprint" is null
            and "revision" = 0)
          or ("status" = 'resolved' and "decision" in ('dismissed', 'upheld_cancelled')
            and btrim("evidence_reference") <> '' and btrim("outcome_note") <> ''
            and btrim("resolved_by_admin_id") <> '' and "resolved_at" is not null
            and btrim("resolution_idempotency_key") <> ''
            and "resolution_request_fingerprint" ~ '^[a-f0-9]{64}$' and "revision" = 1)
        )
      );
    `);

    this.addSql(`
      create table "marketplace_commission_rate_policies" (
        "id" uuid not null,
        "version" varchar(50) not null,
        "rate_snapshot" jsonb not null,
        "status" varchar(10) not null default 'active',
        "created_by_admin_id" varchar(100) not null,
        "activation_idempotency_key" varchar(100) not null,
        "activation_request_fingerprint" varchar(64) not null,
        "retired_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_commission_rate_policies_pkey" primary key ("id"),
        constraint "uq__commission_rate_policies__version" unique ("version"),
        constraint "uq__commission_rate_policies__activation_key" unique ("activation_idempotency_key"),
        constraint "ck__commission_rate_policies__version" check (
          "version" ~ '^[a-z0-9][a-z0-9-]{2,49}$'
        ),
        constraint "ck__commission_rate_policies__status" check ("status" in ('active', 'retired')),
        constraint "ck__commission_rate_policies__rates" check (
          jsonb_typeof("rate_snapshot") = 'object'
          and "rate_snapshot" - array['product', 'produce', 'request'] = '{}'::jsonb
          and "rate_snapshot" ?& array['product', 'produce', 'request']
          and ("rate_snapshot"->>'product')::int between 0 and 1000
          and ("rate_snapshot"->>'produce')::int between 0 and 1000
          and ("rate_snapshot"->>'request')::int between 0 and 1000
        ),
        constraint "ck__commission_rate_policies__fingerprint" check (
          "activation_request_fingerprint" ~ '^[a-f0-9]{64}$'
        ),
        constraint "ck__commission_rate_policies__retirement" check (
          ("status" = 'active' and "retired_at" is null)
          or ("status" = 'retired' and "retired_at" is not null)
        )
      );
    `);
    this.addSql(`
      create unique index "uq__marketplace_commission_rate_policies__status"
        on "marketplace_commission_rate_policies" ("status") where "status" = 'active';
    `);
    this.addSql(`
      insert into "marketplace_commission_rate_policies" (
        "id", "version", "rate_snapshot", "status", "created_by_admin_id",
        "activation_idempotency_key", "activation_request_fingerprint"
      ) values (
        '00000000-0000-4000-8000-000000000010', 'dehqonhub-default-v1',
        '{"produce":10,"product":10,"request":10}'::jsonb, 'active', 'system-migration',
        'system-seed-dehqonhub-default-v1',
        'de00d2a38a0ebb9329da8235e53bac4029333b758e050ed056bc8dcc0165cf1e'
      );
    `);

    this.addSql(`
      create table "marketplace_contract_commissions" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "rate_version" varchar(50) not null,
        "rate_snapshot" jsonb not null,
        "base_amount_uzs" numeric(15,0) not null,
        "amount_uzs" numeric(15,0) not null,
        "currency" varchar(3) not null default 'UZS',
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_commissions_pkey" primary key ("id"),
        constraint "fk__marketplace_contract_commissions__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "uq__marketplace_contract_commissions__contract_id" unique ("contract_id"),
        constraint "ck__contract_commissions__amount" check (
          "base_amount_uzs" > 0 and "base_amount_uzs" = trunc("base_amount_uzs")
          and "amount_uzs" >= 0 and "amount_uzs" = trunc("amount_uzs")
          and "amount_uzs" <= "base_amount_uzs" and "currency" = 'UZS'
        ),
        constraint "ck__contract_commissions__rate_snapshot" check (
          jsonb_typeof("rate_snapshot") = 'object' and pg_column_size("rate_snapshot") <= 1024
        )
      );
    `);

    this.addSql(`
      create table "marketplace_contract_notification_intents" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "timeline_event_id" uuid not null,
        "recipient_party" varchar(10) not null,
        "template_key" varchar(80) not null,
        "status" varchar(10) not null default 'pending',
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_notification_intents_pkey" primary key ("id"),
        constraint "fk__contract_notification_intents__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__contract_notification_intents__timeline_event_id"
          foreign key ("timeline_event_id") references "marketplace_contract_lifecycle_events" ("id") on delete restrict,
        constraint "uq__contract_notification_intents__event_recipient"
          unique ("timeline_event_id", "recipient_party"),
        constraint "ck__contract_notification_intents__party" check ("recipient_party" in ('buyer', 'seller')),
        constraint "ck__contract_notification_intents__status" check ("status" = 'pending')
      );
    `);

    this.addSql(`
      create table "marketplace_contract_review_eligibilities" (
        "id" uuid not null,
        "contract_id" uuid not null,
        "buyer_tenant_id" varchar(100) not null,
        "buyer_user_id" varchar(100) not null,
        "buyer_partner_id" uuid not null,
        "seller_tenant_id" varchar(100) not null,
        "seller_partner_id" uuid not null,
        "source_kind" varchar(20) not null,
        "source_id" uuid not null,
        "source_publication_id" uuid not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_contract_review_eligibilities_pkey" primary key ("id"),
        constraint "fk__contract_review_eligibilities__contract_id"
          foreign key ("contract_id") references "marketplace_contracts" ("id") on delete restrict,
        constraint "fk__contract_review_eligibilities__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "fk__contract_review_eligibilities__seller_partner_id"
          foreign key ("seller_partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "fk__contract_review_eligibilities__publication_id"
          foreign key ("source_publication_id") references "marketplace_listing_publications" ("id") on delete restrict,
        constraint "uq__contract_review_eligibilities__contract_source"
          unique ("contract_id", "source_kind", "source_id"),
        constraint "ck__contract_review_eligibilities__source_kind"
          check ("source_kind" in ('product', 'produce')),
        constraint "ck__contract_review_eligibilities__different_parties"
          check ("buyer_partner_id" <> "seller_partner_id")
      );
    `);
    this.addSql(`
      create index "ix__marketplace_contract_review_eligibilities__buyer_t_25c85359"
        on "marketplace_contract_review_eligibilities"
          ("buyer_tenant_id", "buyer_user_id", "source_kind", "source_id");
    `);
    this.addSql(`
      create index "ix__marketplace_contract_notification_intents__contrac_9207e973"
        on "marketplace_contract_notification_intents" ("contract_id", "status", "created_at");
    `);

    this.addLifecycleGuardFunctions();
    this.addLifecycleTriggers();
  }

  private addLifecycleGuardFunctions(): void {
    this.addSql(`
      create function "guard_marketplace_contract_artifact_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract artifact is immutable'
          using errcode = '23514', constraint = 'ck__contract_artifacts__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_contract_artifact_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_contracts" contract
          join "marketplace_provider_operations" operation on operation."id" = new."provider_operation_id"
         where contract."id" = new."contract_id" and contract."binding_status" = 'resolved'
           and operation."resource_type" = 'contract' and operation."resource_id" = contract."id"
           and operation."resource_revision" = new."snapshot_revision"
           and operation."capability" = 'contract_artifact_storage' and operation."status" = 'succeeded'
           and operation."provider_mode" = new."provider_mode" and operation."provider_name" = new."provider_name"
           and operation."provider_reference" is not null and operation."receipt" is not null
           and ((operation."actor_type" = 'contract_buyer'
             and contract."tenant_id" = operation."tenant_id" and contract."buyer_user_id" = operation."user_id")
            or (operation."actor_type" = 'contract_seller'
             and contract."seller_tenant_id" = operation."tenant_id" and contract."seller_user_id" = operation."user_id"))
        ) then
          raise exception 'marketplace contract artifact mismatch'
            using errcode = '23514', constraint = 'ck__contract_artifacts__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_contract_signature_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract signature is immutable'
          using errcode = '23514', constraint = 'ck__contract_signatures__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_contract_signature_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_contracts" contract
          join "marketplace_contract_artifacts" artifact on artifact."contract_id" = contract."id"
          join "marketplace_provider_operations" operation on operation."id" = new."provider_operation_id"
         where contract."id" = new."contract_id" and contract."binding_status" = 'resolved'
           and artifact."id" = new."artifact_id"
           and artifact."checksum_sha256" = new."artifact_checksum"
           and artifact."snapshot_revision" = new."snapshot_revision"
           and operation."resource_type" = 'contract' and operation."resource_id" = contract."id"
           and operation."resource_revision" = new."snapshot_revision"
           and operation."capability" = 'qualified_signature' and operation."status" = 'succeeded'
           and operation."provider_mode" = new."provider_mode" and operation."provider_name" = new."provider_name"
           and operation."provider_reference" = new."provider_reference" and operation."receipt" = new."safe_receipt"
           and ((new."party" = 'buyer' and operation."actor_type" = 'contract_buyer'
             and contract."tenant_id" = new."party_tenant_id" and contract."buyer_user_id" = new."party_user_id"
             and contract."buyer_partner_id" = new."party_partner_id"
             and operation."tenant_id" = new."party_tenant_id" and operation."user_id" = new."party_user_id")
            or (new."party" = 'seller' and operation."actor_type" = 'contract_seller'
             and contract."seller_tenant_id" = new."party_tenant_id" and contract."seller_user_id" = new."party_user_id"
             and contract."seller_partner_id" = new."party_partner_id"
             and operation."tenant_id" = new."party_tenant_id" and operation."user_id" = new."party_user_id"))
        ) then
          raise exception 'marketplace contract signature mismatch'
            using errcode = '23514', constraint = 'ck__contract_signatures__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_contract_settlement"() returns trigger as $$
      begin
        if tg_op = 'INSERT' and (
          new."revision" <> 0 or new."latest_provider_mode" <> 'none'
          or new."reconciliation_state" <> 'clear'
          or (new."kind" = 'direct_payment' and new."status" <> 'awaiting_buyer_confirmation')
          or (new."kind" = 'factoring' and new."status" <> 'awaiting_consents')
        ) then
          raise exception 'marketplace contract settlement initial state is invalid'
            using errcode = '23514', constraint = 'ck__contract_settlements__transition';
        end if;
        if tg_op = 'UPDATE' and (
          (new."contract_id", new."kind", new."amount_uzs", new."currency",
           new."selected_by_tenant_id", new."selected_by_user_id",
           new."selection_idempotency_key", new."selection_request_fingerprint", new."created_at")
          is distinct from
          (old."contract_id", old."kind", old."amount_uzs", old."currency",
           old."selected_by_tenant_id", old."selected_by_user_id",
           old."selection_idempotency_key", old."selection_request_fingerprint", old."created_at")
          or new."revision" <> old."revision" + 1
          or new."updated_at" < old."updated_at"
        ) then
          raise exception 'marketplace contract settlement identity is immutable'
            using errcode = '23514', constraint = 'ck__contract_settlements__immutable_identity';
        end if;
        if tg_op = 'UPDATE' and not (
          (old."kind" = 'direct_payment' and (
            (old."status" = 'awaiting_buyer_confirmation' and new."status" = 'buyer_confirmed')
            or (old."status" = 'buyer_confirmed' and new."status" = 'seller_received')
          )) or (old."kind" = 'factoring' and (
            (old."status" = 'awaiting_consents' and new."status" in ('awaiting_consents', 'ready_to_request'))
            or (old."status" = 'ready_to_request' and new."status" in ('approved', 'rejected'))
            or (old."status" = 'approved' and new."status" = 'seller_paid')
            or (old."status" = 'seller_paid' and new."status" = 'buyer_repaid')
            or (old."status" = 'buyer_repaid' and new."status" = 'closed')
          ))
        ) then
          raise exception 'marketplace contract settlement transition is invalid'
            using errcode = '23514', constraint = 'ck__contract_settlements__transition';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_contract_lifecycle_event_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract lifecycle event is immutable'
          using errcode = '23514', constraint = 'ck__contract_lifecycle_events__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_contract_lifecycle_event_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_contracts" contract
           where contract."id" = new."contract_id" and contract."binding_status" = 'resolved'
             and ((new."actor_party" = 'buyer' and contract."tenant_id" = new."actor_tenant_id"
               and contract."buyer_user_id" = new."actor_user_id")
              or (new."actor_party" = 'seller' and contract."seller_tenant_id" = new."actor_tenant_id"
               and contract."seller_user_id" = new."actor_user_id")
              or (new."actor_party" = 'admin' and btrim(new."actor_tenant_id") <> ''
               and btrim(new."actor_user_id") <> '' and new."provider_operation_id" is null))
        ) then
          raise exception 'marketplace contract lifecycle actor mismatch'
            using errcode = '23514', constraint = 'ck__contract_lifecycle_events__actor';
        end if;
        if new."provider_operation_id" is not null and not exists (
          select 1 from "marketplace_provider_operations" operation
           where operation."id" = new."provider_operation_id" and operation."status" = 'succeeded'
             and operation."resource_type" = 'contract' and operation."resource_id" = new."contract_id"
             and operation."tenant_id" = new."actor_tenant_id" and operation."user_id" = new."actor_user_id"
             and operation."provider_mode" = new."provider_mode" and operation."provider_name" = new."provider_name"
             and operation."provider_reference" = new."provider_reference" and operation."receipt" = new."safe_receipt"
             and operation."actor_type" = case new."actor_party"
               when 'buyer' then 'contract_buyer' else 'contract_seller' end
        ) then
          raise exception 'marketplace contract lifecycle provider mismatch'
            using errcode = '23514', constraint = 'ck__contract_lifecycle_events__provider_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_contract_fulfillment"() returns trigger as $$
      begin
        if tg_op = 'INSERT' and (new."status" <> 'awaiting_settlement' or new."revision" <> 0) then
          raise exception 'marketplace contract fulfillment initial state is invalid'
            using errcode = '23514', constraint = 'ck__contract_fulfillments__transition';
        end if;
        if tg_op = 'UPDATE' and (
          new."contract_id" <> old."contract_id" or new."created_at" <> old."created_at"
          or new."revision" <> old."revision" + 1 or new."updated_at" < old."updated_at"
          or not (
            (old."status" = 'awaiting_settlement' and new."status" = 'ready')
            or (old."status" = 'ready' and new."status" = 'in_progress')
            or (old."status" = 'in_progress' and new."status" in ('delivered', 'disputed'))
            or (old."status" = 'delivered' and new."status" in ('completed', 'disputed'))
            or (old."status" = 'disputed' and new."status" in ('in_progress', 'delivered', 'cancelled'))
          )
        ) then
          raise exception 'marketplace contract fulfillment transition is invalid'
            using errcode = '23514', constraint = 'ck__contract_fulfillments__transition';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
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
        if (
          new."id", new."contract_id", new."opened_by_party", new."opened_by_tenant_id",
          new."opened_by_user_id", new."reason", new."previous_fulfillment_status", new."created_at"
        ) is distinct from (
          old."id", old."contract_id", old."opened_by_party", old."opened_by_tenant_id",
          old."opened_by_user_id", old."reason", old."previous_fulfillment_status", old."created_at"
        ) or old."status" <> 'open' or new."status" <> 'resolved'
          or new."revision" <> old."revision" + 1
        then
          raise exception 'marketplace contract dispute transition is invalid'
            using errcode = '23514', constraint = 'ck__contract_disputes__transition';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "guard_marketplace_commission_rate_policy"() returns trigger as $$
      begin
        if tg_op = 'DELETE' then
          raise exception 'marketplace commission rate policy cannot be deleted'
            using errcode = '23514', constraint = 'ck__commission_rate_policies__immutable_identity';
        end if;
        if tg_op = 'INSERT' then
          if new."status" <> 'active' or new."retired_at" is not null then
            raise exception 'marketplace commission rate policy initial state is invalid'
              using errcode = '23514', constraint = 'ck__commission_rate_policies__transition';
          end if;
          return new;
        end if;
        if (
          new."id", new."version", new."rate_snapshot", new."created_by_admin_id",
          new."activation_idempotency_key", new."activation_request_fingerprint", new."created_at"
        ) is distinct from (
          old."id", old."version", old."rate_snapshot", old."created_by_admin_id",
          old."activation_idempotency_key", old."activation_request_fingerprint", old."created_at"
        ) or old."status" <> 'active' or new."status" <> 'retired' or new."retired_at" is null
        then
          raise exception 'marketplace commission rate policy transition is invalid'
            using errcode = '23514', constraint = 'ck__commission_rate_policies__transition';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    for (const [name, constraint] of [
      ['artifact', 'ck__contract_artifacts__immutable'],
      ['signature', 'ck__contract_signatures__immutable'],
      ['lifecycle_event', 'ck__contract_lifecycle_events__immutable'],
      ['commission', 'ck__contract_commissions__immutable'],
      ['notification_intent', 'ck__contract_notification_intents__immutable'],
      ['review_eligibility', 'ck__contract_review_eligibilities__immutable'],
    ] as const) {
      if (name === 'artifact' || name === 'signature' || name === 'lifecycle_event') {
        continue;
      }
      this.addSql(`
        create function "guard_marketplace_contract_${name}_immutable"() returns trigger as $$
        begin
          raise exception 'marketplace contract ${name.replaceAll('_', ' ')} is immutable'
            using errcode = '23514', constraint = '${constraint}';
        end;
        $$ language plpgsql;
      `);
    }
  }

  private addLifecycleTriggers(): void {
    const immutableTriggers = [
      ['marketplace_contract_artifacts', 'artifact'],
      ['marketplace_contract_signatures', 'signature'],
      ['marketplace_contract_lifecycle_events', 'lifecycle_event'],
      ['marketplace_contract_commissions', 'commission'],
      ['marketplace_contract_notification_intents', 'notification_intent'],
      ['marketplace_contract_review_eligibilities', 'review_eligibility'],
    ] as const;
    for (const [table, name] of immutableTriggers) {
      this.addSql(`
        create trigger "tr__${table}__immutable"
          before update or delete on "${table}"
          for each row execute function "guard_marketplace_contract_${name}_immutable"();
      `);
    }
    this.addSql(`
      create constraint trigger "ct__contract_artifacts__coherence"
        after insert on "marketplace_contract_artifacts"
        deferrable initially immediate for each row
        execute function "assert_marketplace_contract_artifact_coherence"();
    `);
    this.addSql(`
      create constraint trigger "ct__contract_signatures__coherence"
        after insert on "marketplace_contract_signatures"
        deferrable initially immediate for each row
        execute function "assert_marketplace_contract_signature_coherence"();
    `);
    this.addSql(`
      create trigger "tr__contract_settlements__guard"
        before insert or update on "marketplace_contract_settlements"
        for each row execute function "guard_marketplace_contract_settlement"();
    `);
    this.addSql(`
      create constraint trigger "ct__contract_lifecycle_events__coherence"
        after insert on "marketplace_contract_lifecycle_events"
        deferrable initially immediate for each row
        execute function "assert_marketplace_contract_lifecycle_event_coherence"();
    `);
    this.addSql(`
      create trigger "tr__contract_fulfillments__guard"
        before insert or update on "marketplace_contract_fulfillments"
        for each row execute function "guard_marketplace_contract_fulfillment"();
    `);
    this.addSql(`
      create trigger "tr__marketplace_contract_disputes__guard"
        before insert or update or delete on "marketplace_contract_disputes"
        for each row execute function "guard_marketplace_contract_dispute"();
    `);
    this.addSql(`
      create trigger "tr__marketplace_commission_rate_policies__guard"
        before insert or update or delete on "marketplace_commission_rate_policies"
        for each row execute function "guard_marketplace_commission_rate_policy"();
    `);
  }

  override down(): void {
    this.addSql(
      `drop trigger "tr__marketplace_contract_review_eligibilities__immutable" on "marketplace_contract_review_eligibilities";`,
    );
    this.addSql(
      `drop trigger "tr__marketplace_contract_notification_intents__immutable" on "marketplace_contract_notification_intents";`,
    );
    this.addSql(
      `drop trigger "tr__marketplace_contract_commissions__immutable" on "marketplace_contract_commissions";`,
    );
    this.addSql(
      `drop trigger "tr__marketplace_commission_rate_policies__guard" on "marketplace_commission_rate_policies";`,
    );
    this.addSql(`drop trigger "tr__marketplace_contract_disputes__guard" on "marketplace_contract_disputes";`);
    this.addSql(`drop trigger "tr__contract_fulfillments__guard" on "marketplace_contract_fulfillments";`);
    this.addSql(`drop trigger "ct__contract_lifecycle_events__coherence" on "marketplace_contract_lifecycle_events";`);
    this.addSql(
      `drop trigger "tr__marketplace_contract_lifecycle_events__immutable" on "marketplace_contract_lifecycle_events";`,
    );
    this.addSql(`drop trigger "tr__contract_settlements__guard" on "marketplace_contract_settlements";`);
    this.addSql(`drop trigger "ct__contract_signatures__coherence" on "marketplace_contract_signatures";`);
    this.addSql(`drop trigger "tr__marketplace_contract_signatures__immutable" on "marketplace_contract_signatures";`);
    this.addSql(`drop trigger "tr__marketplace_contract_artifacts__immutable" on "marketplace_contract_artifacts";`);
    this.addSql(`drop trigger "ct__contract_artifacts__coherence" on "marketplace_contract_artifacts";`);
    this.addSql(`drop function "guard_marketplace_contract_review_eligibility_immutable"();`);
    this.addSql(`drop function "guard_marketplace_contract_notification_intent_immutable"();`);
    this.addSql(`drop function "guard_marketplace_contract_commission_immutable"();`);
    this.addSql(`drop function "guard_marketplace_commission_rate_policy"();`);
    this.addSql(`drop function "guard_marketplace_contract_dispute"();`);
    this.addSql(`drop function "guard_marketplace_contract_fulfillment"();`);
    this.addSql(`drop function "assert_marketplace_contract_lifecycle_event_coherence"();`);
    this.addSql(`drop function "guard_marketplace_contract_lifecycle_event_immutable"();`);
    this.addSql(`drop function "guard_marketplace_contract_settlement"();`);
    this.addSql(`drop function "assert_marketplace_contract_signature_coherence"();`);
    this.addSql(`drop function "guard_marketplace_contract_signature_immutable"();`);
    this.addSql(`drop function "guard_marketplace_contract_artifact_immutable"();`);
    this.addSql(`drop function "assert_marketplace_contract_artifact_coherence"();`);
    this.addSql(`drop table "marketplace_contract_review_eligibilities";`);
    this.addSql(`drop table "marketplace_contract_notification_intents";`);
    this.addSql(`drop table "marketplace_contract_commissions";`);
    this.addSql(`drop table "marketplace_commission_rate_policies";`);
    this.addSql(`drop table "marketplace_contract_disputes";`);
    this.addSql(`drop table "marketplace_contract_fulfillments";`);
    this.addSql(`drop table "marketplace_contract_lifecycle_events";`);
    this.addSql(`drop table "marketplace_contract_settlements";`);
    this.addSql(`drop table "marketplace_contract_signatures";`);
    this.addSql(`drop table "marketplace_contract_artifacts";`);
  }
}
