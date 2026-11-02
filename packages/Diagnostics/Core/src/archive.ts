/**
 * Zero-dependency `.mjdiag` ZIP archive builder, reader, and strict structural verifier.
 * Uses standard Web `CompressionStream` / `DecompressionStream` (`deflate-raw`) and
 * `crypto.subtle.digest('SHA-256')` so it runs identically in modern browsers and Node 20+.
 */

import {
    IsAllowedMjdiagEntryPath,
    type DiagnosticBundleData,
    type DiagnosticBundleManifest,
    type DiagnosticFinding,
    type DiagnosticLogEntry,
    type DiagnosticManifestFileEntry,
    type DiagnosticNetworkEntry,
    type DiagnosticRedactionSummary,
    type DiagnosticScrubberProfile,
    type DiagnosticServerHealthSnapshot,
    type DiagnosticServerSpanEntry,
    type DiagnosticSqlEntry,
    type DiagnosticTelemetryEntry,
} from './types.js';

const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
const ZIP_CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR_SIG = 0x06054b50;

const CRC32_TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
    }
    return table;
})();

export function ComputeCrc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export async function ComputeSha256Hex(bytes: Uint8Array): Promise<string> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    const view = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < view.length; i++) {
        hex += view[i].toString(16).padStart(2, '0');
    }
    return hex;
}

async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream === 'undefined' || input.byteLength === 0) {
        return input;
    }
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    const writePromise = writer.write(copy).then(() => writer.close());

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
    }
    await writePromise;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

async function inflateRaw(compressed: Uint8Array, maxUncompressedBytes: number): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    const writePromise = writer.write(copy).then(() => writer.close());

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxUncompressedBytes) {
            await reader.cancel('Exceeded maxUncompressedBytes');
            throw new Error(`ZIP entry decompression exceeded limit of ${maxUncompressedBytes} bytes`);
        }
        chunks.push(value);
    }
    await writePromise;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

export interface CustomZipEntryInput {
    name: string;
    data: Uint8Array | string;
}

/**
 * Low-level ZIP archive builder for an arbitrary list of entries (uses `deflate-raw` when smaller than raw).
 */
export async function BuildCustomZipArchive(entries: CustomZipEntryInput[]): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const prepared: Array<{
        pathBytes: Uint8Array;
        uncompressed: Uint8Array;
        compressed: Uint8Array;
        compressionMethod: number;
        crc32: number;
        localHeaderOffset: number;
    }> = [];

    let offset = 0;
    for (const item of entries) {
        const pathBytes = encoder.encode(item.name);
        const uncompressed = typeof item.data === 'string' ? encoder.encode(item.data) : item.data;
        const deflated = await deflateRaw(uncompressed);
        const useDeflate = typeof CompressionStream !== 'undefined' && deflated.byteLength < uncompressed.byteLength;
        const compressed = useDeflate ? deflated : uncompressed;
        const compressionMethod = useDeflate ? 8 : 0;
        const crc32 = ComputeCrc32(uncompressed);

        prepared.push({
            pathBytes,
            uncompressed,
            compressed,
            compressionMethod,
            crc32,
            localHeaderOffset: offset,
        });

        offset += 30 + pathBytes.byteLength + compressed.byteLength;
    }

    const centralDirStart = offset;
    let centralDirSize = 0;
    for (const p of prepared) {
        centralDirSize += 46 + p.pathBytes.byteLength;
    }

    const totalSize = centralDirStart + centralDirSize + 22;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let pos = 0;
    for (const p of prepared) {
        view.setUint32(pos, ZIP_LOCAL_FILE_HEADER_SIG, true);
        view.setUint16(pos + 4, 20, true);
        view.setUint16(pos + 6, 0x0800, true);
        view.setUint16(pos + 8, p.compressionMethod, true);
        view.setUint16(pos + 10, 0, true);
        view.setUint16(pos + 12, 0, true);
        view.setUint32(pos + 14, p.crc32, true);
        view.setUint32(pos + 18, p.compressed.byteLength, true);
        view.setUint32(pos + 22, p.uncompressed.byteLength, true);
        view.setUint16(pos + 26, p.pathBytes.byteLength, true);
        view.setUint16(pos + 28, 0, true);
        pos += 30;
        bytes.set(p.pathBytes, pos);
        pos += p.pathBytes.byteLength;
        bytes.set(p.compressed, pos);
        pos += p.compressed.byteLength;
    }

    for (const p of prepared) {
        view.setUint32(pos, ZIP_CENTRAL_DIR_HEADER_SIG, true);
        view.setUint16(pos + 4, 20, true);
        view.setUint16(pos + 6, 20, true);
        view.setUint16(pos + 8, 0x0800, true);
        view.setUint16(pos + 10, p.compressionMethod, true);
        view.setUint16(pos + 12, 0, true);
        view.setUint16(pos + 14, 0, true);
        view.setUint32(pos + 16, p.crc32, true);
        view.setUint32(pos + 20, p.compressed.byteLength, true);
        view.setUint32(pos + 24, p.uncompressed.byteLength, true);
        view.setUint16(pos + 28, p.pathBytes.byteLength, true);
        view.setUint16(pos + 30, 0, true);
        view.setUint16(pos + 32, 0, true);
        view.setUint16(pos + 34, 0, true);
        view.setUint16(pos + 36, 0, true);
        view.setUint32(pos + 38, 0, true);
        view.setUint32(pos + 42, p.localHeaderOffset, true);
        pos += 46;
        bytes.set(p.pathBytes, pos);
        pos += p.pathBytes.byteLength;
    }

    view.setUint32(pos, ZIP_END_OF_CENTRAL_DIR_SIG, true);
    view.setUint16(pos + 4, 0, true);
    view.setUint16(pos + 6, 0, true);
    view.setUint16(pos + 8, prepared.length, true);
    view.setUint16(pos + 10, prepared.length, true);
    view.setUint32(pos + 12, centralDirSize, true);
    view.setUint32(pos + 16, centralDirStart, true);
    view.setUint16(pos + 20, 0, true);

    return bytes;
}

export interface BuildMjdiagArchiveOptions {
    bundleId?: string;
    sessionId?: string;
    captureReason?: string;
    scrubberProfile?: DiagnosticScrubberProfile;
    redactionSummary?: DiagnosticRedactionSummary;
}

/**
 * Serializes an array of objects to NDJSON (`\n`-delimited JSON lines).
 */
export function EncodeNdjson(rows: ReadonlyArray<unknown>): string {
    if (rows.length === 0) {
        return '';
    }
    return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

/**
 * Parses NDJSON text back into an array of typed records.
 */
export function ParseNdjson<T>(ndjsonText: string): T[] {
    if (!ndjsonText || !ndjsonText.trim()) {
        return [];
    }
    return ndjsonText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as T);
}

/**
 * Builds a complete, canonical `.mjdiag` ZIP archive from `DiagnosticBundleData`.
 * Automatically computes per-file SHA-256 digests and writes `manifest.json` and `README.txt`.
 */
export async function BuildMjdiagArchive(
    bundleData: DiagnosticBundleData,
    options?: BuildMjdiagArchiveOptions
): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const bundleId = options?.bundleId ?? globalThis.crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const captureReason = options?.captureReason ?? 'Manual';
    const scrubberProfile: DiagnosticScrubberProfile = options?.scrubberProfile ?? 'Standard';
    const redactionSummary: DiagnosticRedactionSummary = options?.redactionSummary ?? {
        credentialsScrubbedCount: 0,
        sqlLiteralsNormalizedCount: 0,
        customPatternsAppliedCount: 0,
    };

    const payloadFiles: Array<{ name: string; bytes: Uint8Array; entryCount?: number }> = [
        {
            name: 'environment.json',
            bytes: encoder.encode(JSON.stringify(bundleData.environment, null, 2)),
        },
        {
            name: 'repro.json',
            bytes: encoder.encode(JSON.stringify(bundleData.repro, null, 2)),
            entryCount: bundleData.repro.breadcrumbs.length,
        },
        {
            name: 'findings.json',
            bytes: encoder.encode(JSON.stringify(bundleData.findings, null, 2)),
            entryCount: bundleData.findings.length,
        },
        {
            name: 'client/logs.ndjson',
            bytes: encoder.encode(EncodeNdjson(bundleData.clientLogs)),
            entryCount: bundleData.clientLogs.length,
        },
        {
            name: 'client/waterfall.ndjson',
            bytes: encoder.encode(EncodeNdjson(bundleData.clientWaterfall)),
            entryCount: bundleData.clientWaterfall.length,
        },
        {
            name: 'client/telemetry.ndjson',
            bytes: encoder.encode(EncodeNdjson(bundleData.clientTelemetry)),
            entryCount: bundleData.clientTelemetry.length,
        },
        {
            name: 'server/traces.ndjson',
            bytes: encoder.encode(EncodeNdjson(bundleData.serverTraces)),
            entryCount: bundleData.serverTraces.length,
        },
        {
            name: 'server/sql.ndjson',
            bytes: encoder.encode(EncodeNdjson(bundleData.serverSql)),
            entryCount: bundleData.serverSql.length,
        },
        {
            name: 'server/logs.ndjson',
            bytes: encoder.encode(EncodeNdjson(bundleData.serverLogs)),
            entryCount: bundleData.serverLogs.length,
        },
    ];

    if (bundleData.serverHealth) {
        payloadFiles.push({
            name: 'server/health.json',
            bytes: encoder.encode(JSON.stringify(bundleData.serverHealth, null, 2)),
        });
    }

    if (bundleData.contrib) {
        for (const [sectionKey, sectionValue] of Object.entries(bundleData.contrib)) {
            const safeKey = sectionKey.replace(/[^A-Za-z0-9._-]/g, '_');
            payloadFiles.push({
                name: `contrib/${safeKey}.json`,
                bytes: encoder.encode(JSON.stringify(sectionValue, null, 2)),
            });
        }
    }

    const readmeLines = [
        'MemberJunction Diagnostic Bundle (.mjdiag)',
        '==========================================',
        `Bundle ID:        ${bundleId}`,
        `Session ID:       ${options?.sessionId ?? 'N/A'}`,
        `Created At:       ${createdAt}`,
        `Capture Reason:   ${captureReason}`,
        `Scrubber Profile: ${scrubberProfile}`,
        `Findings Count:   ${bundleData.findings.length}`,
        '',
        'Inspect with CLI: mj diag inspect <bundle.mjdiag>',
    ];
    payloadFiles.push({
        name: 'README.txt',
        bytes: encoder.encode(readmeLines.join('\n') + '\n'),
    });

    const manifestFiles: Record<string, DiagnosticManifestFileEntry> = {};
    for (const file of payloadFiles) {
        const sha256 = await ComputeSha256Hex(file.bytes);
        manifestFiles[file.name] = {
            sha256,
            sizeBytes: file.bytes.byteLength,
            ...(file.entryCount !== undefined ? { entryCount: file.entryCount } : {}),
        };
    }

    const manifest: DiagnosticBundleManifest = {
        schemaVersion: '1.0',
        bundleId,
        sessionId: options?.sessionId,
        createdAt,
        captureReason,
        scrubberProfile,
        redactionSummary,
        files: manifestFiles,
    };

    const allEntries: CustomZipEntryInput[] = [
        { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
        ...payloadFiles.map((f) => ({ name: f.name, data: f.bytes })),
    ];

    return BuildCustomZipArchive(allEntries);
}

export type ArchiveVerificationReasonCode =
    | 'INVALID_ZIP_MAGIC'
    | 'UNSAFE_ENTRY_PATH'
    | 'DISALLOWED_ENTRY_NAME'
    | 'ZIP_BOMB_RATIO_EXCEEDED'
    | 'MAX_UNCOMPRESSED_BYTES_EXCEEDED'
    | 'MAX_ENTRY_COUNT_EXCEEDED'
    | 'MISSING_MANIFEST'
    | 'INVALID_MANIFEST_SCHEMA'
    | 'ENTRY_SHA256_MISMATCH'
    | 'CORRUPT_ZIP_STRUCTURE';

export interface VerifyBundleArchiveOptions {
    maxCompressedBytes?: number;
    maxUncompressedBytes?: number;
    maxCompressionRatio?: number;
    maxEntries?: number;
}

export interface BundleArchiveVerificationResult {
    valid: boolean;
    reasonCode?: ArchiveVerificationReasonCode;
    reason?: string;
    manifest?: DiagnosticBundleManifest;
    entries?: Map<string, Uint8Array>;
    totalCompressedBytes: number;
    totalUncompressedBytes: number;
}

/**
 * Strictly validates a `.mjdiag` ZIP archive:
 * 1. Verifies ZIP magic bytes (`PK\x03\x04`) and Central Directory integrity
 * 2. Enforces path safety (no `..`, leading `/`, `\`, or symlink attributes) -> `UNSAFE_ENTRY_PATH`
 * 3. Enforces canonical filename allowlist (`IsAllowedMjdiagEntryPath`) -> `DISALLOWED_ENTRY_NAME`
 * 4. Enforces Zip-Bomb protections (`maxCompressionRatio <= 25`, `maxUncompressedBytes <= 100 MiB`, `maxEntries <= 128`)
 * 5. Parses and validates `manifest.json` (`schemaVersion === '1.0'`)
 * 6. Recomputes SHA-256 of every file in `manifest.files` and verifies exact match -> `ENTRY_SHA256_MISMATCH`
 */
export async function VerifyBundleArchive(
    archiveBytes: Uint8Array,
    options?: VerifyBundleArchiveOptions
): Promise<BundleArchiveVerificationResult> {
    const maxCompressedBytes = options?.maxCompressedBytes ?? 25 * 1024 * 1024;
    const maxUncompressedBytes = options?.maxUncompressedBytes ?? 100 * 1024 * 1024;
    const maxCompressionRatio = options?.maxCompressionRatio ?? 25;
    const maxEntries = options?.maxEntries ?? 128;

    const fail = (
        reasonCode: ArchiveVerificationReasonCode,
        reason: string,
        totalUncompressed = 0
    ): BundleArchiveVerificationResult => ({
        valid: false,
        reasonCode,
        reason,
        totalCompressedBytes: archiveBytes.byteLength,
        totalUncompressedBytes: totalUncompressed,
    });

    if (archiveBytes.byteLength < 22) {
        return fail('INVALID_ZIP_MAGIC', 'Archive is smaller than minimum 22-byte ZIP header');
    }

    if (archiveBytes.byteLength > maxCompressedBytes) {
        return fail('MAX_UNCOMPRESSED_BYTES_EXCEEDED', `Archive compressed size exceeds limit of ${maxCompressedBytes}`);
    }

    const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
    if (view.getUint32(0, true) !== ZIP_LOCAL_FILE_HEADER_SIG) {
        return fail('INVALID_ZIP_MAGIC', 'Invalid ZIP magic bytes (expected PK\\x03\\x04)');
    }

    let eocdOffset = -1;
    const minSearchOffset = Math.max(0, archiveBytes.byteLength - 65557);
    for (let i = archiveBytes.byteLength - 22; i >= minSearchOffset; i--) {
        if (view.getUint32(i, true) === ZIP_END_OF_CENTRAL_DIR_SIG) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset < 0) {
        return fail('CORRUPT_ZIP_STRUCTURE', 'ZIP End of Central Directory record not found');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirSize = view.getUint32(eocdOffset + 12, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);

    if (totalEntries < 1 || totalEntries > maxEntries) {
        return fail('MAX_ENTRY_COUNT_EXCEEDED', `ZIP entry count (${totalEntries}) outside bounds (1..${maxEntries})`);
    }
    if (centralDirOffset + centralDirSize > archiveBytes.byteLength) {
        return fail('CORRUPT_ZIP_STRUCTURE', 'Corrupt ZIP Central Directory bounds');
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    const entries = new Map<string, Uint8Array>();
    let totalUncompressedBytes = 0;
    let cdPos = centralDirOffset;

    for (let idx = 0; idx < totalEntries; idx++) {
        if (cdPos + 46 > archiveBytes.byteLength || view.getUint32(cdPos, true) !== ZIP_CENTRAL_DIR_HEADER_SIG) {
            return fail('CORRUPT_ZIP_STRUCTURE', `Corrupt Central Directory entry at index ${idx}`, totalUncompressedBytes);
        }

        const compressionMethod = view.getUint16(cdPos + 10, true);
        const expectedCrc32 = view.getUint32(cdPos + 16, true);
        const compressedSize = view.getUint32(cdPos + 20, true);
        const uncompressedSize = view.getUint32(cdPos + 24, true);
        const fileNameLen = view.getUint16(cdPos + 28, true);
        const extraFieldLen = view.getUint16(cdPos + 30, true);
        const commentLen = view.getUint16(cdPos + 32, true);
        const externalAttrs = view.getUint32(cdPos + 38, true);
        const localHeaderOffset = view.getUint32(cdPos + 42, true);

        const unixMode = (externalAttrs >>> 16) & 0xf000;
        if (unixMode === 0xa000) {
            return fail('UNSAFE_ENTRY_PATH', 'Symbolic link entries are prohibited in .mjdiag archives', totalUncompressedBytes);
        }

        const nameBytes = archiveBytes.subarray(cdPos + 46, cdPos + 46 + fileNameLen);
        let entryName: string;
        try {
            entryName = decoder.decode(nameBytes);
        } catch {
            return fail('UNSAFE_ENTRY_PATH', `Invalid UTF-8 file name at entry ${idx}`, totalUncompressedBytes);
        }

        // Check path traversal BEFORE allowlist so UNSAFE_ENTRY_PATH is reported specifically
        if (
            entryName.startsWith('/') ||
            entryName.includes('\\') ||
            entryName.includes('..') ||
            entryName.includes('\0')
        ) {
            return fail('UNSAFE_ENTRY_PATH', `Unsafe path traversal in ZIP entry: "${entryName}"`, totalUncompressedBytes);
        }

        if (!IsAllowedMjdiagEntryPath(entryName)) {
            return fail('DISALLOWED_ENTRY_NAME', `Disallowed entry name in .mjdiag archive: "${entryName}"`, totalUncompressedBytes);
        }

        if (entries.has(entryName)) {
            return fail('CORRUPT_ZIP_STRUCTURE', `Duplicate ZIP entry "${entryName}"`, totalUncompressedBytes);
        }

        if (compressedSize > 0 && uncompressedSize / compressedSize > maxCompressionRatio) {
            return fail(
                'ZIP_BOMB_RATIO_EXCEEDED',
                `Entry "${entryName}" compression ratio (${(uncompressedSize / compressedSize).toFixed(1)}:1) exceeds limit (${maxCompressionRatio}:1)`,
                totalUncompressedBytes
            );
        }

        totalUncompressedBytes += uncompressedSize;
        if (totalUncompressedBytes > maxUncompressedBytes) {
            return fail(
                'MAX_UNCOMPRESSED_BYTES_EXCEEDED',
                `Total uncompressed size (${totalUncompressedBytes}) exceeds limit (${maxUncompressedBytes})`,
                totalUncompressedBytes
            );
        }

        if (
            localHeaderOffset + 30 > archiveBytes.byteLength ||
            view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER_SIG
        ) {
            return fail('CORRUPT_ZIP_STRUCTURE', `Invalid Local File Header for "${entryName}"`, totalUncompressedBytes);
        }

        const localNameLen = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > archiveBytes.byteLength) {
            return fail('CORRUPT_ZIP_STRUCTURE', `Entry "${entryName}" data extends past end of archive`, totalUncompressedBytes);
        }

        const compressedSlice = archiveBytes.subarray(dataStart, dataEnd);
        let decompressed: Uint8Array;
        if (compressionMethod === 0) {
            decompressed = new Uint8Array(compressedSlice);
        } else if (compressionMethod === 8) {
            try {
                decompressed = await inflateRaw(compressedSlice, maxUncompressedBytes);
            } catch (err) {
                return fail(
                    'CORRUPT_ZIP_STRUCTURE',
                    `Failed to inflate "${entryName}": ${err instanceof Error ? err.message : String(err)}`,
                    totalUncompressedBytes
                );
            }
        } else {
            return fail('CORRUPT_ZIP_STRUCTURE', `Unsupported ZIP compression method ${compressionMethod}`, totalUncompressedBytes);
        }

        if (
            compressedSlice.byteLength > 0 &&
            decompressed.byteLength / compressedSlice.byteLength > maxCompressionRatio
        ) {
            return fail(
                'ZIP_BOMB_RATIO_EXCEEDED',
                `Entry "${entryName}" actual compression ratio exceeds limit (${maxCompressionRatio}:1)`,
                totalUncompressedBytes
            );
        }

        if (decompressed.byteLength !== uncompressedSize) {
            return fail('CORRUPT_ZIP_STRUCTURE', `Entry "${entryName}" uncompressed length mismatch`, totalUncompressedBytes);
        }

        const actualCrc32 = ComputeCrc32(decompressed);
        if (actualCrc32 !== expectedCrc32) {
            return fail('CORRUPT_ZIP_STRUCTURE', `CRC-32 mismatch for "${entryName}"`, totalUncompressedBytes);
        }

        entries.set(entryName, decompressed);
        cdPos += 46 + fileNameLen + extraFieldLen + commentLen;
    }

    const manifestBytes = entries.get('manifest.json');
    if (!manifestBytes) {
        return fail('MISSING_MANIFEST', 'Missing required manifest.json entry', totalUncompressedBytes);
    }

    let manifest: DiagnosticBundleManifest;
    try {
        manifest = JSON.parse(decoder.decode(manifestBytes)) as DiagnosticBundleManifest;
    } catch {
        return fail('INVALID_MANIFEST_SCHEMA', 'manifest.json is not valid UTF-8 JSON', totalUncompressedBytes);
    }

    if (
        !manifest ||
        manifest.schemaVersion !== '1.0' ||
        typeof manifest.bundleId !== 'string' ||
        !manifest.bundleId ||
        typeof manifest.files !== 'object' ||
        manifest.files === null
    ) {
        return fail('INVALID_MANIFEST_SCHEMA', 'manifest.json failed schema validation', totalUncompressedBytes);
    }

    for (const [filePath, descriptor] of Object.entries(manifest.files)) {
        const entryBytes = entries.get(filePath);
        if (!entryBytes) {
            return fail('ENTRY_SHA256_MISMATCH', `Manifest references missing entry "${filePath}"`, totalUncompressedBytes);
        }
        if (entryBytes.byteLength !== descriptor.sizeBytes) {
            return fail('ENTRY_SHA256_MISMATCH', `Size mismatch for "${filePath}"`, totalUncompressedBytes);
        }
        const computedHash = await ComputeSha256Hex(entryBytes);
        if (computedHash.toLowerCase() !== descriptor.sha256.toLowerCase()) {
            return fail('ENTRY_SHA256_MISMATCH', `SHA-256 digest mismatch for "${filePath}"`, totalUncompressedBytes);
        }
    }

    return {
        valid: true,
        manifest,
        entries,
        totalCompressedBytes: archiveBytes.byteLength,
        totalUncompressedBytes,
    };
}

/**
 * Reconstructs `DiagnosticBundleData` from a verified `.mjdiag` archive result or entry map.
 */
export function ParseBundleDataFromArchive(
    verificationOrEntries: BundleArchiveVerificationResult | Map<string, Uint8Array>
): DiagnosticBundleData {
    const entries =
        verificationOrEntries instanceof Map ? verificationOrEntries : verificationOrEntries.entries;
    if (!entries) {
        throw new Error('Cannot parse DiagnosticBundleData: archive entries map is missing');
    }

    const decoder = new TextDecoder('utf-8');
    const readJson = <T>(path: string, fallback: T): T => {
        const raw = entries.get(path);
        if (!raw) return fallback;
        return JSON.parse(decoder.decode(raw)) as T;
    };
    const readNdjson = <T>(path: string): T[] => {
        const raw = entries.get(path);
        if (!raw) return [];
        return ParseNdjson<T>(decoder.decode(raw));
    };

    const contrib: Record<string, Record<string, unknown>> = {};
    for (const [path, bytes] of entries.entries()) {
        if (path.startsWith('contrib/') || path.startsWith('contributors/')) {
            const key = path.replace(/^(contrib|contributors)\//, '').replace(/\.json$/, '');
            try {
                contrib[key] = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
            } catch {
                // Skip malformed contrib file
            }
        }
    }

    return {
        environment: readJson('environment.json', { mjVersion: 'unknown' }),
        repro: readJson('repro.json', { breadcrumbs: [] }),
        clientLogs: readNdjson<DiagnosticLogEntry>('client/logs.ndjson'),
        clientWaterfall: readNdjson<DiagnosticNetworkEntry>('client/waterfall.ndjson'),
        clientTelemetry: readNdjson<DiagnosticTelemetryEntry>('client/telemetry.ndjson'),
        serverTraces: readNdjson<DiagnosticServerSpanEntry>('server/traces.ndjson'),
        serverSql: readNdjson<DiagnosticSqlEntry>('server/sql.ndjson'),
        serverLogs: readNdjson<DiagnosticLogEntry>('server/logs.ndjson'),
        serverHealth: entries.has('server/health.json')
            ? readJson<DiagnosticServerHealthSnapshot | undefined>('server/health.json', undefined)
            : undefined,
        findings: readJson<DiagnosticFinding[]>('findings.json', []),
        ...(Object.keys(contrib).length > 0 ? { contrib } : {}),
    };
}
