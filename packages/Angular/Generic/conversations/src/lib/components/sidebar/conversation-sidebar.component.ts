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
          [currentUser]="currentUser">
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

  public activeConversationId: string | null = null;

  constructor(private conversationState: ConversationStateService) {}

  ngOnInit() {
    // Load conversations when sidebar initializes
    if (this.activeTab === 'conversations') {
      this.loadConversations();
    }

    // Subscribe to active conversation for tasks view
    this.conversationState.activeConversation$.subscribe(conversation => {
      this.activeConversationId = conversation?.ID || null;
    });
  }

  private async loadConversations(): Promise<void> {
    try {
      const rv = new RunView();
      const filter = `EnvironmentID='${this.environmentId}' AND (IsArchived IS NULL OR IsArchived=0)`;

      const result = await rv.RunView<ConversationEntity>(
        {
          EntityName: 'Conversations',
          ExtraFilter: filter,
          OrderBy: 'IsPinned DESC, __mj_UpdatedAt DESC',
          MaxRows: 100,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.conversationState.setConversations(result.Results || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }
}