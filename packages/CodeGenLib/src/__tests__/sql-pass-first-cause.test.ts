import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * #3975 item 1: when an object fails to create, the first failure must be the loudest output.
 *
 * - The SQL Server provider records each failed batch, named by its object, for the SQL pass.
 * - The SQL pass ties each one to the entity whose view or CRUD routine it names.
 * - ApplyPermissions skips the GRANT files of those entities (they would only fail with
 *   `Cannot find the object`) and logs one line per entity naming the first failure.
 * - The SQL_PASS run summary quotes the first recorded failure.
 */

const batchQuery = vi.fn<(sql: string) => Promise<void>>();
vi.mock('mssql', () => ({}));
vi.mock('../Config/db-connection', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Config/db-connection')>();
    return {
        ...actual,
        MSSQLConnection: async () => ({ request: () => ({ query: (sql: string) => batchQuery(sql) }) }),
    };
});
const logErrorSpy = vi.fn();
const logWarningSpy = vi.fn();
vi.mock('../Misc/status_logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/status_logging')>();
    return {
        ...actual,
        logError: (...args: unknown[]) => logErrorSpy(...args),
        LogWarning: (...args: unknown[]) => logWarningSpy(...args),
    };
});

import { EntityInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { SQLObjectKeyFromDescription, SQLPassFailureSummary, type SQLPassFailure } from '../Database/sqlPassFailures';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sql-pass-first-cause-'));
}

function entity(name: string, baseTable: string, overrides: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: `e-${baseTable}`, Name: name, SchemaName: 'app', BaseTable: baseTable, BaseTableCodeName: baseTable,
        BaseView: `vw${baseTable}s`, BaseViewGenerated: true, IncludeInAPI: true, VirtualEntity: false,
        AllowCreateAPI: true, AllowUpdateAPI: false, AllowDeleteAPI: false,
        EntityFields: [], EntityPermissions: [], ...overrides,
    });
}

describe('SQLServerCodeGenProvider records object-level failures', () => {
    beforeEach(() => {
        batchQuery.mockReset();
        logErrorSpy.mockReset();
    });

    it('records each failed batch with its file and object, and clears on request', async () => {
        batchQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('CREATE VIEW [app].[vwContracts]')) throw new Error("Invalid column name 'Amount'.");
            if (sql.startsWith('GRANT SELECT ON [app].[vwContracts]')) throw new Error("Cannot find the object 'vwContracts'.");
        });
        const file = path.join(tempDir(), 'batch.sql');
        fs.writeFileSync(file, [
            'CREATE VIEW [app].[vwContracts] AS SELECT Amount FROM app.Contract',
            'GO',
            'GRANT SELECT ON [app].[vwContracts] TO [cdp_UI]',
            'GO',
            'CREATE PROCEDURE [app].[spCreateContract] AS SELECT 1',
        ].join('\n'));
        const provider = new SQLServerCodeGenProvider();

        expect(await provider.executeSQLFileViaShell(file)).toBe(false);

        expect(provider.SQLObjectFailures).toEqual([
            { File: file, Object: 'CREATE VIEW [app].[vwContracts]', Message: "Invalid column name 'Amount'." },
            { File: file, Object: 'GRANT ON [app].[vwContracts]', Message: "Cannot find the object 'vwContracts'." },
        ]);
        provider.ClearSQLObjectFailures();
        expect(provider.SQLObjectFailures).toEqual([]);
    });

    it('records nothing when every batch succeeds', async () => {
        batchQuery.mockResolvedValue(undefined);
        const file = path.join(tempDir(), 'ok.sql');
        fs.writeFileSync(file, 'SELECT 1\nGO\nSELECT 2\n');
        const provider = new SQLServerCodeGenProvider();

        expect(await provider.executeSQLFileViaShell(file)).toBe(true);
        expect(provider.SQLObjectFailures).toEqual([]);
    });
});

describe('SQLObjectKeyFromDescription', () => {
    it.each([
        ['CREATE VIEW [app].[vwContracts]', 'app.vwcontracts'],
        ['CREATE OR ALTER PROCEDURE app.spCreateContract', 'app.spcreatecontract'],
        ['GRANT ON [app].[spCreateContract]', 'app.spcreatecontract'],
        ["EXEC sp_refreshview 'app.vwContracts'", 'app.vwcontracts'],
    ])('reads %s as %s', (description, expected) => {
        expect(SQLObjectKeyFromDescription(description)).toBe(expected);
    });

    it.each([
        'CREATE INDEX IDX_AUTO_MJ_FKEY_Contract_OwnerID',
        'UPDATE app.Contract SET Amount = 0',
        'EXEC sp_refreshview',
    ])('returns null for %s', (description) => {
        expect(SQLObjectKeyFromDescription(description)).toBeNull();
    });
});

class TestableSQLCodeGen extends SQLCodeGenBase {
    public RecordObjectFailures(step: string, entities: EntityInfo[]): number {
        return this.RecordSQLObjectFailures(step, entities);
    }
    public SeedFailures(failures: SQLPassFailure[]): void {
        this.sqlPassFailures = [...failures];
    }
}

describe('SQLCodeGenBase ties object failures to entities', () => {
    it('attributes a failed view or CRUD routine to its entity and keeps an unknown object entity-less', () => {
        const provider = new SQLServerCodeGenProvider();
        const gen = new TestableSQLCodeGen();
        gen.DBProvider = provider;
        const contracts = entity('Contracts', 'Contract');
        const invoices = entity('Invoices', 'Invoice', { spCreate: 'spInvoiceInsert' });
        const failures = [
            { File: 'f.sql', Object: 'CREATE VIEW [app].[vwContracts]', Message: "Invalid column name 'Amount'." },
            { File: 'f.sql', Object: 'CREATE PROCEDURE [app].[spInvoiceInsert]', Message: 'Incorrect syntax.' },
            { File: 'f.sql', Object: 'CREATE TRIGGER [app].[trgUpdateContract]', Message: 'Trigger failed.' },
        ];
        vi.spyOn(provider, 'SQLObjectFailures', 'get').mockReturnValue(failures);

        expect(gen.RecordObjectFailures('Executing entity SQL files', [contracts, invoices])).toBe(3);

        expect(gen.SQLPassFailures).toEqual([
            { Step: 'Executing entity SQL files', EntityName: 'Contracts', Message: "CREATE VIEW [app].[vwContracts]: Invalid column name 'Amount'." },
            { Step: 'Executing entity SQL files', EntityName: 'Invoices', Message: 'CREATE PROCEDURE [app].[spInvoiceInsert]: Incorrect syntax.' },
            { Step: 'Executing entity SQL files', EntityName: null, Message: 'CREATE TRIGGER [app].[trgUpdateContract]: Trigger failed.' },
        ]);
        vi.restoreAllMocks();
    });

    it('records nothing and returns 0 when the provider collected no object failures', () => {
        const gen = new TestableSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        expect(gen.RecordObjectFailures('Executing entity SQL files', [entity('Contracts', 'Contract')])).toBe(0);
        expect(gen.SQLPassFailures).toEqual([]);
    });
});

describe('SQLCodeGenBase.ApplyPermissions', () => {
    let executed: string[];
    let pool: CodeGenConnection;
    let dir: string;

    function writePermissionFiles(gen: SQLCodeGenBase, e: EntityInfo): void {
        for (const f of gen.GetEntityPermissionFileNames(e)) {
            const full = path.join(dir, f);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, `GRANT SELECT ON ${f} TO [cdp_UI]`);
        }
    }

    beforeEach(() => {
        executed = [];
        dir = tempDir();
        logErrorSpy.mockReset();
        logWarningSpy.mockReset();
        pool = {
            query: async (sql: string): Promise<CodeGenQueryResult> => {
                executed.push(sql);
                return { recordset: [] } as CodeGenQueryResult;
            },
        } as unknown as CodeGenConnection;
    });

    it('skips the permissions of an entity whose objects failed, naming the first failure once', async () => {
        const gen = new TestableSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const contracts = entity('Contracts', 'Contract');
        const invoices = entity('Invoices', 'Invoice');
        writePermissionFiles(gen, contracts);
        writePermissionFiles(gen, invoices);
        gen.SeedFailures([
            { Step: 'Executing entity SQL files', EntityName: 'Contracts', Message: "CREATE VIEW [app].[vwContracts]: Invalid column name 'Amount'." },
            { Step: 'Executing entity SQL files', EntityName: 'Contracts', Message: "GRANT ON [app].[vwContracts]: Cannot find the object 'vwContracts'." },
        ]);

        expect(await gen.ApplyPermissions(pool, dir, [contracts, invoices])).toBe(true);

        expect(executed).toHaveLength(gen.GetEntityPermissionFileNames(invoices).length);
        expect(executed.join('\n')).not.toMatch(/Contract/);
        expect(logWarningSpy).toHaveBeenCalledTimes(1);
        const line = String(logWarningSpy.mock.calls[0][0]);
        expect(line).toContain('Skipping permissions for entity Contracts');
        expect(line).toContain("[Executing entity SQL files] Contracts: CREATE VIEW [app].[vwContracts]: Invalid column name 'Amount'.");
        expect(line).not.toContain('Cannot find the object');
        expect(logErrorSpy).not.toHaveBeenCalled();
    });

    it('runs every entity when nothing failed for any entity', async () => {
        const gen = new TestableSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const contracts = entity('Contracts', 'Contract');
        writePermissionFiles(gen, contracts);
        gen.SeedFailures([{ Step: 'after-sql scripts', EntityName: null, Message: 'One or more after-sql scripts failed' }]);

        expect(await gen.ApplyPermissions(pool, dir, [contracts])).toBe(true);

        expect(executed).toHaveLength(gen.GetEntityPermissionFileNames(contracts).length);
        expect(logWarningSpy).not.toHaveBeenCalled();
    });
});

describe('SQLPassFailureSummary', () => {
    it('quotes the first recorded failure and counts the rest', () => {
        const summary = SQLPassFailureSummary([
            { Step: 'Executing entity SQL files', EntityName: 'Contracts', Message: "CREATE VIEW [app].[vwContracts]: Invalid column name 'Amount'." },
            { Step: 'Applying permissions', EntityName: null, Message: 'One or more permissions files failed' },
        ]);
        expect(summary).toBe(
            "SQL generation/execution reported a failure. First failure: [Executing entity SQL files] Contracts: " +
            "CREATE VIEW [app].[vwContracts]: Invalid column name 'Amount'. (1 more logged above)",
        );
    });

    it('omits the count for a single failure and the entity for a step failure', () => {
        expect(SQLPassFailureSummary([{ Step: 'after-sql scripts', EntityName: null, Message: 'One or more after-sql scripts failed' }]))
            .toBe('SQL generation/execution reported a failure. First failure: [after-sql scripts] One or more after-sql scripts failed');
    });

    it('falls back to the logged errors when nothing was recorded', () => {
        expect(SQLPassFailureSummary([])).toBe('SQL generation/execution reported a failure; see the errors logged above');
    });
});
