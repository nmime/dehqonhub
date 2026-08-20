import { Migration } from '@mikro-orm/migrations';

const commercePartyCoherenceFunction = (buyerRolePredicate: string, sellerRolePredicate: string): string => `
      create or replace function "assert_marketplace_resolved_commerce_parties"() returns trigger as $$
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
                  and ${buyerRolePredicate} and verification."status" = 'verified'
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
                  and ${sellerRolePredicate} and verification."status" = 'verified'
             )
        ) then
          raise exception 'marketplace resolved commerce party mismatch'
            using errcode = '23514', constraint = 'ck__marketplace_commerce__party_coherence';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `;

const requestPartyCoherenceFunction = (buyerRolePredicate: string): string => `
      create or replace function "assert_marketplace_resolved_request_party"() returns trigger as $$
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
                  and ${buyerRolePredicate} and verification."status" = 'verified'
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
    `;

const listingSampleCoherenceFunction = (buyerRolePredicate: string): string => `
      create or replace function "assert_marketplace_listing_sample_coherence"() returns trigger as $$
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
               and verification."user_id" = membership."user_id" and ${buyerRolePredicate}
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
    `;

const listingReviewCoherenceFunction = (buyerRolePredicate: string): string => `
      create or replace function "assert_marketplace_listing_review_coherence"() returns trigger as $$
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
             and ${buyerRolePredicate} and verification."status" = 'verified'
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
    `;

const buyingRoles = `verification."role" in ('buyer', 'farmer')`;
const buyerOnly = `verification."role" = 'buyer'`;
const sellingRoles = `verification."role" in ('seller', 'farmer')`;

/**
 * Every persisted buying-side invariant accepted only a `buyer` verification,
 * while `marketplaceBuyerRoles` — the single domain policy behind
 * `canBuyInMarketplace` and behind the repositories' own buyer branches — has
 * always been `['farmer', 'buyer']`. A farmer may buy everything; that is the
 * owner's model and the authorization layer already agreed with it. Four
 * constraint-trigger functions did not:
 *
 * - `assert_marketplace_resolved_commerce_parties` (carts, request offers and
 *   contracts),
 * - `assert_marketplace_resolved_request_party` (purchase requests),
 * - `assert_marketplace_listing_sample_coherence` (sample requests),
 * - `assert_marketplace_listing_review_coherence` (post-deal reviews).
 *
 * A farmer with an active `buyer` membership on an approved `buyer`
 * organization and a verified `farmer` verification therefore passed every
 * application check and then tripped the trigger: the insert raised `23514`
 * inside the transaction and answered HTTP 500 instead of a typed RFC 9457
 * problem. This is the same class of mismatch that
 * `Migration20260810140000AlignMarketplaceSellerPartyRole` repaired on the
 * selling side, and it is repaired the same way.
 *
 * The persisted invariant catches up to the domain policy rather than the
 * reverse. A buying party is still required to hold an active `buyer`
 * membership on an approved `buyer` partner plus a verified verification, and
 * only the accepted verification role widens to the same two roles the
 * application already authorizes. The selling side keeps the two roles
 * `Migration20260810140000AlignMarketplaceSellerPartyRole` gave it, and nothing
 * about organization kind, membership capability, approval state or
 * verification status changes.
 */
export class Migration20260811110000AlignMarketplaceBuyerPartyRole extends Migration {
  override up(): void {
    this.addSql(commercePartyCoherenceFunction(buyingRoles, sellingRoles));
    this.addSql(requestPartyCoherenceFunction(buyingRoles));
    this.addSql(listingSampleCoherenceFunction(buyingRoles));
    this.addSql(listingReviewCoherenceFunction(buyingRoles));
  }

  override down(): void {
    this.addSql(commercePartyCoherenceFunction(buyerOnly, sellingRoles));
    this.addSql(requestPartyCoherenceFunction(buyerOnly));
    this.addSql(listingSampleCoherenceFunction(buyerOnly));
    this.addSql(listingReviewCoherenceFunction(buyerOnly));
  }
}
