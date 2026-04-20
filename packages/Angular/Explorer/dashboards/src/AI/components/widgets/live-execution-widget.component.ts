import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { LiveExecution } from '../../services/ai-instrumentation.service';

@Component({
  standalone: false,
  selector: 'app-live-execution-widget',
  template: `
    <div class="live-execution-widget">
      <div class="widget-header">
        <h3 class="widget-title">
          <i class="fa-solid fa-bolt"></i>
          Live Executions
        </h3>
        <div class="active-count" [class.pulsing]="hasActiveExecutions()">
          {{ getActiveCount() }} active
        </div>
      </div>

      @if (executions.length > 0) {
        <div class="execution-list">
          @for (execution of executions.slice(0, maxVisible); track execution.id) {
            <div 
              class="execution-item"
              [class]="'execution-item--' + execution.status"
              (click)="onExecutionClick(execution)"
            >
          <div class="execution-icon">
            <i [class]="getExecutionIcon(execution)"></i>
          </div>
          
          <div class="execution-info">
            <div class="execution-name">{{ execution.name }}</div>
            <div class="execution-meta">
              <span class="execution-type">{{ execution.type }}</span>
              <span class="execution-duration">{{ formatDuration(execution.duration) }}</span>
              @if (execution.cost) {
                <span class="execution-cost">
                  {{ formatCurrency(execution.cost) }}
                </span>
              }
            </div>
          </div>

          <div class="execution-status">
            @if (execution.status === 'running' && execution.progress) {
              <div class="progress-ring">
              <svg width="24" height="24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="var(--mj-border-default)"
                  stroke-width="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="var(--mj-brand-primary)"
                  stroke-width="2"
                  stroke-linecap="round"
                  [style.stroke-dasharray]="circumference"
                  [style.stroke-dashoffset]="getProgressOffset(execution.progress)"
                  class="progress-circle"
                />
              </svg>
                <span class="progress-text">{{ execution.progress.toFixed(0) }}%</span>
              </div>
            }
            
            <div class="status-indicator" [class]="'status-indicator--' + execution.status">
              <i [class]="getStatusIcon(execution.status)"></i>
            </div>
          </div>
            </div>
          }

          @if (executions.length > maxVisible) {
            <div class="show-more">
          <button 
            class="show-more-btn"
            (click)="toggleShowAll()"
          >
              {{ showAll ? 'Show Less' : 'Show All (' + executions.length + ')' }}
              <i [class]="showAll ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i>
            </button>
            </div>
          }
        </div>
      } @else {
        <div class="no-executions">
          <i class="fa-solid fa-circle-check"></i>
          <p>No recent executions</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .live-execution-widget {
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      height: 400px;
      display: flex;
      flex-direction: column;
    }

    .widget-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--mj-border-default);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .widget-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .widget-title i {
      color: var(--mj-brand-primary);
    }

    .active-count {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.3s ease;
    }

    .active-count.pulsing {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.7; }
      100% { opacity: 1; }
    }

    .execution-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .execution-item {
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      border-left: 3px solid transparent;
    }

    .execution-item:hover {
      background: var(--mj-bg-surface-card);
    }

    .execution-item--running {
      border-left-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 2%, var(--mj-bg-surface));
    }

    .execution-item--completed {
      border-left-color: var(--mj-status-success);
    }

    .execution-item--failed {
      border-left-color: var(--mj-status-error);
      background: color-mix(in srgb, var(--mj-status-error) 2%, var(--mj-bg-surface));
    }

    .execution-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }

    .execution-item--running .execution-icon {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .execution-item--completed .execution-icon {
      background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .execution-item--failed .execution-icon {
      background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }

    .execution-info {
      flex: 1;
      min-width: 0;
    }

    .execution-name {
      font-weight: 500;
      color: var(--mj-text-primary);
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .execution-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .execution-type {
      background: var(--mj-bg-surface-sunken);
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 500;
    }

    .execution-duration {
      color: var(--mj-text-disabled);
    }

    .execution-cost {
      color: var(--mj-status-warning);
      font-weight: 500;
    }

    .execution-status {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .progress-ring {
      position: relative;
      width: 24px;
      height: 24px;
    }

    .progress-circle {
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 0.3s ease;
    }

    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 8px;
      font-weight: 600;
      color: var(--mj-brand-primary);
    }

    .status-indicator {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }

    .status-indicator--running {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      animation: pulse 2s infinite;
    }

    .status-indicator--completed {
      background: var(--mj-status-success);
      color: var(--mj-text-inverse);
    }

    .status-indicator--failed {
      background: var(--mj-status-error);
      color: var(--mj-text-inverse);
    }

    .show-more {
      padding: 12px 20px;
      border-top: 1px solid var(--mj-border-default);
    }

    .show-more-btn {
      width: 100%;
      background: none;
      border: none;
      color: var(--mj-brand-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px;
      border-radius: 4px;
      transition: background 0.2s ease;
    }

    .show-more-btn:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .no-executions {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-disabled);
      gap: 12px;
    }

    .no-executions i {
      font-size: 32px;
      color: var(--mj-border-default);
    }

    .no-executions p {
      margin: 0;
      font-size: 14px;
    }

    @media (max-width: 768px) {
      .execution-item {
        padding: 10px 16px;
      }

      .execution-meta {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
    }
  `]
})
export class LiveExecutionWidgetComponent implements OnInit, OnDestroy {
  @Input() executions: LiveExecution[] = [];
  @Input() maxVisible = 8;
  @Output() executionClick = new EventEmitter<LiveExecution>();

  showAll = false;
  circumference = 2 * Math.PI * 10; // r=10

  ngOnInit() {}

  ngOnDestroy() {}

  trackByExecutionId(index: number, execution: LiveExecution): string {
    return execution.id;
  }

  hasActiveExecutions(): boolean {
    return this.executions.some(e => e.status === 'running');
  }

  getActiveCount(): number {
    return this.executions.filter(e => e.status === 'running').length;
  }

  getExecutionIcon(execution: LiveExecution): string {
    if (execution.type === 'agent') {
      return 'fa-solid fa-robot';
    } else {
      return 'fa-solid fa-comment-dots';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return 'fa-solid fa-play';
      case 'completed':
        return 'fa-solid fa-check';
      case 'failed':
        return 'fa-solid fa-times';
      default:
        return 'fa-solid fa-question';
    }
  }

  formatDuration(duration?: number): string {
    if (!duration) return '0s';
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getProgressOffset(progress: number): number {
    return this.circumference - (progress / 100) * this.circumference;
  }

  toggleShowAll(): void {
    this.showAll = !this.showAll;
    this.maxVisible = this.showAll ? this.executions.length : 8;
  }

  onExecutionClick(execution: LiveExecution): void {
    this.executionClick.emit(execution);
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(4)}`;
  }
}