import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Metadata, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { BuildWidgetGuestClaims } from '../realtimeWidget/widgetCore.js';

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

import { REFRESH_GRACE_SECONDS, WidgetSessionService } from '../realtimeWidget/WidgetSessionService.js';
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

describe('WidgetSessionService — RefreshGuestSession preserves sessionId (issue #4931)', () => {
  const PUBLIC_URL = 'https://mj.example.com';
  const WIDGET_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_WIDGET_ID = '22222222-2222-4222-8222-222222222222';
  const APP_ID = '33333333-3333-4333-8333-333333333333';
  const AGENT_ID = '44444444-4444-4444-8444-444444444444';
  const ROLE_ID = '55555555-5555-4555-8555-555555555555';
  const WIDGET_KEY = 'pk_live_test_widget';
  const ALLOWED_ORIGIN = 'https://customer.example.com';
  let originalProvider: IMetadataProvider;

  beforeEach(() => {
    MagicLinkKeyManager.Instance.Initialize();
    (UserCache.Instance.Users as unknown[]) = [
      {
        ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
        Name: 'System',
        Email: 'not.set@nowhere.com',
        Type: 'Owner',
        IsActive: true,
      } as unknown as UserInfo,
    ];
    originalProvider = Metadata.Provider;
    Metadata.Provider = {
      Roles: [{ ID: ROLE_ID, Name: 'Widget Guest' }],
    } as unknown as IMetadataProvider;
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
      Success: true,
      Results: [
        {
          ID: WIDGET_ID,
          PublicKey: WIDGET_KEY,
          Status: 'Active',
          AllowedOrigins: JSON.stringify([ALLOWED_ORIGIN]),
          Modality: 'Both',
          GuestRoleID: ROLE_ID,
          ApplicationID: APP_ID,
          PinnedAgentID: AGENT_ID,
          AuthStrategy: 'Anonymous',
          SessionTTLMinutes: 15,
          RememberReturningVisitors: false,
          EnabledChannels: null,
          VoiceMaxSessionMinutes: 10,
        },
      ],
      RowCount: 1,
      TotalRowCount: 1,
      ExecutionTime: 1,
      ErrorMessage: '',
    });
  });

  afterEach(() => {
    (UserCache.Instance.Users as unknown[]) = [];
    Metadata.Provider = originalProvider;
    vi.restoreAllMocks();
  });

  function decodeToken(token: string): jwt.JwtPayload {
    const publicKey = createPublicKey({ key: MagicLinkKeyManager.Instance.GetJWKS().keys[0] as JsonWebKey, format: 'jwk' });
    return jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'mj-magic-link' }) as jwt.JwtPayload;
  }

  it('exports REFRESH_GRACE_SECONDS = 300', () => {
    expect(REFRESH_GRACE_SECONDS).toBe(300);
  });

  it('preserves sessionId (mj_sid and mj_scope.resourceId) when refreshing with a valid bearer token', async () => {
    const service = new WidgetSessionService(PUBLIC_URL, makeConfig());
    const minted = await service.MintGuestSession({ widgetKey: WIDGET_KEY, origin: ALLOWED_ORIGIN });
    expect(minted.success).toBe(true);
    expect(minted.sessionId).toBeTruthy();

    const refreshed = await service.RefreshGuestSession({
      widgetKey: WIDGET_KEY,
      origin: ALLOWED_ORIGIN,
      bearerToken: minted.token,
    });

    expect(refreshed.success).toBe(true);
    expect(refreshed.sessionId).toBe(minted.sessionId);
    const decoded = decodeToken(refreshed.token!);
    expect(decoded.mj_sid).toBe(minted.sessionId);
    expect((decoded.mj_scopes as Array<{ resourceId?: string }> | undefined)?.[0]?.resourceId).toBe(minted.sessionId);
  });

  it('accepts a token expired within REFRESH_GRACE_SECONDS and preserves its sessionId', async () => {
    const service = new WidgetSessionService(PUBLIC_URL, makeConfig());
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Token expired 120s ago (within the 300s grace window).
    const recentlyExpiredClaims = BuildWidgetGuestClaims({
      issuer: PUBLIC_URL,
      audience: 'mj-magic-link',
      widgetId: WIDGET_ID,
      sessionId: 'visitor-sid-keep-me',
      anonymousEmail: 'anonymous@magic-link.local',
      applicationId: APP_ID,
      guestRoleName: 'Widget Guest',
      nowSeconds: nowSeconds - 1020,
      ttlSeconds: 900,
    });
    const expiredToken = MagicLinkKeyManager.Instance.Sign(recentlyExpiredClaims);

    const refreshed = await service.RefreshGuestSession({
      widgetKey: WIDGET_KEY,
      origin: ALLOWED_ORIGIN,
      bearerToken: expiredToken,
    });

    expect(refreshed.success).toBe(true);
    expect(refreshed.sessionId).toBe('visitor-sid-keep-me');
    const decoded = decodeToken(refreshed.token!);
    expect(decoded.mj_sid).toBe('visitor-sid-keep-me');
  });

  it('refuses refresh with no bearer token, a bad signature, a wrong mj_widget_id, or a token expired past REFRESH_GRACE_SECONDS', async () => {
    const service = new WidgetSessionService(PUBLIC_URL, makeConfig());
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. No bearer token
    await expect(
      service.RefreshGuestSession({ widgetKey: WIDGET_KEY, origin: ALLOWED_ORIGIN }),
    ).resolves.toMatchObject({ success: false, errorCode: 'not_found' });

    // 2. Bad signature
    const minted = await service.MintGuestSession({ widgetKey: WIDGET_KEY, origin: ALLOWED_ORIGIN });
    const tampered = `${minted.token!.slice(0, -4)}AAAA`;
    await expect(
      service.RefreshGuestSession({ widgetKey: WIDGET_KEY, origin: ALLOWED_ORIGIN, bearerToken: tampered }),
    ).resolves.toMatchObject({ success: false, errorCode: 'not_found' });

    // 3. Wrong mj_widget_id
    const wrongWidgetToken = MagicLinkKeyManager.Instance.Sign(
      BuildWidgetGuestClaims({
        issuer: PUBLIC_URL,
        audience: 'mj-magic-link',
        widgetId: OTHER_WIDGET_ID,
        sessionId: 'visitor-sid-wrong-widget',
        anonymousEmail: 'anonymous@magic-link.local',
        applicationId: APP_ID,
        guestRoleName: 'Widget Guest',
        nowSeconds,
        ttlSeconds: 900,
      }),
    );
    await expect(
      service.RefreshGuestSession({ widgetKey: WIDGET_KEY, origin: ALLOWED_ORIGIN, bearerToken: wrongWidgetToken }),
    ).resolves.toMatchObject({ success: false, errorCode: 'not_found' });

    // 4. Expired past REFRESH_GRACE_SECONDS (expired 310s ago)
    const staleToken = MagicLinkKeyManager.Instance.Sign(
      BuildWidgetGuestClaims({
        issuer: PUBLIC_URL,
        audience: 'mj-magic-link',
        widgetId: WIDGET_ID,
        sessionId: 'visitor-sid-too-old',
        anonymousEmail: 'anonymous@magic-link.local',
        applicationId: APP_ID,
        guestRoleName: 'Widget Guest',
        nowSeconds: nowSeconds - 900 - REFRESH_GRACE_SECONDS - 10,
        ttlSeconds: 900,
      }),
    );
    await expect(
      service.RefreshGuestSession({ widgetKey: WIDGET_KEY, origin: ALLOWED_ORIGIN, bearerToken: staleToken }),
    ).resolves.toMatchObject({ success: false, errorCode: 'not_found' });
  });
});
