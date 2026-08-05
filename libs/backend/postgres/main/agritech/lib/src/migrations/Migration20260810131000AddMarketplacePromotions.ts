// @requirements REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

export class Migration20260810131000AddMarketplacePromotions extends Migration {
  override up(): void {
    this.addSql(`
      create table "marketplace_listing_promotions" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "seller_partner_id" uuid not null,
        "seller_public_id" uuid not null,
        "listing_publication_id" uuid not null,
        "plan_code" varchar(30) not null,
        "status" varchar(20) not null default 'active',
        "starts_at" timestamptz not null,
        "ends_at" timestamptz not null,
        "price_uzs" numeric(15,0) not null,
        "currency" varchar(3) not null default 'UZS',
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "activation_reference" varchar(80) not null,
        "activated_at" timestamptz not null,
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_listing_promotions_pkey" primary key ("id"),
        constraint "fk__listing_promotions__seller_partner_id"
          foreign key ("seller_partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "fk__listing_promotions__seller_public_id"
          foreign key ("seller_public_id") references "marketplace_public_sellers" ("id") on delete restrict,
        constraint "fk__listing_promotions__listing_publication_id"
          foreign key ("listing_publication_id") references "marketplace_listing_publications" ("id") on delete restrict,
        constraint "uq__listing_promotions__actor_command_key"
          unique ("tenant_id", "actor_user_id", "idempotency_key"),
        constraint "uq__listing_promotions__activation_reference" unique ("activation_reference"),
        constraint "ck__listing_promotions__plan" check (
          ("plan_code" = 'catalog_7d' and "price_uzs" = 150000 and "ends_at" = "starts_at" + interval '7 days')
          or ("plan_code" = 'catalog_14d' and "price_uzs" = 270000 and "ends_at" = "starts_at" + interval '14 days')
          or ("plan_code" = 'catalog_30d' and "price_uzs" = 500000 and "ends_at" = "starts_at" + interval '30 days')
        ),
        constraint "ck__listing_promotions__status"
          check ("status" in ('scheduled', 'active', 'expired')),
        constraint "ck__listing_promotions__currency" check ("currency" = 'UZS'),
        constraint "ck__listing_promotions__activation_reference"
          check ("activation_reference" ~ '^promotion:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
        constraint "ck__listing_promotions__activation_time" check ("activated_at" <= "starts_at"),
        constraint "ck__listing_promotions__fingerprint"
          check ("request_fingerprint" ~ '^[a-f0-9]{64}$'),
        constraint "ck__listing_promotions__revision" check ("revision" >= 0)
      );
    `);
    this.addSql(`
      create unique index "uq__marketplace_listing_promotions__listing_publication_id"
        on "marketplace_listing_promotions" ("listing_publication_id")
        where "status" in ('scheduled', 'active');
    `);
    this.addSql(`
      create index "ix__marketplace_listing_promotions__tenant_id_actor_us_ea6e9706"
        on "marketplace_listing_promotions" ("tenant_id", "actor_user_id", "created_at");
    `);
    this.addSql(`
      create index "ix__marketplace_listing_promotions__listing_publicatio_00ec40d4"
        on "marketplace_listing_promotions" ("listing_publication_id", "starts_at", "ends_at");
    `);
    this.addSql(`
      create function "guard_marketplace_listing_promotion"() returns trigger as $$
      begin
        if tg_op = 'UPDATE' and (
          old."tenant_id", old."actor_user_id", old."seller_partner_id", old."seller_public_id",
          old."listing_publication_id", old."plan_code", old."starts_at", old."ends_at",
          old."price_uzs", old."currency", old."idempotency_key", old."request_fingerprint",
          old."activation_reference", old."activated_at", old."created_at"
        ) is distinct from (
          new."tenant_id", new."actor_user_id", new."seller_partner_id", new."seller_public_id",
          new."listing_publication_id", new."plan_code", new."starts_at", new."ends_at",
          new."price_uzs", new."currency", new."idempotency_key", new."request_fingerprint",
          new."activation_reference", new."activated_at", new."created_at"
        ) then
          raise exception 'marketplace listing promotion identity is immutable'
            using errcode = '23514', constraint = 'ck__listing_promotions__immutable_identity';
        end if;

        if tg_op = 'INSERT' and (
          new."revision" <> 0
          or new."ends_at" <= now()
          or (new."status" = 'active' and new."starts_at" <> new."activated_at")
          or (new."status" = 'scheduled' and new."starts_at" <= new."activated_at")
          or new."status" not in ('scheduled', 'active')
        ) then
          raise exception 'marketplace listing promotion initial state is invalid'
            using errcode = '23514', constraint = 'ck__listing_promotions__status_transition';
        end if;

        if tg_op = 'UPDATE' and not (
          old."status" in ('scheduled', 'active')
          and new."status" = 'expired'
          and new."ends_at" <= now()
          and new."revision" = old."revision" + 1
          and new."updated_at" >= old."updated_at"
        ) then
          raise exception 'marketplace listing promotion status transition is invalid'
            using errcode = '23514', constraint = 'ck__listing_promotions__status_transition';
        end if;

        if tg_op = 'INSERT' and not exists (
          select 1
            from "marketplace_listing_publications" publication
            join "marketplace_public_sellers" seller
              on seller."id" = publication."seller_public_id"
             and seller."tenant_id" = publication."tenant_id"
             and seller."owner_user_id" = publication."owner_user_id"
            join "agritech_partners" partner
              on partner."id" = seller."partner_id"
             and partner."tenant_id" = seller."tenant_id"
             and partner."owner_user_id" = seller."owner_user_id"
             and partner."kind" = 'supplier'
           where publication."id" = new."listing_publication_id"
             and publication."tenant_id" = new."tenant_id"
             and seller."id" = new."seller_public_id"
             and partner."id" = new."seller_partner_id"
             and exists (
               select 1 from "marketplace_partner_memberships" membership
                where membership."tenant_id" = new."tenant_id"
                  and membership."partner_id" = new."seller_partner_id"
                  and membership."user_id" = new."actor_user_id"
                  and membership."capability" = 'seller'
                  and membership."status" = 'active'
             )
             and exists (
               select 1 from "marketplace_verifications" verification
                where verification."tenant_id" = new."tenant_id"
                  and verification."user_id" = new."actor_user_id"
                  and verification."role" in ('farmer', 'seller')
                  and verification."status" = 'verified'
             )
        ) then
          raise exception 'marketplace listing promotion organization mismatch'
            using errcode = '23514', constraint = 'ck__listing_promotions__organization_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_listing_promotions__guard"
        before insert or update on "marketplace_listing_promotions"
        for each row execute function "guard_marketplace_listing_promotion"();
    `);
  }

  override down(): void {
    this.addSql(`
      drop trigger if exists "tr__marketplace_listing_promotions__guard"
        on "marketplace_listing_promotions";
    `);
    this.addSql(`drop function if exists "guard_marketplace_listing_promotion"();`);
    this.addSql(`drop table if exists "marketplace_listing_promotions";`);
  }
}
