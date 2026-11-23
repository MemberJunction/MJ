import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentSuggestionEntity,
    MJConversationDetailEntityExtended,
    MJConversationEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
    AssembleChiefOfStaffBriefingEnvelope,
    BuildTeamBriefingSection,
    FormatChiefOfStaffBriefingMarkdown,
    ResolveDirectReportsForUser,
} from '../ChiefOfStaffTeamBriefing';
import {
    BuildGrowthCoachDedupeKey,
    ComputeBiweeklyPeriodKey,
    DEFAULT_GROWTH_COACH_BOUNDS,
    FormatCoachingSideConversationTitle,
    GROWTH_COACH_BIWEEKLY_CRON,
    GROWTH_COACH_SKILL_NAME,
    GROWTH_COACH_WORKSTREAM_KEY,
    GrowthCoachEvidenceMoment,
    GrowthCoachService,
    GrowthCoachSourceProvider,
} from '../GrowthCoachService';
import type { BudgetLedgerReader } from '../BudgetEnforcementGuard';

const MANAGER_USER = new UserInfo(null, {
    ID: '11111111-1111-1111-1111-111111111111',
    Name: 'Alice Manager',
    Email: 'alice@example.com',
    IsActive: true,
    Type: 'User',
});

const IC_USER = new UserInfo(null, {
    ID: '22222222-2222-2222-2222-222222222222',
    Name: 'Bob IC',
    Email: 'bob@example.com',
    IsActive: true,
    Type: 'User',
});

const COS_AGENT_ID = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00';
const GROWTH_COACH_SKILL_ID = '2197EB38-86D4-4846-A2E9-336E87E20ABA';

class StubRunView extends RunView {
    private readonly handler: RunView['RunView'];

    public constructor(handler: RunView['RunView']) {
        super();
        this.handler = handler;
    }

    public override RunView: RunView['RunView'] = (params, contextUser) => this.handler(params, contextUser);
}

interface SavedConversationRecord {
    ID: string;
    Name: string;
    UserID: string;
    ParentID: string | null;
    DefaultAgentID: string | null;
    TypeID: string;
    Status: MJConversationEntity['Status'];
    ApplicationScope: MJConversationEntity['ApplicationScope'];
    ApplicationID: string | null;
    EnvironmentID: string;
    AdditionalData: string | null;
}

interface SavedDetailRecord {
    ID: string;
    ConversationID: string;
    Role: MJConversationDetailEntityExtended['Role'];
    Status: MJConversationDetailEntityExtended['Status'];
    HiddenToUser: boolean;
    AgentID: string | null;
    Message: string;
    MarkedServerAuthored: boolean;
}

interface SavedSuggestionRecord {
    ID: string;
    AgentID: string;
    UserID: string;
    Kind: MJAIAgentSuggestionEntity['Kind'];
    TargetKey: string;
    Summary: string;
    Status: MJAIAgentSuggestionEntity['Status'];
    OfferedAt: Date;
}

function makeInMemoryMetadataProvider(options?: {
    existingConversations?: SavedConversationRecord[];
    existingDetails?: SavedDetailRecord[];
    existingSuggestions?: SavedSuggestionRecord[];
    existingRoutines?: Array<{
        ID: string;
        UserID: string;
        TargetID: string;
        Status: MJUserRoutineEntity['Status'];
        WakeConfiguration: string | null;
        WakeConfigurationObject: MJUserRoutineEntity['WakeConfigurationObject'];
    }>;
    employees?: Array<{
        ID: string;
        FirstName: string;
        LastName: string;
        Email: string;
        Title: string | null;
        SupervisorID: string | null;
        Active: boolean;
    }>;
    users?: Array<{
        ID: string;
        EmployeeID: string | null;
        Email: string;
        IsActive: boolean;
    }>;
}) {
    const savedConversations: SavedConversationRecord[] = [...(options?.existingConversations ?? [])];
    const savedDetails: SavedDetailRecord[] = [...(options?.existingDetails ?? [])];
    const savedSuggestions: SavedSuggestionRecord[] = [...(options?.existingSuggestions ?? [])];
    const savedRoutines = [...(options?.existingRoutines ?? [])];
    const employees = options?.employees ?? [];
    const users = options?.users ?? [];
    let seq = 1;

    const runViewHandler: RunView['RunView'] = async (params) => {
        if (params.EntityName === 'MJ: Employees') {
            const filter = params.ExtraFilter ?? '';
            if (filter.includes('LOWER(Email)=LOWER(')) {
                const emailMatch = /LOWER\('([^']+)'\)/i.exec(filter)?.[1]?.toLowerCase() ?? '';
                const matched = employees.filter((e) => e.Active && e.Email.toLowerCase() === emailMatch);
                return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
            }
            if (filter.includes('SupervisorID=')) {
                const supMatch = /SupervisorID='([^']+)'/i.exec(filter)?.[1] ?? '';
                const matched = employees.filter((e) => e.Active && e.SupervisorID === supMatch);
                return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Users') {
            const filter = params.ExtraFilter ?? '';
            if (filter.includes('EmployeeID IN')) {
                const matched = users.filter((u) => u.IsActive && u.EmployeeID && filter.includes(u.EmployeeID));
                return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
            }
            const idMatch = /ID='([^']+)'/i.exec(filter)?.[1] ?? '';
            const matched = users.filter((u) => u.IsActive && u.ID === idMatch);
            return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: User Routines') {
            const filter = params.ExtraFilter ?? '';
            const userMatch = /UserID='([^']+)'/i.exec(filter)?.[1] ?? '';
            const matched = savedRoutines.filter((r) => r.UserID === userMatch);
            return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: AI Agent Suggestions') {
            const filter = params.ExtraFilter ?? '';
            const userMatch = /UserID='([^']+)'/i.exec(filter)?.[1] ?? '';
            const matched = savedSuggestions.filter((s) => s.UserID === userMatch);
            return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Conversations') {
            const filter = params.ExtraFilter ?? '';
            const userMatch = /UserID='([^']+)'/i.exec(filter)?.[1] ?? '';
            const parentMatch = /ParentID='([^']+)'/i.exec(filter)?.[1];
            const matched = savedConversations.filter((c) => {
                if (userMatch && c.UserID !== userMatch) return false;
                if (parentMatch !== undefined && c.ParentID !== parentMatch) return false;
                return true;
            });
            return { Success: true, Results: matched, RowCount: matched.length, TotalRowCount: matched.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Conversation Details') {
            return { Success: true, Results: savedDetails, RowCount: savedDetails.length, TotalRowCount: savedDetails.length, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
        }
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
    };

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new StubRunView(runViewHandler));

    const md = {
        EntityByName: (name: string) => ({ ID: `ent-${name}`, Name: name }),
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Conversations') {
                const record: SavedConversationRecord = {
                    ID: `conv-side-${seq++}`,
                    Name: '',
                    UserID: '',
                    ParentID: null,
                    DefaultAgentID: null,
                    TypeID: '',
                    Status: 'Available',
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: '',
                    AdditionalData: null,
                };
                return {
                    get ID() { return record.ID; },
                    set ID(v: string) { record.ID = v; },
                    get Name() { return record.Name; },
                    set Name(v: string) { record.Name = v; },
                    get UserID() { return record.UserID; },
                    set UserID(v: string) { record.UserID = v; },
                    get ParentID() { return record.ParentID; },
                    set ParentID(v: string | null) { record.ParentID = v; },
                    get DefaultAgentID() { return record.DefaultAgentID; },
                    set DefaultAgentID(v: string | null) { record.DefaultAgentID = v; },
                    get TypeID() { return record.TypeID; },
                    set TypeID(v: string) { record.TypeID = v; },
                    get Status() { return record.Status; },
                    set Status(v: MJConversationEntity['Status']) { record.Status = v; },
                    get ApplicationScope() { return record.ApplicationScope; },
                    set ApplicationScope(v: MJConversationEntity['ApplicationScope']) { record.ApplicationScope = v; },
                    get ApplicationID() { return record.ApplicationID; },
                    set ApplicationID(v: string | null) { record.ApplicationID = v; },
                    get EnvironmentID() { return record.EnvironmentID; },
                    set EnvironmentID(v: string) { record.EnvironmentID = v; },
                    get AdditionalData() { return record.AdditionalData; },
                    set AdditionalData(v: string | null) { record.AdditionalData = v; },
                    NewRecord: vi.fn(),
                    Save: vi.fn(async () => {
                        savedConversations.push({ ...record });
                        return true;
                    }),
                    LatestResult: null,
                };
            }
            if (entityName === 'MJ: Conversation Details') {
                const detail: SavedDetailRecord = {
                    ID: `det-${seq++}`,
                    ConversationID: '',
                    Role: 'AI',
                    Status: 'Complete',
                    HiddenToUser: false,
                    AgentID: null,
                    Message: '',
                    MarkedServerAuthored: false,
                };
                return {
                    get ID() { return detail.ID; },
                    get ConversationID() { return detail.ConversationID; },
                    set ConversationID(v: string) { detail.ConversationID = v; },
                    get Role() { return detail.Role; },
                    set Role(v: MJConversationDetailEntityExtended['Role']) { detail.Role = v; },
                    get Status() { return detail.Status; },
                    set Status(v: MJConversationDetailEntityExtended['Status']) { detail.Status = v; },
                    get HiddenToUser() { return detail.HiddenToUser; },
                    set HiddenToUser(v: boolean) { detail.HiddenToUser = v; },
                    get AgentID() { return detail.AgentID; },
                    set AgentID(v: string | null) { detail.AgentID = v; },
                    get Message() { return detail.Message; },
                    set Message(v: string) { detail.Message = v; },
                    NewRecord: vi.fn(),
                    MarkServerAuthoredReply: vi.fn(() => {
                        detail.MarkedServerAuthored = true;
                    }),
                    Save: vi.fn(async () => {
                        savedDetails.push({ ...detail });
                        return true;
                    }),
                    LatestResult: null,
                };
            }
            if (entityName === 'MJ: AI Agent Suggestions') {
                const sug: SavedSuggestionRecord = {
                    ID: `sug-${seq++}`,
                    AgentID: '',
                    UserID: '',
                    Kind: 'Rhythm',
                    TargetKey: '',
                    Summary: '',
                    Status: 'Offered',
                    OfferedAt: new Date(),
                };
                return {
                    get ID() { return sug.ID; },
                    get AgentID() { return sug.AgentID; },
                    set AgentID(v: string) { sug.AgentID = v; },
                    get UserID() { return sug.UserID; },
                    set UserID(v: string) { sug.UserID = v; },
                    get Kind() { return sug.Kind; },
                    set Kind(v: MJAIAgentSuggestionEntity['Kind']) { sug.Kind = v; },
                    get TargetKey() { return sug.TargetKey; },
                    set TargetKey(v: string) { sug.TargetKey = v; },
                    get Summary() { return sug.Summary; },
                    set Summary(v: string) { sug.Summary = v; },
                    get Status() { return sug.Status; },
                    set Status(v: MJAIAgentSuggestionEntity['Status']) { sug.Status = v; },
                    get OfferedAt() { return sug.OfferedAt; },
                    set OfferedAt(v: Date) { sug.OfferedAt = v; },
                    NewRecord: vi.fn(),
                    Save: vi.fn(async () => {
                        savedSuggestions.push({ ...sug });
                        return true;
                    }),
                    LatestResult: null,
                };
            }
            throw new Error(`Unexpected entity requested in mock: ${entityName}`);
        }),
    } as Partial<IMetadataProvider> as IMetadataProvider;

    return { md, savedConversations, savedDetails, savedSuggestions };
}

describe('Epic 4a Slice 2 — Team Briefing Section & Opt-In Growth Coach', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        GrowthCoachService.Instance.ClearDeduplicationCache();
    });

    describe('4.1 Team Section in Chief of Staff Briefing', () => {
        it('includes the Team section when the user has 1 or more direct reports and omits it when direct reports === 0', async () => {
            const { md } = makeInMemoryMetadataProvider({
                employees: [
                    {
                        ID: 'emp-alice',
                        FirstName: 'Alice',
                        LastName: 'Manager',
                        Email: 'alice@example.com',
                        Title: 'VP Engineering',
                        SupervisorID: null,
                        Active: true,
                    },
                    {
                        ID: 'emp-bob',
                        FirstName: 'Bob',
                        LastName: 'IC',
                        Email: 'bob@example.com',
                        Title: 'Staff Engineer',
                        SupervisorID: 'emp-alice',
                        Active: true,
                    },
                    {
                        ID: 'emp-carol',
                        FirstName: 'Carol',
                        LastName: 'Designer',
                        Email: 'carol@example.com',
                        Title: 'Principal Designer',
                        SupervisorID: 'emp-alice',
                        Active: true,
                    },
                    {
                        ID: 'emp-inactive',
                        FirstName: 'Former',
                        LastName: 'Report',
                        Email: 'former@example.com',
                        Title: 'Contractor',
                        SupervisorID: 'emp-alice',
                        Active: false,
                    },
                ],
                users: [
                    { ID: MANAGER_USER.ID, EmployeeID: 'emp-alice', Email: 'alice@example.com', IsActive: true },
                    { ID: IC_USER.ID, EmployeeID: 'emp-bob', Email: 'bob@example.com', IsActive: true },
                ],
            });

            // 1. Manager Alice has 2 active direct reports -> Team section included
            const managerReports = await ResolveDirectReportsForUser({ ContextUser: MANAGER_USER, MetadataProvider: md });
            expect(managerReports.DirectReports).toHaveLength(2);
            expect(managerReports.DirectReports.map((r) => r.Email)).toEqual(['bob@example.com', 'carol@example.com']);
            expect(managerReports.DirectReports[0]?.UserID).toBe(IC_USER.ID);

            const managerTeam = await BuildTeamBriefingSection({ ContextUser: MANAGER_USER, MetadataProvider: md });
            expect(managerTeam).not.toBeNull();
            expect(managerTeam?.DirectReportCount).toBe(2);
            expect(managerTeam?.Summary).toContain('2 direct reports');

            const managerEnvelope = AssembleChiefOfStaffBriefingEnvelope({
                HorizonDays: 7,
                Agent: { AgentID: COS_AGENT_ID, Name: 'Chief of Staff' },
                User: { UserID: MANAGER_USER.ID, Name: MANAGER_USER.Name, Email: MANAGER_USER.Email },
                Core: { PendingApprovals: [], ActiveRoutines: [], AgentChannels: [] },
                SkillBriefings: [],
                Team: managerTeam,
            });
            expect(managerEnvelope.Team).toBeDefined();
            expect(managerEnvelope.Team?.DirectReportCount).toBe(2);

            const managerMarkdown = FormatChiefOfStaffBriefingMarkdown(managerEnvelope);
            expect(managerMarkdown).toContain('## Team');
            expect(managerMarkdown).toContain('Bob IC');
            expect(managerMarkdown).toContain('Carol Designer');

            // 2. Individual contributor Bob has 0 direct reports -> Team section explicitly OMITTED
            const icTeam = await BuildTeamBriefingSection({ ContextUser: IC_USER, MetadataProvider: md });
            expect(icTeam).toBeNull();

            const icEnvelope = AssembleChiefOfStaffBriefingEnvelope({
                HorizonDays: 7,
                Agent: { AgentID: COS_AGENT_ID, Name: 'Chief of Staff' },
                User: { UserID: IC_USER.ID, Name: IC_USER.Name, Email: IC_USER.Email },
                Core: { PendingApprovals: [], ActiveRoutines: [], AgentChannels: [] },
                SkillBriefings: [],
                Team: icTeam,
            });
            expect('Team' in icEnvelope).toBe(false);
            expect(icEnvelope.Team).toBeUndefined();

            const icMarkdown = FormatChiefOfStaffBriefingMarkdown(icEnvelope);
            expect(icMarkdown).not.toContain('## Team');
        });
    });

    describe('4.2 Growth Coach Metadata, RequestedOnly & Onboarding Opt-In Guard', () => {
        it('ships Growth Coach skill as RequestedOnly, grants it on Chief of Staff, configures growth-coaching as biweekly High tier, and updates CoS prompt', () => {
            const repoRoot = path.resolve(__dirname, '../../../../..');
            const skillFile = path.join(repoRoot, 'metadata/ai-skills/.growth-coach-skill.json');
            const skillTemplateFile = path.join(repoRoot, 'metadata/ai-skills/templates/growth-coach.skill.md');
            const rhythmFile = path.join(repoRoot, 'metadata/rhythm-templates/.chief-of-staff-rhythm-templates.json');
            const cosAgentFile = path.join(repoRoot, 'metadata/agents/.chief-of-staff-agent.json');
            const cosPromptFile = path.join(repoRoot, 'metadata/prompts/templates/chief-of-staff/chief-of-staff.template.md');

            interface SkillMetadataRow {
                fields: {
                    Name: string;
                    ActivationMode: string;
                    Status: string;
                    Instructions: string;
                };
                primaryKey: { ID: string };
            }
            const skills = JSON.parse(fs.readFileSync(skillFile, 'utf8')) as SkillMetadataRow[];
            expect(skills).toHaveLength(1);
            expect(skills[0]?.fields.Name).toBe(GROWTH_COACH_SKILL_NAME);
            expect(skills[0]?.fields.ActivationMode).toBe('RequestedOnly');
            expect(skills[0]?.fields.Status).toBe('Active');
            expect(skills[0]?.fields.Instructions).toBe('@file:templates/growth-coach.skill.md');
            expect(fs.existsSync(skillTemplateFile)).toBe(true);

            interface RhythmMetadataRow {
                fields: {
                    WorkstreamKey: string;
                    SkillID: string | null;
                    DefaultCronExpression: string;
                    DefaultAgentConfigurationID: string | null;
                    OfferAt: string;
                };
            }
            const rhythms = JSON.parse(fs.readFileSync(rhythmFile, 'utf8')) as RhythmMetadataRow[];
            const growthRhythm = rhythms.find((r) => r.fields.WorkstreamKey === GROWTH_COACH_WORKSTREAM_KEY);
            expect(growthRhythm).toBeDefined();
            expect(growthRhythm?.fields.SkillID).toBe('@lookup:MJ: AI Skills.Name=Growth Coach');
            expect(growthRhythm?.fields.DefaultCronExpression).toBe(GROWTH_COACH_BIWEEKLY_CRON);
            expect(growthRhythm?.fields.DefaultAgentConfigurationID).toBe('@lookup:MJ: AI Configurations.Name=High Power');
            expect(growthRhythm?.fields.OfferAt).toBe('Both');

            interface AgentSkillGrantRow {
                fields: { AgentID: string; SkillID: string; Status: string };
                primaryKey: { ID: string };
            }
            const grantFile = path.join(repoRoot, 'metadata/ai-agent-skills/.chief-of-staff-growth-coach.json');
            const grants = JSON.parse(fs.readFileSync(grantFile, 'utf8')) as AgentSkillGrantRow[];
            expect(
                grants.some(
                    (s) =>
                        s.fields.AgentID === '@lookup:MJ: AI Agents.Name=Chief of Staff' &&
                        s.fields.SkillID === '@lookup:MJ: AI Skills.Name=Growth Coach' &&
                        s.fields.Status === 'Active'
                )
            ).toBe(true);

            const cosPrompt = fs.readFileSync(cosPromptFile, 'utf8');
            expect(cosPrompt).toContain('Team');
            expect(cosPrompt).toContain('Growth Coach');
            expect(cosPrompt).toContain('growth-coaching');
        });

        it('offers Growth Coach during onboarding without auto-enabling and strictly blocks execution for unopted users', async () => {
            const { md, savedConversations, savedSuggestions } = makeInMemoryMetadataProvider();
            const generatorSpy = vi.fn();

            // Offer during onboarding records 'Offered' only (AutoEnabled = false)
            const offer = await GrowthCoachService.Instance.OfferGrowthCoachDuringOnboarding({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                MetadataProvider: md,
            });
            expect(offer.Offered).toBe(true);
            expect(offer.AutoEnabled).toBe(false);
            expect(savedSuggestions).toHaveLength(1);
            expect(savedSuggestions[0]?.Status).toBe('Offered');
            expect(savedSuggestions[0]?.TargetKey).toBe(GROWTH_COACH_WORKSTREAM_KEY);

            // Unopted user attempting to run coaching is strictly rejected with zero LLM calls & zero conversations
            const blocked = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-bob',
                    UserID: IC_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                MetadataProvider: md,
                Generator: generatorSpy,
            });
            expect(blocked.Success).toBe(false);
            expect(blocked.ResultCode).toBe('OPT_IN_REQUIRED');
            expect(generatorSpy).not.toHaveBeenCalled();
            expect(savedConversations).toHaveLength(0);

            // Paused routine is also blocked
            const pausedRoutine = {
                ID: 'routine-paused',
                Status: 'Paused',
                WakeConfigurationObject: { workstreamKey: GROWTH_COACH_WORKSTREAM_KEY },
            } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;
            const pausedBlocked = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                Routine: pausedRoutine,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-bob',
                    UserID: IC_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                MetadataProvider: md,
                Generator: generatorSpy,
            });
            expect(pausedBlocked.Success).toBe(false);
            expect(pausedBlocked.ResultCode).toBe('OPT_IN_REQUIRED');
            expect(generatorSpy).not.toHaveBeenCalled();
        });
    });

    describe('4.2 Bounded Retrieval, Budget Controls, Period Deduplication & Private Side Thread', () => {
        it('enforces 14-day lookback window, per-source row caps, and character/token input caps across all 4 sources', async () => {
            const { md } = makeInMemoryMetadataProvider();
            const now = new Date('2026-11-21T16:00:00Z');
            const withinWindow = '2026-11-18T12:00:00Z';
            const outsideWindow = '2026-10-01T12:00:00Z'; // > 14 days old

            const sourceProvider: GrowthCoachSourceProvider = {
                ReadTasks: async () => [
                    { Source: 'tasks', RecordID: 'task-old', Title: 'Old Task', OccurredAtISO: outsideWindow, Excerpt: 'Stale' },
                    ...Array.from({ length: 10 }, (_, idx) => ({
                        Source: 'tasks' as const,
                        RecordID: `task-${idx}`,
                        Title: `Task ${idx}`,
                        OccurredAtISO: withinWindow,
                        Excerpt: 'X'.repeat(120),
                    })),
                ],
                ReadMeetingTranscripts: async () =>
                    Array.from({ length: 5 }, (_, idx) => ({
                        Source: 'meetings' as const,
                        RecordID: `mtg-${idx}`,
                        Title: `Meeting ${idx}`,
                        OccurredAtISO: withinWindow,
                        Excerpt: 'M'.repeat(150),
                    })),
                ReadWorkReports: async () =>
                    Array.from({ length: 4 }, (_, idx) => ({
                        Source: 'work_reports' as const,
                        RecordID: `wr-${idx}`,
                        Title: `15Five ${idx}`,
                        OccurredAtISO: withinWindow,
                        Excerpt: 'W'.repeat(140),
                    })),
                ReadAgentConversations: async () =>
                    Array.from({ length: 6 }, (_, idx) => ({
                        Source: 'conversations' as const,
                        RecordID: `conv-${idx}`,
                        Title: `CoS Thread ${idx}`,
                        OccurredAtISO: withinWindow,
                        Excerpt: 'C'.repeat(160),
                    })),
            };

            const { Moments, Telemetry } = await GrowthCoachService.Instance.RetrieveBoundedCoachingEvidence({
                ContextUser: IC_USER,
                Now: now,
                Bounds: {
                    LookbackDays: 14,
                    MaxTasksRows: 3,
                    MaxMeetingTranscriptRows: 2,
                    MaxWorkReportRows: 2,
                    MaxConversationRows: 2,
                    MaxCharsPerSource: 450,
                    MaxTotalInputChars: 1_100,
                    MaxTotalInputTokens: 275,
                },
                MetadataProvider: md,
                SourceProvider: sourceProvider,
            });

            expect(Moments.some((m) => m.RecordID === 'task-old')).toBe(false);
            expect(Telemetry.Sources.tasks.DroppedOutOfWindow).toBe(1);
            expect(Telemetry.Sources.tasks.DroppedByRowCap).toBe(7); // 10 in-window - MaxTasksRows(3)
            expect(Telemetry.TotalChars).toBeLessThanOrEqual(1_100);
            expect(Telemetry.EstimatedTokens).toBeLessThanOrEqual(275);
            expect(Telemetry.Truncated).toBe(true);
            expect(DEFAULT_GROWTH_COACH_BOUNDS.LookbackDays).toBe(14);
        });

        it('enforces existing agent budget controls before paid coaching generation', async () => {
            const { md, savedConversations } = makeInMemoryMetadataProvider();
            const generatorSpy = vi.fn();
            const now = new Date('2026-11-21T16:00:00Z');

            const sourceProvider: GrowthCoachSourceProvider = {
                ReadTasks: async () => [
                    {
                        Source: 'tasks',
                        RecordID: 't-1',
                        Title: 'Deliver Q4 Platform RFC',
                        OccurredAtISO: '2026-11-20T10:00:00Z',
                        Excerpt: 'Drafted architecture tradeoffs and reviewed with principal group. '.repeat(20),
                    },
                ],
                ReadMeetingTranscripts: async () => [],
                ReadWorkReports: async () => [],
                ReadAgentConversations: async () => [],
            };

            // 1. Exceeded PerUserPerDay USD budget via BudgetEnforcementGuard ledger reader
            const overBudgetLedger: BudgetLedgerReader = {
                ReadScopedUsage: async () => ({
                    Routine: { CostUsd: 0, WallClockMs: 0 },
                    UserDaily: { CostUsd: 10.5, WallClockMs: 1_000 },
                }),
            };
            const agentWithBudget = {
                ID: COS_AGENT_ID,
                Name: 'Chief of Staff',
                TypeConfiguration: JSON.stringify({
                    limits: {
                        Budgets: {
                            PerUserPerDay: { MaxCostUsd: 5.0 },
                        },
                    },
                }),
            } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

            const blockedByBudget = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                Agent: agentWithBudget,
                ExplicitOptIn: true,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-bob',
                    UserID: IC_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                Now: now,
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
                LedgerReader: overBudgetLedger,
            });

            expect(blockedByBudget.Success).toBe(false);
            expect(blockedByBudget.ResultCode).toBe('BUDGET_EXCEEDED');
            expect(generatorSpy).not.toHaveBeenCalled();
            expect(savedConversations).toHaveLength(0);

            // 2. Also enforces MaxTokensPerRun budget on the agent entity
            const tokenCappedAgent = {
                ID: COS_AGENT_ID,
                Name: 'Chief of Staff',
                MaxTokensPerRun: 10,
            } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

            const blockedByTokens = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                Agent: tokenCappedAgent,
                ExplicitOptIn: true,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-bob',
                    UserID: IC_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                Now: now,
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
                LedgerReader: {
                    ReadScopedUsage: async () => ({
                        Routine: { CostUsd: 0, WallClockMs: 0 },
                        UserDaily: { CostUsd: 0, WallClockMs: 0 },
                    }),
                },
            });

            expect(blockedByTokens.Success).toBe(false);
            expect(blockedByTokens.ResultCode).toBe('BUDGET_EXCEEDED');
            expect(generatorSpy).not.toHaveBeenCalled();
            expect(savedConversations).toHaveLength(0);
        });

        it('deduplicates per-user per-period replays/retries and writes Start/Stop/Continue evidence into a private ParentID side conversation', async () => {
            const { md, savedConversations, savedDetails } = makeInMemoryMetadataProvider();
            const nov21 = new Date('2026-11-21T16:00:00Z');
            const nov22 = new Date('2026-11-22T16:00:00Z'); // same biweekly period 2026-11-BW2
            const dec01 = new Date('2026-12-01T16:00:00Z'); // next biweekly period 2026-12-BW1

            expect(ComputeBiweeklyPeriodKey(nov21, 'UTC')).toBe('2026-11-BW2');
            expect(ComputeBiweeklyPeriodKey(nov22, 'UTC')).toBe('2026-11-BW2');
            expect(ComputeBiweeklyPeriodKey(dec01, 'UTC')).toBe('2026-12-BW1');
            expect(FormatCoachingSideConversationTitle(nov21, 'UTC')).toBe('Coaching — Nov 21');
            expect(BuildGrowthCoachDedupeKey(IC_USER.ID, '2026-11-BW2')).toBe(`${IC_USER.ID.toLowerCase()}:2026-11-BW2`);

            const sourceProvider: GrowthCoachSourceProvider = {
                ReadTasks: async () => [
                    { Source: 'tasks', RecordID: 't-101', Title: 'Shipped ParentID Isolation', OccurredAtISO: '2026-11-19T14:00:00Z', Excerpt: 'Completed migration and negative tests ahead of schedule.' },
                ],
                ReadMeetingTranscripts: async () => [
                    { Source: 'meetings', RecordID: 'm-202', Title: 'Architecture Review — Nov 18', OccurredAtISO: '2026-11-18T17:00:00Z', Excerpt: 'Took on 3 ad-hoc follow-ups mid-meeting without delegating.' },
                ],
                ReadWorkReports: async () => [
                    { Source: 'work_reports', RecordID: 'w-303', Title: 'Daily 15Five — Nov 20', OccurredAtISO: '2026-11-20T22:00:00Z', Excerpt: 'Highlighted strong cross-team clarity on PR reviews.' },
                ],
                ReadAgentConversations: async () => [
                    { Source: 'conversations', RecordID: 'c-404', Title: 'CoS Planning Check-In', OccurredAtISO: '2026-11-20T15:00:00Z', Excerpt: 'Refined weekly priorities before sprint close.' },
                ],
            };

            const generatorSpy = vi.fn(async ({ Moments }: { Moments: GrowthCoachEvidenceMoment[] }) => {
                const task = Moments.find((m) => m.RecordID === 't-101')!;
                const meeting = Moments.find((m) => m.RecordID === 'm-202')!;
                const report = Moments.find((m) => m.RecordID === 'w-303')!;
                return {
                    Start: [
                        {
                            Recommendation: 'Delegate operational follow-ups during architecture reviews so deep-work blocks stay intact.',
                            Evidence: [{ Source: meeting.Source, RecordID: meeting.RecordID, Label: meeting.Title, OccurredAtISO: meeting.OccurredAtISO }],
                        },
                    ],
                    Stop: [
                        {
                            Recommendation: 'Stop absorbing unscheduled mid-meeting action items without confirming owner capacity.',
                            Evidence: [{ Source: meeting.Source, RecordID: meeting.RecordID, Label: meeting.Title, OccurredAtISO: meeting.OccurredAtISO }],
                        },
                    ],
                    Continue: [
                        {
                            Recommendation: 'Continue shipping high-rigor schema & security milestones with proactive daily 15Five synthesis.',
                            Evidence: [
                                { Source: task.Source, RecordID: task.RecordID, Label: task.Title, OccurredAtISO: task.OccurredAtISO },
                                { Source: report.Source, RecordID: report.RecordID, Label: report.Title, OccurredAtISO: report.OccurredAtISO },
                            ],
                        },
                    ],
                };
            });

            const activeRoutine = {
                ID: 'routine-growth-bob',
                UserID: IC_USER.ID,
                TargetID: COS_AGENT_ID,
                Status: 'Active',
                WakeConfigurationObject: { workstreamKey: GROWTH_COACH_WORKSTREAM_KEY },
            } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;

            const parentCosConv = {
                ID: 'cos-parent-bob',
                UserID: IC_USER.ID,
                ApplicationScope: 'Global' as const,
                ApplicationID: null,
                EnvironmentID: 'env-1',
            };

            // 1. First execution for Bob in 2026-11-BW2 succeeds and creates private ParentID side conversation
            const firstRun = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                Routine: activeRoutine,
                ChiefOfStaffConversation: parentCosConv,
                Now: nov21,
                Timezone: 'UTC',
                GrowthCoachSkillID: GROWTH_COACH_SKILL_ID,
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
            });

            expect(firstRun.Success).toBe(true);
            expect(firstRun.ResultCode).toBe('SUCCESS');
            expect(firstRun.Deduplicated).toBe(false);
            expect(firstRun.SideConversationTitle).toBe('Coaching — Nov 21');
            expect(firstRun.ParentConversationID).toBe('cos-parent-bob');
            expect(generatorSpy).toHaveBeenCalledTimes(1);
            expect(savedConversations).toHaveLength(1);
            expect(savedConversations[0]?.ParentID).toBe('cos-parent-bob');
            expect(savedConversations[0]?.UserID).toBe(IC_USER.ID);
            expect(savedConversations[0]?.Name).toBe('Coaching — Nov 21');
            expect(savedConversations[0]?.AdditionalData).not.toContain('inheritFolderAccess');
            expect(savedDetails).toHaveLength(1);
            expect(savedDetails[0]?.MarkedServerAuthored).toBe(true);
            expect(savedDetails[0]?.Message).toContain('### Start');
            expect(savedDetails[0]?.Message).toContain('### Stop');
            expect(savedDetails[0]?.Message).toContain('### Continue');
            expect(savedDetails[0]?.Message).toContain('m-202');
            expect(savedDetails[0]?.Message).toContain('t-101');

            // 2. Replay on Nov 22 (same period 2026-11-BW2) deduplicates without calling generator
            const replayRun = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                Routine: activeRoutine,
                ChiefOfStaffConversation: parentCosConv,
                Now: nov22,
                Timezone: 'UTC',
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
            });
            expect(replayRun.Success).toBe(true);
            expect(replayRun.ResultCode).toBe('DEDUPLICATED');
            expect(replayRun.Deduplicated).toBe(true);
            expect(replayRun.SideConversationID).toBe(firstRun.SideConversationID);
            expect(generatorSpy).toHaveBeenCalledTimes(1);
            expect(savedConversations).toHaveLength(1);

            // 3. Even after clearing in-memory cache, persisted AdditionalData/conversation dedupe prevents duplicate
            GrowthCoachService.Instance.ClearDeduplicationCache();
            const routineWithoutResumeKey = {
                ID: 'routine-growth-bob',
                UserID: IC_USER.ID,
                TargetID: COS_AGENT_ID,
                Status: 'Active',
                WakeConfigurationObject: { workstreamKey: GROWTH_COACH_WORKSTREAM_KEY },
            } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;
            const dbReplayRun = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                Routine: routineWithoutResumeKey,
                ChiefOfStaffConversation: parentCosConv,
                Now: nov22,
                Timezone: 'UTC',
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
            });
            expect(dbReplayRun.ResultCode).toBe('DEDUPLICATED');
            expect(dbReplayRun.SideConversationID).toBe(firstRun.SideConversationID);
            expect(generatorSpy).toHaveBeenCalledTimes(1);

            // 4. Different user in same period OR same user in next period (Dec 1) generates cleanly
            const aliceNextUserRun = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: MANAGER_USER,
                AgentID: COS_AGENT_ID,
                ExplicitOptIn: true,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-alice',
                    UserID: MANAGER_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                Now: nov21,
                Timezone: 'UTC',
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
            });
            expect(aliceNextUserRun.Success).toBe(true);
            expect(aliceNextUserRun.ResultCode).toBe('SUCCESS');
            expect(generatorSpy).toHaveBeenCalledTimes(2);

            const bobNextPeriodRun = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                Routine: activeRoutine,
                ChiefOfStaffConversation: parentCosConv,
                Now: dec01,
                Timezone: 'UTC',
                MetadataProvider: md,
                SourceProvider: sourceProvider,
                Generator: generatorSpy,
            });
            expect(bobNextPeriodRun.Success).toBe(true);
            expect(bobNextPeriodRun.PeriodKey).toBe('2026-12-BW1');
            expect(bobNextPeriodRun.SideConversationTitle).toBe('Coaching — Dec 1');
            expect(generatorSpy).toHaveBeenCalledTimes(3);
            expect(savedConversations).toHaveLength(3);
        });

        it('rejects writing a coaching side conversation under another user’s parent Chief of Staff conversation', async () => {
            const { md, savedConversations } = makeInMemoryMetadataProvider();
            const result = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                ExplicitOptIn: true,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-alice',
                    UserID: MANAGER_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                MetadataProvider: md,
            });
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('CONVERSATION_OWNERSHIP_DENIED');
            expect(savedConversations).toHaveLength(0);
        });

        it('CR-3: scopes BizApps sources strictly to contextUser and refuses unscoped queries when no user-scoping column exists', async () => {
            const observedQueries: Array<{ EntityName: string; ExtraFilter?: string }> = [];
            const runViewHandler: RunView['RunView'] = async (params) => {
                observedQueries.push({ EntityName: params.EntityName ?? '', ExtraFilter: typeof params.ExtraFilter === 'string' ? params.ExtraFilter : undefined });
                if (params.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: IC_USER.ID, EmployeeID: 'emp-bob' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ_BizApps_Common: People') {
                    return { Success: true, Results: [{ ID: 'person-bob' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ_BizApps_Tasks: Tasks') {
                    return { Success: true, Results: [{ ID: 'task-bob-1', Title: 'Bob Task', __mj_UpdatedAt: '2026-11-20T12:00:00Z' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ_BizApps_Tasks: Meeting Notes') {
                    return { Success: true, Results: [{ ID: 'mn-bob-1', Title: 'Bob Meeting Note', __mj_UpdatedAt: '2026-11-20T12:00:00Z' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ_BizApps_Tasks: Work Reports') {
                    return { Success: true, Results: [{ ID: 'wr-bob-1', Title: 'Bob Work Report', __mj_UpdatedAt: '2026-11-20T12:00:00Z' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, UserNotifications: [], ErrorMessage: '' };
            };
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new StubRunView(runViewHandler));

            const scopedProvider = {
                EntityByName: (name: string) => {
                    if (name === 'MJ_BizApps_Tasks: Tasks') {
                        return { ID: 'e-tasks', Name: name, Fields: [{ Name: 'ID' }, { Name: 'AssignedToUserID' }, { Name: 'OwnerUserID' }] };
                    }
                    if (name === 'MJ_BizApps_Tasks: Meeting Notes') {
                        return { ID: 'e-notes', Name: name, Fields: [{ Name: 'ID' }, { Name: 'CreatedByUserID' }] };
                    }
                    if (name === 'MJ_BizApps_Tasks: Meetings') {
                        return { ID: 'e-meetings', Name: name, Fields: [{ Name: 'ID' }, { Name: 'Title' }] }; // NO user-scoping column!
                    }
                    if (name === 'MJ_BizApps_Tasks: Work Reports') {
                        // Work Reports with no user-scoping column -> MUST refuse (fail closed)
                        return { ID: 'e-wr', Name: name, Fields: [{ Name: 'ID' }, { Name: 'Summary' }] };
                    }
                    return undefined;
                },
            } as Partial<IMetadataProvider> as IMetadataProvider;

            const { Moments, Telemetry } = await GrowthCoachService.Instance.RetrieveBoundedCoachingEvidence({
                ContextUser: IC_USER,
                Now: new Date('2026-11-21T16:00:00Z'),
                MetadataProvider: scopedProvider,
            });

            // Tasks & Meeting Notes queried with explicit user-scoping ExtraFilter
            const tasksQuery = observedQueries.find((q) => q.EntityName === 'MJ_BizApps_Tasks: Tasks');
            expect(tasksQuery?.ExtraFilter).toContain(`AssignedToUserID='${IC_USER.ID}'`);
            expect(tasksQuery?.ExtraFilter).toContain(`OwnerUserID='${IC_USER.ID}'`);
            expect(tasksQuery?.ExtraFilter).toContain('__mj_UpdatedAt >=');

            const notesQuery = observedQueries.find((q) => q.EntityName === 'MJ_BizApps_Tasks: Meeting Notes');
            expect(notesQuery?.ExtraFilter).toContain(`CreatedByUserID='${IC_USER.ID}'`);

            // Work Reports has no user-scoping column -> MUST NOT query at all and reports Available=false
            expect(observedQueries.some((q) => q.EntityName === 'MJ_BizApps_Tasks: Work Reports')).toBe(false);
            expect(Telemetry.Sources.work_reports.Available).toBe(false);
            expect(Moments.some((m) => m.RecordID === 'task-bob-1')).toBe(true);
            expect(Moments.some((m) => m.RecordID === 'mn-bob-1')).toBe(true);
        });

        it('CR-6: passes OrderBy __mj_CreatedAt DESC in checkDeduplication and persists lastCoachingConversationID on routine', async () => {
            const { md } = makeInMemoryMetadataProvider();
            const convRunViewOrders: Array<string | undefined> = [];
            const origFromMd = RunView.FromMetadataProvider(md);
            const origRunView = origFromMd.RunView.bind(origFromMd);
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
                new StubRunView(async (params, user) => {
                    if (params.EntityName === 'MJ: Conversations') {
                        convRunViewOrders.push(params.OrderBy);
                    }
                    return origRunView(params, user);
                })
            );

            const routineSaveSpy = vi.fn(async () => true);
            const savedRoutine = {
                ID: 'routine-cr6',
                UserID: IC_USER.ID,
                TargetID: COS_AGENT_ID,
                Status: 'Active',
                IsSaved: true,
                WakeConfigurationObject: { workstreamKey: GROWTH_COACH_WORKSTREAM_KEY },
                Save: routineSaveSpy,
                LatestResult: null,
            } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;

            const result = await GrowthCoachService.Instance.RunBiweeklyCoaching({
                ContextUser: IC_USER,
                AgentID: COS_AGENT_ID,
                Routine: savedRoutine,
                ChiefOfStaffConversation: {
                    ID: 'cos-parent-bob',
                    UserID: IC_USER.ID,
                    ApplicationScope: 'Global',
                    ApplicationID: null,
                    EnvironmentID: 'env-1',
                },
                Now: new Date('2026-11-21T16:00:00Z'),
                Timezone: 'UTC',
                MetadataProvider: md,
                SourceProvider: {
                    ReadTasks: async () => [{ Source: 'tasks', RecordID: 't-cr6', Title: 'Task CR6', OccurredAtISO: '2026-11-20T10:00:00Z', Excerpt: 'Done' }],
                    ReadMeetingTranscripts: async () => [],
                    ReadWorkReports: async () => [],
                    ReadAgentConversations: async () => [],
                },
            });

            expect(result.Success).toBe(true);
            expect(convRunViewOrders).toContain('__mj_CreatedAt DESC');
            expect(savedRoutine.WakeConfigurationObject?.resumeState?.['lastCoachingPeriodKey']).toBe('2026-11-BW2');
            expect(savedRoutine.WakeConfigurationObject?.resumeState?.['lastCoachingConversationID']).toBe(result.SideConversationID);
            expect(routineSaveSpy).toHaveBeenCalledTimes(1);
        });
    });
});
