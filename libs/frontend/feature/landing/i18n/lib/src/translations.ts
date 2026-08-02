import enErrorsCatalog from '@app/i18n-en-common/errors.json';
import enCommonCatalog from '@app/i18n-en-common/shared.json';
import enLandingCatalog from '@app/i18n-en-landing/app.json';
import ruErrorsCatalog from '@app/i18n-ru-common/errors.json';
import ruCommonCatalog from '@app/i18n-ru-common/shared.json';
import ruLandingCatalog from '@app/i18n-ru-landing/app.json';
import uzErrorsCatalog from '@app/i18n-uz-common/errors.json';
import uzCommonCatalog from '@app/i18n-uz-common/shared.json';
import uzLandingCatalog from '@app/i18n-uz-landing/app.json';
import { mergeLocaleCatalogFiles } from '@app/common-i18n-runtime';
import type { FrontendLocaleCatalogFileEntry, FrontendTranslations } from '@app/frontend-i18n-shared';

export const landingFrontendCatalogFileNames = [
  'common/shared.json',
  'common/errors.json',
  'landing/app.json',
] as const;

const enFiles = [
  ['common/shared.json', enCommonCatalog],
  ['common/errors.json', enErrorsCatalog],
  ['landing/app.json', enLandingCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ['common/shared.json', ruCommonCatalog],
  ['common/errors.json', ruErrorsCatalog],
  ['landing/app.json', ruLandingCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const uzFiles = [
  ['common/shared.json', uzCommonCatalog],
  ['common/errors.json', uzErrorsCatalog],
  ['landing/app.json', uzLandingCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const landingFrontendTranslations = {
  en: mergeLocaleCatalogFiles('en', enFiles),
  ru: mergeLocaleCatalogFiles('ru', ruFiles),
  uz: mergeLocaleCatalogFiles('uz', uzFiles),
} as const satisfies FrontendTranslations;
