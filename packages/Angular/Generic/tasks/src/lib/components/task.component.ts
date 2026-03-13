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
  @Input() tasks: MJTaskEntity[] = [];
  @Input() ganttTasks?: MJTaskEntity[]; // Optional separate task list for Gantt (includes parent)
  @Input() taskDependencies?: MJTaskDependencyEntity[]; // Task dependencies for Gantt links
  @Input() agentRunMap?: Map<string, string>; // Maps TaskID -> AgentRunID
  @Input() title?: string;
  @Input() description?: string;
  @Input() showHeader: boolean = true;
  @Input() showViewToggle: boolean = true; // Show Gantt/List toggle
  @Input() viewMode: TaskViewMode = 'simple';

  @Output() viewModeChanged = new EventEmitter<TaskViewMode>();
  @Output() taskClicked = new EventEmitter<MJTaskEntity>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();

  public setViewMode(mode: TaskViewMode): void {
    this.viewMode = mode;
    this.viewModeChanged.emit(mode);
  }

  public onTaskClicked(task: MJTaskEntity): void {
    this.taskClicked.emit(task);
  }

  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    this.openEntityRecord.emit(event);
  }
}
