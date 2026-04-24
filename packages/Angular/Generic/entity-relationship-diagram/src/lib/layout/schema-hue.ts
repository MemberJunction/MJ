/**
 * Deterministic per-schema accent hue.
 *
 * OKLCH hues are distributed across the wheel so different schema names get
 * visually distinct colors, and the mapping is stable — the same schema name
 * always returns the same hue so users don't see colors shift between reloads.
 *
 * This is one of the rare places in the codebase that intentionally uses a
 * non-token color: categorical/data-viz palettes must remain distinct
 * regardless of theme (per the design-token guide).  The lightness and chroma
 * are chosen so the hue reads cleanly on both light and dark surfaces.
 */

/** Return an OKLCH color string for a given schema name. */
export function schemaHueColor(schemaName: string, theme: 'light' | 'dark'): string {
    const hue = hueFor(schemaName);
    if (theme === 'dark') return `oklch(0.70 0.12 ${hue})`;
    return `oklch(0.58 0.14 ${hue})`;
}

/** Return a soft fill color suitable for a schema band background. */
export function schemaBandFill(schemaName: string, theme: 'light' | 'dark'): string {
    const hue = hueFor(schemaName);
    if (theme === 'dark') return `oklch(0.30 0.04 ${hue} / 0.35)`;
    return `oklch(0.97 0.02 ${hue})`;
}

/** The numeric hue (0–360) used internally.  Exposed for testing. */
export function hueFor(schemaName: string): number {
    if (!schemaName) return 210;
    // FNV-1a 32-bit hash, mapped to 0..359.
    let hash = 0x811c9dc5;
    for (let i = 0; i < schemaName.length; i++) {
        hash ^= schemaName.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % 360;
}
