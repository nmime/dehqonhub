// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

/**
 * A paid catalog slot is now reserved before it is charged. The reservation
 * lives in the new `pending_billing` status, holds the listing's single
 * promotion slot, and stays invisible to the catalog until a succeeded
 * `promotion_billing` provider operation settles it. The settle transition is
 * enforced in the database, so no application path can grant a promoted
 * placement without a recorded charge.
 *
 * Rows written before this migration keep their status and a null
 * `billing_operation_id`: they are historical fixtures, and the null is the
 * honest statement that no charge is recorded for them.
 */
export class Migration20260812130000RequireMarketplacePromotionBilling extends Migration {
  override up(): void {
    this.addSql(`
      alter table "marketplace_listing_promotions"
        alter column "status" set default 'pending_billing',
        add column "billing_operation_id" uuid null,
        add constraint "fk__listing_promotions__billing_operation_id"
          foreign key ("billing_operation_id") references "marketplace_provider_operations" ("id")
          on delete restrict,
        add constraint "uq__listing_promotions__billing_operation_id" unique ("billing_operation_id"),
        drop constraint "ck__listing_promotions__status",
        add constraint "ck__listing_promotions__status"
          check ("status" in ('pending_billing', 'scheduled', 'active', 'expired')),
        add constraint "ck__listing_promotions__billing"
          check ("status" <> 'pending_billing' or "billing_operation_id" is null);
    `);
    this.addSql(`
      drop index "uq__marketplace_listing_promotions__listing_publication_id";
    `);
    this.addSql(`
      create unique index "uq__marketplace_listing_promotions__listing_publication_id"
        on "marketplace_listing_promotions" ("listing_publication_id")
        where "status" in ('pending_billing', 'scheduled', 'active');
    `);
    this.addSql(`
      create unique index "uq__marketplace_provider_operations__resource_type_res_5a3eb243"
        on "marketplace_provider_operations" ("resource_type", "resource_id", "capability")
        where "status" in ('started', 'succeeded') and "capability" = 'promotion_billing';
    `);
    this.addSql(`
      create or replace function "guard_marketplace_listing_promotion"() returns trigger as $$
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
          or new."billing_operation_id" is not null
          or (new."status" = 'active' and new."starts_at" <> new."activated_at")
          or (new."status" = 'scheduled' and new."starts_at" <= new."activated_at")
          or new."status" not in ('pending_billing', 'scheduled', 'active')
        ) then
          raise exception 'marketplace listing promotion initial state is invalid'
            using errcode = '23514', constraint = 'ck__listing_promotions__status_transition';
        end if;

        -- The only way out of a reservation is a settled charge or a lapsed window.
        if tg_op = 'UPDATE' and not (
          (old."status" = 'pending_billing'
            and new."status" = (case when new."starts_at" > old."activated_at" then 'scheduled' else 'active' end)
            and new."revision" = old."revision" + 1
            and new."updated_at" >= old."updated_at"
            and old."billing_operation_id" is null
            and exists (
              select 1 from "marketplace_provider_operations" charge
               where charge."id" = new."billing_operation_id"
                 and charge."capability" = 'promotion_billing'
                 and charge."actor_type" = 'promotion_owner'
                 and charge."resource_type" = 'promotion'
                 and charge."resource_id" = new."id"
                 and charge."tenant_id" = new."tenant_id"
                 and charge."user_id" = new."actor_user_id"
                 and charge."status" = 'succeeded'
            ))
          or (old."status" in ('pending_billing', 'scheduled', 'active')
            and new."status" = 'expired'
            and new."ends_at" <= now()
            and new."revision" = old."revision" + 1
            and new."updated_at" >= old."updated_at"
            and new."billing_operation_id" is not distinct from old."billing_operation_id")
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
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from "marketplace_listing_promotions" where "status" = 'pending_billing'
        ) then
          raise exception 'cannot downgrade marketplace promotion billing while a reservation is unsettled';
        end if;
      end;
      $$;
    `);
    this.addSql(`
      create or replace function "guard_marketplace_listing_promotion"() returns trigger as $$
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
    this.addSql(`drop index "uq__marketplace_provider_operations__resource_type_res_5a3eb243";`);
    this.addSql(`drop index "uq__marketplace_listing_promotions__listing_publication_id";`);
    this.addSql(`
      create unique index "uq__marketplace_listing_promotions__listing_publication_id"
        on "marketplace_listing_promotions" ("listing_publication_id")
        where "status" in ('scheduled', 'active');
    `);
    this.addSql(`
      alter table "marketplace_listing_promotions"
        alter column "status" set default 'active',
        drop constraint "ck__listing_promotions__billing",
        drop constraint "ck__listing_promotions__status",
        add constraint "ck__listing_promotions__status"
          check ("status" in ('scheduled', 'active', 'expired')),
        drop constraint "uq__listing_promotions__billing_operation_id",
        drop constraint "fk__listing_promotions__billing_operation_id",
        drop column "billing_operation_id";
    `);
  }
}
