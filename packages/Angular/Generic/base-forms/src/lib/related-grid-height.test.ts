import { describe, expect, it } from 'vitest';
import {
    RELATED_GRID_BORDERS_PX,
    RELATED_GRID_BOTTOM_PAD_PX,
    RELATED_GRID_DEFAULT_MAX_PX,
    RELATED_GRID_EMPTY_BODY_PX,
    RELATED_GRID_HEADER_PX,
    RELATED_GRID_HSCROLLBAR_PX,
    RELATED_GRID_ROW_PX,
    RELATED_GRID_TOOLBAR_PX,
    RelatedGridHeightPx,
} from './related-grid-height';

function contentHeight(rowCount: number): number {
    const body = rowCount === 0
        ? RELATED_GRID_EMPTY_BODY_PX
        : RELATED_GRID_HEADER_PX + rowCount * RELATED_GRID_ROW_PX + RELATED_GRID_HSCROLLBAR_PX;
    return RELATED_GRID_TOOLBAR_PX + body + RELATED_GRID_BORDERS_PX + RELATED_GRID_BOTTOM_PAD_PX;
}

describe('RelatedGridHeightPx', () => {
    it('sizes to toolbar + header + rows + bottom pad with no floor', () => {
        expect(RelatedGridHeightPx(1)).toBe(contentHeight(1));
        expect(RelatedGridHeightPx(2)).toBe(contentHeight(2));
    });

    it('uses a short empty body when there are no rows', () => {
        expect(RelatedGridHeightPx(0)).toBe(contentHeight(0));
        expect(RelatedGridHeightPx(Number.NaN)).toBe(contentHeight(0));
    });

    it('reserves horizontal-scrollbar height whenever rows are shown', () => {
        // The bar renders inside the AG Grid viewport; without this reserve a
        // single-row grid clips that row mid-glyph when columns overflow.
        expect(RelatedGridHeightPx(1) - RelatedGridHeightPx(0)).toBe(
            RELATED_GRID_HEADER_PX + RELATED_GRID_ROW_PX + RELATED_GRID_HSCROLLBAR_PX - RELATED_GRID_EMPTY_BODY_PX,
        );
        expect(RelatedGridHeightPx(1)).toBeGreaterThanOrEqual(
            RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + RELATED_GRID_ROW_PX + RELATED_GRID_HSCROLLBAR_PX,
        );
    });

    it('budgets the wrapper and grid borders so rows never lose height to chrome', () => {
        // Measured live: the component wrapper and ag-root-wrapper each carry a
        // 1px top+bottom border. Unbudgeted, the body viewport came up 2px short
        // of one 40px row and AG Grid showed a needless vertical scrollbar.
        expect(RelatedGridHeightPx(1)).toBe(
            RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + RELATED_GRID_ROW_PX
            + RELATED_GRID_HSCROLLBAR_PX + RELATED_GRID_BORDERS_PX + RELATED_GRID_BOTTOM_PAD_PX,
        );
    });

    it('grows without a cap when maxHeight is omitted or null', () => {
        const forty = contentHeight(40);
        expect(RelatedGridHeightPx(40)).toBe(forty);
        expect(RelatedGridHeightPx(40, null)).toBe(forty);
        expect(forty).toBeGreaterThan(RELATED_GRID_DEFAULT_MAX_PX);
    });

    it('caps at maxHeight so the grid can scroll internally', () => {
        expect(RelatedGridHeightPx(40, RELATED_GRID_DEFAULT_MAX_PX)).toBe(RELATED_GRID_DEFAULT_MAX_PX);
        expect(RelatedGridHeightPx(1, RELATED_GRID_DEFAULT_MAX_PX)).toBe(contentHeight(1));
    });

    it('a measured allowance REPLACES the fixed reserve: 0 releases it, a real bar is budgeted exactly', () => {
        // A caller that measured the bar knows better than the reserve. 0 means the columns
        // fit (or the platform draws overlay scrollbars), so nothing is reserved at all.
        const reserved = contentHeight(1); // the unmeasured form, reserve included
        expect(RelatedGridHeightPx(1, null, 0)).toBe(reserved - RELATED_GRID_HSCROLLBAR_PX);
        expect(RelatedGridHeightPx(1, null, 15)).toBe(reserved - RELATED_GRID_HSCROLLBAR_PX + 15);
        expect(RelatedGridHeightPx(2, undefined, 8)).toBe(contentHeight(2) - RELATED_GRID_HSCROLLBAR_PX + 8);
        // The empty state carries no fixed reserve, but it can overflow horizontally too
        // (header wider than the panel), so a measured bar is still budgeted there.
        expect(RelatedGridHeightPx(0, null, 8)).toBe(contentHeight(0) + 8);
    });

    it('a non-finite or negative value is not a measurement and keeps the fixed reserve', () => {
        expect(RelatedGridHeightPx(1, null, Number.NaN)).toBe(contentHeight(1));
        expect(RelatedGridHeightPx(1, null, Number.POSITIVE_INFINITY)).toBe(contentHeight(1));
        expect(RelatedGridHeightPx(1, null, -3)).toBe(contentHeight(1));
    });

    it('keeps the maxHeight cap authoritative over the scrollbar allowance', () => {
        expect(RelatedGridHeightPx(40, RELATED_GRID_DEFAULT_MAX_PX, 15)).toBe(RELATED_GRID_DEFAULT_MAX_PX);
        const tightCap = contentHeight(1) + 4;
        expect(RelatedGridHeightPx(1, tightCap, RELATED_GRID_HSCROLLBAR_PX + 8)).toBe(tightCap);
    });
});
