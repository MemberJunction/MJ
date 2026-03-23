import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, MJCommunicationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
@RegisterClass(BaseResourceComponent, 'CommunicationRunsResource')
@Component({
  standalone: false,
    selector: 'mj-communication-runs-resource',
    template: `
    <div class="runs-wrapper">
      <div class="card">
        <div class="card-header">
          <h3><i class="fa-solid fa-play-circle"></i> Bulk Communication Runs</h3>
          <div class="header-actions">
            <button class="tb-btn" (click)="loadData()">
              <i class="fa-solid fa-rotate" [class.spinning]="isLoading"></i> Refresh
            </button>
          </div>
        </div>
        <div class="card-body no-padding">
          <!-- SUMMARY STATS -->
          <div class="runs-summary">
            <div class="run-stat-card info">
              <div class="run-stat-value">{{summary.active}}</div>
              <div class="run-stat-label">Active Runs</div>
            </div>
            <div class="run-stat-card success">
              <div class="run-stat-value">{{summary.completed}}</div>
              <div class="run-stat-label">Completed (24h)</div>
            </div>
            <div class="run-stat-card neutral">
              <div class="run-stat-value">{{summary.successRate}}%</div>
              <div class="run-stat-label">Success Rate</div>
            </div>
          </div>
    
          <!-- TIMELINE -->
          <div class="run-timeline">
            @for (run of runs; track run) {
              <div class="run-entry">
                <div class="run-timeline-dot" [ngClass]="getRunDotClass(run.Status)"></div>
                <div class="run-entry-content">
                  <div class="run-entry-header">
                    <span class="run-entry-title">Run #{{run.ID.substring(0, 8)}}</span>
                    <span class="run-status-badge" [ngClass]="getStatusClass(run.Status)">
                      {{run.Status}}
                    </span>
                  </div>
                  <div class="run-entry-meta">
                    <span><i class="fa-solid fa-user"></i> {{run.User || 'System'}}</span>
                    <span><i class="fa-solid fa-clock"></i> {{run.StartedAt | date:'medium'}}</span>
                    @if (run.EndedAt) {
                      <span><i class="fa-solid fa-flag-checkered"></i> {{run.EndedAt | date:'shortTime'}}</span>
                    }
                  </div>
                  @if (run.Comments) {
                    <div class="run-entry-comments">
                      {{run.Comments}}
                    </div>
                  }
                </div>
              </div>
            }
    
            @if (runs.length === 0 && !isLoading) {
              <div class="empty-state">
                <i class="fa-solid fa-play-circle"></i>
                <p>No communication runs found</p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
    `,
    styles: [`
    .runs-wrapper {
        height: 100%;
        padding: 24px;
        overflow-y: auto;
        background: var(--mj-bg-surface);
    }
    .card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        overflow: hidden;
    }
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--mj-border-default);
    }
    .card-header h3 {
        font-size: 13px; font-weight: 700;
        color: var(--mj-text-primary);
        display: flex; align-items: center; gap: 8px;
        margin: 0;
    }
    .card-header h3 i {
        color: var(--mj-text-muted); font-size: 12px;
    }
    .header-actions { display: flex; gap: 8px; }

    .tb-btn {
        display: inline-flex; align-items: center;
        gap: 6px; padding: 6px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-size: 12px; font-weight: 500;
        cursor: pointer; transition: all 0.15s ease;
        font-family: inherit;
    }
    .tb-btn:hover {
        background: var(--mj-bg-surface-sunken);
        border-color: var(--mj-border-strong);
        color: var(--mj-text-primary);
    }
    .tb-btn i { font-size: 12px; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinning { animation: spin 1s linear infinite; }

    .card-body.no-padding { padding: 0; }

    /* SUMMARY */
    .runs-summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        padding: 20px;
    }
    .run-stat-card {
        border-radius: 12px;
        padding: 16px 20px;
        text-align: center;
    }
    .run-stat-card.info {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
    }
    .run-stat-card.success {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        border: 1px solid color-mix(in srgb, var(--mj-status-success) 30%, transparent);
    }
    .run-stat-card.neutral {
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-default);
    }

    .run-stat-value {
        font-size: 24px; font-weight: 800;
        color: var(--mj-text-primary);
    }
    .run-stat-card.info .run-stat-value { color: var(--mj-brand-primary); }
    .run-stat-card.success .run-stat-value { color: var(--mj-status-success); }

    .run-stat-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--mj-text-muted);
        margin-top: 2px;
    }

    /* TIMELINE */
    .run-timeline { padding: 8px 20px 20px; }
    .run-entry {
        display: flex; gap: 16px;
        padding: 16px 0;
        border-bottom: 1px solid var(--mj-border-default);
        align-items: flex-start;
    }
    .run-entry:last-child { border-bottom: none; }

    .run-timeline-dot {
        width: 12px; height: 12px;
        border-radius: 50%;
        margin-top: 4px; flex-shrink: 0;
    }
    .run-timeline-dot.complete { background: var(--mj-status-success); }
    .run-timeline-dot.failed { background: var(--mj-status-error); }
    .run-timeline-dot.in-progress {
        background: var(--mj-brand-primary);
        animation: pulse-dot 1.5s ease-in-out infinite;
    }
    .run-timeline-dot.pending { background: var(--mj-status-warning); }

    @keyframes pulse-dot {
        0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--mj-brand-primary) 40%, transparent); }
        50% { box-shadow: 0 0 0 6px transparent; }
    }

    .run-entry-content { flex: 1; }
    .run-entry-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .run-entry-title {
        font-size: 13px; font-weight: 600;
        color: var(--mj-text-primary);
    }
    .run-status-badge {
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.3px;
        padding: 3px 8px;
        border-radius: 4px;
    }
    .run-status-badge.complete {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
        border: 1px solid color-mix(in srgb, var(--mj-status-success) 30%, transparent);
    }
    .run-status-badge.failed {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
        border: 1px solid color-mix(in srgb, var(--mj-status-error) 30%, transparent);
    }
    .run-status-badge.pending {
        background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
        color: var(--mj-status-warning);
        border: 1px solid color-mix(in srgb, var(--mj-status-warning) 30%, transparent);
    }
    .run-status-badge.in-progress {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
    }

    .run-entry-meta {
        font-size: 11px;
        color: var(--mj-text-muted);
        margin-top: 4px;
        display: flex; align-items: center; gap: 12px;
    }
    .run-entry-meta span {
        display: flex; align-items: center; gap: 4px;
    }
    .run-entry-meta i { font-size: 10px; }

    .run-entry-comments {
        font-size: 12px;
        color: var(--mj-text-muted);
        margin-top: 6px;
        font-style: italic;
    }

    /* EMPTY STATE */
    .empty-state {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 48px 0; color: var(--mj-text-muted);
    }
    .empty-state i { font-size: 2rem; margin-bottom: 12px; opacity: 0.5; }
    .empty-state p { margin: 0; font-size: 13px; }
  `]
})
export class CommunicationRunsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public runs: MJCommunicationRunEntity[] = [];
    public isLoading = false;
    public summary = {
        active: 0,
        completed: 0,
        successRate: 0
    };

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void { }

    public async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = new RunView();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayIso = yesterday.toISOString();

            const [runsResult, activeResult, completedResult, failedResult] = await Promise.all([
                rv.RunView<MJCommunicationRunEntity>({
                    EntityName: 'MJ: Communication Runs',
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 50,
                    ResultType: 'entity_object'
                }),
                rv.RunView({
                    EntityName: 'MJ: Communication Runs',
                    ExtraFilter: `Status = 'In-Progress'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'MJ: Communication Runs',
                    ExtraFilter: `EndedAt >= '${yesterdayIso}' AND Status = 'Complete'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'MJ: Communication Runs',
                    ExtraFilter: `EndedAt >= '${yesterdayIso}' AND Status = 'Failed'`,
                    ResultType: 'count_only'
                })
            ]);

            if (runsResult.Success) {
                this.runs = runsResult.Results;
            }

            if (activeResult.Success) this.summary.active = activeResult.TotalRowCount;
            if (completedResult.Success) this.summary.completed = completedResult.TotalRowCount;

            const totalCompleted = this.summary.completed + (failedResult.Success ? failedResult.TotalRowCount : 0);
            this.summary.successRate = totalCompleted > 0
                ? Math.round((this.summary.completed / totalCompleted) * 100)
                : 100;

        } catch (error) {
            console.error('Error loading runs:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    public getRunDotClass(status: string): string {
        const s = (status || '').toLowerCase();
        if (s === 'complete') return 'complete';
        if (s === 'failed') return 'failed';
        if (s === 'in-progress') return 'in-progress';
        return 'pending';
    }

    public getStatusClass(status: string): string {
        const s = (status || '').toLowerCase();
        if (s === 'complete') return 'complete';
        if (s === 'failed') return 'failed';
        if (s === 'in-progress') return 'in-progress';
        return 'pending';
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Bulk Runs';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-play-circle';
    }
}
