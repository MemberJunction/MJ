/**
 * @fileoverview One shape for "what happened in this run", however deeply it nests.
 *
 * **The problem this solves.** A run used to be a tree of steps, and the UI read it as one. It is
 * now a tree that changes *kind* as it descends: a run owns steps, a step can be a task graph, a
 * graph owns tasks, a task can start another agent run, and that run owns steps of its own — which
 * can contain another task graph. Every consumer that wants the whole story has been reimplementing
 * that traversal, lazily, one level at a time, with its own idea of ordering and its own N+1.
 *
 * So there is one node shape and one loader, and three very different consumers use it:
 *
 * - the run **timeline**, which renders it as an indented list;
 * - the run **visualizations**, which render the same tree as lines or a constellation;
 * - **tests and evaluation**, which assert on it — "the third node is a ForEach that ran five times,
 *   and its branch sibling was Skipped" — instead of hand-joining four tables per assertion.
 *
 * That last one is not a nice-to-have. A structure only the UI can read is a structure nothing can
 * check, and this whole area has been shipping bugs whose signature is *a run that looks fine*.
 *
 * **Why the loader is a query, not a walk.** Walking the tree client-side costs one round trip per
 * level per branch, which is what makes the current timeline show "Loading sub-agent steps…" every
 * time someone expands a node. A single recursive query returns the whole tree, and because
 * `RunQuery` works identically on the server and across the wire, the same loader serves MJAPI, the
 * browser, and a test process.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * What a node in a run tree actually is.
 *
 * The union is closed on purpose: adding a kind should be a compile error everywhere that switches
 * on it, because a renderer that silently falls through to a default draws the wrong icon and links
 * to the wrong record — which looks plausible and is wrong.
 */
export type AgentRunTreeNodeType =
    /** The run being loaded, or a sub-agent run nested under a step. */
    | 'Run'
    /** An `AIAgentRunStep` — a prompt, an action, a validation, a plan. */
    | 'Step'
    /** A step that submitted a task graph. Its children are the graph's tasks. */
    | 'TaskGraph'
    /** One `Task` inside a graph. May itself own a run, if it dispatched an agent. */
    | 'Task';

/** Terminal-ish status, normalized across the entities so a renderer branches once. */
export type AgentRunTreeStatus =
    | 'Pending'
    | 'Running'
    | 'Complete'
    | 'Failed'
    | 'Skipped'
    | 'Blocked'
    | 'Cancelled'
    | 'Waiting';

/**
 * One node, flat — exactly as the query returns it.
 *
 * Deliberately flat rather than nested at the wire: a recursive query that denormalized the whole
 * path into each row would multiply rows by the product of every level's fan-out, and a run with
 * fifty steps and a twenty-task graph would return thousands of rows carrying almost no new
 * information. One row per node keeps the payload linear in the size of the thing being described.
 * {@link BuildAgentRunTree} assembles it.
 */
export type AgentRunTreeRow = {
    /** Stable within one tree. Not an entity ID — a Task and a Run can never collide here. */
    NodeID: string;
    /** Null for the root. */
    ParentNodeID: string | null;
    /** Distance from the root. The query caps this; see `MAX_AGENT_RUN_TREE_DEPTH`. */
    Depth: number;
    /** Ordering among siblings, so the tree renders in the order things actually happened. */
    Sequence: number;

    NodeType: AgentRunTreeNodeType;
    Name: string;
    Status: AgentRunTreeStatus;

    StartedAt: Date | null;
    CompletedAt: Date | null;
    DurationMs: number | null;

    /** What this node itself spent. Null where the concept does not apply, e.g. a Task. */
    Cost: number | null;
    Tokens: number | null;
    /**
     * The prompt/completion split of {@link Tokens}, on the same per-node own-spend basis.
     *
     * Present because the settlement-time rollup writes four columns on `AIAgentRun`. A tree that
     * answered only cost and total tokens would leave the other two to a second computation on a
     * different basis — and two numbers describing one run that were derived differently is the
     * defect this tree exists to remove, not a detail to leave to callers.
     */
    PromptTokens: number | null;
    CompletionTokens: number | null;

    /**
     * A workflow task's payloads, before and after.
     *
     * Present so a graph step can be presented the way an agent run STEP is: the shared detail panel
     * shows a before/after diff, and without these it has nothing to compare and falls back to a raw
     * dump — which is exactly the difference between a workflow step and an agent step that a reader
     * notices first. Null for every node that is not a task.
     */
    InputPayload: string | null;
    OutputPayload: string | null;

    /**
     * Where to go when someone clicks it — the entity name and record id.
     *
     * Carried rather than derived, because the mapping from node type to entity is not one-to-one:
     * a `Step` opens a prompt run, an action log or an agent run depending on what kind of step it
     * is, and re-deriving that in every consumer is how two of them end up disagreeing.
     */
    SourceEntity: string;
    /**
     * What KIND of work this node is, in its own vocabulary — a run step's `StepType`
     * ('Prompt', 'Actions', 'Sub-Agent', 'Validation', …) or a task's ('Agent', 'Action',
     * 'ForEach', 'While', 'Human', …). Null for a Run node, whose kind is simply "a run".
     *
     * Carried because every visual consumer colours and icons by kind. Without it a renderer can
     * only draw undifferentiated boxes, which is precisely what kept the run visualizations reading
     * raw step rows instead of this tree.
     */
    SourceKind: string | null;
    SourceID: string;
};

/** A node with its children resolved. What consumers actually work with. */
export type AgentRunTreeNode = AgentRunTreeRow & {
    Children: AgentRunTreeNode[];
};

/**
 * How deep the loader will go.
 *
 * Nesting is genuinely unbounded in principle — an agent dispatches a graph, a task in it starts an
 * agent, that agent dispatches a graph — so the query needs a stop. This is a **safety valve, not a
 * budget**: a recursive query costs what its rows cost, so a high ceiling is free until a tree
 * actually gets deep, and then the rows are the ones you wanted. It exists so that corrupt data
 * (a run that is somehow its own ancestor) truncates instead of running forever.
 *
 * Set high deliberately. A number chosen to feel "reasonable" is the one that bites: agent → graph →
 * agent → graph reaches fifteen in four business-level hops. At a hundred, hitting it is evidence of
 * something wrong rather than of a big workflow — which is why {@link IsAgentRunTreeTruncated}
 * exists and why callers are expected to make noise about it.
 *
 * Expressed as a predicate on `Depth` inside the recursive term rather than a T-SQL `MAXRECURSION`
 * hint, so the same SQL converts mechanically to PostgreSQL, which has no such hint.
 */
export const MAX_AGENT_RUN_TREE_DEPTH = 100;

/**
 * True when the tree came back truncated at the depth cap.
 *
 * Worth surfacing rather than inferring: a truncated tree looks like a complete one, so a viewer
 * would believe a run ended where the query stopped reading. Callers should log this loudly AND
 * record it durably — a depth this large means either a genuinely pathological workflow or corrupt
 * ancestry, and both are things someone needs to see after the fact rather than in a log nobody
 * tailed.
 */
export function IsAgentRunTreeTruncated(rows: readonly AgentRunTreeRow[]): boolean {
    return rows.some((r) => r.Depth >= MAX_AGENT_RUN_TREE_DEPTH);
}

/**
 * Assembles flat rows into a tree.
 *
 * **Orphans are attached to the root, not dropped.** A node whose parent is missing — because the
 * depth cap truncated it, or because a row was filtered by permissions — still represents work that
 * happened. Dropping it would silently shrink the run; surfacing it at the top is visibly odd, which
 * is the correct amount of alarming.
 *
 * Sorting is by `Sequence` then `NodeID`, so a tie cannot render differently between two loads.
 */
export function BuildAgentRunTree(rows: readonly AgentRunTreeRow[]): AgentRunTreeNode | null {
    if (rows.length === 0) return null;

    const byID = new Map<string, AgentRunTreeNode>();
    for (const row of rows) byID.set(row.NodeID, { ...row, Children: [] });

    let root: AgentRunTreeNode | null = null;
    const orphans: AgentRunTreeNode[] = [];

    for (const node of byID.values()) {
        if (node.ParentNodeID === null) {
            // A second root would mean the query returned two trees. Keep the shallowest as the
            // root and treat the rest as orphans rather than silently discarding one.
            if (root === null || node.Depth < root.Depth) {
                if (root) orphans.push(root);
                root = node;
            } else {
                orphans.push(node);
            }
            continue;
        }
        const parent = byID.get(node.ParentNodeID);
        if (parent) parent.Children.push(node);
        else orphans.push(node);
    }

    if (!root) return null;
    for (const orphan of orphans) if (orphan !== root) root.Children.push(orphan);

    for (const node of byID.values()) {
        node.Children.sort((a, b) => a.Sequence - b.Sequence || a.NodeID.localeCompare(b.NodeID));
    }
    return root;
}

/** Depth-first walk in render order. The basis of every traversal below. */
export function* WalkAgentRunTree(node: AgentRunTreeNode): Generator<AgentRunTreeNode> {
    yield node;
    for (const child of node.Children) yield* WalkAgentRunTree(child);
}

/** Every node of a given kind, in render order — the workhorse for tests and summaries. */
export function FindAgentRunTreeNodes(
    root: AgentRunTreeNode,
    predicate: (node: AgentRunTreeNode) => boolean,
): AgentRunTreeNode[] {
    return [...WalkAgentRunTree(root)].filter(predicate);
}

/** What a run cost in total, including every nested run and dispatched graph. */
export type AgentRunTreeTotals = {
    Cost: number;
    Tokens: number;
    PromptTokens: number;
    CompletionTokens: number;
};

/**
 * What a run cost in total, including every nested run and dispatched graph.
 *
 * A plain SUM is correct **only because every node reports its OWN spend** — see the header of
 * `get-agent-run-tree.sql`. If a node ever carried a rollup, this would double-count each nested
 * run once per level of nesting.
 */
export function SumAgentRunTreeCost(root: AgentRunTreeNode): AgentRunTreeTotals {
    const totals: AgentRunTreeTotals = { Cost: 0, Tokens: 0, PromptTokens: 0, CompletionTokens: 0 };
    for (const node of WalkAgentRunTree(root)) {
        totals.Cost += node.Cost ?? 0;
        totals.Tokens += node.Tokens ?? 0;
        totals.PromptTokens += node.PromptTokens ?? 0;
        totals.CompletionTokens += node.CompletionTokens ?? 0;
    }
    return totals;
}

/**
 * A one-line summary per node, indented — for a test failure message or a log.
 *
 * Exists because the alternative, when an assertion fails, is a reader staring at a nested object
 * dump trying to work out which of forty nodes was wrong.
 */
export function FormatAgentRunTree(root: AgentRunTreeNode): string {
    const lines: string[] = [];
    const write = (node: AgentRunTreeNode, indent: string): void => {
        const duration = node.DurationMs != null ? ` ${node.DurationMs}ms` : '';
        lines.push(`${indent}[${node.NodeType}] ${node.Name} — ${node.Status}${duration}`);
        for (const child of node.Children) write(child, indent + '  ');
    };
    write(root, '');
    return lines.join('\n');
}
