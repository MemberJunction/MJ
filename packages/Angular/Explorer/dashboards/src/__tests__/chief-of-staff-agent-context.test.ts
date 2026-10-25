import { describe, it, expect } from 'vitest';
import {
    AGENT_REQUEST_TYPE_APPROVAL_ID,
    AGENT_REQUEST_TYPE_INFORMATION_ID,
    BizAppsTaskRecordLike,
    BuildChiefOfStaffAgentContext,
    CalculateChiefOfStaffMetrics,
    IsApprovalRequest,
    PolicyGovernanceSummary,
    RequestSummaryItem,
    ResolvePriorityObjectiveByIDOrName,
    RoutineSummaryItem,
    ValidateChiefOfStaffTabParam,
    ValidateHealthFilterParam,
    ValidateSearchQueryParam,
} from '../ChiefOfStaff/chief-of-staff-agent-context';
import { AGENT_CONTEXT_NAME_LIST_CAP } from '../shared/agent-tool-validation';

function makeBaseTask(overrides: Partial<BizAppsTaskRecordLike>): BizAppsTaskRecordLike {
    return {
        ID: '00000000-0000-0000-0000-000000000001',
        ParentID: null,
        Name: 'Launch Revised Platform — Q4 (12 Weeks)',
        Description: '12-week platform launch plan',
        Status: 'In Progress',
        Priority: 'High',
        PriorityTier: 'P1',
        IsPriority: true,
        HealthStatus: 'OnTrack',
        ConfidenceScore: 85,
        PercentComplete: null,
        CheckInCadence: 'Weekly',
        PlanningPeriod: '2026-Q4',
        BaselineValue: 0,
        TargetValue: 12,
        CurrentValue: 3,
        UnitOfMeasure: 'weeks',
        MetricDirection: 'Up',
        DueAt: '2027-01-17T00:00:00.000Z',
        LastCheckInAt: null,
        NextCheckInDueAt: '2026-10-31T00:00:00.000Z',
        Type: 'Priority Objective',
        ...overrides,
    };
}

function makeDefaultGovernance(): PolicyGovernanceSummary {
    return {
        HasPolicyRecord: true,
        DisplayName: 'My Chief of Staff',
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
        AutoApproveAmountThreshold: 250,
    };
}

describe('CalculateChiefOfStaffMetrics', () => {
    it('groups child milestones under priority objectives and computes progress and health', () => {
        const parent = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000001',
            Name: 'Launch Revised Platform — Q4 (12 Weeks)',
            HealthStatus: 'OnTrack',
            ConfidenceScore: 80,
        });
        const milestone1 = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000002',
            ParentID: parent.ID,
            Name: 'Week 3: Technical Design Complete',
            IsPriority: false,
            Status: 'Completed',
            PercentComplete: 100,
        });
        const milestone2 = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000003',
            ParentID: parent.ID,
            Name: 'Week 4: UI/UX Approved',
            IsPriority: false,
            Status: 'In Progress',
            PercentComplete: 25,
        });

        const routines: RoutineSummaryItem[] = [
            {
                ID: '22222222-0000-0000-0000-000000000001',
                Name: 'Morning Executive Briefing',
                Status: 'Active',
                ScheduleMode: 'Recurring',
                CronExpression: '0 8 * * 1-5',
                NextRunAt: '2026-10-25T13:00:00.000Z',
                LastRunAt: null,
                LastRunStatus: null,
            },
        ];

        const requests: RequestSummaryItem[] = [
            {
                ID: '33333333-0000-0000-0000-000000000001',
                Request: 'Approve external partner announcement draft',
                Status: 'Requested',
                Priority: 80,
                RequestedAt: '2026-10-24T12:00:00.000Z',
                ExpiresAt: null,
            },
        ];

        const now = new Date('2026-10-24T15:00:00.000Z');
        const metrics = CalculateChiefOfStaffMetrics(
            [parent, milestone1, milestone2],
            routines,
            requests,
            now,
        );

        expect(metrics.PriorityObjectiveCount).toBe(1);
        expect(metrics.SubtaskCount).toBe(2);
        expect(metrics.OnTrackCount).toBe(1);
        expect(metrics.AveragePriorityProgress).toBe(50);
        expect(metrics.AverageConfidenceScore).toBe(80);
        expect(metrics.PendingApprovalCount).toBe(1);
        expect(metrics.HighPriorityPendingCount).toBe(1);
        expect(metrics.ActiveWakeRoutineCount).toBe(1);
        expect(metrics.NextScheduledWakeAt?.toISOString()).toBe('2026-10-25T13:00:00.000Z');
        expect(metrics.PriorityCards[0].CompletedSubtaskCount).toBe(1);
        expect(metrics.PriorityCards[0].MetricProgressLabel).toBe('3 weeks / 12 weeks');
    });

    it('excludes conversational Information requests from PendingApprovalCount while keeping Approval requests', () => {
        const requests: RequestSummaryItem[] = [
            {
                ID: '33333333-0000-0000-0000-000000000001',
                Request: 'Approve external partner announcement draft',
                Status: 'Requested',
                Priority: 80,
                RequestedAt: '2026-10-24T12:00:00.000Z',
                ExpiresAt: null,
                RequestType: 'Approval',
                RequestTypeID: AGENT_REQUEST_TYPE_APPROVAL_ID,
            },
            {
                ID: '33333333-0000-0000-0000-000000000002',
                Request: 'Want to tell me 2-3 things you are focused on this quarter?',
                Status: 'Requested',
                Priority: 50,
                RequestedAt: '2026-10-24T12:05:00.000Z',
                ExpiresAt: null,
                RequestType: 'Information',
                RequestTypeID: AGENT_REQUEST_TYPE_INFORMATION_ID,
            },
        ];

        expect(IsApprovalRequest(requests[0])).toBe(true);
        expect(IsApprovalRequest(requests[1])).toBe(false);

        const metrics = CalculateChiefOfStaffMetrics([], [], requests);
        expect(metrics.PendingApprovalCount).toBe(1);
        expect(metrics.HighPriorityPendingCount).toBe(1);
    });

    it('recognizes Priority Objectives via TaskType/Type or child subtasks even when IsPriority column is absent', () => {
        const parent = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000010',
            Name: 'Launch Revised Platform — Q4 (12 Weeks)',
            IsPriority: null,
            Type: null,
            TaskType: 'Priority Objective',
            HealthStatus: 'OnTrack',
        });
        const step1 = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000011',
            ParentID: parent.ID,
            Name: 'Step 1: Finalize Technical Design',
            IsPriority: null,
            Type: null,
            TaskType: 'General',
            HealthStatus: null,
            Status: 'Open',
            PercentComplete: 0,
        });

        const metrics = CalculateChiefOfStaffMetrics([parent, step1], [], []);
        expect(metrics.PriorityObjectiveCount).toBe(1);
        expect(metrics.SubtaskCount).toBe(1);
        expect(metrics.PriorityCards[0].Task.ID).toBe(parent.ID);
        expect(metrics.PriorityCards[0].Subtasks.length).toBe(1);
    });
});

describe('BuildChiefOfStaffAgentContext', () => {
    it('publishes bounded names, counts, and governance summary without leaking raw request text', () => {
        const tasks: BizAppsTaskRecordLike[] = Array.from(
            { length: AGENT_CONTEXT_NAME_LIST_CAP + 4 },
            (_, idx) =>
                makeBaseTask({
                    ID: `00000000-0000-0000-0000-${(idx + 1).toString().padStart(12, '0')}`,
                    Name: `Priority Objective ${idx + 1}`,
                }),
        );
        const metrics = CalculateChiefOfStaffMetrics(tasks, [], []);

        const ctx = BuildChiefOfStaffAgentContext({
            ActiveTab: 'priorities',
            SearchText: 'Platform',
            HealthFilter: 'OnTrack',
            Metrics: metrics,
            Governance: makeDefaultGovernance(),
            Routines: [],
            PendingRequests: [
                {
                    ID: '33333333-0000-0000-0000-000000000001',
                    Request: 'Sensitive private email draft body',
                    Status: 'Requested',
                    Priority: 90,
                    RequestedAt: '2026-10-24T12:00:00.000Z',
                    ExpiresAt: null,
                },
            ],
        });

        expect(ctx['Surface']).toBe('ChiefOfStaffDashboard');
        expect(ctx['ActiveTab']).toBe('priorities');
        expect(ctx['HealthFilter']).toBe('OnTrack');
        expect((ctx['VisiblePriorityObjectiveNames'] as string[]).length).toBe(
            AGENT_CONTEXT_NAME_LIST_CAP,
        );
        expect(ctx['VisiblePriorityObjectiveNamesTruncated']).toBe(true);
        expect(ctx['VisiblePriorityObjectiveNamesTotal']).toBe(AGENT_CONTEXT_NAME_LIST_CAP + 4);
        expect(JSON.stringify(ctx)).not.toContain('Sensitive private email draft body');
    });
});

describe('Validation & Resolution Helpers', () => {
    it('validates tab, health filter, and search query parameters tolerantly', () => {
        expect(ValidateChiefOfStaffTabParam('governance')).toEqual({
            ok: true,
            value: 'governance',
        });
        expect(ValidateChiefOfStaffTabParam('invalid').ok).toBe(false);

        expect(ValidateHealthFilterParam('AtRisk')).toEqual({
            ok: true,
            value: 'AtRisk',
        });
        expect(ValidateHealthFilterParam('unknown').ok).toBe(false);

        expect(ValidateSearchQueryParam('Q4').ok).toBe(true);
        expect(ValidateSearchQueryParam(123).ok).toBe(false);
    });

    it('resolves priority objectives by ID, exact name, or unambiguous partial name', () => {
        const metrics = CalculateChiefOfStaffMetrics(
            [
                makeBaseTask({
                    ID: '11111111-0000-0000-0000-000000000001',
                    Name: 'Launch Revised Platform — Q4',
                }),
                makeBaseTask({
                    ID: '11111111-0000-0000-0000-000000000002',
                    Name: 'Expand Enterprise Partner Network',
                }),
            ],
            [],
            [],
        );

        const byId = ResolvePriorityObjectiveByIDOrName(
            metrics.PriorityCards,
            '11111111-0000-0000-0000-000000000001',
        );
        expect(byId.ok).toBe(true);

        const byPartial = ResolvePriorityObjectiveByIDOrName(metrics.PriorityCards, 'partner');
        expect(byPartial.ok).toBe(true);
        if (byPartial.ok) {
            expect(byPartial.value.Task.Name).toBe('Expand Enterprise Partner Network');
        }

        const miss = ResolvePriorityObjectiveByIDOrName(metrics.PriorityCards, 'nonexistent');
        expect(miss.ok).toBe(false);
    });
});
