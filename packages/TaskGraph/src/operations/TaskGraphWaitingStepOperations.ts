/**
 * @fileoverview `TaskGraph.CompleteWaitingStep` — completes an External or provider-Human step from a
 * browser, an MCP client or an Action.
 *
 * A thin adapter over {@link TaskGraphWaitingSteps.CompleteWaitingStep}, which does the work and is
 * what server code (a provider, a webhook handler) calls directly. This adds the one thing an
 * outside caller needs and in-process code does not: authorization.
 *
 * **Who may complete a step.** The workflow run's owner, or an Owner-type user — the same gate every
 * other task-graph control verb uses, applied per matched step. A correlation-key signal can match
 * steps in many runs; the ones the caller may not complete are reported, never silently skipped.
 *
 * **Never a provider-raised Human step.** That step asks a person in another app (an approval, a
 * review), and only its provider may complete it, in process, when that person decides. Through this
 * operation the run's owner — usually the person asking for the approval — could complete it with
 * any payload and approve their own request.
 *
 * Registered directly on `BaseRemotableOperation`, like the debug verbs; the metadata row ships in
 * `metadata/remote-operations/.remote-operations.json`.
 *
 * @module @memberjunction/task-graph
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphWaitingSteps, type CompleteWaitingStepResult } from '../TaskGraphWaitingSteps';
import { IsProviderHumanTask, type WaitingStepRow } from '../waiting-steps';
import { AuthorizeGraphControl } from './TaskGraphDebugOperations';

/** Input for `TaskGraph.CompleteWaitingStep`. Exactly one of `taskID` / `correlationKey`. */
export interface TaskGraphCompleteWaitingStepInput {
    /** The step's task ID. */
    taskID?: string;
    /** Completes every External step waiting on this key that the caller may complete. */
    correlationKey?: string;
    /** `Complete` (default) or `Failed`. */
    status?: 'Complete' | 'Failed';
    /** Merged into the workflow payload; downstream edges can branch on it. */
    payload?: Record<string, unknown> | null;
    /** Why, when `status` is `Failed`. */
    errorMessage?: string | null;
}

/** Output of `TaskGraph.CompleteWaitingStep`. */
export interface TaskGraphCompleteWaitingStepOutput {
    success: boolean;
    /** Steps completed now. */
    completed: string[];
    /** Steps not reached yet; the signal is held and applied when they are. */
    buffered: string[];
    /** Steps matched but not completed, each with the reason. */
    refused: Array<{ taskID: string; reason: string }>;
    errorMessage?: string;
}

@RegisterClass(BaseRemotableOperation, 'TaskGraph.CompleteWaitingStep')
export class TaskGraphCompleteWaitingStepServerOperation extends BaseRemotableOperation<
    TaskGraphCompleteWaitingStepInput,
    TaskGraphCompleteWaitingStepOutput
> {
    public readonly OperationKey = 'TaskGraph.CompleteWaitingStep';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'taskgraph:execute';

    protected async InternalExecute(
        input: TaskGraphCompleteWaitingStepInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<TaskGraphCompleteWaitingStepOutput> {
        const result = await TaskGraphWaitingSteps.CompleteWaitingStep(
            {
                TaskID: input?.taskID,
                CorrelationKey: input?.correlationKey,
                Status: input?.status,
                Payload: input?.payload ?? null,
                ErrorMessage: input?.errorMessage ?? null,
                CompletedByUserID: user.ID,
            },
            provider,
            user,
            (task: MJTaskEntity) => authorizeStep(task, provider, user),
        );
        return toOutput(result);
    }
}

/** Refusal when the step is a provider-raised Human step; null otherwise. Exported for tests. */
export function ProviderHumanStepRefusal(task: WaitingStepRow): string | null {
    return IsProviderHumanTask(task)
        ? 'That step is waiting on a person in another app; it completes when they decide there, not from here.'
        : null;
}

/**
 * The run's owner or an Owner-type user may complete a step; anyone else is refused for that step.
 * A provider-raised Human step is refused for everyone ({@link ProviderHumanStepRefusal}).
 */
async function authorizeStep(task: MJTaskEntity, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const providerStep = ProviderHumanStepRefusal(task);
    if (providerStep) return providerStep;
    if (!task.ParentID) return 'That task is not a step of a workflow run.';
    return AuthorizeGraphControl(task.ParentID, provider, user);
}

function toOutput(result: CompleteWaitingStepResult): TaskGraphCompleteWaitingStepOutput {
    return {
        success: result.Success,
        completed: result.Completed,
        buffered: result.Buffered,
        refused: result.Refused.map((r) => ({ taskID: r.TaskID, reason: r.Reason })),
        errorMessage: result.ErrorMessage,
    };
}

/** Tree-shaking anchor: importing this keeps the registration alive. */
export function LoadTaskGraphWaitingStepOperations(): void {
    // intentionally empty
}
