import { describe, it, expect } from 'vitest';
import {
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
    IsApprovalRequest,
    PolicyGovernanceSummary,
    RequestSummaryItem,
    RoutineSummaryItem,
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

    it('scopes policy, routines, and requests to the current user and the Chief of Staff agent', () => {
        const f = BuildChiefOfStaffScopeFilters(USER, AGENT);
        expect(f.Policy).toBe(`AgentID = '${AGENT}' AND UserID = '${USER}'`);
        expect(f.Routines).toBe(
            `UserID = '${USER}' AND (RoutineType = 'AgentWake' OR TargetID = '${AGENT}')`,
        );
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

describe('Chief of Staff pages', () => {
    it('gives every page a nav item label and icon', () => {
        expect(CHIEF_OF_STAFF_PAGES.map((p) => CHIEF_OF_STAFF_PAGE_LABELS[p])).toEqual(['Overview', 'Approvals & Wakes', 'Governance']);
        for (const page of CHIEF_OF_STAFF_PAGES) {
            expect(CHIEF_OF_STAFF_PAGE_ICONS[page]).toMatch(/^fa-/);
        }
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
