/**
 * The per-record fallback is the ONLY place a batched sync can touch the provider's transaction
 * state, and that state is global to the one shared provider instance (`_transactionDepth`, the
 * active transaction, the savepoint counter are single fields). Two entity maps in there at once
 * race that counter: the second sees depth 2, issues `SAVE TRANSACTION` against a transaction the
 * first already committed, and the leaked depth then fails EVERY later query on the connection
 * with "Transaction has not begun. Call begin() first."
 *
 * The batch itself is already safe — both dialects' TransactionGroup take their OWN dedicated
 * pooled connection (`new sql.Transaction(pool)` / `pool.connect()` + `BEGIN`) and never read the
 * provider's fields. So the fallback is what has to stop opening transactions, and these tests
 * pin exactly that: auto-commit when batched, unchanged behaviour when sequential.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';

type ProviderCalls = { begin: number; commit: number; rollback: number };

/** Counts the provider transaction calls the fallback makes, and simulates the shared depth counter. */
const makeProvider = (calls: ProviderCalls, depth: { value: number }) => ({
    BeginTransaction: async () => { calls.begin++; depth.value++; },
    CommitTransaction: async () => { calls.commit++; depth.value--; },
    RollbackTransaction: async () => { calls.rollback++; depth.value--; },
});

type Fallback = {
    applyRecordsIndividually: (
        batch: unknown[], ci: unknown, map: unknown, result: { RecordsProcessed: number; RecordsErrored: number; Errors: unknown[] },
        user: unknown, logger: unknown, hashes: unknown, skipIds: unknown, recordMaps: unknown, useProviderTransaction?: boolean,
    ) => Promise<void>;
    ApplySingleRecord: (...args: unknown[]) => Promise<void>;
    ProviderToUse: unknown;
};

/** Builds an engine whose single record write is observable and whose provider is counted. */
const makeEngine = (calls: ProviderCalls, depth: { value: number }, applied: string[], failOn?: string) => {
    const engine = Object.create(IntegrationEngine.prototype) as unknown as Fallback;
    Object.defineProperty(engine, 'ProviderToUse', { value: makeProvider(calls, depth), configurable: true });
    engine.ApplySingleRecord = async (record: unknown) => {
        const id = (record as { ExternalRecord: { ExternalID: string } }).ExternalRecord.ExternalID;
        applied.push(id);
        if (id === failOn) throw new Error('permanent: validation failed');
    };
    return engine;
};

const records = (...ids: string[]) => ids.map((id) => ({
    ExternalRecord: { ExternalID: id }, ChangeType: 'Create',
}));

const newResult = () => ({ RecordsProcessed: 0, RecordsErrored: 0, Errors: [] as unknown[] });

const run = (engine: Fallback, batch: unknown[], result: ReturnType<typeof newResult>, useProviderTransaction?: boolean) =>
    engine.applyRecordsIndividually(
        batch, {} as unknown, { ExternalObjectName: 'Obj' } as unknown, result,
        {} as unknown, undefined, undefined, undefined, undefined, useProviderTransaction,
    );

describe('applyRecordsIndividually — provider transactions are what break concurrency', () => {
    it('opens NO provider transaction when the batched path calls it', async () => {
        const calls: ProviderCalls = { begin: 0, commit: 0, rollback: 0 };
        const depth = { value: 0 };
        const applied: string[] = [];
        const result = newResult();

        await run(makeEngine(calls, depth, applied) as Fallback, records('a', 'b', 'c'), result, false);

        // The write still happens — through the same ApplySingleRecord, so Save()/sprocs/record
        // changes are all unchanged. It just auto-commits.
        expect(applied).toEqual(['a', 'b', 'c']);
        expect(result.RecordsProcessed).toBe(3);
        expect(calls).toEqual({ begin: 0, commit: 0, rollback: 0 });
    });

    it('still opens one transaction per record on the sequential path (unchanged)', async () => {
        const calls: ProviderCalls = { begin: 0, commit: 0, rollback: 0 };
        const depth = { value: 0 };
        const applied: string[] = [];
        const result = newResult();

        await run(makeEngine(calls, depth, applied) as Fallback, records('a', 'b'), result, true);

        expect(applied).toEqual(['a', 'b']);
        expect(calls).toEqual({ begin: 2, commit: 2, rollback: 0 });
    });

    it('defaults to the sequential behaviour when the flag is omitted', async () => {
        const calls: ProviderCalls = { begin: 0, commit: 0, rollback: 0 };
        const depth = { value: 0 };
        const result = newResult();

        await run(makeEngine(calls, depth, []) as Fallback, records('a'), result);

        expect(calls.begin).toBe(1);
    });

    it('leaves the shared depth counter untouched when two maps run the fallback CONCURRENTLY', async () => {
        // The regression itself. With transactions on, two interleaved maps drive the shared depth
        // above 1 — which is what emits `SAVE TRANSACTION SavePoint_N` against nothing. Off, it
        // never leaves 0, so a concurrent sibling can never observe a corrupted provider.
        const calls: ProviderCalls = { begin: 0, commit: 0, rollback: 0 };
        const depth = { value: 0 };
        let maxDepth = 0;
        const applied: string[] = [];
        const engine = makeEngine(calls, depth, applied) as Fallback;
        const inner = engine.ApplySingleRecord;
        engine.ApplySingleRecord = async (...args: unknown[]) => {
            maxDepth = Math.max(maxDepth, depth.value);
            await new Promise((r) => setTimeout(r, 0)); // force interleaving between the two maps
            return inner(...args);
        };

        await Promise.all([
            run(engine, records('m1-a', 'm1-b'), newResult(), false),
            run(engine, records('m2-a', 'm2-b'), newResult(), false),
        ]);

        expect(applied.length).toBe(4);
        expect(maxDepth).toBe(0);
        expect(depth.value).toBe(0);
    });

    it('dead-letters a permanent failure without a rollback it cannot perform', async () => {
        // No transaction was opened, so there is nothing to roll back — the record must still be
        // counted and reported, and the good siblings must still be applied.
        const calls: ProviderCalls = { begin: 0, commit: 0, rollback: 0 };
        const depth = { value: 0 };
        const applied: string[] = [];
        const result = newResult();

        await run(makeEngine(calls, depth, applied, 'bad') as Fallback, records('good1', 'bad', 'good2'), result, false);

        expect(applied).toEqual(['good1', 'bad', 'good2']);
        expect(result.RecordsProcessed).toBe(3);
        expect(result.RecordsErrored).toBe(1);
        expect(calls.rollback).toBe(0);
        expect(depth.value).toBe(0);
    });
});
