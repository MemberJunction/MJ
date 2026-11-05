import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import { GetGraphContextAction } from '../custom/data/get-graph-context.action';
import { GetEntityDetailsAction } from '../custom/data/get-entity-details.action';
import { CanonGraphEngine, GraphEngine } from '@memberjunction/core-entities';

describe('GetGraphContextAction & GetEntityDetailsAction Canon Section', () => {
    const mockUser = { ID: 'user-1', Name: 'Tester', UserRoles: [] } as unknown as UserInfo;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('GetGraphContextAction expands a subgraph via CanonContext when Question is provided', async () => {
        const fakeSubgraph = {
            Nodes: [
                {
                    Key: 'concept|c1',
                    EntityName: 'MJ: Graph Concepts',
                    RecordID: 'c1',
                    Label: 'Active Member',
                    Icon: 'fa-solid fa-book-bookmark',
                    Description: 'Paid member in good standing.',
                },
            ],
            Edges: [],
        };

        vi.spyOn(CanonGraphEngine.Instance, 'ResolveCanonGraphName').mockReturnValue('MJ Canon');
        vi.spyOn(CanonGraphEngine.Instance, 'CanonContext').mockResolvedValue(fakeSubgraph);
        vi.spyOn(GraphEngine.Instance, 'DescribeForPrompt').mockReturnValue(
            '### Governed Concepts\n- **Active Member**: Paid member in good standing.',
        );

        const action = new GetGraphContextAction();
        const params: RunActionParams = {
            Action: {} as never,
            ContextUser: mockUser,
            Filters: [],
            Params: [
                { Name: 'Question', Value: 'Who is an active member?', Type: 'Input' },
                { Name: 'Depth', Value: '2', Type: 'Input' },
            ],
        };

        const result = await (action as unknown as {
            InternalRunAction: (p: RunActionParams) => Promise<Record<string, unknown>>;
        }).InternalRunAction(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.NodeCount).toBe(1);
        expect(result.PromptDescription).toContain('**Active Member**');
    });

    it('GetGraphContextAction returns MISSING_SEEDS when no question or seeds are provided', async () => {
        const action = new GetGraphContextAction();
        const params: RunActionParams = {
            Action: {} as never,
            ContextUser: mockUser,
            Filters: [],
            Params: [],
        };

        const result = await (action as unknown as {
            InternalRunAction: (p: RunActionParams) => Promise<Record<string, unknown>>;
        }).InternalRunAction(params);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_SEEDS');
    });

    it('GetEntityDetailsAction includes the Canon section when CanonGraphEngine returns a summary', async () => {
        vi.spyOn(CanonGraphEngine.Instance, 'GetEntityCanonSummary').mockResolvedValue({
            EntityName: 'Invoices',
            EntityID: 'E-INV-1',
            Concepts: [
                {
                    ID: 'C-OAR',
                    Name: 'Open Accounts Receivable',
                    ConceptType: 'Metric',
                    AuthorityTier: 'Board Policy',
                    Relationship: 'Describes',
                    Description: 'Unpaid balance across posted invoices.',
                },
            ],
            AlternateBaseViews: [
                {
                    ID: 'ABV-OPEN',
                    Name: 'Open',
                    DisplayName: 'Open Invoices',
                    ViewName: 'vwInvoicesOpen',
                    Description: 'Invoices with BalanceDue > 0.',
                },
            ],
            Queries: [
                {
                    ID: 'Q-OAR',
                    Name: 'Open AR by Quarter',
                    CategoryPath: 'Finance/AR',
                    Relationship: 'Reads',
                    Description: 'Quarterly Open AR totals.',
                },
            ],
            PrecedenceRules: [
                {
                    EdgeType: 'Preferred Over',
                    Preferred: { EntityName: 'MJ: Entity Fields', RecordID: 'BalanceDue' },
                    Over: { EntityName: 'MJ: Entity Fields', RecordID: 'LegacyBalance' },
                    Description: 'Use BalanceDue instead of LegacyBalance',
                },
            ],
        });

        const fakeEntity = {
            ID: 'E-INV-1',
            Name: 'Invoices',
            SchemaName: 'dbo',
            BaseView: 'vwInvoices',
            Description: 'Customer billing invoices.',
            VirtualEntity: false,
            Fields: [
                {
                    Name: 'ID',
                    DisplayName: 'ID',
                    Type: 'uniqueidentifier',
                    SQLFullType: 'uniqueidentifier',
                    Description: 'Primary key',
                    IsPrimaryKey: true,
                    IsNameField: false,
                    AllowsNull: false,
                    DefaultValue: null,
                    RelatedEntity: null,
                    RelatedEntityFieldName: null,
                    ValueListType: 'None',
                    EntityFieldValues: [],
                },
            ],
            AlternateBaseViews: [],
        };

        const action = new GetEntityDetailsAction();
        const params: RunActionParams = {
            Action: {} as never,
            ContextUser: mockUser,
            Filters: [],
            Provider: {
                Entities: [fakeEntity],
                EntityByName: (name: string) => (name === 'Invoices' ? fakeEntity : undefined),
            } as never,
            Params: [
                { Name: 'EntityName', Value: 'Invoices', Type: 'Input' },
                { Name: 'SampleRowCount', Value: 0, Type: 'Input' },
            ],
        };

        const result = await (action as unknown as {
            InternalRunAction: (p: RunActionParams) => Promise<Record<string, unknown>>;
        }).InternalRunAction(params);

        expect(result.Success).toBe(true);
        expect(result.Message).toContain('## Canon');
        expect(result.Message).toContain('### Governed Concepts (1)');
        expect(result.Message).toContain('**Open Accounts Receivable**');
        expect(result.Message).toContain('### Governed Queries (1)');
        expect(result.Message).toContain('**Finance/AR/Open AR by Quarter**');
        expect(result.Message).toContain('### Precedence Rules (1)');
        expect(result.Canon).toBeDefined();
    });
});
