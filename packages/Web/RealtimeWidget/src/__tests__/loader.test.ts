import { describe, it, expect, beforeEach } from 'vitest';
import { MountWidget, BootstrapFromDocument } from '../loader.js';
import { WidgetSessionClient, type FetchLike } from '../session/widget-session-client.js';
import { MockWidgetTransport } from '../transport/mock-widget-transport.js';
import { WIDGET_TAG_NAME } from '../ui/support-widget-element.js';
import { ReadVisitorKey } from '../session/visitor-key-cookie.js';

const sessionBody = {
    success: true,
    token: 'jwt',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    widgetId: 'W1',
    applicationId: 'APP1',
    pinnedAgentId: 'AGENT1',
    modality: 'Text',
};

const fakeFetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => sessionBody });

function deps(transport: MockWidgetTransport, scheduled: Array<{ delay: number }>) {
    return {
        sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, fakeFetch),
        transportFactory: () => transport,
        scheduler: (_cb: () => void, delayMs: number) => {
            scheduled.push({ delay: delayMs });
        },
    };
}

describe('mountWidget', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('mints a session, initializes the transport, and mounts the element into the target', async () => {
        const transport = new MockWidgetTransport();
        const scheduled: Array<{ delay: number }> = [];
        const target = document.createElement('div');
        document.body.appendChild(target);

        const el = await MountWidget({ widgetKey: 'pk', apiUrl: 'https://api.test', mountTarget: target }, deps(transport, scheduled));

        expect(el.tagName.toLowerCase()).toBe(WIDGET_TAG_NAME);
        expect(target.querySelector(WIDGET_TAG_NAME)).toBe(el);
        // refresh was scheduled (~9 min for a 10-min session minus 60s lead)
        expect(scheduled.length).toBe(1);
        expect(scheduled[0].delay).toBeGreaterThan(0);
    });

    it('passes the current session token as Authorization: Bearer when the refresh timer fires', async () => {
        const transport = new MockWidgetTransport();
        const callbacks: Array<() => void> = [];
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const recordingFetch: FetchLike = async (url, init) => {
            calls.push({ url, init });
            return { ok: true, status: 200, json: async () => sessionBody };
        };
        await MountWidget(
            { widgetKey: 'pk', apiUrl: 'https://api.test' },
            {
                sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, recordingFetch),
                transportFactory: () => transport,
                scheduler: (cb: () => void) => callbacks.push(cb),
            },
        );
        expect(callbacks).toHaveLength(1);
        callbacks[0]();
        await new Promise((r) => setTimeout(r, 0));
        expect(calls).toHaveLength(2);
        expect(calls[1].url).toBe('https://api.test/widget/session/refresh');
        expect((calls[1].init?.headers as Record<string, string>).authorization).toBe('Bearer jwt');
    });

    it('retries refresh with the current session token when the visitor clicks Retry after a failed refresh', async () => {
        const transport = new MockWidgetTransport();
        const callbacks: Array<() => void> = [];
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        let refreshAttempt = 0;
        const recordingFetch: FetchLike = async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/refresh')) {
                refreshAttempt++;
                if (refreshAttempt === 1) {
                    return { ok: false, status: 503, json: async () => ({ success: false }) };
                }
                return { ok: true, status: 200, json: async () => ({ ...sessionBody, token: 'jwt-refreshed' }) };
            }
            return { ok: true, status: 200, json: async () => sessionBody };
        };
        const el = await MountWidget(
            { widgetKey: 'pk', apiUrl: 'https://api.test' },
            {
                sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, recordingFetch),
                transportFactory: () => transport,
                scheduler: (cb: () => void) => callbacks.push(cb),
            },
        );
        // First scheduled refresh fails -> shows connection-lost banner
        callbacks[0]();
        await new Promise((r) => setTimeout(r, 0));
        expect(el.ShadowRootRef.querySelector('.mj-widget-banner')?.hasAttribute('hidden')).toBe(false);

        // Visitor triggers Retry -> re-schedules and succeeds with the same Bearer token within the grace window
        el.RetryConnection();
        expect(callbacks).toHaveLength(2);
        callbacks[1]();
        await new Promise((r) => setTimeout(r, 0));
        expect(calls).toHaveLength(3);
        expect(calls[2].url).toBe('https://api.test/widget/session/refresh');
        expect((calls[2].init?.headers as Record<string, string>).authorization).toBe('Bearer jwt');
        // Refresh timer re-armed with the refreshed session token ('jwt-refreshed')
        expect(callbacks).toHaveLength(3);
        callbacks[2]();
        await new Promise((r) => setTimeout(r, 0));
        expect((calls[3].init?.headers as Record<string, string>).authorization).toBe('Bearer jwt-refreshed');
    });

    it('falls back to <body> when no mount target is given', async () => {
        const el = await MountWidget({ widgetKey: 'pk', apiUrl: 'https://api.test' }, deps(new MockWidgetTransport(), []));
        expect(el.parentElement).toBe(document.body);
    });
});

describe('mountWidget — returning-visitor cookie (RV1, gated)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        for (const part of document.cookie.split(';')) {
            const name = part.split('=')[0]?.trim();
            if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
        }
    });

    /** A loader deps bundle whose session client uses a fetch returning the given body. */
    function depsWithBody(body: unknown) {
        const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => body });
        return {
            sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, fetchImpl),
            transportFactory: () => new MockWidgetTransport(),
            scheduler: () => {},
        };
    }

    it('writes the durable cookie when remembering is on and a key is returned', async () => {
        await MountWidget(
            { widgetKey: 'pk_remember', apiUrl: 'https://api.test' },
            depsWithBody({ ...sessionBody, rememberReturningVisitors: true, visitorKey: 'vk_persist_me' }),
        );
        expect(ReadVisitorKey('pk_remember')).toBe('vk_persist_me');
    });

    it('writes NO cookie when remembering is off (default)', async () => {
        await MountWidget({ widgetKey: 'pk_off', apiUrl: 'https://api.test' }, depsWithBody(sessionBody));
        expect(ReadVisitorKey('pk_off')).toBeUndefined();
    });
});

describe('bootstrapFromDocument', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('returns null when no [data-widget-key] element is present', async () => {
        const result = await BootstrapFromDocument(document);
        expect(result).toBeNull();
    });
});
