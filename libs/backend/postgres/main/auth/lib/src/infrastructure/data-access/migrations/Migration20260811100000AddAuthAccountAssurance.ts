import { Migration } from '@mikro-orm/migrations';

export class Migration20260811100000AddAuthAccountAssurance extends Migration {
  override up(): void {
    this.addSql(`
      alter table "auth_users"
        add column if not exists "email_verified_at" timestamptz null,
        add column if not exists "credential_revision" integer not null default 0;
    `);
    this.addSql(`
      alter table "auth_users"
        add constraint "ck__auth_users__credential_revision"
        check ("credential_revision" >= 0);
    `);
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        if exists (select 1 from "auth_users" where "email_verified_at" is not null or "credential_revision" <> 0) then
          raise exception 'Cannot remove auth account assurance after verification or password-reset traffic';
        end if;
      end $$;
    `);
    this.addSql('alter table "auth_users" drop constraint if exists "ck__auth_users__credential_revision";');
    this.addSql('alter table "auth_users" drop column if exists "credential_revision";');
    this.addSql('alter table "auth_users" drop column if exists "email_verified_at";');
  }
}
