import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';

/**
 * Panel component that displays currently running agent tasks.
 * Shows as a floating panel in bottom-right corner when tasks are active.
 */
@Component({
  standalone: false,
  selector: 'mj-active-tasks-panel',
  template: `
    @if ((taskCount$ | async)! > 0) {
      <div class="active-tasks-panel">
        <div class="panel-header" (click)="toggleExpanded()">
          <i class="fas fa-tasks"></i>
          <span>Active Tasks ({{ taskCount$ | async }})</span>
          <i class="fas" [ngClass]="isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
        </div>
        @if (isExpanded) {
          <div class="panel-content">
            @for (task of (tasks$ | async); track task) {
              <div class="task-item">
                <div class="task-header">
                  <i class="fas fa-circle-notch fa-spin"></i>
                  <span class="task-agent">{{ task.agentName }}</span>
                  <span class="task-elapsed">{{ getElapsedTime(task) }}</span>
                </div>
                <div class="task-status">{{ getTrimmedStatus(task.status) }}</div>
              </div>
            }
          </div>
        }
      </div>
    }
    `,
  styles: [`
    .active-tasks-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #F9FAFB;
      border-bottom: 1px solid #E5E7EB;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      color: #111827;
      transition: background 150ms ease;
    }

    .panel-header:hover {
      background: #F3F4F6;
    }

    .panel-header i:first-child {
      color: #0076B6;
    }

    .panel-header span {
      flex: 1;
    }

    .panel-header i:last-child {
      color: #6B7280;
      font-size: 12px;
    }

    .panel-content {
      max-height: 300px;
      overflow-y: auto;
    }

    .task-item {
      padding: 12px 16px;
      border-bottom: 1px solid #F3F4F6;
    }

    .task-item:last-child {
      border-bottom: none;
    }

    .task-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .task-header i {
      color: #0076B6;
      font-size: 14px;
    }

    .task-agent {
      flex: 1;
      font-weight: 600;
      color: #111827;
      font-size: 14px;
    }

    .task-elapsed {
      font-size: 12px;
      color: #6B7280;
      font-weight: 500;
    }

    .task-status {
      font-size: 13px;
      color: #6B7280;
      padding-left: 22px;
    }
  `]
})
export class ActiveTasksPanelComponent {
  tasks$: Observable<ActiveTask[]>;
  taskCount$: Observable<number>;
  isExpanded = true;

  constructor(private activeTasksService: ActiveTasksService) {
    this.tasks$ = this.activeTasksService.tasks$;
    this.taskCount$ = this.activeTasksService.taskCount$;
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  getElapsedTime(task: ActiveTask): string {
    const elapsed = Date.now() - task.startTime;
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  getTrimmedStatus(status: string): string {
    const maxLength = 50;
    if (status.length <= maxLength) {
      return status;
    }
    return status.substring(0, maxLength) + '...';
  }
}
