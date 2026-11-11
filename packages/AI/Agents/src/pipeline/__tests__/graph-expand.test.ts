import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
    RegisterGraphExpansionService,
    type IGraphExpansionService,
    type GraphSeedNode,
    type GraphExpansionParams,
    type GraphExpansionResult,
} from '@memberjunction/core-entities';
import { PipelineExecutor } from '../pipeline-executor';
import { PipelineToolRegistry } from '../pipeline-registry';
import type { GraphExpandPipelineStage, PipelineStage, PipeValue } from '../pipeline.types';

const TEST_USER = { ID: 'user-1', Name: 'Test User', UserRoles: [] } as unknown as UserInfo;

describe('PipelineExecutor graphExpand stage (WS-4.2)', () => {
    beforeEach(() => {
        RegisterGraphExpansionService(null);
    });

    it('should execute a GraphExpandPipelineStage deterministically with zero LLM calls and populate outputKey', async () => {
        let resolveSeedsCalls = 0;
        let expandCalls = 0;

        const mockService: IGraphExpansionService = {
            ResolveSeeds: async (queryText: string): Promise<readonly GraphSeedNode[]> => {
                resolveSeedsCalls++;
                expect(queryText).toBe('Open AR');
                return [
                    {
                        EntityName: 'MJ: Canon Concepts',
                        RecordID: 'concept-open-ar',
                        Title: 'Open AR',
                        SeedScore: 0.95,
                        GraphName: 'MJ Canon',
                    },
                ];
            },
            Expand: async (params: GraphExpansionParams): Promise<GraphExpansionResult> => {
                expandCalls++;
                expect(params.GraphNames).toEqual(['MJ Canon']);
                expect(params.MaxDepth).toBe(2);
                expect(params.MaxNodes).toBe(15);
                expect(params.EdgeTypeFilter).toEqual(['Defined By', 'Governed By']);
                return {
                    Nodes: [
                        {
                            NodeID: 'view-invoices-open',
                            EntityName: 'MJ: User Views',
                            RecordID: 'view-001',
                            Title: 'Invoices.Open',
                            Snippet: 'Canonical open accounts receivable view',
                            NodeKind: 'View',
                            SeedScore: 0.95,
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
                    ],
                    Edges: [
                        {
                            FromNodeID: 'concept-open-ar',
                            ToNodeID: 'view-invoices-open',
                            EdgeType: 'Defined By',
                            Weight: 0.95,
                        },
                    ],
                };
            },
        };

        const registry = new PipelineToolRegistry();
        const executor = new PipelineExecutor(registry, 20, {
            initialValue: { queryText: 'Open AR', requestId: 'req-1' },
            graphExpansionService: mockService,
            contextUser: TEST_USER,
        });

        const expandStage: GraphExpandPipelineStage = {
            stageType: 'graphExpand',
            id: 'canon-lookup',
            graphNames: ['MJ Canon'],
            seedSource: '$.queryText',
            maxDepth: 2,
            maxNodes: 15,
            edgeTypeFilter: ['Defined By', 'Governed By'],
            outputKey: 'canonSubgraph',
        };

        const result = await executor.Execute([expandStage as unknown as PipelineStage]);

        expect(result.success).toBe(true);
        expect(resolveSeedsCalls).toBe(1);
        expect(expandCalls).toBe(1);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolName).toBe('graphExpand:canon-lookup');

        const finalObj = result.finalOutput as Record<string, PipeValue>;
        expect(finalObj['requestId']).toBe('req-1');
        const subgraph = finalObj['canonSubgraph'] as Record<string, PipeValue>;
        expect(subgraph).toBeDefined();
        const nodes = subgraph['nodes'] as Array<Record<string, PipeValue>>;
        expect(nodes).toHaveLength(1);
        expect(nodes[0]['recordId']).toBe('view-001');
        expect(nodes[0]['breadcrumb']).toBe('"Open AR" --[Defined By (0.95)]--> View "Invoices.Open"');
    });

    it('should accept { EntityName, RecordID } pairs directly from seedSource and bind outputKey in scope for downstream stages', async () => {
        let resolveSeedsCalled = false;

        const mockService: IGraphExpansionService = {
            ResolveSeeds: async (): Promise<readonly GraphSeedNode[]> => {
                resolveSeedsCalled = true;
                return [];
            },
            Expand: async (params: GraphExpansionParams): Promise<GraphExpansionResult> => {
                expect(params.Seeds).toHaveLength(2);
                expect(params.Seeds[0].EntityName).toBe('Members');
                expect(params.Seeds[0].RecordID).toBe('mem-101');
                return {
                    Nodes: [
                        {
                            NodeID: 'org-201',
                            EntityName: 'Organizations',
                            RecordID: 'org-201',
                            Title: 'Acme Corp',
                            NodeKind: 'Record',
                            SeedTitle: 'Alice Smith',
                            PathEdges: [
                                {
                                    FromNodeID: 'mem-101',
                                    ToNodeID: 'org-201',
                                    EdgeType: 'Member Of',
                                    Weight: 0.9,
                                },
                            ],
                        },
                    ],
                    Edges: [],
                };
            },
        };

        RegisterGraphExpansionService(mockService);

        const registry = new PipelineToolRegistry();
        const executor = new PipelineExecutor(registry, 20, {
            initialValue: {
                seedRecords: [
                    { EntityName: 'Members', RecordID: 'mem-101', Title: 'Alice Smith' },
                    { EntityName: 'Members', RecordID: 'mem-102', Title: 'Bob Jones' },
                ],
            },
            contextUser: TEST_USER,
        });

        const stages: PipelineStage[] = [
            {
                graphExpand: {
                    graphNames: ['Member Network'],
                    seedSource: '$.seedRecords[*]',
                    maxDepth: 1,
                    outputKey: 'memberGraph',
                },
            },
            {
                jsonpath: '$.memberGraph.breadcrumbs',
            },
        ];

        const result = await executor.Execute(stages);
        expect(result.success).toBe(true);
        expect(resolveSeedsCalled).toBe(false);
        expect(result.finalOutput).toEqual(['"Alice Smith" --[Member Of (0.90)]--> "Acme Corp"']);
    });

    it('should fail closed with an empty subgraph when contextUser is missing', async () => {
        let expandCalled = false;
        const mockService: IGraphExpansionService = {
            ResolveSeeds: async (): Promise<readonly GraphSeedNode[]> => {
                expandCalled = true;
                return [{ EntityName: 'Members', RecordID: 'mem-101' }];
            },
            Expand: async (): Promise<GraphExpansionResult> => {
                expandCalled = true;
                return { Nodes: [], Edges: [] };
            },
        };

        const registry = new PipelineToolRegistry();
        const executor = new PipelineExecutor(registry, 20, {
            initialValue: { query: 'Open AR' },
            graphExpansionService: mockService,
        });

        const result = await executor.Execute([
            {
                stageType: 'graphExpand',
                id: 'unauthenticated-graph',
                graphNames: ['MJ Canon'],
                seedSource: '$.query',
                outputKey: 'deniedGraph',
            },
        ]);

        expect(result.success).toBe(true);
        expect(expandCalled).toBe(false);
        const finalObj = result.finalOutput as Record<string, PipeValue>;
        const subgraph = finalObj['deniedGraph'] as Record<string, PipeValue>;
        expect(subgraph['nodes']).toEqual([]);
    });

    it('passes the run\'s audience to the expansion service and clamps maxNodes to 1..200 and depth to 1..4', async () => {
        const reader = { ID: 'user-2', Name: 'Reader', UserRoles: [] } as unknown as UserInfo;
        const calls: GraphExpansionParams[] = [];
        const service: IGraphExpansionService = {
            ResolveSeeds: async (): Promise<readonly GraphSeedNode[]> => [{ EntityName: 'MJ: Graph Concepts', RecordID: 'c-1' }],
            Expand: async (params: GraphExpansionParams): Promise<GraphExpansionResult> => {
                calls.push(params);
                return { Nodes: [], Edges: [], Messages: ['Expansion stopped at the 200-node limit.'] };
            },
        };
        const executor = new PipelineExecutor(new PipelineToolRegistry(), 20, {
            initialValue: { query: 'Open AR' },
            graphExpansionService: service,
            contextUser: TEST_USER,
            audienceReaders: [reader],
        });
        const result = await executor.Execute([
            { stageType: 'graphExpand', graphNames: ['MJ Canon'], seedSource: '$.query', maxNodes: 1_000_000, maxDepth: 9, outputKey: 'g' } as unknown as PipelineStage,
        ]);
        expect(result.success).toBe(true);
        expect(calls[0].AudienceReaders?.map((r) => r.ID)).toEqual(['user-2']);
        expect(calls[0].MaxNodes).toBe(200);
        expect(calls[0].MaxDepth).toBe(4);
        const g = (result.finalOutput as Record<string, PipeValue>)['g'] as Record<string, PipeValue>;
        expect(g['messages']).toEqual(['Expansion stopped at the 200-node limit.']);
    });

    it('resolves text seeds for the run\'s audience and reports only the seeds the expansion admitted', async () => {
        const reader = { ID: 'user-2', Name: 'Reader', UserRoles: [] } as unknown as UserInfo;
        const seenAudiences: Array<readonly UserInfo[] | undefined> = [];
        const service: IGraphExpansionService = {
            ResolveSeeds: async (_q, _g, _u, _p, audienceReaders): Promise<readonly GraphSeedNode[]> => {
                seenAudiences.push(audienceReaders);
                return [{ EntityName: 'MJ: Graph Concepts', RecordID: 'c-1', Title: 'Open AR' }];
            },
            // The service admitted none of the requested seeds (a reader cannot see them).
            Expand: async (): Promise<GraphExpansionResult> => ({ Nodes: [], Edges: [], Seeds: [] }),
        };
        const executor = new PipelineExecutor(new PipelineToolRegistry(), 20, {
            initialValue: { query: 'Open AR', records: [{ EntityName: 'Members', RecordID: 'm-1', Title: 'Hidden Member' }] },
            graphExpansionService: service,
            contextUser: TEST_USER,
            audienceReaders: [reader],
        });
        const result = await executor.Execute([
            { stageType: 'graphExpand', graphNames: ['MJ Canon'], seedSource: '$.query', outputKey: 'fromText' } as unknown as PipelineStage,
            { stageType: 'graphExpand', graphNames: ['MJ Canon'], seedSource: '$.records[*]', outputKey: 'fromRecords' } as unknown as PipelineStage,
        ]);
        expect(result.success).toBe(true);
        expect(seenAudiences.map((a) => a?.map((r) => r.ID))).toEqual([['user-2']]);
        const out = result.finalOutput as Record<string, Record<string, PipeValue>>;
        expect(out['fromText']['seeds']).toEqual([]);
        expect(out['fromRecords']['seeds']).toEqual([]);
        expect(JSON.stringify(out['fromRecords'])).not.toContain('Hidden Member');
        expect(JSON.stringify(out['fromText'])).not.toContain('Open AR');
    });

    it('should degrade gracefully with an empty subgraph when no IGraphExpansionService is registered', async () => {
        const registry = new PipelineToolRegistry();
        const executor = new PipelineExecutor(registry, 20, {
            initialValue: { query: 'Unconfigured Graph' },
            contextUser: TEST_USER,
        });

        const result = await executor.Execute([
            {
                stageType: 'graphExpand',
                id: 'no-op-graph',
                graphNames: ['MJ Canon'],
                seedSource: '$.query',
                outputKey: 'emptyGraph',
            },
        ]);

        expect(result.success).toBe(true);
        const finalObj = result.finalOutput as Record<string, PipeValue>;
        const subgraph = finalObj['emptyGraph'] as Record<string, PipeValue>;
        expect(subgraph['nodes']).toEqual([]);
        expect(subgraph['edges']).toEqual([]);
        expect(subgraph['breadcrumbs']).toEqual([]);
    });
});
