import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit,
  OnInit
} from '@angular/core';
import { ConversationDetailEntity, ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
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
export class MessageItemComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() public message!: ConversationDetailEntity;
  @Input() public conversation!: ConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public allMessages!: ConversationDetailEntity[];
  @Input() public isProcessing: boolean = false;
  @Input() public artifactId?: string;
  @Input() public artifactVersionId?: string;
  @Input() public generationTimeSeconds?: number;

  @Output() public pinClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public editClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public retryClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public artifactActionPerformed = new EventEmitter<{action: string; artifactId: string}>();
  @Output() public messageEdited = new EventEmitter<ConversationDetailEntity>();

  private _loadTime: number = Date.now();
  private _elapsedTimeInterval: any = null;
  public _elapsedTimeFormatted: string = '(0:00)';
  public isEditing: boolean = false;
  public editedText: string = '';
  private originalText: string = '';

  constructor(private cdRef: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() {
    // No longer need to load artifacts per message - they are preloaded in chat area
  }

  ngAfterViewInit() {
    this._loadTime = Date.now();
    this.startElapsedTimeUpdater();
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

  public get aiAgentInfo(): { name: string; iconClass: string; role: string } | null {
    if (!this.isAIMessage) return null;

    // Get agent ID from denormalized field (populated when message is created)
    const agentID = (this.message as any).AgentID;

    // Look up agent from AIEngineBase cache
    if (agentID && AIEngineBase.Instance?.Agents) {
      const agent = AIEngineBase.Instance.Agents.find(a => a.ID === agentID);
      if (agent) {
        return {
          name: agent.Name || 'AI Assistant',
          iconClass: agent.IconClass || 'fa-robot',
          role: agent.Description || 'AI Assistant'
        };
      } else {
        console.log('⚠️ Agent not found in cache for ID:', agentID);
      }
    } else {
      console.log('⚠️ No AgentID on message or no Agents cache:', { agentID, hasCache: !!AIEngineBase.Instance?.Agents });
    }

    // Default fallback for AI messages without agent info
    return {
      name: 'AI Assistant',
      iconClass: 'fa-robot',
      role: 'AI Assistant'
    };
  }

  public get isUserMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'user';
  }

  public get isTemporaryMessage(): boolean {
    return this.isAIMessage && (!this.message.ID || this.message.ID.length === 0);
  }

  public get messageStatus(): 'Complete' | 'In-Progress' | 'Error' {
    return this.message.Status || 'Complete';
  }

  public getStatusText(): string {
    switch (this.messageStatus) {
      case 'In-Progress':
        return 'Processing...';
      case 'Error':
        return 'Failed';
      default:
        return '';
    }
  }

  public get isFirstMessageInConversation(): boolean {
    return this.allMessages.indexOf(this.message) === 0;
  }

  public get isLastMessageInConversation(): boolean {
    return this.allMessages.indexOf(this.message) === this.allMessages.length - 1;
  }

  public get hasArtifact(): boolean {
    return !!this.artifactVersionId;
  }

  public get formattedGenerationTime(): string | null {
    if (!this.generationTimeSeconds || this.isUserMessage) {
      return null;
    }

    const seconds = this.generationTimeSeconds;
    if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)}ms`;
    } else if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    }
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
    // Only show edited badge if user actually edited the message content
    // Status updates don't count as edits - we need a more reliable indicator
    // For now, we'll check if there's a significant time difference (more than 30 seconds)
    // AND it's a user message (since AI messages get status updates frequently)
    if (!this.message.__mj_CreatedAt || !this.message.__mj_UpdatedAt || !this.isUserMessage) {
      return false;
    }
    // Allow 30 second threshold to avoid false positives from status updates
    // Real edits will typically happen much later than creation
    return this.message.__mj_UpdatedAt.getTime() - this.message.__mj_CreatedAt.getTime() > 30000;
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

  public onRetryClick(): void {
    if (!this.isProcessing && this.messageStatus === 'Error') {
      this.retryClicked.emit(this.message);
    }
  }

  public onArtifactClick(): void {
    if (this.hasArtifact && this.artifactId) {
      this.artifactClicked.emit({
        artifactId: this.artifactId,
        versionId: this.artifactVersionId
      });
    }
  }

  public toggleReaction(type: 'like' | 'comment'): void {
    // TODO: Implement reaction toggling
    console.log('Toggle reaction:', type, 'for message:', this.message.ID);
  }

  public onSaveArtifact(event: Event): void {
    event.stopPropagation();
    // TODO: Implement artifact save
    console.log('Save artifact for message:', this.message.ID);
  }

  public onShareArtifact(event: Event): void {
    event.stopPropagation();
    // TODO: Implement artifact share
    console.log('Share artifact for message:', this.message.ID);
  }

  public onExportArtifact(event: Event): void {
    event.stopPropagation();
    // TODO: Implement artifact export
    console.log('Export artifact for message:', this.message.ID);
  }

}