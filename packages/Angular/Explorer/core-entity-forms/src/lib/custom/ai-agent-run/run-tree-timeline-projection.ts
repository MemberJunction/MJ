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
const NODE_PRESENTATION: Record<AgentRunTreeNodeType, { icon: string }> = {
    Run: { icon: 'fa-solid fa-robot' },
    Step: { icon: 'fa-solid fa-circle-nodes' },
    TaskGraph: { icon: 'fa-solid fa-diagram-project' },
    Task: { icon: 'fa-solid fa-diagram-next' },
};

/**
 * The marker colour vocabulary — a NAME, never a CSS value.
 *
 * `TimelineItem.color` is written to `data-color` and matched by
 * `.timeline-marker[data-color="info"]`, which sets the filled circle's background. Emitting
 * `var(--mj-status-info)` here — a perfectly valid CSS value — matched no selector at all, so
 * workflow rows got no filled circle and rendered a bare glyph inheriting `--mj-text-inverse`:
 * near-invisible in dark mode, and visibly second-class beside the agent's own steps.
 *
 * That failure is silent twice over. An unmatched attribute selector is not an error, and neither is
 * a CSS variable that resolves to nothing — so the only symptom was an icon that looked dim.
 */
type MarkerColor = 'info' | 'success' | 'error' | 'warning' | 'secondary';

/** Status → marker colour, matching what an agent run's own steps have always used. */
const STATUS_COLOR: Record<string, MarkerColor> = {
    Running: 'info',
    Completed: 'success',
    Failed: 'error',
    Cancelled: 'warning',
    Blocked: 'error',
    Skipped: 'secondary',
    Pending: 'secondary',
    Waiting: 'warning',
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
const TASK_KIND_PRESENTATION: Record<string, { icon: string }> = {
    Action: { icon: 'fa-solid fa-bolt' },
    Prompt: { icon: 'fa-solid fa-comment-dots' },
    Agent: { icon: 'fa-solid fa-robot' },
    ForEach: { icon: 'fa-solid fa-repeat' },
    While: { icon: 'fa-solid fa-rotate' },
    Human: { icon: 'fa-solid fa-user-check' },
    External: { icon: 'fa-solid fa-arrow-up-right-from-square' },
};

/**
 * A node's icon and marker colour.
 *
 * **Workflow work is always `info`** — the blue filled circle — because provenance is the thing a
 * reader needs first: work that ran on the dispatcher, outliving the run that submitted it, is a
 * different kind of thing from a step the run executed itself. Status is still legible on the row
 * (its own coloured line, its icon), so the marker is free to carry provenance instead.
 *
 * **Everything else is coloured by status**, exactly as an agent run's own steps always have been.
 * That is what makes a sub-agent run nested inside a graph revert to ordinary agent styling at the
 * run boundary: below it, the work is ordinary agent work again.
 */
function presentationOf(node: AgentRunTreeNode): { icon: string; color: MarkerColor } {
    const workflow = node.NodeType === 'Task' || node.NodeType === 'TaskGraph';
    let icon = node.NodeType === 'Task' && node.SourceKind
        ? (TASK_KIND_PRESENTATION[node.SourceKind] ?? NODE_PRESENTATION.Task).icon
        : (NODE_PRESENTATION[node.NodeType] ?? NODE_PRESENTATION.Step).icon;

    // A loop that ran its iterations at once is a different shape of work from one that ran them in
    // turn, and the passes underneath look identical either way — same rows, same durations. The
    // icon carries the distinction, because it is visible without opening anything.
    if (IsParallelLoop(node)) icon = 'fa-solid fa-arrows-split-up-and-left';

    return { icon, color: workflow ? 'info' : (STATUS_COLOR[NormalizeStatus(node.Status)] ?? 'secondary') };
}

/** True when this node is a loop whose iterations ran concurrently. */
export function IsParallelLoop(node: AgentRunTreeNode): boolean {
    return node.LoopMode?.toLowerCase() === 'parallel';
}

/**
 * One status vocabulary for the timeline, out of the two the tree returns.
 *
 * A `Task` says `Complete` / `In Progress`; an `AIAgentRunStep` says `Completed` / `Running`. The
 * timeline branches on the step vocabulary throughout — icons, colours, the status pill — so every
 * workflow row missed EVERY branch and fell through to the unknown-status glyph. `Complete` and
 * `Completed` differing by two letters is not a distinction anyone should have to know about.
 *
 * Normalized for DISPLAY only. `WorkflowStepView.Status` keeps the row's own word, so the JSON tab
 * still shows what the database actually holds.
 */
export function NormalizeStatus(status: string): string {
    switch (status) {
        case 'Complete': return 'Completed';
        case 'In Progress': return 'Running';
        case 'Deferred': return 'Pending';
        default: return status;
    }
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

/**
 * A node the tree SYNTHESIZED rather than read from `AIAgentRunStep` — today, a loop pass.
 *
 * A pass has no row of its own; the tree builds it from the loop's iteration trace and gives it
 * `NodeType: 'Step'`, so it is indistinguishable from a real run step by type alone. What separates
 * them is where they point: a real step's record IS an `AIAgentRunStep`, while a pass points at the
 * prompt run, agent run or action log it produced.
 *
 * This mattered because only `Task` nodes were being translated into the step shape, so a pass kept
 * a raw tree node as its `data` — which carries `SourceID`/`SourceEntity` and no `TargetLogID`. The
 * timeline's navigation gate reads `TargetLogID`, so five passes that each ran a real action offered
 * no way to open any of them, while the action step two rows above did.
 */
function isSynthesizedStep(node: AgentRunTreeNode): boolean {
    return node.NodeType === 'Step' && node.SourceEntity !== 'MJ: AI Agent Run Steps';
}

/** Translates a graph task — or a synthesized pass — into the step shape the timeline understands. */
export function ProjectTaskToStepView(node: AgentRunTreeNode, stepNumber: number): WorkflowStepView {
    return {
        ID: node.NodeID,
        // Translate a TASK's vocabulary; pass a step vocabulary through unchanged. A loop pass
        // already reports `Actions` / `Prompt` / `Sub-Agent`, and running those through the task map
        // dropped `Sub-Agent` (absent from it) to the `Actions` default — mislabelling every
        // sub-agent pass as an action, and pointing its link at the wrong entity.
        StepType: (node.SourceKind && (TASK_KIND_TO_STEP_TYPE[node.SourceKind] ?? node.SourceKind)) || 'Actions',
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
 * The graph a `TaskGraph` submit step handed off to, when the pair is a clean 1:1.
 *
 * **Why these two rows are one thing.** `get-agent-run-tree.sql` joins the submit STEP to the graph
 * it produced through `JSON_VALUE(s.OutputData, '$.parentTaskID')`, so a dispatched workflow always
 * arrives as a `Step` row whose single child is the `TaskGraph` row. They are the same workflow
 * described twice, and the two descriptions disagree on the only question a reader is asking: the
 * step's status reports the SUBMISSION (`Completed` in ~300ms, correctly — see `base-agent.ts`,
 * "Success means 'this graph is durable and will run', NOT 'this graph has run'"), while its title
 * names the GRAPH, which is still running. A row titled after the workflow, marked Completed, above
 * children that are Pending, reads as a finished workflow. The header gets this right — PAUSED plus
 * "Workflow still running" — and the tree was the one place that contradicted it.
 *
 * **Null in three cases, all deliberate.** A submission that did not SUCCEED keeps its own row —
 * failed, cancelled, or still in flight — because there is either no graph to inherit a status from
 * or nothing yet to inherit, and the submission is then the whole story. An unexpected shape — no
 * `TaskGraph` child, or more than one, or extra children beside it — also declines, because a
 * projection that guesses when its assumption breaks is how a display invents a status nobody wrote.
 *
 * The success test is on the normalized word, since a step says `Completed` and a task says
 * `Complete`; comparing raw is the two-letter difference this file already exists to absorb.
 */
function collapsibleGraphChild(node: AgentRunTreeNode): AgentRunTreeNode | null {
    if (node.NodeType !== 'Step' || node.SourceKind !== 'TaskGraph') return null;
    if (NormalizeStatus(node.Status) !== 'Completed') return null;
    const graphChildren = node.Children.filter((child) => child.NodeType === 'TaskGraph');
    return graphChildren.length === 1 && node.Children.length === graphChildren.length
        ? graphChildren[0]
        : null;
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

    /**
     * Builds one row and its subtree.
     *
     * **Nested, not flattened.** The projection used to return one flat array with `level` for
     * indentation, and set `children: []` on every row. The timeline's expand affordance is gated on
     * `children.length`, so nothing a workflow produced could ever be collapsed: the task graph, its
     * loops and their passes all rendered permanently open, indented but unmanageable, while an
     * agent's own sub-agent steps a few rows above collapsed normally. Handing back the real shape
     * lights up the recursive template and the expand machinery that were already there.
     */
    const build = (node: AgentRunTreeNode, level: number, parentID: string | undefined, position: number): TimelineItem => {
        // A dispatched workflow arrives as two rows for one thing — see `collapsibleGraphChild`.
        // Merged into one that keeps the step's identity (its id, so selection and deep links still
        // resolve) and takes its STATUS and timing from the graph, which is what the title claims to
        // describe. The submission's own latency survives in the subtitle rather than being lost.
        const graph = collapsibleGraphChild(node);
        if (graph) {
            const item = toTimelineItem(graph, level, parentID, position);
            item.id = node.NodeID;
            item.title = node.Name;
            item.subtitle = describeDispatchedWorkflow(node, graph);
            item.children = graph.Children.map((child, index) => build(child, level + 1, node.NodeID, index + 1));
            return item;
        }

        const item = toTimelineItem(node, level, parentID, position);
        item.children = node.Children.map((child, index) => build(child, level + 1, node.NodeID, index + 1));
        return item;
    };

    return skipRoot
        ? root.Children.map((child, index) => build(child, baseLevel, root.NodeID, index + 1))
        : [build(root, baseLevel, undefined, 1)];
}


/**
 * Subtitle for a collapsed submit-step/graph pair.
 *
 * Keeps the fact the merge would otherwise discard: how long the SUBMISSION took. That number is
 * meaningful on its own — a slow submit is a slow validate-and-persist, which is a different problem
 * from a slow workflow — and leaving it on a row whose duration now belongs to the graph would be
 * two unrelated timings competing for one field.
 */
function describeDispatchedWorkflow(step: AgentRunTreeNode, graph: AgentRunTreeNode): string {
    const base = describeNode(graph);
    const dispatch = step.DurationMs != null ? `dispatched in ${formatDuration(step.DurationMs)}` : 'dispatched';
    return base ? `${base} · ${dispatch}` : dispatch;
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
        status: NormalizeStatus(node.Status),
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
        // A task — and a synthesized loop pass — is handed to the UI as a STEP. Everything
        // downstream routes on this shape, so translating here is what makes workflow work reuse the
        // run timeline instead of falling through every branch to a raw JSON dump. A REAL agent run
        // step keeps the tree node: its own rendering already reads that.
        data: node.NodeType === 'Task' || isSynthesizedStep(node)
            ? ProjectTaskToStepView(node, position)
            : node,
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
            // A prompt-backed step subtitles itself EXACTLY as an agent run's prompt step does.
            // The same work should not describe itself two different ways depending on which
            // timeline it was opened from — that reads as two features rather than one.
            if (node.Model) {
                parts.push(`Model: ${node.Model} | Vendor: ${node.Vendor || 'Unknown'}`);
                break;
            }
            // Otherwise name the kind. "Action" or "Prompt" is what a reader needs; the provenance
            // styling already says it is workflow.
            //
            // A loop also says HOW it ran. Spelled out rather than left to the icon alone: "ForEach
            // step · 5 passes in parallel" answers, without opening anything, why five 300ms passes
            // took 300ms rather than a second and a half.
            if (node.SourceKind === 'ForEach' || node.SourceKind === 'While') {
                const passes = node.Children.length;
                const count = passes > 0 ? `${passes} ${passes === 1 ? 'pass' : 'passes'}` : 'no passes';
                parts.push(`${node.SourceKind} step · ${count}${IsParallelLoop(node) ? ' in parallel' : ''}`);
                break;
            }
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
