/**
 * @fileoverview Driver for the User Routine Dispatcher scheduled job (P1.5).
 *
 * One admin-owned Scheduled Job of this type (seeded via metadata, 1-minute cron) sweeps
 * `MJ: User Routines` for due routines, claims each by advancing NextRunAt BEFORE running
 * (so an overlapping pass never double-runs it), executes the routine's target (Agent /
 * Action / Prompt) with bounded concurrency and per-routine error isolation, records each
 * execution in `MJ: User Routine Runs` (telemetry lives on the linked AgentRun / PromptRun /
 * ActionExecutionLog — never duplicated), and notifies the owner + recipients per the
 * routine's NotifyCondition through the MJ template + notification stack.
 *
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass, SafeJSONParse, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import {
    ValidationResult,
    ValidationErrorInfo,
    ValidationErrorType,
    UserInfo,
    Metadata,
    IMetadataProvider,
    RunView,
} from '@memberjunction/core';
import {
    MJConversationEntity,
    MJEnvironmentEntityExtended,
    MJScheduledJobEntity,
    MJUserRoutineEntity,
    MJUserRoutineRecipientEntity,
    MJUserRoutineRunEntity,
    MJUserNotificationEntity,
    MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended, AIPromptParams } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { TemplateEngineServer } from '@memberjunction/templates';
import { NotificationEngine } from '@memberjunction/notifications';
import { ScheduledJobResult, NotificationContent, ScheduledJobConfiguration } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import {
    ComputeRoutineNextRunAt,
    ComputeResultHash,
    EvaluateNotifyCondition,
    IsRoutineDue,
    RoutineNeedsSeeding,
    BuildDueRoutineFilter,
    SortRecipientsBySequence,
    RunWithBoundedConcurrency,
} from '../UserRoutineProcessor';

/**
 * Optional configuration (stored in ScheduledJob.Configuration). All fields optional —
 * the dispatcher runs with sensible defaults when Configuration is empty.
 */
export interface UserRoutineDispatcherConfiguration extends ScheduledJobConfiguration {
    /** Maximum routines executed concurrently within one sweep. Default 3. */
    MaxConcurrentRoutines?: number;
}

/** Default bound on concurrent routine executions within a single dispatcher sweep. */
const DEFAULT_MAX_CONCURRENT_ROUTINES = 3;

/** Name of the metadata-seeded default notification template (resolved BY NAME, never hardcoded ID). */
const DEFAULT_NOTIFICATION_TEMPLATE_NAME = 'User Routine Notification - Default';

/** Name of the metadata-seeded `MJ: User Notification Types` row used for in-app delivery. */
const NOTIFICATION_TYPE_NAME = 'User Routine';

/** Name of the Explorer application that scopes (hides) routine conversations. */
const ROUTINES_APPLICATION_NAME = 'Routines';

/** Cap on the persisted ResultSummary length — keeps run rows compact; full detail lives on the linked run/log records. */
const RESULT_SUMMARY_MAX_LENGTH = 4000;

/** Normalized outcome of executing a routine's target, independent of target type. */
interface RoutineTargetOutcome {
    Success: boolean;
    /** Raw result content — summarized (capped) into ResultSummary and hashed for OnChange detection. */
    ResultContent: string;
    ErrorMessage: string | null;
    AgentRunID: string | null;
    PromptRunID: string | null;
    ActionExecutionLogID: string | null;
}

/** Per-routine bookkeeping returned from an isolated routine execution. */
interface RoutineExecutionSummary {
    RoutineID: string;
    RunStatus: MJUserRoutineRunEntity['Status'];
    Notified: boolean;
}

/**
 * Driver for the User Routine Dispatcher scheduled job.
 *
 * Configuration schema (stored in ScheduledJob.Configuration):
 * `{ MaxConcurrentRoutines?: number }`
 *
 * Execution result details (stored in ScheduledJobRun.Details):
 * `{ RoutinesEvaluated, RoutinesSeeded, RoutinesRun, Succeeded, Failed, Notified }`
 */
@RegisterClass(BaseScheduledJob, 'UserRoutineDispatcherDriver')
export class UserRoutineDispatcherDriver extends BaseScheduledJob {
    /**
     * The dispatcher is a by-design 1-minute sweeper: each pass claims due routines and
     * does bounded work, so the engine's high-frequency cron warning doesn't apply.
     */
    public override get IsHighFrequencyByDesign(): boolean {
        return true;
    }

    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseDispatcherConfiguration(context.Schedule);
        const maxConcurrent = config.MaxConcurrentRoutines ?? DEFAULT_MAX_CONCURRENT_ROUTINES;
        const now = new Date();

        const candidates = await this.loadCandidateRoutines(context.ContextUser, now);
        void context.heartbeat?.();

        // Seed NextRunAt for never-scheduled routines (do NOT run them on this pass).
        const seedable = candidates.filter(r => RoutineNeedsSeeding(r, now));
        for (const routine of seedable) {
            await this.seedNextRunAt(routine, now);
            void context.heartbeat?.();
        }

        // Claim + run the due routines with bounded concurrency and per-routine isolation.
        const due = candidates.filter(r => IsRoutineDue(r, now));
        const claimed: MJUserRoutineEntity[] = [];
        for (const routine of due) {
            if (await this.claimRoutine(routine, now)) {
                claimed.push(routine);
            }
        }

        const summaries = await RunWithBoundedConcurrency(claimed, maxConcurrent, async (routine) => {
            // Per-routine error isolation: one routine failing must never kill the sweep.
            try {
                return await this.executeRoutine(routine, context);
            } catch (error) {
                this.logError(`Routine "${routine.Name}" (${routine.ID}) failed outside run tracking`, error);
                return { RoutineID: routine.ID, RunStatus: 'Failed', Notified: false } satisfies RoutineExecutionSummary;
            }
        });

        const succeeded = summaries.filter(s => s.RunStatus === 'Success').length;
        const failed = summaries.filter(s => s.RunStatus === 'Failed').length;
        const notified = summaries.filter(s => s.Notified).length;

        return {
            Success: true, // the SWEEP succeeded; individual routine failures are recorded on their run rows
            Details: {
                RoutinesEvaluated: candidates.length,
                RoutinesSeeded: seedable.length,
                RoutinesRun: claimed.length,
                Succeeded: succeeded,
                Failed: failed,
                Notified: notified,
            },
        };
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        const config = this.parseDispatcherConfiguration(schedule);
        const max = config.MaxConcurrentRoutines;
        if (max != null && (typeof max !== 'number' || !Number.isInteger(max) || max < 1)) {
            result.Errors.push(new ValidationErrorInfo(
                'Configuration.MaxConcurrentRoutines',
                'MaxConcurrentRoutines must be a positive integer when provided',
                max,
                ValidationErrorType.Failure,
            ));
        }
        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const details = (result.Details ?? {}) as Record<string, number>;
        if (!result.Success) {
            return {
                Subject: `User Routine Dispatcher failed: ${context.Schedule.Name}`,
                Body: `The dispatcher sweep "${context.Schedule.Name}" failed.\n\nError: ${result.ErrorMessage ?? 'unknown'}`,
                Priority: 'High',
                Metadata: details,
            };
        }
        return {
            Subject: `User Routine Dispatcher: ${details['RoutinesRun'] ?? 0} routine(s) executed`,
            Body: `The dispatcher sweep "${context.Schedule.Name}" evaluated ${details['RoutinesEvaluated'] ?? 0} routine(s): ` +
                `${details['RoutinesRun'] ?? 0} run (${details['Succeeded'] ?? 0} succeeded, ${details['Failed'] ?? 0} failed), ` +
                `${details['RoutinesSeeded'] ?? 0} seeded, ${details['Notified'] ?? 0} notification(s) dispatched.`,
            Priority: (details['Failed'] ?? 0) > 0 ? 'Normal' : 'Low',
            Metadata: details,
        };
    }

    // ========================================================================
    // Sweep phases
    // ========================================================================

    /** Tolerant parse — the dispatcher needs no configuration, so empty/missing/invalid JSON yields defaults. */
    private parseDispatcherConfiguration(schedule: MJScheduledJobEntity): UserRoutineDispatcherConfiguration {
        if (!schedule.Configuration) {
            return {};
        }
        return (SafeJSONParse<UserRoutineDispatcherConfiguration>(schedule.Configuration) ?? {});
    }

    /**
     * Load Active routines that are inside their activation window and either due or in
     * need of NextRunAt seeding. The SQL prefilter narrows the sweep; JS re-verifies.
     */
    private async loadCandidateRoutines(contextUser: UserInfo, now: Date): Promise<MJUserRoutineEntity[]> {
        const rv = new RunView(); // global-provider-ok: the dispatcher is a server-global scheduled task, not per-request/per-tenant
        const result = await rv.RunView<MJUserRoutineEntity>({
            EntityName: 'MJ: User Routines',
            ExtraFilter: BuildDueRoutineFilter(now.toISOString()),
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load due routines: ${result.ErrorMessage}`);
        }
        return result.Results ?? [];
    }

    /** Compute + persist NextRunAt for a never-scheduled routine WITHOUT running it. */
    private async seedNextRunAt(routine: MJUserRoutineEntity, now: Date): Promise<void> {
        try {
            routine.NextRunAt = ComputeRoutineNextRunAt(routine.CronExpression, routine.Timezone, now, routine.StartAt);
            const saved = await routine.Save();
            if (!saved) {
                this.logError(`Seeding NextRunAt for routine "${routine.Name}" failed: ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
        } catch (error) {
            // Invalid cron/timezone on a legacy row — log and move on; the entity server
            // rejects new rows like this at save time.
            this.logError(`Cannot compute NextRunAt for routine "${routine.Name}" (${routine.ID})`, error);
        }
    }

    /**
     * Claim a due routine by advancing NextRunAt to the next cron occurrence BEFORE running.
     * Persisting the claim first means an overlapping dispatcher pass (or a crash mid-run)
     * can never double-run this occurrence — the routine simply isn't due anymore. Cross-
     * process exclusion of whole sweeps is additionally provided by the Scheduled Job lock
     * (the dispatcher job runs with ConcurrencyMode='Skip').
     *
     * @returns true when the claim persisted and the routine should run on this pass.
     */
    private async claimRoutine(routine: MJUserRoutineEntity, now: Date): Promise<boolean> {
        try {
            routine.NextRunAt = ComputeRoutineNextRunAt(routine.CronExpression, routine.Timezone, now, routine.StartAt);
            const saved = await routine.Save();
            if (!saved) {
                this.log(`Claim for routine "${routine.Name}" did not persist (${routine.LatestResult?.CompleteMessage ?? 'unknown'}) — skipping this pass`);
                return false;
            }
            return true;
        } catch (error) {
            this.logError(`Claim for routine "${routine.Name}" (${routine.ID}) threw — skipping this pass`, error);
            return false;
        }
    }

    // ========================================================================
    // Per-routine execution
    // ========================================================================

    /**
     * Execute one claimed routine end-to-end: run row → target execution → run/routine
     * bookkeeping → notification decision + delivery. Never throws for target failures —
     * those are recorded on the run row; only run-row creation failures propagate.
     */
    private async executeRoutine(
        routine: MJUserRoutineEntity,
        context: ScheduledJobExecutionContext
    ): Promise<RoutineExecutionSummary> {
        const contextUser = context.ContextUser;
        const run = await this.createRunRow(routine, contextUser);
        this.log(`Running routine "${routine.Name}" (${routine.TargetType} target)`, true);

        let outcome: RoutineTargetOutcome;
        try {
            outcome = await this.executeTarget(routine, contextUser, context.heartbeat);
        } catch (error) {
            outcome = {
                Success: false,
                ResultContent: '',
                ErrorMessage: error instanceof Error ? error.message : String(error),
                AgentRunID: null,
                PromptRunID: null,
                ActionExecutionLogID: null,
            };
        }
        void context.heartbeat?.();

        const resultSummary = this.buildResultSummary(outcome);
        const resultHash = ComputeResultHash(outcome.ResultContent.length > 0 ? outcome.ResultContent : resultSummary);
        const priorResultHash = routine.LastResultHash;

        await this.finalizeRunRow(run, outcome, resultSummary, resultHash);
        await this.updateRoutineAfterRun(routine, run);

        let notified = false;
        if (EvaluateNotifyCondition(routine.NotifyCondition, run.Status, resultHash, priorResultHash)) {
            notified = await this.sendRoutineNotifications(routine, run, contextUser);
            if (notified) {
                run.NotificationSent = true;
                const saved = await run.Save();
                if (!saved) {
                    this.logError(`Failed to flag NotificationSent on run ${run.ID}: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`);
                }
            }
        }

        return { RoutineID: routine.ID, RunStatus: run.Status, Notified: notified };
    }

    /** Create the `MJ: User Routine Runs` row in its initial Running state. */
    private async createRunRow(
        routine: MJUserRoutineEntity,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MJUserRoutineRunEntity> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider; // global-provider-ok: server-global scheduled task
        const run = await md.GetEntityObject<MJUserRoutineRunEntity>('MJ: User Routine Runs', contextUser);
        run.NewRecord();
        run.RoutineID = routine.ID;
        run.StartedAt = new Date();
        run.Status = 'Running';
        const saved = await run.Save();
        if (!saved) {
            throw new Error(`Failed to create run row for routine "${routine.Name}": ${run.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
        return run;
    }

    /** Persist the run's terminal state + linkage. Telemetry stays on the linked records. */
    private async finalizeRunRow(
        run: MJUserRoutineRunEntity,
        outcome: RoutineTargetOutcome,
        resultSummary: string,
        resultHash: string
    ): Promise<void> {
        run.CompletedAt = new Date();
        run.Status = outcome.Success ? 'Success' : 'Failed';
        run.ResultSummary = resultSummary;
        run.ResultHash = resultHash;
        run.ErrorMessage = outcome.ErrorMessage;
        run.AgentRunID = outcome.AgentRunID;
        run.PromptRunID = outcome.PromptRunID;
        run.ActionExecutionLogID = outcome.ActionExecutionLogID;
        const saved = await run.Save();
        if (!saved) {
            this.logError(`Failed to finalize run ${run.ID}: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
    }

    /** Roll the run outcome up onto the routine (LastRunAt / LastRunStatus / LastResultHash). */
    private async updateRoutineAfterRun(routine: MJUserRoutineEntity, run: MJUserRoutineRunEntity): Promise<void> {
        routine.LastRunAt = run.StartedAt;
        routine.LastRunStatus = run.Status;
        routine.LastResultHash = run.ResultHash;
        const saved = await routine.Save();
        if (!saved) {
            this.logError(`Failed to update routine "${routine.Name}" after run: ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
    }

    /** Compact, capped text describing the outcome — the run row's human-readable summary. */
    private buildResultSummary(outcome: RoutineTargetOutcome): string {
        const base = outcome.Success
            ? (outcome.ResultContent.trim().length > 0 ? outcome.ResultContent.trim() : 'Completed successfully.')
            : `Failed: ${outcome.ErrorMessage ?? 'unknown error'}`;
        return base.length > RESULT_SUMMARY_MAX_LENGTH ? `${base.substring(0, RESULT_SUMMARY_MAX_LENGTH - 1)}…` : base;
    }

    // ========================================================================
    // Target execution (Agent / Action / Prompt)
    // ========================================================================

    /**
     * Dispatch by target type. The parameter type is derived from the generated entity so
     * a future CHECK-constraint widening surfaces here at compile time.
     */
    private async executeTarget(
        routine: MJUserRoutineEntity,
        contextUser: UserInfo,
        heartbeat?: () => Promise<void>
    ): Promise<RoutineTargetOutcome> {
        const targetType: MJUserRoutineEntity['TargetType'] = routine.TargetType;
        switch (targetType) {
            case 'Agent':
                return this.executeAgentTarget(routine, contextUser, heartbeat);
            case 'Prompt':
                return this.executePromptTarget(routine, contextUser);
            case 'Action':
                return this.executeActionTarget(routine, contextUser);
            default:
                throw new Error(`Unsupported routine TargetType '${targetType}' — no executor registered`);
        }
    }

    /**
     * Run an Agent target via AgentRunner, threading StartingPayload + RequestedSkillIDs.
     *
     * When the routine's dedicated conversation is available (existing `ConversationID`,
     * or creatable — see {@link EnsureRoutineConversation}), the run goes through
     * `RunAgentInConversation` so it lands as a proper conversation turn: a user
     * ConversationDetail carrying InitialMessage, an assistant ConversationDetail with the
     * agent result, and the AIAgentRun stamped with ConversationID/ConversationDetailID.
     * When no conversation can be resolved, the run falls back to standalone `RunAgent`
     * — identical outcome recording, just no conversation thread.
     */
    private async executeAgentTarget(
        routine: MJUserRoutineEntity,
        contextUser: UserInfo,
        heartbeat?: () => Promise<void>
    ): Promise<RoutineTargetOutcome> {
        const md = new Metadata() as unknown as IMetadataProvider; // global-provider-ok: server-global scheduled task
        const agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', contextUser);
        if (!await agent.Load(routine.TargetID)) {
            throw new Error(`Agent ${routine.TargetID} not found for routine "${routine.Name}"`);
        }

        const userMessage = routine.InitialMessage ?? `Run routine "${routine.Name}"`;
        const runner = new AgentRunner();
        const baseParams = {
            agent,
            conversationMessages: [{ role: 'user' as const, content: userMessage }],
            payload: routine.StartingPayload ? SafeJSONParse(routine.StartingPayload) ?? undefined : undefined,
            requestedSkillIDs: this.parseRequestedSkillIDs(routine),
            contextUser,
            // Keep the dispatcher job's lease alive while a long agent run makes progress.
            onProgress: () => { void heartbeat?.(); },
        };

        const conversationId = await this.EnsureRoutineConversation(routine, contextUser);
        const result = conversationId
            ? (await runner.RunAgentInConversation(baseParams, { conversationId, userMessage })).agentResult
            : await runner.RunAgent(baseParams);

        return {
            Success: result.success,
            ResultContent: result.payload != null ? JSON.stringify(result.payload) : '',
            ErrorMessage: result.agentRun?.ErrorMessage ?? null,
            AgentRunID: result.agentRun?.ID ?? null,
            PromptRunID: null,
            ActionExecutionLogID: null,
        };
    }

    /**
     * Resolves (or lazily creates) the routine's dedicated conversation. Public so the
     * integration suite can exercise the creation/reuse contract without an LLM call.
     *
     * The conversation is owned by the routine's owner and created with
     * `ApplicationScope='Application'` + the "${ROUTINES_APPLICATION_NAME}" Application's ID,
     * which keeps it OUT of the default chat list (the same hide mechanism meeting-room and
     * Form Builder cockpit conversations use) while remaining fully reachable from the
     * routine's UI. It is also Linked to the routine record (LinkedEntityID/LinkedRecordID)
     * and pins the routine's agent as DefaultAgentID.
     *
     * Best-effort by design: any resolution/creation failure logs and returns null so the
     * run proceeds standalone — a missing Routines app must never break a scheduled run.
     */
    public async EnsureRoutineConversation(routine: MJUserRoutineEntity, owner: UserInfo): Promise<string | null> {
        if (routine.ConversationID) {
            return routine.ConversationID;
        }
        try {
            const md = new Metadata() as unknown as IMetadataProvider; // global-provider-ok: server-global scheduled task
            const app = await this.findRoutinesApplication(owner);
            if (!app) {
                this.log(`Routines application not found — running "${routine.Name}" standalone (no conversation)`);
                return null;
            }
            const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', owner);
            conversation.NewRecord();
            conversation.Name = routine.Name;
            conversation.Type = 'Routine';
            conversation.UserID = owner.ID;
            conversation.EnvironmentID = routine.EnvironmentID ?? MJEnvironmentEntityExtended.DefaultEnvironmentID;
            conversation.ApplicationScope = 'Application';
            conversation.ApplicationID = app.ID;
            if (routine.TargetType === 'Agent') {
                conversation.DefaultAgentID = routine.TargetID;
            }
            const routineEntity = md.EntityByName('MJ: User Routines');
            if (routineEntity) {
                conversation.LinkedEntityID = routineEntity.ID;
                conversation.LinkedRecordID = routine.ID;
            }
            if (!await conversation.Save()) {
                this.logError(`Failed to create conversation for routine "${routine.Name}": ${conversation.LatestResult?.CompleteMessage ?? 'unknown'} — running standalone`);
                return null;
            }
            routine.ConversationID = conversation.ID;
            if (!await routine.Save()) {
                // The conversation still serves this run; persistence retries next run.
                this.logError(`Failed to persist ConversationID on routine "${routine.Name}": ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
            return conversation.ID;
        } catch (error) {
            this.logError(`EnsureRoutineConversation failed for "${routine.Name}": ${error instanceof Error ? error.message : String(error)} — running standalone`);
            return null;
        }
    }

    /** The "${ROUTINES_APPLICATION_NAME}" Application row whose scope hides routine conversations from the default chat list. */
    private async findRoutinesApplication(contextUser: UserInfo): Promise<{ ID: string } | null> {
        const result = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: Applications',
            ExtraFilter: `Name='${ROUTINES_APPLICATION_NAME}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);
        return result.Success && result.Results.length > 0 ? result.Results[0] : null;
    }

    /** Parse RequestedSkillIDs (JSON array of AISkill IDs) — invalid/non-array content is ignored with a log. */
    private parseRequestedSkillIDs(routine: MJUserRoutineEntity): string[] | undefined {
        if (!routine.RequestedSkillIDs) {
            return undefined;
        }
        const parsed = SafeJSONParse<unknown>(routine.RequestedSkillIDs);
        if (Array.isArray(parsed) && parsed.every((v): v is string => typeof v === 'string')) {
            return parsed.length > 0 ? parsed : undefined;
        }
        this.logError(`Routine "${routine.Name}": RequestedSkillIDs is not a JSON string array — ignoring`);
        return undefined;
    }

    /** Run a Prompt target via AIPromptRunner, passing StartingPayload as the data context. */
    private async executePromptTarget(routine: MJUserRoutineEntity, contextUser: UserInfo): Promise<RoutineTargetOutcome> {
        const md = new Metadata() as unknown as IMetadataProvider; // global-provider-ok: server-global scheduled task
        const prompt = await md.GetEntityObject<MJAIPromptEntityExtended>('AI Prompts', contextUser);
        if (!await prompt.Load(routine.TargetID)) {
            throw new Error(`Prompt ${routine.TargetID} not found for routine "${routine.Name}"`);
        }

        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = routine.StartingPayload ? SafeJSONParse(routine.StartingPayload) ?? {} : {};
        params.contextUser = contextUser;

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt(params);

        return {
            Success: result.success,
            ResultContent: result.rawResult ?? '',
            ErrorMessage: result.errorMessage ?? null,
            AgentRunID: null,
            PromptRunID: result.promptRun?.ID ?? null,
            ActionExecutionLogID: null,
        };
    }

    /** Run an Action target via ActionEngineServer; StartingPayload maps to input params by name. */
    private async executeActionTarget(routine: MJUserRoutineEntity, contextUser: UserInfo): Promise<RoutineTargetOutcome> {
        await ActionEngineServer.Instance.Config(false, contextUser);
        const action = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, routine.TargetID));
        if (!action) {
            throw new Error(`Action ${routine.TargetID} not found for routine "${routine.Name}"`);
        }

        const actionResult = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: contextUser,
            Filters: [],
            Params: this.buildActionParams(routine),
        });

        const outputParams = (actionResult.Params ?? []).filter(p => p.Type === 'Output' || p.Type === 'Both');
        const content = outputParams.length > 0
            ? JSON.stringify(Object.fromEntries(outputParams.map(p => [p.Name, p.Value])))
            : (actionResult.Message ?? '');

        return {
            Success: actionResult.Success,
            ResultContent: content,
            ErrorMessage: actionResult.Success ? null : (actionResult.Message ?? 'Action failed'),
            AgentRunID: null,
            PromptRunID: null,
            ActionExecutionLogID: actionResult.LogEntry?.ID ?? null,
        };
    }

    /** Map the routine's StartingPayload JSON object to ActionParam inputs (key → param name). */
    private buildActionParams(routine: MJUserRoutineEntity): ActionParam[] {
        if (!routine.StartingPayload) {
            return [];
        }
        const parsed = SafeJSONParse<Record<string, unknown>>(routine.StartingPayload);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            this.logError(`Routine "${routine.Name}": StartingPayload for an Action target must be a JSON object of param values — ignoring`);
            return [];
        }
        return Object.entries(parsed).map(([name, value]) => ({ Name: name, Value: value, Type: 'Input' as const }));
    }

    // ========================================================================
    // Notification rendering + delivery
    // ========================================================================

    /**
     * Deliver notifications for a run to the routine's owner + recipients (Sequence order),
     * honoring per-recipient Channel and the routine's channel toggles. In-app goes through
     * the standard NotificationEngine (metadata-seeded 'User Routine' type) with a raw
     * `MJ: User Notifications` fallback; email is a structured TODO (see queueEmailDelivery).
     *
     * Best-effort: any delivery error is logged, never propagated into the run outcome.
     *
     * @returns true when at least one notification was actually delivered.
     */
    private async sendRoutineNotifications(
        routine: MJUserRoutineEntity,
        run: MJUserRoutineRunEntity,
        contextUser: UserInfo
    ): Promise<boolean> {
        try {
            const title = `Routine "${routine.Name}": ${run.Status === 'Success' ? 'completed' : 'failed'}`;
            const message = await this.renderNotificationMessage(routine, run, contextUser);
            const recipients = await this.loadRecipients(routine, contextUser);

            let anySent = false;
            const deliveredUserIds = new Set<string>();

            // Owner first, then recipients in Sequence order.
            if (routine.NotifyViaInApp) {
                if (await this.deliverInApp(routine.UserID, title, message, routine, run, contextUser)) {
                    anySent = true;
                }
                deliveredUserIds.add(NormalizeUUID(routine.UserID));
            }
            if (routine.NotifyViaEmail) {
                this.queueEmailDelivery(routine.UserID, null, title, message, routine);
            }

            for (const recipient of SortRecipientsBySequence(recipients)) {
                if (recipient.Channel === 'InApp') {
                    if (!routine.NotifyViaInApp) {
                        continue; // in-app channel disabled at the routine level
                    }
                    if (!recipient.UserID) {
                        this.logError(`Routine "${routine.Name}": InApp recipient ${recipient.ID} has no UserID — skipping`);
                        continue;
                    }
                    if (deliveredUserIds.has(NormalizeUUID(recipient.UserID))) {
                        continue; // already notified (e.g. the owner listed as a recipient)
                    }
                    if (await this.deliverInApp(recipient.UserID, title, message, routine, run, contextUser)) {
                        anySent = true;
                    }
                    deliveredUserIds.add(NormalizeUUID(recipient.UserID));
                } else if (recipient.Channel === 'Email') {
                    if (!routine.NotifyViaEmail) {
                        continue; // email channel disabled at the routine level
                    }
                    this.queueEmailDelivery(recipient.UserID, recipient.Email, title, message, routine);
                }
            }
            return anySent;
        } catch (error) {
            this.logError(`Notification delivery for routine "${routine.Name}" failed (non-fatal)`, error);
            return false;
        }
    }

    /** Load the routine's recipients (ordering applied in JS via SortRecipientsBySequence). */
    private async loadRecipients(routine: MJUserRoutineEntity, contextUser: UserInfo): Promise<MJUserRoutineRecipientEntity[]> {
        const rv = new RunView(); // global-provider-ok: server-global scheduled task
        const result = await rv.RunView<MJUserRoutineRecipientEntity>({
            EntityName: 'MJ: User Routine Recipients',
            ExtraFilter: `RoutineID='${routine.ID}'`,
            OrderBy: 'Sequence ASC',
            ResultType: 'entity_object',
        }, contextUser);
        if (!result.Success) {
            this.logError(`Failed to load recipients for routine "${routine.Name}": ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    /**
     * Render the notification body through the MJ template stack: the routine's own
     * NotificationTemplateID when set, else the metadata-seeded default template resolved
     * BY NAME. Falls back to a plain-text body when no template resolves or rendering fails.
     */
    private async renderNotificationMessage(
        routine: MJUserRoutineEntity,
        run: MJUserRoutineRunEntity,
        contextUser: UserInfo
    ): Promise<string> {
        const fallback = this.buildPlainTextMessage(routine, run);
        try {
            await TemplateEngineServer.Instance.Config(false, contextUser);
            const template = this.resolveNotificationTemplate(routine);
            if (!template) {
                return fallback;
            }
            const content = template.GetHighestPriorityContent();
            if (!content) {
                return fallback;
            }
            // BaseEntity getters are not spreadable — GetAll() yields plain objects for the renderer.
            const data = {
                routine: routine.GetAll(),
                run: run.GetAll(),
                resultSummary: run.ResultSummary ?? '',
                status: run.Status,
            };
            const rendered = await TemplateEngineServer.Instance.RenderTemplate(template, content, data, true);
            if (rendered.Success && rendered.Output) {
                return rendered.Output;
            }
            this.logError(`Template render failed for routine "${routine.Name}": ${rendered.Message ?? 'unknown'} — using plain-text fallback`);
            return fallback;
        } catch (error) {
            this.logError(`Template resolution failed for routine "${routine.Name}" — using plain-text fallback`, error);
            return fallback;
        }
    }

    /** Resolve the routine's template (by ID) or the seeded default (by name) from the template cache. */
    private resolveNotificationTemplate(routine: MJUserRoutineEntity): MJTemplateEntityExtended | undefined {
        if (routine.NotificationTemplateID) {
            const own = TemplateEngineServer.Instance.Templates.find(t => UUIDsEqual(t.ID, routine.NotificationTemplateID!));
            if (own) {
                return own;
            }
            this.logError(`Routine "${routine.Name}": NotificationTemplateID ${routine.NotificationTemplateID} not found in template cache — trying the default`);
        }
        return TemplateEngineServer.Instance.FindTemplate(DEFAULT_NOTIFICATION_TEMPLATE_NAME) ?? undefined;
    }

    /** Plain-text notification body used when no template is resolvable. */
    private buildPlainTextMessage(routine: MJUserRoutineEntity, run: MJUserRoutineRunEntity): string {
        const when = (run.CompletedAt ?? run.StartedAt).toISOString();
        const statusLine = run.Status === 'Success'
            ? `completed successfully at ${when}.`
            : `failed at ${when}.${run.ErrorMessage ? `\nError: ${run.ErrorMessage}` : ''}`;
        const summary = run.ResultSummary ? `\n\n${run.ResultSummary}` : '';
        return `Routine "${routine.Name}" ${statusLine}${summary}`;
    }

    /**
     * In-app delivery: the standard NotificationEngine path first (respects the seeded
     * 'User Routine' type + per-user preferences); when the engine cannot deliver (e.g. the
     * type is not seeded in this instance), fall back to a raw `MJ: User Notifications` row
     * — the same pattern used by TaskOrchestrator / shareNotification's default dispatch.
     *
     * @returns true when a notification record was actually created (a user who opted out
     *          via preferences yields false WITHOUT triggering the raw fallback).
     */
    private async deliverInApp(
        userId: string,
        title: string,
        message: string,
        routine: MJUserRoutineEntity,
        run: MJUserRoutineRunEntity,
        contextUser: UserInfo
    ): Promise<boolean> {
        const resourceConfiguration = { type: 'UserRoutine', routineId: routine.ID, runId: run.ID };
        try {
            await NotificationEngine.Instance.Config(false, contextUser);
            const result = await NotificationEngine.Instance.SendNotification({
                userId,
                typeNameOrId: NOTIFICATION_TYPE_NAME,
                title,
                message,
                resourceConfiguration,
            }, contextUser);
            if (result.success) {
                // success + no in-app channel means the user opted out — respect it, no fallback.
                return result.deliveryChannels.inApp;
            }
            this.log(`NotificationEngine could not deliver for routine "${routine.Name}" (${(result.errors ?? []).join('; ')}) — using raw fallback`, true);
        } catch (error) {
            this.log(`NotificationEngine unavailable (${error instanceof Error ? error.message : error}) — using raw fallback`, true);
        }
        return this.deliverInAppRaw(userId, title, message, resourceConfiguration, contextUser);
    }

    /** Raw `MJ: User Notifications` insert — the minimal, always-available in-app path. */
    private async deliverInAppRaw(
        userId: string,
        title: string,
        message: string,
        resourceConfiguration: Record<string, string>,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        try {
            const md = (provider ?? new Metadata()) as unknown as IMetadataProvider; // global-provider-ok: server-global scheduled task
            const notification = await md.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications', contextUser);
            notification.NewRecord();
            notification.UserID = userId;
            notification.Title = title;
            notification.Message = message;
            notification.Unread = true;
            notification.ResourceConfiguration = JSON.stringify(resourceConfiguration);
            const saved = await notification.Save();
            if (!saved) {
                this.logError(`Raw in-app notification save failed for user ${userId}: ${notification.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
            return saved;
        } catch (error) {
            this.logError(`Raw in-app notification save threw for user ${userId}`, error);
            return false;
        }
    }

    /**
     * TODO(email delivery): wire this through the Communication framework
     * (`@memberjunction/communication-engine` — see NotificationEngine.sendEmail for the
     * template + provider pattern). Email delivery needs a configured communication provider
     * plus recipient-address resolution (UserID → user email, or the recipient row's Email),
     * so it is deliberately left as a structured seam rather than half-implemented. In-app
     * delivery is fully functional; this method only logs the gap.
     */
    private queueEmailDelivery(
        userId: string | null,
        email: string | null,
        title: string,
        _message: string,
        routine: MJUserRoutineEntity
    ): void {
        this.log(
            `[TODO] Email delivery not yet implemented — routine "${routine.Name}" wanted an email ` +
            `notification ("${title}") for ${email ?? `user ${userId ?? 'unknown'}`}. ` +
            `Deliver in-app or implement queueEmailDelivery via the Communication framework.`
        );
    }
}
