import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    BuildMjdiagArchive,
    EncryptDiagnosticBundle,
    VerifyBundleArchive,
    ParseBundleDataFromArchive,
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

/** A key in the developer's shell must not reach tests that expect no key. */
beforeEach(() => {
    vi.stubEnv('MJ_DIAG_PRIVATE_KEY', '');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

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

    it('puts breadcrumbs on the timeline in time order, with what happened and the page it was on', () => {
        const data: DiagnosticBundleData = {
            environment: { mjVersion: '6.2.0' },
            repro: {
                breadcrumbs: [
                    { timestamp: '2023-11-14T22:13:20.050Z', type: 'click', target: 'button#save "Save"', route: '/app/home' },
                    { timestamp: '2023-11-14T22:13:20.400Z', type: 'error', target: 'Save timed out', detail: 'Unhandled promise rejection' },
                ],
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
            serverTraces: [],
            serverSql: [],
            serverLogs: [],
            findings: [],
        };

        const rows = BuildBundleTimeline(data);

        expect(rows.map((r) => [r.Source, r.DurationMs, r.Label])).toEqual([
            ['breadcrumb', 0, '[click] button#save "Save" on /app/home'],
            ['client-span', 150, '[query] RunViewUsers'],
            ['breadcrumb', 0, '[error] Save timed out (Unhandled promise rejection)'],
        ]);
    });
});

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Writes an encrypted sample bundle and returns its path and the matching private key. */
async function writeEncryptedSample(tmpDir: string): Promise<{ File: string; PrivateKeyBase64: string }> {
    const keyPair = await GenerateDiagnosticKeyPair('X25519', 'cli-key-test');
    const encBytes = await EncryptDiagnosticBundle(await makeSampleBundleBytes(), {
        recipientKeyId: keyPair.keyId,
        recipientPublicKeyBase64: keyPair.publicKeyBase64,
        manifestSha256: 'abcd',
    });
    const file = path.join(tmpDir, 'sample.enc.mjdiag');
    fs.writeFileSync(file, encBytes);
    return { File: file, PrivateKeyBase64: keyPair.privateKeyBase64 };
}

/** Runs `mj diag inspect --json` and returns the parsed JSON output. */
async function inspectJson(argv: string[]): Promise<{ wasEncrypted: boolean; manifest: { bundleId: string } }> {
    const { default: DiagInspect } = await import('../commands/diag/inspect.js');
    const logged: string[] = [];
    vi.spyOn(DiagInspect.prototype, 'log').mockImplementation((message?: string) => {
        logged.push(message ?? '');
    });
    await DiagInspect.run([...argv, '--json'], packageRoot);
    return JSON.parse(logged.join('\n'));
}

describe('mj diag private key sources', () => {
    let tmpDir = '';

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads the private key from --private-key-file, trimmed', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-diag-key-'));
        const sample = await writeEncryptedSample(tmpDir);
        const keyFile = path.join(tmpDir, 'key.txt');
        fs.writeFileSync(keyFile, `  ${sample.PrivateKeyBase64}\n`, 'utf8');

        const out = await inspectJson([sample.File, '--private-key-file', keyFile]);

        expect(out.wasEncrypted).toBe(true);
        expect(out.manifest.bundleId).toBe('cli-test-bundle');
    }, 60_000);

    it('reads the private key from MJ_DIAG_PRIVATE_KEY', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-diag-key-'));
        const sample = await writeEncryptedSample(tmpDir);
        vi.stubEnv('MJ_DIAG_PRIVATE_KEY', sample.PrivateKeyBase64);

        const out = await inspectJson([sample.File]);

        expect(out.wasEncrypted).toBe(true);
    }, 60_000);

    it('uses --private-key over --private-key-file, and --private-key-file over MJ_DIAG_PRIVATE_KEY', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-diag-key-'));
        const sample = await writeEncryptedSample(tmpDir);
        const wrongKey = (await GenerateDiagnosticKeyPair('X25519', 'wrong')).privateKeyBase64;
        const wrongKeyFile = path.join(tmpDir, 'wrong.txt');
        fs.writeFileSync(wrongKeyFile, wrongKey, 'utf8');
        const goodKeyFile = path.join(tmpDir, 'good.txt');
        fs.writeFileSync(goodKeyFile, sample.PrivateKeyBase64, 'utf8');
        vi.stubEnv('MJ_DIAG_PRIVATE_KEY', wrongKey);

        const flagWins = await inspectJson([sample.File, '--private-key', sample.PrivateKeyBase64, '--private-key-file', wrongKeyFile]);
        const fileWins = await inspectJson([sample.File, '--private-key-file', goodKeyFile]);

        expect(flagWins.wasEncrypted).toBe(true);
        expect(fileWins.wasEncrypted).toBe(true);
    }, 60_000);

    it('fails with a clear error when --private-key-file cannot be read', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-diag-key-'));
        const sample = await writeEncryptedSample(tmpDir);
        const missing = path.join(tmpDir, 'missing.txt');

        await expect(inspectJson([sample.File, '--private-key-file', missing])).rejects.toThrow(
            `Cannot read the private key file "${missing}"`,
        );
    }, 60_000);
});

describe('RescrubDiagnosticBundle redaction summary', () => {
    it('counts the redactions of the new scrub run instead of copying the old summary', async () => {
        const source = await VerifyBundleArchive(await makeSampleBundleBytes());
        if (!source.manifest) throw new Error(source.reason);
        const data = ParseBundleDataFromArchive(source);
        data.serverLogs = [
            { timestamp: '2023-11-14T22:13:20.300Z', severity: 'info', source: 'server', message: 'call', data: { password: 'hunter2' } },
        ];
        const staleManifest = {
            ...source.manifest,
            redactionSummary: { credentialsScrubbedCount: 99, sqlLiteralsNormalizedCount: 99, customPatternsAppliedCount: 99 },
        };

        const rescrubbed = await VerifyBundleArchive(await RescrubDiagnosticBundle(staleManifest, data, 'Standard'));

        expect(rescrubbed.manifest?.redactionSummary).toEqual({
            credentialsScrubbedCount: 1,
            sqlLiteralsNormalizedCount: 1,
            customPatternsAppliedCount: 0,
        });
    });
});
