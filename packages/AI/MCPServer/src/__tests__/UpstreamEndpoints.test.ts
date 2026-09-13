/**
 * Unit tests for upstream OAuth endpoint resolution.
 *
 * The Cognito cases are the reason this module exists: the Auth0-shaped fallback produced
 * `https://cognito-idp.<region>.amazonaws.com/<pool>/authorize`, which AWS answers with an
 * HTTP 400 (it is the user-pool API host, not an OAuth authorization server).
 */

import { describe, it, expect } from 'vitest';
import { detectUpstreamFlavor, resolveUpstreamOAuthEndpoints } from '../auth/UpstreamEndpoints';

describe('detectUpstreamFlavor()', () => {
  it.each([
    ['https://login.microsoftonline.com/tid/v2.0', 'azure-ad'],
    ['https://sts.windows.net/tid/', 'azure-ad'],
    ['https://cognito-idp.ca-central-1.amazonaws.com/ca-central-1_abc123', 'cognito'],
    ['https://my-tenant.us.auth0.com/', 'generic'],
    ['https://org.okta.com/oauth2/default', 'generic'],
  ])('classifies %s as %s', (issuer, expected) => {
    expect(detectUpstreamFlavor(issuer)).toBe(expected);
  });

  it('falls back to generic when the issuer is missing', () => {
    expect(detectUpstreamFlavor(undefined)).toBe('generic');
  });

  // The flavor decides which host the user's browser is sent to for login, so it is read from the
  // issuer's hostname and never from a substring of the whole URL. Each of these carries a provider
  // name somewhere a substring check would find it, while belonging to none of those providers.
  it.each([
    ['https://evil.example/?microsoftonline.com'],
    ['https://evil.example/#sts.windows.net'],
    ['https://evil.example/cognito-idp.us-east-1.amazonaws.com/pool'],
    ['https://evil.example/path?next=https://login.microsoftonline.com/tid/v2.0'],
    ['https://microsoftonline.com.evil.example/tid/v2.0'],
    ['https://notmicrosoftonline.com/tid/v2.0'],
    ['https://cognito-idp.evil.example/pool'],
    ['https://evil.example@login.microsoftonline.com.attacker.test/tid'],
    ['not-a-url'],
  ])('classifies the hostile issuer %s as generic', (issuer) => {
    expect(detectUpstreamFlavor(issuer)).toBe('generic');
  });

  it('still accepts a legitimate subdomain of a provider domain', () => {
    expect(detectUpstreamFlavor('https://login.partner.microsoftonline.com/tid/v2.0')).toBe('azure-ad');
  });
});

describe('resolveUpstreamOAuthEndpoints() - Cognito', () => {
  const cognito = {
    issuer: 'https://cognito-idp.ca-central-1.amazonaws.com/ca-central-1_lL8Q5800D',
    domain: 'aidp-mj.auth.ca-central-1.amazoncognito.com',
  };

  it('builds the hosted-UI endpoints, not the user-pool issuer', () => {
    expect(resolveUpstreamOAuthEndpoints(cognito)).toEqual({
      flavor: 'cognito',
      authorizationEndpoint: 'https://aidp-mj.auth.ca-central-1.amazoncognito.com/oauth2/authorize',
      tokenEndpoint: 'https://aidp-mj.auth.ca-central-1.amazoncognito.com/oauth2/token',
    });
  });

  it('never derives endpoints from the cognito-idp issuer host', () => {
    const { authorizationEndpoint, tokenEndpoint } = resolveUpstreamOAuthEndpoints(cognito);
    expect(authorizationEndpoint).not.toContain('cognito-idp.');
    expect(tokenEndpoint).not.toContain('cognito-idp.');
  });

  it.each([
    ['https://aidp-mj.auth.ca-central-1.amazoncognito.com'],
    ['https://aidp-mj.auth.ca-central-1.amazoncognito.com/'],
    ['aidp-mj.auth.ca-central-1.amazoncognito.com/'],
  ])('normalizes a domain written as %s', (domain) => {
    expect(resolveUpstreamOAuthEndpoints({ issuer: cognito.issuer, domain }).authorizationEndpoint).toBe(
      'https://aidp-mj.auth.ca-central-1.amazoncognito.com/oauth2/authorize',
    );
  });

  it('throws a domain-naming error rather than guessing when the domain is missing', () => {
    expect(() => resolveUpstreamOAuthEndpoints({ issuer: cognito.issuer })).toThrow(/COGNITO_DOMAIN/);
  });
});

describe('resolveUpstreamOAuthEndpoints() - Azure AD (pinned, unchanged)', () => {
  it('strips the /v2.0 suffix and uses the v2.0 endpoint paths', () => {
    expect(resolveUpstreamOAuthEndpoints({ issuer: 'https://login.microsoftonline.com/my-tenant/v2.0' })).toEqual({
      flavor: 'azure-ad',
      authorizationEndpoint: 'https://login.microsoftonline.com/my-tenant/oauth2/v2.0/authorize',
      tokenEndpoint: 'https://login.microsoftonline.com/my-tenant/oauth2/v2.0/token',
    });
  });

  it('handles a trailing slash after /v2.0', () => {
    expect(resolveUpstreamOAuthEndpoints({ issuer: 'https://login.microsoftonline.com/my-tenant/v2.0/' }).tokenEndpoint).toBe(
      'https://login.microsoftonline.com/my-tenant/oauth2/v2.0/token',
    );
  });
});

describe('resolveUpstreamOAuthEndpoints() - generic OIDC (pinned, unchanged)', () => {
  it('uses the Auth0 shape for an Auth0 issuer', () => {
    expect(resolveUpstreamOAuthEndpoints({ issuer: 'https://my-tenant.us.auth0.com/' })).toEqual({
      flavor: 'generic',
      authorizationEndpoint: 'https://my-tenant.us.auth0.com/authorize',
      tokenEndpoint: 'https://my-tenant.us.auth0.com/oauth/token',
    });
  });

  it('ignores a domain on a non-Cognito provider', () => {
    expect(resolveUpstreamOAuthEndpoints({ issuer: 'https://my-tenant.us.auth0.com', domain: 'my-tenant.us.auth0.com' }).authorizationEndpoint).toBe(
      'https://my-tenant.us.auth0.com/authorize',
    );
  });
});
