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
import { describe, it, expect, vi } from 'vitest';
import {
    RunForEachLoop,
    RunWhileLoop,
    DEFAULT_FOREACH_MAX_ITERATIONS,
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

    it('applies a default ceiling when none is set', async () => {
        const big = `static:${JSON.stringify(Array.from({ length: DEFAULT_FOREACH_MAX_ITERATIONS + 5 }, (_, i) => i))}`;
        const { seen, invoke } = recorder();
        await RunForEachLoop({ collectionPath: big }, {}, invoke);
        expect(seen).toHaveLength(DEFAULT_FOREACH_MAX_ITERATIONS);
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
