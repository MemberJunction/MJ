import '@angular/compiler';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import {
    BaseRemotableOperation,
    DispatchRemoteOperationInProcess,
    LimitsConfigResolver,
    RunView,
    type IMetadataProvider,
    type IRemoteOperationProvider,
    type IRunViewProvider,
    type RemoteOpInvokeOptions,
    type RemoteOpResult,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';
import {
    AppendProgressDiagnosticToRunData,
    AttachLimitsDiagnosticsToRunData,
    BuildLimitsDiagnosticsSnapshot,
    ExtractRunawayCheckpointFromRunData,
    LIMITS_GET_DIAGNOSTICS_OPERATION_KEY,
    LIMITS_PAUSE_RUN_OPERATION_KEY,
    LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type RunawayCheckpointState,
    type RunawayJsonObject,
} from '@memberjunction/ai-core-plus';
import {
    ActiveRunGovernanceRegistry,
    BaseAgent,
    InstallDefaultResumeContinuationDispatcher,
    LimitsGetDiagnosticsServerOperation,
    LimitsPauseRunServerOperation,
    LimitsResumePausedRunServerOperation,
    LoadLimitsOperations,
    RunawayCheckpointManager,
} from '../../../../../AI/Agents/dist/index.js';

const mockNavigationService = {
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    UpdateTabQueryParams: vi.fn(),
    QueryParamChanged$: { pipe: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }) },
    ObserveTabQueryParams: () => ({ pipe: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }) }),
    IsTabShowingResource: vi.fn(() => true),
};

const mockCdr = {
    markForCheck: vi.fn(),
    detectChanges: vi.fn(),
    checkNoChanges: vi.fn(),
    detach: vi.fn(),
    reattach: vi.fn(),
};

vi.mock('@angular/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@angular/core')>();
    return {
        ...actual,
        inject: (token: { name?: string }) => {
            if (token?.name === 'ChangeDetectorRef') {
                return mockCdr;
            }
            return mockNavigationService;
        },
    };
});

import { AdminLimitsResourceComponent } from '../AdminLimits/admin-limits-resource.component';
import { AdminLimitsService } from '../AdminLimits/services/admin-limits.service';

interface StoredAgentRow {
    ID: string;
    Name: string;
    DriverClass: string | null;
    MaxCostPerRun: number | null;
    MaxTokensPerRun: number | null;
    MaxTimePerRun: number | null;
    MaxIterationsPerRun: number | null;
    TypeConfiguration: string | null;
}

interface StoredUserPolicyRow {
    ID: string;
    AgentID: string;
    UserID: string;
    Status: string;
    InstructionsOverride: string | null;
}

interface StoredAgentRunRow {
    ID: string;
    AgentID: string;
    Agent: string;
    UserID: string;
    User: string;
    Status: string;
    StartedAt: Date;
    CompletedAt: Date | null;
    TotalCost: number;
    TotalCostRollup: number;
    TotalTokensUsed: number;
    TotalPromptIterations: number;
    Data: string | null;
    Message: string | null;
    Success: boolean | null;
    ErrorMessage: string | null;
    FinalPayload: string | null;
    FinalPayloadObject: RunawayJsonObject | null;
    Steps: MJAIAgentRunEntityExtended['Steps'];
}

const AGENT_ID_PLANNER = '55555555-5555-4555-8555-555555555551';
const AGENT_ID_RESEARCH = '55555555-5555-4555-8555-555555555552';
const PAUSED_RUN_ID = '33333333-3333-4333-8333-333333333331';
const ACTIVE_RUN_ID = '44444444-4444-4444-8444-444444444442';

describe('AdminLimitsResourceComponent -> AdminLimitsService -> Production LimitsOperations round-trip (CR-UI-BROWSER-EVIDENCE-MISSING)', () => {
    const ownerUser = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'Alice Owner',
        Email: 'alice@example.com',
        Type: 'Owner',
        UserRoles: [],
    } as Partial<UserInfo> as UserInfo;

    const nonAdminUser = {
        ID: '22222222-2222-4222-8222-222222222222',
        Name: 'Bob Standard',
        Email: 'bob@example.com',
        Type: 'User',
        UserRoles: [],
    } as Partial<UserInfo> as UserInfo;

    let actingUser: UserInfo;
    let agents: Map<string, StoredAgentRow>;
    let policies: StoredUserPolicyRow[];
    let runs: Map<string, StoredAgentRunRow>;
    let provider: IMetadataProvider & IRemoteOperationProvider;
    let service: AdminLimitsService;
    let component: AdminLimitsResourceComponent;
    let resumeWorkerSpy: ReturnType<typeof vi.spyOn>;

    function wrapAgentRunEntity(initial?: StoredAgentRunRow): MJAIAgentRunEntityExtended {
        const backing: StoredAgentRunRow = initial
            ? { ...initial }
            : {
                  ID: randomUUID(),
                  AgentID: AGENT_ID_PLANNER,
                  Agent: 'PlannerAgent',
                  UserID: ownerUser.ID,
                  User: 'Alice Owner',
                  Status: 'Running',
                  StartedAt: new Date(),
                  CompletedAt: null,
                  TotalCost: 0,
                  TotalCostRollup: 0,
                  TotalTokensUsed: 0,
                  TotalPromptIterations: 0,
                  Data: null,
                  Message: null,
                  Success: null,
                  ErrorMessage: null,
                  FinalPayload: null,
                  FinalPayloadObject: null,
                  Steps: [],
              };
        let cpCache: RunawayCheckpointState | null = null;
        const entity = {
            get ID() { return backing.ID; },
            set ID(v: string) { backing.ID = v; },
            get AgentID() { return backing.AgentID; },
            set AgentID(v: string) { backing.AgentID = v; },
            get Agent() { return backing.Agent; },
            set Agent(v: string) { backing.Agent = v; },
            get UserID() { return backing.UserID; },
            set UserID(v: string) { backing.UserID = v; },
            get User() { return backing.User; },
            set User(v: string) { backing.User = v; },
            get Status() { return backing.Status; },
            set Status(v: string) { backing.Status = v; },
            get StartedAt() { return backing.StartedAt; },
            set StartedAt(v: Date) { backing.StartedAt = v; },
            get CompletedAt() { return backing.CompletedAt; },
            set CompletedAt(v: Date | null) { backing.CompletedAt = v; },
            get TotalCost() { return backing.TotalCost; },
            set TotalCost(v: number) { backing.TotalCost = v; },
            get TotalCostRollup() { return backing.TotalCostRollup; },
            set TotalCostRollup(v: number) { backing.TotalCostRollup = v; },
            get TotalTokensUsed() { return backing.TotalTokensUsed; },
            set TotalTokensUsed(v: number) { backing.TotalTokensUsed = v; },
            get TotalPromptIterations() { return backing.TotalPromptIterations; },
            set TotalPromptIterations(v: number) { backing.TotalPromptIterations = v; },
            get Data() { return backing.Data; },
            set Data(v: string | null) { backing.Data = v; },
            get Message() { return backing.Message; },
            set Message(v: string | null) { backing.Message = v; },
            get Success() { return backing.Success; },
            set Success(v: boolean | null) { backing.Success = v; },
            get ErrorMessage() { return backing.ErrorMessage; },
            set ErrorMessage(v: string | null) { backing.ErrorMessage = v; },
            get FinalPayload() { return backing.FinalPayload; },
            set FinalPayload(v: string | null) { backing.FinalPayload = v; },
            get FinalPayloadObject() { return backing.FinalPayloadObject; },
            set FinalPayloadObject(v: RunawayJsonObject | null) { backing.FinalPayloadObject = v; },
            get Steps() { return backing.Steps; },
            get RunawayCheckpoint(): RunawayCheckpointState | null {
                return cpCache ?? ExtractRunawayCheckpointFromRunData(backing.Data);
            },
            set RunawayCheckpoint(v: RunawayCheckpointState | null) {
                cpCache = v;
            },
            LatestResult: { CompleteMessage: '' } as MJAIAgentRunEntityExtended['LatestResult'],
            Load: async (id: string) => {
                const found = runs.get(id.toLowerCase());
                if (!found) return false;
                Object.assign(backing, found);
                cpCache = null;
                return true;
            },
            Save: async () => {
                runs.set(backing.ID.toLowerCase(), { ...backing });
                return true;
            },
        };
        return entity as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
    }

    beforeEach(async () => {
        vi.restoreAllMocks();
        LoadLimitsOperations();
        InstallDefaultResumeContinuationDispatcher(true);
        ActiveRunGovernanceRegistry.Instance.ClearPendingCheckpointPersistence();
        ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);

        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            AgentChannelConsecutiveTurns: 1500,
            Budgets: {
                PerRun: { MaxCostUsd: 25 },
                PerUserPerDay: { MaxCostUsd: 100 },
            },
        });

        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined);

        actingUser = ownerUser;
        agents = new Map([
            [
                AGENT_ID_PLANNER.toLowerCase(),
                {
                    ID: AGENT_ID_PLANNER,
                    Name: 'PlannerAgent',
                    DriverClass: null,
                    MaxCostPerRun: null,
                    MaxTokensPerRun: null,
                    MaxTimePerRun: null,
                    MaxIterationsPerRun: null,
                    TypeConfiguration: null,
                },
            ],
            [
                AGENT_ID_RESEARCH.toLowerCase(),
                {
                    ID: AGENT_ID_RESEARCH,
                    Name: 'ResearchAgent',
                    DriverClass: null,
                    MaxCostPerRun: null,
                    MaxTokensPerRun: null,
                    MaxTimePerRun: null,
                    MaxIterationsPerRun: null,
                    TypeConfiguration: null,
                },
            ],
        ]);
        policies = [
            {
                ID: '66666666-6666-4666-8666-666666666666',
                AgentID: AGENT_ID_PLANNER,
                UserID: ownerUser.ID,
                Status: 'Active',
                InstructionsOverride: '<!-- mj-limits: {"Budgets":{"PerRun":{"MaxCostUsd":20}}} -->',
            },
        ];
        runs = new Map();

        const routedProvider: Partial<IMetadataProvider & IRemoteOperationProvider & IRunViewProvider> = {
            Entities: [],
            Authorizations: [],
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: AI Agent Runs') {
                    return wrapAgentRunEntity();
                }
                return {
                    ID: randomUUID(),
                    LatestResult: { CompleteMessage: '' },
                    Load: async () => false,
                    Save: async () => true,
                };
            },
            RunView: async <T = MJAIAgentRunEntityExtended>(params: RunViewParams): Promise<RunViewResult<T>> => {
                const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                if (params.EntityName === 'MJ: AI Agents') {
                    const idMatch = /ID='([^']+)'/.exec(filter);
                    const list = idMatch?.[1]
                        ? Array.from(agents.values()).filter((a) => a.ID.toLowerCase() === idMatch[1].toLowerCase())
                        : Array.from(agents.values());
                    return {
                        Success: true,
                        Results: list as Array<T>,
                        RowCount: list.length,
                        TotalRowCount: list.length,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                    };
                }
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: policies as Array<T>,
                        RowCount: policies.length,
                        TotalRowCount: policies.length,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                    };
                }
                if (params.EntityName === 'MJ: AI Agent Runs') {
                    let list = Array.from(runs.values());
                    if (filter.includes("Status='Paused'")) {
                        list = list.filter((r) => r.Status === 'Paused');
                    }
                    return {
                        Success: true,
                        Results: list as Array<T>,
                        RowCount: list.length,
                        TotalRowCount: list.length,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                    };
                }
                return {
                    Success: true,
                    Results: [] as Array<T>,
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            },
            RunViews: async <T = MJAIAgentRunEntityExtended>(items: RunViewParams[]): Promise<RunViewResult<T>[]> =>
                Promise.all(items.map((i) => routedProvider.RunView!<T>(i))),
            RouteOperation: async <TInput, TOutput>(
                operationKey: string,
                input: TInput,
                _options?: RemoteOpInvokeOptions,
            ): Promise<RemoteOpResult<TOutput>> => {
                return DispatchRemoteOperationInProcess<TInput, TOutput>(
                    operationKey,
                    input,
                    {
                        provider: routedProvider as IMetadataProvider,
                        user: actingUser,
                    },
                    routedProvider as IMetadataProvider,
                    actingUser,
                );
            },
        };
        provider = routedProvider as IMetadataProvider & IRemoteOperationProvider;
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        // Seed paused run via real RunawayCheckpointManager.PauseRunWithCheckpoint
        const pausedResolution = LimitsConfigResolver.Instance.Resolve(
            {
                UserAgentPolicy: { Budgets: { PerRun: { MaxCostUsd: 20 } } },
                RunOverride: { Budgets: { PerRun: { MaxCostUsd: 50 } } },
            },
            { EnforceUserPolicyAsCeiling: true },
        );
        const pausedSnapshot = BuildLimitsDiagnosticsSnapshot(pausedResolution, {
            AgentID: AGENT_ID_PLANNER,
            AgentName: 'PlannerAgent',
            AgentRunID: PAUSED_RUN_ID,
            UserID: ownerUser.ID,
        });
        let pausedData = AttachLimitsDiagnosticsToRunData(null, pausedSnapshot);
        pausedData = AppendProgressDiagnosticToRunData(
            pausedData,
            {
                Checked: true,
                WindowSize: 6,
                SampleCount: 6,
                Classification: 'Stalled',
                ProgressScore: 0.41,
                Reason: 'Fast judge flagged oscillating loop',
                Signals: {
                    RecordsCreatedOrChangedTotal: 0,
                    RecordsCreatedOrChangedRate: 0,
                    TasksClosedTotal: 0,
                    TasksClosedRate: 0,
                    DistinctOutputsCount: 2,
                    DistinctOutputRatio: 0.33,
                    RepeatedTextSimilarity: 0.9,
                    TokensSpentTotal: 8000,
                    ProgressUnitsTotal: 0,
                    TokensPerProgressUnit: Number.POSITIVE_INFINITY,
                    TokenEfficiencyScore: 0,
                    OutputLengthVariance: 10,
                    HeapDeltaBytes: 512,
                    HeapGrowthRatio: 0.01,
                    VarianceHealthScore: 0.4,
                    DuplicateStepRatio: 0.85,
                    ZeroPayloadDeltaStreak: 5,
                    RepeatingErrorStreak: 0,
                },
                FastJudgeInvoked: true,
                FastJudgeResult: {
                    Converging: false,
                    Reason: 'Oscillating without creating records',
                    LatencyMs: 20,
                    TimedOut: false,
                    UsedFallback: false,
                    Source: 'Model',
                },
            },
            6,
        );
        runs.set(PAUSED_RUN_ID.toLowerCase(), {
            ID: PAUSED_RUN_ID,
            AgentID: AGENT_ID_PLANNER,
            Agent: 'PlannerAgent',
            UserID: ownerUser.ID,
            User: 'Alice Owner',
            Status: 'Running',
            StartedAt: new Date('2026-11-21T10:00:00.000Z'),
            CompletedAt: null,
            TotalCost: 1.25,
            TotalCostRollup: 1.25,
            TotalTokensUsed: 8000,
            TotalPromptIterations: 10,
            Data: pausedData,
            Message: null,
            Success: null,
            ErrorMessage: null,
            FinalPayload: null,
            FinalPayloadObject: null,
            Steps: [],
        });

        const checkpointMgr = new RunawayCheckpointManager();
        const pausedEntity = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ownerUser);
        await pausedEntity.Load(PAUSED_RUN_ID);
        await checkpointMgr.PauseRunWithCheckpoint({
            AgentRun: pausedEntity,
            AgentID: AGENT_ID_PLANNER,
            AgentName: 'PlannerAgent',
            UserID: ownerUser.ID,
            RoutineID: null,
            PauseReason: 'FastJudgeStalled',
            Summary: 'Paused by FastConvergenceJudge',
            CompletedPromptTurns: 5,
            CompletedNodeIDs: ['step-1', 'step-2'],
            ConversationMessages: [{ role: 'user', content: 'Run planner' }],
            InFlightPayload: { step: 5 },
            Scratchpad: { notes: 'halfway', tasks: [] },
            CumulativeLedger: {
                RunCostUsd: 1.25,
                RunWallClockMs: 5200,
                RunTokens: 8000,
                RoutineCostUsd: 1.25,
                RoutineWallClockMs: 5200,
                UserDailyCostUsd: 1.25,
                UserDailyWallClockMs: 5200,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: '2026-11-21T10:01:00.000Z',
            },
            Provider: provider,
            ContextUser: ownerUser,
        });

        // Seed active running run with real Limits diagnostics and cooperative pause handle
        const activeSnapshot = BuildLimitsDiagnosticsSnapshot(
            LimitsConfigResolver.Instance.Resolve({ MjConfig: { AgentChannelConsecutiveTurns: 1500 } }),
            {
                AgentID: AGENT_ID_RESEARCH,
                AgentName: 'ResearchAgent',
                AgentRunID: ACTIVE_RUN_ID,
                UserID: ownerUser.ID,
            },
        );
        runs.set(ACTIVE_RUN_ID.toLowerCase(), {
            ID: ACTIVE_RUN_ID,
            AgentID: AGENT_ID_RESEARCH,
            Agent: 'ResearchAgent',
            UserID: ownerUser.ID,
            User: 'Alice Owner',
            Status: 'Running',
            StartedAt: new Date('2026-11-21T10:05:00.000Z'),
            CompletedAt: null,
            TotalCost: 0.4,
            TotalCostRollup: 0.4,
            TotalTokensUsed: 2500,
            TotalPromptIterations: 4,
            Data: AttachLimitsDiagnosticsToRunData(null, activeSnapshot),
            Message: null,
            Success: null,
            ErrorMessage: null,
            FinalPayload: null,
            FinalPayloadObject: null,
            Steps: [],
        });

        ActiveRunGovernanceRegistry.Instance.RegisterActiveRun(
            {
                AgentRunID: ACTIVE_RUN_ID,
                Provider: provider,
                RequestPause: async (summary) => {
                    const activeEntity = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ownerUser);
                    await activeEntity.Load(ACTIVE_RUN_ID);
                    const outcome = await checkpointMgr.PauseRunWithCheckpoint({
                        AgentRun: activeEntity,
                        AgentID: AGENT_ID_RESEARCH,
                        AgentName: 'ResearchAgent',
                        UserID: ownerUser.ID,
                        RoutineID: null,
                        PauseReason: 'ManualPause',
                        Summary: summary ?? 'Paused from AdminLimits console',
                        CompletedPromptTurns: 4,
                        ConversationMessages: [{ role: 'user', content: 'Research task' }],
                        InFlightPayload: { ok: true },
                        Scratchpad: { notes: 'active', tasks: [] },
                        CumulativeLedger: {
                            RunCostUsd: 0.4,
                            RunWallClockMs: 2100,
                            RunTokens: 2500,
                            RoutineCostUsd: 0.4,
                            RoutineWallClockMs: 2100,
                            UserDailyCostUsd: 0.4,
                            UserDailyWallClockMs: 2100,
                            PausedWallClockMs: 0,
                            PausedIntervals: [],
                            DayBucketUTC: '2026-11-21',
                            DayBoundaryTimezone: 'UTC',
                            AsOfISO: new Date().toISOString(),
                        },
                        Provider: provider,
                        ContextUser: ownerUser,
                    });
                    return {
                        Paused: outcome.Saved,
                        CheckpointID: outcome.Checkpoint.CheckpointID,
                        Status: activeEntity.Status,
                        Summary: outcome.Checkpoint.Summary,
                    };
                },
            },
            provider,
        );

        resumeWorkerSpy = vi.spyOn(BaseAgent.prototype, 'ResumePausedRun').mockImplementation(async (params) => {
            const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ownerUser);
            if (params.resumeCheckpointRunId) {
                await run.Load(params.resumeCheckpointRunId);
            }
            return {
                success: true,
                agentRun: run,
            } as Awaited<ReturnType<BaseAgent['ResumePausedRun']>>;
        });

        service = new AdminLimitsService();
        component = new AdminLimitsResourceComponent(
            mockCdr as Partial<ChangeDetectorRef> as ChangeDetectorRef,
            service,
        );
        Reflect.defineProperty(component, 'ProviderToUse', {
            get: () => provider,
            configurable: true,
        });
    });

    afterEach(() => {
        ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(ACTIVE_RUN_ID, provider);
        ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
    });

    it('registers the real production LimitsOperations subclasses in ClassFactory with no substitute overrides', () => {
        expect(
            MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, LIMITS_GET_DIAGNOSTICS_OPERATION_KEY)?.SubClass,
        ).toBe(LimitsGetDiagnosticsServerOperation);
        expect(
            MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY)?.SubClass,
        ).toBe(LimitsResumePausedRunServerOperation);
        expect(
            MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, LIMITS_PAUSE_RUN_OPERATION_KEY)?.SubClass,
        ).toBe(LimitsPauseRunServerOperation);
    });

    it('round-trips GetDiagnostics, ResumePausedRun, and PauseRun through real AdminLimitsResourceComponent -> AdminLimitsService -> production LimitsOperations', async () => {
        await component.RefreshDiagnostics();
        expect(component.LoadError).toBeNull();
        expect(component.Diagnostics?.PausedRuns).toHaveLength(1);
        expect(component.Diagnostics?.BudgetUtilization.ActiveRunCount).toBe(1);

        // Selecting paused run provides AgentID + UserID to Tier 3/4 resolution in LimitsGetDiagnosticsServerOperation
        const pausedRun = component.Diagnostics!.PausedRuns[0];
        component.SelectRun(pausedRun);
        await component.RefreshDiagnostics();
        expect(component.Diagnostics?.ResolvedLimits.Budgets.PerRun.MaxCostUsd).toBe(20);
        expect(component.Diagnostics?.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('UserAgentPolicy');

        // Approve & Resume through real LimitsResumePausedRunServerOperation -> RunawayCheckpointManager -> DefaultResumeContinuationDispatcher
        component.OpenResumeModal(pausedRun);
        component.AdditionalCostUsdInput = '15';
        component.DecisionNotesInput = 'Approved in production round-trip test';
        await component.ConfirmResumePausedRun();
        await new Promise((r) => setTimeout(r, 20));

        expect(component.LoadError).toBeNull();
        expect(component.ActionFeedback).toContain('approved and transitioned back to Running');
        expect(component.Diagnostics?.PausedRuns).toHaveLength(0);
        expect(component.Diagnostics?.BudgetUtilization.ActiveRunCount).toBe(2);
        expect(resumeWorkerSpy).toHaveBeenCalledTimes(1);
        expect(resumeWorkerSpy.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({ resumeCheckpointRunId: PAUSED_RUN_ID }),
        );

        // Pause active run through real LimitsPauseRunServerOperation -> ActiveRunGovernanceRegistry -> RunawayCheckpointManager
        const activeRun = component.Diagnostics!.ActiveAndRecentRuns.find((r) => r.AgentRunID === ACTIVE_RUN_ID)!;
        await component.PauseActiveRun(activeRun);
        expect(component.LoadError).toBeNull();
        expect(component.ActionFeedback).toContain('cooperatively paused at safe boundary');
        expect(component.Diagnostics?.PausedRuns).toHaveLength(1);
        expect(component.Diagnostics?.PausedRuns[0].AgentRunID).toBe(ACTIVE_RUN_ID);
        expect(component.Diagnostics?.PausedRuns[0].IsPausedWithCheckpoint).toBe(true);
    });

    it('surfaces FORBIDDEN BaseRemotableOperation errors fail-closed from production Authorize()', async () => {
        await component.RefreshDiagnostics();
        actingUser = nonAdminUser;

        const activeRun = component.Diagnostics!.ActiveAndRecentRuns.find((r) => r.AgentRunID === ACTIVE_RUN_ID)!;
        await component.PauseActiveRun(activeRun);

        expect(component.LoadError).toContain('FORBIDDEN');
        expect(runs.get(ACTIVE_RUN_ID.toLowerCase())?.Status).toBe('Running');
    });
});
