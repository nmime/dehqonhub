// @requirements REQ-API-CLIENT-005
import { describe, expect, it } from 'vitest';
import { apiToastRuleCatalog } from './toast-rule-catalog';
import { adminApiToastRules, authApiToastRules, userApiToastRules } from './toast-rules';

const appsIn = (ids: readonly string[]): Set<string> =>
  new Set(ids.map((id) => id.slice(0, Math.max(id.indexOf(':'), 0))));

describe('api toast rule catalog', () => {
  it('collects every app with the presentation defaults each rule was generated with', () => {
    const catalog = apiToastRuleCatalog();

    expect(appsIn(catalog.map((item) => item.id))).toEqual(new Set(['admin-app-api', 'auth-app-api', 'user-app-api']));
    // One catalog entry per generated rule across all three configs: a rule the
    // console cannot show is a rule whose presentation nobody can override.
    expect(catalog.length).toBe(adminApiToastRules().length + authApiToastRules().length + userApiToastRules().length);

    expect(catalog[0]).toMatchObject({
      app: expect.stringMatching(/-app-api$/u),
      defaultDisplay: expect.stringMatching(/^(custom|modal|silent|toast)$/u),
      defaultMessage: expect.any(String),
      id: expect.stringContaining(':'),
      method: expect.stringMatching(/^[A-Z]+$/u),
      path: expect.stringMatching(/^\//u),
    });
  });

  it('builds the catalog once and hands back the same list on later reads', () => {
    expect(apiToastRuleCatalog()).toBe(apiToastRuleCatalog());
  });
});
