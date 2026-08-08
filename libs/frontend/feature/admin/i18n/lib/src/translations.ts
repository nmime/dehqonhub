import enAdminAuditCatalog from '@app/i18n-en-admin/audit.json';
import enAdminDashboardCatalog from '@app/i18n-en-admin/dashboard.json';
import enAdminFeatureFlagsCatalog from '@app/i18n-en-admin/feature-flags.json';
import enAdminNavigationCatalog from '@app/i18n-en-admin/navigation.json';
import enAdminNotificationOptionsCatalog from '@app/i18n-en-admin/notification-options.json';
import enAdminRolesCatalog from '@app/i18n-en-admin/roles.json';
import enAdminProblemPresentationsCatalog from '@app/i18n-en-admin/problem-presentations.json';
import enAdminNotificationsCatalog from '@app/i18n-en-admin/notifications.json';
import enAdminNotificationNavigationCatalog from '@app/i18n-en-admin/notification-navigation.json';
import enAdminLoginAnalyticsCatalog from '@app/i18n-en-admin/login-analytics.json';
import enAdminCatalog from '@app/i18n-en-admin/shell.json';
import enAdminAgriTechCatalog from '@app/i18n-en-admin/agritech.json';
import enAdminUsersCatalog from '@app/i18n-en-admin/users.json';
import enErrorsCatalog from '@app/i18n-en-common/errors.json';
import enCommonCatalog from '@app/i18n-en-common/shared.json';
import ruAdminAuditCatalog from '@app/i18n-ru-admin/audit.json';
import ruAdminDashboardCatalog from '@app/i18n-ru-admin/dashboard.json';
import ruAdminFeatureFlagsCatalog from '@app/i18n-ru-admin/feature-flags.json';
import ruAdminNavigationCatalog from '@app/i18n-ru-admin/navigation.json';
import ruAdminNotificationOptionsCatalog from '@app/i18n-ru-admin/notification-options.json';
import ruAdminRolesCatalog from '@app/i18n-ru-admin/roles.json';
import ruAdminProblemPresentationsCatalog from '@app/i18n-ru-admin/problem-presentations.json';
import ruAdminNotificationsCatalog from '@app/i18n-ru-admin/notifications.json';
import ruAdminNotificationNavigationCatalog from '@app/i18n-ru-admin/notification-navigation.json';
import ruAdminLoginAnalyticsCatalog from '@app/i18n-ru-admin/login-analytics.json';
import ruAdminCatalog from '@app/i18n-ru-admin/shell.json';
import ruAdminAgriTechCatalog from '@app/i18n-ru-admin/agritech.json';
import ruAdminUsersCatalog from '@app/i18n-ru-admin/users.json';
import ruErrorsCatalog from '@app/i18n-ru-common/errors.json';
import ruCommonCatalog from '@app/i18n-ru-common/shared.json';
import uzAdminAuditCatalog from '@app/i18n-uz-admin/audit.json';
import uzAdminDashboardCatalog from '@app/i18n-uz-admin/dashboard.json';
import uzAdminFeatureFlagsCatalog from '@app/i18n-uz-admin/feature-flags.json';
import uzAdminNavigationCatalog from '@app/i18n-uz-admin/navigation.json';
import uzAdminNotificationOptionsCatalog from '@app/i18n-uz-admin/notification-options.json';
import uzAdminRolesCatalog from '@app/i18n-uz-admin/roles.json';
import uzAdminProblemPresentationsCatalog from '@app/i18n-uz-admin/problem-presentations.json';
import uzAdminNotificationsCatalog from '@app/i18n-uz-admin/notifications.json';
import uzAdminNotificationNavigationCatalog from '@app/i18n-uz-admin/notification-navigation.json';
import uzAdminLoginAnalyticsCatalog from '@app/i18n-uz-admin/login-analytics.json';
import uzAdminCatalog from '@app/i18n-uz-admin/shell.json';
import uzAdminAgriTechCatalog from '@app/i18n-uz-admin/agritech.json';
import uzAdminUsersCatalog from '@app/i18n-uz-admin/users.json';
import uzErrorsCatalog from '@app/i18n-uz-common/errors.json';
import uzCommonCatalog from '@app/i18n-uz-common/shared.json';
import uzCyrlAdminAuditCatalog from '@app/i18n-uz-cyrl-admin/audit.json';
import uzCyrlAdminDashboardCatalog from '@app/i18n-uz-cyrl-admin/dashboard.json';
import uzCyrlAdminFeatureFlagsCatalog from '@app/i18n-uz-cyrl-admin/feature-flags.json';
import uzCyrlAdminNavigationCatalog from '@app/i18n-uz-cyrl-admin/navigation.json';
import uzCyrlAdminNotificationOptionsCatalog from '@app/i18n-uz-cyrl-admin/notification-options.json';
import uzCyrlAdminRolesCatalog from '@app/i18n-uz-cyrl-admin/roles.json';
import uzCyrlAdminProblemPresentationsCatalog from '@app/i18n-uz-cyrl-admin/problem-presentations.json';
import uzCyrlAdminNotificationsCatalog from '@app/i18n-uz-cyrl-admin/notifications.json';
import uzCyrlAdminNotificationNavigationCatalog from '@app/i18n-uz-cyrl-admin/notification-navigation.json';
import uzCyrlAdminLoginAnalyticsCatalog from '@app/i18n-uz-cyrl-admin/login-analytics.json';
import uzCyrlAdminCatalog from '@app/i18n-uz-cyrl-admin/shell.json';
import uzCyrlAdminAgriTechCatalog from '@app/i18n-uz-cyrl-admin/agritech.json';
import uzCyrlAdminUsersCatalog from '@app/i18n-uz-cyrl-admin/users.json';
import uzCyrlErrorsCatalog from '@app/i18n-uz-cyrl-common/errors.json';
import uzCyrlCommonCatalog from '@app/i18n-uz-cyrl-common/shared.json';
import { mergeLocaleCatalogFiles } from '@app/common-i18n-runtime';
import type { FrontendLocaleCatalogFileEntry, FrontendTranslations } from '@app/frontend-i18n-shared';

export const adminFrontendCatalogFileNames = [
  'common/shared.json',
  'common/errors.json',
  'admin/shell.json',
  'admin/navigation.json',
  'admin/dashboard.json',
  'admin/feature-flags.json',
  'admin/users.json',
  'admin/audit.json',
  'admin/roles.json',
  'admin/problem-presentations.json',
  'admin/notifications.json',
  'admin/notification-options.json',
  'admin/notification-navigation.json',
  'admin/login-analytics.json',
  'admin/agritech.json',
] as const;

const enFiles = [
  ['common/shared.json', enCommonCatalog],
  ['common/errors.json', enErrorsCatalog],
  ['admin/shell.json', enAdminCatalog],
  ['admin/navigation.json', enAdminNavigationCatalog],
  ['admin/dashboard.json', enAdminDashboardCatalog],
  ['admin/feature-flags.json', enAdminFeatureFlagsCatalog],
  ['admin/users.json', enAdminUsersCatalog],
  ['admin/audit.json', enAdminAuditCatalog],
  ['admin/roles.json', enAdminRolesCatalog],
  ['admin/problem-presentations.json', enAdminProblemPresentationsCatalog],
  ['admin/notifications.json', enAdminNotificationsCatalog],
  ['admin/notification-options.json', enAdminNotificationOptionsCatalog],
  ['admin/notification-navigation.json', enAdminNotificationNavigationCatalog],
  ['admin/login-analytics.json', enAdminLoginAnalyticsCatalog],
  ['admin/agritech.json', enAdminAgriTechCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ['common/shared.json', ruCommonCatalog],
  ['common/errors.json', ruErrorsCatalog],
  ['admin/shell.json', ruAdminCatalog],
  ['admin/navigation.json', ruAdminNavigationCatalog],
  ['admin/dashboard.json', ruAdminDashboardCatalog],
  ['admin/feature-flags.json', ruAdminFeatureFlagsCatalog],
  ['admin/users.json', ruAdminUsersCatalog],
  ['admin/audit.json', ruAdminAuditCatalog],
  ['admin/roles.json', ruAdminRolesCatalog],
  ['admin/problem-presentations.json', ruAdminProblemPresentationsCatalog],
  ['admin/notifications.json', ruAdminNotificationsCatalog],
  ['admin/notification-options.json', ruAdminNotificationOptionsCatalog],
  ['admin/notification-navigation.json', ruAdminNotificationNavigationCatalog],
  ['admin/login-analytics.json', ruAdminLoginAnalyticsCatalog],
  ['admin/agritech.json', ruAdminAgriTechCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const uzFiles = [
  ['common/shared.json', uzCommonCatalog],
  ['common/errors.json', uzErrorsCatalog],
  ['admin/shell.json', uzAdminCatalog],
  ['admin/navigation.json', uzAdminNavigationCatalog],
  ['admin/dashboard.json', uzAdminDashboardCatalog],
  ['admin/feature-flags.json', uzAdminFeatureFlagsCatalog],
  ['admin/users.json', uzAdminUsersCatalog],
  ['admin/audit.json', uzAdminAuditCatalog],
  ['admin/roles.json', uzAdminRolesCatalog],
  ['admin/problem-presentations.json', uzAdminProblemPresentationsCatalog],
  ['admin/notifications.json', uzAdminNotificationsCatalog],
  ['admin/notification-options.json', uzAdminNotificationOptionsCatalog],
  ['admin/notification-navigation.json', uzAdminNotificationNavigationCatalog],
  ['admin/login-analytics.json', uzAdminLoginAnalyticsCatalog],
  ['admin/agritech.json', uzAdminAgriTechCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const uzCyrlFiles = [
  ['common/shared.json', uzCyrlCommonCatalog],
  ['common/errors.json', uzCyrlErrorsCatalog],
  ['admin/shell.json', uzCyrlAdminCatalog],
  ['admin/navigation.json', uzCyrlAdminNavigationCatalog],
  ['admin/dashboard.json', uzCyrlAdminDashboardCatalog],
  ['admin/feature-flags.json', uzCyrlAdminFeatureFlagsCatalog],
  ['admin/users.json', uzCyrlAdminUsersCatalog],
  ['admin/audit.json', uzCyrlAdminAuditCatalog],
  ['admin/roles.json', uzCyrlAdminRolesCatalog],
  ['admin/problem-presentations.json', uzCyrlAdminProblemPresentationsCatalog],
  ['admin/notifications.json', uzCyrlAdminNotificationsCatalog],
  ['admin/notification-options.json', uzCyrlAdminNotificationOptionsCatalog],
  ['admin/notification-navigation.json', uzCyrlAdminNotificationNavigationCatalog],
  ['admin/login-analytics.json', uzCyrlAdminLoginAnalyticsCatalog],
  ['admin/agritech.json', uzCyrlAdminAgriTechCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const adminFrontendTranslations = {
  en: mergeLocaleCatalogFiles('en', enFiles),
  ru: mergeLocaleCatalogFiles('ru', ruFiles),
  uz: mergeLocaleCatalogFiles('uz', uzFiles),
  'uz-cyrl': mergeLocaleCatalogFiles('uz-cyrl', uzCyrlFiles),
} as const satisfies FrontendTranslations;
