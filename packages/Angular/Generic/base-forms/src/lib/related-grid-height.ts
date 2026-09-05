/** Toolbar row: 48px content + its 1px bottom border (measured live). */
export const RELATED_GRID_TOOLBAR_PX = 49;
/** Column header row: 48px content + its 1px bottom border (measured live). */
export const RELATED_GRID_HEADER_PX = 49;
/** One data row. */
export const RELATED_GRID_ROW_PX = 40;
/**
 * Wrapper chrome the grid body never gets: the component wrapper's top+bottom
 * border (2px) plus ag-root-wrapper's top+bottom border (2px). Unbudgeted,
 * these four pixels squeeze the body viewport below the row total and AG Grid
 * answers with a needless vertical scrollbar.
 */
export const RELATED_GRID_BORDERS_PX = 4;
/** Small slack so the last row's bottom border is never clipped by the grid edge. */
export const RELATED_GRID_BOTTOM_PAD_PX = 2;
/**
 * AG Grid's horizontal scrollbar. It renders INSIDE the grid viewport, so when
 * columns overflow (the norm for wide related entities inside a form panel) an
 * unbudgeted bar eats the last row's height and clips it mid-glyph. Classic
 * scrollbars are 15–17px; overlay scrollbars cost the reserve as a little slack.
 * Reserved only when rows are shown — with zero rows there is no row to clip.
 */
export const RELATED_GRID_HSCROLLBAR_PX = 17;
/** Empty-state body when there are no rows (inline icon + title, no 200px floor). */
export const RELATED_GRID_EMPTY_BODY_PX = 56;
/** Default cap for nav-related grids. `null` on the input means unbounded. */
export const RELATED_GRID_DEFAULT_MAX_PX = 560;

/**
 * Pixel height for a related-entity grid: toolbar + header + rows + a
 * horizontal-scrollbar reserve + a small bottom pad. No minimum floor.
 * When `maxHeight` is a positive number and the content is taller, the
 * returned height is that cap and AG Grid scrolls inside. Omit / null
 * `maxHeight` to grow with the rows.
 */
export function RelatedGridHeightPx(rowCount: number, maxHeight?: number | null): number {
    const rows = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
    const body = rows === 0
        ? RELATED_GRID_EMPTY_BODY_PX
        : RELATED_GRID_HEADER_PX + rows * RELATED_GRID_ROW_PX + RELATED_GRID_HSCROLLBAR_PX;
    const raw = RELATED_GRID_TOOLBAR_PX + body + RELATED_GRID_BORDERS_PX + RELATED_GRID_BOTTOM_PAD_PX;
    if (typeof maxHeight === 'number' && maxHeight > 0) {
        return Math.min(maxHeight, raw);
    }
    return raw;
}
