/**
 * Tests for how /oauth/authorize reports errors.
 *
 * The rule under test is RFC 6749 section 4.1.2.1 / the OAuth 2.0 Security BCP: an error may only
 * be reported by redirecting to a redirect_uri once that redirect_uri is known to belong to a known
 * client. Before that point the server has no basis for trusting the URI, so the error has to be
 * rendered locally. After that point the error redirect is the correct, spec-mandated behavior and
 * must not regress into an error page.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// ScopeService reaches into @memberjunction/server (and from there into database config) at import
// time. The authorize endpoint never touches it, so stub it out rather than booting a server config.
vi.mock('../auth/ScopeService.js', () => ({
  loadActiveScopes: async () => [],
  getDefaultScopes: async () => ['openid'],
}));

const REGISTERED_REDIRECT = 'http://localhost:9999/callback';
const UNREGISTERED_REDIRECT = 'https://unregistered.example.com/callback';
const CODE_CHALLENGE = 'x'.repeat(43);

let server: Server;
let baseUrl: string;
let registeredClientId: string;

beforeAll(async () => {
  const { default: express } = await import('express');
  const { createOAuthProxyRouter } = await import('../auth/OAuthProxyRouter');

  const app = express();
  app.use(express.json());
  app.use(
    createOAuthProxyRouter({
      baseUrl: 'http://127.0.0.1',
      upstream: {
        authorizationEndpoint: 'https://upstream.example.com/oauth2/authorize',
        tokenEndpoint: 'https://upstream.example.com/oauth2/token',
        clientId: 'upstream-client',
        scopes: ['openid', 'profile', 'email'],
        providerName: 'test',
      },
      enableDynamicRegistration: true,
    }),
  );

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const registration = await fetch(`${baseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REGISTERED_REDIRECT], client_name: 'test-client' }),
  });
  registeredClientId = ((await registration.json()) as { client_id: string }).client_id;
  expect(registeredClientId).toBeTruthy();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Issues an authorize request without following redirects. */
async function authorize(params: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/oauth/authorize?${new URLSearchParams(params)}`, { redirect: 'manual' });
}

describe('GET /oauth/authorize - errors BEFORE the redirect_uri is validated', () => {
  it('renders an error page for an unknown client_id instead of redirecting to the supplied URI', async () => {
    const res = await authorize({
      client_id: 'mcp_no_such_client',
      redirect_uri: UNREGISTERED_REDIRECT,
      response_type: 'code',
      state: 'caller-state',
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    await expect(res.text()).resolves.toContain('Unknown client_id');
  });

  it('renders an error page when the redirect_uri is not registered for the client', async () => {
    const res = await authorize({
      client_id: registeredClientId,
      redirect_uri: UNREGISTERED_REDIRECT,
      response_type: 'code',
      state: 'caller-state',
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    await expect(res.text()).resolves.toContain('not registered');
  });

  it('validates the redirect_uri before the response_type, so a bad response_type cannot redirect either', async () => {
    const res = await authorize({
      client_id: registeredClientId,
      redirect_uri: UNREGISTERED_REDIRECT,
      response_type: 'token',
      state: 'caller-state',
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  it('renders an error page when client_id is missing entirely', async () => {
    const res = await authorize({ redirect_uri: UNREGISTERED_REDIRECT, response_type: 'code' });

    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  it('renders an error page when redirect_uri is missing entirely', async () => {
    const res = await authorize({ client_id: registeredClientId, response_type: 'code' });

    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('GET /oauth/authorize - errors AFTER the redirect_uri is validated (unchanged)', () => {
  it('redirects a missing PKCE challenge back to the registered redirect_uri, with state', async () => {
    const res = await authorize({
      client_id: registeredClientId,
      redirect_uri: REGISTERED_REDIRECT,
      response_type: 'code',
      state: 'caller-state',
    });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(REGISTERED_REDIRECT);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('error_description')).toContain('code_challenge');
    expect(location.searchParams.get('state')).toBe('caller-state');
  });

  it('redirects an unsupported response_type back to the registered redirect_uri', async () => {
    const res = await authorize({
      client_id: registeredClientId,
      redirect_uri: REGISTERED_REDIRECT,
      response_type: 'token',
      state: 'caller-state',
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
    });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(REGISTERED_REDIRECT);
    expect(location.searchParams.get('error')).toBe('unsupported_response_type');
  });

  it('redirects an unsupported code_challenge_method back to the registered redirect_uri', async () => {
    const res = await authorize({
      client_id: registeredClientId,
      redirect_uri: REGISTERED_REDIRECT,
      response_type: 'code',
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'plain',
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(REGISTERED_REDIRECT);
  });
});

describe('GET /oauth/authorize - a fully valid request still reaches the upstream provider', () => {
  it('redirects to the configured upstream authorization endpoint', async () => {
    const res = await authorize({
      client_id: registeredClientId,
      redirect_uri: REGISTERED_REDIRECT,
      response_type: 'code',
      state: 'caller-state',
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('https://upstream.example.com/oauth2/authorize');
  });
});
