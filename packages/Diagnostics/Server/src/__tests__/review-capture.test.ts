import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { ActiveDiagnosticSession, DiagnosticSessionManager, RunWithServerDiagnosticContext } from '../sessionManager.js';
import { DiagnosticsServerMiddleware } from '../middleware.js';
import { RestoreActiveSessions, WatchSessionExpiry } from '../sessionStore.js';

const CHUNK_ENTITY = 'MJ: Diagnostic Session Chunks';
const SESSION_ENTITY = 'MJ: Diagnostic Sessions';

type Row = Record<string, string | number | boolean | Date | null | undefined>;

const ownerUser = { ID: 'user-owner-1', IsActive: true, Type: 'Owner', UserRoles: [{ Role: 'Developer' }] } as unknown as UserInfo;

/** A provider whose entity objects save to in-memory tables; each save stamps `__mj_CreatedAt`. Saves fail while `FailSaves` is true. */
function createFakeProvider(): { Provider: IMetadataProvider; Rows: (entity: string) => Row[]; FailSaves: boolean } {
    const tables = new Map<string, Row[]>();
    const state = { FailSaves: false };
    const rowsOf = (entity: string): Row[] => {
        if (!tables.has(entity)) tables.set(entity, []);
        return tables.get(entity)!;
    };
    const createRow = (entity: string): Row & { Save: () => Promise<boolean> } => {
        const row = {
            ID: '',
            LatestResult: { CompleteMessage: `${entity} save rejected` },
            Save: async () => {
                if (state.FailSaves) return false;
                row.ID = row.ID || crypto.randomUUID().toUpperCase();
                const snapshot: Row = { __mj_CreatedAt: new Date() };
                for (const [k, v] of Object.entries(row)) if (typeof v !== 'function') snapshot[k] = v as Row[string];
                rowsOf(entity).push(snapshot);
                return true;
            },
        };
        return row as Row & { Save: () => Promise<boolean> };
    };
    const provider = {
        GetEntityObject: async (entity: string) => createRow(entity),
        EntityByName: (entity: string) => ({ Name: entity }),
    } as unknown as IMetadataProvider;
    return {
        Provider: provider,
        Rows: rowsOf,
        get FailSaves() {
            return state.FailSaves;
        },
        set FailSaves(value: boolean) {
            state.FailSaves = value;
        },
    };
}

/** Sorts rows by an `OrderBy` clause such as `A ASC, B DESC`. */
function sortByOrderBy(rows: Row[], orderBy: string | undefined): Row[] {
    const keys = (orderBy ?? '').split(',').map((part) => part.trim().split(/\s+/)).filter((p) => p[0]);
    const value = (v: Row[string]): number | string => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : String(v ?? ''));
    return [...rows].sort((a, b) => {
        for (const [field, dir] of keys) {
            const x = value(a[field]);
            const y = value(b[field]);
            if (x !== y) return (x < y ? -1 : 1) * (dir?.toUpperCase() === 'DESC' ? -1 : 1);
        }
        return 0;
    });
}

/** Makes RunView read the given rows per entity, applying `Fields` (binary `Data` only when named) and `OrderBy`. */
function mockRunView(rowsFor: (entity: string) => Row[]): void {
    const fakeRunView = {
        RunView: async (params: RunViewParams) => {
            const named = (params.Fields ?? []).map((f) => f.toLowerCase());
            const results = sortByOrderBy(rowsFor(params.EntityName ?? ''), params.OrderBy).map((row) => {
                const out: Row = named.length > 0 ? Object.fromEntries(Object.entries(row).filter(([k]) => named.includes(k.toLowerCase()))) : { ...row };
                if (!named.includes('data') && params.IncludeBinaryFields !== true) delete out['Data'];
                return out;
            });
            return { Success: true, Results: results, ErrorMessage: '' };
        },
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
}

function mockInstanceSettings(values: Record<string, string> = {}): void {
    vi.spyOn(InstanceConfigEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockImplementation((key: string) => values[key]);
}

function session(id: string, overrides: Partial<ActiveDiagnosticSession> = {}): ActiveDiagnosticSession {
    return {
        id,
        name: id,
        status: 'Active',
        scopeType: 'Users',
        scope: { userIds: ['user-1'] },
        level: 'Standard',
        categories: ['Logs', 'SQL'],
        scrubLiterals: false,
        startedAtMs: Date.now(),
        endsAtMs: Date.now() + 60_000,
        maxBytes: 50_000_000,
        createdByUserId: 'user-1',
        bytesWritten: 0,
        ...overrides,
    };
}

function chunkRow(fields: { SessionID: string; Host: string; Sequence: number; CreatedAt: Date; messages: string[] }): Row {
    const ndjson = fields.messages.map((m) => JSON.stringify({ timestamp: '2026-11-02T12:00:00.000Z', severity: 'info', source: 'server', message: m })).join('\n');
    return {
        ID: crypto.randomUUID(),
        DiagnosticSessionID: fields.SessionID,
        Source: 'Server',
        ContentKind: 'Logs',
        HostInstanceLabel: fields.Host,
        Sequence: fields.Sequence,
        EntryCount: fields.messages.length,
        __mj_CreatedAt: fields.CreatedAt,
        Data: zlib.gzipSync(Buffer.from(ndjson, 'utf8')).toString('base64'),
    };
}

const sqlEntry = { timestamp: '2026-11-02T12:00:00.000Z', sql: 'SELECT 1', durationMs: 5, rowCount: 1, parameterTypes: [] };

describe('diagnostics server capture (review fixes)', () => {
    let manager: DiagnosticSessionManager;

    beforeEach(async () => {
        manager = DiagnosticSessionManager.Instance;
        manager.Initialize({ enableConsoleTap: false, enablePolling: false });
        manager.ResetForTests();
        mockInstanceSettings();
        mockRunView(() => []);
        await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (subpath: string) => subpath });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        manager.ResetForTests();
    });

    describe('memory bounds', () => {
        it('keeps no more buffered entries than MaxBytes allows while the session runs', () => {
            manager.RegisterActiveSession(session('session-cap', { maxBytes: 1000 }));
            for (let i = 0; i < 10_000; i++) {
                manager.AppendToChunkBuffer('session-cap', 'Server', 'SQL', { ...sqlEntry, sql: `SELECT ${i}` });
            }

            const drained = manager.DrainPendingBuffersForSession('session-cap');
            const kept = drained.reduce((n, c) => n + c.entryCount, 0);
            const keptBytes = drained.reduce((n, c) => n + zlib.gunzipSync(c.compressedData).byteLength, 0);
            expect(kept).toBeGreaterThan(0);
            expect(kept).toBeLessThan(10_000);
            expect(keptBytes).toBeLessThanOrEqual(1000);
        });

        it('saves a running session to the database once its buffers pass the flush threshold', async () => {
            const fake = createFakeProvider();
            WatchSessionExpiry(ownerUser, fake.Provider);
            manager.RegisterActiveSession(session('session-threshold'));
            const big = 'x'.repeat(10_000);
            for (let i = 0; i < 120; i++) {
                manager.AppendToChunkBuffer('session-threshold', 'Server', 'Logs', { message: `${i} ${big}` });
            }

            await vi.waitFor(() => expect(fake.Rows(CHUNK_ENTITY).length).toBeGreaterThan(0));
            expect(fake.Rows(CHUNK_ENTITY).every((r) => r['DiagnosticSessionID'] === 'session-threshold')).toBe(true);
        });

        it('saves the buffers of a session that expires without being stopped', async () => {
            const fake = createFakeProvider();
            WatchSessionExpiry(ownerUser, fake.Provider);
            vi.useFakeTimers({ toFake: ['Date'] });
            manager.RegisterActiveSession(session('session-expires'));
            manager.AppendToChunkBuffer('session-expires', 'Server', 'SQL', sqlEntry);
            vi.setSystemTime(Date.now() + 2 * 60_000);

            expect(manager.GetActiveSession('session-expires')).toBeUndefined();

            await vi.waitFor(() => expect(fake.Rows(CHUNK_ENTITY).map((r) => r['DiagnosticSessionID'])).toEqual(['session-expires']));
            expect(manager.DrainPendingBuffersForSession('session-expires')).toHaveLength(0);
        });

        it('drops and logs the buffers of an expired session when no user is set to save them', () => {
            WatchSessionExpiry(undefined);
            const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.useFakeTimers({ toFake: ['Date'] });
            manager.RegisterActiveSession(session('session-dropped'));
            manager.AppendToChunkBuffer('session-dropped', 'Server', 'SQL', sqlEntry);
            vi.setSystemTime(Date.now() + 2 * 60_000);

            expect(manager.GetActiveSession('session-dropped')).toBeUndefined();

            expect(manager.DrainPendingBuffersForSession('session-dropped')).toHaveLength(0);
            expect(logged.mock.calls.some((c) => c.join(' ').includes('session-dropped'))).toBe(true);
        });
    });

    describe('bundle assembly', () => {
        it('a second build of a live session holds the same server entries as the first', async () => {
            const fake = createFakeProvider();
            mockRunView((entity) => (entity === CHUNK_ENTITY ? fake.Rows(CHUNK_ENTITY) : []));
            manager.RegisterActiveSession(session('session-twice'));
            manager.AppendToChunkBuffer('session-twice', 'Server', 'SQL', sqlEntry);

            const first = await manager.AssembleBundleDataFromChunks('session-twice', false, undefined, ownerUser, fake.Provider);
            const second = await manager.AssembleBundleDataFromChunks('session-twice', false, undefined, ownerUser, fake.Provider);

            expect(first.bundleData.serverSql).toHaveLength(1);
            expect(second.bundleData.serverSql).toHaveLength(1);
        });

        it('keeps each writer’s saved chunks together in time order', async () => {
            const fake = createFakeProvider();
            const t0 = Date.now();
            const rows = [
                chunkRow({ SessionID: 'session-hosts', Host: 'host-a', Sequence: 1, CreatedAt: new Date(t0), messages: ['a1'] }),
                chunkRow({ SessionID: 'session-hosts', Host: 'host-b', Sequence: 1, CreatedAt: new Date(t0 + 1), messages: ['b1'] }),
                chunkRow({ SessionID: 'session-hosts', Host: 'host-a', Sequence: 2, CreatedAt: new Date(t0 + 2), messages: ['a2'] }),
                chunkRow({ SessionID: 'session-hosts', Host: 'host-b', Sequence: 2, CreatedAt: new Date(t0 + 3), messages: ['b2'] }),
            ];
            mockRunView((entity) => (entity === CHUNK_ENTITY ? rows : []));

            const built = await manager.AssembleBundleDataFromChunks('session-hosts', false, undefined, ownerUser, fake.Provider);

            expect(built.bundleData.serverLogs.map((l) => l.message)).toEqual(['a1', 'a2', 'b1', 'b2']);
        });
    });

    describe('capture hooks', () => {
        it('installs no SQL observer while capture is off', async () => {
            mockInstanceSettings({ 'Diagnostics.Capture.Enabled': 'false' });
            await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (subpath: string) => subpath });

            expect(GenericDatabaseProvider.HasSqlObservers()).toBe(false);
        });

        it('installs the SQL observer only while a session is held', () => {
            expect(GenericDatabaseProvider.HasSqlObservers()).toBe(false);

            manager.RegisterActiveSession(session('session-hooks'));
            expect(GenericDatabaseProvider.HasSqlObservers()).toBe(true);

            manager.StopActiveSessionInMemory('session-hooks');
            expect(GenericDatabaseProvider.HasSqlObservers()).toBe(false);
        });
    });

    describe('restored sessions', () => {
        function sessionRow(id: string, maxBytes: number): Row {
            return {
                ID: id,
                Name: id,
                Status: 'Active',
                ScopeType: 'Instance',
                ScopeJSON: '{}',
                Level: 'Standard',
                CategoriesJSON: '["Logs"]',
                ScrubLiterals: false,
                StartedAt: new Date(Date.now() - 60_000),
                EndsAt: new Date(Date.now() + 60_000),
                MaxBytes: maxBytes,
                CreatedByUserID: ownerUser.ID,
                CompanyID: null,
            };
        }

        it('restores the bytes the session already saved and keeps enforcing MaxBytes', async () => {
            const sessionId = 'AAAAAAAA-1111-4111-8111-000000000001';
            const saved = [
                chunkRow({ SessionID: sessionId, Host: 'host-old', Sequence: 1, CreatedAt: new Date(), messages: ['m'.repeat(600)] }),
                chunkRow({ SessionID: sessionId, Host: 'host-old', Sequence: 2, CreatedAt: new Date(), messages: ['n'.repeat(600)] }),
            ];
            mockRunView((entity) => (entity === SESSION_ENTITY ? [sessionRow(sessionId, 1000)] : entity === CHUNK_ENTITY ? saved : []));

            await RestoreActiveSessions(ownerUser, createFakeProvider().Provider);

            const restored = manager.GetActiveSession(sessionId);
            const compressed = saved.reduce((n, r) => n + Buffer.from(String(r['Data']), 'base64').byteLength, 0);
            expect(restored?.bytesWritten).toBe(compressed);
            manager.AppendToChunkBuffer(sessionId, 'Server', 'SQL', sqlEntry);
            expect(manager.DrainPendingBuffersForSession(sessionId)).toHaveLength(0);
        });
    });
    describe('fix round 1', () => {
        it('a chunk save that fails during a build still gives the entries in that bundle and in the next one', async () => {
            const fake = createFakeProvider();
            mockRunView((entity) => (entity === CHUNK_ENTITY ? fake.Rows(CHUNK_ENTITY) : []));
            vi.spyOn(console, 'error').mockImplementation(() => {});
            manager.RegisterActiveSession(session('session-fail-build'));
            manager.AppendToChunkBuffer('session-fail-build', 'Server', 'SQL', sqlEntry);
            fake.FailSaves = true;

            const first = await manager.AssembleBundleDataFromChunks('session-fail-build', false, undefined, ownerUser, fake.Provider);
            const second = await manager.AssembleBundleDataFromChunks('session-fail-build', false, undefined, ownerUser, fake.Provider);
            fake.FailSaves = false;
            const third = await manager.AssembleBundleDataFromChunks('session-fail-build', false, undefined, ownerUser, fake.Provider);

            expect(first.bundleData.serverSql).toHaveLength(1);
            expect(second.bundleData.serverSql).toHaveLength(1);
            expect(third.bundleData.serverSql).toHaveLength(1);
            expect(fake.Rows(CHUNK_ENTITY)).toHaveLength(1);
        });

        it('reuses its console wrapper when another library wrapped console.log after it', () => {
            const realLog = console.log;
            const inner = (): void => {};
            console.log = inner;
            try {
                manager.RegisterActiveSession(session('session-tap'));
                manager.InstallConsoleTap();
                const beneath = console.log;
                const library = (...args: unknown[]): void => beneath(...args);
                console.log = library;
                manager.StopActiveSessionInMemory('session-tap');

                manager.RegisterActiveSession(session('session-tap-2'));
                manager.InstallConsoleTap();

                expect(console.log).toBe(library);
                RunWithServerDiagnosticContext({ sessionId: 'session-tap-2', SessionEndsAtMs: Date.now() + 60_000 }, () => console.log('tapped line'));
                const drained = manager.DrainPendingBuffersForSession('session-tap-2');
                expect(drained.reduce((n, c) => n + c.entryCount, 0)).toBe(1);
            } finally {
                manager.ResetForTests();
                console.log = realLog;
            }
        });

        it('settles expired sessions while capture is off', () => {
            vi.useFakeTimers();
            const expired = vi.fn();
            manager.SetSessionExpiredHandler(expired);
            manager.RegisterActiveSession(session('session-capture-off'));
            mockInstanceSettings({ 'Diagnostics.Capture.Enabled': 'false' });
            manager.SyncCaptureHooks();

            vi.setSystemTime(Date.now() + 2 * 60_000);
            vi.advanceTimersByTime(30_000);

            expect(expired).toHaveBeenCalledTimes(1);
        });

        it('reports the chunks of a running background save when asked for the whole save chain', async () => {
            const fake = createFakeProvider();
            WatchSessionExpiry(ownerUser, fake.Provider);
            manager.RegisterActiveSession(session('session-chain'));
            const big = 'x'.repeat(10_000);
            for (let i = 0; i < 120; i++) {
                manager.AppendToChunkBuffer('session-chain', 'Client', 'Logs', { message: `${i} ${big}` });
            }
            manager.AppendToChunkBuffer('session-chain', 'Client', 'Network', { url: '/after-threshold' });

            const saved = await manager.SaveSessionChunks('session-chain', ownerUser, fake.Provider, { IncludeQueuedSaves: true });

            expect(saved.ChunksWritten).toBe(fake.Rows(CHUNK_ENTITY).length);
            expect(saved.ChunksWritten).toBe(2);
        });
    });
});
