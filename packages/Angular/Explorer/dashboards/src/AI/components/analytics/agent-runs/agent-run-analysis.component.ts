/**
 * @fileoverview Agent Run Analysis -- Cost Attribution Focus.
 *
 * Displays agent run stats, cost attribution horizontal stacked bars per agent,
 * and a sortable recent agent runs table. All data loaded via RunView from
 * "MJ: AI Agent Runs" and "MJ: AI Prompt Runs" entities.
 */

import {
    Component, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';

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
}

interface PromptRunRecord {
    ID: string;
    AgentRunID: string | null;
    Cost: number | null;
    TotalCost: number | null;
    Model: string | null;
    Vendor: string | null;
}

interface AgentRunStats {
    TotalRuns: number;
    TotalCost: number;
    PromptRuns: number;
    AvgCostPerRun: number;
    SuccessRate: number;
    AvgDurationSeconds: number;
}

interface CostAttributionRow {
    AgentName: string;
    AgentID: string;
    TotalCost: number;
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
    'TotalCost', 'TotalTokensUsed', 'AgentID', 'Agent', 'ErrorMessage'
];

const PROMPT_RUN_FIELDS = [
    'ID', 'AgentRunID', 'Cost', 'TotalCost', 'Model', 'Vendor'
];

const COST_COLORS = [
    'var(--mj-brand-primary)',
    'var(--mj-brand-accent, var(--mj-brand-primary-hover))',
    'var(--mj-status-info)',
    'var(--mj-text-disabled)'
];

@Component({
    standalone: false,
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
                        <div class="panel-empty">No agent cost data for selected period</div>
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
                    <span class="panel-header__subtitle">{{ RecentRuns.length }} runs</span>
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
                                <tr><td [attr.colspan]="TableColumns.length" class="empty-row">No runs found</td></tr>
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

        .panel-empty {
            text-align: center;
            padding: 24px;
            color: var(--mj-text-disabled);
            font-size: 13px;
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
        if (prev !== value && this.initialized) this.LoadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private _filters: AgentRunFilters = { Agents: [], Statuses: [] };
    @Input()
    set Filters(value: AgentRunFilters) {
        const next = value ?? { Agents: [], Statuses: [] };
        const changed = !this.shallowFiltersEqual(this._filters, next);
        this._filters = next;
        if (changed && this.initialized) this.LoadData();
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
        { field: 'StepCount', label: 'Steps' },
        { field: 'Duration', label: 'Duration' },
        { field: 'Cost', label: 'Cost' },
        { field: 'Time', label: 'Time' }
    ];

    /** Bridge the local filter shape to the global shape the filter bar expects */
    public get globalFilters(): GlobalFilterState {
        return {
            Models: [],
            Agents: this.Filters.Agents,
            Prompts: [],
            Statuses: this.Filters.Statuses
        };
    }

    private agentRuns: AgentRunRecord[] = [];
    private promptRuns: PromptRunRecord[] = [];

    ngOnInit(): void {
        this.initialized = true;
        this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Public Event Handlers ──

    public OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
        this.LoadData();
    }

    public OnFiltersChange(filters: GlobalFilterState): void {
        this.Filters = { Agents: filters.Agents, Statuses: filters.Statuses };
        this.FiltersChange.emit(this.Filters);
        this.LoadData();
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

    public FormatCurrency(value: number, decimals = 2): string {
        if (value === 0) return '$0.00';
        if (value < 0.01 && decimals < 4) decimals = 4;
        return '$' + value.toFixed(decimals);
    }

    // ── Data Loading ──

    private async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const dateFilter = this.buildDateFilter('StartedAt');
            const agentFilter = this.buildAgentFilter();
            const statusFilter = this.buildStatusFilter();
            const extraFilter = [dateFilter, agentFilter, statusFilter].filter(Boolean).join(' AND ');

            const promptDateFilter = this.buildDateFilter('RunAt');

            const [agentResult, promptResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: extraFilter,
                    Fields: AGENT_RUN_FIELDS,
                    OrderBy: 'StartedAt DESC',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: promptDateFilter,
                    Fields: PROMPT_RUN_FIELDS,
                    OrderBy: 'RunAt DESC',
                    ResultType: 'simple'
                }
            ]);

            this.agentRuns = (agentResult?.Results ?? []) as AgentRunRecord[];
            this.promptRuns = (promptResult?.Results ?? []) as PromptRunRecord[];

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
        const totalCost = runs.reduce((s, r) => s + (r.TotalCost ?? 0), 0);
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

        const linkedPromptRuns = this.promptRuns.filter(
            p => p.AgentRunID != null && this.agentRunIdSet.has(p.AgentRunID)
        );

        this.Stats = {
            TotalRuns: total,
            TotalCost: totalCost,
            PromptRuns: linkedPromptRuns.length,
            AvgCostPerRun: total > 0 ? totalCost / total : 0,
            SuccessRate: total > 0 ? (successCount / total) * 100 : 0,
            AvgDurationSeconds: avgDuration
        };
    }

    private get agentRunIdSet(): Set<string> {
        return new Set(this.agentRuns.map(r => r.ID));
    }

    private computeCostAttribution(): void {
        const agentCostMap = new Map<string, { name: string; vendorCosts: Map<string, number>; totalCost: number }>();

        // Group prompt runs by agent run, then by vendor
        for (const pr of this.promptRuns) {
            if (!pr.AgentRunID) continue;
            const agentRun = this.agentRuns.find(ar => UUIDsEqual(ar.ID, pr.AgentRunID));
            if (!agentRun) continue;

            const agentKey = agentRun.AgentID;
            if (!agentCostMap.has(agentKey)) {
                agentCostMap.set(agentKey, {
                    name: agentRun.Agent ?? 'Unknown',
                    vendorCosts: new Map<string, number>(),
                    totalCost: 0
                });
            }

            const entry = agentCostMap.get(agentKey)!;
            const vendor = pr.Vendor ?? 'Other';
            const cost = pr.Cost ?? pr.TotalCost ?? 0;
            entry.vendorCosts.set(vendor, (entry.vendorCosts.get(vendor) ?? 0) + cost);
            entry.totalCost += cost;
        }

        // Collect all vendors for consistent coloring
        const allVendors = new Set<string>();
        for (const entry of agentCostMap.values()) {
            for (const v of entry.vendorCosts.keys()) {
                allVendors.add(v);
            }
        }
        const vendorList = Array.from(allVendors);

        // Build legend
        this.LegendItems = vendorList.map((v, i) => ({
            Label: v,
            Color: COST_COLORS[i % COST_COLORS.length]
        }));

        // Sort by total cost descending
        const sorted = Array.from(agentCostMap.entries())
            .sort((a, b) => b[1].totalCost - a[1].totalCost);

        this.CostAttributionRows = sorted.map(([agentId, entry]) => {
            const segments: CostSegment[] = vendorList.map((vendor, i) => {
                const val = entry.vendorCosts.get(vendor) ?? 0;
                return {
                    Label: vendor,
                    Value: val,
                    Percent: entry.totalCost > 0 ? (val / entry.totalCost) * 100 : 0,
                    Color: COST_COLORS[i % COST_COLORS.length]
                };
            }).filter(s => s.Value > 0);

            return {
                AgentName: entry.name,
                AgentID: agentId,
                TotalCost: entry.totalCost,
                Segments: segments
            };
        });
    }

    private buildRecentRuns(): void {
        // Count prompt runs per agent run
        const promptCountMap = new Map<string, number>();
        for (const pr of this.promptRuns) {
            if (pr.AgentRunID) {
                promptCountMap.set(pr.AgentRunID, (promptCountMap.get(pr.AgentRunID) ?? 0) + 1);
            }
        }

        this.RecentRuns = this.agentRuns.slice(0, 100).map(r => ({
            ID: r.ID,
            Agent: r.Agent ?? 'Unknown',
            Status: r.Status,
            StatusClass: this.getStatusClass(r.Status),
            StepCount: promptCountMap.get(r.ID) ?? 0,
            Duration: this.formatDuration(r.StartedAt, r.CompletedAt),
            Cost: this.FormatCurrency(r.TotalCost ?? 0),
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
