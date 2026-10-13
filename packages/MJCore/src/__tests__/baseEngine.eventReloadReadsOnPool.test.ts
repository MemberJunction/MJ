import { describe, it, expect, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntityEvent } from '../generic/baseEntity';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import type { PostCommitTask, PostCommitToken } from '../generic/databaseProviderBase';
import { UserInfo } from '../generic/securityInfo';
import { DatasetReadOptions, DatasetResultType, IMetadataProvider, ProviderType } from '../generic/interfaces';

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

/** A database provider double at a given transaction depth, with a post-commit queue the test runs. */
function providerAtDepth(depth: number): { provider: DatabaseProviderBase; commit: () => Promise<void> } {
    const queued: PostCommitTask[] = [];
    const provider = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
    Object.defineProperty(provider, 'TransactionDepth', { get: () => depth });
    // the token's shape is the provider's business; the double only has to hand one back
    provider.CapturePostCommitToken = () => (depth > 0 ? ({ frames: depth } as unknown as PostCommitToken) : undefined);
    provider.RunAfterCommit = (task: PostCommitTask) => { queued.push(task); };
    return { provider, commit: async () => { for (const t of queued.splice(0)) await t(); } };
}

/** A save event raised by an entity on `provider` (the handler reads only baseEntity.ProviderToUse). */
function saveOn(provider: DatabaseProviderBase): BaseEntityEvent {
    // a partial event double carrying the one field RunAfterCommitOrNow reads
    return { type: 'save', baseEntity: { ProviderToUse: provider } } as unknown as BaseEntityEvent;
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

    it('never coalesces a queued event reload with a plain forced reload: each keeps its own read options', async () => {
        for (const order of [['pool', 'plain'], ['plain', 'pool']] as const) {
            const reads: DatasetRead[] = [];
            const gate = heldProvider(reads);
            const engine = freshEngine();
            const inFlight = engine.Config(true, undefined, gate.Provider); // holds its read until released
            await gate.FirstReadStarted;
            const queued = order.map((kind) => (kind === 'pool' ? engine.EventReload(gate.Provider) : engine.Config(true, undefined, gate.Provider)));
            gate.Release();
            await Promise.all([inFlight, ...queued]);
            // the load in flight, then one follow-up per distinct read-option set — neither request lost or rewritten
            expect(reads).toHaveLength(3);
            expect(reads[0].ReadOptions).toBeUndefined();
            expect(reads.slice(1).map((r) => r.ReadOptions?.ReadOnPool === true).sort()).toEqual([false, true]);
        }
    });

    it('still coalesces a burst of forced reloads with the same read options into one follow-up', async () => {
        const reads: DatasetRead[] = [];
        const gate = heldProvider(reads);
        const engine = freshEngine();
        const inFlight = engine.Config(true, undefined, gate.Provider);
        await gate.FirstReadStarted;
        const burst = [engine.EventReload(gate.Provider), engine.EventReload(gate.Provider), engine.EventReload(gate.Provider)];
        gate.Release();
        await Promise.all([inFlight, ...burst]);
        expect(reads.map((r) => r.ReadOptions)).toEqual([undefined, { ReadOnPool: true }]);
    });

    it('reads the dataset\'s entity names from the dataset itself, lower-cased and trimmed', async () => {
        const engine = freshEngine();
        expect(engine.EntityNames().size).toBe(0);
        await engine.EventReload(datasetProvider([]));
        expect([...engine.EntityNames()].sort()).toEqual(['mj: template contents', 'mj: templates']);
    });
});

describe('BaseEngine.RunAfterCommitOrNow', () => {
    it('runs the task now when no transaction is open', async () => {
        const { provider } = providerAtDepth(0);
        const task = vi.fn().mockResolvedValue(undefined);
        await freshEngine().Defer(saveOn(provider), task);
        expect(task).toHaveBeenCalledTimes(1);
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
