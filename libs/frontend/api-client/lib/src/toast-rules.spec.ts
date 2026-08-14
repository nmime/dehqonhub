// @requirements REQ-API-CLIENT-005
import { describe, expect, it } from 'vitest';
import { adminApiToastRules, authApiToastRules, userApiToastRules } from './toast-rules';

const appsIn = (ids: readonly string[]): Set<string> =>
  new Set(ids.map((id) => id.slice(0, Math.max(id.indexOf(':'), 0))));

describe('api toast rules', () => {
  it('reads each generated config as parsed rules for its own app only', () => {
    expect(appsIn(adminApiToastRules().map((rule) => rule.id))).toEqual(new Set(['admin-app-api']));
    expect(appsIn(authApiToastRules().map((rule) => rule.id))).toEqual(new Set(['auth-app-api']));
    expect(appsIn(userApiToastRules().map((rule) => rule.id))).toEqual(new Set(['user-app-api']));
  });

  it('parses a config once and hands back the same rules on later reads', () => {
    // The toast runtime reads the rules on every failed request, so a second read
    // has to be a cache hit rather than a second pass over ~800 entries.
    expect(userApiToastRules()).toBe(userApiToastRules());
    expect(authApiToastRules()).toBe(authApiToastRules());
    expect(adminApiToastRules()).toBe(adminApiToastRules());
  });
});
