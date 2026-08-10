/**
 * @fileoverview Projects a run tree into timeline rows.
 *
 * **Why this exists.** A task-graph step used to expand into an embedded canvas — a diagram nested
 * inside a vertical list. That put two different visual languages in one column and made the graph's
 * steps the only work in a run you could not read the same way as everything else. The graph's tasks
 * are steps; they should look like steps, sit at their real depth, and be selectable like any other
 * row. The canvas is still the right way to see *edges*, so it moves to the detail panel where it
 * has room, rather than being squeezed into a 300px strip inside the list.
 *
 * **Why a pure function.** The bug this replaces was an ordering bug — a child's indent was computed
 * from its parent's indent *at the moment the child was visited*, so a row that arrived before its
 * parent got the wrong level and every descendant inherited the error. It only reproduced when the
 * database returned rows in a particular order, which is exactly the kind of defect that is
 * impossible to catch by looking at a screen and trivial to catch in a test. Depth here comes from
 * the tree's own structure and cannot depend on visit order.
 */
import type { AgentRunTreeNode, AgentRunTreeNodeType } from '@memberjunction/ai-core-plus';
import type { TimelineItem } from './ai-agent-run-timeline.component';

/**
 * How each kind of node presents itself.
 *
 * Task-graph work is **colour-coded** so its provenance is visible at a glance: a row that ran on
 * the dispatcher, outliving the agent run that submitted it, is a genuinely different thing from a
 * step the run executed itself, and someone reading a failure needs to know which they are looking
 * at before they know where to go next.
 */
const NODE_PRESENTATION: Record<AgentRunTreeNodeType, { icon: string; color: string }> = {
    Run: { icon: 'fa-solid fa-robot', color: 'var(--mj-color-primary)' },
    Step: { icon: 'fa-solid fa-circle-nodes', color: 'var(--mj-text-secondary)' },
    TaskGraph: { icon: 'fa-solid fa-diagram-project', color: 'var(--mj-color-info)' },
    Task: { icon: 'fa-solid fa-diagram-next', color: 'var(--mj-color-info)' },
};

/**
 * How a task presents itself, by what it actually DOES.
 *
 * `NODE_PRESENTATION` is keyed by node TYPE, so every task in a workflow resolved to the same
 * generic diagram glyph — a prompt step, a loop and an approval were visually identical, and the row
 * `type` that says otherwise was painted over by the explicit icon. Mapping the row type onto the
 * timeline's vocabulary is only half the job; a reader distinguishes rows by their icon long before
 * reading the subtitle.
 *
 * Colour still says "workflow" via `provenance`, so these icons differentiate KIND without costing
 * the visual grouping that tells you this work ran on the dispatcher.
 */
const TASK_KIND_PRESENTATION: Record<string, { icon: string; color: string }> = {
    Action: { icon: 'fa-solid fa-bolt', color: 'var(--mj-color-info)' },
    Prompt: { icon: 'fa-solid fa-comment-dots', color: 'var(--mj-color-info)' },
    Agent: { icon: 'fa-solid fa-robot', color: 'var(--mj-color-info)' },
    ForEach: { icon: 'fa-solid fa-repeat', color: 'var(--mj-color-info)' },
    While: { icon: 'fa-solid fa-rotate', color: 'var(--mj-color-info)' },
    Human: { icon: 'fa-solid fa-user-check', color: 'var(--mj-color-info)' },
    External: { icon: 'fa-solid fa-arrow-up-right-from-square', color: 'var(--mj-color-info)' },
};

/** A node's icon and colour: by task kind when it has one, by structural role otherwise. */
function presentationOf(node: AgentRunTreeNode): { icon: string; color: string } {
    if (node.NodeType === 'Task' && node.SourceKind) {
        return TASK_KIND_PRESENTATION[node.SourceKind] ?? NODE_PRESENTATION.Task;
    }
    return NODE_PRESENTATION[node.NodeType] ?? NODE_PRESENTATION.Step;
}

/**
 * The timeline's item type for each tree node kind.
 *
 * A `Task` deliberately does NOT get its own row type. A workflow step that runs an action IS an
 * action, and rendering it as a generic "workflow step" threw away the action displayer — icon,
 * status treatment, navigation — that every other action row in the timeline already gets. Tasks map
 * onto the SAME vocabulary as run steps and pick up the same presentation; what marks them as
 * dispatcher work is `provenance`, which styles them without changing what they are.
 */
const NODE_ITEM_TYPE: Record<AgentRunTreeNodeType, TimelineItem['type']> = {
    Run: 'subrun',
    Step: 'step',
    // The graph itself keeps a distinct type — it is a container, not a step, and the visual break
    // between "the run" and "the workflow it submitted" is worth preserving.
    TaskGraph: 'taskgraph',
    Task: 'task',
};

/** A task's own kind, mapped onto the row types the timeline already knows how to render. */
const TASK_KIND_TO_ITEM_TYPE: Record<string, TimelineItem['type']> = {
    Action: 'action',
    Prompt: 'prompt',
    Agent: 'subrun',
    ForEach: 'step',
    While: 'step',
    Human: 'step',
    External: 'step',
};

/** The row type for a node: a task by its kind, anything else by its structural role. */
function itemTypeOf(node: AgentRunTreeNode): TimelineItem['type'] {
    if (node.NodeType === 'Task' && node.SourceKind) {
        return TASK_KIND_TO_ITEM_TYPE[node.SourceKind] ?? 'task';
    }
    return NODE_ITEM_TYPE[node.NodeType] ?? 'step';
}

/**
 * Flattens a run tree into timeline rows, in display order.
 *
 * Depth-first, because that is reading order: a node's children belong directly beneath it, and
 * breadth-first would interleave the steps of unrelated branches.
 *
 * @param root      the tree to project
 * @param baseLevel indent to start at, so a subtree can be spliced under an existing row
 * @param skipRoot  omit the root itself — used when the row that owns this subtree is already on
 *                  screen and the tree is being expanded underneath it
 */
export function ProjectRunTreeToTimeline(
    root: AgentRunTreeNode | null,
    baseLevel = 0,
    skipRoot = false,
): TimelineItem[] {
    if (!root) return [];

    const items: TimelineItem[] = [];

    const visit = (node: AgentRunTreeNode, level: number, parentID: string | undefined): void => {
        items.push(toTimelineItem(node, level, parentID));
        for (const child of node.Children) {
            visit(child, level + 1, node.NodeID);
        }
    };

    if (skipRoot) {
        for (const child of root.Children) visit(child, baseLevel, root.NodeID);
    } else {
        visit(root, baseLevel, undefined);
    }

    return items;
}

/** One node as a timeline row. */
function toTimelineItem(node: AgentRunTreeNode, level: number, parentID: string | undefined): TimelineItem {
    const presentation = presentationOf(node);

    return {
        id: node.NodeID,
        type: itemTypeOf(node),
        // Marks the row as dispatcher work WITHOUT changing what it is. Styling keys off this, so a
        // workflow's action still renders as an action and still reads as part of the workflow.
        provenance: node.NodeType === 'Task' || node.NodeType === 'TaskGraph' ? 'workflow' : undefined,
        title: node.Name,
        subtitle: describeNode(node),
        status: node.Status,
        // The timeline's contract wants a Date. A node that has not started yet has no honest one,
        // and the epoch would sort it to the top of a run it has not joined — so it borrows its
        // completion time, and failing that sorts last rather than first.
        startTime: node.StartedAt ?? node.CompletedAt ?? new Date(8_640_000_000_000_000),
        endTime: node.CompletedAt ?? undefined,
        duration: formatDuration(node.DurationMs),
        icon: presentation.icon,
        color: presentation.color,
        data: node,
        level,
        parentId: parentID,
        // Everything is already loaded — the whole tree arrived in one query — so nothing here is
        // ever in the "expanded but still fetching" state the lazy loader had to represent.
        isExpanded: true,
        childrenLoaded: true,
        hasNoChildren: node.Children.length === 0,
        children: [],
    };
}

/** The one-line description under a row's title. */
function describeNode(node: AgentRunTreeNode): string {
    const parts: string[] = [];

    switch (node.NodeType) {
        case 'TaskGraph':
            parts.push('Workflow — runs on the dispatcher');
            break;
        case 'Task':
            // Names the kind rather than saying "workflow step" for all of them. "Action" or
            // "Prompt" is what a reader needs; the provenance styling already says it is workflow.
            parts.push(node.SourceKind ? `${node.SourceKind} step` : 'Workflow step');
            break;
        case 'Run':
            parts.push('Agent run');
            break;
        default:
            break;
    }

    if (node.Cost != null) parts.push(formatCost(node.Cost));
    if (node.Tokens != null) parts.push(`${node.Tokens.toLocaleString()} tokens`);

    return parts.join(' · ');
}

/**
 * A duration, or undefined while a node is still running.
 *
 * Deliberately not "0ms" for an unfinished node: a step that has not stopped has no duration, and
 * showing zero reads as one that finished instantly.
 */
function formatDuration(durationMs: number | null): string | undefined {
    if (durationMs == null) return undefined;
    if (durationMs < 1000) return `${durationMs}ms`;
    const seconds = durationMs / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds % 60)}s`;
}

/** Costs are small; two decimals would render most real steps as "$0.00". */
function formatCost(cost: number): string {
    if (cost === 0) return '$0';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
}
