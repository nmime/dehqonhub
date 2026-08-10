import { Migration } from '@mikro-orm/migrations';

export class Migration20260810120000AddUzbekCyrillicLocale extends Migration {
  override up(): void {
    this.addSql(`
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru', 'uz', 'uz-cyrl'));
    `);
  }

  override down(): void {
    this.addSql(`
      update "auth_users" set "locale" = 'uz' where "locale" = 'uz-cyrl';
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru', 'uz'));
    `);
  }
}
