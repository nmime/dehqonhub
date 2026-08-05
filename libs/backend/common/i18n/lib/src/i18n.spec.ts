// @requirements REQ-RUNTIME-CONFIG-003 REQ-AGRITECH-I18N-012 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it, vi } from 'vitest';
import {
  I18nService,
  backendCatalogFileNames,
  createRequestLocaleMiddleware,
  getLocalization,
  hasTranslationKey,
  Language,
  parseAcceptLanguage,
  resolveLocale,
  resolveLanguageFromHeaders,
  resolveLanguageFromRequest,
  translate,
  translations,
} from './index';

describe('@app/backend-common-i18n', () => {
  it('owns only backend-common and error catalogs', () => {
    expect(backendCatalogFileNames).toEqual(['common/shared.json', 'common/errors.json']);
    expect(translations.en['common.language']).toBe('Language');
    expect(translations.en['bot.menu.main']).toBeUndefined();
    expect(translations.en['discord.commands.link.label']).toBeUndefined();
  });

  it('provides common translation and request locale utilities', () => {
    expect(hasTranslationKey('errors.rate-limited.title')).toBe(true);
    expect(hasTranslationKey('errors.marketplace-provider-unavailable.title')).toBe(true);
    expect(translate('errors.marketplace-provider-unavailable.title', { locale: 'en' })).toBe(
      'Marketplace Provider Unavailable',
    );
    expect(translate('errors.marketplace-provider-unavailable.title', { locale: 'ru' })).toBe(
      'Провайдер маркетплейса недоступен',
    );
    expect(translate('errors.marketplace-provider-unavailable.title', { locale: 'uz' })).toBe(
      'Marketpleys provayderi mavjud emas',
    );
    expect(translate('errors.marketplace-provider-unavailable.title', { locale: 'uz-cyrl' })).toBe(
      'Маркетплейс провайдери мавжуд эмас',
    );
    expect(translate('common.language', { locale: 'ru' })).toBe('Язык');
    expect(translate('common.ready', { locale: 'uz-Cyrl-UZ' })).toBe('Тайёр');
    expect(resolveLocale('ru-RU')).toBe('ru');
    expect(resolveLocale('uz')).toBe(Language.Uz);
    expect(resolveLocale('uz-Latn-UZ')).toBe(Language.Uz);
    expect(resolveLocale('UZ_CYRL_UZ')).toBe(Language.UzCyrl);
    expect(resolveLocale('uz-Cyrl-UZ')).toBe(Language.UzCyrl);
    expect(Language.En).toBe('en');
    expect(Language.Ru).toBe('ru');
    expect(Language.Uz).toBe('uz');
    expect(Language.UzCyrl).toBe('uz-cyrl');
    expect(getLocalization({ en: 'Hello', ru: 'Привет' }, Language.Ru)).toBe('Привет');
    expect(getLocalization({ en: 'Hello' }, 'fr')).toBe('Hello');
    expect(getLocalization({ ru: 'Привет' }, Language.En)).toBe('Привет');
    const i18n = new I18nService();
    expect(i18n.translate('common.ready', { locale: 'en' })).toBe('Ready');
    expect(i18n.resolveLocale('ru-RU')).toBe('ru');
    const request = { headers: { 'accept-language': 'ru' } };
    const next = vi.fn();
    createRequestLocaleMiddleware()(request, {}, next);
    expect(request).toMatchObject({ locale: 'ru', language: 'ru' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps lifecycle notification copy present and distinct in every supported catalog', () => {
    const key = 'marketplace.contract.notification.contractCompleted' as const;
    const localized = [
      translate(key, { locale: 'en' }),
      translate(key, { locale: 'ru' }),
      translate(key, { locale: 'uz' }),
      translate(key, { locale: 'uz-cyrl' }),
    ];

    expect(localized).toEqual(['Contract completed', 'Договор завершён', 'Shartnoma yakunlandi', 'Шартнома якунланди']);
    expect(new Set(localized).size).toBe(4);
    for (const catalog of Object.values(translations)) {
      expect(catalog[key]).toBeTruthy();
      expect(catalog['marketplace.contract.notification.updated']).toBeTruthy();
    }
  });

  it('resolves API language from case-insensitive and Fetch-style headers', () => {
    expect(resolveLanguageFromHeaders({ 'Accept-Language': 'en;q=0.2, ru-RU;q=0.9' })).toBe(Language.Ru);
    expect(resolveLanguageFromHeaders({ 'X-Locale': 'ru', 'Accept-Language': 'en' })).toBe(Language.Ru);
    expect(resolveLanguageFromHeaders({ get: (name) => (name === 'accept-language' ? 'ru-RU' : null) })).toBe(
      Language.Ru,
    );
    expect(resolveLanguageFromHeaders({ 'Accept-Language': ['fr', 'ru;q=0.8'] })).toBe(Language.Ru);
  });

  it('parses Accept-Language quality and preserves request resolver precedence', () => {
    expect(parseAcceptLanguage('ru;q=0, en;q=0.5')).toBe(Language.En);
    expect(parseAcceptLanguage('ru;q=bogus, en;q=0.5')).toBe(Language.En);
    expect(parseAcceptLanguage('fr, *;q=0.9')).toBeUndefined();
    expect(parseAcceptLanguage('uz-Cyrl-UZ;q=0.9, uz;q=0.8')).toBe(Language.UzCyrl);
    expect(resolveLanguageFromRequest({ query: { lang: 'en' }, headers: { 'Accept-Language': 'ru' } })).toBe(
      Language.En,
    );
  });
});
