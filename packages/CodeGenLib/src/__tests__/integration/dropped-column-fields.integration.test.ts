/**
 * Runs CodeGen's first-pass delete of fields whose column was dropped (DeleteFieldsOfDroppedColumns) against a live
 * SQL Server catalog. KNOWN LIMITATION: skipped unless MJ_TEST_SQLSERVER_URL names a throwaway database with the MJ core
 * schema migrated; CI does not set it. Each test creates and removes its own schema and entity rows.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { SQLLogging } from '../../Misc/sql_logging';
import type { CodeGenConnection, CodeGenDatabaseProvider } from '../../Database/codeGenDatabaseProvider';
import { SQLServerCodeGenProvider } from '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLServerCodeGenConnection } from '../../Database/providers/sqlserver/SQLServerCodeGenConnection';

const SS_URL = process.env.MJ_TEST_SQLSERVER_URL;

/** SQL Server identifier quoting. */
const q = (name: string): string => `[${name}]`;

function createTables(s: string): string[] {
    return [
        `CREATE SCHEMA [${s}]`,
        `CREATE TABLE [${s}].[Parent] ([ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, [Name] NVARCHAR(100) NOT NULL)`,
        `CREATE TABLE [${s}].[Child] ([ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
            [ParentID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [FK_Child_Parent] REFERENCES [${s}].[Parent]([ID]),
            [Notes] NVARCHAR(200) NULL, [Extra] INT NULL)`,
    ];
}
const renameColumn = (s: string, t: string, from: string, to: string): string => `EXEC sp_rename '${s}.${t}.${from}', '${to}', 'COLUMN'`;
const dropColumn = (s: string, t: string, c: string): string => `ALTER TABLE [${s}].[${t}] DROP COLUMN [${c}]`;
const dropTable = (s: string, t: string): string => `DROP TABLE IF EXISTS [${s}].[${t}]`;
const dropSchema = (s: string): string[] => [`DROP TABLE IF EXISTS [${s}].[Child]`, `DROP TABLE IF EXISTS [${s}].[Parent]`, `DROP SCHEMA IF EXISTS [${s}]`];

class LiveMM extends ManageMetadataBase {
    constructor(private readonly provider: CodeGenDatabaseProvider) {
        super();
    }
    protected override get dbProvider(): CodeGenDatabaseProvider {
        return this.provider;
    }
    public FirstPass(pool: CodeGenConnection, excludeSchemas: string[], entityIDs?: string[]): Promise<boolean> {
        return this.DeleteFieldsOfDroppedColumns(pool, excludeSchemas, entityIDs);
    }
}

/** The IDs of one test's metadata rows. */
interface Fixture {
    Schema: string;
    ParentEntityID: string;
    ChildEntityID: string;
    FieldIDs: Record<'ID' | 'ParentID' | 'Notes' | 'Extra' | 'Parent', string>;
}

const EXCLUDED = ['sys', 'staging'];

describe.skipIf(!SS_URL)('first-pass dropped-column field delete against a live SQL Server database', () => {
    const mj = (table: string): string => `${q('__mj')}.${q(table)}`;
    let connection: CodeGenConnection;
    let close: () => Promise<void>;
    let restoreSQLOutput: () => void;
    let f: Fixture;

    const exec = async (statement: string): Promise<Array<Record<string, unknown>>> => (await connection.query(statement)).recordset ?? [];
    const fieldNames = async (): Promise<string[]> =>
        (await exec(`SELECT ${q('Name')} AS ${q('Name')} FROM ${mj('EntityField')} WHERE ${q('EntityID')} = '${f.ChildEntityID}'`))
            .map((r) => String(r.Name)).sort();
    const count = async (table: string, where: string): Promise<number> =>
        Number((await exec(`SELECT COUNT(*) AS ${q('N')} FROM ${mj(table)} WHERE ${where}`))[0]?.N ?? -1);
    const updatedAt = async (): Promise<number> => {
        const value = (await exec(`SELECT ${q('__mj_UpdatedAt')} AS ${q('U')} FROM ${mj('Entity')} WHERE ${q('ID')} = '${f.ChildEntityID}'`))[0]?.U;
        // mssql returns a Date; String() would drop its milliseconds
        return value instanceof Date ? value.getTime() : Number.NaN;
    };

    beforeAll(async () => {
        restoreSQLOutput = SQLLogging.suppressOutputForTests();
        const pool = await new sql.ConnectionPool(SS_URL ?? '').connect();
        connection = new SQLServerCodeGenConnection(pool);
        close = () => pool.close();
    });
    afterAll(async () => {
        restoreSQLOutput();
        await close();
    });

    beforeEach(async () => {
        const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
        f = {
            Schema: `cg_dropcol_${suffix}`,
            ParentEntityID: randomUUID().toUpperCase(),
            ChildEntityID: randomUUID().toUpperCase(),
            FieldIDs: {
                ID: randomUUID().toUpperCase(), ParentID: randomUUID().toUpperCase(), Notes: randomUUID().toUpperCase(),
                Extra: randomUUID().toUpperCase(), Parent: randomUUID().toUpperCase(),
            },
        };
        for (const statement of createTables(f.Schema)) {
            await exec(statement);
        }
        // The base views (vwParents / vwChildren) are deliberately never created: every scenario also runs with the
        // base view missing, which must change nothing — the evidence is the base table.
        await exec(`INSERT INTO ${mj('Entity')} (${q('ID')}, ${q('Name')}, ${q('BaseTable')}, ${q('BaseView')}, ${q('SchemaName')})
            VALUES ('${f.ParentEntityID}', 'CG DropCol Parents ${suffix}', 'Parent', 'vwParents', '${f.Schema}'),
                   ('${f.ChildEntityID}', 'CG DropCol Children ${suffix}', 'Child', 'vwChildren', '${f.Schema}')`);
        const fields: Array<[keyof Fixture['FieldIDs'], number, string, boolean]> = [
            ['ID', 1, 'uniqueidentifier', false], ['ParentID', 2, 'uniqueidentifier', false], ['Notes', 3, 'nvarchar', false],
            ['Extra', 4, 'int', false], ['Parent', 5, 'nvarchar', true],
        ];
        for (const [name, sequence, type, isVirtual] of fields) {
            await exec(`INSERT INTO ${mj('EntityField')} (${q('ID')}, ${q('EntityID')}, ${q('Name')}, ${q('Sequence')}, ${q('Type')}, ${q('IsVirtual')})
                VALUES ('${f.FieldIDs[name]}', '${f.ChildEntityID}', '${name}', ${sequence}, '${type}', ${isVirtual ? 1 : 0})`);
        }
        await exec(`INSERT INTO ${mj('EntityFieldValue')} (${q('EntityFieldID')}, ${q('Sequence')}, ${q('Value')}) VALUES ('${f.FieldIDs.Notes}', 1, 'Draft')`);
        // a fixed point the first pass must move __mj_UpdatedAt past
        await exec(`UPDATE ${mj('Entity')} SET ${q('Description')} = 'baseline' WHERE ${q('ID')} = '${f.ChildEntityID}'`);
    });

    afterEach(async () => {
        const entities = `'${f.ParentEntityID}', '${f.ChildEntityID}'`;
        await exec(`DELETE FROM ${mj('EntityFieldValue')} WHERE ${q('EntityFieldID')} IN (SELECT ${q('ID')} FROM ${mj('EntityField')} WHERE ${q('EntityID')} IN (${entities}))`);
        await exec(`DELETE FROM ${mj('EntityField')} WHERE ${q('EntityID')} IN (${entities})`);
        await exec(`DELETE FROM ${mj('Entity')} WHERE ${q('ID')} IN (${entities})`);
        for (const statement of dropSchema(f.Schema)) {
            await exec(statement);
        }
    });

    const ALL_FIELDS = ['Extra', 'ID', 'Notes', 'Parent', 'ParentID'];

    it('renamed column: the old field and its value list go, the entity is touched, every other field stays', async () => {
        const before = await updatedAt();
        await exec(renameColumn(f.Schema, 'Child', 'Notes', 'Remarks'));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(await new LiveMM(new SQLServerCodeGenProvider()).FirstPass(connection, EXCLUDED)).toBe(true);
        expect(await fieldNames()).toEqual(['Extra', 'ID', 'Parent', 'ParentID']);
        expect(await count('EntityFieldValue', `${q('EntityFieldID')} = '${f.FieldIDs.Notes}'`)).toBe(0);
        expect(await updatedAt()).toBeGreaterThan(before);
    });

    it('dropped column: its field goes; the virtual field stays although no base column backs it', async () => {
        await exec(dropColumn(f.Schema, 'Child', 'Extra'));
        expect(await new LiveMM(new SQLServerCodeGenProvider()).FirstPass(connection, EXCLUDED)).toBe(true);
        expect(await fieldNames()).toEqual(['ID', 'Notes', 'Parent', 'ParentID']);
    });

    it('missing base table: the entity is skipped, nothing is deleted', async () => {
        await exec(dropTable(f.Schema, 'Child'));
        expect(await new LiveMM(new SQLServerCodeGenProvider()).FirstPass(connection, EXCLUDED)).toBe(true);
        expect(await fieldNames()).toEqual(ALL_FIELDS);
    });

    it('out of scope: a run scoped to another entity deletes nothing here', async () => {
        await exec(dropColumn(f.Schema, 'Child', 'Extra'));
        expect(await new LiveMM(new SQLServerCodeGenProvider()).FirstPass(connection, EXCLUDED, [f.ParentEntityID])).toBe(true);
        expect(await fieldNames()).toEqual(ALL_FIELDS);
        expect(await new LiveMM(new SQLServerCodeGenProvider()).FirstPass(connection, EXCLUDED, [f.ChildEntityID])).toBe(true);
        expect(await fieldNames()).toEqual(['ID', 'Notes', 'Parent', 'ParentID']);
    });
});
