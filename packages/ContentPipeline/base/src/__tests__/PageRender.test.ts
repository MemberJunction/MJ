/**
 * @fileoverview What decides whether a page is rendered: its content type, whether a plain fetch found it empty,
 * and the source's render mode; and the browser state a session may carry.
 */
import { describe, expect, it } from 'vitest';
import { IsHtmlContentType, LooksLikeEmptyPage, RendersAfterRefusal, ResolvePageRenderMode } from '../render/BasePageRenderer.js';
import { ACCESS_STORAGE_STATE_EXTENSION, SessionStorageStateOf } from '../access/BaseAccessDriver.js';
import { AlwaysRenderPolicy, BasePageRenderPolicy, WhenEmptyRenderPolicy } from '../render/PageRenderPolicy.js';

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

    it('treats an unclosed comment or element as the rest of the page, and matches tag names without regard to case', () => {
        expect(LooksLikeEmptyPage(`<body><p>Hi</p><!-- ${'hidden '.repeat(100)}`)).toBe(true);
        expect(LooksLikeEmptyPage(`<body><SCRIPT>${'x();'.repeat(100)}</Script><p>Hi</p></body>`)).toBe(true);
    });

    it('reads the text after a self-closing <svg/>', () => {
        expect(LooksLikeEmptyPage(`<body><svg class="icon"/><p>${'Words a reader came for. '.repeat(20)}</p></body>`)).toBe(false);
    });

    it('stays linear on a page built to make a scan backtrack (unclosed comments and elements, a megabyte of them)', () => {
        const started = Date.now();
        for (const opener of ['<!--', '<svg>', '<script>', '<body', '<p']) {
            LooksLikeEmptyPage('<body>' + opener.repeat(250_000));
        }
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe('BasePageRenderPolicy', () => {
    const html = (text: string) => `<html><body><p>${text}</p></body></html>`;

    it('reads the configured mode, and the default for anything else', () => {
        expect(ResolvePageRenderMode(' whenempty ')).toBe('WhenEmpty');
        expect(ResolvePageRenderMode(undefined)).toBe('Always');
        expect(ResolvePageRenderMode('Sometimes')).toBe('Always');
        expect(BasePageRenderPolicy.Resolve('WhenEmpty')).toBeInstanceOf(WhenEmptyRenderPolicy);
        expect(BasePageRenderPolicy.Resolve('Always')).toBeInstanceOf(AlwaysRenderPolicy);
    });

    it('Always: probes first, and renders anything a HEAD does not name a document file', () => {
        const policy = new AlwaysRenderPolicy();
        expect(policy.ProbesFirst).toBe(true);
        expect(policy.RendersAfterProbe('text/html')).toBe(true);
        expect(policy.RendersAfterProbe(undefined)).toBe(true);
        expect(policy.RendersAfterProbe('application/octet-stream')).toBe(true);
        expect(policy.RendersAfterProbe('application/pdf')).toBe(false);
    });

    it('WhenEmpty: renders an empty shell or a refused page, keeps a page with text, a missing page or a file', () => {
        const policy = new WhenEmptyRenderPolicy();
        expect(policy.ProbesFirst).toBe(false);
        expect(policy.RendersAfterPlainFetch({ Status: 200, ContentType: 'text/html', Html: html('') }, {})).toBe(true);
        expect(policy.RendersAfterPlainFetch({ Status: 200, ContentType: 'text/html', Html: html('words '.repeat(50)) }, {})).toBe(false);
        expect(policy.RendersAfterPlainFetch({ Status: 403, Html: '' }, {})).toBe(true);
        expect(policy.RendersAfterPlainFetch({ Status: 404, Html: '' }, {})).toBe(false);
        expect(policy.RendersAfterPlainFetch({ Status: 200, ContentType: 'application/pdf', Html: '' }, {})).toBe(false);
    });

    it('WhenEmpty: the empty-page threshold is the Tuning value when set', () => {
        const policy = new WhenEmptyRenderPolicy();
        const short = { Status: 200, ContentType: 'text/html', Html: html('just a few words here') };
        expect(policy.RendersAfterPlainFetch(short, {})).toBe(true);
        expect(policy.RendersAfterPlainFetch(short, { EmptyPageTextChars: 10 })).toBe(false);
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

describe('RendersAfterRefusal', () => {
    it('renders after a refusal a browser may get past, not after a missing page or a rate limit', () => {
        expect([401, 403, 406, 500, 503].every(RendersAfterRefusal)).toBe(true);
        expect([200, 301, 404, 410, 429].some(RendersAfterRefusal)).toBe(false);
    });
});
