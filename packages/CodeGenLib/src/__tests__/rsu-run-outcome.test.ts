/**
 * A CodeGen step that fails must not report success, and one failure must not hide the next.
 *
 * The pipeline runs every step to the end, then fails (success=false, non-zero exit) with a list
 * of every failure. Before this, some steps logged and carried on as if they had passed (before-all
 * SQL scripts), and others returned at the first failure, so a run that broke in three places
 * reported only the first. RSU relies on the boolean to fail its RunCodeGen step.
 *
 * The pipeline runs for real; only its edges are faked: metadata management, the SQL pass, custom
 * SQL scripts, the integrity checks and the metadata provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/server-bootstrap-lite/mj-class-registrations', () => ({}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));
vi.mock('mssql', () => ({}));
vi.mock('../Config/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Config/config')>();
    return {
        ...actual,
        configInfo: {
            ...actual.configInfo,
            newUserSetup: undefined,
            advancedGeneration: undefined,
            verboseOutput: true,
            logging: { ...actual.configInfo.logging, log: false, console: false },
        },
        Commands: () => [],
        OutputDir: () => '/tmp/mj-codegen-rsu-run-outcome-test',
        GetSettingValue: <T>(_settingName: string, defaultValue?: T) => defaultValue,
    };
});
vi.mock('../Misc/codegen-reporter', () => {
    const reporter = {
        startRun: () => undefined,
        mark: () => undefined,
        note: () => undefined,
        counter: () => undefined,
        phase: async <T>(_name: string, fn: () => Promise<T>) => fn(),
        endRun: async () => ({ filePath: null, report: null }),
    };
    return { CodeGenReporter: { Instance: reporter } };
});
vi.mock('../Misc/sql_logging', () => ({
    SQLLogging: class {
        static initSQLLogging(): void {}
        static InitSQLLogging(): void {}
        static finishSQLLogging(): void {}
        static FinishSQLLogging(): void {}
    },
}));
vi.mock('../Database/reconcileFieldLevelSecurity', () => ({ ReconcileFieldLevelSecurity: vi.fn(async () => true) }));

import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { RunCodeGenBase } from '../runCodeGen';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import { SystemIntegrityBase, type IntegrityCheckResult } from '../Misc/system_integrity';
import type { CodeGenConnection, CodeGenQueryResult, DataSourceResult } from '../Database/codeGenDatabaseProvider';

const ENTITIES = [
    new EntityInfo({
        ID: 'e-1', Name: 'Widgets', SchemaName: 'app', BaseTable: 'Widget', BaseView: 'vwWidgets',
        IncludeInAPI: true, VirtualEntity: false,
        EntityFields: [{ ID: 'f-1', Name: 'ID', Type: 'uniqueidentifier', Sequence: 1, AllowsNull: false, IsVirtual: false, IsPrimaryKey: true }],
    }),
];

const provider = {
    get Entities() { return ENTITIES; },
    async Refresh() { return true; },
};

const FAKE_CONNECTION = { query: async (): Promise<CodeGenQueryResult> => ({ recordset: [] } as CodeGenQueryResult) } as unknown as CodeGenConnection;
const USER = { ID: 'u-1', Email: 'owner@test.local' } as unknown as UserInfo;
const DATA_SOURCE: DataSourceResult = {
    provider: provider as unknown as IMetadataProvider, connection: FAKE_CONNECTION, currentUser: USER, connectionInfo: 'test',
};

/** Exposes the protected pipeline so the test can run it without a real database. */
class TestRunCodeGen extends RunCodeGenBase {
    public async RunPipeline(): Promise<boolean> {
        return this.executeCodeGenPipeline(DATA_SOURCE, false, true);
    }
    public get Failures(): ReadonlyArray<{ context: string; message: string }> {
        return this.commandFailures;
    }
}

interface Outcomes {
    beforeAll: boolean;
    manageMetadata: boolean;
    sqlPass: boolean;
    integrity: IntegrityCheckResult[];
}

describe('CodeGen run outcome — every failure is listed and the run fails', () => {
    let previousGlobalProvider: IMetadataProvider;
    const previousSkipCRUD = process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;
    let steps: string[];

    function arrange(o: Outcomes): void {
        vi.spyOn(SQLCodeGenBase.prototype, 'RunCustomSQLScripts').mockImplementation(async (_pool, when) => {
            steps.push(`scripts:${when}`);
            return when === 'before-all' ? o.beforeAll : true;
        });
        vi.spyOn(ManageMetadataBase.prototype, 'ManageMetadata').mockImplementation(async () => {
            steps.push('manageMetadata');
            return o.manageMetadata;
        });
        vi.spyOn(SQLCodeGenBase.prototype, 'ManageSQLScriptsAndExecution').mockImplementation(async () => {
            steps.push('sqlPass');
            return o.sqlPass;
        });
        vi.spyOn(ManageMetadataBase.prototype, 'LoadGeneratedCode').mockImplementation(async () => {
            steps.push('loadGeneratedCode');
            return true;
        });
        vi.spyOn(SystemIntegrityBase, 'RunIntegrityChecks').mockImplementation(async () => {
            steps.push('integrity');
            return o.integrity;
        });
    }

    beforeEach(() => {
        steps = [];
        previousGlobalProvider = Metadata.Provider;  // global-provider-ok: the test swaps the process-global provider and restores it
        Metadata.Provider = provider as unknown as IMetadataProvider;  // global-provider-ok: the pipeline reads `new Metadata()`
        process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION = 'true';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Metadata.Provider = previousGlobalProvider;  // global-provider-ok: restores the process-global provider the test replaced
        if (previousSkipCRUD === undefined) delete process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;
        else process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION = previousSkipCRUD;
    });

    it('a clean run succeeds with no failures', async () => {
        arrange({ beforeAll: true, manageMetadata: true, sqlPass: true, integrity: [{ Name: 'seq', Success: true, Message: 'ok' }] });
        const run = new TestRunCodeGen();
        expect(await run.RunPipeline()).toBe(true);
        expect(run.Failures).toEqual([]);
    });

    it('a failing before-all SQL script fails the run instead of only logging', async () => {
        arrange({ beforeAll: false, manageMetadata: true, sqlPass: true, integrity: [{ Name: 'seq', Success: true, Message: 'ok' }] });
        const run = new TestRunCodeGen();
        expect(await run.RunPipeline()).toBe(false);
        expect(run.Failures.map((f) => f.context)).toEqual(['BEFORE_ALL_SQL']);
    });

    it('keeps going after the SQL pass fails and lists every failure at the end', async () => {
        arrange({
            beforeAll: true,
            manageMetadata: false,
            sqlPass: false,
            integrity: [{ Name: 'entityFieldsSequenceCheck', Success: false, Message: 'app.Widget out of order' }],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);

        // Every step after the first failure still ran.
        expect(steps).toEqual(expect.arrayContaining(['manageMetadata', 'sqlPass', 'loadGeneratedCode', 'integrity', 'scripts:after-all']));
        expect(run.Failures.map((f) => f.context)).toEqual(['MANAGE_METADATA', 'SQL_PASS', 'INTEGRITY_CHECK']);
        expect(run.Failures[2].message).toContain('app.Widget out of order');

        const summary = RunCodeGenBase.FormatStepFailures(run.Failures);
        expect(summary).toContain('3 failures');
        expect(summary).toContain('[MANAGE_METADATA]');
        expect(summary).toContain('[SQL_PASS]');
        expect(summary).toContain('[INTEGRITY_CHECK]');
    });

    it('Run() exits non-zero and RunWithResult lists all failures', async () => {
        arrange({
            beforeAll: false,
            manageMetadata: true,
            sqlPass: false,
            integrity: [{ Name: 'seq', Success: true, Message: 'ok' }],
        });
        const run = new TestRunCodeGen();
        vi.spyOn(run, 'SetupDataSource').mockResolvedValue(DATA_SOURCE);

        const result = await run.RunWithResult(false, true);
        expect(result.success).toBe(false);
        expect(result.errors?.map((e) => (e as { context?: string }).context)).toEqual(['BEFORE_ALL_SQL', 'SQL_PASS']);

        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as (code?: number) => never);
        await run.Run(false, true);
        expect(exit).toHaveBeenCalledWith(1);
    });
});

describe('RunCodeGenBase.FormatStepFailures', () => {
    it('is empty when nothing failed', () => {
        expect(RunCodeGenBase.FormatStepFailures([])).toBe('');
    });

    it('numbers each failure with its step', () => {
        const text = RunCodeGenBase.FormatStepFailures([{ context: 'SQL_PASS', message: 'batch 3 failed' }]);
        expect(text).toBe('CodeGen finished with 1 failure:\n  1. [SQL_PASS] batch 3 failed');
    });
});
