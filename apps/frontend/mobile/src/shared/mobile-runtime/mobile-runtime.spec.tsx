// @requirements REQ-FRONTEND-NATIVE-006
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMobileRuntime } from './mobile-runtime';

describe('useMobileRuntime', () => {
  it('fails fast outside the mobile provider boundary', () => {
    expect(() => renderHook(() => useMobileRuntime())).toThrow(
      'useMobileRuntime must be used within MobileAppProviders.',
    );
  });
});
