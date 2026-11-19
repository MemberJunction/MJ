/**
 * Unit tests for CommsPreferenceHostPage and preference/confirm/unsubscribe-redirect
 * routes in CommsWebhookHandler:
 * - GET /comms/preferences/:token (HTML host page w/ CSP nonce vs scoped JSON)
 * - POST /comms/preferences/:token (save choices & UnsubscribeAll)
 * - GET /comms/confirm/:token (link-scanner safe: renders confirm button, never mutates on GET)
 * - POST /comms/confirm/:token (transitions Pending -> Opted In)
 * - GET /comms/unsubscribe?token=... (redirects to PreferenceCenterURL or /comms/preferences/:token)
 * - HTML/attribute escaping and CSP security headers
 */
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, it, expect, vi } from 'vitest';
import {
    CreateCommsWebhookHandler,
    type CommsWebhookHandlerOptions,
    type PreferenceCenterData,
} from '../rest/CommsWebhookHandler.js';
import {
    CommsHostSecurityHeaders,
    EscapeAttr,
    EscapeHtml,
    RenderCommsConfirmPage,
    RenderCommsErrorPage,
    RenderCommsPreferenceHostPage,
} from '../rest/CommsPreferenceHostPage.js';

const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655440000';

async function withServer(
    options: CommsWebhookHandlerOptions,
    fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
    const app = express();
    app.use('/comms', CreateCommsWebhookHandler(options));
    const server = app.listen(0, '127.0.0.1');
    try {
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        const { port } = server.address() as AddressInfo;
        await fn(`http://127.0.0.1:${port}/comms`);
    } finally {
        server.close();
    }
}

describe('CommsPreferenceHostPage', () => {
    it('escapes HTML and attribute values safely against XSS', () => {
        expect(EscapeHtml('<script>alert(1)</script> & "test"')).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt; &amp; "test"',
        );
        expect(EscapeAttr('a" onclick="alert(1)')).toBe('a&quot; onclick=&quot;alert(1)');

        const errHtml = RenderCommsErrorPage({
            Message: '<img src=x onerror=alert(1)>',
            PageTitle: '<script>x</script>',
            CspNonce: 'abc123',
        });
        expect(errHtml).not.toContain('<img src=x');
        expect(errHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(errHtml).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>');
    });

    it('emits strict CSP nonce headers and strips unsafe nonce characters', () => {
        const headers = CommsHostSecurityHeaders("abc+123/==';evil");
        expect(headers['Content-Security-Policy']).toContain("script-src 'nonce-abc+123/==evil' 'self'");
        expect(headers['Content-Security-Policy']).toContain("style-src 'nonce-abc+123/==evil' 'self'");
        expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
        expect(headers['X-Frame-Options']).toBe('DENY');
        expect(headers['X-Content-Type-Options']).toBe('nosniff');
        expect(headers['Cache-Control']).toBe('no-store');
    });

    it('renders Angular Element host when ElementSrc is set and vanilla fallback otherwise', () => {
        const withElement = RenderCommsPreferenceHostPage({
            Token: VALID_TOKEN,
            ApiRoot: '/comms',
            CspNonce: 'nonce-1',
            ElementSrc: '/comms/element/main.js',
        });
        expect(withElement).toContain('<mj-comms-preference-center');
        expect(withElement).toContain(`token="${VALID_TOKEN}"`);
        expect(withElement).toContain('csp-nonce="nonce-1"');
        expect(withElement).toContain('<script type="module" src="/comms/element/main.js" nonce="nonce-1">');

        const vanilla = RenderCommsPreferenceHostPage({
            Token: VALID_TOKEN,
            ApiRoot: '/comms',
            CspNonce: 'nonce-2',
        });
        expect(vanilla).not.toContain('<mj-comms-preference-center');
        expect(vanilla).toContain(`data-token="${VALID_TOKEN}"`);
        expect(vanilla).toContain('<script nonce="nonce-2">');
    });

    it('renders link-scanner-safe confirm page with POST form', () => {
        const html = RenderCommsConfirmPage({
            Token: VALID_TOKEN,
            ApiRoot: '/comms',
            CspNonce: 'nonce-3',
            BrandName: 'Acme <Corp>',
        });
        expect(html).toContain('<h1>Acme &lt;Corp&gt;</h1>');
        expect(html).toContain(`<form method="POST" action="/comms/confirm/${VALID_TOKEN}"`);
        expect(html).toContain('Confirm Subscription');
    });
});

describe('CommsWebhookHandler Preference Center & Confirm Routes', () => {
    const sampleData: PreferenceCenterData = {
        Token: VALID_TOKEN,
        Sender: {
            ID: 'sender-1',
            Name: 'Acme Newsletter',
            TemplateContext: {
                BrandName: 'Acme Co',
                LogoURL: 'https://example.com/logo.png',
                PrimaryColor: '#0B5394',
                FooterText: '123 Main St',
            },
        },
        Preferences: [
            {
                ID: 'pref-1',
                Name: 'Product Updates',
                Description: 'Monthly release notes',
                Category: 'Newsletters',
                MessageClass: 'Marketing',
                State: 'Opted In',
            },
        ],
        CanUnsubscribeAll: true,
    };

    it('GET /preferences/:token returns CSP-nonce HTML on Accept: text/html and scoped JSON on Accept: application/json', async () => {
        const resolvePrefData = vi.fn().mockResolvedValue(sampleData);

        await withServer(
            {
                ResolvePreferenceCenterData: resolvePrefData,
                GenerateNonce: () => 'fixed-nonce-xyz',
            },
            async (baseUrl) => {
                const htmlRes = await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, {
                    headers: { Accept: 'text/html' },
                });
                expect(htmlRes.status).toBe(200);
                expect(htmlRes.headers.get('content-type')).toContain('text/html');
                expect(htmlRes.headers.get('content-security-policy')).toContain("'nonce-fixed-nonce-xyz'");
                const html = await htmlRes.text();
                expect(html).toContain(`data-token="${VALID_TOKEN}"`);
                expect(resolvePrefData).not.toHaveBeenCalled();

                const jsonRes = await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, {
                    headers: { Accept: 'application/json' },
                });
                expect(jsonRes.status).toBe(200);
                const json = (await jsonRes.json()) as PreferenceCenterData;
                expect(json.Sender.TemplateContext.BrandName).toBe('Acme Co');
                expect(json.Preferences).toHaveLength(1);
                expect(resolvePrefData).toHaveBeenCalledWith(VALID_TOKEN);
            },
        );
    });

    it('POST /preferences/:token saves preference updates and UnsubscribeAll', async () => {
        const savePrefChoices = vi.fn().mockResolvedValue({
            Found: true,
            Success: true,
            UnsubscribedAll: true,
            Preferences: [{ ...sampleData.Preferences[0], State: 'Opted Out' }],
        });

        await withServer(
            { SavePreferenceCenterChoices: savePrefChoices },
            async (baseUrl) => {
                const badRes = await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                expect(badRes.status).toBe(400);

                const okRes = await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ UnsubscribeAll: true }),
                });
                expect(okRes.status).toBe(200);
                expect(savePrefChoices).toHaveBeenCalledWith(
                    expect.objectContaining({
                        Token: VALID_TOKEN,
                        UnsubscribeAll: true,
                    }),
                );
            },
        );
    });

    it('GET /confirm/:token never mutates state (link-scanner safe); POST /confirm/:token confirms opt-in', async () => {
        const confirmDoubleOptIn = vi.fn().mockResolvedValue({
            Found: true,
            Confirmed: true,
            State: 'Opted In',
            ConfirmedAt: '2026-11-19T12:00:00.000Z',
        });

        await withServer(
            {
                ConfirmDoubleOptIn: confirmDoubleOptIn,
                GenerateNonce: () => 'confirm-nonce',
            },
            async (baseUrl) => {
                const getRes = await fetch(`${baseUrl}/confirm/${VALID_TOKEN}`, {
                    headers: { Accept: 'text/html' },
                });
                expect(getRes.status).toBe(200);
                expect(getRes.headers.get('content-security-policy')).toContain("'nonce-confirm-nonce'");
                const getHtml = await getRes.text();
                expect(getHtml).toContain('Confirm Subscription');
                expect(confirmDoubleOptIn).not.toHaveBeenCalled();

                const postRes = await fetch(`${baseUrl}/confirm/${VALID_TOKEN}`, {
                    method: 'POST',
                    headers: { Accept: 'application/json' },
                });
                expect(postRes.status).toBe(200);
                expect(confirmDoubleOptIn).toHaveBeenCalledWith(
                    expect.objectContaining({ Token: VALID_TOKEN }),
                );
                const body = (await postRes.json()) as { Confirmed: boolean; State: string };
                expect(body.Confirmed).toBe(true);
                expect(body.State).toBe('Opted In');
            },
        );
    });

    it('GET /unsubscribe redirects to PreferenceCenterURL when configured, or /comms/preferences/:token', async () => {
        const resolveRedirect = vi
            .fn()
            .mockResolvedValueOnce('https://prefs.acme.com/manage')
            .mockResolvedValueOnce(undefined);

        await withServer(
            { ResolveUnsubscribeRedirect: resolveRedirect },
            async (baseUrl) => {
                const badRes = await fetch(`${baseUrl}/unsubscribe?token=bad`, { redirect: 'manual' });
                expect(badRes.status).toBe(400);

                const customRes = await fetch(`${baseUrl}/unsubscribe?token=${VALID_TOKEN}`, { redirect: 'manual' });
                expect(customRes.status).toBe(302);
                expect(customRes.headers.get('location')).toBe(
                    `https://prefs.acme.com/manage?token=${VALID_TOKEN}`,
                );

                const defaultRes = await fetch(`${baseUrl}/unsubscribe?token=${VALID_TOKEN}`, { redirect: 'manual' });
                expect(defaultRes.status).toBe(302);
                expect(defaultRes.headers.get('location')).toBe(`/comms/preferences/${VALID_TOKEN}`);
            },
        );
    });
});
