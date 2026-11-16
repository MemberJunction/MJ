import { describe, it, expect, beforeEach } from 'vitest';
import {
    ComputeGraphPathWeight,
    ComputeGraphRRFScore,
    FormatGraphNodeBreadcrumb,
    GetRegisteredGraphExpansionService,
    GRAPH_RRF_HOP_PENALTY,
    GRAPH_RRF_K,
    RegisterGraphExpansionService,
    type GraphExpandedNode,
    type IGraphExpansionService,
} from '../../graph/GraphExpansion';

const viewNode: GraphExpandedNode = {
    NodeID: 'k-view',
    EntityName: 'MJ: Entity Alternate Base Views',
    RecordID: 'view-001',
    Title: 'Invoices.Open',
    NodeKind: 'View',
    SeedScore: 0.9,
    SeedRank: 2,
    SeedTitle: 'Open AR',
    PathEdges: [
        { FromNodeID: 'k-c', ToNodeID: 'k-mid', EdgeType: 'Narrower Than', Weight: 0.8 },
        { FromNodeID: 'k-mid', ToNodeID: 'k-view', EdgeType: 'Defined By', Weight: 0.5 },
    ],
};

describe('GraphExpansion', () => {
    beforeEach(() => RegisterGraphExpansionService(null));

    it('scores a node by hop-attenuated RRF: 1/(k + seedRank + 15*hops) * product(weights) * seedScore', () => {
        const expected = (1 / (GRAPH_RRF_K + 2 + GRAPH_RRF_HOP_PENALTY * 2)) * 0.9 * 0.8 * 0.5;
        expect(ComputeGraphRRFScore(viewNode)).toBeCloseTo(expected, 12);
        expect(ComputeGraphPathWeight(viewNode)).toBeCloseTo(0.36, 12);
    });

    it('ranks a one-hop node from the best seed above a two-hop node with stronger edges', () => {
        const near: GraphExpandedNode = { ...viewNode, SeedRank: 1, PathEdges: [{ FromNodeID: 'a', ToNodeID: 'b', EdgeType: 'Related To', Weight: 0.5 }] };
        const far: GraphExpandedNode = { ...viewNode, SeedRank: 1, PathEdges: [{ FromNodeID: 'a', ToNodeID: 'b', EdgeType: 'X', Weight: 0.6 }, { FromNodeID: 'b', ToNodeID: 'c', EdgeType: 'Y', Weight: 0.9 }] };
        expect(ComputeGraphRRFScore(near)).toBeGreaterThan(ComputeGraphRRFScore(far));
    });

    it('formats a provenance breadcrumb', () => {
        expect(FormatGraphNodeBreadcrumb(viewNode)).toBe('"Open AR" --[Narrower Than (0.80)]--> --[Defined By (0.50)]--> View "Invoices.Open"');
    });

    it('registers and clears the process-wide service, ignoring anything that is not one', () => {
        expect(GetRegisteredGraphExpansionService()).toBeNull();
        const service: IGraphExpansionService = { ResolveSeeds: async () => [], Expand: async () => ({ Nodes: [], Edges: [] }) };
        RegisterGraphExpansionService(service);
        expect(GetRegisteredGraphExpansionService()).toBe(service);
        RegisterGraphExpansionService(null);
        expect(GetRegisteredGraphExpansionService()).toBeNull();
    });
});
