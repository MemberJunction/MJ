import { describe, it, expect } from 'vitest';
import { WidgetKeyClient, WidgetKeyError, DescribeMintFailure, type FetchLike } from '../lib/auth/widget-key-client';

interface Call {
  url: string;
  body: unknown;
}

function client(answer: { ok?: boolean; status?: number; json?: unknown | (() => Promise<unknown>); throws?: Error }) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(init?.body ?? 'null') });
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
  it('mints through the existing /widget/session endpoint, sending only the key', async () => {
    const { api, calls } = client({ json: GOOD });
    await api.Mint();
    expect(calls).toEqual([{ url: 'https://api.example.com/widget/session', body: { widgetKey: 'pk_live_abc' } }]);
  });

  it('refreshes through /widget/session/refresh', async () => {
    const { api, calls } = client({ json: GOOD });
    await api.Refresh();
    expect(calls[0].url).toBe('https://api.example.com/widget/session/refresh');
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
