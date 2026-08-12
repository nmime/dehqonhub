import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { UiAlert, UiCard, UiEmptyState, UiLoading, UiToast } from '../../../shared/ui';
import type { ProfileState } from '../../../entities/profile';

export interface ProfileStatusCardProps {
  state: ProfileState;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function ProfileStatusCard({ state, t }: Readonly<ProfileStatusCardProps>) {
  return (
    <UiCard className="user-profile__card" title={t('user.profile.title')} id="profile">
      {state.status === 'loading' ? (
        <UiAlert className="xr-state-panel" tone="info">
          <UiLoading label={t('user.loadingProfile')} />
        </UiAlert>
      ) : null}
      {state.status === 'ready' ? (
        <div className="xr-profile-ready">
          <UiToast
            message={t('user.state.ready', {
              subject: state.email ?? state.subject,
            })}
            tone="success"
          />
          <dl className="xr-profile-facts">
            <div>
              <dt>{t('user.form.email')}</dt>
              <dd>{state.email ?? t('user.profile.emailFallback')}</dd>
            </div>
            {/* `subject` falls back to the email, so for an email session this row
                repeated the value directly above it under a label that was really the
                value fallback string ("unknown"). Show it only when it carries
                something the email row does not. */}
            {state.subject === state.email ? null : (
              <div>
                <dt>{t('user.profile.subject')}</dt>
                <dd>{state.subject}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : null}
      {state.status === 'unauthenticated' ? (
        <div className="xr-state-panel xr-state-panel--empty">
          {/* Its own title, not the card's: repeating `user.profile.title` printed
              "Profile state" twice, once as the card header and again as a large
              heading right beneath it. */}
          <UiEmptyState description={state.reason} title={t('user.profile.guestTitle')} />
        </div>
      ) : null}
      {state.status === 'forbidden' ? (
        <div className="xr-state-panel">
          <UiToast message={t('user.state.forbidden', { reason: state.reason })} tone="warning" />
        </div>
      ) : null}
    </UiCard>
  );
}
