import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';

type DueDateStatus = 'overdue' | 'due-soon' | 'future' | 'completed' | 'none';

@Component({
  selector: 'mj-task-item',
  template: `
    <div class="task-item" [class.completed]="task.Status === 'Complete'">
      <div class="task-checkbox">
        <input
          type="checkbox"
          [checked]="task.Status === 'Complete'"
          (change)="onToggleStatus()"
          [disabled]="disabled">
      </div>
      <div class="task-content">
        <div class="task-title">{{ task.Name }}</div>
        <div class="task-meta">
          <span class="task-status-badge" [class]="'status-' + task.Status.toLowerCase().replace(' ', '-')">
            {{ task.Status }}
          </span>
          @if (task.DueAt) {
            <span
              class="task-due"
              [class]="'due-' + getDueDateStatus()"
              [title]="getDueDateTooltip()">
              <i [class]="getDueDateIcon()"></i>
              <span class="due-date-text">{{ getRelativeDueDate() }}</span>
            </span>
          }
          @if (task.PercentComplete != null) {
            <span class="task-percent">
              {{ task.PercentComplete }}%
            </span>
          }
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn" (click)="onEdit()" title="Edit Task">
          <i class="fa-solid fa-edit"></i>
        </button>
        <button class="task-action-btn" (click)="onDelete()" title="Delete Task">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .task-item { display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #E8E8E8; transition: background 150ms ease; }
    .task-item:hover { background: #F9F9F9; }
    .task-item.completed { opacity: 0.6; }
    .task-item.completed .task-title { text-decoration: line-through; }
    .task-status-badge { padding: 2px 8px; border-radius: 3px; font-weight: 500; font-size: 11px; }
    .status-pending { background: #FFF3E0; color: #E65100; }
    .status-in-progress { background: #E3F2FD; color: #1976D2; }
    .status-complete { background: #E8F5E9; color: #388E3C; }
    .status-cancelled { background: #F5F5F5; color: #666; }
    .status-failed { background: #FFEBEE; color: #C62828; }
    .status-blocked { background: #FFEBEE; color: #D84315; }
    .status-deferred { background: #F5F5F5; color: #999; }
    .task-percent { color: #0076B6; font-weight: 500; }
    .task-checkbox input { width: 18px; height: 18px; cursor: pointer; }
    .task-content { flex: 1; }
    .task-title { font-size: 14px; margin-bottom: 4px; }
    .task-meta { display: flex; gap: 12px; font-size: 12px; color: #666; align-items: center; }
    .task-due { display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 3px; font-weight: 500; }
    .task-due i { font-size: 11px; }
    .due-date-text { font-size: 11px; }

    /* Due date status colors */
    .due-overdue { background: #FFEBEE; color: #C62828; }
    .due-due-soon { background: #FFF3E0; color: #E65100; }
    .due-future { background: #E8F5E9; color: #388E3C; }
    .due-completed { background: #F5F5F5; color: #757575; }

    .task-actions { display: none; gap: 4px; }
    .task-item:hover .task-actions { display: flex; }
    .task-action-btn { padding: 6px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #666; }
    .task-action-btn:hover { background: rgba(0,0,0,0.1); }
  `]
})
export class TaskItemComponent {
  @Input() task!: TaskEntity;
  @Input() disabled: boolean = false;

  @Output() statusToggled = new EventEmitter<TaskEntity>();
  @Output() editRequested = new EventEmitter<TaskEntity>();
  @Output() deleteRequested = new EventEmitter<TaskEntity>();

  onToggleStatus(): void {
    this.statusToggled.emit(this.task);
  }

  onEdit(): void {
    this.editRequested.emit(this.task);
  }

  onDelete(): void {
    this.deleteRequested.emit(this.task);
  }

  getDueDateStatus(): DueDateStatus {
    if (!this.task.DueAt) {
      return 'none';
    }

    if (this.task.Status === 'Complete') {
      return 'completed';
    }

    const now = new Date();
    const dueDate = new Date(this.task.DueAt);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) {
      return 'overdue';
    } else if (diffHours < 24) {
      return 'due-soon';
    } else {
      return 'future';
    }
  }

  getDueDateIcon(): string {
    const status = this.getDueDateStatus();

    switch (status) {
      case 'overdue':
        return 'fa-solid fa-exclamation-circle';
      case 'due-soon':
        return 'fa-solid fa-clock';
      case 'future':
        return 'fa-solid fa-calendar-check';
      case 'completed':
        return 'fa-solid fa-check-circle';
      default:
        return 'fa-solid fa-calendar';
    }
  }

  getRelativeDueDate(): string {
    if (!this.task.DueAt) {
      return '';
    }

    const now = new Date();
    const dueDate = new Date(this.task.DueAt);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (this.task.Status === 'Complete') {
      return 'Completed';
    }

    if (diffMs < 0) {
      const absDays = Math.abs(diffDays);
      if (absDays === 0) {
        return 'Overdue (today)';
      } else if (absDays === 1) {
        return 'Overdue by 1 day';
      } else {
        return `Overdue by ${absDays} days`;
      }
    } else if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `Due in ${diffMinutes} min`;
    } else if (diffHours < 24) {
      return `Due in ${diffHours} hours`;
    } else if (diffDays === 0) {
      return 'Due today';
    } else if (diffDays === 1) {
      return 'Due tomorrow';
    } else if (diffDays < 7) {
      return `Due in ${diffDays} days`;
    } else {
      const weeks = Math.floor(diffDays / 7);
      if (weeks === 1) {
        return 'Due in 1 week';
      } else {
        return `Due in ${weeks} weeks`;
      }
    }
  }

  getDueDateTooltip(): string {
    if (!this.task.DueAt) {
      return '';
    }

    const dueDate = new Date(this.task.DueAt);
    return dueDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}