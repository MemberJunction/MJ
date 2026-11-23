/**
 * @fileoverview Per-(UserID, ApplicationID) event wake coalescing and AIDP startup/deployment guard.
 *
 * - S2-AC-2 (`EventWakeCoalescer`): Coalesces event wakes keyed by `${UserID}:${ApplicationID}` within
 *   a configurable window (default 60 seconds) so bursts such as 20 rapid task assignments produce a
 *   single wake with bounded aggregated event context. Works alongside persisted `MJ: User Routines`
 *   state (`NextRunAt`, `LastRunAt`, `WakeConfiguration`) so coalescing survives restarts and spans
 *   multiple MJAPI / worker instances sharing the database.
 * - S2-AC-3 (`WakeStartupGuard`): Tracks server deployment / initialization phase (`'idle' | 'initializing' | 'ready'`)
 *   and baseline deployment watermark so AIDP startup, metadata sync, and scheduler initialization never
 *   emit spurious or retroactive wakes while still permitting recovery of legitimate pre-existing pending
 *   coalesced routines once initialization completes.
 *
 * @module @memberjunction/ai-agents
 */

import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { MJUserRoutineEntity_IRoutineWakeConfiguration } from '@memberjunction/core-entities';

/**
 * Strongly-typed event item stored inside `resumeState.pendingEvents` and top-level wake resume payloads.
 */
export interface CoalescedWakeEventPayload {
    triggerType?: string;
    workstreamKey?: string;
    sourceWorkstreamKey?: string;
    applicationID?: string;
    coalesceKey?: string;
    wakeReason?: string;
    triggeredAt?: string;
    requestID?: string;
    messageID?: string;
    conversationDetailID?: string | null;
    emailMessageID?: string;
    taskID?: string;
    eventID?: string;
    recordID?: string;
    status?: string;
    subject?: string | null;
    request?: string | null;
    response?: string | null;
    senderUserID?: string | null;
    senderUserName?: string | null;
    senderAgentID?: string | null;
    targetUserID?: string | null;
    targetUserName?: string | null;
    identityID?: string;
    utilityMailboxAddress?: string;
    senderEmail?: string;
    bodyPreview?: string;
    receivedAt?: string;
    channelID?: string;
    topic?: string;
    messagePreview?: string;
    consecutiveAgentTurns?: number;
    responseData?: CoalescedWakeResumeState | null;
    commentsData?: CoalescedWakeResumeState | null;
    respondedByUserID?: string | null;
    respondedAt?: string;
    messageBody?: string;
    rhythmTemplateID?: string;
    operation?: string;
    batchConsumed?: boolean;
    lastDispatchedAt?: string;
    coalesceWindowExpiresAt?: string;
    coalescedEventCount?: number;
    overflowEventCount?: number;
    coalescedSummary?: string;
    coalesceRevision?: number;
    coalesceWriteToken?: string;
    committedWriteTokens?: string[];
    coalescedIntoRoutineID?: string | null;
    pendingEvents?: CoalescedWakeEventPayload[];
}

/**
 * Strongly-typed `resumeState` payload compatible with `MJUserRoutineEntity_IRoutineWakeConfiguration['resumeState']`.
 */
export interface CoalescedWakeResumeState extends CoalescedWakeEventPayload {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | string[]
        | CoalescedWakeResumeState
        | CoalescedWakeEventPayload[];
}

/**
 * Default event coalescing window (60 seconds).
 */
export const DEFAULT_EVENT_COALESCING_WINDOW_MS = 60_000;

/**
 * Maximum retained individual event payloads inside `pendingEvents` for a single coalesced wake.
 * Additional burst events increment `overflowEventCount` and enrich the bounded summary.
 */
export const DEFAULT_MAX_RETAINED_COALESCED_EVENTS = 25;

/**
 * Default application bucket when an event is not scoped to a specific `ApplicationID`.
 */
export const DEFAULT_COALESCE_APPLICATION_KEY = '__global__';

/**
 * Normalized window tracking entry held in memory by `EventWakeCoalescer`.
 */
export interface CoalescedWakeWindowEntry {
    CoalesceKey: string;
    UserID: string;
    ApplicationID: string;
    WindowStartedAtMs: number;
    LastEventAtMs: number;
    LastDispatchedAtMs: number | null;
    EventCount: number;
    OverflowCount: number;
    RetainedEventKeys: string[];
}

/**
 * Input parameters for merging an incoming event into a coalesced routine's `pendingEvents`.
 */
export interface MergeCoalescedEventsInput {
    PriorEvents: CoalescedWakeResumeState[];
    NewEvent: CoalescedWakeResumeState;
    CoalesceKey: string;
    ApplicationID: string;
    MaxRetainedEvents?: number;
    ExistingCoalescedCount?: number;
    ExistingOverflowCount?: number;
    EventKeyExtractor?: (event: CoalescedWakeResumeState) => string;
}

/**
 * Bounded merge result for a coalesced wake routine's `resumeState`.
 */
export interface MergeCoalescedEventsResult {
    PendingEvents: CoalescedWakeResumeState[];
    TotalCoalescedCount: number;
    OverflowCount: number;
    SummaryText: string | null;
}

/**
 * Input for evaluating how an incoming event should schedule its target wake routine within the window.
 */
export interface EvaluateWindowScheduleInput {
    UserID: string;
    ApplicationID?: string | null;
    Now: Date;
    WindowMs?: number;
    ExistingRoutineStatus?: string | null;
    ExistingRoutineNextRunAt?: Date | null;
    ExistingRoutineLastRunAt?: Date | null;
    HasExistingRoutineID?: boolean;
    /** False when the existing routine's prior batch has already been dispatched/consumed. */
    HasPendingUnconsumedBatch?: boolean;
}

/**
 * Scheduling decision returned by `EventWakeCoalescer.EvaluateWindowSchedule`.
 */
export interface EvaluateWindowScheduleResult {
    CoalesceKey: string;
    ApplicationKey: string;
    ShouldDeferUntilWindowExpiry: boolean;
    IsCoalescedIntoActiveWindow: boolean;
    EffectiveNextRunAt: Date;
    WindowExpiresAt: Date;
}

/**
 * Startup lifecycle phase tracked by `WakeStartupGuard`.
 */
export type StartupWakePhase = 'idle' | 'initializing' | 'ready';

/**
 * Input evaluated by `WakeStartupGuard.EvaluateEventWakeTrigger`.
 */
export interface EvaluateEventWakeTriggerInput {
    EventTimestamp?: Date | null;
    IsStartupOrSyncOrigin?: boolean;
    Source?: string;
}

/**
 * Decision returned by `WakeStartupGuard.EvaluateEventWakeTrigger`.
 */
export interface StartupWakeEvaluation {
    Allowed: boolean;
    Phase: StartupWakePhase;
    Reason: string;
}

/**
 * Normalizes an `ApplicationID` string for deterministic coalesce keying.
 */
export function NormalizeApplicationKey(applicationID?: string | null): string {
    const trimmed = applicationID?.trim() ?? '';
    return trimmed.length > 0 ? trimmed.toLowerCase() : DEFAULT_COALESCE_APPLICATION_KEY;
}

/**
 * Builds the canonical `(UserID, ApplicationID)` wake coalesce key (`${UserID}:${ApplicationID}`).
 */
export function BuildUserAppWakeKey(userID: string, applicationID?: string | null): string {
    const normalizedUser = userID.trim().toLowerCase();
    const normalizedApp = NormalizeApplicationKey(applicationID);
    return `${normalizedUser}:${normalizedApp}`;
}

/**
 * Derives the deterministic `MJ: User Routines` workstream key when an `ApplicationID` is supplied.
 * When `applicationID` is non-empty, returns `app:${normalizedApp}` so all rapid events within that
 * application map to ONE routine row per `(UserID, AgentID, WorkstreamKey)`.
 */
export function BuildAppWorkstreamKey(applicationID?: string | null, fallbackWorkstreamKey?: string): string {
    const trimmedApp = applicationID?.trim() ?? '';
    if (trimmedApp.length > 0) {
        return `app:${trimmedApp.toLowerCase()}`;
    }
    return fallbackWorkstreamKey?.trim() || 'workstream';
}

/**
 * Default deduplication key for individual event payloads inside `pendingEvents`.
 */
function defaultEventKey(event: CoalescedWakeResumeState): string {
    const triggerType = typeof event.triggerType === 'string' ? event.triggerType : 'workstream';
    const requestID = typeof event.requestID === 'string' ? event.requestID : '';
    const detailID = typeof event.conversationDetailID === 'string' ? event.conversationDetailID : '';
    const emailMessageID = typeof event.emailMessageID === 'string' ? event.emailMessageID : '';
    const taskID = typeof event.taskID === 'string' ? event.taskID : '';
    const eventID = typeof event.eventID === 'string' ? event.eventID : '';

    if (requestID) {
        return `${triggerType}:req:${requestID}`;
    }
    if (detailID) {
        return `${triggerType}:detail:${detailID}`;
    }
    if (emailMessageID) {
        return `${triggerType}:email:${emailMessageID}`;
    }
    if (taskID) {
        return `${triggerType}:task:${taskID}`;
    }
    if (eventID) {
        return `${triggerType}:event:${eventID}`;
    }
    return `${triggerType}:payload:${JSON.stringify(event)}`;
}

/**
 *Singleton managing `(UserID, ApplicationID)` wake coalescing windows and bounded payload merging.
 */
export class EventWakeCoalescer extends BaseSingleton<EventWakeCoalescer> {
    private windows = new Map<string, CoalescedWakeWindowEntry>();
    private defaultWindowMs = DEFAULT_EVENT_COALESCING_WINDOW_MS;
    private defaultMaxRetainedEvents = DEFAULT_MAX_RETAINED_COALESCED_EVENTS;

    protected constructor() {
        super();
    }

    public static get Instance(): EventWakeCoalescer {
        return super.getInstance<EventWakeCoalescer>();
    }

    /**
     * Configures the default coalescing window duration (milliseconds).
     */
    public SetDefaultWindowMs(windowMs: number): void {
        if (Number.isFinite(windowMs) && windowMs >= 0) {
            this.defaultWindowMs = windowMs;
        }
    }

    /**
     * Returns the current default coalescing window duration (milliseconds).
     */
    public GetDefaultWindowMs(): number {
        return this.defaultWindowMs;
    }

    /**
     * Configures the maximum number of retained payloads inside `pendingEvents`.
     */
    public SetDefaultMaxRetainedEvents(maxEvents: number): void {
        if (Number.isFinite(maxEvents) && maxEvents >= 1) {
            this.defaultMaxRetainedEvents = Math.floor(maxEvents);
        }
    }

    /**
     * Returns the current in-memory entry for a `(UserID, ApplicationID)` key, if any.
     */
    public GetWindowEntry(userID: string, applicationID?: string | null): CoalescedWakeWindowEntry | null {
        const key = BuildUserAppWakeKey(userID, applicationID);
        const entry = this.windows.get(key);
        return entry ? { ...entry, RetainedEventKeys: [...entry.RetainedEventKeys] } : null;
    }

    /**
     * Evaluates the target routine schedule timestamp for an incoming event while honoring both
     * any already-pending unclaimed DB routine AND the 60s window since the last dispatched wake.
     */
    public EvaluateWindowSchedule(input: EvaluateWindowScheduleInput): EvaluateWindowScheduleResult {
        const windowMs = input.WindowMs ?? this.defaultWindowMs;
        const nowMs = input.Now.getTime();
        const applicationKey = NormalizeApplicationKey(input.ApplicationID);
        const coalesceKey = BuildUserAppWakeKey(input.UserID, input.ApplicationID);

        const existingEntry = this.windows.get(coalesceKey);
        const persistedLastRunMs = input.ExistingRoutineLastRunAt ? input.ExistingRoutineLastRunAt.getTime() : null;
        const lastDispatchedAtMs = maxNullableTimestamp(existingEntry?.LastDispatchedAtMs ?? null, persistedLastRunMs);

        const hasUnclaimedActiveRoutine =
            input.HasExistingRoutineID === true &&
            input.ExistingRoutineStatus === 'Active' &&
            input.ExistingRoutineNextRunAt != null &&
            input.HasPendingUnconsumedBatch !== false;

        // Clean stale in-memory window if both window and cooldown elapsed
        if (existingEntry && !hasUnclaimedActiveRoutine && lastDispatchedAtMs != null && nowMs - lastDispatchedAtMs >= windowMs) {
            this.windows.delete(coalesceKey);
        }

        if (hasUnclaimedActiveRoutine && input.ExistingRoutineNextRunAt) {
            const existingNextMs = input.ExistingRoutineNextRunAt.getTime();
            const effectiveNextRunAt = existingNextMs >= nowMs ? input.ExistingRoutineNextRunAt : input.Now;
            const windowExpiresAt = existingNextMs >= nowMs ? new Date(existingNextMs) : new Date(nowMs);
            return {
                CoalesceKey: coalesceKey,
                ApplicationKey: applicationKey,
                ShouldDeferUntilWindowExpiry: existingNextMs > nowMs,
                IsCoalescedIntoActiveWindow: true,
                EffectiveNextRunAt: effectiveNextRunAt,
                WindowExpiresAt: windowExpiresAt,
            };
        }

        if (windowMs > 0 && lastDispatchedAtMs != null) {
            const elapsedSinceDispatch = nowMs - lastDispatchedAtMs;
            if (elapsedSinceDispatch >= 0 && elapsedSinceDispatch < windowMs) {
                const deferredDate = new Date(lastDispatchedAtMs + windowMs);
                return {
                    CoalesceKey: coalesceKey,
                    ApplicationKey: applicationKey,
                    ShouldDeferUntilWindowExpiry: true,
                    IsCoalescedIntoActiveWindow: true,
                    EffectiveNextRunAt: deferredDate,
                    WindowExpiresAt: deferredDate,
                };
            }
        }

        const windowExpiresAt = new Date(nowMs + windowMs);
        const shouldDeferInitialBurst = windowMs > 0;
        return {
            CoalesceKey: coalesceKey,
            ApplicationKey: applicationKey,
            ShouldDeferUntilWindowExpiry: shouldDeferInitialBurst,
            IsCoalescedIntoActiveWindow: false,
            EffectiveNextRunAt: shouldDeferInitialBurst ? windowExpiresAt : input.Now,
            WindowExpiresAt: windowExpiresAt,
        };
    }

    /**
     * Records an incoming event in the in-memory `(UserID, ApplicationID)` window tracker.
     */
    public RecordEventBuffered(
        userID: string,
        applicationID: string | null | undefined,
        eventKey: string,
        now: Date,
        totalCount: number,
        overflowCount: number
    ): CoalescedWakeWindowEntry {
        const coalesceKey = BuildUserAppWakeKey(userID, applicationID);
        const nowMs = now.getTime();
        const existing = this.windows.get(coalesceKey);

        if (!existing) {
            const created: CoalescedWakeWindowEntry = {
                CoalesceKey: coalesceKey,
                UserID: userID.trim(),
                ApplicationID: NormalizeApplicationKey(applicationID),
                WindowStartedAtMs: nowMs,
                LastEventAtMs: nowMs,
                LastDispatchedAtMs: null,
                EventCount: totalCount,
                OverflowCount: overflowCount,
                RetainedEventKeys: [eventKey],
            };
            this.windows.set(coalesceKey, created);
            return created;
        }

        existing.LastEventAtMs = Math.max(existing.LastEventAtMs, nowMs);
        existing.EventCount = totalCount;
        existing.OverflowCount = overflowCount;
        if (!existing.RetainedEventKeys.includes(eventKey)) {
            existing.RetainedEventKeys.push(eventKey);
            if (existing.RetainedEventKeys.length > this.defaultMaxRetainedEvents) {
                existing.RetainedEventKeys.shift();
            }
        }
        return existing;
    }

    /**
     * Records that a wake for `(UserID, ApplicationID)` was claimed/dispatched at `dispatchedAt`
     * so subsequent events inside the remaining coalescing window are deferred rather than firing
     * a second immediate wake.
     */
    public RecordWakeDispatched(
        userID: string,
        applicationID: string | null | undefined,
        dispatchedAt: Date = new Date()
    ): void {
        if (!userID?.trim()) {
            return;
        }
        const coalesceKey = BuildUserAppWakeKey(userID, applicationID);
        const dispatchedMs = dispatchedAt.getTime();
        const existing = this.windows.get(coalesceKey);
        if (existing) {
            existing.LastDispatchedAtMs = maxNullableTimestamp(existing.LastDispatchedAtMs, dispatchedMs);
            existing.EventCount = 0;
            existing.OverflowCount = 0;
            existing.RetainedEventKeys = [];
            return;
        }
        this.windows.set(coalesceKey, {
            CoalesceKey: coalesceKey,
            UserID: userID.trim(),
            ApplicationID: NormalizeApplicationKey(applicationID),
            WindowStartedAtMs: dispatchedMs,
            LastEventAtMs: dispatchedMs,
            LastDispatchedAtMs: dispatchedMs,
            EventCount: 0,
            OverflowCount: 0,
            RetainedEventKeys: [],
        });
    }

    /**
     * Merges a new event into `pendingEvents` with deduplication and bounded retention so huge
     * bursts (e.g., 500 rapid events) stay compact while preserving exact counts and an overflow summary.
     */
    public MergeCoalescedEvents(input: MergeCoalescedEventsInput): MergeCoalescedEventsResult {
        const maxRetained = Math.max(1, input.MaxRetainedEvents ?? this.defaultMaxRetainedEvents);
        const extractKey = input.EventKeyExtractor ?? defaultEventKey;
        const newKey = extractKey(input.NewEvent);

        const priorFiltered = input.PriorEvents.filter((event) => extractKey(event) !== newKey);
        const wasDuplicate = priorFiltered.length < input.PriorEvents.length;

        const basePriorCount = Math.max(
            input.PriorEvents.length,
            input.ExistingCoalescedCount ?? input.PriorEvents.length
        );
        const existingOverflow = Math.max(0, input.ExistingOverflowCount ?? 0);

        const totalCoalescedCount = wasDuplicate ? basePriorCount : basePriorCount + 1;
        const combined = [...priorFiltered, input.NewEvent];

        let retained = combined;
        let droppedThisMerge = 0;
        if (combined.length > maxRetained) {
            droppedThisMerge = combined.length - maxRetained;
            retained = combined.slice(combined.length - maxRetained);
        }

        const overflowCount = wasDuplicate
            ? existingOverflow
            : Math.max(existingOverflow + droppedThisMerge, totalCoalescedCount - retained.length);

        const summaryText =
            totalCoalescedCount > 1
                ? overflowCount > 0
                    ? `Coalesced ${totalCoalescedCount} events for ${input.CoalesceKey} (${retained.length} latest retained, ${overflowCount} earlier events summarized).`
                    : `Coalesced ${totalCoalescedCount} events for ${input.CoalesceKey} within active window.`
                : null;

        return {
            PendingEvents: retained,
            TotalCoalescedCount: totalCoalescedCount,
            OverflowCount: overflowCount,
            SummaryText: summaryText,
        };
    }

    /**
     * Removes expired entries from the in-memory tracker to avoid unbounded memory growth.
     */
    public CleanupExpiredEntries(now: Date = new Date(), retentionMs: number = this.defaultWindowMs * 2): number {
        const nowMs = now.getTime();
        let removed = 0;
        for (const [key, entry] of this.windows.entries()) {
            const latestActivity = maxNullableTimestamp(entry.LastEventAtMs, entry.LastDispatchedAtMs) ?? entry.WindowStartedAtMs;
            if (nowMs - latestActivity >= retentionMs) {
                this.windows.delete(key);
                removed++;
            }
        }
        return removed;
    }

    /**
     * Clears all in-memory coalescing windows and restores defaults. Primarily for test isolation.
     */
    public Reset(): void {
        this.windows.clear();
        this.defaultWindowMs = DEFAULT_EVENT_COALESCING_WINDOW_MS;
        this.defaultMaxRetainedEvents = DEFAULT_MAX_RETAINED_COALESCED_EVENTS;
    }
}

function maxNullableTimestamp(a: number | null, b: number | null): number | null {
    if (a == null) {
        return b;
    }
    if (b == null) {
        return a;
    }
    return Math.max(a, b);
}

/**
 * Singleton guard preventing spurious or retroactive wakes during AIDP deployment and server startup.
 */
export class WakeStartupGuard extends BaseSingleton<WakeStartupGuard> {
    private phase: StartupWakePhase = 'idle';
    private baselineWatermark: Date | null = null;
    private initializationReason: string | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): WakeStartupGuard {
        return super.getInstance<WakeStartupGuard>();
    }

    /**
     * Current server startup lifecycle phase.
     */
    public get Phase(): StartupWakePhase {
        return this.phase;
    }

    /**
     * Recorded deployment / server startup baseline watermark (`null` if never initialized).
     */
    public get BaselineWatermark(): Date | null {
        return this.baselineWatermark ? new Date(this.baselineWatermark.getTime()) : null;
    }

    /**
     * Human-readable reason associated with the current initialization phase, if initializing.
     */
    public get InitializationReason(): string | null {
        return this.initializationReason;
    }

    /**
     * Arms the startup guard at the start of AIDP deployment or MJServer boot (`initializing`).
     * Event-driven and scheduler-driven wake generation is suppressed until `CompleteStartupInitialization`.
     */
    public BeginStartupInitialization(reason: string = 'Server startup initialization', now: Date = new Date()): void {
        this.phase = 'initializing';
        this.initializationReason = reason;
        this.baselineWatermark = new Date(now.getTime());
    }

    /**
     * Disarms the startup gate once MJServer initialization finishes (`ready`), setting the
     * deployment baseline watermark so retroactive pre-deploy timestamps remain suppressed while
     * new post-startup events and pre-existing pending routines can proceed normally.
     */
    public CompleteStartupInitialization(now: Date = new Date()): void {
        this.phase = 'ready';
        this.initializationReason = null;
        this.baselineWatermark = new Date(now.getTime());
    }

    /**
     * Returns true when server startup or an AIDP deployment window is actively in progress.
     */
    public IsStartupInProgress(): boolean {
        return this.phase === 'initializing' || this.isDeploymentEnvFlagActive();
    }

    /**
     * Evaluates whether an event-driven wake trigger is permitted given startup phase, deployment
     * environment flags, event origin, and the deployment baseline watermark.
     */
    public EvaluateEventWakeTrigger(input?: EvaluateEventWakeTriggerInput): StartupWakeEvaluation {
        if (input?.IsStartupOrSyncOrigin) {
            return {
                Allowed: false,
                Phase: this.phase,
                Reason: `Suppressed wake from startup or metadata sync origin (${input.Source ?? 'startup-sync'}).`,
            };
        }

        if (this.IsStartupInProgress()) {
            return {
                Allowed: false,
                Phase: this.phase,
                Reason: `Wake suppressed during AIDP deployment/startup initialization (${this.initializationReason ?? 'initializing'}).`,
            };
        }

        if (this.baselineWatermark && input?.EventTimestamp) {
            if (input.EventTimestamp.getTime() < this.baselineWatermark.getTime()) {
                return {
                    Allowed: false,
                    Phase: this.phase,
                    Reason: `Event timestamp ${input.EventTimestamp.toISOString()} precedes deployment baseline watermark ${this.baselineWatermark.toISOString()}.`,
                };
            }
        }

        return {
            Allowed: true,
            Phase: this.phase,
            Reason: 'Startup guard passed.',
        };
    }

    /**
     * Helper to verify whether two `WakeConfiguration.applicationID` values refer to the same application.
     */
    public MatchesApplicationID(a?: string | null, b?: string | null): boolean {
        const left = a?.trim() ?? '';
        const right = b?.trim() ?? '';
        if (!left && !right) {
            return true;
        }
        return UUIDsEqual(left, right);
    }

    /**
     * Resets guard state back to `'idle'` with no baseline watermark. Primarily for test isolation.
     */
    public Reset(): void {
        this.phase = 'idle';
        this.baselineWatermark = null;
        this.initializationReason = null;
    }

    private isDeploymentEnvFlagActive(): boolean {
        const aidpDeploy = process.env.AIDP_DEPLOYMENT_IN_PROGRESS?.trim().toLowerCase();
        if (aidpDeploy === 'true' || aidpDeploy === '1') {
            return true;
        }
        const skipStartup = process.env.MJ_SKIP_STARTUP_WAKES?.trim().toLowerCase();
        return skipStartup === 'true' || skipStartup === '1';
    }
}
