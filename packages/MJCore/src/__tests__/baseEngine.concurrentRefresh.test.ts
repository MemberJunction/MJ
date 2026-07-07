import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IRunViewProvider, RunViewResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';

/**
 * Regression coverage for the concurrent-full-refresh race that shipped with the
 * short-debounce change in PR #3018.
 *
 * The setup that triggers it: a config that CANNOT use immediate array mutation
 * (has a Filter and/or OrderBy — e.g. UserInfoEngine's per-user '_UserApplications')
 * always takes the full-refresh path (LoadSingleConfig → LoadSingleEntityConfig →
 * RunView → assign the whole array). When a user makes several changes in one
 * config-dialog save, each save's BaseEntity event lands in its OWN debounce window
 * (the GraphQL round-trip commonly exceeds the 200ms debounce), so the engine fires
 * a SEPARATE full refresh per save. Those RunViews overlap, and — with no ordering
 * guard — whichever RunView RESOLVES last wins, not whichever was INITIATED last. An
 * earlier-initiated refresh that read a staler snapshot but resolves late clobbers the
 * cache, which then sits "one operation behind" until a full page reload reconciles it.
 *
 * The fix: a per-property monotonic refresh generation. Only the latest-INITIATED
 * refresh may commit its results; any refresh superseded while its RunView was in
 * flight drops its (staler) snapshot instead of overwriting the newer one.
 *
 * These tests drive resolution timing with fake timers so the ordering is explicit and
 * deterministic — the older refresh is made to resolve strictly AFTER the newer one,
 * which is exactly the interleaving the bug needs and real microtask scheduling would
 * otherwise leave to chance.
 */

/** Test engine that exposes the protected full-refresh path and lets us inject a provider. */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // no-op for tests — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public SetProviderForTest(provider: IRunViewProvider): void {
        // Bind the provider directly (bypassing SetProvider's instance-registry side effects).
        (this as unknown as { _provider: IRunViewProvider })._provider = provider;
    }

    /** Kicks off a real full refresh (the LoadSingleConfig → LoadSingleEntityConfig path). */
    public RefreshForTest(config: BaseEnginePropertyConfig): Promise<void> {
        return (this as unknown as {
            LoadSingleConfig: (c: BaseEnginePropertyConfig, u?: UserInfo) => Promise<void>;
        }).LoadSingleConfig(config, undefined);
    }
}

/**
 * Provider whose RunView resolves after a per-call delay, so a test can force a specific
 * resolution ORDER across overlapping calls independent of initiation order. `responses`
 * is consumed in call order (call 0, call 1, ...).
 */
class DelayedRunViewProvider {
    public responses: Array<{ items: BaseEntity[]; delayMs: number }> = [];
    public callCount = 0;

    public RunView<T = unknown>(_params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
        const response = this.responses[this.callCount] ?? { items: [], delayMs: 0 };
        this.callCount++;
        return new Promise<RunViewResult<T>>((resolve) => {
            setTimeout(() => resolve(makeResult(response.items) as RunViewResult<T>), response.delayMs);
        });
    }

    public RunViews(): Promise<RunViewResult[]> {
        return Promise.resolve([]);
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
        Success: true,
        Results: items,
        RowCount: items.length,
        TotalRowCount: items.length,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
    } as unknown as RunViewResult;
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

function setup(): { engine: TestEngine; provider: DelayedRunViewProvider; config: BaseEnginePropertyConfig } {
    const engine = new TestEngine();
    const config = makeFilteredConfig();
    engine.SetConfigsForTest([config]);
    const provider = new DelayedRunViewProvider();
    engine.SetProviderForTest(provider as unknown as IRunViewProvider);
    return { engine, provider, config };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('BaseEngine concurrent full-refresh ordering guard', () => {
    it('commits the latest-INITIATED refresh even when an earlier one resolves LAST', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();

        // Older refresh (RunView call 0) is SLOW → resolves last with a stale snapshot.
        // Newer refresh (RunView call 1) is FAST → resolves first with the fresh snapshot.
        provider.responses = [
            { items: [makeItem('stale')], delayMs: 100 },
            { items: [makeItem('fresh')], delayMs: 10 },
        ];

        const older = engine.RefreshForTest(config); // generation 1 → RunView call 0
        const newer = engine.RefreshForTest(config); // generation 2 → RunView call 1
        expect(provider.callCount).toBe(2);

        await vi.advanceTimersByTimeAsync(200);
        await Promise.all([older, newer]);

        // The stale (older) snapshot resolves LAST but must NOT clobber the latest-initiated
        // (fresh) one. Pre-fix this is ['stale'] because the last-RESOLVED refresh wins.
        expect(ids(engine._items)).toEqual(['fresh']);
    });

    it('commits the latest refresh when the newer one also resolves last', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();

        // Newer refresh resolves last here too — the correct outcome regardless of the guard,
        // guarding against a fix that would wrongly drop the freshest result.
        provider.responses = [
            { items: [makeItem('stale')], delayMs: 10 },
            { items: [makeItem('fresh')], delayMs: 100 },
        ];

        const older = engine.RefreshForTest(config);
        const newer = engine.RefreshForTest(config);

        await vi.advanceTimersByTimeAsync(200);
        await Promise.all([older, newer]);

        expect(ids(engine._items)).toEqual(['fresh']);
    });

    it('a lone full refresh still commits its results (guard is a no-op on the normal path)', async () => {
        vi.useFakeTimers();
        const { engine, provider, config } = setup();
        provider.responses = [{ items: [makeItem('only')], delayMs: 10 }];

        const only = engine.RefreshForTest(config);
        await vi.advanceTimersByTimeAsync(50);
        await only;

        expect(ids(engine._items)).toEqual(['only']);
    });
});
