/**
 * `syncConcurrency` was a fetch-only setting. Opting into it made the apply path give up batch
 * atomicity — each record auto-commits on its own pooled connection — and then still wrote the
 * records one at a time, so the caller paid the price of concurrency and got none of it.
 *
 * These tests pin the pool's semantics rather than its shape: how many run at once, that every
 * record is applied exactly once, and that the two error behaviours (dead-letter vs fail-stop)
 * survive being run in parallel.
 */
import { describe, it, expect, vi } from 'vitest';
import { IntegrationEngine, SchemaNotGeneratedError } from '../IntegrationEngine.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ApplyHost = {
    ApplyRecords: (...args: unknown[]) => Promise<void>;
};

/** Drives the real ApplyRecords with ApplySingleRecord stubbed, on the transaction-free path. */
function makeHost(apply: (rec: { id: number }) => Promise<void>) {
    const host = Object.create(IntegrationEngine.prototype) as unknown as ApplyHost & Record<string, unknown>;
    Object.assign(host, {
        ApplySingleRecord: async (record: { id: number }) => apply(record),
        TouchLastReconciledAt: async () => undefined,
        FlushRecordMaps: async () => undefined,
        runWriteExclusive: async (fn: () => Promise<void>) => fn(),
        getSyncConcurrency: () => 1,
    });
    Object.defineProperty(host, 'ProviderToUse', { value: {}, configurable: true });
    return host;
}

const records = (n: number) => Array.from({ length: n }, (_, id) => ({ id, ExternalRecord: { ExternalID: String(id) }, ChangeType: 'Create' }));
const result = () => ({ RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0, RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [] });

/** ApplyRecords(records, ci, entityMap, result, user, logger, useTransaction=false, concurrency) */
const run = (host: ApplyHost, recs: unknown[], res: unknown, concurrency: number) =>
    host.ApplyRecords(recs, { ID: 'CI' }, { ID: 'EM', ExternalObjectName: 'Obj' }, res, { ID: 'U' }, undefined, false, concurrency);

describe('ApplyRecords — transaction-free path honours concurrency', () => {
    it('runs up to `concurrency` records at once instead of one at a time', async () => {
        let inFlight = 0;
        let peak = 0;
        const host = makeHost(async () => {
            inFlight++; peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
        });
        const res = result();

        await run(host, records(20), res, 4);

        expect(peak).toBe(4);
        expect(res.RecordsProcessed).toBe(20);
    });

    it('never exceeds the cap — 500 records must not become 500 simultaneous saves', async () => {
        let inFlight = 0;
        let peak = 0;
        const host = makeHost(async () => {
            inFlight++; peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight--;
        });

        await run(host, records(200), result(), 8);

        expect(peak).toBeLessThanOrEqual(8);
    });

    it('applies every record exactly once', async () => {
        const seen: number[] = [];
        const host = makeHost(async (rec) => { seen.push(rec.id); });

        await run(host, records(50), result(), 5);

        expect(seen).toHaveLength(50);
        expect(new Set(seen).size).toBe(50);
    });

    it('stays serial when concurrency is 1 — the default must not change behaviour', async () => {
        let inFlight = 0;
        let peak = 0;
        const host = makeHost(async () => {
            inFlight++; peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight--;
        });

        await run(host, records(10), result(), 1);

        expect(peak).toBe(1);
    });

    it('dead-letters a poison record and still applies its healthy siblings', async () => {
        const host = makeHost(async (rec) => {
            if (rec.id === 3) throw new Error('permanent failure');
        });
        const res = result();

        await run(host, records(10), res, 4);

        expect(res.RecordsErrored).toBe(1);
        expect(res.Errors[0]).toMatchObject({ ExternalID: '3' });
        expect(res.RecordsProcessed).toBe(10); // the other nine still went through
    });

    it('fail-stops the whole map on SchemaNotGeneratedError instead of grinding through the batch', async () => {
        // The destination table does not exist, so finishing the remaining records is wasted work
        // against a table that cannot accept them.
        let attempts = 0;
        const host = makeHost(async () => {
            attempts++;
            await new Promise((r) => setTimeout(r, 1));
            throw new SchemaNotGeneratedError('Obj', 'spCreateObj');
        });

        await expect(run(host, records(100), result(), 4)).rejects.toBeInstanceOf(SchemaNotGeneratedError);
        expect(attempts).toBeLessThan(100); // stopped early rather than trying all 100
    });
});

describe('wiring', () => {
    const source = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf8');

    it('uses allSettled so a worker rejection cannot escape mid-batch', () => {
        // Promise.all would abandon the remaining workers while they still mutate the counters.
        expect(source).toMatch(/await Promise\.allSettled\(/);
    });

    it('passes the requested concurrency at both call sites', () => {
        const calls = source.match(/this\.ApplyRecords\([^;]*\);/g) ?? [];
        expect(calls.length).toBeGreaterThanOrEqual(2);
        for (const c of calls) expect(c).toMatch(/getSyncConcurrency\(config\)\);\s*$/);
    });
});
