import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, EngineDataChangeEvent } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';

/**
 * Covers the batch-aware debounce processing (ProcessEntityEvents) and the bounded
 * retry for transiently-failed event-triggered refreshes.
 *
 * Why batching matters: the per-entity debounce coalesces every event raised in the
 * window. If only the LAST event decided refresh-vs-skip, an already-applied write
 * (e.g., an engine method's in-place save of a cached instance) landing last would
 * mask an earlier fresh-instance save the array has never seen — the refresh would be
 * skipped and observers would sync to an array missing committed changes.
 *
 * Why retry matters: the debounced event is consumed when processing runs. If the
 * refresh RunView fails transiently and nothing retries, every observer stays stale
 * until an unrelated event arrives for the same entity — potentially never.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];
    public LoadSingleConfigCalls = 0;
    public AdditionalLoadingCalls = 0;
    /** Outcome per LoadSingleConfig invocation (shifted per call); defaults to success. */
    public LoadResults: boolean[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op for tests — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public async ProcessEntityEventsForTest(events: BaseEntityEvent[]): Promise<void> {
        await this.ProcessEntityEvents(events);
    }

    public async HandleEventForTest(event: BaseEntityEvent): Promise<void> {
        await this.HandleIndividualBaseEntityEvent(event);
    }

    // Stub the real refresh (needs a provider); record the outcome in the data map the
    // same way HandleSingleViewResult does so configLoadedSuccessfully sees it.
    protected override async LoadSingleConfig(config: BaseEnginePropertyConfig): Promise<void> {
        this.LoadSingleConfigCalls++;
        const ok = this.LoadResults.length > 0 ? (this.LoadResults.shift() as boolean) : true;
        (this as unknown as { _dataMap: Map<string, { entityName?: string; data: unknown[]; loadedSuccessfully: boolean }> })
            ._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: this._items, loadedSuccessfully: ok });
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.AdditionalLoadingCalls++;
    }
}

function makeMockEntity(id: string): BaseEntity {
    return {
        EntityInfo: { Name: 'Items', PrimaryKeys: [{ Name: 'ID' }] },
        PrimaryKey: {
            ToString: () => id,
            Equals: (other: { KeyValuePairs?: { FieldName: string; Value: unknown }[] }) =>
                other?.KeyValuePairs?.some(kv => kv.FieldName === 'ID' && kv.Value === id) ?? false,
            KeyValuePairs: [{ FieldName: 'ID', Value: id }],
        },
        ID: id,
    } as unknown as BaseEntity;
}

function makeFilteredConfig(debounceMs?: number): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        Type: 'entity',
        EntityName: 'Items',
        PropertyName: '_items',
        Filter: `UserID='u1'`,
        DebounceTime: debounceMs,
    });
}

function updateEvent(entity: BaseEntity): BaseEntityEvent {
    return { type: 'save', saveSubType: 'update', baseEntity: entity } as BaseEntityEvent;
}

function setupEngine(debounceMs?: number): { engine: TestEngine; dataChanges: EngineDataChangeEvent[] } {
    const engine = new TestEngine();
    engine.SetConfigsForTest([makeFilteredConfig(debounceMs)]);
    const dataChanges: EngineDataChangeEvent[] = [];
    engine.DataChange$.subscribe(e => dataChanges.push(e));
    return { engine, dataChanges };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('BaseEngine.ProcessEntityEvents — OR over the whole window', () => {
    it('runs the refresh when ANY event needs it, even when an already-applied event lands LAST', async () => {
        const { engine, dataChanges } = setupEngine();
        const cachedInstance = makeMockEntity('a');
        engine._items = [cachedInstance];
        const freshInstance = makeMockEntity('b'); // saved via a different object; array has never seen it

        // Pre-fix, last-event-wins would classify this batch by the in-place save and skip the refresh
        await engine.ProcessEntityEventsForTest([updateEvent(freshInstance), updateEvent(cachedInstance)]);

        expect(engine.LoadSingleConfigCalls).toBe(1);
        expect(engine.AdditionalLoadingCalls).toBe(1);
        expect(dataChanges).toHaveLength(0); // notification comes from the (stubbed) refresh
    });

    it('emits ONE notification when every event in the window was already applied', async () => {
        const { engine, dataChanges } = setupEngine();
        const a = makeMockEntity('a');
        const b = makeMockEntity('b');
        engine._items = [a, b];

        await engine.ProcessEntityEventsForTest([updateEvent(a), updateEvent(b)]);

        expect(engine.LoadSingleConfigCalls).toBe(0);
        expect(dataChanges).toHaveLength(1);
        expect(dataChanges[0].changeType).toBe('update');
        expect(dataChanges[0].affectedEntity).toBe(b); // latest already-applied event wins
    });

    it('silent deletes of absent rows neither trigger a refresh nor suppress the notify for applied events', async () => {
        const { engine, dataChanges } = setupEngine();
        const a = makeMockEntity('a');
        engine._items = [a];
        const deleteAbsent = {
            type: 'delete',
            baseEntity: makeMockEntity('regenerated-key'),
            payload: { OldValues: { ID: 'never-present' } },
        } as BaseEntityEvent;

        await engine.ProcessEntityEventsForTest([updateEvent(a), deleteAbsent]);

        expect(engine.LoadSingleConfigCalls).toBe(0);
        expect(dataChanges).toHaveLength(1);
        expect(dataChanges[0].changeType).toBe('update');
        expect(dataChanges[0].affectedEntity).toBe(a);
    });
});

describe('BaseEngine debounce buffering', () => {
    it('coalesces all events in a window into one batch — a masked fresh-instance save still triggers the refresh', async () => {
        vi.useFakeTimers();
        const { engine } = setupEngine(100);
        const cachedInstance = makeMockEntity('a');
        engine._items = [cachedInstance];
        const freshInstance = makeMockEntity('b');

        await engine.HandleEventForTest(updateEvent(freshInstance));
        await engine.HandleEventForTest(updateEvent(cachedInstance)); // in-place save lands LAST
        await vi.advanceTimersByTimeAsync(150);

        expect(engine.LoadSingleConfigCalls).toBe(1); // one refresh covers the whole window
    });

    it('reopens the buffer after a flush so later windows process independently', async () => {
        vi.useFakeTimers();
        const { engine } = setupEngine(100);

        await engine.HandleEventForTest(updateEvent(makeMockEntity('x')));
        await vi.advanceTimersByTimeAsync(150);
        await engine.HandleEventForTest(updateEvent(makeMockEntity('y')));
        await vi.advanceTimersByTimeAsync(150);

        expect(engine.LoadSingleConfigCalls).toBe(2);
    });
});

describe('BaseEngine event-refresh retry', () => {
    it('retries a transiently-failed refresh with backoff and notifies via the successful reload', async () => {
        vi.useFakeTimers();
        const { engine } = setupEngine();
        engine.LoadResults = [false, true];

        await engine.ProcessEntityEventsForTest([updateEvent(makeMockEntity('a'))]);
        expect(engine.LoadSingleConfigCalls).toBe(1); // initial attempt failed

        await vi.advanceTimersByTimeAsync(2000);
        expect(engine.LoadSingleConfigCalls).toBe(2); // retry ran and succeeded
        expect(engine.AdditionalLoadingCalls).toBe(2); // once after the batch, once after the successful retry
    });

    it('gives up after MaxEventRefreshRetries attempts', async () => {
        vi.useFakeTimers();
        const { engine } = setupEngine();
        engine.LoadResults = [false, false, false, false];

        await engine.ProcessEntityEventsForTest([updateEvent(makeMockEntity('a'))]);
        await vi.advanceTimersByTimeAsync(2000); // retry 1 (fails)
        await vi.advanceTimersByTimeAsync(4000); // retry 2 (fails)
        await vi.advanceTimersByTimeAsync(60000); // no further retries scheduled

        expect(engine.LoadSingleConfigCalls).toBe(3); // initial + 2 retries, then gave up
    });

    it('keeps at most one pending retry per property', async () => {
        vi.useFakeTimers();
        const { engine } = setupEngine();
        engine.LoadResults = [false, false, true];

        await engine.ProcessEntityEventsForTest([updateEvent(makeMockEntity('a'))]); // fails, schedules retry
        await engine.ProcessEntityEventsForTest([updateEvent(makeMockEntity('b'))]); // fails, retry already pending → no double-schedule
        expect(engine.LoadSingleConfigCalls).toBe(2);

        await vi.advanceTimersByTimeAsync(2000);
        expect(engine.LoadSingleConfigCalls).toBe(3); // exactly one retry fired

        await vi.advanceTimersByTimeAsync(60000);
        expect(engine.LoadSingleConfigCalls).toBe(3); // and nothing else was queued
    });
});
