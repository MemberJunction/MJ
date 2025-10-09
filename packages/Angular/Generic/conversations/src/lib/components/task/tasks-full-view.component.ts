import { Component, Input, OnInit } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { TaskEntity, ConversationEntity } from '@memberjunction/core-entities';

/**
 * Full-page tasks view with comprehensive filtering
 * Shows all tasks across conversations the user has access to
 */
@Component({
  selector: 'mj-tasks-full-view',
  template: `
    <div class="tasks-full-view">
      <!-- Header -->
      <div class="tasks-header">
        <div class="header-left">
          <i class="fas fa-tasks"></i>
          <h1>Tasks</h1>
        </div>
        <div class="header-stats">
          <span class="stat">
            <span class="stat-value">{{ activeTaskCount }}</span>
            <span class="stat-label">Active</span>
          </span>
          <span class="stat">
            <span class="stat-value">{{ completedTaskCount }}</span>
            <span class="stat-label">Completed</span>
          </span>
          <span class="stat">
            <span class="stat-value">{{ totalTaskCount }}</span>
            <span class="stat-label">Total</span>
          </span>
        </div>
      </div>

      <!-- Filters -->
      <div class="tasks-filters">
        <div class="filter-section">
          <label class="filter-label">Status:</label>
          <div class="filter-buttons">
            <button
              class="filter-btn"
              [class.active]="statusFilter === 'active'"
              (click)="setStatusFilter('active')">
              <i class="fas fa-circle-notch"></i>
              Active
            </button>
            <button
              class="filter-btn"
              [class.active]="statusFilter === 'completed'"
              (click)="setStatusFilter('completed')">
              <i class="fas fa-check-circle"></i>
              Completed
            </button>
            <button
              class="filter-btn"
              [class.active]="statusFilter === 'all'"
              (click)="setStatusFilter('all')">
              <i class="fas fa-list"></i>
              All
            </button>
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-label">Assignment:</label>
          <div class="filter-buttons">
            <button
              class="filter-btn"
              [class.active]="assignmentFilter === 'all'"
              (click)="setAssignmentFilter('all')">
              <i class="fas fa-users"></i>
              All
            </button>
            <button
              class="filter-btn"
              [class.active]="assignmentFilter === 'ai'"
              (click)="setAssignmentFilter('ai')">
              <i class="fas fa-robot"></i>
              AI
            </button>
            <button
              class="filter-btn"
              [class.active]="assignmentFilter === 'human'"
              (click)="setAssignmentFilter('human')">
              <i class="fas fa-user"></i>
              Human
            </button>
          </div>
        </div>

        <div class="filter-section">
          <button
            class="refresh-btn"
            (click)="loadTasks()"
            [disabled]="isLoading">
            <i class="fas" [ngClass]="isLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
            Refresh
          </button>
        </div>
      </div>

      <!-- Tasks List -->
      <div class="tasks-content" *ngIf="!isLoading">
        <div class="tasks-list" *ngIf="filteredTasks.length > 0">
          <mj-task-widget
            *ngFor="let task of filteredTasks"
            [task]="task"
            [compact]="false"
            [clickable]="true"
            [showProgress]="true"
            [showDuration]="true"
            (taskClick)="onTaskClick($event)">
          </mj-task-widget>
        </div>

        <div class="no-tasks" *ngIf="filteredTasks.length === 0">
          <i class="fas fa-tasks"></i>
          <h3>No tasks found</h3>
          <p>{{ getNoTasksMessage() }}</p>
        </div>
      </div>

      <!-- Loading State -->
      <div class="tasks-loading" *ngIf="isLoading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading tasks...</span>
      </div>
    </div>
  `,
  styles: [`
    .tasks-full-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #F9FAFB;
    }

    .tasks-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 32px;
      background: white;
      border-bottom: 1px solid #E5E7EB;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left i {
      font-size: 28px;
      color: #3B82F6;
    }

    .header-left h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #111827;
    }

    .header-stats {
      display: flex;
      gap: 32px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
    }

    .stat-label {
      font-size: 12px;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }

    .tasks-filters {
      display: flex;
      gap: 32px;
      padding: 20px 32px;
      background: white;
      border-bottom: 1px solid #E5E7EB;
      align-items: center;
    }

    .filter-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .filter-label {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
    }

    .filter-buttons {
      display: flex;
      gap: 8px;
    }

    .filter-btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid #E5E7EB;
      background: white;
      color: #6B7280;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 150ms ease;
    }

    .filter-btn:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
    }

    .filter-btn.active {
      background: #3B82F6;
      border-color: #3B82F6;
      color: white;
    }

    .filter-btn i {
      font-size: 12px;
    }

    .refresh-btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid #E5E7EB;
      background: white;
      color: #3B82F6;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 150ms ease;
    }

    .refresh-btn:hover:not(:disabled) {
      background: #EFF6FF;
      border-color: #3B82F6;
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .tasks-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px;
    }

    .tasks-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .tasks-list mj-task-widget {
      display: block;
    }

    .no-tasks {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;
      color: #9CA3AF;
    }

    .no-tasks i {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    .no-tasks h3 {
      margin: 0 0 8px 0;
      font-size: 20px;
      color: #6B7280;
    }

    .no-tasks p {
      margin: 0;
      font-size: 14px;
      color: #9CA3AF;
    }

    .tasks-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      gap: 16px;
      color: #6B7280;
    }

    .tasks-loading i {
      font-size: 48px;
      color: #3B82F6;
    }

    .tasks-loading span {
      font-size: 16px;
      font-weight: 500;
    }
  `]
})
export class TasksFullViewComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public allTasks: TaskEntity[] = [];
  public filteredTasks: TaskEntity[] = [];
  public isLoading: boolean = false;

  public statusFilter: 'active' | 'completed' | 'all' = 'active';
  public assignmentFilter: 'all' | 'ai' | 'human' = 'all';

  public get activeTaskCount(): number {
    return this.allTasks.filter(t =>
      t.Status === 'Pending' || t.Status === 'In Progress'
    ).length;
  }

  public get completedTaskCount(): number {
    return this.allTasks.filter(t => t.Status === 'Complete').length;
  }

  public get totalTaskCount(): number {
    return this.allTasks.length;
  }

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
        this.applyFilters();
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
        this.applyFilters();
        console.log(`📋 Loaded ${this.allTasks.length} tasks across all conversations`);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      this.isLoading = false;
    }
  }

  public setStatusFilter(filter: 'active' | 'completed' | 'all'): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  public setAssignmentFilter(filter: 'all' | 'ai' | 'human'): void {
    this.assignmentFilter = filter;
    this.applyFilters();
  }

  private applyFilters(): void {
    let tasks = [...this.allTasks];

    // Status filter
    if (this.statusFilter === 'active') {
      tasks = tasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress');
    } else if (this.statusFilter === 'completed') {
      tasks = tasks.filter(t => t.Status === 'Complete');
    }

    // Assignment filter
    if (this.assignmentFilter === 'ai') {
      tasks = tasks.filter(t => t.AgentID != null);
    } else if (this.assignmentFilter === 'human') {
      tasks = tasks.filter(t => t.UserID != null);
    }

    this.filteredTasks = tasks;
  }

  public getNoTasksMessage(): string {
    if (this.statusFilter === 'active' && this.assignmentFilter === 'all') {
      return 'No active tasks at the moment';
    } else if (this.statusFilter === 'completed' && this.assignmentFilter === 'all') {
      return 'No completed tasks yet';
    } else if (this.assignmentFilter === 'ai') {
      return 'No AI tasks found with the current filters';
    } else if (this.assignmentFilter === 'human') {
      return 'No human tasks found with the current filters';
    }
    return 'No tasks match your current filters';
  }

  public onTaskClick(task: TaskEntity): void {
    console.log('Task clicked:', task);
    // TODO: Navigate to conversation or open task details
  }
}
