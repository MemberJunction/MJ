import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import {
    CHIEF_OF_STAFF_AGENT_NAME,
    BizAppsTaskRecordLike,
    BuildChiefOfStaffAgentContext,
    BuildTaskRecordKey,
    BuildCockpitScopeFilters,
    BuildPersonScopedTaskFilter,
    BuildOwnedRootTasksFilter,
    CalculateChiefOfStaffMetrics,
    ComputeTaskMetricPercent,
    GetTaskPriorityClass,
    IsApprovalRequest,
    PolicyGovernanceSummary,
    RequestSummaryItem,
    ResolvePersonTaskScope,
    TaskScopeQueryRunner,
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
        // Metric drives progress when a target exists: (3 - 0) / (12 - 0) = 25%, not the milestone ratio.
        expect(metrics.AveragePriorityProgress).toBe(25);
        expect(metrics.PriorityCards[0].EffectivePercentComplete).toBe(25);
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
                RequestTypeID: '44444444-0000-0000-0000-000000000001',
            },
            {
                ID: '33333333-0000-0000-0000-000000000002',
                Request: 'Want to tell me 2-3 things you are focused on this quarter?',
                Status: 'Requested',
                Priority: 50,
                RequestedAt: '2026-10-24T12:05:00.000Z',
                ExpiresAt: null,
                RequestType: 'Information',
                RequestTypeID: '44444444-0000-0000-0000-000000000002',
            },
        ];

        expect(IsApprovalRequest(requests[0])).toBe(true);
        expect(IsApprovalRequest(requests[1])).toBe(false);
        // Classification is by the RequestType name only; no request-type id is hardcoded in the cockpit.
        expect(IsApprovalRequest({ RequestType: 'information', RequestTypeID: null })).toBe(false);
        expect(IsApprovalRequest({ RequestType: null, RequestTypeID: '44444444-0000-0000-0000-000000000002' })).toBe(true);

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

describe('ComputeTaskMetricPercent', () => {
    it('returns progress toward an Up target measured from the baseline', () => {
        const task = makeBaseTask({ BaselineValue: 0, TargetValue: 12, CurrentValue: 3, MetricDirection: 'Up' });
        expect(ComputeTaskMetricPercent(task)).toBe(25);
    });

    it('returns progress toward a Down target (reduce from baseline)', () => {
        const task = makeBaseTask({ BaselineValue: 100, TargetValue: 50, CurrentValue: 75, MetricDirection: 'Down' });
        expect(ComputeTaskMetricPercent(task)).toBe(50);
    });

    it('returns null when the task has no target or the target equals the baseline', () => {
        expect(ComputeTaskMetricPercent(makeBaseTask({ TargetValue: null, CurrentValue: 3 }))).toBeNull();
        expect(ComputeTaskMetricPercent(makeBaseTask({ BaselineValue: 12, TargetValue: 12, CurrentValue: 3 }))).toBeNull();
    });

    it('clamps overshoot and regression to the 0-100 range', () => {
        expect(ComputeTaskMetricPercent(makeBaseTask({ BaselineValue: 0, TargetValue: 10, CurrentValue: 14 }))).toBe(100);
        expect(ComputeTaskMetricPercent(makeBaseTask({ BaselineValue: 0, TargetValue: 10, CurrentValue: -2 }))).toBe(0);
    });
});

describe('CalculateChiefOfStaffMetrics progress sources and scoping', () => {
    it('falls back to milestone completion when the objective has no metric target', () => {
        const parent = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000020',
            TargetValue: null,
            CurrentValue: null,
            BaselineValue: null,
        });
        const done = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000021',
            ParentID: parent.ID,
            Status: 'Completed',
            PercentComplete: 100,
            TargetValue: null,
            CurrentValue: null,
        });
        const open = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000022',
            ParentID: parent.ID,
            Status: 'Open',
            PercentComplete: 0,
            TargetValue: null,
            CurrentValue: null,
        });
        const metrics = CalculateChiefOfStaffMetrics([parent, done, open], [], []);
        expect(metrics.PriorityCards[0].EffectivePercentComplete).toBe(50);
    });

    it('shows no cards when no root task qualifies as a priority objective', () => {
        const plainRoot = makeBaseTask({
            ID: '11111111-0000-0000-0000-000000000030',
            Name: 'Renew parking pass',
            IsPriority: null,
            Type: 'General',
            TaskType: null,
            HealthStatus: null,
            PlanningPeriod: null,
        });
        const metrics = CalculateChiefOfStaffMetrics([plainRoot], [], []);
        expect(metrics.PriorityObjectiveCount).toBe(0);
        expect(metrics.PriorityCards).toEqual([]);
    });
});

describe('BuildPersonScopedTaskFilter', () => {
    it('matches tasks the person created or is assigned to', () => {
        const filter = BuildPersonScopedTaskFilter('AAAAAAAA-0000-0000-0000-000000000001', [
            'BBBBBBBB-0000-0000-0000-000000000001',
            'BBBBBBBB-0000-0000-0000-000000000002',
        ]);
        expect(filter).toBe(
            "CreatedByPersonID = 'AAAAAAAA-0000-0000-0000-000000000001' OR ID IN ('BBBBBBBB-0000-0000-0000-000000000001', 'BBBBBBBB-0000-0000-0000-000000000002')",
        );
    });

    it('omits the assignment clause when the person has no assignments', () => {
        expect(BuildPersonScopedTaskFilter('AAAAAAAA-0000-0000-0000-000000000001', [])).toBe(
            "CreatedByPersonID = 'AAAAAAAA-0000-0000-0000-000000000001'",
        );
    });

    it('escapes single quotes in identifiers', () => {
        expect(BuildPersonScopedTaskFilter("x'y", ["a'b"], ["r'c"])).toBe(
            "CreatedByPersonID = 'x''y' OR ID IN ('a''b') OR RootParentID IN ('r''c')",
        );
    });

    it('includes every task under a root objective the person owns, whoever created the children', () => {
        const filter = BuildPersonScopedTaskFilter('AAAAAAAA-0000-0000-0000-000000000001', [], ['RRRRRRRR-0000-0000-0000-000000000001']);
        expect(filter).toBe(
            "CreatedByPersonID = 'AAAAAAAA-0000-0000-0000-000000000001' OR RootParentID IN ('RRRRRRRR-0000-0000-0000-000000000001')",
        );
    });
});

describe('BuildOwnedRootTasksFilter', () => {
    it('selects only root tasks the person created or is assigned to', () => {
        expect(BuildOwnedRootTasksFilter('AAAAAAAA-0000-0000-0000-000000000001', ['BBBBBBBB-0000-0000-0000-000000000001'])).toBe(
            "ParentID IS NULL AND (CreatedByPersonID = 'AAAAAAAA-0000-0000-0000-000000000001' OR ID IN ('BBBBBBBB-0000-0000-0000-000000000001'))",
        );
    });
});

describe('GetTaskPriorityClass', () => {
    it('maps the Tasks Priority value list onto the cockpit badge classes', () => {
        expect(GetTaskPriorityClass('Critical')).toBe('priority-critical');
        expect(GetTaskPriorityClass('High')).toBe('priority-high');
        expect(GetTaskPriorityClass('Medium')).toBe('priority-normal');
        expect(GetTaskPriorityClass('Low')).toBe('priority-low');
        expect(GetTaskPriorityClass(null)).toBe('priority-normal');
    });
});

describe('ResolvePersonTaskScope', () => {
    const PEOPLE_ENTITY_ID = 'EEEEEEEE-0000-0000-0000-000000000001';
    function makeRunner(responses: Record<string, Array<Record<string, string>>>): TaskScopeQueryRunner & { Calls: string[] } {
        const calls: string[] = [];
        return {
            Calls: calls,
            RunView: async <T>(params: { EntityName: string; ExtraFilter?: string }) => {
                calls.push(`${params.EntityName} :: ${params.ExtraFilter ?? ''}`);
                return { Success: true, Results: (responses[params.EntityName] ?? []) as T[] };
            },
        };
    }

    it('resolves the linked person and builds a filter over created, assigned and owned-tree tasks', async () => {
        const runner = makeRunner({
            'MJ_BizApps_Common: People': [{ ID: 'PPPPPPPP-0000-0000-0000-000000000001' }],
            'MJ_BizApps_Tasks: Task Assignments': [{ TaskID: 'TTTTTTTT-0000-0000-0000-000000000001' }],
            'MJ_BizApps_Tasks: Tasks': [{ ID: 'RRRRRRRR-0000-0000-0000-000000000001' }],
        });
        const scope = await ResolvePersonTaskScope(runner, 'UUUUUUUU-0000-0000-0000-000000000001', PEOPLE_ENTITY_ID);
        expect(scope.HasLinkedPerson).toBe(true);
        if (scope.HasLinkedPerson) {
            expect(scope.PersonID).toBe('PPPPPPPP-0000-0000-0000-000000000001');
            expect(scope.Filter).toBe(
                "CreatedByPersonID = 'PPPPPPPP-0000-0000-0000-000000000001' OR ID IN ('TTTTTTTT-0000-0000-0000-000000000001') OR RootParentID IN ('RRRRRRRR-0000-0000-0000-000000000001')",
            );
        }
        // Owned roots are looked up on the Tasks entity so children created by other people load with the objective.
        expect(runner.Calls[2]).toBe(
            "MJ_BizApps_Tasks: Tasks :: ParentID IS NULL AND (CreatedByPersonID = 'PPPPPPPP-0000-0000-0000-000000000001' OR ID IN ('TTTTTTTT-0000-0000-0000-000000000001'))",
        );
        expect(runner.Calls[0]).toBe("MJ_BizApps_Common: People :: LinkedUserID = 'UUUUUUUU-0000-0000-0000-000000000001'");
        // Task Assignments has no PersonID column: the assignee is the polymorphic (AssigneeEntityID, AssigneeRecordID) pair.
        expect(runner.Calls[1]).toBe(
            `MJ_BizApps_Tasks: Task Assignments :: AssigneeEntityID = '${PEOPLE_ENTITY_ID}' AND AssigneeRecordID = 'PPPPPPPP-0000-0000-0000-000000000001'`,
        );
    });

    it('reports the match source as LinkedUserID when the person is linked', async () => {
        const runner = makeRunner({
            'MJ_BizApps_Common: People': [{ ID: 'PPPPPPPP-0000-0000-0000-000000000001' }],
        });
        const scope = await ResolvePersonTaskScope(runner, 'UUUUUUUU-0000-0000-0000-000000000001', PEOPLE_ENTITY_ID, 'Paul@Example.com');
        expect(scope.HasLinkedPerson && scope.MatchedBy).toBe('LinkedUserID');
        // A linked person is found on the first query; the email fallback is never issued.
        expect(runner.Calls.filter((c) => c.startsWith('MJ_BizApps_Common: People')).length).toBe(1);
    });

    it('falls back to an exact, case-insensitive email match when no person is linked to the user', async () => {
        let peopleCalls = 0;
        const runner: TaskScopeQueryRunner & { Calls: string[] } = {
            Calls: [],
            RunView: async <T>(params: { EntityName: string; ExtraFilter?: string }) => {
                runner.Calls.push(`${params.EntityName} :: ${params.ExtraFilter ?? ''}`);
                if (params.EntityName === 'MJ_BizApps_Common: People') {
                    peopleCalls += 1;
                    // First call (LinkedUserID) finds nothing; second call (Email) finds the person.
                    return { Success: true, Results: (peopleCalls === 1 ? [] : [{ ID: 'PPPPPPPP-0000-0000-0000-000000000002' }]) as T[] };
                }
                return { Success: true, Results: [] as T[] };
            },
        };
        const scope = await ResolvePersonTaskScope(runner, 'UUUUUUUU-0000-0000-0000-000000000001', PEOPLE_ENTITY_ID, '  Paul@Example.com ');
        expect(scope.HasLinkedPerson).toBe(true);
        if (scope.HasLinkedPerson) {
            expect(scope.MatchedBy).toBe('Email');
            expect(scope.PersonID).toBe('PPPPPPPP-0000-0000-0000-000000000002');
        }
        expect(runner.Calls[0]).toBe("MJ_BizApps_Common: People :: LinkedUserID = 'UUUUUUUU-0000-0000-0000-000000000001'");
        expect(runner.Calls[1]).toBe("MJ_BizApps_Common: People :: LOWER(Email) = 'paul@example.com'");
        expect(runner.Calls[2]).toBe(
            `MJ_BizApps_Tasks: Task Assignments :: AssigneeEntityID = '${PEOPLE_ENTITY_ID}' AND AssigneeRecordID = 'PPPPPPPP-0000-0000-0000-000000000002'`,
        );
    });

    it('reports no linked person without querying assignments, and skips the email fallback when the user has no email', async () => {
        const runner = makeRunner({});
        const scope = await ResolvePersonTaskScope(runner, 'UUUUUUUU-0000-0000-0000-000000000001', PEOPLE_ENTITY_ID, '  ');
        expect(scope.HasLinkedPerson).toBe(false);
        expect(runner.Calls.length).toBe(1);
    });

    it('throws when the people lookup fails so the caller can surface the error', async () => {
        const runner: TaskScopeQueryRunner = {
            RunView: async () => ({ Success: false, Results: [], ErrorMessage: 'boom' }),
        };
        await expect(ResolvePersonTaskScope(runner, 'UUUUUUUU-0000-0000-0000-000000000001', PEOPLE_ENTITY_ID)).rejects.toThrow('boom');
    });
    it('escapes the person id and the entity id in the assignment filter', async () => {
        const runner = makeRunner({
            'MJ_BizApps_Common: People': [{ ID: "P'1" }],
        });
        await ResolvePersonTaskScope(runner, 'UUUUUUUU-0000-0000-0000-000000000001', "E'1");
        expect(runner.Calls[1]).toBe("MJ_BizApps_Tasks: Task Assignments :: AssigneeEntityID = 'E''1' AND AssigneeRecordID = 'P''1'");
    });
});

describe('BuildCockpitScopeFilters', () => {
    const USER = 'UUUUUUUU-0000-0000-0000-000000000001';
    const AGENT = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00';

    it('scopes policy, routines, and requests to the current user and the Chief of Staff agent', () => {
        const f = BuildCockpitScopeFilters(USER, AGENT);
        expect(f.Policy).toBe(`AgentID = '${AGENT}' AND UserID = '${USER}'`);
        expect(f.Routines).toBe(
            `UserID = '${USER}' AND (RoutineType = 'AgentWake' OR TargetID = '${AGENT}')`,
        );
        expect(f.Requests).toBe(
            `AgentID = '${AGENT}' AND RequestForUserID = '${USER}' AND (RequestType IS NULL OR RequestType <> 'Information')`,
        );
    });

    it('never produces a clause that is not bound to the user', () => {
        const f = BuildCockpitScopeFilters(USER, AGENT);
        for (const clause of [f.Policy, f.Routines, f.Requests]) {
            expect(clause).toContain(USER);
        }
    });

    it('escapes the user id', () => {
        expect(BuildCockpitScopeFilters("a'b", AGENT).Policy).toContain("UserID = 'a''b'");
    });
    it('escapes the agent id like any other bound value', () => {
        expect(BuildCockpitScopeFilters(USER, "x'y").Policy).toContain("AgentID = 'x''y'");
    });
});

describe('CHIEF_OF_STAFF_AGENT_NAME', () => {
    it('is the metadata name the cockpit resolves to an agent id at runtime', () => {
        expect(CHIEF_OF_STAFF_AGENT_NAME).toBe('Chief of Staff');
    });
});

describe('BuildTaskRecordKey', () => {
    const baseTask = {
        ID: 'task-1',
        ParentID: null,
        Name: 'Q4 plan',
        Description: null,
        Status: 'Open',
        Priority: null,
        IsPriority: null,
        HealthStatus: null,
        ConfidenceScore: null,
        PercentComplete: null,
        CheckInCadence: null,
        PlanningPeriod: null,
        BaselineValue: null,
        TargetValue: null,
        CurrentValue: null,
        UnitOfMeasure: null,
        MetricDirection: null,
        DueAt: null,
        LastCheckInAt: null,
        NextCheckInDueAt: null,
    } satisfies BizAppsTaskRecordLike;

    it('builds the key from the entity metadata rather than assuming a column named ID', () => {
        const entityInfo = { PrimaryKeys: [{ Name: 'TaskKey' }] } as unknown as EntityInfo;
        const task = { ...baseTask, TaskKey: 'tk-99' } as BizAppsTaskRecordLike;

        const key = BuildTaskRecordKey(entityInfo, task);

        expect(key.KeyValuePairs).toEqual([{ FieldName: 'TaskKey', Value: 'tk-99' }]);
    });

    it('carries every column of a composite key', () => {
        const entityInfo = { PrimaryKeys: [{ Name: 'TenantID' }, { Name: 'ID' }] } as unknown as EntityInfo;
        const task = { ...baseTask, TenantID: 'tenant-a' } as BizAppsTaskRecordLike;

        const key = BuildTaskRecordKey(entityInfo, task);

        expect(key.KeyValuePairs.map((kv) => kv.FieldName)).toEqual(['TenantID', 'ID']);
        expect(key.KeyValuePairs.map((kv) => kv.Value)).toEqual(['tenant-a', 'task-1']);
    });
});
