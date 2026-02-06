import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';

/**
 * Reusable task widget component that displays task information
 * in a consistent, polished format across the application.
 *
 * Can be used in:
 * - Tasks dropdown (active tasks)
 * - Gear icon dropdown (tasks for conversation detail)
 * - Tasks tab (full task list with filters)
 */
@Component({
  standalone: false,
  selector: 'mj-task-widget',
  template: `
    <div
      class="task-widget"
      [class.clickable]="clickable"
      [class.compact]="compact"
      (click)="onTaskClick()">

      <!-- Status Indicator -->
      <div class="task-status-indicator" [attr.data-status]="task.Status"></div>

      <!-- Task Content -->
      <div class="task-main">
        <!-- Header Row -->
        <div class="task-header">
          <div class="task-title">{{ task.Name }}</div>
          <div class="task-badges">
            <!-- Type Badge -->
            <span class="badge badge-type" *ngIf="task.Type">
              {{ task.Type }}
            </span>
            <!-- Status Badge -->
            <span
              class="badge badge-status"
              [attr.data-status]="task.Status">
              {{ task.Status }}
            </span>
          </div>
        </div>

        <!-- Description -->
        <div class="task-description" *ngIf="!compact && task.Description">
          {{ task.Description }}
        </div>

        <!-- Progress Bar (if in progress or has completion %) -->
        <div class="task-progress-container" *ngIf="showProgress && task.PercentComplete != null">
          <div class="progress-bar">
            <div
              class="progress-fill"
              [style.width.%]="task.PercentComplete"
              [attr.data-status]="task.Status">
            </div>
          </div>
          <span class="progress-text">{{ task.PercentComplete }}%</span>
        </div>

        <!-- Meta Information -->
        <div class="task-meta">
          <!-- Assignment -->
          <span class="meta-item" *ngIf="task.User">
            <i class="fas fa-user"></i>
            <span class="meta-label">User:</span>
            <span class="meta-value">{{ task.User }}</span>
          </span>
          <span class="meta-item" *ngIf="task.Agent">
            <i class="fas fa-robot"></i>
            <span class="meta-label">Agent:</span>
            <span class="meta-value">{{ task.Agent }}</span>
          </span>

          <!-- Timestamps -->
          <span class="meta-item" *ngIf="task.StartedAt">
            <i class="fas fa-play-circle"></i>
            <span class="meta-label">Started:</span>
            <span class="meta-value">{{ formatDate(task.StartedAt) }}</span>
          </span>
          <span class="meta-item" *ngIf="task.CompletedAt">
            <i class="fas fa-check-circle"></i>
            <span class="meta-label">Completed:</span>
            <span class="meta-value">{{ formatDate(task.CompletedAt) }}</span>
          </span>
          <span class="meta-item" *ngIf="task.DueAt && !task.CompletedAt">
            <i class="fas fa-calendar-alt"></i>
            <span class="meta-label">Due:</span>
            <span class="meta-value" [class.overdue]="isOverdue(task.DueAt)">
              {{ formatDate(task.DueAt) }}
            </span>
          </span>

          <!-- Duration (for completed tasks) -->
          <span class="meta-item" *ngIf="showDuration && task.StartedAt && task.CompletedAt">
            <i class="fas fa-clock"></i>
            <span class="meta-label">Duration:</span>
            <span class="meta-value">{{ getDuration(task.StartedAt, task.CompletedAt) }}</span>
          </span>

          <!-- Elapsed time (for active tasks) -->
          <span class="meta-item meta-elapsed" *ngIf="isActive && task.StartedAt && !task.CompletedAt">
            <i class="fas fa-hourglass-half"></i>
            <span class="meta-value">{{ getElapsedTime(task.StartedAt) }}</span>
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .task-widget {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 6px;
      background: white;
      border: 1px solid #E5E7EB;
      transition: all 150ms ease;
    }

    .task-widget.clickable {
      cursor: pointer;
    }

    .task-widget.clickable:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .task-widget.compact {
      padding: 8px 12px;
    }

    .task-status-indicator {
      width: 4px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .task-status-indicator[data-status="Pending"] {
      background: #9CA3AF;
    }

    .task-status-indicator[data-status="In Progress"] {
      background: #3B82F6;
    }

    .task-status-indicator[data-status="Complete"] {
      background: #10B981;
    }

    .task-status-indicator[data-status="Blocked"] {
      background: #EF4444;
    }

    .task-status-indicator[data-status="Failed"] {
      background: #DC2626;
    }

    .task-status-indicator[data-status="Cancelled"],
    .task-status-indicator[data-status="Deferred"] {
      background: #6B7280;
    }

    .task-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .task-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      line-height: 1.4;
      flex: 1;
    }

    .task-badges {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .badge-type {
      background: #F3F4F6;
      color: #6B7280;
    }

    .badge-status[data-status="Pending"] {
      background: #F3F4F6;
      color: #6B7280;
    }

    .badge-status[data-status="In Progress"] {
      background: #DBEAFE;
      color: #1E40AF;
    }

    .badge-status[data-status="Complete"] {
      background: #D1FAE5;
      color: #065F46;
    }

    .badge-status[data-status="Blocked"] {
      background: #FEE2E2;
      color: #991B1B;
    }

    .badge-status[data-status="Failed"] {
      background: #FEE2E2;
      color: #7F1D1D;
    }

    .badge-status[data-status="Cancelled"],
    .badge-status[data-status="Deferred"] {
      background: #F3F4F6;
      color: #4B5563;
    }

    .task-description {
      font-size: 13px;
      color: #6B7280;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .task-progress-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-bar {
      flex: 1;
      height: 6px;
      background: #F3F4F6;
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      transition: width 300ms ease;
      border-radius: 3px;
    }

    .progress-fill[data-status="In Progress"] {
      background: #3B82F6;
    }

    .progress-fill[data-status="Complete"] {
      background: #10B981;
    }

    .progress-fill[data-status="Blocked"],
    .progress-fill[data-status="Failed"] {
      background: #EF4444;
    }

    .progress-text {
      font-size: 11px;
      font-weight: 600;
      color: #6B7280;
      min-width: 35px;
      text-align: right;
    }

    .task-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
      color: #6B7280;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .meta-item i {
      font-size: 10px;
      opacity: 0.7;
    }

    .meta-label {
      font-weight: 500;
    }

    .meta-value {
      color: #111827;
    }

    .meta-value.overdue {
      color: #DC2626;
      font-weight: 600;
    }

    .meta-elapsed {
      color: #3B82F6;
      font-weight: 600;
    }
  `]
})
export class TaskWidgetComponent {
  @Input() task!: TaskEntity;
  @Input() clickable: boolean = false;
  @Input() compact: boolean = false;
  @Input() showProgress: boolean = true;
  @Input() showDuration: boolean = true;
  @Output() taskClick = new EventEmitter<TaskEntity>();

  get isActive(): boolean {
    return this.task.Status === 'In Progress';
  }

  onTaskClick(): void {
    if (this.clickable) {
      this.taskClick.emit(this.task);
    }
  }

  formatDate(date: Date | null): string {
    if (!date) return '';

    const now = new Date();
    const taskDate = new Date(date);
    const diffMs = now.getTime() - taskDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    // Less than 1 hour ago
    if (diffMins < 60) {
      return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
    }

    // Less than 24 hours ago
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    // Less than 7 days ago
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    // Format as date
    return taskDate.toLocaleDateString();
  }

  isOverdue(dueDate: Date | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate).getTime() < Date.now();
  }

  getDuration(start: Date | null, end: Date | null): string {
    if (!start || !end) return '';

    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) {
      return `${diffSecs}s`;
    }

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) {
      return `${diffMins}m`;
    }

    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;

    if (diffHours < 24) {
      return remainingMins > 0 ? `${diffHours}h ${remainingMins}m` : `${diffHours}h`;
    }

    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
  }

  getElapsedTime(start: Date | null): string {
    if (!start) return '';

    const diffMs = Date.now() - new Date(start).getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) {
      return `${diffSecs}s`;
    }

    const diffMins = Math.floor(diffSecs / 60);
    const remainingSecs = diffSecs % 60;

    if (diffMins < 60) {
      return `${diffMins}:${remainingSecs.toString().padStart(2, '0')}`;
    }

    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    return `${diffHours}:${remainingMins.toString().padStart(2, '0')}`;
  }
}
