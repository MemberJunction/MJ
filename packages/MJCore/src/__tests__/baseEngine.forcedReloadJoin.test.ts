/**
 * A forced `Config(true)` that arrives while another load is running reads again once that load
 * finishes. The running load may have read before the caller's own writes, so returning its result
 * would leave those writes out until something else refreshed the engine.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { EntityInfo } from '../generic/entityInfo';
import { IMetadataProvider } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { ClientSmartCacheTestProvider } from './mocks/ClientSmartCacheTestProvider';

const ENTITY_ID = 'E0000000-0000-0000-0000-0000000010AD';
const WIDGETS = new EntityInfo({
    ID: ENTITY_ID, Name: 'Widgets', SchemaName: 'dbo', BaseTable: 'Widget', BaseView: 'vwWidgets', IncludeInAPI: true,
    Fields: [{ ID: 'w-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Widgets', Type: 'nvarchar', IsPrimaryKey: true, NeedsQuotes: true }],
});

/** The rows the stand-in server holds. Each load reads them when it starts. */
let server: string[] = [];
/** One release per load that has read and not yet landed, oldest first. */
let pendingLoads: Array<() => void> = [];

/** An engine whose load reads {@link server} at once and lands only when the test releases it. */
class GatedEngine extends BaseEngine<GatedEngine> {
    public Rows: string[] = [];
    public LoadCount = 0;

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Load([{ Type: 'entity', EntityName: 'Widgets', PropertyName: 'Rows' }], provider!, forceRefresh, contextUser);
    }

    protected override async LoadConfigs(_configs: Partial<BaseEnginePropertyConfig>[], _contextUser: UserInfo): Promise<void> {
        this.LoadCount++;
        const snapshot = [...server];
        await new Promise<void>((resolve) => pendingLoads.push(resolve));
        this.Rows = snapshot;
    }
}

/** Lets pending callbacks run, so a released load lands and a queued reload starts. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Releases the oldest load still in flight and lets what follows it run. */
async function landNextLoad(): Promise<void> {
    expect(pendingLoads.length).toBeGreaterThan(0);
    pendingLoads.shift()!();
    await settle();
}

describe('BaseEngine: a forced load that arrives during another load', () => {
    let provider: ClientSmartCacheTestProvider;
    let engine: GatedEngine;

    beforeEach(() => {
        server = ['a'];
        pendingLoads = [];
        provider = new ClientSmartCacheTestProvider({ Entity: WIDGETS, ServerRows: () => [] });
        engine = new GatedEngine();
    });

    /**
     * Starts a load and waits until its read has seen the server and is in flight. The load comes
     * back wrapped, because an async function would otherwise wait for the load itself.
     */
    async function startLoad(forceRefresh: boolean): Promise<{ Done: Promise<void> }> {
        const load = engine.Config(forceRefresh, undefined, provider);
        await settle();
        return { Done: load };
    }

    it('REGRESSION: reads again after the running load, so the caller sees its own write', async () => {
        const { Done: running } = await startLoad(true);
        server = ['a', 'b'];
        const forced = engine.Config(true, undefined, provider);

        await landNextLoad();
        await running;
        await landNextLoad();
        await forced;

        expect(engine.LoadCount).toBe(2);
        expect(engine.Rows).toEqual(['a', 'b']);
    });

    it('shares one extra read among forced calls that arrive during the same load', async () => {
        const { Done: running } = await startLoad(false);
        server = ['a', 'b'];
        const forced = [1, 2, 3].map(() => engine.Config(true, undefined, provider));

        await landNextLoad();
        await running;
        await landNextLoad();
        await Promise.all(forced);

        expect(engine.LoadCount).toBe(2);
        expect(pendingLoads).toHaveLength(0);
        expect(engine.Rows).toEqual(['a', 'b']);
    });

    it('a call without forceRefresh waits for the running load and does not read again', async () => {
        const { Done: running } = await startLoad(true);
        server = ['a', 'b'];
        const joined = engine.Config(false, undefined, provider);

        await landNextLoad();
        await Promise.all([running, joined]);

        expect(engine.LoadCount).toBe(1);
        expect(pendingLoads).toHaveLength(0);
        expect(engine.Rows).toEqual(['a']);
    });

    it('a forced call that arrives during the extra read gets a read of its own', async () => {
        const { Done: running } = await startLoad(true);
        const first = engine.Config(true, undefined, provider);
        await landNextLoad(); // the extra read for `first` starts and sees ['a']
        await running;

        server = ['a', 'c'];
        const second = engine.Config(true, undefined, provider);
        await landNextLoad();
        await first;
        await landNextLoad();
        await second;

        expect(engine.LoadCount).toBe(3);
        expect(engine.Rows).toEqual(['a', 'c']);
    });
});
