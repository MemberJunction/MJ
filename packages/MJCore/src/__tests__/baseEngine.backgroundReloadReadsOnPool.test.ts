import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IRunViewProvider, RunViewResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';

/**
 * BaseEngine's background reloads of ENTITY configs (the debounced event refresh, its bounded retry, the expiration timer's refresh) run
 * detached from the write that triggered them, exactly like the template dataset reload. Their
 * RunView must therefore ask for pool reads (`RunViewParams.ReadOnPool`), never join a transaction another unit of
 * work opened on the same provider while the reload is in flight. A caller-driven load keeps the ambient transaction.
 */

/** The run-view provider double: records every RunViewParams the engine sends. */
class RecordingRunViewProvider {
    public readonly Params: RunViewParams[] = [];
    /** Outcome per call (shifted); defaults to success. */
    public Outcomes: boolean[] = [];
    public async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.Params.push(params);
        const ok = this.Outcomes.length > 0 ? (this.Outcomes.shift() as boolean) : true;
        return { Success: ok, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: ok ? '' : 'transient' } as RunViewResult<T>;
    }
    public async RunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        return Promise.all(params.map((p) => this.RunView<T>(p)));
    }
}

class EntityConfigEngine extends BaseEngine<EntityConfigEngine> {
    public _items: BaseEntity[] = [];
    public readonly Views = new RecordingRunViewProvider();

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected via UseConfigs
    }

    public UseConfigs(configs: BaseEnginePropertyConfig[]): void {
        this.AdoptConfigs(configs);
    }

    public override get RunViewProviderToUse(): IRunViewProvider {
        // the recording double implements the two members the load path calls
        return this.Views as unknown as IRunViewProvider;
    }

    public ProcessForTest(events: BaseEntityEvent[]): Promise<void> {
        return this.ProcessEntityEvents(events);
    }

    /** A caller-driven reload of one config, as RefreshItem / a forced Config makes it. */
    public CallerReload(config: BaseEnginePropertyConfig): Promise<void> {
        return this.LoadSingleConfig(config, { ID: 'u1' } as UserInfo, true);
    }
}

function itemEvent(id: string): BaseEntityEvent {
    // a partial event double carrying the fields the refresh path reads
    const entity = {
        EntityInfo: { Name: 'Items', PrimaryKeys: [{ Name: 'ID' }] },
        PrimaryKey: { ToString: () => id, KeyValuePairs: [{ FieldName: 'ID', Value: id }] },
        ID: id,
    } as unknown as BaseEntity;
    return { type: 'save', saveSubType: 'update', baseEntity: entity } as BaseEntityEvent;
}

/** A filtered config: forces the full-refresh (RunView) path instead of an in-memory mutation. */
function filteredConfig(): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Items', PropertyName: '_items', Filter: `UserID='u1'` });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('BaseEngine background entity-config reloads read on the pool', () => {
    it('the event-driven full refresh asks for pool reads', async () => {
        const engine = new EntityConfigEngine();
        engine.UseConfigs([filteredConfig()]);
        await engine.ProcessForTest([itemEvent('a')]);
        expect(engine.Views.Params).toHaveLength(1);
        expect(engine.Views.Params[0].ReadOnPool).toBe(true);
    });

    it('the bounded retry of a failed event refresh asks for pool reads too', async () => {
        vi.useFakeTimers();
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined); // the failed first load is logged
        const engine = new EntityConfigEngine();
        engine.UseConfigs([filteredConfig()]);
        engine.Views.Outcomes = [false, true];
        await engine.ProcessForTest([itemEvent('a')]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(engine.Views.Params.map((p) => p.ReadOnPool)).toEqual([true, true]);
        expect(logged.mock.calls.flat().map(String).join(' ')).toContain('Failed to load Items into _items: transient');
    });

    it('the expiration timer\'s refresh asks for pool reads; a caller\'s RefreshItem does not (I-N4)', async () => {
        vi.useFakeTimers();
        const engine = new EntityConfigEngine();
        const config = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Items', PropertyName: '_items', Expiration: 1000 });
        engine.UseConfigs([config]);
        await engine.CallerReload(config); // the load arms the expiration timer
        await vi.advanceTimersByTimeAsync(1000);
        await engine.RefreshItem('_items');
        expect(engine.Views.Params.map((p) => p.ReadOnPool)).toEqual([undefined, true, undefined]);
    });

    it('a caller-driven reload keeps the ambient transaction (no ReadOnPool sent)', async () => {
        const engine = new EntityConfigEngine();
        const config = filteredConfig();
        engine.UseConfigs([config]);
        await engine.CallerReload(config);
        expect(engine.Views.Params[0].ReadOnPool).toBeUndefined();
    });
});
