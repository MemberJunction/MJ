import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { IMetadataProvider } from '../generic/interfaces';
import { CacheChangedEvent } from '../generic/localCacheManager';
import { UserInfo } from '../generic/securityInfo';

/**
 * Cross-server cache payloads must be HYDRATED into entity objects before they
 * replace an engine's array.
 *
 * `OnExternalCacheChange` receives raw JSON from Redis pub/sub — the cache stores
 * plain rows (`BaseEntity.GetAll()`), never entity instances — and hands them to
 * `HandleSingleViewResult`, which assigns `result.Results` to the engine property
 * VERBATIM. Without hydration the array silently degrades to plain objects that keep
 * every FIELD but lose every METHOD.
 *
 * The production failure: `QueryEngine._queries` became plain rows, so every
 * `RunQuery` died on `query.UserCanRun is not a function` server-wide until the next
 * full reload. The defect was latent from the day this callback was written and only
 * became reachable once the callback fingerprints were corrected to match the cache
 * writes (the `imr:1` fix) — see baseEngine.fingerprintConsistency.test.ts.
 */

/** Minimal stand-in for a BaseEntity subclass that exposes a business-logic METHOD. */
class FakeQueryEntity {
    public ID: string = '';
    public Name: string = '';

    public LoadFromData(data: Record<string, unknown>): boolean {
        Object.assign(this, data);
        return true;
    }

    /** The method whose absence produced the production TypeError. */
    public UserCanRun(): { canRun: boolean; deniedEntities: string[] } {
        return { canRun: true, deniedEntities: [] };
    }
}

class TestEngine extends BaseEngine<TestEngine> {
    /** Populated by HandleSingleViewResult via config.PropertyName. */
    public _queries: unknown[] = [];

    public async Config(): Promise<void> {
        // no-op — these tests drive the cache-change path directly
    }

    public OnExternalCacheChangeForTest(
        config: BaseEnginePropertyConfig,
        event: CacheChangedEvent
    ): Promise<void> {
        return this.OnExternalCacheChange(config, event);
    }
}

function makeEvent(rows: Array<Record<string, unknown>>): CacheChangedEvent {
    return {
        CacheKey: 'MJ: Queries|||imr:1',
        Category: 'RunViewCache',
        Action: 'set',
        Timestamp: 0,
        SourceServerId: 'some-other-server',
        Data: JSON.stringify({ results: rows, totalRowCount: rows.length }),
    };
}

const ROWS = [
    { ID: 'aaaaaaaa-0000-0000-0000-000000000001', Name: 'Active Members' },
    { ID: 'aaaaaaaa-0000-0000-0000-000000000002', Name: 'Revenue By Month' },
];

function makeEntityConfig(overrides: Partial<BaseEnginePropertyConfig> = {}): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        PropertyName: '_queries',
        EntityName: 'MJ: Queries',
        CacheLocal: true,
        ...overrides,
    });
}

describe('BaseEngine.OnExternalCacheChange — entity-object hydration', () => {
    let engine: TestEngine;
    let getEntityObject: ReturnType<typeof vi.fn>;
    let provider: IMetadataProvider;

    beforeEach(() => {
        const store = GetGlobalObjectStore() as Record<string, unknown> | undefined;
        if (store) delete store['___SINGLETON__TestEngine'];

        engine = new TestEngine();
        engine._queries = [];

        getEntityObject = vi.fn(async () => new FakeQueryEntity());
        // No EntityByName — TransformSimpleObjectToEntityObject takes its
        // documented slow path for mocks, which is what we want to exercise here.
        provider = { GetEntityObject: getEntityObject } as unknown as IMetadataProvider;
        engine.SetProvider(provider);
    });

    it('hydrates raw cache rows into entity objects for an entity_object config', async () => {
        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), makeEvent(ROWS));

        expect(engine._queries).toHaveLength(2);
        for (const q of engine._queries) {
            expect(q).toBeInstanceOf(FakeQueryEntity);
        }
    });

    it('leaves business-logic methods callable on the replaced array (the production regression)', async () => {
        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), makeEvent(ROWS));

        for (const q of engine._queries as FakeQueryEntity[]) {
            expect(typeof q.UserCanRun).toBe('function');
            expect(q.UserCanRun().canRun).toBe(true);
        }
    });

    it('preserves the row field values through hydration', async () => {
        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), makeEvent(ROWS));

        const names = (engine._queries as FakeQueryEntity[]).map(q => q.Name);
        expect(names).toEqual(['Active Members', 'Revenue By Month']);
    });

    it('does NOT hydrate when the config asks for simple results', async () => {
        await engine.OnExternalCacheChangeForTest(
            makeEntityConfig({ ResultType: 'simple' }),
            makeEvent(ROWS)
        );

        expect(getEntityObject).not.toHaveBeenCalled();
        expect(engine._queries).toEqual(ROWS);
    });

    it('emits to ObserveProperty subscribers so per-property observers see cross-server updates', async () => {
        const seen: unknown[][] = [];
        engine.ObserveProperty<FakeQueryEntity>('_queries').subscribe(v => seen.push(v));

        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), makeEvent(ROWS));

        // First emission is the BehaviorSubject's initial (empty) value; the second
        // is the cross-server update.
        expect(seen.length).toBeGreaterThanOrEqual(2);
        expect(seen[seen.length - 1]).toHaveLength(2);
    });

    it('falls back to a full reload when hydration fails', async () => {
        getEntityObject.mockRejectedValue(new Error('entity class failed to construct'));
        const loadSingleConfig = vi
            .spyOn(engine as unknown as { LoadSingleConfig: (c: BaseEnginePropertyConfig, u?: UserInfo) => Promise<void> }, 'LoadSingleConfig')
            .mockResolvedValue(undefined);

        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), makeEvent(ROWS));

        expect(loadSingleConfig).toHaveBeenCalledTimes(1);
        // Never leave the array in a half-applied, method-less state.
        expect(engine._queries).toEqual([]);
    });

    it('falls back to a full reload on a malformed payload', async () => {
        const loadSingleConfig = vi
            .spyOn(engine as unknown as { LoadSingleConfig: (c: BaseEnginePropertyConfig, u?: UserInfo) => Promise<void> }, 'LoadSingleConfig')
            .mockResolvedValue(undefined);

        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), {
            ...makeEvent(ROWS),
            Data: 'not json',
        });

        expect(loadSingleConfig).toHaveBeenCalledTimes(1);
    });

    it('applies an empty result set without calling the provider', async () => {
        await engine.OnExternalCacheChangeForTest(makeEntityConfig(), makeEvent([]));

        expect(getEntityObject).not.toHaveBeenCalled();
        expect(engine._queries).toEqual([]);
    });
});
