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

import { RegisterClass, SafeJSONParse, UUIDsEqual, NormalizeUUID, EscapeSQLString } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJConversationEntity,
    MJEnvironmentEntityExtended,
    MJScheduledJobEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
    MJUserRoutineRecipientEntity,
    MJUserRoutineRunEntity,
    MJUserNotificationEntity,
    MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import {
    MJAIAgentEntityExtended,
    MJAIPromptEntityExtended,
    AIPromptParams,
    ConversationUtility,
    MentionContent,
    SpecialContentToken,
} from '@memberjunction/ai-core-plus';
import {
    AgentRunner,
    AgentWakeTriggerService,
    BuildPolicyPairKey,
    BuildUserAppWakeKey,
    CheckActivePoliciesForBatch,
    CheckActivePolicyForAgentAndUser,
    CoalescedWakeEventPayload,
    CoalescedWakeResumeState,
    DEFAULT_MAX_RETAINED_COALESCED_EVENTS,
    EventWakeCoalescer,
    NormalizeApplicationKey,
    PolicyPairLookupKey,
    ResolveWakeAgentConfigurationID,
    WakeStartupGuard,
} from '@memberjunction/ai-agents';
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
import { WakeGateEvaluator, WakeGateEvaluationResult } from '../WakeGateEvaluator';
import { UserRoutineScheduleIndex } from '../UserRoutineScheduleIndex';
import type { Observable } from 'rxjs';

interface GlobalUserCacheLookup {
    Users: UserInfo[];
    FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
}

export class RoutineOwnerResolutionError extends Error {
    public readonly Kind: 'permanent' | 'transient';
    public constructor(message: string, kind: 'permanent' | 'transient') {
        super(message);
        this.name = 'RoutineOwnerResolutionError';
        this.Kind = kind;
    }
}

/**
 * Optional configuration (stored in ScheduledJob.Configuration). All fields optional —
 * the dispatcher runs with sensible defaults when Configuration is empty.
 */
export interface UserRoutineDispatcherConfiguration extends ScheduledJobConfiguration {
    /** Maximum routines executed concurrently within one sweep. Default 3. */
    MaxConcurrentRoutines?: number;
}

/**
 * Attempts to re-attach a run's execution linkage after the first save was rejected.
 *
 * The linkage columns are foreign keys to rows written fire-and-forget by the action/agent/prompt
 * engines, so a rejection usually means "not inserted yet" rather than "does not exist". A few
 * short, escalating waits cover that window without putting the sweep on the DB's critical path.
 */
const RUN_LINKAGE_ATTEMPTS = 3;
const RUN_LINKAGE_RETRY_MS = 50;

/** Default bound on concurrent routine executions within a single dispatcher sweep. */
const DEFAULT_MAX_CONCURRENT_ROUTINES = 3;

/**
 * The run's status **as last persisted** — never the in-memory value.
 *
 * `BaseEntity.finalizeSave` runs only when the save returned a row, and it calls
 * `SetMany(data, …, replaceOldValues = true)`. So `OldValue` holds the value on disk: it advances
 * to 'Success'/'Failed' when the write lands, and stays 'Running' when it does not.
 *
 * The distinction is the whole point. `finalizeRunRow` assigns `Status = 'Success'` BEFORE its
 * first save, so after a rejected save the in-memory `Status` says 'Success' while the row still
 * says 'Running'. A caller that reads `run.Status` to decide "was an outcome already committed?"
 * gets 'Success' and leaves the row stuck at 'Running' forever — the exact defect this module's
 * tests were written to eliminate, reintroduced at the seam between the two layers that each fix
 * one half of it.
 *
 * Falls back to the in-memory value only when the field cannot be resolved, which cannot happen
 * for a real `MJUserRoutineRunEntity` (`Status` is a column); it keeps this total rather than
 * throwing inside an error handler.
 */
interface RoutineJsonObject {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | RoutineJsonObject
        | Array<string | number | boolean | null | RoutineJsonObject>;
}

type EntityMetadataAccessor = Pick<IMetadataProvider, 'GetEntityObject' | 'EntityByName'>;

function getEntityMetadataAccessor(provider?: IMetadataProvider): EntityMetadataAccessor {
    return provider ?? new Metadata(); // global-provider-ok: server-global scheduled task
}

function persistedRunStatus(run: MJUserRoutineRunEntity): MJUserRoutineRunEntity['Status'] {
    const persisted = run.GetFieldByName?.('Status')?.OldValue;
    // `OldValue` is untyped on EntityField, so this is the one narrowing boundary. The column is
    // CHECK-constrained to the same value list as the property, so a string read from it IS that
    // union — asserting anything wider here would just push the cast to every caller.
    return typeof persisted === 'string'
        ? (persisted as MJUserRoutineRunEntity['Status'])
        : run.Status;
}

/** Name of the metadata-seeded default notification template (resolved BY NAME, never hardcoded ID). */
const DEFAULT_NOTIFICATION_TEMPLATE_NAME = 'User Routine Notification - Default';

function isRecordMentionToken(token: SpecialContentToken): token is SpecialContentToken & { content: MentionContent } {
    return token.mode === 'mention' && 'type' in token.content && token.content.type === 'record';
}

/**
 * Visible label for a `record` mention token, matching `ConversationUtility`'s fallback rules.
 */
export function ResolveRecordLinkLabel(content: MentionContent): string {
    const explicitName = (content.name ?? '').trim();
    return explicitName || content.entityName || 'record';
}

function endsWithRecordTitle(prefix: string, label: string): boolean {
    if (!label) {
        return false;
    }
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trailingTitlePattern = new RegExp(`(?:^|[\\s(\\[\\"'*_\`>:])${escapedLabel}[*_\`"'\\]]*[ \\t]*$`, 'i');
    return trailingTitlePattern.test(prefix);
}

/**
 * Converts `@{"_mode":...}` tokens in a routine result summary into clean plain text via
 * `ConversationUtility.ToPlainText`, omitting duplicate `record` mention pills that
 * immediately follow the same record title (e.g. `Northwind @{...}` -> `Northwind` rather
 * than `Northwind Northwind`).
 */
export function FormatRoutinePlainResultSummary(
    summary: string,
    recordLinkLabel: (content: MentionContent) => string = ResolveRecordLinkLabel
): string {
    if (!summary) {
        return '';
    }
    const tokens = ConversationUtility.ParseSpecialContent(summary);
    if (tokens.length === 0) {
        return ConversationUtility.ToPlainText(summary);
    }

    let deduplicated = '';
    let cursor = 0;
    for (const token of tokens) {
        deduplicated += summary.slice(cursor, token.startIndex);
        cursor = token.endIndex;

        if (isRecordMentionToken(token)) {
            const label = recordLinkLabel(token.content);
            if (endsWithRecordTitle(deduplicated, label)) {
                const nextChar = summary[token.endIndex] ?? '';
                if (nextChar === '' || /^[\s.,;:!?)\]}'"]/.test(nextChar)) {
                    deduplicated = deduplicated.replace(/[ \t]+$/, '');
                }
                continue;
            }
        }
        deduplicated += token.originalText;
    }
    deduplicated += summary.slice(cursor);

    return ConversationUtility.ToPlainText(deduplicated);
}

/** Name of the metadata-seeded `MJ: User Notification Types` row used for in-app delivery. */
const NOTIFICATION_TYPE_NAME = 'User Routine';

/** Name of the Explorer application that scopes (hides) routine conversations. */
const ROUTINES_APPLICATION_NAME = 'Routines';

/** Cap on the persisted ResultSummary length — keeps run rows compact; full detail lives on the linked run/log records. */
const RESULT_SUMMARY_MAX_LENGTH = 4000;

/** Normalized outcome of executing a routine's target, independent of target type. */
interface RoutineTargetOutcome {
    Success: boolean;
    /** Raw result content — hashed for OnChange detection, and the ResultSummary when there is no {@link Summary}. */
    ResultContent: string;
    /**
     * Human-readable result, preferred over ResultContent for the run's ResultSummary (and so the
     * notification body). For an Agent target it is the agent's final message: the payload is
     * often just the wake state the agent was handed.
     */
    Summary?: string | null;
    ErrorMessage: string | null;
    AgentRunID: string | null;
    PromptRunID: string | null;
    ActionExecutionLogID: string | null;
}

/** Per-routine bookkeeping returned from an isolated routine execution. */
export interface RoutineExecutionSummary {
    RoutineID: string;
    RunStatus: MJUserRoutineRunEntity['Status'];
    Notified: boolean;
}

/**
 * What one routine's execution needs from its caller. The sweep passes its full
 * {@link ScheduledJobExecutionContext}; a manual run ({@link UserRoutineDispatcherDriver.RunRoutineNow})
 * passes only these.
 */
export interface RoutineRunContext {
    /** The bookkeeping user: run rows and routine roll-up are saved as this user (the scheduler's system user). */
    ContextUser: UserInfo;
    heartbeat?: ScheduledJobExecutionContext['heartbeat'];
    /** True for a run the user asked for by hand: the wake gate is not consulted. */
    BypassWakeGate?: boolean;
    /** Pre-claim NextRunAt captured during a sweep so transient slot-entry errors can restore the claim. */
    ClaimedPreviousNextRunAt?: Date | null;
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
     * Maximum consecutive sweep failures resolving a routine's owner user before the
     * routine is disabled (`Status = 'Disabled'`, `LastRunStatus = 'Failed'`) so a
     * deleted or permanently inactive owner does not retry on every 1-minute sweep forever.
     */
    public static readonly MAX_OWNER_RESOLVE_RETRIES = 3;

    private static readonly _ownerResolveFailures = new Map<string, number>();

    public static ClearOwnerResolveFailures(): void {
        UserRoutineDispatcherDriver._ownerResolveFailures.clear();
    }

    /**
     * The dispatcher is a by-design 1-minute sweeper: each pass claims due routines and
     * does bounded work, so the engine's high-frequency cron warning doesn't apply.
     */
    public override get IsHighFrequencyByDesign(): boolean {
        return true;
    }

    /**
     * Work gate (#6217): the dispatcher has work only when a routine is due or needs seeding, so
     * the engine runs it (and wakes the database for it) only then. Answered from the in-memory
     * {@link UserRoutineScheduleIndex}; until that is loaded the dispatcher keeps its cron.
     */
    public override NextWorkDueAt(_job: MJScheduledJobEntity, now: Date): Date | null | undefined {
        const index = UserRoutineScheduleIndex.Instance;
        return index.IsLoaded ? index.NextDueAt(now) : undefined;
    }

    public override async PrepareWorkGate(contextUser: UserInfo, provider: IMetadataProvider, maxAgeMs: number): Promise<void> {
        await UserRoutineScheduleIndex.Instance.EnsureFresh(contextUser, provider, maxAgeMs);
    }

    public override get WorkGateChanged$(): Observable<void> | null {
        return UserRoutineScheduleIndex.Instance.Changed$;
    }

    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        if (WakeStartupGuard.Instance.IsStartupInProgress()) {
            this.log(
                'UserRoutineDispatcher sweep suppressed while WakeStartupGuard is active during AIDP deployment/startup initialization.',
                true
            );
            return {
                Success: true,
                Details: {
                    RoutinesEvaluated: 0,
                    RoutinesSeeded: 0,
                    RoutinesRun: 0,
                    Succeeded: 0,
                    Failed: 0,
                    Notified: 0,
                    StartupSuppressed: true,
                },
            };
        }

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

        // Batch-check active coordination policies (ResultType: 'simple', bypassCache: true)
        // before claiming or executing any Agent / AgentWake routine so deactivated or missing
        // policies yield zero agent runs without N+1 entity loads.
        const rawDue = candidates.filter(r => IsRoutineDue(r, now));
        const due = await this.coalesceDuplicatePendingBuckets(rawDue);
        const policyPairs: PolicyPairLookupKey[] = due
            .filter((r) => this.requiresAgentCoordinationPolicy(r) && Boolean(r.TargetID) && Boolean(r.UserID))
            .map((r) => ({ AgentID: r.TargetID!, UserID: r.UserID! }));
        const policyEvaluations = await CheckActivePoliciesForBatch(
            policyPairs,
            context.ContextUser,
            { bypassCache: true }
        );

        // Resolve each due routine's owner user BEFORE claiming NextRunAt so a transient UserCache
        // miss never burns a OneShot routine's NextRunAt=null without executing it. Cap consecutive
        // failures at MAX_OWNER_RESOLVE_RETRIES so a permanently missing/inactive owner does not
        // retry on every sweep forever.
        const claimed: Array<{ routine: MJUserRoutineEntity; ownerUser: UserInfo; previousNextRunAt: Date | null }> = [];
        for (const routine of due) {
            const routineKey = NormalizeUUID(routine.ID);
            let ownerUser: UserInfo;
            try {
                ownerUser = await this.resolveRoutineOwnerUser(routine, context.ContextUser);
                UserRoutineDispatcherDriver._ownerResolveFailures.delete(routineKey);
            } catch (error) {
                const isPermanent =
                    error instanceof RoutineOwnerResolutionError && error.Kind === 'permanent';
                if (!isPermanent) {
                    this.logError(
                        `Skipping claim for routine "${routine.Name}" (${routine.ID}) due to transient owner lookup failure — backing off and preserving NextRunAt for retry`,
                        error
                    );
                    continue;
                }
                const failures = (UserRoutineDispatcherDriver._ownerResolveFailures.get(routineKey) ?? 0) + 1;
                UserRoutineDispatcherDriver._ownerResolveFailures.set(routineKey, failures);
                if (failures >= UserRoutineDispatcherDriver.MAX_OWNER_RESOLVE_RETRIES) {
                    UserRoutineDispatcherDriver._ownerResolveFailures.delete(routineKey);
                    this.logError(
                        `Disabling routine "${routine.Name}" (${routine.ID}) because owner user is missing or inactive after ${failures} consecutive attempts`,
                        error
                    );
                    routine.Status = 'Disabled';
                    routine.LastRunStatus = 'Failed';
                    await this.claimRoutine(routine, now);
                } else {
                    this.logError(
                        `Skipping claim for routine "${routine.Name}" (${routine.ID}) because owner user could not be resolved (attempt ${failures}/${UserRoutineDispatcherDriver.MAX_OWNER_RESOLVE_RETRIES}) — NextRunAt preserved for retry`,
                        error
                    );
                }
                continue;
            }

            if (this.requiresAgentCoordinationPolicy(routine)) {
                if (!routine.TargetID || !routine.UserID) {
                    this.log(
                        `Skipping wake for routine "${routine.Name}" (${routine.ID}): TargetID or UserID missing for policy verification.`,
                        true
                    );
                    continue;
                }
                const policyEval = policyEvaluations.get(BuildPolicyPairKey(routine.TargetID, routine.UserID));
                if (!policyEval?.Allowed) {
                    this.log(
                        `Skipping wake for routine "${routine.Name}" (${routine.ID}): ${policyEval?.Reason ?? 'Active coordination policy required.'}`,
                        true
                    );
                    continue;
                }
            }

            const previousNextRunAt = routine.NextRunAt ? new Date(routine.NextRunAt.getTime()) : null;
            if (await this.claimRoutine(routine, now)) {
                claimed.push({ routine, ownerUser, previousNextRunAt });
            }
        }

        const summaries = await RunWithBoundedConcurrency(claimed, maxConcurrent, async ({ routine, ownerUser, previousNextRunAt }) => {
            // Per-routine error isolation: one routine failing must never kill the sweep.
            try {
                return await this.executeRoutine(
                    routine,
                    { ...context, ClaimedPreviousNextRunAt: previousNextRunAt },
                    ownerUser
                );
            } catch (error) {
                this.logError(`Routine "${routine.Name}" (${routine.ID}) failed outside run tracking`, error);
                return { RoutineID: routine.ID, RunStatus: 'Failed', Notified: false } satisfies RoutineExecutionSummary;
            }
        });

        const routinesRun = summaries.filter(s => s.RunStatus !== 'Skipped').length;
        const succeeded = summaries.filter(s => s.RunStatus === 'Success').length;
        const failed = summaries.filter(s => s.RunStatus === 'Failed').length;
        const notified = summaries.filter(s => s.Notified).length;

        return {
            Success: true, // the SWEEP succeeded; individual routine failures are recorded on their run rows
            Details: {
                RoutinesEvaluated: candidates.length,
                RoutinesSeeded: seedable.length,
                RoutinesRun: routinesRun,
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
            // Due-ness is live state and must come from the database. The per-tick timestamp in
            // the filter would also mint a new, never-read cache key on every tick.
            BypassCache: true,
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load due routines: ${result.ErrorMessage}`);
        }
        return result.Results ?? [];
    }

    private readonly wakeGateEvaluator = new WakeGateEvaluator();

    /** Compute + persist NextRunAt for a never-scheduled routine WITHOUT running it. */
    private async seedNextRunAt(routine: MJUserRoutineEntity, now: Date): Promise<void> {
        try {
            routine.NextRunAt = ComputeRoutineNextRunAt(
                routine.CronExpression,
                routine.Timezone,
                now,
                routine.StartAt,
                routine.ScheduleMode ?? 'Recurring'
            );
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
            const scheduleMode = routine.ScheduleMode ?? 'Recurring';
            if (scheduleMode === 'OneShot' && (!routine.CronExpression || routine.CronExpression.trim().length === 0)) {
                routine.NextRunAt = null;
            } else {
                routine.NextRunAt = ComputeRoutineNextRunAt(
                    routine.CronExpression,
                    routine.Timezone,
                    now,
                    routine.StartAt,
                    scheduleMode
                );
            }
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

    /**
     * Resolve the routine owner's `UserInfo` from `UserCache` so target execution runs under
     * the routine owner's RBAC/RLS/FLS identity rather than the scheduler's system user.
     * Always fails closed when the owner ID is missing, `UserCache` is unavailable or empty,
     * or the owning user is missing or inactive.
     */
    protected async resolveRoutineOwnerUser(
        routine: MJUserRoutineEntity,
        fallbackContextUser: UserInfo
    ): Promise<UserInfo> {
        const ownerUserId = routine.UserID?.trim();
        if (!ownerUserId) {
            throw new RoutineOwnerResolutionError(
                `Routine "${routine.Name}" has no UserID — refusing to execute without a resolved owner.`,
                'permanent'
            );
        }
        if (fallbackContextUser?.ID && UUIDsEqual(ownerUserId, fallbackContextUser.ID)) {
            if (fallbackContextUser.IsActive === false) {
                throw new RoutineOwnerResolutionError(
                    `Routine "${routine.Name}" owner (${ownerUserId}) is inactive — refusing to execute.`,
                    'permanent'
                );
            }
            return fallbackContextUser;
        }
        const userCache = (globalThis as { ___SINGLETON__UserCache?: GlobalUserCacheLookup }).___SINGLETON__UserCache;
        if (!userCache || typeof userCache.FindUser !== 'function') {
            throw new RoutineOwnerResolutionError(
                `Routine "${routine.Name}" owner (${ownerUserId}) cannot be resolved because UserCache is unavailable — refusing to execute.`,
                'transient'
            );
        }
        let found: UserInfo | undefined;
        try {
            found = await userCache.FindUser({ ID: ownerUserId });
        } catch (err) {
            throw new RoutineOwnerResolutionError(
                `Routine "${routine.Name}" owner (${ownerUserId}) lookup failed transiently: ${err instanceof Error ? err.message : String(err)}`,
                'transient'
            );
        }
        if (!found) {
            const cachePopulated = Array.isArray(userCache.Users) && userCache.Users.length > 0;
            if (!cachePopulated) {
                throw new RoutineOwnerResolutionError(
                    `Routine "${routine.Name}" owner (${ownerUserId}) not found in UserCache — refusing to execute.`,
                    'transient'
                );
            }
            // UserCache.FindUser catches and swallows DB errors during its refresh query, returning undefined.
            // Probe MJ: Users via RunView so a transient DB error is distinguished from a deleted owner row.
            let verifyKind: 'permanent' | 'transient' = 'transient';
            try {
                const rv = new RunView();
                const verifyRes = await rv.RunView<{ ID: string; IsActive?: boolean }>(
                    {
                        EntityName: 'MJ: Users',
                        ExtraFilter: `ID = '${EscapeSQLString(ownerUserId)}'`,
                        Fields: ['ID', 'IsActive'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple',
                    },
                    fallbackContextUser
                );
                if (verifyRes?.Success) {
                    const row = verifyRes.Results?.[0];
                    if (!row || row.IsActive === false) {
                        verifyKind = 'permanent';
                    }
                }
            } catch (probeErr) {
                LogError(
                    `UserRoutineDispatcherDriver: MJ: Users probe failed for routine "${routine.Name}" (${ownerUserId}): ${
                        probeErr instanceof Error ? probeErr.message : String(probeErr)
                    }`
                );
                verifyKind = 'transient';
            }
            throw new RoutineOwnerResolutionError(
                `Routine "${routine.Name}" owner (${ownerUserId}) not found in UserCache — refusing to execute.`,
                verifyKind
            );
        }
        if (found.IsActive === false) {
            throw new RoutineOwnerResolutionError(
                `Routine "${routine.Name}" owner (${ownerUserId}) is inactive — refusing to execute.`,
                'permanent'
            );
        }
        return found;
    }

    // ========================================================================
    // Manual run
    // ========================================================================

    /**
     * Run one routine now, on request, without touching its schedule.
     *
     * The sweep claims a routine before running it, which advances `NextRunAt` or, for a one-shot,
     * clears it, and a cleared one-shot is Disabled after the run. A "Wake Now" implemented as
     * "set NextRunAt to now" therefore SPENDS a one-shot: the reminder wanted tomorrow fires today
     * and never fires again. This path skips the claim, so after the run `NextRunAt` still holds
     * the scheduled time and the roll-up leaves the routine Active. It also skips the wake gate:
     * the person asked for the run, so "nothing changed since last time" is not a reason to skip.
     *
     * `contextUser` is the bookkeeping identity (run row, routine roll-up), normally the scheduler's
     * system user; the target still executes as the routine's owner, exactly as on the sweep.
     * Ownership of the routine is the caller's check (see the `Run User Routine Now` action).
     */
    public async RunRoutineNow(routine: MJUserRoutineEntity, contextUser: UserInfo): Promise<RoutineExecutionSummary> {
        return this.executeRoutine(routine, { ContextUser: contextUser, BypassWakeGate: true });
    }

    // ========================================================================
    // Per-routine execution
    // ========================================================================

    /**
     * Execute one claimed routine end-to-end: wake gate → run row → target execution → run/routine
     * bookkeeping → notification decision + delivery. Never throws for target failures —
     * those are recorded on the run row; only run-row creation failures propagate.
     *
     * **Once the run row exists, this drives it to a TERMINAL status on every path.** The inner
     * guard around `executeTarget` only ever covered target failures, so a throw from the
     * bookkeeping that follows it — `finalizeRunRow`, `updateRoutineAfterRun`, notification
     * delivery — escaped to the sweep's per-routine catch, which records `Failed` in its in-memory
     * summary and returns. The row on disk stays `Running` forever: nothing reconciles it, the
     * sweep reports success, and the routine looks like it is still executing long after the
     * process that owned it exited. A run row that outlives its executor has to say so.
     */
    private requiresAgentCoordinationPolicy(routine: MJUserRoutineEntity): boolean {
        return routine.RoutineType === 'AgentWake' || routine.TargetType === 'Agent';
    }

    private isUnscheduledOneShot(routine: MJUserRoutineEntity): boolean {
        return (
            routine.ScheduleMode === 'OneShot' &&
            routine.NextRunAt == null &&
            (!routine.CronExpression || routine.CronExpression.trim().length === 0)
        );
    }

    private parseRoutineWakeConfig(routine: MJUserRoutineEntity): Partial<MJUserRoutineEntity_IRoutineWakeConfiguration> {
        if (routine.WakeConfigurationObject && typeof routine.WakeConfigurationObject === 'object') {
            return routine.WakeConfigurationObject;
        }
        if (typeof routine.WakeConfiguration === 'string' && routine.WakeConfiguration.trim().length > 0) {
            return SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(routine.WakeConfiguration) ?? {};
        }
        return {};
    }

    private extractRoutineApplicationID(routine: MJUserRoutineEntity): string | null {
        const parsedConfig = this.parseRoutineWakeConfig(routine);
        const resumeState = parsedConfig.resumeState as CoalescedWakeResumeState | undefined;
        const appID = resumeState?.applicationID;
        return typeof appID === 'string' && appID.trim().length > 0 ? appID.trim() : null;
    }

    private buildRoutineWakeBucketKey(routine: MJUserRoutineEntity): string | null {
        if (routine.RoutineType !== 'AgentWake' || !routine.UserID || !routine.TargetID) {
            return null;
        }
        const appID = this.extractRoutineApplicationID(routine);
        if (appID) {
            return `${NormalizeUUID(routine.UserID)}::${NormalizeUUID(routine.TargetID)}::app:${NormalizeApplicationKey(appID)}`;
        }
        const cfg = this.parseRoutineWakeConfig(routine);
        const ws = typeof cfg.workstreamKey === 'string' ? cfg.workstreamKey.trim().toLowerCase() : '';
        if (ws.length > 0) {
            return `${NormalizeUUID(routine.UserID)}::${NormalizeUUID(routine.TargetID)}::ws:${ws}`;
        }
        return null;
    }

    private readPendingEventsFromRoutine(routine: MJUserRoutineEntity): CoalescedWakeEventPayload[] {
        const cfg = this.parseRoutineWakeConfig(routine);
        const resumeState = cfg.resumeState as CoalescedWakeResumeState | undefined;
        if (!resumeState) {
            return [];
        }
        if (Array.isArray(resumeState.pendingEvents)) {
            return resumeState.pendingEvents.filter((e): e is CoalescedWakeEventPayload => typeof e === 'object' && e !== null);
        }
        return typeof resumeState.triggerType === 'string' ? [resumeState] : [];
    }

    private compareBucketRoutines(a: MJUserRoutineEntity, b: MJUserRoutineEntity): number {
        const aCreated = a.__mj_CreatedAt instanceof Date ? a.__mj_CreatedAt.getTime() : Number.MAX_SAFE_INTEGER;
        const bCreated = b.__mj_CreatedAt instanceof Date ? b.__mj_CreatedAt.getTime() : Number.MAX_SAFE_INTEGER;
        if (aCreated !== bCreated) {
            return aCreated - bCreated;
        }
        return a.ID.toLowerCase().localeCompare(b.ID.toLowerCase());
    }

    /**
     * Converges any duplicate pending `AgentWake` routines that share the same `(UserID, TargetID, ApplicationID)`
     * or `(UserID, TargetID, WorkstreamKey)` bucket (e.g., created concurrently by independent server instances)
     * into the earliest/lowest-ID canonical routine so only one wake executes with all pending events preserved.
     */
    private async coalesceDuplicatePendingBuckets(due: MJUserRoutineEntity[]): Promise<MJUserRoutineEntity[]> {
        const groups = new Map<string, MJUserRoutineEntity[]>();
        const ungrouped: MJUserRoutineEntity[] = [];

        for (const routine of due) {
            const bucketKey = this.buildRoutineWakeBucketKey(routine);
            if (!bucketKey) {
                ungrouped.push(routine);
                continue;
            }
            const existing = groups.get(bucketKey) ?? [];
            existing.push(routine);
            groups.set(bucketKey, existing);
        }

        const result: MJUserRoutineEntity[] = [...ungrouped];
        for (const bucketRoutines of groups.values()) {
            if (bucketRoutines.length <= 1) {
                result.push(...bucketRoutines);
                continue;
            }
            const sorted = [...bucketRoutines].sort((a, b) => this.compareBucketRoutines(a, b));
            const canonical = sorted[0];
            const duplicates = sorted.slice(1);
            const canonicalSaved = await this.mergeBucketRoutinesIntoCanonical(canonical, duplicates);
            if (!canonicalSaved) {
                result.push(...sorted);
                continue;
            }
            await this.deactivateSupersededBucketRoutines(duplicates, canonical.ID);
            result.push(canonical);
        }

        return result;
    }

    private async mergeBucketRoutinesIntoCanonical(
        canonical: MJUserRoutineEntity,
        duplicates: MJUserRoutineEntity[]
    ): Promise<boolean> {
        const canonicalAppID = this.extractRoutineApplicationID(canonical);
        const coalesceKey = BuildUserAppWakeKey(canonical.UserID, canonicalAppID);
        const canonicalConfig = this.parseRoutineWakeConfig(canonical);
        const canonicalResume = (canonicalConfig.resumeState as CoalescedWakeResumeState | undefined) ?? {};
        const workstreamKey = canonicalConfig.workstreamKey ?? 'default';

        let mergedEvents = this.readPendingEventsFromRoutine(canonical) as CoalescedWakeResumeState[];
        let totalCount = typeof canonicalResume.coalescedEventCount === 'number'
            ? canonicalResume.coalescedEventCount
            : mergedEvents.length;
        let overflowCount = typeof canonicalResume.overflowEventCount === 'number'
            ? canonicalResume.overflowEventCount
            : 0;
        let summaryText = typeof canonicalResume.coalescedSummary === 'string'
            ? canonicalResume.coalescedSummary
            : null;
        let maxRevision = typeof canonicalResume.coalesceRevision === 'number'
            ? canonicalResume.coalesceRevision
            : 0;

        for (const dup of duplicates) {
            const dupResume = (this.parseRoutineWakeConfig(dup).resumeState as CoalescedWakeResumeState | undefined) ?? {};
            if (typeof dupResume.coalesceRevision === 'number') {
                maxRevision = Math.max(maxRevision, dupResume.coalesceRevision);
            }
            const dupEvents = this.readPendingEventsFromRoutine(dup) as CoalescedWakeResumeState[];
            const dupTotal = typeof dupResume.coalescedEventCount === 'number'
                ? dupResume.coalescedEventCount
                : dupEvents.length;
            const dupOverflow = Math.max(0, dupTotal - dupEvents.length);
            overflowCount += dupOverflow;
            totalCount += dupOverflow;

            for (const dupEvent of dupEvents) {
                const merged = EventWakeCoalescer.Instance.MergeCoalescedEvents({
                    PriorEvents: mergedEvents,
                    NewEvent: dupEvent,
                    CoalesceKey: coalesceKey,
                    ApplicationID: NormalizeApplicationKey(canonicalAppID),
                    MaxRetainedEvents: DEFAULT_MAX_RETAINED_COALESCED_EVENTS,
                    ExistingCoalescedCount: totalCount,
                    ExistingOverflowCount: overflowCount,
                });
                mergedEvents = merged.PendingEvents;
                totalCount = merged.TotalCoalescedCount;
                overflowCount = merged.OverflowCount;
                if (merged.SummaryText) {
                    summaryText = merged.SummaryText;
                }
            }
        }

        const updatedResumeState: CoalescedWakeResumeState = {
            ...canonicalResume,
            coalesceKey,
            coalescedEventCount: totalCount,
            overflowEventCount: overflowCount,
            coalesceRevision: maxRevision + 1,
            batchConsumed: false,
            ...(summaryText ? { coalescedSummary: summaryText } : {}),
            pendingEvents: mergedEvents,
        };
        const updatedWakeReason =
            summaryText ?? canonicalConfig.wakeReason ?? `Coalesced ${totalCount} events for ${workstreamKey}`;
        canonical.WakeConfigurationObject = {
            ...canonicalConfig,
            workstreamKey,
            wakeReason: updatedWakeReason,
            resumeState: updatedResumeState,
        };
        canonical.StartingPayload = JSON.stringify({
            workstreamKey,
            wakeReason: updatedWakeReason,
            resumeState: updatedResumeState,
        });
        canonical.InitialMessage = `[AgentWake:${workstreamKey}] Resume workstream "${workstreamKey}": ${updatedWakeReason}`;
        canonical.Description = updatedWakeReason;

        const canonicalSaved = typeof canonical.Save === 'function' ? await canonical.Save() : true;
        if (!canonicalSaved) {
            this.logError(`Failed to persist coalesced canonical wake routine "${canonical.Name}" (${canonical.ID}); skipping duplicate suppression to preserve events`);
        }
        return canonicalSaved;
    }

    private async deactivateSupersededBucketRoutines(
        duplicates: MJUserRoutineEntity[],
        canonicalID: string
    ): Promise<void> {
        for (const dup of duplicates) {
            const dupConfig = this.parseRoutineWakeConfig(dup);
            const dupResume = (dupConfig.resumeState as CoalescedWakeResumeState | undefined) ?? {};
            dup.Status = 'Disabled';
            dup.NextRunAt = null;
            dup.WakeConfigurationObject = {
                ...dupConfig,
                resumeState: {
                    ...dupResume,
                    batchConsumed: true,
                    coalescedIntoRoutineID: canonicalID,
                    coalescedEventCount: 0,
                    overflowEventCount: 0,
                    pendingEvents: [],
                },
            };
            if (typeof dup.Save === 'function') {
                await dup.Save();
            }
        }
    }

    private async handleSlotPolicyBlocked(
        routine: MJUserRoutineEntity,
        context: RoutineRunContext,
        lookupStatus: 'found' | 'not_found' | 'error',
        reason: string
    ): Promise<RoutineExecutionSummary> {
        const wasClaimedInSweep = context.ClaimedPreviousNextRunAt !== undefined;
        if (lookupStatus === 'error') {
            if (wasClaimedInSweep) {
                routine.NextRunAt = context.ClaimedPreviousNextRunAt ?? new Date();
                routine.Status = 'Active';
                if (typeof routine.Save === 'function') {
                    const restored = await routine.Save();
                    if (!restored) {
                        this.logError(
                            `Failed to restore NextRunAt claim for routine "${routine.Name}" (${routine.ID}) after transient policy lookup failure: ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`
                        );
                    }
                }
            }
            this.log(
                `Routine "${routine.Name}" (${routine.ID}) deferred on transient policy lookup error (claim restored): ${reason}`,
                true
            );
            return { RoutineID: routine.ID, RunStatus: 'Skipped', Notified: false };
        }

        if (wasClaimedInSweep && this.isUnscheduledOneShot(routine)) {
            routine.Status = 'Disabled';
            routine.LastRunStatus = 'Skipped';
            routine.LastCheckedAt = new Date();
            if (typeof routine.Save === 'function') {
                const deactivated = await routine.Save();
                if (!deactivated) {
                    this.logError(
                        `Failed to disable one-shot routine "${routine.Name}" (${routine.ID}) after policy deactivation: ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`
                    );
                }
            }
        }
        this.log(`Routine "${routine.Name}" (${routine.ID}) blocked by active policy gate: ${reason}`, true);
        return { RoutineID: routine.ID, RunStatus: 'Skipped', Notified: false };
    }

    private async executeRoutine(
        routine: MJUserRoutineEntity,
        context: RoutineRunContext,
        preResolvedOwnerUser?: UserInfo
    ): Promise<RoutineExecutionSummary> {
        const contextUser = context.ContextUser;
        // Always revalidate live active policy right when this execution slot starts (even if
        // sweep-level batch verification passed earlier), so a policy paused/disabled while the
        // routine waited in the concurrency queue yields zero runs.
        if (this.requiresAgentCoordinationPolicy(routine)) {
            if (!routine.TargetID || !routine.UserID) {
                return this.handleSlotPolicyBlocked(
                    routine,
                    context,
                    'not_found',
                    'TargetID or UserID missing for policy gate.'
                );
            }
            const policyEval = await CheckActivePolicyForAgentAndUser(
                routine.TargetID,
                routine.UserID,
                contextUser,
                { bypassCache: true }
            );
            if (!policyEval.Allowed) {
                return this.handleSlotPolicyBlocked(
                    routine,
                    context,
                    policyEval.LookupStatus,
                    policyEval.Reason
                );
            }
        }

        const ownerUser = preResolvedOwnerUser ?? (await this.resolveRoutineOwnerUser(routine, contextUser));

        let gateResult: WakeGateEvaluationResult | undefined;
        if (!context.BypassWakeGate && (routine.WakeConfiguration || routine.WakeConfigurationObject)) {
            gateResult = await this.wakeGateEvaluator.Evaluate(routine, ownerUser, new Date());
            routine.LastCheckedAt = new Date();
            if (!gateResult.shouldWake) {
                this.log(`Routine "${routine.Name}" skipped by ${gateResult.decidedByTier} wake gate: ${gateResult.reason}`, true);
                if (typeof routine.Save === 'function') {
                    await routine.Save();
                }
                return { RoutineID: routine.ID, RunStatus: 'Skipped', Notified: false };
            }
        }

        if (routine.RoutineType === 'AgentWake') {
            EventWakeCoalescer.Instance.RecordWakeDispatched(
                routine.UserID,
                this.extractRoutineApplicationID(routine),
                new Date()
            );
        }

        const run = await this.createRunRow(routine, contextUser);
        this.log(`Running routine "${routine.Name}" (${routine.TargetType} target)`, true);

        try {
            return await this.runAndRecord(routine, run, context, ownerUser, gateResult);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logError(`Routine "${routine.Name}" (${routine.ID}) failed after its run row was created`, error);

            // ONLY drive a row that is still non-terminal. Everything after `finalizeRunRow` runs
            // inside this scope — `updateRoutineAfterRun`, the notification save — so a throw from
            // there arrives with `Status` already committed as `Success` alongside its
            // ResultSummary and ResultHash, and `MJUserRoutine.LastRunStatus` possibly already
            // agreeing. Overwriting it with `Failed` would rewrite a run that genuinely succeeded
            // and put the run and its routine into disagreement — inventing the very status/disk
            // mismatch this catch was added to eliminate.
            //
            // ASK THE ROW, NOT THE OBJECT. This must read the PERSISTED status, because the other
            // way into this catch is `finalizeRunRow` itself throwing — and it throws having
            // already set `Status = 'Success'` in memory on an object whose saves all failed.
            // Reading `run.Status` there would report a committed success for a row that is still
            // 'Running' on disk, which is precisely the bug the throw exists to signal.
            const committed = persistedRunStatus(run);
            if (committed !== 'Running') {
                this.logError(
                    `Run ${run.ID} already recorded '${committed}'; leaving it as-is. The failure above ` +
                    `happened in the bookkeeping AFTER the outcome was committed.`
                );
                return { RoutineID: routine.ID, RunStatus: committed, Notified: false };
            }

            run.Status = 'Failed';
            run.ErrorMessage = `Run bookkeeping failed: ${message}`;
            run.CompletedAt = new Date();
            if (!(await run.Save())) {
                this.logError(
                    `Run ${run.ID} is STUCK at Running — the failure could not be recorded: ` +
                    `${run.LatestResult?.CompleteMessage ?? 'unknown'}`
                );
            }
            return { RoutineID: routine.ID, RunStatus: 'Failed', Notified: false };
        }
    }

    /** The body of {@link executeRoutine}, from target execution through notification delivery. */
    private async runAndRecord(
        routine: MJUserRoutineEntity,
        run: MJUserRoutineRunEntity,
        context: RoutineRunContext,
        ownerUser?: UserInfo,
        gateResult?: WakeGateEvaluationResult
    ): Promise<RoutineExecutionSummary> {
        const contextUser = context.ContextUser;
        const targetExecutionUser = ownerUser ?? contextUser;

        let outcome: RoutineTargetOutcome;
        try {
            outcome = await this.executeTarget(routine, targetExecutionUser, context.heartbeat, gateResult);
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
        const md = getEntityMetadataAccessor(provider);
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
        if (await run.Save()) {
            return;
        }

        // The run's own status must not be hostage to an OPTIONAL linkage. The three ID columns
        // above are foreign keys to artifacts of the execution — the action log, the agent run, the
        // prompt run — and any of them can fail to resolve (a log row cleaned up by an unrelated
        // process, a cross-session write not yet visible). When that FK is what rejected the save,
        // the previous behaviour logged and carried on: `Status` stayed 'Success' IN MEMORY, the
        // caller reported success from that in-memory value, and the row on disk stayed 'Running'
        // forever with nothing to reconcile it. Losing a link is a diagnostic loss; losing the
        // status is a correctness one — so drop the links and record the outcome.
        const firstFailure = run.LatestResult?.CompleteMessage ?? 'unknown';

        // The usual cause is a RACE, not a bad ID. Action-execution logging is fire-and-forget:
        // `ActionEngine` client-generates the log row's PK and returns it immediately, then INSERTs
        // it off the critical path. So `outcome.ActionExecutionLogID` is a valid identifier for a
        // row that may not exist YET — and writing it into a foreign key can lose that race, which
        // is why this only shows up under load. Land the STATUS first (the correctness-bearing
        // part), then re-attach the linkage once the INSERT has had a chance to land.
        const linkage = {
            AgentRunID: run.AgentRunID,
            PromptRunID: run.PromptRunID,
            ActionExecutionLogID: run.ActionExecutionLogID,
        };
        run.AgentRunID = null;
        run.PromptRunID = null;
        run.ActionExecutionLogID = null;
        if (!(await run.Save())) {
            throw new Error(
                `Run ${run.ID} could not be finalized and is stuck at 'Running': ${run.LatestResult?.CompleteMessage ?? firstFailure}`
            );
        }

        for (let attempt = 1; attempt <= RUN_LINKAGE_ATTEMPTS; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, RUN_LINKAGE_RETRY_MS * attempt));
            run.AgentRunID = linkage.AgentRunID;
            run.PromptRunID = linkage.PromptRunID;
            run.ActionExecutionLogID = linkage.ActionExecutionLogID;
            if (await run.Save()) {
                return;
            }
            // Re-null so the next attempt starts from the persisted (unlinked) state rather than
            // stacking a second rejected write on top of a dirty entity.
            run.AgentRunID = null;
            run.PromptRunID = null;
            run.ActionExecutionLogID = null;
        }

        // Status is recorded; only the diagnostic linkage is missing. Say so and move on — losing a
        // link is an observability loss, and blocking the sweep on it would be the worse trade.
        run.ErrorMessage = [outcome.ErrorMessage, `execution linkage not attached: ${firstFailure}`]
            .filter(Boolean).join(' | ');
        const noted = await run.Save();
        this.logError(
            `Run ${run.ID} finalized WITHOUT execution linkage after ${RUN_LINKAGE_ATTEMPTS} attempt(s): ${firstFailure}` +
            (noted ? '' : ` — and the note could not be written: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`)
        );
    }

    /** Roll the run outcome up onto the routine (LastRunAt / LastRunStatus / LastResultHash). */
    private async updateRoutineAfterRun(routine: MJUserRoutineEntity, run: MJUserRoutineRunEntity): Promise<void> {
        // When an AgentWake routine runs an agent that invokes 'Schedule Next Agent Wake' mid-run,
        // the action writes the new NextRunAt / WakeConfiguration directly to DB. Reload first so
        // this post-run bookkeeping does not clobber the newly scheduled wake.
        if (routine.RoutineType === 'AgentWake' && typeof routine.Load === 'function') {
            try {
                await routine.Load(routine.ID);
            } catch {
                // Best-effort reload; proceed with the in-memory instance if unavailable in unit tests
            }
        }
        routine.LastRunAt = run.StartedAt;
        routine.LastCheckedAt = run.CompletedAt ?? new Date();
        routine.LastRunStatus = run.Status;
        routine.LastResultHash = run.ResultHash;
        if (routine.RoutineType === 'AgentWake' && routine.NextRunAt == null) {
            const wakeConfig =
                routine.WakeConfigurationObject ??
                (routine.WakeConfiguration
                    ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(routine.WakeConfiguration)
                    : null);
            const currentResume = (wakeConfig?.resumeState as CoalescedWakeResumeState | undefined) ?? {};
            const consumedResume: CoalescedWakeResumeState = {
                ...currentResume,
                batchConsumed: true,
                lastDispatchedAt: run.StartedAt.toISOString(),
                coalescedEventCount: 0,
                overflowEventCount: 0,
                pendingEvents: [],
            };
            routine.WakeConfigurationObject = {
                ...(wakeConfig ?? {}),
                resumeState: consumedResume,
            };
        }
        if ((routine.ScheduleMode === 'OneShot') && routine.NextRunAt == null && (!routine.CronExpression || routine.CronExpression.trim().length === 0)) {
            routine.Status = 'Disabled';
        }
        const saved = await routine.Save();
        if (!saved) {
            this.logError(`Failed to update routine "${routine.Name}" after run: ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
    }

    /** Compact, capped text describing the outcome — the run row's human-readable summary. */
    private buildResultSummary(outcome: RoutineTargetOutcome): string {
        const text = outcome.Summary?.trim() || outcome.ResultContent.trim();
        const base = outcome.Success
            ? (text.length > 0 ? text : 'Completed successfully.')
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
        heartbeat?: () => Promise<void>,
        gateResult?: WakeGateEvaluationResult
    ): Promise<RoutineTargetOutcome> {
        const targetType: MJUserRoutineEntity['TargetType'] = routine.TargetType;
        switch (targetType) {
            case 'Agent':
                return this.executeAgentTarget(routine, contextUser, heartbeat, gateResult);
            case 'Prompt':
                return this.executePromptTarget(routine, contextUser);
            case 'Action':
                return this.executeActionTarget(routine, contextUser);
            default:
                throw new Error(`Unsupported routine TargetType '${targetType}' — no executor registered`);
        }
    }

    /**
     * Run an Agent target via AgentRunner, threading StartingPayload + RequestedSkillIDs + _wakeContext.
     *
     * When the routine's dedicated conversation is available (existing `ConversationID`,
     * or creatable — see {@link EnsureRoutineConversation}), the run goes through
     * `RunAgentInConversation` so it lands as a proper conversation turn: a user
     * ConversationDetail carrying InitialMessage, an assistant ConversationDetail with the
     * agent result, and the AIAgentRun stamped with ConversationID/ConversationDetailID.
     * When no conversation can be resolved, the run falls back to standalone `RunAgent`
     * — identical outcome recording, just no conversation thread.
     */
    /**
     * Resolves a routine's agent `TargetID` to the user's active primary derived instance
     * (`IsPrimaryInstance = 1`) when `TargetID` points to a root/template agent such as
     * `Chief of Staff` (`InstantiationMode = 'Required'`). Leaves concrete derived instances
     * and non-instantiated targets untouched.
     */
    private async resolveRoutineTargetAgentId(
        targetAgentId: string,
        userId: string | null | undefined,
        contextUser: UserInfo
    ): Promise<string> {
        if (!targetAgentId || !userId) {
            return targetAgentId;
        }
        try {
            if (typeof AgentWakeTriggerService?.Instance?.ResolvePrimaryUserAgentInstance === 'function') {
                const resolved = await AgentWakeTriggerService.Instance.ResolvePrimaryUserAgentInstance(
                    targetAgentId,
                    userId,
                    contextUser
                );
                if (resolved?.ID) {
                    return resolved.ID;
                }
            }
        } catch {
            // Graceful fallback to original targetAgentId when service is unavailable in isolated tests
        }
        return targetAgentId;
    }

    private async executeAgentTarget(
        routine: MJUserRoutineEntity,
        contextUser: UserInfo,
        heartbeat?: () => Promise<void>,
        gateResult?: WakeGateEvaluationResult
    ): Promise<RoutineTargetOutcome> {
        const md = getEntityMetadataAccessor();
        const effectiveAgentId = await this.resolveRoutineTargetAgentId(
            routine.TargetID,
            routine.UserID ?? contextUser.ID,
            contextUser
        );
        const agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', contextUser);
        if (!await agent.Load(effectiveAgentId)) {
            throw new Error(`Agent ${effectiveAgentId} not found for routine "${routine.Name}"`);
        }

        const wakeConfig = routine.WakeConfigurationObject ??
            (routine.WakeConfiguration ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(routine.WakeConfiguration) : null);
        const userMessage = routine.InitialMessage ??
            (wakeConfig?.wakeReason ? `Scheduled wake: ${wakeConfig.wakeReason}` : `Run routine "${routine.Name}"`);
        const basePayload = routine.StartingPayload ? SafeJSONParse<RoutineJsonObject>(routine.StartingPayload) ?? undefined : undefined;
        const payload = (routine.RoutineType === 'AgentWake' || wakeConfig || gateResult)
            ? {
                ...(basePayload ?? {}),
                _wakeContext: {
                    routineId: routine.ID,
                    routineType: routine.RoutineType,
                    scheduleMode: routine.ScheduleMode,
                    wakeReason: wakeConfig?.wakeReason ?? gateResult?.reason ?? null,
                    resumeState: wakeConfig?.resumeState ?? {},
                    watermarks: gateResult?.watermarks ?? {},
                    decidedByTier: gateResult?.decidedByTier ?? 'None',
                },
            }
            : basePayload;

        const configurationId = await ResolveWakeAgentConfigurationID({
            routine,
            wakeConfig,
            contextUser,
            metadataProvider: Metadata.Provider, // global-provider-ok: server-global scheduled task
        });

        const runner = new AgentRunner();
        const baseParams = {
            agent,
            conversationMessages: [{ role: 'user' as const, content: userMessage }],
            payload,
            requestedSkillIDs: this.parseRequestedSkillIDs(routine),
            contextUser,
            compactAfterRun: routine.RoutineType === 'AgentWake' ? true : undefined,
            ...(configurationId ? { configurationId } : {}),
            // Keep the dispatcher job's lease alive while a long agent run makes progress.
            onProgress: () => { void heartbeat?.(); },
        };

        const conversationId = await this.EnsureRoutineConversation(routine, contextUser);
        // A wake's payload is the wake state it was handed (workstream, reason, resume state), not
        // something the user asked for, so it is not turned into a "<Agent> Payload" artifact.
        // Files and media the run generates are still saved.
        const conversationOptions = routine.RoutineType === 'AgentWake'
            ? { conversationId, userMessage, createArtifacts: false }
            : { conversationId, userMessage };
        const result = conversationId
            ? (await runner.RunAgentInConversation(baseParams, conversationOptions)).agentResult
            : await runner.RunAgent(baseParams);

        return {
            Success: result.success,
            ResultContent: result.payload != null ? JSON.stringify(result.payload) : '',
            Summary: result.agentRun?.Message ?? null,
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
            const md = getEntityMetadataAccessor();
            const app = await this.findRoutinesApplication(owner);
            if (!app) {
                this.log(`Routines application not found — running "${routine.Name}" standalone (no conversation)`);
                return null;
            }
            const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', owner);
            conversation.NewRecord();
            conversation.Name = routine.Name;
            conversation.TypeID =
                ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.ROUTINE) ??
                BUILT_IN_CONVERSATION_TYPE_IDS.ROUTINE;
            conversation.UserID = owner.ID;
            conversation.EnvironmentID = routine.EnvironmentID ?? MJEnvironmentEntityExtended.DefaultEnvironmentID;
            conversation.ApplicationScope = 'Application';
            conversation.ApplicationID = app.ID;
            if (routine.TargetType === 'Agent') {
                conversation.DefaultAgentID = await this.resolveRoutineTargetAgentId(
                    routine.TargetID,
                    routine.UserID ?? owner.ID,
                    owner
                );
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
        const parsed = SafeJSONParse<string[]>(routine.RequestedSkillIDs);
        if (Array.isArray(parsed) && parsed.every((v): v is string => typeof v === 'string')) {
            return parsed.length > 0 ? parsed : undefined;
        }
        this.logError(`Routine "${routine.Name}": RequestedSkillIDs is not a JSON string array — ignoring`);
        return undefined;
    }

    /** Run a Prompt target via AIPromptRunner, passing StartingPayload as the data context. */
    private async executePromptTarget(routine: MJUserRoutineEntity, contextUser: UserInfo): Promise<RoutineTargetOutcome> {
        const md = getEntityMetadataAccessor();
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
        const parsed = SafeJSONParse<RoutineJsonObject>(routine.StartingPayload);
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
    protected async renderNotificationMessage(
        routine: MJUserRoutineEntity,
        run: MJUserRoutineRunEntity,
        contextUser: UserInfo
    ): Promise<string> {
        try {
            await TemplateEngineServer.Instance.Config(false, contextUser);
            const template = this.resolveNotificationTemplate(routine);
            if (!template) {
                return this.buildPlainTextMessage(routine, run);
            }
            // In-app messages prefer the compact Text (Markdown) body when the template
            // provides one — the HTML body is email-styled and belongs to the email channel.
            const content = template.GetHighestPriorityContent('Text') ?? template.GetHighestPriorityContent();
            if (!content) {
                return this.buildPlainTextMessage(routine, run);
            }
            const isHtml = content.Type?.trim().toLowerCase() === 'html';
            const rawSummary = run.ResultSummary ?? '';
            const resultSummary = isHtml ? rawSummary : FormatRoutinePlainResultSummary(rawSummary);
            // BaseEntity getters are not spreadable — GetAll() yields plain objects for the renderer.
            const data = {
                routine: routine.GetAll(),
                run: run.GetAll(),
                resultSummary,
                status: run.Status,
            };
            const rendered = await TemplateEngineServer.Instance.RenderTemplate(
                template,
                content,
                data,
                true,
                undefined,
                { ContextUser: contextUser, autoescape: isHtml }
            );
            if (rendered.Success && rendered.Output) {
                return rendered.Output;
            }
            this.logError(`Template render failed for routine "${routine.Name}": ${rendered.Message ?? 'unknown'} — using plain-text fallback`);
            return this.buildPlainTextMessage(routine, run);
        } catch (error) {
            this.logError(`Template resolution failed for routine "${routine.Name}" — using plain-text fallback`, error);
            return this.buildPlainTextMessage(routine, run);
        }
    }

    /** Resolve the routine's template (by ID) or the seeded default (by name) from the template cache. */
    protected resolveNotificationTemplate(routine: MJUserRoutineEntity): MJTemplateEntityExtended | undefined {
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
        const formattedSummary = run.ResultSummary ? FormatRoutinePlainResultSummary(run.ResultSummary) : '';
        const summary = formattedSummary ? `\n\n${formattedSummary}` : '';
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
        // The run's reply lives in the routine's own conversation, which the main chat list hides;
        // the notification carries it so a click can open the reply rather than the routine row.
        const resourceConfiguration: Record<string, string> = { type: 'UserRoutine', routineId: routine.ID, runId: run.ID };
        if (routine.ConversationID) {
            resourceConfiguration['conversationId'] = routine.ConversationID;
        }
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
            const md = getEntityMetadataAccessor(provider);
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
