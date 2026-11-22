import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseRemotableOperation,
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    AttachLimitsDiagnosticsToRunData,
    AttachRunawayCheckpointToRunData,
    AppendProgressDiagnosticToRunData,
    BuildLimitsDiagnosticsSnapshot,
    LIMITS_GET_DIAGNOSTICS_OPERATION_KEY,
    LIMITS_PAUSE_RUN_OPERATION_KEY,
    LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY,
    type MJAIAgentRunEntityExtended,
    type RunawayCheckpointState,
} from '@memberjunction/ai-core-plus';
import { ActiveRunGovernanceRegistry } from '../ActiveRunGovernanceRegistry';
import { BaseAgent } from '../base-agent';
import {
    LimitsGetDiagnosticsServerOperation,
    LimitsPauseRunServerOperation,
    LimitsResumePausedRunServerOperation,
    LoadLimitsOperations,
} from '../operations/LimitsOperations';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

const OWNER_USER: UserInfo = {
    ID: '11111111-1111-4111-8111-111111111111',
    Name: 'Alice Owner',
    Email: 'alice@example.com',
    Type: 'Owner',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const STANDARD_USER: UserInfo = {
    ID: '22222222-2222-4222-8222-222222222222',
    Name: 'Bob User',
    Email: 'bob@example.com',
    Type: 'User',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const RUN_ID_PAUSED = '33333333-3333-4333-8333-333333333333';
const RUN_ID_ACTIVE = '44444444-4444-4444-8444-444444444444';
const AGENT_ID = '55555555-5555-4555-8555-555555555555';

describe('Limits.* BaseRemotableOperation implementations', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        LoadLimitsOperations();
    });

    it('registers all three Limits.* operations on MJGlobal ClassFactory under BaseRemotableOperation', () => {
        expect(
            MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, LIMITS_GET_DIAGNOSTICS_OPERATION_KEY),
        ).toBeDefined();
        expect(
            MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY),
        ).toBeDefined();
        expect(
            MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, LIMITS_PAUSE_RUN_OPERATION_KEY),
        ).toBeDefined();
    });

    it('rejects non-Owner/non-Admin callers via Authorize() fail-closed', async () => {
        const provider = { Authorizations: [] } as Partial<IMetadataProvider> as IMetadataProvider;
        const diagOp = new LimitsGetDiagnosticsServerOperation();
        const resumeOp = new LimitsResumePausedRunServerOperation();
        const pauseOp = new LimitsPauseRunServerOperation();

        const diagRes = await diagOp.ExecuteServer({}, {
            provider,
            user: STANDARD_USER,
            emitProgress: () => undefined,
        });
        expect(diagRes.Success).toBe(false);
        expect(diagRes.ResultCode).toBe('FORBIDDEN');

        const resumeRes = await resumeOp.ExecuteServer(
            { AgentRunID: RUN_ID_PAUSED },
            { provider, user: STANDARD_USER, emitProgress: () => undefined },
        );
        expect(resumeRes.Success).toBe(false);
        expect(resumeRes.ResultCode).toBe('FORBIDDEN');

        const pauseRes = await pauseOp.ExecuteServer(
            { AgentRunID: RUN_ID_ACTIVE },
            { provider, user: STANDARD_USER, emitProgress: () => undefined },
        );
        expect(pauseRes.Success).toBe(false);
        expect(pauseRes.ResultCode).toBe('FORBIDDEN');
    });

    it('returns resolved 5-tier hierarchy, approved backstops, budget utilization, progress & fast-judge diagnostics, and paused runs', async () => {
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            AgentChannelConsecutiveTurns: 1500,
            Budgets: {
                PerRun: { MaxCostUsd: 25 },
                PerUserPerDay: { MaxCostUsd: 100 },
            },
        });

        const resolution = LimitsConfigResolver.Instance.Resolve({
            RunOverride: { BriefingContributorTimeoutMs: 7500 },
        });
        const snapshot = BuildLimitsDiagnosticsSnapshot(resolution, {
            AgentID: AGENT_ID,
            AgentName: 'ResearchPlanner',
            AgentRunID: RUN_ID_PAUSED,
            UserID: OWNER_USER.ID,
        });

        let pausedData = AttachLimitsDiagnosticsToRunData(null, snapshot);
        pausedData = AppendProgressDiagnosticToRunData(
            pausedData,
            {
                Checked: true,
                WindowSize: 6,
                SampleCount: 6,
                Classification: 'Stalled',
                ProgressScore: 0.42,
                Reason: 'Ambiguous window evaluated by fast judge',
                Signals: {
                    RecordsCreatedOrChangedTotal: 0,
                    RecordsCreatedOrChangedRate: 0,
                    TasksClosedTotal: 0,
                    TasksClosedRate: 0,
                    DistinctOutputsCount: 2,
                    DistinctOutputRatio: 0.33,
                    RepeatedTextSimilarity: 0.89,
                    TokensSpentTotal: 9000,
                    ProgressUnitsTotal: 0,
                    TokensPerProgressUnit: Number.POSITIVE_INFINITY,
                    TokenEfficiencyScore: 0,
                    OutputLengthVariance: 12,
                    HeapDeltaBytes: 1024,
                    HeapGrowthRatio: 0.01,
                    VarianceHealthScore: 0.4,
                    DuplicateStepRatio: 0.83,
                    ZeroPayloadDeltaStreak: 5,
                    RepeatingErrorStreak: 0,
                },
                FastJudgeInvoked: true,
                FastJudgeResult: {
                    Converging: false,
                    Reason: 'Oscillating without new record writes',
                    LatencyMs: 18,
                    TimedOut: false,
                    UsedFallback: false,
                    Source: 'Model',
                },
            },
            6,
        );

        const checkpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-diag-1',
            AgentRunID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            AgentName: 'ResearchPlanner',
            UserID: OWNER_USER.ID,
            RoutineID: null,
            PausedAtISO: new Date().toISOString(),
            PausedAtMs: Date.now(),
            PauseReason: 'FastJudgeStalled',
            Summary: 'Paused by fast judge after oscillating iterations',
            CompletedStepCount: 6,
            CompletedStepIDs: ['s1', 's2'],
            CompletedPromptTurns: 6,
            CompletedNodeIDs: [],
            ConversationMessages: [{ Role: 'user', Content: 'Research market trends' }],
            InFlightPayload: { partialCount: 4 },
            Scratchpad: { notes: 'Halfway done', tasks: [] },
            NextStepSummary: 'Actions',
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 0.75,
                RunWallClockMs: 4200,
                RunTokens: 9000,
                RoutineCostUsd: 0.75,
                RoutineWallClockMs: 4200,
                UserDailyCostUsd: 0.75,
                UserDailyWallClockMs: 4200,
                PausedWallClockMs: 0,
                PausedIntervals: [{ PausedAtMs: Date.now() - 1000, ResumedAtMs: null }],
                DayBucketUTC: new Date().toISOString().slice(0, 10),
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date().toISOString(),
            },
            HumanApproval: { Status: 'Pending' },
        };
        pausedData = AttachRunawayCheckpointToRunData(pausedData, checkpoint);

        const nowIso = new Date().toISOString();
        const recentRows = [
            {
                ID: RUN_ID_ACTIVE,
                AgentID: AGENT_ID,
                Agent: 'ResearchPlanner',
                UserID: OWNER_USER.ID,
                User: 'Alice Owner',
                Status: 'Running',
                StartedAt: nowIso,
                CompletedAt: null,
                TotalCost: 1.25,
                TotalCostRollup: 1.25,
                TotalTokensUsed: 4000,
                TotalPromptIterations: 12,
                Data: AttachLimitsDiagnosticsToRunData(null, snapshot),
                Message: null,
            },
        ];
        const pausedRows = [
            {
                ID: RUN_ID_PAUSED,
                AgentID: AGENT_ID,
                Agent: 'ResearchPlanner',
                UserID: OWNER_USER.ID,
                User: 'Alice Owner',
                Status: 'Paused',
                StartedAt: nowIso,
                CompletedAt: null,
                TotalCost: 0.75,
                TotalCostRollup: 0.75,
                TotalTokensUsed: 9000,
                TotalPromptIterations: 6,
                Data: pausedData,
                Message: 'Paused by fast judge after oscillating iterations',
            },
        ];

        const runViewsSpy = vi.fn(async () => [
            { Success: true, Results: recentRows },
            { Success: true, Results: pausedRows },
        ]);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunViews: runViewsSpy,
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        } as Partial<RunView> as RunView);

        const provider = { Authorizations: [] } as Partial<IMetadataProvider> as IMetadataProvider;
        const diagOp = new LimitsGetDiagnosticsServerOperation();
        const result = await diagOp.ExecuteServer(
            { RunOverride: { BriefingContributorTimeoutMs: 7500 } },
            { provider, user: OWNER_USER, emitProgress: () => undefined },
        );

        expect(result.Success).toBe(true);
        const output = result.Output!;
        expect(output.TierPrecedence).toEqual([
            'CodeFallback',
            'MjConfig',
            'AgentOrWorkflowMetadata',
            'UserAgentPolicy',
            'RunOverride',
        ]);
        expect(output.ResolvedLimits.AgentChannelConsecutiveTurns).toBe(1500);
        expect(output.ResolvedLimits.AgentAbsoluteIterations).toBe(CODE_FALLBACK_LIMITS.AgentAbsoluteIterations);
        expect(output.Provenance['AgentChannelConsecutiveTurns'].SourceTier).toBe('MjConfig');
        expect(output.Provenance['BriefingContributorTimeoutMs'].SourceTier).toBe('RunOverride');
        expect(output.ApprovedBackstops).toHaveLength(9);
        expect(output.BudgetUtilization.ActiveRunCount).toBe(1);
        expect(output.BudgetUtilization.PausedRunCount).toBe(1);
        expect(output.BudgetUtilization.TotalObservedCostUsd).toBeCloseTo(2.0, 5);
        expect(output.PausedRuns).toHaveLength(1);
        expect(output.PausedRuns[0].FastJudgeEntries).toHaveLength(1);
        expect(output.PausedRuns[0].FastJudgeEntries[0].Reason).toContain('Oscillating');
        expect(output.PausedRuns[0].HumanApprovalStatus).toBe('Pending');
    });

    it('approves and resumes a paused run via Limits.ResumePausedRun preserving checkpoint state and cumulative ledger', async () => {
        const storedCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-resume-1',
            AgentRunID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            AgentName: 'BudgetAgent',
            UserID: OWNER_USER.ID,
            RoutineID: null,
            PausedAtISO: new Date(Date.now() - 5000).toISOString(),
            PausedAtMs: Date.now() - 5000,
            PauseReason: 'BudgetExceeded',
            Summary: 'Paused on PerRun budget',
            CompletedStepCount: 8,
            CompletedStepIDs: ['s1', 's2', 's3'],
            CompletedPromptTurns: 4,
            CompletedNodeIDs: ['n1', 'n2'],
            ConversationMessages: [{ Role: 'user', Content: 'Continue batch' }],
            InFlightPayload: { batchesDone: ['A', 'B'] },
            Scratchpad: { notes: 'Batch B complete', tasks: [] },
            NextStepSummary: 'Actions',
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 1.5,
                RunWallClockMs: 12_000,
                RunTokens: 5000,
                RoutineCostUsd: 1.5,
                RoutineWallClockMs: 12_000,
                UserDailyCostUsd: 1.5,
                UserDailyWallClockMs: 12_000,
                PausedWallClockMs: 0,
                PausedIntervals: [{ PausedAtMs: Date.now() - 5000, ResumedAtMs: null }],
                DayBucketUTC: new Date().toISOString().slice(0, 10),
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date().toISOString(),
            },
            HumanApproval: { Status: 'Pending' },
        };

        let dataJson = AttachRunawayCheckpointToRunData(null, storedCheckpoint);
        let runStatus = 'Paused';
        let completedAt: Date | null = null;
        let errorMessage: string | null = null;
        let checkpointObj: RunawayCheckpointState | null = storedCheckpoint;

        const runEntity = {
            ID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            Agent: 'BudgetAgent',
            UserID: OWNER_USER.ID,
            get Status() {
                return runStatus;
            },
            set Status(val: string) {
                runStatus = val;
            },
            get CompletedAt() {
                return completedAt;
            },
            set CompletedAt(val: Date | null) {
                completedAt = val;
            },
            get ErrorMessage() {
                return errorMessage;
            },
            set ErrorMessage(val: string | null) {
                errorMessage = val;
            },
            get Data() {
                return dataJson;
            },
            set Data(val: string | null) {
                dataJson = val ?? '';
            },
            get RunawayCheckpoint() {
                return checkpointObj;
            },
            set RunawayCheckpoint(val: RunawayCheckpointState | null) {
                checkpointObj = val;
            },
            LatestResult: { CompleteMessage: '' },
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => true),
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;

        const provider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => runEntity),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const resumeOp = new LimitsResumePausedRunServerOperation();
        const res = await resumeOp.ExecuteServer(
            {
                AgentRunID: RUN_ID_PAUSED,
                BudgetExtension: {
                    NewPerRunMaxCostUsd: 5.0,
                    AdditionalWallClockMs: 60_000,
                },
                DecisionNotes: 'Approved additional $5 budget',
            },
            { provider, user: OWNER_USER, emitProgress: () => undefined },
        );

        expect(res.Success).toBe(true);
        expect(res.Output?.Status).toBe('Running');
        expect(res.Output?.ApprovalStatus).toBe('Approved');
        expect(res.Output?.ExtendedBudgets?.PerRun.MaxCostUsd).toBe(5.0);
        expect(res.Output?.PriorCumulativeCostUsd).toBe(1.5);
        expect(res.Output?.PriorCumulativeActiveWallClockMs).toBe(12_000);
        expect(res.Output?.StartingStepCount).toBe(8);
        expect(res.Output?.StartingPromptTurns).toBe(4);
    });

    it('computes budget extensions against persisted LimitsDiagnosticsSnapshot and dispatches continuation idempotently through completion (CR-2)', async () => {
        ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);

        const baseRes = LimitsConfigResolver.Instance.Resolve({
            AgentOrWorkflowMetadata: { Budgets: { PerRun: { MaxCostUsd: 2.0, MaxWallClockMs: 30_000 } } },
        });
        const snapshot = BuildLimitsDiagnosticsSnapshot(baseRes, {
            AgentID: AGENT_ID,
            AgentRunID: RUN_ID_PAUSED,
            UserID: OWNER_USER.ID,
            RoutineID: 'routine-resume-1',
        });

        const storedCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-cr2-1',
            AgentRunID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            AgentName: 'BudgetAgent',
            UserID: OWNER_USER.ID,
            RoutineID: 'routine-resume-1',
            PausedAtISO: new Date(Date.now() - 2000).toISOString(),
            PausedAtMs: Date.now() - 2000,
            PauseReason: 'BudgetExceeded',
            Summary: 'Paused at $2.00 ceiling',
            CompletedStepCount: 3,
            CompletedStepIDs: ['s1'],
            CompletedPromptTurns: 2,
            CompletedNodeIDs: [],
            ConversationMessages: [{ Role: 'user', Content: 'Run job' }],
            InFlightPayload: { step: 3 },
            Scratchpad: { notes: 'Halfway done', tasks: [] },
            NextStepSummary: 'Actions',
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 2.0,
                RunWallClockMs: 5_000,
                RunTokens: 1000,
                RoutineCostUsd: 2.0,
                RoutineWallClockMs: 5_000,
                UserDailyCostUsd: 2.0,
                UserDailyWallClockMs: 5_000,
                PausedWallClockMs: 0,
                PausedIntervals: [{ PausedAtMs: Date.now() - 2000, ResumedAtMs: null }],
                DayBucketUTC: new Date().toISOString().slice(0, 10),
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date().toISOString(),
            },
            HumanApproval: { Status: 'Pending' },
        };

        let runStatus = 'Paused';
        let dataJson = AttachLimitsDiagnosticsToRunData(AttachRunawayCheckpointToRunData(null, storedCheckpoint), snapshot);
        let checkpointObj: RunawayCheckpointState | null = storedCheckpoint;

        const runEntity = {
            ID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            Agent: 'BudgetAgent',
            UserID: OWNER_USER.ID,
            get Status() {
                return runStatus;
            },
            set Status(v: string) {
                runStatus = v;
            },
            CompletedAt: null as Date | null,
            ErrorMessage: null as string | null,
            get Data() {
                return dataJson;
            },
            set Data(v: string | null) {
                dataJson = v ?? '';
            },
            get RunawayCheckpoint() {
                return checkpointObj;
            },
            set RunawayCheckpoint(v: RunawayCheckpointState | null) {
                checkpointObj = v;
            },
            LatestResult: { CompleteMessage: '' },
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => true),
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;

        const provider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => runEntity),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const dispatchedCalls: Array<{ RunID: string; RoutineID: string | null; MaxCostUsd: number | null }> = [];
        BaseAgent.RegisterResumeContinuationDispatcher(async (dispatchInput) => {
            dispatchedCalls.push({
                RunID: dispatchInput.AgentRunID,
                RoutineID: dispatchInput.RoutineID,
                MaxCostUsd: dispatchInput.RestoredContext.ExtendedBudgets.PerRun.MaxCostUsd,
            });
            runEntity.Status = 'Completed';
            return {
                Dispatched: true,
                Claimed: true,
                Completed: true,
                Status: 'Completed',
                Message: 'Continued worker to completion.',
            };
        });

        try {
            const resumeOp = new LimitsResumePausedRunServerOperation();
            const first = await resumeOp.ExecuteServer(
                {
                    AgentRunID: RUN_ID_PAUSED,
                    BudgetExtension: { AdditionalCostUsd: 3.5 },
                },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );

            expect(first.Success).toBe(true);
            // Extended against snapshot's $2.00 + $3.50 = $5.50 (NOT global null!)
            expect(first.Output?.ExtendedBudgets?.PerRun.MaxCostUsd).toBe(5.5);
            expect(first.Output?.Status).toBe('Completed');
            expect(dispatchedCalls).toEqual([
                { RunID: RUN_ID_PAUSED, RoutineID: 'routine-resume-1', MaxCostUsd: 5.5 },
            ]);

            // Idempotent repeat invocation on same checkpoint does not double-dispatch
            runEntity.Status = 'Running';
            const second = await resumeOp.ExecuteServer(
                { AgentRunID: RUN_ID_PAUSED },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(second.Success).toBe(true);
            expect(dispatchedCalls).toHaveLength(1);
        } finally {
            BaseAgent.RegisterResumeContinuationDispatcher(null);
            ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        }
    });

    it('coordinates Limits.PauseRun with in-process worker safe-point pause and preserves persisted state on detached runs (CR-3)', async () => {
        // 1) Active in-process worker registered in ActiveRunGovernanceRegistry
        const coopPauseSpy = vi.fn(async (summary?: string) => ({
            Paused: true,
            CheckpointID: 'cp-live-safe-1',
            Status: 'Paused',
            Summary: summary ?? 'Paused live worker',
        }));
        ActiveRunGovernanceRegistry.Instance.RegisterActiveRun({
            AgentRunID: RUN_ID_ACTIVE,
            RequestPause: coopPauseSpy,
        });

        const pauseOp = new LimitsPauseRunServerOperation();
        const noopProvider = { Authorizations: [] } as Partial<IMetadataProvider> as IMetadataProvider;
        try {
            const livePauseRes = await pauseOp.ExecuteServer(
                { AgentRunID: RUN_ID_ACTIVE, Summary: 'Cooperate at step boundary' },
                { provider: noopProvider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(livePauseRes.Success).toBe(true);
            expect(coopPauseSpy).toHaveBeenCalledWith('Cooperate at step boundary');
            expect(livePauseRes.Output?.CheckpointID).toBe('cp-live-safe-1');
            expect(livePauseRes.Output?.Status).toBe('Paused');
        } finally {
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(RUN_ID_ACTIVE);
        }

        // 2) Inactive/detached run record in DB preserves existing messages, scratchpad, payload, and routine
        const priorCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-detached-prior',
            AgentRunID: RUN_ID_ACTIVE,
            AgentID: AGENT_ID,
            AgentName: 'DetachedAgent',
            UserID: OWNER_USER.ID,
            RoutineID: 'routine-detached-99',
            PausedAtISO: '2026-11-21T09:00:00.000Z',
            PausedAtMs: 1_700_000_000_000,
            PauseReason: 'BudgetExceeded',
            Summary: 'Prior checkpoint',
            CompletedStepCount: 4,
            CompletedStepIDs: ['s1'],
            CompletedPromptTurns: 2,
            CompletedNodeIDs: ['node-a'],
            ConversationMessages: [{ Role: 'user', Content: 'Keep my prompt history' }],
            InFlightPayload: { preservedKey: 'keep-me' },
            Scratchpad: { notes: 'Preserved note', tasks: [{ id: 't1', title: 'Task 1', status: 'in_progress' }] },
            NextStepSummary: 'Actions',
            PendingStepDecision: {
                step: 'Actions',
                terminate: false,
                actions: [{ name: 'RunStep', params: { batch: 7 } }],
            },
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 1.2,
                RunWallClockMs: 2_000,
                RunTokens: 400,
                RoutineCostUsd: 1.2,
                RoutineWallClockMs: 2_000,
                UserDailyCostUsd: 1.2,
                UserDailyWallClockMs: 2_000,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: '2026-11-21T09:00:00.000Z',
            },
            HumanApproval: { Status: 'Pending' },
        };

        let detachedData = AttachRunawayCheckpointToRunData(null, priorCheckpoint);
        let detachedStatus = 'Running';
        const detachedRun = {
            ID: RUN_ID_ACTIVE,
            AgentID: AGENT_ID,
            Agent: 'DetachedAgent',
            UserID: OWNER_USER.ID,
            ScheduledJobRunID: 'routine-detached-99',
            StartedAt: new Date(Date.now() - 4_000),
            TotalCost: 1.2,
            TotalCostRollup: 1.2,
            TotalTokensUsed: 400,
            TotalPromptIterations: 2,
            FinalPayload: JSON.stringify({ preservedKey: 'keep-me' }),
            FinalPayloadObject: { preservedKey: 'keep-me' },
            get Status() {
                return detachedStatus;
            },
            set Status(v: string) {
                detachedStatus = v;
            },
            CompletedAt: null as Date | null,
            Success: null as boolean | null,
            ErrorMessage: null as string | null,
            Message: null as string | null,
            get Data() {
                return detachedData;
            },
            set Data(v: string | null) {
                detachedData = v ?? '';
            },
            RunawayCheckpoint: null as RunawayCheckpointState | null,
            LatestResult: { CompleteMessage: '' },
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => true),
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;

        const detachedProvider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => detachedRun),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const detachedRes = await pauseOp.ExecuteServer(
            { AgentRunID: RUN_ID_ACTIVE, Summary: 'Pause detached run cleanly' },
            { provider: detachedProvider, user: OWNER_USER, emitProgress: () => undefined },
        );
        expect(detachedRes.Success).toBe(true);
        const savedCp = detachedRun.RunawayCheckpoint;
        expect(savedCp?.RoutineID).toBe('routine-detached-99');
        expect(savedCp?.ConversationMessages).toEqual([{ Role: 'user', Content: 'Keep my prompt history' }]);
        expect(savedCp?.Scratchpad.notes).toBe('Preserved note');
        expect(savedCp?.InFlightPayload).toEqual({ preservedKey: 'keep-me' });
        expect(savedCp?.PendingStepDecision?.actions?.[0]?.name).toBe('RunStep');
    });

    it('resolves durable Tier-4 user policy limits server-side in Limits.GetDiagnostics and clamps widening RunOverrides (CR-5)', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                Status: 'Active',
                                InstructionsOverride:
                                    'Admin ceiling.\n<!-- mj-limits: {"AgentAbsoluteIterations":2500,"Budgets":{"PerRun":{"MaxCostUsd":8.0}}} -->',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }),
            RunViews: vi.fn(async () => [
                { Success: true, Results: [] },
                { Success: true, Results: [] },
            ]),
        } as Partial<RunView> as RunView);

        const provider = { Authorizations: [] } as Partial<IMetadataProvider> as IMetadataProvider;
        const diagOp = new LimitsGetDiagnosticsServerOperation();
        const res = await diagOp.ExecuteServer(
            {
                AgentID: AGENT_ID,
                UserID: OWNER_USER.ID,
                RunOverride: {
                    AgentAbsoluteIterations: 99_999,
                    Budgets: { PerRun: { MaxCostUsd: 500 } },
                },
            },
            { provider, user: OWNER_USER, emitProgress: () => undefined },
        );

        expect(res.Success).toBe(true);
        expect(res.Output?.ResolvedLimits.AgentAbsoluteIterations).toBe(2500);
        expect(res.Output?.ResolvedLimits.Budgets.PerRun.MaxCostUsd).toBe(8.0);
        expect(res.Output?.ClampedKeys).toContain('AgentAbsoluteIterations');
        expect(res.Output?.ClampedKeys).toContain('Budgets.PerRun.MaxCostUsd');
    });
});
