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

/** Everything running one action for one task node needs. */
export type TaskActionRunParams = {
    TaskID: string;
    ActionID: string;
    /** Structured input from `Task.InputPayload` — for durable entity-action dispatch, the redacted params. */
    InputPayload: unknown;
    /** Outputs of this node's satisfied prerequisites, in the same shape agent nodes receive. */
    DependencyOutputs: Map<string, unknown>;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
};

/** The outcome of one action node. */
export type TaskActionRunResult = {
    Success: boolean;
    Output?: unknown;
    ErrorMessage?: string;
};

/**
 * Runs one action for one task node.
 *
 * The third execution shape, beside agents and people. Abstracted for the same reason
 * {@link TaskAgentRunner} is: the dispatcher must stay unit-testable without standing up the action
 * engine, and this package must not import it — `@memberjunction/actions` depends on the entity
 * layer this one also builds on, and reaching for it here would make every consumer of durable
 * execution load the action engine too.
 *
 * **A host with no action runner is not broken, it is limited.** Action nodes stay Pending on it,
 * which is visible in the Tasks UI, rather than being marked failed — a task nobody in this
 * deployment can run is not the same as a task that ran and did not work.
 */
export type TaskActionRunner = {
    RunActionForTask(params: TaskActionRunParams): Promise<TaskActionRunResult>;
};

/** What happened to a task or a graph, as a closed set a consumer can branch on. */
export type TaskGraphFrameKind =
    /** A task was claimed by an instance and is about to run. */
    | 'TaskStarted'
    /** A task finished successfully. */
    | 'TaskCompleted'
    /** A task failed. `ErrorMessage` says why. */
    | 'TaskFailed'
    /** A task was blocked because a prerequisite failed or became unreachable. */
    | 'TaskBlocked'
    /**
     * A task was NOT TAKEN because another branch of an exclusive fan-out won.
     *
     * Distinct from `TaskBlocked` on purpose: blocked means something went wrong upstream and the
     * viewer should look for a cause; skipped means the workflow chose a different route and there
     * is nothing to investigate. Rendering them the same would send people hunting for bugs that do
     * not exist.
     */
    | 'TaskSkipped'
    /** A human task became actionable and is waiting on its assignee. */
    | 'TaskAwaitingHuman'
    /** Every node has reached a terminal state; `Status` is the graph's rolled-up outcome. */
    | 'GraphSettled';

/**
 * One thing that happened, addressed by the graph it happened in.
 *
 * **Addressed by `ParentTaskID`, deliberately not by session.** A durable graph outlives the tab
 * that submitted it — it may be started by a schedule with no session at all, and a user who
 * refreshes mid-run should still see the rest. Keying on the graph means "watch this workflow run"
 * works for anyone permitted to read it, whenever they arrive.
 *
 * Frames are **semantic, not cache invalidations**: a consumer renders "step 3 of 7 running" from
 * the frame itself rather than re-reading rows and diffing them to guess what changed.
 */
export type TaskGraphFrame = {
    Kind: TaskGraphFrameKind;
    /** The graph this happened in — the subscription key. */
    ParentTaskID: string;
    /**
     * Who the graph belongs to, from the parent's durable metadata.
     *
     * Carried on the frame rather than looked up by the consumer because a consumer's delivery
     * filter runs per frame and synchronously — a database round trip there would make watching a
     * run cost more than running it. Absent means the graph predates ownership being recorded, and
     * a consumer that authorizes on it should fail closed rather than broadcast.
     */
    OwnerUserID?: string | null;
    /** The node it happened to. Absent on `GraphSettled`, which is about the graph itself. */
    TaskID?: string;
    /** Node name, so a consumer can label the frame without loading the row. */
    TaskName?: string;
    /** The task's (or, for `GraphSettled`, the graph's) status after the event. */
    Status?: string;
    /** Failure detail on `TaskFailed`. */
    ErrorMessage?: string;
    /** For a human task, who it is waiting on. */
    AssignedUserID?: string;
    /** How many nodes have reached a terminal state, and out of how many. */
    CompletedCount?: number;
    TotalCount?: number;
};

/**
 * Receives dispatcher lifecycle frames.
 *
 * Optional, and a host that supplies none loses nothing but visibility — the dispatcher's behavior
 * is identical either way. Abstracted for the same reason execution and continuation are: publishing
 * to subscribers is a transport concern, and this package must not acquire a dependency on the
 * transport layer to gain observability.
 *
 * Implementations MUST NOT throw and MUST NOT block: a frame is an announcement about work, never a
 * step of it, so a broken observer must not be able to stall or fail a graph.
 */
export type TaskGraphObserver = {
    OnFrame(frame: TaskGraphFrame): void;
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

    /**
     * How often to look for claimable work.
     *
     * Five seconds is the right production default — a graph's steps are agent runs measured in
     * seconds to minutes, so polling faster buys latency nobody perceives and costs a query per
     * instance per tick. It is configurable rather than fixed because the correct value genuinely
     * differs by host: a test harness driving a graph to completion should not wait five seconds per
     * node, and a deployment running many short tasks may want tighter latency.
     */
    PollIntervalSeconds: number;

    /** How often the reconciliation sweep runs. */
    ReconciliationIntervalSeconds: number;
};

/** Defaults chosen so a heartbeat has several chances to land before a claim lapses. */
export const DEFAULT_DISPATCHER_CONFIG: Omit<TaskGraphDispatcherConfig, 'InstanceID'> = {
    ClaimTTLSeconds: 300,
    HeartbeatIntervalSeconds: 60,
    MaxConcurrentTasks: 5,
    PollIntervalSeconds: 5,
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
