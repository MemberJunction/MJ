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
import { readFileSync } from 'node:fs';
import express from 'express';
import { describe, it, expect, vi } from 'vitest';
// The handler serves the Angular Element bundle only when `@memberjunction/ng-communications` has
// been built. Pin that to "not built" so these tests do not depend on the checkout's dist folders.
vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    const existsSync = (path: Parameters<typeof actual.existsSync>[0]): boolean =>
        String(path).endsWith('dist/element/main.js') ? false : actual.existsSync(path);
    return { ...actual, existsSync, default: { ...actual, existsSync } };
});

import {
    CreateCommsWebhookHandler,
    type CommsWebhookHandlerOptions,
    type ConfirmOptInResult,
    type PreferenceCenterData,
    type SavePreferenceChoicesResult,
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

    it('REGRESSION: supplies every design token the preference element is styled with', () => {
        // The element reads MJ design tokens; this page is served with no MJ theme. A token the page
        // does not define falls back to the text colour, which made the save button a dark box with
        // an unreadable label.
        const elementCss = readFileSync(
            new URL('../../../Angular/Generic/communications/src/lib/comms-preference-center.component.css', import.meta.url),
            'utf8',
        );
        const page = RenderCommsPreferenceHostPage({
            Token: VALID_TOKEN,
            ApiRoot: '/comms',
            CspNonce: 'nonce-1',
            ElementSrc: '/comms/element/main.js',
        });
        // Set by the element itself, or used only for banners that keep a readable fallback.
        const notNeeded = /^--mj-(comms-|status-warning|status-success-bg|status-success-border)/;
        const used = [...new Set(elementCss.match(/--mj-[a-z-]+/g) ?? [])].filter((t) => !notNeeded.test(t));

        expect(used).toContain('--mj-text-inverse');
        expect(used.filter((token) => !page.includes(`${token}:`))).toEqual([]);
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

    it('GET /preferences/:token hosts the Angular Element when an element URL is configured', async () => {
        await withServer(
            { PreferenceElementSrc: 'https://cdn.example.com/prefs/main.js', GenerateNonce: () => 'element-nonce' },
            async (baseUrl) => {
                const html = await (await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, { headers: { Accept: 'text/html' } })).text();

                expect(html).toContain('<mj-comms-preference-center');
                expect(html).toContain('<script type="module" src="https://cdn.example.com/prefs/main.js" nonce="element-nonce">');
            },
        );
    });

    it('GET /preferences-element.js answers 404 when the element bundle has not been built', async () => {
        await withServer({}, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/preferences-element.js`);

            expect(res.status).toBe(404);
        });
    });

    // ─── Failure modes of the injected hooks ─────────────────────────────────

    describe('when the preference lookup fails', () => {
        const json = { Accept: 'application/json' };

        it('answers 404 for a token the resolver does not know', async () => {
            await withServer({ ResolvePreferenceCenterData: async () => null }, async (baseUrl) => {
                const res = await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, { headers: json });

                expect(res.status).toBe(404);
                expect(await res.json()).toEqual({ error: 'Preference token not found' });
            });
        });

        it('answers 500, without leaking the error, when the resolver throws', async () => {
            await withServer(
                {
                    ResolvePreferenceCenterData: async () => {
                        throw new Error('Login failed for user mj_connect');
                    },
                },
                async (baseUrl) => {
                    const res = await fetch(`${baseUrl}/preferences/${VALID_TOKEN}`, { headers: json });

                    expect(res.status).toBe(500);
                    expect(await res.text()).not.toContain('mj_connect');
                },
            );
        });

        it('answers 400 for a malformed token as JSON and as an HTML error page, without calling the resolver', async () => {
            const resolvePrefData = vi.fn(async () => sampleData);
            await withServer({ ResolvePreferenceCenterData: resolvePrefData, GenerateNonce: () => 'err-nonce' }, async (baseUrl) => {
                const jsonRes = await fetch(`${baseUrl}/preferences/not-a-uuid`, { headers: json });
                const htmlRes = await fetch(`${baseUrl}/preferences/not-a-uuid`, { headers: { Accept: 'text/html' } });

                expect(jsonRes.status).toBe(400);
                expect(htmlRes.status).toBe(400);
                expect(htmlRes.headers.get('content-security-policy')).toContain("'nonce-err-nonce'");
                expect(await htmlRes.text()).toContain('Invalid or missing preference link.');
                expect(resolvePrefData).not.toHaveBeenCalled();
            });
        });
    });

    describe('when saving preference choices fails', () => {
        const post = (baseUrl: string, body: object, token = VALID_TOKEN) =>
            fetch(`${baseUrl}/preferences/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const saveResult = (overrides: Partial<SavePreferenceChoicesResult>): SavePreferenceChoicesResult => ({
            Found: true,
            Success: true,
            UnsubscribedAll: false,
            Preferences: sampleData.Preferences,
            ...overrides,
        });

        it('answers 404 when the token matches no log', async () => {
            await withServer({ SavePreferenceCenterChoices: async () => saveResult({ Found: false, Success: false, Preferences: [] }) }, async (baseUrl) => {
                const res = await post(baseUrl, { UnsubscribeAll: true });

                expect(res.status).toBe(404);
                expect(await res.json()).toEqual({ error: 'Preference token not found' });
            });
        });

        it('answers 400 with the reason when the choices were not saved', async () => {
            const failed = saveResult({ Success: false, ErrorMessage: 'Preferences could not be saved because this address does not map to a unique recipient profile.' });
            await withServer({ SavePreferenceCenterChoices: async () => failed }, async (baseUrl) => {
                const res = await post(baseUrl, { Preferences: [{ PreferenceID: 'pref-1', State: 'Opted Out' }] });

                expect(res.status).toBe(400);
                expect(res.headers.get('cache-control')).toBe('no-store');
                expect(await res.json()).toEqual(failed);
            });
        });

        it('answers 500, without leaking the error, when the save throws', async () => {
            await withServer(
                {
                    SavePreferenceCenterChoices: async () => {
                        throw new Error('Failed to save principal preference: FK_PrincipalPreference_Sender');
                    },
                },
                async (baseUrl) => {
                    const res = await post(baseUrl, { UnsubscribeAll: true });

                    expect(res.status).toBe(500);
                    expect(await res.json()).toEqual({ error: 'Failed to save preferences' });
                },
            );
        });

        it('passes on only well-formed choices, and rejects a request left with none', async () => {
            const savePrefChoices = vi.fn(async () => saveResult({}));
            await withServer({ SavePreferenceCenterChoices: savePrefChoices }, async (baseUrl) => {
                const mixed = await post(baseUrl, {
                    Preferences: [
                        { PreferenceID: 'pref-1', State: 'Opted Out' },
                        { PreferenceID: 'pref-2', State: 'Pending' },
                        { PreferenceID: 42, State: 'Opted In' },
                        null,
                    ],
                });
                const none = await post(baseUrl, { Preferences: [{ PreferenceID: 'pref-2', State: 'Maybe' }] });
                const badToken = await post(baseUrl, { UnsubscribeAll: true }, 'not-a-uuid');

                expect(mixed.status).toBe(200);
                expect(savePrefChoices).toHaveBeenCalledTimes(1);
                expect(savePrefChoices).toHaveBeenCalledWith(
                    expect.objectContaining({ UnsubscribeAll: false, Preferences: [{ PreferenceID: 'pref-1', State: 'Opted Out' }] }),
                );
                expect([none.status, badToken.status]).toEqual([400, 400]);
            });
        });
    });

    describe('when confirming a double opt-in fails', () => {
        const confirmWith = (result: ConfirmOptInResult): CommsWebhookHandlerOptions => ({
            ConfirmDoubleOptIn: async () => result,
            GenerateNonce: () => 'confirm-nonce',
        });
        const post = (baseUrl: string, accept: string, token = VALID_TOKEN) =>
            fetch(`${baseUrl}/confirm/${token}`, { method: 'POST', headers: { Accept: accept } });

        it('answers 404 for an unknown token, as JSON and as an HTML error page', async () => {
            await withServer(confirmWith({ Found: false, Confirmed: false }), async (baseUrl) => {
                const jsonRes = await post(baseUrl, 'application/json');
                const htmlRes = await post(baseUrl, 'text/html');

                expect(jsonRes.status).toBe(404);
                expect(await jsonRes.json()).toEqual({ error: 'Confirmation token not found' });
                expect(htmlRes.status).toBe(404);
                expect(await htmlRes.text()).toContain('Confirmation link not found.');
            });
        });

        it('answers 409 when the preference was opted out and cannot be confirmed', async () => {
            const optedOut: ConfirmOptInResult = { Found: true, Confirmed: false, State: 'Opted Out', ErrorMessage: 'Cannot confirm an opted-out preference' };
            await withServer(confirmWith(optedOut), async (baseUrl) => {
                const jsonRes = await post(baseUrl, 'application/json');
                const htmlRes = await post(baseUrl, 'text/html');

                expect(jsonRes.status).toBe(409);
                expect(await jsonRes.json()).toEqual(optedOut);
                expect(htmlRes.status).toBe(409);
                expect(await htmlRes.text()).toContain('has been opted out');
            });
        });

        it('answers 500, without leaking the error, when the confirmation throws', async () => {
            await withServer(
                {
                    ConfirmDoubleOptIn: async () => {
                        throw new Error('deadlock victim on CommunicationPrincipalPreference');
                    },
                },
                async (baseUrl) => {
                    const res = await post(baseUrl, 'application/json');

                    expect(res.status).toBe(500);
                    expect(await res.json()).toEqual({ error: 'Failed to confirm subscription' });
                },
            );
        });

        it('answers 400 for a malformed token without calling the confirmation, on GET and POST', async () => {
            const confirmDoubleOptIn = vi.fn(async (): Promise<ConfirmOptInResult> => ({ Found: true, Confirmed: true }));
            await withServer({ ConfirmDoubleOptIn: confirmDoubleOptIn }, async (baseUrl) => {
                const getRes = await fetch(`${baseUrl}/confirm/not-a-uuid`, { headers: { Accept: 'text/html' } });
                const postRes = await post(baseUrl, 'application/json', 'not-a-uuid');

                expect([getRes.status, postRes.status]).toEqual([400, 400]);
                expect(confirmDoubleOptIn).not.toHaveBeenCalled();
            });
        });

        it('renders the confirmed page for a browser after a successful confirmation', async () => {
            await withServer(confirmWith({ Found: true, Confirmed: true, State: 'Opted In' }), async (baseUrl) => {
                const res = await post(baseUrl, 'text/html');

                expect(res.status).toBe(200);
                expect(res.headers.get('content-security-policy')).toContain("'nonce-confirm-nonce'");
                expect(res.headers.get('cache-control')).toBe('no-store');
            });
        });
    });
});
