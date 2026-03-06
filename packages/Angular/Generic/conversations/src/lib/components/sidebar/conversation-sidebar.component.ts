import { Component, Input, Output, EventEmitter } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { NavigationTab } from '../../models/conversation-state.model';

@Component({
  standalone: false,
  selector: 'mj-conversation-sidebar',
  template: `
    <div class="conversation-sidebar">
      @if (activeTab === 'conversations') {
        <div class="sidebar-content">
          <mj-conversation-list
            [environmentId]="environmentId"
            [currentUser]="currentUser"
            [selectedConversationId]="selectedConversationId"
            [renamedConversationId]="renamedConversationId"
            [isSidebarPinned]="isSidebarPinned"
            [isMobileView]="isMobileView"
            (conversationSelected)="conversationSelected.emit($event)"
            (newConversationRequested)="newConversationRequested.emit()"
            (pinSidebarRequested)="onPinSidebarRequested()"
            (unpinSidebarRequested)="onUnpinSidebarRequested()">
          </mj-conversation-list>
        </div>
      }
      @if (activeTab === 'collections') {
        <div class="sidebar-content">
          <mj-collection-tree
            [environmentId]="environmentId"
            [currentUser]="currentUser">
          </mj-collection-tree>
        </div>
      }
    </div>
    `,
  styles: [`
    .conversation-sidebar {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
    }
    .placeholder {
      padding: 24px;
      text-align: center;
      color: #AAA;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
    }
    .placeholder p {
      margin: 0;
      font-size: 14px;
    }
  `]
})
export class ConversationSidebarComponent {
  @Input() activeTab: NavigationTab = 'conversations';
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() selectedConversationId: string | null = null;
  @Input() renamedConversationId: string | null = null;
  @Input() isSidebarPinned: boolean = true;
  @Input() isMobileView: boolean = false;

  @Output() conversationSelected = new EventEmitter<string>();
  @Output() newConversationRequested = new EventEmitter<void>();
  @Output() pinSidebarRequested = new EventEmitter<void>();
  @Output() unpinSidebarRequested = new EventEmitter<void>();

  onPinSidebarRequested(): void {
    this.pinSidebarRequested.emit();
  }

  onUnpinSidebarRequested(): void {
    this.unpinSidebarRequested.emit();
  }
}