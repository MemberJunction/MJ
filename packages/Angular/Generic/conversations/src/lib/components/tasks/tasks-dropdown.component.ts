import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, DoCheck } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { TaskEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Enhanced tasks dropdown component for chat header.
 * Shows both:
 * 1. Active (running) tasks from ActiveTasksService
 * 2. Database tasks for the current conversation
 */
@Component({
  selector: 'mj-tasks-dropdown',
  template: `
    <div class="tasks-dropdown-container">
      <button
        class="active-tasks-btn"
        (click)="toggleDropdown()"
        [class.active]="isOpen"
        title="View tasks">
        <i class="fas fa-tasks"></i>
        <span>Tasks</span>
        <span class="task-count-badge" *ngIf="totalTaskCount > 0">{{ totalTaskCount }}</span>
      </button>

      <div class="active-tasks-dropdown" *ngIf="isOpen">
        <div class="dropdown-header">
          <div class="header-left">
            <i class="fas fa-tasks"></i>
            <span>Tasks</span>
          </div>
          <button class="close-btn" (click)="closeDropdown()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="dropdown-content">
          <!-- Active Running Tasks Section -->
          <div class="section" *ngIf="activeTasks.length > 0">
            <div class="section-header">
              <i class="fas fa-circle-notch fa-spin"></i>
              <span>Active ({{ activeTasks.length }})</span>
            </div>
            <div class="active-task-item" *ngFor="let task of activeTasks">
              <div class="task-status-indicator active"></div>
              <div class="task-content">
                <div class="task-title">
                  <i class="fas fa-robot"></i>
                  {{ task.agentName }}
                </div>
                <div class="task-status-text">{{ getTrimmedStatus(task.status) }}</div>
                <div class="task-elapsed">{{ getElapsedTime(task) }}</div>
              </div>
            </div>
          </div>

          <!-- Database Tasks Section -->
          <div class="section" *ngIf="dbTasks.length > 0">
            <div class="section-header">
              <i class="fas fa-list-check"></i>
              <span>In Progress ({{ dbTasks.length }})</span>
            </div>
            <mj-task-widget
              *ngFor="let task of dbTasks"
              [task]="task"
              [compact]="true"
              [clickable]="true"
              [showProgress]="true"
              [showDuration]="false"
              (taskClick)="onTaskClick($event)">
            </mj-task-widget>
          </div>

          <!-- No Tasks State -->
          <div *ngIf="activeTasks.length === 0 && dbTasks.length === 0" class="no-tasks">
            <i class="fas fa-tasks"></i>
            <p>No active tasks</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tasks-dropdown-container {
      position: relative;
    }

    .active-tasks-btn {
      background: transparent;
      color: #6B7280;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #E5E7EB;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .active-tasks-btn:hover {
      background: #F9FAFB;
      color: #111827;
    }

    .active-tasks-btn.active {
      background: #F9FAFB;
      color: #111827;
    }

    .task-count-badge {
      background: #EF4444;
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      min-width: 18px;
      text-align: center;
    }

    .active-tasks-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      min-width: 400px;
      max-width: 500px;
    }

    .dropdown-header {
      padding: 12px 16px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #111827;
    }

    .header-left i {
      color: var(--accent, #1e40af);
    }

    .close-btn {
      background: none;
      border: none;
      color: #6B7280;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .close-btn:hover {
      background: #F3F4F6;
      color: #111827;
    }

    .dropdown-content {
      max-height: 500px;
      overflow-y: auto;
    }

    .section {
      padding: 12px;
      border-bottom: 1px solid #F3F4F6;
    }

    .section:last-child {
      border-bottom: none;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      padding: 0 4px;
    }

    .section-header i {
      font-size: 11px;
    }

    .active-task-item {
      display: flex;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 6px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      margin-bottom: 8px;
    }

    .active-task-item:last-child {
      margin-bottom: 0;
    }

    .task-status-indicator {
      width: 4px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .task-status-indicator.active {
      background: #3B82F6;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .task-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .task-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .task-title i {
      color: #3B82F6;
      font-size: 12px;
    }

    .task-status-text {
      font-size: 12px;
      color: #6B7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-elapsed {
      font-size: 11px;
      color: #3B82F6;
      font-weight: 600;
    }

    .no-tasks {
      padding: 40px 16px;
      text-align: center;
      color: #9CA3AF;
    }

    .no-tasks i {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .no-tasks p {
      margin: 0;
      font-size: 14px;
    }

    mj-task-widget {
      display: block;
      margin-bottom: 8px;
    }

    mj-task-widget:last-child {
      margin-bottom: 0;
    }

    /* Mobile adjustments: 481px - 768px */
    @media (max-width: 768px) {
      .active-tasks-btn {
        padding: 6px 10px;
        font-size: 12px;
      }

      .active-tasks-dropdown {
        position: fixed;
        top: auto;
        right: 8px;
        left: 8px;
        bottom: 8px;
        min-width: unset;
        max-width: unset;
        max-height: 60vh;
      }

      .dropdown-header {
        padding: 10px 12px;
      }

      .dropdown-content {
        max-height: calc(60vh - 48px);
      }

      .section {
        padding: 10px;
      }

      .section-header {
        font-size: 11px;
        margin-bottom: 10px;
      }

      .active-task-item {
        padding: 8px 10px;
      }

      .task-title {
        font-size: 13px;
      }

      .task-status-text {
        font-size: 11px;
      }

      .task-elapsed {
        font-size: 10px;
      }
    }

    /* Small Phone adjustments: <= 480px */
    @media (max-width: 480px) {
      .active-tasks-btn {
        padding: 4px 8px;
        font-size: 11px;
      }

      .active-tasks-dropdown {
        right: 4px;
        left: 4px;
        bottom: 4px;
        max-height: 70vh;
      }

      .dropdown-header {
        padding: 8px 10px;
      }

      .header-left {
        font-size: 13px;
      }

      .dropdown-content {
        max-height: calc(70vh - 44px);
      }

      .section {
        padding: 8px;
      }

      .section-header {
        font-size: 10px;
        margin-bottom: 8px;
      }

      .active-task-item {
        padding: 6px 8px;
        gap: 8px;
      }

      .task-title {
        font-size: 12px;
      }

      .task-status-text {
        font-size: 10px;
      }

      .task-elapsed {
        font-size: 9px;
      }

      .no-tasks {
        padding: 30px 12px;
      }

      .no-tasks i {
        font-size: 28px;
      }

      .no-tasks p {
        font-size: 13px;
      }
    }
  `]
})
export class TasksDropdownComponent implements OnInit, OnDestroy, DoCheck {
  @Input() currentUser!: UserInfo;
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  public isOpen: boolean = false;
  public activeTasks: ActiveTask[] = [];
  public dbTasks: TaskEntity[] = [];
  public totalTaskCount: number = 0;

  private previousConversationId: string | null = null;
  private destroy$ = new Subject<void>();
  private _pollingIntervalObject: any = null;
  private _enablePolling: boolean = false;
  private _pollingInterval: number = 30000; // default to 30 seconds

  constructor(
    private conversationState: ConversationStateService,
    private activeTasksService: ActiveTasksService
  ) {}

  public get enablePolling(): boolean {
    return this._enablePolling;
  }
  public set enablePolling(value: boolean) {
    this._enablePolling = value;
    if (value) {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  public get pollingInterval(): number {
    return this._pollingInterval;
  }
  public set pollingInterval(value: number) {
    this._pollingInterval = value;
    if (this.enablePolling) {
      this.stopPolling();
      this.startPolling();
    }
  }

  ngOnInit() {
    // Subscribe to active tasks from the service
    this.activeTasksService.tasks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        this.activeTasks = tasks;
        this.updateTotalCount();
      });

    // Initial load if there's an active conversation
    if (this.conversationState.activeConversationId) {
      this.loadDatabaseTasks();
    }

    // Poll for task updates every 3 seconds when conversation is active
    if (this.enablePolling) {
      this.startPolling();
    }
  }

  private startPolling(): void {
    // if we already have a polling interval, do nothing
    if (this._pollingIntervalObject) {
      return;
    }

    this._pollingIntervalObject = setInterval(() => {
      if (this.conversationState.activeConversationId) {
        this.loadDatabaseTasks();
      }
    }, 3000); // Poll every 3 seconds
  }

  private stopPolling(): void {
    if (this._pollingIntervalObject) {
      clearInterval(this._pollingIntervalObject);
      this._pollingIntervalObject = null;
    }
  }

  ngDoCheck() {
    // Detect conversation changes
    const currentId = this.conversationState.activeConversationId;
    if (currentId !== this.previousConversationId) {
      this.previousConversationId = currentId;
      if (currentId) {
        this.loadDatabaseTasks();
      } else {
        this.dbTasks = [];
        this.updateTotalCount();
      }
    }
  }

  ngOnDestroy() {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      // Refresh database tasks when opening
      this.loadDatabaseTasks();
    }
  }

  closeDropdown(): void {
    this.isOpen = false;
  }

  private updateTotalCount(): void {
    this.totalTaskCount = this.activeTasks.length + this.dbTasks.length;
  }

  private async loadDatabaseTasks(): Promise<void> {
    const activeId = this.conversationState.activeConversationId;
    if (!activeId) {
      return;
    }

    try {
      const rv = new RunView();

      // First get conversation details for this conversation
      const detailsResult = await rv.RunView<ConversationDetailEntity>(
        {
          EntityName: 'Conversation Details',
          ExtraFilter: `ConversationID='${activeId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (!detailsResult.Success || !detailsResult.Results || detailsResult.Results.length === 0) {
        this.dbTasks = [];
        this.updateTotalCount();
        return;
      }

      // Get all conversation detail IDs
      const detailIds = detailsResult.Results.map(d => `'${d.ID}'`).join(',');

      // Load tasks for these conversation details (only top-level active ones)
      const result = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `ConversationDetailID IN (${detailIds}) AND Status IN ('Pending', 'In Progress') AND ParentID IS NULL`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 50,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.dbTasks = result.Results || [];
        this.updateTotalCount();
      }
    } catch (error) {
      console.error('Failed to load database tasks:', error);
    }
  }

  getElapsedTime(task: ActiveTask): string {
    const elapsed = Date.now() - task.startTime;
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  getTrimmedStatus(status: string): string {
    const maxLength = 60;
    if (status.length <= maxLength) {
      return status;
    }
    return status.substring(0, maxLength) + '...';
  }

  onTaskClick(task: TaskEntity): void {
    this.taskClicked.emit(task);
    this.closeDropdown();
  }
}
