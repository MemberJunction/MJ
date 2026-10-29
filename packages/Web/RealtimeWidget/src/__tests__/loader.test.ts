import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MountWidget, BootstrapFromDocument, StartEmbeddedWidget } from '../loader.js';
import { WidgetSessionClient, type FetchLike } from '../session/widget-session-client.js';
import { MockWidgetTransport } from '../transport/mock-widget-transport.js';
import { WIDGET_TAG_NAME } from '../ui/support-widget-element.js';
import { ReadVisitorKey } from '../session/visitor-key-cookie.js';
import { CreateSkewedServer, ProofIat, SERVER_NOW_MS, TOKEN_TTL_SECONDS } from './support/skewed-server.js';

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
        // The refresh signs a proof with Web Crypto first, so wait for the request rather than one tick.
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(calls[1].url).toBe('https://api.test/widget/session/refresh');
        expect((calls[1].init?.headers as Record<string, string>).authorization).toBe('Bearer jwt');
    });

    describe('when the server refuses a refresh for good (403: past the grace window, the 12 h end, or an old token) (#4931)', () => {
        /** A transport that records each session it is initialized with. */
        class RecordingTransport extends MockWidgetTransport {
            public readonly Sessions: string[] = [];
            public override async Initialize(session: Parameters<MockWidgetTransport['Initialize']>[0]): Promise<void> {
                this.Sessions.push(session.token);
                await super.Initialize(session);
            }
        }

        it('mints a new session, starts the transport on it, tells the visitor, and keeps refreshing the new session', async () => {
            const transport = new RecordingTransport();
            const callbacks: Array<() => void> = [];
            const calls: Array<{ url: string; init?: RequestInit }> = [];
            let mints = 0;
            const recordingFetch: FetchLike = async (url, init) => {
                calls.push({ url, init });
                if (url.endsWith('/refresh')) {
                    return { ok: false, status: 403, json: async () => ({ success: false, errorCode: 'not_found' }) };
                }
                mints++;
                return { ok: true, status: 200, json: async () => ({ ...sessionBody, token: `jwt-${mints}`, sessionId: `sid-${mints}` }) };
            };
            const el = await MountWidget(
                { widgetKey: 'pk', apiUrl: 'https://api.test' },
                {
                    sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, recordingFetch),
                    transportFactory: () => transport,
                    scheduler: (cb: () => void) => callbacks.push(cb),
                },
            );
            callbacks[0]();
            await vi.waitFor(() => expect(transport.Sessions).toEqual(['jwt-1', 'jwt-2']));
            expect(calls.map((c) => c.url)).toEqual([
                'https://api.test/widget/session',
                'https://api.test/widget/session/refresh',
                'https://api.test/widget/session',
            ]);
            expect(el.ShadowRootRef.querySelector('.mj-widget-msg.system')?.textContent).toMatch(/previous chat ended/i);
            expect(el.ShadowRootRef.querySelector('.mj-widget-banner')?.hasAttribute('hidden')).toBe(true);
            // The refresh timer is re-armed on the NEW session.
            await vi.waitFor(() => expect(callbacks).toHaveLength(2));
            callbacks[1]();
            await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(4));
            expect(calls[3].url).toBe('https://api.test/widget/session/refresh');
            expect((calls[3].init?.headers as Record<string, string>).authorization).toBe('Bearer jwt-2');
        });

        it('shows Retry when the new mint fails too, and Retry starts over from the refresh', async () => {
            const transport = new RecordingTransport();
            const callbacks: Array<() => void> = [];
            let mints = 0;
            const recordingFetch: FetchLike = async (url) => {
                if (url.endsWith('/refresh')) {
                    return { ok: false, status: 403, json: async () => ({ success: false, errorCode: 'not_found' }) };
                }
                mints++;
                if (mints === 2) {
                    return { ok: false, status: 503, json: async () => ({ success: false, errorCode: 'server_error' }) };
                }
                return { ok: true, status: 200, json: async () => ({ ...sessionBody, token: `jwt-${mints}` }) };
            };
            const el = await MountWidget(
                { widgetKey: 'pk', apiUrl: 'https://api.test' },
                {
                    sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, recordingFetch),
                    transportFactory: () => transport,
                    scheduler: (cb: () => void) => callbacks.push(cb),
                },
            );
            callbacks[0]();
            await vi.waitFor(() => expect(el.ShadowRootRef.querySelector('.mj-widget-banner')?.hasAttribute('hidden')).toBe(false));
            expect(transport.Sessions).toEqual(['jwt-1']);
            el.RetryConnection();
            callbacks[callbacks.length - 1]();
            await vi.waitFor(() => expect(transport.Sessions).toEqual(['jwt-1', 'jwt-3']));
        });
    });

    it('does not mint a new session when the refresh fails for a temporary reason (network down)', async () => {
        const transport = new MockWidgetTransport();
        const callbacks: Array<() => void> = [];
        const calls: string[] = [];
        const recordingFetch: FetchLike = async (url) => {
            calls.push(url);
            if (url.endsWith('/refresh')) {
                throw new TypeError('Failed to fetch');
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
        callbacks[0]();
        await vi.waitFor(() => expect(el.ShadowRootRef.querySelector('.mj-widget-banner')?.hasAttribute('hidden')).toBe(false));
        expect(calls).toEqual(['https://api.test/widget/session', 'https://api.test/widget/session/refresh']);
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
        await vi.waitFor(() => expect(el.ShadowRootRef.querySelector('.mj-widget-banner')?.hasAttribute('hidden')).toBe(false));

        // Visitor triggers Retry -> re-schedules and succeeds with the same Bearer token within the grace window
        el.RetryConnection();
        expect(callbacks).toHaveLength(2);
        callbacks[1]();
        await vi.waitFor(() => expect(callbacks).toHaveLength(3));
        expect(calls).toHaveLength(3);
        expect(calls[2].url).toBe('https://api.test/widget/session/refresh');
        expect((calls[2].init?.headers as Record<string, string>).authorization).toBe('Bearer jwt');
        // Refresh timer re-armed with the refreshed session token ('jwt-refreshed')
        callbacks[2]();
        await vi.waitFor(() => expect(calls).toHaveLength(4));
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

describe('MountWidget on a device whose clock is off (#4931 review)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([-90, 90, 1200])('refreshes the same session on schedule instead of restarting it (skew %i s)', async (skewSeconds) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(SERVER_NOW_MS + skewSeconds * 1000);
        const server = CreateSkewedServer();
        const scheduled: Array<{ cb: () => void; delay: number }> = [];
        const transport = new MockWidgetTransport();
        await MountWidget(
            { widgetKey: 'pk_skew', apiUrl: 'https://api.test' },
            {
                sessionClientFactory: (apiUrl: string, widgetKey: string) => new WidgetSessionClient(apiUrl, widgetKey, server.Fetch),
                transportFactory: () => transport,
                scheduler: (cb: () => void, delay: number) => scheduled.push({ cb, delay }),
            },
        );
        scheduled[0].cb();
        await vi.waitFor(() => expect(scheduled).toHaveLength(2));

        expect(server.Urls).toEqual(['https://api.test/widget/session', 'https://api.test/widget/session/refresh']);
        expect(Math.abs(ProofIat(server.Proofs[0]) - SERVER_NOW_MS / 1000)).toBeLessThanOrEqual(1);
        expect(scheduled.map((s) => s.delay)).toEqual([(TOKEN_TTL_SECONDS - 60) * 1000, (TOKEN_TTL_SECONDS - 60) * 1000]);
    });
});

describe('StartEmbeddedWidget on a page without Web Crypto (plain http) (#4931 review)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div data-widget-key="pk_http" data-api-url="https://api.test"></div>';
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('resolves (no unhandled rejection), mounts nothing, and tells the host page it needs HTTPS', async () => {
        vi.stubGlobal('crypto', {});
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(StartEmbeddedWidget(document)).resolves.toBeUndefined();

        expect(document.querySelector(WIDGET_TAG_NAME)).toBeNull();
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(String(consoleError.mock.calls[0][0])).toMatch(/\[mj-widget\].*secure context.*HTTPS/i);
    });

    it('logs any other boot failure with its cause instead of rejecting', async () => {
        document.body.innerHTML = '<div data-widget-key="pk_down" data-api-url="http://127.0.0.1:1"></div>';
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const failure = new TypeError('fetch failed');
        vi.stubGlobal('fetch', () => Promise.reject(failure));

        await expect(StartEmbeddedWidget(document)).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/\[mj-widget\] Could not start/), failure);
    });
});
