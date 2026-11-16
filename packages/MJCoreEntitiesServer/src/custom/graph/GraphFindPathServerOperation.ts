import { BaseRemotableOperation } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CanonGraphEngine, GraphEngine, GraphFindPathOperation } from '@memberjunction/core-entities';
import type {
    GraphEdgeView,
    GraphFindPathEdge,
    GraphFindPathEndpoint,
    GraphFindPathInput,
    GraphFindPathNode,
    GraphFindPathOutput,
    GraphNodeView,
    GraphPathRequestResult,
    GraphTraversalOptions,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

const DEFAULT_GRAPH_NAME = 'MJ Canon';

/**
 * Server implementation of the `Graph.FindPath` remote operation: the fewest-hop path between two
 * nodes of a semantic graph that the caller may see, through `CanonGraphEngine.FindPathBetween`
 * (the same code the `Find Graph Path` action runs).
 *
 * No `Authorize` override: the operation is read-only, and every node is checked as the caller
 * during the search, so a caller gets only what they could already read. A record the caller cannot
 * see gives the same `NoPath` answer as an unconnected one.
 */
@RegisterClass(BaseRemotableOperation, 'Graph.FindPath')
export class GraphFindPathServerOperation extends GraphFindPathOperation {
    protected async InternalExecute(input: GraphFindPathInput, provider: IMetadataProvider, user: UserInfo): Promise<GraphFindPathOutput> {
        if (!HasEndpoint(input?.From) || !HasEndpoint(input?.To)) {
            throw new Error('From and To are required: each is { EntityName, RecordID } or { Concept }.');
        }
        const graphName = input.GraphName?.trim() || DEFAULT_GRAPH_NAME;
        const result = await CanonGraphEngine.Instance.FindPathBetween(graphName, input.From, input.To, TraversalOptionsOf(input), user, provider);
        return FindPathOutputOf(result, provider);
    }
}

/** True when the endpoint names a record or a concept. */
export function HasEndpoint(endpoint: GraphFindPathEndpoint | undefined): boolean {
    if (!endpoint) {
        return false;
    }
    const hasRecord = !!endpoint.EntityName?.trim() && !!endpoint.RecordID?.trim();
    return hasRecord || !!endpoint.Concept?.trim();
}

/** Traversal options for an operation input; the engine clamps depth and node limits. */
export function TraversalOptionsOf(input: GraphFindPathInput): GraphTraversalOptions {
    return {
        Direction: 'Both',
        Depth: input.Depth,
        MaxNodes: input.MaxNodes,
        EdgeTypes: input.EdgeTypes && input.EdgeTypes.length > 0 ? input.EdgeTypes : undefined,
        MinWeight: input.MinWeight != null && Number.isFinite(input.MinWeight) ? Math.max(0, Math.min(1, input.MinWeight)) : undefined,
        IncludeProposed: input.IncludeProposed === true,
    };
}

/** The wire form of an engine path result. */
export function FindPathOutputOf(result: GraphPathRequestResult, provider?: IMetadataProvider): GraphFindPathOutput {
    return {
        Status: result.Status,
        Nodes: result.Path.Nodes.map(nodeOf),
        Edges: result.Path.Edges.map(edgeOf),
        PathWeight: result.Path.PathWeight,
        PromptText: result.Status === 'Found' || result.Status === 'NoPath' ? GraphEngine.Instance.DescribePathForPrompt(result.Path, provider) : '',
        Endpoint: result.Endpoint,
        Candidates: result.Candidates.map((c) => ({ Name: c.Node.Label, RecordID: c.Node.RecordID, Description: c.Node.Description, Score: c.Score })),
        Message: result.Path.Message,
    };
}

function nodeOf(node: GraphNodeView): GraphFindPathNode {
    return { Key: node.Key, EntityName: node.EntityName, RecordID: node.RecordID, Label: node.Label, Icon: node.Icon, Description: node.Description };
}

function edgeOf(edge: GraphEdgeView): GraphFindPathEdge {
    return {
        ID: edge.ID,
        TypeName: edge.TypeName,
        SourceEntityName: edge.Source.EntityName,
        SourceRecordID: edge.Source.RecordID,
        TargetEntityName: edge.Target.EntityName,
        TargetRecordID: edge.Target.RecordID,
        IsDirected: edge.IsDirected,
        Weight: edge.Weight,
        Description: edge.Description,
        Origin: edge.Origin,
        Status: edge.Status,
    };
}

/** Tree-shaking anchor — referenced so bundlers retain the `@RegisterClass` registration. */
export function LoadGraphFindPathServerOperation(): void {
    // intentionally empty
}
