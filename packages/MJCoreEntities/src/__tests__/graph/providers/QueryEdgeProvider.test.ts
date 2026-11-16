import { describe, it, expect, vi } from 'vitest';
import { QueryEdgeProvider } from '../../../graph/providers/QueryEdgeProvider';
import { QueryEngine } from '../../../engines/QueryEngine';
import type { MJQueryEntityExtended } from '../../../custom/MJQueryEntityExtended';
import { FakeGraphProvider, IDS } from '../graphTestFixtures';
import { Caller, Ctx } from './providerTestContext';

function stubQuery(canRun: boolean): void {
    const query = { ID: IDS.QueryArAging, Name: 'CoPurchased', UserCanRun: () => ({ canRun, deniedEntities: canRun ? [] : ['Accounts'] }) } as unknown as MJQueryEntityExtended;
    vi.spyOn(QueryEngine.Instance, 'FindQueryByName').mockReturnValue(query);
}

describe('QueryEdgeProvider', () => {
    const request = { Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-1' }], Direction: 'Out' as const };

    function providerWithRows(): FakeGraphProvider {
        const provider = new FakeGraphProvider();
        provider.QueryRows = [
            { SourceEntity: 'Accounts', SourceRecordID: 'acc-1', TargetEntity: 'Accounts', TargetRecordID: 'acc-2', Weight: 0.75 },
            { SourceEntity: 'Accounts', SourceRecordID: 'acc-9', TargetEntity: 'Accounts', TargetRecordID: 'acc-8', Weight: 0.75 },
        ];
        return provider;
    }

    it('runs the query as the caller when UserCanRun().canRun is true, keeping frontier edges only', async () => {
        stubQuery(true);
        const provider = providerWithRows();
        const edges = await new QueryEdgeProvider().GetEdges(request, Ctx(provider, { QueryName: 'CoPurchased', EdgeTypeName: 'Related Account' }));
        expect(edges.map((e) => e.Target.RecordID)).toEqual(['acc-2']);
        expect(provider.QueryLog[0].UserID).toBe(Caller.ID);
    });

    it('skips the query when UserCanRun returns { canRun: false } (the object is truthy)', async () => {
        stubQuery(false);
        const provider = providerWithRows();
        expect(await new QueryEdgeProvider().GetEdges(request, Ctx(provider, { QueryName: 'CoPurchased' }))).toEqual([]);
        expect(provider.QueryLog).toHaveLength(0);
    });

    it('frontier-scopes the query through FrontierParameter and caps rows per step', async () => {
        stubQuery(true);
        const provider = providerWithRows();
        await new QueryEdgeProvider().GetEdges(
            { Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-3' }, { EntityName: 'Accounts', RecordID: 'acc-1' }], Direction: 'Out' },
            Ctx(provider, { QueryName: 'CoPurchased', FrontierParameter: 'NodeIDs', Parameters: { MinShared: 2 }, MaxRowsPerStep: 5 }),
        );
        const params = provider.QueryLog[0].Params;
        expect(params.Parameters).toEqual({ MinShared: 2, NodeIDs: ['acc-1', 'acc-3'] });
        expect(params.MaxRows).toBe(5);
    });

    it('caps an unscoped query at the default per-step limit', async () => {
        stubQuery(true);
        const provider = providerWithRows();
        await new QueryEdgeProvider().GetEdges(request, Ctx(provider, { QueryName: 'CoPurchased' }));
        expect(provider.QueryLog[0].Params.MaxRows).toBe(200);
    });
});
