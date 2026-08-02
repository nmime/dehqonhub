import enTelegramCatalog from '@app/i18n-en-bots/telegram.json';
import enBotSharedCatalog from '@app/i18n-en-bots/shared.json';
import ruTelegramCatalog from '@app/i18n-ru-bots/telegram.json';
import ruBotSharedCatalog from '@app/i18n-ru-bots/shared.json';
import uzTelegramCatalog from '@app/i18n-uz-bots/telegram.json';
import uzBotSharedCatalog from '@app/i18n-uz-bots/shared.json';
import { translations as backendTranslations } from '@app/backend-common-i18n';
import {
  defaultLocale,
  mergeLocaleCatalogFiles,
  resolveLocale,
  supportedLocales,
  translateFromCatalog,
  type Locale,
  type RuntimeLocaleCatalog,
  type TranslateOptions,
} from '@app/common-i18n-runtime';
import type { TranslationKey } from '@app/common-i18n-keys';
import type { TelegramBotContext, TelegramLinkedUserProfile } from './type';

export type { Locale, TranslationKey };
export { defaultLocale, supportedLocales };

export const telegramCatalogFileNames = [
  'common/shared.json',
  'common/errors.json',
  'bots/shared.json',
  'bots/telegram.json',
] as const;

export const telegramTranslations = {
  en: mergeLocaleCatalogFiles('en', [
    ['backend-common', backendTranslations.en],
    ['bots/shared.json', enBotSharedCatalog],
    ['bots/telegram.json', enTelegramCatalog],
  ]),
  ru: mergeLocaleCatalogFiles('ru', [
    ['backend-common', backendTranslations.ru],
    ['bots/shared.json', ruBotSharedCatalog],
    ['bots/telegram.json', ruTelegramCatalog],
  ]),
  uz: mergeLocaleCatalogFiles('uz', [
    ['backend-common', backendTranslations.uz],
    ['bots/shared.json', uzBotSharedCatalog],
    ['bots/telegram.json', uzTelegramCatalog],
  ]),
} as const satisfies Record<Locale, RuntimeLocaleCatalog>;

export function translate(key: TranslationKey, options: TranslateOptions = {}): string {
  return translateFromCatalog(telegramTranslations, key, options);
}

export function resolveTelegramLocale(input: {
  linkedUser?: Pick<TelegramLinkedUserProfile, 'locale'> | null;
  sessionLocale?: string | null;
  identityLocale?: string | null;
  telegramLanguageCode?: string | null;
}): Locale {
  return resolveLocale(
    input.linkedUser?.locale,
    input.sessionLocale,
    input.identityLocale,
    input.telegramLanguageCode,
    defaultLocale,
  );
}

export function createI18nMiddleware() {
  return async (ctx: TelegramBotContext, next: () => Promise<void>) => {
    ctx.t = (key: TranslationKey) => translate(key, { locale: ctx.session.locale ?? defaultLocale });
    await next();
  };
}
