/**
 * @fileoverview Default `@RegisterClass(BaseAgentRealtimeHelper, 'Default')` implementation
 * owning realtime voice/video session execution, bridge transport startup, model/vendor/avatar
 * resolution, target-agent delegation, direct tool execution, and delegation to
 * {@link AgentRealtimePersistenceHelper}.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s4`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import {
    type AIAPIKeyResolver,
    BaseRealtimeModel,
    type ChatMessage,
    type IRealtimeSession,
    type JSONObject,
    MakeAIAPIKeyResolver,
    type RealtimeSessionParams,
    type RealtimeToolCall,
    type RealtimeTranscript,
    type RealtimeUsage,
} from '@memberjunction/ai';
import type {
    AgentAction,
    AgentChatMessage,
    AgentConfiguration,
    AgentExecutionProgressCallback,
    AppContextSnapshot,
    ArtifactJsonValue,
    ArtifactToolArgs,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIModelEntityExtended,
    MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { Metadata, type UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AgentMemoryContextBuilder } from '../../agent-memory-context-builder';
import { AgentRunner } from '../../AgentRunner';
import { ReadHostTools, ReadTrimmedString } from '../../realtime/bridge-host-params';
import {
    CollectDelegatedRunArtifactsSafely,
    ExtractDirectActionArtifacts,
} from '../../realtime/realtime-artifact-helpers';
import { RealtimeSessionCanShowAvatar } from '../../realtime/realtime-avatar-resolution';
import {
    type PrepareClientSessionInput,
    RealtimeClientSessionService,
    WarnOnUnmatchedProviderVoice,
} from '../../realtime/realtime-client-session-service';
import {
    BuildRealtimeOverridesJson,
    BuildVoiceMannerSection,
    DeepMergeConfigs,
    GetModelCatalogSessionSettings,
    GetNarrationPaceMs,
    GetProviderVoiceSettings,
    GetSessionTuningSettings,
    type RealtimeCoAgentConfig,
    ResolveEffectiveRealtimeConfig,
} from '../../realtime/realtime-coagent-config';
import { ResolveNarrationInstructionsTemplate } from '../../realtime/realtime-narration';
import {
    type RealtimePlatformCredentials,
    ResolveRealtimePlatformCredentials,
} from '../../realtime/realtime-platform-credentials';
import {
    type DelegatedResult,
    type DelegateToTargetRequest,
    type RealtimeSessionResult,
    RealtimeSessionRunner,
    type RealtimeSessionRunnerDeps,
    type ToolExecutionResult,
} from '../../realtime/realtime-session-runner';
import { BuildRealtimeAgentFraming } from '../../realtime/realtime-tool-broker';
import {
    ListRealtimeVendorsForModel,
    RealtimeKeyFixHint,
    type RealtimeVendorSelection,
    SelectRealtimeVendorForModel,
} from '../../realtime/realtime-vendor-resolution';
import {
    ChooseRealtimeVendorForAvatar,
    RealtimeModelShowsAvatar,
} from '../../realtime/realtime-video-output-gate';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentRealtimePersistenceHelper } from './AgentRealtimePersistenceHelper';
import {
    BaseAgentRealtimeHelper,
    type AgentRealtimeModelResolution,
} from './BaseAgentRealtimeHelper';

/**
 * Default pluggable implementation of {@link BaseAgentRealtimeHelper}.
 */
@RegisterClass(BaseAgentRealtimeHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentRealtimeHelper extends BaseAgentRealtimeHelper {
    private readonly _persistence = new AgentRealtimePersistenceHelper();

    public override async ExecuteRealtimeSession<R = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ExecuteAgentResult<R>> {
        const modelResolution = await ctx.Hooks.ResolveRealtimeModel(params);
        if (!modelResolution) {
            const message =
                `Agent '${params.agent.Name}' is session-driven (Realtime) but no usable Realtime model could be ` +
                `resolved: no active vendor of an active model of AIModelType 'Realtime' has a usable key and ` +
                `driver. ${RealtimeKeyFixHint(params.CredentialScope)}`;
            ctx.Hooks.LogError(message, { agent: params.agent, category: 'RealtimeSession' });
            return (await ctx.Hooks.CreateFailureResult(message, params.contextUser)) as ExecuteAgentResult<R>;
        }

        const promptRun = await this._persistence.CreateRealtimePromptRun(ctx, params, config, modelResolution);

        ctx.RealtimeInFlightTurns = new Map();
        ctx.RealtimePersistQueues = new Map();
        const recording = await this._persistence.ResolveRealtimeRecording(ctx, params);
        ctx.RealtimeRecording = recording?.controller ?? null;
        ctx.RealtimeRecordingAccountId = recording?.storageAccountId ?? null;
        try {
            const deps = await ctx.Hooks.BuildRealtimeSessionDeps(params, config, modelResolution, promptRun);
            const runner = new RealtimeSessionRunner(deps);
            const sessionResult = await runner.Run();
            return await this.FinalizeRealtimeRun<R>(ctx, params, sessionResult);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            ctx.Hooks.LogError(`Realtime session failed for agent '${params.agent.Name}': ${msg}`, {
                agent: params.agent,
                category: 'RealtimeSession',
            });
            return (await ctx.Hooks.CreateFailureResult(msg, params.contextUser)) as ExecuteAgentResult<R>;
        }
    }

    public override async StartBridgeRealtimeSession(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<IRealtimeSession> {
        const audienceRefusal = ctx.Hooks.SessionAudienceRefusal(params);
        if (audienceRefusal) {
            throw new Error(audienceRefusal);
        }
        ctx.ActiveProvider = params.provider ?? Metadata.Provider;
        const provider = params.provider ?? Metadata.Provider;

        const service = new RealtimeClientSessionService();
        const input = ctx.Hooks.BuildBridgePrepInput(params);
        const contextUser = params.contextUser as UserInfo;
        const prep = await service.PrepareRealtimeSessionParams(input, contextUser, provider);
        if (!prep.Success || !prep.Resolution || !prep.SessionParams) {
            throw new Error(
                prep.ErrorMessage ??
                    `Failed to prepare a realtime session for agent '${params.agent.Name}'. ` +
                        `Configure an Active AIModelType 'Realtime' model with an active vendor whose DriverClass has a ` +
                        `resolvable API key.`
            );
        }
        const session = await prep.Resolution.Model.StartSession(prep.SessionParams);
        await service.WireBridgeRealtimeSession(session, input, prep, contextUser, provider);
        return session;
    }

    public override BuildBridgePrepInput(ctx: AgentRunContext, params: ExecuteAgentParams): PrepareClientSessionInput {
        const modelID = (params.data?.realtimeModelID as string | undefined)?.trim() || undefined;
        const voice = (params.data?.realtimeVoice as string | undefined)?.trim() || undefined;
        const targetID = (params.data?.targetAgentID as string | undefined)?.trim() || '';
        const meetingMode = params.data?.realtimeMeetingMode === true;
        const selfNames = Array.isArray(params.data?.realtimeSelfNames)
            ? (params.data?.realtimeSelfNames as unknown[]).filter((n): n is string => typeof n === 'string')
            : undefined;
        const hostTools = ReadHostTools(params.data?.realtimeHostTools);
        const resolveHostTools =
            typeof params.data?.resolveHostTools === 'function'
                ? (params.data.resolveHostTools as PrepareClientSessionInput['ResolveHostTools'])
                : undefined;
        return {
            CoAgent: params.agent,
            TargetAgentID: targetID,
            HostTools: hostTools,
            ResolveHostTools: resolveHostTools,
            HostFraming: ReadTrimmedString(params.data?.realtimeHostFraming, 'realtimeHostFraming'),
            PriorTranscript: ReadTrimmedString(params.data?.realtimePriorTranscript, 'realtimePriorTranscript'),
            ConversationID: ReadTrimmedString(params.data?.conversationId, 'conversationId'),
            APIKeys: params.apiKeys,
            CredentialScope: params.CredentialScope,
            RunScope: ctx.Hooks.RunScopeFor(params),
            ActiveSkillIDs: ctx.Hooks.ActiveSkillIDsForRun(params),
            AgentSessionID: (params.data?.agentSessionId as string | undefined) ?? '',
            PreferredModelID: modelID,
            ConfigOverridesJson: BuildRealtimeOverridesJson(modelID, voice) ?? undefined,
            ConversationMessages: params.conversationMessages,
            UserID: params.contextUser?.ID,
            DisableAutoResponse: meetingMode || undefined,
            SelfNames: selfNames,
            AvatarDelivery: params.data?.realtimeAvatarDelivery === 'room' ? 'room' : undefined,
            ServerSide: true,
            PhoneCall: params.data?.realtimePhoneCall === true || undefined,
            ApplicationID: (params.data?.applicationId as string | undefined)?.trim() || undefined,
            AppContext: params.data?.appContext as AppContextSnapshot | undefined,
        };
    }

    public override async ResolveRealtimeModel(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        overrideModelID?: string
    ): Promise<AgentRealtimeModelResolution | null> {
        const runThenEnvironment = MakeAIAPIKeyResolver(params.apiKeys, undefined, params.CredentialScope);
        const showsAvatar = this.realtimeRunShowsAvatar(ctx, params);
        const candidates = this.selectRealtimeModelCandidates(ctx, params.agent, overrideModelID);
        const platform = await ctx.Hooks.ResolveRealtimePlatformCredentials(
            candidates.map(m => m.ID),
            params
        );
        for (const model of candidates) {
            const resolveAPIKey = platform.ResolverFor(model.ID, runThenEnvironment);
            const vendor = SelectRealtimeVendorForModel(model.ID, resolveAPIKey, params.CredentialScope);
            const first = vendor ? this.instantiateRealtimeRunVendor(model.ID, vendor, resolveAPIKey) : null;
            if (!vendor || !first) {
                continue;
            }
            return ChooseRealtimeVendorForAvatar(vendor, first, ListRealtimeVendorsForModel(model.ID), showsAvatar, {
                Instantiate: other => this.instantiateRealtimeRunVendor(model.ID, other, resolveAPIKey),
                RendersAvatar: resolution =>
                    RealtimeModelShowsAvatar(
                        { ModelID: resolution.modelID, APIName: resolution.apiName, Model: resolution.model },
                        AIEngine.Instance
                    ),
            });
        }
        return null;
    }

    private realtimeRunShowsAvatar(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        if (ctx.Hooks.ResolveRealtimeEffectiveConfig(params.agent).realtime?.video?.enabled !== true) {
            return false;
        }
        return RealtimeSessionCanShowAvatar({
            ServerSide: true,
            AvatarDelivery: params.data?.realtimeAvatarDelivery === 'room' ? 'room' : undefined,
            PhoneCall: params.data?.realtimePhoneCall === true,
        });
    }

    public override ResolveRealtimePlatformCredentials(
        _ctx: AgentRunContext,
        modelIDs: string[],
        params: ExecuteAgentParams
    ): Promise<RealtimePlatformCredentials> {
        return ResolveRealtimePlatformCredentials(modelIDs, params.contextUser, params.CredentialScope);
    }

    private instantiateRealtimeRunVendor(
        modelID: string,
        vendor: RealtimeVendorSelection,
        resolveAPIKey: AIAPIKeyResolver
    ): {
        model: BaseRealtimeModel;
        modelID: string;
        vendorID: string;
        modelVendorID: string;
        apiName: string;
        driverClass: string;
    } | null {
        const apiKey = resolveAPIKey(vendor.DriverClass);
        if (!apiKey) {
            return null;
        }
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(
            BaseRealtimeModel,
            vendor.DriverClass,
            apiKey
        );
        if (!instance) {
            return null;
        }
        return {
            model: instance,
            modelID,
            vendorID: vendor.VendorID,
            modelVendorID: vendor.ModelVendorID,
            apiName: vendor.APIName,
            driverClass: vendor.DriverClass,
        };
    }

    private selectRealtimeModelCandidates(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        overrideModelID?: string
    ): MJAIModelEntityExtended[] {
        const isRealtime = (m: MJAIModelEntityExtended): boolean =>
            typeof m.AIModelType === 'string' && m.AIModelType.trim().toLowerCase() === 'realtime';

        const realtimeModels = AIEngine.Instance.Models.filter(m => m.IsActive && isRealtime(m));
        if (realtimeModels.length === 0) {
            return [];
        }

        const byPower = [...realtimeModels].sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));

        const preference =
            overrideModelID && overrideModelID.trim().length > 0
                ? overrideModelID.trim()
                : ctx.Hooks.ResolveRealtimeEffectiveConfig(agent).realtime?.modelPreference;
        if (preference) {
            const wanted = preference.trim().toLowerCase();
            const preferred =
                realtimeModels.find(m => UUIDsEqual(m.ID, preference)) ??
                realtimeModels.find(m => m.Name?.trim().toLowerCase() === wanted);
            if (preferred) {
                return [preferred, ...byPower.filter(m => !UUIDsEqual(m.ID, preferred.ID))];
            }
            ctx.Hooks.LogError(
                `Realtime model preference '${preference}' for agent '${agent.Name}' matches no Active Realtime ` +
                    'model — falling through to default (highest-PowerRank) selection.',
                { agent, category: 'RealtimeSession' }
            );
        }

        return byPower;
    }

    public override ResolveRealtimeEffectiveConfig(
        _ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended
    ): RealtimeCoAgentConfig {
        let typeDefault: string | null = null;
        try {
            if (agent.TypeID) {
                const type = (AIEngine.Instance.AgentTypes ?? []).find(t => UUIDsEqual(t.ID, agent.TypeID!));
                typeDefault = type?.DefaultConfiguration ?? null;
            }
        } catch {
            typeDefault = null;
        }
        return ResolveEffectiveRealtimeConfig(typeDefault, agent.TypeConfiguration ?? null, null);
    }

    public override async BuildRealtimeSessionDeps(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelResolution: {
            model: BaseRealtimeModel;
            apiName: string;
            driverClass?: string;
            modelID?: string;
            modelVendorID?: string;
        },
        promptRun: MJAIPromptRunEntityExtended | null
    ): Promise<RealtimeSessionRunnerDeps> {
        const effectiveConfig = ctx.Hooks.ResolveRealtimeEffectiveConfig(params.agent);
        const sessionParams = await this.buildRealtimeSessionParams(
            ctx,
            params,
            config,
            modelResolution.apiName,
            effectiveConfig,
            modelResolution.driverClass,
            modelResolution.modelID,
            modelResolution.modelVendorID
        );

        return {
            Model: modelResolution.model,
            SessionParams: sessionParams,
            DelegateToTarget: request => ctx.Hooks.DelegateRealtimeToTarget(params, config, request),
            ExecuteTool: call => this.ExecuteRealtimeTool(ctx, params, call),
            PersistTranscript: transcript => ctx.Hooks.PersistRealtimeTranscript(params, transcript),
            FlushTranscripts: () => this.FlushRealtimeTranscriptQueues(ctx),
            Recording: ctx.RealtimeRecording ?? undefined,
            FinalizeRecording: () => ctx.Hooks.FinalizeRealtimeRecording(params),
            CheckpointUsage: usage => this.CheckpointRealtimeUsage(ctx, promptRun, usage),
            AbortSignal: params.cancellationToken,
            NarrationInstructionsTemplate: ResolveNarrationInstructionsTemplate(),
            NarrationPaceMs: GetNarrationPaceMs(effectiveConfig),
            LogStatus: (message, verboseOnly) => ctx.Hooks.LogStatus(message, verboseOnly ?? false, params),
            LogError: error => ctx.Hooks.LogError(error, { agent: params.agent, category: 'RealtimeSession' }),
        };
    }

    private async buildRealtimeSessionParams(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelApiName: string,
        effectiveConfig?: RealtimeCoAgentConfig,
        driverClass?: string,
        modelID?: string,
        modelVendorID?: string
    ): Promise<RealtimeSessionParams> {
        const targetAgent = ctx.Hooks.ResolveRealtimeTargetAgent(params);
        const framing = BuildRealtimeAgentFraming(targetAgent?.Name ?? 'the configured target agent');

        const basePrompt = config.systemPrompt?.TemplateText ? config.systemPrompt.TemplateText : '';
        const voiceManner = BuildVoiceMannerSection(effectiveConfig);
        const memoryContext = await this.assembleRealtimeContext(ctx, params);

        const systemPrompt = [framing, basePrompt, voiceManner, memoryContext]
            .filter(part => part && part.trim().length > 0)
            .join('\n\n');

        const catalogSettings = modelID
            ? GetModelCatalogSessionSettings(AIEngine.Instance.GetEffectiveModelConfiguration(modelID, modelVendorID))
            : null;
        const providerVoice = GetProviderVoiceSettings(effectiveConfig, driverClass ?? null);
        WarnOnUnmatchedProviderVoice(effectiveConfig, driverClass, 'BaseAgent.buildRealtimeSessionParams');
        const sessionTuning = GetSessionTuningSettings(effectiveConfig);
        const configBag =
            catalogSettings || sessionTuning || providerVoice
                ? (DeepMergeConfigs(catalogSettings, sessionTuning, providerVoice) as JSONObject)
                : undefined;

        return {
            Model: modelApiName,
            SystemPrompt: systemPrompt,
            InitialContext: memoryContext || undefined,
            Config: configBag,
        };
    }

    private async assembleRealtimeContext(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<string> {
        const lastUserMessage = params.conversationMessages.filter(m => m.role === 'user').pop() as
            | AgentChatMessage
            | undefined;
        const inputText =
            lastUserMessage?.metadata?.rawContent ??
            (typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '');
        const scratch: ChatMessage[] = [];

        const builder = new AgentMemoryContextBuilder();
        await builder.InjectContextMemory(
            inputText,
            params.agent,
            params.userId || params.contextUser?.ID,
            params.companyId,
            params.contextUser,
            scratch,
            undefined,
            undefined,
            undefined,
            null,
            undefined,
            (message, verboseOnly) => ctx.Hooks.LogStatus(message, verboseOnly ?? false, params),
            ctx.Hooks.RunAudienceAddsReader(params)
        );

        return scratch
            .map(m => (typeof m.content === 'string' ? m.content : ''))
            .filter(c => c.length > 0)
            .join('\n\n');
    }

    public override async DelegateRealtimeToTarget(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        request: DelegateToTargetRequest
    ): Promise<DelegatedResult> {
        const targetAgent = ctx.Hooks.ResolveRealtimeTargetAgent(params);
        if (!targetAgent) {
            return {
                CallID: request.CallID,
                Success: false,
                Output: 'No target agent is configured for this voice session, so the request could not be performed.',
            };
        }

        try {
            const requestText = ctx.Hooks.ParseDelegateRequestText(request.Arguments);
            const effectiveProvider = params.provider || ctx.ActiveProvider;
            const runner = new AgentRunner(effectiveProvider);
            const result = await runner.RunAgent({
                agent: targetAgent,
                conversationMessages: [{ role: 'user', content: requestText }],
                contextUser: params.contextUser,
                cancellationToken: request.AbortSignal,
                parentRun: ctx.AgentRun ?? undefined,
                agentSessionID: params.agentSessionID,
                parentAgentHierarchy: ctx.AgentHierarchy,
                parentDepth: ctx.Depth,
                configurationId: params.configurationId,
                apiKeys: params.apiKeys,
                CredentialScope: params.CredentialScope,
                Audience: params.Audience,
                SearchScopeIDs: params.SearchScopeIDs,
                data: params.data,
                TrustReservedRunData: params.TrustReservedRunData,
                verbose: params.verbose,
                boundActionParams: params.boundActionParams,
                treeBudget: ctx.Hooks.EnsureTreeBudget(params),
                onProgress: this.combineProgressCallbacks(request.OnProgress, params.onProgress),
            });

            const artifacts = await CollectDelegatedRunArtifactsSafely({
                Result: result,
                ContextUser: params.contextUser,
                Provider: effectiveProvider,
                ProcessPayloadArtifacts: r =>
                    runner.ProcessAgentArtifacts(r, undefined, undefined, params.contextUser, effectiveProvider),
                logLabel: 'BaseAgent.delegateRealtimeToTarget',
            });

            return {
                CallID: request.CallID,
                Success: result.success,
                Output: result.success
                    ? result.agentRun?.Message || 'The target agent completed the request.'
                    : result.agentRun?.ErrorMessage || 'The target agent failed to complete the request.',
                ...(result.agentRun?.ID ? { RunID: result.agentRun.ID } : {}),
                ...(artifacts ? { Artifacts: artifacts } : {}),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { CallID: request.CallID, Success: false, Output: `Delegation failed: ${msg}` };
        }
    }

    private combineProgressCallbacks(
        first?: AgentExecutionProgressCallback,
        second?: AgentExecutionProgressCallback
    ): AgentExecutionProgressCallback | undefined {
        if (!first) {
            return second;
        }
        if (!second) {
            return first;
        }
        return progress => {
            try {
                first(progress);
            } catch {
                /* one consumer failing must not starve the other */
            }
            second(progress);
        };
    }

    public override ResolveRealtimeTargetAgent(
        _ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): MJAIAgentEntityExtended | null {
        const targetID = params.data?.targetAgentID as string | undefined;
        if (!targetID) {
            return null;
        }
        return AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, targetID)) ?? null;
    }

    public override ParseDelegateRequestText(_ctx: AgentRunContext, argumentsJson: string): string {
        try {
            const parsed = JSON.parse(argumentsJson) as ArtifactToolArgs;
            if (parsed && typeof parsed === 'object' && typeof parsed.request === 'string') {
                return parsed.request;
            }
        } catch {
            /* not JSON — fall through to raw */
        }
        return argumentsJson;
    }

    public override async ExecuteRealtimeTool(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        call: RealtimeToolCall
    ): Promise<ToolExecutionResult> {
        const action = ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID).find(a => a.Name === call.ToolName);
        if (!action) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Tool '${call.ToolName}' is not available to this agent.`,
            };
        }

        try {
            const agentAction: AgentAction = {
                name: action.Name,
                params: this.parseRealtimeToolParams(call.Arguments),
            };
            const result = await ctx.Hooks.ExecuteSingleAction(params, agentAction, action, params.contextUser);
            const actionArtifacts = ExtractDirectActionArtifacts(action.Name, result.Success, result.Params);
            return {
                CallID: call.CallID,
                Success: result.Success,
                Output: result.Message || (result.Success ? 'Tool completed.' : 'Tool failed.'),
                ...(actionArtifacts ? { Artifacts: actionArtifacts } : {}),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { CallID: call.CallID, Success: false, Output: `Tool execution failed: ${msg}` };
        }
    }

    private parseRealtimeToolParams(argumentsJson: string): ArtifactToolArgs {
        try {
            const parsed = JSON.parse(argumentsJson) as ArtifactJsonValue;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            /* ignore — return empty params */
        }
        return {};
    }

    // --- Persistence delegates (no `async` wrapper on 1-line Promise pass-throughs) ---

    public override PersistRealtimeTranscript(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        transcript: RealtimeTranscript
    ): Promise<string | null> {
        return this._persistence.PersistRealtimeTranscript(ctx, params, transcript);
    }

    public override FlushRealtimeTranscriptQueues(ctx: AgentRunContext): Promise<void> {
        return this._persistence.FlushRealtimeTranscriptQueues(ctx);
    }

    public override FinalizeRealtimeRecording(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        return this._persistence.FinalizeRealtimeRecording(ctx, params);
    }

    public override CheckpointRealtimeUsage(
        ctx: AgentRunContext,
        promptRun: MJAIPromptRunEntityExtended | null,
        usage: RealtimeUsage
    ): Promise<void> {
        return this._persistence.CheckpointRealtimeUsage(ctx, promptRun, usage);
    }

    public override async FinalizeRealtimeRun<R = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        sessionResult: RealtimeSessionResult
    ): Promise<ExecuteAgentResult<R>> {
        if (sessionResult.Success) {
            ctx.Hooks.LogStatus(
                `🎙️ Realtime session for '${params.agent.Name}' completed: ${sessionResult.TranscriptTurnCount} turn(s), ` +
                    `${sessionResult.FinalUsage.InputTokens + sessionResult.FinalUsage.OutputTokens} token(s).`,
                true,
                params
            );
            const successStep: BaseAgentNextStep<R> = {
                step: 'Success',
                terminate: true,
                message: 'Realtime session completed.',
            } as BaseAgentNextStep<R>;
            return await ctx.Hooks.FinalizeAgentRun<R>(successStep, undefined, params.contextUser);
        }

        const message = sessionResult.ErrorMessage || 'Realtime session ended with an error.';
        return (await ctx.Hooks.CreateFailureResult(message, params.contextUser)) as ExecuteAgentResult<R>;
    }
}
