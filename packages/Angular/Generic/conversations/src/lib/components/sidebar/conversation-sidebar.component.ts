import { Component, Input, OnInit } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { NavigationTab } from '../../models/conversation-state.model';
import { ConversationStateService } from '../../services/conversation-state.service';

@Component({
  selector: 'mj-conversation-sidebar',
  template: `
    <div class="conversation-sidebar">
      <div *ngIf="activeTab === 'conversations'" class="sidebar-content">
        <mj-conversation-list
          [environmentId]="environmentId"
          [currentUser]="currentUser"
          [renamedConversationId]="renamedConversationId">
        </mj-conversation-list>
      </div>
      <div *ngIf="activeTab === 'collections'" class="sidebar-content">
        <mj-collection-tree
          [environmentId]="environmentId"
          [currentUser]="currentUser">
        </mj-collection-tree>
      </div>
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
export class ConversationSidebarComponent implements OnInit {
  @Input() activeTab: NavigationTab = 'conversations';
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() renamedConversationId: string | null = null;

  public activeConversationId: string | null = null;

  constructor(private conversationState: ConversationStateService) {}

  ngOnInit() {
    // Conversations are loaded by the conversation-list component
    // No need to load here or subscribe to active conversation
    // The conversation-list component handles its own state
  }
}