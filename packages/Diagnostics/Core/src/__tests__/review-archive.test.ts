import { describe, it, expect } from 'vitest';
import {
    BuildMjdiagArchive,
    BuildCustomZipArchive,
    VerifyBundleArchive,
    ParseBundleDataFromArchive,
    BaseDiagnosticContributor,
    DiagnosticContributorRegistry,
    type CustomZipEntryInput,
    type DiagnosticBundleManifest,
} from '../index.js';
import { EmptyBundleData, FindZipEntry, MutableZip } from './reviewFixtures.js';

const encoder = new TextEncoder();

/** Builds a valid archive and returns its entries with the manifest parsed out. */
async function validEntries(): Promise<{ Manifest: DiagnosticBundleManifest; Entries: Map<string, Uint8Array> }> {
    const verified = await VerifyBundleArchive(await BuildMjdiagArchive(EmptyBundleData()));
    if (!verified.valid || !verified.manifest || !verified.entries) {
        throw new Error('fixture archive is invalid');
    }
    return { Manifest: verified.manifest, Entries: verified.entries };
}

/** Rebuilds an archive from entries, writing `manifest` as manifest.json and adding `extra` entries. */
async function rebuild(
    manifest: unknown,
    entries: Map<string, Uint8Array>,
    extra: CustomZipEntryInput[] = []
): Promise<Uint8Array> {
    const items: CustomZipEntryInput[] = [{ name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) }];
    for (const [name, data] of entries) {
        if (name !== 'manifest.json') {
            items.push({ name, data });
        }
    }
    return BuildCustomZipArchive([...items, ...extra]);
}

describe('VerifyBundleArchive malformed manifest descriptors', () => {
    it('returns INVALID_MANIFEST_SCHEMA for a null file descriptor', async () => {
        const { Manifest, Entries } = await validEntries();
        const files: Record<string, unknown> = { ...Manifest.files, 'environment.json': null };
        const result = await VerifyBundleArchive(await rebuild({ ...Manifest, files }, Entries));
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('INVALID_MANIFEST_SCHEMA');
    });

    it('returns INVALID_MANIFEST_SCHEMA for a non-string sha256', async () => {
        const { Manifest, Entries } = await validEntries();
        const env = Manifest.files['environment.json'];
        const files: Record<string, unknown> = { ...Manifest.files, 'environment.json': { sizeBytes: env.sizeBytes, sha256: 5 } };
        const result = await VerifyBundleArchive(await rebuild({ ...Manifest, files }, Entries));
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('INVALID_MANIFEST_SCHEMA');
    });
});

describe('VerifyBundleArchive entries not listed in the manifest', () => {
    it('refuses an entry the manifest does not list with UNLISTED_ENTRY', async () => {
        const { Manifest, Entries } = await validEntries();
        const zip = await rebuild(Manifest, Entries, [{ name: 'contrib/extra.json', data: encoder.encode('{"a":1}') }]);
        const result = await VerifyBundleArchive(zip);
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('UNLISTED_ENTRY');
    });
});

describe('VerifyBundleArchive local header and central directory agreement', () => {
    const cases: Array<{ field: string; patch: (view: DataView, local: number) => void }> = [
        { field: 'name', patch: (view, local) => view.setUint8(local + 30, 'E'.charCodeAt(0)) },
        { field: 'compression method', patch: (view, local) => view.setUint16(local + 8, 0, true) },
        { field: 'CRC-32', patch: (view, local) => view.setUint32(local + 14, view.getUint32(local + 14, true) ^ 1, true) },
        { field: 'compressed size', patch: (view, local) => view.setUint32(local + 18, view.getUint32(local + 18, true) + 1, true) },
        { field: 'uncompressed size', patch: (view, local) => view.setUint32(local + 22, view.getUint32(local + 22, true) + 1, true) },
    ];

    it.each(cases)('refuses a local header whose $field differs from the central directory', async ({ patch }) => {
        const data = EmptyBundleData();
        data.environment.featureFlags = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`flag${i}`, true]));
        const archive = await BuildMjdiagArchive(data);
        const entry = FindZipEntry(archive, 'environment.json');
        const zip = MutableZip(archive);
        expect(zip.View.getUint16(entry.LocalOffset + 8, true)).toBe(8);
        patch(zip.View, entry.LocalOffset);
        const result = await VerifyBundleArchive(zip.Bytes);
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('CORRUPT_ZIP_STRUCTURE');
        expect(result.reason).toMatch(/Local File Header/);
    });
});

describe('VerifyBundleArchive inflate limit', () => {
    it('stops inflating an entry once it passes the declared uncompressed size', async () => {
        const archive = await BuildCustomZipArchive([{ name: 'environment.json', data: new Uint8Array(1_000_000) }]);
        const entry = FindZipEntry(archive, 'environment.json');
        const zip = MutableZip(archive);
        zip.View.setUint32(entry.CentralOffset + 24, 10, true);
        zip.View.setUint32(entry.LocalOffset + 22, 10, true);
        const result = await VerifyBundleArchive(zip.Bytes, { maxCompressionRatio: 1e9 });
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('CORRUPT_ZIP_STRUCTURE');
        expect(result.reason).toMatch(/exceeded limit of 10 bytes/);
    });
});

describe('Contributor section keys', () => {
    class KeyedContributor extends BaseDiagnosticContributor {
        public constructor(private readonly key: string) {
            super();
        }
        public get SectionKey(): string {
            return this.key;
        }
        public Collect(): Record<string, unknown> {
            return { ok: true };
        }
    }

    it('builds a valid archive when contrib holds keys that are too long, contain "..", or are not file-safe', async () => {
        const data = EmptyBundleData();
        data.contrib = {
            ['x'.repeat(65)]: { a: 1 },
            'a..b': { a: 2 },
            'trailing.': { a: 3 },
            'a b': { a: 4 },
            a_b: { a: 5 },
            good: { a: 6 },
        };
        const result = await VerifyBundleArchive(await BuildMjdiagArchive(data));
        expect(result.valid).toBe(true);
        const parsed = ParseBundleDataFromArchive(result);
        expect(parsed.contrib?.['good']).toEqual({ a: 6 });
        expect(parsed.contrib?.['a_b']).toEqual({ a: 5 });
    });

    it.each(['x'.repeat(65), 'a..b', 'trailing.', 'a b', 'a/b', ''])('RegisterContributor refuses the key %j', (key) => {
        expect(() => DiagnosticContributorRegistry.Instance.RegisterContributor(new KeyedContributor(key))).toThrow(/SectionKey/);
    });

    it('RegisterContributor refuses a second contributor with a key already registered', () => {
        const unregister = DiagnosticContributorRegistry.Instance.RegisterContributor(new KeyedContributor('review-dup'));
        try {
            expect(() => DiagnosticContributorRegistry.Instance.RegisterContributor(new KeyedContributor('review-dup'))).toThrow(
                /already registered/
            );
        } finally {
            unregister();
        }
    });
});

describe('VerifyBundleArchive structural checks (mutation-checked)', () => {
    it('refuses a duplicate entry name', async () => {
        const { Manifest, Entries } = await validEntries();
        const env = Entries.get('environment.json') ?? new Uint8Array();
        const zip = await rebuild(Manifest, Entries, [{ name: 'environment.json', data: env }]);
        const result = await VerifyBundleArchive(zip);
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('CORRUPT_ZIP_STRUCTURE');
        expect(result.reason).toMatch(/Duplicate ZIP entry/);
    });

    it('refuses an entry whose data does not match its CRC-32', async () => {
        const archive = await BuildMjdiagArchive(EmptyBundleData());
        const entry = FindZipEntry(archive, 'environment.json');
        const zip = MutableZip(archive);
        const crc = zip.View.getUint32(entry.CentralOffset + 16, true) ^ 1;
        zip.View.setUint32(entry.CentralOffset + 16, crc, true);
        zip.View.setUint32(entry.LocalOffset + 14, crc, true);
        const result = await VerifyBundleArchive(zip.Bytes);
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('CORRUPT_ZIP_STRUCTURE');
        expect(result.reason).toMatch(/CRC-32 mismatch/);
    });

    it('refuses a symbolic link entry', async () => {
        const archive = await BuildMjdiagArchive(EmptyBundleData());
        const entry = FindZipEntry(archive, 'environment.json');
        const zip = MutableZip(archive);
        zip.View.setUint32(entry.CentralOffset + 38, (0xa1ff << 16) >>> 0, true);
        const result = await VerifyBundleArchive(zip.Bytes);
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('UNSAFE_ENTRY_PATH');
        expect(result.reason).toMatch(/Symbolic link/);
    });

    it('refuses an entry whose declared compression ratio exceeds the limit', async () => {
        const zip = await BuildCustomZipArchive([{ name: 'environment.json', data: new Uint8Array(100_000) }]);
        const result = await VerifyBundleArchive(zip, { maxCompressionRatio: 5 });
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('ZIP_BOMB_RATIO_EXCEEDED');
        expect(result.reason).toMatch(/compression ratio \(\d+\.\d:1\) exceeds limit \(5:1\)/);
    });

    it('refuses an entry whose SHA-256 differs from the manifest when every entry is present', async () => {
        const { Manifest, Entries } = await validEntries();
        const files = { ...Manifest.files, 'environment.json': { ...Manifest.files['environment.json'], sha256: '0'.repeat(64) } };
        const result = await VerifyBundleArchive(await rebuild({ ...Manifest, files }, Entries));
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('ENTRY_SHA256_MISMATCH');
        expect(result.reason).toMatch(/SHA-256 digest mismatch for "environment.json"/);
    });
});
