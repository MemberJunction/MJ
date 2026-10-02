/**
 * The metadata snapshot is skipped for a local-storage provider that cannot outlive the process.
 *
 * ProviderBase persists a snapshot of ALL metadata (JSON.stringify + gzip + base64) to its local
 * storage provider after every load, and reads it back on every staleness check. For an in-process
 * store (InMemoryLocalStorageProvider — what a server uses without Redis) nothing can ever read that
 * snapshot back except the heap that already holds the live objects: on a large tenant it cost ~10 s
 * and ~1.2 GB of transient heap per refresh. These tests pin:
 *   - InMemoryLocalStorageProvider declares SupportsCrossProcessPersistence = false, and for such a
 *     store neither the save nor the load touches it;
 *   - a store that does not declare the flag (Redis, browser storage) still saves and loads;
 *   - a staleness check re-reads the snapshot only on a cold start;
 *   - the base64 helpers use Node's native codec and round-trip exactly.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { ILocalStorageProvider } from '../generic/interfaces';
import { InMemoryLocalStorageProvider } from '../generic/InMemoryLocalStorageProvider';
import { EntityInfo } from '../generic/entityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

type Op = [string, string | string[]];

/** A serializing store that does NOT declare SupportsCrossProcessPersistence (the Redis/browser shape). */
class PersistentSpyStorage implements ILocalStorageProvider {
    public ops: Op[] = [];
    private map = new Map<string, string>();
    async GetItem(key: string): Promise<string | null> { this.ops.push(['get', key]); return this.map.get(key) ?? null; }
    async GetItems(keys: string[]): Promise<Map<string, string | null>> {
        this.ops.push(['getMany', keys]);
        return new Map(keys.map(k => [k, this.map.get(k) ?? null]));
    }
    async SetItem(key: string, value: string): Promise<void> { this.ops.push(['set', key]); this.map.set(key, value); }
    async Remove(key: string): Promise<void> { this.ops.push(['remove', key]); this.map.delete(key); }
}

/** The real in-process store, with every read and write recorded. */
class InProcessSpyStorage extends InMemoryLocalStorageProvider {
    public ops: Op[] = [];
    override async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> { this.ops.push(['get', key]); return super.GetItem<T>(key, category); }
    override async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> { this.ops.push(['getMany', keys]); return super.GetItems<T>(keys, category); }
    override async SetItem<T = unknown>(key: string, value: T, category?: string): Promise<void> { this.ops.push(['set', key]); return super.SetItem<T>(key, value, category); }
}

class SnapshotProvider extends TestMetadataProvider {
    constructor(private readonly ls: ILocalStorageProvider) { super(); }
    public override get LocalStorageProvider(): ILocalStorageProvider { return this.ls; }
    public get SnapshotEnabled(): boolean { return this.MetadataSnapshotPersistenceEnabled; }
    public load(): Promise<void> { return this.LoadLocalMetadataFromStorage(); }
    public static encode(b: ArrayBuffer): string { return ProviderBase.arrayBufferToBase64(b); }
    public static decode(s: string): ArrayBuffer { return ProviderBase.base64ToArrayBuffer(s); }
    /** Puts one entity in memory, i.e. a warm process. */
    public warm(): this {
        (this as unknown as { _localMetadata: { AllEntities: EntityInfo[] } })._localMetadata.AllEntities =
            [new EntityInfo({ ID: 'e1', Name: 'Kept' })];
        return this;
    }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('metadata snapshot persistence', () => {
    it('InMemoryLocalStorageProvider declares that it does not outlive the process', () => {
        expect(new InMemoryLocalStorageProvider().SupportsCrossProcessPersistence).toBe(false);
    });

    it('an in-process store gets no snapshot write and no snapshot read', async () => {
        const ls = new InProcessSpyStorage();
        const p = new SnapshotProvider(ls).warm();
        expect(p.SnapshotEnabled).toBe(false);
        await p.SaveLocalMetadataToStorage();
        expect(ls.ops).toEqual([]);
        await p.load();
        expect(ls.ops).toEqual([]);
    });

    it('a store that does not declare the flag still saves and loads the snapshot', async () => {
        const ls = new PersistentSpyStorage();
        const p = new SnapshotProvider(ls).warm();
        expect(p.SnapshotEnabled).toBe(true);
        await p.SaveLocalMetadataToStorage();
        expect(ls.ops.some(o => o[0] === 'set')).toBe(true);
        ls.ops = [];
        await p.load();
        expect(ls.ops.some(o => o[0] === 'get' || o[0] === 'getMany')).toBe(true);
    });

    it('a staleness check with metadata in memory does not re-read the snapshot', async () => {
        const p = new SnapshotProvider(new PersistentSpyStorage()).warm();
        const load = vi.spyOn(p as unknown as { LoadLocalMetadataFromStorage: () => Promise<void> }, 'LoadLocalMetadataFromStorage');
        await p.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(load).not.toHaveBeenCalled();
    });

    it('a cold staleness check (nothing in memory) still reads the snapshot', async () => {
        const p = new SnapshotProvider(new PersistentSpyStorage());
        const load = vi.spyOn(p as unknown as { LoadLocalMetadataFromStorage: () => Promise<void> }, 'LoadLocalMetadataFromStorage');
        await p.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('the base64 helpers use the native codec and round-trip exactly', () => {
        const bytes = new Uint8Array(70_000);
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 255;
        vi.stubGlobal('atob', () => { throw new Error('atob called'); });
        vi.stubGlobal('btoa', () => { throw new Error('btoa called'); });

        const encoded = SnapshotProvider.encode(bytes.buffer);
        const decoded = SnapshotProvider.decode(encoded);

        expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
        expect(decoded).toBeInstanceOf(ArrayBuffer);
        expect(decoded.byteLength).toBe(bytes.length); // the payload, not Buffer's pooled slab
        expect(Buffer.from(decoded).equals(Buffer.from(bytes))).toBe(true);
    });
});
