/**
 * @fileoverview Error Analysis -- Basic.
 *
 * Displays error summary cards, and errors grouped by source (Prompt+Model combination).
 * Each group can be expanded to show individual error details.
 * Data loaded from MJ: AI Prompt Runs where Success=false.
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

interface FailedRunRecord {
    ID: string;
    RunAt: string;
    ErrorMessage: string | null;
    Model: string | null;
    Prompt: string | null;
    Vendor: string | null;
    ExecutionTimeMS: number | null;
    Status: string;
}

interface ErrorSummary {
    TotalErrors: number;
    ErrorRate: number;
    MostCommonError: string;
}

interface ErrorGroup {
    Source: string;
    PromptName: string;
    ModelName: string;
    Count: number;
    LastErrorMessage: string;
    LastErrorTime: string;
    IsExpanded: boolean;
    Errors: ErrorDetail[];
}

interface ErrorDetail {
    ID: string;
    Time: string;
    ErrorMessage: string;
    Duration: string;
}

const FIELDS = [
    'ID', 'RunAt', 'ErrorMessage', 'Model', 'Prompt',
    'Vendor', 'ExecutionTimeMS', 'Status'
];

@Component({
    standalone: false,
    selector: 'app-analytics-error-analysis',
    template: `

        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading error data..."></mj-loading>
            </div>
        } @else {
            <!-- Summary Cards -->
            <div class="summary-row">
                <div class="summary-card summary-card--error">
                    <div class="summary-icon">
                        <i class="fa-solid fa-circle-exclamation"></i>
                    </div>
                    <div class="summary-content">
                        <div class="summary-label">Total Errors</div>
                        <div class="summary-value">{{ Summary.TotalErrors | number }}</div>
                    </div>
                </div>
                <div class="summary-card">
                    <div class="summary-icon summary-icon--warning">
                        <i class="fa-solid fa-percentage"></i>
                    </div>
                    <div class="summary-content">
                        <div class="summary-label">Error Rate</div>
                        <div class="summary-value">{{ Summary.ErrorRate | number:'1.1-1' }}%</div>
                    </div>
                </div>
                <div class="summary-card">
                    <div class="summary-icon summary-icon--info">
                        <i class="fa-solid fa-bug"></i>
                    </div>
                    <div class="summary-content">
                        <div class="summary-label">Most Common</div>
                        <div class="summary-value summary-value--text" [title]="Summary.MostCommonError">
                            {{ Summary.MostCommonError || 'N/A' }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Error Groups -->
            @if (ErrorGroups.length === 0) {
                <div class="empty-state">
                    <i class="fa-solid fa-check-circle empty-state__icon"></i>
                    <div class="empty-state__title">No Errors Found</div>
                    <div class="empty-state__subtitle">No errors detected in the selected time range.</div>
                </div>
            }

            @for (group of ErrorGroups; track group.Source) {
                <div class="error-group" [class.error-group--expanded]="group.IsExpanded">
                    <div
                        class="error-group__header"
                        (click)="ToggleGroup(group)"
                        role="button"
                        tabindex="0"
                        (keydown.enter)="ToggleGroup(group)">
                        <div class="error-group__left">
                            <i [class]="group.IsExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"
                               class="expand-icon"></i>
                            <div class="error-group__source">
                                <div class="source-name">{{ group.Source }}</div>
                                <div class="source-details">
                                    <span class="source-prompt">{{ group.PromptName }}</span>
                                    <span class="source-separator">+</span>
                                    <span class="source-model">{{ group.ModelName }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="error-group__right">
                            <span class="error-count-badge">{{ group.Count }}</span>
                            <div class="last-error-time">{{ group.LastErrorTime }}</div>
                        </div>
                    </div>

                    @if (!group.IsExpanded) {
                        <div class="error-group__preview">
                            <span class="preview-label">Last error:</span>
                            {{ group.LastErrorMessage }}
                        </div>
                    }

                    @if (group.IsExpanded) {
                        <div class="error-group__body">
                            @for (err of group.Errors; track err.ID) {
                                <div class="error-detail">
                                    <div class="error-detail__header">
                                        <span class="error-detail__time">{{ err.Time }}</span>
                                        @if (err.Duration) {
                                            <span class="error-detail__duration">{{ err.Duration }}</span>
                                        }
                                    </div>
                                    <div class="error-detail__message">{{ err.ErrorMessage }}</div>
                                </div>
                            }
                        </div>
                    }
                </div>
            }
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

        /* ── Summary Row ── */
        .summary-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin: 16px 0;
        }

        .summary-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .summary-card--error {
            border-left: 4px solid var(--mj-status-error);
        }

        .summary-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--mj-status-error) 12%, var(--mj-bg-surface));
            color: var(--mj-status-error);
            font-size: 16px;
            flex-shrink: 0;
        }

        .summary-icon--warning {
            background: color-mix(in srgb, var(--mj-status-warning) 12%, var(--mj-bg-surface));
            color: var(--mj-status-warning);
        }

        .summary-icon--info {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
        }

        .summary-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .summary-value {
            font-size: 22px;
            font-weight: 700;
            color: var(--mj-text-primary);
            letter-spacing: -0.02em;
        }

        .summary-value--text {
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 220px;
        }

        /* ── Empty State ── */
        .empty-state {
            text-align: center;
            padding: 48px 24px;
            color: var(--mj-text-muted);
        }

        .empty-state__icon {
            font-size: 40px;
            color: var(--mj-status-success);
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

        /* ── Error Groups ── */
        .error-group {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            margin-bottom: 8px;
            overflow: hidden;
            transition: border-color 0.2s;
        }

        .error-group--expanded {
            border-color: var(--mj-status-error);
        }

        .error-group__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .error-group__header:hover {
            background: var(--mj-bg-surface-hover);
        }

        .error-group__left {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .expand-icon {
            font-size: 11px;
            color: var(--mj-text-muted);
            width: 16px;
            flex-shrink: 0;
            transition: transform 0.2s;
        }

        .error-group__source {
            min-width: 0;
        }

        .source-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--mj-text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .source-details {
            font-size: 12px;
            color: var(--mj-text-muted);
            display: flex;
            align-items: center;
            gap: 4px;
            margin-top: 2px;
        }

        .source-separator {
            color: var(--mj-text-disabled);
        }

        .error-group__right {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }

        .error-count-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            height: 24px;
            padding: 0 8px;
            border-radius: 12px;
            background: color-mix(in srgb, var(--mj-status-error) 12%, var(--mj-bg-surface));
            color: var(--mj-status-error);
            font-size: 12px;
            font-weight: 700;
        }

        .last-error-time {
            font-size: 12px;
            color: var(--mj-text-disabled);
            white-space: nowrap;
        }

        .error-group__preview {
            padding: 0 16px 12px 42px;
            font-size: 12px;
            color: var(--mj-text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .preview-label {
            color: var(--mj-text-disabled);
            margin-right: 4px;
        }

        .error-group__body {
            border-top: 1px solid var(--mj-border-subtle);
            max-height: 400px;
            overflow-y: auto;
        }

        .error-detail {
            padding: 12px 16px 12px 42px;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .error-detail:last-child {
            border-bottom: none;
        }

        .error-detail__header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
        }

        .error-detail__time {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-muted);
        }

        .error-detail__duration {
            font-size: 11px;
            color: var(--mj-text-disabled);
            font-variant-numeric: tabular-nums;
        }

        .error-detail__message {
            font-size: 13px;
            color: var(--mj-status-error-text, var(--mj-status-error));
            line-height: 1.5;
            word-break: break-word;
            font-family: monospace;
            background: color-mix(in srgb, var(--mj-status-error) 5%, var(--mj-bg-surface));
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
            .summary-row {
                grid-template-columns: 1fr;
            }

            .summary-value {
                font-size: 18px;
            }
        }
    `]
})
export class AnalyticsErrorAnalysisComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.LoadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private _filters: GlobalFilterState = { Models: [], Agents: [], Prompts: [], Statuses: [] };
    @Input()
    set Filters(value: GlobalFilterState) {
        const next = value ?? { Models: [], Agents: [], Prompts: [], Statuses: [] };
        const changed = !this.shallowFiltersEqual(this._filters, next);
        this._filters = next;
        if (changed && this.initialized) this.LoadData();
    }
    get Filters(): GlobalFilterState { return this._filters; }

    private shallowFiltersEqual(a: GlobalFilterState, b: GlobalFilterState): boolean {
        const sameArr = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
        return sameArr(a.Models, b.Models) && sameArr(a.Agents, b.Agents) && sameArr(a.Prompts, b.Prompts) && sameArr(a.Statuses, b.Statuses);
    }

    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();
    private initialized = false;

    public IsLoading = false;

    public Summary: ErrorSummary = {
        TotalErrors: 0,
        ErrorRate: 0,
        MostCommonError: ''
    };

    public ErrorGroups: ErrorGroup[] = [];

    private failedRuns: FailedRunRecord[] = [];
    private totalRunCount = 0;

    ngOnInit(): void {
        this.initialized = true;
        this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Public Handlers ──

    public OnTimeRangeChange(range: string): void {
        this.TimeRange = range;
        this.LoadData();
    }

    public OnFiltersChange(filters: GlobalFilterState): void {
        this.Filters = filters;
        this.LoadData();
    }

    public ToggleGroup(group: ErrorGroup): void {
        group.IsExpanded = !group.IsExpanded;
        this.cdr.detectChanges();
    }

    // ── Data Loading ──

    private async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const dateFilter = this.buildDateFilter();
            const extraFilters = this.buildExtraFilters();
            const baseFilter = [dateFilter, ...extraFilters].filter(Boolean).join(' AND ');
            const errorFilter = baseFilter + ' AND Success = 0';

            const [errorResult, totalResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: errorFilter,
                    Fields: FIELDS,
                    OrderBy: 'RunAt DESC',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    ExtraFilter: baseFilter,
                    Fields: ['ID'],
                    ResultType: 'simple'
                }
            ]);

            this.failedRuns = (errorResult?.Results ?? []) as FailedRunRecord[];
            this.totalRunCount = totalResult?.Results?.length ?? 0;

            this.computeSummary();
            this.buildErrorGroups();
        } catch (e) {
            console.error('Error Analysis load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ── Computations ──

    private computeSummary(): void {
        const errorCount = this.failedRuns.length;
        const errorRate = this.totalRunCount > 0 ? (errorCount / this.totalRunCount) * 100 : 0;

        // Find most common error by grouping error messages
        const messageCounts = new Map<string, number>();
        for (const run of this.failedRuns) {
            const msg = this.normalizeErrorMessage(run.ErrorMessage ?? 'Unknown error');
            messageCounts.set(msg, (messageCounts.get(msg) ?? 0) + 1);
        }

        let mostCommon = '';
        let maxCount = 0;
        for (const [msg, count] of messageCounts) {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = msg;
            }
        }

        this.Summary = {
            TotalErrors: errorCount,
            ErrorRate: errorRate,
            MostCommonError: mostCommon
        };
    }

    private buildErrorGroups(): void {
        const groups = new Map<string, FailedRunRecord[]>();

        for (const run of this.failedRuns) {
            const prompt = run.Prompt ?? 'Unknown Prompt';
            const model = run.Model ?? 'Unknown Model';
            const key = prompt + ' + ' + model;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(run);
        }

        this.ErrorGroups = Array.from(groups.entries())
            .map(([source, runs]) => {
                const sortedRuns = runs.sort((a, b) =>
                    new Date(b.RunAt).getTime() - new Date(a.RunAt).getTime()
                );

                return {
                    Source: source,
                    PromptName: sortedRuns[0].Prompt ?? 'Unknown',
                    ModelName: sortedRuns[0].Model ?? 'Unknown',
                    Count: sortedRuns.length,
                    LastErrorMessage: this.truncateMessage(sortedRuns[0].ErrorMessage ?? 'No message'),
                    LastErrorTime: this.formatRelativeTime(sortedRuns[0].RunAt),
                    IsExpanded: false,
                    Errors: sortedRuns.slice(0, 20).map(r => ({
                        ID: r.ID,
                        Time: this.formatDateTime(r.RunAt),
                        ErrorMessage: r.ErrorMessage ?? 'No error message',
                        Duration: r.ExecutionTimeMS != null ? r.ExecutionTimeMS + 'ms' : ''
                    }))
                };
            })
            .sort((a, b) => b.Count - a.Count);
    }

    // ── Helpers ──

    private buildDateFilter(): string {
        const now = new Date();
        const msMap: Record<string, number> = {
            '1h': 3600000, '6h': 21600000, '24h': 86400000,
            '7d': 604800000, '30d': 2592000000
        };
        const ms = msMap[this.TimeRange] ?? 604800000;
        const start = new Date(now.getTime() - ms);
        return `RunAt >= '${start.toISOString()}'`;
    }

    private buildExtraFilters(): string[] {
        const filters: string[] = [];
        if (this.Filters.Models.length > 0) {
            filters.push(`ModelID IN (${this.Filters.Models.map(id => `'${id}'`).join(',')})`);
        }
        if (this.Filters.Prompts.length > 0) {
            filters.push(`PromptID IN (${this.Filters.Prompts.map(id => `'${id}'`).join(',')})`);
        }
        return filters;
    }

    private normalizeErrorMessage(msg: string): string {
        // Truncate and normalize for grouping
        return msg.slice(0, 100).trim().toLowerCase();
    }

    private truncateMessage(msg: string): string {
        if (msg.length <= 120) return msg;
        return msg.slice(0, 120) + '...';
    }

    private formatRelativeTime(dateStr: string): string {
        const now = Date.now();
        const then = new Date(dateStr).getTime();
        const diffMin = Math.floor((now - then) / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        const diffDay = Math.floor(diffHr / 24);
        return diffDay + 'd ago';
    }

    private formatDateTime(dateStr: string): string {
        const d = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        return `${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}`;
    }
}

export function LoadAnalyticsErrorAnalysis() { /* tree-shaking prevention */ }
