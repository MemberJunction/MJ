import '@angular/compiler';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CODE_FALLBACK_LIMITS, LIMITS_TIER_PRECEDENCE, LimitsConfigResolver } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import type {
    LimitsActiveRunDiagnosticSummary,
    LimitsGetDiagnosticsOutput,
} from '@memberjunction/ai-core-plus';
import { AdminLimitsResourceComponent } from './admin-limits-resource.component';
import { AdminLimitsService } from './services/admin-limits.service';

function makeRunSummary(args: {
    AgentRunID: string;
    AgentID: string;
    AgentName: string;
    UserID: string;
    HasSnapshot: boolean;
    ConsecutiveTurnsOverride?: number;
    MaxCostOverride?: number;
    SourceTierLabel?: 'MjConfig' | 'RunOverride';
}): LimitsActiveRunDiagnosticSummary {
    const resolution = args.HasSnapshot
        ? LimitsConfigResolver.Instance.Resolve(
            args.SourceTierLabel === 'RunOverride'
                ? {
                    RunOverride: {
                        AgentChannelConsecutiveTurns: args.ConsecutiveTurnsOverride ?? 250,
                        Budgets: { PerRun: { MaxCostUsd: args.MaxCostOverride ?? 42 } },
                    },
                }
                : {
                    MjConfig: {
                        AgentChannelConsecutiveTurns: args.ConsecutiveTurnsOverride ?? 1500,
                        Budgets: { PerRun: { MaxCostUsd: args.MaxCostOverride ?? 12.5 } },
                    },
                },
        )
        : null;

    return {
        AgentRunID: args.AgentRunID,
        AgentID: args.AgentID,
        AgentName: args.AgentName,
        UserID: args.UserID,
        UserName: 'Alice Owner',
        Status: 'Completed',
        StartedAtISO: '2026-11-21T10:00:00.000Z',
        CompletedAtISO: '2026-11-21T10:02:00.000Z',
        TotalCostUsd: 1.5,
        TotalTokensUsed: 5000,
        TotalPromptIterations: 4,
        HasLimitsSnapshot: args.HasSnapshot,
        OverriddenKeyCount: resolution ? resolution.OverriddenKeys.length : 0,
        ClampedKeyCount: 0,
        Snapshot: resolution
            ? {
                SchemaVersion: 'mj-limits-snapshot/v1',
                CapturedAtISO: '2026-11-21T10:00:00.000Z',
                Context: {
                    AgentID: args.AgentID,
                    AgentName: args.AgentName,
                    AgentRunID: args.AgentRunID,
                    UserID: args.UserID,
                },
                ResolvedLimits: resolution.Limits,
                Provenance: resolution.Provenance,
                OverriddenKeys: resolution.OverriddenKeys,
                ClampedKeys: resolution.ClampedKeys,
            }
            : null,
        ProgressClassification: 'Converging',
        ProgressScore: 0.9,
        ProgressReason: 'Converging steadily',
        FastJudgeEntries: [],
        IsPausedWithCheckpoint: false,
        CheckpointID: null,
        PauseReason: null,
        PausedAtISO: null,
        PauseSummary: null,
        CompletedStepCount: 4,
        CompletedPromptTurns: 2,
        HumanApprovalStatus: null,
        CumulativeRunCostUsd: 1.5,
        CumulativeRunWallClockMs: 1200,
    };
}

describe('AdminLimitsResourceComponent DOM (CR-12)', () => {
    it('renders distinct Snapshot.ResolvedLimits and per-field tier provenance for two runs and clean fallback for legacy runs', async () => {
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined);

        const globalResolution = LimitsConfigResolver.Instance.Resolve();
        const runAlpha = makeRunSummary({
            AgentRunID: 'run-alpha-1',
            AgentID: 'agent-alpha',
            AgentName: 'AlphaAgent',
            UserID: 'user-alpha',
            HasSnapshot: true,
            ConsecutiveTurnsOverride: 1500,
            MaxCostOverride: 12.5,
            SourceTierLabel: 'MjConfig',
        });
        const runBeta = makeRunSummary({
            AgentRunID: 'run-beta-2',
            AgentID: 'agent-beta',
            AgentName: 'BetaAgent',
            UserID: 'user-beta',
            HasSnapshot: true,
            ConsecutiveTurnsOverride: 250,
            MaxCostOverride: 42,
            SourceTierLabel: 'RunOverride',
        });
        const runLegacy = makeRunSummary({
            AgentRunID: 'run-legacy-3',
            AgentID: 'agent-legacy',
            AgentName: 'LegacyAgent',
            UserID: 'user-legacy',
            HasSnapshot: false,
        });

        const diagnostics: LimitsGetDiagnosticsOutput = {
            ResolvedAtISO: '2026-11-21T10:00:00.000Z',
            TierPrecedence: ['CodeFallback', 'MjConfig', 'AgentOrWorkflowMetadata', 'UserAgentPolicy', 'RunOverride'],
            TierSummaries: [],
            ResolvedLimits: globalResolution.Limits,
            Provenance: globalResolution.Provenance,
            OverriddenKeys: [],
            ClampedKeys: [],
            ApprovedBackstops: [],
            BudgetUtilization: {
                ActiveRunCount: 0,
                PausedRunCount: 0,
                InspectedRunCount: 3,
                TotalObservedCostUsd: 4.5,
                TotalObservedTokens: 15000,
                CountPausedTimeTowardsWallClock: false,
                AllowedInFlightOvershootUsd: 0,
                AllowedInFlightOvershootMs: 0,
                DayBoundaryTimezone: 'UTC',
                Scopes: [],
            },
            ActiveAndRecentRuns: [runAlpha, runBeta, runLegacy],
            PausedRuns: [],
        };

        const getDiagnosticsSpy = vi.fn(async () => diagnostics);
        const navStub = {
            QueryParamChanged$: EMPTY,
            SetAgentContext: vi.fn(),
            SetAgentClientTools: vi.fn(),
            UpdateTabQueryParams: vi.fn(),
            ObserveTabQueryParams: () => EMPTY,
            IsTabShowingResource: vi.fn(() => true),
        };

        const fixture = await renderComponentFixture(AdminLimitsResourceComponent, {
            providers: [
                {
                    provide: AdminLimitsService,
                    useValue: {
                        GetDiagnostics: getDiagnosticsSpy,
                        ResumePausedRun: vi.fn(),
                        PauseRun: vi.fn(),
                    },
                },
                { provide: NavigationService, useValue: navStub },
            ],
        });

        const component = fixture.componentInstance;
        component.ActiveTab = 'runs';
        await component.RefreshDiagnostics();
        fixture.detectChanges();

        // Select Run Alpha -> MjConfig overrides (1500, $12.50)
        component.SelectRun(runAlpha);
        fixture.detectChanges();
        const drawerAlpha = query(fixture, '[data-testid="selected-run-limits-snapshot"]');
        expect(drawerAlpha).not.toBeNull();
        expect(drawerAlpha?.textContent).toContain('1500 (MjConfig)');
        expect(drawerAlpha?.textContent).toContain('$12.5000 (MjConfig)');
        const provRowsAlpha = queryAll(fixture, '[data-testid="selected-run-provenance-row"]');
        expect(provRowsAlpha.length).toBeGreaterThanOrEqual(2);

        // Select Run Beta -> RunOverride overrides (250, $42.0000)
        component.SelectRun(runBeta);
        fixture.detectChanges();
        const drawerBeta = query(fixture, '[data-testid="selected-run-limits-snapshot"]');
        expect(drawerBeta?.textContent).toContain('250 (RunOverride)');
        expect(drawerBeta?.textContent).toContain('$42.0000 (RunOverride)');

        // Refreshing with SelectedRun active must forward AgentID & UserID context
        await component.RefreshDiagnostics();
        expect(getDiagnosticsSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                AgentID: 'agent-beta',
                UserID: 'user-beta',
            }),
            undefined,
        );

        // Select Legacy run -> clean fallback rendered
        component.SelectRun(runLegacy);
        fixture.detectChanges();
        const fallback = query(fixture, '[data-testid="legacy-run-no-snapshot"]');
        expect(fallback).not.toBeNull();
        expect(fallback?.textContent).toContain('legacy run');
    });

    it('renders all 4 primary views/tabs in DOM and preserves fail-closed Resume/Pause error banners across RefreshDiagnostics', async () => {
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined);

        const globalResolution = LimitsConfigResolver.Instance.Resolve(
            {
                MjConfig: { AgentChannelConsecutiveTurns: 1200 },
                UserAgentPolicy: { Budgets: { PerRun: { MaxCostUsd: 15 } } },
                RunOverride: { Budgets: { PerRun: { MaxCostUsd: 80 } } },
            },
            { EnforceUserPolicyAsCeiling: true },
        );

        const pausedRun: LimitsActiveRunDiagnosticSummary = {
            ...makeRunSummary({
                AgentRunID: 'run-paused-dom-1',
                AgentID: 'agent-paused',
                AgentName: 'PausedBudgetAgent',
                UserID: 'user-owner',
                HasSnapshot: true,
                SourceTierLabel: 'RunOverride',
            }),
            Status: 'Paused',
            CompletedAtISO: null,
            IsPausedWithCheckpoint: true,
            CheckpointID: 'cp-dom-1',
            PauseReason: 'BudgetExceeded',
            PausedAtISO: '2026-11-21T10:05:00.000Z',
            PauseSummary: 'PerRun dollar budget exceeded ($15.10 / $15.00)',
            HumanApprovalStatus: 'Pending',
        };
        const runningRun: LimitsActiveRunDiagnosticSummary = {
            ...makeRunSummary({
                AgentRunID: 'run-active-dom-2',
                AgentID: 'agent-active',
                AgentName: 'ActiveWorkerAgent',
                UserID: 'user-owner',
                HasSnapshot: true,
                SourceTierLabel: 'MjConfig',
            }),
            Status: 'Running',
            CompletedAtISO: null,
        };

        const diagnostics: LimitsGetDiagnosticsOutput = {
            ResolvedAtISO: '2026-11-21T10:10:00.000Z',
            TierPrecedence: LIMITS_TIER_PRECEDENCE,
            TierSummaries: LIMITS_TIER_PRECEDENCE.map((tier, idx) => ({
                Tier: tier,
                Rank: idx + 1,
                Description: `Precedence tier ${tier}`,
                WinningKeyCount: tier === 'MjConfig' ? 1 : tier === 'UserAgentPolicy' ? 1 : 0,
                SuppliedKeyCount: 1,
            })),
            ResolvedLimits: globalResolution.Limits,
            Provenance: globalResolution.Provenance,
            OverriddenKeys: [...globalResolution.OverriddenKeys],
            ClampedKeys: [...globalResolution.ClampedKeys],
            ApprovedBackstops: [
                {
                    Key: 'AgentChannelConsecutiveTurns',
                    Label: 'Agent Channel Consecutive Turns',
                    Category: 'Backstops',
                    Unit: 'turns',
                    EffectiveValue: globalResolution.Limits.AgentChannelConsecutiveTurns,
                    ApprovedDefaultValue: CODE_FALLBACK_LIMITS.AgentChannelConsecutiveTurns,
                    SourceTier: 'MjConfig',
                    IsOverridden: true,
                    Description: 'Max consecutive turns',
                },
            ],
            BudgetUtilization: {
                ActiveRunCount: 1,
                PausedRunCount: 1,
                InspectedRunCount: 2,
                TotalObservedCostUsd: 3.0,
                TotalObservedTokens: 10_000,
                CountPausedTimeTowardsWallClock: false,
                AllowedInFlightOvershootUsd: 0,
                AllowedInFlightOvershootMs: 0,
                DayBoundaryTimezone: 'UTC',
                Scopes: [
                    {
                        Scope: 'PerRun',
                        Label: 'Per-Run Ceiling',
                        MaxCostUsd: 15,
                        ObservedCostUsd: 1.5,
                        CostUtilizationPct: 10,
                        MaxWallClockMs: 7_200_000,
                        ObservedWallClockMs: 1200,
                        WallClockUtilizationPct: 0.1,
                        Note: 'Within bounds',
                    },
                ],
            },
            ActiveAndRecentRuns: [pausedRun, runningRun],
            PausedRuns: [pausedRun],
        };

        const resumeSpy = vi.fn(async () => ({
            Success: false,
            AgentRunID: 'run-paused-dom-1',
            Status: 'Paused',
            CheckpointID: 'cp-dom-1',
            ApprovalStatus: 'Pending' as const,
            ExtendedBudgets: null,
            PriorCumulativeCostUsd: 1.5,
            PriorCumulativeActiveWallClockMs: 1200,
            StartingStepCount: 4,
            StartingPromptTurns: 2,
            Message: 'Fail-closed: no continuation dispatcher available; run remains Paused.',
        }));
        const pauseSpy = vi.fn(async () => ({
            Success: false,
            AgentRunID: 'run-active-dom-2',
            Status: 'Running',
            CheckpointID: null,
            Message: 'Fail-closed: insufficient permissions to pause run.',
        }));

        const navStub = {
            QueryParamChanged$: EMPTY,
            SetAgentContext: vi.fn(),
            SetAgentClientTools: vi.fn(),
            UpdateTabQueryParams: vi.fn(),
            ObserveTabQueryParams: () => EMPTY,
            IsTabShowingResource: vi.fn(() => true),
        };

        const fixture = await renderComponentFixture(AdminLimitsResourceComponent, {
            providers: [
                {
                    provide: AdminLimitsService,
                    useValue: {
                        GetDiagnostics: vi.fn(async () => diagnostics),
                        ResumePausedRun: resumeSpy,
                        PauseRun: pauseSpy,
                    },
                },
                { provide: NavigationService, useValue: navStub },
            ],
        });

        const component = fixture.componentInstance;
        await component.RefreshDiagnostics();
        fixture.detectChanges();

        // View 1: Resolved 5-Tier Hierarchy & Approved Backstops
        expect(component.ActiveTab).toBe('overview');
        expect(queryAll(fixture, '.tier-card').length).toBe(5);
        expect(queryAll(fixture, '.backstop-card').length).toBeGreaterThanOrEqual(1);
        expect(fixture.nativeElement.textContent).toContain('Agent Channel Consecutive Turns');

        // View 2: Tier Provenance table & clamping badges
        component.OnTabChange('provenance');
        fixture.detectChanges();
        const provenanceRows = queryAll(fixture, 'tbody tr');
        expect(provenanceRows.length).toBeGreaterThan(5);
        expect(fixture.nativeElement.textContent).toContain('Clamped by Policy');

        // View 3: Budgets & Utilization
        component.OnTabChange('budgets');
        fixture.detectChanges();
        expect(queryAll(fixture, '.scope-card').length).toBe(1);
        expect(fixture.nativeElement.textContent).toContain('Per-Run Ceiling');

        // View 4: Active & Paused Runs + Diagnostics drawer + fail-closed error persistence
        component.OnTabChange('runs');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('PausedBudgetAgent');
        expect(fixture.nativeElement.textContent).toContain('ActiveWorkerAgent');

        // Fail-closed Approve & Resume preserves error banner across RefreshDiagnostics and leaves run Paused
        component.OpenResumeModal(pausedRun);
        fixture.detectChanges();
        await component.ConfirmResumePausedRun();
        fixture.detectChanges();

        const resumeErrBanner = query(fixture, '[data-testid="admin-limits-error-banner"]');
        const modalErrBanner = query(fixture, '[data-testid="resume-modal-error-banner"]');
        expect(resumeErrBanner).not.toBeNull();
        expect(resumeErrBanner?.textContent).toContain('no continuation dispatcher available');
        expect(modalErrBanner?.textContent).toContain('no continuation dispatcher available');
        expect(component.Diagnostics?.PausedRuns[0].Status).toBe('Paused');

        // Close modal and test fail-closed PauseRun error banner persistence
        component.CloseResumeModal();
        await component.PauseActiveRun(runningRun);
        fixture.detectChanges();
        const pauseErrBanner = query(fixture, '[data-testid="admin-limits-error-banner"]');
        expect(pauseErrBanner).not.toBeNull();
        expect(pauseErrBanner?.textContent).toContain('insufficient permissions to pause run');
    });
});
