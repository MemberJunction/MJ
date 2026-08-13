/**
 * @fileoverview Projects a `TaskGraphSpec` onto the generic canvas shapes, and back.
 *
 * **Kept pure and separate from the component on purpose.** Everything interesting about rendering a
 * task graph — which node is an entry point, which edge is conditional, how a runtime status maps to
 * a visual one, whether removing a node orphans an edge — is decidable from data alone. Putting it
 * in a component would make it reachable only through a TestBed, and the resulting tests would be
 * about Angular rather than about graphs.
 *
 * **The direction flip, again.** A `TaskGraphSpec` edge points *backwards* (`dependsOn`: "I wait for
 * X"); a canvas connection points *forwards* (source → target). Same edge, opposite authoring
 * convention — the graph is written by whoever knows the prerequisites, the canvas drawn by whoever
 * follows the arrows. This is the second place in the program that inversion appears (Save as
 * Workflow is the first), which is why it is stated rather than left implicit.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import {
    ConfigOf,
    NormalizeDependency,
    TaskNode,
    type TaskNodeBase,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type TaskGraphDependency,
} from '@memberjunction/ai-core-plus';
import type { FlowConnection, FlowNode, FlowNodeStatus, FlowNodeTypeConfig, FlowPosition } from '@memberjunction/ng-flow-editor';

/**
 * The shapes this canvas can DRAW.
 *
 * Three of the spec's seven `kind`s, and the choice is the canvas's: these are the shapes a person
 * authors. `Prompt`, `ForEach`, `While` and `External` are expressible in the spec but have no
 * authoring affordance here — a palette entry that cannot be configured would be worse than none.
 *
 * **Drawing and RENDERING are different questions**, which this type used to conflate. A run's
 * graph is displayed on the same canvas, and it contains kinds nobody can draw — so mapping them
 * all to `AgentTask` made a fully-configured ForEach render as "AGENT STEP · No agent chosen yet",
 * which is not merely imprecise: it says the step is broken. See {@link TaskGraphRenderType}.
 */
export type TaskGraphNodeType = 'AgentTask' | 'ActionTask' | 'HumanTask';

/**
 * The shapes this canvas can SHOW — a superset of what it can draw.
 *
 * Display-only kinds exist because a task graph is rendered in two places: the editor, where a
 * person builds one, and a run view, where one that already ran is shown. The second must be able
 * to depict every kind the dispatcher can execute, whether or not the palette offers it.
 */
export type TaskGraphRenderType = TaskGraphNodeType | 'PromptTask' | 'ForEachTask' | 'WhileTask' | 'ExternalTask';

/** A palette entry, pinned to one of the three authorable shapes. */
export type TaskGraphNodeTypeConfig = FlowNodeTypeConfig & { Type: TaskGraphNodeType };

/**
 * Whether a shape is one a person can actually author here.
 *
 * The authoring paths — the palette, `NewTaskFromNodeType`, the properties panel — only handle the
 * three drawable shapes. Rendering handles more. This is the seam between the two, stated as a type
 * guard so the compiler enforces it rather than a cast pretending the distinction does not exist.
 */
export function IsAuthorableNodeType(type: TaskGraphRenderType): type is TaskGraphNodeType {
    return type === 'AgentTask' || type === 'ActionTask' || type === 'HumanTask';
}

/** A rendering entry — every shape the canvas can depict, authorable or not. */
export type TaskGraphRenderTypeConfig = FlowNodeTypeConfig & { Type: TaskGraphRenderType };

/**
 * Port ids are scoped to their NODE, and must be.
 *
 * The canvas resolves a connection by looking its `fOutputId` / `fInputId` up among all registered
 * ports — a flat, graph-wide namespace. Giving every node ports literally called `in` and `out` made
 * every node's ports collide with every other node's, so a connection could not name which node's
 * port it meant. The result was a workflow that drew its boxes correctly and **no edges at all**:
 * nothing errored, because an unresolvable port is simply a connection with nowhere to attach.
 *
 * The Flow Agent editor — the other consumer of this canvas, whose edges have always drawn — scopes
 * its ports the same way (`${stepId}-input` / `${stepId}-output`). This is that convention, named,
 * so a future producer cannot reintroduce the collision by writing the obvious literal.
 */
export function InputPortID(tempId: string): string {
    return `${tempId}-in`;
}

export function OutputPortID(tempId: string): string {
    return `${tempId}-out`;
}

/**
 * Palette defaults. These carry the bare names because a palette entry describes a node TYPE, not a
 * placed node — there is no id to scope them to yet. {@link SpecToNodes} assigns the real, scoped
 * ids when a node is actually placed on the canvas.
 */
const TASK_GRAPH_PORTS: FlowNodeTypeConfig['DefaultPorts'] = [
    { ID: 'in', Direction: 'input', Side: 'top', Multiple: true },
    { ID: 'out', Direction: 'output', Side: 'bottom', Multiple: true },
];

/** What the palette offers — one entry per assignment shape the spec supports. */
export const TASK_GRAPH_NODE_TYPES: readonly TaskGraphNodeTypeConfig[] = [
    {
        Type: 'AgentTask',
        Label: 'Agent Step',
        Icon: 'fa-robot',
        Color: '#4A6FA5',
        Category: 'Steps',
        DefaultPorts: TASK_GRAPH_PORTS,
    },
    {
        Type: 'ActionTask',
        Label: 'Action Step',
        Icon: 'fa-bolt',
        Color: '#3B82F6',
        Category: 'Steps',
        DefaultPorts: TASK_GRAPH_PORTS,
    },
    {
        Type: 'HumanTask',
        Label: 'Person Step',
        Icon: 'fa-user-check',
        Color: '#7B1FA2',
        Category: 'Steps',
        DefaultPorts: TASK_GRAPH_PORTS,
    },
];

/**
 * Everything the canvas can DEPICT: the palette, plus the kinds that only ever arrive from a run.
 *
 * Deliberately a superset rather than an extension of the palette — adding these to
 * `TASK_GRAPH_NODE_TYPES` would put un-configurable entries in the authoring toolbox.
 */
export const TASK_GRAPH_RENDER_TYPES: readonly TaskGraphRenderTypeConfig[] = [
    ...TASK_GRAPH_NODE_TYPES,
    { Type: 'PromptTask',   Label: 'Prompt Step',   Icon: 'fa-comment-dots', Color: '#8B5CF6', Category: 'Steps', DefaultPorts: TASK_GRAPH_PORTS },
    { Type: 'ForEachTask',  Label: 'For Each Step', Icon: 'fa-repeat',       Color: '#D97706', Category: 'Steps', DefaultPorts: TASK_GRAPH_PORTS },
    { Type: 'WhileTask',    Label: 'While Step',    Icon: 'fa-rotate',       Color: '#D97706', Category: 'Steps', DefaultPorts: TASK_GRAPH_PORTS },
    { Type: 'ExternalTask', Label: 'External Step', Icon: 'fa-arrow-up-right-from-square', Color: '#0891B2', Category: 'Steps', DefaultPorts: TASK_GRAPH_PORTS },
];

/**
 * The config for a node type, or null when the type is not one of ours.
 *
 * Searches the RENDER set, so a run's ForEach resolves to its own icon and label instead of
 * silently falling back to the agent shape.
 */
export function GetNodeTypeConfig(type: string): TaskGraphRenderTypeConfig | null {
    return TASK_GRAPH_RENDER_TYPES.find((c) => c.Type === type) ?? null;
}

/** Live per-task state for the runtime overlay, keyed by `tempId`. */
export type TaskGraphRuntimeStatus = Record<string, TaskGraphRuntimeState>;

/** What a task is doing right now, in the durable engine's own vocabulary. */
export type TaskGraphRuntimeState =
    | 'Pending'
    | 'In Progress'
    | 'Complete'
    | 'Failed'
    | 'Blocked'
    | 'Cancelled'
    | 'Deferred'
    // A branch the workflow did not take. Absent from this union until now, which is why it fell
    // through to the default rendering and a not-taken step drew as an ordinary one.
    | 'Skipped';

/**
 * Maps a durable task state onto the canvas's visual vocabulary.
 *
 * Two mappings are worth explaining. `Blocked` renders as a **warning**, not an error: nothing went
 * wrong, the graph simply cannot reach it — showing it as a failure would send someone hunting for a
 * bug that does not exist. `Deferred` renders as `pending` because, to the person watching, waiting
 * on a schedule and waiting on a prerequisite look and mean the same thing.
 */
export function RuntimeStateToNodeStatus(state: TaskGraphRuntimeState | undefined): FlowNodeStatus {
    switch (state) {
        case 'In Progress': return 'running';
        case 'Complete':    return 'success';
        case 'Failed':      return 'error';
        case 'Blocked':     return 'warning';
        case 'Cancelled':   return 'disabled';
        // Its own state, not a shade of disabled: a branch the workflow did not take is a normal
        // outcome. Falling through to 'default' — which is what happened before — drew it as an
        // ordinary node, so a conditional workflow looked like it had run every branch.
        case 'Skipped':     return 'skipped';
        case 'Deferred':    return 'pending';
        case 'Pending':     return 'pending';
        default:            return 'default';
    }
}

/**
 * True when the node is a person's step.
 *
 * One field decides it now: spec v2 gives every node exactly one `kind`, so "is this a person's
 * step" stopped being an inference over three optional flags and became a comparison.
 */
export function IsHumanTask(node: TaskGraphSpecNode): boolean {
    return node.kind === 'Human';
}

/**
 * Which of the three shapes a node is, for rendering.
 *
 * An unassigned node (just added, nothing picked yet) reads as an agent step: it is the commonest
 * intent, and the validator is already telling the author, in words, that it needs an assignee.
 * Guessing "person" instead — which is what the old `!agentName` rule did — put a step in the
 * graph that claimed to be waiting on someone when nobody had said so.
 */
export function GetTaskNodeType(node: TaskGraphSpecNode): TaskGraphRenderType {
    switch (node.kind) {
        case 'Human':    return 'HumanTask';
        case 'Action':   return 'ActionTask';
        case 'Prompt':   return 'PromptTask';
        case 'ForEach':  return 'ForEachTask';
        case 'While':    return 'WhileTask';
        case 'External': return 'ExternalTask';
        // An unassigned node — just added, nothing picked — reads as an agent step: the commonest
        // intent, and the validator is already saying in words that it needs an assignee.
        default:         return 'AgentTask';
    }
}

/**
 * Builds the task a palette entry stands for.
 *
 * Pure, and here rather than in the component, because "what does clicking *Person Step* actually
 * put in the graph" is a fact about the spec — testable without a TestBed, and the one place the
 * assignment xor is honoured on creation.
 *
 * `defaultAgentName` / `defaultActionName` are what the host has to offer. When it has nothing, the
 * step is created unassigned on purpose: inventing an agent name that may not exist would produce a
 * graph that passes the canvas and fails at submission, whereas an unassigned step is reported
 * immediately by the same validator the engine runs.
 */
export function NewTaskFromNodeType(
    spec: TaskGraphSpec,
    type: TaskGraphNodeType,
    defaults: { agentName?: string; actionName?: string } = {},
): TaskGraphSpecNode {
    const base: TaskNodeBase = {
        tempId: NextTempId(spec),
        name: NEW_TASK_NAMES[type],
        description: '',
        dependsOn: [],
    };
    switch (type) {
        case 'HumanTask':  return TaskNode.Human(base);
        // A step created before the host has any names to offer is created with an empty one on
        // purpose: the validator reports it immediately, whereas inventing a name would produce a
        // graph that passes here and fails at submission.
        case 'ActionTask': return TaskNode.Action(base, { actionName: defaults.actionName ?? '' });
        default:           return TaskNode.Agent(base, { agentName: defaults.agentName ?? '' });
    }
}

/** Default step names, so a new box says what it is before the author renames it. */
const NEW_TASK_NAMES: Record<TaskGraphNodeType, string> = {
    AgentTask: 'New agent step',
    ActionTask: 'New action step',
    HumanTask: 'New person step',
};

/** Entry points: nodes nothing else has to finish first. Same rule the traversal engine uses. */
export function GetEntryTempIds(spec: TaskGraphSpec): string[] {
    return (spec.tasks ?? []).filter((t) => (t.dependsOn ?? []).length === 0).map((t) => t.tempId);
}

/** Every dependency of a node, in normalized object form. */
export function GetDependencies(node: TaskGraphSpecNode): TaskGraphDependency[] {
    return (node.dependsOn ?? []).map(NormalizeDependency);
}

/** The `tempId`s that depend on `tempId` — i.e. what breaks if it is removed. */
export function GetDependents(spec: TaskGraphSpec, tempId: string): string[] {
    return (spec.tasks ?? [])
        .filter((t) => GetDependencies(t).some((d) => d.tempId === tempId))
        .map((t) => t.tempId);
}

/** Deterministic id for a canvas edge, so re-renders don't churn selection. */
function edgeId(fromTempId: string, toTempId: string): string {
    return `${fromTempId}->${toTempId}`;
}

/**
 * Projects the spec onto canvas nodes.
 *
 * Positions are left at the origin: layout is the canvas's job (Dagre), and a spec carries no
 * geometry precisely because a task graph is a *logical* structure. An agent that emitted one never
 * had an opinion about where the boxes go.
 */
/**
 * Projects the spec onto canvas nodes.
 *
 * `positions` carries geometry the spec cannot hold. `TaskGraphSpec` is an execution contract with
 * no layout field, so without a caller-held map every re-projection would return every node to the
 * origin — which is what previously forced a full re-arrange (and a viewport re-zoom) after every
 * single edit. Unknown ids fall back to the origin, which is also the correct starting state for a
 * graph that has never been laid out.
 */
/**
 * Debug overlay the run view hands the adapter. Paint only — the widget never calls an operation.
 *
 * Breakpoints and the paused-at step become badges. Overrides restyle connections (dotted, never
 * dashed — dashed already means "this edge is conditional"). Held/forced edges stay visible even
 * when a skip cascade would otherwise drop them, so the run history cannot lie about why a branch
 * ran.
 */
export type TaskGraphDebugOverlay = {
    breakpoints?: readonly string[];
    pausedAtTaskID?: string | null;
    /** Graph is claim-gated. With no paused-at step, the entry node is what is waiting. */
    paused?: boolean;
    edgeOverrides?: Readonly<Record<string, 'true' | 'false'>>;
    /** Show the condition expression on the connection label, not just the word "if". */
    showConditions?: boolean;
    /** Edge IDs (or from→to) currently flowing — painted animated + brand. */
    activeEdgeIDs?: readonly string[];
};

export function SpecToNodes(
    spec: TaskGraphSpec,
    runtime?: TaskGraphRuntimeStatus,
    positions?: ReadonlyMap<string, FlowPosition>,
    debug?: TaskGraphDebugOverlay,
): FlowNode[] {
    const entryIds = new Set(GetEntryTempIds(spec));
    const breakpoints = new Set(debug?.breakpoints ?? []);

    return (spec.tasks ?? []).map((task) => {
        const type = GetTaskNodeType(task);
        const known = positions?.get(task.tempId);
        const awaiting = isAwaitingUser(task.tempId, entryIds, runtime, debug);
        return {
            ID: task.tempId,
            Type: type,
            Label: task.name,
            Subtitle: TaskSubtitle(task, type),
            Icon: GetNodeTypeConfig(type)?.Icon ?? 'fa-circle-nodes',
            IconColor: awaiting ? 'var(--mj-brand-primary)' : undefined,
            // Keep the real runtime status. Mapping "paused here" to `running` drew a spinner
            // on a step that is waiting for the operator — it read as "this is executing".
            Status: RuntimeStateToNodeStatus(runtime?.[task.tempId]),
            StatusMessage: task.description,
            IsStartNode: entryIds.has(task.tempId),
            Badges: NodeDebugBadges(task.tempId, breakpoints, debug, runtime, entryIds),
            Position: known ? { ...known } : { X: 0, Y: 0 },
            Ports: [
                { ID: InputPortID(task.tempId), Direction: 'input', Side: 'top', Multiple: true },
                { ID: OutputPortID(task.tempId), Direction: 'output', Side: 'bottom', Multiple: true },
            ],
            Data: { TempId: task.tempId, AwaitingUser: awaiting },
        };
    });
}

/** Badge pills for an armed breakpoint and the step the graph actually stopped on. */
export function NodeDebugBadges(
    taskID: string,
    breakpoints: ReadonlySet<string>,
    debug?: TaskGraphDebugOverlay,
    runtime?: TaskGraphRuntimeStatus,
    entryIds?: ReadonlySet<string>,
): FlowNode['Badges'] {
    const badges: NonNullable<FlowNode['Badges']> = [];
    if (isAwaitingUser(taskID, entryIds ?? new Set(), runtime, debug)) {
        badges.push({
            Label: 'Waiting on you — Continue or Step to run this step',
            Value: 'Waiting here',
            Icon: 'fa-pause',
            Color: 'var(--mj-brand-primary)',
        });
    }
    if (breakpoints.has(taskID)) {
        badges.push({
            Label: 'Breakpoint',
            Value: 'break',
            Icon: 'fa-circle',
            Color: 'var(--mj-status-error)',
        });
    }
    return badges.length > 0 ? badges : undefined;
}

/**
 * The one line under a node's name: who or what runs it.
 *
 * An unassigned step says so rather than showing nothing — a blank subtitle looks like a step that
 * is fine, and this one is the reason the validation banner is complaining.
 */
export function TaskSubtitle(task: TaskGraphSpecNode, type: TaskGraphRenderType = GetTaskNodeType(task)): string {
    switch (type) {
        case 'HumanTask':    return 'Waiting on a person';
        case 'ActionTask':   return ConfigOf(task, 'Action')?.actionName || 'No action chosen yet';
        case 'PromptTask':   return ConfigOf(task, 'Prompt')?.promptName || 'No prompt chosen yet';
        // A loop's subtitle is what it REPEATS — the one fact that makes the node readable.
        case 'ForEachTask':  return LoopBodyLabel(ConfigOf(task, 'ForEach')) ?? 'Repeats for each item';
        case 'WhileTask':    return LoopBodyLabel(ConfigOf(task, 'While')) ?? 'Repeats until its condition is false';
        case 'ExternalTask': return ConfigOf(task, 'External')?.domain || 'Completed by an outside system';
        // Only a genuinely unassigned node reaches this now. It used to catch Prompt, ForEach,
        // While and External too — so a fully-configured loop displayed "No agent chosen yet",
        // which reads as a broken step rather than an unrecognised one.
        default:             return ConfigOf(task, 'Agent')?.agentName || 'No agent chosen yet';
    }
}

/** What a loop repeats, when it says. */
function LoopBodyLabel(
    op: { action?: { name: string }; subAgent?: { name: string }; prompt?: { name: string } } | null | undefined,
): string | null {
    if (!op) return null;
    const body = op.action?.name ?? op.subAgent?.name ?? op.prompt?.name;
    return body ? `Repeats: ${body}` : null;
}

/**
 * Projects the spec's dependencies onto canvas connections, reversing their direction.
 *
 * A conditional edge is drawn dashed and labeled with its condition, because the difference between
 * "always" and "only sometimes" is the single most consequential thing about an edge and the one a
 * reader is most likely to miss when scanning a diagram.
 *
 * Edges naming a task that is not in the graph are skipped rather than drawn dangling — the
 * validator reports them as `UnknownDependency`, and rendering a connection to nowhere would be a
 * second, worse way of saying the same thing.
 */
export function SpecToConnections(
    spec: TaskGraphSpec,
    runtime?: TaskGraphRuntimeStatus,
    debug?: TaskGraphDebugOverlay,
): FlowConnection[] {
    const known = new Set((spec.tasks ?? []).map((t) => t.tempId));
    const connections: FlowConnection[] = [];

    for (const task of spec.tasks ?? []) {
        for (const dep of GetDependencies(task)) {
            if (!known.has(dep.tempId)) continue;

            const override = dep.id ? debug?.edgeOverrides?.[dep.id] : undefined;
            const eitherSkipped = runtime
                && (runtime[task.tempId] === 'Skipped' || runtime[dep.tempId] === 'Skipped');
            // RUN MODE DRAWS ONLY THE PATH TAKEN — except an operator-forced edge, which must stay
            // visible or the history lies about why a branch ran (or did not).
            if (eitherSkipped && !override) continue;

            connections.push(ProjectConnection(
                dep,
                task.tempId,
                override,
                debug?.showConditions === true,
                isFlowingEdge(dep.tempId, task.tempId, runtime, debug),
            ));
        }
    }
    return connections;
}

/** One canvas connection, including the override styling that must never look like a real verdict. */
export function ProjectConnection(
    dep: TaskGraphDependency,
    toTempId: string,
    override?: 'true' | 'false',
    showConditions: boolean = false,
    flowing: boolean = false,
): FlowConnection {
    const conditional = !!dep.condition?.trim();
    const forced = override === 'true' || override === 'false';
    const conditionLabel = dep.condition?.trim()
        ? TruncateCondition(dep.condition.trim())
        : undefined;

    return {
        ID: edgeId(dep.tempId, toTempId),
        SourceNodeID: dep.tempId,
        SourcePortID: OutputPortID(dep.tempId),
        TargetNodeID: toTempId,
        TargetPortID: InputPortID(toTempId),
        Label: forced
            ? (override === 'true' ? 'forced yes' : 'forced no')
            : (conditional ? (showConditions && conditionLabel ? conditionLabel : 'if') : undefined),
        LabelDetail: forced
            ? `Operator set this path to ${override}${dep.condition ? ` — ${dep.condition}` : ''}`
            : (dep.condition ?? undefined),
        LabelIcon: forced ? 'fa-hand' : (conditional ? 'fa-code-branch' : undefined),
        LabelIconColor: forced ? 'var(--mj-status-warning)' : undefined,
        Condition: dep.condition ?? undefined,
        // Dotted is the override; dashed is already "this edge is conditional".
        Style: forced ? 'dotted' : (conditional ? 'dashed' : 'solid'),
        Color: flowing
            ? 'var(--mj-brand-primary)'
            : (forced ? 'var(--mj-status-warning)' : undefined),
        Animated: flowing,
        Data: { FromTempId: dep.tempId, ToTempId: toTempId, EdgeID: dep.id },
    };
}

const TERMINAL_RUNTIME = new Set<TaskGraphRuntimeState>(['Complete', 'Failed', 'Cancelled', 'Skipped']);

function isPausedHere(
    taskID: string,
    runtime?: TaskGraphRuntimeStatus,
    debug?: Pick<TaskGraphDebugOverlay, 'pausedAtTaskID'>,
): boolean {
    if (debug?.pausedAtTaskID !== taskID) return false;
    const state = runtime?.[taskID];
    return !state || !TERMINAL_RUNTIME.has(state);
}

/**
 * The step the operator has to act on: the breakpoint we stopped at, or — at start-paused
 * before any claim — the entry node.
 */
function isAwaitingUser(
    taskID: string,
    entryIds: ReadonlySet<string>,
    runtime?: TaskGraphRuntimeStatus,
    debug?: TaskGraphDebugOverlay,
): boolean {
    if (isPausedHere(taskID, runtime, debug)) return true;
    if (!debug?.paused || debug.pausedAtTaskID) return false;
    if (!entryIds.has(taskID)) return false;
    const state = runtime?.[taskID];
    return !state || !TERMINAL_RUNTIME.has(state);
}

function isFlowingEdge(
    fromTempId: string,
    toTempId: string,
    runtime?: TaskGraphRuntimeStatus,
    debug?: TaskGraphDebugOverlay,
): boolean {
    if (isPausedHere(toTempId, runtime, debug)) return true;
    if (debug?.activeEdgeIDs?.includes(edgeId(fromTempId, toTempId))) return true;
    if (!runtime) return false;
    return runtime[fromTempId] === 'Complete' && runtime[toTempId] === 'In Progress';
}

function TruncateCondition(text: string, max: number = 28): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Adds a dependency to the spec, returning a NEW spec.
 *
 * Immutable because the component emits the result to a host that may keep it, diff it, or reject
 * it; mutating the input would let a canceled edit leak into the host's copy anyway. A duplicate
 * edge is a no-op rather than an error — dragging the same connection twice is a slip, not a
 * request to corrupt the graph.
 */
export function AddDependency(spec: TaskGraphSpec, fromTempId: string, toTempId: string, condition?: string): TaskGraphSpec {
    return {
        ...spec,
        tasks: (spec.tasks ?? []).map((task) => {
            if (task.tempId !== toTempId) return task;
            const existing = GetDependencies(task);
            if (existing.some((d) => d.tempId === fromTempId)) return task;
            const next: TaskGraphDependency | string = condition?.trim()
                ? { tempId: fromTempId, condition }
                : fromTempId;
            return { ...task, dependsOn: [...(task.dependsOn ?? []), next] };
        }),
    };
}

/** Removes a dependency, returning a NEW spec. */
export function RemoveDependency(spec: TaskGraphSpec, fromTempId: string, toTempId: string): TaskGraphSpec {
    return {
        ...spec,
        tasks: (spec.tasks ?? []).map((task) =>
            task.tempId !== toTempId
                ? task
                : { ...task, dependsOn: (task.dependsOn ?? []).filter((d) => NormalizeDependency(d).tempId !== fromTempId) },
        ),
    };
}

/**
 * Removes a task AND every edge into it, returning a NEW spec.
 *
 * Severing the inbound edges is not a convenience — leaving them would produce a graph whose
 * `dependsOn` names a task that no longer exists, which the validator rejects as
 * `UnknownDependency`. Deleting a box on a canvas should not make the graph invalid.
 */
export function RemoveTask(spec: TaskGraphSpec, tempId: string): TaskGraphSpec {
    return {
        ...spec,
        tasks: (spec.tasks ?? [])
            .filter((t) => t.tempId !== tempId)
            .map((t) => ({ ...t, dependsOn: (t.dependsOn ?? []).filter((d) => NormalizeDependency(d).tempId !== tempId) })),
    };
}

/** Adds a task, returning a NEW spec. */
export function AddTask(spec: TaskGraphSpec, task: TaskGraphSpecNode): TaskGraphSpec {
    return { ...spec, tasks: [...(spec.tasks ?? []), task] };
}

/** Replaces a task in place by `tempId`, returning a NEW spec. */
export function UpdateTask(spec: TaskGraphSpec, tempId: string, next: TaskGraphSpecNode): TaskGraphSpec {
    return { ...spec, tasks: (spec.tasks ?? []).map((t) => (t.tempId === tempId ? next : t)) };
}

/**
 * Would adding `from → to` create a cycle?
 *
 * Answered before the edge exists, so the canvas can refuse it rather than create an invalid graph
 * and report it afterwards. A self-edge is the degenerate case and is caught first.
 *
 * Iterative rather than recursive: the graph may come from an LLM, and a deeply-chained spec should
 * produce a refusal, not a stack overflow.
 */
export function WouldCreateCycle(spec: TaskGraphSpec, fromTempId: string, toTempId: string): boolean {
    if (fromTempId === toTempId) return true;

    // A cycle appears iff `from` is already reachable from `to` by following dependsOn edges —
    // i.e. `to` already (transitively) waits on `from`.
    const dependenciesOf = new Map<string, string[]>(
        (spec.tasks ?? []).map((t) => [t.tempId, GetDependencies(t).map((d) => d.tempId)]),
    );

    const stack = [...(dependenciesOf.get(fromTempId) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === toTempId) return true;
        if (seen.has(current)) continue;
        seen.add(current);
        stack.push(...(dependenciesOf.get(current) ?? []));
    }
    return false;
}

/** A unique `tempId` for a newly added task, stable and readable. */
export function NextTempId(spec: TaskGraphSpec, prefix = 'task'): string {
    const taken = new Set((spec.tasks ?? []).map((t) => t.tempId));
    let n = (spec.tasks ?? []).length + 1;
    while (taken.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
}
