/**
 * @fileoverview Pure-TypeScript agent-run pipeline for conversations.
 *
 * Ported from `@memberjunction/ng-conversations/src/lib/services/conversation-agent.service.ts`,
 * scoped to the core `processMessage` flow. The Angular service's other helpers
 * (intent checking, sub-agent invocation, artifact lookup, configuration-preset
 * lookup) stay in the widget for now and can move in a follow-up — they aren't
 * needed to invoke an agent end-to-end.
 *
 * Replaces three Angular bindings from the original:
 * - `MJNotificationService.Instance.CreateSimpleNotification(...)` →
 *   {@link IConversationsRuntimeContext.Notification}.
 * - `AgentClientService` (Angular wrapper over `AgentClientSession`) →
 *   `AgentClientSession` used directly (already pure-TS).
 * - Hardcoded `Agents.find(a => a.Name === 'Sage')` → {@link DefaultAgentResolver}.
 *
 * @module @memberjunction/conversations-runtime
 */

import { BehaviorSubject, Observable } from 'rxjs';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    AgentClientSession,
    ClientToolRegistry,
    RunAgentFromConversationDetailParams,
} from '@memberjunction/ai-agent-client';
import {
    AIEngineBase,
    AIAgentPermissionHelper,
} from '@memberjunction/ai-engine-base';
import {
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';

import { IConversationsRuntimeContext } from '../context/IConversationsRuntimeContext';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';

/**
 * Inputs to {@link ConversationAgentRunner.processMessage}. Replaces the original
 * service's positional parameter list with a typed struct so call sites don't
 * silently break when fields are added or reordered.
 */
export interface ProcessMessageInput {
    /** The conversation this message belongs to. */
    conversationId: string;
    /** The just-sent user message (used for `latestMessageId` plumbing). */
    message: MJConversationDetailEntity;
    /**
     * The `MJ: Conversation Details` row that tracks this agent run on the
     * server. Required for the optimized `RunAIAgentFromConversationDetail` path,
     * which loads conversation history server-side.
     */
    conversationDetailId: string;
    /**
     * Application context to inject into the agent's system prompt. Used by
     * embedders (Form Builder cockpit, Component Studio AI Assistant, future LXP)
     * to ground the agent in their UI state.
     */
    appContext?: Record<string, unknown> | null;
    /**
     * Optional progress callback. Mirrors the original service's signature —
     * embedders forward this through to the widget's progress UI.
     */
    onProgress?: AgentExecutionProgressCallback;
    /**
     * Optional explicit agent ID. When set, wins over the {@link DefaultAgentResolver}
     * chain. Mirrors the widget's `[DefaultAgentId]` input.
     */
    explicitAgentId?: string | null;
    /**
     * Application context for default-agent resolution. App-scoped Application
     * Settings beat the global default.
     */
    applicationId?: string | null;
}

/**
 * Core agent-run orchestrator. Wraps {@link AgentClientSession.RunAgentFromConversationDetail}
 * with conversation-aware glue: default-agent resolution, permission-filtered
 * candidate list for Sage's routing decisions, processing-state observable, and
 * adapter-routed user notifications.
 *
 * Usually accessed via `ConversationsRuntime.Instance.AgentRunner`.
 */
export class ConversationAgentRunner {
    private readonly session: AgentClientSession;
    private readonly _isProcessing$ = new BehaviorSubject<boolean>(false);
    private _provider: IMetadataProvider | null = null;

    /** Emits `true` while an agent run is in flight, `false` otherwise. */
    public readonly isProcessing$: Observable<boolean> = this._isProcessing$.asObservable();

    /**
     * @param context Runtime context — used for notifications. Read on each call
     *     so adapter swaps after construction are picked up immediately.
     * @param toolRegistry Shared `ClientToolRegistry` — the runner's internal
     *     `AgentClientSession` uses this so tools registered on
     *     `ConversationsRuntime.Tools` are visible to the agent.
     * @param resolver The runtime's `DefaultAgentResolver` — used to pick the
     *     conversation manager agent when no explicit ID is supplied.
     */
    constructor(
        private readonly context: IConversationsRuntimeContext,
        toolRegistry: ClientToolRegistry,
        private readonly resolver: DefaultAgentResolver
    ) {
        this.session = new AgentClientSession(toolRegistry);
    }

    /**
     * Metadata provider — falls back to `Metadata.Provider` when unset. Setting
     * this forwards the provider to the internal `AgentClientSession` so GraphQL
     * calls target the right server in multi-provider scenarios.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
        this.session.Provider = value;
    }

    /**
     * Process a user message through the default conversation manager agent. Mirrors
     * the original service's `processMessage(...)` flow, but with the three Angular
     * deps replaced (notification adapter, default-agent resolver, direct
     * `AgentClientSession`).
     *
     * @returns The agent's `ExecuteAgentResult`, or `null` if the agent failed and
     *     a notification was surfaced.
     */
    public async processMessage(input: ProcessMessageInput): Promise<ExecuteAgentResult | null> {
        const agent = await this.resolveAgent(input);
        if (!agent) return null;

        try {
            this._isProcessing$.next(true);

            const currentUser = this.Provider.CurrentUser;
            if (!currentUser) {
                console.warn(
                    '[ConversationAgentRunner] No current user available for permission filtering; using unfiltered agent list.'
                );
            }

            const candidateAgents = AIEngineBase.Instance.Agents.filter(
                (a) =>
                    !UUIDsEqual(a.ID, agent.ID) &&
                    !a.ParentID &&
                    a.Status === 'Active' &&
                    a.InvocationMode !== 'Sub-Agent'
            );

            const availableAgents = currentUser
                ? await this.filterAgentsByPermissions(candidateAgents, currentUser)
                : candidateAgents;

            console.log(
                `[ConversationAgentRunner] Available agents for routing: ${availableAgents.length} (filtered from ${candidateAgents.length} candidates)`
            );

            const agentParams: RunAgentFromConversationDetailParams = {
                ConversationDetailId: input.conversationDetailId,
                AgentId: agent.ID,
                MaxHistoryMessages: 20,
                Data: {
                    ALL_AVAILABLE_AGENTS: availableAgents.map((a) => ({
                        ID: a.ID,
                        Name: a.Name,
                        Description: a.Description,
                    })),
                    conversationId: input.conversationId,
                    latestMessageId: input.message.ID,
                    ...(input.appContext ? { appContext: input.appContext } : {}),
                    // Forward registered client tools so the LLM sees them in the prompt.
                    clientTools: this.session
                        .GetRegisteredTools()
                        .map((t) => ({
                            Name: t.Name,
                            Description: t.Description,
                            InputSchema: t.ParameterSchema,
                        })),
                },
                CreateArtifacts: true,
                CreateNotification: true,
                OnProgress: input.onProgress
                    ? (progress) =>
                          input.onProgress!({
                              step: progress.CurrentStep as
                                  | 'initialization'
                                  | 'validation'
                                  | 'prompt_execution'
                                  | 'action_execution'
                                  | 'subagent_execution'
                                  | 'decision_processing'
                                  | 'finalization',
                              percentage: progress.Percentage,
                              message: progress.Message,
                              metadata: progress.Metadata,
                          })
                    : undefined,
            };

            const runResult = await this.session.RunAgentFromConversationDetail(agentParams);

            if (runResult.Success && runResult.Result) {
                return runResult.Result as ExecuteAgentResult;
            }
            if (!runResult.Success) {
                const errorMsg = runResult.ErrorMessage ?? 'Agent execution failed';
                console.error('[ConversationAgentRunner] Agent execution failed:', errorMsg);
                this.context.Notification.Notify('error', errorMsg, 5_000);
                return null;
            }
            return null;
        } catch (error) {
            const errorMsg =
                'Error processing message through agent: ' +
                (error instanceof Error ? error.message : String(error));
            console.error('[ConversationAgentRunner] Error processing message:', error);
            this.context.Notification.Notify('error', errorMsg, 5_000);
            return null;
        } finally {
            this._isProcessing$.next(false);
        }
    }

    /**
     * Resolve the agent that should handle this turn — explicit ID wins, then the
     * Application Settings chain, then the Sage code-const fallback. Surfaces a
     * notification on failure rather than throwing, so the caller (UI thread)
     * sees a friendly message.
     */
    private async resolveAgent(input: ProcessMessageInput): Promise<MJAIAgentEntityExtended | null> {
        try {
            return await this.resolver.resolve({
                explicitAgentId: input.explicitAgentId,
                applicationId: input.applicationId,
                contextUser: this.Provider.CurrentUser ?? undefined,
                provider: this.Provider,
            });
        } catch (error) {
            const errorMsg =
                'Could not resolve a default conversation manager agent: ' +
                (error instanceof Error ? error.message : String(error));
            console.error('[ConversationAgentRunner] Agent resolution failed:', error);
            this.context.Notification.Notify('error', errorMsg, 5_000);
            return null;
        }
    }

    /**
     * Filter agents by the user's `run` permission. Identical to the original
     * service's helper — fails closed on per-agent error so we never expose an
     * agent the user shouldn't see.
     */
    private async filterAgentsByPermissions(
        agents: MJAIAgentEntityExtended[],
        user: UserInfo
    ): Promise<MJAIAgentEntityExtended[]> {
        const permittedAgents: MJAIAgentEntityExtended[] = [];
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
                console.error(
                    `[ConversationAgentRunner] Error checking permission for agent ${agent.Name}:`,
                    error
                );
                // Fail closed — exclude on error.
            }
        }
        return permittedAgents;
    }
}
