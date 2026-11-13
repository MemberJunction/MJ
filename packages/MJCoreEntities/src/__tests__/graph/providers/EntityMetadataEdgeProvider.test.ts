import { describe, it, expect } from 'vitest';
import { EntityMetadataEdgeProvider } from '../../../graph/providers/EntityMetadataEdgeProvider';
import { FakeGraphProvider, IDS } from '../graphTestFixtures';
import { Ctx } from './providerTestContext';

describe('EntityMetadataEdgeProvider', () => {
    it('emits Is A and References edges for a frontier entity from metadata alone', async () => {
        const provider = new FakeGraphProvider();
        const edges = await new EntityMetadataEdgeProvider().GetEdges(
            { Nodes: [{ EntityName: 'MJ: Entities', RecordID: IDS.Invoices }], Direction: 'Out' },
            Ctx(provider, { Include: ['IsA', 'References', 'FieldOf'] as Array<'IsA' | 'References' | 'FieldOf'> }),
        );
        expect(edges.map((e) => e.TypeName)).toEqual(expect.arrayContaining(['Is A', 'References']));
        expect(edges.every((e) => e.Source.RecordID === IDS.Invoices)).toBe(true);
        expect(provider.ReadLog).toHaveLength(0);
    });

    it('never enumerates the whole schema: an empty frontier yields no edges', async () => {
        const provider = new FakeGraphProvider();
        expect(await new EntityMetadataEdgeProvider().GetEdges({ Nodes: [], Direction: 'Both' }, Ctx(provider, {}))).toEqual([]);
    });
});
