/**
 * Zero-dependency `.mjdiag` ZIP archive builder, reader, and strict structural verifier.
 * Uses standard Web `CompressionStream` / `DecompressionStream` (`deflate-raw`) and
 * `crypto.subtle.digest('SHA-256')` so it runs identically in modern browsers and Node 20+.
 */

import {
    IsAllowedMjdiagEntryPath,
    IsValidContributorSectionKey,
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

/**
 * Writes `input` to a transform stream and closes it. The returned promise never rejects:
 * it resolves to the write error, or null when the write and close succeed.
 */
function writeAndClose(writable: WritableStream<BufferSource>, input: Uint8Array): Promise<Error | null> {
    const writer = writable.getWriter();
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    return writer
        .write(copy)
        .then(() => writer.close())
        .then(
            () => null,
            (err: Error | string) => (err instanceof Error ? err : new Error(String(err)))
        );
}

/** Joins chunks into one buffer of `total` bytes. */
function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream === 'undefined' || input.byteLength === 0) {
        return input;
    }
    const cs = new CompressionStream('deflate-raw');
    const writeDone = writeAndClose(cs.writable, input);
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.byteLength;
        }
    } finally {
        const writeError = await writeDone;
        if (writeError) {
            throw writeError;
        }
    }
    return concatChunks(chunks, total);
}

/**
 * Inflates `compressed` and throws once the output passes `maxUncompressedBytes`.
 * Every stream promise is awaited, so a bad or oversized entry never leaves an unhandled rejection.
 */
async function inflateRaw(compressed: Uint8Array, maxUncompressedBytes: number): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw');
    const writeDone = writeAndClose(ds.writable, compressed);
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxUncompressedBytes) {
                await reader.cancel('Exceeded maxUncompressedBytes').catch(() => undefined);
                throw new Error(`ZIP entry decompression exceeded limit of ${maxUncompressedBytes} bytes`);
            }
            chunks.push(value);
        }
    } finally {
        await writeDone;
    }
    const writeError = await writeDone;
    if (writeError) {
        throw writeError;
    }
    return concatChunks(chunks, total);
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
 * Adds one `contrib/<SectionKey>.json` file per contributor section with a valid key.
 * Returns the number of sections skipped because their key is not valid.
 */
function addContributorFiles(
    payloadFiles: Array<{ name: string; bytes: Uint8Array; entryCount?: number }>,
    contrib: DiagnosticBundleData['contrib'],
    encoder: TextEncoder
): number {
    let skipped = 0;
    for (const [sectionKey, sectionValue] of Object.entries(contrib ?? {})) {
        if (!IsValidContributorSectionKey(sectionKey)) {
            skipped++;
            continue;
        }
        payloadFiles.push({
            name: `contrib/${sectionKey}.json`,
            bytes: encoder.encode(JSON.stringify(sectionValue, null, 2)),
        });
    }
    return skipped;
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

    const skippedContribKeys = addContributorFiles(payloadFiles, bundleData.contrib, encoder);

    const readmeLines = [
        'MemberJunction Diagnostic Bundle (.mjdiag)',
        '==========================================',
        `Bundle ID:        ${bundleId}`,
        `Session ID:       ${options?.sessionId ?? 'N/A'}`,
        `Created At:       ${createdAt}`,
        `Capture Reason:   ${captureReason}`,
        `Scrubber Profile: ${scrubberProfile}`,
        `Findings Count:   ${bundleData.findings.length}`,
        ...(skippedContribKeys > 0 ? [`Contributor sections skipped (invalid SectionKey): ${skippedContribKeys}`] : []),
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
    | 'UNLISTED_ENTRY'
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
 * 4. Enforces Zip-Bomb protections (`maxCompressionRatio <= 25`, `maxUncompressedBytes <= 100 MiB`, `maxEntries <= 128`);
 *    each entry inflates to at most its declared uncompressed size
 * 5. Requires each local file header to repeat its central directory name, method, CRC-32 and sizes -> `CORRUPT_ZIP_STRUCTURE`
 * 6. Parses and validates `manifest.json` (`schemaVersion === '1.0'`, well-formed file descriptors) -> `INVALID_MANIFEST_SCHEMA`
 * 7. Refuses any entry other than `manifest.json` that the manifest does not list -> `UNLISTED_ENTRY`
 * 8. Recomputes SHA-256 of every file in `manifest.files` and verifies exact match -> `ENTRY_SHA256_MISMATCH`
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

        const localMismatch = describeLocalHeaderMismatch(archiveBytes, view, localHeaderOffset, {
            nameBytes,
            compressionMethod,
            crc32: expectedCrc32,
            compressedSize,
            uncompressedSize,
        });
        if (localMismatch) {
            return fail(
                'CORRUPT_ZIP_STRUCTURE',
                `Local File Header for "${entryName}" does not match the Central Directory (${localMismatch})`,
                totalUncompressedBytes
            );
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
                decompressed = await inflateRaw(compressedSlice, uncompressedSize);
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

    const manifestFailure = await checkManifestFiles(manifest, entries);
    if (manifestFailure) {
        return fail(manifestFailure.code, manifestFailure.reason, totalUncompressedBytes);
    }

    return {
        valid: true,
        manifest,
        entries,
        totalCompressedBytes: archiveBytes.byteLength,
        totalUncompressedBytes,
    };
}

/** Central directory values that the local file header of the same entry must repeat. */
interface CentralEntryFields {
    nameBytes: Uint8Array;
    compressionMethod: number;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
}

/**
 * Compares a local file header with its central directory record.
 * Returns the name of the first field that differs, or null when they agree.
 */
function describeLocalHeaderMismatch(
    archiveBytes: Uint8Array,
    view: DataView,
    localOffset: number,
    central: CentralEntryFields
): string | null {
    const localNameLen = view.getUint16(localOffset + 26, true);
    if (localOffset + 30 + localNameLen > archiveBytes.byteLength) {
        return 'file name length';
    }
    const localName = archiveBytes.subarray(localOffset + 30, localOffset + 30 + localNameLen);
    if (localNameLen !== central.nameBytes.byteLength || !localName.every((b, i) => b === central.nameBytes[i])) {
        return 'file name';
    }
    if (view.getUint16(localOffset + 8, true) !== central.compressionMethod) {
        return 'compression method';
    }
    if (view.getUint32(localOffset + 14, true) !== central.crc32) {
        return 'CRC-32';
    }
    if (view.getUint32(localOffset + 18, true) !== central.compressedSize) {
        return 'compressed size';
    }
    if (view.getUint32(localOffset + 22, true) !== central.uncompressedSize) {
        return 'uncompressed size';
    }
    return null;
}

/** True when a manifest file descriptor has a string `sha256` and a non-negative integer `sizeBytes`. */
function isValidFileDescriptor(descriptor: DiagnosticManifestFileEntry | null | undefined): descriptor is DiagnosticManifestFileEntry {
    return (
        typeof descriptor === 'object' &&
        descriptor !== null &&
        typeof descriptor.sha256 === 'string' &&
        typeof descriptor.sizeBytes === 'number' &&
        Number.isInteger(descriptor.sizeBytes) &&
        descriptor.sizeBytes >= 0
    );
}

/**
 * Checks that the manifest lists every archive entry except itself, that each descriptor is well formed,
 * and that each listed entry exists with the listed size and SHA-256. Returns the first failure, or null.
 */
async function checkManifestFiles(
    manifest: DiagnosticBundleManifest,
    entries: Map<string, Uint8Array>
): Promise<{ code: ArchiveVerificationReasonCode; reason: string } | null> {
    const files: Record<string, DiagnosticManifestFileEntry | null | undefined> = manifest.files;
    for (const entryName of entries.keys()) {
        if (entryName !== 'manifest.json' && !Object.prototype.hasOwnProperty.call(files, entryName)) {
            return { code: 'UNLISTED_ENTRY', reason: `Archive entry "${entryName}" is not listed in manifest.json` };
        }
    }
    for (const [filePath, descriptor] of Object.entries(files)) {
        if (!isValidFileDescriptor(descriptor)) {
            return { code: 'INVALID_MANIFEST_SCHEMA', reason: `manifest.json has an invalid descriptor for "${filePath}"` };
        }
        const entryBytes = entries.get(filePath);
        if (!entryBytes) {
            return { code: 'ENTRY_SHA256_MISMATCH', reason: `Manifest references missing entry "${filePath}"` };
        }
        if (entryBytes.byteLength !== descriptor.sizeBytes) {
            return { code: 'ENTRY_SHA256_MISMATCH', reason: `Size mismatch for "${filePath}"` };
        }
        const computedHash = await ComputeSha256Hex(entryBytes);
        if (computedHash.toLowerCase() !== descriptor.sha256.toLowerCase()) {
            return { code: 'ENTRY_SHA256_MISMATCH', reason: `SHA-256 digest mismatch for "${filePath}"` };
        }
    }
    return null;
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
