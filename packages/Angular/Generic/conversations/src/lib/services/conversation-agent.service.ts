import { DestroyRef, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIAgentEntityExtended, ConversationDetailEntity } from '@memberjunction/core-entities';

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
  private async getConversationManagerAgent(): Promise<AIAgentEntityExtended | null> {
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
        console.warn('Conversation Manager Agent not found in AIEngineBase.Agents');
      }

      return this._conversationManagerAgent;
    } catch (error) {
      console.error('Error loading Conversation Manager Agent:', error);
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
      console.warn('AI Client not initialized, cannot process message through agent');
      return null;
    }

    const agent = await this.getConversationManagerAgent();
    if (!agent || !agent.ID) {
      console.warn('Conversation Manager Agent not available');
      return null;
    }

    try {
      // Indicate agent is processing
      this._isProcessing$.next(true);

      // Build conversation messages for the agent
      const conversationMessages = this.buildAgentMessages(conversationHistory, message);

      // Prepare parameters using the correct ExecuteAgentParams type
      const params: ExecuteAgentParams = {
        agent: agent,
        conversationMessages: conversationMessages,
        data: {
          ALL_AVAILABLE_AGENTS: AIEngineBase.Instance.Agents.map(a => {
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
      console.error('Error processing message through agent:', error);
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
   * Clear the session for a conversation (useful when starting a new topic)
   */
  clearSession(conversationId: string): void {
    this._sessionIds.delete(conversationId);
  }
}
