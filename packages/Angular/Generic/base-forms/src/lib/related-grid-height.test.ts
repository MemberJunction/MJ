import { describe, expect, it } from 'vitest';
import {
    RELATED_GRID_MAX_PX,
    RELATED_GRID_MIN_PX,
    RelatedGridHeightPx,
} from './related-grid-height';

describe('RelatedGridHeightPx', () => {
    it('uses the minimum when there is one row or no count', () => {
        expect(RelatedGridHeightPx(1)).toBe(RELATED_GRID_MIN_PX);
        expect(RelatedGridHeightPx(0)).toBe(RELATED_GRID_MIN_PX);
        expect(RelatedGridHeightPx(Number.NaN)).toBe(RELATED_GRID_MIN_PX);
    });

    it('grows with additional rows until the max', () => {
        const three = RelatedGridHeightPx(3);
        expect(three).toBeGreaterThan(RELATED_GRID_MIN_PX);
        expect(three).toBeLessThan(RELATED_GRID_MAX_PX);
        expect(RelatedGridHeightPx(40)).toBe(RELATED_GRID_MAX_PX);
    });
});
