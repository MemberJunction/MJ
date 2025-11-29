import { Component, ViewEncapsulation } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { ConversationStateService } from '@memberjunction/ng-conversations';

export function LoadChatConversationsResource() {
  // Force inclusion in production builds (tree shaking workaround)
  // Using null placeholders since Angular DI provides actual instances
  const test = new ChatConversationsResource(null!, null!);
}

/**
 * Chat Conversations Resource - wraps the conversation chat area for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Displays conversation list sidebar + active conversation chat interface
 * Designed to work with the tab system for multi-tab conversation management
 */
@RegisterClass(BaseResourceComponent, 'ChatConversationsResource')
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
          [currentUser]="currentUser"
          (artifactLinkClicked)="onArtifactLinkClicked($event)">
        </mj-conversation-chat-area>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-conversations-container {
      display: flex;
      width: 100%;
      height: 100%;
      flex: 1;
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
export class ChatConversationsResource extends BaseResourceComponent {
  public currentUser: any = null;

  constructor(
    private navigationService: NavigationService,
    private conversationState: ConversationStateService
  ) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Check if we have navigation params to apply (e.g., from Collections linking here)
    this.applyNavigationParams();

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  /**
   * Apply navigation parameters from configuration.
   * This handles deep-linking from other resources (e.g., clicking a link in Collections).
   */
  private applyNavigationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    // Set pending artifact if provided (must be set before activating conversation)
    if (config.artifactId) {
      console.log('📎 Setting pending artifact from navigation:', config.artifactId);
      this.conversationState.pendingArtifactId = config.artifactId as string;
      this.conversationState.pendingArtifactVersionNumber = (config.versionNumber as number) || null;
    }

    // Activate the target conversation if specified
    if (config.conversationId) {
      console.log('💬 Setting active conversation from navigation:', config.conversationId);
      this.conversationState.setActiveConversation(config.conversationId as string);
    }
  }

  /**
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || EnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /**
   * Get the active conversation ID from configuration (if specified)
   */
  get activeConversationId(): string | undefined {
    return this.Data?.Configuration?.conversationId;
  }

  /**
   * Get the display name for chat conversations
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // If we have a specific conversation ID, we could load the conversation name
    // For now, just return a generic name
    if (data.Configuration?.conversationId) {
      return `Conversation: ${data.Configuration.conversationId.substring(0, 8)}...`;
    }
    return 'Conversations';
  }

  /**
   * Get the icon class for chat conversations
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comments';
  }

  /**
   * Handle navigation request from artifact viewer panel within the chat area.
   * Converts the link event to a generic navigation request and uses NavigationService.
   */
  onArtifactLinkClicked(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
  }): void {
    // Map the link type to the nav item name
    const navItemName = event.type === 'conversation' ? 'Conversations' : 'Collections';

    // Build configuration params to pass to the target resource
    const params: Record<string, unknown> = {};
    if (event.type === 'conversation') {
      params['conversationId'] = event.id;
    } else {
      params['collectionId'] = event.id;
    }

    // Include artifact info so destination can open it
    if (event.artifactId) {
      params['artifactId'] = event.artifactId;
      if (event.versionNumber) {
        params['versionNumber'] = event.versionNumber;
      }
    }

    // Navigate using the generic nav item method
    this.navigationService.OpenNavItemByName(navItemName, params);
  }
}
