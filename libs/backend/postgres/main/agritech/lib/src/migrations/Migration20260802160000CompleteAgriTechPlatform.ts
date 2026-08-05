import { Migration } from '@mikro-orm/migrations';

export class Migration20260802160000CompleteAgriTechPlatform extends Migration {
  override up(): void {
    this.addSql(`
      create table "agritech_partners" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "owner_user_id" varchar(100) not null,
        "kind" varchar(20) not null,
        "legal_name" varchar(200) not null,
        "tax_id" varchar(30) not null,
        "phone" varchar(20) not null,
        "region" varchar(100) not null,
        "status" varchar(20) not null default 'pending',
        "reviewed_by" varchar(100) null,
        "reviewed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__agritech_partners" primary key ("id"),
        constraint "ux__agritech_partners__tenant_kind_tax" unique ("tenant_id", "kind", "tax_id"),
        constraint "ck__agritech_partners__kind" check ("kind" in ('supplier', 'buyer')),
        constraint "ck__agritech_partners__status" check ("status" in ('pending', 'approved', 'rejected', 'suspended'))
      );
    `);
    this.addSql(
      `create index "ix__agritech_partners__tenant_id_owner_user_id" on "agritech_partners" ("tenant_id", "owner_user_id");`,
    );
    this.addSql(
      `create index "ix__agritech_partners__tenant_id_status" on "agritech_partners" ("tenant_id", "status");`,
    );

    this.addSql(`
      create table "produce_listings" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "farmer_id" uuid not null,
        "crop" varchar(50) not null,
        "grade" varchar(1) not null,
        "quantity_kg" int not null,
        "available_quantity_kg" int not null,
        "price_per_kg_uzs" numeric(15,2) not null,
        "region" varchar(100) not null,
        "available_from" timestamptz not null,
        "available_until" timestamptz not null,
        "status" varchar(20) not null default 'active',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__produce_listings" primary key ("id"),
        constraint "fk__produce_listings__farmer" foreign key ("farmer_id") references "farmers" ("id") on delete restrict,
        constraint "ck__produce_listings__grade" check ("grade" in ('A', 'B', 'C')),
        constraint "ck__produce_listings__quantity" check ("quantity_kg" > 0 and "available_quantity_kg" >= 0 and "available_quantity_kg" <= "quantity_kg"),
        constraint "ck__produce_listings__price" check ("price_per_kg_uzs" > 0),
        constraint "ck__produce_listings__window" check ("available_until" > "available_from"),
        constraint "ck__produce_listings__status" check ("status" in ('active', 'reserved', 'sold', 'cancelled'))
      );
    `);
    this.addSql(
      `create index "ix__produce_listings__tenant_id_status_crop_region_grade" on "produce_listings" ("tenant_id", "status", "crop", "region", "grade");`,
    );
    this.addSql(`create index "ix__produce_listings__farmer_id" on "produce_listings" ("farmer_id");`);

    this.addSql(
      `alter table "orders" add constraint "fk__orders__buyer_partner_id" foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "orders" add constraint "fk__orders__produce_listing_id" foreign key ("produce_listing_id") references "produce_listings" ("id") on delete restrict;`,
    );
    this.addSql(`create index "ix__orders__buyer_partner_id" on "orders" ("buyer_partner_id");`);
    this.addSql(`create index "ix__orders__produce_listing_id" on "orders" ("produce_listing_id");`);

    this.addSql(`
      create table "agritech_deliveries" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "order_id" uuid not null,
        "agent_user_id" varchar(100) null,
        "status" varchar(20) not null default 'scheduled',
        "scheduled_at" timestamptz not null,
        "proof_reference" varchar(500) null,
        "history" jsonb not null default '[]'::jsonb,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__agritech_deliveries" primary key ("id"),
        constraint "ux__agritech_deliveries__tenant_order" unique ("tenant_id", "order_id"),
        constraint "fk__agritech_deliveries__order" foreign key ("order_id") references "orders" ("id") on delete restrict,
        constraint "ck__agritech_deliveries__status" check ("status" in ('scheduled', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'))
      );
    `);
    this.addSql(
      `create index "ix__agritech_deliveries__tenant_id_agent_user_id_status" on "agritech_deliveries" ("tenant_id", "agent_user_id", "status");`,
    );

    this.addSql(`
      create table "agritech_field_visits" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "farmer_id" uuid not null,
        "agent_user_id" varchar(100) not null,
        "notes" text not null,
        "observed_grade" varchar(1) null,
        "observed_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__agritech_field_visits" primary key ("id"),
        constraint "fk__agritech_field_visits__farmer" foreign key ("farmer_id") references "farmers" ("id") on delete restrict,
        constraint "ck__agritech_field_visits__grade" check ("observed_grade" is null or "observed_grade" in ('A', 'B', 'C'))
      );
    `);
    this.addSql(
      `create index "ix__agritech_field_visits__tenant_id_farmer_id_observed_at" on "agritech_field_visits" ("tenant_id", "farmer_id", "observed_at");`,
    );

    this.addSql(`
      create table "agritech_advisories" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "farmer_id" uuid not null,
        "kind" varchar(20) not null,
        "source" varchar(100) not null,
        "summary" text not null,
        "observed_at" timestamptz not null,
        "expires_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__agritech_advisories" primary key ("id"),
        constraint "fk__agritech_advisories__farmer" foreign key ("farmer_id") references "farmers" ("id") on delete restrict,
        constraint "ck__agritech_advisories__kind" check ("kind" in ('weather', 'agronomy')),
        constraint "ck__agritech_advisories__window" check ("expires_at" > "observed_at")
      );
    `);
    this.addSql(
      `create index "ix__agritech_advisories__tenant_id_farmer_id_expires_at" on "agritech_advisories" ("tenant_id", "farmer_id", "expires_at");`,
    );

    this.addSql(`
      create table "agritech_payment_transactions" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "order_id" uuid not null,
        "user_id" varchar(100) not null,
        "provider" varchar(20) not null,
        "idempotency_key" varchar(100) not null,
        "amount_uzs" numeric(15,2) not null,
        "state" varchar(20) not null default 'created',
        "provider_transaction_id" varchar(100) null,
        "provider_created_at" timestamptz null,
        "reason" int null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__agritech_payment_transactions" primary key ("id"),
        constraint "fk__agritech_payment_transactions__order" foreign key ("order_id") references "orders" ("id") on delete restrict,
        constraint "ux__agritech_payment_transactions__tenant_provider_key" unique ("tenant_id", "provider", "idempotency_key"),
        constraint "ux__agritech_payment_transactions__tenant_provider_tx" unique ("tenant_id", "provider", "provider_transaction_id"),
        constraint "ck__agritech_payment_transactions__provider" check ("provider" in ('click', 'payme', 'bnpl')),
        constraint "ck__agritech_payment_transactions__state" check ("state" in ('created', 'pending', 'paid', 'cancelled', 'failed', 'refunded')),
        constraint "ck__agritech_payment_transactions__amount" check ("amount_uzs" > 0)
      );
    `);
    this.addSql(
      `create index "ix__agritech_payment_transactions__tenant_id_order_id" on "agritech_payment_transactions" ("tenant_id", "order_id");`,
    );
    this.addSql(
      `create index "ix__agritech_payment_transactions__tenant_id_state" on "agritech_payment_transactions" ("tenant_id", "state");`,
    );

    this.addSql(`
      create table "agritech_pilot_cohorts" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "name" varchar(200) not null,
        "status" varchar(20) not null default 'planned',
        "target_farmers" int not null,
        "target_suppliers" int not null,
        "starts_at" timestamptz not null,
        "ends_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__agritech_pilot_cohorts" primary key ("id"),
        constraint "ux__agritech_pilot_cohorts__tenant_name" unique ("tenant_id", "name"),
        constraint "ck__agritech_pilot_cohorts__status" check ("status" in ('planned', 'active', 'completed', 'cancelled')),
        constraint "ck__agritech_pilot_cohorts__targets" check ("target_farmers" > 0 and "target_suppliers" > 0),
        constraint "ck__agritech_pilot_cohorts__window" check ("ends_at" > "starts_at")
      );
    `);

    this.addSql(`
      create table "agritech_integration_state" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "provider" varchar(50) not null,
        "status" varchar(20) not null default 'disabled',
        "last_successful_at" timestamptz null,
        "last_error_code" varchar(100) null,
        "cursor" varchar(500) null,
        "updated_at" timestamptz not null default now(),
        constraint "pk__agritech_integration_state" primary key ("id"),
        constraint "ux__agritech_integration_state__tenant_provider" unique ("tenant_id", "provider"),
        constraint "ck__agritech_integration_state__status" check ("status" in ('disabled', 'ready', 'degraded'))
      );
    `);
  }

  override down(): void {
    this.addSql(`drop table if exists "agritech_integration_state" cascade;`);
    this.addSql(`drop table if exists "agritech_pilot_cohorts" cascade;`);
    this.addSql(`drop table if exists "agritech_payment_transactions" cascade;`);
    this.addSql(`drop table if exists "agritech_advisories" cascade;`);
    this.addSql(`drop table if exists "agritech_field_visits" cascade;`);
    this.addSql(`drop table if exists "agritech_deliveries" cascade;`);
    this.addSql(`alter table "orders" drop constraint if exists "fk__orders__produce_listing_id";`);
    this.addSql(`alter table "orders" drop constraint if exists "fk__orders__buyer_partner_id";`);
    this.addSql(`drop table if exists "produce_listings" cascade;`);
    this.addSql(`drop table if exists "agritech_partners" cascade;`);
  }
}
