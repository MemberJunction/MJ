/**
 * The opt-in for batched writes. Two properties matter, and they are the ones a perf switch gets
 * wrong: it must fail CLOSED (anything short of an explicit ask keeps the proven path), and when
 * it is on the writes must still go through `Save()` rather than around it.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

/** Reaches the private reader the batch path uses. Named rather than cast to `any`. */
type WriteModeReader = { ReadWriteMode: (ci: MJCompanyIntegrationEntity) => string };
const readMode = (configuration: unknown): string => {
    const engine = Object.create(IntegrationEngine.prototype) as unknown as WriteModeReader;
    const ci = { Get: (f: string) => (f === 'Configuration' ? configuration : undefined) } as unknown as MJCompanyIntegrationEntity;
    return engine.ReadWriteMode(ci);
};

describe('ReadWriteMode — the opt-in must fail closed', () => {
    it('reads an explicit ask', () => {
        expect(readMode(JSON.stringify({ writeMode: 'batched' }))).toBe('batched');
    });

    it('returns nothing when the connection said nothing', () => {
        expect(readMode(null)).toBe('');
        expect(readMode(undefined)).toBe('');
        expect(readMode('')).toBe('');
        expect(readMode('{}')).toBe('');
    });

    it('returns nothing for unparseable configuration rather than throwing into the sync', () => {
        // A connection whose Configuration is malformed must not fail its sync over a perf switch.
        expect(readMode('{ not json')).toBe('');
    });

    it('returns nothing when writeMode is the wrong TYPE', () => {
        // `writeMode: true` is not an ask for batched writes, and must not be read as one.
        expect(readMode(JSON.stringify({ writeMode: true }))).toBe('');
        expect(readMode(JSON.stringify({ writeMode: 1 }))).toBe('');
        expect(readMode(JSON.stringify({ writeMode: { on: true } }))).toBe('');
    });

    it('does not treat an unrecognised mode as batched', () => {
        // Only the exact string switches the path; the batch site compares === 'batched'.
        expect(readMode(JSON.stringify({ writeMode: 'bulk' }))).toBe('bulk');
        expect(readMode(JSON.stringify({ writeMode: 'BATCHED' }))).toBe('BATCHED');
    });
});

/**
 * The mechanisms that let batched writes overlap.
 *
 * Batching used to hold the write mutex across the WHOLE apply block, which meant two maps could
 * never be applying at once — so batching and concurrency were exclusive and, worse, any attempt
 * to pool across maps was unreachable rather than merely wrong. These pin the two properties the
 * narrowed design depends on.
 *
 * What they do NOT cover: driving ApplyRecords end to end. They test the primitives it is built
 * from, not the wiring, which is why the wiring also has to be read.
 */
type MutexHolder = { runWriteExclusive: <T>(fn: () => Promise<T>) => Promise<T> };
type ContextHolder = { runContext: { run: <T>(store: unknown, fn: () => T) => T; getStore: () => unknown } };

const engineWithMutex = (): MutexHolder => {
    const e = Object.create(IntegrationEngine.prototype) as unknown as MutexHolder;
    // The chain is keyed by provider, so a distinct object per test keeps them independent.
    // `ProviderToUse` is a prototype getter, so it is shadowed rather than assigned.
    Object.defineProperty(e, 'ProviderToUse', { value: {}, configurable: true });
    return e;
};

describe('the write mutex, and why the batched path must not nest it', () => {
    it('serializes: a second write waits for the first', async () => {
        const e = engineWithMutex();
        const order: string[] = [];
        let releaseFirst!: () => void;
        const first = e.runWriteExclusive(async () => {
            order.push('first:start');
            await new Promise<void>(r => (releaseFirst = r));
            order.push('first:end');
        });
        const second = e.runWriteExclusive(async () => { order.push('second:start'); });

        await Promise.resolve();
        expect(order).toEqual(['first:start']);   // second has not started

        releaseFirst();
        await Promise.all([first, second]);
        expect(order).toEqual(['first:start', 'first:end', 'second:start']);
    });

    it('keeps the chain alive past a failure so one bad batch cannot wedge later writers', async () => {
        const e = engineWithMutex();
        await expect(e.runWriteExclusive(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        await expect(e.runWriteExclusive(async () => 'after')).resolves.toBe('after');
    });

    it('DEADLOCKS if nested — which is why the batched path runs its writes inline under the outer mutex', async () => {
        // Documented as a test because the failure is a hang, not an error: the inner call waits on
        // a chain that already contains the outer one, so it can never be reached.
        const e = engineWithMutex();
        let innerReached = false;
        const outer = e.runWriteExclusive(async () => {
            void e.runWriteExclusive(async () => { innerReached = true; });
            // Give the inner call every chance to run.
            for (let i = 0; i < 20; i++) await Promise.resolve();
        });
        await outer;
        expect(innerReached).toBe(false);
    });
});

describe('per-batch write groups', () => {
    it('gives concurrent batches DISTINCT groups instead of one shared slot', async () => {
        // A single slot on the shared run context is what would enrol one map's records into
        // another's batch the moment they overlap. A nested context scope per batch cannot.
        const ctxHolder = IntegrationEngine as unknown as ContextHolder;
        const base = { writeGroup: undefined };
        const groupA = { id: 'A' };
        const groupB = { id: 'B' };
        const seen: unknown[] = [];

        const runOne = (group: unknown) =>
            ctxHolder.runContext.run({ ...base, writeGroup: group }, async () => {
                await new Promise<void>(r => setTimeout(r, 0));       // force overlap
                seen.push((ctxHolder.runContext.getStore() as { writeGroup: unknown }).writeGroup);
            });

        await Promise.all([runOne(groupA), runOne(groupB)]);
        expect(seen).toHaveLength(2);
        expect(new Set(seen).size).toBe(2);          // each scope kept its own
        expect(seen).toContain(groupA);
        expect(seen).toContain(groupB);
    });
});

describe('batching is independent of concurrency', () => {
    it('does not require concurrency 1 — the gate that made them exclusive is gone', async () => {
        // The regression this pins: `batchedWrites = useTransaction && …` meant batching only ever
        // engaged at syncConcurrency <= 1, so raising concurrency silently dropped every record
        // back onto the per-record pool. Nothing in the sync reports that; throughput just fails
        // to improve, which is indistinguishable from the feature not helping.
        const src = await import('node:fs').then(fs =>
            fs.readFileSync(new URL('../IntegrationEngine.ts', import.meta.url), 'utf8'));

        // The decision follows writeMode alone.
        expect(src).toMatch(/const batchedWrites = this\.ReadWriteMode\(companyIntegration\) === 'batched';/);
        expect(src).not.toMatch(/const batchedWrites = useTransaction &&/);

        // And the batch-atomic branch is reachable when batched, whatever the concurrency.
        expect(src).toMatch(/if \(useTransaction \|\| batchedWrites\) \{/);
    });
});
