import { Migration } from '@mikro-orm/migrations';

const sellerPartyCoherenceFunction = (sellerRolePredicate: string): string => `
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

/**
 * `assert_marketplace_resolved_commerce_parties` accepted only a `seller`
 * verification on the selling side of a resolved cart, offer or contract, while
 * `marketplaceSellerRoles` — the single domain policy behind
 * `canOfferInMarketplace` and behind the repository's own
 * `lockAuthorizedMarketplaceParty` seller branch — has always been
 * `['farmer', 'seller']`. The two authorities disagreed, so a farmer-owned
 * supplier organization passed every application check and then tripped the
 * constraint trigger: `POST /marketplace/cart/items` for any produce listing
 * raised `23514` inside the transaction and answered HTTP 500 instead of a
 * typed RFC 9457 problem. On the seeded catalog that was every produce listing,
 * because the produce co-operative is owned by the farmer login on purpose.
 *
 * The persisted invariant therefore catches up to the domain policy rather than
 * the reverse: a selling party is still required to hold an active `seller`
 * membership on an approved `supplier` partner plus a verified verification,
 * and only the accepted verification role widens to the same two roles the
 * application already authorizes. Nothing about the buying side changes.
 */
export class Migration20260810140000AlignMarketplaceSellerPartyRole extends Migration {
  override up(): void {
    this.addSql(sellerPartyCoherenceFunction(`verification."role" in ('seller', 'farmer')`));
  }

  override down(): void {
    this.addSql(sellerPartyCoherenceFunction(`verification."role" = 'seller'`));
  }
}
