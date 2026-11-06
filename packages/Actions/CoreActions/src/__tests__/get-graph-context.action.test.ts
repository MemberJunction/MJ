import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import type { RunActionParams } from '@memberjunction/actions-base';
import { GraphEngine, LoadGraphEdgeProviders } from '@memberjunction/core-entities';
import { GetGraphContextAction, type GetGraphContextActionResult } from '../custom/data/get-graph-context.action';

const GRAPH_TYPE_CANON_ID = '11111111-1111-4111-8111-111111111101';
const GRAPH_CANON_ID = '11111111-1111-4111-8111-111111111102';
const CONCEPT_META_ID = '22222222-2222-4222-8222-222222222205';
const ABV_META_ID = '22222222-2222-4222-8222-222222222203';
const INVOICES_ENTITY_ID = '33333333-3333-4333-8333-333333333301';
const INVOICES_OPEN_ABV_ID = '55555555-5555-4555-8555-555555555501';
const CONCEPT_OPEN_AR_ID = '77777777-7777-4777-8777-777777777701';
const EDGE_TYPE_DESCRIBES_ID = '88888888-8888-4888-8888-888888888801';

function makeUser(): UserInfo {
    return {
        ID: 'u-1',
        Name: 'User 1',
        Email: 'u1@example.com',
        Type: 'User',
        IsActive: true,
        UserRoles: [{ UserID: 'u-1', RoleID: 'r-1', Role: 'Analyst' }],
    } as unknown as UserInfo;
}

class TestableGetGraphContextAction extends GetGraphContextAction {
    public async RunForTest(params: RunActionParams): Promise<GetGraphContextActionResult> {
        return this.InternalRunAction(params);
    }
}

describe('GetGraphContextAction (WS-4.2)', () => {
    beforeEach(() => {
        LoadGraphEdgeProviders();
        const entities: Partial<EntityInfo>[] = [
            {
                ID: CONCEPT_META_ID,
                Name: 'MJ: Graph Concepts',
                DisplayNameOrName: 'Graph Concepts',
                GetUserPermisions: (() => ({ CanRead: true })) as unknown as EntityInfo['GetUserPermisions'],
            },
            {
                ID: ABV_META_ID,
                Name: 'MJ: Entity Alternate Base Views',
                DisplayNameOrName: 'Entity Alternate Base Views',
                GetUserPermisions: (() => ({ CanRead: true })) as unknown as EntityInfo['GetUserPermisions'],
            },
            {
                ID: INVOICES_ENTITY_ID,
                Name: 'Invoices',
                DisplayNameOrName: 'Invoices',
                AlternateBaseViews: [
                    {
                        ID: INVOICES_OPEN_ABV_ID,
                        Name: 'vwInvoicesOpen',
                        Description: 'Open unpaid invoices',
                        IsUsable: true,
                    },
                ] as EntityInfo['AlternateBaseViews'],
                GetUserPermisions: (() => ({ CanRead: true })) as unknown as EntityInfo['GetUserPermisions'],
            },
        ];

        const provider = {
            Entities: entities as EntityInfo[],
            EntityByName: (name: string) =>
                (entities as EntityInfo[]).find((e) => e.Name.toLowerCase() === name.trim().toLowerCase()),
            EntityByID: (id: string) =>
                (entities as EntityInfo[]).find((e) => e.ID.toLowerCase() === id.trim().toLowerCase()),
            RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' }),
            RunViews: async () => [],
        } as unknown as IMetadataProvider & IRunViewProvider;

        const internal = GraphEngine.Instance as unknown as Record<string, unknown>;
        internal['_graphTypes'] = [{ ID: GRAPH_TYPE_CANON_ID, Name: 'Canon', IsCanon: true, Status: 'Active' }];
        internal['_graphs'] = [
            {
                ID: GRAPH_CANON_ID,
                Name: 'MJ Canon',
                GraphTypeID: GRAPH_TYPE_CANON_ID,
                GraphType: 'Canon',
                LoadMode: 'Preload',
                Status: 'Active',
            },
        ];
        internal['_concepts'] = [
            {
                ID: CONCEPT_OPEN_AR_ID,
                GraphID: GRAPH_CANON_ID,
                Graph: 'MJ Canon',
                Name: 'Open AR',
                Synonyms: JSON.stringify(['Unpaid Invoices']),
                Description: 'Unpaid customer invoices',
                Status: 'Active',
            },
        ];
        internal['_edgeTypes'] = [
            {
                ID: EDGE_TYPE_DESCRIBES_ID,
                Name: 'Describes',
                InverseName: 'Described By',
                IsDirected: true,
                DefaultWeight: 0.9,
                AllowAnySource: true,
                AllowAnyTarget: true,
            },
        ];
        internal['_edgeTypeEndpoints'] = [];
        internal['_edgeProviders'] = [];
        internal['_storedEdges'] = [
            {
                ID: 'edge-1',
                GraphID: GRAPH_CANON_ID,
                Graph: 'MJ Canon',
                EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
                EdgeType: 'Describes',
                SourceEntityID: ABV_META_ID,
                SourceEntity: 'MJ: Entity Alternate Base Views',
                SourceRecordID: INVOICES_OPEN_ABV_ID,
                TargetEntityID: CONCEPT_META_ID,
                TargetEntity: 'MJ: Graph Concepts',
                TargetRecordID: CONCEPT_OPEN_AR_ID,
                Weight: 0.95,
                Origin: 'Curated',
                Status: 'Approved',
            },
        ];
        internal['getMetadataProvider'] = () => provider;
    });

    it('should expand a Canon subgraph from a natural-language Question and populate output params', async () => {
        const action = new TestableGetGraphContextAction();
        const params: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: makeUser(),
            Params: [
                { Name: 'Question', Value: 'What are our Unpaid Invoices?', Type: 'Input' },
                { Name: 'Depth', Value: 2, Type: 'Input' },
            ],
        };

        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.NodeCount).toBe(2);
        expect(result.EdgeCount).toBe(1);
        expect(result.PromptText).toContain('Open AR');
        expect(result.PromptText).toContain('Invoices.vwInvoicesOpen');
        expect(params.Params.some((p) => p.Name === 'Subgraph' && p.Type === 'Output')).toBe(true);
    });

    it('should return MISSING_PARAMETER when neither Question nor Seeds is provided', async () => {
        const action = new TestableGetGraphContextAction();
        const result = await action.RunForTest({
            Action: {} as RunActionParams['Action'],
            ContextUser: makeUser(),
            Params: [],
        });

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });
});
