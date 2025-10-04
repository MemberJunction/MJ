import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NavigationTab } from '../../models/conversation-state.model';

@Component({
  selector: 'mj-conversation-navigation',
  template: `
    <div class="conversation-navigation">
      <div class="nav-left">
        <button class="nav-btn sidebar-toggle" (click)="sidebarToggled.emit()">
          <i class="fas fa-bars"></i>
        </button>
        <h1 class="nav-title">Conversations</h1>
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
          <span>Libraries</span>
        </button>
      </div>
      <div class="nav-right">
        <button class="nav-btn search-btn" (click)="searchTriggered.emit()" title="Search (Ctrl+K)">
          <i class="fas fa-search"></i>
        </button>
        <button class="nav-btn">
          <i class="fas fa-cog"></i>
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
  `]
})
export class ConversationNavigationComponent {
  @Input() activeTab: NavigationTab = 'conversations';
  @Input() environmentId!: string;
  @Output() tabChanged = new EventEmitter<NavigationTab>();
  @Output() sidebarToggled = new EventEmitter<void>();
  @Output() searchTriggered = new EventEmitter<void>();
}