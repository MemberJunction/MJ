/**
 * #3798 — a Debug run's submit-time seed: start paused, and start with remembered breakpoints as step IDs.
 */
import { describe, it, expect } from 'vitest';
import { BuildTaskGraphStartDebug } from '../task-graph/task-graph-submitter';

describe('BuildTaskGraphStartDebug', () => {
    it('is undefined when nothing is asked', () => {
        expect(BuildTaskGraphStartDebug(undefined)).toBeUndefined();
        expect(BuildTaskGraphStartDebug({})).toBeUndefined();
        expect(BuildTaskGraphStartDebug({ paused: false, breakpointStepIDs: [] })).toBeUndefined();
    });

    it('carries paused and the remembered step IDs, dropping non-strings and blanks', () => {
        expect(BuildTaskGraphStartDebug({ paused: true })).toEqual({ paused: true });
        expect(BuildTaskGraphStartDebug({ paused: true, breakpointStepIDs: ['load', '', 7, 'save'] }))
            .toEqual({ paused: true, breakpointStepIDs: ['load', 'save'] });
        expect(BuildTaskGraphStartDebug({ breakpointStepIDs: ['load'] })).toEqual({ breakpointStepIDs: ['load'] });
    });

    it('ignores a breakpointStepIDs value that is not a list', () => {
        expect(BuildTaskGraphStartDebug({ paused: true, breakpointStepIDs: 'load' })).toEqual({ paused: true });
    });
});
