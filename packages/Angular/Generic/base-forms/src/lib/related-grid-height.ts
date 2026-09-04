/** Toolbar row (search + actions). */
export const RELATED_GRID_TOOLBAR_PX = 52;
/** Column header row. */
export const RELATED_GRID_HEADER_PX = 40;
/** One data row. */
export const RELATED_GRID_ROW_PX = 40;
/** 4–5px so the last row's bottom border is not clipped by the grid edge. */
export const RELATED_GRID_BOTTOM_PAD_PX = 5;
/** Empty-state body when there are no rows (inline icon + title, no 200px floor). */
export const RELATED_GRID_EMPTY_BODY_PX = 56;
/** Default cap for nav-related grids. `null` on the input means unbounded. */
export const RELATED_GRID_DEFAULT_MAX_PX = 560;

/**
 * Pixel height for a related-entity grid: toolbar + header + rows + a
 * small bottom pad. No minimum floor. When `maxHeight` is a positive
 * number and the content is taller, the returned height is that cap and
 * AG Grid scrolls inside. Omit / null `maxHeight` to grow with the rows.
 *
 * `scrollbarPx` is the measured height of AG Grid's horizontal scrollbar. AG
 * Grid lays that scrollbar out INSIDE the box it is given, so when the columns
 * overflow the container it eats into the last row unless it is budgeted here.
 * Pass 0 (the default) when there is no horizontal overflow, or when the
 * platform draws overlay scrollbars that take no layout space. The allowance
 * never pushes the result past `maxHeight`.
 */
export function RelatedGridHeightPx(rowCount: number, maxHeight?: number | null, scrollbarPx: number = 0): number {
    const rows = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
    const scrollbar = Number.isFinite(scrollbarPx) ? Math.max(0, Math.round(scrollbarPx)) : 0;
    const body = rows === 0
        ? RELATED_GRID_EMPTY_BODY_PX
        : RELATED_GRID_HEADER_PX + rows * RELATED_GRID_ROW_PX;
    const raw = RELATED_GRID_TOOLBAR_PX + body + RELATED_GRID_BOTTOM_PAD_PX + scrollbar;
    if (typeof maxHeight === 'number' && maxHeight > 0) {
        return Math.min(maxHeight, raw);
    }
    return raw;
}
