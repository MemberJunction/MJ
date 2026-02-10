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
                  stroke="#e0e0e0"
                  stroke-width="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="#2196f3"
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      height: 400px;
      display: flex;
      flex-direction: column;
    }

    .widget-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .widget-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .widget-title i {
      color: #2196f3;
    }

    .active-count {
      background: #e3f2fd;
      color: #2196f3;
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
      background: #f8f9fa;
    }

    .execution-item--running {
      border-left-color: #2196f3;
      background: rgba(33, 150, 243, 0.02);
    }

    .execution-item--completed {
      border-left-color: #4caf50;
    }

    .execution-item--failed {
      border-left-color: #f44336;
      background: rgba(244, 67, 54, 0.02);
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
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .execution-item--completed .execution-icon {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .execution-item--failed .execution-icon {
      background: rgba(244, 67, 54, 0.1);
      color: #f44336;
    }

    .execution-info {
      flex: 1;
      min-width: 0;
    }

    .execution-name {
      font-weight: 500;
      color: #333;
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
      color: #666;
    }

    .execution-type {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 500;
    }

    .execution-duration {
      color: #999;
    }

    .execution-cost {
      color: #ff9800;
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
      color: #2196f3;
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
      background: #2196f3;
      color: white;
      animation: pulse 2s infinite;
    }

    .status-indicator--completed {
      background: #4caf50;
      color: white;
    }

    .status-indicator--failed {
      background: #f44336;
      color: white;
    }

    .show-more {
      padding: 12px 20px;
      border-top: 1px solid #f0f0f0;
    }

    .show-more-btn {
      width: 100%;
      background: none;
      border: none;
      color: #2196f3;
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
      background: rgba(33, 150, 243, 0.1);
    }

    .no-executions {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #999;
      gap: 12px;
    }

    .no-executions i {
      font-size: 32px;
      color: #ddd;
    }

    .no-executions p {
      margin: 0;
      font-size: 14px;
    }

    /* Custom scrollbar */
    .execution-list::-webkit-scrollbar {
      width: 4px;
    }

    .execution-list::-webkit-scrollbar-track {
      background: #f1f1f1;
    }

    .execution-list::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 2px;
    }

    .execution-list::-webkit-scrollbar-thumb:hover {
      background: #999;
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