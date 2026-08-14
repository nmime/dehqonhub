// @requirements REQ-FRONTEND-SHELL-004
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProfileState } from '../../../entities/profile';
import { ProfileStatusCard, type ProfileStatusCardProps } from './profile-status-card';

const t: ProfileStatusCardProps['t'] = (key) => key;

const readyProfile = (emailVerified?: boolean): ProfileState => ({
  email: 'grower@dehqonhub.uz',
  status: 'ready',
  subject: 'grower@dehqonhub.uz',
  ...(emailVerified === undefined ? {} : { emailVerified }),
});

afterEach(() => {
  cleanup();
});

describe('profile status card', () => {
  it('states the email verification result only when the session carries one', () => {
    const view = render(<ProfileStatusCard state={readyProfile(true)} t={t} />);

    expect(screen.getByText('user.profile.emailStatus')).toBeTruthy();
    expect(screen.getByText('user.profile.emailVerified')).toBeTruthy();

    view.rerender(<ProfileStatusCard state={readyProfile(false)} t={t} />);
    expect(screen.getByText('user.profile.emailUnverified')).toBeTruthy();
    expect(screen.queryByText('user.profile.emailVerified')).toBeNull();

    // A session that never reported the flag must not imply an unverified
    // address — the row disappears instead of guessing.
    view.rerender(<ProfileStatusCard state={readyProfile()} t={t} />);
    expect(screen.queryByText('user.profile.emailStatus')).toBeNull();
    expect(screen.getAllByText('grower@dehqonhub.uz')).toHaveLength(2);
  });
});
