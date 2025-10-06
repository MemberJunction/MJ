import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
import { DialogService } from '../../services/dialog.service';

@Component({
  selector: 'mj-task-list',
  template: `
    <div class="task-list">
      <div class="task-header">
        <h3>Tasks</h3>
        <div class="task-filters">
          <button
            class="filter-btn"
            [class.active]="filterStatus === 'all'"
            (click)="filterStatus = 'all'; applyFilter()">
            All
          </button>
          <button
            class="filter-btn"
            [class.active]="filterStatus === 'active'"
            (click)="filterStatus = 'active'; applyFilter()">
            Active
          </button>
          <button
            class="filter-btn"
            [class.active]="filterStatus === 'overdue'"
            (click)="filterStatus = 'overdue'; applyFilter()"
            [title]="getOverdueCount() + ' overdue tasks'">
            Overdue
            @if (getOverdueCount() > 0) {
              <span class="filter-badge">{{ getOverdueCount() }}</span>
            }
          </button>
          <button
            class="filter-btn"
            [class.active]="filterStatus === 'completed'"
            (click)="filterStatus = 'completed'; applyFilter()">
            Completed
          </button>
        </div>
        <button class="btn-add-task" (click)="onAddTask()" title="Add Task">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>

      <div class="task-content">
        @if (filteredTasks.length === 0) {
          <div class="empty-state">
            <i class="fa-solid fa-tasks"></i>
            <p>No tasks found</p>
          </div>
        }

        @for (task of filteredTasks; track task.ID) {
          <mj-task-item
            [task]="task"
            (statusToggled)="onToggleStatus($event)"
            (editRequested)="onEditTask($event)"
            (deleteRequested)="onDeleteTask($event)">
          </mj-task-item>
        }
      </div>

      <mj-task-form-modal
        [isVisible]="isTaskModalVisible"
        [task]="selectedTask"
        [conversationId]="conversationId"
        [currentUser]="currentUser"
        (saved)="onTaskSaved($event)"
        (cancelled)="onTaskModalCancelled()">
      </mj-task-form-modal>
    </div>
  `,
  styles: [`
    .task-list { display: flex; flex-direction: column; height: 100%; background: white; }
    .task-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; align-items: center; gap: 12px; }
    .task-header h3 { margin: 0; font-size: 16px; flex: 1; }
    .task-filters { display: flex; gap: 4px; }
    .filter-btn { padding: 6px 12px; background: transparent; border: 1px solid #D9D9D9; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 150ms ease; position: relative; }
    .filter-btn:hover { background: #F4F4F4; }
    .filter-btn.active { background: #0076B6; color: white; border-color: #0076B6; }
    .filter-badge { display: inline-block; margin-left: 6px; padding: 1px 6px; background: #C62828; color: white; border-radius: 10px; font-size: 10px; font-weight: bold; }
    .filter-btn.active .filter-badge { background: rgba(255,255,255,0.3); }
    .btn-add-task { padding: 6px 10px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .btn-add-task:hover { background: #005A8C; }
    .task-content { flex: 1; overflow-y: auto; }
    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; color: #999; }
    .empty-state i { font-size: 48px; margin-bottom: 16px; }
    .empty-state p { margin: 0; font-size: 14px; }
  `]
})
export class TaskListComponent implements OnInit, OnChanges {
  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;

  public tasks: TaskEntity[] = [];
  public filteredTasks: TaskEntity[] = [];
  public filterStatus: 'all' | 'active' | 'overdue' | 'completed' = 'all';
  public isTaskModalVisible = false;
  public selectedTask?: TaskEntity;

  constructor(private dialogService: DialogService) {}

  ngOnInit() {
    this.loadTasks();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['conversationId'] && !changes['conversationId'].firstChange) {
      this.loadTasks();
    }
  }

  private async loadTasks(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<TaskEntity>({
        EntityName: 'MJ: Tasks',
        ExtraFilter: `ConversationDetailID='${this.conversationId}'`,
        OrderBy: 'Status ASC, DueAt ASC, __mj_CreatedAt ASC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        this.tasks = result.Results || [];
        this.applyFilter();
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  applyFilter(): void {
    if (this.filterStatus === 'all') {
      this.filteredTasks = this.sortTasks(this.tasks);
    } else if (this.filterStatus === 'active') {
      this.filteredTasks = this.sortTasks(this.tasks.filter(t => t.Status !== 'Complete'));
    } else if (this.filterStatus === 'overdue') {
      this.filteredTasks = this.sortTasks(this.tasks.filter(t => this.isTaskOverdue(t)));
    } else {
      this.filteredTasks = this.sortTasks(this.tasks.filter(t => t.Status === 'Complete'));
    }
  }

  private isTaskOverdue(task: TaskEntity): boolean {
    if (!task.DueAt || task.Status === 'Complete') {
      return false;
    }
    const now = new Date();
    const dueDate = new Date(task.DueAt);
    return dueDate.getTime() < now.getTime();
  }

  private sortTasks(tasks: TaskEntity[]): TaskEntity[] {
    return [...tasks].sort((a, b) => {
      const aOverdue = this.isTaskOverdue(a);
      const bOverdue = this.isTaskOverdue(b);

      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      if (a.DueAt && b.DueAt) {
        return new Date(a.DueAt).getTime() - new Date(b.DueAt).getTime();
      }

      if (a.DueAt && !b.DueAt) return -1;
      if (!a.DueAt && b.DueAt) return 1;

      return 0;
    });
  }

  getOverdueCount(): number {
    return this.tasks.filter(t => this.isTaskOverdue(t)).length;
  }

  async onToggleStatus(task: TaskEntity): Promise<void> {
    try {
      task.Status = task.Status === 'Complete' ? 'In Progress' : 'Complete';
      await task.Save();
      this.applyFilter();
    } catch (error) {
      console.error('Failed to update task status:', error);
      await this.dialogService.alert('Error', 'Failed to update task status');
    }
  }

  onAddTask(): void {
    this.selectedTask = undefined;
    this.isTaskModalVisible = true;
  }

  onEditTask(task: TaskEntity): void {
    this.selectedTask = task;
    this.isTaskModalVisible = true;
  }

  async onDeleteTask(task: TaskEntity): Promise<void> {
    const confirmed = await this.dialogService.confirm({
      title: 'Delete Task',
      message: `Delete task "${task.Name}"?`,
      okText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      const deleted = await task.Delete();
      if (deleted) {
        await this.loadTasks();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      await this.dialogService.alert('Error', 'Failed to delete task');
    }
  }

  onTaskSaved(task: TaskEntity): void {
    this.isTaskModalVisible = false;
    this.selectedTask = undefined;
    this.loadTasks();
  }

  onTaskModalCancelled(): void {
    this.isTaskModalVisible = false;
    this.selectedTask = undefined;
  }
}