import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { RunViewResult } from '../generic/interfaces';

/**
 * Coverage for the timed refresh driven by `BaseEnginePropertyConfig.Expiration`.
 *
 * A config with an Expiration exists to pick up changes made outside this process (another
 * server, an admin script, a direct database edit). Two failures would leave such a change
 * unseen indefinitely:
 *   1. the tick reading through the server cache, whose slot never expires and never hears
 *      about out-of-process changes — so every tick must bypass the cache;
 *   2. one failed tick ending the refresh for good, since only a successful load re-arms the
 *      timer — so a failed or thrown tick must re-arm it, and a failed first load must still
 *      start it.
 * And setting the interval to 0 must stop the timers, which the re-arm must not undo.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: unknown[] = [];
    /** bypassCache value captured for each LoadSingleConfig invocation, in order. */
    public BypassCacheArgs: boolean[] = [];
    /** Outcome per load (shifted per call): 'ok', 'fail' (Success false) or 'throw'. Defaults to 'ok'. */
    public Outcomes: Array<'ok' | 'fail' | 'throw'> = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // no-op — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    /** Runs the real LoadConfigs (with the reads stubbed below), as Config does. */
    public async LoadForTest(configs: BaseEnginePropertyConfig[]): Promise<void> {
        await this.LoadConfigs(configs, undefined as unknown as UserInfo);
    }

    protected override CheckPermissionsOrSkipAll(configs: BaseEnginePropertyConfig[]): BaseEnginePropertyConfig[] {
        return configs;
    }

    protected override async LoadMultipleEntityConfigs(
        configs: BaseEnginePropertyConfig[],
        contextUser: UserInfo,
        bypassCache: boolean = false,
    ): Promise<void> {
        for (const c of configs) {
            await this.LoadSingleConfig(c, contextUser, bypassCache);
        }
    }

    protected override RegisterCacheChangeCallbacks(): void {
        // no provider in these tests
    }

    /** Stands in for the first successful load, which arms the timer. */
    public ArmForTest(config: BaseEnginePropertyConfig): void {
        this.HandleSingleViewResult(config, { Success: true, Results: [] } as unknown as RunViewResult);
    }

    // Stub the real read (needs a provider) but route the result through HandleSingleViewResult,
    // which is where a successful load re-arms the timer.
    protected override async LoadSingleConfig(
        config: BaseEnginePropertyConfig,
        _contextUser: UserInfo,
        bypassCache: boolean = false,
    ): Promise<void> {
        this.BypassCacheArgs.push(bypassCache);
        const outcome = this.Outcomes.length > 0 ? this.Outcomes.shift() : 'ok';
        if (outcome === 'throw') {
            throw new Error('connection reset');
        }
        const result = outcome === 'ok'
            ? { Success: true, Results: [] }
            : { Success: false, Results: [], ErrorMessage: 'query failed' };
        this.HandleSingleViewResult(config, result as unknown as RunViewResult);
    }
}

const EXPIRATION_MS = 1000;

function makeConfig(expiration?: number): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        Type: 'entity',
        EntityName: 'Items',
        PropertyName: '_items',
        AddToObject: false,
        ...(expiration !== undefined ? { Expiration: expiration } : {}),
    });
}

/** Runs one tick and lets its async refresh settle. */
async function tick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(EXPIRATION_MS);
}

describe('BaseEngine timed refresh (Expiration)', () => {
    let engine: TestEngine;
    let config: BaseEnginePropertyConfig;

    beforeEach(() => {
        vi.useFakeTimers();
        engine = new (TestEngine as unknown as new () => TestEngine)();
        config = makeConfig(EXPIRATION_MS);
        engine.SetConfigsForTest([config]);
        engine.ArmForTest(config);
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('reads the database, not the cache, on every tick', async () => {
        await tick();
        await tick();
        await tick();
        expect(engine.BypassCacheArgs).toEqual([true, true, true]);
    });

    it('RefreshItem on a config without Expiration still reads through the cache', async () => {
        const plain = makeConfig();
        engine.SetConfigsForTest([plain]);
        await engine.RefreshItem('_items');
        expect(engine.BypassCacheArgs).toEqual([false]);
    });

    it('keeps refreshing after a tick whose read returns Success false', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        engine.Outcomes = ['fail'];
        await tick();
        await tick();
        await tick();
        expect(engine.BypassCacheArgs).toHaveLength(3);
    });

    it('keeps refreshing after a tick whose read throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        engine.Outcomes = ['throw', 'throw'];
        await tick();
        await tick();
        await tick();
        await tick();
        expect(engine.BypassCacheArgs).toHaveLength(4);
    });

    it('arms exactly one timer per property, whether the tick succeeded or failed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        engine.Outcomes = ['ok', 'fail', 'throw', 'ok'];
        for (let i = 0; i < 4; i++) {
            await tick();
            expect(vi.getTimerCount()).toBe(1);
        }
    });

    it('stops when the dynamic config is removed', async () => {
        const dynamicConfig = makeConfig(EXPIRATION_MS);
        dynamicConfig.PropertyName = '_dynamic';
        await engine.AddDynamicConfig(dynamicConfig);
        engine.RemoveDynamicConfig('_dynamic');
        const before = engine.BypassCacheArgs.length;
        await tick();
        // Only the metadata config's tick ran; the removed dynamic one did not re-arm.
        expect(engine.BypassCacheArgs.length - before).toBe(1);
        expect(vi.getTimerCount()).toBe(1);
    });

    describe('when the load that arms the timer fails', () => {
        let fresh: TestEngine;

        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.clearAllTimers();
            fresh = new (TestEngine as unknown as new () => TestEngine)();
        });

        it('still starts the refresh after a read that returns Success false', async () => {
            fresh.Outcomes = ['fail'];
            await fresh.LoadForTest([makeConfig(EXPIRATION_MS)]);
            expect(vi.getTimerCount()).toBe(1);
            await tick();
            await tick();
            expect(fresh.BypassCacheArgs).toEqual([false, true, true]);
        });

        it('still starts the refresh after a read that throws', async () => {
            fresh.Outcomes = ['throw'];
            await expect(fresh.LoadForTest([makeConfig(EXPIRATION_MS)])).rejects.toThrow('connection reset');
            expect(vi.getTimerCount()).toBe(1);
            await tick();
            expect(fresh.BypassCacheArgs).toEqual([false, true]);
        });
    });

    describe('when the interval is disabled', () => {
        it('stops the timer on the reload that drops the Expiration', async () => {
            await engine.LoadForTest([makeConfig()]);
            expect(vi.getTimerCount()).toBe(0);
            const before = engine.BypassCacheArgs.length;
            for (let i = 0; i < 4; i++) {
                await tick();
            }
            expect(engine.BypassCacheArgs.length).toBe(before);
        });

        it('does not re-arm from a tick that was running when the Expiration was dropped', async () => {
            // The tick's refresh runs against a config that no longer has an Expiration, and no
            // reload ran to clear the timer — only the re-arm check stands between it and forever.
            engine.SetConfigsForTest([makeConfig()]);
            await tick();
            expect(vi.getTimerCount()).toBe(0);
            const before = engine.BypassCacheArgs.length;
            await tick();
            await tick();
            expect(engine.BypassCacheArgs.length).toBe(before);
        });
    });

    it('unrefs the timer so it does not keep a Node process alive', () => {
        const unref = vi.fn();
        vi.spyOn(globalThis, 'setTimeout').mockImplementation(
            (() => ({ unref })) as unknown as typeof setTimeout,
        );
        engine.ArmForTest(config);
        expect(unref).toHaveBeenCalledTimes(1);
    });
});
