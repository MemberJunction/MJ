/**
 * Entity-event batches (plan N11): saves and deletes raised through a provider with an open batch
 * are applied to each cached slot once, when the batch closes — and not at all when it fails.
 *
 * Before this, a bulk unit of work of N saves rewrote (and on a shared cache, republished) every
 * slot for the entity N times.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore, MJEventType, MJGlobal } from '@memberjunction/global';
import { LocalCacheManager } from '../generic/localCacheManager';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import { RunInEntityTransaction } from '../generic/entityTransactionScope';
import { EntityEventBatch, MAX_BUFFERED_ENTITY_CHANGES } from '../generic/entityEventBatch';
import type { BufferedEntityChange } from '../generic/entityEventBatch';
import type { EntityInfo } from '../generic/entityInfo';
import { RunViewParams } from '../views/runView';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import type { BaseEntityEvent } from '../generic/baseEntity';
import type { UserInfo } from '../generic/securityInfo';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

const ENTITY = 'Widgets';
const UNFILTERED = `${ENTITY}|_|_|-1|0|_|_`;
const FILTERED = `${ENTITY}|Color='red'|_|-1|0|_|_`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;
const ENTITY_INFO = { Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }], AllowCaching: true };

type Row = Record<string, unknown>;

/** A stand-in for the provider entities save through; batches are keyed on it. */
function newOwner(): object {
    return { name: 'provider' };
}

function raise(owner: object, type: 'save' | 'delete', fields: Row): Row {
    const live: Row = { ...fields };
    MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        component: null,
        args: {
            type,
            payload: type === 'delete' ? { OldValues: { ...fields } } : null,
            baseEntity: { EntityInfo: ENTITY_INFO, ProviderToUse: owner, GetAll: () => ({ ...live }) },
        },
    });
    return live;
}

/** Lets fire-and-forget event handlers finish. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

function key(id: string): CompositeKey {
    const k = new CompositeKey();
    k.KeyValuePairs = [{ FieldName: 'ID', Value: id }];
    return k;
}

describe('LocalCacheManager entity-event batches', () => {
    let manager: LocalCacheManager;
    let storage: MockCacheStorageProvider;
    let slotWrites: string[];

    async function rows(fingerprint: string): Promise<Row[] | null> {
        const cached = await manager.GetRunViewResult(fingerprint);
        return cached ? (cached.results as Row[]).map(r => ({ ...r })).sort((a, b) => String(a.ID).localeCompare(String(b.ID))) : null;
    }

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        storage = new MockCacheStorageProvider();
        await manager.Initialize(storage);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one' }, { ID: '2', Name: 'two' }], '');
        slotWrites = [];
        const original = storage.SetItem.bind(storage);
        vi.spyOn(storage, 'SetItem').mockImplementation(async (k: string, v: string, c?: string) => {
            if (k.startsWith(ENTITY)) {
                slotWrites.push(k);
            }
            return original(k, v, c);
        });
    });

    it('without a batch, every save rewrites the slot (the behaviour batches replace)', async () => {
        const owner = newOwner();
        raise(owner, 'save', { ID: '3', Name: 'three' });
        raise(owner, 'save', { ID: '4', Name: 'four' });
        raise(owner, 'save', { ID: '5', Name: 'five' });
        await settle();
        expect(slotWrites).toHaveLength(3);
    });

    it('applies all saves and deletes of a batch in one write when it closes', async () => {
        const owner = newOwner();
        manager.BeginEntityEventBatch(owner);
        expect(manager.IsBatchingEntityEvents(owner)).toBe(true);
        raise(owner, 'save', { ID: '3', Name: 'three' });
        raise(owner, 'save', { ID: '1', Name: 'one, renamed' });
        raise(owner, 'delete', { ID: '2', Name: 'two' });
        raise(owner, 'save', { ID: '4', Name: 'four' });
        raise(owner, 'delete', { ID: '4', Name: 'four' });
        await settle();
        expect(slotWrites).toHaveLength(0);

        await manager.EndEntityEventBatch(owner, true);

        expect(manager.IsBatchingEntityEvents(owner)).toBe(false);
        expect(slotWrites).toEqual([UNFILTERED]);
        expect(await rows(UNFILTERED)).toEqual([{ ID: '1', Name: 'one, renamed' }, { ID: '3', Name: 'three' }]);
    });

    it('keeps the values a record had when its event was raised', async () => {
        const owner = newOwner();
        manager.BeginEntityEventBatch(owner);
        const live = raise(owner, 'save', { ID: '3', Name: 'as saved' });
        live.Name = 'changed later, never saved';
        await manager.EndEntityEventBatch(owner, true);
        expect((await rows(UNFILTERED))?.find(r => r.ID === '3')?.Name).toBe('as saved');
    });

    it('invalidates the affected slots instead of writing rows when the batch failed', async () => {
        const owner = newOwner();
        manager.BeginEntityEventBatch(owner);
        raise(owner, 'save', { ID: '3', Name: 'rolled back' });
        await manager.EndEntityEventBatch(owner, false);
        expect(slotWrites).toHaveLength(0);
        expect(await rows(UNFILTERED)).toBeNull();
    });

    it('applies once, at the outermost close; a failed inner level fails the whole batch', async () => {
        const owner = newOwner();
        manager.BeginEntityEventBatch(owner);
        manager.BeginEntityEventBatch(owner);
        raise(owner, 'save', { ID: '3', Name: 'three' });
        await manager.EndEntityEventBatch(owner, true);
        expect(manager.IsBatchingEntityEvents(owner)).toBe(true);
        expect(slotWrites).toHaveLength(0);
        await manager.EndEntityEventBatch(owner, true);
        expect(slotWrites).toEqual([UNFILTERED]);

        const second = newOwner();
        manager.BeginEntityEventBatch(second);
        manager.BeginEntityEventBatch(second);
        raise(second, 'save', { ID: '9', Name: 'nine' });
        await manager.EndEntityEventBatch(second, false);
        await manager.EndEntityEventBatch(second, true);
        expect(await rows(UNFILTERED)).toBeNull();
    });

    it('does not hold back saves made through a different provider', async () => {
        const batching = newOwner();
        const other = newOwner();
        manager.BeginEntityEventBatch(batching);
        raise(other, 'save', { ID: '3', Name: 'three' });
        await settle();
        expect(slotWrites).toEqual([UNFILTERED]);
        await manager.EndEntityEventBatch(batching, true);
        expect(slotWrites).toEqual([UNFILTERED]);
    });

    it('invalidates a filtered slot once for saves, and removes deleted rows from it in one write', async () => {
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Color: 'red' }, { ID: '2', Color: 'red' }], '');
        slotWrites.length = 0;

        const deletesOnly = newOwner();
        manager.BeginEntityEventBatch(deletesOnly);
        raise(deletesOnly, 'delete', { ID: '1' });
        raise(deletesOnly, 'delete', { ID: '2' });
        await manager.EndEntityEventBatch(deletesOnly, true);
        expect(slotWrites.filter(k => k === FILTERED)).toHaveLength(1);
        expect(await rows(FILTERED)).toEqual([]);

        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Color: 'red' }], '');
        slotWrites.length = 0;
        const withSave = newOwner();
        manager.BeginEntityEventBatch(withSave);
        raise(withSave, 'save', { ID: '5', Color: 'blue' });
        raise(withSave, 'delete', { ID: '1' });
        await manager.EndEntityEventBatch(withSave, true);
        expect(slotWrites.filter(k => k === FILTERED)).toHaveLength(0);
        expect(await rows(FILTERED)).toBeNull();
    });

    it('RunInEntityEventBatch applies on success and fails the batch when the work throws', async () => {
        const owner = newOwner();
        const result = await manager.RunInEntityEventBatch(owner, async () => {
            raise(owner, 'save', { ID: '3', Name: 'three' });
            raise(owner, 'save', { ID: '4', Name: 'four' });
            return 'done';
        });
        expect(result).toBe('done');
        expect(slotWrites).toEqual([UNFILTERED]);

        await expect(manager.RunInEntityEventBatch(owner, async () => {
            raise(owner, 'save', { ID: '5', Name: 'five' });
            throw new Error('boom');
        })).rejects.toThrow('boom');
        expect(await rows(UNFILTERED)).toBeNull();
    });

    it('while a batch holds changes for an entity, its slots read as misses and fills are not stored', async () => {
        const owner = newOwner();
        manager.BeginEntityEventBatch(owner);
        expect(await manager.GetRunViewResult(UNFILTERED)).not.toBeNull(); // nothing pending yet

        raise(owner, 'save', { ID: '3', Name: 'three' });
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        expect((await manager.GetRunViewResults([UNFILTERED])).get(UNFILTERED)).toBeNull();
        expect(await manager.GetRunViewResult(`widgets|_|_|-1|0|_|_`)).toBeNull(); // entity names are case-insensitive
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '3', Color: 'red' }], '');
        expect(slotWrites).toHaveLength(0);

        const unrelated = 'Gadgets|_|_|-1|0|_|_';
        await manager.SetRunViewResult(unrelated, { EntityName: 'Gadgets' } as RunViewParams, [{ ID: 'g' }], '');
        expect(await manager.GetRunViewResult(unrelated)).not.toBeNull();

        await manager.EndEntityEventBatch(owner, true);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3']);
    });

    it('keeps an entity pending until every batch holding changes for it has closed', async () => {
        const first = newOwner();
        const second = newOwner();
        manager.BeginEntityEventBatch(first);
        manager.BeginEntityEventBatch(second);
        raise(first, 'save', { ID: '3', Name: 'three' });
        raise(second, 'save', { ID: '4', Name: 'four' });
        await manager.EndEntityEventBatch(first, true);
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        await manager.EndEntityEventBatch(second, true);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3', '4']);
    });

    it('ApplyRowChanges does not write when it only removes rows the slot does not hold', async () => {
        const done = await manager.ApplyRowChanges(UNFILTERED, [{ Key: key('404'), Row: null }], '');
        expect(done).toBe(true);
        expect(slotWrites).toHaveLength(0);
    });
});

describe('DatabaseProviderBase transactions batch cache maintenance', () => {
    /** Emulates depth counting; borrows the real BeginEntityTransaction. */
    class TransactionalProvider {
        public FailCommit = false;
        private depth = 0;
        public get SupportsEntityTransactions(): boolean { return true; }
        public get IsInTransaction(): boolean { return false; }
        public get CurrentTransactionDepth(): number { return this.depth; }
        public async BeginTransaction(): Promise<void> { this.depth++; }
        public async CommitTransaction(): Promise<void> {
            this.depth--;
            if (this.FailCommit) {
                throw new Error('commit failed');
            }
        }
        public async RollbackTransaction(): Promise<void> { this.depth--; }
        public BeginEntityTransaction = DatabaseProviderBase.prototype.BeginEntityTransaction;
    }

    let manager: LocalCacheManager;
    let storage: MockCacheStorageProvider;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        storage = new MockCacheStorageProvider();
        await manager.Initialize(storage);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one' }], '');
    });

    it('writes the slot once, after commit, for all saves in the transaction', async () => {
        const provider = new TransactionalProvider();
        const setItem = vi.spyOn(storage, 'SetItem');
        await RunInEntityTransaction(provider, async () => {
            for (let i = 2; i <= 6; i++) {
                raise(provider, 'save', { ID: String(i), Name: `row ${i}` });
            }
            await settle();
            expect(setItem.mock.calls.filter(c => c[0] === UNFILTERED)).toHaveLength(0);
        });
        expect(setItem.mock.calls.filter(c => c[0] === UNFILTERED)).toHaveLength(1);
        expect((await manager.GetRunViewResult(UNFILTERED))?.results).toHaveLength(6);
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
    });

    it('leaves no uncommitted rows in the cache when the transaction rolls back', async () => {
        const provider = new TransactionalProvider();
        await expect(RunInEntityTransaction(provider, async () => {
            raise(provider, 'save', { ID: '2', Name: 'never committed' });
            throw new Error('work failed');
        })).rejects.toThrow('work failed');
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
    });

    it('treats a failed commit as a failure and still closes the batch', async () => {
        const provider = new TransactionalProvider();
        provider.FailCommit = true;
        await expect(RunInEntityTransaction(provider, async () => {
            raise(provider, 'save', { ID: '2', Name: 'commit failed' });
        })).rejects.toThrow('commit failed');
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
    });
});

describe('an owner released with a batch still open', () => {
    /**
     * A provider that does NOT inherit GenericDatabaseProvider's transaction machinery: its
     * rollback fails and its ResetTransactionState is the base-class no-op. Without the abandon in
     * ReleaseIndependentInstance the batch stays open forever — and because the batch map is weak
     * while the pending-entity counts are strong, it becomes unreachable *and* permanent: every
     * cached read of those entities misses and every fill is skipped for the life of the process
     * (plan §16.3 #5). MetadataSync's graph-provider pool releases instances exactly this way.
     */
    class ReleasableProvider {
        public depth = 1;
        public get TransactionDepth(): number { return this.depth; }
        public get CurrentTransactionDepth(): number { return this.depth; }
        public async RollbackTransaction(): Promise<void> { throw new Error('connection is gone'); }
        public async ResetTransactionState(): Promise<void> { /* base-class no-op */ }
        public ReleaseIndependentInstance = DatabaseProviderBase.prototype.ReleaseIndependentInstance;
    }

    let manager: LocalCacheManager;
    let storage: MockCacheStorageProvider;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        storage = new MockCacheStorageProvider();
        await manager.Initialize(storage);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one' }], '');
    });

    it('closes the batch even when the rollback fails and the reset is a no-op', async () => {
        const provider = new ReleasableProvider();
        manager.BeginEntityEventBatch(provider);
        raise(provider, 'save', { ID: '2', Name: 'unknown outcome' });
        await settle();
        expect(manager.IsBatchingEntityEvents(provider)).toBe(true);

        await provider.ReleaseIndependentInstance();
        await settle();

        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
        // The entity is no longer pending, so the cache works again for it.
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one' }], '');
        expect(await manager.GetRunViewResult(UNFILTERED)).not.toBeNull();
    });
});

describe('EntityEventBatch', () => {
    it('stops recording rows past the size limit and then asks for invalidation', () => {
        const batch = new EntityEventBatch();
        const change: BufferedEntityChange = {
            EntityInfo: ENTITY_INFO as unknown as EntityInfo, Type: 'save', Key: key('1'), Record: { ID: '1' },
        };
        for (let i = 0; i < MAX_BUFFERED_ENTITY_CHANGES; i++) {
            batch.Add(change);
        }
        expect(batch.CanApplyRows).toBe(true);
        batch.Add(change);
        expect(batch.CanApplyRows).toBe(false);
        expect(batch.Changes).toHaveLength(0);
        expect([...batch.TouchedEntities.keys()]).toEqual([ENTITY]);
    });
});

describe('BaseEngine slot sync inside a batch', () => {
    class SyncEngine extends BaseEngine<SyncEngine> {
        public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
            // not loaded in this test
        }
        public Sync(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> {
            return this.syncLocalCacheForConfig(config, event);
        }
    }

    it('leaves the slot to the batch while one is open for the entity\'s provider', async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(new MockCacheStorageProvider());
        const upsert = vi.spyOn(manager, 'UpsertSingleEntity').mockResolvedValue(true);
        const owner = newOwner();
        const event = {
            type: 'save',
            baseEntity: { ProviderToUse: owner, PrimaryKey: key('1'), Get: () => null, GetAll: () => ({ ID: '1' }) },
        } as unknown as BaseEntityEvent;
        const config = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: ENTITY, PropertyName: '_items', CacheLocal: true });
        const engine = new SyncEngine();

        manager.BeginEntityEventBatch(owner);
        await engine.Sync(config, event);
        expect(upsert).not.toHaveBeenCalled();

        await manager.EndEntityEventBatch(owner, true);
        await engine.Sync(config, event);
        expect(upsert).toHaveBeenCalledOnce();
    });
});
