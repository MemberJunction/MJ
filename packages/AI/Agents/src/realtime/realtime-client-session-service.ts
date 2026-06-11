/**
 * @fileoverview Server-agnostic preparer + tool relay for a CLIENT-DIRECT realtime session
 * (the Realtime Co-Agent dual-topology design).
 *
 * In the client-direct topology the browser opens its OWN provider socket (e.g. WebRTC) using a
 * server-minted ephemeral token, but the **server** still owns the system prompt and tool set and
 * **executes** every tool call the browser relays back. This service is the server-side half of
 * that contract. It does two things:
 *
 * 1. {@link RealtimeClientSessionService.PrepareClientSession} — resolves the Realtime model,
 *    assembles the companion system prompt (co-agent prompt + target identity + history + memory),
 *    builds the stable, target-independent tool set (always including `invoke-target-agent`), and
 *    asks the model to mint a {@link ClientRealtimeSessionConfig} (ephemeral token + provider
 *    session config) the browser applies verbatim.
 * 2. {@link RealtimeClientSessionService.ExecuteRelayedTool} — executes a single tool call the
 *    browser relayed, routing it through the shared {@link RealtimeToolBroker} so the result is
 *    byte-for-byte identical to the server-bridged path. `invoke-target-agent` delegates to the
 *    target agent via {@link AgentRunner.RunAgent}; every other tool returns a structured
 *    "not available" result for now (action wiring is a later phase).
 *
 * **Why this duplicates BaseAgent.** The private helpers in `BaseAgent.executeRealtimeSession`
 * (model resolution, companion-prompt assembly, target-agent resolution, delegation) are the
 * server-bridged equivalents of the logic here, but they are `private` to `BaseAgent` and bound to
 * an in-flight `AIAgentRun`/`StartSession` lifecycle. This service mirrors that logic for the
 * client-direct topology, which has no server-side session loop. **A future refactor should extract
 * a shared `RealtimeSessionPreparer`** that both `BaseAgent` and this service consume, eliminating
 * the duplication. Until then, keep the two in sync intentionally.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { UserInfo, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { MJAIAgentRunStepEntity, MJAIPromptRunEntity, MJArtifactEntity } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    ChatMessage,
    ClientRealtimeSessionConfig,
    GetAIAPIKey,
    JSONObject,
    RealtimeSessionParams,
    RealtimeToolCall,
    RealtimeToolDefinition
} from '@memberjunction/ai';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended, MJAIAgentRunEntityExtended, AgentExecutionProgressCallback, ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

import { AgentMemoryContextBuilder } from '../agent-memory-context-builder';
import { AgentRunner } from '../AgentRunner';
import {
    RealtimeToolBroker,
    RealtimeToolBrokerDeps,
    INVOKE_TARGET_AGENT_TOOL_NAME,
    DelegateToTargetRequest,
    DelegatedResult,
    DelegatedRunArtifact,
    ToolExecutionResult
} from './realtime-tool-broker';

/**
 * Input for {@link RealtimeClientSessionService.PrepareClientSession}.
 *
 * The co-agent may be supplied either as a fully-loaded entity (`CoAgent`) or by id (`CoAgentID`),
 * which is resolved from {@link AIEngine}'s cached agents. The target agent is always supplied by
 * id — it is a runtime choice made when the voice session starts.
 */
export interface PrepareClientSessionInput {
    /** The Realtime Co-Agent entity. Provide this OR {@link PrepareClientSessionInput.CoAgentID}. */
    CoAgent?: MJAIAgentEntityExtended;
    /** The Realtime Co-Agent id (resolved from cached metadata). Provide this OR {@link PrepareClientSessionInput.CoAgent}. */
    CoAgentID?: string;
    /** The top-level target agent the co-agent voices on behalf of (a runtime parameter). */
    TargetAgentID: string;
    /** The shared session id grouping this voice session's runs. */
    AgentSessionID: string;
    /** Optional conversation id the session is attached to — stamped on the co-agent observability run. */
    ConversationID?: string;
    /** Prior conversation history to seed the model's context. Optional. */
    ConversationMessages?: ChatMessage[];
    /** Optional user-scope id for memory/context retrieval (falls back to the context user). */
    UserID?: string;
    /** Optional company-scope id for memory/context retrieval. */
    CompanyID?: string;
    /** Optional provider-specific session config bag (voice, language, turn detection, etc.). */
    Config?: JSONObject;
    /** Optional extra, target-independent tools to expose in addition to `invoke-target-agent`. */
    ExtraTools?: RealtimeToolDefinition[];
    /**
     * Optional EXPLICIT realtime model choice (`MJ: AI Models.ID`). When set, that exact model is
     * used — it must be Active, of AIModelType `Realtime`, and have an active vendor whose
     * `DriverClass` resolves an API key. If the preferred model cannot be satisfied the prepare
     * FAILS with a clear reason (no silent fallback — the user explicitly chose). When omitted,
     * the default highest-PowerRank resolution applies.
     */
    PreferredModelID?: string;
}

/**
 * Result of {@link RealtimeClientSessionService.PrepareClientSession}.
 *
 * On success, {@link RealtimeClientSessionPrepResult.ClientConfig} is the server-minted config the
 * browser applies, and {@link RealtimeClientSessionPrepResult.SessionParams} is the params the
 * server used to mint it (handy for the resolver to echo/persist). On failure, `Success` is `false`
 * and `ErrorMessage` explains why — this method never throws for an unresolvable model/key.
 */
export interface RealtimeClientSessionPrepResult {
    /** Whether the client session config was minted successfully. */
    Success: boolean;
    /** The minted client-direct session config (token + provider session config). Present on success. */
    ClientConfig?: ClientRealtimeSessionConfig;
    /** The session params the server built (system prompt, model, tools). Present on success. */
    SessionParams?: RealtimeSessionParams;
    /**
     * ID of the server-side co-agent observability `AIAgentRun` created for this session. Present
     * when the run was created successfully; absent when run creation was skipped or failed
     * (observability is best-effort and never fails the prepare). Delegated target-agent runs nest
     * under this run via `ParentRunID`, and {@link RealtimeClientSessionService.FinalizeCoAgentRun}
     * closes it when the session ends.
     */
    CoAgentRunID?: string;
    /**
     * ID of the server-side co-agent `AIPromptRun` linked to {@link RealtimeClientSessionPrepResult.CoAgentRunID}.
     * Present only when the co-agent's system prompt resolved (so a prompt run could be created).
     */
    PromptRunID?: string;
    /**
     * ID of the single `MJ: AI Agent Run Steps` row created under {@link RealtimeClientSessionPrepResult.CoAgentRunID}
     * for the realtime session's system prompt (StepType `Prompt`, TargetID = the system prompt,
     * TargetLogID = {@link RealtimeClientSessionPrepResult.PromptRunID}). It makes the co-agent run's
     * Timeline non-empty. Present only when the co-agent's system prompt resolved AND the step saved
     * (step creation is best-effort, like the runs themselves). Finalized alongside the runs by
     * {@link RealtimeClientSessionService.FinalizeCoAgentRun}.
     */
    CoAgentRunStepID?: string;
    /** A human-readable failure reason. Present on failure. */
    ErrorMessage?: string;
    /** The `MJ: AI Models` row id of the realtime model the session was minted with. Present on success. */
    ModelID?: string;
    /** The display name of the realtime model the session was minted with. Present on success. */
    ModelName?: string;
    /**
     * The DB-driven progress-narration instruction template (the `Realtime Co-Agent - Progress
     * Narration` prompt's `TemplateText`, containing a `{{ progressMessage }}` placeholder).
     * `undefined` when that prompt is not present in metadata — clients fall back to their
     * built-in narration instruction text.
     */
    NarrationInstructionsTemplate?: string;
}

/**
 * The resolved co-agent system prompt text plus the id of the prompt it came from, returned by
 * {@link RealtimeClientSessionService.resolveCoAgentSystemPrompt}.
 */
export interface CoAgentSystemPromptResolution {
    /** The co-agent's system prompt template text (empty string when none is configured). */
    Text: string;
    /** The `MJ: AI Prompts` row id, or `null` when the co-agent has no active prompt. */
    PromptID: string | null;
}

/**
 * Input for {@link RealtimeClientSessionService.ExecuteRelayedTool}.
 *
 * Carries the single tool call the browser relayed plus the linkage needed to run a delegated
 * target-agent run under the same session.
 */
export interface ExecuteRelayedToolInput {
    /** The shared session id grouping this voice session's runs. */
    AgentSessionID: string;
    /** The id of the (co-agent) run that owns this session, used as the delegated run's parent. Optional. */
    ParentRunID?: string;
    /** The top-level target agent id for `invoke-target-agent` delegation. */
    TargetAgentID: string;
    /** The tool call the browser relayed from the provider. */
    Call: RealtimeToolCall;
    /**
     * Optional abort signal so a barge-in on the browser can cancel an in-flight delegated run.
     * Threaded into the delegated agent run's `cancellationToken`.
     */
    AbortSignal?: AbortSignal;
    /**
     * Optional progress callback invoked with each delegated-run progress event (mirrors the normal
     * agent-run path's `onProgress`). The transport layer (the MJServer resolver) publishes these so
     * the realtime model can narrate the target agent's progress while it runs. When omitted, the
     * delegated run streams nothing and the model only receives the final tool result.
     */
    OnProgress?: AgentExecutionProgressCallback;
    /**
     * Optional id of a previously-paused delegated run (Status `AwaitingFeedback`) to RESUME instead
     * of starting a fresh run. When set, {@link delegateToTarget} passes it as `lastRunId` (with
     * `autoPopulateLastRunPayload`) to {@link AgentRunner.RunAgent}, so the user's answer continues
     * the SAME interactive run (e.g. confirming a Query Builder task graph).
     */
    ResumeRunID?: string;
}

/**
 * The resolved Realtime model plus its identifiers, returned by the model-resolution seam.
 */
export interface RealtimeModelResolution {
    /** The instantiated realtime driver. */
    Model: BaseRealtimeModel;
    /** The `MJ: AI Models` row id. */
    ModelID: string;
    /** The chosen vendor id. */
    VendorID: string;
    /** The vendor API name passed to the provider as the model id. */
    APIName: string;
    /** The model's display name (`MJ: AI Models.Name`). Optional for back-compat with test seams. */
    ModelName?: string;
}

/**
 * Outcome of resolving the realtime model for a session: either a usable {@link RealtimeModelResolution}
 * or a specific, human-readable failure reason (used for explicit preferred-model failures, where the
 * generic "no model" message would hide WHY the user's chosen model couldn't be used).
 */
export interface RealtimeModelResolutionOutcome {
    /** The resolved model. Present on success. */
    Resolution?: RealtimeModelResolution;
    /** Why resolution failed. Present on failure. */
    ErrorMessage?: string;
}

/**
 * Server-agnostic service that prepares a client-direct realtime session and executes the tool
 * calls the browser relays back. Constructed per-request (a normal injectable service — NOT a
 * singleton) so the {@link UserInfo} and {@link IMetadataProvider} are always request-scoped.
 *
 * Every public method takes the `contextUser` and `provider` explicitly — this service never
 * reaches for the global default provider, so it is safe in multi-provider/multi-tenant servers.
 */
export class RealtimeClientSessionService {
    /**
     * The seeded name of the `MJ: AI Prompts` row whose `TemplateText` carries the first-person
     * progress-narration instructions (with a `{{ progressMessage }}` placeholder). Resolved at
     * session prepare time so the browser narrates with DB-driven, product-tunable wording.
     */
    public static readonly NarrationPromptName = 'Realtime Co-Agent - Progress Narration';

    /**
     * DEPRECATED legacy name of the narration prompt, from before the co-agent's rename from
     * "Voice Co-Agent" to "Realtime Co-Agent". Deployments that have not re-synced the prompt seed
     * still carry this name, so {@link resolveNarrationInstructionsTemplate} falls back to it
     * (with a deprecation log) when {@link RealtimeClientSessionService.NarrationPromptName} is absent.
     */
    public static readonly LegacyNarrationPromptName = 'Voice Co-Agent - Progress Narration';

    /**
     * Prepares a client-direct realtime session: resolves the model, assembles the companion
     * system prompt + stable tool set, and mints the {@link ClientRealtimeSessionConfig}.
     *
     * Returns a failure result (never throws) when no Realtime model/key resolves or the provider
     * cannot mint a client-direct session.
     *
     * @param input The co-agent/target/session inputs.
     * @param contextUser The calling user (threaded to metadata + memory retrieval).
     * @param provider The request-scoped metadata provider.
     * @returns The prep result (Success + ClientConfig/SessionParams, or Success: false + ErrorMessage).
     */
    public async PrepareClientSession(
        input: PrepareClientSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<RealtimeClientSessionPrepResult> {
        await this.configureEngine(contextUser, provider);

        const coAgent = this.resolveCoAgent(input);
        if (!coAgent) {
            return { Success: false, ErrorMessage: 'The Realtime Co-Agent could not be resolved from the supplied id or entity.' };
        }

        const outcome = await this.resolveModelForSession(input, coAgent);
        if (!outcome.Resolution) {
            return { Success: false, ErrorMessage: outcome.ErrorMessage ?? this.noModelMessage() };
        }
        const resolution = outcome.Resolution;

        if (!resolution.Model.SupportsClientDirect) {
            return {
                Success: false,
                ErrorMessage: `The resolved realtime model '${resolution.APIName}' does not support client-direct sessions.`
            };
        }

        const sessionParams = await this.buildSessionParams(input, coAgent, resolution.APIName, contextUser, provider);

        let clientConfig: ClientRealtimeSessionConfig;
        try {
            clientConfig = await resolution.Model.CreateClientSession(sessionParams);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { Success: false, ErrorMessage: `Failed to mint client realtime session: ${message}` };
        }

        // Best-effort observability: create a server-side co-agent run (+ prompt run) so the voice
        // session is visible in the agent-run timeline and delegated runs can nest under it. A
        // failure here never fails the prepare — we just omit the ids.
        const promptID = this.resolveCoAgentSystemPrompt(coAgent).PromptID;
        const obs = await this.createCoAgentObservabilityRun(
            coAgent, promptID, resolution.ModelID,
            input.UserID || contextUser?.ID, input.AgentSessionID,
            contextUser, provider, input.ConversationID,
        );

        return {
            Success: true,
            ClientConfig: clientConfig,
            SessionParams: sessionParams,
            CoAgentRunID: obs?.CoAgentRunID,
            PromptRunID: obs?.PromptRunID,
            CoAgentRunStepID: obs?.CoAgentRunStepID,
            ModelID: resolution.ModelID,
            ModelName: resolution.ModelName,
            NarrationInstructionsTemplate: this.resolveNarrationInstructionsTemplate() ?? undefined,
        };
    }

    /**
     * Creates the server-side co-agent observability runs for a voice session: an `AIAgentRun`
     * (Status `Running`), and — when a co-agent system prompt resolved — a linked `AIPromptRun`
     * (Status `Running`, `AgentRunID` = the co-agent run, `AgentID` = the co-agent) plus a single
     * `MJ: AI Agent Run Steps` row (StepType `Prompt`) so the co-agent run's Timeline is non-empty.
     * Delegated target-agent runs nest under the returned `CoAgentRunID` via `ParentRunID`.
     *
     * Best-effort: returns `null` (and logs) when the co-agent run cannot be saved, so callers can
     * continue without observability rather than failing the whole prepare. A failed prompt-run or
     * run-step save just omits that id.
     *
     * @param coAgent The resolved co-agent (its id stamps `AgentID` on both runs).
     * @param promptID The co-agent system prompt id, or `null` to skip the prompt run + run step.
     * @param modelID The resolved realtime model id (stamps the prompt run's `ModelID`).
     * @param userID Optional owning user id for the agent run.
     * @param agentSessionID The session id grouping this voice session's runs.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The `{ CoAgentRunID, PromptRunID, CoAgentRunStepID }` ids, or `null` when the agent run failed.
     */
    protected async createCoAgentObservabilityRun(
        coAgent: MJAIAgentEntityExtended,
        promptID: string | null,
        modelID: string,
        userID: string | undefined,
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        conversationID?: string,
    ): Promise<{ CoAgentRunID: string; PromptRunID?: string; CoAgentRunStepID?: string } | null> {
        const coAgentRunID = await this.createCoAgentRun(
            coAgent, userID, agentSessionID, conversationID, contextUser, provider,
        );
        if (!coAgentRunID) {
            return null;
        }
        const promptRunID = await this.createCoAgentPromptRun(coAgent, promptID, modelID, coAgentRunID, contextUser, provider);
        const runStepID = await this.createCoAgentRunStep(coAgentRunID, promptID, promptRunID, contextUser, provider);
        return { CoAgentRunID: coAgentRunID, PromptRunID: promptRunID ?? undefined, CoAgentRunStepID: runStepID ?? undefined };
    }

    /**
     * Creates the co-agent `AIAgentRun` row (Status `Running`). Returns its id, or `null` (logging
     * `CompleteMessage`) when the save fails.
     */
    private async createCoAgentRun(
        coAgent: MJAIAgentEntityExtended,
        userID: string | undefined,
        agentSessionID: string,
        conversationID: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        run.NewRecord();
        run.AgentID = coAgent.ID;
        run.Status = 'Running';
        run.StartedAt = new Date();
        run.AgentSessionID = agentSessionID;
        if (conversationID) {
            run.ConversationID = conversationID;
        }
        if (userID) {
            run.UserID = userID;
        }
        if (await run.Save()) {
            return run.ID;
        }
        LogError(`RealtimeClientSessionService.createCoAgentRun save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return null;
    }

    /**
     * Creates the co-agent `AIPromptRun` row (Status `Running`) linked to the co-agent run via
     * `AgentRunID` AND to the co-agent itself via `AgentID` — so the run shows up both on the
     * prompt's run history (`PromptID`) and in agent-scoped prompt-run views. Returns its id, or
     * `null` when `promptID` is absent (skipped) or the save fails (logged).
     */
    private async createCoAgentPromptRun(
        coAgent: MJAIAgentEntityExtended,
        promptID: string | null,
        modelID: string,
        coAgentRunID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (!promptID) {
            return null;
        }
        const promptRun = await provider.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', contextUser);
        promptRun.NewRecord();
        promptRun.PromptID = promptID;
        promptRun.ModelID = modelID;
        promptRun.AgentID = coAgent.ID;
        promptRun.RunAt = new Date();
        promptRun.RunType = 'Single';
        promptRun.Status = 'Running';
        promptRun.AgentRunID = coAgentRunID;
        if (await promptRun.Save()) {
            return promptRun.ID;
        }
        LogError(`RealtimeClientSessionService.createCoAgentPromptRun save failed: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return null;
    }

    /**
     * Creates the single `MJ: AI Agent Run Steps` row for the co-agent observability run — the
     * realtime session has no iterative loop, so its Timeline carries exactly one step
     * representing the session's system prompt (StepNumber 1, StepType `Prompt`, Status `Running`,
     * `TargetID` = the system `AIPrompt`, `TargetLogID` = the linked `AIPromptRun` when one was
     * created). Skipped (returns `null`) when no system prompt resolved. Best-effort: a save
     * failure is logged and returns `null` — it never breaks the session.
     */
    private async createCoAgentRunStep(
        coAgentRunID: string,
        promptID: string | null,
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (!promptID) {
            return null;
        }
        try {
            const step = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
            step.NewRecord();
            step.AgentRunID = coAgentRunID;
            step.StepNumber = 1;
            step.StepType = 'Prompt';
            step.StepName = 'Realtime session system prompt';
            step.TargetID = promptID;
            step.TargetLogID = promptRunID;
            step.Status = 'Running';
            step.StartedAt = new Date();
            if (await step.Save()) {
                return step.ID;
            }
            LogError(`RealtimeClientSessionService.createCoAgentRunStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        } catch (error) {
            LogError(`RealtimeClientSessionService.createCoAgentRunStep failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Finalizes the server-side co-agent observability records when a voice session ends. Loads
     * each (when its id is supplied) and, **only if it is still `Running`**, sets it to `Completed`
     * (or `Failed` when `success` is false) with a `CompletedAt` + `Success` stamp. Idempotent and
     * tolerant: a missing/already-finalized record is a no-op; a load/save failure is logged,
     * never thrown.
     *
     * @param coAgentRunID The co-agent run id, or `null` to skip.
     * @param promptRunID The co-agent prompt run id, or `null` to skip.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @param success Whether the session ended successfully (controls Completed vs Failed).
     * @param coAgentRunStepID The co-agent run's single `MJ: AI Agent Run Steps` row id, or `null` to skip.
     */
    public async FinalizeCoAgentRun(
        coAgentRunID: string | null,
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean = true,
        coAgentRunStepID: string | null = null,
    ): Promise<void> {
        await this.finalizeAgentRun(coAgentRunID, contextUser, provider, success);
        await this.finalizePromptRun(promptRunID, contextUser, provider, success);
        await this.finalizeRunStep(coAgentRunStepID, contextUser, provider, success);
    }

    /** Loads + finalizes the co-agent `AIAgentRun` if still `Running`. Tolerant: logs, never throws. */
    private async finalizeAgentRun(
        coAgentRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean,
    ): Promise<void> {
        if (!coAgentRunID) {
            return;
        }
        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        if (!(await run.Load(coAgentRunID)) || run.Status !== 'Running') {
            return;
        }
        run.Status = success ? 'Completed' : 'Failed';
        run.CompletedAt = new Date();
        run.Success = success;
        if (!(await run.Save())) {
            LogError(`RealtimeClientSessionService.finalizeAgentRun save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Loads + finalizes the co-agent run's single system-prompt `MJ: AI Agent Run Steps` row if
     * still `Running` (Status `Completed`/`Failed`, `CompletedAt`, `Success`). Tolerant: a
     * missing/already-finalized step is a no-op; a load/save failure is logged, never thrown.
     */
    private async finalizeRunStep(
        coAgentRunStepID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean,
    ): Promise<void> {
        if (!coAgentRunStepID) {
            return;
        }
        try {
            const step = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
            if (!(await step.Load(coAgentRunStepID)) || step.Status !== 'Running') {
                return;
            }
            step.Status = success ? 'Completed' : 'Failed';
            step.CompletedAt = new Date();
            step.Success = success;
            if (!success) {
                step.ErrorMessage = 'The realtime session ended in an error state.';
            }
            if (!(await step.Save())) {
                LogError(`RealtimeClientSessionService.finalizeRunStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (error) {
            LogError(`RealtimeClientSessionService.finalizeRunStep failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** Loads + finalizes the co-agent `AIPromptRun` if still `Running`. Tolerant: logs, never throws. */
    private async finalizePromptRun(
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean,
    ): Promise<void> {
        if (!promptRunID) {
            return;
        }
        const run = await provider.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', contextUser);
        if (!(await run.Load(promptRunID)) || run.Status !== 'Running') {
            return;
        }
        run.Status = success ? 'Completed' : 'Failed';
        run.CompletedAt = new Date();
        run.Success = success;
        if (!(await run.Save())) {
            LogError(`RealtimeClientSessionService.finalizePromptRun save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Executes a single tool call relayed from the browser and returns its serialized result.
     *
     * Builds a {@link RealtimeToolBroker} whose `DelegateToTarget` runs the target agent (threading
     * the abort signal, parent run, and session id) and whose `ExecuteTool` returns a structured
     * "not available" result for non-target tools (action wiring is a later phase). The broker
     * routes the call and always resolves with structured JSON — failures become `tool_response`
     * errors the model can narrate rather than thrown exceptions.
     *
     * @param input The relayed tool call plus delegation linkage.
     * @param contextUser The calling user (threaded into the delegated agent run).
     * @param provider The request-scoped metadata provider (threaded into the delegated agent run).
     * @returns `{ ResultJson, Success, PausedRunID? }` — the serialized tool result for the browser
     *   to relay back, plus the paused run id when the delegated target agent paused awaiting
     *   feedback (so the resolver can persist it and resume that run on the next answer).
     */
    public async ExecuteRelayedTool(
        input: ExecuteRelayedToolInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<{ ResultJson: string; Success: boolean; PausedRunID?: string }> {
        const broker = this.buildToolBroker(input, contextUser, provider);
        const result = await broker.ExecuteToolCall(input.Call);
        return { ResultJson: result.ResultJson, Success: result.Success, PausedRunID: result.PausedRunID };
    }

    /**
     * Ensures {@link AIEngine} metadata is loaded before resolution. **Overridable seam** so tests
     * can skip the DB-backed config load.
     *
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     */
    protected async configureEngine(contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
        await AIEngine.Instance.Config(false, contextUser, provider);
    }

    /**
     * Resolves the co-agent from either the supplied entity or its id (from cached metadata).
     *
     * @param input The prepare-session input.
     * @returns The co-agent entity, or `null` when neither form resolves.
     */
    protected resolveCoAgent(input: PrepareClientSessionInput): MJAIAgentEntityExtended | null {
        if (input.CoAgent) {
            return input.CoAgent;
        }
        if (input.CoAgentID) {
            return (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, input.CoAgentID!)) ?? null;
        }
        return null;
    }

    /**
     * Resolves the realtime model for a session, honoring an explicit user choice when present.
     *
     * - With {@link PrepareClientSessionInput.PreferredModelID}: resolve THAT model strictly via
     *   {@link resolvePreferredRealtimeModel} — failures return a specific reason and never fall
     *   back to another model (the user explicitly chose).
     * - Without: the existing default behavior via {@link resolveRealtimeModel} (highest-PowerRank
     *   active Realtime model), with the generic {@link noModelMessage} on failure.
     *
     * @param input The prepare-session input (carries the optional preferred model id).
     * @param coAgent The resolved co-agent (threaded to the default-resolution seam).
     * @returns The resolution outcome (resolution or failure reason).
     */
    protected async resolveModelForSession(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended
    ): Promise<RealtimeModelResolutionOutcome> {
        if (input.PreferredModelID) {
            return this.resolvePreferredRealtimeModel(input.PreferredModelID);
        }
        const resolution = await this.resolveRealtimeModel(coAgent);
        return resolution ? { Resolution: resolution } : { ErrorMessage: this.noModelMessage() };
    }

    /**
     * Strictly resolves an EXPLICITLY requested realtime model. Each precondition failure returns
     * a clear, user-facing reason naming the model — there is NO fallback to another model, because
     * the caller's user explicitly chose this one.
     *
     * @param preferredModelID The `MJ: AI Models.ID` the user chose.
     * @returns The resolution outcome (resolution or a specific failure reason).
     */
    protected resolvePreferredRealtimeModel(preferredModelID: string): RealtimeModelResolutionOutcome {
        const model = this.findModelByID(preferredModelID);
        if (!model) {
            return { ErrorMessage: `The requested realtime model (id '${preferredModelID}') was not found in AI model metadata.` };
        }
        if (!model.IsActive) {
            return { ErrorMessage: `The requested model '${model.Name}' is not active and cannot be used for a voice session.` };
        }
        if (!this.isRealtimeModel(model)) {
            return { ErrorMessage: `The requested model '${model.Name}' is not a Realtime model (its type is '${model.AIModelType}').` };
        }
        const resolution = this.resolveVendorAndInstantiate(model);
        if (!resolution) {
            return {
                ErrorMessage:
                    `The requested model '${model.Name}' has no active vendor with a usable DriverClass/API key ` +
                    '(e.g. AI_VENDOR_API_KEY__<driver>), so the voice session could not be started with it.'
            };
        }
        return { Resolution: resolution };
    }

    /**
     * Looks up a model by id in {@link AIEngine}'s cached models. **Overridable seam** for tests.
     *
     * @param modelID The `MJ: AI Models.ID` to find.
     * @returns The model entity, or `null` when not present.
     */
    protected findModelByID(modelID: string): MJAIModelEntityExtended | null {
        return (AIEngine.Instance.Models ?? []).find(m => UUIDsEqual(m.ID, modelID)) ?? null;
    }

    /** True when the model's denormalized `AIModelType` name is `Realtime` (case/whitespace-insensitive). */
    private isRealtimeModel(model: MJAIModelEntityExtended): boolean {
        return typeof model.AIModelType === 'string' && model.AIModelType.trim().toLowerCase() === 'realtime';
    }

    /**
     * Resolves the Realtime model + vendor driver + API key, mirroring `BaseAgent`'s server-bridged
     * resolution: highest-power active model of AIModelType `Realtime`; highest-priority active
     * vendor whose `DriverClass` has a resolvable API key; instantiated via the `ClassFactory`.
     *
     * **Overridable seam.** Test subclasses override this to return a mock model so the service can
     * be exercised without provider SDKs or DB metadata. Returns `null` (never throws) when any
     * step can't be satisfied.
     *
     * @param coAgent The co-agent being voiced (reserved for future per-agent model preference).
     * @returns The resolved model + identifiers, or `null`.
     */
    protected async resolveRealtimeModel(coAgent: MJAIAgentEntityExtended): Promise<RealtimeModelResolution | null> {
        const model = this.selectRealtimeModelEntity(coAgent);
        if (!model) {
            return null;
        }
        return this.resolveVendorAndInstantiate(model);
    }

    /**
     * Shared tail of model resolution: picks the vendor (with a usable API key) for an
     * already-chosen model entity and instantiates its realtime driver.
     *
     * @param model The chosen model entity.
     * @returns The full resolution, or `null` when no vendor/key/driver can be satisfied.
     */
    protected resolveVendorAndInstantiate(model: MJAIModelEntityExtended): RealtimeModelResolution | null {
        const vendor = this.selectRealtimeVendor(model.ID);
        if (!vendor) {
            return null;
        }

        const apiKey = this.getAPIKeyForDriver(vendor.DriverClass);
        if (!apiKey) {
            return null;
        }

        const instance = this.createModelInstance(vendor.DriverClass, apiKey);
        if (!instance) {
            return null;
        }

        return {
            Model: instance,
            ModelID: model.ID,
            VendorID: vendor.VendorID,
            APIName: vendor.APIName,
            ModelName: model.Name
        };
    }

    /**
     * Resolves the API key for a vendor driver class. **Overridable seam** (wraps the module-level
     * {@link GetAIAPIKey}) so tests can simulate present/absent keys without environment setup.
     *
     * @param driverClass The vendor's `DriverClass`.
     * @returns The API key, or a falsy value when none is configured.
     */
    protected getAPIKeyForDriver(driverClass: string): string | undefined {
        return GetAIAPIKey(driverClass) || undefined;
    }

    /**
     * Instantiates the realtime driver for a vendor driver class via the ClassFactory.
     * **Overridable seam** so tests can return a mock driver.
     *
     * @param driverClass The vendor's `DriverClass` (the ClassFactory key).
     * @param apiKey The resolved API key (constructor argument).
     * @returns The driver instance, or `null` when the factory cannot create one.
     */
    protected createModelInstance(driverClass: string, apiKey: string): BaseRealtimeModel | null {
        return MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, driverClass, apiKey) ?? null;
    }

    /**
     * Selects the highest-power active model of AIModelType `Realtime`. Mirrors
     * `BaseAgent.selectRealtimeModelEntity`.
     *
     * @param coAgent The co-agent (reserved for future per-agent model preference).
     * @returns The chosen model entity, or `null`.
     */
    private selectRealtimeModelEntity(coAgent: MJAIAgentEntityExtended): MJAIModelEntityExtended | null {
        const realtimeModels = AIEngine.Instance.Models.filter(m => m.IsActive && this.isRealtimeModel(m));
        if (realtimeModels.length === 0) {
            return null;
        }

        return realtimeModels.sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0))[0];
    }

    /**
     * Selects the highest-priority active vendor for a model whose `DriverClass` has a resolvable
     * API key. Mirrors `BaseAgent.selectRealtimeVendor`.
     *
     * @param modelID The chosen model's id.
     * @returns The vendor driver/api identifiers, or `null` when none has a usable key.
     */
    protected selectRealtimeVendor(modelID: string): { VendorID: string; DriverClass: string; APIName: string } | null {
        const vendors = AIEngine.Instance.ModelVendors
            .filter(mv => UUIDsEqual(mv.ModelID, modelID) && mv.Status === 'Active' && mv.DriverClass != null)
            .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));

        for (const v of vendors) {
            if (this.getAPIKeyForDriver(v.DriverClass!)) {
                return { VendorID: v.VendorID ?? '', DriverClass: v.DriverClass!, APIName: v.APIName ?? '' };
            }
        }
        return null;
    }

    /**
     * Resolves the DB-driven progress-narration instruction template: the Active `MJ: AI Prompts`
     * row named {@link RealtimeClientSessionService.NarrationPromptName}, read from
     * {@link AIEngine}'s cached prompts. When the current name is absent, falls back to the
     * DEPRECATED {@link RealtimeClientSessionService.LegacyNarrationPromptName} (pre-rename seed)
     * with a deprecation log. **Tolerant**: returns `null` (never throws) when neither prompt is
     * present, the text is empty, or the engine cache is unavailable — clients fall back to their
     * built-in narration instruction text.
     *
     * @returns The template text (containing a `{{ progressMessage }}` placeholder), or `null`.
     */
    protected resolveNarrationInstructionsTemplate(): string | null {
        try {
            const current = this.findActiveNarrationPromptText(RealtimeClientSessionService.NarrationPromptName);
            if (current) {
                return current;
            }
            const legacy = this.findActiveNarrationPromptText(RealtimeClientSessionService.LegacyNarrationPromptName);
            if (legacy) {
                LogStatus(
                    `RealtimeClientSessionService: resolved the narration prompt via its DEPRECATED legacy name ` +
                        `'${RealtimeClientSessionService.LegacyNarrationPromptName}'. Re-sync the prompt seed metadata to ` +
                        `rename it to '${RealtimeClientSessionService.NarrationPromptName}'.`
                );
                return legacy;
            }
            return null;
        } catch {
            return null; // engine cache unavailable — tolerated, client falls back
        }
    }

    /**
     * Finds the Active `MJ: AI Prompts` row with the given name (case/whitespace-insensitive) in
     * {@link AIEngine}'s cached prompts and returns its non-empty `TemplateText`, or `null`.
     */
    private findActiveNarrationPromptText(promptName: string): string | null {
        const wanted = promptName.toLowerCase();
        const prompt = (AIEngine.Instance.Prompts ?? []).find(
            p => p.Name?.trim().toLowerCase() === wanted && p.Status === 'Active'
        );
        const text = prompt?.TemplateText;
        return text && text.trim().length > 0 ? text : null;
    }

    /**
     * Builds the {@link RealtimeSessionParams} for the client-direct session: the companion system
     * prompt plus the stable, target-independent tool set.
     *
     * @param input The prepare-session input.
     * @param coAgent The resolved co-agent.
     * @param modelApiName The vendor API name of the resolved realtime model.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The assembled session params.
     */
    protected async buildSessionParams(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        modelApiName: string,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<RealtimeSessionParams> {
        const systemPrompt = await this.buildCompanionSystemPrompt(input, coAgent, contextUser, provider);
        const memoryContext = await this.assembleMemoryContext(input, coAgent, contextUser);

        return {
            Model: modelApiName,
            SystemPrompt: systemPrompt,
            Tools: this.buildStableToolSet(input.ExtraTools),
            InitialContext: memoryContext || undefined,
            Config: input.Config
        };
    }

    /**
     * Assembles the companion system prompt: the framing ("you are the voice for the target"), the
     * co-agent's own system prompt text, the TARGET agent's identity/capabilities (Name +
     * Description), the conversation history, and the same memory/context a loop agent assembles.
     *
     * @param input The prepare-session input.
     * @param coAgent The resolved co-agent.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The concatenated system prompt (never empty — the framing is always present).
     */
    protected async buildCompanionSystemPrompt(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<string> {
        const target = this.resolveTargetAgent(input.TargetAgentID);
        const targetName = target?.Name ?? 'the configured target agent';

        const framing =
            `You are the real-time voice for the agent "${targetName}". Hold a natural, low-latency ` +
            `conversation with the user, always speaking in the FIRST PERSON as ${targetName} — own the work ` +
            `("I'm pulling that up", "I found three matches"); never refer to ${targetName} or the work in the ` +
            `third person. When actual work is required, call the '${INVOKE_TARGET_AGENT_TOOL_NAME}' ` +
            `tool and narrate progress while it runs — do not attempt to do the work yourself.`;

        const coAgentPrompt = this.getCoAgentSystemPromptText(coAgent);
        const targetIdentity = this.formatTargetIdentity(target);
        const history = this.formatConversationHistory(input.ConversationMessages);
        const memoryContext = await this.assembleMemoryContext(input, coAgent, contextUser);

        return [framing, coAgentPrompt, targetIdentity, history, memoryContext]
            .filter(part => part && part.trim().length > 0)
            .join('\n\n');
    }

    /**
     * Resolves the target agent entity from cached metadata.
     *
     * @param targetAgentID The target agent id.
     * @returns The target agent entity, or `null` when not found.
     */
    protected resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        if (!targetAgentID) {
            return null;
        }
        return (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, targetAgentID)) ?? null;
    }

    /**
     * Reads the co-agent's own system prompt text from its highest-priority active agent prompt,
     * mirroring `BaseAgent.loadAgentConfiguration`'s child-prompt resolution.
     *
     * @param coAgent The resolved co-agent.
     * @returns The co-agent's system prompt template text, or empty string when none is configured.
     */
    protected getCoAgentSystemPromptText(coAgent: MJAIAgentEntityExtended): string {
        return this.resolveCoAgentSystemPrompt(coAgent).Text;
    }

    /**
     * Resolves the co-agent's highest-priority active system prompt, returning both its template
     * text and its prompt id. The id is surfaced so {@link PrepareClientSession} can create a linked
     * co-agent `AIPromptRun` for observability. Mirrors `BaseAgent.loadAgentConfiguration`'s
     * child-prompt resolution.
     *
     * @param coAgent The resolved co-agent.
     * @returns The prompt text + id, or `{ Text: '', PromptID: null }` when none is configured.
     */
    protected resolveCoAgentSystemPrompt(coAgent: MJAIAgentEntityExtended): CoAgentSystemPromptResolution {
        const engine = AIEngine.Instance;
        const agentPrompt = (engine.AgentPrompts ?? [])
            .filter(ap => UUIDsEqual(ap.AgentID, coAgent.ID) && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        if (!agentPrompt) {
            return { Text: '', PromptID: null };
        }
        const prompt = (engine.Prompts ?? []).find(p => UUIDsEqual(p.ID, agentPrompt.PromptID));
        return { Text: prompt?.TemplateText ?? '', PromptID: prompt?.ID ?? null };
    }

    /**
     * Formats the target agent's identity + capabilities block for the system prompt.
     *
     * @param target The target agent, or `null`.
     * @returns The formatted block, or empty string when no target resolved.
     */
    private formatTargetIdentity(target: MJAIAgentEntityExtended | null): string {
        if (!target) {
            return '';
        }
        const description = target.Description?.trim() ? target.Description.trim() : 'No description provided.';
        return `Target agent you are voicing for:\nName: ${target.Name}\nCapabilities: ${description}`;
    }

    /**
     * Formats prior conversation history as a plain-text block for the system prompt.
     *
     * @param messages The conversation messages, or undefined.
     * @returns The formatted history block, or empty string when there is none.
     */
    private formatConversationHistory(messages?: ChatMessage[]): string {
        if (!messages || messages.length === 0) {
            return '';
        }
        const lines = messages
            .map(m => {
                const text = typeof m.content === 'string' ? m.content : '';
                return text.trim().length > 0 ? `${m.role}: ${text}` : '';
            })
            .filter(line => line.length > 0);
        return lines.length > 0 ? `Conversation so far:\n${lines.join('\n')}` : '';
    }

    /**
     * Assembles the same memory/context block a loop agent injects, reusing
     * {@link AgentMemoryContextBuilder} so there is no duplicated retrieval logic. The builder
     * unshifts a system message onto a throwaway array, which we pull back out as plain text.
     *
     * @param input The prepare-session input.
     * @param coAgent The resolved co-agent.
     * @param contextUser The calling user.
     * @returns The concatenated context text (empty string when nothing was injected).
     */
    protected async assembleMemoryContext(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        contextUser: UserInfo
    ): Promise<string> {
        const lastUserMessage = (input.ConversationMessages ?? []).filter(m => m.role === 'user').pop();
        const inputText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
        const scratch: ChatMessage[] = [];

        const builder = new AgentMemoryContextBuilder();
        await builder.InjectContextMemory(
            inputText,
            coAgent,
            input.UserID || contextUser?.ID,
            input.CompanyID,
            contextUser,
            scratch,
            undefined,
            undefined,
            undefined,
            null
        );

        return scratch
            .map(m => (typeof m.content === 'string' ? m.content : ''))
            .filter(c => c.length > 0)
            .join('\n\n');
    }

    /**
     * Builds the stable, target-independent tool set every voice session exposes: the single
     * `invoke-target-agent` tool plus any caller-supplied extra tools. The target is a runtime
     * argument *inside* the call, never a per-target tool — this keeps the provider contract
     * identical across targets.
     *
     * @param extraTools Optional additional target-independent tools.
     * @returns The tools to register at session start.
     */
    protected buildStableToolSet(extraTools?: RealtimeToolDefinition[]): RealtimeToolDefinition[] {
        const invokeTarget: RealtimeToolDefinition = {
            Name: INVOKE_TARGET_AGENT_TOOL_NAME,
            Description:
                'Hand the user\'s request to the target agent to perform the actual work. Call this whenever ' +
                'real work (data lookup, analysis, actions) is required, then narrate progress while it runs.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    request: {
                        type: 'string',
                        description: 'The natural-language request to hand to the target agent.'
                    }
                },
                required: ['request']
            }
        };

        return extraTools && extraTools.length > 0 ? [invokeTarget, ...extraTools] : [invokeTarget];
    }

    /**
     * Builds the {@link RealtimeToolBroker} for a relayed tool call, wiring `DelegateToTarget` to a
     * target-agent run and `ExecuteTool` to a structured "not available" placeholder.
     *
     * @param input The relayed tool input.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The constructed broker.
     */
    protected buildToolBroker(
        input: ExecuteRelayedToolInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): RealtimeToolBroker {
        const deps: RealtimeToolBrokerDeps = {
            DelegateToTarget: (request) => this.delegateToTarget(input, request, contextUser, provider),
            ExecuteTool: (call) => this.executeNonTargetTool(call)
        };
        return new RealtimeToolBroker(deps);
    }

    /**
     * Delegates an `invoke-target-agent` call to the target agent via {@link AgentRunner.RunAgent}.
     *
     * Threads the broker-owned abort signal (combined with any caller signal) into the child run's
     * `cancellationToken`, links the child run to the co-agent run via `parentRunID`, and propagates
     * `agentSessionID` so both runs group under the same session. Mirrors
     * `BaseAgent.delegateRealtimeToTarget`.
     *
     * @param input The relayed tool input (target id + linkage).
     * @param request The broker's delegation request (call id + arguments + abort signal).
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The delegated result for the model's tool_response.
     */
    protected async delegateToTarget(
        input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<DelegatedResult> {
        const target = this.resolveTargetAgent(input.TargetAgentID);
        if (!target) {
            return {
                CallID: request.CallID,
                Success: false,
                Output: 'No target agent is configured for this voice session, so the request could not be performed.'
            };
        }

        try {
            const result = await this.runDelegatedAgent(input, request, target, contextUser, provider);
            const artifacts = await this.createDelegatedRunArtifacts(result, contextUser, provider);
            return this.buildDelegatedResult(request.CallID, result, artifacts);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { CallID: request.CallID, Success: false, Output: `Delegation failed: ${message}` };
        }
    }

    /**
     * Creates artifact(s) from a completed delegated run's payload — the voice-path equivalent of
     * the chat path's artifact step in `AgentRunner.RunAgentInConversation`. Delegated voice runs
     * execute via `AgentRunner.RunAgent` directly (no conversation detail), so without this step
     * they would never produce artifacts at all.
     *
     * Eligibility guards (all must hold, mirroring the chat path's `processArtifacts`):
     *  - the run succeeded and did NOT pause awaiting feedback (a paused run has no deliverable yet);
     *  - the run returned a non-empty payload.
     *
     * The DB work is delegated to {@link processRunArtifacts} (an overridable seam), which reuses
     * `AgentRunner.ProcessAgentArtifacts` — so ArtifactCreationMode, DefaultArtifactTypeID,
     * name extraction, and duplicate-version dedup all behave exactly as in chat. **Best-effort:**
     * any failure is logged and returns `undefined`; artifact surfacing never fails the delegation.
     *
     * @param result The delegated agent execution result.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The produced artifact descriptor(s), or `undefined` when none were created.
     */
    protected async createDelegatedRunArtifacts(
        result: ExecuteAgentResult,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<DelegatedRunArtifact[] | undefined> {
        const paused = result.agentRun?.Status === 'AwaitingFeedback';
        const payload = result.payload as Record<string, unknown> | null | undefined;
        const hasPayload = payload != null && Object.keys(payload).length > 0;
        if (!result.success || paused || !hasPayload) {
            return undefined;
        }
        try {
            return await this.processRunArtifacts(result, contextUser, provider);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RealtimeClientSessionService.createDelegatedRunArtifacts failed (delegation continues): ${message}`);
            return undefined;
        }
    }

    /**
     * The DB-backed artifact-creation seam: runs `AgentRunner.ProcessAgentArtifacts` WITHOUT a
     * conversation detail (the voice path has none — the artifact + version are created and the
     * junction link is skipped), then loads the artifact header for its display name.
     *
     * Artifacts whose Visibility resolved to `System Only` (the agent's ArtifactCreationMode) are
     * created but NOT surfaced to the overlay — matching how chat hides them from users.
     *
     * **Overridable seam** so tests can exercise {@link createDelegatedRunArtifacts}' eligibility
     * guards without a DB.
     *
     * @param result The delegated agent execution result (payload + agentRun).
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The produced artifact descriptor(s), or `undefined`.
     */
    protected async processRunArtifacts(
        result: ExecuteAgentResult,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<DelegatedRunArtifact[] | undefined> {
        const runner = new AgentRunner(provider);
        const info = await runner.ProcessAgentArtifacts(result, undefined, undefined, contextUser, provider);
        if (!info) {
            return undefined;
        }
        const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
        if (!(await artifact.Load(info.artifactId))) {
            return undefined;
        }
        if (artifact.Visibility === 'System Only') {
            return undefined; // created for system purposes, never user-surfaced
        }
        return [{ ArtifactID: info.artifactId, ArtifactVersionID: info.versionId, Name: artifact.Name }];
    }

    /**
     * Runs (or resumes) the target agent for a delegation. Threads the combined abort signal, parent
     * run linkage, session id, and the `OnProgress` callback so the resolver can stream progress.
     * When {@link ExecuteRelayedToolInput.ResumeRunID} is set, resumes that paused run via
     * `lastRunId` + `autoPopulateLastRunPayload` (the user's answer continues the same interactive
     * run) instead of starting fresh.
     *
     * @param input The relayed tool input (linkage, progress callback, optional resume id).
     * @param request The broker's delegation request (call id + arguments + abort signal).
     * @param target The resolved target agent.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The agent execution result.
     */
    private async runDelegatedAgent(
        input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest,
        target: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<ExecuteAgentResult> {
        const requestText = this.parseDelegateRequestText(request.Arguments);
        const parentRun = await this.loadParentRun(input.ParentRunID, contextUser, provider);
        const runner = new AgentRunner(provider);
        return runner.RunAgent({
            agent: target,
            conversationMessages: [{ role: 'user', content: requestText }],
            contextUser,
            provider,
            cancellationToken: this.combineSignals(request.AbortSignal, input.AbortSignal),
            parentRun: parentRun ?? undefined,
            agentSessionID: input.AgentSessionID,
            onProgress: input.OnProgress,
            lastRunId: input.ResumeRunID,
            autoPopulateLastRunPayload: input.ResumeRunID ? true : undefined
        });
    }

    /**
     * Maps an {@link ExecuteAgentResult} onto the broker's {@link DelegatedResult}, special-casing a
     * run that paused awaiting feedback. An `AwaitingFeedback` run is a valid intermediate outcome,
     * not an error: we return its clarifying QUESTION (the run's `Message`) as the tool Output —
     * phrased so the realtime model relays it as a question to the user — set `Success: true`, and
     * surface the paused run id so the resolver can resume that run on the user's next answer.
     *
     * @param callID The provider call id this result corresponds to.
     * @param result The agent execution result.
     * @param artifacts Artifacts the run produced (from {@link createDelegatedRunArtifacts}),
     *   threaded into the result so the broker serializes them for the call overlay.
     * @returns The delegated result for the model's tool_response.
     */
    private buildDelegatedResult(callID: string, result: ExecuteAgentResult, artifacts?: DelegatedRunArtifact[]): DelegatedResult {
        if (result.agentRun?.Status === 'AwaitingFeedback') {
            const question = result.agentRun.Message?.trim()
                || 'The target agent needs more information to continue.';
            return {
                CallID: callID,
                Success: true,
                Output: `You need an answer from the user before you can continue this work. Ask them, in your own first-person voice: ${question}`,
                PausedRunID: result.agentRun.ID,
                RunID: result.agentRun.ID
            };
        }
        return {
            CallID: callID,
            Success: result.success,
            Output: result.success
                ? (result.agentRun?.Message || 'The delegated work is complete. Share the outcome with the user in your own first-person voice.')
                : (result.agentRun?.ErrorMessage || 'The work could not be completed. Tell the user, in first person, that you hit a problem and offer a next step.'),
            RunID: result.agentRun?.ID,
            Artifacts: artifacts
        };
    }

    /**
     * Loads the co-agent run entity behind {@link ExecuteRelayedToolInput.ParentRunID} so the
     * delegated run can link to it via `parentRun` (→ `ParentRunID`). Returns `null` when no id was
     * supplied or the run cannot be loaded (delegation proceeds without parent linkage rather than
     * failing the whole call).
     *
     * @param parentRunID The co-agent run id, or undefined.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The loaded parent run entity, or `null`.
     */
    protected async loadParentRun(
        parentRunID: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<MJAIAgentRunEntityExtended | null> {
        if (!parentRunID) {
            return null;
        }
        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        return (await run.Load(parentRunID)) ? run : null;
    }

    /**
     * Routes a non-target tool call. For now this returns a structured "not available" result —
     * the richer client/UI/action routing is wired in a later phase. Documented minimal seam.
     *
     * @param call The non-target tool call.
     * @returns A failed {@link ToolExecutionResult} the model can narrate.
     */
    protected async executeNonTargetTool(call: RealtimeToolCall): Promise<ToolExecutionResult> {
        return {
            CallID: call.CallID,
            Success: false,
            Output: `Tool '${call.ToolName}' is not available in this voice session.`
        };
    }

    /**
     * Parses the natural-language request text out of an `invoke-target-agent` call's arguments.
     * Falls back to the raw argument string when it is not the expected `{ request: string }` JSON.
     *
     * @param argumentsJson The raw arguments string emitted by the model.
     * @returns The request text to hand to the target agent.
     */
    private parseDelegateRequestText(argumentsJson: string): string {
        try {
            const parsed = JSON.parse(argumentsJson) as { request?: unknown };
            if (typeof parsed.request === 'string') {
                return parsed.request;
            }
        } catch {
            /* not JSON — fall through to raw */
        }
        return argumentsJson;
    }

    /**
     * Combines the broker's per-call abort signal with an optional caller-supplied signal so either
     * source can cancel the delegated run. Returns the broker signal alone when no caller signal is
     * present (the common case), avoiding an unnecessary controller.
     *
     * @param brokerSignal The broker-owned per-call abort signal (always present).
     * @param callerSignal An optional caller signal (e.g. a request-scoped barge-in).
     * @returns A single abort signal that fires when either source aborts.
     */
    private combineSignals(brokerSignal: AbortSignal, callerSignal?: AbortSignal): AbortSignal {
        if (!callerSignal) {
            return brokerSignal;
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (brokerSignal.aborted || callerSignal.aborted) {
            controller.abort();
        } else {
            brokerSignal.addEventListener('abort', abort, { once: true });
            callerSignal.addEventListener('abort', abort, { once: true });
        }
        return controller.signal;
    }

    /**
     * The clear, actionable message returned when no usable Realtime model can be resolved.
     *
     * @returns The failure message.
     */
    private noModelMessage(): string {
        return (
            'No usable Realtime model could be resolved for the Realtime Co-Agent. Configure a model of ' +
            "AIModelType 'Realtime' with an active vendor DriverClass and a valid API key " +
            '(e.g. AI_VENDOR_API_KEY__<driver>).'
        );
    }
}
