import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { TaskEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { Subject, takeUntil } from 'rxjs';

/**
 * Tasks dropdown component for chat header
 * Displays active tasks from the current conversation
 */
@Component({
  selector: 'mj-tasks-dropdown',
  template: `
    <div class="tasks-dropdown-container">
      <button
        class="active-tasks-btn"
        (click)="toggleDropdown()"
        [class.active]="isOpen"
        title="View active tasks">
        <i class="fas fa-tasks"></i>
        <span>Tasks</span>
        <span class="task-count-badge" *ngIf="taskCount > 0">{{ taskCount }}</span>
      </button>

      <div class="active-tasks-dropdown" *ngIf="isOpen">
        <div class="dropdown-header">
          <div class="header-left">
            <i class="fas fa-tasks"></i>
            <span>Active Tasks</span>
          </div>
          <button class="close-btn" (click)="closeDropdown()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="dropdown-content">
          <div *ngIf="tasks.length === 0" class="no-tasks">
            <i class="fas fa-tasks"></i>
            <p>No active tasks</p>
          </div>
          <div *ngFor="let task of tasks" class="task-item">
            <div class="task-status" [attr.data-status]="task.Status"></div>
            <div class="task-content">
              <div class="task-title">{{ task.Name }}</div>
              <div class="task-meta">
                <span class="task-progress" *ngIf="task.PercentComplete != null">
                  <i class="fas fa-chart-line"></i>
                  {{ task.PercentComplete }}%
                </span>
                <span class="task-assigned" *ngIf="task.User">
                  <i class="fas fa-user"></i>
                  {{ task.User }}
                </span>
                <span class="task-assigned" *ngIf="task.Agent">
                  <i class="fas fa-robot"></i>
                  {{ task.Agent }}
                </span>
              </div>
            </div>
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
      background: var(--gray-700, #374151);
      color: white;
      padding: 6px 12px;
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
      background: var(--gray-600, #4B5563);
    }

    .active-tasks-btn.active {
      background: var(--navy, #1e40af);
    }

    .task-count-badge {
      background: var(--navy, #1e40af);
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: bold;
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
      max-height: 400px;
      overflow-y: auto;
      padding: 8px;
    }

    .no-tasks {
      padding: 32px 16px;
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

    .task-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 4px;
      cursor: pointer;
      transition: background 150ms ease;
    }

    .task-item:hover {
      background: #F9FAFB;
    }

    .task-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 6px;
      flex-shrink: 0;
    }

    .task-status[data-status="Pending"] {
      background: #9CA3AF;
    }

    .task-status[data-status="In Progress"] {
      background: #3B82F6;
    }

    .task-status[data-status="Complete"] {
      background: #10B981;
    }

    .task-status[data-status="Blocked"] {
      background: #EF4444;
    }

    .task-status[data-status="Failed"] {
      background: #DC2626;
    }

    .task-status[data-status="Cancelled"], .task-status[data-status="Deferred"] {
      background: #6B7280;
    }

    .task-content {
      flex: 1;
      min-width: 0;
    }

    .task-title {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #6B7280;
    }

    .task-progress, .task-assigned {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .task-progress i, .task-assigned i {
      font-size: 10px;
    }
  `]
})
export class TasksDropdownComponent implements OnInit, OnDestroy {
  @Input() currentUser!: UserInfo;

  public isOpen: boolean = false;
  public tasks: TaskEntity[] = [];
  public taskCount: number = 0;
  private activeConversationId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(private conversationState: ConversationStateService) {}

  ngOnInit() {
    // Subscribe to active conversation changes
    this.conversationState.activeConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (conversation) => {
        this.activeConversationId = conversation?.ID || null;
        if (this.activeConversationId) {
          await this.loadTasks();
        } else {
          this.tasks = [];
          this.taskCount = 0;
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
  }

  closeDropdown(): void {
    this.isOpen = false;
  }

  private async loadTasks(): Promise<void> {
    if (!this.activeConversationId) {
      return;
    }

    try {
      const rv = new RunView();

      // First get conversation details for this conversation
      const detailsResult = await rv.RunView<ConversationDetailEntity>(
        {
          EntityName: 'Conversation Details',
          ExtraFilter: `ConversationID='${this.activeConversationId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (!detailsResult.Success || !detailsResult.Results || detailsResult.Results.length === 0) {
        this.tasks = [];
        this.taskCount = 0;
        return;
      }

      // Get all conversation detail IDs
      const detailIds = detailsResult.Results.map(d => `'${d.ID}'`).join(',');

      // Load tasks for these conversation details
      const result = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `ConversationDetailID IN (${detailIds}) AND Status IN ('Pending', 'In Progress')`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 50,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.tasks = result.Results || [];
        this.taskCount = this.tasks.length;
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }
}
