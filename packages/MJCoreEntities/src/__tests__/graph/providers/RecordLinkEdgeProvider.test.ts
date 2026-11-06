import { describe, it, expect } from 'vitest';
import { RecordLinkEdgeProvider } from '../../../graph/providers/RecordLinkEdgeProvider';
import { FakeGraphProvider, IDS } from '../graphTestFixtures';
import { Caller, Ctx } from './providerTestContext';

describe('RecordLinkEdgeProvider', () => {
    it('projects record links into edges with one ordered, capped read as the caller', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = {
            'MJ: Record Links': [
                { ID: 'link-1', SourceEntityID: IDS.Accounts, SourceRecordID: 'acc-100', TargetEntityID: IDS.Contacts, TargetRecordID: 'con-200', LinkType: 'Primary Executive' },
            ],
        };
        const edges = await new RecordLinkEdgeProvider().GetEdges(
            { Nodes: [{ EntityName: 'Accounts', EntityID: IDS.Accounts, RecordID: 'acc-100' }], Direction: 'Out' },
            Ctx(provider, { LinkTypes: ['Primary Executive'] }),
        );
        expect(edges).toHaveLength(1);
        expect(edges[0].TypeName).toBe('Primary Executive');
        expect(edges[0].Source.EntityName).toBe('Accounts');
        expect(edges[0].Target.EntityName).toBe('Contacts');
        const read = provider.ReadsOf('MJ: Record Links')[0];
        expect(read.UserID).toBe(Caller.ID);
        expect(read.OrderBy).toBe('[ID]');
        expect(read.MaxRows).toBe(200);
    });

    it('returns nothing for an empty frontier', async () => {
        const provider = new FakeGraphProvider();
        expect(await new RecordLinkEdgeProvider().GetEdges({ Nodes: [], Direction: 'Both' }, Ctx(provider, {}))).toEqual([]);
    });
});
