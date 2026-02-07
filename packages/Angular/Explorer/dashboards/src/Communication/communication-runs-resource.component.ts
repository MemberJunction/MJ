import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, CommunicationRunEntity } from '@memberjunction/core-entities';
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
        background: var(--mat-sys-surface-container);
    }
    .card {
        background: var(--mat-sys-surface-container-lowest);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-medium, 12px);
        overflow: hidden;
    }
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .card-header h3 {
        font-size: 13px; font-weight: 700;
        color: var(--mat-sys-on-surface);
        display: flex; align-items: center; gap: 8px;
        margin: 0;
    }
    .card-header h3 i {
        color: var(--mat-sys-on-surface-variant); font-size: 12px;
    }
    .header-actions { display: flex; gap: 8px; }

    .tb-btn {
        display: inline-flex; align-items: center;
        gap: 6px; padding: 6px 12px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-extra-small, 4px);
        background: var(--mat-sys-surface-container-lowest);
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px; font-weight: 500;
        cursor: pointer; transition: all 0.15s ease;
        font-family: inherit;
    }
    .tb-btn:hover {
        background: var(--mat-sys-surface-container-high);
        border-color: var(--mat-sys-outline);
        color: var(--mat-sys-on-surface);
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
        border-radius: var(--mat-sys-corner-medium, 12px);
        padding: 16px 20px;
        text-align: center;
    }
    .run-stat-card.info { background: #ddf4ff; }
    .run-stat-card.success { background: #d4f8e0; }
    .run-stat-card.neutral { background: var(--mat-sys-surface-container-low); }

    .run-stat-value {
        font-size: 24px; font-weight: 800;
        color: var(--mat-sys-on-surface);
    }
    .run-stat-card.info .run-stat-value { color: #0969da; }
    .run-stat-card.success .run-stat-value { color: #1b873f; }

    .run-stat-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 2px;
    }

    /* TIMELINE */
    .run-timeline { padding: 8px 20px 20px; }
    .run-entry {
        display: flex; gap: 16px;
        padding: 16px 0;
        border-bottom: 1px solid var(--mat-sys-surface-container);
        align-items: flex-start;
    }
    .run-entry:last-child { border-bottom: none; }

    .run-timeline-dot {
        width: 12px; height: 12px;
        border-radius: 50%;
        margin-top: 4px; flex-shrink: 0;
    }
    .run-timeline-dot.complete { background: #1b873f; }
    .run-timeline-dot.failed { background: #cf222e; }
    .run-timeline-dot.in-progress {
        background: #0969da;
        animation: pulse-dot 1.5s ease-in-out infinite;
    }
    .run-timeline-dot.pending { background: #9a6700; }

    @keyframes pulse-dot {
        0%, 100% { box-shadow: 0 0 0 0 rgba(9,105,218,0.4); }
        50% { box-shadow: 0 0 0 6px rgba(9,105,218,0); }
    }

    .run-entry-content { flex: 1; }
    .run-entry-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .run-entry-title {
        font-size: 13px; font-weight: 600;
        color: var(--mat-sys-on-surface);
    }
    .run-status-badge {
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.3px;
        padding: 3px 8px;
        border-radius: var(--mat-sys-corner-extra-small, 4px);
    }
    .run-status-badge.complete { background: #d4f8e0; color: #1b873f; }
    .run-status-badge.failed { background: #ffdce0; color: #cf222e; }
    .run-status-badge.pending { background: #fff0c7; color: #9a6700; }
    .run-status-badge.in-progress { background: #ddf4ff; color: #0969da; }

    .run-entry-meta {
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 4px;
        display: flex; align-items: center; gap: 12px;
    }
    .run-entry-meta span {
        display: flex; align-items: center; gap: 4px;
    }
    .run-entry-meta i { font-size: 10px; }

    .run-entry-comments {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 6px;
        font-style: italic;
    }

    /* EMPTY STATE */
    .empty-state {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 48px 0; color: var(--mat-sys-on-surface-variant);
    }
    .empty-state i { font-size: 2rem; margin-bottom: 12px; opacity: 0.5; }
    .empty-state p { margin: 0; font-size: 13px; }
  `]
})
export class CommunicationRunsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public runs: CommunicationRunEntity[] = [];
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
                rv.RunView<CommunicationRunEntity>({
                    EntityName: 'Communication Runs',
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 50,
                    ResultType: 'entity_object'
                }),
                rv.RunView({
                    EntityName: 'Communication Runs',
                    ExtraFilter: `Status = 'In-Progress'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'Communication Runs',
                    ExtraFilter: `EndedAt >= '${yesterdayIso}' AND Status = 'Complete'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'Communication Runs',
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
