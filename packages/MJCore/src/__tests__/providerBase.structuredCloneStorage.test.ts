/**
 * Tests for structured-clone IndexedDB storage in ProviderBase (Wave 5.4).
 * Verifies that SetObject/GetObject are utilized when available on the storage provider,
 * and string/compressed storage fallback remains 100% backward compatible.
 */
import { describe, it, expect, vi } from 'vitest';
import { ILocalStorageProvider, AllMetadata } from '../generic/interfaces';
import { EntityInfo } from '../generic/entityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

/**
 * Storage mock that implements SetObject and GetObject (simulating BrowserIndexedDBStorageProvider).
 */
class StructuredCloneStorageMock extends MockCacheStorageProvider {
    public readonly SetObjectCalls: Array<{ key: string; value: unknown; category?: string }> = [];
    public readonly GetObjectCalls: Array<{ key: string; category?: string }> = [];
    private readonly objectStore = new Map<string, unknown>();

    override async SetObject<T>(key: string, value: T, category?: string): Promise<void> {
        this.SetObjectCalls.push({ key, value, category });
        this.objectStore.set(`${category ?? 'default'}:${key}`, value);
    }

    override async GetObject<T>(key: string, category?: string): Promise<T | null> {
        this.GetObjectCalls.push({ key, category });
        const val = this.objectStore.get(`${category ?? 'default'}:${key}`);
        if (val !== undefined) return val as T;
        const fallback = await super.GetItem<T>(key, category);
        return fallback;
    }
}

class TestProviderWithStorage extends TestMetadataProvider {
    constructor(private readonly storage: ILocalStorageProvider) {
        super();
    }
    public Seed(md: AllMetadata): void {
        this.UpdateLocalMetadata(md);
    }
    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.storage;
    }
    public async TestLoad(): Promise<void> {
        await this.LoadLocalMetadataFromStorage();
    }
}

describe('ProviderBase Structured-Clone Storage (Wave 5.4)', () => {
    function createTestMetadata(): AllMetadata {
        const md = new AllMetadata();
        md.AllEntities = [
            new EntityInfo({
                ID: 'e1',
                Name: 'Customer',
                SchemaName: 'crm',
                BaseTable: 'Customer',
                EntityFields: [
                    { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                    { ID: 'f2', Name: 'CompanyName', Type: 'nvarchar', Sequence: 2 },
                ],
            }),
        ];
        return md;
    }

    it('uses SetObject when available on LocalStorageProvider', async () => {
        const storage = new StructuredCloneStorageMock();
        const provider = new TestProviderWithStorage(storage);
        const md = createTestMetadata();
        provider.Seed(md);

        await provider.SaveLocalMetadataToStorage();

        // Must call SetObject for AllMetadata
        expect(storage.SetObjectCalls.length).toBeGreaterThan(0);
        const saveCall = storage.SetObjectCalls.find(c => c.key.endsWith('_AllMetadata'));
        expect(saveCall).toBeDefined();
        expect(saveCall!.value).toBe(md);

        // Format must be stamped as 'structured-clone'
        const formatKey = provider['LocalStoragePrefix'] + '___MJCore_Metadata_Format';
        const formatVal = await storage.GetItem<string>(formatKey);
        expect(formatVal).toBe('structured-clone');
    });

    it('uses GetObject when available and restores AllMetadata', async () => {
        const storage = new StructuredCloneStorageMock();
        const saveProvider = new TestProviderWithStorage(storage);
        const originalMd = createTestMetadata();
        saveProvider.Seed(originalMd);
        await saveProvider.SaveLocalMetadataToStorage();

        // Fresh provider reading from the same storage
        const loadProvider = new TestProviderWithStorage(storage);
        await loadProvider.TestLoad();

        // Must call GetObject
        expect(storage.GetObjectCalls.length).toBeGreaterThan(0);
        const getCall = storage.GetObjectCalls.find(c => c.key.endsWith('_AllMetadata'));
        expect(getCall).toBeDefined();

        // Verify entities restored cleanly
        const loadedEntities = loadProvider.Entities;
        expect(loadedEntities.length).toBe(1);
        expect(loadedEntities[0].Name).toBe('Customer');
        expect(loadedEntities[0].Fields.length).toBe(2);
        expect(loadedEntities[0].FirstPrimaryKey.Name).toBe('ID');
    });

    it('falls back to string serialization when SetObject is not implemented', async () => {
        const plainStorage = new MockCacheStorageProvider(); // only SetItem/GetItem
        const provider = new TestProviderWithStorage(plainStorage);
        const md = createTestMetadata();
        provider.Seed(md);

        await provider.SaveLocalMetadataToStorage();

        const formatKey = provider['LocalStoragePrefix'] + '___MJCore_Metadata_Format';
        const formatVal = await plainStorage.GetItem<string>(formatKey);
        // Compressed gzip or uncompressed json (neither is structured-clone)
        expect(['gzip', 'json']).toContain(formatVal);

        // Load works cleanly from string store
        const loadProvider = new TestProviderWithStorage(plainStorage);
        await loadProvider.TestLoad();
        expect(loadProvider.Entities.length).toBe(1);
        expect(loadProvider.Entities[0].Name).toBe('Customer');
    });

    it('falls back cleanly to string parsing when GetObject is present but stored payload is a string', async () => {
        const storage = new StructuredCloneStorageMock();
        const provider = new TestProviderWithStorage(storage);
        const md = createTestMetadata();

        // Seed storage with legacy JSON string manually
        const prefix = provider['LocalStoragePrefix'];
        const dataKey = prefix + '___MJCore_Metadata_AllMetadata';
        const formatKey = prefix + '___MJCore_Metadata_Format';
        const tsKey = prefix + '___MJCore_Metadata_Timestamps';

        await storage.SetItem(dataKey, JSON.stringify(md));
        await storage.SetItem(formatKey, 'json');
        await storage.SetItem(tsKey, JSON.stringify([]));

        // When GetObject is called, objectStore returns undefined for the object getter,
        // but GetItem / string fallback handles the JSON string cleanly.
        await provider.TestLoad();
        expect(provider.Entities.length).toBe(1);
        expect(provider.Entities[0].Name).toBe('Customer');
    });
});
