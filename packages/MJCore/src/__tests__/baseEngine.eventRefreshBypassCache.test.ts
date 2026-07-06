import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';

/**
 * Regression coverage for the "installed apps stay one operation behind" bug.
 *
 * Root cause (found via live instrumentation, not the original static analysis): a
 * BaseEntity save/delete triggers an engine full refresh, but that refresh read back a
 * STALE server-cached view result — the cache entry that the very write which fired the
 * event should have invalidated. So the engine cache (e.g. UserInfoEngine's per-user
 * '_UserApplications') re-synced the PRE-write snapshot and the UI trailed by one op until
 * a full page reload repopulated the cache.
 *
 * Fix: an event-triggered full refresh reads with BypassCache=true. Reading through a
 * cache immediately after the write that changed the data is exactly the hazard, so the
 * "data just changed, re-read" path must go to the source of truth.
 *
 * This is distinct from (and complementary to) the ordering guard in
 * baseEngine.concurrentRefresh.test.ts: BypassCache makes each event refresh read fresh;
 * the generation guard makes the latest-initiated fresh read win when several overlap.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];
    /** bypassCache value captured for each LoadSingleConfig invocation, in order. */
    public bypassCacheArgs: boolean[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // no-op — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public async ProcessEntityEventsForTest(events: BaseEntityEvent[]): Promise<void> {
        await this.ProcessEntityEvents(events);
    }

    // Stub the real refresh (needs a provider); capture bypassCache and record success in the
    // data map the way HandleSingleViewResult does so configLoadedSuccessfully() sees it.
    protected override async LoadSingleConfig(
        config: BaseEnginePropertyConfig,
        _contextUser: UserInfo,
        bypassCache: boolean = false,
    ): Promise<void> {
        this.bypassCacheArgs.push(bypassCache);
        (this as unknown as {
            _dataMap: Map<string, { entityName?: string; data: unknown[]; loadedSuccessfully: boolean }>;
        })._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: this._items, loadedSuccessfully: true });
    }
}

function makeItem(id: string): BaseEntity {
    return {
        EntityInfo: { Name: 'Items', PrimaryKeys: [{ Name: 'ID' }] },
        PrimaryKey: { ToString: () => id, KeyValuePairs: [{ FieldName: 'ID', Value: id }] },
        ID: id,
    } as unknown as BaseEntity;
}

function updateEvent(entity: BaseEntity): BaseEntityEvent {
    return { type: 'save', saveSubType: 'update', baseEntity: entity } as BaseEntityEvent;
}

function makeFilteredConfig(): BaseEnginePropertyConfig {
    // A Filter forces the full-refresh path (canUseImmediateMutation === false), mirroring
    // UserInfoEngine's per-user '_UserApplications' config.
    return new BaseEnginePropertyConfig({
        Type: 'entity',
        EntityName: 'Items',
        PropertyName: '_items',
        Filter: `UserID='u1'`,
    });
}

describe('BaseEngine event-triggered refresh bypasses the cache', () => {
    it('passes bypassCache=true to LoadSingleConfig on an event-driven full refresh', async () => {
        const engine = new TestEngine();
        engine.SetConfigsForTest([makeFilteredConfig()]);

        // An update to a row the array has never seen classifies as 'refresh' → full refresh path.
        await engine.ProcessEntityEventsForTest([updateEvent(makeItem('fresh'))]);

        expect(engine.bypassCacheArgs).toEqual([true]);
    });

    it('bypasses the cache for every event window (a later save re-reads true DB state)', async () => {
        const engine = new TestEngine();
        engine.SetConfigsForTest([makeFilteredConfig()]);

        await engine.ProcessEntityEventsForTest([updateEvent(makeItem('a'))]);
        await engine.ProcessEntityEventsForTest([updateEvent(makeItem('b'))]);

        expect(engine.bypassCacheArgs).toEqual([true, true]);
    });
});
