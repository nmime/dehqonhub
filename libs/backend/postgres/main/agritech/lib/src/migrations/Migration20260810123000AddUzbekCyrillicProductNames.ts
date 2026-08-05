import { Migration } from '@mikro-orm/migrations';

export class Migration20260810123000AddUzbekCyrillicProductNames extends Migration {
  override up(): void {
    this.addSql(`
      alter table "products"
        add column if not exists "name_uz_cyrl" varchar(200) not null default '';
      alter table "products" alter column "name_uz_cyrl" drop default;
      alter table "products" alter column "name_uz_cyrl" drop not null;
      update "products" set "name_uz_cyrl" = null where "name_uz_cyrl" = '';
    `);
  }

  override down(): void {
    this.addSql('alter table "products" drop column if exists "name_uz_cyrl";');
  }
}
