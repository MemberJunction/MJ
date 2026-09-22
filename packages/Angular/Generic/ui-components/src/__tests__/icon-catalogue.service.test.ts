import { describe, it, expect, vi } from 'vitest';
import { IconCatalogueService } from '../lib/icon-picker/icon-catalogue.service';
import { FALLBACK_ICONS } from '../lib/icon-picker/font-awesome-icons';

/**
 * A style has to be FETCHED before its glyphs can be measured. A browser loads a web font
 * only when the page uses one, so an app that draws solid icons has the solid font and
 * neither of the others — and measuring then reports every brands and regular icon as
 * missing, which is most of the catalogue and exactly what a user sees as "a ton of icons
 * are not loading".
 */

/** Glyphs each real font holds, as the double's canvas will report them. */
const GLYPHS: Record<string, string[]> = {
    '"Font Awesome 6 Free"': [''],
    '"Font Awesome 6 Brands"': [''],
};

function fakeDocument(options: { loadable?: string[]; rules?: Array<[string, string]> } = {}): Document {
    const loadable = options.loadable ?? ['"Font Awesome 6 Free"', '"Font Awesome 6 Brands"'];
    const rules = options.rules ?? [['fa-user', '\\f007'], ['fa-accusoft', '\\f369']];

    const families: Record<string, string> = { 'fa-solid': '"Font Awesome 6 Free"', 'fa-brands': '"Font Awesome 6 Brands"' };
    const weights: Record<string, string> = { 'fa-solid': '900', 'fa-brands': '400' };

    /** Which family a canvas font string names, for the measurement double. */
    const familyOf = (font: string): string | null =>
        Object.keys(GLYPHS).find((f) => font.includes(f)) ?? null;

    const context = {
        font: '',
        measureText(text: string) {
            const family = familyOf(this.font);
            // A glyph the family holds measures wider; anything else falls back to the
            // control width, which is what the real comparison detects.
            const has = family && loadable.includes(family) && GLYPHS[family]?.includes(text);
            return { width: has ? 48 : 10 };
        },
    };

    return {
        styleSheets: [{
            cssRules: rules.map(([cls, glyph]) => ({
                selectorText: `.${cls}::before`,
                style: { getPropertyValue: () => `"${glyph}"` },
            })),
        }],
        body: { appendChild: () => undefined, removeChild: () => undefined },
        createElement: (tag: string) => tag === 'canvas'
            ? { getContext: () => context }
            : { className: '', style: {}, setAttribute: () => undefined },
        defaultView: {
            getComputedStyle: (el: { className: string }) => ({
                fontFamily: families[el.className] ?? '',
                fontWeight: weights[el.className] ?? '400',
            }),
        },
        fonts: {
            load: vi.fn(async (font: string) => {
                const family = Object.keys(families).map((k) => families[k]).find((f) => font.includes(f));
                return family && loadable.includes(family) ? [{}] : [];
            }),
        },
    } as unknown as Document;
}

describe('IconCatalogueService', () => {
    it('fetches each style before measuring it', async () => {
        const doc = fakeDocument();
        await new IconCatalogueService().Load(doc);
        const load = doc.fonts.load as unknown as ReturnType<typeof vi.fn>;
        expect(load).toHaveBeenCalledWith('900 16px "Font Awesome 6 Free"');
        expect(load).toHaveBeenCalledWith('400 16px "Font Awesome 6 Brands"');
    });

    it('offers a brands icon once its font has arrived', async () => {
        const icons = await new IconCatalogueService().Load(fakeDocument());
        expect(icons).toEqual([
            { Name: 'accusoft', Style: 'fa-brands' },
            { Name: 'user', Style: 'fa-solid' },
        ]);
    });

    it('drops a style whose font never arrives, rather than reporting its icons missing', async () => {
        // Solid loads, brands does not — the state an app that draws only solid icons is in.
        const icons = await new IconCatalogueService().Load(fakeDocument({ loadable: ['"Font Awesome 6 Free"'] }));
        expect(icons).toEqual([{ Name: 'user', Style: 'fa-solid' }]);
    });

    it('falls back when the page has no readable icon rules', async () => {
        const service = new IconCatalogueService();
        const icons = await service.Load(fakeDocument({ rules: [] }));
        expect(icons).toEqual(FALLBACK_ICONS);
        expect(service.IsFallback()).toBe(true);
    });

    it('reports nothing before the fonts are in, rather than a list it will replace', () => {
        const service = new IconCatalogueService();
        expect(service.Icons()).toEqual([]);
    });

    it('builds once, however many callers ask', async () => {
        const service = new IconCatalogueService();
        const doc = fakeDocument();
        const [first, second] = await Promise.all([service.Load(doc), service.Load(doc)]);
        expect(first).toBe(second);
        expect((doc.fonts.load as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    });

    it('rebuilds after being told to forget, for a page that swaps its icon set', async () => {
        const service = new IconCatalogueService();
        await service.Load(fakeDocument());
        service.Forget();
        expect(service.Icons()).toEqual([]);
        const icons = await service.Load(fakeDocument({ loadable: ['"Font Awesome 6 Free"'] }));
        expect(icons.map((i) => i.Name)).toEqual(['user']);
    });
});
