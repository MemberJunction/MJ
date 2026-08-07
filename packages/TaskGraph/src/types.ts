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
