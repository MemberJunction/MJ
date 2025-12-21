import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NavigationTab } from '../../models/conversation-state.model';
import { UserInfo } from '@memberjunction/core';

@Component({
  standalone: false,
  selector: 'mj-conversation-navigation',
  template: `
    <div class="conversation-navigation">
      <div class="nav-left">
        <button class="nav-btn sidebar-toggle" (click)="sidebarToggled.emit()">
          <i class="fas fa-bars"></i>
        </button>
      </div>
      <div class="nav-tabs">
        <button
          class="nav-tab"
          [class.active]="activeTab === 'conversations'"
          (click)="tabChanged.emit('conversations')">
          <i class="fas fa-comments"></i>
          <span>Chats</span>
        </button>
        <button
          class="nav-tab"
          [class.active]="activeTab === 'collections'"
          (click)="tabChanged.emit('collections')">
          <i class="fas fa-folder"></i>
          <span>Collections</span>
        </button>
        <button
          class="nav-tab"
          [class.active]="activeTab === 'tasks'"
          (click)="tabChanged.emit('tasks')">
          <i class="fas fa-tasks"></i>
          <span>Tasks</span>
        </button>
      </div>
      <div class="nav-right">
        <mj-tasks-dropdown
          [currentUser]="currentUser"
          [conversationId]="conversationId"
          (navigateToConversation)="navigateToConversation.emit($event)">
        </mj-tasks-dropdown>
        <button class="nav-btn search-btn" (click)="searchTriggered.emit()" title="Search (Ctrl+K)">
          <i class="fas fa-search"></i>
        </button>
        <button class="nav-btn refresh-btn" (click)="refreshTriggered.emit()" title="Refresh agent cache">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .conversation-navigation {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 20px;
      gap: 24px;
      color: white;
    }
    .nav-left { display: flex; align-items: center; gap: 12px; }
    .nav-title { margin: 0; font-size: 18px; font-weight: 600; }
    .nav-tabs {
      display: flex;
      gap: 4px;
      flex: 1;
      height: 100%;
    }
    .nav-tab {
      padding: 0 20px;
      height: 100%;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      border-bottom: 3px solid transparent;
    }
    .nav-tab:hover {
      background: rgba(255,255,255,0.05);
      color: white;
    }
    .nav-tab.active {
      color: white;
      background: rgba(255,255,255,0.1);
      border-bottom-color: #AAE7FD;
    }
    .nav-right { display: flex; gap: 8px; }
    .nav-btn {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .nav-btn:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }
    .sidebar-toggle {
      display: flex;
    }

    /* Mobile adjustments: 481px - 768px */
    @media (max-width: 768px) {
      .conversation-navigation {
        padding: 0 12px;
        gap: 12px;
      }
      .sidebar-toggle {
        display: flex;
      }
      .nav-tab {
        padding: 0 12px;
        font-size: 13px;
        gap: 6px;
      }
      .nav-tab span {
        display: none;
      }
      .nav-tab i {
        font-size: 16px;
      }
      .nav-btn {
        width: 32px;
        height: 32px;
      }
      .nav-right {
        gap: 4px;
      }
    }

    /* Small Phone adjustments: <= 480px */
    @media (max-width: 480px) {
      .conversation-navigation {
        padding: 0 8px;
        gap: 8px;
      }
      .nav-tab {
        padding: 0 8px;
        font-size: 12px;
      }
      .nav-btn {
        width: 28px;
        height: 28px;
      }
      .nav-btn i {
        font-size: 14px;
      }
      .nav-right .nav-btn:last-child {
        display: none;
      }
    }
  `]
})
export class ConversationNavigationComponent {
  @Input() activeTab: NavigationTab = 'conversations';
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() conversationId: string | null = null;
  @Output() tabChanged = new EventEmitter<NavigationTab>();
  @Output() sidebarToggled = new EventEmitter<void>();
  @Output() searchTriggered = new EventEmitter<void>();
  @Output() refreshTriggered = new EventEmitter<void>();
  @Output() navigateToConversation = new EventEmitter<{conversationId: string; taskId: string}>();
}