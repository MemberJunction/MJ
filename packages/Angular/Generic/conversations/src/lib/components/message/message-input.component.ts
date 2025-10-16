import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { ConversationDetailEntity, AIPromptEntity, ArtifactEntity, ArtifactVersionEntity, ConversationDetailArtifactEntity, AIAgentEntityExtended, ConversationDetailEntityType } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ConversationStateService } from '../../services/conversation-state.service';
import { DataCacheService } from '../../services/data-cache.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ExecuteAgentResult, AgentExecutionProgressCallback, BaseAgentSuggestedResponse } from '@memberjunction/ai-core-plus';
import { MentionAutocompleteService, MentionSuggestion } from '../../services/mention-autocomplete.service';
import { MentionParserService } from '../../services/mention-parser.service';
import { Mention, MentionParseResult } from '../../models/conversation-state.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'mj-message-input',
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.scss'
})
export class MessageInputComponent implements OnInit, OnDestroy {
  // Default artifact type ID for JSON (when agent doesn't specify DefaultArtifactTypeID)
  private readonly JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';

  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() placeholder: string = 'Type a message... (Ctrl+Enter to send)';
  @Input() parentMessageId?: string; // Optional: for replying in threads
  @Input() conversationHistory: ConversationDetailEntity[] = []; // For agent context

  @Output() messageSent = new EventEmitter<ConversationDetailEntity>();
  @Output() agentResponse = new EventEmitter<{message: ConversationDetailEntity, agentResult: any}>();
  @Output() agentRunDetected = new EventEmitter<{conversationDetailId: string; agentRunId: string}>();
  @Output() artifactCreated = new EventEmitter<{artifactId: string; versionId: string; versionNumber: number; conversationDetailId: string; name: string}>();
  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();

  @ViewChild('messageTextarea') messageTextarea!: ElementRef;

  public messageText: string = '';
  public isSending: boolean = false;
  public isProcessing: boolean = false; // True when waiting for agent/naming response
  public processingMessage: string = 'AI is responding...'; // Message shown during processing
  public converationManagerAgent: AIAgentEntityExtended | null = null;

  // Mention autocomplete state
  public showMentionDropdown: boolean = false;
  public mentionSuggestions: MentionSuggestion[] = [];
  public mentionDropdownPosition: { top: number; left: number } = { top: 0, left: 0 };
  public mentionDropdownShowAbove: boolean = false; // Controls transform direction
  private mentionStartIndex: number = -1;
  private mentionQuery: string = '';

  // PubSub subscription for task progress updates
  private pushStatusSubscription?: Subscription;
  // Track active task execution message IDs for real-time updates
  private activeTaskExecutionMessageIds = new Set<string>();
  // Track completion timestamps to prevent race conditions with late progress updates
  private completionTimestamps = new Map<string, number>();

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private agentService: ConversationAgentService,
    private conversationState: ConversationStateService,
    private dataCache: DataCacheService,
    private activeTasks: ActiveTasksService,
    private mentionAutocomplete: MentionAutocompleteService,
    private mentionParser: MentionParserService
  ) {}

  async ngOnInit() {
    this.converationManagerAgent = await this.agentService.getConversationManagerAgent();

    // Initialize mention autocomplete
    await this.mentionAutocomplete.initialize(this.currentUser);

    // Subscribe to PubSub for task progress updates
    this.subscribeToPushStatus();
  }

  ngOnDestroy() {
    // Clean up PubSub subscription
    if (this.pushStatusSubscription) {
      this.pushStatusSubscription.unsubscribe();
    }
  }

  /**
   * Subscribe to PubSub for real-time task orchestration progress updates
   */
  private subscribeToPushStatus() {
    const dataProvider = GraphQLDataProvider.Instance;
    this.pushStatusSubscription = dataProvider.PushStatusUpdates().subscribe((status: any) => {
      if (!status || !status.message) return;

      try {
        const statusObj = JSON.parse(status.message);

        // Filter for TaskOrchestrator messages
        if (statusObj.resolver === 'TaskOrchestrator') {
          this.handleTaskProgress(statusObj);
        }
      } catch (error) {
        console.error('Error parsing push status update:', error);
      }
    });
  }

  /**
   * Handle task progress updates from PubSub
   */
  private async handleTaskProgress(statusObj: any) {
    if (statusObj.type === 'TaskProgress') {
      // High-level task progress
      const { taskName, message, percentComplete } = statusObj.data;
      console.log(`[Task Progress] ${taskName}: ${message} (${percentComplete}%)`);

      // Update any active task execution messages
      await this.updateTaskExecutionMessages(taskName, message, percentComplete);
    } else if (statusObj.type === 'AgentProgress') {
      // Detailed agent progress (shown as smaller sub-text)
      const { taskName, agentStep, agentMessage } = statusObj.data;
      console.log(`[Agent Progress] ${taskName} → ${agentStep}: ${agentMessage}`);

      // Update with agent details
      await this.updateTaskExecutionMessages(taskName, `${agentStep}: ${agentMessage}`, undefined, true);
    }
  }

  /**
   * Update task execution messages in real-time based on progress updates
   */
  private async updateTaskExecutionMessages(
    taskName: string,
    progressMessage: string,
    percentComplete?: number,
    isAgentDetail: boolean = false
  ) {
    // Update all active task execution messages using the cache
    for (const messageId of this.activeTaskExecutionMessageIds) {
      try {
        // Get message from cache (single source of truth)
        const message = await this.dataCache.getConversationDetail(messageId, this.currentUser);
        if (!message) {
          console.warn(`Task execution message ${messageId} not found in cache`);
          continue;
        }

        // Skip if already complete
        if (message.Status === 'Complete' || message.Status === 'Error') {
          continue;
        }

        // Build progress message
        let updatedMessage = message.Message || '';

        if (isAgentDetail) {
          // Agent details shown as sub-text
          updatedMessage = `⏳ **${taskName}**\n\n_${progressMessage}_`;
        } else if (percentComplete != null) {
          updatedMessage = `⏳ **${taskName}** (${percentComplete}%)\n\n${progressMessage}`;
        } else {
          updatedMessage = `⏳ **${taskName}**\n\n${progressMessage}`;
        }

        message.Message = updatedMessage;
        // Use safe save to prevent race conditions with completion
        const saved = await this.safeSaveConversationDetail(message, `TaskProgress:${taskName}`);
        if (saved) {
          this.messageSent.emit(message);

          // Also update the ActiveTasksService to keep the tasks dropdown in sync
          this.activeTasks.updateStatusByConversationDetailId(message.ID, progressMessage);
        }
      } catch (error) {
        console.error('Error updating task execution message:', error);
      }
    }
  }

  get canSend(): boolean {
    return !this.disabled && !this.isSending && this.messageText.trim().length > 0;
  }

  /**
   * Handle input events to detect @ mentions
   */
  onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const cursorPos = textarea.selectionStart;
    const text = textarea.value;

    // Check if we're typing after an @ symbol
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\S*)$/);

    if (mentionMatch) {
      // We found an @ mention being typed
      this.mentionStartIndex = cursorPos - mentionMatch[0].length;
      this.mentionQuery = mentionMatch[1] || '';

      console.log('[MentionInput] Detected @mention:', this.mentionQuery);

      // Get suggestions
      this.mentionSuggestions = this.mentionAutocomplete.getSuggestions(this.mentionQuery);

      console.log('[MentionInput] Got suggestions:', this.mentionSuggestions.length, this.mentionSuggestions);

      // Calculate dropdown position
      this.calculateDropdownPosition(textarea);

      // Show dropdown if we have suggestions OR to show empty state
      this.showMentionDropdown = true;
      console.log('[MentionInput] Showing dropdown:', this.showMentionDropdown);
    } else {
      // No @ mention, close dropdown
      this.closeMentionDropdown();
    }
  }

  /**
   * Handle keydown events in the textarea
   * - Enter alone: Send message (unless dropdown is open)
   * - Shift+Enter: Add new line
   * - Arrow keys, Tab, Escape: Handle mention dropdown if open
   */
  onKeyDown(event: KeyboardEvent): void {
    // If mention dropdown is open, let it handle certain keys
    if (this.showMentionDropdown) {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
        // These keys are handled by the dropdown component
        return;
      }
    }

    // Regular key handling
    if (event.key === 'Enter' && !event.shiftKey) {
      // Prevent default behavior (adding newline)
      event.preventDefault();

      // Send the message
      this.onSend();
    }
    // If Shift+Enter, allow default behavior (add newline)
  }

  /**
   * Calculate position for mention dropdown
   * Keeps dropdown anchored to textarea edge regardless of content size
   */
  private calculateDropdownPosition(textarea: HTMLTextAreaElement): void {
    const rect = textarea.getBoundingClientRect();
    const container = textarea.closest('.message-input-container');
    const containerRect = container?.getBoundingClientRect();

    if (!containerRect) {
      // Fallback to absolute positioning
      this.mentionDropdownPosition = {
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      };
      return;
    }

    // Check if there's enough space below the textarea
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    this.mentionDropdownShowAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

    // Position relative to the container
    // Always anchor to the textarea edge so dropdown stays in place as content changes
    if (this.mentionDropdownShowAbove) {
      // Show above the textarea - anchor to the TOP of the textarea
      // CSS transform will make it grow upward from this anchor point
      this.mentionDropdownPosition = {
        top: rect.top - containerRect.top - 4, // Anchor just above textarea
        left: rect.left - containerRect.left
      };
    } else {
      // Show below the textarea (default) - anchor to the BOTTOM of the textarea
      this.mentionDropdownPosition = {
        top: rect.bottom - containerRect.top + 4,
        left: rect.left - containerRect.left
      };
    }
  }

  /**
   * Handle mention suggestion selection
   */
  onMentionSelected(suggestion: MentionSuggestion): void {
    if (this.mentionStartIndex === -1) return;

    const textarea = this.messageTextarea.nativeElement;
    const cursorPos = textarea.selectionStart;

    // Replace the @mention text with the selected name
    const beforeMention = this.messageText.substring(0, this.mentionStartIndex);
    const afterMention = this.messageText.substring(cursorPos);

    // If name has spaces, wrap in quotes
    const mentionText = suggestion.displayName.includes(' ')
      ? `@"${suggestion.displayName}" `
      : `@${suggestion.displayName} `;

    this.messageText = beforeMention + mentionText + afterMention;

    // Close dropdown
    this.closeMentionDropdown();

    // Set cursor position after the mention
    const newCursorPos = beforeMention.length + mentionText.length;
    setTimeout(() => {
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
      textarea.focus();
    }, 0);
  }

  /**
   * Close mention dropdown
   */
  closeMentionDropdown(): void {
    this.showMentionDropdown = false;
    this.mentionSuggestions = [];
    this.mentionStartIndex = -1;
    this.mentionQuery = '';
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

    const intent = await this.checkContinuityIntent(lastAgentId, messageDetail.Message);

    if (intent === 'YES') {
      console.log('✅ Intent check: YES - continuing with previous agent');
      await this.executeRouteWithNaming(
        () => this.continueWithAgent(messageDetail, lastAgentId, this.conversationId),
        messageDetail.Message,
        isFirstMessage
      );
    } else {
      console.log(`🤖 Intent check: ${intent} - routing through Sage for evaluation`);
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
   * Shows UI indicator during check
   */
  private async checkContinuityIntent(agentId: string, message: string): Promise<'YES' | 'NO' | 'UNSURE'> {
    this.processingMessage = 'Analyzing intent...';
    this.isProcessing = true;

    try {
      const intent = await this.agentService.checkAgentContinuityIntent(
        agentId,
        message,
        this.conversationHistory
      );
      return intent;
    } catch (error) {
      console.error('❌ Intent check failed, defaulting to UNSURE:', error);
      return 'UNSURE';
    } finally {
      this.processingMessage = 'AI is responding...';
      this.isProcessing = false;
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
      if (this.messageTextarea?.nativeElement) {
        this.messageTextarea.nativeElement.focus();
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
      // Extract agentRunId from progress metadata
      const progressAgentRunId = progress.metadata?.agentRunId as string | undefined;

      // Capture the agent run ID from the first progress message
      if (!capturedAgentRunId && progressAgentRunId) {
        capturedAgentRunId = progressAgentRunId;
        console.log(`[${agentName}] 📌 Captured agent run ID: ${capturedAgentRunId} for conversation detail: ${conversationDetail.ID}`);
      }

      // Filter out progress messages from other concurrent agents
      // This prevents cross-contamination when multiple agents run in parallel
      if (capturedAgentRunId && progressAgentRunId && progressAgentRunId !== capturedAgentRunId) {
        console.log(`[${agentName}] 🚫 Ignoring progress from different agent run (expected: ${capturedAgentRunId}, got: ${progressAgentRunId})`);
        return;
      }

      // Format progress message with visual indicator
      const progressText = progress.message;

      // Update the active task with progress details (if it exists)
      this.activeTasks.updateStatusByConversationDetailId(conversationDetail.ID, progressText);

      // Update the ConversationDetail message in real-time
      try {
        if (conversationDetail) {
          console.log(`[${agentName}] Got conversation detail from cache - Status: ${conversationDetail.Status}, ID: ${conversationDetail.ID}`);

          // Check 1: Skip if message is already complete or errored
          if (conversationDetail.Status === 'Complete' || conversationDetail.Status === 'Error') {
            console.log(`[${agentName}] ⛔ Skipping progress update - message status is ${conversationDetail.Status}`);
            return;
          }

          // Check 2: Skip if message was marked as completed (prevents race condition)
          // Once a message is marked complete, we reject ALL further progress updates
          const completionTime = this.completionTimestamps.get(conversationDetail.ID);
          if (completionTime) {
            console.log(`[${agentName}] ⛔ Skipping progress update - message was marked complete at ${completionTime}`);
            return;
          }

          // Emit agentRunId if we have it (for parent to track)
          if (progressAgentRunId) {
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
        conversationDetailId: conversationManagerMessage.ID
      });

      const result = await this.agentService.processMessage(
        conversationId,
        userMessage,
        this.conversationHistory,
        conversationManagerMessage.ID,
        this.createProgressCallback(conversationManagerMessage, 'Sage')
      );

      // Remove Sage from active tasks
      if (taskId) {
        this.activeTasks.remove(taskId);
        taskId = null;
      }

      if (!result || !result.success) {
        // Evaluation failed - mark as complete to stop progress updates
        this.markMessageComplete(conversationManagerMessage);

        conversationManagerMessage.Status = 'Error';
        conversationManagerMessage.Message = `❌ Evaluation failed`;
        conversationManagerMessage.Error = result?.agentRun?.ErrorMessage || 'Agent evaluation failed';
        await conversationManagerMessage.Save();
        this.messageSent.emit(conversationManagerMessage);

        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
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
          this.activeTasks.remove(taskId);
        }
      }
      // Stage 3: Check for sub-agent invocation (single-step delegation)
      else if (result.agentRun.FinalStep === 'Success' && result.payload?.invokeAgent) {
        // Reuse the existing conversationManagerMessage instead of creating new ones
        await this.handleSubAgentInvocation(userMessage, result, this.conversationId, conversationManagerMessage);
        // Remove CM from active tasks
        if (taskId) {
          this.activeTasks.remove(taskId);
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
        if (result.payload && Object.keys(result.payload).length > 0) {
          await this.createArtifactFromPayload(result.payload, conversationManagerMessage, result.agentRun.AgentID);
          console.log('🎨 Artifact created and linked to Sage message');
          this.messageSent.emit(conversationManagerMessage);
        }

        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);

        // Remove CM from active tasks
        if (taskId) {
          this.activeTasks.remove(taskId);
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
          this.activeTasks.remove(taskId);
        }
      }

    } catch (error) {
      console.error('❌ Error processing message through agents:', error);

      // Update conversationManagerMessage status to Error
      if (conversationManagerMessage && conversationManagerMessage.ID) {
        // Mark as complete to stop progress updates
        this.markMessageComplete(conversationManagerMessage);

        conversationManagerMessage.Status = 'Error';
        conversationManagerMessage.Message = `❌ Error: ${String(error)}`;
        conversationManagerMessage.Error = String(error);
        await conversationManagerMessage.Save();
        this.messageSent.emit(conversationManagerMessage);

        // Clean up completion timestamp
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
      }

      // Mark user message as complete
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Clean up active task
      if (taskId) {
        this.activeTasks.remove(taskId);
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

    const md = new Metadata();

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

    // Register for real-time updates via PubSub
    this.activeTaskExecutionMessageIds.add(taskExecutionMessage.ID);

    try {
      // Get environment ID from user
      const environmentId = (this.currentUser as any).EnvironmentID || 'F51358F3-9447-4176-B313-BF8025FD8D09';

      // Get session ID for PubSub
      const sessionId = (GraphQLDataProvider.Instance as any).sessionId || '';

      // Step 3: Call ExecuteTaskGraph mutation (links to taskExecutionMessage)
      const mutation = `
        mutation ExecuteTaskGraph($taskGraphJson: String!, $conversationDetailId: String!, $environmentId: String!, $sessionId: String!) {
          ExecuteTaskGraph(
            taskGraphJson: $taskGraphJson
            conversationDetailId: $conversationDetailId
            environmentId: $environmentId
            sessionId: $sessionId
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
        sessionId: sessionId
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
        taskExecutionMessage.Message = `✅ **${workflowName}** completed successfully`;
        taskExecutionMessage.Status = 'Complete';
      } else {
        const errorMsg = result?.ExecuteTaskGraph?.errorMessage || 'Unknown error';
        console.error('❌ Task graph execution failed:', errorMsg);
        taskExecutionMessage.Message = `❌ **${workflowName}** failed: ${errorMsg}`;
        taskExecutionMessage.Status = 'Error';
        taskExecutionMessage.Error = errorMsg;
      }

      await taskExecutionMessage.Save();
      this.messageSent.emit(taskExecutionMessage);

      // Unregister from real-time updates (task complete)
      this.activeTaskExecutionMessageIds.delete(taskExecutionMessage.ID);

      // Mark user message as complete
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

    } catch (error) {
      console.error('❌ Error executing task graph:', error);
      taskExecutionMessage.Message = `❌ **${workflowName}** - Error: ${String(error)}`;
      taskExecutionMessage.Status = 'Error';
      taskExecutionMessage.Error = String(error);
      await taskExecutionMessage.Save();
      this.messageSent.emit(taskExecutionMessage);

      // Unregister from real-time updates (task failed)
      this.activeTaskExecutionMessageIds.delete(taskExecutionMessage.ID);

      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
    }
  }

  protected async updateConversationDetail(convoDetail: ConversationDetailEntity, message: string, status: 'In-Progress' | 'Complete' | 'Error', suggestedResponses?: BaseAgentSuggestedResponse[]): Promise<void> {
    if (convoDetail.Status === 'Complete' || convoDetail.Status === 'Error') {
      return; // Do not update completed or errored messages
    }

    // Mark as completing BEFORE updating if status is Complete or Error
    if (status === 'Complete' || status === 'Error') {
      this.markMessageComplete(convoDetail);
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
        conversationDetailId: agentResponseMessage.ID
      });

      // Invoke agent with task's input payload
      const agentResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        task.description || task.name,
        agentResponseMessage.ID,
        task.inputPayload, // Pass the task's input payload
        this.createProgressCallback(agentResponseMessage, agentName)
      );

      // Remove from active tasks
      this.activeTasks.remove(newTaskId);

      if (agentResult && agentResult.success) {
        // Update message with result
        await this.updateConversationDetail(agentResponseMessage, agentResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete');

        // Handle artifacts
        if (agentResult.payload && Object.keys(agentResult.payload).length > 0) {
          await this.createArtifactFromPayload(agentResult.payload, agentResponseMessage, agentResult.agentRun.AgentID);
          console.log('🎨 Artifact created from single task execution');
          this.messageSent.emit(agentResponseMessage);
        }
      } else {
        // Handle failure
        const errorMsg = agentResult?.agentRun?.ErrorMessage || 'Agent execution failed';
        agentResponseMessage.Message = `❌ **${agentName}** failed: ${errorMsg}`;
        agentResponseMessage.Status = 'Error';
        agentResponseMessage.Error = errorMsg;

        await agentResponseMessage.Save();
        this.messageSent.emit(agentResponseMessage);
      }

      // Mark user message as complete
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

    } catch (error) {
      console.error('❌ Error in single task execution:', error);
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
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
        conversationDetailId: agentResponseMessage.ID
      });

      // Invoke the sub-agent with progress callback
      const subResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        reasoning,
        agentResponseMessage.ID,
        undefined, // no payload for initial invocation
        this.createProgressCallback(agentResponseMessage, agentName)
      );

      // Remove from active tasks
      this.activeTasks.remove(newTaskId);

      if (subResult && subResult.success) {
        // Update the response message with agent result
        // Store the agent ID for display
        if (subResult.agentRun.AgentID) {
          agentResponseMessage.AgentID = subResult.agentRun.AgentID;
        }
        
        await this.updateConversationDetail(agentResponseMessage, subResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete');

        // Handle artifacts from sub-agent if any
        if (subResult.payload && Object.keys(subResult.payload).length > 0) {
          await this.createArtifactFromPayload(subResult.payload, agentResponseMessage, subResult.agentRun.AgentID);
          console.log('🎨 Artifact created and linked to sub-agent message:', agentResponseMessage.ID);
          // Re-emit to trigger artifact display
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      } else {
        // Sub-agent failed - attempt auto-retry once
        console.log(`⚠️ ${agentName} failed, attempting auto-retry...`);

        await this.updateConversationDetail(conversationManagerMessage, `👉 **${agentName}** will handle this request...\n\n⚠️ First attempt failed, retrying...`, conversationManagerMessage.Status);

        // Update the existing agentResponseMessage to show retry status
        await this.updateConversationDetail(agentResponseMessage, "Retrying...", agentResponseMessage.Status);

        // Retry the sub-agent
        const retryResult = await this.agentService.invokeSubAgent(
          agentName,
          conversationId,
          userMessage,
          this.conversationHistory,
          reasoning,
          agentResponseMessage.ID,
          undefined, // no payload for retry
          this.createProgressCallback(agentResponseMessage, `${agentName} (retry)`)
        );

        if (retryResult && retryResult.success) {
          // Retry succeeded - update the same message
          if (retryResult.agentRun.AgentID) {
            agentResponseMessage.AgentID = retryResult.agentRun.AgentID;
          }

          await this.updateConversationDetail(agentResponseMessage, retryResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete');

          // Handle artifacts
          if (retryResult.payload && Object.keys(retryResult.payload).length > 0) {
            await this.createArtifactFromPayload(retryResult.payload, agentResponseMessage, retryResult.agentRun.AgentID);
            this.messageSent.emit(agentResponseMessage);
          }

          userMessage.Status = 'Complete';
          await userMessage.Save();
          this.messageSent.emit(userMessage);
        } else {
          // Retry also failed - show error with manual retry option
          conversationManagerMessage.Status = 'Error';
          conversationManagerMessage.Message = `❌ **${agentName}** failed after retry\n\n${retryResult?.agentRun?.ErrorMessage || 'Unknown error'}`;
          conversationManagerMessage.Error = retryResult?.agentRun?.ErrorMessage || null;
          await conversationManagerMessage.Save();
          this.messageSent.emit(conversationManagerMessage);

          userMessage.Status = 'Complete'; // Don't mark user message as error
          await userMessage.Save();
          this.messageSent.emit(userMessage);
        }
      }
    } catch (error) {
      console.error(`❌ Error invoking sub-agent ${agentName}:`, error);

      conversationManagerMessage.Status = 'Error';
      conversationManagerMessage.Message = `❌ **${agentName}** encountered an error\n\n${String(error)}`;
      conversationManagerMessage.Error = String(error);
      await conversationManagerMessage.Save();
      this.messageSent.emit(conversationManagerMessage);

      userMessage.Status = 'Complete'; // Don't mark user message as error
      await userMessage.Save();
      this.messageSent.emit(userMessage);
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
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
      return;
    }

    // Load the agent entity to get its name
    const rv = new RunView();
    const agentResult = await rv.RunView<AIAgentEntityExtended>({
      EntityName: 'AI Agents',
      ExtraFilter: `ID='${lastAIMessage.AgentID}'`,
      ResultType: 'entity_object'
    }, this.currentUser);

    if (!agentResult.Success || !agentResult.Results || agentResult.Results.length === 0) {
      console.warn('⚠️ Could not load previous agent - marking complete');
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
      return;
    }

    const previousAgent = agentResult.Results[0];
    const agentName = previousAgent.Name || 'Agent';

    console.log(`🔄 Agent continuity: Continuing with ${agentName} (AgentID: ${lastAIMessage.AgentID})`);

    // Load the OUTPUT artifact from the last agent message
    const artifactResult = await rv.RunView<ConversationDetailArtifactEntity>({
      EntityName: 'MJ: Conversation Detail Artifacts',
      ExtraFilter: `ConversationDetailID='${lastAIMessage.ID}' AND Direction='Output'`,
      ResultType: 'entity_object'
    }, this.currentUser);

    let previousPayload: any = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;

    if (artifactResult.Success && artifactResult.Results && artifactResult.Results.length > 0) {
      // Load the artifact version content
      const junctionRecord = artifactResult.Results[0];
      const versionResult = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID='${junctionRecord.ArtifactVersionID}'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (versionResult.Success && versionResult.Results && versionResult.Results.length > 0) {
        const version = versionResult.Results[0];
        if (version.Content) {
          try {
            previousPayload = JSON.parse(version.Content);
            previousArtifactInfo = {
              artifactId: version.ArtifactID,
              versionId: version.ID,
              versionNumber: version.VersionNumber || 1
            };
            console.log('📦 Loaded previous OUTPUT artifact as payload for continuity', previousArtifactInfo);
          } catch (error) {
            console.warn('⚠️ Could not parse previous artifact content:', error);
          }
        }
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
      conversationDetailId: statusMessage.ID
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
        this.createProgressCallback(statusMessage, agentName)
      );

      // Remove from active tasks
      this.activeTasks.remove(taskId);

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

        // Handle artifacts from agent if any - create new version if continuing same agent
        if (continuityResult.payload && Object.keys(continuityResult.payload).length > 0) {
          await this.createArtifactFromPayload(
            continuityResult.payload,
            agentResponseMessage,
            lastAIMessage.AgentID,
            previousArtifactInfo // Pass artifact info to create new version
          );
          console.log('🎨 Artifact created from agent continuity');
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      } else {
        // Agent failed
        statusMessage.Status = 'Error';
        statusMessage.Message = `❌ **${agentName}** failed during refinement\n\n${continuityResult?.agentRun?.ErrorMessage || 'Unknown error'}`;
        statusMessage.Error = continuityResult?.agentRun?.ErrorMessage || null;
        await statusMessage.Save();
        this.messageSent.emit(statusMessage);

        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      }
    } catch (error) {
      console.error(`❌ Error in agent continuity with ${agentName}:`, error);

      this.activeTasks.remove(taskId);

      statusMessage.Status = 'Error';
      statusMessage.Message = `❌ **${agentName}** encountered an error\n\n${String(error)}`;
      statusMessage.Error = String(error);
      await statusMessage.Save();
      this.messageSent.emit(statusMessage);

      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
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
      conversationDetailId: userMessage.ID
    });

    try {
      // Update user message status to In-Progress
      userMessage.Status = 'In-Progress';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

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

      // Invoke the agent directly
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        `User mentioned agent directly with @${agentName}`,
        agentResponseMessage.ID,
        undefined, // no payload for direct mention
        this.createProgressCallback(agentResponseMessage, agentName)
      );

      // Remove from active tasks
      this.activeTasks.remove(taskId);

      if (result && result.success) {
        if (result.agentRun.AgentID) {
          agentResponseMessage.AgentID = result.agentRun.AgentID;
        }

        await this.updateConversationDetail(agentResponseMessage, result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete')

        // Handle artifacts
        if (result.payload && Object.keys(result.payload).length > 0) {
          await this.createArtifactFromPayload(result.payload, agentResponseMessage, result.agentRun.AgentID);
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      } else {
        // Agent failed - create error message
        const errorMessage = await this.dataCache.createConversationDetail(this.currentUser);

        errorMessage.ConversationID = conversationId;
        errorMessage.Role = 'AI';
        errorMessage.Message = `❌ **@${agentName}** failed\n\n${result?.agentRun?.ErrorMessage || 'Unknown error'}`;
        errorMessage.ParentID = userMessage.ID;
        errorMessage.Status = 'Error';
        errorMessage.Error = result?.agentRun?.ErrorMessage || null;
        errorMessage.HiddenToUser = false;

        await errorMessage.Save();
        this.messageSent.emit(errorMessage);

        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      }
    } catch (error) {
      console.error(`❌ Error invoking mentioned agent ${agentName}:`, error);

      this.activeTasks.remove(taskId);

      const errorMessage = await this.dataCache.createConversationDetail(this.currentUser);

      errorMessage.ConversationID = conversationId;
      errorMessage.Role = 'AI';
      errorMessage.Message = `❌ **@${agentName}** encountered an error\n\n${String(error)}`;
      errorMessage.ParentID = userMessage.ID;
      errorMessage.Status = 'Error';
      errorMessage.Error = String(error);
      errorMessage.HiddenToUser = false;

      await errorMessage.Save();
      this.messageSent.emit(errorMessage);

      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
    }
  }

  /**
   * Continue with the same agent from previous message (implicit continuation)
   * Bypasses Sage - no status messages
   */
  private async continueWithAgent(
    userMessage: ConversationDetailEntity,
    agentId: string,
    conversationId: string
  ): Promise<void> {
    // Load the agent entity to get its name
    const rv = new RunView();
    const agentResult = await rv.RunView<AIAgentEntityExtended>({
      EntityName: 'AI Agents',
      ExtraFilter: `ID='${agentId}'`,
      ResultType: 'entity_object'
    }, this.currentUser);

    if (!agentResult.Success || !agentResult.Results || agentResult.Results.length === 0) {
      console.warn('⚠️ Could not load agent for continuation - falling back to Sage');
      await this.processMessageThroughAgent(userMessage, { mentions: [], agentMention: null, userMentions: [] });
      return;
    }

    const agent = agentResult.Results[0];
    const agentName = agent.Name || 'Agent';

    // Find the last AI message from this same agent to get the previous OUTPUT artifact
    const lastAIMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.Role === 'AI' && msg.AgentID === agentId);

    let previousPayload: any = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;

    if (lastAIMessage) {
      // Load the OUTPUT artifact from the last agent message
      const artifactResult = await rv.RunView<ConversationDetailArtifactEntity>({
        EntityName: 'MJ: Conversation Detail Artifacts',
        ExtraFilter: `ConversationDetailID='${lastAIMessage.ID}' AND Direction='Output'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (artifactResult.Success && artifactResult.Results && artifactResult.Results.length > 0) {
        // Load the artifact version content
        const junctionRecord = artifactResult.Results[0];
        const versionResult = await rv.RunView<ArtifactVersionEntity>({
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ID='${junctionRecord.ArtifactVersionID}'`,
          ResultType: 'entity_object'
        }, this.currentUser);

        if (versionResult.Success && versionResult.Results && versionResult.Results.length > 0) {
          const version = versionResult.Results[0];
          if (version.Content) {
            try {
              previousPayload = JSON.parse(version.Content);
              previousArtifactInfo = {
                artifactId: version.ArtifactID,
                versionId: version.ID,
                versionNumber: version.VersionNumber || 1
              };
              console.log('📦 Loaded previous OUTPUT artifact as payload for continuation', previousArtifactInfo);
            } catch (error) {
              console.warn('⚠️ Could not parse previous artifact content:', error);
            }
          }
        }
      }
    }

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: userMessage.ID
    });

    try {
      // Update user message status to In-Progress
      userMessage.Status = 'In-Progress';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

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
        this.createProgressCallback(agentResponseMessage, agentName)
      );

      // Remove from active tasks
      this.activeTasks.remove(taskId);

      if (result && result.success) {
        // Update the response message with agent result
        await this.updateConversationDetail(agentResponseMessage,result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete');

        // Handle artifacts - create new version if continuing with same agent and artifact
        if (result.payload && Object.keys(result.payload).length > 0) {
          await this.createArtifactFromPayload(
            result.payload,
            agentResponseMessage,
            agentId,
            previousArtifactInfo // Pass artifact info to create new version instead of new artifact
          );
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      } else {
        // Agent failed - create error message
        const errorMessage = await this.dataCache.createConversationDetail(this.currentUser);

        errorMessage.ConversationID = conversationId;
        errorMessage.Role = 'AI';
        errorMessage.Message = `❌ **${agentName}** failed\n\n${result?.agentRun?.ErrorMessage || 'Unknown error'}`;
        errorMessage.ParentID = userMessage.ID;
        errorMessage.Status = 'Error';
        errorMessage.Error = result?.agentRun?.ErrorMessage || null;
        errorMessage.HiddenToUser = false;

        await errorMessage.Save();
        this.messageSent.emit(errorMessage);

        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      }
    } catch (error) {
      console.error(`❌ Error continuing with agent ${agentName}:`, error);

      this.activeTasks.remove(taskId);

      const errorMessage = await this.dataCache.createConversationDetail(this.currentUser);

      errorMessage.ConversationID = conversationId;
      errorMessage.Role = 'AI';
      errorMessage.Message = `❌ **${agentName}** encountered an error\n\n${String(error)}`;
      errorMessage.ParentID = userMessage.ID;
      errorMessage.Status = 'Error';
      errorMessage.Error = String(error);
      errorMessage.HiddenToUser = false;

      await errorMessage.Save();
      this.messageSent.emit(errorMessage);

      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
    }
  }

  /**
   * Creates an artifact from an agent's payload and links it to the conversation detail
   * If previousArtifactInfo is provided, creates a new version of the existing artifact
   * Otherwise, creates a new artifact with version 1
   * @param payload The agent's payload object
   * @param message The conversation detail message to link to
   * @param agentId The ID of the agent that produced the payload
   * @param previousArtifactInfo Optional info about previous artifact to create new version
   */
  private async createArtifactFromPayload(
    payload: any,
    message: ConversationDetailEntity,
    agentId?: string,
    previousArtifactInfo?: {artifactId: string; versionId: string; versionNumber: number} | null
  ): Promise<void> {
    try {
      const md = new Metadata();
      let artifactId: string;
      let newVersionNumber: number;

      // If we have previous artifact info, we're creating a new version of existing artifact
      if (previousArtifactInfo) {
        artifactId = previousArtifactInfo.artifactId;
        newVersionNumber = previousArtifactInfo.versionNumber + 1;
        console.log(`📦 Creating version ${newVersionNumber} of existing artifact ${artifactId}`);
      } else {
        // Create new Artifact header
        const artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);

        // Look up agent to get name and default artifact type
        const agent = agentId
          ? AIEngineBase.Instance?.Agents?.find(a => a.ID === agentId)
          : null;
        const agentName = agent?.Name || 'Agent';

        artifact.Name = `${agentName} Payload - ${new Date().toLocaleString()}`;
        artifact.Description = `Payload returned by ${agentName}`;

        // Use agent's DefaultArtifactTypeID if available, otherwise fall back to JSON
        const defaultArtifactTypeId = (agent as any)?.DefaultArtifactTypeID;
        artifact.TypeID = defaultArtifactTypeId || this.JSON_ARTIFACT_TYPE_ID;

        artifact.UserID = this.currentUser.ID;
        artifact.EnvironmentID = (this.currentUser as any).EnvironmentID || 'F51358F3-9447-4176-B313-BF8025FD8D09';

        const artifactSaved = await artifact.Save();
        if (!artifactSaved) {
          console.error('Failed to save artifact');
          return;
        }

        artifactId = artifact.ID;
        newVersionNumber = 1;
        console.log(`📦 Creating new artifact ${artifactId} with version 1`);
      }

      // Create Artifact Version with content
      const version = await md.GetEntityObject<ArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
      version.ArtifactID = artifactId;
      version.VersionNumber = newVersionNumber;
      version.Content = JSON.stringify(payload, null, 2);
      version.UserID = this.currentUser.ID;

      const versionSaved = await version.Save();
      if (!versionSaved) {
        console.error('Failed to save artifact version');
        return;
      }

      // Create M2M relationship using ConversationDetailArtifact junction table
      const junction = await md.GetEntityObject<ConversationDetailArtifactEntity>(
        'MJ: Conversation Detail Artifacts',
        this.currentUser
      );
      junction.ConversationDetailID = message.ID;
      junction.ArtifactVersionID = version.ID;
      junction.Direction = 'Output'; // This artifact was produced as output from the agent

      const junctionSaved = await junction.Save();
      if (!junctionSaved) {
        console.error('Failed to create artifact-message association');
      }

      // Emit with artifact name (load from DB if versioning existing artifact)
      let artifactName: string;
      if (previousArtifactInfo) {
        const artifactEntity = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);
        if (await artifactEntity.Load(artifactId)) {
          artifactName = artifactEntity.Name || 'Artifact';
        } else {
          artifactName = 'Artifact';
        }
      } else {
        const agentName = agentId
          ? AIEngineBase.Instance?.Agents?.find(a => a.ID === agentId)?.Name || 'Agent'
          : 'Agent';
        artifactName = `${agentName} Payload - ${new Date().toLocaleString()}`;
      }

      this.artifactCreated.emit({
        artifactId,
        versionId: version.ID,
        versionNumber: newVersionNumber,
        conversationDetailId: message.ID,
        name: artifactName
      });
    } catch (error) {
      console.error('Error creating artifact from payload:', error);
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
   */
  private markMessageComplete(conversationDetail: ConversationDetailEntity): void {
    const now = Date.now();
    this.completionTimestamps.set(conversationDetail.ID, now);
    console.log(`🏁 Marked message ${conversationDetail.ID} as complete at ${now}`);
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