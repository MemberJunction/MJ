/**
 * BatchedSubmit on the PostgreSQL transaction group.
 *
 * The property this opt-in sells is "same statements, same order, same transaction, ONE round
 * trip" — so the tests count queries, verify per-item result mapping through the sentinel
 * protocol, and pin the two fallbacks (no escapeLiteral on the client; a parameter value with
 * no safe literal form), because a silent fallback that never fires — or fires always — would
 * make the flag a lie in one direction or the other.
 */
import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { PostgreSQLTransactionGroup } from '../PostgreSQLTransactionGroup.js';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import type { TransactionItem, TransactionResult } from '@memberjunction/core';

type QueryCall = { text: string; params?: unknown[] };
/** A fake pg client: the members the group's paths call. */
type FakeClient = Record<string, unknown>;

/** A fake PoolClient: records queries, answers multi-statement text with a scripted result array. */
function makeClient(opts: { withEscape?: boolean; multiResult?: (text: string) => unknown } = {}) {
    const calls: QueryCall[] = [];
    const client: FakeClient = {
        query: async (text: string, params?: unknown[]) => {
            calls.push({ text, params });
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
            // Only the batched multi-statement text gets the scripted multi-result answer; a
            // single-statement (sequential fallback) query returns one result, like the real driver.
            if (opts.multiResult && text.includes('__mj_batch_item')) return opts.multiResult(text);
            // A single generated save statement returns the saved row.
            return { rows: [{ ID: `row-${calls.length}` }] };
        },
        release: () => undefined,
    };
    if (opts.withEscape !== false) {
        client.escapeLiteral = (v: string) => `'${v.replace(/'/g, "''")}'`;
    }
    return { client, calls };
}

/**
 * The provider each item's entity saves through: the group post-processes the item's rows with it
 * (binary → base64, datetimes, decryption). These fixtures carry stub EntityInfo, so a pass-through.
 */
class PassThroughPGProvider extends PostgreSQLDataProvider {
    public override async ProcessEntityRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
        return rows;
    }
}
const itemProvider = new PassThroughPGProvider();

function makeItem(instruction: string, params: unknown[] | undefined, entityName: string): TransactionItem {
    return {
        BaseEntity: { EntityInfo: { Name: entityName }, ContextCurrentUser: undefined, ProviderToUse: itemProvider },
        Instruction: instruction,
        Vars: params ?? null,
        OperationType: 'Create',
        ExtraData: { dataSource: {}, entityName, parameters: params },
    } as unknown as TransactionItem;
}

/** Exposes the batched and sequential paths so they can be driven against a fake client, without a live pool. */
class BatchedTestGroup extends PostgreSQLTransactionGroup {
    constructor() {
        super();
        this.BatchedSubmit = true;
    }
    /** The fake client implements only `query`, `release` and (optionally) `escapeLiteral` — all the paths use. */
    public RunBatched(items: TransactionItem[], client: FakeClient, results: TransactionResult[]): Promise<void> {
        return this.ExecuteBatched(items, client as unknown as pg.PoolClient, results);
    }
}
function makeGroup(): BatchedTestGroup {
    return new BatchedTestGroup();
}

describe('PostgreSQLTransactionGroup.BatchedSubmit', () => {
    it('sends the whole group as ONE query and maps results per item via sentinels', async () => {
        const { client, calls } = makeClient({
            multiResult: () => [
                { rows: [{ __mj_batch_item: 0 }] },
                { rows: [{ ID: 'a1' }] },
                { rows: [{ __mj_batch_item: 1 }] },
                { rows: [{ ID: 'b1' }] },
            ],
        });
        const items = [
            makeItem('SELECT * FROM sp_create_a($1, $2)', ['x', 42], 'A'),
            makeItem("SELECT * FROM sp_create_b($1)", ["O'Brien"], 'B'),
        ];
        const results: TransactionResult[] = [];
        await makeGroup().RunBatched(items, client, results);

        expect(calls.length).toBe(1); // the property being sold
        const text = calls[0].text;
        expect(calls[0].params).toBeUndefined(); // simple protocol — literals inlined
        expect(text).toContain('SELECT 0 AS __mj_batch_item');
        expect(text).toContain('SELECT 1 AS __mj_batch_item');
        expect(text).toContain("'x'");
        expect(text).toContain('42');
        expect(text).toContain("'O''Brien'"); // escaping went through escapeLiteral
        expect(results.length).toBe(2);
        expect(results[0].Success).toBe(true);
        expect((results[0].Result as { ID: string }).ID).toBe('a1');
        expect((results[1].Result as { ID: string }).ID).toBe('b1');
    });

    it('keeps the mapping exact when a middle item returns no rows — and that item fails the whole group', async () => {
        const { client } = makeClient({
            multiResult: () => [
                { rows: [{ __mj_batch_item: 0 }] },
                { rows: [{ ID: 'a1' }] },
                { rows: [{ __mj_batch_item: 1 }] },
                { rows: [] }, // item 1: statement ran, returned nothing
                { rows: [{ __mj_batch_item: 2 }] },
                { rows: [{ ID: 'c1' }] },
            ],
        });
        const items = [
            makeItem('SELECT 1', [], 'A'),
            makeItem('SELECT 2', [], 'B'),
            makeItem('SELECT 3', [], 'C'),
        ];
        const results: TransactionResult[] = [];
        // The failure names B: had item 1 drifted onto item 2's row, B would have "succeeded" and C failed.
        await expect(makeGroup().RunBatched(items, client, results)).rejects.toThrow(/rolled back.*Create of B did not persist the record/);
        expect(results.length).toBe(3);
        expect(results.every(r => r.Success === false)).toBe(true); // no sibling reported as a success
    });

    it('falls back to sequential when a parameter has no safe literal form', async () => {
        // Plain objects are NOT the bail case: PGQueryParameterProcessor serializes them before
        // the literal gate sees them, exactly as it does on the serial path. A non-finite number
        // survives processing as a number with no SQL literal form — that is the genuine bail.
        const { client, calls } = makeClient({
            multiResult: () => [{ rows: [] }],
        });
        const items = [
            makeItem('SELECT * FROM sp_x($1)', [Number.NaN], 'X'),
            makeItem('SELECT * FROM sp_y($1)', ['fine'], 'Y'),
        ];
        const results: TransactionResult[] = [];
        await makeGroup().RunBatched(items, client, results);
        // Sequential path = one query per item (2), not one batch (1).
        expect(calls.length).toBe(2);
        // And the un-inlinable value travelled as a PARAMETER, never as text.
        expect(calls[0].params?.length).toBe(1);
    });

    it('falls back to sequential when an instruction references more placeholders than the generator supplied', async () => {
        // An absent parameter index is a generator/instruction disagreement, NOT a null value.
        // Inlining it as NULL would silently write a null column; the group must bail instead so
        // the driver raises it on the sequential path.
        const { client, calls } = makeClient({ multiResult: () => [{ rows: [] }] });
        const items = [
            makeItem('SELECT * FROM sp_x($1, $2)', ['only-one'], 'X'),
            makeItem('SELECT * FROM sp_y($1)', ['fine'], 'Y'),
        ];
        const results: TransactionResult[] = [];
        await makeGroup().RunBatched(items, client, results);
        expect(calls.length).toBe(2);              // sequential, not one batch
        expect(calls[0].params).toEqual(['only-one']); // and $2 never became a NULL literal
        expect(calls[0].text).toContain('$2');
    });

    it('falls back to sequential when the client has no escapeLiteral', async () => {
        const { client, calls } = makeClient({ withEscape: false, multiResult: () => [{ rows: [] }] });
        const items = [makeItem('SELECT * FROM sp_x($1)', ['v'], 'X')];
        const results: TransactionResult[] = [];
        await makeGroup().RunBatched(items, client, results);
        expect(calls.length).toBe(1); // sequential for 1 item — but crucially, NOT the inlined batch
        expect(calls[0].params).toEqual(['v']); // parameters travelled as parameters, not literals
    });

    it('fails the whole group on a batch error, like the serial path', async () => {
        const { client } = makeClient({
            multiResult: () => {
                throw new Error('duplicate key value violates unique constraint');
            },
        });
        const items = [makeItem('SELECT 1', [], 'A'), makeItem('SELECT 2', [], 'B')];
        const results: TransactionResult[] = [];
        await expect(makeGroup().RunBatched(items, client, results)).rejects.toThrow(/rolled back/);
        expect(results.length).toBe(2);
        expect(results.every(r => r.Success === false)).toBe(true);
    });
});
