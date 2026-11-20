/**
 * @fileoverview The plug-in point for who answers a human-in-the-loop ask, and how.
 *
 * Two things in MJ stop and wait for a person: a workflow's Human step, and an agent that asks a
 * question mid-run (a Chat step's feedback request). Both are answered in MJ's built-in inbox, an
 * `MJ: AI Agent Requests` row, unless a provider takes the ask instead. Apps that already run their
 * own approval systems (bizapps-tasks, a ticketing integration, a credentialing committee) plug in a
 * provider so the ask reaches their users where they already work.
 *
 * A provider is a server-side class registered with MJ's ClassFactory under a key:
 *
 * ```typescript
 * @RegisterClassEx(BaseHumanTaskProvider, {
 *     key: 'BizAppsTasks',
 *     metadata: { [HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT]: true },   // optional, see below
 * })
 * export class BizAppsTasksHumanTaskProvider extends BaseHumanTaskProvider {
 *     public async RaiseTask(ctx: HumanTaskRaiseContext): Promise<HumanTaskRaiseResult> {
 *         // create the app's own task, remembering ctx.Subject so its decision can answer the ask
 *         return { Outcome: 'raised', ExternalReference: myTask.ID };
 *     }
 * }
 * ```
 *
 * WHICH ASKS A PROVIDER GETS
 *  - A workflow Human step that names it (`human.provider = 'BizAppsTasks'`). Always.
 *  - Every other Human step, and agents' feedback requests, only when the install chooses it as the
 *    default ({@link HumanTaskProviderDefaults}). Choosing is two steps on purpose: the provider
 *    declares it CAN be the default (the `CanBeDefault` registration metadata, written by the app
 *    that knows it handles any ask), and the install's configuration says it IS. Installing an app
 *    never reroutes anyone's approvals by itself.
 *
 * HOW A PROVIDER ANSWERS
 *  - A workflow step: `TaskGraphWaitingSteps.CompleteWaitingStep` (`@memberjunction/task-graph`).
 *  - An agent request: `AnswerAgentRequestFromProvider` (`@memberjunction/ai-agents`), which answers
 *    the `MJ: AI Agent Requests` row; answering it is what resumes the agent.
 *
 * Plan approvals (an agent's Plan step) are not routed to a provider: the reviewer edits the plan,
 * and that reply has no place in the provider contract yet.
 *
 * @module @memberjunction/ai-core-plus
 */
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { IsDefaultHumanTaskProvider } from './task-graph/task-graph-spec';

/**
 * The registration metadata key a provider sets to `true` to declare it may be the install's
 * default: it handles any Human step and agent feedback request, not only steps that name it.
 */
export const HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT = 'CanBeDefault';

/** What the person is being asked about, and the handle the provider answers it by. */
export type HumanTaskSubject =
    /** A workflow Human step. Answered through `TaskGraphWaitingSteps.CompleteWaitingStep`. */
    | { Kind: 'WorkflowStep'; TaskID: string; ParentTaskID: string }
    /** An agent's feedback request. Answered through `AnswerAgentRequestFromProvider`. */
    | { Kind: 'AgentRequest'; AgentRequestID: string; AgentRunID: string | null };

/** Everything a provider needs to put an ask in front of a person. */
export type HumanTaskRaiseContext = {
    Subject: HumanTaskSubject;
    /** A short name for the ask: the step's name, or the agent's. */
    Name: string;
    /** What the person is being asked to do. */
    Instructions: string | null;
    /** The user the ask is for, when one was chosen. */
    AssignedUserID: string | null;
    /** The user the ask belongs to otherwise: who submitted the workflow, or who ran the agent. */
    OwnerUserID: string | null;
    /** When the ask gives up, when it has a deadline. MJ enforces it; the provider may show it. */
    DueAt: Date | null;
    /**
     * What the person needs to decide. A workflow step: every upstream step's output merged. An agent
     * request: `{ agentName, responseSchema }` (the form the agent asked to be filled in, if any).
     */
    Payload: Record<string, unknown>;
    /** The step's `providerConfiguration`, untouched; `{}` for an agent request. */
    ProviderConfiguration: Record<string, unknown>;
    /** The user MJ runs as. Providers write their own records as this user. */
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/**
 * What raising produced.
 *
 * A transient failure (a dropped connection) is retried; a permanent one (a misconfigured task type)
 * fails a workflow step with the provider's message. An agent request is already in the built-in
 * inbox, so a failure there leaves it answerable in the inbox and is logged.
 */
export type HumanTaskRaiseResult =
    | { Outcome: 'raised'; ExternalReference?: string }
    | { Outcome: 'transient-failure'; Message: string }
    | { Outcome: 'permanent-failure'; Message: string };

/** Why a provider is being asked to withdraw its ask. */
export type HumanTaskWithdrawReason = 'expired' | 'cancelled' | 'completed-elsewhere';

/** Everything a provider needs to withdraw an ask it raised. */
export type HumanTaskWithdrawContext = {
    Subject: HumanTaskSubject;
    Reason: HumanTaskWithdrawReason;
    /** What the provider returned when it raised the ask, when MJ recorded it. */
    ExternalReference: string | null;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/**
 * Base class for a human-task provider. Register subclasses with
 * `@RegisterClass(BaseHumanTaskProvider, '<key>')`, or `@RegisterClassEx` to declare
 * {@link HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT}, in a server-side package the host loads.
 */
export abstract class BaseHumanTaskProvider {
    /**
     * Put the ask in front of a person. Called once per ask.
     *
     * Must not answer the ask itself, even when a decision is somehow already known: answering goes
     * through MJ's own path for the subject, which keeps the guarded write in one place.
     */
    public abstract RaiseTask(context: HumanTaskRaiseContext): Promise<HumanTaskRaiseResult>;

    /**
     * Withdraw an ask that no longer needs answering: it expired, its run was cancelled, or it was
     * answered somewhere else (an agent request answered in the inbox or the conversation).
     * Best-effort; the default does nothing, which is right for a provider whose own record is
     * harmless when stale.
     */
    public async WithdrawTask(_context: HumanTaskWithdrawContext): Promise<void> {
        return;
    }
}

/** The registration for exactly this key, or null. See {@link ResolveHumanTaskProvider} for why exact. */
function exactRegistration(key: string) {
    const trimmed = key.trim();
    if (!trimmed) return null;
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseHumanTaskProvider, trimmed);
    if (!registration || registration.Key?.trim().toLowerCase() !== trimmed.toLowerCase()) return null;
    return registration;
}

/**
 * The provider registered under a key, or `null` when none is.
 *
 * Exact-key lookup, deliberately. ClassFactory falls back to the base class when a key is not
 * registered; for an abstract base that would hand back something that cannot raise anything, and an
 * ask would sit waiting on a provider that does not exist.
 */
export function ResolveHumanTaskProvider(key: string): BaseHumanTaskProvider | null {
    if (!exactRegistration(key)) return null;
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseHumanTaskProvider>(BaseHumanTaskProvider, key.trim());
}

/** True when the two keys name the same provider (case and surrounding space ignored). */
export function SameHumanTaskProvider(a: string | null | undefined, b: string | null | undefined): boolean {
    const left = a?.trim().toLowerCase();
    return !!left && left === b?.trim().toLowerCase();
}

/** True when a provider is registered under `key`. */
export function IsHumanTaskProviderRegistered(key: string): boolean {
    return exactRegistration(key) !== null;
}

/** True when the provider registered under `key` declared {@link HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT}. */
export function CanHumanTaskProviderBeDefault(key: string): boolean {
    return exactRegistration(key)?.Metadata?.[HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT] === true;
}

/** Why a configured default is not in effect; null when it is. Pure over the two registry answers. */
export function DefaultHumanTaskProviderRefusal(key: string, registered: boolean, canBeDefault: boolean): string | null {
    if (!registered) return `no human-task provider is registered under "${key}" on this server`;
    if (!canBeDefault) {
        return `the provider "${key}" does not declare ${HUMAN_TASK_PROVIDER_CAN_BE_DEFAULT} in its registration, ` +
            `so it handles only the workflow steps that name it`;
    }
    return null;
}

/**
 * The install's default human-task provider: which provider takes Human steps that name none, and
 * agents' feedback requests. None by default, which keeps everything in the built-in inbox.
 *
 * The host sets it once at startup from its configuration (`humanTasks.defaultProvider` in
 * `mj.config.cjs` for MJAPI). The choice is checked each time it is read rather than when it is set:
 * a provider's package can register after configuration is read, and a provider that is configured
 * but missing or ineligible must fall back to the inbox, loudly, not take asks it cannot handle.
 */
export class HumanTaskProviderDefaults extends BaseSingleton<HumanTaskProviderDefaults> {
    private configuredKey: string | null = null;
    private reportedRefusal: string | null = null;

    public static get Instance(): HumanTaskProviderDefaults {
        return super.getInstance<HumanTaskProviderDefaults>();
    }

    /**
     * Choose the install's default provider. Empty, absent, or the built-in `'AgentRequest'` means
     * none. Returns why the choice is not in effect right now, or null when it is.
     */
    public Configure(key: string | null | undefined): string | null {
        const trimmed = key?.trim() ?? '';
        this.configuredKey = trimmed && !IsDefaultHumanTaskProvider(trimmed) ? trimmed : null;
        this.reportedRefusal = null;
        if (!this.configuredKey) return null;
        const refusal = this.refusal(this.configuredKey);
        if (refusal) {
            LogError(`[HumanTasks] The default human-task provider is not in effect yet: ${refusal}. Asks stay in the built-in inbox until it is.`);
        } else {
            LogStatus(`[HumanTasks] Default human-task provider: "${this.configuredKey}".`);
        }
        return refusal;
    }

    /** The configured key, whether or not it is in effect. */
    public get ConfiguredKey(): string | null {
        return this.configuredKey;
    }

    /**
     * The provider key that takes asks with no provider of their own, or null for the built-in inbox.
     * A configured provider that is missing or ineligible is reported once and treated as none.
     */
    public get EffectiveKey(): string | null {
        if (!this.configuredKey) return null;
        const refusal = this.refusal(this.configuredKey);
        if (!refusal) return this.configuredKey;
        if (refusal !== this.reportedRefusal) {
            this.reportedRefusal = refusal;
            LogError(`[HumanTasks] Not using the default human-task provider: ${refusal}. Asks go to the built-in inbox.`);
        }
        return null;
    }

    private refusal(key: string): string | null {
        return DefaultHumanTaskProviderRefusal(key, IsHumanTaskProviderRegistered(key), CanHumanTaskProviderBeDefault(key));
    }
}

/**
 * The provider a Human step should use: the one it names, when it names one (the built-in
 * `'AgentRequest'` included), otherwise the install's default (`defaultKey`), otherwise none.
 * Pure; callers pass {@link HumanTaskProviderDefaults.EffectiveKey}.
 */
export function ResolveHumanStepProvider(stepProvider: string | null | undefined, defaultKey: string | null): string | undefined {
    const named = stepProvider?.trim();
    if (named) return named;
    return defaultKey ?? undefined;
}
