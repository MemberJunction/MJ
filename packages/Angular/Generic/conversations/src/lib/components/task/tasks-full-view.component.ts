import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { UserInfo, RunView } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { TaskComponent } from '@memberjunction/ng-tasks';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { UUIDsEqual } from '@memberjunction/global';

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
      background: var(--mj-bg-surface-sunken);
    }

    .task-detail-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface);
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
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .breadcrumb-back {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid var(--mj-border-strong);
      border-radius: 6px;
      color: var(--mj-text-secondary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .breadcrumb-back:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-text-disabled);
    }

    .breadcrumb-back i {
      font-size: 12px;
    }

    .breadcrumb-divider {
      color: var(--mj-text-disabled);
      font-size: 14px;
    }

    .breadcrumb-current {
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }
  `]
})
export class TasksFullViewComponent extends BaseAngularComponent implements OnInit, OnChanges  {
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() BaseFilter: string = '1=1';

  /** @deprecated Use {@link BaseFilter}. */
  @Input() set baseFilter(value: string) {
    this.BaseFilter = value;
  }
  /** @deprecated Use {@link BaseFilter}. */
  get baseFilter(): string {
    return this.BaseFilter;
  } // SQL filter for tasks (default: show all)
  @Input() ActiveTaskId?: string;

  /** @deprecated Use {@link ActiveTaskId}. */
  @Input() set activeTaskId(value: string | undefined) {
    this.ActiveTaskId = value;
  }
  /** @deprecated Use {@link ActiveTaskId}. */
  get activeTaskId(): string | undefined {
    return this.ActiveTaskId;
  } // Task ID to auto-select and drill into
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;
  @Output() TaskSelected = new EventEmitter<string | null>();

  /**
   * @deprecated Use {@link TaskSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (taskSelected) keeps working. Must stay AFTER TaskSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() taskSelected = this.TaskSelected; // Emits task ID when drill-down occurs, null when returning to list

  public AllTasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link AllTasks}. */
  public get allTasks(): MJTaskEntity[] {
    return this.AllTasks;
  }
  /** @deprecated Use {@link AllTasks}. */
  public set allTasks(value: MJTaskEntity[]) {
    this.AllTasks = value;
  }
  public FilteredTasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link FilteredTasks}. */
  public get filteredTasks(): MJTaskEntity[] {
    return this.FilteredTasks;
  }
  /** @deprecated Use {@link FilteredTasks}. */
  public set filteredTasks(value: MJTaskEntity[]) {
    this.FilteredTasks = value;
  }
  public SubTasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link SubTasks}. */
  public get subTasks(): MJTaskEntity[] {
    return this.SubTasks;
  }
  /** @deprecated Use {@link SubTasks}. */
  public set subTasks(value: MJTaskEntity[]) {
    this.SubTasks = value;
  }
  public SubTasksWithParent: MJTaskEntity[] = [];

  /** @deprecated Use {@link SubTasksWithParent}. */
  public get subTasksWithParent(): MJTaskEntity[] {
    return this.SubTasksWithParent;
  }
  /** @deprecated Use {@link SubTasksWithParent}. */
  public set subTasksWithParent(value: MJTaskEntity[]) {
    this.SubTasksWithParent = value;
  } // Includes parent for Gantt hierarchy
  public TaskDependencies: MJTaskDependencyEntity[] = [];

  /** @deprecated Use {@link TaskDependencies}. */
  public get taskDependencies(): MJTaskDependencyEntity[] {
    return this.TaskDependencies;
  }
  /** @deprecated Use {@link TaskDependencies}. */
  public set taskDependencies(value: MJTaskDependencyEntity[]) {
    this.TaskDependencies = value;
  } // Dependencies for Gantt links
  public AgentRunMap = new Map<string, string>();

  /** @deprecated Use {@link AgentRunMap}. */
  public get agentRunMap() {
    return this.AgentRunMap;
  }
  /** @deprecated Use {@link AgentRunMap}. */
  public set agentRunMap(value) {
    this.AgentRunMap = value;
  } // Maps TaskID -> AgentRunID
  public SelectedTask: MJTaskEntity | null = null;

  /** @deprecated Use {@link SelectedTask}. */
  public get selectedTask(): MJTaskEntity | null {
    return this.SelectedTask;
  }
  /** @deprecated Use {@link SelectedTask}. */
  public set selectedTask(value: MJTaskEntity | null) {
    this.SelectedTask = value;
  }
  public ShowDetailAnimation: boolean = false;

  /** @deprecated Use {@link ShowDetailAnimation}. */
  public get showDetailAnimation(): boolean {
    return this.ShowDetailAnimation;
  }
  /** @deprecated Use {@link ShowDetailAnimation}. */
  public set showDetailAnimation(value: boolean) {
    this.ShowDetailAnimation = value;
  }
  public isLoading: boolean = false;
  private aiEngineConfigured: boolean = false;

  ngOnInit() {
    this.LoadTasks();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reload tasks if baseFilter changes
    if (changes['baseFilter'] && !changes['baseFilter'].firstChange) {
      this.LoadTasks();
    }

    // Auto-drill into task if activeTaskId changes
    if (changes['activeTaskId'] && this.ActiveTaskId) {
      const task = this.AllTasks.find(t => UUIDsEqual(t.ID, this.ActiveTaskId));
      if (task) {
        this.OnTaskClick(task);
      }
    }
  }

  public async LoadTasks(): Promise<void> {
    this.isLoading = true;

    try {
      // Configure AIEngineBase on first load (false = don't force refresh)
      if (!this.aiEngineConfigured) {
        await AIEngineBase.Instance.Config(false);
        this.aiEngineConfigured = true;
      }

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      console.log('📝 Tasks filter SQL:', this.BaseFilter);

      // Load all tasks with the provided filter
      const tasksResult = await rv.RunView<MJTaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: this.BaseFilter,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.CurrentUser
      );

      console.log('📊 Tasks query result:', {
        success: tasksResult.Success,
        resultCount: tasksResult.Results?.length || 0,
        errorMessage: tasksResult.ErrorMessage
      });

      if (tasksResult.Success) {
        this.AllTasks = tasksResult.Results || [];
        this.FilteredTasks = this.AllTasks;
        console.log(`📋 Loaded ${this.AllTasks.length} tasks`);
        if (this.AllTasks.length === 0) {
          console.log('💡 No tasks found with current filter');
        } else {
          console.log('✅ Sample task:', {
            id: this.AllTasks[0].ID,
            name: this.AllTasks[0].Name,
            status: this.AllTasks[0].Status,
            conversationDetailID: this.AllTasks[0].ConversationDetailID
          });
        }
      } else {
        console.error('❌ Failed to load tasks:', tasksResult.ErrorMessage);
        this.AllTasks = [];
        this.FilteredTasks = [];
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.AllTasks = [];
      this.FilteredTasks = [];
    } finally {
      this.isLoading = false;
    }
  }

  /** @deprecated Use {@link LoadTasks}. */
  public async loadTasks(): Promise<void> {
    return this.LoadTasks();
  }

  public async OnTaskClick(task: MJTaskEntity): Promise<void> {
    console.log('Task clicked:', task);
    this.SelectedTask = task;
    this.ShowDetailAnimation = true;

    // Emit task selection event for URL tracking
    this.TaskSelected.emit(task.ID);

    // Load all tasks in the hierarchy using RootParentID
    await this.loadTaskHierarchy(task);
  }

  /** @deprecated Use {@link OnTaskClick}. */
  public async onTaskClick(task: MJTaskEntity): Promise<void> {
    return this.OnTaskClick(task);
  }

  private async loadTaskHierarchy(task: MJTaskEntity): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

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
        this.CurrentUser
      );

      if (hierarchyResult.Success) {
        const allHierarchy = hierarchyResult.Results || [];

        // For list view: Filter out the clicked task itself - only show its children/descendants
        this.SubTasks = allHierarchy.filter(t => !UUIDsEqual(t.ID, task.ID));

        // For Gantt view: Include the parent task so hierarchy works correctly
        this.SubTasksWithParent = allHierarchy;

        console.log(`📋 Loaded ${this.SubTasks.length} tasks in hierarchy for root ${rootId}`);

        // Load task dependencies for this hierarchy
        await this.loadTaskDependencies(rootId);

        // Load agent runs for this hierarchy
        this.loadAgentRuns(allHierarchy);
      } else {
        console.error('❌ Failed to load task hierarchy:', hierarchyResult.ErrorMessage);
        this.SubTasks = [];
        this.SubTasksWithParent = [];
        this.TaskDependencies = [];
      }
    } catch (error) {
      console.error('Failed to load task hierarchy:', error);
      this.SubTasks = [];
    }
  }

  private async loadTaskDependencies(rootId: string): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

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
        this.CurrentUser
      );

      if (depsResult.Success) {
        this.TaskDependencies = depsResult.Results || [];
        console.log(`🔗 Loaded ${this.TaskDependencies.length} task dependencies`);
      } else {
        console.error('❌ Failed to load task dependencies:', depsResult.ErrorMessage);
        this.TaskDependencies = [];
      }
    } catch (error) {
      console.error('Failed to load task dependencies:', error);
      this.TaskDependencies = [];
    }
  }

  /**
   * Builds the TaskID -> AgentRunID map from each task's own AgentRunID column.
   *
   * Previously this joined tasks to runs through the shared ConversationDetailID, which meant
   * every sibling task in a graph resolved to the SAME agent run — the run link in the Gantt
   * and detail panel was wrong for all but one task. Each task now records the specific run
   * that executed it (Task.AgentRunID), so the mapping is direct and needs no query at all.
   */
  private loadAgentRuns(tasks: MJTaskEntity[]): void {
    this.AgentRunMap.clear();
    for (const task of tasks) {
      if (task.AgentRunID) {
        this.AgentRunMap.set(task.ID, task.AgentRunID);
      }
    }
  }

  public BackToTaskList(): void {
    this.SelectedTask = null;
    this.SubTasks = [];
    this.SubTasksWithParent = [];
    this.TaskDependencies = [];
    this.AgentRunMap.clear();
    this.ShowDetailAnimation = false;

    // Emit null to indicate returning to task list (for URL tracking)
    this.TaskSelected.emit(null);
  }

  /** @deprecated Use {@link BackToTaskList}. */
  public backToTaskList(): void {
    return this.BackToTaskList();
  }

  public OnSubTaskClick(subTask: MJTaskEntity): void {
    console.log('Sub-task clicked:', subTask);
    // Could drill down further if needed
  }

  /** @deprecated Use {@link OnSubTaskClick}. */
  public onSubTaskClick(subTask: MJTaskEntity): void {
    return this.OnSubTaskClick(subTask);
  }

  public OnOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    // Bubble up the event to parent component
    this.OpenEntityRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    return this.OnOpenEntityRecord(event);
  }

  public getDescription(): string {
    const activeCount = this.AllTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.AllTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.AllTasks.length} total`;
  }

  public GetTaskDetailDescription(): string {
    if (this.SubTasks.length === 0) {
      return 'No sub-tasks';
    }
    const activeCount = this.SubTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.SubTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.SubTasks.length} sub-tasks`;
  }

  /** @deprecated Use {@link GetTaskDetailDescription}. */
  public getTaskDetailDescription(): string {
    return this.GetTaskDetailDescription();
  }
}
