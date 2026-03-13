import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, MJCommunicationLogEntity, MJCommunicationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

interface ProviderHealth {
    Name: string;
    Type: string;
    SentCount: number;
    SuccessRate: number;
    IsActive: boolean;
    IconClass: string;
    ColorClass: string;
}

interface ChannelBreakdown {
    Name: string;
    IconClass: string;
    Count: number;
    Percentage: number;
    ColorClass: string;
}

interface HourlyBucket {
    timestamp: Date;
    executions: number;
    errors: number;
    cost: number;
    tokens: number;
    avgTime: number;
}
@RegisterClass(BaseResourceComponent, 'CommunicationMonitorResource')
@Component({
  standalone: false,
    selector: 'mj-communication-monitor-resource',
    template: `
    <div class="monitor-wrapper">
      <div class="monitor-container">
        <!-- KPI STRIP -->
        <div class="kpi-strip">
          <div class="kpi-card sent">
            <div class="kpi-icon"><i class="fa-solid fa-paper-plane"></i></div>
            <div class="kpi-body">
              <span class="kpi-label">Total Sent</span>
              <span class="kpi-value">{{stats.totalSent | number}}</span>
              <span class="kpi-delta" [class]="stats.totalSent > 0 ? 'up' : 'neutral'">
                <i class="fa-solid" [class.fa-arrow-up]="stats.totalSent > 0" [class.fa-minus]="stats.totalSent === 0"></i>
                Last 24 hours
              </span>
            </div>
          </div>
          <div class="kpi-card delivered">
            <div class="kpi-icon"><i class="fa-solid fa-check-double"></i></div>
            <div class="kpi-body">
              <span class="kpi-label">Delivery Rate</span>
              <span class="kpi-value">{{stats.deliveryRate}}%</span>
              <div class="delivery-bar">
                <div class="delivery-fill" [style.width.%]="stats.deliveryRate"></div>
              </div>
            </div>
          </div>
          <div class="kpi-card pending">
            <div class="kpi-icon"><i class="fa-solid fa-clock"></i></div>
            <div class="kpi-body">
              <span class="kpi-label">Pending</span>
              <span class="kpi-value">{{stats.pending | number}}</span>
              <span class="kpi-delta neutral">
                <i class="fa-solid fa-minus"></i> Awaiting provider
              </span>
            </div>
          </div>
          <div class="kpi-card failed">
            <div class="kpi-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
            <div class="kpi-body">
              <span class="kpi-label">Failed</span>
              <span class="kpi-value">{{stats.failed | number}}</span>
              <span class="kpi-delta" [class]="stats.failed > 0 ? 'down' : 'neutral'">
                <i class="fa-solid" [class.fa-arrow-up]="stats.failed > 0" [class.fa-minus]="stats.failed === 0"></i>
                {{stats.failed > 0 ? 'Requires attention' : 'No failures'}}
              </span>
            </div>
          </div>
        </div>
    
        <!-- CHARTS + ACTIVITY ROW -->
        <div class="content-grid">
          <div class="card">
            <div class="card-header">
              <h3><i class="fa-solid fa-chart-bar"></i> Delivery Volume</h3>
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
    
          <div class="card">
            <div class="card-header">
              <h3><i class="fa-solid fa-bolt"></i> Recent Activity</h3>
            </div>
            <div class="card-body no-padding">
              <div class="activity-feed">
                @for (log of recentLogs; track log) {
                  <div class="activity-item">
                    <div class="activity-icon" [ngClass]="getActivityIconClass(log)">
                      <i [class]="getActivityIcon(log)"></i>
                    </div>
                    <div class="activity-body">
                      <span class="activity-title">{{log.CommunicationProviderMessageType || 'Message'}}</span>
                      <span class="activity-meta">{{log.CommunicationProvider}} &bull; {{log.MessageDate | date:'shortTime'}}</span>
                    </div>
                    <span class="activity-status" [ngClass]="log.Status.toLowerCase()">
                      {{log.Status}}
                    </span>
                  </div>
                }
                @if (recentLogs.length === 0) {
                  <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>No recent activity</p>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
    
        <!-- PROVIDER HEALTH + CHANNEL BREAKDOWN -->
        <div class="content-grid">
          <div class="card">
            <div class="card-header">
              <h3><i class="fa-solid fa-heart-pulse"></i> Provider Health</h3>
            </div>
            <div class="card-body no-padding">
              <div class="provider-health-list">
                @for (provider of providerHealth; track provider) {
                  <div class="provider-row">
                    <div class="provider-status-dot" [class.active]="provider.IsActive"></div>
                    <div class="provider-logo" [ngClass]="provider.ColorClass">
                      <i [class]="provider.IconClass"></i>
                    </div>
                    <div class="provider-info">
                      <div class="provider-name">{{provider.Name}}</div>
                      <div class="provider-type">{{provider.Type}} &bull; {{provider.SentCount}} sent today</div>
                    </div>
                    <div class="provider-health-bar">
                      <div class="provider-health-fill" [ngClass]="getHealthClass(provider.SuccessRate)" [style.width.%]="provider.SuccessRate"></div>
                    </div>
                    <span class="provider-rate" [ngClass]="getHealthClass(provider.SuccessRate)">{{provider.SuccessRate}}%</span>
                  </div>
                }
                @if (providerHealth.length === 0) {
                  <div class="empty-state">
                    <i class="fa-solid fa-server"></i>
                    <p>No providers configured</p>
                  </div>
                }
              </div>
            </div>
          </div>
    
          <div class="card">
            <div class="card-header">
              <h3><i class="fa-solid fa-layer-group"></i> Channel Breakdown</h3>
            </div>
            <div class="card-body no-padding">
              <div class="channel-breakdown">
                @for (channel of channelBreakdown; track channel) {
                  <div class="channel-row">
                    <div class="channel-icon" [ngClass]="channel.ColorClass">
                      <i [class]="channel.IconClass"></i>
                    </div>
                    <div class="channel-info">
                      <div class="channel-name">{{channel.Name}}</div>
                      <div class="channel-count">{{channel.Count | number}} messages</div>
                    </div>
                    <div class="channel-bar-wrapper">
                      <div class="channel-bar-fill" [style.width.%]="channel.Percentage" [style.background]="channel.ColorClass === 'email' ? 'var(--mj-brand-primary)' : 'var(--mj-status-success)'"></div>
                    </div>
                    <span class="channel-pct">{{channel.Percentage}}%</span>
                  </div>
                }
                @if (channelBreakdown.length === 0) {
                  <div class="empty-state">
                    <i class="fa-solid fa-layer-group"></i>
                    <p>No channel data available</p>
                  </div>
                }
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
        background: var(--mj-bg-surface);
    }
    .monitor-container {
        padding: 24px;
        min-height: 100%;
        max-width: 1600px;
        margin: 0 auto;
    }

    /* KPI STRIP */
    .kpi-strip {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
    }
    .kpi-card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        padding: 20px;
        display: flex;
        align-items: flex-start;
        gap: 16px;
        transition: all 0.15s ease;
        position: relative;
        overflow: hidden;
    }
    .kpi-card:hover {
        box-shadow: 0 2px 8px var(--mj-shadow-md);
        border-color: var(--mj-border-strong);
    }
    .kpi-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
    }
    .kpi-card.sent::before { background: var(--mj-brand-primary); }
    .kpi-card.delivered::before { background: var(--mj-status-success); }
    .kpi-card.pending::before { background: var(--mj-status-warning); }
    .kpi-card.failed::before { background: var(--mj-status-error); }

    .kpi-icon {
        width: 44px; height: 44px;
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
    }
    .kpi-card.sent .kpi-icon {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }
    .kpi-card.delivered .kpi-icon {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .kpi-card.pending .kpi-icon {
        background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
        color: var(--mj-status-warning);
    }
    .kpi-card.failed .kpi-icon {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }

    .kpi-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .kpi-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--mj-text-muted);
    }
    .kpi-value {
        font-size: 28px; font-weight: 800;
        color: var(--mj-text-primary);
        letter-spacing: -0.02em; line-height: 1.1;
    }
    .kpi-delta {
        display: inline-flex; align-items: center;
        gap: 4px; font-size: 11px; font-weight: 600;
        margin-top: 4px; padding: 2px 8px;
        border-radius: 10px; width: fit-content;
    }
    .kpi-delta.up {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .kpi-delta.down {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }
    .kpi-delta.neutral {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
    }

    .delivery-bar {
        height: 6px; margin-top: 10px;
        background: var(--mj-bg-surface-sunken);
        border-radius: 3px; overflow: hidden;
    }
    .delivery-fill {
        height: 100%; border-radius: 3px;
        background: var(--mj-status-success); transition: width 0.6s ease;
    }

    /* CONTENT GRID */
    .content-grid {
        display: grid;
        grid-template-columns: 1.6fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
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
        color: var(--mj-text-muted);
        font-size: 12px;
    }
    .card-body { padding: 16px 20px; }
    .card-body.no-padding { padding: 0; }

    .chart-container-inner {
        padding: 16px 20px;
        min-height: 300px;
    }

    /* ACTIVITY FEED */
    .activity-feed { max-height: 370px; overflow-y: auto; }
    .activity-item {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--mj-border-default);
        transition: background 0.15s ease; cursor: pointer;
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-item:hover { background: var(--mj-bg-surface-sunken); }

    .activity-icon {
        width: 34px; height: 34px;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; flex-shrink: 0;
    }
    .activity-icon.email {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }
    .activity-icon.sms {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .activity-icon.error {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }

    .activity-body { flex: 1; min-width: 0; }
    .activity-title {
        font-size: 12px; font-weight: 600;
        color: var(--mj-text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        display: block;
    }
    .activity-meta {
        font-size: 11px; color: var(--mj-text-muted); margin-top: 1px;
        display: block;
    }
    .activity-status {
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.3px;
        padding: 3px 8px;
        border-radius: 4px;
        flex-shrink: 0;
    }
    .activity-status.complete {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .activity-status.failed {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }
    .activity-status.pending {
        background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
        color: var(--mj-status-warning);
    }

    /* PROVIDER HEALTH */
    .provider-health-list { display: flex; flex-direction: column; }
    .provider-row {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 20px;
        border-bottom: 1px solid var(--mj-border-default);
        transition: background 0.15s ease;
    }
    .provider-row:last-child { border-bottom: none; }
    .provider-row:hover { background: var(--mj-bg-surface-sunken); }

    .provider-status-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        background: var(--mj-border-strong);
    }
    .provider-status-dot.active { background: var(--mj-status-success); }

    .provider-logo {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: var(--mj-bg-surface-sunken);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
    }
    .provider-logo.sendgrid { color: var(--mj-brand-primary); }
    .provider-logo.twilio { color: var(--mj-status-error); }
    .provider-logo.gmail { color: var(--mj-status-error); }
    .provider-logo.msgraph { color: var(--mj-brand-primary); }

    .provider-info { flex: 1; }
    .provider-name { font-size: 13px; font-weight: 600; color: var(--mj-text-primary); }
    .provider-type { font-size: 11px; color: var(--mj-text-muted); }

    .provider-health-bar {
        width: 80px; height: 6px;
        background: var(--mj-bg-surface-sunken);
        border-radius: 3px; overflow: hidden;
    }
    .provider-health-fill {
        height: 100%; border-radius: 3px;
        transition: width 0.4s ease;
    }
    .provider-health-fill.excellent { background: var(--mj-status-success); }
    .provider-health-fill.good { background: var(--mj-status-success); }
    .provider-health-fill.warning { background: var(--mj-status-warning); }
    .provider-health-fill.critical { background: var(--mj-status-error); }

    .provider-rate {
        font-size: 12px; font-weight: 700;
        min-width: 44px; text-align: right;
    }
    .provider-rate.excellent { color: var(--mj-status-success); }
    .provider-rate.good { color: var(--mj-status-success); }
    .provider-rate.warning { color: var(--mj-status-warning); }
    .provider-rate.critical { color: var(--mj-status-error); }

    /* CHANNEL BREAKDOWN */
    .channel-breakdown { display: flex; flex-direction: column; }
    .channel-row {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 20px;
        border-bottom: 1px solid var(--mj-border-default);
    }
    .channel-row:last-child { border-bottom: none; }
    .channel-icon {
        width: 32px; height: 32px;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; flex-shrink: 0;
    }
    .channel-icon.email {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }
    .channel-icon.sms {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }

    .channel-info { flex: 1; }
    .channel-name { font-size: 12px; font-weight: 600; color: var(--mj-text-primary); }
    .channel-count { font-size: 11px; color: var(--mj-text-muted); }

    .channel-bar-wrapper {
        width: 100px; height: 6px;
        background: var(--mj-bg-surface-sunken);
        border-radius: 3px; overflow: hidden;
    }
    .channel-bar-fill { height: 100%; border-radius: 3px; }
    .channel-pct {
        font-size: 12px; font-weight: 700;
        color: var(--mj-text-primary);
        min-width: 36px; text-align: right;
    }

    /* EMPTY STATE */
    .empty-state {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 40px 0; color: var(--mj-text-muted);
    }
    .empty-state i { font-size: 2rem; margin-bottom: 12px; opacity: 0.5; }
    .empty-state p { margin: 0; font-size: 13px; }

    @media (max-width: 1200px) {
        .kpi-strip { grid-template-columns: repeat(2, 1fr); }
        .content-grid { grid-template-columns: 1fr; }
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
    public recentLogs: MJCommunicationLogEntity[] = [];
    public chartData: HourlyBucket[] = [];
    public chartConfig = {
        useDualAxis: false,
        showGrid: true,
        showTooltip: true,
        colors: ['#4f6bed', '#cf222e']
    };
    public providerHealth: ProviderHealth[] = [];
    public channelBreakdown: ChannelBreakdown[] = [];

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

            const [totalResult, failedResult, pendingResult, recentResult, allLogsResult, providersResult] = await Promise.all([
                rv.RunView({
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}' AND Status = 'Failed'`,
                    ResultType: 'count_only'
                }),
                rv.RunView({
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `Status = 'Pending'`,
                    ResultType: 'count_only'
                }),
                rv.RunView<MJCommunicationLogEntity>({
                    EntityName: 'MJ: Communication Logs',
                    OrderBy: 'MessageDate DESC',
                    MaxRows: 8,
                    ResultType: 'entity_object'
                }),
                rv.RunView<MJCommunicationLogEntity>({
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}'`,
                    OrderBy: 'MessageDate ASC',
                    ResultType: 'entity_object'
                }),
                rv.RunView<MJCommunicationProviderEntity>({
                    EntityName: 'MJ: Communication Providers',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                })
            ]);

            if (totalResult.Success) this.stats.totalSent = totalResult.TotalRowCount;
            if (failedResult.Success) this.stats.failed = failedResult.TotalRowCount;
            if (pendingResult.Success) this.stats.pending = pendingResult.TotalRowCount;

            this.stats.deliveryRate = this.stats.totalSent > 0
                ? parseFloat(((this.stats.totalSent - this.stats.failed) / this.stats.totalSent * 100).toFixed(1))
                : 100;

            if (recentResult.Success) {
                this.recentLogs = recentResult.Results;
            }

            if (allLogsResult.Success) {
                this.chartData = this.processTrendData(allLogsResult.Results, yesterday);
                this.channelBreakdown = this.buildChannelBreakdown(allLogsResult.Results);
            }

            if (providersResult.Success && allLogsResult.Success) {
                this.providerHealth = this.buildProviderHealth(providersResult.Results, allLogsResult.Results);
            }

        } catch (error) {
            console.error('Error loading monitor data:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    public getActivityIconClass(log: MJCommunicationLogEntity): string {
        if (log.Status === 'Failed') return 'error';
        const type = (log.CommunicationProviderMessageType || '').toLowerCase();
        if (type.includes('sms')) return 'sms';
        return 'email';
    }

    public getActivityIcon(log: MJCommunicationLogEntity): string {
        if (log.Direction === 'Receiving') return 'fa-solid fa-arrow-down';
        const type = (log.CommunicationProviderMessageType || '').toLowerCase();
        if (type.includes('sms')) return 'fa-solid fa-comment-sms';
        return 'fa-solid fa-envelope';
    }

    public getHealthClass(rate: number): string {
        if (rate >= 98) return 'excellent';
        if (rate >= 95) return 'good';
        if (rate >= 85) return 'warning';
        return 'critical';
    }

    private processTrendData(logs: MJCommunicationLogEntity[], startTime: Date): HourlyBucket[] {
        const buckets: HourlyBucket[] = [];
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

    private buildProviderHealth(providers: MJCommunicationProviderEntity[], logs: MJCommunicationLogEntity[]): ProviderHealth[] {
        return providers.map(p => {
            const providerLogs = logs.filter(l => l.CommunicationProvider === p.Name);
            const sent = providerLogs.length;
            const failed = providerLogs.filter(l => l.Status === 'Failed').length;
            const rate = sent > 0 ? parseFloat(((sent - failed) / sent * 100).toFixed(1)) : 100;

            return {
                Name: p.Name,
                Type: this.getProviderType(p.Name),
                SentCount: sent,
                SuccessRate: rate,
                IsActive: p.Status === 'Active',
                IconClass: this.getProviderIconClass(p.Name),
                ColorClass: this.getProviderColorClass(p.Name)
            };
        });
    }

    private buildChannelBreakdown(logs: MJCommunicationLogEntity[]): ChannelBreakdown[] {
        const total = logs.length;
        if (total === 0) return [];

        const emailLogs = logs.filter(l => {
            const type = (l.CommunicationProviderMessageType || '').toLowerCase();
            return type.includes('email') || (!type.includes('sms'));
        });
        const smsLogs = logs.filter(l => {
            const type = (l.CommunicationProviderMessageType || '').toLowerCase();
            return type.includes('sms');
        });

        const channels: ChannelBreakdown[] = [];
        if (emailLogs.length > 0) {
            channels.push({
                Name: 'Email',
                IconClass: 'fa-solid fa-envelope',
                Count: emailLogs.length,
                Percentage: Math.round((emailLogs.length / total) * 100),
                ColorClass: 'email'
            });
        }
        if (smsLogs.length > 0) {
            channels.push({
                Name: 'SMS',
                IconClass: 'fa-solid fa-comment-sms',
                Count: smsLogs.length,
                Percentage: Math.round((smsLogs.length / total) * 100),
                ColorClass: 'sms'
            });
        }
        return channels;
    }

    private getProviderType(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('twilio')) return 'SMS';
        return 'Email';
    }

    private getProviderIconClass(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'fa-solid fa-envelope';
        if (n.includes('twilio')) return 'fa-solid fa-comment-sms';
        if (n.includes('gmail') || n.includes('google')) return 'fa-brands fa-google';
        if (n.includes('microsoft') || n.includes('graph') || n.includes('outlook')) return 'fa-brands fa-microsoft';
        return 'fa-solid fa-server';
    }

    private getProviderColorClass(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'sendgrid';
        if (n.includes('twilio')) return 'twilio';
        if (n.includes('gmail') || n.includes('google')) return 'gmail';
        if (n.includes('microsoft') || n.includes('graph') || n.includes('outlook')) return 'msgraph';
        return '';
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Monitor';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-line';
    }
}
