/**
 * @fileoverview One traversal core for both graph provenances.
 *
 * **The problem this solves.** Flow agents and task graphs are the same shape — nodes, conditional
 * edges, joins — reached from opposite directions. Flow arrived from a design-time editor; task
 * graphs arrived from an agent decomposing work at runtime. Until now each carried its own
 * traversal logic, and `FlowAgentType` did not even have *one* copy: the block "fetch outgoing
 * edges → take the highest-priority one → if its destination is inactive, scan the alternates" is
 * written out four separate times there (post-prompt, post-action, initial-step, and the skip
 * recursion). Those copies have already drifted — the skip recursion omits the inactive-destination
 * fallback the other three have, so a skipped node routes differently from a normal one for reasons
 * nobody chose.
 *
 * That is the argument for extraction, and it is not primarily about reuse. Two executors that
 * disagree about which edge to follow produce a workflow whose behavior depends on who is running
 * it, which is indefensible in a substrate meant to be invocation-agnostic (D1).
 *
 * **Dependency-free on purpose.** Like the eligibility/rollup algorithms it sits beside, this engine
 * touches no database, no entity objects and no agent framework. Graph storage arrives through a
 * synchronous {@link IGraphRepository}; condition evaluation through an injected evaluator. That is
 * what lets the in-run executor (`FlowAgentType`, state in memory) and the durable executor
 * (`TaskGraphDispatcher`, state in Task rows) share one definition of the rules while keeping
 * completely different state backends.
 *
 * **Synchronous by design.** The repository seam is sync because the data it serves is already in
 * memory — `AIEngine`'s step and path accessors are array filters over a preloaded cache, so every
 * `await` on the old traversal path was ceremony around a synchronous read. Dropping it makes the
 * engine trivially testable against plain-object fixtures and removes a class of interleaving bugs
 * that async traversal would otherwise invite.
 *
 * @module @memberjunction/ai-core-plus
 */

/** A node in a traversable graph, normalized away from whatever entity backs it. */
export type GraphNode = {
    id: string;
    name: string;
    /** Producer-specific discriminator (`'Action'`, `'Prompt'`, an agent name, …). Opaque here. */
    type?: string;
    /**
     * Whether this node may be entered. An inactive node is skipped in favor of a lower-priority
     * alternate rather than failing the graph — the design-time editor lets an author disable a step
     * without deleting it, and that has to stay non-fatal.
     */
    status?: 'Active' | 'Disabled' | 'Pending';
    /** Marks an entry point when the graph has no other way to say where to begin. */
    isStartNode?: boolean;
};

/** A directed, optionally-conditional edge. */
export type GraphEdge = {
    id: string;
    originNodeId: string;
    destinationNodeId: string;
    /**
     * Boolean expression gating this edge. `null`/empty means unconditional — which is also how a
     * fallback edge is expressed, since an unconditional edge is always satisfied and the priority
     * ordering decides whether anything outranks it.
     */
    condition?: string | null;
    /** Higher wins. Ties resolve by edge id, so ordering is total and stable. */
    priority?: number;
};

/**
 * Read-only access to graph structure.
 *
 * Synchronous, because every real implementation is serving an in-memory cache. An implementation
 * that genuinely needs I/O should preload rather than make this async — traversal decisions must be
 * cheap enough to make inside a tight loop.
 */
export type IGraphRepository = {
    GetNode(nodeId: string): GraphNode | null;
    GetOutgoingEdges(nodeId: string): GraphEdge[];
    GetIncomingEdges(nodeId: string): GraphEdge[];
    GetStartNodes(): GraphNode[];
};

/** Evaluates an edge condition. Injected so the engine stays free of any particular evaluator. */
export type IConditionEvaluator = {
    /** Returns the truthiness of `expression` under `context`, or an error the caller can report. */
    Evaluate(expression: string, context: Record<string, unknown>): { Success: boolean; Value?: unknown; ErrorMessage?: string };
};

/** Everything a condition can see. Producers add their own keys; the engine never inspects them. */
export type TraversalContext = Record<string, unknown>;

/** How a graph advances when several edges are satisfied at once. */
export type TraversalMode =
    /** Follow the single highest-priority satisfied edge. Back-compat default for design-time flows. */
    | 'sequential'
    /** Follow every satisfied edge. Always used for graphs built from a `TaskGraphSpec`. */
    | 'parallel';

/** How a node with several incoming edges decides it may run. */
export type JoinMode =
    /** Every satisfiable predecessor must have completed. The default, matching `Prerequisite`. */
    | 'all'
    /** Any one completed predecessor is enough. Matches an `Optional` dependency. */
    | 'any';

/** Mutable traversal state. Held in memory by the in-run executor, in Task rows by the durable one. */
export type TraversalState = {
    /** Nodes currently running. A set, not a scalar — that is the whole point of the frontier. */
    ActiveNodeIds: Set<string>;
    /** Nodes that finished, successfully or not. */
    CompletedNodeIds: Set<string>;
    /** Nodes that finished unsuccessfully, so failure-routing conditions can branch on them. */
    FailedNodeIds: Set<string>;
    /** Per-node result, keyed by node id so it is identity-addressed rather than positional. */
    NodeResults: Map<string, unknown>;
    /** Visit order, for diagnostics. Append-only, and unlike the original it records revisits. */
    ExecutionPath: string[];
};

/** A fresh traversal state. */
export function CreateTraversalState(): TraversalState {
    return {
        ActiveNodeIds: new Set<string>(),
        CompletedNodeIds: new Set<string>(),
        FailedNodeIds: new Set<string>(),
        NodeResults: new Map<string, unknown>(),
        ExecutionPath: [],
    };
}

/** Why an edge was not followed — surfaced so a silent drop is never the only explanation. */
export type EdgeRejection = {
    EdgeId: string;
    DestinationNodeId: string;
    Reason: 'ConditionFalse' | 'ConditionError' | 'DestinationMissing' | 'DestinationInactive';
    Detail?: string;
};

/** The outcome of evaluating one node's outgoing edges. */
export type EdgeSelection = {
    /** Edges whose condition held AND whose destination is enterable, highest priority first. */
    Edges: GraphEdge[];
    /** Every edge that was not followed, and why. */
    Rejected: EdgeRejection[];
};

/** Total, stable ordering: priority descending, then edge id so ties never depend on array order. */
function compareEdges(a: GraphEdge, b: GraphEdge): number {
    const byPriority = (b.priority ?? 0) - (a.priority ?? 0);
    return byPriority !== 0 ? byPriority : a.id.localeCompare(b.id);
}

/**
 * Evaluates a node's outgoing edges and reports which are followable.
 *
 * **Differences from the behavior this replaces, all deliberate:**
 *
 * - **Every satisfied edge is returned, not just the first.** The old code fetched the full list and
 *   then indexed `[0]`, silently discarding the rest — so a genuine fan-out node ran one branch and
 *   dropped the others with no diagnostic. Which of the returned edges actually get followed is now
 *   the caller's decision via {@link TraversalMode}, which is where that policy belongs.
 *
 * - **A missing destination and an inactive destination are treated alike.** Previously an inactive
 *   destination fell through to the next-priority alternate while a *missing* one failed the graph
 *   outright. Both are "this edge cannot be entered", and a dangling edge is a data problem that
 *   should not be more fatal than a deliberately disabled step. Both are now rejections with a
 *   reason, so a caller that finds no followable edge can say precisely why.
 *
 * - **A condition that throws is reported, not swallowed.** It still does not follow the edge — a
 *   broken expression must not become an accidental `true` — but it lands in `Rejected` with
 *   `ConditionError`, distinguishable from a condition that legitimately evaluated false. The old
 *   code logged and dropped, making "your expression is broken" and "your expression said no"
 *   indistinguishable at the call site.
 *
 * There is deliberately no "priority <= 0 fallback" rule. The original had one, but it was
 * unreachable: unconditional edges are already collected in the main pass, so the fallback filter
 * could only ever run when every edge had a condition — in which case it matched nothing. Fallbacks
 * work, and always did, by writing an unconditional edge at low priority.
 */
export function SelectOutgoingEdges(
    nodeId: string,
    repo: IGraphRepository,
    evaluator: IConditionEvaluator,
    context: TraversalContext,
): EdgeSelection {
    const edges = [...repo.GetOutgoingEdges(nodeId)].sort(compareEdges);
    const followable: GraphEdge[] = [];
    const rejected: EdgeRejection[] = [];

    for (const edge of edges) {
        const condition = edge.condition?.trim();
        if (condition) {
            const result = evaluator.Evaluate(condition, context);
            if (!result.Success) {
                rejected.push({
                    EdgeId: edge.id,
                    DestinationNodeId: edge.destinationNodeId,
                    Reason: 'ConditionError',
                    Detail: result.ErrorMessage,
                });
                continue;
            }
            if (!result.Value) {
                rejected.push({ EdgeId: edge.id, DestinationNodeId: edge.destinationNodeId, Reason: 'ConditionFalse' });
                continue;
            }
        }

        const destination = repo.GetNode(edge.destinationNodeId);
        if (!destination) {
            rejected.push({ EdgeId: edge.id, DestinationNodeId: edge.destinationNodeId, Reason: 'DestinationMissing' });
            continue;
        }
        if (destination.status && destination.status !== 'Active') {
            rejected.push({
                EdgeId: edge.id,
                DestinationNodeId: edge.destinationNodeId,
                Reason: 'DestinationInactive',
                Detail: destination.status,
            });
            continue;
        }

        followable.push(edge);
    }

    return { Edges: followable, Rejected: rejected };
}

/**
 * Decides whether a node's join is satisfied — i.e. whether it may start.
 *
 * A node with no incoming edges is always ready; that is what makes an entry point an entry point.
 *
 * **Unsatisfiable predecessors do not block forever.** Under `'all'`, a predecessor that failed, or
 * that can no longer be reached because every path to it was rejected, would otherwise hold the join
 * open for the life of the graph. `additionalSettledNodeIds` lets the caller declare those settled-
 * and-not-coming rather than pending. Without it the AND-join is a deadlock waiting for a branch
 * that was never taken — exactly the stall the durable executor exists to detect, and cheaper not
 * to create than to detect.
 */
export function IsJoinSatisfied(
    nodeId: string,
    repo: IGraphRepository,
    state: TraversalState,
    mode: JoinMode = 'all',
    additionalSettledNodeIds: ReadonlySet<string> = new Set<string>(),
): boolean {
    const incoming = repo.GetIncomingEdges(nodeId);
    if (incoming.length === 0) return true;

    const predecessorIds = [...new Set(incoming.map((e) => e.originNodeId))];
    const isSettled = (id: string) => state.CompletedNodeIds.has(id) || additionalSettledNodeIds.has(id);

    return mode === 'any'
        ? predecessorIds.some(isSettled)
        : predecessorIds.every(isSettled);
}

/**
 * Advances the frontier: given the node that just finished, returns the nodes to start next.
 *
 * `sequential` returns at most one successor — the old single-program-counter behavior, kept as the
 * default so existing design-time flows traverse exactly as they did. `parallel` returns every
 * successor whose join is satisfied, which is what graphs built from a `TaskGraphSpec` always use:
 * an agent that expressed independent work as independent nodes meant them to run at once, and
 * serializing them would discard the only information the decomposition carried.
 *
 * A successor whose join is *not* yet satisfied is simply not returned. It becomes eligible when its
 * remaining predecessors settle and this runs again for one of them — so the join is evaluated on
 * every completion rather than parked on a waiting list that could go stale.
 */
export function AdvanceFrontier(
    completedNodeId: string,
    repo: IGraphRepository,
    evaluator: IConditionEvaluator,
    state: TraversalState,
    context: TraversalContext,
    mode: TraversalMode = 'sequential',
    joinMode: JoinMode = 'all',
): { NextNodeIds: string[]; Selection: EdgeSelection } {
    const selection = SelectOutgoingEdges(completedNodeId, repo, evaluator, context);

    // Two things count as settled for the join check beyond what state already records.
    //
    // `completedNodeId` itself: this function's whole premise is that that node just finished, so
    // requiring the caller to have called MarkNodeCompleted FIRST would make correct use depend on
    // an invisible ordering rule — and getting it wrong stalls the graph silently rather than
    // failing loudly. Treating it as settled here makes the two orderings equivalent.
    //
    // Destinations of rejected edges: they cannot be reached VIA THIS NODE. That is not the same as
    // unreachable overall — another predecessor may still open a path — so it only relaxes the join
    // for nodes whose every OTHER predecessor has already settled.
    const settled = new Set(selection.Rejected.map((r) => r.DestinationNodeId));
    settled.add(completedNodeId);

    const candidates: string[] = [];
    for (const edge of selection.Edges) {
        const id = edge.destinationNodeId;
        if (candidates.includes(id)) continue; // parallel edges to the same node start it once
        if (!IsJoinSatisfied(id, repo, state, joinMode, settled)) continue;
        candidates.push(id);
        if (mode === 'sequential') break;
    }

    return { NextNodeIds: candidates, Selection: selection };
}

/** Records that a node started. */
export function MarkNodeStarted(state: TraversalState, nodeId: string): void {
    state.ActiveNodeIds.add(nodeId);
    // Unlike the original, revisits ARE appended. Deduping the path made a cycle indistinguishable
    // from a straight line, and made "the last entry" stop meaning "the most recent step" — which is
    // precisely what the old positional last-result lookup depended on.
    state.ExecutionPath.push(nodeId);
}

/** Records that a node finished, with its result and outcome. */
export function MarkNodeCompleted(state: TraversalState, nodeId: string, result: unknown, success = true): void {
    state.ActiveNodeIds.delete(nodeId);
    state.CompletedNodeIds.add(nodeId);
    if (!success) state.FailedNodeIds.add(nodeId);
    state.NodeResults.set(nodeId, result);
}

/**
 * The result of a specific node, addressed by id.
 *
 * Deliberately not "the last result". The behavior this replaces read the tail of the execution path
 * and called it `stepResult`, which silently returned a *different* node's result whenever the path
 * had been deduped — and would return an arbitrary one the moment two nodes ran at once.
 */
export function GetNodeResult(state: TraversalState, nodeId: string): unknown {
    return state.NodeResults.get(nodeId);
}

/** True once nothing is running and nothing more can start. */
export function IsTraversalSettled(state: TraversalState): boolean {
    return state.ActiveNodeIds.size === 0;
}
