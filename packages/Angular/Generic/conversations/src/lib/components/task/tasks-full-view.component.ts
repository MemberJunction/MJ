import { Component, Input, OnInit } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { TaskEntity, ConversationEntity } from '@memberjunction/core-entities';
import { TaskComponent } from '@memberjunction/ng-tasks';

/**
 * Full-page tasks view with task list and Gantt chart
 * Shows all tasks across conversations the user has access to
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
export class TasksFullViewComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() baseFilter?: string; // Optional base filter to override default conversation filtering

  public allTasks: TaskEntity[] = [];
  public filteredTasks: TaskEntity[] = [];
  public isLoading: boolean = false;

  ngOnInit() {
    this.loadTasks();
  }

  public async loadTasks(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = new RunView();
      let taskFilter: string;

      // If baseFilter is provided, use it directly
      if (this.baseFilter) {
        taskFilter = this.baseFilter;
        console.log('📝 Using provided baseFilter:', taskFilter);
      } else {
        // Default: Filter by conversations user has access to
        // First, get all conversations the user has access to
        const conversationFilterSQL = `ID IN (
            SELECT ConversationID FROM vwConversationDetails WHERE UserID='${this.currentUser.ID}'
            UNION
            SELECT ID FROM vwConversations WHERE UserID='${this.currentUser.ID}'
          )`;

        console.log('📝 Conversations filter SQL:', conversationFilterSQL);

        const conversationsResult = await rv.RunView<ConversationEntity>(
          {
            EntityName: 'Conversations',
            ExtraFilter: conversationFilterSQL,
            ResultType: 'entity_object'
          },
          this.currentUser
        );

        if (!conversationsResult.Success || !conversationsResult.Results || conversationsResult.Results.length === 0) {
          console.log('❌ No conversations found for user or query failed:', conversationsResult.ErrorMessage);
          this.allTasks = [];
          this.filteredTasks = [];
          return;
        }

        console.log(`✅ Found ${conversationsResult.Results.length} conversations user has access to`);
        console.log('📋 Conversation IDs:', conversationsResult.Results.map(c => c.ID));

        // Get conversation IDs
        const conversationIds = conversationsResult.Results.map(c => `'${c.ID}'`).join(',');

        // Build filter for tasks in these conversations
        taskFilter = `ConversationDetailID IN (
            SELECT ID FROM vwConversationDetails WHERE ConversationID IN (${conversationIds})
          )`;
      }

      console.log('📝 Tasks filter SQL:', taskFilter);

      // Load all tasks with the filter
      const tasksResult = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: taskFilter,
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
          console.log('💡 No tasks found. Check:');
          console.log('  - Tasks exist in database');
          console.log('  - Tasks have ConversationDetailID set (unless using custom baseFilter)');
          console.log('  - User has access to conversations containing those tasks');
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
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
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
