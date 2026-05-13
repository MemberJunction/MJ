/**
 * @fileoverview AI Analytics Shell — Resource Component
 *
 * Main resource component for the AI Analytics dashboard. Provides a left
 * navigation panel and content area that switches between analytics sections:
 * Executive Summary, Prompt Runs, Agent Runs, Model Performance, Cost & Budget,
 * Error Analysis, and Usage Patterns.
 *
 * Persists the active section and filter state via UserInfoEngine settings
 * with debounced writes.
 */

import { Component, ChangeDetectorRef, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { AnalyticsExecutiveSummaryComponent } from './executive-summary/executive-summary.component';
import { AnalyticsPromptRunsComponent } from './prompt-runs/prompt-run-analysis.component';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { AIAnalyticsPreferences, GlobalFilterState } from '../../interfaces/analytics-preferences.interface';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';

interface NavItem {
    Label?: string;
    Icon?: string;
    Key: string;
}

@RegisterClass(BaseResourceComponent, 'AIAnalyticsResource')
@Component({
    standalone: false,
    selector: 'app-ai-analytics-resource',
    template: `
      <mj-page-layout>
        <mj-page-header
            Title="Analytics"
            Icon="fa-solid fa-chart-line">
            @if (ShowSharedFilterBar) {
                <div actions class="ai-header-actions">
                    @if (analyticsFilterFields.length > 0) {
                        <mj-filter-popover
                            [ActiveCount]="ActiveFilterCount"
                            [ShowClearAll]="ActiveFilterCount > 0"
                            (ClearAllRequested)="resetPopoverFilters()">
                            <mj-filter-panel
                                [Fields]="analyticsFilterFields"
                                [Values]="analyticsFilterValues"
                                (ValuesChange)="onAnalyticsFilterValuesChange($event)"
                                (Reset)="resetPopoverFilters()">
                            </mj-filter-panel>
                        </mj-filter-popover>
                    }
                    @if (FilterBarConfig.ShowCompareToggle) {
                        <button mjButton variant="secondary" size="sm" [toggleable]="true" [(selected)]="compareActive" (selectedChange)="toggleCompare()">
                            <i class="fa-solid fa-code-compare"></i> Compare
                        </button>
                    }
                    @if (FilterBarConfig.ShowExportButton) {
                        <button mjButton variant="secondary" size="sm" (click)="OnExportClicked()">
                            <i class="fa-solid fa-download"></i> Export
                        </button>
                    }
                </div>
            }
            @if (ShowSharedFilterBar && timeRangeChipOptions.length > 0) {
                <div toolbar class="ai-header-toolbar time-range-chips">
                    @for (chip of timeRangeChipOptions; track chip.value) {
                        <mj-filter-chip
                            [Label]="chip.text"
                            [Active]="CurrentTimeRange === chip.value"
                            (Clicked)="OnTimeRangeChange(chip.value)">
                        </mj-filter-chip>
                    }
                </div>
            }
        </mj-page-header>
        <mj-page-body [Padding]="false" class="analytics-shell">
            <nav class="analytics-nav">
                @for (item of NavItems; track item.Key) {
                    @if (item.Key === 'divider') {
                        <div class="nav-divider"></div>
                    } @else {
                        <button
                            class="nav-item"
                            [class.active]="ActiveSection === item.Key"
                            (click)="OnSectionChange(item.Key)">
                            <i [class]="item.Icon"></i>
                            <span>{{ item.Label }}</span>
                        </button>
                    }
                }
            </nav>

            <div class="analytics-content">
                @switch (ActiveSection) {
                    @case ('executive-summary') {
                        <app-analytics-executive-summary
                            #executiveSummary
                            [TimeRange]="CurrentTimeRange"
                            [Filters]="CurrentFilters"
                            (SectionNavigate)="OnSectionChange($event)"
                        ></app-analytics-executive-summary>
                    }
                    @case ('prompt-runs') {
                        <app-analytics-prompt-runs
                            #promptRuns
                            [TimeRange]="CurrentTimeRange"
                            [Filters]="CurrentFilters"
                        ></app-analytics-prompt-runs>
                    }
                    @case ('agent-runs') {
                        <app-analytics-agent-runs
                            [TimeRange]="CurrentTimeRange"
                            [Filters]="CurrentFilters"
                        ></app-analytics-agent-runs>
                    }
                    @case ('model-performance') {
                        <app-analytics-model-performance
                            [TimeRange]="CurrentTimeRange"
                            [SortBy]="CurrentSortBy"
                            [SelectedVendor]="CurrentVendor"
                        ></app-analytics-model-performance>
                    }
                    @case ('cost-budget') {
                        <app-analytics-cost-budget
                            [TimeRange]="CurrentTimeRange"
                            [Filters]="CurrentFilters"
                        ></app-analytics-cost-budget>
                    }
                    @case ('error-analysis') {
                        <app-analytics-error-analysis
                            [TimeRange]="CurrentTimeRange"
                            [Filters]="CurrentFilters"
                        ></app-analytics-error-analysis>
                    }
                    @case ('usage-patterns') {
                        <app-analytics-usage-patterns
                            [TimeRange]="CurrentTimeRange"
                        ></app-analytics-usage-patterns>
                    }
                }
            </div>
        </mj-page-body>
      </mj-page-layout>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
        }

        /* Slot wrappers pass through to <mj-page-header>'s flex rows so children
           inherit its gap. */
        .ai-header-actions,
        .ai-header-toolbar {
            display: contents;
        }

        .analytics-shell {
            display: flex;
            flex: 1;
            min-height: 0;
            background: var(--mj-bg-page);
        }

        /* ── Left Navigation ── */

        .analytics-nav {
            width: 220px;
            min-width: 220px;
            background: var(--mj-bg-surface);
            border-right: 1px solid var(--mj-border-default);
            display: flex;
            flex-direction: column;
            padding: 12px 0;
            overflow-y: auto;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 18px;
            border: none;
            border-left: 3px solid transparent;
            background: transparent;
            color: var(--mj-text-secondary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
            text-align: left;
            width: 100%;
        }

        .nav-item:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .nav-item.active {
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border-left-color: var(--mj-brand-primary);
            font-weight: 600;
        }

        .nav-item i {
            width: 18px;
            text-align: center;
            font-size: 14px;
        }

        .nav-divider {
            height: 1px;
            background: var(--mj-border-subtle);
            margin: 8px 18px;
        }

        /* ── Content Area ── */

        .analytics-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        /* ── Section Placeholders ── */

        .section-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 80px 24px;
            color: var(--mj-text-muted);
        }

        .placeholder-icon {
            font-size: 48px;
            margin-bottom: 20px;
            color: var(--mj-brand-primary);
            opacity: 0.4;
        }

        .section-placeholder h2 {
            font-size: 20px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin: 0 0 8px;
        }

        .section-placeholder p {
            font-size: 14px;
            color: var(--mj-text-muted);
            margin: 0;
            max-width: 420px;
        }

        /* ── Responsive: collapse nav to horizontal strip ── */

        @media (max-width: 768px) {
            .analytics-shell {
                flex-direction: column;
            }

            .analytics-nav {
                width: 100%;
                min-width: unset;
                flex-direction: row;
                overflow-x: auto;
                overflow-y: hidden;
                border-right: none;
                border-bottom: 1px solid var(--mj-border-default);
                padding: 0 8px;
                gap: 2px;
            }

            .nav-header {
                display: none;
            }

            .nav-divider {
                width: 1px;
                height: 28px;
                margin: auto 4px;
            }

            .nav-item {
                white-space: nowrap;
                border-left: none;
                border-bottom: 3px solid transparent;
                padding: 10px 14px;
            }

            .nav-item.active {
                border-left-color: transparent;
                border-bottom-color: var(--mj-brand-primary);
            }

            .analytics-content {
                padding: 16px;
            }
        }
    `]
})
export class AIAnalyticsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    private readonly USER_SETTINGS_KEY = 'AI.Analytics.UserPreferences';
    private settingsPersistSubject = new Subject<void>();
    protected override destroy$ = new Subject<void>();
    private settingsLoaded = false;
    private cdr = inject(ChangeDetectorRef);

    @ViewChild('executiveSummary') private executiveSummary?: AnalyticsExecutiveSummaryComponent;
    @ViewChild('promptRuns') private promptRuns?: AnalyticsPromptRunsComponent;

    public ActiveSection = 'executive-summary';
    public CurrentTimeRange = '24h';
    public CurrentFilters: GlobalFilterState = {
        Models: [],
        Agents: [],
        Prompts: [],
        Statuses: []
    };
    /** Single-value SortBy used by Model Performance (lives on the shared chrome). */
    public CurrentSortBy: string = 'cost-efficiency';
    /** Single-value Vendor filter used by Model Performance (lives on the shared chrome). */
    public CurrentVendor: string = '';

    /** SortBy options for Model Performance leaderboard. */
    public readonly sortByOptions = [
        { text: 'By Performance', value: 'cost-efficiency' },
        { text: 'By Cost',        value: 'cost' },
        { text: 'By Speed',       value: 'speed' },
        { text: 'By Reliability', value: 'reliability' },
        { text: 'By Usage',       value: 'usage-volume' }
    ];

    /** Vendor options, lazily built from AIEngineBase for Model Performance leaderboard. */
    public get vendorOptions(): { text: string; value: string }[] {
        return AIEngineBase.Instance?.Vendors?.map(v => ({ text: v.Name ?? '', value: v.ID ?? '' }))
            ?.sort((a, b) => a.text.localeCompare(b.text)) ?? [];
    }

    /** Per-section filter-bar config — switched on ActiveSection. */
    public get FilterBarConfig() {
        switch (this.ActiveSection) {
            case 'executive-summary':
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowSortBy: false, ShowVendor: false, ShowCompareToggle: true,  ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'prompt-runs':
                return { ShowModelFilter: true,  ShowAgentFilter: true,  ShowPromptFilter: true,  ShowStatusFilter: true,  ShowSortBy: false, ShowVendor: false, ShowCompareToggle: false, ShowExportButton: true,  TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'agent-runs':
                return { ShowModelFilter: false, ShowAgentFilter: true,  ShowPromptFilter: false, ShowStatusFilter: true,  ShowSortBy: false, ShowVendor: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'model-performance':
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowSortBy: true,  ShowVendor: true,  ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['24h', '7d', '30d'] };
            case 'cost-budget':
                return { ShowModelFilter: true,  ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowSortBy: false, ShowVendor: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['7d', '30d', '90d', 'MTD', 'YTD'] };
            case 'error-analysis':
                return { ShowModelFilter: true,  ShowAgentFilter: false, ShowPromptFilter: true,  ShowStatusFilter: false, ShowSortBy: false, ShowVendor: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'usage-patterns':
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowSortBy: false, ShowVendor: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            default:
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowSortBy: false, ShowVendor: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
        }
    }

    /**
     * Always true now — every section uses the shared chrome filter bar.
     * Kept as a getter for future per-section carve-outs.
     */
    public get ShowSharedFilterBar(): boolean {
        return true;
    }

    /** Status options used by the popover dropdown when the section has ShowStatusFilter. */
    public readonly statusOptions = [
        { text: 'Success',  value: 'Success' },
        { text: 'Error',    value: 'Error' },
        { text: 'Running',  value: 'Running' },
        { text: 'Pending',  value: 'Pending' },
        { text: 'Canceled', value: 'Canceled' },
    ];

    /** Built lazily from AIEngineBase. */
    public get modelOptions(): { text: string; value: string }[] {
        return AIEngineBase.Instance?.Models?.map(m => ({ text: m.Name ?? '', value: m.ID }))
            ?.sort((a, b) => a.text.localeCompare(b.text)) ?? [];
    }

    public get agentOptions(): { text: string; value: string }[] {
        return AIEngineBase.Instance?.Agents
            ?.filter(a => a.Status === 'Active')
            ?.map(a => ({ text: a.Name ?? '', value: a.ID }))
            ?.sort((a, b) => a.text.localeCompare(b.text)) ?? [];
    }

    public get promptOptions(): { text: string; value: string }[] {
        return AIEngineBase.Instance?.Prompts?.map(p => ({ text: p.Name ?? '', value: p.ID }))
            ?.sort((a, b) => a.text.localeCompare(b.text)) ?? [];
    }

    /** Time-range chip options for the toolbar slot. */
    public get timeRangeChipOptions(): { text: string; value: string }[] {
        return this.FilterBarConfig.TimeRangeOptions.map(t => ({ text: t, value: t }));
    }

    /** Compare-mode visual state (kept on the shell now that analytics-filter-bar is gone). */
    public compareActive = false;

    /** Build the FilterFieldConfig[] for the popover based on the active section. */
    public get analyticsFilterFields(): FilterFieldConfig[] {
        const cfg = this.FilterBarConfig;
        const fields: FilterFieldConfig[] = [];
        if (cfg.ShowModelFilter) {
            fields.push({
                key: 'Models',
                type: 'dropdown',
                label: 'Model',
                icon: 'fa-solid fa-microchip',
                filterable: this.modelOptions.length > 10,
                options: [{ text: 'All Models', value: '' }, ...this.modelOptions],
            });
        }
        if (cfg.ShowAgentFilter) {
            fields.push({
                key: 'Agents',
                type: 'dropdown',
                label: 'Agent',
                icon: 'fa-solid fa-robot',
                filterable: this.agentOptions.length > 10,
                options: [{ text: 'All Agents', value: '' }, ...this.agentOptions],
            });
        }
        if (cfg.ShowPromptFilter) {
            fields.push({
                key: 'Prompts',
                type: 'dropdown',
                label: 'Prompt',
                icon: 'fa-solid fa-comment-dots',
                filterable: this.promptOptions.length > 10,
                options: [{ text: 'All Prompts', value: '' }, ...this.promptOptions],
            });
        }
        if (cfg.ShowStatusFilter) {
            fields.push({
                key: 'Statuses',
                type: 'dropdown',
                label: 'Status',
                icon: 'fa-solid fa-toggle-on',
                options: [{ text: 'All Statuses', value: '' }, ...this.statusOptions],
            });
        }
        if (cfg.ShowSortBy) {
            fields.push({
                key: 'SortBy',
                type: 'dropdown',
                label: 'Sort By',
                icon: 'fa-solid fa-arrow-down-wide-short',
                options: this.sortByOptions,
            });
        }
        if (cfg.ShowVendor) {
            fields.push({
                key: 'Vendor',
                type: 'dropdown',
                label: 'Vendor',
                icon: 'fa-solid fa-building',
                filterable: this.vendorOptions.length > 10,
                options: [{ text: 'All Vendors', value: '' }, ...this.vendorOptions],
            });
        }
        return fields;
    }

    /** Single-value flattened state for the centralized panel (the panel takes scalar values; we hold arrays in CurrentFilters). */
    public get analyticsFilterValues(): Record<string, unknown> {
        return {
            Models:   this.CurrentFilters.Models?.[0]   ?? '',
            Agents:   this.CurrentFilters.Agents?.[0]   ?? '',
            Prompts:  this.CurrentFilters.Prompts?.[0]  ?? '',
            Statuses: this.CurrentFilters.Statuses?.[0] ?? '',
            SortBy:   this.CurrentSortBy,
            Vendor:   this.CurrentVendor,
        };
    }

    /** Receive popover updates and translate scalar → array shape used by GlobalFilterState. */
    public onAnalyticsFilterValuesChange(values: Record<string, unknown>): void {
        const next: GlobalFilterState = {
            Models:   values['Models']   ? [values['Models']   as string] : [],
            Agents:   values['Agents']   ? [values['Agents']   as string] : [],
            Prompts:  values['Prompts']  ? [values['Prompts']  as string] : [],
            Statuses: values['Statuses'] ? [values['Statuses'] as string] : [],
        };
        this.OnFiltersChange(next);
        if ('SortBy' in values) {
            this.CurrentSortBy = (values['SortBy'] as string) || 'cost-efficiency';
        }
        if ('Vendor' in values) {
            this.CurrentVendor = (values['Vendor'] as string) || '';
        }
    }

    /** Reset only the popover filters — leaves TimeRange and CompareActive alone. */
    public resetPopoverFilters(): void {
        this.OnFiltersChange({ Models: [], Agents: [], Prompts: [], Statuses: [] });
        // SortBy + Vendor reset only when Model Performance is the active section.
        if (this.ActiveSection === 'model-performance') {
            this.CurrentSortBy = 'cost-efficiency';
            this.CurrentVendor = '';
        }
    }

    /** Active filter count for the popover badge. */
    public get ActiveFilterCount(): number {
        const f = this.CurrentFilters;
        let count = (f.Models?.length ?? 0) + (f.Agents?.length ?? 0) + (f.Prompts?.length ?? 0) + (f.Statuses?.length ?? 0);
        // SortBy counts as "active" when it differs from the default.
        if (this.FilterBarConfig.ShowSortBy && this.CurrentSortBy && this.CurrentSortBy !== 'cost-efficiency') count++;
        if (this.FilterBarConfig.ShowVendor && this.CurrentVendor) count++;
        return count;
    }

    /** Toggle Compare mode — the mjButton directive owns the [(selected)] flip, so this handler only forwards the new value. */
    public toggleCompare(): void {
        this.OnCompareToggled(this.compareActive);
    }

    readonly NavItems: NavItem[] = [
        { Label: 'Executive Summary', Icon: 'fa-solid fa-gauge-high', Key: 'executive-summary' },
        { Label: 'Prompt Runs', Icon: 'fa-solid fa-comment-dots', Key: 'prompt-runs' },
        { Label: 'Agent Runs', Icon: 'fa-solid fa-robot', Key: 'agent-runs' },
        { Label: 'Model Performance', Icon: 'fa-solid fa-microchip', Key: 'model-performance' },
        { Key: 'divider' },
        { Label: 'Cost & Budget', Icon: 'fa-solid fa-coins', Key: 'cost-budget' },
        { Label: 'Error Analysis', Icon: 'fa-solid fa-triangle-exclamation', Key: 'error-analysis' },
        { Label: 'Usage Patterns', Icon: 'fa-solid fa-clock', Key: 'usage-patterns' },
    ];

    async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.setupSettingsDebounce();
        await this.loadUserSettings();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'AI Analytics';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-line';
    }

    /** Navigate to a different analytics section */
    public OnSectionChange(key: string): void {
        if (key === 'divider' || key === this.ActiveSection) {
            return;
        }
        this.ActiveSection = key;
        this.saveUserSettings();
        this.cdr.detectChanges();
    }

    /** Handle time range changes from the filter bar */
    public OnTimeRangeChange(range: string): void {
        this.CurrentTimeRange = range;
        this.saveUserSettings();
    }

    /** Handle filter changes from the filter bar */
    public OnFiltersChange(filters: GlobalFilterState): void {
        this.CurrentFilters = filters;
        this.saveUserSettings();
    }

    /** Compare-toggle button — only visible on Executive Summary; forwards to that section. */
    public OnCompareToggled(value: boolean): void {
        this.executiveSummary?.OnCompareToggled?.(value);
    }

    /** Export button — only visible on Prompt Runs; forwards to that section. */
    public OnExportClicked(): void {
        this.promptRuns?.ExportCSV?.();
    }

    // ── Private Helpers ──

    private setupSettingsDebounce(): void {
        this.settingsPersistSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(() => this.persistUserSettings());
    }

    private async loadUserSettings(): Promise<void> {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(this.USER_SETTINGS_KEY);
            if (raw) {
                const prefs: AIAnalyticsPreferences = JSON.parse(raw);
                if (prefs.ActiveSection) {
                    this.ActiveSection = prefs.ActiveSection;
                }
                if (prefs.ExecutiveSummary?.Filters) {
                    this.CurrentFilters = { ...this.CurrentFilters, ...prefs.ExecutiveSummary.Filters };
                }
                if (prefs.ExecutiveSummary?.TimeRange) {
                    this.CurrentTimeRange = prefs.ExecutiveSummary.TimeRange;
                }
            }
        } catch {
            // Use defaults on parse failure
        }
        this.settingsLoaded = true;
    }

    private saveUserSettings(): void {
        if (this.settingsLoaded) {
            this.settingsPersistSubject.next();
        }
    }

    private async persistUserSettings(): Promise<void> {
        try {
            const prefs: AIAnalyticsPreferences = {
                ActiveSection: this.ActiveSection,
                ExecutiveSummary: {
                    TimeRange: this.CurrentTimeRange,
                    ComparisonEnabled: false,
                    Filters: this.CurrentFilters
                },
                PromptRuns: {
                    TimeRange: this.CurrentTimeRange,
                    Filters: this.CurrentFilters,
                    ChartMetric: 'count',
                    SortField: 'StartedAt',
                    SortDirection: 'desc'
                },
                AgentRuns: {
                    TimeRange: this.CurrentTimeRange,
                    Filters: {
                        Agents: this.CurrentFilters.Agents,
                        Statuses: this.CurrentFilters.Statuses
                    }
                },
                ModelPerformance: {
                    TimeRange: this.CurrentTimeRange,
                    SortBy: 'latency',
                    VendorFilter: []
                },
                CostBudget: {
                    TimeRange: this.CurrentTimeRange,
                    Filters: this.CurrentFilters
                }
            };
            await UserInfoEngine.Instance.SetSetting(
                this.USER_SETTINGS_KEY,
                JSON.stringify(prefs)
            );
        } catch {
            // Silent failure for settings persistence
        }
    }
}

export function LoadAIAnalyticsResource(): void {
    // Prevents tree-shaking of the @RegisterClass decorator
}
