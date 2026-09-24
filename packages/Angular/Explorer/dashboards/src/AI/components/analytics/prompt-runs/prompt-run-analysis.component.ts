/**
 * @fileoverview Prompt Run Analysis — Charts-first analytics with a detail table.
 *
 * Displays stats summary, runs-over-time chart, model/prompt/status breakdowns,
 * and a sortable, paginated detail table. All data is loaded via RunView from
 * the "MJ: AI Prompt Runs" entity.
 */

import {
    Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { CacheHitRate } from '../../../services/cache-metrics';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { AIUsageDailyRow, AIUsageHourlyRow } from '../../../services/ai-usage-analytics.types';
import { ComputeTotalCost, ComputeCoveragePercent } from '../../../services/ai-usage-analytics.compute';
import { CompareDateCells, DateCellIso } from '../../../../shared/date-cell';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';
import { ViewToggleOption } from '@memberjunction/ng-ui-components';

// ── Interfaces ──

interface PromptRunRecord {
    ID: string;
    RunAt: Date | string;
    CompletedAt: Date | string | null;
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
    AvgCost: number | null;
    AvgTokens: number;
    AvgLatencySeconds: number;
    SuccessRate: number;
    P95LatencySeconds: number;
    TotalCost: number | null;
    CacheHitRate: number;
    /** "covers N% of runs" — cost is only ever summed over priced runs. */
    CoverageSubtitle?: string;
    /** True when the totals come from the latest-runs sample rather than the period aggregates. */
    FromSample: boolean;
    /** How many recent runs the latency figures are taken over. */
    LatencySampleSize: number;
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

type ChartMetric = 'volume' | 'cost' | 'tokens' | 'cacheHit';
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
    changeDetection: ChangeDetectionStrategy.OnPush,
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
                    @if (Stats.FromSample && IsSampleTruncated) {
                        <div class="stat-subtitle">within the latest {{ SampleSize | number }} runs</div>
                    }
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
                    @if (!Stats.FromSample && Stats.LatencySampleSize > 0) {
                        <div class="stat-subtitle">latest {{ Stats.LatencySampleSize | number }} runs</div>
                    }
                </div>
                <div class="stat-card accent-success">
                    <div class="stat-label">Success Rate</div>
                    <div class="stat-value">{{ Stats.SuccessRate | number:'1.1-1' }}%</div>
                </div>
                <div class="stat-card accent-warning">
                    <div class="stat-label">P95 Latency</div>
                    <div class="stat-value">{{ Stats.P95LatencySeconds | number:'1.2-2' }}s</div>
                    @if (!Stats.FromSample && Stats.LatencySampleSize > 0) {
                        <div class="stat-subtitle">latest {{ Stats.LatencySampleSize | number }} runs</div>
                    }
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Cost</div>
                    <div class="stat-value">{{ FormatCurrency(Stats.TotalCost, 2) }}</div>
                    @if (Stats.CoverageSubtitle) {
                        <div class="stat-subtitle">{{ Stats.CoverageSubtitle }}</div>
                    }
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
                    <mj-view-toggle class="chart-toggles" [Options]="ChartMetricToggleOptions"
                                    [ActiveKey]="ActiveChartMetric"
                                    (KeyChange)="OnChartMetricToggle($event)"></mj-view-toggle>
                </div>
                <div class="chart-area">
                    @if (ChartBuckets.length === 0) {
                        <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-chart-column"
                            Title="No data for selected time range" />
                    } @else {
                        <div class="chart-bars">
                            @for (bucket of ChartBuckets; track bucket.startTime.getTime(); let i = $index, count = $count) {
                                <div
                                    class="chart-bar-wrapper"
                                    [title]="bucket.label + ': ' + bucket.value">
                                    <div class="chart-bar-value">{{ bucket.value ? FormatChartValue(bucket.value) : '' }}</div>
                                    <div class="chart-bar" [style.height.%]="bucket.heightPercent"></div>
                                    <div class="chart-bar-label" [class.chart-bar-label--skipped]="i % ChartLabelStep(count) !== 0">{{ bucket.label }}</div>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>

            <!-- Breakdown Cards -->
            @if (IsSampleTruncated) {
                <div class="sample-note">Breakdowns and run details cover the latest {{ SampleSize | number }} runs in this period.</div>
            }
            <div class="breakdown-grid">
                <!-- By Model -->
                <div class="breakdown-card">
                    <h4 class="breakdown-title">By Model</h4>
                    @for (item of ModelBreakdown; track item.id) {
                        <div class="breakdown-row" [mjClickable]="'Filter by model ' + item.name" (click)="ApplyModelFilter(item.id)">
                            <span class="breakdown-name">{{ item.name }}</span>
                            <span class="breakdown-count">{{ item.count }}</span>
                            <div class="breakdown-bar-track">
                                <div class="breakdown-bar-fill" [style.width.%]="item.percentage"></div>
                            </div>
                        </div>
                    }
                    @if (ModelBreakdown.length === 0) {
                        <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-cube" Title="No data" />
                    }
                </div>

                <!-- By Prompt -->
                <div class="breakdown-card">
                    <h4 class="breakdown-title">By Prompt</h4>
                    @for (item of PromptBreakdown; track item.id) {
                        <div class="breakdown-row" [mjClickable]="'Filter by prompt ' + item.name" (click)="ApplyPromptFilter(item.id)">
                            <span class="breakdown-name">{{ item.name }}</span>
                            <span class="breakdown-count">{{ item.count }}</span>
                            <div class="breakdown-bar-track">
                                <div class="breakdown-bar-fill" [style.width.%]="item.percentage"></div>
                            </div>
                        </div>
                    }
                    @if (PromptBreakdown.length === 0) {
                        <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-message" Title="No data" />
                    }
                </div>

                <!-- By Status -->
                <div class="breakdown-card">
                    <h4 class="breakdown-title">By Status</h4>
                    @for (item of StatusBreakdown; track item.name) {
                        <div class="breakdown-row" [mjClickable]="'Filter by status ' + item.name" (click)="ApplyStatusFilter(item.name)">
                            <span class="status-dot" [class]="item.cssClass"></span>
                            <span class="breakdown-name">{{ item.name }}</span>
                            <span class="breakdown-count">{{ item.count }} ({{ item.percentage | number:'1.1-1' }}%)</span>
                        </div>
                    }
                    @if (StatusBreakdown.length === 0) {
                        <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-circle-dot" Title="No data" />
                    }
                </div>
            </div>

            <!-- Run Details Table -->
            <div class="table-panel">
                <div class="table-header">
                    <h3 class="table-title">Run Details</h3>
                    <span class="table-count">{{ TableCountLabel }}</span>
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
                                    <td class="cell-number" [title]="run.Cost == null ? 'Unpriced — no pricing for this model' : ''">{{ FormatCurrency(run.Cost, 4) }}</td>
                                </tr>
                            }
                            @if (PagedRuns.length === 0) {
                                <tr>
                                    <td colspan="7" class="empty-cell">
                                        <mj-empty-state Size="compact" Variant="no-results" Title="No prompt runs found for the selected filters." />
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>

                @if (TotalPages > 1) {
                    <div class="pagination">
                        <button mjButton variant="secondary" size="sm" AriaLabel="Previous page"
                            [disabled]="CurrentPage === 1"
                            (click)="OnPageChange(CurrentPage - 1)">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <span class="page-info">Page {{ CurrentPage }} of {{ TotalPages }}</span>
                        <button mjButton variant="secondary" size="sm" AriaLabel="Next page"
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
        .stat-subtitle {
            margin-top: var(--mj-space-1);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .sample-note {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }


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

        .chart-area {
            height: 220px;
            display: flex;
            align-items: flex-end;
        }

        .chart-area mj-empty-state {
            width: 100%;
            height: 100%;
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
            margin-top: 4px;
            white-space: nowrap;
            /* Wider than its bar on a 30-day range: centred on the bar, it spills evenly into the
               neighbours, whose labels ChartLabelStep has hidden. It hangs below the bar, in the strip
               .chart-bars reserves with padding-bottom (at bottom: 0 it was drawn over the bar). */
            width: max-content;
            text-align: center;
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
        }

        .chart-bar-label--skipped {
            visibility: hidden;
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

        .breakdown-row:focus-visible {
            outline: none;
            box-shadow: var(--mj-focus-ring);
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

        .runs-table td.empty-cell {
            padding: 0;
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
    private instrumentation = inject(AIInstrumentationService);
    /** Period aggregates for ranges of a day or more (hourly for 24h, daily beyond). */
    private usageRows: (AIUsageHourlyRow | AIUsageDailyRow)[] = [];
    private usageGrain: 'hour' | 'day' | null = null;
    /** Runs loaded for the breakdowns, latency and the run table (newest first). */
    public readonly SampleSize = 1000;
    /** True when the period holds more runs than the sample, so the per-run views are partial. */
    public get IsSampleTruncated(): boolean {
        return this.AllRuns.length >= this.SampleSize;
    }
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

    public AllRuns: PromptRunRecord[] = [];

    readonly ChartMetricOptions: { key: ChartMetric; label: string }[] = [
        { key: 'volume', label: 'By Volume' },
        { key: 'cost', label: 'By Cost' },
        { key: 'tokens', label: 'By Tokens' },
        { key: 'cacheHit', label: 'By Cache Hit %' },
    ];

    /** The same options in the shape `<mj-view-toggle>` renders (text-label mode). */
    readonly ChartMetricToggleOptions: ViewToggleOption[] = this.ChartMetricOptions.map(o => ({ key: o.key, label: o.label }));

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
        return this.applyFilters(this.AllRuns);
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

    /** `(KeyChange)` handler: the toggle emits a plain string, so accept only a known metric key. */
    public OnChartMetricToggle(key: string): void {
        const match = this.ChartMetricOptions.find(o => o.key === key);
        if (match) this.OnChartMetricChange(match.key);
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
            DateCellIso(r.RunAt),
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

    /** A null cost is an unpriced run (no pricing row for the model), not a free one. */
    public FormatCurrency(value: number | null, decimals: number): string {
        if (value == null || isNaN(value)) return '—';
        return '$' + value.toFixed(decimals);
    }

    public FormatTimestamp(dateStr: Date | string): string {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    public FormatDuration(ms: number | null): string {
        if (ms == null) return '-';
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    }

    /** The run table's scope: all runs in the period, or a slice of the latest-runs sample. */
    public get TableCountLabel(): string {
        const shown = this.FilteredRuns.length.toLocaleString();
        if (!this.IsSampleTruncated) {
            return `${shown} runs`;
        }
        const sample = this.SampleSize.toLocaleString();
        return this.FilteredRuns.length === this.AllRuns.length ? `latest ${sample} runs` : `${shown} of the latest ${sample} runs`;
    }

    /** Show every Nth bar label so 30 daily / 25 hourly labels never truncate into each other. */
    public ChartLabelStep(count: number): number {
        return Math.max(1, Math.ceil(count / 16));
    }

    public FormatChartValue(value: number): string {
        if (this.ActiveChartMetric === 'cost') {
            return '$' + value.toFixed(2);
        }
        if (this.ActiveChartMetric === 'cacheHit') {
            return value.toFixed(0) + '%';
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

            // The run list is the latest 1,000 runs; the period totals and the chart come from the
            // usage aggregates, so a busy period is never reported as "1,000 runs".
            this.usageGrain = this._timeRange === '24h' ? 'hour' : (this._timeRange === '7d' || this._timeRange === '30d') ? 'day' : null;
            this.instrumentation.Provider = this.ProviderToUse;
            const now = new Date();
            const [result, usage] = await Promise.all([
                rv.RunView<PromptRunRecord>({
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: filter,
                    OrderBy: 'RunAt DESC',
                    Fields: FIELDS,
                    MaxRows: this.SampleSize,
                    ResultType: 'simple'
                }),
                this.usageGrain === 'hour' && cutoff ? this.instrumentation.GetUsageHourly(cutoff, now)
                    : this.usageGrain === 'day' && cutoff ? this.instrumentation.GetUsageDaily(cutoff, now)
                    : Promise.resolve([] as (AIUsageHourlyRow | AIUsageDailyRow)[])
            ]);
            this.usageRows = usage;
            if (!result.Success) {
                console.error('Prompt Run Analysis: prompt runs failed to load', result.ErrorMessage);
            }

            if (result.Success) {
                this.AllRuns = result.Results;
            } else {
                this.AllRuns = [];
            }
        } catch {
            this.AllRuns = [];
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
        const latencies = this.collectNonNull(runs, r => r.ExecutionTimeMS);
        const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
        const p95 = this.percentile(latencies, 95);

        if (this.useAggregates) {
            const usage = this.filteredUsageRows();
            const totalRuns = usage.reduce((sum, r) => sum + (r.Runs ?? 0), 0);
            const priced = usage.reduce((sum, r) => sum + (r.PricedRuns ?? 0), 0);
            const unpriced = usage.reduce((sum, r) => sum + (r.UnpricedRuns ?? 0), 0);
            const totalCost = totalRuns > 0 ? ComputeTotalCost(usage) : 0;
            const tokens = usage.reduce((sum, r) => sum + (r.TokensPrompt ?? 0) + (r.TokensCompletion ?? 0) + (r.TokensCacheRead ?? 0) + (r.TokensCacheWrite ?? 0), 0);
            const succeeded = usage.reduce((sum, r) => sum + (r.SucceededRuns ?? 0), 0);
            return {
                TotalRuns: totalRuns,
                TotalCost: totalCost,
                AvgCost: totalCost !== null && priced > 0 ? totalCost / priced : null,
                AvgTokens: totalRuns > 0 ? tokens / totalRuns : 0,
                SuccessRate: totalRuns > 0 ? (succeeded / totalRuns) * 100 : 0,
                CacheHitRate: CacheHitRate({
                    UncachedInputTokens: usage.reduce((sum, r) => sum + (r.TokensPrompt ?? 0), 0),
                    CacheReadTokens: usage.reduce((sum, r) => sum + (r.TokensCacheRead ?? 0), 0),
                    CacheWriteTokens: usage.reduce((sum, r) => sum + (r.TokensCacheWrite ?? 0), 0)
                }),
                CoverageSubtitle: priced + unpriced > 0 ? `covers ${Math.round(ComputeCoveragePercent({ PricedRuns: priced, UnpricedRuns: unpriced }))}% of runs` : undefined,
                AvgLatencySeconds: avgLatencyMs / 1000,
                P95LatencySeconds: p95 / 1000,
                FromSample: false,
                LatencySampleSize: latencies.length
            };
        }

        const total = runs.length;
        if (total === 0) {
            return { TotalRuns: 0, AvgCost: null, AvgTokens: 0, AvgLatencySeconds: 0, SuccessRate: 0, P95LatencySeconds: 0, TotalCost: 0, CacheHitRate: 0, FromSample: true, LatencySampleSize: 0 };
        }
        // Unpriced runs (Cost null) stay out of the cost sum and the average instead of counting as $0.
        const pricedRuns = runs.filter(r => r.Cost !== null && r.Cost !== undefined);
        const totalCost = pricedRuns.length > 0 ? pricedRuns.reduce((sum, r) => sum + (r.Cost as number), 0) : null;
        const totalTokens = runs.reduce((sum, r) => sum + this.TrueTotalTokens(r), 0);
        const successCount = runs.filter(r => r.Success === true).length;
        return {
            TotalRuns: total,
            TotalCost: totalCost,
            AvgCost: totalCost !== null ? totalCost / pricedRuns.length : null,
            AvgTokens: totalTokens / total,
            AvgLatencySeconds: avgLatencyMs / 1000,
            SuccessRate: (successCount / total) * 100,
            P95LatencySeconds: p95 / 1000,
            CacheHitRate: CacheHitRate({
                UncachedInputTokens: this.sumNullable(runs, r => r.TokensPrompt),
                CacheReadTokens: this.sumNullable(runs, r => r.TokensCacheRead),
                CacheWriteTokens: this.sumNullable(runs, r => r.TokensCacheWrite)
            }),
            CoverageSubtitle: `covers ${Math.round((pricedRuns.length / total) * 100)}% of runs`,
            FromSample: true,
            LatencySampleSize: latencies.length
        };
    }

    /**
     * Totals and the chart come from the period aggregates when the range has them (24h / 7d / 30d)
     * and no status filter is set (the aggregates carry no status). Empty aggregates next to a
     * non-empty sample mean the aggregate query failed or is not deployed, so the sample is used.
     */
    private get useAggregates(): boolean {
        return this.usageGrain !== null
            && this._filters.Statuses.length === 0
            && (this.usageRows.length > 0 || this.AllRuns.length === 0);
    }

    /** Period aggregates narrowed by the model / agent / prompt filters (case-insensitive IDs). */
    private filteredUsageRows(): (AIUsageHourlyRow | AIUsageDailyRow)[] {
        const set = (ids: string[]) => ids.length > 0 ? new Set(ids.map(i => i.toLowerCase())) : null;
        const models = set(this._filters.Models);
        const agents = set(this._filters.Agents);
        const prompts = set(this._filters.Prompts);
        const ok = (value: string | null, allowed: Set<string> | null) => allowed === null || (value !== null && allowed.has(value.toLowerCase()));
        return this.usageRows.filter(r => ok(r.ModelID, models) && ok(r.AgentID, agents) && ok(r.PromptID, prompts));
    }

    /** Buckets straight from the aggregates: one per UTC hour (24h) or UTC day (7d/30d). */
    private computeUsageChartBuckets(): ChartBucket[] {
        const rows = this.filteredUsageRows();
        if (rows.length === 0) {
            return [];
        }
        const bucketMs = this.usageGrain === 'hour' ? 3600000 : 86400000;
        const cutoff = this.getTimeRangeCutoff(this._timeRange)!;
        const first = Math.floor(cutoff.getTime() / bucketMs) * bucketMs;
        const now = Date.now();
        const values = new Map<number, { total: number; cacheRead: number; input: number; priced: number; unpriced: number }>();
        for (const r of rows) {
            const raw = 'HourBucket' in r ? r.HourBucket : r.DayBucket;
            const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) || raw.length <= 10 ? raw : raw + 'Z';
            const key = Math.floor(new Date(iso).getTime() / bucketMs) * bucketMs;
            const v = values.get(key) ?? { total: 0, cacheRead: 0, input: 0, priced: 0, unpriced: 0 };
            switch (this.ActiveChartMetric) {
                case 'cost': v.total += r.OwnCost ?? 0; break;
                case 'tokens': v.total += (r.TokensPrompt ?? 0) + (r.TokensCompletion ?? 0) + (r.TokensCacheRead ?? 0) + (r.TokensCacheWrite ?? 0); break;
                default: v.total += r.Runs ?? 0;
            }
            v.cacheRead += r.TokensCacheRead ?? 0;
            v.input += (r.TokensPrompt ?? 0) + (r.TokensCacheRead ?? 0) + (r.TokensCacheWrite ?? 0);
            v.priced += r.PricedRuns ?? 0;
            v.unpriced += r.UnpricedRuns ?? 0;
            values.set(key, v);
        }

        const buckets: { label: string; total: number; start: Date; end: Date }[] = [];
        for (let t = first; t <= now; t += bucketMs) {
            const v = values.get(t);
            let total = v?.total ?? 0;
            if (v && this.ActiveChartMetric === 'cacheHit') {
                total = v.input > 0 ? (v.cacheRead / v.input) * 100 : 0;
            }
            const start = new Date(t);
            const label = this.usageGrain === 'hour'
                ? start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                : start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
            buckets.push({ label, total, start, end: new Date(t + bucketMs) });
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

    private computeChartBuckets(runs: PromptRunRecord[]): ChartBucket[] {
        if (this.useAggregates) {
            return this.computeUsageChartBuckets();
        }
        if (runs.length === 0) return [];

        const bucketCount = this.getBucketCount();
        const cutoff = this.getTimeRangeCutoff(this._timeRange) ?? new Date(runs[runs.length - 1].RunAt);
        const now = new Date();
        const rangeMs = now.getTime() - cutoff.getTime();
        const bucketMs = rangeMs / bucketCount;

        const buckets: { label: string; total: number; cacheRead: number; inputForHit: number; start: Date; end: Date }[] = [];
        for (let i = 0; i < bucketCount; i++) {
            const start = new Date(cutoff.getTime() + i * bucketMs);
            const end = new Date(cutoff.getTime() + (i + 1) * bucketMs);
            buckets.push({
                label: this.formatBucketLabel(start),
                total: 0,
                cacheRead: 0,
                inputForHit: 0,
                start,
                end,
            });
        }

        for (const run of runs) {
            const runTime = new Date(run.RunAt).getTime();
            const idx = Math.min(Math.floor((runTime - cutoff.getTime()) / bucketMs), bucketCount - 1);
            if (idx >= 0 && idx < bucketCount) {
                buckets[idx].total += this.getChartMetricValue(run);
                // Cache hit-rate is a ratio, not a sum — accumulate the components and divide below.
                buckets[idx].cacheRead += run.TokensCacheRead ?? 0;
                buckets[idx].inputForHit += (run.TokensPrompt ?? 0) + (run.TokensCacheRead ?? 0) + (run.TokensCacheWrite ?? 0);
            }
        }

        if (this.ActiveChartMetric === 'cacheHit') {
            for (const b of buckets) {
                b.total = b.inputForHit > 0 ? (b.cacheRead / b.inputForHit) * 100 : 0;
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
            // Date cells (RunAt/CompletedAt arrive as real Dates from simple reads) must sort
            // chronologically — String(Date).localeCompare orders by weekday name.
            if (aVal instanceof Date || bVal instanceof Date) {
                return CompareDateCells(aVal as Date | string, bVal as Date | string) * dir;
            }
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
