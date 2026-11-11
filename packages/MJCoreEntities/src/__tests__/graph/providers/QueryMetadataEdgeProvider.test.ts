import { describe, it, expect, vi } from 'vitest';
import { QueryMetadataEdgeProvider } from '../../../graph/providers/QueryMetadataEdgeProvider';
import { QueryEngine } from '../../../engines/QueryEngine';
import type { MJQueryDependencyEntity, MJQueryEntityEntity } from '../../../generated/entity_subclasses';
import { FakeGraphProvider, IDS } from '../graphTestFixtures';
import { Ctx } from './providerTestContext';

describe('QueryMetadataEdgeProvider', () => {
    it('emits Reads and Composes edges for a frontier query from the QueryEngine cache', async () => {
        vi.spyOn(QueryEngine.Instance, 'QueryEntities', 'get').mockReturnValue([
            { ID: 'qe-1', QueryID: IDS.QueryArAging, EntityID: IDS.Invoices, AlternateBaseViewID: IDS.InvoicesOpenAbv },
            { ID: 'qe-2', QueryID: IDS.QueryBaseInvoices, EntityID: IDS.Invoices, AlternateBaseViewID: null },
        ] as unknown as MJQueryEntityEntity[]);
        vi.spyOn(QueryEngine.Instance, 'QueryDependencies', 'get').mockReturnValue([
            { ID: 'qd-1', QueryID: IDS.QueryArAging, DependsOnQueryID: IDS.QueryBaseInvoices },
        ] as unknown as MJQueryDependencyEntity[]);
        const provider = new FakeGraphProvider();
        const edges = await new QueryMetadataEdgeProvider().GetEdges(
            { Nodes: [{ EntityName: 'MJ: Queries', RecordID: IDS.QueryArAging }], Direction: 'Out' },
            Ctx(provider, { Include: ['Reads', 'Composes'] as Array<'Reads' | 'Composes'> }),
        );
        expect(edges.map((e) => e.TypeName).sort()).toEqual(['Composes', 'Reads']);
        expect(provider.ReadLog).toHaveLength(0);
    });

    it('returns nothing for an empty frontier', async () => {
        expect(await new QueryMetadataEdgeProvider().GetEdges({ Nodes: [], Direction: 'Both' }, Ctx(new FakeGraphProvider(), {}))).toEqual([]);
    });
});
