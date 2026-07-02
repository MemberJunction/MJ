/**
 * @fileoverview Realtime Voice — analytics overview section.
 *
 * Operational analytics for voice-agent sessions, built from
 * `MJ: AI Agent Sessions`, their `MJ: AI Agent Session Channels` rows, and the
 * delegated `MJ: AI Agent Runs` linked via `AgentSessionID`. Renders the KPI
 * row (active sessions, sessions in window, avg duration, delegated runs,
 * janitor closes, cost), a sessions-over-time bar chart, the channel-usage
 * donut, the top delegated target agents, and a recent-sessions list with a
 * "View all" jump to the full sessions grid.
 */

import {
    Component, Input, Output, EventEmitter,
    OnInit, ChangeDetectorRef, inject
} from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedService } from '@memberjunction/ng-shared';
import { KPICardData } from '../../widgets/kpi-card.component';
import {
    RealtimeSessionRollup, RealtimeSessionsDataset,
    LoadRealtimeSessionsDataset, FormatSessionDuration, FormatTokenCount,
    FormatSessionCost, ChannelIconClass, TimeRangeToMs,
    BuildSessionStatusDisplay
} from './realtime-session-data';

// ── View models ──

interface TimeBucket {
    Label: string;
    Count: number;
    /** 0–100, relative to the busiest bucket. */
    HeightPercent: number;
    /** Flagged when the bucket is delegated-heavy (≥2 delegated runs/session avg). */
    DelegatedHeavy: boolean;
}

interface ChannelShare {
    Name: string;
    Count: number;
    Percent: number;
    Color: string;
}

interface TargetAgentBar {
    Name: string;
    Count: number;
    WidthPercent: number;
}

interface RecentSessionRow {
    ID: string;
    Target: string;
    ViaAgent: string;
    User: string;
    Status: string;
    StatusClass: string;
    StatusLabel: string;
    StatusTitle: string;
    /** Pill icon (close cause for Closed rows); empty for Active, which renders the live dot. */
    StatusIcon: string;
    ChannelIcons: string[];
    Runs: number;
    Cost: string;
    Duration: string;
}

const DONUT_COLORS = [
    'var(--mj-brand-primary)',
    'var(--mj-status-success)',
    'var(--mj-brand-accent)',
    'var(--mj-status-warning)',
    'var(--mj-text-disabled)'
];

@Component({
    standalone: false,
    selector: 'app-analytics-realtime-overview',
    template: `
        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading realtime voice analytics..."></mj-loading>
            </div>
        } @else {
            <!-- KPI Row -->
            <div class="kpi-grid">
                @for (kpi of KPICards; track kpi.title) {
                    <app-kpi-card [data]="kpi"></app-kpi-card>
                }
            </div>

            <!-- Charts row 1: sessions over time + channel usage -->
            <div class="charts-2">
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-header__title">
                            <i class="fa-solid fa-chart-column panel-header__icon"></i>
                            Sessions over time
                        </div>
                        <span class="panel-header__subtitle">Accented bars = delegated-heavy</span>
                    </div>
                    <div class="panel-body">
                        @if (TimeBuckets.length === 0) {
                            <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-chart-column"
                                Title="No sessions in the selected period" />
                        } @else {
                            <div class="bars">
                                @for (bucket of TimeBuckets; track bucket.Label) {
                                    <div class="bcol" [title]="bucket.Label + ': ' + bucket.Count + ' session(s)'">
                                        <div class="bar"
                                             [class.bar--accent]="bucket.DelegatedHeavy"
                                             [style.height.%]="bucket.HeightPercent"></div>
                                        <div class="blabel">{{ bucket.Label }}</div>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-header__title">
                            <i class="fa-solid fa-chart-pie panel-header__icon"></i>
                            Channel usage
                        </div>
                        <span class="panel-header__subtitle">Share of attached session channels</span>
                    </div>
                    <div class="panel-body">
                        @if (ChannelShares.length === 0) {
                            <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-chart-pie"
                                Title="No channels attached in the selected period" />
                        } @else {
                            <div class="donut-row">
                                <div class="donut" [style.background]="DonutGradient"></div>
                                <div class="legend">
                                    @for (share of ChannelShares; track share.Name) {
                                        <div class="legend-item">
                                            <span class="legend-dot" [style.background]="share.Color"></span>
                                            {{ share.Name }}
                                            <span class="legend-pct">{{ share.Percent | number:'1.0-0' }}%</span>
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                </div>
            </div>

            <!-- Charts row 2: top delegated target agents -->
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-header__title">
                        <i class="fa-solid fa-diagram-project panel-header__icon"></i>
                        Top delegated target agents
                    </div>
                    <span class="panel-header__subtitle">Delegated agent runs by target · selected period</span>
                </div>
                <div class="panel-body">
                    @if (TopTargetAgents.length === 0) {
                        <mj-empty-state Size="compact" Variant="empty" Icon="fa-solid fa-diagram-project"
                            Title="No delegated runs in the selected period" />
                    }
                    @for (bar of TopTargetAgents; track bar.Name) {
                        <div class="hbar-row">
                            <span class="hbar-name" [title]="bar.Name">{{ bar.Name }}</span>
                            <span class="hbar-track">
                                <span class="hbar-fill" [style.width.%]="bar.WidthPercent"></span>
                            </span>
                            <span class="hbar-val">{{ bar.Count }}</span>
                        </div>
                    }
                </div>
            </div>

            <!-- Recent sessions -->
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-header__title">
                        <i class="fa-solid fa-tower-broadcast panel-header__icon"></i>
                        Recent sessions
                    </div>
                    <button mjButton variant="secondary" size="sm" (click)="SectionNavigate.emit('realtime-sessions')">
                        View all <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Target</th><th>User</th><th>Status</th><th>Channels</th>
                                <th class="th-numeric">Runs</th><th class="th-numeric">Cost</th>
                                <th class="th-numeric">Duration</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @if (RecentSessions.length === 0) {
                                <tr><td colspan="8" class="empty-row">No sessions in the selected period</td></tr>
                            }
                            @for (row of RecentSessions; track row.ID) {
                                <tr class="session-row" (click)="OpenSession(row.ID)">
                                    <td>
                                        <div class="cell-strong">{{ row.Target }}</div>
                                        <div class="cell-sub">via {{ row.ViaAgent }}</div>
                                    </td>
                                    <td>{{ row.User }}</td>
                                    <td>
                                        <span class="status-pill" [class]="row.StatusClass"
                                              [title]="row.StatusTitle">
                                            @if (row.Status === 'Active') { <span class="dot dot--live"></span> }
                                            @else if (row.StatusIcon) { <i [class]="row.StatusIcon"></i> }
                                            {{ row.StatusLabel }}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="chan-icons">
                                            @for (icon of row.ChannelIcons; track $index) {
                                                <i [class]="icon"></i>
                                            }
                                        </span>
                                    </td>
                                    <td class="cell-numeric">{{ row.Runs }}</td>
                                    <td class="cell-numeric mono">{{ row.Cost }}</td>
                                    <td class="cell-numeric mono">{{ row.Duration }}</td>
                                    <td class="cell-action">
                                        <button mjButton variant="icon" size="sm" title="Open session record"
                                                (click)="OpenSession(row.ID); $event.stopPropagation()">
                                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                        </button>
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

        /* ── KPI Grid ── */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        /* ── Layout ── */
        .charts-2 {
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }

        @media (max-width: 1000px) {
            .charts-2 { grid-template-columns: 1fr; }
        }

        /* ── Panel (matches sibling analytics sections) ── */
        .panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            margin-bottom: 16px;
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

        .panel-body { padding: 16px 18px; }

        /* ── Vertical bars ── */
        .bars {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            height: 160px;
        }

        .bcol {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            height: 100%;
            min-width: 0;
        }

        .bar {
            width: 100%;
            max-width: 42px;
            min-height: 2px;
            border-radius: 6px 6px 2px 2px;
            background: linear-gradient(180deg,
                color-mix(in srgb, var(--mj-brand-primary) 85%, transparent),
                color-mix(in srgb, var(--mj-brand-primary) 55%, transparent));
            transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .bar--accent {
            background: linear-gradient(180deg,
                color-mix(in srgb, var(--mj-status-success) 85%, transparent),
                color-mix(in srgb, var(--mj-status-success) 55%, transparent));
        }

        .blabel {
            margin-top: 6px;
            font-size: 10px;
            color: var(--mj-text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }

        /* ── Donut ── */
        .donut-row {
            display: flex;
            align-items: center;
            gap: 22px;
            flex-wrap: wrap;
        }

        .donut {
            width: 140px;
            height: 140px;
            border-radius: 50%;
            flex-shrink: 0;
            -webkit-mask: radial-gradient(circle at center, transparent 42px, #000 43px);
            mask: radial-gradient(circle at center, transparent 42px, #000 43px);
        }

        .legend {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 160px;
            flex: 1;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12.5px;
            color: var(--mj-text-secondary);
        }

        .legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .legend-pct {
            margin-left: auto;
            color: var(--mj-text-muted);
            font-variant-numeric: tabular-nums;
        }

        /* ── Horizontal bars ── */
        .hbar-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
        }

        .hbar-row:last-child { margin-bottom: 0; }

        .hbar-name {
            width: 140px;
            min-width: 140px;
            font-size: 13px;
            font-weight: 500;
            color: var(--mj-text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .hbar-track {
            flex: 1;
            height: 18px;
            border-radius: 6px;
            background: var(--mj-bg-surface-sunken);
            overflow: hidden;
        }

        .hbar-fill {
            display: block;
            height: 100%;
            border-radius: 6px;
            background: linear-gradient(90deg,
                var(--mj-brand-primary),
                color-mix(in srgb, var(--mj-brand-primary) 65%, var(--mj-bg-surface)));
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .hbar-val {
            width: 48px;
            min-width: 48px;
            text-align: right;
            font-size: 13px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            font-variant-numeric: tabular-nums;
        }

        /* ── Table ── */
        .table-wrapper { overflow-x: auto; }

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
        }

        .th-numeric { text-align: right; }

        .session-row { cursor: pointer; transition: background 0.15s; }
        .session-row:hover { background: var(--mj-bg-surface-hover); }

        .cell-strong {
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .cell-sub {
            font-size: 11px;
            color: var(--mj-text-muted);
        }

        .cell-numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
            color: var(--mj-text-secondary);
        }

        .cell-action { text-align: right; white-space: nowrap; }

        .mono {
            font-family: var(--mj-font-mono, monospace);
            font-size: 12px;
        }

        .empty-row {
            text-align: center;
            color: var(--mj-text-disabled);
            padding: 24px;
        }

        /* ── Status pills ── */
        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.3px;
            white-space: nowrap;
        }

        .status-active {
            background: color-mix(in srgb, var(--mj-status-success) 12%, var(--mj-bg-surface));
            color: var(--mj-status-success);
        }

        .status-idle {
            background: color-mix(in srgb, var(--mj-status-warning) 12%, var(--mj-bg-surface));
            color: var(--mj-status-warning);
        }

        .status-closed {
            background: color-mix(in srgb, var(--mj-text-disabled) 12%, var(--mj-bg-surface));
            color: var(--mj-text-muted);
        }

        .dot--live {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--mj-status-success);
            animation: pulse-live 1.6s ease-in-out infinite;
        }

        @keyframes pulse-live {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
        }

        .chan-icons {
            display: inline-flex;
            gap: 8px;
            color: var(--mj-text-secondary);
            font-size: 13px;
        }
    `]
})
export class AnalyticsRealtimeOverviewComponent extends BaseAngularComponent implements OnInit {
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.LoadData();
    }
    get TimeRange(): string { return this._timeRange; }

    /** Lets the shell jump to the full sessions grid (mirrors Executive Summary's pattern). */
    @Output() SectionNavigate = new EventEmitter<string>();

    private initialized = false;
    private cdr = inject(ChangeDetectorRef);
    private dataset: RealtimeSessionsDataset | null = null;

    public IsLoading = false;
    public KPICards: KPICardData[] = [];
    public TimeBuckets: TimeBucket[] = [];
    public ChannelShares: ChannelShare[] = [];
    public DonutGradient = '';
    public TopTargetAgents: TargetAgentBar[] = [];
    public RecentSessions: RecentSessionRow[] = [];

    ngOnInit(): void {
        this.initialized = true;
        this.LoadData();
    }

    /** Reloads everything for the current time range. */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();
        try {
            this.dataset = await LoadRealtimeSessionsDataset(this.ProviderToUse, this.TimeRange);
            this.buildKPICards();
            this.buildTimeBuckets();
            this.buildChannelShares();
            this.buildTopTargetAgents();
            this.buildRecentSessions();
        } catch (e) {
            console.error('Realtime Voice overview load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Opens the AIAgentSession record using the shared Explorer record-open path. */
    public OpenSession(sessionId: string): void {
        const key = new CompositeKey();
        key.LoadFromSingleKeyValuePair('ID', sessionId);
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Sessions', key);
    }

    // ── Builders ──

    private get windowSessions(): RealtimeSessionRollup[] {
        return this.dataset?.Sessions ?? [];
    }

    private buildKPICards(): void {
        const ds = this.dataset;
        const sessions = this.windowSessions;
        const activeCount = sessions.filter(s => s.Record.Status === 'Active').length;
        const startedInWindow = sessions.filter(s => ds != null && s.StartedAt >= ds.WindowStart);
        const priorCount = ds?.PriorWindowSessionCount ?? 0;

        const durations = sessions.map(s => s.DurationMs).filter(d => d > 0);
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

        const delegatedTotal = sessions.reduce((a, s) => a + s.DelegatedRunCount, 0);
        const delegatedPerSession = sessions.length > 0 ? delegatedTotal / sessions.length : 0;
        const janitorCloses = sessions.filter(s => s.IsJanitorClosed).length;
        const totalCost = sessions.reduce((a, s) => a + s.TotalCost, 0);

        const trendPct = priorCount > 0
            ? Math.round(((startedInWindow.length - priorCount) / priorCount) * 100)
            : 0;

        this.KPICards = [
            {
                title: 'Active sessions',
                value: activeCount,
                subtitle: 'live right now',
                icon: 'fa-tower-broadcast',
                color: 'success'
            },
            {
                title: `Sessions (${this.TimeRange})`,
                value: startedInWindow.length,
                icon: 'fa-calendar-day',
                color: 'primary',
                trend: priorCount > 0 ? {
                    direction: trendPct > 0 ? 'up' : trendPct < 0 ? 'down' : 'stable',
                    percentage: Math.abs(trendPct),
                    period: `vs prior ${this.TimeRange}`
                } : undefined,
                subtitle: priorCount > 0 ? undefined : 'no prior-period data'
            },
            {
                title: 'Avg duration',
                value: FormatSessionDuration(avgDuration),
                subtitle: 'min:sec per session',
                icon: 'fa-stopwatch',
                color: 'info'
            },
            {
                title: 'Delegated runs',
                value: delegatedTotal,
                subtitle: `${delegatedPerSession.toFixed(1)} per session avg`,
                icon: 'fa-diagram-project',
                color: 'info'
            },
            {
                title: 'Janitor closes',
                value: janitorCloses,
                subtitle: `orphans reconciled (${this.TimeRange})`,
                icon: 'fa-broom',
                color: 'warning'
            },
            {
                title: `Cost (${this.TimeRange})`,
                value: FormatSessionCost(totalCost),
                subtitle: 'co-agent + delegated',
                icon: 'fa-coins',
                color: 'danger'
            }
        ];
    }

    private buildTimeBuckets(): void {
        const ds = this.dataset;
        if (!ds) { this.TimeBuckets = []; return; }

        const hourly = this.TimeRange === '24h';
        const bucketMs = hourly ? 3_600_000 : 86_400_000;
        const bucketCount = Math.max(1, Math.round(ds.WindowMs / bucketMs));
        const now = Date.now();
        const buckets: { start: number; count: number; delegated: number }[] = [];
        for (let i = bucketCount - 1; i >= 0; i--) {
            buckets.push({ start: now - (i + 1) * bucketMs, count: 0, delegated: 0 });
        }

        for (const session of this.windowSessions) {
            const t = session.StartedAt.getTime();
            const idx = buckets.findIndex(b => t >= b.start && t < b.start + bucketMs);
            if (idx >= 0) {
                buckets[idx].count++;
                buckets[idx].delegated += session.DelegatedRunCount;
            }
        }

        const max = Math.max(1, ...buckets.map(b => b.count));
        this.TimeBuckets = buckets.map((b, i) => {
            const date = new Date(b.start + bucketMs);
            const isLast = i === buckets.length - 1;
            const label = hourly
                ? date.toLocaleTimeString([], { hour: 'numeric' }).toLowerCase()
                : isLast ? 'Today' : date.toLocaleDateString([], { weekday: this.TimeRange === '7d' ? 'short' : undefined, month: this.TimeRange === '7d' ? undefined : 'numeric', day: this.TimeRange === '7d' ? undefined : 'numeric' });
            return {
                Label: label,
                Count: b.count,
                HeightPercent: Math.round((b.count / max) * 100),
                DelegatedHeavy: b.count > 0 && b.delegated / b.count >= 2
            };
        });
    }

    private buildChannelShares(): void {
        const counts = new Map<string, number>();
        for (const session of this.windowSessions) {
            for (const name of session.ChannelNames) {
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }
        const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
        if (total === 0) {
            this.ChannelShares = [];
            this.DonutGradient = '';
            return;
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        this.ChannelShares = sorted.map(([name, count], i) => ({
            Name: name,
            Count: count,
            Percent: (count / total) * 100,
            Color: DONUT_COLORS[i % DONUT_COLORS.length]
        }));

        let cursor = 0;
        const stops: string[] = [];
        for (const share of this.ChannelShares) {
            const end = cursor + share.Percent;
            stops.push(`${share.Color} ${cursor.toFixed(2)}% ${end.toFixed(2)}%`);
            cursor = end;
        }
        this.DonutGradient = `conic-gradient(${stops.join(', ')})`;
    }

    private buildTopTargetAgents(): void {
        const counts = new Map<string, number>();
        for (const session of this.windowSessions) {
            if (session.DelegatedRunCount === 0) continue;
            const name = session.TargetAgentName ?? session.TargetAgentID ?? 'Unknown';
            counts.set(name, (counts.get(name) ?? 0) + session.DelegatedRunCount);
        }
        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        const max = Math.max(1, ...sorted.map(([, c]) => c));
        this.TopTargetAgents = sorted.map(([name, count]) => ({
            Name: name,
            Count: count,
            WidthPercent: Math.round((count / max) * 100)
        }));
    }

    private buildRecentSessions(): void {
        this.RecentSessions = [...this.windowSessions]
            .sort((a, b) => b.StartedAt.getTime() - a.StartedAt.getTime())
            .slice(0, 8)
            .map(s => {
                const statusDisplay = BuildSessionStatusDisplay(s.Record.Status, s.CloseReason);
                return {
                    ID: s.Record.ID,
                    Target: s.TargetAgentName ?? s.Record.Agent ?? 'Unknown',
                    ViaAgent: s.Record.Agent ?? 'Unknown',
                    User: s.Record.User,
                    Status: s.Record.Status,
                    StatusClass: 'status-pill status-' + s.Record.Status.toLowerCase(),
                    StatusLabel: statusDisplay.Label,
                    StatusTitle: statusDisplay.Title,
                    StatusIcon: statusDisplay.Icon,
                    ChannelIcons: s.ChannelNames.map(ChannelIconClass),
                    Runs: s.DelegatedRunCount,
                    Cost: FormatSessionCost(s.TotalCost),
                    Duration: FormatSessionDuration(s.DurationMs)
                };
            });
    }

    /** Exposed for testability / template type narrowing. */
    public FormatTokens(value: number): string {
        return FormatTokenCount(value);
    }

    /** Window length in ms for the active range (exposed for tests). */
    public get WindowMs(): number {
        return TimeRangeToMs(this.TimeRange);
    }
}

export function LoadAnalyticsRealtimeOverview() { /* tree-shaking prevention */ }
