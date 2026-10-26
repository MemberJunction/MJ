import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComputeJwkThumbprint, ToProofPublicJwk, VerifyProofOfPossessionJwt } from '@memberjunction/global';
import { WidgetKeyClient, WidgetKeyError, DescribeMintFailure, type FetchLike } from '../lib/auth/widget-key-client';

interface Call {
  url: string;
  headers?: Record<string, string>;
  body: unknown;
}

function client(answer: { ok?: boolean; status?: number; json?: unknown | (() => Promise<unknown>); throws?: Error }) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers, body: JSON.parse(init?.body ?? 'null') });
    if (answer.throws) {
      throw answer.throws;
    }
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      json: typeof answer.json === 'function' ? (answer.json as () => Promise<unknown>) : async () => answer.json
    };
  };
  return { api: new WidgetKeyClient('https://api.example.com//', 'pk_live_abc', fetchImpl), calls };
}

const GOOD = {
  success: true,
  token: 'jwt.jwt.jwt',
  expiresAt: '2030-01-01T00:00:00Z',
  widgetId: 'w1',
  applicationId: 'app1',
  pinnedAgentId: 'agent1',
  modality: 'Both',
  voiceMaxSessionMinutes: 10,
  enabledChannels: ['IdentityVerification', 7]
};

describe('WidgetKeyClient', () => {
  it('mints through the existing /widget/session endpoint, sending only the key and no Authorization header', async () => {
    const { api, calls } = client({ json: GOOD });
    await api.Mint();
    expect(calls).toEqual([
      {
        url: 'https://api.example.com/widget/session',
        headers: { 'content-type': 'application/json' },
        body: { widgetKey: 'pk_live_abc', proofKey: expect.any(Object) }
      }
    ]);
  });

  it('refreshes through /widget/session/refresh with Authorization: Bearer <currentToken> and a proof', async () => {
    const { api, calls } = client({ json: GOOD });
    await api.Mint();
    await api.Refresh('current.guest.jwt');
    expect(calls[1]).toEqual({
      url: 'https://api.example.com/widget/session/refresh',
      headers: { 'content-type': 'application/json', authorization: 'Bearer current.guest.jwt', dpop: expect.any(String) },
      body: { widgetKey: 'pk_live_abc' }
    });
  });

  it('registers a public P-256 key at mint and signs each refresh with it, for this URL and token (#4931)', async () => {
    const { api, calls } = client({ json: GOOD });
    await api.Mint();
    await api.Refresh('current.guest.jwt');
    const registered = ToProofPublicJwk((calls[0].body as { proofKey: unknown }).proofKey);
    expect(registered).toEqual((calls[0].body as { proofKey: unknown }).proofKey);
    const result = await VerifyProofOfPossessionJwt(calls[1].headers!['dpop'], {
      Method: 'POST',
      PathSuffix: '/widget/session/refresh',
      AccessToken: 'current.guest.jwt',
      NowSeconds: Math.floor(Date.now() / 1000),
      MaxSkewSeconds: 60
    });
    expect(result).toEqual({ Valid: true, Thumbprint: await ComputeJwkThumbprint(registered!) });
  });

  it('refuses to refresh before a mint, since it holds no key to prove with (#4931)', async () => {
    const { api, calls } = client({ json: GOOD });
    await expect(api.Refresh('current.guest.jwt')).rejects.toThrow(/mint/i);
    expect(calls).toHaveLength(0);
  });

  it('returns what the SERVER decided: the pinned agent, the application, the voice ceiling, the enabled channels', async () => {
    const { api } = client({ json: GOOD });
    expect(await api.Mint()).toEqual({
      token: 'jwt.jwt.jwt',
      expiresAtMs: Date.parse('2030-01-01T00:00:00Z'),
      widgetId: 'w1',
      applicationId: 'app1',
      pinnedAgentId: 'agent1',
      modality: 'Both',
      voiceMaxSessionMinutes: 10,
      enabledChannels: ['IdentityVerification']
    });
  });

  it('defaults a missing expiry to 15 minutes, a missing modality to Text and a non-positive ceiling to none', async () => {
    const { api } = client({ json: { ...GOOD, expiresAt: undefined, modality: undefined, voiceMaxSessionMinutes: 0, enabledChannels: undefined } });
    const before = Date.now();
    const session = await api.Mint();
    expect(session.expiresAtMs).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(session).toMatchObject({ modality: 'Text', voiceMaxSessionMinutes: null, enabledChannels: [] });
  });

  it('turns every client-side rejection into one uniform, non-enumerating message (the server answers them uniformly so keys cannot be probed)', async () => {
    for (const errorCode of ['not_found', 'disabled', 'origin_not_allowed', 'modality_not_enabled']) {
      const { api } = client({ ok: false, status: 403, json: { success: false, errorCode } });
      const error = await api.Mint().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WidgetKeyError);
      expect((error as WidgetKeyError).message).toBe('This widget is not available here. If you think that is a mistake, please contact the site owner.');
      expect((error as WidgetKeyError).code).toBe(errorCode);
      expect((error as WidgetKeyError).status).toBe(403);
    }
  });

  it('distinguishes being rate limited and a server fault', async () => {
    expect(DescribeMintFailure('rate_limited', 429)).toContain('wait');
    expect(DescribeMintFailure(null, 429)).toContain('wait');
    expect(DescribeMintFailure('server_error', 500)).toContain('server');
    expect(DescribeMintFailure(null, 502)).toContain('server');
  });

  it('rejects an incomplete success response rather than half-starting a session', async () => {
    const { api } = client({ json: { ...GOOD, pinnedAgentId: undefined } });
    await expect(api.Mint()).rejects.toMatchObject({ code: 'incomplete_session' });
  });

  it('rejects a success flag with no token', async () => {
    const { api } = client({ json: { success: true } });
    await expect(api.Mint()).rejects.toBeInstanceOf(WidgetKeyError);
  });

  it('reports a network failure and a non-JSON body, never an unhandled error', async () => {
    const offline = client({ throws: new Error('offline') });
    await expect(offline.api.Mint()).rejects.toMatchObject({ code: 'network', status: null });
    const html = client({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    await expect(html.api.Mint()).rejects.toMatchObject({ status: 502 });
  });
});

describe('WidgetKeyClient on a device whose clock is off (#4931 review)', () => {
  const SERVER_NOW_MS = Date.UTC(2030, 0, 1, 12, 0, 0);
  const SERVER_NOW_SECONDS = SERVER_NOW_MS / 1000;
  const TTL_SECONDS = 900;
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const serverToken = `${part({ alg: 'none' })}.${part({ iat: SERVER_NOW_SECONDS, exp: SERVER_NOW_SECONDS + TTL_SECONDS })}.sig`;

  /** A fake MJAPI on SERVER_NOW_MS that checks a refresh proof the way WidgetSessionService does (±60 s). */
  function skewedServer() {
    const proofs: string[] = [];
    const urls: string[] = [];
    const body = { ...GOOD, token: serverToken, expiresAt: new Date((SERVER_NOW_SECONDS + TTL_SECONDS) * 1000).toISOString() };
    const fetchImpl: FetchLike = async (url, init) => {
      urls.push(url);
      if (url.endsWith('/refresh')) {
        const proof = init?.headers['dpop'] ?? '';
        proofs.push(proof);
        const check = await VerifyProofOfPossessionJwt(proof, {
          Method: 'POST',
          PathSuffix: '/widget/session/refresh',
          AccessToken: serverToken,
          NowSeconds: SERVER_NOW_SECONDS,
          MaxSkewSeconds: 60
        });
        if (!check.Valid) {
          return { ok: false, status: 403, json: async () => ({ success: false, errorCode: check.Reason }) };
        }
      }
      return { ok: true, status: 200, json: async () => body };
    };
    return { api: new WidgetKeyClient('https://api.example.com', 'pk_live_abc', fetchImpl), proofs, urls };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([0, -90, 90, 1200])('signs the refresh proof on server time and reports expiry on this clock (skew %i s)', async (skewSeconds) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SERVER_NOW_MS + skewSeconds * 1000);
    const { api, proofs, urls } = skewedServer();

    const minted = await api.Mint();
    expect(minted.expiresAtMs - Date.now()).toBe(TTL_SECONDS * 1000);

    const refreshed = await api.Refresh(minted.token);
    const iat = (JSON.parse(Buffer.from(proofs[0].split('.')[1], 'base64url').toString('utf8')) as { iat: number }).iat;
    expect(Math.abs(iat - SERVER_NOW_SECONDS)).toBeLessThanOrEqual(1);
    expect(refreshed.expiresAtMs - Date.now()).toBe(TTL_SECONDS * 1000);
    expect(urls).toEqual(['https://api.example.com/widget/session', 'https://api.example.com/widget/session/refresh']);
  });
});
