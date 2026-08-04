/**
 * FKGraphWalker — Pattern 3 graph traversal.
 *
 * Given the foreign-key relationships of a database (hard declared + DBAutoDoc-
 * discovered soft FKs), build an undirected join graph and find all paths of
 * length ≤ maxHops from each "spoke" table to each "hub" table carrying an
 * organic key. A path of length 2-3 means the spoke can reach the hub through
 * intermediate tables — that's a transitive bridge candidate.
 *
 * Why a graph, not just FK chains:
 *   Many natural bridges traverse FKs in both directions. Example:
 *     Subscriber ←─ CampaignSend           (CampaignSend.SubscriberID → Subscriber.ID)
 *     Contact (hub) — Email column
 *   To reach CampaignSend from Contact via "email", the path goes:
 *     Contact.Email ↔ Subscriber.Email (organic key match)
 *     Subscriber.ID ← CampaignSend.SubscriberID (FK navigation, reverse direction)
 *
 *   The FK arrow points CampaignSend → Subscriber, but the bridge traversal
 *   goes Subscriber → CampaignSend. Modeling the graph as undirected handles
 *   this naturally; the edge metadata still tells us which side is the FK
 *   source vs target.
 *
 * Output: structural paths the BridgeViewSQLGenerator turns into CREATE VIEW
 * SQL conformant with PR #2193's TransitiveView contract.
 */

/** One foreign-key relationship between two tables. */
export interface FKEdge {
    sourceSchema: string;
    sourceTable: string;
    sourceColumn: string;
    targetSchema: string;
    targetTable: string;
    targetColumn: string;
    /** Hard (declared) vs soft (DBAutoDoc-detected). Affects ranking only. */
    kind: 'hard' | 'soft';
    /** Soft-FK confidence (0-1). Hard FKs are always 1. */
    confidence: number;
}

/** A discovered transitive path from spoke to hub. */
export interface BridgePath {
    /** The table reachable through the chain (the "spoke" in organic-key terms). */
    spokeSchema: string;
    spokeTable: string;
    /** The table carrying the organic key (the "hub"). */
    hubSchema: string;
    hubTable: string;
    /** Field name on the hub being projected (the organic-key match field). */
    hubKeyField: string;
    /**
     * Ordered list of join hops. hops[0].fromTable === spokeTable;
     * hops[last].toTable === hubTable. For a length-2 path:
     *   hops = [ { fromTable: spoke, toTable: intermediate, ... },
     *            { fromTable: intermediate, toTable: hub, ... } ]
     */
    hops: BridgeHop[];
    /** Total path length (number of FK joins). */
    pathLength: number;
    /**
     * Path confidence = product of edge confidences. Hard-only paths = 1.
     * Soft FKs on the path drag the confidence down (1 × 0.85 = 0.85).
     */
    pathConfidence: number;
}

/** One join hop in a bridge path. */
export interface BridgeHop {
    fromSchema: string;
    fromTable: string;
    fromColumn: string;
    toSchema: string;
    toTable: string;
    toColumn: string;
    /** Edge kind for ranking; same as FKEdge.kind. */
    kind: 'hard' | 'soft';
}

export interface FKGraphWalkerOptions {
    /** Maximum path length to explore. PR #2193 examples cap at 3. Default 3. */
    maxHops?: number;
    /**
     * Minimum confidence threshold for soft FKs to be included in the graph.
     * Hard FKs are always included. Default 0.6.
     */
    minSoftFKConfidence?: number;
    /**
     * When true, paths through the same table twice are pruned (no cycles).
     * Default true.
     */
    pruneCycles?: boolean;
}

const DEFAULTS: Required<FKGraphWalkerOptions> = {
    maxHops: 3,
    minSoftFKConfidence: 0.6,
    pruneCycles: true,
};

/**
 * Build the join graph and find all bridge paths from each spoke candidate to
 * each hub candidate.
 *
 * @param edges - all FK relationships in the database (hard + soft).
 * @param hubs  - tables that carry an organic key (output of Pattern 1/2). Each
 *                entry names the hub's match field — this becomes the projected
 *                column in the bridge view.
 * @param spokes - tables to attempt to reach from each hub. Typically every
 *                 table in the database except the hub itself.
 */
export function findBridgePaths(
    edges: FKEdge[],
    hubs: Array<{ schema: string; table: string; keyField: string }>,
    spokes: Array<{ schema: string; table: string }>,
    opts: FKGraphWalkerOptions = {},
): BridgePath[] {
    const o = { ...DEFAULTS, ...opts };

    // Build the adjacency map keyed by "schema.table".
    const adjacency = buildAdjacency(edges, o.minSoftFKConfidence);

    const out: BridgePath[] = [];
    for (const hub of hubs) {
        const hubKey = `${hub.schema}.${hub.table}`;
        for (const spoke of spokes) {
            const spokeKey = `${spoke.schema}.${spoke.table}`;
            if (spokeKey === hubKey) continue;
            // BFS from spoke → hub.
            const paths = bfsPaths(adjacency, spokeKey, hubKey, o.maxHops, o.pruneCycles);
            for (const p of paths) {
                if (p.length === 0) continue; // self
                if (p.length === 1) continue; // direct FK already handled by existing relationship system
                out.push(materializeBridgePath(p, hub, spoke));
            }
        }
    }
    // Sort: shortest paths first, then highest confidence.
    out.sort((a, b) => {
        if (a.pathLength !== b.pathLength) return a.pathLength - b.pathLength;
        return b.pathConfidence - a.pathConfidence;
    });
    return out;
}

// ─── Adjacency construction ─────────────────────────────────────────────────

/** Edge with the endpoints expressed as "schema.table" keys (undirected). */
interface AdjacencyEdge {
    fromKey: string;
    toKey: string;
    /** Original FK source side — for SQL generation we still need to know which side is the FK source. */
    fkSourceKey: string;
    fkSourceColumn: string;
    fkTargetColumn: string;
    kind: 'hard' | 'soft';
    confidence: number;
}

function buildAdjacency(edges: FKEdge[], minSoftFKConfidence: number): Map<string, AdjacencyEdge[]> {
    const out = new Map<string, AdjacencyEdge[]>();
    for (const e of edges) {
        if (e.kind === 'soft' && e.confidence < minSoftFKConfidence) continue;
        const aKey = `${e.sourceSchema}.${e.sourceTable}`;
        const bKey = `${e.targetSchema}.${e.targetTable}`;
        const forward: AdjacencyEdge = {
            fromKey: aKey,
            toKey: bKey,
            fkSourceKey: aKey,
            fkSourceColumn: e.sourceColumn,
            fkTargetColumn: e.targetColumn,
            kind: e.kind,
            confidence: e.confidence,
        };
        const reverse: AdjacencyEdge = {
            fromKey: bKey,
            toKey: aKey,
            fkSourceKey: aKey,
            fkSourceColumn: e.sourceColumn,
            fkTargetColumn: e.targetColumn,
            kind: e.kind,
            confidence: e.confidence,
        };
        push(out, aKey, forward);
        push(out, bKey, reverse);
    }
    return out;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}

// ─── BFS ────────────────────────────────────────────────────────────────────

/** Path of adjacency edges from `start` to `goal`. Returns empty if none found. */
function bfsPaths(
    adjacency: Map<string, AdjacencyEdge[]>,
    start: string,
    goal: string,
    maxHops: number,
    pruneCycles: boolean,
): AdjacencyEdge[][] {
    if (start === goal) return [[]];
    const queue: { node: string; pathEdges: AdjacencyEdge[]; visited: Set<string> }[] = [
        { node: start, pathEdges: [], visited: new Set([start]) },
    ];
    const found: AdjacencyEdge[][] = [];
    while (queue.length > 0) {
        const { node, pathEdges, visited } = queue.shift()!;
        if (pathEdges.length >= maxHops) continue;
        const neighbors = adjacency.get(node) ?? [];
        for (const edge of neighbors) {
            const nextNode = edge.toKey;
            if (pruneCycles && visited.has(nextNode)) continue;
            const newPath = [...pathEdges, edge];
            if (nextNode === goal) {
                found.push(newPath);
                continue; // don't extend past the goal
            }
            const nextVisited = new Set(visited);
            nextVisited.add(nextNode);
            queue.push({ node: nextNode, pathEdges: newPath, visited: nextVisited });
        }
    }
    return found;
}

// ─── Bridge path materialization ────────────────────────────────────────────

function materializeBridgePath(
    edgePath: AdjacencyEdge[],
    hub: { schema: string; table: string; keyField: string },
    spoke: { schema: string; table: string },
): BridgePath {
    const hops: BridgeHop[] = edgePath.map((e) => {
        const [fromSchema, fromTable] = e.fromKey.split('.');
        const [toSchema, toTable] = e.toKey.split('.');
        // The column on the "from" side is the FK-source column if from is the FK source;
        // otherwise it's the FK-target column.
        const fromIsFKSource = e.fromKey === e.fkSourceKey;
        return {
            fromSchema,
            fromTable,
            fromColumn: fromIsFKSource ? e.fkSourceColumn : e.fkTargetColumn,
            toSchema,
            toTable,
            toColumn: fromIsFKSource ? e.fkTargetColumn : e.fkSourceColumn,
            kind: e.kind,
        };
    });
    const pathConfidence = edgePath.reduce((acc, e) => acc * e.confidence, 1);
    return {
        spokeSchema: spoke.schema,
        spokeTable: spoke.table,
        hubSchema: hub.schema,
        hubTable: hub.table,
        hubKeyField: hub.keyField,
        hops,
        pathLength: edgePath.length,
        pathConfidence,
    };
}
