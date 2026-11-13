import { describe, it, expect } from 'vitest';
import { ForeignKeyEdgeProvider } from '../../../graph/providers/ForeignKeyEdgeProvider';
import { FakeGraphProvider } from '../graphTestFixtures';
import { Caller, Ctx } from './providerTestContext';

describe('ForeignKeyEdgeProvider', () => {
    const config = { SourceEntity: 'Invoices', ForeignKeyField: 'AccountID', TargetEntity: 'Accounts', EdgeTypeName: 'Billed To', Weight: 0.9 };

    it('derives one edge per row across the FK in a single ordered, capped read as the caller', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = { Invoices: [{ ID: 'inv-1', AccountID: 'acc-100' }, { ID: 'inv-2', AccountID: 'acc-200' }] };
        const edges = await new ForeignKeyEdgeProvider().GetEdges({ Nodes: [{ EntityName: 'Invoices', RecordID: 'inv-1' }], Direction: 'Out' }, Ctx(provider, config));
        expect(edges.map((e) => [e.Source.RecordID, e.Target.RecordID])).toEqual([['inv-1', 'acc-100'], ['inv-2', 'acc-200']]);
        expect(edges[0].TypeName).toBe('Billed To');
        expect(edges[0].Weight).toBe(0.9);
        const reads = provider.ReadsOf('Invoices');
        expect(reads).toHaveLength(1);
        expect(reads[0].UserID).toBe(Caller.ID);
        expect(reads[0].OrderBy).toBe('[AccountID], [ID]');
        expect(reads[0].MaxRows).toBe(200);
    });

    it('clamps MaxRowsPerStep to 1000', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = { Invoices: [] };
        await new ForeignKeyEdgeProvider().GetEdges({ Nodes: [{ EntityName: 'Invoices', RecordID: 'inv-1' }], Direction: 'Out' }, Ctx(provider, { ...config, MaxRowsPerStep: 50_000 }));
        expect(provider.ReadsOf('Invoices')[0].MaxRows).toBe(1000);
    });

    it('returns nothing for an empty frontier or an unknown FK field', async () => {
        const provider = new FakeGraphProvider();
        expect(await new ForeignKeyEdgeProvider().GetEdges({ Nodes: [], Direction: 'Out' }, Ctx(provider, config))).toEqual([]);
        expect(await new ForeignKeyEdgeProvider().GetEdges({ Nodes: [{ EntityName: 'Invoices', RecordID: 'inv-1' }], Direction: 'Out' }, Ctx(provider, { ...config, ForeignKeyField: 'Nope' }))).toEqual([]);
        expect(provider.ReadLog).toHaveLength(0);
    });
});
