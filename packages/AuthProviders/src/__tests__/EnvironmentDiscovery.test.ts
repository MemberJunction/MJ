/**
 * Tests for environment-variable provider discovery.
 *
 * The mappings for Entra, Auth0 and Cognito were lifted out of a hard-coded block in MJServer's
 * config and onto the provider classes. The parity tests below assert the exact shape that block
 * produced, because any drift silently changes which issuer a deployment's tokens are validated
 * against — a failure that surfaces as "everyone is logged out" rather than as a type error.
 */
import { describe, it, expect } from 'vitest';
import { AuthProviderFactory } from '../index.js';
import { Auth0Provider } from '../providers/Auth0Provider.js';
import { MSALProvider } from '../providers/MSALProvider.js';
import { CognitoProvider } from '../providers/CognitoProvider.js';
import { OktaProvider } from '../providers/OktaProvider.js';
import { WorkOSProvider } from '../providers/WorkOSProvider.js';

const EMPTY: NodeJS.ProcessEnv = {};

describe('configFromEnvironment — parity with the previous hard-coded block', () => {
  it('Auth0 maps AUTH0_DOMAIN + AUTH0_CLIENT_ID exactly as before', () => {
    expect(
      Auth0Provider.configFromEnvironment({
        AUTH0_DOMAIN: 'example.us.auth0.com',
        AUTH0_CLIENT_ID: 'cid',
        AUTH0_CLIENT_SECRET: 'secret'
      })
    ).toEqual({
      name: 'auth0',
      type: 'auth0',
      issuer: 'https://example.us.auth0.com/',
      audience: 'cid',
      jwksUri: 'https://example.us.auth0.com/.well-known/jwks.json',
      clientId: 'cid',
      clientSecret: 'secret',
      domain: 'example.us.auth0.com'
    });
  });

  it('Entra maps TENANT_ID + WEB_CLIENT_ID exactly as before, keeping the legacy name "azure"', () => {
    const config = MSALProvider.configFromEnvironment({ TENANT_ID: 'tid', WEB_CLIENT_ID: 'wcid' });
    expect(config).toEqual({
      name: 'azure',
      type: 'msal',
      issuer: 'https://login.microsoftonline.com/tid/v2.0',
      audience: 'wcid',
      jwksUri: 'https://login.microsoftonline.com/tid/discovery/v2.0/keys',
      clientId: 'wcid',
      tenantId: 'tid'
    });
  });

  it('Cognito maps its three variables exactly as before', () => {
    expect(
      CognitoProvider.configFromEnvironment({
        COGNITO_USER_POOL_ID: 'pool',
        COGNITO_CLIENT_ID: 'ccid',
        AWS_REGION: 'us-east-1'
      })
    ).toEqual({
      name: 'cognito',
      type: 'cognito',
      issuer: 'https://cognito-idp.us-east-1.amazonaws.com/pool',
      audience: 'ccid',
      jwksUri: 'https://cognito-idp.us-east-1.amazonaws.com/pool/.well-known/jwks.json',
      clientId: 'ccid',
      region: 'us-east-1',
      userPoolId: 'pool'
    });
  });
});

describe('configFromEnvironment — incomplete configuration', () => {
  it.each([
    ['Auth0 without a client id', () => Auth0Provider.configFromEnvironment({ AUTH0_DOMAIN: 'd' })],
    ['Entra without a client id', () => MSALProvider.configFromEnvironment({ TENANT_ID: 't' })],
    ['Cognito without a region', () => CognitoProvider.configFromEnvironment({ COGNITO_USER_POOL_ID: 'p', COGNITO_CLIENT_ID: 'c' })],
    ['Okta without a client id', () => OktaProvider.configFromEnvironment({ OKTA_DOMAIN: 'd' })],
    ['WorkOS with nothing set', () => WorkOSProvider.configFromEnvironment(EMPTY)]
  ])('returns null for %s rather than a partial config', (_label, build) => {
    // A partial config would fail validateConfig() at registration and surface as a startup
    // error on every deployment that simply does not use that provider.
    expect(build()).toBeNull();
  });
});

describe('configFromEnvironment — providers that previously had no env-var form', () => {
  it('Okta derives the default authorization server, and honours OKTA_ISSUER', () => {
    const base = OktaProvider.configFromEnvironment({ OKTA_DOMAIN: 'org.okta.com', OKTA_CLIENT_ID: 'ocid' });
    expect(base?.issuer).toBe('https://org.okta.com/oauth2/default');
    expect(base?.jwksUri).toBe('https://org.okta.com/oauth2/default/v1/keys');

    const custom = OktaProvider.configFromEnvironment({
      OKTA_DOMAIN: 'org.okta.com',
      OKTA_CLIENT_ID: 'ocid',
      OKTA_ISSUER: 'https://org.okta.com/oauth2/aus123'
    });
    expect(custom?.issuer).toBe('https://org.okta.com/oauth2/aus123');
    expect(custom?.jwksUri).toBe('https://org.okta.com/oauth2/aus123/v1/keys');
  });

  it('WorkOS derives issuer and JWKS from the client id alone', () => {
    const config = WorkOSProvider.configFromEnvironment({ WORKOS_CLIENT_ID: 'client_01H' });
    expect(config).toMatchObject({
      name: 'workos',
      type: 'workos',
      issuer: 'https://api.workos.com/user_management/client_01H',
      jwksUri: 'https://api.workos.com/sso/jwks/client_01H',
      audience: 'client_01H'
    });
  });
});

describe('AuthProviderFactory.discoverFromEnvironment', () => {
  it('returns nothing for an empty environment', () => {
    expect(AuthProviderFactory.discoverFromEnvironment(EMPTY)).toEqual([]);
  });

  it('discovers every provider whose variables are present, through the ClassFactory registry', () => {
    const discovered = AuthProviderFactory.discoverFromEnvironment({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'a',
      TENANT_ID: 't',
      WEB_CLIENT_ID: 'w',
      WORKOS_CLIENT_ID: 'client_01H'
    });

    expect(discovered.map((p) => p.name).sort()).toEqual(['auth0', 'azure', 'workos']);
  });

  it('skips providers whose variables are absent', () => {
    const discovered = AuthProviderFactory.discoverFromEnvironment({ AUTH0_DOMAIN: 'd', AUTH0_CLIENT_ID: 'c' });
    expect(discovered.map((p) => p.name)).toEqual(['auth0']);
  });

  it('produces configs that pass the provider validity check', () => {
    for (const config of AuthProviderFactory.discoverFromEnvironment({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'a',
      OKTA_DOMAIN: 'org.okta.com',
      OKTA_CLIENT_ID: 'o',
      WORKOS_CLIENT_ID: 'client_01H'
    })) {
      expect(AuthProviderFactory.createProvider(config).validateConfig()).toBe(true);
    }
  });
});
