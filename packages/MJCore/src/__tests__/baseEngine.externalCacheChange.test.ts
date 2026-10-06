import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';
import { CacheChangedEvent } from '../generic/localCacheManager';

/**
 * Regression coverage for the cache-payload type-poisoning defect.
 *
 * `OnExternalCacheChange` applies a cross-server cache-change payload directly to the engine
 * property to avoid a DB round trip. Cache payloads are JSON, so their rows are PLAIN objects —
 * and the pre-fix code assigned them straight through `HandleSingleViewResult`. For a config
 * whose effective ResultType is `entity_object` (the default), that silently replaced the
 * array's `BaseEntity` instances with plain objects, so every typed getter's coercion was
 * bypassed. A `__mj_CreatedAt` declared `Date` then held a raw ISO string, which is what made
 * `.getTime()` throw in the agent-context sort comparators.
 *
 * The `instanceof Date` half of that story is NOT asserted here on purpose: date coercion lives
 * in `BaseEntity.Get()`'s TSType handling and needs real EntityInfo field metadata, which this
 * layer's duck-typed mocks (the established MJCore convention — see util.transformEntity.test.ts)
 * deliberately don't build. What IS provable here, and what actually pins the defect, is that
 * the property ends up holding materialized ENTITIES rather than the raw payload objects. The
 * date claim is asserted end-to-end in the integration tier.
 *
 * The final test covers the ordering guard the fix required: materialization is async, so the
 * payload branch — previously fully synchronous — gained a suspension point. Without a refresh
 * generation, two overlapping cache events can resolve out of order and the STALE one assigns
 * last.
 */

/** Duck-typed entity, matching the MJCore convention: implements only what the transform calls. */
class MockEntity {
    public data: Record<string, unknown> = {};

    public LoadFromData(data: Record<string, unknown>): boolean {
        this.data = data;
        return true;
    }

    /** The duck-type marker TransformSimpleObjectToEntityObject uses for already-converted rows. */
    public Save(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

/** Test engine exposing the protected cache-change handler and letting us inject a provider. */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: unknown[] = [];
    public loadSingleConfigCalls = 0;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // no-op — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public SetProviderForTest(provider: IMetadataProvider): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
    }

    /** Stubbed so the fallback path is observable without a real RunView. */
    protected override async LoadSingleConfig(_config: BaseEnginePropertyConfig, _contextUser: UserInfo): Promise<void> {
        this.loadSingleConfigCalls++;
    }

    public OnExternalCacheChangeForTest(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        return (this as unknown as {
            OnExternalCacheChange: (c: BaseEnginePropertyConfig, e: CacheChangedEvent) => Promise<void>;
        }).OnExternalCacheChange(config, event);
    }
}

/**
 * Provider whose GetEntityObject resolves after a per-call delay, so a test can force a specific
 * resolution ORDER across overlapping cache events independent of initiation order.
 */
function createMockProvider(options?: { delaysMs?: number[]; throwOnGet?: boolean }) {
    let call = 0;
    const entityNames: string[] = [];

    const provider = {
        // Absent EntityByName routes TransformSimpleObjectToEntityObject down its slow path,
        // which calls GetEntityObject per row — the behaviour these mocks model.
        GetEntityObject: vi.fn(async <T>(entityName: string, _contextUser?: UserInfo): Promise<T> => {
            entityNames.push(entityName);
            if (options?.throwOnGet) {
                throw new Error('entity class failed to construct');
            }
            const delay = options?.delaysMs?.[call] ?? 0;
            call++;
            if (delay > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, delay));
            }
            return new MockEntity() as unknown as T;
        }),
        entityNames,
    };

    return provider as unknown as IMetadataProvider & { entityNames: string[]; GetEntityObject: ReturnType<typeof vi.fn> };
}

function makeConfig(overrides?: Partial<BaseEnginePropertyConfig>): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        Type: 'entity',
        EntityName: 'MJ: AI Agent Notes',
        PropertyName: '_items',
        ...overrides,
    });
}

function makeEvent(rows: Array<Record<string, unknown>>): CacheChangedEvent {
    return {
        Action: 'set',
        Data: JSON.stringify({ results: rows, totalRowCount: rows.length }),
    } as unknown as CacheChangedEvent;
}

/** The exact shape a poisoned cache payload holds: plain objects with an ISO-string date. */
const PAYLOAD_ROWS = [
    { ID: 'note-a', AgentID: 'agent-1', Note: 'older', __mj_CreatedAt: '2026-08-01T00:00:00.000Z' },
    { ID: 'note-b', AgentID: 'agent-1', Note: 'newer', __mj_CreatedAt: '2026-08-02T00:00:00.000Z' },
];

function setup(providerOptions?: Parameters<typeof createMockProvider>[0]) {
    const engine = new TestEngine();
    const provider = createMockProvider(providerOptions);
    engine.SetProviderForTest(provider);
    return { engine, provider };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('BaseEngine.OnExternalCacheChange row materialization', () => {
    it('materializes payload rows into entities for an entity_object config', async () => {
        const { engine, provider } = setup();
        const config = makeConfig();
        engine.SetConfigsForTest([config]);

        await engine.OnExternalCacheChangeForTest(config, makeEvent(PAYLOAD_ROWS));

        // Pre-fix this is the raw parsed payload — plain objects, no Save(), no coercing getters.
        expect(engine._items).toHaveLength(2);
        for (const row of engine._items) {
            expect(row).toBeInstanceOf(MockEntity);
            expect(typeof (row as MockEntity).Save).toBe('function');
        }
        // And they carry the payload's data, not an empty shell.
        expect((engine._items as MockEntity[]).map((r) => r.data.ID)).toEqual(['note-a', 'note-b']);
        // Built against the config's entity, so the right subclass/metadata is used.
        expect(provider.entityNames).toEqual(['MJ: AI Agent Notes', 'MJ: AI Agent Notes']);
        expect(engine.loadSingleConfigCalls).toBe(0); // payload path used; no DB round trip
    });

    it('passes rows through untouched for a simple config', async () => {
        const { engine, provider } = setup();
        const config = makeConfig({ ResultType: 'simple' });
        engine.SetConfigsForTest([config]);

        await engine.OnExternalCacheChangeForTest(config, makeEvent(PAYLOAD_ROWS));

        expect(engine._items).toEqual(PAYLOAD_ROWS);
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
        expect(engine.loadSingleConfigCalls).toBe(0);
    });

    it('falls back to a full reload when the config has no EntityName', async () => {
        const { engine, provider } = setup();
        const config = makeConfig({ EntityName: undefined });
        engine.SetConfigsForTest([config]);

        await engine.OnExternalCacheChangeForTest(config, makeEvent(PAYLOAD_ROWS));

        // Critically: it reloads rather than assigning the raw rows.
        expect(engine._items).toEqual([]);
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
        expect(engine.loadSingleConfigCalls).toBe(1);
    });

    it('falls back to a full reload when materialization throws (fail-safe, not fail-broken)', async () => {
        const { engine } = setup({ throwOnGet: true });
        const config = makeConfig();
        engine.SetConfigsForTest([config]);

        await engine.OnExternalCacheChangeForTest(config, makeEvent(PAYLOAD_ROWS));

        expect(engine._items).toEqual([]);
        expect(engine.loadSingleConfigCalls).toBe(1);
    });

    it('falls back to a full reload for a malformed payload', async () => {
        const { engine } = setup();
        const config = makeConfig();
        engine.SetConfigsForTest([config]);

        await engine.OnExternalCacheChangeForTest(
            config,
            { Action: 'set', Data: 'not json' } as unknown as CacheChangedEvent
        );

        expect(engine.loadSingleConfigCalls).toBe(1);
    });
});

describe('BaseEngine.OnExternalCacheChange ordering guard', () => {
    it('commits the latest-INITIATED cache event even when an earlier one materializes LAST', async () => {
        vi.useFakeTimers();
        // Event 1's materialization is SLOW → resolves last with the stale snapshot.
        // Event 2's is FAST → resolves first with the fresh snapshot.
        const { engine } = setup({ delaysMs: [100, 10] });
        const config = makeConfig();
        engine.SetConfigsForTest([config]);

        const stale = engine.OnExternalCacheChangeForTest(
            config,
            makeEvent([{ ID: 'stale', __mj_CreatedAt: '2026-08-01T00:00:00.000Z' }])
        );
        const fresh = engine.OnExternalCacheChangeForTest(
            config,
            makeEvent([{ ID: 'fresh', __mj_CreatedAt: '2026-08-02T00:00:00.000Z' }])
        );

        await vi.advanceTimersByTimeAsync(200);
        await Promise.all([stale, fresh]);

        // Without the generation guard the slow (older) event assigns last and this is 'stale'.
        expect((engine._items as MockEntity[]).map((r) => r.data.ID)).toEqual(['fresh']);
    });

    it('a lone cache event still commits (the guard is a no-op on the normal path)', async () => {
        vi.useFakeTimers();
        const { engine } = setup({ delaysMs: [10] });
        const config = makeConfig();
        engine.SetConfigsForTest([config]);

        const only = engine.OnExternalCacheChangeForTest(
            config,
            makeEvent([{ ID: 'only', __mj_CreatedAt: '2026-08-01T00:00:00.000Z' }])
        );
        await vi.advanceTimersByTimeAsync(50);
        await only;

        expect((engine._items as MockEntity[]).map((r) => r.data.ID)).toEqual(['only']);
    });
});
