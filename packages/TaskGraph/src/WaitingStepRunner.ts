/**
 * @fileoverview The dispatcher's half of waiting steps: reaching them, and settling them.
 *
 * Split out of `TaskGraphDispatcher` because none of it claims or runs anything, and the dispatcher
 * already carries the claim protocol, runners, sagas and the debugger. The dispatcher calls in at two
 * moments and hands over what it already holds:
 *
 * - **Reach** — a waiting step's prerequisites are satisfied. Mark it waiting (once, across
 *   instances), stamp its deadline / correlation key / starting payload, raise it with its provider
 *   when it is a provider-Human step, and apply any signal that arrived before it was reached.
 * - **Sweep** — every pass, for each graph with waiting steps: complete Wait steps whose moment has
 *   come, apply held signals, and fail steps whose deadline has passed.
 *
 * Every write is a guarded procedure (see `TaskClaimStore`), so two instances reaching or sweeping
 * the same step resolve to one winner and the rowcount says which.
 *
 * @module @memberjunction/task-graph
 */
import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { IndexByUUID } from '@memberjunction/global';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskClaimStore } from './TaskClaimStore';
import { ResolveHumanTaskProvider, type HumanTaskRaiseResult } from './HumanTaskProvider';
import {
    ComposeWaitingStepOutput,
    ParseStepConfiguration,
    PayloadAtStartOf,
    PendingSignalOf,
    ResolveCorrelationKey,
    WAITING_STEP_MARKER,
    WaitingStepDueAt,
    WaitingStepKindOf,
} from './waiting-steps';

/** How many times a provider's transient raise failure is retried inline before the step fails. */
const MAX_PROVIDER_RAISE_ATTEMPTS = 3;

/** Backoff between those attempts. Short: the pass is holding the graph. */
const PROVIDER_RAISE_BACKOFF_MS = 250;

/** What the dispatcher already knows about a step it has just found eligible. */
export type ReachedWaitingStep = {
    Task: MJTaskEntity;
    /** The payload the step is reached with: upstream outputs merged with its authored input. */
    Payload: Record<string, unknown>;
    /** The user who submitted the workflow, when recorded. A provider's fallback owner. */
    OwnerUserID: string | null;
};

export class WaitingStepRunner {
    constructor(
        private readonly claims: TaskClaimStore,
        private readonly contextUser: () => UserInfo,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Handles a waiting step the dispatcher has just found eligible. Idempotent: a step already
     * marked waiting is left alone, which is what stops a step parked for three days from being
     * re-raised every five seconds.
     *
     * @returns true when the step's status changed (it failed, or a held signal completed it), so
     *          the caller re-reads the graph before deciding anything else about it
     */
    public async Reach(step: ReachedWaitingStep, provider: IMetadataProvider): Promise<boolean> {
        const task = step.Task;
        if (task.ClaimedBy === WAITING_STEP_MARKER) return false;
        const kind = WaitingStepKindOf(task);
        if (!kind) return false;

        const config = ParseStepConfiguration(task.Configuration);
        const now = this.now();
        const due = WaitingStepDueAt(kind, config, step.Payload, now);
        const key = kind === 'External' ? ResolveCorrelationKey(config.external, step.Payload) : { Value: null };

        const won = await this.claims.TryMarkWaiting(
            provider,
            task.ID,
            WAITING_STEP_MARKER,
            'Value' in due ? due.Value : null,
            'Value' in key ? key.Value : null,
            JSON.stringify(step.Payload),
            this.contextUser(),
        );
        if (!won) return false;   // another instance reached it, or it is no longer Pending
        task.ClaimedBy = WAITING_STEP_MARKER;

        // Unresolvable settings fail the step loudly rather than guessing. A Wait whose moment was
        // "now" because a payload value was missing would take a wrong turn nobody could see.
        if ('Error' in due) return this.fail(provider, task, `${kind} step "${task.Name}" cannot wait: ${due.Error}.`);
        if ('Error' in key) return this.fail(provider, task, `External step "${task.Name}" cannot wait: ${key.Error}.`);

        if (kind === 'ProviderHuman') {
            const raised = await this.raiseWithProvider(task, config, step, due.Value, provider);
            if (raised) return raised;
        }
        return this.applyHeldSignal(provider, task, step.Payload);
    }

    /**
     * Settles the waiting steps of one graph: Wait steps whose moment has come, held signals, and
     * deadlines that have passed.
     *
     * @returns how many steps changed status, so the caller knows whether to re-read the graph
     */
    public async Sweep(provider: IMetadataProvider, parentTaskID: string, waiting: readonly MJTaskEntity[]): Promise<number> {
        let changed = 0;
        const now = this.now();
        let anyDeadlinePassed = false;

        for (const task of waiting) {
            const kind = WaitingStepKindOf(task);
            if (!kind || task.ClaimedBy !== WAITING_STEP_MARKER) continue;
            const due = task.DueAt ? new Date(task.DueAt) : null;
            const isDue = !!due && due.getTime() <= now.getTime();

            if (kind === 'Wait') {
                if (isDue && (await this.completeDueWait(provider, task))) changed++;
                continue;
            }
            if (await this.applyHeldSignal(provider, task, undefined)) {
                changed++;
                continue;
            }
            if (isDue) anyDeadlinePassed = true;
        }

        if (anyDeadlinePassed) changed += await this.expire(provider, parentTaskID, waiting);
        return changed;
    }

    // ── reach helpers ──────────────────────────────────────────────────────

    /**
     * Raises a provider-Human step with its provider.
     *
     * @returns true when the step FAILED (no provider, or the provider refused), false when it is
     *          now waiting on the provider
     */
    private async raiseWithProvider(
        task: MJTaskEntity,
        config: ReturnType<typeof ParseStepConfiguration>,
        step: ReachedWaitingStep,
        dueAt: Date | null,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        const key = config.human?.provider?.trim() ?? '';
        const humanProvider = ResolveHumanTaskProvider(key);
        if (!humanProvider) {
            return this.fail(
                provider, task,
                `No human-task provider is registered under "${key}" on this server, so step "${task.Name}" ` +
                `cannot be put in front of anyone. Load the package that registers it, then retry the step.`,
            );
        }

        let result: HumanTaskRaiseResult = { Outcome: 'transient-failure', Message: 'not attempted' };
        for (let attempt = 1; attempt <= MAX_PROVIDER_RAISE_ATTEMPTS; attempt++) {
            result = await this.raiseOnce(humanProvider, task, config, step, dueAt, provider);
            if (result.Outcome !== 'transient-failure') break;
            if (attempt < MAX_PROVIDER_RAISE_ATTEMPTS) await new Promise((r) => setTimeout(r, PROVIDER_RAISE_BACKOFF_MS * attempt));
        }
        if (result.Outcome === 'raised') {
            LogStatus(`[TaskGraph] Step "${task.Name}" (${task.ID}) raised with human-task provider "${key}".`);
            return false;
        }
        // The cap was hit (or the provider refused outright). Failed rather than left waiting on an
        // ask nobody received; `TaskGraph.RetryTask` re-reaches the step and raises it again.
        return this.fail(provider, task, `Human-task provider "${key}" could not raise step "${task.Name}": ${result.Message}`);
    }

    private async raiseOnce(
        humanProvider: NonNullable<ReturnType<typeof ResolveHumanTaskProvider>>,
        task: MJTaskEntity,
        config: ReturnType<typeof ParseStepConfiguration>,
        step: ReachedWaitingStep,
        dueAt: Date | null,
        provider: IMetadataProvider,
    ): Promise<HumanTaskRaiseResult> {
        try {
            return await humanProvider.RaiseTask({
                TaskID: task.ID,
                ParentTaskID: task.ParentID ?? '',
                Name: task.Name,
                Instructions: config.human?.instructions ?? task.Description ?? null,
                AssignedUserID: task.UserID,
                OwnerUserID: step.OwnerUserID,
                DueAt: dueAt,
                Payload: step.Payload,
                ProviderConfiguration: config.human?.providerConfiguration ?? {},
                ContextUser: this.contextUser(),
                Provider: provider,
            });
        } catch (e) {
            // A provider that throws is treated as transient: the next attempt may succeed, and the
            // cap still bounds it.
            return { Outcome: 'transient-failure', Message: e instanceof Error ? e.message : String(e) };
        }
    }

    // ── settle helpers ─────────────────────────────────────────────────────

    /** Applies a signal that arrived before the step was reached. True when it settled the step. */
    private async applyHeldSignal(
        provider: IMetadataProvider,
        task: MJTaskEntity,
        payloadAtStart: Record<string, unknown> | undefined,
    ): Promise<boolean> {
        const config = ParseStepConfiguration(task.Configuration);
        const signal = PendingSignalOf(config);
        if (!signal) return false;
        const start = payloadAtStart ?? PayloadAtStartOf(config);
        const output = signal.status === 'Complete' ? JSON.stringify(ComposeWaitingStepOutput(start, signal.payload)) : null;
        const outcome = await this.claims.TryCompleteWaitingStep(
            provider, task.ID, WAITING_STEP_MARKER, signal.status, output,
            signal.errorMessage ?? (signal.status === 'Failed' ? 'The signal reported a failure.' : null),
            '{}', this.contextUser(),
        );
        return outcome === 'Completed';
    }

    private async completeDueWait(provider: IMetadataProvider, task: MJTaskEntity): Promise<boolean> {
        const start = PayloadAtStartOf(ParseStepConfiguration(task.Configuration));
        const waitedUntil = task.DueAt ? new Date(task.DueAt).toISOString() : this.now().toISOString();
        const output = JSON.stringify(ComposeWaitingStepOutput(start, { waitedUntil }));
        return this.claims.TryCompleteDueWait(provider, task.ID, WAITING_STEP_MARKER, output, this.contextUser());
    }

    /** Fails the graph's overdue External / provider-Human steps, and tells providers to withdraw. */
    private async expire(provider: IMetadataProvider, parentTaskID: string, waiting: readonly MJTaskEntity[]): Promise<number> {
        const expiredIDs = await this.claims.ExpireWaitingSteps(provider, parentTaskID, WAITING_STEP_MARKER, this.contextUser());
        const byID = IndexByUUID(waiting);
        for (const id of expiredIDs) {
            const task = byID.Get(id);
            if (!task || WaitingStepKindOf(task) !== 'ProviderHuman') continue;
            await this.withdraw(task, provider);
        }
        return expiredIDs.length;
    }

    private async withdraw(task: MJTaskEntity, provider: IMetadataProvider): Promise<void> {
        const key = ParseStepConfiguration(task.Configuration).human?.provider?.trim() ?? '';
        const humanProvider = ResolveHumanTaskProvider(key);
        if (!humanProvider) return;
        try {
            await humanProvider.WithdrawTask({ TaskID: task.ID, Reason: 'expired', ContextUser: this.contextUser(), Provider: provider });
        } catch (e) {
            // Best-effort by contract: the step has already failed, and a stale ask in the provider's
            // own system is visible there. Logged so it is not lost.
            LogError(`[TaskGraph] Provider "${key}" could not withdraw expired step ${task.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Fails a reached step with a reason. Always returns true: the step's status changed (or another instance's did). */
    private async fail(provider: IMetadataProvider, task: MJTaskEntity, message: string): Promise<boolean> {
        LogError(`[TaskGraph] ${message}`);
        const outcome = await this.claims.TryCompleteWaitingStep(
            provider, task.ID, WAITING_STEP_MARKER, 'Failed', null, message, '{}', this.contextUser(),
        );
        if (outcome !== 'Completed') {
            LogError(`[TaskGraph] Could not record the failure of step ${task.ID} (${outcome ?? 'statement did not run'}).`);
        }
        return true;
    }
}
