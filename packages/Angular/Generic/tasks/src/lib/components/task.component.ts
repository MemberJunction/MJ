import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskEntity } from '@memberjunction/core-entities';
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
  imports: [CommonModule, SimpleTaskViewerComponent, GanttTaskViewerComponent],
  template: `
    <div class="task-component">
      <!-- Header with View Toggle -->
      <div class="task-header" *ngIf="showHeader">
        <div class="header-left">
          <h2 class="task-title" *ngIf="title">{{ title }}</h2>
          <p class="task-description" *ngIf="description">{{ description }}</p>
        </div>

        <div class="view-toggle" *ngIf="showViewToggle">
          <button
            class="toggle-btn"
            [class.active]="viewMode === 'simple'"
            (click)="setViewMode('simple')"
            title="List View">
            <i class="fas fa-list"></i>
            <span>List</span>
          </button>
          <button
            class="toggle-btn"
            [class.active]="viewMode === 'gantt'"
            (click)="setViewMode('gantt')"
            title="Gantt Chart">
            <i class="fas fa-chart-gantt"></i>
            <span>Gantt</span>
          </button>
        </div>
      </div>

      <!-- Task Viewer (Simple or Gantt) -->
      <div class="task-viewer">
        <mj-simple-task-viewer
          *ngIf="viewMode === 'simple'"
          [tasks]="tasks"
          (taskClicked)="onTaskClicked($event)">
        </mj-simple-task-viewer>

        <mj-gantt-task-viewer
          *ngIf="viewMode === 'gantt'"
          [tasks]="ganttTasks || tasks"
          (taskClicked)="onTaskClicked($event)">
        </mj-gantt-task-viewer>
      </div>
    </div>
  `,
  styles: [`
    .task-component {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #FAFAFA;
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 20px 24px;
      background: white;
      border-bottom: 1px solid #E5E7EB;
    }

    .header-left {
      flex: 1;
      min-width: 0;
    }

    .task-title {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }

    .task-description {
      margin: 0;
      font-size: 14px;
      color: #6B7280;
      line-height: 1.5;
    }

    .view-toggle {
      display: flex;
      gap: 8px;
      background: #F3F4F6;
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
      color: #6B7280;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .toggle-btn:hover {
      color: #111827;
      background: rgba(255, 255, 255, 0.5);
    }

    .toggle-btn.active {
      background: white;
      color: #3B82F6;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
  @Input() tasks: TaskEntity[] = [];
  @Input() ganttTasks?: TaskEntity[]; // Optional separate task list for Gantt (includes parent)
  @Input() title?: string;
  @Input() description?: string;
  @Input() showHeader: boolean = true;
  @Input() showViewToggle: boolean = true; // Show Gantt/List toggle
  @Input() viewMode: TaskViewMode = 'simple';

  @Output() viewModeChanged = new EventEmitter<TaskViewMode>();
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  public setViewMode(mode: TaskViewMode): void {
    this.viewMode = mode;
    this.viewModeChanged.emit(mode);
  }

  public onTaskClicked(task: TaskEntity): void {
    this.taskClicked.emit(task);
  }
}
