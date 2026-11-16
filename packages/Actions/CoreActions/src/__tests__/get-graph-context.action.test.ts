/**
 * GetGraphContextAction is a thin wrapper over CanonGraphEngine/GraphEngine, so those engines (its
 * dependencies) are stubbed with spies and the tests check what the action asks of them and returns.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RunActionParams } from '@memberjunction/actions-base';
import {
    CanonGraphEngine,
    GraphEngine,
    type ConceptMatch,
    type ConceptResolution,
    type GraphNodeView,
    type GraphSubgraph,
    type MJGraphEntity,
} from '@memberjunction/core-entities';
import { GetGraphContextAction, type GetGraphContextActionResult } from '../custom/data/get-graph-context.action';

const caller = { ID: 'u-1', Name: 'User 1', UserRoles: [{ UserID: 'u-1', RoleID: 'r-1', Role: 'Analyst' }] } as unknown as UserInfo;
const canon = { ID: 'g-canon', Name: 'MJ Canon', Status: 'Active', LoadMode: 'Preload' } as unknown as MJGraphEntity;
const concept: GraphNodeView = { Key: 'k-c', EntityName: 'MJ: Graph Concepts', RecordID: 'c-open-ar', Label: 'Open AR', Icon: null, Description: 'Unpaid invoices' };
const openOrders: GraphNodeView = { Key: 'k-o', EntityName: 'MJ: Graph Concepts', RecordID: 'c-open-orders', Label: 'Open Orders', Icon: null, Description: null };
const subgraph: GraphSubgraph = {
    Nodes: [concept, { Key: 'k-v', EntityName: 'MJ: Entity Alternate Base Views', RecordID: 'abv-1', Label: 'Invoices.vwInvoicesOpen', Icon: null, Description: null }],
    Edges: [],
};

function match(node: GraphNodeView, score = 1, kind: ConceptMatch['Kind'] = 'Exact'): ConceptMatch {
    return { Node: node, Score: score, Kind: kind };
}

function matched(...nodes: GraphNodeView[]): ConceptResolution {
    return { Status: 'Matched', Matches: nodes.map((n) => match(n)), Candidates: [] };
}

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
    let resolveSpy: ReturnType<typeof vi.spyOn>;
    let ensureSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        ensureSpy = vi.spyOn(CanonGraphEngine.Instance, 'EnsureConfigured').mockResolvedValue(undefined);
        resolveSpy = vi.spyOn(CanonGraphEngine.Instance, 'ResolveConcepts').mockResolvedValue(matched(concept));
        vi.spyOn(GraphEngine.Instance, 'GetGraph').mockImplementation((name: string) => (name.toLowerCase() === 'mj canon' ? canon : undefined));
        vi.spyOn(GraphEngine.Instance, 'Concepts', 'get').mockReturnValue([]);
        subgraphSpy = vi.spyOn(GraphEngine.Instance, 'Subgraph').mockResolvedValue(subgraph);
        vi.spyOn(GraphEngine.Instance, 'DescribeForPrompt').mockReturnValue('### Semantic Graph Context');
    });

    it('expands from a question as the caller and returns the subgraph and prompt text', async () => {
        const result = await run([{ Name: 'Question', Value: 'What is Unpaid Invoices?' }, { Name: 'MaxNodes', Value: 5000 }, { Name: 'Depth', Value: 9 }]);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Resolution).toBe('Matched');
        expect(result.NodeCount).toBe(2);
        expect(ensureSpy).toHaveBeenCalledWith(caller, undefined);
        expect(resolveSpy).toHaveBeenCalledWith('What is Unpaid Invoices?', caller, { GraphNames: ['MJ Canon'], IncludeProposed: false, provider: undefined });
        const [graphName, seeds, options, user, provider] = subgraphSpy.mock.calls[0];
        expect(graphName).toBe('MJ Canon');
        expect(seeds).toEqual([{ EntityName: 'MJ: Graph Concepts', EntityID: undefined, RecordID: 'c-open-ar' }]);
        expect(options).toMatchObject({ Depth: 4, MaxNodes: 200 });
        expect(user).toBe(caller);
        expect(provider).toBeUndefined(); // the action's own provider (none in this test) carries the reads
    });

    it('asks for proposed concepts only when IncludeProposed is set, for the seeds and the traversal alike', async () => {
        await run([{ Name: 'Question', Value: 'Open AR' }, { Name: 'IncludeProposed', Value: true }]);
        expect(resolveSpy).toHaveBeenCalledWith('Open AR', caller, { GraphNames: ['MJ Canon'], IncludeProposed: true, provider: undefined });
        expect(subgraphSpy.mock.calls[0][2]).toMatchObject({ IncludeProposed: true });
    });

    it('takes record seeds from plain objects (either casing) and ignores arrays and scalars', async () => {
        await run([{ Name: 'Seeds', Value: [{ entityName: 'Accounts', recordId: 'a-1' }, ['Accounts', 'a-2'], 42] }]);
        expect(subgraphSpy.mock.calls[0][1]).toEqual([{ EntityName: 'Accounts', EntityID: undefined, RecordID: 'a-1' }]);
    });

    it('resolves string concept seeds through ResolveConcepts scoped to the requested graph rather than picking a same-named concept from another graph', async () => {
        vi.spyOn(GraphEngine.Instance, 'Concepts', 'get').mockReturnValue([
            { ID: '11111111-1111-4111-8111-111111111111', GraphID: 'g-other', Name: 'Open AR', Status: 'Deprecated' },
            { ID: '22222222-2222-4222-8222-222222222222', GraphID: 'g-canon', Name: 'Open AR', Status: 'Approved' },
        ] as unknown as typeof GraphEngine.Instance.Concepts);
        const result = await run([{ Name: 'Seeds', Value: ['Open AR', '11111111-1111-4111-8111-111111111111'] }]);
        expect(result.Success).toBe(true);
        expect(resolveSpy).toHaveBeenCalledTimes(2);
        expect(subgraphSpy.mock.calls[0][1]).toEqual([{ EntityName: 'MJ: Graph Concepts', EntityID: undefined, RecordID: 'c-open-ar' }]);
    });

    it('reports AMBIGUOUS_CONCEPT with the candidates when the question fits several concepts equally well, and still returns their context', async () => {
        const candidates = [match(concept, 0.9, 'Partial'), match(openOrders, 0.9, 'Partial')];
        resolveSpy.mockResolvedValue({ Status: 'Ambiguous', Matches: candidates, Candidates: candidates });
        const result = await run([{ Name: 'Question', Value: 'open' }]);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('AMBIGUOUS_CONCEPT');
        expect(result.Resolution).toBe('Ambiguous');
        expect(result.Candidates?.map((c) => c.Node.Label)).toEqual(['Open AR', 'Open Orders']);
        expect(result.Message).toContain('"Open AR", "Open Orders"');
        expect(subgraphSpy.mock.calls[0][1]).toHaveLength(2);
    });

    it('reports NO_MATCH (an answer, not a failure) when nothing the caller can see matches', async () => {
        resolveSpy.mockResolvedValue({ Status: 'NoMatch', Matches: [], Candidates: [] });
        const result = await run([{ Name: 'Question', Value: 'zebra crossings' }]);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('NO_MATCH');
        expect(result.NodeCount).toBe(0);
        expect(subgraphSpy).not.toHaveBeenCalled();
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
