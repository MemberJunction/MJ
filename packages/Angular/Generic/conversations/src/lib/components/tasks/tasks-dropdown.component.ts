import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Enhanced tasks dropdown component for chat header.
 * Shows ALL active tasks across ALL conversations, grouped by current vs other
 */
@Component({
  selector: 'mj-tasks-dropdown',
  template: `
    <div class="tasks-dropdown-container">
      <button
        class="active-tasks-btn"
        (click)="toggleDropdown()"
        [class.active]="isOpen"
        [class.has-tasks]="allTasks.length > 0"
        [title]="allTasks.length > 0 ? allTasks.length + ' active task' + (allTasks.length > 1 ? 's' : '') : 'View tasks'">
        <span class="task-count-badge" *ngIf="allTasks.length > 0">{{ allTasks.length }}</span>
      </button>

      <div class="active-tasks-dropdown" *ngIf="isOpen">
        <div class="dropdown-header">
          <div class="header-left">
            <i class="fas fa-circle-notch fa-spin" *ngIf="allTasks.length > 0"></i>
            <i class="fas fa-tasks" *ngIf="allTasks.length === 0"></i>
            <span>Active Tasks ({{ allTasks.length }})</span>
          </div>
          <button class="close-btn" (click)="closeDropdown()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="dropdown-content">
          <!-- Current Conversation Tasks -->
          <div class="section" *ngIf="currentConversationTasks.length > 0">
            <div class="section-header">
              <i class="fas fa-comment"></i>
              <span>Current Conversation ({{ currentConversationTasks.length }})</span>
            </div>
            <div class="active-task-item"
                 *ngFor="let task of currentConversationTasks"
                 (click)="onTaskClick(task)">
              <div class="task-status-indicator active"></div>
              <div class="task-content">
                <div class="task-title">
                  <img *ngIf="getAgentLogoUrl(task.agentName)"
                       [src]="getAgentLogoUrl(task.agentName)"
                       class="agent-logo"
                       [alt]="task.agentName" />
                  <i *ngIf="!getAgentLogoUrl(task.agentName)"
                     [class]="getAgentIconClass(task.agentName)"></i>
                  {{ task.agentName }}
                </div>
                <div class="task-status-text">{{ getTrimmedStatus(task.status) }}</div>
                <div class="task-elapsed">{{ getElapsedTime(task) }}</div>
              </div>
            </div>
          </div>

          <!-- Other Conversations Tasks -->
          <div class="section" *ngIf="otherConversationTasks.length > 0">
            <div class="section-header">
              <i class="fas fa-comments"></i>
              <span>Other Conversations ({{ otherConversationTasks.length }})</span>
            </div>
            <div class="active-task-item clickable"
                 *ngFor="let task of otherConversationTasks"
                 (click)="onTaskClick(task)">
              <div class="task-status-indicator active"></div>
              <div class="task-content">
                <div class="task-title">
                  <img *ngIf="getAgentLogoUrl(task.agentName)"
                       [src]="getAgentLogoUrl(task.agentName)"
                       class="agent-logo"
                       [alt]="task.agentName" />
                  <i *ngIf="!getAgentLogoUrl(task.agentName)"
                     [class]="getAgentIconClass(task.agentName)"></i>
                  {{ task.agentName }}
                  <span class="go-btn">
                    <i class="fas fa-arrow-right"></i>
                  </span>
                </div>
                <div class="task-conversation" *ngIf="task.conversationName">
                  <i class="fas fa-message"></i>
                  {{ task.conversationName }}
                </div>
                <div class="task-status-text">{{ getTrimmedStatus(task.status) }}</div>
                <div class="task-elapsed">{{ getElapsedTime(task) }}</div>
              </div>
            </div>
          </div>

          <!-- No Tasks State -->
          <div *ngIf="allTasks.length === 0" class="no-tasks">
            <i class="fas fa-check-circle"></i>
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
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: all 0.2s;
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
      padding: 2px 5px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      min-width: 18px;
      text-align: center;
      line-height: 1;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
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
      min-width: 420px;
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
      transition: all 0.2s ease;
    }

    .active-task-item.clickable {
      cursor: pointer;
    }

    .active-task-item.clickable:hover {
      background: #EEF2FF;
      border-color: #C7D2FE;
      transform: translateX(2px);
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

    .task-title .agent-logo {
      width: 14px;
      height: 14px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .go-btn {
      margin-left: auto;
      color: #3B82F6;
      font-size: 10px;
      opacity: 0.7;
    }

    .active-task-item.clickable:hover .go-btn {
      opacity: 1;
    }

    .task-conversation {
      font-size: 11px;
      color: #9CA3AF;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .task-conversation i {
      font-size: 10px;
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
      color: #10B981;
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
export class TasksDropdownComponent implements OnInit, OnDestroy {
  @Input() currentUser!: UserInfo;
  @Input() conversationId: string | null = null;
  @Output() taskClicked = new EventEmitter<ActiveTask>();
  @Output() navigateToConversation = new EventEmitter<{conversationId: string; taskId: string}>();

  public isOpen: boolean = false;
  public allTasks: ActiveTask[] = [];
  public currentConversationTasks: ActiveTask[] = [];
  public otherConversationTasks: ActiveTask[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private activeTasksService: ActiveTasksService
  ) {}

  ngOnInit() {
    // Subscribe to ALL active tasks across ALL conversations
    this.activeTasksService.tasks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        this.allTasks = tasks;
        this.groupTasks();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private groupTasks(): void {
    this.currentConversationTasks = this.allTasks.filter(
      task => task.conversationId === this.conversationId
    );

    this.otherConversationTasks = this.allTasks.filter(
      task => task.conversationId && task.conversationId !== this.conversationId
    );
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
  }

  closeDropdown(): void {
    this.isOpen = false;
  }

  onTaskClick(task: ActiveTask): void {
    // If task is from another conversation, emit navigation event
    if (task.conversationId && task.conversationId !== this.conversationId) {
      this.navigateToConversation.emit({
        conversationId: task.conversationId,
        taskId: task.id
      });
    }

    this.taskClicked.emit(task);
    this.closeDropdown();
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
    const maxLength = 50;
    if (status.length <= maxLength) {
      return status;
    }
    return status.substring(0, maxLength) + '...';
  }

  /**
   * Get agent icon class by looking up agent in AIEngineBase cache
   * Similar to message-item component's aiAgentInfo getter
   */
  getAgentIconClass(agentName: string): string {
    // Look up agent from AIEngineBase cache by name
    if (AIEngineBase.Instance?.Agents) {
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);
      if (agent?.IconClass) {
        return agent.IconClass;
      }
    }

    // Default fallback icon
    return 'fas fa-robot';
  }

  /**
   * Get agent logo URL by looking up agent in AIEngineBase cache
   * Returns null if no logo URL is available
   */
  getAgentLogoUrl(agentName: string): string | null {
    // Look up agent from AIEngineBase cache by name
    if (AIEngineBase.Instance?.Agents) {
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);
      if (agent?.LogoURL) {
        return agent.LogoURL;
      }
    }

    return null;
  }
}
