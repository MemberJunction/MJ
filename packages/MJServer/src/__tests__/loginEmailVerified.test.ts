/**
 * Tests that GetUserPayload links a signed IdP token to an MJ user only when the token's email
 * address is acceptable as verified. Tokens are signed with a local RSA key; the provider registry,
 * JWT verification, claim extraction and user lookup are the real code. The user cache, the config
 * and the database providers are mocked; no connection is opened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';

const { mockConfig, cachedUsers } = vi.hoisted(() => ({
  mockConfig: {
    authProviders: [] as Record<string, unknown>[],
    userHandling: {
      autoCreateNewUsers: false,
      updateCacheWhenNotFound: false,
      updateCacheWhenNotFoundDelay: 0,
      newUserLimitedToAuthorizedDomains: false,
      newUserAuthorizedDomains: [] as string[],
      newUserRoles: [] as string[],
    },
    databaseSettings: { metadataCacheRefreshInterval: 0 },
  },
  cachedUsers: [] as { ID: string; Email: string; IsActive: boolean; UserRoles: unknown[] }[],
}));

vi.mock('../config.js', () => ({
  configInfo: mockConfig,
  userEmailMap: {},
  apiKey: 'test-api-key',
  mj_core_schema: '__mj',
}));

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
  const instance = {
    BlankEmailUserIDs: [] as string[],
    UsersByEmail: (email: string) => cachedUsers.filter((u) => u.Email.toLowerCase() === email.trim().toLowerCase()),
    FindUser: async () => undefined,
    AddOrUpdateUser: () => undefined,
    GetSystemUser: () => undefined,
  };
  return { ...actual, UserCache: { Instance: instance, Users: [] } };
});

vi.mock('../util.js', () => ({
  GetReadOnlyDataSource: vi.fn(() => undefined),
  GetReadWriteDataSource: vi.fn(() => undefined),
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
  SQLServerDataProvider: class {},
  SQLServerProviderConfigData: class {},
}));

vi.mock('@memberjunction/postgresql-dataprovider', () => ({
  PostgreSQLDataProvider: class {},
  PostgreSQLProviderConfigData: class {},
}));

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, Metadata: { Provider: undefined } };
});

import { RegisterClass } from '@memberjunction/global';
import { BaseAuthProvider, OktaProvider } from '@memberjunction/auth-providers';
import { GetUserPayload } from '../context.js';
import { InitializeAuthProviders } from '../auth/initializeProviders.js';
import { NewUserBase } from '../auth/newUsers.js';

const ISSUER = 'https://idp.test.example/';
const AUDIENCE = 'mjapi-test';
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** An Okta-shaped provider whose signing key is the local test key instead of a remote JWKS. */
@RegisterClass(BaseAuthProvider, 'email-verified-test')
class LocalKeyTestProvider extends OktaProvider {
  getSigningKey(_header: JwtHeader, callback: SigningKeyCallback): void {
    callback(null, keys.publicKey);
  }
}

function registerTestProvider(extra: Record<string, unknown> = {}): void {
  mockConfig.authProviders = [
    { name: 'test-idp', type: 'email-verified-test', issuer: ISSUER, audience: AUDIENCE, jwksUri: 'https://idp.test.example/jwks', clientId: AUDIENCE, domain: 'idp.test.example', ...extra },
  ];
  InitializeAuthProviders();
}

let tokenCounter = 0;
function signToken(claims: Record<string, unknown>): string {
  tokenCounter++;
  return jwt.sign({ given_name: 'Owner', family_name: 'User', nonce: `n-${tokenCounter}`, ...claims }, keys.privateKey, {
    algorithm: 'RS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: `idp-subject-${tokenCounter}`,
    expiresIn: '5m',
  });
}

const OWNER_EMAIL = 'owner@corp.example';
const REASON_MARKED_UNVERIFIED = 'marks the email address as not verified';
const REASON_CLAIM_NOT_TRUE = 'requires email_verified to be true';
const REASON_NO_EMAIL_CLAIM = 'requires a verified email claim';

let warnSpy: ReturnType<typeof vi.spyOn>;

/** True when a "Token refused" warning with the given reason was written. */
function refusalLogged(reason: string): boolean {
  return warnSpy.mock.calls.some((call) => {
    const line = call.map(String).join(' ');
    return line.includes('Token refused') && line.includes(reason);
  });
}

/** Asserts that GetUserPayload refuses the token and logs the given reason. */
async function expectRefused(token: string, reason: string): Promise<void> {
  await expect(GetUserPayload(`Bearer ${token}`, 's1', [])).rejects.toThrow('Unable to authenticate user');
  expect(refusalLogged(reason)).toBe(true);
}

describe('GetUserPayload email verification', () => {
  beforeEach(() => {
    cachedUsers.length = 0;
    cachedUsers.push({ ID: 'OWNER-ID', Email: OWNER_EMAIL, IsActive: true, UserRoles: [] });
    mockConfig.userHandling.autoCreateNewUsers = false;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerTestProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a token whose email_verified claim is false', async () => {
    await expectRefused(signToken({ email: OWNER_EMAIL, email_verified: false }), REASON_MARKED_UNVERIFIED);
  });

  it('refuses a token whose email_verified claim is the text "false"', async () => {
    await expectRefused(signToken({ email: OWNER_EMAIL, email_verified: 'false' }), REASON_MARKED_UNVERIFIED);
  });

  it('does not create a new user from a token whose email_verified claim is false', async () => {
    cachedUsers.length = 0;
    mockConfig.userHandling.autoCreateNewUsers = true;
    const createSpy = vi.spyOn(NewUserBase.prototype, 'createNewUser').mockResolvedValue(null);
    await expectRefused(signToken({ email: 'newcomer@corp.example', email_verified: false }), REASON_MARKED_UNVERIFIED);
    expect(createSpy).not.toHaveBeenCalled();
  });

  describe('with requireVerifiedEmail on the provider', () => {
    beforeEach(() => {
      registerTestProvider({ requireVerifiedEmail: true });
    });

    it('refuses a token that has no email_verified claim', async () => {
      await expectRefused(signToken({ email: OWNER_EMAIL }), REASON_CLAIM_NOT_TRUE);
    });

    it('refuses a token whose only address is the preferred_username claim', async () => {
      await expectRefused(signToken({ preferred_username: OWNER_EMAIL, email_verified: true }), REASON_NO_EMAIL_CLAIM);
    });
  });

  it('applies the strict rule when requireVerifiedEmail is the text "true"', async () => {
    registerTestProvider({ requireVerifiedEmail: 'true' });
    await expectRefused(signToken({ email: OWNER_EMAIL }), REASON_CLAIM_NOT_TRUE);
  });
});
