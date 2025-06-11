/* eslint-disable rxjs/finnish */
/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// mocks
const signOutFn = vi.fn();
const jumpToIndex = vi.fn();
const jumpToSignIn = vi.fn();
let allowGuestDemo = true;
let allowGuestLocal = false;

vi.mock('@affine/core/modules/cloud', () => ({
  AuthService: class {},
  DefaultServerService: class {},
}));

vi.mock('@toeverything/infra', () => {
  return {
    useService: () => ({ signOut: signOutFn }),
    useServices: () => ({
      defaultServerService: {
        server: {
          config$: {
            value: {
              get allowGuestDemoWorkspace() {
                return allowGuestDemo;
              },
              get allowGuestLocalWorkspace() {
                return allowGuestLocal;
              },
            },
          },
        },
      },
    }),
  };
});

vi.mock('@affine/component', () => {
  return {
    useConfirmModal: () => ({
      openConfirmModal: ({ onConfirm }: { onConfirm?: () => unknown }) => {
        return Promise.resolve(onConfirm?.());
      },
    }),
    notify: { error: vi.fn() },
  };
});

vi.mock('@affine/i18n', () => ({
  useI18n: () => new Proxy({}, { get: () => () => '' }),
}));

vi.mock('../../use-navigate-helper', () => ({
  useNavigateHelper: () => ({ jumpToIndex, jumpToSignIn }),
}));

import { useSignOut } from '../use-sign-out';

describe('useSignOut', () => {
  beforeEach(() => {
    signOutFn.mockClear();
    jumpToIndex.mockClear();
    jumpToSignIn.mockClear();
    allowGuestLocal = false;
  });

  test('redirects to index when guest demo allowed', async () => {
    allowGuestDemo = true;
    const { result } = renderHook(() => useSignOut());
    result.current();
    await waitFor(() => expect(signOutFn).toHaveBeenCalled());
    expect(jumpToIndex).toHaveBeenCalled();
    expect(jumpToSignIn).not.toHaveBeenCalled();
  });

  test('redirects to index when local workspace allowed', async () => {
    allowGuestDemo = false;
    allowGuestLocal = true;
    const { result } = renderHook(() => useSignOut());
    result.current();
    await waitFor(() => expect(signOutFn).toHaveBeenCalled());
    expect(jumpToIndex).toHaveBeenCalled();
    expect(jumpToSignIn).not.toHaveBeenCalled();
  });

  test('redirects to sign in when guest demo disabled', async () => {
    allowGuestDemo = false;
    allowGuestLocal = false;
    const { result } = renderHook(() => useSignOut());
    result.current();
    await waitFor(() => expect(signOutFn).toHaveBeenCalled());
    expect(jumpToSignIn).toHaveBeenCalled();
    expect(jumpToIndex).not.toHaveBeenCalled();
  });
});
