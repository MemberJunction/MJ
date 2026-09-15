import { Component, Input, Output, EventEmitter, OnChanges, AfterViewInit, ElementRef, ViewChild, OnDestroy, HostListener } from '@angular/core';

import { MJTaskEntity, MJTaskDependencyEntity } from '@memberjunction/core-entities';
import type { GanttStatic, Task as GanttTask, Link as GanttLink } from 'dhtmlx-gantt';
import { TaskDetailPanelComponent } from './task-detail-panel.component';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Gantt chart view for tasks using DHTMLX Gantt
 */
@Component({
  selector: 'mj-gantt-task-viewer',
  standalone: true,
  imports: [TaskDetailPanelComponent, SharedGenericModule],
  template: `
    <div class="gantt-task-viewer">
      @if (IsGanttLoading) {
        <div class="loading-container">
          <mj-loading text="Loading Gantt chart..."></mj-loading>
        </div>
      }

      @if (!IsGanttLoading) {
        @if (!tasks || tasks.length === 0) {
          <div class="no-tasks">
            <i class="fas fa-chart-gantt"></i>
            <p>No tasks to display in Gantt view</p>
          </div>
        }

        @if (tasks && tasks.length > 0) {
          <div class="gantt-layout">
            <div #ganttContainer class="gantt-container"></div>
            @if (selectedTask) {
              <div class="gantt-resizer"
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
        }
      }
    </div>
    `,
  styles: [`
    .gantt-task-viewer {
      height: 100%;
      background: var(--mj-bg-surface);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .gantt-layout {
      display: flex;
      height: 600px;
      position: relative;
    }

    .gantt-container {
      flex: 1;
      min-width: 400px;
      height: 100%;
      position: relative;
    }

    .gantt-resizer {
      width: 4px;
      background: var(--mj-border-default);
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.2s;
    }

    .gantt-resizer:hover {
      background: var(--mj-brand-primary);
    }

    .task-detail-panel {
      min-width: 300px;
      max-width: 600px;
      height: 100%;
      border-left: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }

    /* Override DHTMLX Gantt default styles */
    :host ::ng-deep .gantt_container {
      font-family: inherit;
      font-size: 13px;
    }

    :host ::ng-deep .gantt_grid_scale,
    :host ::ng-deep .gantt_task_scale {
      background: var(--mj-bg-surface-sunken);
      border-bottom: 2px solid var(--mj-border-default);
    }

    :host ::ng-deep .gantt_task .gantt_task_content {
      font-weight: 500;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 80px 20px;
    }

    .no-tasks {
      text-align: center;
      padding: 80px 20px;
      color: var(--mj-text-disabled);
    }

    .no-tasks i {
      font-size: 64px;
      opacity: 0.3;
      margin-bottom: 16px;
    }

    .no-tasks p {
      margin: 0;
      font-size: 14px;
    }
  `]
})
export class GanttTaskViewerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() Tasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link Tasks}. */
  @Input() set tasks(value: MJTaskEntity[]) {
    this.Tasks = value;
  }
  /** @deprecated Use {@link Tasks}. */
  get tasks(): MJTaskEntity[] {
    return this.Tasks;
  }
  @Input() TaskDependencies: MJTaskDependencyEntity[] = [];

  /** @deprecated Use {@link TaskDependencies}. */
  @Input() set taskDependencies(value: MJTaskDependencyEntity[]) {
    this.TaskDependencies = value;
  }
  /** @deprecated Use {@link TaskDependencies}. */
  get taskDependencies(): MJTaskDependencyEntity[] {
    return this.TaskDependencies;
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

  @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<HTMLDivElement>;

  public SelectedTask: MJTaskEntity | null = null;

  /** @deprecated Use {@link SelectedTask}. */
  public get selectedTask(): MJTaskEntity | null {
    return this.SelectedTask;
  }
  /** @deprecated Use {@link SelectedTask}. */
  public set selectedTask(value: MJTaskEntity | null) {
    this.SelectedTask = value;
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
  public IsGanttLoading = true;

  private ganttLib: GanttStatic | null = null;
  private ganttInitialized = false;
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  async ngAfterViewInit() {
    console.log('🔧 ngAfterViewInit called', {
      taskCount: this.Tasks?.length || 0,
      hasContainer: !!this.ganttContainer
    });

    try {
      const module = await import('dhtmlx-gantt');
      this.ganttLib = module.gantt;
      this.IsGanttLoading = false;

      if (this.Tasks && this.Tasks.length > 0 && this.ganttContainer) {
        this.initGantt();
      }
    } catch (error) {
      console.error('Failed to load dhtmlx-gantt:', error);
      this.IsGanttLoading = false;
    }
  }

  ngOnChanges() {
    console.log('🔄 ngOnChanges called', {
      initialized: this.ganttInitialized,
      hasContainer: !!this.ganttContainer,
      taskCount: this.Tasks?.length || 0
    });

    if (!this.ganttLib) return; // Library not yet loaded

    if (this.ganttInitialized && this.ganttContainer) {
      this.updateGanttData();
    } else if (!this.ganttInitialized && this.ganttContainer && this.Tasks && this.Tasks.length > 0) {
      // Initialize if we have container and tasks but haven't initialized yet
      console.log('🎨 Late initialization - gantt not initialized but container and tasks available');
      this.initGantt();
    }
  }

  ngOnDestroy() {
    if (this.ganttInitialized && this.ganttLib) {
      this.ganttLib.clearAll();
      this.ganttInitialized = false;
    }
  }

  private initGantt(): void {
    try {
      console.log('🎨 Initializing DHTMLX Gantt');
      const g = this.ganttLib!;

      // IMPORTANT: Clear any previous configuration
      g.clearAll();

      // Configure Gantt layout and appearance
      g.config.date_format = '%Y-%m-%d %H:%i';
      g.config.scale_unit = 'day';
      g.config.date_scale = '%d %M';
      g.config.subscales = [];
      g.config.show_progress = true;
      g.config.show_links = true;
      g.config.auto_types = true;
      g.config.readonly = true; // Read-only for now
      g.config.fit_tasks = true; // Auto-fit timeline to tasks

      // Disable auto-scheduling - we calculate dates ourselves based on dependencies
      g.config.auto_scheduling = false;

      // Grid configuration
      g.config.grid_width = 350;
      g.config.row_height = 36;
      g.config.scale_height = 0; // Hide date scale - dates are just for positioning

      // Layout configuration - ensure timeline is visible
      g.config.layout = {
        css: "gantt_container",
        rows: [
          {
            cols: [
              { view: "grid", group: "grids", scrollY: "scrollVer" },
              { resizer: true, width: 1 },
              { view: "timeline", scrollX: "scrollHor", scrollY: "scrollVer" },
              { view: "scrollbar", id: "scrollVer", group: "vertical" }
            ]
          },
          { view: "scrollbar", id: "scrollHor", group: "horizontal" }
        ]
      };

      // Column configuration - only show task names, hide dates
      g.config.columns = [
        { name: 'text', label: 'Task name', tree: true, width: '*' }
      ];

      // Initialize Gantt in the container
      g.init(this.ganttContainer.nativeElement);
      this.ganttInitialized = true;

      // Attach click event
      g.attachEvent('onTaskClick', (id: string) => {
        const originalTask = this.Tasks.find(t => UUIDsEqual(t.ID, id));
        if (originalTask) {
          this.SelectedTask = originalTask;
          this.TaskClicked.emit(originalTask);
        }
        return true;
      });

      // Load data
      this.updateGanttData();

      // Force resize after data load to ensure proper rendering
      setTimeout(() => {
        g.setSizes();
      }, 0);

      // Expand and select after render completes
      setTimeout(() => {
        this.expandAllAndSelectRoot();
      }, 100);

      console.log('✅ DHTMLX Gantt initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Gantt:', error);
    }
  }

  private updateGanttData(): void {
    if (!this.ganttInitialized) return;

    try {
      console.log('📊 Updating Gantt data with', this.Tasks.length, 'tasks');
      const g = this.ganttLib!;

      const ganttData = this.convertToGanttFormat(this.Tasks);
      g.clearAll();
      g.parse(ganttData);

      // Log final parsed data for debugging
      console.log('📋 Gantt data after parse:', {
        tasks: g.getTaskByTime(),
        links: g.getLinks()
      });

      // Force resize after data update
      setTimeout(() => {
        g.setSizes();
      }, 0);

      // Expand and select after render completes
      setTimeout(() => {
        this.expandAllAndSelectRoot();
      }, 100);

      console.log('✅ Gantt data updated');
    } catch (error) {
      console.error('❌ Error updating Gantt data:', error);
    }
  }

  private convertToGanttFormat(tasks: MJTaskEntity[]): { data: GanttTask[], links: GanttLink[] } {
    const data: GanttTask[] = [];
    const links: GanttLink[] = [];

    console.log('🔍 Converting tasks:', tasks);
    console.log('🔗 Task dependencies:', this.TaskDependencies);

    // Build a map of task ID to task for quick lookup
    const taskMap = new Map<string, MJTaskEntity>();
    tasks.forEach(t => taskMap.set(t.ID, t));

    // Build dependency map: taskId -> array of tasks it depends on
    const dependencyMap = new Map<string, string[]>();
    this.TaskDependencies.forEach(dep => {
      if (!dependencyMap.has(dep.TaskID)) {
        dependencyMap.set(dep.TaskID, []);
      }
      dependencyMap.get(dep.TaskID)!.push(dep.DependsOnTaskID);
    });

    // Calculate start dates based on dependencies
    const taskStartDates = new Map<string, Date>();
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    // Recursive function to calculate start date for a task
    const calculateStartDate = (taskId: string, visited = new Set<string>()): Date => {
      // Prevent circular dependencies
      if (visited.has(taskId)) {
        return new Date(baseDate);
      }
      visited.add(taskId);

      // If already calculated, return it
      if (taskStartDates.has(taskId)) {
        return taskStartDates.get(taskId)!;
      }

      const task = taskMap.get(taskId);
      if (!task) return new Date(baseDate);

      const dependencies = dependencyMap.get(taskId) || [];

      if (dependencies.length === 0) {
        // No dependencies - use base date or task's actual start date
        const startDate = task.StartedAt ? new Date(task.StartedAt) : new Date(baseDate);
        taskStartDates.set(taskId, startDate);
        return startDate;
      }

      // Has dependencies - start after the latest dependency ends
      let latestEnd = new Date(baseDate);
      for (const depId of dependencies) {
        const depTask = taskMap.get(depId);
        if (depTask) {
          const depStart = calculateStartDate(depId, new Set(visited));
          const depDuration = this.calculateDuration(depTask);
          const depEnd = new Date(depStart);
          depEnd.setDate(depEnd.getDate() + depDuration);

          if (depEnd > latestEnd) {
            latestEnd = depEnd;
          }
        }
      }

      taskStartDates.set(taskId, latestEnd);
      return latestEnd;
    };

    // Calculate start dates for all tasks
    tasks.forEach(task => calculateStartDate(task.ID));

    // Calculate min/max dates for timeline display range
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    tasks.forEach(task => {
      const startDate = taskStartDates.get(task.ID);
      if (startDate) {
        const duration = this.calculateDuration(task);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration);

        if (!minDate || startDate < minDate) {
          minDate = startDate;
        }
        if (!maxDate || endDate > maxDate) {
          maxDate = endDate;
        }
      }
    });

    // Add 1 day padding before and after
    const g = this.ganttLib!;
    if (minDate) {
      const paddedStart = new Date(minDate);
      paddedStart.setDate(paddedStart.getDate() - 1);
      g.config.start_date = paddedStart;
    }
    if (maxDate) {
      const paddedEnd = new Date(maxDate);
      paddedEnd.setDate(paddedEnd.getDate() + 1);
      g.config.end_date = paddedEnd;
    }

    // Now create Gantt tasks with calculated dates
    tasks.forEach((task) => {
      console.log('📝 Processing task:', {
        ID: task.ID,
        Name: task.Name,
        ParentID: task.ParentID
      });

      // Calculate progress (0-1 scale for DHTMLX)
      let progress = (task.PercentComplete || 0) / 100;
      if (task.Status === 'Complete') {
        progress = 1;
      }

      const duration = this.calculateDuration(task);
      const startDate = taskStartDates.get(task.ID) || new Date(baseDate);

      const ganttTask: Partial<GanttTask> & Pick<GanttTask, 'id'> = {
        id: task.ID,
        text: task.Name || 'Untitled Task',
        start_date: this.formatDateForDHTMLX(startDate) as unknown as Date,
        duration: duration,
        progress: progress
      };

      // Add parent relationship for tree structure (not dependency)
      if (task.ParentID) {
        ganttTask.parent = task.ParentID;
      } else {
        // Root tasks need parent: 0
        ganttTask.parent = 0;
      }

      console.log('✅ Created Gantt task:', ganttTask);
      data.push(ganttTask as GanttTask);
    });

    // Create links from MJTaskDependencyEntity records
    this.TaskDependencies.forEach((dep, index) => {
      links.push({
        id: dep.ID || `link_${index}`,
        source: dep.DependsOnTaskID, // The task being depended on
        target: dep.TaskID,           // The task that depends on it
        type: '0' // finish-to-start (DHTMLX type 0)
      });
      console.log(`🔗 Created link: ${dep.DependsOnTaskID} -> ${dep.TaskID}`);
    });

    console.log('📊 Final DHTMLX format:', { data, links });
    return { data, links };
  }

  private calculateDuration(task: MJTaskEntity): number {
    if (task.StartedAt && task.DueAt) {
      const startDate = new Date(task.StartedAt);
      const endDate = new Date(task.DueAt);
      return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return 1; // Default to 1 day
  }

  private formatDateForDHTMLX(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 00:00`;
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
    if (this.isResizing) {
      this.isResizing = false;
      // Resize gantt chart after panel resize completes
      setTimeout(() => {
        if (this.ganttInitialized && this.ganttLib) {
          this.ganttLib.setSizes();
        }
      }, 0);
    }
  }

  private expandAllAndSelectRoot(): void {
    try {
      const g = this.ganttLib!;

      // Expand all tasks
      g.eachTask((task: GanttTask) => {
        g.open(task.id);
      });

      // Find and select the root task (task with parent = 0)
      let rootTaskId: string | number | null = null;
      g.eachTask((task: GanttTask) => {
        if (task.parent === 0 || task.parent === '0') {
          rootTaskId = task.id;
          return false; // Stop iteration
        }
      });

      if (rootTaskId != null) {
        g.selectTask(rootTaskId);
        // Trigger task click event to open detail panel
        const originalTask = this.Tasks.find(t => UUIDsEqual(t.ID, String(rootTaskId)));
        if (originalTask) {
          this.SelectedTask = originalTask;
          this.TaskClicked.emit(originalTask);
        }
      }

      console.log('✅ Expanded all tasks and selected root:', rootTaskId);
    } catch (error) {
      console.error('❌ Error expanding/selecting tasks:', error);
    }
  }
}
