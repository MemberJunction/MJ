/**
 * @fileoverview Cost & Budget Analytics -- Option B.
 *
 * Displays cost KPIs with period deltas, a daily cost bar chart with anomaly detection,
 * a cost breakdown treemap, and a detailed cost-by-model table with CSV export.
 */

import {
    Component, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';

// ── Interfaces ──

interface PromptRunRecord {
    ID: string;
    RunAt: string;
    Cost: number | null;
    TotalCost: number | null;
    TokensPrompt: number | null;
    TokensCompletion: number | null;
    TokensUsed: number | null;
    ModelID: string | null;
    Model: string | null;
    VendorID: string | null;
    Vendor: string | null;
    Success: boolean;
}

interface CostKpi {
    Label: string;
    Value: string;
    Delta: number | null;
    DeltaDirection: 'up' | 'down' | 'stable';
    Highlighted: boolean;
    Icon: string;
}

interface DailyBar {
    Date: string;
    Label: string;
    Cost: number;
    HeightPercent: number;
    IsAnomaly: boolean;
}

interface TreemapCell {
    Label: string;
    Cost: number;
    Percent: number;
    Color: string;
    GridArea: string;
}

interface CostByModelRow {
    Model: string;
    Vendor: string;
    Runs: number;
    InputTokens: number;
    OutputTokens: number;
    InputCost: number;
    OutputCost: number;
    TotalCost: number;
    PercentOfTotal: number;
}

const FIELDS = [
    'ID', 'RunAt', 'Cost', 'TotalCost', 'TokensPrompt', 'TokensCompletion',
    'TokensUsed', 'ModelID', 'Model', 'VendorID', 'Vendor', 'Success'
];

const TIME_RANGE_OPTIONS = ['Today', '7d', '30d', 'MTD'];

const TREEMAP_COLORS = [
    'var(--mj-brand-primary)',
    'var(--mj-brand-accent, var(--mj-brand-primary-hover))',
    'var(--mj-status-info)',
    'var(--mj-status-success)',
    'var(--mj-status-warning)',
    'var(--mj-text-disabled)'
];

@Component({
    standalone: false,
    selector: 'app-analytics-cost-budget',
    template: `
        <!-- Filter Bar -->
        <app-analytics-filter-bar
            [TimeRange]="TimeRange"
            [TimeRangeOptions]="TimeRangeOptionsList"
            [Filters]="Filters"
            [ShowAgentFilter]="false"
            [ShowPromptFilter]="false"
            [ShowModelFilter]="true"
            [ShowStatusFilter]="false"
            [ShowCompareToggle]="false"
            [ShowExportButton]="false"
            (TimeRangeChange)="OnTimeRangeChange($event)"
            (FiltersChange)="OnFiltersChange($event)"
        ></app-analytics-filter-bar>

        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading cost data..."></mj-loading>
            </div>
        } @else {
            <!-- Cost KPI Row -->
            <div class="kpi-row">
                @for (kpi of CostKpis; track kpi.Label) {
                    <div class="kpi-card" [class.kpi-card--highlighted]="kpi.Highlighted">
                        <div class="kpi-icon">
                            <i [class]="kpi.Icon"></i>
                        </div>
                        <div class="kpi-content">
                            <div class="kpi-label">{{ kpi.Label }}</div>
                            <div class="kpi-value">{{ kpi.Value }}</div>
                            @if (kpi.Delta != null) {
                                <div class="kpi-delta"
                                     [class.kpi-delta--up]="kpi.DeltaDirection === 'up'"
                                     [class.kpi-delta--down]="kpi.DeltaDirection === 'down'">
                                    @if (kpi.DeltaDirection === 'up') {
                                        <i class="fa-solid fa-arrow-up"></i>
                                    } @else if (kpi.DeltaDirection === 'down') {
                                        <i class="fa-solid fa-arrow-down"></i>
                                    }
                                    {{ kpi.Delta | number:'1.1-1' }}% vs prev
                                </div>
                            }
                        </div>
                    </div>
                }
            </div>

            <!-- Two-Column Layout -->
            <div class="two-col">
                <!-- Daily Cost Trend -->
                <div class="panel panel-chart">
                    <div class="panel-header">
                        <div class="panel-header__title">
                            <i class="fa-solid fa-chart-column panel-header__icon"></i>
                            Daily Cost Trend
                        </div>
                    </div>
                    <div class="chart-body">
                        @if (DailyBars.length === 0) {
                            <div class="panel-empty">No cost data for selected period</div>
                        } @else {
                            <div class="bar-chart">
                                <div class="bar-chart-area">
                                    @if (AvgLinePercent > 0) {
                                        <div class="avg-line" [style.bottom.%]="AvgLinePercent">
                                            <span class="avg-label">avg</span>
                                        </div>
                                    }
                                    @for (bar of DailyBars; track bar.Date) {
                                        <div class="bar-col" [title]="bar.Label + ': ' + FormatCurrency(bar.Cost)">
                                            <div
                                                class="bar"
                                                [class.bar--anomaly]="bar.IsAnomaly"
                                                [style.height.%]="bar.HeightPercent"
                                            ></div>
                                            <div class="bar-label">{{ bar.Label }}</div>
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                </div>

                <!-- Cost Breakdown Treemap -->
                <div class="panel panel-treemap">
                    <div class="panel-header">
                        <div class="panel-header__title">
                            <i class="fa-solid fa-chart-pie panel-header__icon"></i>
                            Cost by Vendor
                        </div>
                    </div>
                    <div class="treemap-body">
                        @if (TreemapCells.length === 0) {
                            <div class="panel-empty">No vendor cost data</div>
                        } @else {
                            <div class="treemap-grid">
                                @for (cell of TreemapCells; track cell.Label) {
                                    <div
                                        class="treemap-cell"
                                        [style.background]="cell.Color"
                                        [style.flex-basis.%]="cell.Percent"
                                        [title]="cell.Label + ': ' + FormatCurrency(cell.Cost) + ' (' + (cell.Percent | number:'1.0-0') + '%)'">
                                        <span class="treemap-label">{{ cell.Label }}</span>
                                        <span class="treemap-value">{{ FormatCurrency(cell.Cost) }}</span>
                                        <span class="treemap-pct">{{ cell.Percent | number:'1.0-0' }}%</span>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                </div>
            </div>

            <!-- Cost by Model Table -->
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-header__title">
                        <i class="fa-solid fa-table panel-header__icon"></i>
                        Cost by Model
                    </div>
                    <button class="export-btn" (click)="ExportCSV()">
                        <i class="fa-solid fa-download"></i>
                        Export CSV
                    </button>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Model</th>
                                <th>Vendor</th>
                                <th class="col-numeric">Runs</th>
                                <th class="col-numeric">Input Tokens</th>
                                <th class="col-numeric">Output Tokens</th>
                                <th class="col-numeric">Input Cost</th>
                                <th class="col-numeric">Output Cost</th>
                                <th class="col-numeric">Total Cost</th>
                                <th class="col-numeric">% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            @if (CostByModelRows.length === 0) {
                                <tr><td colspan="9" class="empty-row">No data available</td></tr>
                            }
                            @for (row of CostByModelRows; track row.Model) {
                                <tr>
                                    <td class="cell-model">{{ row.Model }}</td>
                                    <td class="cell-vendor">{{ row.Vendor }}</td>
                                    <td class="cell-numeric">{{ row.Runs | number }}</td>
                                    <td class="cell-numeric">{{ row.InputTokens | number }}</td>
                                    <td class="cell-numeric">{{ row.OutputTokens | number }}</td>
                                    <td class="cell-numeric">{{ FormatCurrency(row.InputCost, 4) }}</td>
                                    <td class="cell-numeric">{{ FormatCurrency(row.OutputCost, 4) }}</td>
                                    <td class="cell-numeric cell-cost">{{ FormatCurrency(row.TotalCost) }}</td>
                                    <td class="cell-numeric">{{ row.PercentOfTotal | number:'1.1-1' }}%</td>
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

        /* ── KPI Row ── */
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin: 16px 0;
        }

        .kpi-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 16px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
        }

        .kpi-card--highlighted {
            border-color: var(--mj-brand-primary);
            background: color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface));
        }

        .kpi-icon {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            font-size: 14px;
            flex-shrink: 0;
        }

        .kpi-card--highlighted .kpi-icon {
            background: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface));
        }

        .kpi-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .kpi-value {
            font-size: 22px;
            font-weight: 700;
            color: var(--mj-text-primary);
            margin: 2px 0;
            letter-spacing: -0.02em;
        }

        .kpi-delta {
            font-size: 11px;
            color: var(--mj-text-muted);
            display: flex;
            align-items: center;
            gap: 3px;
        }

        .kpi-delta--up {
            color: var(--mj-status-error);
        }

        .kpi-delta--down {
            color: var(--mj-status-success);
        }

        /* ── Two-Column Layout ── */
        .two-col {
            display: grid;
            grid-template-columns: 3fr 2fr;
            gap: 16px;
            margin-bottom: 16px;
        }

        /* ── Panel ── */
        .panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 16px;
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

        .panel-empty {
            text-align: center;
            padding: 32px;
            color: var(--mj-text-disabled);
            font-size: 13px;
        }

        .export-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }

        .export-btn:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        /* ── Bar Chart ── */
        .chart-body {
            padding: 16px 18px;
        }

        .bar-chart {
            width: 100%;
        }

        .bar-chart-area {
            display: flex;
            align-items: flex-end;
            gap: 4px;
            height: 180px;
            position: relative;
            padding-bottom: 24px;
        }

        .bar-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 100%;
            justify-content: flex-end;
        }

        .bar {
            width: 100%;
            max-width: 32px;
            border-radius: 4px 4px 0 0;
            background: var(--mj-brand-primary);
            transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            min-height: 2px;
        }

        .bar--anomaly {
            background: var(--mj-status-error);
        }

        .bar-label {
            font-size: 10px;
            color: var(--mj-text-muted);
            margin-top: 4px;
            white-space: nowrap;
        }

        .avg-line {
            position: absolute;
            left: 0;
            right: 0;
            border-top: 2px dashed var(--mj-text-disabled);
            z-index: 1;
            pointer-events: none;
        }

        .avg-label {
            position: absolute;
            right: 0;
            top: -14px;
            font-size: 10px;
            color: var(--mj-text-disabled);
            font-weight: 600;
        }

        /* ── Treemap ── */
        .treemap-body {
            padding: 16px 18px;
        }

        .treemap-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            min-height: 160px;
        }

        .treemap-cell {
            border-radius: 8px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 80px;
            min-height: 70px;
            flex-grow: 1;
            color: var(--mj-text-inverse, white);
            transition: opacity 0.2s;
        }

        .treemap-cell:hover {
            opacity: 0.85;
        }

        .treemap-label {
            font-size: 12px;
            font-weight: 600;
            opacity: 0.95;
        }

        .treemap-value {
            font-size: 16px;
            font-weight: 700;
            margin-top: 2px;
        }

        .treemap-pct {
            font-size: 11px;
            opacity: 0.8;
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
            white-space: nowrap;
        }

        .col-numeric { text-align: right; }

        .data-table tbody tr {
            transition: background 0.15s;
        }

        .data-table tbody tr:hover {
            background: var(--mj-bg-surface-hover);
        }

        .cell-model {
            font-weight: 500;
            color: var(--mj-text-primary);
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

        .empty-row {
            text-align: center;
            color: var(--mj-text-disabled);
            padding: 24px;
        }

        /* ── Responsive ── */
        @media (max-width: 1200px) {
            .two-col {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 768px) {
            .kpi-row {
                grid-template-columns: repeat(2, 1fr);
            }

            .kpi-value {
                font-size: 18px;
            }
        }
    `]
})
export class AnalyticsCostBudgetComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    @Input() TimeRange = '7d';
    @Input() Filters: GlobalFilterState = { Models: [], Agents: [], Prompts: [], Statuses: [] };

    @Output() TimeRangeChange = new EventEmitter<string>();
    @Output() FiltersChange = new EventEmitter<GlobalFilterState>();

    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    public IsLoading = false;
    public TimeRangeOptionsList = TIME_RANGE_OPTIONS;

    public CostKpis: CostKpi[] = [];
    public DailyBars: DailyBar[] = [];
    public AvgLinePercent = 0;
    public TreemapCells: TreemapCell[] = [];
    public CostByModelRows: CostByModelRow[] = [];

    private allRuns: PromptRunRecord[] = [];
    private previousPeriodRuns: PromptRunRecord[] = [];

    ngOnInit(): void {
        this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Public Handlers ──

    public OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
        this.LoadData();
    }

    public OnFiltersChange(filters: GlobalFilterState): void {
        this.Filters = filters;
        this.FiltersChange.emit(filters);
        this.LoadData();
    }

    public FormatCurrency(value: number, decimals = 2): string {
        if (value === 0) return '$0.00';
        if (value < 0.01 && decimals < 4) decimals = 4;
        return '$' + value.toFixed(decimals);
    }

    public ExportCSV(): void {
        const header = 'Model,Vendor,Runs,Input Tokens,Output Tokens,Input Cost,Output Cost,Total Cost,% of Total';
        const rows = this.CostByModelRows.map(r =>
            `"${r.Model}","${r.Vendor}",${r.Runs},${r.InputTokens},${r.OutputTokens},${r.InputCost.toFixed(6)},${r.OutputCost.toFixed(6)},${r.TotalCost.toFixed(6)},${r.PercentOfTotal.toFixed(1)}`
        );
        const csv = [header, ...rows].join('\n');
        this.downloadCSV(csv, 'cost-by-model.csv');
    }

    // ── Data Loading ──

    private async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const { currentStart, previousStart } = this.getDateBounds();
            const now = new Date();
            const modelFilter = this.buildModelFilter();
            const currentFilter = this.combineDateAndModelFilter(currentStart, now, modelFilter);
            const prevFilter = this.combineDateAndModelFilter(previousStart, currentStart, modelFilter);

            const [currentResult, prevResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: currentFilter,
                    Fields: FIELDS,
                    OrderBy: 'RunAt ASC',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: prevFilter,
                    Fields: FIELDS,
                    OrderBy: 'RunAt ASC',
                    ResultType: 'simple'
                }
            ]);

            this.allRuns = (currentResult?.Results ?? []) as PromptRunRecord[];
            this.previousPeriodRuns = (prevResult?.Results ?? []) as PromptRunRecord[];

            this.computeKpis();
            this.computeDailyBars();
            this.computeTreemap();
            this.computeCostByModel();
        } catch (e) {
            console.error('Cost & Budget load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ── Computations ──

    private computeKpis(): void {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const todaySpend = this.sumCostInRange(this.allRuns, todayStart, now);
        const weekSpend = this.sumCostInRange(this.allRuns, weekStart, now);
        const monthSpend = this.sumCostInRange(this.allRuns, monthStart, now);

        const prevTotalCost = this.previousPeriodRuns.reduce((s, r) => s + (r.Cost ?? r.TotalCost ?? 0), 0);
        const currentTotalCost = this.allRuns.reduce((s, r) => s + (r.Cost ?? r.TotalCost ?? 0), 0);

        // Project monthly cost based on current daily average
        const daysIntoMonth = Math.max(1, now.getDate());
        const projectedMonthly = (monthSpend / daysIntoMonth) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        const delta = prevTotalCost > 0 ? ((currentTotalCost - prevTotalCost) / prevTotalCost) * 100 : null;

        this.CostKpis = [
            {
                Label: "Today's Spend",
                Value: this.FormatCurrency(todaySpend),
                Delta: null,
                DeltaDirection: 'stable',
                Highlighted: false,
                Icon: 'fa-solid fa-calendar-day'
            },
            {
                Label: 'This Week',
                Value: this.FormatCurrency(weekSpend),
                Delta: null,
                DeltaDirection: 'stable',
                Highlighted: false,
                Icon: 'fa-solid fa-calendar-week'
            },
            {
                Label: 'This Month',
                Value: this.FormatCurrency(monthSpend),
                Delta: delta,
                DeltaDirection: delta != null ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable') : 'stable',
                Highlighted: false,
                Icon: 'fa-solid fa-calendar'
            },
            {
                Label: 'Projected Monthly',
                Value: this.FormatCurrency(projectedMonthly),
                Delta: null,
                DeltaDirection: 'stable',
                Highlighted: true,
                Icon: 'fa-solid fa-chart-line'
            }
        ];
    }

    private computeDailyBars(): void {
        const buckets = new Map<string, number>();
        for (const run of this.allRuns) {
            const date = new Date(run.RunAt);
            const key = date.toISOString().slice(0, 10);
            buckets.set(key, (buckets.get(key) ?? 0) + (run.Cost ?? run.TotalCost ?? 0));
        }

        const sortedKeys = Array.from(buckets.keys()).sort();
        const values = sortedKeys.map(k => buckets.get(k) ?? 0);
        const maxVal = Math.max(...values, 0.001);

        // Anomaly detection: > 2 standard deviations from mean
        const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
        const variance = values.length > 1
            ? values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
            : 0;
        const stdDev = Math.sqrt(variance);
        const anomalyThreshold = mean + 2 * stdDev;

        this.DailyBars = sortedKeys.map((key, i) => ({
            Date: key,
            Label: this.formatBarLabel(key),
            Cost: values[i],
            HeightPercent: maxVal > 0 ? (values[i] / maxVal) * 100 : 0,
            IsAnomaly: stdDev > 0 && values[i] > anomalyThreshold
        }));

        this.AvgLinePercent = maxVal > 0 ? (mean / maxVal) * 100 : 0;
    }

    private computeTreemap(): void {
        const vendorCosts = new Map<string, number>();
        for (const run of this.allRuns) {
            const vendor = run.Vendor ?? 'Other';
            vendorCosts.set(vendor, (vendorCosts.get(vendor) ?? 0) + (run.Cost ?? run.TotalCost ?? 0));
        }

        const total = Array.from(vendorCosts.values()).reduce((s, v) => s + v, 0);
        const sorted = Array.from(vendorCosts.entries()).sort((a, b) => b[1] - a[1]);

        this.TreemapCells = sorted.map(([vendor, cost], i) => ({
            Label: vendor,
            Cost: cost,
            Percent: total > 0 ? (cost / total) * 100 : 0,
            Color: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
            GridArea: ''
        }));
    }

    private computeCostByModel(): void {
        const groups = new Map<string, PromptRunRecord[]>();
        for (const run of this.allRuns) {
            const key = run.ModelID ?? 'unknown';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(run);
        }

        const totalCost = this.allRuns.reduce((s, r) => s + (r.Cost ?? r.TotalCost ?? 0), 0);

        const rows: CostByModelRow[] = [];
        for (const [, modelRuns] of groups) {
            const inputTokens = modelRuns.reduce((s, r) => s + (r.TokensPrompt ?? 0), 0);
            const outputTokens = modelRuns.reduce((s, r) => s + (r.TokensCompletion ?? 0), 0);
            const cost = modelRuns.reduce((s, r) => s + (r.Cost ?? r.TotalCost ?? 0), 0);

            // Approximate input/output cost split based on token ratio
            const totalTk = inputTokens + outputTokens;
            const inputCost = totalTk > 0 ? cost * (inputTokens / totalTk) : 0;
            const outputCost = totalTk > 0 ? cost * (outputTokens / totalTk) : 0;

            rows.push({
                Model: modelRuns[0].Model ?? 'Unknown',
                Vendor: modelRuns[0].Vendor ?? 'Unknown',
                Runs: modelRuns.length,
                InputTokens: inputTokens,
                OutputTokens: outputTokens,
                InputCost: inputCost,
                OutputCost: outputCost,
                TotalCost: cost,
                PercentOfTotal: totalCost > 0 ? (cost / totalCost) * 100 : 0
            });
        }

        this.CostByModelRows = rows.sort((a, b) => b.TotalCost - a.TotalCost);
    }

    // ── Helpers ──

    private sumCostInRange(runs: PromptRunRecord[], start: Date, end: Date): number {
        return runs
            .filter(r => {
                const d = new Date(r.RunAt);
                return d >= start && d <= end;
            })
            .reduce((s, r) => s + (r.Cost ?? r.TotalCost ?? 0), 0);
    }

    private getDateBounds(): { currentStart: Date; previousStart: Date } {
        const now = new Date();
        const msMap: Record<string, number> = {
            'Today': 86400000,
            '7d': 604800000,
            '30d': 2592000000,
            'MTD': now.getDate() * 86400000
        };
        const ms = msMap[this.TimeRange] ?? 604800000;
        const currentStart = new Date(now.getTime() - ms);
        const previousStart = new Date(currentStart.getTime() - ms);
        return { currentStart, previousStart };
    }

    private buildModelFilter(): string {
        if (this.Filters.Models.length === 0) return '';
        const ids = this.Filters.Models.map(id => `'${id}'`).join(',');
        return `ModelID IN (${ids})`;
    }

    private combineDateAndModelFilter(start: Date, end: Date, modelFilter: string): string {
        const parts = [
            `RunAt >= '${start.toISOString()}'`,
            `RunAt <= '${end.toISOString()}'`
        ];
        if (modelFilter) parts.push(modelFilter);
        return parts.join(' AND ');
    }

    private formatBarLabel(dateStr: string): string {
        const d = new Date(dateStr + 'T00:00:00');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[d.getMonth()] + ' ' + d.getDate();
    }

    private downloadCSV(csv: string, filename: string): void {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}

export function LoadAnalyticsCostBudget() { /* tree-shaking prevention */ }
