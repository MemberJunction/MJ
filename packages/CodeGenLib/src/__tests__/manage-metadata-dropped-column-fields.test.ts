import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../Misc/status_logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/status_logging')>();
    return { ...actual, logError: vi.fn(), logStatus: vi.fn() };
});

import { logError } from '../Misc/status_logging';
import { ManageMetadataBase, type DroppedColumnField } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import type { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult, CodeGenTransaction } from '../Database/codeGenDatabaseProvider';

/**
 * CodeGen's first pass deletes the entity fields whose column is gone from the entity's base table: a renamed or
 * dropped column. These tests pin the SQL it generates (SQL Server dialect), one guard at a time, and the run-level flow
 * (what is deleted, what the second pass then cleans up, what is never touched). The same SQL runs against a live
 * SQL Server database in integration/dropped-column-fields.integration.test.ts and, through a full CodeGen run, in the
 * feature-pipelines codegen-dropped-column rig (rigs/feature-pipelines/codegen-dropped-column.ts).
 */

const CHILD_ENTITY = '3BED585D-B150-4899-AB06-8A19624EA9BE';
const OTHER_ENTITY = '9F2C1A4E-0D6B-4E8A-9C3F-5B7D2E1A6C84';
const OLD_FIELD = 'C1A2B3C4-D5E6-4F70-8192-A3B4C5D6E7F8';
const SECOND_FIELD = 'D2B3C4D5-E6F7-4081-92A3-B4C5D6E7F809';

/** SQL Server identifier quoting, as the provider emits it. */
const q = (name: string): string => `[${name}]`;

/** A connection that answers each query from a script and records what was sent. */
class ScriptedConnection implements CodeGenConnection {
    public readonly Queries: string[] = [];
    constructor(private readonly answer: (sql: string) => Array<Record<string, unknown>>) {}
    public get Dialect(): SQLDialect {
        return new SQLServerDialect();
    }
    public async query(sql: string): Promise<CodeGenQueryResult> {
        this.Queries.push(sql);
        return { recordset: this.answer(sql) };
    }
    public async queryWithParams(): Promise<CodeGenQueryResult> {
        return { recordset: [] };
    }
    public async executeStoredProcedure(): Promise<CodeGenQueryResult> {
        return { recordset: [] };
    }
    public async beginTransaction(): Promise<CodeGenTransaction> {
        return {
            query: async (sql: string): Promise<CodeGenQueryResult> => this.query(sql),
            commit: async (): Promise<void> => undefined,
            rollback: async (): Promise<void> => undefined,
        };
    }
}

class DroppedColumnMM extends ManageMetadataBase {
    constructor(private readonly provider: CodeGenDatabaseProvider, private readonly hasExternalDataSourceColumn: boolean = true) {
        super();
    }
    protected override get dbProvider(): CodeGenDatabaseProvider {
        return this.provider;
    }
    protected override async entityHasExternalDataSourceColumn(): Promise<boolean> {
        return this.hasExternalDataSourceColumn;
    }
    public FindSQL(excludeSchemas: string[], entityIDs?: string[], hasEDS: boolean = true): string | null {
        return this.BuildDroppedColumnFieldsQuerySQL(excludeSchemas, entityIDs, hasEDS);
    }
    public DeleteSQL(fields: DroppedColumnField[]): string {
        return this.BuildDroppedColumnFieldsDeleteSQL(fields);
    }
    public FirstPass(pool: CodeGenConnection, excludeSchemas: string[], entityIDs?: string[]): Promise<boolean> {
        return this.DeleteFieldsOfDroppedColumns(pool, excludeSchemas, entityIDs);
    }
    public SecondPass(pool: CodeGenConnection, excludeSchemas: string[], entityIDs?: string[]): Promise<boolean> {
        return this.deleteUnneededEntityFields(pool, excludeSchemas, entityIDs);
    }
    public static Narrow(rows: ReadonlyArray<Record<string, unknown>>): DroppedColumnField[] {
        return ManageMetadataBase.ToDroppedColumnFields(rows);
    }
}

function field(over: Partial<DroppedColumnField> = {}): DroppedColumnField {
    return { ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'MJ: Feature Values', ...over };
}

/** Collapse whitespace so assertions do not depend on the template's indentation. */
function flat(sql: string | null): string {
    return (sql ?? '').replace(/\s+/g, ' ');
}

describe('first-pass dropped-column field delete', () => {
    const mm = new DroppedColumnMM(new SQLServerCodeGenProvider());

    describe('the query that finds the fields', () => {
        const sql = flat(mm.FindSQL(['sys', 'staging']));

        it('reads only non-virtual fields: a virtual field lives in the view, so the base table is no evidence about it', () => {
            expect(sql).toContain(`ef.${q('IsVirtual')} = 0`);
        });

        it('skips virtual entities: their "base table" is a view CodeGen is about to regenerate', () => {
            expect(sql).toContain(`e.${q('VirtualEntity')} = 0`);
        });

        it('requires the base table to exist, so an entity whose table is missing is skipped rather than emptied', () => {
            expect(sql).toMatch(/AND EXISTS \(SELECT 1 FROM INFORMATION_SCHEMA\.TABLES t WHERE t\.TABLE_SCHEMA = e\.\S+ AND t\.TABLE_NAME = e\.\S+\)/);
            expect(sql).toContain(`t.TABLE_NAME = e.${q('BaseTable')}`);
        });

        it('requires the column to be absent from the base TABLE — never consults a base view, so a missing or stale view deletes nothing', () => {
            expect(sql).toMatch(/AND NOT EXISTS \(SELECT 1 FROM INFORMATION_SCHEMA\.COLUMNS c WHERE c\.TABLE_SCHEMA = e\.\S+ AND c\.TABLE_NAME = e\.\S+ AND c\.COLUMN_NAME = ef\.\S+\)/);
            expect(sql).toContain(`c.TABLE_NAME = e.${q('BaseTable')}`);
            expect(sql).toContain(`c.COLUMN_NAME = ef.${q('Name')}`);
            expect(sql).not.toContain('BaseView');
            expect(sql).not.toContain('vwSQLColumnsAndEntityFields');
        });

        it('reads entity metadata through vwEntities, the view the ExternalDataSourceID guard checks', () => {
            expect(sql).toContain(`INNER JOIN ${q('__mj')}.${q('vwEntities')} e ON e.${q('ID')} = ef.${q('EntityID')}`);
        });

        it('skips external-data-source entities when the column exists, and never names the column when it does not', () => {
            expect(sql).toContain(`e.${q('ExternalDataSourceID')} IS NULL`);
            expect(flat(mm.FindSQL([], undefined, false))).not.toContain('ExternalDataSourceID');
        });

        it('skips excluded schemas (escaped), and adds no clause when nothing is excluded', () => {
            expect(sql).toContain(`e.${q('SchemaName')} NOT IN ('sys', 'staging')`);
            expect(flat(mm.FindSQL(["o'brien"]))).toContain("NOT IN ('o''brien')");
            expect(flat(mm.FindSQL([]))).not.toContain('NOT IN');
        });

        it('limits a scoped run to the valid entity IDs it names', () => {
            const scoped = flat(mm.FindSQL([], [CHILD_ENTITY, 'not-a-uuid', OTHER_ENTITY]));
            expect(scoped).toContain(`e.${q('ID')} IN ('${CHILD_ENTITY}', '${OTHER_ENTITY}')`);
            expect(scoped).not.toContain('not-a-uuid');
            expect(flat(mm.FindSQL([], []))).not.toMatch(/e\.\S+ IN \(/);
        });

        it('returns no query (never "IN ()") when every scoped ID is invalid: nothing named is in scope', () => {
            expect(mm.FindSQL([], ['not-a-uuid', ''])).toBeNull();
        });

        it('aliases the four columns the narrowing reads, quoted for the platform', () => {
            expect(sql).toContain(`ef.${q('ID')} AS ${q('ID')}, ef.${q('EntityID')} AS ${q('EntityID')}, ef.${q('Name')} AS ${q('Name')}, e.${q('Name')} AS ${q('Entity')}`);
        });
    });

    describe('the statements that delete them (in spDeleteUnneededEntityFields order)', () => {
        const sql = flat(mm.DeleteSQL([field(), field({ ID: SECOND_FIELD, Name: 'Notes' })]));

        it('touches __mj_UpdatedAt of each affected entity once, then deletes value lists, then the fields', () => {
            const touch = sql.indexOf(`UPDATE ${q('__mj')}.${q('Entity')} SET ${q('__mj_UpdatedAt')} = GETUTCDATE() WHERE ${q('ID')} IN ('${CHILD_ENTITY}')`);
            const values = sql.indexOf(`DELETE FROM ${q('__mj')}.${q('EntityFieldValue')} WHERE ${q('EntityFieldID')} IN ('${OLD_FIELD}', '${SECOND_FIELD}')`);
            const fields = sql.indexOf(`DELETE FROM ${q('__mj')}.${q('EntityField')} WHERE ${q('ID')} IN ('${OLD_FIELD}', '${SECOND_FIELD}')`);
            expect(touch).toBeGreaterThanOrEqual(0);
            expect(values).toBeGreaterThan(touch);
            expect(fields).toBeGreaterThan(values);
        });

        it('never touches EntityRelationship: the relationship pass re-points a renamed column\'s relationship first', () => {
            expect(sql).not.toContain('EntityRelationship');
        });
    });

    describe('a CodeGen run', () => {
        let restoreSQLOutput: () => void;
        beforeAll(() => { restoreSQLOutput = SQLLogging.suppressOutputForTests(); });
        afterAll(() => restoreSQLOutput());
        beforeEach(() => {
            ManageMetadataBase.modifiedEntityList = [];
            vi.mocked(logError).mockClear();
        });

        /** Answers the find query with `stale`, the second-pass procedure with `procDeleted`, everything else empty. */
        function connection(stale: Array<Record<string, unknown>>, procDeleted: Array<Record<string, unknown>> = []): ScriptedConnection {
            return new ScriptedConnection((sql) => {
                if (sql.includes('INFORMATION_SCHEMA.TABLES t')) return stale;
                if (sql.includes('spDeleteUnneededEntityFields')) return procDeleted;
                return [];
            });
        }
        const deletes = (pool: ScriptedConnection): string[] => pool.Queries.filter((s) => s.includes('whose column was dropped'));
        const relationshipCleanup = (pool: ScriptedConnection): string[] => pool.Queries.filter((s) => s.includes('EntityRelationship'));

        it('no-op: nothing is gone from a base table, so nothing is deleted and the second pass cleans up nothing', async () => {
            const pool = connection([]);
            const run = new DroppedColumnMM(new SQLServerCodeGenProvider());
            expect(await run.FirstPass(pool, ['sys'])).toBe(true);
            expect(pool.Queries).toHaveLength(1);
            expect(await run.SecondPass(pool, ['sys'])).toBe(true);
            expect(deletes(pool)).toHaveLength(0);
            expect(relationshipCleanup(pool)).toHaveLength(0);
            expect(ManageMetadataBase.modifiedEntityList).toEqual([]);
        });

        it('rename: the old column\'s field is deleted in the first pass; the second pass removes a relationship still joined on it', async () => {
            const pool = connection([{ ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'MJ: Feature Values' }]);
            const run = new DroppedColumnMM(new SQLServerCodeGenProvider());
            expect(await run.FirstPass(pool, ['sys'])).toBe(true);
            const [batch] = deletes(pool);
            expect(flat(batch)).toContain(`DELETE FROM ${q('__mj')}.${q('EntityField')} WHERE ${q('ID')} IN ('${OLD_FIELD}')`);
            expect(ManageMetadataBase.modifiedEntityList).toEqual(['MJ: Feature Values']);
            // The relationship pass ran in between (re-pointing a renamed FK keeps its row). Whatever still joins on the
            // deleted name — and only while that column is still absent from the base table — goes in the second pass,
            // even though the procedure itself deletes nothing more.
            expect(await new DroppedColumnMM(new SQLServerCodeGenProvider()).SecondPass(pool, ['sys'])).toBe(true);
            const [cleanup] = relationshipCleanup(pool);
            expect(flat(cleanup)).toContain(`${q('RelatedEntityJoinField')} = 'LLMModelID'`);
            expect(flat(cleanup)).toContain(`${q('RelatedEntityID')} = '${CHILD_ENTITY}'`);
            expect(flat(cleanup)).toContain('NOT EXISTS ( SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS c');
        });

        it('drop: same path — the field and its value list go first, its relationship in the second pass', async () => {
            const pool = connection([{ ID: SECOND_FIELD, EntityID: CHILD_ENTITY, Name: 'Notes', Entity: 'MJ: Feature Values' }]);
            const run = new DroppedColumnMM(new SQLServerCodeGenProvider());
            expect(await run.FirstPass(pool, [])).toBe(true);
            expect(flat(deletes(pool)[0])).toContain(`${q('EntityFieldValue')} WHERE ${q('EntityFieldID')} IN ('${SECOND_FIELD}')`);
            await run.SecondPass(pool, []);
            expect(flat(relationshipCleanup(pool)[0])).toContain(`${q('RelatedEntityJoinField')} = 'Notes'`);
        });

        it('a second pass consumes the list once: a later run does not clean up the earlier run\'s fields again', async () => {
            const pool = connection([{ ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'MJ: Feature Values' }]);
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(pool, []);
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).SecondPass(pool, []);
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).SecondPass(pool, []);
            expect(relationshipCleanup(pool)).toHaveLength(1);
        });

        it('a new first pass starts from an empty list: a run whose second pass never ran leaks nothing into the next run', async () => {
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(connection([{ ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'X' }]), []);
            // that run threw before its second pass; the next run's first pass finds nothing
            const next = connection([]);
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(next, []);
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).SecondPass(next, []);
            expect(relationshipCleanup(next)).toHaveLength(0);
        });

        it('a field is queued for the second pass only once its delete ran: a failed delete queues nothing', async () => {
            const failing = new ScriptedConnection((sql) => {
                if (sql.includes('INFORMATION_SCHEMA.TABLES t')) return [{ ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'X' }];
                if (sql.includes('whose column was dropped')) throw new Error('deadlock victim');
                return [];
            });
            expect(await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(failing, [])).toBe(false);
            const next = connection([]);
            await new DroppedColumnMM(new SQLServerCodeGenProvider()).SecondPass(next, []);
            expect(relationshipCleanup(next)).toHaveLength(0);
        });

        it('an invalid scope sends no query at all', async () => {
            const pool = connection([]);
            expect(await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(pool, [], ['not-a-uuid'])).toBe(true);
            expect(pool.Queries).toHaveLength(0);
        });

        it('a database error fails the pass and logs the error\'s message', async () => {
            const pool = new ScriptedConnection(() => { throw new Error('connection reset'); });
            expect(await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(pool, [])).toBe(false);
            expect(logError).toHaveBeenCalledWith('connection reset');
        });

        it('a non-Error throw is logged as text', async () => {
            const pool = new ScriptedConnection(() => { throw 'socket hang up'; });
            expect(await new DroppedColumnMM(new SQLServerCodeGenProvider()).FirstPass(pool, [])).toBe(false);
            expect(logError).toHaveBeenCalledWith('socket hang up');
        });
    });
});

describe('ToDroppedColumnFields', () => {
    it('keeps well-formed rows and drops any whose IDs are not UUIDs or whose names are not strings', () => {
        const good = { ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'MJ: Feature Values' };
        expect(DroppedColumnMM.Narrow([
            good,
            { ...good, ID: "1'); DROP TABLE x; --" },
            { ...good, EntityID: 42 },
            { ...good, Name: null },
            { ID: OLD_FIELD },
        ])).toEqual([good]);
    });
});
