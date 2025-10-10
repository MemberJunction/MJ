import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserInfo, RunView } from '@memberjunction/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { TaskComponent } from '@memberjunction/ng-tasks';

/**
 * Full-page tasks view with task list and Gantt chart
 * Generic component that displays tasks based on provided filter
 * Supports drilling into individual tasks to see sub-tasks
 */
@Component({
  selector: 'mj-tasks-full-view',
  standalone: true,
  imports: [CommonModule, TaskComponent],
  template: `
    <div class="tasks-full-view">
      @if (!selectedTask) {
        <!-- Task List View -->
        <mj-task
          [tasks]="filteredTasks"
          [title]="'Tasks'"
          [description]="getDescription()"
          [showHeader]="true"
          [showViewToggle]="false"
          [viewMode]="'simple'"
          (taskClicked)="onTaskClick($event)">
        </mj-task>
      } @else {
        <!-- Task Detail View with Sub-tasks -->
        <div class="task-detail-view" [class.swoosh-in]="showDetailAnimation">
          <!-- Breadcrumb -->
          <div class="breadcrumb-nav">
            <button class="breadcrumb-back" (click)="backToTaskList()">
              <i class="fas fa-arrow-left"></i>
              <span>Back to Tasks</span>
            </button>
            <div class="breadcrumb-divider">/</div>
            <span class="breadcrumb-current">{{ selectedTask.Name }}</span>
          </div>

          <!-- Task Details & Sub-tasks with Gantt Toggle -->
          <mj-task
            [tasks]="subTasks"
            [title]="selectedTask.Name"
            [description]="getTaskDetailDescription()"
            [showHeader]="true"
            [showViewToggle]="true"
            [viewMode]="'simple'"
            (taskClicked)="onSubTaskClick($event)">
          </mj-task>
        </div>
      }
    </div>
  `,
  styles: [`
    .tasks-full-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #F9FAFB;
    }

    .task-detail-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
    }

    .swoosh-in {
      animation: swooshIn 0.3s ease-out;
    }

    @keyframes swooshIn {
      from {
        opacity: 0;
        transform: translateX(50px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .breadcrumb-nav {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #E5E7EB;
    }

    .breadcrumb-back {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      color: #374151;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .breadcrumb-back:hover {
      background: #F3F4F6;
      border-color: #9CA3AF;
    }

    .breadcrumb-back i {
      font-size: 12px;
    }

    .breadcrumb-divider {
      color: #9CA3AF;
      font-size: 14px;
    }

    .breadcrumb-current {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
  `]
})
export class TasksFullViewComponent implements OnInit, OnChanges {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() baseFilter: string = '1=1'; // SQL filter for tasks (default: show all)

  public allTasks: TaskEntity[] = [];
  public filteredTasks: TaskEntity[] = [];
  public subTasks: TaskEntity[] = [];
  public selectedTask: TaskEntity | null = null;
  public showDetailAnimation: boolean = false;
  public isLoading: boolean = false;

  ngOnInit() {
    this.loadTasks();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reload tasks if baseFilter changes
    if (changes['baseFilter'] && !changes['baseFilter'].firstChange) {
      this.loadTasks();
    }
  }

  public async loadTasks(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = new RunView();

      console.log('📝 Tasks filter SQL:', this.baseFilter);

      // Load all tasks with the provided filter
      const tasksResult = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: this.baseFilter,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      console.log('📊 Tasks query result:', {
        success: tasksResult.Success,
        resultCount: tasksResult.Results?.length || 0,
        errorMessage: tasksResult.ErrorMessage
      });

      if (tasksResult.Success) {
        this.allTasks = tasksResult.Results || [];
        this.filteredTasks = this.allTasks;
        console.log(`📋 Loaded ${this.allTasks.length} tasks`);
        if (this.allTasks.length === 0) {
          console.log('💡 No tasks found with current filter');
        } else {
          console.log('✅ Sample task:', {
            id: this.allTasks[0].ID,
            name: this.allTasks[0].Name,
            status: this.allTasks[0].Status,
            conversationDetailID: this.allTasks[0].ConversationDetailID
          });
        }
      } else {
        console.error('❌ Failed to load tasks:', tasksResult.ErrorMessage);
        this.allTasks = [];
        this.filteredTasks = [];
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.allTasks = [];
      this.filteredTasks = [];
    } finally {
      this.isLoading = false;
    }
  }

  public async onTaskClick(task: TaskEntity): Promise<void> {
    console.log('Task clicked:', task);
    this.selectedTask = task;
    this.showDetailAnimation = true;

    // Load sub-tasks for the selected task
    await this.loadSubTasks(task.ID);
  }

  private async loadSubTasks(parentTaskId: string): Promise<void> {
    try {
      const rv = new RunView();

      // Load sub-tasks where ParentTaskID matches the selected task
      const subTasksResult = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `ParentTaskID='${parentTaskId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (subTasksResult.Success) {
        this.subTasks = subTasksResult.Results || [];
        console.log(`📋 Loaded ${this.subTasks.length} sub-tasks for task ${parentTaskId}`);
      } else {
        console.error('❌ Failed to load sub-tasks:', subTasksResult.ErrorMessage);
        this.subTasks = [];
      }
    } catch (error) {
      console.error('Failed to load sub-tasks:', error);
      this.subTasks = [];
    }
  }

  public backToTaskList(): void {
    this.selectedTask = null;
    this.subTasks = [];
    this.showDetailAnimation = false;
  }

  public onSubTaskClick(subTask: TaskEntity): void {
    console.log('Sub-task clicked:', subTask);
    // Could drill down further if needed
  }

  public getDescription(): string {
    const activeCount = this.allTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.allTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.allTasks.length} total`;
  }

  public getTaskDetailDescription(): string {
    if (this.subTasks.length === 0) {
      return 'No sub-tasks';
    }
    const activeCount = this.subTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.subTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.subTasks.length} sub-tasks`;
  }
}
