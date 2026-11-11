import { describe, expect, it } from 'vitest';
import {
    ParseRememberedBreakpoints,
    RememberedBreakpointsKey,
    RememberedBreakpointsStore,
    StepIDOfTask,
    ToggleRememberedStep,
} from './remembered-breakpoints';

describe('remembered breakpoints (#3798)', () => {
    it('keys the setting per workflow agent, case-insensitively', () => {
        expect(RememberedBreakpointsKey('ABC-123')).toBe('TaskGraph.Breakpoints/abc-123');
    });

    it('parses a stored list and ignores junk', () => {
        expect(ParseRememberedBreakpoints('["a","b"]')).toEqual(['a', 'b']);
        expect(ParseRememberedBreakpoints('{not json')).toEqual([]);
        expect(ParseRememberedBreakpoints('[1,"a",""]')).toEqual(['a']);
        expect(ParseRememberedBreakpoints(undefined)).toEqual([]);
    });

    it('toggles a step without duplicating it', () => {
        expect(ToggleRememberedStep(['a'], 'b', true)).toEqual(['a', 'b']);
        expect(ToggleRememberedStep(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
        expect(ToggleRememberedStep(['a', 'b'], 'a', false)).toEqual(['b']);
    });

    it("reads a task's stable step ID from its Configuration", () => {
        expect(StepIDOfTask(JSON.stringify({ stepId: 'load', sequence: 1 }))).toBe('load');
        expect(StepIDOfTask(JSON.stringify({ sequence: 1 }))).toBeNull();
        expect(StepIDOfTask(null)).toBeNull();
    });

    it('stores per user setting through the port', () => {
        const store = new Map<string, string>();
        const remembered = new RememberedBreakpointsStore({ Get: (k) => store.get(k), Set: (k, v) => { store.set(k, v); } });
        expect(remembered.Toggle('wf-1', 'load', true)).toEqual(['load']);
        expect(remembered.Toggle('wf-1', 'save', true)).toEqual(['load', 'save']);
        expect(remembered.Load('wf-1')).toEqual(['load', 'save']);
        expect(remembered.Load('wf-2')).toEqual([]);
    });
});
