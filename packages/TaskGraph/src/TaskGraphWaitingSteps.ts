/**
 * @fileoverview The one way a waiting step is completed from outside the dispatcher.
 *
 * An External step is completed by whatever it waits on — a webhook handler, another app's save
 * hook, a scheduled close. A provider-Human step is completed by its provider when the person
 * decides. Both come through {@link TaskGraphWaitingSteps.CompleteWaitingStep}, so the guarded write,
 * the payload pass-through and the dispatcher kick live in one place, not one per caller.
 *
 * Server-side and in-process. Browser and MCP callers reach it through the
 * `TaskGraph.CompleteWaitingStep` remote operation, which adds authorization on top; a provider or
 * server hook calls it directly, as code the host already trusts.
 *
 * @module @memberjunction/task-graph
 */
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskClaimStore } from './TaskClaimStore';
import { KickTaskGraphDispatchers } from './task-graph-kick';
import {
    ComposeWaitingStepOutput,
    ParseStepConfiguration,
    PayloadAtStartOf,
    WAITING_STEP_MARKER,
    WaitingStepKindOf,
    WaitingStepOutputTaint,
    type PendingWaitingSignal,
} from './waiting-steps';

/** Which step(s) to complete, and with what. Exactly one of `TaskID` / `CorrelationKey`. */
export type CompleteWaitingStepRequest = {
    /** The step's `MJ: Tasks` ID — the handle a provider was given when it raised the step. */
    TaskID?: string;
    /** Completes every External step waiting on this key. */
    CorrelationKey?: string;
    /** `Complete` (default) or `Failed`. A failure releases the step's failure edges under `failureSemantics: 'edges'`. */
    Status?: 'Complete' | 'Failed';
    /** Merged over the payload the step was reached with; downstream edges can branch on it. */
    Payload?: Record<string, unknown> | null;
    /** Why, when `Status` is `Failed`. */
    ErrorMessage?: string | null;
    /** Who decided, when a person did. Recorded on the step (the same field the inbox records). */
    CompletedByUserID?: string | null;
};

/** One step the request matched but did not complete, and why. */
export type RefusedWaitingStep = { TaskID: string; Reason: string };

export type CompleteWaitingStepResult = {
    Success: boolean;
    /** Steps completed now. */
    Completed: string[];
    /** Steps not reached yet; the signal is held on them and applied when they are. */
    Buffered: string[];
    /** Steps matched but left alone, each with the reason. */
    Refused: RefusedWaitingStep[];
    ErrorMessage?: string;
};

/**
 * Decides whether the caller may complete one step. Returns the refusal reason, or `null` to allow.
 * The remote operation supplies one; in-process callers usually do not.
 */
export type WaitingStepAuthorizer = (task: MJTaskEntity) => Promise<string | null>;

/** Cap on steps one correlation-key signal completes. Bounds a runaway key; real fan-outs are far smaller. */
export const MAX_STEPS_PER_SIGNAL = 1000;

export class TaskGraphWaitingSteps {
    /**
     * Completes a waiting External or provider-Human step — or holds the signal on it until the
     * dispatcher reaches it.
     *
     * `Wait` steps and inbox-Human steps are refused by name: a Wait completes on its clock, and an
     * inbox step completes when its request is answered. Letting either be signalled would give one
     * step two ways to finish, and the two would disagree.
     */
    public static async CompleteWaitingStep(
        request: CompleteWaitingStepRequest,
        provider: IMetadataProvider,
        contextUser: UserInfo,
        authorize?: WaitingStepAuthorizer,
    ): Promise<CompleteWaitingStepResult> {
        const problem = requestProblem(request);
        if (problem) return { Success: false, Completed: [], Buffered: [], Refused: [], ErrorMessage: problem };

        const tasks = await loadTargets(request, provider, contextUser);
        if ('Error' in tasks) return { Success: false, Completed: [], Buffered: [], Refused: [], ErrorMessage: tasks.Error };

        const result: CompleteWaitingStepResult = { Success: true, Completed: [], Buffered: [], Refused: [] };
        const claims = new TaskClaimStore('waiting-step-signal', 0);
        for (const task of tasks.Tasks) {
            await completeOne(task, request, claims, provider, contextUser, authorize, result);
        }

        if (result.Completed.length > 0) KickTaskGraphDispatchers();
        if (request.TaskID && result.Completed.length === 0 && result.Buffered.length === 0) {
            result.Success = false;
            result.ErrorMessage = result.Refused[0]?.Reason ?? 'The step could not be completed.';
        }
        return result;
    }
}

function requestProblem(request: CompleteWaitingStepRequest): string | null {
    const byID = !!request?.TaskID?.trim();
    const byKey = !!request?.CorrelationKey?.trim();
    if (byID === byKey) return 'Name exactly one of TaskID or CorrelationKey.';
    if (request.Status && request.Status !== 'Complete' && request.Status !== 'Failed') {
        return `Status must be "Complete" or "Failed", not "${String(request.Status)}".`;
    }
    if (request.Payload !== undefined && request.Payload !== null
        && (typeof request.Payload !== 'object' || Array.isArray(request.Payload))) {
        return 'Payload must be an object; its fields are merged into the workflow payload.';
    }
    return null;
}

/** The step named by ID, or every pending External step on the key. */
async function loadTargets(
    request: CompleteWaitingStepRequest,
    provider: IMetadataProvider,
    contextUser: UserInfo,
): Promise<{ Tasks: MJTaskEntity[] } | { Error: string }> {
    if (request.TaskID) {
        const task = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
        if (!(await task.Load(request.TaskID.trim()))) return { Error: 'No such step.' };
        return { Tasks: [task] };
    }
    const key = request.CorrelationKey!.trim();
    // BypassCache: the claim protocol writes these rows through procedures, out from under any cache.
    const result = await RunView.FromMetadataProvider(provider).RunView<MJTaskEntity>(
        {
            EntityName: 'MJ: Tasks',
            ExtraFilter: `CorrelationKey='${EscapeSQLString(key)}' AND StepType='External' AND Status='Pending'`,
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: MAX_STEPS_PER_SIGNAL,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        contextUser,
    );
    if (!result.Success) return { Error: `Could not look up steps waiting on "${key}": ${result.ErrorMessage}` };
    return { Tasks: result.Results ?? [] };
}

async function completeOne(
    task: MJTaskEntity,
    request: CompleteWaitingStepRequest,
    claims: TaskClaimStore,
    provider: IMetadataProvider,
    contextUser: UserInfo,
    authorize: WaitingStepAuthorizer | undefined,
    result: CompleteWaitingStepResult,
): Promise<void> {
    const kind = WaitingStepKindOf(task);
    if (kind !== 'External' && kind !== 'ProviderHuman') {
        result.Refused.push({ TaskID: task.ID, Reason: refusalForKind(task) });
        return;
    }
    const denied = authorize ? await authorize(task) : null;
    if (denied) {
        result.Refused.push({ TaskID: task.ID, Reason: denied });
        return;
    }

    const status = request.Status ?? 'Complete';
    const config = ParseStepConfiguration(task.Configuration);
    const output = status === 'Complete'
        ? JSON.stringify(ComposeWaitingStepOutput(PayloadAtStartOf(config), withCompletedBy(request)))
        : null;
    const signal: PendingWaitingSignal = {
        status,
        payload: request.Payload ?? null,
        errorMessage: request.ErrorMessage ?? null,
        completedByUserID: request.CompletedByUserID ?? null,
        receivedAt: new Date().toISOString(),
    };
    const outcome = await claims.TryCompleteWaitingStep(
        provider, task.ID, WAITING_STEP_MARKER, status, output,
        status === 'Failed' ? (request.ErrorMessage ?? 'The step was reported as failed.') : null,
        // Only used when the step is completed now; a held signal decides its taint when applied.
        JSON.stringify(signal), WaitingStepOutputTaint(config, request.Payload), contextUser,
    );
    recordOutcome(task, outcome, result);
}

function recordOutcome(task: MJTaskEntity, outcome: string | null, result: CompleteWaitingStepResult): void {
    switch (outcome) {
        case 'Completed':
            result.Completed.push(task.ID);
            return;
        case 'Buffered':
            result.Buffered.push(task.ID);
            return;
        case null:
            LogError(`[TaskGraph] Completing waiting step ${task.ID} failed to run; see the guarded-write error above.`);
            result.Refused.push({ TaskID: task.ID, Reason: 'The completion could not be written. Try again.' });
            return;
        default:
            result.Refused.push({
                TaskID: task.ID,
                Reason: task.Status === 'Pending'
                    ? 'A signal is already held on this step; it will be applied when the step is reached.'
                    : `The step is already ${task.Status}.`,
            });
    }
}

function refusalForKind(task: MJTaskEntity): string {
    if (task.StepType === 'Wait') return 'A Wait step completes on its own clock and cannot be signalled.';
    if (task.StepType === 'Human') return 'This Human step uses the built-in inbox; answer its request instead.';
    return 'That task is not a waiting step.';
}

/** The caller's payload, plus who decided when a person did. */
function withCompletedBy(request: CompleteWaitingStepRequest): Record<string, unknown> {
    const payload = { ...(request.Payload ?? {}) };
    return request.CompletedByUserID ? { ...payload, completedByUserID: request.CompletedByUserID } : payload;
}
