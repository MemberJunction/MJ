/**
 * @fileoverview Realtime Voice — sessions management grid.
 *
 * Every long-lived `MJ: AI Agent Sessions` row across the platform — live
 * calls, idle holds, and closed history — with the channels each session
 * opened and the agent runs it delegated. KPI strip up top, a filter bar
 * (search · status · target agent · user · host), the data grid (Agent →
 * Target, status pills incl. the janitor-closed hint, channel icons, run
 * count, tokens / cost, started, duration, host instance), and row drill-in
 * to the session record.
 */

import {
    Component, Input, OnInit, ChangeDetectorRef, inject
} from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedService } from '@memberjunction/ng-shared';
import { KPICardData } from '../../widgets/kpi-card.component';
import {
    RealtimeSessionRollup, RealtimeSessionsDataset,
    LoadRealtimeSessionsDataset, FormatSessionDuration, FormatTokenCount,
    FormatSessionCost, FormatSessionStart, ChannelIconClass
} from './realtime-session-data';

// ── View models ──

interface SessionGridRow {
    ID: string;
    Agent: string;
    Target: string;
    User: string;
    Status: string;
    StatusLabel: string;
    StatusClass: string;
    StatusTitle: string;
    IsJanitorClosed: boolean;
    IsResumed: boolean;
    ChannelIcons: { Icon: string; Name: string }[];
    ChannelCount: number;
    Runs: number;
    Tokens: string;
    Cost: string;
    Started: string;
    StartedAt: Date;
    Duration: string;
    Host: string;
    SearchText: string;
}

interface SelectOption {
    Value: string;
    Label: string;
}

const PAGE_SIZE = 25;

@Component({
    standalone: false,
    selector: 'app-analytics-realtime-sessions',
    template: `
        @if (IsLoading) {
            <div class="loading-container">
                <mj-loading text="Loading agent sessions..."></mj-loading>
            </div>
        } @else {
            <!-- KPI strip -->
            <div class="kpi-grid">
                @for (kpi of KPICards; track kpi.title) {
                    <app-kpi-card [data]="kpi"></app-kpi-card>
                }
            </div>

            <!-- Filter bar: search · status · target agent · user · host -->
            <div class="filterbar">
                <div class="search-input">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text"
                           placeholder="Search sessions, users, hosts…"
                           [value]="SearchTerm"
                           (input)="OnSearchChanged($event)" />
                </div>
                <select class="filter-select" [value]="StatusFilter" (change)="OnStatusFilterChanged($event)">
                    <option value="">Status: All</option>
                    <option value="Active">Active</option>
                    <option value="Idle">Idle</option>
                    <option value="Closed">Closed</option>
                </select>
                <select class="filter-select" [value]="TargetFilter" (change)="OnTargetFilterChanged($event)">
                    <option value="">Target: All</option>
                    @for (opt of TargetOptions; track opt.Value) {
                        <option [value]="opt.Value">{{ opt.Label }}</option>
                    }
                </select>
                <select class="filter-select" [value]="UserFilter" (change)="OnUserFilterChanged($event)">
                    <option value="">User: All</option>
                    @for (opt of UserOptions; track opt.Value) {
                        <option [value]="opt.Value">{{ opt.Label }}</option>
                    }
                </select>
                <select class="filter-select" [value]="HostFilter" (change)="OnHostFilterChanged($event)">
                    <option value="">Host: All</option>
                    @for (opt of HostOptions; track opt.Value) {
                        <option [value]="opt.Value">{{ opt.Label }}</option>
                    }
                </select>
                <span class="result-pill">{{ FilteredRows.length }} results · {{ LiveCount }} live</span>
                <button mjButton variant="secondary" size="sm" title="Refresh" (click)="LoadData()">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>

            <!-- Sessions grid -->
            <div class="panel">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Agent / Target</th>
                                <th>User</th>
                                <th>Status</th>
                                <th>Channels</th>
                                <th class="th-numeric">Runs</th>
                                <th class="th-numeric">Tokens</th>
                                <th class="th-numeric">Cost</th>
                                <th>Started</th>
                                <th class="th-numeric">Duration</th>
                                <th>Host instance</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @if (PagedRows.length === 0) {
                                <tr><td colspan="11" class="empty-row">No sessions match the current filters</td></tr>
                            }
                            @for (row of PagedRows; track row.ID) {
                                <tr class="session-row" (click)="OpenSession(row.ID)">
                                    <td>
                                        <div class="cell-strong">{{ row.Agent }}</div>
                                        <div class="cell-sub">
                                            <i class="fa-solid fa-arrow-right-long"></i> {{ row.Target }}
                                            @if (row.IsResumed) {
                                                <span class="resumed-pill" title="Resumed from a prior session">
                                                    <i class="fa-solid fa-link"></i> resumed
                                                </span>
                                            }
                                        </div>
                                    </td>
                                    <td class="cell-user">{{ row.User }}</td>
                                    <td>
                                        <span class="status-pill" [class]="row.StatusClass" [title]="row.StatusTitle">
                                            @if (row.Status === 'Active') { <span class="dot dot--live"></span> }
                                            @if (row.Status === 'Idle') { <i class="fa-solid fa-pause"></i> }
                                            @if (row.Status === 'Closed' && !row.IsJanitorClosed) { <i class="fa-solid fa-circle-stop"></i> }
                                            @if (row.IsJanitorClosed) { <i class="fa-solid fa-broom"></i> }
                                            {{ row.StatusLabel }}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="chan-icons">
                                            @for (chan of row.ChannelIcons; track chan.Name) {
                                                <i [class]="chan.Icon" [title]="chan.Name"></i>
                                            }
                                        </span>
                                        @if (row.ChannelCount > 0) {
                                            <span class="chan-count">{{ row.ChannelCount }}</span>
                                        }
                                    </td>
                                    <td class="cell-numeric">{{ row.Runs }}</td>
                                    <td class="cell-numeric mono">{{ row.Tokens }}</td>
                                    <td class="cell-numeric mono">{{ row.Cost }}</td>
                                    <td class="cell-time">{{ row.Started }}</td>
                                    <td class="cell-numeric mono">{{ row.Duration }}</td>
                                    <td class="cell-host mono" [title]="row.Host">{{ row.Host }}</td>
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

            <!-- Pagination / summary -->
            <div class="grid-footer">
                <span class="grid-summary">
                    Showing {{ PagedRows.length }} of {{ FilteredRows.length }}
                    · {{ LiveCount }} live · {{ IdleCount }} idle · {{ ClosedCount }} closed
                </span>
                @if (PageCount > 1) {
                    <div class="pager">
                        <button mjButton variant="secondary" size="sm" [disabled]="PageIndex === 0" (click)="PrevPage()">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <span class="pager-label">Page {{ PageIndex + 1 }} of {{ PageCount }}</span>
                        <button mjButton variant="secondary" size="sm" [disabled]="PageIndex >= PageCount - 1" (click)="NextPage()">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                    </div>
                }
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

        /* ── Filter bar ── */
        .filterbar {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            padding: 10px 14px;
            margin-bottom: 16px;
        }

        .search-input {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            border-radius: 8px;
            padding: 6px 10px;
            min-width: 240px;
            flex: 1;
            max-width: 360px;
        }

        .search-input i {
            color: var(--mj-text-muted);
            font-size: 12px;
        }

        .search-input input {
            border: none;
            outline: none;
            background: transparent;
            color: var(--mj-text-primary);
            font-size: 13px;
            width: 100%;
        }

        .search-input input::placeholder { color: var(--mj-text-disabled); }

        .filter-select {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 8px;
            color: var(--mj-text-secondary);
            font-size: 12.5px;
            padding: 6px 8px;
            max-width: 200px;
        }

        .result-pill {
            margin-left: auto;
            font-size: 12px;
            color: var(--mj-text-muted);
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            border-radius: 12px;
            padding: 4px 12px;
            white-space: nowrap;
        }

        /* ── Panel + table (matches sibling analytics sections) ── */
        .panel {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            overflow: hidden;
        }

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
            white-space: nowrap;
        }

        .th-numeric { text-align: right; }

        .session-row { cursor: pointer; transition: background 0.15s; }
        .session-row:hover { background: var(--mj-bg-surface-hover); }

        .cell-strong {
            font-weight: 600;
            color: var(--mj-text-primary);
            white-space: nowrap;
        }

        .cell-sub {
            font-size: 11.5px;
            color: var(--mj-text-muted);
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }

        .cell-user {
            max-width: 200px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--mj-text-secondary);
        }

        .cell-numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
            color: var(--mj-text-secondary);
        }

        .cell-time {
            white-space: nowrap;
            color: var(--mj-text-muted);
            font-size: 12px;
        }

        .cell-host {
            max-width: 160px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--mj-text-muted);
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

        .resumed-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 7px;
            border-radius: 10px;
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
        }

        .chan-icons {
            display: inline-flex;
            gap: 8px;
            color: var(--mj-text-secondary);
            font-size: 13px;
        }

        .chan-count {
            margin-left: 6px;
            font-size: 11px;
            color: var(--mj-text-muted);
        }

        /* ── Footer / pager ── */
        .grid-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-top: 14px;
            flex-wrap: wrap;
        }

        .grid-summary {
            font-size: 12.5px;
            color: var(--mj-text-muted);
        }

        .pager {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .pager-label {
            font-size: 12.5px;
            color: var(--mj-text-secondary);
            white-space: nowrap;
        }
    `]
})
export class AnalyticsRealtimeSessionsComponent extends BaseAngularComponent implements OnInit {
    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.LoadData();
    }
    get TimeRange(): string { return this._timeRange; }

    private initialized = false;
    private cdr = inject(ChangeDetectorRef);
    private dataset: RealtimeSessionsDataset | null = null;
    private allRows: SessionGridRow[] = [];

    public IsLoading = false;
    public KPICards: KPICardData[] = [];
    public FilteredRows: SessionGridRow[] = [];
    public PagedRows: SessionGridRow[] = [];
    public TargetOptions: SelectOption[] = [];
    public UserOptions: SelectOption[] = [];
    public HostOptions: SelectOption[] = [];

    public SearchTerm = '';
    public StatusFilter = '';
    public TargetFilter = '';
    public UserFilter = '';
    public HostFilter = '';
    public PageIndex = 0;

    public get LiveCount(): number {
        return this.FilteredRows.filter(r => r.Status === 'Active').length;
    }

    public get IdleCount(): number {
        return this.FilteredRows.filter(r => r.Status === 'Idle').length;
    }

    public get ClosedCount(): number {
        return this.FilteredRows.filter(r => r.Status === 'Closed').length;
    }

    public get PageCount(): number {
        return Math.max(1, Math.ceil(this.FilteredRows.length / PAGE_SIZE));
    }

    ngOnInit(): void {
        this.initialized = true;
        this.LoadData();
    }

    // ── Data loading ──

    /** Reloads everything for the current time range. */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();
        try {
            this.dataset = await LoadRealtimeSessionsDataset(this.ProviderToUse, this.TimeRange);
            this.buildRows();
            this.buildKPICards();
            this.buildFilterOptions();
            this.applyFilters();
        } catch (e) {
            console.error('Realtime sessions load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ── Drill-in ──

    /** Opens the AIAgentSession record via the shared Explorer record-open path. */
    public OpenSession(sessionId: string): void {
        const key = new CompositeKey();
        key.LoadFromSingleKeyValuePair('ID', sessionId);
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Sessions', key);
    }

    // ── Filter handlers ──

    public OnSearchChanged(event: Event): void {
        this.SearchTerm = (event.target as HTMLInputElement).value;
        this.applyFilters();
    }

    public OnStatusFilterChanged(event: Event): void {
        this.StatusFilter = (event.target as HTMLSelectElement).value;
        this.applyFilters();
    }

    public OnTargetFilterChanged(event: Event): void {
        this.TargetFilter = (event.target as HTMLSelectElement).value;
        this.applyFilters();
    }

    public OnUserFilterChanged(event: Event): void {
        this.UserFilter = (event.target as HTMLSelectElement).value;
        this.applyFilters();
    }

    public OnHostFilterChanged(event: Event): void {
        this.HostFilter = (event.target as HTMLSelectElement).value;
        this.applyFilters();
    }

    public PrevPage(): void {
        if (this.PageIndex > 0) {
            this.PageIndex--;
            this.applyPaging();
        }
    }

    public NextPage(): void {
        if (this.PageIndex < this.PageCount - 1) {
            this.PageIndex++;
            this.applyPaging();
        }
    }

    // ── Builders ──

    private buildRows(): void {
        const sessions = this.dataset?.Sessions ?? [];
        this.allRows = [...sessions]
            .sort((a, b) => b.StartedAt.getTime() - a.StartedAt.getTime())
            .map(s => this.toGridRow(s));
    }

    private toGridRow(s: RealtimeSessionRollup): SessionGridRow {
        const target = s.TargetAgentName ?? (s.TargetAgentID ? 'Unknown agent' : '—');
        const host = s.Record.HostInstanceID ?? '—';
        const user = s.Record.User;
        const agent = s.Record.Agent ?? 'Unknown';
        return {
            ID: s.Record.ID,
            Agent: agent,
            Target: target,
            User: user,
            Status: s.Record.Status,
            StatusLabel: s.IsJanitorClosed ? 'Closed · janitor' : s.Record.Status,
            StatusClass: 'status-pill status-' + s.Record.Status.toLowerCase(),
            StatusTitle: s.IsJanitorClosed
                ? 'Force-closed by the lifecycle janitor (staleness sweep / orphan reconciliation)'
                : '',
            IsJanitorClosed: s.IsJanitorClosed,
            IsResumed: s.IsResumed,
            ChannelIcons: s.ChannelNames.map(name => ({ Icon: ChannelIconClass(name), Name: name })),
            ChannelCount: s.ChannelNames.length,
            Runs: s.DelegatedRunCount,
            Tokens: FormatTokenCount(s.TotalTokens),
            Cost: FormatSessionCost(s.TotalCost),
            Started: FormatSessionStart(s.StartedAt),
            StartedAt: s.StartedAt,
            Duration: FormatSessionDuration(s.DurationMs),
            Host: host,
            SearchText: [agent, target, user, host, s.Record.ID, s.Record.ConversationID ?? '']
                .join(' ').toLowerCase()
        };
    }

    private buildKPICards(): void {
        const sessions = this.dataset?.Sessions ?? [];
        const all = this.dataset?.AllSessions ?? [];

        const activeCount = sessions.filter(s => s.Record.Status === 'Active').length;
        const idleCount = sessions.filter(s => s.Record.Status === 'Idle').length;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
        const todaySessions = all.filter(s => s.StartedAt >= startOfToday);
        const yesterdaySessions = all.filter(s => s.StartedAt >= startOfYesterday && s.StartedAt < startOfToday);
        const todayCost = todaySessions.reduce((a, s) => a + s.TotalCost, 0);

        const delegatedTotal = sessions.reduce((a, s) => a + s.DelegatedRunCount, 0);

        const trendPct = yesterdaySessions.length > 0
            ? Math.round(((todaySessions.length - yesterdaySessions.length) / yesterdaySessions.length) * 100)
            : 0;

        this.KPICards = [
            {
                title: 'Active now',
                value: activeCount,
                subtitle: 'live duplex sessions',
                icon: 'fa-tower-broadcast',
                color: 'success'
            },
            {
                title: 'Idle (holding)',
                value: idleCount,
                subtitle: 'past idle threshold',
                icon: 'fa-pause',
                color: 'warning'
            },
            {
                title: 'Sessions today',
                value: todaySessions.length,
                icon: 'fa-clock',
                color: 'primary',
                trend: yesterdaySessions.length > 0 ? {
                    direction: trendPct > 0 ? 'up' : trendPct < 0 ? 'down' : 'stable',
                    percentage: Math.abs(trendPct),
                    period: 'vs yesterday'
                } : undefined,
                subtitle: yesterdaySessions.length > 0 ? undefined : 'no sessions yesterday'
            },
            {
                title: `Delegated runs (${this.TimeRange})`,
                value: delegatedTotal,
                subtitle: 'agent runs via AgentSessionID',
                icon: 'fa-diagram-project',
                color: 'info'
            },
            {
                title: 'Cost today',
                value: FormatSessionCost(todayCost),
                subtitle: 'co-agent + delegated',
                icon: 'fa-coins',
                color: 'danger'
            }
        ];
    }

    private buildFilterOptions(): void {
        const targets = new Map<string, string>();
        const users = new Map<string, string>();
        const hosts = new Set<string>();
        for (const row of this.allRows) {
            if (row.Target && row.Target !== '—') targets.set(row.Target, row.Target);
            if (row.User) users.set(row.User, row.User);
            if (row.Host && row.Host !== '—') hosts.add(row.Host);
        }
        const toOptions = (values: Iterable<string>) =>
            Array.from(values).sort((a, b) => a.localeCompare(b)).map(v => ({ Value: v, Label: v }));
        this.TargetOptions = toOptions(targets.keys());
        this.UserOptions = toOptions(users.keys());
        this.HostOptions = toOptions(hosts);
    }

    private applyFilters(): void {
        const search = this.SearchTerm.trim().toLowerCase();
        this.FilteredRows = this.allRows.filter(row => {
            if (this.StatusFilter && row.Status !== this.StatusFilter) return false;
            if (this.TargetFilter && row.Target !== this.TargetFilter) return false;
            if (this.UserFilter && row.User !== this.UserFilter) return false;
            if (this.HostFilter && row.Host !== this.HostFilter) return false;
            if (search && !row.SearchText.includes(search)) return false;
            return true;
        });
        this.PageIndex = 0;
        this.applyPaging();
    }

    private applyPaging(): void {
        const start = this.PageIndex * PAGE_SIZE;
        this.PagedRows = this.FilteredRows.slice(start, start + PAGE_SIZE);
        this.cdr.detectChanges();
    }
}

export function LoadAnalyticsRealtimeSessions() { /* tree-shaking prevention */ }
