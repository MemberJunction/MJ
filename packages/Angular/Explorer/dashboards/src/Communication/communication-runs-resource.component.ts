import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

/**
 * Tree-shaking prevention function
 */
export function LoadCommunicationRunsResource() {
    // Force inclusion in production builds
}

@RegisterClass(BaseResourceComponent, 'CommunicationRunsResource')
@Component({
  standalone: false,
    selector: 'mj-communication-runs-resource',
    template: `
    <div class="runs-container">
        <header class="runs-header">
            <div class="title-area">
                <h1>Communication Runs</h1>
                <p>Track and manage bulk messaging campaigns</p>
            </div>
            <div class="header-actions">
                <button class="new-run-btn">
                    <i class="fa-solid fa-play"></i>
                    <span>Start New Run</span>
                </button>
            </div>
        </header>

        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Active Runs</span>
                <span class="value">{{summary.active}}</span>
            </div>
            <div class="summary-card">
                <span class="label">Completed (24h)</span>
                <span class="value">{{summary.completed}}</span>
            </div>
            <div class="summary-card">
                <span class="label">Success Rate</span>
                <span class="value">{{summary.successRate}}%</span>
            </div>
        </div>

        <div class="grid-wrapper">
            <div *ngIf="isLoading" class="loading-overlay">
                <div class="spinner"></div>
            </div>

            <table class="custom-grid">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>User</th>
                        <th>Started At</th>
                        <th>Ended At</th>
                        <th>Comments</th>
                    </tr>
                </thead>
                <tbody>
                    <tr *ngFor="let run of runs">
                        <td>
                            <span class="status-pill" [class]="run.Status.toLowerCase()">
                                {{run.Status}}
                            </span>
                        </td>
                        <td>
                            <div class="user-info">
                                <div class="avatar">{{run.User?.charAt(0) || 'U'}}</div>
                                <span>{{run.User}}</span>
                            </div>
                        </td>
                        <td>{{run.StartedAt | date:'medium'}}</td>
                        <td>{{run.EndedAt ? (run.EndedAt | date:'medium') : '-'}}</td>
                        <td class="comments-cell" [title]="run.Comments">{{run.Comments || '-'}}</td>
                    </tr>
                    <tr *ngIf="runs.length === 0 && !isLoading">
                        <td colspan="5" class="no-data">No communication runs found</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  `,
    styles: [`
    .runs-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background-color: #f8fafc;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .runs-header {
        padding: 24px 32px;
        background: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
    }
    .title-area h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 800;
        color: #0f172a;
    }
    .title-area p {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 0.875rem;
    }
    .new-run-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background: #0f172a;
        border: none;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .new-run-btn:hover {
        background: #1e293b;
    }

    .summary-cards {
        display: flex;
        gap: 24px;
        padding: 24px 32px;
    }
    .summary-card {
        background: white;
        padding: 16px 24px;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .summary-card .label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .summary-card .value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #0f172a;
    }

    .grid-wrapper {
        flex: 1;
        padding: 0 32px 32px;
        overflow-y: auto;
        position: relative;
    }

    .custom-grid {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        border: 1px solid #e2e8f0;
    }
    .custom-grid th {
        background: #f8fafc;
        padding: 16px;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid #e2e8f0;
    }
    .custom-grid td {
        padding: 16px;
        font-size: 0.875rem;
        color: #1e293b;
        border-bottom: 1px solid #f1f5f9;
    }
    .custom-grid tr:last-child td {
        border-bottom: none;
    }
    .custom-grid tr:hover td {
        background: #f8fafc;
    }

    .status-pill {
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
    }
    .status-pill.complete { background: #dcfce7; color: #166534; }
    .status-pill.failed { background: #fee2e2; color: #991b1b; }
    .status-pill.pending { background: #fef3c7; color: #92400e; }
    .status-pill.in-progress { background: #eff6ff; color: #1e40af; }

    .user-info {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .avatar {
        width: 28px;
        height: 28px;
        background: #e2e8f0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 700;
        color: #475569;
    }

    .comments-cell {
        max-width: 300px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #64748b;
    }

    .no-data {
        text-align: center;
        padding: 48px !important;
        color: #94a3b8;
        font-style: italic;
    }

    .loading-overlay {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255,255,255,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
    }
    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e2e8f0;
        border-top-color: #0f172a;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class CommunicationRunsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public runs: any[] = [];
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
                rv.RunView({
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
            if (totalCompleted > 0) {
                this.summary.successRate = Math.round((this.summary.completed / totalCompleted) * 100);
            } else {
                this.summary.successRate = 100;
            }

        } catch (error) {
            console.error('Error loading runs:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Runs';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-play';
    }
}
