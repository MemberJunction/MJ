import { TextMeasure } from './geometry.types';

const MaxCacheEntries = 2000;

/** Average glyph width estimate, for environments without canvas (jsdom). */
export function EstimateTextMeasure(fontSize: number = 12): TextMeasure {
    return (text: string): number => text.length * fontSize * 0.6;
}

/**
 * Real text widths via an OffscreenCanvas 2D context, cached per string.
 * OffscreenCanvas (not HTMLCanvasElement) so jsdom, which lacks it, falls back
 * silently instead of printing "Not implemented: getContext".
 */
export function CreateTextMeasure(fontFamily: string, fontSize: number = 12): TextMeasure {
    const context = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
    if (!context) {
        return EstimateTextMeasure(fontSize);
    }
    context.font = `${fontSize}px ${fontFamily || 'sans-serif'}`;
    const cache = new Map<string, number>();
    return (text: string): number => {
        const cached = cache.get(text);
        if (cached !== undefined) {
            return cached;
        }
        if (cache.size >= MaxCacheEntries) {
            cache.clear();
        }
        const width = context.measureText(text).width;
        cache.set(text, width);
        return width;
    };
}
