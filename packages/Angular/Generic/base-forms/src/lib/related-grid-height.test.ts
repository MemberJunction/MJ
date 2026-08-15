import { describe, expect, it } from 'vitest';
import {
    RELATED_GRID_DEFAULT_MAX_PX,
    RELATED_GRID_EMPTY_BODY_PX,
    RELATED_GRID_HEADER_PX,
    RELATED_GRID_ROW_PX,
    RELATED_GRID_TOOLBAR_PX,
    RelatedGridHeightPx,
} from './related-grid-height';

describe('RelatedGridHeightPx', () => {
    it('sizes to toolbar + header + rows with no floor', () => {
        expect(RelatedGridHeightPx(1)).toBe(
            RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + RELATED_GRID_ROW_PX,
        );
        expect(RelatedGridHeightPx(2)).toBe(
            RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + 2 * RELATED_GRID_ROW_PX,
        );
    });

    it('uses a short empty body when there are no rows', () => {
        expect(RelatedGridHeightPx(0)).toBe(RELATED_GRID_TOOLBAR_PX + RELATED_GRID_EMPTY_BODY_PX);
        expect(RelatedGridHeightPx(Number.NaN)).toBe(RELATED_GRID_TOOLBAR_PX + RELATED_GRID_EMPTY_BODY_PX);
    });

    it('grows without a cap when maxHeight is omitted or null', () => {
        const forty = RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + 40 * RELATED_GRID_ROW_PX;
        expect(RelatedGridHeightPx(40)).toBe(forty);
        expect(RelatedGridHeightPx(40, null)).toBe(forty);
        expect(forty).toBeGreaterThan(RELATED_GRID_DEFAULT_MAX_PX);
    });

    it('caps at maxHeight so the grid can scroll internally', () => {
        expect(RelatedGridHeightPx(40, RELATED_GRID_DEFAULT_MAX_PX)).toBe(RELATED_GRID_DEFAULT_MAX_PX);
        expect(RelatedGridHeightPx(1, RELATED_GRID_DEFAULT_MAX_PX)).toBe(
            RELATED_GRID_TOOLBAR_PX + RELATED_GRID_HEADER_PX + RELATED_GRID_ROW_PX,
        );
    });
});
