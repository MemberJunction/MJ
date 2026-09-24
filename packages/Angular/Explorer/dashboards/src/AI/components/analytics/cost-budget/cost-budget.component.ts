/**
 * @fileoverview Cost & Budget Analytics -- Option B.
 *
 * Displays cost KPIs with period deltas, a daily cost bar chart with anomaly detection,
 * a cost breakdown treemap, and a detailed cost-by-model table with CSV export.
 */

import {
    Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';
import { CacheRate, CacheTokenTotals, CacheHitRate, HasCacheActivity, NetCacheSavings } from '../../../services/cache-metrics';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { ComputeTotalCost, ComputeCoveragePercent, ResolveCostCurrency, DEFAULT_COST_CURRENCY } from '../../../services/ai-usage-analytics.compute';
import { AIUsageDailyRow } from '../../../services/ai-usage-analytics.types';

// ── Interfaces ──

interface CostKpi {
    Label: string;
    Value: string;
    Subtitle?: string;
    Delta: number | null;
    DeltaDirection: 'up' | 'down' | 'stable';
    Highlighted: boolean;
    Icon: string;
    IsUnpriced?: boolean;
}

interface DailyBar {
    Date: string;
    Label: string;
    /** Null when every run that day was unpriced — distinct from a priced day that cost 0. */
    Cost: number | null;
    HeightPercent: number;
    IsAnomaly: boolean;
    IsUnpriced: boolean;
}

interface TreemapCell {
    Label: string;
    /** Null when every run for the vendor was unpriced. */
    Cost: number | null;
    /** Share of the priced total; null for an unpriced vendor, which has no share to size by. */
    Percent: number | null;
    Color: string;
    GridArea: string;
}

interface CostByModelRow {
    Model: string;
    Vendor: string;
    Runs: number;
    InputTokens: number;
    OutputTokens: number;
    CacheReadTokens: number;
    CacheWriteTokens: number;
    CacheHitRate: number;
    CacheSavings: number;
    InputCost: number | null;
    OutputCost: number | null;
    TotalCost: number | null;
    PercentOfTotal: number | null;
}

const TIME_RANGE_OPTIONS = ['Today', '7d', '30d', 'MTD'];

const TREEMAP_COLORS = [
    'var(--mj-brand-primary)',
    'var(--mj-brand-accent, var(--mj-brand-primary-hover))',
    'var(--mj-status-info)',
    'var(--mj-status-success)',
    'var(--mj-status-warning)',
    'var(--mj-text-disabled)'
];

/** The UTC day key ('YYYY-MM-DD') for an instant — the same bucketing the server applies. */
function CostBudgetUTCDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-analytics-cost-budget',
    template: `

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
                            <div class="kpi-value-row">
                                <div class="kpi-value">{{ kpi.Value }}</div>
                                @if (kpi.IsUnpriced) {
                                    <span class="unpriced-chip">unpriced</span>
                                }
                            </div>
                            @if (kpi.Subtitle) {
                                <div class="kpi-subtitle">{{ kpi.Subtitle }}</div>
                            }
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
                            <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-chart-column"
                                Title="No cost data for selected period" />
                        } @else {
                            <div class="bar-chart">
                                <div class="bar-chart-area">
                                    @if (AvgLinePercent > 0) {
                                        <div class="avg-line" [style.bottom.%]="AvgLinePercent">
                                            <span class="avg-label">avg</span>
                                        </div>
                                    }
                                    @for (bar of DailyBars; track bar.Date) {
                                        <div class="bar-col" [title]="bar.Label + ': ' + (bar.IsUnpriced ? 'unpriced — cost unknown' : FormatCurrency(bar.Cost))">
                                            <div
                                                class="bar"
                                                [class.bar--anomaly]="bar.IsAnomaly"
                                                [class.bar--unpriced]="bar.IsUnpriced"
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
                            <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-chart-pie"
                                Title="No vendor cost data" />
                        } @else {
                            <div class="treemap-grid">
                                @for (cell of TreemapCells; track cell.Label) {
                                    <div
                                        class="treemap-cell"
                                        [class.treemap-cell--unpriced]="cell.Percent === null"
                                        [style.background]="cell.Color"
                                        [style.flex-basis.%]="cell.Percent ?? 0"
                                        [title]="cell.Label + ': ' + (cell.Percent === null ? 'unpriced — cost unknown' : FormatCurrency(cell.Cost) + ' (' + (cell.Percent | number:'1.0-0') + '%)')">
                                        <span class="treemap-label">{{ cell.Label }}</span>
                                        <span class="treemap-value">{{ FormatCurrency(cell.Cost) }}</span>
                                        <span class="treemap-pct">{{ cell.Percent === null ? 'unpriced' : (cell.Percent | number:'1.0-0') + '%' }}</span>
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
                    <button mjButton variant="secondary" size="sm" class="export-btn" (click)="ExportCSV()">
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
                                <th class="col-numeric" title="Share of input tokens served from the provider's prompt cache">Cache Hit</th>
                                <th class="col-numeric">Input Cost</th>
                                <th class="col-numeric">Output Cost</th>
                                <th class="col-numeric">Total Cost</th>
                                <th class="col-numeric" title="Net dollars saved by caching vs. full input pricing (requires cache rates on AI Model Costs)">Cache Saved</th>
                                <th class="col-numeric">% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            @if (CostByModelRows.length === 0) {
                                <tr><td colspan="11" class="empty-row"><mj-empty-state Variant="no-results" Size="compact" Title="No cost data" Message="No AI usage was recorded in this period."></mj-empty-state></td></tr>
                            }
                            @for (row of CostByModelRows; track row.Model) {
                                <tr>
                                    <td class="cell-model">{{ row.Model }}</td>
                                    <td class="cell-vendor">{{ row.Vendor }}</td>
                                    <td class="cell-numeric">{{ row.Runs | number }}</td>
                                    <td class="cell-numeric">{{ row.InputTokens | number }}</td>
                                    <td class="cell-numeric">{{ row.OutputTokens | number }}</td>
                                    <td class="cell-numeric">{{ (row.CacheReadTokens + row.CacheWriteTokens) > 0 ? ((row.CacheHitRate * 100 | number:'1.0-0') + '%') : '—' }}</td>
                                    <td class="cell-numeric">{{ FormatCurrency(row.InputCost, 4) }}</td>
                                    <td class="cell-numeric">{{ FormatCurrency(row.OutputCost, 4) }}</td>
                                    <td class="cell-numeric cell-cost">{{ FormatCurrency(row.TotalCost) }}</td>
                                    <td class="cell-numeric">{{ row.CacheSavings > 0 ? FormatCurrency(row.CacheSavings, 4) : '—' }}</td>
                                    <td class="cell-numeric">{{ row.PercentOfTotal === null ? '—' : (row.PercentOfTotal | number:'1.1-1') + '%' }}</td>
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

        .kpi-value-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .kpi-value {
            font-size: 22px;
            font-weight: 700;
            color: var(--mj-text-primary);
            margin: 2px 0;
            letter-spacing: -0.02em;
        }

        .unpriced-chip {
            display: inline-flex;
            align-items: center;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            border-radius: 4px;
            background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
            color: var(--mj-status-warning);
            border: 1px solid color-mix(in srgb, var(--mj-status-warning) 30%, transparent);
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

        .kpi-subtitle {
            font-size: 11px;
            color: var(--mj-text-muted);
            margin-top: 2px;
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

        /* A day on which nothing was priced: its cost is unknown, not zero, so it is drawn as an
           outlined full-height column rather than a zero-height bar a reader would take for "free". */
        .bar--unpriced {
            background: transparent;
            border: 1px dashed var(--mj-status-warning);
            border-bottom: none;
            opacity: 0.6;
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
            color: var(--mj-text-inverse);
            transition: opacity 0.2s;
        }

        .treemap-cell:hover {
            opacity: 0.85;
        }

        .treemap-cell--unpriced {
            color: var(--mj-text-secondary);
            border: 1px dashed var(--mj-status-warning);
            flex-grow: 0;
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
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.loadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private _filters: GlobalFilterState = { Models: [], Agents: [], Prompts: [], Statuses: [] };
    @Input()
    set Filters(value: GlobalFilterState) {
        const next = value ?? { Models: [], Agents: [], Prompts: [], Statuses: [] };
        const changed = !this.shallowFiltersEqual(this._filters, next);
        this._filters = next;
        if (changed && this.initialized) this.loadData();
    }
    get Filters(): GlobalFilterState { return this._filters; }

    private shallowFiltersEqual(a: GlobalFilterState, b: GlobalFilterState): boolean {
        const sameArr = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
        return sameArr(a.Models, b.Models) && sameArr(a.Agents, b.Agents) && sameArr(a.Prompts, b.Prompts) && sameArr(a.Statuses, b.Statuses);
    }

    @Output() TimeRangeChange = new EventEmitter<string>();
    @Output() FiltersChange = new EventEmitter<GlobalFilterState>();

    private initialized = false;

    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    public IsLoading = false;
    public TimeRangeOptionsList = TIME_RANGE_OPTIONS;

    public CostKpis: CostKpi[] = [];
    public DailyBars: DailyBar[] = [];
    public AvgLinePercent = 0;
    public TreemapCells: TreemapCell[] = [];
    public CostByModelRows: CostByModelRow[] = [];

    private instrumentation = inject(AIInstrumentationService);

    private dailyRows: AIUsageDailyRow[] = [];
    private prevDailyRows: AIUsageDailyRow[] = [];
    /** The one currency every cost on this view is reported in (the period's primary currency). */
    private costCurrency = DEFAULT_COST_CURRENCY;
    /** True when some runs were priced in another currency and are therefore left out of the figures. */
    public IsMixedCurrency = false;
    private lookups: {
        models: Map<string, string>;
        modelVendors: Map<string, string>;
        vendors: Map<string, string>;
        agents: Map<string, string>;
    } = { models: new Map(), modelVendors: new Map(), vendors: new Map(), agents: new Map() };

    // Per model+vendor cache pricing (rates already normalized to currency-per-token). Empty until
    // AIModelCost cache rates are configured — savings then stays 0 (surfaced as "Set rates").
    private cacheRates = new Map<string, CacheRate>();

    ngOnInit(): void {
        this.initialized = true;
        this.instrumentation.Provider = this.ProviderToUse;
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Public Handlers ──

    public OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
        this.loadData();
    }

    public OnFiltersChange(filters: GlobalFilterState): void {
        this.Filters = filters;
        this.FiltersChange.emit(filters);
        this.loadData();
    }

    public FormatCurrency(value: number | null | undefined, decimals = 2): string {
        if (value === null || value === undefined) return '—';
        const prefix = this.costCurrency === 'USD' ? '$' : this.costCurrency + ' ';
        if (value === 0) return prefix + '0.00';
        if (value < 0.01 && decimals < 4) decimals = 4;
        return prefix + value.toFixed(decimals);
    }

    public ExportCSV(): void {
        const header = `Model,Vendor,Runs,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,Cache Hit Rate %,Input Cost (${this.costCurrency}),Output Cost (${this.costCurrency}),Total Cost (${this.costCurrency}),Cache Saved,% of Total`;
        // Unpriced figures export as empty cells, never 0 — a spreadsheet sum must not read them as free.
        const num = (v: number | null, digits: number) => (v === null ? '' : v.toFixed(digits));
        const rows = this.CostByModelRows.map(r =>
            `"${r.Model}","${r.Vendor}",${r.Runs},${r.InputTokens},${r.OutputTokens},${r.CacheReadTokens},${r.CacheWriteTokens},${(r.CacheHitRate * 100).toFixed(1)},${num(r.InputCost, 6)},${num(r.OutputCost, 6)},${num(r.TotalCost, 6)},${r.CacheSavings.toFixed(6)},${num(r.PercentOfTotal, 1)}`
        );
        const csv = [header, ...rows].join('\n');
        this.downloadCSV(csv, 'cost-by-model.csv');
    }

    // ── Data Loading ──

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            this.instrumentation.Provider = this.ProviderToUse;
            const { currentStart, previousStart } = this.getDateBounds();
            const now = new Date();

            const [currentDaily, prevDaily, lookups, cacheRates] = await Promise.all([
                this.instrumentation.GetUsageDaily(currentStart, now),
                this.instrumentation.GetUsageDaily(previousStart, currentStart),
                this.instrumentation.GetModelAndVendorLookups(),
                this.instrumentation.GetCacheRates()
            ]);

            this.dailyRows = this.applyClientModelFilter(currentDaily);
            this.prevDailyRows = this.applyClientModelFilter(prevDaily);
            this.lookups = lookups;
            this.cacheRates = cacheRates;

            const currency = ResolveCostCurrency(this.dailyRows);
            this.costCurrency = currency.Currency;
            this.IsMixedCurrency = currency.IsMixed;

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

    private applyClientModelFilter(rows: AIUsageDailyRow[]): AIUsageDailyRow[] {
        if (!this.Filters.Models || this.Filters.Models.length === 0) {
            return rows;
        }
        const set = new Set(this.Filters.Models.map(m => m.toLowerCase()));
        return rows.filter(r => r.ModelID && set.has(r.ModelID.toLowerCase()));
    }

    // ── Cache pricing ──

    /** Stable map key for a model+vendor pair (UUIDs normalized for case-insensitive matching). */
    private rateKey(modelID: string | null, vendorID: string | null): string {
        return `${NormalizeUUID(modelID ?? '')}|${NormalizeUUID(vendorID ?? '')}`;
    }

    /** Sum net cache savings across a set of rows using each row's model+vendor rate. */
    private sumCacheSavings(rows: AIUsageDailyRow[]): number {
        let totalSavings = 0;
        for (const r of rows) {
            const key = this.rateKey(r.ModelID, r.VendorID);
            const rate = this.cacheRates.get(key);
            if (!rate) continue;
            const savings = NetCacheSavings(
                {
                    UncachedInputTokens: r.TokensPrompt ?? 0,
                    CacheReadTokens: r.TokensCacheRead ?? 0,
                    CacheWriteTokens: r.TokensCacheWrite ?? 0
                },
                rate
            );
            if (savings > 0) totalSavings += savings;
        }
        return totalSavings;
    }

    // ── Computations ──

    private computeKpis(): void {
        const now = new Date();

        // Bounds are UTC DAY KEYS, matching how DayBucket is bucketed server-side. Building them in
        // LOCAL time and comparing against a UTC-parsed bucket drops a whole day for any viewer west
        // of UTC: in US/Eastern, local midnight is 04:00Z, so today's bucket (00:00Z) sorts before it
        // and "Today's Spend" rendered $0.00 every day. The same shift dropped the oldest day of the
        // week and the 1st of the month.
        const todayKey = CostBudgetUTCDayKey(now);
        const weekKey = CostBudgetUTCDayKey(new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6)));
        const monthKey = CostBudgetUTCDayKey(new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), 1)));

        const todaySpend = this.sumCostInRange(this.dailyRows, todayKey, todayKey);
        const weekSpend = this.sumCostInRange(this.dailyRows, weekKey, todayKey);
        const monthSpend = this.sumCostInRange(this.dailyRows, monthKey, todayKey);

        const prevTotalCost = ComputeTotalCost(this.prevDailyRows, this.costCurrency);
        const currentTotalCost = ComputeTotalCost(this.dailyRows, this.costCurrency);

        // Project monthly cost based on current daily average
        const daysIntoMonth = Math.max(1, now.getDate());
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const projectedMonthly = monthSpend !== null ? (monthSpend / daysIntoMonth) * daysInMonth : null;

        const delta = prevTotalCost !== null && prevTotalCost > 0 && currentTotalCost !== null
            ? ((currentTotalCost - prevTotalCost) / prevTotalCost) * 100
            : null;

        let totalRuns = 0;
        let pricedRuns = 0;
        let unpricedRuns = 0;
        for (const r of this.dailyRows) {
            totalRuns += (r.Runs ?? 0);
            pricedRuns += (r.PricedRuns ?? 0);
            unpricedRuns += (r.UnpricedRuns ?? 0);
        }
        const covPct = ComputeCoveragePercent({ PricedRuns: pricedRuns, UnpricedRuns: unpricedRuns });
        const covText = (totalRuns > 0 || (pricedRuns + unpricedRuns) > 0) ? `covers ${Math.round(covPct)}% of runs` : undefined;
        // Mixed currencies: say which one the figures are in, since the others are left out of them.
        const covSubtitle = this.IsMixedCurrency
            ? [covText, `${this.costCurrency} only`].filter(Boolean).join(' · ')
            : covText;

        this.CostKpis = [
            {
                Label: "Today's Spend",
                Value: this.FormatCurrency(todaySpend),
                Subtitle: covSubtitle,
                Delta: null,
                DeltaDirection: 'stable',
                Highlighted: false,
                Icon: 'fa-solid fa-calendar-day',
                IsUnpriced: todaySpend === null
            },
            {
                Label: 'This Week',
                Value: this.FormatCurrency(weekSpend),
                Subtitle: covSubtitle,
                Delta: null,
                DeltaDirection: 'stable',
                Highlighted: false,
                Icon: 'fa-solid fa-calendar-week',
                IsUnpriced: weekSpend === null
            },
            {
                Label: 'This Month',
                Value: this.FormatCurrency(monthSpend),
                Subtitle: covSubtitle,
                Delta: delta,
                DeltaDirection: delta != null ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable') : 'stable',
                Highlighted: false,
                Icon: 'fa-solid fa-calendar',
                IsUnpriced: monthSpend === null
            },
            {
                Label: 'Projected Monthly',
                Value: this.FormatCurrency(projectedMonthly),
                Subtitle: covSubtitle,
                Delta: null,
                DeltaDirection: 'stable',
                Highlighted: true,
                Icon: 'fa-solid fa-chart-line',
                IsUnpriced: projectedMonthly === null
            }
        ];

        this.appendCacheKpis();
    }

    /** Append the cache hit-rate and cache-savings KPIs (computed from the current-period daily rows). */
    private appendCacheKpis(): void {
        const totals: CacheTokenTotals = { UncachedInputTokens: 0, CacheReadTokens: 0, CacheWriteTokens: 0 };
        for (const r of this.dailyRows) {
            totals.UncachedInputTokens += r.TokensPrompt ?? 0;
            totals.CacheReadTokens += r.TokensCacheRead ?? 0;
            totals.CacheWriteTokens += r.TokensCacheWrite ?? 0;
        }
        const savings = this.sumCacheSavings(this.dailyRows);
        const activity = HasCacheActivity(totals);

        this.CostKpis.push({
            Label: 'Cache Hit Rate',
            Value: (CacheHitRate(totals) * 100).toFixed(1) + '%',
            Delta: null,
            DeltaDirection: 'stable',
            Highlighted: false,
            Icon: 'fa-solid fa-bolt'
        });

        const savingsValue = savings > 0
            ? this.FormatCurrency(savings)
            : (activity ? 'Set rates' : '$0.00');
        this.CostKpis.push({
            Label: 'Saved via Cache',
            Value: savingsValue,
            Delta: null,
            DeltaDirection: 'stable',
            Highlighted: savings > 0,
            Icon: 'fa-solid fa-piggy-bank'
        });
    }

    private computeDailyBars(): void {
        const buckets = new Map<string, AIUsageDailyRow[]>();
        for (const row of this.dailyRows) {
            const key = row.DayBucket ? row.DayBucket.slice(0, 10) : '';
            if (!key) continue;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key)!.push(row);
        }

        const sortedKeys = Array.from(buckets.keys()).sort();
        // null = nothing priced that day. Kept as null end to end: it is drawn as an unpriced column,
        // and it stays OUT of the anomaly baseline — folded in as 0 it dragged the mean down and made
        // ordinary spending days read as anomalies.
        const values: (number | null)[] = sortedKeys.map(k => ComputeTotalCost(buckets.get(k)!, this.costCurrency));
        const priced = values.filter((v): v is number => v !== null);
        const maxVal = Math.max(...priced, 0.001);

        // Anomaly detection: > 2 standard deviations from the mean of PRICED days
        const mean = priced.length > 0 ? priced.reduce((s, v) => s + v, 0) / priced.length : 0;
        const variance = priced.length > 1
            ? priced.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / priced.length
            : 0;
        const stdDev = Math.sqrt(variance);
        const anomalyThreshold = mean + 2 * stdDev;

        this.DailyBars = sortedKeys.map((key, i) => {
            const cost = values[i];
            return {
                Date: key,
                Label: this.formatBarLabel(key),
                Cost: cost,
                HeightPercent: cost === null ? 100 : (maxVal > 0 ? (cost / maxVal) * 100 : 0),
                IsAnomaly: cost !== null && stdDev > 0 && cost > anomalyThreshold,
                IsUnpriced: cost === null
            };
        });

        this.AvgLinePercent = maxVal > 0 ? (mean / maxVal) * 100 : 0;
    }

    private computeTreemap(): void {
        const vendorGroups = new Map<string, AIUsageDailyRow[]>();
        for (const run of this.dailyRows) {
            const vendorName = (run.VendorID ? this.lookups.vendors.get(run.VendorID.toLowerCase()) : null) ?? 'Other';
            if (!vendorGroups.has(vendorName)) vendorGroups.set(vendorName, []);
            vendorGroups.get(vendorName)!.push(run);
        }

        const vendorCosts: Array<[string, number | null]> = [];
        for (const [vendor, rows] of vendorGroups.entries()) {
            vendorCosts.push([vendor, ComputeTotalCost(rows, this.costCurrency)]);
        }

        // Shares are of the PRICED total. An unpriced vendor has no share to size by, so it is shown
        // as an unpriced cell after the priced ones rather than as a 0% sliver of a total it isn't in.
        const total = vendorCosts.reduce((s, [, c]) => s + (c !== null ? c : 0), 0);
        const sorted = vendorCosts.sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));

        let colorIndex = 0;
        this.TreemapCells = sorted.map(([vendor, cost]) => ({
            Label: vendor,
            Cost: cost,
            Percent: cost === null ? null : (total > 0 ? (cost / total) * 100 : 0),
            Color: cost === null ? 'var(--mj-bg-surface-card)' : TREEMAP_COLORS[colorIndex++ % TREEMAP_COLORS.length],
            GridArea: ''
        }));
    }

    private computeCostByModel(): void {
        const groups = new Map<string, AIUsageDailyRow[]>();
        for (const row of this.dailyRows) {
            const key = row.ModelID ?? 'unknown';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(row);
        }

        // The % denominator is the priced total. When nothing is priced there is no total to take a
        // share of, so every row's share is unknown (—), not 0%.
        const totalCost = ComputeTotalCost(this.dailyRows, this.costCurrency);

        const rows: CostByModelRow[] = [];
        for (const [modelId, modelDailyRows] of groups) {
            const inputTokens = modelDailyRows.reduce((s, r) => s + (r.TokensPrompt ?? 0), 0);
            const outputTokens = modelDailyRows.reduce((s, r) => s + (r.TokensCompletion ?? 0), 0);
            const cacheReadTokens = modelDailyRows.reduce((s, r) => s + (r.TokensCacheRead ?? 0), 0);
            const cacheWriteTokens = modelDailyRows.reduce((s, r) => s + (r.TokensCacheWrite ?? 0), 0);
            const runsCount = modelDailyRows.reduce((s, r) => s + (r.Runs ?? 0), 0);
            const cost = ComputeTotalCost(modelDailyRows, this.costCurrency);

            // Approximate input/output cost split based on token ratio (unknown when the cost is)
            const totalTk = inputTokens + outputTokens;
            const inputCost = cost === null ? null : (totalTk > 0 ? cost * (inputTokens / totalTk) : 0);
            const outputCost = cost === null ? null : (totalTk > 0 ? cost * (outputTokens / totalTk) : 0);

            const modelName = this.lookups.models.get(modelId.toLowerCase()) ?? 'Unknown';
            const vendorId = modelDailyRows[0]?.VendorID ?? this.lookups.modelVendors.get(modelId.toLowerCase());
            const vendorName = (vendorId ? this.lookups.vendors.get(vendorId.toLowerCase()) : null) ?? 'Unknown';

            rows.push({
                Model: modelName,
                Vendor: vendorName,
                Runs: runsCount,
                InputTokens: inputTokens,
                OutputTokens: outputTokens,
                CacheReadTokens: cacheReadTokens,
                CacheWriteTokens: cacheWriteTokens,
                CacheHitRate: CacheHitRate({ UncachedInputTokens: inputTokens, CacheReadTokens: cacheReadTokens, CacheWriteTokens: cacheWriteTokens }),
                CacheSavings: this.sumCacheSavings(modelDailyRows),
                InputCost: inputCost,
                OutputCost: outputCost,
                TotalCost: cost,
                PercentOfTotal: cost !== null && totalCost !== null && totalCost > 0 ? (cost / totalCost) * 100 : null
            });
        }

        // Highest cost first; unpriced models last.
        this.CostByModelRows = rows.sort((a, b) => (b.TotalCost ?? -1) - (a.TotalCost ?? -1));
    }

    // ── Helpers ──

    /**
     * Sums cost over an inclusive range of UTC day keys ('YYYY-MM-DD'). Compared as strings, which
     * for ISO dates is the same ordering as by date, and which keeps the viewer's timezone out of a
     * figure derived from UTC-bucketed data entirely.
     */
    private sumCostInRange(rows: AIUsageDailyRow[], startKey: string, endKey: string): number | null {
        const inRange = rows.filter(r => {
            if (!r.DayBucket) return false;
            const key = r.DayBucket.slice(0, 10);
            return key >= startKey && key <= endKey;
        });
        return ComputeTotalCost(inRange, this.costCurrency);
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

    private formatBarLabel(dateStr: string): string {
        const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
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
