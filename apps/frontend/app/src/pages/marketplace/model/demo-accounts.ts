export interface DemoAccount {
  email: string;
  password: string;
  roleKey: string;
}

/**
 * Public reviewer identities created by the guarded demo database seed.
 * Keep this list synchronized with packages/tooling/src/commands/db/seed-data.ts.
 */
export const demoAccounts: readonly DemoAccount[] = [
  /* eslint-disable sonarjs/no-hardcoded-passwords -- explicitly public demo-only reviewer credentials. */
  { email: 'dehqon@demo.dehqonhub.uz', password: 'DemoDehqon2026', roleKey: 'agritech.marketplace.demo.role.farmer' },
  {
    email: 'sotuvchi@demo.dehqonhub.uz',
    password: 'DemoSotuvchi2026',
    roleKey: 'agritech.marketplace.demo.role.seller',
  },
  { email: 'xaridor@demo.dehqonhub.uz', password: 'DemoXaridor2026', roleKey: 'agritech.marketplace.demo.role.buyer' },
  /* eslint-enable sonarjs/no-hardcoded-passwords */
];
