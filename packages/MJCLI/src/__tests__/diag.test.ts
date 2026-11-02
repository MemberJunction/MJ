import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
    BuildMjdiagArchive,
    EncryptDiagnosticBundle,
    GenerateDiagnosticKeyPair,
    type DiagnosticBundleData,
} from '@memberjunction/diagnostics';
import {
    LoadAndVerifyDiagnosticBundle,
    RescrubDiagnosticBundle,
    BuildBundleTimeline,
    FindSlowBundleOperations,
    ExportBundleTraces,
} from '../utils/diag-utils.js';

async function makeSampleBundleBytes(): Promise<Uint8Array> {
    const data: DiagnosticBundleData = {
        environment: {
            mjVersion: '6.2.0',
        },
        repro: {
            breadcrumbs: [],
        },
        clientLogs: [],
        clientWaterfall: [
            {
                traceId: '0123456789abcdef0123456789abcdef',
                spanId: '0123456789abcdef',
                operationName: 'RunViewUsers',
                operationKind: 'query',
                startTimeUnixMs: 1_700_000_000_100,
                durationMs: 150,
                status: 'ok',
                retryCount: 0,
                requestBytes: 128,
                responseBytes: 512,
            },
        ],
        clientTelemetry: [],
        serverTraces: [
            {
                traceId: '0123456789abcdef0123456789abcdef',
                spanId: 'fedcba9876543210',
                name: 'GraphQL RunView "CustomerVal"',
                layer: 'graphql',
                startTimeUnixMs: 1_700_000_000_200,
                durationMs: 920,
                status: 'ok',
            },
        ],
        serverSql: [
            {
                timestamp: '2023-11-14T22:13:20.300Z',
                durationMs: 750,
                rowCount: 5,
                sql: "SELECT * FROM Users WHERE Email = 'alice@example.com'",
                parameterTypes: [],
            },
        ],
        serverLogs: [],
        findings: [],
    };

    return BuildMjdiagArchive(data, {
        bundleId: 'cli-test-bundle',
        captureReason: 'Manual',
        scrubberProfile: 'FullRaw',
    });
}

describe('mj diag CLI utilities', () => {
    it('loads, verifies, timelines, finds slow ops, re-scrubs, and exports .mjdiag bundles (plain & encrypted)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-diag-test-'));
        const plainFile = path.join(tmpDir, 'sample.mjdiag');
        const encFile = path.join(tmpDir, 'sample.enc.mjdiag');
        const rescrubbedFile = path.join(tmpDir, 'rescrubbed.mjdiag');

        const zipBytes = await makeSampleBundleBytes();
        fs.writeFileSync(plainFile, zipBytes);

        // Plain load
        const loadedPlain = await LoadAndVerifyDiagnosticBundle(plainFile);
        expect(loadedPlain.WasEncrypted).toBe(false);
        expect(loadedPlain.Manifest.bundleId).toBe('cli-test-bundle');

        // Timeline & slow ops
        const timeline = BuildBundleTimeline(loadedPlain.Data);
        expect(timeline.length).toBe(3);
        const slow = FindSlowBundleOperations(loadedPlain.Data, 500);
        expect(slow.length).toBe(2);
        expect(slow[0].DurationMs).toBe(920);

        // Re-scrub at Standard profile
        const standardBytes = await RescrubDiagnosticBundle(loadedPlain.Manifest, loadedPlain.Data, 'Standard');
        fs.writeFileSync(rescrubbedFile, standardBytes);
        const loadedStandard = await LoadAndVerifyDiagnosticBundle(rescrubbedFile);
        expect(loadedStandard.Manifest.scrubberProfile).toBe('Standard');
        expect(loadedStandard.Data.serverSql[0].sql).toContain('?');
        expect(loadedStandard.Data.serverSql[0].sql).not.toContain('alice@example.com');

        // Export Perfetto & OTLP
        const perfettoJson = ExportBundleTraces(loadedPlain.Data, 'perfetto');
        expect(JSON.parse(perfettoJson).traceEvents.length).toBe(2);
        const otlpJson = ExportBundleTraces(loadedPlain.Data, 'otlp');
        expect(JSON.parse(otlpJson).resourceSpans[0].scopeSpans[0].spans.length).toBe(2);

        // Encrypted MJDB envelope load
        const keyPair = await GenerateDiagnosticKeyPair('X25519', 'test-kid');
        const encBytes = await EncryptDiagnosticBundle(zipBytes, {
            recipientKeyId: keyPair.keyId,
            recipientPublicKeyBase64: keyPair.publicKeyBase64,
            manifestSha256: 'abcd',
        });
        fs.writeFileSync(encFile, encBytes);

        await expect(LoadAndVerifyDiagnosticBundle(encFile)).rejects.toThrow(/--private-key/);
        const loadedEnc = await LoadAndVerifyDiagnosticBundle(encFile, keyPair.privateKeyBase64);
        expect(loadedEnc.WasEncrypted).toBe(true);
        expect(loadedEnc.Manifest.bundleId).toBe('cli-test-bundle');

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});
