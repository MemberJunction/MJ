/**
 * RunQuery slots and the definition of the query that produced them.
 *
 * A saved query can be edited at runtime. Each RunQuery slot records the definition hash it was
 * written under, and a read that expects another definition is a miss. On a process-local store
 * the mismatched slot is deleted. On a store shared by several servers it is left in place, and
 * the reader holds back its own writes of the query's slots, the same policy as RunView schema
 * mismatches (a slot from a newer definition: no writes until this process catches up; any other:
 * at most one write per interval, the first one immediately). Slots are indexed by query ID so
 * every slot of one query can be found and deleted.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalCacheManager, CacheCategory, QueryDefinitionSignature } from '../generic/localCacheManager';
import { LocalStorageWriteOptions } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import * as logging from '../generic/logging';
import { GetGlobalObjectStore } from '@memberjunction/global';

/** Records write options and answers index-group lookups, the way the Redis provider does. */
class IndexedMockCacheStorageProvider extends MockCacheStorageProvider {
    public readonly writeOptions = new Map<string, LocalStorageWriteOptions | undefined>();
    private readonly groups = new Map<string, Set<string>>();

    override async SetItem<T>(key: string, value: T, category?: string, options?: LocalStorageWriteOptions): Promise<void> {
        await super.SetItem(key, value, category);
        this.writeOptions.set(key, options);
        if (options?.IndexGroup) {
            const groupKey = `${category}|${options.IndexGroup}`;
            const members = this.groups.get(groupKey) ?? new Set<string>();
            members.add(key);
            this.groups.set(groupKey, members);
        }
    }

    async GetIndexGroupKeys(category: string, group: string): Promise<string[]> {
        return [...(this.groups.get(`${category}|${group}`) ?? [])].filter(key => this.GetDirect(key, category) !== null);
    }
}

/** The same store, declared as shared across processes. */
class SharedIndexedMockCacheStorageProvider extends IndexedMockCacheStorageProvider {
    public readonly SharedAcrossProcesses = true;
}

interface StoredRunQuerySlot {
    results: unknown[];
    definitionHash?: string;
    definitionStamp?: string;
}

const QUERY_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const FP = `Revenue|${QUERY_ID}|_|{"__maxRows":-1,"__startRow":0}`;
const OLD: QueryDefinitionSignature = { QueryID: QUERY_ID, Hash: 'old-hash', Stamp: '2026-01-01T00:00:00.000Z' };
const NEW: QueryDefinitionSignature = { QueryID: QUERY_ID, Hash: 'new-hash', Stamp: '2026-02-01T00:00:00.000Z' };
const OLD_ROWS = [{ Version: 'old' }];
const NEW_ROWS = [{ Version: 'new' }];
const INTERVAL = LocalCacheManager.SCHEMA_MISMATCH_WRITE_INTERVAL_MS;

function resetLocalCacheManager(): void {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
}

/** A fresh, independent manager instance (the class is a singleton, so the global slot is cleared first). */
async function newManager(storage: MockCacheStorageProvider): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const manager = LocalCacheManager.Instance;
    await manager.Initialize(storage);
    return manager;
}

function storedSlot(storage: MockCacheStorageProvider, fingerprint: string = FP): StoredRunQuerySlot | null {
    return storage.GetDirect<StoredRunQuerySlot>(fingerprint, CacheCategory.RunQueryCache);
}

function write(manager: LocalCacheManager, rows: unknown[], definition?: QueryDefinitionSignature, fingerprint: string = FP): Promise<void> {
    return manager.SetRunQueryResult(fingerprint, 'Revenue', rows, '', rows.length, QUERY_ID, undefined, undefined, definition);
}

/** One server-side read under `definition`, writing back on a miss the way ProviderBase.RunQuery does. */
async function readThrough(manager: LocalCacheManager, definition: QueryDefinitionSignature, rows: unknown[]): Promise<void> {
    if (!(await manager.GetRunQueryResult(FP, definition))) {
        await write(manager, rows, definition);
    }
}

let now = 0;

/** Pins Date.now to a clock the test advances. */
function useClock(): void {
    now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
}

describe('LocalCacheManager RunQuery slots and query definitions', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('stores the definition hash and stamp with the slot and indexes it by query ID', async () => {
        const storage = new IndexedMockCacheStorageProvider();
        const manager = await newManager(storage);

        await write(manager, OLD_ROWS, OLD);

        expect(storedSlot(storage)?.definitionHash).toBe('old-hash');
        expect(storedSlot(storage)?.definitionStamp).toBe(OLD.Stamp);
        expect(storage.writeOptions.get(FP)?.IndexGroup).toBe(QUERY_ID.toLowerCase());
        expect((await manager.GetRunQueryResult(FP, OLD))?.definitionHash).toBe('old-hash');
    });

    it('serves a slot whose definition matches', async () => {
        const manager = await newManager(new IndexedMockCacheStorageProvider());
        await write(manager, OLD_ROWS, OLD);

        expect((await manager.GetRunQueryResult(FP, OLD))?.results).toEqual(OLD_ROWS);
    });

    it('treats a slot written under another definition as a miss and deletes it from a local store', async () => {
        const storage = new IndexedMockCacheStorageProvider();
        const manager = await newManager(storage);
        await write(manager, OLD_ROWS, OLD);

        expect(await manager.GetRunQueryResult(FP, NEW)).toBeNull();
        await vi.waitFor(() => expect(storedSlot(storage)).toBeNull());
    });

    it('treats a slot with no definition hash as a miss when a definition is expected', async () => {
        const storage = new IndexedMockCacheStorageProvider();
        const manager = await newManager(storage);
        storage.SetDirect(FP, { results: OLD_ROWS, maxUpdatedAt: '', rowCount: 1 }, CacheCategory.RunQueryCache);

        expect(await manager.GetRunQueryResult(FP, NEW)).toBeNull();
    });

    it('serves any slot when the caller expects no definition (a client, validated by the server)', async () => {
        const manager = await newManager(new IndexedMockCacheStorageProvider());
        await write(manager, OLD_ROWS, OLD);

        const cached = await manager.GetRunQueryResult(FP);
        expect(cached?.results).toEqual(OLD_ROWS);
        expect(cached?.definitionHash).toBe('old-hash');
        expect((await manager.GetRunQueryCacheStatus(FP))?.definitionHash).toBe('old-hash');
    });

    describe('on a shared store', () => {
        let storage: SharedIndexedMockCacheStorageProvider;

        beforeEach(() => {
            storage = new SharedIndexedMockCacheStorageProvider();
            useClock();
        });

        it('leaves a mismatched slot in place', async () => {
            const writer = await newManager(storage);
            await write(writer, OLD_ROWS, OLD);
            const reader = await newManager(storage);
            storage.resetCallCounts();

            expect(await reader.GetRunQueryResult(FP, NEW)).toBeNull();

            expect(storage.removeCallCount).toBe(0);
            expect(storedSlot(storage)?.definitionHash).toBe('old-hash');
        });

        it('replaces a slot from an older definition at once, then at most once per interval', async () => {
            const older = await newManager(storage);
            await write(older, OLD_ROWS, OLD);
            const newer = await newManager(storage);
            storage.resetCallCounts();

            await readThrough(newer, NEW, NEW_ROWS);
            expect(storedSlot(storage)?.definitionHash).toBe('new-hash');

            // The lagging server puts its rows back: it does not know its definition is older.
            storage.SetDirect(FP, { results: OLD_ROWS, maxUpdatedAt: '', definitionHash: 'old-hash', definitionStamp: OLD.Stamp }, CacheCategory.RunQueryCache);
            await readThrough(newer, NEW, NEW_ROWS);
            expect(storedSlot(storage)?.definitionHash).toBe('old-hash');

            now += INTERVAL;
            await readThrough(newer, NEW, NEW_ROWS);
            expect(storedSlot(storage)?.definitionHash).toBe('new-hash');
            expect(storage.removeCallCount).toBe(0);
        });

        it('stops writing the query while slots come from a newer definition, and resumes once it has it', async () => {
            const newer = await newManager(storage);
            await write(newer, NEW_ROWS, NEW);
            const older = await newManager(storage);
            storage.resetCallCounts();

            for (let i = 0; i < 3; i++) {
                await readThrough(older, OLD, OLD_ROWS);
                now += INTERVAL;
            }
            expect(storage.setCallCount).toBe(0);
            expect(storage.removeCallCount).toBe(0);

            // The edit reaches this process: its definition now matches the slot.
            expect((await older.GetRunQueryResult(FP, NEW))?.results).toEqual(NEW_ROWS);
            await write(older, [{ Version: 'newer-again' }], NEW);
            expect(storedSlot(storage)?.results).toEqual([{ Version: 'newer-again' }]);
        });

        it('ends a two-server exchange instead of overwriting on every read', async () => {
            const older = await newManager(storage);
            const newer = await newManager(storage);
            storage.resetCallCounts();

            for (let round = 0; round < 10; round++) {
                await readThrough(older, OLD, OLD_ROWS);
                await readThrough(newer, NEW, NEW_ROWS);
                now += INTERVAL / 4;
            }

            expect(storage.removeCallCount).toBe(0);
            // The older server fills the empty slot; the newer one replaces it at once; the older one
            // then finds a newer slot and stops writing, and the newer one hits.
            expect(storage.setCallCount).toBe(2);
            expect(storedSlot(storage)?.definitionHash).toBe('new-hash');
        });

        it('holds only the query whose slot mismatched', async () => {
            const newer = await newManager(storage);
            await write(newer, NEW_ROWS, NEW);
            const older = await newManager(storage);
            await older.GetRunQueryResult(FP, OLD);

            const otherFP = `Other|BBBBBBBB-0000-0000-0000-000000000002|_|_`;
            await older.SetRunQueryResult(otherFP, 'Other', OLD_ROWS, '', 1, 'BBBBBBBB-0000-0000-0000-000000000002', undefined, undefined,
                { QueryID: 'BBBBBBBB-0000-0000-0000-000000000002', Hash: 'h' });
            expect(storedSlot(storage, otherFP)?.results).toEqual(OLD_ROWS);
        });

        it('logs a given mismatch once per process', async () => {
            const newer = await newManager(storage);
            await write(newer, NEW_ROWS, NEW);
            const older = await newManager(storage);
            const warn = vi.spyOn(logging, 'LogWarning');

            for (let i = 0; i < 5; i++) {
                await older.GetRunQueryResult(FP, OLD);
            }

            const staleWarnings = warn.mock.calls.filter(([message]) => String(message).includes('[CACHE-QUERY-DEFINITION-STALE]'));
            expect(staleWarnings).toHaveLength(1);
        });
    });

    describe('InvalidateRunQueryResultsForQuery', () => {
        it('deletes every slot of the query this process wrote, and no other query\'s', async () => {
            const storage = new IndexedMockCacheStorageProvider();
            const manager = await newManager(storage);
            const byId = `Unknown|${QUERY_ID}|_|{"a":1}`;
            const byName = `Revenue|${QUERY_ID}|_|{"a":2}`;
            const other = `Other|BBBBBBBB-0000-0000-0000-000000000002|_|_`;
            await write(manager, OLD_ROWS, OLD, byId);
            await write(manager, OLD_ROWS, OLD, byName);
            await manager.SetRunQueryResult(other, 'Other', OLD_ROWS, '', 1, 'BBBBBBBB-0000-0000-0000-000000000002');

            const removed = await manager.InvalidateRunQueryResultsForQuery(QUERY_ID.toLowerCase());

            expect(removed).toBe(2);
            expect(storedSlot(storage, byId)).toBeNull();
            expect(storedSlot(storage, byName)).toBeNull();
            expect(storedSlot(storage, other)).not.toBeNull();
        });

        it('finds slots another process wrote to a shared store', async () => {
            const storage = new SharedIndexedMockCacheStorageProvider();
            const writer = await newManager(storage);
            await write(writer, OLD_ROWS, OLD);
            const other = await newManager(storage);

            expect(await other.InvalidateRunQueryResultsForQuery(QUERY_ID)).toBe(1);
            expect(storedSlot(storage)).toBeNull();
        });
    });
});
