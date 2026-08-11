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
    Run: { icon: 'fa-solid fa-robot', color: 'var(--mj-brand-primary)' },
    Step: { icon: 'fa-solid fa-circle-nodes', color: 'var(--mj-text-secondary)' },
    TaskGraph: { icon: 'fa-solid fa-diagram-project', color: 'var(--mj-status-info)' },
    Task: { icon: 'fa-solid fa-diagram-next', color: 'var(--mj-status-info)' },
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
    Action: { icon: 'fa-solid fa-bolt', color: 'var(--mj-status-info)' },
    Prompt: { icon: 'fa-solid fa-comment-dots', color: 'var(--mj-status-info)' },
    Agent: { icon: 'fa-solid fa-robot', color: 'var(--mj-status-info)' },
    ForEach: { icon: 'fa-solid fa-repeat', color: 'var(--mj-status-info)' },
    While: { icon: 'fa-solid fa-rotate', color: 'var(--mj-status-info)' },
    Human: { icon: 'fa-solid fa-user-check', color: 'var(--mj-status-info)' },
    External: { icon: 'fa-solid fa-arrow-up-right-from-square', color: 'var(--mj-status-info)' },
};

// ⚠️ These MUST be semantic tokens (`--mj-status-*`, `--mj-brand-*`, `--mj-text-*`), never a
// primitive and never an invented name. `--mj-color-info` and `--mj-color-primary` were used here
// and NEITHER EXISTS — only `--mj-color-info-50/100/500` do — so `var()` resolved to nothing, the
// icons inherited whatever colour was around them, and in dark mode they were nearly invisible.
// A missing custom property fails silently by design, which is what let this ship looking fine in
// light mode.

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

/**
 * A workflow step's kind, in the vocabulary an agent run STEP uses.
 *
 * The two vocabularies exist because the same work is described twice: a task graph calls it
 * `Action`, a run step calls it `Actions`. Translating one into the other is what lets a graph's
 * steps reuse the run timeline wholesale instead of needing a parallel set of branches.
 */
const TASK_KIND_TO_STEP_TYPE: Record<string, string> = {
    Action: 'Actions',
    Prompt: 'Prompt',
    Agent: 'Sub-Agent',
    ForEach: 'ForEach',
    While: 'While',
    Human: 'Human',
    External: 'External',
};

/**
 * A graph task, described the way an agent run step is described.
 *
 * **Why translate rather than teach the UI a second language.** Everything in the run timeline
 * routes on a step's shape — `StepType` picks the icon and every detail tab, `TargetLogID` is what
 * a row opens (a prompt run, an action log, or a sub-agent run, by type), and `ParentID` is what
 * makes a loop's iterations render as its children. A task node carried none of it, so a workflow's
 * steps fell through every branch: the detail panel dumped raw JSON instead of the prompt run, an
 * action offered no link to its log, and a ForEach showed nothing to expand even though its passes
 * were loaded and sitting right there.
 *
 * Mapping the node into this shape lights all of that up at once, with no changes to the panel.
 *
 * **This is a view-model, NOT an entity.** It is deliberately not typed as `MJAIAgentRunStepEntity`
 * and must never be passed anywhere that would try to `.Save()` it — it is a projection of a Task
 * row, and the Task row remains the record of truth.
 */
export type WorkflowStepView = {
    ID: string;
    StepType: string;
    StepName: string;
    StepNumber: number;
    Status: string;
    /** What this row opens: a prompt run, an action execution log, or a sub-agent run — by type. */
    TargetLogID: string | null;
    /** The entity `TargetLogID` lives in, so a resolver does not have to re-derive it from StepType. */
    TargetEntity: string;
    ParentID: string | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    /**
     * The step's payload before and after, under the names the run timeline reads.
     *
     * A task calls them Input/OutputPayload; a run step calls them PayloadAtStart/PayloadAtEnd. The
     * rename IS the translation — it is what makes the shared detail panel show a workflow step the
     * same before/after diff it shows for an agent step, instead of falling through to a raw dump.
     */
    PayloadAtStart: string | null;
    PayloadAtEnd: string | null;
    /** Marks this as dispatcher work for anything that wants to say so. */
    IsWorkflowStep: true;
};

/** Translates a graph task into the step shape the run timeline already understands. */
export function ProjectTaskToStepView(node: AgentRunTreeNode, stepNumber: number): WorkflowStepView {
    return {
        ID: node.NodeID,
        StepType: (node.SourceKind && TASK_KIND_TO_STEP_TYPE[node.SourceKind]) || 'Actions',
        StepName: node.Name,
        StepNumber: stepNumber,
        Status: node.Status,
        // The tree already resolves this per kind: a Prompt task's SourceID is its prompt run, an
        // Agent task descends to its run, an Action task its execution log. Null when the node IS
        // its own record (the Task row), which is what a Human or External step is.
        TargetLogID: node.SourceEntity === 'MJ: Tasks' ? null : node.SourceID,
        TargetEntity: node.SourceEntity,
        ParentID: node.ParentNodeID,
        StartedAt: node.StartedAt,
        CompletedAt: node.CompletedAt,
        PayloadAtStart: node.InputPayload,
        PayloadAtEnd: node.OutputPayload,
        IsWorkflowStep: true,
    };
}

/**
 * The row type for a node.
 *
 * A task is a **`step`** — the same row type an agent run's own steps use — because that is what
 * makes every existing branch apply to it. What marks it as workflow work is `provenance`, not a
 * different type. Mapping tasks to distinct types (`prompt`, `action`) is what previously made them
 * render with the right icon and then miss every behaviour keyed on `type === 'step'`.
 */
function itemTypeOf(node: AgentRunTreeNode): TimelineItem['type'] {
    if (node.NodeType === 'Task') return 'step';
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
    // Per-parent counters, so a step's number is its position among ITS siblings rather than its
    // position in the whole flattened list — which is what `StepNumber` means for a run's own steps.
    const positions = new Map<string, number>();

    const visit = (node: AgentRunTreeNode, level: number, parentID: string | undefined): void => {
        const key = parentID ?? '(root)';
        const position = (positions.get(key) ?? 0) + 1;
        positions.set(key, position);

        items.push(toTimelineItem(node, level, parentID, position));
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
function toTimelineItem(
    node: AgentRunTreeNode,
    level: number,
    parentID: string | undefined,
    position: number,
): TimelineItem {
    const presentation = presentationOf(node);

    return {
        id: node.NodeID,
        type: itemTypeOf(node),
        // Marks the row as dispatcher work WITHOUT changing what it is. Styling keys off this, so a
        // workflow's action still renders as an action and still reads as part of the workflow.
        //
        // Set only for Task and TaskGraph — deliberately NOT for a Run nested under a task. Once the
        // tree descends into an agent run, that run and everything under it is ordinary agent work
        // again and reverts to the normal styling, which is what a reader needs to know about where
        // to look when it fails.
        provenance: node.NodeType === 'Task' || node.NodeType === 'TaskGraph' ? 'workflow' : undefined,
        title: node.Name,
        subtitle: describeNode(node),
        status: node.Status,
        // NULL when a node has not started — never a fabricated instant.
        //
        // This used to be `StartedAt ?? CompletedAt ?? new Date(8_640_000_000_000_000)`, chosen so
        // unstarted rows sorted last. The sentinel RENDERED: every Pending task in a workflow showed
        // the same invented clock time, identical on every row, looking exactly like data. Ordering
        // is the query's job (see the ORDER BY in get-agent-run-tree.sql); a row that has not run
        // shows no time at all, because it has none.
        startTime: node.StartedAt,
        endTime: node.CompletedAt ?? undefined,
        duration: formatDuration(node.DurationMs),
        icon: presentation.icon,
        color: presentation.color,
        // A task is handed to the UI as a STEP — see ProjectTaskToStepView. Everything downstream
        // routes on this shape, so translating here is what makes a workflow's steps reuse the run
        // timeline instead of falling through every branch to a raw JSON dump. Non-task nodes keep
        // the tree node, which is what their own rendering reads.
        data: node.NodeType === 'Task' ? ProjectTaskToStepView(node, position) : node,
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
