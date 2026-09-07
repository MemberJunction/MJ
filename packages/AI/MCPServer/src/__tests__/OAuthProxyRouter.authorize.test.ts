/**
 * Drives the real OAuth proxy router with a fake request/response pair to pin two properties of
 * the authorization endpoint:
 *
 * 1. No redirect to a caller-supplied `redirect_uri` before the client is known AND that URI is
 *    registered for it (RFC 6749 §4.1.2.1). Redirecting those early errors made the proxy an
 *    open redirector.
 * 2. Query parameters that Express parses to arrays (`?client_id=a&client_id=b`) are treated as
 *    missing rather than reaching string operations.
 * 3. The router is rate-limited per client IP.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Application, Request, Response, Router } from 'express';

// ScopeService reaches @memberjunction/server, whose config loader validates database settings
// at import time. The authorize endpoint under test never consults scopes on its error paths.
vi.mock('../auth/ScopeService.js', () => ({
  loadActiveScopes: async () => [],
  getDefaultScopes: () => [],
}));

import { createOAuthProxyRouter } from '../auth/OAuthProxyRouter.js';
import { getClientRegistry } from '../auth/ClientRegistry.js';
import type { OAuthProxyConfig } from '../auth/OAuthProxyTypes.js';

const REGISTERED_REDIRECT = 'https://client.example.test/callback';
const EVIL_REDIRECT = 'https://evil.example.test/steal';

const config: OAuthProxyConfig = {
  baseUrl: 'https://mcp.example.test',
  upstream: {
    authorizationEndpoint: 'https://idp.example.test/authorize',
    tokenEndpoint: 'https://idp.example.test/token',
    clientId: 'upstream-client',
    scopes: ['openid'],
  },
  enableDynamicRegistration: false,
};

interface Outcome {
  statusCode: number;
  redirectedTo?: string;
  body?: string;
}

function dispatchAuthorize(
  router: Router,
  query: Record<string, string | string[]>,
  clientIp = '203.0.113.10'
): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const out: Outcome = { statusCode: 200 };
    const res: Partial<Response> = {};
    res.status = (code: number) => {
      out.statusCode = code;
      return res as Response;
    };
    res.type = () => res as Response;
    res.set = () => res as Response;
    res.setHeader = () => res as Response;
    res.getHeader = () => undefined;
    res.send = (body: string) => {
      out.body = body;
      resolve(out);
      return res as Response;
    };
    res.json = (body: unknown) => {
      out.body = JSON.stringify(body);
      resolve(out);
      return res as Response;
    };
    res.redirect = ((url: string) => {
      out.statusCode = 302;
      out.redirectedTo = url;
      resolve(out);
    }) as Response['redirect'];

    const req: Partial<Request> = {
      method: 'GET',
      url: '/oauth/authorize',
      originalUrl: '/oauth/authorize',
      headers: {},
      query,
      ip: clientIp,
      // express-rate-limit's trust-proxy validation reads app settings; give it an app with none.
      app: { get: () => undefined } as Application,
    };
    router(req as Request, res as Response, (err?: unknown) => {
      reject(err instanceof Error ? err : new Error('request fell through the router'));
    });
  });
}

describe('OAuth proxy /oauth/authorize', () => {
  let router: Router;
  let clientId: string;

  beforeAll(() => {
    router = createOAuthProxyRouter(config);
    clientId = getClientRegistry().registerClient({
      redirect_uris: [REGISTERED_REDIRECT],
      client_name: 'authorize-endpoint test client',
    }).client_id;
  });

  describe('never redirects to an unvalidated redirect_uri', () => {
    it('renders an error page when client_id is missing', async () => {
      const out = await dispatchAuthorize(router, { redirect_uri: EVIL_REDIRECT, response_type: 'code' });
      expect(out.redirectedTo).toBeUndefined();
      expect(out.statusCode).toBe(400);
      expect(out.body).toContain('client_id is required');
    });

    it('renders an error page for an unknown client_id', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: 'no-such-client',
        redirect_uri: EVIL_REDIRECT,
        response_type: 'code',
      });
      expect(out.redirectedTo).toBeUndefined();
      expect(out.statusCode).toBe(400);
      expect(out.body).toContain('Unknown client_id');
    });

    it('renders an error page when redirect_uri is not registered for the client', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: clientId,
        redirect_uri: EVIL_REDIRECT,
        response_type: 'code',
      });
      expect(out.redirectedTo).toBeUndefined();
      expect(out.statusCode).toBe(400);
      expect(out.body).toContain('redirect_uri not registered');
    });

    it('renders an error page for an unsupported response_type before the client is validated', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: 'no-such-client',
        redirect_uri: EVIL_REDIRECT,
        response_type: 'token',
      });
      expect(out.redirectedTo).toBeUndefined();
      expect(out.statusCode).toBe(400);
    });
  });

  describe('redirects errors once the client and redirect_uri are validated', () => {
    it('redirects an unsupported response_type to the registered URI with the error and state', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: clientId,
        redirect_uri: REGISTERED_REDIRECT,
        response_type: 'token',
        state: 'xyz',
      });
      expect(out.statusCode).toBe(302);
      const url = new URL(out.redirectedTo ?? '');
      expect(url.origin + url.pathname).toBe(REGISTERED_REDIRECT);
      expect(url.searchParams.get('error')).toBe('unsupported_response_type');
      expect(url.searchParams.get('state')).toBe('xyz');
    });

    it('redirects a missing code_challenge to the registered URI', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: clientId,
        redirect_uri: REGISTERED_REDIRECT,
        response_type: 'code',
      });
      expect(out.statusCode).toBe(302);
      const url = new URL(out.redirectedTo ?? '');
      expect(url.origin + url.pathname).toBe(REGISTERED_REDIRECT);
      expect(url.searchParams.get('error')).toBe('invalid_request');
    });
  });

  describe('array-valued query parameters', () => {
    it('treats a repeated client_id as missing instead of reaching string operations', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: [clientId, 'second'],
        redirect_uri: EVIL_REDIRECT,
        response_type: 'code',
      });
      expect(out.redirectedTo).toBeUndefined();
      expect(out.statusCode).toBe(400);
      expect(out.body).toContain('client_id is required');
    });

    it('treats a repeated redirect_uri as missing', async () => {
      const out = await dispatchAuthorize(router, {
        client_id: clientId,
        redirect_uri: [REGISTERED_REDIRECT, EVIL_REDIRECT],
        response_type: 'code',
      });
      expect(out.redirectedTo).toBeUndefined();
      expect(out.statusCode).toBe(400);
      expect(out.body).toContain('redirect_uri is required');
    });
  });

  describe('rate limiting', () => {
    it('answers 429 once a client IP exceeds the configured limit', async () => {
      const limited = createOAuthProxyRouter({ ...config, rateLimit: { windowMs: 60_000, limit: 2 } });
      const query = { client_id: 'no-such-client', redirect_uri: EVIL_REDIRECT, response_type: 'code' };
      const ip = '198.51.100.7';

      expect((await dispatchAuthorize(limited, query, ip)).statusCode).toBe(400);
      expect((await dispatchAuthorize(limited, query, ip)).statusCode).toBe(400);
      const third = await dispatchAuthorize(limited, query, ip);
      expect(third.statusCode).toBe(429);
      expect(third.redirectedTo).toBeUndefined();

      // A different client IP is not affected.
      expect((await dispatchAuthorize(limited, query, '198.51.100.8')).statusCode).toBe(400);
    });
  });
});
