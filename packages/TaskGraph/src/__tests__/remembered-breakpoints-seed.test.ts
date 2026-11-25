/**
 * #3798 — remembered breakpoints arrive as stable step IDs (the spec's tempId) and become this run's task IDs.
 */
import { describe, it, expect } from 'vitest';
import { MapBreakpointStepIDs } from '../TaskGraphService';

describe('MapBreakpointStepIDs', () => {
    const map = new Map([['load', 'task-1'], ['save', 'task-2']]);

    it('maps step IDs to task IDs in order', () => {
        expect(MapBreakpointStepIDs(['save', 'load'], map)).toEqual(['task-2', 'task-1']);
    });

    it('drops steps the workflow no longer has, and duplicates', () => {
        expect(MapBreakpointStepIDs(['load', 'removed-step', 'load'], map)).toEqual(['task-1']);
    });

    it('is empty when nothing is remembered', () => {
        expect(MapBreakpointStepIDs(undefined, map)).toEqual([]);
    });
});
