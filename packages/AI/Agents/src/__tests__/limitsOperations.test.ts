import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseRemotableOperation,
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    RunView,
    type AuthorizationInfo,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    AttachLimitsDiagnosticsToRunData,
    AttachRunawayCheckpointToRunData,
    AppendProgressDiagnosticToRunData,
    BuildLimitsDiagnosticsSnapshot,
    ExtractRunawayCheckpointFromRunData,
    LIMITS_GET_DIAGNOSTICS_OPERATION_KEY,
    LIMITS_PAUSE_RUN_OPERATION_KEY,
    LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY,
    type MJAIAgentRunEntityExtended,
    type RunawayCheckpointState,
} from '@memberjunction/ai-core-plus';
import { ActiveRunGovernanceRegistry } from '../ActiveRunGovernanceRegistry';
import { BaseAgent } from '../base-agent';
import { RunawayCheckpointManager } from '../RunawayCheckpointManager';
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

        const statusHistory: string[] = [runStatus];
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
                statusHistory.push(val);
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

        // 1) Fail-closed when no continuation dispatcher is available: Status MUST NOT transition to 'Running'
        ActiveRunGovernanceRegistry.Instance.ClearContinuationDispatchers();
        try {
            const noDispatcherRes = await resumeOp.ExecuteServer(
                {
                    AgentRunID: RUN_ID_PAUSED,
                    BudgetExtension: { NewPerRunMaxCostUsd: 5.0 },
                },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(noDispatcherRes.Success).toBe(true);
            expect(noDispatcherRes.Output?.Success).toBe(false);
            expect(noDispatcherRes.Output?.Status).toBe('Paused');
            expect(runEntity.Status).toBe('Paused');
            expect(statusHistory).not.toContain('Running');

            // 2) Fail-closed rollback when continuation dispatcher declines or returns null: rolls back to 'Paused'
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async () => ({
                Dispatched: false,
                Claimed: true,
                Status: 'Paused',
                Message: 'Worker capacity exhausted',
            }));
            const declinedRes = await resumeOp.ExecuteServer(
                {
                    AgentRunID: RUN_ID_PAUSED,
                    BudgetExtension: { NewPerRunMaxCostUsd: 5.0 },
                },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(declinedRes.Output?.Success).toBe(false);
            expect(declinedRes.Output?.Status).toBe('Paused');
            expect(runEntity.Status).toBe('Paused');

            // 3) Accepted dispatch transitions cleanly to Running and restores cumulative ledger
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async () => ({
                Dispatched: true,
                Claimed: true,
                Status: 'Running',
                Message: 'Worker claimed resumed run.',
            }));
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
            expect(res.Output?.Success).toBe(true);
            expect(res.Output?.Status).toBe('Running');
            expect(res.Output?.ApprovalStatus).toBe('Approved');
            expect(res.Output?.ExtendedBudgets?.PerRun.MaxCostUsd).toBe(5.0);
            expect(res.Output?.PriorCumulativeCostUsd).toBe(1.5);
            expect(res.Output?.PriorCumulativeActiveWallClockMs).toBe(12_000);
            expect(res.Output?.StartingStepCount).toBe(8);
            expect(res.Output?.StartingPromptTurns).toBe(4);
        } finally {
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);
            LoadLimitsOperations();
            ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        }
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

    it('coordinates Limits.PauseRun with in-process worker safe-point pause and enforces provider/tenant scope isolation (CR-3, CR-18)', async () => {
        // 1) Active in-process worker registered in ActiveRunGovernanceRegistry scoped to providerA
        const callOrder: string[] = [];
        const coopPauseSpyA = vi.fn(async (summary?: string) => {
            callOrder.push('signalA');
            return {
                Paused: true,
                CheckpointID: 'cp-live-safe-1',
                Status: 'Paused',
                Summary: summary ?? 'Paused live worker A',
            };
        });
        const providerA = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => ({
                ID: RUN_ID_ACTIVE,
                AgentID: AGENT_ID,
                Status: 'Running',
                Load: vi.fn(async (id: string) => {
                    callOrder.push('loadA');
                    return id === RUN_ID_ACTIVE;
                }),
            })),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        ActiveRunGovernanceRegistry.Instance.RegisterActiveRun(
            {
                AgentRunID: RUN_ID_ACTIVE,
                Provider: providerA,
                RequestPause: coopPauseSpyA,
            },
            providerA,
        );

        // Second provider B with identical colliding Run ID and an unauthorized provider C that owns no run
        const coopPauseSpyB = vi.fn(async (summary?: string) => {
            callOrder.push('signalB');
            return {
                Paused: true,
                CheckpointID: 'cp-live-safe-b',
                Status: 'Paused',
                Summary: summary ?? 'Paused live worker B',
            };
        });
        const providerB = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => ({
                ID: RUN_ID_ACTIVE,
                AgentID: AGENT_ID,
                Status: 'Running',
                Load: vi.fn(async (id: string) => {
                    callOrder.push('loadB');
                    return id === RUN_ID_ACTIVE;
                }),
            })),
        } as Partial<IMetadataProvider> as IMetadataProvider;
        ActiveRunGovernanceRegistry.Instance.RegisterActiveRun(
            {
                AgentRunID: RUN_ID_ACTIVE,
                Provider: providerB,
                RequestPause: coopPauseSpyB,
            },
            providerB,
        );

        const unauthorizedProviderC = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => ({
                Load: vi.fn(async () => false),
            })),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const pauseOp = new LimitsPauseRunServerOperation();
        try {
            // Unauthorized / missing-record provider C MUST fail Load FIRST without signaling provider A or B
            const deniedRes = await pauseOp.ExecuteServer(
                { AgentRunID: RUN_ID_ACTIVE, Summary: 'Cross-tenant attempt' },
                { provider: unauthorizedProviderC, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(deniedRes.Success).toBe(false);
            expect(coopPauseSpyA).not.toHaveBeenCalled();
            expect(coopPauseSpyB).not.toHaveBeenCalled();

            // Provider B pausing identical colliding UUID signals ONLY B (never A) and loads B first
            const bPauseRes = await pauseOp.ExecuteServer(
                { AgentRunID: RUN_ID_ACTIVE, Summary: 'Pause tenant B only' },
                { provider: providerB, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(bPauseRes.Success).toBe(true);
            expect(bPauseRes.Output?.CheckpointID).toBe('cp-live-safe-b');
            expect(coopPauseSpyB).toHaveBeenCalledWith('Pause tenant B only');
            expect(coopPauseSpyA).not.toHaveBeenCalled();

            // Provider A pausing loads A first BEFORE signaling A
            const livePauseRes = await pauseOp.ExecuteServer(
                { AgentRunID: RUN_ID_ACTIVE, Summary: 'Cooperate at step boundary' },
                { provider: providerA, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(livePauseRes.Success).toBe(true);
            expect(coopPauseSpyA).toHaveBeenCalledWith('Cooperate at step boundary');
            expect(livePauseRes.Output?.CheckpointID).toBe('cp-live-safe-1');
            expect(livePauseRes.Output?.Status).toBe('Paused');
            expect(callOrder.slice(0, 4)).toEqual(['loadB', 'signalB', 'loadA', 'signalA']);
        } finally {
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(RUN_ID_ACTIVE, providerA);
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(RUN_ID_ACTIVE, providerB);
        }

        // 2) Remote/detached run with NO local handle in ActiveRunGovernanceRegistry:
        //    MUST NOT fabricate an empty checkpoint or flip Status='Paused'; persists durable cooperative pause signal and returns Pending=true
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
        expect(detachedRes.Output?.Success).toBe(false);
        expect(detachedRes.Output?.Pending).toBe(true);
        expect(detachedRes.Output?.Status).toBe('Running');
        expect(detachedRes.Output?.CheckpointID).toBeNull();
        expect(detachedStatus).toBe('Running');
        expect(detachedData).toContain('__cooperativePauseRequest');
        expect(detachedData).toContain('Pause detached run cleanly');
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

    it('executes real fresh-worker continuation through DefaultResumeContinuationDispatcher when no custom dispatcher is registered (CR-14)', async () => {
        ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);
        LoadLimitsOperations();

        const checkpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-default-worker-1',
            AgentRunID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            AgentName: 'DefaultDispatcherAgent',
            UserID: OWNER_USER.ID,
            RoutineID: null,
            PausedAtISO: '2026-11-21T10:00:00.000Z',
            PausedAtMs: Date.UTC(2026, 10, 21, 10, 0, 0),
            PauseReason: 'ManualPause',
            Summary: 'Paused cleanly',
            CompletedStepCount: 3,
            CompletedStepIDs: ['s1', 's2', 's3'],
            CompletedPromptTurns: 1,
            CompletedNodeIDs: [],
            ConversationMessages: [],
            InFlightPayload: { count: 3 },
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: 'Success',
            PendingStepDecision: { step: 'Success', terminate: true, newPayload: { count: 4 } },
            Evidence: {},
            CumulativeLedger: {
                RunCostUsd: 0.5,
                RunWallClockMs: 5_000,
                RunTokens: 200,
                RoutineCostUsd: 0.5,
                RoutineWallClockMs: 5_000,
                UserDailyCostUsd: 0.5,
                UserDailyWallClockMs: 5_000,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: '2026-11-21T10:00:00.000Z',
            },
            HumanApproval: { Status: 'Pending' },
        };

        let runStatus = 'Paused';
        let dataJson = AttachRunawayCheckpointToRunData(null, checkpoint);
        const runEntity = {
            ID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            Agent: 'DefaultDispatcherAgent',
            UserID: OWNER_USER.ID,
            get Status() {
                return runStatus;
            },
            set Status(val: string) {
                runStatus = val;
            },
            CompletedAt: null,
            Success: null,
            ErrorMessage: null,
            Message: null,
            get Data() {
                return dataJson;
            },
            set Data(val: string | null) {
                dataJson = val ?? '';
            },
            get RunawayCheckpoint() {
                return null;
            },
            set RunawayCheckpoint(_val: RunawayCheckpointState | null) {},
            LatestResult: { CompleteMessage: '' },
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => true),
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;

        const resumeSpy = vi.spyOn(BaseAgent.prototype, 'ResumePausedRun').mockImplementation(async (execParams) => {
            expect(execParams.resumeCheckpointRunId).toBe(RUN_ID_PAUSED);
            runStatus = 'Completed';
            return {
                success: true,
                agentRun: runEntity,
                payload: { count: 4 },
            };
        });

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agents') {
                    return {
                        Success: true,
                        Results: [{ ID: AGENT_ID, Name: 'DefaultDispatcherAgent', DriverClass: null }],
                    };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<RunView> as RunView);

        const provider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => runEntity),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const resumeOp = new LimitsResumePausedRunServerOperation();
        const res = await resumeOp.ExecuteServer(
            { AgentRunID: RUN_ID_PAUSED, DecisionNotes: 'Resume via default fresh worker' },
            { provider, user: OWNER_USER, emitProgress: () => undefined },
        );
        expect(res.Success).toBe(true);
        expect(res.Output?.Success).toBe(true);

        const continuationOutcome = await ActiveRunGovernanceRegistry.Instance.WaitForContinuation(RUN_ID_PAUSED, provider);
        expect(continuationOutcome?.Dispatched).toBe(true);
        expect(continuationOutcome?.Completed).toBe(true);
        expect(continuationOutcome?.Status).toBe('Completed');
        expect(resumeSpy).toHaveBeenCalledTimes(1);
    });

    it('CR-14: keeps persisted Status="Paused" during DispatchContinuation, fails closed on rollback-save failure, and supports restart recovery', async () => {
        ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);

        const checkpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-cr14-phase-check',
            AgentRunID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            AgentName: 'PhaseCheckAgent',
            UserID: OWNER_USER.ID,
            RoutineID: null,
            PausedAtISO: '2026-11-21T10:00:00.000Z',
            PausedAtMs: Date.UTC(2026, 10, 21, 10, 0, 0),
            PauseReason: 'BudgetExceeded',
            Summary: 'Paused cleanly',
            CompletedStepCount: 5,
            CompletedStepIDs: ['s1', 's2'],
            CompletedPromptTurns: 2,
            CompletedNodeIDs: [],
            ConversationMessages: [],
            InFlightPayload: { count: 5 },
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: 'Actions',
            Evidence: {},
            CumulativeLedger: {
                RunCostUsd: 1.0,
                RunWallClockMs: 5_000,
                RunTokens: 200,
                RoutineCostUsd: 1.0,
                RoutineWallClockMs: 5_000,
                UserDailyCostUsd: 1.0,
                UserDailyWallClockMs: 5_000,
                PausedWallClockMs: 0,
                PausedIntervals: [{ PausedAtMs: Date.UTC(2026, 10, 21, 10, 0, 0), ResumedAtMs: null }],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: '2026-11-21T10:00:00.000Z',
            },
            HumanApproval: { Status: 'Pending' },
        };

        let persistedStatus = 'Paused';
        let persistedData = AttachRunawayCheckpointToRunData(null, checkpoint);
        let runStatus = persistedStatus;
        let dataJson = persistedData;
        let checkpointObj: RunawayCheckpointState | null = checkpoint;
        let failRollbackSave = false;
        let saveCounter = 0;

        const runEntity = {
            ID: RUN_ID_PAUSED,
            AgentID: AGENT_ID,
            Agent: 'PhaseCheckAgent',
            UserID: OWNER_USER.ID,
            get Status() {
                return runStatus;
            },
            set Status(v: string) {
                runStatus = v;
            },
            CompletedAt: null as Date | null,
            Success: null as boolean | null,
            ErrorMessage: null as string | null,
            Message: null as string | null,
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
            LatestResult: { CompleteMessage: 'Simulated rollback write failure' },
            Load: vi.fn(async () => {
                runStatus = persistedStatus;
                dataJson = persistedData;
                checkpointObj = ExtractRunawayCheckpointFromRunData(persistedData);
                return true;
            }),
            Save: vi.fn(async () => {
                saveCounter++;
                // Fail the rollback save (second save during declined dispatch) when injected
                if (failRollbackSave && runStatus === 'Paused' && saveCounter % 2 === 0) {
                    return false;
                }
                persistedStatus = runStatus;
                persistedData = dataJson;
                return true;
            }),
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;

        const provider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => runEntity),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const resumeOp = new LimitsResumePausedRunServerOperation();
        try {
            // 1) Inspect persisted Status *during* DispatchContinuation -> MUST STILL BE 'Paused' when declined
            let observedPersistedStatusDuringDispatch = '';
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async () => {
                observedPersistedStatusDuringDispatch = persistedStatus;
                return {
                    Dispatched: false,
                    Claimed: false,
                    Status: 'Paused',
                    Message: 'Worker pool declined',
                };
            });

            const declined = await resumeOp.ExecuteServer(
                { AgentRunID: RUN_ID_PAUSED, BudgetExtension: { AdditionalCostUsd: 2 } },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(observedPersistedStatusDuringDispatch).toBe('Paused');
            expect(declined.Output?.Success).toBe(false);
            expect(persistedStatus).toBe('Paused');
            expect(ExtractRunawayCheckpointFromRunData(persistedData)?.HumanApproval.Status).toBe('Pending');

            // 2) Inject rollback-save failure when DispatchContinuation throws -> MUST fail closed explicitly
            saveCounter = 0;
            failRollbackSave = true;
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async () => {
                expect(persistedStatus).toBe('Paused');
                throw new Error('Dispatcher transport error');
            });
            const rollbackFailRes = await resumeOp.ExecuteServer(
                { AgentRunID: RUN_ID_PAUSED, BudgetExtension: { AdditionalCostUsd: 2 } },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(rollbackFailRes.Output?.Success).toBe(false);
            expect(rollbackFailRes.Output?.Message).toContain('Rollback persistence failed');
            expect(persistedStatus).toBe('Paused');
            failRollbackSave = false;

            // 3) Restart recovery for approved-but-unstarted checkpoint claim (approved via PrepareResume: false, then server restarts)
            const approveOnly = await resumeOp.ExecuteServer(
                {
                    AgentRunID: RUN_ID_PAUSED,
                    PrepareResume: false,
                    BudgetExtension: { NewPerRunMaxCostUsd: 10 },
                    DecisionNotes: 'Approved prior to restart',
                },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(approveOnly.Output?.Success).toBe(true);
            expect(persistedStatus).toBe('Paused');
            expect(ExtractRunawayCheckpointFromRunData(persistedData)?.HumanApproval.Status).toBe('Approved');

            // Simulate process restart clearing in-memory dispatched claims
            ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
            const recoveredCalls: string[] = [];
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async (dispatchInput) => {
                // Even during recovery dispatch, persisted Status is STILL 'Paused' until accepted
                expect(persistedStatus).toBe('Paused');
                recoveredCalls.push(dispatchInput.AgentRunID);
                return {
                    Dispatched: true,
                    Claimed: true,
                    Status: 'Running',
                    Message: 'Recovered after restart',
                };
            });

            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async () => ({
                    Success: true,
                    Results: [{ ID: RUN_ID_PAUSED, Status: persistedStatus, Data: persistedData }],
                })),
            } as Partial<RunView> as RunView);

            const recovered = await LimitsResumePausedRunServerOperation.RecoverApprovedUnstartedResumes({
                Provider: provider,
                ContextUser: OWNER_USER,
            });
            expect(recovered).toHaveLength(1);
            expect(recovered[0].Success).toBe(true);
            expect(recovered[0].Status).toBe('Running');
            expect(recoveredCalls).toEqual([RUN_ID_PAUSED]);
            expect(persistedStatus).toBe('Running');
        } finally {
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);
            LoadLimitsOperations();
            ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        }
    });

    it('CR-PAUSE-REMOTE-WORKER-CHECKPOINT: persists durable pause signal from API server and lets owning remote worker flush full safe-point checkpoint', async () => {
        const sharedRunId = '99999999-1111-4111-8111-000000000001';
        let sharedStatus = 'Running';
        let sharedData = JSON.stringify({ existingKey: 'preserve-me' });
        let sharedCheckpoint: RunawayCheckpointState | null = null;

        const makeSharedRunEntity = (): MJAIAgentRunEntityExtended => {
            const ent = {
                ID: sharedRunId,
                AgentID: AGENT_ID,
                Agent: 'RemoteWorkerAgent',
                UserID: OWNER_USER.ID,
                ScheduledJobRunID: 'routine-remote-1',
                StartedAt: new Date(Date.now() - 2_000),
                CompletedAt: null as Date | null,
                Success: null as boolean | null,
                ErrorMessage: null as string | null,
                Message: null as string | null,
                TotalCost: 0.25,
                TotalCostRollup: 0.25,
                TotalTokensUsed: 300,
                TotalPromptIterations: 2,
                FinalPayload: null as string | null,
                FinalPayloadObject: null as object | null,
                Steps: [],
                get Status() { return sharedStatus; },
                set Status(v: string) { sharedStatus = v; },
                get Data() { return sharedData; },
                set Data(v: string | null) { sharedData = v ?? ''; },
                get RunawayCheckpoint() { return sharedCheckpoint ?? ExtractRunawayCheckpointFromRunData(sharedData); },
                set RunawayCheckpoint(v: RunawayCheckpointState | null) { sharedCheckpoint = v; },
                LatestResult: { CompleteMessage: '' },
                Load: vi.fn(async (id: string) => id === sharedRunId),
                Save: vi.fn(async () => true),
            };
            return ent as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
        };

        const makeAuxEntity = (entityName: string) => ({
            EntityName: entityName,
            ID: `${entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-1`,
            Status: '',
            LatestResult: { CompleteMessage: '' },
            Save: vi.fn(async () => true),
            Load: vi.fn(async () => false),
        });

        // Provider 1 (Worker 1 process) vs Provider 2 (API server process without Worker 1's handle)
        const workerProvider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async (entityName: string) =>
                entityName === 'MJ: AI Agent Runs' ? makeSharedRunEntity() : makeAuxEntity(entityName),
            ),
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent Runs') {
                    return { Success: true, Results: [{ ID: sharedRunId, Data: sharedData }] };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const apiServerProvider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async (entityName: string) =>
                entityName === 'MJ: AI Agent Runs' ? makeSharedRunEntity() : makeAuxEntity(entityName),
            ),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        // Worker 1 registers its handle only on workerProvider (NOT on apiServerProvider)
        const pauseOp = new LimitsPauseRunServerOperation();
        const adminPauseRes = await pauseOp.ExecuteServer(
            { AgentRunID: sharedRunId, Summary: 'Cross-server admin pause' },
            { provider: apiServerProvider, user: OWNER_USER, emitProgress: () => undefined },
        );

        // API server does NOT fabricate an empty checkpoint or mark Paused!
        expect(adminPauseRes.Success).toBe(true);
        expect(adminPauseRes.Output?.Success).toBe(false);
        expect(adminPauseRes.Output?.Pending).toBe(true);
        expect(adminPauseRes.Output?.Status).toBe('Running');
        expect(adminPauseRes.Output?.CheckpointID).toBeNull();
        expect(sharedStatus).toBe('Running');

        // Simulate Worker 1 reaching its safe boundary in BaseAgent.checkAndPauseOnCooperativeRequest
        const worker = new BaseAgent();
        const workerRun = makeSharedRunEntity();
        Reflect.set(worker, '_agentRun', workerRun);
        Reflect.set(worker, '_activeProvider', workerProvider);
        Reflect.set(worker, '_promptTurnCount', 3);
        const scratchpadMgr = Reflect.get(worker, '_scratchpadManager') as {
            SetNotes(n: string): void;
            UpsertTasks(t: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' | 'blocked' }>): void;
        };
        scratchpadMgr.SetNotes('Remote worker safe-point notes');
        scratchpadMgr.UpsertTasks([{ id: 't-remote', title: 'Remote step', status: 'in_progress' }]);

        const checkCoopFn = Reflect.get(worker, 'checkAndPauseOnCooperativeRequest') as (
            p: { agent: { ID: string; Name: string }; conversationMessages: Array<{ role: string; content: string }>; contextUser: UserInfo; provider: IMetadataProvider; routineId?: string },
            inFlightPayload: { phase: string },
            nextStep: { step: string; terminate: boolean },
        ) => Promise<{ PauseResult: { Checkpoint: RunawayCheckpointState } } | null>;

        const outcome = await checkCoopFn.call(
            worker,
            {
                agent: { ID: AGENT_ID, Name: 'RemoteWorkerAgent' },
                conversationMessages: [{ role: 'user', content: 'Full worker conversation history' }],
                contextUser: OWNER_USER,
                provider: workerProvider,
                routineId: 'routine-remote-1',
            },
            { phase: 'step-3-in-flight' },
            { step: 'Retry', terminate: false },
        );

        expect(outcome).not.toBeNull();
        expect(sharedStatus).toBe('Paused');
        const flushedCp = ExtractRunawayCheckpointFromRunData(sharedData);
        expect(flushedCp).not.toBeNull();
        expect(flushedCp?.Summary).toBe('Cross-server admin pause');
        expect(flushedCp?.ConversationMessages).toEqual([{ Role: 'user', Content: 'Full worker conversation history' }]);
        expect(flushedCp?.Scratchpad.notes).toBe('Remote worker safe-point notes');
        expect(flushedCp?.InFlightPayload).toEqual({ phase: 'step-3-in-flight' });
        expect(flushedCp?.PendingStepDecision?.step).toBe('Retry');
        // Cooperative pause request signal was cleared once acknowledged
        expect(sharedData).not.toContain('__cooperativePauseRequest');
    });

    it('CR-APPROVAL-CLOSES-PAUSE-EARLY: PrepareResume=false keeps PausedIntervals open at t1 so entire t0->t2 pause is excluded across PerRun, PerRoutine, and PerUserPerDay', async () => {
        const { BudgetEnforcementGuard } = await import('../BudgetEnforcementGuard');
        const t0Start = Date.UTC(2026, 10, 21, 14, 0, 0);
        const t0Pause = t0Start + 4_000;
        const t1Approve = t0Start + 24_000;
        const t2Resume = t0Start + 124_000;
        const t3Eval = t0Start + 129_000;

        const routineId = 'routine-prepare-resume-false-1';
        const runId = 'aaaaaaaa-1111-4111-8111-000000000099';
        const initialCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-cr-pause-early-1',
            AgentRunID: runId,
            AgentID: AGENT_ID,
            AgentName: 'DelayedResumeAgent',
            UserID: OWNER_USER.ID,
            RoutineID: routineId,
            PausedAtISO: new Date(t0Pause).toISOString(),
            PausedAtMs: t0Pause,
            PauseReason: 'BudgetExceeded',
            Summary: 'Paused at t0',
            CompletedStepCount: 2,
            CompletedStepIDs: ['s1', 's2'],
            CompletedPromptTurns: 2,
            CompletedNodeIDs: [],
            ConversationMessages: [{ Role: 'user', Content: 'Go' }],
            InFlightPayload: { ok: true },
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: 'Actions',
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 0.25,
                RunWallClockMs: 4_000,
                RunTokens: 400,
                RoutineCostUsd: 0.25,
                RoutineWallClockMs: 4_000,
                UserDailyCostUsd: 0.25,
                UserDailyWallClockMs: 4_000,
                PausedWallClockMs: 0,
                PausedIntervals: [{ PausedAtMs: t0Pause, ResumedAtMs: null }],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date(t0Pause).toISOString(),
            },
            HumanApproval: { Status: 'Pending' },
        };

        let persistedStatus = 'Paused';
        let persistedData = AttachRunawayCheckpointToRunData(null, initialCheckpoint);
        let cpCache: RunawayCheckpointState | null = initialCheckpoint;

        const runEntity = {
            ID: runId,
            AgentID: AGENT_ID,
            Agent: 'DelayedResumeAgent',
            UserID: OWNER_USER.ID,
            ScheduledJobRunID: routineId,
            StartedAt: new Date(t0Start),
            CompletedAt: null,
            TotalCost: 0.25,
            TotalCostRollup: 0.25,
            get Status() { return persistedStatus; },
            set Status(v: string) { persistedStatus = v; },
            get Data() { return persistedData; },
            set Data(v: string | null) { persistedData = v ?? ''; },
            get RunawayCheckpoint() { return cpCache ?? ExtractRunawayCheckpointFromRunData(persistedData); },
            set RunawayCheckpoint(v: RunawayCheckpointState | null) { cpCache = v; },
            LatestResult: { CompleteMessage: '' },
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => true),
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
            RunViews: vi.fn(async () => [
                {
                    Success: true,
                    Results: [
                        {
                            ID: runId,
                            ParentRunID: null,
                            UserID: OWNER_USER.ID,
                            TotalCost: 0.25,
                            TotalCostRollup: 0.25,
                            StartedAt: new Date(t0Start),
                            CompletedAt: null,
                            __mj_UpdatedAt: new Date(t1Approve),
                            ScheduledJobRunID: routineId,
                            Status: persistedStatus,
                            Data: persistedData,
                        },
                    ],
                },
                {
                    Success: true,
                    Results: [
                        {
                            ID: runId,
                            ParentRunID: null,
                            UserID: OWNER_USER.ID,
                            TotalCost: 0.25,
                            TotalCostRollup: 0.25,
                            StartedAt: new Date(t0Start),
                            CompletedAt: null,
                            __mj_UpdatedAt: new Date(t1Approve),
                            ScheduledJobRunID: routineId,
                            Status: persistedStatus,
                            Data: persistedData,
                        },
                    ],
                },
            ]),
        } as Partial<RunView> as RunView);

        const provider = {
            Authorizations: [],
            GetEntityObject: vi.fn(async () => runEntity),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const resumeOp = new LimitsResumePausedRunServerOperation();
        try {
            vi.useFakeTimers();
            vi.setSystemTime(t1Approve);

            // 1) Approve ONLY (PrepareResume: false) at t1Approve
            const approveOnlyRes = await resumeOp.ExecuteServer(
                {
                    AgentRunID: runId,
                    PrepareResume: false,
                    BudgetExtension: { NewPerRunMaxWallClockMs: 20_000, NewPerRoutineMaxWallClockMs: 20_000, NewPerUserDailyMaxWallClockMs: 20_000 },
                },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(approveOnlyRes.Success).toBe(true);
            expect(approveOnlyRes.Output?.Status).toBe('Paused');
            expect(persistedStatus).toBe('Paused');
            const cpAfterApprove = ExtractRunawayCheckpointFromRunData(persistedData);
            expect(cpAfterApprove?.HumanApproval.Status).toBe('Approved');
            expect(cpAfterApprove?.CumulativeLedger.PausedIntervals).toEqual([{ PausedAtMs: t0Pause, ResumedAtMs: null }]);

            // 2) Advance to t2Resume (100s after approval) and actually resume
            vi.setSystemTime(t2Resume);
            let capturedPreparedIntervals: Array<{ PausedAtMs: number; ResumedAtMs?: number | null }> = [];
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(async (dispatchInput) => {
                capturedPreparedIntervals = dispatchInput.RestoredContext.PausedIntervals;
                await new RunawayCheckpointManager().CommitResumeRunningState({
                    AgentRun: dispatchInput.RestoredContext.AgentRun,
                    Preparation: dispatchInput.RestoredContext,
                    MarkStarted: true,
                    NowMs: t2Resume,
                });
                return { Dispatched: true, Claimed: true, Status: 'Running', Message: 'Resumed' };
            });

            const resumeRes = await resumeOp.ExecuteServer(
                { AgentRunID: runId },
                { provider, user: OWNER_USER, emitProgress: () => undefined },
            );
            expect(resumeRes.Success).toBe(true);
            expect(resumeRes.Output?.Success).toBe(true);
            expect(resumeRes.Output?.Status).toBe('Running');
            expect(capturedPreparedIntervals).toEqual([{ PausedAtMs: t0Pause, ResumedAtMs: t2Resume }]);
            expect(ExtractRunawayCheckpointFromRunData(persistedData)?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: t2Resume },
            ]);

            // 3) Evaluate active wall clock at t3Eval across PerRun, PerRoutine, and PerUserPerDay
            const guard = new BudgetEnforcementGuard();
            const evalRes = await guard.Evaluate({
                Budgets: {
                    ...CODE_FALLBACK_LIMITS.Budgets,
                    PerRun: { MaxCostUsd: 10, MaxWallClockMs: 20_000, MaxTokens: null },
                    PerRoutine: { MaxCostUsd: 10, MaxWallClockMs: 20_000 },
                    PerUserPerDay: { MaxCostUsd: 10, MaxWallClockMs: 20_000, DayBoundaryTimezone: 'UTC' },
                    CountPausedTimeTowardsWallClock: false,
                },
                AgentRunID: runId,
                UserID: OWNER_USER.ID,
                RoutineID: routineId,
                CurrentRunCostUsd: 0.25,
                CurrentRunStartedAtMs: t0Start,
                PausedIntervals: capturedPreparedIntervals,
                NowMs: t3Eval,
                Provider: provider,
                ContextUser: OWNER_USER,
            });
            // 4,000ms (t0Start->t0Pause) + 5,000ms (t2Resume->t3Eval) = 9,000ms (entire 120,000ms t0Pause->t2Resume excluded!)
            expect(evalRes.Exceeded).toBe(false);
            expect(evalRes.Ledger.RunWallClockMs).toBe(9_000);
            expect(evalRes.Ledger.RoutineWallClockMs).toBe(9_000);
            expect(evalRes.Ledger.UserDailyWallClockMs).toBe(9_000);
        } finally {
            vi.useRealTimers();
            ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(null);
            LoadLimitsOperations();
            ActiveRunGovernanceRegistry.Instance.ClearDispatchedClaims();
        }
    });

    it('CR-DIAGNOSTICS-AUTH-FIRST-MATCH: evaluates all matching authorization definitions instead of stopping at the first ungranted match', async () => {
        const makeAuth = (id: string, name: string, allowedRoleId: string): AuthorizationInfo =>
            ({
                ID: id,
                Name: name,
                ParentID: null,
                UserCanExecute: (u: UserInfo) => u.UserRoles.some((r) => r.RoleID === allowedRoleId),
            }) as Partial<AuthorizationInfo> as AuthorizationInfo;

        const sysAdminAuth = makeAuth('auth-sysadmin', 'System Administrator', 'role-sysadmin');
        const diagAuth = makeAuth('auth-diag', 'Diagnostics: Run Sessions', 'role-diag');
        const aiManageAuth = makeAuth('auth-ai', 'AI: Manage Agents', 'role-ai-admin');

        const aiAdminUser: UserInfo = {
            ...STANDARD_USER,
            ID: '22222222-2222-4222-8222-222222222223',
            UserRoles: [{ RoleID: 'role-ai-admin', Role: 'AI Admin' }],
        } as Partial<UserInfo> as UserInfo;

        const diagReaderUser: UserInfo = {
            ...STANDARD_USER,
            ID: '22222222-2222-4222-8222-222222222224',
            UserRoles: [{ RoleID: 'role-diag', Role: 'Diagnostics Reader' }],
        } as Partial<UserInfo> as UserInfo;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
            RunViews: vi.fn(async () => []),
        } as Partial<RunView> as RunView);

        const forwardProvider = {
            Authorizations: [sysAdminAuth, diagAuth, aiManageAuth],
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const reversedProvider = {
            Authorizations: [aiManageAuth, diagAuth, sysAdminAuth],
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const diagOp = new LimitsGetDiagnosticsServerOperation();
        const pauseOp = new LimitsPauseRunServerOperation();

        // System Administrator listed first (ungranted), AI: Manage Agents listed later (granted)
        const aiReadForward = await diagOp.ExecuteServer(
            {},
            { provider: forwardProvider, user: aiAdminUser, emitProgress: () => undefined },
        );
        expect(aiReadForward.Success).toBe(true);

        // System Administrator listed first (ungranted), Diagnostics: Run Sessions listed second (granted)
        const diagReadForward = await diagOp.ExecuteServer(
            {},
            { provider: forwardProvider, user: diagReaderUser, emitProgress: () => undefined },
        );
        expect(diagReadForward.Success).toBe(true);

        // Diagnostics: Run Sessions is read-only and must NOT authorize write/pause operations
        const diagPauseAttempt = await pauseOp.ExecuteServer(
            { AgentRunID: RUN_ID_ACTIVE },
            { provider: forwardProvider, user: diagReaderUser, emitProgress: () => undefined },
        );
        expect(diagPauseAttempt.Success).toBe(false);
        expect(diagPauseAttempt.ResultCode).toBe('FORBIDDEN');

        // Reversed metadata order works identically
        const aiReadReversed = await diagOp.ExecuteServer(
            {},
            { provider: reversedProvider, user: aiAdminUser, emitProgress: () => undefined },
        );
        expect(aiReadReversed.Success).toBe(true);

        const diagReadReversed = await diagOp.ExecuteServer(
            {},
            { provider: reversedProvider, user: diagReaderUser, emitProgress: () => undefined },
        );
        expect(diagReadReversed.Success).toBe(true);

        // Unprivileged user remains denied regardless of authorization ordering
        const unprivilegedForward = await diagOp.ExecuteServer(
            {},
            { provider: forwardProvider, user: STANDARD_USER, emitProgress: () => undefined },
        );
        expect(unprivilegedForward.Success).toBe(false);
        expect(unprivilegedForward.ResultCode).toBe('FORBIDDEN');

        const unprivilegedReversed = await diagOp.ExecuteServer(
            {},
            { provider: reversedProvider, user: STANDARD_USER, emitProgress: () => undefined },
        );
        expect(unprivilegedReversed.Success).toBe(false);
        expect(unprivilegedReversed.ResultCode).toBe('FORBIDDEN');
    });
});
