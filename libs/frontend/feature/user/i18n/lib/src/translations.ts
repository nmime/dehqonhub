// @requirements REQ-AGRITECH-I18N-012
import enErrorsCatalog from '@app/i18n-en-common/errors.json';
import enCommonCatalog from '@app/i18n-en-common/shared.json';
import enAuthCatalog from '@app/i18n-en-user/auth.json';
import enSocialAuthCatalog from '@app/i18n-en-user/social-auth.json';
import enUserCatalog from '@app/i18n-en-user/shell.json';
import enUserSiteCatalog from '@app/i18n-en-user/site.json';
import enMobileCatalog from '@app/i18n-en-user/mobile.json';
import enTmaCatalog from '@app/i18n-en-user/tma.json';
import enAgriTechCatalog from '@app/i18n-en-user/agritech.json';
import enAgriTechOperationsCatalog from '@app/i18n-en-user/agritech-operations.json';
import enAgriTechMarketplaceCatalog from '@app/i18n-en-user/agritech-marketplace.json';
import ruErrorsCatalog from '@app/i18n-ru-common/errors.json';
import ruCommonCatalog from '@app/i18n-ru-common/shared.json';
import ruAuthCatalog from '@app/i18n-ru-user/auth.json';
import ruSocialAuthCatalog from '@app/i18n-ru-user/social-auth.json';
import ruUserCatalog from '@app/i18n-ru-user/shell.json';
import ruUserSiteCatalog from '@app/i18n-ru-user/site.json';
import ruMobileCatalog from '@app/i18n-ru-user/mobile.json';
import ruTmaCatalog from '@app/i18n-ru-user/tma.json';
import ruAgriTechCatalog from '@app/i18n-ru-user/agritech.json';
import ruAgriTechOperationsCatalog from '@app/i18n-ru-user/agritech-operations.json';
import ruAgriTechMarketplaceCatalog from '@app/i18n-ru-user/agritech-marketplace.json';
import uzErrorsCatalog from '@app/i18n-uz-common/errors.json';
import uzCommonCatalog from '@app/i18n-uz-common/shared.json';
import uzAuthCatalog from '@app/i18n-uz-user/auth.json';
import uzSocialAuthCatalog from '@app/i18n-uz-user/social-auth.json';
import uzUserCatalog from '@app/i18n-uz-user/shell.json';
import uzUserSiteCatalog from '@app/i18n-uz-user/site.json';
import uzMobileCatalog from '@app/i18n-uz-user/mobile.json';
import uzTmaCatalog from '@app/i18n-uz-user/tma.json';
import uzAgriTechCatalog from '@app/i18n-uz-user/agritech.json';
import uzAgriTechOperationsCatalog from '@app/i18n-uz-user/agritech-operations.json';
import uzAgriTechMarketplaceCatalog from '@app/i18n-uz-user/agritech-marketplace.json';
import { mergeLocaleCatalogFiles } from '@app/common-i18n-runtime';
import type { FrontendLocaleCatalogFileEntry, FrontendTranslations } from '@app/frontend-i18n-shared';

export const userFrontendCatalogFileNames = [
  'common/shared.json',
  'common/errors.json',
  'user/shell.json',
  'user/site.json',
  'user/mobile.json',
  'user/auth.json',
  'user/social-auth.json',
  'user/tma.json',
  'user/agritech.json',
  'user/agritech-operations.json',
  'user/agritech-marketplace.json',
] as const;

const enFiles = [
  ['common/shared.json', enCommonCatalog],
  ['common/errors.json', enErrorsCatalog],
  ['user/shell.json', enUserCatalog],
  ['user/site.json', enUserSiteCatalog],
  ['user/mobile.json', enMobileCatalog],
  ['user/auth.json', enAuthCatalog],
  ['user/social-auth.json', enSocialAuthCatalog],
  ['user/tma.json', enTmaCatalog],
  ['user/agritech.json', enAgriTechCatalog],
  ['user/agritech-operations.json', enAgriTechOperationsCatalog],
  ['user/agritech-marketplace.json', enAgriTechMarketplaceCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ['common/shared.json', ruCommonCatalog],
  ['common/errors.json', ruErrorsCatalog],
  ['user/shell.json', ruUserCatalog],
  ['user/site.json', ruUserSiteCatalog],
  ['user/mobile.json', ruMobileCatalog],
  ['user/auth.json', ruAuthCatalog],
  ['user/social-auth.json', ruSocialAuthCatalog],
  ['user/tma.json', ruTmaCatalog],
  ['user/agritech.json', ruAgriTechCatalog],
  ['user/agritech-operations.json', ruAgriTechOperationsCatalog],
  ['user/agritech-marketplace.json', ruAgriTechMarketplaceCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const uzFiles = [
  ['common/shared.json', uzCommonCatalog],
  ['common/errors.json', uzErrorsCatalog],
  ['user/shell.json', uzUserCatalog],
  ['user/site.json', uzUserSiteCatalog],
  ['user/mobile.json', uzMobileCatalog],
  ['user/auth.json', uzAuthCatalog],
  ['user/social-auth.json', uzSocialAuthCatalog],
  ['user/tma.json', uzTmaCatalog],
  ['user/agritech.json', uzAgriTechCatalog],
  ['user/agritech-operations.json', uzAgriTechOperationsCatalog],
  ['user/agritech-marketplace.json', uzAgriTechMarketplaceCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const userFrontendTranslations = {
  en: mergeLocaleCatalogFiles('en', enFiles),
  ru: mergeLocaleCatalogFiles('ru', ruFiles),
  uz: mergeLocaleCatalogFiles('uz', uzFiles),
} as const satisfies FrontendTranslations;
