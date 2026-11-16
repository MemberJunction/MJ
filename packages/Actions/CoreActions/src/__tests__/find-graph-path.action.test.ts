/**
 * FindGraphPathAction is a thin wrapper over CanonGraphEngine.ResolveGraphEndpoint and
 * GraphEngine.FindPath; both are stubbed and the tests check the endpoints it resolves, the options
 * it passes, and the result code an agent sees for each outcome.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RunActionParams } from '@memberjunction/actions-base';
import { CanonGraphEngine, GraphEngine, type GraphEndpointInput, type GraphNodeView, type GraphPath, type MJGraphEntity } from '@memberjunction/core-entities';
import { FindGraphPathAction, type FindGraphPathActionResult } from '../custom/data/find-graph-path.action';

const caller = { ID: 'u-1', Name: 'User 1', UserRoles: [{ UserID: 'u-1', RoleID: 'r-1', Role: 'Analyst' }] } as unknown as UserInfo;
const canon = { ID: 'g-canon', Name: 'MJ Canon', Status: 'Active' } as unknown as MJGraphEntity;
const node = (id: string, label: string): GraphNodeView => ({ Key: id, EntityName: 'MJ: Graph Concepts', RecordID: id, Label: label, Icon: null, Description: null });
const foundPath: GraphPath = { Found: true, Nodes: [node('c-1', 'Open AR'), node('c-2', 'Accounts Receivable')], Edges: [], PathWeight: 0.8 };

class TestableFindGraphPathAction extends FindGraphPathAction {
    public async RunForTest(params: RunActionParams): Promise<FindGraphPathActionResult> {
        return this.InternalRunAction(params);
    }
}

function run(params: Array<{ Name: string; Value: unknown }>): Promise<FindGraphPathActionResult> {
    return new TestableFindGraphPathAction().RunForTest({
        ContextUser: caller,
        Params: params.map((p) => ({ ...p, Type: 'Input' as const })),
    } as unknown as RunActionParams);
}

describe('FindGraphPathAction', () => {
    let findPathSpy: ReturnType<typeof vi.spyOn>;
    let resolveSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(CanonGraphEngine.Instance, 'EnsureConfigured').mockResolvedValue(undefined);
        vi.spyOn(GraphEngine.Instance, 'GetGraph').mockImplementation((name: string) => (name.toLowerCase() === 'mj canon' ? canon : undefined));
        resolveSpy = vi.spyOn(CanonGraphEngine.Instance, 'ResolveGraphEndpoint').mockImplementation(async (endpoint: GraphEndpointInput) => ({
            Status: 'Resolved',
            Node: endpoint.EntityName ? { EntityName: endpoint.EntityName, RecordID: endpoint.RecordID ?? '' } : { EntityName: 'MJ: Graph Concepts', RecordID: endpoint.Concept ?? '' },
            Candidates: [],
        }));
        findPathSpy = vi.spyOn(GraphEngine.Instance, 'FindPath').mockResolvedValue(foundPath);
        vi.spyOn(GraphEngine.Instance, 'DescribePathForPrompt').mockReturnValue('### Graph Path (1 hop, weight 0.80)');
    });

    it('resolves a concept name and a record object, searches at full reach by default, and returns the path', async () => {
        const result = await run([
            { Name: 'From', Value: 'Open AR' },
            { Name: 'To', Value: '{"EntityName":"Invoices","RecordID":"inv-1"}' },
        ]);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(resolveSpy.mock.calls.map((c) => c[0])).toEqual([{ Concept: 'Open AR' }, { EntityName: 'Invoices', RecordID: 'inv-1' }]);
        const [graphName, from, to, options, user] = findPathSpy.mock.calls[0];
        expect(graphName).toBe('MJ Canon');
        expect(from).toEqual({ EntityName: 'MJ: Graph Concepts', RecordID: 'Open AR' });
        expect(to).toEqual({ EntityName: 'Invoices', RecordID: 'inv-1' });
        expect(options).toMatchObject({ Depth: 4, MaxNodes: 200, Direction: 'Both', IncludeProposed: false });
        expect(user).toBe(caller);
        expect(result.PromptText).toContain('Graph Path');
    });

    it('treats a concept name containing a comma as one name', async () => {
        await run([
            { Name: 'From', Value: 'Revenue, Recognized' },
            { Name: 'To', Value: 'Open AR' },
        ]);
        expect(resolveSpy.mock.calls[0][0]).toEqual({ Concept: 'Revenue, Recognized' });
    });

    it('returns NO_PATH as an answer when the endpoints are not connected', async () => {
        findPathSpy.mockResolvedValue({ Found: false, Nodes: [], Edges: [], PathWeight: 0, Message: 'No path found within 4 hops.' });
        const result = await run([
            { Name: 'From', Value: 'Open AR' },
            { Name: 'To', Value: 'Net Revenue' },
        ]);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('NO_PATH');
        expect(result.Message).toContain('No path found within 4 hops.');
    });

    it('refuses with AMBIGUOUS_ENDPOINT and the candidates instead of guessing', async () => {
        const candidates = [
            { Node: node('c-1', 'Open AR'), Score: 0.9, Kind: 'Partial' as const },
            { Node: node('c-3', 'Open Orders'), Score: 0.9, Kind: 'Partial' as const },
        ];
        resolveSpy.mockResolvedValueOnce({ Status: 'Ambiguous', Candidates: candidates });
        const result = await run([
            { Name: 'From', Value: 'open' },
            { Name: 'To', Value: 'Net Revenue' },
        ]);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('AMBIGUOUS_ENDPOINT');
        expect(result.Candidates).toHaveLength(2);
        expect(result.Message).toContain('From fits several concepts');
        expect(findPathSpy).not.toHaveBeenCalled();
    });

    it('refuses with ENDPOINT_NOT_FOUND, GRAPH_NOT_FOUND and MISSING_PARAMETER where they apply', async () => {
        resolveSpy.mockResolvedValueOnce({ Status: 'Resolved', Node: { EntityName: 'X', RecordID: '1' }, Candidates: [] }).mockResolvedValueOnce({ Status: 'NotFound', Candidates: [] });
        expect((await run([{ Name: 'From', Value: 'Open AR' }, { Name: 'To', Value: 'zebra' }])).ResultCode).toBe('ENDPOINT_NOT_FOUND');
        expect((await run([{ Name: 'GraphName', Value: 'Nope' }, { Name: 'From', Value: 'a' }, { Name: 'To', Value: 'b' }])).ResultCode).toBe('GRAPH_NOT_FOUND');
        expect((await run([{ Name: 'From', Value: 'Open AR' }])).ResultCode).toBe('MISSING_PARAMETER');
    });

    it('forwards params.Provider to FindPathBetween and DescribePathForPrompt', async () => {
        const customProvider = { Entities: [] } as unknown as RunActionParams['Provider'];
        const betweenSpy = vi.spyOn(CanonGraphEngine.Instance, 'FindPathBetween');
        const describeSpy = vi.spyOn(GraphEngine.Instance, 'DescribePathForPrompt');
        await new TestableFindGraphPathAction().RunForTest({
            ContextUser: caller,
            Provider: customProvider,
            Params: [
                { Name: 'From', Value: 'Open AR', Type: 'Input' },
                { Name: 'To', Value: 'Accounts Receivable', Type: 'Input' },
            ],
        } as unknown as RunActionParams);
        expect(betweenSpy.mock.calls[0][5]).toBe(customProvider);
        expect(describeSpy).toHaveBeenCalledWith(foundPath, customProvider);
    });
});
