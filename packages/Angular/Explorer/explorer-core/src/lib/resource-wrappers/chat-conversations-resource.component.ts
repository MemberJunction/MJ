import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';

export function LoadChatConversationsResource() {
  const test = new ChatConversationsResource(); // Force inclusion in production builds (tree shaking workaround)
}

/**
 * Chat Conversations Resource - wraps the conversation chat area for tab-based display
 * Displays conversation list sidebar + active conversation chat interface
 */
@Component({
  selector: 'mj-chat-conversations-resource',
  template: `
    <div class="chat-conversations-container">
      <!-- Left sidebar: Conversation list -->
      <div class="conversation-sidebar">
        <mj-conversation-list
          *ngIf="currentUser"
          [environmentId]="environmentId"
          [currentUser]="currentUser">
        </mj-conversation-list>
      </div>

      <!-- Main area: Chat interface -->
      <div class="conversation-main">
        <mj-conversation-chat-area
          *ngIf="currentUser"
          [environmentId]="environmentId"
          [currentUser]="currentUser">
        </mj-conversation-chat-area>
      </div>
    </div>
  `,
  styles: [`
    .chat-conversations-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .conversation-sidebar {
      width: 300px;
      flex-shrink: 0;
      border-right: 1px solid #e0e0e0;
      overflow-y: auto;
      background: #f5f5f5;
    }

    .conversation-main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
@RegisterClass(BaseResourceComponent, 'chat-conversations')
export class ChatConversationsResource extends BaseResourceComponent {
  public currentUser: any = null;

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || EnvironmentEntityExtended.DefaultEnvironmentID;
  }

  get activeConversationId(): string | undefined {
    return this.Data?.Configuration?.conversationId;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // If we have a specific conversation ID, we could load the conversation name
    // For now, just return a generic name
    if (data.Configuration?.conversationId) {
      return `Conversation: ${data.Configuration.conversationId.substring(0, 8)}...`;
    }
    return 'Conversations';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comments';
  }
}
