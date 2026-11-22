import '@angular/compiler';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LimitsConfigResolver } from '@memberjunction/core';
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
});
