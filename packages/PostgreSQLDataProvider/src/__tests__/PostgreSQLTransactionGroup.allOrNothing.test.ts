/**
 * All-or-nothing on the PostgreSQL transaction group, through the public Submit().
 *
 * The generated PostgreSQL delete function answers a delete that removed nothing with a row of NULL
 * keys, and a save that persisted nothing returns no row. Either item must fail the WHOLE group —
 * ROLLBACK, no COMMIT, Submit() false, no item reported as a success — exactly like a statement that
 * threw, and exactly as the SQL Server group does. Before this, all three PostgreSQL paths judged an
 * item by "returned a row", so a no-op delete was an item success and the group committed the rest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseEntity, EntityInfo, IEntityDataProvider, LocalCacheManager, TransactionGroupProviderError, TransactionItem, TransactionVariable } from '@memberjunction/core';
import { PostgreSQLTransactionGroup } from '../PostgreSQLTransactionGroup.js';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

const RECORD_ID = 'D0A1B2C3-0000-4000-8000-000000000001';
const SIBLING_ID = 'D0A1B2C3-0000-4000-8000-000000000002';

class TestEntity extends BaseEntity {}

/** The real provider with row post-processing reduced to a pass-through (the rows carry no binary or encrypted columns). */
class PassThroughPGProvider extends PostgreSQLDataProvider {
    public override async ProcessEntityRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
        return rows;
    }
}

function widgetEntityInfo(): EntityInfo {
    const field = { EntityID: 'E0000000-0000-4000-8000-0000000000AA', AllowsNull: false, IsVirtual: false, AllowUpdateAPI: true, Status: 'Active', Precision: 0, Scale: 0 };
    return new EntityInfo({
        ID: 'E0000000-0000-4000-8000-0000000000AA',
        Name: 'Widgets',
        Status: 'Active',
        SchemaName: 'app',
        BaseTable: 'Widget',
        BaseView: 'vwWidgets',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: [
            { ...field, ID: 'F0000000-0000-4000-8000-0000000000A1', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsUnique: true, AllowUpdateAPI: false },
            { ...field, ID: 'F0000000-0000-4000-8000-0000000000A2', Sequence: 2, Name: 'Name', Type: 'nvarchar', Length: 200 },
        ],
        EntityPermissions: [],
    });
}

function savedWidget(id: string, provider: PostgreSQLDataProvider): TestEntity {
    // DatabaseProviderBase.Load declares `Record | null`, which this package's strict null checks do not
    // accept for IEntityDataProvider's `{}`; MJCore itself compiles without them. Same object, narrower view.
    const entity = new TestEntity(widgetEntityInfo(), provider as IEntityDataProvider);
    entity.SetMany({ ID: id, Name: 'Widget' }, false, true, true);
    return entity;
}

type Scripted = { rows: Record<string, unknown>[] };

/** A fake pool whose one client records every statement and answers saves/deletes from a script. */
function makePool(script: { single?: Scripted[]; batch?: Scripted[] }) {
    const statements: string[] = [];
    const single = [...(script.single ?? [])];
    const client = {
        query: async (text: string) => {
            statements.push(text);
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
            if (text.includes('__mj_batch_item')) return script.batch ?? [];
            return single.shift() ?? { rows: [] };
        },
        escapeLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`,
        release: () => undefined,
    };
    return { pool: { connect: async () => client }, statements };
}

function enrol(group: PostgreSQLTransactionGroup, entity: BaseEntity, operation: 'Create' | 'Update' | 'Delete', pool: object, id: string) {
    const callback = vi.fn();
    group.AddTransaction(new TransactionItem(entity, operation, `SELECT * FROM app.sp_${operation.toLowerCase()}_widget($1)`, [id], { dataSource: pool, entityName: 'Widgets', parameters: [id] }, callback));
    return callback;
}

type Mode = 'sequential' | 'sequential-with-variables' | 'batched';

describe('PostgreSQLTransactionGroup: an item that did not do its work fails the whole group', () => {
    let provider: PassThroughPGProvider;
    beforeEach(() => {
        provider = new PassThroughPGProvider();
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(false);
        vi.spyOn(console, 'error').mockImplementation(() => undefined); // Submit() logs the expected failure
    });
    afterEach(() => vi.restoreAllMocks());

    function groupFor(mode: Mode, saved: BaseEntity): PostgreSQLTransactionGroup {
        const group = new PostgreSQLTransactionGroup();
        group.BatchedSubmit = mode === 'batched';
        if (mode === 'sequential-with-variables') {
            group.AddVariable(new TransactionVariable('SavedID', saved, 'ID', 'Define'));
        }
        return group;
    }

    for (const mode of ['sequential', 'sequential-with-variables', 'batched'] as const) {
        it(`${mode}: a delete that answers NULL keys rolls back the group — no COMMIT, Submit() false, no item succeeds`, async () => {
            const sibling = savedWidget(SIBLING_ID, provider);
            const doomed = savedWidget(RECORD_ID, provider);
            const siblingRow = { ID: SIBLING_ID.toLowerCase(), Name: 'Renamed' };
            const { pool, statements } = makePool({
                single: [{ rows: [siblingRow] }, { rows: [{ ID: null }] }],
                batch: [{ rows: [{ __mj_batch_item: 0 }] }, { rows: [siblingRow] }, { rows: [{ __mj_batch_item: 1 }] }, { rows: [{ ID: null }] }],
            });
            const group = groupFor(mode, sibling);
            const siblingCallback = enrol(group, sibling, 'Update', pool, SIBLING_ID);
            const doomedCallback = enrol(group, doomed, 'Delete', pool, RECORD_ID);

            expect(await group.Submit()).toBe(false);
            expect(statements).toContain('ROLLBACK');
            expect(statements).not.toContain('COMMIT');
            expect(group.Status).toBe('Failed');
            expect(siblingCallback.mock.calls.every(([, success]) => success === false)).toBe(true);
            expect(doomedCallback.mock.calls.every(([, success]) => success === false)).toBe(true);
        });

        it(`${mode}: a save that returns no row rolls back the group too`, async () => {
            const first = savedWidget(SIBLING_ID, provider);
            const lost = savedWidget(RECORD_ID, provider);
            const firstRow = { ID: SIBLING_ID, Name: 'Renamed' };
            const { pool, statements } = makePool({
                single: [{ rows: [firstRow] }, { rows: [] }],
                batch: [{ rows: [{ __mj_batch_item: 0 }] }, { rows: [firstRow] }, { rows: [{ __mj_batch_item: 1 }] }, { rows: [] }],
            });
            const group = groupFor(mode, first);
            enrol(group, first, 'Update', pool, SIBLING_ID);
            enrol(group, lost, 'Update', pool, RECORD_ID);

            expect(await group.Submit()).toBe(false);
            expect(statements).toContain('ROLLBACK');
            expect(statements).not.toContain('COMMIT');
        });

        it(`${mode}: a delete that reports the record's keys (any UUID letter case) commits`, async () => {
            const sibling = savedWidget(SIBLING_ID, provider);
            const deleted = savedWidget(RECORD_ID, provider);
            const siblingRow = { ID: SIBLING_ID, Name: 'Renamed' };
            const deletedRow = { ID: RECORD_ID.toLowerCase() };
            const { pool, statements } = makePool({
                single: [{ rows: [siblingRow] }, { rows: [deletedRow] }],
                batch: [{ rows: [{ __mj_batch_item: 0 }] }, { rows: [siblingRow] }, { rows: [{ __mj_batch_item: 1 }] }, { rows: [deletedRow] }],
            });
            const group = groupFor(mode, sibling);
            enrol(group, sibling, 'Update', pool, SIBLING_ID);
            const deletedCallback = enrol(group, deleted, 'Delete', pool, RECORD_ID);

            expect(await group.Submit()).toBe(true);
            expect(statements).toContain('COMMIT');
            expect(statements).not.toContain('ROLLBACK');
            expect(deletedCallback).toHaveBeenCalledWith(deletedRow, true);
        });
    }

    it('refuses, before BEGIN, an item whose record does not save through a PostgreSQL provider', async () => {
        const foreign: IEntityDataProvider = { Config: async () => true, Load: async () => ({}), Save: async () => ({}), Delete: async () => true, GetRecordChanges: async () => [] };
        const good = savedWidget(SIBLING_ID, provider);
        const stray = new TestEntity(widgetEntityInfo(), foreign);
        const { pool, statements } = makePool({});
        const group = new PostgreSQLTransactionGroup();
        enrol(group, good, 'Update', pool, SIBLING_ID);
        const strayCallback = enrol(group, stray, 'Update', pool, RECORD_ID);

        expect(await group.Submit()).toBe(false);
        expect(statements).toEqual([]); // no client taken, no BEGIN
        expect(strayCallback.mock.calls[0][0]).toBeInstanceOf(TransactionGroupProviderError);
    });

    it('refuses, before BEGIN, a group whose items were queued on different connection pools', async () => {
        const first = makePool({});
        const second = makePool({});
        const group = new PostgreSQLTransactionGroup();
        const callback = enrol(group, savedWidget(SIBLING_ID, provider), 'Update', first.pool, SIBLING_ID);
        enrol(group, savedWidget(RECORD_ID, provider), 'Update', second.pool, RECORD_ID);

        expect(await group.Submit()).toBe(false);
        expect([...first.statements, ...second.statements]).toEqual([]);
        expect(String(callback.mock.calls[0][0])).toMatch(/queued on another connection pool than the rest of the group/);
    });
});
