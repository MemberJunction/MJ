import { describe, it, expect } from 'vitest';
import { ClampGanttGridWidth, GANTT_DEFAULT_GRID_WIDTH, SanitizeColumnWidths } from './gantt-layout';

describe('Gantt layout helpers', () => {
    it('clamps grid width into the supported range', () => {
        expect(ClampGanttGridWidth(40)).toBe(160);
        expect(ClampGanttGridWidth(900)).toBe(720);
        expect(ClampGanttGridWidth(340.6)).toBe(341);
        expect(ClampGanttGridWidth(Number.NaN)).toBe(GANTT_DEFAULT_GRID_WIDTH);
    });

    it('drops invalid column widths', () => {
        expect(SanitizeColumnWidths({
            text: 240,
            start_date: 12,
            duration: Number.NaN,
        })).toEqual({ text: 240 });
    });
});
