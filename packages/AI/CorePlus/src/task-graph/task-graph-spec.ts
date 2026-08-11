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
 * **Spec v2 (Track C1.0).** Assignment used to be three flat, mutually-exclusive optional fields
 * (`agentName` / `actionName` / `assignToUser`) plus a validator rule to police the exclusivity.
 * It is now a discriminated union — `kind` selects exactly one `configuration` shape — which makes a
 * conflicting assignment *unrepresentable* rather than merely *rejected*, gives the dispatcher
 * exhaustive `switch` checking (a new kind with no runner fails to compile, not at run time), and
 * lets `ForEach`/`While` reuse the operation contracts CorePlus already defines for all agent types.
 *
 * **There is no v1 compatibility shim, deliberately.** Nothing persists a `TaskGraphSpec` — Task rows
 * are *derived* from one at submit time, and no column stores the spec itself — so the only producers
 * are in-process code and LLM output regenerated on every run. With no stored payload to be
 * compatible with, a dual-accept normaliser would be ceremony that permanently doubled the shape
 * every reader has to reason about. Producers were converted to the union instead; one spec, one
 * shape, no legacy path.
 *
 * @module @memberjunction/ai-core-plus
 */
import type { ForEachOperation } from '../foreach-operation';
import type { WhileOperation } from '../while-operation';

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

    /**
     * Ordering within an exclusive group — higher wins. Default 0.
     *
     * Mirrors `AIAgentStepPath.Priority`, because a flow's sequential traversal picks the
     * highest-priority satisfied edge and that choice has to survive compilation.
     */
    priority?: number;

    /**
     * Deterministic tiebreak when two edges in a group share a `priority`. Default 0, ascending.
     *
     * Without it, equal priorities resolve in whatever order the array happens to be in, and the
     * same graph could take different branches on different machines. A flow's edges get this from
     * the `AIAgentStepPath.Sequence` column.
     */
    sequence?: number;

    /**
     * XOR group key. Sibling edges leaving the same origin that share a non-null `exclusiveGroup`
     * form ONE exclusive fan-out: the highest-priority satisfied edge wins and the losing branches
     * are Skipped.
     *
     * This is what a flow's `sequential` traversal actually is — an exclusive choice resolved at run
     * time, not a chain. A chain would execute branches the author's flow has never executed.
     */
    exclusiveGroup?: string;

    /**
     * Edge routing for a canvas, round-tripped from `AIAgentStepPath.PathPoints`.
     *
     * **Layout only.** The dispatcher ignores it; the validator never requires it. Same rules as
     * {@link TaskGraphSpecNode.layout}.
     */
    pathPoints?: string;
};

/** Normalizes either dependency form to the object form. */
export function NormalizeDependency(dep: string | TaskGraphDependency): TaskGraphDependency {
    return typeof dep === 'string' ? { tempId: dep } : dep;
}

/**
 * What a node is, and therefore which `configuration` shape it carries.
 *
 * Adding a kind is one entry in {@link TaskGraphNodeConfigMap} plus one runner — the compiler then
 * forces every exhaustive `switch` over kinds to be updated, which is the point of the union.
 */
export type TaskGraphNodeKind = 'Agent' | 'Action' | 'Human' | 'Prompt' | 'ForEach' | 'While' | 'External';

/**
 * Per-kind configuration.
 *
 * `ForEach`/`While` reuse {@link ForEachOperation} / {@link WhileOperation} **verbatim**. Those types
 * already exist in CorePlus and are documented as "used by all agent types — Flow agents convert
 * AIAgentStep configuration to this format; Loop agents receive this from LLM responses." The loop
 * *contract* was always universal; only the executor was not. Re-declaring a second loop shape here
 * would be the drift this union exists to end.
 *
 * Note the deliberate asymmetry the operations carry: `ForEachOperation.maxIterations` defaults to
 * 1000, `WhileOperation.maxIterations` to 100. A conditional loop is the one that runs away.
 */
export type TaskGraphNodeConfigMap = {
    Agent: { agentName: string; message?: string; templateParameters?: Record<string, string> };
    Action: { actionName: string; inputMapping?: string; outputMapping?: string };
    Human: { assignToUserID?: string; instructions?: string };
    Prompt: { promptName: string; templateParameters?: Record<string, string> };
    ForEach: ForEachOperation;
    While: WhileOperation;
    /**
     * A node completed by something outside MJ (D21 / parent-plan Phase 9). The runner ships with
     * Phase 9; until then the dispatcher parks it exactly like `Human` — never claimed, sweep-exempt.
     *
     * It is in the union NOW so the first external consumer never sees the flat shape, which is the
     * whole reason the union exists.
     */
    External: { domain: string; ref?: string };
};

/** Per-node execution policy. All optional; absent means the engine's default. */
export type NodeExecutionPolicy = {
    timeoutSeconds?: number;
    retryCount?: number;
    /**
     * What a failure does to dependents. `'fail'` (default) blocks them; `'continue'` releases them.
     *
     * Note for flow-compiled graphs: real flow failure handling is *recovery-path edges*, selected
     * by `failureSemantics: 'edges'` on the spec — not this field. See {@link TaskGraphSpec.failureSemantics}.
     */
    onError?: 'fail' | 'continue';
};

/**
 * Canvas geometry for a node. **Presentation only**, and two rules make that safe:
 *
 * 1. **The dispatcher ignores it entirely.** A graph with no layout executes identically to the same
 *    graph with one. Nothing about scheduling, claiming or ordering may read it.
 * 2. **The validator never requires it.** A producer that has never seen a canvas — an agent
 *    decomposing work at run time, a durable entity-action dispatch — emits valid nodes without it.
 *
 * Every field is optional because most producers have no opinion about geometry at all.
 */
export type NodeLayout = { x?: number; y?: number; width?: number; height?: number };

/** One node in a submitted graph. */
export type TaskGraphSpecNode<K extends TaskGraphNodeKind = TaskGraphNodeKind> = {
    /**
     * Producer-assigned identifier, unique within the submission. Distinct from the persisted
     * `Task.ID`: the producer has no way to know real IDs at authoring time, so edges are expressed
     * in these temporary handles and resolved during persistence.
     */
    tempId: string;

    name: string;
    description: string;

    /** What this node is. Selects the `configuration` shape. */
    kind: K;

    /** Configuration for this node's kind. */
    configuration: TaskGraphNodeConfigMap[K];

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

    /** Per-node execution policy. */
    policy?: NodeExecutionPolicy;

    /** Canvas geometry. Presentation only — see {@link NodeLayout}. */
    layout?: NodeLayout;

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

    /**
     * How a failed node affects the rest of the graph. Default `'block'`.
     *
     * - `'block'` — a failure is terminal for dependents. What a loop-agent decomposition means:
     *   the producer expressed work that has to succeed.
     * - `'edges'` — a failed node's outgoing edges are still evaluated, with the failure visible to
     *   the condition (`stepResult.Success === false`). This is what a **flow** means: recovery paths
     *   are drawn as edges, and the compiler sets this on every flow-compiled spec.
     *
     * Two different authoring models, one engine. Getting this wrong in either direction is severe —
     * `'block'` on a flow silently discards its error handling; `'edges'` on a decomposition runs
     * downstream work the producer intended to be gated on success.
     */
    failureSemantics?: 'block' | 'edges';
};

/**
 * Convenience constructors — the one place a node of each kind is built.
 *
 * Every producer goes through these rather than assembling `{ kind, configuration }` inline, so the
 * pairing of a kind with its configuration shape has exactly one definition. TypeScript enforces the
 * pairing, but a helper also makes the call sites read as intent rather than as structure.
 */
export const TaskNode = {
    Agent: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['Agent']): TaskGraphSpecNode<'Agent'> =>
        ({ ...base, kind: 'Agent', configuration }),
    Action: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['Action']): TaskGraphSpecNode<'Action'> =>
        ({ ...base, kind: 'Action', configuration }),
    Human: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['Human'] = {}): TaskGraphSpecNode<'Human'> =>
        ({ ...base, kind: 'Human', configuration }),
    Prompt: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['Prompt']): TaskGraphSpecNode<'Prompt'> =>
        ({ ...base, kind: 'Prompt', configuration }),
    ForEach: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['ForEach']): TaskGraphSpecNode<'ForEach'> =>
        ({ ...base, kind: 'ForEach', configuration }),
    While: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['While']): TaskGraphSpecNode<'While'> =>
        ({ ...base, kind: 'While', configuration }),
    External: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['External']): TaskGraphSpecNode<'External'> =>
        ({ ...base, kind: 'External', configuration }),
} as const;

/** Everything a node needs that is not its kind or configuration. */
export type TaskNodeBase = Omit<TaskGraphSpecNode, 'kind' | 'configuration'>;

/** Reads a node's configuration at its own kind, with the narrowing done once. */
export function ConfigOf<K extends TaskGraphNodeKind>(
    node: TaskGraphSpecNode,
    kind: K,
): TaskGraphNodeConfigMap[K] | null {
    return node.kind === kind ? (node.configuration as TaskGraphNodeConfigMap[K]) : null;
}

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
        /** A node with no `kind` — nothing would execute it. */
        | 'NoAssignment'
        | 'TooManyTasks'
        /** `kind` names something this build has no configuration shape for. */
        | 'UnknownKind'
        /** The `configuration` bag is missing a field its `kind` requires. */
        | 'InvalidConfiguration'
        /** Members of one `exclusiveGroup` do not all leave the same origin. */
        | 'InvalidExclusiveGroup';
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
