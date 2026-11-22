import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import {
    CODE_FALLBACK_LIMITS,
    LIMITS_KEY_PATHS,
    LIMITS_TIER_PRECEDENCE,
    LimitsConfigResolver,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import type {
    LimitsActiveRunDiagnosticSummary,
    LimitsGetDiagnosticsOutput,
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

import {
    AdminLimitsResourceComponent,
    LoadAdminLimitsResource,
} from '../AdminLimits/admin-limits-resource.component';
import type { AdminLimitsService } from '../AdminLimits/services/admin-limits.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DASHBOARDS_SRC = resolve(__dirname, '..');
const REPO_ROOT = resolve(__dirname, '../../../../../..');

function makeSampleDiagnostics(): LimitsGetDiagnosticsOutput {
    const res = LimitsConfigResolver.Instance.Resolve({
        MjConfig: { AgentChannelConsecutiveTurns: 1500 },
        UserAgentPolicy: { Budgets: { PerRun: { MaxCostUsd: 20 } } },
        RunOverride: { Budgets: { PerRun: { MaxCostUsd: 50 } } },
    }, { EnforceUserPolicyAsCeiling: true });

    const pausedRun: LimitsActiveRunDiagnosticSummary = {
        AgentRunID: 'run-paused-1',
        AgentID: 'agent-1',
        AgentName: 'PlannerAgent',
        UserID: 'user-1',
        UserName: 'Alice Owner',
        Status: 'Paused',
        StartedAtISO: '2026-11-21T10:00:00.000Z',
        CompletedAtISO: null,
        TotalCostUsd: 1.25,
        TotalTokensUsed: 8000,
        TotalPromptIterations: 12,
        HasLimitsSnapshot: true,
        OverriddenKeyCount: 2,
        ClampedKeyCount: 1,
        Snapshot: null,
        ProgressClassification: 'Ambiguous',
        ProgressScore: 0.41,
        ProgressReason: 'Ambiguous progress triggered fast judge',
        FastJudgeEntries: [
            {
                TimestampISO: '2026-11-21T10:01:00.000Z',
                Iteration: 12,
                Converging: false,
                Reason: 'Repeating tool lookup without writing new rows',
                LatencyMs: 24,
                TimedOut: false,
                UsedFallback: false,
                Source: 'Model',
            },
        ],
        IsPausedWithCheckpoint: true,
        CheckpointID: 'cp-1',
        PauseReason: 'FastJudgeStalled',
        PausedAtISO: '2026-11-21T10:01:01.000Z',
        PauseSummary: 'Paused by FastConvergenceJudge',
        CompletedStepCount: 12,
        CompletedPromptTurns: 6,
        HumanApprovalStatus: 'Pending',
        CumulativeRunCostUsd: 1.25,
        CumulativeRunWallClockMs: 5200,
    };

    const activeRun: LimitsActiveRunDiagnosticSummary = {
        AgentRunID: 'run-active-1',
        AgentID: 'agent-2',
        AgentName: 'ResearchAgent',
        UserID: 'user-1',
        UserName: 'Alice Owner',
        Status: 'Running',
        StartedAtISO: '2026-11-21T10:05:00.000Z',
        CompletedAtISO: null,
        TotalCostUsd: 0.4,
        TotalTokensUsed: 2500,
        TotalPromptIterations: 5,
        HasLimitsSnapshot: true,
        OverriddenKeyCount: 1,
        ClampedKeyCount: 0,
        Snapshot: null,
        ProgressClassification: 'Converging',
        ProgressScore: 0.88,
        ProgressReason: 'Steady progress creating records',
        FastJudgeEntries: [],
        IsPausedWithCheckpoint: false,
        CheckpointID: null,
        PauseReason: null,
        PausedAtISO: null,
        PauseSummary: null,
        CompletedStepCount: 5,
        CompletedPromptTurns: 3,
        HumanApprovalStatus: null,
        CumulativeRunCostUsd: 0.4,
        CumulativeRunWallClockMs: 2100,
    };

    return {
        ResolvedAtISO: res.ResolvedAtISO,
        TierPrecedence: LIMITS_TIER_PRECEDENCE,
        TierSummaries: LIMITS_TIER_PRECEDENCE.map((tier, idx) => ({
            Tier: tier,
            Rank: idx + 1,
            Description: `Tier ${idx + 1}`,
            WinningKeyCount: tier === 'MjConfig' ? 1 : tier === 'UserAgentPolicy' ? 1 : tier === 'CodeFallback' ? LIMITS_KEY_PATHS.length - 2 : 0,
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
            {
                Key: 'BriefingContributorTimeoutMs',
                Label: 'Briefing Contributor Timeout',
                Category: 'Briefing',
                Unit: 'ms',
                EffectiveValue: res.Limits.BriefingContributorTimeoutMs,
                ApprovedDefaultValue: CODE_FALLBACK_LIMITS.BriefingContributorTimeoutMs,
                SourceTier: 'CodeFallback',
                IsOverridden: false,
                Description: 'Briefing timeout',
            },
        ],
        BudgetUtilization: {
            ActiveRunCount: 1,
            PausedRunCount: 1,
            InspectedRunCount: 2,
            TotalObservedCostUsd: 1.65,
            TotalObservedTokens: 10_500,
            CountPausedTimeTowardsWallClock: false,
            AllowedInFlightOvershootUsd: 0,
            AllowedInFlightOvershootMs: 0,
            DayBoundaryTimezone: 'UTC',
            Scopes: [
                {
                    Scope: 'PerRun',
                    Label: 'Per-Run Ceiling',
                    MaxCostUsd: 20,
                    ObservedCostUsd: 1.25,
                    CostUtilizationPct: 6.3,
                    MaxWallClockMs: 7_200_000,
                    ObservedWallClockMs: 5200,
                    WallClockUtilizationPct: 0.1,
                    Note: 'Within bounds',
                },
            ],
        },
        ActiveAndRecentRuns: [pausedRun, activeRun],
        PausedRuns: [pausedRun],
    };
}

describe('AdminLimitsResourceComponent & Explorer Governance Surface', () => {
    let component: AdminLimitsResourceComponent;
    let getDiagnosticsSpy: ReturnType<typeof vi.fn<AdminLimitsService['GetDiagnostics']>>;
    let resumePausedRunSpy: ReturnType<typeof vi.fn<AdminLimitsService['ResumePausedRun']>>;
    let pauseRunSpy: ReturnType<typeof vi.fn<AdminLimitsService['PauseRun']>>;
    let mockService: AdminLimitsService;
    let sampleDiag: LimitsGetDiagnosticsOutput;

    beforeEach(() => {
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        LoadAdminLimitsResource();
        sampleDiag = makeSampleDiagnostics();

        getDiagnosticsSpy = vi.fn<AdminLimitsService['GetDiagnostics']>(async () => sampleDiag);
        resumePausedRunSpy = vi.fn<AdminLimitsService['ResumePausedRun']>(async () => ({
            Success: true,
            AgentRunID: 'run-paused-1',
            Status: 'Running',
            CheckpointID: 'cp-1',
            ApprovalStatus: 'Approved',
            ExtendedBudgets: null,
            PriorCumulativeCostUsd: 1.25,
            PriorCumulativeActiveWallClockMs: 5200,
            StartingStepCount: 12,
            StartingPromptTurns: 6,
            Message: 'Run run-paused-1 approved and transitioned back to Running.',
        }));
        pauseRunSpy = vi.fn<AdminLimitsService['PauseRun']>(async () => ({
            Success: true,
            AgentRunID: 'run-active-1',
            Status: 'Paused',
            CheckpointID: 'cp-2',
            Message: 'Run run-active-1 paused non-destructively.',
        }));

        const mockServiceInstance: Partial<AdminLimitsService> = {
            GetDiagnostics: getDiagnosticsSpy,
            ResumePausedRun: resumePausedRunSpy,
            PauseRun: pauseRunSpy,
        };
        mockService = mockServiceInstance as AdminLimitsService;

        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined);

        component = new AdminLimitsResourceComponent(
            mockCdr as Partial<ChangeDetectorRef> as ChangeDetectorRef,
            mockService,
        );
    });

    it('registers AdminLimitsResource against BaseResourceComponent in ClassFactory and wires Admin DefaultNavItems', () => {
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseResourceComponent, 'AdminLimitsResource');
        expect(reg).toBeDefined();

        const adminAppPath = resolve(REPO_ROOT, 'metadata/applications/.admin-application.json');
        const adminApp = JSON.parse(readFileSync(adminAppPath, 'utf8')) as {
            fields: { DefaultNavItems: Array<{ Label: string; DriverClass: string }> };
        };
        const limitsNav = adminApp.fields.DefaultNavItems.find((i) => i.DriverClass === 'AdminLimitsResource');
        expect(limitsNav).toBeDefined();
        expect(limitsNav?.Label).toBe('Execution Limits');
    });

    it('enforces OnPush, <mj-page-layout>, zero raw color literals, and zero localStorage/sessionStorage', () => {
        const tsSource = readFileSync(resolve(DASHBOARDS_SRC, 'AdminLimits/admin-limits-resource.component.ts'), 'utf8');
        const htmlSource = readFileSync(resolve(DASHBOARDS_SRC, 'AdminLimits/admin-limits-resource.component.html'), 'utf8');
        const cssSource = readFileSync(resolve(DASHBOARDS_SRC, 'AdminLimits/admin-limits-resource.component.css'), 'utf8');

        expect(tsSource).toContain('ChangeDetectionStrategy.OnPush');
        expect(tsSource).not.toContain('localStorage');
        expect(tsSource).not.toContain('sessionStorage');
        expect(htmlSource).toContain('<mj-page-layout>');
        expect(htmlSource).toContain('<mj-page-header');
        expect(htmlSource).toContain('<mj-page-body>');

        const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/g;
        expect(cssSource.match(rawColorPattern)).toBeNull();
        expect(htmlSource.match(rawColorPattern)).toBeNull();
        expect(cssSource).not.toContain('.mj-btn');
    });

    it('defers NotifyLoadStarted out of synchronous ngOnInit and calls NotifyLoadComplete after loading diagnostics', async () => {
        const componentWithLifecycle = component as AdminLimitsResourceComponent & {
            NotifyLoadStarted(): void;
            NotifyLoadComplete(): void;
            OnQueryParamsChanged(p: Record<string, string>, s: 'popstate' | 'deeplink'): void;
        };
        const notifyStartedSpy = vi.spyOn(componentWithLifecycle, 'NotifyLoadStarted');
        const notifyCompleteSpy = vi.spyOn(componentWithLifecycle, 'NotifyLoadComplete');

        component.ngOnInit();
        // Deferred via queueMicrotask to prevent NG0100
        expect(notifyStartedSpy).not.toHaveBeenCalled();

        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 10));

        expect(notifyStartedSpy).toHaveBeenCalledTimes(1);
        expect(notifyCompleteSpy).toHaveBeenCalledTimes(1);
        expect(mockService.GetDiagnostics).toHaveBeenCalledTimes(1);
        expect(component.Diagnostics?.ApprovedBackstops).toHaveLength(2);
    });

    it('persists preferences via UserInfoEngine and round-trips query params', async () => {
        await component.RefreshDiagnostics();

        component.OnTabChange('provenance');
        expect(UserInfoEngine.Instance.SetSettingDebounced).toHaveBeenCalled();

        component.OnCategoryChange('Budgets');
        expect(component.ProvenanceRows.every((r) => r.Category === 'Budgets')).toBe(true);

        component.ToggleClampedOnly();
        expect(component.ProvenanceRows.every((r) => r.WasClampedByPolicyCeiling)).toBe(true);
        expect(component.ProvenanceRows.length).toBeGreaterThanOrEqual(1);

        // Simulate back/forward popstate query param restoration
        (component as AdminLimitsResourceComponent & {
            OnQueryParamsChanged(p: Record<string, string>, s: 'popstate' | 'deeplink'): void;
        }).OnQueryParamsChanged({ tab: 'runs', category: 'All' }, 'popstate');
        expect(component.ActiveTab).toBe('runs');
        expect(component.SelectedCategory).toBe('All');
    });

    it('executes Approve & Resume and Pause controls via AdminLimitsService and keeps agent client tools read-only', async () => {
        await component.RefreshDiagnostics();
        component.ngAfterViewInit();

        expect(mockNavigationService.SetAgentContext).toHaveBeenCalled();
        const registeredTools = mockNavigationService.SetAgentClientTools.mock.calls[0]?.[1] as Array<{ Name: string }>;
        expect(registeredTools.map((t) => t.Name)).toEqual([
            'SwitchLimitsTab',
            'FilterLimitsCategory',
            'RefreshLimitsDiagnostics',
        ]);

        const pausedRun = component.Diagnostics!.PausedRuns[0];
        component.OpenResumeModal(pausedRun);
        component.AdditionalCostUsdInput = '10';
        component.AdditionalWallClockMsInput = '30000';
        component.DecisionNotesInput = 'Approved extension';
        await component.ConfirmResumePausedRun();

        expect(resumePausedRunSpy).toHaveBeenCalledTimes(1);
        expect(resumePausedRunSpy.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({
                AgentRunID: 'run-paused-1',
                DecisionNotes: 'Approved extension',
                BudgetExtension: expect.objectContaining({
                    AdditionalCostUsd: 10,
                    AdditionalWallClockMs: 30000,
                    ResetProgressDetectorWindow: true,
                }),
            }),
        );
        expect(component.ResumeModalRun).toBeNull();

        const activeRun = component.Diagnostics!.ActiveAndRecentRuns[1];
        await component.PauseActiveRun(activeRun);
        expect(pauseRunSpy).toHaveBeenCalledTimes(1);
        expect(pauseRunSpy.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({ AgentRunID: 'run-active-1' }),
        );
    });

    it('CR-UI-UUID-COMPARISON: retains SelectedRun across RefreshDiagnostics when AgentRunID has mixed UUID casing', async () => {
        const lowerId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        const upperId = lowerId.toUpperCase();
        const initialDiag = makeSampleDiagnostics();
        initialDiag.ActiveAndRecentRuns[0] = {
            ...initialDiag.ActiveAndRecentRuns[0],
            AgentRunID: lowerId,
        };
        const refreshedDiag = makeSampleDiagnostics();
        refreshedDiag.ActiveAndRecentRuns[0] = {
            ...refreshedDiag.ActiveAndRecentRuns[0],
            AgentRunID: upperId,
            ProgressReason: 'Refreshed with uppercase UUID',
        };

        getDiagnosticsSpy
            .mockResolvedValueOnce(initialDiag)
            .mockResolvedValueOnce(refreshedDiag);

        await component.RefreshDiagnostics();
        component.SelectRun(component.Diagnostics!.ActiveAndRecentRuns[0]);
        expect(component.SelectedRun?.AgentRunID).toBe(lowerId);

        await component.RefreshDiagnostics();
        expect(component.SelectedRun).not.toBeNull();
        expect(component.SelectedRun?.AgentRunID).toBe(upperId);
        expect(component.SelectedRun?.ProgressReason).toBe('Refreshed with uppercase UUID');
        expect(component.IsRunSelected({ ...initialDiag.ActiveAndRecentRuns[0], AgentRunID: lowerId })).toBe(true);
    });
});
