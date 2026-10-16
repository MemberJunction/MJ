import { describe, it, expect, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import type { PostCommitTask, PostCommitToken } from '../generic/databaseProviderBase';
import { UserInfo } from '../generic/securityInfo';
import { DatasetReadOptions, DatasetResultType, IEntityDataProvider, IMetadataProvider, ProviderType } from '../generic/interfaces';

/**
 * An event-driven engine reload runs detached from the write that raised the event. A transaction another unit of
 * work opens on the same provider while the reload is in flight is not the reload's, so the reload's dataset reads
 * must run on the pool (`DatasetReadOptions.ReadOnPool`). BaseEngine.Load carries the read options through to the
 * provider's GetDatasetByName, including on a forced reload queued behind a load in flight.
 */

/** What the provider double's GetDatasetByName was asked for. */
interface DatasetRead { Name: string; ForceRefresh: boolean | undefined; ReadOptions: Readonly<DatasetReadOptions> | undefined }

/** A client-side provider double: GetDatasetByName answers a two-item dataset and records how it was called. */
function datasetProvider(reads: DatasetRead[]): IMetadataProvider {
    const result: DatasetResultType = {
        DatasetID: 'ds-1', DatasetName: 'Template_Metadata', Success: true, Status: '', LatestUpdateDate: new Date(),
        Results: [
            { Code: 'Templates', EntityName: 'MJ: Templates', EntityID: 'e-1', Results: [] },
            { Code: 'TemplateContents', EntityName: ' MJ: Template Contents ', EntityID: 'e-2', Results: [] },
        ],
    };
    const provider: Pick<IMetadataProvider, 'ProviderType' | 'InstanceConnectionString' | 'GetDatasetByName' | 'CacheDataset' | 'GetAndCacheDatasetByName'> = {
        ProviderType: ProviderType.Network,
        InstanceConnectionString: 'test://event-reload',
        GetDatasetByName: async (name, _filters, _user, _providerToUse, forceRefresh, readOptions) => {
            reads.push({ Name: name, ForceRefresh: forceRefresh, ReadOptions: readOptions });
            return result;
        },
        CacheDataset: async () => undefined,
        GetAndCacheDatasetByName: async () => result,
    };
    // a Pick double: the load path calls only the members picked above
    return provider as IMetadataProvider;
}

/** A provider whose first dataset read waits until the test releases it, so later forced reloads queue behind it. */
function heldProvider(reads: DatasetRead[]): { Provider: IMetadataProvider; FirstReadStarted: Promise<void>; Release: () => void } {
    const inner = datasetProvider(reads);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let started: () => void = () => undefined;
    const firstReadStarted = new Promise<void>((resolve) => { started = resolve; });
    let first = true;
    const provider: Pick<IMetadataProvider, 'ProviderType' | 'InstanceConnectionString' | 'GetDatasetByName' | 'CacheDataset' | 'GetAndCacheDatasetByName'> = {
        ProviderType: inner.ProviderType,
        InstanceConnectionString: 'test://event-reload-held',
        GetDatasetByName: async (name, filters, user, providerToUse, forceRefresh, readOptions) => {
            const result = await inner.GetDatasetByName(name, filters, user, providerToUse, forceRefresh, readOptions);
            if (first) {
                first = false;
                started();
                await held;
            }
            return result;
        },
        CacheDataset: inner.CacheDataset.bind(inner),
        GetAndCacheDatasetByName: inner.GetAndCacheDatasetByName.bind(inner),
    };
    // a Pick double: the load path calls only the members picked above
    return { Provider: provider as IMetadataProvider, FirstReadStarted: firstReadStarted, Release: release };
}

/** An engine with one dataset config, whose loads the test drives directly. */
class DatasetEngine extends BaseEngine<DatasetEngine> {
    public static readonly CONFIGS = [new BaseEnginePropertyConfig({ Type: 'dataset', DatasetName: 'Template_Metadata', PropertyName: '_metadata' })];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (!provider) {
            throw new Error('DatasetEngine loads through the provider each test passes');
        }
        await this.Load(DatasetEngine.CONFIGS, provider, forceRefresh, contextUser);
    }

    /** An event-driven reload, as TemplateEngineBase.ReloadTemplates makes it. */
    public EventReload(provider: IMetadataProvider): Promise<void> {
        return this.Load(DatasetEngine.CONFIGS, provider, true, undefined, { ReadOnPool: true });
    }

    public EntityNames(): ReadonlySet<string> {
        return this.DatasetEntityNames();
    }

    public Defer(event: BaseEntityEvent, task: () => Promise<void>): Promise<void> {
        return this.RunAfterCommitOrNow(event, 'test task', task);
    }
}

function freshEngine(): DatasetEngine {
    const store = GetGlobalObjectStore();
    if (store) {
        delete store[`___SINGLETON__${DatasetEngine.name}`];
    }
    return new DatasetEngine();
}

/** A database provider that records can be bound to (what `GenericDatabaseProvider` is). */
type EntityDatabaseProvider = DatabaseProviderBase & IEntityDataProvider;

/**
 * A database provider double at a given transaction depth, with a post-commit queue the test runs. `member` says
 * whether the caller belongs to the open transaction: like GenericDatabaseProvider, a non-member (or a caller with no
 * transaction open) gets a token whose epoch is null.
 */
function providerAtDepth(depth: number, member: boolean = true): { provider: EntityDatabaseProvider; commit: () => Promise<void>; queuedCount: () => number } {
    const queued: PostCommitTask[] = [];
    const provider: EntityDatabaseProvider = Object.create(DatabaseProviderBase.prototype);
    // the entity-data members a record bound to the provider could call; the handler under test never does
    const notUsed = async (): Promise<never> => { throw new Error('not used by these tests'); };
    provider.Load = notUsed;
    provider.Save = notUsed;
    provider.Delete = notUsed;
    provider.GetRecordChanges = notUsed;
    Object.defineProperty(provider, 'TransactionDepth', { get: () => depth });
    provider.CapturePostCommitToken = (): PostCommitToken =>
        depth > 0 && member ? { Epoch: 1, FrameIds: Array.from({ length: depth }, (_, i) => i + 1) } : { Epoch: null, FrameIds: [] };
    provider.RunAfterCommit = (task: PostCommitTask) => { queued.push(task); };
    return { provider, commit: async () => { for (const t of queued.splice(0)) await t(); }, queuedCount: () => queued.length };
}

/**
 * A database provider at transaction depth 1 whose first dataset read is held (see {@link heldProvider}); `member` says
 * whether the caller belongs to the open transaction.
 */
function heldDatabaseProvider(member: boolean): { Provider: IMetadataProvider; FirstReadStarted: Promise<void>; Release: () => void } {
    const gate = heldProvider([]);
    const { provider } = providerAtDepth(1, member);
    const metadata: Pick<IMetadataProvider, 'InstanceConnectionString' | 'GetDatasetByName' | 'CacheDataset' | 'GetAndCacheDatasetByName'> = {
        InstanceConnectionString: gate.Provider.InstanceConnectionString,
        GetDatasetByName: gate.Provider.GetDatasetByName.bind(gate.Provider),
        CacheDataset: gate.Provider.CacheDataset.bind(gate.Provider),
        GetAndCacheDatasetByName: gate.Provider.GetAndCacheDatasetByName.bind(gate.Provider),
    };
    Object.assign(provider, metadata);
    // a client-side provider type, so the loads need no context user
    Object.defineProperty(provider, 'ProviderType', { get: () => ProviderType.Network });
    return { Provider: provider, FirstReadStarted: gate.FirstReadStarted, Release: gate.Release };
}

/** The entity of the saves below; the handler reads only the saving record's provider. */
const RECORDS = new EntityInfo({ ID: 'ent-records', Name: 'Records', Fields: [] });

/** A record of {@link RECORDS}. */
class SavedRecord extends BaseEntity {}

/** A save event raised by a record bound to `provider`. */
function saveOn(provider: EntityDatabaseProvider): BaseEntityEvent {
    return { type: 'save', baseEntity: new SavedRecord(RECORDS, provider), payload: null };
}

describe('BaseEngine: event-driven reloads read on the pool', () => {
    it('passes the reload\'s read options to the provider\'s dataset read', async () => {
        const reads: DatasetRead[] = [];
        const engine = freshEngine();
        await engine.EventReload(datasetProvider(reads));
        expect(reads).toEqual([{ Name: 'Template_Metadata', ForceRefresh: true, ReadOptions: { ReadOnPool: true } }]);
    });

    it('keeps the read options on a forced reload queued behind a load in flight', async () => {
        const reads: DatasetRead[] = [];
        const provider = datasetProvider(reads);
        const engine = freshEngine();
        const first = engine.Config(true, undefined, provider);
        const queued = engine.EventReload(provider);
        await Promise.all([first, queued]);
        expect(reads.map((r) => r.ReadOptions)).toEqual([undefined, { ReadOnPool: true }]);
    });

    it('keeps the pool reads when a plain forced reload is queued after an event reload', async () => {
        const reads: DatasetRead[] = [];
        const gate = heldProvider(reads);
        const engine = freshEngine();
        const inFlight = engine.Config(true, undefined, gate.Provider); // holds its read until released
        await gate.FirstReadStarted;
        const queued = [engine.EventReload(gate.Provider), engine.Config(true, undefined, gate.Provider)];
        gate.Release();
        await Promise.all([inFlight, ...queued]);
        expect(reads.map((r) => r.ReadOptions)).toEqual([undefined, { ReadOnPool: true }]);
    });

    /** Starts an event reload held at its read on a loaded engine, then a plain load; returns whether that settled first. */
    async function plainLoadSettlesDuringReload(member: boolean): Promise<boolean> {
        const gate = heldDatabaseProvider(member);
        const engine = freshEngine();
        await engine.Config(false, undefined, gate.Provider);
        const reload = engine.EventReload(gate.Provider); // holds its read until released
        await gate.FirstReadStarted;
        let settled = false;
        const plain = engine.Config(false, undefined, gate.Provider).then(() => { settled = true; });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const settledFirst = settled;
        gate.Release();
        await Promise.all([reload, plain]);
        return settledFirst;
    }

    it('does not make a plain load inside a transaction wait for an event reload in flight', async () => {
        // the reload's pool read may be waiting on the row locks of the caller's transaction
        expect(await plainLoadSettlesDuringReload(true)).toBe(true);
    });

    it('makes a plain load outside a transaction wait for an event reload in flight', async () => {
        expect(await plainLoadSettlesDuringReload(false)).toBe(false);
    });

    it('reads the dataset\'s entity names from the dataset itself, lower-cased and trimmed', async () => {
        const engine = freshEngine();
        expect(engine.EntityNames().size).toBe(0);
        await engine.EventReload(datasetProvider([]));
        expect([...engine.EntityNames()].sort()).toEqual(['mj: template contents', 'mj: templates']);
    });
});

describe('BaseEngine.RunAfterCommitOrNow', () => {
    it('runs the task now, awaited, when a transaction is open but the caller is not a member of it', async () => {
        // the caller's write ran on the pool and is durable; deferring it would leave the cache stale after its save
        const { provider, queuedCount } = providerAtDepth(1, false);
        const task = vi.fn().mockResolvedValue(undefined);
        await freshEngine().Defer(saveOn(provider), task);
        expect(task).toHaveBeenCalledTimes(1);
        expect(queuedCount()).toBe(0);
    });

    it('runs the task only after the commit when the event\'s write is inside a transaction', async () => {
        const { provider, commit } = providerAtDepth(1);
        const task = vi.fn().mockResolvedValue(undefined);
        await freshEngine().Defer(saveOn(provider), task);
        expect(task).not.toHaveBeenCalled();
        await commit();
        expect(task).toHaveBeenCalledTimes(1);
    });
});
