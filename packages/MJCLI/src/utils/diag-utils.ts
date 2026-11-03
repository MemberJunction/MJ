import * as fs from 'node:fs';
import {
    BuildMjdiagArchive,
    VerifyBundleArchive,
    ParseBundleDataFromArchive,
    DecryptDiagnosticBundle,
    InspectEncryptedEnvelopeHeader,
    ScrubBundleData,
    ExportToPerfettoTrace,
    ExportToOtlpJson,
    type DiagnosticBreadcrumb,
    type DiagnosticBundleData,
    type DiagnosticBundleManifest,
    type DiagnosticScrubberProfile,
} from '@memberjunction/diagnostics';

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
                `File "${filePath}" is an encrypted MJDB envelope (recipientKeyId=${envelopeCheck.header.recipientKeyId}). Pass --private-key to decrypt.`,
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
    const scrubbedData = ScrubBundleData(data, profile);
    return BuildMjdiagArchive(scrubbedData, {
        bundleId: manifest.bundleId,
        sessionId: manifest.sessionId,
        captureReason: manifest.captureReason,
        scrubberProfile: profile,
        redactionSummary: manifest.redactionSummary,
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
