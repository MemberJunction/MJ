/**
 * @fileoverview Model Performance Leaderboard.
 *
 * Ranks AI models by configurable metrics (Cost Efficiency, Speed, Reliability, Usage Volume).
 * Data is loaded from MJ: AI Prompt Runs and augmented with model metadata from AIEngineBase.
 */

import {
    Component, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

// ── Interfaces ──

interface PromptRunRecord {
    ID: string;
    RunAt: string;
    CompletedAt: string | null;
    ExecutionTimeMS: number | null;
    Success: boolean;
    Cost: number | null;
    TotalCost: number | null;
    TokensUsed: number | null;
    TokensPrompt: number | null;
    TokensCompletion: number | null;
    ModelID: string | null;
    Model: string | null;
    VendorID: string | null;
    Vendor: string | null;
}

interface ModelLeaderboardRow {
    Rank: number;
    RankClass: string;
    ModelName: string;
    ApiId: string;
    Vendor: string;
    VendorID: string;
    Runs: number;
    AvgLatencyMs: number;
    AvgLatencyColor: string;
    P95LatencyMs: number;
    SuccessRate: number;
    CostPer1KTokens: number;
    TotalCost: number;
}

type SortByOption = 'cost-efficiency' | 'speed' | 'reliability' | 'usage-volume';

const FIELDS = [
    'ID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Success',
    'Cost', 'TotalCost', 'TokensUsed', 'TokensPrompt', 'TokensCompletion',
    'ModelID', 'Model', 'VendorID', 'Vendor'
];

@Component({
    standalone: false,
    selector: 'app-analytics-model-performance',
    template: `
        <!-- Filter Bar -->
        <div class="filter-bar">
            <div class="filter-controls">
                <span class="filter-label">
                    <i class="fa-solid fa-trophy"></i>
                    Leaderboard
                </span>

                <select class="filter-select" [value]="SortBy" (change)="OnSortByChange($event)">
                    @for (opt of SortByOptions; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                    }
                </select>

                <select class="filter-select" [value]="SelectedVendor" (change)="OnVendorChange($event)">
                    <option value="">All Vendors</option>
                    @for (v of VendorOptions; track v.id) {
                        <option [value]="v.id">{{ v.name }}</option>
                    }
                </select>
            </div>

            <div class="time-chips">
                @for (opt of TimeRangeOptions; track opt) {
                    <button
                        class="time-chip"
                        [class.active]="TimeRange === opt"
                        (click)="OnTimeRangeSelect(opt)">
                        {{ opt }}
                    </button>
                }
            </div>
        </div>

        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading model performance..."></mj-loading>
            </div>
        } @else {
            <!-- Leaderboard Table -->
            <div class="leaderboard-panel">
                <div class="table-wrapper">
                    <table class="leaderboard-table">
                        <thead>
                            <tr>
                                <th class="col-rank">Rank</th>
                                <th class="col-model">Model</th>
                                <th class="col-vendor">Vendor</th>
                                <th class="col-numeric">Runs</th>
                                <th class="col-numeric">Avg Latency</th>
                                <th class="col-numeric">P95 Latency</th>
                                <th class="col-numeric">Success Rate</th>
                                <th class="col-numeric">$/1K Tokens</th>
                                <th class="col-numeric">Total Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            @if (Rows.length === 0) {
                                <tr><td colspan="9" class="empty-row">No model data for selected period</td></tr>
                            }
                            @for (row of Rows; track row.ModelName) {
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
                                        <span [style.color]="row.AvgLatencyColor">
                                            {{ FormatLatency(row.AvgLatencyMs) }}
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
                                    <td class="cell-numeric">{{ FormatCurrency(row.CostPer1KTokens, 4) }}</td>
                                    <td class="cell-numeric cell-cost">{{ FormatCurrency(row.TotalCost) }}</td>
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

        /* ── Filter Bar ── */
        .filter-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 12px 16px;
            flex-wrap: wrap;
            margin-bottom: 16px;
        }

        .filter-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .filter-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .filter-label i {
            font-size: 13px;
            color: var(--mj-status-warning);
        }

        .filter-select {
            padding: 5px 10px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
            font-size: 13px;
            cursor: pointer;
            min-width: 130px;
            outline: none;
        }

        .filter-select:focus {
            border-color: var(--mj-border-focus);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
        }

        .time-chips {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: auto;
        }

        .time-chip {
            padding: 5px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 16px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
            white-space: nowrap;
        }

        .time-chip:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .time-chip.active {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
            font-weight: 600;
        }

        /* ── Leaderboard ── */
        .leaderboard-panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            overflow: hidden;
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

        @media (max-width: 768px) {
            .filter-bar {
                flex-direction: column;
                align-items: stretch;
            }

            .time-chips {
                margin-left: 0;
                justify-content: flex-start;
                flex-wrap: wrap;
            }
        }
    `]
})
export class AnalyticsModelPerformanceComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    @Input() TimeRange = '7d';
    @Output() TimeRangeChange = new EventEmitter<string>();

    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    public IsLoading = false;
    public SortBy: SortByOption = 'cost-efficiency';
    public SelectedVendor = '';
    public Rows: ModelLeaderboardRow[] = [];

    public TimeRangeOptions = ['24h', '7d', '30d'];

    public SortByOptions: { value: SortByOption; label: string }[] = [
        { value: 'cost-efficiency', label: 'Cost Efficiency' },
        { value: 'speed', label: 'Speed' },
        { value: 'reliability', label: 'Reliability' },
        { value: 'usage-volume', label: 'Usage Volume' }
    ];

    public VendorOptions: { id: string; name: string }[] = [];

    private allRuns: PromptRunRecord[] = [];

    async ngOnInit(): Promise<void> {
        // AIEngineBase is deferred at startup — make sure it's loaded before
        // we read .Vendors / .Models from it.
        await AIEngineBase.Instance.EnsureLoaded();
        this.loadVendorOptions();
        this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Public Handlers ──

    public OnTimeRangeSelect(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
        this.LoadData();
    }

    public OnSortByChange(event: Event): void {
        this.SortBy = (event.target as HTMLSelectElement).value as SortByOption;
        this.buildRows();
        this.cdr.detectChanges();
    }

    public OnVendorChange(event: Event): void {
        this.SelectedVendor = (event.target as HTMLSelectElement).value;
        this.buildRows();
        this.cdr.detectChanges();
    }

    public FormatLatency(ms: number): string {
        if (ms < 1000) return Math.round(ms) + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    }

    public FormatCurrency(value: number, decimals = 2): string {
        if (value === 0) return '$0.00';
        if (value < 0.01 && decimals < 4) decimals = 4;
        return '$' + value.toFixed(decimals);
    }

    // ── Data Loading ──

    private loadVendorOptions(): void {
        try {
            this.VendorOptions = AIEngineBase.Instance.Vendors.map(v => ({
                id: v.ID,
                name: v.Name
            }));
        } catch {
            this.VendorOptions = [];
        }
    }

    private async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const dateFilter = this.buildDateFilter();

            const result = await rv.RunView<PromptRunRecord>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: dateFilter,
                Fields: FIELDS,
                OrderBy: 'RunAt DESC',
                ResultType: 'simple'
            });

            this.allRuns = (result?.Results ?? []) as PromptRunRecord[];
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
        // Filter by vendor if needed
        let runs = this.allRuns;
        if (this.SelectedVendor) {
            runs = runs.filter(r => r.VendorID === this.SelectedVendor);
        }

        // Group by model
        const groups = new Map<string, PromptRunRecord[]>();
        for (const run of runs) {
            const key = run.ModelID ?? 'unknown';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(run);
        }

        // Compute metrics per model
        const modelRows: ModelLeaderboardRow[] = [];
        for (const [modelId, modelRuns] of groups) {
            const row = this.computeModelMetrics(modelId, modelRuns);
            modelRows.push(row);
        }

        // Sort by chosen metric
        this.sortRows(modelRows);

        // Assign ranks
        modelRows.forEach((row, i) => {
            row.Rank = i + 1;
            row.RankClass = this.getRankClass(i + 1);
        });

        this.Rows = modelRows;
    }

    private computeModelMetrics(modelId: string, runs: PromptRunRecord[]): ModelLeaderboardRow {
        const totalRuns = runs.length;
        const successCount = runs.filter(r => r.Success).length;
        const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;

        const latencies = runs
            .filter(r => r.ExecutionTimeMS != null && r.ExecutionTimeMS > 0)
            .map(r => r.ExecutionTimeMS!);

        const avgLatency = latencies.length > 0
            ? latencies.reduce((s, l) => s + l, 0) / latencies.length
            : 0;

        const p95Latency = this.computePercentile(latencies, 0.95);

        const totalTokens = runs.reduce((s, r) => s + (r.TokensUsed ?? 0), 0);
        const totalCost = runs.reduce((s, r) => s + (r.Cost ?? r.TotalCost ?? 0), 0);
        const costPer1K = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0;

        const firstName = runs.find(r => r.Model != null);
        const firstVendor = runs.find(r => r.Vendor != null);

        // Look up model API name from engine
        let apiId = '';
        try {
            const model = AIEngineBase.Instance.Models.find(m => UUIDsEqual(m.ID, modelId));
            apiId = model?.APIName ?? '';
        } catch {
            // engine might not be ready
        }

        return {
            Rank: 0,
            RankClass: 'rank-neutral',
            ModelName: firstName?.Model ?? 'Unknown',
            ApiId: apiId,
            Vendor: firstVendor?.Vendor ?? 'Unknown',
            VendorID: firstVendor?.VendorID ?? '',
            Runs: totalRuns,
            AvgLatencyMs: avgLatency,
            AvgLatencyColor: this.getLatencyColor(avgLatency),
            P95LatencyMs: p95Latency,
            SuccessRate: successRate,
            CostPer1KTokens: costPer1K,
            TotalCost: totalCost
        };
    }

    private sortRows(rows: ModelLeaderboardRow[]): void {
        switch (this.SortBy) {
            case 'cost-efficiency':
                rows.sort((a, b) => a.CostPer1KTokens - b.CostPer1KTokens);
                break;
            case 'speed':
                rows.sort((a, b) => a.AvgLatencyMs - b.AvgLatencyMs);
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

    private computePercentile(sortedValues: number[], percentile: number): number {
        if (sortedValues.length === 0) return 0;
        const sorted = [...sortedValues].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * percentile) - 1;
        return sorted[Math.max(0, idx)];
    }

    private getRankClass(rank: number): string {
        if (rank === 1) return 'rank-badge rank-gold';
        if (rank === 2) return 'rank-badge rank-silver';
        if (rank === 3) return 'rank-badge rank-bronze';
        return 'rank-badge rank-neutral';
    }

    private getLatencyColor(ms: number): string {
        if (ms < 1000) return 'var(--mj-status-success)';
        if (ms < 3000) return 'var(--mj-status-warning)';
        return 'var(--mj-status-error)';
    }

    private buildDateFilter(): string {
        const now = new Date();
        const msMap: Record<string, number> = {
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };
        const ms = msMap[this.TimeRange] ?? 604800000;
        const start = new Date(now.getTime() - ms);
        return `RunAt >= '${start.toISOString()}'`;
    }
}

export function LoadAnalyticsModelPerformance() { /* tree-shaking prevention */ }
