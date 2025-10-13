import { NgModule } from '@angular/core';
import { TaskComponent } from './components/task.component';
import { SimpleTaskViewerComponent } from './components/simple-task-viewer.component';
import { GanttTaskViewerComponent } from './components/gantt-task-viewer.component';

/**
 * MemberJunction Tasks Module
 * Provides task visualization components with Gantt chart support
 */
@NgModule({
  imports: [
    TaskComponent,
    SimpleTaskViewerComponent,
    GanttTaskViewerComponent
  ],
  exports: [
    TaskComponent,
    SimpleTaskViewerComponent,
    GanttTaskViewerComponent
  ]
})
export class NgTasksModule { }
