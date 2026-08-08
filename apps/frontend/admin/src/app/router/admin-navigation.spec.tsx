// @requirements REQ-FRONTEND-SHELL-004
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminBasepath, useAdminCurrentPath, useAdminNavigate } from './admin-navigation';

vi.mock('@tanstack/react-router', () => ({
  useRouter: vi.fn(),
  useRouterState: vi.fn(),
}));

function NavigationProbe() {
  const path = useAdminCurrentPath();
  const navigate = useAdminNavigate();
  return (
    <>
      <output>{path}</output>
      <button
        onClick={() => {
          navigate('/admin/audit');
        }}
      >
        Push
      </button>
      <button
        onClick={() => {
          navigate('/admin/profile', { replace: true });
        }}
      >
        Replace
      </button>
    </>
  );
}

describe('admin navigation adapter', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('builds the current admin path and routes push and replace operations', () => {
    const history = { push: vi.fn(), replace: vi.fn() };
    vi.mocked(useRouter).mockReturnValue({ history } as never);
    vi.mocked(useRouterState).mockImplementation(({ select }) =>
      select({ location: { pathname: '/audit', searchStr: '?page=2' } } as never),
    );

    render(<NavigationProbe />);

    expect(adminBasepath).toBe('/admin');
    expect(screen.getByText('/admin/audit?page=2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(history.push).toHaveBeenCalledWith('/admin/audit');
    expect(history.replace).toHaveBeenCalledWith('/admin/profile');
  });
});
