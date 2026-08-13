import { Migration } from '@mikro-orm/migrations';

export class Migration20260810139000HardenMarketplaceCommands extends Migration {
  override up(): void {
    this.addSql(`
      alter table "marketplace_contracts"
        add column "version" int not null default 0,
        add constraint "ck__marketplace_contracts__version" check ("version" >= 0);
    `);
    this.addSql(`
      alter table "marketplace_commerce_operations"
        drop constraint "ck__marketplace_commerce_operations__operation";
    `);
    this.addSql(`
      alter table "marketplace_commerce_operations"
        add constraint "ck__marketplace_commerce_operations__operation" check (
          "operation" in (
            'cart_add', 'cart_update', 'cart_remove', 'cart_checkout',
            'request_create', 'offer_create', 'offer_choose',
            'verification_create', 'verification_submit', 'verification_review',
            'contract_delivery_quote'
          )
        );
    `);
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1
            from "marketplace_commerce_operations"
           where "operation" in (
             'verification_create', 'verification_submit', 'verification_review',
             'contract_delivery_quote'
           )
        ) or exists (select 1 from "marketplace_contracts" where "version" <> 0) then
          raise exception 'cannot remove marketplace command hardening after hardened command traffic has begun';
        end if;
      end
      $$;
    `);
    this.addSql(`
      alter table "marketplace_commerce_operations"
        drop constraint "ck__marketplace_commerce_operations__operation";
    `);
    this.addSql(`
      alter table "marketplace_commerce_operations"
        add constraint "ck__marketplace_commerce_operations__operation" check (
          "operation" in (
            'cart_add', 'cart_update', 'cart_remove', 'cart_checkout',
            'request_create', 'offer_create', 'offer_choose'
          )
        );
    `);
    this.addSql(`
      alter table "marketplace_contracts"
        drop constraint "ck__marketplace_contracts__version",
        drop column "version";
    `);
  }
}
