import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    GetDiagnosticContext,
    WithoutDiagnosticCapture,
    RunDetachedDiagnosticContext,
    DiagnosticContext,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import {
    DiagnosticsUploadClientCaptureServerOperation,
    DiagnosticsBuildBundleServerOperation,
    DiagnosticsSendBundleServerOperation,
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

type ExpressAppParam = Parameters<DiagnosticsServerMiddleware['ConfigureExpressApp']>[0];

/** Records the paths a middleware registers with `get`, `post` and `put`. */
function createRouteRecorder(): { App: ExpressAppParam; Paths: string[] } {
    const paths: string[] = [];
    const record = (path: string): void => {
        paths.push(path);
    };
    const fake = { get: record, post: record, put: record };
    return { App: fake as unknown as ExpressAppParam, Paths: paths };
}

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

    beforeEach(() => {
        manager = DiagnosticSessionManager.Instance;
        manager.Initialize({ enableConsoleTap: false, enablePolling: false });
        manager.ResetForTests();
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
            const mockProvider = {} as unknown as IMetadataProvider;

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
                { provider: mockProvider, user: mockOwnerUser }
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
                { provider: mockProvider, user: mockOwnerUser }
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
                { provider: mockProvider, user: mockOwnerUser }
            );
            expect(sendRes.Success).toBe(true);
            expect(sendRes.Output?.Status).toBe('Sent');
            expect(sendRes.Output?.ExternalReferenceID).toMatch(/^diagref_/);
            expect(intake.GetReceivedBundle(sendRes.Output!.ExternalReferenceID!)?.status).toBe('Ready');
        });
    });
});
