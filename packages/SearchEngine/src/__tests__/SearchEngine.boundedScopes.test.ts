/**
 * A scoped search is BOUNDED by its scope's rows — empty never means everything.
 *
 *  1. A non-global scope runs only its ENABLED provider rows. With none (no rows, or its only row disabled)
 *     it runs no provider and its decision is `Reachable: false` — the search path and `ExplainScope` agree.
 *     It used to run EVERY provider, so disabling a scope's last provider row widened it.
 *  2. A non-global scope hands providers a defined lane list for every lane type, even an empty one; the
 *     global / unconstrained path still hands them `undefined` (unscoped).
 *  3. An entity lane's rendered `ExtraFilter` bounds that entity for every provider: a hit another provider
 *     returns for that entity is kept only when its record satisfies the filter (read as the user, one read
 *     per entity per scope, fail closed). Only an `EntitySearchProvider` entry — judged by the engine-stamped
 *     `ProviderId`, not the declared `SourceType` — is exempt, because it applied the filter itself.
 *  4. A storage lane's `FolderPath` restricts: rendered empty, with an empty segment, or with traversal, the
 *     search is refused and the dry run marks the lane skipped — and the scope unreachable, even beside a
 *     healthy lane, because the real search refuses on the first unusable lane.
 *  5. A listed provider runs only when it is configured, available, and reads a lane kind the scope configures
 *     (`ConsumesLaneKinds`); otherwise it is never called (it cannot fall back to a default index), and the dry
 *     run reports the scope unreachable exactly when the search runs no provider.
 *  6. A `MJ: Content Items` hit promoted to its origin record is promoted per scope and held to the origin
 *     entity's lane `ExtraFilter` — whichever provider found it, since none read the origin row.
 *
 * Real code throughout: the real `SearchEngineBase` bundle assembly (only its cached rows are supplied), the
 * real `buildScopeConstraints` / `executeScopeBundle` / `ExplainScope`, stub providers that record the
 * constraints they were handed. Only `RunView` (the lane-filter read) and the metadata provider are faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunViewFn } = vi.hoisted(() => ({ mockRunViewFn: vi.fn() }));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return { ...actual, RunView: MockRunView, LogError: vi.fn(), LogStatus: vi.fn() };
});

import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, SearchEngineBase } from '@memberjunction/core-entities';
import type {
    MJSearchScopeEntity,
    MJSearchScopeEntityEntity,
    MJSearchScopeExternalIndexEntity,
    MJSearchScopeProviderEntity,
    MJSearchScopeStorageAccountEntity,
} from '@memberjunction/core-entities';
import { SearchEngine } from '../generic/SearchEngine';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import { EntitySearchProvider } from '../generic/EntitySearchProvider';
import { FullTextSearchProvider } from '../generic/FullTextSearchProvider';
import { TagSearchProvider } from '../generic/TagSearchProvider';
import { VectorSearchProvider } from '../generic/VectorSearchProvider';
import { StorageSearchProvider } from '../generic/StorageSearchProvider';
import { SearchEnricher } from '../generic/SearchEnricher';
import { AzureAISearchProvider } from '../providers/AzureAISearchProvider';
import { ElasticsearchSearchProvider } from '../providers/ElasticsearchSearchProvider';
import { OpenSearchSearchProvider } from '../providers/OpenSearchSearchProvider';
import { TypesenseSearchProvider } from '../providers/TypesenseSearchProvider';
import type { ScopeConstraints, SearchContext, SearchParams, SearchResultItem, SearchSource } from '../generic/search.types';
import type { EntitlementExplanation, LaneKind, ScopeExplanation } from '../generic/ScopeExplanation';

const SCOPE_ID = '101232A8-2E4D-47AF-B554-74594AA22C82';
const FULLTEXT_ID = '3252C44B-86EF-450B-9343-D6642828B4DE';
const VECTOR_ID = '2A096B90-1C80-4DFA-849A-1DB1A213F82E';
const ENTITY_ID = '875B7781-9049-4FC9-8A90-C51B1369F76B';
const EXTERNAL_ID = 'B0F9E849-A7DB-48FC-93E7-5A4445E4B095';
const AGENTS_ENTITY_ID = '5D02F118-C3CE-4B1D-9F27-64F72966B738';
const STORAGE_ACCOUNT_ID = 'B580928D-5F42-4BE2-8658-87A0BCC93CD6';
const AGENT_A = '3B283D77-02A3-4A8C-8A40-0A3A3BCB14D0';
const AGENT_B = '21A9DA16-1EAB-4258-AFBE-B55C1360A5A6';
const AGENTS = 'MJ: AI Agents';

/** The cached rows the real `SearchEngineBase` assembles a scope bundle from. */
interface ScopeRows {
    Scopes: MJSearchScopeEntity[];
    Providers: MJSearchScopeProviderEntity[];
    Entities: MJSearchScopeEntityEntity[];
    ExternalIndexes: MJSearchScopeExternalIndexEntity[];
    StorageAccounts: MJSearchScopeStorageAccountEntity[];
}

/** The real engine base with its cached rows supplied directly (no database load). */
class FakeSearchEngineBase extends SearchEngineBase {
    public Rows: ScopeRows = { Scopes: [], Providers: [], Entities: [], ExternalIndexes: [], StorageAccounts: [] };
    public static Fake(): FakeSearchEngineBase {
        return FakeSearchEngineBase.getInstance<FakeSearchEngineBase>();
    }
    public override get Scopes(): MJSearchScopeEntity[] { return this.Rows.Scopes; }
    public override get ScopeProviders(): MJSearchScopeProviderEntity[] { return this.Rows.Providers; }
    public override get ScopeEntities(): MJSearchScopeEntityEntity[] { return this.Rows.Entities; }
    public override get ScopeExternalIndexes(): MJSearchScopeExternalIndexEntity[] { return this.Rows.ExternalIndexes; }
    public override get ScopeStorageAccounts(): MJSearchScopeStorageAccountEntity[] { return this.Rows.StorageAccounts; }
}

/** The provider-list state `Search()` reads, reached without `Config()` (the metadata pipeline). */
interface ProviderEntry {
    Provider: BaseSearchProvider;
    ID: string;
    DisplayName: string;
    Icon: string;
    Priority: number;
    SupportsPreview: boolean;
    MaxResultsOverride: number | null;
    Record: object;
}
interface SearchEngineTestState {
    _providerEntries: ProviderEntry[];
    _configured: boolean;
}

/** The single entity the fake metadata knows, shaped as the engine's key handling reads it. */
const AGENTS_ENTITY = {
    ID: AGENTS_ENTITY_ID,
    Name: AGENTS,
    DisplayName: 'AI Agents',
    Icon: 'fa-solid fa-robot',
    FirstPrimaryKey: { Name: 'ID' },
    PrimaryKeys: [{ Name: 'ID' }],
};

class BoundedTestEngine extends SearchEngine {
    /** `ScopeDecisionJSON` of every search-log row written, in order. */
    public LoggedDecisions: string[] = [];

    public static Create(): BoundedTestEngine {
        return BoundedTestEngine.getInstance<BoundedTestEngine>();
    }

    public Inject(entries: ProviderEntry[]): void {
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = entries;
        state._configured = true;
        this.ClearResultCache();
        this.LoggedDecisions = [];
    }

    protected override get Base(): SearchEngineBase {
        return FakeSearchEngineBase.Fake();
    }

    protected override get ProviderToUse(): IMetadataProvider {
        const sink = this.LoggedDecisions;
        return {
            Entities: [AGENTS_ENTITY],
            EntityByName: (name: string) => (name.trim().toLowerCase() === AGENTS.toLowerCase() ? AGENTS_ENTITY : null),
            GetEntityObject: async () => {
                const row: { ScopeDecisionJSON?: string | null; Save: () => Promise<boolean> } = {
                    Save: async () => { sink.push(row.ScopeDecisionJSON ?? ''); return true; },
                };
                return row;
            },
        } as unknown as IMetadataProvider;
    }

    /** The permission pass has its own suites; here it passes everything so the lane step is what decides. */
    protected override async filterByPermissions(results: SearchResultItem[]): Promise<SearchResultItem[]> {
        return results;
    }

    protected override async explainEntitlement(): Promise<EntitlementExplanation> {
        return {
            Allowed: true, Level: 'Search', Source: 'DirectGrant', Reason: 'test grant',
            Principals: { UserID: 'U-1', AgentID: null, SkillID: null, PrimaryScopeRecordID: null },
        };
    }

    /** The decision the search path logged for its one scope. */
    public async LastDecision(): Promise<ScopeExplanation> {
        await vi.waitFor(() => expect(this.LoggedDecisions.length).toBeGreaterThan(0));
        const decisions = JSON.parse(this.LoggedDecisions[this.LoggedDecisions.length - 1]) as ScopeExplanation[];
        return decisions[0];
    }
}

/** Every lane kind: a test double that reads them all, so a scope's lane mix never decides whether it is called. */
const ALL_LANE_KINDS: readonly LaneKind[] = ['ExternalIndex', 'Entity', 'StorageAccount'];

/** A provider that records the constraints it was handed and returns copies of fixed hits. */
class RecordingProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource;
    public override readonly ConsumesLaneKinds: readonly LaneKind[];
    public Calls: Array<ScopeConstraints | undefined> = [];
    private hits: SearchResultItem[];
    public constructor(sourceType: SearchSource, hits: SearchResultItem[] = [], consumes: readonly LaneKind[] = ALL_LANE_KINDS) {
        super();
        this.SourceType = sourceType;
        this.ConsumesLaneKinds = consumes;
        this.hits = hits;
    }
    public override async Search(_q: string, _k: number, _f: unknown, _u: UserInfo, constraints?: ScopeConstraints): Promise<SearchResultItem[]> {
        this.Calls.push(constraints);
        return this.hits.map(h => ({ ...h }));
    }
}

/** A real `EntitySearchProvider` subclass (so it is exempt by class) returning fixed hits. */
class FixedEntityProvider extends EntitySearchProvider {
    public Calls = 0;
    private hits: SearchResultItem[];
    public constructor(hits: SearchResultItem[]) {
        super();
        this.hits = hits;
    }
    public override async Search(): Promise<SearchResultItem[]> {
        this.Calls++;
        return this.hits.map(h => ({ ...h }));
    }
}

function entry(id: string, provider: BaseSearchProvider): ProviderEntry {
    return { Provider: provider, ID: id, DisplayName: id, Icon: '', Priority: 1, SupportsPreview: true, MaxResultsOverride: null, Record: {} };
}

function hit(recordID: string, sourceType: SearchSource, label: string, entityName: string = AGENTS): SearchResultItem {
    return {
        ID: `${sourceType}-${label}`, EntityName: entityName, RecordID: recordID, SourceType: sourceType,
        Title: label, RecordName: label, Snippet: '', Score: 0.9, ScoreBreakdown: {}, Tags: [],
        MatchedAt: new Date(), ResultType: 'entity-record',
    };
}

function scope(isGlobal = false): MJSearchScopeEntity {
    return {
        ID: SCOPE_ID, Name: 'Bounded test scope', IsGlobal: isGlobal, Status: 'Active', StartAt: null, EndAt: null,
        ScopeConfig: null, SearchContextConfig: null,
    } as unknown as MJSearchScopeEntity;
}

function providerRow(providerID: string, enabled = true): MJSearchScopeProviderEntity {
    return {
        ID: `${providerID}-row`, SearchScopeID: SCOPE_ID, SearchProviderID: providerID, Enabled: enabled, MaxResultsOverride: null,
    } as unknown as MJSearchScopeProviderEntity;
}

function entityLane(laneID: string, extraFilter: string | null): MJSearchScopeEntityEntity {
    return {
        ID: laneID, SearchScopeID: SCOPE_ID, EntityID: AGENTS_ENTITY_ID, ExtraFilter: extraFilter,
        UserSearchString: null, RequiredMetadataKeys: null,
    } as unknown as MJSearchScopeEntityEntity;
}

function vectorIndexLane(laneID: string): MJSearchScopeExternalIndexEntity {
    return {
        ID: laneID, SearchScopeID: SCOPE_ID, IndexType: 'Vector', VectorIndexID: 'D6E1A5C2-3F4B-4E8A-9C1D-2B7F0E9A8C11',
        ExternalIndexName: null, ExternalIndexConfig: null, MetadataFilter: null, RequiredMetadataKeys: null,
    } as unknown as MJSearchScopeExternalIndexEntity;
}

function storageLane(folderPath: string | null): MJSearchScopeStorageAccountEntity {
    return {
        ID: 'storage-lane', SearchScopeID: SCOPE_ID, FileStorageAccountID: STORAGE_ACCOUNT_ID, FolderPath: folderPath,
    } as unknown as MJSearchScopeStorageAccountEntity;
}

function setRows(rows: Partial<ScopeRows>): void {
    FakeSearchEngineBase.Fake().Rows = { Scopes: [scope()], Providers: [], Entities: [], ExternalIndexes: [], StorageAccounts: [], ...rows };
}

const user = { ID: 'U-1', Name: 'Test User', Email: 't@example.com', UserRoles: [] } as unknown as UserInfo;
let queryCounter = 0;
/** A fresh query each time, so no search is answered from the result cache. */
function scoped(context?: SearchContext): SearchParams {
    queryCounter++;
    return { Query: `bounded query ${queryCounter}`, ScopeIDs: [SCOPE_ID], MaxResults: 20, SearchContext: context };
}
/** The lane-filter reads issued, as their RunView params. */
function laneReads(): RunViewParams[] {
    return mockRunViewFn.mock.calls.map(c => c[0] as RunViewParams);
}

describe('a non-global scope runs only its enabled provider rows', () => {
    let engine: BoundedTestEngine;
    let fulltext: RecordingProvider;
    let vector: RecordingProvider;

    beforeEach(() => {
        mockRunViewFn.mockReset();
        engine = BoundedTestEngine.Create();
        fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a')]);
        vector = new RecordingProvider('vector', [hit(AGENT_A, 'vector', 'a')]);
        engine.Inject([entry(FULLTEXT_ID, fulltext), entry(VECTOR_ID, vector)]);
    });

    it('with no provider rows: no provider is called, nothing is returned, and the decision is Reachable:false', async () => {
        setRows({ Entities: [entityLane('lane-1', null)] });
        const result = await engine.Search(scoped(), user);

        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([]);
        expect(fulltext.Calls).toHaveLength(0);
        expect(vector.Calls).toHaveLength(0);
        const decision = await engine.LastDecision();
        expect(decision.Reachable).toBe(false);
        expect(decision.Unbounded).toBe(false);
        expect(decision.Diagnostics.join(' ')).toMatch(/no enabled provider rows/);
    });

    it('with its only provider row DISABLED: the same — disabling the last row no longer widens the scope', async () => {
        setRows({ Entities: [entityLane('lane-1', null)], Providers: [providerRow(FULLTEXT_ID, false)] });
        const result = await engine.Search(scoped(), user);

        expect(result.Results).toEqual([]);
        expect(fulltext.Calls).toHaveLength(0);
        expect(vector.Calls).toHaveLength(0);
        expect((await engine.LastDecision()).Reachable).toBe(false);
    });

    it('ExplainScope agrees: Reachable:false with the same diagnostic, for no rows and for a disabled row', async () => {
        for (const providers of [[], [providerRow(FULLTEXT_ID, false)]]) {
            setRows({ Entities: [entityLane('lane-1', null)], Providers: providers });
            const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
            expect(explanation.Reachable).toBe(false);
            expect(explanation.Unbounded).toBe(false);
            expect(explanation.Diagnostics.join(' ')).toMatch(/no enabled provider rows/);
        }
        expect(fulltext.Calls).toHaveLength(0);
    });

    it('with an enabled row: only that provider runs (positive control)', async () => {
        setRows({ Entities: [entityLane('lane-1', null)], Providers: [providerRow(FULLTEXT_ID)] });
        const result = await engine.Search(scoped(), user);

        expect(fulltext.Calls).toHaveLength(1);
        expect(vector.Calls).toHaveLength(0);
        expect(result.Results.map(r => r.RecordID)).toEqual([AGENT_A]);
        expect((await engine.LastDecision()).Reachable).toBe(true);
        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
        expect(explanation.Reachable).toBe(true);
    });

    it('with provider rows but NO lanes: reaches nothing (not everything), in the search and the dry run', async () => {
        setRows({ Providers: [providerRow(FULLTEXT_ID)] });
        const result = await engine.Search(scoped(), user);

        expect(result.Results).toEqual([]);
        expect(fulltext.Calls).toHaveLength(0);
        const decision = await engine.LastDecision();
        expect(decision.Reachable).toBe(false);
        expect(decision.Unbounded).toBe(false);
        expect(decision.Diagnostics.join(' ')).toMatch(/NO lanes/);
        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
        expect(explanation.Reachable).toBe(false);
        expect(explanation.Unbounded).toBe(false);
    });
});

describe('lane lists reach providers defined — empty means nothing; undefined stays unscoped', () => {
    let engine: BoundedTestEngine;
    let fulltext: RecordingProvider;
    let vector: RecordingProvider;

    beforeEach(() => {
        mockRunViewFn.mockReset().mockResolvedValue({ Success: true, Results: [] });
        engine = BoundedTestEngine.Create();
        fulltext = new RecordingProvider('fulltext');
        vector = new RecordingProvider('vector');
        engine.Inject([entry(FULLTEXT_ID, fulltext), entry(VECTOR_ID, vector)]);
    });

    it('a scope with only an entity lane hands every provider [] for its other lane types', async () => {
        setRows({ Entities: [entityLane('lane-1', null)], Providers: [providerRow(FULLTEXT_ID), providerRow(VECTOR_ID)] });
        await engine.Search(scoped(), user);

        for (const constraints of [fulltext.Calls[0], vector.Calls[0]]) {
            expect(constraints?.Entities?.map(e => e.EntityName)).toEqual([AGENTS]);
            expect(constraints?.ExternalIndexes).toEqual([]);
            expect(constraints?.StorageAccounts).toEqual([]);
        }
    });

    it('the unconstrained path (no scope) still runs every provider with undefined constraints', async () => {
        setRows({});
        queryCounter++;
        await engine.Search({ Query: `unscoped query ${queryCounter}`, MaxResults: 20 }, user);

        expect(fulltext.Calls).toEqual([undefined]);
        expect(vector.Calls).toEqual([undefined]);
    });

    it('a GLOBAL scope is unconstrained too: every provider runs, with undefined constraints', async () => {
        setRows({ Scopes: [scope(true)] });
        await engine.Search(scoped(), user);

        expect(fulltext.Calls).toEqual([undefined]);
        expect(vector.Calls).toEqual([undefined]);
    });
});

describe('an entity lane\'s ExtraFilter bounds that entity for every provider', () => {
    let engine: BoundedTestEngine;

    beforeEach(() => {
        mockRunViewFn.mockReset();
        engine = BoundedTestEngine.Create();
    });

    /** Inject the providers, give each a provider row, and give the scope one entity lane with `filter`. */
    function arrange(entries: ProviderEntry[], filter: string | null, extraLanes: MJSearchScopeEntityEntity[] = []): void {
        engine.Inject(entries);
        setRows({ Entities: [entityLane('lane-1', filter), ...extraLanes], Providers: entries.map(e => providerRow(e.ID)) });
    }

    it('drops a full-text hit outside the filter and keeps one inside it, reading as the user', async () => {
        const fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a'), hit(AGENT_B, 'fulltext', 'b')]);
        arrange([entry(FULLTEXT_ID, fulltext)], `ID='${AGENT_A}'`);
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: AGENT_A }] });

        const result = await engine.Search(scoped(), user);

        expect(result.Results.map(r => r.RecordID)).toEqual([AGENT_A]);
        expect(laneReads()).toHaveLength(1);
        const read = laneReads()[0];
        expect(read.EntityName).toBe(AGENTS);
        expect(read.ExtraFilter).toContain(`(ID='${AGENT_A}')`);
        expect(read.ExtraFilter).toContain(AGENT_B);
        expect(mockRunViewFn.mock.calls[0][1]).toBe(user);
    });

    it('applies to vector and 3rd-party hits as well — one read per entity for the whole scope', async () => {
        const vector = new RecordingProvider('vector', [hit(AGENT_A, 'vector', 'a'), hit(AGENT_B, 'vector', 'b')]);
        // The 3rd-party providers declare 'fulltext' (Elasticsearch, OpenSearch, Typesense, Azure) — a separate entry here.
        const external = new RecordingProvider('fulltext', [hit(AGENT_B, 'fulltext', 'b')]);
        arrange([entry(VECTOR_ID, vector), entry(EXTERNAL_ID, external)], `ID='${AGENT_A}'`);
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: AGENT_A }] });

        const result = await engine.Search(scoped(), user);

        expect(result.Results.map(r => r.RecordID)).toEqual([AGENT_A]);
        expect(laneReads()).toHaveLength(1);
    });

    it('exempts an EntitySearchProvider entry by its engine-stamped ProviderId, not by declared SourceType', async () => {
        const entityLaneProvider = new FixedEntityProvider([hit(AGENT_B, 'entity', 'entity-b')]);
        const spoofing = new RecordingProvider('entity', [hit(AGENT_B, 'entity', 'spoof-b')]);
        arrange([entry(ENTITY_ID, entityLaneProvider), entry(FULLTEXT_ID, spoofing)], `ID='${AGENT_A}'`);
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

        const result = await engine.Search(scoped(), user);

        // Both hits name AGENT_B, so fusion keeps one row; it must be the entity lane's own hit.
        expect(entityLaneProvider.Calls).toBe(1);
        expect(result.Results.map(r => r.ProviderId)).toEqual([ENTITY_ID]);
        // Only the spoofing provider's hit was checked against the filter.
        expect(laneReads()).toHaveLength(1);
        expect(laneReads()[0].ExtraFilter).toContain(AGENT_B);
    });

    it('fails closed: a failed read drops those hits, and so does a read that throws', async () => {
        const fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a')]);
        arrange([entry(FULLTEXT_ID, fulltext)], `ID='${AGENT_A}'`);

        mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'simulated' });
        expect((await engine.Search(scoped(), user)).Results).toEqual([]);

        mockRunViewFn.mockRejectedValueOnce(new Error('connection lost'));
        expect((await engine.Search(scoped(), user)).Results).toEqual([]);
    });

    it('leaves hits alone when the entity\'s lane has no ExtraFilter, or the hit is for another entity', async () => {
        const fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a'), hit('other-1', 'fulltext', 'other', 'MJ: Users')]);
        arrange([entry(FULLTEXT_ID, fulltext)], null);

        const result = await engine.Search(scoped(), user);

        expect(result.Results.map(r => r.RecordID).sort()).toEqual([AGENT_A, 'other-1'].sort());
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('ORs the filters of two lanes on one entity, and an unfiltered sibling lane lifts the bound', async () => {
        const fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a'), hit(AGENT_B, 'fulltext', 'b')]);
        arrange([entry(FULLTEXT_ID, fulltext)], `ID='${AGENT_A}'`, [entityLane('lane-2', `ID='${AGENT_B}'`)]);
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: AGENT_A }, { ID: AGENT_B }] });
        await engine.Search(scoped(), user);
        expect(laneReads()[0].ExtraFilter).toContain(`(ID='${AGENT_A}') OR (ID='${AGENT_B}')`);

        mockRunViewFn.mockClear();
        arrange([entry(FULLTEXT_ID, fulltext)], `ID='${AGENT_A}'`, [entityLane('lane-2', null)]);
        const result = await engine.Search(scoped(), user);
        expect(result.Results).toHaveLength(2);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('renders the filter exactly as the entity lane does — the same escaped context value', async () => {
        const fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a')]);
        arrange([entry(FULLTEXT_ID, fulltext)], `Name='{{ context.SecondaryScopes.Name }}'`);
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: AGENT_A }] });

        await engine.Search(scoped({ SecondaryScopes: { Name: "O'Brien" } }), user);

        expect(laneReads()[0].ExtraFilter).toContain(`(Name='O''Brien')`);
        expect(fulltext.Calls[0]?.Entities?.[0].ExtraFilter).toBe(`Name='O''Brien'`);
    });
});

describe('a storage lane\'s FolderPath restricts — it refuses rather than widens', () => {
    let engine: BoundedTestEngine;
    let storage: RecordingProvider;
    const CLIENT_PATH = 'clients/{{ context.SecondaryScopes.Client }}';

    beforeEach(() => {
        mockRunViewFn.mockReset();
        engine = BoundedTestEngine.Create();
        storage = new RecordingProvider('storage');
        engine.Inject([entry(FULLTEXT_ID, storage)]);
    });

    function arrange(folderPath: string | null): void {
        setRows({ StorageAccounts: [storageLane(folderPath)], Providers: [providerRow(FULLTEXT_ID)] });
    }

    it('a FolderPath that renders empty refuses the search (it would have been the whole account)', async () => {
        arrange('{{ context.SecondaryScopes.Client }}');
        const result = await engine.Search(scoped({ SecondaryScopes: {} }), user);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/FolderPath .* could not be rendered safely/);
        expect(storage.Calls).toHaveLength(0);
    });

    it('a FolderPath whose interpolated segment renders empty refuses the search (`clients/` is every client)', async () => {
        arrange(CLIENT_PATH);
        const result = await engine.Search(scoped({ SecondaryScopes: {} }), user);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/empty segment/);
        expect(storage.Calls).toHaveLength(0);
    });

    it('a FolderPath that interpolates ".." refuses the search instead of stripping it', async () => {
        arrange(CLIENT_PATH);
        for (const client of ['..', '../other']) {
            const result = await engine.Search(scoped({ SecondaryScopes: { Client: client } }), user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toMatch(/refused/);
        }
        expect(storage.Calls).toHaveLength(0);
    });

    it('ExplainScope marks the lane Skipped with the reason, and the scope unreachable', async () => {
        arrange(CLIENT_PATH);
        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID], SearchContext: { SecondaryScopes: { Client: '..' } } }, user);

        expect(explanation.Lanes).toHaveLength(1);
        expect(explanation.Lanes[0].Status).toBe('Skipped');
        expect(explanation.Lanes[0].Reason).toMatch(/FolderPath/);
        expect(explanation.Reachable).toBe(false);
    });

    it('a FolderPath that renders every segment reaches the provider as rendered', async () => {
        arrange(CLIENT_PATH);
        const result = await engine.Search(scoped({ SecondaryScopes: { Client: 'acme' } }), user);

        expect(result.Success).toBe(true);
        expect(storage.Calls[0]?.StorageAccounts?.[0].FolderPath).toBe('clients/acme');
        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID], SearchContext: { SecondaryScopes: { Client: 'acme' } } }, user);
        expect(explanation.Lanes[0].Status).toBe('Active');
    });
});

describe('a FolderPath problem beside a healthy lane: the dry run says unreachable, as the search refuses', () => {
    let engine: BoundedTestEngine;
    let provider: RecordingProvider;
    const CLIENT_PATH = 'clients/{{ context.SecondaryScopes.Client }}';

    beforeEach(() => {
        mockRunViewFn.mockReset();
        engine = BoundedTestEngine.Create();
        provider = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a')]);
        engine.Inject([entry(FULLTEXT_ID, provider)]);
        setRows({ Entities: [entityLane('lane-1', null)], StorageAccounts: [storageLane(CLIENT_PATH)], Providers: [providerRow(FULLTEXT_ID)] });
    });

    it('marks only the storage lane Skipped, yet reports the scope unreachable — the real search is refused', async () => {
        const context: SearchContext = { SecondaryScopes: { Client: '..' } };
        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID], SearchContext: context }, user);

        expect(explanation.Lanes.map(l => [l.Kind, l.Status])).toEqual([['Entity', 'Active'], ['StorageAccount', 'Skipped']]);
        expect(explanation.Reachable).toBe(false);
        expect(explanation.Diagnostics.join(' ')).toMatch(/a real search would be refused/);

        const result = await engine.Search(scoped(context), user);
        expect(result.Success).toBe(false);
        expect(provider.Calls).toHaveLength(0);
    });

    it('control: with the FolderPath rendering, both lanes are Active and the scope is reachable and searched', async () => {
        const context: SearchContext = { SecondaryScopes: { Client: 'acme' } };
        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID], SearchContext: context }, user);
        expect(explanation.Lanes.every(l => l.Status === 'Active')).toBe(true);
        expect(explanation.Reachable).toBe(true);

        expect((await engine.Search(scoped(context), user)).Success).toBe(true);
        expect(provider.Calls).toHaveLength(1);
    });
});

describe('a listed provider runs only when it reads a lane kind the scope configures — dry run and search agree', () => {
    let engine: BoundedTestEngine;
    let vector: VectorSearchProvider;
    let vectorSearch: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockRunViewFn.mockReset();
        engine = BoundedTestEngine.Create();
        // The real provider, so its real lane declaration decides. Marked available and its Search stubbed: no index is queried.
        vector = new VectorSearchProvider();
        vi.spyOn(vector, 'IsAvailable').mockReturnValue(true);
        vectorSearch = vi.spyOn(vector, 'Search').mockResolvedValue([hit(AGENT_A, 'vector', 'a')]);
        engine.Inject([entry(VECTOR_ID, vector)]);
    });

    it('a Vector provider row over an entity lane only (the guide\'s old example) reaches nothing, in the dry run and the search', async () => {
        setRows({ Entities: [entityLane('lane-1', null)], Providers: [providerRow(VECTOR_ID)] });

        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
        expect(explanation.Reachable).toBe(false);
        expect(explanation.Diagnostics.join(' ')).toMatch(/none of this scope's providers reads a lane kind it configures/);

        const result = await engine.Search(scoped(), user);
        expect(result.Results).toEqual([]);
        expect(vectorSearch).not.toHaveBeenCalled();
        const decision = await engine.LastDecision();
        expect(decision.Reachable).toBe(false);
        expect(decision.Diagnostics.join(' ')).toMatch(/none of this scope's providers reads a lane kind it configures/);
    });

    it('control: with a Vector external-index lane added, the same row is reachable and the provider is called', async () => {
        setRows({ Entities: [entityLane('lane-1', null)], ExternalIndexes: [vectorIndexLane('ix-1')], Providers: [providerRow(VECTOR_ID)] });

        const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
        expect(explanation.Reachable).toBe(true);
        const result = await engine.Search(scoped(), user);
        expect(vectorSearch).toHaveBeenCalledTimes(1);
        expect(result.Results.map(r => r.RecordID)).toEqual([AGENT_A]);
        expect((await engine.LastDecision()).Reachable).toBe(true);
    });

    it('a provider row naming no configured provider, or an unavailable one, is unreachable in the dry run as in the search', async () => {
        for (const arrange of [
            () => setRows({ Entities: [entityLane('lane-1', null)], ExternalIndexes: [vectorIndexLane('ix-1')], Providers: [providerRow(ENTITY_ID)] }),
            () => {
                setRows({ Entities: [entityLane('lane-1', null)], ExternalIndexes: [vectorIndexLane('ix-1')], Providers: [providerRow(VECTOR_ID)] });
                vi.spyOn(vector, 'IsAvailable').mockReturnValue(false);
            },
        ]) {
            arrange();
            const [explanation] = await engine.ExplainScope({ ScopeIDs: [SCOPE_ID] }, user);
            expect(explanation.Reachable).toBe(false);
            expect(explanation.Diagnostics.join(' ')).toMatch(/name no configured, available provider/);
            await engine.Search(scoped(), user);
            expect((await engine.LastDecision()).Reachable).toBe(false);
        }
        expect(vectorSearch).not.toHaveBeenCalled();
    });

    it('never calls a provider whose lane kinds are all empty, so an old `?.length` provider cannot fall back to its default index', async () => {
        /** A third-party provider written before `[]` meant "nothing": an empty list reads as unscoped. */
        class LegacyDefaultIndexProvider extends BaseSearchProvider {
            public readonly SourceType: SearchSource = 'fulltext';
            public Calls = 0;
            public override async Search(_q: string, _k: number, _f: unknown, _u: UserInfo, c?: ScopeConstraints): Promise<SearchResultItem[]> {
                this.Calls++;
                return c?.ExternalIndexes?.length ? [] : [hit(AGENT_B, 'fulltext', 'default-index-doc')];
            }
        }
        const legacy = new LegacyDefaultIndexProvider();
        const fulltext = new RecordingProvider('fulltext', [hit(AGENT_A, 'fulltext', 'a')], ['Entity']);
        engine.Inject([entry(FULLTEXT_ID, fulltext), entry(EXTERNAL_ID, legacy)]);
        setRows({ Entities: [entityLane('lane-1', null)], Providers: [providerRow(FULLTEXT_ID), providerRow(EXTERNAL_ID)] });

        const result = await engine.Search(scoped(), user);

        expect(legacy.ConsumesLaneKinds).toEqual(['ExternalIndex']); // the base-class default
        expect(legacy.Calls).toBe(0);
        expect(fulltext.Calls).toHaveLength(1);
        expect(result.Results.map(r => r.RecordID)).toEqual([AGENT_A]);
        expect((await engine.LastDecision()).Reachable).toBe(true);
    });

    it('declares a lane kind for every shipped provider, and the ExtraFilter capability only on the entity provider', () => {
        const declared = (p: BaseSearchProvider) => [p.ConsumesLaneKinds, p.AppliesLaneExtraFilter];
        expect(declared(new EntitySearchProvider())).toEqual([['Entity'], true]);
        expect(declared(new FullTextSearchProvider())).toEqual([['Entity'], false]);
        expect(declared(new TagSearchProvider())).toEqual([['Entity'], false]);
        expect(declared(new VectorSearchProvider())).toEqual([['ExternalIndex'], false]);
        expect(declared(new StorageSearchProvider())).toEqual([['StorageAccount'], false]);
        const externals = [new AzureAISearchProvider(), new ElasticsearchSearchProvider(), new OpenSearchSearchProvider(), new TypesenseSearchProvider()];
        for (const external of externals) {
            expect(declared(external)).toEqual([['ExternalIndex'], false]);
        }
    });
});

describe('the lane ExtraFilter exemption is a provider capability, resolved through the engine-stamped provider', () => {
    let engine: BoundedTestEngine;

    beforeEach(() => {
        mockRunViewFn.mockReset().mockResolvedValue({ Success: true, Results: [] });
        engine = BoundedTestEngine.Create();
    });

    function arrange(provider: BaseSearchProvider): void {
        engine.Inject([entry(FULLTEXT_ID, provider)]);
        setRows({ Entities: [entityLane('lane-1', `ID='${AGENT_A}'`)], Providers: [providerRow(FULLTEXT_ID)] });
    }

    it('exempts a provider that declares AppliesLaneExtraFilter, whatever its class', async () => {
        class SelfFilteringProvider extends RecordingProvider {
            public override readonly AppliesLaneExtraFilter: boolean = true;
        }
        arrange(new SelfFilteringProvider('fulltext', [hit(AGENT_B, 'fulltext', 'b')], ['Entity']));

        const result = await engine.Search(scoped(), user);

        expect(result.Results.map(r => r.RecordID)).toEqual([AGENT_B]);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('re-checks an EntitySearchProvider subclass that overrides the capability off (it changed Search)', async () => {
        class UnfilteredEntityProvider extends FixedEntityProvider {
            public override readonly AppliesLaneExtraFilter: boolean = false;
        }
        arrange(new UnfilteredEntityProvider([hit(AGENT_B, 'entity', 'b')]));

        const result = await engine.Search(scoped(), user);

        expect(result.Results).toEqual([]);
        expect(laneReads()).toHaveLength(1);
        expect(laneReads()[0].ExtraFilter).toContain(AGENT_B);
    });
});

describe('a content item promoted to its origin record is held to the origin entity\'s lane ExtraFilter', () => {
    const CONTENT_ITEMS = 'MJ: Content Items';
    let engine: BoundedTestEngine;

    /** A `MJ: Content Items` hit whose metadata names the agent it was derived from, as the vector index stores it. */
    function contentItemHit(contentItemID: string, originAgentID: string, sourceType: SearchSource): SearchResultItem {
        return {
            ...hit(contentItemID, sourceType, `content-${originAgentID}`, CONTENT_ITEMS),
            ResultType: 'content-item',
            RawMetadata: JSON.stringify({ Entity: AGENTS, RecordID: originAgentID }),
        };
    }

    beforeEach(() => {
        mockRunViewFn.mockReset();
        // The lane read returns the agents that satisfy the lane filter `ID='<agent A>'`.
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: AGENT_A }] });
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        engine = BoundedTestEngine.Create();
    });

    it('drops a vector content-item hit whose origin is outside the bound and keeps the one inside it', async () => {
        const vector = new RecordingProvider('vector', [contentItemHit('ci-in', AGENT_A, 'vector'), contentItemHit('ci-out', AGENT_B, 'vector')]);
        engine.Inject([entry(VECTOR_ID, vector)]);
        setRows({
            Entities: [entityLane('lane-1', `ID='${AGENT_A}'`)], ExternalIndexes: [vectorIndexLane('ix-1')], Providers: [providerRow(VECTOR_ID)],
        });

        const result = await engine.Search(scoped(), user);

        expect(result.Results.map(r => [r.EntityName, r.RecordID, r.PromotedFromContentItemID])).toEqual([[AGENTS, AGENT_A, 'ci-in']]);
        expect(laneReads()).toHaveLength(1);
        expect(laneReads()[0].ExtraFilter).toContain(`(ID='${AGENT_A}')`);
        expect(laneReads()[0].ExtraFilter).toContain(AGENT_B);
    });

    it('re-checks a hit the ENTITY provider found on a content item: it applied no filter to the origin row', async () => {
        const entityLaneProvider = new FixedEntityProvider([contentItemHit('ci-out', AGENT_B, 'entity')]);
        engine.Inject([entry(ENTITY_ID, entityLaneProvider)]);
        setRows({ Entities: [entityLane('lane-1', `ID='${AGENT_A}'`)], Providers: [providerRow(ENTITY_ID)] });

        const result = await engine.Search(scoped(), user);

        expect(entityLaneProvider.Calls).toBe(1);
        expect(result.Results).toEqual([]);
        expect(laneReads()).toHaveLength(1);
        expect(laneReads()[0].ExtraFilter).toContain(AGENT_B);
    });

    it('promotes a scoped search\'s content items once (per scope), and an unscoped search\'s after fusion', async () => {
        const promote = vi.spyOn(SearchEnricher.prototype, 'ExcludeEntitySourcedContentItems');
        const vector = new RecordingProvider('vector', [contentItemHit('ci-in', AGENT_A, 'vector')]);
        engine.Inject([entry(VECTOR_ID, vector)]);
        setRows({
            Entities: [entityLane('lane-1', `ID='${AGENT_A}'`)], ExternalIndexes: [vectorIndexLane('ix-1')], Providers: [providerRow(VECTOR_ID)],
        });

        await engine.Search(scoped(), user);
        expect(promote).toHaveBeenCalledTimes(1);

        promote.mockClear();
        queryCounter++;
        const unscoped = await engine.Search({ Query: `unscoped promotion ${queryCounter}`, MaxResults: 20 }, user);
        expect(promote).toHaveBeenCalledTimes(1);
        expect(unscoped.Results.map(r => [r.EntityName, r.PromotedFromContentItemID])).toEqual([[AGENTS, 'ci-in']]);
        promote.mockRestore();
    });
});
