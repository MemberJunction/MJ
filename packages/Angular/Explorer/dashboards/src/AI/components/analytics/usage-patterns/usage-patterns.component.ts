/**
 * @fileoverview Usage Patterns Analytics.
 *
 * Displays a time-of-day heatmap (7 days × 24 hours), day-of-week distribution bars,
 * peak hours summary cards, and an hourly throughput bar chart.
 * Data loaded from MJ: AI Prompt Runs for the last 30 days.
 */

import {
    Component, Input, Output, EventEmitter,
    OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

// ── Interfaces ──

interface PromptRunRecord {
    ID: string;
    RunAt: string;
    Success: boolean;
    Cost: number | null;
    TokensUsed: number | null;
    ExecutionTimeMS: number | null;
}

interface HeatmapCell {
    Day: number;       // 0-6 (Mon-Sun)
    Hour: number;      // 0-23
    Count: number;
    Intensity: number; // 0-100
}

interface DayDistribution {
    DayIndex: number;
    DayName: string;
    Count: number;
    WidthPercent: number;
}

interface PeakSummary {
    Label: string;
    Value: string;
    Count: number;
    Icon: string;
}

interface HourlyBar {
    Hour: number;
    Label: string;
    Count: number;
    HeightPercent: number;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const FIELDS: string[] = [
    'ID', 'RunAt', 'Success', 'Cost', 'TokensUsed', 'ExecutionTimeMS'
];

@Component({
    standalone: false,
    selector: 'app-analytics-usage-patterns',
    template: `

        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Analyzing usage patterns..."></mj-loading>
            </div>
        } @else if (TotalRuns === 0) {
            <div class="empty-state">
                <i class="fa-solid fa-chart-line empty-state__icon"></i>
                <div class="empty-state__title">No Data Available</div>
                <div class="empty-state__subtitle">No prompt runs found in the last 30 days.</div>
            </div>
        } @else {
            <!-- Heatmap -->
            <div class="panel">
                <div class="panel__header">
                    <h4 class="panel__title">Time-of-Day Heatmap</h4>
                    <span class="panel__subtitle">Execution count by day and hour</span>
                </div>
                <div class="heatmap-wrapper">
                    <div class="heatmap-grid">
                        <!-- Corner spacer -->
                        <div class="heatmap-corner"></div>
                        <!-- Hour labels -->
                        @for (h of Hours; track h) {
                            <div class="heatmap-hour-label">{{ h }}</div>
                        }

                        <!-- Rows: one per day -->
                        @for (day of DayNames; track day; let d = $index) {
                            <div class="heatmap-day-label">{{ day }}</div>
                            @for (h of Hours; track h) {
                                <div
                                    class="heatmap-cell"
                                    [style.background]="getCellBackground(d, h)"
                                    [title]="getCellTooltip(d, h)">
                                    @if (getCellCount(d, h) > 0) {
                                        <span class="heatmap-cell__count">{{ getCellCount(d, h) }}</span>
                                    }
                                </div>
                            }
                        }
                    </div>
                </div>
            </div>

            <!-- Day Distribution + Peak Summary -->
            <div class="two-col-row">
                <!-- Day-of-Week Distribution -->
                <div class="panel">
                    <div class="panel__header">
                        <h4 class="panel__title">Day-of-Week Distribution</h4>
                    </div>
                    <div class="day-distribution">
                        @for (d of DayDistributions; track d.DayIndex) {
                            <div class="day-bar-row">
                                <span class="day-bar-label">{{ d.DayName }}</span>
                                <div class="day-bar-track">
                                    <div
                                        class="day-bar-fill"
                                        [style.width.%]="d.WidthPercent">
                                    </div>
                                </div>
                                <span class="day-bar-count">{{ d.Count | number }}</span>
                            </div>
                        }
                    </div>
                </div>

                <!-- Peak Hours Summary -->
                <div class="panel">
                    <div class="panel__header">
                        <h4 class="panel__title">Peak Hours Summary</h4>
                    </div>
                    <div class="peak-cards">
                        @for (peak of PeakSummaries; track peak.Label) {
                            <div class="peak-card">
                                <div class="peak-card__icon">
                                    <i [class]="peak.Icon"></i>
                                </div>
                                <div class="peak-card__content">
                                    <div class="peak-card__label">{{ peak.Label }}</div>
                                    <div class="peak-card__value">{{ peak.Value }}</div>
                                    <div class="peak-card__count">{{ peak.Count | number }} runs</div>
                                </div>
                            </div>
                        }
                    </div>
                </div>
            </div>

            <!-- Hourly Throughput -->
            <div class="panel">
                <div class="panel__header">
                    <h4 class="panel__title">Hourly Throughput</h4>
                    <span class="panel__subtitle">Total runs per hour (all days combined)</span>
                </div>
                <div class="hourly-chart">
                    <div class="hourly-bars">
                        @for (bar of HourlyBars; track bar.Hour) {
                            <div class="hourly-bar-col" [title]="bar.Label + ': ' + bar.Count + ' runs'">
                                <div
                                    class="hourly-bar"
                                    [style.height.%]="bar.HeightPercent">
                                </div>
                                <span class="hourly-bar-label">{{ bar.Label }}</span>
                            </div>
                        }
                    </div>
                </div>
            </div>
        }
    `,
    styles: [`
        :host { display: block; }

        /* ── Header ── */
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .section-header__left {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .section-header__icon {
            font-size: 18px;
            color: var(--mj-brand-primary);
        }

        .section-header__title {
            font-size: 18px;
            font-weight: 700;
            color: var(--mj-text-primary);
            margin: 0;
        }

        .time-range-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-subtle);
        }

        /* ── Loading / Empty ── */
        .loading-container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 300px;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 24px;
            text-align: center;
        }

        .empty-state__icon {
            font-size: 36px;
            color: var(--mj-text-muted);
            margin-bottom: 12px;
        }

        .empty-state__title {
            font-size: 16px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin-bottom: 4px;
        }

        .empty-state__subtitle {
            font-size: 13px;
            color: var(--mj-text-muted);
        }

        /* ── Panels ── */
        .panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
        }

        .panel__header {
            display: flex;
            align-items: baseline;
            gap: 10px;
            margin-bottom: 16px;
        }

        .panel__title {
            font-size: 14px;
            font-weight: 600;
            color: var(--mj-text-primary);
            margin: 0;
        }

        .panel__subtitle {
            font-size: 12px;
            color: var(--mj-text-muted);
        }

        /* ── Heatmap ── */
        .heatmap-wrapper {
            overflow-x: auto;
        }

        .heatmap-grid {
            display: grid;
            grid-template-columns: 44px repeat(24, 1fr);
            gap: 2px;
            min-width: 600px;
        }

        .heatmap-corner {
            /* empty top-left cell */
        }

        .heatmap-hour-label {
            font-size: 10px;
            color: var(--mj-text-muted);
            text-align: center;
            padding-bottom: 4px;
            font-weight: 500;
        }

        .heatmap-day-label {
            font-size: 11px;
            color: var(--mj-text-secondary);
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 6px;
        }

        .heatmap-cell {
            min-height: 28px;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: default;
            transition: opacity 0.15s ease;
        }

        .heatmap-cell:hover {
            opacity: 0.8;
            outline: 1px solid var(--mj-border-strong);
        }

        .heatmap-cell__count {
            font-size: 9px;
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        /* ── Two Column Row ── */
        .two-col-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        @media (max-width: 1024px) {
            .two-col-row {
                grid-template-columns: 1fr;
            }
        }

        /* ── Day Distribution ── */
        .day-distribution {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .day-bar-row {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .day-bar-label {
            width: 36px;
            font-size: 12px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            text-align: right;
            flex-shrink: 0;
        }

        .day-bar-track {
            flex: 1;
            height: 22px;
            background: var(--mj-bg-surface-sunken);
            border-radius: 4px;
            overflow: hidden;
        }

        .day-bar-fill {
            height: 100%;
            background: var(--mj-brand-primary);
            border-radius: 4px;
            transition: width 0.3s ease;
            min-width: 2px;
        }

        .day-bar-count {
            width: 48px;
            font-size: 12px;
            font-weight: 600;
            color: var(--mj-text-primary);
            text-align: right;
            flex-shrink: 0;
        }

        /* ── Peak Cards ── */
        .peak-cards {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .peak-card {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px;
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-subtle);
            border-radius: 10px;
        }

        .peak-card__icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
        }

        .peak-card:nth-child(2) .peak-card__icon {
            background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
            color: var(--mj-status-success);
        }

        .peak-card:nth-child(3) .peak-card__icon {
            background: color-mix(in srgb, var(--mj-status-info) 10%, var(--mj-bg-surface));
            color: var(--mj-status-info);
        }

        .peak-card__content {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .peak-card__label {
            font-size: 11px;
            font-weight: 500;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .peak-card__value {
            font-size: 14px;
            font-weight: 700;
            color: var(--mj-text-primary);
        }

        .peak-card__count {
            font-size: 12px;
            color: var(--mj-text-secondary);
        }

        /* ── Hourly Throughput Chart ── */
        .hourly-chart {
            padding-top: 8px;
        }

        .hourly-bars {
            display: flex;
            align-items: flex-end;
            gap: 3px;
            height: 160px;
        }

        .hourly-bar-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            height: 100%;
            cursor: default;
        }

        .hourly-bar {
            width: 100%;
            min-height: 2px;
            background: color-mix(in srgb, var(--mj-brand-primary) 35%, var(--mj-bg-surface));
            border-radius: 3px 3px 0 0;
            transition: background 0.15s ease, height 0.3s ease;
        }

        .hourly-bar-col:hover .hourly-bar {
            background: color-mix(in srgb, var(--mj-brand-primary) 60%, var(--mj-bg-surface));
        }

        .hourly-bar-label {
            font-size: 9px;
            color: var(--mj-text-muted);
            margin-top: 4px;
            white-space: nowrap;
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
            .heatmap-grid {
                grid-template-columns: 36px repeat(24, 1fr);
            }

            .heatmap-cell {
                min-height: 22px;
            }

            .heatmap-cell__count {
                font-size: 8px;
            }

            .hourly-bars {
                height: 120px;
            }
        }
    `]
})
export class AnalyticsUsagePatternsComponent extends BaseAngularComponent implements OnInit, OnDestroy {

    private _timeRange = '30d';
    private isInitialized = false;

    @Input()
    set TimeRange(value: string) {
        if (value !== this._timeRange) {
            this._timeRange = value;
            if (this.isInitialized) {
                this.loadData();
            }
        }
    }
    get TimeRange(): string { return this._timeRange; }

    @Output() TimeRangeChange = new EventEmitter<string>();

    // ── Public state ──
    IsLoading = true;
    TotalRuns = 0;

    HeatmapCells: HeatmapCell[][] = []; // [day][hour]
    DayDistributions: DayDistribution[] = [];
    PeakSummaries: PeakSummary[] = [];
    HourlyBars: HourlyBar[] = [];

    readonly DayNames = DAY_NAMES;
    readonly Hours = HOURS;

    // ── Private ──
    private destroy$ = new Subject<void>();
    private cdr = inject(ChangeDetectorRef);

    async ngOnInit(): Promise<void> {
        await this.loadData();
        this.isInitialized = true;
    }

    OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Heatmap helpers (called from template) ──

    getCellBackground(day: number, hour: number): string {
        const intensity = this.HeatmapCells[day]?.[hour]?.Intensity ?? 0;
        return `color-mix(in srgb, var(--mj-brand-primary) ${intensity}%, var(--mj-bg-surface))`;
    }

    getCellTooltip(day: number, hour: number): string {
        const count = this.HeatmapCells[day]?.[hour]?.Count ?? 0;
        return `${DAY_NAMES[day]} ${this.formatHourLabel(hour)}: ${count} runs`;
    }

    getCellCount(day: number, hour: number): number {
        return this.HeatmapCells[day]?.[hour]?.Count ?? 0;
    }

    // ── Data Loading ──

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const runs = await this.fetchPromptRuns();
            this.TotalRuns = runs.length;

            if (runs.length > 0) {
                const dayCounts = this.buildDayHourCounts(runs);
                this.HeatmapCells = this.buildHeatmap(dayCounts);
                this.DayDistributions = this.buildDayDistributions(dayCounts);
                this.HourlyBars = this.buildHourlyBars(dayCounts);
                this.PeakSummaries = this.buildPeakSummaries(dayCounts);
            }
        } catch (err) {
            console.error('Usage patterns data load failed:', err);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async fetchPromptRuns(): Promise<PromptRunRecord[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const since = new Date();
        switch (this.TimeRange) {
            case '1h': since.setHours(since.getHours() - 1); break;
            case '6h': since.setHours(since.getHours() - 6); break;
            case '24h': since.setDate(since.getDate() - 1); break;
            case '7d': since.setDate(since.getDate() - 7); break;
            case '30d': default: since.setDate(since.getDate() - 30); break;
        }
        const sinceStr = since.toISOString();

        const result = await rv.RunView<PromptRunRecord>({
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `RunAt >= '${sinceStr}'`,
            Fields: FIELDS,
            ResultType: 'simple'
        });

        if (!result.Success) {
            console.error('Failed to load prompt runs:', result.ErrorMessage);
            return [];
        }

        return result.Results ?? [];
    }

    /**
     * Build a 7×24 count matrix: dayCounts[dayIndex][hour] = count.
     * dayIndex 0 = Monday, 6 = Sunday. Uses the JS Date getDay() offset.
     */
    private buildDayHourCounts(runs: PromptRunRecord[]): number[][] {
        const counts: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

        for (const run of runs) {
            const dt = new Date(run.RunAt);
            const jsDay = dt.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Mon, 6=Sun
            const hour = dt.getHours();
            counts[dayIndex][hour]++;
        }

        return counts;
    }

    private buildHeatmap(dayCounts: number[][]): HeatmapCell[][] {
        const maxCount = this.findMaxCount(dayCounts);

        return dayCounts.map((hours, day) =>
            hours.map((count, hour) => ({
                Day: day,
                Hour: hour,
                Count: count,
                Intensity: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0
            }))
        );
    }

    private buildDayDistributions(dayCounts: number[][]): DayDistribution[] {
        const daySums = dayCounts.map(hours => hours.reduce((sum, c) => sum + c, 0));
        const maxDay = Math.max(...daySums, 1);

        return daySums.map((count, i) => ({
            DayIndex: i,
            DayName: DAY_NAMES[i],
            Count: count,
            WidthPercent: Math.round((count / maxDay) * 100)
        }));
    }

    private buildHourlyBars(dayCounts: number[][]): HourlyBar[] {
        const hourSums = HOURS.map(h =>
            dayCounts.reduce((sum, dayHours) => sum + dayHours[h], 0)
        );
        const maxHour = Math.max(...hourSums, 1);

        return hourSums.map((count, h) => ({
            Hour: h,
            Label: this.formatHourLabel(h),
            Count: count,
            HeightPercent: Math.round((count / maxHour) * 100)
        }));
    }

    private buildPeakSummaries(dayCounts: number[][]): PeakSummary[] {
        const hourSums = HOURS.map(h =>
            dayCounts.reduce((sum, dayHours) => sum + dayHours[h], 0)
        );
        const daySums = dayCounts.map(hours => hours.reduce((sum, c) => sum + c, 0));

        // Busiest hour
        const busiestHourIdx = this.indexOfMax(hourSums);
        const busiestHour: PeakSummary = {
            Label: 'Busiest Hour',
            Value: `${this.formatHourRange(busiestHourIdx)}`,
            Count: hourSums[busiestHourIdx],
            Icon: 'fa-solid fa-fire'
        };

        // Busiest day
        const busiestDayIdx = this.indexOfMax(daySums);
        const busiestDay: PeakSummary = {
            Label: 'Busiest Day',
            Value: this.fullDayName(busiestDayIdx),
            Count: daySums[busiestDayIdx],
            Icon: 'fa-solid fa-calendar-day'
        };

        // Quietest cell (day+hour combo)
        let minCount = Infinity;
        let quietDay = 0;
        let quietHour = 0;
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                if (dayCounts[d][h] < minCount) {
                    minCount = dayCounts[d][h];
                    quietDay = d;
                    quietHour = h;
                }
            }
        }

        const quietest: PeakSummary = {
            Label: 'Quietest Period',
            Value: `${DAY_NAMES[quietDay]} ${this.formatHourLabel(quietHour)}`,
            Count: minCount,
            Icon: 'fa-solid fa-moon'
        };

        return [busiestHour, busiestDay, quietest];
    }

    // ── Utility helpers ──

    private findMaxCount(dayCounts: number[][]): number {
        let max = 0;
        for (const hours of dayCounts) {
            for (const c of hours) {
                if (c > max) max = c;
            }
        }
        return max;
    }

    private indexOfMax(arr: number[]): number {
        let maxIdx = 0;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] > arr[maxIdx]) maxIdx = i;
        }
        return maxIdx;
    }

    private formatHourLabel(h: number): string {
        if (h === 0) return '12a';
        if (h < 12) return `${h}a`;
        if (h === 12) return '12p';
        return `${h - 12}p`;
    }

    private formatHourRange(h: number): string {
        const start = this.formatHour12(h);
        const end = this.formatHour12((h + 1) % 24);
        return `${start} - ${end}`;
    }

    private formatHour12(h: number): string {
        if (h === 0) return '12:00 AM';
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return '12:00 PM';
        return `${h - 12}:00 PM`;
    }

    private fullDayName(idx: number): string {
        const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return names[idx] ?? 'Unknown';
    }
}

export function LoadAnalyticsUsagePatterns() { /* tree-shaking prevention */ }
