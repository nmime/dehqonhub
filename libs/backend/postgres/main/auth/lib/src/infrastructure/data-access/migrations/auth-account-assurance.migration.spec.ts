// @requirements REQ-AUTH-RECOVERY-010
import { describe, expect, it } from 'vitest';
import { authMigrations } from './index';
import { Migration20260811100000AddAuthAccountAssurance } from './Migration20260811100000AddAuthAccountAssurance';

const collectSql = (direction: 'up' | 'down'): string => {
  const migration = new Migration20260811100000AddAuthAccountAssurance(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  migration[direction]();
  return statements.join('\n');
};

describe('auth account assurance migration', () => {
  it('adds verification and credential revision state with a fail-closed rollback', () => {
    const up = collectSql('up');
    const down = collectSql('down');

    expect(up).toContain('"email_verified_at" timestamptz null');
    expect(up).toContain('"credential_revision" integer not null default 0');
    expect(up).toContain('constraint "ck__auth_users__credential_revision"');
    expect(down).toContain('Cannot remove auth account assurance after verification or password-reset traffic');
    expect(authMigrations.at(-1)).toBe(Migration20260811100000AddAuthAccountAssurance);
  });
});
