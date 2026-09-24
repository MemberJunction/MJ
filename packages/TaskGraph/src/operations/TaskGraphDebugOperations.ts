/**
 * @fileoverview Remote Operation implementations for the task-graph debug/runner control plane —
 * pause, resume, single-step, breakpoints, edge overrides, and the step-level intervention verbs.
 *
 * Ships per the standing rule from #3576: every task-graph control verb is a Remote Operation, so
 * the console UI, MCP callers, and an Action wrapper all reach the same typed call site. All logic
 * stays in `TaskGraphService`; these are thin adapters.
 *
 * **Registration note.** These subclasses extend `BaseRemotableOperation` directly and declare
 * their own `OperationKey`/`ExecutionMode`/`RequiredScope`, rather than extending a CodeGen-emitted
 * base from `@memberjunction/core-entities` the way `TaskGraphOperations.ts` does. The metadata rows
 * for these operations ship in `metadata/remote-operations/.remote-operations.json`; once
 * `mj sync push` + `mj codegen` have run, CodeGen emits the typed bases and a follow-up may
 * re-parent these classes onto them — the runtime contract (ClassFactory key + metadata
 * invokability gate) is identical either way.
 *
 * **Authorization.** The debug verbs write through guarded SQL, not through entity permissions, so
 * each one gates explicitly: the caller must be the graph's recorded owner or an Owner-type user.
 * A graph with no recorded owner fails closed for everyone but Owner-type users.
 *
 * @module @memberjunction/task-graph
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { ParseTaskGraphParentMetadata, TASK_TYPE_NAME, TaskGraphService, TaskGraphSubmitContext } from '../TaskGraphService';
import type { EdgeOverrideVerdict, StepTarget, TaskGraphDebugState } from '../debug-state';

// ── wire contracts ─────────────────────────────────────────────────────────
// Duplicated (deliberately) in the metadata rows' InputTypeDefinition/OutputTypeDefinition so
// CodeGen emits matching types; the metadata is the source of truth for the generated bases.

/** Input for `TaskGraph.Pause` and `TaskGraph.Resume`. */
export interface TaskGraphPauseInput {
    /** Parent task ID identifying the workflow run. */
    parentTaskID: string;
}

/** Input for `TaskGraph.Step`. */
export interface TaskGraphStepInput {
    parentTaskID: string;
    /** `'one'` (default) releases the next eligible step, `'wave'` the current frontier, a task ID exactly that step. */
    target?: string;
}

/** Input for `TaskGraph.SetBreakpoints`. */
export interface TaskGraphSetBreakpointsInput {
    parentTaskID: string;
    /** The full breakpoint set — replaces what was there. Empty clears all breakpoints. */
    taskIDs: string[];
}

/** Input for `TaskGraph.OverrideEdge`. */
export interface TaskGraphOverrideEdgeInput {
    parentTaskID: string;
    /** The `MJ: Task Dependencies` row being answered. */
    edgeID: string;
    /** `'false'` = branch not taken, `'true'` = gate open, omitted/null = remove the override. */
    verdict?: 'true' | 'false' | null;
}

/** Input for `TaskGraph.SkipTask`, `TaskGraph.ForceCompleteTask` and `TaskGraph.UpdateTaskInput`. */
export interface TaskGraphTaskInterventionInput {
    taskID: string;
    /** ForceCompleteTask: the output downstream paths evaluate against. UpdateTaskInput: the new input. */
    payload?: Record<string, unknown> | string | null;
}

/** Output of the debug control verbs — what happened and the debug state now in force. */
export interface TaskGraphDebugControlOutput {
    success: boolean;
    /** The graph's debug state after the verb (pause/step/breakpoints/overrides). */
    debug?: TaskGraphDebugState;
    errorMessage?: string;
}

// ── shared plumbing ────────────────────────────────────────────────────────

function submitContext(provider: IMetadataProvider, user: UserInfo): TaskGraphSubmitContext {
    // EnvironmentID is empty on every debug path: the graph already exists, and the service reads
    // the field only while persisting a new one.
    return { EnvironmentID: '', ConversationDetailID: null, ContextUser: user, Provider: provider };
}

/**
 * The caller must be the graph's recorded owner, or an Owner-type user.
 *
 * Explicit here because the debug verbs write through guarded SQL rather than entity saves, so
 * entity permissions never see them. Fails closed: a graph with no recorded owner (submitted before
 * ownership stamping) is controllable only by Owner-type users.
 */
async function authorizeGraphControl(
    parentTaskID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    if (user.Type?.trim().toLowerCase() === 'owner') return null;
    const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', user);
    if (!(await parent.Load(parentTaskID))) return 'No such workflow run.';
    const owner = ParseTaskGraphParentMetadata(parent.InputPayload).submittedByUserID;
    if (!owner || !UUIDsEqual(owner, user.ID)) {
        return 'Only the workflow run\'s owner can control it.';
    }
    return null;
}

/**
 * Resolves a child task's graph, so task-scoped verbs authorize against the same owner.
 *
 * **Proves the parent is a WORKFLOW graph, not merely that the task has one.** `MJ: Tasks` holds
 * conversation tasks and users' personal to-dos alongside workflow steps, and both of those can be
 * parented too — so "has a ParentID" is not "is a step of a workflow run". Without the type check
 * the ownership gate below is the only thing standing between these verbs and any parented row in
 * the table, and for an Owner-type caller that gate returns before loading anything. The guarded
 * statements carry the same discriminator as a second layer; this is the first.
 */
async function graphOfTask(
    taskID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ parentTaskID: string } | { error: string }> {
    const task = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', user);
    if (!(await task.Load(taskID))) return { error: 'No such step.' };
    if (!task.ParentID) return { error: 'That task is not a step of a workflow run.' };

    const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', user);
    if (!(await parent.Load(task.ParentID))) return { error: 'That step\'s workflow run could not be read.' };
    const workflowTypeID = await resolveWorkflowTaskTypeID(provider, user);
    if (!workflowTypeID || !UUIDsEqual(parent.TypeID ?? '', workflowTypeID)) {
        return { error: 'That task is not a step of a workflow run.' };
    }
    return { parentTaskID: task.ParentID };
}

/**
 * The `AI Workflow` task type's ID, or null when the row does not exist.
 *
 * Read rather than created: these verbs act on graphs that already exist, so an absent type row
 * means there are no workflow graphs to act on — minting one from a debug verb would be a write on
 * a read path, and would make the check it feeds vacuously pass.
 */
async function resolveWorkflowTaskTypeID(provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Task Types',
            ExtraFilter: `Name='${TASK_TYPE_NAME}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            MaxRows: 1,
        },
        user,
    );
    return result.Success ? (result.Results?.[0]?.ID ?? null) : null;
}

function failed(errorMessage: string): TaskGraphDebugControlOutput {
    return { success: false, errorMessage };
}

// ── the verbs ──────────────────────────────────────────────────────────────

/** `TaskGraph.Pause` — nothing new starts; in-flight steps finish and their completions land. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.Pause')
export class TaskGraphPauseServerOperation extends BaseRemotableOperation<TaskGraphPauseInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.Pause';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphPauseInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');
        const denied = await authorizeGraphControl(input.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const result = await new TaskGraphService().PauseGraph(input.parentTaskID, submitContext(provider, user), user.ID);
        return { success: result.Success, debug: result.Debug, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.Resume` — claiming continues; breakpoints and overrides survive. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.Resume')
export class TaskGraphResumeServerOperation extends BaseRemotableOperation<TaskGraphPauseInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.Resume';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphPauseInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');
        const denied = await authorizeGraphControl(input.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const result = await new TaskGraphService().ResumeGraph(input.parentTaskID, submitContext(provider, user));
        return { success: result.Success, debug: result.Debug, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.Step` — arm a one-shot claim allowance on a paused workflow. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.Step')
export class TaskGraphStepServerOperation extends BaseRemotableOperation<TaskGraphStepInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.Step';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphStepInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');
        const denied = await authorizeGraphControl(input.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const target: StepTarget = input.target === 'wave' || input.target === 'one'
            ? input.target
            : input.target ? input.target : 'one';
        const result = await new TaskGraphService().StepGraph(input.parentTaskID, target, submitContext(provider, user));
        return { success: result.Success, debug: result.Debug, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.SetBreakpoints` — replace the workflow's breakpoint set. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.SetBreakpoints')
export class TaskGraphSetBreakpointsServerOperation extends BaseRemotableOperation<TaskGraphSetBreakpointsInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.SetBreakpoints';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphSetBreakpointsInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');
        if (!Array.isArray(input.taskIDs)) throw new Error('taskIDs is required (empty array clears)');
        const denied = await authorizeGraphControl(input.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const result = await new TaskGraphService().SetBreakpoints(input.parentTaskID, input.taskIDs, submitContext(provider, user));
        return { success: result.Success, debug: result.Debug, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.OverrideEdge` — answer a path the engine cannot decide (or decided wrongly). */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.OverrideEdge')
export class TaskGraphOverrideEdgeServerOperation extends BaseRemotableOperation<TaskGraphOverrideEdgeInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.OverrideEdge';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphOverrideEdgeInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');
        if (!input?.edgeID) throw new Error('edgeID is required');
        const denied = await authorizeGraphControl(input.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const verdict: EdgeOverrideVerdict | null =
            input.verdict === 'true' || input.verdict === 'false' ? input.verdict : null;
        const result = await new TaskGraphService().SetEdgeOverride(input.parentTaskID, input.edgeID, verdict, submitContext(provider, user));
        return { success: result.Success, debug: result.Debug, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.SkipTask` — declare a Pending step not-taken; dependents proceed. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.SkipTask')
export class TaskGraphSkipTaskServerOperation extends BaseRemotableOperation<TaskGraphTaskInterventionInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.SkipTask';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphTaskInterventionInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.taskID) throw new Error('taskID is required');
        const graph = await graphOfTask(input.taskID, provider, user);
        if ('error' in graph) return failed(graph.error);
        const denied = await authorizeGraphControl(graph.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const result = await new TaskGraphService().SkipTask(input.taskID, submitContext(provider, user));
        return { success: result.Success, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.ForceCompleteTask` — mark a wedged or externally-resolved step Complete with a supplied output. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.ForceCompleteTask')
export class TaskGraphForceCompleteTaskServerOperation extends BaseRemotableOperation<TaskGraphTaskInterventionInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.ForceCompleteTask';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphTaskInterventionInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.taskID) throw new Error('taskID is required');
        const graph = await graphOfTask(input.taskID, provider, user);
        if ('error' in graph) return failed(graph.error);
        const denied = await authorizeGraphControl(graph.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const result = await new TaskGraphService().ForceCompleteTask(input.taskID, input.payload ?? null, submitContext(provider, user));
        return { success: result.Success, errorMessage: result.ErrorMessage };
    }
}

/** `TaskGraph.UpdateTaskInput` — replace a Pending step's input before stepping it. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.UpdateTaskInput')
export class TaskGraphUpdateTaskInputServerOperation extends BaseRemotableOperation<TaskGraphTaskInterventionInput, TaskGraphDebugControlOutput> {
    public readonly OperationKey = 'TaskGraph.UpdateTaskInput';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(input: TaskGraphTaskInterventionInput, provider: IMetadataProvider, user: UserInfo): Promise<TaskGraphDebugControlOutput> {
        if (!input?.taskID) throw new Error('taskID is required');
        if (input.payload === undefined) throw new Error('payload is required');
        const graph = await graphOfTask(input.taskID, provider, user);
        if ('error' in graph) return failed(graph.error);
        const denied = await authorizeGraphControl(graph.parentTaskID, provider, user);
        if (denied) return failed(denied);
        const result = await new TaskGraphService().UpdateTaskInput(input.taskID, input.payload, submitContext(provider, user));
        return { success: result.Success, errorMessage: result.ErrorMessage };
    }
}

/** Prevents tree-shaking of the registered operation classes. */
export function LoadTaskGraphDebugOperations(): void {
    void TaskGraphPauseServerOperation;
    void TaskGraphResumeServerOperation;
    void TaskGraphStepServerOperation;
    void TaskGraphSetBreakpointsServerOperation;
    void TaskGraphOverrideEdgeServerOperation;
    void TaskGraphSkipTaskServerOperation;
    void TaskGraphForceCompleteTaskServerOperation;
    void TaskGraphUpdateTaskInputServerOperation;
}
