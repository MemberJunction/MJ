import { DestroyRef, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIAgentEntityExtended, ConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Service for managing agent interactions within conversations.
 * Handles communication with the ambient Conversation Manager Agent and other agents.
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
   * Get or load the Conversation Manager Agent
   */
  public async getConversationManagerAgent(): Promise<AIAgentEntityExtended | null> {
    if (this._conversationManagerAgent) {
      return this._conversationManagerAgent;
    }

    try {
      // Ensure AIEngineBase is configured
      await AIEngineBase.Instance.Config(false);

      // Find the Conversation Manager Agent
      const agents = AIEngineBase.Instance.Agents;
      this._conversationManagerAgent = agents.find(
        (agent: AIAgentEntityExtended) => agent.Name === 'Conversation Manager Agent'
      ) || null;

      if (!this._conversationManagerAgent) {
        const errorMsg = 'Conversation Manager Agent not found in AIEngineBase.Agents';
        console.warn(errorMsg);
        MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      }

      return this._conversationManagerAgent;
    } catch (error) {
      const errorMsg = 'Error loading Conversation Manager Agent: ' + (error instanceof Error ? error.message : String(error));
      console.error('Error loading Conversation Manager Agent:', error);
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
   * Process a message through the ambient Conversation Manager Agent.
   * This should be called for every message sent in a conversation.
   *
   * @param conversationId The conversation ID
   * @param message The message that was just sent
   * @param conversationHistory Recent messages in the conversation for context
   * @returns The agent's response, or null if the agent chooses not to respond
   */
  async processMessage(
    conversationId: string,
    message: ConversationDetailEntity,
    conversationHistory: ConversationDetailEntity[]
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
      const errorMsg = 'Conversation Manager Agent not available';
      console.warn(errorMsg);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'warning', 5000);
      return null;
    }

    try {
      // Indicate agent is processing
      this._isProcessing$.next(true);

      // Build conversation messages for the agent
      const conversationMessages = this.buildAgentMessages(conversationHistory, message);

      // Prepare parameters using the correct ExecuteAgentParams type
      const availAgents = AIEngineBase.Instance.Agents.filter(a => a.ID !== agent.ID && !a.ParentID && a.Status === 'Active');
      const params: ExecuteAgentParams = {
        agent: agent,
        conversationMessages: conversationMessages,
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
        }
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
   */
  private buildAgentMessages(
    history: ConversationDetailEntity[],
    currentMessage: ConversationDetailEntity
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add historical messages (limit to recent context, e.g., last 20 messages)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: this.mapRoleToAgentRole(msg.Role) as 'system' | 'user' | 'assistant',
        content: msg.Message || ''
      });
    }

    // Add the current message
    messages.push({
      role: this.mapRoleToAgentRole(currentMessage.Role) as 'system' | 'user' | 'assistant',
      content: currentMessage.Message || ''
    });

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
   * Invoke a sub-agent based on Conversation Manager Agent's payload.
   * This is called when the Conversation Manager decides to delegate to a specialist agent.
   *
   * @param agentName Name of the agent to invoke
   * @param conversationId The conversation ID
   * @param message The user message that triggered this
   * @param conversationHistory Recent conversation history for context
   * @param reasoning Why this agent is being invoked
   * @param payload Optional payload to pass to the agent (e.g., previous OUTPUT artifact for continuity)
   * @returns The agent's execution result, or null if agent not found
   */
  async invokeSubAgent(
    agentName: string,
    conversationId: string,
    message: ConversationDetailEntity,
    conversationHistory: ConversationDetailEntity[],
    reasoning: string,
    payload?: any
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
      const conversationMessages = this.buildAgentMessages(conversationHistory, message);

      // Prepare parameters with optional payload
      const params: ExecuteAgentParams = {
        agent: agent,
        conversationMessages: conversationMessages,
        data: {
          conversationId: conversationId,
          latestMessageId: message.ID,
          invocationReason: reasoning
        },
        ...(payload ? { payload } : {})
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
   * Clear the session for a conversation (useful when starting a new topic)
   */
  clearSession(conversationId: string): void {
    this._sessionIds.delete(conversationId);
  }
}
