/**
 * Tests for `EntityActionDispatchGuard`.
 *
 * The two failures this exists to prevent look nothing alike from the outside but share one key:
 *
 * 1. An after-save action that writes back to the record that triggered it re-fires itself
 *    forever. It must be **suppressed** — deferring it would only turn an infinite loop into an
 *    infinite sequence.
 * 2. A record saved ten times in a second launches ten overlapping runs of the same action. Those
 *    must **coalesce** to one pending rerun, latest wins, so the rerun reads the settled state.
 *
 * The distinction between them is *where the dispatch came from*, which is why origin is tracked
 * through the async call tree rather than inferred from timing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BuildEntityActionDispatchKey, EntityActionDispatchGuard } from '../entity-actions/EntityActionDispatchGuard';

const guard = () => EntityActionDispatchGuard.Instance;

const KEY_A = BuildEntityActionDispatchKey('action-1', 'entity-1', 'record-1');
const KEY_OTHER_RECORD = BuildEntityActionDispatchKey('action-1', 'entity-1', 'record-2');
const KEY_OTHER_ACTION = BuildEntityActionDispatchKey('action-2', 'entity-1', 'record-1');

/** A promise a test can settle by hand, so overlap is deterministic rather than timing-dependent. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
    guard().ResetForTesting();
});

describe('BuildEntityActionDispatchKey', () => {
    it('separates the same action on different records', () => {
        // Two invoices changing at once are unrelated events; blocking one on the other would make
        // an unrelated user's save wait.
        expect(KEY_A).not.toBe(KEY_OTHER_RECORD);
    });

    it('separates different actions on the same record', () => {
        expect(KEY_A).not.toBe(KEY_OTHER_ACTION);
    });

    it('is case-insensitive, because UUID casing varies by source', () => {
        expect(BuildEntityActionDispatchKey('ABC', 'DEF', 'GHI')).toBe(BuildEntityActionDispatchKey('abc', 'def', 'ghi'));
    });
});

describe('self-trigger suppression', () => {
    it('drops a dispatch that re-enters its own key', async () => {
        // The enrich-and-write-back shape: the action saves the record that triggered it.
        const inner: string[] = [];
        let innerOutcome = '';

        await guard().Dispatch(KEY_A, async () => {
            inner.push('outer ran');
            innerOutcome = await guard().Dispatch(KEY_A, async () => { inner.push('inner ran'); });
        });

        expect(innerOutcome).toBe('Suppressed');
        expect(inner).toEqual(['outer ran']);
    });

    it('suppresses re-entry from arbitrarily deep inside the action', async () => {
        // The origin travels through every await — an agent run, its sub-agents, an action they
        // invoke — without any call site passing it down.
        let outcome = '';
        await guard().Dispatch(KEY_A, async () => {
            await tick();
            await (async () => {
                await tick();
                outcome = await guard().Dispatch(KEY_A, async () => { /* never */ });
            })();
        });
        expect(outcome).toBe('Suppressed');
    });

    it('does NOT suppress a different record — that is a genuinely unrelated event', async () => {
        let outcome = '';
        let ran = false;
        await guard().Dispatch(KEY_A, async () => {
            outcome = await guard().Dispatch(KEY_OTHER_RECORD, async () => { ran = true; });
        });
        expect(outcome).toBe('Ran');
        expect(ran).toBe(true);
    });

    it('does NOT suppress a different action on the same record', async () => {
        // Action A writing the record legitimately triggers action B. Only A must not re-enter A.
        let outcome = '';
        await guard().Dispatch(KEY_A, async () => {
            outcome = await guard().Dispatch(KEY_OTHER_ACTION, async () => { /* runs */ });
        });
        expect(outcome).toBe('Ran');
    });

    it('detects re-entry through an intervening action — chains are tracked, not just the top', async () => {
        // A saves record 2, which fires B, whose work saves record 1 again. A must still be seen.
        let outcome = '';
        await guard().Dispatch(KEY_A, async () => {
            await guard().Dispatch(KEY_OTHER_ACTION, async () => {
                outcome = await guard().Dispatch(KEY_A, async () => { /* never */ });
            });
        });
        expect(outcome).toBe('Suppressed');
    });

    it('releases the origin once the action finishes, so the next real change fires normally', async () => {
        await guard().Dispatch(KEY_A, async () => { /* done */ });
        let ran = false;
        expect(await guard().Dispatch(KEY_A, async () => { ran = true; })).toBe('Ran');
        expect(ran).toBe(true);
    });
});

describe('per-record coalescing', () => {
    it('folds an overlapping dispatch into one rerun instead of stacking', async () => {
        const gate = deferred();
        const runs: number[] = [];
        let n = 0;

        const first = guard().Dispatch(KEY_A, async () => { runs.push(++n); await gate.promise; });
        await tick();

        // Three saves land while the first run is still going.
        const outcomes = await Promise.all([
            guard().Dispatch(KEY_A, async () => { runs.push(++n); }),
            guard().Dispatch(KEY_A, async () => { runs.push(++n); }),
            guard().Dispatch(KEY_A, async () => { runs.push(++n); }),
        ]);

        gate.resolve();
        await first;

        expect(outcomes).toEqual(['Coalesced', 'Coalesced', 'Coalesced']);
        // One original + exactly one rerun — not four.
        expect(runs).toEqual([1, 2]);
    });

    it('runs the LATEST arrival, not the first one queued', async () => {
        // The newest dispatch reflects the newest state of the record; an older queued closure
        // would re-read the same final row anyway, so keeping it would just cost a run.
        const gate = deferred();
        const ran: string[] = [];

        const first = guard().Dispatch(KEY_A, async () => { ran.push('first'); await gate.promise; });
        await tick();
        void guard().Dispatch(KEY_A, async () => { ran.push('stale'); });
        void guard().Dispatch(KEY_A, async () => { ran.push('latest'); });

        gate.resolve();
        await first;

        expect(ran).toEqual(['first', 'latest']);
    });

    it('keeps collapsing arrivals that land DURING the rerun', async () => {
        // Otherwise a sustained burst would alternate run / queue / run and never actually coalesce.
        const firstGate = deferred();
        const rerunGate = deferred();
        const ran: string[] = [];

        const first = guard().Dispatch(KEY_A, async () => { ran.push('first'); await firstGate.promise; });
        await tick();
        void guard().Dispatch(KEY_A, async () => { ran.push('rerun'); await rerunGate.promise; });

        firstGate.resolve();
        await tick();

        // Two more land while the rerun is in flight.
        const late = await Promise.all([
            guard().Dispatch(KEY_A, async () => { ran.push('late-a'); }),
            guard().Dispatch(KEY_A, async () => { ran.push('late-b'); }),
        ]);
        expect(late).toEqual(['Coalesced', 'Coalesced']);

        rerunGate.resolve();
        await first;

        expect(ran).toEqual(['first', 'rerun', 'late-b']);
    });

    it('resolves the original dispatch only after every coalesced rerun has settled', async () => {
        // A caller that awaits the dispatch is awaiting the whole chain, not just the first run.
        const gate = deferred();
        let rerunFinished = false;

        const first = guard().Dispatch(KEY_A, async () => { await gate.promise; });
        await tick();
        void guard().Dispatch(KEY_A, async () => { await tick(); rerunFinished = true; });

        gate.resolve();
        await first;
        expect(rerunFinished).toBe(true);
    });

    it('does not coalesce across records', async () => {
        const gate = deferred();
        let otherRan = false;

        const first = guard().Dispatch(KEY_A, async () => { await gate.promise; });
        await tick();
        const outcome = await guard().Dispatch(KEY_OTHER_RECORD, async () => { otherRan = true; });

        gate.resolve();
        await first;

        expect(outcome).toBe('Ran');
        expect(otherRan).toBe(true);
    });

    it('frees the key after a failing run, so the record is not wedged forever', async () => {
        await expect(guard().Dispatch(KEY_A, async () => { throw new Error('action exploded'); }))
            .rejects.toThrow('action exploded');
        expect(guard().IsInFlight(KEY_A)).toBe(false);

        let ran = false;
        expect(await guard().Dispatch(KEY_A, async () => { ran = true; })).toBe('Ran');
        expect(ran).toBe(true);
    });
});

describe('inspection', () => {
    it('reports in-flight only while a run is executing', async () => {
        const gate = deferred();
        expect(guard().IsInFlight(KEY_A)).toBe(false);

        const first = guard().Dispatch(KEY_A, async () => { await gate.promise; });
        await tick();
        expect(guard().IsInFlight(KEY_A)).toBe(true);

        gate.resolve();
        await first;
        expect(guard().IsInFlight(KEY_A)).toBe(false);
    });

    it('reports self-triggered only from inside the action', async () => {
        expect(guard().IsSelfTriggered(KEY_A)).toBe(false);
        await guard().Dispatch(KEY_A, async () => {
            expect(guard().IsSelfTriggered(KEY_A)).toBe(true);
            expect(guard().IsSelfTriggered(KEY_OTHER_RECORD)).toBe(false);
        });
        expect(guard().IsSelfTriggered(KEY_A)).toBe(false);
    });

    it('is NOT self-triggered from a merely concurrent run — that is overlap, not re-entry', async () => {
        // The two are handled oppositely, so conflating them would either loop forever or drop work.
        const gate = deferred();
        const first = guard().Dispatch(KEY_A, async () => { await gate.promise; });
        await tick();
        expect(guard().IsSelfTriggered(KEY_A)).toBe(false);
        gate.resolve();
        await first;
    });
});
