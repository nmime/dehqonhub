/**
 * Review logins published on the marketplace banner.
 *
 * The catalog itself is served by the API — including the demo dataset it falls
 * back to for a tenant that has published nothing — so the only thing the
 * frontend still carries is the set of accounts a reviewer can sign in with.
 */

export interface DemoAccount {
  email: string;
  password: string;
  /** Translation key describing what this account demonstrates. */
  roleKey: string;
}

/**
 * Surfaced in the home-page banner so a reviewer can sign in without being
 * handed credentials out of band. They are demonstration accounts for a seeded
 * demo tenant, never production ones, and the same three are created by the
 * database seed in `packages/tooling/src/commands/db/seed-data.ts` — keep both
 * lists in step.
 */
export const demoAccounts: readonly DemoAccount[] = [
  /* eslint-disable sonarjs/no-hardcoded-passwords -- demo tenant credentials that are published on the page by design. */
  { email: 'dehqon@demo.dehqonhub.uz', password: 'DemoDehqon2026', roleKey: 'agritech.marketplace.demo.role.farmer' },
  {
    email: 'sotuvchi@demo.dehqonhub.uz',
    password: 'DemoSotuvchi2026',
    roleKey: 'agritech.marketplace.demo.role.seller',
  },
  { email: 'xaridor@demo.dehqonhub.uz', password: 'DemoXaridor2026', roleKey: 'agritech.marketplace.demo.role.buyer' },
  /* eslint-enable sonarjs/no-hardcoded-passwords */
];
