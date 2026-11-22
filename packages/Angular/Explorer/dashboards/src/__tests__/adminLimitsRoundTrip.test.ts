import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import {
    BaseRemotableOperation,
    CODE_FALLBACK_LIMITS,
    DispatchRemoteOperationInProcess,
    LIMITS_KEY_PATHS,
    LIMITS_TIER_PRECEDENCE,
    LimitsConfigResolver,
    type IMetadataProvider,
    type IRemoteOperationProvider,
    type RemoteOpInvokeOptions,
    type RemoteOpResult,
    type RemoteOpServerContext,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';
import {
    LIMITS_GET_DIAGNOSTICS_OPERATION_KEY,
    LIMITS_PAUSE_RUN_OPERATION_KEY,
    LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY,
    LimitsGetDiagnosticsOperation,
    LimitsPauseRunOperation,
    LimitsResumePausedRunOperation,
    type LimitsActiveRunDiagnosticSummary,
    type LimitsGetDiagnosticsInput,
    type LimitsGetDiagnosticsOutput,
    type LimitsPauseRunInput,
    type LimitsPauseRunOutput,
    type LimitsResumePausedRunInput,
    type LimitsResumePausedRunOutput,
} from '@memberjunction/ai-core-plus';

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

interface InMemoryRoundTripState {
    Runs: LimitsActiveRunDiagnosticSummary[];
    AllowWrite: boolean;
}

const roundTripState: InMemoryRoundTripState = {
    Runs: [],
    AllowWrite: true,
};

@RegisterClass(BaseRemotableOperation, LIMITS_GET_DIAGNOSTICS_OPERATION_KEY, 999)
class TestLimitsGetDiagnosticsServerOp extends LimitsGetDiagnosticsOperation {
    protected override async Authorize(
        _input: LimitsGetDiagnosticsInput,
        _user: UserInfo,
        _context?: RemoteOpServerContext,
    ): Promise<boolean> {
        return true;
    }

    protected override async InternalExecute(
        input: LimitsGetDiagnosticsInput,
    ): Promise<LimitsGetDiagnosticsOutput> {
        const res = LimitsConfigResolver.Instance.Resolve({
            MjConfig: { AgentChannelConsecutiveTurns: 1500 },
            UserAgentPolicy: { Budgets: { PerRun: { MaxCostUsd: 20 } } },
            RunOverride: input?.RunOverride ?? { Budgets: { PerRun: { MaxCostUsd: 50 } } },
        }, { EnforceUserPolicyAsCeiling: true });
        const runs = roundTripState.Runs.map((r) => ({ ...r }));
        const paused = runs.filter((r) => r.Status === 'Paused');
        return {
            ResolvedAtISO: res.ResolvedAtISO,
            TierPrecedence: LIMITS_TIER_PRECEDENCE,
            TierSummaries: LIMITS_TIER_PRECEDENCE.map((tier, idx) => ({
                Tier: tier,
                Rank: idx + 1,
                Description: `Tier ${tier}`,
                WinningKeyCount: tier === 'CodeFallback' ? LIMITS_KEY_PATHS.length - 2 : 1,
                SuppliedKeyCount: tier === 'CodeFallback' ? LIMITS_KEY_PATHS.length : 1,
            })),
            ResolvedLimits: res.Limits,
            Provenance: res.Provenance,
            OverriddenKeys: [...res.OverriddenKeys],
            ClampedKeys: [...res.ClampedKeys],
            ApprovedBackstops: [
                {
                    Key: 'AgentChannelConsecutiveTurns',
                    Label: 'Agent Channel Consecutive Turns',
                    Category: 'Backstops',
                    Unit: 'turns',
                    EffectiveValue: res.Limits.AgentChannelConsecutiveTurns,
                    ApprovedDefaultValue: CODE_FALLBACK_LIMITS.AgentChannelConsecutiveTurns,
                    SourceTier: 'MjConfig',
                    IsOverridden: true,
                    Description: 'Max consecutive turns',
                },
            ],
            BudgetUtilization: {
                ActiveRunCount: runs.filter((r) => r.Status === 'Running').length,
                PausedRunCount: paused.length,
                InspectedRunCount: runs.length,
                TotalObservedCostUsd: runs.reduce((acc, r) => acc + r.TotalCostUsd, 0),
                TotalObservedTokens: runs.reduce((acc, r) => acc + r.TotalTokensUsed, 0),
                CountPausedTimeTowardsWallClock: false,
                AllowedInFlightOvershootUsd: 0,
                AllowedInFlightOvershootMs: 0,
                DayBoundaryTimezone: 'UTC',
                Scopes: [
                    {
                        Scope: 'PerRun',
                        Label: 'Per-Run Ceiling',
                        MaxCostUsd: res.Limits.Budgets.PerRun.MaxCostUsd,
                        ObservedCostUsd: 1.25,
                        CostUtilizationPct: 6.3,
                        MaxWallClockMs: res.Limits.Budgets.PerRun.MaxWallClockMs,
                        ObservedWallClockMs: 5200,
                        WallClockUtilizationPct: 0.1,
                        Note: 'Within bounds',
                    },
                ],
            },
            ActiveAndRecentRuns: runs,
            PausedRuns: paused,
        };
    }
}

@RegisterClass(BaseRemotableOperation, LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY, 999)
class TestLimitsResumePausedRunServerOp extends LimitsResumePausedRunOperation {
    protected override async Authorize(): Promise<boolean> {
        return roundTripState.AllowWrite;
    }

    protected override async InternalExecute(
        input: LimitsResumePausedRunInput,
    ): Promise<LimitsResumePausedRunOutput> {
        const target = roundTripState.Runs.find((r) => r.AgentRunID === input.AgentRunID);
        if (!target || target.Status !== 'Paused') {
            return {
                Success: false,
                AgentRunID: input.AgentRunID,
                Status: target?.Status ?? 'Missing',
                CheckpointID: target?.CheckpointID ?? '',
                ApprovalStatus: 'Pending',
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: target?.CumulativeRunCostUsd ?? 0,
                PriorCumulativeActiveWallClockMs: target?.CumulativeRunWallClockMs ?? 0,
                StartingStepCount: target?.CompletedStepCount ?? 0,
                StartingPromptTurns: target?.CompletedPromptTurns ?? 0,
                Message: `Run ${input.AgentRunID} is not paused.`,
            };
        }
        target.Status = 'Running';
        target.HumanApprovalStatus = 'Approved';
        target.IsPausedWithCheckpoint = false;
        return {
            Success: true,
            AgentRunID: target.AgentRunID,
            Status: 'Running',
            CheckpointID: target.CheckpointID ?? 'cp-rt-1',
            ApprovalStatus: 'Approved',
            ExtendedBudgets: null,
            PriorCumulativeCostUsd: target.CumulativeRunCostUsd,
            PriorCumulativeActiveWallClockMs: target.CumulativeRunWallClockMs,
            StartingStepCount: target.CompletedStepCount,
            StartingPromptTurns: target.CompletedPromptTurns,
            Message: `Run ${target.AgentRunID} approved and resumed via BaseRemotableOperation.`,
        };
    }
}

@RegisterClass(BaseRemotableOperation, LIMITS_PAUSE_RUN_OPERATION_KEY, 999)
class TestLimitsPauseRunServerOp extends LimitsPauseRunOperation {
    protected override async Authorize(): Promise<boolean> {
        return roundTripState.AllowWrite;
    }

    protected override async InternalExecute(
        input: LimitsPauseRunInput,
    ): Promise<LimitsPauseRunOutput> {
        const target = roundTripState.Runs.find((r) => r.AgentRunID === input.AgentRunID);
        if (!target || target.Status !== 'Running') {
            return {
                Success: false,
                AgentRunID: input.AgentRunID,
                Status: target?.Status ?? 'Missing',
                CheckpointID: null,
                Message: `Run ${input.AgentRunID} is not running.`,
            };
        }
        target.Status = 'Paused';
        target.IsPausedWithCheckpoint = true;
        target.CheckpointID = 'cp-rt-paused-2';
        target.PauseReason = 'ManualPause';
        target.PauseSummary = input.Summary ?? 'Manual pause';
        target.HumanApprovalStatus = 'Pending';
        return {
            Success: true,
            Pending: false,
            AgentRunID: target.AgentRunID,
            Status: 'Paused',
            CheckpointID: target.CheckpointID,
            Message: `Run ${target.AgentRunID} paused via BaseRemotableOperation.`,
        };
    }
}

function retainTestOperations(): void {
    void TestLimitsGetDiagnosticsServerOp;
    void TestLimitsResumePausedRunServerOp;
    void TestLimitsPauseRunServerOp;
}

describe('AdminLimitsService -> BaseRemotableOperation live round-trip (CR-UI-BROWSER-EVIDENCE-MISSING)', () => {
    const actingUser = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'Alice Owner',
        Email: 'alice@example.com',
        Type: 'Owner',
    } as Partial<UserInfo> as UserInfo;

    let provider: IMetadataProvider & IRemoteOperationProvider;
    let service: AdminLimitsService;
    let component: AdminLimitsResourceComponent;

    beforeEach(() => {
        retainTestOperations();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined);

        roundTripState.AllowWrite = true;
        roundTripState.Runs = [
            {
                AgentRunID: 'run-rt-paused-1',
                AgentID: 'agent-1',
                AgentName: 'PlannerAgent',
                UserID: actingUser.ID,
                UserName: 'Alice Owner',
                Status: 'Paused',
                StartedAtISO: '2026-11-21T10:00:00.000Z',
                CompletedAtISO: null,
                TotalCostUsd: 1.25,
                TotalTokensUsed: 8000,
                TotalPromptIterations: 10,
                HasLimitsSnapshot: true,
                OverriddenKeyCount: 2,
                ClampedKeyCount: 1,
                Snapshot: null,
                ProgressClassification: 'Ambiguous',
                ProgressScore: 0.41,
                ProgressReason: 'Fast judge flagged loop',
                FastJudgeEntries: [],
                IsPausedWithCheckpoint: true,
                CheckpointID: 'cp-rt-1',
                PauseReason: 'FastJudgeStalled',
                PausedAtISO: '2026-11-21T10:01:00.000Z',
                PauseSummary: 'Paused by FastConvergenceJudge',
                CompletedStepCount: 10,
                CompletedPromptTurns: 5,
                HumanApprovalStatus: 'Pending',
                CumulativeRunCostUsd: 1.25,
                CumulativeRunWallClockMs: 5200,
            },
            {
                AgentRunID: 'run-rt-active-2',
                AgentID: 'agent-2',
                AgentName: 'ResearchAgent',
                UserID: actingUser.ID,
                UserName: 'Alice Owner',
                Status: 'Running',
                StartedAtISO: '2026-11-21T10:05:00.000Z',
                CompletedAtISO: null,
                TotalCostUsd: 0.4,
                TotalTokensUsed: 2500,
                TotalPromptIterations: 4,
                HasLimitsSnapshot: true,
                OverriddenKeyCount: 1,
                ClampedKeyCount: 0,
                Snapshot: null,
                ProgressClassification: 'Converging',
                ProgressScore: 0.91,
                ProgressReason: 'Steady progress',
                FastJudgeEntries: [],
                IsPausedWithCheckpoint: false,
                CheckpointID: null,
                PauseReason: null,
                PausedAtISO: null,
                PauseSummary: null,
                CompletedStepCount: 4,
                CompletedPromptTurns: 2,
                HumanApprovalStatus: null,
                CumulativeRunCostUsd: 0.4,
                CumulativeRunWallClockMs: 2100,
            },
        ];

        const routedProvider: Partial<IMetadataProvider & IRemoteOperationProvider> = {
            Entities: [],
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
                        emitProgress: () => undefined,
                    },
                    routedProvider as IMetadataProvider,
                    actingUser,
                );
            },
        };
        provider = routedProvider as IMetadataProvider & IRemoteOperationProvider;

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

    it('round-trips GetDiagnostics, ResumePausedRun, and PauseRun through real AdminLimitsService -> BaseRemotableOperation -> DispatchRemoteOperationInProcess', async () => {
        await component.RefreshDiagnostics();
        expect(component.LoadError).toBeNull();
        expect(component.Diagnostics?.PausedRuns).toHaveLength(1);
        expect(component.Diagnostics?.BudgetUtilization.ActiveRunCount).toBe(1);

        const pausedRun = component.Diagnostics!.PausedRuns[0];
        component.OpenResumeModal(pausedRun);
        component.AdditionalCostUsdInput = '15';
        component.DecisionNotesInput = 'Approved in round-trip test';
        await component.ConfirmResumePausedRun();

        expect(component.LoadError).toBeNull();
        expect(component.ActionFeedback).toContain('approved and resumed');
        expect(component.Diagnostics?.PausedRuns).toHaveLength(0);
        expect(component.Diagnostics?.BudgetUtilization.ActiveRunCount).toBe(2);

        const activeRun = component.Diagnostics!.ActiveAndRecentRuns.find((r) => r.AgentRunID === 'run-rt-active-2')!;
        await component.PauseActiveRun(activeRun);
        expect(component.LoadError).toBeNull();
        expect(component.ActionFeedback).toContain('paused via BaseRemotableOperation');
        expect(component.Diagnostics?.PausedRuns).toHaveLength(1);
        expect(component.Diagnostics?.PausedRuns[0].AgentRunID).toBe('run-rt-active-2');
    });

    it('surfaces FORBIDDEN BaseRemotableOperation errors fail-closed without clearing LoadError', async () => {
        await component.RefreshDiagnostics();
        roundTripState.AllowWrite = false;

        const activeRun = component.Diagnostics!.ActiveAndRecentRuns.find((r) => r.AgentRunID === 'run-rt-active-2')!;
        await component.PauseActiveRun(activeRun);

        expect(component.LoadError).toContain('FORBIDDEN');
        expect(component.Diagnostics?.ActiveAndRecentRuns.find((r) => r.AgentRunID === 'run-rt-active-2')?.Status).toBe('Running');
    });
});
