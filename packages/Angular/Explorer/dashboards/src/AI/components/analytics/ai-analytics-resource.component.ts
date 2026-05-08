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
                <app-analytics-filter-bar
                    actions
                    [TimeRange]="CurrentTimeRange"
                    [Filters]="CurrentFilters"
                    [TimeRangeOptions]="FilterBarConfig.TimeRangeOptions"
                    [ShowModelFilter]="FilterBarConfig.ShowModelFilter"
                    [ShowAgentFilter]="FilterBarConfig.ShowAgentFilter"
                    [ShowPromptFilter]="FilterBarConfig.ShowPromptFilter"
                    [ShowStatusFilter]="FilterBarConfig.ShowStatusFilter"
                    [ShowCompareToggle]="FilterBarConfig.ShowCompareToggle"
                    [ShowExportButton]="FilterBarConfig.ShowExportButton"
                    (TimeRangeChange)="OnTimeRangeChange($event)"
                    (FiltersChange)="OnFiltersChange($event)"
                    (CompareToggled)="OnCompareToggled($event)"
                    (ExportClicked)="OnExportClicked()"
                ></app-analytics-filter-bar>
            }
        </mj-page-header>
        <div class="analytics-shell">
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
        </div>
      </mj-page-layout>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
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

    /** Per-section filter-bar config — switched on ActiveSection. */
    public get FilterBarConfig() {
        switch (this.ActiveSection) {
            case 'executive-summary':
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowCompareToggle: true,  ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'prompt-runs':
                return { ShowModelFilter: true,  ShowAgentFilter: true,  ShowPromptFilter: true,  ShowStatusFilter: true,  ShowCompareToggle: false, ShowExportButton: true,  TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'agent-runs':
                return { ShowModelFilter: false, ShowAgentFilter: true,  ShowPromptFilter: false, ShowStatusFilter: true,  ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'cost-budget':
                return { ShowModelFilter: true,  ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['7d', '30d', '90d', 'MTD', 'YTD'] };
            case 'error-analysis':
                return { ShowModelFilter: true,  ShowAgentFilter: false, ShowPromptFilter: true,  ShowStatusFilter: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            case 'usage-patterns':
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
            default:
                return { ShowModelFilter: false, ShowAgentFilter: false, ShowPromptFilter: false, ShowStatusFilter: false, ShowCompareToggle: false, ShowExportButton: false, TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'] };
        }
    }

    /** Model Performance has its own custom filter UI inside the section, so the shared filter-bar is hidden there. */
    public get ShowSharedFilterBar(): boolean {
        return this.ActiveSection !== 'model-performance';
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
