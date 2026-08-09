/**
 * @fileoverview The DAG contract every producer authors against.
 *
 * Per D16 there is exactly ONE fully-qualified TypeScript shape for a task graph, shared by the
 * Loop-agent primitive (Phase 3), deterministic code, a future manual workflow UI, and stored
 * workflow definitions. There is deliberately no looser "internal" shape: `TaskGraphService.Submit`
 * validates against this same contract server-side, so a graph that passes client-side validation
 * cannot fail a different check on submit.
 *
 * The `Spec` suffix follows `AgentSpec` — it memorializes a graph rather than merely requesting
 * execution, which is what makes Save as Workflow (D17) possible later.
 *
 * @module @memberjunction/ai-core-plus
 */

/** A conditional dependency edge. */
export type TaskGraphDependency = {
    /** The `tempId` this node waits for. */
    tempId: string;
    /**
     * Boolean expression gating the edge. Omitted means unconditional.
     *
     * A condition that fails to evaluate does NOT open the gate — a malformed expression must never
     * become an accidental `true` — but it is reported distinctly from one that evaluated false, so
     * a graph stalled by a typo cannot be mistaken for one that simply took another branch.
     */
    condition?: string;
    /**
     * How this edge participates in the target's join. `Prerequisite` (the default) means the target
     * waits for it; `Optional` means any one satisfied predecessor is enough; `Corequisite` means
     * co-scheduled.
     */
    dependencyType?: 'Prerequisite' | 'Corequisite' | 'Optional';
};

/** Normalizes either dependency form to the object form. */
export function NormalizeDependency(dep: string | TaskGraphDependency): TaskGraphDependency {
    return typeof dep === 'string' ? { tempId: dep } : dep;
}

/** One node in a submitted graph. */
export type TaskGraphSpecNode = {
    /**
     * Producer-assigned identifier, unique within the submission. Distinct from the persisted
     * `Task.ID`: the producer has no way to know real IDs at authoring time, so edges are expressed
     * in these temporary handles and resolved during persistence.
     */
    tempId: string;

    name: string;
    description: string;

    /** Agent that executes this node. Mutually exclusive with `assignToUser` and `actionName`. */
    agentName?: string;

    /**
     * Action that executes this node. Mutually exclusive with `agentName` and `assignToUser`.
     *
     * The third assignment shape, added for durable After* entity-action dispatch (D14): "run this
     * action durably, with restart recovery" is a single-node graph, not a new queue. Named rather
     * than identified by ID for the same reason `agentName` is — a producer authoring a graph knows
     * names, and resolution to an ID is the service's job.
     */
    actionName?: string;

    /**
     * Marks this as a human task (Phase 4). Mutually exclusive with `agentName` and `actionName`.
     * Mirrors the assignment exclusivity the Task table enforces.
     */
    assignToUser?: boolean;

    /**
     * What this node waits for.
     *
     * A bare `tempId` is an unconditional dependency — wait for that node, then run. The object form
     * adds a condition, so the edge is only live when the expression holds; that is what lets a
     * runtime graph express "run the escalation step only if the analysis found a problem" without
     * a separate branching concept.
     *
     * The condition grammar is the same one design-time flow edges use (`AIAgentStepPath.Condition`),
     * evaluated by the same shared engine. Keeping them identical is what makes Save as Workflow a
     * projection rather than a translation.
     */
    dependsOn: Array<string | TaskGraphDependency>;

    /** Structured input persisted to `Task.InputPayload`. */
    inputPayload?: Record<string, unknown>;

    /**
     * Where this node sits on a canvas. **Presentation only.**
     *
     * Two rules make this safe to carry in an execution contract, and both are load-bearing:
     *
     * 1. **The dispatcher ignores it entirely.** Nothing about scheduling, claiming or ordering may
     *    read this field. A graph with no layout executes identically to the same graph with one.
     * 2. **The validator never requires it.** A producer that has never seen a canvas — an agent
     *    decomposing work at run time, a durable entity-action dispatch — emits nodes without it,
     *    and those graphs are fully valid.
     *
     * It exists because a spec is otherwise the *only* record of a graph the author is drawing.
     * A saved workflow's geometry has a home already (`AIAgentStep.PositionX/PositionY/Width/Height`),
     * but a draft, an agent-emitted graph, or a spec in flight over the wire has none — so without
     * this the canvas has to re-run auto-layout every time it re-projects, which throws away the
     * author's arrangement and (because auto-layout ends in zoom-to-fit) yanks their viewport.
     *
     * Lower-case keys to match the rest of this contract, not the canvas's `FlowPosition`.
     */
    layout?: TaskGraphNodeLayout;
};

/**
 * Canvas geometry for a node. Presentation only — see the rules on {@link TaskGraphSpecNode.layout}.
 *
 * `width`/`height` are optional because most producers have no opinion about size; the canvas
 * supplies its own defaults, and a node that omits them renders exactly as it always has.
 */
export type TaskGraphNodeLayout = {
    x: number;
    y: number;
    width?: number;
    height?: number;
};

/** A complete, submittable task graph. */
export type TaskGraphSpec = {
    workflowName: string;

    /** Why the producer decomposed the work this way — persisted as the parent's description. */
    reasoning?: string;

    tasks: TaskGraphSpecNode[];

    /**
     * What happens when the graph finishes. Default `'message'`.
     *
     * - `message` — post results into the conversation
     * - `reinvoke` — start a new turn for the submitting agent with the outcome (Phase 3)
     * - `none` — terminate silently
     */
    continuation?: 'message' | 'reinvoke' | 'none';

    /**
     * Forces durable execution even for a graph that would otherwise constant-fold to an in-run
     * step (D9). The escape hatch for "I want a Task row and a dispatcher hop regardless."
     */
    durable?: boolean;
};

/** One reason a spec was rejected. */
export type TaskGraphValidationError = {
    /** Machine-readable so callers (and LLM correctives) can branch without parsing prose. */
    Code:
        | 'EmptyGraph'
        | 'MissingWorkflowName'
        | 'DuplicateTempId'
        | 'MissingTempId'
        | 'UnknownDependency'
        | 'SelfDependency'
        | 'CycleDetected'
        | 'AssignmentConflict'
        | 'NoAssignment'
        | 'TooManyTasks';
    Message: string;
    /** The offending node, when the error is attributable to one. */
    TempId?: string;
};

export type TaskGraphValidationResult = {
    Valid: boolean;
    Errors: TaskGraphValidationError[];
};

/**
 * Maximum nodes in a single submitted graph.
 *
 * Matches `scratchpadMaxTasks` so an agent that can hold N items in its scratchpad cannot submit
 * a graph larger than it can reason about. Also bounds the blast radius of a runaway producer.
 */
export const MAX_TASKS_PER_GRAPH = 50;
