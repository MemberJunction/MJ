/**
 * @fileoverview Framework-agnostic controller for persistent conversation Side Questions.
 *
 * Manages per-(ParentConversationID, ParentBranchID) side-question threads backed by
 * child `MJ: Conversations` rows (`TypeID = SIDE_QUESTION`), delegating persistence to
 * {@link ConversationEngine}, streaming updates to {@link ConversationStreaming}, and
 * agent execution to {@link ConversationAgentRunner} (`AgentRunner`).
 *
 * @module @memberjunction/conversations-runtime
 */

import { BehaviorSubject, Observable } from 'rxjs';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase, AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
    ConversationEngine,
    MJConversationDetailEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { ConversationAgentRunner, NarrowToAllowedAgents } from '../agent-runner/ConversationAgentRunner';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';
import { MentionParser } from '../mentions/MentionParser';
import { ConversationStreaming, MessageProgressCallback } from '../streaming/ConversationStreaming';

/** Snapshot state for a single (ParentConversationID, ParentBranchID) side-question thread. */
export interface SideQuestionScopeState {
    ParentConversationId: string;
    ParentBranchId: string | null;
    SideConversation: MJConversationEntity | null;
    Messages: MJConversationDetailEntity[];
    TurnCount: number;
    PreferredAgentId: string | null;
    IsLoading: boolean;
    IsAsking: boolean;
    InFlightDetailId: string | null;
    StreamingText: string;
    ActiveStatusText: string;
    ActiveAgentName: string | null;
    ErrorMessage: string | null;
}

/** Input parameters for {@link SideQuestionController.AskQuestion}. */
export interface AskSideQuestionInput {
    ParentConversationId: string;
    ParentBranchId: string | null;
    QuestionText: string;
    CurrentUser: UserInfo;
    PreferredAgent?: MJAIAgentEntityExtended | null;
    ApplicationId?: string | null;
    AllowedAgentIDs?: readonly string[] | null;
    EnvironmentId?: string;
    Provider?: IMetadataProvider;
}

/** Return payload from {@link SideQuestionController.AskQuestion}. */
export interface AskSideQuestionResult {
    SideConversationId: string;
    UserDetailId: string;
    AgentDetailId: string | null;
    Success: boolean;
    ErrorMessage?: string;
}

interface ResolvedTargetAgent {
    agent: MJAIAgentEntityExtended;
    configurationId?: string;
    requestedSkillIDs?: string[];
}

/**
 * Coordinates loading, asking, streaming, clearing, and agent pinning for persistent
 * Side Questions across conversations and fork branches without interfering with the
 * main conversation's runner.
 */
export class SideQuestionController {
    private readonly subjects = new Map<string, BehaviorSubject<SideQuestionScopeState>>();
    private readonly loadedSummaryScopes = new Set<string>();
    private _provider: IMetadataProvider | null = null;

    constructor(
        private readonly agentRunner: ConversationAgentRunner,
        private readonly defaultAgent: DefaultAgentResolver,
        private readonly streaming: ConversationStreaming,
        private readonly mentions: MentionParser = new MentionParser()
    ) {}

    /** Metadata provider — defaults to `Metadata.Provider` when unset. */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
        this.agentRunner.Provider = value;
    }

    /** Builds a deterministic cache key for `(parentConversationId, parentBranchId)`. */
    public static ScopeKey(parentConversationId: string, parentBranchId: string | null): string {
        const parentKey = NormalizeUUID(parentConversationId);
        const branchKey = parentBranchId ? NormalizeUUID(parentBranchId) : 'main';
        return `${parentKey}::${branchKey}`;
    }

    /** Returns an observable stream for `(parentConversationId, parentBranchId)` state updates. */
    public ObserveScope(
        parentConversationId: string,
        parentBranchId: string | null
    ): Observable<SideQuestionScopeState> {
        return this.getOrCreateSubject(parentConversationId, parentBranchId).asObservable();
    }

    /** Returns the synchronous current snapshot for `(parentConversationId, parentBranchId)`. */
    public GetScopeState(
        parentConversationId: string,
        parentBranchId: string | null
    ): SideQuestionScopeState {
        return this.getOrCreateSubject(parentConversationId, parentBranchId).value;
    }

    /**
     * Lightweight summary check for `(parentConversationId, parentBranchId)` when a conversation
     * opens: populates `TurnCount` and `PreferredAgentId` without hydrating entity objects or
     * loading detail rows until the user actually opens the Side Question panel.
     * Results are memoized per scope unless `forceRefresh` is true.
     */
    public async LoadScopeSummary(
        parentConversationId: string,
        parentBranchId: string | null,
        currentUser: UserInfo,
        provider?: IMetadataProvider,
        forceRefresh = false
    ): Promise<SideQuestionScopeState> {
        const key = SideQuestionController.ScopeKey(parentConversationId, parentBranchId);
        if (!forceRefresh && this.loadedSummaryScopes.has(key)) {
            return this.GetScopeState(parentConversationId, parentBranchId);
        }
        const md = provider ?? this.Provider;
        try {
            const summary = await this.conversationEngine(md).GetSideConversationSummary(
                parentConversationId,
                parentBranchId,
                currentUser,
                md
            );
            this.loadedSummaryScopes.add(key);
            const current = this.GetScopeState(parentConversationId, parentBranchId);
            return this.patchState(parentConversationId, parentBranchId, {
                TurnCount:
                    current.Messages.length > 0
                        ? current.Messages.filter((m) => m.Role === 'User').length
                        : summary.TurnCount,
                PreferredAgentId: summary.DefaultAgentID ?? current.PreferredAgentId,
            });
        } catch {
            return this.GetScopeState(parentConversationId, parentBranchId);
        }
    }

    /**
     * Loads the active persisted side-question thread and its message history for
     * `(parentConversationId, parentBranchId)` via {@link ConversationEngine}.
     */
    public async LoadScope(
        parentConversationId: string,
        parentBranchId: string | null,
        currentUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<SideQuestionScopeState> {
        const md = provider ?? this.Provider;
        const convEngine = this.conversationEngine(md);
        const existing = this.GetScopeState(parentConversationId, parentBranchId);
        this.patchState(parentConversationId, parentBranchId, {
            IsLoading: true,
            ErrorMessage: null,
        });

        try {
            const threads = await convEngine.LoadSideConversations(
                parentConversationId,
                parentBranchId,
                currentUser,
                md
            );
            const sideConv = threads[0] ?? null;
            const messages = sideConv
                ? await convEngine.LoadSideConversationDetails(sideConv.ID, currentUser, md)
                : [];
            this.loadedSummaryScopes.add(SideQuestionController.ScopeKey(parentConversationId, parentBranchId));
            return this.patchState(parentConversationId, parentBranchId, {
                SideConversation: sideConv,
                Messages: messages,
                TurnCount: messages.filter((m) => m.Role === 'User').length,
                PreferredAgentId: sideConv?.DefaultAgentID ?? existing.PreferredAgentId ?? null,
                IsLoading: false,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to load side questions';
            return this.patchState(parentConversationId, parentBranchId, {
                IsLoading: false,
                ErrorMessage: msg,
            });
        }
    }

    /**
     * Updates the preferred default agent for this side-question scope, persisting `DefaultAgentID`
     * on the child `MJ: Conversations` record when one already exists (or holding it until creation).
     */
    public async SetPreferredAgent(
        parentConversationId: string,
        parentBranchId: string | null,
        agentId: string | null,
        _currentUser: UserInfo
    ): Promise<boolean> {
        const current = this.GetScopeState(parentConversationId, parentBranchId);
        const previousId = current.PreferredAgentId;
        this.patchState(parentConversationId, parentBranchId, {
            PreferredAgentId: agentId,
            ErrorMessage: null,
        });

        const sideConv = current.SideConversation;
        if (!sideConv) {
            return true;
        }
        if (sideConv.DefaultAgentID === agentId || (sideConv.DefaultAgentID && agentId && UUIDsEqual(sideConv.DefaultAgentID, agentId))) {
            return true;
        }

        const prevConvAgent = sideConv.DefaultAgentID;
        sideConv.DefaultAgentID = agentId;
        try {
            const saved = await sideConv.Save();
            if (!saved) {
                sideConv.DefaultAgentID = prevConvAgent;
                this.patchState(parentConversationId, parentBranchId, {
                    PreferredAgentId: previousId,
                    ErrorMessage: sideConv.LatestResult?.CompleteMessage || 'Failed to save side-question agent preference.',
                });
                return false;
            }
            return true;
        } catch (err: unknown) {
            sideConv.DefaultAgentID = prevConvAgent;
            this.patchState(parentConversationId, parentBranchId, {
                PreferredAgentId: previousId,
                ErrorMessage: err instanceof Error ? err.message : 'Failed to save side-question agent preference.',
            });
            return false;
        }
    }

    /**
     * Sends a side question on `(ParentConversationId, ParentBranchId)`, creating or reusing the
     * persistent child `SIDE_QUESTION` conversation, saving the user message, delegating agent
     * execution through {@link ConversationAgentRunner}, streaming tokens via {@link ConversationStreaming},
     * and reloading both persisted rows.
     */
    public async AskQuestion(input: AskSideQuestionInput): Promise<AskSideQuestionResult> {
        const question = input.QuestionText.trim();
        if (!question) {
            throw new Error('QuestionText cannot be empty.');
        }

        const md = input.Provider ?? this.Provider;
        if (input.Provider) {
            this.agentRunner.Provider = input.Provider;
        }

        const priorState = this.GetScopeState(input.ParentConversationId, input.ParentBranchId);
        const initialAgentId =
            input.PreferredAgent?.ID ??
            priorState.SideConversation?.DefaultAgentID ??
            priorState.PreferredAgentId ??
            null;

        const sideConv = await this.conversationEngine(md).GetOrCreateSideConversation(
            input.ParentConversationId,
            input.ParentBranchId,
            {
                environmentId: input.EnvironmentId,
                ...(initialAgentId ? { defaultAgentId: initialAgentId } : {}),
            },
            input.CurrentUser,
            md
        );

        const userDetail = await this.persistSideQuestionUserMessage(sideConv.ID, question, input.CurrentUser, md);
        const currentState = this.GetScopeState(input.ParentConversationId, input.ParentBranchId);
        const preferredAgent = this.resolvePreferredAgentEntity(
            input.PreferredAgent,
            sideConv.DefaultAgentID ?? currentState.PreferredAgentId,
            md
        );
        const resolved = await this.resolveTargetAgent(
            question,
            preferredAgent,
            input.ApplicationId,
            input.AllowedAgentIDs,
            input.CurrentUser,
            md
        );
        const updatedMessages = [...currentState.Messages, userDetail];
        const nextTurnCount = updatedMessages.filter((m) => m.Role === 'User').length;

        if (!resolved) {
            const noAgentMsg = 'No AI agent is available to answer this side question.';
            this.patchState(input.ParentConversationId, input.ParentBranchId, {
                SideConversation: sideConv,
                Messages: updatedMessages,
                TurnCount: nextTurnCount,
                PreferredAgentId: sideConv.DefaultAgentID ?? currentState.PreferredAgentId,
                ErrorMessage: noAgentMsg,
            });
            return {
                SideConversationId: sideConv.ID,
                UserDetailId: userDetail.ID,
                AgentDetailId: null,
                Success: false,
                ErrorMessage: noAgentMsg,
            };
        }

        this.patchState(input.ParentConversationId, input.ParentBranchId, {
            SideConversation: sideConv,
            Messages: updatedMessages,
            TurnCount: nextTurnCount,
            PreferredAgentId: sideConv.DefaultAgentID ?? currentState.PreferredAgentId,
            IsAsking: true,
            InFlightDetailId: null,
            StreamingText: '',
            ActiveStatusText: `Asking ${resolved.agent.Name}...`,
            ActiveAgentName: resolved.agent.Name,
            ErrorMessage: null,
        });

        return this.executeSideQuestionRun(input, sideConv, userDetail, resolved, md);
    }

    /**
     * Archives the current side-question conversation (`IsArchived = 1`) and resets UI state
     * for `(parentConversationId, parentBranchId)`. If archiving fails, preserves existing state
     * and sets `ErrorMessage` so the user sees the failure instead of losing unsaved UI state.
     */
    public async ClearScope(
        parentConversationId: string,
        parentBranchId: string | null,
        currentUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        const md = provider ?? this.Provider;
        const current = this.GetScopeState(parentConversationId, parentBranchId);
        if (!current.SideConversation) {
            this.loadedSummaryScopes.delete(SideQuestionController.ScopeKey(parentConversationId, parentBranchId));
            this.patchState(parentConversationId, parentBranchId, {
                Messages: [],
                TurnCount: 0,
                ErrorMessage: null,
                StreamingText: '',
            });
            return true;
        }
        const cleared = await this.conversationEngine(md).ClearSideConversation(
            current.SideConversation.ID,
            currentUser,
            md
        );
        if (!cleared) {
            this.patchState(parentConversationId, parentBranchId, {
                ErrorMessage: 'Failed to clear side questions. Please try again.',
            });
            return false;
        }
        this.loadedSummaryScopes.delete(SideQuestionController.ScopeKey(parentConversationId, parentBranchId));
        this.patchState(parentConversationId, parentBranchId, {
            SideConversation: null,
            Messages: [],
            TurnCount: 0,
            PreferredAgentId: null,
            IsLoading: false,
            IsAsking: false,
            InFlightDetailId: null,
            StreamingText: '',
            ActiveStatusText: '',
            ActiveAgentName: null,
            ErrorMessage: null,
        });
        return true;
    }

    private async persistSideQuestionUserMessage(
        sideConversationId: string,
        question: string,
        currentUser: UserInfo,
        md: IMetadataProvider
    ): Promise<MJConversationDetailEntity> {
        const userDetail = await md.GetEntityObject<MJConversationDetailEntity>(
            'MJ: Conversation Details',
            currentUser
        );
        userDetail.ConversationID = sideConversationId;
        userDetail.Role = 'User';
        userDetail.Message = question;
        userDetail.UserID = currentUser.ID;
        userDetail.Status = 'Complete';
        if (!(await userDetail.Save())) {
            const msg =
                userDetail.LatestResult?.CompleteMessage ||
                userDetail.LatestResult?.Message ||
                'Failed to save side question message.';
            throw new Error(msg);
        }
        return userDetail;
    }

    private async executeSideQuestionRun(
        input: AskSideQuestionInput,
        sideConv: MJConversationEntity,
        userDetail: MJConversationDetailEntity,
        resolved: ResolvedTargetAgent,
        md: IMetadataProvider
    ): Promise<AskSideQuestionResult> {
        let registeredDetailId: string | null = null;
        let streamingCallback: MessageProgressCallback | null = null;

        try {
            const runResult = await this.agentRunner.ProcessMessage({
                conversationId: sideConv.ID,
                message: userDetail,
                explicitAgentId: resolved.agent.ID,
                ...(resolved.configurationId ? { configurationId: resolved.configurationId } : {}),
                ...(resolved.requestedSkillIDs?.length ? { requestedSkillIDs: resolved.requestedSkillIDs } : {}),
                AllowedAgentIDs: input.AllowedAgentIDs,
                maxHistoryMessages: 25,
                createArtifacts: false,
                createNotification: false,
                suppressErrorToast: true,
                trackGlobalProcessing: false,
                onReplyAccepted: (reply) => {
                    registeredDetailId = reply.ConversationDetailId;
                    streamingCallback = this.createStreamingCallback(input.ParentConversationId, input.ParentBranchId);
                    this.patchState(input.ParentConversationId, input.ParentBranchId, {
                        InFlightDetailId: reply.ConversationDetailId,
                    });
                    this.streaming.RegisterMessageCallback(reply.ConversationDetailId, streamingCallback);
                },
                onProgress: (progress) => {
                    if (progress.message) {
                        this.patchState(input.ParentConversationId, input.ParentBranchId, {
                            ActiveStatusText: progress.message,
                        });
                    }
                },
            });

            const succeeded = Boolean(runResult?.success);
            const failureMessage = succeeded ? null : (runResult?.agentRun?.ErrorMessage || 'Side question failed');
            await this.finalizeSideQuestionMessages(input, sideConv.ID, md, failureMessage);

            return {
                SideConversationId: sideConv.ID,
                UserDetailId: userDetail.ID,
                AgentDetailId: registeredDetailId,
                Success: succeeded,
                ...(failureMessage ? { ErrorMessage: failureMessage } : {}),
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Side question execution failed';
            await this.finalizeSideQuestionMessages(input, sideConv.ID, md, msg);
            return {
                SideConversationId: sideConv.ID,
                UserDetailId: userDetail.ID,
                AgentDetailId: registeredDetailId,
                Success: false,
                ErrorMessage: msg,
            };
        } finally {
            if (registeredDetailId && streamingCallback) {
                this.streaming.UnregisterMessageCallback(registeredDetailId, streamingCallback);
            }
        }
    }

    private createStreamingCallback(parentConversationId: string, parentBranchId: string | null): MessageProgressCallback {
        return (update) => {
            const streamedContent = update.streaming?.content;
            this.patchState(parentConversationId, parentBranchId, {
                ...(streamedContent != null ? { StreamingText: streamedContent } : {}),
                ...(update.message && !update.streaming ? { ActiveStatusText: update.message } : {}),
                ...(update.metadata?.progress?.agentName
                    ? { ActiveAgentName: update.metadata.progress.agentName }
                    : {}),
            });
        };
    }

    private async finalizeSideQuestionMessages(
        input: AskSideQuestionInput,
        sideConversationId: string,
        md: IMetadataProvider,
        errorMessage: string | null
    ): Promise<void> {
        const refreshedMessages = await this.conversationEngine(md)
            .LoadSideConversationDetails(sideConversationId, input.CurrentUser, md)
            .catch(() => this.GetScopeState(input.ParentConversationId, input.ParentBranchId).Messages);
        this.loadedSummaryScopes.add(SideQuestionController.ScopeKey(input.ParentConversationId, input.ParentBranchId));
        this.patchState(input.ParentConversationId, input.ParentBranchId, {
            Messages: refreshedMessages,
            TurnCount: refreshedMessages.filter((m) => m.Role === 'User').length,
            IsAsking: false,
            InFlightDetailId: null,
            StreamingText: '',
            ActiveStatusText: '',
            ErrorMessage: errorMessage,
        });
    }

    private resolvePreferredAgentEntity(
        explicitPreferred: MJAIAgentEntityExtended | null | undefined,
        savedAgentId: string | null | undefined,
        provider: IMetadataProvider
    ): MJAIAgentEntityExtended | null {
        if (explicitPreferred) {
            return explicitPreferred;
        }
        if (!savedAgentId) {
            return null;
        }
        const engine = this.aiEngine(provider);
        const rawAgents = engine.ReadableAgents ?? engine.Agents ?? [];
        return rawAgents.find((a) => UUIDsEqual(a.ID, savedAgentId)) ?? null;
    }

    private async resolveTargetAgent(
        question: string,
        preferredAgent: MJAIAgentEntityExtended | null | undefined,
        applicationId: string | null | undefined,
        allowedAgentIDs: readonly string[] | null | undefined,
        currentUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<ResolvedTargetAgent | null> {
        const engine = this.aiEngine(provider);
        if (typeof engine.Config === 'function') {
            await engine.Config(false, currentUser, provider);
        }

        const rawAgents = engine.ReadableAgents ?? engine.Agents ?? [];
        const topLevelCandidates = rawAgents.filter(
            (a) => !a.ParentID && a.Status === 'Active' && a.InvocationMode !== 'Sub-Agent'
        );
        const allowedCandidates = NarrowToAllowedAgents(topLevelCandidates, allowedAgentIDs);
        const parsed = this.mentions.ParseMentions(question, allowedCandidates);
        const requestedSkillIDs =
            parsed.skillMentions.length > 0 ? parsed.skillMentions.map((s) => s.id) : undefined;

        // Priority 1: Explicit @agent mention overrides picker/default for this turn.
        const mentionMatch = await this.matchExplicitMentionAgent(parsed.agentMention, allowedCandidates, currentUser);
        if (mentionMatch) {
            return { ...mentionMatch, requestedSkillIDs };
        }

        // Priority 2: Explicit picker agent or persisted DefaultAgentID.
        if (
            preferredAgent &&
            preferredAgent.Status === 'Active' &&
            NarrowToAllowedAgents([preferredAgent], allowedAgentIDs).length > 0 &&
            (await this.canRunAgent(preferredAgent.ID, currentUser))
        ) {
            return { agent: preferredAgent, requestedSkillIDs };
        }

        // Priority 3: Default conversation manager (Sage) or first runnable allowed agent.
        const fallbackAgent = await this.resolveDefaultOrFallbackAgent(
            allowedCandidates,
            applicationId,
            allowedAgentIDs,
            currentUser,
            provider
        );
        return fallbackAgent ? { agent: fallbackAgent, requestedSkillIDs } : null;
    }

    private async matchExplicitMentionAgent(
        mention: { id: string; name: string; configurationId?: string } | null | undefined,
        allowedCandidates: MJAIAgentEntityExtended[],
        currentUser: UserInfo
    ): Promise<{ agent: MJAIAgentEntityExtended; configurationId?: string } | null> {
        if (!mention) {
            return null;
        }
        const matched = allowedCandidates.find(
            (a) =>
                UUIDsEqual(a.ID, mention.id) ||
                (a.Name ?? '').toLowerCase() === mention.name.toLowerCase()
        );
        if (matched && (await this.canRunAgent(matched.ID, currentUser))) {
            return { agent: matched, configurationId: mention.configurationId };
        }
        return null;
    }

    private async resolveDefaultOrFallbackAgent(
        allowedCandidates: MJAIAgentEntityExtended[],
        applicationId: string | null | undefined,
        allowedAgentIDs: readonly string[] | null | undefined,
        currentUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<MJAIAgentEntityExtended | null> {
        try {
            const resolveFn = this.defaultAgent.Resolve ?? this.defaultAgent.resolve;
            const defaultResolved = resolveFn
                ? await resolveFn.call(this.defaultAgent, {
                      applicationId: applicationId ?? null,
                      contextUser: currentUser,
                      provider,
                  })
                : null;
            if (
                defaultResolved &&
                NarrowToAllowedAgents([defaultResolved], allowedAgentIDs).length > 0 &&
                (await this.canRunAgent(defaultResolved.ID, currentUser))
            ) {
                return defaultResolved;
            }
        } catch {
            // Fall through to allowed-catalog fallback when default resolver fails or is outside AllowedAgentIDs.
        }

        const sageFallback = allowedCandidates.find((a) => a.Name === DefaultAgentResolver.FALLBACK_AGENT_NAME);
        if (sageFallback && (await this.canRunAgent(sageFallback.ID, currentUser))) {
            return sageFallback;
        }

        for (const candidate of allowedCandidates) {
            if (await this.canRunAgent(candidate.ID, currentUser)) {
                return candidate;
            }
        }
        return null;
    }

    private conversationEngine(provider?: IMetadataProvider): ConversationEngine {
        if (provider && typeof ConversationEngine.GetProviderInstance === 'function') {
            return ConversationEngine.GetProviderInstance<ConversationEngine>(provider, ConversationEngine) as ConversationEngine;
        }
        return ConversationEngine.Instance;
    }

    private aiEngine(provider?: IMetadataProvider): AIEngineBase {
        if (provider && typeof AIEngineBase.GetProviderInstance === 'function') {
            return AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
        }
        return AIEngineBase.Instance;
    }

    private async canRunAgent(agentId: string, user: UserInfo): Promise<boolean> {
        try {
            return await AIAgentPermissionHelper.HasPermission(agentId, user, 'run');
        } catch {
            // Fail closed — treat throwing permission lookups as denied.
            return false;
        }
    }

    private getOrCreateSubject(
        parentConversationId: string,
        parentBranchId: string | null
    ): BehaviorSubject<SideQuestionScopeState> {
        const key = SideQuestionController.ScopeKey(parentConversationId, parentBranchId);
        let subject = this.subjects.get(key);
        if (!subject) {
            subject = new BehaviorSubject<SideQuestionScopeState>({
                ParentConversationId: parentConversationId,
                ParentBranchId: parentBranchId,
                SideConversation: null,
                Messages: [],
                TurnCount: 0,
                PreferredAgentId: null,
                IsLoading: false,
                IsAsking: false,
                InFlightDetailId: null,
                StreamingText: '',
                ActiveStatusText: '',
                ActiveAgentName: null,
                ErrorMessage: null,
            });
            this.subjects.set(key, subject);
        }
        return subject;
    }

    private patchState(
        parentConversationId: string,
        parentBranchId: string | null,
        patch: Partial<SideQuestionScopeState>
    ): SideQuestionScopeState {
        const subject = this.getOrCreateSubject(parentConversationId, parentBranchId);
        const next: SideQuestionScopeState = {
            ...subject.value,
            ...patch,
        };
        subject.next(next);
        return next;
    }
}
