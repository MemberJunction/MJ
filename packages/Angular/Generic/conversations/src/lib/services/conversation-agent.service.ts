import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Metadata, IMetadataProvider, RunView } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ExecuteAgentResult, AgentExecutionProgressCallback, coerceFailedExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
  MJConversationDetailEntity,
  MJArtifactVersionEntity,
  MJArtifactEntity
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { RunAgentFromConversationDetailParams } from '@memberjunction/ai-agent-client';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { LazyArtifactInfo } from '../models/lazy-artifact-info';
import { MentionParserService } from './mention-parser.service';
import { UUIDsEqual } from '@memberjunction/global';

import { ConversationsRuntimeBootstrap } from './conversations-runtime-bootstrap.service';
import {
  GroupVersionsByArtifact,
  type AgentArtifactSummary
} from '../utils/agent-artifact-summary';

/**
 * Rows the configuration-preset lookup parses before giving up. The SQL prefilter is a LIKE,
 * so a few candidates may not be real mention blobs; this bounds how many we inspect.
 */
const CONFIG_PRESET_CANDIDATE_ROWS = 5;

/**
 * Cap on artifact versions listed for the intent classifier.
 *
 * The block is a hint, not a record: the prompt prints a name, a type, a version count and
 * the latest version per artifact. Newest-first ordering means the cap only ever trims the
 * oldest versions of the busiest artifacts, which are the least useful lines in it.
 */
const MAX_AGENT_ARTIFACT_VERSIONS = 40;

/**
 * Context for artifact lookups — pre-loaded conversation data.
 *
 * NO LONGER CONSUMED by this service. Both readers were converted to queries when transcript
 * windowing made these maps a partial view: they are keyed to the loaded window, so any
 * lookup for an older row silently missed. Retained as an exported type for API
 * compatibility; new code should not build one.
 */
export interface ArtifactLookupContext {
  agentRunsByDetailId: Map<string, MJAIAgentRunEntityExtended>;
  artifactsByDetailId: Map<string, LazyArtifactInfo[]>;
}

/**
 * An agent's prior OUTPUT artifact, resolved for payload continuity.
 *
 * `payload` is the parsed `ArtifactVersion.Content`, typed to match what actually consumes it
 * — `executeAgentContinuation` and `invokeSubAgent` both take `Record<string, unknown> | null`.
 * It is null when the version carried no content, the content did not parse, or the content
 * parsed to something that is not a JSON object; callers treat all three the same as "no prior
 * artifact", which is already a legal agent input.
 */
export interface AgentPayloadSource {
  artifactId: string;
  versionId: string;
  versionNumber: number;
  payload: Record<string, unknown> | null;
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
 * - `FindConfigurationPresetForAgent(...)` — locates an agent's preset
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
   * Configuration preset an agent was pinned to by a previous `@mention` in this conversation.
   *
   * Resolved by QUERY, not by scanning the display array. The pinning `@mention` is normally
   * the FIRST message of an exchange and everything after it is follow-up, so it is the
   * message most likely to fall below the loaded transcript window — and `undefined` is a
   * legal value for `configurationPresetId`, so the miss is silent. The visible consequence
   * is a run executed under the default configuration (a different model tier) instead of the
   * one the user explicitly chose, with a plausible-looking result and no error.
   *
   * There is no column to filter on: the preset lives inside the message body as a JSON
   * mention blob (`@{"type":"agent","id":"…","configId":"…"}`). So SQL narrows and the parser
   * decides — both `configId` and the agent id appear verbatim in that blob, which makes the
   * two LIKEs a tight prefilter, and `parseMentions` is what actually confirms a match.
   */
  public async FindConfigurationPresetForAgent(
    conversationId: string,
    agentId: string
  ): Promise<string | undefined> {
    type MentionRow = Pick<MJConversationDetailEntity, 'ID' | 'Message'>;

    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<MentionRow>({
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `ConversationID='${conversationId}' AND Role='User'`
        + ` AND Message LIKE '%"configId"%' AND Message LIKE '%${agentId}%'`,
      OrderBy: 'Sequence DESC',
      // >1 because LIKE cannot tell a mention blob from the same id appearing elsewhere in
      // the prose; the parse below is authoritative and picks the newest genuine match.
      MaxRows: CONFIG_PRESET_CANDIDATE_ROWS,
      Fields: ['ID', 'Message'],
      ResultType: 'simple'
    }, this.Provider.CurrentUser ?? undefined);

    if (!result.Success) {
      console.error('Failed to resolve configuration preset:', result.ErrorMessage);
      return undefined;
    }

    for (const row of result.Results || []) {
      const configurationId = this.readAgentConfigFromMention(row.Message, agentId);
      if (configurationId) {
        console.log(`\u{1F3AF} Found configuration preset from @mention: ${configurationId}`);
        return configurationId;
      }
    }
    return undefined;
  }

  /** Returns the configId this message pins for `agentId`, or null when it pins none. */
  private readAgentConfigFromMention(message: string | null, agentId: string): string | null {
    if (!message) {
      return null;
    }
    const parsed = this.mentionParser.parseMentions(message, AIEngineBase.Instance.Agents, []);
    const mention = parsed.agentMention;
    return mention?.id === agentId && mention.configurationId ? mention.configurationId : null;
  }


  /**
   * Clear the session for a conversation (useful when starting a new topic)
   */
  clearSession(conversationId: string): void {
    this._sessionIds.delete(conversationId);
  }

  /**
   * Surfaces a warning toast when the user requested skills (via /skill mentions) that the
   * target agent cannot activate — the server drops such requests, and without this the
   * refusal is invisible to the user. Client-side check uses the agent gate only (the server
   * additionally intersects with the user's Run permission).
   */
  private warnOnUnacceptedSkills(agent: MJAIAgentEntityExtended, requestedSkillIDs: string[]): void {
    const allowed = AIEngineBase.Instance.GetSkillsForAgent(agent);
    const dropped = requestedSkillIDs.filter(id => !allowed.some(s => UUIDsEqual(s.ID, id)));
    if (dropped.length === 0) return;
    const names = dropped.map(
      id => AIEngineBase.Instance.Skills.find(s => UUIDsEqual(s.ID, id))?.Name ?? 'requested skill'
    );
    const reason = agent.AcceptsSkills === 'None'
      ? `${agent.Name} doesn't accept skills`
      : `${agent.Name} can't activate ${names.length === 1 ? 'this skill' : 'these skills'}`;
    MJNotificationService.Instance?.CreateSimpleNotification(
      `${reason} — ${names.join(', ')} won't be used for this run.`,
      'warning',
      6000
    );
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
    payload?: Record<string, unknown> | null,
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

      if (requestedSkillIDs?.length) {
        this.warnOnUnacceptedSkills(agent, requestedSkillIDs);
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
        ...(payload ? { Payload: payload } : {}),
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
      }

      const failed = coerceFailedExecuteAgentResult(
        runResult.Result as ExecuteAgentResult | null | undefined,
        runResult.ErrorMessage || `Sub-agent "${agentName}" failed`,
      );
      const errorMsg = `Sub-agent "${agentName}" failed: ${failed.errorMessage}`;
      console.error(errorMsg);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      return failed;
    } catch (error) {
      const errorMsg = `Error invoking sub-agent "${agentName}": ` + (error instanceof Error ? error.message : String(error));
      console.error(`Error invoking sub-agent "${agentName}":`, error);
      MJNotificationService.Instance?.CreateSimpleNotification(errorMsg, 'error', 5000);
      return coerceFailedExecuteAgentResult<ExecuteAgentResult>(undefined, errorMsg);
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
    conversationId: string,
    agentId: string,
    latestMessage: string,
    conversationHistory: MJConversationDetailEntity[]
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

      // Queried, not read off the caller's window-scoped maps — see findAllAgentArtifacts.
      // `conversationHistory` below is still the window on purpose: the `.slice(-10)` wants
      // the most recent exchange, which the loaded tail always contains.
      const agentArtifacts = await this.findAllAgentArtifacts(conversationId, agentId);

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
   * Every artifact this agent produced in this conversation, newest version first — resolved
   * by QUERY, not by scanning the display array.
   *
   * The scan this replaces walked `conversationDetails` and looked each row up in the
   * caller's `artifactsByDetailId` / `agentRunsByDetailId` maps. Both are scoped to the
   * LOADED WINDOW, so under transcript windowing it saw only the artifacts attached to the
   * page currently on screen.
   *
   * That matters because this list is the "Prior Artifacts Created by This Agent" block fed
   * to the Check Sage Intent prompt, which is what produces `targetArtifactVersionId`. A
   * truncated list does not make the classifier fail — it makes it reason over a partial
   * history and confidently name the wrong version, or miss continuity altogether. Silent,
   * plausible, and wrong: the same failure class as {@link FindLatestAgentOutputVersion},
   * closed the same way.
   *
   * Two reads, not the four the old shape would have needed — see
   * {@link AgentArtifactSummary} for why dropping `runId` removes the join back to agent runs.
   */
  private async findAllAgentArtifacts(
    conversationId: string,
    agentId: string
  ): Promise<AgentArtifactSummary[]> {
    type VersionRow = Pick<MJArtifactVersionEntity, 'ID' | 'ArtifactID' | 'VersionNumber' | 'Name'>;

    const rv = RunView.FromMetadataProvider(this.Provider);
    const versionResult = await rv.RunView<VersionRow>({
      EntityName: 'MJ: Artifact Versions',
      ExtraFilter: this.agentOutputVersionFilter(conversationId, agentId),
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: MAX_AGENT_ARTIFACT_VERSIONS,
      Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Name'],
      ResultType: 'simple'
    }, this.Provider.CurrentUser ?? undefined);

    if (!versionResult.Success) {
      console.error('Failed to load agent artifact versions:', versionResult.ErrorMessage);
      return [];                    // the classifier degrades to no artifact context
    }
    const versions = versionResult.Results || [];
    if (versions.length === 0) {
      return [];
    }

    const artifactsById = await this.loadArtifactNames(
      [...new Set(versions.map(v => v.ArtifactID))]
    );
    return GroupVersionsByArtifact(versions, artifactsById);
  }

  /** Names and types for the artifacts behind a set of versions. */
  private async loadArtifactNames(
    artifactIds: string[]
  ): Promise<Map<string, Pick<MJArtifactEntity, 'ID' | 'Name' | 'Type'>>> {
    type ArtifactRow = Pick<MJArtifactEntity, 'ID' | 'Name' | 'Type'>;

    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<ArtifactRow>({
      EntityName: 'MJ: Artifacts',
      ExtraFilter: `ID IN (${artifactIds.map(id => `'${id}'`).join(',')})`,
      Fields: ['ID', 'Name', 'Type'],
      ResultType: 'simple'
    }, this.Provider.CurrentUser ?? undefined);

    if (!result.Success) {
      console.error('Failed to load agent artifacts:', result.ErrorMessage);
      return new Map<string, ArtifactRow>();
    }
    return new Map((result.Results || []).map(a => [a.ID, a]));
  }

  /**
   * Newest OUTPUT artifact version an agent produced in this conversation — resolved by
   * QUERY, not by scanning the display array.
   *
   * The array scan this replaces was correct only while `conversationHistory` held the whole
   * conversation. Under transcript windowing it holds one page, so the scan silently returns
   * null for any artifact below the window's oldest row — exactly the long "modify this
   * again" exchanges where payload continuity matters most. A null payload is a LEGAL agent
   * input, so the failure is silent: the agent regenerates from scratch instead of modifying.
   *
   * One round trip. The subquery walks details -> Output junctions, and versions carry
   * `__mj_CreatedAt`, so "newest" is expressible without joining back for `Sequence`.
   */
  public async FindLatestAgentOutputVersion(
    conversationId: string,
    agentId: string
  ): Promise<AgentPayloadSource | null> {
    return this.runPayloadSourceQuery(
      this.agentOutputVersionFilter(conversationId, agentId), '__mj_CreatedAt DESC'
    );
  }

  /**
   * `ArtifactVersion.ID IN (...)` for every OUTPUT artifact an agent produced in one
   * conversation. Shared by {@link FindLatestAgentOutputVersion} and
   * {@link findAllAgentArtifacts} so the two can never disagree about what "this agent's
   * artifacts" means.
   *
   * Filters on the DETAIL's `Status <> 'Error'` rather than the agent run's
   * `Status = 'Completed'` (which is what the array scan this replaced used). Doing it on the
   * run would mean joining back to `MJ: AI Agent Runs` purely to restate a condition the
   * detail already carries.
   */
  private agentOutputVersionFilter(conversationId: string, agentId: string): string {
    return `ID IN (
        SELECT ArtifactVersionID FROM [__mj].[vwConversationDetailArtifacts]
        WHERE Direction='Output' AND ConversationDetailID IN (
          SELECT ID FROM [__mj].[vwConversationDetails]
          WHERE ConversationID='${conversationId}' AND AgentID='${agentId}'
            AND Role='AI' AND Status <> 'Error'
        )
      )`;
  }

  /**
   * One artifact version by ID, as a payload source.
   *
   * Used by the continuity path after the intent check names a specific version: that ID may
   * belong to a message below the loaded window, so it cannot be resolved from the window's
   * artifact maps.
   */
  public async FindArtifactVersionById(versionId: string): Promise<AgentPayloadSource | null> {
    return this.runPayloadSourceQuery(`ID='${versionId}'`, undefined);
  }

  /**
   * Shared read behind {@link FindLatestAgentOutputVersion} and {@link FindArtifactVersionById}.
   *
   * `ResultType: 'simple'` with an explicit `Fields` list: nothing here is mutated, and under
   * `entity_object` the `Fields` narrowing would be silently discarded by `PreRunView`.
   */
  private async runPayloadSourceQuery(
    extraFilter: string,
    orderBy: string | undefined
  ): Promise<AgentPayloadSource | null> {
    type VersionRow = Pick<MJArtifactVersionEntity, 'ID' | 'ArtifactID' | 'VersionNumber' | 'Content'>;

    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<VersionRow>({
      EntityName: 'MJ: Artifact Versions',
      ExtraFilter: extraFilter,
      OrderBy: orderBy,
      MaxRows: 1,
      Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Content'],
      ResultType: 'simple'
    }, this.Provider.CurrentUser ?? undefined);

    if (!result.Success) {
      console.error('Failed to resolve agent payload source:', result.ErrorMessage);
      return null;
    }
    const row = result.Results?.[0];
    if (!row) {
      return null;
    }
    return {
      artifactId: row.ArtifactID,
      versionId: row.ID,
      versionNumber: row.VersionNumber,
      payload: parseArtifactContent(row.Content)
    };
  }

}

/**
 * Parses an artifact version's `Content` into an agent payload. Returns null rather than
 * throwing — a malformed artifact must not take down the send path, and "no payload" is
 * already a legal agent input.
 *
 * A payload must be a JSON OBJECT. Valid JSON that parses to an array, string, or number is
 * rejected for the same reason a parse failure is: every consumer spreads it or reads named
 * keys off it, so a non-object would satisfy the type at the boundary and misbehave deeper in.
 */
function parseArtifactContent(content: string | null | undefined): Record<string, unknown> | null {
  if (!content) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(content);
    return isPayloadObject(parsed) ? parsed : null;
  } catch (error) {
    console.warn('Artifact version content did not parse as JSON:', error);
    return null;
  }
}

/** Narrows a parsed JSON value to a plain object — the only shape a payload may take. */
function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
