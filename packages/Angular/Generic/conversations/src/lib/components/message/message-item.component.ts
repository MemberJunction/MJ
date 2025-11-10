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
import { UserInfo, RunView, Metadata, CompositeKey, KeyValuePair, LogStatusEx } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MentionParserService } from '../../services/mention-parser.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { SuggestedResponse } from '../../models/conversation-state.model';
import { RatingJSON } from '../../models/conversation-complete-query.model';

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
  @Input() public ratings?: RatingJSON[]; // Pre-loaded ratings from parent (RatingsJSON from query)
  @Input() public isLastMessage: boolean = false; // Whether this is the last message in the conversation

  @Output() public pinClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public editClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public retryClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public testFeedbackClicked = new EventEmitter<ConversationDetailEntity>();
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
      // Stop the elapsed time interval
      if (this._elapsedTimeInterval !== null) {
        clearInterval(this._elapsedTimeInterval);
        this._elapsedTimeInterval = null;
      }

      // Force immediate synchronous change detection for dynamically created components
      // markForCheck() only schedules a check which may not run for dynamic components
      // detectChanges() forces immediate view update so UI shows timer stopped right away
      this.cdRef.detectChanges();
    }

    // Update previous status for next check
    this._previousMessageStatus = currentStatus;
  }

  ngAfterViewInit() {
    // Use message creation timestamp if available (for reconnecting to in-progress messages)
    // Otherwise use current time for brand new messages
    if (this.message?.__mj_CreatedAt) {
      this._loadTime = new Date(this.message.__mj_CreatedAt).getTime();
    } else {
      this._loadTime = Date.now();
    }
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
   * Supports both JSON format (@{type:"agent",id:"uuid",...}) and legacy text format (@AgentName)
   * Uses inline HTML that markdown will preserve
   */
  private transformMentionsToHTML(text: string): string {
    if (!text) return '';

    const agents = this.mentionAutocomplete.getAvailableAgents();
    const users = this.mentionAutocomplete.getAvailableUsers();

    // Parse mentions from the text (handles both JSON and legacy formats)
    const parseResult = this.mentionParser.parseMentions(text, agents, users);

    // Replace each mention with an HTML badge
    let transformedText = text;

    for (const mention of parseResult.mentions) {
      const badgeClass = mention.type === 'agent' ? 'mention-badge agent' : 'mention-badge user';

      // Get icon or image for the mention
      let iconHTML = '';
      if (mention.type === 'agent') {
        // For agents, look up their LogoURL or IconClass from AIEngineBase cached agents
        const agent = AIEngineBase.Instance?.Agents?.find(a => a.ID === mention.id);

        if (agent?.LogoURL && agent.LogoURL.trim()) {
          // Use LogoURL image if available (takes precedence)
          // Escape any quotes in the URL for safety
          const safeUrl = agent.LogoURL.replace(/"/g, '&quot;');
          iconHTML = `<img src="${safeUrl}" alt="${mention.name}" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover;"> `;
        } else {
          // Fallback to IconClass
          const iconClass = agent?.IconClass || 'fa-solid fa-robot';

          // Special handling for mj-icon-skip (and other custom CSS icons with background-image)
          // Extract the SVG data URI and use it as an img src instead of relying on CSS
          if (iconClass === 'mj-icon-skip') {
            const skipSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 101.89918457031249 96.83947368421053'%3E%3Cg transform='translate(-0.1288232421875,-0.0)'%3E%3Cpath d='M93.85,41.56c-.84,0-1.62.2-2.37.55-3-4.35-7.49-8.12-13.04-11.04l.04-7.18v-14.44h-10.24v17.6c-1.52-.43-3.07-.8-4.67-1.11V0h-10.24v24.72s-.09,0-.14,0h-4.38s-.1,0-.14,0V7.3h-10.24v18.62c-1.6.32-3.15.69-4.67,1.11v-11.67h-10.24v6.09l.04,9.6c-5.55,2.92-10.04,6.7-13.04,11.04-.75-.35-1.53-.55-2.37-.55-4.5,0-8.14,5.61-8.14,12.51s3.64,12.53,8.14,12.53c.58,0,1.14-.12,1.67-.29,4.1,6.62,11.54,12.06,20.98,15.28l.79.13v7.05c0,2.97,1.45,5.58,3.87,6.99,1.18.69,2.5,1.04,3.85,1.03,1.4,0,2.83-.37,4.15-1.12l7.54-4.29,7.56,4.3c1.31.74,2.73,1.12,4.13,1.12s2.67-.35,3.85-1.04c2.42-1.41,3.86-4.02,3.86-6.98v-7.05l.79-.13c9.44-3.22,16.89-8.66,20.98-15.28.54.17,1.09.29,1.68.29,4.5,0,8.14-5.61,8.14-12.53s-3.63-12.51-8.14-12.51' fill='%23AAAAAA'/%3E%3Cpath d='M86.69,50.87c0-12.22-13.6-19.1-28.94-20.66-4.48-.47-9.19-.54-13.52,0-15.34,1.53-28.93,8.41-28.93,20.66,0,8.55,5.7,15.55,12.68,15.55h7.94c3.05,2.5,6.93,4.1,11.08,4.71,2.65.4,5.44.46,8.01,0,4.15-.6,8.05-2.2,11.1-4.71h7.92c6.97,0,12.68-7,12.68-15.55' fill='white' opacity='0.9'/%3E%3Cpath d='M57.83,55.82c-1.19,2.58-3.8,4.35-6.84,4.35s-5.65-1.77-6.84-4.35h13.68Z' fill='%23AAAAAA'/%3E%3Cpath d='M32.52,41.14c1.74,0,3.18,2.13,3.18,4.76s-1.44,4.74-3.18,4.74-3.16-2.13-3.16-4.74,1.41-4.76,3.16-4.76' fill='%23AAAAAA'/%3E%3Cpath d='M69.46,41.14c1.74,0,3.16,2.13,3.16,4.76s-1.41,4.74-3.16,4.74-3.18-2.13-3.18-4.74,1.41-4.76,3.18-4.76' fill='%23AAAAAA'/%3E%3Cpath d='M63.91,76.15c-.82-.48-1.84-.43-2.8.12l-10.13,5.75-10.11-5.75c-.96-.55-1.98-.59-2.8-.12-.82.47-1.29,1.38-1.29,2.49v10.12c0,1.11.47,2.02,1.28,2.49.38.22.8.33,1.24.33.51,0,1.05-.15,1.57-.44l10.12-5.75,10.11,5.75c.52.29,1.05.44,1.56.44.44,0,.86-.11,1.24-.33.81-.48,1.28-1.38,1.28-2.49v-10.12c0-1.11-.47-2.02-1.28-2.49' fill='white' opacity='0.9'/%3E%3C/g%3E%3C/svg%3E";
            iconHTML = `<img src="${skipSvg}" alt="${mention.name}" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover;"> `;
          } else {
            // Regular icon font class
            iconHTML = `<i class="${iconClass}"></i> `;
          }
        }
      } else {
        // For users, use user icon
        iconHTML = '<i class="fa-solid fa-user"></i> ';
      }

      // Create badge HTML with icon and NO @ sign
      // Include configuration indicator if present (for agent mentions with non-default config)
      let badgeHTML = `<span class="${badgeClass}">${iconHTML}${mention.name}`;
      if (mention.type === 'agent' && mention.configurationId) {
        // Add visual indicator for configuration preset
        // mention.configurationId contains AIAgentConfiguration.ID (preset ID)
        // We need to find the preset that matches this ID
        const agent = AIEngineBase.Instance?.Agents?.find(a => a.ID === mention.id);
        if (agent) {
          const presets = AIEngineBase.Instance.GetAgentConfigurationPresets(agent.ID, false);
          const preset = presets.find(p => p.ID === mention.configurationId);
          const defaultPreset = presets.find(p => p.IsDefault) || presets[0];

          // Only show indicator if this is NOT the default preset
          if (preset && preset.ID !== defaultPreset?.ID) {
            // Use DisplayName if available, otherwise Name
            const displayName = preset.DisplayName || preset.Name;
            badgeHTML += ` <span class="preset-indicator" title="Configuration: ${preset.Name}">${displayName}</span>`;
          }
        }
      }
      badgeHTML += `</span>`;

      // First, try to replace JSON mention format
      // JSON format: @{type:"agent",id:"uuid",name:"Agent Name",configId:"uuid",config:"High"}
      // Build a regex to match the specific JSON mention
      const jsonPattern = new RegExp(
        `@\\{[^}]*"type":"${mention.type}"[^}]*"id":"${this.escapeRegex(mention.id)}"[^}]*\\}`,
        'g'
      );

      // Check if this is a JSON mention (by testing if the pattern matches)
      if (jsonPattern.test(transformedText)) {
        // Replace JSON mention format
        transformedText = transformedText.replace(jsonPattern, badgeHTML);
      } else {
        // Fall back to legacy text format replacement
        // Match both quoted and unquoted versions
        const quotedPattern = new RegExp(`@"${this.escapeRegex(mention.name)}"`, 'gi');
        const unquotedPattern = new RegExp(`@${this.escapeRegex(mention.name)}(?![\\w"])`, 'gi');

        // Replace quoted version first, then unquoted
        transformedText = transformedText.replace(quotedPattern, badgeHTML);
        transformedText = transformedText.replace(unquotedPattern, badgeHTML);
      }
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

  /**
   * Determine if rating component should be shown inline (Option C - Hybrid).
   * Show for latest completed AI message that user hasn't rated yet.
   * For older/already-rated messages, ratings accessible via gear menu.
   */
  public shouldShowRating(): boolean {
    // Must be an AI message
    if (!this.isAIMessage) return false;

    // Must be completed (not in progress or failed)
    if (this.messageStatus !== 'Complete') return false;

    // Must not be editing
    if (this.isEditing) return false;

    // Must be the last message in conversation
    if (!this.isLastMessageInConversation) return false;

    // Check if current user has already rated this message
    if (this.ratings && this.ratings.length > 0) {
      const currentUserId = this.currentUser?.ID;
      const userHasRated = this.ratings.some(r => r.UserID === currentUserId);

      // If user already rated, don't show inline (accessible via gear menu)
      if (userHasRated) return false;
    }

    // Show inline rating for latest completed AI message not yet rated by user
    return true;
  }

  /**
   * Check if message has any ratings (for gear icon badge)
   */
  public hasRatings(): boolean {
    return !!(this.ratings && this.ratings.length > 0);
  }

  /**
   * Get rating count for badge display on gear icon
   */
  public getRatingCount(): number {
    return this.ratings?.length || 0;
  }

  /**
   * Get thumbs up count (ratings >= 8)
   */
  public getThumbsUpCount(): number {
    return this.ratings?.filter(r => r.Rating ? r.Rating >= 8 : false).length || 0;
  }

  /**
   * Get thumbs down count (ratings <= 3)
   */
  public getThumbsDownCount(): number {
    return this.ratings?.filter(r => r.Rating ? r.Rating <= 3 : false).length || 0;
  }

  /**
   * Determine if pin/delete actions should show inline (with rating buttons).
   * Show for latest completed AI message that user hasn't rated yet.
   */
  public shouldShowInlineActions(): boolean {
    // Same logic as shouldShowRating - latest unrated message
    return this.shouldShowRating();
  }

  public get hasArtifact(): boolean {
    return !!this.artifactVersion;
  }

  /**
   * Check if the artifact is a system-only artifact
   */
  public get isSystemArtifact(): boolean {
    return this.artifact?.Visibility === 'System Only';
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
    return this.calculateTimePillText();
  }

  private calculateTimePillText(): string | null {
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

  public onTestFeedbackClick(): void {
    if (!this.isProcessing) {
      this.testFeedbackClicked.emit(this.message);
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