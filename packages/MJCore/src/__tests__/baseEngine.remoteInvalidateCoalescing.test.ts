import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, RemoteInvalidatePayload } from '../generic/baseEngine';
import { BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';

/**
 * A remote-invalidate event that carries no row makes the engine reload the config. A burst of
 * such events for one config shares reloads: one runs, and every event that arrives while it runs
 * is covered by a single reload after it. Events that carry the row are applied in place, one by
 * one, and never wait for or start a reload.
 */

interface TestRow {
    ID: string;
    Version: number;
}

/** One reload the test has not let finish yet. */
interface PendingLoad {
    PropertyName: string;
    BypassCache: boolean;
    Release: (outcome?: 'ok' | 'fail' | 'throw') => void;
}

/** Test engine whose reloads finish only when the test releases them. */
class TestEngine extends BaseEngine<TestEngine> {
    /** What the database holds; a reload copies it into the matching property. */
    public Database: TestRow[] = [];
    public Rows: TestRow[] = [];
    public Other: TestRow[] = [];
    public Loads: PendingLoad[] = [];
    public LoadCount = 0;
    public AppliedInPlace = 0;
    private configs: BaseEnginePropertyConfig[] = [];
    private loadedOk: Map<string, boolean> = new Map();

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected with SetConfigs
    }

    public SetConfigs(configs: BaseEnginePropertyConfig[]): void {
        this.configs = configs;
    }

    public Handle(event: BaseEntityEvent): Promise<boolean> {
        return this.HandleRemoteInvalidateEvent(event);
    }

    /** Lets the oldest pending reload finish with the given outcome. */
    public ReleaseOldest(outcome: 'ok' | 'fail' | 'throw' = 'ok'): void {
        this.Loads.shift()?.Release(outcome);
    }

    protected override AutoRefreshConfigsForEntity(entityName: string): BaseEnginePropertyConfig[] {
        return this.configs.filter(c => c.EntityName?.trim().toLowerCase() === entityName.trim().toLowerCase());
    }

    protected override configLoadedSuccessfully(propertyName: string): boolean {
        return this.loadedOk.get(propertyName) ?? false;
    }

    protected override async LoadSingleConfig(config: BaseEnginePropertyConfig, _contextUser: UserInfo, bypassCache: boolean = false): Promise<void> {
        this.LoadCount++;
        const outcome = await new Promise<'ok' | 'fail' | 'throw'>((resolve) => {
            this.Loads.push({ PropertyName: config.PropertyName, BypassCache: bypassCache, Release: (o = 'ok') => resolve(o) });
        });
        if (outcome === 'throw') {
            throw new Error(`reload of ${config.PropertyName} failed`);
        }
        this.loadedOk.set(config.PropertyName, outcome === 'ok');
        if (outcome === 'ok') {
            this.SetProperty(config.PropertyName, this.Database.map(r => ({ ...r })));
        }
    }

    protected override async applyRemoteRecordData(configs: BaseEnginePropertyConfig[], _entityName: string, recordDataJSON: string): Promise<boolean> {
        const row = JSON.parse(recordDataJSON) as TestRow;
        for (const config of configs) {
            const rows = this.GetProperty(config.PropertyName);
            const index = rows.findIndex(r => r.ID === row.ID);
            if (index >= 0) rows[index] = row; else rows.push(row);
        }
        this.AppliedInPlace++;
        return true;
    }

    private GetProperty(propertyName: string): TestRow[] {
        return propertyName === 'Other' ? this.Other : this.Rows;
    }

    private SetProperty(propertyName: string, rows: TestRow[]): void {
        if (propertyName === 'Other') this.Other = rows; else this.Rows = rows;
    }
}

function makeConfig(entityName: string, propertyName: string): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({ Type: 'entity', EntityName: entityName, PropertyName: propertyName, AutoRefresh: true });
}

function remoteEvent(entityName: string, recordData?: TestRow): BaseEntityEvent {
    const payload: RemoteInvalidatePayload = {
        action: 'save',
        primaryKeyValues: null,
        sourceServerId: 'peer',
        timestamp: new Date().toISOString(),
        ...(recordData ? { recordData: JSON.stringify(recordData) } : {}),
    };
    return { type: 'remote-invalidate', entityName, payload, baseEntity: null };
}

/** Lets pending promise continuations run. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
}

function newEngine(): TestEngine {
    const engine = new TestEngine();
    engine.SetConfigs([makeConfig('MJ: Query Fields', 'Rows'), makeConfig('MJ: Queries', 'Other')]);
    return engine;
}

afterEach(() => {
    vi.useRealTimers();
});

describe('BaseEngine remote-invalidate reload coalescing', () => {
    it('reloads at most twice for a burst of events without a row, and ends on the last change', async () => {
        const engine = newEngine();
        const handled: Promise<boolean>[] = [];
        for (let version = 1; version <= 50; version++) {
            engine.Database = [{ ID: 'a', Version: version }];
            handled.push(engine.Handle(remoteEvent('MJ: Query Fields')));
            await settle();
        }
        expect(engine.LoadCount).toBe(1);

        engine.ReleaseOldest();
        await settle();
        engine.ReleaseOldest();
        const results = await Promise.all(handled);

        expect(engine.LoadCount).toBe(2);
        expect(results.every(r => r)).toBe(true);
        expect(engine.Rows).toEqual([{ ID: 'a', Version: 50 }]);
    });

    it('bypasses the cache on every reload it runs', async () => {
        const engine = newEngine();
        const first = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();
        const second = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();
        expect(engine.Loads.map(l => l.BypassCache)).toEqual([true]);
        engine.ReleaseOldest();
        await settle();
        expect(engine.Loads.map(l => l.BypassCache)).toEqual([true]);
        engine.ReleaseOldest();
        await Promise.all([first, second]);
    });

    it('runs exactly one trailing reload for an event that arrives while a reload is in flight', async () => {
        const engine = newEngine();
        engine.Database = [{ ID: 'a', Version: 1 }];
        const first = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();

        engine.Database = [{ ID: 'a', Version: 2 }];
        let lateSettled = false;
        const late = Promise.all([
            engine.Handle(remoteEvent('MJ: Query Fields')),
            engine.Handle(remoteEvent('MJ: Query Fields')),
            engine.Handle(remoteEvent('MJ: Query Fields')),
        ]).then(() => { lateSettled = true; });
        await settle();
        expect(engine.LoadCount).toBe(1);

        engine.ReleaseOldest();
        await settle();
        expect(lateSettled).toBe(false);
        expect(engine.LoadCount).toBe(2);

        engine.ReleaseOldest();
        await Promise.all([first, late]);
        expect(engine.LoadCount).toBe(2);
        expect(engine.Rows).toEqual([{ ID: 'a', Version: 2 }]);
    });

    it('applies events that carry the row in place, one per event, without reloading or waiting', async () => {
        const engine = newEngine();
        for (let version = 1; version <= 5; version++) {
            await engine.Handle(remoteEvent('MJ: Query Fields', { ID: `r${version}`, Version: version }));
        }
        expect(engine.AppliedInPlace).toBe(5);
        expect(engine.LoadCount).toBe(0);
        expect(engine.Rows.map(r => r.ID)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);

        // A row-carrying event that arrives during a reload is applied at once, not held behind it.
        const reload = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();
        await engine.Handle(remoteEvent('MJ: Query Fields', { ID: 'r6', Version: 6 }));
        expect(engine.AppliedInPlace).toBe(6);
        expect(engine.LoadCount).toBe(1);
        engine.ReleaseOldest();
        await reload;
        expect(engine.LoadCount).toBe(1);
    });

    it('reloads separate configs independently', async () => {
        const engine = newEngine();
        const a = [engine.Handle(remoteEvent('MJ: Query Fields')), engine.Handle(remoteEvent('MJ: Query Fields'))];
        const b = [engine.Handle(remoteEvent('MJ: Queries')), engine.Handle(remoteEvent('MJ: Queries'))];
        await settle();
        expect(engine.Loads.map(l => l.PropertyName).sort()).toEqual(['Other', 'Rows']);

        engine.ReleaseOldest();
        engine.ReleaseOldest();
        await settle();
        expect(engine.Loads.map(l => l.PropertyName).sort()).toEqual(['Other', 'Rows']);
        engine.ReleaseOldest();
        engine.ReleaseOldest();
        await Promise.all([...a, ...b]);
        expect(engine.LoadCount).toBe(4);
    });

    it('still runs the trailing reload when the reload in flight throws, and later bursts reload normally', async () => {
        const engine = newEngine();
        engine.Database = [{ ID: 'a', Version: 1 }];
        const first = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();
        engine.Database = [{ ID: 'a', Version: 2 }];
        const late = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();
        expect(engine.LoadCount).toBe(1);

        engine.ReleaseOldest('throw');
        await settle();
        expect(engine.LoadCount).toBe(2);
        engine.ReleaseOldest();
        await Promise.all([first, late]);
        expect(engine.Rows).toEqual([{ ID: 'a', Version: 2 }]);

        engine.Database = [{ ID: 'a', Version: 3 }];
        const next = engine.Handle(remoteEvent('MJ: Query Fields'));
        await settle();
        expect(engine.LoadCount).toBe(3);
        engine.ReleaseOldest();
        await next;
        expect(engine.Rows).toEqual([{ ID: 'a', Version: 3 }]);
    });

    it('schedules the bounded retry once when a coalesced reload fails transiently', async () => {
        vi.useFakeTimers();
        const engine = newEngine();
        engine.Database = [{ ID: 'a', Version: 1 }];
        const burst = [engine.Handle(remoteEvent('MJ: Query Fields')), engine.Handle(remoteEvent('MJ: Query Fields'))];
        await settle();
        expect(engine.LoadCount).toBe(1);
        engine.ReleaseOldest('fail');
        await settle();
        engine.ReleaseOldest('fail');
        await Promise.all(burst);
        expect(engine.LoadCount).toBe(2);

        await vi.advanceTimersByTimeAsync(2000);
        expect(engine.LoadCount).toBe(3);
        engine.ReleaseOldest();
        await settle();
        expect(engine.Rows).toEqual([{ ID: 'a', Version: 1 }]);
    });
});
