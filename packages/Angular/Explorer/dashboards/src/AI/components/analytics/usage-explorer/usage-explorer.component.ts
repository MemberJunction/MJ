import {
    Component,
    Input,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { PivotMeasureColumn, PivotTimeGrain } from '@memberjunction/ng-query-viewer';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { AIUsageHourlyRow, AIUsageDailyRow } from '../../../services/ai-usage-analytics.types';
import { GlobalFilterState, UsageExplorerPrefs } from '../../../interfaces/analytics-preferences.interface';

/**
 * AI Usage Explorer Component.
 *
 * Provides a multidimensional pivot over AI usage metrics (cost, tokens, runs,
 * p95 latency, cache-read share, unpriced %) across dimensions (agent, prompt,
 * model, vendor, user, tenant, source kind, configuration).
 * Configures <mj-query-pivot> and reads aggregated usage via AIInstrumentationService.
 */
@Component({
    standalone: false,
    selector: 'app-analytics-usage-explorer',
    templateUrl: './usage-explorer.component.html',
    styleUrls: ['./usage-explorer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsageExplorerComponent extends BaseResourceComponent implements OnInit, OnDestroy, OnChanges {
    @Input() public TimeRange: string = '7d';
    @Input() public Filters?: GlobalFilterState;
    @Input() public RowsData?: Record<string, unknown>[] | null;

    public SelectedMeasure: string = 'cost';
    public SelectedGroupBy: string = 'AgentID';
    public SelectedSecondarySplit: string = '';
    public SelectedGrain: PivotTimeGrain = 'day';
    public ComparisonEnabled: boolean = false;
    public IsLoading: boolean = false;

    public PivotRows: Record<string, unknown>[] = [];

    public readonly MeasureOptions = [
        { text: 'Cost ($)', value: 'cost' },
        { text: 'Tokens', value: 'tokens' },
        { text: 'Runs', value: 'runs' },
        { text: 'P95 Latency', value: 'p95_latency' },
        { text: 'Cache-Read Share', value: 'cache_read' },
        { text: 'Unpriced %', value: 'unpriced_pct' }
    ];

    public readonly DimensionOptions = [
        { text: 'Agent', value: 'AgentID' },
        { text: 'Prompt', value: 'PromptID' },
        { text: 'Model', value: 'ModelID' },
        { text: 'Vendor', value: 'VendorID' },
        { text: 'User', value: 'UserID' },
        { text: 'Tenant / Scope', value: 'PrimaryScopeEntityID' },
        { text: 'Source Kind', value: 'SourceKind' },
        { text: 'Configuration', value: 'ConfigurationID' }
    ];

    public readonly SecondarySplitOptions = [
        { text: '(None)', value: '' },
        { text: 'Agent', value: 'AgentID' },
        { text: 'Prompt', value: 'PromptID' },
        { text: 'Model', value: 'ModelID' },
        { text: 'Vendor', value: 'VendorID' },
        { text: 'User', value: 'UserID' },
        { text: 'Tenant / Scope', value: 'PrimaryScopeEntityID' },
        { text: 'Source Kind', value: 'SourceKind' },
        { text: 'Configuration', value: 'ConfigurationID' }
    ];

    public readonly GrainOptions = [
        { text: 'Hourly', value: 'hour' },
        { text: 'Daily', value: 'day' }
    ];

    private instrumentation = inject(AIInstrumentationService);
    private cdr = inject(ChangeDetectorRef);
    private initialized = false;

    public override async GetResourceDisplayName(_data?: ResourceData): Promise<string> {
        return 'AI Usage Explorer';
    }

    public override async GetResourceIconClass(_data?: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-pie';
    }

    public override ngOnInit(): void {
        super.ngOnInit();
        this.initialized = true;
        this.LoadData();
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (!this.initialized) {
            return;
        }

        if (changes['RowsData']) {
            if (this.RowsData) {
                this.PivotRows = this.RowsData;
                this.cdr.markForCheck();
            } else {
                this.LoadData();
            }
        } else if (changes['TimeRange'] || changes['Filters']) {
            this.LoadData();
        }
    }

    public get MeasureColumns(): PivotMeasureColumn[] {
        switch (this.SelectedMeasure) {
            case 'cost':
                return [
                    { key: 'OwnCost', label: 'Cost', format: 'currency', aggregation: 'sum' }
                ];
            case 'tokens':
                return [
                    { key: 'TokensPrompt', label: 'Prompt Tokens', format: 'number', aggregation: 'sum' },
                    { key: 'TokensCompletion', label: 'Completion Tokens', format: 'number', aggregation: 'sum' }
                ];
            case 'runs':
                return [
                    { key: 'Runs', label: 'Runs', format: 'number', aggregation: 'sum' },
                    { key: 'SucceededRuns', label: 'Succeeded', format: 'number', aggregation: 'sum' },
                    { key: 'FailedRuns', label: 'Failed', format: 'number', aggregation: 'sum' }
                ];
            case 'p95_latency':
            case 'p95 latency':
                return [
                    { key: 'LatencyP95', label: 'P95 Latency', format: 'duration', aggregation: 'avg' },
                    { key: 'LatencyP50', label: 'P50 Latency', format: 'duration', aggregation: 'avg' }
                ];
            case 'cache_read':
            case 'cache-read share':
                return [
                    { key: 'TokensCacheRead', label: 'Cache-Read Tokens', format: 'number', aggregation: 'sum' },
                    { key: 'TokensCacheWrite', label: 'Cache-Write Tokens', format: 'number', aggregation: 'sum' }
                ];
            case 'unpriced_pct':
            case 'unpriced %':
                return [
                    { key: 'UnpricedRuns', label: 'Unpriced Runs', format: 'number', aggregation: 'sum' },
                    { key: 'PricedRuns', label: 'Priced Runs', format: 'number', aggregation: 'sum' },
                    { key: 'UnmeasuredRuns', label: 'Unmeasured Runs', format: 'number', aggregation: 'sum' }
                ];
            default:
                return [
                    { key: 'OwnCost', label: 'Cost', format: 'currency', aggregation: 'sum' }
                ];
        }
    }

    public get DimensionColumns(): string[] {
        const cols = [this.SelectedGroupBy];
        if (this.SelectedSecondarySplit && this.SelectedSecondarySplit !== this.SelectedGroupBy) {
            cols.push(this.SelectedSecondarySplit);
        }
        return cols;
    }

    public get TimeColumn(): string {
        return this.SelectedGrain === 'hour' ? 'HourBucket' : 'DayBucket';
    }

    public async LoadData(): Promise<void> {
        if (this.RowsData !== null && this.RowsData !== undefined) {
            this.PivotRows = this.RowsData;
            this.cdr.markForCheck();
            return;
        }

        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            const { start, end, prevStart, prevEnd } = this.computeDateRange(this.TimeRange);

            let currentRows: Record<string, unknown>[] = [];
            let prevRows: Record<string, unknown>[] = [];

            if (this.SelectedGrain === 'hour') {
                const rawCurrent: AIUsageHourlyRow[] = await this.instrumentation.getUsageHourly(start, end);
                currentRows = this.applyFilters(rawCurrent.map(r => this.rowToRecord(r)));

                if (this.ComparisonEnabled) {
                    const rawPrev: AIUsageHourlyRow[] = await this.instrumentation.getUsageHourly(prevStart, prevEnd);
                    prevRows = this.applyFilters(rawPrev.map(r => this.rowToRecord(r)));
                }
            } else {
                const rawCurrent: AIUsageDailyRow[] = await this.instrumentation.getUsageDaily(start, end);
                currentRows = this.applyFilters(rawCurrent.map(r => this.rowToRecord(r)));

                if (this.ComparisonEnabled) {
                    const rawPrev: AIUsageDailyRow[] = await this.instrumentation.getUsageDaily(prevStart, prevEnd);
                    prevRows = this.applyFilters(rawPrev.map(r => this.rowToRecord(r)));
                }
            }

            if (this.ComparisonEnabled) {
                const taggedCurrent = currentRows.map(r => ({ ...r, _period: 'current' }));
                const taggedPrev = prevRows.map(r => ({ ...r, _period: 'previous' }));
                this.PivotRows = [...taggedCurrent, ...taggedPrev];
            } else {
                this.PivotRows = currentRows;
            }
        } catch (err) {
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
            this.navigationService.OpenEntityRecord('Users', CompositeKey.FromID(userId));
            return;
        }

        const configId = row['ConfigurationID'];
        if (typeof configId === 'string' && configId !== '—') {
            this.navigationService.OpenEntityRecord('MJ: AI Configurations', CompositeKey.FromID(configId));
            return;
        }
    }

    private rowToRecord(row: AIUsageHourlyRow | AIUsageDailyRow): Record<string, unknown> {
        return { ...(row as unknown as Record<string, unknown>) };
    }

    private applyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
        if (!this.Filters) {
            return rows;
        }

        return rows.filter(row => {
            if (this.Filters?.Models?.length && row['ModelID']) {
                if (!this.Filters.Models.includes(String(row['ModelID']))) {
                    return false;
                }
            }
            if (this.Filters?.Agents?.length && row['AgentID']) {
                if (!this.Filters.Agents.includes(String(row['AgentID']))) {
                    return false;
                }
            }
            if (this.Filters?.Prompts?.length && row['PromptID']) {
                if (!this.Filters.Prompts.includes(String(row['PromptID']))) {
                    return false;
                }
            }
            return true;
        });
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
