import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';

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
            [class.active]="filterStatus === 'completed'"
            (click)="filterStatus = 'completed'; applyFilter()">
            Completed
          </button>
        </div>
        <button class="btn-add-task" (click)="onAddTask()" title="Add Task">
          <i class="fas fa-plus"></i>
        </button>
      </div>

      <div class="task-content">
        <div *ngIf="filteredTasks.length === 0" class="empty-state">
          <i class="fas fa-tasks"></i>
          <p>No tasks found</p>
        </div>

        <div *ngFor="let task of filteredTasks">
          <mj-task-item
            [task]="task"
            (statusToggled)="onToggleStatus($event)"
            (editRequested)="onEditTask($event)"
            (deleteRequested)="onDeleteTask($event)">
          </mj-task-item>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .task-list { display: flex; flex-direction: column; height: 100%; background: white; }
    .task-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; align-items: center; gap: 12px; }
    .task-header h3 { margin: 0; font-size: 16px; flex: 1; }
    .task-filters { display: flex; gap: 4px; }
    .filter-btn { padding: 6px 12px; background: transparent; border: 1px solid #D9D9D9; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 150ms ease; }
    .filter-btn:hover { background: #F4F4F4; }
    .filter-btn.active { background: #0076B6; color: white; border-color: #0076B6; }
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
  public filterStatus: 'all' | 'active' | 'completed' = 'all';

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
      this.filteredTasks = this.tasks;
    } else if (this.filterStatus === 'active') {
      this.filteredTasks = this.tasks.filter(t => t.Status !== 'Complete');
    } else {
      this.filteredTasks = this.tasks.filter(t => t.Status === 'Complete');
    }
  }

  async onToggleStatus(task: TaskEntity): Promise<void> {
    try {
      task.Status = task.Status === 'Complete' ? 'In Progress' : 'Complete';
      await task.Save();
      this.applyFilter();
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  }

  async onAddTask(): Promise<void> {
    const name = prompt('Enter task name:');
    if (!name) return;

    try {
      const md = new Metadata();
      const task = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.currentUser);

      task.Name = name;
      task.ConversationDetailID = this.conversationId;
      task.Status = 'Pending';
      task.PercentComplete = 0;

      const saved = await task.Save();
      if (saved) {
        await this.loadTasks();
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('Failed to create task');
    }
  }

  async onEditTask(task: TaskEntity): Promise<void> {
    const name = prompt('Edit task name:', task.Name);
    if (!name || name === task.Name) return;

    try {
      task.Name = name;
      await task.Save();
    } catch (error) {
      console.error('Failed to update task:', error);
      alert('Failed to update task');
    }
  }

  async onDeleteTask(task: TaskEntity): Promise<void> {
    if (!confirm(`Delete task "${task.Name}"?`)) return;

    try {
      const deleted = await task.Delete();
      if (deleted) {
        await this.loadTasks();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  }
}