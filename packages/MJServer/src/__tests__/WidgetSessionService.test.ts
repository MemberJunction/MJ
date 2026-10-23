import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';

const runViewMock = vi.fn(async () => ({ Success: true, Results: [] as unknown[] }));
const mockUsers: Array<{ ID: string; Email: string; IsActive: boolean }> = [];
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: class {
      RunView = runViewMock;
    },
    Metadata: {
      get Provider() {
        return {
          Roles: [{ ID: '00000000-0000-4000-8000-000000000099', Name: 'Widget Guest' }],
        };
      },
    },
  };
});

// WidgetSessionService is the imperative shell for public widget sessions — importing it pulls in
// config.ts (which eagerly validates DB env vars at module load) plus the full magic-link /
// returning-visitor / communication stacks. This suite only exercises the `ResolvePerInstanceRateLimit`
// cache-bounding behavior, so stub those transitive deps out (mirrors the pattern already established
// in `magicLinkService.provisionLog.test.ts` for testing another imperative-shell class).
vi.mock('../config.js', () => ({
  configInfo: {},
}));
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    // The subject reads exactly these two through `ResolveConfiguredPrincipal`. It no longer
    // calls `UserByName`/`GetSystemUser`, and stubbing members nobody calls hides the day a
    // test does reach `resolveLookupUser` and trips the resolver's missing-system-id guard.
    Instance: {
      get Users() {
        return mockUsers;
      },
      SYSTEM_USER_ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    },
    get Users() {
      return mockUsers;
    },
  },
}));
vi.mock('../auth/magicLink/MagicLinkService.js', () => ({
  MagicLinkService: class {},
}));
vi.mock('../agentSessions/ReturningVisitorRecap.js', () => ({
  WriteReturningVisitorRecap: async () => undefined,
    get writeReturningVisitorRecap() { return this.WriteReturningVisitorRecap; },
}));
vi.mock('../realtimeWidget/visitorIdentity.js', () => ({
  ResolveIdentityByEmail: async () => null,
    get resolveIdentityByEmail() { return this.ResolveIdentityByEmail; },
  MergeVisitorIdentity: async () => 0,
    get mergeVisitorIdentity() { return this.MergeVisitorIdentity; },
  ForgetVisitor: async () => ({ notesArchived: 0, conversationsCleared: 0 }),
    get forgetVisitor() { return this.ForgetVisitor; },
}));

import { WidgetSessionService, REFRESH_GRACE_SECONDS } from '../realtimeWidget/WidgetSessionService.js';
import { CreateWidgetHandler } from '../realtimeWidget/WidgetRouter.js';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import type { WidgetConfig } from '../config.js';

/**
 * Minimal `WidgetConfig` matching the zod schema's post-parse (defaulted) shape —
 * enough for `ResolvePerInstanceRateLimit`, which never dereferences most of these.
 */
function makeConfig(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    enabled: true,
    signingReuse: 'magic-link',
    audience: 'mj-magic-link',
    anonymousEmail: 'anonymous@magic-link.local',
    defaultSessionTtlMinutes: 15,
    defaultRateLimitPerMinute: 30,
    rateLimitWindowMs: 60_000,
    voiceDefaultMaxSessionMinutes: 10,
    hostPublicKeys: {},
    ...overrides,
  };
}

describe('WidgetSessionService — ResolvePerInstanceRateLimit', () => {
  it('returns the deployment-wide default for an empty widget key without touching the cache', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig({ defaultRateLimitPerMinute: 42 }));
    await expect(service.ResolvePerInstanceRateLimit('')).resolves.toBe(42);
    expect(service.RateLimitCacheSize).toBe(0);
  });

  it('falls back to the default (and still caches) when the widget key cannot be resolved (no DB in unit tests)', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig({ defaultRateLimitPerMinute: 30 }));
    await expect(service.ResolvePerInstanceRateLimit('pk_live_unknown')).resolves.toBe(30);
    expect(service.RateLimitCacheSize).toBe(1);
  });

  it('caches a resolved limit per key instead of re-resolving on every call', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    await service.ResolvePerInstanceRateLimit('pk_live_same_key');
    await service.ResolvePerInstanceRateLimit('pk_live_same_key');
    await service.ResolvePerInstanceRateLimit('pk_live_same_key');
    expect(service.RateLimitCacheSize).toBe(1);
  });

  it(
    'never grows the rate-limit cache past its configured bound, even under an unbounded stream of ' +
      'distinct attacker-supplied widget keys (Memory Leak Audit Round 8, Critical finding — the cache ' +
      'key is unauthenticated request input on the public /widget/session endpoint)',
    async () => {
      const service = new WidgetSessionService('https://mj.example.com', makeConfig());
      // Far more distinct keys than any real deployment's widget-instance count, and comfortably
      // more than the cache's configured max size — simulates an attacker sending a fresh garbage
      // widgetKey on every request.
      const distinctKeyCount = 12_000;
      for (let i = 0; i < distinctKeyCount; i++) {
        await service.ResolvePerInstanceRateLimit(`pk_live_attacker_${i}`);
      }
      expect(service.RateLimitCacheSize).toBeLessThan(distinctKeyCount);
      expect(service.RateLimitCacheSize).toBeLessThanOrEqual(10_000);
    },
  );

  it('trims whitespace before using the key to look up / populate the cache', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    await service.ResolvePerInstanceRateLimit('  pk_live_padded  ');
    await service.ResolvePerInstanceRateLimit('pk_live_padded');
    expect(service.RateLimitCacheSize).toBe(1);
  });
});

describe('WidgetSessionService — RefreshGuestSession preserves mj_sid (#4931)', () => {
  const WIDGET_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_WIDGET_ID = '22222222-2222-4222-8222-222222222222';
  const APP_ID = '33333333-3333-4333-8333-333333333333';
  const ROLE_ID = '00000000-0000-4000-8000-000000000099';
  const AGENT_ID = '44444444-4444-4444-8444-444444444444';

  function makeWidgetRow() {
    return {
      ID: WIDGET_ID,
      PublicKey: 'pk_live_test',
      Status: 'Active',
      AllowedOrigins: '["https://acme.com"]',
      Modality: 'Both',
      GuestRoleID: ROLE_ID,
      ApplicationID: APP_ID,
      PinnedAgentID: AGENT_ID,
      AuthStrategy: 'Anonymous',
      SessionTTLMinutes: 15,
      RateLimitPerMinute: 30,
      RememberReturningVisitors: false,
      EnabledChannels: null,
      VoiceMaxSessionMinutes: 10,
    };
  }

  beforeEach(() => {
    MagicLinkKeyManager.Instance.Initialize();
    mockUsers.length = 0;
    mockUsers.push({ ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', Email: 'system@system.org', IsActive: true });
    runViewMock.mockReset();
    runViewMock.mockImplementation(async (params: { ExtraFilter?: string }) => {
      if (params.ExtraFilter?.includes('pk_live_test')) {
        return { Success: true, Results: [makeWidgetRow()] };
      }
      return { Success: true, Results: [] };
    });
  });

  it('exports REFRESH_GRACE_SECONDS = 300', () => {
    expect(REFRESH_GRACE_SECONDS).toBe(300);
  });

  it('preserves sessionId and mj_sid across RefreshGuestSession when presented with the current valid Bearer token', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    const minted = await service.MintGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
    });
    expect(minted.success).toBe(true);
    expect(minted.sessionId).toBeDefined();
    expect(minted.token).toBeDefined();

    const refreshed = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
      BearerToken: minted.token,
    });
    expect(refreshed.success).toBe(true);
    expect(refreshed.sessionId).toBe(minted.sessionId);

    const publicKey = createPublicKey({ key: MagicLinkKeyManager.Instance.GetJWKS().keys[0] as object, format: 'jwk' });
    const decoded = jwt.verify(refreshed.token!, publicKey, { algorithms: ['RS256'], audience: 'mj-magic-link' }) as jwt.JwtPayload;
    expect(decoded.mj_sid).toBe(minted.sessionId);
    expect(decoded.sub).toBe(`magic-link|${minted.sessionId}`);
    expect(decoded.mj_scopes?.[0]?.resourceId).toBe(minted.sessionId);
  });

  it('accepts a token that expired within REFRESH_GRACE_SECONDS (e.g. 60s ago) and preserves sessionId', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    const nowSeconds = Math.floor(Date.now() / 1000);
    const recentlyExpiredToken = MagicLinkKeyManager.Instance.Sign({
      iss: 'https://mj.example.com',
      aud: 'mj-magic-link',
      sub: 'magic-link|sid-recent-exp',
      email: 'anonymous@magic-link.local',
      iat: nowSeconds - 960,
      exp: nowSeconds - 60,
      mj_magic_link: true,
      mj_anon: true,
      mj_sid: 'sid-recent-exp',
      mj_widget_id: WIDGET_ID,
      mj_app_id: APP_ID,
      mj_role: 'Widget Guest',
      mj_scopes: [{ appId: APP_ID, role: 'Widget Guest', resourceType: 'Custom', resourceId: 'sid-recent-exp' }],
    });

    const refreshed = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
      BearerToken: recentlyExpiredToken,
    });
    expect(refreshed.success).toBe(true);
    expect(refreshed.sessionId).toBe('sid-recent-exp');
  });

  it('rejects RefreshGuestSession with uniform 403 not_found when bearerToken is missing, tampered, expired past grace, wrong widget, or non-anonymous', async () => {
    const service = new WidgetSessionService('https://mj.example.com', makeConfig());
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. Missing bearerToken
    const missing = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
    });
    expect(missing).toMatchObject({ success: false, errorCode: 'not_found' });

    // 2. Tampered signature
    const minted = await service.MintGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
    });
    const tampered = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
      BearerToken: minted.token!.slice(0, -4) + 'AAAA',
    });
    expect(tampered).toMatchObject({ success: false, errorCode: 'not_found' });

    // 3. Expired past REFRESH_GRACE_SECONDS (301s ago)
    const tooOldToken = MagicLinkKeyManager.Instance.Sign({
      iss: 'https://mj.example.com',
      aud: 'mj-magic-link',
      sub: 'magic-link|sid-old',
      email: 'anonymous@magic-link.local',
      iat: nowSeconds - 1201,
      exp: nowSeconds - (REFRESH_GRACE_SECONDS + 1),
      mj_magic_link: true,
      mj_anon: true,
      mj_sid: 'sid-old',
      mj_widget_id: WIDGET_ID,
      mj_app_id: APP_ID,
      mj_role: 'Widget Guest',
    });
    const expiredBeyondGrace = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
      BearerToken: tooOldToken,
    });
    expect(expiredBeyondGrace).toMatchObject({ success: false, errorCode: 'not_found' });

    // 4. Wrong mj_widget_id
    const wrongWidgetToken = MagicLinkKeyManager.Instance.Sign({
      iss: 'https://mj.example.com',
      aud: 'mj-magic-link',
      sub: 'magic-link|sid-other-widget',
      email: 'anonymous@magic-link.local',
      iat: nowSeconds,
      exp: nowSeconds + 900,
      mj_magic_link: true,
      mj_anon: true,
      mj_sid: 'sid-other-widget',
      mj_widget_id: OTHER_WIDGET_ID,
      mj_app_id: APP_ID,
      mj_role: 'Widget Guest',
    });
    const wrongWidget = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
      BearerToken: wrongWidgetToken,
    });
    expect(wrongWidget).toMatchObject({ success: false, errorCode: 'not_found' });

    // 5. Non-anonymous magic-link token (mj_anon: false)
    const nonAnonToken = MagicLinkKeyManager.Instance.Sign({
      iss: 'https://mj.example.com',
      aud: 'mj-magic-link',
      sub: 'magic-link|sid-non-anon',
      email: 'verified@example.com',
      iat: nowSeconds,
      exp: nowSeconds + 900,
      mj_magic_link: true,
      mj_anon: false,
      mj_sid: 'sid-non-anon',
      mj_widget_id: WIDGET_ID,
      mj_app_id: APP_ID,
      mj_role: 'Widget Guest',
    });
    const nonAnon = await service.RefreshGuestSession({
      widgetKey: 'pk_live_test',
      origin: 'https://acme.com',
      BearerToken: nonAnonToken,
    });
    expect(nonAnon).toMatchObject({ success: false, errorCode: 'not_found' });
  });
});

describe('WidgetSessionService — RefreshGuestSession re-applies every mint check (#4931)', () => {
  const WIDGET_ID = '11111111-1111-4111-8111-111111111111';
  const APP_ID = '33333333-3333-4333-8333-333333333333';
  const ROLE_ID = '00000000-0000-4000-8000-000000000099';
  const ISSUER = 'https://mj.example.com';
  const ORIGIN = 'https://acme.com';
  const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  let widgetOverrides: Record<string, unknown> = {};

  function makeWidgetRow() {
    return {
      ID: WIDGET_ID,
      PublicKey: 'pk_live_test',
      Status: 'Active',
      AllowedOrigins: `["${ORIGIN}"]`,
      Modality: 'Both',
      GuestRoleID: ROLE_ID,
      ApplicationID: APP_ID,
      PinnedAgentID: '44444444-4444-4444-8444-444444444444',
      AuthStrategy: 'Anonymous',
      SessionTTLMinutes: 15,
      RateLimitPerMinute: 30,
      RememberReturningVisitors: false,
      EnabledChannels: null,
      VoiceMaxSessionMinutes: 10,
      ...widgetOverrides,
    };
  }

  /** A live widget guest token for WIDGET_ID; each claim can be overridden (or removed with `undefined`). */
  function signGuestToken(overrides: Record<string, unknown> = {}): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: ISSUER,
      aud: 'mj-magic-link',
      sub: 'magic-link|sid-live',
      email: 'anonymous@magic-link.local',
      iat: nowSeconds,
      exp: nowSeconds + 900,
      mj_magic_link: true,
      mj_anon: true,
      mj_sid: 'sid-live',
      mj_widget_id: WIDGET_ID,
      mj_app_id: APP_ID,
      mj_role: 'Widget Guest',
      ...overrides,
    };
    for (const key of Object.keys(claims)) {
      if (claims[key] === undefined) {
        delete claims[key];
      }
    }
    return MagicLinkKeyManager.Instance.Sign(claims);
  }

  function refresh(service: WidgetSessionService, bearerToken: string, origin = ORIGIN) {
    return service.RefreshGuestSession({ widgetKey: 'pk_live_test', origin, BearerToken: bearerToken });
  }

  beforeEach(() => {
    widgetOverrides = {};
    MagicLinkKeyManager.Instance.Initialize();
    mockUsers.length = 0;
    mockUsers.push({ ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', Email: 'system@system.org', IsActive: true });
    runViewMock.mockReset();
    runViewMock.mockImplementation(async (params: { ExtraFilter?: string }) =>
      params.ExtraFilter?.includes('pk_live_test') ? { Success: true, Results: [makeWidgetRow()] } : { Success: true, Results: [] },
    );
  });

  it('accepts a valid token passed as BearerToken and keeps its mj_sid', async () => {
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken());
    expect(refreshed).toMatchObject({ success: true, sessionId: 'sid-live' });
  });

  it('refuses a valid token from an origin the widget does not allow', async () => {
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken(), 'https://evil.example');
    expect(refreshed.success).toBe(false);
    expect(refreshed.errorCode).toBe('origin_not_allowed');
  });

  it('refuses a HostIdentity widget refresh that carries no host assertion', async () => {
    widgetOverrides = { AuthStrategy: 'HostIdentity', HostPublicKey: null };
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken());
    expect(refreshed).toMatchObject({ success: false, errorCode: 'host_assertion_invalid' });
  });

  it('refuses when the widget guest role cannot be resolved', async () => {
    widgetOverrides = { GuestRoleID: '99999999-9999-4999-8999-999999999999' };
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken());
    expect(refreshed).toMatchObject({ success: false, errorCode: 'server_error' });
  });

  it('refuses a token without the mj_magic_link claim', async () => {
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken({ mj_magic_link: undefined }));
    expect(refreshed).toMatchObject({ success: false, errorCode: 'not_found' });
  });

  it('refuses a token signed with the right key for another audience', async () => {
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken({ aud: 'some-other-audience' }));
    expect(refreshed).toMatchObject({ success: false, errorCode: 'not_found' });
  });

  it('refuses a token signed with the right key by another issuer', async () => {
    const service = new WidgetSessionService(ISSUER, makeConfig());
    const refreshed = await refresh(service, signGuestToken({ iss: 'https://other-deployment.example' }));
    expect(refreshed).toMatchObject({ success: false, errorCode: 'not_found' });
  });

  describe('through the real POST /session/refresh route', () => {
    let server: Server | undefined;

    async function startRouter(): Promise<string> {
      const app = express();
      app.use('/widget', CreateWidgetHandler(ISSUER, makeConfig()).publicRouter);
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/widget/session/refresh`;
    }

    function post(url: string, body: Record<string, unknown>, authorization?: string) {
      const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN, 'user-agent': BROWSER_UA };
      if (authorization) {
        headers.authorization = authorization;
      }
      return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    }

    afterEach(async () => {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      server = undefined;
    });

    it('reads the token from the Authorization header and keeps its mj_sid', async () => {
      const url = await startRouter();
      const res = await post(url, { widgetKey: 'pk_live_test' }, `Bearer ${signGuestToken()}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true, sessionId: 'sid-live' });
    });

    it('returns 403 without an Authorization header, even when the body carries a token', async () => {
      const url = await startRouter();
      const res = await post(url, { widgetKey: 'pk_live_test', BearerToken: signGuestToken(), bearerToken: signGuestToken() });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ success: false, errorCode: 'not_found' });
    });
  });
});
