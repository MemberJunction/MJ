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
    SourceSchema: string;
    SourceTable: string;
    SourceColumn: string;
    TargetSchema: string;
    TargetTable: string;
    TargetColumn: string;
    /** Hard (declared) vs soft (DBAutoDoc-detected). Affects ranking only. */
    Kind: 'hard' | 'soft';
    /** Soft-FK confidence (0-1). Hard FKs are always 1. */
    confidence: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

/** A discovered transitive path from spoke to hub. */
export interface BridgePath {
    /** The table reachable through the chain (the "spoke" in organic-key terms). */
    SpokeSchema: string;
    SpokeTable: string;
    /** The table carrying the organic key (the "hub"). */
    HubSchema: string;
    HubTable: string;
    /** Field name on the hub being projected (the organic-key match field). */
    HubKeyField: string;
    /**
     * Ordered list of join hops. hops[0].fromTable === spokeTable;
     * hops[last].toTable === hubTable. For a length-2 path:
     *   hops = [ { fromTable: spoke, toTable: intermediate, ... },
     *            { fromTable: intermediate, toTable: hub, ... } ]
     */
    Hops: BridgeHop[];
    /** Total path length (number of FK joins). */
    PathLength: number;
    /**
     * Path confidence = product of edge confidences. Hard-only paths = 1.
     * Soft FKs on the path drag the confidence down (1 × 0.85 = 0.85).
     */
    PathConfidence: number;
}

/** One join hop in a bridge path. */
export interface BridgeHop {
    fromSchema: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    fromTable: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    fromColumn: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    toSchema: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    toTable: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    toColumn: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Edge kind for ranking; same as FKEdge.kind. */
    kind: 'hard' | 'soft';  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export interface FKGraphWalkerOptions {
    /** Maximum path length to explore. PR #2193 examples cap at 3. Default 3. */
    MaxHops?: number;
    /**
     * Minimum confidence threshold for soft FKs to be included in the graph.
     * Hard FKs are always included. Default 0.6.
     */
    MinSoftFKConfidence?: number;
    /**
     * When true, paths through the same table twice are pruned (no cycles).
     * Default true.
     */
    PruneCycles?: boolean;
    /**
     * Hard ceiling on the number of BFS states held at once for a single
     * (spoke → hub) search. See {@link bfsPaths} for why an unbounded frontier
     * is not a theoretical concern.
     */
    MaxFrontier?: number;
    /** Hard ceiling on the paths retained per (spoke → hub) search. */
    MaxPathsPerPair?: number;
    /** Hard ceiling on the paths retained across the whole walk. */
    MaxTotalPaths?: number;
}

const DEFAULTS: Required<FKGraphWalkerOptions> = {
    MaxHops: 3,
    MinSoftFKConfidence: 0.6,
    PruneCycles: true,
    // THE NUMBERS ARE CEILINGS, NOT TUNING. They exist so that a graph nobody
    // anticipated cannot take the process down; a schema that hits one is a
    // schema whose bridge set was never going to be usable anyway, and the
    // truncation is reported rather than swallowed.
    MaxFrontier: 50_000,
    MaxPathsPerPair: 50,
    MaxTotalPaths: 25_000,
};

/** What a bounded walk found, and whether a bound stopped it finding more. */
export interface BridgePathWalkResult {
    Paths: BridgePath[];
    /** True when any cap (frontier, per-pair, or total) truncated the search. */
    Truncated: boolean;
    /** Which caps fired, for logging. Empty when the walk ran to completion. */
    TruncationReasons: Array<'frontier' | 'pathsPerPair' | 'totalPaths'>;
    /** (spoke, hub) pairs actually searched, after skipping pairs with no graph edge. */
    PairsSearched: number;
    /** (spoke, hub) pairs skipped because the spoke has no FK edge at all. */
    PairsSkipped: number;
}

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
export function FindBridgePaths(
    edges: FKEdge[],
    hubs: Array<{ schema: string; table: string; keyField: string }>,
    spokes: Array<{ schema: string; table: string }>,
    opts: FKGraphWalkerOptions = {},
): BridgePath[] {
    return WalkBridgePaths(edges, hubs, spokes, opts).Paths;
}

/**
 * The bounded walk. {@link FindBridgePaths} is the historical shape (paths only);
 * this one also reports whether a bound truncated the search, which is the
 * difference between "this schema has no bridges" and "we stopped looking".
 */
export function WalkBridgePaths(
    edges: FKEdge[],
    hubs: Array<{ schema: string; table: string; keyField: string }>,
    spokes: Array<{ schema: string; table: string }>,
    opts: FKGraphWalkerOptions = {},
): BridgePathWalkResult {
    // `{ ...DEFAULTS, ...opts }` would let an explicitly-undefined option UNSET a ceiling, which
    // is the one way a caller could accidentally un-bound the walk. Only defined keys override.
    const o: Required<FKGraphWalkerOptions> = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as Array<keyof FKGraphWalkerOptions>) {
        const supplied = opts[key];
        if (supplied !== undefined) {
            (o[key] as typeof supplied) = supplied;
        }
    }

    // Build the adjacency map keyed by "schema.table".
    const adjacency = buildAdjacency(edges, o.MinSoftFKConfidence);

    const reasons = new Set<'frontier' | 'pathsPerPair' | 'totalPaths'>();
    const out: BridgePath[] = [];
    let pairsSearched = 0;
    let pairsSkipped = 0;

    // GATE ON THE GRAPH, NOT ON THE INPUTS. An empty adjacency means no table is
    // joined to any other, so every BFS below would dequeue its start node, find
    // no neighbours and return nothing — `hubs × spokes` times.
    if (adjacency.size === 0) {
        return { Paths: [], Truncated: false, TruncationReasons: [], PairsSearched: 0, PairsSkipped: hubs.length * spokes.length };
    }

    outer:
    for (const hub of hubs) {
        const hubKey = `${hub.schema}.${hub.table}`;
        // A hub with no edge of its own is unreachable from every spoke.
        if (!adjacency.has(hubKey)) {
            pairsSkipped += spokes.length;
            continue;
        }
        for (const spoke of spokes) {
            const spokeKey = `${spoke.schema}.${spoke.table}`;
            if (spokeKey === hubKey) continue;
            // A spoke with no edge of its own cannot reach anything. Skipping it here is
            // what turns "one BFS per hub × EVERY TABLE IN THE DATABASE" back into one
            // BFS per hub × every table that is actually joined to something.
            if (!adjacency.has(spokeKey)) {
                pairsSkipped++;
                continue;
            }
            pairsSearched++;
            // BFS from spoke → hub.
            const search = bfsPaths(adjacency, spokeKey, hubKey, o.MaxHops, o.PruneCycles, o.MaxFrontier, o.MaxPathsPerPair);
            if (search.frontierTruncated) reasons.add('frontier');
            if (search.pathsTruncated) reasons.add('pathsPerPair');
            for (const p of search.paths) {
                if (p.length === 0) continue; // self
                if (p.length === 1) continue; // direct FK already handled by existing relationship system
                if (out.length >= o.MaxTotalPaths) {
                    reasons.add('totalPaths');
                    break outer;
                }
                out.push(materializeBridgePath(p, hub, spoke));
            }
        }
    }
    // Sort: shortest paths first, then highest confidence.
    out.sort((a, b) => {
        if (a.PathLength !== b.PathLength) return a.PathLength - b.PathLength;
        return b.PathConfidence - a.PathConfidence;
    });
    return {
        Paths: out,
        Truncated: reasons.size > 0,
        TruncationReasons: [...reasons],
        PairsSearched: pairsSearched,
        PairsSkipped: pairsSkipped,
    };
}

/** @deprecated Use {@link FindBridgePaths}. */
export function findBridgePaths(
    edges: FKEdge[],
    hubs: Array<{ schema: string; table: string; keyField: string }>,
    spokes: Array<{ schema: string; table: string }>,
    opts: FKGraphWalkerOptions = {},
): BridgePath[] {
    return FindBridgePaths(edges, hubs, spokes, opts);
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
        if (e.Kind === 'soft' && e.confidence < minSoftFKConfidence) continue;
        const aKey = `${e.SourceSchema}.${e.SourceTable}`;
        const bKey = `${e.TargetSchema}.${e.TargetTable}`;
        const forward: AdjacencyEdge = {
            fromKey: aKey,
            toKey: bKey,
            fkSourceKey: aKey,
            fkSourceColumn: e.SourceColumn,
            fkTargetColumn: e.TargetColumn,
            kind: e.Kind,
            confidence: e.confidence,
        };
        const reverse: AdjacencyEdge = {
            fromKey: bKey,
            toKey: aKey,
            fkSourceKey: aKey,
            fkSourceColumn: e.SourceColumn,
            fkTargetColumn: e.TargetColumn,
            kind: e.Kind,
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

/** One bounded BFS: the paths found, and whether a bound stopped the search early. */
interface BFSResult {
    paths: AdjacencyEdge[][];
    /** The frontier hit `maxFrontier`, so some states were never expanded. */
    frontierTruncated: boolean;
    /** `maxPaths` paths were found, so the search stopped looking for more. */
    pathsTruncated: boolean;
}

/**
 * Path of adjacency edges from `start` to `goal`, bounded in both frontier size and
 * result count. Returns empty paths if none found.
 *
 * WHY THE BOUNDS AND THE CURSOR ARE NOT MICRO-OPTIMISATION. Three properties compounded
 * into an out-of-memory kill on a large schema before the phase could emit anything:
 *
 *  1. Every enqueued state carried a FRESH `Set<string>` and a FRESH path array, allocated
 *     per neighbour per dequeued node. On a dense graph with `maxHops` 3 that is
 *     O(branching³) live Sets, each holding up to `maxHops + 1` strings.
 *  2. The queue was drained with `Array.shift()`, which is O(n) on a large array, so
 *     draining it was quadratic on top of the allocation.
 *  3. Nothing bounded either the queue or the result array.
 *
 * The cursor fixes (2) outright. The caps fix (1) and (3) by refusing to grow past a
 * ceiling and SAYING SO, rather than by silently returning a partial answer. The visited
 * Set is still copied per state — a path-specific visited set is what `pruneCycles` means,
 * and a shared one would wrongly prune valid alternate paths — but it can no longer be
 * copied an unbounded number of times.
 */
function bfsPaths(
    adjacency: Map<string, AdjacencyEdge[]>,
    start: string,
    goal: string,
    maxHops: number,
    pruneCycles: boolean,
    maxFrontier: number,
    maxPaths: number,
): BFSResult {
    if (start === goal) return { paths: [[]], frontierTruncated: false, pathsTruncated: false };
    const queue: ({ node: string; pathEdges: AdjacencyEdge[]; visited: Set<string> } | undefined)[] = [
        { node: start, pathEdges: [], visited: new Set([start]) },
    ];
    // Index cursor instead of Array.shift(): shift() is O(n) on a large array, which made
    // draining the queue quadratic in the number of enqueued states.
    let head = 0;
    const found: AdjacencyEdge[][] = [];
    let frontierTruncated = false;
    let pathsTruncated = false;
    while (head < queue.length) {
        const { node, pathEdges, visited } = queue[head]!;
        // Release the slot as we pass it. An index cursor alone keeps every state ever enqueued
        // reachable from the array — including its visited Set — which would trade Array.shift()'s
        // O(n) drain for a retained-memory leak over a long walk. Nulling gives O(1) dequeue AND
        // lets the frontier bound below actually bound live memory.
        queue[head] = undefined as unknown as (typeof queue)[number];
        head++;
        if (pathEdges.length >= maxHops) continue;
        const neighbors = adjacency.get(node) ?? [];
        for (const edge of neighbors) {
            const nextNode = edge.toKey;
            if (pruneCycles && visited.has(nextNode)) continue;
            const newPath = [...pathEdges, edge];
            if (nextNode === goal) {
                if (found.length >= maxPaths) {
                    pathsTruncated = true;
                    break;
                }
                found.push(newPath);
                continue; // don't extend past the goal
            }
            // The live frontier is what is enqueued but not yet expanded. Bounding THAT
            // rather than total enqueues keeps a long, narrow walk working while still
            // refusing to hold an unbounded number of visited-set copies at once.
            if (queue.length - head >= maxFrontier) {
                frontierTruncated = true;
                break;
            }
            const nextVisited = new Set(visited);
            nextVisited.add(nextNode);
            queue.push({ node: nextNode, pathEdges: newPath, visited: nextVisited });
        }
        if (pathsTruncated) break;
    }
    return { paths: found, frontierTruncated, pathsTruncated };
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
        SpokeSchema: spoke.schema,
        SpokeTable: spoke.table,
        HubSchema: hub.schema,
        HubTable: hub.table,
        HubKeyField: hub.keyField,
        Hops: hops,
        PathLength: edgePath.length,
        PathConfidence: pathConfidence,
    };
}
