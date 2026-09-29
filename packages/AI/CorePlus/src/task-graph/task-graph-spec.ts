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
import type { AgentDecisionAnswerSummary, AgentDecisionQuestion } from '../agent-decisions';
import type { ForEachOperation } from '../foreach-operation';
import type { WhileOperation } from '../while-operation';

/** A conditional dependency edge. */
export type TaskGraphDependency = {
    /** The `tempId` this node waits for. */
    tempId: string;
    /**
     * The persisted `MJ: Task Dependencies` row ID, when this edge was projected from a run.
     * Presentation and debug only — `Submit` ignores it and writes a new row.
     */
    id?: string;
    /**
     * Boolean expression gating the edge. Omitted means unconditional.
     *
     * A condition that fails to evaluate does NOT open the gate — a malformed expression must never
     * become an accidental `true` — but it is reported distinctly from one that evaluated false, so
     * a graph stalled by a typo cannot be mistaken for one that simply took another branch.
     */
    condition?: string;
    /*
     * WHICH ORIGIN STATUSES DECIDE A CONDITION (settled in Round 3, R3-2):
     *
     *   Complete   — always decides, under either `failureSemantics`.
     *   Failed     — decides ONLY under `failureSemantics: 'edges'`, where a flow's failure handling
     *                IS its outgoing edges. Under `'block'` (the default) the edge is neither
     *                evaluated nor dropped: it stays live so the block cascade traverses it and owns
     *                everything downstream, which is what `'block'` means.
     *   Cancelled  — NEVER decides, under either. A cancelled step did not run, so its guards have
     *                no outcome to describe.
     *   Skipped    — never evaluated; the edge drops. A branch that was not taken does not get a
     *                vote, and evaluating against an empty envelope would let a negated condition
     *                hand its target a satisfied prerequisite.
     *   Pending / In Progress / Deferred — undecided; the edge is kept and the prerequisite gate
     *                keeps the target waiting.
     *
     * `stepResult.step` carries a STATUS WORD (`'Success'` / `'Failed'`), not the step's name —
     * matching what the flow engine actually exposes, which is what the documented condition
     * `stepResult.step === 'Success'` tests against. The step's name is not a condition root on
     * either engine.
     */
    /**
     * How this edge participates in the target's join.
     *
     * `Prerequisite` (the default) is the only value that GATES: the target waits for it. Everything
     * the engine does with joins — eligibility, the skip cascade, the block walk, seed confirmation —
     * asks `isGatingEdge`, and that returns true for `Prerequisite` alone.
     *
     * **`Optional` therefore means "this edge does not make the target wait", not "any one satisfied
     * predecessor is enough".** The doc used to claim the second, which is an OR-join, and the
     * difference is not academic: a node whose incoming edges are ALL `Optional` has no gating edges
     * at all, so it is eligible in wave one — before any of its predecessors has run. It also cannot
     * be rescued by an `Optional` route when an exclusive loser seeds it for skipping, because seed
     * confirmation asks the same question.
     *
     * An OR-join is a coherent thing to want and is NOT implemented. Nothing in the compiler emits
     * `Optional` today, so the gap is latent; implementing it means teaching eligibility that a
     * target with only optional routes waits for the FIRST of them, which is a real semantic change
     * and not a doc fix. Recorded here so the next person reads the code's meaning rather than the
     * intention it was described with.
     *
     * `Corequisite` is likewise non-gating today and carries no scheduling behaviour of its own.
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
export type TaskGraphNodeKind = 'Agent' | 'Action' | 'Human' | 'Prompt' | 'ForEach' | 'While' | 'External' | 'Decision';

/**
 * One question a `Decision` node asks: the LLM-facing shape agents already use for decisions, plus
 * the confidence below which its answer is not acted on.
 */
export type TaskGraphDecisionQuestion = AgentDecisionQuestion & {
    /**
     * Below this confidence (0..1) the answer is not used: every edge whose condition reads it is
     * unevaluable, so an ordinary edge HOLDS and an exclusive group holds rather than guessing.
     *
     * A Choice or Score is measured by its `confidence`. A Likelihood has no separate confidence —
     * its probability is its confidence — so it is measured by how far that probability is from an
     * even call: `max(probability, 1 - probability)`. A confident "no" is as usable as a confident
     * "yes"; a probability near 0.5 is the one that holds.
     *
     * Omitted means every answer is used as given.
     */
    minConfidence?: number;
};

/**
 * What `decisions.<node>.<question>` resolves to in an edge condition.
 *
 * A Likelihood carries `probability` (of yes). A Choice carries the chosen option in `value`; a Score
 * its position from 0 (the lowest level) in `value`. Both carry `confidence` and the full
 * distribution in `probabilities`, keyed by option value or level.
 */
export type TaskGraphDecisionAnswer = AgentDecisionAnswerSummary & {
    /** A Choice's or Score's whole distribution, so a condition can read more than the winner. */
    probabilities?: Record<string, number>;
};

/**
 * The fields each question kind's answer carries — the only ones a condition may read after
 * `decisions.<node>.<question>`. Reading any other field would be `undefined`, which a comparison
 * turns into a silent `false`; the validator refuses it at submit instead.
 */
export const DECISION_ANSWER_FIELDS: Readonly<Record<AgentDecisionQuestion['kind'], readonly string[]>> = {
    Likelihood: ['probability'],
    Choice: ['value', 'confidence', 'probabilities'],
    Score: ['value', 'confidence', 'probabilities'],
};

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
    Human: { assignToUserID?: string; instructions?: string; expiresInHours?: number };
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
    /**
     * A typed judgment, resolved as a STEP so that no condition ever has to make one.
     *
     * The node makes exactly one `AIDecisionRunner` call, which answers every question in
     * `questions` about one state, and writes the answers into its output under
     * `decisions.<tempId>`. Edges then route on them through the `decisions` condition root —
     * `decisions.triage.intent.value === 'billing'`, `decisions.triage.urgent.probability >= 0.8` —
     * as a synchronous expression over facts that already exist. Nothing in condition evaluation
     * calls a model.
     *
     * Every question one fork needs belongs in one node: questions about one state travel together
     * in one call and cost about what one question does. A judgment that needs another step's
     * output goes in a node that depends on that step.
     *
     * A fork whose edges all test one Choice question's `value` is checked at submit for
     * exhaustiveness: it must have a path for every option. An answer below its question's
     * `minConfidence`, or one from a call that failed, makes the edges that read it unevaluable, so
     * they hold rather than read as `false`.
     *
     * **What a `'Decision'` run step means.** When an agent run submitted the graph, the call is also
     * logged on that run as an `AIAgentRunStep` with `StepType 'Decision'`, and the value means
     * exactly this: one typed decision call, a fixed set of Likelihood, Choice or Score questions
     * answered about one state. Its `TargetID` is the decision prompt, `TargetLogID` the call's
     * `MJ: AI Prompt Runs` row, `InputData` the state and questions, and `OutputData` the answers.
     * Some older writers use the value loosely for deterministic bookkeeping (Agent Manager's
     * "Sync Agent Spec", the memory manager's phases, the reranker); new code writes it only for a
     * decision call.
     */
    Decision: {
        /**
         * The `MJ: AI Prompts` row whose model bindings run the decision. Default `Default Decision`,
         * the prompt agent decisions use.
         */
        promptName?: string;
        /**
         * What the questions are about. `payload` is the node's whole input: its own `inputPayload`
         * merged with everything upstream produced. `payload.<path>` is one named value from it,
         * typically an upstream step's output (`payload.ticket`). Default `payload`.
         */
        state?: string;
        /**
         * The questions, all answered in one call. The key is how conditions name the answer
         * (`decisions.<tempId>.<key>`); the model never sees it, so put everything it needs in
         * `instructions` and the option descriptions.
         */
        questions: Record<string, TaskGraphDecisionQuestion>;
    };
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
    Decision: (base: TaskNodeBase, configuration: TaskGraphNodeConfigMap['Decision']): TaskGraphSpecNode<'Decision'> =>
        ({ ...base, kind: 'Decision', configuration }),
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
        | 'InvalidExclusiveGroup'
        /**
         * Every edge of an `exclusiveGroup` tests one Choice question's `value`, and some option has
         * no edge. When the model picks that option every edge loses and the branch ends silently.
         */
        | 'IncompleteFork'
        /**
         * An edge condition cannot be parsed.
         *
         * Syntax only — an unknown identifier is not this error. The condition envelope is dynamic,
         * so whether `payload.x` resolves is a question about a run that has not happened yet;
         * whether `payload.x >` parses is not.
         */
        | 'InvalidCondition';
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
