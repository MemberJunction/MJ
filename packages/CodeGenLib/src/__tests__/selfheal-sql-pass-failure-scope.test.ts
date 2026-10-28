/**
 * The CRUD self-heal clears the SQL-pass failure only when it repaired everything the pass got wrong.
 *
 * After the SQL pass, the self-heal re-runs every entity whose create/update/delete routine is
 * missing. On a PostgreSQL first run that is usually the whole failure (a view CASCADE-drop took the
 * routines out), and clearing the failure lets pass 1 converge. It used to clear the failure
 * whenever the routines came back, which also hid a batch that failed for an unrelated reason —
 * a custom script, a permissions file, a different entity — and reported a broken run as a success.
 *
 * The pipeline runs for real; only its edges are faked: metadata management, the SQL pass, the
 * self-heal's phased re-run, the database provider's validators and the metadata provider.
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
        OutputDir: () => '/tmp/mj-codegen-selfheal-failure-scope-test',
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
import { SystemIntegrityBase } from '../Misc/system_integrity';
import { UnhealedSQLPassFailures, type SQLPassFailure } from '../Database/sqlPassFailures';
import type {
    CodeGenConnection,
    CodeGenDatabaseProvider,
    CodeGenQueryResult,
    CRUDValidationMissing,
    DataSourceResult,
    PhasedExecutionResult,
} from '../Database/codeGenDatabaseProvider';

const WIDGETS = new EntityInfo({
    ID: 'e-1', Name: 'Widgets', SchemaName: 'app', BaseTable: 'Widget', BaseView: 'vwWidgets',
    IncludeInAPI: true, VirtualEntity: false,
    EntityFields: [{ ID: 'f-1', Name: 'ID', Type: 'uniqueidentifier', Sequence: 1, AllowsNull: false, IsVirtual: false, IsPrimaryKey: true }],
});
const GADGETS = new EntityInfo({
    ID: 'e-2', Name: 'Gadgets', SchemaName: 'app', BaseTable: 'Gadget', BaseView: 'vwGadgets',
    IncludeInAPI: true, VirtualEntity: false,
    EntityFields: [{ ID: 'f-2', Name: 'ID', Type: 'uniqueidentifier', Sequence: 1, AllowsNull: false, IsVirtual: false, IsPrimaryKey: true }],
});
const ENTITIES = [WIDGETS, GADGETS];

const provider = {
    get Entities() { return ENTITIES; },
    EntityByName(name: string) { return ENTITIES.find((e) => e.Name.toLowerCase() === name.trim().toLowerCase()); },
    async Refresh() { return true; },
};

const FAKE_CONNECTION = { query: async (): Promise<CodeGenQueryResult> => ({ recordset: [] } as CodeGenQueryResult) } as unknown as CodeGenConnection;
const USER = { ID: 'u-1', Email: 'owner@test.local' } as unknown as UserInfo;
const DATA_SOURCE: DataSourceResult = {
    provider: provider as unknown as IMetadataProvider, connection: FAKE_CONNECTION, currentUser: USER, connectionInfo: 'test',
};

const WIDGETS_CREATE_MISSING: CRUDValidationMissing = { entity: 'Widgets', schema: 'app', type: 'create', expectedRoutine: 'fn_create_widget' };
const WIDGETS_UPDATE_MISSING: CRUDValidationMissing = { entity: 'Widgets', schema: 'app', type: 'update', expectedRoutine: 'fn_update_widget' };

/** Exposes the protected pipeline so the test can run it without a real database. */
class TestRunCodeGen extends RunCodeGenBase {
    public async RunPipeline(): Promise<boolean> {
        return this.executeCodeGenPipeline(DATA_SOURCE, false, true);
    }
    public get Failures(): ReadonlyArray<{ context: string; message: string }> {
        return this.commandFailures;
    }
}

interface Scenario {
    /** What the SQL pass recorded; it reports failure when this is non-empty. */
    sqlPassFailures: SQLPassFailure[];
    /** The CRUD validator's answer before the self-heal, then after it. */
    missingBefore: CRUDValidationMissing[];
    missingAfter: CRUDValidationMissing[];
    /** Entities whose phased re-run fails. */
    healFails?: string[];
}

describe('CRUD self-heal clears the SQL-pass failure only for what it repaired', () => {
    let previousGlobalProvider: IMetadataProvider;
    const previousSkipCRUD = process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;
    let healed: string[];

    function arrange(s: Scenario): void {
        vi.spyOn(SQLCodeGenBase.prototype, 'RunCustomSQLScripts').mockResolvedValue(true);
        vi.spyOn(ManageMetadataBase.prototype, 'ManageMetadata').mockResolvedValue(true);
        vi.spyOn(ManageMetadataBase.prototype, 'LoadGeneratedCode').mockResolvedValue(true);
        vi.spyOn(SystemIntegrityBase, 'RunIntegrityChecks').mockResolvedValue([{ Name: 'seq', Success: true, Message: 'ok' }]);
        vi.spyOn(SQLCodeGenBase.prototype, 'ManageSQLScriptsAndExecution').mockResolvedValue(s.sqlPassFailures.length === 0);
        vi.spyOn(SQLCodeGenBase.prototype, 'SQLPassFailures', 'get').mockReturnValue(s.sqlPassFailures);
        vi.spyOn(SQLCodeGenBase.prototype, 'ExecuteEntityInPhases').mockImplementation(async (_pool, entity): Promise<PhasedExecutionResult> => {
            healed.push(entity.Name);
            return s.healFails?.includes(entity.Name)
                ? { success: false, phase: 'functions', error: new Error('function body invalid') }
                : { success: true, phase: null };
        });

        const validate = vi.fn<() => Promise<CRUDValidationMissing[]>>()
            .mockResolvedValueOnce(s.missingBefore)
            .mockResolvedValue(s.missingAfter);
        const dbProvider = {
            validateExpectedCRUDFunctions: validate,
            validateEntityFieldsResolve: async () => [],
            executeEntityPhased: async (): Promise<PhasedExecutionResult> => ({ success: true, phase: null }),
        };
        vi.spyOn(SQLCodeGenBase.prototype, 'DBProvider', 'get').mockReturnValue(dbProvider as unknown as CodeGenDatabaseProvider);
    }

    beforeEach(() => {
        healed = [];
        previousGlobalProvider = Metadata.Provider;  // global-provider-ok: the test swaps the process-global provider and restores it
        Metadata.Provider = provider as unknown as IMetadataProvider;  // global-provider-ok: the pipeline reads `new Metadata()`
        delete process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Metadata.Provider = previousGlobalProvider;  // global-provider-ok: restores the process-global provider the test replaced
        if (previousSkipCRUD === undefined) delete process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;
        else process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION = previousSkipCRUD;
    });

    it('clears the failure when only the missing routines failed and the self-heal restored them', async () => {
        arrange({
            sqlPassFailures: [{ Step: 'Generating SQL', EntityName: 'Widgets', Message: 'SQL generation/execution failed for app.Widgets' }],
            missingBefore: [WIDGETS_CREATE_MISSING, WIDGETS_UPDATE_MISSING],
            missingAfter: [],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(true);
        expect(healed).toEqual(['Widgets']);
        expect(run.Failures).toEqual([]);
    });

    it('keeps the failure when a batch outside the restored routines also failed', async () => {
        arrange({
            sqlPassFailures: [
                { Step: 'Generating SQL', EntityName: 'Widgets', Message: 'SQL generation/execution failed for app.Widgets' },
                { Step: 'Applying permissions', EntityName: null, Message: 'One or more permissions files failed' },
            ],
            missingBefore: [WIDGETS_CREATE_MISSING],
            missingAfter: [],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);
        expect(healed).toEqual(['Widgets']);
        expect(run.Failures.map((f) => f.context)).toEqual(['SQL_PASS']);
    });

    it('keeps the failure when another entity failed that the self-heal did not re-run', async () => {
        arrange({
            sqlPassFailures: [
                { Step: 'Generating SQL', EntityName: 'Widgets', Message: 'SQL generation/execution failed for app.Widgets' },
                { Step: 'Generating SQL', EntityName: 'Gadgets', Message: 'SQL generation/execution failed for app.Gadgets' },
            ],
            missingBefore: [WIDGETS_CREATE_MISSING],
            missingAfter: [],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);
        expect(healed).toEqual(['Widgets']);
        expect(run.Failures.map((f) => f.context)).toEqual(['SQL_PASS']);
    });

    it('keeps the failure and adds the gap when the self-heal could not restore a routine', async () => {
        arrange({
            sqlPassFailures: [{ Step: 'Generating SQL', EntityName: 'Widgets', Message: 'SQL generation/execution failed for app.Widgets' }],
            missingBefore: [WIDGETS_CREATE_MISSING, WIDGETS_UPDATE_MISSING],
            missingAfter: [WIDGETS_UPDATE_MISSING],
            healFails: ['Widgets'],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);
        expect(run.Failures.map((f) => f.context)).toEqual(['SQL_PASS', 'CRUD_VALIDATION']);
        expect(run.Failures[1].message).toContain('fn_update_widget');
    });

    it('keeps the failure when the re-run failed even though the routines now exist', async () => {
        arrange({
            sqlPassFailures: [{ Step: 'Generating SQL', EntityName: 'Widgets', Message: 'SQL generation/execution failed for app.Widgets' }],
            missingBefore: [WIDGETS_CREATE_MISSING],
            missingAfter: [],
            healFails: ['Widgets'],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);
        expect(run.Failures.map((f) => f.context)).toEqual(['SQL_PASS']);
    });

    it('quotes the first recorded failure in the SQL_PASS summary (#3975)', async () => {
        arrange({
            sqlPassFailures: [
                { Step: 'Executing entity SQL files', EntityName: 'Gadgets', Message: "CREATE VIEW [app].[vwGadgets]: Invalid column name 'Size'." },
                { Step: 'Applying permissions', EntityName: null, Message: 'One or more permissions files failed' },
            ],
            missingBefore: [],
            missingAfter: [],
        });
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);
        expect(run.Failures.map((f) => f.context)).toEqual(['SQL_PASS']);
        expect(run.Failures[0].message).toContain("First failure: [Executing entity SQL files] Gadgets: CREATE VIEW [app].[vwGadgets]: Invalid column name 'Size'.");
    });

    it('keeps the failure when the SQL pass failed without recording why', async () => {
        arrange({ sqlPassFailures: [], missingBefore: [WIDGETS_CREATE_MISSING], missingAfter: [] });
        vi.spyOn(SQLCodeGenBase.prototype, 'ManageSQLScriptsAndExecution').mockResolvedValue(false);
        const run = new TestRunCodeGen();

        expect(await run.RunPipeline()).toBe(false);
        expect(run.Failures.map((f) => f.context)).toEqual(['SQL_PASS']);
    });
});

describe('UnhealedSQLPassFailures', () => {
    const widgets: SQLPassFailure = { Step: 'Generating SQL', EntityName: 'Widgets', Message: 'w' };
    const gadgets: SQLPassFailure = { Step: 'Generating SQL', EntityName: 'Gadgets', Message: 'g' };
    const script: SQLPassFailure = { Step: 'after-sql scripts', EntityName: null, Message: 's' };

    it('is empty when every failure belongs to a healed entity, matching names case-insensitively', () => {
        expect(UnhealedSQLPassFailures([widgets], [' widgets '])).toEqual([]);
    });

    it('keeps failures of entities that were not healed', () => {
        expect(UnhealedSQLPassFailures([widgets, gadgets], ['Widgets'])).toEqual([gadgets]);
    });

    it('always keeps failures that have no entity', () => {
        expect(UnhealedSQLPassFailures([widgets, script], ['Widgets'])).toEqual([script]);
    });
});
