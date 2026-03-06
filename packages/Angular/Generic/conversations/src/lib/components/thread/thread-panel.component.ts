import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { DataCacheService } from '../../services/data-cache.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Side panel component for displaying and managing threaded message replies
 * Shows parent message at top with all replies in chronological order
 */
@Component({
  standalone: false,
  selector: 'mj-thread-panel',
  templateUrl: './thread-panel.component.html',
  styleUrls: ['./thread-panel.component.css']
})
export class ThreadPanelComponent implements OnInit, OnDestroy {
  @Input() parentMessageId!: string;
  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;

  @Output() closed = new EventEmitter<void>();
  @Output() replyAdded = new EventEmitter<MJConversationDetailEntity>();

  public parentMessage: MJConversationDetailEntity | null = null;
  public replies: MJConversationDetailEntity[] = [];
  public replyText: string = '';
  public isLoading: boolean = false;
  public isSending: boolean = false;
  public errorMessage: string = '';

  private destroy$ = new Subject<void>();

  constructor(
    private dataCache: DataCacheService,
    private cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadThreadData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads the parent message and all replies
   */
  private async loadThreadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Load parent message from cache
      const parent = await this.dataCache.getConversationDetail(this.parentMessageId, this.currentUser);

      if (!parent) {
        this.errorMessage = 'Failed to load parent message';
        this.isLoading = false;
        return;
      }

      this.parentMessage = parent;

      // Load all replies
      await this.loadReplies();
    } catch (error) {
      console.error('Error loading thread data:', error);
      this.errorMessage = 'Error loading thread. Please try again.';
    } finally {
      this.isLoading = false;
      this.cdRef.detectChanges();
    }
  }

  /**
   * Loads all replies for the parent message
   */
  private async loadReplies(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJConversationDetailEntity>(
        {
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ParentID='${this.parentMessageId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.replies = result.Results || [];
      } else {
        console.error('Failed to load replies:', result.ErrorMessage);
        this.errorMessage = 'Failed to load replies';
      }
    } catch (error) {
      console.error('Error loading replies:', error);
      this.errorMessage = 'Error loading replies';
    }
  }

  /**
   * Handles sending a new reply
   */
  async onSendReply(): Promise<void> {
    if (!this.canSendReply) return;

    this.isSending = true;
    this.errorMessage = '';

    try {
      const reply = await this.dataCache.createConversationDetail(this.currentUser);

      reply.ConversationID = this.conversationId;
      reply.ParentID = this.parentMessageId;
      reply.Message = this.replyText.trim();
      reply.Role = 'User';

      const saved = await reply.Save();

      if (saved) {
        // Add to local list
        this.replies = [...this.replies, reply];
        this.replyText = '';

        // Emit event to parent
        this.replyAdded.emit(reply);

        // Update parent message thread count
        if (this.parentMessage) {
          (this.parentMessage as any).ThreadCount = ((this.parentMessage as any).ThreadCount || 0) + 1; // TODO: ThreadCount field doesn't exist on MJConversationDetailEntity yet
        }

        this.cdRef.detectChanges();
      } else {
        console.error('Failed to save reply:', reply.LatestResult?.Message);
        this.errorMessage = 'Failed to send reply. Please try again.';
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      this.errorMessage = 'Error sending reply. Please try again.';
    } finally {
      this.isSending = false;
      this.cdRef.detectChanges();
    }
  }

  /**
   * Handles closing the thread panel
   */
  onClose(): void {
    this.closed.emit();
  }

  /**
   * Gets the display text for a message
   */
  getMessageText(message: MJConversationDetailEntity): string {
    return message.Message || '';
  }

  /**
   * Gets the timestamp display for a message
   */
  getMessageTime(message: MJConversationDetailEntity): string {
    if (!message.__mj_CreatedAt) return '';

    const date = new Date(message.__mj_CreatedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Gets the sender name for a message
   */
  getSenderName(message: MJConversationDetailEntity): string {
    if (message.Role === 'AI') return 'AI Assistant';
    return message.User || 'User';
  }

  /**
   * Checks if current user can send reply
   */
  get canSendReply(): boolean {
    return !this.isSending && !this.isLoading && this.replyText.trim().length > 0;
  }

  /**
   * Gets the reply count text
   */
  get replyCountText(): string {
    const count = this.replies.length;
    return count === 1 ? '1 reply' : `${count} replies`;
  }
}
