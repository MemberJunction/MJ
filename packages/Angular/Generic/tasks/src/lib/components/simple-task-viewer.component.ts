import { Component, Input, Output, EventEmitter, OnChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskEntity } from '@memberjunction/core-entities';
import { TaskDetailPanelComponent } from './task-detail-panel.component';

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
              [class.selected]="selectedTask?.ID === task.ID"
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
      background: #FAFAFA;
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
      border-right: 1px solid #E5E7EB;
    }

    .list-resizer {
      width: 4px;
      background: #E5E7EB;
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.2s;
    }

    .list-resizer:hover {
      background: #3B82F6;
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

    .task-item.selected {
      border-color: #3B82F6;
      background: #EFF6FF;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
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
  @Input() agentRunMap?: Map<string, string>; // Maps TaskID -> AgentRunID
  @Output() taskClicked = new EventEmitter<TaskEntity>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();

  public selectedTask: TaskEntity | null = null;
  public detailPanelWidth: number = 400;

  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  ngOnChanges() {
    // Tasks are already loaded
  }

  public onTaskClick(task: TaskEntity): void {
    this.selectedTask = task;
    this.taskClicked.emit(task);
  }

  public getAgentRunId(task: TaskEntity): string | null {
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
