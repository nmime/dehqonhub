// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

export class Migration20260810135000AddMarketplaceDashboardsAndGroundedAi extends Migration {
  override up(): void {
    // Legacy rows referenced tenant-private Product IDs. Preserve the consultation
    // history but explicitly remove those ungrounded references before changing
    // the column contract to opaque public publication IDs.
    this.addSql(`
      alter table "marketplace_ai_consultations"
        drop constraint if exists "ck__marketplace_ai__kind",
        drop constraint if exists "ck__marketplace_ai__answer",
        drop constraint if exists "ck__marketplace_ai__product_ids_array";
    `);
    this.addSql(`
      update "marketplace_ai_consultations"
         set "answer" = 'no_catalog_match',
             "product_ids" = '[]'::jsonb;
    `);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        rename column "product_ids" to "listing_publication_ids";
    `);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        add column "revision" integer not null default 0,
        add column "confirmed_at" timestamptz null,
        add column "response_snapshot" jsonb not null default
          '{"explanationCodes":["no_grounded_catalog_match"],"recommendations":[],"starterCartPreview":{"sellerPartitions":[],"status":"unavailable"}}'::jsonb,
        add column "updated_at" timestamptz not null default now();
    `);
    this.addSql(`
      update "marketplace_ai_consultations"
         set "question" = coalesce(
           nullif(left(regexp_replace(btrim(regexp_replace(
             "question",
             U&'[\\00AD\\061C\\200B-\\200F\\202A-\\202E\\2060-\\2064\\2066-\\206F\\FEFF]',
             '', 'g'
           )), '[[:cntrl:]]+', ' ', 'g'), 2000), ''),
           '[redacted]'
         );
    `);
    this.addSql(`
      drop index if exists "ix__marketplace_ai_consultations__tenant_id_user_id";
      create index "ix__marketplace_ai_consultations__tenant_id_user_id_created_at"
        on "marketplace_ai_consultations" ("tenant_id", "user_id", "created_at");
    `);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        add constraint "ck__marketplace_ai_consultations__kind"
          check ("kind" in ('recommendation', 'find_cheaper', 'season_advice', 'generic')),
        add constraint "ck__marketplace_ai_consultations__answer"
          check ("answer" in ('catalog_match', 'no_catalog_match')),
        add constraint "ck__marketplace_ai_consultations__listing_ids"
          check (jsonb_typeof("listing_publication_ids") = 'array'
            and jsonb_array_length("listing_publication_ids") <= 3),
        add constraint "ck__marketplace_ai_consultations__answer_shape"
          check (("answer" = 'catalog_match' and jsonb_array_length("listing_publication_ids") between 1 and 3)
            or ("answer" = 'no_catalog_match' and jsonb_array_length("listing_publication_ids") = 0)),
        add constraint "ck__marketplace_ai_consultations__question"
          check (char_length("question") between 1 and 2000
            and "question" = btrim("question")
            and "question" !~ '[[:cntrl:]]'
            and "question" !~ U&'[\\00AD\\061C\\200B-\\200F\\202A-\\202E\\2060-\\2064\\2066-\\206F\\FEFF]'),
        add constraint "ck__marketplace_ai_consultations__response_snapshot"
          check (jsonb_typeof("response_snapshot") = 'object'
            and jsonb_typeof("response_snapshot" -> 'explanationCodes') = 'array'
            and jsonb_typeof("response_snapshot" -> 'recommendations') = 'array'
            and jsonb_array_length("response_snapshot" -> 'recommendations') <= 3
            and jsonb_typeof("response_snapshot" -> 'starterCartPreview') = 'object'
            and ("response_snapshot" -> 'starterCartPreview' ->> 'status') in ('requires_confirmation', 'unavailable')
            and jsonb_typeof("response_snapshot" -> 'starterCartPreview' -> 'sellerPartitions') = 'array'
            and pg_column_size("response_snapshot") <= 65536),
        add constraint "ck__marketplace_ai_consultations__revision"
          check ("revision" between 0 and 1),
        add constraint "ck__marketplace_ai_consultations__confirmation"
          check (("revision" = 0 and "confirmed_at" is null)
            or ("revision" = 1 and "confirmed_at" is not null));
    `);

    this.addSql(`
      create function "guard_marketplace_ai_consultation"() returns trigger as $$
      declare
        "listing_id" text;
        "seen_count" integer;
        "response_count" integer;
        "response_distinct_count" integer;
        "partition_count" integer;
        "partition_distinct_count" integer;
        "recommendation" jsonb;
        "partition" jsonb;
      begin
        if tg_op = 'UPDATE' and (
          new."id" <> old."id"
          or new."tenant_id" <> old."tenant_id"
          or new."user_id" <> old."user_id"
          or new."kind" <> old."kind"
          or new."question" <> old."question"
          or new."answer" <> old."answer"
          or new."listing_publication_ids" <> old."listing_publication_ids"
          or new."response_snapshot" <> old."response_snapshot"
          or new."created_at" <> old."created_at"
          or new."revision" <> old."revision" + 1
          or old."revision" <> 0
          or old."confirmed_at" is not null
          or new."confirmed_at" is null
        ) then
          raise exception 'marketplace AI consultation transition is invalid'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__transition';
        end if;

        select count(distinct value) into "seen_count"
          from jsonb_array_elements_text(new."listing_publication_ids");
        if "seen_count" <> jsonb_array_length(new."listing_publication_ids") then
          raise exception 'marketplace AI consultation listing IDs must be unique'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__unique_listing_ids';
        end if;

        select count(*)::integer, count(distinct recommendation.value ->> 'listingPublicationId')::integer
          into "response_count", "response_distinct_count"
          from jsonb_array_elements(new."response_snapshot" -> 'recommendations') recommendation;
        if "response_count" <> jsonb_array_length(new."listing_publication_ids")
          or "response_distinct_count" <> "response_count"
          or (new."answer" = 'catalog_match'
            and new."response_snapshot" -> 'starterCartPreview' ->> 'status' <> 'requires_confirmation')
          or (new."answer" = 'no_catalog_match'
            and new."response_snapshot" -> 'starterCartPreview' ->> 'status' <> 'unavailable')
        then
          raise exception 'marketplace AI response listing set is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__response_listing_set';
        end if;

        select count(*)::integer, count(distinct listing.value)::integer
          into "partition_count", "partition_distinct_count"
          from jsonb_array_elements(new."response_snapshot" -> 'starterCartPreview' -> 'sellerPartitions') partition
          cross join lateral jsonb_array_elements_text(partition.value -> 'listingPublicationIds') listing;
        if "partition_count" <> jsonb_array_length(new."listing_publication_ids")
          or "partition_distinct_count" <> "partition_count"
        then
          raise exception 'marketplace AI preview partition set is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__preview_listing_set';
        end if;

        for "recommendation" in
          select value from jsonb_array_elements(new."response_snapshot" -> 'recommendations')
        loop
          if not (new."listing_publication_ids" ? ("recommendation" ->> 'listingPublicationId'))
            or ("recommendation" ->> 'listingPublicationId')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or ("recommendation" ->> 'sellerPublicId')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or jsonb_typeof("recommendation" -> 'titles') <> 'object'
            or coalesce("recommendation" -> 'titles' ->> 'en', '') = ''
            or coalesce("recommendation" -> 'titles' ->> 'ru', '') = ''
            or coalesce("recommendation" -> 'titles' ->> 'uz', '') = ''
            or coalesce("recommendation" -> 'titles' ->> 'uzCyrl', '') = ''
            or coalesce(("recommendation" ->> 'priceUzs')::bigint, -1) < 0
            or jsonb_typeof("recommendation" -> 'reasonCodes') <> 'array'
            or "recommendation" -> 'availability' ->> 'status' <> 'in_stock_at_consultation'
            or coalesce(("recommendation" -> 'availability' ->> 'quantity')::bigint, 0) <= 0
            or coalesce("recommendation" -> 'availability' ->> 'unit', '') = ''
            or "recommendation" -> 'availability' ->> 'warningCode' <> 'stock_may_change'
          then
            raise exception 'marketplace AI recommendation shape is invalid'
              using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__recommendation';
          end if;
          if tg_op = 'INSERT' and not exists (
            select 1
              from "marketplace_listing_publications" publication
              join "marketplace_public_sellers" seller on seller."id" = publication."seller_public_id"
              left join "products" product on product."id" = publication."product_id"
              left join "produce_listings" produce on produce."id" = publication."produce_listing_id"
             where publication."id"::text = ("recommendation" ->> 'listingPublicationId')
               and seller."id"::text = ("recommendation" ->> 'sellerPublicId')
               and publication."public_title" = ("recommendation" -> 'titles' ->> 'en')
               and coalesce(publication."public_title_ru", publication."public_title")
                 = ("recommendation" -> 'titles' ->> 'ru')
               and coalesce(publication."public_title_uz", publication."public_title")
                 = ("recommendation" -> 'titles' ->> 'uz')
               and coalesce(publication."public_title_uz_cyrl", publication."public_title")
                 = ("recommendation" -> 'titles' ->> 'uzCyrl')
               and publication."public_unit" = ("recommendation" -> 'availability' ->> 'unit')
               and coalesce(product."price_uzs", produce."price_per_kg_uzs")::bigint
                 = ("recommendation" ->> 'priceUzs')::bigint
               and coalesce(product."stock_quantity", produce."available_quantity_kg")::bigint
                 = ("recommendation" -> 'availability' ->> 'quantity')::bigint
          ) then
            raise exception 'marketplace AI recommendation facts are not grounded'
              using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__recommendation_facts';
          end if;
        end loop;

        for "partition" in
          select value from jsonb_array_elements(new."response_snapshot" -> 'starterCartPreview' -> 'sellerPartitions')
        loop
          if ("partition" ->> 'sellerPublicId')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or jsonb_typeof("partition" -> 'listingPublicationIds') <> 'array'
          then
            raise exception 'marketplace AI preview partition is invalid'
              using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__preview_partition';
          end if;
          for "listing_id" in select value from jsonb_array_elements_text("partition" -> 'listingPublicationIds') loop
            if not exists (
              select 1 from jsonb_array_elements(new."response_snapshot" -> 'recommendations') recommendation
               where recommendation.value ->> 'listingPublicationId' = "listing_id"
                 and recommendation.value ->> 'sellerPublicId' = "partition" ->> 'sellerPublicId'
            ) then
              raise exception 'marketplace AI preview partition is not grounded'
                using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__preview_partition_facts';
            end if;
          end loop;
        end loop;

        for "listing_id" in select value from jsonb_array_elements_text(new."listing_publication_ids") loop
          if "listing_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or not exists (
              select 1
                from "marketplace_listing_publications" publication
                join "marketplace_public_sellers" seller
                  on seller."id" = publication."seller_public_id"
                 and seller."tenant_id" = publication."tenant_id"
                 and seller."owner_user_id" = publication."owner_user_id"
                 and seller."status" = 'published'
                join "marketplace_public_seller_revisions" seller_revision
                  on seller_revision."id" = publication."seller_revision_id"
                 and seller_revision."seller_public_id" = seller."id"
                 and seller_revision."tenant_id" = seller."tenant_id"
                 and seller_revision."content_revision" = publication."seller_content_revision"
                 and seller_revision."moderation_status" = 'approved'
                join "agritech_partners" partner
                  on partner."id" = seller."partner_id"
                 and partner."tenant_id" = seller."tenant_id"
                 and partner."owner_user_id" = seller."owner_user_id"
                 and partner."kind" = 'supplier'
                 and partner."status" = 'approved'
                join "marketplace_partner_memberships" membership
                  on membership."partner_id" = partner."id"
                 and membership."tenant_id" = partner."tenant_id"
                 and membership."user_id" = seller."owner_user_id"
                 and membership."capability" = 'seller'
                 and membership."status" = 'active'
                join "marketplace_verifications" verification
                  on verification."tenant_id" = partner."tenant_id"
                 and verification."user_id" = seller."owner_user_id"
                 and verification."status" = 'verified'
                 and verification."role" in ('farmer', 'seller')
                left join "products" product
                  on product."id" = publication."product_id"
                 and product."tenant_id" = publication."tenant_id"
                 and product."supplier_id" = partner."id"::text
                 and product."status" = 'active'
                 and product."stock_quantity" > 0
                left join "produce_listings" produce
                  on produce."id" = publication."produce_listing_id"
                 and produce."tenant_id" = publication."tenant_id"
                 and produce."status" = 'active'
                 and produce."available_quantity_kg" > 0
                left join "marketplace_produce_organization_bindings" produce_binding
                  on produce_binding."produce_listing_id" = produce."id"
                 and produce_binding."tenant_id" = publication."tenant_id"
                 and produce_binding."owner_user_id" = seller."owner_user_id"
                 and produce_binding."supplier_partner_id" = partner."id"
               where publication."id"::text = "listing_id"
                 and publication."status" = 'published'
                 and publication."moderation_status" = 'approved'
                 and ((publication."source_kind" = 'product' and product."id" is not null)
                   or (publication."source_kind" = 'produce' and produce."id" is not null
                     and produce_binding."produce_listing_id" is not null))
            ) then
            raise exception 'marketplace AI consultation contains an ineligible listing'
              using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__grounded_listing';
          end if;
        end loop;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_ai_consultations__guard"
        before insert or update on "marketplace_ai_consultations"
        for each row execute function "guard_marketplace_ai_consultation"();
    `);

    this.addSql(`
      create table "marketplace_ai_consultation_operations" (
        "id" uuid not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "consultation_id" uuid not null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "result_snapshot" jsonb not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_ai_consultation_operations" primary key ("id"),
        constraint "fk__marketplace_ai_consultation_operations__consultation_id"
          foreign key ("consultation_id") references "marketplace_ai_consultations" ("id") on delete restrict,
        constraint "uq__marketplace_ai_consultation_operations__actor_key"
          unique ("actor_tenant_id", "actor_user_id", "idempotency_key"),
        constraint "uq__marketplace_ai_consultation_operations__consultation_id"
          unique ("consultation_id"),
        constraint "ck__marketplace_ai_consultation_operations__idempotency_key"
          check ("idempotency_key" ~ '^[A-Za-z0-9:_-]{8,100}$'),
        constraint "ck__marketplace_ai_consultation_operations__request_fingerprint"
          check ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
        constraint "ck__marketplace_ai_consultation_operations__result_snapshot"
          check (jsonb_typeof("result_snapshot") = 'object'
            and jsonb_typeof("result_snapshot" -> 'listingPublicationIds') = 'array'
            and jsonb_typeof("result_snapshot" -> 'response') = 'object'
            and pg_column_size("result_snapshot") <= 65536)
      );
    `);
    this.addSql(`
      create function "guard_marketplace_ai_consultation_operation"() returns trigger as $$
      begin
        if tg_op <> 'INSERT' then
          raise exception 'marketplace AI consultation operation is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultation_operations__immutable';
        end if;
        if not exists (
          select 1
            from "marketplace_ai_consultations" consultation
           where consultation."id" = new."consultation_id"
             and consultation."tenant_id" = new."actor_tenant_id"
             and consultation."user_id" = new."actor_user_id"
             and new."result_snapshot" ->> 'id' = consultation."id"::text
             and new."result_snapshot" ->> 'kind' = consultation."kind"
             and new."result_snapshot" ->> 'question' = consultation."question"
             and new."result_snapshot" ->> 'answer' = consultation."answer"
             and new."result_snapshot" -> 'listingPublicationIds' = consultation."listing_publication_ids"
             and new."result_snapshot" -> 'response' = consultation."response_snapshot"
             and (new."result_snapshot" ->> 'createdAt')::timestamptz = consultation."created_at"
             and (new."result_snapshot" ->> 'updatedAt')::timestamptz = consultation."updated_at"
        ) then
          raise exception 'marketplace AI consultation operation result is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultation_operations__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_ai_consultation_operations__guard"
        before insert or update or delete on "marketplace_ai_consultation_operations"
        for each row execute function "guard_marketplace_ai_consultation_operation"();
    `);

    this.addSql(`
      create table "marketplace_ai_starter_cart_operations" (
        "id" uuid not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "consultation_id" uuid not null,
        "buyer_partner_id" uuid not null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "result_snapshot" jsonb not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__marketplace_ai_starter_cart_operations" primary key ("id"),
        constraint "fk__marketplace_ai_starter_cart_operations__consultation_id"
          foreign key ("consultation_id") references "marketplace_ai_consultations" ("id") on delete restrict,
        constraint "fk__marketplace_ai_starter_cart_operations__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "uq__marketplace_ai_starter_cart_operations__actor_key"
          unique ("actor_tenant_id", "actor_user_id", "idempotency_key"),
        constraint "uq__marketplace_ai_starter_cart_operations__consultation_id"
          unique ("consultation_id"),
        constraint "ck__marketplace_ai_starter_cart_operations__idempotency_key"
          check ("idempotency_key" ~ '^[A-Za-z0-9:_-]{8,100}$'),
        constraint "ck__marketplace_ai_starter_cart_operations__request_fingerprint"
          check ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
        constraint "ck__marketplace_ai_starter_cart_operations__result_snapshot"
          check (jsonb_typeof("result_snapshot") = 'object'
            and "result_snapshot" ->> 'status' = 'confirmed'
            and jsonb_typeof("result_snapshot" -> 'carts') = 'array'
            and jsonb_array_length("result_snapshot" -> 'carts') between 1 and 3
            and ("result_snapshot" ->> 'consultationId')
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and pg_column_size("result_snapshot") <= 65536)
      );
    `);
    this.addSql(`
      create index "ix__marketplace_ai_starter_cart_operations__actor_tena_5a95027e"
        on "marketplace_ai_starter_cart_operations" ("actor_tenant_id", "actor_user_id", "created_at");
    `);
    this.addSql(`
      create function "guard_marketplace_ai_starter_cart_operation"() returns trigger as $$
      declare
        "consultation_listings" jsonb;
        "cart_snapshot" jsonb;
        "listing_id" text;
        "listing_count" integer;
        "distinct_listing_count" integer;
      begin
        if tg_op <> 'INSERT' then
          raise exception 'marketplace AI starter-cart operation is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_ai_starter_cart_operations__immutable';
        end if;
        select consultation."listing_publication_ids"
          into "consultation_listings"
            from "marketplace_ai_consultations" consultation
            join "marketplace_partner_memberships" membership
              on membership."partner_id" = new."buyer_partner_id"
             and membership."tenant_id" = new."actor_tenant_id"
             and membership."user_id" = new."actor_user_id"
             and membership."capability" = 'buyer'
             and membership."status" = 'active'
            join "agritech_partners" partner
              on partner."id" = membership."partner_id"
             and partner."tenant_id" = membership."tenant_id"
             and partner."kind" = 'buyer'
             and partner."status" = 'approved'
            join "marketplace_verifications" verification
              on verification."tenant_id" = new."actor_tenant_id"
             and verification."user_id" = new."actor_user_id"
             and verification."status" = 'verified'
             and verification."role" in ('buyer', 'farmer')
           where consultation."id" = new."consultation_id"
             and consultation."tenant_id" = new."actor_tenant_id"
             and consultation."user_id" = new."actor_user_id"
             and consultation."revision" = 1
             and consultation."confirmed_at" is not null
             and new."result_snapshot" ->> 'consultationId' = consultation."id"::text
             and (new."result_snapshot" ->> 'confirmedAt')::timestamptz = consultation."confirmed_at";
        if "consultation_listings" is null then
          raise exception 'marketplace AI starter-cart operation authority is invalid'
            using errcode = '23514', constraint = 'ck__marketplace_ai_starter_cart_operations__authority';
        end if;

        select count(*)::integer, count(distinct listing.value)::integer
          into "listing_count", "distinct_listing_count"
          from jsonb_array_elements(new."result_snapshot" -> 'carts') cart
          cross join lateral jsonb_array_elements_text(cart.value -> 'listingPublicationIds') listing;
        if "listing_count" <> jsonb_array_length("consultation_listings")
          or "distinct_listing_count" <> "listing_count"
        then
          raise exception 'marketplace AI starter-cart result listing set is incoherent'
            using errcode = '23514', constraint = 'ck__marketplace_ai_starter_cart_operations__listing_set';
        end if;

        for "cart_snapshot" in select value from jsonb_array_elements(new."result_snapshot" -> 'carts') loop
          if jsonb_typeof("cart_snapshot") <> 'object'
            or ("cart_snapshot" ->> 'cartId')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or ("cart_snapshot" ->> 'sellerPublicId')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or jsonb_typeof("cart_snapshot" -> 'listingPublicationIds') <> 'array'
            or jsonb_array_length("cart_snapshot" -> 'listingPublicationIds') = 0
            or not exists (
              select 1
                from "marketplace_carts" cart
                join "marketplace_public_sellers" seller
                  on seller."id"::text = "cart_snapshot" ->> 'sellerPublicId'
                 and seller."tenant_id" = cart."seller_tenant_id"
                 and seller."owner_user_id" = cart."seller_user_id"
                 and seller."partner_id" = cart."seller_partner_id"
               where cart."id"::text = "cart_snapshot" ->> 'cartId'
                 and cart."tenant_id" = new."actor_tenant_id"
                 and cart."user_id" = new."actor_user_id"
                 and cart."buyer_partner_id" = new."buyer_partner_id"
                 and cart."binding_status" = 'resolved'
                 and cart."status" = 'open'
            )
          then
            raise exception 'marketplace AI starter-cart result cart is incoherent'
              using errcode = '23514', constraint = 'ck__marketplace_ai_starter_cart_operations__cart';
          end if;

          for "listing_id" in select value from jsonb_array_elements_text("cart_snapshot" -> 'listingPublicationIds') loop
            if not ("consultation_listings" ? "listing_id")
              or not exists (
                select 1
                  from "marketplace_carts" cart,
                       jsonb_array_elements(cart."items") item
                 where cart."id"::text = "cart_snapshot" ->> 'cartId'
                   and item ->> 'listingPublicationId' = "listing_id"
              )
            then
              raise exception 'marketplace AI starter-cart result item is incoherent'
                using errcode = '23514', constraint = 'ck__marketplace_ai_starter_cart_operations__item';
            end if;
          end loop;
        end loop;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_ai_starter_cart_operations__guard"
        before insert or update or delete on "marketplace_ai_starter_cart_operations"
        for each row execute function "guard_marketplace_ai_starter_cart_operation"();
    `);
    this.addSql(`
      create function "assert_marketplace_ai_consultation_receipts"() returns trigger as $$
      begin
        if tg_op = 'INSERT' and not exists (
          select 1 from "marketplace_ai_consultation_operations" operation
           where operation."consultation_id" = new."id"
             and operation."actor_tenant_id" = new."tenant_id"
             and operation."actor_user_id" = new."user_id"
        ) then
          raise exception 'marketplace AI consultation create receipt is missing'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__create_receipt';
        end if;
        if tg_op = 'UPDATE' and new."revision" = 1 and not exists (
          select 1 from "marketplace_ai_starter_cart_operations" operation
           where operation."consultation_id" = new."id"
             and operation."actor_tenant_id" = new."tenant_id"
             and operation."actor_user_id" = new."user_id"
        ) then
          raise exception 'marketplace AI starter-cart receipt is missing'
            using errcode = '23514', constraint = 'ck__marketplace_ai_consultations__starter_cart_receipt';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_ai_consultations__receipts"
        after insert or update on "marketplace_ai_consultations"
        deferrable initially deferred for each row
        execute function "assert_marketplace_ai_consultation_receipts"();
    `);
  }

  override down(): void {
    // Pre-traffic rollback only: confirmed starter-cart audit history cannot be
    // represented by the former private-product AI schema.
    this.addSql(
      `drop trigger if exists "ct__marketplace_ai_consultations__receipts" on "marketplace_ai_consultations";`,
    );
    this.addSql(`drop function if exists "assert_marketplace_ai_consultation_receipts"();`);
    this.addSql(`drop table if exists "marketplace_ai_starter_cart_operations";`);
    this.addSql(`drop function if exists "guard_marketplace_ai_starter_cart_operation"();`);
    this.addSql(`drop table if exists "marketplace_ai_consultation_operations";`);
    this.addSql(`drop function if exists "guard_marketplace_ai_consultation_operation"();`);
    this.addSql(`drop trigger if exists "tr__marketplace_ai_consultations__guard" on "marketplace_ai_consultations";`);
    this.addSql(`drop function if exists "guard_marketplace_ai_consultation"();`);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        drop constraint if exists "ck__marketplace_ai_consultations__confirmation",
        drop constraint if exists "ck__marketplace_ai_consultations__revision",
        drop constraint if exists "ck__marketplace_ai_consultations__response_snapshot",
        drop constraint if exists "ck__marketplace_ai_consultations__question",
        drop constraint if exists "ck__marketplace_ai_consultations__answer_shape",
        drop constraint if exists "ck__marketplace_ai_consultations__listing_ids",
        drop constraint if exists "ck__marketplace_ai_consultations__answer",
        drop constraint if exists "ck__marketplace_ai_consultations__kind",
        drop column if exists "updated_at",
        drop column if exists "response_snapshot",
        drop column if exists "confirmed_at",
        drop column if exists "revision";
    `);
    this.addSql(`
      drop index if exists "ix__marketplace_ai_consultations__tenant_id_user_id_created_at";
      create index "ix__marketplace_ai_consultations__tenant_id_user_id"
        on "marketplace_ai_consultations" ("tenant_id", "user_id");
    `);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        rename column "listing_publication_ids" to "product_ids";
    `);
    this.addSql(`
      alter table "marketplace_ai_consultations"
        add constraint "ck__marketplace_ai__kind"
          check ("kind" in ('recommendation', 'find_cheaper', 'season_advice', 'generic')),
        add constraint "ck__marketplace_ai__answer"
          check ("answer" in ('catalog_match', 'no_catalog_match')),
        add constraint "ck__marketplace_ai__product_ids_array"
          check (jsonb_typeof("product_ids") = 'array');
    `);
  }
}
