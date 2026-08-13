/**
 * The debug/runner control model: parsing the durable `$.debug` bag, and the claim-gate decision
 * the dispatcher applies every pass. Pure functions, tested against the shapes hand edits and JSON
 * round-trips actually produce — a wrong reading here gates real work.
 */
import { describe, expect, it } from 'vitest';
import {
    DecideClaimGate,
    OverrideVerdictFor,
    ParseTaskGraphDebugState,
} from '../debug-state';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const EDGE = '44444444-4444-4444-4444-444444444444';

function payload(debug: unknown): string {
    return JSON.stringify({ continuation: 'message', debug });
}

describe('ParseTaskGraphDebugState', () => {
    it('reads "not being debugged" from null, garbage, and missing bags alike', () => {
        expect(ParseTaskGraphDebugState(null)).toEqual({});
        expect(ParseTaskGraphDebugState(undefined)).toEqual({});
        expect(ParseTaskGraphDebugState('not json')).toEqual({});
        expect(ParseTaskGraphDebugState('{}')).toEqual({});
        expect(ParseTaskGraphDebugState(payload(undefined))).toEqual({});
        expect(ParseTaskGraphDebugState(payload('a string'))).toEqual({});
    });

    it('accepts both boolean true and the string "true" for paused — JSON_MODIFY and hand edits produce both', () => {
        expect(ParseTaskGraphDebugState(payload({ paused: true })).paused).toBe(true);
        expect(ParseTaskGraphDebugState(payload({ paused: 'true' })).paused).toBe(true);
        expect(ParseTaskGraphDebugState(payload({ paused: false })).paused).toBeUndefined();
        expect(ParseTaskGraphDebugState(payload({ paused: 'yes' })).paused).toBeUndefined();
    });

    it('keeps only UUID-shaped breakpoints — a hand-edited stray string must not gate claiming', () => {
        const state = ParseTaskGraphDebugState(payload({ breakpoints: [A, 'not-a-uuid', 42, B] }));
        expect(state.breakpoints).toEqual([A, B]);
    });

    it('accepts step targets one, wave, and a task id — and drops anything else', () => {
        expect(ParseTaskGraphDebugState(payload({ step: 'one' })).step).toBe('one');
        expect(ParseTaskGraphDebugState(payload({ step: 'wave' })).step).toBe('wave');
        expect(ParseTaskGraphDebugState(payload({ step: A })).step).toBe(A);
        expect(ParseTaskGraphDebugState(payload({ step: 'everything' })).step).toBeUndefined();
    });

    it('reads skipBreakpointTaskID so Continue-from-breakpoint survives a process bounce', () => {
        expect(ParseTaskGraphDebugState(payload({ skipBreakpointTaskID: A })).skipBreakpointTaskID).toBe(A);
        expect(ParseTaskGraphDebugState(payload({})).skipBreakpointTaskID).toBeUndefined();
    });

    it('keeps only true/false edge overrides keyed by UUID', () => {
        const state = ParseTaskGraphDebugState(payload({
            edgeOverrides: { [EDGE]: 'false', 'not-a-uuid': 'false', [A]: 'maybe' },
        }));
        expect(state.edgeOverrides).toEqual({ [EDGE]: 'false' });
        expect(OverrideVerdictFor(state, EDGE)).toBe('false');
        expect(OverrideVerdictFor(state, A)).toBeUndefined();
    });
});

describe('DecideClaimGate', () => {
    it('is open with no debug state', () => {
        expect(DecideClaimGate({}, [A, B])).toEqual({ mode: 'open' });
    });

    it('is closed while paused with no step allowance', () => {
        expect(DecideClaimGate({ paused: true }, [A, B])).toEqual({ mode: 'closed' });
    });

    it('pause wins over breakpoints — a breakpoint inside a paused graph is moot', () => {
        expect(DecideClaimGate({ paused: true, breakpoints: [A] }, [A])).toEqual({ mode: 'closed' });
    });

    it("step 'one' releases exactly the first eligible task", () => {
        expect(DecideClaimGate({ paused: true, step: 'one' }, [B, A])).toEqual({ mode: 'step', taskIDs: [B] });
        expect(DecideClaimGate({ paused: true, step: 'one' }, [])).toEqual({ mode: 'closed' });
    });

    it("step 'wave' releases the whole frontier", () => {
        expect(DecideClaimGate({ paused: true, step: 'wave' }, [A, B, C])).toEqual({ mode: 'step', taskIDs: [A, B, C] });
    });

    it('a named step releases only itself, and only when eligible', () => {
        expect(DecideClaimGate({ paused: true, step: B }, [A, B])).toEqual({ mode: 'step', taskIDs: [B] });
        // Not eligible: releasing an arbitrary other task instead would run work nobody asked for.
        expect(DecideClaimGate({ paused: true, step: C }, [A, B])).toEqual({ mode: 'closed' });
    });

    it('the FIRST eligible task with a breakpoint pauses the graph — siblings do not start either', () => {
        expect(DecideClaimGate({ breakpoints: [B] }, [A, B, C])).toEqual({ mode: 'breakpoint', taskID: B });
    });

    it('a breakpoint on a task that is not yet eligible gates nothing', () => {
        expect(DecideClaimGate({ breakpoints: [C] }, [A, B])).toEqual({ mode: 'open' });
    });

    it('Continue from a breakpoint skips that breakpoint once so the stopped task can run', () => {
        expect(DecideClaimGate({ breakpoints: [A], skipBreakpointTaskID: A }, [A])).toEqual({ mode: 'open' });
    });

    it('Continue from A still stops at a different eligible breakpoint', () => {
        expect(DecideClaimGate({ breakpoints: [A, B], skipBreakpointTaskID: A }, [A, B])).toEqual({
            mode: 'breakpoint',
            taskID: B,
        });
    });

    it('matches breakpoints and named steps case-insensitively', () => {
        expect(DecideClaimGate({ breakpoints: [A.toUpperCase()] }, [A])).toEqual({ mode: 'breakpoint', taskID: A });
        expect(DecideClaimGate({ paused: true, step: A.toUpperCase() }, [A])).toEqual({ mode: 'step', taskIDs: [A] });
    });
});
