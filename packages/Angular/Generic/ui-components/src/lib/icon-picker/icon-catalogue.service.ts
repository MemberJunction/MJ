import { Injectable } from '@angular/core';
import {
    FALLBACK_ICONS,
    ProbeIconStyleFonts,
    ResolveIconStyles,
    ScanLoadedIconRules,
    type FontAwesomeIcon,
    type IconStyleFont,
} from './font-awesome-icons';

/**
 * The Font Awesome icons this page can draw, worked out once and shared.
 *
 * Answering it means walking every CSS rule in the document and then measuring a couple of
 * thousand glyphs, so it is done on first ask and kept. A picker that recomputed per open
 * would stall each time it was used.
 */
@Injectable({ providedIn: 'root' })
export class IconCatalogueService {
    private catalogue: FontAwesomeIcon[] | null = null;
    private loading: Promise<readonly FontAwesomeIcon[]> | null = null;
    private fallback = false;

    /**
     * Every icon on offer, with the style that draws it.
     *
     * Each style has to be FETCHED before it can be measured. A browser loads a web font
     * only when something on the page uses it, so an app drawing solid icons has the solid
     * font and neither of the others — and measuring then reports every brands and regular
     * icon as missing, which is most of the catalogue.
     *
     * Falls back to a short built-in list when the stylesheets cannot be read — a
     * cross-origin sheet without CORS headers throws on `cssRules` — so the picker always
     * has something to show.
     */
    public async Load(doc: Document = document): Promise<readonly FontAwesomeIcon[]> {
        if (this.catalogue) return this.catalogue;
        if (!this.loading) this.loading = this.build(doc);
        return this.loading;
    }

    /**
     * What is known right now, without waiting.
     *
     * Empty until {@link Load} has finished, which is the honest answer: a caller that
     * rendered this before the fonts arrived would draw the short fallback list and then
     * replace it, which reads as the picker changing its mind.
     */
    public Icons(): readonly FontAwesomeIcon[] {
        return this.catalogue ?? [];
    }

    /** True when the built-in list is standing in because the page could not be read. */
    public IsFallback(): boolean {
        return this.fallback;
    }

    /** Forgets the catalogue, for a page that loads a different icon set later. */
    public Forget(): void {
        this.catalogue = null;
        this.loading = null;
        this.fallback = false;
    }

    private async build(doc: Document): Promise<readonly FontAwesomeIcon[]> {
        const rules = ScanLoadedIconRules(doc);
        const fonts = rules.length > 0 ? ProbeIconStyleFonts(doc) : [];
        const ready = await this.fetchFonts(doc, fonts);
        const measure = ready.length > 0 ? this.glyphTest(doc) : null;
        const resolved = measure ? ResolveIconStyles(rules, fonts, measure) : [];
        this.fallback = resolved.length === 0;
        this.catalogue = this.fallback ? [...FALLBACK_ICONS] : resolved;
        return this.catalogue;
    }

    /**
     * Fetch each style's font file, returning the ones that arrived.
     *
     * `document.fonts.load` resolves once the face is usable by canvas. A style that fails
     * to load is dropped rather than measured, because measuring it would report every one
     * of its icons as missing and quietly halve the catalogue.
     */
    private async fetchFonts(doc: Document, fonts: readonly IconStyleFont[]): Promise<IconStyleFont[]> {
        const faces = doc.fonts;
        if (!faces?.load) return [...fonts];
        const results = await Promise.all(fonts.map(async (font) => {
            try {
                const loaded = await faces.load(`${font.FontWeight} 16px ${font.FontFamily}`);
                return loaded.length > 0 ? font : null;
            } catch {
                // A face the browser refuses to load cannot be measured either.
                return null;
            }
        }));
        return results.filter((font): font is IconStyleFont => font !== null);
    }

    /**
     * A test for whether a font really has a glyph, by measuring it.
     *
     * The family is named ALONE, with no fallback behind it, and the glyph's width is
     * compared against a codepoint no icon font defines. A glyph the font lacks is drawn
     * by the browser's last-resort font, exactly as the control is, so the two measure the
     * same — while a glyph it has measures at the icon's own advance width.
     *
     * Comparing against the same family instead of against a second font stack is what
     * makes this sound. Font Awesome Free ships two faces under ONE family name, solid at
     * weight 900 and regular at 400, so a glyph missing from the requested weight is drawn
     * from the other one before any fallback is reached — and a comparison that assumed
     * the fallback had been reached read that as a hit.
     *
     * Returns null where there is no canvas to measure with, in which case the caller
     * falls back rather than offering every icon in every style.
     */
    private glyphTest(doc: Document): ((glyph: string, font: IconStyleFont) => boolean) | null {
        const context = doc.createElement('canvas').getContext('2d');
        if (!context) return null;
        const widths = new Map<string, number>();
        const measure = (glyph: string, font: string): number => {
            const key = font + '|' + glyph;
            let width = widths.get(key);
            if (width === undefined) {
                context.font = font;
                width = context.measureText(glyph).width;
                widths.set(key, width);
            }
            return width;
        };
        return (glyph: string, font: IconStyleFont): boolean => {
            if (!glyph) return false;
            const face = font.FontWeight + ' 48px ' + font.FontFamily;
            const width = measure(glyph, face);
            return width > 0 && width !== measure(ABSENT_GLYPH, face);
        };
    }
}

/**
 * A codepoint no icon font defines, for measuring what "missing" looks like.
 *
 * Plane 16's private-use area, which Font Awesome does not reach into — its own icons sit
 * in the basic-plane private-use area — so every font draws this as its last-resort box.
 */
const ABSENT_GLYPH = String.fromCodePoint(0x10FFFD);
