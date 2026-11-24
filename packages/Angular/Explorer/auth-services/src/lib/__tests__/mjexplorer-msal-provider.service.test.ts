/**
 * Tests for MJMSALProvider.SelectSessionAccount. The MSAL SDK itself is mocked out entirely.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@azure/msal-angular', () => ({
  MsalBroadcastService: class {},
  MsalService: class {},
  MsalGuard: class {},
  MSAL_INSTANCE: 'MSAL_INSTANCE',
  MSAL_GUARD_CONFIG: 'MSAL_GUARD_CONFIG',
  MSAL_INTERCEPTOR_CONFIG: 'MSAL_INTERCEPTOR_CONFIG'
}));

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {},
  ClientAuthError: class extends Error {},
  InteractionRequiredAuthError: class extends Error {},
  BrowserAuthError: class extends Error {},
  CacheLookupPolicy: { AccessToken: 'AccessToken' },
  InteractionStatus: { None: 'none' },
  InteractionType: { Redirect: 'redirect' }
}));

vi.mock('@angular/core', () => ({
  Injectable: () => (target: unknown) => target
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn()
}));

vi.mock('../mjexplorer-auth-base.service', () => ({
  MJAuthBase: class {}
}));

import type { AccountInfo } from '@azure/msal-common';
import { MJMSALProvider } from '../providers/mjexplorer-msal-provider.service';

function account(homeAccountId: string, username: string): AccountInfo {
  return {
    homeAccountId,
    localAccountId: homeAccountId,
    environment: 'login.microsoftonline.com',
    tenantId: 'tenant-guid',
    username
  };
}

describe('MJMSALProvider.SelectSessionAccount', () => {
  const first = account('first-home-id', 'first@example.com');
  const second = account('second-home-id', 'second@example.com');

  it('resumes as the active account, not the first one cached', () => {
    // A shared browser still holding an earlier account: the last sign-in set `second` active.
    expect(MJMSALProvider.SelectSessionAccount([first, second], second)).toBe(second);
  });

  it('returns the cached instance matching the active account by home account id', () => {
    const activeCopy = account('second-home-id', 'second@example.com');
    expect(MJMSALProvider.SelectSessionAccount([first, second], activeCopy)).toBe(second);
  });

  it('resumes as the only cached account when none is marked active', () => {
    expect(MJMSALProvider.SelectSessionAccount([first], null)).toBe(first);
  });

  it('refuses to guess when several accounts are cached and none is active', () => {
    expect(MJMSALProvider.SelectSessionAccount([first, second], null)).toBeNull();
  });

  it('ignores an active account that is no longer cached', () => {
    const gone = account('gone-home-id', 'gone@example.com');
    expect(MJMSALProvider.SelectSessionAccount([first, second], gone)).toBeNull();
    expect(MJMSALProvider.SelectSessionAccount([first], gone)).toBe(first);
  });

  it('returns null with nothing cached', () => {
    expect(MJMSALProvider.SelectSessionAccount([], null)).toBeNull();
  });
});
