/**
 * ValidateBearerToken and the OAuth proxy apply the email_verified gate to an upstream
 * identity-provider token before the MemberJunction user is resolved.
 *
 * Tokens are signed with a real RSA key so the full verification path runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import type { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';

const ISSUER = 'https://idp.example.com/';
const AUDIENCE = 'mcp-test-audience';

const { keys, providers, mockVerifyUserRecord } = vi.hoisted(() => ({
  keys: { publicKey: '', privateKey: '' },
  providers: [] as Array<{ issuer: string; audience: string; RequireEmailVerified?: boolean }>,
  mockVerifyUserRecord: vi.fn(),
}));

vi.mock('@memberjunction/server', () => ({
  getSigningKeys: () => (_header: JwtHeader, cb: SigningKeyCallback) => cb(null, keys.publicKey),
  extractUserInfoFromPayload: (payload: JwtPayload) => ({ email: payload['email'] as string | undefined }),
  verifyUserRecord: mockVerifyUserRecord,
}));

vi.mock('@memberjunction/auth-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/auth-providers')>();
  const forIssuer = (issuer: string) => providers.filter((p) => p.issuer === issuer);
  return {
    CheckEmailVerified: actual.CheckEmailVerified,
    DescribeEmailVerifiedRefusal: actual.DescribeEmailVerifiedRefusal,
    AuthProviderFactory: {
      Instance: {
        getAllByIssuer: forIssuer,
        RequiresEmailVerified: (issuer: string) => forIssuer(issuer).some((p) => p.RequireEmailVerified === true),
      },
    },
  };
});

import { ValidateBearerToken } from '../auth/TokenValidator.js';
import { CheckUpstreamEmailVerified } from '../auth/OAuthProxyRouter.js';

function signToken(claims: Record<string, unknown>): string {
  return jwt.sign({ email: 'person@example.com', sub: 'subject-1', ...claims }, keys.privateKey, {
    algorithm: 'RS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: '5m',
  });
}

function setProvider(requireEmailVerified: boolean): void {
  providers.length = 0;
  providers.push({ issuer: ISSUER, audience: AUDIENCE, RequireEmailVerified: requireEmailVerified });
}

describe('email_verified gate on MCP upstream tokens', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    if (!keys.privateKey) {
      const pair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      keys.publicKey = pair.publicKey;
      keys.privateKey = pair.privateKey;
    }
    setProvider(false);
    mockVerifyUserRecord.mockReset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  describe('ValidateBearerToken', () => {
    it('refuses email_verified false without resolving a user', async () => {
      const result = await ValidateBearerToken(signToken({ email_verified: false }));
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('invalid_token');
      expect(result.userInfo).toBeUndefined();
      expect(mockVerifyUserRecord).not.toHaveBeenCalled();
    });

    it('refuses the string "false"', async () => {
      const result = await ValidateBearerToken(signToken({ email_verified: 'false' }));
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('invalid_token');
    });

    it('accepts email_verified true', async () => {
      const result = await ValidateBearerToken(signToken({ email_verified: true }));
      expect(result.valid).toBe(true);
      expect(result.userInfo?.email).toBe('person@example.com');
    });

    it('accepts an absent claim by default', async () => {
      const result = await ValidateBearerToken(signToken({}));
      expect(result.valid).toBe(true);
    });

    it('refuses an absent claim when the provider requires it', async () => {
      setProvider(true);
      const result = await ValidateBearerToken(signToken({}));
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('invalid_token');
      expect(mockVerifyUserRecord).not.toHaveBeenCalled();
    });

    it('accepts email_verified true when the provider requires it', async () => {
      setProvider(true);
      const result = await ValidateBearerToken(signToken({ email_verified: true }));
      expect(result.valid).toBe(true);
    });

    it('logs the issuer, not the email', async () => {
      await ValidateBearerToken(signToken({ email_verified: false }));
      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes(ISSUER))).toBe(true);
      expect(lines.some((line) => line.includes('person@example.com'))).toBe(false);
    });
  });

  describe('CheckUpstreamEmailVerified (OAuth proxy)', () => {
    it('refuses an explicit false, boolean or string', () => {
      expect(CheckUpstreamEmailVerified({ iss: ISSUER, email_verified: false })).toEqual({ Allowed: false, Reason: 'unverified' });
      expect(CheckUpstreamEmailVerified({ iss: ISSUER, email_verified: 'false' })).toEqual({ Allowed: false, Reason: 'unverified' });
    });

    it('allows true and, by default, an absent claim', () => {
      expect(CheckUpstreamEmailVerified({ iss: ISSUER, email_verified: true })).toEqual({ Allowed: true });
      expect(CheckUpstreamEmailVerified({ iss: ISSUER })).toEqual({ Allowed: true });
      expect(CheckUpstreamEmailVerified({})).toEqual({ Allowed: true });
    });

    it('refuses an absent claim when the provider for the issuer requires it', () => {
      setProvider(true);
      expect(CheckUpstreamEmailVerified({ iss: ISSUER })).toEqual({ Allowed: false, Reason: 'missing' });
    });
  });
});
