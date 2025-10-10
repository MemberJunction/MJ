import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';

interface TaskWithTiming extends TaskEntity {
  startTime?: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  offsetPercent?: number;
  widthPercent?: number;
  level?: number; // hierarchy level for indentation
}

@Component({
  selector: 'mj-task-timeline',
  template: `
    <div class="task-timeline">
      <div class="timeline-header">
        <div class="timeline-controls">
          <button class="view-toggle" [class.active]="viewMode === 'tree'" (click)="viewMode = 'tree'">
            <i class="fa-solid fa-list-tree"></i> Tree
          </button>
          <button class="view-toggle" [class.active]="viewMode === 'timeline'" (click)="viewMode = 'timeline'">
            <i class="fa-solid fa-chart-gantt"></i> Timeline
          </button>
        </div>
        @if (parentTask) {
          <div class="parent-info">
            <i class="fa-solid fa-folder-tree"></i>
            <span class="parent-name">{{ parentTask.Name }}</span>
            <span class="progress-badge">{{ parentTask.PercentComplete }}%</span>
          </div>
        }
      </div>

      <div class="timeline-content" [class.tree-view]="viewMode === 'tree'">
        @if (viewMode === 'tree') {
          <!-- Tree View -->
          <div class="task-tree">
            @for (task of tasks; track task.ID) {
              <div class="task-tree-item" [class.has-children]="hasChildren(task.ID)" [style.padding-left.px]="(task.level || 0) * 24">
                <div class="task-tree-row">
                  <div class="task-status-icon" [class.complete]="task.Status === 'Complete'" [class.in-progress]="task.Status === 'In Progress'" [class.pending]="task.Status === 'Pending'" [class.failed]="task.Status === 'Failed'">
                    <i class="fa-solid"
                       [class.fa-check]="task.Status === 'Complete'"
                       [class.fa-spinner]="task.Status === 'In Progress'"
                       [class.fa-clock]="task.Status === 'Pending'"
                       [class.fa-exclamation]="task.Status === 'Failed'"></i>
                  </div>
                  <div class="task-tree-info">
                    <div class="task-name">{{ task.Name }}</div>
                    <div class="task-meta">
                      <span class="task-status">{{ task.Status }}</span>
                      @if (task.StartedAt) {
                        <span class="task-time">{{ formatDuration(task) }}</span>
                      }
                    </div>
                  </div>
                  @if (task.ParentID) {
                    <button class="btn-nav" (click)="navigateToParent(task.ParentID)" title="Go to parent">
                      <i class="fa-solid fa-arrow-up"></i>
                    </button>
                  }
                  @if (hasChildren(task.ID)) {
                    <button class="btn-nav" (click)="navigateToChildren(task.ID)" title="View sub-tasks">
                      <i class="fa-solid fa-arrow-down"></i>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <!-- Timeline/Gantt View -->
          <div class="task-gantt">
            <div class="gantt-header">
              <div class="gantt-axis">
                @for (tick of timelineTicks; track $index) {
                  <div class="time-tick" [style.left.%]="tick.position">
                    <span class="time-label">{{ tick.label }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="gantt-chart">
              @for (task of tasks; track task.ID) {
                <div class="gantt-row" [style.padding-left.px]="(task.level || 0) * 24">
                  <div class="gantt-task-label">
                    <div class="task-status-icon" [class.complete]="task.Status === 'Complete'" [class.in-progress]="task.Status === 'In Progress'" [class.pending]="task.Status === 'Pending'" [class.failed]="task.Status === 'Failed'">
                      <i class="fa-solid fa-circle" style="font-size: 8px;"></i>
                    </div>
                    <span class="task-name">{{ task.Name }}</span>
                  </div>
                  <div class="gantt-bar-container">
                    @if (task.startTime && task.duration) {
                      <div class="gantt-bar"
                           [class.complete]="task.Status === 'Complete'"
                           [class.in-progress]="task.Status === 'In Progress'"
                           [class.pending]="task.Status === 'Pending'"
                           [class.failed]="task.Status === 'Failed'"
                           [style.left.%]="task.offsetPercent"
                           [style.width.%]="task.widthPercent"
                           [title]="getTaskTooltip(task)">
                        <span class="gantt-bar-label">{{ formatDuration(task) }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .task-timeline {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
    }

    .timeline-header {
      padding: 16px;
      border-bottom: 1px solid #D9D9D9;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .timeline-controls {
      display: flex;
      gap: 4px;
    }

    .view-toggle {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 150ms ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .view-toggle:hover {
      background: #F4F4F4;
    }

    .view-toggle.active {
      background: #0076B6;
      color: white;
      border-color: #0076B6;
    }

    .parent-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #F4F4F4;
      border-radius: 4px;
      flex: 1;
    }

    .parent-name {
      font-weight: 500;
      flex: 1;
    }

    .progress-badge {
      padding: 4px 8px;
      background: #0076B6;
      color: white;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .timeline-content {
      flex: 1;
      overflow-y: auto;
    }

    /* Tree View Styles */
    .task-tree {
      padding: 8px 0;
    }

    .task-tree-item {
      padding: 8px 16px;
      border-bottom: 1px solid #F4F4F4;
      transition: background 150ms ease;
    }

    .task-tree-item:hover {
      background: #F9F9F9;
    }

    .task-tree-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .task-status-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }

    .task-status-icon.complete {
      background: #4CAF50;
      color: white;
    }

    .task-status-icon.in-progress {
      background: #2196F3;
      color: white;
    }

    .task-status-icon.pending {
      background: #FFC107;
      color: white;
    }

    .task-status-icon.failed {
      background: #F44336;
      color: white;
    }

    .task-tree-info {
      flex: 1;
      min-width: 0;
    }

    .task-name {
      font-weight: 500;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-meta {
      display: flex;
      gap: 12px;
      margin-top: 4px;
      font-size: 12px;
      color: #666;
    }

    .task-status {
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 600;
    }

    .btn-nav {
      padding: 6px 10px;
      background: transparent;
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      cursor: pointer;
      color: #666;
      transition: all 150ms ease;
    }

    .btn-nav:hover {
      background: #F4F4F4;
      border-color: #0076B6;
      color: #0076B6;
    }

    /* Gantt View Styles */
    .task-gantt {
      display: flex;
      flex-direction: column;
    }

    .gantt-header {
      position: sticky;
      top: 0;
      background: white;
      border-bottom: 2px solid #D9D9D9;
      z-index: 10;
    }

    .gantt-axis {
      position: relative;
      height: 40px;
      border-bottom: 1px solid #E0E0E0;
    }

    .time-tick {
      position: absolute;
      top: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .time-tick::before {
      content: '';
      width: 1px;
      height: 8px;
      background: #999;
    }

    .time-label {
      margin-top: 4px;
      font-size: 11px;
      color: #666;
    }

    .gantt-chart {
      flex: 1;
    }

    .gantt-row {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 16px;
      padding: 12px 16px;
      border-bottom: 1px solid #F4F4F4;
      align-items: center;
    }

    .gantt-task-label {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .gantt-task-label .task-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
    }

    .gantt-bar-container {
      position: relative;
      height: 32px;
      background: #F9F9F9;
      border-radius: 4px;
    }

    .gantt-bar {
      position: absolute;
      height: 100%;
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 0 8px;
      transition: all 200ms ease;
    }

    .gantt-bar.complete {
      background: linear-gradient(90deg, #4CAF50 0%, #66BB6A 100%);
    }

    .gantt-bar.in-progress {
      background: linear-gradient(90deg, #2196F3 0%, #42A5F5 100%);
      animation: pulse 2s ease-in-out infinite;
    }

    .gantt-bar.pending {
      background: linear-gradient(90deg, #FFC107 0%, #FFD54F 100%);
      opacity: 0.6;
    }

    .gantt-bar.failed {
      background: linear-gradient(90deg, #F44336 0%, #EF5350 100%);
    }

    .gantt-bar-label {
      font-size: 11px;
      font-weight: 600;
      color: white;
      white-space: nowrap;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }
  `]
})
export class TaskTimelineComponent implements OnInit, OnChanges {
  @Input() parentTaskId?: string;
  @Input() currentUser!: UserInfo;

  public tasks: TaskWithTiming[] = [];
  public parentTask?: TaskEntity;
  public viewMode: 'tree' | 'timeline' = 'timeline';
  public timelineTicks: Array<{ position: number; label: string }> = [];

  private earliestStart?: Date;
  private latestEnd?: Date;
  private totalDuration: number = 0;

  async ngOnInit(): Promise<void> {
    await this.loadTasks();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['parentTaskId']) {
      await this.loadTasks();
    }
  }

  private async loadTasks(): Promise<void> {
    if (!this.parentTaskId) return;

    const rv = new RunView();

    // Load parent task
    const parentResult = await rv.RunView<TaskEntity>({
      EntityName: 'MJ: Tasks',
      ExtraFilter: `ID='${this.parentTaskId}'`,
      ResultType: 'entity_object'
    }, this.currentUser);

    if (parentResult.Success && parentResult.Results && parentResult.Results.length > 0) {
      this.parentTask = parentResult.Results[0];
    }

    // Load child tasks
    const result = await rv.RunView<TaskEntity>({
      EntityName: 'MJ: Tasks',
      ExtraFilter: `ParentID='${this.parentTaskId}'`,
      OrderBy: 'StartedAt ASC',
      ResultType: 'entity_object'
    }, this.currentUser);

    if (result.Success && result.Results) {
      this.tasks = result.Results.map(task => this.enhanceTaskWithTiming(task));
      this.calculateTimeline();
    }
  }

  private enhanceTaskWithTiming(task: TaskEntity): TaskWithTiming {
    const enhanced: TaskWithTiming = task as TaskWithTiming;

    if (task.StartedAt) {
      enhanced.startTime = new Date(task.StartedAt);

      if (task.CompletedAt) {
        enhanced.endTime = new Date(task.CompletedAt);
        enhanced.duration = enhanced.endTime.getTime() - enhanced.startTime.getTime();
      } else if (task.Status === 'In Progress') {
        enhanced.endTime = new Date(); // Current time for in-progress tasks
        enhanced.duration = enhanced.endTime.getTime() - enhanced.startTime.getTime();
      }
    }

    enhanced.level = task.ParentID ? 1 : 0;

    return enhanced;
  }

  private calculateTimeline(): void {
    // Find earliest start and latest end
    for (const task of this.tasks) {
      if (task.startTime) {
        if (!this.earliestStart || task.startTime < this.earliestStart) {
          this.earliestStart = task.startTime;
        }
      }
      if (task.endTime) {
        if (!this.latestEnd || task.endTime > this.latestEnd) {
          this.latestEnd = task.endTime;
        }
      }
    }

    if (this.earliestStart && this.latestEnd) {
      this.totalDuration = this.latestEnd.getTime() - this.earliestStart.getTime();

      // Calculate positions for each task
      for (const task of this.tasks) {
        if (task.startTime && task.duration && this.totalDuration > 0) {
          const offset = task.startTime.getTime() - this.earliestStart!.getTime();
          task.offsetPercent = (offset / this.totalDuration) * 100;
          task.widthPercent = (task.duration / this.totalDuration) * 100;
        }
      }

      // Generate timeline ticks
      this.generateTimelineTicks();
    }
  }

  private generateTimelineTicks(): void {
    if (!this.earliestStart || !this.latestEnd) return;

    this.timelineTicks = [];
    const tickCount = 5;

    for (let i = 0; i <= tickCount; i++) {
      const position = (i / tickCount) * 100;
      const time = new Date(
        this.earliestStart.getTime() + (this.totalDuration * i / tickCount)
      );

      this.timelineTicks.push({
        position,
        label: this.formatTime(time)
      });
    }
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  formatDuration(task: TaskWithTiming): string {
    if (!task.duration) return '';

    const seconds = Math.floor(task.duration / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getTaskTooltip(task: TaskWithTiming): string {
    const parts = [
      `Task: ${task.Name}`,
      `Status: ${task.Status}`,
    ];

    if (task.startTime) {
      parts.push(`Started: ${this.formatTime(task.startTime)}`);
    }

    if (task.endTime) {
      parts.push(`Ended: ${this.formatTime(task.endTime)}`);
    }

    if (task.duration) {
      parts.push(`Duration: ${this.formatDuration(task)}`);
    }

    return parts.join('\n');
  }

  hasChildren(taskId: string): boolean {
    // Would need to check if this task has sub-tasks
    // For now, return false
    return false;
  }

  navigateToParent(parentId: string): void {
    // Emit event or navigate to parent task view
    console.log('Navigate to parent:', parentId);
  }

  navigateToChildren(taskId: string): void {
    // Emit event or navigate to children view
    console.log('Navigate to children:', taskId);
  }
}
