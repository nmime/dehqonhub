// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { Migration } from '@mikro-orm/migrations';

/**
 * Expands the legacy same-tenant marketplace into explicit party-bound commerce.
 * Down is safe only before resolved Stage 2 commerce is accepted.
 */
export class Migration20260810130500AddMarketplaceCommerceParties extends Migration {
  override up(): void {
    this.addSql(`
      create table "marketplace_partner_memberships" (
        "id" uuid not null,
        "tenant_id" varchar(100) not null,
        "partner_id" uuid not null,
        "user_id" varchar(100) not null,
        "role" varchar(20) not null default 'member',
        "capability" varchar(20) not null,
        "status" varchar(20) not null default 'active',
        "revision" int not null default 0,
        "revoked_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "marketplace_partner_memberships_pkey" primary key ("id"),
        constraint "fk__marketplace_partner_memberships__partner_id"
          foreign key ("partner_id") references "agritech_partners" ("id") on delete restrict,
        constraint "uq__marketplace_partner_memberships__partner_user_capability"
          unique ("partner_id", "user_id", "capability"),
        constraint "ck__marketplace_partner_memberships__role"
          check ("role" in ('owner', 'member')),
        constraint "ck__marketplace_partner_memberships__capability"
          check ("capability" in ('buyer', 'seller')),
        constraint "ck__marketplace_partner_memberships__status"
          check ("status" in ('active', 'revoked')),
        constraint "ck__marketplace_partner_memberships__revision"
          check ("revision" >= 0),
        constraint "ck__marketplace_partner_memberships__revocation" check (
          ("status" = 'active' and "revoked_at" is null)
          or ("status" = 'revoked' and "revoked_at" is not null)
        )
      );
    `);
    this.addSql(`
      create index "ix__marketplace_partner_memberships__tenant_id_user_id_88dbe2b0"
        on "marketplace_partner_memberships" ("tenant_id", "user_id", "capability", "status");
    `);
    this.addSql(`
      insert into "marketplace_partner_memberships" (
        "id", "tenant_id", "partner_id", "user_id", "role", "capability", "status", "revision"
      )
      select gen_random_uuid(), partner."tenant_id", partner."id", partner."owner_user_id", 'owner',
             case partner."kind" when 'buyer' then 'buyer' else 'seller' end,
             'active', 0
        from "agritech_partners" partner
       where partner."kind" in ('buyer', 'supplier')
      on conflict ("partner_id", "user_id", "capability") do nothing;
    `);
    this.addSql(`
      create function "assert_marketplace_partner_membership_coherence"() returns trigger as $$
      begin
        if not exists (
          select 1 from "agritech_partners" partner
           where partner."id" = new."partner_id"
             and partner."tenant_id" = new."tenant_id"
             and ((new."capability" = 'buyer' and partner."kind" = 'buyer')
               or (new."capability" = 'seller' and partner."kind" = 'supplier'))
             and (new."role" <> 'owner' or partner."owner_user_id" = new."user_id")
        ) then
          raise exception 'marketplace partner membership mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_partner_memberships__coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_partner_memberships__coherence"
        after insert or update on "marketplace_partner_memberships"
        deferrable initially immediate for each row
        execute function "assert_marketplace_partner_membership_coherence"();
    `);
    this.addSql(`
      create function "enforce_marketplace_membership_identity_immutability"() returns trigger as $$
      begin
        if (new."tenant_id", new."partner_id", new."user_id", new."role", new."capability")
          is distinct from
          (old."tenant_id", old."partner_id", old."user_id", old."role", old."capability")
        then
          raise exception 'marketplace membership identity is immutable'
            using errcode = '23514', constraint = 'ck__marketplace_partner_memberships__immutable_identity';
        end if;
        if new."revision" <> old."revision" + 1 then
          raise exception 'marketplace membership revision must advance once'
            using errcode = '23514', constraint = 'ck__marketplace_partner_memberships__revision_cas';
        end if;
        if old."status" = 'revoked' and new."status" <> 'revoked' then
          raise exception 'revoked marketplace membership is terminal'
            using errcode = '23514', constraint = 'ck__marketplace_partner_memberships__terminal_revocation';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_partner_memberships__immutable_identity"
        before update on "marketplace_partner_memberships"
        for each row execute function "enforce_marketplace_membership_identity_immutability"();
    `);
    this.addSql(`
      create function "create_marketplace_owner_membership"() returns trigger as $$
      begin
        if new."kind" in ('buyer', 'supplier') then
          insert into "marketplace_partner_memberships" (
            "id", "tenant_id", "partner_id", "user_id", "role", "capability", "status", "revision"
          ) values (
            gen_random_uuid(), new."tenant_id", new."id", new."owner_user_id", 'owner',
            case new."kind" when 'buyer' then 'buyer' else 'seller' end, 'active', 0
          ) on conflict ("partner_id", "user_id", "capability") do nothing;
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__agritech_partners__marketplace_owner_membership"
        after insert on "agritech_partners"
        for each row execute function "create_marketplace_owner_membership"();
    `);
    this.addSql(`
      create function "guard_marketplace_partner_membership_parent"() returns trigger as $$
      begin
        if exists (
          select 1 from "marketplace_partner_memberships" membership
           where membership."partner_id" = new."id"
             and (membership."tenant_id" <> new."tenant_id"
               or (membership."role" = 'owner' and membership."user_id" <> new."owner_user_id")
               or (membership."capability" = 'buyer' and new."kind" <> 'buyer')
               or (membership."capability" = 'seller' and new."kind" <> 'supplier'))
        ) then
          raise exception 'marketplace membership parent identity is immutable'
            using errcode = '23514', constraint = 'ck__agritech_partners__marketplace_membership_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__agritech_partners__marketplace_membership_coherence"
        after update of "tenant_id", "owner_user_id", "kind" on "agritech_partners"
        deferrable initially immediate for each row
        execute function "guard_marketplace_partner_membership_parent"();
    `);

    this.addSql(`
      create table "marketplace_commerce_operations" (
        "id" uuid not null,
        "actor_tenant_id" varchar(100) not null,
        "actor_user_id" varchar(100) not null,
        "operation" varchar(30) not null,
        "resource_key" varchar(100) not null,
        "idempotency_key" varchar(100) not null,
        "request_fingerprint" varchar(64) not null,
        "result_snapshot" jsonb not null,
        "created_at" timestamptz not null default now(),
        constraint "marketplace_commerce_operations_pkey" primary key ("id"),
        constraint "uq__marketplace_commerce_operations__actor_operation_key"
          unique ("actor_tenant_id", "actor_user_id", "operation", "resource_key", "idempotency_key"),
        constraint "ck__marketplace_commerce_operations__operation" check (
          "operation" in ('cart_add', 'cart_update', 'cart_remove', 'cart_checkout', 'request_create', 'offer_create', 'offer_choose')
        ),
        constraint "ck__marketplace_commerce_operations__request_fingerprint"
          check ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
        constraint "ck__marketplace_commerce_operations__result_snapshot"
          check (jsonb_typeof("result_snapshot") = 'object' and pg_column_size("result_snapshot") <= 65536)
      );
    `);
    this.addSql(`
      create index "ix__marketplace_commerce_operations__actor_tenant_id_a_2645d230"
        on "marketplace_commerce_operations" ("actor_tenant_id", "actor_user_id", "created_at");
    `);
    this.addSql(`
      create function "enforce_marketplace_commerce_operation_immutability"() returns trigger as $$
      begin
        raise exception 'marketplace commerce operation is immutable'
          using errcode = '23514', constraint = 'ck__marketplace_commerce_operations__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_commerce_operations__immutable"
        before update or delete on "marketplace_commerce_operations"
        for each row execute function "enforce_marketplace_commerce_operation_immutability"();
    `);

    this.addSql(`
      alter table "marketplace_carts"
        add column "buyer_partner_id" uuid null,
        add column "seller_tenant_id" varchar(100) null,
        add column "seller_user_id" varchar(100) null,
        add column "seller_partner_id" uuid null,
        add column "binding_status" varchar(20) not null default 'review_required',
        add constraint "fk__marketplace_carts__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "fk__marketplace_carts__seller_partner_id"
          foreign key ("seller_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "ck__marketplace_carts__binding_status"
          check ("binding_status" in ('resolved', 'review_required')),
        add constraint "ck__marketplace_carts__resolved_parties" check (
          "binding_status" = 'review_required' or (
            "buyer_partner_id" is not null and "seller_tenant_id" is not null
            and "seller_user_id" is not null and "seller_partner_id" is not null
          )
        );
    `);
    this.addSql(`
      create index "ix__marketplace_carts__seller_tenant_id_seller_user_id_3d500628"
        on "marketplace_carts" ("seller_tenant_id", "seller_user_id", "seller_partner_id");
    `);
    this.addSql(`
      create unique index "uq__marketplace_carts__tenant_id_user_id_buyer_partner_490fd0d3"
        on "marketplace_carts" (
          "tenant_id", "user_id", "buyer_partner_id", "seller_tenant_id", "seller_partner_id"
        ) where "status" = 'open' and "binding_status" = 'resolved';
    `);
    this.addSql(`update "marketplace_carts" set "status" = 'abandoned' where "status" = 'open';`);

    this.addSql(`
      alter table "marketplace_requests"
        add column "buyer_partner_id" uuid null,
        add column "binding_status" varchar(20) not null default 'review_required',
        add constraint "fk__marketplace_requests__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "ck__marketplace_requests__binding_status"
          check ("binding_status" in ('resolved', 'review_required')),
        add constraint "ck__marketplace_requests__resolved_party"
          check ("binding_status" = 'review_required' or "buyer_partner_id" is not null);
    `);
    this.addSql(`
      update "marketplace_requests" request
         set "buyer_partner_id" = binding."buyer_partner_id", "binding_status" = 'resolved'
        from "marketplace_request_organization_bindings" binding
       where binding."request_id" = request."id"
         and binding."tenant_id" = request."tenant_id"
         and binding."buyer_user_id" = request."buyer_user_id"
         and exists (
           select 1 from "marketplace_partner_memberships" membership
           join "agritech_partners" partner on partner."id" = membership."partner_id"
           join "marketplace_verifications" verification
             on verification."tenant_id" = membership."tenant_id"
            and verification."user_id" = membership."user_id"
            and verification."role" = 'buyer'
            and verification."status" = 'verified'
          where membership."tenant_id" = binding."tenant_id"
            and membership."user_id" = binding."buyer_user_id"
            and membership."partner_id" = binding."buyer_partner_id"
            and membership."capability" = 'buyer'
            and membership."status" = 'active'
            and partner."tenant_id" = binding."tenant_id"
            and partner."kind" = 'buyer'
            and partner."status" = 'approved'
         );
    `);
    this.addSql(`
      create index "ix__marketplace_requests__buyer_partner_id"
        on "marketplace_requests" ("buyer_partner_id");
    `);
    this.addSql(`
      create function "resolve_marketplace_request_party_from_binding"() returns trigger as $$
      begin
        update "marketplace_requests"
           set "buyer_partner_id" = new."buyer_partner_id", "binding_status" = 'resolved'
         where "id" = new."request_id"
           and "tenant_id" = new."tenant_id"
           and "buyer_user_id" = new."buyer_user_id";
        if not found then
          raise exception 'marketplace request binding cannot resolve party'
            using errcode = '23514', constraint = 'ck__marketplace_requests__binding_resolution';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_request_bindings__resolve_party"
        after insert on "marketplace_request_organization_bindings"
        for each row execute function "resolve_marketplace_request_party_from_binding"();
    `);

    this.addSql(`
      alter table "marketplace_request_offers"
        add column "request_public_id" uuid null,
        add column "buyer_user_id" varchar(100) null,
        add column "buyer_partner_id" uuid null,
        add column "seller_tenant_id" varchar(100) null,
        add column "seller_partner_id" uuid null,
        add column "binding_status" varchar(20) not null default 'review_required',
        add constraint "fk__marketplace_offers__request_public_id"
          foreign key ("request_public_id") references "marketplace_request_publications" ("id") on delete restrict,
        add constraint "fk__marketplace_offers__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "fk__marketplace_offers__seller_partner_id"
          foreign key ("seller_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "ck__marketplace_offers__binding_status"
          check ("binding_status" in ('resolved', 'review_required')),
        add constraint "ck__marketplace_offers__resolved_parties" check (
          "binding_status" = 'review_required' or (
            "request_public_id" is not null and "buyer_user_id" is not null
            and "buyer_partner_id" is not null and "seller_tenant_id" is not null
            and "seller_partner_id" is not null
          )
        );
    `);
    this.addSql(`
      create index "ix__marketplace_request_offers__seller_tenant_id_selle_65cd20e7"
        on "marketplace_request_offers" ("seller_tenant_id", "seller_user_id", "seller_partner_id");
    `);
    this.addSql(`
      create unique index "uq__marketplace_request_offers__request_id_seller_tena_78eb02ed"
        on "marketplace_request_offers" ("request_id", "seller_tenant_id", "seller_partner_id")
        where "status" = 'pending' and "binding_status" = 'resolved';
    `);

    this.addSql(`
      create function "marketplace_contract_snapshot_is_valid"(
        snapshot jsonb,
        expected_tenant varchar,
        expected_user varchar,
        expected_partner uuid
      ) returns boolean as $$
      begin
        return jsonb_typeof(snapshot) = 'object'
          and snapshot ->> 'tenantId' = expected_tenant
          and snapshot ->> 'userId' = expected_user
          and snapshot ->> 'partnerId' = expected_partner::text
          and btrim(coalesce(snapshot ->> 'legalName', '')) <> ''
          and btrim(coalesce(snapshot ->> 'region', '')) <> '';
      exception when others then
        return false;
      end;
      $$ language plpgsql immutable;
    `);
    this.addSql(`
      create function "marketplace_contract_lines_are_frozen"(lines jsonb) returns boolean as $$
      declare
        line jsonb;
      begin
        if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
          return false;
        end if;
        for line in select value from jsonb_array_elements(lines) loop
          if jsonb_typeof(line) <> 'object'
            or btrim(coalesce(line ->> 'sourcePublicationId', '')) = ''
            or coalesce(line ->> 'sourceKind', '') not in ('product', 'produce', 'request')
            or btrim(coalesce(line ->> 'sourceId', '')) = ''
            or (line ->> 'sourceRevision')::int < 1
            or btrim(coalesce(line ->> 'name', '')) = ''
            or btrim(coalesce(line ->> 'unit', '')) = ''
            or (line ->> 'unitPriceUzs')::numeric <= 0
            or (line ->> 'quantity')::numeric <= 0
            or (line ->> 'lineTotalUzs')::numeric <> (line ->> 'unitPriceUzs')::numeric * (line ->> 'quantity')::numeric
          then
            return false;
          end if;
        end loop;
        return true;
      exception when others then
        return false;
      end;
      $$ language plpgsql immutable;
    `);

    this.addSql(`
      alter table "marketplace_contracts"
        add column "buyer_partner_id" uuid null,
        add column "seller_tenant_id" varchar(100) null,
        add column "seller_partner_id" uuid null,
        add column "buyer_party_snapshot" jsonb null,
        add column "seller_party_snapshot" jsonb null,
        add column "binding_status" varchar(20) not null default 'review_required',
        add constraint "fk__marketplace_contracts__buyer_partner_id"
          foreign key ("buyer_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "fk__marketplace_contracts__seller_partner_id"
          foreign key ("seller_partner_id") references "agritech_partners" ("id") on delete restrict,
        add constraint "ck__marketplace_contracts__binding_status"
          check ("binding_status" in ('resolved', 'review_required')),
        add constraint "ck__marketplace_contracts__resolved_parties" check (
          "binding_status" = 'review_required' or (
            "buyer_partner_id" is not null and "seller_tenant_id" is not null
            and "seller_partner_id" is not null and "buyer_party_snapshot" is not null
            and "seller_party_snapshot" is not null
            and "marketplace_contract_snapshot_is_valid"(
              "buyer_party_snapshot", "tenant_id", "buyer_user_id", "buyer_partner_id"
            )
            and "marketplace_contract_snapshot_is_valid"(
              "seller_party_snapshot", "seller_tenant_id", "seller_user_id", "seller_partner_id"
            )
            and "marketplace_contract_lines_are_frozen"("lines")
          )
        );
    `);
    this.addSql(`
      create index "ix__marketplace_contracts__seller_tenant_id_seller_use_f78f6f14"
        on "marketplace_contracts" ("seller_tenant_id", "seller_user_id", "seller_partner_id");
    `);
    this.addSql(`
      create unique index "uq__marketplace_contracts__source_type_source_id"
        on "marketplace_contracts" ("source_type", "source_id")
        where "source_type" is not null and "source_id" is not null and "binding_status" = 'resolved';
    `);
    this.addSql(`
      update "marketplace_contracts"
         set "legacy_status" = coalesce("legacy_status", "status"),
             "legacy_signed_at" = coalesce("legacy_signed_at", "signed_at"),
             "legacy_factoring_enabled" = coalesce("legacy_factoring_enabled", "factoring_enabled"),
             "factoring_enabled" = false,
             "buyer_signed_at" = null,
             "seller_signed_at" = null,
             "signed_at" = null,
             "status" = 'legacy_review_required'
       where "binding_status" = 'review_required'
         and "status" in ('draft', 'signed', 'active');
    `);

    this.addSql(`
      create function "assert_marketplace_resolved_commerce_parties"() returns trigger as $$
      declare
        buyer_tenant varchar(100);
        buyer_user varchar(100);
        buyer_partner uuid;
        seller_tenant varchar(100);
        seller_user varchar(100);
        seller_partner uuid;
      begin
        if new."binding_status" <> 'resolved' then
          return new;
        end if;
        if tg_table_name = 'marketplace_carts' then
          buyer_tenant := to_jsonb(new) ->> 'tenant_id';
          buyer_user := to_jsonb(new) ->> 'user_id';
          buyer_partner := (to_jsonb(new) ->> 'buyer_partner_id')::uuid;
          seller_tenant := to_jsonb(new) ->> 'seller_tenant_id';
          seller_user := to_jsonb(new) ->> 'seller_user_id';
          seller_partner := (to_jsonb(new) ->> 'seller_partner_id')::uuid;
        elsif tg_table_name = 'marketplace_request_offers' then
          buyer_tenant := to_jsonb(new) ->> 'tenant_id';
          buyer_user := to_jsonb(new) ->> 'buyer_user_id';
          buyer_partner := (to_jsonb(new) ->> 'buyer_partner_id')::uuid;
          seller_tenant := to_jsonb(new) ->> 'seller_tenant_id';
          seller_user := to_jsonb(new) ->> 'seller_user_id';
          seller_partner := (to_jsonb(new) ->> 'seller_partner_id')::uuid;
        else
          buyer_tenant := to_jsonb(new) ->> 'tenant_id';
          buyer_user := to_jsonb(new) ->> 'buyer_user_id';
          buyer_partner := (to_jsonb(new) ->> 'buyer_partner_id')::uuid;
          seller_tenant := to_jsonb(new) ->> 'seller_tenant_id';
          seller_user := to_jsonb(new) ->> 'seller_user_id';
          seller_partner := (to_jsonb(new) ->> 'seller_partner_id')::uuid;
        end if;
        if not exists (
          select 1 from "marketplace_partner_memberships" membership
          join "agritech_partners" partner on partner."id" = membership."partner_id"
           where membership."tenant_id" = buyer_tenant and membership."user_id" = buyer_user
             and membership."partner_id" = buyer_partner and membership."capability" = 'buyer'
             and membership."status" = 'active' and partner."status" = 'approved' and partner."kind" = 'buyer'
             and exists (
               select 1 from "marketplace_verifications" verification
                where verification."tenant_id" = buyer_tenant and verification."user_id" = buyer_user
                  and verification."role" = 'buyer' and verification."status" = 'verified'
             )
        ) or not exists (
          select 1 from "marketplace_partner_memberships" membership
          join "agritech_partners" partner on partner."id" = membership."partner_id"
           where membership."tenant_id" = seller_tenant and membership."user_id" = seller_user
             and membership."partner_id" = seller_partner and membership."capability" = 'seller'
             and membership."status" = 'active' and partner."status" = 'approved' and partner."kind" = 'supplier'
             and exists (
               select 1 from "marketplace_verifications" verification
                where verification."tenant_id" = seller_tenant and verification."user_id" = seller_user
                  and verification."role" = 'seller' and verification."status" = 'verified'
             )
        ) then
          raise exception 'marketplace resolved commerce party mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_commerce__party_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create function "assert_marketplace_offer_public_request"() returns trigger as $$
      begin
        if new."binding_status" = 'resolved' and not exists (
          select 1 from "marketplace_request_publications" publication
           where publication."id" = new."request_public_id"
             and publication."request_id" = new."request_id"
             and publication."tenant_id" = new."tenant_id"
             and publication."buyer_user_id" = new."buyer_user_id"
             and publication."buyer_partner_id" = new."buyer_partner_id"
             and publication."status" = 'published'
             and publication."moderation_status" = 'approved'
        ) then
          raise exception 'marketplace offer public request mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_offers__public_request';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_request_offers__public_request"
        after insert or update on "marketplace_request_offers"
        deferrable initially immediate for each row
        execute function "assert_marketplace_offer_public_request"();
    `);
    this.addSql(`
      create function "enforce_marketplace_contract_frozen_authority"() returns trigger as $$
      begin
        if old."binding_status" = 'resolved' and (
          (new."tenant_id", new."buyer_user_id", new."buyer_partner_id",
           new."seller_tenant_id", new."seller_user_id", new."seller_partner_id",
           new."binding_status", new."source_type", new."source_id")
          is distinct from
          (old."tenant_id", old."buyer_user_id", old."buyer_partner_id",
           old."seller_tenant_id", old."seller_user_id", old."seller_partner_id",
           old."binding_status", old."source_type", old."source_id")
          or new."buyer_party_snapshot" is distinct from old."buyer_party_snapshot"
          or new."seller_party_snapshot" is distinct from old."seller_party_snapshot"
          or new."lines" is distinct from old."lines"
          or new."subject" is distinct from old."subject"
          or new."amount_uzs" is distinct from old."amount_uzs"
          or new."delivery_terms" is distinct from old."delivery_terms"
        ) then
          raise exception 'resolved marketplace contract authority is frozen'
            using errcode = '23514', constraint = 'ck__marketplace_contracts__frozen_authority';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_contracts__frozen_authority"
        before update on "marketplace_contracts"
        for each row execute function "enforce_marketplace_contract_frozen_authority"();
    `);
    for (const table of ['marketplace_carts', 'marketplace_request_offers', 'marketplace_contracts']) {
      const suffix = table.replace('marketplace_', '');
      this.addSql(`
        create constraint trigger "ct__${suffix}__party_coherence"
          after insert or update on "${table}"
          deferrable initially immediate for each row
          execute function "assert_marketplace_resolved_commerce_parties"();
      `);
    }
    this.addSql(`
      create function "assert_marketplace_resolved_request_party"() returns trigger as $$
      begin
        if new."binding_status" = 'resolved' and not exists (
          select 1 from "marketplace_partner_memberships" membership
          join "agritech_partners" partner on partner."id" = membership."partner_id"
          join "marketplace_request_organization_bindings" binding on binding."request_id" = new."id"
           where membership."tenant_id" = new."tenant_id" and membership."user_id" = new."buyer_user_id"
             and membership."partner_id" = new."buyer_partner_id" and membership."capability" = 'buyer'
             and membership."status" = 'active' and partner."status" = 'approved' and partner."kind" = 'buyer'
             and exists (
               select 1 from "marketplace_verifications" verification
                where verification."tenant_id" = new."tenant_id" and verification."user_id" = new."buyer_user_id"
                  and verification."role" = 'buyer' and verification."status" = 'verified'
             )
             and binding."tenant_id" = new."tenant_id" and binding."buyer_user_id" = new."buyer_user_id"
             and binding."buyer_partner_id" = new."buyer_partner_id"
        ) then
          raise exception 'marketplace request party mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_requests__party_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create constraint trigger "ct__marketplace_requests__party_coherence"
        after insert or update on "marketplace_requests"
        deferrable initially immediate for each row
        execute function "assert_marketplace_resolved_request_party"();
    `);
  }

  override down(): void {
    this.addSql(`drop trigger "ct__marketplace_requests__party_coherence" on "marketplace_requests";`);
    this.addSql(`drop function "assert_marketplace_resolved_request_party"();`);
    this.addSql(`drop trigger "tr__marketplace_contracts__frozen_authority" on "marketplace_contracts";`);
    this.addSql(`drop function "enforce_marketplace_contract_frozen_authority"();`);
    this.addSql(`drop trigger "ct__marketplace_request_offers__public_request" on "marketplace_request_offers";`);
    this.addSql(`drop function "assert_marketplace_offer_public_request"();`);
    this.addSql(`drop trigger "ct__contracts__party_coherence" on "marketplace_contracts";`);
    this.addSql(`drop trigger "ct__request_offers__party_coherence" on "marketplace_request_offers";`);
    this.addSql(`drop trigger "ct__carts__party_coherence" on "marketplace_carts";`);
    this.addSql(`drop function "assert_marketplace_resolved_commerce_parties"();`);
    this.addSql(`drop index "uq__marketplace_contracts__source_type_source_id";`);
    this.addSql(`drop index "ix__marketplace_contracts__seller_tenant_id_seller_use_f78f6f14";`);
    this.addSql(
      `alter table "marketplace_contracts" drop constraint "ck__marketplace_contracts__resolved_parties", drop constraint "ck__marketplace_contracts__binding_status", drop constraint "fk__marketplace_contracts__seller_partner_id", drop constraint "fk__marketplace_contracts__buyer_partner_id", drop column "binding_status", drop column "seller_party_snapshot", drop column "buyer_party_snapshot", drop column "seller_partner_id", drop column "seller_tenant_id", drop column "buyer_partner_id";`,
    );
    this.addSql(`drop function "marketplace_contract_lines_are_frozen"(jsonb);`);
    this.addSql(`drop function "marketplace_contract_snapshot_is_valid"(jsonb, varchar, varchar, uuid);`);
    this.addSql(`drop index "uq__marketplace_request_offers__request_id_seller_tena_78eb02ed";`);
    this.addSql(`drop index "ix__marketplace_request_offers__seller_tenant_id_selle_65cd20e7";`);
    this.addSql(
      `alter table "marketplace_request_offers" drop constraint "ck__marketplace_offers__resolved_parties", drop constraint "ck__marketplace_offers__binding_status", drop constraint "fk__marketplace_offers__seller_partner_id", drop constraint "fk__marketplace_offers__buyer_partner_id", drop constraint "fk__marketplace_offers__request_public_id", drop column "binding_status", drop column "seller_partner_id", drop column "seller_tenant_id", drop column "buyer_partner_id", drop column "buyer_user_id", drop column "request_public_id";`,
    );
    this.addSql(
      `drop trigger "tr__marketplace_request_bindings__resolve_party" on "marketplace_request_organization_bindings";`,
    );
    this.addSql(`drop function "resolve_marketplace_request_party_from_binding"();`);
    this.addSql(`drop index "ix__marketplace_requests__buyer_partner_id";`);
    this.addSql(
      `alter table "marketplace_requests" drop constraint "ck__marketplace_requests__resolved_party", drop constraint "ck__marketplace_requests__binding_status", drop constraint "fk__marketplace_requests__buyer_partner_id", drop column "binding_status", drop column "buyer_partner_id";`,
    );
    this.addSql(`drop index "uq__marketplace_carts__tenant_id_user_id_buyer_partner_490fd0d3";`);
    this.addSql(`drop index "ix__marketplace_carts__seller_tenant_id_seller_user_id_3d500628";`);
    this.addSql(
      `alter table "marketplace_carts" drop constraint "ck__marketplace_carts__resolved_parties", drop constraint "ck__marketplace_carts__binding_status", drop constraint "fk__marketplace_carts__seller_partner_id", drop constraint "fk__marketplace_carts__buyer_partner_id", drop column "binding_status", drop column "seller_partner_id", drop column "seller_user_id", drop column "seller_tenant_id", drop column "buyer_partner_id";`,
    );
    this.addSql(`drop trigger "tr__marketplace_commerce_operations__immutable" on "marketplace_commerce_operations";`);
    this.addSql(`drop function "enforce_marketplace_commerce_operation_immutability"();`);
    this.addSql(`drop table "marketplace_commerce_operations";`);
    this.addSql(`drop trigger "ct__agritech_partners__marketplace_membership_coherence" on "agritech_partners";`);
    this.addSql(`drop function "guard_marketplace_partner_membership_parent"();`);
    this.addSql(`drop trigger "tr__agritech_partners__marketplace_owner_membership" on "agritech_partners";`);
    this.addSql(`drop function "create_marketplace_owner_membership"();`);
    this.addSql(
      `drop trigger "tr__marketplace_partner_memberships__immutable_identity" on "marketplace_partner_memberships";`,
    );
    this.addSql(`drop function "enforce_marketplace_membership_identity_immutability"();`);
    this.addSql(`drop trigger "ct__marketplace_partner_memberships__coherence" on "marketplace_partner_memberships";`);
    this.addSql(`drop function "assert_marketplace_partner_membership_coherence"();`);
    this.addSql(`drop table "marketplace_partner_memberships";`);
  }
}
