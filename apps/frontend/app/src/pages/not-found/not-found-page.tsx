// @requirements REQ-AGRITECH-ROUTING-015
import { useI18n } from '@app/frontend-runtime';
import { UiEmptyState, UiSection } from '@app/frontend-ui-web';

export const NotFoundPage = () => {
  const { t } = useI18n();
  return (
    <UiSection eyebrow={t('user.notFound.eyebrow')} headingLevel={1} title={t('user.notFound.sectionTitle')}>
      <UiEmptyState description={t('user.notFound.description')} title={t('user.notFound.title')} />
    </UiSection>
  );
};
