export interface DemoAccount {
  email: string;
  password: string;
  /** Short role label. */
  roleKey: string;
  /** What a reviewer is expected to do with this role, including its limits. */
  purposeKey: string;
}

/**
 * Public reviewer identities created by the guarded demo database seed.
 * Keep this list synchronized with packages/tooling/src/commands/db/seed-data.ts.
 *
 * The farmer identity is the one that buys everything and sells everything, and
 * its description says so. It read "dashboard only" for as long as the persisted
 * party-coherence triggers demanded a `buyer` verification on the buying side:
 * the copy was written to match a defect rather than the role model, even though
 * the same account already owned the co-operative that lists produce.
 * `Migration20260811110000AlignMarketplaceBuyerPartyRole` widened those triggers
 * to `marketplaceBuyerRoles`, which has always been `['farmer', 'buyer']`.
 */
export const demoAccounts: readonly DemoAccount[] = [
  /* eslint-disable sonarjs/no-hardcoded-passwords -- explicitly public demo-only reviewer credentials. */
  {
    email: 'dehqon@demo.dehqonhub.uz',
    password: 'DemoDehqon2026',
    purposeKey: 'agritech.marketplace.demo.purpose.farmer',
    roleKey: 'agritech.marketplace.demo.role.farmer',
  },
  {
    email: 'sotuvchi@demo.dehqonhub.uz',
    password: 'DemoSotuvchi2026',
    purposeKey: 'agritech.marketplace.demo.purpose.seller',
    roleKey: 'agritech.marketplace.demo.role.seller',
  },
  {
    email: 'xaridor@demo.dehqonhub.uz',
    password: 'DemoXaridor2026',
    purposeKey: 'agritech.marketplace.demo.purpose.buyer',
    roleKey: 'agritech.marketplace.demo.role.buyer',
  },
  /* eslint-enable sonarjs/no-hardcoded-passwords */
];
