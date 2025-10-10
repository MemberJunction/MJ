import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskEntity } from '@memberjunction/core-entities';

/**
 * Simple list view for tasks
 */
@Component({
  selector: 'mj-simple-task-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="simple-task-viewer">
      <div class="task-list">
        <div *ngFor="let task of tasks"
             class="task-item"
             [class.completed]="task.Status === 'Complete'"
             (click)="taskClicked.emit(task)">

          <!-- Status Icon -->
          <div class="status-icon" [class.complete]="task.Status === 'Complete'">
            <i class="fas" [ngClass]="getStatusIcon(task.Status)"></i>
          </div>

          <!-- Task Content -->
          <div class="task-content">
            <div class="task-header">
              <div class="task-title-row">
                <span class="task-title" [class.completed-text]="task.Status === 'Complete'">
                  {{ task.Name }}
                  <i *ngIf="task.Status === 'Complete'" class="fas fa-check completed-check"></i>
                </span>
                <!-- Compact progress indicator for all tasks -->
                <div *ngIf="task.PercentComplete != null" class="task-progress-compact">
                  <div class="progress-bar-compact">
                    <div class="progress-fill-compact"
                         [style.width.%]="task.PercentComplete"
                         [class.complete]="task.Status === 'Complete'"></div>
                  </div>
                  <span class="progress-text-compact">{{ task.PercentComplete }}%</span>
                </div>
              </div>
              <span class="task-meta">
                <span *ngIf="task.DueAt" class="due-date">
                  <i class="far fa-calendar"></i>
                  {{ formatDate(task.DueAt) }}
                </span>
                <span *ngIf="task.User" class="assigned-to">
                  <i class="far fa-user"></i>
                  {{ task.User }}
                </span>
              </span>
            </div>
            <div *ngIf="task.Description" class="task-description">
              {{ task.Description }}
            </div>
          </div>
        </div>

        <div *ngIf="!tasks || tasks.length === 0" class="no-tasks">
          <i class="fas fa-tasks"></i>
          <p>No tasks to display</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .simple-task-viewer {
      height: 100%;
      overflow-y: auto;
      background: #FAFAFA;
    }

    .task-list {
      padding: 16px;
    }

    .task-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      margin-bottom: 8px;
      transition: all 0.2s;
      cursor: pointer;
    }

    .task-item:hover {
      border-color: #3B82F6;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
      transform: translateY(-1px);
    }

    .task-item.completed {
      background: #F9FAFB;
      border-color: #D1D5DB;
    }

    .status-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FEF3C7;
      color: #F59E0B;
      flex-shrink: 0;
    }

    .status-icon.complete {
      background: #D1FAE5;
      color: #10B981;
    }

    .task-content {
      flex: 1;
      min-width: 0;
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 6px;
    }

    .task-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .task-title {
      font-weight: 600;
      color: #111827;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .task-title.completed-text {
      color: #6B7280;
      text-decoration: line-through;
      text-decoration-thickness: 1.5px;
    }

    .completed-check {
      color: #10B981;
      font-size: 12px;
    }

    .task-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #6B7280;
      white-space: nowrap;
    }

    .task-meta i {
      margin-right: 4px;
    }

    .task-description {
      font-size: 13px;
      color: #6B7280;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .task-progress-compact {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .progress-bar-compact {
      width: 80px;
      height: 4px;
      background: #E5E7EB;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill-compact {
      height: 100%;
      background: #3B82F6;
      transition: width 0.3s ease;
    }

    .progress-fill-compact.complete {
      background: #10B981;
    }

    .progress-text-compact {
      font-size: 10px;
      font-weight: 600;
      color: #6B7280;
      min-width: 30px;
      text-align: right;
    }

    .no-tasks {
      text-align: center;
      padding: 60px 20px;
      color: #9CA3AF;
    }

    .no-tasks i {
      font-size: 48px;
      opacity: 0.3;
      margin-bottom: 12px;
    }

    .no-tasks p {
      margin: 0;
      font-size: 14px;
    }
  `]
})
export class SimpleTaskViewerComponent implements OnChanges {
  @Input() tasks: TaskEntity[] = [];
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  ngOnChanges() {
    // Tasks are already loaded
  }

  public getStatusIcon(status: string): string {
    switch (status) {
      case 'Complete': return 'fa-check-circle';
      case 'In Progress': return 'fa-spinner';
      case 'Pending': return 'fa-clock';
      case 'Blocked': return 'fa-ban';
      case 'Failed': return 'fa-times-circle';
      default: return 'fa-circle';
    }
  }

  public formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
