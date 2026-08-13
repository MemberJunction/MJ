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
    Instance: { Users: [], UserByName: () => undefined, GetSystemUser: () => undefined },
    Users: [],
  },
}));
vi.mock('../auth/magicLink/MagicLinkService.js', () => ({
  MagicLinkService: class {},
}));
vi.mock('../agentSessions/ReturningVisitorRecap.js', () => ({
  writeReturningVisitorRecap: async () => undefined,
}));
vi.mock('../realtimeWidget/visitorIdentity.js', () => ({
  resolveIdentityByEmail: async () => null,
  mergeVisitorIdentity: async () => 0,
  forgetVisitor: async () => ({ notesArchived: 0, conversationsCleared: 0 }),
}));

import { WidgetSessionService } from '../realtimeWidget/WidgetSessionService.js';
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
