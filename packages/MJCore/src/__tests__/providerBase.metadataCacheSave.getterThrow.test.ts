/**
 * Metadata cache save must survive a throwing getter, and must never leave "fresh"
 * timestamps beside a missing payload.
 *
 * The failure this pins: BaseInfo.toJSON resolves a `_`-backed private field through its
 * PascalCase public getter. QueryInfo._categoryPath resolves through QueryInfo.CategoryPath,
 * which walks CategoryInfo -> Metadata.Provider.QueryCategories. During the INITIAL metadata
 * load the global provider is not assigned yet, so that getter throws, JSON.stringify of the
 * whole AllMetadata snapshot aborts, and SaveLocalMetadataToStorage drops the snapshot.
 * Because the save wrote its timestamps BEFORE the payload, the cache then claimed freshness
 * with no payload behind it. Two guards, each tested on its own:
 *   1. toJSON omits a key whose getter throws instead of aborting the serialization;
 *   2. SaveLocalMetadataToStorage writes the payload first and the timestamps last, so a
 *      failed payload write leaves the previous timestamps in place and the next boot retries.
 */
import { describe, it, expect } from 'vitest';
import { BaseInfo } from '../generic/baseInfo';
import { QueryInfo } from '../generic/queryInfo';
import { Metadata } from '../generic/metadata';
import { ILocalStorageProvider, IMetadataProvider, AllMetadata, MetadataInfo } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

// ─── 1. BaseInfo.toJSON ────────────────────────────────────────────────────

class InfoWithThrowingGetter extends BaseInfo {
    Name: string = '';
    private _categoryPath: string | null = null;
    get CategoryPath(): string {
        throw new Error('global provider not assigned yet');
    }
    private _fields: string[] = ['a', 'b'];
    get Fields(): string[] {
        return this._fields;
    }
}

describe('BaseInfo.toJSON with a getter that throws', () => {
    it('omits that key and keeps every other key, instead of aborting the serialization', () => {
        const info = new InfoWithThrowingGetter();
        info.Name = 'q1'; // field initializers run after the base constructor's copyInitData, so assign afterwards
        let json: Record<string, unknown> | null = null;
        expect(() => { json = info.toJSON(); }).not.toThrow();
        expect(json).not.toBeNull();
        expect(json!.Name).toBe('q1');
        expect(json!.Fields).toEqual(['a', 'b']);
        expect('CategoryPath' in json!).toBe(false);
    });

    it('a real QueryInfo with a CategoryID serializes while Metadata.Provider is unassigned', () => {
        // This is the shape of the initial load: the query rows are being built, the global
        // provider is not set, and CategoryPath cannot be computed yet.
        const previous = Metadata.Provider;
        try {
            Metadata.Provider = null as unknown as IMetadataProvider;
            const q = new QueryInfo({ ID: 'q-1', Name: 'Q', CategoryID: 'cat-1' });
            expect(() => JSON.stringify({ AllQueries: [q] })).not.toThrow();
        } finally {
            Metadata.Provider = previous;
        }
    });
});

// ─── 2. SaveLocalMetadataToStorage ordering ────────────────────────────────

/** The shared in-memory storage mock, plus the two things these tests need: write ORDER, and a failure on ONE key. */
class RecordingStorage extends MockCacheStorageProvider {
    public readonly Writes: string[] = [];
    constructor(private readonly failOnKeyContaining: string | null = null) {
        super();
    }
    override async SetItem(key: string, value: string, category?: string): Promise<void> {
        if (this.failOnKeyContaining && key.includes(this.failOnKeyContaining)) {
            throw new Error(`simulated storage failure writing ${key}`);
        }
        this.Writes.push(key);
        return super.SetItem(key, value, category);
    }
}

/** The shared provider mock, with the storage swapped for the recording one and a seam to seed the snapshot. */
class CacheSaveTestProvider extends TestMetadataProvider {
    constructor(private readonly storage: ILocalStorageProvider) {
        super();
    }
    /** Seed the in-memory snapshot the way a completed GetAllMetadata does. */
    public Seed(md: AllMetadata, timestamps: MetadataInfo[]): void {
        this.UpdateLocalMetadata(md);
        (this as unknown as { _latestLocalMetadataTimestamps: MetadataInfo[] })._latestLocalMetadataTimestamps = timestamps;
    }
    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.storage;
    }
}

function timestamps(): MetadataInfo[] {
    const t = new MetadataInfo();
    t.ID = 'ts-1';
    t.Type = 'Entities';
    t.UpdatedAt = new Date('2026-01-01T00:00:00Z');
    t.RowCount = 1;
    return [t];
}

describe('SaveLocalMetadataToStorage write order', () => {
    it('writes the payload before the timestamps, so timestamps can never describe a payload that is not there', async () => {
        const storage = new RecordingStorage();
        const provider = new CacheSaveTestProvider(storage);
        provider.Seed(new AllMetadata(), timestamps());

        await provider.SaveLocalMetadataToStorage();

        const payloadAt = storage.Writes.findIndex((k) => k.endsWith('_AllMetadata'));
        const formatAt = storage.Writes.findIndex((k) => k.endsWith('_Format'));
        const timestampsAt = storage.Writes.findIndex((k) => k.endsWith('_Timestamps'));
        expect(payloadAt).toBeGreaterThanOrEqual(0);
        expect(formatAt).toBeGreaterThanOrEqual(0);
        expect(timestampsAt).toBeGreaterThan(payloadAt);
        expect(timestampsAt).toBeGreaterThan(formatAt);
    });

    it('a failed payload write leaves NO timestamps behind, so the next boot retries the save', async () => {
        const storage = new RecordingStorage('_AllMetadata');
        const provider = new CacheSaveTestProvider(storage);
        provider.Seed(new AllMetadata(), timestamps());

        await expect(provider.SaveLocalMetadataToStorage()).resolves.toBeUndefined(); // fail-soft, as before

        expect(storage.Writes.some((k) => k.endsWith('_Timestamps'))).toBe(false);
    });

    it('a snapshot holding a query whose CategoryPath cannot be computed yet is still saved', async () => {
        const previous = Metadata.Provider;
        try {
            Metadata.Provider = null as unknown as IMetadataProvider;
            const md = new AllMetadata();
            md.AllQueries = [new QueryInfo({ ID: 'q-1', Name: 'Q', CategoryID: 'cat-1' })];
            const storage = new RecordingStorage();
            const provider = new CacheSaveTestProvider(storage);
            provider.Seed(md, timestamps());

            await provider.SaveLocalMetadataToStorage();

            expect(storage.Writes.some((k) => k.endsWith('_AllMetadata'))).toBe(true);
            expect(storage.Writes.some((k) => k.endsWith('_Timestamps'))).toBe(true);
        } finally {
            Metadata.Provider = previous;
        }
    });
});
