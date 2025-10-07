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
import { ConversationDetailEntity, ConversationEntity, AIAgentEntityExtended, AIAgentRunEntityExtended } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MentionParserService } from '../../services/mention-parser.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';

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
  @Input() public agentRun: AIAgentRunEntityExtended | null = null; // Passed from parent, loaded once per conversation

  @Output() public pinClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public editClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public retryClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public artifactActionPerformed = new EventEmitter<{action: string; artifactId: string}>();
  @Output() public messageEdited = new EventEmitter<ConversationDetailEntity>();
  @Output() public openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  private _loadTime: number = Date.now();
  private _elapsedTimeInterval: any = null;
  public _elapsedTimeFormatted: string = '(0:00)';
  public isEditing: boolean = false;
  public editedText: string = '';
  private originalText: string = '';

  // Agent run details
  public isAgentDetailsExpanded: boolean = false;

  constructor(
    private cdRef: ChangeDetectorRef,
    private mentionParser: MentionParserService,
    private mentionAutocomplete: MentionAutocompleteService
  ) {
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
        // Only log if the message is complete (should have AgentID by then)
        if (this.message.Status === 'Complete') {
          console.warn('⚠️ Agent not found in cache for ID:', agentID);
        }
      }
    }
    // Note: In-progress messages won't have AgentID yet, so we don't log warnings for them

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

  public get isConversationManager(): boolean {
    return this.aiAgentInfo?.name === 'Conversation Manager Agent' || this.aiAgentInfo?.name === 'Conversation Manager';
  }

  public get displayMessage(): string {
    let text = this.message.Message || '';

    // For Conversation Manager, only show the delegation line (starts with emoji)
    if (this.isConversationManager && text) {
      const delegationMatch = text.match(/🤖.*Delegating to.*Agent.*/);
      if (delegationMatch) {
        text = delegationMatch[0];
      }
    }

    // Transform @mentions to HTML pills
    return this.transformMentionsToHTML(text);
  }

  /**
   * Transform @mentions in text to HTML badge elements
   * Uses inline HTML that markdown will preserve
   */
  private transformMentionsToHTML(text: string): string {
    if (!text) return '';

    const agents = this.mentionAutocomplete.getAvailableAgents();
    const users = this.mentionAutocomplete.getAvailableUsers();

    // Parse mentions from the text
    const parseResult = this.mentionParser.parseMentions(text, agents, users);

    // Replace each mention with an HTML badge
    // Note: Handle both @"Agent Name" (quoted) and @AgentName formats
    let transformedText = text;
    for (const mention of parseResult.mentions) {
      const badgeClass = mention.type === 'agent' ? 'mention-badge agent' : 'mention-badge user';

      // Match both quoted and unquoted versions
      const quotedPattern = new RegExp(`@"${this.escapeRegex(mention.name)}"`, 'gi');
      const unquotedPattern = new RegExp(`@${this.escapeRegex(mention.name)}(?![\\w"])`, 'gi');

      const badgeHTML = `<span class="${badgeClass}">@${mention.name}</span>`;

      // Replace quoted version first, then unquoted
      transformedText = transformedText.replace(quotedPattern, badgeHTML);
      transformedText = transformedText.replace(unquotedPattern, badgeHTML);
    }

    return transformedText;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    // Only show generation time for AI messages
    if (this.isUserMessage || !this.message.__mj_CreatedAt || !this.message.__mj_UpdatedAt) {
      return null;
    }

    // Calculate generation time from created -> updated timestamps
    const createdAt = new Date(this.message.__mj_CreatedAt);
    const updatedAt = new Date(this.message.__mj_UpdatedAt);
    const diffMs = updatedAt.getTime() - createdAt.getTime();

    // If no time difference, don't show (e.g., not yet completed)
    if (diffMs <= 0) {
      return null;
    }

    const seconds = diffMs / 1000;

    if (seconds < 1) {
      return `${Math.round(diffMs)}ms`;
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
      // Show in-progress styling for AI messages that are still processing
      if (this.isTemporaryMessage || this.messageStatus === 'In-Progress') {
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

  /**
   * Whether this message has an associated agent run
   * Based on whether the message has an AgentID (not whether agentRun object is loaded)
   */
  public get hasAgentRun(): boolean {
    return !!this.message?.AgentID;
  }

  /**
   * Toggle the agent details panel expansion
   */
  public toggleAgentDetails(): void {
    this.isAgentDetailsExpanded = !this.isAgentDetailsExpanded;
    this.cdRef.detectChanges();
  }

  /**
   * Get formatted duration for the agent run
   * Calculate from created to updated timestamp
   */
  public get agentRunDuration(): string | null {
    if (!this.agentRun || !this.agentRun.__mj_CreatedAt || !this.agentRun.__mj_UpdatedAt) {
      return null;
    }

    const createdAt = new Date(this.agentRun.__mj_CreatedAt);
    const updatedAt = new Date(this.agentRun.__mj_UpdatedAt);
    const diffMs = updatedAt.getTime() - createdAt.getTime();

    if (diffMs <= 0) {
      return null;
    }

    const seconds = diffMs / 1000;

    if (seconds < 1) {
      return `${Math.round(diffMs)}ms`;
    } else if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    }
  }

  /**
   * Get total tokens used in the agent run
   */
  public get agentRunTotalTokens(): number {
    if (!this.agentRun) {
      return 0;
    }
    return (this.agentRun.TotalPromptTokensUsed || 0) + (this.agentRun.TotalCompletionTokensUsed || 0);
  }

  /**
   * Get total cost of the agent run
   */
  public get agentRunTotalCost(): number {
    return this.agentRun?.TotalCost || 0;
  }

  /**
   * Get number of steps in the agent run
   */
  public get agentRunStepCount(): number {
    // Count from the Steps array if available
    if (this.agentRun && (this.agentRun as any).Steps) {
      return (this.agentRun as any).Steps.length;
    }
    return 0;
  }

  /**
   * Format number with commas
   */
  public formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Open the agent run entity record in a new tab
   */
  public openAgentRunRecord(): void {
    if (!this.agentRun?.ID) return;

    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', this.agentRun.ID)
    ]);

    this.openEntityRecord.emit({
      entityName: 'MJ: AI Agent Runs',
      compositeKey
    });
  }

  /**
   * Open the agent entity record in a new tab
   */
  public openAgentRecord(): void {
    if (!this.agentRun?.AgentID) return;

    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', this.agentRun.AgentID)
    ]);

    this.openEntityRecord.emit({
      entityName: 'AI Agents',
      compositeKey
    });
  }

}