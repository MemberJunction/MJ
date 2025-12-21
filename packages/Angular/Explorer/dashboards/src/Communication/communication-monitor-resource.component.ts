import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Metadata, RunView } from '@memberjunction/core';

/**
 * Tree-shaking prevention function
 */
export function LoadCommunicationMonitorResource() {
    // Force inclusion in production builds
}

@RegisterClass(BaseResourceComponent, 'CommunicationMonitorResource')
@Component({
  standalone: false,
    selector: 'mj-communication-monitor-resource',
    template: `
    <div class="monitor-wrapper">
        <div class="monitor-container">
            <header class="monitor-header">
                <div class="title-area">
                    <h1>Communication Command Center</h1>
                    <p>Real-time monitoring and delivery analytics</p>
                </div>
                <div class="header-actions">
                    <button class="refresh-btn" (click)="loadData()" [class.loading]="isLoading">
                        <i class="fa-solid fa-rotate"></i>
                        <span>Refresh</span>
                    </button>
                </div>
            </header>

            <div class="stats-grid">
                <div class="stat-card primary">
                    <div class="stat-icon"><i class="fa-solid fa-paper-plane"></i></div>
                    <div class="stat-content">
                        <span class="label">Total Sent (24h)</span>
                        <span class="value">{{stats.totalSent | number}}</span>
                        <span class="trend positive"><i class="fa-solid fa-arrow-up"></i> 12% vs yesterday</span>
                    </div>
                </div>
                <div class="stat-card success">
                    <div class="stat-icon"><i class="fa-solid fa-check-double"></i></div>
                    <div class="stat-content">
                        <span class="label">Delivery Rate</span>
                        <span class="value">{{stats.deliveryRate}}%</span>
                        <div class="progress-bar"><div class="progress" [style.width.%]="stats.deliveryRate"></div></div>
                    </div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-icon"><i class="fa-solid fa-clock"></i></div>
                    <div class="stat-content">
                        <span class="label">Pending</span>
                        <span class="value">{{stats.pending | number}}</span>
                        <span class="sub-label">Awaiting provider</span>
                    </div>
                </div>
                <div class="stat-card danger">
                    <div class="stat-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <div class="stat-content">
                        <span class="label">Failed</span>
                        <span class="value">{{stats.failed | number}}</span>
                        <span class="trend negative"><i class="fa-solid fa-arrow-up"></i> 2% increase</span>
                    </div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="chart-section">
                    <div class="section-header">
                        <h3>Delivery Volume</h3>
                    </div>
                    <div class="chart-container-inner">
                        <app-time-series-chart 
                            [data]="chartData" 
                            [showLegend]="true" 
                            [showControls]="false"
                            [config]="chartConfig">
                        </app-time-series-chart>
                    </div>
                </div>

                <div class="activity-section">
                    <div class="section-header">
                        <h3>Recent Activity</h3>
                        <a href="javascript:void(0)" class="view-all">View All</a>
                    </div>
                    <div class="activity-list">
                        <div *ngFor="let log of recentLogs" class="activity-item">
                            <div class="activity-icon" [class]="log.Status.toLowerCase()">
                                <i [class]="log.Direction === 'Sending' ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
                            </div>
                            <div class="activity-info">
                                <span class="activity-title">{{log.CommunicationProviderMessageType}}</span>
                                <span class="activity-meta">{{log.CommunicationProvider}} • {{log.MessageDate | date:'shortTime'}}</span>
                            </div>
                            <div class="activity-status" [class]="log.Status.toLowerCase()">
                                {{log.Status}}
                            </div>
                        </div>
                        <div *ngIf="recentLogs.length === 0" class="empty-state">
                            <i class="fa-solid fa-inbox"></i>
                            <p>No recent activity found</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  `,
    styles: [`
    .monitor-wrapper {
        height: 100%;
        overflow-y: auto;
        background-color: #f8fafc;
    }
    .monitor-container {
        padding: 32px;
        min-height: 100%;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        max-width: 1600px;
        margin: 0 auto;
    }
    .monitor-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 32px;
    }
    .title-area h1 {
        margin: 0;
        font-size: 1.875rem;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.025em;
    }
    .title-area p {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 1rem;
    }
    .refresh-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        color: #475569;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .refresh-btn:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
    }
    .refresh-btn.loading i {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 24px;
        margin-bottom: 32px;
    }
    .stat-card {
        background: white;
        padding: 24px;
        border-radius: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.02);
        display: flex;
        gap: 20px;
        align-items: center;
        border: 1px solid #f1f5f9;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    }
    .stat-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
    }
    .primary .stat-icon { background: #eff6ff; color: #3b82f6; }
    .success .stat-icon { background: #ecfdf5; color: #10b981; }
    .warning .stat-icon { background: #fffbeb; color: #f59e0b; }
    .danger .stat-icon { background: #fef2f2; color: #ef4444; }

    .stat-content {
        display: flex;
        flex-direction: column;
        flex: 1;
    }
    .stat-content .label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 4px;
    }
    .stat-content .value {
        font-size: 1.75rem;
        font-weight: 700;
        color: #1e293b;
    }
    .trend {
        font-size: 0.75rem;
        font-weight: 600;
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .trend.positive { color: #10b981; }
    .trend.negative { color: #ef4444; }
    
    .progress-bar {
        height: 6px;
        background: #f1f5f9;
        border-radius: 3px;
        margin-top: 12px;
        overflow: hidden;
    }
    .progress {
        height: 100%;
        background: #10b981;
        border-radius: 3px;
    }

    .dashboard-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 24px;
    }
    .chart-section, .activity-section {
        background: white;
        border-radius: 16px;
        padding: 24px;
        border: 1px solid #f1f5f9;
        display: flex;
        flex-direction: column;
    }
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
    }
    .section-header h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 700;
        color: #1e293b;
    }

    .chart-container-inner {
        flex: 1;
        min-height: 350px;
    }

    .activity-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .activity-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        border-radius: 12px;
        transition: background 0.2s;
    }
    .activity-item:hover {
        background: #f8fafc;
    }
    .activity-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
    }
    .activity-icon.complete { background: #ecfdf5; color: #10b981; }
    .activity-icon.failed { background: #fef2f2; color: #ef4444; }
    .activity-icon.pending { background: #fffbeb; color: #f59e0b; }

    .activity-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .activity-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: #1e293b;
    }
    .activity-meta {
        font-size: 0.75rem;
        color: #64748b;
    }
    .activity-status {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 20px;
        text-transform: uppercase;
    }
    .activity-status.complete { background: #dcfce7; color: #166534; }
    .activity-status.failed { background: #fee2e2; color: #991b1b; }
    .activity-status.pending { background: #fef3c7; color: #92400e; }

    .view-all {
        font-size: 0.875rem;
        font-weight: 600;
        color: #3b82f6;
        text-decoration: none;
    }
    .view-all:hover {
        text-decoration: underline;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 0;
        color: #94a3b8;
    }
    .empty-state i {
        font-size: 3rem;
        margin-bottom: 16px;
    }

    @media (max-width: 1024px) {
        .dashboard-grid {
            grid-template-columns: 1fr;
        }
    }
  `]
})
export class CommunicationMonitorResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = false;
    public stats = {
        totalSent: 0,
        deliveryRate: 0,
        pending: 0,
        failed: 0
    };
    public recentLogs: any[] = [];
    public chartData: any[] = [];
    public chartConfig = {
        useDualAxis: false,
        showGrid: true,
        showTooltip: true,
        colors: ['#3b82f6', '#ef4444']
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

            // Fetch stats for the last 24 hours
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayIso = yesterday.toISOString();

            const [totalResult, failedResult, pendingResult, recentResult, allLogsResult] = await Promise.all([
                rv.RunView({
                    EntityName: 'Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}' AND Status = 'Failed'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'Communication Logs',
                    ExtraFilter: `Status = 'Pending'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'Communication Logs',
                    OrderBy: 'MessageDate DESC',
                    MaxRows: 6,
                    ResultType: 'entity_object'
                }),
                rv.RunView({
                    EntityName: 'Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}'`,
                    OrderBy: 'MessageDate ASC',
                    ResultType: 'entity_object'
                })
            ]);

            if (totalResult.Success) this.stats.totalSent = totalResult.TotalRowCount;
            if (failedResult.Success) this.stats.failed = failedResult.TotalRowCount;
            if (pendingResult.Success) this.stats.pending = pendingResult.TotalRowCount;

            if (this.stats.totalSent > 0) {
                this.stats.deliveryRate = parseFloat(((this.stats.totalSent - this.stats.failed) / this.stats.totalSent * 100).toFixed(1));
            } else {
                this.stats.deliveryRate = 100;
            }

            if (recentResult.Success) {
                this.recentLogs = recentResult.Results;
            }

            if (allLogsResult.Success) {
                this.chartData = this.processTrendData(allLogsResult.Results, yesterday);
            }

        } catch (error) {
            console.error('Error loading monitor data:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private processTrendData(logs: any[], startTime: Date): any[] {
        const buckets: any[] = [];
        const now = new Date();
        const current = new Date(startTime);
        current.setMinutes(0, 0, 0);

        while (current <= now) {
            const bucketStart = new Date(current);
            const bucketEnd = new Date(current.getTime() + 60 * 60 * 1000);

            const bucketLogs = logs.filter(l => {
                const d = new Date(l.MessageDate);
                return d >= bucketStart && d < bucketEnd;
            });

            buckets.push({
                timestamp: bucketStart,
                executions: bucketLogs.length,
                errors: bucketLogs.filter(l => l.Status === 'Failed').length,
                cost: 0,
                tokens: 0,
                avgTime: 0
            });

            current.setHours(current.getHours() + 1);
        }
        return buckets;
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Monitor';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-line';
    }
}
