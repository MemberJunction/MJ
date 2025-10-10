import { Component, Input, Output, EventEmitter, OnChanges, AfterViewInit, ElementRef, ViewChild, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskEntity, TaskDependencyEntity } from '@memberjunction/core-entities';
import { gantt } from 'dhtmlx-gantt';

/**
 * Gantt chart view for tasks using DHTMLX Gantt
 */
@Component({
  selector: 'mj-gantt-task-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="gantt-task-viewer">
      <div *ngIf="!tasks || tasks.length === 0" class="no-tasks">
        <i class="fas fa-chart-gantt"></i>
        <p>No tasks to display in Gantt view</p>
      </div>

      <div *ngIf="tasks && tasks.length > 0" class="gantt-layout">
        <div #ganttContainer class="gantt-container"></div>

        <div *ngIf="selectedTask" class="gantt-resizer"
             (mousedown)="startResize($event)"></div>

        <div *ngIf="selectedTask" class="task-detail-panel" [style.width.px]="detailPanelWidth">
          <div class="detail-header">
            <h3>{{ selectedTask.Name }}</h3>
            <button class="close-detail-btn" (click)="closeDetailPanel()">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="detail-content">
            <div class="detail-field" *ngIf="selectedTask.Description">
              <label>Description</label>
              <p>{{ selectedTask.Description }}</p>
            </div>

            <div class="detail-field">
              <label>Status</label>
              <p>{{ selectedTask.Status }}</p>
            </div>

            <div class="detail-field" *ngIf="selectedTask.PercentComplete != null">
              <label>Progress</label>
              <div class="detail-progress">
                <div class="progress-bar-detail">
                  <div class="progress-fill-detail" [style.width.%]="selectedTask.PercentComplete"></div>
                </div>
                <span>{{ selectedTask.PercentComplete }}%</span>
              </div>
            </div>

            <div class="detail-field" *ngIf="selectedTask.StartedAt">
              <label>Started</label>
              <p>{{ formatDateTime(selectedTask.StartedAt) }}</p>
            </div>

            <div class="detail-field" *ngIf="selectedTask.DueAt">
              <label>Due</label>
              <p>{{ formatDateTime(selectedTask.DueAt) }}</p>
            </div>

            <div class="detail-field" *ngIf="selectedTask.CompletedAt">
              <label>Completed</label>
              <p>{{ formatDateTime(selectedTask.CompletedAt) }}</p>
            </div>

            <div class="detail-field" *ngIf="selectedTask.User">
              <label>Assigned User</label>
              <p>{{ selectedTask.User }}</p>
            </div>

            <div class="detail-field" *ngIf="selectedTask.Agent">
              <label>Assigned Agent</label>
              <p>{{ selectedTask.Agent }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gantt-task-viewer {
      height: 100%;
      background: white;
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
      background: #E5E7EB;
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.2s;
    }

    .gantt-resizer:hover {
      background: #3B82F6;
    }

    .task-detail-panel {
      min-width: 300px;
      max-width: 600px;
      height: 100%;
      border-left: 1px solid #E5E7EB;
      background: white;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .detail-header {
      padding: 20px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: #F9FAFB;
    }

    .detail-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      flex: 1;
      padding-right: 12px;
    }

    .close-detail-btn {
      background: none;
      border: none;
      color: #6B7280;
      cursor: pointer;
      padding: 4px;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .close-detail-btn:hover {
      background: #E5E7EB;
      color: #111827;
    }

    .detail-content {
      padding: 20px;
    }

    .detail-field {
      margin-bottom: 20px;
    }

    .detail-field:last-child {
      margin-bottom: 0;
    }

    .detail-field label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .detail-field p {
      margin: 0;
      font-size: 14px;
      color: #111827;
      line-height: 1.5;
    }

    .detail-progress {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar-detail {
      flex: 1;
      height: 8px;
      background: #E5E7EB;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill-detail {
      height: 100%;
      background: #3B82F6;
      transition: width 0.3s ease;
    }

    .detail-progress span {
      font-size: 13px;
      font-weight: 600;
      color: #6B7280;
      min-width: 40px;
    }

    /* Override DHTMLX Gantt default styles */
    :host ::ng-deep .gantt_container {
      font-family: inherit;
      font-size: 13px;
    }

    :host ::ng-deep .gantt_grid_scale,
    :host ::ng-deep .gantt_task_scale {
      background: #F9FAFB;
      border-bottom: 2px solid #E5E7EB;
    }

    :host ::ng-deep .gantt_task .gantt_task_content {
      font-weight: 500;
    }

    .no-tasks {
      text-align: center;
      padding: 80px 20px;
      color: #9CA3AF;
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
  @Input() tasks: TaskEntity[] = [];
  @Input() taskDependencies: TaskDependencyEntity[] = [];
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<HTMLDivElement>;

  public selectedTask: TaskEntity | null = null;
  public detailPanelWidth: number = 400;

  private ganttInitialized = false;
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  ngAfterViewInit() {
    console.log('🔧 ngAfterViewInit called', {
      taskCount: this.tasks?.length || 0,
      hasContainer: !!this.ganttContainer
    });

    if (this.tasks && this.tasks.length > 0 && this.ganttContainer) {
      this.initGantt();
    }
  }

  ngOnChanges() {
    console.log('🔄 ngOnChanges called', {
      initialized: this.ganttInitialized,
      hasContainer: !!this.ganttContainer,
      taskCount: this.tasks?.length || 0
    });

    if (this.ganttInitialized && this.ganttContainer) {
      this.updateGanttData();
    }
  }

  ngOnDestroy() {
    if (this.ganttInitialized) {
      gantt.clearAll();
      this.ganttInitialized = false;
    }
  }

  private initGantt(): void {
    try {
      console.log('🎨 Initializing DHTMLX Gantt');

      // IMPORTANT: Clear any previous configuration
      gantt.clearAll();

      // Configure Gantt layout and appearance
      gantt.config.date_format = '%Y-%m-%d %H:%i';
      gantt.config.scale_unit = 'day';
      gantt.config.date_scale = '%d %M';
      gantt.config.subscales = [];
      gantt.config.show_progress = true;
      gantt.config.show_links = true;
      gantt.config.auto_types = true;
      gantt.config.readonly = true; // Read-only for now
      gantt.config.fit_tasks = true; // Auto-fit timeline to tasks

      // Enable auto-scheduling so dependent tasks position based on prerequisites
      gantt.config.auto_scheduling = true;
      gantt.config.auto_scheduling_strict = true;
      gantt.config.auto_scheduling_compatibility = true;

      // Grid configuration
      gantt.config.grid_width = 350;
      gantt.config.row_height = 36;
      gantt.config.scale_height = 50;

      // Layout configuration - ensure timeline is visible
      gantt.config.layout = {
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

      // Column configuration - emphasize task names and start dates, de-emphasize duration
      gantt.config.columns = [
        { name: 'text', label: 'Task name', tree: true, width: '*' },
        { name: 'start_date', label: 'Start', align: 'center', width: 90 }
      ];

      // Initialize Gantt in the container
      gantt.init(this.ganttContainer.nativeElement);
      this.ganttInitialized = true;

      // Attach click event
      gantt.attachEvent('onTaskClick', (id: string) => {
        const originalTask = this.tasks.find(t => t.ID === id);
        if (originalTask) {
          this.selectedTask = originalTask;
          this.taskClicked.emit(originalTask);
        }
        return true;
      });

      // Debug: Log auto-scheduling events
      gantt.attachEvent('onAfterAutoSchedule', (taskId: string | number) => {
        const task = gantt.getTask(taskId);
        console.log('🔄 Auto-scheduled task:', { taskId, task });
      });

      gantt.attachEvent('onBeforeAutoSchedule', (taskId: string | number) => {
        const task = gantt.getTask(taskId);
        console.log('⏰ Before auto-schedule:', { taskId, task });
        return true;
      });

      // Load data
      this.updateGanttData();

      // Force resize after data load to ensure proper rendering
      setTimeout(() => {
        gantt.setSizes();
      }, 0);

      console.log('✅ DHTMLX Gantt initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Gantt:', error);
    }
  }

  private updateGanttData(): void {
    if (!this.ganttInitialized) return;

    try {
      console.log('📊 Updating Gantt data with', this.tasks.length, 'tasks');

      const ganttData = this.convertToGanttFormat(this.tasks);
      gantt.clearAll();
      gantt.parse(ganttData);

      // Log final parsed data for debugging
      console.log('📋 Gantt data after parse:', {
        tasks: gantt.getTaskByTime(),
        links: gantt.getLinks()
      });

      // Force resize after data update
      setTimeout(() => {
        gantt.setSizes();
      }, 0);

      console.log('✅ Gantt data updated');
    } catch (error) {
      console.error('❌ Error updating Gantt data:', error);
    }
  }

  private convertToGanttFormat(tasks: TaskEntity[]): { data: any[], links: any[] } {
    const data: any[] = [];
    const links: any[] = [];

    console.log('🔍 Converting tasks:', tasks);
    console.log('🔗 Task dependencies:', this.taskDependencies);

    tasks.forEach((task) => {
      console.log('📝 Processing task:', {
        ID: task.ID,
        Name: task.Name,
        StartedAt: task.StartedAt,
        DueAt: task.DueAt,
        ParentID: task.ParentID
      });

      // Calculate dates - use current date if no start date
      const startDate = task.StartedAt ? new Date(task.StartedAt) : new Date();
      let endDate = task.DueAt ? new Date(task.DueAt) : new Date(startDate);

      // Ensure end date is after start date (at least 1 day)
      if (endDate <= startDate) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      // Calculate progress (0-1 scale for DHTMLX)
      let progress = (task.PercentComplete || 0) / 100;
      if (task.Status === 'Complete') {
        progress = 1;
      }

      // Calculate duration in days
      const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

      const ganttTask: any = {
        id: task.ID,
        text: task.Name || 'Untitled Task',
        start_date: this.formatDateForDHTMLX(startDate),
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
      data.push(ganttTask);
    });

    // Create links from TaskDependencyEntity records
    this.taskDependencies.forEach((dep, index) => {
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

  private formatDateForDHTMLX(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 00:00`;
  }

  public formatDateTime(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  public closeDetailPanel(): void {
    this.selectedTask = null;
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
    if (this.isResizing) {
      this.isResizing = false;
      // Resize gantt chart after panel resize completes
      setTimeout(() => {
        if (this.ganttInitialized) {
          gantt.setSizes();
        }
      }, 0);
    }
  }
}
