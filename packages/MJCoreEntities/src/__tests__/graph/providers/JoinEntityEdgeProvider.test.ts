import { describe, it, expect } from 'vitest';
import { JoinEntityEdgeProvider } from '../../../graph/providers/JoinEntityEdgeProvider';
import { FakeGraphProvider } from '../graphTestFixtures';
import { Caller, Ctx } from './providerTestContext';

describe('JoinEntityEdgeProvider', () => {
    const config = { JoinEntity: 'AccountContacts', SourceField: 'AccountID', SourceEntity: 'Accounts', TargetField: 'ContactID', TargetEntity: 'Contacts', EdgeTypeName: 'Has Contact', AttributeFields: ['Role'] };

    it('projects junction rows into direct edges with attributes, read once, ordered, as the caller', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = { AccountContacts: [{ ID: 'ac-1', AccountID: 'acc-100', ContactID: 'con-55', Role: 'Billing' }] };
        const edges = await new JoinEntityEdgeProvider().GetEdges({ Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-100' }], Direction: 'Out' }, Ctx(provider, config));
        expect(edges).toHaveLength(1);
        expect(edges[0].Source.RecordID).toBe('acc-100');
        expect(edges[0].Target.RecordID).toBe('con-55');
        expect(edges[0].Attributes).toEqual({ Role: 'Billing' });
        const reads = provider.ReadsOf('AccountContacts');
        expect(reads).toHaveLength(1);
        expect(reads[0].UserID).toBe(Caller.ID);
        expect(reads[0].OrderBy).toBe('[AccountID], [ContactID]');
    });

    it('refuses a configured column that is not a field of the join entity, so config text never reaches SQL', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = { AccountContacts: [] };
        const injected = { ...config, TargetField: 'ContactID] = 1; DROP TABLE x; --' };
        expect(await new JoinEntityEdgeProvider().GetEdges({ Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-100' }], Direction: 'Out' }, Ctx(provider, injected))).toEqual([]);
        const badAttribute = { ...config, AttributeFields: ['Role', 'NotAField'] };
        expect(await new JoinEntityEdgeProvider().GetEdges({ Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-100' }], Direction: 'Out' }, Ctx(provider, badAttribute))).toEqual([]);
        expect(provider.ReadLog).toHaveLength(0);
    });
});
