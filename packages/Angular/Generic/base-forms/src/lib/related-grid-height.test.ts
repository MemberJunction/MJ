import { describe, expect, it } from 'vitest';
import {
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
});
