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
import { ConversationDetailEntity, ConversationEntity, ArtifactEntity, ArtifactVersionEntity, TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AgentResponseForm, FormQuestion, ChoiceQuestionType, ActionableCommand, AutomaticCommand, ConversationUtility, AIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { MentionParserService } from '../../services/mention-parser.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { SuggestedResponse } from '../../models/conversation-state.model';
import { RatingJSON } from '../../models/conversation-complete-query.model';
import { UICommandHandlerService } from '../../services/ui-command-handler.service';

/**
 * Represents an attachment on a message for display
 */
export interface MessageAttachment {
  id: string;
  type: 'Image' | 'Video' | 'Audio' | 'Document';
  mimeType: string;
  fileName: string | null;
  sizeBytes: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  contentUrl?: string;
}

/**
 * Component for displaying a single message in a conversation
 * Follows the dynamic rendering pattern from skip-chat for optimal performance
 * This component is created dynamically via ViewContainerRef.createComponent()
 */
@Component({
  standalone: false,
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
  @Input() public attachments: MessageAttachment[] = []; // Attachments for this message

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
  @Output() public attachmentClicked = new EventEmitter<MessageAttachment>();

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
    private mentionAutocomplete: MentionAutocompleteService,
    private uiCommandHandler: UICommandHandlerService
  ) {
    super();
  }

  async ngOnInit() {
    // Execute automatic commands if present
    await this.executeAutomaticCommands();
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

    // Get available agents and users for name/icon lookup
    const agents = this.mentionAutocomplete.getAvailableAgents();
    const users = this.mentionAutocomplete.getAvailableUsers();

    // Parse all @{...} tokens
    const tokens = ConversationUtility.ParseSpecialContent(text);
    if (tokens.length === 0) return text; // No tokens found, return original text

    // Replace tokens in reverse order to maintain indices
    let result = text;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      let html = '';

      switch (token.mode) {
        case 'mention':
          html = this.renderMentionHTML(token.content as any, agents, users);
          break;
        case 'form':
          html = this.renderFormHTML(token.content as any);
          break;
        default:
          // Unknown mode, leave original text as-is
          html = token.originalText;
      }

      result = result.substring(0, token.startIndex) + html + result.substring(token.endIndex);
    }

    return result;
  }

  private renderMentionHTML(content: any, agents: any[], users: any[]): string {
    let name = content.name;
    let iconClass = '';
    let logoURL = '';
    let configPresetName = '';

    // Look up actual name and icon if ID provided
    if (content.type === 'agent' && agents) {
      const agent = agents.find(a => a.ID === content.id);
      if (agent) {
        name = agent.Name;
        iconClass = agent.IconClass || '';
        logoURL = agent.LogoURL || '';

        // Check for configuration preset (only show if non-default)
        if (content.configId && AIEngineBase.Instance) {
          const presets = AIEngineBase.Instance.GetAgentConfigurationPresets(content.id, true);
          if (presets && presets.length > 0) {
            const defaultPreset = presets.find(p => p.IsDefault) || presets[0];
            const isNonDefault = content.configId !== defaultPreset?.ID;

            // Only include preset name if it's not the default
            if (isNonDefault && content.config) {
              configPresetName = content.config;
            }
          }
        }
      }
    } else if (content.type === 'user' && users) {
      const user = users.find(u => u.ID === content.id);
      if (user) name = user.Name;
    }

    const escapedName = this.escapeHtml(name);
    const typeClass = content.type === 'agent' ? 'agent' : 'user';

    // Build preset indicator HTML if present
    const presetIndicator = configPresetName
      ? `<span class="preset-indicator">${this.escapeHtml(configPresetName)}</span>`
      : '';

    // Generate HTML based on whether we have an icon
    if (logoURL) {
      return `<span class="mention-badge ${typeClass}"><img src="${this.escapeHtml(logoURL)}" alt="" />${escapedName}${presetIndicator}</span>`;
    } else if (iconClass) {
      return `<span class="mention-badge ${typeClass}"><i class="${this.escapeHtml(iconClass)}" aria-hidden="true"></i>${escapedName}${presetIndicator}</span>`;
    } else {
      return `<span class="mention-badge ${typeClass}">${escapedName}${presetIndicator}</span>`;
    }
  }

  private renderFormHTML(content: any): string {
    if (!content.fields || content.fields.length === 0) {
      return this.escapeHtml(JSON.stringify(content));
    }

    // Filter out fields with empty/null/undefined values (optional fields not provided)
    const nonEmptyFields = content.fields.filter((f: any) => {
      const value = f.value;
      return value != null && value !== '' && !(Array.isArray(value) && value.length === 0);
    });

    if (nonEmptyFields.length === 0) {
      return this.escapeHtml(JSON.stringify(content));
    }

    if (nonEmptyFields.length === 1) {
      // Single field - simple inline pill
      const field = nonEmptyFields[0];
      // Use displayValue (friendly option label) if available, otherwise fall back to raw value
      const value = this.escapeHtml(String(field.displayValue || field.value));

      // Just show the value if it's a single simple response
      // This handles cases like "Choose an option: weather" -> just show "weather"
      return `<span class="form-response-pill single-field"><i class="fa fa-check" aria-hidden="true"></i>${value}</span>`;
    } else {
      // Multiple fields - vertical question/answer layout for complex forms
      const title = content.title ? this.escapeHtml(content.title) : 'Form Response';
      const fieldsHTML = nonEmptyFields.map((f: any) => {
        const label = this.escapeHtml(f.label || f.name);
        const value = this.formatFieldValue(f);
        return `<div class="pill-field">
          <div class="field-question">${label}</div>
          <div class="field-answer">${value}</div>
        </div>`;
      }).join('');

      return `<div class="form-response-pill multi-field">
        <div class="pill-header">
          <i class="fa fa-check-square" aria-hidden="true"></i>
          ${title}
        </div>
        <div class="pill-fields">${fieldsHTML}</div>
      </div>`;
    }
  }

  private formatFieldValue(field: { name?: string; value: any; label?: string; type?: string; displayValue?: string }): string {
    // Handle null/undefined
    if (field.value == null) {
      return this.escapeHtml('');
    }

    // For choice types (buttongroup, radio, dropdown, checkbox), use displayValue if available
    const choiceTypes = ['buttongroup', 'radio', 'dropdown', 'checkbox'];
    if (field.type && choiceTypes.includes(field.type) && field.displayValue) {
      return this.escapeHtml(field.displayValue);
    }

    const stringValue = String(field.value);

    // Format based on field type
    switch (field.type) {
      case 'date':
        // Date-only: "May 1, 2024"
        return this.formatDate(stringValue, false);

      case 'datetime':
        // Date and time: "May 1, 2024 at 6:00 AM"
        return this.formatDate(stringValue, true);

      case 'time':
        // Time-only: "2:30 PM"
        return this.formatTime(stringValue);

      case 'daterange':
        // Parse object: { start: '...', end: '...' }
        return this.formatDateRange(field.value);

      case 'slider':
        // Value with optional suffix
        return this.escapeHtml(stringValue);

      default:
        // Try auto-detect ISO date (for backward compatibility)
        if (stringValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
          // Legacy: guess based on time component
          const date = new Date(stringValue);
          const hasMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
          return this.formatDate(stringValue, !hasMidnight);
        }

        return this.escapeHtml(stringValue);
    }
  }

  private formatDate(value: string, includeTime: boolean): string {
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return this.escapeHtml(value);

      if (includeTime) {
        return this.escapeHtml(date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }));
      } else {
        return this.escapeHtml(date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }));
      }
    } catch (e) {
      return this.escapeHtml(value);
    }
  }

  private formatTime(value: string): string {
    // Handle "HH:mm" or "HH:mm:ss" format
    try {
      const [hours, minutes] = value.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0);

      return this.escapeHtml(date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }));
    } catch (e) {
      return this.escapeHtml(value);
    }
  }

  private formatDateRange(value: any): string {
    if (typeof value === 'object' && value.start && value.end) {
      const start = this.formatDate(value.start, false);
      const end = this.formatDate(value.end, false);
      // Remove HTML encoding temporarily to avoid double encoding
      const startText = start.replace(/&[^;]+;/g, m => {
        const map: any = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#039;': "'" };
        return map[m] || m;
      });
      const endText = end.replace(/&[^;]+;/g, m => {
        const map: any = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#039;': "'" };
        return map[m] || m;
      });
      return this.escapeHtml(`${startText} to ${endText}`);
    }
    return this.escapeHtml(JSON.stringify(value));
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    // The OriginalMessageChanged flag is set server-side when the Message field changes on update
    if (!this.isUserMessage) {
      return false;
    }
    return this.message.OriginalMessageChanged === true;
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
   * Handle attachment thumbnail click
   * Emits the attachment for the parent to display in the image viewer
   */
  public onAttachmentClick(attachment: MessageAttachment): void {
    this.attachmentClicked.emit(attachment);
  }

  /**
   * Check if message has any attachments
   */
  public get hasAttachments(): boolean {
    return this.attachments && this.attachments.length > 0;
  }

  /**
   * Get only image attachments
   */
  public get imageAttachments(): MessageAttachment[] {
    return this.attachments?.filter(a => a.type === 'Image') || [];
  }

  /**
   * Format file size for display
   */
  public formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

  /**
   * Get agent response form from message
   * Uses ResponseForm property from ConversationDetailEntity
   */
  public get responseForm(): AgentResponseForm | null {
    try {
      const rawData = this.message.ResponseForm;
      if (!rawData) {
        return null;
      }

      // Parse JSON string to AgentResponseForm object
      const form = JSON.parse(rawData);

      return form || null;
    } catch (error) {
      console.error('Failed to parse response form:', error, 'Raw data:', this.message.ResponseForm);
      return null;
    }
  }

  /**
   * Get actionable commands from message
   * Uses ActionableCommands property from ConversationDetailEntity
   */
  public get actionableCommands(): ActionableCommand[] {
    try {
      const rawData = this.message.ActionableCommands;
      if (!rawData) return [];

      // Parse JSON string to array of ActionableCommand objects
      const commands = JSON.parse(rawData);
      return Array.isArray(commands) ? commands : [];
    } catch (error) {
      console.error('Failed to parse actionable commands:', error);
      return [];
    }
  }

  /**
   * Handle agent response form submission
   * Converts form data to the new @{_mode:"form",...} format
   */
  public onFormSubmitted(formData: Record<string, any>): void {
    const form = this.responseForm;
    if (!form) {
      console.error('No response form available for submission');
      return;
    }

    // Build fields array with proper labels and type metadata
    const fields = Object.entries(formData).map(([questionId, value]) => {
      const question = form.questions.find(q => q.id === questionId);
      const questionType = typeof question?.type === 'string' ? question.type : question?.type?.type;

      // Look up display value for choice types (buttongroup, radio, dropdown, checkbox)
      const displayValue = this.getChoiceDisplayValue(question, value);

      return {
        name: questionId,
        value: value,
        label: question?.label || questionId,
        type: questionType, // Include type for proper formatting
        displayValue: displayValue // Include friendly display text for choice fields
      };
    });

    // Create formatted message using ConversationUtility
    const formMessage = ConversationUtility.CreateFormResponse(
      'formSubmit', // Generic action name
      fields,
      form.title
    );

    // Emit the formatted message
    this.suggestedResponseSelected.emit({
      text: formMessage,
      customInput: undefined // No longer needed with new format
    });
  }

  /**
   * Handle actionable command execution
   */
  public async onCommandExecuted(command: ActionableCommand): Promise<void> {
    try {
      await this.uiCommandHandler.executeActionableCommand(command);
    } catch (error) {
      console.error('Failed to execute command:', command, error);
    }
  }

  /**
   * Execute automatic commands when message loads
   * This is called after a message with automatic commands is received
   */
  private async executeAutomaticCommands(): Promise<void> {
    try {
      if (!this.isLastMessage)
        return; // we only do this when the message is the last one in the conversation

      // TODO - IMPORTANT
      // BELOW, after doing the commands,
      // we need to mark the message as haveing completed its automatic commands to avoid re-running on reload


      // For now, check if the property exists (will be added to schema)
      const rawData = (this.message as any).AutomaticCommands;
      if (!rawData) return;

      // Parse JSON string to array of AutomaticCommand objects
      const commands: AutomaticCommand[] = JSON.parse(rawData);
      if (Array.isArray(commands) && commands.length > 0) {
        await this.uiCommandHandler.executeAutomaticCommands(commands);
      }
    } catch (error) {
      console.error('Failed to execute automatic commands:', error);
    }
  }

  /**
   * Get the display value for choice-type questions (buttongroup, radio, dropdown, checkbox)
   * This looks up the option's label based on the selected value
   */
  private getChoiceDisplayValue(question: FormQuestion | undefined, value: string | number | boolean | string[]): string | undefined {
    if (!question) return undefined;

    // Get the question type object
    const typeObj = question.type;
    if (typeof typeObj === 'string') return undefined;

    // Check if it's a choice type with options
    const choiceTypes = ['buttongroup', 'radio', 'dropdown', 'checkbox'];
    if (!choiceTypes.includes(typeObj.type)) return undefined;

    const choiceType = typeObj as ChoiceQuestionType;
    if (!choiceType.options || choiceType.options.length === 0) return undefined;

    // Handle array values (checkbox with multiple selections)
    if (Array.isArray(value)) {
      const labels = value.map(v => {
        const option = choiceType.options.find(opt => opt.value === v);
        return option?.label || String(v);
      });
      return labels.join(', ');
    }

    // Handle single value
    const option = choiceType.options.find(opt => opt.value === value);
    return option?.label;
  }

}