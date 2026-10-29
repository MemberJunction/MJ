/**
 * Pure, unit-testable helpers for the "My Chief of Staff" Executive Cockpit's
 * agent context + client tools.
 *
 * Core only: everything here reads core entities (`MJ: AI Agent User Policies`,
 * `MJ: User Routines`, `MJ: AI Agent Requests`). Business data such as priorities, tasks and
 * to-dos comes from Open Apps that extend the cockpit with registered panels
 * (see `chief-of-staff-panel.ts`); core never names an Open App's entities.
 *
 * 🚨 SAFETY BOUNDARY 🚨
 * The Chief of Staff Cockpit exposes ONLY navigation / tab-switch / search /
 * refresh / detail-view tools to the co-agent. DELIBERATELY NOT exposed as client tools
 * (mutations stay human-driven in the UI):
 * - Approving or rejecting `MJ: AI Agent Requests`
 * - Modifying or saving `MJ: AI Agent User Policies` governance toggles / thresholds
 * - Triggering "Wake Now" or pausing/resuming `MJ: User Routines`
 *
 * Published context exposes only aggregate counts, active tab/filter state, governance
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
 * The cockpit serves one agent, identified by its metadata name. The id is resolved at runtime
 * through `AIEngineBase.GetAgentByName`, never hardcoded.
 */
export const CHIEF_OF_STAFF_AGENT_NAME = 'Chief of Staff';

/** The cockpit's own tabs. Extension panels add tabs under their own keys. */
export type CoreChiefOfStaffTab = 'overview' | 'approvals-wakes' | 'governance';
export const CORE_CHIEF_OF_STAFF_TABS: readonly CoreChiefOfStaffTab[] = [
    'overview',
    'approvals-wakes',
    'governance',
] as const;
/** A tab key: one of the core tabs or the key of a registered extension tab panel. */
export type ChiefOfStaffTab = string;

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

/** The status label the cockpit shows for a routine: the entity's Status, or 'Fired' for a spent one-shot. */
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

export interface ChiefOfStaffMetrics {
    PendingApprovalCount: number;
    HighPriorityPendingCount: number;
    ActiveWakeRoutineCount: number;
    NextScheduledWakeAt: Date | null;
}

export interface ChiefOfStaffAgentContextInput {
    ActiveTab: ChiefOfStaffTab;
    SearchText: string;
    Metrics: ChiefOfStaffMetrics;
    Governance: PolicyGovernanceSummary;
    Routines: readonly RoutineSummaryItem[];
    PendingRequests: readonly RequestSummaryItem[];
    /** Fields reported by extension panels, merged in after the core fields (core keys win). */
    ExtensionContext?: AgentContextRecord;
}

export type AgentContextScalar = string | number | boolean | null;
export type AgentContextRecord = Record<
    string,
    AgentContextScalar | string[] | Record<string, AgentContextScalar>
>;

/**
 * Returns `true` when an `MJ: AI Agent Requests` row represents an actionable approval or
 * review request for the Executive Cockpit's Pending Approvals queue, and `false` when it
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

/** ExtraFilters for the cockpit's three core-entity queries. Every clause is bound to the current user: the cockpit never shows another user's Chief of Staff data. */
export interface CockpitScopeFilters {
    Policy: string;
    Routines: string;
    Requests: string;
}

export function BuildCockpitScopeFilters(currentUserId: string, chiefOfStaffAgentId: string): CockpitScopeFilters {
    const user = EscapeSQLString(currentUserId);
    const agent = EscapeSQLString(chiefOfStaffAgentId);
    return {
        Policy: `AgentID = '${agent}' AND UserID = '${user}'`,
        Routines: `UserID = '${user}' AND (RoutineType = 'AgentWake' OR TargetID = '${agent}')`,
        Requests: `AgentID = '${agent}' AND RequestForUserID = '${user}' AND (RequestType IS NULL OR RequestType <> 'Information')`,
    };
}


/** The cockpit's core counts: pending approvals and active wakes. */
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

    const core: AgentContextRecord = {
        Surface: 'ChiefOfStaffDashboard',
        ActiveTab: input.ActiveTab,
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
    // Extensions add their own fields; a core field is never overwritten by one.
    return { ...(input.ExtensionContext ?? {}), ...core };
}

/** Validates a tab parameter against the tabs the cockpit currently offers (core plus extension tabs). */
export function ValidateChiefOfStaffTabParam(
    raw: string | number | boolean | null | undefined,
    validTabs: readonly string[] = CORE_CHIEF_OF_STAFF_TABS,
): { ok: true; value: ChiefOfStaffTab } | { ok: false; result: AgentToolResult } {
    return ValidateEnumParam(raw, validTabs, 'tab');
}

export function ValidateSearchQueryParam(
    raw: string | number | boolean | null | undefined,
): { ok: true; value: string } | { ok: false; result: AgentToolResult } {
    return ValidateStringParam(raw, 'query');
}
