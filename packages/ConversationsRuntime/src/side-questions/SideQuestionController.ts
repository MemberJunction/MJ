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

/**
 * Coordinates loading, asking, streaming, clearing, and agent pinning for persistent
 * Side Questions across conversations and fork branches without interfering with the
 * main conversation's runner.
 */
export class SideQuestionController {
    private readonly subjects = new Map<string, BehaviorSubject<SideQuestionScopeState>>();
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
     * loading detail rows until the user actually opens the Side Question drawer.
     */
    public async LoadScopeSummary(
        parentConversationId: string,
        parentBranchId: string | null,
        currentUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<SideQuestionScopeState> {
        const md = provider ?? this.Provider;
        try {
            const summary = await ConversationEngine.Instance.GetSideConversationSummary(
                parentConversationId,
                parentBranchId,
                currentUser,
                md
            );
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
        const existing = this.GetScopeState(parentConversationId, parentBranchId);
        this.patchState(parentConversationId, parentBranchId, {
            IsLoading: true,
            ErrorMessage: null,
        });

        try {
            const threads = await ConversationEngine.Instance.LoadSideConversations(
                parentConversationId,
                parentBranchId,
                currentUser,
                md
            );
            const sideConv = threads[0] ?? null;
            const messages = sideConv
                ? await ConversationEngine.Instance.LoadSideConversationDetails(sideConv.ID, currentUser, md)
                : [];
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
        currentUser: UserInfo
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

        const sideConv = await ConversationEngine.Instance.GetOrCreateSideConversation(
            input.ParentConversationId,
            input.ParentBranchId,
            {
                environmentId: input.EnvironmentId,
                ...(initialAgentId ? { defaultAgentId: initialAgentId } : {}),
            },
            input.CurrentUser
        );

        const userDetail = await md.GetEntityObject<MJConversationDetailEntity>(
            'MJ: Conversation Details',
            input.CurrentUser
        );
        userDetail.ConversationID = sideConv.ID;
        userDetail.Role = 'User';
        userDetail.Message = question;
        userDetail.UserID = input.CurrentUser.ID;
        userDetail.Status = 'Complete';
        if (!(await userDetail.Save())) {
            throw new Error(userDetail.LatestResult?.Message || 'Failed to save side question message.');
        }

        const currentState = this.GetScopeState(input.ParentConversationId, input.ParentBranchId);
        const preferredAgent = this.resolvePreferredAgentEntity(
            input.PreferredAgent,
            sideConv.DefaultAgentID ?? currentState.PreferredAgentId
        );
        const resolved = await this.resolveTargetAgent(
            question,
            preferredAgent,
            input.ApplicationId,
            input.AllowedAgentIDs,
            input.CurrentUser,
            md
        );
        const updatedMessagesWithQuestion = [...currentState.Messages, userDetail];
        const nextTurnCount = updatedMessagesWithQuestion.filter((m) => m.Role === 'User').length;

        if (!resolved) {
            this.patchState(input.ParentConversationId, input.ParentBranchId, {
                SideConversation: sideConv,
                Messages: updatedMessagesWithQuestion,
                TurnCount: nextTurnCount,
                PreferredAgentId: sideConv.DefaultAgentID ?? currentState.PreferredAgentId,
                ErrorMessage: 'No AI agent is available to answer this side question.',
            });
            return {
                SideConversationId: sideConv.ID,
                UserDetailId: userDetail.ID,
                AgentDetailId: null,
                Success: false,
                ErrorMessage: 'No AI agent is available to answer this side question.',
            };
        }

        const agent = resolved.agent;
        this.patchState(input.ParentConversationId, input.ParentBranchId, {
            SideConversation: sideConv,
            Messages: updatedMessagesWithQuestion,
            TurnCount: nextTurnCount,
            PreferredAgentId: sideConv.DefaultAgentID ?? currentState.PreferredAgentId,
            IsAsking: true,
            InFlightDetailId: null,
            StreamingText: '',
            ActiveStatusText: `Asking ${agent.Name}...`,
            ActiveAgentName: agent.Name,
            ErrorMessage: null,
        });

        let registeredDetailId: string | null = null;
        let streamingCallback: MessageProgressCallback | null = null;

        try {
            const runResult = await this.agentRunner.ProcessMessage({
                conversationId: sideConv.ID,
                message: userDetail,
                explicitAgentId: agent.ID,
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
                    this.patchState(input.ParentConversationId, input.ParentBranchId, {
                        InFlightDetailId: reply.ConversationDetailId,
                    });
                    streamingCallback = (update) => {
                        const streamedContent = update.streaming?.content;
                        this.patchState(input.ParentConversationId, input.ParentBranchId, {
                            ...(streamedContent != null ? { StreamingText: streamedContent } : {}),
                            ...(update.message && !update.streaming ? { ActiveStatusText: update.message } : {}),
                            ...(update.metadata?.progress?.agentName
                                ? { ActiveAgentName: update.metadata.progress.agentName }
                                : {}),
                        });
                    };
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

            const refreshedMessages = await ConversationEngine.Instance.LoadSideConversationDetails(
                sideConv.ID,
                input.CurrentUser,
                md
            );
            const succeeded = Boolean(runResult?.success);
            const failureMessage = runResult?.agentRun?.ErrorMessage || 'Side question failed';
            this.patchState(input.ParentConversationId, input.ParentBranchId, {
                Messages: refreshedMessages,
                TurnCount: refreshedMessages.filter((m) => m.Role === 'User').length,
                IsAsking: false,
                InFlightDetailId: null,
                StreamingText: '',
                ActiveStatusText: '',
                ErrorMessage: succeeded ? null : failureMessage,
            });

            return {
                SideConversationId: sideConv.ID,
                UserDetailId: userDetail.ID,
                AgentDetailId: registeredDetailId,
                Success: succeeded,
                ...(succeeded ? {} : { ErrorMessage: failureMessage }),
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Side question execution failed';
            const refreshedMessages = await ConversationEngine.Instance.LoadSideConversationDetails(
                sideConv.ID,
                input.CurrentUser,
                md
            ).catch(() => this.GetScopeState(input.ParentConversationId, input.ParentBranchId).Messages);
            this.patchState(input.ParentConversationId, input.ParentBranchId, {
                Messages: refreshedMessages,
                TurnCount: refreshedMessages.filter((m) => m.Role === 'User').length,
                IsAsking: false,
                InFlightDetailId: null,
                StreamingText: '',
                ActiveStatusText: '',
                ErrorMessage: msg,
            });
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

    /**
     * Archives the current side-question conversation (`IsArchived = 1`) and resets UI state
     * for `(parentConversationId, parentBranchId)`. Next question starts a clean child thread.
     */
    public async ClearScope(
        parentConversationId: string,
        parentBranchId: string | null,
        currentUser: UserInfo
    ): Promise<boolean> {
        const current = this.GetScopeState(parentConversationId, parentBranchId);
        if (!current.SideConversation) {
            this.patchState(parentConversationId, parentBranchId, {
                Messages: [],
                TurnCount: 0,
                ErrorMessage: null,
                StreamingText: '',
            });
            return true;
        }
        const cleared = await ConversationEngine.Instance.ClearSideConversation(
            current.SideConversation.ID,
            currentUser
        );
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
        return cleared;
    }

    private resolvePreferredAgentEntity(
        explicitPreferred: MJAIAgentEntityExtended | null | undefined,
        savedAgentId: string | null | undefined
    ): MJAIAgentEntityExtended | null {
        if (explicitPreferred) {
            return explicitPreferred;
        }
        if (!savedAgentId) {
            return null;
        }
        const rawAgents = AIEngineBase.Instance.ReadableAgents ?? AIEngineBase.Instance.Agents ?? [];
        return rawAgents.find((a) => UUIDsEqual(a.ID, savedAgentId)) ?? null;
    }

    private async resolveTargetAgent(
        question: string,
        preferredAgent: MJAIAgentEntityExtended | null | undefined,
        applicationId: string | null | undefined,
        allowedAgentIDs: readonly string[] | null | undefined,
        currentUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<{ agent: MJAIAgentEntityExtended; configurationId?: string; requestedSkillIDs?: string[] } | null> {
        if (typeof AIEngineBase.Instance.Config === 'function') {
            await AIEngineBase.Instance.Config(false, currentUser, provider);
        }

        const rawAgents = AIEngineBase.Instance.ReadableAgents ?? AIEngineBase.Instance.Agents ?? [];
        const topLevelCandidates = rawAgents.filter(
            (a) => !a.ParentID && a.Status === 'Active' && a.InvocationMode !== 'Sub-Agent'
        );
        const allowedCandidates = NarrowToAllowedAgents(topLevelCandidates, allowedAgentIDs);

        const parsed = this.mentions.ParseMentions(question, allowedCandidates);
        const requestedSkillIDs =
            parsed.skillMentions.length > 0 ? parsed.skillMentions.map((s) => s.id) : undefined;

        // Priority 1: Explicit @agent mention in this question overrides picker/default for the turn.
        if (parsed.agentMention) {
            const matched = allowedCandidates.find(
                (a) =>
                    UUIDsEqual(a.ID, parsed.agentMention!.id) ||
                    (a.Name ?? '').toLowerCase() === parsed.agentMention!.name.toLowerCase()
            );
            if (matched && (await this.canRunAgent(matched.ID, currentUser))) {
                return {
                    agent: matched,
                    configurationId: parsed.agentMention.configurationId,
                    requestedSkillIDs,
                };
            }
        }

        // Priority 2: Explicit agent selected or saved as DefaultAgentID on the Side Question thread.
        if (
            preferredAgent &&
            preferredAgent.Status === 'Active' &&
            NarrowToAllowedAgents([preferredAgent], allowedAgentIDs).length > 0 &&
            (await this.canRunAgent(preferredAgent.ID, currentUser))
        ) {
            return { agent: preferredAgent, requestedSkillIDs };
        }

        // Priority 3: Default conversation manager (Sage) resolved via DefaultAgentResolver.
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
                return { agent: defaultResolved, requestedSkillIDs };
            }
        } catch {
            // Fall through to allowed-catalog fallback when default resolver fails or is outside AllowedAgentIDs.
        }

        const sageFallback = allowedCandidates.find((a) => a.Name === DefaultAgentResolver.FALLBACK_AGENT_NAME);
        if (sageFallback && (await this.canRunAgent(sageFallback.ID, currentUser))) {
            return { agent: sageFallback, requestedSkillIDs };
        }

        for (const candidate of allowedCandidates) {
            if (await this.canRunAgent(candidate.ID, currentUser)) {
                return { agent: candidate, requestedSkillIDs };
            }
        }

        return null;
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
