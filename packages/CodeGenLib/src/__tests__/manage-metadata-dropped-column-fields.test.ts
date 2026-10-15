import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import type { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult, CodeGenTransaction } from '../Database/codeGenDatabaseProvider';

const CHILD_ENTITY = '3BED585D-B150-4899-AB06-8A19624EA9BE';
const OLD_FIELD = 'C1A2B3C4-D5E6-4F70-8192-A3B4C5D6E7F8';

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
    protected override get dbProvider(): CodeGenDatabaseProvider {
        return new SQLServerCodeGenProvider();
    }
    protected override async entityHasExternalDataSourceColumn(): Promise<boolean> {
        return true;
    }
    public FirstPass(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
        return this.DeleteFieldsOfDroppedColumns(pool, excludeSchemas);
    }
}

describe('first-pass delete of fields whose column was dropped', () => {
    let restoreSQLOutput: () => void;
    beforeAll(() => { restoreSQLOutput = SQLLogging.suppressOutputForTests(); });
    afterAll(() => restoreSQLOutput());

    it('finds the fields missing from the base table and deletes them with their value lists', async () => {
        ManageMetadataBase.modifiedEntityList = [];
        const pool = new ScriptedConnection((sql) => sql.includes('INFORMATION_SCHEMA.TABLES t')
            ? [{ ID: OLD_FIELD, EntityID: CHILD_ENTITY, Name: 'LLMModelID', Entity: 'MJ: Feature Values' }]
            : []);

        expect(await new DroppedColumnMM().FirstPass(pool, ['sys'])).toBe(true);

        const [find, del] = pool.Queries.map((s) => s.replace(/\s+/g, ' '));
        expect(find).toContain('[IsVirtual] = 0');
        expect(find).toContain("[SchemaName] NOT IN ('sys')");
        expect(find).toContain('NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = e.[SchemaName] AND c.TABLE_NAME = e.[BaseTable] AND c.COLUMN_NAME = ef.[Name])');
        expect(del).toContain(`DELETE FROM [__mj].[EntityFieldValue] WHERE [EntityFieldID] IN ('${OLD_FIELD}')`);
        expect(del).toContain(`DELETE FROM [__mj].[EntityField] WHERE [ID] IN ('${OLD_FIELD}')`);
        expect(ManageMetadataBase.modifiedEntityList).toEqual(['MJ: Feature Values']);
    });
});
