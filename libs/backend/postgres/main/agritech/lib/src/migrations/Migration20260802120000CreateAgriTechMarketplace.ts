import { Migration } from '@mikro-orm/migrations';

export class Migration20260802120000CreateAgriTechMarketplace extends Migration {
  override up(): void {
    this.addSql(`
      create table "farmers" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "phone" varchar(20) not null,
        "first_name" varchar(100) not null,
        "last_name" varchar(100) not null,
        "region" varchar(100) not null,
        "district" varchar(100) null,
        "village" varchar(100) null,
        "farm_size_hectares" numeric(10,2) not null,
        "crops" jsonb not null default '[]'::jsonb,
        "status" varchar(30) not null default 'pending_verification',
        "telegram_id" varchar(50) null,
        "latitude" numeric(10,6) null,
        "longitude" numeric(10,6) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__farmers" primary key ("id"),
        constraint "ux__farmers__tenant_user" unique ("tenant_id", "user_id"),
        constraint "ux__farmers__tenant_phone" unique ("tenant_id", "phone"),
        constraint "ck__farmers__status" check ("status" in ('pending_verification', 'active', 'inactive')),
        constraint "ck__farmers__farm_size" check ("farm_size_hectares" > 0)
      );
    `);
    this.addSql('create index "ix__farmers__region" on "farmers" ("region");');
    this.addSql('create index "ix__farmers__telegram_id" on "farmers" ("telegram_id");');

    this.addSql(`
      create table "products" (
        "id" uuid not null,
        "name" varchar(200) not null,
        "name_ru" varchar(200) null,
        "category" varchar(30) not null,
        "description" text not null,
        "supplier_id" varchar(100) not null,
        "supplier_name" varchar(200) not null,
        "price_uzs" numeric(15,2) not null,
        "unit" varchar(50) not null,
        "stock_quantity" int not null,
        "region" varchar(100) not null,
        "status" varchar(20) not null default 'active',
        "images" jsonb not null default '[]'::jsonb,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__products" primary key ("id"),
        constraint "ck__products__status" check ("status" in ('active', 'inactive', 'out_of_stock')),
        constraint "ck__products__price" check ("price_uzs" >= 0),
        constraint "ck__products__stock" check ("stock_quantity" >= 0)
      );
    `);
    this.addSql('create index "ix__products__status_category_region" on "products" ("status", "category", "region");');

    this.addSql(`
      create table "orders" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "user_id" varchar(100) not null,
        "farmer_id" uuid not null,
        "items" jsonb not null,
        "total_amount_uzs" numeric(15,2) not null,
        "status" varchar(20) not null default 'pending',
        "delivery_address" text not null,
        "region" varchar(100) not null,
        "notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__orders" primary key ("id"),
        constraint "fk__orders__farmer_id" foreign key ("farmer_id") references "farmers" ("id") on delete restrict,
        constraint "ck__orders__status" check ("status" in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
        constraint "ck__orders__total" check ("total_amount_uzs" >= 0)
      );
    `);
    this.addSql(
      'create index "ix__orders__tenant_id_user_id_created_at_desc" on "orders" ("tenant_id", "user_id", "created_at" desc);',
    );
    this.addSql('create index "ix__orders__farmer_id" on "orders" ("farmer_id");');
  }

  override down(): void {
    this.addSql('drop table if exists "orders" cascade;');
    this.addSql('drop table if exists "products" cascade;');
    this.addSql('drop table if exists "farmers" cascade;');
  }
}
