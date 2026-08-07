export * from './shared';
export {
  defaultLocale,
  getLocalization,
  interpolate,
  isLanguage,
  Language,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveLocaleFromHeaders,
  resolveLocaleFromRequest,
  resolveLanguage,
  resolveLanguageFromHeaders,
  resolveLanguageFromRequest,
  supportedLocales,
} from '@app/common-i18n-runtime';
export type {
  Locale,
  LocaleHeaders,
  Localizations,
  LocaleRequestSource,
  TranslateOptions,
  TranslationParams,
} from '@app/common-i18n-runtime';
export type { TranslationKey } from '@app/common-i18n-keys';
