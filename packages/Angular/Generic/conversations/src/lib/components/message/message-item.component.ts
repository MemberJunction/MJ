import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit,
  OnInit,
  OnChanges,
  SimpleChanges,
  DoCheck
} from '@angular/core';
import { ConversationDetailEntity, ConversationEntity, AIAgentEntityExtended, AIAgentRunEntityExtended, ArtifactEntity, ArtifactVersionEntity, TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MentionParserService } from '../../services/mention-parser.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { SuggestedResponse } from '../../models/conversation-state.model';

/**
 * Component for displaying a single message in a conversation
 * Follows the dynamic rendering pattern from skip-chat for optimal performance
 * This component is created dynamically via ViewContainerRef.createComponent()
 */
@Component({
  selector: 'mj-conversation-message-item',
  templateUrl: './message-item.component.html',
  styleUrls: [
    './message-item.component.css',
    '../../styles/custom-agent-icons.css'
  ]
})
export class MessageItemComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges, DoCheck {
  @Input() public message!: ConversationDetailEntity;
  @Input() public conversation!: ConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public allMessages!: ConversationDetailEntity[];
  @Input() public isProcessing: boolean = false;
  @Input() public artifact?: ArtifactEntity;
  @Input() public artifactVersion?: ArtifactVersionEntity;
  @Input() public agentRun: AIAgentRunEntityExtended | null = null; // Passed from parent, loaded once per conversation
  @Input() public userAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();

  @Output() public pinClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public editClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public retryClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public artifactActionPerformed = new EventEmitter<{action: string; artifactId: string}>();
  @Output() public messageEdited = new EventEmitter<ConversationDetailEntity>();
  @Output() public openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() public suggestedResponseSelected = new EventEmitter<{text: string; customInput?: string}>();

  private _loadTime: number = Date.now();
  private _elapsedTimeInterval: any = null;
  public _elapsedTimeFormatted: string = '0:00';
  public _agentRunDurationFormatted: string = '0:00';
  public isEditing: boolean = false;
  public editedText: string = '';
  private originalText: string = '';

  // Track previous status for DoCheck comparison
  private _previousMessageStatus: 'Complete' | 'In-Progress' | 'Error' | undefined = undefined;

  // Agent run details
  public isAgentDetailsExpanded: boolean = false;
  public detailTasks: TaskEntity[] = [];
  private tasksLoaded: boolean = false;

  // Memoization for mention parsing to prevent repeated parsing on change detection
  private _cachedDisplayMessage: string = '';
  private _cachedMessageText: string = '';

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

  ngOnChanges(_changes: SimpleChanges) {
    // No longer need to manage timer for agentRun changes
    // Parent's 1-second timer + agentRunDuration getter handles all agent run timing
    // Component's timer only runs for temporary messages (handled in ngAfterViewInit)
  }

  /**
   * DoCheck lifecycle hook - detects changes to message properties
   * This runs on every change detection cycle, so we check if Status actually changed
   * This is more reliable than ngOnChanges when the message object reference doesn't change
   */
  ngDoCheck() {
    if (!this.message) {
      return;
    }

    const currentStatus = this.message.Status;

    // Check if status changed from non-Complete to Complete
    if (this._previousMessageStatus !== 'Complete' && currentStatus === 'Complete') {
      console.log(`🎯 Message ${this.message.ID} status changed to Complete, stopping timer`);

      // Stop the elapsed time interval
      if (this._elapsedTimeInterval !== null) {
        clearInterval(this._elapsedTimeInterval);
        this._elapsedTimeInterval = null;
      }

      // Force change detection to update the pill color
      this.cdRef.markForCheck();
    }

    // Update previous status for next check
    this._previousMessageStatus = currentStatus;
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
   * Starts the elapsed time updater interval for temporary messages only
   * For agent runs with IDs, the parent's timer + agentRunDuration getter handles updates
   * Updates every second for temporary messages that use _elapsedTimeFormatted
   */
  private startElapsedTimeUpdater(): void {
    // Only start timer for temporary messages (no ID yet)
    // Agent runs with IDs use the parent's timer + agentRunDuration getter
    if (this.isInProgressAIMessage) {
      // Initial update
      this.updateTimers();
      this.cdRef.markForCheck();

      // Start interval if not already running
      if (this._elapsedTimeInterval === null) {
        this._elapsedTimeInterval = setInterval(() => {
          this.updateTimers();
          // Use detectChanges to force immediate synchronous view update
          // markForCheck only schedules a check which may not happen if parent already checked
          this.cdRef.detectChanges();
        }, 1000);
      }
    }
  }

  /**
   * Update all timer displays
   * Called every second by the interval timer
   */
  private updateTimers(): void {
    // Update temporary message elapsed time
    if (this.isInProgressAIMessage) {
      this._elapsedTimeFormatted = this.formatElapsedTime(this.elapsedTimeSinceLoad);
    }

    // Update agent run duration for active runs
    if (this.isAgentRunActive && this.agentRun?.__mj_CreatedAt) {
      const createdAt = new Date(this.agentRun.__mj_CreatedAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      this._agentRunDurationFormatted = this.formatDurationFromMs(diffMs);
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
    return formattedTime;
  }

  private formatDurationFromMs(diffMs: number): string {
    if (diffMs <= 0) {
      return '0:00';
    }

    let seconds = Math.floor(diffMs / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    let formattedTime = (hours > 0 ? hours + ':' : '') +
      (minutes < 10 && hours > 0 ? '0' : '') + minutes + ':' +
      (seconds < 10 ? '0' : '') + seconds;
    return formattedTime;
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

  /**
   * Get the actual sender name for user messages
   * Uses the denormalized User field from the view if available,
   * otherwise falls back to current user name
   */
  public get messageSenderName(): string {
    // Use the denormalized User field from the ConversationDetail view
    // This is populated from the UserID (if present) or falls back to Conversation.UserID
    if (this.message.User) {
      return this.message.User;
    }

    // Fallback to current user name (for backwards compatibility)
    return this.currentUser.Name;
  }

  /**
   * Get the user's avatar image URL from the userAvatarMap
   * Uses fast O(1) lookup by UserID
   */
  public get userAvatarUrl(): string | null {
    if (!this.isUserMessage || !this.message.UserID) {
      return null;
    }
    const avatarData = this.userAvatarMap.get(this.message.UserID);
    return avatarData?.imageUrl || null;
  }

  /**
   * Get the user's avatar icon class from the userAvatarMap
   * Uses fast O(1) lookup by UserID
   */
  public get userAvatarIconClass(): string | null {
    if (!this.isUserMessage || !this.message.UserID) {
      return null;
    }
    const avatarData = this.userAvatarMap.get(this.message.UserID);
    return avatarData?.iconClass || null;
  }

  public get isConversationManager(): boolean {
    return this.aiAgentInfo?.name === 'Sage';
  }

  public get displayMessage(): string {
    let text = this.message.Message || '';

    // For Sage, only show the delegation line (starts with emoji)
    if (this.isConversationManager && text) {
      const delegationMatch = text.match(/🤖.*Delegating to.*Agent.*/);
      if (delegationMatch) {
        text = delegationMatch[0];
      }
    }

    // Use cached result if message text hasn't changed
    if (this._cachedMessageText === text && this._cachedDisplayMessage) {
      return this._cachedDisplayMessage;
    }

    // Transform @mentions to HTML pills
    const transformed = this.transformMentionsToHTML(text);

    // Cache the result
    this._cachedMessageText = text;
    this._cachedDisplayMessage = transformed;

    return transformed;
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

  public get isInProgressAIMessage(): boolean {
    return this.isAIMessage && this.message.Status === 'In-Progress';
  }

  public get isAgentRunActive(): boolean {
    if (!this.agentRun) {
      return false;
    }
    const status = this.agentRun.Status?.toLowerCase();
    return status === 'in-progress' || status === 'running';
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
    return !!this.artifactVersion;
  }

  /**
   * Unified time pill text for all AI message states
   * Returns the appropriate time display based on message state:
   * - Temporary messages (in-progress): Live elapsed time
   * - Active agent runs: Live agent run duration (calculated on-demand)
   * - Completed messages: Final generation time
   * - Failed messages: Time before failure
   */
  public get timePillText(): string | null {
    if (this.isUserMessage) {
      return null;
    }

    // For temporary messages (in-progress), show live elapsed time
    if (this.isInProgressAIMessage) {
      return this._elapsedTimeFormatted;
    }

    // For active agent runs, calculate live duration from agentRun timestamps
    // This getter recalculates every time using new Date(), so it updates smoothly
    if (this.isAgentRunActive && this.agentRun?.__mj_CreatedAt) {
      return this.agentRunDuration;
    }

    // For completed or failed messages, show final generation time
    return this.formattedGenerationTime;
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
      if (this.isInProgressAIMessage) {
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
        // Invalidate display message cache since message changed
        this._cachedMessageText = '';
        this._cachedDisplayMessage = '';
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
    if (this.hasArtifact && this.artifact) {
      this.artifactClicked.emit({
        artifactId: this.artifact.ID,
        versionId: this.artifactVersion?.ID
      });
    }
  }

  public onArtifactActionPerformed(event: {action: string; artifact: ArtifactEntity; version?: ArtifactVersionEntity}): void {
    // Handle artifact actions from inline-artifact component
    if (event.action === 'open') {
      this.artifactClicked.emit({
        artifactId: event.artifact.ID,
        versionId: event.version?.ID
      });
    } else {
      // Emit other actions to parent
      this.artifactActionPerformed.emit({ action: event.action, artifactId: event.artifact.ID });
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
  public async toggleAgentDetails(): Promise<void> {
    this.isAgentDetailsExpanded = !this.isAgentDetailsExpanded;

    // Load tasks when expanding if not already loaded
    if (this.isAgentDetailsExpanded && !this.tasksLoaded) {
      await this.loadTasks();
    }

    this.cdRef.detectChanges();
  }

  /**
   * Load tasks associated with this conversation detail
   */
  private async loadTasks(): Promise<void> {
    if (!this.message?.ID) {
      return;
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<TaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `ConversationDetailID='${this.message.ID}'`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.detailTasks = result.Results || [];
        this.tasksLoaded = true;
        console.log(`📋 Loaded ${this.detailTasks.length} tasks for conversation detail ${this.message.ID}`);
      }
    } catch (error) {
      console.error('Failed to load tasks for conversation detail:', error);
    }
  }

  /**
   * Get formatted duration for the agent run
   * For active runs: Calculate from created to NOW (live updates)
   * For completed runs: Calculate from created to updated timestamp (static)
   */
  public get agentRunDuration(): string | null {
    if (!this.agentRun || !this.agentRun.__mj_CreatedAt) {
      return null;
    }

    const createdAt = new Date(this.agentRun.__mj_CreatedAt);
    let endTime: Date;

    // If agent run is still active, use current time for live updates
    if (this.isAgentRunActive) {
      endTime = new Date(); // Uses current UTC time
    } else {
      // For completed runs, use the final updated timestamp
      if (!this.agentRun.__mj_UpdatedAt) {
        return null;
      }
      endTime = new Date(this.agentRun.__mj_UpdatedAt);
    }

    const diffMs = endTime.getTime() - createdAt.getTime();

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

  /**
   * Parse and return suggested responses from message data
   * Uses strongly-typed SuggestedResponses property from ConversationDetailEntity
   */
  public get suggestedResponses(): SuggestedResponse[] {
    try {
      const rawData = this.message.SuggestedResponses;
      if (!rawData) return [];

      // Parse JSON string to array of SuggestedResponse objects
      const responses = JSON.parse(rawData);

      return Array.isArray(responses) ? responses : [];
    } catch (error) {
      console.error('Failed to parse suggested responses:', error);
      return [];
    }
  }

  /**
   * Check if current user is the conversation owner
   */
  public get isConversationOwner(): boolean {
    return this.conversation?.UserID === this.currentUser.ID;
  }

  /**
   * Handle suggested response selection
   */
  public onSuggestedResponseSelected(event: {text: string; customInput?: string}): void {
    this.suggestedResponseSelected.emit(event);
  }

}