import { Migration } from '@mikro-orm/migrations';

export class Migration20260809000000CreateMarketplace extends Migration {
  override up(): void {
    this.addSql(`
      create table "marketplace_verifications" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "role" varchar(20) not null,
        "level" varchar(20) not null,
        "status" varchar(20) not null default 'pending',
        "one_id_linked" boolean not null default false,
        "documents" jsonb not null default '[]'::jsonb,
        "reviewed_by" varchar(100) null,
        "reviewed_at" timestamptz null,
        "rejection_reason" varchar(500) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__marketplace_verifications" primary key ("id"),
        constraint "ux__marketplace_verifications__tenant_user" unique ("tenant_id", "user_id"),
        constraint "ck__marketplace_verifications__role" check ("role" in ('farmer', 'seller', 'buyer')),
        constraint "ck__marketplace_verifications__level" check ("level" in ('basic', 'verified', 'trusted')),
        constraint "ck__marketplace_verifications__status" check ("status" in ('none', 'pending', 'verified', 'rejected'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_verifications__tenant_id_status" on "marketplace_verifications" ("tenant_id", "status");`,
    );

    this.addSql(`
      create table "marketplace_carts" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "seller_id" varchar(100) not null,
        "items" jsonb not null default '[]'::jsonb,
        "status" varchar(20) not null default 'open',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__marketplace_carts" primary key ("id"),
        constraint "ck__marketplace_carts__status" check ("status" in ('open', 'ordered', 'abandoned'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_carts__tenant_id_user_id_status" on "marketplace_carts" ("tenant_id", "user_id", "status");`,
    );
    this.addSql(
      `create index "ix__marketplace_carts__tenant_id_seller_id" on "marketplace_carts" ("tenant_id", "seller_id");`,
    );

    this.addSql(`
      create table "marketplace_sample_requests" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "product_id" varchar(100) not null,
        "seller_id" varchar(100) not null,
        "status" varchar(20) not null default 'pending',
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_sample_requests" primary key ("id"),
        constraint "ck__marketplace_sample_requests__status" check ("status" in ('pending', 'shipped', 'delivered', 'cancelled'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_sample_requests__tenant_id_user_id" on "marketplace_sample_requests" ("tenant_id", "user_id");`,
    );
    this.addSql(
      `create index "ix__marketplace_sample_requests__tenant_id_seller_id" on "marketplace_sample_requests" ("tenant_id", "seller_id");`,
    );

    this.addSql(`
      create table "marketplace_favorites" (
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "product_id" varchar(100) not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_favorites" primary key ("tenant_id", "user_id", "product_id"),
        constraint "ux__marketplace_favorites__tenant_user_product" unique ("tenant_id", "user_id", "product_id")
      );
    `);
    this.addSql(
      `create index "ix__marketplace_favorites__tenant_id_user_id" on "marketplace_favorites" ("tenant_id", "user_id");`,
    );

    this.addSql(`
      create table "marketplace_reviews" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "product_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "rating" int not null,
        "comment" varchar(2000) null,
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_reviews" primary key ("id"),
        constraint "ck__marketplace_reviews__rating" check ("rating" >= 1 and "rating" <= 5)
      );
    `);
    this.addSql(
      `create index "ix__marketplace_reviews__tenant_id_product_id" on "marketplace_reviews" ("tenant_id", "product_id");`,
    );

    this.addSql(`
      create table "marketplace_requests" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "buyer_user_id" varchar(100) not null,
        "title" varchar(200) not null,
        "product" varchar(200) null,
        "volume" varchar(100) null,
        "region" varchar(100) not null,
        "deadline" varchar(100) null,
        "budget_uzs" numeric(15,2) null,
        "requirements" text null,
        "status" varchar(20) not null default 'open',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__marketplace_requests" primary key ("id"),
        constraint "ck__marketplace_requests__status" check ("status" in ('open', 'offering', 'selected', 'closed', 'expired'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_requests__tenant_id_status" on "marketplace_requests" ("tenant_id", "status");`,
    );
    this.addSql(
      `create index "ix__marketplace_requests__tenant_id_buyer_user_id" on "marketplace_requests" ("tenant_id", "buyer_user_id");`,
    );

    this.addSql(`
      create table "marketplace_request_offers" (
        "id" uuid not null,
        "request_id" uuid not null,
        "tenant_id" varchar(100) not null,
        "seller_user_id" varchar(100) not null,
        "price_uzs" numeric(15,2) not null,
        "delivery_note" varchar(500) null,
        "delivery_days" int null,
        "status" varchar(20) not null default 'pending',
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_request_offers" primary key ("id"),
        constraint "fk__marketplace_offers__request" foreign key ("request_id") references "marketplace_requests" ("id") on delete cascade,
        constraint "ck__marketplace_offers__price" check ("price_uzs" > 0),
        constraint "ck__marketplace_offers__status" check ("status" in ('pending', 'accepted', 'declined'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_request_offers__tenant_id_request_id" on "marketplace_request_offers" ("tenant_id", "request_id");`,
    );
    this.addSql(
      `create index "ix__marketplace_request_offers__tenant_id_seller_user_id" on "marketplace_request_offers" ("tenant_id", "seller_user_id");`,
    );

    this.addSql(`
      create table "marketplace_contracts" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "buyer_user_id" varchar(100) not null,
        "seller_user_id" varchar(100) not null,
        "subject" varchar(300) not null,
        "amount_uzs" numeric(15,2) not null,
        "delivery_terms" varchar(30) not null,
        "delivery_price_uzs" numeric(15,2) null,
        "factoring_enabled" boolean not null default false,
        "status" varchar(20) not null default 'draft',
        "signed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__marketplace_contracts" primary key ("id"),
        constraint "ck__marketplace_contracts__amount" check ("amount_uzs" > 0),
        constraint "ck__marketplace_contracts__delivery_terms" check ("delivery_terms" in ('pickup', 'seller_delivery', 'by_agreement')),
        constraint "ck__marketplace_contracts__status" check ("status" in ('draft', 'signed', 'active', 'completed', 'cancelled'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_contracts__tenant_id_buyer_user_id" on "marketplace_contracts" ("tenant_id", "buyer_user_id");`,
    );
    this.addSql(
      `create index "ix__marketplace_contracts__tenant_id_seller_user_id" on "marketplace_contracts" ("tenant_id", "seller_user_id");`,
    );

    this.addSql(`
      create table "marketplace_ai_consultations" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "kind" varchar(30) not null,
        "question" text not null,
        "answer" text not null,
        "product_ids" jsonb not null default '[]'::jsonb,
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_ai_consultations" primary key ("id"),
        constraint "ck__marketplace_ai__kind" check ("kind" in ('recommendation', 'find_cheaper', 'season_advice', 'generic'))
      );
    `);
    this.addSql(
      `create index "ix__marketplace_ai_consultations__tenant_id_user_id" on "marketplace_ai_consultations" ("tenant_id", "user_id");`,
    );
  }

  override down(): void {
    this.addSql(`drop table if exists "marketplace_ai_consultations" cascade;`);
    this.addSql(`drop table if exists "marketplace_contracts" cascade;`);
    this.addSql(`drop table if exists "marketplace_request_offers" cascade;`);
    this.addSql(`drop table if exists "marketplace_requests" cascade;`);
    this.addSql(`drop table if exists "marketplace_reviews" cascade;`);
    this.addSql(`drop table if exists "marketplace_favorites" cascade;`);
    this.addSql(`drop table if exists "marketplace_sample_requests" cascade;`);
    this.addSql(`drop table if exists "marketplace_carts" cascade;`);
    this.addSql(`drop table if exists "marketplace_verifications" cascade;`);
  }
}
