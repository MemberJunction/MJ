import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComputeJwkThumbprint, ToProofPublicJwk, VerifyProofOfPossessionJwt } from '@memberjunction/global';
import { WidgetSessionClient, type FetchLike } from '../session/widget-session-client.js';
import type { WidgetSession } from '../types.js';
import { CreateSkewedServer, ProofIat, SERVER_NOW_MS, TOKEN_TTL_SECONDS } from './support/skewed-server.js';

/** Builds a FetchLike that returns a canned response + records the calls. */
function fakeFetch(status: number, body: unknown): { fn: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fn: FetchLike = async (url, init) => {
        calls.push({ url, init });
        return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
    return { fn, calls };
}

const goodBody = {
    success: true,
    token: 'jwt.token.here',
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    widgetId: 'W1',
    applicationId: 'APP1',
    pinnedAgentId: 'AGENT1',
    modality: 'Both',
    sessionId: 'sess-abc',
    voiceMaxSessionMinutes: 5,
};

describe('WidgetSessionClient.Mint', () => {
    it('POSTs the widget key to /widget/session and maps the response', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test/', 'pk_test_1', fn);
        const session = await client.Mint();

        expect(calls[0].url).toBe('https://api.test/widget/session');
        expect(calls[0].init?.headers).toEqual({ 'content-type': 'application/json' });
        expect(JSON.parse(calls[0].init?.body as string)).toEqual({ widgetKey: 'pk_test_1', proofKey: expect.any(Object) });
        expect(session.token).toBe('jwt.token.here');
        expect(session.pinnedAgentId).toBe('AGENT1');
        expect(session.modality).toBe('Both');
        // The per-session id + voice ceiling flow through for RLS isolation + the voice-abuse guard.
        expect(session.sessionId).toBe('sess-abc');
        expect(session.voiceMaxSessionMinutes).toBe(5);
    });

    it('throws on a non-2xx response', async () => {
        const { fn } = fakeFetch(403, { success: false, errorCode: 'origin_not_allowed' });
        const client = new WidgetSessionClient('https://api.test', 'pk_bad', fn);
        await expect(client.Mint()).rejects.toThrow(/origin_not_allowed/);
    });

    it('throws when required fields are missing', async () => {
        const { fn } = fakeFetch(200, { success: true, token: 'x' });
        const client = new WidgetSessionClient('https://api.test', 'pk', fn);
        await expect(client.Mint()).rejects.toThrow(/missing required fields/i);
    });
});

describe('WidgetSessionClient.Mint (returning-visitor, RV1/RV2/RV4)', () => {
    it('sends the presented visitorKey and maps the returning-visitor + resolved-identity fields', async () => {
        const { fn, calls } = fakeFetch(200, {
            ...goodBody,
            rememberReturningVisitors: true,
            visitorKey: 'vk_abc123',
            lastConversationId: 'conv-prior',
            linkedEntityId: 'ent-users',
            linkedRecordId: 'rec-42',
        });
        const client = new WidgetSessionClient('https://api.test', 'pk_test_1', fn);
        const session = await client.Mint('vk_abc123');

        expect(JSON.parse(calls[0].init?.body as string)).toEqual({ widgetKey: 'pk_test_1', visitorKey: 'vk_abc123', proofKey: expect.any(Object) });
        expect(session.rememberReturningVisitors).toBe(true);
        expect(session.visitorKey).toBe('vk_abc123');
        expect(session.lastConversationId).toBe('conv-prior');
        expect(session.linkedEntityId).toBe('ent-users');
        expect(session.linkedRecordId).toBe('rec-42');
    });

    it('defaults rememberReturningVisitors to false when the server omits it', async () => {
        const { fn } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test', 'pk', fn);
        const session = await client.Mint();
        expect(session.rememberReturningVisitors).toBe(false);
        expect(session.visitorKey).toBeUndefined();
    });
});

describe('WidgetSessionClient.Forget (RV5)', () => {
    it('POSTs widgetKey + visitorKey to /widget/forget and reports success', async () => {
        const { fn, calls } = fakeFetch(200, { success: true, notesArchived: 3 });
        const client = new WidgetSessionClient('https://api.test/', 'pk_test_1', fn);

        const result = await client.Forget('vk_abc123');

        expect(calls[0].url).toBe('https://api.test/widget/forget');
        expect(JSON.parse(calls[0].init?.body as string)).toEqual({ widgetKey: 'pk_test_1', visitorKey: 'vk_abc123' });
        expect(result).toEqual({ success: true, notesArchived: 3 });
    });

    it('returns a failure result (never throws) when forget is rejected', async () => {
        const { fn } = fakeFetch(403, { success: false, errorCode: 'upgrade_not_enabled' });
        const client = new WidgetSessionClient('https://api.test', 'pk', fn);
        const result = await client.Forget('vk');
        expect(result.success).toBe(false);
        expect(result.error).toBe('upgrade_not_enabled');
    });
});

describe('WidgetSessionClient.ResolveIdentity (RV4)', () => {
    it('POSTs with the verified Bearer token + visitorKey and reports the merge', async () => {
        const { fn, calls } = fakeFetch(200, { success: true, mergedConversations: 2 });
        const client = new WidgetSessionClient('https://api.test', 'pk_test_1', fn);

        const result = await client.ResolveIdentity('verified.jwt', 'vk_abc123');

        expect(calls[0].url).toBe('https://api.test/widget/resolve-identity');
        expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer verified.jwt');
        expect(JSON.parse(calls[0].init?.body as string)).toEqual({ widgetKey: 'pk_test_1', visitorKey: 'vk_abc123' });
        expect(result).toEqual({ success: true, mergedConversations: 2 });
    });
});

describe('WidgetSessionClient.Refresh', () => {
    it('hits the refresh endpoint with Authorization: Bearer <currentToken>', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test', 'pk_test_1', fn);
        await client.Mint();
        await client.Refresh('current.guest.jwt', 'vk_abc123');
        expect(calls[1].url).toBe('https://api.test/widget/session/refresh');
        expect(calls[1].init?.headers).toEqual({
            'content-type': 'application/json',
            authorization: 'Bearer current.guest.jwt',
            dpop: expect.any(String),
        });
        expect(JSON.parse(calls[1].init?.body as string)).toEqual({
            widgetKey: 'pk_test_1',
            visitorKey: 'vk_abc123',
        });
    });
});

describe('WidgetSessionClient proof of possession (#4931)', () => {
    it('registers a public P-256 key at mint (never the private part)', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        await new WidgetSessionClient('https://api.test', 'pk_test_1', fn).Mint();
        const sent = (JSON.parse(calls[0].init?.body as string) as { proofKey: unknown }).proofKey;
        expect(ToProofPublicJwk(sent)).toEqual(sent);
    });

    it('signs each refresh with the key registered at mint, for this URL and this token', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test/base/', 'pk_test_1', fn);
        await client.Mint();
        await client.Refresh('current.guest.jwt');
        const registered = ToProofPublicJwk((JSON.parse(calls[0].init?.body as string) as { proofKey: unknown }).proofKey)!;
        const proof = (calls[1].init?.headers as Record<string, string>).dpop;
        const result = await VerifyProofOfPossessionJwt(proof, {
            Method: 'POST',
            PathSuffix: '/base/widget/session/refresh',
            AccessToken: 'current.guest.jwt',
            NowSeconds: Math.floor(Date.now() / 1000),
            MaxSkewSeconds: 60,
        });
        expect(result).toEqual({ Valid: true, Thumbprint: await ComputeJwkThumbprint(registered) });
    });

    it('registers a new key on each mint', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test', 'pk_test_1', fn);
        await client.Mint();
        await client.Mint();
        const keyOf = (i: number) => (JSON.parse(calls[i].init?.body as string) as { proofKey: { x: string } }).proofKey.x;
        expect(keyOf(0)).not.toBe(keyOf(1));
    });

    it('refuses to refresh before a mint, since it holds no key to prove with', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        await expect(new WidgetSessionClient('https://api.test', 'pk_test_1', fn).Refresh('current.guest.jwt')).rejects.toThrow(/mint/i);
        expect(calls).toHaveLength(0);
    });
});

describe('WidgetSessionClient.RequestUpgrade', () => {
    it('POSTs widgetKey + email to /widget/upgrade and reports success', async () => {
        const { fn, calls } = fakeFetch(200, { success: true, emailSent: true });
        const client = new WidgetSessionClient('https://api.test/', 'pk_test_1', fn);

        const result = await client.RequestUpgrade('user@example.com');

        expect(calls[0].url).toBe('https://api.test/widget/upgrade');
        expect(JSON.parse(calls[0].init?.body as string)).toEqual({ widgetKey: 'pk_test_1', email: 'user@example.com' });
        expect(result).toEqual({ success: true, emailSent: true });
    });

    it('returns a failure result (never throws) on a rejected upgrade', async () => {
        const { fn } = fakeFetch(403, { success: false, errorCode: 'upgrade_not_enabled' });
        const client = new WidgetSessionClient('https://api.test', 'pk', fn);
        const result = await client.RequestUpgrade('user@example.com');
        expect(result.success).toBe(false);
        expect(result.error).toBe('upgrade_not_enabled');
    });
});

describe('WidgetSessionClient.MsUntilRefresh', () => {
    it('refreshes ~60s before expiry and never returns negative', () => {
        const session: WidgetSession = {
            token: 't',
            expiresAtMs: 1_000_000,
            widgetId: 'W',
            applicationId: 'A',
            pinnedAgentId: 'AG',
            modality: 'Text',
            sessionId: 'sess-1',
        };
        expect(WidgetSessionClient.MsUntilRefresh(session, 900_000)).toBe(40_000);
        expect(WidgetSessionClient.MsUntilRefresh(session, 1_000_000)).toBe(5_000);
    });

    it('waits at least 5 s even when the token is already inside the refresh lead (#4931)', () => {
        // A token due at once (a client clock ahead of the server's, or the session's last minutes) must not be
        // refreshed in a tight loop that trips the rate limiter's 429 instead of the server's 403.
        const session = { expiresAtMs: 1_000_000 } as WidgetSession;
        expect(WidgetSessionClient.MsUntilRefresh(session, 990_000)).toBe(5_000);
        expect(WidgetSessionClient.MsUntilRefresh(session, 2_000_000)).toBe(5_000);
    });
});

describe('WidgetSessionClient on a device whose clock is off (#4931 review)', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    // Zero skew is the baseline the skewed cases must match: a 900 s token refreshed 60 s early.
    const BASELINE_DELAY_MS = (TOKEN_TTL_SECONDS - 60) * 1000;

    it.each([0, -90, 90, -1200, 1200])('signs the refresh proof on server time and times the refresh like zero skew (skew %i s)', async (skewSeconds) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(SERVER_NOW_MS + skewSeconds * 1000);
        const server = CreateSkewedServer();
        const client = new WidgetSessionClient('https://api.test', 'pk_test_1', server.Fetch);

        const minted = await client.Mint();
        expect(WidgetSessionClient.MsUntilRefresh(minted, Date.now())).toBe(BASELINE_DELAY_MS);

        const refreshed = await client.Refresh(minted.token);
        expect(Math.abs(ProofIat(server.Proofs[0]) - SERVER_NOW_MS / 1000)).toBeLessThanOrEqual(1);
        expect(refreshed.sessionId).toBe(minted.sessionId);
        expect(WidgetSessionClient.MsUntilRefresh(refreshed, Date.now())).toBe(BASELINE_DELAY_MS);
    });
});
