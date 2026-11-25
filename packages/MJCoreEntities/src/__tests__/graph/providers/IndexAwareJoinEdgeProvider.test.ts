import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import {
    AssessJoinAccessPath,
    IndexAwareJoinEdgeProvider,
    LoadIndexAwareJoinEdgeProvider,
    type IndexAwareJoinEdgeProviderConfig,
} from '../../../graph/providers/IndexAwareJoinEdgeProvider';
import { GraphEngine } from '../../../graph/GraphEngine';
import { CanonMetadataRows, FakeGraphProvider, IDS, MakeUser } from '../graphTestFixtures';
import { Ctx } from './providerTestContext';

const ENT_ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ENT_ORD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const ENT_INV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

const FLD_ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const FLD_ORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const FLD_ORD_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const FLD_ORD_STATUS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
const FLD_INV_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5';
const FLD_INV_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6';
const FLD_INV_ORD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7';
const FLD_INV_TOTAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8';

function makeEntity(init: Record<string, unknown>): EntityInfo {
    return new EntityInfo({
        SchemaName: 'dbo',
        BaseTable: String(init.Name ?? 'T'),
        BaseView: `vw${String(init.Name ?? 'T')}`,
        VirtualEntity: false,
        EntityPermissions: [
            { RoleID: 'role-Analyst', RoleName: 'Analyst', CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
        ],
        EntityRelationships: [],
        EntitySettings: [],
        ...init,
    });
}

function buildIndexSchema(): { org: EntityInfo; ord: EntityInfo; inv: EntityInfo } {
    const org = makeEntity({
        ID: ENT_ORG,
        Name: 'Organizations',
        EntityFields: [
            { ID: FLD_ORG_ID, EntityID: ENT_ORG, Name: 'ID', IsPrimaryKey: true, Sequence: 1 },
        ],
        EntityIndexes: [
            {
                ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
                EntityID: ENT_ORG,
                Name: 'PK_Organizations',
                IndexType: 'BTree',
                NativeType: 'CLUSTERED',
                IsUnique: true,
                IsPrimaryKey: true,
                IsClustered: true,
                FilterDefinition: null,
                HasExpressions: false,
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', EntityFieldID: FLD_ORG_ID, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
        ],
    });

    const ord = makeEntity({
        ID: ENT_ORD,
        Name: 'Orders',
        EntityFields: [
            { ID: FLD_ORD_ID, EntityID: ENT_ORD, Name: 'ID', IsPrimaryKey: true, Sequence: 1 },
            { ID: FLD_ORD_ORG, EntityID: ENT_ORD, Name: 'OrganizationID', RelatedEntityID: ENT_ORG, RelatedEntity: 'Organizations', RelatedEntityFieldName: 'ID', Sequence: 2 },
            { ID: FLD_ORD_STATUS, EntityID: ENT_ORD, Name: 'Status', Sequence: 3 },
        ],
        EntityIndexes: [
            {
                ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
                EntityID: ENT_ORD,
                Name: 'PK_Orders',
                IndexType: 'BTree',
                NativeType: 'CLUSTERED',
                IsUnique: true,
                IsPrimaryKey: true,
                IsClustered: true,
                FilterDefinition: null,
                HasExpressions: false,
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', EntityFieldID: FLD_ORD_ID, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
            {
                ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
                EntityID: ENT_ORD,
                Name: 'IX_Orders_OrgID',
                IndexType: 'BTree',
                NativeType: 'NONCLUSTERED',
                IsUnique: false,
                IsPrimaryKey: false,
                IsClustered: false,
                FilterDefinition: null,
                HasExpressions: false,
                Source: 'CodeGen',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', EntityFieldID: FLD_ORD_ORG, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', EntityFieldID: FLD_ORD_STATUS, Sequence: 2, Role: 'Include', SortDirection: 'ASC' },
                ],
            },
        ],
    });

    const inv = makeEntity({
        ID: ENT_INV,
        Name: 'Invoices',
        EntityFields: [
            { ID: FLD_INV_ID, EntityID: ENT_INV, Name: 'ID', IsPrimaryKey: true, Sequence: 1 },
            // Direct FK to Organizations is UNINDEXED (only has a Proposed index)
            { ID: FLD_INV_ORG, EntityID: ENT_INV, Name: 'OrganizationID', RelatedEntityID: ENT_ORG, RelatedEntity: 'Organizations', RelatedEntityFieldName: 'ID', Sequence: 2 },
            // FK to Orders IS indexed as a leading key
            { ID: FLD_INV_ORD, EntityID: ENT_INV, Name: 'OrderID', RelatedEntityID: ENT_ORD, RelatedEntity: 'Orders', RelatedEntityFieldName: 'ID', Sequence: 3 },
            { ID: FLD_INV_TOTAL, EntityID: ENT_INV, Name: 'Total', Sequence: 4 },
        ],
        EntityIndexes: [
            {
                ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
                EntityID: ENT_INV,
                Name: 'PK_Invoices',
                IndexType: 'BTree',
                NativeType: 'CLUSTERED',
                IsUnique: true,
                IsPrimaryKey: true,
                IsClustered: true,
                FilterDefinition: null,
                HasExpressions: false,
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4', EntityFieldID: FLD_INV_ID, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
            {
                ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5',
                EntityID: ENT_INV,
                Name: 'IX_Invoices_OrderID',
                IndexType: 'BTree',
                NativeType: 'NONCLUSTERED',
                IsUnique: false,
                IsPrimaryKey: false,
                IsClustered: false,
                FilterDefinition: null,
                HasExpressions: false,
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd6', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5', EntityFieldID: FLD_INV_ORD, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
            {
                ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6',
                EntityID: ENT_INV,
                Name: 'IX_Invoices_OrgID_Proposed',
                IndexType: 'BTree',
                NativeType: 'NONCLUSTERED',
                IsUnique: false,
                IsPrimaryKey: false,
                IsClustered: false,
                FilterDefinition: null,
                HasExpressions: false,
                Source: 'DBAutoDoc',
                Status: 'Proposed',
                EntityIndexFields: [
                    { ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd7', EntityIndexID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6', EntityFieldID: FLD_INV_ORG, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
        ],
    });

    return { org, ord, inv };
}

describe('AssessJoinAccessPath', () => {
    it('classifies PrimaryKey, LeadingIndexKey (+INCLUDE bonus), and TableScan accurately', () => {
        const { org, ord, inv } = buildIndexSchema();

        const pk = AssessJoinAccessPath(org, org.Fields.find((f) => f.Name === 'ID'));
        expect(pk.AccessPath).toBe('PrimaryKey');
        expect(pk.Weight).toBe(0.95);
        expect(pk.IndexName).toBe('PK_Organizations');

        // Leading key + 1 INCLUDE column -> 0.85 + 0.05 = 0.90
        const covering = AssessJoinAccessPath(ord, ord.Fields.find((f) => f.Name === 'OrganizationID'));
        expect(covering.AccessPath).toBe('LeadingIndexKey');
        expect(covering.Weight).toBe(0.9);
        expect(covering.IncludeFieldCount).toBe(1);

        // Unindexed (Proposed is ignored by default) -> TableScan 0.20
        const scan = AssessJoinAccessPath(inv, inv.Fields.find((f) => f.Name === 'OrganizationID'));
        expect(scan.AccessPath).toBe('TableScan');
        expect(scan.Weight).toBe(0.2);
    });

    it('includes Proposed indexes when IncludeProposedIndexes is true', () => {
        const { inv } = buildIndexSchema();
        const simulated = AssessJoinAccessPath(inv, inv.Fields.find((f) => f.Name === 'OrganizationID'), {
            IncludeProposedIndexes: true,
        });
        expect(simulated.AccessPath).toBe('LeadingIndexKey');
        expect(simulated.Weight).toBe(0.85);
        expect(simulated.IndexName).toBe('IX_Invoices_OrgID_Proposed');
    });

    it('applies a milder scan weight for small lookup tables below SmallTableThreshold', () => {
        const { inv } = buildIndexSchema();
        const small = AssessJoinAccessPath(inv, inv.Fields.find((f) => f.Name === 'OrganizationID'), {
            RowCounts: { Invoices: 250 },
        });
        expect(small.AccessPath).toBe('TableScan');
        expect(small.Weight).toBe(0.7);
    });
});

describe('IndexAwareJoinEdgeProvider', () => {
    it('emits asymmetric directed edges from metadata alone with zero DB reads', async () => {
        const { org, ord, inv } = buildIndexSchema();
        const baseProvider = new FakeGraphProvider();
        const entitiesMeta = baseProvider.EntityByName('MJ: Entities');
        const mockProvider = {
            ...baseProvider,
            Entities: [entitiesMeta, org, ord, inv].filter(Boolean),
            EntityByName: (name: string) =>
                [entitiesMeta, org, ord, inv].find((e) => e?.Name?.toLowerCase() === name.toLowerCase()),
            ReadLog: baseProvider.ReadLog,
        } as unknown as IMetadataProvider;

        const provider = new IndexAwareJoinEdgeProvider();
        const outFromOrg = await provider.GetEdges(
            { Nodes: [{ EntityName: 'MJ: Entities', RecordID: ENT_ORG }], Direction: 'Out' },
            Ctx(mockProvider as unknown as FakeGraphProvider, {} as IndexAwareJoinEdgeProviderConfig),
        );

        expect(baseProvider.ReadLog).toHaveLength(0);
        expect(outFromOrg).toHaveLength(2);

        const toOrders = outFromOrg.find((e) => e.Target.RecordID === ENT_ORD);
        const toInvoices = outFromOrg.find((e) => e.Target.RecordID === ENT_INV);
        expect(toOrders?.Weight).toBe(0.9);
        expect(toOrders?.Attributes?.AccessPath).toBe('LeadingIndexKey');
        expect(toOrders?.Attributes?.IndexName).toBe('IX_Orders_OrgID');

        expect(toInvoices?.Weight).toBe(0.2);
        expect(toInvoices?.Attributes?.AccessPath).toBe('TableScan');
    });

    it('returns empty array on empty frontier', async () => {
        const baseProvider = new FakeGraphProvider();
        const edges = await new IndexAwareJoinEdgeProvider().GetEdges(
            { Nodes: [], Direction: 'Both' },
            Ctx(baseProvider, {}),
        );
        expect(edges).toEqual([]);
    });
});

describe('GraphEngine.FindPath with Strategy: Weighted (Dijkstra) + IndexAwareJoinEdgeProvider', () => {
    beforeEach(() => {
        LoadIndexAwareJoinEdgeProvider();
    });

    it('prefers a 2-hop indexed join path over a 1-hop unindexed table scan under Weighted strategy', async () => {
        const { org, ord, inv } = buildIndexSchema();
        const fake = new FakeGraphProvider().Reset(CanonMetadataRows());
        const entitiesMeta = fake.EntityByName('MJ: Entities')!;
        fake.Entities.push(org, ord, inv);
        fake.Rows['MJ: Entities'] = [
            ...(fake.Rows['MJ: Entities'] ?? []),
            { ID: ENT_ORG, Name: 'Organizations', Description: 'Orgs' },
            { ID: ENT_ORD, Name: 'Orders', Description: 'Orders' },
            { ID: ENT_INV, Name: 'Invoices', Description: 'Invoices' },
        ];
        fake.Rows['MJ: Graph Edge Types'] = [
            ...(fake.Rows['MJ: Graph Edge Types'] ?? []),
            {
                ID: '7A6D41B2-9F3E-4C81-B5E2-18C4E9A03F7D',
                Name: 'Indexed Join',
                InverseName: 'Indexed Join',
                IsDirected: true,
                DefaultWeight: 0.85,
                AllowStored: false,
                GraphID: null,
            },
        ];
        fake.Rows['MJ: Graph Edge Providers'] = [
            {
                ID: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
                GraphID: IDS.GraphCanon,
                Name: 'Index-Aware Joins',
                DriverClass: 'IndexAwareJoinEdgeProvider',
                IsActive: true,
                Sequence: 1,
                Configuration: '{}',
            },
        ];

        const engine = GraphEngine.Instance;
        const user = MakeUser('analyst-1', ['Analyst'], 'Owner');
        await engine.Config(true, user, fake as unknown as IMetadataProvider);

        const from = { EntityName: 'MJ: Entities', EntityID: entitiesMeta.ID, RecordID: ENT_ORG };
        const to = { EntityName: 'MJ: Entities', EntityID: entitiesMeta.ID, RecordID: ENT_INV };

        // HopFirst (default) stops at the 1-hop unindexed direct edge (weight 0.20)
        const hopFirst = await engine.FindPath('MJ Canon', from, to, { Direction: 'Out', Depth: 3 }, user, fake as unknown as IMetadataProvider);
        expect(hopFirst.Found, hopFirst.Message).toBe(true);
        expect(hopFirst.Edges).toHaveLength(1);
        expect(hopFirst.PathWeight).toBeCloseTo(0.2, 3);

        // Weighted (Dijkstra) picks the 2-hop indexed path: Organizations -> Orders (0.90) -> Invoices (0.85 * 0.85) = 0.65025
        const weighted = await engine.FindPath(
            'MJ Canon',
            from,
            to,
            { Direction: 'Out', Depth: 3, Strategy: 'Weighted' },
            user,
            fake as unknown as IMetadataProvider,
        );
        expect(weighted.Found).toBe(true);
        expect(weighted.Edges).toHaveLength(2);
        expect(weighted.Nodes.map((n) => n.RecordID)).toEqual([ENT_ORG, ENT_ORD, ENT_INV]);
        expect(weighted.PathWeight).toBeGreaterThan(0.6);

        const promptText = engine.DescribePathForPrompt(weighted, fake as unknown as IMetadataProvider);
        expect(promptText).toContain('IX_Orders_OrgID');
        expect(promptText).toContain('IX_Invoices_OrderID');
    });
});
