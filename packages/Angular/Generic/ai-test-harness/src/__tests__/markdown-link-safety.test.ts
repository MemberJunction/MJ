import { describe, it, expect } from 'vitest';
import { GetSafeMarkdownLinkTarget, RenderSafeMarkdownLink } from '../lib/markdown-link-safety';

describe('GetSafeMarkdownLinkTarget', () => {
    it('allows http, https and mailto targets in any case', () => {
        expect(GetSafeMarkdownLinkTarget('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
        expect(GetSafeMarkdownLinkTarget('HTTP://example.com')).toBe('HTTP://example.com');
        expect(GetSafeMarkdownLinkTarget('mailto:someone@example.com')).toBe('mailto:someone@example.com');
    });

    it('allows scheme-less relative targets', () => {
        expect(GetSafeMarkdownLinkTarget('/docs/page')).toBe('/docs/page');
        expect(GetSafeMarkdownLinkTarget('#section')).toBe('#section');
        expect(GetSafeMarkdownLinkTarget('page.html?x=1')).toBe('page.html?x=1');
    });

    it('rejects script-capable and unknown schemes', () => {
        expect(GetSafeMarkdownLinkTarget('javascript:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('JaVaScRiPt:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('data:text/html,<script>alert(1)</script>')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('vbscript:msgbox(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('file:///etc/passwd')).toBeNull();
    });

    it('rejects a scheme hidden behind characters the browser strips', () => {
        expect(GetSafeMarkdownLinkTarget('java\tscript:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('java\nscript:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('java\r\nscript:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('\u0001javascript:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('   javascript:alert(1)')).toBeNull();
        expect(GetSafeMarkdownLinkTarget('j a v a s c r i p t:alert(1)')).toBeNull();
    });

    it('rejects an empty or whitespace-only target', () => {
        expect(GetSafeMarkdownLinkTarget('')).toBeNull();
        expect(GetSafeMarkdownLinkTarget(' \t\n')).toBeNull();
    });

    it('strips control characters from a target it allows', () => {
        expect(GetSafeMarkdownLinkTarget('https://exa\tmple.com')).toBe('https://example.com');
    });
});

describe('RenderSafeMarkdownLink', () => {
    it('renders an anchor with noopener for a safe target', () => {
        expect(RenderSafeMarkdownLink('Docs', 'https://example.com')).toBe(
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="markdown-link">Docs</a>',
        );
    });

    it('renders only the link text for an unsafe target', () => {
        expect(RenderSafeMarkdownLink('click me', 'javascript:alert(1)')).toBe('click me');
        expect(RenderSafeMarkdownLink('click me', 'java\tscript:alert(1)')).toBe('click me');
    });

    it('keeps an HTML-escaped entity form of a scheme inert', () => {
        // The renderer escapes the message first, so `javascript&#58;` arrives as
        // `javascript&amp;#58;`: the browser decodes that to the literal text, a relative URL.
        const rendered = RenderSafeMarkdownLink('x', 'javascript&amp;#58;alert(1)');
        expect(rendered).toContain('href="javascript&amp;#58;alert(1)"');
    });
});
