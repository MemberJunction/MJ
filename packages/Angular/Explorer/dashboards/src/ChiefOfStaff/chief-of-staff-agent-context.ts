/**
 * Pure, unit-testable helpers for the "My Chief of Staff" Executive Cockpit's
 * agent context + client tools.
 *
 * 🚨 SAFETY BOUNDARY 🚨
 * The Chief of Staff Cockpit exposes ONLY navigation / tab-switch / filter / search /
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
import { CompositeKey, type EntityInfo, type RunViewParams } from '@memberjunction/core';
import { EscapeSQLString, GroupByUUID, UUIDsEqual } from '@memberjunction/global';
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

export type ChiefOfStaffTab = 'overview' | 'priorities' | 'approvals-wakes' | 'governance';
export const VALID_CHIEF_OF_STAFF_TABS: readonly ChiefOfStaffTab[] = [
    'overview',
    'priorities',
    'approvals-wakes',
    'governance',
] as const;

export type TaskHealthStatus = 'OnTrack' | 'AtRisk' | 'OffTrack' | 'Completed' | 'Paused';
export type HealthFilter = 'all' | TaskHealthStatus;
export const VALID_HEALTH_FILTERS: readonly HealthFilter[] = [
    'all',
    'OnTrack',
    'AtRisk',
    'OffTrack',
    'Completed',
    'Paused',
] as const;

export type PolicyStatusValue = MJAIAgentUserPolicyEntity['Status'];
export type PolicyCoordinationModeValue = MJAIAgentUserPolicyEntity['CoordinationMode'];
export type PolicyDataAccessModeValue = MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
export type PolicyEmailChannelModeValue = MJAIAgentUserPolicyEntity['EmailChannelMode'];
export type PolicyCalendarChannelModeValue = MJAIAgentUserPolicyEntity['CalendarChannelMode'];
export type PolicyPhoneChannelModeValue = MJAIAgentUserPolicyEntity['PhoneChannelMode'];
export type PolicyMessagingChannelModeValue = MJAIAgentUserPolicyEntity['MessagingChannelMode'];
export type RoutineStatusValue = MJUserRoutineEntity['Status'];
export type RequestStatusValue = MJAIAgentRequestEntity['Status'];

/**
 * Projection shape for rows returned from `MJ_BizApps_Tasks: Tasks` (`[__mj_BizAppsTasks].[vwTasks]`).
 */
export interface BizAppsTaskRecordLike {
    ID: string;
    ParentID: string | null;
    Name: string;
    Description: string | null;
    Status: string;
    Priority: string | null;
    IsPriority: boolean | number | null;
    HealthStatus: TaskHealthStatus | null;
    ConfidenceScore: number | null;
    PercentComplete: number | null;
    CheckInCadence: string | null;
    PlanningPeriod: string | null;
    BaselineValue: number | null;
    TargetValue: number | null;
    CurrentValue: number | null;
    UnitOfMeasure: string | null;
    MetricDirection: string | null;
    DueAt: Date | string | null;
    LastCheckInAt: Date | string | null;
    NextCheckInDueAt: Date | string | null;
    TypeID?: string | null;
    Type?: string | null;
    TaskType?: string | null;
}

/**
 * Grouped priority objective card with its child milestones/tasks and computed progress.
 */
export interface PriorityObjectiveCardViewModel {
    Task: BizAppsTaskRecordLike;
    Subtasks: BizAppsTaskRecordLike[];
    CompletedSubtaskCount: number;
    EffectivePercentComplete: number;
    EffectiveHealth: TaskHealthStatus;
    MetricProgressLabel: string | null;
    IsOverdue: boolean;
}

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
    TotalTaskCount: number;
    PriorityObjectiveCount: number;
    SubtaskCount: number;
    OnTrackCount: number;
    AtRiskCount: number;
    OffTrackCount: number;
    CompletedPriorityCount: number;
    AverageConfidenceScore: number | null;
    AveragePriorityProgress: number;
    PendingApprovalCount: number;
    HighPriorityPendingCount: number;
    ActiveWakeRoutineCount: number;
    NextScheduledWakeAt: Date | null;
    PriorityCards: PriorityObjectiveCardViewModel[];
}

export interface ChiefOfStaffAgentContextInput {
    ActiveTab: ChiefOfStaffTab;
    SearchText: string;
    HealthFilter: HealthFilter;
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

/**
 * Builds the primary key of a BizApps task from the entity's own primary key column(s) and the
 * in-memory row. Tasks is an OpenApp entity, so neither the column name nor the column count is
 * assumed; the same key feeds `OpenEntityRecord` and the `PrimaryKey` parameter of `Update Record`.
 */
export function BuildTaskRecordKey(entityInfo: EntityInfo, task: BizAppsTaskRecordLike): CompositeKey {
    return CompositeKey.FromEntityRecord(entityInfo, { ...task });
}

export function IsTaskPriorityObjective(task: BizAppsTaskRecordLike): boolean {
    if (task.IsPriority === true || task.IsPriority === 1) {
        return true;
    }
    const typeLabel = (task.Type ?? task.TaskType ?? '').toLowerCase();
    if (
        typeLabel.includes('priority') ||
        typeLabel.includes('objective') ||
        typeLabel.includes('okr')
    ) {
        return true;
    }
    return task.ParentID == null && (task.HealthStatus != null || task.PlanningPeriod != null);
}

export function NormalizeTaskHealth(task: BizAppsTaskRecordLike): TaskHealthStatus {
    if (task.Status === 'Completed' || task.Status === 'Done' || task.HealthStatus === 'Completed') {
        return 'Completed';
    }
    if (task.HealthStatus === 'AtRisk' || task.HealthStatus === 'OffTrack' || task.HealthStatus === 'Paused') {
        return task.HealthStatus;
    }
    return 'OnTrack';
}

/**
 * Percent progress from `BaselineValue` toward `TargetValue`, clamped to 0-100.
 * Honors `MetricDirection` implicitly: a Down target (target < baseline) measures reduction.
 * Returns null when there is no target or the target equals the baseline (no measurable span).
 */
export function ComputeTaskMetricPercent(task: BizAppsTaskRecordLike): number | null {
    if (task.TargetValue == null) {
        return null;
    }
    const baseline = task.BaselineValue ?? 0;
    const span = task.TargetValue - baseline;
    if (span === 0) {
        return null;
    }
    const current = task.CurrentValue ?? baseline;
    const raw = ((current - baseline) / span) * 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
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

/** OpenApp entity holding the person linked to the signed-in MJ user (`LinkedUserID`). */
export const BIZAPPS_PEOPLE_ENTITY_NAME = 'MJ_BizApps_Common: People';
/** OpenApp entity linking tasks to the people assigned to them. */
export const BIZAPPS_TASK_ASSIGNMENTS_ENTITY_NAME = 'MJ_BizApps_Tasks: Task Assignments';

/** CSS modifier for a task priority badge, keyed by the Tasks `Priority` value list (Critical/High/Medium/Low). */
export function GetTaskPriorityClass(priority: string | null): string {
    switch ((priority ?? '').toLowerCase()) {
        case 'critical':
            return 'priority-critical';
        case 'high':
            return 'priority-high';
        case 'low':
            return 'priority-low';
        default:
            return 'priority-normal';
    }
}

/** Minimal RunView surface the task-scope resolver needs; `RunView` from @memberjunction/core satisfies it. */
export interface TaskScopeQueryRunner {
    RunView<T>(params: RunViewParams): Promise<{ Success: boolean; Results: T[]; ErrorMessage?: string }>;
}

/** How the signed-in user was matched to a BizApps person. */
export type PersonMatchSource = 'LinkedUserID' | 'Email';

export type PersonTaskScope =
    | { HasLinkedPerson: false }
    | { HasLinkedPerson: true; PersonID: string; MatchedBy: PersonMatchSource; Filter: string };

/**
 * Resolve the BizApps person for the signed-in user and the filter that limits the Tasks query to work
 * that person created or is assigned to. Throws when a lookup fails so the caller can show the error.
 *
 * The person is matched by `LinkedUserID` first. When no person is linked and `currentUserEmail` is
 * given, an exact, case-insensitive match on the person's `Email` is used instead, so an
 * administrator-entered People record works without a manual link.
 *
 * `peopleEntityId` is the `MJ: Entities` ID of {@link BIZAPPS_PEOPLE_ENTITY_NAME}: Task Assignments has no
 * PersonID column, its assignee is the polymorphic (`AssigneeEntityID`, `AssigneeRecordID`) pair, so the
 * person is matched on both.
 */
export async function ResolvePersonTaskScope(
    runner: TaskScopeQueryRunner,
    currentUserId: string,
    peopleEntityId: string,
    currentUserEmail?: string | null,
): Promise<PersonTaskScope> {
    const match = await resolvePersonForUser(runner, currentUserId, currentUserEmail);
    if (!match) {
        return { HasLinkedPerson: false };
    }
    const assignedTaskIDs = await loadAssignedTaskIDs(runner, peopleEntityId, match.PersonID);
    return {
        HasLinkedPerson: true,
        PersonID: match.PersonID,
        MatchedBy: match.MatchedBy,
        Filter: BuildPersonScopedTaskFilter(match.PersonID, assignedTaskIDs),
    };
}

interface PersonMatch {
    PersonID: string;
    MatchedBy: PersonMatchSource;
}

/** The linked person, else the person whose email equals the user's, else null. */
async function resolvePersonForUser(
    runner: TaskScopeQueryRunner,
    currentUserId: string,
    currentUserEmail: string | null | undefined,
): Promise<PersonMatch | null> {
    const linked = await findPersonID(runner, `LinkedUserID = '${EscapeSQLString(currentUserId)}'`);
    if (linked) {
        return { PersonID: linked, MatchedBy: 'LinkedUserID' };
    }
    const email = (currentUserEmail ?? '').trim().toLowerCase();
    if (!email) {
        return null;
    }
    const byEmail = await findPersonID(runner, `LOWER(Email) = '${EscapeSQLString(email)}'`);
    return byEmail ? { PersonID: byEmail, MatchedBy: 'Email' } : null;
}

async function findPersonID(runner: TaskScopeQueryRunner, extraFilter: string): Promise<string | null> {
    const people = await runner.RunView<{ ID: string }>({
        EntityName: BIZAPPS_PEOPLE_ENTITY_NAME,
        ExtraFilter: extraFilter,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    });
    if (!people.Success) {
        throw new Error(people.ErrorMessage ?? 'Failed to resolve the linked person.');
    }
    return people.Results[0]?.ID ?? null;
}

async function loadAssignedTaskIDs(runner: TaskScopeQueryRunner, peopleEntityId: string, personID: string): Promise<string[]> {
    const assignments = await runner.RunView<{ TaskID: string }>({
        EntityName: BIZAPPS_TASK_ASSIGNMENTS_ENTITY_NAME,
        ExtraFilter: `AssigneeEntityID = '${EscapeSQLString(peopleEntityId)}' AND AssigneeRecordID = '${EscapeSQLString(personID)}'`,
        Fields: ['TaskID'],
        ResultType: 'simple',
    });
    if (!assignments.Success) {
        throw new Error(assignments.ErrorMessage ?? 'Failed to load task assignments.');
    }
    return assignments.Results.map((a) => a.TaskID).filter((id) => !!id);
}

/**
 * ExtraFilter for `MJ_BizApps_Tasks: Tasks` limiting rows to work the given person created or is assigned to.
 * `assignedTaskIDs` come from `MJ_BizApps_Tasks: Task Assignments` for the same person.
 */
export function BuildPersonScopedTaskFilter(personID: string, assignedTaskIDs: readonly string[]): string {
    const createdClause = `CreatedByPersonID = '${EscapeSQLString(personID)}'`;
    if (assignedTaskIDs.length === 0) {
        return createdClause;
    }
    const idList = assignedTaskIDs.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    return `${createdClause} OR ID IN (${idList})`;
}

export function FormatTaskMetricProgress(task: BizAppsTaskRecordLike): string | null {
    if (task.TargetValue == null && task.CurrentValue == null) {
        return null;
    }
    const unit = task.UnitOfMeasure ? ` ${task.UnitOfMeasure}` : '';
    const current = task.CurrentValue ?? task.BaselineValue ?? 0;
    if (task.TargetValue != null) {
        return `${current}${unit} / ${task.TargetValue}${unit}`;
    }
    return `${current}${unit}`;
}

export function CalculateChiefOfStaffMetrics(
    tasks: readonly BizAppsTaskRecordLike[],
    routines: readonly RoutineSummaryItem[],
    requests: readonly RequestSummaryItem[],
    now: Date = new Date(),
): ChiefOfStaffMetrics {
    const subtasksByParent = GroupByUUID(
        tasks.filter((t) => !!t.ParentID),
        (t) => t.ParentID,
    );
    const priorityTasks: BizAppsTaskRecordLike[] = [];

    for (const task of tasks) {
        const hasChildren = subtasksByParent.Has(task.ID);
        if (!task.ParentID && (IsTaskPriorityObjective(task) || hasChildren)) {
            priorityTasks.push(task);
        }
    }

    // Only qualifying objectives are shown; an empty list renders the tab's empty state rather than unrelated root tasks.
    const rootsToDisplay = priorityTasks;

    let onTrackCount = 0;
    let atRiskCount = 0;
    let offTrackCount = 0;
    let completedPriorityCount = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;
    let progressSum = 0;

    const priorityCards: PriorityObjectiveCardViewModel[] = rootsToDisplay.map((root) => {
        const children = subtasksByParent.Get(root.ID) ?? [];
        const completedChildren = children.filter(
            (c) => c.Status === 'Completed' || c.Status === 'Done' || (c.PercentComplete ?? 0) >= 100,
        ).length;

        const metricPercent = ComputeTaskMetricPercent(root);
        const rawPercent =
            metricPercent !== null
                ? metricPercent
                : typeof root.PercentComplete === 'number' && root.PercentComplete > 0
                ? root.PercentComplete
                : children.length > 0
                  ? Math.round((completedChildren / children.length) * 100)
                  : root.Status === 'Completed' || root.Status === 'Done'
                    ? 100
                    : 0;
        const effectivePercent = Math.max(0, Math.min(100, rawPercent));
        const effectiveHealth = NormalizeTaskHealth(root);

        if (effectiveHealth === 'OnTrack') onTrackCount++;
        else if (effectiveHealth === 'AtRisk') atRiskCount++;
        else if (effectiveHealth === 'OffTrack') offTrackCount++;
        else if (effectiveHealth === 'Completed') completedPriorityCount++;

        if (typeof root.ConfidenceScore === 'number' && Number.isFinite(root.ConfidenceScore)) {
            confidenceSum += root.ConfidenceScore;
            confidenceCount++;
        }
        progressSum += effectivePercent;

        const dueDate = ParseOptionalDate(root.DueAt);
        const isOverdue =
            dueDate !== null &&
            dueDate.getTime() < now.getTime() &&
            effectiveHealth !== 'Completed';

        return {
            Task: root,
            Subtasks: children,
            CompletedSubtaskCount: completedChildren,
            EffectivePercentComplete: effectivePercent,
            EffectiveHealth: effectiveHealth,
            MetricProgressLabel: FormatTaskMetricProgress(root),
            IsOverdue: isOverdue,
        };
    });

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

    const totalSubtasks = tasks.filter((t) => !!t.ParentID).length;

    return {
        TotalTaskCount: tasks.length,
        PriorityObjectiveCount: priorityCards.length,
        SubtaskCount: totalSubtasks,
        OnTrackCount: onTrackCount,
        AtRiskCount: atRiskCount,
        OffTrackCount: offTrackCount,
        CompletedPriorityCount: completedPriorityCount,
        AverageConfidenceScore:
            confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 10) / 10 : null,
        AveragePriorityProgress:
            priorityCards.length > 0 ? Math.round(progressSum / priorityCards.length) : 0,
        PendingApprovalCount: pendingRequests.length,
        HighPriorityPendingCount: highPriorityPending.length,
        ActiveWakeRoutineCount: activeWakeRoutines.length,
        NextScheduledWakeAt: nextScheduledWakeAt,
        PriorityCards: priorityCards,
    };
}

export function BuildChiefOfStaffAgentContext(
    input: ChiefOfStaffAgentContextInput,
): AgentContextRecord {
    const priorityNames = input.Metrics.PriorityCards.map((c) => c.Task.Name).filter((n) => !!n);
    const boundedPriorityNames = BoundNameList(priorityNames, AGENT_CONTEXT_NAME_LIST_CAP);

    const routineNames = input.Routines.map((r) => `${r.Name} (${r.Status})`).filter((n) => !!n);
    const boundedRoutineNames = BoundNameList(routineNames, AGENT_CONTEXT_NAME_LIST_CAP);

    const context: AgentContextRecord = {
        Surface: 'ChiefOfStaffDashboard',
        ActiveTab: input.ActiveTab,
        SearchText: input.SearchText,
        HealthFilter: input.HealthFilter,
        PriorityObjectiveCount: input.Metrics.PriorityObjectiveCount,
        SubtaskCount: input.Metrics.SubtaskCount,
        OnTrackCount: input.Metrics.OnTrackCount,
        AtRiskCount: input.Metrics.AtRiskCount,
        OffTrackCount: input.Metrics.OffTrackCount,
        CompletedPriorityCount: input.Metrics.CompletedPriorityCount,
        AveragePriorityProgressPercent: input.Metrics.AveragePriorityProgress,
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
        VisiblePriorityObjectiveNames: boundedPriorityNames,
        VisibleWakeRoutineNames: boundedRoutineNames,
    };

    if (priorityNames.length > boundedPriorityNames.length) {
        context['VisiblePriorityObjectiveNamesTruncated'] = true;
        context['VisiblePriorityObjectiveNamesTotal'] = priorityNames.length;
    }

    return context;
}

export function ValidateChiefOfStaffTabParam(
    raw: string | number | boolean | null | undefined,
): { ok: true; value: ChiefOfStaffTab } | { ok: false; result: AgentToolResult } {
    return ValidateEnumParam(raw, VALID_CHIEF_OF_STAFF_TABS, 'tab');
}

export function ValidateHealthFilterParam(
    raw: string | number | boolean | null | undefined,
): { ok: true; value: HealthFilter } | { ok: false; result: AgentToolResult } {
    return ValidateEnumParam(raw, VALID_HEALTH_FILTERS, 'health');
}

export function ValidateSearchQueryParam(
    raw: string | number | boolean | null | undefined,
): { ok: true; value: string } | { ok: false; result: AgentToolResult } {
    return ValidateStringParam(raw, 'query');
}

export function ResolvePriorityObjectiveByIDOrName(
    cards: readonly PriorityObjectiveCardViewModel[],
    rawRef: string | number | boolean | null | undefined,
): { ok: true; value: PriorityObjectiveCardViewModel } | { ok: false; error: string } {
    if (typeof rawRef !== 'string' || rawRef.trim().length === 0) {
        return {
            ok: false,
            error: `Provide a priority objective ID or name. ${availableObjectiveNames(cards)}`,
        };
    }
    const ref = rawRef.trim();
    const byId = cards.find((c) => UUIDsEqual(c.Task.ID, ref));
    if (byId) {
        return { ok: true, value: byId };
    }
    const byName = cards.find((c) => c.Task.Name.trim().toLowerCase() === ref.toLowerCase());
    if (byName) {
        return { ok: true, value: byName };
    }
    const partial = cards.filter((c) => c.Task.Name.toLowerCase().includes(ref.toLowerCase()));
    if (partial.length === 1) {
        return { ok: true, value: partial[0] };
    }
    if (partial.length > 1) {
        const names = partial
            .slice(0, AGENT_CONTEXT_NAME_LIST_CAP)
            .map((c) => c.Task.Name)
            .join(', ');
        return {
            ok: false,
            error: `'${ref}' matches multiple priority objectives: ${names}. Be more specific.`,
        };
    }
    return {
        ok: false,
        error: `No priority objective matches '${ref}'. ${availableObjectiveNames(cards)}`,
    };
}

function availableObjectiveNames(cards: readonly PriorityObjectiveCardViewModel[]): string {
    if (cards.length === 0) {
        return 'There are no priority objectives loaded.';
    }
    const names = cards.slice(0, AGENT_CONTEXT_NAME_LIST_CAP).map((c) => c.Task.Name);
    const suffix = cards.length > AGENT_CONTEXT_NAME_LIST_CAP ? ', …' : '';
    return `Available priority objectives: ${names.join(', ')}${suffix}`;
}
