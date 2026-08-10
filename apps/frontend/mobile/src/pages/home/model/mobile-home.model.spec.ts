// @requirements REQ-FRONTEND-NATIVE-006 REQ-AGRITECH-I18N-012
import { describe, expect, it } from 'vitest';

import { mobileCapabilityCards, mobileLocaleOptions } from './mobile-home.model';

describe('mobile home model', () => {
  it('keeps the launch surface backed by concrete setup cards', () => {
    expect(mobileCapabilityCards.map((card) => card.valueKey)).toEqual([
      'mobile.card.account.value',
      'mobile.card.native.value',
      'mobile.card.delivery.value',
    ]);
  });

  it('offers every shared product locale switch option', () => {
    expect(mobileLocaleOptions.map((option) => option.locale)).toEqual(['en', 'ru', 'uz', 'uz-cyrl']);
    expect(mobileLocaleOptions.map((option) => option.label)).toEqual([
      'English',
      'Русский',
      'O‘zbekcha (lotin)',
      'Ўзбекча (кирилл)',
    ]);
  });
});
