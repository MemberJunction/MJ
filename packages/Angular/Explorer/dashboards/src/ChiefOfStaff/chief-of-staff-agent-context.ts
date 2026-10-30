/**
 * Pure, unit-testable helpers for the Chief of Staff application's pages (Overview,
 * Approvals & Wakes, Governance): their agent context, client tools and policy drafts.
 *
 * Core only: everything here reads core entities (`MJ: AI Agent User Policies`,
 * `MJ: User Routines`, `MJ: AI Agent Requests`). Business data such as priorities, tasks and
 * to-dos comes from Open Apps that add their own nav items to the Chief of Staff application
 * through `NavItem.*` application settings; core never names an Open App's entities.
 *
 * 🚨 SAFETY BOUNDARY 🚨
 * The Chief of Staff pages expose ONLY navigation / search /
 * refresh / detail-view tools to the co-agent. DELIBERATELY NOT exposed as client tools
 * (mutations stay human-driven in the UI):
 * - Approving or rejecting `MJ: AI Agent Requests`
 * - Modifying or saving `MJ: AI Agent User Policies` governance toggles / thresholds
 * - Triggering "Wake Now" or pausing/resuming `MJ: User Routines`
 *
 * Published context exposes only aggregate counts, the current page and search, governance
 * mode summaries, and bounded display names (capped at 25) — never raw request payloads,
 * custom instructions overrides, or private message content.
 */

import type {
    MJAIAgentUserPolicyEntity,
    MJUserRoutineEntity,
    MJAIAgentRequestEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
    AGENT_CONTEXT_NAME_LIST_CAP,
    BoundNameList,
    ValidateEnumParam,
    ValidateStringParam,
    type AgentToolResult,
} from '../shared/agent-tool-validation';

/**
 * The pages serve one agent, identified by its metadata name. The id is resolved at runtime
 * through `AIEngineBase.GetAgentByName`, never hardcoded.
 */
export const CHIEF_OF_STAFF_AGENT_NAME = 'Chief of Staff';

/** The name of the Chief of Staff application whose nav items open the pages. */
export const CHIEF_OF_STAFF_APP_NAME = 'Chief of Staff';

/** The Chief of Staff application's own pages; each is one nav item. */
export type ChiefOfStaffPage = 'overview' | 'approvals-wakes' | 'governance';
export const CHIEF_OF_STAFF_PAGES: readonly ChiefOfStaffPage[] = [
    'overview',
    'approvals-wakes',
    'governance',
] as const;

/** Each page's nav item label; must match the application's `DefaultNavItems`. */
export const CHIEF_OF_STAFF_PAGE_LABELS: Readonly<Record<ChiefOfStaffPage, string>> = {
    overview: 'Overview',
    'approvals-wakes': 'Approvals & Wakes',
    governance: 'Governance',
};

/** Each page's Font Awesome icon; matches the application's `DefaultNavItems`. */
export const CHIEF_OF_STAFF_PAGE_ICONS: Readonly<Record<ChiefOfStaffPage, string>> = {
    overview: 'fa-solid fa-compass',
    'approvals-wakes': 'fa-solid fa-bell-concierge',
    governance: 'fa-solid fa-shield-halved',
};

export type PolicyStatusValue = MJAIAgentUserPolicyEntity['Status'];
export type PolicyCoordinationModeValue = MJAIAgentUserPolicyEntity['CoordinationMode'];
export type PolicyDataAccessModeValue = MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
export type PolicyEmailChannelModeValue = MJAIAgentUserPolicyEntity['EmailChannelMode'];
export type PolicyCalendarChannelModeValue = MJAIAgentUserPolicyEntity['CalendarChannelMode'];
export type PolicyPhoneChannelModeValue = MJAIAgentUserPolicyEntity['PhoneChannelMode'];
export type PolicyMessagingChannelModeValue = MJAIAgentUserPolicyEntity['MessagingChannelMode'];
export type RoutineStatusValue = MJUserRoutineEntity['Status'];
export type RequestStatusValue = MJAIAgentRequestEntity['Status'];

export interface RoutineSummaryItem {
    ID: string;
    Name: string;
    Status: RoutineStatusValue;
    ScheduleMode: MJUserRoutineEntity['ScheduleMode'];
    CronExpression: string | null;
    NextRunAt: Date | string | null;
    LastRunAt: Date | string | null;
    LastRunStatus: MJUserRoutineEntity['LastRunStatus'];
}

/** The status label the pages show for a routine: the entity's Status, or 'Fired' for a spent one-shot. */
export type RoutineDisplayStatusValue = RoutineSummaryItem['Status'] | 'Fired';

/**
 * True for a one-shot routine that has run and has no next time: the dispatcher disables a one-shot
 * once it fires, so "Disabled" here means "done", not "broken". A one-shot still waiting for its
 * time is not spent, whatever it has run before (a manual run keeps the schedule); a one-shot that
 * was disabled before ever running is just disabled; a recurring routine is never spent.
 */
export function IsSpentOneShotRoutine(routine: Pick<RoutineSummaryItem, 'ScheduleMode' | 'NextRunAt' | 'LastRunAt' | 'Status'>): boolean {
    return routine.ScheduleMode === 'OneShot'
        && routine.Status === 'Disabled'
        && routine.NextRunAt == null
        && routine.LastRunAt != null;
}

/** 'Fired' for a spent one-shot, otherwise the routine's own Status. */
export function RoutineDisplayStatus(routine: Pick<RoutineSummaryItem, 'ScheduleMode' | 'NextRunAt' | 'LastRunAt' | 'Status'>): RoutineDisplayStatusValue {
    return IsSpentOneShotRoutine(routine) ? 'Fired' : routine.Status;
}

/**
 * Display order for the wake schedule: routines with a next wake first, soonest first; then the
 * unscheduled (paused, or disabled before ever running); spent one-shots last, most recent first.
 * Returns a new array.
 */
export function SortRoutinesForDisplay<T extends Pick<RoutineSummaryItem, 'ScheduleMode' | 'NextRunAt' | 'LastRunAt' | 'Status'>>(routines: readonly T[]): T[] {
    const rank = (r: T): number => (IsSpentOneShotRoutine(r) ? 2 : r.NextRunAt != null ? 0 : 1);
    const time = (value: Date | string | null): number => {
        const parsed = ParseOptionalDate(value);
        return parsed ? parsed.getTime() : Number.POSITIVE_INFINITY;
    };
    return [...routines].sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 0) return time(a.NextRunAt) - time(b.NextRunAt);
        if (ra === 2) return time(b.LastRunAt) - time(a.LastRunAt);
        return 0;
    });
}

/**
 * An outbound email waiting for approval, as the email action records it in the request's
 * `Comments` (JSON with Operation / From / To / CCRecipients / Subject / Body).
 */
export interface EmailApprovalDraft {
    Operation: 'Send' | 'Reply' | 'Forward';
    From: string | null;
    To: string;
    CC: string[];
    Subject: string;
    Body: string;
}

/**
 * Reads the email draft out of an approval request's Comments. Returns null when the comments are
 * empty, not JSON, or not an email (a call brief, say), so callers can show the draft only when
 * there is one. An older payload without `Operation` counts as a `Send` when To and Subject exist.
 */
export function ParseEmailApprovalPayload(comments: string | null | undefined): EmailApprovalDraft | null {
    const text = comments?.trim();
    if (!text || !text.startsWith('{')) {
        return null;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const to = stringField(record, 'To');
    const subject = stringField(record, 'Subject');
    const body = stringField(record, 'Body');
    if (to == null || subject == null || body == null) {
        return null;
    }
    const operation = stringField(record, 'Operation');
    const op: EmailApprovalDraft['Operation'] = operation === 'Reply' || operation === 'Forward' ? operation : 'Send';
    const cc = Array.isArray(record['CCRecipients'])
        ? (record['CCRecipients'] as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        : [];
    return { Operation: op, From: stringField(record, 'From'), To: to, CC: cc, Subject: subject, Body: body };
}

/** The draft as plain text for a mail client: headers, a blank line, then the body. */
export function FormatEmailDraftForClipboard(draft: EmailApprovalDraft): string {
    const lines = [`To: ${draft.To}`];
    if (draft.CC.length > 0) {
        lines.push(`CC: ${draft.CC.join(', ')}`);
    }
    lines.push(`Subject: ${draft.Subject}`, '', draft.Body);
    return lines.join('\n');
}

function stringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' ? value : null;
}

export interface RequestSummaryItem {
    ID: string;
    Request: string;
    Status: RequestStatusValue;
    Priority: number;
    RequestedAt: Date | string;
    ExpiresAt: Date | string | null;
    RequestType?: MJAIAgentRequestEntity['RequestType'];
    RequestTypeID?: MJAIAgentRequestEntity['RequestTypeID'];
}

export interface PolicyGovernanceSummary {
    HasPolicyRecord: boolean;
    DisplayName: string;
    Status: PolicyStatusValue;
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
    CoordinationMode: PolicyCoordinationModeValue;
    DefaultDataAccessMode: PolicyDataAccessModeValue;
    EmailChannelMode: PolicyEmailChannelModeValue;
    CalendarChannelMode: PolicyCalendarChannelModeValue;
    PhoneChannelMode: PolicyPhoneChannelModeValue;
    MessagingChannelMode: PolicyMessagingChannelModeValue;
    AllowInterAgentCoordination: boolean;
    RequireApprovalForExternalComms: boolean;
    RequireApprovalForFinancials: boolean;
    RequireApprovalForDestructiveActions: boolean;
    AutoApproveAmountThreshold: number | null;
}

/** The Governance page's editable copy of the user's policy. */
export interface GovernancePolicyDraft {
    DisplayNameOverride: string;
    Status: PolicyStatusValue;
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
    CoordinationMode: PolicyCoordinationModeValue;
    DefaultDataAccessMode: PolicyDataAccessModeValue;
    EmailChannelMode: PolicyEmailChannelModeValue;
    CalendarChannelMode: PolicyCalendarChannelModeValue;
    PhoneChannelMode: PolicyPhoneChannelModeValue;
    MessagingChannelMode: PolicyMessagingChannelModeValue;
    AllowInterAgentCoordination: boolean;
    RequireApprovalForExternalComms: boolean;
    RequireApprovalForFinancials: boolean;
    RequireApprovalForDestructiveActions: boolean;
    AutoApproveAmountThreshold: number | null;
    InstructionsOverride: string;
}

/** The draft shown before the user has a policy record. */
export function CreateDefaultPolicyDraft(): GovernancePolicyDraft {
    return {
        DisplayNameOverride: 'Chief of Staff',
        Status: 'Active',
        OnboardingStatus: 'Completed',
        CoordinationMode: 'Coordinator',
        DefaultDataAccessMode: 'UserCeiling',
        EmailChannelMode: 'DraftOnly',
        CalendarChannelMode: 'ProposeWithApproval',
        PhoneChannelMode: 'Disabled',
        MessagingChannelMode: 'Enabled',
        AllowInterAgentCoordination: true,
        RequireApprovalForExternalComms: true,
        RequireApprovalForFinancials: true,
        RequireApprovalForDestructiveActions: true,
        AutoApproveAmountThreshold: 0,
        InstructionsOverride: '',
    };
}

/** A draft copied from the user's policy record, or the default draft when there is none. */
export function BuildPolicyDraftFromEntity(entity: MJAIAgentUserPolicyEntity | null): GovernancePolicyDraft {
    if (!entity) {
        return CreateDefaultPolicyDraft();
    }
    return {
        DisplayNameOverride: entity.DisplayNameOverride ?? '',
        Status: entity.Status,
        OnboardingStatus: entity.OnboardingStatus,
        CoordinationMode: entity.CoordinationMode,
        DefaultDataAccessMode: entity.DefaultDataAccessMode,
        EmailChannelMode: entity.EmailChannelMode,
        CalendarChannelMode: entity.CalendarChannelMode,
        PhoneChannelMode: entity.PhoneChannelMode,
        MessagingChannelMode: entity.MessagingChannelMode,
        AllowInterAgentCoordination: entity.AllowInterAgentCoordination,
        RequireApprovalForExternalComms: entity.RequireApprovalForExternalComms,
        RequireApprovalForFinancials: entity.RequireApprovalForFinancials,
        RequireApprovalForDestructiveActions: entity.RequireApprovalForDestructiveActions,
        AutoApproveAmountThreshold: entity.AutoApproveAmountThreshold,
        InstructionsOverride: entity.InstructionsOverride ?? '',
    };
}

/** The display name: the draft's override, or 'My Chief of Staff'. */
export function ChiefOfStaffDisplayName(draft: Pick<GovernancePolicyDraft, 'DisplayNameOverride'>): string {
    const override = draft.DisplayNameOverride.trim();
    return override.length > 0 ? override : 'My Chief of Staff';
}

/** The governance summary published in the agent context. */
export function BuildGovernanceSummary(draft: GovernancePolicyDraft, hasPolicyRecord: boolean): PolicyGovernanceSummary {
    return {
        HasPolicyRecord: hasPolicyRecord,
        DisplayName: ChiefOfStaffDisplayName(draft),
        Status: draft.Status,
        OnboardingStatus: draft.OnboardingStatus,
        CoordinationMode: draft.CoordinationMode,
        DefaultDataAccessMode: draft.DefaultDataAccessMode,
        EmailChannelMode: draft.EmailChannelMode,
        CalendarChannelMode: draft.CalendarChannelMode,
        PhoneChannelMode: draft.PhoneChannelMode,
        MessagingChannelMode: draft.MessagingChannelMode,
        AllowInterAgentCoordination: draft.AllowInterAgentCoordination,
        RequireApprovalForExternalComms: draft.RequireApprovalForExternalComms,
        RequireApprovalForFinancials: draft.RequireApprovalForFinancials,
        RequireApprovalForDestructiveActions: draft.RequireApprovalForDestructiveActions,
        AutoApproveAmountThreshold: draft.AutoApproveAmountThreshold,
    };
}

export interface ChiefOfStaffMetrics {
    PendingApprovalCount: number;
    HighPriorityPendingCount: number;
    ActiveWakeRoutineCount: number;
    NextScheduledWakeAt: Date | null;
}

export interface ChiefOfStaffAgentContextInput {
    Page: ChiefOfStaffPage;
    SearchText: string;
    Metrics: ChiefOfStaffMetrics;
    Governance: PolicyGovernanceSummary;
    Routines: readonly RoutineSummaryItem[];
    PendingRequests: readonly RequestSummaryItem[];
}

export type AgentContextScalar = string | number | boolean | null;
export type AgentContextRecord = Record<
    string,
    AgentContextScalar | string[] | Record<string, AgentContextScalar>
>;

/**
 * Returns `true` when an `MJ: AI Agent Requests` row represents an actionable approval or
 * review request for the Chief of Staff's Pending Approvals queue, and `false` when it
 * is a conversational `Information` turn created by `BaseAgent` when ending a chat turn.
 */
export function IsApprovalRequest(req: {
    RequestType?: MJAIAgentRequestEntity['RequestType'] | undefined;
    RequestTypeID?: MJAIAgentRequestEntity['RequestTypeID'] | undefined;
}): boolean {
    // The RequestType virtual field carries the type name; classify on it alone.
    const typeName = req.RequestType?.trim().toLowerCase() ?? '';
    return typeName !== 'information';
}

export function ParseOptionalDate(val: Date | string | null | undefined): Date | null {
    if (!val) {
        return null;
    }
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
}

/** ExtraFilters for the pages' three core-entity queries. Every clause is bound to the current user: the pages never show another user's Chief of Staff data. */
export interface ChiefOfStaffScopeFilters {
    Policy: string;
    Routines: string;
    Requests: string;
}

export function BuildChiefOfStaffScopeFilters(currentUserId: string, chiefOfStaffAgentId: string): ChiefOfStaffScopeFilters {
    const user = EscapeSQLString(currentUserId);
    const agent = EscapeSQLString(chiefOfStaffAgentId);
    return {
        Policy: `AgentID = '${agent}' AND UserID = '${user}'`,
        Routines: `UserID = '${user}' AND (RoutineType = 'AgentWake' OR TargetID = '${agent}')`,
        Requests: `AgentID = '${agent}' AND RequestForUserID = '${user}' AND (RequestType IS NULL OR RequestType <> 'Information')`,
    };
}


/** The core counts: pending approvals and active wakes. */
export function CalculateChiefOfStaffMetrics(
    routines: readonly RoutineSummaryItem[],
    requests: readonly RequestSummaryItem[],
): ChiefOfStaffMetrics {
    const pendingRequests = requests.filter(
        (r) => r.Status === 'Requested' && IsApprovalRequest(r),
    );
    const highPriorityPending = pendingRequests.filter((r) => r.Priority >= 51);

    const activeWakeRoutines = routines.filter((r) => r.Status === 'Active');
    let nextScheduledWakeAt: Date | null = null;
    for (const routine of activeWakeRoutines) {
        const nextRun = ParseOptionalDate(routine.NextRunAt);
        if (nextRun && (!nextScheduledWakeAt || nextRun.getTime() < nextScheduledWakeAt.getTime())) {
            nextScheduledWakeAt = nextRun;
        }
    }

    return {
        PendingApprovalCount: pendingRequests.length,
        HighPriorityPendingCount: highPriorityPending.length,
        ActiveWakeRoutineCount: activeWakeRoutines.length,
        NextScheduledWakeAt: nextScheduledWakeAt,
    };
}

export function BuildChiefOfStaffAgentContext(
    input: ChiefOfStaffAgentContextInput,
): AgentContextRecord {
    const routineNames = input.Routines.map((r) => `${r.Name} (${r.Status})`).filter((n) => !!n);
    const boundedRoutineNames = BoundNameList(routineNames, AGENT_CONTEXT_NAME_LIST_CAP);

    return {
        Surface: 'ChiefOfStaff',
        Page: input.Page,
        SearchText: input.SearchText,
        PendingApprovalCount: input.Metrics.PendingApprovalCount,
        HighPriorityPendingCount: input.Metrics.HighPriorityPendingCount,
        ActiveWakeRoutineCount: input.Metrics.ActiveWakeRoutineCount,
        NextScheduledWakeAt: input.Metrics.NextScheduledWakeAt
            ? input.Metrics.NextScheduledWakeAt.toISOString()
            : null,
        GovernanceSummary: {
            DisplayName: input.Governance.DisplayName,
            Status: input.Governance.Status,
            OnboardingStatus: input.Governance.OnboardingStatus,
            CoordinationMode: input.Governance.CoordinationMode,
            DefaultDataAccessMode: input.Governance.DefaultDataAccessMode,
            EmailChannelMode: input.Governance.EmailChannelMode,
            CalendarChannelMode: input.Governance.CalendarChannelMode,
            PhoneChannelMode: input.Governance.PhoneChannelMode,
            MessagingChannelMode: input.Governance.MessagingChannelMode,
            AllowInterAgentCoordination: input.Governance.AllowInterAgentCoordination,
            RequireApprovalForExternalComms: input.Governance.RequireApprovalForExternalComms,
            RequireApprovalForFinancials: input.Governance.RequireApprovalForFinancials,
            RequireApprovalForDestructiveActions:
                input.Governance.RequireApprovalForDestructiveActions,
            AutoApproveAmountThreshold: input.Governance.AutoApproveAmountThreshold,
        },
        VisibleWakeRoutineNames: boundedRoutineNames,
    };
}

/** Validates a page parameter against the Chief of Staff application's own pages. */
export function ValidateChiefOfStaffPageParam(
    raw: string | number | boolean | null | undefined,
): { ok: true; value: ChiefOfStaffPage } | { ok: false; result: AgentToolResult } {
    return ValidateEnumParam(raw, CHIEF_OF_STAFF_PAGES, 'page');
}

export function ValidateSearchQueryParam(
    raw: string | number | boolean | null | undefined,
): { ok: true; value: string } | { ok: false; result: AgentToolResult } {
    return ValidateStringParam(raw, 'query');
}
