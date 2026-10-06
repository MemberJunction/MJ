/**
 * Tests for the continuation metadata a graph's parent Task row carries.
 *
 * This metadata is the only thing connecting "the graph finished" to "and therefore do X". It is
 * persisted rather than held in memory because the dispatcher instance that *finishes* a graph is
 * routinely not the one that accepted it — a restart, a peer instance, or a graph outliving a deploy
 * all break that assumption. Which means it is read back from a nvarchar column that a user can
 * edit, that older rows predate entirely, and that a future producer may write differently.
 *
 * So the parser is tested against hostile input, not just its own output. Two fields matter enough
 * to be defended individually: a bad `continuation` would route a completed graph nowhere, and a
 * bad `reinvokeDepth` would either disable the chain cap (`NaN >= 5` is false, forever) or trip it
 * on the first hop.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildTaskGraphParentInputPayload,
    ClampReinvokeDepth,
    ParseTaskGraphParentMetadata,
    IsReinvokeCapReached,
    MAX_REINVOKE_DEPTH,
    type TaskGraphParentMetadata,
} from '../TaskGraphService';
import { ParseTaskGraphDebugState } from '../debug-state';

describe('ParseTaskGraphParentMetadata', () => {
    it('round-trips what the service writes', () => {
        const written: TaskGraphParentMetadata = {
            continuation: 'reinvoke',
            reinvokeDepth: 2,
            submittedByAgentRunID: 'run-1',
            submittedByUserID: 'user-1',
            // Persisted because the instance that settles a graph is routinely not the one that
            // accepted it, and the spec is long gone by then — without this every recovery path a
            // flow author draws is dead machinery.
            failureSemantics: 'edges',
        };
        expect(ParseTaskGraphParentMetadata(JSON.stringify(written))).toEqual(written);
    });

    it('defaults the owner to null for a graph written before ownership was recorded', () => {
        // Read by the live-frame layer, which cannot authorize a viewer without knowing whose run
        // they are watching — so it must fail closed rather than see `undefined` and broadcast.
        const raw = JSON.stringify({ continuation: 'message', reinvokeDepth: 0, submittedByAgentRunID: null });
        expect(ParseTaskGraphParentMetadata(raw).submittedByUserID).toBeNull();
    });

    it('preserves the owner, which is what addresses a graph\'s frames', () => {
        const raw = JSON.stringify({
            continuation: 'message', reinvokeDepth: 0, submittedByAgentRunID: null, submittedByUserID: 'user-9',
        });
        expect(ParseTaskGraphParentMetadata(raw).submittedByUserID).toBe('user-9');
    });

    it('preserves the delivery marker', () => {
        // Losing this on a re-read would re-deliver every completed graph on every sweep.
        const raw = JSON.stringify({
            continuation: 'message', reinvokeDepth: 0, submittedByAgentRunID: null,
            continuationDeliveredAt: '2026-08-07T00:00:00.000Z',
        });
        expect(ParseTaskGraphParentMetadata(raw).continuationDeliveredAt).toBe('2026-08-07T00:00:00.000Z');
    });

    it('defaults failureSemantics to block for a graph written before it existed', () => {
        // 'block' is the conservative reading: a failure stays terminal for its dependents unless the
        // graph explicitly said its edges are recovery routes. Defaulting to 'edges' would let an old
        // graph sail past a failure nobody planned around.
        const raw = JSON.stringify({ continuation: 'message', reinvokeDepth: 0, submittedByAgentRunID: null });
        expect(ParseTaskGraphParentMetadata(raw).failureSemantics).toBe('block');
    });

    it.each([null, undefined, ''])('defaults to message for %p', (raw) => {
        // A parent row predating this metadata is a legitimate state, and the right answer to
        // "I don't know what this graph wanted" is still to tell the user their work finished.
        expect(ParseTaskGraphParentMetadata(raw).continuation).toBe('message');
    });

    it('defaults rather than throwing on malformed JSON', () => {
        const meta = ParseTaskGraphParentMetadata('{not json');
        expect(meta.continuation).toBe('message');
        expect(meta.reinvokeDepth).toBe(0);
    });

    it('defaults on JSON that is valid but not an object', () => {
        expect(ParseTaskGraphParentMetadata('"a string"').continuation).toBe('message');
        expect(ParseTaskGraphParentMetadata('42').continuation).toBe('message');
        expect(ParseTaskGraphParentMetadata('null').continuation).toBe('message');
    });

    it('coerces an unrecognized continuation to message', () => {
        // Routing on an unknown mode would drop the completion silently — the one outcome that must
        // never happen, because the work genuinely ran.
        const raw = JSON.stringify({ continuation: 'teleport', reinvokeDepth: 0, submittedByAgentRunID: null });
        expect(ParseTaskGraphParentMetadata(raw).continuation).toBe('message');
    });

    it.each(['reinvoke', 'none', 'message'] as const)('keeps the valid mode %s', (mode) => {
        const raw = JSON.stringify({ continuation: mode, reinvokeDepth: 0, submittedByAgentRunID: null });
        expect(ParseTaskGraphParentMetadata(raw).continuation).toBe(mode);
    });

    it.each([
        ['a string', '"3"'],
        ['null', 'null'],
        ['NaN-producing', '"abc"'],
        ['missing', undefined],
    ])('falls back to depth 0 when reinvokeDepth is %s', (_label, depth) => {
        // A non-finite depth is the dangerous case: `NaN >= MAX` is false, so the cap would never
        // trip and a reinvoke chain could run without bound.
        const raw = JSON.stringify({ continuation: 'reinvoke', reinvokeDepth: JSON.parse(depth ?? 'null'), submittedByAgentRunID: null });
        expect(ParseTaskGraphParentMetadata(raw).reinvokeDepth).toBe(0);
    });

    it('keeps a real depth', () => {
        const raw = JSON.stringify({ continuation: 'reinvoke', reinvokeDepth: 3, submittedByAgentRunID: null });
        expect(ParseTaskGraphParentMetadata(raw).reinvokeDepth).toBe(3);
    });
});

describe('continuationDeliveredAs — how a settlement ended, kept in the row', () => {
    // Written by the same compare-and-swap that sets the timestamp, and read afterwards to tell a
    // settlement that was ANNOUNCED from one that was found too late to announce. Untyped, that
    // distinction survived only in whatever string happened to be in the JSON.
    it('reads the values the claim statement writes', () => {
        // `cancelled` joins them in R2-9: a settlement whose submitting run was cancelled completes
        // its own bookkeeping and deliberately announces nothing. "We chose not to" and "we found it
        // too late" are different facts, and a reader afterwards has to be able to tell them apart.
        for (const outcome of ['delivered', 'expired', 'cancelled']) {
            expect(ParseTaskGraphParentMetadata(`{"continuationDeliveredAs":"${outcome}"}`).continuationDeliveredAs)
                .toBe(outcome);
        }
    });

    it('reads anything else as unknown rather than echoing it', () => {
        // Guarded like `continuation` and `reinvokeDepth`: a hand edit or a future producer can put
        // anything here, and a caller branching on it should see "we do not know" instead of a
        // string that merely is not one of the two it tests for.
        expect(ParseTaskGraphParentMetadata('{"continuationDeliveredAs":"sent"}').continuationDeliveredAs)
            .toBeUndefined();
        expect(ParseTaskGraphParentMetadata('{"continuationDeliveredAs":7}').continuationDeliveredAs)
            .toBeUndefined();
    });

    it('is absent on a graph that has not been delivered', () => {
        expect(ParseTaskGraphParentMetadata('{"continuation":"message"}').continuationDeliveredAs).toBeUndefined();
        expect(ParseTaskGraphParentMetadata(null).continuationDeliveredAs).toBeUndefined();
    });
});

describe('IsReinvokeCapReached', () => {
    const at = (reinvokeDepth: number): TaskGraphParentMetadata =>
        ({ continuation: 'reinvoke', reinvokeDepth, submittedByAgentRunID: null });

    it('is false below the cap', () => {
        expect(IsReinvokeCapReached(at(MAX_REINVOKE_DEPTH - 1))).toBe(false);
    });

    it('is true AT the cap, not one past it', () => {
        // Off-by-one here is the difference between bounding the chain and allowing one extra hop
        // every time — which, being a loop, is not a small difference.
        expect(IsReinvokeCapReached(at(MAX_REINVOKE_DEPTH))).toBe(true);
    });

    it('is true beyond the cap', () => {
        expect(IsReinvokeCapReached(at(MAX_REINVOKE_DEPTH + 10))).toBe(true);
    });

    it('treats a defaulted depth as uncapped', () => {
        expect(IsReinvokeCapReached(ParseTaskGraphParentMetadata(null))).toBe(false);
    });
});

describe('ClampReinvokeDepth — the remote seam cannot buy hops (review finding on the C5 closure)', () => {
    // The cap's entry check is signed and the seed persists verbatim; the remote Submit operation
    // is the one place the seed is caller-supplied. A negative value must clamp to zero, never ride.
    it('clamps negatives to zero — reinvokeDepth: -1000 must not turn a 5-hop cap into 1005', () => {
        expect(ClampReinvokeDepth(-1000)).toBe(0);
        expect(ClampReinvokeDepth(-1)).toBe(0);
        expect(ClampReinvokeDepth(-0)).toBe(0);
    });

    it('floors fractional depths and passes legitimate ones through', () => {
        expect(ClampReinvokeDepth(0)).toBe(0);
        expect(ClampReinvokeDepth(3)).toBe(3);
        expect(ClampReinvokeDepth(2.9)).toBe(2);
    });

    it('treats absent and non-numeric values as "no seed", not zero', () => {
        expect(ClampReinvokeDepth(undefined)).toBeUndefined();
        expect(ClampReinvokeDepth(null)).toBeUndefined();
        expect(ClampReinvokeDepth('7')).toBeUndefined();
        expect(ClampReinvokeDepth(Number.NaN)).toBeUndefined();
        expect(ClampReinvokeDepth(Number.POSITIVE_INFINITY)).toBeUndefined();
    });
});

describe('BuildTaskGraphParentInputPayload — start-paused is written with the row', () => {
    const base = {
        continuation: 'message' as const,
        reinvokeDepth: 0,
        failureSemantics: 'block' as const,
        submittedByAgentRunID: 'run-1',
        submittedByUserID: 'user-9',
    };

    it('omits $.debug unless startPaused is true — a normal run is not a paused run', () => {
        const bag = BuildTaskGraphParentInputPayload(base);
        expect(bag.debug).toBeUndefined();
        expect(ParseTaskGraphDebugState(JSON.stringify(bag)).paused).toBeUndefined();
    });

    it('seeds paused + pausedReason + pausedBy when Debug.paused is set at Submit', () => {
        const bag = BuildTaskGraphParentInputPayload({ ...base, startPaused: true });
        expect(bag.debug).toEqual({
            paused: true,
            pausedReason: 'user',
            pausedBy: 'user-9',
        });
        const debug = ParseTaskGraphDebugState(JSON.stringify(bag));
        expect(debug.paused).toBe(true);
        expect(debug.pausedReason).toBe('user');
        expect(debug.pausedBy).toBe('user-9');
    });

    it('does not write an empty invocation key when none was supplied', () => {
        const bag = BuildTaskGraphParentInputPayload(base);
        expect(bag.invocation).toBeUndefined();
    });
});
