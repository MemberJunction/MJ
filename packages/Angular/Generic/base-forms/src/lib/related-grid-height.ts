/** Toolbar row (search + actions). */
export const RELATED_GRID_TOOLBAR_PX = 52;
/** Column header row. */
export const RELATED_GRID_HEADER_PX = 40;
/** One data row. */
export const RELATED_GRID_ROW_PX = 40;
/** Always tall enough for the toolbar plus one row. */
export const RELATED_GRID_MIN_PX = 200;
/** Cap so a large related list scrolls inside the grid. */
export const RELATED_GRID_MAX_PX = 560;

/**
 * Pixel height for a related-entity grid that sizes to its rows.
 * Used in left-nav / right-nav so the grid is not `height: 100%` of a
 * leftover flex slot that can collapse to zero under a form header.
 */
export function RelatedGridHeightPx(rowCount: number): number {
    const rows = Number.isFinite(rowCount) ? Math.max(1, Math.floor(rowCount)) : 1;
    const raw = RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + rows * RELATED_GRID_ROW_PX;
    return Math.min(RELATED_GRID_MAX_PX, Math.max(RELATED_GRID_MIN_PX, raw));
}
