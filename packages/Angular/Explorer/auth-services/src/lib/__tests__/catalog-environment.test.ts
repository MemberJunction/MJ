/**
 * Tests for the catalog → environment bridge — the seam between the public provider catalog
 * and the browser auth drivers. What matters here:
 * - key convention (prefix from DriverClass, camelCase → UPPER_SNAKE for ClientConfiguration)
 * - value shapes the drivers actually consume (scopes MUST arrive as a string[], because the
 *   drivers hand the key straight to SDK config typed string[])
 * - overlay discipline (only defined values emitted, compiled environment preserved underneath)
 * - the custom-mapper hook (a driver's EnvironmentFromCatalog replaces the generic projection)
 */
import { describe, it, expect } from 'vitest';

import type { PublicAuthProviderInfo } from '@memberjunction/core';
import { buildGenericEnvironmentOverlay, mergeCatalogEnvironment, type CatalogEnvironmentMapper } from '../catalog-environment';

function info(overrides: Partial<PublicAuthProviderInfo> & { driverClass: string }): PublicAuthProviderInfo {
  return {
    name: overrides.driverClass,
    displayName: overrides.driverClass,
    sequence: 0,
    isDefault: false,
    ...overrides
  };
}

describe('buildGenericEnvironmentOverlay', () => {
  it('projects the modelled columns onto the prefixed keys the drivers read', () => {
    const overlay = buildGenericEnvironmentOverlay(
      info({ driverClass: 'auth0', clientId: 'cid_123', domain: 'tenant.us.auth0.com', issuer: 'https://tenant.us.auth0.com/' })
    );

    expect(overlay).toEqual({
      AUTH0_CLIENTID: 'cid_123',
      AUTH0_DOMAIN: 'tenant.us.auth0.com',
      AUTH0_ISSUER: 'https://tenant.us.auth0.com/'
    });
  });

  it('upper-snakes a multi-word driver class for the prefix', () => {
    const overlay = buildGenericEnvironmentOverlay(info({ driverClass: 'magic-link', clientId: 'cid' }));
    expect(overlay).toEqual({ MAGIC_LINK_CLIENTID: 'cid' });
  });

  it('emits nothing for absent columns, so compiled environment keys are never blanked', () => {
    const overlay = buildGenericEnvironmentOverlay(info({ driverClass: 'okta' }));
    expect(overlay).toEqual({});
  });

  it('passes the pre-parsed scopes array through to the prefixed key', () => {
    // Okta's OktaAuthOptions.scopes and Amplify's oauth.scopes are string[] — the server splits
    // the delimited column at the trust boundary, and the overlay must not re-derive it.
    const overlay = buildGenericEnvironmentOverlay(info({ driverClass: 'okta', scopes: ['openid', 'profile', 'email'] }));
    expect(overlay['OKTA_SCOPES']).toEqual(['openid', 'profile', 'email']);
  });

  it('does not emit a scopes key for an empty scopes list', () => {
    // Emitting [] would defeat the drivers' `|| [defaults]` fallback (an empty array is truthy).
    const overlay = buildGenericEnvironmentOverlay(info({ driverClass: 'okta', scopes: [] }));
    expect(overlay).not.toHaveProperty('OKTA_SCOPES');
  });

  it('ignores a non-array scopes value from a malformed or older server rather than throwing', () => {
    // This module runs at bootstrap, before any error boundary — the catalog contract is
    // degrade-to-compiled-environment, never white-screen the app.
    const malformed = { ...info({ driverClass: 'okta' }), scopes: 'openid profile' as unknown as string[] };
    const overlay = buildGenericEnvironmentOverlay(malformed);
    expect(overlay).not.toHaveProperty('OKTA_SCOPES');
  });

  it('projects ClientConfiguration entries through camelCase → UPPER_SNAKE', () => {
    const overlay = buildGenericEnvironmentOverlay(
      info({
        driverClass: 'workos',
        clientConfiguration: { redirectUri: 'https://app.example.com/callback', apiHostname: 'api.workos.com', devMode: false }
      })
    );

    expect(overlay).toEqual({
      WORKOS_REDIRECT_URI: 'https://app.example.com/callback',
      WORKOS_API_HOSTNAME: 'api.workos.com',
      WORKOS_DEV_MODE: false
    });
  });

  it('skips null ClientConfiguration values rather than emitting them', () => {
    const overlay = buildGenericEnvironmentOverlay(info({ driverClass: 'workos', clientConfiguration: { redirectUri: null } }));
    expect(overlay).toEqual({});
  });

  it('lets the modelled columns win a key collision with the ClientConfiguration blob', () => {
    // Same precedence the server enforces in buildProviderConfig: the described, reviewable
    // columns must not be silently redefined by a JSON blob. A blob `scopes` string would
    // otherwise clobber the parsed array and reintroduce the string-where-string[]-expected bug.
    const overlay = buildGenericEnvironmentOverlay(
      info({
        driverClass: 'okta',
        issuer: 'https://column.example.com',
        scopes: ['openid', 'profile'],
        clientConfiguration: { issuer: 'https://blob.example.com', scopes: 'openid profile', redirectUri: 'https://app.example.com/cb' }
      })
    );

    expect(overlay['OKTA_ISSUER']).toBe('https://column.example.com');
    expect(overlay['OKTA_SCOPES']).toEqual(['openid', 'profile']);
    expect(overlay['OKTA_REDIRECT_URI']).toBe('https://app.example.com/cb'); // non-colliding blob keys still project
  });
});

describe('mergeCatalogEnvironment', () => {
  const base = { GRAPHQL_URI: 'https://api.example.com/', AUTH_TYPE: 'auth0', OKTA_CLIENTID: 'compiled-cid' };

  it('overlays the catalog on the compiled environment and stamps AUTH_TYPE with the driver class', () => {
    const merged = mergeCatalogEnvironment(base, info({ driverClass: 'okta', clientId: 'catalog-cid' }));

    expect(merged['GRAPHQL_URI']).toBe('https://api.example.com/'); // app-wide settings survive
    expect(merged['OKTA_CLIENTID']).toBe('catalog-cid'); // metadata wins over the compiled value
    expect(merged['AUTH_TYPE']).toBe('okta'); // the resolved provider, not the compiled one
  });

  it('leaves compiled provider keys intact when the catalog row does not restate them', () => {
    const merged = mergeCatalogEnvironment(base, info({ driverClass: 'okta' }));
    expect(merged['OKTA_CLIENTID']).toBe('compiled-cid');
  });

  it('prefers a driver-supplied EnvironmentFromCatalog over the generic projection', () => {
    const providerClass: CatalogEnvironmentMapper = {
      EnvironmentFromCatalog: (row) => ({ CLIENT_ID: row.clientId })
    };
    const merged = mergeCatalogEnvironment(base, info({ driverClass: 'msal', clientId: 'entra-cid' }), providerClass);

    expect(merged['CLIENT_ID']).toBe('entra-cid');
    expect(merged).not.toHaveProperty('MSAL_CLIENTID'); // generic overlay must not also run
    expect(merged['AUTH_TYPE']).toBe('msal');
  });

  it('falls back to the generic projection when the provider class has no mapper', () => {
    const merged = mergeCatalogEnvironment(base, info({ driverClass: 'msal', clientId: 'entra-cid' }), {});
    expect(merged['MSAL_CLIENTID']).toBe('entra-cid');
  });
});
