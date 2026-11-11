import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager, CacheCategory, CachedRunViewData, CacheRowDeltaPayload, CachedRowChange } from '../generic/localCacheManager';
import { CompositeKey } from '../generic/compositeKey';
import { ILocalStorageProvider, LocalStorageWriteOptions } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { ProviderBase } from '../generic/providerBase';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

interface CapturedWrite {
    key: string;
    category?: string;
    value: unknown;
    options?: LocalStorageWriteOptions;
}

interface CapturedDelta {
    fingerprint: string;
    deltaPayloadJson: string;
    updatedSlotValue: unknown;
    options?: LocalStorageWriteOptions;
}

class RecordingStorageProvider implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    public readonly Writes: CapturedWrite[] = [];
    public SupportsCrossProcessPersistence: boolean = true;

    protected store = new Map<string, unknown>();

    protected k(key: string, category?: string): string {
        return `${category ?? 'default'}::${key}`;
    }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const v = this.store.get(this.k(key, category));
        return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
    }

    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) {
            out.set(key, await this.GetItem<T>(key, category));
        }
        return out;
    }

    public async SetItem<T>(key: string, value: T, category?: string, options?: LocalStorageWriteOptions): Promise<void> {
        this.Writes.push({ key, category, value: JSON.parse(JSON.stringify(value)), options });
        this.store.set(this.k(key, category), JSON.parse(JSON.stringify(value)));
    }

    public async Remove(key: string, category?: string): Promise<void> {
        this.store.delete(this.k(key, category));
    }

    public async ClearCategory(category: string): Promise<void> {
        for (const k of Array.from(this.store.keys())) {
            if (k.startsWith(`${category}::`)) {
                this.store.delete(k);
            }
        }
    }

    public async GetCategoryKeys(category: string): Promise<string[]> {
        return Array.from(this.store.keys())
            .filter(k => k.startsWith(`${category}::`))
            .map(k => k.substring(category.length + 2));
    }
}

class DeltaTrackingStorageProvider extends RecordingStorageProvider {
    public readonly DeltaCalls: CapturedDelta[] = [];
    public DeltaReturnValue: boolean = true;

    public async ApplyRunViewRowDelta<T = unknown>(
        fingerprint: string,
        deltaPayloadJson: string,
        updatedSlotValue: T,
        options?: LocalStorageWriteOptions
    ): Promise<boolean> {
        this.DeltaCalls.push({
            fingerprint,
            deltaPayloadJson,
            updatedSlotValue,
            options,
        });

        if (this.DeltaReturnValue) {
            this.store.set(this.k(fingerprint, CacheCategory.RunViewCache), JSON.parse(JSON.stringify(updatedSlotValue)));
            return true;
        }
        return false;
    }
}

class TestDebouncedProvider extends ProviderBase {
    public SaveCallCount = 0;
    public SaveDelayMs = 0;
    public MockStorage: ILocalStorageProvider;

    constructor(storage: ILocalStorageProvider) {
        super();
        this.MockStorage = storage;
    }

    public get ProviderType() {
        return 'Database' as const;
    }

    public get DatabaseConnection() {
        return {};
    }

    public get LocalStorageProvider(): ILocalStorageProvider {
        return this.MockStorage;
    }

    protected async GetCurrentUser() {
        return null;
    }

    public override async SaveLocalMetadataToStorage(): Promise<void> {
        this.SaveCallCount++;
        if (this.SaveDelayMs > 0) {
            await new Promise<void>(resolve => setTimeout(resolve, this.SaveDelayMs));
        }
    }
}

const ENTITY = 'TestEntity';
const T0 = '2026-10-01T00:00:00.000Z';
const T1 = '2026-10-02T00:00:00.000Z';
const T2 = '2026-10-03T00:00:00.000Z';

function generateRows(count: number, baseTimestamp: string = T0): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= count; i++) {
        rows.push({
            ID: `id-${i}`,
            Name: `Row ${i}`,
            __mj_UpdatedAt: baseTimestamp,
        });
    }
    return rows;
}

function rowKey(id: string): CompositeKey {
    return new CompositeKey([{ FieldName: 'ID', Value: id }]);
}

describe('Wave 4.4 MJCore optimizations', () => {
    describe('1. ApplyRowChanges O(Δ) Copy-on-Write row indexing on 1,000-row slot', () => {
        let cache: LocalCacheManager;
        let storage: RecordingStorageProvider;
        let fp: string;
        const params: RunViewParams = { EntityName: ENTITY };

        beforeEach(async () => {
            resetLocalCacheManager();
            storage = new RecordingStorageProvider();
            cache = LocalCacheManager.Instance;
            await cache.Initialize(storage, { verboseLogging: false });
            fp = (cache as unknown as { GenerateRunViewFingerprint(p: RunViewParams): string }).GenerateRunViewFingerprint(params);

            const initialRows = generateRows(1000, T0);
            await cache.SetRunViewResult(fp, params, initialRows, T0, undefined, 1000);
            storage.Writes.length = 0;
        });

        it('reuses WeakMap PK index across consecutive updates, inserts, and deletes preserving exact order', async () => {
            // Update row 500
            const updated500 = { ID: 'id-500', Name: 'Row 500 Updated', __mj_UpdatedAt: T1 };
            const ok1 = await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-500'), Row: updated500 }], T1);
            expect(ok1).toBe(true);

            expect(storage.Writes).toHaveLength(1);
            const slot1 = storage.Writes[0].value as CachedRunViewData;
            const rows1 = slot1.results as Array<{ ID: string; Name: string }>;
            expect(rows1).toHaveLength(1000);
            expect(rows1[499].ID).toBe('id-500');
            expect(rows1[499].Name).toBe('Row 500 Updated');
            expect(rows1[0].ID).toBe('id-1');
            expect(rows1[999].ID).toBe('id-1000');
            expect(slot1.totalRowCount).toBe(1000);
            expect(slot1.maxUpdatedAt).toBe(T1);

            // Insert row 1001
            storage.Writes.length = 0;
            const inserted1001 = { ID: 'id-1001', Name: 'Row 1001', __mj_UpdatedAt: T1 };
            const ok2 = await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-1001'), Row: inserted1001 }], T1);
            expect(ok2).toBe(true);

            expect(storage.Writes).toHaveLength(1);
            const slot2 = storage.Writes[0].value as CachedRunViewData;
            const rows2 = slot2.results as Array<{ ID: string; Name: string }>;
            expect(rows2).toHaveLength(1001);
            expect(rows2[1000].ID).toBe('id-1001');
            expect(rows2[499].Name).toBe('Row 500 Updated');
            expect(slot2.totalRowCount).toBe(1001);

            // Delete row 100
            storage.Writes.length = 0;
            const ok3 = await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-100'), Row: null }], T1);
            expect(ok3).toBe(true);

            expect(storage.Writes).toHaveLength(1);
            const slot3 = storage.Writes[0].value as CachedRunViewData;
            const rows3 = slot3.results as Array<{ ID: string; Name: string }>;
            expect(rows3).toHaveLength(1000); // 1001 - 1
            expect(rows3.some(r => r.ID === 'id-100')).toBe(false);
            expect(rows3[99].ID).toBe('id-101'); // row 101 shifted into index 99
            expect(rows3[rows3.length - 1].ID).toBe('id-1001');
            expect(slot3.totalRowCount).toBe(1000);

            // No-op delete of absent key does nothing
            storage.Writes.length = 0;
            const ok4 = await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-nonexistent'), Row: null }], T1);
            expect(ok4).toBe(true);
            expect(storage.Writes).toHaveLength(0);
        });
    });

    describe('2. MaxUpdatedAtOfRows O(Δ) fast path', () => {
        let cache: LocalCacheManager;
        let storage: RecordingStorageProvider;
        let fp: string;
        const params: RunViewParams = { EntityName: ENTITY };

        beforeEach(async () => {
            resetLocalCacheManager();
            storage = new RecordingStorageProvider();
            cache = LocalCacheManager.Instance;
            await cache.Initialize(storage, { verboseLogging: false });
            fp = (cache as unknown as { GenerateRunViewFingerprint(p: RunViewParams): string }).GenerateRunViewFingerprint(params);

            // Seed 5 rows: row 5 has max timestamp T1, rows 1-4 have T0
            const initialRows: Array<Record<string, unknown>> = [
                { ID: 'id-1', Name: 'Row 1', __mj_UpdatedAt: T0 },
                { ID: 'id-2', Name: 'Row 2', __mj_UpdatedAt: T0 },
                { ID: 'id-3', Name: 'Row 3', __mj_UpdatedAt: T0 },
                { ID: 'id-4', Name: 'Row 4', __mj_UpdatedAt: T0 },
                { ID: 'id-5', Name: 'Row 5', __mj_UpdatedAt: T1 },
            ];
            await cache.SetRunViewResult(fp, params, initialRows, T1, undefined, 5);
            storage.Writes.length = 0;
        });

        it('fast path: updating a row to a newer timestamp sets maxUpdatedAt without full scan', async () => {
            // Update row 2 to T2 (newer than T1)
            const updated = { ID: 'id-2', Name: 'Row 2', __mj_UpdatedAt: T2 };
            await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-2'), Row: updated }], T2);

            const lastWrite = storage.Writes.at(-1);
            const slot = lastWrite?.value as CachedRunViewData;
            expect(slot.maxUpdatedAt).toBe(T2);
        });

        it('fast path: updating a row with an older timestamp preserves existing maxUpdatedAt', async () => {
            // Update row 1 with timestamp T0 (older than T1)
            const updated = { ID: 'id-1', Name: 'Row 1 Updated', __mj_UpdatedAt: T0 };
            await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-1'), Row: updated }], T1);

            const lastWrite = storage.Writes.at(-1);
            const slot = lastWrite?.value as CachedRunViewData;
            expect(slot.maxUpdatedAt).toBe(T1);
        });

        it('fallback: deleting the row holding maxUpdatedAt triggers scan and updates maxUpdatedAt to previous maximum', async () => {
            // Row 5 holds T1. Deleting it should fall back to scanning rows 1-4 which have T0
            await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-5'), Row: null }], T0);

            const lastWrite = storage.Writes.at(-1);
            const slot = lastWrite?.value as CachedRunViewData;
            expect(slot.maxUpdatedAt).toBe(T0);
        });

        it('fallback: downgrading the timestamp of the row holding maxUpdatedAt triggers scan', async () => {
            // Row 5 holds T1. Downgrade row 5 to T0
            const downgraded = { ID: 'id-5', Name: 'Row 5 Downgraded', __mj_UpdatedAt: T0 };
            await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-5'), Row: downgraded }], T0);

            const lastWrite = storage.Writes.at(-1);
            const slot = lastWrite?.value as CachedRunViewData;
            expect(slot.maxUpdatedAt).toBe(T0);
        });
    });

    describe('3. ILocalStorageProvider.ApplyRunViewRowDelta delegation', () => {
        let cache: LocalCacheManager;
        let storage: DeltaTrackingStorageProvider;
        let fp: string;
        const params: RunViewParams = { EntityName: ENTITY };

        beforeEach(async () => {
            resetLocalCacheManager();
            storage = new DeltaTrackingStorageProvider();
            cache = LocalCacheManager.Instance;
            await cache.Initialize(storage, { verboseLogging: false });
            fp = (cache as unknown as { GenerateRunViewFingerprint(p: RunViewParams): string }).GenerateRunViewFingerprint(params);

            const rows = generateRows(5, T0);
            await cache.SetRunViewResult(fp, params, rows, T0, undefined, 5);
            storage.Writes.length = 0;
            storage.DeltaCalls.length = 0;
        });

        it('delegates to ApplyRunViewRowDelta and skips SetItem when delta returns true', async () => {
            storage.DeltaReturnValue = true;
            const updated = { ID: 'id-3', Name: 'Row 3 Delta', __mj_UpdatedAt: T1 };

            const success = await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-3'), Row: updated }], T1);
            expect(success).toBe(true);

            expect(storage.DeltaCalls).toHaveLength(1);
            expect(storage.DeltaCalls[0].fingerprint).toBe(fp);
            expect(storage.DeltaCalls[0].options?.PrimaryKeyFields).toEqual(['ID']);

            const deltaPayload = JSON.parse(storage.DeltaCalls[0].deltaPayloadJson) as CacheRowDeltaPayload;
            expect(deltaPayload.upsertedRows).toEqual([updated]);
            expect(deltaPayload.primaryKeyFields).toEqual(['ID']);
            expect(deltaPayload.rowCount).toBe(5);

            // SetItem should NOT have been called!
            expect(storage.Writes).toHaveLength(0);
        });

        it('falls back to SetItem when ApplyRunViewRowDelta returns false', async () => {
            storage.DeltaReturnValue = false;
            const updated = { ID: 'id-4', Name: 'Row 4 Fallback', __mj_UpdatedAt: T1 };

            const success = await cache.ApplyRowChanges(fp, [{ Key: rowKey('id-4'), Row: updated }], T1);
            expect(success).toBe(true);

            expect(storage.DeltaCalls).toHaveLength(1);
            // SetItem should have been called as fallback
            expect(storage.Writes).toHaveLength(1);
            expect(storage.Writes[0].key).toBe(fp);
            expect(storage.Writes[0].options?.PrimaryKeyFields).toEqual(['ID']);
        });
    });

    describe('4. ProviderBase.ScheduleSaveLocalMetadataToStorage coalescing & serialization', () => {
        let storage: RecordingStorageProvider;

        beforeEach(() => {
            vi.useFakeTimers();
            storage = new RecordingStorageProvider();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('coalesces 10 rapid schedule calls into 1 single save execution', () => {
            const provider = new TestDebouncedProvider(storage);

            for (let i = 0; i < 10; i++) {
                provider.ScheduleSaveLocalMetadataToStorage(100);
            }

            expect(provider.SaveCallCount).toBe(0);

            // Advance through the debounce window
            vi.advanceTimersByTime(150);

            expect(provider.SaveCallCount).toBe(1);
        });

        it('FlushPendingMetadataStorageSave cancels timer and runs save immediately', async () => {
            const provider = new TestDebouncedProvider(storage);

            provider.ScheduleSaveLocalMetadataToStorage(250);
            expect(provider.SaveCallCount).toBe(0);

            // Flush deterministically
            await provider.FlushPendingMetadataStorageSave();
            expect(provider.SaveCallCount).toBe(1);

            // Advancing time should not fire another save
            vi.advanceTimersByTime(300);
            expect(provider.SaveCallCount).toBe(1);
        });

        it('CancelPendingMetadataStorageSave clears timer without saving', () => {
            const provider = new TestDebouncedProvider(storage);

            provider.ScheduleSaveLocalMetadataToStorage(250);
            expect(provider.SaveCallCount).toBe(0);

            provider.CancelPendingMetadataStorageSave();

            vi.advanceTimersByTime(500);
            expect(provider.SaveCallCount).toBe(0);
        });

        it('serializes a second save when scheduled while a save is already in-flight', async () => {
            vi.useRealTimers(); // real timers for async promise delays
            const provider = new TestDebouncedProvider(storage);
            provider.SaveDelayMs = 40;

            // Trigger first save via flush so it becomes in-flight
            provider.ScheduleSaveLocalMetadataToStorage(10);
            const firstSavePromise = provider.FlushPendingMetadataStorageSave();

            // While save 1 is in-flight, schedule a second save
            provider.ScheduleSaveLocalMetadataToStorage(10);

            await firstSavePromise;

            // Wait a moment for trailing serialized save to complete
            await new Promise(r => setTimeout(r, 60));

            expect(provider.SaveCallCount).toBe(2);
        });

        it('short-circuits when persistence is disabled', () => {
            storage.SupportsCrossProcessPersistence = false;
            const provider = new TestDebouncedProvider(storage);

            provider.ScheduleSaveLocalMetadataToStorage(100);
            vi.advanceTimersByTime(200);

            expect(provider.SaveCallCount).toBe(0);
        });
    });
});
