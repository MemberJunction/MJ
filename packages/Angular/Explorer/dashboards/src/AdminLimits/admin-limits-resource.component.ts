import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
} from '@angular/core';
import {
    LIMITS_KEY_PATHS,
    LIMITS_TIER_PRECEDENCE,
    type LimitsKeyPath,
    type LimitsKeyProvenance,
    type LimitsScalarValue,
    type LimitsSourceTier,
} from '@memberjunction/core';
import {
    ResourceData,
    UserInfoEngine,
} from '@memberjunction/core-entities';
import type {
    BudgetExtensionGrant,
    LimitsActiveRunDiagnosticSummary,
    LimitsConfigCategory,
    LimitsGetDiagnosticsOutput,
} from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    ADMIN_LIMITS_CATEGORIES,
    ADMIN_LIMITS_RUN_STATUS_FILTERS,
    BuildAdminLimitsAgentContext,
    ClassifyLimitsKeyCategory,
    IsValidAdminLimitsCategory,
    IsValidAdminLimitsRunStatusFilter,
    IsValidAdminLimitsTab,
    type AdminLimitsCategoryFilter,
    type AdminLimitsRunStatusFilter,
    type AdminLimitsTab,
} from './admin-limits-agent-context';
import { AdminLimitsService } from './services/admin-limits.service';

const ADMIN_LIMITS_SETTINGS_KEY = 'AdminLimits.UserPreferences';

/** Persisted user view preferences stored via `UserInfoEngine.Instance`. */
export interface AdminLimitsUserPreferences {
    ActiveTab: AdminLimitsTab;
    SelectedCategory: AdminLimitsCategoryFilter;
    RunStatusFilter: AdminLimitsRunStatusFilter;
    ShowOverriddenOnly: boolean;
    ShowClampedOnly: boolean;
}

/** Display row in the 5-tier provenance table. */
export interface LimitsProvenanceTableRow {
    Key: LimitsKeyPath;
    Category: LimitsConfigCategory;
    EffectiveValue: LimitsScalarValue;
    SourceTier: LimitsSourceTier;
    IsOverridden: boolean;
    WasClampedByPolicyCeiling: boolean;
    TierValues: Partial<Record<LimitsSourceTier, LimitsScalarValue>>;
}

/**
 * Explorer Admin Limits panel (`BaseResourceComponent`, `'AdminLimitsResource'`).
 *
 * Displays:
 * - Resolved 5-tier hierarchical `limits` (`CodeFallback` -> `MjConfig` -> `AgentOrWorkflowMetadata` -> `UserAgentPolicy` -> `RunOverride`)
 * - Approved backstops (`AgentChannelConsecutiveTurns`, `AgentChannelWakesPerHour`, `AgentAbsoluteIterations`, `MaxTasksPerAgentGraph`, `WhileLoopMaxIterations`, `ForEachMaxIterations`, `MaxTasksPerGraph`) & Briefing limits
 * - Per-key tier provenance and policy-ceiling clamping
 * - Multi-scope budget utilization (`PerRun`, `PerRoutine`, `PerUserPerDay`)
 * - Active & paused run diagnostics, deterministic progress signals, fast judge reasons, and non-destructive pause/resume controls
 *
 * 🚨 SAFETY BOUNDARY: AI agent tools registered by this surface are strictly read-only
 * and navigational. Pause/resume mutations require explicit human operator confirmation in the UI.
 */
@Component({
    standalone: false,
    selector: 'mj-admin-limits-resource',
    templateUrl: './admin-limits-resource.component.html',
    styleUrls: ['./admin-limits-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseResourceComponent, 'AdminLimitsResource')
export class AdminLimitsResourceComponent
    extends BaseResourceComponent
    implements OnInit, AfterViewInit, OnDestroy
{
    public IsLoading = false;
    public IsRefreshing = false;
    public IsMutatingRun = false;
    public LoadError: string | null = null;
    public ActionFeedback: string | null = null;

    public ActiveTab: AdminLimitsTab = 'overview';
    public SelectedCategory: AdminLimitsCategoryFilter = 'All';
    public RunStatusFilter: AdminLimitsRunStatusFilter = 'All';
    public SearchQuery = '';
    public ShowOverriddenOnly = false;
    public ShowClampedOnly = false;

    public Diagnostics: LimitsGetDiagnosticsOutput | null = null;
    public SelectedRun: LimitsActiveRunDiagnosticSummary | null = null;

    // Resume / Budget Extension modal state
    public ResumeModalRun: LimitsActiveRunDiagnosticSummary | null = null;
    public AdditionalCostUsdInput = '';
    public AdditionalWallClockMsInput = '';
    public DecisionNotesInput = '';
    public ResetProgressWindowOnResume = true;

    public readonly TierPrecedence: readonly LimitsSourceTier[] = LIMITS_TIER_PRECEDENCE;
    public readonly TotalLimitsKeyCount: number = LIMITS_KEY_PATHS.length;
    public readonly CategoryOptions: readonly AdminLimitsCategoryFilter[] = ADMIN_LIMITS_CATEGORIES;
    public readonly RunStatusOptions: readonly AdminLimitsRunStatusFilter[] = ADMIN_LIMITS_RUN_STATUS_FILTERS;

    constructor(
        private readonly cdr: ChangeDetectorRef,
        private readonly limitsService: AdminLimitsService,
    ) {
        super();
    }

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Execution Limits';
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-gauge-high';
    }

    public override ngOnInit(): void {
        super.ngOnInit();
        this.loadUserPreferences();
        this.applyQueryParams(this.GetQueryParams());
        // Defer NotifyLoadStarted() out of synchronous ngOnInit to prevent NG0100
        queueMicrotask(() => {
            this.NotifyLoadStarted();
            void this.RefreshDiagnostics();
        });
    }

    public ngAfterViewInit(): void {
        this.publishAgentContext();
        this.syncAgentTools();
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    protected override OnQueryParamsChanged(
        params: Record<string, string>,
        _source: 'popstate' | 'deeplink',
    ): void {
        const changed = this.applyQueryParams(params);
        if (changed) {
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    /** Loads diagnostics from `Limits.GetDiagnostics` using the component's bound provider. */
    public async RefreshDiagnostics(contextOverride?: { AgentID?: string; UserID?: string }): Promise<void> {
        const initialLoad = this.Diagnostics === null;
        if (initialLoad) {
            this.IsLoading = true;
        } else {
            this.IsRefreshing = true;
        }
        this.LoadError = null;
        this.cdr.markForCheck();

        try {
            const agentId = contextOverride?.AgentID ?? this.SelectedRun?.AgentID ?? undefined;
            const userId = contextOverride?.UserID ?? this.SelectedRun?.UserID ?? undefined;
            const output = await this.limitsService.GetDiagnostics(
                {
                    ...(agentId ? { AgentID: agentId } : {}),
                    ...(userId ? { UserID: userId } : {}),
                    MaxRuns: 50,
                },
                this.ProviderToUse,
            );
            this.Diagnostics = output;
            if (this.SelectedRun) {
                const updatedSelection = output.ActiveAndRecentRuns.find(
                    (r) => r.AgentRunID === this.SelectedRun?.AgentRunID,
                );
                this.SelectedRun = updatedSelection ?? null;
            }
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoading = false;
            this.IsRefreshing = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
            this.NotifyLoadComplete();
        }
    }

    public OnTabChange(tab: AdminLimitsTab): void {
        if (this.ActiveTab === tab) {
            return;
        }
        this.ActiveTab = tab;
        this.persistUserPreferences();
        this.syncUrlParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnCategoryChange(category: AdminLimitsCategoryFilter): void {
        this.SelectedCategory = category;
        this.persistUserPreferences();
        this.syncUrlParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnCategorySelectEvent(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLSelectElement && IsValidAdminLimitsCategory(target.value)) {
            this.OnCategoryChange(target.value);
        }
    }

    public OnRunStatusFilterChange(status: AdminLimitsRunStatusFilter): void {
        this.RunStatusFilter = status;
        this.persistUserPreferences();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnRunStatusSelectEvent(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLSelectElement && IsValidAdminLimitsRunStatusFilter(target.value)) {
            this.OnRunStatusFilterChange(target.value);
        }
    }

    public OnAdditionalCostInputEvent(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            this.AdditionalCostUsdInput = target.value;
        }
    }

    public OnAdditionalWallClockInputEvent(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            this.AdditionalWallClockMsInput = target.value;
        }
    }

    public OnDecisionNotesInputEvent(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLTextAreaElement) {
            this.DecisionNotesInput = target.value;
        }
    }

    public OnResetProgressCheckboxEvent(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            this.ResetProgressWindowOnResume = target.checked;
        }
    }

    public OnSearchChange(term: string): void {
        this.SearchQuery = term;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public ToggleOverriddenOnly(): void {
        this.ShowOverriddenOnly = !this.ShowOverriddenOnly;
        this.persistUserPreferences();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public ToggleClampedOnly(): void {
        this.ShowClampedOnly = !this.ShowClampedOnly;
        this.persistUserPreferences();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public SelectRun(run: LimitsActiveRunDiagnosticSummary | null): void {
        this.SelectedRun = run;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OpenResumeModal(run: LimitsActiveRunDiagnosticSummary): void {
        this.ResumeModalRun = run;
        this.AdditionalCostUsdInput = '';
        this.AdditionalWallClockMsInput = '';
        this.DecisionNotesInput = '';
        this.ResetProgressWindowOnResume = true;
        this.ActionFeedback = null;
        this.cdr.markForCheck();
    }

    public CloseResumeModal(): void {
        this.ResumeModalRun = null;
        this.cdr.markForCheck();
    }

    public async ConfirmResumePausedRun(): Promise<void> {
        const run = this.ResumeModalRun;
        if (!run || this.IsMutatingRun) {
            return;
        }
        this.IsMutatingRun = true;
        this.ActionFeedback = null;
        this.cdr.markForCheck();

        try {
            const extension = this.buildBudgetExtensionGrant();
            const result = await this.limitsService.ResumePausedRun(
                {
                    AgentRunID: run.AgentRunID,
                    BudgetExtension: extension,
                    DecisionNotes: this.DecisionNotesInput.trim() || null,
                    PrepareResume: true,
                },
                this.ProviderToUse,
            );
            this.ActionFeedback = result.Message;
            this.ResumeModalRun = null;
            await this.RefreshDiagnostics();
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsMutatingRun = false;
            this.cdr.markForCheck();
        }
    }

    public async PauseActiveRun(run: LimitsActiveRunDiagnosticSummary): Promise<void> {
        if (this.IsMutatingRun || run.Status !== 'Running') {
            return;
        }
        this.IsMutatingRun = true;
        this.ActionFeedback = null;
        this.cdr.markForCheck();

        try {
            const result = await this.limitsService.PauseRun(
                {
                    AgentRunID: run.AgentRunID,
                    Summary: `Paused non-destructively from Admin Limits console`,
                },
                this.ProviderToUse,
            );
            this.ActionFeedback = result.Message;
            await this.RefreshDiagnostics();
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsMutatingRun = false;
            this.cdr.markForCheck();
        }
    }

    /** Returns per-key resolved values and tier provenance captured on the currently selected run's snapshot. */
    public get SelectedRunSnapshotRows(): LimitsProvenanceTableRow[] {
        const snapshot = this.SelectedRun?.Snapshot;
        if (!snapshot) {
            return [];
        }
        const rows: LimitsProvenanceTableRow[] = [];
        for (const key of LIMITS_KEY_PATHS) {
            const prov = snapshot.Provenance[key];
            if (!prov) {
                continue;
            }
            if (prov.IsOverridden || prov.WasClampedByPolicyCeiling) {
                rows.push({
                    Key: key,
                    Category: ClassifyLimitsKeyCategory(key),
                    EffectiveValue: prov.Value,
                    SourceTier: prov.SourceTier,
                    IsOverridden: prov.IsOverridden,
                    WasClampedByPolicyCeiling: prov.WasClampedByPolicyCeiling,
                    TierValues: prov.TierValues,
                });
            }
        }
        return rows;
    }

    public get ProvenanceRows(): LimitsProvenanceTableRow[] {
        const diag = this.Diagnostics;
        if (!diag) {
            return [];
        }
        const query = this.SearchQuery.trim().toLowerCase();
        const rows: LimitsProvenanceTableRow[] = [];

        for (const key of LIMITS_KEY_PATHS) {
            const prov: LimitsKeyProvenance | undefined = diag.Provenance[key];
            if (!prov) {
                continue;
            }
            const category = ClassifyLimitsKeyCategory(key);
            if (this.SelectedCategory !== 'All' && category !== this.SelectedCategory) {
                continue;
            }
            if (this.ShowOverriddenOnly && !prov.IsOverridden) {
                continue;
            }
            if (this.ShowClampedOnly && !prov.WasClampedByPolicyCeiling) {
                continue;
            }
            if (query && !key.toLowerCase().includes(query) && !prov.SourceTier.toLowerCase().includes(query)) {
                continue;
            }
            rows.push({
                Key: key,
                Category: category,
                EffectiveValue: prov.Value,
                SourceTier: prov.SourceTier,
                IsOverridden: prov.IsOverridden,
                WasClampedByPolicyCeiling: prov.WasClampedByPolicyCeiling,
                TierValues: prov.TierValues,
            });
        }
        return rows;
    }

    public get FilteredRuns(): LimitsActiveRunDiagnosticSummary[] {
        const diag = this.Diagnostics;
        if (!diag) {
            return [];
        }
        const query = this.SearchQuery.trim().toLowerCase();
        return diag.ActiveAndRecentRuns.filter((run) => {
            if (this.RunStatusFilter !== 'All' && run.Status !== this.RunStatusFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            return (
                run.AgentName.toLowerCase().includes(query) ||
                run.AgentRunID.toLowerCase().includes(query) ||
                run.UserName.toLowerCase().includes(query) ||
                (run.ProgressReason ?? '').toLowerCase().includes(query) ||
                (run.PauseSummary ?? '').toLowerCase().includes(query)
            );
        });
    }

    public FormatScalarValue(value: LimitsScalarValue | undefined): string {
        if (value === undefined) {
            return '—';
        }
        if (value === null) {
            return 'null (unlimited)';
        }
        if (typeof value === 'number') {
            return value.toLocaleString();
        }
        return String(value);
    }

    public FormatDurationMs(ms: number | null | undefined): string {
        if (ms == null) {
            return 'Unlimited';
        }
        if (ms < 1000) {
            return `${Math.round(ms)} ms`;
        }
        const seconds = ms / 1000;
        if (seconds < 60) {
            return `${seconds.toFixed(1)} s`;
        }
        const minutes = seconds / 60;
        return `${minutes.toFixed(1)} min`;
    }

    public FormatCostUsd(usd: number | null | undefined): string {
        if (usd == null) {
            return 'Unlimited';
        }
        return `$${usd.toFixed(4)}`;
    }

    private buildBudgetExtensionGrant(): BudgetExtensionGrant {
        const grant: BudgetExtensionGrant = {
            ResetProgressDetectorWindow: this.ResetProgressWindowOnResume,
        };
        const costParsed = Number(this.AdditionalCostUsdInput.trim());
        if (this.AdditionalCostUsdInput.trim().length > 0 && Number.isFinite(costParsed) && costParsed > 0) {
            grant.AdditionalCostUsd = costParsed;
        }
        const wallParsed = Number(this.AdditionalWallClockMsInput.trim());
        if (this.AdditionalWallClockMsInput.trim().length > 0 && Number.isFinite(wallParsed) && wallParsed > 0) {
            grant.AdditionalWallClockMs = Math.trunc(wallParsed);
        }
        return grant;
    }

    private loadUserPreferences(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(ADMIN_LIMITS_SETTINGS_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as Partial<AdminLimitsUserPreferences>;
            if (IsValidAdminLimitsTab(parsed.ActiveTab)) {
                this.ActiveTab = parsed.ActiveTab;
            }
            if (IsValidAdminLimitsCategory(parsed.SelectedCategory)) {
                this.SelectedCategory = parsed.SelectedCategory;
            }
            if (IsValidAdminLimitsRunStatusFilter(parsed.RunStatusFilter)) {
                this.RunStatusFilter = parsed.RunStatusFilter;
            }
            if (typeof parsed.ShowOverriddenOnly === 'boolean') {
                this.ShowOverriddenOnly = parsed.ShowOverriddenOnly;
            }
            if (typeof parsed.ShowClampedOnly === 'boolean') {
                this.ShowClampedOnly = parsed.ShowClampedOnly;
            }
        } catch {
            // Fall back to defaults on malformed stored settings
        }
    }

    private persistUserPreferences(): void {
        try {
            const prefs: AdminLimitsUserPreferences = {
                ActiveTab: this.ActiveTab,
                SelectedCategory: this.SelectedCategory,
                RunStatusFilter: this.RunStatusFilter,
                ShowOverriddenOnly: this.ShowOverriddenOnly,
                ShowClampedOnly: this.ShowClampedOnly,
            };
            UserInfoEngine.Instance.SetSettingDebounced(
                ADMIN_LIMITS_SETTINGS_KEY,
                JSON.stringify(prefs),
            );
        } catch {
            // Ignore settings persistence failures
        }
    }

    private applyQueryParams(params: Record<string, string>): boolean {
        if (!params) {
            return false;
        }
        let changed = false;
        if (params['tab'] && IsValidAdminLimitsTab(params['tab']) && params['tab'] !== this.ActiveTab) {
            this.ActiveTab = params['tab'];
            changed = true;
        }
        if (
            params['category'] &&
            IsValidAdminLimitsCategory(params['category']) &&
            params['category'] !== this.SelectedCategory
        ) {
            this.SelectedCategory = params['category'];
            changed = true;
        }
        return changed;
    }

    private syncUrlParams(): void {
        if (!this.getTabId()) {
            return;
        }
        this.UpdateQueryParams({
            tab: this.ActiveTab,
            category: this.SelectedCategory === 'All' ? null : this.SelectedCategory,
        });
    }

    private publishAgentContext(): void {
        if (!this.navigationService) {
            return;
        }
        const ctx = BuildAdminLimitsAgentContext({
            ActiveTab: this.ActiveTab,
            SelectedCategory: this.SelectedCategory,
            RunStatusFilter: this.RunStatusFilter,
            SearchQuery: this.SearchQuery,
            ShowOverriddenOnly: this.ShowOverriddenOnly,
            ShowClampedOnly: this.ShowClampedOnly,
            IsLoading: this.IsLoading || this.IsRefreshing,
            TotalKeysCount: LIMITS_KEY_PATHS.length,
            OverriddenKeysCount: this.Diagnostics?.OverriddenKeys.length ?? 0,
            ClampedKeysCount: this.Diagnostics?.ClampedKeys.length ?? 0,
            ActiveRunCount: this.Diagnostics?.BudgetUtilization.ActiveRunCount ?? 0,
            PausedRunCount: this.Diagnostics?.PausedRuns.length ?? 0,
            PausedRunAgents: (this.Diagnostics?.PausedRuns ?? []).map((r) => r.AgentName),
            SelectedRunID: this.SelectedRun?.AgentRunID ?? null,
        });
        this.navigationService.SetAgentContext(this, ctx);
    }

    private syncAgentTools(): void {
        if (!this.navigationService) {
            return;
        }
        // SAFETY BOUNDARY: Only read-only / navigational tools are exposed here.
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchLimitsTab',
                Description: 'Switches the active tab on the Admin Limits governance dashboard.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: { type: 'string', enum: ['overview', 'provenance', 'budgets', 'runs'] },
                    },
                    required: ['tab'],
                },
                Handler: async (params) => {
                    const tabVal = typeof params['tab'] === 'string' ? params['tab'] : undefined;
                    if (IsValidAdminLimitsTab(tabVal)) {
                        this.OnTabChange(tabVal);
                        return { success: true, activeTab: this.ActiveTab };
                    }
                    return { success: false, error: `Invalid tab: ${String(params['tab'])}` };
                },
            },
            {
                Name: 'FilterLimitsCategory',
                Description: 'Filters the Tier Provenance table by configuration category.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        category: {
                            type: 'string',
                            enum: ['All', 'Backstops', 'Briefing', 'Budgets', 'ProgressDetector', 'ResourceGuards', 'Tuning'],
                        },
                    },
                    required: ['category'],
                },
                Handler: async (params) => {
                    const catVal = typeof params['category'] === 'string' ? params['category'] : undefined;
                    if (IsValidAdminLimitsCategory(catVal)) {
                        this.OnCategoryChange(catVal);
                        return { success: true, selectedCategory: this.SelectedCategory };
                    }
                    return { success: false, error: `Invalid category: ${String(params['category'])}` };
                },
            },
            {
                Name: 'RefreshLimitsDiagnostics',
                Description: 'Refreshes resolved 5-tier limits, budget utilization, and run diagnostics.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.RefreshDiagnostics();
                    return {
                        success: true,
                        overriddenCount: this.Diagnostics?.OverriddenKeys.length ?? 0,
                        pausedRunCount: this.Diagnostics?.PausedRuns.length ?? 0,
                    };
                },
            },
        ]);
    }
}

/** Retains `AdminLimitsResourceComponent` against bundler tree-shaking. */
export function LoadAdminLimitsResource(): void {
    void AdminLimitsResourceComponent;
}
