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
import { PostgreSQLTransactionGroup } from '../PostgreSQLTransactionGroup.js';
import type { TransactionItem } from '@memberjunction/core';

type QueryCall = { text: string; params?: unknown[] };

/** A fake PoolClient: records queries, answers multi-statement text with a scripted result array. */
function makeClient(opts: { withEscape?: boolean; multiResult?: (text: string) => unknown } = {}) {
    const calls: QueryCall[] = [];
    const client: Record<string, unknown> = {
        query: async (text: string, params?: unknown[]) => {
            calls.push({ text, params });
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
            if (opts.multiResult) return opts.multiResult(text);
            return { rows: [] };
        },
        release: () => undefined,
    };
    if (opts.withEscape !== false) {
        client.escapeLiteral = (v: string) => `'${v.replace(/'/g, "''")}'`;
    }
    return { client, calls };
}

function makeItem(instruction: string, params: unknown[] | undefined, entityName: string): TransactionItem {
    return {
        BaseEntity: { EntityInfo: { Name: entityName }, ContextCurrentUser: undefined },
        Instruction: instruction,
        Vars: params ?? null,
        OperationType: 'Create',
        ExtraData: { dataSource: {}, entityName, parameters: params },
    } as unknown as TransactionItem;
}

/** Reaches HandleSubmit's internals without a live pool: call executeBatched directly. */
type BatchedRunner = {
    executeBatched: (items: TransactionItem[], client: unknown, results: unknown[]) => Promise<void>;
    executeWithoutVariables: (items: TransactionItem[], client: unknown, results: unknown[]) => Promise<void>;
};
function makeGroup(): BatchedRunner {
    const g = new PostgreSQLTransactionGroup();
    g.BatchedSubmit = true;
    return g as unknown as BatchedRunner;
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
        const results: Array<{ Success: boolean; Result: unknown }> = [];
        await makeGroup().executeBatched(items, client, results);

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

    it('keeps the mapping exact when a middle item returns no rows', async () => {
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
        const results: Array<{ Success: boolean; Result: unknown }> = [];
        await makeGroup().executeBatched(items, client, results);
        expect(results.length).toBe(3);
        expect(results[0].Success).toBe(true);
        expect(results[1].Success).toBe(false); // no rows = the same "no result" the serial path reports
        expect(results[2].Success).toBe(true);
        expect((results[2].Result as { ID: string }).ID).toBe('c1'); // did NOT drift onto item 1
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
        const results: unknown[] = [];
        await makeGroup().executeBatched(items, client, results);
        // Sequential path = one query per item (2), not one batch (1).
        expect(calls.length).toBe(2);
        // And the un-inlinable value travelled as a PARAMETER, never as text.
        expect(calls[0].params?.length).toBe(1);
    });

    it('falls back to sequential when the client has no escapeLiteral', async () => {
        const { client, calls } = makeClient({ withEscape: false, multiResult: () => [{ rows: [] }] });
        const items = [makeItem('SELECT * FROM sp_x($1)', ['v'], 'X')];
        const results: unknown[] = [];
        await makeGroup().executeBatched(items, client, results);
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
        const results: Array<{ Success: boolean }> = [];
        await expect(makeGroup().executeBatched(items, client, results)).rejects.toThrow(/rolled back/);
        expect(results.length).toBe(2);
        expect(results.every(r => r.Success === false)).toBe(true);
    });
});
