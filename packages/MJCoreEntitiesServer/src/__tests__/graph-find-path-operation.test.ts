/**
 * Graph.FindPath is a thin adapter over CanonGraphEngine.FindPathBetween: the engine is stubbed and
 * the tests check the request it forwards and the wire shape it returns for each outcome.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CanonGraphEngine, GraphEngine, type GraphFindPathInput, type GraphFindPathOutput, type GraphPathRequestResult } from '@memberjunction/core-entities';
import { GraphFindPathServerOperation, HasEndpoint, TraversalOptionsOf } from '../custom/graph/GraphFindPathServerOperation';

const caller = { ID: 'u-1', Name: 'User 1' } as unknown as UserInfo;
const provider = { Entities: [] } as unknown as IMetadataProvider;

class TestableOperation extends GraphFindPathServerOperation {
    public Run(input: GraphFindPathInput): Promise<GraphFindPathOutput> {
        return this.InternalExecute(input, provider, caller);
    }
}

const found: GraphPathRequestResult = {
    Status: 'Found',
    Candidates: [],
    Path: {
        Found: true,
        PathWeight: 0.9,
        Nodes: [
            { Key: 'k1', EntityName: 'MJ: Graph Concepts', RecordID: 'c-1', Label: 'Open AR', Icon: null, Description: 'Unpaid invoices' },
            { Key: 'k2', EntityName: 'MJ: Queries', RecordID: 'q-1', Label: 'Open AR by Quarter', Icon: null, Description: null },
        ],
        Edges: [
            {
                ID: 'e-1',
                GraphName: 'MJ Canon',
                TypeName: 'Measures',
                Source: { EntityName: 'MJ: Queries', RecordID: 'q-1' },
                Target: { EntityName: 'MJ: Graph Concepts', RecordID: 'c-1' },
                IsDirected: true,
                Weight: 0.9,
                Description: null,
                Attributes: { Hidden: 'not on the wire' },
                Origin: 'Declared',
                Status: 'Approved',
                Confidence: null,
            },
        ],
    },
};

describe('GraphFindPathServerOperation', () => {
    let betweenSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        betweenSpy = vi.spyOn(CanonGraphEngine.Instance, 'FindPathBetween').mockResolvedValue(found);
        vi.spyOn(GraphEngine.Instance, 'DescribePathForPrompt').mockReturnValue('### Graph Path (1 hop, weight 0.90)');
    });

    it('forwards the request as the caller through the request provider, defaulting the graph to MJ Canon', async () => {
        const output = await new TestableOperation().Run({ From: { Concept: 'Open AR' }, To: { EntityName: 'MJ: Queries', RecordID: 'q-1' }, Depth: 3 });
        const [graphName, from, to, options, user, usedProvider] = betweenSpy.mock.calls[0];
        expect(graphName).toBe('MJ Canon');
        expect(from).toEqual({ Concept: 'Open AR' });
        expect(to).toEqual({ EntityName: 'MJ: Queries', RecordID: 'q-1' });
        expect(options).toMatchObject({ Direction: 'Both', Depth: 3, IncludeProposed: false });
        expect(user).toBe(caller);
        expect(usedProvider).toBe(provider);
        expect(output.Status).toBe('Found');
        expect(output.Nodes.map((n) => n.Label)).toEqual(['Open AR', 'Open AR by Quarter']);
        expect(output.Edges[0]).toEqual({
            ID: 'e-1',
            TypeName: 'Measures',
            SourceEntityName: 'MJ: Queries',
            SourceRecordID: 'q-1',
            TargetEntityName: 'MJ: Graph Concepts',
            TargetRecordID: 'c-1',
            IsDirected: true,
            Weight: 0.9,
            Description: null,
            Origin: 'Declared',
            Status: 'Approved',
        });
        expect(output.PromptText).toContain('Graph Path');
    });

    it('returns the ambiguous side and its candidates without prompt text', async () => {
        betweenSpy.mockResolvedValue({
            Status: 'AmbiguousEndpoint',
            Endpoint: 'To',
            Path: { Found: false, Nodes: [], Edges: [], PathWeight: 0 },
            Candidates: [{ Node: { Key: 'k', EntityName: 'MJ: Graph Concepts', RecordID: 'c-9', Label: 'Open Orders', Icon: null, Description: null }, Score: 0.9, Kind: 'Partial' }],
        });
        const output = await new TestableOperation().Run({ From: { Concept: 'Open AR' }, To: { Concept: 'open' } });
        expect(output.Status).toBe('AmbiguousEndpoint');
        expect(output.AmbiguousEndpoint).toBe('To');
        expect(output.Candidates).toEqual([{ Name: 'Open Orders', RecordID: 'c-9', Description: null, Score: 0.9 }]);
        expect(output.PromptText).toBe('');
    });

    it('refuses a request missing an endpoint before reaching the engine', async () => {
        await expect(new TestableOperation().Run({ From: { Concept: 'Open AR' }, To: {} })).rejects.toThrow('From and To are required');
        expect(betweenSpy).not.toHaveBeenCalled();
    });

    it('HasEndpoint and TraversalOptionsOf normalize the wire input', () => {
        expect(HasEndpoint({ EntityName: 'Accounts', RecordID: ' ' })).toBe(false);
        expect(HasEndpoint({ Concept: 'Open AR' })).toBe(true);
        expect(TraversalOptionsOf({ From: {}, To: {}, MinWeight: 4, EdgeTypes: [] })).toMatchObject({ MinWeight: 1, EdgeTypes: undefined });
    });
});
