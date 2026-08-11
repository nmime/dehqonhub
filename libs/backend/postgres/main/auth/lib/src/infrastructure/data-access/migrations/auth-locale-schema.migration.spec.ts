// @requirements REQ-AUTH-PERSISTENCE-007 REQ-AGRITECH-I18N-012
import { describe, expect, it } from 'vitest';
import { Migration20260607080000AlignAuthUserLocaleConstraint } from './Migration20260607080000AlignAuthUserLocaleConstraint';
import { Migration20260802170000AddUzbekLocale } from './Migration20260802170000AddUzbekLocale';
import { Migration20260810120000AddUzbekCyrillicLocale } from './Migration20260810120000AddUzbekCyrillicLocale';
import { Migration20260811100000AddAuthAccountAssurance } from './Migration20260811100000AddAuthAccountAssurance';
import { Migration20260609100000CreateFeatureFlags } from '@app/backend-postgres-main-feature-flags';
import { authMigrations } from './index';

function collectSql(
  migration: { addSql(sql: string): void; up(): void; down(): void },
  direction: 'up' | 'down' = 'up',
) {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  migration[direction]();

  return statements.join('\n');
}

describe('auth locale schema migration', () => {
  it('replaces stale auth user locale constraints with en/ru', () => {
    const sql = collectSql(
      new Migration20260607080000AlignAuthUserLocaleConstraint(undefined as never, undefined as never),
    );

    expect(sql).toContain('drop constraint if exists "auth_users_locale_check"');
    expect(sql).toContain('drop constraint if exists "ck__auth_users__locale"');
    expect(sql).toContain('add constraint "ck__auth_users__locale"');
    expect(sql).toContain(`check ("locale" in ('en', 'ru'))`);
  });

  it('keeps the locale migration before later feature flag migrations', () => {
    expect(authMigrations).toContain(Migration20260607080000AlignAuthUserLocaleConstraint);
    expect(authMigrations.indexOf(Migration20260607080000AlignAuthUserLocaleConstraint)).toBeLessThan(
      authMigrations.indexOf(Migration20260609100000CreateFeatureFlags),
    );
  });

  it('extends the persisted locale constraint to Uzbek after the baseline migration', () => {
    const sql = collectSql(new Migration20260802170000AddUzbekLocale(undefined as never, undefined as never));

    expect(sql).toContain(`check ("locale" in ('en', 'ru', 'uz'))`);
    expect(authMigrations).toContain(Migration20260802170000AddUzbekLocale);
  });

  it('adds Uzbek Cyrillic and safely folds it back to Uzbek Latin on rollback', () => {
    const migration = new Migration20260810120000AddUzbekCyrillicLocale(undefined as never, undefined as never);
    const upSql = collectSql(migration);
    const downSql = collectSql(migration, 'down');

    expect(upSql).toContain(`check ("locale" in ('en', 'ru', 'uz', 'uz-cyrl'))`);
    expect(downSql).toContain(`update "auth_users" set "locale" = 'uz' where "locale" = 'uz-cyrl'`);
    expect(downSql).toContain(`check ("locale" in ('en', 'ru', 'uz'))`);
    expect(authMigrations.indexOf(Migration20260810120000AddUzbekCyrillicLocale)).toBeLessThan(
      authMigrations.indexOf(Migration20260811100000AddAuthAccountAssurance),
    );
  });
});
