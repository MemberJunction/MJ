/**
 * Tests for MJMSALProvider's catalog mapping.
 *
 * MSAL is the one built-in driver whose `angularProviderFactory` reads UNPREFIXED keys
 * (`CLIENT_ID` / `CLIENT_AUTHORITY`), so it must supply `EnvironmentFromCatalog` — without it,
 * a metadata-configured Entra row is silently ignored in favour of the compiled environment.
 * These tests pin that static mapping; the MSAL SDK itself is mocked out entirely.
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

import type { PublicAuthProviderInfo } from '@memberjunction/core';
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

function info(overrides: Partial<PublicAuthProviderInfo>): PublicAuthProviderInfo {
  return {
    name: 'Microsoft Entra ID',
    driverClass: 'msal',
    displayName: 'Microsoft',
    sequence: 20,
    isDefault: false,
    ...overrides
  };
}

describe('MJMSALProvider.EnvironmentFromCatalog', () => {
  it('maps the row onto the unprefixed keys angularProviderFactory reads', () => {
    const overlay = MJMSALProvider.EnvironmentFromCatalog(
      info({ clientId: 'app-reg-guid', issuer: 'https://login.microsoftonline.com/tenant-guid/v2.0' })
    );

    expect(overlay).toEqual({
      CLIENT_ID: 'app-reg-guid',
      CLIENT_AUTHORITY: 'https://login.microsoftonline.com/tenant-guid'
    });
  });

  it('derives the authority from the Issuer by stripping the /v2.0 suffix, trailing slash included', () => {
    const overlay = MJMSALProvider.EnvironmentFromCatalog(info({ issuer: 'https://login.microsoftonline.com/tenant-guid/v2.0/' }));
    expect(overlay['CLIENT_AUTHORITY']).toBe('https://login.microsoftonline.com/tenant-guid');
  });

  it('passes a non-v2.0 issuer through as the authority unchanged (best effort — non-standard tenants need the explicit escape hatch)', () => {
    // A B2C or v1 sts.windows.net issuer is NOT a usable MSAL authority; such rows must set
    // ClientConfiguration.authority (see the mapper's doc comment). Pass-through is the least
    // surprising fallback for issuers the derivation rule doesn't understand.
    const overlay = MJMSALProvider.EnvironmentFromCatalog(info({ issuer: 'https://tenant.b2clogin.com/tenant/policy' }));
    expect(overlay['CLIENT_AUTHORITY']).toBe('https://tenant.b2clogin.com/tenant/policy');
  });

  it('prefers an explicit ClientConfiguration authority over the derived one', () => {
    const overlay = MJMSALProvider.EnvironmentFromCatalog(
      info({
        issuer: 'https://login.microsoftonline.com/tenant-guid/v2.0',
        clientConfiguration: { authority: 'https://login.microsoftonline.com/organizations' }
      })
    );
    expect(overlay['CLIENT_AUTHORITY']).toBe('https://login.microsoftonline.com/organizations');
  });

  it('emits nothing for absent columns, so compiled environment keys are never blanked', () => {
    expect(MJMSALProvider.EnvironmentFromCatalog(info({}))).toEqual({});
  });
});

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
