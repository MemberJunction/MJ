/**
 * @fileoverview Prompt Run Analysis — Charts-first analytics with a detail table.
 *
 * Displays stats summary, runs-over-time chart, model/prompt/status breakdowns,
 * and a sortable, paginated detail table. All data is loaded via RunView from
 * the "MJ: AI Prompt Runs" entity.
 */

import {
    Component, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { cacheHitRate } from '../../../services/cache-metrics';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';

// ── Interfaces ──

interface PromptRunRecord {
    ID: string;
    RunAt: string;
    CompletedAt: string | null;
    Status: string;
    Success: boolean;
    Cost: number | null;
    TotalCost: number | null;
    TokensUsed: number | null;
    TokensPrompt: number | null;
    TokensCompletion: number | null;
    TokensCacheRead: number | null;
    TokensCacheWrite: number | null;
    ExecutionTimeMS: number | null;
    ModelID: string | null;
    Model: string | null;
    AgentID: string | null;
    Agent: string | null;
    PromptID: string | null;
    Prompt: string | null;
    ErrorMessage: string | null;
}

interface PromptRunStats {
    TotalRuns: number;
    AvgCost: number;
    AvgTokens: number;
    AvgLatencySeconds: number;
    SuccessRate: number;
    P95LatencySeconds: number;
    TotalCost: number;
    CacheHitRate: number;
}

interface ChartBucket {
    label: string;
    value: number;
    heightPercent: number;
    startTime: Date;
    endTime: Date;
}

interface BreakdownItem {
    name: string;
    id: string;
    count: number;
    percentage: number;
}

interface StatusBreakdownItem extends BreakdownItem {
    cssClass: string;
}

type ChartMetric = 'volume' | 'cost' | 'tokens';
type SortField = 'RunAt' | 'Prompt' | 'Model' | 'Status' | 'ExecutionTimeMS' | 'TokensUsed' | 'Cost';
type SortDirection = 'asc' | 'desc';

const FIELDS = [
    'ID', 'RunAt', 'CompletedAt', 'Status', 'Success', 'Cost', 'TotalCost',
    'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TokensCacheRead', 'TokensCacheWrite', 'ExecutionTimeMS',
    'ModelID', 'Model', 'AgentID', 'Agent', 'PromptID', 'Prompt', 'ErrorMessage'
];

const PAGE_SIZE = 25;

@Component({
    standalone: false,
    selector: 'app-analytics-prompt-runs',
    template: `

        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading prompt runs..."></mj-loading>
            </div>
        } @else {
            <!-- Stats Summary Bar -->
            <div class="stats-grid">
                <div class="stat-card accent-brand">
                    <div class="stat-label">Total Runs</div>
                    <div class="stat-value">{{ Stats.TotalRuns | number }}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Avg Cost</div>
                    <div class="stat-value">{{ FormatCurrency(Stats.AvgCost, 4) }}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Avg Tokens</div>
                    <div class="stat-value">{{ Stats.AvgTokens | number:'1.0-0' }}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Avg Latency</div>
                    <div class="stat-value">{{ Stats.AvgLatencySeconds | number:'1.2-2' }}s</div>
                </div>
                <div class="stat-card accent-success">
                    <div class="stat-label">Success Rate</div>
                    <div class="stat-value">{{ Stats.SuccessRate | number:'1.1-1' }}%</div>
                </div>
                <div class="stat-card accent-warning">
                    <div class="stat-label">P95 Latency</div>
                    <div class="stat-value">{{ Stats.P95LatencySeconds | number:'1.2-2' }}s</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Cost</div>
                    <div class="stat-value">{{ FormatCurrency(Stats.TotalCost, 2) }}</div>
                </div>
                <div class="stat-card" title="Share of input tokens served from the provider's prompt cache">
                    <div class="stat-label">Cache Hit Rate</div>
                    <div class="stat-value">{{ Stats.CacheHitRate * 100 | number:'1.1-1' }}%</div>
                </div>
            </div>

            <!-- Chart Panel -->
            <div class="chart-panel">
                <div class="chart-header">
                    <h3 class="chart-title">Runs Over Time</h3>
                    <div class="chart-toggles">
                        @for (metric of ChartMetricOptions; track metric.key) {
                            <button
                                class="toggle-chip"
                                [class.active]="ActiveChartMetric === metric.key"
                                (click)="OnChartMetricChange(metric.key)">
                                {{ metric.label }}
                            </button>
                        }
                    </div>
                </div>
                <div class="chart-area">
                    @if (ChartBuckets.length === 0) {
                        <div class="chart-empty">No data for selected time range</div>
                    } @else {
                        <div class="chart-bars">
                            @for (bucket of ChartBuckets; track bucket.label) {
                                <div
                                    class="chart-bar-wrapper"
                                    [title]="bucket.label + ': ' + bucket.value"
                                    (click)="OnChartBucketClick(bucket)">
                                    <div class="chart-bar-value">{{ FormatChartValue(bucket.value) }}</div>
                                    <div class="chart-bar" [style.height.%]="bucket.heightPercent"></div>
                                    <div class="chart-bar-label">{{ bucket.label }}</div>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>

            <!-- Breakdown Cards -->
            <div class="breakdown-grid">
                <!-- By Model -->
                <div class="breakdown-card">
                    <h4 class="breakdown-title">By Model</h4>
                    @for (item of ModelBreakdown; track item.id) {
                        <div class="breakdown-row" (click)="ApplyModelFilter(item.id)">
                            <span class="breakdown-name">{{ item.name }}</span>
                            <span class="breakdown-count">{{ item.count }}</span>
                            <div class="breakdown-bar-track">
                                <div class="breakdown-bar-fill" [style.width.%]="item.percentage"></div>
                            </div>
                        </div>
                    }
                    @if (ModelBreakdown.length === 0) {
                        <div class="breakdown-empty">No data</div>
                    }
                </div>

                <!-- By Prompt -->
                <div class="breakdown-card">
                    <h4 class="breakdown-title">By Prompt</h4>
                    @for (item of PromptBreakdown; track item.id) {
                        <div class="breakdown-row" (click)="ApplyPromptFilter(item.id)">
                            <span class="breakdown-name">{{ item.name }}</span>
                            <span class="breakdown-count">{{ item.count }}</span>
                            <div class="breakdown-bar-track">
                                <div class="breakdown-bar-fill" [style.width.%]="item.percentage"></div>
                            </div>
                        </div>
                    }
                    @if (PromptBreakdown.length === 0) {
                        <div class="breakdown-empty">No data</div>
                    }
                </div>

                <!-- By Status -->
                <div class="breakdown-card">
                    <h4 class="breakdown-title">By Status</h4>
                    @for (item of StatusBreakdown; track item.name) {
                        <div class="breakdown-row" (click)="ApplyStatusFilter(item.name)">
                            <span class="status-dot" [class]="item.cssClass"></span>
                            <span class="breakdown-name">{{ item.name }}</span>
                            <span class="breakdown-count">{{ item.count }} ({{ item.percentage | number:'1.1-1' }}%)</span>
                        </div>
                    }
                    @if (StatusBreakdown.length === 0) {
                        <div class="breakdown-empty">No data</div>
                    }
                </div>
            </div>

            <!-- Run Details Table -->
            <div class="table-panel">
                <div class="table-header">
                    <h3 class="table-title">Run Details</h3>
                    <span class="table-count">{{ FilteredRuns.length | number }} runs</span>
                </div>
                <div class="table-scroll">
                    <table class="runs-table">
                        <thead>
                            <tr>
                                @for (col of TableColumns; track col.field) {
                                    <th
                                        [class.sortable]="col.sortable"
                                        [class.sorted]="SortField === col.field"
                                        (click)="col.sortable ? OnSortChange(col.field) : null">
                                        {{ col.label }}
                                        @if (col.sortable && SortField === col.field) {
                                            <i [class]="SortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                                        }
                                    </th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (run of PagedRuns; track run.ID; let i = $index) {
                                <tr [class.row-even]="i % 2 === 0">
                                    <td class="cell-timestamp">{{ FormatTimestamp(run.RunAt) }}</td>
                                    <td class="cell-prompt">{{ run.Prompt ?? '(unnamed)' }}</td>
                                    <td><span class="model-tag">{{ run.Model ?? 'N/A' }}</span></td>
                                    <td><span class="status-pill" [class]="GetStatusClass(run.Status)">{{ run.Status }}</span></td>
                                    <td class="cell-number">{{ FormatDuration(run.ExecutionTimeMS) }}</td>
                                    <td class="cell-number" title="Total tokens processed, including cached input">{{ run.TokensUsed != null ? (TrueTotalTokens(run) | number) : '-' }}</td>
                                    <td class="cell-number">{{ FormatCurrency(run.Cost, 4) }}</td>
                                </tr>
                            }
                            @if (PagedRuns.length === 0) {
                                <tr>
                                    <td colspan="7" class="empty-row">No prompt runs found for the selected filters.</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>

                @if (TotalPages > 1) {
                    <div class="pagination">
                        <button
                            class="page-btn"
                            [disabled]="CurrentPage === 1"
                            (click)="OnPageChange(CurrentPage - 1)">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <span class="page-info">Page {{ CurrentPage }} of {{ TotalPages }}</span>
                        <button
                            class="page-btn"
                            [disabled]="CurrentPage === TotalPages"
                            (click)="OnPageChange(CurrentPage + 1)">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        :host {
            display: block;
        }

        .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 80px 0;
        }

        /* ── Stats Grid ── */

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
            margin-top: 16px;
        }

        .stat-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .stat-card.accent-brand {
            border-left: 3px solid var(--mj-brand-primary);
        }

        .stat-card.accent-success {
            border-left: 3px solid var(--mj-status-success);
        }

        .stat-card.accent-warning {
            border-left: 3px solid var(--mj-status-warning);
        }

        .stat-label {
            font-size: 12px;
            font-weight: 500;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }

        .stat-value {
            font-size: 20px;
            font-weight: 700;
            color: var(--mj-text-primary);
        }

        /* ── Chart Panel ── */

        .chart-panel {
            margin-top: 16px;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            padding: 20px;
        }

        .chart-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .chart-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin: 0;
        }

        .chart-toggles {
            display: flex;
            gap: 4px;
        }

        .toggle-chip {
            padding: 4px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 16px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
        }

        .toggle-chip:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .toggle-chip.active {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
            font-weight: 600;
        }

        .chart-area {
            height: 220px;
            display: flex;
            align-items: flex-end;
        }

        .chart-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            color: var(--mj-text-muted);
            font-size: 13px;
        }

        .chart-bars {
            display: flex;
            align-items: flex-end;
            gap: 4px;
            width: 100%;
            height: 100%;
            padding-bottom: 24px;
        }

        .chart-bar-wrapper {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            position: relative;
            height: 100%;
            justify-content: flex-end;
        }

        .chart-bar-value {
            font-size: 10px;
            color: var(--mj-text-muted);
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }

        .chart-bar {
            width: 80%;
            min-height: 2px;
            background: color-mix(in srgb, var(--mj-brand-primary) 25%, var(--mj-bg-surface));
            border-radius: 4px 4px 0 0;
            transition: background 0.15s, height 0.3s;
        }

        .chart-bar-wrapper:hover .chart-bar {
            background: color-mix(in srgb, var(--mj-brand-primary) 50%, var(--mj-bg-surface));
        }

        .chart-bar-label {
            font-size: 10px;
            color: var(--mj-text-muted);
            margin-top: 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            text-align: center;
            position: absolute;
            bottom: 0;
        }

        /* ── Breakdown Cards ── */

        .breakdown-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 16px;
        }

        .breakdown-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 16px;
        }

        .breakdown-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin: 0 0 12px;
        }

        .breakdown-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 0;
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.1s;
        }

        .breakdown-row:hover {
            background: var(--mj-bg-surface-hover);
        }

        .breakdown-name {
            flex: 1;
            font-size: 13px;
            color: var(--mj-text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
        }

        .breakdown-count {
            font-size: 12px;
            color: var(--mj-text-secondary);
            font-weight: 600;
            white-space: nowrap;
        }

        .breakdown-bar-track {
            width: 60px;
            height: 6px;
            background: var(--mj-bg-surface-sunken);
            border-radius: 3px;
            overflow: hidden;
            flex-shrink: 0;
        }

        .breakdown-bar-fill {
            height: 100%;
            background: var(--mj-brand-primary);
            border-radius: 3px;
            transition: width 0.3s;
        }

        .breakdown-empty {
            font-size: 13px;
            color: var(--mj-text-muted);
            padding: 8px 0;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .status-dot.dot-completed { background: var(--mj-status-success); }
        .status-dot.dot-failed { background: var(--mj-status-error); }
        .status-dot.dot-running { background: var(--mj-brand-primary); }
        .status-dot.dot-pending { background: var(--mj-status-warning); }
        .status-dot.dot-cancelled { background: var(--mj-text-muted); }

        /* ── Table Panel ── */

        .table-panel {
            margin-top: 16px;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            overflow: hidden;
        }

        .table-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .table-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin: 0;
        }

        .table-count {
            font-size: 12px;
            color: var(--mj-text-muted);
            font-weight: 500;
        }

        .table-scroll {
            overflow-x: auto;
        }

        .runs-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .runs-table th {
            padding: 10px 14px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            color: var(--mj-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            border-bottom: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface-card);
            white-space: nowrap;
            user-select: none;
        }

        .runs-table th.sortable {
            cursor: pointer;
        }

        .runs-table th.sortable:hover {
            color: var(--mj-text-primary);
        }

        .runs-table th.sorted {
            color: var(--mj-brand-primary);
        }

        .runs-table th i {
            margin-left: 4px;
            font-size: 10px;
        }

        .runs-table td {
            padding: 10px 14px;
            color: var(--mj-text-primary);
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .runs-table tr.row-even {
            background: var(--mj-bg-surface-card);
        }

        .runs-table tbody tr:hover {
            background: var(--mj-bg-surface-hover);
        }

        .cell-timestamp {
            white-space: nowrap;
            color: var(--mj-text-secondary);
            font-size: 12px;
        }

        .cell-prompt {
            font-weight: 600;
            max-width: 220px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .cell-number {
            text-align: right;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }

        .model-tag {
            display: inline-flex;
            padding: 2px 8px;
            background: var(--mj-bg-surface-sunken);
            border-radius: 4px;
            font-size: 12px;
            color: var(--mj-text-secondary);
            white-space: nowrap;
        }

        .status-pill {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
        }

        .pill-completed {
            background: var(--mj-status-success-bg);
            color: var(--mj-status-success-text);
        }

        .pill-failed {
            background: var(--mj-status-error-bg);
            color: var(--mj-status-error-text);
        }

        .pill-running {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
        }

        .pill-pending {
            background: var(--mj-status-warning-bg);
            color: var(--mj-status-warning-text);
        }

        .pill-cancelled {
            background: var(--mj-bg-surface-sunken);
            color: var(--mj-text-muted);
        }

        .empty-row {
            text-align: center;
            color: var(--mj-text-muted);
            padding: 24px 14px;
        }

        /* ── Pagination ── */

        .pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 12px 20px;
            border-top: 1px solid var(--mj-border-subtle);
        }

        .page-btn {
            padding: 6px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            cursor: pointer;
            font-size: 13px;
            transition: background 0.15s, color 0.15s;
        }

        .page-btn:hover:not(:disabled) {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .page-btn:disabled {
            opacity: 0.4;
            cursor: default;
        }

        .page-info {
            font-size: 13px;
            color: var(--mj-text-secondary);
        }

        /* ── Responsive ── */

        @media (max-width: 1200px) {
            .breakdown-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .breakdown-grid {
                grid-template-columns: 1fr;
            }

            .chart-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }
        }
    `]
})
export class AnalyticsPromptRunsComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();
    private isInitialized = false;

    // ── Inputs with setter pattern ──

    private _timeRange = '24h';
    @Input()
    set TimeRange(value: string) {
        if (value !== this._timeRange) {
            this._timeRange = value;
            if (this.isInitialized) {
                this.LoadData();
            }
        }
    }
    get TimeRange(): string {
        return this._timeRange;
    }

    private _filters: GlobalFilterState = { Models: [], Agents: [], Prompts: [], Statuses: [] };
    @Input()
    set Filters(value: GlobalFilterState) {
        this._filters = value;
        if (this.isInitialized) {
            this.resetPagination();
            this.cdr.detectChanges();
        }
    }
    get Filters(): GlobalFilterState {
        return this._filters;
    }

    @Output() TimeRangeChange = new EventEmitter<string>();
    @Output() FiltersChange = new EventEmitter<GlobalFilterState>();

    // ── State ──

    public IsLoading = false;
    public ActiveChartMetric: ChartMetric = 'volume';
    public SortField: SortField = 'RunAt';
    public SortDirection: SortDirection = 'desc';
    public CurrentPage = 1;

    private allRuns: PromptRunRecord[] = [];

    readonly ChartMetricOptions: { key: ChartMetric; label: string }[] = [
        { key: 'volume', label: 'By Volume' },
        { key: 'cost', label: 'By Cost' },
        { key: 'tokens', label: 'By Tokens' },
    ];

    readonly TableColumns: { field: SortField; label: string; sortable: boolean }[] = [
        { field: 'RunAt', label: 'Timestamp', sortable: true },
        { field: 'Prompt', label: 'Prompt', sortable: true },
        { field: 'Model', label: 'Model', sortable: true },
        { field: 'Status', label: 'Status', sortable: true },
        { field: 'ExecutionTimeMS', label: 'Duration', sortable: true },
        { field: 'TokensUsed', label: 'Tokens', sortable: true },
        { field: 'Cost', label: 'Cost', sortable: true },
    ];

    // ── Lifecycle ──

    async ngOnInit(): Promise<void> {
        this.isInitialized = true;
        await this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Computed Properties ──

    get FilteredRuns(): PromptRunRecord[] {
        return this.applyFilters(this.allRuns);
    }

    get Stats(): PromptRunStats {
        return this.computeStats(this.FilteredRuns);
    }

    get ChartBuckets(): ChartBucket[] {
        return this.computeChartBuckets(this.FilteredRuns);
    }

    get ModelBreakdown(): BreakdownItem[] {
        return this.computeBreakdown(this.FilteredRuns, 'Model', 'ModelID');
    }

    get PromptBreakdown(): BreakdownItem[] {
        return this.computeBreakdown(this.FilteredRuns, 'Prompt', 'PromptID');
    }

    get StatusBreakdown(): StatusBreakdownItem[] {
        return this.computeStatusBreakdown(this.FilteredRuns);
    }

    get PagedRuns(): PromptRunRecord[] {
        const sorted = this.sortRuns(this.FilteredRuns);
        const start = (this.CurrentPage - 1) * PAGE_SIZE;
        return sorted.slice(start, start + PAGE_SIZE);
    }

    get TotalPages(): number {
        return Math.max(1, Math.ceil(this.FilteredRuns.length / PAGE_SIZE));
    }

    // ── Event Handlers ──

    public OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
    }

    public OnFiltersChange(filters: GlobalFilterState): void {
        this.Filters = filters;
        this.FiltersChange.emit(filters);
    }

    public OnChartMetricChange(metric: ChartMetric): void {
        this.ActiveChartMetric = metric;
        this.cdr.detectChanges();
    }

    public OnChartBucketClick(_bucket: ChartBucket): void {
        // Future: drill into time range
    }

    public OnSortChange(field: SortField): void {
        if (this.SortField === field) {
            this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.SortField = field;
            this.SortDirection = 'desc';
        }
        this.resetPagination();
        this.cdr.detectChanges();
    }

    public OnPageChange(page: number): void {
        if (page >= 1 && page <= this.TotalPages) {
            this.CurrentPage = page;
            this.cdr.detectChanges();
        }
    }

    public ApplyModelFilter(modelId: string): void {
        this.Filters = { ...this.Filters, Models: [modelId] };
        this.FiltersChange.emit(this.Filters);
    }

    public ApplyPromptFilter(promptId: string): void {
        this.Filters = { ...this.Filters, Prompts: [promptId] };
        this.FiltersChange.emit(this.Filters);
    }

    public ApplyStatusFilter(status: string): void {
        this.Filters = { ...this.Filters, Statuses: [status] };
        this.FiltersChange.emit(this.Filters);
    }

    public ExportCSV(): void {
        const headers = ['Timestamp', 'Prompt', 'Model', 'Status', 'Duration(ms)', 'Tokens', 'Cost'];
        const rows = this.FilteredRuns.map(r => [
            r.RunAt,
            r.Prompt ?? '',
            r.Model ?? '',
            r.Status,
            r.ExecutionTimeMS?.toString() ?? '',
            this.TrueTotalTokens(r).toString(),
            r.Cost?.toString() ?? ''
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `prompt-runs-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    // ── Formatting Helpers ──

    public FormatCurrency(value: number | null, decimals: number): string {
        if (value == null || isNaN(value)) return '$0.00';
        return '$' + value.toFixed(decimals);
    }

    public FormatTimestamp(dateStr: string): string {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    public FormatDuration(ms: number | null): string {
        if (ms == null) return '-';
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    }

    public FormatChartValue(value: number): string {
        if (this.ActiveChartMetric === 'cost') {
            return '$' + value.toFixed(2);
        }
        if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'k';
        }
        return value.toFixed(0);
    }

    public GetStatusClass(status: string): string {
        const key = status.toLowerCase();
        return 'pill-' + key;
    }

    // ── Data Loading ──

    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const cutoff = this.getTimeRangeCutoff(this._timeRange);
            const filter = cutoff ? `RunAt >= '${cutoff.toISOString()}'` : '';

            const result = await rv.RunView<PromptRunRecord>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: filter,
                OrderBy: 'RunAt DESC',
                Fields: FIELDS,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.allRuns = result.Results;
            } else {
                this.allRuns = [];
            }
        } catch {
            this.allRuns = [];
        }

        this.resetPagination();
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    // ── Private Helpers ──

    private applyFilters(runs: PromptRunRecord[]): PromptRunRecord[] {
        let filtered = runs;

        if (this._filters.Models.length > 0) {
            filtered = filtered.filter(r => r.ModelID != null && this._filters.Models.includes(r.ModelID));
        }
        if (this._filters.Agents.length > 0) {
            filtered = filtered.filter(r => r.AgentID != null && this._filters.Agents.includes(r.AgentID));
        }
        if (this._filters.Prompts.length > 0) {
            filtered = filtered.filter(r => r.PromptID != null && this._filters.Prompts.includes(r.PromptID));
        }
        if (this._filters.Statuses.length > 0) {
            filtered = filtered.filter(r => this._filters.Statuses.includes(r.Status));
        }

        return filtered;
    }

    /**
     * Total tokens the model processed for a run, INCLUDING cached input. TokensUsed excludes the
     * cache buckets by design, so a heavily-cached run looks tiny; this is the true throughput.
     */
    public TrueTotalTokens(run: PromptRunRecord): number {
        return (run.TokensUsed ?? 0) + (run.TokensCacheRead ?? 0) + (run.TokensCacheWrite ?? 0);
    }

    private computeStats(runs: PromptRunRecord[]): PromptRunStats {
        const total = runs.length;
        if (total === 0) {
            return { TotalRuns: 0, AvgCost: 0, AvgTokens: 0, AvgLatencySeconds: 0, SuccessRate: 0, P95LatencySeconds: 0, TotalCost: 0, CacheHitRate: 0 };
        }

        const totalCost = this.sumNullable(runs, r => r.Cost);
        const totalTokens = runs.reduce((sum, r) => sum + this.TrueTotalTokens(r), 0);
        const latencies = this.collectNonNull(runs, r => r.ExecutionTimeMS);
        const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
        const successCount = runs.filter(r => r.Status === 'Completed').length;
        const p95 = this.percentile(latencies, 95);
        const cacheHit = cacheHitRate({
            uncachedInputTokens: this.sumNullable(runs, r => r.TokensPrompt),
            cacheReadTokens: this.sumNullable(runs, r => r.TokensCacheRead),
            cacheWriteTokens: this.sumNullable(runs, r => r.TokensCacheWrite)
        });

        return {
            TotalRuns: total,
            AvgCost: totalCost / total,
            AvgTokens: totalTokens / total,
            AvgLatencySeconds: avgLatencyMs / 1000,
            SuccessRate: (successCount / total) * 100,
            P95LatencySeconds: p95 / 1000,
            TotalCost: totalCost,
            CacheHitRate: cacheHit,
        };
    }

    private computeChartBuckets(runs: PromptRunRecord[]): ChartBucket[] {
        if (runs.length === 0) return [];

        const bucketCount = this.getBucketCount();
        const cutoff = this.getTimeRangeCutoff(this._timeRange) ?? new Date(runs[runs.length - 1].RunAt);
        const now = new Date();
        const rangeMs = now.getTime() - cutoff.getTime();
        const bucketMs = rangeMs / bucketCount;

        const buckets: { label: string; total: number; start: Date; end: Date }[] = [];
        for (let i = 0; i < bucketCount; i++) {
            const start = new Date(cutoff.getTime() + i * bucketMs);
            const end = new Date(cutoff.getTime() + (i + 1) * bucketMs);
            buckets.push({
                label: this.formatBucketLabel(start),
                total: 0,
                start,
                end,
            });
        }

        for (const run of runs) {
            const runTime = new Date(run.RunAt).getTime();
            const idx = Math.min(Math.floor((runTime - cutoff.getTime()) / bucketMs), bucketCount - 1);
            if (idx >= 0 && idx < bucketCount) {
                buckets[idx].total += this.getChartMetricValue(run);
            }
        }

        const max = Math.max(...buckets.map(b => b.total), 1);

        return buckets.map(b => ({
            label: b.label,
            value: Math.round(b.total * 100) / 100,
            heightPercent: Math.max((b.total / max) * 100, 1),
            startTime: b.start,
            endTime: b.end,
        }));
    }

    private getChartMetricValue(run: PromptRunRecord): number {
        switch (this.ActiveChartMetric) {
            case 'cost': return run.Cost ?? 0;
            case 'tokens': return this.TrueTotalTokens(run);
            default: return 1; // volume = count
        }
    }

    private computeBreakdown(runs: PromptRunRecord[], nameKey: 'Model' | 'Prompt', idKey: 'ModelID' | 'PromptID'): BreakdownItem[] {
        const counts = new Map<string, { name: string; count: number }>();
        for (const run of runs) {
            const id = run[idKey];
            const name = run[nameKey];
            if (id != null && name != null) {
                const existing = counts.get(id);
                if (existing) {
                    existing.count++;
                } else {
                    counts.set(id, { name, count: 1 });
                }
            }
        }

        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 4);

        const maxCount = sorted.length > 0 ? sorted[0][1].count : 1;

        return sorted.map(([id, data]) => ({
            id,
            name: data.name,
            count: data.count,
            percentage: (data.count / maxCount) * 100,
        }));
    }

    private computeStatusBreakdown(runs: PromptRunRecord[]): StatusBreakdownItem[] {
        const total = runs.length;
        if (total === 0) return [];

        const counts = new Map<string, number>();
        for (const run of runs) {
            counts.set(run.Status, (counts.get(run.Status) ?? 0) + 1);
        }

        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => ({
                id: status,
                name: status,
                count,
                percentage: (count / total) * 100,
                cssClass: 'dot-' + status.toLowerCase(),
            }));
    }

    private sortRuns(runs: PromptRunRecord[]): PromptRunRecord[] {
        const dir = this.SortDirection === 'asc' ? 1 : -1;
        return [...runs].sort((a, b) => {
            const aVal = a[this.SortField];
            const bVal = b[this.SortField];
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return aVal.localeCompare(bVal) * dir;
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * dir;
            }
            return String(aVal).localeCompare(String(bVal)) * dir;
        });
    }

    private getTimeRangeCutoff(range: string): Date | null {
        const now = new Date();
        switch (range) {
            case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
            case '6h': return new Date(now.getTime() - 6 * 60 * 60 * 1000);
            case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            default: return null;
        }
    }

    private getBucketCount(): number {
        switch (this._timeRange) {
            case '1h': return 12;     // 5-min buckets
            case '6h': return 12;     // 30-min buckets
            case '24h': return 24;    // 1-hour buckets
            case '7d': return 14;     // 12-hour buckets
            case '30d': return 30;    // 1-day buckets
            default: return 24;
        }
    }

    private formatBucketLabel(date: Date): string {
        switch (this._timeRange) {
            case '1h':
            case '6h':
                return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            case '24h':
                return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            case '7d':
            case '30d':
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            default:
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
    }

    private sumNullable(runs: PromptRunRecord[], getter: (r: PromptRunRecord) => number | null): number {
        return runs.reduce((sum, r) => sum + (getter(r) ?? 0), 0);
    }

    private collectNonNull(runs: PromptRunRecord[], getter: (r: PromptRunRecord) => number | null): number[] {
        const result: number[] = [];
        for (const r of runs) {
            const val = getter(r);
            if (val != null) {
                result.push(val);
            }
        }
        return result;
    }

    private percentile(values: number[], pct: number): number {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((pct / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    private resetPagination(): void {
        this.CurrentPage = 1;
    }
}

export function LoadAnalyticsPromptRuns(): void {
    // Prevents tree-shaking of the component
}
