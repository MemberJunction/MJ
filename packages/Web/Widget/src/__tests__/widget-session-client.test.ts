import { describe, it, expect } from 'vitest';
import { WidgetSessionClient, type FetchLike } from '../session/widget-session-client.js';
import type { WidgetSession } from '../types.js';

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
};

describe('WidgetSessionClient.Mint', () => {
    it('POSTs the widget key to /widget/session and maps the response', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test/', 'pk_test_1', fn);
        const session = await client.Mint();

        expect(calls[0].url).toBe('https://api.test/widget/session');
        expect(JSON.parse(calls[0].init?.body as string)).toEqual({ widgetKey: 'pk_test_1' });
        expect(session.token).toBe('jwt.token.here');
        expect(session.pinnedAgentId).toBe('AGENT1');
        expect(session.modality).toBe('Both');
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

describe('WidgetSessionClient.Refresh', () => {
    it('hits the refresh endpoint', async () => {
        const { fn, calls } = fakeFetch(200, goodBody);
        const client = new WidgetSessionClient('https://api.test', 'pk_test_1', fn);
        await client.Refresh();
        expect(calls[0].url).toBe('https://api.test/widget/session/refresh');
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
        };
        expect(WidgetSessionClient.MsUntilRefresh(session, 900_000)).toBe(40_000);
        expect(WidgetSessionClient.MsUntilRefresh(session, 1_000_000)).toBe(0);
    });
});
