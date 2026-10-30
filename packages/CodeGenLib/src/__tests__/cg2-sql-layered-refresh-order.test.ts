import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * #4927: a layered entity's application-owned outer view (`SELECT g.*` over the CodeGen-owned inner
 * view) keeps the column list it had when it was created. When CodeGen rewrites the inner view, the
 * outer view must be refreshed BEFORE the entity's CRUD routines are recreated, or the routines that
 * read it fail to compile and the run ends with spCreate/spUpdate missing. The refresh used to reach
 * only the "combined files" fallback; the executed temp batch had inner view -> routines with no
 * refresh between them. These tests pin the refresh between the two, in the executed batch and in
 * the migration log, and that STEP 2(f) does not log it a second time.
 */

vi.mock('mssql', () => ({}));

import { EntityInfo } from '@memberjunction/core';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { TempBatchFile } from '../Misc/temp_batch_file';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

const INNER_VIEW_DDL = 'CREATE VIEW [app].[vwOrderHeadersGenerated] AS SELECT o.* FROM [app].[OrderHeader] o\nGO';
const SP_CREATE = 'CREATE PROCEDURE [app].[spCreateOrderHeader] AS SELECT * FROM [app].[vwOrderHeaders]\nGO';

/** Stubs the parts of generation that read the database or metadata; everything else is real. */
class StubbedSQLCodeGen extends SQLCodeGenBase {
    public override async GenerateBaseView(): Promise<string> {
        return INNER_VIEW_DDL;
    }
    protected override generateViewPermissions(): string {
        return '';
    }
    protected override generateSPCreate(): string {
        return SP_CREATE;
    }
    protected override generateSPPermissions(): string {
        return '';
    }
    public override GenerateIndexesForForeignKeys(): string {
        return '';
    }
    public override GenerateIndexForSoftPrimaryKey(): string {
        return '';
    }
    protected override async checkBaseViewChangedInDB(): Promise<boolean> {
        return false;
    }
    public InlineRefreshed(): Set<string> {
        return this.layeredEntitiesWithInlineRefresh;
    }
}

function entity(overrides: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: 'e-orders', Name: 'Order Headers', SchemaName: 'app', BaseTable: 'OrderHeader', BaseTableCodeName: 'OrderHeader',
        BaseView: 'vwOrderHeaders', GeneratedBaseViewName: 'vwOrderHeadersGenerated', BaseViewGenerated: false,
        IncludeInAPI: true, VirtualEntity: false, AllowCreateAPI: true, spCreateGenerated: true,
        AllowUpdateAPI: false, AllowDeleteAPI: false, FullTextSearchEnabled: false,
        EntityFields: [], EntityPermissions: [], ...overrides,
    });
}

const FAKE_POOL = {} as unknown as CodeGenConnection;

describe('#4927 layered outer view refresh sits between the inner view and the CRUD routines', () => {
    let dir: string;
    let logFile: string;
    let savedModified: string[];
    let savedNew: string[];

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg2-sql-layered-'));
        logFile = path.join(dir, 'CodeGen_Run.sql');
        fs.writeFileSync(logFile, '');
        SQLLogging.SetFilePathForTesting(logFile);
        TempBatchFile.Initialize(dir, ['app']);
        savedModified = ManageMetadataBase.ModifiedEntityList;
        savedNew = ManageMetadataBase.NewEntityList;
        ManageMetadataBase.ModifiedEntityList = ['Order Headers'];
        ManageMetadataBase.NewEntityList = [];
    });

    afterEach(() => {
        TempBatchFile.Cleanup();
        SQLLogging.ResetForTests();
        ManageMetadataBase.ModifiedEntityList = savedModified;
        ManageMetadataBase.NewEntityList = savedNew;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    async function generate(gen: StubbedSQLCodeGen, e: EntityInfo): Promise<{ batch: string; log: string }> {
        const batchPath = TempBatchFile.GetTempFilePathForSchema('app')!;
        await gen.GenerateSingleEntitySQLToSeparateFiles({
            pool: FAKE_POOL, entity: e, directory: dir, onlyPermissions: false,
            writeFiles: true, skipExecution: true, enableSQLLoggingForNewOrModifiedEntities: true,
        });
        return { batch: fs.readFileSync(batchPath, 'utf-8'), log: fs.readFileSync(logFile, 'utf-8') };
    }

    function assertOrdered(text: string): void {
        const inner = text.indexOf('CREATE VIEW [app].[vwOrderHeadersGenerated]');
        const innerRefresh = text.indexOf("EXEC sp_refreshview 'app.vwOrderHeadersGenerated';");
        const outerRefresh = text.indexOf("sp_refreshview ''app.vwOrderHeaders''");
        const proc = text.indexOf('CREATE PROCEDURE [app].[spCreateOrderHeader]');
        expect(inner).toBeGreaterThanOrEqual(0);
        expect(innerRefresh).toBeGreaterThan(inner);
        expect(outerRefresh).toBeGreaterThan(innerRefresh);
        expect(proc).toBeGreaterThan(outerRefresh);
    }

    it('executed temp batch: inner view, inner refresh, guarded outer refresh, then spCreate', async () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const { batch } = await generate(gen, entity());
        assertOrdered(batch);
        // The outer refresh is guarded: on the bootstrap pass the outer view does not exist yet.
        expect(batch).toContain("IF OBJECT_ID('[app].[vwOrderHeaders]', 'V') IS NOT NULL");
    });

    it('migration log: same order, with the refresh closed in its own batch', async () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const { log } = await generate(gen, entity());
        assertOrdered(log);
        const refreshUnit = log.slice(log.indexOf('/* Refresh layered base view for Order Headers'), log.indexOf('CREATE PROCEDURE'));
        expect(refreshUnit).toMatch(/^GO$/m);
        expect(gen.InlineRefreshed().has('Order Headers')).toBe(true);
    });

    it('refreshes even when the entity is on neither list, as long as the inner view was logged', async () => {
        ManageMetadataBase.ModifiedEntityList = [];
        class Changed extends StubbedSQLCodeGen {
            protected override async checkBaseViewChangedInDB(): Promise<boolean> {
                return true;
            }
        }
        const gen = new Changed();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const { batch } = await generate(gen, entity());
        assertOrdered(batch);
    });

    it('adds nothing when the inner view was not logged', async () => {
        ManageMetadataBase.ModifiedEntityList = [];
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const { batch, log } = await generate(gen, entity());
        expect(batch).not.toContain('sp_refreshview');
        expect(log).not.toContain('sp_refreshview');
        expect(gen.InlineRefreshed().size).toBe(0);
    });

    it('adds nothing for a non-layered entity whose view CodeGen owns', async () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        const { batch } = await generate(gen, entity({ BaseView: 'vwOrderHeadersGenerated', GeneratedBaseViewName: null, BaseViewGenerated: true }));
        expect(batch).not.toContain('sp_refreshview');
        expect(gen.InlineRefreshed().size).toBe(0);
    });

    it('adds nothing on PostgreSQL, whose phased executor rebinds the outer view itself', async () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new PostgreSQLCodeGenProvider();
        const { log } = await generate(gen, entity());
        expect(log).not.toContain('Refresh layered base view');
        expect(gen.InlineRefreshed().size).toBe(0);
    });

    it('STEP 2(f) still refreshes live but does not log an inline-refreshed entity again', async () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        await generate(gen, entity());
        const executed: string[] = [];
        const pool = {
            query: async (sql: string): Promise<CodeGenQueryResult> => {
                executed.push(sql);
                return { recordset: [] } as CodeGenQueryResult;
            },
        } as unknown as CodeGenConnection;
        const before = fs.readFileSync(logFile, 'utf-8');

        expect(await gen.RefreshCustomBaseViewsLive(pool, [entity()])).toBe(true);

        expect(executed).toHaveLength(1);
        expect(fs.readFileSync(logFile, 'utf-8')).toBe(before);
    });
});
