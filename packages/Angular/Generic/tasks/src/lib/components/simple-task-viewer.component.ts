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
              <div class="status-icon"
                   [class.complete]="task.Status === 'Complete'"
                   [class.failed]="task.Status === 'Failed'"
                   [class.blocked]="task.Status === 'Blocked'">
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

    /* Failed and Blocked are distinct outcomes: Failed is this task's own error, Blocked
       means an upstream dependency can never be satisfied. Both previously rendered with
       the default (pending) treatment, so a dead graph looked like a waiting one. */
    .status-icon.failed {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }

    .status-icon.blocked {
      background: color-mix(in srgb, var(--mj-text-muted) 15%, var(--mj-bg-surface));
      color: var(--mj-text-muted);
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
  @Input() Tasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link Tasks}. */
  @Input() set tasks(value: MJTaskEntity[]) {
    this.Tasks = value;
  }
  /** @deprecated Use {@link Tasks}. */
  get tasks(): MJTaskEntity[] {
    return this.Tasks;
  }
  @Input() AgentRunMap?: Map<string, string>;

  /** @deprecated Use {@link AgentRunMap}. */
  @Input() set agentRunMap(value: Map<string, string> | undefined) {
    this.AgentRunMap = value;
  }
  /** @deprecated Use {@link AgentRunMap}. */
  get agentRunMap(): Map<string, string> | undefined {
    return this.AgentRunMap;
  } // Maps TaskID -> AgentRunID
  @Output() TaskClicked = new EventEmitter<MJTaskEntity>();

  /**
   * @deprecated Use {@link TaskClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (taskClicked) keeps working. Must stay AFTER TaskClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() taskClicked = this.TaskClicked;
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;

  public SelectedTask: MJTaskEntity | null = null;

  /** @deprecated Use {@link SelectedTask}. */
  public get selectedTask(): MJTaskEntity | null {
    return this.SelectedTask;
  }
  /** @deprecated Use {@link SelectedTask}. */
  public set selectedTask(value: MJTaskEntity | null) {
    this.SelectedTask = value;
  }

  public IsTaskSelected(task: MJTaskEntity): boolean {
    return UUIDsEqual(this.SelectedTask?.ID, task.ID);
  }
  public DetailPanelWidth: number = 400;

  /** @deprecated Use {@link DetailPanelWidth}. */
  public get detailPanelWidth(): number {
    return this.DetailPanelWidth;
  }
  /** @deprecated Use {@link DetailPanelWidth}. */
  public set detailPanelWidth(value: number) {
    this.DetailPanelWidth = value;
  }

  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  ngOnChanges() {
    // Tasks are already loaded
  }

  public OnTaskClick(task: MJTaskEntity): void {
    this.SelectedTask = task;
    this.TaskClicked.emit(task);
  }

  /** @deprecated Use {@link OnTaskClick}. */
  public onTaskClick(task: MJTaskEntity): void {
    return this.OnTaskClick(task);
  }

  public GetAgentRunId(task: MJTaskEntity): string | null {
    return this.AgentRunMap?.get(task.ID) || null;
  }

  /** @deprecated Use {@link GetAgentRunId}. */
  public getAgentRunId(task: MJTaskEntity): string | null {
    return this.GetAgentRunId(task);
  }

  public CloseDetailPanel(): void {
    this.SelectedTask = null;
  }

  /** @deprecated Use {@link CloseDetailPanel}. */
  public closeDetailPanel(): void {
    return this.CloseDetailPanel();
  }

  public OnOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    this.OpenEntityRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    return this.OnOpenEntityRecord(event);
  }

  public StartResize(event: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.DetailPanelWidth;
    event.preventDefault();
  }

  /** @deprecated Use {@link StartResize}. */
  public startResize(event: MouseEvent): void {
    return this.StartResize(event);
  }

  @HostListener('document:mousemove', ['$event'])
  handleResize(event: MouseEvent): void {
    if (!this.isResizing) return;

    const delta = this.resizeStartX - event.clientX;
    const newWidth = this.resizeStartWidth + delta;

    // Constrain width between min and max
    this.DetailPanelWidth = Math.max(300, Math.min(600, newWidth));
  }

  @HostListener('document:mouseup')
  stopResize(): void {
    this.isResizing = false;
  }

  public GetStatusIcon(status: string): string {
    switch (status) {
      case 'Complete': return 'fa-check-circle';
      case 'In Progress': return 'fa-spinner';
      case 'Pending': return 'fa-clock';
      case 'Blocked': return 'fa-ban';
      case 'Failed': return 'fa-times-circle';
      default: return 'fa-circle';
    }
  }

  /** @deprecated Use {@link GetStatusIcon}. */
  public getStatusIcon(status: string): string {
    return this.GetStatusIcon(status);
  }

  public formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
