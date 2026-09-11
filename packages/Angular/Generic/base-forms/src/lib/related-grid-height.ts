/** Toolbar row: 48px content + its 1px bottom border (measured live). */
export const RELATED_GRID_TOOLBAR_PX = 49;
/**
 * Column header row as AG Grid's theme renders it: `--ag-header-height` (48px in v35's
 * default theme) + its 1px bottom border (measured live). This was 40px, which left every
 * related grid 9px short and clipped the last row's bottom border even with no horizontal
 * overflow.
 */
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
 *
 * This is the FALLBACK reserve, used only by callers that do not measure the bar.
 * `<mj-explorer-entity-data-grid>` measures it from the DOM after layout and passes
 * the real height (0 when the columns fit, or on overlay-scrollbar platforms) as
 * `scrollbarPx`, which replaces this reserve entirely. Reserved only when rows are
 * shown — with zero rows there is no row to clip.
 */
export const RELATED_GRID_HSCROLLBAR_PX = 17;
/** Empty-state body when there are no rows (inline icon + title, no 200px floor). */
export const RELATED_GRID_EMPTY_BODY_PX = 56;
/** Default cap for nav-related grids. `null` on the input means unbounded. */
export const RELATED_GRID_DEFAULT_MAX_PX = 560;

/**
 * Pixel height for a related-entity grid: toolbar + header + rows + border
 * chrome + a horizontal-scrollbar allowance + a small bottom pad. No minimum
 * floor. When `maxHeight` is a positive number and the content is taller, the
 * returned height is that cap and AG Grid scrolls inside. Omit / null
 * `maxHeight` to grow with the rows.
 *
 * `scrollbarPx` is the MEASURED height of AG Grid's horizontal scrollbar. AG Grid
 * lays that scrollbar out INSIDE the box it is given, so when the columns overflow
 * the container it eats into the last row unless it is budgeted here. A caller that
 * has measured it passes the number — 0 when there is no horizontal overflow, or
 * when the platform draws overlay scrollbars that take no layout space — and that
 * measurement replaces the fixed reserve. A caller that has not measured it omits
 * the argument and gets `RELATED_GRID_HSCROLLBAR_PX` whenever rows are shown, so
 * an unmeasured grid never clips a row on a classic-scrollbar platform. A negative
 * or non-finite value is not a measurement and falls back the same way. The
 * allowance never pushes the result past `maxHeight`.
 */
export function RelatedGridHeightPx(rowCount: number, maxHeight?: number | null, scrollbarPx?: number): number {
    const rows = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
    const measured = typeof scrollbarPx === 'number' && Number.isFinite(scrollbarPx) && scrollbarPx >= 0;
    const scrollbar = measured
        ? Math.round(scrollbarPx)
        : (rows === 0 ? 0 : RELATED_GRID_HSCROLLBAR_PX);
    const body = rows === 0
        ? RELATED_GRID_EMPTY_BODY_PX
        : RELATED_GRID_HEADER_PX + rows * RELATED_GRID_ROW_PX;
    const raw = RELATED_GRID_TOOLBAR_PX + body + RELATED_GRID_BORDERS_PX + RELATED_GRID_BOTTOM_PAD_PX + scrollbar;
    if (typeof maxHeight === 'number' && maxHeight > 0) {
        return Math.min(maxHeight, raw);
    }
    return raw;
}
