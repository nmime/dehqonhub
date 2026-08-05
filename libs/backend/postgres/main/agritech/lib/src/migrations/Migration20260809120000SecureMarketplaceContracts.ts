import { Migration } from '@mikro-orm/migrations';

const marketplaceIndexRenames = [
  ['ix__marketplace_verifications__tenant_status', 'ix__marketplace_verifications__tenant_id_status'],
  ['ix__marketplace_carts__tenant_user_status', 'ix__marketplace_carts__tenant_id_user_id_status'],
  ['ix__marketplace_carts__tenant_seller', 'ix__marketplace_carts__tenant_id_seller_id'],
  ['ix__marketplace_samples__tenant_user', 'ix__marketplace_sample_requests__tenant_id_user_id'],
  ['ix__marketplace_samples__tenant_seller', 'ix__marketplace_sample_requests__tenant_id_seller_id'],
  ['ix__marketplace_favorites__tenant_user', 'ix__marketplace_favorites__tenant_id_user_id'],
  ['ix__marketplace_reviews__tenant_product', 'ix__marketplace_reviews__tenant_id_product_id'],
  ['ix__marketplace_requests__tenant_status', 'ix__marketplace_requests__tenant_id_status'],
  ['ix__marketplace_requests__tenant_buyer', 'ix__marketplace_requests__tenant_id_buyer_user_id'],
  ['ix__marketplace_offers__tenant_request', 'ix__marketplace_request_offers__tenant_id_request_id'],
  ['ix__marketplace_offers__tenant_seller', 'ix__marketplace_request_offers__tenant_id_seller_user_id'],
  ['ix__marketplace_contracts__tenant_buyer', 'ix__marketplace_contracts__tenant_id_buyer_user_id'],
  ['ix__marketplace_contracts__tenant_seller', 'ix__marketplace_contracts__tenant_id_seller_user_id'],
  ['ix__marketplace_ai__tenant_user', 'ix__marketplace_ai_consultations__tenant_id_user_id'],
] as const;

export class Migration20260809120000SecureMarketplaceContracts extends Migration {
  override up(): void {
    for (const [legacyName, canonicalName] of marketplaceIndexRenames) {
      this.addSql(`alter index if exists "${legacyName}" rename to "${canonicalName}";`);
    }
    this.addSql(`
      alter table "marketplace_contracts"
        add column "source_type" varchar(30) null,
        add column "source_id" varchar(100) null,
        add column "lines" jsonb not null default '[]'::jsonb,
        add column "delivery_note" varchar(500) null,
        add column "delivery_days" int null,
        add column "buyer_signed_at" timestamptz null,
        add column "seller_signed_at" timestamptz null,
        add column "legacy_status" varchar(20) null,
        add column "legacy_signed_at" timestamptz null,
        add column "legacy_factoring_enabled" boolean null;
    `);
    this.addSql(`
      alter table "marketplace_request_offers"
        add column "delivery_terms" varchar(30) not null default 'by_agreement',
        add column "delivery_price_uzs" numeric(15,2) null;
    `);
    this.addSql(`
      alter table "marketplace_request_offers"
        alter column "delivery_terms" drop default;
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        alter column "status" type varchar(30);
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        drop constraint "ck__marketplace_contracts__status";
    `);
    this.addSql(`
      update "marketplace_contracts"
        set "legacy_status" = "status",
            "legacy_signed_at" = "signed_at",
            "legacy_factoring_enabled" = "factoring_enabled",
            "status" = 'legacy_review_required',
            "signed_at" = null,
            "buyer_signed_at" = null,
            "seller_signed_at" = null,
            "updated_at" = now()
        where "status" in ('draft', 'signed', 'active');
    `);
    this.addSql(`
      update "marketplace_contracts"
        set "factoring_enabled" = false
        where "factoring_enabled" = true;
    `);
    this.addSql(`
      update "marketplace_contracts"
        set "delivery_price_uzs" = case
          when "delivery_terms" = 'pickup' then 0
          when "delivery_terms" = 'seller_delivery' and "delivery_price_uzs" > 0 then "delivery_price_uzs"
          else null
        end;
    `);
    this.addSql(`
      update "marketplace_ai_consultations" as "consultation"
        set "product_ids" = coalesce(
          (
            select jsonb_agg("entry"."product_id" order by "entry"."position")
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof("consultation"."product_ids") = 'array'
                    then "consultation"."product_ids"
                  else '[]'::jsonb
                end
              ) with ordinality as "entry"("product_id", "position")
             where "consultation"."kind" <> 'season_advice'
               and exists (
                 select 1
                   from "products" as "product"
                  where "product"."id"::text = "entry"."product_id"
                    and "product"."tenant_id" = "consultation"."tenant_id"
                    and "product"."status" = 'active'
               )
          ),
          '[]'::jsonb
        );
    `);
    this.addSql(`
      update "marketplace_ai_consultations"
        set "answer" = case
          when jsonb_array_length("product_ids") > 0 then 'catalog_match'
          else 'no_catalog_match'
        end;
    `);
    this.addSql(`
      update "marketplace_verifications"
        set "rejection_reason" = case
          when "status" = 'rejected' then 'criteria_not_met'
          else null
        end;
    `);
    this.addSql(`
      delete from "marketplace_reviews" as "duplicate"
        using "marketplace_reviews" as "canonical"
        where "duplicate"."tenant_id" = "canonical"."tenant_id"
          and "duplicate"."product_id" = "canonical"."product_id"
          and "duplicate"."user_id" = "canonical"."user_id"
          and (
            "duplicate"."created_at" > "canonical"."created_at"
            or (
              "duplicate"."created_at" = "canonical"."created_at"
              and "duplicate"."id"::text > "canonical"."id"::text
            )
          );
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        add constraint "ck__marketplace_contracts__status"
          check ("status" in ('draft', 'signed', 'active', 'completed', 'cancelled', 'legacy_review_required')),
        add constraint "ck__marketplace_contracts__source_type"
          check ("source_type" is null or "source_type" in ('cart_checkout', 'offer_selection')),
        add constraint "ck__marketplace_contracts__source_pair"
          check (("source_type" is null) = ("source_id" is null)),
        add constraint "ck__marketplace_contracts__delivery_days"
          check ("delivery_days" is null or "delivery_days" > 0),
        add constraint "ck__marketplace_contracts__delivery_price"
          check (
            ("delivery_terms" = 'pickup' and "delivery_price_uzs" = 0)
            or ("delivery_terms" = 'seller_delivery' and ("delivery_price_uzs" is null or "delivery_price_uzs" > 0))
            or ("delivery_terms" = 'by_agreement' and "delivery_price_uzs" is null)
          ),
        add constraint "ck__marketplace_contracts__factoring_disabled"
          check ("factoring_enabled" = false),
        add constraint "ck__marketplace_contracts__party_consent"
          check (
            "status" not in ('draft', 'signed', 'active', 'legacy_review_required')
            or (
              "status" = 'draft'
              and "buyer_signed_at" is null
              and "seller_signed_at" is null
              and "signed_at" is null
            )
            or (
              "status" = 'signed'
              and (("buyer_signed_at" is null) <> ("seller_signed_at" is null))
              and "signed_at" is null
            )
            or (
              "status" = 'active'
              and "buyer_signed_at" is not null
              and "seller_signed_at" is not null
              and "signed_at" is not null
            )
            or (
              "status" = 'legacy_review_required'
              and "buyer_signed_at" is null
              and "seller_signed_at" is null
              and "signed_at" is null
              and "legacy_status" in ('draft', 'signed', 'active')
            )
          ),
        add constraint "uq__marketplace_contracts__tenant_id_source_type_source_id"
          unique ("tenant_id", "source_type", "source_id");
    `);
    this.addSql(`
      alter table "marketplace_request_offers"
        add constraint "ck__marketplace_offers__delivery_terms"
          check ("delivery_terms" in ('pickup', 'seller_delivery', 'by_agreement')),
        add constraint "ck__marketplace_offers__delivery_price"
          check (
            ("delivery_terms" = 'pickup' and "delivery_price_uzs" = 0)
            or ("delivery_terms" = 'seller_delivery' and "delivery_price_uzs" > 0)
            or ("delivery_terms" = 'by_agreement' and "delivery_price_uzs" is null)
          );
    `);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        add constraint "ck__marketplace_ai__answer"
          check ("answer" in ('catalog_match', 'no_catalog_match')),
        add constraint "ck__marketplace_ai__product_ids_array"
          check (jsonb_typeof("product_ids") = 'array');
    `);
    this.addSql(`
      alter table "marketplace_verifications"
        add constraint "ck__marketplace_verifications__rejection_reason"
          check (
            ("status" = 'rejected' and "rejection_reason" in ('criteria_not_met', 'documents_unreadable', 'identity_mismatch'))
            or ("status" <> 'rejected' and "rejection_reason" is null)
          );
    `);
    this.addSql(`
      alter table "marketplace_reviews"
        add constraint "uq__marketplace_reviews__tenant_id_product_id_user_id"
          unique ("tenant_id", "product_id", "user_id");
    `);
    this.addSql(`
      alter table "marketplace_favorites"
        drop constraint if exists "ux__marketplace_favorites__tenant_user_product";
    `);
  }

  override down(): void {
    // The up migration intentionally sanitizes unprovable legacy consent,
    // factoring, AI rows, verification reasons, and duplicate reviews. Those
    // values cannot be reconstructed. This schema contraction is therefore
    // safe only before marketplace traffic.
    this.addSql(`
      alter table "marketplace_ai_consultations"
        drop constraint if exists "ck__marketplace_ai__product_ids_array",
        drop constraint if exists "ck__marketplace_ai__answer";
    `);
    this.addSql(`
      alter table "marketplace_reviews"
        drop constraint if exists "uq__marketplace_reviews__tenant_id_product_id_user_id";
    `);
    this.addSql(`
      alter table "marketplace_favorites"
        add constraint "ux__marketplace_favorites__tenant_user_product"
          unique ("tenant_id", "user_id", "product_id");
    `);
    this.addSql(`
      alter table "marketplace_verifications"
        drop constraint if exists "ck__marketplace_verifications__rejection_reason";
    `);
    this.addSql(`
      alter table "marketplace_request_offers"
        drop constraint if exists "ck__marketplace_offers__delivery_price",
        drop constraint if exists "ck__marketplace_offers__delivery_terms";
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        drop constraint if exists "uq__marketplace_contracts__tenant_id_source_type_source_id",
        drop constraint if exists "ck__marketplace_contracts__party_consent",
        drop constraint if exists "ck__marketplace_contracts__factoring_disabled",
        drop constraint if exists "ck__marketplace_contracts__delivery_price",
        drop constraint if exists "ck__marketplace_contracts__delivery_days",
        drop constraint if exists "ck__marketplace_contracts__source_pair",
        drop constraint if exists "ck__marketplace_contracts__source_type",
        drop constraint if exists "ck__marketplace_contracts__status";
    `);
    this.addSql(`
      update "marketplace_contracts"
        set "status" = "legacy_status",
            "signed_at" = "legacy_signed_at",
            "factoring_enabled" = coalesce("legacy_factoring_enabled", false),
            "updated_at" = now()
        where "status" = 'legacy_review_required'
          and "legacy_status" in ('draft', 'signed', 'active');
    `);
    this.addSql(`
      update "marketplace_contracts"
        set "status" = 'draft', "signed_at" = null, "updated_at" = now()
        where "status" = 'signed' and "signed_at" is null;
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        alter column "status" type varchar(20);
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        add constraint "ck__marketplace_contracts__status"
          check ("status" in ('draft', 'signed', 'active', 'completed', 'cancelled'));
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        drop column if exists "legacy_factoring_enabled",
        drop column if exists "legacy_signed_at",
        drop column if exists "legacy_status",
        drop column if exists "seller_signed_at",
        drop column if exists "buyer_signed_at",
        drop column if exists "delivery_days",
        drop column if exists "delivery_note",
        drop column if exists "lines",
        drop column if exists "source_id",
        drop column if exists "source_type";
    `);
    this.addSql(`
      alter table "marketplace_request_offers"
        drop column if exists "delivery_price_uzs",
        drop column if exists "delivery_terms";
    `);
    for (const [legacyName, canonicalName] of marketplaceIndexRenames) {
      this.addSql(`alter index if exists "${canonicalName}" rename to "${legacyName}";`);
    }
  }
}
