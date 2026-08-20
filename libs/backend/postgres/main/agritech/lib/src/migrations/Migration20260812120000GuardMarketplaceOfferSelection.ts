import { Migration } from '@mikro-orm/migrations';

/**
 * The surplus awards, kept and demoted rather than deleted.
 *
 * The winner is the award whose contract was frozen first: that is the deal the
 * two parties actually saw. Every later award on the same request is the defect,
 * so its offer returns to `declined` and the contract it produced is
 * `cancelled`. No row is removed, so an operator can still read what happened
 * and to whom.
 */
const demoteSurplusAwards = `
      with "ranked" as (
        select offer."id",
               row_number() over (
                 partition by offer."request_id"
                 order by contract."created_at" nulls last, offer."created_at", offer."id"
               ) as "award"
          from "marketplace_request_offers" offer
          left join "marketplace_contracts" contract
            on contract."source_type" = 'offer_selection'
           and contract."source_id" = offer."id"::text
         where offer."status" = 'accepted'
      )
      update "marketplace_request_offers" offer
         set "status" = 'declined'
        from "ranked"
       where "ranked"."id" = offer."id" and "ranked"."award" > 1;
    `;

const cancelSurplusContracts = `
      update "marketplace_contracts" contract
         set "status" = 'cancelled', "updated_at" = now()
       where contract."source_type" = 'offer_selection'
         and contract."status" <> 'cancelled'
         and exists (
           select 1 from "marketplace_request_offers" offer
            where offer."id"::text = contract."source_id" and offer."status" <> 'accepted'
         );
    `;

/**
 * A request that has already awarded an offer is not open for offers and not
 * choosable, whatever a re-run fixture wrote over its stage. This repair runs
 * before the stage guard exists, because the guard would refuse the very
 * transition that heals the row.
 */
const resolveAwardedRequestStages = `
      update "marketplace_requests" request
         set "status" = 'selected', "updated_at" = now()
       where request."status" in ('open', 'offering')
         and exists (
           select 1 from "marketplace_request_offers" offer
            where offer."request_id" = request."id" and offer."status" = 'accepted'
         );
    `;

const singleAwardIndex = `
      create unique index "uq__marketplace_request_offers__request_id"
        on "marketplace_request_offers" ("request_id")
        where "status" = 'accepted';
    `;

/**
 * `deferrable initially deferred` on purpose: the repository accepts the offer
 * and inserts the contract in one flush, and the order of those two writes
 * inside the flush is the ORM's business, not an invariant. Checking at commit
 * asks the only question that matters — when this transaction ends, does the
 * request hold more than one live contract?
 *
 * The rule deliberately says nothing about the state of the contract's own
 * source offer. A persisted rule stricter than the application path is its own
 * defect: it turns a command that passed every check into an unexpected server
 * error. Offer state is already owned by the repository and by
 * `uq__marketplace_request_offers__request_id`; what was missing, and all this
 * adds, is the request-level count.
 */
const singleOfferSelectionContractFunction = `
      create function "assert_marketplace_single_offer_selection_contract"() returns trigger as $$
      declare
        awarded_request uuid;
      begin
        if new."source_type" is distinct from 'offer_selection' or new."status" = 'cancelled' then
          return new;
        end if;
        select offer."request_id" into awarded_request
          from "marketplace_request_offers" offer
         where offer."id"::text = new."source_id";
        if awarded_request is not null and exists (
          select 1 from "marketplace_contracts" other
          join "marketplace_request_offers" offer on offer."id"::text = other."source_id"
           where other."id" <> new."id"
             and other."source_type" = 'offer_selection'
             and other."status" <> 'cancelled'
             and offer."request_id" = awarded_request
        ) then
          raise exception 'marketplace purchase request already has a contract'
            using errcode = '23514', constraint = 'ck__marketplace_contracts__offer_selection';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `;

const singleOfferSelectionContractTrigger = `
      create constraint trigger "ct__marketplace_contracts__offer_selection"
        after insert or update on "marketplace_contracts"
        deferrable initially deferred for each row
        execute function "assert_marketplace_single_offer_selection_contract"();
    `;

/**
 * The literal transitions are the frozen copy of `requestTransitions` in
 * `@app/backend-feature-agritech-shared`; a migration is history and must not
 * follow a constant that moves under it. `agritech.migration.spec.ts` asserts
 * this body against the live policy, so the two cannot drift apart silently.
 */
const requestStageAuthorityFunction = `
      create function "enforce_marketplace_request_stage_authority"() returns trigger as $$
      begin
        if new."status" is distinct from old."status" and not (
          (old."status" = 'open' and new."status" in ('offering', 'closed', 'expired'))
          or (old."status" = 'offering' and new."status" in ('selected', 'closed', 'expired'))
          or (old."status" = 'selected' and new."status" = 'closed')
        ) then
          raise exception 'marketplace request stage transition is not allowed'
            using errcode = '23514', constraint = 'ck__marketplace_requests__stage_authority';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `;

const requestStageAuthorityTrigger = `
      create trigger "tr__marketplace_requests__stage_authority"
        before update on "marketplace_requests"
        for each row execute function "enforce_marketplace_request_stage_authority"();
    `;

/**
 * One purchase request awards one offer and freezes one contract.
 *
 * That was true only for as long as `marketplace_requests."status"` stayed
 * `selected`. `chooseOffer` read that mutable column, and nothing else in the
 * database had an opinion: the only unique index on offers is partial on
 * `status = 'pending'`, so it constrains competing bids and says nothing about
 * accepted ones. Anything that wrote a used request back to `offering` — the
 * demo seeder's `on conflict ... set "status" = excluded."status"` did it on
 * every re-seed — re-armed the hole, and the request could award a second
 * seller. Reproduced on the development database: one grapes request carried
 * four `accepted` offers and four draft contracts of 88M, 87M, 86M and 85M UZS,
 * with four sellers each holding a contract they believed they had won.
 *
 * Three persisted rules replace that single mutable read, and each one alone is
 * enough to refuse the second award:
 *
 * - `uq__marketplace_request_offers__request_id` — at most one `accepted` offer
 *   per request, so a second acceptance cannot be written at all, by this
 *   repository, by a second API instance, or by hand in `psql`.
 * - `ct__marketplace_contracts__offer_selection` — an `offer_selection`
 *   contract must name an `accepted` offer, and no other live contract may
 *   already belong to that offer's request.
 * - `tr__marketplace_requests__stage_authority` — the request stage machine,
 *   so `selected` never walks back to a choosable stage and a re-seed cannot
 *   resurrect a decided request.
 *
 * The existing rows that the new rules declare impossible are repaired first,
 * by demotion and cancellation rather than deletion, because a demo database
 * must not contain a deal its own schema forbids and an audit trail must not be
 * quietly erased.
 */
export class Migration20260812120000GuardMarketplaceOfferSelection extends Migration {
  override up(): void {
    this.addSql(demoteSurplusAwards);
    this.addSql(cancelSurplusContracts);
    this.addSql(resolveAwardedRequestStages);
    this.addSql(singleAwardIndex);
    this.addSql(singleOfferSelectionContractFunction);
    this.addSql(singleOfferSelectionContractTrigger);
    this.addSql(requestStageAuthorityFunction);
    this.addSql(requestStageAuthorityTrigger);
  }

  override down(): void {
    this.addSql(`drop trigger "tr__marketplace_requests__stage_authority" on "marketplace_requests";`);
    this.addSql(`drop function "enforce_marketplace_request_stage_authority"();`);
    this.addSql(`drop trigger "ct__marketplace_contracts__offer_selection" on "marketplace_contracts";`);
    this.addSql(`drop function "assert_marketplace_single_offer_selection_contract"();`);
    this.addSql(`drop index "uq__marketplace_request_offers__request_id";`);
  }
}
