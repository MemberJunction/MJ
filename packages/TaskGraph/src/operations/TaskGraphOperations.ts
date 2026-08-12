/**
 * @fileoverview Remote Operation implementations for the task-graph control plane.
 *
 * **Why these exist rather than bespoke GraphQL mutations.** Remote Operations are MJ's *typed
 * control plane* — one call site reachable from MCP (external agents), from an Action wrapper
 * (internal agents), and from the UI. Phase 2 originally shipped `SubmitTaskGraph` /
 * `CancelTaskGraph` / `RetryTask` as GraphQL mutations, which fixed the durability problem but left
 * the reachability one exactly where it was: callable from the Explorer client and nothing else.
 *
 * That was inconsistent with the closest analogous substrate — Record Set Processing exposes
 * `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations — and it
 * undercut the program's own goal of letting agents *set up* workflows rather than only navigate to
 * them. These operations replace those mutations.
 *
 * Each row is `GenerationType=Manual`, so CodeGen emits a typed base into `@memberjunction/core-entities`
 * and these subclasses supply the body. All logic stays in `TaskGraphService`; these are thin
 * adapters, and the last registration wins by import order per the ClassFactory contract.
 *
 * @module @memberjunction/task-graph
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    MJTaskEntity,
    TaskGraphSubmitOperation,
    TaskGraphCancelOperation,
    TaskGraphRetryTaskOperation,
    TaskGraphGetStatusOperation,
    type TaskGraphSubmitInput,
    type TaskGraphSubmitOutput,
    type TaskGraphControlInput,
    type TaskGraphControlOutput,
    type TaskGraphRetryInput,
    type TaskGraphStatusOutput,
} from '@memberjunction/core-entities';
import { ComputeParentRollup, type TaskGraphNodeStatus, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { TaskGraphService, TaskGraphSubmitContext } from '../TaskGraphService';
import { LoadWorkflowDraftOperation } from './WorkflowDraftOperation';

/**
 * The columns `GetStatus` reads. `Status` is pinned to the algorithm's own node-status union rather
 * than restated, so a future CHECK-constraint value flows through instead of silently widening to
 * `string` at the boundary between the row and the rollup.
 */
type TaskStatusRow = {
    ID: string;
    Name: string;
    Status: TaskGraphNodeStatus;
    AgentRunID: string | null;
    ErrorMessage: string | null;
};

/**
 * Builds the service context from the operation's provider + user.
 *
 * `environmentID` is empty on the cancel/retry paths and that is not a placeholder: the graph
 * already exists, so nothing is created that would need one, and `TaskGraphService` reads the field
 * only while persisting a new graph.
 */
function submitContext(
    provider: IMetadataProvider,
    user: UserInfo,
    environmentID: string,
    conversationDetailID?: string | null,
): TaskGraphSubmitContext {
    return {
        EnvironmentID: environmentID,
        ConversationDetailID: conversationDetailID ?? null,
        ContextUser: user,
        Provider: provider,
    };
}

/**
 * `TaskGraph.Submit` — validate and durably persist a graph, returning immediately.
 *
 * Returning before execution is the point: the caller is freed the moment the work is safe, and the
 * dispatcher owns it from there. That is what lets an agent submit a graph over MCP without holding
 * anything open.
 *
 * **KNOWN LIMITATION (C5): a graph submitted through this operation is fully detached.**
 * `TaskGraphSubmitContext` carries `AgentRunID` and `ReinvokeDepth`, and this input shape has no
 * field for either, so a remote submission always records `submittedByAgentRunID: null` and depth
 * zero. Three consequences, all silent:
 *
 *   - no cost rollup — the graph's spend never reaches the calling agent's run;
 *   - no `reinvoke` — settlement has nobody to restart, so it degrades to a message;
 *   - the continuation depth restarts at zero, so a chain submitted this way is not counted by the
 *     cap that bounds it.
 *
 * That may be the intended contract — a remote caller is not obviously "a run this graph belongs
 * to" — but it is currently a consequence of the input shape rather than a decision. Closing it
 * means additive optional inputs on a PUBLISHED remote operation, which is a metadata change plus
 * CodeGen, not an edit here. Flagged rather than done quietly.
 *
 * **R3-3 widened this gap.** The submit contract now carries an invocation envelope — the flow
 * dialect's `data`/`context` condition roots — and this input shape has no field for that either.
 * So a graph submitted remotely evaluates `data.x`/`context.x` against nothing, which is the exact
 * silent-wrong-branch this round fixed on the in-process path. Whatever is decided for `AgentRunID`
 * and `ReinvokeDepth` has to cover the envelope in the same change, or the same class of drop
 * recurs on the remote seam.
 */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.Submit')
export class TaskGraphSubmitServerOperation extends TaskGraphSubmitOperation {
    protected async InternalExecute(
        input: TaskGraphSubmitInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<TaskGraphSubmitOutput> {
        if (!input?.spec) throw new Error('spec is required');
        if (!input?.environmentID) throw new Error('environmentID is required');

        const spec: TaskGraphSpec = input.spec;
        const result = await new TaskGraphService().Submit(
            spec,
            submitContext(provider, user, input.environmentID, input.conversationDetailID),
        );
        return {
            success: result.Success,
            parentTaskID: result.ParentTaskID,
            errorMessage: result.ErrorMessage,
        };
    }
}

/** `TaskGraph.Cancel` — cancel a graph and every task in it that has not already settled. */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.Cancel')
export class TaskGraphCancelServerOperation extends TaskGraphCancelOperation {
    protected async InternalExecute(
        input: TaskGraphControlInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<TaskGraphControlOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');

        // EnvironmentID is unused on the cancel path — the graph already exists, so nothing new is
        // created that would need one.
        const result = await new TaskGraphService().Cancel(input.parentTaskID, submitContext(provider, user, ''));
        // The verdict names what survived, so the caller can tell the user which parts of their
        // workflow are still running rather than reporting a success the graph does not reflect.
        if (!result.Success) {
            return { success: false, errorMessage: result.ErrorMessage ?? 'Cancel failed; see the server log for detail.' };
        }

        const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', user);
        const loaded = await parent.Load(input.parentTaskID);
        return { success: true, status: loaded ? parent.Status : undefined };
    }
}

/**
 * `TaskGraph.RetryTask` — return a failed task to `Pending` and unblock its dependents.
 *
 * Unblocking is not optional: retrying a task while its dependents remain `Blocked` leaves the graph
 * exactly as stuck as before, because nothing downstream ever becomes eligible again.
 */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.RetryTask')
export class TaskGraphRetryTaskServerOperation extends TaskGraphRetryTaskOperation {
    protected async InternalExecute(
        input: TaskGraphRetryInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<TaskGraphControlOutput> {
        if (!input?.taskID) throw new Error('taskID is required');

        const ok = await new TaskGraphService().Retry(input.taskID, submitContext(provider, user, ''));
        if (!ok) return { success: false, errorMessage: 'Retry failed; the task may not be in a Failed state.' };

        const task = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', user);
        const loaded = await task.Load(input.taskID);
        return { success: true, status: loaded ? task.Status : undefined };
    }
}

/**
 * `TaskGraph.GetStatus` — snapshot a graph's progress without waiting for anything.
 *
 * This is the observation half of making execution durable. Once nobody holds a request open, a
 * caller — a client re-attaching after reload, an agent checking work it submitted, an external MCP
 * caller — needs a way to ask "where is it?". The rollup uses the same pure algorithm the dispatcher
 * uses, so the reported status cannot disagree with the engine's own view.
 */
@RegisterClass(BaseRemotableOperation, 'TaskGraph.GetStatus')
export class TaskGraphGetStatusServerOperation extends TaskGraphGetStatusOperation {
    protected async InternalExecute(
        input: TaskGraphControlInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<TaskGraphStatusOutput> {
        if (!input?.parentTaskID) throw new Error('parentTaskID is required');

        // Read-only snapshot, so `simple` + a narrow field list — no reason to pay for entity
        // objects here. Scoped to the operation's own provider rather than the global default.
        const children = await RunView.FromMetadataProvider(provider).RunView<TaskStatusRow>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID='${input.parentTaskID}'`,
                Fields: ['ID', 'Name', 'Status', 'AgentRunID', 'ErrorMessage'],
                ResultType: 'simple',
            },
            user,
        );
        if (!children.Success) {
            return { success: false, errorMessage: children.ErrorMessage ?? 'Could not load the graph.' };
        }

        const rows = children.Results ?? [];
        const rollup = ComputeParentRollup(rows.map((r) => ({ id: r.ID, status: r.Status })));

        return {
            success: true,
            status: rollup.status,
            percentComplete: rollup.percentComplete,
            tasks: rows.map((r) => ({
                taskID: r.ID,
                name: r.Name,
                status: r.Status,
                agentRunID: r.AgentRunID ?? undefined,
                errorMessage: r.ErrorMessage ?? undefined,
            })),
        };
    }
}

/** Prevents tree-shaking of the registered operation classes. */
export function LoadTaskGraphOperations(): void {
    void TaskGraphSubmitServerOperation;
    void TaskGraphCancelServerOperation;
    void TaskGraphRetryTaskServerOperation;
    void TaskGraphGetStatusServerOperation;
    // Workflow authoring rides the same loader: a host that starts the dispatcher but never
    // registered these would accept a draft request and route it to the contract-only base.
    LoadWorkflowDraftOperation();
}
