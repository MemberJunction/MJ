import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * SQL execution outcomes and custom base view refresh order.
 *
 * - cg.1 / #4000: a failed batch in a generated script must fail the file, after every other batch
 *   has run, with each failure named by the object it acts on. It used to be a warning with the file
 *   reported as successful, which hid an spCreate that was dropped and never recreated.
 * - #4336: application-owned base views are refreshed against the live database right after the
 *   view/proc regeneration, inner view before outer, so the field sync that follows sees the new
 *   columns instead of deleting their EntityField rows.
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
vi.mock('../Misc/status_logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/status_logging')>();
    return { ...actual, logError: (...args: unknown[]) => logErrorSpy(...args) };
});

import { EntityInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { SQLUtilityBase } from '../Database/sql';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

function writeTempScript(contents: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlgen-exec-'));
    const file = path.join(dir, 'batch.sql');
    fs.writeFileSync(file, contents);
    return file;
}

describe('SQLServerCodeGenProvider.executeSQLFileViaShell', () => {
    const provider = new SQLServerCodeGenProvider();

    beforeEach(() => {
        batchQuery.mockReset();
        logErrorSpy.mockReset();
    });

    it('runs every batch, then fails the file listing each failed object', async () => {
        batchQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('CREATE PROCEDURE [app].[spCreateContract]')) {
                throw new Error("Incorrect syntax near '-'.");
            }
            if (sql.startsWith('GRANT EXECUTE ON [app].[spCreateContract]')) {
                throw new Error("Cannot find the object 'spCreateContract'.");
            }
        });
        const file = writeTempScript([
            "IF OBJECT_ID('[app].[spCreateContract]', 'P') IS NOT NULL DROP PROCEDURE [app].[spCreateContract];",
            'GO',
            'CREATE PROCEDURE [app].[spCreateContract] AS SELECT 1',
            'GO',
            'GRANT EXECUTE ON [app].[spCreateContract] TO [cdp_UI]',
            'GO',
            'CREATE PROCEDURE [app].[spUpdateContract] AS SELECT 1',
        ].join('\n'));

        const ok = await provider.executeSQLFileViaShell(file);

        expect(ok).toBe(false);
        expect(batchQuery).toHaveBeenCalledTimes(4);
        const message = String(logErrorSpy.mock.calls[0][0]);
        expect(message).toContain('2 SQL batch(es) failed');
        expect(message).toContain("CREATE PROCEDURE [app].[spCreateContract]: Incorrect syntax near '-'.");
        expect(message).toContain('GRANT ON [app].[spCreateContract]');
    });

    it('returns true when every batch succeeds', async () => {
        batchQuery.mockResolvedValue(undefined);
        const file = writeTempScript('SELECT 1\nGO\nSELECT 2\n');
        expect(await provider.executeSQLFileViaShell(file)).toBe(true);
        expect(logErrorSpy).not.toHaveBeenCalled();
    });

    it('returns false when the file cannot be read', async () => {
        expect(await provider.executeSQLFileViaShell(path.join(os.tmpdir(), 'does-not-exist-sqlgen.sql'))).toBe(false);
    });
});

class RecordingSQLUtility extends SQLUtilityBase {
    public Scripts: string[] = [];
    public FailingFiles = new Set<string>();
    public Files: string[] = [];
    public override async ExecuteSQLScript(_ds: CodeGenConnection, scriptText: string, _inChunks: boolean): Promise<boolean> {
        this.Scripts.push(scriptText);
        return true;
    }
    public override async ExecuteSQLFile(filePath: string): Promise<boolean> {
        this.Files.push(filePath);
        return !this.FailingFiles.has(filePath);
    }
}

const FAKE_POOL = {} as unknown as CodeGenConnection;

function layeredEntity(overrides: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: 'e-orders', Name: 'Order Headers', SchemaName: 'app', BaseTable: 'OrderHeader', BaseTableCodeName: 'OrderHeader',
        BaseView: 'vwOrderHeaders', GeneratedBaseViewName: 'vwOrderHeadersGenerated', BaseViewGenerated: false,
        IncludeInAPI: true, VirtualEntity: false, EntityFields: [], EntityPermissions: [], ...overrides,
    });
}

describe('SQLUtilityBase', () => {
    it('RecompileSingleBaseView refreshes the inner view before the guarded outer view', async () => {
        const util = new RecordingSQLUtility();
        expect(await util.RecompileSingleBaseView(FAKE_POOL, layeredEntity(), false)).toBe(true);
        expect(util.Scripts).toHaveLength(2);
        expect(util.Scripts[0]).toBe("EXEC sp_refreshview 'app.vwOrderHeadersGenerated';");
        expect(util.Scripts[1]).toContain("IF OBJECT_ID('[app].[vwOrderHeaders]', 'V') IS NOT NULL");
        expect(util.Scripts[1]).toContain("sp_refreshview ''app.vwOrderHeaders''");
    });

    it('RecompileSingleBaseView refreshes only the base view of a non-layered entity', async () => {
        const util = new RecordingSQLUtility();
        await util.RecompileSingleBaseView(FAKE_POOL, layeredEntity({ GeneratedBaseViewName: null }), false);
        expect(util.Scripts).toEqual(["EXEC sp_refreshview 'app.vwOrderHeaders';"]);
    });

    it('ExecuteSQLFiles runs every file after a failure and reports false', async () => {
        const util = new RecordingSQLUtility();
        util.FailingFiles.add('b.sql');
        expect(await util.ExecuteSQLFiles(['a.sql', 'b.sql', 'c.sql'], false)).toBe(false);
        expect(util.Files).toEqual(['a.sql', 'b.sql', 'c.sql']);
    });
});

class TestableSQLCodeGen extends SQLCodeGenBase {
    public MarkInnerViewLogged(name: string): void {
        this.layeredEntitiesWithLoggedInnerView.add(name);
    }
}

describe('SQLCodeGenBase.RefreshCustomBaseViewsLive', () => {
    let executed: string[];
    let pool: CodeGenConnection;
    let logged: string[];
    let savedModified: string[];
    let savedNew: string[];

    beforeEach(() => {
        executed = [];
        logged = [];
        logErrorSpy.mockReset();
        savedModified = ManageMetadataBase.ModifiedEntityList;
        savedNew = ManageMetadataBase.NewEntityList;
        ManageMetadataBase.ModifiedEntityList = [];
        ManageMetadataBase.NewEntityList = [];
        pool = {
            query: async (sql: string): Promise<CodeGenQueryResult> => {
                executed.push(sql);
                if (sql.includes('vwBroken')) {
                    throw new Error("Invalid object name 'app.vwBroken'.");
                }
                return { recordset: [] } as CodeGenQueryResult;
            },
        } as unknown as CodeGenConnection;
        vi.spyOn(SQLLogging, 'AppendToSQLLogFile').mockImplementation(async (contents: string) => {
            logged.push(contents);
        });
    });

    afterEach(() => {
        ManageMetadataBase.ModifiedEntityList = savedModified;
        ManageMetadataBase.NewEntityList = savedNew;
        vi.restoreAllMocks();
    });

    it('refreshes every application-owned base view, inner before outer, and skips generated ones', async () => {
        const gen = new TestableSQLCodeGen();
        const generated = layeredEntity({ ID: 'e-gen', Name: 'Plain', BaseView: 'vwPlain', GeneratedBaseViewName: null, BaseViewGenerated: true });
        const custom = layeredEntity({ ID: 'e-custom', Name: 'Custom', BaseView: 'vwCustom', GeneratedBaseViewName: null });

        expect(await gen.RefreshCustomBaseViewsLive(pool, [layeredEntity(), generated, custom])).toBe(true);

        expect(executed).toHaveLength(2);
        const layered = executed[0];
        expect(layered.indexOf("sp_refreshview 'app.vwOrderHeadersGenerated'")).toBeGreaterThanOrEqual(0);
        expect(layered.indexOf("sp_refreshview 'app.vwOrderHeadersGenerated'")).toBeLessThan(layered.indexOf("''app.vwOrderHeaders''"));
        expect(executed[1]).toContain("sp_refreshview 'app.vwCustom'");
        expect(executed.join('\n')).not.toContain('vwPlain');
    });

    it('logs the refresh only for entities that changed this run', async () => {
        const gen = new TestableSQLCodeGen();
        ManageMetadataBase.ModifiedEntityList = ['Custom'];
        gen.MarkInnerViewLogged('Order Headers');
        const untouched = layeredEntity({ ID: 'e-other', Name: 'Other', BaseView: 'vwOther', GeneratedBaseViewName: null });
        const custom = layeredEntity({ ID: 'e-custom', Name: 'Custom', BaseView: 'vwCustom', GeneratedBaseViewName: null });

        await gen.RefreshCustomBaseViewsLive(pool, [layeredEntity(), untouched, custom]);

        expect(logged).toHaveLength(1);
        expect(logged[0]).toContain('vwOrderHeadersGenerated');
        expect(logged[0]).toContain('vwCustom');
        expect(logged[0]).not.toContain('vwOther');
    });

    it('writes nothing to the log when no entity changed', async () => {
        const gen = new TestableSQLCodeGen();
        await gen.RefreshCustomBaseViewsLive(pool, [layeredEntity()]);
        expect(executed).toHaveLength(1);
        expect(logged).toHaveLength(0);
    });

    it('attempts every view and fails the step listing each failure', async () => {
        const gen = new TestableSQLCodeGen();
        const broken = layeredEntity({ ID: 'e-broken', Name: 'Broken', BaseView: 'vwBroken', GeneratedBaseViewName: null });
        const custom = layeredEntity({ ID: 'e-custom', Name: 'Custom', BaseView: 'vwCustom', GeneratedBaseViewName: null });

        expect(await gen.RefreshCustomBaseViewsLive(pool, [broken, custom])).toBe(false);

        expect(executed).toHaveLength(2);
        expect(String(logErrorSpy.mock.calls[0][0])).toContain("app.vwBroken (Broken): Invalid object name 'app.vwBroken'.");
    });
});
