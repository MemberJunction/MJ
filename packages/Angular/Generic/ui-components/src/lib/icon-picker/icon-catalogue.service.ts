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
    private fallback = false;

    /**
     * Every icon on offer, with the style that draws it.
     *
     * Falls back to a short built-in list when the stylesheets cannot be read — a
     * cross-origin sheet without CORS headers throws on `cssRules` — so the picker always
     * has something to show.
     */
    public Icons(doc: Document = document): readonly FontAwesomeIcon[] {
        if (!this.catalogue) this.catalogue = this.build(doc);
        return this.catalogue;
    }

    /** True when the built-in list is standing in because the page could not be read. */
    public IsFallback(doc: Document = document): boolean {
        this.Icons(doc);
        return this.fallback;
    }

    /** Forgets the catalogue, for a page that loads a different icon set later. */
    public Forget(): void {
        this.catalogue = null;
        this.fallback = false;
    }

    private build(doc: Document): FontAwesomeIcon[] {
        const rules = ScanLoadedIconRules(doc);
        const fonts = rules.length > 0 ? ProbeIconStyleFonts(doc) : [];
        const measure = fonts.length > 0 ? this.glyphTest(doc) : null;
        const resolved = measure ? ResolveIconStyles(rules, fonts, measure) : [];
        this.fallback = resolved.length === 0;
        return this.fallback ? [...FALLBACK_ICONS] : resolved;
    }

    /**
     * A test for whether a font really has a glyph, by measuring it twice.
     *
     * A character the font lacks is drawn by the fallback instead, so it measures exactly
     * as it does with no Font Awesome in the stack at all. Comparing the two widths is
     * what separates "this font has the icon" from "the browser drew a box" — and it is
     * the only signal available, because the stylesheet never says which font holds which
     * icon.
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
            // The same size and weight either way, so only the family differs.
            const size = font.FontWeight + ' 48px';
            const withFont = measure(glyph, size + ' ' + font.FontFamily + ', monospace');
            const withoutFont = measure(glyph, size + ' monospace');
            return withFont > 0 && withFont !== withoutFont;
        };
    }
}
