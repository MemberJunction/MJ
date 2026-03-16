import { Component, Input, Output, EventEmitter, OnChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskDetailPanelComponent } from './task-detail-panel.component';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Simple list view for tasks
 */
@Component({
  selector: 'mj-simple-task-viewer',
  standalone: true,
  imports: [CommonModule, TaskDetailPanelComponent],
  template: `
    <div class="simple-task-viewer">
      <div class="list-layout">
        <div class="task-list" [class.with-detail]="selectedTask">
          @for (task of tasks; track task) {
            <div
              class="task-item"
              [class.completed]="task.Status === 'Complete'"
              [class.selected]="IsTaskSelected(task)"
              (click)="onTaskClick(task)">
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
                      @if (task.Status === 'Complete') {
                        <i class="fas fa-check completed-check"></i>
                      }
                    </span>
                    <!-- Compact progress indicator for all tasks -->
                    @if (task.PercentComplete != null) {
                      <div class="task-progress-compact">
                        <div class="progress-bar-compact">
                          <div class="progress-fill-compact"
                            [style.width.%]="task.PercentComplete"
                          [class.complete]="task.Status === 'Complete'"></div>
                        </div>
                        <span class="progress-text-compact">{{ task.PercentComplete }}%</span>
                      </div>
                    }
                  </div>
                  <span class="task-meta">
                    @if (task.DueAt) {
                      <span class="due-date">
                        <i class="far fa-calendar"></i>
                        {{ formatDate(task.DueAt) }}
                      </span>
                    }
                    @if (task.User) {
                      <span class="assigned-to">
                        <i class="far fa-user"></i>
                        {{ task.User }}
                      </span>
                    }
                  </span>
                </div>
              </div>
            </div>
          }
    
          @if (!tasks || tasks.length === 0) {
            <div class="no-tasks">
              <i class="fas fa-tasks"></i>
              <p>No tasks to display</p>
            </div>
          }
        </div>
    
        @if (selectedTask) {
          <div class="list-resizer"
          (mousedown)="startResize($event)"></div>
        }
    
        @if (selectedTask) {
          <div class="task-detail-panel" [style.width.px]="detailPanelWidth">
            <mj-task-detail-panel
              [task]="selectedTask"
              [agentRunId]="getAgentRunId(selectedTask)"
              (closePanel)="closeDetailPanel()"
              (openEntityRecord)="onOpenEntityRecord($event)">
            </mj-task-detail-panel>
          </div>
        }
      </div>
    </div>
    `,
  styles: [`
    .simple-task-viewer {
      height: 100%;
      background: var(--mj-bg-surface-sunken);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .list-layout {
      display: flex;
      height: 100%;
      position: relative;
    }

    .task-list {
      flex: 1;
      min-width: 400px;
      padding: 16px;
      overflow-y: auto;
    }

    .task-list.with-detail {
      border-right: 1px solid var(--mj-border-default);
    }

    .list-resizer {
      width: 4px;
      background: var(--mj-border-default);
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.2s;
    }

    .list-resizer:hover {
      background: var(--mj-brand-primary);
    }

    .task-detail-panel {
      min-width: 300px;
      max-width: 600px;
      height: 100%;
      flex-shrink: 0;
    }

    .task-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      margin-bottom: 8px;
      transition: all 0.2s;
      cursor: pointer;
    }

    .task-item:hover {
      border-color: var(--mj-brand-primary);
      box-shadow: var(--mj-shadow-sm);
      transform: translateY(-1px);
    }

    .task-item.selected {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      box-shadow: var(--mj-shadow-sm);
    }

    .task-item.completed {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
    }

    .status-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
      flex-shrink: 0;
    }

    .status-icon.complete {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
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
      color: var(--mj-text-primary);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .task-title.completed-text {
      color: var(--mj-text-muted);
      text-decoration: line-through;
      text-decoration-thickness: 1.5px;
    }

    .completed-check {
      color: var(--mj-status-success);
      font-size: 12px;
    }

    .task-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--mj-text-muted);
      white-space: nowrap;
    }

    .task-meta i {
      margin-right: 4px;
    }

    .task-description {
      font-size: 13px;
      color: var(--mj-text-muted);
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
      background: var(--mj-border-default);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill-compact {
      height: 100%;
      background: var(--mj-brand-primary);
      transition: width 0.3s ease;
    }

    .progress-fill-compact.complete {
      background: var(--mj-status-success);
    }

    .progress-text-compact {
      font-size: 10px;
      font-weight: 600;
      color: var(--mj-text-muted);
      min-width: 30px;
      text-align: right;
    }

    .no-tasks {
      text-align: center;
      padding: 60px 20px;
      color: var(--mj-text-disabled);
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
  @Input() tasks: MJTaskEntity[] = [];
  @Input() agentRunMap?: Map<string, string>; // Maps TaskID -> AgentRunID
  @Output() taskClicked = new EventEmitter<MJTaskEntity>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();

  public selectedTask: MJTaskEntity | null = null;

  public IsTaskSelected(task: MJTaskEntity): boolean {
    return UUIDsEqual(this.selectedTask?.ID, task.ID);
  }
  public detailPanelWidth: number = 400;

  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  ngOnChanges() {
    // Tasks are already loaded
  }

  public onTaskClick(task: MJTaskEntity): void {
    this.selectedTask = task;
    this.taskClicked.emit(task);
  }

  public getAgentRunId(task: MJTaskEntity): string | null {
    return this.agentRunMap?.get(task.ID) || null;
  }

  public closeDetailPanel(): void {
    this.selectedTask = null;
  }

  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    this.openEntityRecord.emit(event);
  }

  public startResize(event: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.detailPanelWidth;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  handleResize(event: MouseEvent): void {
    if (!this.isResizing) return;

    const delta = this.resizeStartX - event.clientX;
    const newWidth = this.resizeStartWidth + delta;

    // Constrain width between min and max
    this.detailPanelWidth = Math.max(300, Math.min(600, newWidth));
  }

  @HostListener('document:mouseup')
  stopResize(): void {
    this.isResizing = false;
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
