import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IntegrationSummary } from '../../services/integration-data.service';

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
        <span class="status-chip" [class]="'status-' + Summary.StatusColor">
          {{ StatusLabel }}
        </span>
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
            <span class="stat-label">Status</span>
            <span class="stat-value">{{ Summary.LatestRun.Status }}</span>
          </div>
        }
      </div>

      <div class="card-footer">
        <button kendoButton [look]="'flat'" [themeColor]="'primary'"
                (click)="OnRunNowClick()" [disabled]="!Summary.Integration.IsActive">
          <i class="fa-solid fa-play"></i> Run Now
        </button>
        <button kendoButton [look]="'flat'" (click)="OnExpandToggle()">
          <i class="fa-solid" [class.fa-chevron-down]="!Expanded" [class.fa-chevron-up]="Expanded"></i>
          History
        </button>
      </div>
    </div>
  `,
  styles: [`
    .integration-card {
      background: var(--card-bg, #fff);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      padding: 16px;
      transition: box-shadow 0.2s;
    }
    .integration-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
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
      background: var(--icon-bg, #f0f4ff);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: var(--primary-color, #4a6cf7);
    }
    .card-title-area { flex: 1; min-width: 0; }
    .card-title {
      margin: 0; font-size: 14px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .source-type-label { font-size: 12px; color: #888; }

    .status-chip {
      font-size: 11px; font-weight: 600; padding: 3px 8px;
      border-radius: 12px; text-transform: uppercase; white-space: nowrap;
    }
    .status-green { background: #e6f9ed; color: #1b7a3d; }
    .status-amber { background: #fff7e0; color: #b5850a; }
    .status-red   { background: #fde8e8; color: #c62828; }
    .status-gray  { background: #f0f0f0; color: #757575; }

    .card-body { margin-bottom: 12px; }
    .stat-row {
      display: flex; justify-content: space-between;
      padding: 4px 0; font-size: 13px;
    }
    .stat-label { color: #666; }
    .stat-value { font-weight: 500; }

    .card-footer {
      display: flex; justify-content: space-between;
      border-top: 1px solid #eee; padding-top: 8px;
    }
  `]
})
export class IntegrationCardComponent {
  @Input() Summary!: IntegrationSummary;
  @Input() Expanded: boolean = false;
  @Output() RunNowClick = new EventEmitter<string>();
  @Output() ExpandToggle = new EventEmitter<string>();

  get SourceIconClass(): string {
    return this.Summary.SourceType?.IconClass ?? 'fa-solid fa-plug';
  }

  get StatusLabel(): string {
    const color = this.Summary.StatusColor;
    if (color === 'green') return 'Healthy';
    if (color === 'amber') return 'Warning';
    if (color === 'red') return 'Failed';
    return 'Inactive';
  }

  OnRunNowClick(): void {
    this.RunNowClick.emit(this.Summary.Integration.ID);
  }

  OnExpandToggle(): void {
    this.ExpandToggle.emit(this.Summary.Integration.ID);
  }
}
