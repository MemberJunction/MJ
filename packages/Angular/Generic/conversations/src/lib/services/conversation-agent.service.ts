import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ExecuteAgentResult, AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { RunAgentFromConversationDetailParams } from '@memberjunction/ai-agent-client';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { LazyArtifactInfo } from '../models/lazy-artifact-info';
import { MentionParserService } from './mention-parser.service';
import { UUIDsEqual } from '@memberjunction/global';

import { ConversationsRuntimeBootstrap } from './conversations-runtime-bootstrap.service';

/**
 * Context for artifact lookups - provides pre-loaded data from conversation
 * to avoid redundant database queries
 */
export interface ArtifactLookupContext {
  agentRunsByDetailId: Map<string, MJAIAgentRunEntityExtended>;
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
 * Angular DI service for conversation-level agent orchestration.
 *
 * After PR 2 of the conversations-runtime extraction, the core
 * `processMessage` flow and the conversation-manager-agent resolution are
 * delegated to `@memberjunction/conversations-runtime`. This service is
 * primarily a shim for those operations PLUS the holder of the helpers
 * that haven't been ported yet:
 *
 * - `invokeSubAgent(...)` — used by Sage's routing decisions in
 *   `message-input.component`.
 * - `checkAgentContinuityIntent(...)` — fast intent classification when the
 *   user replies to a previous-agent thread.
 * - `findConfigurationPresetFromHistory(...)` — locates an agent's preset
 *   from prior @mentions in the conversation.
 * - `clearSession(...)` — per-conversation session-id bookkeeping.
 *
 * These can move to the runtime in a follow-up; they aren't strictly needed
 * to invoke an agent end-to-end and stay here so the shim has zero behavior
 * difference vs. the original.
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationAgentService {
  /** GraphQL AI client - retained for RunAIPrompt (intent checking) which AgentClientService doesn't wrap */
  private _aiClient: GraphQLAIClient | null = null;
  /** Cached resolution of the conversation manager agent (default agent). */
  private _conversationManagerAgent: MJAIAgentEntityExtended | null = null;
  private _sessionIds: Map<string, string> = new Map();

  /** Observable indicating if the ambient agent is currently processing — delegated to the runtime's AgentRunner. */
  public readonly isProcessing$: Observable<boolean>;

  private _provider: IMetadataProvider | null = null;

  constructor(
    _bootstrap: ConversationsRuntimeBootstrap,
    private mentionParser: MentionParserService,
    private agentClientService: AgentClientService
  ) {
    // Injecting `_bootstrap` forces the runtime's INotificationAdapter +
    // IActiveTaskTracker adapters to register before any shim method runs.
    this.isProcessing$ = ConversationsRuntime.Instance.AgentRunner.isProcessing$;
    this.initializeAIClient();
  }

  /**
   * The metadata provider this service uses. When unset, falls back to Metadata.Provider.
   * Setting it re-initializes the AI client and forwards the provider to the runtime's runner.
   */
  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
    this.initializeAIClient();
    ConversationsRuntime.Instance.AgentRunner.Provider = value;
  }

  /**
   * Initialize the GraphQL AI Client.
   * Retained for RunAIPrompt calls (intent checking) which the AgentClientService doesn't wrap.
   * Agent execution (RunAIAgentFromConversationDetail) now goes through ConversationsRuntime.AgentRunner.
   */
  private initializeAIClient(): void {
    try {
      const provider = this.Provider as GraphQLDataProvider;
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
   * Resolve the conversation manager agent via the runtime's 4-step
   * DefaultAgentResolver chain (explicit input → app-scoped Application
   * Setting → global Application Setting → code-const Sage fallback). The
   * result is cached on this service for use by the synchronous
   * {@link ConversationManagerAgentName} getter.
   *
   * Existing callers expect a Promise<MJAIAgentEntityExtended | null> — we
   * preserve that shape (returning null on failure rather than throwing)
   * so the call sites don't need to change.
   */
  public async getConversationManagerAgent(): Promise<MJAIAgentEntityExtended | null> {
    if (this._conversationManagerAgent) {
      return this._conversationManagerAgent;
    }

    try {
      const provider = this.Provider;
      const agent = await ConversationsRuntime.Instance.DefaultAgent.resolve({
        contextUser: provider.CurrentUser ?? undefined,
        provider,
      });
      this._conversationManagerAgent = agent;
      return agent;
    } catch (error) {
      const errorMsg = 'Error resolving conversation manager agent: ' + (error instanceof Error ? error.message : String(error));
      console.error(errorMsg);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      return null;
    }
  }

  /**
   * Synchronous read of the cached conversation-manager-agent name. Returns
   * `null` until {@link getConversationManagerAgent} has been called at least
   * once and resolved successfully. Used by `MessageItemComponent.isConversationManager`
   * to flag messages from the routing agent without hardcoding `'Sage'`.
   */
  public get ConversationManagerAgentName(): string | null {
    return this._conversationManagerAgent?.Name ?? null;
  }

  /**
   * Returns `true` if the supplied agent identifier (UUID or name) matches the
   * currently cached conversation manager agent. Robust to either input.
   */
  public IsConversationManagerAgent(agentIdOrName: string | null | undefined): boolean {
    if (!agentIdOrName || !this._conversationManagerAgent) return false;
    return (
      UUIDsEqual(this._conversationManagerAgent.ID, agentIdOrName) ||
      this._conversationManagerAgent.Name === agentIdOrName
    );
  }

  /**
   * Process a message through the conversation manager agent. Delegates to
   * `ConversationsRuntime.Instance.AgentRunner.processMessage(...)`.
   *
   * Signature is preserved verbatim from the original service so existing
   * call sites continue to compile. The unused `conversationHistory`
   * parameter is kept for backwards compatibility (it was already
   * documented as "kept for backwards compatibility but not used" in the
   * original).
   */
  async processMessage(
    conversationId: string,
    message: MJConversationDetailEntity,
    conversationHistory: MJConversationDetailEntity[],
    conversationDetailId: string,
    onProgress?: AgentExecutionProgressCallback,
    appContext?: Record<string, unknown> | null,
    planMode?: boolean,
    requestedSkillIDs?: string[]
  ): Promise<ExecuteAgentResult | null> {
    // Warm the cached default-agent name for any synchronous consumers
    // before the runtime resolves on its own.
    if (!this._conversationManagerAgent) {
      await this.getConversationManagerAgent();
    }
    return ConversationsRuntime.Instance.AgentRunner.processMessage({
      conversationId,
      message,
      conversationDetailId,
      appContext,
      onProgress,
      ...(planMode ? { planMode: true } : {}),
      ...(requestedSkillIDs?.length ? { requestedSkillIDs } : {}),
    });
  }

  /**
   * Find the configuration preset ID from a previous @mention of an agent in conversation history.
   * Searches backwards through User messages to find the most recent @mention of the specified agent
   * that includes a configId.
   *
   * @param agentId The agent ID to search for
   * @param conversationHistory The conversation history to search through
   * @returns The configuration preset ID if found, undefined otherwise
   */
  public findConfigurationPresetFromHistory(
    agentId: string,
    conversationHistory: MJConversationDetailEntity[]
  ): string | undefined {
    // Search backwards through history for User messages that @mention this agent with a configId
    const userMentionWithConfig = conversationHistory
      .slice()
      .reverse()
      .find(msg => {
        if (msg.Role !== 'User' || !msg.Message) return false;
        const mentionResult = this.mentionParser.parseMentions(
          msg.Message,
          AIEngineBase.Instance.Agents,
          []
        );
        return mentionResult.agentMention?.id === agentId && mentionResult.agentMention?.configurationId;
      });

    if (userMentionWithConfig) {
      const mentionResult = this.mentionParser.parseMentions(
        userMentionWithConfig.Message,
        AIEngineBase.Instance.Agents,
        []
      );
      if (mentionResult.agentMention?.configurationId) {
        console.log(`🎯 Found configuration preset from @mention: ${mentionResult.agentMention.configurationId}`);
        return mentionResult.agentMention.configurationId;
      }
    }

    return undefined;
  }

  /**
   * Clear the session for a conversation (useful when starting a new topic)
   */
  clearSession(conversationId: string): void {
    this._sessionIds.delete(conversationId);
  }

  /**
   * Invoke a sub-agent based on Sage Agent's payload.
   * This is called when Sage decides to delegate to a specialist agent.
   *
   * Stays on the Angular shim because it directly uses AgentClientService.
   * Could move to the runtime in a follow-up if needed.
   */
  async invokeSubAgent(
    agentName: string,
    conversationId: string,
    message: MJConversationDetailEntity,
    conversationHistory: MJConversationDetailEntity[],
    reasoning: string,
    conversationDetailId: string,
    payload?: unknown,
    onProgress?: AgentExecutionProgressCallback,
    sourceArtifactId?: string,
    sourceArtifactVersionId?: string,
    agentConfigurationPresetId?: string,
    appContext?: Record<string, unknown> | null,
    planMode?: boolean,
    requestedSkillIDs?: string[]
  ): Promise<ExecuteAgentResult | null> {
    try {
      // Ensure AIEngineBase is configured
      await AIEngineBase.Instance.Config(false);

      // Find the agent by name
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      if (!agent || !agent.ID) {
        const errorMsg = `Sub-agent "${agentName}" not found`;
        console.warn(`${errorMsg}`);
        MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
        return null;
      }

      console.log(`Invoking sub-agent: ${agentName}`, { reasoning, hasPayload: !!payload, hasConfigPreset: !!agentConfigurationPresetId });

      // Map AIAgentConfiguration preset ID to actual AIConfiguration ID
      let aiConfigurationId: string | undefined = undefined;
      if (agentConfigurationPresetId) {
        const presets = AIEngineBase.Instance.GetAgentConfigurationPresets(agent.ID, false);
        const preset = presets.find(p => UUIDsEqual(p.ID, agentConfigurationPresetId) || UUIDsEqual(p.AIConfigurationID, agentConfigurationPresetId));

        if (preset) {
          aiConfigurationId = preset.AIConfigurationID || undefined;
          console.log(`Mapped agent configuration preset "${preset.Name}" to AIConfigurationID: ${aiConfigurationId || 'default'}`);
        } else {
          console.warn(`Agent configuration preset ${agentConfigurationPresetId} not found for agent ${agent.ID}`);
        }
      }

      const agentParams: RunAgentFromConversationDetailParams = {
        ConversationDetailId: conversationDetailId,
        AgentId: agent.ID,
        MaxHistoryMessages: 20,
        Data: {
          conversationId: conversationId,
          latestMessageId: message.ID,
          invocationReason: reasoning,
          ...(appContext ? { appContext } : {}),
        },
        ...(payload ? { Payload: payload as Record<string, unknown> } : {}),
        ...(aiConfigurationId ? { ConfigurationId: aiConfigurationId } : {}),
        ...(planMode ? { PlanMode: true } : {}),
        ...(requestedSkillIDs?.length ? { RequestedSkillIDs: requestedSkillIDs } : {}),
        CreateArtifacts: true,
        CreateNotification: true,
        SourceArtifactId: sourceArtifactId,
        SourceArtifactVersionId: sourceArtifactVersionId,
        OnProgress: onProgress ? (progress) => {
          onProgress({
            step: progress.CurrentStep as 'initialization' | 'validation' | 'prompt_execution' | 'action_execution' | 'subagent_execution' | 'decision_processing' | 'finalization',
            percentage: progress.Percentage,
            message: progress.Message,
            metadata: progress.Metadata
          });
        } : undefined
      };

      const runResult = await this.agentClientService.RunAgentFromConversationDetail(agentParams);

      if (runResult.Success && runResult.Result) {
        return runResult.Result as ExecuteAgentResult;
      } else if (!runResult.Success) {
        const errorMsg = `Sub-agent "${agentName}" failed: ${runResult.ErrorMessage || 'unknown error'}`;
        console.error(errorMsg);
        MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
        return null;
      }

      return null;
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
   * Stays on the Angular shim because it directly uses GraphQLAIClient.
   * Could move to the runtime in a follow-up.
   */
  async checkAgentContinuityIntent(
    agentId: string,
    latestMessage: string,
    conversationHistory: MJConversationDetailEntity[],
    context: ArtifactLookupContext
  ): Promise<IntentCheckResult> {
    if (!this._aiClient) {
      console.warn('AI Client not initialized, defaulting to UNSURE for intent check');
      return { decision: 'UNSURE', reasoning: 'AI Client not initialized' };
    }

    try {
      await AIEngineBase.Instance.Config(false);
      const prompt = AIEngineBase.Instance.Prompts.find(p => p.Name === 'Check Sage Intent');
      if (!prompt) {
        console.warn('⚠️ Check Sage Intent prompt not found, defaulting to UNSURE');
        return { decision: 'UNSURE', reasoning: 'Check Sage Intent prompt not found' };
      }

      const agent = AIEngineBase.Instance.Agents.find(a => UUIDsEqual(a.ID, agentId));
      if (!agent) {
        console.warn('⚠️ Previous agent not found, defaulting to UNSURE');
        return { decision: 'UNSURE', reasoning: 'Previous agent not found' };
      }

      const agentArtifacts = this.findAllAgentArtifacts(
        agentId,
        conversationHistory,
        context
      );

      const recentHistory = conversationHistory.slice(-10);
      const compactHistory = recentHistory.map((msg, idx) => {
        const role = msg.Role === 'User' ? 'User' : agent.Name || 'Agent';
        const content = msg.Message || '';
        return `${idx + 1}. ${role}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`;
      }).join('\n');

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

      const userMessage = `**Previous Agent**: ${agent.Name} - ${agent.Description || 'No description'}

**Conversation History** (last ${recentHistory.length} messages):
${compactHistory}${artifactContext}

**Latest User Message**: "${latestMessage}"`;

      console.log('🔍 Checking agent continuity intent...', {
        agentName: agent.Name,
        messagePreview: latestMessage.substring(0, 50),
        artifactCount: agentArtifacts.length
      });

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
      return {
        decision: 'UNSURE',
        reasoning: `Error during intent check: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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
    conversationDetails: MJConversationDetailEntity[],
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

    for (let i = conversationDetails.length - 1; i >= 0; i--) {
      const detail = conversationDetails[i];

      if (detail.Role !== 'AI' || detail.Status === 'Error') continue;

      const agentRun = context.agentRunsByDetailId.get(detail.ID);
      if (!agentRun || !UUIDsEqual(agentRun.AgentID, agentId) || agentRun.Status !== 'Completed') {
        continue;
      }

      const artifacts = context.artifactsByDetailId.get(detail.ID);
      if (!artifacts || artifacts.length === 0) continue;

      for (const lazyArtifact of artifacts) {
        const mainArtifactId = lazyArtifact.artifactId;

        if (!artifactMap.has(mainArtifactId)) {
          artifactMap.set(mainArtifactId, {
            artifactId: mainArtifactId,
            artifactName: lazyArtifact.artifactName,
            artifactType: lazyArtifact.artifactType,
            artifactDescription: lazyArtifact.artifactDescription || null,
            versions: []
          });
        }

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

    return Array.from(artifactMap.values()).sort((a, b) => {
      const aLatest = a.versions[0]?.createdAt || new Date(0);
      const bLatest = b.versions[0]?.createdAt || new Date(0);
      return bLatest.getTime() - aLatest.getTime();
    });
  }
}
