/**
 * Grapheme-aware deletion lengths.
 *
 * A single "character" to the user may be several code units: an emoji is a surrogate
 * pair, a flag is two, a family emoji is several joined by U+200D, an accented letter may
 * carry combining marks. Deleting one code unit from any of those leaves a broken glyph.
 * `Intl.Segmenter` knows the rules; the fallback at least keeps surrogate pairs whole.
 */

let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
    if (segmenter === undefined) {
        segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    }
    return segmenter;
}

/** Length in code units of the grapheme that starts at `offset`. Zero at the end of the text. */
export function graphemeLengthAfter(text: string, offset: number): number {
    if (offset >= text.length) {
        return 0;
    }
    const rest = text.slice(offset);
    const seg = getSegmenter();
    if (seg) {
        for (const first of seg.segment(rest)) {
            return first.segment.length;
        }
    }
    return isHighSurrogate(rest.charCodeAt(0)) && rest.length > 1 && isLowSurrogate(rest.charCodeAt(1)) ? 2 : 1;
}

function isHighSurrogate(code: number): boolean {
    return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
    return code >= 0xdc00 && code <= 0xdfff;
}
