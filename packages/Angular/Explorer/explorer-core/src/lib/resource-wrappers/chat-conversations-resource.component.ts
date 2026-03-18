import { Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { BaseChatResource, CHAT_RESOURCE_TEMPLATE, CHAT_RESOURCE_STYLES } from './base-chat-resource';

/**
 * Chat Conversations Resource — the standard MJ Chat application.
 *
 * Extends BaseChatResource which contains all sidebar, URL, conversation CRUD,
 * engine initialization, and navigation logic. This subclass only provides:
 * - The UserSettings key for sidebar state persistence
 * - Resource display name and icon
 */
@RegisterClass(BaseResourceComponent, 'ChatConversationsResource')
@Component({
  standalone: false,
  selector: 'mj-chat-conversations-resource',
  template: CHAT_RESOURCE_TEMPLATE,
  styles: [CHAT_RESOURCE_STYLES],
  encapsulation: ViewEncapsulation.None
})
export class ChatConversationsResource extends BaseChatResource {
  protected get SidebarSettingKey(): string {
    return 'Conversations.SidebarState';
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    if (data.Configuration?.conversationId) {
      return `Conversation: ${(data.Configuration.conversationId as string).substring(0, 8)}...`;
    }
    return 'Conversations';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-comments';
  }
}
