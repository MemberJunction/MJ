import { describe, it, expect } from 'vitest';
import {
    FALLBACK_ICONS,
    FilterIcons,
    GlyphFromContent,
    IconNameOf,
    NormalizeIconClass,
    ProbeIconStyleFonts,
    ResolveIconStyles,
    ScanLoadedIconRules,
    type IconStyleFont,
} from '../lib/icon-picker/font-awesome-icons';

/**
 * Font Awesome needs a style class as well as a name. `fa-chart-column` alone matches a
 * rule that sets a glyph but no font family, so nothing draws at all — which reads as a
 * broken panel rather than as a value missing a word.
 */
describe('NormalizeIconClass', () => {
    it('completes a bare name with the solid style', () => {
        expect(NormalizeIconClass('fa-chart-column')).toBe('fa-solid fa-chart-column');
    });

    it('completes a name written without the fa- prefix too', () => {
        expect(NormalizeIconClass('chart-column')).toBe('fa-solid fa-chart-column');
    });

    it('leaves a value that already names a style alone', () => {
        expect(NormalizeIconClass('fa-regular fa-star')).toBe('fa-regular fa-star');
    });

    it('still renders a brands class, which the picker no longer offers but may be stored', () => {
        expect(NormalizeIconClass('fa-brands fa-github')).toBe('fa-brands fa-github');
    });

    it('leaves the older one-class form alone, which generated forms still use', () => {
        expect(NormalizeIconClass('fa fa-folder')).toBe('fa fa-folder');
        expect(NormalizeIconClass('fas fa-user')).toBe('fas fa-user');
    });

    it('takes a style the host prefers', () => {
        expect(NormalizeIconClass('star', 'fa-regular')).toBe('fa-regular fa-star');
    });

    it('returns nothing for nothing, rather than a style with no icon', () => {
        expect(NormalizeIconClass('')).toBe('');
        expect(NormalizeIconClass('   ')).toBe('');
        expect(NormalizeIconClass(null)).toBe('');
    });

    it('tidies stray whitespace rather than passing it through to the class attribute', () => {
        expect(NormalizeIconClass('  fa-solid   fa-star ')).toBe('fa-solid fa-star');
    });
});

describe('IconNameOf', () => {
    it('reads the name out of a complete class string', () => {
        expect(IconNameOf('fa-solid fa-chart-column')).toBe('chart-column');
    });

    it('ignores the style and the helper classes', () => {
        expect(IconNameOf('fa-solid fa-fw fa-spin fa-user')).toBe('user');
    });

    it('is empty when there is no icon', () => {
        expect(IconNameOf('fa-solid')).toBe('');
        expect(IconNameOf('')).toBe('');
    });
});

describe('GlyphFromContent', () => {
    it('reads the character out of a CSS escape, which is how Font Awesome writes it', () => {
        expect(GlyphFromContent('"\\f007"')).toBe(String.fromCodePoint(0xf007));
    });

    it('takes a literal single character', () => {
        expect(GlyphFromContent('"A"')).toBe('A');
    });

    it('yields nothing for a value that names no character', () => {
        expect(GlyphFromContent('none')).toBe('');
        expect(GlyphFromContent('"ab"')).toBe('');
        expect(GlyphFromContent('var(--fa-user)')).toBe('');
    });
});

describe('FilterIcons', () => {
    const icons = ['chart-bar', 'chart-column', 'bar-chart-alt', 'user', 'users']
        .map((Name) => ({ Name, Style: 'fa-solid' }));

    it('puts names that start with the search first', () => {
        expect(FilterIcons(icons, 'chart').map((i) => i.Name))
            .toEqual(['chart-bar', 'chart-column', 'bar-chart-alt']);
    });

    it('ignores a typed fa- prefix, since that is what the user sees elsewhere', () => {
        expect(FilterIcons(icons, 'fa-user').map((i) => i.Name)).toEqual(['user', 'users']);
    });

    it('returns everything for an empty search', () => {
        expect(FilterIcons(icons, '  ')).toHaveLength(icons.length);
    });

    it('caps the result, because the grid renders every one it is given', () => {
        expect(FilterIcons(icons, '', 2)).toHaveLength(2);
    });
});

/**
 * The catalogue is read from the page rather than shipped, so it matches whatever Font
 * Awesome the host actually loaded. A stylesheet served without CORS headers throws on
 * `cssRules`, which must not take the picker down with it.
 */
describe('ScanLoadedIconRules', () => {
    function docWith(sheets: unknown[]): Document {
        return { styleSheets: sheets } as unknown as Document;
    }

    function rule(selectorText: string, content: string | null) {
        return { selectorText, style: { getPropertyValue: () => content ?? '' } };
    }

    it('finds the icons a stylesheet defines, with their glyphs', () => {
        const doc = docWith([{ cssRules: [rule('.fa-user::before', '"\\f007"'), rule('.fa-star:before', '"\\f005"')] }]);
        expect(ScanLoadedIconRules(doc)).toEqual([
            { Name: 'star', Glyph: String.fromCodePoint(0xf005) },
            { Name: 'user', Glyph: String.fromCodePoint(0xf007) },
        ]);
    });

    it('leaves out the sizing and animation helpers, which draw nothing', () => {
        const doc = docWith([{ cssRules: [rule('.fa-spin::before', '"\\f110"'), rule('.fa-2x::before', '"\\f110"'), rule('.fa-user::before', '"\\f007"')] }]);
        expect(ScanLoadedIconRules(doc).map((r) => r.Name)).toEqual(['user']);
    });

    it('leaves out a rule that sets no glyph', () => {
        const doc = docWith([{ cssRules: [rule('.fa-user::before', null)] }]);
        expect(ScanLoadedIconRules(doc)).toEqual([]);
    });

    it('reads a rule that lists several selectors', () => {
        const doc = docWith([{ cssRules: [rule('.fa-user:before, .fa-person::before', '"\\f007"')] }]);
        expect(ScanLoadedIconRules(doc).map((r) => r.Name)).toEqual(['person', 'user']);
    });

    it('skips a stylesheet it may not read, and keeps the ones it may', () => {
        const blocked = { get cssRules(): never { throw new DOMException('cross-origin'); } };
        const doc = docWith([blocked, { cssRules: [rule('.fa-user::before', '"\\f007"')] }]);
        expect(ScanLoadedIconRules(doc).map((r) => r.Name)).toEqual(['user']);
    });

    it('finds nothing in a document with no stylesheets, which is what the fallback is for', () => {
        expect(ScanLoadedIconRules(docWith([]))).toEqual([]);
        expect(FALLBACK_ICONS.length).toBeGreaterThan(0);
    });
});

/**
 * Knowing an icon's NAME is not enough. Font Awesome splits its icons across several
 * fonts and the stylesheet gives them all the same kind of rule, so a brands icon drawn
 * as solid renders as a missing-glyph box — which is what a user sees as "half the icons
 * are broken". Which font holds a glyph is measured, because nothing says it.
 */
describe('ResolveIconStyles', () => {
    const SOLID: IconStyleFont = { Style: 'fa-solid', FontFamily: '"Font Awesome 6 Free"', FontWeight: '900' };
    const BRANDS: IconStyleFont = { Style: 'fa-brands', FontFamily: '"Font Awesome 6 Brands"', FontWeight: '400' };

    const rules = [
        { Name: 'user', Glyph: 'A' },
        { Name: 'github', Glyph: 'B' },
        { Name: 'ghost-icon', Glyph: 'C' },
    ];

    /** A stand-in for the canvas measurement: solid has A, brands has B, nobody has C. */
    const hasGlyph = (glyph: string, font: IconStyleFont): boolean =>
        (glyph === 'A' && font.Style === 'fa-solid') || (glyph === 'B' && font.Style === 'fa-brands');

    it('reports each icon under the style that actually draws it', () => {
        expect(ResolveIconStyles(rules, [SOLID, BRANDS], hasGlyph)).toEqual([
            { Name: 'user', Style: 'fa-solid' },
            { Name: 'github', Style: 'fa-brands' },
        ]);
    });

    it('drops an icon no loaded font has, rather than offering a blank square', () => {
        const names = ResolveIconStyles(rules, [SOLID, BRANDS], hasGlyph).map((i) => i.Name);
        expect(names).not.toContain('ghost-icon');
    });

    it('reports an icon present in two styles under the first one tried', () => {
        const inBoth = (): boolean => true;
        expect(ResolveIconStyles([rules[0]], [SOLID, BRANDS], inBoth)).toEqual([{ Name: 'user', Style: 'fa-solid' }]);
    });

    it('resolves nothing when no style is loaded', () => {
        expect(ResolveIconStyles(rules, [], hasGlyph)).toEqual([]);
    });
});

describe('ProbeIconStyleFonts', () => {
    /** A document double: every probe resolves to whatever `families` says for its class. */
    function docWith(families: Record<string, string>): Document {
        const body = { appendChild: () => undefined, removeChild: () => undefined };
        return {
            body,
            createElement: () => ({ className: '', style: {}, setAttribute: () => undefined }),
            defaultView: {
                getComputedStyle: (el: { className: string }) => ({
                    fontFamily: families[el.className] ?? '',
                    fontWeight: el.className === 'fa-solid' ? '900' : '400',
                }),
            },
        } as unknown as Document;
    }

    it('reports the family and weight the browser resolves for each style', () => {
        const doc = docWith({
            'fa-solid': '"Font Awesome 6 Free"',
            'fa-regular': '"Font Awesome 6 Free"',
            'fa-brands': '"Font Awesome 6 Brands"',
        });
        expect(ProbeIconStyleFonts(doc)).toEqual([
            { Style: 'fa-solid', FontFamily: '"Font Awesome 6 Free"', FontWeight: '900' },
            { Style: 'fa-regular', FontFamily: '"Font Awesome 6 Free"', FontWeight: '400' },
        ]);
    });

    /**
     * Brands icons are company logos. A section header is not a place for one, and six
     * hundred of them bury the icons that do belong behind names nobody searches for.
     */
    it('does not probe brands, so its icons are never offered', () => {
        const doc = docWith({
            'fa-solid': '"Font Awesome 6 Free"',
            'fa-brands': '"Font Awesome 6 Brands"',
        });
        expect(ProbeIconStyleFonts(doc).map((f) => f.Style)).not.toContain('fa-brands');
    });

    it('still probes a style a caller names explicitly', () => {
        const doc = docWith({ 'fa-brands': '"Font Awesome 6 Brands"' });
        expect(ProbeIconStyleFonts(doc, ['fa-brands']).map((f) => f.Style)).toEqual(['fa-brands']);
    });

    it('leaves out a style whose family does not resolve, because it is not loaded', () => {
        const doc = docWith({ 'fa-solid': '"Font Awesome 6 Free"', 'fa-regular': 'sans-serif' });
        expect(ProbeIconStyleFonts(doc).map((f) => f.Style)).toEqual(['fa-solid']);
    });

    it('reports none for a page with no Font Awesome at all', () => {
        expect(ProbeIconStyleFonts(docWith({}))).toEqual([]);
    });
});
