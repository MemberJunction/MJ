import { describe, it, expect, vi, afterEach } from 'vitest';
import { OAuth2TokenManager } from '../auth-helpers/OAuth2TokenManager';

/**
 * The OAuth2 token endpoint is the one place in the integration engine where a
 * live credential arrives in an HTTP response body. The failure branch used to
 * fall back to echoing that body into an `Error` message:
 *
 * ```ts
 * const detail = parsed.error_description ?? parsed.error ?? text.slice(0, 300);
 * ```
 *
 * The `|| !parsed.access_token` half of the guard also fires on a **successful**
 * HTTP 200 whose token sits somewhere the parser did not look — a vendor
 * envelope, a nested `data` object. In that case the body being echoed IS the
 * access token, welded into an Error message that then propagates and is logged.
 */

const TOKEN = 'ya29.LIVE-ACCESS-TOKEN-MUST-NOT-BE-LOGGED';

/** Stubs global fetch with a single canned token-endpoint response. */
function stubTokenEndpoint(status: number, body: string): void {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
    })));
}

/** Requests a token and returns the message of whatever error was thrown. */
async function messageFromFailedTokenRequest(): Promise<string> {
    try {
        await new OAuth2TokenManager().GetAccessToken({
            TokenURL: 'https://vendor.example/oauth/token',
            ClientId: 'client-abc',
            ClientSecret: 'secret-def',
        }, 'client_credentials');
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
    throw new Error('expected the token request to fail, but it resolved');
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('OAuth2TokenManager token-endpoint failures', () => {
    it('does not echo a 200 response body whose token the parser missed', async () => {
        // HTTP 200, but the token is nested — so `!parsed.access_token` fires and the
        // old code echoed the body, which contains the live token.
        stubTokenEndpoint(200, JSON.stringify({ data: { access_token: TOKEN } }));

        const message = await messageFromFailedTokenRequest();
        expect(message).not.toContain(TOKEN);
        expect(message).toContain('response body withheld');
    });

    it('does not echo an unparseable response body', async () => {
        stubTokenEndpoint(500, `<html>upstream error, token=${TOKEN}</html>`);

        const message = await messageFromFailedTokenRequest();
        expect(message).not.toContain(TOKEN);
    });

    it('still reports the standard OAuth2 error fields, which carry no credentials', async () => {
        // RFC 6749 §5.2 — `error` and `error_description` describe the failure only.
        stubTokenEndpoint(400, JSON.stringify({
            error: 'invalid_client',
            error_description: 'Client authentication failed',
        }));

        const message = await messageFromFailedTokenRequest();
        expect(message).toContain('Client authentication failed');
    });

    it('keeps the diagnostics an operator needs — status and token URL', async () => {
        stubTokenEndpoint(503, 'service unavailable');

        const message = await messageFromFailedTokenRequest();
        expect(message).toContain('503');
        expect(message).toContain('https://vendor.example/oauth/token');
        expect(message).toContain('client_credentials');
    });
});
