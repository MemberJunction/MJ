import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core-entities', () => ({
    MJComponentLibraryEntity: class {},
}));

import {
    FindDomSubresourceByUrl,
    IsAllowedSubresourceUrl,
} from '../utilities/library-loader';
import { ComponentCompiler } from '../compiler/component-compiler';

interface FakeElement {
    tagName: string;
    rel?: string;
    href?: string;
    src?: string;
    async?: boolean;
    getAttribute(attr: string): string | null;
}

function makeFakeElement(tagName: string, attrs: { src?: string; href?: string } = {}): FakeElement {
    return {
        tagName,
        src: attrs.src,
        href: attrs.href,
        getAttribute(attr: string): string | null {
            if (attr === 'src') return this.src ?? null;
            if (attr === 'href') return this.href ?? null;
            return null;
        },
    };
}

describe('React runtime subresource URL screening & selector-injection prevention (PR #6034)', () => {
    const scripts: FakeElement[] = [];
    const links: FakeElement[] = [];
    const appendedToHead: FakeElement[] = [];
    const querySelectorSpy = vi.fn(() => {
        throw new Error('querySelector should never be used for untrusted URL lookups');
    });

    beforeEach(() => {
        scripts.length = 0;
        links.length = 0;
        appendedToHead.length = 0;
        querySelectorSpy.mockClear();

        vi.stubGlobal('window', { location: { origin: 'https://explorer.example.com' } });
        vi.stubGlobal('document', {
            querySelector: querySelectorSpy,
            getElementsByTagName: vi.fn((tag: string) => {
                if (tag === 'script') return scripts;
                if (tag === 'link') return links;
                return [];
            }),
            createElement: vi.fn((tag: string) => makeFakeElement(tag)),
            head: {
                appendChild: vi.fn((el: FakeElement) => {
                    appendedToHead.push(el);
                }),
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('IsAllowedSubresourceUrl allows http(s) and same-origin paths while blocking dangerous schemes', () => {
        expect(IsAllowedSubresourceUrl('https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js')).toBe(true);
        expect(IsAllowedSubresourceUrl('http://localhost:4200/vendor/lib.js')).toBe(true);
        expect(IsAllowedSubresourceUrl('/assets/theme.css')).toBe(true);

        expect(IsAllowedSubresourceUrl('javascript:alert(1)')).toBe(false);
        expect(IsAllowedSubresourceUrl('data:text/javascript,alert(1)')).toBe(false);
        expect(IsAllowedSubresourceUrl('blob:https://explorer.example.com/id')).toBe(false);
        expect(IsAllowedSubresourceUrl('//evil.example.com/lib.js')).toBe(false);
        expect(IsAllowedSubresourceUrl('')).toBe(false);
        expect(IsAllowedSubresourceUrl(null)).toBe(false);
    });

    it('FindDomSubresourceByUrl safely matches URLs containing quotes and CSS selector metacharacters without calling querySelector', () => {
        const trickyUrl = 'https://cdn.example.com/style.css?v=1"] , body[data-x="1';
        const existing = makeFakeElement('link', { href: trickyUrl });
        links.push(existing);

        const found = FindDomSubresourceByUrl('link', 'href', trickyUrl);
        expect(found).toBe(existing);
        expect(FindDomSubresourceByUrl('link', 'href', 'https://cdn.example.com/other.css')).toBeNull();
        expect(querySelectorSpy).not.toHaveBeenCalled();
    });

    it('ComponentCompiler.loadStyles and loadScript block non-http(s) URLs and avoid querySelector on quoted URLs', async () => {
        const compiler = new ComponentCompiler();
        const loadStyles = Reflect.get(compiler, 'loadStyles') as (urls: string[]) => Promise<void>;
        const loadScript = Reflect.get(compiler, 'loadScript') as (url: string, globalName: string) => Promise<void>;

        const quotedCssUrl = 'https://cdn.example.com/app.css?tok="]';
        await loadStyles.call(compiler, [
            'javascript:alert(1)',
            'data:text/css,body{display:none}',
            '//evil.example.com/inject.css',
            quotedCssUrl,
        ]);

        // Only the valid https stylesheet was appended; querySelector was never invoked
        expect(appendedToHead).toHaveLength(1);
        expect(appendedToHead[0].href).toBe(quotedCssUrl);
        expect(querySelectorSpy).not.toHaveBeenCalled();

        // Dangerous script schemes reject immediately without creating a <script> tag
        await expect(loadScript.call(compiler, 'javascript:alert(1)', 'EvilGlobal')).rejects.toThrow(
            /Refused to load script from non-http\(s\) URL/,
        );
        await expect(loadScript.call(compiler, '//evil.example.com/x.js', 'EvilGlobal')).rejects.toThrow(
            /Refused to load script from non-http\(s\) URL/,
        );
        expect(appendedToHead).toHaveLength(1);
    });
});
