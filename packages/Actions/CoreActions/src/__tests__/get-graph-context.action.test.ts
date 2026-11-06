/**
 * GetGraphContextAction is a thin wrapper over CanonGraphEngine/GraphEngine, so those engines (its
 * dependencies) are stubbed with spies and the tests check what the action asks of them and returns.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RunActionParams } from '@memberjunction/actions-base';
import { CanonGraphEngine, GraphEngine, type GraphNodeView, type GraphSubgraph, type MJGraphEntity } from '@memberjunction/core-entities';
import { GetGraphContextAction, type GetGraphContextActionResult } from '../custom/data/get-graph-context.action';

const caller = { ID: 'u-1', Name: 'User 1', UserRoles: [{ UserID: 'u-1', RoleID: 'r-1', Role: 'Analyst' }] } as unknown as UserInfo;
const canon = { ID: 'g-canon', Name: 'MJ Canon', Status: 'Active', LoadMode: 'Preload' } as unknown as MJGraphEntity;
const concept: GraphNodeView = { Key: 'k-c', EntityName: 'MJ: Graph Concepts', RecordID: 'c-open-ar', Label: 'Open AR', Icon: null, Description: 'Unpaid invoices' };
const subgraph: GraphSubgraph = {
    Nodes: [concept, { Key: 'k-v', EntityName: 'MJ: Entity Alternate Base Views', RecordID: 'abv-1', Label: 'Invoices.vwInvoicesOpen', Icon: null, Description: null }],
    Edges: [],
};

class TestableGetGraphContextAction extends GetGraphContextAction {
    public async RunForTest(params: RunActionParams): Promise<GetGraphContextActionResult> {
        return this.InternalRunAction(params);
    }
}

function run(params: Array<{ Name: string; Value: unknown }>): Promise<GetGraphContextActionResult> {
    return new TestableGetGraphContextAction().RunForTest({
        ContextUser: caller,
        Params: params.map((p) => ({ ...p, Type: 'Input' as const })),
    } as unknown as RunActionParams);
}

describe('GetGraphContextAction', () => {
    let subgraphSpy: ReturnType<typeof vi.spyOn>;
    let findSpy: ReturnType<typeof vi.spyOn>;
    let ensureSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ensureSpy = vi.spyOn(CanonGraphEngine.Instance, 'EnsureConfigured').mockResolvedValue(undefined);
        findSpy = vi.spyOn(CanonGraphEngine.Instance, 'FindConcepts').mockResolvedValue([concept]);
        vi.spyOn(GraphEngine.Instance, 'GetGraph').mockImplementation((name: string) => (name.toLowerCase() === 'mj canon' ? canon : undefined));
        subgraphSpy = vi.spyOn(GraphEngine.Instance, 'Subgraph').mockResolvedValue(subgraph);
        vi.spyOn(GraphEngine.Instance, 'DescribeForPrompt').mockReturnValue('### Semantic Graph Context');
    });

    it('expands from a question as the caller and returns the subgraph and prompt text', async () => {
        const result = await run([{ Name: 'Question', Value: 'What is Unpaid Invoices?' }, { Name: 'MaxNodes', Value: 5000 }, { Name: 'Depth', Value: 9 }]);
        expect(result.Success).toBe(true);
        expect(result.NodeCount).toBe(2);
        expect(ensureSpy).toHaveBeenCalledWith(caller, undefined);
        expect(findSpy).toHaveBeenCalledWith('What is Unpaid Invoices?', caller, { GraphNames: ['MJ Canon'], IncludeProposed: false, provider: undefined });
        const [graphName, seeds, options, user] = subgraphSpy.mock.calls[0];
        expect(graphName).toBe('MJ Canon');
        expect(seeds).toEqual([{ EntityName: 'MJ: Graph Concepts', EntityID: undefined, RecordID: 'c-open-ar' }]);
        expect(options).toMatchObject({ Depth: 4, MaxNodes: 200 });
        expect(user).toBe(caller);
    });

    it('asks for proposed concepts only when IncludeProposed is set, for the seeds and the traversal alike', async () => {
        await run([{ Name: 'Question', Value: 'Open AR' }, { Name: 'IncludeProposed', Value: true }]);
        expect(findSpy).toHaveBeenCalledWith('Open AR', caller, { GraphNames: ['MJ Canon'], IncludeProposed: true, provider: undefined });
        expect(subgraphSpy.mock.calls[0][2]).toMatchObject({ IncludeProposed: true });
    });

    it('takes record seeds from plain objects (either casing) and ignores arrays and scalars', async () => {
        await run([{ Name: 'Seeds', Value: [{ entityName: 'Accounts', recordId: 'a-1' }, ['Accounts', 'a-2'], 42] }]);
        expect(subgraphSpy.mock.calls[0][1]).toEqual([{ EntityName: 'Accounts', EntityID: undefined, RecordID: 'a-1' }]);
    });

    it('fails with GRAPH_NOT_FOUND for an unknown or inactive graph instead of traversing anything', async () => {
        const result = await run([{ Name: 'GraphName', Value: 'No Such Graph' }, { Name: 'Question', Value: 'Open AR' }]);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('GRAPH_NOT_FOUND');
        expect(subgraphSpy).not.toHaveBeenCalled();
    });

    it('returns MISSING_PARAMETER when neither Question nor Seeds is provided', async () => {
        const result = await run([]);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });
});
