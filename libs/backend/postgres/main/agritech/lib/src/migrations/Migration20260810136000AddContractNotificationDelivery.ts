// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { Migration } from '@mikro-orm/migrations';

/** Adds a leased, idempotent post-commit delivery state machine to lifecycle intents. */
export class Migration20260810136000AddContractNotificationDelivery extends Migration {
  override up(): void {
    this.addSql(
      `drop trigger "tr__marketplace_contract_notification_intents__immutable" on "marketplace_contract_notification_intents";`,
    );
    this.addSql(`drop function "guard_marketplace_contract_notification_intent_immutable"();`);
    this.addSql(
      `alter table "marketplace_contract_notification_intents" drop constraint "ck__contract_notification_intents__status";`,
    );
    this.addSql(`alter table "marketplace_contract_notification_intents" alter column "status" type varchar(32);`);
    this.addSql(`
      alter table "marketplace_contract_notification_intents"
        add column "channel" varchar(20) not null default 'telegram',
        add column "provider_mode" varchar(10) not null default 'none',
        add column "provider_name" varchar(100) null,
        add column "recipient_locale" varchar(16) not null default 'en',
        add column "simulation" boolean not null default false,
        add column "attempts" int not null default 0,
        add column "channel_attempts" int not null default 0,
        add column "next_attempt_at" timestamptz not null default now(),
        add column "claimed_at" timestamptz not null default to_timestamp(0),
        add column "claim_token" uuid not null default '00000000-0000-0000-0000-000000000000',
        add column "last_attempt_at" timestamptz null,
        add column "last_error_code" varchar(80) null,
        add column "provider_reference" varchar(300) null,
        add column "safe_receipt" jsonb null,
        add column "dispatched_at" timestamptz null,
        add column "updated_at" timestamptz not null default now(),
        add constraint "ck__contract_notification_intents__status" check (
          "status" in ('pending', 'simulated', 'delivered', 'failed', 'reconciliation_required')
        ),
        add constraint "ck__contract_notification_intents__delivery_shape" check (
          "channel" in ('telegram', 'sms') and "provider_mode" in ('none', 'mock', 'live')
          and "attempts" between 0 and 10 and "channel_attempts" between 0 and 5
          and "channel_attempts" <= "attempts"
          and "recipient_locale" in ('en', 'ru', 'uz', 'uz-cyrl')
          and (("claim_token" = '00000000-0000-0000-0000-000000000000' and "claimed_at" = to_timestamp(0))
            or ("claim_token" <> '00000000-0000-0000-0000-000000000000' and "claimed_at" > to_timestamp(0)))
          and ("safe_receipt" is null or (jsonb_typeof("safe_receipt") = 'object' and pg_column_size("safe_receipt") <= 2048))
          and (("provider_mode" = 'none' and "provider_name" is null and "simulation" = false
                and "channel" = 'telegram' and "attempts" = 0 and "channel_attempts" = 0)
            or ("provider_mode" = 'mock' and btrim("provider_name") <> '' and "simulation" = true and "attempts" > 0)
            or ("provider_mode" = 'live' and btrim("provider_name") <> '' and "simulation" = false and "attempts" > 0))
          and (("status" = 'pending' and "provider_reference" is null and "safe_receipt" is null and "dispatched_at" is null)
            or ("status" = 'simulated' and "provider_mode" = 'mock' and "simulation" = true
              and "provider_reference" is not null and "safe_receipt" is not null and "dispatched_at" is not null
              and "claim_token" = '00000000-0000-0000-0000-000000000000')
            or ("status" = 'delivered' and "provider_mode" = 'live' and "simulation" = false
              and "provider_reference" is not null and "safe_receipt" is not null and "dispatched_at" is not null
              and "claim_token" = '00000000-0000-0000-0000-000000000000')
            or ("status" in ('failed', 'reconciliation_required') and "last_error_code" is not null
              and "claim_token" = '00000000-0000-0000-0000-000000000000'))
        );
    `);
    this.addSql(`
      create index "ix__marketplace_contract_notification_intents__status_b9dc6f48"
        on "marketplace_contract_notification_intents" ("status", "next_attempt_at", "claimed_at", "created_at");
    `);
    this.addSql(`
      create function "guard_marketplace_contract_notification_intent_delivery"() returns trigger as $$
      begin
        if tg_op = 'DELETE' then
          raise exception 'marketplace contract notification intent cannot be deleted'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__identity';
        end if;
        if old."id" <> new."id" or old."contract_id" <> new."contract_id"
          or old."timeline_event_id" <> new."timeline_event_id"
          or old."recipient_party" <> new."recipient_party" or old."template_key" <> new."template_key"
          or old."created_at" <> new."created_at" then
          raise exception 'marketplace contract notification intent identity is immutable'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__identity';
        end if;
        if old."status" <> 'pending' then
          raise exception 'terminal marketplace contract notification intent is immutable'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__terminal';
        end if;
        if new."attempts" < old."attempts" or new."attempts" > old."attempts" + 1 then
          raise exception 'marketplace contract notification attempts are monotonic'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__attempts';
        end if;
        if old."channel" = new."channel" then
          if new."channel_attempts" < old."channel_attempts"
            or new."channel_attempts" > old."channel_attempts" + 1
            or (new."channel_attempts" - old."channel_attempts") <> (new."attempts" - old."attempts") then
            raise exception 'marketplace contract notification channel attempts are monotonic'
              using errcode = '23514', constraint = 'ck__contract_notification_intents__channel_attempts';
          end if;
        elsif not (
          old."channel" = 'telegram' and new."channel" = 'sms'
          and old."attempts" > 0 and new."attempts" = old."attempts" and new."channel_attempts" = 0
          and old."claim_token" <> '00000000-0000-0000-0000-000000000000'
          and new."claim_token" = '00000000-0000-0000-0000-000000000000'
          and new."status" = 'pending' and new."last_error_code" like 'telegram:%:sms_fallback'
          and old."template_key" in (
            'marketplace.contract.artifact.stored',
            'marketplace.contract.factoring.requested',
            'marketplace.contract.factoring.approved',
            'marketplace.contract.factoring.rejected',
            'marketplace.contract.dispute.opened',
            'marketplace.contract.dispute.resolved'
          )
        ) then
          raise exception 'marketplace contract notification delivery channel transition is forbidden'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__channel_transition';
        end if;
        if old."provider_mode" <> 'none'
          and (old."provider_mode" <> new."provider_mode" or old."provider_name" is distinct from new."provider_name") then
          raise exception 'marketplace contract notification provider identity is frozen'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__provider_identity';
        end if;
        if old."attempts" > 0 and old."recipient_locale" <> new."recipient_locale" then
          raise exception 'marketplace contract notification recipient locale is frozen after dispatch starts'
            using errcode = '23514', constraint = 'ck__contract_notification_intents__recipient_locale';
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_contract_notification_intents__delivery_guard"
        before update or delete on "marketplace_contract_notification_intents"
        for each row execute function "guard_marketplace_contract_notification_intent_delivery"();
    `);
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from "marketplace_contract_notification_intents"
          where "status" <> 'pending' or "provider_mode" <> 'none' or "attempts" <> 0
            or "claim_token" <> '00000000-0000-0000-0000-000000000000'
            or "claimed_at" <> to_timestamp(0)
        ) then
          raise exception 'cannot remove notification delivery state after delivery processing has begun';
        end if;
      end $$;
    `);
    this.addSql(
      `drop trigger "tr__marketplace_contract_notification_intents__delivery_guard" on "marketplace_contract_notification_intents";`,
    );
    this.addSql(`drop function "guard_marketplace_contract_notification_intent_delivery"();`);
    this.addSql(`drop index "ix__marketplace_contract_notification_intents__status_b9dc6f48";`);
    this.addSql(
      `alter table "marketplace_contract_notification_intents" drop constraint "ck__contract_notification_intents__delivery_shape";`,
    );
    this.addSql(
      `alter table "marketplace_contract_notification_intents" drop constraint "ck__contract_notification_intents__status";`,
    );
    this.addSql(`
      alter table "marketplace_contract_notification_intents"
        drop column "channel", drop column "provider_mode", drop column "provider_name", drop column "recipient_locale",
        drop column "simulation",
        drop column "attempts", drop column "channel_attempts", drop column "next_attempt_at",
        drop column "claimed_at", drop column "claim_token",
        drop column "last_attempt_at", drop column "last_error_code", drop column "provider_reference",
        drop column "safe_receipt", drop column "dispatched_at", drop column "updated_at";
    `);
    this.addSql(`alter table "marketplace_contract_notification_intents" alter column "status" type varchar(10);`);
    this.addSql(
      `alter table "marketplace_contract_notification_intents" add constraint "ck__contract_notification_intents__status" check ("status" = 'pending');`,
    );
    this.addSql(`
      create function "guard_marketplace_contract_notification_intent_immutable"() returns trigger as $$
      begin
        raise exception 'marketplace contract notification intent is immutable'
          using errcode = '23514', constraint = 'ck__contract_notification_intents__immutable';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "tr__marketplace_contract_notification_intents__immutable"
        before update or delete on "marketplace_contract_notification_intents"
        for each row execute function "guard_marketplace_contract_notification_intent_immutable"();
    `);
  }
}
