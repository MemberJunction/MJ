import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit
} from '@angular/core';
import { ConversationDetailEntity, ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Component for displaying a single message in a conversation
 * Follows the dynamic rendering pattern from skip-chat for optimal performance
 * This component is created dynamically via ViewContainerRef.createComponent()
 */
@Component({
  selector: 'mj-conversation-message-item',
  templateUrl: './message-item.component.html',
  styleUrls: ['./message-item.component.css']
})
export class MessageItemComponent extends BaseAngularComponent implements AfterViewInit, OnDestroy {
  @Input() public message!: ConversationDetailEntity;
  @Input() public conversation!: ConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public allMessages!: ConversationDetailEntity[];
  @Input() public isProcessing: boolean = false;

  @Output() public pinClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public editClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public artifactActionPerformed = new EventEmitter<{action: string; artifactId: string}>();
  @Output() public messageEdited = new EventEmitter<ConversationDetailEntity>();

  private _loadTime: number = Date.now();
  private _elapsedTimeInterval: any = null;
  public _elapsedTimeFormatted: string = '(0:00)';
  public inlineArtifacts: {id: string; versionId?: string}[] = [];
  public isEditing: boolean = false;
  public editedText: string = '';
  private originalText: string = '';

  constructor(private cdRef: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit() {
    this._loadTime = Date.now();
    this.startElapsedTimeUpdater();
    this.detectInlineArtifacts();
    this.cdRef.detectChanges();
  }

  ngOnDestroy() {
    if (this._elapsedTimeInterval !== null) {
      clearInterval(this._elapsedTimeInterval);
      this._elapsedTimeInterval = null;
    }
  }

  /**
   * Starts the elapsed time updater interval for temporary messages
   */
  private startElapsedTimeUpdater(): void {
    if (this.isTemporaryMessage) {
      Promise.resolve().then(() => {
        this._elapsedTimeFormatted = this.formatElapsedTime(this.elapsedTimeSinceLoad);
        this.cdRef.detectChanges();
      });

      if (this._elapsedTimeInterval === null) {
        this._elapsedTimeInterval = setInterval(() => {
          this._elapsedTimeFormatted = this.formatElapsedTime(this.elapsedTimeSinceLoad);
          Promise.resolve().then(() => {
            this.cdRef.detectChanges();
          });
        }, 1000);
      }
    }
  }

  private formatElapsedTime(elapsedTime: number): string {
    let seconds = Math.floor(elapsedTime / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    let formattedTime = (hours > 0 ? hours + ':' : '') +
      (minutes < 10 && hours > 0 ? '0' : '') + minutes + ':' +
      (seconds < 10 ? '0' : '') + seconds;
    return `(${formattedTime})`;
  }

  public get elapsedTimeSinceLoad(): number {
    return Date.now() - this._loadTime;
  }

  public get isAIMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'ai';
  }

  public get aiAgentInfo(): { name: string; iconClass: string } | null {
    if (!this.isAIMessage) return null;

    const agentID = (this.message as any).AgentID;
    if (!agentID) return null;

    // Look up agent from AIEngineBase cache
    const agent = AIEngineBase.Instance?.Agents?.find(a => a.ID === agentID);
    if (agent) {
      return {
        name: agent.Name || 'AI Assistant',
        iconClass: agent.IconClass || 'fa-robot'
      };
    }

    return null;
  }

  public get isUserMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'user';
  }

  public get isTemporaryMessage(): boolean {
    return this.isAIMessage && (!this.message.ID || this.message.ID.length === 0);
  }

  public get isFirstMessageInConversation(): boolean {
    return this.allMessages.indexOf(this.message) === 0;
  }

  public get isLastMessageInConversation(): boolean {
    return this.allMessages.indexOf(this.message) === this.allMessages.length - 1;
  }

  public get hasArtifact(): boolean {
    return !!this.message.ArtifactID && this.message.ArtifactID.length > 0;
  }

  public get messageClasses(): string {
    const classes: string[] = ['message-item'];
    if (this.isAIMessage) {
      classes.push('ai-message');
      if (this.isTemporaryMessage) {
        classes.push('in-progress');
      }
    } else if (this.isUserMessage) {
      classes.push('user-message');
    }
    if (this.message.IsPinned) {
      classes.push('pinned');
    }
    if (this.isEditing) {
      classes.push('editing');
    }
    return classes.join(' ');
  }

  public get isMessageEdited(): boolean {
    // Check if the message was updated after creation
    if (!this.message.__mj_CreatedAt || !this.message.__mj_UpdatedAt) {
      return false;
    }
    // Allow 1 second difference for rounding
    return this.message.__mj_UpdatedAt.getTime() - this.message.__mj_CreatedAt.getTime() > 1000;
  }

  public onPinClick(): void {
    if (!this.isProcessing) {
      this.pinClicked.emit(this.message);
    }
  }

  public onEditClick(): void {
    if (!this.isProcessing && !this.isEditing) {
      this.startEditing();
    }
  }

  public startEditing(): void {
    this.originalText = this.message.Message || '';
    this.editedText = this.originalText;
    this.isEditing = true;

    // Focus textarea after Angular renders it
    Promise.resolve().then(() => {
      const textarea = document.querySelector('.message-edit-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
      this.cdRef.detectChanges();
    });
  }

  public cancelEditing(): void {
    this.isEditing = false;
    this.editedText = '';
    this.originalText = '';
    this.cdRef.detectChanges();
  }

  public async saveEdit(): Promise<void> {
    if (!this.editedText.trim() || this.editedText === this.originalText) {
      this.cancelEditing();
      return;
    }

    try {
      // Update the message entity
      this.message.Message = this.editedText;
      const saveResult = await this.message.Save();

      if (saveResult) {
        this.isEditing = false;
        this.editedText = '';
        this.originalText = '';
        this.messageEdited.emit(this.message);
        this.detectInlineArtifacts(); // Re-detect artifacts in edited message
        this.cdRef.detectChanges();
      } else {
        console.error('Failed to save message edit');
        alert('Failed to save message. Please try again.');
      }
    } catch (error) {
      console.error('Error saving message edit:', error);
      alert('Error saving message. Please try again.');
    }
  }

  public onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditing();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEdit();
    }
  }

  public onDeleteClick(): void {
    if (!this.isProcessing) {
      this.deleteClicked.emit(this.message);
    }
  }

  public onArtifactClick(): void {
    if (this.hasArtifact) {
      this.artifactClicked.emit({
        artifactId: this.message.ArtifactID!,
        versionId: this.message.ArtifactVersionID || undefined
      });
    }
  }

  /**
   * Detects artifact references in message content
   * Looks for patterns like:
   * - artifact:abc-123-def
   * - artifact:abc-123-def:v2
   * - [artifact](artifact:abc-123-def)
   */
  private detectInlineArtifacts(): void {
    if (!this.message?.Message) {
      this.inlineArtifacts = [];
      return;
    }

    const artifacts: {id: string; versionId?: string}[] = [];
    const text = this.message.Message;

    // Pattern 1: artifact:id or artifact:id:vN
    const simplePattern = /artifact:([a-f0-9\-]+)(?::v(\d+))?/gi;
    let match;

    while ((match = simplePattern.exec(text)) !== null) {
      artifacts.push({
        id: match[1],
        versionId: match[2] || undefined
      });
    }

    // Pattern 2: Markdown-style [text](artifact:id) or [text](artifact:id:vN)
    const markdownPattern = /\[([^\]]+)\]\(artifact:([a-f0-9\-]+)(?::v(\d+))?\)/gi;

    while ((match = markdownPattern.exec(text)) !== null) {
      const id = match[2];
      const versionId = match[3] || undefined;

      // Avoid duplicates
      if (!artifacts.some(a => a.id === id && a.versionId === versionId)) {
        artifacts.push({ id, versionId });
      }
    }

    this.inlineArtifacts = artifacts;
  }

  /**
   * Gets the message text with artifact references removed
   * This allows us to show the text separately from the artifact cards
   */
  public get messageTextWithoutArtifacts(): string {
    if (!this.message?.Message) return '';

    let text = this.message.Message;

    // Remove artifact references
    text = text.replace(/artifact:[a-f0-9\-]+(?::v\d+)?/gi, '');
    text = text.replace(/\[([^\]]+)\]\(artifact:[a-f0-9\-]+(?::v\d+)?\)/gi, '$1');

    return text.trim();
  }

  /**
   * Handler for artifact actions from inline artifact component
   */
  public onInlineArtifactAction(event: {action: string; artifact: any}): void {
    this.artifactActionPerformed.emit({
      action: event.action,
      artifactId: event.artifact.ID
    });
  }
}