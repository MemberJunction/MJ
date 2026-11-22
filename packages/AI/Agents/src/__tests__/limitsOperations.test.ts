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

const OWNER_USER = {
    ID: '11111111-1111-4111-8111-111111111111',
    Name: 'Alice Owner',
    Email: 'alice@example.com',
    Type: 'Owner',
    UserRoles: [],
} as unknown as UserInfo;

const STANDARD_USER = {
    ID: '22222222-2222-4222-8222-222222222222',
    Name: 'Bob User',
    Email: 'bob@example.com',
    Type: 'User',
    UserRoles: [],
} as unknown as UserInfo;

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
        const provider = { Authorizations: [] } as unknown as IMetadataProvider;
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
        } as unknown as RunView);

        const provider = { Authorizations: [] } as unknown as IMetadataProvider;
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
        } as unknown as MJAIAgentRunEntityExtended;

        const provider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => runEntity),
        } as unknown as IMetadataProvider;

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
});
