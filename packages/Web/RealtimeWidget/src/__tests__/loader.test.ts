import { describe, it, expect, beforeEach } from 'vitest';
import { mountWidget, bootstrapFromDocument } from '../loader.js';
import { WidgetSessionClient, type FetchLike } from '../session/widget-session-client.js';
import { MockWidgetTransport } from '../transport/mock-widget-transport.js';
import { WIDGET_TAG_NAME } from '../ui/support-widget-element.js';
import { readVisitorKey } from '../session/visitor-key-cookie.js';

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

        const el = await mountWidget({ widgetKey: 'pk', apiUrl: 'https://api.test', mountTarget: target }, deps(transport, scheduled));

        expect(el.tagName.toLowerCase()).toBe(WIDGET_TAG_NAME);
        expect(target.querySelector(WIDGET_TAG_NAME)).toBe(el);
        // refresh was scheduled (~9 min for a 10-min session minus 60s lead)
        expect(scheduled.length).toBe(1);
        expect(scheduled[0].delay).toBeGreaterThan(0);
    });

    it('falls back to <body> when no mount target is given', async () => {
        const el = await mountWidget({ widgetKey: 'pk', apiUrl: 'https://api.test' }, deps(new MockWidgetTransport(), []));
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
        await mountWidget(
            { widgetKey: 'pk_remember', apiUrl: 'https://api.test' },
            depsWithBody({ ...sessionBody, rememberReturningVisitors: true, visitorKey: 'vk_persist_me' }),
        );
        expect(readVisitorKey('pk_remember')).toBe('vk_persist_me');
    });

    it('writes NO cookie when remembering is off (default)', async () => {
        await mountWidget({ widgetKey: 'pk_off', apiUrl: 'https://api.test' }, depsWithBody(sessionBody));
        expect(readVisitorKey('pk_off')).toBeUndefined();
    });
});

describe('bootstrapFromDocument', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('returns null when no [data-widget-key] element is present', async () => {
        const result = await bootstrapFromDocument(document);
        expect(result).toBeNull();
    });
});
