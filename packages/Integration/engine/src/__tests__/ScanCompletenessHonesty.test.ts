import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { discoverFromStream, pickPrimaryKeyFromStats } from '../StreamingDiscovery.js';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type {
    ConnectionTestResult, ExternalObjectSchema, ExternalFieldSchema, FetchContext, FetchBatchResult,
} from '../BaseIntegrationConnector.js';
import type { StreamDiscoveryOptions, PkPickOptions } from '../StreamingDiscovery.js';

/** Exposes the protected bridge so the CONNECTOR's own ScanComplete decision is what gets tested. */
@RegisterClass(BaseIntegrationConnector, 'ScanCompletenessTestConnector')
class ScanCompletenessTestConnector extends BaseIntegrationConnector {
    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'OK' }; }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> { return []; }
    public async DiscoverFields(): Promise<ExternalFieldSchema[]> { return []; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> { return { Records: [], HasMore: false }; }
    public Run(
        records: Iterable<Record<string, unknown>>,
        opts?: { Discovery?: StreamDiscoveryOptions; Pk?: PkPickOptions; ReadOnly?: boolean },
    ): Promise<ExternalFieldSchema[]> { return this.DiscoverFieldsViaStream(records, opts); }
}

/**
 * A capped scan saw a PREFIX, and must say so.
 *
 * The record cap is enforced by the GENERATOR feeding the scan — it simply returns — so the stream
 * ends indistinguishably from a table that ran out of rows, and the scan reported `'exhausted'`.
 * That mattered because `ScanComplete` unlocks the LENIENT near-unique (0.9) soft-key rule instead
 * of the strict 1.0 reserved for partial corpora. A 50-row prefix of a ten-million-row table was
 * therefore judged complete, and over 50 rows an ordinary foreign key is very likely to look ≥90%
 * distinct. A wrong soft key does not error — it silently merges two source records onto one row.
 */
const rows = (n: number, fn: (i: number) => Record<string, unknown>) =>
    Array.from({ length: n }, (_v, i) => fn(i));

describe('discoverFromStream — StoppedReason distinguishes a prefix from an exhausted source', () => {
    it('reports record-cap when the producer stopped it at the target', async () => {
        const out = await discoverFromStream(rows(60, i => ({ id: `r${i}` })), { RecordCap: 50 });
        expect(out.StoppedReason).toBe('record-cap');
        expect(out.RowsScanned).toBe(50);
    });

    it('reports exhausted when the source genuinely ran out first', async () => {
        const out = await discoverFromStream(rows(20, i => ({ id: `r${i}` })), { RecordCap: 50 });
        expect(out.StoppedReason).toBe('exhausted');
        expect(out.RowsScanned).toBe(20);
    });

    it('reports exhausted when no cap is in play at all', async () => {
        const out = await discoverFromStream(rows(20, i => ({ id: `r${i}` })));
        expect(out.StoppedReason).toBe('exhausted');
    });

    it('a source that ends exactly AT the cap is a prefix as far as we know', async () => {
        // We cannot tell "exactly 50 rows exist" from "row 51 was never offered", and the safe
        // reading is the suspicious one.
        const out = await discoverFromStream(rows(50, i => ({ id: `r${i}` })), { RecordCap: 50 });
        expect(out.StoppedReason).toBe('record-cap');
    });
});

describe('the soft-key rule a capped scan is now held to', () => {
    // 100 rows where `customer_id` is 92% distinct — the shape of an ordinary foreign key over a
    // short prefix. Convention-named, non-null on every row, so it clears every gate except the
    // uniqueness ratio.
    const nearUnique = () => {
        const cols = rows(100, i => ({ customer_id: `c${i < 92 ? i : 0}` }));
        return cols;
    };

    it('an EXHAUSTED scan may take the lenient near-unique soft key', async () => {
        const scan = await discoverFromStream(nearUnique());
        expect(scan.StoppedReason).toBe('exhausted');
        const soft = pickPrimaryKeyFromStats(scan.Columns, { ScanComplete: true });
        expect(soft.Field).toBe('customer_id');
    });

    it('a CAPPED scan of the same data must NOT — it only saw a prefix', async () => {
        const scan = await discoverFromStream(nearUnique(), { RecordCap: 100 });
        expect(scan.StoppedReason).toBe('record-cap');
        // This is the decision the connector now makes: ScanComplete === 'exhausted', not
        // "!== time-budget". Under the strict 1.0 rule a 92%-distinct column is not a key.
        const soft = pickPrimaryKeyFromStats(scan.Columns, { ScanComplete: scan.StoppedReason === 'exhausted' });
        expect(soft.Field).toBeNull();
    });

    it('a genuinely unique column still wins on a capped scan — strictness is not refusal', async () => {
        const scan = await discoverFromStream(rows(100, i => ({ customer_id: `c${i}` })), { RecordCap: 100 });
        const soft = pickPrimaryKeyFromStats(scan.Columns, { ScanComplete: scan.StoppedReason === 'exhausted' });
        expect(soft.Field).toBe('customer_id');
    });
});

describe('the CONNECTOR\'s own decision, not a re-implementation of it', () => {
    // The tests above compute ScanComplete themselves, so they cannot catch the connector passing
    // the wrong thing — which is exactly the defect being fixed. These drive
    // DiscoverFieldsViaStream and read the verdict off the fields it returns.
    const nearUnique = () => Array.from({ length: 100 }, (_v, i) => ({ customer_id: `c${i < 92 ? i : 0}` }));
    const pkOf = (fields: ExternalFieldSchema[]) => fields.filter(f => f.IsPrimaryKey).map(f => f.Name);

    it('does NOT nominate a near-unique column as the key when the scan was capped', async () => {
        const c = new ScanCompletenessTestConnector();
        const fields = await c.Run(nearUnique(), { Discovery: { RecordCap: 100 }, ReadOnly: true });
        expect(pkOf(fields)).toEqual([]);
    });

    it('DOES nominate it when the source genuinely ran out first', async () => {
        const c = new ScanCompletenessTestConnector();
        const fields = await c.Run(nearUnique(), { Discovery: { RecordCap: 500 }, ReadOnly: true });
        expect(pkOf(fields)).toEqual(['customer_id']);
    });

    it('a provably unique column is still nominated on a capped scan', async () => {
        const c = new ScanCompletenessTestConnector();
        const rows = Array.from({ length: 100 }, (_v, i) => ({ customer_id: `c${i}` }));
        const fields = await c.Run(rows, { Discovery: { RecordCap: 100 }, ReadOnly: true });
        expect(pkOf(fields)).toEqual(['customer_id']);
    });
});
