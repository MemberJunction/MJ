/**
 * @fileoverview Durable, host-agnostic execution of submitted task graphs.
 *
 * The dispatcher is what makes task graphs survive things the old client-driven path could not: a
 * page reload, the submitting agent run ending, a server restart, or a second server instance
 * running the same table. It polls for claimable work, claims atomically, executes with a fresh
 * provider per task, and reconciles orphaned state on a timer.
 *
 * **What it deliberately does not do.** It does not decide graph semantics. Eligibility, failure
 * propagation, parent rollup and stall detection all come from the pure algorithms in
 * `@memberjunction/ai-core-plus` — the same functions the in-run executor consumes. That is
 * the whole reason those were factored out dependency-free: the in-run executor and the durable
 * executor cannot drift apart if neither owns the rules.
 *
 * **Host-agnostic by construction.** Provider minting and agent execution arrive as injected
 * dependencies (`ProviderFactory`, `TaskAgentRunner`), so this package never imports MJServer. The
 * dependency runs MJServer -> task-graph, never the reverse.
 *
 * @module @memberjunction/task-graph
 */
import {
    ComputeEligibleTasks,
    ComputeParentRollup,
    ComputeTasksToBlock,
    IsGraphStalled,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphNodeStatus,

    ResolveExclusiveGroups,
    type EdgeConditionOutcome,

    ComputeSkipCascade,
    ConfirmSkipSeeds,
    LayoutGraphNodes,
    type GraphLayoutEdge,
    ApplyOutputMapping,
    BuildMappedInput,
    ResolveMappedInput,
    type ForEachOperation,
    type WhileOperation,

    LoadAgentRunTree,
    SumAgentRunTreeCost,
    WalkAgentRunTree,
    type AgentRunTreeNode,
} from '@memberjunction/ai-core-plus';
import { IMetadataProvider, IRunQueryProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { IShutdownable, ShutdownRegistry, UUIDsEqual } from '@memberjunction/global';
import { MJTaskEntity, MJTaskDependencyEntity, MJAIAgentRunEntity, MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import type { MJTaskEntity_ITaskStepConfiguration, MJTaskEntity_ITaskLoopIteration } from '@memberjunction/core-entities';
import { TaskClaimStore } from './TaskClaimStore';
import { DispatcherConditionEvaluator } from './DispatcherConditionEvaluator';
import { RunForEachLoop, RunWhileLoop, type LoopBodyInvoker } from './TaskLoopExecutor';
import { NotificationEngine } from '@memberjunction/notifications';

/** Metadata-seeded notification type for human tasks (metadata/notifications/.task-assignment-type.json). */
const HUMAN_TASK_NOTIFICATION_TYPE = 'Task Assignment';

/**
 * Statuses a graph parent has stopped moving from.
 *
 * Shared by the guarded terminal write and the unsettled-graph sweep, so "terminal" means exactly
 * one thing in both — the two disagreeing is how a graph becomes invisible to the machinery that is
 * supposed to rescue it.
 */
const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(['Complete', 'Failed', 'Cancelled', 'Skipped']);

/**
 * How far back the steady-state sweep looks for a graph that reached terminal without settling.
 *
 * Bounds the scan without bounding recovery: `__mj_UpdatedAt` advances on every settle attempt, so a
 * graph actively being retried never ages out. What ages out is a graph nothing has touched for a
 * day — abandonment, not age.
 */
const UNSETTLED_SWEEP_WINDOW_HOURS = 24;

/**
 * The window used ONCE at startup, mirroring what claim reconciliation already does.
 *
 * The realistic producer of a >24h-stale unsettled graph is the dispatcher itself being down — an
 * outage or a long maintenance window — which is exactly P3's crash scenario at a larger scale.
 * Under the steady-state window alone those runs would stay `Paused` forever, invisibly.
 */
const UNSETTLED_STARTUP_WINDOW_HOURS = 24 * 30;

/**
 * Written to a human task's `ClaimedBy` once its assignee has been told it is ready.
 *
 * A human task has no executor, so the claim column is otherwise unused — which makes it the natural
 * place to record a fact that must survive a restart. Reconciliation already exempts human tasks
 * from reclamation, so this value is never mistaken for a live claim.
 */
const HUMAN_TASK_NOTIFIED_MARKER = '__human-notified__';

/**
 * The run-query capability of a provider, when it has one.
 *
 * `IMetadataProvider` does not extend `IRunQueryProvider`, but every provider that ships implements
 * both. Narrowing by CAPABILITY rather than casting states that honestly: a provider that genuinely
 * cannot run queries returns undefined and the caller reports it, instead of the call failing later
 * behind a type assertion that claimed it could.
 */
function asRunQueryProvider(provider: IMetadataProvider): IRunQueryProvider | undefined {
    const candidate = provider as unknown as Partial<IRunQueryProvider>;
    return typeof candidate.RunQuery === 'function' ? (candidate as IRunQueryProvider) : undefined;
}
import { IsReinvokeCapReached, MAX_REINVOKE_DEPTH, ParseTaskGraphParentMetadata, type TaskGraphParentMetadata } from './TaskGraphService';
import {
    DEFAULT_DISPATCHER_CONFIG,
    ProviderFactory,
    TaskActionRunner,
    TaskAgentRunner,
    TaskPromptRunner,
    TaskGraphDispatcherConfig,
    type TaskContinuationDeliverer,
    type TaskContinuationParams,
    type TaskGraphFrame,
    type TaskGraphObserver,
} from './types';

/**
 * What running one task body produced.
 *
 * `ChatMessage` is the odd one out and belongs here rather than in a runner-specific type: a prompt
 * node can decide the workflow is finished and say so, and the dispatcher has to act on that after
 * the body returns — skipping what remains rather than treating an early finish as abandoned work.
 */
type TaskBodyOutcome = {
    Success: boolean;
    Output?: unknown;
    ErrorMessage?: string;
    AgentRunID?: string | null;
    ChatMessage?: string;
    /**
     * The prompt run a Prompt step produced.
     *
     * An Agent step's cost is reachable through `AgentRunID`; a Prompt step has no agent run, so
     * without this its spend has no path back from the Task and a run-tree cost rollup silently
     * omits it. Recorded into the step's `Configuration.runtime` when the outcome is written.
     */
    PromptRunID?: string;
    /** The action execution log an Action step produced — the action's answer to PromptRunID. */
    ActionLogID?: string;
    /**
     * One entry per pass, for a loop step.
     *
     * A loop's passes are the only work in a graph that produces runs nothing links back to: the
     * run tree traverses six relationships and an iteration is none of them, and `ParentRunID`
     * records parentage without being a link the tree follows. Recorded into the step's
     * `Configuration.runtime` so the passes become reachable — for the timeline, and for the
     * settlement rollup that was under-counting every loop-bearing workflow.
     */
    Iterations?: MJTaskEntity_ITaskLoopIteration[];
    /**
     * The resolved payload this step STARTED from — dependencies' outputs merged with its authored
     * input.
     *
     * Returned from the body rather than recomputed at the call site because the body is the only
     * place that knows it: the merge happens inside `runTaskBody`, and a caller reconstructing it
     * would be a second implementation of the same rule, free to drift.
     */
    PayloadAtStart?: Record<string, unknown>;
};

/** What a task's position in its graph tells the runner: how deep, and who submitted it. */
type GraphContext = {
    Depth: number;
    SubmittingAgentRunID: string | null;
};

/**
 * Renders a loop's bindings as template values.
 *
 * Template parameters are strings; an item is usually an object. Objects are JSON-encoded rather
 * than dropped, because `{{ field }}` printing `[object Object]` — or nothing at all — is exactly
 * the silent failure this exists to prevent.
 */
function stringifyBindings(bindings: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(bindings)) {
        out[key] = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
    return out;
}

/**
 * How much of a loop's per-pass payloads may be kept, and what happens when that runs out.
 *
 * **Why a budget exists at all.** A loop's trace lives inside one `Configuration` column, and its
 * size is the product of two things nobody bounds: how many passes the loop runs, and how large the
 * body's input and output are. A hundred-pass loop over documents would put megabytes in a column
 * that the run tree, the timeline, the canvas and the Workflows list all read — punishing every
 * reader of the row for a detail only someone inspecting one pass will ever open.
 *
 * **What it protects.** Only the payloads. `promptRunID` / `agentRunID` / `actionLogID` / `success`
 * are always recorded: those point at the durable rows where the real forensics live, and they are
 * what cost roll-up and the timeline traverse. Losing a payload costs a reader some detail; losing a
 * pointer would lose the pass.
 *
 * **Omission is stated, never silent.** Once the budget is spent, further passes record a marker
 * saying so and how large the value was, because a pass showing nothing is indistinguishable from a
 * pass that produced nothing — and that ambiguity is exactly the failure this whole area keeps
 * hitting.
 */
const ITERATION_PAYLOAD_BUDGET_BYTES = 128 * 1024;

/** Per-value cap, so one enormous pass cannot consume the whole budget by itself. */
const ITERATION_PAYLOAD_VALUE_BYTES = 16 * 1024;

class IterationPayloadBudget {
    private spent = 0;

    /**
     * The value if it fits, or a marker describing what was left out.
     *
     * @returns the value, a marker object, or undefined when there was nothing to record
     */
    public Take(value: unknown): Record<string, unknown> | undefined {
        if (value == null) return undefined;
        const asRecord = value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : { value };

        let size: number;
        try {
            size = JSON.stringify(asRecord)?.length ?? 0;
        } catch {
            // Circular or otherwise unserializable. It could not be persisted anyway, and saying so
            // is better than a pass that silently shows nothing.
            return { __omitted: 'unserializable' };
        }

        if (size > ITERATION_PAYLOAD_VALUE_BYTES) {
            return { __omitted: 'too-large', __bytes: size, __limit: ITERATION_PAYLOAD_VALUE_BYTES };
        }
        if (this.spent + size > ITERATION_PAYLOAD_BUDGET_BYTES) {
            return { __omitted: 'budget-exhausted', __bytes: size, __limit: ITERATION_PAYLOAD_BUDGET_BYTES };
        }
        this.spent += size;
        return asRecord;
    }
}

/** Deep-merges a prompt's JSON response into the payload, preserving what earlier steps established. */
function deepMergePayload(
    base: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(incoming)) {
        const existing = out[key];
        const bothPlainObjects =
            existing && typeof existing === 'object' && !Array.isArray(existing) &&
            value && typeof value === 'object' && !Array.isArray(value);
        out[key] = bothPlainObjects
            ? deepMergePayload(existing as Record<string, unknown>, value as Record<string, unknown>)
            : value;
    }
    return out;
}

/** A graph's children + edges, in both algorithm shape and mutable-entity shape. */
type GraphState = {
    nodes: TaskGraphNode[];
    edges: TaskGraphEdge[];
    entityById: Map<string, MJTaskEntity>;
    /**
     * Tasks whose only route in was a condition that evaluated definitively false — the branch was
     * not taken, so they can never legitimately run.
     */
    unreachableTaskIDs: Set<string>;
    /**
     * Targets of a LOSING exclusive edge. These become `Skipped`, not `Blocked` — a branch that was
     * not taken is a normal outcome, and blocking it would poison the parent rollup.
     */
    skipSeedTaskIDs: Set<string>;
    /**
     * Targets of an UNDECIDED exclusive group (some condition could not be evaluated). Neither run
     * nor skipped: held, so a typo stalls visibly instead of firing every branch of a fork.
     */
    holdTaskIDs: Set<string>;
    /**
     * Failed tasks whose failure was HANDLED — they have a satisfied outgoing edge, so the workflow
     * drew a route out of the failure and that route should be followed.
     *
     * Only populated under `failureSemantics: 'edges'`. Empty under `'block'`, where a failure is
     * terminal for everything downstream regardless of what was drawn.
     */
    handledFailureIDs: Set<string>;
};

/**
 * Statuses at which an origin's outgoing conditions may be decided.
 *
 * `Skipped` is included: a branch that was not taken IS settled, and a condition on an edge leaving
 * it should resolve rather than hang the graph forever.
 */
const TERMINAL_FOR_CONDITIONS: ReadonlySet<MJTaskEntity['Status']> = new Set<MJTaskEntity['Status']>([
    'Complete', 'Failed', 'Cancelled', 'Skipped',
]);

export class TaskGraphDispatcher implements IShutdownable {
    private readonly config: TaskGraphDispatcherConfig;
    private readonly claims: TaskClaimStore;

    /**
     * Edges already reported as unevaluable, so the report is once per transition and not once per
     * poll. Per-instance and in-memory by design: a restart re-reports, which is the right amount of
     * noise for a condition that is still broken after a restart.
     */
    private readonly reportedUnevaluableConditions = new Set<string>();
    private readonly conditionEvaluator: DispatcherConditionEvaluator;

    private running = false;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private reconcileTimer: ReturnType<typeof setInterval> | null = null;
    /** Tasks this instance is currently executing — bounds concurrency and drives heartbeats. */
    private readonly inFlight = new Set<string>();
    /** Guards against a slow poll overlapping the next tick. */
    private polling = false;

    /** Graph → owning user, from the parent's durable metadata. Ownership never changes, so this never goes stale. */
    private readonly ownerByParentID = new Map<string, string | null>();

    constructor(
        private readonly providerFactory: ProviderFactory,
        private readonly agentRunner: TaskAgentRunner,
        private readonly contextUser: UserInfo,
        config: Partial<TaskGraphDispatcherConfig> & Pick<TaskGraphDispatcherConfig, 'InstanceID'>,
        /**
         * Optional. Absent means a host that cannot post messages or start agent turns — a worker,
         * a test. The dispatcher still records and logs every completion, so a graph's outcome is
         * never lost; it simply is not announced.
         */
        private readonly continuationDeliverer?: TaskContinuationDeliverer,
        /**
         * Optional. Absent means nobody is watching — the dispatcher behaves identically, it just
         * announces nothing.
         */
        private readonly observer?: TaskGraphObserver,
        /**
         * Optional. Absent means this host cannot run action nodes; they stay Pending and visible
         * rather than being failed, because "nobody here can run this" is not "this ran and broke".
         */
        private readonly actionRunner?: TaskActionRunner,
        /**
         * Optional. Absent means this host cannot run prompt nodes; they stay Pending and visible
         * rather than being failed, for the same reason action nodes do.
         */
        private readonly promptRunner?: TaskPromptRunner,
    ) {
        this.config = { ...DEFAULT_DISPATCHER_CONFIG, ...config };
        this.claims = new TaskClaimStore(this.config.InstanceID, this.config.ClaimTTLSeconds);
        this.conditionEvaluator = new DispatcherConditionEvaluator();
    }

    /**
     * Announce something that happened, and never let the announcement matter.
     *
     * A frame is commentary on work, never a step of it, so an observer that throws must not be able
     * to fail a task or stall a graph. Swallowing here rather than asking every implementation to be
     * careful means one place enforces it.
     */
    private emit(frame: TaskGraphFrame): void {
        if (!this.observer) return;
        try {
            this.observer.OnFrame(frame);
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Observer threw on ${frame.Kind} (ignored): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Who a graph belongs to, memoized for the process's lifetime.
     *
     * Read from the parent's durable metadata rather than a column, because `Task.UserID` means
     * "the person this task is waiting on" — setting it on a parent would make every graph look
     * like a human task. Memoized because frames are emitted per step: without the cache, watching
     * a run would cost one query per event, and observability that scales with work is the thing a
     * push mechanism exists to avoid. Ownership never changes for a given graph, so the cache can
     * never go stale.
     *
     * Skipped entirely when nobody is observing — the lookup exists only to address frames.
     */
    private async resolveOwner(provider: IMetadataProvider, parentTaskID: string): Promise<string | null> {
        if (!this.observer) return null;

        const cached = this.ownerByParentID.get(parentTaskID);
        if (cached !== undefined) return cached;

        let owner: string | null = null;
        try {
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (await parent.Load(parentTaskID)) {
                owner = this.readParentMetadata(parent).submittedByUserID ?? null;
            }
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Could not resolve owner for graph ${parentTaskID}: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.ownerByParentID.set(parentTaskID, owner);
        return owner;
    }

    /**
     * Begins dispatching.
     *
     * Runs reconciliation FIRST, before accepting any new work. On a restart this instance may be
     * looking at tasks its own previous incarnation claimed and never released — reclaiming those
     * up front is what turns a crash from "work stranded forever" into "work resumes".
     */
    public async Start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        // Self-register rather than make each host remember to stop us. A dispatcher that keeps
        // polling through a graceful shutdown would claim work the process is about to abandon,
        // which is exactly the orphaned-claim state reconciliation exists to clean up.
        ShutdownRegistry.Instance.Register(this);

        LogStatus(`[TaskGraphDispatcher] Starting as instance '${this.config.InstanceID}'.`);
        await this.Reconcile();
        // One wide pass over graphs that reached terminal without settling, mirroring what claim
        // reconciliation above already does for tasks. The realistic producer of a >24h-stale
        // unsettled graph is this process having been DOWN — an outage, a long deploy — which the
        // steady-state window cannot see and which would otherwise leave those runs parked forever.
        await this.sweepUnsettledGraphs(UNSETTLED_STARTUP_WINDOW_HOURS);

        this.pollTimer = setInterval(() => { void this.pollOnce(); }, this.config.PollIntervalSeconds * 1000);
        this.reconcileTimer = setInterval(
            () => { void this.Reconcile(); },
            this.config.ReconciliationIntervalSeconds * 1000,
        );
    }

    /**
     * Stops accepting new work and waits for in-flight tasks to finish.
     *
     * Deliberately does NOT release claims on the way out: an abandoned claim expires on its own,
     * and releasing eagerly would hand a still-running task to another instance mid-execution.
     * Letting the TTL do it is the safer failure mode.
     */
    public async Stop(): Promise<void> {
        this.running = false;
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
        if (this.reconcileTimer) { clearInterval(this.reconcileTimer); this.reconcileTimer = null; }

        const deadline = Date.now() + 30_000;
        while (this.inFlight.size > 0 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 250));
        }
        if (this.inFlight.size > 0) {
            LogError(`[TaskGraphDispatcher] Stopped with ${this.inFlight.size} task(s) still in flight; their claims will expire.`);
        }
        LogStatus(`[TaskGraphDispatcher] Stopped.`);
    }

    /** Name shown in the shutdown drain log. */
    public readonly ShutdownName = 'TaskGraphDispatcher';

    /** {@link IShutdownable} — idempotent by way of `Stop`'s `running` guard. */
    public async Shutdown(): Promise<void> {
        await this.Stop();
    }

    /**
     * Reclaims expired claims and reports anomalies.
     *
     * Also enforces the two schema promises that previously had no enforcer anywhere: agent tasks
     * left `In Progress` with no claim are surfaced loudly rather than silently corrected, since
     * that shape indicates tampering or a bug and Record Changes already carries the audit trail.
     */
    public async Reconcile(): Promise<void> {
        let provider: IMetadataProvider | null = null;
        try {
            provider = await this.providerFactory.CreateProvider();
            const released = await this.claims.ReleaseExpiredClaims(provider, this.contextUser);
            const orphaned = await this.claims.FindOrphanedInProgress(provider, this.contextUser);
            if (released.length > 0 || orphaned.length > 0) {
                LogStatus(
                    `[TaskGraphDispatcher] Reconciliation: ${released.length} expired claim(s) released, ` +
                    `${orphaned.length} orphaned task(s) reported.`,
                );
            }
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Reconciliation failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * One dispatch pass: find claimable work, claim what fits under the concurrency cap, execute.
     *
     * Overlap-guarded — a pass that runs long simply skips the next tick rather than stacking, which
     * would otherwise let a slow database multiply in-flight work past the cap.
     */
    private async pollOnce(): Promise<void> {
        if (!this.running || this.polling) return;
        const capacity = this.config.MaxConcurrentTasks - this.inFlight.size;
        if (capacity <= 0) return;

        this.polling = true;
        try {
            const provider = await this.providerFactory.CreateProvider();

            // Settle graphs before picking new work, so a failure earlier in this pass stops its
            // branch immediately rather than after another wave has already launched.
            await this.propagateAndRollup(provider);

            const candidates = await this.findClaimableTasks(provider, capacity);
            for (const task of candidates) {
                if (this.inFlight.size >= this.config.MaxConcurrentTasks) break;
                if (!(await this.claims.TryClaim(provider, task.ID, this.contextUser))) {
                    // Another instance won the race, or the task is no longer Pending. Normal.
                    continue;
                }
                this.inFlight.add(task.ID);
                // Intentionally not awaited — the poll loop must keep dispatching while this runs.
                void this.executeClaimed(task.ID).finally(() => this.inFlight.delete(task.ID));
            }
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Poll failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.polling = false;
        }
    }

    /**
     * Executes one claimed task on its own provider, heartbeating until it settles.
     *
     * A fresh provider per task is the point of `ProviderFactory`: parallel tasks must not share a
     * transaction scope or entity instances, or one task's work becomes visible inside another's.
     */
    private async executeClaimed(taskID: string): Promise<void> {
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        try {
            const provider = await this.providerFactory.CreateProvider();

            const task = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (!(await task.Load(taskID))) {
                LogError(`[TaskGraphDispatcher] Claimed task ${taskID} could not be loaded.`);
                return;
            }

            heartbeat = setInterval(() => {
                void this.claims.Heartbeat(provider, taskID, this.contextUser).then((ok) => {
                    if (!ok) {
                        // Lost ownership — reconciliation reclaimed it, or a human intervened.
                        LogError(`[TaskGraphDispatcher] Lost claim on task ${taskID} while executing; another instance may take it over.`);
                    }
                });
            }, this.config.HeartbeatIntervalSeconds * 1000);

            // Emitted after the claim is held, not before: a frame saying "started" for work another
            // instance actually took would be a lie a viewer cannot detect.
            const graphID = task.ParentID ?? taskID;
            const ownerUserID = await this.resolveOwner(provider, graphID);
            this.emit({ Kind: 'TaskStarted', ParentTaskID: graphID, OwnerUserID: ownerUserID, TaskID: taskID, TaskName: task.Name, Status: 'In Progress' });

            const dependencyOutputs = await this.loadDependencyOutputs(provider, taskID);
            let inputPayload: unknown = null;
            if (task.InputPayload) {
                try { inputPayload = JSON.parse(task.InputPayload); }
                catch (e) { LogError(`[TaskGraphDispatcher] Task ${taskID} has malformed InputPayload: ${e}`); }
            }

            const result = await this.runTaskBody(task, provider, inputPayload, dependencyOutputs);

            // A prompt can end the workflow early and say why. Honour it before recording the
            // outcome, so the remaining tasks are already Skipped by the time the rollup runs and
            // the graph settles Complete rather than looking abandoned with work left Pending.
            if (result.ChatMessage) {
                await this.endGraphEarly(provider, task, result.ChatMessage);
            }

            const recorded = await this.claims.CompleteClaimed(
                provider,
                taskID,
                {
                    Status: result.Success ? 'Complete' : 'Failed',
                    OutputPayload: result.Output != null ? JSON.stringify(result.Output) : null,
                    ErrorMessage: result.ErrorMessage ?? null,
                    AgentRunID: result.AgentRunID ?? null,
                    Configuration: this.configurationWithRuntime(
                        task, result.PromptRunID, result.ActionLogID, result.Iterations, result.PayloadAtStart,
                    ),
                },
                this.contextUser,
            );
            if (!recorded) {
                // The guarded write refused: the row changed underneath us (cancelled, reassigned,
                // or reclaimed). Deferring to whoever owns it now is correct — overwriting would
                // undo a newer, deliberate decision.
                LogError(`[TaskGraphDispatcher] Could not record outcome for ${taskID}; the task is no longer owned by this instance.`);
            } else {
                // Only announced when the guarded write actually landed. Announcing an outcome we
                // failed to persist would show a viewer a completion the database never recorded.
                this.emit({
                    Kind: result.Success ? 'TaskCompleted' : 'TaskFailed',
                    ParentTaskID: graphID,
                    OwnerUserID: ownerUserID,
                    TaskID: taskID,
                    TaskName: task.Name,
                    Status: result.Success ? 'Complete' : 'Failed',
                    ErrorMessage: result.Success ? undefined : (result.ErrorMessage ?? undefined),
                });
            }
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Execution failed for ${taskID}: ${e instanceof Error ? e.message : String(e)}`);
            try {
                const provider = await this.providerFactory.CreateProvider();
                await this.claims.CompleteClaimed(
                    provider, taskID,
                    { Status: 'Failed', ErrorMessage: e instanceof Error ? e.message : String(e) },
                    this.contextUser,
                );
            } catch { /* already logged; nothing further to do */ }
        } finally {
            if (heartbeat) clearInterval(heartbeat);
        }
    }

    /**
     * Applies failure propagation and parent rollup across every graph with active work.
     *
     * All four decisions — what is eligible, what must block, what the parent status is, whether the
     * graph is wedged — are delegated to the pure algorithms, unchanged from Phase 1.
     */
    private async propagateAndRollup(provider: IMetadataProvider, graphIDs?: readonly string[]): Promise<void> {
        for (const parentID of graphIDs ?? await this.findActiveGraphIDs(provider)) {
            // Human steps settle BEFORE the graph state is read, so an answer given since the last
            // poll is already reflected when eligibility and rollup are computed. Doing it after
            // would delay every dependent branch by a full poll interval for no reason — and on a
            // graph whose only remaining work is downstream of a person, that is the difference
            // between "answered and moving" and "answered and apparently still stuck".
            await this.expireOverdueRequests(provider, parentID);
            await this.settleAnsweredHumanTasks(provider, parentID);
            await this.reopenCancelledHumanTasks(provider, parentID);

            const graph = await this.loadGraphState(provider, parentID);
            if (graph.nodes.length === 0) continue;

            // SKIPS FIRST — before blocking, before eligibility. A task whose gating predecessors
            // are all Skipped is simultaneously "eligible" (Skipped satisfies a prerequisite) and
            // "to be skipped"; deciding eligibility first would dispatch the branch nobody took.
            //
            // `unreachableTaskIDs` seeds this too, and that is a correction (R6). A target whose only
            // route in was an ordinary conditional edge that evaluated DEFINITELY FALSE is a branch
            // that was not taken — semantically identical to an XOR loser — yet it used to settle
            // `Blocked`. That made `Blocked` mean two unrelated things: "the workflow chose another
            // route" and "something upstream broke". A reader cannot tell those apart, so every
            // conditional workflow looked half-failed and people went hunting for bugs that did not
            // exist. `Blocked` is now reserved for FAILURE-driven unsatisfiability.
            const skipSeeds = new Set([...graph.skipSeedTaskIDs, ...graph.unreachableTaskIDs]);
            const toSkip = new Set([
                ...skipSeeds,
                ...ComputeSkipCascade(graph.nodes, graph.edges, [...skipSeeds]),
            ]);
            for (const taskID of toSkip) {
                const entity = graph.entityById.get(taskID);
                if (!entity || entity.Status !== 'Pending') continue;
                entity.Status = 'Skipped';
                if (await entity.Save()) {
                    LogStatus(`[TaskGraphDispatcher] Skipped '${entity.Name}' (${taskID}) — another branch was taken.`);
                    // Announced separately from TaskBlocked because it means something different to
                    // a viewer: nothing went wrong, this route simply was not the one chosen.
                    this.emit({
                        Kind: 'TaskSkipped',
                        ParentTaskID: parentID,
                        OwnerUserID: await this.resolveOwner(provider, parentID),
                        TaskID: taskID,
                        TaskName: entity.Name,
                        Status: 'Skipped',
                    });
                    // Keep the in-memory graph consistent so the blocking pass below and the rollup
                    // both see the skip rather than a stale Pending.
                    const node = graph.nodes.find((n) => n.id === taskID);
                    if (node) node.status = 'Skipped';
                }
            }

            // Only failure-driven unsatisfiability reaches here now; not-taken branches were skipped
            // above. A task already Skipped is left alone rather than overwritten — the two passes
            // must not fight over the same row.
            const toBlock = [...ComputeTasksToBlock(graph.nodes, graph.edges, graph.handledFailureIDs)]
                .filter((id) => !toSkip.has(id));
            for (const taskID of toBlock) {
                const entity = graph.entityById.get(taskID);
                if (!entity) continue;
                entity.Status = 'Blocked';
                if (await entity.Save()) {
                    LogStatus(`[TaskGraphDispatcher] Blocked '${entity.Name}' (${taskID}) — a dependency can never be satisfied.`);
                    // Worth announcing on its own: a blocked step is the one outcome a viewer would
                    // otherwise see as a task that simply never starts.
                    this.emit({
                        Kind: 'TaskBlocked',
                        ParentTaskID: parentID,
                        OwnerUserID: await this.resolveOwner(provider, parentID),
                        TaskID: taskID,
                        TaskName: entity.Name,
                        Status: 'Blocked',
                    });
                }
            }

            // Holds are passed in, or the detector reports a held graph as healthy: a held target's
            // gating edge is still live and its origin Complete, so ComputeEligibleTasks counts it
            // as eligible and "something is eligible" reads as "not stalled". A graph waiting
            // forever on a broken condition then produced no diagnostics at all.
            if (IsGraphStalled(graph.nodes, graph.edges, graph.holdTaskIDs)) {
                LogError(`[TaskGraphDispatcher] Graph ${parentID} is stalled: pending work with no satisfiable path.`);
            }

            const fresh = await this.loadGraphState(provider, parentID);
            // ComputeParentRollup treats an empty child set as Complete-and-terminal, which is right
            // for a graph that genuinely has no children and catastrophic for one whose reload came
            // back empty transiently — it would mark live work finished and fire its continuation.
            // The outer guard covered the first load only.
            if (fresh.nodes.length === 0) continue;
            const rollup = ComputeParentRollup(fresh.nodes, fresh.handledFailureIDs);
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (!(await parent.Load(parentID))) continue;
            // A graph starts when its first step does.
            //
            // `StartedAt` is stamped by the CLAIM, and a parent is never claimed — it is a container,
            // not a unit of work — so the graph row carried no start time even after it completed.
            // A settled workflow therefore reported a CompletedAt with no beginning: it sorted as
            // "not started" in the run tree, showed no timestamp, and no duration could be computed
            // for the thing whose duration people actually ask about.
            //
            // Taken from the earliest child rather than from the clock, because that is when work
            // genuinely began — a graph can sit Pending for a long time between submission (already
            // recorded as CreatedAt) and a dispatcher picking up its first task.
            // Column-scoped for the same reason the terminal write is: a full-row save here would
            // carry this instance's `InputPayload` snapshot and could erase a continuation marker
            // another instance had just claimed. Guarded on `StartedAt IS NULL`, so calling it on
            // every pass is free.
            const earliestChildStart = this.earliestStart(fresh.entityById);
            if (parent.StartedAt == null && earliestChildStart != null) {
                await this.claims.TryStampParentStart(provider, parentID, earliestChildStart, this.contextUser);
                parent.StartedAt = earliestChildStart;
            }

            // THE TERMINAL WRITE IS GUARDED AND COLUMN-SCOPED, not a full-row save.
            //
            // `GenerateSaveSQL` sends every updateable column on every save, so a full-row save
            // carries the whole in-memory snapshot — including `InputPayload`, where the continuation
            // marker lives. Two instances both compute the terminal rollup; if one claims the marker
            // and the other then saves its pre-marker snapshot, the marker is ERASED and the
            // settlement delivers twice. For `reinvoke` that is a second billed agent turn.
            //
            // Guarding on "not already terminal" also makes the write idempotent across the
            // re-entrant settle path below, and replaces an unchecked `Save()` whose failure left the
            // graph active — re-emitting frames and recomputing cost every poll, forever.
            if (rollup.isTerminal) {
                const settled = await this.claims.TrySettleParent(
                    provider, parentID, rollup.status as Parameters<TaskClaimStore['TrySettleParent']>[2],
                    rollup.percentComplete, this.contextUser,
                );
                if (!settled && !TERMINAL_TASK_STATUSES.has(parent.Status)) {
                    // Neither "already terminal" nor a successful write: the statement failed. Leave
                    // the graph active so the next pass retries rather than settling on a status the
                    // database never accepted.
                    LogError(`[TaskGraphDispatcher] Could not write terminal status for graph ${parentID}; leaving it active to retry.`);
                    continue;
                }
                parent.Status = rollup.status;
            } else if (parent.Status !== rollup.status || parent.PercentComplete !== rollup.percentComplete) {
                parent.Status = rollup.status;
                parent.PercentComplete = rollup.percentComplete;
                if (!(await parent.Save())) {
                    LogError(`[TaskGraphDispatcher] Could not update progress for graph ${parentID}: ${parent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }

            if (rollup.isTerminal) {
                // Geometry is settled once, here, so every viewer of this run agrees on it.
                await this.persistComputedLayout(fresh);
                // Emitted before the continuation is delivered, and outside its once-only guard: a
                // viewer watching the run should learn it finished whether or not this instance is
                // the one that wins the delivery CAS.
                this.emit({
                    Kind: 'GraphSettled',
                    ParentTaskID: parentID,
                    OwnerUserID: await this.resolveOwner(provider, parentID),
                    Status: rollup.status,
                    CompletedCount: fresh.nodes.filter((n) => n.status === 'Complete').length,
                    TotalCount: fresh.nodes.length,
                });
                await this.rollUpCostToSubmittingRun(provider, parent);
                // Deliberately AFTER the rollup and OUTSIDE its refusal paths. The rollup declines
                // to write a number it cannot stand behind — a truncated tree, an unreachable graph
                // — and every one of those returns early. If the run's lifecycle were settled in
                // there, a refused rollup would strand the run parked forever, which is a far worse
                // failure than a missing cost figure. Cost and lifecycle are separate concerns with
                // separate failure modes, so they get separate writes.
                await this.settleSubmittingRun(provider, parent, rollup.status);
                await this.deliverContinuation(provider, parent, fresh);
            }
        }
    }

    /**
     * Credits a finished graph's spending back to the agent run that submitted it.
     *
     * **Why this cannot happen during the run.** `BaseAgent` totals a run by walking its steps in
     * memory at finalization — but a submitting run *ends at submission*. Submit-and-detach is the
     * point: the run returns as soon as the graph is durable, and the graph executes afterwards,
     * possibly minutes later on a different instance. At the moment the run computes its totals the
     * spending has not happened yet, so there is nothing to count. The only place the number can be
     * known is here, when the graph settles.
     *
     * **Why the `…Rollup` columns and not the plain ones.** `AIAgentRun` has carried six `…Rollup`
     * columns since v3 that nothing has ever written — they exist for exactly this distinction:
     *
     * - `TotalCost` — what the run itself spent. For a Flow agent that is genuinely near zero: it
     *   compiled a graph and handed it off. This value is already final and is never rewritten here,
     *   so nothing that reads it today changes meaning, and no guardrail that already evaluated
     *   against it is retroactively falsified.
     * - `TotalCostRollup` — the run plus everything it caused. Provisional until the graph settles,
     *   which is now.
     *
     * **The tree is the authority; these columns are its settlement-time cache.** The total is a SUM
     * over `GetAgentRunTree`, not arithmetic of its own. The previous version walked the graph's
     * child tasks and added each one's agent run, which was wrong in two ways that no test could
     * see: a `Prompt` task has no agent run at all, so every prompt step's spend was simply missing;
     * and it read each nested run's `…Rollup ?? …Total`, mixing a descendant-inclusive number with an
     * own-spend one and depending on whether that nested graph happened to have settled yet. The
     * tree already models every one of those cases — it reaches prompt runs through
     * `Configuration.runtime.promptRunID`, and it descends into nested runs and their graphs
     * structurally — so summing it cannot disagree with what the run viewer shows, because it IS
     * what the run viewer shows.
     *
     * **This refuses rather than guesses.** A tree that failed to load, hit the depth cap, or does
     * not contain the settling graph would still produce a number — a lower bound. Writing one would
     * put an authoritative-looking total in a column every cost surface reads. Each of those cases
     * logs and leaves the column alone, so `?? TotalCost` keeps its honest meaning: not settled.
     *
     * A graph with no submitting run (a scheduled job, a remote-operation caller) simply has nobody
     * to credit — its own Task rows still carry the truth, and this returns quietly.
     */
    private async rollUpCostToSubmittingRun(provider: IMetadataProvider, parent: MJTaskEntity): Promise<void> {
        const meta = ParseTaskGraphParentMetadata(parent.InputPayload);
        if (!meta.submittedByAgentRunID) return;
        const runID = meta.submittedByAgentRunID;

        try {
            const runQuery = asRunQueryProvider(provider);
            if (!runQuery) {
                LogError(`[TaskGraphDispatcher] Cannot roll up cost for run ${runID}: provider cannot run queries.`);
                return;
            }

            const tree = await LoadAgentRunTree(runID, runQuery, this.contextUser);

            // Each of these means the sum would be a LOWER BOUND, and the column's whole contract is
            // that it equals the tree. A known-low number presented as a total is worse than no
            // number: the readers all fall back to TotalCost when this is null, which at least
            // *says* it is the run's own spend rather than claiming to be the whole story.
            //
            // Refusing is NOT the same as leaving the column alone. A run that submitted two graphs
            // has a rollup from the first; if the second cannot be summed, the first graph's total
            // sits in the authoritative column excluding work that has since happened — stale, not
            // absent, and `?? TotalCost` cannot save a reader from a non-null wrong number. So a
            // refusal CLEARS it, restoring the fallback's honest meaning: not settled.
            if (tree.ErrorMessage || !tree.Root) {
                await this.clearStaleRollup(provider, runID,
                    tree.ErrorMessage ?? 'the run tree came back empty');
                return;
            }
            if (tree.Truncated) {
                await this.clearStaleRollup(provider, runID,
                    `the run tree hit the depth cap, so any total would silently under-report ` +
                    `(graph ${parent.ID} still carries its own costs)`);
                return;
            }
            // The graph that just settled must appear in the tree. If it does not, the tree stopped
            // at the run — the submitting step never recorded its parentTaskID — and the sum is
            // merely the run's own spend wearing the name of a rollup. That is precisely the silent
            // under-count this rewrite exists to remove, so it is reported rather than written.
            if (!this.treeContainsGraph(tree.Root, parent.ID)) {
                await this.clearStaleRollup(provider, runID,
                    `graph ${parent.ID} is not reachable from it, so the tree cannot see the work. ` +
                    `Did the submitting step record parentTaskID?`);
                return;
            }

            const totals = SumAgentRunTreeCost(tree.Root);

            const submitting = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await submitting.Load(runID))) {
                LogError(`[TaskGraphDispatcher] Could not load run ${runID} to record graph cost against it.`);
                return;
            }

            // Assignment, never accumulation. The tree already contains the run's own spend as its
            // ROOT node, and it reads own-cost everywhere, so recomputing from scratch on every
            // settlement lands on the same answer — which is what makes this safe to call again when
            // a second graph settles, or when the terminal check is re-evaluated after a HITL wait.
            submitting.TotalCostRollup = totals.Cost;
            submitting.TotalTokensUsedRollup = totals.Tokens;
            submitting.TotalPromptTokensUsedRollup = totals.PromptTokens;
            submitting.TotalCompletionTokensUsedRollup = totals.CompletionTokens;

            if (!(await submitting.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not record graph cost against run ${runID}: ` +
                    `${submitting.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
                return;
            }

            LogStatus(
                `[TaskGraphDispatcher] Credited graph ${parent.ID} to run ${runID}: ` +
                `${tree.Rows.length} node(s), ${totals.Tokens} token(s), cost ${totals.Cost}.`,
            );
        } catch (e) {
            // A failed rollup must never fail the graph. The work finished; only the accounting for
            // it is missing, and a graph marked Failed because its cost could not be summed would be
            // a far worse lie than a cost of null.
            LogError(`[TaskGraphDispatcher] Cost rollup failed for graph ${parent.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Clears a rollup that can no longer be trusted, and says why.
     *
     * **Why clear rather than leave.** The four `…Rollup` columns are a cache of the run tree, and
     * every reader treats a value there as the total. When the tree cannot be summed, any value
     * already in the column was computed from an EARLIER settlement — it excludes the graph that
     * just finished, so it is not merely incomplete, it is a wrong total presented as a right one.
     * `?? TotalCost` protects a reader from null, not from stale.
     *
     * Nulling restores the invariant this whole design rests on: **when the column is present, it
     * equals the tree.** Absent means not settled, which is exactly what a reader should conclude.
     * A run with no rollup yet is untouched — there is nothing stale to clear, and writing nulls
     * over nulls would churn Record Changes for nothing.
     */
    private async clearStaleRollup(provider: IMetadataProvider, runID: string, reason: string): Promise<void> {
        LogError(`[TaskGraphDispatcher] Not recording cost for run ${runID}: ${reason}.`);
        try {
            const run = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await run.Load(runID))) return;
            if (run.TotalCostRollup == null && run.TotalTokensUsedRollup == null) return;   // nothing stale

            run.TotalCostRollup = null;
            run.TotalTokensUsedRollup = null;
            run.TotalPromptTokensUsedRollup = null;
            run.TotalCompletionTokensUsedRollup = null;
            if (!(await run.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not clear the now-stale rollup on run ${runID}: ` +
                    `${run.LatestResult?.CompleteMessage ?? 'unknown error'}. It still shows a total that ` +
                    `excludes the graph that just settled.`,
                );
                return;
            }
            LogStatus(
                `[TaskGraphDispatcher] Cleared the rollup on run ${runID}: it was computed before this ` +
                `graph settled and can no longer be recomputed, so it would have under-reported.`,
            );
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Could not clear the rollup on run ${runID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Whether the settling graph is actually reachable from the submitting run's tree.
     *
     * Matched on the graph's parent Task id, which is the node the `TaskGraph` member of the query
     * emits. A run that submitted a graph but recorded no `parentTaskID` produces a tree that stops
     * at the run — structurally indistinguishable, at the SUM, from a run that never dispatched
     * anything. This is the check that tells those two apart.
     */
    private treeContainsGraph(root: AgentRunTreeNode, parentTaskID: string): boolean {
        for (const node of WalkAgentRunTree(root)) {
            if (node.NodeType === 'TaskGraph' && UUIDsEqual(node.NodeID, parentTaskID)) return true;
        }
        return false;
    }

    /**
     * Ends a graph early because a prompt said the work is finished.
     *
     * **Why `Skipped` and not `Cancelled`.** Nothing went wrong and nobody intervened — the workflow
     * reached its own conclusion before running every drawn step, which is exactly what a reasoning
     * step is for. `Cancelled` would tell a reader someone stopped it; `Skipped` says these routes
     * were not taken, which is true and already the vocabulary the fork machinery uses.
     *
     * The message is written to the parent so the graph carries its own answer, rather than the
     * answer living only on the step that produced it.
     */
    private async endGraphEarly(provider: IMetadataProvider, task: MJTaskEntity, message: string): Promise<void> {
        if (!task.ParentID) return;
        try {
            LogStatus(`[TaskGraphDispatcher] '${task.Name}' ended the workflow early: ${message}`);

            for (const sibling of await this.loadChildTasks(provider, task.ParentID)) {
                if (sibling.ID === task.ID || sibling.Status !== 'Pending') continue;
                sibling.Status = 'Skipped';
                if (await sibling.Save()) {
                    this.emit({
                        Kind: 'TaskSkipped',
                        ParentTaskID: task.ParentID,
                        OwnerUserID: await this.resolveOwner(provider, task.ParentID),
                        TaskID: sibling.ID,
                        TaskName: sibling.Name,
                        Status: 'Skipped',
                    });
                }
            }

            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (await parent.Load(task.ParentID)) {
                parent.OutputPayload = JSON.stringify({ message });
                await parent.Save();
            }
        } catch (e) {
            // The work itself succeeded; only the early-finish bookkeeping failed. Failing the task
            // over that would discard a completed step's result.
            LogError(`[TaskGraphDispatcher] Could not end graph early for ${task.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * How deep the continuation chain already is, read from the graph's parent metadata.
     *
     * A run started by a graph inherits that graph's depth **plus one**. Without this every spawned
     * run begins at zero, so a self-referencing flow — one that dispatches a graph containing itself
     * — recurses without bound while the cap it should be hitting compares against a permanent zero.
     */
    private async graphContext(provider: IMetadataProvider, task: MJTaskEntity): Promise<GraphContext> {
        if (!task.ParentID) return { Depth: 0, SubmittingAgentRunID: null };
        try {
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (!(await parent.Load(task.ParentID))) return { Depth: 0, SubmittingAgentRunID: null };
            return {
                Depth: ParseTaskGraphParentMetadata(parent.InputPayload).reinvokeDepth + 1,
                // The graph's own row carries the run that submitted it. One load answers both
                // questions, which is why they are resolved together rather than in two passes.
                SubmittingAgentRunID: parent.AgentRunID,
            };
        } catch {
            // An unreadable parent must not stop the work; depth zero is the safe reading, and the
            // submit-time cap still guards the next hop.
            return { Depth: 0, SubmittingAgentRunID: null };
        }
    }

    /**
     * Which failures the workflow drew a way out of.
     *
     * A Failed task with a **satisfied outgoing edge** is a handled failure: its author drew a
     * recovery route and that route is now live. Downstream work should be released along it, and the
     * parent should not roll up Failed because of a step the workflow explicitly planned around.
     *
     * Scoped to `failureSemantics: 'edges'` on purpose. Under `'block'` — every agent-emitted graph —
     * a failure is terminal for its dependents whatever edges exist, because nobody drew those edges
     * as a recovery path; they are ordinary sequencing, and treating them as recovery would let a
     * graph sail past a failure it never anticipated.
     */
    private async computeHandledFailures(
        provider: IMetadataProvider,
        parentTaskID: string,
        nodes: TaskGraphNode[],
        edges: TaskGraphEdge[],
    ): Promise<Set<string>> {
        const handled = new Set<string>();
        // Cheap exit before touching the database: with no failures there is nothing to handle, and
        // this runs on every poll for every active graph.
        if (!nodes.some((n) => n.status === 'Failed')) return handled;

        const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        if (!(await parent.Load(parentTaskID))) return handled;
        const meta = ParseTaskGraphParentMetadata(parent.InputPayload);
        if (meta.failureSemantics !== 'edges') return handled;

        for (const node of nodes) {
            if (node.status !== 'Failed') continue;
            // "Has somewhere to go" is the test. An edge out of a failed step that survived condition
            // evaluation IS the drawn recovery route; a failed step with no outgoing edges has none,
            // and stays terminal.
            if (edges.some((e) => e.dependsOnTaskId === node.id)) handled.add(node.id);
        }
        return handled;
    }

    /** The graph's child tasks, with the fields the rollup needs. */
    private async loadChildTasks(provider: IMetadataProvider, parentID: string): Promise<MJTaskEntity[]> {
        const result = await RunView.FromMetadataProvider(provider).RunView<MJTaskEntity>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID='${parentID}'`,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.contextUser,
        );
        return (result.Success ? result.Results : []) ?? [];
    }

    /**
     * Runs the graph's continuation exactly once, now that it has settled.
     *
     * **Why the delivery marker is written before the side effect.** Delivery is at-least-once by
     * nature: the process can die between "the graph is done" and "the user has been told". Marking
     * first and acting second means the worst case is a *missed* notification that shows up in the
     * task record as delivered — recoverable, visible, and inspectable. Marking after would make the
     * worst case a *repeated* notification on every reconciliation sweep, forever, which is both
     * user-visible noise and, for `reinvoke`, an unbounded agent-run loop. Given one of the two has
     * to be chosen, the quiet failure is the safe one.
     *
     * The marker is claimed with a real compare-and-swap (one guarded UPDATE, rowcount as verdict),
     * so two instances reconciling the same completed graph produce one winner rather than two.
     */
    private async deliverContinuation(
        provider: IMetadataProvider,
        parent: MJTaskEntity,
        graph: GraphState,
    ): Promise<void> {
        const meta = this.readParentMetadata(parent);
        if (meta.continuationDeliveredAt) return;

        // At the cap, downgrade rather than refuse: the results still reach the user, the chain just
        // stops growing. Refusing outright would lose the outcome of work that actually completed.
        const mode = IsReinvokeCapReached(meta) ? 'message' : meta.continuation;
        if (mode !== 'none' && IsReinvokeCapReached(meta) && meta.continuation === 'reinvoke') {
            LogStatus(
                `[TaskGraphDispatcher] Graph ${parent.ID} hit the reinvoke cap (${MAX_REINVOKE_DEPTH}); ` +
                `delivering results as a message instead of starting another turn.`,
            );
        }

        // A SETTLEMENT NOBODY IS WAITING FOR STILL SETTLES — it just does not get announced.
        //
        // Run settlement and cost rollup are status corrections and are always safe to apply late; a
        // run left `Paused` forever is strictly worse than a stale notification skipped. A stale
        // NOTIFICATION is not: posting a day-old "your workflow finished" into a live conversation,
        // or worse starting a fresh billed agent turn for it, is the outcome the age-out exists to
        // avoid. So an aged-out settlement claims the marker as `expired` and logs, which both
        // records what happened and stops any later pass delivering it. Second rung on the ladder
        // the reinvoke cap already established.
        const expired = this.isSettlementExpired(parent);
        if (!(await this.claimContinuation(provider, parent.ID, expired ? 'expired' : 'delivered'))) return;

        if (expired) {
            LogStatus(
                `[TaskGraphDispatcher] Graph ${parent.ID} settled after its delivery window ` +
                `(${UNSETTLED_SWEEP_WINDOW_HOURS}h); the run and its cost were corrected, but the ` +
                `continuation was NOT delivered. Marked expired.`,
            );
            return;
        }

        if (mode === 'none') return;

        const summary = this.buildContinuationSummary(parent, graph);
        LogStatus(`[TaskGraphDispatcher] Graph ${parent.ID} finished — ${summary}`);

        if (!this.continuationDeliverer) return;

        const params: TaskContinuationParams = {
            ParentTaskID: parent.ID,
            WorkflowName: parent.Name,
            ConversationDetailID: parent.ConversationDetailID ?? null,
            SubmittedByAgentRunID: meta.submittedByAgentRunID,
            ReinvokeDepth: meta.reinvokeDepth,
            Tasks: [...graph.entityById.values()].map((t) => ({
                TaskID: t.ID,
                Name: t.Name,
                Status: t.Status,
                // A reference, not the payload. Inlining every task's output would swamp the
                // continuation turn's context; the agent pulls what it needs by task ID.
                Summary: t.OutputPayload ? `output available (${t.OutputPayload.length} chars)` : undefined,
                ErrorMessage: t.ErrorMessage ?? undefined,
            })),
            Summary: summary,
        };

        try {
            // Reinvoke degrades to a message when the host cannot start agent turns. Degrading is
            // right rather than throwing: the work genuinely ran, and the user losing the results
            // because nobody could start a follow-up turn would be the worse outcome.
            if (mode === 'reinvoke' && this.continuationDeliverer.Reinvoke) {
                await this.continuationDeliverer.Reinvoke(params);
            } else {
                if (mode === 'reinvoke') {
                    LogStatus(`[TaskGraphDispatcher] Graph ${parent.ID}: host cannot reinvoke; delivering as a message.`);
                }
                await this.continuationDeliverer.PostMessage(params);
            }
        } catch (e) {
            // Already marked delivered, so this will not retry. That is the deliberate trade stated
            // on the marker: a missed notification visible in the record beats one repeated forever.
            LogError(`[TaskGraphDispatcher] Continuation delivery failed for ${parent.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Reads the parent's durable continuation metadata through the shared parser. */
    private readParentMetadata(parent: MJTaskEntity): TaskGraphParentMetadata {
        return ParseTaskGraphParentMetadata(parent.InputPayload);
    }

    /**
     * Stamps the delivery marker and confirms this instance won the race.
     *
     * `MJ: Tasks` stays user-writable (D20), so a plain "read, decide, write" is not enough — the
     * read-back is what makes a lost race observable instead of producing a duplicate delivery.
     */
    /**
     * True when this graph finished so long ago that announcing it would surprise rather than inform.
     *
     * Measured from the parent's completion, not from when we noticed: the point is how stale the
     * NEWS is to whoever would receive it.
     */
    private isSettlementExpired(parent: MJTaskEntity): boolean {
        if (!parent.CompletedAt) return false;
        return Date.now() - parent.CompletedAt.getTime() > UNSETTLED_SWEEP_WINDOW_HOURS * 3600_000;
    }

    private async claimContinuation(
        provider: IMetadataProvider,
        parentID: string,
        deliveredAs: 'delivered' | 'expired' = 'delivered',
    ): Promise<boolean> {
        // ONE GUARDED STATEMENT — see TaskClaimStore.TryClaimContinuation.
        //
        // This was Load → check the marker → `Save()`: an unconditional last-write-wins UPDATE that
        // two dispatchers could both pass. The comments here and at the call site called it a
        // compare-and-swap read-back; it was read-check-write, and for `continuation: 'reinvoke'`
        // losing that race means two fresh agent turns billed for one settlement, each able to
        // submit further graphs.
        return this.claims.TryClaimContinuation(provider, parentID, deliveredAs, this.contextUser);
    }

    /** One line describing how the graph ended, for the completion log and message delivery. */
    private buildContinuationSummary(parent: MJTaskEntity, graph: GraphState): string {
        const counts = new Map<string, number>();
        for (const node of graph.nodes) counts.set(node.status, (counts.get(node.status) ?? 0) + 1);
        const breakdown = [...counts.entries()].map(([status, n]) => `${n} ${status}`).join(', ');
        return `"${parent.Name}": ${graph.nodes.length} task(s) — ${breakdown}.`;
    }

    /**
     * Tells the assignee that a human task is ready, exactly once.
     *
     * **Once** matters more than it looks: eligibility is recomputed on every poll, so a task parked
     * on a person for three days would otherwise re-notify every five seconds until they acted. The
     * marker is the task's own `ClaimedBy` — a human task has no executor to claim it, so the column
     * is free, and reusing it means the "already notified" fact is as durable and as crash-safe as
     * every other piece of graph state. A restart cannot resend.
     *
     * Best-effort by design. A notification that fails to send must not stop the graph or the poll
     * loop; the task is still visible in the Tasks UI, so the work is discoverable even when the
     * nudge does not arrive.
     */
    private async notifyHumanTaskReady(task: MJTaskEntity, provider: IMetadataProvider): Promise<void> {
        if (task.ClaimedBy === HUMAN_TASK_NOTIFIED_MARKER) return;

        // The REQUEST is raised whether or not the task names an assignee. An unassigned human step
        // is a legitimate "somebody needs to look at this", and a request nobody was notified about
        // is still findable in the inbox — whereas returning early here is how such a step used to
        // become invisible work that stalled a workflow with nothing anywhere saying why.
        // TRANSIENT failures retry; PERMANENT ones stop. That distinction is the whole point, and
        // getting it wrong took a server down: retrying unconditionally meant a task whose workflow
        // has no owning agent — which can never succeed — was re-attempted on every poll forever,
        // each pass re-reading the graph, until the process was OOM-killed. The marker exists to
        // prevent exactly that storm; a permanent failure has to set it.
        const raised = await this.raiseHumanRequest(task, provider);
        if (raised === 'transient-failure') return;   // try again next poll
        if (raised === 'permanent-failure') {
            // Nothing will change on a retry. Mark it so the loop stops, and leave the task Pending
            // and visible — a person can still see it in the Tasks UI, which is the fallback the
            // notification was only ever an accelerant for.
            await this.markHumanTaskNotified(task);
            return;
        }

        if (!task.UserID) {
            await this.markHumanTaskNotified(task);
            return;
        }

        try {
            await NotificationEngine.Instance.Config(false, this.contextUser);
            await NotificationEngine.Instance.SendNotification({
                userId: task.UserID,
                typeNameOrId: HUMAN_TASK_NOTIFICATION_TYPE,
                title: `Action needed: ${task.Name}`,
                message: task.Description || 'A workflow is waiting on you to complete this task.',
                resourceConfiguration: { type: 'Task', taskId: task.ID, parentTaskId: task.ParentID ?? '' },
            }, this.contextUser);
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Could not notify ${task.UserID} about task ${task.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }

        await this.markHumanTaskNotified(task);

        // Emitted once, alongside the marker, so a viewer sees the graph stop on a person rather
        // than appearing to stall for no reason.
        this.emit({
            Kind: 'TaskAwaitingHuman',
            ParentTaskID: task.ParentID ?? task.ID,
            OwnerUserID: await this.resolveOwner(provider, task.ParentID ?? task.ID),
            TaskID: task.ID,
            TaskName: task.Name,
            Status: task.Status,
            AssignedUserID: task.UserID,
        });
    }

    /**
     * Parent tasks that still have work to do.
     *
     * `BypassCache` for the reason the caching guide names explicitly: **the claim protocol mutates
     * these rows through direct SQL**, because the CAS guarantee IS the database's atomicity and a
     * `BaseEntity.Save()` cannot express a guarded UPDATE. Direct DML fires no invalidation event,
     * so a cached read of this query is stale the instant any task is claimed or completed — and
     * the dispatcher would then be reading its own work queue through a cache its own writes never
     * invalidate. Left cached, a completed task keeps reading as `In Progress` and the graph never
     * rolls up: submitted work simply never settles.
     */
    /**
     * Settles graphs that reached terminal without completing their post-settlement sequence.
     *
     * Runs the ordinary propagation path, which is safe to re-enter by construction: the terminal
     * write is guarded on not-already-terminal, the cost rollup assigns rather than accumulates, run
     * settlement is guarded on `Paused`, and delivery is guarded by the continuation CAS. A revisit
     * therefore corrects whatever is missing and does nothing where nothing is.
     *
     * @param windowHours how far back to look — wide once at startup, narrow in steady state
     */
    private async sweepUnsettledGraphs(windowHours: number): Promise<void> {
        try {
            const provider = await this.providerFactory.CreateProvider();
            const ids = await this.findActiveGraphIDs(provider, windowHours);
            if (ids.length === 0) return;
            LogStatus(`[TaskGraphDispatcher] Startup sweep: reviewing ${ids.length} graph(s), including any that reached terminal without settling.`);
            await this.propagateAndRollup(provider, ids);
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Unsettled-graph sweep failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async findActiveGraphIDs(provider: IMetadataProvider, windowHours: number = UNSETTLED_SWEEP_WINDOW_HOURS): Promise<string[]> {
        const rv = RunView.FromMetadataProvider(provider);

        // TWO queries, because "has work left to do" and "needs attention" are not the same set.
        //
        // Selecting only graphs with non-terminal CHILDREN looks right and is subtly fatal: the
        // moment the last child completes, the graph leaves that set — so the pass that would have
        // rolled the parent up never sees it. A graph whose tasks all succeed therefore stays
        // In Progress forever and its continuation never fires. (A graph that FAILS happened to
        // survive this, because blocking its dependents left them non-terminal for one more pass —
        // which is why the bug hid behind a passing failure-path test.)
        //
        // The second query closes it: a parent that is itself non-terminal still needs looking at,
        // whatever its children are doing.
        // THREE queries. The third rescues a graph that reached terminal without settling.
        //
        // The post-settlement sequence — cost rollup, run settlement, continuation delivery — runs
        // AFTER the parent's terminal write, and a terminal parent with all-terminal children
        // matches neither query above. So a process that died in that window left the submitting
        // agent run `Paused` FOREVER: no rollup, no notification, and nothing that would ever look
        // again. The metadata's own doc comment promised "the next sweep retries"; that sweep did
        // not exist.
        //
        // Bounded rather than unbounded, because the marker lives in `InputPayload` JSON and cannot
        // be filtered in SQL: the window is what keeps this a targeted rescue instead of a re-parse
        // of every graph ever run. `__mj_UpdatedAt` advances on each settle attempt, so a graph
        // being actively retried stays in the window — the bound is on ABANDONMENT, not on age.
        const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();
        const [withPendingWork, unsettledParents, terminalRecent] = await rv.RunViews([
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IS NOT NULL AND Status IN ('Pending','In Progress')`,
                Fields: ['ParentID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IS NULL AND Status IN ('Pending','In Progress')`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter:
                    `ParentID IS NULL AND Status IN ('Complete','Failed','Cancelled','Skipped') ` +
                    `AND __mj_UpdatedAt >= '${cutoff}'`,
                Fields: ['ID', 'InputPayload'],
                ResultType: 'simple',
                BypassCache: true,
            },
        ], this.contextUser);

        const ids = new Set<string>();
        for (const r of (withPendingWork?.Results ?? []) as Array<{ ParentID: string }>) {
            if (r.ParentID) ids.add(r.ParentID);
        }
        // Childless tasks match the second query too; propagateAndRollup skips anything with no
        // nodes, so they cost one empty load and nothing else.
        for (const r of (unsettledParents?.Results ?? []) as Array<{ ID: string }>) {
            if (r.ID) ids.add(r.ID);
        }
        // The marker is JSON, so the filter is here rather than in SQL. Parsed with the SAME reader
        // the writer's format is pinned to, which is what lets a graph settled before any of this
        // existed be judged identically to one settled after.
        for (const r of (terminalRecent?.Results ?? []) as Array<{ ID: string; InputPayload: string | null }>) {
            if (!r.ID) continue;
            if (ParseTaskGraphParentMetadata(r.InputPayload).continuationDeliveredAt) continue;
            ids.add(r.ID);
        }
        return [...ids];
    }

    /**
     * Tasks eligible to claim right now, across all active graphs.
     *
     * Eligibility is decided by the pure algorithm rather than by SQL: expressing "all prerequisites
     * complete" as a query is possible but would be a second, independently-maintained definition of
     * the same rule, free to drift from the one the in-run executor uses.
     */
    private async findClaimableTasks(provider: IMetadataProvider, limit: number): Promise<MJTaskEntity[]> {
        const claimable: MJTaskEntity[] = [];
        for (const parentID of await this.findActiveGraphIDs(provider)) {
            if (claimable.length >= limit) break;
            const graph = await this.loadGraphState(provider, parentID);
            // HOLD is what makes "a broken condition stalls visibly" true rather than merely stated.
            // An undecided exclusive group keeps all its edges, and a kept edge on a Complete origin
            // is a SATISFIED prerequisite — so without this filter every branch of the fork would be
            // eligible at once and all of them would run. A typo must not multiply a fork.
            //
            // The losers of a DECIDED group must be filtered for the same reason, and this is a race
            // rather than a rule: they are marked Skipped by the propagation pass, but between the
            // moment the group resolves and the moment that write lands, their incoming edge is still
            // a satisfied prerequisite on a Complete origin. A poll landing in that window would
            // claim and execute the branch the workflow chose NOT to take — irreversibly, since the
            // action has already run by the time Skipped is written over it.
            // `unreachableTaskIDs` joins the filter for exactly the reason above. R6 made a
            // definite-false ordinary edge seed the skip cascade rather than Block its target — but
            // until that Skipped write lands, the target has no unsatisfied prerequisite and is
            // vacuously eligible. That is the same race the XOR fix closed, reopened on the new
            // path: a branch the workflow decided against, claimed and executed irreversibly in the
            // window before it was marked.
            const eligible = ComputeEligibleTasks(graph.nodes, graph.edges, graph.handledFailureIDs)
                .filter((n) =>
                    !graph.holdTaskIDs.has(n.id) &&
                    // CONFIRMED seeds, not raw ones (P1). Holding a decided loser out of claiming
                    // closes a real race — the loser could be claimed between eligibility and the
                    // skip write — and that role is unchanged. What changed is which targets count
                    // as decided: a task another live route still reaches was never a loser, so it
                    // must stay claimable and run when its own prerequisites are met.
                    !graph.skipSeedTaskIDs.has(n.id) &&
                    !graph.unreachableTaskIDs.has(n.id));
            for (const node of eligible) {
                const entity = graph.entityById.get(node.id);
                if (!entity) continue;

                // Human tasks are never dispatched — a person completes them. But "eligible" is the
                // moment that person can finally act, and nothing else in the system knows it has
                // arrived: the task sat Pending behind prerequisites, and no save touched it when
                // they cleared. Without a notification here a workflow simply stops, waiting on
                // someone who was never told. That silent stall is the failure mode this exists to
                // prevent, so it happens on the eligibility check rather than at submission.
                if (entity.ActionID) {
                    // An action node this host has no runner for is left Pending rather than
                    // claimed. Claiming it would take ownership of work this process cannot do, and
                    // the claim would then have to expire before any host that CAN do it gets a
                    // turn — a self-inflicted stall on a mixed deployment.
                    if (!this.actionRunner) continue;
                } else if (entity.PromptID) {
                    // A prompt node — including a loop that repeats a prompt — is assigned through
                    // PromptID and carries NEITHER ActionID nor AgentID. Without this branch it fell
                    // through to the test below and was treated as a task waiting on a PERSON: the
                    // workflow notified a human who had nothing to do and then stopped forever.
                    // That is precisely the misclassification the step-kind rules warn about, and it
                    // is silent — the graph sits In Progress looking like it is still working.
                    if (!this.promptRunner) continue;
                } else if (!entity.AgentID) {
                    await this.notifyHumanTaskReady(entity, provider);
                    continue;
                }

                if (this.inFlight.has(entity.ID)) continue;
                claimable.push(entity);
                if (claimable.length >= limit) break;
            }
        }
        return claimable;
    }

    /**
     * Marks a human task as notified, so the request is raised exactly once.
     *
     * Written even when delivery threw. Retrying on every poll is a worse failure than one missed
     * notification: the task stays visible in the inbox either way, whereas a notification storm is
     * not self-correcting.
     */
    private async markHumanTaskNotified(task: MJTaskEntity): Promise<void> {
        task.ClaimedBy = HUMAN_TASK_NOTIFIED_MARKER;
        if (!(await task.Save())) {
            LogError(`[TaskGraphDispatcher] Could not mark task ${task.ID} as notified; it may notify again.`);
        }
    }

    /**
     * Raises the `MJ: AI Agent Requests` row a person answers to release this step.
     *
     * **Why that entity rather than something new.** It already models everything a workflow's human
     * step needs — who is being asked, what for, a typed response schema, priority, expiry, and an
     * inbox surface people already use. A second HITL substrate beside it would split the inbox in
     * two and leave one of them without expiry or permissions.
     *
     * **What it deliberately does NOT set is `ResumingAgentRunID`.** A request normally suspends an
     * agent run and resumes it. A workflow needs none of that: the graph OUTLIVES the run that
     * submitted it, so nothing is suspended — the task sits Pending, every other branch keeps
     * running, and answering settles the task. That column staying null is meaningful, not missing.
     */
    private async raiseHumanRequest(
        task: MJTaskEntity,
        provider: IMetadataProvider,
    ): Promise<'raised' | 'permanent-failure' | 'transient-failure'> {
        try {
            const existing = await this.findOpenRequest(provider, task.ID);
            if (existing) return 'raised';   // already waiting on someone

            const request = await provider.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests', this.contextUser,
            );
            request.NewRecord();
            request.OriginatingTaskID = task.ID;
            // A human task has NO AgentID of its own — that column names what EXECUTES a step, and
            // a person is not an agent. The request still needs one, so it carries the agent that
            // owns the workflow: the graph's own agent, which is who is asking.
            const owningAgentID = await this.owningAgentOf(provider, task);
            if (!owningAgentID) {
                // PERMANENT: a graph with no owning agent will not acquire one by being asked
                // again. Graphs submitted before the provenance stamp landed are all in this state.
                LogError(
                    `[TaskGraphDispatcher] Task ${task.ID} needs a person, but its workflow has no ` +
                    `agent to ask on behalf of, so no request can be raised. The task stays Pending ` +
                    `and visible in the Tasks UI; it will not be retried.`,
                );
                return 'permanent-failure';
            }
            request.AgentID = owningAgentID;
            request.RequestForUserID = task.UserID;
            request.RequestedAt = new Date();
            request.Status = 'Requested';
            request.Request = task.Description || `A workflow is waiting on you to complete "${task.Name}".`;
            // The graph's own run is the provenance a reader follows back to see what led here.
            request.OriginatingAgentRunID = await this.submittingRunOf(provider, task);

            // The deadline, when the author set one. `expireOverdueRequests` has always been able to
            // enforce this — it expires the request and fails the step so a give-up edge can route
            // around it — but nothing ever WROTE the column, so that whole path had never run outside
            // a test and a workflow waiting on someone who left the company waited forever.
            // Absent means no deadline, deliberately: expiring on a timeout nobody chose would be
            // worse than waiting.
            const expiresInHours = this.parseConfiguration(task)?.human?.expiresInHours;
            if (expiresInHours && expiresInHours > 0) {
                request.ExpiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
            }

            if (!(await request.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not raise a request for task ${task.ID}: ` +
                    `${request.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
                // A failed SAVE may be transient (deadlock, contention), so this one earns a retry.
                return 'transient-failure';
            }
            return 'raised';
        } catch (e) {
            // Never fatal. The task remains Pending and visible; a missing request is recoverable,
            // whereas throwing here would abort the whole dispatch pass for every other branch.
            LogError(`[TaskGraphDispatcher] Could not raise a request for task ${task.ID}: ${e instanceof Error ? e.message : String(e)}`);
            return 'transient-failure';
        }
    }

    /**
     * The agent that owns this task's workflow — who the request is asked on behalf of.
     *
     * Reads the graph's parent row, falling back to the run that submitted it. A human step has no
     * agent of its own by design: `AgentID` names what EXECUTES a step, and a person is not an agent.
     */
    private async owningAgentOf(provider: IMetadataProvider, task: MJTaskEntity): Promise<string | null> {
        if (task.AgentID) return task.AgentID;
        if (!task.ParentID) return null;
        try {
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (!(await parent.Load(task.ParentID))) return null;
            if (parent.AgentID) return parent.AgentID;

            if (!parent.AgentRunID) return null;
            const run = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            return (await run.Load(parent.AgentRunID)) ? run.AgentID : null;
        } catch {
            return null;
        }
    }

    /** The still-open request for a task, if one exists. */
    private async findOpenRequest(
        provider: IMetadataProvider,
        taskID: string,
    ): Promise<MJAIAgentRequestEntity | null> {
        const result = await RunView.FromMetadataProvider(provider).RunView<MJAIAgentRequestEntity>(
            {
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter: `OriginatingTaskID='${taskID}' AND Status='Requested'`,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.contextUser,
        );
        return (result.Success ? result.Results?.[0] : null) ?? null;
    }

    /**
     * Settles a human task from the request a person answered.
     *
     * Runs on the poll rather than on a save hook, because the answer can arrive through any surface
     * — the inbox, the API, a conversation — and only the dispatcher knows how to release the rest
     * of the graph afterwards.
     *
     * **`ResponseData` becomes the task's output.** That is what makes a human step useful rather
     * than a gate: a downstream edge can branch on what the person actually said, typed by the
     * request's own ResponseSchema. A step that only recorded "approved" would force every decision
     * back into a separate action.
     */
    private async settleAnsweredHumanTasks(provider: IMetadataProvider, graphID: string): Promise<void> {
        const waiting = await RunView.FromMetadataProvider(provider).RunView<MJTaskEntity>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID='${graphID}' AND StepType='Human' AND Status='Pending'`,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.contextUser,
        );
        if (!waiting.Success) return;

        for (const task of waiting.Results ?? []) {
            const request = await this.answeredRequestFor(provider, task.ID);
            if (!request) continue;

            const rejected = request.Status === 'Rejected';
            const expired = request.Status === 'Expired';

            task.Status = rejected || expired ? 'Failed' : 'Complete';
            task.CompletedAt = new Date();
            task.PercentComplete = rejected || expired ? 0 : 100;
            task.ClaimedBy = null;
            task.ClaimExpiresAt = null;
            task.OutputPayload = request.ResponseData ?? null;
            if (rejected) {
                task.ErrorMessage = request.Comments || 'A person rejected this step.';
            } else if (expired) {
                // Stated as a failure rather than left Pending. A workflow blocked forever on
                // someone who never answered — who may have left the company — is the silent stall
                // this whole path exists to avoid, and a give-up edge can now route around it.
                task.ErrorMessage = 'Nobody answered this step before its request expired.';
            }

            if (!(await task.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not settle human task ${task.ID}: ` +
                    `${task.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }

    /**
     * Re-opens a human step whose request was CANCELLED.
     *
     * `answeredRequestFor` deliberately excludes `Canceled`, because cancelling withdraws the ASK
     * rather than deciding the step — the task is supposed to keep waiting "for whatever replaces
     * it". Nothing replaced it. `raiseHumanRequest` refuses to raise twice (the notified marker on
     * `ClaimedBy` is what stops the notification storm), so a cancelled request left the task Pending
     * with no open request and no path to acquiring one: a workflow waiting forever on a question
     * nobody is being asked.
     *
     * Clearing the marker is the whole fix — the next poll sees an un-notified Pending human task
     * and raises a fresh request, which is exactly the replacement the design assumed. Bounded by
     * human action: it takes another person cancelling again to come back here.
     */
    private async reopenCancelledHumanTasks(provider: IMetadataProvider, graphID: string): Promise<void> {
        const waiting = await RunView.FromMetadataProvider(provider).RunView<MJTaskEntity>(
            {
                EntityName: 'MJ: Tasks',
                // `StepType` is NULLABLE, and rows predating the column exist (4 in the reference
                // database at the time of writing). None currently carry a UserID, but a human task
                // written by any path that set the assignee without the discriminator would be
                // invisible to a `StepType='Human'` filter and stay dead forever after a cancel —
                // the exact stall this method exists to end. The notified marker already narrows
                // this to tasks the dispatcher raised a request for, so the widening cannot pull in
                // unrelated work.
                ExtraFilter:
                    `ParentID='${graphID}' AND Status='Pending' ` +
                    `AND (StepType='Human' OR (StepType IS NULL AND UserID IS NOT NULL)) ` +
                    `AND ClaimedBy='${HUMAN_TASK_NOTIFIED_MARKER}'`,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.contextUser,
        );
        if (!waiting.Success) return;

        for (const task of waiting.Results ?? []) {
            // Only when there is nothing live AND nothing terminal. A task with an open request is
            // simply waiting; one with a terminal request is settled on the next pass by
            // settleAnsweredHumanTasks, and re-raising either would ask the same question twice.
            if (await this.findOpenRequest(provider, task.ID)) continue;
            if (await this.answeredRequestFor(provider, task.ID)) continue;

            LogStatus(
                `[TaskGraphDispatcher] The request for '${task.Name}' was cancelled and nothing ` +
                `replaced it; asking again.`,
            );
            task.ClaimedBy = null;
            if (!(await task.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not re-open cancelled human task ${task.ID}: ` +
                    `${task.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }

    /** The answered (or expired) request for a task, if any. */
    private async answeredRequestFor(
        provider: IMetadataProvider,
        taskID: string,
    ): Promise<MJAIAgentRequestEntity | null> {
        const result = await RunView.FromMetadataProvider(provider).RunView<MJAIAgentRequestEntity>(
            {
                EntityName: 'MJ: AI Agent Requests',
                // Everything terminal. 'Canceled' is deliberately absent: a cancelled request means
                // the ASK was withdrawn, not that the step was decided, so the task keeps waiting
                // for whatever replaces it.
                ExtraFilter:
                    `OriginatingTaskID='${taskID}' AND Status IN ('Approved','Rejected','Responded','Expired')`,
                OrderBy: 'RespondedAt DESC',
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.contextUser,
        );
        return (result.Success ? result.Results?.[0] : null) ?? null;
    }

    /**
     * Expires requests whose deadline has passed.
     *
     * A deadline that nothing enforces is a comment. Without this an `ExpiresAt` in the past leaves
     * the request `Requested` forever and the workflow waiting on it just as long.
     */
    private async expireOverdueRequests(provider: IMetadataProvider, graphID: string): Promise<void> {
        // Scoped by an explicit id list rather than a subquery against a view name, so this reads
        // the same on any provider rather than assuming a SQL dialect and a physical view.
        const humanTasks = await RunView.FromMetadataProvider(provider).RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Tasks',
                Fields: ['ID'],
                ExtraFilter: `ParentID='${graphID}' AND StepType='Human' AND Status='Pending'`,
                ResultType: 'simple',
            },
            this.contextUser,
        );
        const ids = (humanTasks.Results ?? []).map((r) => `'${r.ID}'`);
        if (ids.length === 0) return;

        const nowISO = new Date().toISOString();
        const overdue = await RunView.FromMetadataProvider(provider).RunView<MJAIAgentRequestEntity>(
            {
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter:
                    `Status='Requested' AND ExpiresAt IS NOT NULL AND ExpiresAt < '${nowISO}' ` +
                    `AND OriginatingTaskID IN (${ids.join(',')})`,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            this.contextUser,
        );
        if (!overdue.Success) return;

        for (const request of overdue.Results ?? []) {
            request.Status = 'Expired';
            if (!(await request.Save())) {
                LogError(`[TaskGraphDispatcher] Could not expire request ${request.ID}.`);
            }
        }
    }

    /** The agent run that submitted this task's graph, for provenance on the request. */
    private async submittingRunOf(provider: IMetadataProvider, task: MJTaskEntity): Promise<string | null> {
        if (!task.ParentID) return null;
        try {
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            return (await parent.Load(task.ParentID)) ? parent.AgentRunID : null;
        } catch {
            return null;
        }
    }

    /** Loads a graph's children and edges in the shapes both the algorithms and mutation need. */
    private async loadGraphState(provider: IMetadataProvider, parentTaskID: string): Promise<GraphState> {
        const rv = RunView.FromMetadataProvider(provider);
        // BypassCache throughout: task status is written by the claim protocol's direct SQL, which
        // fires no cache invalidation. See findActiveGraphIDs.
        const childrenResult = await rv.RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskID}'`, ResultType: 'entity_object', BypassCache: true },
            this.contextUser,
        );
        const children = (childrenResult.Success ? childrenResult.Results : []) ?? [];
        if (children.length === 0) {
            return {
                nodes: [], edges: [], entityById: new Map(),
                unreachableTaskIDs: new Set(), skipSeedTaskIDs: new Set(), holdTaskIDs: new Set(),
                handledFailureIDs: new Set(),
            };
        }

        const idList = children.map((c) => `'${c.ID}'`).join(',');
        const depsResult = await rv.RunView<MJTaskDependencyEntity>(
            { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${idList})`, ResultType: 'entity_object', BypassCache: true },
            this.contextUser,
        );
        const deps = (depsResult.Success ? depsResult.Results : []) ?? [];

        const entityById = new Map(children.map((c) => [c.ID, c]));

        // Conditional edges are resolved HERE, before eligibility runs, by dropping edges whose
        // condition does not hold. Expressing it as edge removal rather than as a second rule inside
        // the eligibility algorithm is what keeps one definition of "ready": a task with no live
        // incoming edges is ready for exactly the same reason a task with no edges at all is.
        //
        // An edge whose condition cannot be evaluated is KEPT, which is the opposite of the flow
        // executor's choice and deliberately so. There, a broken condition means an edge is not
        // followed and the graph moves on. Here it would mean a prerequisite silently disappears and
        // the dependent task runs early — turning a typo into out-of-order execution. Keeping the
        // edge instead stalls the graph, which the stall detector already reports loudly.
        const liveEdges: TaskGraphEdge[] = [];
        // A definitely-false edge must not merely disappear. Removing a task's only prerequisite
        // makes it eligible in the very next wave — so "this branch was not taken" would execute the
        // branch, potentially before the node that gated it. The dependent is recorded as
        // unreachable instead, and blocked before anything can claim it.
        const droppedInto = new Set<string>();
        const stillReachable = new Set<string>();

        // EXCLUSIVE edges are exempt from the generic machinery below, and that exemption is
        // load-bearing. An XOR loser is by definition condition-false, so the ordinary path would
        // record it as unreachable and Block it — and a Blocked child poisons the parent rollup, so
        // every fork would settle the graph as Blocked. Losers must become Skipped instead, which
        // only ResolveExclusiveGroups can decide.
        const exclusive = deps.filter((d) => !!d.ExclusiveGroup);
        const ordinary = deps.filter((d) => !d.ExclusiveGroup);

        const resolution = ResolveExclusiveGroups(
            exclusive.map((d) => ({
                id: d.ID,
                taskId: d.TaskID,
                dependsOnTaskId: d.DependsOnTaskID,
                exclusiveGroup: d.ExclusiveGroup!,
                originStatus: (entityById.get(d.DependsOnTaskID)?.Status ?? 'Pending') as TaskGraphNodeStatus,
                priority: d.Priority ?? 0,
                sequence: d.Sequence ?? 0,
                conditionOutcome: this.evaluateExclusiveCondition(d, entityById),
            })),
            // A flow's failure handling is its outgoing edges, so a Failed origin still decides its
            // group. For a loop-agent graph the set is Complete-only and nothing changes.
            new Set<TaskGraphNodeStatus>(['Complete', 'Failed']),
        );
        const loserEdgeIDs = new Set(resolution.loserEdgeIDs);

        // Targets of an edge whose condition could not be evaluated (P2). Neither eligible nor
        // skipped: the edge stays live so the target is not mistaken for unreachable, and the target
        // joins the hold set so nothing claims it.
        const heldByCondition = new Set<string>();

        for (const d of ordinary) {
            if (d.Condition?.trim()) {
                const outcome = this.evaluateEdgeCondition(d, entityById);
                if (outcome === 'drop') { droppedInto.add(d.TaskID); continue; }
                if (outcome === 'hold') heldByCondition.add(d.TaskID);
            }
            stillReachable.add(d.TaskID);
            liveEdges.push({
                taskId: d.TaskID,
                dependsOnTaskId: d.DependsOnTaskID,
                dependencyType: d.DependencyType as TaskGraphEdge['dependencyType'],
            });
        }

        for (const d of exclusive) {
            // A losing edge is removed rather than left to gate: its target is being skipped, and a
            // live edge into a skipped task would keep the graph waiting on a branch nobody took.
            if (loserEdgeIDs.has(d.ID)) continue;
            stillReachable.add(d.TaskID);
            liveEdges.push({
                taskId: d.TaskID,
                dependsOnTaskId: d.DependsOnTaskID,
                dependencyType: d.DependencyType as TaskGraphEdge['dependencyType'],
            });
        }

        // Only unreachable when EVERY route in was cut. A node still holding a live edge is simply
        // waiting on it, and a node reached by an alternate branch is genuinely reachable.
        const unreachableTaskIDs = new Set([...droppedInto].filter((id) => !stillReachable.has(id)));

        // EXCLUSIVE LOSERS GET THE SAME TEST — they did not, and that is P1.
        //
        // A loser's target was seeded and written `Skipped` unconditionally, with no "does another
        // live route reach it?" check. The shape that breaks: `A →(cond)→ Review → Publish` and
        // `A →(else)→ Publish`. With the condition true, the losing edge `A→Publish` skipped
        // **Publish** while Review was still running; Review completed, Publish was already
        // terminal, and `Skipped` satisfies dependents — so the graph settled Complete with the
        // publish step never executed. No error and no stall.
        //
        // Confirmed against `liveEdges`, which by this point has both losers and definitely-false
        // edges removed, so "a live gating edge still points here" is exactly the surviving-route
        // question. A genuine loser has none and is still skipped.
        const confirmedSkipSeeds = new Set(ConfirmSkipSeeds([...resolution.skipSeedTaskIDs], liveEdges));

        const nodes: TaskGraphNode[] = children.map((c) => ({ id: c.ID, status: c.Status as TaskGraphNodeStatus }));

        return {
            nodes,
            edges: liveEdges,
            entityById,
            unreachableTaskIDs,
            skipSeedTaskIDs: confirmedSkipSeeds,
            // Exclusive holds and ordinary-condition holds are the same state and share one set:
            // "we cannot tell yet, so nothing may claim this."
            holdTaskIDs: new Set([...resolution.holdTaskIDs, ...heldByCondition]),
            handledFailureIDs: await this.computeHandledFailures(provider, parentTaskID, nodes, liveEdges),
        };
    }

    /**
     * Reports an unevaluable condition ONCE per edge, not once per poll.
     *
     * Eligibility is recomputed every cycle, so an unqualified LogError here would repeat every few
     * seconds for as long as the graph is held — which buries the one line that matters under
     * thousands of copies of itself. Keyed by edge id plus the failure text, so a condition that
     * starts failing differently is reported again.
     */
    private logUnevaluableConditionOnce(dep: MJTaskDependencyEntity, errorMessage: string | undefined): void {
        const key = `${dep.ID}:${errorMessage ?? ''}`;
        if (this.reportedUnevaluableConditions.has(key)) return;
        this.reportedUnevaluableConditions.add(key);
        LogError(
            `[TaskGraphDispatcher] Dependency ${dep.ID} has an unevaluable condition ` +
            `(${errorMessage}); condition text: ${JSON.stringify(dep.Condition)}. ` +
            `Task ${dep.TaskID} is HELD — it will not run and will not be skipped until the ` +
            `condition can be evaluated. The graph reports as stalled while this holds.`,
        );
    }

    /**
     * Decides whether a conditional dependency edge is live.
     *
     * The condition sees the upstream task's outcome — its status and parsed output — which is the
     * only information a runtime graph has to branch on. Returns `'drop'` only on a definite false;
     * an unevaluable condition keeps the edge for the reason stated at the call site.
     */
    private evaluateEdgeCondition(
        dep: MJTaskDependencyEntity,
        entityById: Map<string, MJTaskEntity>,
    ): 'keep' | 'drop' | 'hold' {
        const upstream = entityById.get(dep.DependsOnTaskID);
        if (!upstream) return 'keep';

        // TERMINALITY GUARD — fixes a latent bug, not a hypothetical one.
        //
        // Without it, every conditional edge is evaluated on every poll cycle, including while its
        // origin is still Pending. A condition like `succeeded` is then a DEFINITE FALSE, the edge
        // is dropped, and the target is Blocked at wave one — permanently, before the origin ever
        // ran. That kills any conditioned linear chain, which is the most common flow shape there
        // is.
        //
        // A non-terminal origin is UNDECIDED, and 'keep' is the safe reading of undecided: the
        // prerequisite gate already prevents the target starting early, so keeping the edge costs
        // nothing and dropping it is irreversible.
        if (!TERMINAL_FOR_CONDITIONS.has(upstream.Status)) return 'keep';

        let output: unknown = null;
        if (upstream.OutputPayload) {
            try { output = JSON.parse(upstream.OutputPayload); }
            catch { /* a malformed payload is not grounds to drop a prerequisite */ }
        }

        const result = this.conditionEvaluator.Evaluate(dep.Condition!, this.buildConditionContext(upstream, output));

        if (!result.Success) {
            // UNDECIDED — not satisfied, not false. This returned 'keep', and the comment claimed
            // keeping the edge "stalls the graph visibly". That holds only while the origin is
            // non-terminal; conditions are only evaluated once it IS terminal (the guard above), and
            // a kept edge from a Complete origin is a SATISFIED PREREQUISITE. So a broken guard —
            // a typo, a TypeError — executed the work it was guarding, irreversibly if that work is
            // an action with side effects.
            //
            // The layer's own contract says the opposite ("A condition that fails to evaluate does
            // NOT open the gate", task-graph-spec.ts), the legacy walker refused the edge, and
            // exclusive groups already HOLD. Ordinary edges were the one dialect with inverted
            // failure semantics.
            //
            // Hold, don't drop: the target may have other live routes, and dropping would let it be
            // skipped as unreachable — turning "we cannot tell" into "definitely not taken".
            this.logUnevaluableConditionOnce(dep, result.ErrorMessage);
            return 'hold';
        }
        return result.Value ? 'keep' : 'drop';
    }



    /**
     * An exclusive edge's condition as a three-way outcome.
     *
     * `ResolveExclusiveGroups` needs to tell "false" from "could not be evaluated": the first loses
     * the branch, the second holds the whole group. The generic keep/drop path cannot express that
     * difference, which is why exclusive edges take this route instead.
     */
    private evaluateExclusiveCondition(
        dep: MJTaskDependencyEntity,
        entityById: Map<string, MJTaskEntity>,
    ): EdgeConditionOutcome {
        if (!dep.Condition?.trim()) return 'satisfied';
        const upstream = entityById.get(dep.DependsOnTaskID);
        if (!upstream) return 'unevaluable';

        let output: unknown = null;
        if (upstream.OutputPayload) {
            try { output = JSON.parse(upstream.OutputPayload); } catch { /* malformed payload */ }
        }
        const result = this.conditionEvaluator.Evaluate(dep.Condition, this.buildConditionContext(upstream, output));
        if (!result.Success) return 'unevaluable';
        return result.Value ? 'satisfied' : 'unsatisfied';
    }

    /**
     * Everything an edge condition can see — the SUPERSET of both dialects.
     *
     * A flow condition is written against `payload` / `stepResult` / `flowContext` / `data` /
     * `context`; the dispatcher's own conditions are written against `status` / `succeeded` /
     * `failed` / `output` / `errorMessage`. Compiling flows onto this engine without the flow
     * dialect would make every `payload.x` condition evaluate against nothing — silently, since an
     * undefined property is simply falsy. Both dialects are readable here so a condition means the
     * same thing on either engine.
     *
     * `payload` is the ORIGIN task's post-step snapshot. There is deliberately no "graph-wide
     * payload": each task's output is its own, and inventing a merged one would give conditions a
     * value the flow engine never had.
     */
    private buildConditionContext(upstream: MJTaskEntity, output: unknown): Record<string, unknown> {
        const envelope = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
        const succeeded = upstream.Status === 'Complete';
        return {
            // dispatcher dialect — unchanged
            status: upstream.Status,
            succeeded,
            failed: upstream.Status === 'Failed',
            output,
            errorMessage: upstream.ErrorMessage ?? null,
            // flow dialect
            payload: envelope.payload ?? output,
            stepResult: { Success: succeeded, step: upstream.Name, result: envelope.result ?? output },
            flowContext: { currentStepId: upstream.ID, completedSteps: [], executionPath: [], stepCount: 0 },
            data: envelope.data ?? {},
            context: envelope.context ?? {},
        };
    }

    /** Parsed `OutputPayload` of each completed dependency, keyed by that task's ID. */
    private async loadDependencyOutputs(provider: IMetadataProvider, taskID: string): Promise<Map<string, unknown>> {
        const outputs = new Map<string, unknown>();
        const rv = RunView.FromMetadataProvider(provider);
        // BypassCache: an upstream task's OutputPayload is written on the completion path, so a
        // cached read here can hand a dependent task the previous run's output — or none at all.
        const deps = await rv.RunView<MJTaskDependencyEntity>(
            { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID='${taskID}'`, ResultType: 'entity_object', BypassCache: true },
            this.contextUser,
        );
        for (const dep of (deps.Success ? deps.Results : []) ?? []) {
            const upstream = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (!(await upstream.Load(dep.DependsOnTaskID))) continue;
            if (!upstream.OutputPayload) continue;
            try { outputs.set(dep.DependsOnTaskID, JSON.parse(upstream.OutputPayload)); }
            catch (e) { LogError(`[TaskGraphDispatcher] Task ${dep.DependsOnTaskID} has malformed OutputPayload: ${e}`); }
        }
        return outputs;
    }

    /**
     * Runs one task's body, whatever kind of step it is.
     *
     * **Routing is on `StepType`, not on which key happens to be set.** A loop step carries the same
     * `ActionID` or `AgentID` as an ordinary step — that key is what the loop *repeats* — so the old
     * `task.ActionID ? action : agent` test would have run a loop exactly once and called it done.
     * `StepType` is the only field that distinguishes them.
     *
     * Every branch is normalized to one shape so the recording path above stays single: an action has
     * no agent run to point at, because its forensics live in `ActionExecutionLog` instead.
     */
    private async runTaskBody(
        task: MJTaskEntity,
        provider: IMetadataProvider,
        inputPayload: unknown,
        dependencyOutputs: Map<string, unknown>,
    ): Promise<TaskBodyOutcome> {
        const payload = this.mergedPayload(inputPayload, dependencyOutputs);
        const config = task.ConfigurationObject;

        // A loop's own step type decides how many times its body runs; the body itself is dispatched
        // through the very same runners as a one-shot step.
        if (task.StepType === 'ForEach' || task.StepType === 'While') {
            return { ...await this.runLoopTask(task, provider, payload, dependencyOutputs), PayloadAtStart: payload };
        }

        const { params, errors } = BuildMappedInput(config?.inputMapping, { payload });
        for (const e of errors) LogError(`[TaskGraphDispatcher] Task ${task.ID}: ${e}`);
        // `payload`, NOT `inputPayload` — the MERGED value computed above, which includes what every
        // dependency produced.
        //
        // A step with an input mapping got exactly the parameters it declared; a step WITHOUT one
        // fell back to the raw input and therefore saw nothing any earlier step had produced. For a
        // Prompt step — which declares no mapping by design, because it reads the whole payload
        // through `{{ _CURRENT_PAYLOAD }}` — that meant the placeholder rendered `{}` and the model
        // was asked to write from an empty brief.
        //
        // It answered anyway. The Content Pipeline's draft step said "the research data was empty",
        // which was TRUE of what it had been handed while twenty research results sat in the
        // dependency outputs beside it, and the reviewer then rejected the draft for saying so.
        // Every layer looked like it was working.
        const effectiveInput = Object.keys(params).length > 0 ? params : payload;

        if (task.StepType === 'Prompt') {
            if (!this.promptRunner) {
                // Not a failure: "nobody here can run this" is not "this ran and did not work".
                return { Success: false, AgentRunID: null, ErrorMessage: 'No prompt runner is loaded on this host.' };
            }
            const promptResult = await this.promptRunner.RunPromptForTask({
                TaskID: task.ID,
                PromptID: task.PromptID!,
                InputPayload: effectiveInput,
                DependencyOutputs: dependencyOutputs,
                TemplateParameters: config?.prompt?.templateParameters,
                Provider: provider,
                ContextUser: this.contextUser,
            });

            // A prompt's response is DEEP-MERGED into the payload rather than replacing it. A prompt
            // answers one question; replacing the payload with its answer would discard everything
            // the steps before it established, which is how a late step loses the data it depends on.
            const merged = promptResult.Success && promptResult.Output && typeof promptResult.Output === 'object'
                ? deepMergePayload(payload, promptResult.Output as Record<string, unknown>)
                : payload;

            return {
                Success: promptResult.Success,
                AgentRunID: null,
                ErrorMessage: promptResult.ErrorMessage,
                Output: this.applyStepOutputMapping(task, merged, merged, config?.outputMapping),
                PayloadAtStart: payload,
                ChatMessage: promptResult.ChatMessage,
                // Returned even when the prompt FAILED. A failed prompt still cost tokens, and a
                // cost rollup that silently omits failures under-reports exactly the runs someone
                // is most likely to be investigating.
                PromptRunID: promptResult.PromptRunID,
            };
        }

        const raw = task.ActionID
            ? { ...await this.actionRunner!.RunActionForTask({
                TaskID: task.ID,
                ActionID: task.ActionID,
                InputPayload: effectiveInput,
                DependencyOutputs: dependencyOutputs,
                Provider: provider,
                ContextUser: this.contextUser,
            }), AgentRunID: null }
            : await this.runAgentNode(task, provider, effectiveInput, dependencyOutputs);

        return {
            ...raw,
            Output: this.applyStepOutputMapping(task, payload, raw.Output, config?.outputMapping),
            PayloadAtStart: payload,
        };
    }

    /**
     * Runs a loop step: its body once per iteration, with the item and index in scope.
     *
     * The loop's own `Configuration` supplies the definition; the row's `ActionID` / `AgentID`
     * supplies what to repeat. Per-iteration inputs are resolved fresh each pass — the bindings are
     * merged into the payload before the mapping is applied, which is how a body can reference the
     * current item at all.
     */
    private async runLoopTask(
        task: MJTaskEntity,
        provider: IMetadataProvider,
        payload: Record<string, unknown>,
        dependencyOutputs: Map<string, unknown>,
    ): Promise<TaskBodyOutcome> {
        const config = task.ConfigurationObject;
        const op = task.StepType === 'ForEach' ? config?.forEach : config?.while;
        if (!op) {
            return {
                Success: false,
                AgentRunID: null,
                ErrorMessage: `"${task.Name}" is a ${task.StepType} step with no loop settings, so there is nothing to repeat.`,
            };
        }

        // A prompt body has no params of its own — it receives the payload (with the loop bindings
        // merged in) through the placeholder, so an empty mapping is correct rather than missing.
        const bodyMapping = (op.action?.params ?? {}) as Record<string, unknown>;

        // The BODY's output mapping, applied once per pass — see `foldIterationOutput`.
        //
        // It used to be applied a single time after the loop finished, against the accumulated
        // payload. That is the wrong moment in two ways at once: the mapping names an output
        // PARAMETER of the body, which no longer exists by then, and a mapping like
        // `"Items": "results[]"` can only append per pass. So every pass merged its raw result into
        // the shared payload instead, each overwriting the last, and the mapping matched nothing and
        // wrote nothing. A ForEach over five items reported five successes and kept item five.
        const bodyOutputMapping = op.action?.outputMapping ?? op.prompt?.outputMapping;

        // Where this step sits in its graph, resolved ONCE rather than per iteration. A loop body is
        // dispatched exactly like a one-shot step and needs the same two things: the run that
        // submitted the graph (so a spawned run gets a ParentRunID and is visible to the tree and to
        // cost), and the continuation depth (so the recursion cap still applies). Omitting them made
        // loop bodies second-class in every dimension — and reopened the unbounded-recursion hole
        // THROUGH loops, since each spawned run restarted the chain at zero.
        const graphContext = await this.graphContext(provider, task);

        // THE LOOP'S PAYLOAD ACCUMULATES. Each iteration's output merges in, and the next iteration
        // — and the While condition — sees it. Without this the condition closure re-read the
        // payload as it was when the loop STARTED, so a `while payload.brandOK !== true` could never
        // become false: the loop burned every iteration re-examining the original input and always
        // took the give-up branch, making the other branch unreachable. The loop ran, reported
        // success, and its result was predetermined.
        let livePayload: Record<string, unknown> = { ...payload };

        // One entry per pass, so the loop's work exists somewhere the platform can see it. Without
        // this a loop is a single childless node: the run tree reaches nested work through six links
        // and an iteration is none of them, so the passes were invisible to the timeline AND their
        // spend was missing from the settlement rollup. See ITaskStepRuntime.iterations.
        const iterationTrace: MJTaskEntity_ITaskLoopIteration[] = [];

        // Bounds what the trace's payloads may cost. The pointers are never budgeted — those are the
        // durable record of the work and must survive whatever the payloads do.
        const budget = new IterationPayloadBudget();

        const invokeBody: LoopBodyInvoker = async ({ Index, Bindings }) => {
            // Bindings go INTO the payload rather than beside it, so an authored mapping reaches the
            // current item the same way it reaches anything else: `payload.<itemVariable>`.
            const iterationPayload = { ...livePayload, ...Bindings };
            const resolved = ResolveMappedInput(bodyMapping, { payload: iterationPayload }) as Record<string, unknown>;

            /**
             * Folds an iteration's output into the running payload the next pass will see, and
             * records what the pass produced.
             *
             * The trace is written HERE rather than after the loop because a loop that fails partway
             * still ran the passes before it, and their runs are real spend that must not vanish
             * because the loop as a whole did not finish.
             */
            const absorb = <T extends { Success: boolean; Output?: unknown; ErrorMessage?: string; PromptRunID?: string; AgentRunID?: string; ActionLogID?: string }>(outcome: T, bodyInput: unknown): T => {
                livePayload = this.foldIterationOutput(task, livePayload, outcome.Output, bodyOutputMapping);
                iterationTrace.push({
                    index: Index,
                    // What THIS pass was handed and what it gave back — not the loop's running
                    // payload before and after it.
                    //
                    // A pass has no row of its own, so without these there is nowhere its work can be
                    // recorded: every iteration presented null on both sides and the run view could
                    // say nothing about any single pass, which for a loop is the only interesting
                    // question. But recording the RUNNING payload on both sides — the obvious reading
                    // of "before and after" — is quadratic: each pass would hold a full copy of
                    // everything every earlier pass accumulated. A five-iteration demo produced a
                    // 121KB Configuration that way; the same loop over fifty items would produce
                    // megabytes, in a column every reader of the row pays to load.
                    //
                    // The pass's own input and output are what a reader actually wants ("what did
                    // pass three do?"), and they are constant-sized per pass.
                    payloadAtStart: budget.Take(bodyInput),
                    payloadAtEnd: budget.Take(outcome.Output),
                    promptRunID: outcome.PromptRunID,
                    agentRunID: outcome.AgentRunID,
                    // An ACTION body records its log here. Omitting it left an action-bodied pass
                    // with no pointer at all — no cost, no timing, nothing to open — and the tree,
                    // seeing neither a prompt run nor an agent run, fell through to its last branch
                    // and called the pass a Sub-Agent. A loop over a web search then showed five
                    // sub-agent runs that never existed.
                    actionLogID: outcome.ActionLogID,
                    success: outcome.Success,
                    errorMessage: outcome.ErrorMessage,
                });
                return outcome;
            };

            // A prompt body is checked FIRST because it is the only one whose id lives in its own
            // column: a loop repeating a prompt has PromptID set and both ActionID and AgentID null,
            // so falling through to the agent branch would dereference a null agent id.
            if (task.StepType && task.PromptID && !task.ActionID) {
                if (!this.promptRunner) {
                    return { Success: false, ErrorMessage: 'No prompt runner is loaded on this host.' };
                }
                return absorb(await this.promptRunner.RunPromptForTask({
                    TaskID: task.ID,
                    PromptID: task.PromptID,
                    // The ITERATION payload, not the mapped params. An action body declares its
                    // inputs and gets exactly those; a prompt body declares none — it receives the
                    // whole payload through the placeholder, and the loop's item and index are
                    // merged INTO that payload. Passing the mapped result here handed the prompt an
                    // empty object, so every iteration asked the model to describe nothing and got
                    // five confident answers about nothing back.
                    InputPayload: iterationPayload,
                    DependencyOutputs: dependencyOutputs,
                    // The loop's bindings become TEMPLATE VARIABLES, so an author writes
                    // `{{ field }}` for the item the loop is on — which is what `itemVariable` is
                    // for, and what anyone reading the step's configuration expects. Reaching it
                    // through the payload placeholder instead works but is not discoverable, and
                    // getting it wrong is silent: the variable renders empty and the model answers
                    // confidently about nothing.
                    TemplateParameters: { ...stringifyBindings(Bindings), ...op.prompt?.templateParameters },
                    Provider: provider,
                    ContextUser: this.contextUser,
                }), iterationPayload);
            }

            if (task.ActionID) {
                return absorb(await this.actionRunner!.RunActionForTask({
                    TaskID: task.ID,
                    ActionID: task.ActionID,
                    InputPayload: resolved,
                    DependencyOutputs: dependencyOutputs,
                    Provider: provider,
                    ContextUser: this.contextUser,
                }), resolved);
            }

            const agentInput = Object.keys(resolved).length > 0 ? resolved : iterationPayload;
            return absorb(await this.agentRunner.RunAgentForTask({
                TaskID: task.ID,
                AgentID: task.AgentID!,
                // The ITERATION payload when the body declares no inputs of its own. A sub-agent
                // body has no `params`, so the mapped result is `{}` — every iteration was handing
                // the agent nothing and asking it to work from that.
                InputPayload: agentInput,
                DependencyOutputs: dependencyOutputs,
                ContinuationDepth: graphContext.Depth,
                SubmittingAgentRunID: graphContext.SubmittingAgentRunID,
                Provider: provider,
                ContextUser: this.contextUser,
            }), agentInput);
        };

        const outcome = task.StepType === 'ForEach'
            ? await RunForEachLoop(op as ForEachOperation, { payload }, invokeBody)
            : await RunWhileLoop(
                op as WhileOperation,
                (iteration) => this.conditionEvaluator.Evaluate(
                    (op as WhileOperation).condition,
                    // BOTH forms, because a workflow should not have two condition dialects. An
                    // EDGE condition is written `payload.brandOK !== true`; a loop condition used
                    // to see the payload's keys spread at the top level and nothing named `payload`,
                    // so the same expression that routes an edge failed here with
                    // "payload is not defined". The spread stays for conditions already written
                    // against it.
                    { ...livePayload, payload: livePayload, iteration },
                ),
                invokeBody,
            );

        return {
            Success: outcome.Success,
            AgentRunID: null,
            ErrorMessage: outcome.ErrorMessage,
            // Every pass that ran, including those before a failure — see `iterationTrace`.
            Iterations: iterationTrace.length > 0 ? iterationTrace : undefined,
            // The ACCUMULATED payload — everything the iterations established — not the one the
            // loop started with, which would discard the loop's whole effect on the workflow.
            //
            // Only the STEP's own mapping is applied here. The body's mapping already ran once per
            // pass inside `foldIterationOutput`; applying it again against the accumulated payload
            // is what used to make it match nothing.
            Output: this.applyStepOutputMapping(task, livePayload, outcome.Output, config?.outputMapping),
        };
    }

    /**
     * Folds one pass's result into the loop's running payload.
     *
     * **With a body mapping**, the pass's declared outputs are filed where the author said to put
     * them — including `name[]`, which appends, so a ForEach can collect one entry per item. That is
     * the whole point of a loop over a collection, and it is only expressible per pass.
     *
     * **Without one**, the raw result is deep-merged, which is the pre-existing behaviour and the
     * right default for a `While` that converges on a value: each pass refines what the condition
     * reads. It is the wrong default for a ForEach that collects — hence the mapping.
     *
     * An unmapped output is reported per pass rather than swallowed, for the same reason
     * {@link applyStepOutputMapping} reports it: a mapping that names something the body never
     * returned means the pass did work that went nowhere, while everything reports success.
     */
    private foldIterationOutput(
        task: MJTaskEntity,
        livePayload: Record<string, unknown>,
        output: unknown,
        bodyOutputMapping: string | undefined,
    ): Record<string, unknown> {
        if (!output || typeof output !== 'object' || Array.isArray(output)) return livePayload;
        const source = output as Record<string, unknown>;

        if (!bodyOutputMapping) return deepMergePayload(livePayload, source);

        // Applied ONTO a deep copy of the running payload, not into a fresh object: `name[]` appends,
        // and appending is meaningless without the list already there. The copy is deep because the
        // trace has already recorded earlier passes' payloads — mutating a shared nested array would
        // retroactively rewrite what those passes are recorded as having seen.
        const { updates, errors, unmapped } = ApplyOutputMapping(source, bodyOutputMapping, structuredClone(livePayload));
        for (const e of errors) LogError(`[TaskGraphDispatcher] Task ${task.ID} loop body: ${e}`);
        if (unmapped?.length) {
            LogError(
                `[TaskGraphDispatcher] '${task.Name}' loop body mapped output(s) it did not return: ` +
                `${unmapped.join(', ')}. The pass returned: ${Object.keys(source).join(', ') || '(nothing)'}. ` +
                `Those payload values were NOT written, so anything downstream reading them sees nothing.`,
            );
        }
        // `updates` IS the copy that was applied onto, so it is already the complete next payload.
        return updates;
    }

    /**
     * Files a step's result into the payload it hands downstream.
     *
     * **This is what makes a branch condition possible.** A workflow that branches on
     * `payload.stockPrice` has that value only because this step mapped `CurrentPrice -> stockPrice`.
     * Without it the condition reads `undefined` — merely falsy — so the workflow takes the other
     * branch, finishes, and reports success with nothing to indicate anything went wrong.
     *
     * The incoming payload is carried through as well as the update, so a value written three steps
     * back is still readable here. Returning only this step's own output is what used to limit a
     * condition's view to its immediate predecessor.
     */
    private applyStepOutputMapping(
        task: MJTaskEntity,
        payload: Record<string, unknown>,
        output: unknown,
        outputMapping: string | undefined,
    ): unknown {
        // No mapping: MERGE the step's output over the payload rather than replacing it.
        //
        // Replacing is what made the Content Pipeline's exclusive pair unreachable. A While loop's
        // own output is a SUMMARY — `{iterations, succeeded, failed, results}` — so returning it
        // discarded the payload the iterations had built, including the `brandOK` the reviewer had
        // just set to true. The edges read `payload.brandOK === true` and `!== true`; against a
        // summary the first is false and the second is true, so the give-up branch won on EVERY run
        // no matter what the reviewer decided. The approved branch was unreachable in practice while
        // being perfectly reachable on the canvas.
        //
        // This is the same rule the mapped path already follows two lines down, and the same rule
        // the doc comment above states. The no-mapping branch was simply not following it.
        if (!outputMapping) {
            return output && typeof output === 'object' && !Array.isArray(output)
                ? { ...payload, ...(output as Record<string, unknown>) }
                : output ?? payload;
        }

        const source = output && typeof output === 'object' ? output as Record<string, unknown> : { value: output };
        const { updates, errors, unmapped } = ApplyOutputMapping(source, outputMapping);
        for (const e of errors) LogError(`[TaskGraphDispatcher] Task ${task.ID}: ${e}`);

        // A mapping that names an output the step never produced discards that step's work while
        // the step reports Complete. It is not fatal — an action may emit a parameter only on some
        // paths — but it must not be silent, and naming what WAS returned turns a multi-table
        // forensic exercise into one line. The Content Pipeline demo lost an entire research pass
        // this way, every run, because its mapping named another action's parameter.
        if (unmapped?.length) {
            LogError(
                `[TaskGraphDispatcher] '${task.Name}' mapped output(s) the step did not return: ` +
                `${unmapped.join(', ')}. The step returned: ${Object.keys(source).join(', ') || '(nothing)'}. ` +
                `Those payload values were NOT written, so anything downstream reading them sees nothing.`,
            );
        }

        return { ...payload, ...updates };
    }

    /**
     * Runs an Agent step, telling the runner where in the graph it sits.
     *
     * Depth and provenance are read together because they come from the same row: the graph's parent
     * task knows both how many continuation hops led here and which run submitted it.
     */
    private async runAgentNode(
        task: MJTaskEntity,
        provider: IMetadataProvider,
        effectiveInput: unknown,
        dependencyOutputs: Map<string, unknown>,
    ): Promise<TaskBodyOutcome> {
        const context = await this.graphContext(provider, task);
        return this.agentRunner.RunAgentForTask({
            TaskID: task.ID,
            AgentID: task.AgentID!,
            InputPayload: effectiveInput,
            DependencyOutputs: dependencyOutputs,
            ContinuationDepth: context.Depth,
            SubmittingAgentRunID: context.SubmittingAgentRunID,
            Provider: provider,
            ContextUser: this.contextUser,
        });
    }

    /**
     * Completes the agent run that parked on this graph.
     *
     * **This is the other half of submit-and-detach.** A run that dispatches a graph does not
     * complete at submission — it ends `Paused`, because reporting `Completed` above a workflow
     * where nothing has happened yet is a claim the row cannot support. The run's lifecycle is
     * finished HERE, when the graph it was waiting on actually settles, which is the first moment
     * the answer exists.
     *
     * Doing it from the dispatcher rather than by awaiting in the agent is what keeps the properties
     * that made detach right in the first place: a graph containing a human approval can park for
     * days without holding a conversation turn open, and a graph reclaimed by another instance after
     * a crash still settles its submitting run, because the settling happens wherever the graph
     * finishes rather than wherever it started.
     *
     * **Only a parked run is touched.** A run that is already `Completed`, `Failed` or `Cancelled`
     * reached that state for its own reasons — a second graph settling later, a run the user
     * cancelled, a run that failed after submitting — and overwriting it would rewrite history from
     * the outside. The `Paused` predicate is the whole guard.
     *
     * @param graphStatus the parent rollup's status: what the workflow as a whole did
     */
    private async settleSubmittingRun(
        provider: IMetadataProvider,
        parent: MJTaskEntity,
        graphStatus: TaskGraphNodeStatus,
    ): Promise<void> {
        const meta = ParseTaskGraphParentMetadata(parent.InputPayload);
        if (!meta.submittedByAgentRunID) return; // a scheduled or remote-triggered graph has nobody waiting

        try {
            const run = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await run.Load(meta.submittedByAgentRunID))) {
                LogError(`[TaskGraphDispatcher] Could not load run ${meta.submittedByAgentRunID} to settle it against graph ${parent.ID}.`);
                return;
            }
            if (run.Status !== 'Paused') return;

            // The workflow's outcome becomes the run's outcome. A graph that ended any way other than
            // Complete did not do what the run started it to do, and a run reporting success over it
            // would be the same untruth in a different place.
            const succeeded = graphStatus === 'Complete';
            run.Status = succeeded ? 'Completed' : 'Failed';
            run.Success = succeeded;
            run.CompletedAt = new Date();
            if (!succeeded) {
                const reason = `The workflow "${parent.Name}" ended ${graphStatus}.`;
                run.ErrorMessage = run.ErrorMessage ? `${run.ErrorMessage}\n\n${reason}` : reason;
            }

            if (!(await run.Save())) {
                // Left parked rather than forced. A run stuck at Paused is visibly unfinished, which
                // is a state someone can investigate; a run flipped to Completed by a write that did
                // not land would be the same lie this whole change removes.
                LogError(
                    `[TaskGraphDispatcher] Could not settle run ${run.ID} against graph ${parent.ID}: ` +
                    `${run.LatestResult?.CompleteMessage ?? 'unknown error'}. It remains Paused.`,
                );
                return;
            }
            LogStatus(`[TaskGraphDispatcher] Run ${run.ID} settled ${run.Status} — workflow "${parent.Name}" ended ${graphStatus}.`);
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Could not settle the run waiting on graph ${parent.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Gives every step that lacks one a position, once the graph has finished.
     *
     * **Why the run stores geometry at all.** A `TaskGraphSpec` is a logical structure with no
     * layout field, so a graph an agent emitted has no opinion about where its boxes go. Every
     * viewer was therefore laying it out for itself at render time — and a viewer that failed to
     * (because the canvas measures nodes it has not drawn yet) fell back to every node at the
     * origin, piled on one another, with the zoom-to-fit that follows fitting a one-node bounding
     * box. Settling it once, server-side, means the agent-run canvas, the Workflows runs tab and
     * anything built later all draw the same picture, and none of them has to compute it.
     *
     * **An authored position is never overwritten.** A workflow compiled from a Flow agent carries
     * the arrangement someone dragged into place; replacing it with an algorithm's guess would
     * discard a deliberate act. Only steps with no geometry get one, so a partially-arranged graph
     * keeps what it has.
     *
     * Failure here is logged and swallowed: this is presentation. A graph whose work completed must
     * not be reported as failed because its picture could not be saved.
     */
    private async persistComputedLayout(graph: GraphState): Promise<void> {
        try {
            const needsLayout = [...graph.entityById.values()].filter(
                (t) => !this.parseConfiguration(t)?.layout,
            );
            if (needsLayout.length === 0) return;

            // Laid out over the WHOLE graph, not just the nodes missing geometry: position depends on
            // where a node sits in the topology, and a layout computed over a subset would place its
            // nodes as though the rest of the workflow did not exist.
            const edges: GraphLayoutEdge[] = graph.edges.map((e) => ({ From: e.dependsOnTaskId, To: e.taskId }));
            const positions = LayoutGraphNodes([...graph.entityById.keys()], edges, { Direction: 'LR' });

            for (const task of needsLayout) {
                const position = positions.get(task.ID);
                if (!position) continue;
                const existing = this.parseConfiguration(task);
                const merged: MJTaskEntity_ITaskStepConfiguration = {
                    ...existing,
                    layout: { x: position.X, y: position.Y },
                };
                task.Configuration = JSON.stringify(merged);
                if (!(await task.Save())) {
                    LogError(`[TaskGraphDispatcher] Could not save computed layout for ${task.ID}: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        } catch (e) {
            LogError(`[TaskGraphDispatcher] Could not compute a layout for the settled graph: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * The earliest moment any step in the graph began, or null when none has.
     *
     * Null is a real answer — a graph whose tasks are all still Pending has not started — and is
     * deliberately not collapsed to "now", which would date the graph from whenever this pass
     * happened to run.
     */
    private earliestStart(entityById: Map<string, MJTaskEntity>): Date | null {
        let earliest: Date | null = null;
        for (const entity of entityById.values()) {
            if (!entity.StartedAt) continue;
            if (earliest === null || entity.StartedAt < earliest) earliest = entity.StartedAt;
        }
        return earliest;
    }

    /**
     * The step's Configuration with this run's artefacts folded in, or `undefined` to leave it be.
     *
     * **Merged into the authored bag, never written over it.** The Configuration column holds the
     * step's definition — its loop body, its mappings, its policy, the position someone dragged it
     * to. Writing a fresh object containing only `runtime` would erase all of that the first time a
     * prompt step completed, which is the kind of loss that surfaces much later as a workflow that
     * mysteriously stopped mapping its output.
     *
     * Returns `undefined` when there is nothing to record, so the guarded write omits the column
     * rather than rewriting it with what it already held.
     */
    private configurationWithRuntime(
        task: MJTaskEntity,
        promptRunID: string | undefined,
        actionLogID: string | undefined,
        iterations?: MJTaskEntity_ITaskLoopIteration[],
        payloadAtStart?: Record<string, unknown>,
    ): string | undefined {
        if (!promptRunID && !actionLogID && !iterations?.length && !payloadAtStart) return undefined;

        const existing = this.parseConfiguration(task);
        const merged: MJTaskEntity_ITaskStepConfiguration = {
            ...existing,
            runtime: {
                ...existing?.runtime,
                ...(promptRunID ? { promptRunID } : {}),
                ...(actionLogID ? { actionLogID } : {}),
                // Replaced wholesale rather than appended: this is the trace of the loop's LAST
                // execution, and a retried step that concatenated would report a loop that ran twice
                // as many passes as it did.
                ...(iterations?.length ? { iterations } : {}),
                // The resolved before-state, so the run view has something to diff the output
                // against. NOT written to Task.InputPayload, which holds the AUTHORED input and
                // round-trips back out as part of the spec.
                ...(payloadAtStart ? { payloadAtStart } : {}),
            },
        };
        return JSON.stringify(merged);
    }

    /**
     * Reads a step's Configuration bag, tolerating a row whose JSON cannot be parsed.
     *
     * Unparseable configuration is logged rather than thrown: the step has already RUN by the time
     * this is called, and refusing to record its outcome because its definition is malformed would
     * discard the result of real work and leave the task claimed until the claim lapsed.
     */
    private parseConfiguration(task: MJTaskEntity): MJTaskEntity_ITaskStepConfiguration | undefined {
        if (!task.Configuration) return undefined;
        try {
            return JSON.parse(task.Configuration) as MJTaskEntity_ITaskStepConfiguration;
        } catch (e) {
            LogError(
                `[TaskGraphDispatcher] Task ${task.ID} has unparseable Configuration; ` +
                `recording runtime artefacts against an empty bag. ${e instanceof Error ? e.message : String(e)}`,
            );
            return undefined;
        }
    }

    /**
     * The payload a step sees: everything its prerequisites produced, plus its own declared input.
     *
     * **Why the outputs are merged rather than kept per-task.** A flow carried ONE payload that
     * accumulated as it went, so a condition on the edge into step C could read a value step A wrote.
     * Handing each task only its immediate predecessor's output would silently narrow that: the
     * condition reads `undefined`, which is falsy, and the workflow quietly takes a different route
     * than the flow it was compiled from. Merging in dependency order restores the accumulation.
     *
     * Later prerequisites win on a key collision, matching a flow's own last-write-wins behaviour.
     */
    private mergedPayload(inputPayload: unknown, dependencyOutputs: Map<string, unknown>): Record<string, unknown> {
        const merged: Record<string, unknown> = {};
        for (const output of dependencyOutputs.values()) {
            if (output && typeof output === 'object' && !Array.isArray(output)) {
                Object.assign(merged, output as Record<string, unknown>);
            }
        }
        if (inputPayload && typeof inputPayload === 'object' && !Array.isArray(inputPayload)) {
            Object.assign(merged, inputPayload as Record<string, unknown>);
        }
        return merged;
    }
}
