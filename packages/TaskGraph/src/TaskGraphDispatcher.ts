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
    ApplyOutputMapping,
    BuildMappedInput,
    ResolveMappedInput,
    type ForEachOperation,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { IShutdownable, ShutdownRegistry } from '@memberjunction/global';
import { MJTaskEntity, MJTaskDependencyEntity, MJAIAgentRunEntity, MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import type { MJTaskEntity_ITaskStepConfiguration } from '@memberjunction/core-entities';
import { TaskClaimStore } from './TaskClaimStore';
import { DispatcherConditionEvaluator } from './DispatcherConditionEvaluator';
import { RunForEachLoop, RunWhileLoop, type LoopBodyInvoker } from './TaskLoopExecutor';
import { NotificationEngine } from '@memberjunction/notifications';

/** Metadata-seeded notification type for human tasks (metadata/notifications/.task-assignment-type.json). */
const HUMAN_TASK_NOTIFICATION_TYPE = 'Task Assignment';

/**
 * Written to a human task's `ClaimedBy` once its assignee has been told it is ready.
 *
 * A human task has no executor, so the claim column is otherwise unused — which makes it the natural
 * place to record a fact that must survive a restart. Reconciliation already exempts human tasks
 * from reclamation, so this value is never mistaken for a live claim.
 */
const HUMAN_TASK_NOTIFIED_MARKER = '__human-notified__';
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
                    Configuration: this.configurationWithRuntime(task, result.PromptRunID),
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
    private async propagateAndRollup(provider: IMetadataProvider): Promise<void> {
        for (const parentID of await this.findActiveGraphIDs(provider)) {
            // Human steps settle BEFORE the graph state is read, so an answer given since the last
            // poll is already reflected when eligibility and rollup are computed. Doing it after
            // would delay every dependent branch by a full poll interval for no reason — and on a
            // graph whose only remaining work is downstream of a person, that is the difference
            // between "answered and moving" and "answered and apparently still stuck".
            await this.expireOverdueRequests(provider, parentID);
            await this.settleAnsweredHumanTasks(provider, parentID);

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

            if (IsGraphStalled(graph.nodes, graph.edges)) {
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
            if (parent.Status !== rollup.status || parent.PercentComplete !== rollup.percentComplete) {
                parent.Status = rollup.status;
                parent.PercentComplete = rollup.percentComplete;
                if (rollup.isTerminal) parent.CompletedAt = new Date();
                await parent.Save();
            }

            if (rollup.isTerminal) {
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
     * A graph with no submitting run (a scheduled job, a remote-operation caller) simply has nobody
     * to credit — its own Task rows still carry the truth, and this returns quietly.
     */
    private async rollUpCostToSubmittingRun(provider: IMetadataProvider, parent: MJTaskEntity): Promise<void> {
        const meta = ParseTaskGraphParentMetadata(parent.InputPayload);
        if (!meta.submittedByAgentRunID) return;

        try {
            const children = await this.loadChildTasks(provider, parent.ID);
            const runIDs = [...new Set(children.map((c) => c.AgentRunID).filter((id): id is string => !!id))];

            const submitting = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await submitting.Load(meta.submittedByAgentRunID))) return;

            // Start from what the run itself spent, so the rollup is a superset rather than a
            // replacement — a Loop agent that both reasoned AND dispatched a graph paid for both.
            let cost = submitting.TotalCost ?? 0;
            let tokens = submitting.TotalTokensUsed ?? 0;
            let promptTokens = submitting.TotalPromptTokensUsed ?? 0;
            let completionTokens = submitting.TotalCompletionTokensUsed ?? 0;

            for (const runID of runIDs) {
                const nested = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
                if (!(await nested.Load(runID))) continue;
                // Prefer the nested run's OWN rollup: if that agent dispatched a graph of its own,
                // its rollup already includes it, and reading TotalCost would lose a whole subtree.
                cost += nested.TotalCostRollup ?? nested.TotalCost ?? 0;
                tokens += nested.TotalTokensUsedRollup ?? nested.TotalTokensUsed ?? 0;
                promptTokens += nested.TotalPromptTokensUsedRollup ?? nested.TotalPromptTokensUsed ?? 0;
                completionTokens += nested.TotalCompletionTokensUsedRollup ?? nested.TotalCompletionTokensUsed ?? 0;
            }

            submitting.TotalCostRollup = cost;
            submitting.TotalTokensUsedRollup = tokens;
            submitting.TotalPromptTokensUsedRollup = promptTokens;
            submitting.TotalCompletionTokensUsedRollup = completionTokens;

            if (!(await submitting.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not record graph cost against run ${meta.submittedByAgentRunID}: ` +
                    `${submitting.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
                return;
            }

            LogStatus(
                `[TaskGraphDispatcher] Credited graph ${parent.ID} to run ${meta.submittedByAgentRunID}: ` +
                `${runIDs.length} nested run(s), ${tokens} token(s), cost ${cost}.`,
            );
        } catch (e) {
            // A failed rollup must never fail the graph. The work finished; only the accounting for
            // it is missing, and a graph marked Failed because its cost could not be summed would be
            // a far worse lie than a cost of null.
            LogError(`[TaskGraphDispatcher] Cost rollup failed for graph ${parent.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
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
     * The marker is written with a compare-and-swap read-back, so two instances reconciling the same
     * completed graph produce one winner rather than two.
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

        if (!(await this.claimContinuation(provider, parent.ID, meta))) return;

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
    private async claimContinuation(
        provider: IMetadataProvider,
        parentID: string,
        meta: TaskGraphParentMetadata,
    ): Promise<boolean> {
        const row = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        if (!(await row.Load(parentID))) return false;

        const current = this.readParentMetadata(row);
        if (current.continuationDeliveredAt) return false; // a peer got there first

        row.InputPayload = JSON.stringify({ ...meta, continuationDeliveredAt: new Date().toISOString() });
        if (!(await row.Save())) {
            LogError(`[TaskGraphDispatcher] Could not mark continuation delivered for ${parentID}; skipping to avoid a duplicate.`);
            return false;
        }
        return true;
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
        // The marker goes down only once a request is genuinely open. A notification storm is the
        // failure the marker exists to prevent, but a MISSING request is worse than a repeated
        // attempt: nothing would appear in anyone's inbox and the workflow would wait forever with
        // no indication why. Retrying on the next poll is the recoverable choice.
        if (!(await this.raiseHumanRequest(task, provider))) return;

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
    private async findActiveGraphIDs(provider: IMetadataProvider): Promise<string[]> {
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
        const [withPendingWork, unsettledParents] = await rv.RunViews([
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
    private async raiseHumanRequest(task: MJTaskEntity, provider: IMetadataProvider): Promise<boolean> {
        try {
            const existing = await this.findOpenRequest(provider, task.ID);
            if (existing) return true;   // already waiting on someone

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
                LogError(
                    `[TaskGraphDispatcher] Task ${task.ID} needs a person, but its workflow has no ` +
                    `agent to ask on behalf of, so no request could be raised.`,
                );
                return false;
            }
            request.AgentID = owningAgentID;
            request.RequestForUserID = task.UserID;
            request.RequestedAt = new Date();
            request.Status = 'Requested';
            request.Request = task.Description || `A workflow is waiting on you to complete "${task.Name}".`;
            // The graph's own run is the provenance a reader follows back to see what led here.
            request.OriginatingAgentRunID = await this.submittingRunOf(provider, task);

            if (!(await request.Save())) {
                LogError(
                    `[TaskGraphDispatcher] Could not raise a request for task ${task.ID}: ` +
                    `${request.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
                return false;
            }
            return true;
        } catch (e) {
            // Never fatal. The task remains Pending and visible; a missing request is recoverable,
            // whereas throwing here would abort the whole dispatch pass for every other branch.
            LogError(`[TaskGraphDispatcher] Could not raise a request for task ${task.ID}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
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

        for (const d of ordinary) {
            if (d.Condition?.trim()) {
                const outcome = this.evaluateEdgeCondition(d, entityById);
                if (outcome === 'drop') { droppedInto.add(d.TaskID); continue; }
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

        const nodes: TaskGraphNode[] = children.map((c) => ({ id: c.ID, status: c.Status as TaskGraphNodeStatus }));

        return {
            nodes,
            edges: liveEdges,
            entityById,
            unreachableTaskIDs,
            skipSeedTaskIDs: new Set(resolution.skipSeedTaskIDs),
            holdTaskIDs: new Set(resolution.holdTaskIDs),
            handledFailureIDs: await this.computeHandledFailures(provider, parentTaskID, nodes, liveEdges),
        };
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
    ): 'keep' | 'drop' {
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
            LogError(
                `[TaskGraphDispatcher] Dependency ${dep.ID} has an unevaluable condition ` +
                `(${result.ErrorMessage}); keeping the edge so the graph stalls visibly rather than ` +
                `running ${dep.TaskID} out of order.`,
            );
            return 'keep';
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
            return this.runLoopTask(task, provider, payload, dependencyOutputs);
        }

        const { params, errors } = BuildMappedInput(config?.inputMapping, { payload });
        for (const e of errors) LogError(`[TaskGraphDispatcher] Task ${task.ID}: ${e}`);
        const effectiveInput = Object.keys(params).length > 0 ? params : inputPayload;

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

        return { ...raw, Output: this.applyStepOutputMapping(task, payload, raw.Output, config?.outputMapping) };
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

        const invokeBody: LoopBodyInvoker = async ({ Bindings }) => {
            // Bindings go INTO the payload rather than beside it, so an authored mapping reaches the
            // current item the same way it reaches anything else: `payload.<itemVariable>`.
            const iterationPayload = { ...livePayload, ...Bindings };
            const resolved = ResolveMappedInput(bodyMapping, { payload: iterationPayload }) as Record<string, unknown>;

            /** Folds an iteration's output into the running payload the next pass will see. */
            const absorb = <T extends { Success: boolean; Output?: unknown }>(outcome: T): T => {
                if (outcome.Output && typeof outcome.Output === 'object' && !Array.isArray(outcome.Output)) {
                    livePayload = deepMergePayload(livePayload, outcome.Output as Record<string, unknown>);
                }
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
                }));
            }

            if (task.ActionID) {
                return absorb(await this.actionRunner!.RunActionForTask({
                    TaskID: task.ID,
                    ActionID: task.ActionID,
                    InputPayload: resolved,
                    DependencyOutputs: dependencyOutputs,
                    Provider: provider,
                    ContextUser: this.contextUser,
                }));
            }

            return absorb(await this.agentRunner.RunAgentForTask({
                TaskID: task.ID,
                AgentID: task.AgentID!,
                // The ITERATION payload when the body declares no inputs of its own. A sub-agent
                // body has no `params`, so the mapped result is `{}` — every iteration was handing
                // the agent nothing and asking it to work from that.
                InputPayload: Object.keys(resolved).length > 0 ? resolved : iterationPayload,
                DependencyOutputs: dependencyOutputs,
                ContinuationDepth: graphContext.Depth,
                SubmittingAgentRunID: graphContext.SubmittingAgentRunID,
                Provider: provider,
                ContextUser: this.contextUser,
            }));
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
            // The ACCUMULATED payload — everything the iterations established — not the one the
            // loop started with, which would discard the loop's whole effect on the workflow.
            Output: this.applyStepOutputMapping(
                task, livePayload, outcome.Output,
                op.action?.outputMapping ?? op.prompt?.outputMapping ?? config?.outputMapping,
            ),
        };
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
        if (!outputMapping) return output ?? payload;

        const source = output && typeof output === 'object' ? output as Record<string, unknown> : { value: output };
        const { updates, errors } = ApplyOutputMapping(source, outputMapping);
        for (const e of errors) LogError(`[TaskGraphDispatcher] Task ${task.ID}: ${e}`);

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
    private configurationWithRuntime(task: MJTaskEntity, promptRunID: string | undefined): string | undefined {
        if (!promptRunID) return undefined;

        const existing = this.parseConfiguration(task);
        const merged: MJTaskEntity_ITaskStepConfiguration = {
            ...existing,
            runtime: { ...existing?.runtime, promptRunID },
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
