/**
 * IN-PROCESS CODEGEN MUST REFRESH THE METADATA THAT SQL GENERATION ACTUALLY READS.
 *
 * `executeCodeGenPipeline` reads entities through `new Metadata()` — the process's GLOBAL provider. The CLI
 * creates one provider and makes it the global one, so refreshing the pipeline's `provider` after
 * `manageMetadata` covers everything SQL generation reads. In-process (`RunInProcess`, the runtime
 * schema-update path) the host hands the pipeline a SEPARATE CodeGen-credential provider, so that refresh
 * never reached the global one: SQL generation saw whatever snapshot the host's timed refresh last took, in
 * which the entities `manageMetadata` had just given their soft primary keys still had none, and it skipped
 * every one of them ("SKIPPING SQL GENERATION: Entity ... has no primary key field in metadata") — tables and
 * entity rows, but no base view and no CRUD routines. Observed on a SQL Server tenant: 348 of 884 entities,
 * on two consecutive runs.
 *
 * The pipeline runs here for real, through `RunInProcess`; only its edges are faked — the database (a
 * `manageMetadata` that registers a soft primary key), the two metadata providers, and the SQL-generation
 * step, which records what it was handed and stops the run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// runCodeGen.ts pulls in the full class-registration manifest at import time; nothing here needs it.
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
        OutputDir: () => '/tmp/mj-codegen-inproc-refresh-test',
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
vi.mock('../Database/reconcileFieldLevelSecurity', () => ({ ReconcileFieldLevelSecurity: vi.fn(async () => undefined) }));

import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { RunCodeGenBase } from '../runCodeGen';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import type { CodeGenConnection, CodeGenQueryResult, DataSourceResult } from '../Database/codeGenDatabaseProvider';

const NEW_ENTITY = 'Nimble Accounts';

/** The database. `manageMetadata` is what flips the soft primary key on, exactly as applySoftPKFKConfig does. */
const db = { softPrimaryKeyApplied: false };

/** What a provider would load from {@link db} right now. */
function loadEntities(): EntityInfo[] {
    return [
        new EntityInfo({
            ID: 'e-1', Name: NEW_ENTITY, SchemaName: 'nimble_ams', BaseTable: 'account', BaseView: 'vwaccount',
            IncludeInAPI: true, VirtualEntity: false,
            EntityFields: [
                { ID: 'f-1', Name: 'Id', Type: 'nvarchar', Length: 36, Sequence: 1, AllowsNull: false, IsVirtual: false,
                  IsPrimaryKey: db.softPrimaryKeyApplied, IsSoftPrimaryKey: db.softPrimaryKeyApplied },
                { ID: 'f-2', Name: 'Name', Type: 'nvarchar', Length: 200, Sequence: 2, AllowsNull: true, IsVirtual: false,
                  IsPrimaryKey: false },
            ],
        }),
    ];
}

interface FakeProvider {
    readonly Label: string;
    readonly Entities: EntityInfo[];
    Refresh(): Promise<boolean>;
}

/** A metadata provider that, like the real ones, only sees the database when it is refreshed. */
function fakeProvider(label: string, events: string[]): FakeProvider {
    let snapshot = loadEntities();
    return {
        Label: label,
        get Entities() { return snapshot; },
        async Refresh() {
            snapshot = loadEntities();
            events.push(`${label}.Refresh`);
            return true;
        },
    };
}

const FAKE_CONNECTION = { query: async (): Promise<CodeGenQueryResult> => ({ recordset: [] } as CodeGenQueryResult) } as unknown as CodeGenConnection;
const USER = { ID: 'u-1', Email: 'owner@test.local' } as unknown as UserInfo;

function dataSource(provider: FakeProvider): DataSourceResult {
    return { provider: provider as unknown as IMetadataProvider, connection: FAKE_CONNECTION, currentUser: USER, connectionInfo: 'test' };
}

describe('RunInProcess — SQL generation sees the metadata manageMetadata just wrote', () => {
    let events: string[];
    let handedToSQLGeneration: EntityInfo[] | undefined;
    let previousGlobalProvider: IMetadataProvider;
    const previousSkipCRUD = process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;

    beforeEach(() => {
        events = [];
        handedToSQLGeneration = undefined;
        db.softPrimaryKeyApplied = false;
        previousGlobalProvider = Metadata.Provider;  // global-provider-ok: the test swaps the process-global provider and restores it
        // The CRUD validator needs a real database; it is not what this test is about.
        process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION = 'true';
        vi.spyOn(SQLCodeGenBase.prototype, 'RunCustomSQLScripts').mockResolvedValue(true);
        vi.spyOn(ManageMetadataBase.prototype, 'ManageMetadata').mockImplementation(async () => {
            db.softPrimaryKeyApplied = true;
            events.push('manageMetadata');
            return true;
        });
        vi.spyOn(SQLCodeGenBase.prototype, 'ManageSQLScriptsAndExecution').mockImplementation(async (_pool, entities) => {
            handedToSQLGeneration = entities;
            events.push('sqlGeneration');
            return false; // ends the run: nothing after SQL generation is under test
        });
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider;  // global-provider-ok: restores the process-global provider the test replaced
        if (previousSkipCRUD === undefined) delete process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION;
        else process.env.MJ_CODEGEN_SKIP_CRUD_VALIDATION = previousSkipCRUD;
    });

    function primaryKeyOf(entities: EntityInfo[] | undefined): string[] {
        const entity = (entities ?? []).find((e) => e.Name === NEW_ENTITY);
        return (entity?.Fields ?? []).filter((f) => f.IsPrimaryKey).map((f) => f.Name);
    }

    it('in-process (host provider != CodeGen provider): the entity reaches SQL generation WITH its soft primary key', async () => {
        const host = fakeProvider('host', events);
        const codegen = fakeProvider('codegen', events);
        Metadata.Provider = host as unknown as IMetadataProvider;  // global-provider-ok: the HOST process's global provider, as in MJAPI

        await new RunCodeGenBase().RunInProcess(dataSource(codegen), false, undefined, true);

        expect(events).toContain('sqlGeneration');
        expect(primaryKeyOf(handedToSQLGeneration)).toEqual(['Id']);
    });

    it('refreshes BOTH providers after manageMetadata and before SQL generation', async () => {
        const host = fakeProvider('host', events);
        const codegen = fakeProvider('codegen', events);
        Metadata.Provider = host as unknown as IMetadataProvider;  // global-provider-ok: the HOST process's global provider, as in MJAPI

        await new RunCodeGenBase().RunInProcess(dataSource(codegen), false, undefined, true);

        const at = (e: string) => events.indexOf(e);
        expect(at('manageMetadata')).toBeGreaterThan(-1);
        expect(at('codegen.Refresh')).toBeGreaterThan(at('manageMetadata'));
        expect(at('host.Refresh')).toBeGreaterThan(at('manageMetadata'));
        expect(at('host.Refresh')).toBeLessThan(at('sqlGeneration'));
    });

    it('CLI shape (the CodeGen provider IS the global one): refreshed once, not twice', async () => {
        const single = fakeProvider('single', events);
        Metadata.Provider = single as unknown as IMetadataProvider;  // global-provider-ok: the CLI makes its one provider the global one

        await new RunCodeGenBase().RunInProcess(dataSource(single), false, undefined, true);

        expect(events.filter((e) => e === 'single.Refresh')).toHaveLength(1);
        expect(primaryKeyOf(handedToSQLGeneration)).toEqual(['Id']);
    });
});
