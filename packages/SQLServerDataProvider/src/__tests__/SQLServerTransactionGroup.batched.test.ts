/**
 * BatchedSubmit on the SQL Server transaction group.
 *
 * The property this opt-in sells is "same statements, same order, same transaction, ONE round
 * trip" — so these tests count `request.query` calls, verify the sentinel-based per-item result
 * mapping (a statement returning no rows produces NO recordset, so positional zipping would
 * drift), and pin the global renumbering of per-item `?` placeholders into one @p namespace.
 */
import { describe, it, expect, vi } from 'vitest';

const queryCalls: Array<{ text: string; inputs: Record<string, unknown> }> = [];
let scriptedRecordsets: unknown[][] = [];
let throwOnQuery: Error | undefined;

vi.mock('mssql', () => {
    class FakeRequest {
        private inputs: Record<string, unknown> = {};
        constructor(_tx: unknown) {}
        input(name: string, value: unknown) {
            this.inputs[name] = value;
        }
        async query(text: string) {
            queryCalls.push({ text, inputs: { ...this.inputs } });
            if (throwOnQuery) throw throwOnQuery;
            return { recordsets: scriptedRecordsets, recordset: scriptedRecordsets[0] ?? [] };
        }
    }
    class FakeTransaction {
        constructor(_pool: unknown) {}
        async begin() {}
        async commit() {}
        async rollback() {}
    }
    return { default: { Request: FakeRequest, Transaction: FakeTransaction } };
});

// GenericDatabaseProvider.LogSQLStatement is a static side-channel — capture it, because the
// batched path must still log PER ITEM (migration capture replays statements one record at a
// time and reads each item's own simpleSQLFallback).
const logCalls: Array<{ query: string; description?: string; fallback?: string }> = [];
vi.mock('@memberjunction/generic-database-provider', () => ({
    GenericDatabaseProvider: {
        LogSQLStatement: async (query: string, _params: unknown, description?: string, _isMutation?: boolean, fallback?: string) => {
            logCalls.push({ query, description, fallback });
        },
    },
}));

import { SQLServerTransactionGroup } from '../SQLServerTransactionGroup.js';
import type { TransactionItem, TransactionResult } from '@memberjunction/core';
import sql from 'mssql';

function makeItem(instruction: string, vars: unknown[] | null, entityName: string): TransactionItem {
    return {
        BaseEntity: { EntityInfo: { Name: entityName }, ContextCurrentUser: undefined },
        Instruction: instruction,
        Vars: vars,
        OperationType: 'Create',
        ExtraData: { dataSource: {}, entityName, simpleSQLFallback: `SIMPLE:${entityName}` },
    } as unknown as TransactionItem;
}

type Runner = {
    executeBatchedNoVars: (
        items: TransactionItem[],
        transaction: unknown,
        sqlProvider: unknown,
        returnResults: TransactionResult[]
    ) => Promise<void>;
};

function run(items: TransactionItem[], results: TransactionResult[]) {
    const g = new SQLServerTransactionGroup() as unknown as Runner;
    const provider = { ProcessEntityRows: async (rows: unknown[]) => rows };
    const tx = new (sql as unknown as { Transaction: new (p: unknown) => unknown }).Transaction({});
    return g.executeBatchedNoVars(items, tx, provider, results);
}

describe('SQLServerTransactionGroup.BatchedSubmit', () => {
    it('sends the whole group as ONE query with sentinel-mapped per-item results', async () => {
        queryCalls.length = 0;
        throwOnQuery = undefined;
        scriptedRecordsets = [
            [{ __mj_batch_item: 0 }],
            [{ ID: 'a1' }],
            [{ __mj_batch_item: 1 }],
            // item 1's statement returned NO rows → no recordset at all
            [{ __mj_batch_item: 2 }],
            [{ ID: 'c1' }],
        ];
        const items = [
            makeItem('EXEC spCreateA @x=1', null, 'A'),
            makeItem('EXEC spCreateB @y=2', null, 'B'),
            makeItem('EXEC spCreateC @z=3', null, 'C'),
        ];
        const results: TransactionResult[] = [];
        await run(items, results);

        expect(queryCalls.length).toBe(1); // the property being sold
        const text = queryCalls[0].text;
        expect(text).toContain('SELECT 0 AS [__mj_batch_item]');
        expect(text).toContain('SELECT 2 AS [__mj_batch_item]');
        expect(text.indexOf('spCreateA')).toBeLessThan(text.indexOf('spCreateB')); // order preserved
        expect(results.length).toBe(3);
        expect((results[0] as unknown as { Success: boolean }).Success).toBe(true);
        expect((results[1] as unknown as { Success: boolean }).Success).toBe(false); // empty ≠ drifted
        expect((results[2] as unknown as { Result: { ID: string } }).Result.ID).toBe('c1');
    });

    it('renumbers per-item ? placeholders into one global @p namespace', async () => {
        queryCalls.length = 0;
        throwOnQuery = undefined;
        scriptedRecordsets = [];
        const items = [
            makeItem('EXEC spA @v=?', ['first'], 'A'),
            makeItem('EXEC spB @v=?, @w=?', ['second', 'third'], 'B'),
        ];
        const results: TransactionResult[] = [];
        await run(items, results);
        const { text, inputs } = queryCalls[0];
        expect(text).toContain('@p0');
        expect(text).toContain('@p1');
        expect(text).toContain('@p2');
        expect(text).not.toContain('?');
        expect(inputs).toEqual({ p0: 'first', p1: 'second', p2: 'third' });
    });

    it('logs EVERY item with its own fallback, not just item 0 under the combined text', async () => {
        // Migration capture replays statements one record at a time and reads each item's own
        // record-change-free `simpleSQLFallback`. Logging the combined batch alone under item 0's
        // fallback would capture something nobody can replay and attribute every row to the first
        // entity — a degraded dev-facing capture that only appears when batching and SQL logging
        // are both on.
        queryCalls.length = 0;
        logCalls.length = 0;
        throwOnQuery = undefined;
        scriptedRecordsets = [];
        const items = [
            makeItem('EXEC spCreateA', null, 'A'),
            makeItem('EXEC spCreateB', null, 'B'),
            makeItem('EXEC spCreateC', null, 'C'),
        ];
        await run(items, []);

        expect(queryCalls.length).toBe(1); // still ONE round trip — logging changes nothing on the wire
        // Every item is logged under its OWN fallback...
        for (const entityName of ['A', 'B', 'C']) {
            const entry = logCalls.find(c => c.fallback === `SIMPLE:${entityName}`);
            expect(entry, `item ${entityName} must be logged with its own simpleSQLFallback`).toBeDefined();
            expect(entry!.query).toContain(`spCreate${entityName}`);
        }
        // ...and the combined batch is still logged once, without borrowing anyone's fallback.
        const batchEntry = logCalls.find(c => c.description?.includes('Batched 3 operation(s)'));
        expect(batchEntry).toBeDefined();
        expect(batchEntry!.fallback).toBeUndefined();
    });

    it('fails the whole group on a batch error, mirroring the serial rollback contract', async () => {
        queryCalls.length = 0;
        scriptedRecordsets = [];
        throwOnQuery = new Error('Violation of UNIQUE KEY constraint');
        const items = [makeItem('EXEC spA', null, 'A'), makeItem('EXEC spB', null, 'B')];
        const results: TransactionResult[] = [];
        await expect(run(items, results)).rejects.toThrow(/rolled back/);
        expect(results.length).toBe(2);
        expect(results.every(r => (r as unknown as { Success: boolean }).Success === false)).toBe(true);
        throwOnQuery = undefined;
    });
});

/**
 * Per-item variable scoping.
 *
 * T-SQL scopes DECLARE to the BATCH — `BEGIN…END` creates no declaration scope — so concatenating
 * N generated CRUD wrappers declared `@ResultTable` / `@ID` / `@ResultChangesTable` N times and SQL
 * Server rejected the whole batch with "The variable name '@ResultChangesTable' has already been
 * declared." Regression for v6.1.0-edge.5: this fired for ANY group of two or more record-change-
 * tracked items, which broke IntegrationEngine's sync writes (it sets BatchedSubmit = true) and
 * failed four checks in the transaction-groups-batched bundle. That bundle is mutation-gated, so
 * integration.yml — which omits RUN_MUTATION_TESTS=1 — had never executed it.
 */
describe('SQLServerTransactionGroup.scopeItemVariables', () => {
    const wrapper = (pk: string) => `
        DECLARE @ResultTable TABLE ([ID] uniqueidentifier);
        INSERT INTO @ResultTable
        EXEC [__mj].[spCreateTask] @Name='${pk}';
        DECLARE @ID NVARCHAR(MAX);
        SELECT @ID = [ID] FROM @ResultTable;
        IF @ID IS NOT NULL
        BEGIN
            DECLARE @ResultChangesTable TABLE ([ID] uniqueidentifier);
            INSERT INTO @ResultChangesTable
            EXEC [__mj].[spCreateRecordChange_Internal] @EntityName='MJ: Tasks', @RecordID=@ID;
        END;
        SELECT * FROM @ResultTable;`;

    it('renames every DECLAREd variable so two items can share one batch', () => {
        const a = SQLServerTransactionGroup.scopeItemVariables(wrapper('a'), 0);
        const b = SQLServerTransactionGroup.scopeItemVariables(wrapper('b'), 1);
        for (const v of ['@ResultTable', '@ID', '@ResultChangesTable']) {
            expect(a).toContain(`${v}_mjb0`);
            expect(b).toContain(`${v}_mjb1`);
        }
        // The whole point: no bare declaration survives to collide across the joined batch.
        const batch = `${a}\n${b}`;
        expect(batch).not.toMatch(/DECLARE\s+@ResultChangesTable\s+TABLE/);
        expect(batch.match(/DECLARE\s+@ResultTable_mjb\d/g)).toHaveLength(2);
    });

    it('does NOT rename a called procedure\'s named arguments', () => {
        // @EntityName / @RecordID belong to spCreateRecordChange_Internal's signature. Renaming one
        // yields "@EntityName_mjb0 is not a parameter for procedure ..." — a fix that trades one
        // batch failure for another.
        const out = SQLServerTransactionGroup.scopeItemVariables(wrapper('a'), 0);
        expect(out).toContain("@EntityName='MJ: Tasks'");
        expect(out).not.toContain('@EntityName_mjb0');
        // ...but a DECLAREd variable passed AS an argument is still renamed, or it would be unbound.
        expect(out).toContain('@RecordID=@ID_mjb0');
    });

    it('does NOT rename a callee parameter that shares a local\'s name', () => {
        // The sharp case: spCreateActionCategory takes a parameter literally named @ID, while the
        // wrapper also declares a local @ID. Position, not spelling, separates them — renaming the
        // argument name gives "@ID_mjb2 is not a parameter for procedure spCreateActionCategory".
        const src = `DECLARE @ID NVARCHAR(MAX);
            SELECT @ID = NEWID();
            EXEC [__mj].[spCreateActionCategory] @ID=@ID, @Name='x';`;
        const out = SQLServerTransactionGroup.scopeItemVariables(src, 2);
        expect(out).toContain('SELECT @ID_mjb2 = NEWID()');   // assignment to the local: renamed
        expect(out).toContain('@ID=@ID_mjb2');                // arg NAME kept, arg VALUE renamed
        expect(out).not.toContain('@ID_mjb2=');
    });

    it('leaves @pN request parameters alone', () => {
        const out = SQLServerTransactionGroup.scopeItemVariables(
            'DECLARE @ID INT; SELECT @ID = 1; EXEC spX @Value=@p0, @Other=@p12;', 3);
        expect(out).toContain('@ID_mjb3');
        expect(out).toContain('@p0');
        expect(out).toContain('@p12');
        expect(out).not.toContain('@p0_mjb3');
    });

    it('does not rewrite text inside string literals or comments', () => {
        const src = `DECLARE @ID INT;
            -- @ID mentioned in a comment
            EXEC spX @Note='the value of @ID is unknown', @Real=@ID;`;
        const out = SQLServerTransactionGroup.scopeItemVariables(src, 0);
        expect(out).toContain("'the value of @ID is unknown'");
        expect(out).toContain('-- @ID mentioned in a comment');
        expect(out).toContain('@Real=@ID_mjb0');
    });

    it('handles escaped quotes without losing track of literal boundaries', () => {
        const src = `DECLARE @ID INT; EXEC spX @A='it''s @ID here', @B=@ID;`;
        const out = SQLServerTransactionGroup.scopeItemVariables(src, 2);
        expect(out).toContain("'it''s @ID here'");
        expect(out).toContain('@B=@ID_mjb2');
    });

    it('is a no-op when the item declares nothing', () => {
        const src = "EXEC [__mj].[spDeleteTask] @ID='00000000-0000-0000-0000-000000000000';";
        expect(SQLServerTransactionGroup.scopeItemVariables(src, 0)).toBe(src);
    });
});
