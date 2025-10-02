import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { ConversationDetailEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ConversationStateService } from '../../services/conversation-state.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

@Component({
  selector: 'mj-message-input',
  template: `
    <div class="message-input-container">
      <textarea
        #messageTextarea
        class="message-input"
        [(ngModel)]="messageText"
        [placeholder]="placeholder"
        [disabled]="disabled || isSending"
        (keydown)="onKeyDown($event)"
        rows="3">
      </textarea>
      <div class="input-actions">
        <div class="processing-indicator" *ngIf="isProcessing">
          <i class="fas fa-circle-notch fa-spin"></i>
          <span>AI is responding...</span>
        </div>
        <button
          class="btn-attach"
          [disabled]="disabled"
          title="Attach file (coming soon)">
          <i class="fas fa-paperclip"></i>
        </button>
        <button
          class="btn-send"
          [disabled]="!canSend"
          (click)="onSend()">
          <i class="fas fa-paper-plane"></i>
          <span>{{ isSending ? 'Sending...' : 'Send' }}</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .message-input-container {
      padding: 16px 24px;
      border-top: 1px solid #D9D9D9;
      background: #FFF;
    }
    .message-input {
      width: 100%;
      padding: 12px;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
      resize: vertical;
      font-family: inherit;
      font-size: 14px;
      min-height: 80px;
    }
    .message-input:focus {
      outline: none;
      border-color: #0076B6;
      box-shadow: 0 0 0 2px rgba(0, 118, 182, 0.1);
    }
    .message-input:disabled {
      background: #F4F4F4;
      cursor: not-allowed;
    }
    .input-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
    }
    .btn-attach {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
      cursor: pointer;
      color: #333;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-attach:hover:not(:disabled) {
      background: #F4F4F4;
      border-color: #AAA;
    }
    .btn-attach:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-send {
      padding: 10px 24px;
      background: #0076B6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      transition: background 150ms ease;
    }
    .btn-send:hover:not(:disabled) {
      background: #005A8C;
    }
    .btn-send:disabled {
      background: #D9D9D9;
      cursor: not-allowed;
    }
    .processing-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #6B7280;
      margin-right: auto;
    }
    .processing-indicator i {
      color: #0076B6;
    }
  `]
})
export class MessageInputComponent {
  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() placeholder: string = 'Type a message... (Ctrl+Enter to send)';
  @Input() parentMessageId?: string; // Optional: for replying in threads
  @Input() conversationHistory: ConversationDetailEntity[] = []; // For agent context

  @Output() messageSent = new EventEmitter<ConversationDetailEntity>();
  @Output() agentResponse = new EventEmitter<{message: ConversationDetailEntity, agentResult: any}>();

  @ViewChild('messageTextarea') messageTextarea!: ElementRef;

  public messageText: string = '';
  public isSending: boolean = false;
  public isProcessing: boolean = false; // True when waiting for agent/naming response

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private agentService: ConversationAgentService,
    private conversationState: ConversationStateService,
    private activeTasks: ActiveTasksService
  ) {}

  get canSend(): boolean {
    return !this.disabled && !this.isSending && this.messageText.trim().length > 0;
  }

  /**
   * Handle keydown events in the textarea
   * - Enter alone: Send message
   * - Shift+Enter: Add new line
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      // Prevent default behavior (adding newline)
      event.preventDefault();

      // Send the message
      this.onSend();
    }
    // If Shift+Enter, allow default behavior (add newline)
  }

  async onSend(): Promise<void> {
    if (!this.canSend) return;

    this.isSending = true;
    try {
      const md = new Metadata();
      const detail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.currentUser);

      detail.ConversationID = this.conversationId;
      detail.Message = this.messageText.trim();
      detail.Role = 'User';

      // Set ParentID if this is a thread reply
      if (this.parentMessageId) {
        detail.ParentID = this.parentMessageId;
      }

      const saved = await detail.Save();
      if (saved) {
        this.messageSent.emit(detail);
        this.messageText = '';

        // Check if this is the first message in the conversation
        const isFirstMessage = this.conversationHistory.length === 0;

        // Process message through ambient agent AND name conversation (parallel, non-blocking)
        if (isFirstMessage) {
          // Run both in parallel
          Promise.all([
            this.processMessageThroughAgent(detail),
            this.nameConversation(detail.Message)
          ]);
        } else {
          // Only run agent for subsequent messages
          this.processMessageThroughAgent(detail);
        }

        // Focus back on textarea
        setTimeout(() => {
          if (this.messageTextarea && this.messageTextarea.nativeElement) {
            this.messageTextarea.nativeElement.focus();
          }
        }, 100);
      } else {
        console.error('Failed to send message:', detail.LatestResult?.Message);
        this.toastService.error('Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.toastService.error('Error sending message. Please try again.');
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Process the message through agents (multi-stage: Conversation Manager -> possible sub-agent)
   */
  private async processMessageThroughAgent(userMessage: ConversationDetailEntity): Promise<void> {
    let taskId: string | null = null;

    try {
      // Stage 1: Conversation Manager evaluates the message
      taskId = this.activeTasks.add({
        agentName: 'Conversation Manager',
        status: 'Evaluating message...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: userMessage.ID
      });

      // Update user message status to In-Progress
      userMessage.Status = 'In-Progress';
      await userMessage.Save();
      this.messageSent.emit(userMessage); // Trigger UI update

      const result = await this.agentService.processMessage(
        this.conversationId,
        userMessage,
        this.conversationHistory
      );

      // Remove Conversation Manager from active tasks
      if (taskId) {
        this.activeTasks.remove(taskId);
        taskId = null;
      }

      if (!result || !result.success) {
        // Evaluation failed
        userMessage.Status = 'Error';
        userMessage.Error = result?.agentRun?.ErrorMessage || 'Agent evaluation failed';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
        console.warn('⚠️ Conversation Manager failed:', result?.agentRun?.ErrorMessage);
        return;
      }

      console.log('🤖 Conversation Manager Response:', {
        finalStep: result.agentRun.FinalStep,
        hasPayload: !!result.payload,
        hasMessage: !!result.agentRun.Message
      });

      // Stage 2: Check for sub-agent invocation
      if (result.agentRun.FinalStep === 'Success' && result.payload?.invokeAgent) {
        await this.handleSubAgentInvocation(userMessage, result);
      }
      // Stage 3: Direct chat response from Conversation Manager
      else if (result.agentRun.FinalStep === 'Chat' && result.agentRun.Message) {
        await this.handleAgentResponse(userMessage, result);
      }
      // Stage 4: Silent observation (no response needed)
      else {
        console.log('🔇 Conversation Manager chose to observe silently');
        userMessage.Status = 'Complete';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      }

    } catch (error) {
      console.error('❌ Error processing message through agents:', error);

      // Update message status to Error
      userMessage.Status = 'Error';
      userMessage.Error = String(error);
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Clean up active task
      if (taskId) {
        this.activeTasks.remove(taskId);
      }
    }
  }

  /**
   * Handle sub-agent invocation based on Conversation Manager's payload
   */
  private async handleSubAgentInvocation(
    userMessage: ConversationDetailEntity,
    managerResult: ExecuteAgentResult
  ): Promise<void> {
    const payload = managerResult.payload;
    const agentName = payload.invokeAgent;
    const reasoning = payload.reasoning || 'Delegating to specialist agent';

    console.log(`🎯 Sub-agent invocation requested: ${agentName}`, { reasoning });

    // Create a status message showing agent invocation
    const md = new Metadata();
    const statusMessage = await md.GetEntityObject<ConversationDetailEntity>(
      'Conversation Details',
      this.currentUser
    );

    statusMessage.ConversationID = this.conversationId;
    statusMessage.Role = 'AI';
    statusMessage.Message = `🎯 Invoking **${agentName}**...\n_${reasoning}_`;
    statusMessage.ParentID = userMessage.ID; // Thread under user message
    statusMessage.Status = 'In-Progress';
    statusMessage.HiddenToUser = false;

    await statusMessage.Save();
    this.messageSent.emit(statusMessage);

    // Add sub-agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: statusMessage.ID
    });

    try {
      // Invoke the sub-agent
      const subResult = await this.agentService.invokeSubAgent(
        agentName,
        this.conversationId,
        userMessage,
        this.conversationHistory,
        reasoning
      );

      // Remove from active tasks
      this.activeTasks.remove(taskId);

      if (subResult && subResult.success) {
        // Update status message to completed
        statusMessage.Status = 'Complete';
        statusMessage.Message = `✅ **${agentName}** completed`;
        statusMessage.AgentRunID = subResult.agentRun.ID;
        await statusMessage.Save();
        this.messageSent.emit(statusMessage);

        // Handle sub-agent's response
        if (subResult.agentRun.Message) {
          await this.handleAgentResponse(userMessage, subResult);
        } else {
          // Sub-agent completed but has no message
          userMessage.Status = 'Complete';
          await userMessage.Save();
          this.messageSent.emit(userMessage);
        }
      } else {
        // Sub-agent failed
        statusMessage.Status = 'Error';
        statusMessage.Message = `❌ **${agentName}** failed\n_${subResult?.agentRun?.ErrorMessage || 'Unknown error'}_`;
        statusMessage.Error = subResult?.agentRun?.ErrorMessage || null;
        await statusMessage.Save();
        this.messageSent.emit(statusMessage);

        userMessage.Status = 'Error';
        await userMessage.Save();
        this.messageSent.emit(userMessage);
      }
    } catch (error) {
      console.error(`❌ Error invoking sub-agent ${agentName}:`, error);

      this.activeTasks.remove(taskId);

      statusMessage.Status = 'Error';
      statusMessage.Message = `❌ **${agentName}** failed\n_${String(error)}_`;
      statusMessage.Error = String(error);
      await statusMessage.Save();
      this.messageSent.emit(statusMessage);

      userMessage.Status = 'Error';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
    }
  }

  /**
   * Handle agent response - create AI message from agent result
   */
  private async handleAgentResponse(
    userMessage: ConversationDetailEntity,
    result: ExecuteAgentResult
  ): Promise<void> {
    if (!result.agentRun.Message) return;

    const md = new Metadata();
    const agentMessage = await md.GetEntityObject<ConversationDetailEntity>(
      'Conversation Details',
      this.currentUser
    );

    agentMessage.ConversationID = this.conversationId;
    agentMessage.Message = result.agentRun.Message;
    agentMessage.Role = 'AI';
    agentMessage.Status = 'Complete';
    agentMessage.AgentRunID = result.agentRun.ID;

    // Store which agent actually responded
    if (result.agentRun.AgentID) {
      (agentMessage as any).AgentID = result.agentRun.AgentID;
    }

    const saved = await agentMessage.Save();
    if (saved) {
      console.log('💾 Agent response saved');
      this.agentResponse.emit({
        message: agentMessage,
        agentResult: result
      });

      // Mark user message as complete
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);
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
}