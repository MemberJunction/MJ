import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WidgetAuthAdapter, INVITE_TOKEN_PREFIX, SESSION_EXPIRED_MESSAGE, DescribeRedeemFailure, type HttpPostPort } from '../lib/auth/widget-auth.adapter';
import { FakeAuthProvider, makeJwt } from './widget-test-kit';

const NOW = 1_800_000_000_000; // a fixed "now" (ms)
const FRESH = makeJwt(NOW / 1000 + 3600);
const EXPIRED = makeJwt(NOW / 1000 - 10);

function build(options: { provider?: FakeAuthProvider; post?: HttpPostPort; refresh?: (() => Promise<string>) | null; apiUrl?: string | null } = {}) {
  const provider = options.provider ?? new FakeAuthProvider();
  const posts: Array<{ url: string; body: Readonly<Record<string, string>> }> = [];
  const post: HttpPostPort =
    options.post ??
    (async (url, body) => {
      posts.push({ url, body });
      return { ok: true, json: { success: true, token: FRESH } };
    });
  const adapter = new WidgetAuthAdapter({ apiUrl: options.apiUrl === undefined ? 'https://api.example.com/' : options.apiUrl, provider, post, refresh: options.refresh ?? null, now: () => NOW });
  return { adapter, provider, posts };
}

describe('WidgetAuthAdapter.Hold', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('holds a session JWT directly, handing back exactly what it holds', async () => {
    const { adapter, provider } = build();
    expect(await adapter.Hold(FRESH)).toEqual({ held: true, jwt: FRESH });
    expect(provider.Held).toEqual([FRESH]);
  });

  it('redeems an invite for a session JWT, and returns THE REDEEMED TOKEN — never the single-use invite', async () => {
    const { adapter, provider, posts } = build();
    const invite = `${INVITE_TOKEN_PREFIX}abc123`;
    const result = await adapter.Hold(invite);
    expect(result).toEqual({ held: true, jwt: FRESH });
    expect(posts).toEqual([{ url: 'https://api.example.com/magic-link/redeem?format=json', body: { token: invite } }]); // trailing slash normalised
    expect(provider.Held).toEqual([FRESH]);
    expect(provider.Held).not.toContain(invite);
  });

  it('NEVER CLOBBERS: with a principal already held it does nothing — and does not burn a single-use invite', async () => {
    const provider = new FakeAuthProvider();
    provider.Configured = true;
    const { adapter, posts } = build({ provider });
    expect(await adapter.Hold(`${INVITE_TOKEN_PREFIX}abc`)).toEqual({ held: true, jwt: null });
    expect(posts).toHaveLength(0);
    expect(provider.Held).toHaveLength(0);
  });

  it('refuses to redeem without an api-url, rather than posting the invite to a relative URL on the embedding page', async () => {
    const { adapter, posts } = build({ apiUrl: null });
    const result = await adapter.Hold(`${INVITE_TOKEN_PREFIX}abc`);
    expect(result).toMatchObject({ held: false, failure: { code: 'no-api-url' } });
    expect(posts).toHaveLength(0);
  });

  it('reports a redemption the server refused, with words for that reason', async () => {
    const post: HttpPostPort = async () => ({ ok: false, json: { success: false, errorCode: 'consumed' } });
    const { adapter } = build({ post });
    const result = await adapter.Hold(`${INVITE_TOKEN_PREFIX}abc`);
    expect(result).toMatchObject({ held: false, failure: { code: 'redeem-failed' } });
    expect(result.held === false && result.failure.message).toContain('already been used');
  });

  it('survives a response that is not JSON-shaped, and a network failure', async () => {
    const garbled = build({ post: async () => ({ ok: true, json: 'nope' }) });
    expect(await garbled.adapter.Hold(`${INVITE_TOKEN_PREFIX}x`)).toMatchObject({ held: false });
    const offline = build({
      post: async () => {
        throw new Error('network down');
      }
    });
    const result = await offline.adapter.Hold(`${INVITE_TOKEN_PREFIX}x`);
    expect(result).toMatchObject({ held: false, failure: { code: 'redeem-failed' } });
    expect(result.held === false && result.failure.message).toContain('could not reach the server');
  });

  it('reports a provider that refused the credential', async () => {
    const provider = new FakeAuthProvider();
    provider.Accept = false;
    const { adapter } = build({ provider });
    expect(await adapter.Hold(FRESH)).toMatchObject({ held: false, failure: { code: 'provider-rejected' } });
    expect(adapter.HasPrincipal()).toBe(false);
  });
});

describe('WidgetAuthAdapter expiry and renewal', () => {
  it('has a principal while the held JWT is unexpired, and not after it expires', async () => {
    let now = NOW;
    const provider = new FakeAuthProvider();
    const adapter = new WidgetAuthAdapter({ apiUrl: 'https://a', provider, post: async () => ({ ok: true, json: null }), now: () => now });
    await adapter.Hold(makeJwt(NOW / 1000 + 60));
    expect(adapter.HasPrincipal()).toBe(true);
    now = NOW + 61_000;
    expect(adapter.HasPrincipal()).toBe(false);
  });

  it('treats an unreadable token as NOT expired — expiry is the server\'s call, not a client-side dead end', async () => {
    const { adapter } = build();
    await adapter.Hold('opaque-token-without-dots');
    expect(adapter.HasPrincipal()).toBe(true);
    expect(adapter.ReadExpiry('opaque-token-without-dots')).toBeNull();
    expect(adapter.ReadExpiry(makeJwt(null))).toBeNull();
  });

  it('reads the expiry of a JWT whose payload has non-ASCII text (UTF-8 safe)', () => {
    const { adapter } = build();
    expect(adapter.ReadExpiry(makeJwt(1_900_000_000, { name: 'Zoë 李' }))).toBe(1_900_000_000_000);
  });

  it('gives the provider a renewer: the supplied one when the credential can be renewed, else an honest rejection', async () => {
    const renewable = build({ refresh: async () => 'next-token' });
    await renewable.adapter.Hold(FRESH);
    expect(await renewable.provider.Refreshers[0]()).toBe('next-token');

    const spent = build({ refresh: null });
    await spent.adapter.Hold(FRESH);
    await expect(spent.provider.Refreshers[0]()).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('holds the renewed token as the principal', async () => {
    let now = NOW;
    const provider = new FakeAuthProvider();
    const renewed = makeJwt(NOW / 1000 + 7200);
    const adapter = new WidgetAuthAdapter({ apiUrl: 'https://a', provider, post: async () => ({ ok: true, json: null }), refresh: async () => renewed, now: () => now });
    await adapter.Hold(makeJwt(NOW / 1000 + 10));
    now = NOW + 20_000;
    expect(adapter.HasPrincipal()).toBe(false);
    await provider.Refreshers[0]();
    expect(adapter.HasPrincipal()).toBe(true);
  });

  it('falls back to the provider\'s own answer when it holds no JWT (an authenticated host page)', () => {
    const provider = new FakeAuthProvider();
    const { adapter } = build({ provider });
    expect(adapter.HasPrincipal()).toBe(false);
    provider.Configured = true;
    expect(adapter.HasPrincipal()).toBe(true);
  });
});

describe('DescribeRedeemFailure', () => {
  it('says something actionable for every code the server sends, and a default for the rest', () => {
    for (const code of ['expired', 'consumed', 'revoked', 'not_found', 'invalid', 'provisioning_failed', 'server_error', undefined]) {
      expect(DescribeRedeemFailure(code).length).toBeGreaterThan(10);
    }
    expect(DescribeRedeemFailure('expired')).toContain('expired');
    expect(DescribeRedeemFailure('bogus')).toBe(DescribeRedeemFailure(undefined));
  });
});
