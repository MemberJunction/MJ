import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { CacheChangedEvent } from '../generic/localCacheManager';

/**
 * A peer's `removed` event carries no rows, so the engine reloads the config. Events for one
 * property that arrive while a reload is running share one follow-up reload instead of each
 * starting their own.
 */

/** Test engine whose reloads finish only when the test releases them. */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: unknown[] = [];
    public loadsStarted = 0;
    public loadsFinished = 0;
    private releases: Array<() => void> = [];

    public static get Instance(): TestEngine {
        return TestEngine.getInstance<TestEngine>();
    }

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are passed straight to the handler
    }

    protected override async LoadSingleConfig(_config: BaseEnginePropertyConfig, _contextUser: UserInfo): Promise<void> {
        this.loadsStarted++;
        await new Promise<void>((resolve) => this.releases.push(resolve));
        this.loadsFinished++;
    }

    /** Lets the oldest pending reload finish. */
    public ReleaseOne(): void {
        this.releases.shift()?.();
    }

    public OnExternalCacheChangeForTest(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        return (this as unknown as {
            OnExternalCacheChange: (c: BaseEnginePropertyConfig, e: CacheChangedEvent) => Promise<void>;
        }).OnExternalCacheChange(config, event);
    }
}

const REMOVED = { Action: 'removed' } as unknown as CacheChangedEvent;

function makeConfig(propertyName: string): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'MJ: AI Agent Notes', PropertyName: propertyName });
}

/** Lets pending promise continuations run. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe('BaseEngine.OnExternalCacheChange reload coalescing', () => {
    it('runs one follow-up reload for any number of events that arrive during a reload', async () => {
        const engine = TestEngine.Instance;
        const config = makeConfig('_items');

        const first = engine.OnExternalCacheChangeForTest(config, REMOVED);
        await settle();
        const burst = Array.from({ length: 20 }, () => engine.OnExternalCacheChangeForTest(config, REMOVED));
        await settle();
        expect(engine.loadsStarted).toBe(1);

        engine.ReleaseOne();
        await settle();
        expect(engine.loadsStarted).toBe(2);

        engine.ReleaseOne();
        await Promise.all([first, ...burst]);
        expect(engine.loadsStarted).toBe(2);
        expect(engine.loadsFinished).toBe(2);
    });

    it('settles a caller only after a reload that started after its event', async () => {
        const engine = TestEngine.Instance;
        const config = makeConfig('_items');
        const before = engine.loadsFinished;

        void engine.OnExternalCacheChangeForTest(config, REMOVED);
        await settle();
        let lateSettled = false;
        const late = engine.OnExternalCacheChangeForTest(config, REMOVED).then(() => { lateSettled = true; });

        engine.ReleaseOne();
        await settle();
        expect(lateSettled).toBe(false);

        engine.ReleaseOne();
        await late;
        expect(engine.loadsFinished - before).toBe(2);
    });

    it('does not coalesce events for different properties', async () => {
        const engine = TestEngine.Instance;
        const started = engine.loadsStarted;

        const a = engine.OnExternalCacheChangeForTest(makeConfig('_a'), REMOVED);
        const b = engine.OnExternalCacheChangeForTest(makeConfig('_b'), REMOVED);
        await settle();
        expect(engine.loadsStarted - started).toBe(2);

        engine.ReleaseOne();
        engine.ReleaseOne();
        await Promise.all([a, b]);
    });

    it('starts a fresh reload for an event after the previous reloads finished', async () => {
        const engine = TestEngine.Instance;
        const config = makeConfig('_items');
        const started = engine.loadsStarted;

        const first = engine.OnExternalCacheChangeForTest(config, REMOVED);
        await settle();
        engine.ReleaseOne();
        await first;

        const second = engine.OnExternalCacheChangeForTest(config, REMOVED);
        await settle();
        expect(engine.loadsStarted - started).toBe(2);
        engine.ReleaseOne();
        await second;
    });
});
