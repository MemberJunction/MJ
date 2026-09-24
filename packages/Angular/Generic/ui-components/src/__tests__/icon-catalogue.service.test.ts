import { describe, it, expect, vi } from 'vitest';
import { IconCatalogueService } from '../lib/icon-picker/icon-catalogue.service';
import { FALLBACK_ICONS } from '../lib/icon-picker/font-awesome-icons';

/**
 * A style has to be FETCHED before its glyphs can be measured. A browser loads a web font
 * only when the page uses one, so an app that draws solid icons has the solid font and
 * neither of the others — and measuring then reports every other icon as missing, which a
 * user sees as "a ton of icons are not loading".
 */

const USER = String.fromCodePoint(0xf007);
const STAR = String.fromCodePoint(0xf005);
const ACCUSOFT = String.fromCodePoint(0xf369);

const FREE = '"Font Awesome 6 Free"';
const BRANDS = '"Font Awesome 6 Brands"';

/**
 * Which glyphs each FACE holds. Solid and regular share a family name and differ only by
 * weight, exactly as Font Awesome Free ships them — which is why a face is keyed by both.
 */
const GLYPHS: Record<string, string[]> = {
    [`900|${FREE}`]: [USER],
    [`400|${FREE}`]: [STAR],
    [`400|${BRANDS}`]: [ACCUSOFT],
};

function fakeDocument(options: { loadable?: string[]; rules?: Array<[string, string]> } = {}): Document {
    const loadable = options.loadable ?? [FREE, BRANDS];
    const rules = options.rules ?? [['fa-user', USER], ['fa-star', STAR], ['fa-accusoft', ACCUSOFT]];

    const families: Record<string, string> = { 'fa-solid': FREE, 'fa-regular': FREE, 'fa-brands': BRANDS };
    const weights: Record<string, string> = { 'fa-solid': '900', 'fa-regular': '400', 'fa-brands': '400' };

    /** The face a canvas font string names — weight AND family, as the real one does. */
    const faceOf = (font: string): string | null =>
        Object.keys(GLYPHS).find((key) => {
            const [weight, family] = key.split('|');
            return font.startsWith(`${weight} `) && font.includes(family);
        }) ?? null;

    const context = {
        font: '',
        measureText(text: string) {
            const face = faceOf(this.font);
            const family = face?.split('|')[1] ?? '';
            // A glyph the face holds measures at the icon width; anything it lacks — the
            // control codepoint included — measures at the last-resort box width, which is
            // the equality the real comparison detects.
            const has = !!face && loadable.includes(family) && GLYPHS[face].includes(text);
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
                const family = [FREE, BRANDS].find((f) => font.includes(f));
                return family && loadable.includes(family) ? [{}] : [];
            }),
        },
    } as unknown as Document;
}

describe('IconCatalogueService', () => {
    it('fetches each offered style before measuring it', async () => {
        const doc = fakeDocument();
        await new IconCatalogueService().Load(doc);
        const load = doc.fonts.load as unknown as ReturnType<typeof vi.fn>;
        expect(load).toHaveBeenCalledWith(`900 16px ${FREE}`);
        expect(load).toHaveBeenCalledWith(`400 16px ${FREE}`);
    });

    /**
     * Brands icons are company logos. A section header is not a place for one, and six
     * hundred of them bury the icons that do belong behind names nobody searches for — so
     * the font is never fetched, let alone measured.
     */
    it('offers no brands icon, and does not fetch the brands font', async () => {
        const doc = fakeDocument();
        const icons = await new IconCatalogueService().Load(doc);
        expect(icons.map((i) => i.Name)).not.toContain('accusoft');
        const load = doc.fonts.load as unknown as ReturnType<typeof vi.fn>;
        expect(load).not.toHaveBeenCalledWith(`400 16px ${BRANDS}`);
    });

    it('offers solid and regular, each under the face that holds it', async () => {
        const icons = await new IconCatalogueService().Load(fakeDocument());
        expect(icons).toEqual([
            { Name: 'star', Style: 'fa-regular' },
            { Name: 'user', Style: 'fa-solid' },
        ]);
    });

    it('falls back when no icon font arrives at all', async () => {
        const service = new IconCatalogueService();
        const icons = await service.Load(fakeDocument({ loadable: [] }));
        expect(icons).toEqual(FALLBACK_ICONS);
        expect(service.IsFallback()).toBe(true);
    });

    it('falls back when the page has no readable icon rules', async () => {
        const service = new IconCatalogueService();
        expect(await service.Load(fakeDocument({ rules: [] }))).toEqual(FALLBACK_ICONS);
        expect(service.IsFallback()).toBe(true);
    });

    it('reports nothing before the fonts are in, rather than a list it will replace', () => {
        expect(new IconCatalogueService().Icons()).toEqual([]);
    });

    it('builds once, however many callers ask', async () => {
        const service = new IconCatalogueService();
        const doc = fakeDocument();
        const [first, second] = await Promise.all([service.Load(doc), service.Load(doc)]);
        expect(first).toBe(second);
        // One fetch per offered style, not per caller.
        expect((doc.fonts.load as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    });

    it('rebuilds after being told to forget, for a page that swaps its icon set', async () => {
        const service = new IconCatalogueService();
        await service.Load(fakeDocument());
        service.Forget();
        expect(service.Icons()).toEqual([]);
        const icons = await service.Load(fakeDocument({ rules: [['fa-user', USER]] }));
        expect(icons.map((i) => i.Name)).toEqual(['user']);
    });
});

/**
 * Font Awesome Free ships TWO faces under one family name — solid at weight 900 and
 * regular at 400. A glyph missing from the requested weight is drawn from the other face
 * before any fallback is reached, so a test that compared against a second font stack read
 * that as a hit and filed regular-only icons under solid.
 */
describe('IconCatalogueService — telling the faces apart', () => {
    it('does not put an icon under a face whose font lacks it', async () => {
        // Solid is tried first, but only regular has this glyph.
        const icons = await new IconCatalogueService().Load(fakeDocument());
        expect(icons.find((i) => i.Name === 'star')?.Style).toBe('fa-regular');
    });

    it('measures each family on its own, with no fallback family behind it', async () => {
        const seen: string[] = [];
        const doc = fakeDocument();
        const original = doc.createElement.bind(doc) as (tag: string) => unknown;
        (doc as unknown as { createElement: (tag: string) => unknown }).createElement = (tag: string) => {
            const made = original(tag) as { getContext?: () => { font: string } };
            if (tag !== 'canvas' || !made.getContext) return made;
            const context = made.getContext();
            return {
                getContext: () => new Proxy(context, {
                    set(target, prop, value) {
                        if (prop === 'font') seen.push(String(value));
                        return Reflect.set(target, prop, value);
                    },
                }),
            };
        };
        await new IconCatalogueService().Load(doc);
        expect(seen.length).toBeGreaterThan(0);
        expect(seen.every((font) => !font.includes(','))).toBe(true);
    });
});
