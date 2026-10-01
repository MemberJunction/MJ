/**
 * Reconciling engine rows with the database (plan Phase 3.1).
 *
 * A change made without an MJ event (direct SQL, another application) never reached an engine:
 * every server kept the old rows until the cache entry expired or was cleared. The sweep compares
 * each loaded config's row count and newest `__mj_UpdatedAt` with the database, reloads what
 * differs, and writes the fresh rows to the shared cache once so other servers adopt them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import { BaseEngineSweeper } from '../generic/baseEngineSweeper';
import { LocalCacheManager } from '../generic/localCacheManager';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewDatabaseStatus, RunViewParams, RunViewResult } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

type Row = { ID: string; Name: string; __mj_UpdatedAt?: string };

const CONFIG = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Widgets', PropertyName: '_items', ResultType: 'simple' });
const HELD: Row[] = [
    { ID: 'A', Name: 'a', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' },
    { ID: 'B', Name: 'b', __mj_UpdatedAt: '2026-09-02T00:00:00.000Z' },
];
const FRESH: Row[] = [...HELD, { ID: 'C', Name: 'c (direct SQL)', __mj_UpdatedAt: '2026-09-03T00:00:00.000Z' }];

class SweepEngine extends BaseEngine<SweepEngine> {
    public _items: Row[] = [];
    public Rebuilds = 0;
    public Reloads: boolean[] = [];
    public ReloadRows: Row[] | null = FRESH;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected directly
    }

    public Prepare(provider: IMetadataProvider, rows: Row[]): void {
        const internals = this as unknown as { _provider: IMetadataProvider; _metadataConfigs: BaseEnginePropertyConfig[]; _loaded: boolean };
        internals._provider = provider;
        internals._metadataConfigs = [CONFIG];
        internals._loaded = true;
        this.HandleSingleViewResult(CONFIG, result(rows));
    }

    public DataEntry(): { readDenied?: boolean } | undefined {
        return (this as unknown as { _dataMap: Map<string, { readDenied?: boolean }> })._dataMap.get('_items');
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.Rebuilds++;
    }

    protected override async LoadSingleConfig(config: BaseEnginePropertyConfig, _user: UserInfo, bypassCache: boolean = false): Promise<void> {
        this.Reloads.push(bypassCache);
        this.HandleSingleViewResult(config, this.ReloadRows
            ? result(this.ReloadRows)
            : { ...result([]), Success: false, ErrorMessage: 'connection lost' });
    }
}

function result(rows: Row[]): RunViewResult {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

function provider(status: RunViewDatabaseStatus | ((params: RunViewParams[]) => Promise<RunViewDatabaseStatus[]>), options: { hasUpdatedAt?: boolean; probe?: boolean } = {}): IMetadataProvider & { Probe: ReturnType<typeof vi.fn> } {
    const entity = {
        Name: 'Widgets',
        AllowCaching: true,
        // The sweep only visits entities that DECLARE they can change without firing an event, which
        // is what `TrustServerCacheCompletely: false` says. Every test here is about detecting such a
        // change, so the fixture declares it (plan §26).
        TrustServerCacheCompletely: false,
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID', IsUpdatedAtField: false }, ...(options.hasUpdatedAt === false ? [] : [{ Name: '__mj_UpdatedAt', IsUpdatedAtField: true }])],
    };
    const probe = vi.fn(typeof status === 'function' ? status : async (params: RunViewParams[]) => params.map(() => status));
    return {
        EntityByName: vi.fn(() => entity),
        Probe: probe,
        ...(options.probe === false ? {} : { GetRunViewsDatabaseStatus: probe }),
    } as unknown as IMetadataProvider & { Probe: ReturnType<typeof vi.fn> };
}

/** A provider whose entity still trusts its cache — the default for every MJ entity. */
function trustingProvider(status: RunViewDatabaseStatus): IMetadataProvider & { Probe: ReturnType<typeof vi.fn> } {
    const p = provider(status);
    const entity = { Name: 'Widgets', AllowCaching: true, TrustServerCacheCompletely: true, PrimaryKeys: [{ Name: 'ID' }], Fields: [{ Name: '__mj_UpdatedAt', IsUpdatedAtField: true }] };
    (p as unknown as { EntityByName: ReturnType<typeof vi.fn> }).EntityByName = vi.fn(() => entity);
    return p;
}

function matching(rows: Row[]): RunViewDatabaseStatus {
    const newest = rows.map(r => r.__mj_UpdatedAt ?? '').sort().pop();
    return { Success: true, RowCount: rows.length, MaxUpdatedAt: newest };
}

describe('BaseEngine.SweepAgainstDatabase', () => {
    let storage: MockCacheStorageProvider;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        storage = new MockCacheStorageProvider();
        await LocalCacheManager.Instance.Initialize(storage);
    });

    it('leaves a config alone when the database reports the rows it holds', async () => {
        const engine = new SweepEngine();
        const p = provider(matching(HELD));
        engine.Prepare(p, HELD);

        const outcome = await engine.SweepAgainstDatabase();

        expect(outcome).toMatchObject({ Checked: 1, Reloaded: [], Errors: [] });
        expect(p.Probe).toHaveBeenCalledOnce();
        expect(p.Probe.mock.calls[0][0][0]).toMatchObject({ EntityName: 'Widgets', IgnoreMaxRows: true });
        expect(engine.Reloads).toEqual([]);
        expect(engine.Rebuilds).toBe(0);
    });

    it('treats timestamps within a second as equal', async () => {
        const engine = new SweepEngine();
        engine.Prepare(provider({ Success: true, RowCount: 2, MaxUpdatedAt: '2026-09-02T00:00:00.400Z' }), HELD);
        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual([]);
    });

    it('reloads from the database, rebuilds once, notifies, and stores the fresh rows once', async () => {
        const engine = new SweepEngine();
        engine.Prepare(provider(matching(FRESH)), HELD);
        const emitted: unknown[] = [];
        engine.ObserveProperty('_items').subscribe(v => emitted.push(v));
        emitted.length = 0;
        const setItem = vi.spyOn(storage, 'SetItem');

        const outcome = await engine.SweepAgainstDatabase();

        expect(outcome.Reloaded).toEqual(['_items']);
        expect(engine.Reloads).toEqual([true]); // bypassing the stale cache
        expect(engine._items.map(r => r.ID)).toEqual(['A', 'B', 'C']);
        expect(engine.Rebuilds).toBe(1);
        expect(emitted.length).toBeGreaterThan(0);
        const slotWrites = setItem.mock.calls.filter(c => c[2] === 'RunViewCache');
        expect(slotWrites).toHaveLength(1);
        const stored = await LocalCacheManager.Instance.GetRunViewResult(String(slotWrites[0][0]));
        expect(stored?.results).toHaveLength(3);
        expect(stored?.maxUpdatedAt).toBe('2026-09-03T00:00:00.000Z');
    });

    it('reloads when only the row count differs (a delete made outside MJ)', async () => {
        const engine = new SweepEngine();
        engine.ReloadRows = [HELD[1]];
        engine.Prepare(provider({ Success: true, RowCount: 1, MaxUpdatedAt: '2026-09-02T00:00:00.000Z' }), HELD);
        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual(['_items']);
        expect(engine._items).toHaveLength(1);
    });

    it('compares counts only for an entity without __mj_UpdatedAt', async () => {
        const engine = new SweepEngine();
        engine.Prepare(provider({ Success: true, RowCount: 2, MaxUpdatedAt: '2030-01-01T00:00:00.000Z' }, { hasUpdatedAt: false }), HELD);
        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual([]);
    });

    it('checks nothing when the provider cannot ask the database, or the config is unreadable', async () => {
        const noProbe = new SweepEngine();
        noProbe.Prepare(provider(matching(FRESH), { probe: false }), HELD);
        expect((await noProbe.SweepAgainstDatabase()).Checked).toBe(0);

        const denied = new SweepEngine();
        const p = provider(matching(FRESH));
        denied.Prepare(p, HELD);
        denied.DataEntry()!.readDenied = true;
        expect((await denied.SweepAgainstDatabase()).Checked).toBe(0);
        expect(p.Probe).not.toHaveBeenCalled();
    });

    it('reports a failed status or a failed reload without throwing', async () => {
        const badStatus = new SweepEngine();
        badStatus.Prepare(provider({ Success: false, ErrorMessage: 'timeout' }), HELD);
        const first = await badStatus.SweepAgainstDatabase();
        expect(first).toMatchObject({ Checked: 0, Reloaded: [] });
        expect(first.Errors[0]).toContain('timeout');

        const badReload = new SweepEngine();
        badReload.ReloadRows = null;
        badReload.Prepare(provider(matching(FRESH)), HELD);
        const second = await badReload.SweepAgainstDatabase();
        expect(second.Reloaded).toEqual([]);
        expect(second.Errors[0]).toContain('reload failed');

        const throwing = new SweepEngine();
        throwing.Prepare(provider(async () => { throw new Error('pool closed'); }), HELD);
        expect((await throwing.SweepAgainstDatabase()).Errors).toEqual(['pool closed']);
    });
});

describe('BaseEngineSweeper', () => {
    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());
    });

    function registered(engine: SweepEngine): () => void {
        vi.spyOn(BaseEngineRegistry.Instance, 'GetAllEngines').mockReturnValue([engine, { Loaded: true }, null]);
        return () => vi.restoreAllMocks();
    }

    it('sweeps loaded engines, and only those whose lease this process claims', async () => {
        const engine = new SweepEngine();
        engine.Prepare(provider(matching(FRESH)), HELD);
        const restore = registered(engine);
        const lease = vi.spyOn(LocalCacheManager.Instance, 'TryAcquireSharedLease').mockResolvedValueOnce(false).mockResolvedValue(true);

        expect(await BaseEngineSweeper.Instance.SweepOnce(5000)).toEqual([]);
        expect(lease).toHaveBeenCalledWith('engine-sweep:SweepEngine', 5000);
        const swept = await BaseEngineSweeper.Instance.SweepOnce(5000);
        expect(swept.map(r => r.Reloaded)).toEqual([['_items']]);
        restore();
    });

    it('claims the lease on a private store, and not when the shared store fails', async () => {
        expect(await LocalCacheManager.Instance.TryAcquireSharedLease('x', 1000)).toBe(true);
        const shared = new MockCacheStorageProvider() as MockCacheStorageProvider & { TryAcquireLease: (n: string, t: number) => Promise<boolean> };
        shared.TryAcquireLease = async () => { throw new Error('redis down'); };
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        await LocalCacheManager.Instance.Initialize(shared);
        expect(await LocalCacheManager.Instance.TryAcquireSharedLease('x', 1000)).toBe(false);
    });

    it('runs on an interval until stopped', async () => {
        vi.useFakeTimers();
        const sweep = vi.spyOn(BaseEngineSweeper.Instance, 'SweepOnce').mockResolvedValue([]);
        BaseEngineSweeper.Instance.Start(10_000);
        expect(BaseEngineSweeper.Instance.IsRunning).toBe(true);
        await vi.advanceTimersByTimeAsync(25_000);
        expect(sweep).toHaveBeenCalledTimes(2);
        expect(sweep).toHaveBeenCalledWith(9_000);
        BaseEngineSweeper.Instance.Stop();
        await vi.advanceTimersByTimeAsync(20_000);
        expect(sweep).toHaveBeenCalledTimes(2);
        BaseEngineSweeper.Instance.Start(0);
        expect(BaseEngineSweeper.Instance.IsRunning).toBe(false);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
});

/**
 * The sweep is a periodic database query, and a periodic query is not free (plan §26).
 *
 * On Azure SQL serverless a recurring query prevents auto-pause outright, and the interval does not
 * help — auto-pause needs sustained inactivity, so 3600 s is no better than 300 s. Several installs
 * pay for that, and MJ's answer has been "turn the scheduled jobs off", which means finding a knob.
 *
 * So the cost is made proportional to the declared risk. `Entity.TrustServerCacheCompletely` already
 * states whether an entity's rows can change without firing an event: true (the default) means every
 * mutation flows through `BaseEntity.Save()`, false is set "for entities whose rows are created as
 * side-effects of other operations via raw SQL". An entity that still trusts its cache has nothing
 * for the sweep to discover, so it is not queried at all — and an install where nothing writes out
 * of band therefore sweeps nothing and lets the database sleep, with no configuration to find.
 */
describe('the sweep only visits entities that declare they can drift', () => {
    let storage: MockCacheStorageProvider;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        storage = new MockCacheStorageProvider();
        await LocalCacheManager.Instance.Initialize(storage);
    });

    /** The database reports far more rows than the engine holds — drift a sweep would catch. */
    const DRIFTED: RunViewDatabaseStatus = { Success: true, RowCount: 99, MaxUpdatedAt: '2026-06-01T00:00:00.000Z' };
    const HELD: Row[] = [{ ID: '1', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' }];

    it('asks the database NOTHING for an entity that still trusts its cache', async () => {
        const p = trustingProvider(DRIFTED);
        const engine = new SweepEngine();
        engine.Prepare(p, HELD);

        const result = await engine.SweepAgainstDatabase();

        // Real drift, and the database is not even asked — the entity declares that cannot happen
        // without an event, so there is nothing a query could tell us.
        expect(p.Probe).not.toHaveBeenCalled();
        expect(result.Checked).toBe(0);
        expect(result.Reloaded).toEqual([]);
    });

    it('still sweeps an entity that declares out-of-band writes', async () => {
        const p = provider(DRIFTED);
        const engine = new SweepEngine();
        engine.Prepare(p, HELD);

        const result = await engine.SweepAgainstDatabase();

        expect(p.Probe).toHaveBeenCalledTimes(1);
        expect(result.Reloaded).toEqual(['_items']);
    });
});
