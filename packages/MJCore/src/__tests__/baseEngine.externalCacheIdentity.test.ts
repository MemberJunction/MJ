import { describe, it, expect, vi } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';
import { CacheChangedEvent } from '../generic/localCacheManager';

/**
 * Skipping cross-server payloads that carry the rows an engine already holds (plan §4 Idea C,
 * item 1.3).
 *
 * A replica warming its cache republishes every config it loads, and almost all of those payloads
 * are identical to what each peer holds. Applying one costs a materialization and a derived-state
 * rebuild. The skip compares (primary key, `__mj_UpdatedAt`) of the payload with what the engine
 * holds now. Nothing is remembered, so no other assignment path can leave it stale — the flaw that
 * got the first attempt (`eff6a21c51`) reverted.
 */

class TestEngine extends BaseEngine<TestEngine> {
    public _items: unknown[] = [];
    public rebuilds = 0;
    public reloads = 0;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected directly
    }

    public SetProviderForTest(provider: IMetadataProvider): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
    }

    /** Puts rows into the engine the way a successful load does. */
    public HoldForTest(config: BaseEnginePropertyConfig, rows: unknown[]): void {
        const result: RunViewResult = { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        this.HandleSingleViewResult(config, result);
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.rebuilds++;
    }

    protected override async LoadSingleConfig(_config: BaseEnginePropertyConfig, _contextUser: UserInfo): Promise<void> {
        this.reloads++;
    }

    public Fire(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        return (this as unknown as {
            OnExternalCacheChange: (c: BaseEnginePropertyConfig, e: CacheChangedEvent) => Promise<void>;
        }).OnExternalCacheChange(config, event);
    }
}

function makeProvider(options: { hasUpdatedAt?: boolean } = {}): IMetadataProvider {
    const entity = {
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', IsUpdatedAtField: false },
            ...(options.hasUpdatedAt === false ? [] : [{ Name: '__mj_UpdatedAt', IsUpdatedAtField: true }]),
        ],
    };
    return {
        EntityByName: vi.fn(() => entity),
        GetEntityObject: vi.fn(async () => ({ LoadFromData: () => true, Save: async () => true })),
    } as unknown as IMetadataProvider;
}

const CONFIG = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Widgets', PropertyName: '_items', ResultType: 'simple' });

const HELD = [
    { ID: 'A1', Name: 'one', __mj_UpdatedAt: new Date('2026-09-01T00:00:00.000Z') },
    { ID: 'B2', Name: 'two', __mj_UpdatedAt: new Date('2026-09-02T00:00:00.000Z') },
];

/** What a peer publishes for HELD: JSON, so dates are strings, and the row order may differ. */
function payload(rows: Array<Record<string, unknown>>): CacheChangedEvent {
    return { Action: 'set', CacheKey: 'Widgets|_', Category: 'RunViewCache', Timestamp: 0, SourceServerId: 'peer',
        Data: JSON.stringify({ results: rows }) };
}

const SAME_ROWS = [
    { ID: 'b2', Name: 'two', __mj_UpdatedAt: '2026-09-02T00:00:00.000Z' },
    { ID: 'a1', Name: 'one', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' },
];

function setup(providerOptions?: { hasUpdatedAt?: boolean }) {
    const engine = new TestEngine();
    engine.SetProviderForTest(makeProvider(providerOptions));
    engine.HoldForTest(CONFIG, HELD);
    const emitted: unknown[] = [];
    engine.ObserveProperty('_items').subscribe(v => emitted.push(v));
    emitted.length = 0;   // drop the BehaviorSubject's replay of the current value
    return { engine, emitted };
}

describe('BaseEngine.OnExternalCacheChange — identical payloads', () => {
    it('skips a payload holding the same row versions: no assignment, no rebuild, no emit', async () => {
        const { engine, emitted } = setup();
        const before = engine._items;

        await engine.Fire(CONFIG, payload(SAME_ROWS));

        expect(engine._items).toBe(before);
        expect(engine.rebuilds).toBe(0);
        expect(emitted).toHaveLength(0);
        expect(engine.reloads).toBe(0);
    });

    it('applies a payload in which one row has a newer __mj_UpdatedAt', async () => {
        const { engine, emitted } = setup();
        const changed = [SAME_ROWS[0], { ...SAME_ROWS[1], Name: 'one!', __mj_UpdatedAt: '2026-09-03T00:00:00.000Z' }];

        await engine.Fire(CONFIG, payload(changed));

        expect((engine._items as Array<Record<string, unknown>>).map(r => r.Name).sort()).toEqual(['one!', 'two']);
        expect(engine.rebuilds).toBe(1);
        expect(emitted).toHaveLength(1);
    });

    it('applies a delete paired with an insert even though the row count is unchanged', async () => {
        const { engine } = setup();
        const swapped = [SAME_ROWS[0], { ID: 'C3', Name: 'three', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' }];

        await engine.Fire(CONFIG, payload(swapped));

        expect((engine._items as Array<Record<string, unknown>>).map(r => r.ID).sort()).toEqual(['C3', 'b2']);
        expect(engine.rebuilds).toBe(1);
    });

    it('applies a payload with a different row count', async () => {
        const { engine } = setup();
        await engine.Fire(CONFIG, payload([SAME_ROWS[0]]));
        expect(engine._items).toHaveLength(1);
        expect(engine.rebuilds).toBe(1);
    });

    it('applies when the entity has no __mj_UpdatedAt column (identity cannot be proven)', async () => {
        const { engine } = setup({ hasUpdatedAt: false });
        await engine.Fire(CONFIG, payload(SAME_ROWS));
        expect(engine.rebuilds).toBe(1);
    });

    it('applies when a payload row has no readable timestamp', async () => {
        const { engine } = setup();
        await engine.Fire(CONFIG, payload([SAME_ROWS[0], { ID: 'a1', Name: 'one', __mj_UpdatedAt: 'not a date' }]));
        expect(engine.rebuilds).toBe(1);
    });

    it('applies when the config has not loaded yet', async () => {
        const engine = new TestEngine();
        engine.SetProviderForTest(makeProvider());
        await engine.Fire(CONFIG, payload(SAME_ROWS));
        expect(engine._items).toHaveLength(2);
        expect(engine.rebuilds).toBe(1);
    });

    it('reads timestamps from held BaseEntity instances through Get()', async () => {
        const engine = new TestEngine();
        engine.SetProviderForTest(makeProvider());
        const entityConfig = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Widgets', PropertyName: '_items' });
        const held = HELD.map(row => {
            const e = Object.create(BaseEntity.prototype) as BaseEntity;
            (e as unknown as { Get: (f: string) => unknown }).Get = (f: string) => (row as Record<string, unknown>)[f];
            return e;
        });
        engine.HoldForTest(entityConfig, held);
        const before = engine._items;

        await engine.Fire(entityConfig, payload(SAME_ROWS));

        expect(engine._items).toBe(before);
        expect(engine.rebuilds).toBe(0);
    });

    it('does not claim a refresh generation when it skips, so an in-flight reload still commits', async () => {
        const { engine } = setup();
        const internals = engine as unknown as {
            beginConfigRefresh(p: string): number;
            isLatestConfigRefresh(p: string, g: number): boolean;
        };
        const inFlight = internals.beginConfigRefresh('_items');

        await engine.Fire(CONFIG, payload(SAME_ROWS));

        expect(internals.isLatestConfigRefresh('_items', inFlight)).toBe(true);
    });
});

describe('BaseEngine.OnExternalCacheChange — bursts (plan N11, receive side)', () => {
    function version(n: number): CacheChangedEvent {
        return payload([{ ID: 'A1', Name: `v${n}`, __mj_UpdatedAt: `2026-10-0${n}T00:00:00.000Z` }]);
    }

    it('materializes only the newest of several payloads that arrive together', async () => {
        const { engine, emitted } = setup();
        const materialize = vi.spyOn(engine as unknown as { materializeCacheEventRows: () => Promise<unknown[] | null> }, 'materializeCacheEventRows');

        await Promise.all([engine.Fire(CONFIG, version(1)), engine.Fire(CONFIG, version(2)), engine.Fire(CONFIG, version(3))]);

        expect(materialize).toHaveBeenCalledTimes(1);
        expect((engine._items as Array<Record<string, unknown>>).map(r => r.Name)).toEqual(['v3']);
        expect(engine.rebuilds).toBe(1);
        expect(emitted).toHaveLength(1);
    });

    it('still applies payloads that arrive one after another', async () => {
        const { engine } = setup();
        await engine.Fire(CONFIG, version(1));
        await engine.Fire(CONFIG, version(2));
        expect((engine._items as Array<Record<string, unknown>>).map(r => r.Name)).toEqual(['v2']);
        expect(engine.rebuilds).toBe(2);
    });
});
