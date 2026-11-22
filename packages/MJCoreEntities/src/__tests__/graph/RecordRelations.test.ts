import { describe, expect, it } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { GraphEdgeView, GraphNodeRef, GraphNodeView } from '../../graph/BaseGraphEdgeProvider';
import type { GraphEngine } from '../../graph/GraphEngine';
import { LoadRecordRelations, RelationGraphNames } from '../../graph/RecordRelations';

const viewer = { ID: 'u-viewer', Name: 'Viewer' } as unknown as UserInfo;
const key = (r: GraphNodeRef) => `${r.EntityName}|${r.RecordID}`;
const doc = (id: string): GraphNodeRef => ({ EntityName: 'MJ: Artifacts', RecordID: id });

function edge(type: string, source: GraphNodeRef, target: GraphNodeRef, graph: string, attributes: Record<string, unknown> | null = null): GraphEdgeView {
    return {
        ID: `${type}:${key(source)}:${key(target)}:${graph}`,
        GraphName: graph,
        TypeName: type,
        Source: source,
        Target: target,
        IsDirected: type === 'LinksTo',
        Weight: 0.8,
        Description: null,
        Attributes: attributes,
        Origin: 'Derived',
        Status: 'Approved',
        Confidence: null,
    };
}

/**
 * A stub engine: `self` links to b and c, d links to `self`, e shares 3 concepts and f 1. The viewer
 * cannot see c. Two graphs project relations; one graph does not.
 */
function engine() {
    const self = doc('a');
    const edgesByGraph: Record<string, GraphEdgeView[]> = {
        'Library Knowledge': [
            edge('LinksTo', self, doc('b'), 'Library Knowledge'),
            edge('LinksTo', self, doc('c'), 'Library Knowledge'),
            edge('LinksTo', doc('d'), self, 'Library Knowledge'),
            edge('SharesConceptWith', self, doc('f'), 'Library Knowledge', { SharedConceptIDs: ['k1'] }),
            edge('SharesConceptWith', doc('e'), self, 'Library Knowledge', { SharedConceptIDs: ['k1', 'k2'] }),
        ],
        'Team Notes': [
            edge('SharesConceptWith', self, doc('e'), 'Team Notes', { SharedConceptIDs: ['k1', 'k2', 'k3'] }),
            edge('LinksTo', self, doc('b'), 'Team Notes'),
        ],
    };
    const calls: string[] = [];
    const stub = {
        Graphs: [
            { ID: 'G1', Name: 'Library Knowledge', Status: 'Active' },
            { ID: 'G2', Name: 'Team Notes', Status: 'Active' },
            { ID: 'G3', Name: 'MJ Canon', Status: 'Active' },
            { ID: 'G4', Name: 'Retired', Status: 'Disabled' },
        ],
        EdgeProviders: [
            { GraphID: 'g1', DriverClass: 'RecordLinkEdgeProvider', IsActive: true },
            { GraphID: 'G1', DriverClass: 'SharedConceptEdgeProvider', IsActive: true },
            { GraphID: 'G2', DriverClass: 'SharedConceptEdgeProvider', IsActive: true },
            { GraphID: 'G3', DriverClass: 'EntityMetadataEdgeProvider', IsActive: true },
            { GraphID: 'G4', DriverClass: 'SharedConceptEdgeProvider', IsActive: true },
        ],
        GetNodeKey: (r: GraphNodeRef) => key(r),
        GetEdges: async (graph: string, _node: GraphNodeRef, options: { EdgeTypes?: string[] }, user: UserInfo) => {
            calls.push(`${graph}:${options.EdgeTypes?.join('+')}:${user.ID}`);
            return edgesByGraph[graph] ?? [];
        },
        FilterNodesForUser: async (nodes: GraphNodeRef[]) => {
            const out = new Map<string, GraphNodeView>();
            for (const n of nodes) {
                if (n.RecordID !== 'c') {
                    out.set(key(n), { Key: key(n), EntityName: n.EntityName, RecordID: n.RecordID, Label: `Doc ${n.RecordID.toUpperCase()}`, Icon: null, Description: null });
                }
            }
            return out;
        },
    };
    return { engine: stub as unknown as GraphEngine, calls, self };
}

describe('LoadRecordRelations', () => {
    it('reads only active graphs that project relation edges, as the viewer', async () => {
        const { engine: e, calls, self } = engine();
        expect(RelationGraphNames(e)).toEqual(['Library Knowledge', 'Team Notes']);
        await LoadRecordRelations(e, self, viewer);
        expect(calls.sort()).toEqual(['Library Knowledge:LinksTo+SharesConceptWith:u-viewer', 'Team Notes:LinksTo+SharesConceptWith:u-viewer']);
    });

    it('splits links, backlinks and concept relations, de-duplicates across graphs and drops what the viewer cannot see', async () => {
        const { engine: e, self } = engine();
        const relations = await LoadRecordRelations(e, self, viewer);
        expect(relations.Links.map((r) => r.Node.RecordID)).toEqual(['b']);
        expect(relations.Backlinks.map((r) => r.Node.RecordID)).toEqual(['d']);
        expect(relations.Related.map((r) => [r.Node.RecordID, r.SharedConceptCount, r.GraphName])).toEqual([
            ['e', 3, 'Team Notes'],
            ['f', 1, 'Library Knowledge'],
        ]);
    });

    it('returns empty lists when no graph projects relations', async () => {
        const { engine: e, self } = engine();
        const relations = await LoadRecordRelations(e, self, viewer, { GraphNames: [] });
        expect(relations).toEqual({ Links: [], Backlinks: [], Related: [] });
    });
});
