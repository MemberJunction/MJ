import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, RemoteInvalidatePayload } from '../generic/baseEngine';
import { BaseEntityEvent } from '../generic/baseEntity';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { RunView, RunViewParams } from '../views/runView';

/**
 * A remote-invalidate event without row data used to reload the whole config (#6204): a burst of
 * 736 query saves cost 3,808 full 'MJ: Query Fields' reloads. When every event in a round names its
 * row, the engine now re-reads only those rows — one keyed RunView per round — and applies them in
 * place. Anything it cannot do that way still reloads the whole config.
 */

interface Row {
    ID: string;
    Name: string;
    Version: number;
}

const ENTITY = 'MJ: Query Fields';

/** Entity metadata the engine resolves: one UUID primary key, or a composite one. */
function providerWith(compositeKey = false): IMetadataProvider {
    const id = { Name: 'ID', NeedsQuotes: true, IsUniqueIdentifier: true };
    const second = { Name: 'Sequence', NeedsQuotes: false, IsUniqueIdentifier: false };
    return {
        EntityByName: (name: string) => (name === ENTITY ? { Name: ENTITY, PrimaryKeys: compositeKey ? [id, second] : [id], FirstPrimaryKey: id } : undefined),
    } as unknown as IMetadataProvider;
}

class TestEngine extends BaseEngine<TestEngine> {
    public Rows: Row[] = [];
    public Rebuilds = 0;
    private provider: IMetadataProvider = providerWith();
    private configs: BaseEnginePropertyConfig[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected with Setup
    }

    public override get ProviderToUse(): IMetadataProvider {
        return this.provider;
    }

    public async Setup(config: BaseEnginePropertyConfig, provider: IMetadataProvider = providerWith()): Promise<void> {
        this.provider = provider;
        this.configs = [config];
        await this.LoadSingleConfig(config, {} as UserInfo);
    }

    public Handle(event: BaseEntityEvent): Promise<boolean> {
        return this.HandleRemoteInvalidateEvent(event);
    }

    protected override AutoRefreshConfigsForEntity(entityName: string): BaseEnginePropertyConfig[] {
        return this.configs.filter(c => c.EntityName?.toLowerCase() === entityName.toLowerCase());
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.Rebuilds++;
    }
}

/** The database the RunView spy answers from, and every RunView it was asked for. */
let database: Row[] = [];
let calls: RunViewParams[] = [];
let failKeyedRead = false;

function ok(rows: Row[]): RunViewResult {
    return { Success: true, Results: rows.map(r => ({ ...r })), RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

/** Answers `ID IN ('a', 'b')` against `database`; anything else returns the whole table. */
function answer(params: RunViewParams): RunViewResult {
    const match = /ID IN \(([^)]*)\)/.exec(params.ExtraFilter ?? '');
    if (!match) {
        return ok(database);
    }
    if (failKeyedRead) {
        return { ...ok([]), Success: false, ErrorMessage: 'boom' };
    }
    // Case-insensitive, as SQL Server compares uniqueidentifiers.
    const ids = match[1].split(',').map(s => s.trim().replace(/^'|'$/g, '').toLowerCase());
    return ok(database.filter(r => ids.includes(r.ID.toLowerCase())));
}

const keyedCalls = () => calls.filter(c => /ID IN \(/.test(c.ExtraFilter ?? ''));
const fullCalls = () => calls.filter(c => !/ID IN \(/.test(c.ExtraFilter ?? ''));

function event(id: string | null, action: 'save' | 'delete' = 'save'): BaseEntityEvent {
    const payload: RemoteInvalidatePayload = {
        action,
        primaryKeyValues: id === null ? null : JSON.stringify([{ FieldName: 'ID', Value: id }]),
        sourceServerId: 'peer',
        timestamp: new Date().toISOString(),
    };
    return { type: 'remote-invalidate', entityName: ENTITY, payload, baseEntity: null };
}

function config(overrides: Partial<BaseEnginePropertyConfig> = {}): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({ Type: 'entity', EntityName: ENTITY, PropertyName: 'Rows', AutoRefresh: true, ResultType: 'simple', ...overrides });
}

const SHIPPED_DELAY = BaseEngine.ExternalChangeFollowUpDelayMs;
const SHIPPED_MAX_KEYS = BaseEngine.KeyedRefetchMaxKeys;

beforeEach(() => {
    BaseEngine.ExternalChangeFollowUpDelayMs = 0;
    database = [
        { ID: 'a', Name: 'A', Version: 1 },
        { ID: 'b', Name: 'B', Version: 1 },
        { ID: 'c', Name: 'C', Version: 1 },
    ];
    calls = [];
    failKeyedRead = false;
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
        calls.push(params);
        return answer(params);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    BaseEngine.ExternalChangeFollowUpDelayMs = SHIPPED_DELAY;
    BaseEngine.KeyedRefetchMaxKeys = SHIPPED_MAX_KEYS;
});

async function loadedEngine(cfg = config(), provider = providerWith()): Promise<TestEngine> {
    const engine = new TestEngine();
    await engine.Setup(cfg, provider);
    calls = [];
    engine.Rebuilds = 0;
    return engine;
}

describe('BaseEngine keyed re-fetch on a no-row-data invalidation', () => {
    it('re-reads only the named rows for a burst, never the whole table', async () => {
        const engine = await loadedEngine();
        database = database.map(r => ({ ...r, Version: 2 }));
        await Promise.all(['a', 'b', 'c', 'a', 'b'].map(id => engine.Handle(event(id))));

        expect(fullCalls()).toHaveLength(0);
        // The first event starts a round; every event that arrives during it shares the next one.
        expect(keyedCalls().length).toBeGreaterThanOrEqual(1);
        expect(keyedCalls().length).toBeLessThanOrEqual(2);
        expect(keyedCalls().every(c => c.BypassCache === true)).toBe(true);
        expect(engine.Rows.map(r => r.Version)).toEqual([2, 2, 2]);
    });

    it('upserts returned rows and removes requested rows that came back missing', async () => {
        const engine = await loadedEngine();
        database = [
            { ID: 'a', Name: 'A2', Version: 2 }, // changed
            { ID: 'b', Name: 'B', Version: 1 },  // untouched, not requested
            { ID: 'd', Name: 'D', Version: 1 },  // new
            // 'c' deleted (or no longer visible)
        ];
        await Promise.all([engine.Handle(event('a')), engine.Handle(event('c')), engine.Handle(event('d'))]);

        expect(fullCalls()).toHaveLength(0);
        expect(engine.Rows.map(r => `${r.ID}:${r.Version}`).sort()).toEqual(['a:2', 'b:1', 'd:1']);
        expect(engine.Rows.find(r => r.ID === 'a')?.Name).toBe('A2');
    });

    it('ANDs the key list onto the config filter and matches UUID keys case-insensitively', async () => {
        const engine = await loadedEngine(config({ Filter: "Name <> 'Z'" }));
        database[0].Version = 5;
        await engine.Handle(event('A'));
        expect(keyedCalls()[0].ExtraFilter).toBe("(Name <> 'Z') AND ID IN ('A')");
        expect(keyedCalls()[0].CacheLocal).toBe(false);
        // The returned 'a' replaces the held 'a' rather than being appended or removed.
        expect(engine.Rows).toHaveLength(3);
        expect(engine.Rows.find(r => r.ID === 'a')?.Version).toBe(5);
    });

    it('escapes quotes in key values', async () => {
        const engine = await loadedEngine();
        await engine.Handle(event("x'); DROP TABLE y; --"));
        expect(keyedCalls()[0].ExtraFilter).toBe("ID IN ('x''); DROP TABLE y; --')");
    });

    it('rebuilds derived state once per round', async () => {
        const engine = await loadedEngine();
        await engine.Handle(event('a'));
        expect(engine.Rebuilds).toBe(1);
    });

    describe('falls back to a full reload', () => {
        it('when an event in the round names no row', async () => {
            const engine = await loadedEngine();
            await engine.Handle(event(null));
            expect(keyedCalls()).toHaveLength(0);
            expect(fullCalls()).toHaveLength(1);
        });

        it('when the config has an OrderBy', async () => {
            const engine = await loadedEngine(config({ OrderBy: 'Name' }));
            await engine.Handle(event('a'));
            expect(keyedCalls()).toHaveLength(0);
            expect(fullCalls()).toHaveLength(1);
        });

        it('when the entity has a composite primary key', async () => {
            const engine = await loadedEngine(config(), providerWith(true));
            await engine.Handle(event('a'));
            expect(keyedCalls()).toHaveLength(0);
            expect(fullCalls()).toHaveLength(1);
        });

        it('when the round names more rows than KeyedRefetchMaxKeys', async () => {
            BaseEngine.KeyedRefetchMaxKeys = 0;
            const engine = await loadedEngine();
            await engine.Handle(event('a'));
            expect(keyedCalls()).toHaveLength(0);
            expect(fullCalls()).toHaveLength(1);
        });

        it('when the keyed read fails', async () => {
            const engine = await loadedEngine();
            failKeyedRead = true;
            database[0].Version = 9;
            await engine.Handle(event('a'));
            expect(keyedCalls()).toHaveLength(1);
            expect(fullCalls()).toHaveLength(1);
            expect(engine.Rows.find(r => r.ID === 'a')?.Version).toBe(9);
        });
    });

    it('a delete that cannot be applied in place (plain rows) re-reads only that row', async () => {
        const engine = await loadedEngine();
        database = database.filter(r => r.ID !== 'b');
        await engine.Handle(event('b', 'delete'));
        expect(fullCalls()).toHaveLength(0);
        expect(keyedCalls()).toHaveLength(1);
        expect(engine.Rows.map(r => r.ID)).toEqual(['a', 'c']);
    });
});
