/**
 * Drives POST /oauth/consent through the real OAuth proxy router to pin that submitted scope
 * values reach the log on a single line (CWE-117 log injection, CodeQL #439/#614 and #176).
 *
 * The router's body parsers read an IncomingMessage stream; the fake request sets `_body`, the
 * flag body-parser uses to skip a body that is already parsed, so `body` is used as given.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Application, Request, Response, Router } from 'express';

// ScopeService reaches @memberjunction/server, whose config loader validates database settings
// at import time. The consent POST handler never consults it.
vi.mock('../auth/ScopeService.js', () => ({
  LoadActiveScopes: async () => [],
    get loadActiveScopes() { return this.LoadActiveScopes; },
  GetDefaultScopes: () => [],
    get getDefaultScopes() { return this.GetDefaultScopes; },
}));

import { CreateOAuthProxyRouter } from '../auth/OAuthProxyRouter.js';
import { GetAuthorizationStateManager } from '../auth/AuthorizationStateManager.js';
import type { OAuthProxyConfig } from '../auth/OAuthProxyTypes.js';
import type { APIScopeInfo } from '../auth/types.js';

const REDIRECT = 'https://client.example.test/callback';
const LINE_BREAKS = /[\r\n\u2028\u2029]/;

const config: OAuthProxyConfig = {
  baseUrl: 'https://mcp.example.test',
  upstream: {
    authorizationEndpoint: 'https://idp.example.test/authorize',
    tokenEndpoint: 'https://idp.example.test/token',
    clientId: 'upstream-client',
    scopes: ['openid'],
  },
  enableDynamicRegistration: false,
  enableConsentScreen: true,
};

function offeredScope(fullPath: string): APIScopeInfo {
  return {
    ID: `id-${fullPath}`,
    Name: fullPath.split(':').pop() ?? fullPath,
    FullPath: fullPath,
    ParentID: null,
    Category: 'Entities',
    Description: fullPath,
    IsActive: true,
  };
}

/** Stores a consent request offering the given scopes and returns its id. */
function createConsentRequest(offered: string[]): string {
  return GetAuthorizationStateManager().CreateConsentRequest({
    user: { email: 'user@example.test', mjUserId: 'user-1' },
    upstreamProvider: 'test-idp',
    upstreamSub: 'sub-1',
    availableScopes: offered.map(offeredScope),
    redirectUri: REDIRECT,
    clientId: 'client-1',
  });
}

/** Posts the consent form through the router and resolves with the redirect target. */
function postConsent(router: Router, body: Record<string, string | string[]>): Promise<string> {
  return new Promise((resolve, reject) => {
    const res: Partial<Response> = {};
    res.status = () => res as Response;
    res.type = () => res as Response;
    res.set = () => res as Response;
    res.setHeader = () => res as Response;
    res.getHeader = () => undefined;
    res.send = (sent: string) => {
      reject(new Error(`expected a redirect, got a page: ${String(sent).slice(0, 200)}`));
      return res as Response;
    };
    res.redirect = ((url: string) => resolve(url)) as Response['redirect'];

    const req = {
      method: 'POST',
      url: '/oauth/consent',
      originalUrl: '/oauth/consent',
      headers: {},
      query: {},
      body,
      _body: true,
      ip: '203.0.113.20',
      app: { get: () => undefined } as Application,
    } as Partial<Request> & { _body: boolean };
    router(req as Request, res as Response, (err?: unknown) => {
      reject(err instanceof Error ? err : new Error('request fell through the router'));
    });
  });
}

describe('OAuth proxy POST /oauth/consent logging', () => {
  let router: Router;

  beforeAll(() => {
    router = CreateOAuthProxyRouter(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs rejected scopes containing line breaks on one line', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const requestId = createConsentRequest(['entity:read']);

    const redirect = await postConsent(router, {
      requestId,
      action: 'approve',
      scopes: ['entity:read', 'evil\r\n[OAuth Proxy] User admin@example.test granted scopes: *', 'x\u2028y'],
    });

    expect(redirect.startsWith(REDIRECT)).toBe(true);
    const line = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('Dropping'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(LINE_BREAKS);
    expect(line).toContain('Dropping 2 submitted scope(s)');
    expect(line).toContain('evil[OAuth Proxy] User admin@example.test granted scopes: *, xy');
  });

  it('logs granted scopes containing line breaks on one line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const offered = 'entity:\nread';
    const requestId = createConsentRequest([offered]);

    await postConsent(router, { requestId, action: 'approve', scopes: offered });

    const line = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes('granted scopes:'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(LINE_BREAKS);
    expect(line).toContain('granted scopes: entity:read');
  });
});
