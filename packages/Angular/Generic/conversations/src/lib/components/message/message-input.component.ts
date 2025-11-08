import { Component, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { UserInfo, Metadata } from '@memberjunction/core';
import { ConversationDetailEntity, AIPromptEntity, ArtifactEntity, AIAgentEntityExtended, AIAgentRunEntityExtended } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ConversationStateService } from '../../services/conversation-state.service';
import { DataCacheService } from '../../services/data-cache.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { ConversationStreamingService, MessageProgressUpdate } from '../../services/conversation-streaming.service';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ExecuteAgentResult, AgentExecutionProgressCallback, BaseAgentSuggestedResponse } from '@memberjunction/ai-core-plus';
import { MentionAutocompleteService, MentionSuggestion } from '../../services/mention-autocomplete.service';
import { MentionParserService } from '../../services/mention-parser.service';
import { Mention, MentionParseResult } from '../../models/conversation-state.model';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subscription } from 'rxjs';
import { MessageInputBoxComponent } from './message-input-box.component';

@Component({
  selector: 'mj-message-input',
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.scss'
})
export class MessageInputComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  // Default artifact type ID for JSON (when agent doesn't specify DefaultArtifactTypeID)
  private readonly JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';

  @Input() conversationId!: string;
  @Input() conversationName?: string | null; // For task tracking display
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() placeholder: string = 'Type a message... (Ctrl+Enter to send)';
  @Input() parentMessageId?: string; // Optional: for replying in threads
  @Input() conversationHistory: ConversationDetailEntity[] = []; // For agent context
  @Input() initialMessage: string | null = null; // Message to send automatically when component initializes
  @Input() artifactsByDetailId?: Map<string, LazyArtifactInfo[]>; // Pre-loaded artifact data for performance
  @Input() systemArtifactsByDetailId?: Map<string, LazyArtifactInfo[]>; // Pre-loaded system artifact data (Visibility='System Only')
  @Input() agentRunsByDetailId?: Map<string, AIAgentRunEntityExtended>; // Pre-loaded agent run data for performance

  // Message IDs that are in-progress and need streaming reconnection
  // Using getter/setter to react immediately when value changes (avoids timing issues with ngOnChanges)
  private _inProgressMessageIds?: string[];
  @Input()
  set inProgressMessageIds(value: string[] | undefined) {
    this._inProgressMessageIds = value;
    // React immediately when input changes (after component initialized)
    // This ensures callbacks are registered without relying on ngOnChanges timing
    if (this.streamingService && value && value.length > 0) {
      this.reconnectInProgressMessages();
    }
  }
  get inProgressMessageIds(): string[] | undefined {
    return this._inProgressMessageIds;
  }

  @Output() messageSent = new EventEmitter<ConversationDetailEntity>();
  @Output() agentResponse = new EventEmitter<{message: ConversationDetailEntity, agentResult: any}>();
  @Output() agentRunDetected = new EventEmitter<{conversationDetailId: string; agentRunId: string}>();
  @Output() agentRunUpdate = new EventEmitter<{conversationDetailId: string; agentRun?: any, agentRunId?: string}>(); // Emits when agent run data updates during progress
  @Output() messageComplete = new EventEmitter<{conversationDetailId: string; agentRunId?: string}>(); // Emits when message completes (success or error)
  @Output() artifactCreated = new EventEmitter<{artifactId: string; versionId: string; versionNumber: number; conversationDetailId: string; name: string}>();
  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();
  @Output() intentCheckStarted = new EventEmitter<void>(); // Emits when intent checking starts
  @Output() intentCheckCompleted = new EventEmitter<void>(); // Emits when intent checking completes

  @ViewChild('inputBox') inputBox!: MessageInputBoxComponent;

  public messageText: string = '';
  public isSending: boolean = false;
  public isProcessing: boolean = false; // True when waiting for agent/naming response
  public processingMessage: string = 'AI is responding...'; // Message shown during processing
  public converationManagerAgent: AIAgentEntityExtended | null = null;

  // Track completion timestamps to prevent race conditions with late progress updates
  private completionTimestamps = new Map<string, number>();
  // Track registered streaming callbacks for cleanup
  private registeredCallbacks = new Map<string, (progress: MessageProgressUpdate) => Promise<void>>();

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private agentService: ConversationAgentService,
    private conversationState: ConversationStateService,
    private dataCache: DataCacheService,
    private activeTasks: ActiveTasksService,
    private streamingService: ConversationStreamingService,
    private mentionParser: MentionParserService,
    private mentionAutocomplete: MentionAutocompleteService
  ) {}

  async ngOnInit() {
    this.converationManagerAgent = await this.agentService.getConversationManagerAgent();

    // Initialize mention autocomplete (needed for parsing mentions in messages)
    await this.mentionAutocomplete.initialize(this.currentUser);

    // Reconnect to any in-progress messages for streaming updates (via global streaming service)
    this.reconnectInProgressMessages();
  }

  ngOnChanges(changes: SimpleChanges) {
    // When conversation changes, focus the input
    if (changes['conversationId'] && !changes['conversationId'].firstChange) {
      this.focusInput();
    }

    // Note: inProgressMessageIds now handled by setter, not ngOnChanges
  }

  ngAfterViewInit() {
    // Focus input on initial load
    this.focusInput();

    // If there's an initial message to send (from empty state), send it automatically
    if (this.initialMessage) {
      console.log('📨 MessageInputComponent received initialMessage:', this.initialMessage);
      setTimeout(() => {
        this.sendMessageWithText(this.initialMessage!);
      }, 100);
    }
  }

  ngOnDestroy() {
    // Unregister all streaming callbacks
    this.unregisterAllCallbacks();
  }

  /**
   * Focus the message input textarea
   */
  private focusInput(): void {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      if (this.inputBox) {
        this.inputBox.focus();
      }
    }, 100);
  }

  /**
   * Reconnect to in-progress messages for streaming updates via global streaming service.
   * This is called when:
   * 1. Component initializes (ngOnInit)
   * 2. Conversation changes (ngOnChanges)
   * 3. User returns to a conversation with in-progress messages
   * 4. Parent component explicitly triggers reconnection
   */
  public reconnectInProgressMessages(): void {
    if (!this.inProgressMessageIds || this.inProgressMessageIds.length === 0) {
      return;
    }

    console.log(`🔌 Reconnecting to ${this.inProgressMessageIds.length} in-progress messages for streaming updates`);

    // Unregister any previously registered callbacks for this component
    this.unregisterAllCallbacks();

    // Register new callbacks for each in-progress message
    for (const messageId of this.inProgressMessageIds) {
      // Create callback bound to this message ID
      const callback = this.createMessageProgressCallback(messageId);

      // Store reference for cleanup
      this.registeredCallbacks.set(messageId, callback);

      // Register with streaming service
      this.streamingService.registerMessageCallback(messageId, callback);
    }

    console.log(`✅ Registered ${this.registeredCallbacks.size} message callbacks with streaming service`);
  }

  /**
   * Create a progress callback for a specific message ID.
   * This callback will be invoked by the streaming service when progress updates arrive.
   */
  private createMessageProgressCallback(messageId: string): (progress: MessageProgressUpdate) => Promise<void> {
    return async (progress: MessageProgressUpdate) => {
      try {
        // Get message from cache (single source of truth)
        const message = await this.dataCache.getConversationDetail(messageId, this.currentUser);

        if (!message) {
          console.warn(`[StreamingCallback] Message ${messageId} not found in cache`);
          return;
        }

        // Skip if already complete or errored
        if (message.Status === 'Complete' || message.Status === 'Error') {
          console.log(`[StreamingCallback] Message ${messageId} is ${message.Status}, ignoring progress update`);
          return;
        }

        // Check if message was marked as completed (prevents race condition)
        const completionTime = this.completionTimestamps.get(messageId);
        if (completionTime) {
          console.log(`[StreamingCallback] Message ${messageId} marked complete at ${new Date(completionTime).toISOString()}, ignoring late progress update`);
          return;
        }

        // Build formatted progress message
        const taskName = progress.taskName || 'Task';
        const progressMessage = progress.message;
        const percentComplete = progress.percentComplete;

        let updatedMessage: string;
        if (percentComplete != null) {
          updatedMessage = `⏳ **${taskName}** (${percentComplete}%)\n\n${progressMessage}`;
        } else {
          updatedMessage = `⏳ **${taskName}**\n\n${progressMessage}`;
        }

        message.Message = updatedMessage;

        // Use safe save to prevent race conditions with completion
        const saved = await this.safeSaveConversationDetail(message, `StreamingProgress:${taskName}`);

        if (saved) {
          // CRITICAL: Emit update to trigger UI refresh
          this.messageSent.emit(message);

          // CRITICAL: Update ActiveTasksService to keep the tasks dropdown in sync
          this.activeTasks.updateStatusByConversationDetailId(message.ID, progressMessage);

          console.log(`[StreamingCallback] Updated message ${messageId}: ${taskName}`);
        }
      } catch (error) {
        console.error(`[StreamingCallback] Error updating message ${messageId}:`, error);
      }
    };
  }

  /**
   * Unregister all callbacks registered by this component.
   * Called during cleanup and when switching conversations.
   */
  private unregisterAllCallbacks(): void {
    if (this.registeredCallbacks.size === 0) {
      return;
    }

    console.log(`🧹 Unregistering ${this.registeredCallbacks.size} message callbacks`);

    for (const [messageId, callback] of this.registeredCallbacks) {
      this.streamingService.unregisterMessageCallback(messageId, callback);
    }

    this.registeredCallbacks.clear();
  }

  get canSend(): boolean {
    return !this.disabled && !this.isSending && this.messageText.trim().length > 0;
  }

  /**
   * Handle text submitted from the input box
   */
  async onTextSubmitted(text: string): Promise<void> {
    console.log('[MessageInput] onTextSubmitted called with text:', text);

    // Use the text parameter directly since the box component already cleared its value
    if (!text || !text.trim()) {
      console.log('[MessageInput] Empty text, aborting');
      return;
    }

    this.isSending = true;
    try {
      const messageDetail = await this.createMessageDetailFromText(text.trim());
      console.log('[MessageInput] Created message detail:', messageDetail.Message);

      const saved = await messageDetail.Save();

      if (saved) {
        await this.handleSuccessfulSend(messageDetail);
      } else {
        this.handleSendFailure(messageDetail);
      }
    } catch (error) {
      this.handleSendError(error);
    } finally {
      this.isSending = false;
    }
  }

  async onSend(): Promise<void> {
    if (!this.canSend) return;

    this.isSending = true;
    try {
      const messageDetail = await this.createMessageDetail();
      const saved = await messageDetail.Save();

      if (saved) {
        await this.handleSuccessfulSend(messageDetail);
      } else {
        this.handleSendFailure(messageDetail);
      }
    } catch (error) {
      this.handleSendError(error);
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Send a message with custom text WITHOUT modifying the visible messageText input
   * Used for suggested responses - sends message silently without affecting user's current input
   */
  public async sendMessageWithText(text: string): Promise<void> {
    if (!text || !text.trim()) {
      return;
    }

    if (this.isSending) {
      return;
    }

    this.isSending = true;
    try {
      const detail = await this.dataCache.createConversationDetail(this.currentUser);
      detail.ConversationID = this.conversationId;
      detail.Message = text.trim();
      detail.Role = 'User';
      detail.UserID = this.currentUser.ID; // Set the user who sent the message

      if (this.parentMessageId) {
        detail.ParentID = this.parentMessageId;
      }

      const saved = await detail.Save();

      if (saved) {
        this.messageSent.emit(detail);

        const mentionResult = this.parseMentionsFromMessage(detail.Message);
        const isFirstMessage = this.conversationHistory.length === 0;
        await this.routeMessage(detail, mentionResult, isFirstMessage);
      } else {
        this.handleSendFailure(detail);
      }
    } catch (error) {
      this.handleSendError(error);
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Creates and configures a new conversation detail message
   */
  private async createMessageDetail(): Promise<ConversationDetailEntity> {
    const detail = await this.dataCache.createConversationDetail(this.currentUser);

    detail.ConversationID = this.conversationId;
    detail.Message = this.messageText.trim();
    detail.Role = 'User';
    detail.UserID = this.currentUser.ID; // Set the user who sent the message

    if (this.parentMessageId) {
      detail.ParentID = this.parentMessageId;
    }

    return detail;
  }

  /**
   * Creates and configures a new conversation detail message from provided text
   */
  private async createMessageDetailFromText(text: string): Promise<ConversationDetailEntity> {
    const detail = await this.dataCache.createConversationDetail(this.currentUser);

    detail.ConversationID = this.conversationId;
    detail.Message = text;
    detail.Role = 'User';
    detail.UserID = this.currentUser.ID; // Set the user who sent the message

    if (this.parentMessageId) {
      detail.ParentID = this.parentMessageId;
    }

    return detail;
  }

  /**
   * Handles successful message send - routes to appropriate agent
   */
  private async handleSuccessfulSend(messageDetail: ConversationDetailEntity): Promise<void> {
    this.messageSent.emit(messageDetail);
    this.messageText = '';

    const mentionResult = this.parseMentionsFromMessage(messageDetail.Message);
    const isFirstMessage = this.conversationHistory.length === 0;

    await this.routeMessage(messageDetail, mentionResult, isFirstMessage);
    this.refocusTextarea();
  }

  /**
   * Parses mentions from the message for routing decisions
   */
  private parseMentionsFromMessage(message: string): MentionParseResult {
    const mentionResult = this.mentionParser.parseMentions(
      message,
      this.mentionAutocomplete.getAvailableAgents(),
      this.mentionAutocomplete.getAvailableUsers()
    );

    return mentionResult;
  }

  /**
   * Routes the message to the appropriate agent or Sage based on context
   * Priority: @mention > intent check > Sage
   */
  private async routeMessage(
    messageDetail: ConversationDetailEntity,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    // Priority 1: Direct @mention
    if (mentionResult.agentMention) {
      await this.handleDirectMention(messageDetail, mentionResult.agentMention, isFirstMessage);
      return;
    }

    // Priority 2: Check for previous agent with intent check
    const lastAgentId = this.findLastNonSageAgentId();
    if (lastAgentId) {
      await this.handleAgentContinuity(messageDetail, lastAgentId, mentionResult, isFirstMessage);
      return;
    }

    // Priority 3: No context - use Sage
    await this.handleNoAgentContext(messageDetail, mentionResult, isFirstMessage);
  }

  /**
   * Handles routing when user directly mentions an agent with @
   */
  private async handleDirectMention(
    messageDetail: ConversationDetailEntity,
    agentMention: Mention,
    isFirstMessage: boolean
  ): Promise<void> {
    console.log('🎯 Direct @mention detected, bypassing Sage');

    // The agentMention already has configurationId from JSON parsing
    // If it wasn't in JSON (legacy format), try to get from chip data
    if (!agentMention.configurationId) {
      const chipData = this.inputBox?.getMentionChipsData() || [];
      const agentChip = chipData.find(chip => chip.id === agentMention.id && chip.type === 'agent');
      if (agentChip?.presetId) {
        agentMention.configurationId = agentChip.presetId;
        console.log(`🎯 Using configuration preset from chip: ${agentChip.presetName} (${agentChip.presetId})`);
      }
    }

    if (agentMention.configurationId) {
      console.log(`🎯 Agent mention has configuration ID: ${agentMention.configurationId}`);
    }

    await this.executeRouteWithNaming(
      () => this.invokeAgentDirectly(messageDetail, agentMention, this.conversationId),
      messageDetail.Message,
      isFirstMessage
    );
  }

  /**
   * Handles routing when there's a previous agent - checks intent first
   */
  private async handleAgentContinuity(
    messageDetail: ConversationDetailEntity,
    lastAgentId: string,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    console.log('🔍 Previous agent found, checking continuity intent...');

    const intentResult = await this.checkContinuityIntent(lastAgentId, messageDetail.Message);

    if (intentResult.decision === 'YES') {
      console.log('✅ Intent check: YES - continuing with previous agent', {
        reasoning: intentResult.reasoning,
        targetArtifactVersionId: intentResult.targetArtifactVersionId
      });
      await this.executeRouteWithNaming(
        () => this.continueWithAgent(
          messageDetail,
          lastAgentId,
          this.conversationId,
          intentResult.targetArtifactVersionId
        ),
        messageDetail.Message,
        isFirstMessage
      );
    } else {
      console.log(`🤖 Intent check: ${intentResult.decision} - routing through Sage for evaluation`, {
        reasoning: intentResult.reasoning
      });
      await this.executeRouteWithNaming(
        () => this.processMessageThroughAgent(messageDetail, mentionResult),
        messageDetail.Message,
        isFirstMessage
      );
    }
  }

  /**
   * Handles routing when there's no previous agent context
   */
  private async handleNoAgentContext(
    messageDetail: ConversationDetailEntity,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    console.log('🤖 No agent context, using Sage');
    await this.executeRouteWithNaming(
      () => this.processMessageThroughAgent(messageDetail, mentionResult),
      messageDetail.Message,
      isFirstMessage
    );
  }

  /**
   * Finds the last agent ID that isn't Sage
   */
  private findLastNonSageAgentId(): string | null {
    const lastAIMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(msg =>
        msg.Role === 'AI' &&
        msg.AgentID &&
        msg.AgentID !== this.converationManagerAgent?.ID
      );

    return lastAIMessage?.AgentID || null;
  }

  /**
   * Checks if message should continue with the previous agent
   * Emits events to show temporary intent checking message in conversation
   */
  private async checkContinuityIntent(agentId: string, message: string) {
    // Emit event to show temporary "Analyzing intent..." message in conversation
    this.intentCheckStarted.emit();

    try {
      // Build context from pre-loaded maps (if available)
      if (!this.artifactsByDetailId || !this.agentRunsByDetailId) {
        console.warn('⚠️ Artifact/agent run context not available for intent check');
        return { decision: 'UNSURE' as const, reasoning: 'Context not available' };
      }

      const intent = await this.agentService.checkAgentContinuityIntent(
        agentId,
        message,
        this.conversationHistory,
        {
          artifactsByDetailId: this.artifactsByDetailId,
          agentRunsByDetailId: this.agentRunsByDetailId
        }
      );
      return intent;
    } catch (error) {
      console.error('❌ Intent check failed, defaulting to UNSURE:', error);
      return { decision: 'UNSURE' as const, reasoning: 'Intent check failed with error' };
    } finally {
      // Emit event to remove temporary intent checking message
      this.intentCheckCompleted.emit();
    }
  }

  /**
   * Executes a routing function, optionally with conversation naming for first message
   */
  private async executeRouteWithNaming(
    routeFunction: () => Promise<void>,
    userMessage: string,
    isFirstMessage: boolean
  ): Promise<void> {
    if (isFirstMessage) {
      await Promise.all([
        routeFunction(),
        this.nameConversation(userMessage)
      ]);
    } else {
      await routeFunction();
    }
  }

  /**
   * Returns focus to the message textarea
   */
  private refocusTextarea(): void {
    setTimeout(() => {
      if (this.inputBox) {
        this.inputBox.focus();
      }
    }, 100);
  }

  /**
   * Handles message send failure
   */
  private handleSendFailure(messageDetail: ConversationDetailEntity): void {
    console.error('Failed to send message:', messageDetail.LatestResult?.Message);
    this.toastService.error('Failed to send message. Please try again.');
  }

  /**
   * Handles message send error
   */
  private handleSendError(error: unknown): void {
    console.error('Error sending message:', error);
    this.toastService.error('Error sending message. Please try again.');
  }

  /**
   * Safe save for ConversationDetail - prevents overwrites of completed/errored messages
   * Use this ONLY in progress update paths to prevent race conditions
   * @param detail The conversation detail to save
   * @param context Description of who is saving (for logging)
   * @returns true if saved, false if blocked
   */
  private async safeSaveConversationDetail(
    detail: ConversationDetailEntity,
    context: string
  ): Promise<boolean> {
    // Never modify completed or errored messages
    if (detail.Status === 'Complete' || detail.Status === 'Error') {
      console.log(`[${context}] 🛡️ Blocked save - message is ${detail.Status}`);
      return false;
    }

    await detail.Save();
    return true;
  }

  /**
   * Create a progress callback for agent execution
   * This callback updates both the active task and the ConversationDetail message
   * IMPORTANT: Filters by agentRunId to prevent cross-contamination when multiple agents run in parallel
   */
  private createProgressCallback(
    conversationDetail: ConversationDetailEntity,
    agentName: string
  ): AgentExecutionProgressCallback {
    // Use closure to capture the agent run ID from the first progress message
    // This allows us to filter out progress messages from other concurrent agents
    let capturedAgentRunId: string | null = null;

    return async (progress) => {
      let progressAgentRun = progress.metadata?.agentRun as any | undefined;
      const progressAgentRunId = progressAgentRun?.ID || progress.metadata?.agentRunId as string | undefined;

      // Capture the agent run ID from the first progress message
      if (!capturedAgentRunId && progressAgentRunId) {
        capturedAgentRunId = progressAgentRunId;
      }

      // Filter out progress messages from other concurrent agents
      // This prevents cross-contamination when multiple agents run in parallel
      if (capturedAgentRunId && progressAgentRunId && progressAgentRunId !== capturedAgentRunId) {
        return;
      }

      // Format progress message with visual indicator
      const progressText = progress.message;

      // Update the active task with progress details (if it exists)
      this.activeTasks.updateStatusByConversationDetailId(conversationDetail.ID, progressText);

      // Update the ConversationDetail message in real-time
      try {
        if (conversationDetail) {
          // Check 1: Skip if message is already complete or errored
          if (conversationDetail.Status === 'Complete' || conversationDetail.Status === 'Error') {
            return;
          }

          // Check 2: Skip if message was marked as completed (prevents race condition)
          // Once a message is marked complete, we reject ALL further progress updates
          const completionTime = this.completionTimestamps.get(conversationDetail.ID);
          if (completionTime) {
            return;
          }

          // CRITICAL FIX: Emit FULL agent run object for incremental updates
          // This contains live timestamps, status, and other fields that change during execution
          if (progressAgentRun || progressAgentRunId) {
            this.agentRunUpdate.emit({
              conversationDetailId: conversationDetail.ID,
              agentRun: progressAgentRun,
              agentRunId: progressAgentRunId
            });
          } else if (progressAgentRunId && !capturedAgentRunId) {
            // Fallback: If we don't have the full object but have the ID, emit agentRunDetected
            // This will trigger a database query to load the agent run
            this.agentRunDetected.emit({
              conversationDetailId: conversationDetail.ID,
              agentRunId: progressAgentRunId
            });
          }

          if (conversationDetail.Status === 'In-Progress') {
            conversationDetail.Message = progressText;
            // Use safe save to prevent race conditions with completion
            const saved = await this.safeSaveConversationDetail(conversationDetail, `Progress:${agentName}`);
            if (saved) {
              // Emit update to trigger UI refresh
              this.messageSent.emit(conversationDetail);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to save progress update to ConversationDetail:', error);
      }

      console.log(`[${agentName}] Progress: ${progress.step} - ${progress.message} (${progress.percentage}%)`, {
        agentRunId: progressAgentRunId,
        conversationDetailId: conversationDetail.ID
      });
    };
  }

  /**
   * Process the message through agents (multi-stage: Sage -> possible sub-agent)
   * Only called when there's no @mention and no implicit agent context
   */
  private async processMessageThroughAgent(
    userMessage: ConversationDetailEntity,
    mentionResult: MentionParseResult
  ): Promise<void> {
    let taskId: string | null = null;
    let conversationManagerMessage: ConversationDetailEntity | null = null;

    // CRITICAL: Capture conversationId from user message at start
    // This prevents race condition when user switches conversations during async processing
    const conversationId = userMessage.ConversationID;

    try {
      // Create AI message for Sage BEFORE invoking
      conversationManagerMessage = await this.dataCache.createConversationDetail(this.currentUser);

      conversationManagerMessage.ConversationID = conversationId;
      conversationManagerMessage.Role = 'AI';
      conversationManagerMessage.Message = '⏳ Starting...';
      conversationManagerMessage.ParentID = userMessage.ID;
      conversationManagerMessage.Status = 'In-Progress';
      conversationManagerMessage.HiddenToUser = false;
      // Use the preloaded Sage agent instead of looking it up
      if (this.converationManagerAgent?.ID) {
        conversationManagerMessage.AgentID = this.converationManagerAgent.ID;
      }

      await conversationManagerMessage.Save();
      this.messageSent.emit(conversationManagerMessage);

      // Use Sage to evaluate and route
      // Stage 1: Sage evaluates the message
      taskId = this.activeTasks.add({
        agentName: 'Sage',
        status: 'Evaluating message...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: conversationManagerMessage.ID,
        conversationId: this.conversationId,
        conversationName: this.conversationName
      });

      const result = await this.agentService.processMessage(
        conversationId,
        userMessage,
        this.conversationHistory,
        conversationManagerMessage.ID,
        this.createProgressCallback(conversationManagerMessage, 'Sage')
      );

      // Task will be removed automatically in markMessageComplete()
      // DO NOT remove here - agent may still be streaming/processing
      taskId = null; // Clear reference but don't remove from service

      if (!result || !result.success) {
        // Evaluation failed - use updateConversationDetail to ensure task cleanup
        const errorMsg = result?.agentRun?.ErrorMessage || 'Agent evaluation failed';
        conversationManagerMessage.Error = errorMsg;
        await this.updateConversationDetail(conversationManagerMessage, `❌ Evaluation failed`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        console.warn('⚠️ Sage failed:', result?.agentRun?.ErrorMessage);

        // Clean up completion timestamp
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        return;
      }

      console.log('🤖 Sage Response:', {
        finalStep: result.agentRun.FinalStep,
        hasPayload: !!result.payload,
        hasMessage: !!result.agentRun.Message,
        payloadKeys: result.payload ? Object.keys(result.payload) : [],
        payload: result.payload, // Full payload for debugging,
        suggestedResponses: result.suggestedResponses
      });

      // Stage 2: Check for task graph (multi-step orchestration)
      if (result.payload?.taskGraph) {
        console.log('📋 Task graph detected, starting task orchestration');
        await this.handleTaskGraphExecution(userMessage, result, this.conversationId, conversationManagerMessage);
        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }
      }
      // Stage 3: Check for sub-agent invocation (single-step delegation)
      else if (result.agentRun.FinalStep === 'Success' && result.payload?.invokeAgent) {
        // Reuse the existing conversationManagerMessage instead of creating new ones
        await this.handleSubAgentInvocation(userMessage, result, this.conversationId, conversationManagerMessage);
        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }
      }
      // Stage 4: Direct chat response from Sage
      else if (result.agentRun.FinalStep === 'Chat' && result.agentRun.Message) {
        // Mark message as completing BEFORE setting final content (prevents race condition)
        this.markMessageComplete(conversationManagerMessage);

        // Normal chat response
        // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
        await this.updateConversationDetail(conversationManagerMessage, result.agentRun.Message, 'Complete', result.suggestedResponses );

        // Handle artifacts if any (but NOT task graphs - those are intermediate work products)
        // Server already created artifacts - just emit event to trigger UI reload
        if (result.payload && Object.keys(result.payload).length > 0) {
          this.artifactCreated.emit({
            artifactId: '',
            versionId: '',
            versionNumber: 0,
            conversationDetailId: conversationManagerMessage.ID,
            name: ''
          });
          console.log('🎨 Server created artifact, UI will reload to show it');
          this.messageSent.emit(conversationManagerMessage);
        }

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }

        // Clean up completion timestamp after delay
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
      }
      // Stage 5: Silent observation - but check for message content first
      else {
        // Check if there's a message to display even without payload/taskGraph
        if (result.agentRun.Message) {
          console.log('💬 Sage provided a message without payload');

          // Mark message as completing BEFORE setting final content
          this.markMessageComplete(conversationManagerMessage);

          conversationManagerMessage.HiddenToUser = false;

          // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
          await this.updateConversationDetail(conversationManagerMessage, result.agentRun.Message, 'Complete', result.suggestedResponses);

          this.messageSent.emit(conversationManagerMessage);

          // Clean up completion timestamp after delay
          this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        } else {
          console.log('🔇 Sage chose to observe silently');

          // Mark message as completing
          this.markMessageComplete(conversationManagerMessage);

          // Hide the Sage message
          conversationManagerMessage.HiddenToUser = true;

          // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
          await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Complete');

          this.messageSent.emit(conversationManagerMessage);

          await this.handleSilentObservation(userMessage, this.conversationId);

          // Clean up completion timestamp after delay
          this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        }

        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }
      }

    } catch (error) {
      console.error('❌ Error processing message through agents:', error);

      // Update conversationManagerMessage status to Error
      if (conversationManagerMessage && conversationManagerMessage.ID) {
        // Use updateConversationDetail to ensure task cleanup
        conversationManagerMessage.Error = String(error);
        await this.updateConversationDetail(conversationManagerMessage, `❌ Error: ${String(error)}`, 'Error');

        // Clean up completion timestamp
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
      }

      // Mark user message as complete
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

      // Clean up active task
      if (taskId) {
        // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
      }
    }
  }

  /**
   * Handle task graph execution based on Sage's payload
   * Creates tasks and orchestrates their execution
   */
  private async handleTaskGraphExecution(
    userMessage: ConversationDetailEntity,
    managerResult: ExecuteAgentResult,
    conversationId: string,
    conversationManagerMessage: ConversationDetailEntity
  ): Promise<void> {
    const taskGraph = managerResult.payload.taskGraph;
    const workflowName = taskGraph.workflowName || 'Workflow';
    const reasoning = taskGraph.reasoning || 'Executing multi-step workflow';
    const taskCount = taskGraph.tasks?.length || 0;

    console.log(`📋 Task graph execution requested: ${workflowName}`, {
      reasoning,
      taskCount
    });

    // Deduplicate tasks by tempId (LLM sometimes returns duplicates)
    const seenTempIds = new Set<string>();
    const uniqueTasks = taskGraph.tasks.filter((task: any) => {
      if (seenTempIds.has(task.tempId)) {
        console.warn(`⚠️ Duplicate tempId detected on client, filtering: ${task.tempId} (${task.name})`);
        return false;
      }
      seenTempIds.add(task.tempId);
      return true;
    });

    const uniqueTaskCount = uniqueTasks.length;
    console.log(`Filtered to ${uniqueTaskCount} unique tasks (${taskCount - uniqueTaskCount} duplicates removed)`);

    const isSingleTask = uniqueTaskCount === 1;

    // If single task, use direct agent execution (existing pattern with great PubSub support)
    if (isSingleTask) {
      const task = uniqueTasks[0];
      const agentName = task.agentName;

      // Update CM message
      const delegationMessage = `👉 Delegating to **${agentName}**`;
      await this.updateConversationDetail(conversationManagerMessage, delegationMessage, 'Complete');

      // Execute single agent directly using existing pattern
      await this.handleSingleTaskExecution(
        userMessage,
        task,
        agentName,
        conversationId,
        conversationManagerMessage
      );

      return;
    }

    // Multi-step workflow - use server-side task orchestration
    console.log(`📋 Multi-step workflow detected (${uniqueTaskCount} tasks), using task orchestration`);

    // Update CM message with task summary (use unique tasks only)
    const taskSummary = uniqueTasks.map((t: any) => `• ${t.name}`).join('\n');

    await this.updateConversationDetail(conversationManagerMessage, `📋 Setting up multi-step workflow...\n\n**${workflowName}**\n${taskSummary}`, 'Complete');

    // Step 2: Create new ConversationDetail for task execution updates
    const taskExecutionMessage = await this.dataCache.createConversationDetail(this.currentUser);
    taskExecutionMessage.ConversationID = conversationId;
    taskExecutionMessage.Role = 'AI';
    taskExecutionMessage.Message = '⏳ Starting workflow execution...';
    taskExecutionMessage.ParentID = conversationManagerMessage.ID; // Thread under delegation message
    taskExecutionMessage.Status = 'In-Progress';
    taskExecutionMessage.HiddenToUser = false;
    // No AgentID for now - this represents the task orchestration system
    await taskExecutionMessage.Save();
    this.messageSent.emit(taskExecutionMessage);

    // Register for streaming updates via global streaming service
    const callback = this.createMessageProgressCallback(taskExecutionMessage.ID);
    this.registeredCallbacks.set(taskExecutionMessage.ID, callback);
    this.streamingService.registerMessageCallback(taskExecutionMessage.ID, callback);

    try {
      // Get environment ID from user
      const environmentId = (this.currentUser as any).EnvironmentID || 'F51358F3-9447-4176-B313-BF8025FD8D09';

      // Get session ID for PubSub
      const sessionId = (GraphQLDataProvider.Instance as any).sessionId || '';
      
      // Step 3: Call ExecuteTaskGraph mutation (links to taskExecutionMessage)
      const mutation = `
        mutation ExecuteTaskGraph($taskGraphJson: String!, $conversationDetailId: String!, $environmentId: String!, $sessionId: String!, $createNotifications: Boolean) {
          ExecuteTaskGraph(
            taskGraphJson: $taskGraphJson
            conversationDetailId: $conversationDetailId
            environmentId: $environmentId
            sessionId: $sessionId
            createNotifications: $createNotifications
          ) {
            success
            errorMessage
            results {
              taskId
              success
              output
              error
            }
          }
        }
      `;

      const variables = {
        taskGraphJson: JSON.stringify(taskGraph),
        conversationDetailId: taskExecutionMessage.ID, // Link tasks to execution message, not CM message
        environmentId: environmentId,
        sessionId: sessionId,
        createNotifications: true
      };

      const result = await GraphQLDataProvider.Instance.ExecuteGQL(mutation, variables);

      console.log('📊 ExecuteTaskGraph result:', {
        hasExecuteTaskGraph: !!result?.ExecuteTaskGraph,
        success: result?.ExecuteTaskGraph?.success,
        resultsCount: result?.ExecuteTaskGraph?.results?.length,
        result: result
      });

      // Step 4: Update task execution message with results
      // ExecuteGQL returns data directly (not wrapped in {data, errors})
      if (result?.ExecuteTaskGraph?.success) {
        console.log('✅ Task graph execution completed successfully');
        await this.updateConversationDetail(taskExecutionMessage, `✅ **${workflowName}** completed successfully`, 'Complete');
      } else {
        const errorMsg = result?.ExecuteTaskGraph?.errorMessage || 'Unknown error';
        console.error('❌ Task graph execution failed:', errorMsg);
        taskExecutionMessage.Error = errorMsg;
        await this.updateConversationDetail(taskExecutionMessage, `❌ **${workflowName}** failed: ${errorMsg}`, 'Error');
      }

      // Trigger artifact reload for this message
      // Artifacts were created on server during task execution and linked to this message
      // This event triggers the parent component to reload artifacts from the database
      this.artifactCreated.emit({
        artifactId: '', // Placeholder - reload will fetch actual artifacts from DB
        versionId: '',
        versionNumber: 1,
        conversationDetailId: taskExecutionMessage.ID,
        name: ''
      });

      // Unregister streaming callback (task complete)
      const callback = this.registeredCallbacks.get(taskExecutionMessage.ID);
      if (callback) {
        this.streamingService.unregisterMessageCallback(taskExecutionMessage.ID, callback);
        this.registeredCallbacks.delete(taskExecutionMessage.ID);
      }

      // Mark agent response message as complete (removes task from active tasks)
      await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Complete');

      // Mark user message as complete
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

    } catch (error) {
      console.error('❌ Error executing task graph:', error);
      taskExecutionMessage.Error = String(error);
      await this.updateConversationDetail(taskExecutionMessage, `❌ **${workflowName}** - Error: ${String(error)}`, 'Error');

      // Trigger artifact reload even on error - partial artifacts may have been created
      this.artifactCreated.emit({
        artifactId: '',
        versionId: '',
        versionNumber: 1,
        conversationDetailId: taskExecutionMessage.ID,
        name: ''
      });

      // Unregister streaming callback (task failed)
      const callback = this.registeredCallbacks.get(taskExecutionMessage.ID);
      if (callback) {
        this.streamingService.unregisterMessageCallback(taskExecutionMessage.ID, callback);
        this.registeredCallbacks.delete(taskExecutionMessage.ID);
      }

      // Mark agent response message as complete (removes task from active tasks)
      conversationManagerMessage.Error = String(error);
      await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Error');

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  protected async updateConversationDetail(convoDetail: ConversationDetailEntity, message: string, status: 'In-Progress' | 'Complete' | 'Error', suggestedResponses?: BaseAgentSuggestedResponse[]): Promise<void> {
    // Mark as completing FIRST if status is Complete or Error
    // This ensures task cleanup happens even if we return early due to guard clause
    if (status === 'Complete' || status === 'Error') {
      this.markMessageComplete(convoDetail);
    }

    // Guard clause: Don't re-save if already complete/errored (prevents duplicate saves)
    // Task has already been removed by markMessageComplete() above
    if (convoDetail.Status === 'Complete' || convoDetail.Status === 'Error') {
      return; // Already complete, no need to save again
    }

    const maxAttempts = 2;
    let attempts = 0, done = false;
    while (attempts < maxAttempts && !done) {
      convoDetail.Message = message;
      convoDetail.Status = status;
      if (suggestedResponses !== undefined) {
        convoDetail.SuggestedResponses = JSON.stringify(suggestedResponses);  
      }

      await convoDetail.Save();

      if (convoDetail.Message === message && convoDetail.Status === status) {
        done = true;
        this.messageSent.emit(convoDetail);
      }
      else {
        console.warn(`   ⚠️ ConversationDetail update attempt ${attempts + 1} did not persist. ${attempts + 1 < maxAttempts ? 'Retrying...' : 'Giving up.'}`);
      }
      attempts++;
    }

    // Clean up completion timestamp after delay
    if (status === 'Complete' || status === 'Error') {
      this.cleanupCompletionTimestamp(convoDetail.ID);
    }
  }

  /**
   * Load previous payload for an agent from its most recent OUTPUT artifact.
   * Checks both user-visible and system artifacts to support agents like Agent Manager.
   */
  private async loadPreviousPayloadForAgent(agentId: string): Promise<{
    payload: any;
    artifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null;
  }> {
    // Find last message from this agent
    const lastAgentMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.Role === 'AI' && msg.AgentID === agentId);

    if (!lastAgentMessage) {
      return { payload: null, artifactInfo: null };
    }

    // Check user-visible artifacts first
    let artifacts = this.artifactsByDetailId?.get(lastAgentMessage.ID);

    // If not found, check system artifacts (Agent Manager, etc.)
    if (!artifacts || artifacts.length === 0) {
      artifacts = this.systemArtifactsByDetailId?.get(lastAgentMessage.ID);
    }

    // Load artifact content as payload
    if (artifacts && artifacts.length > 0) {
      const artifact = artifacts[0];
      try {
        const version = await artifact.getVersion();
        if (version.Content) {
          console.log(`📦 Loaded previous payload for agent ${agentId} from artifact`);
          return {
            payload: JSON.parse(version.Content),
            artifactInfo: {
              artifactId: artifact.artifactId,
              versionId: artifact.artifactVersionId,
              versionNumber: artifact.versionNumber
            }
          };
        }
      } catch (error) {
        console.error('Error loading previous payload:', error);
      }
    }

    return { payload: null, artifactInfo: null };
  }

  /**
   * Handle single task execution from task graph using direct agent execution
   * Uses the existing agent execution pattern with PubSub support
   */
  private async handleSingleTaskExecution(
    userMessage: ConversationDetailEntity,
    task: any, // Task definition from taskGraph
    agentName: string,
    conversationId: string,
    conversationManagerMessage: ConversationDetailEntity
  ): Promise<void> {
    try {
      // Look up the agent
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${agentName}`);
      }

      // Create AI response message for the agent execution
      const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...';
      agentResponseMessage.ParentID = conversationManagerMessage.ID; // Thread under delegation
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      agentResponseMessage.AgentID = agent.ID;

      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Add to active tasks
      const newTaskId = this.activeTasks.add({
        agentName: agentName,
        status: 'Starting...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: agentResponseMessage.ID,
        conversationId: this.conversationId,
        conversationName: this.conversationName
      });

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = await this.loadPreviousPayloadForAgent(agent.ID);

      // Merge Sage's task payload with previous agent payload (Sage's takes precedence)
      const mergedPayload = previousPayload
        ? { ...previousPayload, ...task.inputPayload }
        : task.inputPayload;

      // Invoke agent with merged payload
      const agentResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        task.description || task.name,
        agentResponseMessage.ID,
        mergedPayload, // Pass merged payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId
      );

      // Task will be removed automatically in markMessageComplete() when status changes to Complete/Error
      // DO NOT remove here - allows UI to show task during entire execution

      if (agentResult && agentResult.success) {
        // Update message with result
        await this.updateConversationDetail(agentResponseMessage, agentResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', agentResult.suggestedResponses);

        // Server created artifacts - emit event to trigger UI reload
        if (agentResult.payload && Object.keys(agentResult.payload).length > 0) {
          this.artifactCreated.emit({
            artifactId: '',
            versionId: '',
            versionNumber: 0,
            conversationDetailId: agentResponseMessage.ID,
            name: ''
          });
          console.log('🎨 Server created artifact from single task execution');
          this.messageSent.emit(agentResponseMessage);
        }
      } else {
        // Handle failure
        const errorMsg = agentResult?.agentRun?.ErrorMessage || 'Agent execution failed';
        agentResponseMessage.Error = errorMsg;
        await this.updateConversationDetail(agentResponseMessage, `❌ **${agentName}** failed: ${errorMsg}`, 'Error');
      }

      // Mark user message as complete
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

    } catch (error) {
      console.error('❌ Error in single task execution:', error);
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Handle sub-agent invocation based on Sage's payload
   * Reuses the existing conversationManagerMessage to avoid creating multiple records
   */
  private async handleSubAgentInvocation(
    userMessage: ConversationDetailEntity,
    managerResult: ExecuteAgentResult,
    conversationId: string,
    conversationManagerMessage: ConversationDetailEntity
  ): Promise<void> {
    const payload = managerResult.payload;
    const agentName = payload.invokeAgent;
    const reasoning = payload.reasoning || 'Delegating to specialist agent';

    // Now create a NEW message for the sub-agent execution
    try {
      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = conversationManagerMessage.ID; // Thread under delegation message
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      // Set AgentID immediately for proper attribution
      if (agent?.ID) {
        agentResponseMessage.AgentID = agent.ID;
      }

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Add sub-agent to active tasks
      const newTaskId = this.activeTasks.add({
        agentName: agentName,
        status: 'Starting...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: agentResponseMessage.ID,
        conversationId: this.conversationId,
        conversationName: this.conversationName
      });

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = agent?.ID
        ? await this.loadPreviousPayloadForAgent(agent.ID)
        : { payload: null, artifactInfo: null };

      // Invoke the sub-agent with progress callback
      const subResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        reasoning,
        agentResponseMessage.ID,
        previousPayload, // Pass previous payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId
      );

      // Task will be removed automatically in markMessageComplete() when status changes to Complete/Error
      // DO NOT remove here - allows UI to show task during entire execution

      if (subResult && subResult.success) {
        // Update the response message with agent result
        // Store the agent ID for display
        if (subResult.agentRun.AgentID) {
          agentResponseMessage.AgentID = subResult.agentRun.AgentID;
        }

        await this.updateConversationDetail(agentResponseMessage, subResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', subResult.suggestedResponses);

        // Server created artifacts - emit event to trigger UI reload
        if (subResult.payload && Object.keys(subResult.payload).length > 0) {
          this.artifactCreated.emit({
            artifactId: '',
            versionId: '',
            versionNumber: 0,
            conversationDetailId: agentResponseMessage.ID,
            name: ''
          });
          console.log('🎨 Server created artifact for sub-agent message:', agentResponseMessage.ID);
          // Re-emit to trigger artifact display
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // Sub-agent failed - attempt auto-retry once
        console.log(`⚠️ ${agentName} failed, attempting auto-retry...`);

        await this.updateConversationDetail(conversationManagerMessage, `👉 **${agentName}** will handle this request...\n\n⚠️ First attempt failed, retrying...`, conversationManagerMessage.Status);

        // Update the existing agentResponseMessage to show retry status
        await this.updateConversationDetail(agentResponseMessage, "Retrying...", agentResponseMessage.Status);

        // Retry the sub-agent (reuse previously loaded payload from first attempt)
        const retryResult = await this.agentService.invokeSubAgent(
          agentName,
          conversationId,
          userMessage,
          this.conversationHistory,
          reasoning,
          agentResponseMessage.ID,
          previousPayload, // Pass same payload as first attempt
          this.createProgressCallback(agentResponseMessage, `${agentName} (retry)`),
          artifactInfo?.artifactId,
          artifactInfo?.versionId
        );

        if (retryResult && retryResult.success) {
          // Retry succeeded - update the same message
          if (retryResult.agentRun.AgentID) {
            agentResponseMessage.AgentID = retryResult.agentRun.AgentID;
          }

          await this.updateConversationDetail(agentResponseMessage, retryResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete');

          // Server created artifacts - emit event to trigger UI reload
          if (retryResult.payload && Object.keys(retryResult.payload).length > 0) {
            this.artifactCreated.emit({
              artifactId: '',
              versionId: '',
              versionNumber: 0,
              conversationDetailId: agentResponseMessage.ID,
              name: ''
            });
            this.messageSent.emit(agentResponseMessage);
          }

          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        } else {
          // Retry also failed - show error with manual retry option
          conversationManagerMessage.Error = retryResult?.agentRun?.ErrorMessage || null;
          await this.updateConversationDetail(conversationManagerMessage, `❌ **${agentName}** failed after retry\n\n${retryResult?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        }
      }
    } catch (error) {
      console.error(`❌ Error invoking sub-agent ${agentName}:`, error);

      conversationManagerMessage.Error = String(error);
      await this.updateConversationDetail(conversationManagerMessage, `❌ **${agentName}** encountered an error\n\n${String(error)}`, 'Error');

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Handle silent observation - when Sage stays silent,
   * check if we should continue with the last agent for iterative refinement
   */
  private async handleSilentObservation(
    userMessage: ConversationDetailEntity,
    conversationId: string
  ): Promise<void> {
    // Find the last AI message (excluding Sage) in the conversation history
    const lastAIMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(msg =>
        msg.Role === 'AI' &&
        msg.AgentID &&
        msg.AgentID !== this.converationManagerAgent?.ID
      );

    if (!lastAIMessage || !lastAIMessage.AgentID) {
      // No previous specialist agent - just mark user message as complete
      console.log('🔇 No previous specialist agent found - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    // Load the agent entity to get its name
    const previousAgent = AIEngineBase.Instance.Agents.find(a => a.ID === lastAIMessage.AgentID);
    if (!previousAgent) {
      console.warn('⚠️ Could not load previous agent - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    const agentName = previousAgent.Name || 'Agent';

    console.log(`🔄 Agent continuity: Continuing with ${agentName} (AgentID: ${lastAIMessage.AgentID})`);

    let previousPayload: any = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;

    // Use pre-loaded artifact data (no DB queries!)
    // Check both user-visible and system artifacts
    let artifacts = this.artifactsByDetailId?.get(lastAIMessage.ID);
    if (!artifacts || artifacts.length === 0) {
      artifacts = this.systemArtifactsByDetailId?.get(lastAIMessage.ID);
    }

    if (artifacts && artifacts.length > 0) {
      try {
        // Use the first artifact (should only be one OUTPUT per message)
        const artifact = artifacts[0];
        const version = await artifact.getVersion();
        if (version.Content) {
          previousPayload = JSON.parse(version.Content);
          previousArtifactInfo = {
            artifactId: artifact.artifactId,
            versionId: artifact.artifactVersionId,
            versionNumber: artifact.versionNumber
          };
          console.log('📦 Loaded previous OUTPUT artifact as payload for continuity', previousArtifactInfo);
        }
      } catch (error) {
        console.warn('⚠️ Could not parse previous artifact content:', error);
      }
    }

    // Create status message showing agent continuity
    const statusMessage = await this.dataCache.createConversationDetail(this.currentUser);

    statusMessage.ConversationID = conversationId;
    statusMessage.Role = 'AI';
    statusMessage.Message = `Continuing with **${agentName}** for refinement...`;
    statusMessage.ParentID = userMessage.ID;
    statusMessage.Status = 'Complete';
    statusMessage.HiddenToUser = false;
    statusMessage.AgentID = this.converationManagerAgent?.ID || null;

    await statusMessage.Save();
    this.messageSent.emit(statusMessage);

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing refinement...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: statusMessage.ID,
      conversationId: this.conversationId,
      conversationName: this.conversationName
    });

    try {
      // Invoke the agent with the previous payload
      const continuityResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        'Continuing previous work based on user feedback',
        statusMessage.ID,
        previousPayload,
        this.createProgressCallback(statusMessage, agentName),
        previousArtifactInfo?.artifactId,
        previousArtifactInfo?.versionId
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (continuityResult && continuityResult.success) {
        // Create response message
        const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

        agentResponseMessage.ConversationID = conversationId;
        agentResponseMessage.Role = 'AI';
        agentResponseMessage.Message = continuityResult.agentRun?.Message || `✅ **${agentName}** completed refinement`;
        agentResponseMessage.ParentID = statusMessage.ID;
        agentResponseMessage.Status = 'Complete';
        agentResponseMessage.HiddenToUser = false;
        agentResponseMessage.AgentID = lastAIMessage.AgentID;

        await agentResponseMessage.Save();
        this.messageSent.emit(agentResponseMessage);

        // Server created artifacts (handles versioning automatically) - emit event to trigger UI reload
        if (continuityResult.payload && Object.keys(continuityResult.payload).length > 0) {
          this.artifactCreated.emit({
            artifactId: '',
            versionId: '',
            versionNumber: 0,
            conversationDetailId: agentResponseMessage.ID,
            name: ''
          });
          console.log('🎨 Server created artifact (versioned) from agent continuity');
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // Agent failed
        statusMessage.Error = continuityResult?.agentRun?.ErrorMessage || null;
        await this.updateConversationDetail(statusMessage, `❌ **${agentName}** failed during refinement\n\n${continuityResult?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
    } catch (error) {
      console.error(`❌ Error in agent continuity with ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      statusMessage.Error = String(error);
      await this.updateConversationDetail(statusMessage, `❌ **${agentName}** encountered an error\n\n${String(error)}`, 'Error');

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }
 

  /**
   * Invoke an agent directly when mentioned with @ symbol
   * Bypasses Sage completely - no status messages
   */
  private async invokeAgentDirectly(
    userMessage: ConversationDetailEntity,
    agentMention: Mention,
    conversationId: string
  ): Promise<void> {
    const agentName = agentMention.name;

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: userMessage.ID,
      conversationId: this.conversationId,
      conversationName: this.conversationName
    });

    // Declare agentResponseMessage outside try block so it's accessible in catch
    let agentResponseMessage: ConversationDetailEntity | undefined = undefined;

    try {
      // Update user message status to In-Progress
      userMessage.Status = 'In-Progress';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = userMessage.ID;
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      // Set AgentID immediately for proper attribution
      if (agent?.ID) {
        agentResponseMessage.AgentID = agent.ID;
      }

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = agent?.ID
        ? await this.loadPreviousPayloadForAgent(agent.ID)
        : { payload: null, artifactInfo: null };

      // Invoke the agent directly
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        `User mentioned agent directly with @${agentName}`,
        agentResponseMessage.ID,
        previousPayload, // Pass previous payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId,
        agentMention.configurationId // Pass configuration preset ID
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (result && result.success) {
        if (result.agentRun.AgentID) {
          agentResponseMessage.AgentID = result.agentRun.AgentID;
        }

        // Multi-stage response handling (same logic as ambient Sage)
        // Stage 1: Check for task graph (multi-step orchestration)
        if (result.payload?.taskGraph) {
          console.log('📋 Task graph detected from @mention, starting task orchestration');
          await this.handleTaskGraphExecution(userMessage, result, conversationId, agentResponseMessage);
        }
        // Stage 2: Check for sub-agent invocation (single-step delegation)
        else if (result.agentRun.FinalStep === 'Success' && result.payload?.invokeAgent) {
          console.log('🎯 Sub-agent invocation detected from @mention');
          await this.handleSubAgentInvocation(userMessage, result, conversationId, agentResponseMessage);
        }
        // Stage 3: Normal chat response
        else {
          await this.updateConversationDetail(agentResponseMessage, result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', result.suggestedResponses)

          // Server created artifacts - emit event to trigger UI reload
          if (result.payload && Object.keys(result.payload).length > 0) {
            this.artifactCreated.emit({
              artifactId: '',
              versionId: '',
              versionNumber: 0,
              conversationDetailId: agentResponseMessage.ID,
              name: ''
            });
            this.messageSent.emit(agentResponseMessage);
          }

          // Mark user message as complete
          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        }
      } else {
        // Agent failed - update the existing message instead of creating a new one
        agentResponseMessage.Error = result?.agentRun?.ErrorMessage || null;
        await this.updateConversationDetail(agentResponseMessage, `❌ **@${agentName}** failed\n\n${result?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
    } catch (error) {
      console.error(`❌ Error invoking mentioned agent ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      // Update the existing agent response message if it was created
      if (agentResponseMessage) {
        agentResponseMessage.Error = String(error);
        await this.updateConversationDetail(agentResponseMessage, `❌ **@${agentName}** encountered an error\n\n${String(error)}`, 'Error');
      }

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Continue with the same agent from previous message (implicit continuation)
   * Bypasses Sage - no status messages
   *
   * @param targetArtifactVersionId Optional specific artifact version to use as payload (from intent check)
   */
  private async continueWithAgent(
    userMessage: ConversationDetailEntity,
    agentId: string,
    conversationId: string,
    targetArtifactVersionId?: string
  ): Promise<void> {
    // Load the agent entity to get its name
    const agent = AIEngineBase.Instance.Agents.find(a => a.ID === agentId);
    if (!agent) {
      console.warn('⚠️ Could not load agent for continuation - falling back to Sage');
      await this.processMessageThroughAgent(userMessage, { mentions: [], agentMention: null, userMentions: [] });
      return;
    }

    const agentName = agent.Name || 'Agent';

    let previousPayload: any = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;

    // Use targetArtifactVersionId if specified (from intent check)
    if (targetArtifactVersionId) {
      console.log('🎯 Using target artifact version from intent check:', targetArtifactVersionId);

      // Find the artifact in pre-loaded data (check both user-visible and system artifacts)
      for (const [detailId, artifacts] of (this.artifactsByDetailId?.entries() || [])) {
        const targetArtifact = artifacts.find(a => a.artifactVersionId === targetArtifactVersionId);
        if (targetArtifact) {
          try {
            // Lazy load the full version entity to get Content
            const version = await targetArtifact.getVersion();
            if (version.Content) {
              previousPayload = JSON.parse(version.Content);
              previousArtifactInfo = {
                artifactId: targetArtifact.artifactId,
                versionId: targetArtifact.artifactVersionId,
                versionNumber: targetArtifact.versionNumber
              };
              console.log('📦 Loaded target artifact version as payload', previousArtifactInfo);
            }
          } catch (error) {
            console.warn('⚠️ Could not load target artifact version:', error);
          }
          break;
        }
      }

      // If not found in user-visible artifacts, check system artifacts
      if (!previousPayload && this.systemArtifactsByDetailId) {
        for (const [detailId, artifacts] of this.systemArtifactsByDetailId.entries()) {
          const targetArtifact = artifacts.find(a => a.artifactVersionId === targetArtifactVersionId);
          if (targetArtifact) {
            try {
              const version = await targetArtifact.getVersion();
              if (version.Content) {
                previousPayload = JSON.parse(version.Content);
                previousArtifactInfo = {
                  artifactId: targetArtifact.artifactId,
                  versionId: targetArtifact.artifactVersionId,
                  versionNumber: targetArtifact.versionNumber
                };
                console.log('📦 Loaded target artifact version as payload (from system artifacts)', previousArtifactInfo);
              }
            } catch (error) {
              console.warn('⚠️ Could not load target artifact version:', error);
            }
            break;
          }
        }
      }
    }

    // Fall back to most recent artifact if no target specified or target not found
    if (!previousPayload) {
      console.log('📦 Using most recent artifact from last agent message');

      // Find the last AI message from this same agent
      const lastAIMessage = this.conversationHistory
        .slice()
        .reverse()
        .find(msg => msg.Role === 'AI' && msg.AgentID === agentId);

      if (lastAIMessage) {
        // Get artifacts from pre-loaded data (check both user-visible and system artifacts)
        let artifacts = this.artifactsByDetailId?.get(lastAIMessage.ID);
        if (!artifacts || artifacts.length === 0) {
          artifacts = this.systemArtifactsByDetailId?.get(lastAIMessage.ID);
        }

        if (artifacts && artifacts.length > 0) {
          try {
            // Use the first artifact (should only be one OUTPUT per message)
            const artifact = artifacts[0];
            const version = await artifact.getVersion();
            if (version.Content) {
              previousPayload = JSON.parse(version.Content);
              previousArtifactInfo = {
                artifactId: artifact.artifactId,
                versionId: artifact.artifactVersionId,
                versionNumber: artifact.versionNumber
              };
              console.log('📦 Loaded most recent artifact as payload', previousArtifactInfo);
            }
          } catch (error) {
            console.warn('⚠️ Could not parse artifact content:', error);
          }
        }
      }
    }

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: userMessage.ID,
      conversationId: this.conversationId,
      conversationName: this.conversationName
    });

    // Declare agentResponseMessage outside try block so it's accessible in catch
    let agentResponseMessage: ConversationDetailEntity | undefined = undefined;

    try {
      // Update user message status to In-Progress
      userMessage.Status = 'In-Progress';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = userMessage.ID;
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      agentResponseMessage.AgentID = agentId;

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Invoke the agent directly (continuation) with previous payload if available
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        'Continuing previous conversation with user',
        agentResponseMessage.ID,
        previousPayload, // Pass previous OUTPUT artifact payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        previousArtifactInfo?.artifactId,
        previousArtifactInfo?.versionId
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (result && result.success) {
        // Update the response message with agent result
        await this.updateConversationDetail(agentResponseMessage,result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', result.suggestedResponses);

        // Server created artifacts (handles versioning) - emit event to trigger UI reload
        if (result.payload && Object.keys(result.payload).length > 0) {
          this.artifactCreated.emit({
            artifactId: '',
            versionId: '',
            versionNumber: 0,
            conversationDetailId: agentResponseMessage.ID,
            name: ''
          });
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // Agent failed - update the existing message instead of creating a new one
        agentResponseMessage.Error = result?.agentRun?.ErrorMessage || null;
        await this.updateConversationDetail(agentResponseMessage, `❌ **${agentName}** failed\n\n${result?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
    } catch (error) {
      console.error(`❌ Error continuing with agent ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      // Update the existing agent response message if it was created
      if (agentResponseMessage) {
        agentResponseMessage.Error = String(error);
        await this.updateConversationDetail(agentResponseMessage, `❌ **${agentName}** encountered an error\n\n${String(error)}`, 'Error');
      }

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Name the conversation based on the first message using GraphQL AI client
   */
  private async nameConversation(message: string): Promise<void> {
    try {
      console.log('🏷️ Naming conversation based on first message...');

      // Load the Name Conversation prompt to get its ID
      await AIEngineBase.Instance.Config(false);
      const p = AIEngineBase.Instance.Prompts.find(pr => pr.Name === 'Name Conversation');
      if (!p) {
        console.warn('⚠️ Name Conversation prompt not found');
        return;
      }

      const promptId = p.ID;

      // Use GraphQL AI client to run the prompt (same client as agent)
      const provider = Metadata.Provider as GraphQLDataProvider;
      if (!provider) {
        console.warn('⚠️ GraphQLDataProvider not available');
        return;
      }

      const aiClient = new GraphQLAIClient(provider);
      const result = await aiClient.RunAIPrompt({
        promptId: promptId,
        messages: [{ role: 'user', content: message }],
      });

      if (result && result.success && (result.parsedResult || result.output)) {
        // Use parsedResult if available, otherwise parse output
        const parsed = result.parsedResult ||
          (result.output ? JSON.parse(result.output) : null);

        if (parsed) {
          const { name, description } = parsed;

          if (name) {
            console.log('✅ Generated conversation name:', { name, description });

            // Update the conversation name and description in database AND state immediately
            await this.conversationState.saveConversation(
              this.conversationId,
              { Name: name, Description: description || '' },
              this.currentUser
            );

            console.log('💾 Conversation name updated in database and UI');

            // Emit event for animation in conversation list
            this.conversationRenamed.emit({
              conversationId: this.conversationId,
              name: name,
              description: description || ''
            });
          }
        }
      } else {
        console.warn('⚠️ Failed to generate conversation name');
      }
    } catch (error) {
      console.error('❌ Error naming conversation:', error);
      // Don't show error to user - naming failures should be silent
    }
  }

  /**
   * Marks a conversation detail as complete and records timestamp to prevent race conditions
   * Emits event to parent to refresh agent run data from database
   */
  private markMessageComplete(conversationDetail: ConversationDetailEntity): void {
    const now = Date.now();
    this.completionTimestamps.set(conversationDetail.ID, now);

    // Unregister streaming callback for this message (no more updates needed)
    const callback = this.registeredCallbacks.get(conversationDetail.ID);
    if (callback) {
      this.streamingService.unregisterMessageCallback(conversationDetail.ID, callback);
      this.registeredCallbacks.delete(conversationDetail.ID);
      console.log(`[MarkComplete] Unregistered streaming callback for completed message ${conversationDetail.ID}`);
    }

    // Remove task from active tasks if it exists
    const task = this.activeTasks.getByConversationDetailId(conversationDetail.ID);
    if (task) {
      console.log(`✅ Task found for message ${conversationDetail.ID} - removing from active tasks:`, {
        taskId: task.id,
        agentName: task.agentName,
        conversationId: task.conversationId,
        conversationName: task.conversationName
      });

      this.activeTasks.remove(task.id);

      // Show completion notification
      MJNotificationService.Instance?.CreateSimpleNotification(
        `${task.agentName} completed in ${task.conversationName || 'conversation'}`,
        'success',
        3000
      );
    } else {
      console.warn(`⚠️ No task found for completed message ${conversationDetail.ID} - task may have been removed prematurely or not added`);
    }

    // Emit completion event to parent so it can refresh agent run data
    this.messageComplete.emit({
      conversationDetailId: conversationDetail.ID,
      agentRunId: (conversationDetail as any).AgentRunID
    });
  }

  /**
   * Cleans up completion timestamps for completed messages (prevents memory leak)
   */
  private cleanupCompletionTimestamp(conversationDetailId: string): void {
    // Keep timestamp for a short period to catch any late progress updates
    setTimeout(() => {
      this.completionTimestamps.delete(conversationDetailId);
    }, 5000); // 5 seconds should be more than enough
  }
}
