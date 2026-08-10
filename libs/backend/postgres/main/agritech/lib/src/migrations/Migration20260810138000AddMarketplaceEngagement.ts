// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { Migration } from '@mikro-orm/migrations';

/** Replaces private product-id engagement with opaque, party-safe marketplace engagement. */
export class Migration20260810138000AddMarketplaceEngagement extends Migration {
  override up(): void {
    this.addSql(`alter table "products" add column "sample_available" boolean not null default false;`);
    this.addSql(`alter table "produce_listings" add column "sample_available" boolean not null default false;`);

    // Preserve pre-publication engagement history without leaving it mapped by runtime entities.
    this.addSql(`alter table "marketplace_sample_requests" rename to "marketplace_legacy_sample_requests_archive";`);
    this.addSql(`alter table "marketplace_favorites" rename to "marketplace_legacy_favorites_archive";`);
    this.addSql(`alter table "marketplace_reviews" rename to "marketplace_legacy_reviews_archive";`);

    this.addSql(`
      create table "marketplace_sample_policies" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "version" int not null default 1,
        "monthly_limit" int not null default 5,
        "active" boolean not null default true,
        "activated_by_user_id" varchar(100) not null,
        "active_from" timestamptz not null default now(),
        "retired_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_sample_policies_pkey" primary key ("id"),
        constraint "uq__marketplace_sample_policies__tenant_version" unique ("tenant_id", "version"),
        constraint "ck__marketplace_sample_policies__limit"
          check ("version" >= 1 and "monthly_limit" between 1 and 100),
        constraint "ck__marketplace_sample_policies__lifecycle"
          check (("active" = true and "retired_at" is null)
            or ("active" = false and "retired_at" is not null))
      );
    `);
    this.addSql(`
      create unique index "uq__marketplace_sample_policies__tenant_id_active"
        on "marketplace_sample_policies" ("tenant_id", "active") where "active" = true;
    `);
    this.addSql(`
      create index "ix__marketplace_sample_policies__tenant_id_active"
        on "marketplace_sample_policies" ("tenant_id", "active");
    `);

    this.addSql(`
      create table "marketplace_sample_monthly_usage" (
        "requester_tenant_id" varchar(100) not null,
        "requester_user_id" varchar(100) not null,
        "month_key" varchar(7) not null,
        "used_count" int not null default 0,
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_sample_monthly_usage_pkey"
          primary key ("requester_tenant_id", "requester_user_id", "month_key"),
        constraint "ck__marketplace_sample_monthly_usage__period"
          check ("month_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        constraint "ck__marketplace_sample_monthly_usage__count"
          check ("used_count" between 0 and 100)
      );
    `);

    this.addSql(`
      create table "marketplace_listing_favorites" (
        "id" uuid not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "listing_publication_id" uuid not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_listing_favorites_pkey" primary key ("id"),
        constraint "fk__marketplace_listing_favorites__listing_id"
          foreign key ("listing_publication_id") references "marketplace_listing_publications" ("id") on delete restrict,
        constraint "uq__marketplace_listing_favorites__actor_listing"
          unique ("actor_tenant_id", "actor_user_id", "listing_publication_id")
      );
    `);
    this.addSql(`
      create index "ix__marketplace_listing_favorites__actor_tenant_id_act_bff3e4bb"
        on "marketplace_listing_favorites" ("actor_tenant_id", "actor_user_id", "created_at");
    `);

    this.addSql(`
      create table "marketplace_listing_samples" (
        "id" uuid not null,
        "listing_publication_id" uuid not null,
        "source_kind" varchar(20) not null,
        "product_id" uuid null,
        "produce_listing_id" uuid null,
        "requester_tenant_id" varchar(100) not null,
        "requester_user_id" varchar(100) not null,
        "requester_partner_id" uuid not null,
        "seller_tenant_id" varchar(100) not null,
        "seller_user_id" varchar(100) not null,
        "seller_partner_id" uuid not null,
        "season_key" varchar(10) not null,
        "month_key" varchar(7) not null,
        "policy_id" uuid not null,
        "policy_version" int not null,
        "monthly_limit" int not null,
        "delivery_method" varchar(20) not null,
        "delivery_quote_uzs" numeric(15, 0) null,
        "item_price_uzs" int not null default 0,
        "status" varchar(20) not null default 'requested',
        "feedback_rating" int null,
        "feedback_comment" varchar(1000) null,
        "feedback_at" timestamptz null,
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_listing_samples_pkey" primary key ("id"),
        constraint "fk__marketplace_listing_samples__listing_id"
          foreign key ("listing_publication_id") references "marketplace_listing_publications" ("id") on delete restrict,
        constraint "fk__marketplace_listing_samples__product_id"
          foreign key ("product_id") references "products" ("id") on delete restrict,
        constraint "fk__marketplace_listing_samples__produce_id"
          foreign key ("produce_listing_id") references "produce_listings" ("id") on delete restrict,
        constraint "fk__marketplace_listing_samples__policy_id"
          foreign key ("policy_id") references "marketplace_sample_policies" ("id") on delete restrict,
        constraint "ck__marketplace_listing_samples__source_kind"
          check ("source_kind" in ('product', 'produce')),
        constraint "ck__marketplace_listing_samples__source_pair" check (
          ("source_kind" = 'product' and "product_id" is not null and "produce_listing_id" is null)
          or ("source_kind" = 'produce' and "product_id" is null and "produce_listing_id" is not null)
        ),
        constraint "ck__marketplace_listing_samples__period" check (
          "season_key" ~ '^[0-9]{4}-Q[1-4]$'
          and "month_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        ),
        constraint "ck__marketplace_listing_samples__policy"
          check ("policy_version" >= 1 and "monthly_limit" between 1 and 100),
        constraint "ck__marketplace_listing_samples__delivery" check (
          "item_price_uzs" = 0 and "delivery_method" in ('pickup', 'seller_delivery')
          and ("delivery_quote_uzs" is null or ("delivery_quote_uzs" between 0 and 9999999999999
            and "delivery_quote_uzs" = trunc("delivery_quote_uzs")))
          and ("delivery_method" <> 'pickup' or "delivery_quote_uzs" is null or "delivery_quote_uzs" = 0)
          and ("status" = 'requested' or "delivery_method" <> 'seller_delivery' or "delivery_quote_uzs" is not null)
        ),
        constraint "ck__marketplace_listing_samples__status"
          check ("status" in ('requested', 'approved', 'declined', 'cancelled', 'shipped', 'received')),
        constraint "ck__marketplace_listing_samples__feedback" check (
          ("feedback_rating" is null and "feedback_comment" is null and "feedback_at" is null)
          or ("status" = 'received' and "feedback_rating" between 1 and 5 and "feedback_at" is not null)
        ),
        constraint "ck__marketplace_listing_samples__revision" check ("revision" >= 0),
        constraint "ck__marketplace_listing_samples__different_parties"
          check ("requester_partner_id" <> "seller_partner_id")
      );
    `);
    this.addSql(`
      create unique index "uq__marketplace_listing_samples__requester_tenant_id_r_63a04c4b"
        on "marketplace_listing_samples" ("requester_tenant_id", "requester_user_id", "product_id", "season_key")
        where "source_kind" = 'product';
    `);
    this.addSql(`
      create unique index "uq__marketplace_listing_samples__requester_tenant_id_r_3eba0d03"
        on "marketplace_listing_samples" ("requester_tenant_id", "requester_user_id", "produce_listing_id", "season_key")
        where "source_kind" = 'produce';
    `);
    this.addSql(`
      create index "ix__marketplace_listing_samples__requester_tenant_id_r_4700d0a5"
        on "marketplace_listing_samples" ("requester_tenant_id", "requester_user_id", "month_key", "created_at");
    `);
    this.addSql(`
      create index "ix__marketplace_listing_samples__seller_tenant_id_sell_ecc53350"
        on "marketplace_listing_samples" ("seller_tenant_id", "seller_partner_id", "status", "created_at");
    `);

    this.addSql(`
      create table "marketplace_listing_reviews" (
        "id" uuid not null,
        "listing_publication_id" uuid not null,
        "source_kind" varchar(20) not null,
        "product_id" uuid null,
        "produce_listing_id" uuid null,
        "review_eligibility_id" uuid not null,
        "buyer_tenant_id" varchar(100) not null,
        "buyer_user_id" varchar(100) not null,
        "buyer_partner_id" uuid not null,
        "seller_tenant_id" varchar(100) not null,
        "seller_partner_id" uuid not null,
        "rating" int not null,
        "comment" varchar(2000) null,
        "asset_references" jsonb not null default '[]'::jsonb,
        "verified_deal" boolean not null default true,
        "visibility" varchar(20) not null default 'visible',
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_listing_reviews_pkey" primary key ("id"),
        constraint "fk__marketplace_listing_reviews__listing_id"
          foreign key ("listing_publication_id") references "marketplace_listing_publications" ("id") on delete restrict,
        constraint "fk__marketplace_listing_reviews__product_id"
          foreign key ("product_id") references "products" ("id") on delete restrict,
        constraint "fk__marketplace_listing_reviews__produce_id"
          foreign key ("produce_listing_id") references "produce_listings" ("id") on delete restrict,
        constraint "fk__marketplace_listing_reviews__eligibility_id"
          foreign key ("review_eligibility_id") references "marketplace_contract_review_eligibilities" ("id") on delete restrict,
        constraint "uq__marketplace_listing_reviews__eligibility" unique ("review_eligibility_id"),
        constraint "ck__marketplace_listing_reviews__source_kind"
          check ("source_kind" in ('product', 'produce')),
        constraint "ck__marketplace_listing_reviews__source_pair" check (
          ("source_kind" = 'product' and "product_id" is not null and "produce_listing_id" is null)
          or ("source_kind" = 'produce' and "product_id" is null and "produce_listing_id" is not null)
        ),
        constraint "ck__marketplace_listing_reviews__rating" check ("rating" between 1 and 5),
        constraint "ck__marketplace_listing_reviews__assets" check (
          jsonb_typeof("asset_references") = 'array' and jsonb_array_length("asset_references") <= 3
          and pg_column_size("asset_references") <= 1024
        ),
        constraint "ck__marketplace_listing_reviews__visibility"
          check ("verified_deal" = true and "visibility" in ('visible', 'hidden') and "revision" >= 0),
        constraint "ck__marketplace_listing_reviews__different_parties"
          check ("buyer_partner_id" <> "seller_partner_id")
      );
    `);
    this.addSql(`
      create unique index "uq__marketplace_listing_reviews__buyer_tenant_id_buyer_87d1c30f"
        on "marketplace_listing_reviews" ("buyer_tenant_id", "buyer_user_id", "product_id")
        where "source_kind" = 'product';
    `);
    this.addSql(`
      create unique index "uq__marketplace_listing_reviews__buyer_tenant_id_buyer_d7b1cf3c"
        on "marketplace_listing_reviews" ("buyer_tenant_id", "buyer_user_id", "produce_listing_id")
        where "source_kind" = 'produce';
    `);
    this.addSql(`
      create index "ix__marketplace_listing_reviews__listing_publication_i_ac417fa8"
        on "marketplace_listing_reviews" ("listing_publication_id", "visibility", "created_at");
    `);
    this.addSql(`
      create index "ix__marketplace_listing_reviews__seller_tenant_id_sell_8ec4a7a7"
        on "marketplace_listing_reviews" ("seller_tenant_id", "seller_partner_id", "visibility");
    `);

    this.addSql(`
      create table "marketplace_review_replies" (
        "id" uuid not null,
        "review_id" uuid not null,
        "seller_tenant_id" varchar(100) not null,
        "seller_user_id" varchar(100) not null,
        "seller_partner_id" uuid not null,
        "comment" varchar(1000) not null,
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_review_replies_pkey" primary key ("id"),
        constraint "fk__marketplace_review_replies__review_id"
          foreign key ("review_id") references "marketplace_listing_reviews" ("id") on delete restrict,
        constraint "uq__marketplace_review_replies__review_id" unique ("review_id"),
        constraint "ck__marketplace_review_replies__comment" check (btrim("comment") <> ''),
        constraint "ck__marketplace_review_replies__revision" check ("revision" >= 0)
      );
    `);

    this.addSql(`
      create table "marketplace_review_aggregates" (
        "listing_publication_id" uuid not null,
        "review_count" int not null default 0,
        "rating_sum" int not null default 0,
        "revision" int not null default 0,
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_review_aggregates_pkey" primary key ("listing_publication_id"),
        constraint "fk__marketplace_review_aggregates__listing_id"
          foreign key ("listing_publication_id") references "marketplace_listing_publications" ("id")
            on update cascade on delete restrict,
        constraint "ck__marketplace_review_aggregates__values" check (
          "review_count" >= 0 and "rating_sum" >= 0 and "rating_sum" <= "review_count" * 5 and "revision" >= 0
        )
      );
    `);

    this.addSql(`
      create table "marketplace_review_reports" (
        "id" uuid not null,
        "review_id" uuid not null,
        "moderation_tenant_id" varchar(100) not null,
        "reporter_tenant_id" varchar(100) not null,
        "reporter_user_id" varchar(100) not null,
        "reason" varchar(20) not null,
        "comment" varchar(500) null,
        "status" varchar(20) not null default 'pending',
        "review_snapshot" jsonb not null,
        "decided_by_user_id" varchar(100) null,
        "decided_at" timestamptz null,
        "revision" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_review_reports_pkey" primary key ("id"),
        constraint "fk__marketplace_review_reports__review_id"
          foreign key ("review_id") references "marketplace_listing_reviews" ("id") on delete restrict,
        constraint "uq__marketplace_review_reports__reporter_reason"
          unique ("review_id", "reporter_tenant_id", "reporter_user_id", "reason"),
        constraint "ck__marketplace_review_reports__reason"
          check ("reason" in ('spam', 'abuse', 'privacy', 'off_topic')),
        constraint "ck__marketplace_review_reports__status" check (
          ("status" = 'pending' and "decided_by_user_id" is null and "decided_at" is null and "revision" = 0)
          or ("status" in ('dismissed', 'hidden') and btrim("decided_by_user_id") <> ''
            and "decided_at" is not null and "revision" = 1)
        ),
        constraint "ck__marketplace_review_reports__snapshot"
          check (jsonb_typeof("review_snapshot") = 'object' and pg_column_size("review_snapshot") <= 16384)
      );
    `);
    this.addSql(`
      create index "ix__marketplace_review_reports__moderation_tenant_id_s_7a2c2259"
        on "marketplace_review_reports" ("moderation_tenant_id", "status", "created_at");
    `);

    this.addSql(`
      create table "marketplace_engagement_events" (
        "id" uuid not null,
        "aggregate_type" varchar(20) not null,
        "aggregate_id" uuid not null,
        "sequence" int not null,
        "event_type" varchar(50) not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "metadata" jsonb not null default '{}'::jsonb,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_engagement_events_pkey" primary key ("id"),
        constraint "uq__marketplace_engagement_events__aggregate_sequence"
          unique ("aggregate_type", "aggregate_id", "sequence"),
        constraint "ck__marketplace_engagement_events__aggregate_type"
          check ("aggregate_type" in ('sample', 'review', 'review_report', 'sample_policy')),
        constraint "ck__marketplace_engagement_events__metadata" check (
          "sequence" >= 1 and jsonb_typeof("metadata") = 'object' and pg_column_size("metadata") <= 4096
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_engagement_events__aggregate_type_aggr_0aec3d52"
        on "marketplace_engagement_events" ("aggregate_type", "aggregate_id", "created_at");
    `);

    this.addSql(`
      create table "marketplace_engagement_notification_intents" (
        "id" uuid not null,
        "event_id" uuid not null,
        "recipient_tenant_id" varchar(100) not null,
        "recipient_user_id" varchar(100) not null,
        "recipient_locale" varchar(16) not null default 'en',
        "template_key" varchar(80) not null,
        "payload" jsonb not null default '{}'::jsonb,
        "status" varchar(20) not null default 'pending',
        "created_at" timestamptz not null default now(),
        constraint "marketplace_engagement_notification_intents_pkey" primary key ("id"),
        constraint "fk__marketplace_engagement_notification__event_id"
          foreign key ("event_id") references "marketplace_engagement_events" ("id") on delete restrict,
        constraint "uq__marketplace_engagement_notification__event_recipient"
          unique ("event_id", "recipient_tenant_id", "recipient_user_id"),
        constraint "ck__marketplace_engagement_notification__locale"
          check ("recipient_locale" in ('en', 'ru', 'uz', 'uz-cyrl')),
        constraint "ck__marketplace_engagement_notification__status" check ("status" = 'pending'),
        constraint "ck__marketplace_engagement_notification__payload"
          check (jsonb_typeof("payload") = 'object' and pg_column_size("payload") <= 2048)
      );
    `);
    this.addSql(`
      create index "ix__marketplace_engagement_notification_intents__recip_c0281b60"
        on "marketplace_engagement_notification_intents"
          ("recipient_tenant_id", "recipient_user_id", "created_at");
    `);

    this.addSql(`
      create table "marketplace_engagement_operations" (
        "id" uuid not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "operation" varchar(30) not null,
        "resource_key" varchar(100) not null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "result_snapshot" jsonb not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_engagement_operations_pkey" primary key ("id"),
        constraint "uq__marketplace_engagement_operations__actor_operation_key"
          unique ("actor_tenant_id", "actor_user_id", "operation", "idempotency_key"),
        constraint "ck__marketplace_engagement_operations__operation" check (
          "operation" in ('favorite_add', 'favorite_remove', 'sample_request', 'sample_transition',
            'sample_feedback', 'sample_policy_activate', 'review_submit', 'review_reply', 'review_report',
            'review_moderate')
        ),
        constraint "ck__marketplace_engagement_operations__fingerprint"
          check ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
        constraint "ck__marketplace_engagement_operations__snapshot"
          check (jsonb_typeof("result_snapshot") = 'object' and pg_column_size("result_snapshot") <= 65536)
      );
    `);
    this.addSql(`
      create index "ix__marketplace_engagement_operations__actor_tenant_id_72b5ee1a"
        on "marketplace_engagement_operations" ("actor_tenant_id", "actor_user_id", "created_at");
    `);

    this.addCoherenceAndQuotaGuards();
    this.addGuardsAndAggregateTrigger();
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (select 1 from "marketplace_listing_favorites")
          or exists (select 1 from "marketplace_listing_samples")
          or exists (select 1 from "marketplace_listing_reviews")
          or exists (select 1 from "marketplace_sample_policies")
          or exists (select 1 from "marketplace_engagement_events")
          or exists (select 1 from "marketplace_engagement_operations")
          or exists (select 1 from "products" where "sample_available" = true)
          or exists (select 1 from "produce_listings" where "sample_available" = true) then
          raise exception 'cannot remove marketplace engagement after engagement traffic has begun';
        end if;
      end $$;
    `);
    this.addSql(`drop trigger "tr__marketplace_review_reports__guard" on "marketplace_review_reports";`);
    this.addSql(`drop trigger "tr__marketplace_review_replies__immutable" on "marketplace_review_replies";`);
    this.addSql(`drop trigger "tr__marketplace_listing_reviews__aggregate" on "marketplace_listing_reviews";`);
    this.addSql(`drop trigger "tr__marketplace_listing_reviews__guard" on "marketplace_listing_reviews";`);
    this.addSql(`drop trigger "tr__marketplace_listing_samples__guard" on "marketplace_listing_samples";`);
    this.addSql(`drop trigger "tr__marketplace_sample_policies__guard" on "marketplace_sample_policies";`);
    this.addSql(`drop trigger "tr__marketplace_review_reports__coherence" on "marketplace_review_reports";`);
    this.addSql(`drop trigger "tr__marketplace_review_replies__coherence" on "marketplace_review_replies";`);
    this.addSql(`drop trigger "tr__marketplace_listing_reviews__coherence" on "marketplace_listing_reviews";`);
    this.addSql(`drop trigger "tr__marketplace_listing_samples__coherence" on "marketplace_listing_samples";`);
    this.addSql(
      `drop trigger "tr__marketplace_publications__engagement_identity" on "marketplace_listing_publications";`,
    );
    this.addSql(`drop trigger "tr__marketplace_sellers__engagement_identity" on "marketplace_public_sellers";`);
    this.addSql(`drop trigger "tr__products__engagement_identity" on "products";`);
    this.addSql(`drop trigger "tr__produce__engagement_identity" on "produce_listings";`);
    this.addSql(`drop trigger "tr__partners__engagement_identity" on "agritech_partners";`);
    this.addSql(`drop trigger "tr__marketplace_engagement_events__immutable" on "marketplace_engagement_events";`);
    this.addSql(
      `drop trigger "tr__marketplace_engagement_notification__immutable" on "marketplace_engagement_notification_intents";`,
    );
    this.addSql(
      `drop trigger "tr__marketplace_engagement_operations__immutable" on "marketplace_engagement_operations";`,
    );
    this.addSql(`drop function "guard_marketplace_review_report"();`);
    this.addSql(`drop function "guard_marketplace_listing_review"();`);
    this.addSql(`drop function "refresh_marketplace_review_aggregate"();`);
    this.addSql(`drop function "guard_marketplace_listing_sample"();`);
    this.addSql(`drop function "guard_marketplace_sample_policy"();`);
    this.addSql(`drop function "reject_marketplace_engagement_mutation"();`);
    this.addSql(`drop function "guard_marketplace_engagement_parent_identity"();`);
    this.addSql(`drop function "assert_marketplace_review_report_coherence"();`);
    this.addSql(`drop function "assert_marketplace_review_reply_coherence"();`);
    this.addSql(`drop function "assert_marketplace_listing_review_coherence"();`);
    this.addSql(`drop function "assert_marketplace_listing_sample_coherence"();`);

    this.addSql(`drop table "marketplace_engagement_notification_intents";`);
    this.addSql(`drop table "marketplace_engagement_operations";`);
    this.addSql(`drop table "marketplace_engagement_events";`);
    this.addSql(`drop table "marketplace_review_reports";`);
    this.addSql(`drop table "marketplace_review_aggregates";`);
    this.addSql(`drop table "marketplace_review_replies";`);
    this.addSql(`drop table "marketplace_listing_reviews";`);
    this.addSql(`drop table "marketplace_listing_samples";`);
    this.addSql(`drop table "marketplace_listing_favorites";`);
    this.addSql(`drop table "marketplace_sample_monthly_usage";`);
    this.addSql(`drop table "marketplace_sample_policies";`);

    this.addSql(`alter table "marketplace_legacy_reviews_archive" rename to "marketplace_reviews";`);
    this.addSql(`alter table "marketplace_legacy_favorites_archive" rename to "marketplace_favorites";`);
    this.addSql(`alter table "marketplace_legacy_sample_requests_archive" rename to "marketplace_sample_requests";`);
    this.addSql(`alter table "produce_listings" drop column "sample_available";`);
    this.addSql(`alter table "products" drop column "sample_available";`);
  }

  private addCoherenceAndQuotaGuards(): void {
    this.addSql(`
      create function "assert_marketplace_listing_sample_coherence"() returns trigger as $$
      declare
        quota_count int;
      begin
        if new."status" <> 'requested' or new."revision" <> 0 or new."delivery_quote_uzs" is not null
          or new."feedback_at" is not null or not exists (
            select 1
              from "marketplace_sample_policies" policy
             where policy."id" = new."policy_id" and policy."tenant_id" = new."requester_tenant_id"
               and policy."version" = new."policy_version" and policy."monthly_limit" = new."monthly_limit"
               and policy."active" = true
          ) or not exists (
            select 1
              from "marketplace_listing_publications" publication
              join "marketplace_public_sellers" seller
                on seller."id" = publication."seller_public_id"
               and seller."tenant_id" = publication."tenant_id"
               and seller."owner_user_id" = publication."owner_user_id"
              join "agritech_partners" seller_partner
                on seller_partner."id" = seller."partner_id" and seller_partner."tenant_id" = seller."tenant_id"
               and seller_partner."kind" = 'supplier' and seller_partner."status" = 'approved'
             where publication."id" = new."listing_publication_id"
               and publication."tenant_id" = new."seller_tenant_id"
               and publication."owner_user_id" = new."seller_user_id"
               and publication."source_kind" = new."source_kind"
               and seller_partner."id" = new."seller_partner_id"
               and publication."status" = 'published' and publication."moderation_status" = 'approved'
               and ((new."source_kind" = 'product' and publication."product_id" = new."product_id"
                 and exists (select 1 from "products" product
                   where product."id" = new."product_id" and product."tenant_id" = new."seller_tenant_id"
                     and product."supplier_id" = new."seller_partner_id"::text and product."status" = 'active'
                     and product."stock_quantity" > 0 and product."sample_available" = true))
                 or (new."source_kind" = 'produce' and publication."produce_listing_id" = new."produce_listing_id"
                 and exists (select 1
                   from "produce_listings" produce
                   join "marketplace_produce_organization_bindings" binding
                     on binding."produce_listing_id" = produce."id" and binding."tenant_id" = produce."tenant_id"
                    and binding."owner_user_id" = new."seller_user_id"
                    and binding."supplier_partner_id" = new."seller_partner_id"
                   join "farmers" farmer on farmer."id" = produce."farmer_id"
                    and farmer."tenant_id" = produce."tenant_id" and farmer."user_id" = new."seller_user_id"
                  where produce."id" = new."produce_listing_id" and produce."tenant_id" = new."seller_tenant_id"
                    and produce."status" = 'active' and produce."available_quantity_kg" > 0
                    and produce."available_from" <= now() and produce."available_until" >= now()
                    and produce."sample_available" = true and farmer."status" = 'active')))
          ) or not exists (
            select 1
              from "marketplace_partner_memberships" membership
              join "agritech_partners" partner on partner."id" = membership."partner_id"
               and partner."tenant_id" = membership."tenant_id" and partner."kind" = 'buyer'
               and partner."status" = 'approved'
              join "marketplace_verifications" verification on verification."tenant_id" = membership."tenant_id"
               and verification."user_id" = membership."user_id" and verification."role" = 'buyer'
               and verification."status" = 'verified'
             where membership."partner_id" = new."requester_partner_id"
               and membership."tenant_id" = new."requester_tenant_id"
               and membership."user_id" = new."requester_user_id"
               and membership."capability" = 'buyer' and membership."status" = 'active'
          ) or not exists (
            select 1 from "marketplace_partner_memberships" membership
             where membership."partner_id" = new."seller_partner_id"
               and membership."tenant_id" = new."seller_tenant_id"
               and membership."user_id" = new."seller_user_id"
               and membership."capability" = 'seller' and membership."status" = 'active'
          ) then
          raise exception 'marketplace sample identity is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_listing_samples__coherence';
        end if;
        insert into "marketplace_sample_monthly_usage"
          ("requester_tenant_id", "requester_user_id", "month_key", "used_count", "updated_at")
        values (new."requester_tenant_id", new."requester_user_id", new."month_key", 1, now())
        on conflict ("requester_tenant_id", "requester_user_id", "month_key") do update
          set "used_count" = "marketplace_sample_monthly_usage"."used_count" + 1, "updated_at" = now()
          where "marketplace_sample_monthly_usage"."used_count" < new."monthly_limit"
        returning "used_count" into quota_count;
        if quota_count is null or quota_count > new."monthly_limit" then
          raise exception 'marketplace sample monthly quota is exhausted'
            using errcode = '23514', constraint = 'ck__marketplace_listing_samples__monthly_quota';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_listing_samples__coherence"
        before insert on "marketplace_listing_samples"
        for each row execute function "assert_marketplace_listing_sample_coherence"();
    `);

    this.addSql(`
      create function "assert_marketplace_listing_review_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1
            from "marketplace_contract_review_eligibilities" eligibility
            join "marketplace_listing_publications" publication
              on publication."id" = eligibility."source_publication_id"
            join "marketplace_public_sellers" seller
              on seller."id" = publication."seller_public_id"
             and seller."tenant_id" = publication."tenant_id"
             and seller."partner_id" = eligibility."seller_partner_id"
            join "agritech_partners" buyer_partner
              on buyer_partner."id" = eligibility."buyer_partner_id"
             and buyer_partner."tenant_id" = eligibility."buyer_tenant_id"
             and buyer_partner."kind" = 'buyer' and buyer_partner."status" = 'approved'
            join "marketplace_partner_memberships" buyer_membership
              on buyer_membership."partner_id" = eligibility."buyer_partner_id"
             and buyer_membership."tenant_id" = eligibility."buyer_tenant_id"
             and buyer_membership."user_id" = eligibility."buyer_user_id"
             and buyer_membership."capability" = 'buyer' and buyer_membership."status" = 'active'
            join "agritech_partners" seller_partner
              on seller_partner."id" = eligibility."seller_partner_id"
             and seller_partner."tenant_id" = eligibility."seller_tenant_id"
             and seller_partner."kind" = 'supplier' and seller_partner."status" = 'approved'
            join "marketplace_partner_memberships" seller_membership
              on seller_membership."partner_id" = eligibility."seller_partner_id"
             and seller_membership."tenant_id" = eligibility."seller_tenant_id"
             and seller_membership."capability" = 'seller' and seller_membership."status" = 'active'
            join "marketplace_verifications" verification
              on verification."tenant_id" = eligibility."buyer_tenant_id"
             and verification."user_id" = eligibility."buyer_user_id"
             and verification."role" = 'buyer' and verification."status" = 'verified'
           where eligibility."id" = new."review_eligibility_id"
             and eligibility."source_publication_id" = new."listing_publication_id"
             and eligibility."source_kind" = new."source_kind"
             and eligibility."buyer_tenant_id" = new."buyer_tenant_id"
             and eligibility."buyer_user_id" = new."buyer_user_id"
             and eligibility."buyer_partner_id" = new."buyer_partner_id"
             and eligibility."seller_tenant_id" = new."seller_tenant_id"
             and eligibility."seller_partner_id" = new."seller_partner_id"
             and publication."tenant_id" = new."seller_tenant_id"
             and publication."source_kind" = new."source_kind"
             and ((new."source_kind" = 'product' and eligibility."source_id" = new."product_id"
               and publication."product_id" = new."product_id")
               or (new."source_kind" = 'produce' and eligibility."source_id" = new."produce_listing_id"
               and publication."produce_listing_id" = new."produce_listing_id"))
        ) then
          raise exception 'marketplace review eligibility is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_listing_reviews__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_listing_reviews__coherence"
        before insert on "marketplace_listing_reviews"
        for each row execute function "assert_marketplace_listing_review_coherence"();
    `);

    this.addSql(`
      create function "assert_marketplace_review_reply_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_listing_reviews" review
          join "marketplace_partner_memberships" membership
            on membership."partner_id" = review."seller_partner_id"
           and membership."tenant_id" = review."seller_tenant_id"
           and membership."user_id" = new."seller_user_id"
           and membership."capability" = 'seller' and membership."status" = 'active'
          join "marketplace_verifications" verification
            on verification."tenant_id" = membership."tenant_id"
           and verification."user_id" = membership."user_id"
           and verification."status" = 'verified' and verification."role" in ('farmer', 'seller')
          where review."id" = new."review_id" and review."visibility" = 'visible'
            and review."seller_tenant_id" = new."seller_tenant_id"
            and review."seller_partner_id" = new."seller_partner_id"
        ) then
          raise exception 'marketplace review reply seller is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_review_replies__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_review_replies__coherence"
        before insert on "marketplace_review_replies"
        for each row execute function "assert_marketplace_review_reply_coherence"();
    `);

    this.addSql(`
      create function "assert_marketplace_review_report_coherence"() returns trigger as $$
      begin
        if not exists (select 1 from "marketplace_listing_reviews" review
          where review."id" = new."review_id" and review."visibility" = 'visible'
            and review."seller_tenant_id" = new."moderation_tenant_id") then
          raise exception 'marketplace review report tenant is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_review_reports__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_review_reports__coherence"
        before insert on "marketplace_review_reports"
        for each row execute function "assert_marketplace_review_report_coherence"();
    `);

    this.addSql(`
      create function "guard_marketplace_engagement_parent_identity"() returns trigger as $$
      declare
        old_row jsonb := to_jsonb(old);
        new_row jsonb := to_jsonb(new);
        old_id uuid := (to_jsonb(old)->>'id')::uuid;
      begin
        if tg_table_name = 'marketplace_listing_publications' and exists (
          select 1 from "marketplace_listing_samples" sample where sample."listing_publication_id" = old_id
          union all select 1 from "marketplace_listing_reviews" review where review."listing_publication_id" = old_id
        ) and (old_row->>'tenant_id', old_row->>'owner_user_id', old_row->>'seller_public_id',
          old_row->>'source_kind', old_row->>'product_id', old_row->>'produce_listing_id') is distinct from
          (new_row->>'tenant_id', new_row->>'owner_user_id', new_row->>'seller_public_id',
          new_row->>'source_kind', new_row->>'product_id', new_row->>'produce_listing_id') then
          raise exception 'engaged publication identity is immutable';
        elsif tg_table_name = 'marketplace_public_sellers' and exists (
          select 1 from "marketplace_listing_publications" publication
          join "marketplace_listing_samples" sample on sample."listing_publication_id" = publication."id"
          where publication."seller_public_id" = old_id
          union all select 1 from "marketplace_listing_publications" publication
          join "marketplace_listing_reviews" review on review."listing_publication_id" = publication."id"
          where publication."seller_public_id" = old_id
        ) and (old_row->>'tenant_id', old_row->>'partner_id', old_row->>'owner_user_id') is distinct from
          (new_row->>'tenant_id', new_row->>'partner_id', new_row->>'owner_user_id') then
          raise exception 'engaged seller identity is immutable';
        elsif tg_table_name = 'products' and exists (
          select 1 from "marketplace_listing_samples" sample where sample."product_id" = old_id
          union all select 1 from "marketplace_listing_reviews" review where review."product_id" = old_id
        ) and (old_row->>'tenant_id', old_row->>'supplier_id') is distinct from
          (new_row->>'tenant_id', new_row->>'supplier_id') then
          raise exception 'engaged product identity is immutable';
        elsif tg_table_name = 'produce_listings' and exists (
          select 1 from "marketplace_listing_samples" sample where sample."produce_listing_id" = old_id
          union all select 1 from "marketplace_listing_reviews" review where review."produce_listing_id" = old_id
        ) and (old_row->>'tenant_id', old_row->>'farmer_id') is distinct from
          (new_row->>'tenant_id', new_row->>'farmer_id') then
          raise exception 'engaged produce identity is immutable';
        elsif tg_table_name = 'agritech_partners' and exists (
          select 1 from "marketplace_listing_samples" sample
            where sample."requester_partner_id" = old_id or sample."seller_partner_id" = old_id
          union all select 1 from "marketplace_listing_reviews" review
            where review."buyer_partner_id" = old_id or review."seller_partner_id" = old_id
        ) and (old_row->>'tenant_id', old_row->>'owner_user_id', old_row->>'kind') is distinct from
          (new_row->>'tenant_id', new_row->>'owner_user_id', new_row->>'kind') then
          raise exception 'engaged partner identity is immutable';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    for (const [table, columns, trigger] of [
      [
        'marketplace_listing_publications',
        'tenant_id, owner_user_id, seller_public_id, source_kind, product_id, produce_listing_id',
        'tr__marketplace_publications__engagement_identity',
      ],
      [
        'marketplace_public_sellers',
        'tenant_id, partner_id, owner_user_id',
        'tr__marketplace_sellers__engagement_identity',
      ],
      ['products', 'tenant_id, supplier_id', 'tr__products__engagement_identity'],
      ['produce_listings', 'tenant_id, farmer_id', 'tr__produce__engagement_identity'],
      ['agritech_partners', 'tenant_id, owner_user_id, kind', 'tr__partners__engagement_identity'],
    ] as const) {
      this.addSql(`
        create trigger "${trigger}" before update of ${columns} on "${table}"
          for each row execute function "guard_marketplace_engagement_parent_identity"();
      `);
    }
  }

  private addGuardsAndAggregateTrigger(): void {
    this.addSql(`
      create function "reject_marketplace_engagement_mutation"() returns trigger as $$
      begin
        raise exception 'marketplace engagement history is immutable'
          using errcode = '23514', constraint = 'ck__marketplace_engagement__immutable';
      end;
      $$ language plpgsql;
    `);
    for (const table of [
      ['marketplace_engagement_events', 'tr__marketplace_engagement_events__immutable'],
      ['marketplace_engagement_notification_intents', 'tr__marketplace_engagement_notification__immutable'],
      ['marketplace_engagement_operations', 'tr__marketplace_engagement_operations__immutable'],
      ['marketplace_review_replies', 'tr__marketplace_review_replies__immutable'],
    ] as const) {
      this.addSql(`
        create trigger "${table[1]}" before update or delete on "${table[0]}"
          for each row execute function "reject_marketplace_engagement_mutation"();
      `);
    }

    this.addSql(`
      create function "guard_marketplace_sample_policy"() returns trigger as $$
      begin
        if tg_op = 'DELETE' or old."id" <> new."id" or old."tenant_id" <> new."tenant_id"
          or old."version" <> new."version" or old."monthly_limit" <> new."monthly_limit"
          or old."activated_by_user_id" <> new."activated_by_user_id"
          or old."active_from" <> new."active_from" or old."created_at" <> new."created_at"
          or old."active" = false or new."active" <> false or new."retired_at" is null then
          raise exception 'marketplace sample policy is immutable except retirement'
            using errcode = '23514', constraint = 'ck__marketplace_sample_policies__immutable';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_sample_policies__guard"
        before update or delete on "marketplace_sample_policies"
        for each row execute function "guard_marketplace_sample_policy"();
    `);

    this.addSql(`
      create function "guard_marketplace_listing_sample"() returns trigger as $$
      begin
        if tg_op = 'DELETE' or old."id" <> new."id"
          or old."listing_publication_id" <> new."listing_publication_id"
          or old."source_kind" <> new."source_kind" or old."product_id" is distinct from new."product_id"
          or old."produce_listing_id" is distinct from new."produce_listing_id"
          or old."requester_tenant_id" <> new."requester_tenant_id"
          or old."requester_user_id" <> new."requester_user_id"
          or old."requester_partner_id" <> new."requester_partner_id"
          or old."seller_tenant_id" <> new."seller_tenant_id"
          or old."seller_user_id" <> new."seller_user_id"
          or old."seller_partner_id" <> new."seller_partner_id"
          or old."season_key" <> new."season_key" or old."month_key" <> new."month_key"
          or old."policy_id" <> new."policy_id" or old."policy_version" <> new."policy_version"
          or old."monthly_limit" <> new."monthly_limit" or old."delivery_method" <> new."delivery_method"
          or old."item_price_uzs" <> new."item_price_uzs" or old."created_at" <> new."created_at"
          or new."revision" <> old."revision" + 1 then
          raise exception 'marketplace sample identity or revision is invalid'
            using errcode = '23514', constraint = 'ck__marketplace_listing_samples__identity';
        end if;
        if not ((old."status" = 'requested' and new."status" in ('approved', 'declined', 'cancelled'))
          or (old."status" = 'approved' and new."status" = 'shipped')
          or (old."status" = 'shipped' and new."status" = 'received')
          or (old."status" = 'received' and new."status" = 'received'
            and old."feedback_at" is null and new."feedback_at" is not null)) then
          raise exception 'marketplace sample transition is invalid'
            using errcode = '23514', constraint = 'ck__marketplace_listing_samples__transition';
        end if;
        if old."status" <> 'requested' and old."delivery_quote_uzs" is distinct from new."delivery_quote_uzs" then
          raise exception 'marketplace sample delivery quote is frozen'
            using errcode = '23514', constraint = 'ck__marketplace_listing_samples__quote';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_listing_samples__guard"
        before update or delete on "marketplace_listing_samples"
        for each row execute function "guard_marketplace_listing_sample"();
    `);

    this.addSql(`
      create function "guard_marketplace_listing_review"() returns trigger as $$
      begin
        if tg_op = 'DELETE' or old."id" <> new."id"
          or old."listing_publication_id" <> new."listing_publication_id"
          or old."source_kind" <> new."source_kind" or old."product_id" is distinct from new."product_id"
          or old."produce_listing_id" is distinct from new."produce_listing_id"
          or old."review_eligibility_id" <> new."review_eligibility_id"
          or old."buyer_tenant_id" <> new."buyer_tenant_id" or old."buyer_user_id" <> new."buyer_user_id"
          or old."buyer_partner_id" <> new."buyer_partner_id" or old."seller_tenant_id" <> new."seller_tenant_id"
          or old."seller_partner_id" <> new."seller_partner_id" or old."rating" <> new."rating"
          or old."comment" is distinct from new."comment" or old."asset_references" <> new."asset_references"
          or old."verified_deal" <> new."verified_deal" or old."created_at" <> new."created_at"
          or old."visibility" <> 'visible' or new."visibility" <> 'hidden'
          or new."revision" <> old."revision" + 1 then
          raise exception 'marketplace review is immutable except one moderation hide'
            using errcode = '23514', constraint = 'ck__marketplace_listing_reviews__immutable';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_listing_reviews__guard"
        before update or delete on "marketplace_listing_reviews"
        for each row execute function "guard_marketplace_listing_review"();
    `);

    this.addSql(`
      create function "refresh_marketplace_review_aggregate"() returns trigger as $$
      begin
        perform pg_advisory_xact_lock(hashtextextended(
          'marketplace-review-aggregate:' || new."listing_publication_id"::text, 0));
        if tg_op = 'INSERT' and new."visibility" = 'visible' then
          insert into "marketplace_review_aggregates"
            ("listing_publication_id", "review_count", "rating_sum", "revision", "updated_at")
          values (new."listing_publication_id", 1, new."rating", 1, now())
          on conflict ("listing_publication_id") do update
            set "review_count" = "marketplace_review_aggregates"."review_count" + 1,
                "rating_sum" = "marketplace_review_aggregates"."rating_sum" + excluded."rating_sum",
                "revision" = "marketplace_review_aggregates"."revision" + 1, "updated_at" = now();
        elsif tg_op = 'UPDATE' and old."visibility" = 'visible' and new."visibility" = 'hidden' then
          update "marketplace_review_aggregates"
            set "review_count" = "review_count" - 1,
                "rating_sum" = "rating_sum" - old."rating",
                "revision" = "revision" + 1, "updated_at" = now()
          where "listing_publication_id" = new."listing_publication_id";
          if not found then
            raise exception 'marketplace review aggregate is missing'
              using errcode = '23514', constraint = 'ck__marketplace_review_aggregates__missing';
          end if;
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_listing_reviews__aggregate"
        after insert or update of "visibility" on "marketplace_listing_reviews"
        for each row execute function "refresh_marketplace_review_aggregate"();
    `);

    this.addSql(`
      create function "guard_marketplace_review_report"() returns trigger as $$
      begin
        if tg_op = 'DELETE' or old."id" <> new."id" or old."review_id" <> new."review_id"
          or old."moderation_tenant_id" <> new."moderation_tenant_id"
          or old."reporter_tenant_id" <> new."reporter_tenant_id"
          or old."reporter_user_id" <> new."reporter_user_id" or old."reason" <> new."reason"
          or old."comment" is distinct from new."comment" or old."review_snapshot" <> new."review_snapshot"
          or old."created_at" <> new."created_at" or old."status" <> 'pending'
          or new."status" not in ('dismissed', 'hidden') or new."revision" <> 1 then
          raise exception 'marketplace review report decision is invalid'
            using errcode = '23514', constraint = 'ck__marketplace_review_reports__immutable';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_review_reports__guard"
        before update or delete on "marketplace_review_reports"
        for each row execute function "guard_marketplace_review_report"();
    `);
  }
}
