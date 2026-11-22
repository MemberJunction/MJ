import { describe, it, expect, beforeEach } from 'vitest';
import type { JwtPayload } from 'jsonwebtoken';
import type { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { CheckEmailVerified, ReadEmailVerifiedClaim, DescribeEmailVerifiedRefusal } from '../emailVerified';
import { BaseAuthProvider } from '../BaseAuthProvider';
import { AuthProviderFactory } from '../AuthProviderFactory';

class TestAuthProvider extends BaseAuthProvider {
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    return { userId: payload.sub ?? '', email: '', firstName: '', lastName: '', preferredUsername: '' };
  }
}

function makeConfig(overrides: Partial<AuthProviderConfig> = {}): AuthProviderConfig {
  return {
    name: 'test-provider',
    type: 'test',
    issuer: 'https://idp.example.com/',
    audience: 'test-aud',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    ...overrides,
  };
}

describe('ReadEmailVerifiedClaim', () => {
  it('reads booleans as they are', () => {
    expect(ReadEmailVerifiedClaim({ email_verified: true })).toBe(true);
    expect(ReadEmailVerifiedClaim({ email_verified: false })).toBe(false);
  });

  it('reads the strings "true" and "false" in any case', () => {
    expect(ReadEmailVerifiedClaim({ email_verified: 'true' })).toBe(true);
    expect(ReadEmailVerifiedClaim({ email_verified: 'false' })).toBe(false);
    expect(ReadEmailVerifiedClaim({ email_verified: ' False ' })).toBe(false);
    expect(ReadEmailVerifiedClaim({ email_verified: 'TRUE' })).toBe(true);
  });

  it('treats an absent or unrecognised claim as undefined', () => {
    expect(ReadEmailVerifiedClaim({})).toBeUndefined();
    expect(ReadEmailVerifiedClaim({ email_verified: null })).toBeUndefined();
    expect(ReadEmailVerifiedClaim({ email_verified: 'yes' })).toBeUndefined();
    expect(ReadEmailVerifiedClaim({ email_verified: 0 })).toBeUndefined();
  });
});

describe('CheckEmailVerified', () => {
  it('refuses an explicit false with or without the option', () => {
    expect(CheckEmailVerified({ email_verified: false }, false)).toEqual({ Allowed: false, Reason: 'unverified' });
    expect(CheckEmailVerified({ email_verified: false }, true)).toEqual({ Allowed: false, Reason: 'unverified' });
  });

  it('refuses the string "false"', () => {
    expect(CheckEmailVerified({ email_verified: 'false' }, false)).toEqual({ Allowed: false, Reason: 'unverified' });
  });

  it('allows true, boolean or string, with or without the option', () => {
    expect(CheckEmailVerified({ email_verified: true }, false)).toEqual({ Allowed: true });
    expect(CheckEmailVerified({ email_verified: true }, true)).toEqual({ Allowed: true });
    expect(CheckEmailVerified({ email_verified: 'true' }, true)).toEqual({ Allowed: true });
  });

  it('allows an absent claim by default', () => {
    expect(CheckEmailVerified({ sub: 'abc' }, false)).toEqual({ Allowed: true });
  });

  it('refuses an absent claim when the provider requires it', () => {
    expect(CheckEmailVerified({ sub: 'abc' }, true)).toEqual({ Allowed: false, Reason: 'missing' });
    expect(CheckEmailVerified({ email_verified: 'maybe' }, true)).toEqual({ Allowed: false, Reason: 'missing' });
  });

  it('describes each refusal', () => {
    expect(DescribeEmailVerifiedRefusal('unverified')).toContain('not verified');
    expect(DescribeEmailVerifiedRefusal('missing')).toContain('requireEmailVerified');
  });
});

describe('requireEmailVerified provider option', () => {
  it('defaults to false', () => {
    expect(new TestAuthProvider(makeConfig()).RequireEmailVerified).toBe(false);
  });

  it('reads true from a boolean or a string', () => {
    expect(new TestAuthProvider(makeConfig({ requireEmailVerified: true })).RequireEmailVerified).toBe(true);
    // A JSON-sourced config can carry the value as a string.
    const fromString = (value: string) => makeConfig({ requireEmailVerified: value } as unknown as Partial<AuthProviderConfig>);
    expect(new TestAuthProvider(fromString('true')).RequireEmailVerified).toBe(true);
    expect(new TestAuthProvider(fromString('false')).RequireEmailVerified).toBe(false);
  });
});

describe('AuthProviderFactory.RequiresEmailVerified', () => {
  const issuer = 'https://idp.example.com/';
  let factory: AuthProviderFactory;

  beforeEach(() => {
    factory = AuthProviderFactory.Instance;
    factory.clear();
  });

  it('is false for an unknown issuer', () => {
    expect(factory.RequiresEmailVerified('https://unknown.example.com/')).toBe(false);
  });

  it('is false when no provider for the issuer sets the option', () => {
    factory.register(new TestAuthProvider(makeConfig()));
    expect(factory.RequiresEmailVerified(issuer)).toBe(false);
  });

  it('is true when any provider sharing the issuer sets the option', () => {
    factory.register(new TestAuthProvider(makeConfig({ name: 'app-a' })));
    factory.register(new TestAuthProvider(makeConfig({ name: 'app-b', audience: 'other-aud', requireEmailVerified: true })));
    expect(factory.RequiresEmailVerified(issuer)).toBe(true);
  });
});
