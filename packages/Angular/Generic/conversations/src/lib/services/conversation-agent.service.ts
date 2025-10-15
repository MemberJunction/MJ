import { DestroyRef, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ExecuteAgentParams, ExecuteAgentResult, AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIAgentEntityExtended, ConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Service for managing agent interactions within conversations.
 * Handles communication with the ambient Sage Agent and other agents.
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationAgentService {
  private _aiClient: GraphQLAIClient | null = null;
  private _conversationManagerAgent: AIAgentEntityExtended | null = null;
  private _sessionIds: Map<string, string> = new Map(); // conversationId -> sessionId
  private _isProcessing$ = new BehaviorSubject<boolean>(false);

  /**
   * Observable indicating if the ambient agent is currently processing
   */
  public readonly isProcessing$: Observable<boolean> = this._isProcessing$.asObservable();

  constructor() {
    this.initializeAIClient();
  }

  /**
   * Initialize the GraphQL AI Client
   */
  private initializeAIClient(): void {
    try {
      const provider = Metadata.Provider as GraphQLDataProvider;
      if (provider) {
        this._aiClient = new GraphQLAIClient(provider);
      } else {
        console.warn('GraphQLDataProvider not available, agent functionality will be limited');
      }
    } catch (error) {
      console.error('Failed to initialize GraphQL AI Client:', error);
    }
  }

  /**
   * Get or load the Sage Agent (formerly Conversation Manager Agent)
   */
  public async getConversationManagerAgent(): Promise<AIAgentEntityExtended | null> {
    if (this._conversationManagerAgent) {
      return this._conversationManagerAgent;
    }

    try {
      // Ensure AIEngineBase is configured
      await AIEngineBase.Instance.Config(false);

      // Find the Sage Agent
      const agents = AIEngineBase.Instance.Agents;
      this._conversationManagerAgent = agents.find(
        (agent: AIAgentEntityExtended) => agent.Name === 'Sage'
      ) || null;

      if (!this._conversationManagerAgent) {
        const errorMsg = 'Sage Agent not found in AIEngineBase.Agents';
        console.warn(errorMsg);
        MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      }

      return this._conversationManagerAgent;
    } catch (error) {
      const errorMsg = 'Error loading Sage Agent: ' + (error instanceof Error ? error.message : String(error));
      console.error('Error loading Sage Agent:', error);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      return null;
    }
  }

  /**
   * Get or create a session ID for a conversation
   */
  private getSessionId(conversationId: string): string {
    if (!this._sessionIds.has(conversationId)) {
      // Create a new session ID for this conversation
      this._sessionIds.set(conversationId, `conv-${conversationId}-${Date.now()}`);
    }
    return this._sessionIds.get(conversationId)!;
  }

  /**
   * Process a message through the ambient Sage Agent.
   * This should be called for every message sent in a conversation.
   *
   * @param conversationId The conversation ID
   * @param message The message that was just sent
   * @param conversationHistory Recent messages in the conversation for context
   * @param conversationDetailId The ID of the conversation detail record to link to the agent run
   * @param onProgress Optional callback for receiving progress updates during execution
   * @returns The agent's response, or null if the agent chooses not to respond
   */
  async processMessage(
    conversationId: string,
    message: ConversationDetailEntity,
    conversationHistory: ConversationDetailEntity[],
    conversationDetailId: string,
    onProgress?: AgentExecutionProgressCallback
  ): Promise<ExecuteAgentResult | null> {
    // Don't process if user is tagging someone else (future enhancement)
    // For now, we'll always send to the ambient agent

    if (!this._aiClient) {
      const errorMsg = 'AI Client not initialized, cannot process message through agent';
      console.warn(errorMsg);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'warning', 5000);
      return null;
    }

    const agent = await this.getConversationManagerAgent();
    if (!agent || !agent.ID) {
      const errorMsg = 'Sage Agent not available';
      console.warn(errorMsg);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'warning', 5000);
      return null;
    }

    try {
      // Indicate agent is processing
      this._isProcessing$.next(true);

      // Build conversation messages for the agent
      // Note: conversationHistory already includes the current message
      const conversationMessages = this.buildAgentMessages(conversationHistory);

      // Prepare parameters using the correct ExecuteAgentParams type
      const availAgents = AIEngineBase.Instance.Agents.filter(a => a.ID !== agent.ID && !a.ParentID && a.Status === 'Active');
      const params: ExecuteAgentParams = {
        agent: agent,
        conversationMessages: conversationMessages,
        conversationDetailId: conversationDetailId,
        data: {
          ALL_AVAILABLE_AGENTS: availAgents.map(a => {
            return {
              ID: a.ID,
              Name: a.Name,
              Description: a.Description
            }
          }),
          conversationId: conversationId,
          latestMessageId: message.ID
        },
        onProgress: onProgress
      };

      // Run the agent
      const result = await this._aiClient.RunAIAgent(params);

      return result;
    } catch (error) {
      const errorMsg = 'Error processing message through agent: ' + (error instanceof Error ? error.message : String(error));
      console.error('Error processing message through agent:', error);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      return null;
    } finally {
      // Always clear processing state
      this._isProcessing$.next(false);
    }
  }

  /**
   * Build the message array for the agent from conversation history
   * Note: conversationHistory already includes the current message, so we don't add it separately
   */
  private buildAgentMessages(
    history: ConversationDetailEntity[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add historical messages (limit to recent context, e.g., last 20 messages)
    // History already includes the current message from the caller
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: this.mapRoleToAgentRole(msg.Role) as 'system' | 'user' | 'assistant',
        content: msg.Message || ''
      });
    }

    return messages;
  }

  /**
   * Map ConversationDetail Role to agent message role
   */
  private mapRoleToAgentRole(role: string): string {
    const roleLower = (role || '').toLowerCase();
    if (roleLower === 'user') return 'user';
    if (roleLower === 'assistant' || roleLower === 'agent') return 'assistant';
    return 'user'; // Default to user
  }

  /**
   * Check if a message is tagging another user or agent.
   * Returns true if the message contains @mentions that are NOT the ambient agent.
   * Future enhancement: parse @mentions and determine if ambient agent should process.
   */
  private isTaggingOthers(message: string): boolean {
    // Future implementation: check for @mentions
    // For now, always return false (always process through ambient agent)
    return false;
  }

  /**
   * Invoke a sub-agent based on Sage Agent's payload.
   * This is called when Sage decides to delegate to a specialist agent.
   *
   * @param agentName Name of the agent to invoke
   * @param conversationId The conversation ID
   * @param message The user message that triggered this
   * @param conversationHistory Recent conversation history for context
   * @param reasoning Why this agent is being invoked
   * @param conversationDetailId The ID of the conversation detail record to link to the agent run
   * @param payload Optional payload to pass to the agent (e.g., previous OUTPUT artifact for continuity)
   * @param onProgress Optional callback for receiving progress updates during execution
   * @returns The agent's execution result, or null if agent not found
   */
  async invokeSubAgent(
    agentName: string,
    conversationId: string,
    message: ConversationDetailEntity,
    conversationHistory: ConversationDetailEntity[],
    reasoning: string,
    conversationDetailId: string,
    payload?: any,
    onProgress?: AgentExecutionProgressCallback
  ): Promise<ExecuteAgentResult | null> {
    if (!this._aiClient) {
      const errorMsg = 'AI Client not initialized, cannot invoke sub-agent';
      console.warn(errorMsg);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'warning', 5000);
      return null;
    }

    try {
      // Ensure AIEngineBase is configured
      await AIEngineBase.Instance.Config(false);

      // Find the agent by name
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      if (!agent || !agent.ID) {
        const errorMsg = `Sub-agent "${agentName}" not found`;
        console.warn(`❌ ${errorMsg}`);
        MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
        return null;
      }

      console.log(`🎯 Invoking sub-agent: ${agentName}`, { reasoning, hasPayload: !!payload });

      // Build conversation messages for the sub-agent
      // Note: conversationHistory already includes the current message
      const conversationMessages = this.buildAgentMessages(conversationHistory);

      // Prepare parameters with optional payload and progress callback
      const params: ExecuteAgentParams = {
        agent: agent,
        conversationMessages: conversationMessages,
        conversationDetailId: conversationDetailId,
        data: {
          conversationId: conversationId,
          latestMessageId: message.ID,
          invocationReason: reasoning
        },
        ...(payload ? { payload } : {}),
        onProgress: onProgress
      };

      // Run the sub-agent
      const result = await this._aiClient.RunAIAgent(params);

      return result;
    } catch (error) {
      const errorMsg = `Error invoking sub-agent "${agentName}": ` + (error instanceof Error ? error.message : String(error));
      console.error(`Error invoking sub-agent "${agentName}":`, error);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      return null;
    }
  }

  /**
   * Check if user's latest message should continue with the previous agent or route through Sage.
   * Uses fast inference (<500ms) to determine intent and avoid unnecessary Sage overhead.
   *
   * @param agentId The ID of the previous agent
   * @param latestMessage The user's new message
   * @param conversationHistory Recent conversation history for context (last 10 messages)
   * @returns 'YES' if message continues with agent, 'NO' for context shift, 'UNSURE' when unclear
   */
  async checkAgentContinuityIntent(
    agentId: string,
    latestMessage: string,
    conversationHistory: ConversationDetailEntity[]
  ): Promise<'YES' | 'NO' | 'UNSURE'> {
    if (!this._aiClient) {
      console.warn('AI Client not initialized, defaulting to UNSURE for intent check');
      return 'UNSURE';
    }

    try {
      // Load the Check Sage Intent prompt
      await AIEngineBase.Instance.Config(false);
      const prompt = AIEngineBase.Instance.Prompts.find(p => p.Name === 'Check Sage Intent');
      if (!prompt) {
        console.warn('⚠️ Check Sage Intent prompt not found, defaulting to UNSURE');
        return 'UNSURE';
      }

      // Get agent details
      const agent = AIEngineBase.Instance.Agents.find(a => a.ID === agentId);
      if (!agent) {
        console.warn('⚠️ Previous agent not found, defaulting to UNSURE');
        return 'UNSURE';
      }

      // Build compact conversation history (last 10 messages)
      const recentHistory = conversationHistory.slice(-10);
      const compactHistory = recentHistory.map((msg, idx) => {
        const role = msg.Role === 'User' ? 'User' : agent.Name || 'Agent';
        const content = msg.Message || '';
        return `${idx + 1}. ${role}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`;
      }).join('\n');

      // Build user message with context
      const userMessage = `**Previous Agent**: ${agent.Name} - ${agent.Description || 'No description'}

**Conversation History** (last ${recentHistory.length} messages):
${compactHistory}

**Latest User Message**: "${latestMessage}"`;

      console.log('🔍 Checking agent continuity intent...', {
        agentName: agent.Name,
        messagePreview: latestMessage.substring(0, 50)
      });

      // Run the prompt
      const result = await this._aiClient.RunAIPrompt({
        promptId: prompt.ID,
        messages: [{ role: 'user', content: userMessage }]
      });

      if (result && result.success && (result.parsedResult || result.output)) {
        const parsed = result.parsedResult ||
          (result.output ? JSON.parse(result.output) : null);

        if (parsed && parsed.continuesWith) {
          const decision = parsed.continuesWith.toUpperCase();
          const reasoning = parsed.reasoning || 'No reasoning provided';

          console.log(`✅ Intent check result: ${decision}`, {
            reasoning,
            latency: result.executionTimeMs || 'unknown'
          });

          // Validate the response
          if (decision === 'YES' || decision === 'NO' || decision === 'UNSURE') {
            return decision as 'YES' | 'NO' | 'UNSURE';
          }
        }
      }

      console.warn('⚠️ Intent check failed or returned invalid format, defaulting to UNSURE');
      return 'UNSURE';
    } catch (error) {
      console.error('❌ Error checking agent continuity intent:', error);
      // On error, default to UNSURE (safer to let Sage evaluate)
      return 'UNSURE';
    }
  }

  /**
   * Clear the session for a conversation (useful when starting a new topic)
   */
  clearSession(conversationId: string): void {
    this._sessionIds.delete(conversationId);
  }
}
