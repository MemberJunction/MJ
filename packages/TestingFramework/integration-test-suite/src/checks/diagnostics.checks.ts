/**
 * diagnostics.checks.ts — the 'diagnostics' bundle (DIAG1–DIAG4):
 * Integration checks exercising the Diagnostic Bundles subsystem:
 *   DIAG1: Session registration, AsyncLocalStorage SQL/Log capture, and WithoutDiagnosticCapture suppression
 *   DIAG2: AssembleBundleDataFromChunks, structural verification (VerifyBundleArchive), and single-use HMAC download token
 *   DIAG3: Collector encryption (MJDB v1 X25519 + AES-256-GCM AAD) & standard MJAPI Intake quarantine-then-promote verification
 *   DIAG4: Junk / tampered upload rejection before quarantine storage write
 */
import * as crypto from 'node:crypto';
import {
    GetDiagnosticContext,
    WithoutDiagnosticCapture,
} from '@memberjunction/core';
import {
    VerifyBundleArchive,
    ParseBundleDataFromArchive,
    EncryptDiagnosticBundle,
    GenerateDiagnosticKeyPair,
} from '@memberjunction/diagnostics';
import {
    DiagnosticSessionManager,
    DiagnosticIntakeService,
    StructuralOnlyMalwareScanner,
    RunWithServerDiagnosticContext,
} from '@memberjunction/diagnostics-server';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    NamedCheck,
    IntegrationCheckContext,
} from '@memberjunction/testing-integration';

export const DiagnosticsChecks: NamedCheck[] = [
    {
        Id: 'diagnostics.DIAG1',
        Name: 'DIAG1: Session registration, AsyncLocalStorage context propagation, and WithoutDiagnosticCapture suppression',
        Fn: async (ctx: IntegrationCheckContext) => {
            const manager = DiagnosticSessionManager.Instance;
            const sessionId = `it-diag-session-${Date.now()}`;
            const userId = ctx.User.ID;

            manager.RegisterActiveSession({
                id: sessionId,
                name: 'IT Session',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: [userId] },
                level: 'Standard',
                categories: ['Logs', 'SQL'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: userId,
                companyId: 'it-tenant-1',
                bytesWritten: 0,
            });

            await RunWithServerDiagnosticContext(
                {
                    sessionId,
                    SessionID: sessionId,
                    traceId: 'it-trace-1',
                    TraceID: 'it-trace-1',
                    userId,
                    UserID: userId,
                    CompanyID: 'it-tenant-1',
                    SessionEndsAtMs: Date.now() + 60_000,
                },
                async () => {
                    AssertEqual(GetDiagnosticContext()?.sessionId, sessionId, 'Active session ID propagated in AsyncLocalStorage');
                    AssertEqual(GetDiagnosticContext()?.IsCaptured, true, 'Capture active outside suppression scope');

                    await WithoutDiagnosticCapture(async () => {
                        AssertEqual(GetDiagnosticContext()?.SuppressCapture, true, 'SuppressCapture flag active');
                        AssertEqual(GetDiagnosticContext()?.IsCaptured, false, 'IsCaptured false inside WithoutDiagnosticCapture');
                    });

                    AssertEqual(GetDiagnosticContext()?.IsCaptured, true, 'Capture restored after WithoutDiagnosticCapture');
                },
            );
        },
    },
    {
        Id: 'diagnostics.DIAG2',
        Name: 'DIAG2: Assemble .mjdiag bundle archive, verify structure, and enforce single-use HMAC download token',
        Fn: async (ctx: IntegrationCheckContext) => {
            const manager = DiagnosticSessionManager.Instance;
            const sessionId = `it-assemble-${Date.now()}`;
            const userId = ctx.User.ID;

            manager.RegisterActiveSession({
                id: sessionId,
                name: 'IT Assemble Session',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: [userId] },
                level: 'Standard',
                categories: ['Logs', 'SQL'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: userId,
                bytesWritten: 0,
            });

            manager.AppendToChunkBuffer(sessionId, 'Server', 'SQL', {
                timestamp: new Date().toISOString(),
                durationMs: 2600,
                rowCount: 5,
                sql: "SELECT * FROM AuditLogs WHERE Email = 'alice@example.com'",
                parameterTypes: [],
            });

            const assembled = await manager.AssembleBundleDataFromChunks(sessionId, true);
            const verification = await VerifyBundleArchive(assembled.archiveBytes);
            Assert(verification.valid, `Bundle archive must verify cleanly: ${verification.reason}`);
            const data = ParseBundleDataFromArchive(verification);
            Assert(
                data.findings.some((f) => f.category === 'slow_sql'),
                'Slow SQL finding generated for 2600ms query',
            );
            Assert(
                !data.serverSql[0].sql.includes('alice@example.com'),
                'SQL inline string literal normalized in Standard mode',
            );

            const bundleId = verification.manifest?.bundleId ?? 'it-bundle-1';
            const token = manager.MintDownloadToken(bundleId, userId, 60_000);
            AssertEqual(manager.RedeemDownloadToken(token, 'wrong-bundle').valid, false, 'Wrong bundleId rejected');
            AssertEqual(manager.RedeemDownloadToken(token, bundleId).valid, true, 'First redemption succeeds');
            AssertEqual(manager.RedeemDownloadToken(token, bundleId).valid, false, 'Replay rejected');
        },
    },
    {
        Id: 'diagnostics.DIAG3',
        Name: 'DIAG3: End-to-end encrypted MJDB v1 upload and Quarantine-then-Promote intake',
        Fn: async (ctx: IntegrationCheckContext) => {
            const manager = DiagnosticSessionManager.Instance;
            const sessionId = `it-intake-session-${Date.now()}`;
            manager.RegisterActiveSession({
                id: sessionId,
                name: 'IT Intake Session',
                status: 'Active',
                scopeType: 'Users',
                scope: { userIds: [ctx.User.ID] },
                level: 'Standard',
                categories: ['Logs', 'SQL'],
                scrubLiterals: true,
                startedAtMs: Date.now(),
                endsAtMs: Date.now() + 60_000,
                maxBytes: 10_000_000,
                createdByUserId: ctx.User.ID,
                bytesWritten: 0,
            });
            const assembled = await manager.AssembleBundleDataFromChunks(sessionId, true);
            const verification = await VerifyBundleArchive(assembled.archiveBytes);
            const bundleId = verification.manifest?.bundleId ?? `it-intake-${Date.now()}`;

            const collectorKey = await GenerateDiagnosticKeyPair('X25519', 'it-collector-key-1');
            const quarantine = new Map<string, Uint8Array>();
            const verified = new Map<string, Uint8Array>();

            const intake = DiagnosticIntakeService.Instance;
            intake.ResetForTests();
            intake.RegisterKeyPair(collectorKey);
            intake.Configure({
                enabled: true,
                malwareScanner: new StructuralOnlyMalwareScanner(),
                storageBridge: {
                    WriteQuarantineObject: async (refId, b) => {
                        const qk = `quarantine/${refId}.mjdiag.enc`;
                        quarantine.set(qk, b);
                        return qk;
                    },
                    PromoteToVerifiedStorage: async (refId, qk, b) => {
                        quarantine.delete(qk);
                        const vk = `verified/${refId}.mjdiag`;
                        verified.set(vk, b);
                        return vk;
                    },
                    DeleteQuarantineObject: async (qk) => {
                        quarantine.delete(qk);
                    },
                },
            });

            const plaintextSha256 = crypto.createHash('sha256').update(assembled.archiveBytes).digest('hex');
            const encryptedBytes = await EncryptDiagnosticBundle(assembled.archiveBytes, {
                recipientKeyId: collectorKey.keyId,
                recipientPublicKeyBase64: collectorKey.publicKeyBase64,
                senderEnvironmentId: 'it-install-1',
                manifestSha256: plaintextSha256,
            });
            const encryptedSha256 = crypto.createHash('sha256').update(encryptedBytes).digest('hex');

            const initRes = intake.InitiateBundleIntake({
                installId: 'it-install-1',
                bundleId,
                formatVersion: 1,
                mjVersion: '6.2.0',
                scrubLiterals: true,
                sizeBytes: encryptedBytes.byteLength,
                plaintextSha256,
                encryptedSha256,
                keyId: collectorKey.keyId,
                summary: 'IT-SUP-100',
            });

            const uploadRes = await intake.UploadEncryptedPayload(initRes.referenceId, encryptedBytes);
            AssertEqual(uploadRes.accepted, true, 'Encrypted payload accepted into quarantine');
            AssertEqual(quarantine.size, 1, 'Encrypted bytes staged in quarantine');
            AssertEqual(verified.size, 0, 'Not yet promoted to verified');

            const completeRes = await intake.CompleteBundleIntake(initRes.referenceId, {
                encryptedSha256,
                plaintextSha256,
            });
            AssertEqual(completeRes.status, 'received', 'Intake completed and promoted');
            AssertEqual(quarantine.size, 0, 'Quarantine cleaned up after promotion');
            AssertEqual(verified.size, 1, 'Decrypted verified .mjdiag stored in verified storage');
        },
    },
    {
        Id: 'diagnostics.DIAG4',
        Name: 'DIAG4: Intake rejects non-MJDB junk before quarantine write',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const collectorKey = await GenerateDiagnosticKeyPair('X25519', 'it-collector-key-2');
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

            const junk = new TextEncoder().encode('NOT_AN_MJDB_ARCHIVE_PAYLOAD_'.padEnd(64, 'X'));
            const junkHash = crypto.createHash('sha256').update(junk).digest('hex');

            const initRes = intake.InitiateBundleIntake({
                installId: 'it-install-junk',
                bundleId: 'junk-bundle-id',
                formatVersion: 1,
                mjVersion: '6.2.0',
                scrubLiterals: true,
                sizeBytes: junk.byteLength,
                plaintextSha256: junkHash,
                encryptedSha256: junkHash,
                keyId: collectorKey.keyId,
            });

            const uploadRes = await intake.UploadEncryptedPayload(initRes.referenceId, junk);
            AssertEqual(uploadRes.accepted, false, 'Junk upload must be rejected');
            AssertEqual(uploadRes.reasonCode, 'INVALID_ENVELOPE_MAGIC', 'Rejected due to invalid MJDB magic bytes');
            AssertEqual(quarantineWrites, 0, 'No bytes written to quarantine storage');
        },
    },
];

for (const check of DiagnosticsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
