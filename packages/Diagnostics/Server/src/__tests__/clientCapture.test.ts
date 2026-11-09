import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiagnosticContext, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import {
    DiagnosticsBuildBundleServerOperation,
    DiagnosticsUploadClientCaptureServerOperation,
} from '../remoteOperations.js';
import { DiagnosticSessionManager, RunWithServerDiagnosticContext } from '../sessionManager.js';
import { DiagnosticsServerMiddleware } from '../middleware.js';

type StoredFields = Record<string, string | number | boolean | Date | null | undefined>;

/** A provider whose entity objects save to in-memory tables. */
function createProvider(): { Provider: IMetadataProvider; Rows: (entity: string) => StoredFields[] } {
    const tables = new Map<string, Map<string, StoredFields>>();
    const tableOf = (name: string): Map<string, StoredFields> => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name)!;
    };
    const createRow = (entity: string): StoredFields & { Save: () => Promise<boolean>; Load: (id: string) => Promise<boolean> } => {
        const row = {
            ID: '',
            LatestResult: { CompleteMessage: '' },
            Save: async (): Promise<boolean> => {
                if (!row.ID) row.ID = crypto.randomUUID().toUpperCase();
                const snapshot: StoredFields = {};
                for (const [key, value] of Object.entries(row)) {
                    if (typeof value !== 'function' && key !== 'LatestResult') snapshot[key] = value as StoredFields[string];
                }
                tableOf(entity).set(String(row.ID), snapshot);
                return true;
            },
            Load: async (id: string): Promise<boolean> => {
                const stored = tableOf(entity).get(id);
                if (stored) Object.assign(row, stored);
                return Boolean(stored);
            },
        };
        return row as unknown as StoredFields & { Save: () => Promise<boolean>; Load: (id: string) => Promise<boolean> };
    };
    const provider = {
        GetEntityObject: async (entity: string) => createRow(entity),
        EntityByName: (entity: string) => ({ Name: entity }),
    } as unknown as IMetadataProvider;
    return { Provider: provider, Rows: (entity) => [...tableOf(entity).values()] };
}

function mockSettings(values: Record<string, string>): void {
    vi.spyOn(InstanceConfigEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockImplementation((key: string) => values[key]);
}

const selfUser = {
    ID: 'AAAAAAAA-1111-4111-8111-000000000001',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as unknown as UserInfo;

const ownerUser = { ID: 'user-owner-1', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

const clientLog = { timestamp: '2026-11-02T12:00:00.000Z', severity: 'error', source: 'client', message: 'UI failed' };

describe('client capture', () => {
    let data: ReturnType<typeof createProvider>;
    const manager = DiagnosticSessionManager.Instance;

    beforeEach(async () => {
        manager.Initialize({ enableConsoleTap: false, enablePolling: false });
        manager.ResetForTests();
        mockSettings({});
        const emptyRunView = { RunView: async () => ({ Success: true, Results: [], ErrorMessage: '' }) };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(emptyRunView as unknown as RunView);
        data = createProvider();
        await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (subpath: string) => subpath });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('UploadClientCapture without a session ID', () => {
        it('creates a session for the caller and browser session, saves the chunks under it, and lets the caller build', async () => {
            mockSettings({ 'Diagnostics.SelfServiceRecording': 'true' });
            const ctx = { provider: data.Provider, user: selfUser };
            const browserContext: DiagnosticContext = { BrowserSessionID: 'tab-1' };

            const uploaded = await RunWithServerDiagnosticContext(browserContext, () =>
                new DiagnosticsUploadClientCaptureServerOperation().ExecuteServer({ ClientLogs: [clientLog] }, ctx)
            );
            expect(uploaded.Success).toBe(true);
            const sessionId = uploaded.Output!.SessionID;

            const session = data.Rows('MJ: Diagnostic Sessions').find((r) => r.ID === sessionId);
            expect(session).toMatchObject({ ScopeType: 'Users', CreatedByUserID: selfUser.ID });
            expect(JSON.parse(String(session!.ScopeJSON))).toEqual({ userIds: [selfUser.ID], browserSessionId: 'tab-1' });
            const chunks = data.Rows('MJ: Diagnostic Session Chunks');
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks.every((c) => c.DiagnosticSessionID === sessionId)).toBe(true);

            const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);
            expect(built.Success).toBe(true);
        });

        it('refuses when Diagnostics.Capture.Enabled is false', async () => {
            mockSettings({ 'Diagnostics.Capture.Enabled': 'false' });
            const uploaded = await new DiagnosticsUploadClientCaptureServerOperation().ExecuteServer(
                { ClientLogs: [clientLog] },
                { provider: data.Provider, user: ownerUser }
            );
            expect(uploaded.Success).toBe(false);
            expect(uploaded.ErrorMessage).toMatch(/Diagnostics\.Capture\.Enabled/);
            expect(data.Rows('MJ: Diagnostic Sessions')).toHaveLength(0);
        });
    });

    describe('X-MJ-Diagnostic-Trigger header', () => {
        function registerSession(id: string, scopeType: 'Users' | 'Instance', userIds: string[] = []): void {
            manager.RegisterActiveSession({
                id,
                name: id,
                status: 'Active',
                scopeType,
                scope: { userIds },
                level: 'Standard',
                categories: ['Logs'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: selfUser.ID,
                bytesWritten: 0,
            });
        }

        /** Runs the post-auth handler for a request by the given user and returns the headers it set. */
        function runPostAuth(userId: string): Map<string, string> {
            const headers = new Map<string, string>();
            const handler = new DiagnosticsServerMiddleware().GetPostAuthMiddleware()[0];
            const req = { userPayload: { userRecord: { ID: userId } } };
            const res = { setHeader: (name: string, value: string) => headers.set(name, value) };
            RunWithServerDiagnosticContext({}, () =>
                handler(req as unknown as Parameters<typeof handler>[0], res as unknown as Parameters<typeof handler>[1], () => undefined)
            );
            return headers;
        }

        it('is set to the session ID only when a user-scoped session matches after auth', () => {
            registerSession('watch-instance', 'Instance');
            expect(runPostAuth(selfUser.ID).has('X-MJ-Diagnostic-Trigger')).toBe(false);
            manager.ResetForTests();
            registerSession('watch-user', 'Users', [selfUser.ID]);
            expect(runPostAuth(selfUser.ID).get('X-MJ-Diagnostic-Trigger')).toBe('watch-user');
        });

        it('is not set after a session-less upload, whose session is stopped once its chunks are saved', async () => {
            mockSettings({ 'Diagnostics.SelfServiceRecording': 'true' });
            const uploaded = await new DiagnosticsUploadClientCaptureServerOperation().ExecuteServer(
                { ClientLogs: [clientLog] },
                { provider: data.Provider, user: selfUser }
            );
            const session = data.Rows('MJ: Diagnostic Sessions').find((r) => r.ID === uploaded.Output?.SessionID);
            expect(session?.Status).toBe('Stopped');
            expect(session?.StoppedAt).toBeInstanceOf(Date);
            expect(runPostAuth(selfUser.ID).has('X-MJ-Diagnostic-Trigger')).toBe(false);
        });
    });
});
