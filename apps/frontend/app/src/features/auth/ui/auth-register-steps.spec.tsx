// @requirements REQ-AGRITECH-EXPERIENCE-026
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmitEvent } from 'react';
import { AuthMode } from '@app/frontend-feature-user-auth';
import { AuthRegisterSteps } from './auth-register-steps';

interface Submission {
  displayName: string;
  email: string;
  mode: AuthMode;
  password: string;
}

const readField = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const renderSteps = (isTelegramEnabled = true) => {
  const submissions: Submission[] = [];
  const onSignIn = vi.fn();
  const onTelegram = vi.fn();
  const onSubmit = vi.fn((mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submissions.push({
      displayName: readField(data, 'displayName'),
      email: readField(data, 'email'),
      mode,
      password: readField(data, 'password'),
    });
  });

  render(
    <AuthRegisterSteps
      isRegisterPending={false}
      isTelegramEnabled={isTelegramEnabled}
      isTelegramPending={false}
      loadingLabel="loading"
      onSignIn={onSignIn}
      onSubmit={onSubmit}
      onTelegram={onTelegram}
      t={(key) => key}
    />,
  );

  return { onSignIn, onSubmit, onTelegram, submissions };
};

const chooseEmailMethod = () => {
  fireEvent.click(screen.getByRole('button', { name: /user\.auth\.step\.method\.email/u }));
};

const currentStep = () => screen.getByRole('listitem', { current: 'step' });

describe('AuthRegisterSteps', () => {
  afterEach(() => {
    cleanup();
  });

  it('collects three focused steps and submits one existing auth request', () => {
    const { submissions } = renderSteps();

    expect(currentStep().textContent).toContain('user.auth.step.method.label');
    expect(screen.getByText('user.auth.step.progress')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'user.auth.step.method.title' }));

    chooseEmailMethod();
    expect(currentStep().textContent).toContain('user.auth.step.identity.label');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'user.auth.step.identity.title' }));

    fireEvent.change(screen.getByLabelText('user.form.registerDisplayNameLabel'), {
      target: { value: 'Dilnoza' },
    });
    fireEvent.change(screen.getByLabelText('user.form.registerEmailLabel'), {
      target: { value: 'dilnoza@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'user.auth.action.continue' }));

    expect(currentStep().textContent).toContain('user.auth.step.credentials.label');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'user.auth.step.credentials.title' }));
    expect(screen.getByText('user.auth.step.credentials.summary')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('user.form.registerPasswordLabel'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'user.form.register' }));

    expect(submissions).toEqual([
      {
        displayName: 'Dilnoza',
        email: 'dilnoza@example.com',
        mode: AuthMode.Register,
        password: 'password123',
      },
    ]);
  });

  it('keeps non-secret identity values when the visitor steps back', () => {
    renderSteps();
    chooseEmailMethod();

    fireEvent.change(screen.getByLabelText('user.form.registerDisplayNameLabel'), {
      target: { value: 'Dilnoza' },
    });
    fireEvent.change(screen.getByLabelText('user.form.registerEmailLabel'), {
      target: { value: 'back@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'user.auth.action.continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'user.auth.action.back' }));

    expect((screen.getByLabelText('user.form.registerDisplayNameLabel') as HTMLInputElement).value).toBe('Dilnoza');
    expect((screen.getByLabelText('user.form.registerEmailLabel') as HTMLInputElement).value).toBe('back@example.com');
    expect(screen.queryByLabelText('user.form.registerPasswordLabel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'user.auth.action.back' }));
    expect(currentStep().textContent).toContain('user.auth.step.method.label');
  });

  it('delegates Telegram registration and retains a direct sign-in switch', () => {
    const { onSignIn, onTelegram } = renderSteps();

    fireEvent.click(screen.getByRole('button', { name: /user\.auth\.step\.method\.telegram/u }));
    expect(onTelegram).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'user.auth.signIn.action' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('omits Telegram where the provider is not configured', () => {
    renderSteps(false);

    expect(screen.queryByRole('button', { name: /user\.auth\.step\.method\.telegram/u })).toBeNull();
  });
});
