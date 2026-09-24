import { describe, it, expect } from 'vitest';
import {
    ComposeBreakpointSet,
    EmptyWorkflowDebugOverlay,
    ParentTaskIDFromStepOutput,
    ParseWorkflowDebugOverlay,
    ParseWorkflowInvocation,
} from './workflow-debug-host';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ParseWorkflowDebugOverlay', () => {
    it('returns empty state for missing or garbage input', () => {
        expect(ParseWorkflowDebugOverlay(null)).toEqual(EmptyWorkflowDebugOverlay());
        expect(ParseWorkflowDebugOverlay('{not json').breakpoints).toEqual([]);
        expect(ParseWorkflowDebugOverlay('{}').paused).toBe(false);
    });

    it('reads paused, breakpoints, and overrides from the parent bag', () => {
        const raw = JSON.stringify({
            debug: {
                paused: true,
                pausedAtTaskID: A,
                breakpoints: [A, 'not-a-uuid', B],
                edgeOverrides: { [A]: 'true', nope: 'false', [B]: 'maybe' },
            },
        });
        const overlay = ParseWorkflowDebugOverlay(raw);
        expect(overlay.paused).toBe(true);
        expect(overlay.pausedAtTaskID).toBe(A);
        expect(overlay.breakpoints).toEqual([A, B]);
        expect(overlay.edgeOverrides).toEqual({ [A]: 'true' });
    });
});

describe('ParentTaskIDFromStepOutput', () => {
    it('reads parentTaskID and refuses garbage', () => {
        expect(ParentTaskIDFromStepOutput(JSON.stringify({ parentTaskID: A }))).toBe(A);
        expect(ParentTaskIDFromStepOutput({ parentTaskID: A, submitted: true })).toBe(A);
        expect(ParentTaskIDFromStepOutput('{"submitted":true}')).toBeNull();
        expect(ParentTaskIDFromStepOutput('{')).toBeNull();
    });
});

describe('ParseWorkflowInvocation', () => {
    it('reads data/context and ignores a bag with none', () => {
        expect(ParseWorkflowInvocation(JSON.stringify({ invocation: { data: { a: 1 }, context: {} } }))).toEqual({
            data: { a: 1 },
            context: {},
        });
        expect(ParseWorkflowInvocation('{}')).toEqual({});
    });
});

describe('ComposeBreakpointSet', () => {
    it('unions when enabling and differences when disabling, case-insensitively', () => {
        expect(ComposeBreakpointSet([], A, true)).toEqual([A]);
        expect(ComposeBreakpointSet([A], A.toUpperCase(), true)).toEqual([A]);
        expect(ComposeBreakpointSet([A, B], A.toUpperCase(), false)).toEqual([B]);
    });
});
