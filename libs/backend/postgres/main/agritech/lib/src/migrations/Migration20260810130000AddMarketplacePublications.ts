// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018
import { Migration } from '@mikro-orm/migrations';

export class Migration20260810130000AddMarketplacePublications extends Migration {
  override up(): void {
    this.addSql(`
      alter table "produce_listings"
        add constraint "ck__produce_listings__price_per_kg_uzs_integer"
        check ("price_per_kg_uzs" between 1 and 9999999999999 and "price_per_kg_uzs" = trunc("price_per_kg_uzs"));
    `);
    this.addSql(`
      create table "marketplace_produce_organization_bindings" (
        "produce_listing_id" uuid not null,
        "tenant_id" varchar(100) not null,
        "farmer_id" uuid not null,
        "owner_user_id" varchar(100) not null,
        "supplier_partner_id" uuid not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_produce_organization_bindings_pkey" primary key ("produce_listing_id"),
        constraint "fk__marketplace_produce_org_bindings__produce_listing_id"
          foreign key ("produce_listing_id") references "produce_listings" ("id") on update cascade on delete cascade,
        constraint "fk__marketplace_produce_org_bindings__supplier_partner_id"
          foreign key ("supplier_partner_id") references "agritech_partners" ("id") on delete restrict
      );
    `);
    this.addSql(`
      create index "ix__marketplace_produce_organization_bindings__tenant_f6c7985c"
        on "marketplace_produce_organization_bindings" ("tenant_id", "owner_user_id", "supplier_partner_id");
    `);
    this.addSql(`
      create table "marketplace_request_organization_bindings" (
        "request_id" uuid not null,
        "tenant_id" varchar(100) not null,
        "buyer_user_id" varchar(100) not null,
        "buyer_partner_id" uuid not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_request_organization_bindings_pkey" primary key ("request_id"),
        constraint "fk__marketplace_request_org_bindings__request_id"
          foreign key ("request_id") references "marketplace_requests" ("id") on update cascade on delete cascade,
        constraint "fk__marketplace_request_org_bindings__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict
      );
    `);
    this.addSql(`
      create index "ix__marketplace_request_organization_bindings__tenant_6d3c71e4"
        on "marketplace_request_organization_bindings" ("tenant_id", "buyer_user_id", "buyer_partner_id");
    `);
    this.addSql(`
      create function "enforce_marketplace_source_org_binding_immutability"() returns trigger as $$
      begin
        if to_jsonb(new) is distinct from to_jsonb(old) then
          raise exception 'marketplace source organization binding is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_source_org_bindings__immutable';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_produce_org_bindings__immutable"
        before update on "marketplace_produce_organization_bindings"
        for each row execute function "enforce_marketplace_source_org_binding_immutability"();
    `);
    this.addSql(`
      create trigger "tr__marketplace_request_org_bindings__immutable"
        before update on "marketplace_request_organization_bindings"
        for each row execute function "enforce_marketplace_source_org_binding_immutability"();
    `);

    this.addSql(`
      create table "marketplace_public_sellers" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "partner_id" uuid not null,
        "partner_kind" varchar(20) not null default 'supplier',
        "owner_user_id" varchar(100) not null,
        "content_revision" int not null default 1,
        "status" varchar(20) not null default 'published',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_public_sellers_pkey" primary key ("id"),
        constraint "fk__marketplace_public_sellers__partner_id"
          foreign key ("partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "uq__marketplace_public_sellers__partner_id" unique ("partner_id"),
        constraint "uq__marketplace_public_sellers__id_tenant_id" unique ("id", "tenant_id"),
        constraint "ck__marketplace_public_sellers__status"
          check ("status" in ('published', 'paused')),
        constraint "ck__marketplace_public_sellers__partner_kind"
          check ("partner_kind" = 'supplier'),
        constraint "ck__marketplace_public_sellers__content_revision"
          check ("content_revision" >= 1)
      );
    `);
    this.addSql(`
      create index "ix__marketplace_public_sellers__tenant_id_owner_user_id"
        on "marketplace_public_sellers" ("tenant_id", "owner_user_id");
    `);
    this.addSql(`
      create index "ix__marketplace_public_sellers__status"
        on "marketplace_public_sellers" ("status");
    `);

    this.addSql(`
      create table "marketplace_public_seller_revisions" (
        "id" uuid not null,
        "seller_public_id" uuid not null,
        "tenant_id" varchar(100) not null,
        "content_revision" int not null,
        "content_fingerprint" varchar(64) not null,
        "display_name" varchar(200) not null,
        "description" varchar(2000) null,
        "region" varchar(100) not null,
        "moderation_status" varchar(20) not null default 'pending',
        "moderated_by" varchar(100) null,
        "moderated_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_public_seller_revisions_pkey" primary key ("id"),
        constraint "fk__marketplace_public_seller_revisions__seller_public_id"
          foreign key ("seller_public_id") references "marketplace_public_sellers" ("id") on delete cascade,
        constraint "uq__marketplace_public_seller_revisions__seller_revision"
          unique ("seller_public_id", "content_revision"),
        constraint "uq__marketplace_public_seller_revisions__seller_fingerprint"
          unique ("seller_public_id", "content_fingerprint"),
        constraint "ck__marketplace_public_seller_revisions__content"
          check (btrim("display_name") <> ''),
        constraint "ck__marketplace_public_seller_revisions__revision"
          check ("content_revision" >= 1),
        constraint "ck__marketplace_public_seller_revisions__moderation" check (
          ("moderation_status" = 'pending' and "moderated_by" is null and "moderated_at" is null)
          or ("moderation_status" in ('approved', 'rejected') and "moderated_by" is not null and "moderated_at" is not null)
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_public_seller_revisions__tenant_id_mod_44b6dbde"
        on "marketplace_public_seller_revisions" ("tenant_id", "moderation_status", "created_at");
    `);
    this.addSql(`
      create function "enforce_marketplace_public_seller_revision_immutability"() returns trigger as $$
      begin
        if new."seller_public_id" is distinct from old."seller_public_id"
          or new."tenant_id" is distinct from old."tenant_id"
          or new."content_revision" is distinct from old."content_revision"
          or new."content_fingerprint" is distinct from old."content_fingerprint"
          or new."display_name" is distinct from old."display_name"
          or new."description" is distinct from old."description"
          or new."region" is distinct from old."region"
          or new."created_at" is distinct from old."created_at"
        then
          raise exception 'marketplace public seller revision content is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_public_seller_revisions__immutable_content';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_public_seller_revisions__immutable_content"
        before update on "marketplace_public_seller_revisions"
        for each row execute function "enforce_marketplace_public_seller_revision_immutability"();
    `);

    this.addSql(`
      create table "marketplace_listing_publications" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "owner_user_id" varchar(100) not null,
        "seller_public_id" uuid not null,
        "seller_revision_id" uuid not null,
        "seller_content_revision" int not null,
        "product_id" uuid null,
        "produce_listing_id" uuid null,
        "source_kind" varchar(20) not null,
        "section" varchar(20) not null,
        "public_title" varchar(200) not null,
        "public_title_ru" varchar(200) null,
        "public_title_uz" varchar(200) null,
        "public_title_uz_cyrl" varchar(200) null,
        "public_description" text null,
        "public_category" varchar(30) null,
        "public_crop" varchar(50) null,
        "public_grade" varchar(1) null,
        "public_unit" varchar(50) not null,
        "public_region" varchar(100) not null,
        "public_images" jsonb not null default '[]'::jsonb,
        "content_fingerprint" varchar(64) not null,
        "content_revision" int not null default 1,
        "status" varchar(20) not null default 'published',
        "moderation_status" varchar(20) not null default 'pending',
        "moderated_by" varchar(100) null,
        "moderated_at" timestamptz null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "revision" int not null default 0,
        "published_at" timestamptz null default now(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_listing_publications_pkey" primary key ("id"),
        constraint "fk__marketplace_listing_publications__seller_public_id"
          foreign key ("seller_public_id") references "marketplace_public_sellers" ("id") on delete restrict,
        constraint "fk__marketplace_listing_publications__seller_revision_id"
          foreign key ("seller_revision_id") references "marketplace_public_seller_revisions" ("id") on delete restrict,
        constraint "fk__marketplace_listing_publications__product_id"
          foreign key ("product_id") references "products" ("id") on delete restrict,
        constraint "fk__marketplace_listing_publications__produce_listing_id"
          foreign key ("produce_listing_id") references "produce_listings" ("id") on delete restrict,
        constraint "uq__marketplace_listing_publications__product_id" unique ("product_id"),
        constraint "uq__marketplace_listing_publications__produce_listing_id" unique ("produce_listing_id"),
        constraint "uq__marketplace_listing_publications__tenant_id_owner_65e6b9c7"
          unique ("tenant_id", "owner_user_id", "idempotency_key"),
        constraint "ck__marketplace_listing_publications__source_kind"
          check ("source_kind" in ('product', 'produce')),
        constraint "ck__marketplace_listing_publications__section"
          check ("section" in ('equipment', 'seeds', 'produce')),
        constraint "ck__marketplace_listing_publications__status"
          check ("status" in ('published', 'paused', 'rejected')),
        constraint "ck__marketplace_listing_publications__revision"
          check ("revision" >= 0),
        constraint "ck__marketplace_listing_publications__content"
          check (btrim("public_title") <> '' and btrim("public_unit") <> '' and btrim("public_region") <> ''
            and "content_revision" >= 1 and "seller_content_revision" >= 1
            and jsonb_typeof("public_images") = 'array'
            and jsonb_array_length("public_images") <= 5),
        constraint "ck__marketplace_listing_publications__moderation" check (
          ("moderation_status" = 'pending' and "moderated_by" is null and "moderated_at" is null)
          or ("moderation_status" in ('approved', 'rejected') and "moderated_by" is not null and "moderated_at" is not null)
        ),
        constraint "ck__marketplace_listing_publications__source_pair" check (
          ("source_kind" = 'product' and "product_id" is not null and "produce_listing_id" is null
            and "section" <> 'produce' and "public_category" is not null
            and "public_crop" is null and "public_grade" is null)
          or ("source_kind" = 'produce' and "product_id" is null and "produce_listing_id" is not null
            and "section" = 'produce' and "public_category" is null
            and "public_crop" is not null and "public_grade" is not null)
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_listing_publications__status_section_p_5b33d9c2"
        on "marketplace_listing_publications" ("status", "section", "published_at");
    `);
    this.addSql(`
      create index "ix__marketplace_listing_publications__seller_public_id_status"
        on "marketplace_listing_publications" ("seller_public_id", "status");
    `);
    this.addSql(`
      create index "ix__marketplace_listing_publications__tenant_id_owner_user_id"
        on "marketplace_listing_publications" ("tenant_id", "owner_user_id");
    `);

    this.addSql(`
      create table "marketplace_request_publications" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "buyer_user_id" varchar(100) not null,
        "buyer_partner_id" uuid not null,
        "request_id" uuid not null,
        "buyer_display_name" varchar(200) not null,
        "public_title" varchar(200) not null,
        "public_product" varchar(200) null,
        "public_volume" varchar(100) null,
        "public_region" varchar(100) not null,
        "public_deadline" date null,
        "public_budget_uzs" numeric(15,0) null,
        "public_requirements" varchar(5000) null,
        "content_fingerprint" varchar(64) not null,
        "content_revision" int not null default 1,
        "status" varchar(20) not null default 'published',
        "moderation_status" varchar(20) not null default 'pending',
        "moderated_by" varchar(100) null,
        "moderated_at" timestamptz null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "revision" int not null default 0,
        "published_at" timestamptz null default now(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_request_publications_pkey" primary key ("id"),
        constraint "fk__marketplace_request_publications__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "fk__marketplace_request_publications__request_id"
          foreign key ("request_id") references "marketplace_requests" ("id") on delete restrict,
        constraint "uq__marketplace_request_publications__request_id" unique ("request_id"),
        constraint "uq__marketplace_request_publications__tenant_id_buyer_84329ad6"
          unique ("tenant_id", "buyer_user_id", "idempotency_key"),
        constraint "ck__marketplace_request_publications__status"
          check ("status" in ('published', 'paused', 'rejected')),
        constraint "ck__marketplace_request_publications__revision"
          check ("revision" >= 0),
        constraint "ck__marketplace_request_publications__buyer_display_name"
          check (btrim("buyer_display_name") <> ''),
        constraint "ck__marketplace_request_publications__public_text"
          check (btrim("public_title") <> '' and btrim("public_region") <> ''),
        constraint "ck__marketplace_request_publications__public_budget"
          check ("public_budget_uzs" is null or "public_budget_uzs" between 1 and 9999999999999),
        constraint "ck__marketplace_request_publications__content_revision"
          check ("content_revision" >= 1),
        constraint "ck__marketplace_request_publications__moderation" check (
          ("moderation_status" = 'pending' and "moderated_by" is null and "moderated_at" is null)
          or ("moderation_status" in ('approved', 'rejected') and "moderated_by" is not null and "moderated_at" is not null)
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_request_publications__status_published_at"
        on "marketplace_request_publications" ("status", "published_at");
    `);
    this.addSql(`
      create index "ix__marketplace_request_publications__tenant_id_buyer_user_id"
        on "marketplace_request_publications" ("tenant_id", "buyer_user_id");
    `);

    this.addSql(`
      create table "marketplace_publication_moderation_operations" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "reviewer_user_id" varchar(100) not null,
        "publication_kind" varchar(20) not null,
        "publication_id" uuid not null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "result_snapshot" jsonb not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_publication_moderation_operations_pkey" primary key ("id"),
        constraint "uq__marketplace_publication_moderation_ops__tenant_reviewer_key"
          unique ("tenant_id", "reviewer_user_id", "idempotency_key"),
        constraint "ck__marketplace_publication_moderation_ops__kind"
          check ("publication_kind" in ('listing', 'request', 'seller_profile')),
        constraint "ck__marketplace_publication_moderation_ops__snapshot"
          check (jsonb_typeof("result_snapshot") = 'object')
      );
    `);
    this.addSql(`
      create index "ix__marketplace_publication_moderation_operations__ten_f5d17cba"
        on "marketplace_publication_moderation_operations" ("tenant_id", "publication_kind", "publication_id");
    `);

    this.addSql(`
      create function "assert_marketplace_public_seller_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "agritech_partners" partner
           where partner."id" = new."partner_id"
             and partner."tenant_id" = new."tenant_id"
             and partner."owner_user_id" = new."owner_user_id"
             and partner."kind" = new."partner_kind"
        ) then
          raise exception 'marketplace public seller organization mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_public_sellers__organization_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_public_sellers__organization_coherence"
        after insert or update on "marketplace_public_sellers"
        deferrable initially immediate for each row
        execute function "assert_marketplace_public_seller_coherence"();
    `);

    this.addSql(`
      create function "assert_marketplace_listing_publication_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_public_sellers" seller
          join "marketplace_public_seller_revisions" revision
            on revision."id" = new."seller_revision_id"
           where seller."id" = new."seller_public_id"
             and seller."tenant_id" = new."tenant_id"
             and seller."owner_user_id" = new."owner_user_id"
             and revision."seller_public_id" = seller."id"
             and revision."tenant_id" = seller."tenant_id"
             and revision."content_revision" = new."seller_content_revision"
        ) then
          raise exception 'marketplace listing seller mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_listing_publications__seller_coherence';
        end if;
        if new."source_kind" = 'product' and not exists (
          select 1 from "products" product
          join "marketplace_public_sellers" seller on seller."id" = new."seller_public_id"
           where product."id" = new."product_id"
             and product."tenant_id" = new."tenant_id"
             and product."supplier_id" = seller."partner_id"::text
        ) then
          raise exception 'marketplace product publication source mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_listing_publications__product_coherence';
        end if;
        if new."source_kind" = 'produce' and not exists (
          select 1 from "produce_listings" produce
          join "farmers" farmer on farmer."id" = produce."farmer_id"
          join "marketplace_public_sellers" seller on seller."id" = new."seller_public_id"
          join "marketplace_produce_organization_bindings" binding
            on binding."produce_listing_id" = produce."id"
           where produce."id" = new."produce_listing_id"
             and produce."tenant_id" = new."tenant_id"
             and farmer."tenant_id" = new."tenant_id"
             and farmer."user_id" = new."owner_user_id"
             and seller."owner_user_id" = farmer."user_id"
             and binding."tenant_id" = new."tenant_id"
             and binding."farmer_id" = farmer."id"
             and binding."owner_user_id" = new."owner_user_id"
             and binding."supplier_partner_id" = seller."partner_id"
        ) then
          raise exception 'marketplace produce publication source mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_listing_publications__produce_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_listing_publications__coherence"
        after insert or update on "marketplace_listing_publications"
        deferrable initially immediate for each row
        execute function "assert_marketplace_listing_publication_coherence"();
    `);

    this.addSql(`
      create function "assert_marketplace_request_publication_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_requests" request
          join "agritech_partners" partner on partner."id" = new."buyer_partner_id"
          join "marketplace_request_organization_bindings" binding on binding."request_id" = request."id"
           where request."id" = new."request_id"
             and request."tenant_id" = new."tenant_id"
             and request."buyer_user_id" = new."buyer_user_id"
             and partner."tenant_id" = new."tenant_id"
             and partner."owner_user_id" = new."buyer_user_id"
             and partner."kind" = 'buyer'
             and binding."tenant_id" = new."tenant_id"
             and binding."buyer_user_id" = new."buyer_user_id"
             and binding."buyer_partner_id" = new."buyer_partner_id"
        ) then
          raise exception 'marketplace request publication party mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_request_publications__party_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_request_publications__party_coherence"
        after insert or update on "marketplace_request_publications"
        deferrable initially immediate for each row
      execute function "assert_marketplace_request_publication_coherence"();
    `);

    this.addSql(`
      create function "assert_marketplace_produce_org_binding_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "produce_listings" produce
          join "farmers" farmer on farmer."id" = produce."farmer_id"
          join "agritech_partners" partner on partner."id" = new."supplier_partner_id"
           where produce."id" = new."produce_listing_id"
             and produce."tenant_id" = new."tenant_id"
             and produce."farmer_id" = new."farmer_id"
             and farmer."tenant_id" = new."tenant_id"
             and farmer."user_id" = new."owner_user_id"
             and partner."tenant_id" = new."tenant_id"
             and partner."owner_user_id" = new."owner_user_id"
             and partner."kind" = 'supplier'
        ) then
          raise exception 'marketplace produce organization binding mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_produce_org_bindings__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_produce_org_bindings__coherence"
        after insert or update on "marketplace_produce_organization_bindings"
        deferrable initially immediate for each row
        execute function "assert_marketplace_produce_org_binding_coherence"();
    `);
    this.addSql(`
      create function "assert_marketplace_request_org_binding_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "marketplace_requests" request
          join "agritech_partners" partner on partner."id" = new."buyer_partner_id"
           where request."id" = new."request_id"
             and request."tenant_id" = new."tenant_id"
             and request."buyer_user_id" = new."buyer_user_id"
             and partner."tenant_id" = new."tenant_id"
             and partner."owner_user_id" = new."buyer_user_id"
             and partner."kind" = 'buyer'
        ) then
          raise exception 'marketplace request organization binding mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_request_org_bindings__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_request_org_bindings__coherence"
        after insert or update on "marketplace_request_organization_bindings"
        deferrable initially immediate for each row
        execute function "assert_marketplace_request_org_binding_coherence"();
    `);
    this.addSql(`
      create function "assert_marketplace_partner_parent_coherence"() returns trigger as $$
      begin
        if exists (
          select 1 from "marketplace_public_sellers" seller
           where seller."partner_id" = new."id"
             and (seller."tenant_id", seller."owner_user_id", seller."partner_kind")
               is distinct from (new."tenant_id", new."owner_user_id", new."kind")
        ) or exists (
          select 1 from "marketplace_produce_organization_bindings" binding
           where binding."supplier_partner_id" = new."id"
             and (binding."tenant_id", binding."owner_user_id", 'supplier')
               is distinct from (new."tenant_id", new."owner_user_id", new."kind")
        ) or exists (
          select 1 from "marketplace_request_organization_bindings" binding
           where binding."buyer_partner_id" = new."id"
             and (binding."tenant_id", binding."buyer_user_id", 'buyer')
               is distinct from (new."tenant_id", new."owner_user_id", new."kind")
        ) then
          raise exception 'marketplace referenced partner identity is immutable'
            using errcode = '23514', constraint = 'ck__agritech_partners__marketplace_reference_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__agritech_partners__marketplace_reference_coherence"
        after update of "tenant_id", "owner_user_id", "kind" on "agritech_partners"
        deferrable initially immediate for each row
        execute function "assert_marketplace_partner_parent_coherence"();
    `);
    this.addSql(`
      create function "assert_marketplace_product_parent_coherence"() returns trigger as $$
      begin
        if exists (
          select 1 from "marketplace_listing_publications" publication
          join "marketplace_public_sellers" seller on seller."id" = publication."seller_public_id"
           where publication."product_id" = new."id"
             and (publication."tenant_id" <> new."tenant_id" or seller."partner_id"::text <> new."supplier_id")
        ) then
          raise exception 'marketplace published product identity is immutable'
            using errcode = '23514', constraint = 'ck__products__marketplace_publication_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__products__marketplace_publication_coherence"
        after update of "tenant_id", "supplier_id" on "products"
        deferrable initially immediate for each row
        execute function "assert_marketplace_product_parent_coherence"();
    `);
    this.addSql(`
      create function "assert_marketplace_produce_parent_coherence"() returns trigger as $$
      begin
        if exists (
          select 1 from "marketplace_produce_organization_bindings" binding
           where binding."produce_listing_id" = new."id"
             and (binding."tenant_id", binding."farmer_id")
               is distinct from (new."tenant_id", new."farmer_id")
        ) then
          raise exception 'marketplace bound produce identity is immutable'
            using errcode = '23514', constraint = 'ck__produce_listings__marketplace_binding_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__produce_listings__marketplace_binding_coherence"
        after update of "tenant_id", "farmer_id" on "produce_listings"
        deferrable initially immediate for each row
        execute function "assert_marketplace_produce_parent_coherence"();
    `);
    this.addSql(`
      create function "assert_marketplace_request_parent_coherence"() returns trigger as $$
      begin
        if exists (
          select 1 from "marketplace_request_organization_bindings" binding
           where binding."request_id" = new."id"
             and (binding."tenant_id", binding."buyer_user_id")
               is distinct from (new."tenant_id", new."buyer_user_id")
        ) then
          raise exception 'marketplace bound request identity is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_requests__organization_binding_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_requests__organization_binding_coherence"
        after update of "tenant_id", "buyer_user_id" on "marketplace_requests"
        deferrable initially immediate for each row
        execute function "assert_marketplace_request_parent_coherence"();
    `);
  }

  override down(): void {
    // Publication deletion is reversible only before Stage 2 public traffic.
    this.addSql(`drop trigger "ct__marketplace_requests__organization_binding_coherence" on "marketplace_requests";`);
    this.addSql(`drop trigger "ct__produce_listings__marketplace_binding_coherence" on "produce_listings";`);
    this.addSql(`drop trigger "ct__products__marketplace_publication_coherence" on "products";`);
    this.addSql(`drop trigger "ct__agritech_partners__marketplace_reference_coherence" on "agritech_partners";`);
    this.addSql(`drop table if exists "marketplace_publication_moderation_operations";`);
    this.addSql(`drop table if exists "marketplace_request_publications";`);
    this.addSql(`drop table if exists "marketplace_listing_publications";`);
    this.addSql(`drop table if exists "marketplace_public_seller_revisions";`);
    this.addSql(`drop table if exists "marketplace_public_sellers";`);
    this.addSql(`drop table if exists "marketplace_request_organization_bindings";`);
    this.addSql(`drop table if exists "marketplace_produce_organization_bindings";`);
    this.addSql(`drop function "enforce_marketplace_source_org_binding_immutability"();`);
    this.addSql(`drop function "enforce_marketplace_public_seller_revision_immutability"();`);
    this.addSql(`drop function "assert_marketplace_request_org_binding_coherence"();`);
    this.addSql(`drop function "assert_marketplace_produce_org_binding_coherence"();`);
    this.addSql(`drop function "assert_marketplace_request_parent_coherence"();`);
    this.addSql(`drop function "assert_marketplace_produce_parent_coherence"();`);
    this.addSql(`drop function "assert_marketplace_product_parent_coherence"();`);
    this.addSql(`drop function "assert_marketplace_partner_parent_coherence"();`);
    this.addSql(`drop function "assert_marketplace_request_publication_coherence"();`);
    this.addSql(`drop function "assert_marketplace_listing_publication_coherence"();`);
    this.addSql(`drop function "assert_marketplace_public_seller_coherence"();`);
    this.addSql(`alter table "produce_listings" drop constraint "ck__produce_listings__price_per_kg_uzs_integer";`);
  }
}
