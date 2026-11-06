import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    CanonGraphEngine,
    ComputeGraphRRFScore,
    GraphEngine,
    LoadGraphEdgeProviders,
    RegisterGraphExpansionService,
    type GraphExpansionParams,
    type GraphExpansionResult,
    type GraphSeedNode,
    type IGraphExpansionService,
} from '@memberjunction/core-entities';
import { GraphSearchProvider } from '../generic/GraphSearchProvider';
import { SearchFusion } from '../generic/SearchFusion';
import type { SearchResultItem } from '../generic/search.types';

function makeUser(id: string, roles: string[] = ['Analyst']): UserInfo {
    return { ID: id, Name: id, Email: `${id}@example.com`, Type: 'User', UserRoles: roles.map((r) => ({ UserID: id, RoleID: `role-${r}`, Role: r })) } as unknown as UserInfo;
}

const caller = makeUser('u-caller');
const reader = makeUser('u-reader');

/** A service returning a fixed expansion and recording what it was asked. */
function fixedService(result: GraphExpansionResult, seeds: GraphSeedNode[]): { Service: IGraphExpansionService; Calls: GraphExpansionParams[] } {
    const calls: GraphExpansionParams[] = [];
    return {
        Calls: calls,
        Service: {
            ResolveSeeds: async () => seeds,
            Expand: async (params) => {
                calls.push(params);
                return result;
            },
        },
    };
}

const seeds: GraphSeedNode[] = [
    { EntityName: 'MJ: Graph Concepts', RecordID: 'concept-open-ar', Title: 'Open AR', SeedScore: 0.9 },
    { EntityName: 'MJ: Graph Concepts', RecordID: 'concept-revenue', Title: 'Revenue', SeedScore: 0.8 },
];

const expansion: GraphExpansionResult = {
    Nodes: [
        {
            NodeID: 'k-view',
            EntityName: 'MJ: Entity Alternate Base Views',
            RecordID: 'view-001',
            Title: 'Invoices.Open',
            Snippet: 'Canonical open AR view',
            GraphName: 'MJ Canon',
            NodeKind: 'View',
            SeedScore: 0.9,
            SeedRank: 1,
            SeedTitle: 'Open AR',
            PathEdges: [{ FromNodeID: 'k-c', ToNodeID: 'k-view', EdgeType: 'Defined By', Weight: 0.95 }],
        },
        {
            NodeID: 'k-query',
            EntityName: 'MJ: Queries',
            RecordID: 'query-002',
            Title: 'AR Aging Summary',
            GraphName: 'MJ Canon',
            NodeKind: 'Query',
            SeedScore: 0.9,
            SeedRank: 1,
            SeedTitle: 'Open AR',
            PathEdges: [
                { FromNodeID: 'k-c', ToNodeID: 'k-mid', EdgeType: 'Narrower Than', Weight: 0.8 },
                { FromNodeID: 'k-mid', ToNodeID: 'k-query', EdgeType: 'Measured By', Weight: 0.75 },
            ],
        },
        {
            NodeID: 'k-rev-view',
            EntityName: 'MJ: Entity Alternate Base Views',
            RecordID: 'view-rev',
            Title: 'Revenue View',
            NodeKind: 'View',
            SeedScore: 0.8,
            SeedRank: 2,
            SeedTitle: 'Revenue',
            PathEdges: [{ FromNodeID: 'k-r', ToNodeID: 'k-rev-view', EdgeType: 'Defined By', Weight: 0.95 }],
        },
        {
            NodeID: 'k-weak',
            EntityName: 'Invoices',
            RecordID: 'inv-weak',
            Title: 'Peripheral',
            SeedScore: 0.5,
            SeedRank: 1,
            SeedTitle: 'Open AR',
            PathEdges: [{ FromNodeID: 'k-c', ToNodeID: 'k-weak', EdgeType: 'Related To', Weight: 0.2 }],
        },
    ],
    Edges: [],
};

describe('GraphSearchProvider', () => {
    beforeEach(() => RegisterGraphExpansionService(null));

    it('is unavailable, and searches nothing, when no graph expansion service is registered', async () => {
        const provider = new GraphSearchProvider();
        expect(provider.IsAvailable()).toBe(false);
        expect(await provider.Search('Open AR', 10, undefined, caller)).toEqual([]);
    });

    it('uses the service registered for the process', () => {
        const { Service } = fixedService(expansion, seeds);
        RegisterGraphExpansionService(Service);
        expect(new GraphSearchProvider().IsAvailable()).toBe(true);
    });

    it('ranks by hop-attenuated RRF (1/(k + seedRank + 15*hops) x product(weights) x seedScore) and drops low path weights', async () => {
        const { Service, Calls } = fixedService(expansion, seeds);
        const results = await new GraphSearchProvider(Service).Search('Open AR', 10, undefined, caller);

        expect(Calls[0].MaxDepth).toBe(2);
        expect(Calls[0].MaxNodes).toBe(25);
        expect(Calls[0].MinWeight).toBe(0.25);
        // inv-weak: path weight 0.5 * 0.2 = 0.10 < MinWeight 0.25
        expect(results.map((r) => r.RecordID)).toEqual(['view-001', 'view-rev', 'query-002']);
        expect(results[0].Score).toBeCloseTo((1 / (60 + 1 + 15)) * 0.9 * 0.95, 12);
        expect(results[1].Score).toBeCloseTo((1 / (60 + 2 + 15)) * 0.8 * 0.95, 12);
        expect(results[2].Score).toBeCloseTo((1 / (60 + 1 + 30)) * 0.9 * 0.8 * 0.75, 12);
        expect(results[0].Score).toBe(ComputeGraphRRFScore(expansion.Nodes[0]));
        expect(results[0].SourceType).toBe('SemanticGraph');
        expect(results[2].Snippet).toBe('"Open AR" --[Narrower Than (0.80)]--> --[Measured By (0.75)]--> Query "AR Aging Summary"');
    });

    it('clamps scope-supplied MaxNodes to 200 and depth to 4', async () => {
        const { Service, Calls } = fixedService(expansion, seeds);
        await new GraphSearchProvider(Service).Search('Open AR', 10, undefined, caller, { ScopeConfig: { maxNodes: 9999, maxDepth: 12 } });
        expect(Calls[0].MaxNodes).toBe(200);
        expect(Calls[0].MaxDepth).toBe(4);
    });

    it('hands the audience to the expansion service so it applies it to the seeds and during traversal', async () => {
        const { Service, Calls } = fixedService(expansion, seeds);
        const seedAudiences: Array<string[] | undefined> = [];
        const recording: IGraphExpansionService = {
            ResolveSeeds: async (q, g, u, p, audienceReaders) => {
                seedAudiences.push(audienceReaders?.map((r) => r.ID));
                return Service.ResolveSeeds(q, g, u, p, audienceReaders);
            },
            Expand: (params, u, p) => Service.Expand(params, u, p),
        };
        await new GraphSearchProvider(recording).Search('Open AR', 10, undefined, caller, { AudienceReaders: [reader] });
        expect(seedAudiences).toEqual([[reader.ID]]);
        expect(Calls[0].AudienceReaders?.map((r) => r.ID)).toEqual([reader.ID]);
    });

    it('fuses with lexical lanes, boosting a node both lanes found', async () => {
        const { Service } = fixedService(expansion, seeds);
        const graph = await new GraphSearchProvider(Service).Search('Open AR', 10, undefined, caller);
        const lexical: SearchResultItem[] = [
            { ID: 'doc', EntityName: 'Documents', RecordID: 'doc', SourceType: 'fulltext', ResultType: 'entity-record', Title: 'Doc', Snippet: '', Score: 0.88, ScoreBreakdown: { FullText: 0.88 }, Tags: [], MatchedAt: new Date() },
            { ID: 'view-001', EntityName: 'MJ: Entity Alternate Base Views', RecordID: 'view-001', SourceType: 'fulltext', ResultType: 'entity-record', Title: 'Invoices.Open', Snippet: '', Score: 0.72, ScoreBreakdown: { FullText: 0.72 }, Tags: [], MatchedAt: new Date() },
        ];
        const fused = new SearchFusion().Fuse([{ Source: 'fulltext', Results: lexical }, { Source: 'SemanticGraph', Results: graph }], 10);
        expect(fused[0].RecordID).toBe('view-001');
    });
});

/**
 * End to end through the engine-backed service: a reader who cannot see the middle node stops the
 * lane from producing the node behind it.
 */
describe('GraphSearchProvider over CanonGraphEngine', () => {
    const conceptEntityId = '22222222-2222-4222-8222-222222222205';
    const accountsEntityId = '33333333-3333-4333-8333-333333333302';
    const graphId = '11111111-1111-4111-8111-111111111102';
    const conceptId = '77777777-7777-4777-8777-777777777701';
    const hidden: Record<string, string[]> = {};

    const entity = (id: string, name: string, nameField?: string): EntityInfo =>
        ({
            ID: id,
            Name: name,
            DisplayNameOrName: name,
            FirstPrimaryKey: { Name: 'ID' },
            NameField: nameField ? { Name: nameField } : undefined,
            Fields: [],
            AlternateBaseViews: [],
            GetUserPermisions: () => ({ CanRead: true }),
            UserExemptFromRowLevelSecurity: () => true,
        }) as unknown as EntityInfo;

    const entities: EntityInfo[] = [
        entity(conceptEntityId, 'MJ: Graph Concepts', 'Name'),
        entity(accountsEntityId, 'Accounts', 'Name'),
        entity('22222222-2222-4222-8222-222222222206', 'MJ: Graph Edges'),
        ...['MJ: Graphs', 'MJ: Graph Types', 'MJ: Graph Edge Types', 'MJ: Graph Edge Type Endpoints', 'MJ: Graph Edge Providers', 'MJ: Graph Concept Types', 'MJ: Graph Authority Tiers'].map((n, i) =>
            entity(`22222222-2222-4222-8222-2222222222${String(10 + i)}`, n),
        ),
    ];
    const edge = (id: string, sourceEntity: string, source: string, targetEntity: string, target: string): Record<string, unknown> => ({
        ID: id,
        GraphID: graphId,
        EdgeTypeID: 'et-related',
        EdgeType: 'Related To',
        SourceEntityID: sourceEntity,
        SourceRecordID: source,
        TargetEntityID: targetEntity,
        TargetRecordID: target,
        Weight: 0.9,
        Status: 'Approved',
        Origin: 'Declared',
        Description: null,
        Attributes: null,
        Confidence: null,
    });
    const rows: Record<string, Array<Record<string, unknown>>> = {
        'MJ: Graphs': [{ ID: graphId, Name: 'MJ Canon', GraphTypeID: 'gt', LoadMode: 'Preload', Status: 'Active' }],
        'MJ: Graph Types': [{ ID: 'gt', Name: 'Canon', IsCanon: true }],
        'MJ: Graph Edge Types': [{ ID: 'et-related', Name: 'Related To', IsDirected: false, DefaultWeight: 0.5 }],
        'MJ: Graph Concepts': [{ ID: conceptId, GraphID: graphId, Name: 'Open AR', Synonyms: null, Status: 'Canonical' }],
        'MJ: Graph Edges': [edge('e1', conceptEntityId, conceptId, accountsEntityId, 'mid'), edge('e2', accountsEntityId, 'mid', accountsEntityId, 'far')],
        Accounts: [
            { ID: 'mid', Name: 'Middle' },
            { ID: 'far', Name: 'Far' },
        ],
    };
    const runView = async (params: RunViewParams, user?: UserInfo): Promise<RunViewResult> => {
        const deny = new Set(user ? (hidden[user.ID] ?? []) : []);
        let result = (rows[params.EntityName ?? ''] ?? []).filter((r) => !deny.has(String(r['ID'])));
        const ids = /^\[ID\] IN \(([^)]*)\)$/.exec((params.ExtraFilter ?? '').trim());
        if (ids) {
            const wanted = Array.from(ids[1].matchAll(/'([^']*)'/g)).map((m) => m[1].toLowerCase());
            result = result.filter((r) => wanted.includes(String(r['ID']).toLowerCase()));
        }
        return { Success: true, Results: result, RowCount: result.length, TotalRowCount: result.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' } as RunViewResult;
    };
    const provider = {
        Entities: entities,
        EntityByName: (n: string) => entities.find((e) => e.Name.toLowerCase() === n.trim().toLowerCase()),
        EntityByID: (id: string) => entities.find((e) => UUIDsEqual(e.ID, id)),
        RunView: runView,
        RunViews: (ps: RunViewParams[], u?: UserInfo) => Promise.all(ps.map((p) => runView(p, u))),
        RunQuery: async () => ({ Success: true, Results: [] }),
    } as unknown as IMetadataProvider;

    it('does not return a node reachable only through a node an audience reader cannot see', async () => {
        LoadGraphEdgeProviders();
        await GraphEngine.Instance.Config(true, caller, provider);
        const lane = new GraphSearchProvider(CanonGraphEngine.Instance.AsExpansionService());
        lane.Provider = provider;

        const alone = await lane.Search('Open AR', 10, undefined, caller, { ScopeConfig: { minWeight: 0 } });
        expect(alone.map((r) => r.RecordID).sort()).toEqual(['far', 'mid', conceptId].sort());

        hidden[reader.ID] = ['mid'];
        const withReader = await lane.Search('Open AR', 10, undefined, caller, { ScopeConfig: { minWeight: 0 }, AudienceReaders: [reader] });
        expect(withReader.map((r) => r.RecordID)).toEqual([conceptId]);
    });
});
