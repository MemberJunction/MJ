import { Component, Input, Output, EventEmitter, OnChanges, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskEntity } from '@memberjunction/core-entities';
import { GanttTask } from '../models/task-view.models';
import Gantt from 'frappe-gantt/dist/frappe-gantt.js';

/**
 * Gantt chart view for tasks using Frappe Gantt
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
      <svg #ganttContainer class="gantt-container" *ngIf="tasks && tasks.length > 0"></svg>
    </div>
  `,
  styles: [`
    .gantt-task-viewer {
      height: 100%;
      background: white;
      overflow: auto;
      padding: 20px;
    }

    .gantt-container {
      width: 100%;
      min-height: 400px;
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

    :host ::ng-deep .gantt .bar {
      fill: #3B82F6;
    }

    :host ::ng-deep .gantt .bar-progress {
      fill: #1E40AF;
    }

    :host ::ng-deep .gantt .bar-label {
      fill: white;
      font-weight: 500;
    }
  `]
})
export class GanttTaskViewerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() tasks: TaskEntity[] = [];
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<SVGElement>;

  private ganttInstance: any;
  private ganttLibraryLoaded = false;

  ngAfterViewInit() {
    this.loadGanttLibrary();
    if (this.tasks && this.tasks.length > 0) {
      this.renderGantt();
    }
  }

  ngOnChanges() {
    if (this.ganttLibraryLoaded && this.ganttContainer) {
      this.renderGantt();
    }
  }

  ngOnDestroy() {
    if (this.ganttInstance) {
      this.ganttInstance = null;
    }
  }

  private loadGanttLibrary(): void {
    if (this.ganttLibraryLoaded) return;

    // Load Frappe Gantt CSS
    if (!document.querySelector('link[href*="frappe-gantt"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'node_modules/frappe-gantt/dist/frappe-gantt.min.css';
      document.head.appendChild(link);
    }

    this.ganttLibraryLoaded = true;
  }

  private renderGantt(): void {
    if (!this.ganttContainer || !this.tasks || this.tasks.length === 0) {
      return;
    }

    try {
      const ganttTasks = this.convertToGanttTasks(this.tasks);

      if (ganttTasks.length === 0) {
        return;
      }

      // Destroy existing instance
      if (this.ganttInstance) {
        this.ganttContainer.nativeElement.innerHTML = '';
      }

      // Create new Gantt instance
      this.ganttInstance = new Gantt(this.ganttContainer.nativeElement, ganttTasks, {
        view_mode: 'Day',
        bar_height: 30,
        bar_corner_radius: 3,
        arrow_curve: 5,
        padding: 18,
        view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
        date_format: 'YYYY-MM-DD',
        custom_popup_html: (task: any) => {
          const originalTask = this.tasks.find(t => t.ID === task.id);
          return `
            <div class="gantt-popup">
              <h3>${task.name}</h3>
              ${originalTask?.Description ? `<p>${originalTask.Description}</p>` : ''}
              <p><strong>Duration:</strong> ${task.start} - ${task.end}</p>
              <p><strong>Progress:</strong> ${task.progress}%</p>
              ${originalTask?.User ? `<p><strong>Assigned:</strong> ${originalTask.User}</p>` : ''}
            </div>
          `;
        },
        on_click: (task: any) => {
          const originalTask = this.tasks.find(t => t.ID === task.id);
          if (originalTask) {
            this.taskClicked.emit(originalTask);
          }
        }
      });
    } catch (error) {
      console.error('Error rendering Gantt chart:', error);
    }
  }

  private convertToGanttTasks(tasks: TaskEntity[]): GanttTask[] {
    const ganttTasks: GanttTask[] = [];

    tasks.forEach(task => {
      // Calculate dates
      const startDate = task.StartedAt ? new Date(task.StartedAt) : new Date();
      let endDate = task.DueAt ? new Date(task.DueAt) : new Date(startDate);

      // Ensure end date is after start date
      if (endDate <= startDate) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      // Calculate progress
      let progress = task.PercentComplete || 0;
      if (task.Status === 'Complete') {
        progress = 100;
      }

      const ganttTask: GanttTask = {
        id: task.ID,
        name: task.Name || 'Untitled Task',
        start: this.formatDateForGantt(startDate),
        end: this.formatDateForGantt(endDate),
        progress: progress,
        custom_class: task.Status === 'Complete' ? 'bar-complete' : ''
      };

      ganttTasks.push(ganttTask);
    });

    return ganttTasks;
  }

  private formatDateForGantt(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
