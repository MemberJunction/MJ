/**
 * @fileoverview Producer-agnostic submission of task graphs.
 *
 * Per D2, submission (validate + persist) is split from execution (the durable dispatcher). This
 * class does the first half only: it validates a spec, resolves agent names, writes the parent +
 * children + dependency edges, and returns immediately. Nothing here executes anything.
 *
 * That split is what makes the engine invocation-agnostic (D1): an agent emitting a graph, a
 * scheduled job, a Slack message, and a future manual workflow UI all call the same `Submit`, and
 * whichever dispatcher instance is running picks the work up. Callers never wait for execution, so
 * no channel needs to hold a long-lived request open the way the old `ExecuteTaskGraph` mutation did.
 *
 * Per D11 the API is deliberately not AI-flavored — an LLM, deterministic code, or a human UI can
 * all construct and submit a DAG.
 *
 * @module @memberjunction/task-graph
 */
import {
    IMetadataProvider,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import {
    FormatValidationErrors,
    NormalizeDependency,
    ValidateTaskGraphSpec,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';

/** Context a submission carries beyond the graph itself. */
export type TaskGraphSubmitContext = {
    /** Environment the tasks belong to. */
    EnvironmentID: string;
    /** Conversation this graph answers, when submitted from a conversational channel. */
    ConversationDetailID?: string | null;
    /** User the work runs as and is attributed to. */
    ContextUser: UserInfo;
    /** Provider to persist through. */
    Provider: IMetadataProvider;
    /** The agent run that emitted this graph, for provenance and `reinvoke` routing. */
    AgentRunID?: string | null;
    /**
     * How many continuation hops produced this graph. A graph submitted by an agent that was itself
     * re-invoked by a finished graph carries its parent's depth + 1.
     */
    ReinvokeDepth?: number;
};

/**
 * What the parent Task row remembers about the graph beyond its tasks.
 *
 * Persisted rather than held in memory because the dispatcher instance that *finishes* a graph is
 * routinely not the one that accepted it — a restart, a peer instance, or simply a graph that
 * outlives a deploy all break that assumption.
 */
export type TaskGraphParentMetadata = {
    continuation: 'message' | 'reinvoke' | 'none';
    reinvokeDepth: number;
    submittedByAgentRunID: string | null;
    /**
     * Who the graph belongs to.
     *
     * Stored here rather than on a Task column because `Task.UserID` already means something else —
     * it designates a *human* task, the assignee the graph waits on — so setting it on a parent
     * would make every graph look like work waiting on a person. It is durable for the same reason
     * everything else in this bag is: the instance that needs it is routinely not the one that wrote
     * it. Consumed by the live-frame layer, which cannot authorize a viewer without knowing whose
     * run they are watching.
     */
    submittedByUserID?: string | null;
    /**
     * Set once the completion handler has delivered. Written with a compare-and-swap guard, which is
     * what turns at-least-once delivery into effectively-once: a crash between "graph complete" and
     * "continuation delivered" leaves this unset, so the next sweep retries, and two instances
     * racing the same completion produce one winner rather than two notifications.
     */
    continuationDeliveredAt?: string;
};

/**
 * Continuation chains are bounded separately from graph nesting.
 *
 * The spawn-depth cap governs graphs nested *by tasks*; this one governs graphs chained *by
 * continuations* — an agent re-invoked with a finished graph's results can emit another graph, which
 * re-invokes it again. Both loops exist and neither cap constrains the other, so both are needed. At
 * the cap the dispatcher forces `continuation: 'message'`, which ends the chain without losing the
 * results.
 */
export const MAX_REINVOKE_DEPTH = 5;

/** What a parent row means when it carries no metadata, or metadata we cannot read. */
const DEFAULT_PARENT_METADATA: TaskGraphParentMetadata = {
    continuation: 'message',
    reinvokeDepth: 0,
    submittedByAgentRunID: null,
    submittedByUserID: null,
};

/**
 * Parses a parent Task's continuation metadata.
 *
 * Shared by the writer (`TaskGraphService`) and the reader (`TaskGraphDispatcher`) so the two cannot
 * drift — the failure that shape invites is a graph that completes and then does nothing, because
 * one side wrote a field the other never looked for.
 *
 * Unparseable input defaults to `message` rather than throwing. A row predating this metadata, or
 * one a user hand-edited, is a legitimate state, and the right response to "I don't know what this
 * graph wanted" is still to tell the user their work finished.
 */
export function ParseTaskGraphParentMetadata(raw: string | null | undefined): TaskGraphParentMetadata {
    if (!raw) return { ...DEFAULT_PARENT_METADATA };
    try {
        const parsed = JSON.parse(raw) as Partial<TaskGraphParentMetadata>;
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PARENT_METADATA };
        return {
            ...DEFAULT_PARENT_METADATA,
            ...parsed,
            // Guard the two fields the dispatcher branches on. A JSON round-trip, a hand edit, or a
            // future producer can all supply the wrong type here, and a bad `reinvokeDepth` would
            // either disable the cap (NaN comparisons are always false) or trip it immediately.
            continuation: parsed.continuation === 'reinvoke' || parsed.continuation === 'none'
                ? parsed.continuation
                : 'message',
            reinvokeDepth: Number.isFinite(parsed.reinvokeDepth) ? Number(parsed.reinvokeDepth) : 0,
        };
    } catch {
        return { ...DEFAULT_PARENT_METADATA };
    }
}

/** True when a continuation chain has gone as far as it may. */
export function IsReinvokeCapReached(meta: TaskGraphParentMetadata): boolean {
    return meta.reinvokeDepth >= MAX_REINVOKE_DEPTH;
}

export type TaskGraphSubmitResult = {
    Success: boolean;
    /** The parent task representing the whole graph — the handle for status, cancel and retry. */
    ParentTaskID?: string;
    /** tempId -> persisted Task.ID, for callers that need to correlate back to their spec. */
    TaskIDMap?: Map<string, string>;
    ErrorMessage?: string;
};

/** Name of the task type used for agent-orchestrated graphs. */
const TASK_TYPE_NAME = 'AI Workflow';

export class TaskGraphService {
    /**
     * Validates and persists a task graph, returning as soon as it is durable.
     *
     * Deliberately does NOT start execution: the dispatcher discovers `Pending` work by polling
     * claimable tasks, so submission and execution are decoupled even within a single process.
     * A submitted graph therefore survives the submitting request, the submitting agent run, and
     * the submitting server — which is the entire point of Task rows over in-run state (D8).
     */
    public async Submit(spec: TaskGraphSpec, context: TaskGraphSubmitContext): Promise<TaskGraphSubmitResult> {
        // 1. Structural validation. Server-side is the source of truth even when a producer already
        //    validated client-side — the same function runs in both places, so they cannot disagree.
        const validation = ValidateTaskGraphSpec(spec);
        if (!validation.Valid) {
            const message = `Task graph "${spec.workflowName}" is invalid:\n${FormatValidationErrors(validation.Errors)}`;
            LogError(`[TaskGraphService] ${message}`);
            return { Success: false, ErrorMessage: message };
        }

        try {
            // 2. Resolve every agent and action BEFORE writing anything. An unresolvable name is a
            //    hard error, not a skipped node: silently dropping a task executes the graph with
            //    holes where the caller's work should have been.
            const agentIDsByName = await this.resolveAgents(spec, context);
            if (!agentIDsByName.Success) {
                return { Success: false, ErrorMessage: agentIDsByName.ErrorMessage };
            }
            const actionIDsByName = await this.resolveActions(spec, context);
            if (!actionIDsByName.Success) {
                return { Success: false, ErrorMessage: actionIDsByName.ErrorMessage };
            }

            const taskTypeID = await this.ensureTaskType(context);

            // 3. Persist. Parent first so children have a ParentID, then children, then edges —
            //    edges last because they reference two child IDs that must both exist.
            const parentTaskID = await this.persistParent(spec, taskTypeID, context);
            const taskIDMap = await this.persistChildren(
                spec, parentTaskID, taskTypeID, agentIDsByName.Map!, actionIDsByName.Map!, context,
            );
            await this.persistDependencies(spec, taskIDMap, context);

            LogStatus(
                `[TaskGraphService] Submitted "${spec.workflowName}": parent ${parentTaskID}, ${taskIDMap.size} task(s). ` +
                `Awaiting dispatcher pickup.`,
            );
            return { Success: true, ParentTaskID: parentTaskID, TaskIDMap: taskIDMap };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphService] Submit failed for "${spec.workflowName}": ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * Cancels a graph and everything in it that has not already settled.
     *
     * Cancels children first: a parent marked `Cancelled` while children are still `Pending` would
     * leave the dispatcher free to pick those children up, which is the opposite of what the caller
     * asked for.
     */
    public async Cancel(parentTaskID: string, context: TaskGraphSubmitContext): Promise<boolean> {
        try {
            const children = await this.loadChildren(parentTaskID, context);
            for (const child of children) {
                // Terminal work is left alone — cancelling a completed task would rewrite history.
                if (['Complete', 'Failed', 'Cancelled'].includes(child.Status)) continue;
                child.Status = 'Cancelled';
                if (!(await child.Save())) {
                    LogError(`[TaskGraphService] Failed to cancel task ${child.ID}: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }

            const parent = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            if (!(await parent.Load(parentTaskID))) return false;
            parent.Status = 'Cancelled';
            parent.CompletedAt = new Date();
            return await parent.Save();
        } catch (e) {
            LogError(`[TaskGraphService] Cancel failed for ${parentTaskID}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /**
     * Returns a failed task to `Pending` so the dispatcher can run it again.
     *
     * Also clears any `Blocked` dependents, since they were only blocked because this task failed —
     * leaving them blocked would make the retry pointless, as the graph still could not progress
     * past this node.
     */
    public async Retry(taskID: string, context: TaskGraphSubmitContext): Promise<boolean> {
        try {
            const task = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            if (!(await task.Load(taskID))) return false;
            if (task.Status !== 'Failed') {
                LogError(`[TaskGraphService] Cannot retry task ${taskID}: status is ${task.Status}, expected Failed.`);
                return false;
            }

            task.Status = 'Pending';
            task.ErrorMessage = null;
            task.StartedAt = null;
            task.CompletedAt = null;
            task.PercentComplete = 0;
            // Clear any stale claim so the task is immediately claimable.
            task.ClaimedBy = null;
            task.ClaimExpiresAt = null;
            if (!(await task.Save())) return false;

            if (task.ParentID) {
                for (const sibling of await this.loadChildren(task.ParentID, context)) {
                    if (sibling.Status === 'Blocked') {
                        sibling.Status = 'Pending';
                        await sibling.Save();
                    }
                }
            }
            return true;
        } catch (e) {
            LogError(`[TaskGraphService] Retry failed for ${taskID}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // internals
    // ────────────────────────────────────────────────────────────────────────

    /** Maps every referenced agent name to its ID, or reports all unresolvable names at once. */
    private async resolveAgents(
        spec: TaskGraphSpec,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; Map?: Map<string, string>; ErrorMessage?: string }> {
        const names = [...new Set(spec.tasks.filter((t) => !!t.agentName).map((t) => t.agentName!))];
        if (names.length === 0) return { Success: true, Map: new Map() };

        const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: AI Agents', ExtraFilter: `Name IN (${quoted})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
            context.ContextUser,
        );

        const found = new Map((result.Results ?? []).map((r) => [r.Name, r.ID]));
        const missing = names.filter((n) => !found.has(n));
        if (missing.length > 0) {
            return {
                Success: false,
                ErrorMessage:
                    `Task graph "${spec.workflowName}" references ${missing.length} unknown agent(s): ${missing.join(', ')}. ` +
                    `Submitting would execute the graph with holes where those tasks should be.`,
            };
        }
        return { Success: true, Map: found };
    }

    /**
     * Maps every referenced action name to its ID, or reports all unresolvable names at once.
     *
     * Deliberately a mirror of {@link resolveAgents} rather than a generalization of it: the two
     * read different entities and produce different error prose, and the shared shape is three
     * lines. Collapsing them would trade a readable failure message for a parameterized lookup.
     */
    private async resolveActions(
        spec: TaskGraphSpec,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; Map?: Map<string, string>; ErrorMessage?: string }> {
        const names = [...new Set(spec.tasks.filter((t) => !!t.actionName).map((t) => t.actionName!))];
        if (names.length === 0) return { Success: true, Map: new Map() };

        const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: Actions', ExtraFilter: `Name IN (${quoted})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
            context.ContextUser,
        );

        const found = new Map((result.Results ?? []).map((r) => [r.Name, r.ID]));
        const missing = names.filter((n) => !found.has(n));
        if (missing.length > 0) {
            return {
                Success: false,
                ErrorMessage:
                    `Task graph "${spec.workflowName}" references ${missing.length} unknown action(s): ${missing.join(', ')}. ` +
                    `Submitting would execute the graph with holes where those tasks should be.`,
            };
        }
        return { Success: true, Map: found };
    }

    /** Finds or creates the task type used for orchestrated graphs. */
    private async ensureTaskType(context: TaskGraphSubmitContext): Promise<string> {
        const existing = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string }>(
            { EntityName: 'MJ: Task Types', ExtraFilter: `Name='${TASK_TYPE_NAME}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
            context.ContextUser,
        );
        const found = existing.Results?.[0]?.ID;
        if (found) return found;

        const tt = await context.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', context.ContextUser);
        tt.NewRecord();
        tt.Name = TASK_TYPE_NAME;
        tt.Description = 'Tasks created by agent-orchestrated workflows.';
        if (!(await tt.Save())) {
            throw new Error(`Could not create task type: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return tt.ID;
    }

    /** Writes the parent task that represents the graph as a whole. */
    private async persistParent(spec: TaskGraphSpec, taskTypeID: string, context: TaskGraphSubmitContext): Promise<string> {
        const parent = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
        parent.NewRecord();
        parent.Name = spec.workflowName;
        parent.Description = spec.reasoning || 'Orchestrated workflow';
        parent.TypeID = taskTypeID;
        parent.EnvironmentID = context.EnvironmentID;
        parent.ConversationDetailID = context.ConversationDetailID ?? null;
        parent.Status = 'In Progress';
        parent.PercentComplete = 0;
        // The parent row carries what happens AFTER the graph settles. It lives here rather than in
        // dispatcher memory because the dispatcher that finishes a graph is frequently not the
        // process that accepted it — a restart, a second instance, or simply a long-running graph
        // all break that assumption. Anything the completion path needs has to be durable too.
        parent.InputPayload = JSON.stringify({
            continuation: spec.continuation ?? 'message',
            reinvokeDepth: context.ReinvokeDepth ?? 0,
            submittedByAgentRunID: context.AgentRunID ?? null,
            submittedByUserID: context.ContextUser?.ID ?? null,
        } satisfies TaskGraphParentMetadata);
        if (!(await parent.Save())) {
            throw new Error(`Could not create parent task: ${parent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return parent.ID;
    }

    /** Writes each child task, returning the tempId -> real ID mapping edges will need. */
    private async persistChildren(
        spec: TaskGraphSpec,
        parentTaskID: string,
        taskTypeID: string,
        agentIDsByName: Map<string, string>,
        actionIDsByName: Map<string, string>,
        context: TaskGraphSubmitContext,
    ): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        for (const node of spec.tasks) {
            const task = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            task.NewRecord();
            task.Name = node.name;
            task.Description = node.description;
            task.TypeID = taskTypeID;
            task.EnvironmentID = context.EnvironmentID;
            task.ParentID = parentTaskID;
            task.ConversationDetailID = context.ConversationDetailID ?? null;
            task.Status = 'Pending';
            task.PercentComplete = 0;

            if (node.agentName) {
                task.AgentID = agentIDsByName.get(node.agentName)!;
            } else if (node.actionName) {
                task.ActionID = actionIDsByName.get(node.actionName)!;
            } else {
                // Human task. Assigned to the submitting user only — cross-user assignment stays
                // rejected until the authorization model in #3524 lands.
                task.UserID = context.ContextUser.ID;
            }

            // Input rides in its own column; Description stays human-readable.
            task.InputPayload = node.inputPayload ? JSON.stringify(node.inputPayload) : null;

            if (!(await task.Save())) {
                throw new Error(`Could not create task "${node.name}": ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            map.set(node.tempId, task.ID);
        }
        return map;
    }

    /** Writes the dependency edges, translating tempIds to persisted IDs. */
    private async persistDependencies(
        spec: TaskGraphSpec,
        taskIDMap: Map<string, string>,
        context: TaskGraphSubmitContext,
    ): Promise<void> {
        for (const node of spec.tasks) {
            const taskID = taskIDMap.get(node.tempId);
            if (!taskID) continue;
            for (const raw of node.dependsOn ?? []) {
                const edge = NormalizeDependency(raw);
                const dependsOnTaskID = taskIDMap.get(edge.tempId);
                if (!dependsOnTaskID) continue; // validation already rejected unknown refs

                const dep = await context.Provider.GetEntityObject<MJTaskDependencyEntity>('MJ: Task Dependencies', context.ContextUser);
                dep.NewRecord();
                dep.TaskID = taskID;
                dep.DependsOnTaskID = dependsOnTaskID;
                dep.DependencyType = edge.dependencyType ?? 'Prerequisite';
                // NULL for an unconditional edge, matching AIAgentStepPath — so a graph authored in
                // the flow editor and one emitted by an agent store the same thing.
                dep.Condition = edge.condition ?? null;
                if (!(await dep.Save())) {
                    throw new Error(
                        `Could not create dependency ${node.tempId} -> ${edge.tempId}: ${dep.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
        }
    }

    private async loadChildren(parentTaskID: string, context: TaskGraphSubmitContext): Promise<MJTaskEntity[]> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskID}'`, ResultType: 'entity_object' },
            context.ContextUser,
        );
        return (result.Success ? result.Results : []) ?? [];
    }
}
