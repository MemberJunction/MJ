import * as fs from 'node:fs';
import { Flags } from '@oclif/core';
import {
    BuildMjdiagArchive,
    VerifyBundleArchive,
    ParseBundleDataFromArchive,
    DecryptDiagnosticBundle,
    InspectEncryptedEnvelopeHeader,
    ScrubBundleDataWithCount,
    ExportToPerfettoTrace,
    ExportToOtlpJson,
    type DiagnosticBreadcrumb,
    type DiagnosticBundleData,
    type DiagnosticBundleManifest,
    type DiagnosticScrubberProfile,
} from '@memberjunction/diagnostics';

/** Environment variable that holds the base64 PKCS#8 X25519 private key for encrypted bundles. */
export const DIAG_PRIVATE_KEY_ENV_VAR = 'MJ_DIAG_PRIVATE_KEY';

/** Private key flags shared by the `mj diag` commands that read bundles. */
export const DiagPrivateKeyFlags = {
    'private-key': Flags.string({
        description:
            'Base64 PKCS#8 X25519 private key for an encrypted MJDB envelope. The value is visible to other processes and stays in shell history; prefer --private-key-file or MJ_DIAG_PRIVATE_KEY',
    }),
    'private-key-file': Flags.string({
        description: 'Path to a file that holds the base64 PKCS#8 X25519 private key for an encrypted MJDB envelope',
    }),
};

export interface DiagPrivateKeyFlagValues {
    'private-key'?: string;
    'private-key-file'?: string;
}

/**
 * Returns the private key from `--private-key`, then `--private-key-file`, then `MJ_DIAG_PRIVATE_KEY`.
 * Returns undefined when none is given. Throws when the key file cannot be read or is empty.
 */
export function ResolveDiagnosticPrivateKey(
    flags: DiagPrivateKeyFlagValues,
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    if (flags['private-key']) {
        return flags['private-key'];
    }
    const keyFile = flags['private-key-file'];
    if (keyFile) {
        let fileText: string;
        try {
            fileText = fs.readFileSync(keyFile, 'utf8');
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Cannot read the private key file "${keyFile}": ${reason}`);
        }
        const key = fileText.trim();
        if (!key) {
            throw new Error(`The private key file "${keyFile}" is empty.`);
        }
        return key;
    }
    const envKey = env[DIAG_PRIVATE_KEY_ENV_VAR]?.trim();
    return envKey ? envKey : undefined;
}

export interface LoadedDiagnosticBundle {
    WasEncrypted: boolean;
    Manifest: DiagnosticBundleManifest;
    Data: DiagnosticBundleData;
}

export async function LoadAndVerifyDiagnosticBundle(
    filePath: string,
    recipientPrivateKeyBase64?: string,
): Promise<LoadedDiagnosticBundle> {
    const rawBytes: Uint8Array = new Uint8Array(fs.readFileSync(filePath));
    const envelopeCheck = InspectEncryptedEnvelopeHeader(rawBytes);

    let zipBytes: Uint8Array = rawBytes;
    let wasEncrypted = false;

    if (envelopeCheck.valid && envelopeCheck.header) {
        if (!recipientPrivateKeyBase64) {
            throw new Error(
                `File "${filePath}" is an encrypted MJDB envelope (recipientKeyId=${envelopeCheck.header.recipientKeyId}). Pass --private-key-file, set ${DIAG_PRIVATE_KEY_ENV_VAR}, or pass --private-key to decrypt.`,
            );
        }
        const decrypted = await DecryptDiagnosticBundle(rawBytes, {
            PrivateKeysByKeyId: {
                [envelopeCheck.header.recipientKeyId]: recipientPrivateKeyBase64,
            },
        });
        if (!decrypted.valid || !decrypted.decryptedZipBytes) {
            throw new Error(`Failed to decrypt "${filePath}": ${decrypted.reason}`);
        }
        zipBytes = decrypted.decryptedZipBytes;
        wasEncrypted = true;
    }

    const verification = await VerifyBundleArchive(zipBytes);
    if (!verification.valid || !verification.manifest) {
        throw new Error(`Invalid .mjdiag bundle "${filePath}": ${verification.reason}`);
    }

    const data = ParseBundleDataFromArchive(verification);
    return {
        WasEncrypted: wasEncrypted,
        Manifest: verification.manifest,
        Data: data,
    };
}

export async function RescrubDiagnosticBundle(
    manifest: DiagnosticBundleManifest,
    data: DiagnosticBundleData,
    profile: DiagnosticScrubberProfile,
): Promise<Uint8Array> {
    const scrubbed = ScrubBundleDataWithCount(data, profile);
    return BuildMjdiagArchive(scrubbed.Data, {
        bundleId: manifest.bundleId,
        sessionId: manifest.sessionId,
        captureReason: manifest.captureReason,
        scrubberProfile: profile,
        redactionSummary: {
            credentialsScrubbedCount: scrubbed.CredentialsScrubbedCount,
            sqlLiteralsNormalizedCount: profile === 'Standard' ? scrubbed.Data.serverSql.length : 0,
            customPatternsAppliedCount: 0,
        },
    });
}

export interface TimelineRow {
    TimestampUnixMs: number;
    Source: 'client-span' | 'server-span' | 'sql' | 'breadcrumb';
    DurationMs: number;
    Label: string;
}

/** Milliseconds since the epoch for an ISO timestamp, or 0 when it does not parse. */
function isoToUnixMs(timestamp: string): number {
    const parsedMs = Date.parse(timestamp);
    return Number.isNaN(parsedMs) ? 0 : parsedMs;
}

/** `[type] target (detail) on route` for a breadcrumb. The route is left out when it is the target. */
function breadcrumbLabel(crumb: DiagnosticBreadcrumb): string {
    const detail = crumb.detail ? ` (${crumb.detail})` : '';
    const route = crumb.route && crumb.route !== crumb.target ? ` on ${crumb.route}` : '';
    return `[${crumb.type ?? crumb.kind ?? 'step'}] ${crumb.target}${detail}${route}`;
}

export function BuildBundleTimeline(data: DiagnosticBundleData, limit = 50): TimelineRow[] {
    const rows: TimelineRow[] = [];

    for (const wf of data.clientWaterfall) {
        rows.push({
            TimestampUnixMs: wf.startTimeUnixMs,
            Source: 'client-span',
            DurationMs: wf.durationMs,
            Label: `[${wf.operationKind}] ${wf.operationName}`,
        });
    }
    for (const s of data.serverTraces) {
        rows.push({
            TimestampUnixMs: s.startTimeUnixMs,
            Source: 'server-span',
            DurationMs: s.durationMs,
            Label: `[${s.layer}] ${s.name}`,
        });
    }
    for (const q of data.serverSql) {
        rows.push({
            TimestampUnixMs: isoToUnixMs(q.timestamp),
            Source: 'sql',
            DurationMs: q.durationMs,
            Label: q.sql,
        });
    }
    for (const crumb of data.repro.breadcrumbs) {
        rows.push({
            TimestampUnixMs: isoToUnixMs(crumb.timestamp),
            Source: 'breadcrumb',
            DurationMs: 0,
            Label: breadcrumbLabel(crumb),
        });
    }

    rows.sort((a, b) => a.TimestampUnixMs - b.TimestampUnixMs);
    return rows.slice(0, limit);
}

export function FindSlowBundleOperations(
    data: DiagnosticBundleData,
    thresholdMs = 500,
): TimelineRow[] {
    const all = BuildBundleTimeline(data, Number.MAX_SAFE_INTEGER);
    return all
        .filter((r) => r.DurationMs >= thresholdMs)
        .sort((a, b) => b.DurationMs - a.DurationMs);
}

export function ExportBundleTraces(
    data: DiagnosticBundleData,
    format: 'perfetto' | 'otlp',
): string {
    if (format === 'perfetto') {
        return JSON.stringify(ExportToPerfettoTrace(data), null, 2);
    }
    return JSON.stringify(ExportToOtlpJson(data), null, 2);
}
