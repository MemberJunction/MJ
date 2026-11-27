/**
 * @fileoverview Collaborator owned by {@link AgentPromptHelper} encapsulating native tool
 * declaration, framework tool hosts, tool-choice resolution, volatile trailing runtime-state
 * message construction, relocated specialization, prefix prompt caching, and template loading.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentChatMessage,
    AgentConfiguration,
    AgentDecisionRequest,
    AgentScratchpad,
    AIPromptParams,
    AIPromptRunResult,
    ArtifactToolArgs,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunStepEntityExtended,
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage, ChatToolChoice } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { GetSentPrefixFingerprint, GetToolCallingDecision } from '@memberjunction/ai-prompts';
import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentTypeEntity,
    MJAIVendorEntity,
    MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';
import type { LoopAgentTypePromptParams } from '../../agent-types/loop-agent-prompt-params';
import type { ArtifactToolCall } from '../../ArtifactToolManager';
import { BindingsForAction, UnboundParams } from '../../bound-action-params';
import { WrapUntrustedExternalData } from '../../client-tool-results';
import { RUNTIME_STATE_TAG, VOLATILE_TEMPLATE_MARKERS } from '../../constants';
import {
    ConversationToolNames,
    GetMaxConversationToolCallsPerTurn,
    type ConversationToolCall,
} from '../../ConversationToolManager';
import type { MemoryWriteRequest } from '../../MemoryWriteManager';
import { BuildActionToolSet, FilterDeclarableActions } from '../../native-tools/action-tool-builder';
import type { AgentToolDefinition, AgentToolResult } from '../../native-tools/agent-tools';
import { BuildNativeToolSet, COMPLETE_TASK_TOOL } from '../../native-tools/control-tools';
import { LooksLikeLoopEnvelope } from '../../native-tools/dual-channel';
import {
    BuildFrameworkTools,
    type FrameworkToolAvailability,
    type FrameworkToolHost,
} from '../../native-tools/framework-tools';
import {
    NATIVE_CONTROL_TEMPLATE_DATA,
    NATIVE_ONLY_TEMPLATE_FLAG,
    ResolveNativeControlConfig,
    type NativeControlConfig,
} from '../../native-tools/native-control-config';
import { BuildAssistantToolCallTurn } from '../../native-tools/tool-result-turns';
import { TurnToolCallingMode } from '../../native-tools/turn-mode';
import type { RuntimeStateDateTime, RuntimeStateScratchpad } from '../../runtime-state-fragment';
import { RenderToolResultData } from '../../tool-result-format';
import { ResolveSpecializationPlacement } from '../../volatile-child-prompt';
import type { AgentRunContext } from '../AgentRunContext';
import type { BaseAgentPromptHelper } from './BaseAgentPromptHelper';

/**
 * Collaborator handling native tool declarations, framework tool bridges, volatile trailing
 * runtime-state fragments, prefix-cache layout, and prompt template text loading.
 */
export class AgentNativeToolsAndPrefixCacheHelper {
    private static readonly _messageFingerprintCache = new WeakMap<
        ChatMessage,
        {
            role: ChatMessage['role'];
            content: ChatMessage['content'];
            toolCalls: AgentChatMessage['toolCalls'];
            fingerprint: string;
        }
    >();

    /** Memoized fingerprint for outgoing message change detection (reasoning replay stability). */
    public static MessageFingerprint(m: ChatMessage): string {
        const toolCalls = (m as AgentChatMessage).toolCalls;
        const cached = AgentNativeToolsAndPrefixCacheHelper._messageFingerprintCache.get(m);
        if (cached && cached.role === m.role && cached.content === m.content && cached.toolCalls === toolCalls) {
            return cached.fingerprint;
        }
        const fingerprint = JSON.stringify([m.role, m.content, toolCalls?.map((c) => [c.id, c.name, c.arguments])]);
        AgentNativeToolsAndPrefixCacheHelper._messageFingerprintCache.set(m, {
            role: m.role,
            content: m.content,
            toolCalls,
            fingerprint,
        });
        return fingerprint;
    }

    // -------------------------------------------------------------------------
    // Native Tools & Framework Tools
    // -------------------------------------------------------------------------

    public RecordToolCallingInstrumentation(
        ctx: AgentRunContext,
        stepEntity: MJAIAgentRunStepEntityExtended,
        promptResult: AIPromptRunResult
    ): void {
        try {
            const mode = TurnToolCallingMode(promptResult);
            if (mode) {
                stepEntity.ToolCallingMode = mode;
            }
            if (mode === 'Native' || mode === 'NativeFallback' || mode === 'NativeImplicit' || mode === 'NativeRecovered') {
                const message = promptResult?.chatResult?.data?.choices?.[0]?.message;
                const callCount = message?.toolCalls?.length ?? 0;
                stepEntity.NativeToolCallCount = callCount;
                stepEntity.NativeDualChannel = callCount > 0 ? LooksLikeLoopEnvelope(message?.content) : null;
                stepEntity.NativeToolResultsSent = GetToolCallingDecision(promptResult?.chatResult)?.toolResults === true;
                if (stepEntity.NativeDualChannel) {
                    LogStatus(
                        `Agent step answered on both channels: ${callCount} tool call(s) plus a JSON envelope; the envelope was discarded (tool call wins).`
                    );
                }
            }
            if (mode) {
                ctx.Hooks.QueueStepSave(stepEntity, (st) => {
                    st.ToolCallingMode = stepEntity.ToolCallingMode;
                    st.NativeToolCallCount = stepEntity.NativeToolCallCount;
                    st.NativeDualChannel = stepEntity.NativeDualChannel;
                    st.NativeToolResultsSent = stepEntity.NativeToolResultsSent;
                });
            }
        } catch (error) {
            LogError(
                `Could not record tool-calling instrumentation on agent run step: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    public AppendNativeAssistantTurn(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep
    ): void {
        const turn = step.nativeTurn;
        if (!turn?.sendResultsNatively || ctx.LastNativeTurnAppended === turn) {
            return;
        }
        params.conversationMessages.push(BuildAssistantToolCallTurn(turn) as AgentChatMessage);
        ctx.LastNativeTurnAppended = turn;
    }

    public ApplyNativeTools(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        promptParams: AIPromptParams,
        params: ExecuteAgentParams
    ): void {
        ctx.NativeToolBindings = undefined;
        if (!ctx.AgentTypeInstance?.SupportsNativeToolCalls) {
            return;
        }
        if (params.agent?.DeclareActionsAsNativeTools === false) {
            return;
        }
        const actions = FilterDeclarableActions(
            ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID),
            ctx.Hooks.GetEffectiveAgentActions(params.agent.ID)
        );
        const subAgents = ctx.Hooks.GetEffectiveSubAgentsForValidation(params.agent.ID);
        const agentTools = ctx.Hooks.GetAgentTools(params);
        const control = ctx.Hooks.GetNativeControlConfig(params);
        if (actions.length === 0 && subAgents.length === 0 && agentTools.length === 0 && !control.NativeOnly) {
            return;
        }
        try {
            const paramsByAction = new Map(
                actions.map((a) => [a.ID, UnboundParams(a.Params.Items, BindingsForAction(params.boundActionParams, a.ID))])
            );
            const actionSet = BuildActionToolSet(actions, paramsByAction);
            const frameworkTools = control.NativeOnly
                ? BuildFrameworkTools(
                      this.FrameworkToolHost(ctx, promptHelper, params),
                      this.FrameworkToolAvailability(ctx, promptHelper, promptParams, params)
                  )
                : [];
            const toolSet = BuildNativeToolSet(
                actionSet,
                subAgents,
                control,
                agentTools,
                frameworkTools,
                (sa) => {
                    const presetNames = (AIEngine.Instance.GetAgentConfigurationPresets?.(sa.ID, true) ?? []).map((p) => p.Name);
                    return {
                        consultEnabled: ctx.Hooks.IsSubAgentConsultEnabledForSubAgent(params.agent, sa),
                        ...(presetNames.length > 0 ? { presetNames } : {}),
                    };
                },
                {
                    IncludeArtifactDirective: control.NativeOnly && ctx.Hooks.IsArtifactSupportEnabled(params.agent),
                }
            );
            if (control.NativeOnly && promptParams.data) {
                promptParams.data[NATIVE_ONLY_TEMPLATE_FLAG] = true;
                promptParams.data[NATIVE_CONTROL_TEMPLATE_DATA] = {
                    Terminal: control.Terminal,
                    PayloadChangeTool: control.PayloadChangeTool,
                    AskUser: control.AskUser,
                };
            }
            promptParams.tools = toolSet.tools;
            promptParams.controlFlowToolNames = toolSet.controlToolNames;
            promptParams.toolChoice = ctx.Hooks.ResolveToolChoiceForTurn(params);
            ctx.NativeToolBindings = toolSet.byToolName;
        } catch (error) {
            LogError(
                `Agent '${params.agent.Name}': could not declare native tools — ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    public GetAgentTools(_params: ExecuteAgentParams): AgentToolDefinition[] {
        return [];
    }

    public FrameworkToolAvailability(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        promptParams: AIPromptParams,
        params: ExecuteAgentParams
    ): FrameworkToolAvailability {
        const p = promptParams.data?.__agentTypePromptParams as Record<string, unknown> | undefined;
        return {
            Scratchpad: p?.includeScratchpadDocs !== false,
            MemoryWrites: p?.includeMemoryWritesDocs !== false && promptHelper.MemoryWriteSkip(ctx, params) === null,
            ArtifactTools: p?.includeArtifactToolsDocs !== false && ctx.ArtifactToolManager.IsWorkspaceEnabled(),
            ConversationTools: p?.includeConversationToolsDocs !== false && ctx.ConversationToolManager.IsAvailable,
            Decisions: ctx.Hooks.DecisionsEnabled(p) && p?.includeDecisionsDocs !== false,
        };
    }

    public FrameworkToolHost(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        params: ExecuteAgentParams
    ): FrameworkToolHost {
        return {
            ApplyScratchpad: (changes) => this.ApplyScratchpadFromTool(ctx, changes),
            WriteMemory: (note, type, scopeHint) => this.WriteMemoryFromTool(ctx, promptHelper, { note, type, scopeHint }, params),
            RunArtifactTool: (artifactId, tool, input) => ctx.Hooks.ExecuteNativeArtifactTool({ artifactId, tool, input }),
            RunConversationTool: (tool, input) => this.RunConversationToolFromTool(ctx, tool, input),
            RunDecisions: (requests, payload) => this.RunDecisionsFromTool(ctx, requests, payload, params),
        };
    }

    public ApplyScratchpadFromTool(ctx: AgentRunContext, changes: AgentScratchpad): string {
        ctx.ScratchpadManager.ApplyScratchpadChanges(changes);
        ctx.ScratchpadManager.EnforceTaskLimit(50); // default scratchpad task retention cap
        return `Scratchpad updated. ${ctx.ScratchpadManager.GetTaskSummary()}`.trim();
    }

    public async WriteMemoryFromTool(
        ctx: AgentRunContext,
        promptHelper: BaseAgentPromptHelper,
        write: MemoryWriteRequest,
        params: ExecuteAgentParams
    ): Promise<AgentToolResult> {
        const skip = promptHelper.MemoryWriteSkip(ctx, params);
        if (skip) {
            return { Content: `Not saved: ${skip.Told}.`, IsError: true };
        }
        const result = await ctx.MemoryWriteManager.ExecuteWrite(write, promptHelper.MemoryWriteOptions(ctx, params));
        const failed = result.disposition === 'error' || result.disposition === 'rejected-type';
        return { Content: `${result.disposition}${result.reason ? `: ${result.reason}` : ''}`, IsError: failed };
    }

    public async ExecuteNativeArtifactTool(ctx: AgentRunContext, call: ArtifactToolCall): Promise<AgentToolResult> {
        const stored = await ctx.ArtifactToolManager.ExecuteSingleToolCall(call);
        if (stored.trustLevel === 'Untrusted' || stored.trustLevel === 'SemiTrusted') {
            ctx.Hooks.RecordTaintedSource(
                ctx.PromptTurnCount,
                stored.sourceName ?? `artifact:${stored.artifactId}`,
                stored.trustLevel
            );
        }
        if (!stored.result.success) {
            return { Content: stored.result.errorMessage ?? `Artifact tool '${call.tool}' failed.`, IsError: true };
        }
        const rendered = ctx.Hooks.CapStandaloneToolResultText(RenderToolResultData(stored.result.data));
        const content =
            stored.trustLevel === 'Untrusted' || stored.trustLevel === 'SemiTrusted'
                ? WrapUntrustedExternalData(rendered, stored.sourceName ?? `artifact:${stored.artifactId}`, stored.trustLevel)
                : rendered;
        return { Content: content, IsError: false };
    }

    public async RunConversationToolFromTool(
        ctx: AgentRunContext,
        tool: string,
        input: ArtifactToolArgs
    ): Promise<AgentToolResult> {
        const name = ConversationToolNames.find((n) => n === tool);
        if (!name) {
            return {
                Content: `'${tool}' is not a conversation tool. Use one of: ${ConversationToolNames.join(', ')}.`,
                IsError: true,
            };
        }
        if (ctx.ConversationToolTurn?.turn !== ctx.PromptTurnCount) {
            ctx.ConversationToolTurn = { turn: ctx.PromptTurnCount, count: 0 };
        }
        const maxConversationToolCallsPerTurn = GetMaxConversationToolCallsPerTurn();
        if (++ctx.ConversationToolTurn.count > maxConversationToolCallsPerTurn) {
            return {
                Content: `Skipped — per-turn cap of ${maxConversationToolCallsPerTurn} conversation tool calls reached. Call it again on your next turn.`,
                IsError: true,
            };
        }
        const ran = await ctx.ConversationToolManager.ExecuteSingleToolCall({
            tool: name,
            input: input as ConversationToolCall['input'],
        });
        return ran.result.success
            ? { Content: ctx.Hooks.CapStandaloneToolResultText(RenderToolResultData(ran.result.data)), IsError: false }
            : { Content: ran.result.errorMessage ?? `Conversation tool '${tool}' failed.`, IsError: true };
    }

    public async RunDecisionsFromTool(
        ctx: AgentRunContext,
        requests: AgentDecisionRequest[],
        payload: object,
        params: ExecuteAgentParams
    ): Promise<AgentToolResult> {
        const results = await ctx.Hooks.ExecuteDecisionRequestsAsSteps(requests, payload, ctx.AgentTypePromptParams, params);
        // fls-guard: decision outcomes, not entity rows
        return { Content: JSON.stringify(results), IsError: results.length > 0 && results.every((r) => !r.success) };
    }

    public ResolveToolChoiceForTurn(ctx: AgentRunContext, params: ExecuteAgentParams): ChatToolChoice {
        if (!ctx.Hooks.IsFinalPermittedIteration(params)) {
            return 'auto';
        }
        return ctx.Hooks.GetNativeControlConfig(params).Terminal === 'text' ? 'none' : { name: COMPLETE_TASK_TOOL };
    }

    public GetNativeControlConfig(ctx: AgentRunContext, params: ExecuteAgentParams): NativeControlConfig {
        const source = params.agent?.TypeConfiguration ?? null;
        if (ctx.NativeControl && ctx.NativeControl.source === source) {
            return ctx.NativeControl.config;
        }
        const { Config, Problems } = ResolveNativeControlConfig(source);
        for (const problem of Problems) {
            LogError(`Agent '${params.agent?.Name}': ${problem}`);
        }
        ctx.NativeControl = { source, config: Config };
        return Config;
    }

    public IsFinalPermittedIteration(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        const iterations = ctx.AgentRun?.TotalPromptIterations;
        if (!iterations) {
            return false;
        }
        const perAgent = params.agent?.MaxIterationsPerRun;
        const absolute = ctx.Hooks.ResolvedLimits(params).AgentAbsoluteIterations;
        return (typeof perAgent === 'number' && perAgent > 0 && iterations >= perAgent) || (absolute > 0 && iterations >= absolute);
    }

    // -------------------------------------------------------------------------
    // Volatile Runtime-State Message, Prefix Caching & Template Loading
    // -------------------------------------------------------------------------

    public async RefreshRelocatedSpecialization<P>(
        ctx: AgentRunContext,
        promptParams: AIPromptParams,
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams,
        previous: AgentChatMessage
    ): Promise<void> {
        try {
            const rebuilt = await ctx.Hooks.BuildVolatileStateMessage(
                params,
                promptParams,
                payload,
                config.childPrompt,
                config.agentType,
                config.systemPrompt
            );
            if (!rebuilt || rebuilt.content === previous.content) {
                return;
            }
            const replace = (messages: ChatMessage[] | undefined) => {
                const at = messages ? messages.indexOf(previous) : -1;
                if (messages && at >= 0) {
                    messages[at] = rebuilt;
                }
            };
            replace(promptParams.conversationMessages);
            replace(params.conversationMessages);
            ctx.LastVolatileStateMessage = rebuilt;
            if (ctx.LastSentFingerprints !== undefined && promptParams.conversationMessages) {
                ctx.LastSentFingerprints = promptParams.conversationMessages.map((m) => ctx.Hooks.MessageFingerprint(m));
            }
        } catch (error) {
            ctx.Hooks.LogStatus(
                `Kept the trailing message as first built: re-rendering it with the final template data failed (${error instanceof Error ? error.message : String(error)})`,
                true,
                params
            );
        }
    }

    public DropReasoningBehindChangedHistory(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        outgoing: ChatMessage[],
        promptParams: AIPromptParams
    ): ChatMessage[] {
        if (!this.ShouldTrackSentFingerprints(ctx, outgoing)) {
            ctx.LastSentFingerprints = undefined;
            return outgoing;
        }
        const fingerprints = outgoing.map((m) => ctx.Hooks.MessageFingerprint(m));
        const previous = ctx.LastSentFingerprints;
        ctx.LastSentFingerprints = fingerprints;
        if (!this.ReplaysPrefixBoundReasoning(ctx)) {
            return outgoing;
        }
        promptParams.ReplayedReasoningPrefix = ctx.LastSentPrefix;
        if (!previous) {
            return outgoing;
        }
        const changedAt = previous.findIndex((fingerprint, i) => fingerprints[i] !== fingerprint);
        if (changedAt < 0) {
            return outgoing;
        }
        const stale = new Set(
            outgoing
                .slice(changedAt)
                .flatMap((m) =>
                    (m as AgentChatMessage).reasoning?.length ? ((m as AgentChatMessage).toolCalls ?? []).map((c) => c.id) : []
                )
        );
        if (stale.size === 0) {
            return outgoing;
        }
        const withoutReasoning = (m: ChatMessage): ChatMessage => {
            const { reasoning: _dropped, ...rest } = m as AgentChatMessage;
            return rest;
        };
        const callsStale = (m: ChatMessage) =>
            !!(m as AgentChatMessage).reasoning && ((m as AgentChatMessage).toolCalls ?? []).some((c) => stale.has(c.id));
        params.conversationMessages.forEach((m, i) => {
            if (callsStale(m)) {
                params.conversationMessages[i] = withoutReasoning(m);
            }
        });
        ctx.Hooks.LogStatus(
            `Dropped replayed reasoning from ${stale.size} tool call(s): an earlier message changed since it was produced`,
            true,
            params
        );
        return outgoing.map((m, i) => (i >= changedAt && callsStale(m) ? withoutReasoning(m) : m));
    }

    public ReplaysPrefixBoundReasoning(ctx: AgentRunContext): boolean {
        const selection = ctx.LastModelSelectionInfo;
        return (
            ctx.NativeToolBindings !== undefined &&
            ctx.Hooks.DriverRequiresStableReasoningPrefix(selection?.ModelSelected, selection?.vendorSelected)
        );
    }

    public ShouldTrackSentFingerprints(ctx: AgentRunContext, outgoing: ChatMessage[]): boolean {
        if (ctx.NativeToolBindings === undefined) {
            return false;
        }
        if (ctx.LastModelSelectionInfo === undefined || this.ReplaysPrefixBoundReasoning(ctx)) {
            return true;
        }
        return outgoing.some((m) => Boolean((m as AgentChatMessage).reasoning?.length));
    }

    public TrackSentPrefix(ctx: AgentRunContext, params: ExecuteAgentParams, promptResult: AIPromptRunResult): void {
        const sent = GetSentPrefixFingerprint(promptResult.chatResult);
        if (sent === undefined) {
            return;
        }
        const previous = ctx.LastSentPrefix;
        ctx.LastSentPrefix = sent;
        if (previous === undefined || sent === previous || !this.ReplaysPrefixBoundReasoning(ctx)) {
            return;
        }
        params.conversationMessages.forEach((m, i) => {
            const turn = m as AgentChatMessage;
            if (turn.reasoning) {
                const { reasoning: _dropped, ...rest } = turn;
                params.conversationMessages[i] = rest;
            }
        });
    }

    public RestoreTurn1VolatileStateIfNeeded(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        isAppendOnly: boolean
    ): void {
        if (ctx.Turn1InsertionIndex < 0) {
            ctx.Turn1InsertionIndex = params.conversationMessages.length;
        } else if (isAppendOnly && ctx.LastVolatileStateMessage && !ctx.Hooks.RunHasVolatileStateMessage(params)) {
            const insertIdx = Math.min(ctx.Turn1InsertionIndex, params.conversationMessages.length);
            params.conversationMessages.splice(insertIdx, 0, ctx.LastVolatileStateMessage);
        }
    }

    public RunHasVolatileStateMessage(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        const start = Math.max(0, ctx.Turn1InsertionIndex);
        return params.conversationMessages
            .slice(start)
            .some((m) => (m as AgentChatMessage).metadata?.volatileState === true);
    }

    public AssembleOutgoingMessages(
        ctx: AgentRunContext,
        history: ChatMessage[],
        fragment: AgentChatMessage,
        isAppendOnly: boolean = false
    ): ChatMessage[] {
        return ctx.ContextAssembler.AssembleOutgoingMessages(history, fragment, isAppendOnly);
    }

    public ShouldUseAppendOnlyTrailingState(ctx: AgentRunContext, promptParams: AIPromptParams): boolean {
        const data = promptParams.data ?? {};
        const agentTypePromptParams = data.__agentTypePromptParams as Partial<LoopAgentTypePromptParams> | undefined;
        if (agentTypePromptParams?.trailingStateMode === 'appendOnly') {
            return true;
        }
        if (agentTypePromptParams?.trailingStateMode === 'replace') {
            return false;
        }

        if (promptParams.override?.modelId) {
            const model = AIEngine.Instance?.ModelsByID?.get(NormalizeUUID(promptParams.override.modelId));
            const vendor = promptParams.override.vendorId
                ? AIEngine.Instance?.VendorsByID?.get(NormalizeUUID(promptParams.override.vendorId))
                : undefined;
            if (vendor || ctx.Hooks.ResolvePrefixPromptCache(model, undefined)) {
                return ctx.Hooks.ResolveAppendOnlyState(model, vendor);
            }
        }

        if (ctx.ResolvedTrailingStateMode !== undefined) {
            return ctx.ResolvedTrailingStateMode;
        }
        if (ctx.LastModelSelectionInfo) {
            const model = ctx.LastModelSelectionInfo.ModelSelected;
            const vendor = ctx.LastModelSelectionInfo.vendorSelected;
            ctx.ResolvedTrailingStateMode = ctx.Hooks.ResolveAppendOnlyState(model, vendor);
            return ctx.ResolvedTrailingStateMode;
        }

        return false;
    }

    public ResolveAppendOnlyState(
        ctx: AgentRunContext,
        model: MJAIModelEntityExtended | undefined,
        vendor: MJAIVendorEntity | undefined
    ): boolean {
        if (ctx.Hooks.ResolvePrefixPromptCache(model, vendor)) {
            return true;
        }
        return ctx.NativeToolBindings !== undefined && ctx.Hooks.DriverRequiresStableReasoningPrefix(model, vendor);
    }

    public DriverRequiresStableReasoningPrefix(
        ctx: AgentRunContext,
        model: MJAIModelEntityExtended | undefined,
        vendor: MJAIVendorEntity | undefined
    ): boolean {
        return ctx.ContextAssembler.DriverRequiresStableReasoningPrefix(model, vendor);
    }

    public ResolvePrefixPromptCache(
        ctx: AgentRunContext,
        model: MJAIModelEntityExtended | undefined,
        vendor: MJAIVendorEntity | undefined
    ): boolean {
        return ctx.ContextAssembler.ResolvePrefixPromptCache(model, vendor);
    }

    public async BuildVolatileStateMessage<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        promptParams: AIPromptParams,
        payload: P,
        childPrompt: MJAIPromptEntityExtended | undefined,
        agentType: MJAIAgentTypeEntity,
        systemPrompt?: MJAIPromptEntityExtended
    ): Promise<AgentChatMessage | null> {
        const data = promptParams.data ?? {};
        const agentTypePromptParams = data.__agentTypePromptParams as Record<string, unknown> | undefined;

        const effectiveSystemPrompt = systemPrompt ?? (promptParams.prompt as MJAIPromptEntityExtended | undefined);
        const delivery = await ctx.Hooks.ResolveRuntimeStateDelivery(effectiveSystemPrompt, params.contextUser);
        if (delivery === 'embedded') {
            ctx.Hooks.LogStatus(
                '⚠️ System prompt template still contains volatile blocks (database template unsynced); skipping trailing runtime-state fragment to avoid duplicate state.',
                true,
                params
            );
            return null;
        }
        if (delivery === 'unsupported') {
            ctx.Hooks.LogStatus(
                `System prompt template has no <${RUNTIME_STATE_TAG}> pointer (not a Loop agent system prompt); skipping trailing runtime-state fragment.`,
                true,
                params
            );
            return null;
        }

        const includeDateTime = agentTypePromptParams?.includeDateTimeInPrompt !== false;
        const includeScratchpad = agentTypePromptParams?.includeScratchpadDocs !== false;
        const includePayload = agentTypePromptParams?.includePayloadInPrompt !== false;

        const specialization = await ctx.Hooks.ResolveRelocatedSpecialization(
            promptParams,
            childPrompt,
            agentType,
            params.contextUser
        );
        const fragment = ctx.ContextAssembler.BuildRuntimeStateFragment({
            DateTime: includeDateTime ? await ctx.Hooks.ResolveFragmentDateTime(promptParams) : null,
            Scratchpad: includeScratchpad ? ctx.Hooks.ReadScratchpadFromTemplateData(data) : null,
            Payload: payload || {},
            IncludePayload: includePayload,
            Specialization: specialization,
        });
        if (!fragment) {
            return null;
        }
        ctx.Hooks.LogStatus(
            `📦 Volatile state → trailing message (${fragment.length} chars${specialization ? ', specialization relocated' : ''})`,
            true,
            params
        );
        return { role: 'user', content: fragment, metadata: { volatileState: true, turnAdded: ctx.PromptTurnCount } };
    }

    public async ResolveRelocatedSpecialization(
        ctx: AgentRunContext,
        promptParams: AIPromptParams,
        childPrompt: MJAIPromptEntityExtended | undefined,
        agentType: MJAIAgentTypeEntity,
        contextUser: UserInfo
    ): Promise<string | null> {
        const placeholder = agentType.AgentPromptPlaceholder;
        if (!childPrompt || !placeholder || !promptParams.childPrompts || promptParams.childPrompts.length === 0) {
            return null;
        }
        const templateText = await ctx.Hooks.LoadChildPromptTemplateText(childPrompt, contextUser);
        const agentTypePromptParams = promptParams.data?.__agentTypePromptParams as Record<string, unknown> | undefined;
        if (ResolveSpecializationPlacement(agentTypePromptParams, templateText) !== 'trailingMessage') {
            return null;
        }
        const rendered = await ctx.PromptRunner.RenderChildPromptTemplates(promptParams.childPrompts, promptParams);
        const text = rendered.renderedTemplates[placeholder];
        if (!text || text.trim().length === 0) {
            return null;
        }
        promptParams.PreRenderedChildTemplates = rendered.renderedTemplates;
        if (promptParams.data) {
            promptParams.data._SPECIALIZATION_RELOCATED = true;
        }
        return text;
    }

    public async ResolveRuntimeStateDelivery(
        ctx: AgentRunContext,
        systemPrompt: MJAIPromptEntityExtended | undefined,
        contextUser: UserInfo
    ): Promise<'trailing' | 'embedded' | 'unsupported' | 'unknown'> {
        const templateText = await ctx.Hooks.LoadPromptTemplateText(systemPrompt, contextUser);
        if (templateText === null) {
            return 'unknown';
        }
        const markers = ctx.Hooks.VolatileTemplateMarkers();
        if (
            ctx.LastRuntimeStateDeliveryCache &&
            ctx.LastRuntimeStateDeliveryCache.templateText === templateText &&
            ctx.LastRuntimeStateDeliveryCache.markers === markers
        ) {
            return ctx.LastRuntimeStateDeliveryCache.delivery;
        }
        const delivery: 'trailing' | 'embedded' | 'unsupported' = ctx.Hooks.TemplateTextEmbedsVolatileState(templateText)
            ? 'embedded'
            : templateText.includes(`<${RUNTIME_STATE_TAG}>`)
            ? 'trailing'
            : 'unsupported';
        ctx.LastRuntimeStateDeliveryCache = { templateText, markers, delivery };
        return delivery;
    }

    public VolatileTemplateMarkers(): readonly string[] {
        return VOLATILE_TEMPLATE_MARKERS;
    }

    public TemplateTextEmbedsVolatileState(ctx: AgentRunContext, templateText: string): boolean {
        return ctx.ContextAssembler.TemplateTextEmbedsVolatileState(templateText, ctx.Hooks.VolatileTemplateMarkers());
    }

    public async EnsureTemplateEngineConfigured(ctx: AgentRunContext, contextUser: UserInfo | undefined): Promise<void> {
        if (ctx.AgentRun && ctx.TemplateEngineConfiguredForRun) {
            return;
        }
        await TemplateEngineServer.Instance.Config(false, contextUser);
        if (ctx.AgentRun) {
            ctx.TemplateEngineConfiguredForRun = true;
        }
    }

    public async LoadPromptTemplateText(
        ctx: AgentRunContext,
        prompt: MJAIPromptEntityExtended | undefined,
        contextUser: UserInfo
    ): Promise<string | null> {
        if (!prompt?.TemplateID) {
            return null;
        }
        try {
            await ctx.Hooks.EnsureTemplateEngineConfigured(contextUser);
            const templates = TemplateEngineServer.Instance.Templates;
            if (!templates) {
                return null;
            }
            let template: MJTemplateEntityExtended | undefined;
            if (templates === ctx.CachedTemplatesArrayRef && ctx.TemplateByIdMap) {
                template = ctx.TemplateByIdMap.get(NormalizeUUID(prompt.TemplateID));
            } else {
                ctx.CachedTemplatesArrayRef = templates;
                const map = new Map<string, MJTemplateEntityExtended>();
                for (const t of templates) {
                    if (t?.ID) {
                        map.set(NormalizeUUID(t.ID), t);
                    }
                }
                ctx.TemplateByIdMap = map;
                template = map.get(NormalizeUUID(prompt.TemplateID));
            }
            return template?.GetHighestPriorityContent()?.TemplateText ?? null;
        } catch (e) {
            ctx.Hooks.LogError(e instanceof Error ? e : String(e), { category: 'RuntimeStateFragment', severity: 'warning' });
            return null;
        }
    }

    public LoadChildPromptTemplateText(
        ctx: AgentRunContext,
        childPrompt: MJAIPromptEntityExtended,
        contextUser: UserInfo
    ): Promise<string | null> {
        return ctx.Hooks.LoadPromptTemplateText(childPrompt, contextUser);
    }

    public ResolveFragmentDateTime(ctx: AgentRunContext, promptParams: AIPromptParams): Promise<RuntimeStateDateTime | null> {
        return ctx.ContextAssembler.ResolveFragmentDateTime(promptParams, (error, placeholder) => {
            ctx.Hooks.LogError(error instanceof Error ? error : String(error), {
                category: 'RuntimeStateFragment',
                severity: 'warning',
                metadata: { placeholder },
            });
        });
    }

    public ReadScratchpadFromTemplateData(
        ctx: AgentRunContext,
        data: Record<string, unknown>
    ): RuntimeStateScratchpad | null {
        return ctx.ContextAssembler.ReadScratchpadFromTemplateData(data);
    }
}
