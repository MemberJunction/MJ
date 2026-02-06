import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Global floating tasks panel that shows all active tasks across all conversations
 * Appears in bottom-right corner, minimizable, shows only when tasks > 0
 */
@Component({
  standalone: false,
  selector: 'mj-global-tasks-panel',
  template: `
    <div class="global-tasks-panel" *ngIf="tasks.length > 0">
      <!-- Minimized State -->
      <button
        *ngIf="isMinimized"
        class="minimized-badge"
        (click)="expand()"
        title="View active tasks">
        <i class="fas fa-bolt"></i>
        <span class="task-count">{{ tasks.length }}</span>
      </button>

      <!-- Expanded State -->
      <div *ngIf="!isMinimized" class="expanded-panel">
        <div class="panel-header">
          <div class="header-left">
            <i class="fas fa-circle-notch fa-spin"></i>
            <span>Active Tasks ({{ tasks.length }})</span>
          </div>
          <button class="minimize-btn" (click)="minimize()" title="Minimize">
            <i class="fas fa-minus"></i>
          </button>
        </div>

        <div class="panel-content">
          <div class="task-item" *ngFor="let task of tasks" (click)="onTaskClick(task)">
            <div class="task-header">
              <i class="fas fa-robot"></i>
              <span class="task-agent">{{ task.agentName }}</span>
            </div>
            <div class="task-conversation" *ngIf="task.conversationName">
              <i class="fas fa-message"></i>
              <span>{{ task.conversationName }}</span>
            </div>
            <div class="task-status">
              <span class="status-indicator active"></span>
              <span class="status-text">{{ getTrimmedStatus(task.status) }}</span>
            </div>
            <div class="task-elapsed">{{ getElapsedTime(task) }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .global-tasks-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Minimized Badge */
    .minimized-badge {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 50%;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      position: relative;
      animation: pulse 2s ease-in-out infinite;
    }

    .minimized-badge:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .minimized-badge i {
      font-size: 20px;
      margin-right: 4px;
    }

    .minimized-badge .task-count {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #ef4444;
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      border: 2px solid white;
    }

    @keyframes pulse {
      0%, 100% {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      50% {
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
      }
    }

    /* Expanded Panel */
    .expanded-panel {
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      width: 360px;
      max-height: 480px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
    }

    .header-left i {
      font-size: 16px;
    }

    .minimize-btn {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: none;
      border-radius: 6px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
    }

    .minimize-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .panel-content {
      overflow-y: auto;
      max-height: 420px;
    }

    .task-item {
      padding: 12px 16px;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.2s;
    }

    .task-item:hover {
      background: #f9fafb;
    }

    .task-item:last-child {
      border-bottom: none;
    }

    .task-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .task-header i {
      color: #667eea;
      font-size: 14px;
    }

    .task-agent {
      font-weight: 600;
      font-size: 13px;
      color: #111827;
    }

    .task-conversation {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 6px;
    }

    .task-conversation i {
      font-size: 11px;
    }

    .task-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-indicator.active {
      background: #10b981;
      animation: blink 2s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .status-text {
      font-size: 12px;
      color: #4b5563;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-elapsed {
      font-size: 11px;
      color: #9ca3af;
      font-variant-numeric: tabular-nums;
    }

    /* Scrollbar Styling */
    .panel-content::-webkit-scrollbar {
      width: 6px;
    }

    .panel-content::-webkit-scrollbar-track {
      background: #f9fafb;
    }

    .panel-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    .panel-content::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }
  `]
})
export class GlobalTasksPanelComponent implements OnInit, OnDestroy {
  public tasks: ActiveTask[] = [];
  public isMinimized: boolean = false;

  private destroy$ = new Subject<void>();

  @Output() taskClicked = new EventEmitter<ActiveTask>();

  constructor(private activeTasksService: ActiveTasksService) {}

  ngOnInit() {
    // Subscribe to active tasks
    this.activeTasksService.tasks$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(tasks => {
      this.tasks = tasks;

      // Auto-expand if tasks appear and panel was minimized
      if (this.tasks.length > 0 && this.isMinimized) {
        // Keep minimized, let user expand manually
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  expand() {
    this.isMinimized = false;
  }

  minimize() {
    this.isMinimized = true;
  }

  onTaskClick(task: ActiveTask) {
    this.taskClicked.emit(task);
  }

  getTrimmedStatus(status: string): string {
    // Remove emojis and trim to 50 chars
    const cleaned = status.replace(/[\u{1F600}-\u{1F64F}]/gu, '').trim();
    return cleaned.length > 50 ? cleaned.substring(0, 47) + '...' : cleaned;
  }

  getElapsedTime(task: ActiveTask): string {
    const elapsed = Date.now() - task.startTime;
    const seconds = Math.floor(elapsed / 1000);
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
}
