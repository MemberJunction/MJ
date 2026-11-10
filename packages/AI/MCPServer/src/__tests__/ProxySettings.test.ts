/**
 * Pins #6497: behind a reverse proxy, the OAuth proxy router's per-IP rate limit must count each client
 * by its forwarded address, and the limit must be configurable.
 *
 * 1. The settings schemas accept the documented forms and reject the rest.
 * 2. `ApplyTrustProxy` sets Express's `trust proxy` only when it is configured.
 * 3. A real Express app with the real router, served over HTTP: without `trust proxy`, clients behind
 *    one proxy share a single bucket; with `trustProxy: 1`, each forwarded client gets its own. The
 *    probe path is `/mcp`, which the router does not serve, to show that the limit covers it too.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

// ScopeService reaches @memberjunction/server, whose config loader validates database settings at
// import time. Nothing here reaches a route that consults scopes.
vi.mock('../auth/ScopeService.js', () => ({
  LoadActiveScopes: async () => [],
    get loadActiveScopes() { return this.LoadActiveScopes; },
  GetDefaultScopes: () => [],
    get getDefaultScopes() { return this.GetDefaultScopes; },
}));

import { CreateOAuthProxyRouter } from '../auth/OAuthProxyRouter.js';
import type { OAuthProxyConfig } from '../auth/OAuthProxyTypes.js';
import {
  ApplyTrustProxy,
  OAuthProxyRateLimitSchema,
  TrustProxySettingSchema,
  type TrustProxySetting,
} from '../ProxySettings.js';

const config: OAuthProxyConfig = {
  baseUrl: 'https://mcp.example.test',
  upstream: {
    authorizationEndpoint: 'https://idp.example.test/authorize',
    tokenEndpoint: 'https://idp.example.test/token',
    clientId: 'upstream-client',
    scopes: ['openid'],
  },
  enableDynamicRegistration: false,
  rateLimit: { windowMs: 60_000, limit: 2 },
};

let server: Server | undefined;

afterEach(async () => {
  const running = server;
  server = undefined;
  if (running) {
    // fetch keeps connections alive; drop them so close() returns immediately.
    running.closeAllConnections();
    await new Promise<void>((resolve) => running.close(() => resolve()));
  }
  vi.restoreAllMocks();
});

/** Serves a fresh app (OAuth proxy router at the root, as Server.ts mounts it) and returns its base URL. */
async function serve(trustProxy: TrustProxySetting | undefined): Promise<string> {
  const app = express();
  ApplyTrustProxy(app, trustProxy);
  app.use(CreateOAuthProxyRouter(config));
  const listening = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  server = listening;
  const address = listening.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server did not report a TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

/** GET /mcp as a client the proxy reports as `forwardedFor`; returns the status code. */
async function getMcpAs(base: string, forwardedFor: string): Promise<number> {
  const res = await fetch(`${base}/mcp`, { headers: { 'X-Forwarded-For': forwardedFor } });
  await res.arrayBuffer();
  return res.status;
}

describe('TrustProxySettingSchema', () => {
  it.each([0, 1, 2, true, false, 'loopback', 'loopback, 10.0.0.0/8'])('accepts %j', (value) => {
    expect(TrustProxySettingSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, '', '   ', null, {}])('rejects %j', (value) => {
    expect(TrustProxySettingSchema.safeParse(value).success).toBe(false);
  });
});

describe('OAuthProxyRateLimitSchema', () => {
  it('accepts an empty object, which keeps the router defaults', () => {
    expect(OAuthProxyRateLimitSchema.parse({})).toEqual({});
  });

  it('accepts a window and a limit', () => {
    expect(OAuthProxyRateLimitSchema.parse({ windowMs: 60_000, limit: 300 })).toEqual({ windowMs: 60_000, limit: 300 });
  });

  it.each([{ limit: 0 }, { limit: -5 }, { limit: 1.5 }, { windowMs: 0 }, { windowMs: 'soon' }])('rejects %j', (value) => {
    expect(OAuthProxyRateLimitSchema.safeParse(value).success).toBe(false);
  });
});

describe('ApplyTrustProxy', () => {
  it('leaves the Express default (trust no proxy) when the setting is absent', () => {
    const app = express();
    expect(ApplyTrustProxy(app, undefined)).toBe(false);
    expect(app.get('trust proxy')).toBeFalsy();
  });

  it('sets a hop count', () => {
    const app = express();
    expect(ApplyTrustProxy(app, 1)).toBe(true);
    expect(app.get('trust proxy')).toBe(1);
  });

  it('sets a list of trusted addresses', () => {
    const app = express();
    expect(ApplyTrustProxy(app, 'loopback, 10.0.0.0/8')).toBe(true);
    expect(app.get('trust proxy')).toBe('loopback, 10.0.0.0/8');
  });
});

describe('OAuth proxy rate limit behind a reverse proxy', () => {
  it('without trustProxy, every client behind the proxy shares one limit, /mcp included', async () => {
    // express-rate-limit logs a validation warning about X-Forwarded-For without trust proxy.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = await serve(undefined);

    expect(await getMcpAs(base, '203.0.113.1')).toBe(404);
    expect(await getMcpAs(base, '203.0.113.2')).toBe(404);
    // A third, different client is already limited: the limiter only sees the proxy's address.
    expect(await getMcpAs(base, '203.0.113.3')).toBe(429);
  });

  it('with trustProxy: 1, each forwarded client gets its own limit', async () => {
    const base = await serve(1);

    expect(await getMcpAs(base, '203.0.113.1')).toBe(404);
    expect(await getMcpAs(base, '203.0.113.1')).toBe(404);
    expect(await getMcpAs(base, '203.0.113.1')).toBe(429);
    // Another client behind the same proxy is unaffected.
    expect(await getMcpAs(base, '203.0.113.2')).toBe(404);
  });
});
