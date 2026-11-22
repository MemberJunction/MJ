/** A node on a `Graph.FindPath` path. */
export interface GraphFindPathNode {
    /** Canonical node key. */
    Key: string;
    EntityName: string;
    RecordID: string;
    Label: string;
    Icon: string | null;
    Description: string | null;
}

/** An edge on a `Graph.FindPath` path, in its own direction (a hop may run against it). */
export interface GraphFindPathEdge {
    /** Stored edge ID, or `derived:<provider>:<type>:<sourceKey>:<targetKey>`. */
    ID: string;
    TypeName: string;
    SourceEntityName: string;
    SourceRecordID: string;
    TargetEntityName: string;
    TargetRecordID: string;
    IsDirected: boolean;
    Weight: number;
    Description: string | null;
    Origin: 'Derived' | 'Declared' | 'Inferred';
    Status: 'Proposed' | 'Approved' | 'Rejected';
}

/** A concept an ambiguous endpoint fits, for the caller to choose from. */
export interface GraphFindPathCandidate {
    Name: string;
    RecordID: string;
    Description: string | null;
    Score: number;
}

/**
 * Output of `Graph.FindPath`. `Status` says what kind of answer this is:
 * - `Found`: `Nodes` run from From to To, and `Edges[i]` joins `Nodes[i]` and `Nodes[i + 1]`.
 * - `NoPath`: the endpoints are not connected within the limits by anything the caller may see.
 *   A record the caller cannot see gives this same answer.
 * - `AmbiguousEndpoint`: `Endpoint` names the side and `Candidates` lists the concepts it fits.
 * - `EndpointNotFound`: `Endpoint` names the side whose concept could not be found or seen by the caller.
 * - `GraphNotFound`: the graph is unknown or not active.
 */
export interface GraphFindPathOutput {
    Status: 'Found' | 'NoPath' | 'AmbiguousEndpoint' | 'EndpointNotFound' | 'GraphNotFound';
    Nodes: GraphFindPathNode[];
    Edges: GraphFindPathEdge[];
    /** Product of the path's edge weights, decayed per hop (0 when none was found). */
    PathWeight: number;
    /** The path as compact Markdown, one line per hop. */
    PromptText: string;
    /** Which endpoint was ambiguous or not found, when that is the status. */
    Endpoint?: 'From' | 'To';
    Candidates: GraphFindPathCandidate[];
    Message?: string;
}
