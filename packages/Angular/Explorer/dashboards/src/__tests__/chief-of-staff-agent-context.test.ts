import { describe, it, expect } from 'vitest';
import {
    AgentDisplayName,
    CHIEF_OF_STAFF_AGENT_NAME,
    CHIEF_OF_STAFF_PAGES,
    CHIEF_OF_STAFF_PAGE_LABELS,
    CHIEF_OF_STAFF_PAGE_ICONS,
    BuildChiefOfStaffAgentContext,
    BuildChiefOfStaffScopeFilters,
    BuildGovernanceSummary,
    BuildPolicyDraftFromEntity,
    ChiefOfStaffDisplayName,
    CreateDefaultPolicyDraft,
    CalculateChiefOfStaffMetrics,
    EvaluateInstructionsOverrideSize,
    INSTRUCTIONS_OVERRIDE_WARNING_THRESHOLD,
    IsApprovalRequest,
    LEGACY_CHIEF_OF_STAFF_APP_NAME,
    MY_AGENTS_APP_NAME,
    MY_AGENTS_PREFERENCES_SETTING_KEY,
    DEFAULT_MY_AGENTS_PREFERENCES,
    IsSystemOrDemoCatalogAgent,
    NormalizeAgentIconClass,
    ParseMyAgentsDashboardPreferences,
    PartitionAgentRoster,
    PolicyGovernanceSummary,
    RequestSummaryItem,
    ResolveSelectableAgent,
    RoutineSummaryItem,
    SelectableAgentsForGovernance,
    SerializeMyAgentsDashboardPreferences,
    ValidateChiefOfStaffPageParam,
    ValidateSearchQueryParam,
    IsSpentOneShotRoutine,
    RoutineDisplayStatus,
    SortRoutinesForDisplay,
    ParseEmailApprovalPayload,
    FormatEmailDraftForClipboard,
} from '../ChiefOfStaff/chief-of-staff-agent-context';
import { AGENT_CONTEXT_NAME_LIST_CAP } from '../shared/agent-tool-validation';

function makeRoutine(overrides: Partial<RoutineSummaryItem>): RoutineSummaryItem {
    return {
        ID: '22222222-0000-0000-0000-000000000001',
        Name: 'Morning Executive Briefing',
        Status: 'Active',
        ScheduleMode: 'Recurring',
        CronExpression: '0 8 * * 1-5',
        NextRunAt: '2026-10-25T13:00:00.000Z',
        LastRunAt: null,
        LastRunStatus: null,
        ...overrides,
    };
}

function makeRequest(overrides: Partial<RequestSummaryItem>): RequestSummaryItem {
    return {
        ID: '33333333-0000-0000-0000-000000000001',
        Request: 'Approve external partner announcement draft',
        Status: 'Requested',
        Priority: 80,
        RequestedAt: '2026-10-24T12:00:00.000Z',
        ExpiresAt: null,
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
    it('counts pending approvals, high-priority ones, active wakes and the next wake', () => {
        const metrics = CalculateChiefOfStaffMetrics(
            [
                makeRoutine({ ID: 'R1', NextRunAt: '2026-10-26T13:00:00.000Z' }),
                makeRoutine({ ID: 'R2', NextRunAt: '2026-10-25T13:00:00.000Z' }),
                makeRoutine({ ID: 'R3', Status: 'Paused', NextRunAt: '2026-10-24T13:00:00.000Z' }),
            ],
            [
                makeRequest({ ID: 'Q1', Priority: 80 }),
                makeRequest({ ID: 'Q2', Priority: 20 }),
                makeRequest({ ID: 'Q3', Status: 'Approved' }),
            ],
        );
        expect(metrics.PendingApprovalCount).toBe(2);
        expect(metrics.HighPriorityPendingCount).toBe(1);
        expect(metrics.ActiveWakeRoutineCount).toBe(2);
        // A paused routine's earlier time does not count as the next wake.
        expect(metrics.NextScheduledWakeAt?.toISOString()).toBe('2026-10-25T13:00:00.000Z');
    });

    it('excludes conversational Information requests from PendingApprovalCount while keeping Approval requests', () => {
        const requests: RequestSummaryItem[] = [
            makeRequest({ RequestType: 'Approval', RequestTypeID: '44444444-0000-0000-0000-000000000001' }),
            makeRequest({
                ID: '33333333-0000-0000-0000-000000000002',
                Request: 'Want to tell me 2-3 things you are focused on this quarter?',
                Priority: 50,
                RequestType: 'Information',
                RequestTypeID: '44444444-0000-0000-0000-000000000002',
            }),
        ];

        expect(IsApprovalRequest(requests[0])).toBe(true);
        expect(IsApprovalRequest(requests[1])).toBe(false);
        // Classification is by the RequestType name only; no request-type id is hardcoded in the Chief of Staff pages.
        expect(IsApprovalRequest({ RequestType: 'information', RequestTypeID: null })).toBe(false);
        expect(IsApprovalRequest({ RequestType: null, RequestTypeID: '44444444-0000-0000-0000-000000000002' })).toBe(true);

        const metrics = CalculateChiefOfStaffMetrics([], requests);
        expect(metrics.PendingApprovalCount).toBe(1);
        expect(metrics.HighPriorityPendingCount).toBe(1);
    });

    it('has no next wake when nothing active is scheduled', () => {
        const metrics = CalculateChiefOfStaffMetrics([makeRoutine({ NextRunAt: null })], []);
        expect(metrics.ActiveWakeRoutineCount).toBe(1);
        expect(metrics.NextScheduledWakeAt).toBeNull();
    });
});

describe('BuildChiefOfStaffAgentContext', () => {
    const baseInput = () => ({
        Page: 'governance' as const,
        SearchText: 'Briefing',
        Metrics: CalculateChiefOfStaffMetrics([], []),
        Governance: makeDefaultGovernance(),
        Routines: [] as RoutineSummaryItem[],
        PendingRequests: [] as RequestSummaryItem[],
    });

    it('publishes bounded routine names, counts and the governance summary without leaking raw request text', () => {
        const routines = Array.from({ length: AGENT_CONTEXT_NAME_LIST_CAP + 4 }, (_, idx) =>
            makeRoutine({ ID: `R${idx}`, Name: `Wake ${idx + 1}` }),
        );
        const requests = [makeRequest({ Request: 'Sensitive private email draft body', Priority: 90 })];
        const ctx = BuildChiefOfStaffAgentContext({
            ...baseInput(),
            Metrics: CalculateChiefOfStaffMetrics(routines, requests),
            Routines: routines,
            PendingRequests: requests,
        });

        expect(ctx['Surface']).toBe('ChiefOfStaff');
        expect(ctx['Page']).toBe('governance');
        expect(ctx['PendingApprovalCount']).toBe(1);
        expect(ctx['ActiveWakeRoutineCount']).toBe(AGENT_CONTEXT_NAME_LIST_CAP + 4);
        expect((ctx['VisibleWakeRoutineNames'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect((ctx['GovernanceSummary'] as Record<string, unknown>)['EmailChannelMode']).toBe('DraftOnly');
        expect(JSON.stringify(ctx)).not.toContain('Sensitive private email draft body');
    });

    it('carries no BizApps fields of its own', () => {
        const ctx = BuildChiefOfStaffAgentContext(baseInput());
        expect(Object.keys(ctx).some((k) => /Priority(Objective|Progress)|Todo|HealthFilter/.test(k))).toBe(false);
    });
});

describe('Validation helpers', () => {
    it('accepts the Chief of Staff pages and rejects anything else', () => {
        for (const page of CHIEF_OF_STAFF_PAGES) {
            expect(ValidateChiefOfStaffPageParam(page)).toEqual({ ok: true, value: page });
        }
        expect(ValidateChiefOfStaffPageParam('priorities').ok).toBe(false);
        expect(ValidateChiefOfStaffPageParam(undefined).ok).toBe(false);
    });

    it('validates the search query parameter', () => {
        expect(ValidateSearchQueryParam('Q4').ok).toBe(true);
        expect(ValidateSearchQueryParam(123).ok).toBe(false);
    });
});

describe('BuildChiefOfStaffScopeFilters', () => {
    const USER = 'UUUUUUUU-0000-0000-0000-000000000001';
    const AGENT = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00';

    it('scopes policy, routines, and requests to the current user and the selected agent', () => {
        const f = BuildChiefOfStaffScopeFilters(USER, AGENT);
        expect(f.Policy).toBe(`AgentID = '${AGENT}' AND UserID = '${USER}'`);
        expect(f.Routines).toBe(`UserID = '${USER}' AND TargetID = '${AGENT}'`);
        expect(f.Requests).toBe(
            `AgentID = '${AGENT}' AND RequestForUserID = '${USER}' AND (RequestType IS NULL OR RequestType <> 'Information')`,
        );
    });

    it('never produces a clause that is not bound to the user', () => {
        const f = BuildChiefOfStaffScopeFilters(USER, AGENT);
        for (const clause of [f.Policy, f.Routines, f.Requests]) {
            expect(clause).toContain(USER);
        }
    });

    it('escapes the user id', () => {
        expect(BuildChiefOfStaffScopeFilters("a'b", AGENT).Policy).toContain("UserID = 'a''b'");
    });
    it('escapes the agent id like any other bound value', () => {
        expect(BuildChiefOfStaffScopeFilters(USER, "x'y").Policy).toContain("AgentID = 'x''y'");
    });

    it('builds user-scoped all-agent filters when selectedAgentId is null (Overview multi-instance mode)', () => {
        const all = BuildChiefOfStaffScopeFilters(USER, null);
        expect(all.Policy).toBe(`UserID = '${USER}'`);
        expect(all.Routines).toBe(`UserID = '${USER}'`);
        expect(all.Requests).toBe(
            `RequestForUserID = '${USER}' AND (RequestType IS NULL OR RequestType <> 'Information')`,
        );
    });
});

describe('CHIEF_OF_STAFF_AGENT_NAME', () => {
    it('is the metadata name the Chief of Staff pages resolve to an agent id at runtime', () => {
        expect(CHIEF_OF_STAFF_AGENT_NAME).toBe('Chief of Staff');
    });
});

describe('Spent one-shot routines read as fired, and sort below the live schedule', () => {
    function routine(overrides: Partial<RoutineSummaryItem>): RoutineSummaryItem {
        return {
            ID: 'R', Name: 'Wake', Status: 'Active', ScheduleMode: 'OneShot', CronExpression: null,
            NextRunAt: null, LastRunAt: null, LastRunStatus: null, ...overrides,
        };
    }

    it('a disabled one-shot that has run and has no next time is spent', () => {
        const r = routine({ Status: 'Disabled', LastRunAt: '2026-10-29T15:34:05Z' });
        expect(IsSpentOneShotRoutine(r)).toBe(true);
        expect(RoutineDisplayStatus(r)).toBe('Fired');
    });

    it('a one-shot still waiting for its time is not spent, whatever it has done before', () => {
        expect(IsSpentOneShotRoutine(routine({ NextRunAt: '2026-10-30T15:00:00Z' }))).toBe(false);
        expect(IsSpentOneShotRoutine(routine({ NextRunAt: '2026-10-30T15:00:00Z', LastRunAt: '2026-10-29T15:34:05Z' }))).toBe(false);
    });

    it('a disabled one-shot that never ran is just disabled, and a recurring routine is never spent', () => {
        const never = routine({ Status: 'Disabled' });
        expect(IsSpentOneShotRoutine(never)).toBe(false);
        expect(RoutineDisplayStatus(never)).toBe('Disabled');
        const daily = routine({ ScheduleMode: 'Recurring', CronExpression: '0 8 * * 1-5', Status: 'Disabled', LastRunAt: '2026-10-29T13:00:00Z' });
        expect(IsSpentOneShotRoutine(daily)).toBe(false);
        expect(RoutineDisplayStatus(daily)).toBe('Disabled');
    });

    it('sorts live routines by next wake, then the unscheduled, then spent one-shots most recent first', () => {
        const sorted = SortRoutinesForDisplay([
            routine({ ID: 'spent-old', Status: 'Disabled', LastRunAt: '2026-10-27T09:00:00Z' }),
            routine({ ID: 'paused', Status: 'Paused', ScheduleMode: 'Recurring', CronExpression: '0 8 * * *' }),
            routine({ ID: 'later', NextRunAt: '2026-11-02T15:00:00Z' }),
            routine({ ID: 'spent-new', Status: 'Disabled', LastRunAt: '2026-10-29T15:34:05Z' }),
            routine({ ID: 'soon', NextRunAt: '2026-10-30T15:00:00Z' }),
        ]);
        expect(sorted.map((r) => r.ID)).toEqual(['soon', 'later', 'paused', 'spent-new', 'spent-old']);
    });
});

describe('Email approval payload: the draft travels in the request Comments as JSON', () => {
    const comments = JSON.stringify({
        Operation: 'Send', From: 'paul.christmann@rasa.io', To: 'amith@bluecypress.io', CCRecipients: ['jimmy@rasa.io'],
        Subject: 'Q4 OKR status', Body: 'Hi Amith,\n\nOn track.\n\nPaul', MessageID: null,
    }, null, 2);

    it('parses an outbound email approval into its parts', () => {
        const draft = ParseEmailApprovalPayload(comments);
        expect(draft).toEqual({
            Operation: 'Send', From: 'paul.christmann@rasa.io', To: 'amith@bluecypress.io', CC: ['jimmy@rasa.io'],
            Subject: 'Q4 OKR status', Body: 'Hi Amith,\n\nOn track.\n\nPaul',
        });
    });

    it('returns null for empty, non-JSON, or non-email comments', () => {
        expect(ParseEmailApprovalPayload(null)).toBeNull();
        expect(ParseEmailApprovalPayload('')).toBeNull();
        expect(ParseEmailApprovalPayload('Please call Jane about the budget')).toBeNull();
        expect(ParseEmailApprovalPayload(JSON.stringify({ Recipient: 'Jane', Objective: 'budget' }))).toBeNull();
    });

    it('tolerates a missing CC list and an older payload without Operation when To and Subject are present', () => {
        const draft = ParseEmailApprovalPayload(JSON.stringify({ To: 'a@b.io', Subject: 'Hi', Body: 'x' }));
        expect(draft?.CC).toEqual([]);
        expect(draft?.Operation).toBe('Send');
        expect(draft?.From).toBeNull();
    });

    it('formats the draft for the clipboard as headers, a blank line, then the body', () => {
        const draft = ParseEmailApprovalPayload(comments);
        expect(draft).not.toBeNull();
        expect(FormatEmailDraftForClipboard(draft!)).toBe(
            'To: amith@bluecypress.io\nCC: jimmy@rasa.io\nSubject: Q4 OKR status\n\nHi Amith,\n\nOn track.\n\nPaul'
        );
    });

    it('omits the CC header when there is nobody on copy', () => {
        const draft = ParseEmailApprovalPayload(JSON.stringify({ To: 'a@b.io', Subject: 'Hi', Body: 'x' }));
        expect(FormatEmailDraftForClipboard(draft!)).toBe('To: a@b.io\nSubject: Hi\n\nx');
    });
});

describe('My Agents pages', () => {
    it('gives every page a nav item label and icon and exposes My Agents app name + legacy fallback', () => {
        expect(MY_AGENTS_APP_NAME).toBe('My Agents');
        expect(LEGACY_CHIEF_OF_STAFF_APP_NAME).toBe('Chief of Staff');
        expect(CHIEF_OF_STAFF_PAGES.map((p) => CHIEF_OF_STAFF_PAGE_LABELS[p])).toEqual([
            'Overview',
            'Approvals & Wakes',
            'Agent Channels',
            'Agents',
        ]);
        for (const page of CHIEF_OF_STAFF_PAGES) {
            expect(CHIEF_OF_STAFF_PAGE_ICONS[page]).toMatch(/^fa-/);
        }
        expect(NormalizeAgentIconClass('fa-robot')).toBe('fa-solid fa-robot');
        expect(NormalizeAgentIconClass('fa-regular fa-star')).toBe('fa-regular fa-star');
        expect(NormalizeAgentIconClass(null)).toBe('fa-solid fa-robot');
    });

    it('EvaluateInstructionsOverrideSize flags overrides over the 4,000-character threshold', () => {
        expect(EvaluateInstructionsOverrideSize(null)).toEqual({
            Length: 0,
            Threshold: INSTRUCTIONS_OVERRIDE_WARNING_THRESHOLD,
            ExceedsThreshold: false,
            PercentOfThreshold: 0,
        });
        expect(EvaluateInstructionsOverrideSize('x'.repeat(4000)).ExceedsThreshold).toBe(false);
        const oversized = EvaluateInstructionsOverrideSize('x'.repeat(4200));
        expect(oversized.ExceedsThreshold).toBe(true);
        expect(oversized.Length).toBe(4200);
        expect(oversized.PercentOfThreshold).toBe(105);
    });
});

describe('Policy drafts', () => {
    it('starts from the default draft when the user has no policy record', () => {
        expect(BuildPolicyDraftFromEntity(null)).toEqual(CreateDefaultPolicyDraft());
    });

    it('copies a policy record, turning null text fields into empty strings', () => {
        const entity = {
            ...CreateDefaultPolicyDraft(),
            DisplayNameOverride: null,
            InstructionsOverride: null,
            CoordinationMode: 'Autonomous',
            AutoApproveAmountThreshold: 250,
        } as unknown as Parameters<typeof BuildPolicyDraftFromEntity>[0];
        const draft = BuildPolicyDraftFromEntity(entity);
        expect(draft.DisplayNameOverride).toBe('');
        expect(draft.InstructionsOverride).toBe('');
        expect(draft.CoordinationMode).toBe('Autonomous');
        expect(draft.AutoApproveAmountThreshold).toBe(250);
    });

    it('names the Chief of Staff from the override, else "My Chief of Staff"', () => {
        expect(ChiefOfStaffDisplayName({ DisplayNameOverride: '  Ada  ' })).toBe('Ada');
        expect(ChiefOfStaffDisplayName({ DisplayNameOverride: '   ' })).toBe('My Chief of Staff');
    });

    it('summarizes the draft for the agent context without the standing instructions', () => {
        const draft = { ...CreateDefaultPolicyDraft(), InstructionsOverride: 'private standing instructions' };
        const summary = BuildGovernanceSummary(draft, true);
        expect(summary.HasPolicyRecord).toBe(true);
        expect(summary.DisplayName).toBe('Chief of Staff');
        expect(JSON.stringify(summary)).not.toContain('private standing instructions');
    });
});

describe('Multi-agent picker helpers (Chief of Staff + Software Factory)', () => {
    const COS_ID = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00';
    const FACTORY_ID = 'FAC70A11-0000-4000-8000-000000000001';
    const PLANNER_SUB_ID = 'FAC70A11-0000-4000-8000-000000000002';
    const DISABLED_ID = 'D15AB1ED-0000-4000-8000-000000000003';

    it('lists active top-level agents with Chief of Staff first and excludes child or disabled agents unless referenced', () => {
        const raw = [
            { ID: FACTORY_ID, Name: 'Software Factory', ParentID: null, Status: 'Active' },
            { ID: PLANNER_SUB_ID, Name: 'Planner', ParentID: FACTORY_ID, Status: 'Active' },
            { ID: DISABLED_ID, Name: 'Archived Agent', ParentID: null, Status: 'Disabled' },
            { ID: COS_ID, Name: 'Chief of Staff', ParentID: null, Status: 'Active' },
        ];

        const selectable = SelectableAgentsForGovernance(raw);
        expect(selectable.map((a) => a.Name)).toEqual(['Chief of Staff', 'Software Factory']);

        const withRef = SelectableAgentsForGovernance(raw, new Set([DISABLED_ID]));
        expect(withRef.map((a) => a.Name)).toEqual([
            'Chief of Staff',
            'Archived Agent',
            'Software Factory',
        ]);
    });

    it('resolves selectable agents by exact ID, exact name, or unique partial name', () => {
        const agents = [
            { ID: COS_ID, Name: 'Chief of Staff' },
            { ID: FACTORY_ID, Name: 'Software Factory' },
        ];

        expect(ResolveSelectableAgent(agents, FACTORY_ID.toLowerCase())?.Name).toBe('Software Factory');
        expect(ResolveSelectableAgent(agents, 'software factory')?.ID).toBe(FACTORY_ID);
        expect(ResolveSelectableAgent(agents, 'factory')?.ID).toBe(FACTORY_ID);
        expect(ResolveSelectableAgent(agents, 'nonexistent')).toBeNull();
    });

    it('derives display names and default drafts cleanly for non-Chief-of-Staff agents', () => {
        const factoryDraft = BuildPolicyDraftFromEntity(null, 'Software Factory');
        expect(factoryDraft.DisplayNameOverride).toBe('Software Factory');
        expect(AgentDisplayName({ DisplayNameOverride: '' }, 'Software Factory')).toBe('Software Factory');
        expect(AgentDisplayName({ DisplayNameOverride: 'Factory Bot' }, 'Software Factory')).toBe('Factory Bot');
        expect(AgentDisplayName({ DisplayNameOverride: '' }, 'Chief of Staff')).toBe('My Chief of Staff');

        const ctx = BuildChiefOfStaffAgentContext({
            Page: 'approvals-wakes',
            SearchText: '',
            SelectedAgentID: FACTORY_ID,
            SelectedAgentName: 'Software Factory',
            AvailableAgentNames: ['Chief of Staff', 'Software Factory'],
            Metrics: CalculateChiefOfStaffMetrics([], []),
            Governance: BuildGovernanceSummary(factoryDraft, false, 'Software Factory'),
            Routines: [],
            PendingRequests: [],
        });
        expect(ctx['SelectedAgentID']).toBe(FACTORY_ID);
        expect(ctx['SelectedAgentName']).toBe('Software Factory');
        expect(ctx['AvailableAgentNames']).toEqual(['Chief of Staff', 'Software Factory']);
    });

    it('surfaces personal derived Chief of Staff instances (Pepper primary, Cato secondary) first and suppresses unreferenced Required template', () => {
        const USER_ID = '11111111-0000-4000-8000-000000000099';
        const PEPPER_ID = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E11';
        const CATO_ID = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E22';
        const raw = [
            { ID: FACTORY_ID, Name: 'Software Factory', ParentID: null, Status: 'Active', InstantiationMode: 'None' },
            { ID: COS_ID, Name: 'Chief of Staff', ParentID: null, Status: 'Active', InstantiationMode: 'Required' },
            {
                ID: CATO_ID,
                Name: 'Cato',
                ParentID: null,
                BaseAgentID: COS_ID,
                OwnerUserID: USER_ID,
                IsPrimaryInstance: false,
                Status: 'Active',
            },
            {
                ID: PEPPER_ID,
                Name: 'Pepper',
                ParentID: null,
                BaseAgentID: COS_ID,
                OwnerUserID: USER_ID,
                IsPrimaryInstance: true,
                Status: 'Active',
            },
        ];

        const selectable = SelectableAgentsForGovernance(raw, undefined, USER_ID);
        expect(selectable.map((a) => a.Name)).toEqual(['Pepper', 'Cato', 'Software Factory']);
        expect(selectable[0].IsDerivedInstance).toBe(true);
        expect(selectable[0].IsPrimaryInstance).toBe(true);
        expect(selectable[0].IsOwnedByCurrentUser).toBe(true);
        expect(selectable[0].BaseAgentName).toBe('Chief of Staff');
        expect(selectable[1].IsDerivedInstance).toBe(true);
        expect(selectable[1].IsPrimaryInstance).toBeUndefined();

        const partitioned = PartitionAgentRoster(selectable);
        expect(partitioned.MyAgents.map((a) => a.Name)).toEqual(['Pepper', 'Cato']);
        expect(partitioned.SharedAgents.map((a) => a.Name)).toEqual(['Software Factory']);
    });

    it('excludes Sub-Agent delegates from standalone roster (unless referenced) and classifies System/Demo/Restricted shared agents', () => {
        const SUB_DB_ID = '50BA6E01-0000-4000-8000-000000000001';
        const DEMO_LOOP_ID = 'DE001009-0000-4000-8000-000000000002';
        const MEM_MGR_ID = '5E500001-0000-4000-8000-000000000003';
        const REALTIME_ID = 'AEA1710E-0000-4000-8000-000000000004';
        const RESEARCH_ID = 'AE5EAAC4-0000-4000-8000-000000000005';

        const raw = [
            {
                ID: SUB_DB_ID,
                Name: 'Database Research Agent',
                ParentID: null,
                Status: 'Active',
                InvocationMode: 'Sub-Agent',
            },
            {
                ID: DEMO_LOOP_ID,
                Name: 'Demo Loop Agent',
                ParentID: null,
                Status: 'Active',
                Category: 'Demo',
                InvocationMode: 'Any',
            },
            {
                ID: MEM_MGR_ID,
                Name: 'Memory Manager',
                ParentID: null,
                Status: 'Active',
                IsRestricted: true,
                InvocationMode: 'Top-Level',
            },
            {
                ID: REALTIME_ID,
                Name: 'Realtime Co-Agent',
                ParentID: null,
                Status: 'Active',
                Type: 'Realtime',
                InvocationMode: 'Any',
            },
            {
                ID: RESEARCH_ID,
                Name: 'Research Agent',
                ParentID: null,
                Status: 'Active',
                Category: 'Research',
                InstantiationMode: 'Optional',
                InvocationMode: 'Any',
            },
        ];

        const selectable = SelectableAgentsForGovernance(raw);
        // Sub-Agent is excluded outright
        expect(selectable.find((a) => a.ID === SUB_DB_ID)).toBeUndefined();
        // Specialists remain unmarked; Demo, Restricted, and Realtime are flagged IsSystemOrDemo
        expect(selectable.find((a) => a.ID === RESEARCH_ID)?.IsSystemOrDemo).toBeUndefined();
        expect(selectable.find((a) => a.ID === DEMO_LOOP_ID)?.IsSystemOrDemo).toBe(true);
        expect(selectable.find((a) => a.ID === MEM_MGR_ID)?.IsSystemOrDemo).toBe(true);
        expect(selectable.find((a) => a.ID === REALTIME_ID)?.IsSystemOrDemo).toBe(true);
        expect(IsSystemOrDemoCatalogAgent({ ID: 'x', Name: 'Pepper', BaseAgentID: COS_ID, IsRestricted: true })).toBe(
            false,
        );

        // If a Sub-Agent is explicitly referenced by an existing policy/request, it is preserved
        const withRef = SelectableAgentsForGovernance(raw, new Set([SUB_DB_ID]));
        expect(withRef.find((a) => a.ID === SUB_DB_ID)?.Name).toBe('Database Research Agent');
    });

    it('parses and serializes MyAgentsDashboardPreferences with clean defaults and enum sanitization', () => {
        expect(MY_AGENTS_PREFERENCES_SETTING_KEY).toBe('myAgents.dashboardPreferences');
        expect(ParseMyAgentsDashboardPreferences(null)).toEqual(DEFAULT_MY_AGENTS_PREFERENCES);
        expect(ParseMyAgentsDashboardPreferences('not-json')).toEqual(DEFAULT_MY_AGENTS_PREFERENCES);

        const serialized = SerializeMyAgentsDashboardPreferences({
            myAgentsExpanded: true,
            sharedExpanded: true,
            showSystemAndDemo: true,
            activeAgentSubTab: 'persona',
            selectedAgentId: FACTORY_ID,
            overviewStripDensity: 'compact',
            overviewCollapsedPanels: ['channels'],
        });
        expect(ParseMyAgentsDashboardPreferences(serialized)).toEqual({
            myAgentsExpanded: true,
            sharedExpanded: true,
            showSystemAndDemo: true,
            activeAgentSubTab: 'persona',
            selectedAgentId: FACTORY_ID,
            overviewStripDensity: 'compact',
            overviewCollapsedPanels: ['channels'],
        });

        const dirty = JSON.stringify({
            sharedExpanded: 'nope',
            activeAgentSubTab: 'bogus',
            overviewStripDensity: 'ultra-wide',
            overviewCollapsedPanels: ['wakes', 'invalid-panel'],
        });
        const sanitized = ParseMyAgentsDashboardPreferences(dirty);
        expect(sanitized.sharedExpanded).toBe(false);
        expect(sanitized.activeAgentSubTab).toBe('activity');
        expect(sanitized.overviewStripDensity).toBe('cards');
        expect(sanitized.overviewCollapsedPanels).toEqual(['wakes']);
    });
});
