import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    GraphSearchProvider,
    IGraphSearchExpansionService,
    GraphSearchSeedNode,
    GraphSearchExpansionParams,
    GraphSearchExpansionResult,
} from '../generic/GraphSearchProvider';
import { SearchFusion } from '../generic/SearchFusion';
import type { SearchResultItem } from '../generic/search.types';

function makeUser(id: string, roles: string[], type: string = 'User'): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        Type: type,
        IsActive: true,
        UserRoles: roles.map((role) => ({
            UserID: id,
            RoleID: `role-${role}`,
            Role: role,
        })),
    } as unknown as UserInfo;
}

function makeMockProvider(entityReadMatrix: Record<string, string[]>): IMetadataProvider {
    const entities: Partial<EntityInfo>[] = Object.entries(entityReadMatrix).map(([entityName, allowedRoles]) => ({
        Name: entityName,
        GetUserPermisions: (user: UserInfo) => {
            if (user.Type === 'Owner') {
                return { CanRead: true } as ReturnType<EntityInfo['GetUserPermisions']>;
            }
            const userRoles = new Set(user.UserRoles.map((r) => r.Role.toLowerCase()));
            const canRead = allowedRoles.some((allowed) => userRoles.has(allowed.toLowerCase()));
            return { CanRead: canRead } as ReturnType<EntityInfo['GetUserPermisions']>;
        },
    }));
    return {
        Entities: entities as EntityInfo[],
    } as unknown as IMetadataProvider;
}

describe('GraphSearchProvider', () => {
    beforeEach(() => {
        const store = GetGlobalObjectStore();
        if (store) {
            delete store['___SINGLETON__GraphExpansionService'];
        }
    });

    describe('IsAvailable & graceful degradation', () => {
        it('should report unavailable and return empty results when no graph expansion service is configured', async () => {
            const provider = new GraphSearchProvider();
            const caller = makeUser('u-caller', ['Analyst']);

            expect(provider.IsAvailable()).toBe(false);
            const results = await provider.Search('Open AR', 10, undefined, caller);
            expect(results).toEqual([]);
        });
    });

    describe('Multi-hop Canon expansion, path-attenuated scoring, and RRF fusion', () => {
        it('should rank expanded nodes by product(edge.Weight) * seedScore, format breadcrumbs, and boost canonical views in RRF fusion', async () => {
            const caller = makeUser('u-caller', ['FinanceAnalyst']);
            let capturedParams: GraphSearchExpansionParams | undefined;

            const mockService: IGraphSearchExpansionService = {
                ResolveSeeds: async (queryText: string): Promise<readonly GraphSearchSeedNode[]> => {
                    expect(queryText).toBe('Open AR');
                    return [
                        {
                            EntityName: 'MJ: Canon Concepts',
                            RecordID: 'concept-open-ar',
                            Title: 'Open AR',
                            SeedScore: 0.9,
                            GraphName: 'MJ Canon',
                        },
                    ];
                },
                Expand: async (params: GraphSearchExpansionParams): Promise<GraphSearchExpansionResult> => {
                    capturedParams = params;
                    return {
                        Nodes: [
                            {
                                NodeID: 'view-invoices-open',
                                EntityName: 'MJ: User Views',
                                UnderlyingEntityName: 'Invoices',
                                RecordID: 'view-001',
                                Title: 'Invoices.Open',
                                Snippet: 'Canonical open accounts receivable view',
                                GraphName: 'MJ Canon',
                                NodeKind: 'View',
                                SeedScore: 0.9,
                                SeedTitle: 'Open AR',
                                PathEdges: [
                                    {
                                        FromNodeID: 'concept-open-ar',
                                        ToNodeID: 'view-invoices-open',
                                        EdgeType: 'Defined By',
                                        Weight: 0.95,
                                    },
                                ],
                            },
                            {
                                NodeID: 'query-ar-aging',
                                EntityName: 'MJ: Queries',
                                UnderlyingEntityName: 'Invoices',
                                RecordID: 'query-002',
                                Title: 'AR Aging Summary',
                                Snippet: '30/60/90 day receivables aging query',
                                GraphName: 'MJ Canon',
                                NodeKind: 'Query',
                                SeedScore: 0.9,
                                SeedTitle: 'Open AR',
                                PathEdges: [
                                    {
                                        FromNodeID: 'concept-open-ar',
                                        ToNodeID: 'concept-ar-aging',
                                        EdgeType: 'Narrower Than',
                                        Weight: 0.8,
                                    },
                                    {
                                        FromNodeID: 'concept-ar-aging',
                                        ToNodeID: 'query-ar-aging',
                                        EdgeType: 'Governed By',
                                        Weight: 0.75,
                                    },
                                ],
                            },
                            {
                                NodeID: 'weak-hop',
                                EntityName: 'Invoices',
                                RecordID: 'inv-weak',
                                Title: 'Low-weight peripheral node',
                                SeedScore: 0.5,
                                SeedTitle: 'Open AR',
                                PathEdges: [
                                    {
                                        FromNodeID: 'concept-open-ar',
                                        ToNodeID: 'weak-hop',
                                        EdgeType: 'Related To',
                                        Weight: 0.2,
                                    },
                                ],
                            },
                        ],
                        Edges: [],
                    };
                },
            };

            const provider = new GraphSearchProvider(mockService);
            provider.Provider = makeMockProvider({
                Invoices: ['FinanceAnalyst'],
                'MJ: User Views': ['FinanceAnalyst'],
                'MJ: Queries': ['FinanceAnalyst'],
            });

            expect(provider.IsAvailable()).toBe(true);
            const graphResults = await provider.Search('Open AR', 10, undefined, caller);

            expect(capturedParams?.MaxDepth).toBe(2);
            expect(capturedParams?.MaxNodes).toBe(25);
            expect(capturedParams?.MinWeight).toBe(0.25);

            // 'weak-hop' has score 0.5 * 0.2 = 0.10 < 0.25 MinWeight and must be dropped
            expect(graphResults).toHaveLength(2);
            expect(graphResults[0].RecordID).toBe('view-001');
            expect(graphResults[0].SourceType).toBe('SemanticGraph');
            expect(graphResults[0].Score).toBeCloseTo(0.9 * 0.95, 5);
            expect(graphResults[0].ScoreBreakdown.Graph).toBeCloseTo(0.855, 5);
            expect(graphResults[0].Snippet).toContain(
                '"Open AR" --[Defined By (0.95)]--> View "Invoices.Open"',
            );

            expect(graphResults[1].RecordID).toBe('query-002');
            expect(graphResults[1].Score).toBeCloseTo(0.9 * 0.8 * 0.75, 5);
            expect(graphResults[1].Snippet).toContain(
                '"Open AR" --[Narrower Than (0.80)]--> --[Governed By (0.75)]--> Query "AR Aging Summary"',
            );

            // Verify RRF fusion boosts the canonical view when it also appears in the lexical lane
            const lexicalResults: SearchResultItem[] = [
                {
                    ID: 'doc-generic',
                    EntityName: 'Documents',
                    RecordID: 'doc-generic',
                    SourceType: 'fulltext',
                    ResultType: 'entity-record',
                    Title: 'General Mention of Open AR',
                    Snippet: 'Some note mentioning Open AR',
                    Score: 0.88,
                    ScoreBreakdown: { FullText: 0.88 },
                    Tags: [],
                    MatchedAt: new Date(),
                },
                {
                    ID: 'view-001',
                    EntityName: 'MJ: User Views',
                    RecordID: 'view-001',
                    SourceType: 'fulltext',
                    ResultType: 'entity-record',
                    Title: 'Invoices.Open',
                    Snippet: 'Open invoices view',
                    Score: 0.72,
                    ScoreBreakdown: { FullText: 0.72 },
                    Tags: [],
                    MatchedAt: new Date(),
                },
            ];

            const fusion = new SearchFusion();
            const fused = fusion.Fuse(
                [
                    { Source: 'fulltext', Results: lexicalResults },
                    { Source: 'SemanticGraph', Results: graphResults },
                ],
                10,
            );

            // 'view-001' appeared in both lanes (#2 in fulltext, #1 in SemanticGraph) and must outrank 'doc-generic' (#1 in fulltext only)
            expect(fused[0].RecordID).toBe('view-001');
            expect(fused[0].ScoreBreakdown.FullText).toBeCloseTo(0.72, 5);
            expect(fused[0].ScoreBreakdown.Graph).toBeCloseTo(0.855, 5);

            // Verify fusionWeights.graph alias also weights the SemanticGraph lane
            const weightedByGraphAlias = fusion.Fuse(
                [
                    { Source: 'fulltext', Results: lexicalResults },
                    { Source: 'SemanticGraph', Results: graphResults },
                ],
                10,
                { fulltext: 1.0, graph: 2.0 },
            );
            expect(weightedByGraphAlias[0].RecordID).toBe('view-001');
        });
    });

    describe('Audience & Entity Permission Intersection', () => {
        it('should strictly filter out expanded nodes when any audience reader lacks CanRead or UserCanRun', async () => {
            const caller = makeUser('u-caller', ['FinanceAnalyst', 'Executive']);
            const restrictedReader = makeUser('u-reader', ['GeneralStaff']);

            const mockService: IGraphSearchExpansionService = {
                ResolveSeeds: async (): Promise<readonly GraphSearchSeedNode[]> => [
                    {
                        EntityName: 'MJ: Canon Concepts',
                        RecordID: 'concept-1',
                        Title: 'Company Metrics',
                        SeedScore: 1.0,
                    },
                ],
                Expand: async (): Promise<GraphSearchExpansionResult> => ({
                    Nodes: [
                        {
                            NodeID: 'node-public-view',
                            EntityName: 'MJ: User Views',
                            UnderlyingEntityName: 'PublicKPIs',
                            RecordID: 'view-public',
                            Title: 'Public KPI Summary',
                            NodeKind: 'View',
                            SeedTitle: 'Company Metrics',
                            PathEdges: [
                                {
                                    FromNodeID: 'concept-1',
                                    ToNodeID: 'node-public-view',
                                    EdgeType: 'Defined By',
                                    Weight: 0.9,
                                },
                            ],
                        },
                        {
                            NodeID: 'node-exec-query',
                            EntityName: 'MJ: Queries',
                            UnderlyingEntityName: 'PublicKPIs',
                            RecordID: 'query-exec-only',
                            Title: 'Executive Compensation Query',
                            NodeKind: 'Query',
                            SeedTitle: 'Company Metrics',
                            AllowedRoleNames: ['Executive'],
                            PathEdges: [
                                {
                                    FromNodeID: 'concept-1',
                                    ToNodeID: 'node-exec-query',
                                    EdgeType: 'Governed By',
                                    Weight: 0.95,
                                },
                            ],
                        },
                        {
                            NodeID: 'node-finance-entity',
                            EntityName: 'ConfidentialLedgers',
                            RecordID: 'ledger-001',
                            Title: 'Confidential Ledger',
                            NodeKind: 'Record',
                            SeedTitle: 'Company Metrics',
                            PathEdges: [
                                {
                                    FromNodeID: 'concept-1',
                                    ToNodeID: 'node-finance-entity',
                                    EdgeType: 'Defined By',
                                    Weight: 0.92,
                                },
                            ],
                        },
                    ],
                    Edges: [],
                }),
            };

            const provider = new GraphSearchProvider(mockService);
            provider.Provider = makeMockProvider({
                PublicKPIs: ['FinanceAnalyst', 'GeneralStaff'],
                ConfidentialLedgers: ['FinanceAnalyst'],
            });
            provider.SetAudienceReaders([restrictedReader]);

            const results = await provider.Search('Company Metrics', 10, undefined, caller);

            // Only 'view-public' is readable by both caller and restrictedReader
            expect(results).toHaveLength(1);
            expect(results[0].RecordID).toBe('view-public');
        });
    });

    describe('Direct CanonGraphEngine + GraphEngine integration', () => {
        it('should automatically resolve concepts via CanonGraphEngine and expand via GraphEngine when Graphs are loaded', async () => {
            const { GraphEngine } = await import('@memberjunction/core-entities');
            const caller = makeUser('u-caller', ['FinanceAnalyst']);
            const mockMeta = makeMockProvider({
                'MJ: Graph Concepts': ['FinanceAnalyst'],
                'MJ: Entity Alternate Base Views': ['FinanceAnalyst'],
                Invoices: ['FinanceAnalyst'],
            });
            const entities = mockMeta.Entities as Array<Partial<EntityInfo>>;
            const conceptEnt = entities.find((e) => e.Name === 'MJ: Graph Concepts');
            if (conceptEnt) {
                conceptEnt.ID = 'ent-concept';
            }
            const abvEnt = entities.find((e) => e.Name === 'MJ: Entity Alternate Base Views');
            if (abvEnt) {
                abvEnt.ID = 'ent-abv';
            }
            const invoicesEnt = entities.find((e) => e.Name === 'Invoices');
            if (invoicesEnt) {
                invoicesEnt.ID = 'ent-invoices';
                invoicesEnt.AlternateBaseViews = [
                    {
                        ID: 'abv-open-ar',
                        Name: 'vwInvoicesOpen',
                        Description: 'Canonical open AR view',
                        IsUsable: true,
                    },
                ] as EntityInfo['AlternateBaseViews'];
            }
            (mockMeta as unknown as Record<string, unknown>)['EntityByName'] = (name: string) =>
                entities.find((e) => e.Name?.toLowerCase() === name.trim().toLowerCase());

            const engineInternal = GraphEngine.Instance as unknown as Record<string, unknown>;
            const prevGetMeta = engineInternal['getMetadataProvider'];
            engineInternal['_graphTypes'] = [
                { ID: 'gt-canon', Name: 'Canon', IsCanon: true, Status: 'Active' },
            ];
            engineInternal['_graphs'] = [
                {
                    ID: 'g-canon',
                    Name: 'MJ Canon',
                    GraphTypeID: 'gt-canon',
                    GraphType: 'Canon',
                    LoadMode: 'Preload',
                    Status: 'Active',
                },
            ];
            engineInternal['_concepts'] = [
                {
                    ID: 'c-open-ar',
                    GraphID: 'g-canon',
                    Graph: 'MJ Canon',
                    Name: 'Open AR',
                    Synonyms: JSON.stringify(['Unpaid Receivables']),
                    Description: 'Open accounts receivable',
                    Status: 'Active',
                },
            ];
            engineInternal['_edgeTypes'] = [
                {
                    ID: 'et-describes',
                    Name: 'Describes',
                    InverseName: 'Described By',
                    IsDirected: true,
                    DefaultWeight: 0.9,
                    AllowAnySource: true,
                    AllowAnyTarget: true,
                },
            ];
            engineInternal['_edgeTypeEndpoints'] = [];
            engineInternal['_edgeProviders'] = [];
            engineInternal['_storedEdges'] = [
                {
                    ID: 'e-1',
                    GraphID: 'g-canon',
                    Graph: 'MJ Canon',
                    EdgeTypeID: 'et-describes',
                    EdgeType: 'Describes',
                    SourceEntityID: 'ent-abv',
                    SourceEntity: 'MJ: Entity Alternate Base Views',
                    SourceRecordID: 'abv-open-ar',
                    TargetEntityID: 'ent-concept',
                    TargetEntity: 'MJ: Graph Concepts',
                    TargetRecordID: 'c-open-ar',
                    Weight: 0.95,
                    Origin: 'Curated',
                    Status: 'Approved',
                },
            ];
            engineInternal['getMetadataProvider'] = () => mockMeta;

            try {
                const provider = new GraphSearchProvider();
                provider.Provider = mockMeta;
                expect(provider.IsAvailable()).toBe(true);

                const results = await provider.Search('Unpaid Receivables', 10, undefined, caller);
                expect(results.some((r) => r.RecordID === 'abv-open-ar' && r.SourceType === 'SemanticGraph')).toBe(
                    true,
                );
            } finally {
                engineInternal['_graphs'] = [];
                engineInternal['_concepts'] = [];
                engineInternal['_storedEdges'] = [];
                engineInternal['getMetadataProvider'] = prevGetMeta;
            }
        });
    });
});
