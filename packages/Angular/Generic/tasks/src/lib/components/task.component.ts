import { Component, Input, Output, EventEmitter } from '@angular/core';

import { MJTaskEntity, MJTaskDependencyEntity } from '@memberjunction/core-entities';
import { TaskViewMode } from '../models/task-view.models';
import { SimpleTaskViewerComponent } from './simple-task-viewer.component';
import { GanttTaskViewerComponent } from './gantt-task-viewer.component';

/**
 * Main task component that composes SimpleTaskViewer and GanttTaskViewer
 * Allows switching between list and Gantt chart views
 */
@Component({
  selector: 'mj-task',
  standalone: true,
  imports: [SimpleTaskViewerComponent, GanttTaskViewerComponent],
  template: `
    <div class="task-component">
      <!-- Header with View Toggle -->
      @if (showHeader) {
        <div class="task-header">
          <div class="header-left">
            @if (title) {
              <h2 class="task-title">{{ title }}</h2>
            }
            @if (description) {
              <p class="task-description">{{ description }}</p>
            }
          </div>
          @if (showViewToggle) {
            <div class="view-toggle">
              <button
                class="toggle-btn"
                [class.active]="viewMode === 'gantt'"
                (click)="setViewMode('gantt')"
                title="Gantt Chart">
                <i class="fas fa-chart-gantt"></i>
                <span>Gantt</span>
              </button>
              <button
                class="toggle-btn"
                [class.active]="viewMode === 'simple'"
                (click)="setViewMode('simple')"
                title="List View">
                <i class="fas fa-list"></i>
                <span>List</span>
              </button>
            </div>
          }
        </div>
      }
    
      <!-- Task Viewer (Simple or Gantt) -->
      <div class="task-viewer">
        @if (viewMode === 'simple') {
          <mj-simple-task-viewer
            [tasks]="tasks"
            [agentRunMap]="agentRunMap"
            (taskClicked)="onTaskClicked($event)"
            (openEntityRecord)="onOpenEntityRecord($event)">
          </mj-simple-task-viewer>
        }
    
        @if (viewMode === 'gantt') {
          <mj-gantt-task-viewer
            [tasks]="ganttTasks || tasks"
            [taskDependencies]="taskDependencies || []"
            [agentRunMap]="agentRunMap"
            (taskClicked)="onTaskClicked($event)"
            (openEntityRecord)="onOpenEntityRecord($event)">
          </mj-gantt-task-viewer>
        }
      </div>
    </div>
    `,
  styles: [`
    .task-component {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface-sunken);
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 20px 24px;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .header-left {
      flex: 1;
      min-width: 0;
    }

    .task-title {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .task-description {
      margin: 0;
      font-size: 14px;
      color: var(--mj-text-muted);
      line-height: 1.5;
    }

    .view-toggle {
      display: flex;
      gap: 8px;
      background: var(--mj-bg-surface-sunken);
      padding: 4px;
      border-radius: 8px;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: var(--mj-text-muted);
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .toggle-btn:hover {
      color: var(--mj-text-primary);
      background: color-mix(in srgb, var(--mj-bg-surface) 50%, transparent);
    }

    .toggle-btn.active {
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      box-shadow: var(--mj-shadow-sm);
    }

    .toggle-btn i {
      font-size: 14px;
    }

    .task-viewer {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
  `]
})
export class TaskComponent {
  @Input() Tasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link Tasks}. */
  @Input() set tasks(value: MJTaskEntity[]) {
    this.Tasks = value;
  }
  /** @deprecated Use {@link Tasks}. */
  get tasks(): MJTaskEntity[] {
    return this.Tasks;
  }
  @Input() GanttTasks?: MJTaskEntity[];

  /** @deprecated Use {@link GanttTasks}. */
  @Input() set ganttTasks(value: MJTaskEntity[] | undefined) {
    this.GanttTasks = value;
  }
  /** @deprecated Use {@link GanttTasks}. */
  get ganttTasks(): MJTaskEntity[] | undefined {
    return this.GanttTasks;
  } // Optional separate task list for Gantt (includes parent)
  @Input() TaskDependencies?: MJTaskDependencyEntity[];

  /** @deprecated Use {@link TaskDependencies}. */
  @Input() set taskDependencies(value: MJTaskDependencyEntity[] | undefined) {
    this.TaskDependencies = value;
  }
  /** @deprecated Use {@link TaskDependencies}. */
  get taskDependencies(): MJTaskDependencyEntity[] | undefined {
    return this.TaskDependencies;
  } // Task dependencies for Gantt links
  @Input() AgentRunMap?: Map<string, string>;

  /** @deprecated Use {@link AgentRunMap}. */
  @Input() set agentRunMap(value: Map<string, string> | undefined) {
    this.AgentRunMap = value;
  }
  /** @deprecated Use {@link AgentRunMap}. */
  get agentRunMap(): Map<string, string> | undefined {
    return this.AgentRunMap;
  } // Maps TaskID -> AgentRunID
  @Input() Title?: string;

  /** @deprecated Use {@link Title}. */
  @Input() set title(value: string | undefined) {
    this.Title = value;
  }
  /** @deprecated Use {@link Title}. */
  get title(): string | undefined {
    return this.Title;
  }
  @Input() Description?: string;

  /** @deprecated Use {@link Description}. */
  @Input() set description(value: string | undefined) {
    this.Description = value;
  }
  /** @deprecated Use {@link Description}. */
  get description(): string | undefined {
    return this.Description;
  }
  @Input() ShowHeader: boolean = true;

  /** @deprecated Use {@link ShowHeader}. */
  @Input() set showHeader(value: boolean) {
    this.ShowHeader = value;
  }
  /** @deprecated Use {@link ShowHeader}. */
  get showHeader(): boolean {
    return this.ShowHeader;
  }
  @Input() ShowViewToggle: boolean = true;

  /** @deprecated Use {@link ShowViewToggle}. */
  @Input() set showViewToggle(value: boolean) {
    this.ShowViewToggle = value;
  }
  /** @deprecated Use {@link ShowViewToggle}. */
  get showViewToggle(): boolean {
    return this.ShowViewToggle;
  } // Show Gantt/List toggle
  @Input() ViewMode: TaskViewMode = 'simple';

  /** @deprecated Use {@link ViewMode}. */
  @Input() set viewMode(value: TaskViewMode) {
    this.ViewMode = value;
  }
  /** @deprecated Use {@link ViewMode}. */
  get viewMode(): TaskViewMode {
    return this.ViewMode;
  }

  @Output() ViewModeChanged = new EventEmitter<TaskViewMode>();

  /**
   * @deprecated Use {@link ViewModeChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (viewModeChanged) keeps working. Must stay AFTER ViewModeChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() viewModeChanged = this.ViewModeChanged;
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

  public SetViewMode(mode: TaskViewMode): void {
    this.ViewMode = mode;
    this.ViewModeChanged.emit(mode);
  }

  /** @deprecated Use {@link SetViewMode}. */
  public setViewMode(mode: TaskViewMode): void {
    return this.SetViewMode(mode);
  }

  public OnTaskClicked(task: MJTaskEntity): void {
    this.TaskClicked.emit(task);
  }

  /** @deprecated Use {@link OnTaskClicked}. */
  public onTaskClicked(task: MJTaskEntity): void {
    return this.OnTaskClicked(task);
  }

  public OnOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    this.OpenEntityRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    return this.OnOpenEntityRecord(event);
  }
}
