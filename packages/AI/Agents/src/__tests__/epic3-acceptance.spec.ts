import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    DatabasePlatform,
    EntityInfo,
    EntitySaveOptions,
    EntityTransactionScope,
    ExecuteSQLOptions,
    IEntityDataProvider,
    ProviderType,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJAIBridgeAgentIdentityEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJScheduledJobEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
    MJUserRoutineRunEntity,
} from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    ApplyDefaultAgentUserPolicyValues,
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
    AgentRunner,
    AgentWakeTriggerService,
    BuildUserAppWakeKey,
    CheckActivePoliciesForBatch,
    CoalescedWakeEventPayload,
    CoalescedWakeResumeState,
    EventWakeCoalescer,
    ResolveAgentConfigurationIDInput,
    ResolveRoutineSeededAgentConfigurationID,
    ResolveSeededRoutineAgentConfigurationID,
    ResolveWakeAgentConfigurationID,
    WakeStartupGuard,
} from '../index';

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-prompts')>();
    return {
        ...actual,
        AIPromptRunner: class MockAIPromptRunner {},
    };
});
vi.mock('@memberjunction/actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/actions')>();
    return {
        ...actual,
        ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } },
    };
});
vi.mock('@memberjunction/templates', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/templates')>();
    return {
        ...actual,
        TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], FindTemplate: vi.fn() } },
    };
});
vi.mock('@memberjunction/notifications', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/notifications')>();
    return {
        ...actual,
        NotificationEngine: { Instance: { Config: vi.fn(), SendNotification: vi.fn() } },
    };
});

import { UserRoutineDispatcherDriver } from '../../../../Scheduling/engine/src/drivers/UserRoutineDispatcherDriver';
import type { ScheduledJobExecutionContext } from '../../../../Scheduling/engine/src/BaseScheduledJob';
import { MJUserRoutineEntityServer } from '../../../../MJCoreEntitiesServer/src/custom/MJUserRoutineEntityServer.server';

const COS_AGENT_ID = '00000000-0000-0000-0000-00000000C051';
const USER_ALICE_ID = '00000000-0000-0000-0000-00000000A11C';
const USER_BOB_ID = '00000000-0000-0000-0000-00000000B0B2';
const USER_CAROL_ID = '00000000-0000-0000-0000-00000000CA03';
const USER_DAVE_ID = '00000000-0000-0000-0000-00000000DA04';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-0000000005E5';
const APP_TASKS_ID = '11111111-1111-1111-1111-111111111111';
const APP_PLANNING_ID = '22222222-2222-2222-2222-222222222222';
const FAST_CONFIG_ID = '3A1C5A15-8DAA-44E5-A098-F20085E6C93F';
const STANDARD_CONFIG_ID = 'A76B1550-A6D8-4491-9EF6-A38A8F660FBC';
const HIGH_POWER_CONFIG_ID = 'B6B9D780-52B2-431B-93AB-AC83FEF78553';
const DAILY_CAL_TEMPLATE_ID = 'F0294D16-F2B7-4DA2-897F-B9FB27FD5BF5';
const FIXED_NOW = new Date('2026-11-22T15:00:00.000Z');

const { runViewMock, findUserMock } = vi.hoisted(() => ({
    runViewMock: vi.fn(),
    findUserMock: vi.fn(),
}));

const ADMIN_ROLE_ID = '11111111-1111-1111-1111-11111111111A';

const systemUser = new UserInfo(null, {
    ID: SYSTEM_USER_ID,
    Name: 'System',
    Email: 'system@mj.local',
    Type: 'Owner',
    IsActive: true,
    UserRoles: [{ ID: 'ur-sys-epic3', UserID: SYSTEM_USER_ID, RoleID: ADMIN_ROLE_ID, Role: 'Administrator' }],
});

const aliceUser = new UserInfo(null, {
    ID: USER_ALICE_ID,
    Name: 'Alice Executive',
    Email: 'alice@example.com',
    Type: 'User',
    IsActive: true,
});

const bobUser = new UserInfo(null, {
    ID: USER_BOB_ID,
    Name: 'Bob Executive',
    Email: 'bob@example.com',
    Type: 'User',
    IsActive: true,
});

const carolUser = new UserInfo(null, {
    ID: USER_CAROL_ID,
    Name: 'Carol Paused',
    Email: 'carol@example.com',
    Type: 'User',
    IsActive: true,
});

const daveUser = new UserInfo(null, {
    ID: USER_DAVE_ID,
    Name: 'Dave Unonboarded',
    Email: 'dave@example.com',
    Type: 'User',
    IsActive: true,
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: {
            GetSystemUser: () => systemUser,
            FindUser: (criteria: { ID?: string; Email?: string }) => findUserMock(criteria),
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class MockRunView extends actual.RunView {
            public static override FromMetadataProvider(): RunView {
                return new MockRunView();
            }
            public override async RunView(params: Parameters<RunView['RunView']>[0], user?: UserInfo) {
                return runViewMock(params, user);
            }
        },
        Metadata: class MockMetadata extends actual.Metadata {
            public override async GetEntityObject<T extends actual.BaseEntity>(entityName: string): Promise<T> {
                if (entityName === 'MJ: AI Agents') {
                    const agentStub: Pick<MJAIAgentEntityExtended, 'ID' | 'Name' | 'Load'> = {
                        ID: COS_AGENT_ID,
                        Name: 'Chief of Staff',
                        Load: vi.fn(async () => true),
                    };
                    return agentStub as T;
                }
                if (entityName === 'MJ: User Routine Runs') {
                    const runStub: Partial<MJUserRoutineRunEntity> = {
                        ID: `run-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                        RoutineID: '',
                        Status: 'Running',
                        StartedAt: new Date(),
                        CompletedAt: null,
                        ResultSummary: null,
                        ResultHash: null,
                        ErrorMessage: null,
                        AgentRunID: null,
                        PromptRunID: null,
                        ActionExecutionLogID: null,
                        NotificationSent: false,
                        NewRecord: vi.fn(() => true),
                        GetFieldByName: vi.fn(() => undefined),
                        Save: vi.fn(async () => true),
                    };
                    return runStub as T;
                }
                return super.GetEntityObject<T>(entityName);
            }
        },
    };
});

interface PolicyFields {
    ID: string;
    AgentID: string;
    UserID: string;
    Status: MJAIAgentUserPolicyEntity['Status'] | undefined;
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'] | undefined;
    CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'] | undefined;
    DefaultDataAccessMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'] | undefined;
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'] | undefined;
    CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'] | undefined;
    PhoneChannelMode: MJAIAgentUserPolicyEntity['PhoneChannelMode'] | undefined;
    MessagingChannelMode: MJAIAgentUserPolicyEntity['MessagingChannelMode'] | undefined;
    AllowInterAgentCoordination: boolean | undefined;
    RequireApprovalForExternalComms: boolean | undefined;
    RequireApprovalForFinancials: boolean | undefined;
    RequireApprovalForDestructiveActions: boolean | undefined;
    AutoApproveAmountThreshold: number | null;
    Agent: string | null;
}

class InMemoryPolicyEntity extends MJAIAgentUserPolicyEntity {
    private readonly backing: PolicyFields;
    public constructor(initial: Partial<PolicyFields> = {}) {
        super(new EntityInfo({ Name: 'MJ: AI Agent User Policies', Status: 'Active', Fields: [] }));
        this.backing = {
            ID: initial.ID ?? 'policy-id',
            AgentID: initial.AgentID ?? COS_AGENT_ID,
            UserID: initial.UserID ?? USER_ALICE_ID,
            Status: initial.Status,
            OnboardingStatus: initial.OnboardingStatus,
            CoordinationMode: initial.CoordinationMode,
            DefaultDataAccessMode: initial.DefaultDataAccessMode,
            EmailChannelMode: initial.EmailChannelMode,
            CalendarChannelMode: initial.CalendarChannelMode,
            PhoneChannelMode: initial.PhoneChannelMode,
            MessagingChannelMode: initial.MessagingChannelMode,
            AllowInterAgentCoordination: initial.AllowInterAgentCoordination,
            RequireApprovalForExternalComms: initial.RequireApprovalForExternalComms,
            RequireApprovalForFinancials: initial.RequireApprovalForFinancials,
            RequireApprovalForDestructiveActions: initial.RequireApprovalForDestructiveActions,
            AutoApproveAmountThreshold: initial.AutoApproveAmountThreshold ?? null,
            Agent: initial.Agent ?? 'Chief of Staff',
        };
    }
    public override get ID() { return this.backing.ID; }
    public override set ID(v: string) { this.backing.ID = v; }
    public override get AgentID() { return this.backing.AgentID; }
    public override set AgentID(v: string) { this.backing.AgentID = v; }
    public override get UserID() { return this.backing.UserID; }
    public override set UserID(v: string) { this.backing.UserID = v; }
    public override get Status() { return this.backing.Status as MJAIAgentUserPolicyEntity['Status']; }
    public override set Status(v: MJAIAgentUserPolicyEntity['Status']) { this.backing.Status = v; }
    public override get OnboardingStatus() { return this.backing.OnboardingStatus as MJAIAgentUserPolicyEntity['OnboardingStatus']; }
    public override set OnboardingStatus(v: MJAIAgentUserPolicyEntity['OnboardingStatus']) { this.backing.OnboardingStatus = v; }
    public override get CoordinationMode() { return this.backing.CoordinationMode as MJAIAgentUserPolicyEntity['CoordinationMode']; }
    public override set CoordinationMode(v: MJAIAgentUserPolicyEntity['CoordinationMode']) { this.backing.CoordinationMode = v; }
    public override get DefaultDataAccessMode() { return this.backing.DefaultDataAccessMode as MJAIAgentUserPolicyEntity['DefaultDataAccessMode']; }
    public override set DefaultDataAccessMode(v: MJAIAgentUserPolicyEntity['DefaultDataAccessMode']) { this.backing.DefaultDataAccessMode = v; }
    public override get EmailChannelMode() { return this.backing.EmailChannelMode as MJAIAgentUserPolicyEntity['EmailChannelMode']; }
    public override set EmailChannelMode(v: MJAIAgentUserPolicyEntity['EmailChannelMode']) { this.backing.EmailChannelMode = v; }
    public override get CalendarChannelMode() { return this.backing.CalendarChannelMode as MJAIAgentUserPolicyEntity['CalendarChannelMode']; }
    public override set CalendarChannelMode(v: MJAIAgentUserPolicyEntity['CalendarChannelMode']) { this.backing.CalendarChannelMode = v; }
    public override get PhoneChannelMode() { return this.backing.PhoneChannelMode as MJAIAgentUserPolicyEntity['PhoneChannelMode']; }
    public override set PhoneChannelMode(v: MJAIAgentUserPolicyEntity['PhoneChannelMode']) { this.backing.PhoneChannelMode = v; }
    public override get MessagingChannelMode() { return this.backing.MessagingChannelMode as MJAIAgentUserPolicyEntity['MessagingChannelMode']; }
    public override set MessagingChannelMode(v: MJAIAgentUserPolicyEntity['MessagingChannelMode']) { this.backing.MessagingChannelMode = v; }
    public override get AllowInterAgentCoordination() { return this.backing.AllowInterAgentCoordination as boolean; }
    public override set AllowInterAgentCoordination(v: boolean) { this.backing.AllowInterAgentCoordination = v; }
    public override get RequireApprovalForExternalComms() { return this.backing.RequireApprovalForExternalComms as boolean; }
    public override set RequireApprovalForExternalComms(v: boolean) { this.backing.RequireApprovalForExternalComms = v; }
    public override get RequireApprovalForFinancials() { return this.backing.RequireApprovalForFinancials as boolean; }
    public override set RequireApprovalForFinancials(v: boolean) { this.backing.RequireApprovalForFinancials = v; }
    public override get RequireApprovalForDestructiveActions() { return this.backing.RequireApprovalForDestructiveActions as boolean; }
    public override set RequireApprovalForDestructiveActions(v: boolean) { this.backing.RequireApprovalForDestructiveActions = v; }
    public override get AutoApproveAmountThreshold() { return this.backing.AutoApproveAmountThreshold; }
    public override set AutoApproveAmountThreshold(v: number | null) { this.backing.AutoApproveAmountThreshold = v; }
    public override get Agent() { return this.backing.Agent; }
    public override set Agent(v: string | null) { this.backing.Agent = v; }
}

class InMemoryRoutineEntity extends MJUserRoutineEntity {
    private backingID: string;
    private backingUserID = '';
    private backingName = '';
    private backingDescription: string | null = null;
    private backingStatus: MJUserRoutineEntity['Status'] = 'Active';
    private backingRoutineType: MJUserRoutineEntity['RoutineType'] = 'AgentWake';
    private backingScheduleMode: MJUserRoutineEntity['ScheduleMode'] = 'OneShot';
    private backingTargetType: MJUserRoutineEntity['TargetType'] = 'Agent';
    private backingTargetID = '';
    private backingCronExpression: string | null = null;
    private backingTimezone: string | null = 'UTC';
    private backingInitialMessage: string | null = null;
    private backingStartingPayload: string | null = null;
    private backingNextRunAt: Date | null = null;
    private backingLastRunAt: Date | null = null;
    private backingWakeConfig: string | null = null;
    private backingWakeConfigObj: MJUserRoutineEntity_IRoutineWakeConfiguration | null = null;
    private backingAgentConfigID: string | null = null;
    private readonly onSave: (entity: InMemoryRoutineEntity) => void;

    public constructor(id: string, onSave: (entity: InMemoryRoutineEntity) => void) {
        super(new EntityInfo({ Name: 'MJ: User Routines', Status: 'Active', Fields: [] }));
        this.backingID = id;
        this.onSave = onSave;
    }

    public override get ID() { return this.backingID; }
    public override set ID(v: string) { this.backingID = v; }
    public override get UserID() { return this.backingUserID; }
    public override set UserID(v: string) { this.backingUserID = v; }
    public override get Name() { return this.backingName; }
    public override set Name(v: string) { this.backingName = v; }
    public override get Description() { return this.backingDescription; }
    public override set Description(v: string | null) { this.backingDescription = v; }
    public override get Status() { return this.backingStatus; }
    public override set Status(v: MJUserRoutineEntity['Status']) { this.backingStatus = v; }
    public override get RoutineType() { return this.backingRoutineType; }
    public override set RoutineType(v: MJUserRoutineEntity['RoutineType']) { this.backingRoutineType = v; }
    public override get ScheduleMode() { return this.backingScheduleMode; }
    public override set ScheduleMode(v: MJUserRoutineEntity['ScheduleMode']) { this.backingScheduleMode = v; }
    public override get TargetType() { return this.backingTargetType; }
    public override set TargetType(v: MJUserRoutineEntity['TargetType']) { this.backingTargetType = v; }
    public override get TargetID() { return this.backingTargetID; }
    public override set TargetID(v: string) { this.backingTargetID = v; }
    public override get CronExpression() { return this.backingCronExpression; }
    public override set CronExpression(v: string | null) { this.backingCronExpression = v; }
    public override get Timezone() { return this.backingTimezone; }
    public override set Timezone(v: string | null) { this.backingTimezone = v; }
    public override get InitialMessage() { return this.backingInitialMessage; }
    public override set InitialMessage(v: string | null) { this.backingInitialMessage = v; }
    public override get StartingPayload() { return this.backingStartingPayload; }
    public override set StartingPayload(v: string | null) { this.backingStartingPayload = v; }
    public override get NextRunAt() { return this.backingNextRunAt; }
    public override set NextRunAt(v: Date | null) { this.backingNextRunAt = v; }
    public override get LastRunAt() { return this.backingLastRunAt; }
    public override set LastRunAt(v: Date | null) { this.backingLastRunAt = v; }
    public override get WakeConfiguration() { return this.backingWakeConfig; }
    public override set WakeConfiguration(v: string | null) { this.backingWakeConfig = v; }
    public override get WakeConfigurationObject() { return this.backingWakeConfigObj; }
    public override set WakeConfigurationObject(v: MJUserRoutineEntity_IRoutineWakeConfiguration | null) {
        this.backingWakeConfigObj = v;
        this.backingWakeConfig = v ? JSON.stringify(v) : null;
    }
    public override get AgentConfigurationID() { return this.backingAgentConfigID; }
    public override set AgentConfigurationID(v: string | null) { this.backingAgentConfigID = v; }

    public override NewRecord(): boolean {
        return true;
    }

    public override async Load(id: string): Promise<boolean> {
        return id === this.backingID;
    }

    public override async Save(): Promise<boolean> {
        this.onSave(this);
        return true;
    }
}

class InMemoryAgentChannelEntity extends MJAgentChannelEntity {
    private backingID = 'channel-epic3-1';
    private backingTopic = 'Epic 3 Acceptance Channel';
    private backingStatus: MJAgentChannelEntity['ChannelStatus'] = 'Open';
    private backingTurns = 0;
    private backingMaxTurns = 10;
    private backingHourly = 0;
    private backingMaxHourly = 10;
    private backingHourlyStart: Date | null = null;
    private backingLastHuman: Date | null = null;

    public constructor() {
        super(new EntityInfo({ Name: 'MJ: Agent Channels', Status: 'Active', Fields: [] }));
    }

    public override get ID() { return this.backingID; }
    public override set ID(v: string) { this.backingID = v; }
    public override get Topic() { return this.backingTopic; }
    public override set Topic(v: string) { this.backingTopic = v; }
    public override get ChannelStatus() { return this.backingStatus; }
    public override set ChannelStatus(v: MJAgentChannelEntity['ChannelStatus']) { this.backingStatus = v; }
    public override get ConsecutiveAgentTurns() { return this.backingTurns; }
    public override set ConsecutiveAgentTurns(v: number) { this.backingTurns = v; }
    public override get MaxConsecutiveAgentTurns() { return this.backingMaxTurns; }
    public override set MaxConsecutiveAgentTurns(v: number) { this.backingMaxTurns = v; }
    public override get HourlyWakeCount() { return this.backingHourly; }
    public override set HourlyWakeCount(v: number) { this.backingHourly = v; }
    public override get MaxHourlyWakes() { return this.backingMaxHourly; }
    public override set MaxHourlyWakes(v: number) { this.backingMaxHourly = v; }
    public override get HourlyWakeWindowStart() { return this.backingHourlyStart; }
    public override set HourlyWakeWindowStart(v: Date | null) { this.backingHourlyStart = v; }
    public override get LastHumanMessageAt() { return this.backingLastHuman; }
    public override set LastHumanMessageAt(v: Date | null) { this.backingLastHuman = v; }

    public override async Load(id: string): Promise<boolean> {
        this.backingID = id;
        return true;
    }
    public override async Save(): Promise<boolean> {
        return true;
    }
}

function createProviderWithStore() {
    const routinesByID = new Map<string, InMemoryRoutineEntity>();
    let seq = 0;

    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Agent Channels') {
                return new InMemoryAgentChannelEntity();
            }
            const routine = new InMemoryRoutineEntity(`routine-${++seq}`, (saved) => {
                routinesByID.set(saved.ID, saved);
            });
            return routine;
        }),
    } as Partial<IMetadataProvider> as IMetadataProvider;

    return { provider, routinesByID };
}

function createDispatcherContext(): ScheduledJobExecutionContext {
    const schedule: Pick<MJScheduledJobEntity, 'ID' | 'Name' | 'Configuration'> = {
        ID: 'sched-epic3-1',
        Name: 'User Routine Dispatcher',
        Configuration: '{}',
    };
    return {
        Schedule: schedule as MJScheduledJobEntity,
        Run: { ID: 'jrun-epic3-1' },
        ContextUser: systemUser,
    } as ScheduledJobExecutionContext;
}

describe('Epic 3 Acceptance Suite (Rhythms Model Tiers, Policy Gating, Burst Coalescing, Autonomous Defaults)', () => {
    const globalRef = globalThis as {
        ___SINGLETON__UserCache?: {
            Users: UserInfo[];
            FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
        };
    };
    let prevUserCache: typeof globalRef.___SINGLETON__UserCache;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(FIXED_NOW);
        AgentUserPolicyEngine.Instance.ClearCache();
        EventWakeCoalescer.Instance.Reset();
        WakeStartupGuard.Instance.Reset();
        UserRoutineDispatcherDriver.ClearOwnerResolveFailures();
        delete process.env.AIDP_DEPLOYMENT_IN_PROGRESS;
        delete process.env.MJ_SKIP_STARTUP_WAKES;

        const users = [aliceUser, bobUser, carolUser, daveUser, systemUser];
        findUserMock.mockImplementation((criteria: { ID?: string; Email?: string }) => {
            if (criteria.ID) {
                return users.find((u) => u.ID.toLowerCase() === criteria.ID?.toLowerCase());
            }
            if (criteria.Email) {
                return users.find((u) => u.Email.toLowerCase() === criteria.Email?.toLowerCase());
            }
            return undefined;
        });
        prevUserCache = globalRef.___SINGLETON__UserCache;
        globalRef.___SINGLETON__UserCache = {
            Users: users,
            FindUser: async (criteria) => findUserMock(criteria),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        globalRef.___SINGLETON__UserCache = prevUserCache;
        WakeStartupGuard.Instance.Reset();
        EventWakeCoalescer.Instance.Reset();
        vi.restoreAllMocks();
    });

    it('AT-1: Two users executing the same rhythm configured on different tiers (Draft vs High) execute agent runs on their respective tier models via production dispatcher', async () => {
        const highTierInput = await (async () => {
            runViewMock.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                if (params.EntityName === 'MJ: AI Configurations' && params.ExtraFilter?.includes("Name='High Power'")) {
                    return { Success: true, Results: [{ ID: HIGH_POWER_CONFIG_ID, Name: 'High Power', Status: 'Active' }] };
                }
                return { Success: true, Results: [] };
            });
            return ResolveAgentConfigurationIDInput({ modelTier: 'High', contextUser: bobUser });
        })();
        expect(highTierInput).toEqual({ Provided: true, ConfigurationID: HIGH_POWER_CONFIG_ID });

        // User Alice uses template default (Draft -> Fast, AgentConfigurationID = null falling back to template)
        const aliceRoutine = new InMemoryRoutineEntity('routine-alice-cal', () => undefined);
        aliceRoutine.UserID = USER_ALICE_ID;
        aliceRoutine.TargetID = COS_AGENT_ID;
        aliceRoutine.RoutineType = 'Scheduled';
        aliceRoutine.ScheduleMode = 'OneShot';
        aliceRoutine.Status = 'Active';
        aliceRoutine.NextRunAt = new Date(FIXED_NOW.getTime() - 10_000);
        aliceRoutine.NotifyViaInApp = false;
        aliceRoutine.NotifyViaEmail = false;
        aliceRoutine.AgentConfigurationID = null;
        aliceRoutine.WakeConfigurationObject = {
            workstreamKey: 'calendar-daily-review',
            resumeState: { rhythmTemplateID: DAILY_CAL_TEMPLATE_ID },
        };

        // User Bob customizes the same rhythm to High (High Power)
        const bobRoutine = new InMemoryRoutineEntity('routine-bob-cal', () => undefined);
        bobRoutine.UserID = USER_BOB_ID;
        bobRoutine.TargetID = COS_AGENT_ID;
        bobRoutine.RoutineType = 'Scheduled';
        bobRoutine.ScheduleMode = 'OneShot';
        bobRoutine.Status = 'Active';
        bobRoutine.NextRunAt = new Date(FIXED_NOW.getTime() - 10_000);
        bobRoutine.NotifyViaInApp = false;
        bobRoutine.NotifyViaEmail = false;
        bobRoutine.AgentConfigurationID = ResolveSeededRoutineAgentConfigurationID({
            explicitAgentConfigurationID: highTierInput.ConfigurationID,
            templateDefaultAgentConfigurationID: FAST_CONFIG_ID,
        });
        bobRoutine.WakeConfigurationObject = {
            workstreamKey: 'calendar-daily-review',
            resumeState: { rhythmTemplateID: DAILY_CAL_TEMPLATE_ID },
        };

        runViewMock.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [aliceRoutine, bobRoutine] };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'pol-alice',
                            AgentID: COS_AGENT_ID,
                            UserID: USER_ALICE_ID,
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                        {
                            ID: 'pol-bob',
                            AgentID: COS_AGENT_ID,
                            UserID: USER_BOB_ID,
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent Rhythm Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: DAILY_CAL_TEMPLATE_ID,
                            AgentID: COS_AGENT_ID,
                            WorkstreamKey: 'calendar-daily-review',
                            DefaultAgentConfigurationID: FAST_CONFIG_ID,
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const capturedConfigs: Array<{ userId: string; configurationId?: string }> = [];
        const runAgentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementation(async (params) => {
            capturedConfigs.push({
                userId: params.contextUser.ID,
                configurationId: params.configurationId,
            });
            return {
                success: true,
                payload: { ok: true },
                agentRun: { ID: `agent-run-${params.contextUser.ID}`, Message: 'Completed' },
            } as Awaited<ReturnType<AgentRunner['RunAgent']>>;
        });

        // Execute through the real UserRoutineDispatcherDriver -> executeAgentTarget -> AgentRunner boundary
        const dispatcher = new UserRoutineDispatcherDriver();
        const sweepResult = await dispatcher.Execute(createDispatcherContext());

        expect(sweepResult.Success).toBe(true);
        expect(sweepResult.Details?.RoutinesRun).toBe(2);
        expect(runAgentSpy).toHaveBeenCalledTimes(2);
        expect(capturedConfigs).toHaveLength(2);
        expect(capturedConfigs).toEqual(
            expect.arrayContaining([
                { userId: USER_ALICE_ID, configurationId: FAST_CONFIG_ID },
                { userId: USER_BOB_ID, configurationId: HIGH_POWER_CONFIG_ID },
            ])
        );
    });

    it('AT-2: Assigning 20 tasks to one onboarded user within one minute with interleaved dispatcher sweeps executes ONE wake with all 20 events', async () => {
        const { provider, routinesByID } = createProviderWithStore();
        const alicePolicy = ApplyDefaultAgentUserPolicyValues(
            new InMemoryPolicyEntity({ ID: 'pol-alice', UserID: USER_ALICE_ID, OnboardingStatus: 'Completed' })
        );

        runViewMock.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: alicePolicy.ID,
                            AgentID: COS_AGENT_ID,
                            UserID: USER_ALICE_ID,
                            Status: alicePolicy.Status,
                            AllowInterAgentCoordination: alicePolicy.AllowInterAgentCoordination,
                            EmailChannelMode: alicePolicy.EmailChannelMode,
                            Agent: 'Chief of Staff',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Users') {
                return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
            }
            if (params.EntityName === 'MJ: AI Agents') {
                return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
            }
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: Array.from(routinesByID.values()) };
            }
            return { Success: true, Results: [] };
        });

        const deliveredBatches: Array<string[]> = [];
        const runAgentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementation(async (params) => {
            const payload = params.payload as {
                _wakeContext?: { resumeState?: CoalescedWakeResumeState };
            };
            const events = payload?._wakeContext?.resumeState?.pendingEvents ?? [];
            deliveredBatches.push(events.map((e) => e.taskID ?? e.eventID ?? ''));
            return {
                success: true,
                payload: { ok: true },
                agentRun: { ID: 'agent-run-burst', Message: 'Triaged 20 tasks' },
            } as Awaited<ReturnType<AgentRunner['RunAgent']>>;
        });

        const dispatcher = new UserRoutineDispatcherDriver();
        const results = [];
        for (let i = 1; i <= 20; i++) {
            const eventAt = new Date(FIXED_NOW.getTime() + (i - 1) * 2_500); // 0s .. 47.5s (< 60s window)
            vi.setSystemTime(eventAt);
            results.push(
                await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                    targetUserID: USER_ALICE_ID,
                    targetAgentID: COS_AGENT_ID,
                    workstreamKey: `task:epic3-${i}`,
                    applicationID: APP_TASKS_ID,
                    wakeReason: `Assigned task #${i}`,
                    resumeState: {
                        triggerType: 'TaskAssigned',
                        taskID: `epic3-${i}`,
                        subject: `Task #${i}`,
                    },
                    contextUser: systemUser,
                    metadataProvider: provider,
                    now: eventAt,
                })
            );
            // Interleave dispatcher sweeps during the active 60-second burst window
            if (i % 4 === 0) {
                await dispatcher.Execute(createDispatcherContext());
            }
        }

        expect(results.every((r) => r.triggered && r.resultCode === 'WAKE_SCHEDULED')).toBe(true);
        expect(routinesByID.size).toBe(1);
        expect(runAgentSpy).toHaveBeenCalledTimes(0);

        const singleRoutine = Array.from(routinesByID.values())[0];
        const resumeState = singleRoutine.WakeConfigurationObject?.resumeState as CoalescedWakeResumeState | undefined;
        const pendingEvents: CoalescedWakeEventPayload[] = resumeState?.pendingEvents ?? [];
        expect(pendingEvents).toHaveLength(20);
        expect(resumeState?.coalescedEventCount).toBe(20);
        expect(resumeState?.coalesceKey).toBe(BuildUserAppWakeKey(USER_ALICE_ID, APP_TASKS_ID));
        expect(results[19].coalesced).toBe(true);
        expect(results[19].coalescedCount).toBe(20);

        // Advance past the 60s collection window deadline -> dispatcher executes ONE wake with all 20 events
        vi.setSystemTime(new Date(FIXED_NOW.getTime() + 61_000));
        const finalSweep = await dispatcher.Execute(createDispatcherContext());
        expect(finalSweep.Success).toBe(true);
        expect(finalSweep.Details?.RoutinesRun).toBe(1);
        expect(runAgentSpy).toHaveBeenCalledTimes(1);
        expect(deliveredBatches).toHaveLength(1);
        expect(deliveredBatches[0]).toHaveLength(20);
        expect(deliveredBatches[0][0]).toBe('epic3-1');
        expect(deliveredBatches[0][19]).toBe('epic3-20');

        // Separate application bucket produces a distinct wake key and routine
        const planningWake = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
            targetUserID: USER_ALICE_ID,
            targetAgentID: COS_AGENT_ID,
            workstreamKey: 'okr:check-in-1',
            applicationID: APP_PLANNING_ID,
            wakeReason: 'OKR updated',
            resumeState: { triggerType: 'OKRUpdated', eventID: 'okr-1' },
            contextUser: systemUser,
            metadataProvider: provider,
            now: new Date(FIXED_NOW.getTime() + 62_000),
        });
        expect(planningWake.triggered).toBe(true);
        expect(routinesByID.size).toBe(2);
    });

    it('AT-3: A user with no policy or inactive (Paused/Disabled) policy receives zero runs across all triggers', async () => {
        const { provider, routinesByID } = createProviderWithStore();
        const carolPaused = ApplyDefaultAgentUserPolicyValues(
            new InMemoryPolicyEntity({ ID: 'pol-carol', UserID: USER_CAROL_ID, Status: 'Paused' })
        );
        const bobDisabled = ApplyDefaultAgentUserPolicyValues(
            new InMemoryPolicyEntity({ ID: 'pol-bob', UserID: USER_BOB_ID, Status: 'Disabled' })
        );

        interface PolicyProjectionRow {
            ID: string;
            AgentID: string;
            UserID: string;
            Status: MJAIAgentUserPolicyEntity['Status'];
            AllowInterAgentCoordination: boolean;
            EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
            Agent: string;
        }

        runViewMock.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                const filter = params.ExtraFilter ?? '';
                const matched: PolicyProjectionRow[] = [];
                if (filter.includes(USER_CAROL_ID)) {
                    matched.push({
                        ID: carolPaused.ID,
                        AgentID: COS_AGENT_ID,
                        UserID: USER_CAROL_ID,
                        Status: 'Paused',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    });
                }
                if (filter.includes(USER_BOB_ID)) {
                    matched.push({
                        ID: bobDisabled.ID,
                        AgentID: COS_AGENT_ID,
                        UserID: USER_BOB_ID,
                        Status: 'Disabled',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    });
                }
                return { Success: true, Results: matched };
            }
            if (params.EntityName === 'MJ: Users') {
                return {
                    Success: true,
                    Results: [
                        { ID: USER_CAROL_ID, IsActive: true },
                        { ID: USER_BOB_ID, IsActive: true },
                        { ID: USER_DAVE_ID, IsActive: true },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agents') {
                return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
            }
            if (params.EntityName === 'MJ: Agent Channel Participants') {
                return {
                    Success: true,
                    Results: [
                        { AgentID: COS_AGENT_ID, UserID: USER_ALICE_ID } as MJAgentChannelParticipantEntity,
                        { AgentID: COS_AGENT_ID, UserID: USER_CAROL_ID } as MJAgentChannelParticipantEntity,
                        { AgentID: COS_AGENT_ID, UserID: USER_DAVE_ID } as MJAgentChannelParticipantEntity,
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        // 1. Batched scheduled policy check rejects no-policy (Dave), Paused (Carol), Disabled (Bob)
        const batchResult = await CheckActivePoliciesForBatch(
            [
                { AgentID: COS_AGENT_ID, UserID: USER_DAVE_ID },
                { AgentID: COS_AGENT_ID, UserID: USER_CAROL_ID },
                { AgentID: COS_AGENT_ID, UserID: USER_BOB_ID },
            ],
            systemUser,
            { provider, bypassCache: true }
        );
        for (const evalOutcome of batchResult.values()) {
            expect(evalOutcome.Allowed).toBe(false);
        }

        // 2. Workstream trigger denied for no policy & Paused
        const daveWorkstream = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
            targetUserID: USER_DAVE_ID,
            targetAgentID: COS_AGENT_ID,
            workstreamKey: 'task:dave-1',
            applicationID: APP_TASKS_ID,
            wakeReason: 'Task assigned to un-onboarded user',
            contextUser: systemUser,
            metadataProvider: provider,
            now: FIXED_NOW,
        });
        expect(daveWorkstream.triggered).toBe(false);
        expect(daveWorkstream.resultCode).toBe('POLICY_DENIED');

        const carolWorkstream = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
            targetUserID: USER_CAROL_ID,
            targetAgentID: COS_AGENT_ID,
            workstreamKey: 'task:carol-1',
            applicationID: APP_TASKS_ID,
            wakeReason: 'Task assigned to paused user',
            contextUser: systemUser,
            metadataProvider: provider,
            now: FIXED_NOW,
        });
        expect(carolWorkstream.triggered).toBe(false);
        expect(carolWorkstream.resultCode).toBe('POLICY_DENIED');

        // 3. Inbound utility mailbox denied for un-onboarded user (Dave)
        const utilityIdentity = {
            ID: 'ident-cos-shared',
            AgentID: COS_AGENT_ID,
            UserID: null,
            IdentityType: 'Email',
            IdentityValue: 'cos@company.com',
            IsActive: true,
            Configuration: null,
        } as MJAIBridgeAgentIdentityEntity;

        const daveEmail = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
            toAddress: 'cos@company.com',
            fromAddress: 'dave@example.com',
            subject: 'Wake up please',
            systemContextUser: systemUser,
            metadataProvider: provider,
            identities: [utilityIdentity],
            users: [daveUser],
            now: FIXED_NOW,
        });
        expect(daveEmail.triggered).toBe(false);
        expect(daveEmail.resultCode).toBe('POLICY_DENIED');

        // 4. Agent Channel peer wakes denied for Carol (Paused) and Dave (none)
        const channelOutcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: 'channel-epic3-1',
            senderUserID: USER_ALICE_ID,
            senderAgentID: COS_AGENT_ID,
            messagePreview: 'Status update',
            contextUser: systemUser,
            metadataProvider: provider,
            now: FIXED_NOW,
        });
        expect(channelOutcome.results.every((r) => !r.triggered && r.resultCode === 'POLICY_DENIED')).toBe(true);
        expect(routinesByID.size).toBe(0);
    });

    it('AT-4: Newly created user agent policy defaults to Autonomous mode, Email DraftOnly, Calendar approval required, and Phone Off (Disabled)', () => {
        const engine = AgentUserPolicyEngine.Instance;
        const freshPolicy = ApplyDefaultAgentUserPolicyValues(
            new InMemoryPolicyEntity({ ID: 'pol-fresh', UserID: USER_ALICE_ID })
        );

        expect(freshPolicy.Status).toBe('Active');
        expect(freshPolicy.CoordinationMode).toBe('Autonomous');
        expect(freshPolicy.EmailChannelMode).toBe('DraftOnly');
        expect(freshPolicy.CalendarChannelMode).toBe('ProposeWithApproval');
        expect(freshPolicy.PhoneChannelMode).toBe('Disabled');

        expect(engine.EvaluateEmailOperation(freshPolicy, 'Draft').verdict).toBe('Allow');
        expect(engine.EvaluateEmailOperation(freshPolicy, 'Send').verdict).toBe('Deny');
        expect(engine.EvaluateCalendarOperation(freshPolicy, true).verdict).toBe('RequireApproval');
        expect(engine.EvaluatePhoneOperation(freshPolicy, 'Outbound').verdict).toBe('Deny');
        expect(engine.EvaluatePhoneOperation(freshPolicy, 'Inbound').verdict).toBe('Deny');
    });

    it('AT-1b: Loads shipped rhythm template metadata and verifies persisted DefaultAgentConfigurationID inheritance across all 10 contracted rhythms', async () => {
        interface ShippedRhythmTemplate {
            fields: {
                WorkstreamKey: string;
                Name: string;
                DefaultAgentConfigurationID?: string | null;
            };
            primaryKey: { ID: string };
        }
        interface ShippedAIConfig {
            fields: { Name: string; Status: string };
            primaryKey: { ID: string };
        }

        const repoRoot = path.resolve(__dirname, '../../../../..');
        const templates = JSON.parse(
            fs.readFileSync(path.join(repoRoot, 'metadata/rhythm-templates/.chief-of-staff-rhythm-templates.json'), 'utf8')
        ) as ShippedRhythmTemplate[];
        const configs = JSON.parse(
            fs.readFileSync(path.join(repoRoot, 'metadata/ai-configurations/.ai-configurations.json'), 'utf8')
        ) as ShippedAIConfig[];

        const configIdByName = new Map(configs.map((c) => [c.fields.Name, c.primaryKey.ID]));
        const templateByKey = new Map(templates.map((t) => [t.fields.WorkstreamKey, t]));

        const contractedExpectations: Array<{ workstreamKey: string; expectedConfigName: string }> = [
            { workstreamKey: 'tasks-daily-triage', expectedConfigName: 'Fast' },
            { workstreamKey: 'calendar-daily-review', expectedConfigName: 'Fast' },
            { workstreamKey: 'planning-huddle-prep', expectedConfigName: 'Fast' },
            { workstreamKey: 'daily-15five', expectedConfigName: 'Fast' },
            { workstreamKey: 'tasks-weekly-review', expectedConfigName: 'Standard' },
            { workstreamKey: 'planning-weekly-okr-review', expectedConfigName: 'Standard' },
            { workstreamKey: 'planning-period-close', expectedConfigName: 'Standard' },
            { workstreamKey: 'planning-midquarter-checkpoint', expectedConfigName: 'High Power' },
            { workstreamKey: 'growth-coaching', expectedConfigName: 'High Power' },
            { workstreamKey: 'project-risk-review', expectedConfigName: 'High Power' },
        ];

        runViewMock.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agent Rhythm Templates') {
                const matched = templates.find((t) =>
                    params.ExtraFilter?.includes(t.primaryKey.ID) ||
                    params.ExtraFilter?.toLowerCase().includes(t.fields.WorkstreamKey.toLowerCase())
                );
                if (!matched) {
                    return { Success: true, Results: [] };
                }
                const lookupName = matched.fields.DefaultAgentConfigurationID?.replace('@lookup:MJ: AI Configurations.Name=', '') ?? '';
                return {
                    Success: true,
                    Results: [
                        {
                            ID: matched.primaryKey.ID,
                            AgentID: COS_AGENT_ID,
                            WorkstreamKey: matched.fields.WorkstreamKey,
                            DefaultAgentConfigurationID: configIdByName.get(lookupName) ?? null,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Configurations') {
                const matchedCfg = configs.find((c) => params.ExtraFilter?.includes(`Name='${c.fields.Name}'`));
                return {
                    Success: true,
                    Results: matchedCfg
                        ? [{ ID: matchedCfg.primaryKey.ID, Name: matchedCfg.fields.Name, Status: matchedCfg.fields.Status }]
                        : [],
                };
            }
            return { Success: true, Results: [] };
        });

        for (const item of contractedExpectations) {
            const tmpl = templateByKey.get(item.workstreamKey);
            expect(tmpl).toBeDefined();
            expect(tmpl?.fields.DefaultAgentConfigurationID).toBe(`@lookup:MJ: AI Configurations.Name=${item.expectedConfigName}`);

            const expectedConfigId = configIdByName.get(item.expectedConfigName);
            expect(expectedConfigId).toBeTruthy();

            const seededId = await ResolveRoutineSeededAgentConfigurationID({
                templateDefaultAgentConfigurationID: expectedConfigId ?? null,
                workstreamKey: item.workstreamKey,
                contextUser: aliceUser,
            });
            expect(seededId).toBe(expectedConfigId);

            // Also verify wake-time inheritance when routine.AgentConfigurationID is null
            const wakeConfigId = await ResolveWakeAgentConfigurationID({
                routine: {
                    AgentConfigurationID: null,
                    TargetID: COS_AGENT_ID,
                    WakeConfiguration: null,
                    WakeConfigurationObject: {
                        workstreamKey: item.workstreamKey,
                        resumeState: { rhythmTemplateID: tmpl!.primaryKey.ID },
                    },
                },
                contextUser: aliceUser,
            });
            expect(wakeConfigId).toBe(expectedConfigId);
        }
    });

    it('AT-2b: Multi-instance concurrency across independent AgentWakeTriggerService instances using real MJUserRoutineEntityServer.Save converges 20 concurrent events into 1 dispatcher wake', async () => {
        const routineEntityInfo = new EntityInfo({
            ID: 'E0000000-0000-0000-0000-000000000001',
            Name: 'MJ: User Routines',
            Status: 'Active',
            SchemaName: '__mj',
            BaseTable: 'UserRoutine',
            BaseView: 'vwUserRoutines',
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            IncludeInAPI: true,
            EntityPermissions: [
                {
                    ID: 'ep-admin-1',
                    EntityID: 'E0000000-0000-0000-0000-000000000001',
                    RoleID: ADMIN_ROLE_ID,
                    RoleName: 'Administrator',
                    CanCreate: true,
                    CanRead: true,
                    CanUpdate: true,
                    CanDelete: true,
                },
            ],
            EntityFields: [
                { ID: 'f1', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultValue: 'newsequentialid()', AllowUpdateAPI: false, Status: 'Active' },
                { ID: 'f2', Sequence: 2, Name: 'UserID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f3', Sequence: 3, Name: 'Name', Type: 'nvarchar', Length: 255, AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f4', Sequence: 4, Name: 'Description', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f5', Sequence: 5, Name: 'Status', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Active', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f6', Sequence: 6, Name: 'RoutineType', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Scheduled', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f7', Sequence: 7, Name: 'ScheduleMode', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Recurring', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f8', Sequence: 8, Name: 'TargetType', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Agent', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f9', Sequence: 9, Name: 'TargetID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f10', Sequence: 10, Name: 'CronExpression', Type: 'nvarchar', Length: 100, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f11', Sequence: 11, Name: 'StartAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f12', Sequence: 12, Name: 'EndAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f13', Sequence: 13, Name: 'Timezone', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultValue: 'UTC', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f14', Sequence: 14, Name: 'InitialMessage', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f15', Sequence: 15, Name: 'StartingPayload', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f16', Sequence: 16, Name: 'NextRunAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f17', Sequence: 17, Name: 'LastRunAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f18', Sequence: 18, Name: 'WakeConfiguration', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f19', Sequence: 19, Name: 'AgentConfigurationID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f20', Sequence: 20, Name: 'NotifyViaInApp', Type: 'bit', AllowsNull: false, DefaultValue: '0', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f21', Sequence: 21, Name: 'NotifyViaEmail', Type: 'bit', AllowsNull: false, DefaultValue: '0', AllowUpdateAPI: true, Status: 'Active' },
                { ID: 'f22', Sequence: 22, Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultValue: 'getutcdate()', AllowUpdateAPI: false, Status: 'Active' },
                { ID: 'f23', Sequence: 23, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultValue: 'getutcdate()', AllowUpdateAPI: false, Status: 'Active' },
            ],
        });

        type PlainRow = Record<string, string | number | boolean | Date | object | null | undefined>;
        const dbRows = new Map<string, PlainRow>();
        let seq = 0;
        let txChain: Promise<void> = Promise.resolve();

        // Dumb persistence provider with ZERO CAS logic in Save(): all atomicity comes strictly from MJUserRoutineEntityServer.prototype.Save
        const dumbSqlProvider = {
            ProviderType: ProviderType.Database,
            PlatformKey: 'sqlserver' as DatabasePlatform,
            SupportsEntityTransactions: true,
            ConfigData: { MJCoreSchemaName: '__mj' },
            QuoteIdentifier: (n: string) => `[${n}]`,
            QuoteSchemaAndView: (s: string, o: string) => `[${s}].[${o}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            BeginEntityTransaction: async (): Promise<EntityTransactionScope> => {
                let release!: () => void;
                const next = new Promise<void>((res) => { release = res; });
                const prev = txChain;
                txChain = txChain.then(() => next, () => next);
                await prev;
                return { IsNested: false, Commit: async () => { release(); }, Rollback: async () => { release(); } };
            },
            ExecuteSQL: async <T>(sql: string, params?: unknown[]): Promise<Array<T>> => {
                if (sql.includes('sp_getapplock')) {
                    return [{ LockResult: 0 }] as unknown as Array<T>;
                }
                if (sql.includes('WITH (UPDLOCK, ROWLOCK)')) {
                    const id = String(params?.[0] ?? '');
                    const hit = dbRows.get(id);
                    return (hit ? [{ ...hit }] : []) as unknown as Array<T>;
                }
                if (sql.includes('WITH (UPDLOCK, HOLDLOCK)')) {
                    const userId = String(params?.[0] ?? '').toLowerCase();
                    const targetId = String(params?.[1] ?? '').toLowerCase();
                    const matches = Array.from(dbRows.values()).filter(
                        (r) =>
                            String(r['UserID'] ?? '').toLowerCase() === userId &&
                            r['RoutineType'] === 'AgentWake' &&
                            r['TargetType'] === 'Agent' &&
                            String(r['TargetID'] ?? '').toLowerCase() === targetId &&
                            r['Status'] === 'Active' &&
                            r['NextRunAt'] != null
                    );
                    return matches.map((r) => ({ ...r })) as unknown as Array<T>;
                }
                return [] as Array<T>;
            },
            Save: async (entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): Promise<PlainRow> => {
                await Promise.resolve();
                const all = entity.GetAll() as PlainRow;
                const existingId = typeof all['ID'] === 'string' && all['ID'].trim().length > 0
                    ? all['ID']
                    : `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`;
                const prev = dbRows.get(existingId);
                const nowDate = new Date(FIXED_NOW.getTime() + dbRows.size + seq);
                const persisted: PlainRow = {
                    ...all,
                    ID: existingId,
                    __mj_CreatedAt: (prev?.['__mj_CreatedAt'] as Date | undefined) ?? nowDate,
                    __mj_UpdatedAt: new Date(Date.now() + ++seq),
                };
                dbRows.set(existingId, persisted);
                return { ...persisted };
            },
            GetEntityObject: async (entityName: string, user?: UserInfo): Promise<BaseEntity> => {
                if (entityName === 'MJ: Agent Channels') {
                    return new InMemoryAgentChannelEntity();
                }
                const entity = new MJUserRoutineEntityServer(routineEntityInfo);
                entity.BindProvider(dumbSqlProvider as Partial<IEntityDataProvider> as IEntityDataProvider);
                entity.ContextCurrentUser = user ?? systemUser;
                return entity;
            },
        };

        const hydrateRealServerEntity = async (row: PlainRow): Promise<MJUserRoutineEntityServer> => {
            const entity = new MJUserRoutineEntityServer(routineEntityInfo);
            entity.BindProvider(dumbSqlProvider as Partial<IEntityDataProvider> as IEntityDataProvider);
            entity.ContextCurrentUser = systemUser;
            await entity.LoadFromData({ ...row });
            return entity;
        };

        // Barrier between initial RunView read and commit on the first two concurrent arrivals
        let initialReadsAtBarrier = 0;
        let releaseInitialBarrier!: () => void;
        const initialBarrier = new Promise<void>((res) => { releaseInitialBarrier = res; });

        const saveSpy = vi.spyOn(MJUserRoutineEntityServer.prototype, 'Save');

        runViewMock.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'pol-alice',
                            AgentID: COS_AGENT_ID,
                            UserID: USER_ALICE_ID,
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Users') {
                return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
            }
            if (params.EntityName === 'MJ: AI Agents') {
                return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
            }
            if (params.EntityName === 'MJ: User Routines') {
                if (dbRows.size === 0 && initialReadsAtBarrier < 2) {
                    initialReadsAtBarrier++;
                    if (initialReadsAtBarrier === 2) {
                        releaseInitialBarrier();
                    }
                    await initialBarrier;
                } else {
                    await Promise.resolve();
                }
                const hydrated = await Promise.all(
                    Array.from(dbRows.values()).map((row) => hydrateRealServerEntity(row))
                );
                return { Success: true, Results: hydrated };
            }
            return { Success: true, Results: [] };
        });

        const deliveredTaskIDs: string[] = [];
        const runAgentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementation(async (params) => {
            const payload = params.payload as { _wakeContext?: { resumeState?: CoalescedWakeResumeState } };
            for (const ev of payload?._wakeContext?.resumeState?.pendingEvents ?? []) {
                if (ev.taskID) {
                    deliveredTaskIDs.push(ev.taskID);
                }
            }
            return {
                success: true,
                payload: { ok: true },
                agentRun: { ID: 'agent-run-multi-inst', Message: 'Done' },
            } as Awaited<ReturnType<AgentRunner['RunAgent']>>;
        });

        class ServerPodA extends AgentWakeTriggerService {}
        class ServerPodB extends AgentWakeTriggerService {}
        const instance1 = new ServerPodA();
        const instance2 = new ServerPodB();
        expect(instance1).not.toBe(instance2);
        const triggerResults = await Promise.all(
            Array.from({ length: 20 }, (_, idx) => {
                const i = idx + 1;
                const svc = i % 2 === 1 ? instance1 : instance2;
                return svc.TriggerWakeForWorkstream({
                    targetUserID: USER_ALICE_ID,
                    targetAgentID: COS_AGENT_ID,
                    workstreamKey: `task:mi-${i}`,
                    applicationID: APP_TASKS_ID,
                    wakeReason: `Multi-instance task #${i}`,
                    resumeState: { triggerType: 'TaskAssigned', taskID: `mi-${i}` },
                    contextUser: systemUser,
                    metadataProvider: dumbSqlProvider as Partial<IMetadataProvider> as IMetadataProvider,
                    now: new Date(FIXED_NOW.getTime() + i * 500),
                });
            })
        );

        expect(triggerResults.every((r) => r.triggered && r.resultCode === 'WAKE_SCHEDULED')).toBe(true);
        // Prove real MJUserRoutineEntityServer.prototype.Save executed and rejected at least one stale race
        expect(saveSpy).toHaveBeenCalled();
        const saveOutcomes = await Promise.all(saveSpy.mock.results.map((r) => r.value));
        expect(saveOutcomes.some((ok) => ok === false)).toBe(true);

        const activePending = Array.from(dbRows.values()).filter((s) => s['Status'] === 'Active' && s['NextRunAt'] != null);
        expect(activePending).toHaveLength(1);

        vi.setSystemTime(new Date(FIXED_NOW.getTime() + 65_000));
        const dispatcher = new UserRoutineDispatcherDriver();
        const sweep = await dispatcher.Execute(createDispatcherContext());
        expect(sweep.Success).toBe(true);
        expect(sweep.Details?.RoutinesRun).toBe(1);
        expect(runAgentSpy).toHaveBeenCalledTimes(1);
        expect(new Set(deliveredTaskIDs).size).toBe(20);
    });
});
