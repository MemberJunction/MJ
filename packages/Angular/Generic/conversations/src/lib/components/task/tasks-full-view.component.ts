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

      // First, get all conversations the user has access to
      const conversationsResult = await rv.RunView<ConversationEntity>(
        {
          EntityName: 'Conversations',
          ExtraFilter: `ID IN (
            SELECT ConversationID FROM vwConversationDetails WHERE UserID='${this.currentUser.ID}'
            UNION
            SELECT ID FROM vwConversations WHERE UserID='${this.currentUser.ID}'
          )`,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (!conversationsResult.Success || !conversationsResult.Results || conversationsResult.Results.length === 0) {
        this.allTasks = [];
        this.filteredTasks = [];
        return;
      }

      // Get conversation IDs
      const conversationIds = conversationsResult.Results.map(c => `'${c.ID}'`).join(',');

      // Load all tasks for conversation details in these conversations
      const tasksResult = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `ConversationDetailID IN (
            SELECT ID FROM vwConversationDetails WHERE ConversationID IN (${conversationIds})
          )`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (tasksResult.Success) {
        this.allTasks = tasksResult.Results || [];
        this.filteredTasks = this.allTasks;
        console.log(`📋 Loaded ${this.allTasks.length} tasks across all conversations`);
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
