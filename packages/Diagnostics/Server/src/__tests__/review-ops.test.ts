import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import {
    AuthorizeDiagnosticsUser,
    DiagnosticsBuildBundleServerOperation,
    DiagnosticsGetMySessionStatusServerOperation,
    DiagnosticsSendBundleServerOperation,
    DiagnosticsStartSessionServerOperation,
    DiagnosticsUploadClientCaptureServerOperation,
    GetInMemoryDiagnosticBundle,
} from '../remoteOperations.js';
import { DiagnosticSessionManager } from '../sessionManager.js';
import { SetDiagnosticsApiRoute } from '../apiRoute.js';
import { DiagnosticRetentionScheduledJobDriver } from '../retentionJobDriver.js';

type Row = Record<string, string | number | boolean | Date | null | undefined>;
type AssembledBundle = Awaited<ReturnType<DiagnosticSessionManager['AssembleBundleDataFromChunks']>>;

const MB = 1024 * 1024;
const HOUR_MS = 60 * 60_000;

const ownerUser = { ID: 'user-owner-1', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;
const selfUser = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', IsActive: true, Type: 'User', UserRoles: [] } as unknown as UserInfo;

/** A provider whose entity objects save to and load from in-memory tables. */
function createFakeProvider(authorizations: Array<{ Name: string; UserCanExecute: () => boolean }> = []): {
    Provider: IMetadataProvider;
    Saved: (entity: string) => Row[];
} {
    const tables = new Map<string, Map<string, Row>>();
    const saved = new Map<string, Row[]>();
    const tableOf = (entity: string): Map<string, Row> => {
        if (!tables.has(entity)) tables.set(entity, new Map());
        return tables.get(entity)!;
    };
    const fieldsOf = (row: Row): Row => {
        const out: Row = {};
        for (const [k, v] of Object.entries(row)) if (typeof v !== 'function' && k !== 'LatestResult') out[k] = v;
        return out;
    };
    const createRow = (entity: string): Row => {
        const row: Row & { Save: () => Promise<boolean>; Load: (id: string) => Promise<boolean>; LatestResult: { CompleteMessage: string } } = {
            ID: '',
            LatestResult: { CompleteMessage: 'save failed' },
            Save: async () => {
                row.ID = row.ID || crypto.randomUUID().toUpperCase();
                const snapshot = fieldsOf(row);
                tableOf(entity).set(String(row.ID), snapshot);
                saved.set(entity, [...(saved.get(entity) ?? []), snapshot]);
                return true;
            },
            Load: async (id: string) => {
                const stored = tableOf(entity).get(id);
                if (!stored) return false;
                Object.assign(row, stored);
                return true;
            },
        };
        return row;
    };
    const provider = {
        GetEntityObject: async (entity: string) => createRow(entity),
        EntityByName: (entity: string) => ({ Name: entity }),
        Authorizations: authorizations,
    } as unknown as IMetadataProvider;
    return { Provider: provider, Saved: (entity) => saved.get(entity) ?? [] };
}

function mockInstanceSettings(values: Record<string, string> = {}): void {
    vi.spyOn(InstanceConfigEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockImplementation((key: string) => values[key]);
}

/** Makes bundle assembly return an archive that reports the given size, without allocating it. */
function mockAssembly(sizeBytes: number): void {
    const archiveBytes = { byteLength: sizeBytes } as unknown as Uint8Array;
    const assembled = {
        bundleData: { findings: [] },
        archiveBytes,
        sha256: 'a'.repeat(64),
        manifest: {},
        scrubReport: {},
    } as unknown as AssembledBundle;
    vi.spyOn(DiagnosticSessionManager.Instance, 'AssembleBundleDataFromChunks').mockResolvedValue(assembled);
}

async function buildBundle(provider: IMetadataProvider, user: UserInfo = ownerUser, scrubLiterals = false): Promise<string> {
    const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ ScrubLiterals: scrubLiterals }, { provider, user });
    expect(built.Success).toBe(true);
    return built.Output!.BundleID;
}

describe('diagnostics remote operations (review fixes)', () => {
    const manager = DiagnosticSessionManager.Instance;

    beforeEach(() => {
        manager.Initialize({ enableConsoleTap: false, enablePolling: false });
        manager.ResetForTests();
        mockInstanceSettings();
        SetDiagnosticsApiRoute((subpath: string) => subpath);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('AuthorizeDiagnosticsUser', () => {
        const adminUser = { ID: 'user-admin-1', IsActive: true, Type: 'User', UserRoles: [{ Role: 'Administrator' }] } as unknown as UserInfo;
        const developerUser = { ID: 'user-dev-1', IsActive: true, Type: 'User', UserRoles: [{ Role: 'Developer' }] } as unknown as UserInfo;

        it('refuses an Administrator or Developer that lacks the authorization, and passes a granted user and an Owner', async () => {
            const notGranted = createFakeProvider([{ Name: 'Diagnostics: Run Sessions', UserCanExecute: () => false }]).Provider;
            const granted = createFakeProvider([{ Name: 'Diagnostics: Run Sessions', UserCanExecute: () => true }]).Provider;

            expect(await AuthorizeDiagnosticsUser(adminUser, 'Diagnostics: Run Sessions', notGranted)).toBe(false);
            expect(await AuthorizeDiagnosticsUser(developerUser, 'Diagnostics: Run Sessions', notGranted)).toBe(false);
            expect(await AuthorizeDiagnosticsUser(selfUser, 'Diagnostics: Run Sessions', granted)).toBe(true);
            expect(await AuthorizeDiagnosticsUser(ownerUser, 'Diagnostics: Run Sessions', notGranted)).toBe(true);
        });

        it('refuses a Developer when the authorization record is missing or metadata is not loaded', async () => {
            const noRecord = createFakeProvider([]).Provider;
            const notLoaded = {
                get Authorizations(): never {
                    throw new Error('metadata not loaded');
                },
            } as unknown as IMetadataProvider;

            expect(await AuthorizeDiagnosticsUser(developerUser, 'Diagnostics: Manage Intake', noRecord)).toBe(false);
            expect(await AuthorizeDiagnosticsUser(developerUser, 'Diagnostics: Manage Intake', notLoaded)).toBe(false);
        });
    });

    describe('in-memory bundle store', () => {
        it('drops a built bundle that has not been used for more than two hours', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            mockAssembly(1024);
            const fake = createFakeProvider();
            const bundleId = await buildBundle(fake.Provider);
            expect(GetInMemoryDiagnosticBundle(bundleId)).toBeDefined();

            vi.setSystemTime(Date.now() + 2 * HOUR_MS + 1);

            expect(GetInMemoryDiagnosticBundle(bundleId)).toBeUndefined();
        });

        it('evicts the least recently used bundle when the total passes 256 MB', async () => {
            mockAssembly(100 * MB);
            const fake = createFakeProvider();
            const first = await buildBundle(fake.Provider);
            const second = await buildBundle(fake.Provider);
            expect(GetInMemoryDiagnosticBundle(first)).toBeDefined();

            const third = await buildBundle(fake.Provider);

            expect(GetInMemoryDiagnosticBundle(second)).toBeUndefined();
            expect(GetInMemoryDiagnosticBundle(first)).toBeDefined();
            expect(GetInMemoryDiagnosticBundle(third)).toBeDefined();
        });

        it('retention removes the in-memory bytes of a bundle row it deletes', async () => {
            mockAssembly(1024);
            const fake = createFakeProvider();
            const bundleId = await buildBundle(fake.Provider);
            const expiredRow = {
                ID: bundleId,
                FileID: null,
                LatestResult: { CompleteMessage: '' },
                Delete: async () => true,
            };
            const fakeRunView = {
                RunView: async (params: { EntityName?: string; ExtraFilter?: string }) => {
                    const isLocalBundles = params.EntityName === 'MJ: Diagnostic Bundles' && params.ExtraFilter?.includes("'Local'");
                    const rows = isLocalBundles && !params.ExtraFilter?.includes(`'${bundleId}'`) ? [expiredRow] : [];
                    return { Success: true, Results: rows, ErrorMessage: '' };
                },
            };
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
            const context = {
                Schedule: { Name: 'Retention', Configuration: JSON.stringify({ MaxDeletesPerRun: 1 }) },
                Run: {},
                ContextUser: ownerUser,
                Provider: fake.Provider,
            } as unknown as ScheduledJobExecutionContext;

            const result = await new DiagnosticRetentionScheduledJobDriver().Execute(context);

            expect(result.Details?.DeletedBundles).toBe(1);
            expect(GetInMemoryDiagnosticBundle(bundleId)).toBeUndefined();
        });
    });

    describe('StartSession MaxBytes', () => {
        it('clamps MaxBytes to 50 MB, and to 10 MB for a self-service session', async () => {
            mockInstanceSettings({ 'Diagnostics.SelfServiceRecording': 'true' });
            const fake = createFakeProvider();

            const admin = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'Huge', ScopeType: 'Instance', MaxBytes: 1_000_000_000_000 },
                { provider: fake.Provider, user: ownerUser }
            );
            const self = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'Self huge', ScopeType: 'Users', MaxBytes: 1_000_000_000 },
                { provider: fake.Provider, user: selfUser }
            );
            const selfDefault = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'Self default', ScopeType: 'Users' },
                { provider: fake.Provider, user: selfUser }
            );

            expect(manager.GetActiveSession(admin.Output!.SessionID)?.maxBytes).toBe(52_428_800);
            expect(manager.GetActiveSession(self.Output!.SessionID)?.maxBytes).toBe(10_485_760);
            expect(manager.GetActiveSession(selfDefault.Output!.SessionID)?.maxBytes).toBe(10_485_760);
        });
    });

    describe('SendBundle to an external collector', () => {
        const collectorSettings = {
            'Diagnostics.External.CollectorUrl': 'https://collector.example/diagnostics/intake/v1',
            'Diagnostics.External.Enabled': 'true',
        };

        it('refuses a bundle built without literal scrubbing unless Diagnostics.External.AllowUnscrubbedSend is true', async () => {
            mockInstanceSettings(collectorSettings);
            mockAssembly(1024);
            const fetchStub = vi.fn(async () => {
                throw new Error('network disabled in test');
            });
            vi.stubGlobal('fetch', fetchStub);
            const fake = createFakeProvider();
            const bundleId = await buildBundle(fake.Provider, ownerUser, false);

            const refused = await new DiagnosticsSendBundleServerOperation().ExecuteServer(
                { BundleID: bundleId, Destination: 'CustomerCollector' },
                { provider: fake.Provider, user: ownerUser }
            );

            expect(refused.Success).toBe(false);
            expect(refused.ErrorMessage).toMatch(/literal scrubbing/i);
            expect(refused.ErrorMessage).toMatch(/Diagnostics\.External\.AllowUnscrubbedSend/);
            expect(fetchStub).not.toHaveBeenCalled();
            expect(fake.Saved('MJ: Diagnostic Bundles').some((r) => r['Status'] === 'Sending')).toBe(false);

            mockInstanceSettings({ ...collectorSettings, 'Diagnostics.External.AllowUnscrubbedSend': 'true' });
            const optedIn = await new DiagnosticsSendBundleServerOperation().ExecuteServer(
                { BundleID: bundleId, Destination: 'CustomerCollector' },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(optedIn.ErrorMessage ?? '').not.toMatch(/AllowUnscrubbedSend/);
        });
    });

    describe('UploadClientCapture', () => {
        it('counts the saves already queued for the session in its totals', async () => {
            const fake = createFakeProvider();
            const save = vi.spyOn(manager, 'SaveSessionChunks');

            const uploaded = await new DiagnosticsUploadClientCaptureServerOperation().ExecuteServer(
                { ClientLogs: [{ timestamp: new Date().toISOString(), severity: 'error', source: 'client', message: 'x' }] },
                { provider: fake.Provider, user: ownerUser }
            );

            expect(uploaded.Success).toBe(true);
            expect(save).toHaveBeenCalledWith(uploaded.Output!.SessionID, ownerUser, fake.Provider, { IncludeQueuedSaves: true });
        });
    });

    describe('GetMySessionStatus', () => {
        it('reports CaptureEnabled and RequireLiteralScrubbing from the instance settings', async () => {
            mockInstanceSettings({ 'Diagnostics.Capture.Enabled': 'false', 'Diagnostics.RequireLiteralScrubbing': 'true' });
            const fake = createFakeProvider();

            const status = await new DiagnosticsGetMySessionStatusServerOperation().ExecuteServer({}, { provider: fake.Provider, user: selfUser });

            expect(status.Output?.CaptureEnabled).toBe(false);
            expect(status.Output?.RequireLiteralScrubbing).toBe(true);
        });
    });
});
