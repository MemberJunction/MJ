import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit } from '@angular/core';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { ConversationDetailEntity, AIPromptEntity, ArtifactEntity, ArtifactVersionEntity, ConversationDetailArtifactEntity, AIAgentEntityExtended } from '@memberjunction/core-entities';
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
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.scss'
})
export class MessageInputComponent implements OnInit {
  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() placeholder: string = 'Type a message... (Ctrl+Enter to send)';
  @Input() parentMessageId?: string; // Optional: for replying in threads
  @Input() conversationHistory: ConversationDetailEntity[] = []; // For agent context

  @Output() messageSent = new EventEmitter<ConversationDetailEntity>();
  @Output() agentResponse = new EventEmitter<{message: ConversationDetailEntity, agentResult: any}>();
  @Output() artifactCreated = new EventEmitter<{artifactId: string; versionId: string, conversationDetailId: string}>();

  @ViewChild('messageTextarea') messageTextarea!: ElementRef;

  public messageText: string = '';
  public isSending: boolean = false;
  public isProcessing: boolean = false; // True when waiting for agent/naming response
  public converationManagerAgent: AIAgentEntityExtended | null = null;

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private agentService: ConversationAgentService,
    private conversationState: ConversationStateService,
    private activeTasks: ActiveTasksService
  ) {}

  async ngOnInit() {
    this.converationManagerAgent = await this.agentService.getConversationManagerAgent();
  }

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

    console.log(`👉 Sub-agent invocation requested: ${agentName}`, { reasoning });

    // Create a status message showing agent invocation
    const md = new Metadata();
    const statusMessage = await md.GetEntityObject<ConversationDetailEntity>(
      'Conversation Details',
      this.currentUser
    );


    statusMessage.ConversationID = this.conversationId;
    statusMessage.Role = 'AI';
    statusMessage.Message = `👉 **${agentName}** will handle this request...`;
    statusMessage.ParentID = userMessage.ID; // Thread under user message
    statusMessage.Status = 'Complete'; // Mark as complete immediately
    statusMessage.HiddenToUser = false;
    statusMessage.AgentID = this.converationManagerAgent?.ID || null; // Mark as from Conversation Manager

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
        // Create new message for sub-agent response (threaded under delegation message)
        const md = new Metadata();
        const agentResponseMessage = await md.GetEntityObject<ConversationDetailEntity>(
          'Conversation Details',
          this.currentUser
        );

        agentResponseMessage.ConversationID = this.conversationId;
        agentResponseMessage.Role = 'AI';
        agentResponseMessage.Message = subResult.agentRun?.Message || `✅ **${agentName}** completed`;
        agentResponseMessage.ParentID = statusMessage.ID; // Thread under delegation message
        agentResponseMessage.Status = 'Complete';
        agentResponseMessage.HiddenToUser = false;

        // Store the agent ID for display
        if (subResult.agentRun.AgentID) {
          agentResponseMessage.AgentID = subResult.agentRun.AgentID;
        }

        await agentResponseMessage.Save();
        this.messageSent.emit(agentResponseMessage);

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

        // Update delegation message to show retry
        statusMessage.Message = `🎯 Delegating to **${agentName}**\n\n${reasoning}\n\n⚠️ First attempt failed, retrying...`;
        await statusMessage.Save();
        this.messageSent.emit(statusMessage);

        // Retry the sub-agent
        const retryResult = await this.agentService.invokeSubAgent(
          agentName,
          this.conversationId,
          userMessage,
          this.conversationHistory,
          reasoning
        );

        if (retryResult && retryResult.success) {
          // Retry succeeded - create response message
          const md = new Metadata();
          const agentResponseMessage = await md.GetEntityObject<ConversationDetailEntity>(
            'Conversation Details',
            this.currentUser
          );

          agentResponseMessage.ConversationID = this.conversationId;
          agentResponseMessage.Role = 'AI';
          agentResponseMessage.Message = retryResult.agentRun?.Message || `✅ **${agentName}** completed`;
          agentResponseMessage.ParentID = statusMessage.ID;
          agentResponseMessage.Status = 'Complete';
          agentResponseMessage.HiddenToUser = false;

          if (retryResult.agentRun.AgentID) {
            agentResponseMessage.AgentID = retryResult.agentRun.AgentID;
          }

          await agentResponseMessage.Save();
          this.messageSent.emit(agentResponseMessage);

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
          statusMessage.Status = 'Error';
          statusMessage.Message = `❌ **${agentName}** failed after retry\n\n${retryResult?.agentRun?.ErrorMessage || 'Unknown error'}`;
          statusMessage.Error = retryResult?.agentRun?.ErrorMessage || null;
          await statusMessage.Save();
          this.messageSent.emit(statusMessage);

          userMessage.Status = 'Complete'; // Don't mark user message as error
          await userMessage.Save();
          this.messageSent.emit(userMessage);
        }
      }
    } catch (error) {
      console.error(`❌ Error invoking sub-agent ${agentName}:`, error);

      this.activeTasks.remove(taskId);

      statusMessage.Status = 'Error';
      statusMessage.Message = `❌ **${agentName}** encountered an error\n\n${String(error)}`;
      statusMessage.Error = String(error);
      await statusMessage.Save();
      this.messageSent.emit(statusMessage);

      userMessage.Status = 'Complete'; // Don't mark user message as error
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
    agentMessage.AgentID = this.converationManagerAgent?.ID || null; // Default to Conversation Manager

    // Populate denormalized AgentID for fast lookup
    if (result.agentRun.AgentID) {
      agentMessage.AgentID = result.agentRun.AgentID;
      console.log(`✅ Set AgentID=${result.agentRun.AgentID} for message from agent`);
    } else {
      console.warn('⚠️ AgentID not found in agentRun result');
    }

    const saved = await agentMessage.Save();
    if (saved) {
      console.log('💾 Agent response saved');

      // If agent returned a payload, create an artifact version linked to this message
      if (result.payload && Object.keys(result.payload).length > 0) {
        await this.createArtifactFromPayload(result.payload, agentMessage, result.agentRun.AgentID);
        console.log('🎨 Artifact created and linked to conversation detail:', agentMessage.ID);
      }

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
   * Creates an artifact from an agent's payload and links it to the conversation detail
   * @param payload The agent's payload object
   * @param message The conversation detail message to link to
   * @param agentId The ID of the agent that produced the payload
   */
  private async createArtifactFromPayload(
    payload: any,
    message: ConversationDetailEntity,
    agentId?: string
  ): Promise<void> {
    try {
      const md = new Metadata();

      // Create Artifact header
      const artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);

      // Generate artifact name based on agent name and timestamp
      const agentName = agentId
        ? AIEngineBase.Instance?.Agents?.find(a => a.ID === agentId)?.Name || 'Agent'
        : 'Agent';
      artifact.Name = `${agentName} Payload - ${new Date().toLocaleString()}`;
      artifact.Description = `Payload returned by ${agentName}`;

      // Use JSON artifact type (hardcoded ID from migration)
      artifact.TypeID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4'; // JSON type
      artifact.UserID = this.currentUser.ID;
      artifact.EnvironmentID = (this.currentUser as any).EnvironmentID || 'F51358F3-9447-4176-B313-BF8025FD8D09';

      const artifactSaved = await artifact.Save();
      if (!artifactSaved) {
        console.error('Failed to save artifact');
        return;
      }

      // Create Artifact Version with content
      const version = await md.GetEntityObject<ArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
      version.ArtifactID = artifact.ID;
      version.VersionNumber = 1;
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

      this.artifactCreated.emit({ artifactId: artifact.ID, versionId: version.ID, conversationDetailId: message.ID });
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