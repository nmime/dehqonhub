// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

export class Migration20260810124500AddMarketplaceVerificationProviders extends Migration {
  override up(): void {
    this.addSql(`
      alter table "marketplace_verifications"
        add column "provider_mode" varchar(20) not null default 'none',
        add column "identity_assurance" varchar(30) not null default 'none',
        add column "provider_name" varchar(80) null,
        add column "provider_subject_key" varchar(128) null,
        add column "provider_receipt_id" varchar(200) null,
        add column "one_id_linked_at" timestamptz null,
        add column "case_revision" int not null default 0,
        add column "version" int not null default 0;
    `);
    this.addSql(`
      update "marketplace_verifications"
         set "provider_mode" = 'legacy',
             "identity_assurance" = 'legacy_unknown'
       where "one_id_linked" = true;
    `);
    this.addSql(`
      alter table "marketplace_verifications"
        add constraint "ck__marketplace_verifications__provider_mode"
          check ("provider_mode" in ('none', 'legacy', 'mock', 'live')),
        add constraint "ck__marketplace_verifications__identity_assurance"
          check ("identity_assurance" in ('none', 'legacy_unknown', 'mock', 'provider_verified')),
        add constraint "ck__marketplace_verifications__identity_provenance"
          check (
            ("one_id_linked" = false and "provider_mode" = 'none' and "identity_assurance" = 'none'
              and "provider_name" is null and "provider_subject_key" is null
              and "provider_receipt_id" is null and "one_id_linked_at" is null)
            or ("one_id_linked" = true and "provider_mode" = 'legacy'
              and "identity_assurance" = 'legacy_unknown')
            or ("one_id_linked" = true and "provider_mode" = 'mock' and "identity_assurance" = 'mock'
              and "provider_name" is not null and "provider_subject_key" is not null
              and "provider_receipt_id" is not null and "one_id_linked_at" is not null)
            or ("one_id_linked" = true and "provider_mode" = 'live' and "identity_assurance" = 'provider_verified'
              and "provider_name" is not null and "provider_subject_key" is not null
              and "provider_receipt_id" is not null and "one_id_linked_at" is not null)
          ),
        add constraint "ck__marketplace_verifications__version" check ("version" >= 0),
        add constraint "ck__marketplace_verifications__case_revision" check ("case_revision" >= 0),
        add constraint "uq__marketplace_verifications__id_tenant_id_user_id"
          unique ("id", "tenant_id", "user_id");
    `);
    this.addSql(`
      create unique index "uq__marketplace_verifications__tenant_id_provider_mode_8abb5356"
        on "marketplace_verifications" ("tenant_id", "provider_mode", "provider_subject_key")
        where "provider_subject_key" is not null;
    `);
    this.addSql(`
      create table "marketplace_provider_operations" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "capability" varchar(50) not null,
        "resource_type" varchar(50) not null,
        "resource_id" uuid not null,
        "resource_revision" int not null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "request_descriptor" jsonb not null,
        "provider_mode" varchar(20) not null,
        "provider_name" varchar(80) not null,
        "status" varchar(20) not null default 'started',
        "attempt" int not null default 1,
        "lease_expires_at" timestamptz null,
        "provider_reference" varchar(200) null,
        "receipt" jsonb null,
        "result_snapshot" jsonb null,
        "error_code" varchar(100) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_provider_operations_pkey" primary key ("id"),
        constraint "fk__marketplace_provider_operations__verification_actor"
          foreign key ("resource_id", "tenant_id", "user_id")
          references "marketplace_verifications" ("id", "tenant_id", "user_id") on delete restrict,
        constraint "uq__marketplace_provider_ops__actor_capability_resource_key"
          unique ("tenant_id", "user_id", "capability", "resource_type", "resource_id", "idempotency_key"),
        constraint "ck__marketplace_provider_ops__capability"
          check ("capability" in ('oneid_link', 'verification_documents')),
        constraint "ck__marketplace_provider_ops__resource"
          check ("resource_type" = 'verification' and "resource_revision" >= 0),
        constraint "ck__marketplace_provider_ops__request_descriptor"
          check (jsonb_typeof("request_descriptor") = 'object'),
        constraint "ck__marketplace_provider_ops__provider_mode" check ("provider_mode" in ('mock', 'live')),
        constraint "ck__marketplace_provider_ops__status" check ("status" in ('started', 'succeeded', 'failed')),
        constraint "ck__marketplace_provider_ops__attempt" check ("attempt" >= 1),
        constraint "ck__marketplace_provider_ops__receipt_state" check (
          ("status" = 'succeeded' and "provider_reference" is not null and "receipt" is not null
            and "result_snapshot" is not null and "error_code" is null and "lease_expires_at" is null)
          or ("status" = 'failed' and "provider_reference" is null and "receipt" is null
            and "result_snapshot" is null and "error_code" is not null and "lease_expires_at" is null)
          or ("status" = 'started' and "provider_reference" is null and "receipt" is null
            and "result_snapshot" is null and "error_code" is null and "lease_expires_at" is not null)
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_provider_operations__tenant_id_user_id_status"
        on "marketplace_provider_operations" ("tenant_id", "user_id", "status");
    `);
    this.addSql(`
      create table "marketplace_verification_evidence" (
        "id" uuid not null,
        "verification_id" uuid not null,
        "case_revision" int not null,
        "document_revision" int not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "kind" varchar(30) not null,
        "file_name" varchar(200) not null,
        "mime_type" varchar(50) not null,
        "size_bytes" int not null,
        "sha256" varchar(64) not null,
        "provider_mode" varchar(20) not null,
        "provider_name" varchar(80) not null,
        "provider_receipt_id" varchar(200) not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_verification_evidence_pkey" primary key ("id"),
        constraint "uq__marketplace_verification_evidence__case_kind_revision"
          unique ("verification_id", "case_revision", "kind", "document_revision"),
        constraint "fk__marketplace_verification_evidence__verification_actor"
          foreign key ("verification_id", "tenant_id", "user_id")
          references "marketplace_verifications" ("id", "tenant_id", "user_id") on delete restrict,
        constraint "ck__marketplace_verification_evidence__kind"
          check ("kind" in ('id', 'land', 'lease', 'cadastre', 'farm', 'machinery', 'warehouse', 'business', 'license')),
        constraint "ck__marketplace_verification_evidence__mime_type"
          check ("mime_type" in ('application/pdf', 'image/jpeg', 'image/png')),
        constraint "ck__marketplace_verification_evidence__size"
          check ("size_bytes" between 1 and 10485760),
        constraint "ck__marketplace_verification_evidence__case_revision"
          check ("case_revision" >= 0),
        constraint "ck__marketplace_verification_evidence__document_revision"
          check ("document_revision" between 1 and 3),
        constraint "ck__marketplace_verification_evidence__sha256"
          check ("sha256" ~ '^[0-9a-f]{64}$'),
        constraint "ck__marketplace_verification_evidence__provider_mode"
          check ("provider_mode" in ('mock', 'live'))
      );
    `);
    this.addSql(`
      create index "ix__marketplace_verification_evidence__verification_id_b2bbaa0a"
        on "marketplace_verification_evidence" ("verification_id", "created_at");
    `);
    this.addSql(`
      create index "ix__marketplace_verification_evidence__tenant_id_user_id"
        on "marketplace_verification_evidence" ("tenant_id", "user_id");
    `);
    this.addSql(`
      create function "prevent_marketplace_verification_evidence_mutation"()
      returns trigger language plpgsql as $$
      begin
        raise exception 'marketplace verification evidence is immutable';
      end;
      $$;
    `);
    this.addSql(`
      create trigger "trg__marketplace_verification_evidence__immutable"
      before update or delete on "marketplace_verification_evidence"
      for each row execute function "prevent_marketplace_verification_evidence_mutation"();
    `);
  }

  override down(): void {
    this.addSql(
      `drop trigger if exists "trg__marketplace_verification_evidence__immutable" on "marketplace_verification_evidence";`,
    );
    this.addSql(`drop function if exists "prevent_marketplace_verification_evidence_mutation"();`);
    this.addSql(`drop table if exists "marketplace_verification_evidence" cascade;`);
    this.addSql(`drop table if exists "marketplace_provider_operations" cascade;`);
    this.addSql(`drop index if exists "uq__marketplace_verifications__tenant_id_provider_mode_8abb5356";`);
    this.addSql(`
      alter table "marketplace_verifications"
        drop constraint if exists "uq__marketplace_verifications__id_tenant_id_user_id",
        drop constraint if exists "ck__marketplace_verifications__version",
        drop constraint if exists "ck__marketplace_verifications__case_revision",
        drop constraint if exists "ck__marketplace_verifications__identity_provenance",
        drop constraint if exists "ck__marketplace_verifications__identity_assurance",
        drop constraint if exists "ck__marketplace_verifications__provider_mode",
        drop column if exists "version",
        drop column if exists "case_revision",
        drop column if exists "one_id_linked_at",
        drop column if exists "provider_receipt_id",
        drop column if exists "provider_subject_key",
        drop column if exists "provider_name",
        drop column if exists "identity_assurance",
        drop column if exists "provider_mode";
    `);
  }
}
