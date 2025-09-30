import { Component, Input, OnInit } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'mj-conversation-list',
  template: `
    <div class="conversation-list">
      <div class="list-header">
        <input
          type="text"
          class="search-input"
          placeholder="Search conversations..."
          (input)="onSearch($event)">
        <button class="btn-new" title="New Conversation">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <div class="list-content">
        <div *ngFor="let conversation of (conversations$ | async)"
             class="conversation-item"
             [class.active]="conversation.ID === (activeConversationId$ | async)"
             (click)="selectConversation(conversation)">
          <div class="conversation-icon">
            <i class="fas fa-comments"></i>
          </div>
          <div class="conversation-info">
            <div class="conversation-name">{{ conversation.Name }}</div>
            <div class="conversation-preview">{{ conversation.Description || 'No description' }}</div>
          </div>
          <div class="conversation-meta">
            <i *ngIf="conversation.IsPinned" class="fas fa-thumbtack pinned-icon"></i>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .conversation-list { display: flex; flex-direction: column; height: 100%; }
    .list-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; gap: 8px; }
    .search-input { flex: 1; padding: 8px 12px; border: 1px solid #D9D9D9; border-radius: 6px; }
    .btn-new { padding: 8px 12px; background: #0076B6; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .btn-new:hover { background: #005A8C; }
    .list-content { flex: 1; overflow-y: auto; }
    .conversation-item { padding: 12px 16px; border-bottom: 1px solid #F4F4F4; cursor: pointer; display: flex; gap: 12px; align-items: center; }
    .conversation-item:hover { background: #F4F4F4; }
    .conversation-item.active { background: #AAE7FD; }
    .conversation-icon { width: 36px; height: 36px; border-radius: 50%; background: #0076B6; color: white; display: flex; align-items: center; justify-content: center; }
    .conversation-info { flex: 1; min-width: 0; }
    .conversation-name { font-weight: 600; font-size: 14px; }
    .conversation-preview { font-size: 12px; color: #AAA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-meta { flex-shrink: 0; }
    .pinned-icon { color: #0076B6; }
  `]
})
export class ConversationListComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public conversations$!: Observable<ConversationEntity[]>;
  public activeConversationId$!: Observable<string | null>;

  constructor(private conversationState: ConversationStateService) {}

  ngOnInit() {
    this.conversations$ = this.conversationState.filteredConversations$;
    this.activeConversationId$ = this.conversationState.activeConversationId$;
  }

  selectConversation(conversation: ConversationEntity): void {
    this.conversationState.setActiveConversation(conversation.ID);
  }

  onSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.conversationState.setSearchQuery(query);
  }
}