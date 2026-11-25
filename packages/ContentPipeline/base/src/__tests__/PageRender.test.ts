/**
 * @fileoverview What decides whether a page is rendered: its content type, whether a plain fetch found it empty,
 * and the source's render mode; and the browser state a session may carry.
 */
import { describe, expect, it } from 'vitest';
import { IsDocumentContentType, IsHtmlContentType, LooksLikeEmptyPage, RendersAfterRefusal, ResolvePageRenderMode } from '../render/BasePageRenderer.js';
import { ACCESS_STORAGE_STATE_EXTENSION, SessionStorageStateOf } from '../access/BaseAccessDriver.js';

describe('IsHtmlContentType', () => {
    it('is HTML for text/html, XHTML, and no content type at all', () => {
        expect(IsHtmlContentType('text/html; charset=utf-8')).toBe(true);
        expect(IsHtmlContentType('application/xhtml+xml')).toBe(true);
        expect(IsHtmlContentType(undefined)).toBe(true);
    });

    it('is not HTML for a file', () => {
        expect(IsHtmlContentType('application/pdf')).toBe(false);
        expect(IsHtmlContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
    });
});

describe('LooksLikeEmptyPage', () => {
    it('finds a script shell empty, whatever its scripts, styles and noscript hold', () => {
        const shell = `<html><head><title>App</title><style>${'b{}'.repeat(500)}</style></head><body><div id="root"></div>` +
            `<noscript>You need to enable JavaScript to run this app.</noscript><script>${'x();'.repeat(500)}</script></body></html>`;
        expect(LooksLikeEmptyPage(shell)).toBe(true);
    });

    it('finds a page with real text not empty', () => {
        expect(LooksLikeEmptyPage(`<html><body><article>${'Words a reader came for. '.repeat(20)}</article></body></html>`)).toBe(false);
    });

    it('takes the threshold it is given', () => {
        expect(LooksLikeEmptyPage('<body><p>Hello there</p></body>', 5)).toBe(false);
    });
});

describe('ResolvePageRenderMode', () => {
    it('is WhenEmpty only when asked, case aside; anything else is Always', () => {
        expect(ResolvePageRenderMode('whenempty')).toBe('WhenEmpty');
        expect(ResolvePageRenderMode('Always')).toBe('Always');
        expect(ResolvePageRenderMode(undefined)).toBe('Always');
        expect(ResolvePageRenderMode('sometimes')).toBe('Always');
    });
});

describe('SessionStorageStateOf', () => {
    it("reads a session's browser state, and nothing else under the key", () => {
        const state = { Cookies: [], Origins: [{ Origin: 'https://a.test', LocalStorage: [{ Name: 't', Value: '1' }] }] };
        expect(SessionStorageStateOf({ Extensions: { [ACCESS_STORAGE_STATE_EXTENSION]: state } })).toBe(state);
        expect(SessionStorageStateOf({ Extensions: { [ACCESS_STORAGE_STATE_EXTENSION]: 'junk' } })).toBeNull();
        expect(SessionStorageStateOf(null)).toBeNull();
    });
});

describe('IsDocumentContentType', () => {
    it('knows the document files a browser downloads rather than renders', () => {
        for (const type of ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'image/png', 'text/csv; charset=utf-8']) {
            expect(IsDocumentContentType(type)).toBe(true);
        }
    });

    it('does not count a type servers also send for pages, or none at all', () => {
        for (const type of ['text/html', 'application/octet-stream', 'text/plain', 'application/json', '', undefined]) {
            expect(IsDocumentContentType(type)).toBe(false);
        }
    });
});

describe('RendersAfterRefusal', () => {
    it('renders after a refusal a browser may get past, not after a missing page or a rate limit', () => {
        expect([401, 403, 406, 500, 503].every(RendersAfterRefusal)).toBe(true);
        expect([200, 301, 404, 410, 429].some(RendersAfterRefusal)).toBe(false);
    });
});
