import { describe, it, expect } from 'vitest';
import { GRAPH_DEFAULT_EDGE_TYPE } from '../../../graph/BaseGraphEdgeProvider';
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

    it('groups frontier nodes by entity ID whatever the UUID casing, one clause per entity per side', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = { 'MJ: Record Links': [] };
        const entityId = 'abcdef12-3456-4789-8abc-def012345678';
        await new RecordLinkEdgeProvider().GetEdges(
            {
                Nodes: [
                    { EntityName: '', EntityID: entityId.toUpperCase(), RecordID: 'acc-1' },
                    { EntityName: '', EntityID: entityId.toLowerCase(), RecordID: 'acc-2' },
                ],
                Direction: 'Out',
            },
            Ctx(provider, {}),
        );
        const filter = provider.ReadsOf('MJ: Record Links')[0].Filter;
        expect(filter.match(/\[SourceEntityID\] = /g)).toHaveLength(1);
        expect(filter).toContain("'acc-1', 'acc-2'");
    });

    it('names an untyped link RelatedTo, which an edge-type filter written with or without the space matches', async () => {
        const provider = new FakeGraphProvider();
        provider.Rows = {
            'MJ: Record Links': [
                { ID: 'link-2', SourceEntityID: IDS.Accounts, SourceRecordID: 'acc-100', TargetEntityID: IDS.Contacts, TargetRecordID: 'con-200', LinkType: null },
            ],
        };
        const nodes = [{ EntityName: 'Accounts', EntityID: IDS.Accounts, RecordID: 'acc-100' }];
        const plain = await new RecordLinkEdgeProvider().GetEdges({ Nodes: nodes, Direction: 'Out' }, Ctx(provider, {}));
        expect(plain.map((e) => e.TypeName)).toEqual([GRAPH_DEFAULT_EDGE_TYPE]);
        for (const filter of ['RelatedTo', 'Related To']) {
            const filtered = await new RecordLinkEdgeProvider().GetEdges({ Nodes: nodes, Direction: 'Out', EdgeTypes: [filter] }, Ctx(provider, {}));
            expect(filtered).toHaveLength(1);
        }
    });

    it('returns nothing for an empty frontier', async () => {
        const provider = new FakeGraphProvider();
        expect(await new RecordLinkEdgeProvider().GetEdges({ Nodes: [], Direction: 'Both' }, Ctx(provider, {}))).toEqual([]);
    });
});
