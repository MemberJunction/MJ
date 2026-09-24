/**
 * @fileoverview Agent Run Analysis -- Cost Attribution Focus.
 *
 * Displays agent run stats, cost attribution horizontal stacked bars per agent,
 * and a sortable recent agent runs table. Agent runs are read via RunView from
 * "MJ: AI Agent Runs"; per-agent prompt volume and cost attribution come from the
 * AI usage aggregates (AIUsageHourly / AIUsageDaily), which already resolve each
 * prompt run to its agent and exclude parallel parents — no raw prompt-run pull.
 */

import {
    Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { ComputeTotalCost, ComputeCoveragePercent, ResolveCostCurrency } from '../../../services/ai-usage-analytics.compute';
import { AIUsageDailyRow, AIUsageHourlyRow } from '../../../services/ai-usage-analytics.types';

// ── Interfaces ──

interface AgentRunFilters {
    Agents: string[];
    Statuses: string[];
}

interface AgentRunRecord {
    ID: string;
    StartedAt: string;
    CompletedAt: string | null;
    Status: string;
    Success: boolean | null;
    TotalCost: number | null;
    TotalTokensUsed: number | null;
    AgentID: string;
    Agent: string | null;
    ErrorMessage: string | null;
    TotalPromptIterations: number | null;
}

/** An hourly or daily usage aggregate row — the fields this view reads are common to both. */
type UsageRow = AIUsageHourlyRow | AIUsageDailyRow;

interface AgentRunStats {
    TotalRuns: number;
    TotalCost: number | null;
    CoverageSubtitle?: string;
    PromptRuns: number;
    AvgCostPerRun: number | null;
    SuccessRate: number;
    AvgDurationSeconds: number;
}

interface CostAttributionRow {
    AgentName: string;
    AgentID: string;
    TotalCost: number | null;
    Segments: CostSegment[];
}

interface CostSegment {
    Label: string;
    Value: number;
    Percent: number;
    Color: string;
}

interface RecentRunRow {
    ID: string;
    Agent: string;
    Status: string;
    StatusClass: string;
    StepCount: number;
    Duration: string;
    Cost: string;
    Time: string;
}

type SortField = 'Agent' | 'Status' | 'StepCount' | 'Duration' | 'Cost' | 'Time';
type SortDirection = 'asc' | 'desc';

const AGENT_RUN_FIELDS = [
    'ID', 'StartedAt', 'CompletedAt', 'Status', 'Success',
    'TotalCost', 'TotalTokensUsed', 'AgentID', 'Agent', 'ErrorMessage', 'TotalPromptIterations'
];

const COST_COLORS = [
    'var(--mj-brand-primary)',
    'var(--mj-brand-accent, var(--mj-brand-primary-hover))',
    'var(--mj-status-info)',
    'var(--mj-text-disabled)'
];

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-analytics-agent-runs',
    template: `

        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading agent runs..."></mj-loading>
            </div>
        } @else {
            <!-- Stats Bar -->
            <div class="stats-grid">
                <div class="stat-card accent-brand">
                    <div class="stat-label">Total Runs</div>
                    <div class="stat-value">{{ Stats.TotalRuns | number }}</div>
                </div>
                <div class="stat-card accent-brand">
                    <div class="stat-label">Total Cost</div>
                    <div class="stat-value">{{ FormatCurrency(Stats.TotalCost) }}</div>
                    @if (Stats.CoverageSubtitle) {
                        <div class="stat-subtitle">{{ Stats.CoverageSubtitle }}</div>
                    }
                </div>
                <div class="stat-card">
                    <div class="stat-label">Prompt Runs</div>
                    <div class="stat-value">{{ Stats.PromptRuns | number }}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Avg Cost/Run</div>
                    <div class="stat-value">{{ FormatCurrency(Stats.AvgCostPerRun, 4) }}</div>
                </div>
                <div class="stat-card accent-success">
                    <div class="stat-label">Success Rate</div>
                    <div class="stat-value">{{ Stats.SuccessRate | number:'1.1-1' }}%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Avg Duration</div>
                    <div class="stat-value">{{ Stats.AvgDurationSeconds | number:'1.1-1' }}s</div>
                </div>
            </div>

            <!-- Cost Attribution Panel -->
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-header__title">
                        <i class="fa-solid fa-chart-bar panel-header__icon"></i>
                        Cost Attribution by Agent
                    </div>
                </div>
                <div class="panel-body">
                    @if (CostAttributionRows.length === 0) {
                        <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-chart-bar"
                            Title="No agent cost data for selected period" />
                    }
                    @for (row of CostAttributionRows; track row.AgentID) {
                        <div class="attribution-row">
                            <div class="attribution-name" [title]="row.AgentName">{{ row.AgentName }}</div>
                            <div class="attribution-bar-container">
                                @for (seg of row.Segments; track seg.Label) {
                                    <div
                                        class="attribution-segment"
                                        [style.width.%]="seg.Percent"
                                        [style.background]="seg.Color"
                                        [title]="seg.Label + ': ' + FormatCurrency(seg.Value, 4)"
                                    ></div>
                                }
                            </div>
                            <div class="attribution-total">{{ FormatCurrency(row.TotalCost) }}</div>
                        </div>
                    }
                    @if (CostAttributionRows.length > 0) {
                        <div class="legend-row">
                            @for (item of LegendItems; track item.Label) {
                                <div class="legend-item">
                                    <span class="legend-swatch" [style.background]="item.Color"></span>
                                    {{ item.Label }}
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>

            <!-- Recent Agent Runs Table -->
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-header__title">
                        <i class="fa-solid fa-list panel-header__icon"></i>
                        Recent Agent Runs
                    </div>
                    <span class="panel-header__subtitle">showing latest 100</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                @for (col of TableColumns; track col.field) {
                                    <th
                                        class="sortable-header"
                                        [class.sorted]="SortField === col.field"
                                        (click)="OnSort(col.field)">
                                        {{ col.label }}
                                        @if (SortField === col.field) {
                                            <i [class]="SortDir === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                                        }
                                    </th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @if (RecentRuns.length === 0) {
                                <tr><td [attr.colspan]="TableColumns.length" class="empty-row"><mj-empty-state Variant="no-results" Size="compact" Title="No runs found" Message="No agent runs match this period and these filters."></mj-empty-state></td></tr>
                            }
                            @for (run of RecentRuns; track run.ID) {
                                <tr>
                                    <td class="cell-agent">{{ run.Agent }}</td>
                                    <td><span class="status-pill" [class]="run.StatusClass">{{ run.Status }}</span></td>
                                    <td class="cell-numeric">{{ run.StepCount }}</td>
                                    <td class="cell-numeric">{{ run.Duration }}</td>
                                    <td class="cell-numeric">{{ run.Cost }}</td>
                                    <td class="cell-time">{{ run.Time }}</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }
    `,
    styles: [`
        :host { display: block; }

        .loading-container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 300px;
        }

        /* ── Stats Grid ── */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin: 16px 0;
        }

        .stat-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 14px 16px;
            text-align: center;
            border-top: 3px solid var(--mj-border-subtle);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
        }

        .stat-card.accent-brand { border-top-color: var(--mj-brand-primary); }
        .stat-card.accent-success { border-top-color: var(--mj-status-success); }
        .stat-card.accent-warning { border-top-color: var(--mj-status-warning); }

        .stat-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }

        .stat-value {
            font-size: 22px;
            font-weight: 700;
            color: var(--mj-text-primary);
            letter-spacing: -0.02em;
        }

        .stat-subtitle {
            font-size: 11px;
            color: var(--mj-text-muted);
            margin-top: 2px;
        }

        /* ── Panel ── */
        .panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            margin-bottom: 16px;
            overflow: hidden;
        }

        .panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .panel-header__title {
            font-size: 14px;
            font-weight: 600;
            color: var(--mj-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .panel-header__icon {
            font-size: 13px;
            color: var(--mj-brand-primary);
        }

        .panel-header__subtitle {
            font-size: 12px;
            color: var(--mj-text-muted);
        }

        .panel-body {
            padding: 16px 18px;
        }

        /* ── Cost Attribution ── */
        .attribution-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .attribution-row:last-of-type {
            border-bottom: none;
        }

        .attribution-name {
            width: 140px;
            min-width: 140px;
            font-size: 13px;
            font-weight: 500;
            color: var(--mj-text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .attribution-bar-container {
            flex: 1;
            display: flex;
            height: 24px;
            border-radius: 6px;
            overflow: hidden;
            background: var(--mj-bg-surface-sunken);
        }

        .attribution-segment {
            height: 100%;
            min-width: 2px;
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .attribution-total {
            width: 80px;
            min-width: 80px;
            text-align: right;
            font-size: 13px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            font-variant-numeric: tabular-nums;
        }

        .legend-row {
            display: flex;
            gap: 16px;
            padding: 12px 0 4px;
            flex-wrap: wrap;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--mj-text-muted);
        }

        .legend-swatch {
            width: 12px;
            height: 12px;
            border-radius: 3px;
            flex-shrink: 0;
        }

        /* ── Table ── */
        .table-wrapper {
            overflow-x: auto;
        }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .data-table th,
        .data-table td {
            padding: 10px 14px;
            text-align: left;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .data-table th {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            background: var(--mj-bg-surface-card);
            position: sticky;
            top: 0;
        }

        .sortable-header {
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
            transition: color 0.15s;
        }

        .sortable-header:hover {
            color: var(--mj-brand-primary);
        }

        .sortable-header.sorted {
            color: var(--mj-brand-primary);
        }

        .sortable-header i {
            margin-left: 4px;
            font-size: 10px;
        }

        .data-table tbody tr {
            transition: background 0.15s;
        }

        .data-table tbody tr:hover {
            background: var(--mj-bg-surface-hover);
        }

        .cell-agent {
            font-weight: 500;
            color: var(--mj-text-primary);
            max-width: 200px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cell-numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
            color: var(--mj-text-secondary);
        }

        .cell-time {
            white-space: nowrap;
            color: var(--mj-text-muted);
            font-size: 12px;
        }

        .empty-row {
            text-align: center;
            color: var(--mj-text-disabled);
            padding: 24px;
        }

        /* ── Status Pills ── */
        .status-pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.3px;
        }

        .status-completed {
            background: color-mix(in srgb, var(--mj-status-success) 12%, var(--mj-bg-surface));
            color: var(--mj-status-success);
        }

        .status-running {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
        }

        .status-failed {
            background: color-mix(in srgb, var(--mj-status-error) 12%, var(--mj-bg-surface));
            color: var(--mj-status-error);
        }

        .status-cancelled {
            background: color-mix(in srgb, var(--mj-status-warning) 12%, var(--mj-bg-surface));
            color: var(--mj-status-warning);
        }

        .status-paused, .status-awaitingfeedback {
            background: color-mix(in srgb, var(--mj-text-disabled) 12%, var(--mj-bg-surface));
            color: var(--mj-text-muted);
        }

        /* ── Responsive ── */
        @media (max-width: 1200px) {
            .stats-grid {
                grid-template-columns: repeat(3, 1fr);
            }
        }

        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .attribution-name {
                width: 100px;
                min-width: 100px;
            }

            .attribution-total {
                width: 60px;
                min-width: 60px;
            }

            .stat-value {
                font-size: 18px;
            }
        }
    `]
})
export class AnalyticsAgentRunsComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.loadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private _filters: AgentRunFilters = { Agents: [], Statuses: [] };
    @Input()
    set Filters(value: AgentRunFilters) {
        const next = value ?? { Agents: [], Statuses: [] };
        const changed = !this.shallowFiltersEqual(this._filters, next);
        this._filters = next;
        if (changed && this.initialized) this.loadData();
    }
    get Filters(): AgentRunFilters { return this._filters; }

    private shallowFiltersEqual(a: AgentRunFilters, b: AgentRunFilters): boolean {
        const sameArr = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
        return sameArr(a.Agents, b.Agents) && sameArr(a.Statuses, b.Statuses);
    }

    @Output() TimeRangeChange = new EventEmitter<string>();
    @Output() FiltersChange = new EventEmitter<AgentRunFilters>();

    private initialized = false;

    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    public IsLoading = false;

    public Stats: AgentRunStats = {
        TotalRuns: 0,
        TotalCost: 0,
        PromptRuns: 0,
        AvgCostPerRun: 0,
        SuccessRate: 0,
        AvgDurationSeconds: 0
    };

    public CostAttributionRows: CostAttributionRow[] = [];
    public LegendItems: { Label: string; Color: string }[] = [];
    public RecentRuns: RecentRunRow[] = [];
    public SortField: SortField = 'Time';
    public SortDir: SortDirection = 'desc';

    public TableColumns: { field: SortField; label: string }[] = [
        { field: 'Agent', label: 'Agent' },
        { field: 'Status', label: 'Status' },
        { field: 'StepCount', label: 'Prompts' },
        { field: 'Duration', label: 'Duration' },
        { field: 'Cost', label: 'Cost' },
        { field: 'Time', label: 'Time' }
    ];

    /** Bridge the local filter shape to the global shape the filter bar expects */
    public get GlobalFilters(): GlobalFilterState {
        return {
            Models: [],
            Agents: this.Filters.Agents,
            Prompts: [],
            Statuses: this.Filters.Statuses
        };
    }

    /** @deprecated Use {@link GlobalFilters}. */
    public get globalFilters(): GlobalFilterState {
        return this.GlobalFilters;
    }

    private instrumentation = inject(AIInstrumentationService);

    private agentRuns: AgentRunRecord[] = [];
    /** Usage aggregate rows for agent-driven prompt runs in the period (AgentID set, agent filter applied). */
    private agentUsageRows: UsageRow[] = [];
    private vendorNames = new Map<string, string>();
    private agentNames = new Map<string, string>();

    ngOnInit(): void {
        this.initialized = true;
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Public Event Handlers ──

    public OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
        this.loadData();
    }

    public OnFiltersChange(filters: GlobalFilterState): void {
        this.Filters = { Agents: filters.Agents, Statuses: filters.Statuses };
        this.FiltersChange.emit(this.Filters);
        this.loadData();
    }

    public OnSort(field: SortField): void {
        if (this.SortField === field) {
            this.SortDir = this.SortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.SortField = field;
            this.SortDir = field === 'Time' ? 'desc' : 'asc';
        }
        this.sortRecentRuns();
        this.cdr.detectChanges();
    }

    public FormatCurrency(value: number | null | undefined, decimals = 2): string {
        if (value === null || value === undefined) return '—';
        if (value === 0) return '$0.00';
        if (value < 0.01 && decimals < 4) decimals = 4;
        return '$' + value.toFixed(decimals);
    }

    // ── Data Loading ──

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const dateFilter = this.buildDateFilter('StartedAt');
            const agentFilter = this.buildAgentFilter();
            const statusFilter = this.buildStatusFilter();
            const extraFilter = [dateFilter, agentFilter, statusFilter, 'ParentRunID IS NULL'].filter(Boolean).join(' AND ');

            this.instrumentation.Provider = this.ProviderToUse;
            const rangeMs = this.timeRangeToMs(this.TimeRange);
            const now = new Date();
            const start = new Date(now.getTime() - rangeMs);

            const [agentResult, usageRows, lookups] = await Promise.all([
                rv.RunView<AgentRunRecord>({
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: extraFilter,
                    Fields: AGENT_RUN_FIELDS,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 100,
                    ResultType: 'simple'
                }),
                // Hourly buckets for sub-day ranges so "last hour" is not a whole day's usage.
                rangeMs <= 86400000
                    ? this.instrumentation.GetUsageHourly(start, now)
                    : this.instrumentation.GetUsageDaily(start, now),
                this.instrumentation.GetModelAndVendorLookups()
            ]);

            if (!agentResult.Success) {
                console.error(`Agent Run Analysis: agent runs failed to load. ${agentResult.ErrorMessage}`);
            }
            this.agentRuns = agentResult.Success ? agentResult.Results ?? [] : [];
            const agentIds = new Set(this.Filters.Agents.map(a => a.toLowerCase()));
            const usage: UsageRow[] = usageRows;
            this.agentUsageRows = usage.filter(r =>
                r.AgentID !== null && (agentIds.size === 0 || agentIds.has(r.AgentID.toLowerCase())));
            this.vendorNames = lookups.vendors;
            this.agentNames = lookups.agents;

            this.computeStats();
            this.computeCostAttribution();
            this.buildRecentRuns();
            this.sortRecentRuns();
        } catch (e) {
            console.error('Agent Run Analysis load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ── Computations ──

    private computeStats(): void {
        const runs = this.agentRuns;
        const total = runs.length;
        const totalCost = ComputeTotalCost(runs);
        const completed = runs.filter(r => r.Status === 'Completed');
        const successCount = runs.filter(r => r.Success === true).length;

        const durations = completed
            .filter(r => r.CompletedAt)
            .map(r => {
                const start = new Date(r.StartedAt).getTime();
                const end = new Date(r.CompletedAt!).getTime();
                return (end - start) / 1000;
            })
            .filter(d => d > 0);

        const avgDuration = durations.length > 0
            ? durations.reduce((s, d) => s + d, 0) / durations.length
            : 0;

        const agentPromptRuns = this.agentUsageRows.reduce((sum, r) => sum + (r.Runs ?? 0), 0);

        let covPriced = 0;
        let covUnpriced = 0;
        for (const r of runs) {
            if (r.TotalCost !== null && r.TotalCost !== undefined) {
                covPriced++;
            } else {
                covUnpriced++;
            }
        }
        const covPct = ComputeCoveragePercent({ PricedRuns: covPriced, UnpricedRuns: covUnpriced });
        const covSubtitle = total > 0 ? `covers ${Math.round(covPct)}% of runs` : undefined;

        this.Stats = {
            TotalRuns: total,
            TotalCost: totalCost,
            CoverageSubtitle: covSubtitle,
            PromptRuns: agentPromptRuns,
            AvgCostPerRun: total > 0 && totalCost !== null ? totalCost / total : null,
            SuccessRate: total > 0 ? (successCount / total) * 100 : 0,
            AvgDurationSeconds: avgDuration
        };
    }

    /**
     * Cost per agent, split by vendor, from the usage aggregates. Each (agent, vendor) figure is a
     * ComputeTotalCost over its rows in the period's primary currency, so an unpriced slice stays
     * unpriced instead of reading as a zero-width free segment, and currencies are never summed.
     */
    private computeCostAttribution(): void {
        const currency = ResolveCostCurrency(this.agentUsageRows).Currency;
        const byAgent = new Map<string, Map<string, UsageRow[]>>();
        for (const r of this.agentUsageRows) {
            const agentKey = r.AgentID!.toLowerCase();
            const vendorName = (r.VendorID ? this.vendorNames.get(r.VendorID.toLowerCase()) : undefined) ?? 'Other';
            let vendors = byAgent.get(agentKey);
            if (!vendors) {
                vendors = new Map<string, UsageRow[]>();
                byAgent.set(agentKey, vendors);
            }
            const list = vendors.get(vendorName);
            if (list) {
                list.push(r);
            } else {
                vendors.set(vendorName, [r]);
            }
        }

        const agentCosts: Array<{ agentId: string; name: string; vendorCosts: Map<string, number>; totalCost: number | null }> = [];
        const allVendors = new Set<string>();
        for (const [agentId, vendors] of byAgent) {
            const vendorCosts = new Map<string, number>();
            for (const [vendor, rows] of vendors) {
                const cost = ComputeTotalCost(rows, currency);
                if (cost !== null && cost > 0) {
                    vendorCosts.set(vendor, cost);
                    allVendors.add(vendor);
                }
            }
            const allRows = Array.from(vendors.values()).flat();
            agentCosts.push({
                agentId,
                name: this.agentNames.get(agentId) ?? 'Unknown',
                vendorCosts,
                totalCost: ComputeTotalCost(allRows, currency)
            });
        }

        const vendorList = Array.from(allVendors);
        this.LegendItems = vendorList.map((v, i) => ({
            Label: v,
            Color: COST_COLORS[i % COST_COLORS.length]
        }));

        // Sort by total cost descending; fully unpriced agents last.
        agentCosts.sort((a, b) => (b.totalCost ?? -1) - (a.totalCost ?? -1));

        this.CostAttributionRows = agentCosts.map(entry => ({
            AgentName: entry.name,
            AgentID: entry.agentId,
            TotalCost: entry.totalCost,
            Segments: vendorList.map((vendor, i) => {
                const val = entry.vendorCosts.get(vendor) ?? 0;
                return {
                    Label: vendor,
                    Value: val,
                    Percent: entry.totalCost !== null && entry.totalCost > 0 ? (val / entry.totalCost) * 100 : 0,
                    Color: COST_COLORS[i % COST_COLORS.length]
                };
            }).filter(seg => seg.Value > 0)
        }));
    }

    private buildRecentRuns(): void {
        this.RecentRuns = this.agentRuns.slice(0, 100).map(r => ({
            ID: r.ID,
            Agent: r.Agent ?? 'Unknown',
            Status: r.Status,
            StatusClass: this.getStatusClass(r.Status),
            // The run's own prompt-iteration count, recorded by the agent framework.
            StepCount: r.TotalPromptIterations ?? 0,
            Duration: this.formatDuration(r.StartedAt, r.CompletedAt),
            Cost: this.FormatCurrency(r.TotalCost),
            Time: this.formatRelativeTime(r.StartedAt)
        }));
    }

    private sortRecentRuns(): void {
        const dir = this.SortDir === 'asc' ? 1 : -1;
        this.RecentRuns.sort((a, b) => {
            switch (this.SortField) {
                case 'Agent': return dir * a.Agent.localeCompare(b.Agent);
                case 'Status': return dir * a.Status.localeCompare(b.Status);
                case 'StepCount': return dir * (a.StepCount - b.StepCount);
                case 'Duration': return dir * a.Duration.localeCompare(b.Duration);
                case 'Cost': return dir * a.Cost.localeCompare(b.Cost);
                case 'Time': return dir * a.Time.localeCompare(b.Time);
                default: return 0;
            }
        });
    }

    // ── Helpers ──

    private buildDateFilter(field: string): string {
        const now = new Date();
        const ms = this.timeRangeToMs(this.TimeRange);
        const start = new Date(now.getTime() - ms);
        return `${field} >= '${start.toISOString()}'`;
    }

    private buildAgentFilter(): string {
        if (this.Filters.Agents.length === 0) return '';
        const ids = this.Filters.Agents.map(id => `'${id}'`).join(',');
        return `AgentID IN (${ids})`;
    }

    private buildStatusFilter(): string {
        if (this.Filters.Statuses.length === 0) return '';
        const values = this.Filters.Statuses.map(s => `'${s}'`).join(',');
        return `Status IN (${values})`;
    }

    private timeRangeToMs(range: string): number {
        const map: Record<string, number> = {
            '1h': 3600000,
            '6h': 21600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };
        return map[range] ?? 604800000;
    }

    private getStatusClass(status: string): string {
        return 'status-pill status-' + status.toLowerCase().replace(/\s+/g, '');
    }

    private formatDuration(startStr: string, endStr: string | null): string {
        if (!endStr) return '--';
        const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
        if (ms < 1000) return ms + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
        return (ms / 60000).toFixed(1) + 'm';
    }

    private formatRelativeTime(dateStr: string): string {
        const now = Date.now();
        const then = new Date(dateStr).getTime();
        const diffMs = now - then;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        const diffDay = Math.floor(diffHr / 24);
        return diffDay + 'd ago';
    }
}

export function LoadAnalyticsAgentRuns() { /* tree-shaking prevention */ }
