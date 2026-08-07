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
 * `@memberjunction/ai-core-plus` — the same functions Phase 1 wired into `TaskOrchestrator`. That is
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
} from '@memberjunction/ai-core-plus';
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity } from '@memberjunction/core-entities';
import { TaskClaimStore } from './TaskClaimStore';
import {
    DEFAULT_DISPATCHER_CONFIG,
    ProviderFactory,
    TaskAgentRunner,
    TaskGraphDispatcherConfig,
} from './types';

/** A graph's children + edges, in both algorithm shape and mutable-entity shape. */
type GraphState = {
    nodes: TaskGraphNode[];
    edges: TaskGraphEdge[];
    entityById: Map<string, MJTaskEntity>;
};

export class TaskGraphDispatcher {
    private readonly config: TaskGraphDispatcherConfig;
    private readonly claims: TaskClaimStore;

    private running = false;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private reconcileTimer: ReturnType<typeof setInterval> | null = null;
    /** Tasks this instance is currently executing — bounds concurrency and drives heartbeats. */
    private readonly inFlight = new Set<string>();
    /** Guards against a slow poll overlapping the next tick. */
    private polling = false;

    constructor(
        private readonly providerFactory: ProviderFactory,
        private readonly agentRunner: TaskAgentRunner,
        private readonly contextUser: UserInfo,
        config: Partial<TaskGraphDispatcherConfig> & Pick<TaskGraphDispatcherConfig, 'InstanceID'>,
    ) {
        this.config = { ...DEFAULT_DISPATCHER_CONFIG, ...config };
        this.claims = new TaskClaimStore(this.config.InstanceID, this.config.ClaimTTLSeconds);
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

        LogStatus(`[TaskGraphDispatcher] Starting as instance '${this.config.InstanceID}'.`);
        await this.Reconcile();

        this.pollTimer = setInterval(() => { void this.pollOnce(); }, 5_000);
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

            const dependencyOutputs = await this.loadDependencyOutputs(provider, taskID);
            let inputPayload: unknown = null;
            if (task.InputPayload) {
                try { inputPayload = JSON.parse(task.InputPayload); }
                catch (e) { LogError(`[TaskGraphDispatcher] Task ${taskID} has malformed InputPayload: ${e}`); }
            }

            const result = await this.agentRunner.RunAgentForTask({
                TaskID: taskID,
                AgentID: task.AgentID!,
                InputPayload: inputPayload,
                DependencyOutputs: dependencyOutputs,
                Provider: provider,
                ContextUser: this.contextUser,
            });

            const recorded = await this.claims.CompleteClaimed(
                provider,
                taskID,
                {
                    Status: result.Success ? 'Complete' : 'Failed',
                    OutputPayload: result.Output != null ? JSON.stringify(result.Output) : null,
                    ErrorMessage: result.ErrorMessage ?? null,
                    AgentRunID: result.AgentRunID ?? null,
                },
                this.contextUser,
            );
            if (!recorded) {
                // The guarded write refused: the row changed underneath us (cancelled, reassigned,
                // or reclaimed). Deferring to whoever owns it now is correct — overwriting would
                // undo a newer, deliberate decision.
                LogError(`[TaskGraphDispatcher] Could not record outcome for ${taskID}; the task is no longer owned by this instance.`);
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
            const graph = await this.loadGraphState(provider, parentID);
            if (graph.nodes.length === 0) continue;

            for (const taskID of ComputeTasksToBlock(graph.nodes, graph.edges)) {
                const entity = graph.entityById.get(taskID);
                if (!entity) continue;
                entity.Status = 'Blocked';
                if (await entity.Save()) {
                    LogStatus(`[TaskGraphDispatcher] Blocked '${entity.Name}' (${taskID}) — a dependency can never be satisfied.`);
                }
            }

            if (IsGraphStalled(graph.nodes, graph.edges)) {
                LogError(`[TaskGraphDispatcher] Graph ${parentID} is stalled: pending work with no satisfiable path.`);
            }

            const fresh = await this.loadGraphState(provider, parentID);
            const rollup = ComputeParentRollup(fresh.nodes);
            const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
            if (!(await parent.Load(parentID))) continue;
            if (parent.Status !== rollup.status || parent.PercentComplete !== rollup.percentComplete) {
                parent.Status = rollup.status;
                parent.PercentComplete = rollup.percentComplete;
                if (rollup.isTerminal) parent.CompletedAt = new Date();
                await parent.Save();
            }
        }
    }

    /** Parent tasks that still have work to do. */
    private async findActiveGraphIDs(provider: IMetadataProvider): Promise<string[]> {
        const result = await RunView.FromMetadataProvider(provider).RunView<{ ParentID: string }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IS NOT NULL AND Status IN ('Pending','In Progress')`,
                Fields: ['ParentID'],
                ResultType: 'simple',
            },
            this.contextUser,
        );
        return [...new Set((result.Results ?? []).map((r) => r.ParentID).filter(Boolean))];
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
            for (const node of ComputeEligibleTasks(graph.nodes, graph.edges)) {
                const entity = graph.entityById.get(node.id);
                // Human tasks are never dispatched — they are completed by a person.
                if (!entity || !entity.AgentID) continue;
                if (this.inFlight.has(entity.ID)) continue;
                claimable.push(entity);
                if (claimable.length >= limit) break;
            }
        }
        return claimable;
    }

    /** Loads a graph's children and edges in the shapes both the algorithms and mutation need. */
    private async loadGraphState(provider: IMetadataProvider, parentTaskID: string): Promise<GraphState> {
        const rv = RunView.FromMetadataProvider(provider);
        const childrenResult = await rv.RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskID}'`, ResultType: 'entity_object' },
            this.contextUser,
        );
        const children = (childrenResult.Success ? childrenResult.Results : []) ?? [];
        if (children.length === 0) return { nodes: [], edges: [], entityById: new Map() };

        const idList = children.map((c) => `'${c.ID}'`).join(',');
        const depsResult = await rv.RunView<MJTaskDependencyEntity>(
            { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${idList})`, ResultType: 'entity_object' },
            this.contextUser,
        );
        const deps = (depsResult.Success ? depsResult.Results : []) ?? [];

        return {
            nodes: children.map((c) => ({ id: c.ID, status: c.Status as TaskGraphNodeStatus })),
            edges: deps.map((d) => ({
                taskId: d.TaskID,
                dependsOnTaskId: d.DependsOnTaskID,
                dependencyType: d.DependencyType as TaskGraphEdge['dependencyType'],
            })),
            entityById: new Map(children.map((c) => [c.ID, c])),
        };
    }

    /** Parsed `OutputPayload` of each completed dependency, keyed by that task's ID. */
    private async loadDependencyOutputs(provider: IMetadataProvider, taskID: string): Promise<Map<string, unknown>> {
        const outputs = new Map<string, unknown>();
        const rv = RunView.FromMetadataProvider(provider);
        const deps = await rv.RunView<MJTaskDependencyEntity>(
            { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID='${taskID}'`, ResultType: 'entity_object' },
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
}
