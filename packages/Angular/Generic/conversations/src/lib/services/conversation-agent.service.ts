import { DestroyRef, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ExecuteAgentParams, ExecuteAgentResult, AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AIEngineBase, AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AIAgentEntityExtended, AIAgentRunEntityExtended, ConversationDetailEntity, ConversationDetailArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { LazyArtifactInfo } from '../models/lazy-artifact-info';

/**
 * Context for artifact lookups - provides pre-loaded data from conversation
 * to avoid redundant database queries
 */
export interface ArtifactLookupContext {
  agentRunsByDetailId: Map<string, AIAgentRunEntityExtended>;
  artifactsByDetailId: Map<string, LazyArtifactInfo[]>;
}

/**
 * Result from intent check - indicates whether to continue with agent
 * and which artifact version to use as payload
 */
export interface IntentCheckResult {
  decision: 'YES' | 'NO' | 'UNSURE';
  reasoning: string;
  targetArtifactVersionId?: string;
}

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
      const conversationMessages = await this.buildAgentMessages(conversationHistory);

      // Get current user for permission filtering
      const currentUser = Metadata.Provider.CurrentUser;
      if (!currentUser) {
        console.warn('⚠️ No current user available for permission filtering, using unfiltered agents');
      }

      // Filter agents by status and hierarchy first
      const candidateAgents = AIEngineBase.Instance.Agents.filter(
        a => a.ID !== agent.ID && 
             !a.ParentID && 
             a.Status === 'Active' && 
             a.InvocationMode !== 'Sub-Agent' // ensure that the agent is intended to run as top-level
      );

      // Filter by user permissions if user context available
      const availAgents = currentUser
        ? await this.filterAgentsByPermissions(candidateAgents, currentUser)
        : candidateAgents;

      console.log(`📋 Available agents for Sage: ${availAgents.length} (filtered from ${candidateAgents.length} candidates)`);

      // Prepare parameters using the correct ExecuteAgentParams type
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
   * IMPORTANT: This method loads artifacts for each message and appends them to the content
   */
  private async buildAgentMessages(
    history: ConversationDetailEntity[]
  ): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    // Add historical messages (limit to recent context, e.g., last 20 messages)
    // History already includes the current message from the caller
    const recentHistory = history.slice(-20);

    // Get IDs of all messages in history
    const messageIds = recentHistory.map(msg => msg.ID).filter(id => id); // Filter out any undefined IDs

    // Create lookup map for artifacts by conversation detail ID
    const artifactsByDetailId = new Map<string, string[]>(); // DetailID -> array of artifact JSON strings

    if (messageIds.length > 0) {
      try {
        // Batch load all artifact junctions for these messages (OUTPUT only)
        const rv = new RunView();
        const junctionResult = await rv.RunView<ConversationDetailArtifactEntity>({
          EntityName: 'MJ: Conversation Detail Artifacts',
          ExtraFilter: `ConversationDetailID IN ('${messageIds.join("','")}') AND Direction='Output'`,
          ResultType: 'entity_object'
        });

        if (junctionResult.Success && junctionResult.Results && junctionResult.Results.length > 0) {
          // Collect unique version IDs
          const versionIds = new Set<string>();
          for (const junction of junctionResult.Results) {
            versionIds.add(junction.ArtifactVersionID);
          }

          // Batch load all artifact versions
          const versionResult = await rv.RunView<ArtifactVersionEntity>({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN ('${Array.from(versionIds).join("','")}')`,
            ResultType: 'entity_object'
          });

          if (versionResult.Success && versionResult.Results) {
            // Create lookup map for O(1) access
            const versionMap = new Map(versionResult.Results.map(v => [v.ID, v]));

            // Group artifacts by conversation detail ID
            for (const junction of junctionResult.Results) {
              const version = versionMap.get(junction.ArtifactVersionID);
              if (version && version.Content) {
                const existing = artifactsByDetailId.get(junction.ConversationDetailID) || [];
                existing.push(version.Content);
                artifactsByDetailId.set(junction.ConversationDetailID, existing);
              }
            }

            console.log(`📦 Loaded ${artifactsByDetailId.size} artifact groups for ${messageIds.length} messages in conversation context`);
          }
        }
      } catch (error) {
        console.error('Error loading artifacts for conversation context:', error);
        // Continue without artifacts rather than failing
      }
    }

    // Build messages with artifacts appended
    for (const msg of recentHistory) {
      let content = msg.Message || '';

      // Check if this message has artifacts
      const artifacts = artifactsByDetailId.get(msg.ID);
      if (artifacts && artifacts.length > 0) {
        // Append artifacts to message content in the expected format
        for (const artifactJson of artifacts) {
          content += `\n\n# Artifact\n${artifactJson}\n`;
        }
      }

      messages.push({
        role: this.mapRoleToAgentRole(msg.Role) as 'system' | 'user' | 'assistant',
        content: content
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
    onProgress?: AgentExecutionProgressCallback,
    sourceArtifactId?: string,
    sourceArtifactVersionId?: string
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
      const conversationMessages = await this.buildAgentMessages(conversationHistory);

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

      // Run the sub-agent with optional source artifact info for versioning (GraphQL layer only)
      const result = await this._aiClient.RunAIAgent(params, sourceArtifactId, sourceArtifactVersionId);

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
   * @param context Pre-loaded artifact and agent run data to avoid database queries
   * @returns IntentCheckResult with decision, reasoning, and optional target artifact version
   */
  async checkAgentContinuityIntent(
    agentId: string,
    latestMessage: string,
    conversationHistory: ConversationDetailEntity[],
    context: ArtifactLookupContext
  ): Promise<IntentCheckResult> {
    if (!this._aiClient) {
      console.warn('AI Client not initialized, defaulting to UNSURE for intent check');
      return { decision: 'UNSURE', reasoning: 'AI Client not initialized' };
    }

    try {
      // Load the Check Sage Intent prompt
      await AIEngineBase.Instance.Config(false);
      const prompt = AIEngineBase.Instance.Prompts.find(p => p.Name === 'Check Sage Intent');
      if (!prompt) {
        console.warn('⚠️ Check Sage Intent prompt not found, defaulting to UNSURE');
        return { decision: 'UNSURE', reasoning: 'Check Sage Intent prompt not found' };
      }

      // Get agent details
      const agent = AIEngineBase.Instance.Agents.find(a => a.ID === agentId);
      if (!agent) {
        console.warn('⚠️ Previous agent not found, defaulting to UNSURE');
        return { decision: 'UNSURE', reasoning: 'Previous agent not found' };
      }

      // Find all artifacts from this agent in this conversation
      const agentArtifacts = this.findAllAgentArtifacts(
        agentId,
        conversationHistory,
        context
      );

      // Build compact conversation history (last 10 messages)
      const recentHistory = conversationHistory.slice(-10);
      const compactHistory = recentHistory.map((msg, idx) => {
        const role = msg.Role === 'User' ? 'User' : agent.Name || 'Agent';
        const content = msg.Message || '';
        return `${idx + 1}. ${role}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`;
      }).join('\n');

      // Build artifact context if available
      let artifactContext = '';
      if (agentArtifacts.length > 0) {
        artifactContext = '\n\n**Prior Artifacts Created by This Agent**:\n';
        agentArtifacts.forEach((artifact, idx) => {
          artifactContext += `${idx + 1}. ${artifact.artifactName} (${artifact.artifactType})\n`;
          artifactContext += `   - Versions: ${artifact.versions.length}\n`;
          if (artifact.versions.length > 0) {
            artifactContext += `   - Latest: v${artifact.versions[0].versionNumber}`;
            if (artifact.versions[0].versionName) {
              artifactContext += ` - ${artifact.versions[0].versionName}`;
            }
            artifactContext += '\n';
          }
        });
      }

      // Build user message with context
      const userMessage = `**Previous Agent**: ${agent.Name} - ${agent.Description || 'No description'}

**Conversation History** (last ${recentHistory.length} messages):
${compactHistory}${artifactContext}

**Latest User Message**: "${latestMessage}"`;

      console.log('🔍 Checking agent continuity intent...', {
        agentName: agent.Name,
        messagePreview: latestMessage.substring(0, 50),
        artifactCount: agentArtifacts.length
      });

      // Run the prompt with artifact data included
      const result = await this._aiClient.RunAIPrompt({
        promptId: prompt.ID,
        messages: [{ role: 'user', content: userMessage }],
        data: {
          hasPriorArtifact: agentArtifacts.length > 0,
          priorArtifacts: agentArtifacts
        }
      });

      if (result && result.success && (result.parsedResult || result.output)) {
        const parsed = result.parsedResult ||
          (result.output ? JSON.parse(result.output) : null);

        if (parsed && parsed.continuesWith) {
          const decision = parsed.continuesWith.toUpperCase();
          const reasoning = parsed.reasoning || 'No reasoning provided';
          const targetArtifactVersionId = parsed.targetArtifactVersionId || undefined;

          console.log(`✅ Intent check result: ${decision}`, {
            reasoning,
            targetArtifactVersionId,
            latency: result.executionTimeMs || 'unknown'
          });

          // Validate the response
          if (decision === 'YES' || decision === 'NO' || decision === 'UNSURE') {
            return {
              decision: decision as 'YES' | 'NO' | 'UNSURE',
              reasoning,
              targetArtifactVersionId
            };
          }
        }
      }

      console.warn('⚠️ Intent check failed or returned invalid format, defaulting to UNSURE');
      return { decision: 'UNSURE', reasoning: 'Invalid format from intent check prompt' };
    } catch (error) {
      console.error('❌ Error checking agent continuity intent:', error);
      // On error, default to UNSURE (safer to let Sage evaluate)
      return {
        decision: 'UNSURE',
        reasoning: `Error during intent check: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Clear the session for a conversation (useful when starting a new topic)
   */
  clearSession(conversationId: string): void {
    this._sessionIds.delete(conversationId);
  }

  /**
   * Filter agents based on user's 'run' permission.
   * Only returns agents that the user has permission to run.
   *
   * @param agents List of candidate agents to filter
   * @param user User to check permissions for
   * @returns Filtered list of agents the user can run
   */
  private async filterAgentsByPermissions(
    agents: AIAgentEntityExtended[],
    user: any
  ): Promise<AIAgentEntityExtended[]> {
    const permittedAgents: AIAgentEntityExtended[] = [];

    for (const agent of agents) {
      try {
        const hasPermission = await AIAgentPermissionHelper.HasPermission(
          agent.ID,
          user,
          'run'
        );
        if (hasPermission) {
          permittedAgents.push(agent);
        }
      } catch (error) {
        console.error(`Error checking permission for agent ${agent.Name}:`, error);
        // On error, exclude agent (fail closed)
      }
    }

    return permittedAgents;
  }

  /**
   * Find all artifacts created by the specified agent in this conversation.
   * Returns artifacts grouped by artifact with versions, ordered most recent first.
   * Enables LLM to reason about which artifact/version user is referencing.
   *
   * Uses pre-loaded data from ArtifactLookupContext for performance (no database queries).
   */
  private findAllAgentArtifacts(
    agentId: string,
    conversationDetails: ConversationDetailEntity[],
    context: ArtifactLookupContext
  ): Array<{
    artifactId: string;
    artifactName: string;
    artifactType: string;
    artifactDescription: string | null;
    versions: Array<{
      runId: string;
      versionId: string;
      versionNumber: number;
      versionName: string | null;
      versionDescription: string | null;
      createdAt: Date;
    }>;
  }> {
    const artifactMap = new Map<string, {
      artifactId: string;
      artifactName: string;
      artifactType: string;
      artifactDescription: string | null;
      versions: Array<{
        runId: string;
        versionId: string;
        versionNumber: number;
        versionName: string | null;
        versionDescription: string | null;
        createdAt: Date;
      }>;
    }>();

    // Iterate backwards through conversation details (most recent first)
    for (let i = conversationDetails.length - 1; i >= 0; i--) {
      const detail = conversationDetails[i];

      // Skip non-AI messages and errors
      if (detail.Role !== 'AI' || detail.Status === 'Error') continue;

      // O(1) lookup for agent run from pre-loaded data
      const agentRun = context.agentRunsByDetailId.get(detail.ID);
      if (!agentRun || agentRun.AgentID !== agentId || agentRun.Status !== 'Completed') {
        continue;
      }

      // O(1) lookup for artifacts from pre-loaded data
      const artifacts = context.artifactsByDetailId.get(detail.ID);
      if (!artifacts || artifacts.length === 0) continue;

      // Process each artifact
      for (const lazyArtifact of artifacts) {
        const mainArtifactId = lazyArtifact.artifactId;

        // Get or create artifact entry
        if (!artifactMap.has(mainArtifactId)) {
          artifactMap.set(mainArtifactId, {
            artifactId: mainArtifactId,
            artifactName: lazyArtifact.artifactName,
            artifactType: lazyArtifact.artifactType,
            artifactDescription: lazyArtifact.artifactDescription || null,
            versions: []
          });
        }

        // Add version to artifact
        const artifactEntry = artifactMap.get(mainArtifactId)!;
        artifactEntry.versions.push({
          runId: agentRun.ID,
          versionId: lazyArtifact.artifactVersionId,
          versionNumber: lazyArtifact.versionNumber,
          versionName: lazyArtifact.versionName,
          versionDescription: lazyArtifact.versionDescription,
          createdAt: lazyArtifact.versionCreatedAt
        });
      }
    }

    // Convert map to array (most recent artifacts first based on their latest version)
    return Array.from(artifactMap.values()).sort((a, b) => {
      const aLatest = a.versions[0]?.createdAt || new Date(0);
      const bLatest = b.versions[0]?.createdAt || new Date(0);
      return bLatest.getTime() - aLatest.getTime();
    });
  }
}
