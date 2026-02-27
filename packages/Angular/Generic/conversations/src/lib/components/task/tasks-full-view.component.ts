import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

import { UserInfo, RunView } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { TaskComponent } from '@memberjunction/ng-tasks';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Full-page tasks view with task list and Gantt chart
 * Generic component that displays tasks based on provided filter
 * Supports drilling into individual tasks to see sub-tasks
 */
@Component({
  selector: 'mj-tasks-full-view',
  standalone: true,
  imports: [TaskComponent],
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
            [ganttTasks]="subTasksWithParent"
            [taskDependencies]="taskDependencies"
            [agentRunMap]="agentRunMap"
            [title]="selectedTask.Name"
            [description]="getTaskDetailDescription()"
            [showHeader]="true"
            [showViewToggle]="true"
            [viewMode]="'gantt'"
            (taskClicked)="onSubTaskClick($event)"
            (openEntityRecord)="onOpenEntityRecord($event)">
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
  @Input() activeTaskId?: string; // Task ID to auto-select and drill into
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();
  @Output() taskSelected = new EventEmitter<string | null>(); // Emits task ID when drill-down occurs, null when returning to list

  public allTasks: MJTaskEntity[] = [];
  public filteredTasks: MJTaskEntity[] = [];
  public subTasks: MJTaskEntity[] = [];
  public subTasksWithParent: MJTaskEntity[] = []; // Includes parent for Gantt hierarchy
  public taskDependencies: MJTaskDependencyEntity[] = []; // Dependencies for Gantt links
  public agentRunMap = new Map<string, string>(); // Maps TaskID -> AgentRunID
  public selectedTask: MJTaskEntity | null = null;
  public showDetailAnimation: boolean = false;
  public isLoading: boolean = false;
  private aiEngineConfigured: boolean = false;

  ngOnInit() {
    this.loadTasks();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reload tasks if baseFilter changes
    if (changes['baseFilter'] && !changes['baseFilter'].firstChange) {
      this.loadTasks();
    }

    // Auto-drill into task if activeTaskId changes
    if (changes['activeTaskId'] && this.activeTaskId) {
      const task = this.allTasks.find(t => t.ID === this.activeTaskId);
      if (task) {
        this.onTaskClick(task);
      }
    }
  }

  public async loadTasks(): Promise<void> {
    this.isLoading = true;

    try {
      // Configure AIEngineBase on first load (false = don't force refresh)
      if (!this.aiEngineConfigured) {
        await AIEngineBase.Instance.Config(false);
        this.aiEngineConfigured = true;
      }

      const rv = new RunView();

      console.log('📝 Tasks filter SQL:', this.baseFilter);

      // Load all tasks with the provided filter
      const tasksResult = await rv.RunView<MJTaskEntity>(
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

  public async onTaskClick(task: MJTaskEntity): Promise<void> {
    console.log('Task clicked:', task);
    this.selectedTask = task;
    this.showDetailAnimation = true;

    // Emit task selection event for URL tracking
    this.taskSelected.emit(task.ID);

    // Load all tasks in the hierarchy using RootParentID
    await this.loadTaskHierarchy(task);
  }

  private async loadTaskHierarchy(task: MJTaskEntity): Promise<void> {
    try {
      const rv = new RunView();

      // Use RootParentID to load all tasks in this hierarchy
      // If task has no RootParentID, it's the root itself, so use its ID
      const rootId = task.RootParentID || task.ID;

      // Load all tasks where RootParentID matches, or tasks that are the root itself
      const hierarchyResult = await rv.RunView<MJTaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `RootParentID='${rootId}' OR ID='${rootId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (hierarchyResult.Success) {
        const allHierarchy = hierarchyResult.Results || [];

        // For list view: Filter out the clicked task itself - only show its children/descendants
        this.subTasks = allHierarchy.filter(t => t.ID !== task.ID);

        // For Gantt view: Include the parent task so hierarchy works correctly
        this.subTasksWithParent = allHierarchy;

        console.log(`📋 Loaded ${this.subTasks.length} tasks in hierarchy for root ${rootId}`);

        // Load task dependencies for this hierarchy
        await this.loadTaskDependencies(rootId);

        // Load agent runs for this hierarchy
        await this.loadAgentRuns(allHierarchy);
      } else {
        console.error('❌ Failed to load task hierarchy:', hierarchyResult.ErrorMessage);
        this.subTasks = [];
        this.subTasksWithParent = [];
        this.taskDependencies = [];
      }
    } catch (error) {
      console.error('Failed to load task hierarchy:', error);
      this.subTasks = [];
    }
  }

  private async loadTaskDependencies(rootId: string): Promise<void> {
    try {
      const rv = new RunView();

      // Load task dependencies where either TaskID or DependsOnTaskID is in this hierarchy
      // Use subquery to find all tasks with this RootParentID
      // Note: Using __mj as the default schema - this is the standard MJ schema
      const schema = '__mj';
      const depsResult = await rv.RunView<MJTaskDependencyEntity>(
        {
          EntityName: 'MJ: Task Dependencies',
          ExtraFilter: `
            TaskID IN (SELECT ID FROM [${schema}].[vwTasks] WHERE RootParentID='${rootId}' OR ID='${rootId}')
            OR
            DependsOnTaskID IN (SELECT ID FROM [${schema}].[vwTasks] WHERE RootParentID='${rootId}' OR ID='${rootId}')
          `,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (depsResult.Success) {
        this.taskDependencies = depsResult.Results || [];
        console.log(`🔗 Loaded ${this.taskDependencies.length} task dependencies`);
      } else {
        console.error('❌ Failed to load task dependencies:', depsResult.ErrorMessage);
        this.taskDependencies = [];
      }
    } catch (error) {
      console.error('Failed to load task dependencies:', error);
      this.taskDependencies = [];
    }
  }

  private async loadAgentRuns(tasks: MJTaskEntity[]): Promise<void> {
    try {
      // Clear existing map
      this.agentRunMap.clear();

      // Get all unique ConversationDetailIDs from tasks (filter out nulls)
      const conversationDetailIds = tasks
        .filter(t => t.ConversationDetailID != null)
        .map(t => t.ConversationDetailID!);

      if (conversationDetailIds.length === 0) {
        console.log('💡 No tasks with ConversationDetailID');
        return;
      }

      const rv = new RunView();
      const schema = '__mj';

      // Build filter to find agent runs for these conversation details
      // Use a subquery to avoid passing large ID lists
      const taskIds = tasks.map(t => `'${t.ID}'`).join(',');

      const agentRunsResult = await rv.RunView<MJAIAgentRunEntity>(
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `
            ConversationDetailID IN (
              SELECT DISTINCT ConversationDetailID
              FROM [${schema}].[vwTasks]
              WHERE ID IN (${taskIds})
              AND ConversationDetailID IS NOT NULL
            )
          `,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (agentRunsResult.Success) {
        const agentRuns = agentRunsResult.Results || [];
        console.log(`🤖 Loaded ${agentRuns.length} agent runs`, agentRuns);

        // Build map: ConversationDetailID -> AgentRunID
        const convoToRunMap = new Map<string, string>();
        agentRuns.forEach(run => {
          if (run.ConversationDetailID) {
            convoToRunMap.set(run.ConversationDetailID, run.ID);
            console.log(`📝 Mapping ConvoDetailID ${run.ConversationDetailID} -> RunID ${run.ID}`);
          }
        });

        // Map TaskID -> AgentRunID using ConversationDetailID as the link
        tasks.forEach(task => {
          console.log(`🔍 Task ${task.Name} - ConvoDetailID: ${task.ConversationDetailID}, AgentID: ${task.AgentID}`);
          if (task.ConversationDetailID) {
            const agentRunId = convoToRunMap.get(task.ConversationDetailID);
            if (agentRunId) {
              this.agentRunMap.set(task.ID, agentRunId);
              console.log(`✅ Mapped Task ${task.ID} -> AgentRun ${agentRunId}`);
            } else {
              console.log(`⚠️ No agent run found for ConvoDetailID ${task.ConversationDetailID}`);
            }
          }
        });

        console.log(`🔗 Mapped ${this.agentRunMap.size} tasks to agent runs`, Array.from(this.agentRunMap.entries()));
      } else {
        console.error('❌ Failed to load agent runs:', agentRunsResult.ErrorMessage);
      }
    } catch (error) {
      console.error('Failed to load agent runs:', error);
    }
  }

  public backToTaskList(): void {
    this.selectedTask = null;
    this.subTasks = [];
    this.subTasksWithParent = [];
    this.taskDependencies = [];
    this.agentRunMap.clear();
    this.showDetailAnimation = false;

    // Emit null to indicate returning to task list (for URL tracking)
    this.taskSelected.emit(null);
  }

  public onSubTaskClick(subTask: MJTaskEntity): void {
    console.log('Sub-task clicked:', subTask);
    // Could drill down further if needed
  }

  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    // Bubble up the event to parent component
    this.openEntityRecord.emit(event);
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
