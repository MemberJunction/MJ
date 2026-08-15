/** Toolbar row (search + actions). */
export const RELATED_GRID_TOOLBAR_PX = 52;
/** Column header row. */
export const RELATED_GRID_HEADER_PX = 40;
/** One data row. */
export const RELATED_GRID_ROW_PX = 40;
/** Breathing room under the last row so the bottom border is not clipped. */
export const RELATED_GRID_BOTTOM_PAD_PX = 12;
/** Empty-state body when there are no rows (no 200px floor). */
export const RELATED_GRID_EMPTY_BODY_PX = 88;
/** Default cap for nav-related grids. `null` on the input means unbounded. */
export const RELATED_GRID_DEFAULT_MAX_PX = 560;

/**
 * Pixel height for a related-entity grid: toolbar + header + rows + a
 * small bottom pad. No minimum floor. When `maxHeight` is a positive
 * number and the content is taller, the returned height is that cap and
 * AG Grid scrolls inside. Omit / null `maxHeight` to grow with the rows.
 */
export function RelatedGridHeightPx(rowCount: number, maxHeight?: number | null): number {
    const rows = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
    const body = rows === 0
        ? RELATED_GRID_EMPTY_BODY_PX
        : RELATED_GRID_HEADER_PX + rows * RELATED_GRID_ROW_PX;
    const raw = RELATED_GRID_TOOLBAR_PX + body + RELATED_GRID_BOTTOM_PAD_PX;
    if (typeof maxHeight === 'number' && maxHeight > 0) {
        return Math.min(maxHeight, raw);
    }
    return raw;
}
