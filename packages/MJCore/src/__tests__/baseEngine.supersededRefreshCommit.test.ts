import { describe, it, expect, afterEach, vi } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IRunViewProvider, RunViewResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';

/**
 * A full refresh that a newer refresh of the same property superseded still commits its rows when
 * the newer one hasn't committed yet. Dropping them left a forced load (`Config(true)`) returning
 * while the property still held its rows from before the caller's writes: the batch read a
 * debounced save event's per-property refresh overtook was discarded, and the load returned
 * before that refresh landed.
 */

class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public SetProviderForTest(provider: IRunViewProvider): void {
        (this as unknown as { _provider: IRunViewProvider })._provider = provider;
    }

    /** The full-load path: one batched read for every config. */
    public BatchLoadForTest(config: BaseEnginePropertyConfig): Promise<void> {
        return (this as unknown as {
            LoadMultipleEntityConfigs: (c: BaseEnginePropertyConfig[], u?: UserInfo) => Promise<void>;
        }).LoadMultipleEntityConfigs([config], undefined);
    }

    /** The per-property path a debounced save event takes. */
    public RefreshForTest(config: BaseEnginePropertyConfig): Promise<void> {
        return (this as unknown as {
            LoadSingleConfig: (c: BaseEnginePropertyConfig, u?: UserInfo) => Promise<void>;
        }).LoadSingleConfig(config, undefined);
    }
}

/** Answers every read, batched or single, in call order, each after its own delay. */
class DelayedProvider {
    public responses: Array<{ items: BaseEntity[]; delayMs: number }> = [];
    private call = 0;

    private next(): Promise<RunViewResult> {
        const response = this.responses[this.call++] ?? { items: [], delayMs: 0 };
        return new Promise((resolve) => setTimeout(() => resolve(makeResult(response.items)), response.delayMs));
    }

    public RunView<T = unknown>(_params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
        return this.next() as Promise<RunViewResult<T>>;
    }

    public async RunViews<T = unknown>(params: RunViewParams[], _contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        const results: RunViewResult<T>[] = [];
        for (let i = 0; i < params.length; i++) {
            results.push((await this.next()) as RunViewResult<T>);
        }
        return results;
    }
}

function makeItem(id: string): BaseEntity {
    return { ID: id, EntityInfo: { Name: 'Items' } } as unknown as BaseEntity;
}

function ids(items: BaseEntity[]): string[] {
    return items.map((i) => (i as unknown as { ID: string }).ID);
}

function makeResult(items: BaseEntity[]): RunViewResult {
    return {
        Success: true, Results: items, RowCount: items.length, TotalRowCount: items.length,
        ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '',
    } as unknown as RunViewResult;
}

function setup(): { engine: TestEngine; provider: DelayedProvider; config: BaseEnginePropertyConfig } {
    const engine = new TestEngine();
    const config = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Items', PropertyName: '_items', Filter: `UserID='u1'` });
    engine.SetConfigsForTest([config]);
    const provider = new DelayedProvider();
    engine.SetProviderForTest(provider as unknown as IRunViewProvider);
    engine._items = [makeItem('before')];
    return { engine, provider, config };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('BaseEngine: a superseded full refresh', () => {
    it('REGRESSION: a full load overtaken by a slower per-property refresh returns with its own rows, not the previous ones', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();
        provider.responses = [
            { items: [makeItem('load')], delayMs: 50 },    // the full load's batched read
            { items: [makeItem('event')], delayMs: 200 },  // the event refresh that starts during it
        ];

        const load = engine.BatchLoadForTest(config);
        const event = engine.RefreshForTest(config);
        await vi.advanceTimersByTimeAsync(60);
        await load;

        // On returning, the load must leave rows at least as new as its own read.
        expect(ids(engine._items)).toEqual(['load']);

        await vi.advanceTimersByTimeAsync(200);
        await event;
        // The newer refresh still lands on top.
        expect(ids(engine._items)).toEqual(['event']);
    });

    it('a superseded refresh still never overwrites a newer one that has committed', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();
        provider.responses = [
            { items: [makeItem('load')], delayMs: 200 },
            { items: [makeItem('event')], delayMs: 50 },
        ];

        const load = engine.BatchLoadForTest(config);
        const event = engine.RefreshForTest(config);
        await vi.advanceTimersByTimeAsync(300);
        await Promise.all([load, event]);

        expect(ids(engine._items)).toEqual(['event']);
    });

    it('an older per-property refresh never overwrites a newer full load that has committed', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();
        provider.responses = [
            { items: [makeItem('event')], delayMs: 200 },  // started first, lands last
            { items: [makeItem('load')], delayMs: 50 },
        ];

        const event = engine.RefreshForTest(config);
        const load = engine.BatchLoadForTest(config);
        await vi.advanceTimersByTimeAsync(300);
        await Promise.all([event, load]);

        expect(ids(engine._items)).toEqual(['load']);
    });

    it('the same holds for two per-property refreshes', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();
        provider.responses = [
            { items: [makeItem('first')], delayMs: 50 },
            { items: [makeItem('second')], delayMs: 200 },
        ];

        const first = engine.RefreshForTest(config);
        const second = engine.RefreshForTest(config);
        await vi.advanceTimersByTimeAsync(60);
        await first;
        expect(ids(engine._items)).toEqual(['first']);

        await vi.advanceTimersByTimeAsync(200);
        await second;
        expect(ids(engine._items)).toEqual(['second']);
    });
});
