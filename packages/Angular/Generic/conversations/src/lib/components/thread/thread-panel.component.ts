import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
export class ThreadPanelComponent extends BaseAngularComponent implements OnInit, OnDestroy  {
  @Input() ParentMessageId!: string;

  /** @deprecated Use {@link ParentMessageId}. */
  @Input() set parentMessageId(value: string) {
    this.ParentMessageId = value;
  }
  /** @deprecated Use {@link ParentMessageId}. */
  get parentMessageId(): string {
    return this.ParentMessageId;
  }
  @Input() ConversationId!: string;

  /** @deprecated Use {@link ConversationId}. */
  @Input() set conversationId(value: string) {
    this.ConversationId = value;
  }
  /** @deprecated Use {@link ConversationId}. */
  get conversationId(): string {
    return this.ConversationId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;
  @Output() ReplyAdded = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link ReplyAdded}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (replyAdded) keeps working. Must stay AFTER ReplyAdded: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() replyAdded = this.ReplyAdded;

  public ParentMessage: MJConversationDetailEntity | null = null;

  /** @deprecated Use {@link ParentMessage}. */
  public get parentMessage(): MJConversationDetailEntity | null {
    return this.ParentMessage;
  }
  /** @deprecated Use {@link ParentMessage}. */
  public set parentMessage(value: MJConversationDetailEntity | null) {
    this.ParentMessage = value;
  }
  public Replies: MJConversationDetailEntity[] = [];

  /** @deprecated Use {@link Replies}. */
  public get replies(): MJConversationDetailEntity[] {
    return this.Replies;
  }
  /** @deprecated Use {@link Replies}. */
  public set replies(value: MJConversationDetailEntity[]) {
    this.Replies = value;
  }
  public ReplyText: string = '';

  /** @deprecated Use {@link ReplyText}. */
  public get replyText(): string {
    return this.ReplyText;
  }
  /** @deprecated Use {@link ReplyText}. */
  public set replyText(value: string) {
    this.ReplyText = value;
  }
  public isLoading: boolean = false;
  public IsSending: boolean = false;

  /** @deprecated Use {@link IsSending}. */
  public get isSending(): boolean {
    return this.IsSending;
  }
  /** @deprecated Use {@link IsSending}. */
  public set isSending(value: boolean) {
    this.IsSending = value;
  }
  public errorMessage: string = '';

  private destroy$ = new Subject<void>();

  constructor(
    private dataCache: DataCacheService,
    private cdRef: ChangeDetectorRef
  ) {
  super();}

  async ngOnInit() {
    this.dataCache.Provider = this.ProviderToUse;
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
      const parent = await this.dataCache.getConversationDetail(this.ParentMessageId, this.CurrentUser);

      if (!parent) {
        this.errorMessage = 'Failed to load parent message';
        this.isLoading = false;
        return;
      }

      this.ParentMessage = parent;

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
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJConversationDetailEntity>(
        {
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ParentID='${this.ParentMessageId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          ResultType: 'entity_object'
        },
        this.CurrentUser
      );

      if (result.Success) {
        this.Replies = result.Results || [];
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
  async OnSendReply(): Promise<void> {
    if (!this.CanSendReply) return;

    this.IsSending = true;
    this.errorMessage = '';

    try {
      const reply = await this.dataCache.createConversationDetail(this.CurrentUser);

      reply.ConversationID = this.ConversationId;
      reply.ParentID = this.ParentMessageId;
      reply.Message = this.ReplyText.trim();
      reply.Role = 'User';

      const saved = await reply.Save();

      if (saved) {
        // Add to local list
        this.Replies = [...this.Replies, reply];
        this.ReplyText = '';

        // Emit event to parent
        this.ReplyAdded.emit(reply);

        // Update parent message thread count
        if (this.ParentMessage) {
          (this.ParentMessage as any).ThreadCount = ((this.ParentMessage as any).ThreadCount || 0) + 1; // TODO: ThreadCount field doesn't exist on MJConversationDetailEntity yet
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
      this.IsSending = false;
      this.cdRef.detectChanges();
    }
  }

  /** @deprecated Use {@link OnSendReply}. */
  async onSendReply(): Promise<void> {
    return this.OnSendReply();
  }

  /**
   * Handles closing the thread panel
   */
  OnClose(): void {
    this.Closed.emit();
  }

  /** @deprecated Use {@link OnClose}. */
  onClose(): void {
    return this.OnClose();
  }

  /**
   * Gets the display text for a message
   */
  GetMessageText(message: MJConversationDetailEntity): string {
    return message.Message || '';
  }

  /** @deprecated Use {@link GetMessageText}. */
  getMessageText(message: MJConversationDetailEntity): string {
    return this.GetMessageText(message);
  }

  /**
   * Gets the timestamp display for a message
   */
  GetMessageTime(message: MJConversationDetailEntity): string {
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

  /** @deprecated Use {@link GetMessageTime}. */
  getMessageTime(message: MJConversationDetailEntity): string {
    return this.GetMessageTime(message);
  }

  /**
   * Gets the sender name for a message
   */
  GetSenderName(message: MJConversationDetailEntity): string {
    if (message.Role === 'AI') return 'AI Assistant';
    return message.User || 'User';
  }

  /** @deprecated Use {@link GetSenderName}. */
  getSenderName(message: MJConversationDetailEntity): string {
    return this.GetSenderName(message);
  }

  /**
   * Checks if current user can send reply
   */
  get CanSendReply(): boolean {
    return !this.IsSending && !this.isLoading && this.ReplyText.trim().length > 0;
  }

  /** @deprecated Use {@link CanSendReply}. */
  get canSendReply(): boolean {
    return this.CanSendReply;
  }

  /**
   * Gets the reply count text
   */
  get ReplyCountText(): string {
    const count = this.Replies.length;
    return count === 1 ? '1 reply' : `${count} replies`;
  }

  /** @deprecated Use {@link ReplyCountText}. */
  get replyCountText(): string {
    return this.ReplyCountText;
  }
}
