import { describe, it, expect } from 'vitest';
import {
    BeforeZoomChangeEventArgs,
    GanttZoomLevelFromPercent,
    GanttZoomPercent,
    IsGanttZoomLevelName,
    NextZoomInLevel,
    NextZoomOutLevel,
} from './gantt-zoom';

describe('Gantt zoom helpers', () => {
    it('maps week to 100 percent and month to 75', () => {
        expect(GanttZoomPercent('week')).toBe(100);
        expect(GanttZoomPercent('month')).toBe(75);
    });

    it('picks the nearest named level from a persisted percent', () => {
        expect(GanttZoomLevelFromPercent(75)).toBe('month');
        expect(GanttZoomLevelFromPercent(100)).toBe('week');
        expect(GanttZoomLevelFromPercent(40)).toBe('year');
    });

    it('walks in toward hour and out toward year', () => {
        expect(NextZoomInLevel('month')).toBe('week');
        expect(NextZoomOutLevel('month')).toBe('quarter');
        expect(NextZoomInLevel('hour')).toBeNull();
        expect(NextZoomOutLevel('year')).toBeNull();
    });

    it('rejects unknown level names', () => {
        expect(IsGanttZoomLevelName('month')).toBe(true);
        expect(IsGanttZoomLevelName('decade')).toBe(false);
    });

    it('lets a BeforeZoomChange listener cancel', () => {
        const event = new BeforeZoomChangeEventArgs('week', 'month', 100, 75);
        expect(event.Cancel).toBe(false);
        event.Cancel = true;
        expect(event.Cancel).toBe(true);
    });
});
