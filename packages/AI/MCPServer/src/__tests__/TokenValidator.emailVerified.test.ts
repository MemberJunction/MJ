/**
 * Drives a bearer token through the real AuthGate and TokenValidator to pin that an identity
 * provider token is linked to an MJ user only when its email address is acceptable as verified.
 *
 * Tokens are signed with a local RSA key. The provider registry, JWT verification and the email
 * screen are the real code (the screen is MJServer's own module). `@memberjunction/server` is
 * mocked only for the signing-key lookup, claim extraction and the user lookup, because importing
 * it for real loads the server config, which needs database settings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt, { type JwtHeader, type JwtPayload, type SigningKeyCallback } from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import type * as http from 'http';

const { keyHolder, mockVerifyUserRecord } = vi.hoisted(() => ({
  keyHolder: { publicKey: '' },
  mockVerifyUserRecord: vi.fn(),
}));

vi.mock('@memberjunction/server', async () => {
  const screen = await import('../../../../MJServer/src/auth/tokenEmailScreen.js');
  const { AuthProviderFactory } = await import('@memberjunction/auth-providers');
  return {
    getSigningKeys: () => (_header: JwtHeader, cb: SigningKeyCallback) => cb(null, keyHolder.publicKey),
    extractUserInfoFromPayload: (payload: JwtPayload) => AuthProviderFactory.Instance.getByIssuer(payload.iss ?? '')!.extractUserInfo(payload),
    verifyUserRecord: mockVerifyUserRecord,
    ScreenTokenEmailClaims: screen.ScreenTokenEmailClaims,
    IssuerRequiresVerifiedEmail: screen.IssuerRequiresVerifiedEmail,
  };
});

vi.mock('../auth/OAuthConfig.js', () => ({
  GetAuthMode: () => 'oauth',
  IsOAuthEnabled: () => true,
  GetResourceIdentifier: () => 'https://mcp.example.test',
}));

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: () => ({ IsValidAPIKeyFormat: () => false }),
}));

import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { RecordRequireVerifiedEmailSetting } from '../../../../MJServer/src/auth/tokenEmailScreen.js';
import { AuthenticateRequest, type AuthGateConfig } from '../auth/AuthGate.js';

const ISSUER = 'https://idp.example.test/';
const AUDIENCE = 'mcp-test';
const OWNER_EMAIL = 'owner@corp.example';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
keyHolder.publicKey = keys.publicKey;

const gateConfig = { getSystemUser: () => undefined } as unknown as AuthGateConfig;

/** Registers an Okta provider for the test issuer, with or without the strict setting. */
function registerProvider(requireVerifiedEmail?: boolean): void {
  const factory = AuthProviderFactory.Instance;
  factory.clear();
  const config = {
    name: 'test-idp', type: 'okta', issuer: ISSUER, audience: AUDIENCE,
    jwksUri: 'https://idp.example.test/jwks', clientId: AUDIENCE, domain: 'idp.example.test',
    ...(requireVerifiedEmail === undefined ? {} : { requireVerifiedEmail }),
  };
  const provider = AuthProviderFactory.createProvider(config);
  RecordRequireVerifiedEmailSetting(provider, config);
  factory.register(provider);
}

function signToken(claims: Record<string, unknown>): string {
  return jwt.sign({ given_name: 'Owner', family_name: 'User', ...claims }, keys.privateKey, {
    algorithm: 'RS256', issuer: ISSUER, audience: AUDIENCE, subject: 'idp-subject', expiresIn: '5m',
  });
}

function bearerRequest(token: string): http.IncomingMessage {
  return { headers: { authorization: `Bearer ${token}` }, url: '/mcp' } as unknown as http.IncomingMessage;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

/** Asserts that the gate refuses the token, logs the reason and never looks up a user. */
async function expectRefused(token: string, reason: string): Promise<void> {
  const result = await AuthenticateRequest(bearerRequest(token), gateConfig);
  expect(result.authenticated).toBe(false);
  expect(mockVerifyUserRecord).not.toHaveBeenCalled();
  const logged = warnSpy.mock.calls.some((call) => {
    const line = call.map(String).join(' ');
    return line.includes('Token refused') && line.includes(reason);
  });
  expect(logged).toBe(true);
}

describe('MCP bearer token email verification', () => {
  beforeEach(() => {
    mockVerifyUserRecord.mockReset();
    mockVerifyUserRecord.mockResolvedValue({ ID: 'OWNER-ID', Email: OWNER_EMAIL, IsActive: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a token whose email_verified claim is false and looks up no user', async () => {
    await expectRefused(signToken({ email: OWNER_EMAIL, email_verified: false }), 'marks the email address as not verified');
  });

  describe('with requireVerifiedEmail on the provider', () => {
    beforeEach(() => registerProvider(true));

    it('refuses a token that has no email_verified claim', async () => {
      await expectRefused(signToken({ email: OWNER_EMAIL }), 'requires email_verified to be true');
    });

    it('refuses a token whose only address is the preferred_username claim', async () => {
      await expectRefused(signToken({ preferred_username: OWNER_EMAIL, email_verified: true }), 'requires a verified email claim');
    });
  });
});
