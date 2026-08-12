import { useState, type SubmitEvent } from 'react';
import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { AuthMode } from '@app/frontend-feature-user-auth';
import { UiButton, UiCard, UiForm, UiTextField } from '../../../shared/ui';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

/** What the visitor has entered so far. */
interface RegisterDraft {
  displayName: string;
  email: string;
}

/** The email path, in the order a visitor walks it. */
const stepOrder = ['method', 'identity', 'credentials'] as const;

type RegisterStep = (typeof stepOrder)[number];

const stepLabels: Record<RegisterStep, TranslationKey> = {
  credentials: 'user.auth.step.credentials.label',
  identity: 'user.auth.step.identity.label',
  method: 'user.auth.step.method.label',
};

const readField = (form: FormData, name: string): string => {
  const value = form.get(name);
  /* v8 ignore next -- FormData yields a File only for a file input, and this flow has none; the fallback keeps the helper total. */
  return typeof value === 'string' ? value : '';
};

const stepState = (index: number, position: number): 'current' | 'done' | 'todo' => {
  if (index === position) {
    return 'current';
  }
  return index < position ? 'done' : 'todo';
};

/** Where the visitor is, and how much is left. */
function StepTrail({ current, t }: Readonly<{ current: RegisterStep; t: Translate }>) {
  const position = stepOrder.indexOf(current);

  return (
    <div className="user-auth__trail">
      <ol className="user-auth__steps">
        {stepOrder.map((step, index) => (
          <li
            aria-current={step === current ? 'step' : undefined}
            className="user-auth__step"
            data-state={stepState(index, position)}
            key={step}
          >
            <span className="user-auth__step-mark">{index + 1}</span>
            <span className="user-auth__step-label">{t(stepLabels[step])}</span>
          </li>
        ))}
      </ol>
      <p className="user-auth__progress">
        {t('user.auth.step.progress', {
          current: position + 1,
          total: stepOrder.length,
        })}
      </p>
    </div>
  );
}

/**
 * Step one: how to register.
 *
 * Telegram is the same redirect the sign-in card uses — the provider creates the
 * account on first arrival — so choosing it ends the flow here instead of asking
 * for a password the visitor would never use.
 */
function MethodStep({
  isTelegramEnabled,
  isTelegramPending,
  onEmail,
  onTelegram,
  t,
}: Readonly<{
  isTelegramEnabled: boolean;
  isTelegramPending: boolean;
  onEmail: () => void;
  onTelegram: () => void;
  t: Translate;
}>) {
  return (
    <div className="user-auth__step-body">
      <h4 className="user-auth__step-title">{t('user.auth.step.method.title')}</h4>
      <div className="user-auth__methods">
        <UiButton className="user-auth__method" onClick={onEmail} type="button" variant="secondary">
          <span className="user-auth__method-name">{t('user.auth.step.method.email')}</span>
          <span className="user-auth__method-hint">{t('user.auth.step.method.emailHint')}</span>
        </UiButton>
        {isTelegramEnabled ? (
          <UiButton
            className="user-auth__method"
            isLoading={isTelegramPending}
            loadingLabel={t('auth.social.status.pending', {
              provider: t('auth.provider.telegram'),
            })}
            onClick={onTelegram}
            type="button"
            variant="secondary"
          >
            <span className="user-auth__method-name">{t('user.auth.step.method.telegram')}</span>
            <span className="user-auth__method-hint">{t('user.auth.step.method.telegramHint')}</span>
          </UiButton>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Step two: who the visitor is.
 *
 * Every keystroke updates the draft, so stepping back and forward keeps what was
 * typed. The email field carries the browser's own validation, which is why each
 * step is a form of its own rather than one form with hidden panels.
 */
function IdentityStep({
  draft,
  onBack,
  onContinue,
  onDraft,
  t,
}: Readonly<{
  draft: RegisterDraft;
  onBack: () => void;
  onContinue: () => void;
  onDraft: (next: RegisterDraft) => void;
  t: Translate;
}>) {
  const capture = (form: HTMLFormElement) => {
    const data = new FormData(form);
    onDraft({
      displayName: readField(data, 'displayName'),
      email: readField(data, 'email'),
    });
  };

  return (
    <UiForm
      className="xr-auth-form"
      onChange={(event) => {
        capture(event.currentTarget);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        capture(event.currentTarget);
        onContinue();
      }}
    >
      <h4 className="user-auth__step-title">{t('user.auth.step.identity.title')}</h4>
      <UiTextField
        aria-label={t('user.form.registerDisplayNameLabel')}
        autoComplete="name"
        defaultValue={draft.displayName}
        hint={t('user.form.displayNameHint')}
        label={t('user.form.displayName')}
        name="displayName"
      />
      <UiTextField
        aria-label={t('user.form.registerEmailLabel')}
        autoComplete="email"
        defaultValue={draft.email}
        label={t('user.form.email')}
        name="email"
        placeholder={t('user.form.registerEmailPlaceholder')}
        required
        type="email"
      />
      <div className="user-auth__step-actions">
        <UiButton onClick={onBack} type="button" variant="secondary">
          {t('user.auth.action.back')}
        </UiButton>
        <UiButton type="submit">{t('user.auth.action.continue')}</UiButton>
      </div>
    </UiForm>
  );
}

/**
 * Step three: the password, and the request.
 *
 * The name and address collected earlier ride along as hidden fields so the
 * submit handler reads one `FormData` for the whole registration, exactly as it
 * did when all three lived in a single card.
 */
function CredentialsStep({
  draft,
  isRegisterPending,
  loadingLabel,
  onBack,
  onSubmit,
  t,
}: Readonly<{
  draft: RegisterDraft;
  isRegisterPending: boolean;
  loadingLabel: string;
  onBack: () => void;
  onSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  t: Translate;
}>) {
  return (
    <UiForm
      aria-busy={isRegisterPending}
      className="xr-auth-form"
      onSubmit={(event) => {
        onSubmit(AuthMode.Register, event);
      }}
    >
      <h4 className="user-auth__step-title">{t('user.auth.step.credentials.title')}</h4>
      <p className="user-auth__summary">{t('user.auth.step.credentials.summary', { email: draft.email })}</p>
      <input defaultValue={draft.displayName} name="displayName" type="hidden" />
      <input defaultValue={draft.email} name="email" type="hidden" />
      <UiTextField
        aria-label={t('user.form.registerPasswordLabel')}
        autoComplete="new-password"
        hint={t('user.form.passwordHint')}
        label={t('user.form.password')}
        minLength={8}
        name="password"
        placeholder={t('user.form.registerPasswordPlaceholder')}
        required
        type="password"
      />
      <div className="user-auth__step-actions">
        <UiButton onClick={onBack} type="button" variant="secondary">
          {t('user.auth.action.back')}
        </UiButton>
        <UiButton isLoading={isRegisterPending} loadingLabel={loadingLabel} type="submit">
          {t('user.form.register')}
        </UiButton>
      </div>
    </UiForm>
  );
}

export interface AuthRegisterStepsProps {
  isRegisterPending: boolean;
  isTelegramEnabled: boolean;
  isTelegramPending: boolean;
  loadingLabel: string;
  onSignIn: () => void;
  onSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  onTelegram: () => void;
  t: Translate;
}

/**
 * Registration as three short steps in one card.
 *
 * Asking for a method, a name, an address and a password on one screen is what
 * made this page read as a form dump; one question at a time with a visible trail
 * is the same request in the order a person answers it. Failures surface in the
 * profile state card beside the flow, so a rejected registration keeps the
 * password step and its values on screen.
 */
export function AuthRegisterSteps({
  isRegisterPending,
  isTelegramEnabled,
  isTelegramPending,
  loadingLabel,
  onSignIn,
  onSubmit,
  onTelegram,
  t,
}: Readonly<AuthRegisterStepsProps>) {
  const [step, setStep] = useState<RegisterStep>('method');
  const [draft, setDraft] = useState<RegisterDraft>({
    displayName: '',
    email: '',
  });

  return (
    // Untitled on purpose: the page heading directly above already reads "Create
    // an account", and repeating it inside the card put the same words twice in a
    // row. The step trail is this card's own heading.
    <UiCard className="user-auth__card user-auth__card--flow">
      <StepTrail current={step} t={t} />
      {step === 'method' ? (
        <MethodStep
          isTelegramEnabled={isTelegramEnabled}
          isTelegramPending={isTelegramPending}
          onEmail={() => {
            setStep('identity');
          }}
          onTelegram={onTelegram}
          t={t}
        />
      ) : null}
      {step === 'identity' ? (
        <IdentityStep
          draft={draft}
          onBack={() => {
            setStep('method');
          }}
          onContinue={() => {
            setStep('credentials');
          }}
          onDraft={setDraft}
          t={t}
        />
      ) : null}
      {step === 'credentials' ? (
        <CredentialsStep
          draft={draft}
          isRegisterPending={isRegisterPending}
          loadingLabel={loadingLabel}
          onBack={() => {
            setStep('identity');
          }}
          onSubmit={onSubmit}
          t={t}
        />
      ) : null}
      <p className="user-auth__switch">
        <span>{t('user.auth.signIn.prompt')}</span>
        <UiButton onClick={onSignIn} type="button" variant="link">
          {t('user.auth.signIn.action')}
        </UiButton>
      </p>
    </UiCard>
  );
}
