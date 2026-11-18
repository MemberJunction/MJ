import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * #6539: on PostgreSQL a `vw*Active` alternate base view (`SELECT a.*` over the base view) keeps the
 * column list it had when it was created. Live `mj codegen` rebinds it in the phased executor, but the
 * SQL CodeGen logs (the migration log and the bake capture) did not carry the rebind, because
 * `GenerateBaseViewPieces` only folds the alternate-view statements into `viewSQL` when the platform
 * needs `sp_refreshview` (SQL Server). Every release file and migrate-only install therefore kept the
 * old column list. These tests pin the rebinds into the logged base-view SQL on PostgreSQL, after the
 * view, parent view first, and leave SQL Server, layered entities and the executed `viewSQL` alone.
 */

vi.mock('mssql', () => ({}));

import { EntityInfo } from '@memberjunction/core';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { TempBatchFile } from '../Misc/temp_batch_file';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

const VIEW_DDL = 'CREATE OR REPLACE VIEW app."vwMembers" AS SELECT m.* FROM app."Member" m;';

class StubbedSQLCodeGen extends SQLCodeGenBase {
    public override async GenerateBaseViewPieces(): Promise<{ viewSQL: string; viewPermSQL: string }> {
        return { viewSQL: VIEW_DDL, viewPermSQL: '' };
    }
    protected override generateViewPermissions(): string {
        return '';
    }
    protected override generateAlternateBaseViewsPermissionsSQL(): string {
        return '';
    }
    protected override generateSPCreate(): string {
        return '';
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
        return true;
    }
    public AppendForLog(entity: EntityInfo, viewSQL: string): string {
        return this.appendAlternateBaseViewRebindsForLog(entity, viewSQL);
    }
}

function altView(id: string, parentID: string | null, name: string, viewName: string, status: string, sequence: number): Record<string, unknown> {
    return {
        ID: id, EntityID: 'e-members', ParentID: parentID, Name: name, DisplayName: name, Description: null,
        SchemaName: null, ViewName: viewName, CachePolicy: 'Default', Status: status, Sequence: sequence,
    };
}

function entity(overrides: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: 'e-members', Name: 'Members', SchemaName: 'app', BaseTable: 'Member', BaseTableCodeName: 'Member',
        BaseView: 'vwMembers', BaseViewGenerated: true, IncludeInAPI: true, VirtualEntity: false,
        AllowCreateAPI: false, AllowUpdateAPI: false, AllowDeleteAPI: false, FullTextSearchEnabled: false,
        EntityFields: [], EntityPermissions: [],
        // Child listed before its parent so the test proves topological order, not input order.
        EntityAlternateBaseViews: [
            altView('abv-child', 'abv-parent', 'ActiveAutoRenew', 'vwMembersActiveAutoRenew', 'Active', 1),
            altView('abv-parent', null, 'Active', 'vwMembersActive', 'Active', 2),
        ],
        ...overrides,
    });
}

const FAKE_POOL = {} as unknown as CodeGenConnection;

describe('#6539 alternate base view rebinds reach the logged PostgreSQL base view SQL', () => {
    let dir: string;
    let logFile: string;
    let savedModified: string[];
    let savedNew: string[];

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-alt-rebind-'));
        logFile = path.join(dir, 'CodeGen_Run.sql');
        fs.writeFileSync(logFile, '');
        SQLLogging.SetFilePathForTesting(logFile);
        TempBatchFile.Initialize(dir, ['app']);
        savedModified = ManageMetadataBase.ModifiedEntityList;
        savedNew = ManageMetadataBase.NewEntityList;
        ManageMetadataBase.ModifiedEntityList = ['Members'];
        ManageMetadataBase.NewEntityList = [];
    });

    afterEach(() => {
        TempBatchFile.Cleanup();
        SQLLogging.ResetForTests();
        ManageMetadataBase.ModifiedEntityList = savedModified;
        ManageMetadataBase.NewEntityList = savedNew;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('logs one guarded spRebindLayeredOuterView per alternate view, parent first, after the base view', async () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new PostgreSQLCodeGenProvider();
        const result = await gen.GenerateSingleEntitySQLToSeparateFiles({
            pool: FAKE_POOL, entity: entity(), directory: dir, onlyPermissions: false,
            writeFiles: true, skipExecution: true, enableSQLLoggingForNewOrModifiedEntities: true,
        });
        const log = fs.readFileSync(logFile, 'utf-8');

        const view = log.indexOf(VIEW_DDL);
        const parent = log.indexOf(`"spRebindLayeredOuterView"(''app'', ''vwMembersActive'', ''vwMembers'')`);
        const child = log.indexOf(`"spRebindLayeredOuterView"(''app'', ''vwMembersActiveAutoRenew'', ''vwMembersActive'')`);
        expect(view).toBeGreaterThanOrEqual(0);
        expect(parent).toBeGreaterThan(view);
        expect(child).toBeGreaterThan(parent);
        expect(log.match(/spRebindLayeredOuterView/g)).toHaveLength(2);
        // Each rebind is guarded on the alternate view existing.
        expect(log).toContain(`to_regclass('"app"."vwMembersActive"')`);
        expect(log).toContain(`to_regclass('"app"."vwMembersActiveAutoRenew"')`);

        // The phased executor's view SQL is unchanged: it already rebinds live.
        expect(result.phasedSQL?.ViewSQL).toBe(VIEW_DDL);
    });

    it('adds nothing to an entity with no alternate views', () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new PostgreSQLCodeGenProvider();
        expect(gen.AppendForLog(entity({ EntityAlternateBaseViews: [] }), VIEW_DDL)).toBe(VIEW_DDL);
    });

    it('leaves SQL Server output unchanged: its viewSQL already carries the refreshes', () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new SQLServerCodeGenProvider();
        expect(gen.AppendForLog(entity(), VIEW_DDL)).toBe(VIEW_DDL);
    });

    it('leaves a layered entity unchanged: the layered refresh path rebinds its views', () => {
        const gen = new StubbedSQLCodeGen();
        gen.DBProvider = new PostgreSQLCodeGenProvider();
        const layered = entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwMembersGenerated' });
        expect(layered.HasLayeredBaseView).toBe(true);
        expect(gen.AppendForLog(layered, VIEW_DDL)).toBe(VIEW_DDL);
    });
});
