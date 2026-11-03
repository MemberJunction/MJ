import type { DiagnosticBundleData } from '../index.js';

/** Returns a bundle with every section present and empty. */
export function EmptyBundleData(): DiagnosticBundleData {
    return {
        environment: { mjVersion: '6.2.0' },
        repro: { breadcrumbs: [] },
        clientLogs: [],
        clientWaterfall: [],
        clientTelemetry: [],
        serverTraces: [],
        serverSql: [],
        serverLogs: [],
        findings: [],
    };
}

/** Location of one central directory record and its local file header. */
export interface ZipEntryLayout {
    Name: string;
    CentralOffset: number;
    LocalOffset: number;
}

/** Lists the entries of a ZIP archive by reading its central directory. */
export function ReadZipLayout(zip: Uint8Array): ZipEntryLayout[] {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let eocd = -1;
    for (let i = zip.byteLength - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    const count = view.getUint16(eocd + 10, true);
    let pos = view.getUint32(eocd + 16, true);
    const out: ZipEntryLayout[] = [];
    for (let i = 0; i < count; i++) {
        const nameLen = view.getUint16(pos + 28, true);
        const extraLen = view.getUint16(pos + 30, true);
        const commentLen = view.getUint16(pos + 32, true);
        out.push({
            Name: new TextDecoder().decode(zip.subarray(pos + 46, pos + 46 + nameLen)),
            CentralOffset: pos,
            LocalOffset: view.getUint32(pos + 42, true),
        });
        pos += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

/** Returns the layout of the named entry, or throws when it is absent. */
export function FindZipEntry(zip: Uint8Array, name: string): ZipEntryLayout {
    const entry = ReadZipLayout(zip).find((e) => e.Name === name);
    if (!entry) {
        throw new Error(`Entry ${name} not found`);
    }
    return entry;
}

/** Returns a DataView over a copy of `zip`, plus the copy. */
export function MutableZip(zip: Uint8Array): { Bytes: Uint8Array; View: DataView } {
    const bytes = new Uint8Array(zip);
    return { Bytes: bytes, View: new DataView(bytes.buffer) };
}
