import { Component, Input, Output, EventEmitter, OnChanges, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskEntity } from '@memberjunction/core-entities';
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
      <div #ganttContainer class="gantt-container" *ngIf="tasks && tasks.length > 0"></div>
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

    .gantt-container {
      flex: 1;
      width: 100%;
      height: 600px; /* Fixed height for DHTMLX Gantt */
      position: relative;
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
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<HTMLDivElement>;

  private ganttInitialized = false;

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

      // Column configuration
      gantt.config.columns = [
        { name: 'text', label: 'Task name', tree: true, width: '*' },
        { name: 'start_date', label: 'Start', align: 'center', width: 80 },
        { name: 'duration', label: 'Days', align: 'center', width: 60 }
      ];

      // Initialize Gantt in the container
      gantt.init(this.ganttContainer.nativeElement);
      this.ganttInitialized = true;

      // Attach click event
      gantt.attachEvent('onTaskClick', (id: string) => {
        const originalTask = this.tasks.find(t => t.ID === id);
        if (originalTask) {
          this.taskClicked.emit(originalTask);
        }
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

    tasks.forEach((task, index) => {
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

      // Add parent relationship if exists
      if (task.ParentID) {
        ganttTask.parent = task.ParentID;

        // Create a link for the dependency
        links.push({
          id: `link_${index}`,
          source: task.ParentID,
          target: task.ID,
          type: '0' // finish-to-start
        });
      } else {
        // Root tasks need parent: 0
        ganttTask.parent = 0;
      }

      console.log('✅ Created Gantt task:', ganttTask);
      data.push(ganttTask);
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
}
