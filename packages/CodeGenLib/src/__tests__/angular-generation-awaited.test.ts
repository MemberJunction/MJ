/**
 * The non-core Angular pass waits for each group's forms before CodeGen moves on.
 *
 * `generateAngularCode` is async. Called without `await`, its Promise was the group's result:
 * - a Promise is always truthy, so a group whose generation failed never failed the phase, and the
 *   run reported success;
 * - the phase returned while the forms were still being written, so the AFTER commands ran first.
 *   An AFTER command that edits the written forms (e.g. trims entries out of
 *   `generated-forms.module.ts`) had its edit overwritten when the late write landed.
 *
 * The pipeline runs for real with file generation on. Only its edges are faked: the metadata
 * provider, the generated-code load, the integrity checks, the AFTER command runner, and the form
 * generator itself. Angular is the only output directory configured, so no other generator runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ANGULAR_DIR = vi.hoisted(() => '/tmp/mj-codegen-angular-generation-awaited-test');

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
        Commands: (when: string) =>
            when.trim().toUpperCase() === 'AFTER'
                ? [{ workingDirectory: '.', command: 'node', args: ['trim-generated-forms.mjs'], when: 'after' }]
                : [],
        OutputDir: (type: string) => (type === 'Angular' ? ANGULAR_DIR : null),
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

import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { RunCodeGenBase } from '../runCodeGen';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SystemIntegrityBase } from '../Misc/system_integrity';
import { RunCommandsBase } from '../Misc/runCommand';
import { AngularClientGeneratorBase } from '../Angular/angular-codegen';
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

/** Long enough that an unawaited write is still in flight when the rest of the pipeline finishes. */
const WRITE_MS = 25;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('CodeGen non-core Angular pass — form generation is awaited', () => {
    let previousGlobalProvider: IMetadataProvider;
    let steps: string[];

    /** Fakes the form write for every group: it takes WRITE_MS, then resolves or rejects as `outcome` says. */
    function arrange(outcome: boolean | Error): void {
        vi.spyOn(SystemIntegrityBase, 'RunIntegrityChecks').mockResolvedValue([{ Name: 'seq', Success: true, Message: 'ok' }]);
        vi.spyOn(ManageMetadataBase.prototype, 'LoadGeneratedCode').mockResolvedValue(true);
        vi.spyOn(ActionEngineBase.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AngularClientGeneratorBase.prototype, 'GenerateAngularCode').mockImplementation(async (_entities, directory) => {
            await pause(WRITE_MS);
            if (outcome instanceof Error) {
                steps.push(`forms failed: ${directory}`);
                throw outcome;
            }
            steps.push(`forms written: ${directory}`);
            return outcome;
        });
        vi.spyOn(RunCommandsBase.prototype, 'RunCommands').mockImplementation(async (cmds) => {
            steps.push('AFTER commands');
            return cmds.map(() => ({ output: '', error: '', success: true, elapsedTime: 0 }));
        });
    }

    async function run(): Promise<{ success: boolean; errors: unknown[] }> {
        const codegen = new RunCodeGenBase();
        vi.spyOn(codegen, 'SetupDataSource').mockResolvedValue(DATA_SOURCE);
        const result = await codegen.RunWithResult(true, false);
        return { success: result.success, errors: result.errors ?? [] };
    }

    beforeEach(() => {
        steps = [];
        previousGlobalProvider = Metadata.Provider;  // global-provider-ok: the test swaps the process-global provider and restores it
        Metadata.Provider = provider as unknown as IMetadataProvider;  // global-provider-ok: the pipeline reads `new Metadata()`
    });

    afterEach(async () => {
        // An unawaited write (the bug) lands after the run returns; let it finish inside this test.
        await pause(WRITE_MS * 2);
        vi.restoreAllMocks();
        Metadata.Provider = previousGlobalProvider;  // global-provider-ok: restores the process-global provider the test replaced
    });

    it('runs the AFTER commands only once the forms are written', async () => {
        arrange(true);

        const result = await run();

        expect(result.success).toBe(true);
        expect(steps).toEqual([`forms written: ${ANGULAR_DIR}`, 'AFTER commands']);
    });

    it('fails the run when a group\'s form generation resolves false', async () => {
        arrange(false);

        const result = await run();

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual({ context: 'FILE_GENERATION', message: 'Error generating Angular code' });
        // The failure is known before the AFTER commands start.
        expect(steps).toEqual([`forms written: ${ANGULAR_DIR}`, 'AFTER commands']);
    });

    it('fails the run when a group\'s form generation rejects, and runs no AFTER command over the failed forms', async () => {
        arrange(new Error('generated-forms.module.ts could not be written'));

        const result = await run();

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual({ message: 'generated-forms.module.ts could not be written' });
        expect(steps).toEqual([`forms failed: ${ANGULAR_DIR}`]);
    });
});
