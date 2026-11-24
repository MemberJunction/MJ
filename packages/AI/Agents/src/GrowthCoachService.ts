/**
 * @fileoverview Growth Coach service (`@memberjunction/ai-agents`).
 *
 * Implements opt-in biweekly reflective coaching for Chief of Staff:
 * - Strict opt-in enforcement (offered during onboarding; never generated or scheduled without explicit user opt-in).
 * - Bounded retrieval over tasks, meeting transcripts/notes, work reports, and agent conversations
 *   (explicit lookback window, per-source row limits, per-source/total char caps, and token caps).
 * - Integration with `ResolveAgentRunLimits` and `BudgetEnforcementGuard` before paid coaching generation.
 * - Per-user, per-period deterministic scheduler deduplication (`YYYY-MM-BW1` / `YYYY-MM-BW2`).
 * - Concise evidence-backed `Start / Stop / Continue` coaching notes written into a private
 *   `ParentID` side conversation (`Coaching — <MMM D>`) nested under the user's Chief of Staff
 *   conversation (owned by the user, unshared by default).
 *
 * @module @memberjunction/ai-agents
 */

import { EntityFieldInfo, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJConversationDetailEntityExtended,
    MJConversationEntity,
    MJEmployeeEntity,
    MJEnvironmentEntityExtended,
    MJAIAgentSuggestionEntity,
    MJAIAgentUserPolicyEntity,
    MJUserEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, ResolveAgentRunLimits } from '@memberjunction/ai-core-plus';
import { BaseSingleton, EscapeSQLString, NormalizeUUID, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { BudgetEnforcementGuard, type BudgetLedgerReader } from './BudgetEnforcementGuard';

/** Canonical skill name for the `RequestedOnly` Growth Coach core skill. */
export const GROWTH_COACH_SKILL_NAME = 'Growth Coach';

/** Canonical workstream key for the biweekly High-tier `growth-coaching` rhythm template. */
export const GROWTH_COACH_WORKSTREAM_KEY = 'growth-coaching';

/** Biweekly cron schedule (1st and 15th of each month at 10:00 AM). */
export const GROWTH_COACH_BIWEEKLY_CRON = '0 10 1,15 * *';

/** Logical source categories inspected by Growth Coach. */
export type GrowthCoachSourceKind = 'tasks' | 'meetings' | 'work_reports' | 'conversations';

/** Configurable bounds protecting Growth Coach retrieval and prompt budgets. */
export interface GrowthCoachBoundsConfig {
    LookbackDays: number;
    MaxTasksRows: number;
    MaxMeetingTranscriptRows: number;
    MaxWorkReportRows: number;
    MaxConversationRows: number;
    MaxCharsPerSource: number;
    MaxTotalInputChars: number;
    MaxTotalInputTokens: number;
}

/** Default bounded retrieval limits for the 14-day biweekly coaching window. */
export const DEFAULT_GROWTH_COACH_BOUNDS: Readonly<GrowthCoachBoundsConfig> = {
    LookbackDays: 14,
    MaxTasksRows: 25,
    MaxMeetingTranscriptRows: 15,
    MaxWorkReportRows: 10,
    MaxConversationRows: 20,
    MaxCharsPerSource: 4_000,
    MaxTotalInputChars: 12_000,
    MaxTotalInputTokens: 3_000,
};

/** Single normalized evidence moment retrieved within the coaching lookback window. */
export interface GrowthCoachEvidenceMoment {
    Source: GrowthCoachSourceKind;
    RecordID: string;
    Title: string;
    OccurredAtISO: string;
    Excerpt: string;
}

/** Per-source retrieval telemetry proving row and character bounds were enforced. */
export interface GrowthCoachSourceRetrievalStats {
    Source: GrowthCoachSourceKind;
    Available: boolean;
    RawCount: number;
    RetainedCount: number;
    DroppedOutOfWindow: number;
    DroppedByRowCap: number;
    DroppedByCharOrTokenCap: number;
    RetainedChars: number;
}

/** Aggregate retrieval telemetry across all four Growth Coach evidence sources. */
export interface GrowthCoachRetrievalTelemetry {
    WindowStartISO: string;
    WindowEndISO: string;
    LookbackDays: number;
    TotalChars: number;
    EstimatedTokens: number;
    Truncated: boolean;
    Sources: Record<GrowthCoachSourceKind, GrowthCoachSourceRetrievalStats>;
}

/** Evidence citation attached to a Start / Stop / Continue recommendation. */
export interface GrowthCoachMomentCitation {
    Source: GrowthCoachSourceKind;
    RecordID: string;
    Label: string;
    OccurredAtISO: string;
}

/** Single actionable item inside Start, Stop, or Continue. */
export interface GrowthCoachActionItem {
    Recommendation: string;
    Evidence: GrowthCoachMomentCitation[];
}

/** Structured Start / Stop / Continue coaching note backed by concrete moments. */
export interface GrowthCoachNote {
    PeriodKey: string;
    GeneratedAtISO: string;
    Start: GrowthCoachActionItem[];
    Stop: GrowthCoachActionItem[];
    Continue: GrowthCoachActionItem[];
    MarkdownBody: string;
}

/** Pluggable source reader for retrieving evidence across optional BizApps & core entities. */
export interface GrowthCoachSourceProvider {
    ReadTasks?(params: { ContextUser: UserInfo; WindowStart: Date; WindowEnd: Date; MaxRows: number; Provider: IMetadataProvider }): Promise<GrowthCoachEvidenceMoment[]>;
    ReadMeetingTranscripts?(params: { ContextUser: UserInfo; WindowStart: Date; WindowEnd: Date; MaxRows: number; Provider: IMetadataProvider }): Promise<GrowthCoachEvidenceMoment[]>;
    ReadWorkReports?(params: { ContextUser: UserInfo; WindowStart: Date; WindowEnd: Date; MaxRows: number; Provider: IMetadataProvider }): Promise<GrowthCoachEvidenceMoment[]>;
    ReadAgentConversations?(params: { ContextUser: UserInfo; WindowStart: Date; WindowEnd: Date; MaxRows: number; Provider: IMetadataProvider }): Promise<GrowthCoachEvidenceMoment[]>;
}

/** Optional LLM / prompt generator hook producing structured Start/Stop/Continue items. */
export type GrowthCoachNoteGenerator = (input: {
    User: UserInfo;
    PeriodKey: string;
    SideConversationTitle: string;
    Moments: GrowthCoachEvidenceMoment[];
    EstimatedInputTokens: number;
}) => Promise<Pick<GrowthCoachNote, 'Start' | 'Stop' | 'Continue'>>;

/** Result of evaluating whether a user has explicitly opted into Growth Coach. */
export interface GrowthCoachOptInStatus {
    OptedIn: boolean;
    Source: 'ActiveRoutine' | 'AcceptedSuggestion' | 'ExplicitSkillRequest' | 'ExplicitParameter' | 'None';
    Reason: string;
}

/** Result of offering Growth Coach during onboarding (never enables automatically). */
export interface GrowthCoachOnboardingOfferResult {
    Offered: boolean;
    AlreadyOfferedOrResponded: boolean;
    AutoEnabled: false;
    WorkstreamKey: string;
    SuggestionID: string | null;
    Reason: string;
}

/** Parameters for executing a biweekly Growth Coach synthesis run. */
export interface RunGrowthCoachParams {
    ContextUser: UserInfo;
    Agent?: MJAIAgentEntityExtended | null;
    AgentID?: string;
    UserPolicy?: MJAIAgentUserPolicyEntity | null;
    Routine?: MJUserRoutineEntity | null;
    ChiefOfStaffConversation: Pick<MJConversationEntity, 'ID' | 'UserID' | 'ApplicationScope' | 'ApplicationID' | 'EnvironmentID'>;
    ExplicitOptIn?: boolean;
    ExplicitRequestedSkillIDs?: readonly string[];
    GrowthCoachSkillID?: string | null;
    Timezone?: string;
    Now?: Date;
    Bounds?: Partial<GrowthCoachBoundsConfig>;
    MetadataProvider?: IMetadataProvider;
    SourceProvider?: GrowthCoachSourceProvider;
    Generator?: GrowthCoachNoteGenerator;
    LedgerReader?: BudgetLedgerReader;
}

/** Result codes emitted by {@link GrowthCoachService.RunBiweeklyCoaching}. */
export type GrowthCoachRunResultCode =
    | 'SUCCESS'
    | 'OPT_IN_REQUIRED'
    | 'DEDUPLICATED'
    | 'BUDGET_EXCEEDED'
    | 'CONVERSATION_OWNERSHIP_DENIED'
    | 'SAVE_FAILED'
    | 'ERROR';

/** Structured outcome returned by {@link GrowthCoachService.RunBiweeklyCoaching}. */
export interface GrowthCoachRunResult {
    Success: boolean;
    ResultCode: GrowthCoachRunResultCode;
    PeriodKey: string;
    DedupeKey: string;
    Deduplicated: boolean;
    SideConversationID: string | null;
    SideConversationTitle: string | null;
    ParentConversationID: string | null;
    Note: GrowthCoachNote | null;
    Telemetry: GrowthCoachRetrievalTelemetry | null;
    Reason: string;
}

interface RawBizAppsRecordRow {
    ID: string;
    Name?: string | null;
    Title?: string | null;
    Description?: string | null;
    Summary?: string | null;
    Body?: string | null;
    Notes?: string | null;
    Transcript?: string | null;
    Status?: string | null;
    CompletedAt?: string | Date | null;
    __mj_UpdatedAt?: string | Date | null;
    __mj_CreatedAt?: string | Date | null;
}

interface CoreConversationRow {
    ID: string;
    Name: string | null;
    UserID: string;
    ParentID: string | null;
    AdditionalData: string | null;
    __mj_UpdatedAt: string | Date;
}

interface CoreConversationDetailRow {
    ID: string;
    ConversationID: string;
    Role: string;
    Message: string | null;
    __mj_CreatedAt: string | Date;
}

/**
 * Computes the deterministic biweekly period key (`YYYY-MM-BW1` for days 1–14,
 * `YYYY-MM-BW2` for days 15–31) in the specified IANA timezone (falling back to `'UTC'`).
 */
export function ComputeBiweeklyPeriodKey(date: Date = new Date(), timezone: string = 'UTC'): string {
    const parts = formatDatePartsInTimezone(date, timezone);
    const half = parts.Day <= 14 ? 'BW1' : 'BW2';
    const month = String(parts.Month).padStart(2, '0');
    return `${parts.Year}-${month}-${half}`;
}

/** Builds the canonical per-user, per-period deduplication key. */
export function BuildGrowthCoachDedupeKey(userID: string, periodKey: string): string {
    return `${NormalizeUUID(userID)}:${periodKey.trim()}`;
}

/** Formats the private side-conversation title as `Coaching — <MMM D>` (e.g. `Coaching — Nov 21`). */
export function FormatCoachingSideConversationTitle(date: Date = new Date(), timezone: string = 'UTC'): string {
    const safeTz = resolveValidTimezone(timezone);
    const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: safeTz,
        month: 'short',
        day: 'numeric',
    }).format(date);
    return `Coaching — ${formatted}`;
}

/** Estimates LLM token count from character length (~4 chars/token). */
export function EstimateGrowthCoachTokens(chars: number): number {
    if (!Number.isFinite(chars) || chars <= 0) {
        return 0;
    }
    return Math.ceil(chars / 4);
}

function resolveValidTimezone(timezone: string): string {
    const trimmed = (timezone ?? '').trim();
    if (!trimmed) {
        return 'UTC';
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
        return trimmed;
    } catch {
        return 'UTC';
    }
}

function formatDatePartsInTimezone(date: Date, timezone: string): { Year: number; Month: number; Day: number } {
    const safeTz = resolveValidTimezone(timezone);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: safeTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes): number => {
        const hit = parts.find((p) => p.type === type);
        return hit ? Number(hit.value) : 0;
    };
    return {
        Year: read('year'),
        Month: read('month'),
        Day: read('day'),
    };
}

function resolveEffectiveBounds(partial?: Partial<GrowthCoachBoundsConfig>): GrowthCoachBoundsConfig {
    const clamp = (val: number | undefined, fallback: number, min: number, max: number): number => {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, Math.trunc(val)));
    };
    return {
        LookbackDays: clamp(partial?.LookbackDays, DEFAULT_GROWTH_COACH_BOUNDS.LookbackDays, 1, 30),
        MaxTasksRows: clamp(partial?.MaxTasksRows, DEFAULT_GROWTH_COACH_BOUNDS.MaxTasksRows, 1, 100),
        MaxMeetingTranscriptRows: clamp(partial?.MaxMeetingTranscriptRows, DEFAULT_GROWTH_COACH_BOUNDS.MaxMeetingTranscriptRows, 1, 100),
        MaxWorkReportRows: clamp(partial?.MaxWorkReportRows, DEFAULT_GROWTH_COACH_BOUNDS.MaxWorkReportRows, 1, 100),
        MaxConversationRows: clamp(partial?.MaxConversationRows, DEFAULT_GROWTH_COACH_BOUNDS.MaxConversationRows, 1, 100),
        MaxCharsPerSource: clamp(partial?.MaxCharsPerSource, DEFAULT_GROWTH_COACH_BOUNDS.MaxCharsPerSource, 200, 32_000),
        MaxTotalInputChars: clamp(partial?.MaxTotalInputChars, DEFAULT_GROWTH_COACH_BOUNDS.MaxTotalInputChars, 500, 64_000),
        MaxTotalInputTokens: clamp(partial?.MaxTotalInputTokens, DEFAULT_GROWTH_COACH_BOUNDS.MaxTotalInputTokens, 100, 16_000),
    };
}

function createRunView(provider?: IMetadataProvider): RunView {
    return provider
        ? RunView.FromMetadataProvider(provider)
        : RunView.FromMetadataProvider(Metadata.Provider); // global-provider-ok: fallback when caller omits provider
}

function isCoachingSideConversationData(additionalData: string | null): string | null {
    if (!additionalData) {
        return null;
    }
    const parsed = SafeJSONParse<{ growthCoach?: { periodKey?: string; sideConversation?: boolean } }>(additionalData);
    const periodKey = parsed?.growthCoach?.periodKey;
    return typeof periodKey === 'string' && periodKey.trim().length > 0 ? periodKey.trim() : null;
}

/**
 * Singleton service orchestrating Growth Coach opt-in verification, bounded multi-source
 * retrieval, budget checks, per-period deduplication, Start/Stop/Continue synthesis, and
 * private `ParentID` side-conversation creation.
 */
export class GrowthCoachService extends BaseSingleton<GrowthCoachService> {
    private readonly completedPeriodKeys = new Map<string, string>();
    private readonly inFlightPeriodKeys = new Set<string>();

    public constructor() {
        super();
    }

    public static get Instance(): GrowthCoachService {
        return GrowthCoachService.getInstance<GrowthCoachService>();
    }

    /** Clears in-process deduplication state (primarily for deterministic unit testing). */
    public ClearDeduplicationCache(): void {
        this.completedPeriodKeys.clear();
        this.inFlightPeriodKeys.clear();
    }

    /**
     * Verifies whether `params.ContextUser` has explicitly opted into Growth Coach.
     * Unopted users are strictly blocked from scheduling or running coaching generation.
     */
    public async CheckUserOptIn(params: {
        ContextUser: UserInfo;
        AgentID?: string;
        Routine?: MJUserRoutineEntity | null;
        ExplicitOptIn?: boolean;
        ExplicitRequestedSkillIDs?: readonly string[];
        GrowthCoachSkillID?: string | null;
        MetadataProvider?: IMetadataProvider;
    }): Promise<GrowthCoachOptInStatus> {
        if (params.ExplicitOptIn === true) {
            return { OptedIn: true, Source: 'ExplicitParameter', Reason: 'Caller supplied explicit user opt-in.' };
        }
        if (
            params.GrowthCoachSkillID &&
            params.ExplicitRequestedSkillIDs?.some((id) => UUIDsEqual(id, params.GrowthCoachSkillID!))
        ) {
            return { OptedIn: true, Source: 'ExplicitSkillRequest', Reason: 'User explicitly requested Growth Coach skill.' };
        }
        if (params.Routine) {
            const key = params.Routine.WakeConfigurationObject?.workstreamKey?.trim().toLowerCase();
            if (key === GROWTH_COACH_WORKSTREAM_KEY && params.Routine.Status === 'Active') {
                return { OptedIn: true, Source: 'ActiveRoutine', Reason: 'User has an Active growth-coaching routine.' };
            }
            if (key === GROWTH_COACH_WORKSTREAM_KEY) {
                return {
                    OptedIn: false,
                    Source: 'None',
                    Reason: `User growth-coaching routine is ${params.Routine.Status}; explicit Active opt-in required.`,
                };
            }
        }
        return this.checkPersistedOptIn(params.ContextUser, params.AgentID, params.MetadataProvider);
    }

    /**
     * Records an onboarding offer for `growth-coaching` without ever enabling a routine
     * or generating coaching. Declined offers are respected and never overwritten.
     */
    public async OfferGrowthCoachDuringOnboarding(params: {
        ContextUser: UserInfo;
        AgentID: string;
        MetadataProvider?: IMetadataProvider;
    }): Promise<GrowthCoachOnboardingOfferResult> {
        const md: IMetadataProvider = params.MetadataProvider ?? Metadata.Provider; // global-provider-ok: fallback when caller omits provider
        const rv = createRunView(md);
        const existingRes = await rv.RunView<MJAIAgentSuggestionEntity>(
            {
                EntityName: 'MJ: AI Agent Suggestions',
                ExtraFilter:
                    `UserID='${EscapeSQLString(params.ContextUser.ID)}' AND ` +
                    `AgentID='${EscapeSQLString(params.AgentID)}' AND ` +
                    `LOWER(TargetKey)='${GROWTH_COACH_WORKSTREAM_KEY}'`,
                OrderBy: 'OfferedAt DESC',
                MaxRows: 5,
                ResultType: 'entity_object',
            },
            params.ContextUser
        );
        const existing = existingRes.Success ? existingRes.Results[0] ?? null : null;
        if (existing) {
            return {
                Offered: existing.Status === 'Offered',
                AlreadyOfferedOrResponded: true,
                AutoEnabled: false,
                WorkstreamKey: GROWTH_COACH_WORKSTREAM_KEY,
                SuggestionID: existing.ID,
                Reason: `Existing suggestion status is ${existing.Status}; Growth Coach remains opt-in only.`,
            };
        }

        const suggestion = await md.GetEntityObject<MJAIAgentSuggestionEntity>('MJ: AI Agent Suggestions', params.ContextUser);
        suggestion.NewRecord();
        suggestion.AgentID = params.AgentID;
        suggestion.UserID = params.ContextUser.ID;
        suggestion.Kind = 'Rhythm';
        suggestion.TargetKey = GROWTH_COACH_WORKSTREAM_KEY;
        suggestion.Summary = 'Optional biweekly Growth Coach review (High tier) writing private Start/Stop/Continue notes.';
        suggestion.Status = 'Offered';
        suggestion.OfferedAt = new Date();
        const saved = await suggestion.Save();

        return {
            Offered: saved,
            AlreadyOfferedOrResponded: false,
            AutoEnabled: false,
            WorkstreamKey: GROWTH_COACH_WORKSTREAM_KEY,
            SuggestionID: saved ? suggestion.ID : null,
            Reason: saved
                ? 'Offered biweekly Growth Coach rhythm during onboarding without auto-enabling.'
                : suggestion.LatestResult?.CompleteMessage ?? 'Failed to record onboarding suggestion.',
        };
    }

    /**
     * Executes an end-to-end biweekly Growth Coach run with strict opt-in gating,
     * per-user/per-period deduplication, bounded multi-source retrieval, budget enforcement,
     * evidence-backed Start/Stop/Continue note generation, and private `ParentID` side-thread creation.
     */
    public async RunBiweeklyCoaching(params: RunGrowthCoachParams): Promise<GrowthCoachRunResult> {
        const now = params.Now ?? new Date();
        const timezone = params.Timezone ?? 'UTC';
        const periodKey = ComputeBiweeklyPeriodKey(now, timezone);
        const dedupeKey = BuildGrowthCoachDedupeKey(params.ContextUser.ID, periodKey);
        const md: IMetadataProvider = params.MetadataProvider ?? Metadata.Provider; // global-provider-ok: fallback when caller omits provider

        if (!UUIDsEqual(params.ChiefOfStaffConversation.UserID, params.ContextUser.ID)) {
            return this.buildFailureResult(periodKey, dedupeKey, 'CONVERSATION_OWNERSHIP_DENIED', 'Chief of Staff parent conversation must belong to ContextUser.');
        }

        const optIn = await this.CheckUserOptIn({
            ContextUser: params.ContextUser,
            AgentID: params.Agent?.ID ?? params.AgentID,
            Routine: params.Routine,
            ExplicitOptIn: params.ExplicitOptIn,
            ExplicitRequestedSkillIDs: params.ExplicitRequestedSkillIDs,
            GrowthCoachSkillID: params.GrowthCoachSkillID,
            MetadataProvider: md,
        });
        if (!optIn.OptedIn) {
            return this.buildFailureResult(periodKey, dedupeKey, 'OPT_IN_REQUIRED', optIn.Reason);
        }

        const existingSideConvID = await this.checkDeduplication(
            params.ContextUser,
            params.ChiefOfStaffConversation.ID,
            periodKey,
            dedupeKey,
            params.Routine,
            md
        );
        if (existingSideConvID !== undefined) {
            return {
                Success: true,
                ResultCode: 'DEDUPLICATED',
                PeriodKey: periodKey,
                DedupeKey: dedupeKey,
                Deduplicated: true,
                SideConversationID: existingSideConvID,
                SideConversationTitle: null,
                ParentConversationID: params.ChiefOfStaffConversation.ID,
                Note: null,
                Telemetry: null,
                Reason: `Coaching for period ${periodKey} already generated (deduplicated).`,
            };
        }

        this.inFlightPeriodKeys.add(dedupeKey);
        try {
            const bounds = resolveEffectiveBounds(params.Bounds);
            const { Moments, Telemetry } = await this.RetrieveBoundedCoachingEvidence({
                ContextUser: params.ContextUser,
                Now: now,
                Bounds: bounds,
                MetadataProvider: md,
                SourceProvider: params.SourceProvider,
            });

            const budgetFailure = await this.evaluateBudget(params, Telemetry.EstimatedTokens, now, md);
            if (budgetFailure) {
                return {
                    ...this.buildFailureResult(periodKey, dedupeKey, 'BUDGET_EXCEEDED', budgetFailure),
                    Telemetry,
                };
            }

            const sideTitle = FormatCoachingSideConversationTitle(now, timezone);
            const note = await this.generateValidatedNote(params, periodKey, sideTitle, Moments, Telemetry.EstimatedTokens, now);
            const sideConvID = await this.writePrivateCoachingSideConversation({
                ContextUser: params.ContextUser,
                ParentConversation: params.ChiefOfStaffConversation,
                SideTitle: sideTitle,
                PeriodKey: periodKey,
                AgentID: params.Agent?.ID ?? params.AgentID ?? null,
                Note: note,
                MetadataProvider: md,
            });
            if (!sideConvID) {
                return {
                    ...this.buildFailureResult(periodKey, dedupeKey, 'SAVE_FAILED', 'Failed to persist private Coaching side conversation.'),
                    Telemetry,
                };
            }

            this.completedPeriodKeys.set(dedupeKey, sideConvID);
            await this.recordPeriodOnRoutine(params.Routine, periodKey, sideConvID);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                PeriodKey: periodKey,
                DedupeKey: dedupeKey,
                Deduplicated: false,
                SideConversationID: sideConvID,
                SideConversationTitle: sideTitle,
                ParentConversationID: params.ChiefOfStaffConversation.ID,
                Note: note,
                Telemetry,
                Reason: `Generated ${periodKey} coaching note in private side conversation "${sideTitle}".`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[GrowthCoachService] RunBiweeklyCoaching failed: ${msg}`);
            return this.buildFailureResult(periodKey, dedupeKey, 'ERROR', msg);
        } finally {
            this.inFlightPeriodKeys.delete(dedupeKey);
        }
    }

    /**
     * Retrieves and bounds evidence across tasks, meeting transcripts/notes, work reports,
     * and agent conversations within the configured lookback window and row/char/token caps.
     */
    public async RetrieveBoundedCoachingEvidence(params: {
        ContextUser: UserInfo;
        Now?: Date;
        Bounds?: Partial<GrowthCoachBoundsConfig>;
        MetadataProvider?: IMetadataProvider;
        SourceProvider?: GrowthCoachSourceProvider;
    }): Promise<{ Moments: GrowthCoachEvidenceMoment[]; Telemetry: GrowthCoachRetrievalTelemetry }> {
        const now = params.Now ?? new Date();
        const bounds = resolveEffectiveBounds(params.Bounds);
        const windowStart = new Date(now.getTime() - bounds.LookbackDays * 24 * 60 * 60 * 1000);
        const md: IMetadataProvider = params.MetadataProvider ?? Metadata.Provider; // global-provider-ok: fallback when caller omits provider

        const [rawTasks, rawMeetings, rawReports, rawConvs] = await Promise.all([
            this.fetchSourceSafe('tasks', bounds.MaxTasksRows, () =>
                params.SourceProvider?.ReadTasks
                    ? params.SourceProvider.ReadTasks({ ContextUser: params.ContextUser, WindowStart: windowStart, WindowEnd: now, MaxRows: bounds.MaxTasksRows, Provider: md })
                    : this.readTasksFromEntities(params.ContextUser, windowStart, bounds.MaxTasksRows, md)
            ),
            this.fetchSourceSafe('meetings', bounds.MaxMeetingTranscriptRows, () =>
                params.SourceProvider?.ReadMeetingTranscripts
                    ? params.SourceProvider.ReadMeetingTranscripts({ ContextUser: params.ContextUser, WindowStart: windowStart, WindowEnd: now, MaxRows: bounds.MaxMeetingTranscriptRows, Provider: md })
                    : this.readMeetingsFromEntities(params.ContextUser, windowStart, bounds.MaxMeetingTranscriptRows, md)
            ),
            this.fetchSourceSafe('work_reports', bounds.MaxWorkReportRows, () =>
                params.SourceProvider?.ReadWorkReports
                    ? params.SourceProvider.ReadWorkReports({ ContextUser: params.ContextUser, WindowStart: windowStart, WindowEnd: now, MaxRows: bounds.MaxWorkReportRows, Provider: md })
                    : this.readWorkReportsFromEntities(params.ContextUser, windowStart, bounds.MaxWorkReportRows, md)
            ),
            this.fetchSourceSafe('conversations', bounds.MaxConversationRows, () =>
                params.SourceProvider?.ReadAgentConversations
                    ? params.SourceProvider.ReadAgentConversations({ ContextUser: params.ContextUser, WindowStart: windowStart, WindowEnd: now, MaxRows: bounds.MaxConversationRows, Provider: md })
                    : this.readConversationsFromEntities(params.ContextUser, windowStart, bounds.MaxConversationRows, md)
            ),
        ]);

        return this.applyBoundingCaps([rawTasks, rawMeetings, rawReports, rawConvs], windowStart, now, bounds);
    }

    private async checkPersistedOptIn(
        contextUser: UserInfo,
        agentID: string | undefined,
        provider?: IMetadataProvider
    ): Promise<GrowthCoachOptInStatus> {
        const rv = createRunView(provider);
        const agentClause = agentID ? ` AND TargetID='${EscapeSQLString(agentID)}'` : '';
        const routineRes = await rv.RunView<Pick<MJUserRoutineEntity, 'ID' | 'Status' | 'WakeConfiguration' | 'WakeConfigurationObject'>>(
            {
                EntityName: 'MJ: User Routines',
                ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}'${agentClause} AND RoutineType='AgentWake'`,
                Fields: ['ID', 'Status', 'WakeConfiguration', 'WakeConfigurationObject'],
                MaxRows: 50,
                ResultType: 'simple',
            },
            contextUser
        );
        if (routineRes.Success) {
            const matching = routineRes.Results.find((r) => {
                const cfg = r.WakeConfigurationObject ?? (r.WakeConfiguration ? SafeJSONParse<{ workstreamKey?: string }>(r.WakeConfiguration) : null);
                return cfg?.workstreamKey?.trim().toLowerCase() === GROWTH_COACH_WORKSTREAM_KEY;
            });
            if (matching?.Status === 'Active') {
                return { OptedIn: true, Source: 'ActiveRoutine', Reason: 'User has an Active growth-coaching routine.' };
            }
        }

        const sugAgentClause = agentID ? ` AND AgentID='${EscapeSQLString(agentID)}'` : '';
        const sugRes = await rv.RunView<Pick<MJAIAgentSuggestionEntity, 'ID' | 'Status'>>(
            {
                EntityName: 'MJ: AI Agent Suggestions',
                ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}'${sugAgentClause} AND LOWER(TargetKey)='${GROWTH_COACH_WORKSTREAM_KEY}'`,
                OrderBy: 'OfferedAt DESC',
                Fields: ['ID', 'Status'],
                MaxRows: 5,
                ResultType: 'simple',
            },
            contextUser
        );
        const latestSug = sugRes.Success ? sugRes.Results[0] : undefined;
        if (latestSug?.Status === 'Accepted') {
            return { OptedIn: true, Source: 'AcceptedSuggestion', Reason: 'User accepted the growth-coaching suggestion.' };
        }
        return {
            OptedIn: false,
            Source: 'None',
            Reason: 'Growth Coach requires explicit user opt-in before generating or scheduling coaching.',
        };
    }

    private async checkDeduplication(
        contextUser: UserInfo,
        parentConversationID: string,
        periodKey: string,
        dedupeKey: string,
        routine: MJUserRoutineEntity | null | undefined,
        md: IMetadataProvider
    ): Promise<string | null | undefined> {
        if (this.inFlightPeriodKeys.has(dedupeKey)) {
            return this.completedPeriodKeys.get(dedupeKey) ?? null;
        }
        const existingInMem = this.completedPeriodKeys.get(dedupeKey);
        if (existingInMem) {
            return existingInMem;
        }
        const routinePeriod = routine?.WakeConfigurationObject?.resumeState?.['lastCoachingPeriodKey'];
        if (typeof routinePeriod === 'string' && routinePeriod.trim() === periodKey) {
            const existingConvId = routine?.WakeConfigurationObject?.resumeState?.['lastCoachingConversationID'];
            return typeof existingConvId === 'string' ? existingConvId : null;
        }

        const rv = createRunView(md);
        const convRes = await rv.RunView<Pick<CoreConversationRow, 'ID' | 'AdditionalData'>>(
            {
                EntityName: 'MJ: Conversations',
                ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}' AND ParentID='${EscapeSQLString(parentConversationID)}'`,
                Fields: ['ID', 'AdditionalData'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 50,
                ResultType: 'simple',
            },
            contextUser
        );
        if (convRes.Success) {
            const hit = convRes.Results.find((row) => isCoachingSideConversationData(row.AdditionalData) === periodKey);
            if (hit) {
                this.completedPeriodKeys.set(dedupeKey, hit.ID);
                return hit.ID;
            }
        }
        return undefined;
    }

    private async fetchSourceSafe(
        source: GrowthCoachSourceKind,
        rowCap: number,
        loader: () => Promise<{ available: boolean; rows: GrowthCoachEvidenceMoment[] }> | Promise<GrowthCoachEvidenceMoment[]>
    ): Promise<{ source: GrowthCoachSourceKind; rowCap: number; available: boolean; rows: GrowthCoachEvidenceMoment[] }> {
        try {
            const loaded = await loader();
            if (Array.isArray(loaded)) {
                return { source, rowCap, available: true, rows: loaded };
            }
            return { source, rowCap, available: loaded.available, rows: loaded.rows };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[GrowthCoachService] Source "${source}" retrieval failed cleanly: ${msg}`);
            return { source, rowCap, available: false, rows: [] };
        }
    }

    private async readTasksFromEntities(
        contextUser: UserInfo,
        windowStart: Date,
        maxRows: number,
        md: IMetadataProvider
    ): Promise<{ available: boolean; rows: GrowthCoachEvidenceMoment[] }> {
        return this.readOptionalBizAppsSource(
            'MJ_BizApps_Tasks: Tasks',
            'tasks',
            contextUser,
            windowStart,
            maxRows,
            md
        );
    }

    private async readMeetingsFromEntities(
        contextUser: UserInfo,
        windowStart: Date,
        maxRows: number,
        md: IMetadataProvider
    ): Promise<{ available: boolean; rows: GrowthCoachEvidenceMoment[] }> {
        const notesResult = await this.readOptionalBizAppsSource(
            'MJ_BizApps_Tasks: Meeting Notes',
            'meetings',
            contextUser,
            windowStart,
            maxRows,
            md
        );
        if (notesResult.available && notesResult.rows.length > 0) {
            return notesResult;
        }
        return this.readOptionalBizAppsSource(
            'MJ_BizApps_Tasks: Meetings',
            'meetings',
            contextUser,
            windowStart,
            maxRows,
            md
        );
    }

    private async readWorkReportsFromEntities(
        contextUser: UserInfo,
        windowStart: Date,
        maxRows: number,
        md: IMetadataProvider
    ): Promise<{ available: boolean; rows: GrowthCoachEvidenceMoment[] }> {
        return this.readOptionalBizAppsSource(
            'MJ_BizApps_Tasks: Work Reports',
            'work_reports',
            contextUser,
            windowStart,
            maxRows,
            md
        );
    }

    private async readOptionalBizAppsSource(
        entityName: string,
        source: GrowthCoachSourceKind,
        contextUser: UserInfo,
        windowStart: Date,
        maxRows: number,
        md: IMetadataProvider
    ): Promise<{ available: boolean; rows: GrowthCoachEvidenceMoment[] }> {
        const entityInfo = typeof md.EntityByName === 'function' ? md.EntityByName(entityName) : undefined;
        if (!entityInfo || !Array.isArray(entityInfo.Fields) || entityInfo.Fields.length === 0) {
            return { available: false, rows: [] };
        }
        const userScopeFilter = await this.buildBizAppsUserScopeFilter(entityInfo.Fields, contextUser, md);
        if (!userScopeFilter) {
            // Fail closed: never execute an unscoped multi-tenant/cross-user query when no user column exists.
            return { available: false, rows: [] };
        }
        const rv = createRunView(md);
        const res = await rv.RunView<RawBizAppsRecordRow>(
            {
                EntityName: entityName,
                ExtraFilter: `${userScopeFilter} AND __mj_UpdatedAt >= '${EscapeSQLString(windowStart.toISOString())}'`,
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: maxRows,
                ResultType: 'simple',
            },
            contextUser
        );
        if (!res.Success) {
            return { available: false, rows: [] };
        }
        const rows = res.Results.map((r) => ({
            Source: source,
            RecordID: r.ID,
            Title: (r.Title ?? r.Name ?? entityName).trim(),
            OccurredAtISO: this.toIsoTimestamp(r.CompletedAt ?? r.__mj_UpdatedAt ?? r.__mj_CreatedAt),
            Excerpt: (r.Summary ?? r.Body ?? r.Transcript ?? r.Notes ?? r.Description ?? r.Status ?? '').trim(),
        }));
        return { available: true, rows };
    }

    private async buildBizAppsUserScopeFilter(
        fields: readonly EntityFieldInfo[],
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<string | null> {
        const userFieldNames = new Set([
            'userid',
            'assignedtouserid',
            'owneruserid',
            'createdbyuserid',
            'authoruserid',
            'submittedbyuserid',
            'presenteruserid',
            'organizeruserid',
        ]);
        const employeeFieldNames = new Set([
            'employeeid',
            'assignedtoemployeeid',
            'owneremployeeid',
            'authoremployeeid',
            'submittedbyemployeeid',
        ]);
        const personFieldNames = new Set([
            'personid',
            'assignedtopersonid',
            'ownerpersonid',
            'organizerid',
            'authorid',
            'submittedbyid',
        ]);
        const ambiguousIdFieldNames = new Set(['assignedtoid', 'ownerid']);

        const needsEmployee = fields.some(
            (f) =>
                employeeFieldNames.has(f.Name.toLowerCase()) ||
                (ambiguousIdFieldNames.has(f.Name.toLowerCase()) && (f.RelatedEntity ?? '').toLowerCase().includes('employee'))
        );
        const needsPerson = fields.some(
            (f) =>
                personFieldNames.has(f.Name.toLowerCase()) ||
                (ambiguousIdFieldNames.has(f.Name.toLowerCase()) &&
                    ((f.RelatedEntity ?? '').toLowerCase().includes('people') || (f.RelatedEntity ?? '').toLowerCase().includes('person')))
        );

        const employeeId = needsEmployee ? await this.resolveEmployeeIdForUser(contextUser, md) : null;
        const personId = needsPerson ? await this.resolvePersonIdForUser(contextUser, md) : null;

        const clauses: string[] = [];
        for (const field of fields) {
            const lower = field.Name.toLowerCase();
            if (userFieldNames.has(lower)) {
                clauses.push(`${field.Name}='${EscapeSQLString(contextUser.ID)}'`);
            } else if (employeeFieldNames.has(lower)) {
                if (employeeId) {
                    clauses.push(`${field.Name}='${EscapeSQLString(employeeId)}'`);
                }
            } else if (personFieldNames.has(lower)) {
                if (personId) {
                    clauses.push(`${field.Name}='${EscapeSQLString(personId)}'`);
                }
            } else if (ambiguousIdFieldNames.has(lower)) {
                const related = (field.RelatedEntity ?? '').toLowerCase();
                if (related.includes('employee')) {
                    if (employeeId) {
                        clauses.push(`${field.Name}='${EscapeSQLString(employeeId)}'`);
                    }
                } else if (related.includes('people') || related.includes('person')) {
                    if (personId) {
                        clauses.push(`${field.Name}='${EscapeSQLString(personId)}'`);
                    }
                } else {
                    clauses.push(`${field.Name}='${EscapeSQLString(contextUser.ID)}'`);
                }
            }
        }

        if (clauses.length === 0) {
            return null;
        }
        return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
    }

    private async resolveEmployeeIdForUser(contextUser: UserInfo, md: IMetadataProvider): Promise<string | null> {
        const direct = contextUser.EmployeeID != null ? String(contextUser.EmployeeID).trim() : '';
        if (direct.length > 0 && direct !== '0') {
            return direct;
        }
        const rv = createRunView(md);
        const userRes = await rv.RunView<Pick<MJUserEntity, 'ID' | 'EmployeeID'>>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `ID='${EscapeSQLString(contextUser.ID)}'`,
                Fields: ['ID', 'EmployeeID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser
        );
        const fromUser = userRes.Success ? userRes.Results[0]?.EmployeeID : null;
        if (fromUser && fromUser.trim().length > 0) {
            return fromUser.trim();
        }
        const email = (contextUser.Email ?? '').trim();
        if (!email) {
            return null;
        }
        const empRes = await rv.RunView<Pick<MJEmployeeEntity, 'ID'>>(
            {
                EntityName: 'MJ: Employees',
                ExtraFilter: `LOWER(Email)=LOWER('${EscapeSQLString(email)}') AND Active=1`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser
        );
        return empRes.Success && empRes.Results[0]?.ID ? empRes.Results[0].ID : null;
    }

    private async resolvePersonIdForUser(contextUser: UserInfo, md: IMetadataProvider): Promise<string | null> {
        const peopleEntity = typeof md.EntityByName === 'function' ? md.EntityByName('MJ_BizApps_Common: People') : undefined;
        if (!peopleEntity) {
            return null;
        }
        const rv = createRunView(md);
        const hasUserCol = Array.isArray(peopleEntity.Fields) && peopleEntity.Fields.some((f) => f.Name.toLowerCase() === 'userid');
        const email = (contextUser.Email ?? '').trim();
        const filter = hasUserCol
            ? `UserID='${EscapeSQLString(contextUser.ID)}'`
            : email
              ? `LOWER(Email)=LOWER('${EscapeSQLString(email)}')`
              : '';
        if (!filter) {
            return null;
        }
        const res = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ_BizApps_Common: People',
                ExtraFilter: filter,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser
        );
        return res.Success && res.Results[0]?.ID ? res.Results[0].ID : null;
    }

    private async readConversationsFromEntities(
        contextUser: UserInfo,
        windowStart: Date,
        maxRows: number,
        md: IMetadataProvider
    ): Promise<{ available: boolean; rows: GrowthCoachEvidenceMoment[] }> {
        const rv = createRunView(md);
        const convRes = await rv.RunView<CoreConversationRow>(
            {
                EntityName: 'MJ: Conversations',
                ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}' AND __mj_UpdatedAt >= '${EscapeSQLString(windowStart.toISOString())}'`,
                Fields: ['ID', 'Name', 'UserID', 'ParentID', 'AdditionalData', '__mj_UpdatedAt'],
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: maxRows,
                ResultType: 'simple',
            },
            contextUser
        );
        if (!convRes.Success) {
            return { available: false, rows: [] };
        }
        const nonCoaching = convRes.Results.filter((c) => !isCoachingSideConversationData(c.AdditionalData));
        if (nonCoaching.length === 0) {
            return { available: true, rows: [] };
        }
        const convIds = nonCoaching.slice(0, maxRows).map((c) => `'${EscapeSQLString(c.ID)}'`).join(',');
        const detailRes = await rv.RunView<CoreConversationDetailRow>(
            {
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID IN (${convIds}) AND __mj_CreatedAt >= '${EscapeSQLString(windowStart.toISOString())}'`,
                Fields: ['ID', 'ConversationID', 'Role', 'Message', '__mj_CreatedAt'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: maxRows * 2,
                ResultType: 'simple',
            },
            contextUser
        );
        const detailsByConv = new Map<string, CoreConversationDetailRow[]>();
        for (const d of detailRes.Success ? detailRes.Results : []) {
            const key = d.ConversationID.toLowerCase();
            const list = detailsByConv.get(key) ?? [];
            list.push(d);
            detailsByConv.set(key, list);
        }
        const rows: GrowthCoachEvidenceMoment[] = nonCoaching.map((c) => {
            const snippets = (detailsByConv.get(c.ID.toLowerCase()) ?? [])
                .slice(0, 2)
                .map((d) => `${d.Role}: ${(d.Message ?? '').trim().slice(0, 180)}`)
                .join(' | ');
            return {
                Source: 'conversations',
                RecordID: c.ID,
                Title: (c.Name ?? 'Agent Conversation').trim(),
                OccurredAtISO: this.toIsoTimestamp(c.__mj_UpdatedAt),
                Excerpt: snippets || (c.Name ?? 'Conversation').trim(),
            };
        });
        return { available: true, rows };
    }

    private toIsoTimestamp(value: string | Date | null | undefined): string {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString();
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }
        return new Date().toISOString();
    }

    private applyBoundingCaps(
        sourceResults: Array<{ source: GrowthCoachSourceKind; rowCap: number; available: boolean; rows: GrowthCoachEvidenceMoment[] }>,
        windowStart: Date,
        windowEnd: Date,
        bounds: GrowthCoachBoundsConfig
    ): { Moments: GrowthCoachEvidenceMoment[]; Telemetry: GrowthCoachRetrievalTelemetry } {
        const startMs = windowStart.getTime();
        const endMs = windowEnd.getTime();
        const perSourceStats = {} as Record<GrowthCoachSourceKind, GrowthCoachSourceRetrievalStats>;
        const perSourceBounded: Array<{ source: GrowthCoachSourceKind; rows: GrowthCoachEvidenceMoment[] }> = [];

        for (const entry of sourceResults) {
            const inWindow = entry.rows.filter((m) => {
                const ms = new Date(m.OccurredAtISO).getTime();
                return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
            });
            const droppedOutOfWindow = entry.rows.length - inWindow.length;
            const rowCapped = inWindow.slice(0, entry.rowCap);
            const droppedByRowCap = inWindow.length - rowCapped.length;

            let sourceChars = 0;
            const charCapped: GrowthCoachEvidenceMoment[] = [];
            for (const item of rowCapped) {
                const serializedLen = item.Title.length + item.Excerpt.length + 40;
                if (sourceChars + serializedLen <= bounds.MaxCharsPerSource) {
                    charCapped.push(item);
                    sourceChars += serializedLen;
                } else if (charCapped.length === 0 && bounds.MaxCharsPerSource > 40) {
                    const remaining = bounds.MaxCharsPerSource - item.Title.length - 40;
                    const trimmedExcerpt = remaining > 0 ? item.Excerpt.slice(0, remaining) : '';
                    charCapped.push({ ...item, Excerpt: trimmedExcerpt });
                    sourceChars += item.Title.length + trimmedExcerpt.length + 40;
                    break;
                } else {
                    break;
                }
            }
            perSourceStats[entry.source] = {
                Source: entry.source,
                Available: entry.available,
                RawCount: entry.rows.length,
                RetainedCount: charCapped.length,
                DroppedOutOfWindow: droppedOutOfWindow,
                DroppedByRowCap: droppedByRowCap,
                DroppedByCharOrTokenCap: rowCapped.length - charCapped.length,
                RetainedChars: sourceChars,
            };
            perSourceBounded.push({ source: entry.source, rows: charCapped });
        }

        return this.applyGlobalInputCaps(perSourceBounded, perSourceStats, windowStart, windowEnd, bounds);
    }

    private applyGlobalInputCaps(
        perSourceBounded: Array<{ source: GrowthCoachSourceKind; rows: GrowthCoachEvidenceMoment[] }>,
        perSourceStats: Record<GrowthCoachSourceKind, GrowthCoachSourceRetrievalStats>,
        windowStart: Date,
        windowEnd: Date,
        bounds: GrowthCoachBoundsConfig
    ): { Moments: GrowthCoachEvidenceMoment[]; Telemetry: GrowthCoachRetrievalTelemetry } {
        const effectiveMaxChars = Math.min(bounds.MaxTotalInputChars, bounds.MaxTotalInputTokens * 4);
        const retained: GrowthCoachEvidenceMoment[] = [];
        let totalChars = 0;
        let truncated = Object.values(perSourceStats).some((s) => s.DroppedByRowCap > 0 || s.DroppedByCharOrTokenCap > 0);

        for (const group of perSourceBounded) {
            let groupChars = 0;
            let groupRetained = 0;
            for (const item of group.rows) {
                const itemChars = item.Title.length + item.Excerpt.length + 40;
                if (totalChars + itemChars > effectiveMaxChars) {
                    truncated = true;
                    break;
                }
                retained.push(item);
                totalChars += itemChars;
                groupChars += itemChars;
                groupRetained++;
            }
            const stat = perSourceStats[group.source];
            const droppedGlobal = group.rows.length - groupRetained;
            if (droppedGlobal > 0) {
                stat.DroppedByCharOrTokenCap += droppedGlobal;
                stat.RetainedCount = groupRetained;
                stat.RetainedChars = groupChars;
            }
        }

        return {
            Moments: retained,
            Telemetry: {
                WindowStartISO: windowStart.toISOString(),
                WindowEndISO: windowEnd.toISOString(),
                LookbackDays: bounds.LookbackDays,
                TotalChars: totalChars,
                EstimatedTokens: EstimateGrowthCoachTokens(totalChars),
                Truncated: truncated,
                Sources: perSourceStats,
            },
        };
    }

    private async evaluateBudget(
        params: RunGrowthCoachParams,
        estimatedInputTokens: number,
        now: Date,
        md: IMetadataProvider
    ): Promise<string | null> {
        const limits = ResolveAgentRunLimits({
            Agent: params.Agent ?? undefined,
            UserPolicy: params.UserPolicy ?? undefined,
            ContextUser: params.ContextUser,
            Provider: md,
        });
        const maxTokens = limits.Limits.Budgets.PerRun.MaxTokens;
        if (maxTokens != null && estimatedInputTokens > maxTokens) {
            return `Growth Coach input (${estimatedInputTokens} estimated tokens) exceeds PerRun MaxTokens (${maxTokens}).`;
        }
        const guard = new BudgetEnforcementGuard();
        const budgetResult = await guard.Evaluate({
            Budgets: limits.Limits.Budgets,
            UserID: params.ContextUser.ID,
            RoutineID: params.Routine?.ID ?? null,
            CurrentRunCostUsd: 0,
            CurrentRunStartedAtMs: now.getTime(),
            CurrentRunTokens: estimatedInputTokens,
            NowMs: now.getTime(),
            Provider: md,
            ContextUser: params.ContextUser,
            LedgerReader: params.LedgerReader,
        });
        return budgetResult.Exceeded
            ? (budgetResult.Breach?.Reason ?? 'Growth Coach blocked by agent budget controls.')
            : null;
    }

    private async generateValidatedNote(
        params: RunGrowthCoachParams,
        periodKey: string,
        sideTitle: string,
        moments: GrowthCoachEvidenceMoment[],
        estimatedTokens: number,
        now: Date
    ): Promise<GrowthCoachNote> {
        const rawGenerated = params.Generator
            ? await params.Generator({
                  User: params.ContextUser,
                  PeriodKey: periodKey,
                  SideConversationTitle: sideTitle,
                  Moments: moments,
                  EstimatedInputTokens: estimatedTokens,
              })
            : null;
        const generated = rawGenerated ?? this.synthesizeDefaultCoachingNote(moments);

        const validById = new Map(moments.map((m) => [m.RecordID, m]));
        const sanitizeSection = (items: GrowthCoachActionItem[], fallbackIndex: number): GrowthCoachActionItem[] => {
            return items.slice(0, 3).map((item) => {
                const validCitations = item.Evidence.filter((c) => validById.has(c.RecordID));
                if (validCitations.length > 0) {
                    return { Recommendation: item.Recommendation.trim(), Evidence: validCitations };
                }
                const fallbackMoment = moments[fallbackIndex % Math.max(1, moments.length)];
                return {
                    Recommendation: item.Recommendation.trim(),
                    Evidence: fallbackMoment
                        ? [{
                              Source: fallbackMoment.Source,
                              RecordID: fallbackMoment.RecordID,
                              Label: fallbackMoment.Title,
                              OccurredAtISO: fallbackMoment.OccurredAtISO,
                          }]
                        : [],
                };
            });
        };

        const start = sanitizeSection(generated.Start, 0);
        const stop = sanitizeSection(generated.Stop, 1);
        const cont = sanitizeSection(generated.Continue, 2);
        const markdownBody = this.formatNoteMarkdown(sideTitle, periodKey, start, stop, cont);

        return {
            PeriodKey: periodKey,
            GeneratedAtISO: now.toISOString(),
            Start: start,
            Stop: stop,
            Continue: cont,
            MarkdownBody: markdownBody,
        };
    }

    private synthesizeDefaultCoachingNote(
        moments: GrowthCoachEvidenceMoment[]
    ): Pick<GrowthCoachNote, 'Start' | 'Stop' | 'Continue'> {
        const toCitation = (m: GrowthCoachEvidenceMoment): GrowthCoachMomentCitation => ({
            Source: m.Source,
            RecordID: m.RecordID,
            Label: m.Title,
            OccurredAtISO: m.OccurredAtISO,
        });
        const taskMoment = moments.find((m) => m.Source === 'tasks') ?? moments[0];
        const meetingMoment = moments.find((m) => m.Source === 'meetings') ?? moments[1] ?? moments[0];
        const reportOrConvMoment =
            moments.find((m) => m.Source === 'work_reports' || m.Source === 'conversations') ?? moments[2] ?? moments[0];

        return {
            Start: [
                {
                    Recommendation: taskMoment
                        ? `Block dedicated focus time earlier in the week for high-leverage deliverables like "${taskMoment.Title}".`
                        : 'Set aside one dedicated focus block each week for reflective leadership priorities.',
                    Evidence: taskMoment ? [toCitation(taskMoment)] : [],
                },
            ],
            Stop: [
                {
                    Recommendation: meetingMoment
                        ? `Avoid carrying unclarified action owners out of recurring discussions such as "${meetingMoment.Title}".`
                        : 'Avoid ending recurring check-ins without explicit written action owners.',
                    Evidence: meetingMoment ? [toCitation(meetingMoment)] : [],
                },
            ],
            Continue: [
                {
                    Recommendation: reportOrConvMoment
                        ? `Maintain clear written synthesis and follow-through as demonstrated in "${reportOrConvMoment.Title}".`
                        : 'Maintain consistent reflection cadence across your recent work updates.',
                    Evidence: reportOrConvMoment ? [toCitation(reportOrConvMoment)] : [],
                },
            ],
        };
    }

    private formatNoteMarkdown(
        sideTitle: string,
        periodKey: string,
        start: GrowthCoachActionItem[],
        stop: GrowthCoachActionItem[],
        cont: GrowthCoachActionItem[]
    ): string {
        const formatItems = (items: GrowthCoachActionItem[]): string[] =>
            items.map((item) => {
                const refs = item.Evidence.map((e) => `${e.Label} [${e.Source}:${e.RecordID}]`).join('; ');
                return refs ? `- ${item.Recommendation} _(Evidence: ${refs})_` : `- ${item.Recommendation}`;
            });

        return [
            `# ${sideTitle} (${periodKey})`,
            '',
            '### Start',
            ...formatItems(start),
            '',
            '### Stop',
            ...formatItems(stop),
            '',
            '### Continue',
            ...formatItems(cont),
        ].join('\n');
    }

    private async writePrivateCoachingSideConversation(params: {
        ContextUser: UserInfo;
        ParentConversation: Pick<MJConversationEntity, 'ID' | 'UserID' | 'ApplicationScope' | 'ApplicationID' | 'EnvironmentID'>;
        SideTitle: string;
        PeriodKey: string;
        AgentID: string | null;
        Note: GrowthCoachNote;
        MetadataProvider: IMetadataProvider;
    }): Promise<string | null> {
        const md = params.MetadataProvider;
        const sideConversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', params.ContextUser);
        sideConversation.NewRecord();
        sideConversation.Name = params.SideTitle;
        sideConversation.UserID = params.ContextUser.ID;
        sideConversation.ParentID = params.ParentConversation.ID;
        sideConversation.DefaultAgentID = params.AgentID;
        sideConversation.TypeID =
            ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.CHAT) ??
            BUILT_IN_CONVERSATION_TYPE_IDS.CHAT;
        sideConversation.Status = 'Available';
        sideConversation.EnvironmentID =
            params.ParentConversation.EnvironmentID ?? MJEnvironmentEntityExtended.DefaultEnvironmentID;
        const parentScope = params.ParentConversation.ApplicationScope ?? 'Global';
        sideConversation.ApplicationScope = parentScope;
        sideConversation.ApplicationID = parentScope !== 'Global' ? (params.ParentConversation.ApplicationID ?? null) : null;
        // Private by default: never set inheritFolderAccess and never create MJ: Resource Permissions rows.
        sideConversation.AdditionalData = JSON.stringify({
            growthCoach: {
                periodKey: params.PeriodKey,
                workstreamKey: GROWTH_COACH_WORKSTREAM_KEY,
                sideConversation: true,
            },
        });

        if (!(await sideConversation.Save())) {
            LogError(`[GrowthCoachService] Failed saving side conversation: ${sideConversation.LatestResult?.CompleteMessage ?? 'unknown'}`);
            return null;
        }

        const detail = await md.GetEntityObject<MJConversationDetailEntityExtended>(
            'MJ: Conversation Details',
            params.ContextUser
        );
        detail.NewRecord();
        if (typeof detail.MarkServerAuthoredReply === 'function') {
            detail.MarkServerAuthoredReply();
        }
        detail.ConversationID = sideConversation.ID;
        detail.Role = 'AI';
        detail.Status = 'Complete';
        detail.HiddenToUser = false;
        detail.AgentID = params.AgentID;
        detail.Message = params.Note.MarkdownBody;

        if (!(await detail.Save())) {
            LogError(`[GrowthCoachService] Failed saving coaching detail: ${detail.LatestResult?.CompleteMessage ?? 'unknown'}`);
            return null;
        }

        return sideConversation.ID;
    }

    private async recordPeriodOnRoutine(
        routine: MJUserRoutineEntity | null | undefined,
        periodKey: string,
        sideConvID: string
    ): Promise<void> {
        if (!routine) {
            return;
        }
        const existingCfg = routine.WakeConfigurationObject ?? {};
        const existingResume = existingCfg.resumeState ?? {};
        routine.WakeConfigurationObject = {
            ...existingCfg,
            resumeState: {
                ...existingResume,
                lastCoachingPeriodKey: periodKey,
                lastCoachingConversationID: sideConvID,
            },
        };
        if (routine.IsSaved && typeof routine.Save === 'function') {
            const saved = await routine.Save();
            if (!saved) {
                LogError(
                    `[GrowthCoachService] Failed persisting routine resumeState for ${routine.ID}: ${routine.LatestResult?.CompleteMessage ?? 'unknown'}`
                );
            }
        }
    }

    private buildFailureResult(
        periodKey: string,
        dedupeKey: string,
        resultCode: GrowthCoachRunResultCode,
        reason: string
    ): GrowthCoachRunResult {
        return {
            Success: false,
            ResultCode: resultCode,
            PeriodKey: periodKey,
            DedupeKey: dedupeKey,
            Deduplicated: false,
            SideConversationID: null,
            SideConversationTitle: null,
            ParentConversationID: null,
            Note: null,
            Telemetry: null,
            Reason: reason,
        };
    }
}
