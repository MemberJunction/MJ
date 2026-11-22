/**
 * Loop semantics on the durable dispatcher.
 *
 * A loop is the one step whose size is unknowable until the steps before it have run, which is why
 * it stays a single Task row and iterates inside its own execution. That makes these rules the only
 * thing standing between "ran the right number of times" and a class of failures that all look like
 * success: a collection that silently resolved to nothing, a cap that quietly truncated the work, a
 * parallel run that scrambled result order, a failed iteration absorbed into a green outcome.
 *
 * Each test below names the specific wrong-but-plausible behaviour it rules out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LimitsConfigResolver } from '@memberjunction/core';
import {
    RunForEachLoop,
    RunWhileLoop,
    DEFAULT_FOREACH_MAX_ITERATIONS,
    DEFAULT_WHILE_MAX_ITERATIONS,
    type LoopBodyInvoker,
} from '../TaskLoopExecutor';
import type { ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';

/** Records what each iteration was handed, so binding and ordering can be asserted. */
const recorder = (behaviour?: (index: number) => { Success: boolean; ErrorMessage?: string }) => {
    const seen: Array<{ Index: number; Bindings: Record<string, unknown> }> = [];
    const invoke: LoopBodyInvoker = async ({ Index, Bindings }) => {
        seen.push({ Index, Bindings });
        const b = behaviour?.(Index) ?? { Success: true };
        return { Success: b.Success, Output: `out-${Index}`, ErrorMessage: b.ErrorMessage };
    };
    return { seen, invoke };
};

describe('RunForEachLoop', () => {
    it('runs once per item and binds the item and index', async () => {
        const { seen, invoke } = recorder();
        const op: ForEachOperation = { collectionPath: 'static:["a","b","c"]' };
        const result = await RunForEachLoop(op, {}, invoke);

        expect(result.Success).toBe(true);
        expect(result.Output.iterations).toBe(3);
        expect(seen.map((s) => s.Bindings)).toEqual([
            { item: 'a', index: 0 },
            { item: 'b', index: 1 },
            { item: 'c', index: 2 },
        ]);
    });

    it('honours custom item and index variable names', async () => {
        const { seen, invoke } = recorder();
        const op: ForEachOperation = { collectionPath: 'static:[1,2]', itemVariable: 'number', indexVariable: 'i' };
        await RunForEachLoop(op, {}, invoke);
        expect(seen[0].Bindings).toEqual({ number: 1, i: 0 });
    });

    it('reads the collection from the payload', async () => {
        const { seen, invoke } = recorder();
        await RunForEachLoop({ collectionPath: 'payload.accounts' }, { payload: { accounts: ['x', 'y'] } }, invoke);
        expect(seen).toHaveLength(2);
    });

    it('FAILS when the collection does not resolve, rather than reporting zero iterations', async () => {
        // "Iterated over nothing" and "could not find the thing to iterate over" look identical
        // downstream, and only one of them is a bug the author needs to hear about.
        const { seen, invoke } = recorder();
        const result = await RunForEachLoop({ collectionPath: 'payload.missing' }, { payload: {} }, invoke);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('did not resolve to a list');
        expect(seen).toHaveLength(0);
    });

    it('caps at maxIterations', async () => {
        const { seen, invoke } = recorder();
        await RunForEachLoop({ collectionPath: 'static:[1,2,3,4,5]', maxIterations: 2 }, {}, invoke);
        expect(seen).toHaveLength(2);
    });

    it('treats maxIterations of 0 as ZERO iterations, matching the in-run engine', () => {
        // The operation types' JSDoc claimed 0 meant unlimited, but both engines have always computed
        // Math.min(collection.length, maxIterations ?? default) — so zero has always meant zero. This
        // engine replaces that one, and running a loop its author had effectively disabled would be a
        // silent behaviour change. Parity beats the comment; the comment was corrected instead.
        const { seen, invoke } = recorder();
        return RunForEachLoop({ collectionPath: 'static:[1,2,3]', maxIterations: 0 }, {}, invoke)
            .then(() => expect(seen).toHaveLength(0));
    });

    beforeEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('exposes 1,000,000 as the default ForEach and While loop ceilings from LimitsConfigResolver', () => {
        expect(DEFAULT_FOREACH_MAX_ITERATIONS).toBe(1_000_000);
        expect(DEFAULT_WHILE_MAX_ITERATIONS).toBe(1_000_000);
        expect(LimitsConfigResolver.Resolve().Limits.ForEachMaxIterations).toBe(1_000_000);
        expect(LimitsConfigResolver.Resolve().Limits.WhileLoopMaxIterations).toBe(1_000_000);
    });

    it('applies a default ceiling from LimitsConfigResolver when none is set on the operation', async () => {
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({ ForEachMaxIterations: 25 });
        const big = `static:${JSON.stringify(Array.from({ length: 30 }, (_, i) => i))}`;
        const { seen, invoke } = recorder();
        await RunForEachLoop({ collectionPath: big }, {}, invoke);
        expect(seen).toHaveLength(25);
    });

    it('stops at the first failure by default', async () => {
        const { seen, invoke } = recorder((i) => ({ Success: i !== 1, ErrorMessage: 'boom' }));
        const result = await RunForEachLoop({ collectionPath: 'static:[1,2,3]' }, {}, invoke);
        expect(seen).toHaveLength(2);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Iteration 2 failed');
    });

    it('keeps going with continueOnError, and still reports the failures', async () => {
        // Succeeding is what the setting asks for; hiding how many failed is not.
        const { seen, invoke } = recorder((i) => ({ Success: i !== 1, ErrorMessage: 'boom' }));
        const result = await RunForEachLoop({ collectionPath: 'static:[1,2,3]', continueOnError: true }, {}, invoke);
        expect(seen).toHaveLength(3);
        expect(result.Success).toBe(true);
        expect(result.Output.failed).toBe(1);
        expect(result.Output.succeeded).toBe(2);
    });

    it('keeps results in ITERATION order when running in parallel', async () => {
        // An output mapping that writes results[index] and a downstream step that reads it both
        // assume position means iteration number. Completion order would scramble that silently.
        const invoke: LoopBodyInvoker = async ({ Index }) => {
            await new Promise((r) => setTimeout(r, Index === 0 ? 20 : 1)); // first finishes last
            return { Success: true, Output: `out-${Index}` };
        };
        const op: ForEachOperation = { collectionPath: 'static:[0,1,2]', executionMode: 'parallel', maxConcurrency: 3 };
        const result = await RunForEachLoop(op, {}, invoke);
        expect(result.Output.results).toEqual(['out-0', 'out-1', 'out-2']);
    });

    it('respects maxConcurrency in parallel mode', async () => {
        let inFlight = 0;
        let peak = 0;
        const invoke: LoopBodyInvoker = async () => {
            peak = Math.max(peak, ++inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
            return { Success: true };
        };
        const op: ForEachOperation = { collectionPath: 'static:[1,2,3,4,5,6]', executionMode: 'parallel', maxConcurrency: 2 };
        await RunForEachLoop(op, {}, invoke);
        expect(peak).toBeLessThanOrEqual(2);
    });
});

describe('RunWhileLoop', () => {
    it('runs while the condition holds', async () => {
        const { seen, invoke } = recorder();
        const op: WhileOperation = { condition: 'n < 3' };
        let n = 0;
        const result = await RunWhileLoop(op, () => ({ Success: true, Value: n++ < 3 }), invoke);
        expect(seen).toHaveLength(3);
        expect(result.Success).toBe(true);
    });

    it('binds the attempt counter', async () => {
        const { seen, invoke } = recorder();
        let n = 0;
        await RunWhileLoop({ condition: 'x', itemVariable: 'try' }, () => ({ Success: true, Value: n++ < 2 }), invoke);
        expect(seen.map((s) => s.Bindings)).toEqual([{ try: 0 }, { try: 1 }]);
    });

    it('FAILS on an unevaluable condition instead of ending quietly', async () => {
        // Treating it as false would end the loop and report success — indistinguishable from the
        // loop having finished its work.
        const { invoke } = recorder();
        const result = await RunWhileLoop(
            { condition: 'nonsense(' },
            () => ({ Success: false, ErrorMessage: 'bad expression' }),
            invoke,
        );
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('bad expression');
    });

    it('stops at its ceiling rather than running forever', async () => {
        const { seen, invoke } = recorder();
        await RunWhileLoop({ condition: 'true', maxIterations: 4 }, () => ({ Success: true, Value: true }), invoke);
        expect(seen).toHaveLength(4);
    });

    it('stops at the first failure by default', async () => {
        const { invoke } = recorder((i) => ({ Success: i !== 0, ErrorMessage: 'boom' }));
        const result = await RunWhileLoop({ condition: 'true', maxIterations: 5 }, () => ({ Success: true, Value: true }), invoke);
        expect(result.Success).toBe(false);
        expect(result.Output.iterations).toBe(1);
    });
});

describe('a While loop must be able to reach its exit condition', () => {
    it('stops as soon as the condition flips, rather than burning every iteration', async () => {
        // The shape the Content Pipeline demo needs, and the one it could not do: the body CHANGES
        // something the condition reads. The dispatcher used to evaluate the condition against the
        // payload as it was when the loop STARTED, so `while payload.brandOK !== true` could never
        // go false — the loop always exhausted its cap and the branch behind "approved" was
        // unreachable dead code. The loop ran, reported success, and its outcome was predetermined.
        const payload: Record<string, unknown> = { brandOK: false };

        const result = await RunWhileLoop(
            { condition: 'payload.brandOK !== true', maxIterations: 5 } as never,
            // Stands in for the dispatcher's evaluator reading the LIVE payload.
            () => ({ Success: true, Value: payload['brandOK'] !== true }),
            async () => {
                payload['brandOK'] = true;    // the body's effect, as the next check must see it
                return { Success: true, Output: { brandOK: true } };
            },
        );

        expect(result.Success).toBe(true);
        expect(result.Output).toMatchObject({ iterations: 1 });
    });

    it('still honours the cap when the condition never flips', async () => {
        // The give-up path stays intact: a body that cannot satisfy its condition must not spin.
        let iterations = 0;
        const result = await RunWhileLoop(
            { condition: 'payload.brandOK !== true', maxIterations: 3 } as never,
            () => ({ Success: true, Value: true }),
            async () => { iterations++; return { Success: true, Output: {} }; },
        );

        expect(iterations).toBe(3);
        expect(result.Output).toMatchObject({ iterations: 3 });
    });

    it('pauses at iteration cursor via OnIterationGovernance and resumes from StartIndex + InitialResults without replaying completed items (CR-7)', async () => {
        const executed: number[] = [];
        const op: ForEachOperation = { collectionPath: 'static:["a","b","c","d","e"]' };
        const firstPass = await RunForEachLoop(
            op,
            {},
            async ({ Index }) => {
                executed.push(Index);
                return { Success: true, Output: `item-${Index}` };
            },
            {
                OnIterationGovernance: async ({ CompletedIterations }) =>
                    CompletedIterations >= 2
                        ? { ShouldPause: true, Reason: 'Budget pause after index 1' }
                        : { ShouldPause: false },
            },
        );

        expect(firstPass.Success).toBe(false);
        expect(firstPass.Paused).toBe(true);
        expect(firstPass.ResumeCursorIndex).toBe(2);
        expect(executed).toEqual([0, 1]);
        expect(firstPass.Output.results).toEqual(['item-0', 'item-1']);

        const secondPass = await RunForEachLoop(
            op,
            {},
            async ({ Index }) => {
                executed.push(Index);
                return { Success: true, Output: `item-${Index}` };
            },
            {
                StartIndex: firstPass.ResumeCursorIndex,
                InitialResults: firstPass.Output.results,
            },
        );

        expect(secondPass.Success).toBe(true);
        expect(executed).toEqual([0, 1, 2, 3, 4]);
        expect(secondPass.Output.results).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
    });

    it('wires LoopExecutionOptions into parallel ForEach with OnIterationGovernance, LoopCursorSnapshot, and ResumeFromCursor without replaying completed indices', async () => {
        const executed: number[] = [];
        const op: ForEachOperation = {
            collectionPath: 'static:["p0","p1","p2","p3","p4","p5"]',
            executionMode: 'parallel',
            maxConcurrency: 2,
        };

        const firstPass = await RunForEachLoop(
            op,
            {},
            async ({ Index, Bindings }) => {
                executed.push(Index);
                return { Success: true, Output: `done-${Bindings['item']}`, CostUsd: 0.1, TokensUsed: 50 };
            },
            {
                OnIterationGovernance: async ({ CompletedIterations }) =>
                    CompletedIterations >= 4
                        ? { ShouldPause: true, Reason: 'Budget exhausted after 2 parallel batches' }
                        : { ShouldPause: false },
            },
        );

        expect(firstPass.Success).toBe(false);
        expect(firstPass.Paused).toBe(true);
        expect(firstPass.PauseReason).toBe('Budget exhausted after 2 parallel batches');
        expect(firstPass.LoopCursorSnapshot).toEqual({
            LoopType: 'ForEach',
            NextIterationIndex: 4,
            CompletedIndices: [0, 1, 2, 3],
            PartialResults: ['done-p0', 'done-p1', 'done-p2', 'done-p3', null, null],
            SucceededCount: 4,
            FailedCount: 0,
        });
        expect(executed).toEqual([0, 1, 2, 3]);

        const secondPass = await RunForEachLoop(
            op,
            {},
            async ({ Index, Bindings }) => {
                executed.push(Index);
                return { Success: true, Output: `done-${Bindings['item']}`, CostUsd: 0.1, TokensUsed: 50 };
            },
            {
                ResumeFromCursor: firstPass.LoopCursorSnapshot,
            },
        );

        expect(secondPass.Success).toBe(true);
        expect(executed).toEqual([0, 1, 2, 3, 4, 5]);
        expect(secondPass.Output.results).toEqual(['done-p0', 'done-p1', 'done-p2', 'done-p3', 'done-p4', 'done-p5']);
        expect(secondPass.Output.succeeded).toBe(6);
    });

    it('pauses While loop with LoopCursorSnapshot and resumes via ResumeFromCursor without replaying completed iterations', async () => {
        const executed: number[] = [];
        const op: WhileOperation = { condition: 'i < 5', maxIterations: 10 };

        const firstPass = await RunWhileLoop(
            op,
            (iteration) => ({ Success: true, Value: iteration < 5 }),
            async ({ Index }) => {
                executed.push(Index);
                return { Success: true, Output: `while-${Index}` };
            },
            {
                OnIterationGovernance: async ({ CompletedIterations, LastOutcome }) =>
                    LastOutcome && CompletedIterations >= 2
                        ? { ShouldPause: true, Reason: 'While loop governance pause' }
                        : { ShouldPause: false },
            },
        );

        expect(firstPass.Success).toBe(false);
        expect(firstPass.Paused).toBe(true);
        expect(firstPass.LoopCursorSnapshot).toEqual({
            LoopType: 'While',
            NextIterationIndex: 2,
            CompletedIndices: [0, 1],
            PartialResults: ['while-0', 'while-1'],
            SucceededCount: 2,
            FailedCount: 0,
        });
        expect(executed).toEqual([0, 1]);

        const secondPass = await RunWhileLoop(
            op,
            (iteration) => ({ Success: true, Value: iteration < 5 }),
            async ({ Index }) => {
                executed.push(Index);
                return { Success: true, Output: `while-${Index}` };
            },
            {
                ResumeFromCursor: firstPass.LoopCursorSnapshot,
            },
        );

        expect(secondPass.Success).toBe(true);
        expect(executed).toEqual([0, 1, 2, 3, 4]);
        expect(secondPass.Output.results).toEqual(['while-0', 'while-1', 'while-2', 'while-3', 'while-4']);
    });

    it('CR-SEQUENTIAL-LOOP-QUADRATIC: scales near-linearly over large sequential ForEach collections with OnIterationGovernance and preserves sparse resume-cursor semantics', async () => {
        // 1) Scaling regression: 10x input growth (500 -> 5,000) with OnIterationGovernance active must stay near-linear (never quadratic)
        const measureSequentialRun = async (count: number): Promise<number> => {
            const items = Array.from({ length: count }, (_, i) => i);
            const op: ForEachOperation = { collectionPath: 'payload.items', maxIterations: count };
            let govChecks = 0;
            const startNs = process.hrtime.bigint();
            const res = await RunForEachLoop(
                op,
                { payload: { items } },
                async ({ Index }) => ({ Success: true, Output: Index }),
                {
                    OnIterationGovernance: async () => {
                        govChecks++;
                        return { ShouldPause: false };
                    },
                },
            );
            const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
            expect(res.Success).toBe(true);
            expect(res.Output.iterations).toBe(count);
            expect(govChecks).toBe(count * 2);
            return elapsedMs;
        };

        // Warm up JIT once
        await measureSequentialRun(200);
        const smallMs = await measureSequentialRun(500);
        const largeMs = await measureSequentialRun(5_000);
        const ratio = largeMs / Math.max(smallMs, 0.5);
        // Quadratic scaling on 10x N would be ~100x; linear bookkeeping stays well under 30x even under noisy CI load.
        expect(ratio).toBeLessThan(30);

        // 2) Sparse ResumeFromCursor without replaying already-completed indices
        const executedSparse: number[] = [];
        const sparseOp: ForEachOperation = { collectionPath: 'static:["s0","s1","s2","s3","s4"]' };
        const pausedAgain = await RunForEachLoop(
            sparseOp,
            {},
            async ({ Index }) => {
                executedSparse.push(Index);
                return { Success: true, Output: `sparse-${Index}` };
            },
            {
                ResumeFromCursor: {
                    LoopType: 'ForEach',
                    NextIterationIndex: 1,
                    CompletedIndices: [0, 2],
                    PartialResults: ['sparse-0', null, 'sparse-2'],
                    SucceededCount: 2,
                    FailedCount: 0,
                },
                OnIterationGovernance: async ({ CompletedIterations }) =>
                    CompletedIterations >= 4
                        ? { ShouldPause: true, Reason: 'Pause after index 3' }
                        : { ShouldPause: false },
            },
        );

        expect(pausedAgain.Paused).toBe(true);
        expect(executedSparse).toEqual([1, 3]);
        expect(pausedAgain.LoopCursorSnapshot).toEqual({
            LoopType: 'ForEach',
            NextIterationIndex: 4,
            CompletedIndices: [0, 1, 2, 3],
            PartialResults: ['sparse-0', 'sparse-1', 'sparse-2', 'sparse-3'],
            SucceededCount: 4,
            FailedCount: 0,
        });

        const finishedSparse = await RunForEachLoop(
            sparseOp,
            {},
            async ({ Index }) => {
                executedSparse.push(Index);
                return { Success: true, Output: `sparse-${Index}` };
            },
            {
                ResumeFromCursor: pausedAgain.LoopCursorSnapshot,
            },
        );
        expect(finishedSparse.Success).toBe(true);
        expect(executedSparse).toEqual([1, 3, 4]);
        expect(finishedSparse.Output.results).toEqual(['sparse-0', 'sparse-1', 'sparse-2', 'sparse-3', 'sparse-4']);
    });
});
