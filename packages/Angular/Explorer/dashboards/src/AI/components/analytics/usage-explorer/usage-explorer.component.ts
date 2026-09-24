import {
    Component,
    Input,
    OnInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NavigationService } from '@memberjunction/ng-shared';
import { PivotMeasureColumn, PivotTimeGrain } from '@memberjunction/ng-query-viewer';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { AIUsageHourlyRow, AIUsageDailyRow } from '../../../services/ai-usage-analytics.types';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';

/** The pivot measures for each measure option. Built once: the pivot re-aggregates on a new array. */
const MEASURE_COLUMNS: Record<string, PivotMeasureColumn[]> = {
    cost: [
        // CurrencyColumn makes the pivot split by currency, so amounts are never summed across them.
        { Key: 'OwnCost', Label: 'Cost', Format: 'currency', Aggregation: 'sum', CurrencyColumn: 'CostCurrency' }
    ],
    tokens: [
        { Key: 'TokensPrompt', Label: 'Prompt Tokens', Format: 'number', Aggregation: 'sum' },
        { Key: 'TokensCompletion', Label: 'Completion Tokens', Format: 'number', Aggregation: 'sum' }
    ],
    runs: [
        { Key: 'Runs', Label: 'Runs', Format: 'number', Aggregation: 'sum' },
        { Key: 'SucceededRuns', Label: 'Succeeded', Format: 'number', Aggregation: 'sum' },
        { Key: 'FailedRuns', Label: 'Failed', Format: 'number', Aggregation: 'sum' }
    ],
    p95_latency: [
        { Key: 'LatencyP95', Label: 'Avg P95 Latency', Format: 'duration', Aggregation: 'avg' },
        { Key: 'LatencyP50', Label: 'Avg P50 Latency', Format: 'duration', Aggregation: 'avg' }
    ],
    cache_read: [
        { Key: 'TokensCacheRead', Label: 'Cache-Read Tokens', Format: 'number', Aggregation: 'sum' },
        { Key: 'TokensCacheWrite', Label: 'Cache-Write Tokens', Format: 'number', Aggregation: 'sum' }
    ],
    unpriced_pct: [
        { Key: 'UnpricedRuns', Label: 'Unpriced Runs', Format: 'number', Aggregation: 'sum' },
        { Key: 'PricedRuns', Label: 'Priced Runs', Format: 'number', Aggregation: 'sum' },
        { Key: 'UnmeasuredRuns', Label: 'Unmeasured Runs', Format: 'number', Aggregation: 'sum' }
    ]
};

/**
 * A group-by dimension. ID dimensions carry a display-name column that the explorer fills in from
 * cached reference data; the pivot groups by BOTH (so two records that share a name stay apart) and
 * shows only the name, while the ID stays on each row for drill-through.
 */
interface UsageDimension {
    Key: string;
    NameColumn?: string;
    Label: string;
    /** Display value for rows with no value in this dimension (e.g. a direct run has no agent). */
    Empty: string;
}

const DIMENSIONS: UsageDimension[] = [
    { Key: 'AgentID', NameColumn: 'Agent', Label: 'Agent', Empty: '(No agent — direct)' },
    { Key: 'PromptID', NameColumn: 'Prompt', Label: 'Prompt', Empty: '(No prompt)' },
    { Key: 'ModelID', NameColumn: 'Model', Label: 'Model', Empty: '(No model)' },
    { Key: 'VendorID', NameColumn: 'Vendor', Label: 'Vendor', Empty: '(No vendor)' },
    { Key: 'UserID', NameColumn: 'User', Label: 'User', Empty: '(No user)' },
    // The tenant is the scope RECORD; PrimaryScopeEntityID is only its entity type, the same for every row.
    { Key: 'PrimaryScopeRecordID', Label: 'Tenant', Empty: '(No tenant)' },
    { Key: 'SourceKind', Label: 'Source', Empty: '(Unknown)' },
    { Key: 'ConfigurationID', NameColumn: 'Configuration', Label: 'Configuration', Empty: '(Default)' }
];

const DIMENSION_BY_KEY = new Map(DIMENSIONS.map(d => [d.Key, d]));

/** Header titles for the pivot: name columns, plain dimensions, currency and the time bucket. */
const COLUMN_LABELS: Record<string, string> = {
    ...Object.fromEntries(DIMENSIONS.map(d => [d.NameColumn ?? d.Key, d.Label])),
    CostCurrency: 'Currency',
    DayBucket: 'Day',
    HourBucket: 'Hour'
};

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * AI Usage Explorer Component.
 *
 * Provides a multidimensional pivot over AI usage metrics (cost, tokens, runs,
 * p95 latency, cache-read share, unpriced %) across dimensions (agent, prompt,
 * model, vendor, user, tenant, source kind, configuration).
 * Configures <mj-query-pivot> and reads aggregated usage via AIInstrumentationService.
 *
 * The pivot's configuration inputs (MeasureColumns, DimensionColumns, TimeColumn) are FIELDS, rebuilt
 * only by the setters of the selections they derive from. As getters they returned a fresh array on
 * every evaluation, so every change-detection pass looked like a new input: dev mode threw
 * ExpressionChangedAfterItHasBeenChecked and prod re-pivoted continuously.
 */
@Component({
    standalone: false,
    selector: 'app-analytics-usage-explorer',
    templateUrl: './usage-explorer.component.html',
    styleUrls: ['./usage-explorer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsageExplorerComponent extends BaseAngularComponent implements OnInit {
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        if (value === this._timeRange) return;
        this._timeRange = value;
        if (this.initialized) this.LoadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private _filters: GlobalFilterState | undefined;
    @Input()
    set Filters(value: GlobalFilterState | undefined) {
        if (value === this._filters) return;
        this._filters = value;
        if (this.initialized) this.LoadData();
    }
    get Filters(): GlobalFilterState | undefined { return this._filters; }

    private _rowsData: Record<string, unknown>[] | null | undefined;
    /**
     * Rows supplied by a host; when set, they are pivoted as-is and nothing is queried. Name columns
     * the rows carry are kept; an ID dimension without one shows the ID.
     */
    @Input()
    set RowsData(value: Record<string, unknown>[] | null | undefined) {
        if (value === this._rowsData) return;
        this._rowsData = value;
        if (this.initialized) this.LoadData();
    }
    get RowsData(): Record<string, unknown>[] | null | undefined { return this._rowsData; }

    private _selectedMeasure = 'cost';
    public set SelectedMeasure(value: string) {
        this._selectedMeasure = value;
        this.MeasureColumns = MEASURE_COLUMNS[value] ?? MEASURE_COLUMNS['cost'];
    }
    public get SelectedMeasure(): string { return this._selectedMeasure; }

    private _selectedGroupBy = 'AgentID';
    public set SelectedGroupBy(value: string) {
        this._selectedGroupBy = value;
        this.rebuildDimensionColumns();
    }
    public get SelectedGroupBy(): string { return this._selectedGroupBy; }

    private _selectedSecondarySplit = '';
    public set SelectedSecondarySplit(value: string) {
        this._selectedSecondarySplit = value;
        this.rebuildDimensionColumns();
    }
    public get SelectedSecondarySplit(): string { return this._selectedSecondarySplit; }

    private _selectedGrain: PivotTimeGrain = 'day';
    public set SelectedGrain(value: PivotTimeGrain) {
        this._selectedGrain = value;
        this.TimeColumn = value === 'hour' ? 'HourBucket' : 'DayBucket';
    }
    public get SelectedGrain(): PivotTimeGrain { return this._selectedGrain; }

    public ComparisonEnabled: boolean = false;
    public IsLoading: boolean = false;

    public PivotRows: Record<string, unknown>[] = [];

    /** Measures for the selected measure option — replaced only when SelectedMeasure changes. */
    public MeasureColumns: PivotMeasureColumn[] = MEASURE_COLUMNS['cost'];
    /** Group-by columns — replaced only when SelectedGroupBy / SelectedSecondarySplit change. */
    public DimensionColumns: string[] = ['AgentID', 'Agent'];
    /** ID columns grouped by but not shown (their name column is shown instead). */
    public HiddenColumns: string[] = ['AgentID'];
    public readonly ColumnLabels = COLUMN_LABELS;
    /** Time bucket column for the selected grain. */
    public TimeColumn = 'DayBucket';

    public readonly MeasureOptions = [
        { text: 'Cost', value: 'cost' },
        { text: 'Tokens', value: 'tokens' },
        { text: 'Runs', value: 'runs' },
        { text: 'Avg Latency (P95/P50)', value: 'p95_latency' },
        { text: 'Cache-Read Share', value: 'cache_read' },
        { text: 'Unpriced %', value: 'unpriced_pct' }
    ];

    public readonly DimensionOptions = DIMENSIONS.map(d => ({ text: d.Label, value: d.Key }));

    public readonly SecondarySplitOptions = [{ text: '(None)', value: '' }, ...this.DimensionOptions];

    public readonly GrainOptions = [
        { text: 'Hourly', value: 'hour' },
        { text: 'Daily', value: 'day' }
    ];

    private instrumentation = inject(AIInstrumentationService);
    private navigationService = inject(NavigationService);
    private cdr = inject(ChangeDetectorRef);
    private initialized = false;

    public ngOnInit(): void {
        this.initialized = true;
        this.LoadData();
    }

    public async LoadData(): Promise<void> {
        if (this.RowsData !== null && this.RowsData !== undefined) {
            // Copied, not mutated: the name columns are filled in on the copies.
            const rows = this.RowsData.map(r => ({ ...r }));
            this.applyDisplayNames(rows, {});
            this.PivotRows = rows;
            this.cdr.markForCheck();
            return;
        }

        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            this.instrumentation.Provider = this.ProviderToUse;
            const { start, end, prevStart, prevEnd } = this.computeDateRange(this.TimeRange);

            let currentRows: Record<string, unknown>[] = [];
            let prevRows: Record<string, unknown>[] = [];

            if (this.SelectedGrain === 'hour') {
                const rawCurrent: AIUsageHourlyRow[] = await this.instrumentation.GetUsageHourly(start, end);
                currentRows = this.applyFilters(rawCurrent.map(r => this.rowToRecord(r)));

                if (this.ComparisonEnabled) {
                    const rawPrev: AIUsageHourlyRow[] = await this.instrumentation.GetUsageHourly(prevStart, prevEnd);
                    prevRows = this.applyFilters(rawPrev.map(r => this.rowToRecord(r)));
                }
            } else {
                const rawCurrent: AIUsageDailyRow[] = await this.instrumentation.GetUsageDaily(start, end);
                currentRows = this.applyFilters(rawCurrent.map(r => this.rowToRecord(r)));

                if (this.ComparisonEnabled) {
                    const rawPrev: AIUsageDailyRow[] = await this.instrumentation.GetUsageDaily(prevStart, prevEnd);
                    prevRows = this.applyFilters(rawPrev.map(r => this.rowToRecord(r)));
                }
            }

            await this.addDisplayNames([...currentRows, ...prevRows]);

            if (this.ComparisonEnabled) {
                const taggedCurrent = currentRows.map(r => ({ ...r, _period: 'current' }));
                const taggedPrev = prevRows.map(r => ({ ...r, _period: 'previous' }));
                this.PivotRows = [...taggedCurrent, ...taggedPrev];
            } else {
                this.PivotRows = currentRows;
            }
        } catch (err) {
            // Logged, not swallowed: an empty pivot otherwise reads as "no usage in this period".
            console.error('AI Usage Explorer: usage data failed to load', err);
            this.PivotRows = [];
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    public OnMeasureChange(value: string): void {
        this.SelectedMeasure = value;
        this.cdr.markForCheck();
    }

    public OnGroupByChange(value: string): void {
        this.SelectedGroupBy = value;
        if (this.SelectedSecondarySplit === value) {
            this.SelectedSecondarySplit = '';
        }
        this.cdr.markForCheck();
    }

    public OnSecondarySplitChange(value: string): void {
        this.SelectedSecondarySplit = value;
        this.cdr.markForCheck();
    }

    public OnGrainChange(value: PivotTimeGrain): void {
        this.SelectedGrain = value;
        this.LoadData();
    }

    public OnComparisonChange(enabled: boolean): void {
        this.ComparisonEnabled = enabled;
        this.LoadData();
    }

    public OnRowActivated(row: Record<string, unknown>): void {
        if (!row) {
            return;
        }

        const agentId = row['AgentID'];
        if (typeof agentId === 'string' && agentId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(agentId));
            return;
        }

        const promptId = row['PromptID'];
        if (typeof promptId === 'string' && promptId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: AI Prompts', CompositeKey.FromID(promptId));
            return;
        }

        const modelId = row['ModelID'];
        if (typeof modelId === 'string' && modelId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: AI Models', CompositeKey.FromID(modelId));
            return;
        }

        const vendorId = row['VendorID'];
        if (typeof vendorId === 'string' && vendorId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: AI Vendors', CompositeKey.FromID(vendorId));
            return;
        }

        const userId = row['UserID'];
        if (typeof userId === 'string' && userId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: Users', CompositeKey.FromID(userId));
            return;
        }

        const configId = row['ConfigurationID'];
        if (typeof configId === 'string' && configId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: AI Configurations', CompositeKey.FromID(configId));
            return;
        }
    }

    private rebuildDimensionColumns(): void {
        const selected = [this.SelectedGroupBy];
        if (this.SelectedSecondarySplit && this.SelectedSecondarySplit !== this.SelectedGroupBy) {
            selected.push(this.SelectedSecondarySplit);
        }
        const cols: string[] = [];
        const hidden: string[] = [];
        for (const key of selected) {
            const dim = DIMENSION_BY_KEY.get(key);
            cols.push(key);
            if (dim?.NameColumn) {
                cols.push(dim.NameColumn);
                hidden.push(key);
            }
        }
        this.DimensionColumns = cols;
        this.HiddenColumns = hidden;
    }

    /**
     * Adds a display-name column for every ID dimension, and a readable value for rows that have
     * none. Agent, prompt, model, vendor and configuration names come from AIEngineBase's cached
     * reference data (no query); user names are one bounded read of the IDs actually present.
     */
    private async addDisplayNames(rows: Record<string, unknown>[]): Promise<void> {
        if (rows.length === 0) {
            return;
        }
        const engine = AIEngineBase.Instance;
        try {
            await engine.Config(false, undefined, this.ProviderToUse);
        } catch (err) {
            // Names are a convenience: without the engine the pivot still works, showing IDs.
            console.error('AI Usage Explorer: AI metadata failed to load; showing IDs', err);
        }
        const byId = (items: { ID: string; Name: string | null }[] | undefined) =>
            new Map((items ?? []).map(i => [NormalizeUUID(i.ID), i.Name ?? i.ID]));
        const names: Record<string, Map<string, string>> = {
            AgentID: byId(engine.Agents),
            PromptID: byId(engine.Prompts),
            ModelID: byId(engine.Models),
            VendorID: byId(engine.Vendors),
            ConfigurationID: byId(engine.Configurations),
            UserID: await this.loadUserNames(rows)
        };
        this.applyDisplayNames(rows, names);
    }

    /**
     * Fills each ID dimension's name column (a name the row already carries wins, then `names`, then
     * the ID itself) and gives rows with no value a readable label instead of a blank cell.
     */
    private applyDisplayNames(rows: Record<string, unknown>[], names: Record<string, Map<string, string>>): void {
        for (const row of rows) {
            for (const dim of DIMENSIONS) {
                const value = row[dim.Key];
                const has = value !== null && value !== undefined && value !== '';
                if (dim.NameColumn) {
                    const carried = row[dim.NameColumn];
                    row[dim.NameColumn] = !has
                        ? dim.Empty
                        : typeof carried === 'string' && carried !== ''
                            ? carried
                            : names[dim.Key]?.get(NormalizeUUID(String(value))) ?? String(value);
                } else if (!has) {
                    row[dim.Key] = dim.Empty;
                }
            }
        }
    }

    private async loadUserNames(rows: Record<string, unknown>[]): Promise<Map<string, string>> {
        const ids = [...new Set(rows.map(r => r['UserID']).filter((v): v is string => typeof v === 'string' && GUID.test(v)))];
        if (ids.length === 0) {
            return new Map();
        }
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Users',
            Fields: ['ID', 'Name'],
            ExtraFilter: `ID IN (${ids.map(id => `'${id}'`).join(',')})`,
            ResultType: 'simple'
        });
        if (!result.Success) {
            console.error('AI Usage Explorer: user names failed to load; showing IDs', result.ErrorMessage);
            return new Map();
        }
        return new Map(result.Results.map(u => [NormalizeUUID(u.ID), u.Name]));
    }

    /**
     * A usage row as a pivot record. A group with no priced runs carries OwnCost 0 from the query's
     * `SUM(CASE WHEN IsPriced = 1 ... ELSE 0 END)`; here that zero becomes null, so the pivot's
     * null-skipping aggregation renders an all-unpriced cell as an em dash rather than $0.00.
     */
    private rowToRecord(row: AIUsageHourlyRow | AIUsageDailyRow): Record<string, unknown> {
        const record: Record<string, unknown> = { ...row };
        if (row.PricedRuns === 0) {
            record['OwnCost'] = null;
        }
        return record;
    }

    /**
     * Applies the global filters. A row that lacks the filtered dimension (e.g. no ModelID while a
     * model filter is active) does NOT match — the same rule the Cost & Budget section applies, so
     * one filter gives one set of numbers across sections. Keeping such rows let agent-level
     * aggregates survive every model filter and inflated the filtered totals.
     */
    private applyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
        if (!this.Filters) {
            return rows;
        }

        const models = this.toIdSet(this.Filters.Models);
        const agents = this.toIdSet(this.Filters.Agents);
        const prompts = this.toIdSet(this.Filters.Prompts);

        return rows.filter(row =>
            this.matchesFilter(row['ModelID'], models) &&
            this.matchesFilter(row['AgentID'], agents) &&
            this.matchesFilter(row['PromptID'], prompts)
        );
    }

    private toIdSet(ids: string[] | undefined): Set<string> | null {
        return ids && ids.length > 0 ? new Set(ids.map(id => id.toLowerCase())) : null;
    }

    private matchesFilter(value: unknown, allowed: Set<string> | null): boolean {
        if (allowed === null) {
            return true;
        }
        return typeof value === 'string' && allowed.has(value.toLowerCase());
    }

    private computeDateRange(range: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
        const end = new Date();
        const start = new Date();
        let durationMs = 24 * 60 * 60 * 1000;

        switch (range) {
            case '1h':
                durationMs = 60 * 60 * 1000;
                break;
            case '6h':
                durationMs = 6 * 60 * 60 * 1000;
                break;
            case '24h':
                durationMs = 24 * 60 * 60 * 1000;
                break;
            case '7d':
                durationMs = 7 * 24 * 60 * 60 * 1000;
                break;
            case '30d':
                durationMs = 30 * 24 * 60 * 60 * 1000;
                break;
            case '90d':
                durationMs = 90 * 24 * 60 * 60 * 1000;
                break;
            default:
                durationMs = 7 * 24 * 60 * 60 * 1000;
        }

        start.setTime(end.getTime() - durationMs);
        const prevEnd = new Date(start.getTime());
        const prevStart = new Date(start.getTime() - durationMs);

        return { start, end, prevStart, prevEnd };
    }
}

/**
 * Tree-shaking prevention loader for UsageExplorerComponent.
 */
export function LoadUsageExplorer(): void {
    // Tree-shaking prevention
}
