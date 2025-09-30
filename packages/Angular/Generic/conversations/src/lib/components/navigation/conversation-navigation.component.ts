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
          Conversations
        </button>
        <button
          class="nav-tab"
          [class.active]="activeTab === 'libraries'"
          (click)="tabChanged.emit('libraries')">
          Libraries
        </button>
      </div>
      <div class="nav-right">
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
      padding: 0 16px;
      gap: 24px;
      color: white;
    }
    .nav-left { display: flex; align-items: center; gap: 12px; }
    .nav-title { margin: 0; font-size: 18px; font-weight: 600; }
    .nav-tabs { display: flex; gap: 8px; flex: 1; }
    .nav-tab {
      padding: 8px 16px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      border-radius: 6px;
      transition: all 150ms ease;
    }
    .nav-tab:hover { background: rgba(255,255,255,0.1); color: white; }
    .nav-tab.active { background: rgba(255,255,255,0.2); color: white; }
    .nav-right { display: flex; gap: 8px; }
    .nav-btn {
      padding: 8px 12px;
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
      border-radius: 6px;
      transition: background 150ms ease;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.1); }
  `]
})
export class ConversationNavigationComponent {
  @Input() activeTab: NavigationTab = 'conversations';
  @Input() environmentId!: string;
  @Output() tabChanged = new EventEmitter<NavigationTab>();
  @Output() sidebarToggled = new EventEmitter<void>();
}