import { describe, expect, it } from 'vitest';
import {
    RELATED_GRID_BOTTOM_PAD_PX,
    RELATED_GRID_DEFAULT_MAX_PX,
    RELATED_GRID_EMPTY_BODY_PX,
    RELATED_GRID_HEADER_PX,
    RELATED_GRID_ROW_PX,
    RELATED_GRID_TOOLBAR_PX,
    RelatedGridHeightPx,
} from './related-grid-height';

function contentHeight(rowCount: number): number {
    const body = rowCount === 0
        ? RELATED_GRID_EMPTY_BODY_PX
        : RELATED_GRID_HEADER_PX + rowCount * RELATED_GRID_ROW_PX;
    return RELATED_GRID_TOOLBAR_PX + body + RELATED_GRID_BOTTOM_PAD_PX;
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

    it('adds a measured horizontal-scrollbar allowance; the default of 0 keeps the classic height', () => {
        expect(RelatedGridHeightPx(1, null, 0)).toBe(contentHeight(1));
        expect(RelatedGridHeightPx(1, null, 15)).toBe(contentHeight(1) + 15);
        expect(RelatedGridHeightPx(2, undefined, 8)).toBe(contentHeight(2) + 8);
        // The empty state can overflow horizontally too (header wider than the panel).
        expect(RelatedGridHeightPx(0, null, 8)).toBe(contentHeight(0) + 8);
    });

    it('ignores a non-finite or negative scrollbar measurement', () => {
        expect(RelatedGridHeightPx(1, null, Number.NaN)).toBe(contentHeight(1));
        expect(RelatedGridHeightPx(1, null, Number.POSITIVE_INFINITY)).toBe(contentHeight(1));
        expect(RelatedGridHeightPx(1, null, -3)).toBe(contentHeight(1));
    });

    it('keeps the maxHeight cap authoritative over the scrollbar allowance', () => {
        expect(RelatedGridHeightPx(40, RELATED_GRID_DEFAULT_MAX_PX, 15)).toBe(RELATED_GRID_DEFAULT_MAX_PX);
        const tightCap = contentHeight(1) + 4;
        expect(RelatedGridHeightPx(1, tightCap, 15)).toBe(tightCap);
    });
});
