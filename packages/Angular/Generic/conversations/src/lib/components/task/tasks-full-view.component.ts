import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { TaskComponent } from '@memberjunction/ng-tasks';

/**
 * Full-page tasks view with task list and Gantt chart
 * Generic component that displays tasks based on provided filter
 */
@Component({
  selector: 'mj-tasks-full-view',
  standalone: true,
  imports: [TaskComponent],
  template: `
    <div class="tasks-full-view">
      <mj-task
        [tasks]="filteredTasks"
        [title]="'Tasks'"
        [description]="getDescription()"
        [showHeader]="true"
        [viewMode]="'simple'"
        (taskClicked)="onTaskClick($event)">
      </mj-task>
    </div>
  `,
  styles: [`
    .tasks-full-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #F9FAFB;
    }
  `]
})
export class TasksFullViewComponent implements OnInit, OnChanges {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() baseFilter: string = '1=1'; // SQL filter for tasks (default: show all)

  public allTasks: TaskEntity[] = [];
  public filteredTasks: TaskEntity[] = [];
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

  public getDescription(): string {
    const activeCount = this.allTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.allTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.allTasks.length} total`;
  }

  public onTaskClick(task: TaskEntity): void {
    console.log('Task clicked:', task);
    // TODO: Navigate to conversation or open task details
  }
}
