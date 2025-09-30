import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';

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
          <span class="task-due" *ngIf="task.DueAt">
            <i class="fas fa-calendar"></i> {{ task.DueAt | date:'short' }}
          </span>
          <span class="task-percent" *ngIf="task.PercentComplete != null">
            {{ task.PercentComplete }}%
          </span>
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn" (click)="onEdit()" title="Edit Task">
          <i class="fas fa-edit"></i>
        </button>
        <button class="task-action-btn" (click)="onDelete()" title="Delete Task">
          <i class="fas fa-trash"></i>
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
    .task-meta { display: flex; gap: 12px; font-size: 12px; color: #666; }
    .task-due { display: flex; align-items: center; gap: 4px; }
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
}