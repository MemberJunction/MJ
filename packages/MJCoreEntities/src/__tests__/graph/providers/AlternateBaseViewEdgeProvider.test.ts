import { describe, it, expect } from 'vitest';
import { AlternateBaseViewEdgeProvider } from '../../../graph/providers/AlternateBaseViewEdgeProvider';
import { FakeGraphProvider, IDS } from '../graphTestFixtures';
import { Ctx } from './providerTestContext';

describe('AlternateBaseViewEdgeProvider', () => {
    it('emits Subsets edges into a frontier entity from metadata alone', async () => {
        const provider = new FakeGraphProvider();
        const edges = await new AlternateBaseViewEdgeProvider().GetEdges(
            { Nodes: [{ EntityName: 'MJ: Entities', RecordID: IDS.Invoices }], Direction: 'In' },
            Ctx(provider, {}),
        );
        expect(edges.some((e) => e.TypeName === 'Subsets' && e.Source.RecordID === IDS.InvoicesOpenAbv)).toBe(true);
        expect(provider.ReadLog).toHaveLength(0);
    });

    it('returns nothing for an empty frontier', async () => {
        expect(await new AlternateBaseViewEdgeProvider().GetEdges({ Nodes: [], Direction: 'Both' }, Ctx(new FakeGraphProvider(), {}))).toEqual([]);
    });
});
