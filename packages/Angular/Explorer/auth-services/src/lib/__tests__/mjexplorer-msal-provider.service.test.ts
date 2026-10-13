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
import { MJMSALProvider } from '../providers/mjexplorer-msal-provider.service';

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
