/**
 * @fileoverview Contracts for task-graph submission and durable execution.
 * @module @memberjunction/task-graph
 */
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * Mints a fresh metadata/data provider.
 *
 * The dispatcher runs outside any HTTP request and executes tasks concurrently, so it must never
 * share one provider — and therefore one transaction scope — across parallel work. Rather than
 * import MJServer (which would invert the dependency: MJServer depends on this package, not the
 * reverse), the host supplies a factory. MJServer's implementation wraps the same
 * `createPerRequestProviders` machinery that already mints a provider per request over the shared
 * connection pool, which is proven cheap at request scale.
 *
 * Contract: every call returns a provider safe to use on its own transaction scope. Callers are
 * responsible for nothing beyond using it — pooling and lifetime are the host's concern.
 */
export type ProviderFactory = {
    CreateProvider(): Promise<IMetadataProvider>;
};

/**
 * Runs one agent for one task node.
 *
 * Abstracted rather than taking `AgentRunner` directly so the dispatcher can be unit-tested without
 * standing up the agent framework, and so a host with a different execution strategy (a queue, a
 * remote worker) can supply its own.
 */
export type TaskAgentRunner = {
    RunAgentForTask(params: TaskAgentRunParams): Promise<TaskAgentRunResult>;
};

/** Everything an executor needs to run a single task node. */
export type TaskAgentRunParams = {
    /** The task row being executed. */
    TaskID: string;
    /** Agent assigned to the task. */
    AgentID: string;
    /** Parsed `Task.InputPayload`, if any. */
    InputPayload: unknown;
    /** Parsed `OutputPayload` of each completed dependency, keyed by that task's ID. */
    DependencyOutputs: Map<string, unknown>;
    /** Provider minted for this task alone — never shared with a sibling. */
    Provider: IMetadataProvider;
    /** User the work runs as. */
    ContextUser: UserInfo;
};

/** Outcome of running one task node. */
export type TaskAgentRunResult = {
    Success: boolean;
    /** Structured output to persist to `Task.OutputPayload`. */
    Output?: unknown;
    /** Failure detail to persist to `Task.ErrorMessage`. */
    ErrorMessage?: string;
    /** The `MJ: AI Agent Runs` row that executed this task, for `Task.AgentRunID`. */
    AgentRunID?: string;
};

/**
 * Delivers a finished graph's outcome, per its `continuation` mode.
 *
 * Abstracted for the same reason agent execution is: the dispatcher knows *when* a graph has
 * settled and *what* it produced, but posting into a conversation and starting a fresh agent turn
 * are host concerns. Injecting them keeps this package free of both the conversation layer and the
 * agent framework — a dependency on the latter would be circular, since agents submit graphs.
 *
 * A host that implements neither still gets correct behavior: the dispatcher logs the outcome and
 * marks it delivered, so a graph never silently repeats its completion.
 */
export type TaskContinuationDeliverer = {
    /** Posts the results into the conversation the graph answers. */
    PostMessage(params: TaskContinuationParams): Promise<void>;
    /**
     * Starts the submitting agent a fresh turn carrying the outcome.
     *
     * Optional: a host with no agent framework loaded (a worker, a test) legitimately cannot do
     * this, and the dispatcher degrades to `PostMessage` rather than dropping the completion.
     */
    Reinvoke?(params: TaskContinuationParams): Promise<void>;
};

/** Everything a continuation needs to say what happened. */
export type TaskContinuationParams = {
    ParentTaskID: string;
    WorkflowName: string;
    /** Conversation the graph answers, when it came from a conversational channel. */
    ConversationDetailID: string | null;
    /** The agent run that emitted the graph — the target of a `reinvoke`. */
    SubmittedByAgentRunID: string | null;
    /** How many continuation hops preceded this one, so a re-submitted graph can carry depth + 1. */
    ReinvokeDepth: number;
    /**
     * Per-task outcome. Deliberately carries a `summary` and an `outputRef`, not inline payloads —
     * a ten-task graph's full outputs would swamp the continuation turn's context window, and the
     * agent can pull what it actually needs by task ID.
     */
    Tasks: Array<{
        TaskID: string;
        Name: string;
        Status: string;
        Summary?: string;
        ErrorMessage?: string;
    }>;
    /** One-line human-readable roll-up. */
    Summary: string;
};

/** Tuning knobs for the durable dispatcher. */
export type TaskGraphDispatcherConfig = {
    /**
     * Identifies this dispatcher instance in `Task.ClaimedBy`. Must be stable for the process
     * lifetime and distinct per instance — it is what lets reconciliation tell "my orphaned work"
     * from "another instance's live work".
     */
    InstanceID: string;

    /**
     * How long a claim is honored before reconciliation may reclaim the task.
     *
     * Generous by default: the cost of a too-short TTL is a *duplicate execution* (a healthy but
     * slow task gets reclaimed while still running), whereas the cost of a too-long TTL is merely
     * delayed recovery after a crash. Long-running tasks extend it by heartbeat, so the TTL only
     * has to exceed the heartbeat interval by a comfortable margin.
     */
    ClaimTTLSeconds: number;

    /** How often an in-flight task extends its own claim. Must be well below `ClaimTTLSeconds`. */
    HeartbeatIntervalSeconds: number;

    /** Maximum tasks executed concurrently by this instance. */
    MaxConcurrentTasks: number;

    /** How often the reconciliation sweep runs. */
    ReconciliationIntervalSeconds: number;
};

/** Defaults chosen so a heartbeat has several chances to land before a claim lapses. */
export const DEFAULT_DISPATCHER_CONFIG: Omit<TaskGraphDispatcherConfig, 'InstanceID'> = {
    ClaimTTLSeconds: 300,
    HeartbeatIntervalSeconds: 60,
    MaxConcurrentTasks: 5,
    ReconciliationIntervalSeconds: 120,
};

/** Why a reconciliation sweep touched a task — logged loudly, never silently corrected. */
export type ReconciliationAction =
    | 'ExpiredClaimReleased'
    | 'OrphanedInProgressReleased'
    | 'StaleClaimCleared';

/** One normalization the sweep performed. */
export type ReconciliationEvent = {
    TaskID: string;
    Action: ReconciliationAction;
    Detail: string;
};
