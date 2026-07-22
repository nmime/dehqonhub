export type RuntimeLocaleCatalog = Record<string, string>;
export type RuntimeLocaleCatalogFileEntry<FileName extends string = string> = readonly [FileName, RuntimeLocaleCatalog];

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export const supportedLocales = ['en', 'ru'] as const;
export type Locale = (typeof supportedLocales)[number];
// eslint-disable-next-line sonarjs/redundant-type-aliases -- Public domain name retained alongside the locale representation.
export type Language = Locale;
export type RuntimeTranslations = Record<Locale, RuntimeLocaleCatalog>;
export const defaultLocale = 'en' satisfies Locale;

type LanguageMap = {
  readonly [CurrentLocale in Locale as Capitalize<CurrentLocale>]: CurrentLocale;
};

export const Language = Object.freeze(
  Object.fromEntries(supportedLocales.map((locale) => [`${locale.charAt(0).toUpperCase()}${locale.slice(1)}`, locale])),
) as LanguageMap;

export type Localizations<Value> = Partial<Record<Language | 'default', Value>>;

export interface TranslateOptions {
  locale?: string | null;
  params?: TranslationParams;
}

export type LocaleHeaders =
  Record<string, string | string[] | undefined> | { get(name: string): string | null | undefined };

export interface LocaleRequestSource {
  query?: Record<string, unknown>;
  headers?: LocaleHeaders;
  cookies?: Record<string, unknown>;
  language?: string;
  locale?: string;
  url?: string;
  originalUrl?: string;
}

const supportedLocaleSet = new Set<string>(supportedLocales);

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocaleSet.has(value);
}

export const isLanguage = isSupportedLocale;

export function getLocalization<Value>(
  localizations: { readonly [key: string]: Value | undefined } | null | undefined,
  language?: string | null,
): Value | undefined {
  if (!localizations) {
    return undefined;
  }

  const resolvedLanguage = normalizeLocale(language) ?? defaultLocale;
  const preferred = localizations[resolvedLanguage] ?? localizations[defaultLocale] ?? localizations.default;
  if (preferred !== undefined) {
    return preferred;
  }

  for (const supportedLocale of supportedLocales) {
    const fallback = localizations[supportedLocale];
    if (fallback !== undefined) {
      return fallback;
    }
  }

  return undefined;
}

export function mergeLocaleCatalogFiles<FileName extends string>(
  locale: Locale,
  files: readonly RuntimeLocaleCatalogFileEntry<FileName>[],
): RuntimeLocaleCatalog {
  const merged: RuntimeLocaleCatalog = {};

  for (const [fileName, catalog] of files) {
    for (const [key, value] of Object.entries(catalog)) {
      if (Object.hasOwn(merged, key)) {
        throw new Error(`Duplicate i18n key ${key} while merging ${locale}/${fileName}`);
      }

      merged[key] = value;
    }
  }

  return merged;
}

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace('_', '-');
  if (!normalized) {
    return undefined;
  }

  const candidates = [normalized, normalized.split('-')[0] ?? normalized];
  return candidates.find((candidate): candidate is Locale => supportedLocaleSet.has(candidate));
}

export function parseAcceptLanguage(value: string | null | undefined): Locale | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(',')
    .map((part, order) => {
      const [localePart, ...parameters] = part.trim().split(';');
      const qualityParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => /^q=/iu.test(parameter));
      const quality = qualityParameter ? Number(qualityParameter.slice(2)) : 1;
      return {
        locale: normalizeLocale(localePart),
        order,
        quality,
      };
    })
    .filter(
      (entry): entry is { locale: Locale; order: number; quality: number } =>
        Boolean(entry.locale) && Number.isFinite(entry.quality) && entry.quality > 0 && entry.quality <= 1,
    )
    .sort((left, right) => right.quality - left.quality || left.order - right.order)[0]?.locale;
}

export function resolveLocale(...values: Array<string | null | undefined>): Locale {
  for (const value of values) {
    const locale = normalizeLocale(value) ?? parseAcceptLanguage(value);
    if (locale) {
      return locale;
    }
  }

  return defaultLocale;
}

function headerValue(headers: LocaleHeaders | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name) ?? undefined;
  }

  const normalizedName = name.toLowerCase();
  const headerRecord = headers as Record<string, string | string[] | undefined>;
  const entry = Object.entries(headerRecord).find(([headerName]) => headerName.toLowerCase() === normalizedName);
  const value = entry?.[1];
  return Array.isArray(value) ? value.join(',') : value;
}

export function resolveLocaleFromHeaders(headers: LocaleHeaders | undefined): Locale {
  return resolveLocale(
    headerValue(headers, 'x-locale'),
    headerValue(headers, 'x-language'),
    headerValue(headers, 'accept-language'),
  );
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  return typeof value === 'string' ? value : undefined;
}

function localeFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, 'http://localhost');
    return parsed.searchParams.get('lang') ?? parsed.searchParams.get('locale') ?? undefined;
  } catch {
    return undefined;
  }
}

function firstCookieValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
  return resolveLocale(
    firstQueryValue(source.query?.lang),
    firstQueryValue(source.query?.locale),
    localeFromUrl(source.originalUrl ?? source.url),
    headerValue(source.headers, 'x-locale'),
    headerValue(source.headers, 'x-language'),
    firstCookieValue(source.cookies?.locale),
    firstCookieValue(source.cookies?.lang),
    source.locale,
    source.language,
    headerValue(source.headers, 'accept-language'),
  );
}

export const resolveLanguage = resolveLocale;
export const resolveLanguageFromHeaders = resolveLocaleFromHeaders;
export const resolveLanguageFromRequest = resolveLocaleFromRequest;

export function hasTranslationKeyIn<Key extends string>(
  translations: Record<Locale, Partial<Record<Key, string>>>,
  key: string,
): key is Key {
  return Object.hasOwn(getLocalization(translations, defaultLocale) ?? {}, key);
}

export function interpolate(message: string, params: TranslationParams = {}): string {
  return message.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translateFromCatalog<Key extends string>(
  translations: Record<Locale, Partial<Record<Key, string>>>,
  key: Key,
  { locale = defaultLocale, params = {} }: TranslateOptions = {},
): string {
  const resolvedLocale = normalizeLocale(locale) ?? defaultLocale;
  const localizedCatalog = getLocalization(translations, resolvedLocale);
  const defaultCatalog = getLocalization(translations, defaultLocale);
  const message = localizedCatalog?.[key] ?? defaultCatalog?.[key] ?? key;
  return interpolate(message, params);
}
