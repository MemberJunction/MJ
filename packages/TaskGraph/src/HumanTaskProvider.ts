/**
 * @fileoverview The plug-in point for who does a workflow's Human step, and how they do it.
 *
 * A Human step used to have exactly one substrate: an `MJ: AI Agent Requests` row in the assignee's
 * inbox. Apps that already run their own approval systems (bizapps-tasks, a ticketing integration,
 * a credentialing committee) had no way to put a workflow step in front of their users, so they
 * either duplicated the step into their own records by hand or modelled it as something else.
 *
 * A provider is a server-side class registered with MJ's ClassFactory under a key:
 *
 * ```typescript
 * @RegisterClass(BaseHumanTaskProvider, 'BizAppsTasks')
 * export class BizAppsTasksHumanTaskProvider extends BaseHumanTaskProvider {
 *     public async RaiseTask(ctx: HumanTaskRaiseContext): Promise<HumanTaskRaiseResult> {
 *         // create the app's own task, remembering ctx.TaskID so its decision can complete the step
 *         return { Outcome: 'raised', ExternalReference: myTask.ID };
 *     }
 * }
 * ```
 *
 * A Human step names it in configuration (`human.provider = 'BizAppsTasks'`). When the dispatcher
 * reaches the step it marks it waiting and calls `RaiseTask` exactly once. The provider completes the
 * step later, when its own record is decided, through
 * {@link TaskGraphWaitingSteps.CompleteWaitingStep} — the same completion path an External step uses,
 * so there is one way a waiting step finishes, not one per provider.
 *
 * Core never names a provider. The default (`'AgentRequest'`) is the built-in inbox and does not go
 * through this class at all: its settle path is a poll over answered requests, which predates this
 * contract and is unchanged.
 *
 * @module @memberjunction/task-graph
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/** Everything a provider needs to put a step in front of a person. */
export type HumanTaskRaiseContext = {
    /** The `MJ: Tasks` row for the step — the handle the provider completes it by. */
    TaskID: string;
    /** The workflow run (parent task) the step belongs to. */
    ParentTaskID: string;
    /** The step's name, as the author wrote it. */
    Name: string;
    /** What the person is being asked to do. */
    Instructions: string | null;
    /** The user the workflow assigned the step to, when it named one. */
    AssignedUserID: string | null;
    /** The user who submitted the workflow — the fallback owner of the ask. */
    OwnerUserID: string | null;
    /** When the step gives up, when it has a deadline. The dispatcher enforces it; the provider may show it. */
    DueAt: Date | null;
    /**
     * The payload as it stands when the step is reached: every upstream step's output merged. What
     * the person needs to see to decide usually lives here.
     */
    Payload: Record<string, unknown>;
    /** The step's `providerConfiguration`, untouched. Each provider documents its own keys. */
    ProviderConfiguration: Record<string, unknown>;
    /** The dispatcher's runtime user. Providers write their own records as this user. */
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/**
 * What raising produced.
 *
 * Three outcomes, matching the built-in inbox, because the difference matters: a transient failure
 * (a dropped connection) is retried on the next pass, while a permanent one (a misconfigured task
 * type) fails the step with the provider's message instead of retrying forever.
 */
export type HumanTaskRaiseResult =
    | { Outcome: 'raised'; ExternalReference?: string }
    | { Outcome: 'transient-failure'; Message: string }
    | { Outcome: 'permanent-failure'; Message: string };

/** Why a provider is being asked to withdraw its ask. */
export type HumanTaskWithdrawReason = 'expired' | 'cancelled' | 'completed-elsewhere';

/** Everything a provider needs to withdraw an ask it raised. */
export type HumanTaskWithdrawContext = {
    TaskID: string;
    Reason: HumanTaskWithdrawReason;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/**
 * Base class for a human-task provider. Register subclasses with
 * `@RegisterClass(BaseHumanTaskProvider, '<key>')` in a server-side package the host loads.
 */
export abstract class BaseHumanTaskProvider {
    /**
     * Put the step in front of a person. Called once per step, when the dispatcher reaches it.
     *
     * Must not complete the step itself — even when a decision is somehow already known. Completion
     * goes through `CompleteWaitingStep`, which is what keeps the guarded write in one place.
     */
    public abstract RaiseTask(context: HumanTaskRaiseContext): Promise<HumanTaskRaiseResult>;

    /**
     * Withdraw an ask the step no longer needs: it expired, its run was cancelled, or someone
     * completed it another way. Best-effort; the default does nothing, which is right for a provider
     * whose own record is harmless when stale.
     */
    public async WithdrawTask(_context: HumanTaskWithdrawContext): Promise<void> {
        return;
    }
}

/**
 * The provider registered under a key, or `null` when none is.
 *
 * Exact-key lookup, deliberately. ClassFactory falls back to the base class when a key is not
 * registered; for an abstract base that would hand back something that cannot raise anything, and a
 * step would sit waiting on a provider that does not exist. A missing provider is reported by name
 * instead — at submit when possible, and again by the dispatcher.
 */
export function ResolveHumanTaskProvider(key: string): BaseHumanTaskProvider | null {
    const trimmed = key.trim();
    if (!trimmed) return null;
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseHumanTaskProvider, trimmed);
    if (!registration) return null;
    if (registration.Key?.trim().toLowerCase() !== trimmed.toLowerCase()) return null;
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseHumanTaskProvider>(BaseHumanTaskProvider, trimmed);
}
