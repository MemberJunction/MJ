import { describe, it, expect } from 'vitest';
import type express from 'express';
import { OAuthCallbackHandler } from '../rest/OAuthCallbackHandler.js';

/**
 * These tests verify that query-string-derived values interpolated into the OAuth
 * success/error HTML pages are HTML-escaped, preventing reflected XSS (audit bug B6).
 *
 * The page renderers are private, so we reach them through a narrowly-typed view of
 * the instance using the codebase's established `as unknown as` double-assertion pattern.
 */
interface PageRenderer {
    handleSuccessPage(req: express.Request, res: express.Response): void;
    handleErrorPage(req: express.Request, res: express.Response): void;
    escapeHtml(value: string): string;
}

function makeRenderer(): PageRenderer {
    const handler = new OAuthCallbackHandler({ publicUrl: 'https://example.test' });
    return handler as unknown as PageRenderer;
}

/** Minimal Express request/response doubles that capture the rendered body. */
function makeReqRes(query: Record<string, string>): {
    req: express.Request;
    res: express.Response;
    getBody: () => string;
} {
    let body = '';
    const res = {
        status(): express.Response {
            return res as unknown as express.Response;
        },
        send(html: string): express.Response {
            body = html;
            return res as unknown as express.Response;
        }
    };
    return {
        req: { query } as unknown as express.Request,
        res: res as unknown as express.Response,
        getBody: () => body
    };
}

describe('OAuthCallbackHandler escapeHtml', () => {
    it('neutralizes <script>, quotes, and ampersands', () => {
        const renderer = makeRenderer();
        const escaped = renderer.escapeHtml(`<script>alert("x")&'y'</script>`);
        expect(escaped).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;y&#39;&lt;/script&gt;');
        expect(escaped).not.toContain('<script>');
    });

    it('escapes & first so no double-encoding occurs', () => {
        const renderer = makeRenderer();
        expect(renderer.escapeHtml('&lt;')).toBe('&amp;lt;');
    });
});

describe('OAuthCallbackHandler reflected-XSS protection', () => {
    it('escapes a malicious connectionId on the success page', () => {
        const renderer = makeRenderer();
        const { req, res, getBody } = makeReqRes({ connectionId: '<script>alert(1)</script>' });
        renderer.handleSuccessPage(req, res);
        const body = getBody();
        expect(body).not.toContain('<script>alert(1)</script>');
        expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes malicious error code and description on the error page', () => {
        const renderer = makeRenderer();
        const { req, res, getBody } = makeReqRes({
            error: '"><img src=x onerror=alert(1)>',
            error_description: `</div><script>evil()</script>`
        });
        renderer.handleErrorPage(req, res);
        const body = getBody();
        expect(body).not.toContain('<img src=x onerror=alert(1)>');
        expect(body).not.toContain('<script>evil()</script>');
        expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(body).toContain('&lt;script&gt;evil()&lt;/script&gt;');
    });
});
