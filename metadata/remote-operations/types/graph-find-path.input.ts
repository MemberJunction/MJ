/**
 * One end of a `Graph.FindPath` request: a record (`EntityName` + `RecordID`), or a concept
 * (`Concept` = its name, a synonym, or its ID). A record reference wins when both are given.
 */
export interface GraphFindPathEndpoint {
    /** Registered entity name of the record, e.g. "MJ: Queries" or "Invoices". */
    EntityName?: string;
    /** The record's key, in compact URL-segment form (the bare value for a single-column key). */
    RecordID?: string;
    /** A concept's name, synonym or ID in the graph. */
    Concept?: string;
}

/** Input for `Graph.FindPath`. */
export interface GraphFindPathInput {
    /** Name or ID of an active graph. Default: "MJ Canon". */
    GraphName?: string;
    /** Start of the path. */
    From: GraphFindPathEndpoint;
    /** End of the path. */
    To: GraphFindPathEndpoint;
    /** Maximum hops, 1 to 4. Default: 4. */
    Depth?: number;
    /** Maximum nodes the search may visit, 1 to 200. Default: 200. */
    MaxNodes?: number;
    /** Optional allow-list of edge type names to follow. */
    EdgeTypes?: string[];
    /** Optional minimum edge weight to follow, 0 to 1. */
    MinWeight?: number;
    /** When true, also follow edges and match concepts still awaiting review. Default: false. */
    IncludeProposed?: boolean;
}
