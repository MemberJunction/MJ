/**
 * @fileoverview Model Performance Leaderboard.
 *
 * Ranks AI models by configurable metrics (Cost Efficiency, Speed, Reliability, Usage Volume).
 * Runs, success, tokens and cost come from the AIUsageHourly aggregate and latency percentiles
 * from AIUsageByModel, so every run in range counts; model and vendor names come from AIEngineBase.
 */

import {
    Component, ChangeDetectionStrategy, Input,
    OnInit, OnDestroy,
    ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { AIUsageByModelRow, AIUsageHourlyRow } from '../../../services/ai-usage-analytics.types';
import { ComputeModelLeaderboard, CurrencyAmount, ModelUsageStats, SumRuns } from '../../../services/ai-usage-analytics.compute';

// ── Interfaces ──

interface ModelLeaderboardRow {
    Rank: number;
    ModelID: string;
    ModelName: string;
    ApiId: string;
    Vendor: string;
    VendorID: string;
    Runs: number;
    /** Median latency in ms; null when the range has no latency for this model. */
    P50LatencyMs: number | null;
    P50LatencyColor: string;
    P95LatencyMs: number | null;
    SuccessRate: number;
    /** Null when no run in this group could be priced — never 0, which would read as free. */
    CostPer1KTokens: number | null;
    /** The currency CostPer1KTokens is in (the model's primary one); null when unpriced. */
    CostCurrency: string | null;
    CacheHitRate: number;
    /** Own cost, one figure per currency (never summed across currencies). Empty when nothing was priced. */
    Costs: CurrencyAmount[];
    /** Runs that could not be priced: unpriceable, not free. Surfaced so a total is never read as complete. */
    UnpricedRuns: number;
    RankClass: string;
}

type SortByOption = 'cost-efficiency' | 'speed' | 'reliability' | 'usage-volume';

/** How far back each time-range option reaches, in milliseconds. */
const RANGE_MS: Record<string, number> = {
    '24h': 86400000,
    '7d': 7 * 86400000,
    '30d': 30 * 86400000,
};

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-analytics-model-performance',
    template: `
        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading model performance..."></mj-loading>
            </div>
        } @else {
            <!-- Leaderboard Table -->
            <div class="leaderboard-panel">
                <div class="panel-header">
                    <div class="panel-header__title">
                        <i class="fa-solid fa-trophy panel-header__icon"></i>
                        Model Performance Leaderboard
                    </div>
                    <span class="panel-header__subtitle">{{ TotalRuns | number }} runs in range</span>
                </div>
                <div class="table-wrapper">
                    <table class="leaderboard-table">
                        <thead>
                            <tr>
                                <th class="col-rank">Rank</th>
                                <th class="col-model">Model</th>
                                <th class="col-vendor">Vendor</th>
                                <th class="col-numeric">Runs</th>
                                <th class="col-numeric" title="Median latency per model">P50 Latency</th>
                                <th class="col-numeric">P95 Latency</th>
                                <th class="col-numeric">Success Rate</th>
                                <th class="col-numeric" title="Share of input tokens served from the provider's prompt cache">Cache Hit</th>
                                <th class="col-numeric" title="Cost per 1K tokens processed, including cached tokens (effective rate)">$/1K Tokens</th>
                                <th class="col-numeric">Total Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            @if (Rows.length === 0) {
                                <tr><td colspan="10" class="empty-row"><mj-empty-state Variant="no-results" Size="compact" Title="No model data" Message="No model activity in the selected period."></mj-empty-state></td></tr>
                            }
                            @for (row of Rows; track row.ModelID) {
                                <tr>
                                    <td>
                                        <span class="rank-badge" [class]="row.RankClass">
                                            {{ row.Rank }}
                                        </span>
                                    </td>
                                    <td class="cell-model">
                                        <div class="model-name">{{ row.ModelName }}</div>
                                        @if (row.ApiId && row.ApiId !== row.ModelName) {
                                            <div class="model-api-id">{{ row.ApiId }}</div>
                                        }
                                    </td>
                                    <td class="cell-vendor">{{ row.Vendor }}</td>
                                    <td class="cell-numeric">{{ row.Runs | number }}</td>
                                    <td class="cell-numeric">
                                        <span [style.color]="row.P50LatencyColor">
                                            {{ FormatLatency(row.P50LatencyMs) }}
                                        </span>
                                    </td>
                                    <td class="cell-numeric">{{ FormatLatency(row.P95LatencyMs) }}</td>
                                    <td class="cell-numeric">
                                        <div class="success-rate-cell">
                                            <span class="success-rate-value">{{ row.SuccessRate | number:'1.1-1' }}%</span>
                                            <div class="success-bar-bg">
                                                <div class="success-bar-fill" [style.width.%]="row.SuccessRate"></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="cell-numeric">{{ row.CacheHitRate > 0 ? ((row.CacheHitRate * 100 | number:'1.0-0') + '%') : '—' }}</td>
                                    <td class="cell-numeric">{{ FormatCurrency(row.CostPer1KTokens, 4, row.CostCurrency) }}</td>
                                    <td class="cell-numeric cell-cost">
                                        @if (row.Costs.length === 0) {
                                            {{ FormatCurrency(null) }}
                                        }
                                        @for (cost of row.Costs; track cost.Currency) {
                                            <div class="cost-line">{{ FormatCurrency(cost.Amount, 2, cost.Currency) }}</div>
                                        }
                                        @if (row.UnpricedRuns > 0) {<span class="cell-unpriced" [title]="row.UnpricedRuns + ' run(s) could not be priced'">({{ row.UnpricedRuns | number }} unpriced)</span>}
                                    </td>
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

        /* ── Leaderboard ── */
        .leaderboard-panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
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

        .table-wrapper {
            overflow-x: auto;
        }

        .leaderboard-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .leaderboard-table th,
        .leaderboard-table td {
            padding: 12px 14px;
            text-align: left;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .leaderboard-table th {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            background: var(--mj-bg-surface-card);
            position: sticky;
            top: 0;
            white-space: nowrap;
        }

        .col-rank { width: 60px; text-align: center; }
        .col-model { min-width: 180px; }
        .col-vendor { min-width: 100px; }
        .col-numeric { text-align: right; white-space: nowrap; }

        .leaderboard-table tbody tr {
            transition: background 0.15s;
        }

        .leaderboard-table tbody tr:hover {
            background: var(--mj-bg-surface-hover);
        }

        .empty-row {
            text-align: center;
            color: var(--mj-text-disabled);
            padding: 32px;
        }

        /* ── Rank Badge ── */
        .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            font-size: 12px;
            font-weight: 700;
        }

        .rank-gold {
            background: linear-gradient(135deg, color-mix(in srgb, var(--mj-status-warning) 35%, var(--mj-bg-surface)), color-mix(in srgb, var(--mj-status-warning) 20%, var(--mj-bg-surface)));
            color: var(--mj-status-warning-text, var(--mj-status-warning));
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-status-warning) 30%, transparent);
        }

        .rank-silver {
            background: color-mix(in srgb, var(--mj-text-muted) 18%, var(--mj-bg-surface));
            color: var(--mj-text-secondary);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-text-muted) 20%, transparent);
        }

        .rank-bronze {
            background: color-mix(in srgb, var(--mj-status-warning) 18%, var(--mj-bg-surface));
            color: var(--mj-text-secondary);
        }

        .rank-neutral {
            background: var(--mj-bg-surface-sunken);
            color: var(--mj-text-muted);
        }

        /* ── Model Cell ── */
        .cell-model {
            font-weight: 500;
            color: var(--mj-text-primary);
        }

        .model-name {
            font-weight: 600;
        }

        .model-api-id {
            font-size: 11px;
            color: var(--mj-text-muted);
            margin-top: 2px;
            font-family: monospace;
        }

        .cell-vendor {
            color: var(--mj-text-secondary);
        }

        .cell-numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
            color: var(--mj-text-secondary);
        }

        .cell-cost {
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .cell-unpriced {
            display: block;
            font-weight: 400;
            font-size: 0.85em;
            color: var(--mj-text-muted);
        }

        .cost-line {
            white-space: nowrap;
        }

        /* ── Success Rate Mini Bar ── */
        .success-rate-cell {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 3px;
        }

        .success-rate-value {
            font-weight: 600;
        }

        .success-bar-bg {
            width: 60px;
            height: 4px;
            background: var(--mj-bg-surface-sunken);
            border-radius: 2px;
            overflow: hidden;
        }

        .success-bar-fill {
            height: 100%;
            background: var(--mj-status-success);
            border-radius: 2px;
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* ── Responsive ── */
        @media (max-width: 1200px) {
            .leaderboard-table th,
            .leaderboard-table td {
                padding: 10px 10px;
            }
        }

    `]
})
export class AnalyticsModelPerformanceComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.loadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private _sortBy: SortByOption = 'cost-efficiency';
    @Input()
    set SortBy(value: SortByOption | string) {
        const prev = this._sortBy;
        this._sortBy = (value || 'cost-efficiency') as SortByOption;
        if (prev !== this._sortBy && this.initialized) {
            this.buildRows();
            this.cdr.markForCheck();
        }
    }
    get SortBy(): SortByOption { return this._sortBy; }

    private _selectedVendor = '';
    @Input()
    set SelectedVendor(value: string) {
        const prev = this._selectedVendor;
        this._selectedVendor = value ?? '';
        if (prev !== this._selectedVendor && this.initialized) {
            this.buildRows();
            this.cdr.markForCheck();
        }
    }
    get SelectedVendor(): string { return this._selectedVendor; }

    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();
    private initialized = false;

    private instrumentation = inject(AIInstrumentationService);

    public IsLoading = false;
    public Rows: ModelLeaderboardRow[] = [];

    /** Every run in range (from the hourly aggregate), across all vendors. */
    public TotalRuns = 0;
    private hourlyRows: AIUsageHourlyRow[] = [];
    private byModelRows: AIUsageByModelRow[] = [];

    async ngOnInit(): Promise<void> {
        // AIEngineBase is deferred at startup — make sure it's loaded before
        // we read .Vendors / .Models from it.
        await AIEngineBase.Instance.EnsureLoaded();
        this.initialized = true;
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    public FormatLatency(ms: number | null): string {
        if (ms == null) return '—';
        if (ms < 1000) return Math.round(ms) + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    }

    public FormatCurrency(value: number | null, decimals = 2, currency: string | null = 'USD'): string {
        // Unpriced is not free — an em dash, never $0.00.
        if (value == null) return '—';
        if (value !== 0 && value < 0.01 && decimals < 4) decimals = 4;
        const code = currency ?? 'USD';
        try {
            return new Intl.NumberFormat(undefined, {
                style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals
            }).format(value);
        } catch {
            // An unrecognized code still shows the amount, with the code beside it.
            return `${value.toFixed(decimals)} ${code}`;
        }
    }

    // ── Data Loading ──

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            this.instrumentation.Provider = this.ProviderToUse;
            const end = new Date();
            const start = new Date(end.getTime() - (RANGE_MS[this.TimeRange] ?? RANGE_MS['7d']));
            const [hourly, byModel] = await Promise.all([
                this.instrumentation.GetUsageHourly(start, end),
                this.instrumentation.GetUsageByModel(start, end),
            ]);
            this.hourlyRows = hourly;
            this.byModelRows = byModel;
            this.TotalRuns = SumRuns(hourly);
            this.buildRows();
        } catch (e) {
            console.error('Model Performance load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ── Row Building ──

    private buildRows(): void {
        const stats = ComputeModelLeaderboard(this.hourlyRows, this.byModelRows, this.SelectedVendor || null);
        const modelRows = stats.map(s => this.toLeaderboardRow(s));

        // Sort by chosen metric
        this.sortRows(modelRows);

        // Assign ranks
        modelRows.forEach((row, i) => {
            row.Rank = i + 1;
            row.RankClass = this.getRankClass(i + 1);
        });

        this.Rows = modelRows;
    }

    private toLeaderboardRow(stats: ModelUsageStats): ModelLeaderboardRow {
        let modelName = 'Unknown';
        let apiId = '';
        let vendorName = 'Unknown';
        try {
            const model = AIEngineBase.Instance.Models.find(m => UUIDsEqual(m.ID, stats.ModelID));
            modelName = model?.Name ?? modelName;
            apiId = model?.APIName ?? '';
            const vendor = AIEngineBase.Instance.Vendors.find(v => UUIDsEqual(v.ID, stats.VendorID));
            vendorName = vendor?.Name ?? vendorName;
        } catch {
            // engine might not be ready
        }

        return {
            Rank: 0,
            RankClass: 'rank-neutral',
            ModelID: stats.ModelID,
            ModelName: modelName,
            ApiId: apiId,
            Vendor: vendorName,
            VendorID: stats.VendorID,
            Runs: stats.Runs,
            P50LatencyMs: stats.LatencyP50,
            P50LatencyColor: this.getLatencyColor(stats.LatencyP50),
            P95LatencyMs: stats.LatencyP95,
            SuccessRate: stats.SuccessRate,
            CostPer1KTokens: stats.CostPer1KTokens,
            CostCurrency: stats.CostCurrency,
            CacheHitRate: stats.CacheHitRate,
            Costs: stats.Costs,
            UnpricedRuns: stats.UnpricedRuns
        };
    }

    private sortRows(rows: ModelLeaderboardRow[]): void {
        switch (this.SortBy) {
            case 'cost-efficiency':
                // Unpriced rows sort last rather than masquerading as the cheapest.
                rows.sort((a, b) => (a.CostPer1KTokens ?? Number.POSITIVE_INFINITY) - (b.CostPer1KTokens ?? Number.POSITIVE_INFINITY));
                break;
            case 'speed':
                // Models without a latency figure sort last rather than as the fastest.
                rows.sort((a, b) => (a.P50LatencyMs ?? Number.POSITIVE_INFINITY) - (b.P50LatencyMs ?? Number.POSITIVE_INFINITY));
                break;
            case 'reliability':
                rows.sort((a, b) => b.SuccessRate - a.SuccessRate);
                break;
            case 'usage-volume':
                rows.sort((a, b) => b.Runs - a.Runs);
                break;
        }
    }

    // ── Helpers ──

    private getRankClass(rank: number): string {
        if (rank === 1) return 'rank-badge rank-gold';
        if (rank === 2) return 'rank-badge rank-silver';
        if (rank === 3) return 'rank-badge rank-bronze';
        return 'rank-badge rank-neutral';
    }

    private getLatencyColor(ms: number | null): string {
        if (ms == null) return 'var(--mj-text-muted)';
        if (ms < 1000) return 'var(--mj-status-success)';
        if (ms < 3000) return 'var(--mj-status-warning)';
        return 'var(--mj-status-error)';
    }
}

export function LoadAnalyticsModelPerformance() { /* tree-shaking prevention */ }
