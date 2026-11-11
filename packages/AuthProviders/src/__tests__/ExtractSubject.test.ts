/**
 * The account ID each provider gives the server for binding a login to a User record. Entra's `sub`
 * differs per app registration, so MSAL uses tenant + object ID; MJ's own token issuers (magic link,
 * local dev) give none because their tokens already name a User record.
 */
import { describe, it, expect } from 'vitest';
import type { JwtPayload } from 'jsonwebtoken';
import { AuthProviderConfig } from '@memberjunction/core';
import { Auth0Provider } from '../providers/Auth0Provider';
import { MSALProvider } from '../providers/MSALProvider';
import { MagicLinkProvider } from '../providers/MagicLinkProvider';
import { LocalDevProvider } from '../providers/LocalDevProvider';

function config(type: string): AuthProviderConfig {
  return {
    name: `${type}-test`,
    type,
    issuer: 'https://issuer.example.com/',
    audience: 'aud',
    jwksUri: 'https://issuer.example.com/.well-known/jwks.json',
    clientId: 'client',
    domain: 'issuer.example.com',
    tenantId: 'tenant',
  };
}

describe('ExtractSubject', () => {
  it('returns the sub claim by default', () => {
    const provider = new Auth0Provider(config('auth0'));
    expect(provider.ExtractSubject({ sub: 'auth0|abc' } as JwtPayload)).toBe('auth0|abc');
  });

  it('returns undefined when sub is missing or empty', () => {
    const provider = new Auth0Provider(config('auth0'));
    expect(provider.ExtractSubject({} as JwtPayload)).toBeUndefined();
    expect(provider.ExtractSubject({ sub: '' } as JwtPayload)).toBeUndefined();
  });

  it('uses tenant and object ID for Entra, not the per-app sub', () => {
    const provider = new MSALProvider(config('msal'));
    const payload = { sub: 'pairwise-per-app', tid: 'tenant-1', oid: 'object-1' } as JwtPayload;
    expect(provider.ExtractSubject(payload)).toBe('tenant-1:object-1');
  });

  it('gives an Entra token without both tid and oid no subject rather than falling back to sub', () => {
    const provider = new MSALProvider(config('msal'));
    expect(provider.ExtractSubject({ sub: 's', oid: 'object-1' } as JwtPayload)).toBeUndefined();
    expect(provider.ExtractSubject({ sub: 's', tid: 'tenant-1' } as JwtPayload)).toBeUndefined();
  });

  it('gives magic-link and local-dev tokens no subject', () => {
    expect(new MagicLinkProvider(config('magic-link')).ExtractSubject({ sub: 'magic-link|invite' } as JwtPayload)).toBeUndefined();
    expect(new LocalDevProvider(config('local-dev')).ExtractSubject({ sub: 'local-dev|user' } as JwtPayload)).toBeUndefined();
  });
});
