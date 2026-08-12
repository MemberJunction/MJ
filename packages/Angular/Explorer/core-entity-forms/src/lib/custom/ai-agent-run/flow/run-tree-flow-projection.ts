/**
 * @fileoverview Projects a run tree into the `FlowModel` the three visualizations render.
 *
 * **Why this exists.** Flame Cascade, Subway Lines and Constellation all read one `FlowModel`, and
 * that model was built from raw `AIAgentRunStep` rows — which means none of them could show
 * task-graph work at all. A workflow's steps live in `MJ: Tasks`, not in the run's step list, so the
 * most interesting thing a run did was invisible in every visual view of it.
 *
 * One projection fixes all three, because they share the model. That is the whole reason to do it
 * here rather than teaching each renderer about tasks.
 *
 * **The normalization is deliberately NOT re-implemented.** Durations, the [0..1] playback window,
 * cumulative wall-clock and heat tiers all come from the same helpers the step-based builder uses,
 * so a graph node and a step node are laid out and coloured by identical rules. Re-deriving them
 * here is how the two sources would drift into looking like different products.
 */
import type { AgentRunTreeNode, AgentRunTreeNodeType } from '@memberjunction/ai-core-plus';
import { FlowNode, FlowModel, RootIcon, finalizeFlowModel } from './agent-run-flow.model';

/**
 * How a tree node's kind maps to the visual vocabulary.
 *
 * Keyed on `SourceKind` — the node's kind in its OWN vocabulary — with the node type as the
 * fallback. A run step says 'Actions'; a task says 'Action'. Both are an action to look at, and
 * flattening that difference at the source would have lost the design-time/executable distinction
 * everywhere else.
 */
const KIND_TO_FLOW_TYPE: Record<string, FlowNode['type']> = {
    // Run-step vocabulary
    Actions: 'action',
    Prompt: 'prompt',
    'Sub-Agent': 'subagent',
    Validation: 'validation',
    Decision: 'decision',
    Chat: 'prompt',
    Plan: 'decision',
    Skill: 'action',
    Tool: 'action',
    Compaction: 'other',
    TaskGraph: 'loop',
    // Task vocabulary
    Action: 'action',
    Agent: 'subagent',
    ForEach: 'loop',
    While: 'loop',
    Human: 'decision',
    External: 'other',
};

/** The visual type for a node, preferring its declared kind over its structural role. */
function flowTypeOf(node: AgentRunTreeNode): FlowNode['type'] {
    const byKind = node.SourceKind ? KIND_TO_FLOW_TYPE[node.SourceKind] : undefined;
    if (byKind) return byKind;

    const byType: Record<AgentRunTreeNodeType, FlowNode['type']> = {
        Run: 'subagent',
        Step: 'other',
        TaskGraph: 'loop',
        Task: 'other',
    };
    return byType[node.NodeType] ?? 'other';
}

/** Font Awesome icon per visual type — the same vocabulary the step-based builder uses. */
const ICON_BY_TYPE: Record<FlowNode['type'], string> = {
    agent: 'fa-robot',
    subagent: 'fa-robot',
    prompt: 'fa-brain',
    action: 'fa-gear',
    decision: 'fa-code-branch',
    loop: 'fa-repeat',
    validation: 'fa-circle-check',
    other: 'fa-circle',
};

/**
 * Builds the flow model from a run tree.
 *
 * @param root     the tree, as loaded once by the run form and shared with every tab
 * @param rootName what to call the run itself
 * @param rootStatus the run's status
 * @param rootIcon the agent's icon/logo, which only the form knows
 */
export function buildFlowModelFromTree(
    root: AgentRunTreeNode | null,
    rootName: string,
    rootStatus: string,
    rootIcon: RootIcon,
): FlowModel | null {
    if (!root) return null;

    const rootNode: FlowNode = {
        id: -1,
        name: rootName || root.Name || 'Agent run',
        type: 'agent',
        status: rootStatus || root.Status,
        model: null,
        realDur: durationSeconds(root),
        t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 0, depth: 0, heat: 0,
        parent: null,
        children: [],
        raw: null,
        source: { entity: root.SourceEntity, id: root.SourceID },
        iconClass: rootIcon.iconClass || 'fa-robot',
        logoUrl: rootIcon.logoUrl,
    };

    for (const child of root.Children) attach(rootNode, child);

    return finalizeFlowModel(rootNode);
}

/** Adds one tree node (and its descendants) under a flow node. */
function attach(parent: FlowNode, node: AgentRunTreeNode): void {
    const type = flowTypeOf(node);
    const flow: FlowNode = {
        id: 0,                       // assigned during flatten
        name: node.Name,
        type,
        status: node.Status,
        model: null,
        realDur: durationSeconds(node),
        t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 0, depth: parent.depth + 1, heat: 0,
        parent,
        children: [],
        raw: null,
        // Every node keeps a pointer to the row it came from, so a click can open the right record
        // whichever entity it lives in. `raw` stays null for task nodes because it is typed to a
        // run STEP — the reason this generic reference exists.
        source: { entity: node.SourceEntity, id: node.SourceID },
        iconClass: ICON_BY_TYPE[type],
        logoUrl: null,
    };
    parent.children.push(flow);
    for (const child of node.Children) attach(flow, child);
}

/**
 * A node's own duration, in seconds.
 *
 * Zero for anything unfinished. The normalization sums children into containers afterwards, so a
 * node that is still running contributes nothing rather than an arbitrary elapsed-so-far that would
 * make an in-flight run look longer than a settled one.
 */
function durationSeconds(node: AgentRunTreeNode): number {
    return node.DurationMs != null ? node.DurationMs / 1000 : 0;
}
