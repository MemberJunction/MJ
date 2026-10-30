import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager, CacheCategory, CacheRowDeltaPayload } from '../generic/localCacheManager';
import { CompositeKey } from '../generic/compositeKey';
import { ILocalStorageProvider, LocalStorageWriteOptions } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * `ApplyRowChanges` maintains a cached RunView slot in place and asks the storage provider to
 * broadcast a compact `row_delta` (`pubSubAction` / `pubSubData` write options) instead of the
 * whole row array: only the mutated rows / deleted keys travel over pub/sub, while the storage
 * key still holds the full authoritative snapshot. These tests pin the payload contract from the
 * storage provider's side, with no Redis involved.
 */

function resetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

interface RecordedWrite { key: string; category?: string; value: unknown; options?: LocalStorageWriteOptions }

/** Minimal isolating store that records every SetItem's write options. */
class RecordingStorageProvider implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    public readonly writes: RecordedWrite[] = [];
    private store = new Map<string, unknown>();
    private k(key: string, category?: string): string { return `${category ?? 'default'}::${key}`; }
    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const v = this.store.get(this.k(key, category));
        return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
    }
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) out.set(key, await this.GetItem<T>(key, category));
        return out;
    }
    public async SetItem<T>(key: string, value: T, category?: string, options?: LocalStorageWriteOptions): Promise<void> {
        this.writes.push({ key, category, value: JSON.parse(JSON.stringify(value)), options });
        this.store.set(this.k(key, category), JSON.parse(JSON.stringify(value)));
    }
    public async Remove(key: string, category?: string): Promise<void> { this.store.delete(this.k(key, category)); }
    public async ClearCategory(category: string): Promise<void> {
        for (const k of Array.from(this.store.keys())) if (k.startsWith(`${category}::`)) this.store.delete(k);
    }
    public async GetCategoryKeys(category: string): Promise<string[]> {
        return Array.from(this.store.keys()).filter(k => k.startsWith(`${category}::`)).map(k => k.substring(category.length + 2));
    }
    public rowDeltaWrites(): RecordedWrite[] { return this.writes.filter(w => w.options?.pubSubAction === 'row_delta'); }
    public lastDelta(): CacheRowDeltaPayload {
        const w = this.rowDeltaWrites().at(-1);
        if (!w?.options?.pubSubData) throw new Error('no row_delta write recorded');
        return JSON.parse(w.options.pubSubData) as CacheRowDeltaPayload;
    }
}

const ENTITY = 'Test Entity';
const T0 = '2026-10-01T00:00:00.000Z';
const T1 = '2026-10-02T00:00:00.000Z';

function seedRows(count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, i) => ({ ID: `id-${i + 1}`, Name: `Row ${i + 1}`, __mj_UpdatedAt: T0 }));
}

function key(id: string): CompositeKey {
    return new CompositeKey([{ FieldName: 'ID', Value: id }]);
}

describe('LocalCacheManager.ApplyRowChanges — row_delta broadcast contract', () => {
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
        await cache.SetRunViewResult(fp, params, seedRows(3), T0, undefined, 3);
        storage.writes.length = 0;
    });

    it('an upsert writes the full snapshot to storage but broadcasts only the changed row', async () => {
        const changed = { ID: 'id-2', Name: 'Row 2 (edited)', __mj_UpdatedAt: T1 };
        expect(await cache.ApplyRowChanges(fp, [{ Key: key('id-2'), Row: changed }], T1)).toBe(true);

        const writes = storage.rowDeltaWrites();
        expect(writes).toHaveLength(1);
        expect(writes[0].key).toBe(fp);
        expect(writes[0].category).toBe(CacheCategory.RunViewCache);
        // storage still holds the whole authoritative array...
        const stored = writes[0].value as { results: Array<{ ID: string; Name: string }> };
        expect(stored.results.map(r => r.ID)).toEqual(['id-1', 'id-2', 'id-3']);
        expect(stored.results[1].Name).toBe('Row 2 (edited)');
        // ...while the broadcast carries just the delta
        const delta = storage.lastDelta();
        expect(delta.upsertedRows).toEqual([changed]);
        expect(delta.deletedPrimaryKeys).toEqual([]);
        expect(delta.primaryKeyFields).toEqual(['ID']);
        expect(delta.rowCount).toBe(3);
        expect(delta.totalRowCount).toBe(3);
        expect(delta.maxUpdatedAt).toBe(T1);
        expect(writes[0].options!.pubSubData!.length).toBeLessThan(JSON.stringify(stored).length);
    });

    it('an insert and a delete in one call broadcast one upserted row, one deleted key and the net rowCount', async () => {
        const inserted = { ID: 'id-9', Name: 'Row 9', __mj_UpdatedAt: T1 };
        await cache.ApplyRowChanges(fp, [{ Key: key('id-9'), Row: inserted }, { Key: key('id-1'), Row: null }], T1);
        const delta = storage.lastDelta();
        expect(delta.upsertedRows).toEqual([inserted]);
        expect(delta.deletedPrimaryKeys).toEqual([{ ID: 'id-1' }]);
        expect(delta.rowCount).toBe(3); // 3 - 1 + 1
        expect(delta.totalRowCount).toBe(3);
    });

    it('removing a key the slot does not hold changes nothing and broadcasts nothing', async () => {
        expect(await cache.ApplyRowChanges(fp, [{ Key: key('id-404'), Row: null }], T1)).toBe(true);
        expect(storage.writes).toHaveLength(0);
    });

    it('composite primary keys are carried per field in deletedPrimaryKeys and primaryKeyFields', async () => {
        const cfp = (cache as unknown as { GenerateRunViewFingerprint(p: RunViewParams): string }).GenerateRunViewFingerprint({ EntityName: 'Order Lines' });
        await cache.SetRunViewResult(cfp, { EntityName: 'Order Lines' }, [
            { OrderID: 'o1', LineNo: 1, Qty: 1, __mj_UpdatedAt: T0 },
            { OrderID: 'o1', LineNo: 2, Qty: 1, __mj_UpdatedAt: T0 },
        ], T0, undefined, 2);
        storage.writes.length = 0;
        const ck = new CompositeKey([{ FieldName: 'OrderID', Value: 'o1' }, { FieldName: 'LineNo', Value: 2 }]);
        await cache.ApplyRowChanges(cfp, [{ Key: ck, Row: null }], T1);
        const delta = storage.lastDelta();
        expect(delta.primaryKeyFields).toEqual(['OrderID', 'LineNo']);
        expect(delta.deletedPrimaryKeys).toEqual([{ OrderID: 'o1', LineNo: 2 }]);
        expect(delta.rowCount).toBe(1);
    });

    it('a slot that does not exist is not maintained: returns false and writes nothing', async () => {
        expect(await cache.ApplyRowChanges('Nope|_|_|-1|0|_|_', [{ Key: key('id-1'), Row: { ID: 'id-1' } }], T1)).toBe(false);
        expect(storage.writes).toHaveLength(0);
    });

    it('the schemaHash of the slot is carried forward on the delta so peers can validate it', async () => {
        const stored = (await storage.GetItem<{ schemaHash?: string }>(fp, CacheCategory.RunViewCache))!;
        await cache.ApplyRowChanges(fp, [{ Key: key('id-3'), Row: { ID: 'id-3', Name: 'x', __mj_UpdatedAt: T1 } }], T1);
        expect(storage.lastDelta().schemaHash).toBe(stored.schemaHash);
    });
});
