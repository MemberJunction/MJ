import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IRunViewProvider } from '@memberjunction/core';
import { IntegrationSummary, ResolveIntegrationIcon } from '../../services/integration-data.service';

@Component({
  standalone: false,
  selector: 'app-integration-card',
  template: `
    <div class="integration-card" [class.inactive]="!Summary.Integration.IsActive">
      <div class="card-header">
        <div class="source-icon">
          <i [class]="SourceIconClass"></i>
        </div>
        <div class="card-title-area">
          <h3 class="card-title">{{ Summary.Integration.Name }}</h3>
          <span class="source-type-label">{{ Summary.SourceType?.Name ?? 'Unknown' }}</span>
        </div>
        <div class="status-area">
          <span class="status-indicator" [class]="'indicator-' + Summary.StatusColor"
                [class.pulsing]="IsActivelySyncing"></span>
          <span class="status-chip" [class]="'status-' + Summary.StatusColor">
            {{ StatusLabel }}
          </span>
        </div>
      </div>

      <div class="card-body">
        <div class="stat-row">
          <span class="stat-label">Last Run</span>
          <span class="stat-value">{{ Summary.RelativeTime }}</span>
        </div>
        @if (Summary.LatestRun) {
          <div class="stat-row">
            <span class="stat-label">Records Synced</span>
            <span class="stat-value">{{ Summary.LatestRun.TotalRecords | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Duration</span>
            <span class="stat-value">{{ FormattedDuration }}</span>
          </div>
        }
        @if (Summary.TotalErrors > 0) {
          <div class="stat-row">
            <span class="stat-label">Errors</span>
            <span class="stat-value error-value">
              <span class="error-badge">{{ Summary.TotalErrors }}</span>
            </span>
          </div>
        }
      </div>

      <!-- Sparkline: records synced for last 5 runs -->
      @if (Summary.RecentRuns.length > 1) {
        <div class="sparkline-row">
          <span class="sparkline-label">Recent syncs</span>
          <div class="sparkline">
            @for (run of Summary.RecentRuns; track run.ID) {
              <div class="spark-bar"
                   [style.height.%]="SparkBarHeight(run.TotalRecords)"
                   [class.spark-success]="run.Status === 'Success'"
                   [class.spark-failed]="run.Status === 'Failed'"
                   [class.spark-pending]="run.Status !== 'Success' && run.Status !== 'Failed'"
                   [title]="run.TotalRecords + ' records - ' + run.Status">
              </div>
            }
          </div>
        </div>
      }

      <div class="card-footer">
        <button mjButton variant="primary" size="sm"
                (click)="OnRunNowClick()" [disabled]="!Summary.Integration.IsActive">
          <i class="fa-solid fa-play"></i> Run Now
        </button>
        <button mjButton variant="flat" size="sm" (click)="OnExpandToggle()">
          <i class="fa-solid" [class.fa-chevron-down]="!Expanded" [class.fa-chevron-up]="Expanded"></i>
          History
        </button>
      </div>
    </div>
  `,
  styles: [`
    .integration-card {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      padding: 16px;
      transition: box-shadow 0.2s;
    }
    .integration-card:hover { box-shadow: var(--mj-shadow-md); }
    .integration-card.inactive { opacity: 0.6; }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .source-icon {
      width: 40px; height: 40px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: var(--mj-brand-primary);
    }
    .card-title-area { flex: 1; min-width: 0; }
    .card-title {
      margin: 0; font-size: 14px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .source-type-label { font-size: 12px; color: var(--mj-text-muted); }

    .status-area {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .indicator-green { background: var(--mj-status-success); }
    .indicator-amber { background: var(--mj-status-warning); }
    .indicator-red { background: var(--mj-status-error); }
    .indicator-gray { background: var(--mj-text-disabled); }

    .status-indicator.pulsing {
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }

    .status-chip {
      font-size: 11px; font-weight: 600; padding: 3px 8px;
      border-radius: 12px; text-transform: uppercase; white-space: nowrap;
    }
    .status-green { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
    .status-amber { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
    .status-red   { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
    .status-gray  { background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); }

    .card-body { margin-bottom: 12px; }
    .stat-row {
      display: flex; justify-content: space-between;
      padding: 4px 0; font-size: 13px;
    }
    .stat-label { color: var(--mj-text-secondary); }
    .stat-value { font-weight: 500; }
    .error-value { color: var(--mj-status-error-text); }
    .error-badge {
      background: var(--mj-status-error-bg);
      color: var(--mj-status-error-text);
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
    }

    /* Sparkline */
    .sparkline-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 8px 0;
      border-top: 1px solid var(--mj-border-subtle);
      margin-bottom: 4px;
    }
    .sparkline-label {
      font-size: 11px;
      color: var(--mj-text-disabled);
      white-space: nowrap;
    }
    .sparkline {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 24px;
      flex: 1;
    }
    .spark-bar {
      flex: 1;
      min-height: 2px;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s ease;
    }
    .spark-success { background: var(--mj-brand-primary); }
    .spark-failed { background: var(--mj-status-error); }
    .spark-pending { background: var(--mj-status-warning); }

    .card-footer {
      display: flex; justify-content: space-between;
      border-top: 1px solid var(--mj-border-subtle); padding-top: 8px;
    }
  `]
})
export class IntegrationCardComponent {
  @Input() Summary!: IntegrationSummary;
  @Input() Expanded: boolean = false;
  @Input() ViewProvider: IRunViewProvider | null = null;
  @Output() RunNowClick = new EventEmitter<string>();
  @Output() ExpandToggle = new EventEmitter<string>();

  get SourceIconClass(): string {
    if (this.Summary.SourceType?.IconClass) {
      return this.Summary.SourceType.IconClass;
    }
    return ResolveIntegrationIcon(
      this.Summary.Integration.Integration ?? this.Summary.Integration.Name,
      this.Summary.Icon
    );
  }

  get StatusLabel(): string {
    const color = this.Summary.StatusColor;
    if (color === 'green') return 'Healthy';
    if (color === 'amber') return 'Warning';
    if (color === 'red') return 'Failed';
    return 'Inactive';
  }

  get IsActivelySyncing(): boolean {
    return this.Summary.LatestRun?.Status === 'In Progress'
      || this.Summary.LatestRun?.Status === 'Pending';
  }

  get FormattedDuration(): string {
    const ms = this.Summary.DurationMs;
    if (ms == null) return '--';
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  get MaxSparkRecords(): number {
    const maxVal = Math.max(...this.Summary.RecentRuns.map(r => r.TotalRecords));
    return maxVal > 0 ? maxVal : 1;
  }

  SparkBarHeight(records: number): number {
    return Math.max((records / this.MaxSparkRecords) * 100, 8);
  }

  OnRunNowClick(): void {
    this.RunNowClick.emit(this.Summary.Integration.ID);
  }

  OnExpandToggle(): void {
    this.ExpandToggle.emit(this.Summary.Integration.ID);
  }
}
