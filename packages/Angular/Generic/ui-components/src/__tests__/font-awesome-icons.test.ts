import { describe, it, expect } from 'vitest';
import {
    FALLBACK_ICON_NAMES,
    FilterIconNames,
    IconNameOf,
    NormalizeIconClass,
    ScanLoadedIconNames,
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

describe('FilterIconNames', () => {
    const names = ['chart-bar', 'chart-column', 'bar-chart-alt', 'user', 'users'];

    it('puts names that start with the search first', () => {
        expect(FilterIconNames(names, 'chart')).toEqual(['chart-bar', 'chart-column', 'bar-chart-alt']);
    });

    it('ignores a typed fa- prefix, since that is what the user sees elsewhere', () => {
        expect(FilterIconNames(names, 'fa-user')).toEqual(['user', 'users']);
    });

    it('returns everything for an empty search', () => {
        expect(FilterIconNames(names, '  ')).toEqual(names);
    });

    it('caps the result, because the grid renders every one it is given', () => {
        expect(FilterIconNames(names, '', 2)).toHaveLength(2);
    });
});

/**
 * The catalogue is read from the page rather than shipped, so it matches whatever Font
 * Awesome the host actually loaded. A stylesheet served without CORS headers throws on
 * `cssRules`, which must not take the picker down with it.
 */
describe('ScanLoadedIconNames', () => {
    function docWith(sheets: unknown[]): Document {
        return { styleSheets: sheets } as unknown as Document;
    }

    function rule(selectorText: string, content: string | null) {
        return { selectorText, style: { getPropertyValue: () => content ?? '' } };
    }

    it('finds the icons a stylesheet defines', () => {
        const doc = docWith([{ cssRules: [rule('.fa-user::before', '"\\f007"'), rule('.fa-star:before', '"\\f005"')] }]);
        expect(ScanLoadedIconNames(doc)).toEqual(['star', 'user']);
    });

    it('leaves out the sizing and animation helpers, which draw nothing', () => {
        const doc = docWith([{ cssRules: [rule('.fa-spin::before', '"x"'), rule('.fa-2x::before', '"x"'), rule('.fa-user::before', '"\\f007"')] }]);
        expect(ScanLoadedIconNames(doc)).toEqual(['user']);
    });

    it('leaves out a rule that sets no glyph', () => {
        const doc = docWith([{ cssRules: [rule('.fa-user::before', null)] }]);
        expect(ScanLoadedIconNames(doc)).toEqual([]);
    });

    it('reads a rule that lists several selectors', () => {
        const doc = docWith([{ cssRules: [rule('.fa-user:before, .fa-person::before', '"\\f007"')] }]);
        expect(ScanLoadedIconNames(doc)).toEqual(['person', 'user']);
    });

    it('skips a stylesheet it may not read, and keeps the ones it may', () => {
        const blocked = { get cssRules(): never { throw new DOMException('cross-origin'); } };
        const doc = docWith([blocked, { cssRules: [rule('.fa-user::before', '"\\f007"')] }]);
        expect(ScanLoadedIconNames(doc)).toEqual(['user']);
    });

    it('finds nothing in a document with no stylesheets, which is what the fallback is for', () => {
        expect(ScanLoadedIconNames(docWith([]))).toEqual([]);
        expect(FALLBACK_ICON_NAMES.length).toBeGreaterThan(0);
    });
});
