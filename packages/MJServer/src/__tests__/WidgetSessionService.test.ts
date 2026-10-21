import { describe, it, expect, vi } from 'vitest';

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
    Instance: { Users: [], SYSTEM_USER_ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' },
    Users: [],
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

import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { BuildWidgetGuestClaims } from '../realtimeWidget/widgetCore.js';
import { CreateWidgetHandler } from '../realtimeWidget/WidgetRouter.js';
import { WidgetSessionService } from '../realtimeWidget/WidgetSessionService.js';
import type { WidgetConfig } from '../config.js';
import type { MJConversationWidgetInstanceEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

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

describe('WidgetSessionService — RefreshGuestSession preserves sessionId (issue #4931)', () => {
  const PUBLIC_URL = 'https://mj.example.com';
  const ORIGIN = 'https://allowed.example.com';
  const WIDGET_A_ID = '11111111-1111-4111-8111-111111111111';
  const WIDGET_B_ID = '22222222-2222-4222-8222-222222222222';
  const APP_ID = '33333333-3333-4333-8333-333333333333';
  const AGENT_ID = '44444444-4444-4444-8444-444444444444';
  const ROLE_ID = '55555555-5555-4555-8555-555555555555';

  function makeStubbedService(): WidgetSessionService {
    MagicLinkKeyManager.Instance.Initialize();
    const fakeWidget = {
      ID: WIDGET_A_ID,
      PublicKey: 'pk_live_widget_a',
      Status: 'Active',
      AllowedOrigins: JSON.stringify([ORIGIN]),
      Modality: 'Both',
      GuestRoleID: ROLE_ID,
      ApplicationID: APP_ID,
      PinnedAgentID: AGENT_ID,
      SessionTTLMinutes: 15,
      AuthStrategy: 'Anonymous',
      RememberReturningVisitors: false,
      EnabledChannels: null,
      VoiceMaxSessionMinutes: 10,
    } as unknown as MJConversationWidgetInstanceEntity;

    const proto = WidgetSessionService.prototype as unknown as {
      resolveLookupUser: () => UserInfo | null;
      loadWidgetByKey: (key: string) => Promise<MJConversationWidgetInstanceEntity | null>;
      resolveGuestRoleName: () => string | null;
    };
    vi.spyOn(proto, 'resolveLookupUser').mockReturnValue({ ID: 'sys-1' } as unknown as UserInfo);
    vi.spyOn(proto, 'loadWidgetByKey').mockImplementation(async (key: string) => (key === 'pk_live_widget_a' ? fakeWidget : null));
    vi.spyOn(proto, 'resolveGuestRoleName').mockReturnValue('Widget Guest');
    return new WidgetSessionService(PUBLIC_URL, makeConfig());
  }

  function signWidgetToken(opts: { widgetId?: string; sessionId?: string; nowSeconds: number; ttlSeconds: number }): string {
    const claims = BuildWidgetGuestClaims({
      issuer: PUBLIC_URL,
      audience: 'mj-magic-link',
      widgetId: opts.widgetId ?? WIDGET_A_ID,
      sessionId: opts.sessionId ?? 'sid-original-visitor',
      anonymousEmail: 'anonymous@magic-link.local',
      applicationId: APP_ID,
      guestRoleName: 'Widget Guest',
      nowSeconds: opts.nowSeconds,
      ttlSeconds: opts.ttlSeconds,
    });
    return MagicLinkKeyManager.Instance.Sign(claims);
  }

  /** Dispatches a synthetic POST /session/refresh through CreateWidgetHandler's publicRouter to verify HTTP status mapping. */
  async function postRefreshToRouter(
    _service: WidgetSessionService,
    authorizationHeader?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const { publicRouter } = CreateWidgetHandler(PUBLIC_URL, makeConfig());

    try {
      const layer = (publicRouter as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> }).stack.find(
        (l) => l.route?.path === '/session/refresh',
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      let statusCode = 200;
      let jsonBody: Record<string, unknown> = {};
      const req = {
        body: { widgetKey: 'pk_live_widget_a' },
        ip: '127.0.0.1',
        get: (header: string) => {
          const h = header.toLowerCase();
          if (h === 'origin') return ORIGIN;
          if (h === 'user-agent') return 'Mozilla/5.0 (Macintosh; Intel Mac OS X)';
          if (h === 'authorization') return authorizationHeader;
          return undefined;
        },
      };
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: Record<string, unknown>) {
          jsonBody = payload;
          return this;
        },
      };
      await handler(req, res, () => undefined);
      return { status: statusCode, body: jsonBody };
    } finally {
      vi.restoreAllMocks();
    }
  }

  it('returns the same sessionId (mj_sid) as the live token presented in Authorization: Bearer', async () => {
    const service = makeStubbedService();
    const minted = await service.MintGuestSession({ widgetKey: 'pk_live_widget_a', origin: ORIGIN });
    expect(minted.success).toBe(true);
    expect(minted.sessionId).toBeTruthy();

    const { status, body } = await postRefreshToRouter(service, `Bearer ${minted.token}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sessionId).toBe(minted.sessionId);

    const decoded = jwt.decode(body.token as string) as Record<string, unknown>;
    expect(decoded.mj_sid).toBe(minted.sessionId);
  });

  it('accepts a token expired within the 5-minute grace window and preserves its sessionId', async () => {
    const service = makeStubbedService();
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Expired 120 seconds ago (well within the 300s grace window).
    const expiredWithinGrace = signWidgetToken({
      sessionId: 'sid-grace-visitor',
      nowSeconds: nowSeconds - 720,
      ttlSeconds: 600,
    });

    const { status, body } = await postRefreshToRouter(service, `Bearer ${expiredWithinGrace}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sessionId).toBe('sid-grace-visitor');
  });

  it('returns 403 when the Authorization: Bearer header is missing', async () => {
    const service = makeStubbedService();
    const { status, body } = await postRefreshToRouter(service, undefined);
    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns 403 when the Bearer token is forged (signed with a different key)', async () => {
    const service = makeStubbedService();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const claims = BuildWidgetGuestClaims({
      issuer: PUBLIC_URL,
      audience: 'mj-magic-link',
      widgetId: WIDGET_A_ID,
      sessionId: 'sid-forged',
      anonymousEmail: 'anonymous@magic-link.local',
      applicationId: APP_ID,
      guestRoleName: 'Widget Guest',
      nowSeconds,
      ttlSeconds: 600,
    });
    const forgedToken = jwt.sign(claims, privateKey, { algorithm: 'RS256' });

    const { status, body } = await postRefreshToRouter(service, `Bearer ${forgedToken}`);
    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns 403 when the Bearer token is expired past the 5-minute grace window', async () => {
    const service = makeStubbedService();
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Expired 305 seconds ago (past the 300s grace window).
    const expiredPastGrace = signWidgetToken({
      sessionId: 'sid-too-old',
      nowSeconds: nowSeconds - 905,
      ttlSeconds: 600,
    });

    const { status, body } = await postRefreshToRouter(service, `Bearer ${expiredPastGrace}`);
    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns 403 when the Bearer token belongs to another widget instance', async () => {
    const service = makeStubbedService();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const wrongWidgetToken = signWidgetToken({
      widgetId: WIDGET_B_ID,
      sessionId: 'sid-wrong-widget',
      nowSeconds,
      ttlSeconds: 600,
    });

    const { status, body } = await postRefreshToRouter(service, `Bearer ${wrongWidgetToken}`);
    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });
});
