import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    GetDiagnosticContext,
    WithoutDiagnosticCapture,
    RunDetachedDiagnosticContext,
    DiagnosticContext,
    IMetadataProvider,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { DatabasePoolStats, GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { CredentialEngine, ResolvedCredential } from '@memberjunction/credentials';
import {
    DiagnosticsStartSessionServerOperation,
    DiagnosticsStopSessionServerOperation,
    DiagnosticsGetBundlePreviewServerOperation,
    DiagnosticsUploadClientCaptureServerOperation,
    DiagnosticsBuildBundleServerOperation,
    DiagnosticsSendBundleServerOperation,
    GetInMemoryDiagnosticBundle,
} from '../remoteOperations.js';
import {
    BuildMjdiagArchive,
    EncryptDiagnosticBundle,
    GenerateDiagnosticKeyPair,
    DiagnosticBundleData,
} from '@memberjunction/diagnostics';
import {
    DiagnosticSessionManager,
    RunWithServerDiagnosticContext,
} from '../sessionManager.js';
import {
    DiagnosticIntakeService,
    IDiagnosticStorageBridge,
} from '../intakeService.js';
import {
    StructuralOnlyMalwareScanner,
    CloudObjectTagMalwareScanner,
    IDiagnosticMalwareScanner,
    MalwareScanContext,
    MalwareScanResult,
} from '../malwareScanner.js';
import { DiagnosticsServerMiddleware } from '../middleware.js';
import { MJ_VERSION } from '../version.js';
import { DiagnosticsSettings } from '../settings.js';

type ExpressAppParam = Parameters<DiagnosticsServerMiddleware['ConfigureExpressApp']>[0];

/** A response stand-in that records the status and JSON body a route handler sends. */
interface FakeResponse {
    StatusCode: number;
    Body: { error?: string } | undefined;
    status: (code: number) => FakeResponse;
    json: (body: { error?: string }) => FakeResponse;
    send: () => FakeResponse;
    setHeader: () => void;
}
type FakeRequest = { params: Record<string, string>; query: Record<string, string>; headers: Record<string, string> };
type RouteHandler = (req: FakeRequest, res: FakeResponse) => void;

/** Records the paths and handlers a middleware registers with `get`, `post` and `put`. */
function createRouteRecorder(): { App: ExpressAppParam; Paths: string[]; Handlers: Map<string, RouteHandler> } {
    const paths: string[] = [];
    const handlers = new Map<string, RouteHandler>();
    const record = (path: string, handler: RouteHandler): void => {
        paths.push(path);
        handlers.set(path, handler);
    };
    const fake = { get: record, post: record, put: record };
    return { App: fake as unknown as ExpressAppParam, Paths: paths, Handlers: handlers };
}

function createFakeResponse(): FakeResponse {
    const res: FakeResponse = {
        StatusCode: 200,
        Body: undefined,
        status: (code) => {
            res.StatusCode = code;
            return res;
        },
        json: (body) => {
            res.Body = body;
            return res;
        },
        send: () => res,
        setHeader: () => undefined,
    };
    return res;
}

type FakeFieldValue = string | number | boolean | Date | null | undefined;

/** An entity stand-in: plain field properties plus `Save`/`Load` backed by an in-memory table. */
interface FakeRow {
    ID: string;
    LatestResult: { CompleteMessage: string };
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    [field: string]: FakeFieldValue | FakeRow['LatestResult'] | FakeRow['Save'] | FakeRow['Load'];
}

type FieldSnapshot = Record<string, FakeFieldValue>;

/** A provider whose entity objects save to and load from in-memory tables. */
interface FakeDiagnosticsProvider {
    Provider: IMetadataProvider;
    /** Every successful save of an entity, in order, as a snapshot of its fields. */
    SaveHistory: (entityName: string) => FieldSnapshot[];
    /** The latest saved fields of a record. */
    Stored: (entityName: string, id: string) => FieldSnapshot | undefined;
    /** Inserts a record as if it were already in the database. */
    Seed: (entityName: string, fields: FieldSnapshot & { ID: string }) => void;
    /** Returns true for a save that must fail. */
    FailSave: (entityName: string, fields: FieldSnapshot) => boolean;
}

function fieldsOf(row: FakeRow): FieldSnapshot {
    const out: FieldSnapshot = {};
    for (const [key, value] of Object.entries(row)) {
        if (typeof value !== 'function' && key !== 'LatestResult') out[key] = value as FakeFieldValue;
    }
    return out;
}

function createFakeDiagnosticsProvider(): FakeDiagnosticsProvider {
    const tables = new Map<string, Map<string, FieldSnapshot>>();
    const history = new Map<string, FieldSnapshot[]>();
    const tableOf = (name: string): Map<string, FieldSnapshot> => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name)!;
    };
    const fake: FakeDiagnosticsProvider = {
        Provider: emptyProvider,
        SaveHistory: (name) => history.get(name) ?? [],
        Stored: (name, id) => tableOf(name).get(id),
        Seed: (name, fields) => {
            tableOf(name).set(fields.ID, { ...fields });
        },
        FailSave: () => false,
    };
    const createRow = (entityName: string): FakeRow => {
        const row: FakeRow = {
            ID: '',
            LatestResult: { CompleteMessage: `${entityName} save rejected by the database` },
            Save: async () => {
                if (fake.FailSave(entityName, fieldsOf(row))) return false;
                if (!row.ID) row.ID = crypto.randomUUID().toUpperCase();
                const snapshot = fieldsOf(row);
                tableOf(entityName).set(row.ID, snapshot);
                history.set(entityName, [...fake.SaveHistory(entityName), snapshot]);
                return true;
            },
            Load: async (id: string) => {
                const stored = tableOf(entityName).get(id);
                if (!stored) return false;
                Object.assign(row, stored);
                return true;
            },
        };
        return row;
    };
    fake.Provider = {
        GetEntityObject: async (entityName: string) => createRow(entityName),
        EntityByName: (entityName: string) => ({ Name: entityName }),
    } as unknown as IMetadataProvider;
    return fake;
}

/** Makes every RunView return the given rows. */
function mockRunViewRows(rows: FakeRow[] = []): void {
    const fakeRunView = { RunView: async () => ({ Success: true, Results: rows, ErrorMessage: '' }) };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
}

/** Makes `InstanceConfigEngine` return the given values; unlisted keys fall back to their defaults. */
function mockInstanceSettings(values: Record<string, string> = {}): void {
    const engine = InstanceConfigEngine.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
    vi.spyOn(engine, 'Get').mockImplementation((key: string) => values[key]);
}

const ownerUser = {
    ID: 'user-owner-1',
    IsActive: true,
    Type: 'Owner',
    UserRoles: [{ Role: 'Developer' }],
} as unknown as UserInfo;
const emptyProvider = {} as unknown as IMetadataProvider;

async function createValidBundleZip(bundleId: string): Promise<Uint8Array> {
    const bundleData: DiagnosticBundleData = {
        environment: {
            mjVersion: '6.2.0',
            nodeVersion: process.version,
            osPlatform: process.platform,
            osArch: process.arch,
        },
        repro: {
            breadcrumbs: [],
        },
        clientLogs: [],
        clientWaterfall: [],
        clientTelemetry: [],
        serverTraces: [],
        serverSql: [
            {
                timestamp: '2026-11-02T12:00:00.000Z',
                sql: "SELECT * FROM __mj.vwUsers WHERE Email = 'alice@example.com'",
                durationMs: 1200,
                rowCount: 1,
                parameterTypes: [],
            },
        ],
        serverLogs: [
            {
                timestamp: '2026-11-02T12:00:00.000Z',
                severity: 'info',
                source: 'server',
                message: 'Server started',
            },
        ],
        findings: [],
    };

    return BuildMjdiagArchive(bundleData, {
        bundleId,
        captureReason: 'Manual',
        scrubberProfile: 'Standard',
    });
}

describe('@memberjunction/diagnostics-server', () => {
    let manager: DiagnosticSessionManager;
    let fake: FakeDiagnosticsProvider;

    beforeEach(async () => {
        manager = DiagnosticSessionManager.Instance;
        manager.Initialize({ enableConsoleTap: false, enablePolling: false });
        manager.ResetForTests();
        mockInstanceSettings();
        mockRunViewRows();
        fake = createFakeDiagnosticsProvider();
        await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (subpath: string) => subpath });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('AsyncLocalStorage Context & Isolation', () => {
        it('propagates request context and suppresses capture inside WithoutDiagnosticCapture', async () => {
            manager.RegisterActiveSession({
                id: 'session-1',
                name: 'Test Session 1',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: ['user-1'] },
                level: 'Standard',
                categories: ['Logs', 'SQL'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: 'user-1',
                companyId: 'company-a',
                bytesWritten: 0,
            });

            await RunWithServerDiagnosticContext(
                {
                    sessionId: 'session-1',
                    SessionID: 'session-1',
                    traceId: 'trace-1',
                    TraceID: 'trace-1',
                    userId: 'user-1',
                    UserID: 'user-1',
                    CompanyID: 'company-a',
                    SessionEndsAtMs: Date.now() + 60_000,
                },
                async () => {
                    expect(GetDiagnosticContext()?.sessionId).toBe('session-1');
                    expect(GetDiagnosticContext()?.IsCaptured).toBe(true);

                    await WithoutDiagnosticCapture(async () => {
                        expect(GetDiagnosticContext()?.SuppressCapture).toBe(true);
                        expect(GetDiagnosticContext()?.IsCaptured).toBe(false);
                    });

                    expect(GetDiagnosticContext()?.IsCaptured).toBe(true);
                }
            );
        });

        it('detaches AsyncLocalStorage context inside RunDetachedDiagnosticContext', async () => {
            let insideDetachedSessionId: string | undefined = 'initial';

            await RunWithServerDiagnosticContext(
                {
                    sessionId: 'session-attached',
                    SessionEndsAtMs: Date.now() + 60_000,
                },
                async () => {
                    expect(GetDiagnosticContext()?.sessionId).toBe('session-attached');
                    RunDetachedDiagnosticContext(() => {
                        insideDetachedSessionId = GetDiagnosticContext()?.sessionId;
                    });
                }
            );

            expect(insideDetachedSessionId).toBeUndefined();
        });

        it('enforces strict CompanyID tenant isolation and Users/Operations matching across 3 stages', () => {
            manager.RegisterActiveSession({
                id: 'watch-session-tenant-a',
                name: 'Tenant A Watch',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: ['target-user-1'] },
                level: 'Standard',
                categories: ['Logs', 'SQL'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: 'admin-a',
                companyId: 'tenant-a',
                bytesWritten: 0,
            });

            // Cross-tenant attempt with same user ID must fail and detach pre-auth session header
            const crossTenantCtx: DiagnosticContext = {
                sessionId: 'watch-session-tenant-a',
                SessionID: 'watch-session-tenant-a',
            };
            const crossMatched = manager.MatchPostAuth(crossTenantCtx, 'target-user-1', undefined, 'tenant-b');
            expect(crossMatched).toBeUndefined();
            expect(crossTenantCtx.sessionId).toBeUndefined();

            // Same-tenant match succeeds even without pre-auth header
            const sameTenantCtx: DiagnosticContext = {};
            const sameMatched = manager.MatchPostAuth(sameTenantCtx, 'target-user-1', undefined, 'tenant-a');
            expect(sameMatched?.id).toBe('watch-session-tenant-a');
            expect(sameTenantCtx.sessionId).toBe('watch-session-tenant-a');
        });
    });

    describe('Single-Use HMAC Download Tokens', () => {
        it('mints a signed download token, allows single redemption for matching bundleId, and rejects replay', () => {
            const token = manager.MintDownloadToken('bundle-123', 'user-abc', 60_000);
            expect(token).toContain('.');

            // Wrong bundleId cannot redeem
            expect(manager.RedeemDownloadToken(token, 'wrong-bundle').valid).toBe(false);

            // Correct bundleId redeems once
            const firstRedeem = manager.RedeemDownloadToken(token, 'bundle-123');
            expect(firstRedeem.valid).toBe(true);
            expect(firstRedeem.userId).toBe('user-abc');

            // Second redemption (replay) is rejected
            const replayRedeem = manager.RedeemDownloadToken(token, 'bundle-123');
            expect(replayRedeem.valid).toBe(false);
            expect(replayRedeem.reason).toContain('single-use');
        });
    });

    describe('Chunk Assembly into .mjdiag Archive', () => {
        it('assembles server chunks and client seed into a verified .mjdiag archive with automated findings', async () => {
            manager.RegisterActiveSession({
                id: 'session-assemble',
                name: 'Assemble Test',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: ['user-1'] },
                level: 'Standard',
                categories: ['Logs', 'SQL'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: 'user-1',
                bytesWritten: 0,
            });

            manager.AppendToChunkBuffer('session-assemble', 'Server', 'Logs', {
                timestamp: '2026-11-02T12:00:00.000Z',
                severity: 'error',
                source: 'server',
                message: 'Failed to load entity with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig12345678',
            });
            manager.AppendToChunkBuffer('session-assemble', 'Server', 'SQL', {
                timestamp: '2026-11-02T12:00:01.000Z',
                sql: "SELECT * FROM Orders WHERE Secret = 'my-secret'",
                durationMs: 2500,
                rowCount: 10,
                parameterTypes: [],
            });

            const assembled = await manager.AssembleBundleDataFromChunks('session-assemble', true, {
                clientLogs: [
                    {
                        timestamp: '2026-11-02T12:00:02.000Z',
                        severity: 'warn',
                        source: 'client',
                        message: 'Slow network response',
                    },
                ],
            });

            expect(assembled.archiveBytes.byteLength).toBeGreaterThan(100);
            expect(assembled.bundleData.serverLogs.length).toBe(1);
            expect(assembled.bundleData.serverSql.length).toBe(1);
            expect(assembled.bundleData.clientLogs.length).toBe(1);
            expect(assembled.bundleData.serverSql[0].sql).toContain('Secret = ?');
            expect(assembled.bundleData.findings.some((f) => f.category === 'slow_sql')).toBe(true);
        });
    });

    describe('Server health snapshot and version', () => {
        it('omits the database pool block when the provider reports no pool stats', () => {
            const snapshot = manager.CollectServerHealthSnapshot(emptyProvider);
            expect(snapshot.databasePool).toBeUndefined();
        });

        it('reports the pool stats the database provider measured', () => {
            const provider = Object.create(GenericDatabaseProvider.prototype) as GenericDatabaseProvider;
            const stats: DatabasePoolStats = {
                TotalConnections: 7,
                ActiveConnections: 5,
                IdleConnections: 2,
                WaitingRequests: 3,
            };
            Object.defineProperty(provider, 'GetPoolStats', { value: () => stats });

            const snapshot = manager.CollectServerHealthSnapshot(provider);

            expect(snapshot.databasePool).toEqual({
                totalConnections: 7,
                activeConnections: 5,
                idleConnections: 2,
                waitingRequests: 3,
            });
        });

        it('stamps the bundle with MJ_VERSION', async () => {
            const assembled = await manager.AssembleBundleDataFromChunks(undefined, false, undefined, undefined, emptyProvider);
            expect(assembled.bundleData.environment.mjVersion).toBe(MJ_VERSION);
        });

        it('reads MJ_VERSION from the trimmed environment variable when it is set', async () => {
            vi.stubEnv('MJ_VERSION', '  9.9.9-test  ');
            vi.resetModules();
            try {
                const fresh = await import('../version.js');
                expect(fresh.MJ_VERSION).toBe('9.9.9-test');
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it('falls back to the package version when MJ_VERSION is blank', async () => {
            const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
            vi.stubEnv('MJ_VERSION', '   ');
            vi.resetModules();
            try {
                const fresh = await import('../version.js');
                expect(fresh.MJ_VERSION).toBe(pkg.version);
            } finally {
                vi.unstubAllEnvs();
            }
        });
    });

    describe('Bundle redaction summary', () => {
        it('reports the number of credential redactions in the manifest, not the number of log lines', async () => {
            manager.RegisterActiveSession({
                id: 'session-redaction-count',
                name: 'Redaction Count Test',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: ['user-1'] },
                level: 'Standard',
                categories: ['Logs'],
                scrubLiterals: false,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: 'user-1',
                bytesWritten: 0,
            });
            manager.AppendToChunkBuffer('session-redaction-count', 'Server', 'Logs', {
                timestamp: '2026-11-02T12:00:00.000Z',
                severity: 'error',
                source: 'server',
                message: 'key sk-proj-1234567890abcdefghijklmnop then AKIAIOSFODNN7EXAMPLE then Password=hunter2',
            });

            const assembled = await manager.AssembleBundleDataFromChunks('session-redaction-count', false, {
                clientLogs: [
                    { timestamp: '2026-11-02T12:00:01.000Z', severity: 'info', source: 'client', message: 'no secrets here' },
                ],
            });

            const summary = assembled.manifest['redactionSummary'] as { credentialsScrubbedCount: number };
            expect(summary.credentialsScrubbedCount).toBe(3);
            expect(assembled.scrubReport.credentialsScrubbedCount).toBe(3);
        });
    });

    describe('DiagnosticsServerMiddleware routes', () => {
        it('registers every route under the base path the server context supplies', async () => {
            const mw = new DiagnosticsServerMiddleware();
            await mw.Initialize({ ApiRoute: (subpath: string) => `/api${subpath}` });
            const recorder = createRouteRecorder();
            mw.ConfigureExpressApp(recorder.App);

            expect(recorder.Paths).toContain('/api/diagnostics/intake/v1/public-key');
            expect(recorder.Paths).toContain('/api/diagnostics/intake/v1/bundles');
            expect(recorder.Paths).toContain('/api/diagnostics/intake/v1/bundles/:referenceId/payload');
            expect(recorder.Paths).toContain('/api/diagnostics/intake/v1/bundles/:referenceId/complete');
            expect(recorder.Paths.every((p) => p.startsWith('/api/'))).toBe(true);
        });

        it('fails loudly when a route is built before the server context is set', () => {
            const mw = new DiagnosticsServerMiddleware();
            const recorder = createRouteRecorder();
            expect(() => mw.ConfigureExpressApp(recorder.App)).toThrow(/ServerMiddlewareContext/);
        });
    });

    describe('SendBundleToCollector URL handling', () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('trims the collector URL in linear time when it holds many non-trailing slashes', async () => {
            const fetchStub = vi.fn(async () => {
                throw new Error('network disabled in test');
            });
            vi.stubGlobal('fetch', fetchStub);
            const collectorBaseUrl = 'http://collector.example' + '/'.repeat(100_000) + 'x';

            const started = Date.now();
            await expect(
                manager.SendBundleToCollector({
                    archiveBytes: new Uint8Array([1, 2, 3]),
                    bundleId: 'bundle-slash-test',
                    scrubLiterals: true,
                    collectorBaseUrl,
                })
            ).rejects.toThrow('network disabled in test');
            expect(Date.now() - started).toBeLessThan(2000);
            expect(fetchStub).toHaveBeenCalledWith(`${collectorBaseUrl}/public-key`, expect.anything());
        });
    });

    describe('DiagnosticIntakeService & Malware Scanners (End-to-End)', () => {
        it('completes a 3-step encrypted intake with Quarantine-then-Promote storage and StructuralOnlyMalwareScanner', async () => {
            const collectorKey = await GenerateDiagnosticKeyPair('X25519', 'mjc-intake-key-2026');
            const quarantineObjects = new Map<string, Uint8Array>();
            const verifiedObjects = new Map<string, Uint8Array>();

            const storageBridge: IDiagnosticStorageBridge = {
                WriteQuarantineObject: async (refId, bytes) => {
                    const qPath = `quarantine/${refId}.mjdiag.enc`;
                    quarantineObjects.set(qPath, bytes);
                    return qPath;
                },
                PromoteToVerifiedStorage: async (refId, qPath, verifiedZipBytes) => {
                    quarantineObjects.delete(qPath);
                    const vPath = `verified/${refId}.mjdiag`;
                    verifiedObjects.set(vPath, verifiedZipBytes);
                    return vPath;
                },
                DeleteQuarantineObject: async (qPath) => {
                    quarantineObjects.delete(qPath);
                },
            };

            const intake = DiagnosticIntakeService.Instance;
            intake.ResetForTests();
            intake.RegisterKeyPair(collectorKey);
            intake.Configure({
                enabled: true,
                malwareScanner: new StructuralOnlyMalwareScanner(),
                storageBridge,
            });

            const bundleId = 'intake-bundle-001';
            const zipBytes = await createValidBundleZip(bundleId);
            const plaintextSha256 = crypto.createHash('sha256').update(zipBytes).digest('hex');

            const encryptedBytes = await EncryptDiagnosticBundle(zipBytes, {
                recipientKeyId: collectorKey.keyId,
                recipientPublicKeyBase64: collectorKey.publicKeyBase64,
                senderEnvironmentId: 'install-001',
                manifestSha256: plaintextSha256,
            });
            const encryptedSha256 = crypto.createHash('sha256').update(encryptedBytes).digest('hex');

            // Step 1: Initiate
            const initiated = intake.InitiateBundleIntake({
                installId: 'install-001',
                bundleId,
                formatVersion: 1,
                mjVersion: '6.2.0',
                scrubLiterals: true,
                sizeBytes: encryptedBytes.byteLength,
                plaintextSha256,
                encryptedSha256,
                keyId: collectorKey.keyId,
                summary: 'Customer slow query report',
            });
            expect(initiated.referenceId).toContain('diagref_');

            // Step 2: Upload encrypted bytes to Quarantine
            const uploadRes = await intake.UploadEncryptedPayload(initiated.referenceId, encryptedBytes);
            expect(uploadRes.accepted).toBe(true);
            expect(quarantineObjects.size).toBe(1);
            expect(verifiedObjects.size).toBe(0);

            // Step 3: Complete (decrypts, verifies archive structure, runs malware scanner, promotes to verified)
            const completed = await intake.CompleteBundleIntake(initiated.referenceId, {
                encryptedSha256,
                plaintextSha256,
            });
            expect(completed.status).toBe('received');
            expect(completed.bundleId).toBe(bundleId);
            expect(completed.findingsCount).toBeGreaterThanOrEqual(1);
            expect(quarantineObjects.size).toBe(0);
            expect(verifiedObjects.size).toBe(1);
        });

        it('rejects junk (non-MJDB) uploads in <1ms before writing to quarantine storage', async () => {
            const collectorKey = await GenerateDiagnosticKeyPair('X25519', 'mjc-intake-key-2026');
            let quarantineWrites = 0;

            const intake = DiagnosticIntakeService.Instance;
            intake.ResetForTests();
            intake.RegisterKeyPair(collectorKey);
            intake.Configure({
                enabled: true,
                storageBridge: {
                    WriteQuarantineObject: async () => {
                        quarantineWrites += 1;
                        return 'quarantine/junk';
                    },
                    PromoteToVerifiedStorage: async () => 'verified/junk',
                    DeleteQuarantineObject: async () => {},
                },
            });

            const junkBytes = new TextEncoder().encode(
                'This is definitely not an MJDB encrypted archive!'.padEnd(64, '!')
            );
            const junkHash = crypto.createHash('sha256').update(junkBytes).digest('hex');

            const initiated = intake.InitiateBundleIntake({
                installId: 'install-junk',
                bundleId: 'junk-bundle',
                formatVersion: 1,
                mjVersion: '6.2.0',
                scrubLiterals: true,
                sizeBytes: junkBytes.byteLength,
                plaintextSha256: junkHash,
                encryptedSha256: junkHash,
                keyId: collectorKey.keyId,
            });

            const uploadRes = await intake.UploadEncryptedPayload(initiated.referenceId, junkBytes);
            expect(uploadRes.accepted).toBe(false);
            expect(uploadRes.reasonCode).toBe('INVALID_ENVELOPE_MAGIC');
            expect(quarantineWrites).toBe(0);
        });

        it('purges quarantine and rejects intake when malware scanner reports Infected', async () => {
            const collectorKey = await GenerateDiagnosticKeyPair('X25519', 'mjc-intake-key-2026');
            const quarantineObjects = new Map<string, Uint8Array>();

            const infectedScanner: IDiagnosticMalwareScanner = {
                Name: 'MockInfectedScanner',
                ScanBundle: async (_ctx: MalwareScanContext): Promise<MalwareScanResult> => ({
                    verdict: 'Infected',
                    engineName: 'MockInfectedScanner',
                    threatName: 'EICAR-Test-File',
                    scannedAt: new Date().toISOString(),
                    durationMs: 5,
                }),
            };

            const intake = DiagnosticIntakeService.Instance;
            intake.ResetForTests();
            intake.RegisterKeyPair(collectorKey);
            intake.Configure({
                enabled: true,
                malwareScanner: infectedScanner,
                storageBridge: {
                    WriteQuarantineObject: async (refId, bytes) => {
                        quarantineObjects.set(refId, bytes);
                        return refId;
                    },
                    PromoteToVerifiedStorage: async () => 'verified',
                    DeleteQuarantineObject: async (qPath) => {
                        quarantineObjects.delete(qPath);
                    },
                },
            });

            const bundleId = 'infected-bundle-1';
            const zipBytes = await createValidBundleZip(bundleId);
            const plaintextSha256 = crypto.createHash('sha256').update(zipBytes).digest('hex');
            const encryptedBytes = await EncryptDiagnosticBundle(zipBytes, {
                recipientKeyId: collectorKey.keyId,
                recipientPublicKeyBase64: collectorKey.publicKeyBase64,
                senderEnvironmentId: 'install-001',
                manifestSha256: plaintextSha256,
            });
            const encryptedSha256 = crypto.createHash('sha256').update(encryptedBytes).digest('hex');

            const initiated = intake.InitiateBundleIntake({
                installId: 'install-001',
                bundleId,
                formatVersion: 1,
                mjVersion: '6.2.0',
                scrubLiterals: true,
                sizeBytes: encryptedBytes.byteLength,
                plaintextSha256,
                encryptedSha256,
                keyId: collectorKey.keyId,
            });

            await intake.UploadEncryptedPayload(initiated.referenceId, encryptedBytes);
            expect(quarantineObjects.size).toBe(1);

            const completeRes = await intake.CompleteBundleIntake(initiated.referenceId, {
                encryptedSha256,
                plaintextSha256,
            });
            expect(completeRes.status).toBe('rejected');
            expect(completeRes.reasonCode).toBe('MALWARE_INFECTED');
            expect(completeRes.reason).toContain('EICAR-Test-File');
            expect(quarantineObjects.size).toBe(0);
        });

        it('supports CloudObjectTagMalwareScanner for AWS GuardDuty and Azure Defender tags', async () => {
            const awsScanner = new CloudObjectTagMalwareScanner({
                FetchObjectTags: async () => ({
                    GuardDutyMalwareScanStatus: 'NO_THREATS_FOUND',
                }),
            });

            const awsResult = await awsScanner.ScanBundle({
                referenceId: 'ref-1',
                bundleId: 'b1',
                senderInstallId: 'inst-1',
                quarantineObjectPath: 'quarantine/b1',
                encryptedBytes: new Uint8Array(10),
                decryptedZipBytes: new Uint8Array(10),
            });
            expect(awsResult.verdict).toBe('Clean');

            const azureScanner = new CloudObjectTagMalwareScanner({
                FetchObjectTags: async () => ({
                    'Malware Scanning scan result': 'Malicious',
                    'Malware Scanning threat type': 'Trojan.Generic',
                }),
            });

            const azureResult = await azureScanner.ScanBundle({
                referenceId: 'ref-2',
                bundleId: 'b2',
                senderInstallId: 'inst-1',
                quarantineObjectPath: 'quarantine/b2',
                encryptedBytes: new Uint8Array(10),
                decryptedZipBytes: new Uint8Array(10),
            });
            expect(azureResult.verdict).toBe('Infected');
            expect(azureResult.threatName).toBe('Trojan.Generic');
        });

        it('routes DiagnosticsSendBundleServerOperation through local DiagnosticIntakeService when no external collector URL is configured', async () => {
            const intake = DiagnosticIntakeService.Instance;
            intake.ResetForTests();

            const mockOwnerUser = {
                ID: 'user-owner-1',
                IsActive: true,
                Type: 'Owner',
                UserRoles: [{ Role: 'Developer' }],
            } as unknown as UserInfo;

            const uploadOp = new DiagnosticsUploadClientCaptureServerOperation();
            const uploadRes = await uploadOp.ExecuteServer(
                {
                    CreateSelfServiceSession: true,
                    Reason: 'UserReportedProblem',
                    ScrubLiterals: true,
                    ClientLogs: [
                        {
                            timestamp: new Date().toISOString(),
                            severity: 'error',
                            source: 'client',
                            message: 'Unhandled UI error in Explorer',
                        },
                    ],
                },
                { provider: fake.Provider, user: mockOwnerUser }
            );
            expect(uploadRes.Success).toBe(true);
            expect(uploadRes.Output?.SessionID).toBeTruthy();

            const buildOp = new DiagnosticsBuildBundleServerOperation();
            const buildRes = await buildOp.ExecuteServer(
                {
                    SessionID: uploadRes.Output!.SessionID,
                    Name: 'Explorer Support Bundle',
                    ScrubLiterals: true,
                },
                { provider: fake.Provider, user: mockOwnerUser }
            );
            expect(buildRes.Success).toBe(true);
            expect(buildRes.Output?.Status).toBe('Ready');

            const sendOp = new DiagnosticsSendBundleServerOperation();
            const sendRes = await sendOp.ExecuteServer(
                {
                    BundleID: buildRes.Output!.BundleID,
                    Destination: 'MJC',
                    Summary: 'Smoke test from Explorer dialog',
                },
                { provider: fake.Provider, user: mockOwnerUser }
            );
            expect(sendRes.Success).toBe(true);
            expect(sendRes.Output?.Status).toBe('Sent');
            expect(sendRes.Output?.ExternalReferenceID).toMatch(/^diagref_/);
            expect(intake.GetReceivedBundle(sendRes.Output!.ExternalReferenceID!)?.status).toBe('Ready');
        });
    });
    describe('Diagnostics.* instance settings', () => {
        it('StartSession refuses when Diagnostics.Capture.Enabled is false', async () => {
            mockInstanceSettings({ 'Diagnostics.Capture.Enabled': 'false' });
            const op = new DiagnosticsStartSessionServerOperation();
            const res = await op.ExecuteServer(
                { Name: 'Capture off', ScopeType: 'Users' },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toMatch(/Diagnostics\.Capture\.Enabled/);
            expect(manager.GetAllActiveSessions()).toHaveLength(0);
        });

        it('RequireLiteralScrubbing forces ScrubLiterals on StartSession and BuildBundle', async () => {
            mockInstanceSettings({ 'Diagnostics.RequireLiteralScrubbing': 'true' });
            const startRes = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'Forced scrub', ScopeType: 'Users', ScrubLiterals: false },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(startRes.Output?.ScrubLiterals).toBe(true);

            const buildRes = await new DiagnosticsBuildBundleServerOperation().ExecuteServer(
                { SessionID: startRes.Output!.SessionID, ScrubLiterals: false },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(buildRes.Success).toBe(true);
            expect(GetInMemoryDiagnosticBundle(buildRes.Output!.BundleID)?.scrubLiterals).toBe(true);
        });

        it('SendBundle refuses an external collector when Diagnostics.External.Enabled is false', async () => {
            mockInstanceSettings({ 'Diagnostics.External.CollectorUrl': 'https://collector.example/diagnostics/intake/v1' });
            const fetchStub = vi.fn(async () => {
                throw new Error('network disabled in test');
            });
            vi.stubGlobal('fetch', fetchStub);
            try {
                const uploadRes = await new DiagnosticsUploadClientCaptureServerOperation().ExecuteServer(
                    { ClientLogs: [{ timestamp: new Date().toISOString(), severity: 'error', source: 'client', message: 'x' }] },
                    { provider: fake.Provider, user: ownerUser }
                );
                const buildRes = await new DiagnosticsBuildBundleServerOperation().ExecuteServer(
                    { SessionID: uploadRes.Output!.SessionID },
                    { provider: fake.Provider, user: ownerUser }
                );
                const sendRes = await new DiagnosticsSendBundleServerOperation().ExecuteServer(
                    { BundleID: buildRes.Output!.BundleID, Destination: 'CustomerCollector' },
                    { provider: fake.Provider, user: ownerUser }
                );
                expect(sendRes.Success).toBe(false);
                expect(sendRes.ErrorMessage).toMatch(/Diagnostics\.External\.Enabled/);
                expect(fetchStub).not.toHaveBeenCalled();
            } finally {
                vi.unstubAllGlobals();
            }
        });

        it('server startup leaves intake disabled when no key credential is set', async () => {
            DiagnosticIntakeService.Instance.ResetForTests();
            mockInstanceSettings({ 'Diagnostics.Intake.Enabled': 'true' });
            const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

            await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (p: string) => p });

            expect(DiagnosticIntakeService.Instance.Enabled).toBe(false);
            expect(logged.mock.calls.some((c) => c.join(' ').includes('Diagnostics.Intake.KeyPairCredentialID'))).toBe(true);
        });

        it('server startup configures intake from the settings and the key credential', async () => {
            DiagnosticIntakeService.Instance.ResetForTests();
            const key = await GenerateDiagnosticKeyPair('X25519', 'intake-key-from-credential');
            mockInstanceSettings({
                'Diagnostics.Intake.Enabled': 'true',
                'Diagnostics.Intake.KeyPairCredentialID': 'CRED-0001',
                'Diagnostics.Intake.RetentionDays': '7',
            });
            vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
            const resolved: ResolvedCredential = {
                credential: null,
                values: { keyId: key.keyId, publicKey: key.publicKeyBase64, privateKey: key.privateKeyBase64 },
                source: 'database',
                expirationStatus: 'valid',
            };
            const getCredential = vi.spyOn(CredentialEngine.Instance, 'GetCredential').mockResolvedValue(resolved);

            await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (p: string) => p });

            expect(getCredential).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentialId: 'CRED-0001' }));
            expect(DiagnosticIntakeService.Instance.Enabled).toBe(true);
            const descriptor = await DiagnosticIntakeService.Instance.GetPublicKeyDescriptor();
            expect(descriptor.keyId).toBe(key.keyId);
            expect(descriptor.publicKey).toBe(key.publicKeyBase64);
        });
    });
    describe('Self-service recording sessions', () => {
        const selfUser = {
            ID: 'AAAAAAAA-1111-4111-8111-000000000001',
            IsActive: true,
            Type: 'User',
            UserRoles: [],
        } as unknown as UserInfo;
        const otherUserId = 'BBBBBBBB-2222-4222-8222-000000000002';

        function registerSession(id: string, createdByUserId: string, userIds: string[]): void {
            manager.RegisterActiveSession({
                id,
                name: id,
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds },
                level: 'Standard',
                categories: ['Logs'],
                scrubLiterals: false,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId,
                bytesWritten: 0,
            });
        }

        it('lets a self-service user stop, build and preview a session they started', async () => {
            mockInstanceSettings({ 'Diagnostics.SelfServiceRecording': 'true' });
            const ctx = { provider: fake.Provider, user: selfUser };
            const started = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'My problem', ScopeType: 'Users' },
                ctx
            );
            expect(started.Success).toBe(true);
            const sessionId = started.Output!.SessionID;

            const stopped = await new DiagnosticsStopSessionServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);
            expect(stopped.Success).toBe(true);

            const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);
            expect(built.Success).toBe(true);

            const preview = await new DiagnosticsGetBundlePreviewServerOperation().ExecuteServer(
                { BundleID: built.Output!.BundleID },
                ctx
            );
            expect(preview.Success).toBe(true);
        });

        it("refuses a self-service user on another user's session", async () => {
            mockInstanceSettings({ 'Diagnostics.SelfServiceRecording': 'true' });
            const ctx = { provider: fake.Provider, user: selfUser };
            registerSession('other-users-session', otherUserId, [otherUserId]);
            registerSession('admin-session-on-me', otherUserId, [selfUser.ID]);

            for (const sessionId of ['other-users-session', 'admin-session-on-me']) {
                const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);
                expect(built.Success).toBe(false);
                expect(built.ErrorMessage).toMatch(/Not authorized/);
                const stopped = await new DiagnosticsStopSessionServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);
                expect(stopped.Success).toBe(false);
                expect(stopped.ErrorMessage).toMatch(/Not authorized/);
            }

            const ownerBuilt = await new DiagnosticsBuildBundleServerOperation().ExecuteServer(
                { SessionID: 'other-users-session' },
                { provider: fake.Provider, user: ownerUser }
            );
            const preview = await new DiagnosticsGetBundlePreviewServerOperation().ExecuteServer(
                { BundleID: ownerBuilt.Output!.BundleID },
                ctx
            );
            expect(preview.Success).toBe(false);
            expect(preview.ErrorMessage).toMatch(/Not authorized/);
        });

        it('lets the owner build from a stopped session after a restart', async () => {
            mockInstanceSettings({ 'Diagnostics.SelfServiceRecording': 'true' });
            const ctx = { provider: fake.Provider, user: selfUser };
            const started = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'Before restart', ScopeType: 'Users' },
                ctx
            );
            const sessionId = started.Output!.SessionID;
            await new DiagnosticsStopSessionServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);

            manager.ResetForTests();

            const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ SessionID: sessionId }, ctx);
            expect(built.Success).toBe(true);
        });
    });

    describe('Persisted sessions', () => {
        const sessionEntity = 'MJ: Diagnostic Sessions';

        async function startSession(name = 'Persisted'): Promise<string> {
            const res = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: name, ScopeType: 'Users', ScrubLiterals: true },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(res.Success).toBe(true);
            return res.Output!.SessionID;
        }

        it('StartSession saves a session row and uses its ID', async () => {
            const sessionId = await startSession();

            const row = fake.Stored(sessionEntity, sessionId);
            expect(row).toBeDefined();
            expect(row).toMatchObject({
                Name: 'Persisted',
                Status: 'Active',
                ScopeType: 'Users',
                Level: 'Standard',
                ScrubLiterals: true,
                CreatedByUserID: ownerUser.ID,
            });
            expect(JSON.parse(String(row!.ScopeJSON))).toEqual({ userIds: [ownerUser.ID] });
            expect(row!.EndsAt).toBeInstanceOf(Date);
            expect(manager.GetActiveSession(sessionId)?.id).toBe(sessionId);
        });

        it('StartSession fails with the save message when the row is not saved', async () => {
            fake.FailSave = (name) => name === sessionEntity;
            const res = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
                { Name: 'Rejected', ScopeType: 'Users' },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('MJ: Diagnostic Sessions save rejected by the database');
            expect(manager.GetAllActiveSessions()).toHaveLength(0);
        });

        it('StopSession marks the row Stopped with a stop time', async () => {
            const sessionId = await startSession();
            const res = await new DiagnosticsStopSessionServerOperation().ExecuteServer(
                { SessionID: sessionId },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(res.Success).toBe(true);
            expect(fake.Stored(sessionEntity, sessionId)?.Status).toBe('Stopped');
            expect(fake.Stored(sessionEntity, sessionId)?.StoppedAt).toBeInstanceOf(Date);
        });

        it('StopSession marks a session that ran past its end time Expired', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            try {
                const sessionId = await startSession();
                vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
                await new DiagnosticsStopSessionServerOperation().ExecuteServer(
                    { SessionID: sessionId },
                    { provider: fake.Provider, user: ownerUser }
                );
                expect(fake.Stored(sessionEntity, sessionId)?.Status).toBe('Expired');
            } finally {
                vi.useRealTimers();
            }
        });

        it('counts only saved chunks and logs one line with the save message when a chunk save fails', async () => {
            const sessionId = await startSession();
            manager.AppendToChunkBuffer(sessionId, 'Server', 'Logs', { message: 'kept' });
            manager.AppendToChunkBuffer(sessionId, 'Server', 'SQL', { sql: 'SELECT 1' });
            manager.AppendToChunkBuffer(sessionId, 'Server', 'Spans', { name: 'span' });
            fake.FailSave = (name, fields) => name === 'MJ: Diagnostic Session Chunks' && fields.ContentKind !== 'Logs';
            const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

            const written = await manager.FlushSessionChunksToDatabase(sessionId, ownerUser, fake.Provider);

            expect(written).toBe(1);
            const chunkLines = logged.mock.calls.filter((c) => c.join(' ').includes('MJ: Diagnostic Session Chunks save rejected'));
            expect(chunkLines).toHaveLength(1);
        });

        it('loads Active sessions at startup and expires the ones whose end time has passed', async () => {
            const live = createFakeDiagnosticsProvider();
            const rowFor = async (id: string, endsAt: Date): Promise<FakeRow> => {
                live.Seed(sessionEntity, {
                    ID: id,
                    Name: id,
                    Status: 'Active',
                    ScopeType: 'Instance',
                    ScopeJSON: '{}',
                    Level: 'Standard',
                    CategoriesJSON: '["Logs"]',
                    ScrubLiterals: true,
                    StartedAt: new Date(Date.now() - 60_000),
                    EndsAt: endsAt,
                    MaxBytes: 1000,
                    CreatedByUserID: ownerUser.ID,
                    CompanyID: null,
                });
                const row = (await live.Provider.GetEntityObject(sessionEntity)) as unknown as FakeRow;
                await row.Load(id);
                return row;
            };
            const liveRow = await rowFor('LIVE-SESSION', new Date(Date.now() + 60_000));
            const staleRow = await rowFor('STALE-SESSION', new Date(Date.now() - 1_000));
            mockRunViewRows([liveRow, staleRow]);

            await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (p: string) => p });

            expect(manager.GetActiveSession('LIVE-SESSION')?.scopeType).toBe('Instance');
            expect(manager.GetActiveSession('STALE-SESSION')).toBeUndefined();
            expect(live.Stored(sessionEntity, 'STALE-SESSION')?.Status).toBe('Expired');
        });
    });

    describe('Persisted local bundles', () => {
        const bundleEntity = 'MJ: Diagnostic Bundles';

        async function buildBundle(): Promise<{ sessionId: string; bundleId: string }> {
            const ctx = { provider: fake.Provider, user: ownerUser };
            const started = await new DiagnosticsStartSessionServerOperation().ExecuteServer({ Name: 'B', ScopeType: 'Users' }, ctx);
            const sessionId = started.Output!.SessionID;
            const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ SessionID: sessionId, Name: 'My bundle' }, ctx);
            expect(built.Success).toBe(true);
            return { sessionId, bundleId: built.Output!.BundleID };
        }

        it('BuildBundle saves a Local bundle row through Building to Ready', async () => {
            const { sessionId, bundleId } = await buildBundle();

            const saves = fake.SaveHistory(bundleEntity);
            expect(saves.map((s) => s.Status)).toEqual(['Building', 'Ready']);
            const row = fake.Stored(bundleEntity, bundleId);
            expect(row).toMatchObject({
                Name: 'My bundle',
                Direction: 'Local',
                Status: 'Ready',
                DiagnosticSessionID: sessionId,
                CreatedByUserID: ownerUser.ID,
                SHA256: GetInMemoryDiagnosticBundle(bundleId)?.sha256,
            });
            expect(Number(row!.SizeBytes)).toBeGreaterThan(0);
            expect(JSON.parse(String(row!.ManifestJSON))).toHaveProperty('bundleId');
            expect(Array.isArray(JSON.parse(String(row!.FindingsJSON)))).toBe(true);
            expect(JSON.parse(String(row!.ScrubReportJSON))).toHaveProperty('credentialsScrubbedCount');
            expect(row!.ExpiresAt).toBeInstanceOf(Date);
            expect(row!.Data ?? null).toBeNull();
        });

        it('SendBundle moves the row through Sending to Sent with the reference ID', async () => {
            DiagnosticIntakeService.Instance.ResetForTests();
            const { bundleId } = await buildBundle();
            const sent = await new DiagnosticsSendBundleServerOperation().ExecuteServer(
                { BundleID: bundleId, Destination: 'MJC' },
                { provider: fake.Provider, user: ownerUser }
            );
            expect(sent.Success).toBe(true);

            const statuses = fake.SaveHistory(bundleEntity).map((s) => s.Status);
            expect(statuses.slice(-2)).toEqual(['Sending', 'Sent']);
            expect(fake.Stored(bundleEntity, bundleId)).toMatchObject({
                Destination: 'MJC',
                ExternalReferenceID: sent.Output!.ExternalReferenceID,
            });
            expect(fake.Stored(bundleEntity, bundleId)?.SentAt).toBeInstanceOf(Date);
        });

        it('SendBundle marks the row Failed with the reason when the send fails', async () => {
            mockInstanceSettings({ 'Diagnostics.External.Enabled': 'true' });
            vi.stubGlobal('fetch', vi.fn(async () => {
                throw new Error('collector unreachable');
            }));
            try {
                const { bundleId } = await buildBundle();
                const sent = await new DiagnosticsSendBundleServerOperation().ExecuteServer(
                    { BundleID: bundleId, Destination: 'CustomerCollector', CollectorUrlOverride: 'https://collector.example' },
                    { provider: fake.Provider, user: ownerUser }
                );
                expect(sent.Success).toBe(false);
                expect(fake.Stored(bundleEntity, bundleId)?.Status).toBe('Failed');
                expect(String(fake.Stored(bundleEntity, bundleId)?.FailureReason)).toContain('collector unreachable');
            } finally {
                vi.unstubAllGlobals();
            }
        });

        it('answers a download with a clear message when the bundle bytes are not on this instance', () => {
            const mw = new DiagnosticsServerMiddleware();
            const recorder = createRouteRecorder();
            mw.ConfigureExpressApp(recorder.App, { ApiRoute: (p: string) => p });
            const download = recorder.Handlers.get('/diagnostics/bundles/:bundleId/download')!;
            const token = manager.MintDownloadToken('BUNDLE-FROM-BEFORE-RESTART', ownerUser.ID);
            const res = createFakeResponse();

            download({ params: { bundleId: 'BUNDLE-FROM-BEFORE-RESTART' }, query: { token }, headers: {} }, res);

            expect(res.StatusCode).not.toBe(404);
            expect(res.Body?.error).toMatch(/no longer available on this instance; rebuild the bundle/);
        });
    });

    describe('Bundle download URL', () => {
        it('builds the download URL under the API base path', async () => {
            await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (subpath: string) => `/api${subpath}` });
            const ctx = { provider: fake.Provider, user: ownerUser };
            const started = await new DiagnosticsStartSessionServerOperation().ExecuteServer({ Name: 'U', ScopeType: 'Users' }, ctx);
            const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({ SessionID: started.Output!.SessionID }, ctx);
            expect(built.Output?.DownloadUrl).toMatch(/^\/api\/diagnostics\/bundles\//);

            const preview = await new DiagnosticsGetBundlePreviewServerOperation().ExecuteServer(
                { BundleID: built.Output!.BundleID, MintDownloadToken: true },
                ctx
            );
            expect(preview.Output?.DownloadUrl).toMatch(/^\/api\/diagnostics\/bundles\//);
        });

        it('fails BuildBundle loudly when the server gave no route builder', async () => {
            await new DiagnosticsServerMiddleware().Initialize();
            const ctx = { provider: fake.Provider, user: ownerUser };
            const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({}, ctx);
            expect(built.Success).toBe(false);
            expect(built.ErrorMessage).toMatch(/ApiRoute/);
        });
    });

    describe('Server startup robustness', () => {
        it('keeps starting with capture and intake off when the settings fail to load', async () => {
            DiagnosticIntakeService.Instance.ResetForTests();
            vi.spyOn(InstanceConfigEngine.Instance, 'Config').mockRejectedValue(new Error('settings table unreachable'));
            const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(new DiagnosticsServerMiddleware().Initialize({ ApiRoute: (p: string) => p })).resolves.toBeUndefined();

            expect(DiagnosticsSettings.Current().CaptureEnabled).toBe(false);
            expect(DiagnosticIntakeService.Instance.Enabled).toBe(false);
            expect(logged.mock.calls.some((c) => c.join(' ').includes('settings table unreachable'))).toBe(true);

            mockInstanceSettings();
            await DiagnosticsSettings.Load();
            expect(DiagnosticsSettings.Current().CaptureEnabled).toBe(true);
        });
    });

    describe('Explicit session header', () => {
        const targetUserId = 'CCCCCCCC-3333-4333-8333-000000000003';

        function registerUsersSession(id: string): void {
            manager.RegisterActiveSession({
                id,
                name: id,
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: [targetUserId] },
                level: 'Standard',
                categories: ['Logs'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: ownerUser.ID,
                bytesWritten: 0,
            });
        }

        it('does not attach a user-scoped session before auth, and attaches it after auth only for a target', () => {
            registerUsersSession('users-session');

            const preCtx: DiagnosticContext = {};
            expect(manager.MatchPreAuth(preCtx, 'users-session')).toBeUndefined();
            expect(preCtx.sessionId).toBeUndefined();
            expect(manager.MatchPostAuth(preCtx, 'someone-else')).toBeUndefined();
            expect(preCtx.sessionId).toBeUndefined();

            const targetCtx: DiagnosticContext = {};
            manager.MatchPreAuth(targetCtx, 'users-session');
            expect(manager.MatchPostAuth(targetCtx, targetUserId)?.id).toBe('users-session');
        });
    });
});
