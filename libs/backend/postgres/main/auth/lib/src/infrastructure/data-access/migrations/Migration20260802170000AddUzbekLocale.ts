import { Migration } from '@mikro-orm/migrations';

export class Migration20260802170000AddUzbekLocale extends Migration {
  override up(): void {
    this.addSql(`
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru', 'uz'));
    `);
  }

  override down(): void {
    this.addSql(`
      update "auth_users" set "locale" = 'en' where "locale" = 'uz';
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru'));
    `);
  }
}
