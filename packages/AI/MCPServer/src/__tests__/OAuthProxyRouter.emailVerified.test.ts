/**
 * Drives GET /oauth/callback through the real OAuth proxy router to pin that the upstream token is
 * linked to an MJ user only when its email address is acceptable as verified.
 *
 * The upstream token endpoint (`fetch`) is stubbed to return a signed ID token. The email screen
 * is MJServer's own module. `@memberjunction/server` is mocked only for the user lookup, because
 * importing it for real loads the server config, which needs database settings.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Application, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';

const { mockVerifyUserRecord } = vi.hoisted(() => ({ mockVerifyUserRecord: vi.fn() }));

vi.mock('@memberjunction/server', async () => {
  const screen = await import('../../../../MJServer/src/auth/tokenEmailScreen.js');
  return {
    verifyUserRecord: mockVerifyUserRecord,
    ScreenTokenEmailClaims: screen.ScreenTokenEmailClaims,
    IssuerRequiresVerifiedEmail: screen.IssuerRequiresVerifiedEmail,
  };
});

// ScopeService reaches @memberjunction/server's config loader; the callback without a consent
// screen never consults scopes.
vi.mock('../auth/ScopeService.js', () => ({
  LoadActiveScopes: async () => [],
  GetDefaultScopes: () => [],
}));

import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { RecordRequireVerifiedEmailSetting } from '../../../../MJServer/src/auth/tokenEmailScreen.js';
import { CreateOAuthProxyRouter } from '../auth/OAuthProxyRouter.js';
import { GetAuthorizationStateManager } from '../auth/AuthorizationStateManager.js';
import type { OAuthProxyConfig } from '../auth/OAuthProxyTypes.js';

const ISSUER = 'https://idp.example.test/';
const OWNER_EMAIL = 'owner@corp.example';
const REDIRECT = 'https://client.example.test/callback';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const config: OAuthProxyConfig = {
  baseUrl: 'https://mcp.example.test',
  upstream: {
    authorizationEndpoint: 'https://idp.example.test/authorize',
    tokenEndpoint: 'https://idp.example.test/token',
    clientId: 'upstream-client',
    scopes: ['openid'],
  },
  enableDynamicRegistration: false,
  enableConsentScreen: false,
  jwt: { signingSecret: 'test-signing-secret-that-is-long-enough-0123456789', expiresIn: '1h', issuer: 'urn:mj:mcp-server' },
};

/** Registers an Okta provider for the upstream issuer, with or without the strict setting. */
function registerProvider(requireVerifiedEmail?: boolean): void {
  const factory = AuthProviderFactory.Instance;
  factory.clear();
  const providerConfig = {
    name: 'test-idp', type: 'okta', issuer: ISSUER, audience: 'upstream-client',
    jwksUri: 'https://idp.example.test/jwks', clientId: 'upstream-client', domain: 'idp.example.test',
    ...(requireVerifiedEmail === undefined ? {} : { requireVerifiedEmail }),
  };
  const provider = AuthProviderFactory.createProvider(providerConfig);
  RecordRequireVerifiedEmailSetting(provider, providerConfig);
  factory.register(provider);
}

/** Makes the stubbed upstream token endpoint return an ID token with these claims. */
function upstreamReturns(claims: Record<string, unknown>): void {
  const idToken = jwt.sign({ sub: 'idp-subject', ...claims }, keys.privateKey, {
    algorithm: 'RS256', issuer: ISSUER, audience: 'upstream-client', expiresIn: '5m',
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ access_token: 'upstream-access', token_type: 'Bearer', id_token: idToken }),
    text: async () => '',
  })));
}

/** Sends the upstream callback through the router and resolves with the status code. */
function dispatchCallback(router: Router): Promise<number> {
  const state = GetAuthorizationStateManager().CreateState({ clientId: 'client-1', redirectUri: REDIRECT });
  return new Promise((resolve, reject) => {
    let status = 200;
    const res: Partial<Response> = {};
    res.status = (code: number) => { status = code; return res as Response; };
    res.type = () => res as Response;
    res.set = () => res as Response;
    res.setHeader = () => res as Response;
    res.getHeader = () => undefined;
    res.send = () => { resolve(status); return res as Response; };
    res.redirect = (() => resolve(302)) as Response['redirect'];
    const req = {
      method: 'GET',
      url: `/oauth/callback?code=upstream-code&state=${state}`,
      originalUrl: `/oauth/callback?code=upstream-code&state=${state}`,
      headers: {},
      query: { code: 'upstream-code', state },
      ip: '203.0.113.30',
      app: { get: () => undefined } as Application,
    } as Partial<Request>;
    router(req as Request, res as Response, (err?: unknown) => {
      reject(err instanceof Error ? err : new Error('request fell through the router'));
    });
  });
}

let router: Router;
let warnSpy: ReturnType<typeof vi.spyOn>;

/** Asserts that the callback is refused, the reason is logged and no user is looked up. */
async function expectRefused(claims: Record<string, unknown>, reason: string): Promise<void> {
  upstreamReturns(claims);
  const status = await dispatchCallback(router);
  expect(status).toBe(400);
  expect(mockVerifyUserRecord).not.toHaveBeenCalled();
  const logged = warnSpy.mock.calls.some((call) => {
    const line = call.map(String).join(' ');
    return line.includes('Token refused') && line.includes(reason);
  });
  expect(logged).toBe(true);
}

describe('OAuth proxy upstream token email verification', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    router = CreateOAuthProxyRouter(config);
  });

  beforeEach(() => {
    mockVerifyUserRecord.mockReset();
    mockVerifyUserRecord.mockResolvedValue({ ID: 'OWNER-ID', Email: OWNER_EMAIL, IsActive: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses an upstream token whose email_verified claim is false and looks up no user', async () => {
    await expectRefused({ email: OWNER_EMAIL, email_verified: false }, 'marks the email address as not verified');
  });

  describe('with requireVerifiedEmail on the provider', () => {
    beforeEach(() => registerProvider(true));

    it('refuses an upstream token that has no email_verified claim', async () => {
      await expectRefused({ email: OWNER_EMAIL }, 'requires email_verified to be true');
    });

    it('refuses an upstream token whose only address is the preferred_username claim', async () => {
      await expectRefused({ preferred_username: OWNER_EMAIL, email_verified: true }, 'requires a verified email claim');
    });

    it('refuses an upstream token whose only address is the upn claim', async () => {
      await expectRefused({ upn: OWNER_EMAIL, email_verified: true }, 'requires a verified email claim');
    });
  });
});
