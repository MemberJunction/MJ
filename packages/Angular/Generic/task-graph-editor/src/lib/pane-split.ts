/**
 * Two-pane percentage pairs for angular-split, validated before they are stored or restored.
 *
 * A stored 0% or `'*'` pair would come back as a pane the user cannot grab. Falling back to the
 * default is always recoverable, so an unreadable preference is treated as no preference.
 */

export type PaneSizePair = [number, number];

const MIN_USABLE_PERCENT = 5;

export function AsPaneSizePair(value: unknown): PaneSizePair | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [a, b] = value;
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (a < MIN_USABLE_PERCENT || b < MIN_USABLE_PERCENT) return null;
    return [a, b];
}

export function ReadPaneSizePair(raw: string | undefined): PaneSizePair | null {
    if (!raw) return null;
    try {
        return AsPaneSizePair(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function ToPaneSizePair(sizes: readonly (number | '*')[]): PaneSizePair | null {
    if (sizes.length !== 2) return null;
    const [a, b] = sizes;
    return typeof a === 'number' && typeof b === 'number' ? [a, b] : null;
}
