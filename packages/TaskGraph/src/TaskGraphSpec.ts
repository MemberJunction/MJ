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
 * @module @memberjunction/task-graph
 */

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

    /** Agent that executes this node. Mutually exclusive with `assignToUser`. */
    agentName?: string;

    /**
     * Marks this as a human task (Phase 4). Mutually exclusive with `agentName`. Mirrors the
     * `UserID`-xor-`AgentID` constraint the Task table already enforces.
     */
    assignToUser?: boolean;

    /** `tempId`s this node depends on. */
    dependsOn: string[];

    /** Structured input persisted to `Task.InputPayload`. */
    inputPayload?: Record<string, unknown>;
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
