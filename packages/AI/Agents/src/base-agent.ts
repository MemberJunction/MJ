/**
 * @fileoverview Base implementation of the MemberJunction AI Agent framework.
 * 
 * This module provides the core BaseAgent class that handles agent execution
 * using a hierarchical prompt system. Agents use their type's system prompt
 * as a parent prompt and their own configured prompts as child prompts,
 * enabling sophisticated agent behaviors through prompt composition.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { MJAIAgentTypeEntity,  MJTemplateParamEntity, MJActionParamEntity, MJAIAgentRelationshipEntity, MJAIAgentNoteEntity, MJAIAgentExampleEntity, MJConversationDetailEntity, MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity, FileStorageEngineBase } from '@memberjunction/core-entities';
import { MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended, MJAIPromptEntityExtended, MJAIAgentEntityExtended, MJAIModelEntityExtended, MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { UserInfo, Metadata, RunView, LogStatus, LogStatusEx, LogError, LogErrorEx, IsVerboseLoggingEnabled, IMetadataProvider, DatabaseProviderBase } from '@memberjunction/core';
import { AgentRunWatchdog } from './agent-run-watchdog';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ChatMessage, ChatMessageContent, ChatMessageContentBlock, AIErrorType, BaseRealtimeModel, GetAIAPIKey, IRealtimeSession, JSONObject, RealtimeSessionParams, RealtimeTranscript, RealtimeToolCall, RealtimeUsage } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { CopyScalarsAndArrays, JSONValidator, MJGlobal, SafeExpressionEvaluator, UUIDsEqual } from '@memberjunction/global';
import {
    RealtimeSessionRunner,
    RealtimeSessionRunnerDeps,
    DelegateToTargetRequest,
    DelegatedResult,
    ToolExecutionResult,
    RealtimeSessionResult
} from './realtime/realtime-session-runner';
import { ResolveNarrationInstructionsTemplate } from './realtime/realtime-narration';
import {
    BuildRealtimeOverridesJson,
    BuildVoiceMannerSection,
    GetNarrationPaceMs,
    GetProviderVoiceSettings,
    RealtimeCoAgentConfig,
    ResolveEffectiveRealtimeConfig
} from './realtime/realtime-coagent-config';
import { RealtimeClientSessionService, PrepareClientSessionInput } from './realtime/realtime-client-session-service';
import { BuildRealtimeAgentFraming } from './realtime/realtime-tool-broker';
import { RealtimeRecordingController, RealtimeRecordingMedia } from './realtime/realtime-recording-capture';
import { resolveRecordingStorageAccountID, storeRealtimeRecording } from './realtime/realtime-recording-store';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AgentMemoryContextBuilder } from './agent-memory-context-builder';
import { AgentPreExecutionRAGResult } from './agent-pre-execution-rag';
import {
    AIPromptParams,
    AIPromptRunResult,
    ChildPromptParam,
    ExecuteAgentParams,
    AgentContextData,
    AgentConfiguration,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    AgentAction,
    AgentSubAgentRequest,
    BaseAgentNextStep,
    MessageLifecycleCallback,
    MessageLifecycleEvent,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AIModelSelectionInfo,
    ConversationUtility,
    ActionChange,
    ActionChangeScope,
    SubAgentChange,
    MediaOutput,
    FileOutputRef,
    ParseFileOutputRef,
    SecondaryScopeConfig,
    SecondaryScopeValue,
    AgentResponseForm,
    AgentRequestAssignmentStrategy,
    parseAssignmentStrategy,
    mergeAssignmentStrategies,
    AgentClientToolInvocation,
    ClientToolResultSummary,
    ClientToolMetadata,
    InputArtifact,
    AgentPipelineRequest,
    initAgentRunStep,
    finalizeAgentRunStep,
    AgentRunStepSaveQueue
} from '@memberjunction/ai-core-plus';
import { MJActionEntityExtended, ActionResult, ActionParam, AIDirective } from '@memberjunction/actions-base';
import { AgentRunner } from './AgentRunner';
import { PayloadManager, PayloadManagerResult, PayloadChangeResultSummary } from './PayloadManager';
import { ScratchpadManager } from './ScratchpadManager';
import { ArtifactToolManager, ArtifactToolCall, StoredToolResult } from './ArtifactToolManager';
import { MemoryWriteManager, MemoryWriteRequest, MemoryWriteResult } from './MemoryWriteManager';
import {
    PipelineExecutor,
    PipelineToolRegistry,
    PipelineInvocable,
    PipelineExecutionResult,
    PipelineStage,
    ActionInvocable,
    ArtifactToolInvocable,
    BuildPipelineToolDocs,
    formatFinalOutput,
    summarizePipelineStages,
} from './pipeline';
import { AgentPayloadChangeRequest } from '@memberjunction/ai-core-plus';
import { AgentDataPreloader } from './AgentDataPreloader';
import { ClientToolRequestManager } from './ClientToolRequestManager';
import { ConversationMessageResolver } from './utils/ConversationMessageResolver';
import { ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';
import _ from 'lodash';

/**
 * Base iteration context for tracking loop execution in BaseAgent.
 * This is agent-type agnostic and handles both ForEach and While loops.
 */
/**
 * Compact representation of a single action's execution result, used for
 * building the markdown summary that goes into conversation messages.
 */
interface ActionResultSummary {
    actionName: string;
    success: boolean;
    params: ActionParam[];
    resultCode: string;
    message: string;
    aiDirectives?: AIDirective[];
}

interface BaseIterationContext {
    loopType: 'ForEach' | 'While';

    // ForEach specific
    collection?: any[];

    // While specific
    condition?: string;

    // Common (currentIndex used for both: array index for ForEach, iteration count for While)
    currentIndex: number;
    itemVariable: string;
    indexVariable?: string;
    maxIterations: number;
    continueOnError: boolean;
    delayBetweenIterationsMs?: number;
    results: any[];
    errors: any[];

    // Store the forEach or while config for re-execution
    loopConfig: ForEachOperation | WhileOperation;

    // Parent step ID for creating child iteration steps with ParentID link
    parentStepId?: string;

    // Action output mapping to apply after each iteration (Flow agents)
    actionOutputMapping?: string;


    // Agent-type specific data (e.g., Flow stores stepId here)
    agentTypeData?: any;
}

/**
 * Extended progress step that includes additional metadata for execution tracking
 */
type ExtendedProgressStep = Parameters<AgentExecutionProgressCallback>[0] & {
    /** Timestamp when this progress step was recorded */
    timestamp: Date;
    /** Hierarchy of agent names from root to current agent */
    agentHierarchy: string[];
    /** Depth of the current agent in the execution hierarchy */
    depth: number;
    /** Hierarchical step string (e.g., "2.1.3" for nested agents) */
    hierarchicalStep?: string;
};

/**
 * Base implementation for AI Agents in the MemberJunction framework.
 * 
 * The BaseAgent class provides the core execution logic for AI agents using
 * a hierarchical prompt system. It implements the following workflow:
 * 
 * 1. Loads the agent's type to get the system prompt configuration
 * 2. Validates that the agent type has a properly configured placeholder
 * 3. Loads the agent's first active prompt (ordered by ExecutionOrder)
 * 4. Gathers context data including sub-agents and available actions
 * 5. Executes the prompts hierarchically (system prompt as parent, agent prompt as child)
 * 6. Uses the agent type to determine the next step based on execution results
 * 
 * @class BaseAgent
 * @example
 * ```typescript
 * // Using with default context type (any)
 * const agent = new BaseAgent();
 * const result = await agent.Execute({
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser
 * });
 * 
 * // Using with typed context through ExecuteAgentParams
 * interface MyContext {
 *   apiKey: string;
 *   environment: 'dev' | 'prod';
 * }
 * 
 * const agent = new BaseAgent();
 * const params: ExecuteAgentParams<MyContext> = {
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser,
 *   context: {
 *     apiKey: 'abc123',
 *     environment: 'prod'
 *   }
 * };
 * const result = await agent.Execute(params);
 * ```
 */
/**
 * Maximum number of sub-agents to dispatch concurrently when a Loop agent
 * returns a `subAgents` array. Prevents a misbehaving LLM (or an over-eager
 * one) from saturating the model API / DB pool with N concurrent runs.
 */
const PARALLEL_SUBAGENT_CONCURRENCY_LIMIT = 5;

/**
 * Result envelope returned by `dispatchSingleSubAgentInParallel` — combines the
 * execution outcome with the metadata needed to merge results back into the
 * parent payload deterministically.
 */
interface ParallelSubAgentExecution<SR> {
    request: AgentSubAgentRequest<unknown>;
    result: ExecuteAgentResult<SR>;
    subAgentEntity: MJAIAgentEntityExtended;
    relationship?: MJAIAgentRelationshipEntity;
    /** Undefined only for synthetic entries representing an unresolved sub-agent. */
    stepEntity?: MJAIAgentRunStepEntityExtended;
    upstreamPaths: string[];
}

/**
 * Synchronously-prepared dispatch record for one parallel sub-agent. We resolve
 * the entity, push the delegation message, and emit progress BEFORE
 * `Promise.all` so the transcript order is deterministic and matches the
 * source order of the `subAgents` array.
 */
interface ParallelSubAgentDispatch {
    request: AgentSubAgentRequest<unknown>;
    subAgentEntity: MJAIAgentEntityExtended;
    relationship?: MJAIAgentRelationshipEntity;
}

/**
 * The agent-invariant "base" catalog cached (process-wide) on AIEngine and reused across runs/steps.
 * Holds the resolved sub-agents + actions and their formatted markdown, plus the base merged
 * agent-type prompt params (with NO runtime overrides applied). Runtime `actionChanges` /
 * `subAgentChanges` / `__agentTypePromptParams` overrides are layered on top per run from a clone.
 */
interface AgentBaseCatalog {
    /** Resolved active sub-agents (direct ParentID children + active relationships), de-duped. */
    uniqueActiveSubAgents: MJAIAgentEntityExtended[];
    subAgentCount: number;
    /** Markdown describing uniqueActiveSubAgents (the base set). */
    subAgentDetails: string;
    /** Actions matched to the agent's active AIAgentAction junctions, BEFORE filtering by action Status — needed as the input to applyActionChanges. */
    baseActionsRaw: MJActionEntityExtended[];
    /** baseActionsRaw filtered to Status='Active' — the fast-path effective action set. */
    activeActions: MJActionEntityExtended[];
    /** Markdown describing activeActions (the base set). */
    actionDetails: string;
    /** Agent-type prompt params merged from schema defaults + agent config (NO runtime overrides). */
    baseAgentTypePromptParams: Record<string, unknown>;
}

export class BaseAgent {
    /**
     * Maximum allowed validation retries before forcing failure.
     * @private
     */
    private static readonly MAX_VALIDATION_RETRIES = 10;

    /**
     * Maximum consecutive failed (non-terminating) steps before forcing termination.
     * Prevents infinite retry loops when an unclassified error repeatedly returns
     * terminate=false. Each successful step resets the counter.
     * @private
     */
    private static readonly MAX_CONSECUTIVE_FAILED_STEPS = 10;

    /**
     * Maximum consecutive *unproductive* retry steps before forcing termination.
     *
     * An unproductive retry is a 'Retry' next-step that carries an errorMessage — i.e. one
     * produced by {@link BaseAgentType.createRetryStep} because the model's output could not
     * be parsed or failed structural validation (e.g. the LLM returned conversational prose
     * instead of the required JSON envelope). These do NOT count as 'Failed' steps, so they
     * bypass {@link MAX_CONSECUTIVE_FAILED_STEPS} entirely and — without this guard — loop
     * until the far-higher absolute iteration cap (effectively forever, burning time and tokens).
     *
     * Legitimate yield/await retries (pipeline / client-tools / sub-agent re-entry) are created
     * via createNextStep('Retry', …) WITHOUT an errorMessage, so they do not increment this
     * counter. Any productive (non-unproductive-retry) step resets it.
     * @private
     */
    private static readonly MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES = 10;

    /**
     * Instance of AIPromptRunner used for executing hierarchical prompts.
     * @private
     */
    private _promptRunner: AIPromptRunner = new AIPromptRunner();

    /**
     * Fire-and-forget save orchestration for this run's observability step records: the create INSERT is
     * fired without blocking the agent flow (the PK is client-generated by `NewRecord()`), each finalize
     * UPDATE chains after its step's INSERT and force-persists (`IgnoreDirtyState`), and all pending saves
     * are flushed (`allSettled`) in {@link finalizeAgentRun}. The pattern lives once in
     * {@link AgentRunStepSaveQueue} (shared with `@memberjunction/computer-use-engine`'s step tracker).
     */
    private _stepSaveQueue = new AgentRunStepSaveQueue();

    /**
     * Active per-request metadata provider, set at the start of Execute().
     * Defaults to the global Metadata.Provider; overridden when a per-request
     * provider is passed through ExecuteAgentParams.provider for server isolation.
     * @private
     */
    private _activeProvider: IMetadataProvider = Metadata.Provider; // global-provider-ok: default until Execute() captures per-request provider

    /**
     * Returns the active metadata provider for this agent run. Subclasses MUST
     * use this getter (rather than `new Metadata()` or `Metadata.Provider`) so
     * that per-request provider isolation is preserved on the server.
     */
    protected get ProviderToUse(): IMetadataProvider {
        return this._activeProvider ?? Metadata.Provider;
    }

    /**
     * This is state information that is specific to the agent type. BaseAgent doesn't know what
     * this contains or care, it is just responsible for keeping this, giving the Agent Type the 
     * opportunity to initialize its state when a run starts, and passing the object along each 
     * time the Agent Type is called to do something such as DetermineNextStep()
     */
    private _agentTypeState: any = null;
    /**
     * Overridable accessor for the current agent instance's agent-type state
     */
    protected get AgentTypeState(): any {
        return this._agentTypeState;
    }

    private _agentTypeInstance: BaseAgentType;
    /**
     * Accessor for the agent's type instance
     */
    public get AgentTypeInstance(): BaseAgentType {
        return this._agentTypeInstance;
    }

    /**
     * Map to track execution counts for actions and sub-agents.
     * Key is the item ID (action ID or sub-agent ID), value is the count.
     * @private
     */
    private _executionCounts: Map<string, number> = new Map();

    /**
     * Callback for message lifecycle events (expiration, compaction, removal, expansion).
     * @private
     */
    private _messageLifecycleCallback: MessageLifecycleCallback | undefined;

    /**
     * Counter for validation-induced retries (when validation changes a step to Retry).
     * This is separate from FinalPayloadValidation retries.
     * @private
     */
    private _generalValidationRetryCount: number = 0;

    /**
     * Current agent run entity.
     * @private
     */
    private _agentRun: MJAIAgentRunEntityExtended | null = null;

    /**
     * Stores the ID of an AIAgentRequest created when a Chat step fires.
     * Populated by executeChatStep(), returned in ExecuteAgentResult.feedbackRequestId.
     * Only set for root agents (depth 0), not sub-agents.
     * @private
     */
    private _feedbackRequestId: string | null = null;

    private _resolvedStorageAccountId: string | null = null;

    /**
     * The resolved FileStorageAccount ID for this agent run. Set during Execute()
     * via the hierarchical resolution chain (Runtime → Agent → Category → Type → fallback).
     * Included in the ExecuteAgentResult so AgentRunner can route file artifact uploads.
     *
     * Subclasses can read this to customize storage behavior based on the resolved account.
     */
    protected get ResolvedStorageAccountId(): string | null {
        return this._resolvedStorageAccountId;
    }

    /**
     * Access the current run for the agent
     */
    public get AgentRun(): MJAIAgentRunEntityExtended | null {
        return this._agentRun;
    }

    /**
     * Gets the available configuration presets for an agent.
     * Returns semantic presets like "Fast", "Balanced", "High Quality" that users can choose from.
     * These are actual presets stored in the database with specific AIConfiguration references.
     *
     * @param agentId - The ID of the agent to get presets for
     * @returns Array of configuration presets sorted by Priority, or empty array if none configured
     *
     * @example
     * ```typescript
     * const agent = new ResearchAgent();
     * const presets = agent.GetConfigurationPresets('agent-uuid-here');
     * // Returns presets defined in database: [
     * //   { Name: 'Fast', DisplayName: 'Quick Draft', AIConfigurationID: 'fast-config-uuid', IsDefault: true },
     * //   { Name: 'HighQuality', DisplayName: 'Maximum Detail', AIConfigurationID: 'frontier-uuid', IsDefault: false }
     * // ]
     * // Note: If no presets configured, returns empty array - agent will use default behavior
     * ```
     */
    public GetConfigurationPresets(agentId: string) {
        if (!agentId) {
            return [];
        }
        return AIEngine.Instance.GetAgentConfigurationPresets(agentId);
    }

    /**
     * Gets the default configuration preset for an agent.
     *
     * @param agentId - The ID of the agent to get the default preset for
     * @returns The default preset, or undefined if none configured
     */
    public GetDefaultConfigurationPreset(agentId: string) {
        if (!agentId) {
            return undefined;
        }
        return AIEngine.Instance.GetDefaultAgentConfigurationPreset(agentId);
    }

    /**
     * Promotes media outputs to the agent's final outputs.
     * Call this method to add generated images, audio, or video to the agent's outputs.
     * These will be saved to AIAgentRunMedia and flow to ConversationDetailAttachment.
     *
     * @param mediaOutputs - Array of media outputs to promote
     * @since 3.1.0
     *
     * @example
     * ```typescript
     * // Promote images from action result
     * this.promoteMediaOutputs([{
     *   modality: 'Image',
     *   mimeType: 'image/png',
     *   data: base64Data,
     *   label: 'Generated Product Image'
     * }]);
     *
     * // Promote from prompt run media reference
     * this.promoteMediaOutputs([{
     *   promptRunMediaId: 'prompt-run-media-uuid',
     *   modality: 'Image',
     *   mimeType: 'image/png',
     *   label: 'AI Generated Visualization'
     * }]);
     * ```
     */
    public promoteMediaOutputs(mediaOutputs: MediaOutput[]): void {
        if (mediaOutputs && mediaOutputs.length > 0) {
            this._mediaOutputs.push(...mediaOutputs);
            this.logStatus(`📎 Promoted ${mediaOutputs.length} media output(s) to agent results`, true);
        }
    }

    /**
     * Gets the currently accumulated media outputs for this agent run.
     * @returns Array of promoted media outputs
     * @since 3.1.0
     */
    public get MediaOutputs(): MediaOutput[] {
        return [...this._mediaOutputs];
    }

    /**
     * Minimum size in characters for binary content to be extracted as a media reference.
     * Content smaller than this threshold is kept inline in action results.
     * Default: 10000 (~7.5KB when decoded from base64)
     * @private
     */
    private static readonly LARGE_BINARY_THRESHOLD = 10000;

    /**
     * Inspects a set of action output params for any value matching the FileOutputRef shape
     * (an object with `fileName`, `mimeType`, and either `fileData` or `fileId`).
     * Returns all matching FileOutputRef values found across all output params.
     *
     * Detection is shape-based, not name-based — actions can name their file output
     * parameter anything and it will still be detected.
     *
     * @param outputParams - The output parameters from an action result
     * @private
     * @since 5.22.0
     */
    private detectFileOutputs(outputParams: ActionParam[]): FileOutputRef[] {
        const results: FileOutputRef[] = [];
        for (const param of outputParams) {
            if (param.Value == null) continue;
            const ref = ParseFileOutputRef(param.Value);
            if (ref) results.push(ref);
        }
        return results;
    }

    /**
     * Intercepts large media content in action results and replaces with placeholder references.
     * This prevents context overflow when action results contain large base64 data (images, audio, video).
     *
     * Uses generic ValueType=MediaOutput detection from action metadata to identify media output params.
     *
     * Intercepted media is stored in `_mediaOutputs` with a generated `refId` and is **always
     * persisted** by `AgentRunner` — all media outputs are saved to `AIAgentRunMedia` +
     * `ConversationDetailAttachment` (which auto-pairs to an artifact via the server hook).
     * The `${media:<refId>}` placeholder injected into the action result keeps the LLM's
     * context window small; the LLM is told the media will be displayed automatically.
     *
     * @param actionParams - The output parameters from an action result
     * @param actionEntity - Optional action entity metadata for ValueType checking
     * @returns Sanitized parameters with large media content replaced by ${media:ref-id} placeholders
     * @private
     * @since 3.1.0
     */
    private interceptLargeBinaryContent(actionParams: ActionParam[], actionEntity?: MJActionEntityExtended): ActionParam[] {
        if (!actionParams || actionParams.length === 0) {
            return actionParams;
        }

        const sanitizedParams: ActionParam[] = [];

        for (const param of actionParams) {
            // Only process output params
            if (param.Type !== 'Output' && param.Type !== 'Both') {
                sanitizedParams.push(param);
                continue;
            }

            // Check if this param is marked as MediaOutput in action metadata
            // Note: 'MediaOutput' ValueType is added in v3.1.x migration.
            // Before CodeGen runs, this property may not exist on the entity type.
            const paramMetadata = actionEntity?.Params?.find(p => p.Name === param.Name);
            const valueType = paramMetadata?.ValueType as string | undefined;
            const isMediaOutputParam = valueType === 'MediaOutput';

            // Handle MediaOutput params (e.g., Generate Image action)
            if (isMediaOutputParam && Array.isArray(param.Value)) {
                const mediaItems = param.Value as MediaOutput[];
                const references: string[] = [];
                let extractedCount = 0;

                for (let i = 0; i < mediaItems.length; i++) {
                    const media = mediaItems[i];
                    // Only intercept if there's substantial data
                    if (media.data && media.data.length > BaseAgent.LARGE_BINARY_THRESHOLD) {
                        // Generate unique reference ID
                        const refId = `media-${Date.now().toString(36)}-${i}-${Math.random().toString(36).substring(2, 8)}`;

                        // Store in unified media outputs — always persisted by AgentRunner.
                        this._mediaOutputs.push({
                            ...media,
                            refId,
                        });

                        references.push(`\${media:${refId}}`);
                        extractedCount++;
                    }
                }

                if (extractedCount > 0) {
                    // Replace array with references
                    sanitizedParams.push({
                        Name: param.Name,
                        Type: param.Type,
                        Value: {
                            mediaReferences: references,
                            count: mediaItems.length,
                            note: `${extractedCount} media item(s) extracted and will be displayed to the user automatically.`
                        }
                    });
                    this.logStatus(`📦 Extracted ${extractedCount} ${param.Name} item(s) to media references`, true);
                    continue;
                }
            }

            // Fallback: Check for standalone Base64 strings in MediaOutput or other params
            if (typeof param.Value === 'string' && param.Value.length > BaseAgent.LARGE_BINARY_THRESHOLD) {
                // Check if it looks like base64 (no spaces, alphanumeric with +/=)
                const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
                if (isMediaOutputParam || base64Pattern.test(param.Value.substring(0, 1000))) {
                    const refId = `data-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

                    // Store in unified media outputs — always persisted by AgentRunner.
                    this._mediaOutputs.push({
                        modality: 'Image', // Default to image, could be enhanced with mime detection
                        mimeType: 'application/octet-stream',
                        data: param.Value,
                        label: `Media data from ${param.Name}`,
                        refId,
                    });

                    sanitizedParams.push({
                        Name: param.Name,
                        Type: param.Type,
                        Value: `\${media:${refId}}`
                    });
                    this.logStatus(`📦 Extracted large binary content from '${param.Name}' to media reference`, true);
                    continue;
                }
            }

            // Keep param as-is if no extraction needed
            sanitizedParams.push(param);
        }

        return sanitizedParams;
    }

    /**
     * Substitutes `${media:<refId>}` placeholders in a string with the actual
     * data URI (`data:<mime>;base64,<bytes>`) of the matching intercepted media item.
     *
     * Used for payload / actionable-command resolution at the terminal step, where the
     * LLM wants to embed image (or other media) data inline at a specific position in
     * its structured output rather than as a trailing attachment card. The string
     * variant of placeholder resolution; recursive walker lives in
     * {@link resolveMediaPlaceholdersInPayload}.
     *
     * This function only does substitution — it has no persistence side effects.
     *
     * @param text - The string that may contain media placeholders
     * @returns String with placeholders resolved to actual data URIs (or the original
     *          placeholder if the refId is unknown — defensive, shouldn't happen)
     * @private
     * @since 3.1.0
     */
    private resolveMediaPlaceholdersInString(text: string): string {
        // Fast path: nothing to resolve if there are no intercepted media items.
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!text || !hasRefIds) {
            return text;
        }

        // Match ${media:ref-id} pattern (lowercase letters, digits, dashes only —
        // matches the IDs generated by interceptLargeBinaryContent).
        const placeholderRegex = /\$\{media:([a-z0-9-]+)\}/g;

        return text.replace(placeholderRegex, (match, refId: string) => {
            const media = this._mediaOutputs.find(m => m.refId === refId);
            if (media?.data) {
                return `data:${media.mimeType};base64,${media.data}`;
            }
            // Unknown refId — leave the placeholder in place rather than emit a broken
            // data URI. Defensive; this branch should not fire in normal flow.
            this.logStatus(`⚠️ Media reference '${refId}' not found in registry`, true);
            return match;
        });
    }

    /**
     * Resolves `${media:<refId>}` placeholders anywhere inside an arbitrary payload.
     *   - Strings: resolves placeholders directly
     *   - Objects: recursively processes every string property
     *   - Arrays:  recursively processes every element
     *
     * Pure resolution — no persistence side effects.
     *
     * @param payload - The payload that may contain media placeholders in string values
     * @returns Payload with all placeholders resolved to actual data URIs
     * @private
     * @since 3.1.0
     */
    private resolveMediaPlaceholdersInPayload<T>(payload: T): T {
        // Fast path: nothing to resolve if no intercepted media exists.
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!hasRefIds) {
            return payload;
        }
        return this.resolveMediaPlaceholdersRecursive(payload);
    }

    /**
     * Recursively resolves media placeholders in any value.
     * @private
     */
    private resolveMediaPlaceholdersRecursive<T>(value: T): T {
        if (value === null || value === undefined) {
            return value;
        }

        // Handle strings directly
        if (typeof value === 'string') {
            return this.resolveMediaPlaceholdersInString(value) as T;
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return value.map(item => this.resolveMediaPlaceholdersRecursive(item)) as T;
        }

        // Handle objects
        if (typeof value === 'object') {
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(value as object)) {
                result[key] = this.resolveMediaPlaceholdersRecursive((value as Record<string, unknown>)[key]);
            }
            return result as T;
        }

        // Return primitives (numbers, booleans) as-is
        return value;
    }

    /**
     * Agent hierarchy for display purposes (e.g., ["Marketing Agent", "Copywriter Agent"]).
     * Tracked separately as it's display-only and doesn't need persistence.
     * @private
     */
    private _agentHierarchy: string[] = [];

    /**
     * Current iteration context for ForEach/While loops.
     * Only one active loop per BaseAgent instance (nested loops handled by sub-agent instances).
     * @private
     */
    private _iterationContext: BaseIterationContext | null = null;

    /**
     * Current depth in the agent hierarchy (0 = root agent, 1 = first sub-agent, etc.).
     * @private
     */
    private _depth: number = 0;

    /**
     * Parent step counts from root to immediate parent.
     * Example: [2, 1] means root agent is at step 2, parent agent is at step 1.
     * Used to build hierarchical step display (e.g., "2.1.3" for nested agents).
     * @private
     */
    private _parentStepCounts: number[] = [];


    /**
     * All progress steps including intermediate ones for complete execution tracking.
     * @private
     */
    private _allProgressSteps: ExtendedProgressStep[] = [];

    /**
     * Sub-agent execution results.
     * @private
     */
    private _subAgentRuns: ExecuteAgentResult[] = [];

    /**
     * Accumulated media outputs that agents have explicitly promoted.
     * These are collected during agent execution and returned in ExecuteAgentResult.mediaOutputs.
     * Stored to AIAgentRunMedia when the agent completes.
     * @private
     * @since 3.1.0
     */
    private _mediaOutputs: MediaOutput[] = [];

    /**
     * Accumulated file outputs (PDF, Excel, Word, etc.) produced by file-generation actions.
     * Detected from the FileOutput output param after each action executes.
     * Returned in ExecuteAgentResult.fileOutputs for processing by AgentRunner into MJ: Artifacts.
     * @private
     * @since 5.22.0
     */
    private _fileOutputs: FileOutputRef[] = [];

    // ───────────────────────── Sub-class state accessors ──────────────────────────
    // Read-only `protected` getters so driver sub-classes (e.g. Skip) can inspect
    // the current run's state without being able to corrupt internal invariants.
    // Mutations still flow through the framework's own methods (createStepEntity,
    // queueStepSave, incrementExecutionCount, etc.).
    // (`AgentRun` and `MediaOutputs` are already public getters above; the
    // accessors below cover state that previously had no external surface.)

    /** Depth of this agent in the execution hierarchy (0 = root). @protected */
    protected get Depth(): number { return this._depth; }

    /** Agent name hierarchy from root to current (e.g. `['Sage', 'Skip', 'Researcher']`). @protected */
    protected get AgentHierarchy(): readonly string[] { return this._agentHierarchy; }

    /** Parent step counts used to build the `2.1.3` hierarchical step label. @protected */
    protected get ParentStepCounts(): readonly number[] { return this._parentStepCounts; }

    /**
     * Accumulated file outputs (PDF, Excel, Word, etc.) produced this run.
     * Mirrors the existing `MediaOutputs` accessor pattern but is scoped to
     * driver sub-classes since it's a more internal collection.
     * @protected
     */
    protected get FileOutputs(): FileOutputRef[] { return this._fileOutputs; }

    /**
     * Payload manager for handling payload access control.
     * @private
     */
    private _payloadManager: PayloadManager = new PayloadManager();

    /**
     * Scratchpad manager for private agent working memory (notes + task list).
     * Instantiated per agent run, garbage collected when the run ends.
     * @private
     * @since 2.46.0
     */
    private _scratchpadManager: ScratchpadManager = new ScratchpadManager();

    /**
     * Manages artifact tools for the current agent run.
     * Allows agents to explore input artifacts on demand.
     */
    private _artifactToolManager: ArtifactToolManager = new ArtifactToolManager();

    /**
     * Manages in-flight durable memory writes for the current agent run.
     * Only consulted when the agent has AllowMemoryWrite enabled.
     */
    private _memoryWriteManager: MemoryWriteManager = new MemoryWriteManager();

    /**
     * Effective actions available to this agent after applying actionChanges.
     * Populated during gatherPromptTemplateData() and used for validation in executeActionsStep().
     * @private
     * @since 2.123.0
     */
    private _effectiveActions: MJActionEntityExtended[] = [];

    /**
     * Counts only prompt (LLM) executions, NOT all agent steps.
     * Used for message expiration age calculations so that `expirationTurns`
     * semantically means "number of LLM calls" rather than "number of steps"
     * (which includes actions, loops, sub-agents, etc.).
     *
     * Without this, a ForEach loop over 100 items would bump the step counter
     * by 100, causing messages to expire far too early even though only one
     * prompt execution occurred after them.
     */
    private _promptTurnCount: number = 0;

    /**
     * Execution limits for dynamically added actions.
     * Maps action IDs to their MaxExecutionsPerRun limit.
     * Populated during gatherPromptTemplateData() when actionChanges include actionLimits.
     * @private
     * @since 2.124.0
     */
    private _dynamicActionLimits: Record<string, number> = {};

    /**
     * Counter for tracking validation retry attempts during FinalPayloadValidation.
     * Reset at the start of each agent run.
     * @private
     */
    private _validationRetryCount: number = 0;

    /**
     * Counter tracking the number of context recovery attempts made in this run.
     * Context recovery removes/compacts old messages when context length is exceeded.
     * Reset at the start of each agent run.
     * @private
     */
    private _contextRecoveryAttempts: number = 0;

    /**
     * Maximum number of context recovery attempts allowed per agent run.
     * @private
     */
    private readonly MAX_RECOVERY_ATTEMPTS: number = 1;

    /**
     * Gets the current validation retry count for the agent run.
     * This count tracks how many times the agent has retried validation
     * during the FinalPayloadValidation step.
     * @readonly
     */
    public get ValidationRetryCount(): number {
        return this._validationRetryCount;
    }

    /**
     * Helper method for status logging with verbose control
     * @param message The message to log
     * @param verboseOnly Whether this is a verbose-only message
     * @param params Optional agent execution parameters for custom verbose check
     */
    protected logStatus(message: string, verboseOnly: boolean = false, params?: ExecuteAgentParams): void {
        if (verboseOnly) {
            LogStatusEx({
                message,
                verboseOnly: true,
                isVerboseEnabled: () => params?.verbose === true || IsVerboseLoggingEnabled()
            });
        } else {
            LogStatus(message);
        }
    }

    /**
     * Helper method for enhanced error logging with metadata
     */
    protected logError(error: Error | string, options?: {
        category?: string;
        metadata?: Record<string, any>;
        agent?: MJAIAgentEntityExtended;
        agentType?: MJAIAgentTypeEntity;
        severity?: 'warning' | 'error' | 'critical';
    }): void {
        const errorMessage = error instanceof Error ? error.message : error;
        const errorObj = error instanceof Error ? error : undefined;
        
        const metadata: Record<string, any> = {
            ...options?.metadata
        };
        
        // Add agent information if available
        if (options?.agent) {
            metadata.agentId = options.agent.ID;
            metadata.agentName = options.agent.Name;
        }
        
        // Add agent type information if available
        if (options?.agentType) {
            metadata.agentTypeId = options.agentType.ID;
            metadata.agentTypeName = options.agentType.Name;
        }
        
        LogErrorEx({
            message: errorMessage,
            error: errorObj,
            category: options?.category || 'BaseAgent',
            severity: options?.severity || 'error',
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined
        });
    }

    /**
     * Wrapper for progress callbacks that captures all progress events.
     * @private
     */
    private wrapProgressCallback(originalCallback?: AgentExecutionProgressCallback): AgentExecutionProgressCallback | undefined {
        if (!originalCallback) return undefined;

        return (progress) => {
            // Preserve hierarchical step if already calculated by a child agent
            // Otherwise, build it using this agent's parent step counts
            const hierarchicalStep = progress.metadata?.hierarchicalStep as string | undefined
                ?? this.buildHierarchicalStep(
                    progress.metadata?.stepCount as number,
                    this._parentStepCounts
                );

            // Capture all progress events
            this._allProgressSteps.push({
                ...progress,
                timestamp: new Date(),
                agentHierarchy: this._agentHierarchy || [],
                depth: this._depth || 0,
                hierarchicalStep
            });

            // Include agent run and hierarchical step in metadata if available
            try {
                const enhancedProgress = {
                    ...progress,
                    metadata: {
                        ...progress.metadata,
                        agentRun: this._agentRun,
                        hierarchicalStep
                    }
                };

                // Call original callback with enhanced progress
                originalCallback(enhancedProgress);
            }
            catch (e) {
                this.logError(`Failed to enhance progress with agent run: ${e instanceof Error ? e.message : e}`, {
                    category: 'ProgressEnhancement',
                    metadata: {
                        progress: progress,
                        agentRunId: this._agentRun?.ID || 'N/A'
                    }
                });     

                // Call original callback without enhancement
                originalCallback(progress);
            }
        };
    }

    /**
     * This overridable method is responsible for setting up any necessary one-time initalization of the
     * agent type. The base class sets up the AgentTypeInstance and also lets that agent type initialize
     * its state.
     * @param params
     */
    protected async initializeAgentType(params: ExecuteAgentParams, config: AgentConfiguration) {
        this._agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        this._agentTypeState = await this._agentTypeInstance.InitializeAgentTypeState(params);
    }

    /**
     * Preloads data sources configured for the agent.
     *
     * This method loads data from RunView or RunQuery sources as configured in
     * AIAgentDataSource metadata and merges it with caller-provided data, context, and payload.
     * Data sources can target three destinations:
     * - Data: For Nunjucks templates in prompts (visible to LLMs)
     * - Context: For actions only (NOT visible to LLMs)
     * - Payload: For agent state initialization
     *
     * Caller-provided values always take precedence over preloaded values.
     *
     * @param params - The execution parameters
     * @private
     */
    private async preloadAgentData(params: ExecuteAgentParams): Promise<void> {
        // Skip if disabled
        if (params.disableDataPreloading === true) {
            this.logStatus(`⏭️  Data preloading disabled for agent '${params.agent.Name}'`, true, params);
            return;
        }

        try {
            // Load preloaded data using the singleton service
            const preloadedResult = await AgentDataPreloader.Instance.PreloadAgentData(
                params.agent.ID,
                params.contextUser,
                this._agentRun?.ID
            );

            const totalSources =
                Object.keys(preloadedResult.data).length +
                Object.keys(preloadedResult.context).length +
                Object.keys(preloadedResult.payload).length;

            // Only create a step if there was any preloading activity (loaded or failed)
            const hadActivity = totalSources > 0 || preloadedResult.failedSources.length > 0;

            if (totalSources > 0) {
                const destinations: string[] = [];
                if (Object.keys(preloadedResult.data).length > 0) {
                    destinations.push(`data(${Object.keys(preloadedResult.data).length})`);
                }
                if (Object.keys(preloadedResult.context).length > 0) {
                    destinations.push(`context(${Object.keys(preloadedResult.context).length})`);
                }
                if (Object.keys(preloadedResult.payload).length > 0) {
                    destinations.push(`payload(${Object.keys(preloadedResult.payload).length})`);
                }

                this.logStatus(
                    `📊 Preloaded ${totalSources} data source(s) for agent '${params.agent.Name}': ${destinations.join(', ')}`,
                    true,
                    params
                );

                // Merge with existing data/context/payload (caller values take precedence).
                // IMPORTANT: Do NOT spread params.context — it may be a class instance
                // whose getters/methods would be destroyed by spreading into a plain object.
                // Instead, copy preloaded properties onto the existing context object.
                params.data = {
                    ...preloadedResult.data,
                    ...params.data
                };

                if (preloadedResult.context && typeof preloadedResult.context === 'object') {
                    if (!params.context || typeof params.context !== 'object') {
                        params.context = preloadedResult.context;
                    } else {
                        // Copy preloaded properties onto the existing context without
                        // replacing it, so class identity (prototype, getters) is preserved.
                        for (const key of Object.keys(preloadedResult.context)) {
                            if (!(key in params.context)) {
                                (params.context as Record<string, unknown>)[key] = (preloadedResult.context as Record<string, unknown>)[key];
                            }
                        }
                    }
                }

                params.payload = {
                    ...preloadedResult.payload,
                    ...params.payload
                };
            } else if (!hadActivity) {
                this.logStatus(`📭 No data sources configured for agent '${params.agent.Name}'`, true, params);
                return; // No step needed when there are no data sources at all
            }

            // Create a step entity to track data preloading in the agent run
            const stepEntity = await this.createStepEntity({
                stepType: 'Validation',
                stepName: 'Data Source Preloading',
                contextUser: params.contextUser
            });

            // Surface any data source failures in the agent run step and agent run record
            if (preloadedResult.failedSources.length > 0) {
                const failureDetails = preloadedResult.failedSources
                    .map(f => `${f.name}${f.entityName ? ` (Entity: ${f.entityName})` : ''}: ${f.errorMessage}`)
                    .join('; ');

                const warningMessage = `${preloadedResult.failedSources.length} data source(s) failed to load: ${failureDetails}`;

                // Finalize step as completed but with error details captured
                await this.finalizeStepEntity(stepEntity, true, warningMessage, {
                    loadedSources: preloadedResult.loadedSources,
                    failedSources: preloadedResult.failedSources
                });

                // Append warning to the agent run's ErrorMessage for top-level visibility
                if (this._agentRun) {
                    const existing = this._agentRun.ErrorMessage || '';
                    this._agentRun.ErrorMessage = existing
                        ? `${existing}\n\n[Data Preloading Warning] ${warningMessage}`
                        : `[Data Preloading Warning] ${warningMessage}`;
                    await this._agentRun.Save();
                }
            } else {
                // All sources loaded successfully
                await this.finalizeStepEntity(stepEntity, true, undefined, {
                    loadedSources: preloadedResult.loadedSources
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log error but don't fail the agent run
            this.logError(`Failed to preload data for agent '${params.agent.Name}': ${errorMessage}`, {
                agent: params.agent,
                category: 'DataPreloading',
                severity: 'warning'
            });
        }
    }

    /**
     * Executes an AI agent using hierarchical prompt composition.
     * 
     * This method orchestrates the entire agent execution process, from loading
     * configuration to executing prompts and determining next steps. It ensures
     * all required metadata is present and handles errors gracefully.
     * 
     * @param {ExecuteAgentParams} params - Parameters for agent execution
     * @param {MJAIAgentEntityExtended} params.agent - The agent entity to execute
     * @param {ChatMessage[]} params.conversationMessages - Conversation history
     * @param {UserInfo} [params.contextUser] - Optional user context
     * @param {any} [params.context] - Optional context object passed to sub-agents and actions
     * @template C - The type of the agent's context as provided in the ExecuteAgentParams
     * @template R - The type of the agent's result as returned in ExecuteAgentResult
     * 
     * @returns {Promise<ExecuteAgentResult>} Result containing next step and any output
     * 
     * @throws {Error} Throws if there are issues loading required entities
     * 
     * @example
     * ```typescript
     * const result = await agent.Execute({
     *   agent: salesAgent,
     *   conversationMessages: [{role: 'user', content: 'Help me find products'}],
     *   contextUser: currentUser
     * });
     * ```
     */
    /**
     * Engine-default wall-clock timeout applied to any agent run whose
     * `ExecuteAgentParams.maxExecutionTimeMs` is not set. Sub-classes can
     * override to globally change the default. Intentionally generous
     * (2 hours) — tighten per-run for interactive scenarios.
     */
    protected get DefaultAgentTimeoutMS(): number {
        return 2 * 60 * 60 * 1000;
    }

    public async Execute<C = any, R = any>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        // Capture per-request provider for the duration of this execution so all entity
        // saves go through the isolated provider, never the global singleton's transaction.
        this._activeProvider = params.provider ?? Metadata.Provider;

        // =====================================================================================
        // UNIVERSAL WALL-CLOCK TIMEOUT
        //
        // We chain any caller-supplied `cancellationToken` with an internal
        // AbortController that fires after `maxExecutionTimeMs` (falling back
        // to `DefaultAgentTimeoutMS`). The chained signal replaces
        // `params.cancellationToken` for the duration of the run, so every
        // existing cancellation check in the body of Execute sees the merged
        // abort condition — whether it came from the caller, the timeout, or
        // both.
        //
        // Actions invoked from this agent carry their own AbortSignal on
        // `RunActionParams.AbortSignal` (see ActionEngine.RunAction) and are
        // unaffected by this wrapper — their timeout budget is independent.
        // =====================================================================================
        const agentTimeoutMS = params.maxExecutionTimeMs ?? this.DefaultAgentTimeoutMS;
        const upstreamToken = params.cancellationToken;
        const timeoutController = new AbortController();
        const relayUpstreamAbort = () => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(upstreamToken?.reason ?? 'upstream cancellation');
            }
        };
        if (upstreamToken) {
            if (upstreamToken.aborted) {
                relayUpstreamAbort();
            } else {
                upstreamToken.addEventListener('abort', relayUpstreamAbort, { once: true });
            }
        }
        const timeoutId = setTimeout(() => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(
                    `Agent '${params.agent.Name}' exceeded maxExecutionTimeMs (${agentTimeoutMS}ms)`
                );
            }
        }, agentTimeoutMS);
        // Route the merged signal back through `params` so the existing body of
        // Execute (and downstream sub-agent invocations that propagate
        // `cancellationToken`) observe it.
        params.cancellationToken = timeoutController.signal;

        try {
            this.logStatus(`🤖 Starting execution of agent '${params.agent.Name}'`, true, params);

            // =====================================================================================
            // LATENCY OPTIMIZATION (Opt #4): Parallelized initialization sequence.
            //
            // The agent initialization pipeline was originally fully sequential: each operation
            // awaited before the next began, even when there were no data dependencies between
            // them. This added ~150-200ms of unnecessary serial wait time.
            //
            // The restructured pipeline uses 4 phases:
            //
            //   PRE-WORK (sync/fast): Parameter wrapping, markup conversion, payload init,
            //     cancellation check, payload validation (may exit early).
            //
            //   PHASE 1 (parallel): Permission check + Engine init + AgentRun creation.
            //     These three are mutually independent. If permission fails, we mark the
            //     already-created AgentRun as failed and terminate — the wasted run record
            //     is a negligible cost vs. the ~150ms saved by not serializing these.
            //
            //   PHASE 2 (parallel): Config load + Data preload + Context memory injection.
            //     All three depend on Phase 1 completing (engines loaded, agentRun exists)
            //     but NOT on each other. Config load reads from AIEngine's in-memory cache.
            //     Data preload fetches agent data sources. Context memory loads notes/examples
            //     and injects them into the conversation messages.
            //
            //   PHASE 3 (sequential): Agent type initialization — must wait for config from
            //     Phase 2 because it needs the resolved agent type and prompt configuration.
            //
            // Original total init time: ~sum of all operations (~400-500ms)
            // Optimized: ~max(Phase1) + max(Phase2) + Phase3 (~200-300ms)
            // =====================================================================================

            // --- PRE-WORK: Fast synchronous setup and early-exit checks ---

            // Wrap the progress callback to capture all events
            const wrappedParams = {
                ...params,
                onProgress: this.wrapProgressCallback(params.onProgress)
            };

            // Convert UI markup in conversation messages to plain text if requested (default: true)
            if (params.convertUIMarkupToPlainText !== false) {
                this.convertUIMarkupInMessages(wrappedParams.conversationMessages);
            }

            // Reset scratchpad and artifact tools for each new execution (ephemeral per run)
            this._scratchpadManager.Clear();
            this._artifactToolManager.Clear();
            this._memoryWriteManager.Clear();

            // Initialize artifact tools with any input artifacts attached to the run.
            // Artifacts arrive as a typed first-class field on ExecuteAgentParams —
            // they are NOT routed through `data` because prompt-template rendering
            // would otherwise serialize artifact bodies into the LLM payload. Only
            // the manifest (injected via _ARTIFACT_MANIFEST below) reaches the LLM.
            const inputArtifacts: InputArtifact[] | undefined = wrappedParams.inputArtifacts;
            if (inputArtifacts?.length) {
                this._artifactToolManager.Initialize(inputArtifacts);
                this.logStatus(`[ArtifactTools] Initialized with ${inputArtifacts.length} artifact(s): ${inputArtifacts.map(a => `${a.typeName}:"${a.name}"`).join(', ')}`, true, params);
            } else {
                this.logStatus(`[ArtifactTools] No input artifacts found for this run`, true, params);
            }

            // Initialize starting payload — must complete before AgentRun creation since the
            // run record stores the starting payload snapshot.
            await this.initializeStartingPayload(wrappedParams);

            // Check for cancellation at start
            if (params.cancellationToken?.aborted) {
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled before start`, true, params);
                return await this.createCancelledResult('Cancelled before execution started', params.contextUser);
            }

            // Handle starting payload validation if configured — may return early with a
            // validation failure result, so we run this before launching expensive parallel work.
            const startingValidationResult = await this.handleStartingPayloadValidation(wrappedParams);
            if (startingValidationResult) {
                return startingValidationResult;
            }

            // Report initialization progress
            wrappedParams.onProgress?.({
                step: 'initialization',
                message: this.formatHierarchicalMessage(`Initializing ${params.agent.Name} agent and preparing execution environment`),
                metadata: {
                    stepCount: 0,
                    hierarchicalStep: this.buildHierarchicalStep(0, this._parentStepCounts)
                }
            });

            // --- PHASE 1: Permission check + Engine init + AgentRun creation (parallel) ---
            // These three operations have zero data dependencies on each other:
            // - Permission check queries the AIAgentPermission entity
            // - Engine init calls AIEngine.Instance.Config() and ActionEngineServer.Instance.Config()
            // - AgentRun creation inserts a new AIAgentRun record
            //
            // If permission check fails, we mark the AgentRun as failed. This is acceptable:
            // an orphaned "failed" run record is harmless and far cheaper than serializing these
            // three operations (~150ms savings).
            const [canRun] = await Promise.all([
                AIAgentPermissionHelper.HasPermission(params.agent.ID, params.contextUser, 'run'),
                this.initializeEngines(params.contextUser),
                this.initializeAgentRun(wrappedParams)
            ]);

            if (!canRun) {
                // Permission denied — mark the already-created AgentRun as failed so it doesn't
                // appear as a phantom "running" record in the UI.
                const errorMessage = `User ${params.contextUser.Email} does not have permission to run agent '${params.agent.Name}' (ID: ${params.agent.ID})`;
                this.logStatus(`🚫 ${errorMessage}`, false, params);
                if (this._agentRun) {
                    this._agentRun.Status = 'Failed';
                    this._agentRun.ErrorMessage = errorMessage;
                    await this._agentRun.Save();
                }
                throw new Error(errorMessage);
            }

            // Reset per-run state (sync, instant — no parallelization needed)
            this._validationRetryCount = 0;
            this._generalValidationRetryCount = 0;
            this._contextRecoveryAttempts = 0;
            this._effectiveActions = [];
            this._dynamicActionLimits = {};
            this._mediaOutputs = [];
            this._messageLifecycleCallback = params.onMessageLifecycle;

            // Resolve storage account for file artifacts
            this._resolvedStorageAccountId = await this.getStorageAccountID(wrappedParams);

            // Check for cancellation after Phase 1
            if (params.cancellationToken?.aborted) {
                return await this.createCancelledResult('Cancelled during initialization', params.contextUser);
            }

            // Report validation progress
            wrappedParams.onProgress?.({
                step: 'validation',
                message: this.formatHierarchicalMessage('Validating agent configuration and loading prompts'),
                metadata: {
                    stepCount: 0,
                    hierarchicalStep: this.buildHierarchicalStep(0, this._parentStepCounts)
                }
            });

            // Validate agent — may return early with a failure result. Runs after engines are
            // initialized (Phase 1) since validation may inspect AIEngine metadata.
            const validationResult = await this.validateAgentWithTracking(params.agent, params.contextUser);
            if (validationResult) return validationResult;

            // --- PHASE 2: Config load + Data preload + Context memory injection (parallel) ---
            // All three depend on Phase 1 completing (engines initialized, agentRun exists) but
            // have no dependencies on each other:
            // - Config load reads agent type, prompts, and agent prompts from AIEngine's in-memory
            //   cache — typically < 5ms but async due to potential Config() refresh.
            // - Data preload fetches agent data sources and creates a tracking step entity.
            // - Context memory resolves scope configuration (pure computation), then loads notes
            //   and examples from the DB and injects them into conversation messages.
            this.logStatus(`📋 Loading configuration for agent '${params.agent.Name}'`, true, params);

            // Pre-compute scope configuration for context memory injection (pure computation,
            // no I/O — safe to do before launching the parallel phase).
            const userId = params.userId || params.contextUser?.ID;
            const companyId = params.companyId;
            const lastUserMessage = params.conversationMessages.filter(m => m.role === 'user').pop();
            const inputText = lastUserMessage?.content || '';

            const scopeConfigJson = params.agent.ScopeConfig;
            let scopeConfig: SecondaryScopeConfig | null = null;
            if (scopeConfigJson) {
                try { scopeConfig = JSON.parse(scopeConfigJson); } catch { /* ignore bad JSON */ }
            }

            const primaryScopeEntityName = params.PrimaryScopeEntityName ?? (params.data?.PrimaryScopeEntityName as string | undefined);
            const primaryScopeRecordId = params.PrimaryScopeRecordID ?? (params.data?.PrimaryScopeRecordID as string | undefined);
            const secondaryScopes = params.SecondaryScopes ?? (params.data?.SecondaryScopes as Record<string, SecondaryScopeValue> | undefined);

            let primaryScopeEntityId: string | undefined;
            if (primaryScopeEntityName) {
                const primaryEntity = this.ProviderToUse.EntityByName(primaryScopeEntityName);
                if (primaryEntity) {
                    primaryScopeEntityId = primaryEntity.ID;
                }
            }

            const [config] = await Promise.all([
                this.loadAgentConfiguration(params.agent),
                this.preloadAgentData(wrappedParams),
                this.InjectContextMemory(
                    typeof inputText === 'string' ? inputText : '',
                    params.agent,
                    userId,
                    companyId,
                    params.contextUser,
                    wrappedParams.conversationMessages,
                    primaryScopeEntityId,
                    primaryScopeRecordId,
                    secondaryScopes,
                    scopeConfig
                ),
                this.InjectPreExecutionRAG(
                    typeof inputText === 'string' ? inputText : '',
                    params.agent,
                    params.contextUser,
                    wrappedParams.conversationMessages,
                    params.conversationMessages,
                    primaryScopeEntityId,
                    primaryScopeRecordId,
                    secondaryScopes,
                    params.payload
                )
            ]);

            if (!config.success) {
                this.logError(`Failed to load agent configuration: ${config.errorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration'
                });
                return await this.createFailureResult(config.errorMessage || 'Failed to load agent configuration', params.contextUser);
            }

            // --- PHASE 3: Agent type initialization (sequential) ---
            // Must wait for config from Phase 2 because it needs the resolved agent type and
            // prompt configuration to initialize the type-specific state machine.
            await this.initializeAgentType(wrappedParams, config);

            // =====================================================================================
            // SESSION-DRIVEN BRANCH (Realtime agent type)
            //
            // For session-driven agent types (the Realtime / Realtime Co-Agent type, marked by
            // `IsSessionDriven === true`), we do NOT enter the iterative reasoning loop. Instead we
            // hand control to a RealtimeSessionRunner that drives a long-lived duplex model session.
            //
            // This is the ONLY entry point into the realtime path. Loop and Flow agent types do not
            // expose `IsSessionDriven`, so `isSessionDrivenAgentType(...)` returns false for them and
            // their execution falls through to `executeAgentInternal` below — byte-for-byte unchanged.
            // =====================================================================================
            if (this.isSessionDrivenAgentType(this.AgentTypeInstance)) {
                this.logStatus(`🎙️ Agent '${params.agent.Name}' is session-driven — routing to RealtimeSessionRunner`, true, params);
                return await this.executeRealtimeSession<R>(wrappedParams, config);
            }

            // Execute the agent's internal logic with wrapped parameters
            this.logStatus(`🚀 Executing agent '${params.agent.Name}' internal logic`, true, params);
            const executionResult = await this.executeAgentInternal<R>(wrappedParams, config);
            
            // Report finalization progress
            wrappedParams.onProgress?.({
                step: 'finalization',
                metadata: {
                    result: executionResult,
                    stepCount: executionResult.stepCount,
                    hierarchicalStep: this.buildHierarchicalStep(executionResult.stepCount, this._parentStepCounts)
                },
                message: this.formatHierarchicalMessage('Finalizing agent execution')
            });

            // Finalize the agent run
            this.logStatus(`✅ Finalizing execution for agent '${params.agent.Name}'`, true, params);

            // To finalize the payload to return to our caller, we favor the new payload from the finalStep, if we have one.
            // Otherwise, we fall back to the previous payload
            const finalPayload = executionResult.finalStep.newPayload || executionResult.finalStep.previousPayload

            // now that we have our finalPayload, if our parent is of a different agent type, we must normalize the payload
            // meaning that we have our agent type strip away and "wrapper" that might be used for intra-agent communication
            // that is agent-type specific. For example the Loop Agent Type has a special wrapper called LoopAgentResponseType
            // which is purely for its internal execution between agent/sub-agent, but is NOT relevant to a parent agent if it
            // is of a different type.
            //const normalizedFinalPayload = this.normalizePayloadForParent(finalPayload, params.agent, params.parentRun?.AgentID);

            return await this.finalizeAgentRun<R>(executionResult.finalStep, finalPayload, params.contextUser);
        } catch (error) {
            // Check if error is due to cancellation
            if (params.cancellationToken?.aborted || error.message === 'Cancelled during execution') {
                const reason =
                    typeof timeoutController.signal.reason === 'string'
                        ? timeoutController.signal.reason
                        : error.message;
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled: ${reason}`, true, params);
                return await this.createCancelledResult(reason || 'Cancelled due to error during execution', params.contextUser);
            }
            this.logError(error, {
                agent: params.agent,
                category: 'AgentExecution',
                severity: 'critical'
            });
            return await this.createFailureResult(error.message, params.contextUser);
        } finally {
            // Release timeout / upstream-abort listeners so we don't leak
            // handles when the run completes (success, failure, or cancel).
            clearTimeout(timeoutId);
            if (upstreamToken) {
                upstreamToken.removeEventListener('abort', relayUpstreamAbort);
            }
            // Restore the caller's original cancellationToken on `params` so
            // consumers that re-read `params` after the call see what they
            // passed in, not our chained signal.
            params.cancellationToken = upstreamToken;
        }
    }

    // =====================================================================================
    // REALTIME (SESSION-DRIVEN) AGENT SUPPORT
    //
    // The methods below back the session-driven branch taken in Execute() for the Realtime
    // agent type. They are entered ONLY via that guarded branch; Loop/Flow agents never reach
    // them. The bulk of the work is building a RealtimeSessionRunnerDeps from BaseAgent's real
    // collaborators (model resolution, sub-agent delegation, tool execution, transcript
    // persistence, and usage checkpointing) and then driving RealtimeSessionRunner.Run().
    // =====================================================================================

    /**
     * Type guard for whether the resolved agent-type instance is session-driven.
     *
     * Detects the Realtime agent type without importing it (and without `instanceof`, which is
     * brittle under bundler class-duplication) by duck-typing the `IsSessionDriven` getter that
     * `RealtimeAgentType` adds. `BaseAgentType` (and Loop/Flow) do not expose this member, so the
     * guard returns `false` for them and the iterative loop runs unchanged.
     *
     * @param agentType The resolved agent-type instance for this run.
     * @returns `true` only when the type explicitly marks itself session-driven.
     */
    protected isSessionDrivenAgentType(agentType: BaseAgentType): agentType is BaseAgentType & { IsSessionDriven: true } {
        return (agentType as Partial<{ IsSessionDriven: boolean }>).IsSessionDriven === true;
    }

    /**
     * Drives a session-driven (Realtime) agent run end-to-end.
     *
     * Resolves the realtime model, assembles the session parameters (system prompt + memory/context),
     * builds the {@link RealtimeSessionRunnerDeps} from this agent's collaborators, runs the
     * {@link RealtimeSessionRunner}, and maps the result onto the finalized `AIAgentRun`.
     *
     * If no realtime model can be resolved (expected today, before the P3 drivers / P4 model
     * metadata land), it finalizes the run as a clean FAILED result with an actionable message
     * rather than throwing — a mis-provisioned environment must not crash the caller.
     *
     * @template R The caller's expected payload type (unused on the realtime path; the session
     *   produces transcript/usage rather than a structured payload).
     * @param params The wrapped execution parameters.
     * @param config The loaded agent configuration (provides the system prompt, if any).
     * @returns The finalized {@link ExecuteAgentResult}.
     */
    // ── Realtime per-session capture state (scoped to one executeRealtimeSession run) ──────────
    /**
     * In-flight realtime turn rows keyed by transcript role (`'user'`/`'assistant'`), driving the
     * create-on-start / update-on-complete persistence lifecycle. Reset at the start of every
     * realtime session so a prior run can never leak an in-flight id into the next.
     */
    private realtimeInFlightTurns: Map<string, string> = new Map();
    /** Active audio recording controller for the current realtime session, or `null` when recording is off. */
    private realtimeRecording: RealtimeRecordingController | null = null;
    /** Storage account id the active recording stores to (RecordingStorageProviderID ?? AttachmentStorageProviderID). */
    private realtimeRecordingAccountId: string | null = null;

    protected async executeRealtimeSession<R = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ExecuteAgentResult<R>> {
        // 1) Resolve the realtime model (overridable seam — tests inject a mock).
        const modelResolution = await this.resolveRealtimeModel(params);
        if (!modelResolution) {
            const message =
                `Agent '${params.agent.Name}' is session-driven (Realtime) but no usable Realtime model could be ` +
                `resolved. Configure a model of AIModelType 'Realtime' with an active vendor DriverClass and a ` +
                `valid API key (e.g. AI_VENDOR_API_KEY__<driver>). This is expected until the realtime drivers ` +
                `and model metadata are provisioned.`;
            this.logError(message, { agent: params.agent, category: 'RealtimeSession' });
            return await this.createFailureResult(message, params.contextUser) as ExecuteAgentResult<R>;
        }

        // 2) Create the single long-lived AIPromptRun that usage is checkpointed onto.
        const promptRun = await this.createRealtimePromptRun(params, config, modelResolution);

        // 3) Resolve recording (OFF by default; runtime > agent > off; consent + storage gated) and reset
        //    the per-session turn-lifecycle state, then build the injected deps and run the session.
        this.realtimeInFlightTurns = new Map();
        const recording = await this.resolveRealtimeRecording(params);
        this.realtimeRecording = recording?.controller ?? null;
        this.realtimeRecordingAccountId = recording?.storageAccountId ?? null;
        try {
            const deps = await this.buildRealtimeSessionDeps(params, config, modelResolution, promptRun);
            const runner = new RealtimeSessionRunner(deps);
            const sessionResult = await runner.Run();
            return await this.finalizeRealtimeRun<R>(params, sessionResult);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logError(`Realtime session failed for agent '${params.agent.Name}': ${msg}`, {
                agent: params.agent,
                category: 'RealtimeSession'
            });
            return await this.createFailureResult(msg, params.contextUser) as ExecuteAgentResult<R>;
        }
    }

    /**
     * Opens a **raw** {@link IRealtimeSession} for this agent — the duplex model connection a Realtime
     * Bridge hands to `AIBridgeEngine.StartBridgeSession` so the agent can talk + hear over a media
     * transport (a LiveKit room, a Zoom/Teams meeting, a phone call). The bridge engine owns turn-taking
     * and the transport seam, so this deliberately returns the **session itself**, NOT a
     * {@link RealtimeSessionRunner} (which is the client-direct topology's own orchestration loop).
     *
     * It reuses the EXACT same resolution + assembly as {@link executeRealtimeSession} — model selection
     * ({@link resolveRealtimeModel}), agent configuration ({@link loadAgentConfiguration}), effective-config
     * persona/voice ({@link resolveRealtimeEffectiveConfig}), and the system-prompt + memory context
     * ({@link buildRealtimeSessionParams}) — then opens the session via
     * {@link BaseRealtimeModel.StartSession}. Tools are intentionally NOT pre-populated: the
     * `invoke-target-agent` + interactive-surface tools are a runner concern; a bridge that needs them
     * registers them on the returned session itself.
     *
     * @param params The execution parameters (agent + context user + the request-scoped provider). A fresh
     *   bridge session typically passes an empty `conversationMessages` array.
     * @returns The live realtime session.
     * @throws When the agent configuration fails to load or no usable Realtime model can be resolved.
     */
    public async StartBridgeRealtimeSession(params: ExecuteAgentParams): Promise<IRealtimeSession> {
        // Mirror Execute()'s provider wiring so the realtime helpers operate on the request-scoped provider.
        this._activeProvider = params.provider ?? Metadata.Provider;
        const provider = params.provider ?? Metadata.Provider;

        // A LiveKit / Zoom / Teams bridge is a thin TRANSPORT over the realtime co-agent — it does NOT build
        // session prep itself. It CONSUMES the one shared producer
        // ({@link RealtimeClientSessionService.PrepareRealtimeSessionParams}) so the agent's identity (it
        // speaks first-person AS the target — Sage / Marketing Agent / …), the model + voice precedence
        // cascade, the tool set (always incl. invoke-target-agent), and memory are byte-for-byte identical to
        // the native realtime chat. Bridges differ ONLY in opening the session server-side (StartSession) and
        // their media transport. See plans/realtime/realtime-core-host-convergence.md.
        // ONE service instance: it produces the prep AND wires the long-lived runtime, so the in-flight
        // delegation registry (barge-in cancel) is shared between them.
        const service = new RealtimeClientSessionService();
        const input = this.buildBridgePrepInput(params);
        const contextUser = params.contextUser as UserInfo;
        const prep = await service.PrepareRealtimeSessionParams(input, contextUser, provider);
        if (!prep.Success || !prep.Resolution || !prep.SessionParams) {
            throw new Error(
                prep.ErrorMessage ?? `Failed to prepare a realtime session for agent '${params.agent.Name}'. ` +
                    `Configure an Active AIModelType 'Realtime' model with an active vendor whose DriverClass has a ` +
                    `resolvable API key.`,
            );
        }
        const session = await prep.Resolution.Model.StartSession(prep.SessionParams);

        // Phase 2: wire the SAME core runtime the native chat uses — real `invoke-target-agent` delegation
        // (target runs via AgentRunner, nested + tracked) + co-agent run/prompt-run observability, finalized
        // when the bridge calls `session.Close()`. No host-local tool re-implementation. The runtime handle's
        // side effects live on `session` (OnToolCall + a finalize-wrapped Close), so the bridge just owns the
        // session. See plans/realtime/realtime-core-host-convergence.md (Phase 2).
        await service.WireBridgeRealtimeSession(session, input, prep, contextUser, provider);
        return session;
    }

    /**
     * Adapts {@link ExecuteAgentParams} → the core {@link PrepareClientSessionInput} for a server-bridged
     * session. The CO-AGENT is the executed agent; the TARGET agent + the per-session model/voice override
     * ride `params.data` (the same conduit the native dev picker uses, funneled into the one
     * `ConfigOverridesJson` cascade slot via {@link BuildRealtimeOverridesJson}). Tools are left empty — a
     * bridge host injects its OWN UX tools (none for LiveKit audio today); identity/precedence/invoke-target
     * come from the core. `AgentSessionID` groups this session's observability runs (see
     * {@link RealtimeClientSessionService.WireBridgeRealtimeSession}).
     *
     * @param params The bridge execution parameters.
     * @returns The core prep input.
     */
    private buildBridgePrepInput(params: ExecuteAgentParams): PrepareClientSessionInput {
        const modelID = (params.data?.realtimeModelID as string | undefined)?.trim() || undefined;
        const voice = (params.data?.realtimeVoice as string | undefined)?.trim() || undefined;
        const targetID = (params.data?.targetAgentID as string | undefined)?.trim() || '';
        // Multi-agent meeting signal (set by the room coordinator when the agent joins a room that already
        // has agents): disable the model's blind auto-response + add meeting discipline to the prompt so it
        // hears everything but speaks only when addressed. SelfNames feed only the prompt phrasing; the
        // addressing GATE is the bridge's matcher. See plans/realtime/multi-agent-meeting-turn-taking.md.
        const meetingMode = params.data?.realtimeMeetingMode === true;
        const selfNames = Array.isArray(params.data?.realtimeSelfNames)
            ? (params.data?.realtimeSelfNames as unknown[]).filter((n): n is string => typeof n === 'string')
            : undefined;
        return {
            CoAgent: params.agent,
            TargetAgentID: targetID,
            AgentSessionID: (params.data?.agentSessionId as string | undefined) ?? '',
            PreferredModelID: modelID,
            ConfigOverridesJson: BuildRealtimeOverridesJson(modelID, voice) ?? undefined,
            ConversationMessages: params.conversationMessages,
            UserID: params.contextUser?.ID,
            DisableAutoResponse: meetingMode || undefined,
            SelfNames: selfNames,
        };
    }

    /**
     * Resolves the realtime model + vendor driver + API key for a session-driven run.
     *
     * **Overridable seam.** This is the single injection point that test subclasses override to
     * return a mock {@link BaseRealtimeModel}, so {@link executeRealtimeSession} can be exercised
     * without provider SDKs or DB metadata.
     *
     * Production resolution: pick the highest-power active model of AIModelType `Realtime`; then
     * pick its highest-priority active vendor whose `DriverClass` has a resolvable API key; then
     * instantiate the driver via the `ClassFactory`. Returns `null` (never throws) if any step
     * can't be satisfied — the caller turns that into a clean FAILED result. (Per-agent realtime
     * model preference can later be wired through the agent's prompt-model config, the same path
     * loop agents use for `ModelSelectionMode`; the AI Agent entity has no direct model FK.)
     *
     * @param params The execution parameters (for the agent + context user).
     * @returns The resolved model instance plus its model/vendor identifiers, or `null`.
     */
    protected async resolveRealtimeModel(
        params: ExecuteAgentParams,
        overrideModelID?: string
    ): Promise<{ model: BaseRealtimeModel; modelID: string; vendorID: string; apiName: string; driverClass?: string } | null> {
        // Walk candidates in resolution order (preference first, then highest PowerRank), returning the
        // FIRST that FULLY resolves (active vendor + resolvable API key + ClassFactory driver). Single-pick
        // would dead-end whenever the top model lacked a key — e.g. a power-11 model with no env key
        // (Inworld/AssemblyAI) outranking GPT Realtime — and surface "No usable Realtime model" even though
        // a usable model exists. This mirrors the same fix in RealtimeClientSessionService.
        const candidates = this.selectRealtimeModelCandidates(params.agent, overrideModelID);
        for (const model of candidates) {
            const vendor = this.selectRealtimeVendor(model.ID);
            if (!vendor) {
                continue;
            }
            const apiKey = GetAIAPIKey(vendor.driverClass);
            if (!apiKey) {
                continue;
            }
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(
                BaseRealtimeModel,
                vendor.driverClass,
                apiKey
            );
            if (!instance) {
                continue;
            }
            return { model: instance, modelID: model.ID, vendorID: vendor.vendorID, apiName: vendor.apiName, driverClass: vendor.driverClass };
        }
        return null;
    }

    /**
     * The active `Realtime`-AIModelType models to try, in resolution order — the candidate list
     * {@link resolveRealtimeModel} walks until one yields a usable vendor + key + driver. Returns ALL
     * candidates (not just the top pick) so a keyless / undriveable higher-power model falls through to
     * the next usable one instead of dead-ending the whole resolution.
     *
     * Ordering: an effective-config model preference (`realtime.modelPreference`, an MJ: AI Models Name
     * or ID) goes FIRST when it resolves, followed by the rest by descending PowerRank (so even a keyless
     * preferred model degrades gracefully). An unsatisfiable preference logs and is ignored.
     *
     * @param agent The agent being executed.
     * @returns The candidate models in resolution order (empty when none are active).
     */
    private selectRealtimeModelCandidates(agent: MJAIAgentEntityExtended, overrideModelID?: string): MJAIModelEntityExtended[] {
        const isRealtime = (m: MJAIModelEntityExtended): boolean =>
            typeof m.AIModelType === 'string' && m.AIModelType.trim().toLowerCase() === 'realtime';

        const realtimeModels = AIEngine.Instance.Models.filter(m => m.IsActive && isRealtime(m));
        if (realtimeModels.length === 0) {
            return [];
        }

        const byPower = [...realtimeModels].sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));

        // A per-session override (a dev picking a specific Realtime model for this bridged agent) wins over
        // the config's modelPreference — same "preferred first, rest by power as fallback" semantics.
        const preference = (overrideModelID && overrideModelID.trim().length > 0)
            ? overrideModelID.trim()
            : this.resolveRealtimeEffectiveConfig(agent).realtime?.modelPreference;
        if (preference) {
            const wanted = preference.trim().toLowerCase();
            const preferred = realtimeModels.find(m => UUIDsEqual(m.ID, preference))
                ?? realtimeModels.find(m => m.Name?.trim().toLowerCase() === wanted);
            if (preferred) {
                // Preference first, the rest (by power) as fallback so a keyless preferred model still
                // falls through to a usable one rather than dead-ending.
                return [preferred, ...byPower.filter(m => !UUIDsEqual(m.ID, preferred.ID))];
            }
            this.logError(
                `Realtime model preference '${preference}' for agent '${agent.Name}' matches no Active Realtime ` +
                'model — falling through to default (highest-PowerRank) selection.',
                { agent, category: 'RealtimeSession' }
            );
        }

        return byPower;
    }

    /**
     * Resolves the agent's EFFECTIVE realtime configuration — the agent TYPE's
     * `DefaultConfiguration` (base layer) deep-merged with the agent's `TypeConfiguration`
     * (per-agent layer; the server-bridged path has no runtime-override layer). Tolerant:
     * malformed layers contribute nothing and an unloaded type cache yields no type defaults.
     * See `realtime/realtime-coagent-config.ts` for the merge contract.
     *
     * @param agent The session-driven (Realtime) agent.
     * @returns The normalized effective configuration (possibly empty, never `null`).
     */
    protected resolveRealtimeEffectiveConfig(agent: MJAIAgentEntityExtended): RealtimeCoAgentConfig {
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

    /**
     * Selects the highest-priority active vendor for a model whose `DriverClass` has a resolvable
     * API key. Mirrors the vendor-selection pattern used by prompt execution.
     *
     * @param modelID The chosen model's ID.
     * @returns The vendor driver/api identifiers, or `null` when none has a usable key.
     */
    private selectRealtimeVendor(modelID: string): { vendorID: string; driverClass: string; apiName: string } | null {
        const vendors = AIEngine.Instance.ModelVendors
            .filter(mv => UUIDsEqual(mv.ModelID, modelID) && mv.Status === 'Active' && mv.DriverClass != null)
            .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));

        for (const v of vendors) {
            if (GetAIAPIKey(v.DriverClass!)) {
                return { vendorID: v.VendorID ?? '', driverClass: v.DriverClass!, apiName: v.APIName ?? '' };
            }
        }
        return null;
    }

    /**
     * Creates the single long-lived `AIPromptRun` that realtime usage is checkpointed onto.
     *
     * One run is created per session (not per turn) so {@link RealtimeSessionRunnerDeps.CheckpointUsage}
     * can incrementally update the same record — crash-safe by design. Returns `null` on failure;
     * the session still runs (usage checkpoints simply become no-ops).
     *
     * @param params The execution parameters.
     * @param config The agent configuration (provides the system prompt id, if any).
     * @param modelResolution The resolved model/vendor identifiers.
     * @returns The persisted prompt run, or `null` if it could not be created.
     */
    private async createRealtimePromptRun(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelResolution: { modelID: string; vendorID: string }
    ): Promise<MJAIPromptRunEntityExtended | null> {
        try {
            const md = params.provider || this._activeProvider;
            const promptRun = await md.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', params.contextUser);
            promptRun.NewRecord();
            if (config.systemPrompt) {
                promptRun.PromptID = config.systemPrompt.ID;
            }
            promptRun.ModelID = modelResolution.modelID;
            promptRun.VendorID = modelResolution.vendorID || null;
            promptRun.AgentID = params.agent.ID;
            promptRun.AgentRunID = this._agentRun?.ID ?? null;
            promptRun.Status = 'Running';
            promptRun.RunAt = new Date();
            promptRun.StreamingEnabled = true;
            promptRun.Cancelled = false;
            promptRun.CacheHit = false;

            if (!await promptRun.Save()) {
                this.logError(`Failed to create realtime AIPromptRun: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`, {
                    agent: params.agent,
                    category: 'RealtimeSession'
                });
                return null;
            }
            return promptRun;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logError(`Error creating realtime AIPromptRun: ${msg}`, { agent: params.agent, category: 'RealtimeSession' });
            return null;
        }
    }

    /**
     * Builds the fully-populated {@link RealtimeSessionRunnerDeps} from this agent's collaborators.
     *
     * Each dependency is a thin closure over BaseAgent state so the runner stays decoupled from
     * metadata/DB. The closures cover: target delegation (via {@link ExecuteSubAgent}), non-target
     * tool execution, transcript persistence (as `ConversationDetail`), and usage checkpointing
     * (onto the long-lived prompt run).
     *
     * @param params The execution parameters.
     * @param config The agent configuration.
     * @param modelResolution The resolved realtime model + identifiers.
     * @param promptRun The long-lived prompt run for usage checkpoints (may be `null`).
     * @returns The assembled deps object.
     */
    protected async buildRealtimeSessionDeps(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelResolution: { model: BaseRealtimeModel; apiName: string; driverClass?: string },
        promptRun: MJAIPromptRunEntityExtended | null
    ): Promise<RealtimeSessionRunnerDeps> {
        const effectiveConfig = this.resolveRealtimeEffectiveConfig(params.agent);
        const sessionParams = await this.buildRealtimeSessionParams(
            params, config, modelResolution.apiName, effectiveConfig, modelResolution.driverClass,
        );

        return {
            Model: modelResolution.model,
            SessionParams: sessionParams,
            DelegateToTarget: (request) => this.delegateRealtimeToTarget(params, config, request),
            ExecuteTool: (call) => this.executeRealtimeTool(params, call),
            PersistTranscript: (transcript) => this.persistRealtimeTranscript(params, transcript),
            Recording: this.realtimeRecording ?? undefined,
            FinalizeRecording: () => this.finalizeRealtimeRecording(params),
            CheckpointUsage: (usage) => this.checkpointRealtimeUsage(promptRun, usage),
            // DB-driven spoken-progress wording (shared lookup with the client-direct path);
            // null → the runner's documented built-in first-person fallback.
            NarrationInstructionsTemplate: ResolveNarrationInstructionsTemplate(),
            // Effective-config narration pacing (realtime.narration.paceMs); null → runner default.
            NarrationPaceMs: GetNarrationPaceMs(effectiveConfig),
            LogStatus: (message, verboseOnly) => this.logStatus(message, verboseOnly ?? false, params),
            LogError: (error) => this.logError(error, { agent: params.agent, category: 'RealtimeSession' })
        };
    }

    /**
     * Assembles the {@link RealtimeSessionParams} for the session.
     *
     * The system prompt is framed as a companion "voice for the target agent". The base system
     * prompt text (when an agent-level system prompt exists) plus the same memory/context a loop
     * agent would assemble (via {@link AgentMemoryContextBuilder}) are concatenated. The
     * always-present `invoke-target-agent` tool is added by the runner itself, so it is NOT
     * populated here.
     *
     * @param params The execution parameters.
     * @param config The agent configuration.
     * @param modelApiName The vendor API name of the resolved realtime model.
     * @returns The session parameters.
     */
    private async buildRealtimeSessionParams(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelApiName: string,
        effectiveConfig?: RealtimeCoAgentConfig,
        driverClass?: string
    ): Promise<RealtimeSessionParams> {
        // Identity framing comes from the ONE shared producer so the agent speaks first-person AS the
        // TARGET (Sage / Marketing Agent / …), identical to every other realtime host — not as the co-agent.
        // See BuildRealtimeAgentFraming + plans/realtime/realtime-core-host-convergence.md.
        const targetAgent = this.resolveRealtimeTargetAgent(params);
        const framing = BuildRealtimeAgentFraming(targetAgent?.Name ?? 'the configured target agent');

        const basePrompt = config.systemPrompt?.TemplateText ? config.systemPrompt.TemplateText : '';
        // Effective-config voice persona (realtime.voice.default) → short "Voice & manner" section.
        const voiceManner = BuildVoiceMannerSection(effectiveConfig);
        const memoryContext = await this.assembleRealtimeContext(params);

        const systemPrompt = [framing, basePrompt, voiceManner, memoryContext]
            .filter(part => part && part.trim().length > 0)
            .join('\n\n');

        // Provider-matched voice settings (realtime.voice.providers.<provider>) flow into the
        // driver's open Config bag — the same pact every other config entry rides.
        const providerVoice = GetProviderVoiceSettings(effectiveConfig, driverClass ?? null);

        return {
            Model: modelApiName,
            SystemPrompt: systemPrompt,
            InitialContext: memoryContext || undefined,
            // JSONObjectLike -> JSONObject: safe — the settings object came from JSON.parse.
            Config: providerVoice ? (providerVoice as JSONObject) : undefined
        };
    }

    /**
     * Assembles the same memory/context block a loop agent injects, reusing
     * {@link AgentMemoryContextBuilder} so there is no duplicated retrieval logic. The builder
     * unshifts a system message onto a throwaway array, which we pull back out as plain text to
     * feed the realtime model's session context.
     *
     * @param params The execution parameters.
     * @returns The concatenated context text (empty string when nothing was injected).
     */
    private async assembleRealtimeContext(params: ExecuteAgentParams): Promise<string> {
        const lastUserMessage = params.conversationMessages.filter(m => m.role === 'user').pop();
        const inputText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
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
            (message, verboseOnly) => this.logStatus(message, verboseOnly ?? false, params)
        );

        return scratch
            .map(m => (typeof m.content === 'string' ? m.content : ''))
            .filter(c => c.length > 0)
            .join('\n\n');
    }

    /**
     * Delegates an `invoke-target-agent` tool call to the top-level target agent.
     *
     * Threads the runner-owned {@link DelegateToTargetRequest.AbortSignal} into the child run's
     * `cancellationToken` (so barge-in cancels the delegated work), and links the child run to this
     * run via `parentRun` (→ `ParentRunID`) while propagating `agentSessionID` so both runs group
     * under the same session.
     *
     * **Target source.** The target agent id comes from `params.data.targetAgentID` when present
     * (the Realtime Co-Agent receives its target as a runtime parameter), falling back to the agent's
     * own `DefaultModelID`-style config is NOT applicable here; absent a target the delegation
     * returns a failed {@link DelegatedResult} the model can narrate.
     *
     * @param params The (parent) execution parameters.
     * @param config The agent configuration (unused today; reserved for target-from-config wiring).
     * @param request The delegation request derived from the tool call.
     * @returns The delegated result for the model's tool_response.
     */
    private async delegateRealtimeToTarget(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        request: DelegateToTargetRequest
    ): Promise<DelegatedResult> {
        const targetAgent = this.resolveRealtimeTargetAgent(params);
        if (!targetAgent) {
            return {
                CallID: request.CallID,
                Success: false,
                Output: 'No target agent is configured for this voice session, so the request could not be performed.'
            };
        }

        try {
            const requestText = this.parseDelegateRequestText(request.Arguments);
            const runner = new AgentRunner(params.provider || this._activeProvider);
            const result = await runner.RunAgent({
                agent: targetAgent,
                conversationMessages: [{ role: 'user', content: requestText }],
                contextUser: params.contextUser,
                cancellationToken: request.AbortSignal,
                parentRun: this._agentRun ?? undefined,
                agentSessionID: params.agentSessionID,
                parentAgentHierarchy: this._agentHierarchy,
                parentDepth: this._depth,
                configurationId: params.configurationId,
                apiKeys: params.apiKeys,
                data: params.data,
                verbose: params.verbose,
                // Progress streams BOTH to the runner's narration consumer (request.OnProgress —
                // it paces SendContextNote/RequestSpokenUpdate over the live socket) AND to any
                // host-level onProgress the parent execution carries.
                onProgress: this.combineProgressCallbacks(request.OnProgress, params.onProgress)
            });

            return {
                CallID: request.CallID,
                Success: result.success,
                Output: result.success
                    ? (result.agentRun?.Message || 'The target agent completed the request.')
                    : (result.agentRun?.ErrorMessage || 'The target agent failed to complete the request.')
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { CallID: request.CallID, Success: false, Output: `Delegation failed: ${msg}` };
        }
    }

    /**
     * Combines the runner-supplied delegation progress callback with the host-level one so a
     * single `onProgress` fans out to both. Returns the lone callback when only one exists, and
     * `undefined` when neither does. A throw from one consumer never starves the other.
     */
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
        return (progress) => {
            try {
                first(progress);
            } catch {
                /* one consumer failing must not starve the other */
            }
            second(progress);
        };
    }

    /**
     * Resolves the top-level target agent for the voice session.
     *
     * The target is supplied as a runtime parameter on `params.data.targetAgentID` (the Voice
     * Co-Agent voices on behalf of a target chosen at session start). Returns `null` when no
     * resolvable target is configured.
     *
     * @param params The execution parameters.
     * @returns The target agent entity, or `null`.
     */
    private resolveRealtimeTargetAgent(params: ExecuteAgentParams): MJAIAgentEntityExtended | null {
        const targetID = params.data?.targetAgentID as string | undefined;
        if (!targetID) {
            return null;
        }
        return AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, targetID)) ?? null;
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
     * Executes a non-target realtime tool call by routing it through the agent's existing action
     * execution under the session context user.
     *
     * Today this maps the realtime call onto the agent's configured actions by name; unknown tools
     * return a failed {@link ToolExecutionResult} the model can narrate. (The richer client/UI tool
     * routing is wired in a later phase; this keeps server actions usable now.)
     *
     * @param params The execution parameters.
     * @param call The non-target tool call.
     * @returns The tool execution result for the model's tool_response.
     */
    private async executeRealtimeTool(params: ExecuteAgentParams, call: RealtimeToolCall): Promise<ToolExecutionResult> {
        const action = this.getEffectiveActionsForValidation(params.agent.ID).find(a => a.Name === call.ToolName);
        if (!action) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Tool '${call.ToolName}' is not available to this agent.`
            };
        }

        try {
            const agentAction: AgentAction = { name: action.Name, params: this.parseRealtimeToolParams(call.Arguments) };
            const result = await this.ExecuteSingleAction(params, agentAction, action, params.contextUser);
            return {
                CallID: call.CallID,
                Success: result.Success,
                Output: result.Message || (result.Success ? 'Tool completed.' : 'Tool failed.')
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { CallID: call.CallID, Success: false, Output: `Tool execution failed: ${msg}` };
        }
    }

    /**
     * Parses a realtime tool call's JSON arguments into an action parameter map.
     *
     * @param argumentsJson The raw arguments string.
     * @returns A record of parameter name → value (empty when not parseable).
     */
    private parseRealtimeToolParams(argumentsJson: string): Record<string, unknown> {
        try {
            const parsed = JSON.parse(argumentsJson);
            if (parsed && typeof parsed === 'object') {
                return parsed as Record<string, unknown>;
            }
        } catch {
            /* ignore — return empty params */
        }
        return {};
    }

    /**
     * Persists a realtime transcript turn as a `ConversationDetail` with a **create-on-start /
     * update-on-complete** lifecycle, so each turn carries both a start (`__mj_CreatedAt`) and an
     * immutable end (`TurnEndedAt`):
     * - **Interim** (`IsFinal=false`): on the FIRST delta for a role, CREATE the row with
     *   `Status='In-Progress'` (so a live UI can show the turn streaming), stamping the recording-relative
     *   `UtteranceStartMs` and the speaker `UserID` (user turns only). Subsequent interim deltas are no-ops.
     * - **Final** (`IsFinal=true`): UPDATE that in-flight row with the full text, `Status='Complete'`,
     *   `TurnEndedAt`, and `UtteranceEndMs`. If no interim was seen (some providers only emit final), the
     *   row is created and finalized in one step.
     *
     * Returns the new row's ID the first time a DISTINCT turn is created, and `null` when an existing
     * in-flight row is merely updated — the runner uses that to count turns (not events). User turns are
     * `Role='User'`, assistant turns `Role='AI'`. When recording is active, `MediaType='Audio'` and the
     * media-relative utterance offsets are stamped from the recording clock.
     *
     * @param params The execution parameters (provides conversation id + context user + session id).
     * @param transcript The transcript turn (interim delta or final) emitted by the model.
     * @returns The created row id on first creation of a turn, else `null`.
     */
    private async persistRealtimeTranscript(params: ExecuteAgentParams, transcript: RealtimeTranscript): Promise<string | null> {
        if (!transcript.Text?.trim()) {
            return null;
        }
        const conversationID = params.data?.conversationId as string | undefined;
        if (!conversationID) {
            return null; // Without a conversation we have nowhere to durably attach the turn.
        }

        const md = params.provider || this._activeProvider;
        const roleKey = transcript.Role; // 'user' | 'assistant'
        const mjRole: 'User' | 'AI' = transcript.Role === 'user' ? 'User' : 'AI';

        // ── INTERIM: create the In-Progress row once per turn (first delta) ───────────────────────
        if (!transcript.IsFinal) {
            if (this.realtimeInFlightTurns.has(roleKey)) {
                return null; // already created for this turn; ignore subsequent deltas
            }
            const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', params.contextUser);
            detail.NewRecord();
            detail.ConversationID = conversationID;
            detail.Role = mjRole;
            detail.Message = transcript.Text;
            detail.Status = 'In-Progress';
            this.applyRealtimeTurnSpeakerAndMedia(detail, transcript, params, /*atStart*/ true);
            if (params.agentSessionID) {
                detail.AgentSessionID = params.agentSessionID;
            }
            if (!await detail.Save()) {
                this.logError(`Failed to create in-progress realtime transcript turn: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`, {
                    agent: params.agent, category: 'RealtimeSession'
                });
                return null;
            }
            this.realtimeInFlightTurns.set(roleKey, detail.ID);
            return detail.ID;
        }

        // ── FINAL: update the in-flight row (or create+finalize when no interim was seen) ─────────
        const inFlightId = this.realtimeInFlightTurns.get(roleKey);
        this.realtimeInFlightTurns.delete(roleKey);
        let detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', params.contextUser);
        let created = false;
        if (inFlightId && await detail.Load(inFlightId)) {
            // updating the existing streaming row → not a new turn
        } else {
            detail.NewRecord();
            detail.ConversationID = conversationID;
            detail.Role = mjRole;
            this.applyRealtimeTurnSpeakerAndMedia(detail, transcript, params, /*atStart*/ true);
            if (params.agentSessionID) {
                detail.AgentSessionID = params.agentSessionID;
            }
            created = true;
        }
        detail.Message = transcript.Text;
        detail.Status = 'Complete';
        detail.TurnEndedAt = new Date();
        if (this.realtimeRecording) {
            detail.UtteranceEndMs = this.realtimeRecording.NowOffsetMs();
        }
        if (!await detail.Save()) {
            this.logError(`Failed to finalize realtime transcript turn: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`, {
                agent: params.agent, category: 'RealtimeSession'
            });
        }
        return created ? detail.ID : null;
    }

    /**
     * Stamps the speaker identity and recording-relative media fields on a freshly-created turn row.
     * `UserID` is set only for **user** turns (an AI turn has no human speaker). When recording is
     * active, `MediaType='Audio'` and `UtteranceStartMs` is captured from the recording clock.
     *
     * @param detail The new conversation-detail row.
     * @param transcript The transcript turn.
     * @param params The execution parameters.
     * @param atStart Whether this is the turn's start (stamps `UtteranceStartMs`).
     */
    private applyRealtimeTurnSpeakerAndMedia(
        detail: MJConversationDetailEntity, transcript: RealtimeTranscript, params: ExecuteAgentParams, atStart: boolean
    ): void {
        if (transcript.Role === 'user' && params.contextUser?.ID) {
            detail.UserID = params.contextUser.ID;
        }
        if (this.realtimeRecording) {
            detail.MediaType = 'Audio';
            if (atStart) {
                detail.UtteranceStartMs = this.realtimeRecording.NowOffsetMs();
            }
        }
    }

    /**
     * Resolves whether to record this realtime session, OFF by default, with the precedence
     * **runtime param > agent (`RecordingDefault`) > off**, hard-gated by consent and a resolvable
     * storage provider. Returns the recording controller + the resolved storage account, or `null`
     * to record nothing (fail-closed). Never throws — any resolution problem disables recording.
     *
     * Storage resolves to **`AIAgent.RecordingStorageProviderID` ?? `AIAgent.AttachmentStorageProviderID`**
     * (recordings default to the attachments account), then to that provider's first account. With no
     * provider configured, or consent not granted, recording is OFF.
     *
     * @param params The execution parameters (agent + runtime `data.recording`).
     * @returns `{ controller, storageAccountId }` when recording is enabled, else `null`.
     */
    private async resolveRealtimeRecording(
        params: ExecuteAgentParams
    ): Promise<{ controller: RealtimeRecordingController; storageAccountId: string } | null> {
        try {
            const agent = params.agent as MJAIAgentEntityExtended;
            const runtime = (params.data?.recording ?? null) as { media?: string; consent?: boolean } | null;

            // Media: runtime > agent default > off.
            const rawMedia = runtime?.media ?? agent.RecordingDefault ?? 'None';
            const media: RealtimeRecordingMedia | 'None' =
                rawMedia === 'Audio' || rawMedia === 'AudioVideo' ? rawMedia : 'None';
            if (media === 'None') {
                return null; // recording off
            }

            // Consent is a HARD gate — never record without explicit consent.
            if (runtime?.consent !== true) {
                this.logStatus('🔴 Realtime recording requested but consent was not granted — recording disabled.', false, params);
                return null;
            }

            // Storage: recording provider, else attachment provider; then that provider's first account.
            const storageAccountId = params.contextUser
                ? await resolveRecordingStorageAccountID(agent, params.contextUser, params.provider || this._activeProvider)
                : null;
            if (!storageAccountId) {
                this.logStatus('🔴 Realtime recording on but no resolvable storage account (RecordingStorageProviderID/AttachmentStorageProviderID) — recording disabled.', false, params);
                return null;
            }

            const controller = new RealtimeRecordingController({ Media: media });
            return { controller, storageAccountId };
        } catch (error) {
            this.logError(`Failed to resolve realtime recording (recording disabled): ${error instanceof Error ? error.message : String(error)}`, {
                agent: params.agent, category: 'RealtimeSession'
            });
            return null;
        }
    }

    /**
     * Finalizes the active recording after the session closes: encodes the captured audio to a WAV,
     * stores it via MJStorage to the resolved account, links it to the `AIAgentSession` (via
     * `MJ: File Entity Record Links`), and stamps `RecordingFileID` / `RecordingMedia` /
     * `RecordingStartedAt` on the session. Never throws — a recording failure must not fail the
     * session run. No-op when recording is off, nothing was captured, or there is no session id.
     *
     * @param params The execution parameters (provides the session id + context user + provider).
     */
    private async finalizeRealtimeRecording(params: ExecuteAgentParams): Promise<void> {
        const controller = this.realtimeRecording;
        if (!controller) {
            return;
        }
        // One-shot: clear instance state up front so a re-entrant/duplicate Stop can't double-store.
        this.realtimeRecording = null;
        const storageAccountId = this.realtimeRecordingAccountId;
        this.realtimeRecordingAccountId = null;

        try {
            controller.Stop();
            const sessionID = params.agentSessionID;
            const contextUser = params.contextUser;
            if (!sessionID || !storageAccountId || !contextUser) {
                return; // nowhere to attach / store (or no user context to store under)
            }
            const encoded = controller.EncodeWav();
            if (!encoded) {
                this.logStatus('🔇 Realtime session produced no audio to record.', true, params);
                return;
            }

            const md = params.provider || this._activeProvider;
            const fileID = await storeRealtimeRecording({
                Audio: encoded.Buffer,
                MimeType: 'audio/wav',
                Media: controller.Media,
                StartedAt: controller.StartedAt ?? new Date(),
                StorageAccountID: storageAccountId,
                SessionID: sessionID,
                ContextUser: contextUser,
                Provider: md
            });
            if (fileID) {
                this.logStatus(`🎬 Realtime recording stored (${Math.round(encoded.DurationMs / 1000)}s, file ${fileID}).`, true, params);
            }
        } catch (error) {
            this.logError(`Failed to finalize realtime recording: ${error instanceof Error ? error.message : String(error)}`, {
                agent: params.agent, category: 'RealtimeSession'
            });
        }
    }

    /**
     * Checkpoints accumulated realtime usage onto the single long-lived prompt run. This is the
     * incremental, crash-safe write the runner invokes on a debounced cadence and at close.
     *
     * @param promptRun The long-lived prompt run (no-op when `null`).
     * @param usage The cumulative usage snapshot to persist.
     */
    private async checkpointRealtimeUsage(promptRun: MJAIPromptRunEntityExtended | null, usage: RealtimeUsage): Promise<void> {
        if (!promptRun) {
            return;
        }
        promptRun.TokensPrompt = usage.InputTokens;
        promptRun.TokensCompletion = usage.OutputTokens;
        promptRun.TokensUsed = usage.InputTokens + usage.OutputTokens;
        if (!await promptRun.Save()) {
            this.logError(`Failed to checkpoint realtime usage: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`, {
                category: 'RealtimeSession'
            });
        }
    }

    /**
     * Maps a completed {@link RealtimeSessionResult} onto the finalized `AIAgentRun` and returns
     * the {@link ExecuteAgentResult}. A clean close finalizes as success; a session error finalizes
     * as failure with the error message.
     *
     * @template R The caller's payload type (unused on the realtime path).
     * @param params The execution parameters.
     * @param sessionResult The result returned by {@link RealtimeSessionRunner.Run}.
     * @returns The finalized agent result.
     */
    private async finalizeRealtimeRun<R = any>(
        params: ExecuteAgentParams,
        sessionResult: RealtimeSessionResult
    ): Promise<ExecuteAgentResult<R>> {
        if (sessionResult.Success) {
            this.logStatus(
                `🎙️ Realtime session for '${params.agent.Name}' completed: ${sessionResult.TranscriptTurnCount} turn(s), ` +
                `${sessionResult.FinalUsage.InputTokens + sessionResult.FinalUsage.OutputTokens} token(s).`,
                true, params
            );
            const successStep = this.createSessionSuccessStep<R>();
            return await this.finalizeAgentRun<R>(successStep, undefined, params.contextUser);
        }

        const message = sessionResult.ErrorMessage || 'Realtime session ended with an error.';
        return await this.createFailureResult(message, params.contextUser) as ExecuteAgentResult<R>;
    }

    /**
     * Builds a terminal `Success` step describing the completion of a realtime session, used to
     * finalize the run through the shared {@link finalizeAgentRun} path.
     *
     * @template R The caller's payload type.
     * @returns A terminal success step.
     */
    private createSessionSuccessStep<R = any>(): BaseAgentNextStep<R> {
        return {
            step: 'Success',
            terminate: true,
            message: 'Realtime session completed.'
        } as BaseAgentNextStep<R>;
    }

    /**
     * Sub-classes can override this method to perform any specialized initialization
     * @param params
     */
    protected async initializeStartingPayload<P = any>(params: ExecuteAgentParams<any, P>): Promise<void> {
        // the base class doesn't do anything here, this allows sub-classes
        // to do specialized initialization of the starting payload
    }

    /**
     * Executes the agent's internal logic.
     * 
     * This method contains the core execution logic that drives agent behavior. By default,
     * it implements a sequential execution loop, but subclasses can override this to 
     * implement different execution patterns such as:
     * - Parallel execution of multiple steps
     * - Event-driven or reactive execution
     * - State machine implementations
     * - Custom termination conditions
     * - Alternative flow control mechanisms
     * 
     * @template P - The type of the return value from agent execution
     * @param {ExecuteAgentParams} params - The execution parameters with wrapped callbacks (includes wrapped onProgress and onStreaming)
     * @param {AgentConfiguration} config - The loaded agent configuration
     * @returns {Promise<{finalPayload: P, stepCount: number}>} The execution result with typed final payload and step count
     * @protected
     */
    protected async executeAgentInternal<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
        let continueExecution = true;
        let currentNextStep: BaseAgentNextStep<P> | null = null;
        let stepCount = 0;
        let consecutiveFailedSteps = 0;
        let consecutiveUnproductiveRetries = 0;

        while (continueExecution) {
            // Check for cancellation before each step
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            // Prune and compact expired messages before executing the next step.
            // Uses _promptTurnCount (not stepCount) so expiration is measured in prompt
            // executions, not all steps (which include actions, loops, sub-agents, etc.)
            await this.pruneAndCompactExpiredMessages(params, this._promptTurnCount);

            // Execute the current step based on previous decision or initial prompt
            this.logStatus(`🔄 Executing step ${stepCount + 1} for agent '${params.agent.Name}'`, true, params);
            const nextStep = await this.executeNextStep<P>(params, config, currentNextStep, stepCount);
            stepCount++;

            // Promote any media outputs from this step to the agent's outputs
            if (nextStep.promoteMediaOutputs && nextStep.promoteMediaOutputs.length > 0) {
                this.promoteMediaOutputs(nextStep.promoteMediaOutputs);
            }

            // Track consecutive failed steps to prevent infinite retry loops.
            // Any non-Failed step resets the counter.
            if (nextStep.step === 'Failed' && !nextStep.terminate) {
                consecutiveFailedSteps++;
                if (consecutiveFailedSteps >= BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS) {
                    this.logError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive failed steps ` +
                        `(${BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS}). Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveFailures: consecutiveFailedSteps,
                                lastError: nextStep.errorMessage
                            }
                        }
                    );
                    nextStep.terminate = true;
                    nextStep.errorMessage = `Agent terminated after ${consecutiveFailedSteps} consecutive failed steps. ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else if (nextStep.step !== 'Failed') {
                consecutiveFailedSteps = 0;
            }

            // Track consecutive *unproductive* retries to prevent infinite loops that the
            // consecutive-failed-steps net above cannot catch. A model that repeatedly returns
            // output we can't parse/validate (e.g. conversational prose instead of the required
            // JSON envelope) yields a stream of 'Retry' steps — never 'Failed' — so the failed-step
            // counter resets every turn and never trips. Such retries are produced via
            // createRetryStep(), which always sets an errorMessage; legitimate yield/await retries
            // (pipeline / client-tools / sub-agent re-entry) carry no errorMessage and are exempt.
            const isUnproductiveRetry = nextStep.step === 'Retry' && !nextStep.terminate && !!nextStep.errorMessage;
            if (isUnproductiveRetry) {
                consecutiveUnproductiveRetries++;
                if (consecutiveUnproductiveRetries >= BaseAgent.MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES) {
                    this.logError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive unproductive retries ` +
                        `(${BaseAgent.MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES}). The model is repeatedly returning output ` +
                        `that cannot be parsed or validated. Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveUnproductiveRetries,
                                lastError: nextStep.errorMessage
                            }
                        }
                    );
                    nextStep.step = 'Failed';
                    nextStep.terminate = true;
                    nextStep.errorMessage = `Agent terminated after ${consecutiveUnproductiveRetries} consecutive unproductive retries ` +
                        `(model repeatedly returned output that could not be parsed or validated). ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else {
                consecutiveUnproductiveRetries = 0;
            }

            // Check if we should continue or terminate
            if (nextStep.terminate) {
                continueExecution = false;
                this.logStatus(`🏁 Agent '${params.agent.Name}' terminating after ${stepCount} steps with result: ${nextStep.step}`, true, params);
            } else {
                currentNextStep = nextStep;
                // If the last step didn't have a new payload make sure to carry forward
                // the previous payload to the next step
                if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                    currentNextStep.newPayload = currentNextStep.previousPayload;
                }
                this.logStatus(`➡️ Agent '${params.agent.Name}' continuing to next step: ${nextStep.step}`, true, params);
            }

            // in both cases at the end of the loop we need to advanced the currentNextStep
            currentNextStep = nextStep;
            // if we get to the end and for some reason the newPayload is not set, we should
            // grab the previousPayload to ensure we have something to for the next loop
            // or to return as a failed step shouldn't kill the chain of execution's payload
            // carryforward.
            if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                currentNextStep.newPayload = currentNextStep.previousPayload;
            }
        }

        return { finalStep: currentNextStep, stepCount };
    }

    /**
     * Initializes the AI and Action engines. Subclasses can override this to add any
     * additional engine/metadata loading initialization they want to do and this method
     * will be called at the right time in the agent execution process.
     * 
     * @param {UserInfo} [contextUser] - Optional user context
     * @protected
     */
    protected async initializeEngines(contextUser?: UserInfo): Promise<void> {
        // Load the Action engine BEFORE the AI engine. AIEngine.RefreshActions()
        // (invoked by AIEngine.Config) reuses already-cached 'MJ: Actions'
        // metadata via BaseEngineRegistry, so priming ActionEngineServer first
        // lets AIEngine skip loading a second copy into ActionEngineBase —
        // eliminating the duplicate-RunView telemetry warning at agent startup.
        await ActionEngineServer.Instance.Config(false, contextUser);
        await AIEngine.Instance.Config(false, contextUser);
    }

    /**
     * Storage for injected notes and examples to include in result
     */
    private _injectedMemory: { notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] } = { notes: [], examples: [] };

    /**
     * Storage for injected pre-execution RAG context (Phase 1C of search-scopes-rag-plus).
     * Contains the structured per-scope / combined result detail for downstream observability
     * and artifact persistence. The formatted `<retrieved_context>` system-message block is
     * unshifted onto `conversationMessages` by the shared {@link AgentMemoryContextBuilder}.
     */
    private _injectedRAG: AgentPreExecutionRAGResult | null = null;

    /**
     * Determine the scope label for a note based on its scope fields.
     * Used for memory attribution logging to help identify which scope level
     * a note belongs to.
     *
     * @param note - The agent note entity
     * @returns A human-readable scope label
     */
    private determineNoteScope(note: MJAIAgentNoteEntity): string {
        const hasAgent = note.AgentID !== null;
        const hasUser = note.UserID !== null;
        const hasCompany = note.CompanyID !== null;
        const hasPrimaryScope = note.PrimaryScopeEntityID !== null || note.PrimaryScopeRecordID !== null;

        // Determine scope based on what fields are populated
        if (!hasAgent && !hasUser && !hasCompany && !hasPrimaryScope) {
            return 'global';
        }
        if (hasAgent && !hasUser && !hasCompany) {
            return 'agent-only';
        }
        if (!hasAgent && hasUser && !hasCompany) {
            return 'user-only';
        }
        if (!hasAgent && !hasUser && hasCompany) {
            return 'company-only';
        }
        if (hasPrimaryScope && !hasUser) {
            return 'company';
        }
        if (hasPrimaryScope && hasUser) {
            return 'user';
        }
        return 'combined';
    }

    /**
     * Inject notes and examples into agent context memory.
     * Called automatically before agent execution if injection is enabled on the agent.
     * Injects memory context directly into conversation messages array.
     *
     * @param input - The user input text for semantic search
     * @param agent - The agent configuration entity
     * @param userId - Optional user ID for scoping
     * @param companyId - Optional company ID for scoping
     * @param contextUser - User context
     * @param conversationMessages - The conversation messages array to inject into
     * @param primaryScopeEntityId - Optional primary scope entity ID for multi-tenant filtering
     * @param primaryScopeRecordId - Optional primary scope record ID for multi-tenant filtering
     * @param secondaryScopes - Optional secondary scope dimensions for multi-tenant filtering
     * @param secondaryScopeConfig - Optional agent-level scope config for per-dimension inheritance
     * @returns Object containing injected notes and examples
     */
    protected async InjectContextMemory(
        input: string,
        agent: MJAIAgentEntityExtended,
        userId?: string,
        companyId?: string,
        contextUser?: UserInfo,
        conversationMessages?: ChatMessage[],
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        secondaryScopeConfig?: SecondaryScopeConfig | null
    ): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        // Delegate the orchestration to the shared, reusable builder so both BaseAgent and the
        // Realtime agent type inject memory identically. The observability context and verbose
        // status logging are derived from this instance and passed through.
        const observability = this._agentRun
            ? { agentRunID: this._agentRun.ID, stepNumber: (this._agentRun.Steps?.length || 0) + 1 }
            : undefined;

        const result = await new AgentMemoryContextBuilder().InjectContextMemory(
            input,
            agent,
            userId,
            companyId,
            contextUser,
            conversationMessages,
            primaryScopeEntityId,
            primaryScopeRecordId,
            secondaryScopes,
            secondaryScopeConfig,
            observability,
            (message, verboseOnly) => this.logStatus(message, verboseOnly)
        );

        // Store for inclusion in result (externally observable behavior preserved)
        this._injectedMemory = result;

        return result;
    }

    /**
     * Inject pre-execution RAG context for this agent using scoped search.
     *
     * Runs in parallel with `InjectContextMemory` during Phase 2 of `Execute()`. Loads the
     * agent's `AIAgentSearchScope` rows (Phase IN 'PreExecution'|'Both'), renders any per-scope
     * query templates, calls `SearchEngine.Search()` per scope, cross-scope RRF fuses the
     * results when multiple scopes contributed, and unshifts a `<retrieved_context>` system
     * message onto `conversationMessages`.
     *
     * When the agent has no active pre-execution scopes (or all scopes returned zero results),
     * this method is a no-op — no system message is injected and `_injectedRAG` stays null.
     *
     * See plans/search-scopes-rag-plus.md §4 (Agent Integration — Pre-Execution RAG).
     *
     * @param lastUserMessage - The most recent user message text.
     * @param agent - The agent being executed.
     * @param contextUser - Calling user (threaded to SearchEngine + Metadata).
     * @param conversationMessages - The mutated message array that flows to the LLM (system msg is unshifted here).
     * @param originalMessages - The unmodified messages array (for template `recentMessages`).
     * @param primaryScopeEntityId - Multi-tenant primary scope entity ID.
     * @param primaryScopeRecordId - Multi-tenant primary scope record ID.
     * @param secondaryScopes - Multi-tenant secondary scope dimensions.
     * @param payload - The agent's current payload (for template rendering).
     * @returns The structured RAG result, or `null` if no scopes produced results.
     */
    protected async InjectPreExecutionRAG(
        lastUserMessage: string,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        conversationMessages: ChatMessage[] | undefined,
        originalMessages: ChatMessage[] | undefined,
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        payload?: unknown
    ): Promise<AgentPreExecutionRAGResult | null> {
        // Delegate to the shared builder so the Realtime agent type injects pre-execution RAG
        // identically. Verbose status + non-fatal error logging are threaded through from this instance.
        const result = await new AgentMemoryContextBuilder().InjectPreExecutionRAG(
            lastUserMessage,
            agent,
            contextUser,
            conversationMessages,
            originalMessages,
            primaryScopeEntityId,
            primaryScopeRecordId,
            secondaryScopes,
            payload,
            (message, verboseOnly) => this.logStatus(message, verboseOnly),
            (error, options) => this.logError(error, options)
        );

        // Store for inclusion in result (externally observable behavior preserved)
        this._injectedRAG = result;
        return result;
    }

    /**
     * Converts UI markup (@{...} syntax) in user messages to plain text.
     * This prevents agents from being confused by UI-specific JSON syntax and reduces token usage.
     *
     * Modifies the messages in-place, converting:
     * - Mentions: @{_mode:"mention",...} → "@Agent Name" or "@User Name"
     * - Form responses: @{_mode:"form",...} → "Field1: Value1, Field2: Value2"
     *
     * @param messages - The conversation messages array to convert (modified in-place)
     */
    protected convertUIMarkupInMessages(messages: ChatMessage[]): void {
        if (!messages || messages.length === 0) {
            return;
        }

        for (const message of messages) {
            // Only convert user messages (skip system and assistant messages)
            if (message.role !== 'user') {
                continue;
            }

            // Handle string content
            if (typeof message.content === 'string') {
                message.content = ConversationUtility.ToPlainText(message.content);
            }
            // Handle content blocks (for multimodal messages)
            else if (Array.isArray(message.content)) {
                for (const block of message.content) {
                    if (block.type === 'text' && typeof block.content === 'string') {
                        block.content = ConversationUtility.ToPlainText(block.content);
                    }
                }
            }
        }
    }

    /**
     * Validates that there are no circular references in the run chain.
     * Follows the LastRunID chain to ensure it doesn't loop back to the current run.
     * 
     * @param {string} lastRunId - The ID of the last run to check
     * @param {UserInfo} [contextUser] - Optional user context
     * @private
     */
    private async validateRunChain(lastRunId: string, contextUser?: UserInfo): Promise<void> {
        const visitedRunIds = new Set<string>();
        visitedRunIds.add(this._agentRun!.ID); // Add current run ID
        
        let currentRunId = lastRunId;
        const maxChainLength = 1000; // Reasonable limit to prevent infinite loops
        let chainLength = 0;
        
        while (currentRunId) {
            // Check if we've seen this run ID before
            if (visitedRunIds.has(currentRunId)) {
                throw new Error(`Circular reference detected in run chain. Run ID '${currentRunId}' creates a loop.`);
            }
            
            // Check chain length
            if (++chainLength > maxChainLength) {
                throw new Error(`Run chain exceeds maximum length of ${maxChainLength}. This may indicate a data issue.`);
            }
            
            visitedRunIds.add(currentRunId);
            
            // Load the run to check its LastRunID
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${currentRunId}'`,
                ResultType: 'simple'
            }, contextUser);
            
            if (!result.Success || result.Results.length === 0) {
                // Run not found, chain ends here
                break;
            }
            
            // Get the LastRunID from this run to continue checking
            currentRunId = result.Results[0].LastRunID;
        }
    }

    /**
     * Validates that the agent is active and ready for execution.
     * 
     * @param {MJAIAgentEntityExtended} agent - The agent to validate
     * @returns {ExecuteAgentResult | null} Error result if validation fails, null if valid
     * @protected
     */
    protected async validateAgent(agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        if (agent.Status !== 'Active') {
            // Set error on the agent run
            if (this._agentRun) {
                this._agentRun.ErrorMessage = `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
            }
            return {
                success: false,
                agentRun: this._agentRun!
            };
        }
        return null;
    }

    /**
     * Handles validation of the starting payload if configured.
     * 
     * This method validates the input payload against the agent's StartingPayloadValidation
     * schema before execution begins. It respects the agent's PayloadScope if configured.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @returns {Promise<ExecuteAgentResult | null>} Error result if validation fails and mode is 'Fail', null otherwise
     * @protected
     */
    protected async handleStartingPayloadValidation<P = any>(params: ExecuteAgentParams<any, P>): Promise<ExecuteAgentResult | null> {
        const agent = params.agent;
        
        // Skip if no validation configured or no payload provided
        if (!agent.StartingPayloadValidation || params.payload === undefined) {
            return null;
        }

        try {
            // Parse the validation schema
            let validationSchema: any;
            try {
                validationSchema = JSON.parse(agent.StartingPayloadValidation);
            } catch (parseError) {
                this.logError(`Invalid StartingPayloadValidation JSON for agent ${agent.Name}: ${parseError.message}`, {
                    category: 'StartingPayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.StartingPayloadValidation
                    }
                });
                // Invalid schema, skip validation
                return null;
            }

            // Determine which payload to validate based on PayloadScope
            let payloadToValidate = params.payload;

            // Validate the payload using JSONValidator
            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
                // Validation failed
                const errorMessages = validationResult.Errors.map(e => e.Message);
                return this.handleStartingValidationFailure(params, errorMessages);
            }

            // Validation passed
            this.logStatus(`✅ Starting payload validation passed for agent ${agent.Name}`, true, params);
            return null;

        } catch (error) {
            this.logError(`Unexpected error during starting payload validation: ${error.message}`, {
                category: 'StartingPayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: error.message
                }
            });
            // On unexpected errors, let execution proceed
            return null;
        }
    }

    /**
     * Handles starting payload validation failures based on the configured mode.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @param {string[]} errorMessages - The validation error messages
     * @returns {ExecuteAgentResult | null} Error result if mode is 'Fail', null if mode is 'Warn'
     * @private
     */
    private handleStartingValidationFailure(
        params: ExecuteAgentParams,
        errorMessages: string[]
    ): ExecuteAgentResult | null {
        const mode = params.agent.StartingPayloadValidationMode || 'Fail';
        const validationFeedback = `Starting payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        if (mode === 'Fail') {
            this.logError(`Starting payload validation failed for agent ${params.agent.Name}`, {
                agent: params.agent,
                category: 'StartingPayloadValidation',
                metadata: { errors: errorMessages }
            });

            // Update agent run with validation failure
            if (this._agentRun) {
                this._agentRun.ErrorMessage = validationFeedback;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
                // Note: We don't save here as the agent run will be saved in finalizeAgentRun()
            }

            return {
                success: false,
                agentRun: this._agentRun!,
                payload: params.payload // must pass back the original payload for consistency
            };
        } else { // if (mode === 'Warn') {
            // Log warning but continue execution
            this.logStatus(
                `⚠️ WARNING: ${validationFeedback}`,
                false,
                params
            );
            return null;
        }
    }

    /**
     * Loads all required configuration for agent execution.
     * 
     * @param {MJAIAgentEntityExtended} agent - The agent to load configuration for
     * @returns {Promise<AgentConfiguration>} Configuration object with loaded entities
     * @protected
     */
    protected async loadAgentConfiguration(agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        const engine = AIEngine.Instance;

        // first check to see if we have a custom driver class if we do, we do NOT validate the rest of
        // the metadata as the custom sub-class can do whatever it wants with/without prompts/etc.
        let metadataOptional: boolean = false;
        if (agent.DriverClass) {
            this.logStatus(`🔧 Using custom driver class '${agent.DriverClass}' for agent '${agent.Name}'`, true);   
            metadataOptional = true;
        }

        // Find the agent type
        const agentType = engine.AgentTypes.find(at => UUIDsEqual(at.ID, agent.TypeID));
        if (!agentType && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type not found for ID: ${agent.TypeID}`
            };
        }

        // Get the agent type instance to check if agent-level prompts are required
        const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(agentType);
        const requiresAgentLevelPrompts = agentTypeInstance.RequiresAgentLevelPrompts;

        // Find the system prompt (optional for some agent types)
        const systemPrompt = engine.Prompts.find(p => UUIDsEqual(p.ID, agentType.SystemPromptID));

        if (!systemPrompt) {
            metadataOptional = true; // If no system prompt, we can skip some validations
        }

        // Find the first active agent prompt (optional for agent types that don't require them)
        const agentPrompt = engine.AgentPrompts
            .filter(ap => UUIDsEqual(ap.AgentID, agent.ID) && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];

        if (!agentPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`
            };
        }

        // Find the actual prompt entity (will be undefined for agent types with only step-level prompts)
        const childPrompt = agentPrompt ? engine.Prompts.find(p => UUIDsEqual(p.ID, agentPrompt.PromptID)) : undefined;

        if (!childPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `Child prompt not found for ID: ${agentPrompt?.PromptID}`
            };
        }

        // Validate placeholder configuration
        if (!agentType.AgentPromptPlaceholder && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type '${agentType.Name}' does not have AgentPromptPlaceholder configured.`
            };
        }

        return {
            success: true,
            agentType,
            systemPrompt,
            childPrompt
        };
    }

    /**
     * Prepares prompt parameters for hierarchical execution.
     * 
     * @param {MJAIAgentTypeEntity} agentType - The agent type
     * @param {MJAIPromptEntityExtended} systemPrompt - The system prompt
     * @param {MJAIPromptEntityExtended} childPrompt - The child prompt
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @returns {Promise<AIPromptParams>} Configured prompt parameters
     * @protected
     */
    protected async preparePromptParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const agentType: MJAIAgentTypeEntity = config.agentType;
        const systemPrompt: MJAIPromptEntityExtended = config.systemPrompt;
        const childPrompt: MJAIPromptEntityExtended = config.childPrompt;

        // Gather context data (including runtime action changes)
        const promptTemplateData = await this.gatherPromptTemplateData(
            params.agent,
            params.contextUser,
            params.data,
            params.actionChanges,
            params.subAgentChanges
        );

        // Set up the hierarchical prompt execution
        const promptParams = new AIPromptParams();
        
        // Handle case where systemPrompt is optional (e.g., Flow Agent Type)
        if (systemPrompt) {
            promptParams.prompt = systemPrompt;
            promptParams.templateMessageRole = 'system';
        } else {
            // For agents without system prompts, use the child prompt directly
            promptParams.prompt = childPrompt;
            promptParams.templateMessageRole = 'user';
        }
        
        promptParams.data = promptTemplateData;
        promptParams.agentRunId = this.AgentRun?.ID;
        promptParams.contextUser = params.contextUser;
        promptParams.conversationMessages = params.conversationMessages;
        promptParams.verbose = params.verbose; // Pass through verbose flag

        // Apply effortLevel with precedence hierarchy
        // 1. params.effortLevel (ExecuteAgentParams - highest priority)
        // 2. agent.DefaultPromptEffortLevel (agent default - medium priority)  
        // 3. prompt.EffortLevel (handled by AIPromptRunner - lowest priority)
        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            promptParams.effortLevel = params.effortLevel;
            this.logStatus(`🎯 Using runtime effort level: ${params.effortLevel}`, true, params);
        } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
            promptParams.effortLevel = params.agent.DefaultPromptEffortLevel;
            this.logStatus(`🎯 Using agent default effort level: ${params.agent.DefaultPromptEffortLevel}`, true, params);
        } else {
            // If neither is set, effortLevel remains undefined and will fall back to prompt.EffortLevel in AIPromptRunner
            // the issue thought is we really want the childPrompt.EffortLevel so we need to grab that and
            // put it in place
            if (childPrompt && childPrompt.EffortLevel !== undefined && childPrompt.EffortLevel !== null) {
                promptParams.effortLevel = childPrompt.EffortLevel;
                this.logStatus(`🎯 Using child prompt effort level: ${childPrompt.EffortLevel}`, true, params);
            }
            // if the child prompt doesn't have an effort level defined, we default back
            // to the parent prompt effort level, if any
        }

        // before we execute the prompt, we ask our Agent Type to inject the
        // payload - as the way a payload is injected is dependent on the agent type and its
        // prompting strategy. At this level in BaseAgent we don't know the format, location etc
        // NOTE: We do this even if payload is empty, each agent type can have its own
        //       logic for handling empty payloads.
        const atInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        await atInstance.InjectPayload<P>(payload, this.AgentTypeState, promptParams, {
            agentId: params.agent.ID,
            agentRunId: this._agentRun?.ID
        });

        // Inject scratchpad template variables if scratchpad is enabled
        if (promptParams.data) {
            const agentTypePromptParams = promptParams.data.__agentTypePromptParams as Record<string, unknown> | undefined;
            const scratchpadEnabled = agentTypePromptParams?.includeScratchpadDocs !== false;
            if (scratchpadEnabled && this._scratchpadManager) {
                promptParams.data['_SCRATCHPAD_NOTES'] = this._scratchpadManager.GetNotes() || '_(no notes yet)_';
                promptParams.data['_SCRATCHPAD_TASKS'] = this._scratchpadManager.ToPromptString();
                promptParams.data['_SCRATCHPAD_TASK_SUMMARY'] = this._scratchpadManager.GetTaskSummary();
            }

            // Inject artifact tools template variables if enabled and artifacts are present.
            // Note: prior tool results are NO LONGER injected via a per-turn template var.
            // They are pushed into conversationMessages as a one-shot 'tool-result'
            // message at execution time (see injectArtifactToolResultsMessage) and decay
            // via pruneAndCompactExpiredMessages — same lifecycle as action results.
            const artifactToolsEnabled = agentTypePromptParams?.includeArtifactToolsDocs !== false;
            if (artifactToolsEnabled && this._artifactToolManager.HasArtifacts()) {
                promptParams.data['_ARTIFACT_MANIFEST'] = this._artifactToolManager.ToManifestString();
                promptParams.data['_ARTIFACT_TOOLS'] = this._artifactToolManager.GetToolDocumentation();
                promptParams.data['_ARTIFACT_TOOL_SUMMARY'] = this._artifactToolManager.GetSummary();
                this.logStatus(`[ArtifactTools] Injected manifest into prompt: ${this._artifactToolManager.GetSummary()}`, true, params);
            } else if (this._artifactToolManager.HasArtifacts()) {
                this.logStatus(`[ArtifactTools] Artifacts present but tools disabled by agent config (includeArtifactToolsDocs=false)`, true, params);
            }

            // Enable the memory-writes response field + docs only for agents that opted in
            // via AllowMemoryWrite. Disabled agents never see the docs, so a well-behaved
            // LLM never emits the field (the turn loop still guards against drift).
            const memoryWritesDocsEnabled = agentTypePromptParams?.includeMemoryWritesDocs !== false;
            if (memoryWritesDocsEnabled && params.agent.AllowMemoryWrite === true) {
                promptParams.data['_MEMORY_WRITES_ENABLED'] = true;
            }

            // Inject pipeline tool docs when pipelines are enabled and at least one source exists.
            // A pipeline's first step must be a source (Action or artifact tool); with none
            // available pipelines are impossible, so BuildPipelineToolDocs returns '' and the
            // template's `{{ _PIPELINE_TOOLS }}` block stays empty.
            const pipelineDocsEnabled = agentTypePromptParams?.includePipelineDocs !== false;
            if (pipelineDocsEnabled) {
                const sourceNames = [
                    ...this.getEffectiveActionsForValidation(params.agent.ID).map((a) => a.Name),
                    ...this._artifactToolManager.GetAvailableToolNames(),
                ];
                const pipelineDocs = BuildPipelineToolDocs(sourceNames);
                if (pipelineDocs) {
                    promptParams.data['_PIPELINE_TOOLS'] = pipelineDocs;
                }
            }

            // Pass file artifacts as candidate native file inputs.
            // The AIPromptRunner will check these against the resolved driver's
            // FileCapabilities and attach qualifying files as native content blocks.
            // When the driver doesn't support a file type, the runner falls back to
            // the pre-extracted TextContent on each candidate.
            if (this._artifactToolManager.HasArtifacts()) {
                promptParams.nativeFileInputs = await this._artifactToolManager.GetNativeFileInputCandidates();
            }
        }

        // Only set up child prompts if we have a system prompt
        if (systemPrompt) {
            // Setup child prompt parameters
            const childPromptParams: AIPromptParams = {
                prompt: childPrompt,
                data: promptTemplateData,
                contextUser: params.contextUser,
                conversationMessages: params.conversationMessages,
                templateMessageRole: 'user',
                verbose: params.verbose,
                agentRunId: this.AgentRun?.ID
            };

            // Pass through effortLevel to child prompt (same precedence hierarchy)
            if (params.effortLevel !== undefined && params.effortLevel !== null) {
                childPromptParams.effortLevel = params.effortLevel;
            } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
                childPromptParams.effortLevel = params.agent.DefaultPromptEffortLevel;
            }
            
            // Pass through API keys to child prompt if provided
            if (params.apiKeys && params.apiKeys.length > 0) {
                childPromptParams.apiKeys = params.apiKeys;
            }
            
            // Pass through configurationId to both parent and child prompts if provided
            if (params.configurationId) {
                promptParams.configurationId = params.configurationId;
                childPromptParams.configurationId = params.configurationId;
            }
            
            promptParams.childPrompts = [
                new ChildPromptParam(
                    childPromptParams,
                    agentType.AgentPromptPlaceholder
                )
            ];
        } else {
            // Pass through API keys and configuration ID for direct prompt execution
            if (params.apiKeys && params.apiKeys.length > 0) {
                promptParams.apiKeys = params.apiKeys;
            }
            if (params.configurationId) {
                promptParams.configurationId = params.configurationId;
            }
        }

        // Handle model selection mode
        if (params.agent.ModelSelectionMode === 'Agent') {
            // Use the child prompt (agent's specific prompt) for model selection
            promptParams.modelSelectionPrompt = childPrompt;
            this.logStatus(`🎯 Agent '${params.agent.Name}' configured to use its own prompt for model selection`, true, params);
        }
        // Default behavior is 'Agent Type', which uses the parent system prompt

        // Handle runtime override if provided
        if (params.override) {
            promptParams.override = params.override;
            this.logStatus(`🎯 Using runtime override: ${params.override.modelId || 'model'} ${params.override.vendorId ? `from vendor ${params.override.vendorId}` : ''}`, true, params);
        }

        // Pass through API keys if provided
        if (params.apiKeys && params.apiKeys.length > 0) {
            promptParams.apiKeys = params.apiKeys;
            this.logStatus(`🔑 Using ${params.apiKeys.length} API key(s) provided at runtime`, true, params);
        }

        // Thread the per-request provider so prompt run records are saved through the isolated provider
        promptParams.provider = params.provider || this._activeProvider;

        return promptParams;
    }

    /**
     * Executes the configured prompt. Always uses the attemptJSONRepair option to try to fix LLM
     * JSON syntax issues if they arise.
     * 
     * @param {AIPromptParams} promptParams - The prompt parameters
     * @returns {Promise<AIPromptRunResult>} The prompt execution result
     * @protected
     */
    protected async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        const newParams = {
            ...promptParams,
            attemptJSONRepair: true 
        }
        return await this._promptRunner.ExecutePrompt(newParams);
    }

    /**
     * Base class method that determines the next step by contacting the agent type class for the specified agent type and delegating
     * that decision. Sub-classes can override this method to implement custom next step logic if needed.
     * @param params 
     * @param agentType 
     * @param promptResult 
     * @returns 
     */
    protected async determineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P>> {
        // Let the agent type determine the next step
        this.logStatus(`🎯 Agent type '${agentType.Name}' determining next step`, true, params);
        const nextStep = await this.AgentTypeInstance.DetermineNextStep<P>(promptResult, params, currentPayload, this.AgentTypeState);
        return nextStep;
    }


    /**
     * Validates if the next step is valid, or not. If the next step is invalid, it returns a retry step with an error message
     * that can be processed by the agent via a retry prompt to attempt to correct the issue. Alternatively, subclasses can
     * handle this scenario differently as desired. 
     * 
     * The BaseAgent class implements checking for sub-agents and actions to ensure that the next step is valid in the 
     * context of the current agent. If the next step is a sub-agent, it checks if the sub-agent is active and available for execution.
     * If the next step is actions, it checks if the actions are valid and available for execution.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // for next step, let's do a little quick validation here for sub-agent and actions to ensure requests are valid
        switch (nextStep.step) {
            case 'Sub-Agent':           
                return this.validateSubAgentNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Actions':
                return this.validateActionsNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Success':
                return this.validateSuccessNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Chat':
                return this.validateChatNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Retry':
                return this.validateRetryNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Failed':
                return this.validateFailedNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'ForEach':
                // ForEach loops are valid - no additional validation needed
                return nextStep;
            case 'While':
                // While loops are valid - no additional validation needed
                return nextStep;
            case 'ClientTools' as typeof nextStep.step:
                // Client tools are valid - execution handled by executeClientToolsStep
                return nextStep;
            default:
                // if we get here, the next step is not recognized, we can return a retry step
                this.logError(`Invalid next step '${nextStep.step}' for agent '${params.agent.Name}'`, {
                    agent: params.agent,
                    category: 'NextStepValidation'
                });
                return {
                    step: 'Failed',
                    terminate: true, // final condition
                    errorMessage: `Invalid next step '${nextStep.step}'`
                };
        }
    }

    /**
     * Validates that the sub-agent next step is valid and can be executed by the current agent. Subclasses can override 
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    /**
     * Returns the list of sub-agent requests on a next-step decision, normalizing
     * the singular (`subAgent`) and plural (`subAgents`) forms. Plural takes
     * precedence when both are present (parallel fan-out); otherwise the singular
     * form is wrapped into a single-element array. Empty if neither is set.
     *
     * Use this anywhere code needs to enumerate the sub-agents an LLM requested
     * — keeps validation and execution paths consistent and avoids the regression
     * where one path read `.subAgent?.name` and missed parallel requests.
     */
    protected getRequestedSubAgents<P, C>(
        nextStep: BaseAgentNextStep<P, C> | undefined | null
    ): AgentSubAgentRequest<C>[] {
        if (!nextStep) return [];
        if (nextStep.subAgents && nextStep.subAgents.length > 0) {
            return nextStep.subAgents;
        }
        return nextStep.subAgent ? [nextStep.subAgent] : [];
    }

    protected async validateSubAgentNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const curAgentSubAgents = AIEngine.Instance.GetSubAgents(params.agent.ID, 'Active');

        // Collect requested sub-agents. Prefer plural `subAgents` (parallel fan-out);
        // fall back to singular `subAgent` for the classic single-sub-agent next step.
        const requested = this.getRequestedSubAgents<P, any>(nextStep);

        if (requested.length === 0) {
            this.logError(`Sub-agent 'undefined' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'SubAgentExecution'
            });
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: `Sub-agent 'undefined' not found or not active`
            };
        }

        // Validate each requested sub-agent: existence + MaxExecutionsPerRun
        for (const req of requested) {
            const name = req?.name;
            const subAgent = curAgentSubAgents.find(a => a.Name.trim().toLowerCase() === name?.trim().toLowerCase());

            if (!name || !subAgent) {
                this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
                    agent: params.agent,
                    category: 'SubAgentExecution'
                });
                if (nextStep.step !== 'Retry') {
                    this._generalValidationRetryCount++;
                }
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: `Sub-agent '${name}' not found or not active`
                };
            }

            if (subAgent.MaxExecutionsPerRun != null) {
                const executionCount = await this.getSubAgentExecutionCount(agentRun.ID, subAgent.ID);
                if (executionCount >= subAgent.MaxExecutionsPerRun) {
                    this.logError(`Sub-agent '${name}' has reached its maximum execution limit of ${subAgent.MaxExecutionsPerRun}`, {
                        agent: params.agent,
                        category: 'SubAgentExecution',
                        metadata: {
                            subAgentName: name,
                            executionCount,
                            maxExecutions: subAgent.MaxExecutionsPerRun
                        }
                    });
                    if (nextStep.step !== 'Retry') {
                        this._generalValidationRetryCount++;
                    }
                    return {
                        step: 'Retry',
                        terminate: false,
                        errorMessage: `Sub-agent '${name}' has reached its maximum execution limit of ${subAgent.MaxExecutionsPerRun}`
                    };
                }
            }
        }

        // All requested sub-agents are valid
        return nextStep;
    }

    /**
     * Validates that the actions next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params
     * @param nextStep
     * @returns
     */
    protected async validateActionsNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Use effective actions which includes runtime action changes (populated in gatherPromptTemplateData)
        // Fall back to database-configured actions if _effectiveActions is empty
        const effectiveActions = this.getEffectiveActionsForValidation(params.agent.ID);

        // Also get the database-configured agent actions for MaxExecutionsPerRun lookup
        const dbAgentActions = AIEngine.Instance.AgentActions.filter(
            aa => UUIDsEqual(aa.AgentID, params.agent.ID) && aa.Status === 'Active'
        );

        const missingActions = nextStep.actions?.filter(action => {
            const actionName = action.name.trim().toLowerCase();

            // Try exact match first against effective actions (by Name property)
            const exactMatch = effectiveActions.find(a =>
                a.Name.trim().toLowerCase() === actionName
            );
            if (exactMatch) return false;  // Found exact match, not missing

            // Fallback: Try CONTAINS search for partial matches
            const containsMatches = effectiveActions.filter(a =>
                a.Name.trim().toLowerCase().includes(actionName)
            );

            if (containsMatches.length === 1) {
                // Exactly one partial match - use it and update action name
                const correctedName = containsMatches[0].Name;
                this.logStatus(`Action name fuzzy matched: '${action.name}' → '${correctedName}'`, true, params);
                action.name = correctedName;  // Update to correct full name
                return false;  // Found via contains, not missing
            }

            // No matches or ambiguous (multiple matches) - it's missing
            if (containsMatches.length > 1) {
                this.logStatus(`Ambiguous action name '${action.name}' matches ${containsMatches.length} actions: ${containsMatches.map(a => a.Name).join(', ')}`, true, params);
            }
            return true;
        });

        // we should have zero missing actions, if we do, we need to log an error and return a retry step
        if (missingActions && missingActions.length > 0) {
            const missingActionNames = missingActions.map(a => a.name).join(', ');
            const availableActionNames = effectiveActions.map(a => a.Name).join(', ');
            this.logError(`Actions '${missingActionNames}' not found or not active for agent '${params.agent.Name}'. Available actions: ${availableActionNames}`, {
                agent: params.agent,
                category: 'ActionExecution'
            });
            // Increment validation retry count since we're changing to Retry
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false, // this will kick it back to the prompt to run again
                errorMessage: `Actions '${missingActionNames}' not found or not active. Available: ${availableActionNames}`
            };
        }

        // Check MaxExecutionsPerRun limits for each action
        if (nextStep.actions) {
            const violatedActions: string[] = [];

            for (const action of nextStep.actions) {
                const actionEntity = effectiveActions.find(a =>
                    a.Name.trim().toLowerCase() === action.name.trim().toLowerCase()
                );

                if (!actionEntity) continue;

                // Check for limit from database-configured agent action
                const dbAgentAction = dbAgentActions.find(aa => UUIDsEqual(aa.ActionID, actionEntity.ID));
                let maxExecutions: number | null = null;

                if (dbAgentAction?.MaxExecutionsPerRun != null) {
                    // Database-configured action with limit
                    maxExecutions = dbAgentAction.MaxExecutionsPerRun;
                } else if (this._dynamicActionLimits[actionEntity.ID] != null) {
                    // Dynamically added action with limit from actionChanges
                    maxExecutions = this._dynamicActionLimits[actionEntity.ID];
                }

                if (maxExecutions != null) {
                    const executionCount = await this.getActionExecutionCount(agentRun.ID, actionEntity.ID);
                    if (executionCount >= maxExecutions) {
                        violatedActions.push(`${action.name} (limit: ${maxExecutions}, current: ${executionCount})`);
                    }
                }
            }

            if (violatedActions.length > 0) {
                const violationMessage = `Actions have reached execution limits: ${violatedActions.join(', ')}`;
                this.logError(violationMessage, {
                    agent: params.agent,
                    category: 'ActionExecution',
                    metadata: {
                        violatedActions
                    }
                });
                // Increment validation retry count since we're changing to Retry
                if (nextStep.step !== 'Retry') {
                    this._generalValidationRetryCount++;
                }
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: violationMessage
                };
            }
        }

        // if we get here, the next step is valid and we can return it
        return nextStep;
    }

    /**
     * Gets the effective actions for validation, using runtime changes if available.
     * Falls back to database-configured actions if _effectiveActions is empty.
     *
     * @param agentId - The ID of the agent to get actions for
     * @returns Array of effective actions available to the agent
     * @protected
     * @since 2.123.0
     */
    protected getEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[] {
        if (this._effectiveActions.length > 0) {
            return this._effectiveActions;
        }

        // Fallback: compute from database configuration
        const agentActions = AIEngine.Instance.AgentActions.filter(
            aa => UUIDsEqual(aa.AgentID, agentId) && aa.Status === 'Active'
        );
        return ActionEngineServer.Instance.Actions.filter(a =>
            agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID)) && a.Status === 'Active'
        );
    }

    /**
     * Validates that the Success next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // First check minimum execution requirements
        const minViolations = await this.checkMinimumExecutionRequirements(params.agent, agentRun);
        if (minViolations.length > 0) {
            const violationMessage = `Minimum execution requirements not met:\n${minViolations.join('\n')}`;
            this.logError(violationMessage, {
                agent: params.agent,
                category: 'MinimumExecutionValidation'
            });
            
            // Increment validation retry count since we're changing to Retry
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: violationMessage
            };
        }

        // Check if the agent has FinalPayloadValidation configured
        const agent = params.agent;
        if (!agent.FinalPayloadValidation || !currentPayload) {
            // No validation configured or no payload to validate
            return nextStep;
        }

        try {
            // Parse the validation schema/example
            let validationSchema: any;
            try {
                validationSchema = JSON.parse(agent.FinalPayloadValidation);
            } catch (parseError) {
                this.logError(`Invalid FinalPayloadValidation JSON for agent ${agent.Name}: ${parseError.message}`, {
                    category: 'PayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.FinalPayloadValidation
                    }
                });
                // Invalid schema, skip validation
                return nextStep;
            }

            // Determine which payload to validate based on PayloadScope
            let payloadToValidate = currentPayload;
            if (agent.PayloadScope) {
                // For scoped agents, validate only the scoped portion
                payloadToValidate = this._payloadManager.applyPayloadScope(currentPayload, agent.PayloadScope) as P;
                if (payloadToValidate === null) {
                    // Scope doesn't exist, this is already a validation failure
                    const errorMessage = `PayloadScope '${agent.PayloadScope}' not found in payload`;
                    return this.handleFinalPayloadValidationFailure(
                        params,
                        nextStep,
                        currentPayload,
                        agent.FinalPayloadValidationMode || 'Retry',
                        [errorMessage],
                        agentRun,
                        currentStep
                    );
                }
            }

            // Validate the payload against the schema using JSONValidator
            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
                // Validation failed
                const mode = agent.FinalPayloadValidationMode || 'Retry';
                const errorMessages = validationResult.Errors.map(e => e.Message);
                
                this.logStatus(`⚠️ Final payload validation failed for agent ${agent.Name} (mode: ${mode}):`, true, params);
                errorMessages.forEach((error, index) => {
                    this.logStatus(`   ${index + 1}. ${error}`, true, params);
                });

                return this.handleFinalPayloadValidationFailure(
                    params,
                    nextStep,
                    currentPayload,
                    mode,
                    errorMessages,
                    agentRun,
                    currentStep
                );
            }

            // Validation passed
            this.logStatus(`✅ Final payload validation passed for agent ${agent.Name}`, true, params);
            
            // Save success result to step
            try {
                currentStep.FinalPayloadValidationResult = 'Pass';
                currentStep.FinalPayloadValidationMessages = null; // Clear any previous messages
                await currentStep.Save();
            } catch (error) {
                this.logError(`Failed to save validation success result: ${error.message}`, {
                    category: 'PayloadValidation', 
                    metadata: { stepId: currentStep.ID }
                });
            }
            
            return nextStep;

        } catch (error) {
            this.logError(`Unexpected error during final payload validation: ${error.message}`, {
                category: 'PayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: error.message
                }
            });
            // On unexpected errors, let the success proceed
            return nextStep;
        }
    }

    /**
     * Handles final payload validation failures based on the configured mode.
     * 
     * @param params - Execution parameters
     * @param nextStep - The original success next step
     * @param currentPayload - The current payload
     * @param mode - The validation mode (Retry, Fail, Warn)
     * @param errorMessages - The validation error messages
     * @returns Modified next step based on validation mode
     */
    protected async handleFinalPayloadValidationFailure<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        mode: string,
        errorMessages: string[],
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const validationFeedback = `Final payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        // Always save validation results to the new fields
        try {
            currentStep.FinalPayloadValidationMessages = errorMessages.join('; ');
            
            switch (mode) {
                case 'Retry':
                    // Increment retry counter
                    this._validationRetryCount++;
                    
                    // Check if max retries exceeded
                    const maxRetries = params.agent.FinalPayloadValidationMaxRetries || 3;
                    if (this._validationRetryCount >= maxRetries) {
                        // Max retries exceeded, force to Fail
                        this.logStatus(`❌ Max validation retries (${maxRetries}) exceeded, forcing failure`, false, params);
                        
                        currentStep.FinalPayloadValidationResult = 'Fail';
                        await currentStep.Save();
                        
                        return {
                            ...nextStep,
                            step: 'Failed',
                            message: `${validationFeedback}\n\nMax validation retries (${maxRetries}) exceeded.`,
                            terminate: true
                        };
                    }
                    
                    // Still have retries left
                    currentStep.FinalPayloadValidationResult = 'Retry';
                    await currentStep.Save();
                    
                    this.logStatus(`🔄 Validation retry ${this._validationRetryCount}/${maxRetries}`, true, params);
                    
                    return {
                        ...nextStep,
                        step: 'Retry',
                        retryInstructions: `${validationFeedback}\n\nRetry attempt ${this._validationRetryCount} of ${maxRetries}`,
                        terminate: false
                    };

                case 'Fail':
                    // Convert success to error
                    currentStep.FinalPayloadValidationResult = 'Fail';
                    await currentStep.Save();
                    
                    return {
                        ...nextStep,
                        step: 'Failed',
                        message: validationFeedback,
                        terminate: true
                    };

                case 'Warn':
                    // Log warning but allow success
                    this.logStatus(`⚠️ WARNING: ${validationFeedback}`, false, params);
                    
                    currentStep.FinalPayloadValidationResult = 'Warn';
                    await currentStep.Save();
                    
                    return nextStep; // Return original success

                default:
                    // Default to retry
                    this._validationRetryCount++;
                    currentStep.FinalPayloadValidationResult = 'Retry';
                    await currentStep.Save();
                    
                    return {
                        ...nextStep,
                        step: 'Retry',
                        retryInstructions: validationFeedback,
                        terminate: false
                    };
            }
        } catch (error) {
            this.logError(`Failed to save validation results: ${error.message}`, {
                category: 'PayloadValidation',
                metadata: { stepId: currentStep.ID }
            });
            // Still return the appropriate result even if save failed
            return mode === 'Warn' ? nextStep : {
                ...nextStep,
                step: mode === 'Fail' ? 'Failed' : 'Retry',
                message: validationFeedback,
                terminate: mode === 'Fail'
            };
        }
    }

    /**
     * Validates that the Failed next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateFailedNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }

    /**
     * Validates that the Retry next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed. The retry step is typically used to
     * handle cases where the agent needs to re-attempt a step due to an error or invalid state.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateRetryNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }

    /**
     * Validates that the Chat next step is valid and can be executed by the current agent. 
     * Implements ChatHandlingOption remapping logic - if the agent has ChatHandlingOption set,
     * the Chat step is remapped to the specified value (Success, Fail, or Retry).
     * Subclasses can override this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Check if the agent has ChatHandlingOption configured
        const chatHandlingOption = params.agent.ChatHandlingOption;
        
        if (chatHandlingOption) {
            // Use a switch to validate and map the ChatHandlingOption value
            let mappedStep: 'Success' | 'Failed' | 'Retry';
            
            switch (chatHandlingOption) {
                case 'Success':
                    mappedStep = 'Success';
                    break;
                case 'Failed':
                    mappedStep = 'Failed';
                    break;
                case 'Retry':
                    mappedStep = 'Retry';
                    break;
                default:
                    // Log error and treat as null (default behavior)
                    LogError(`Invalid ChatHandlingOption value: ${chatHandlingOption}. Expected 'Success', 'Failed', or 'Retry'. Treating as null and allowing Chat to propagate.`);
                    return nextStep;
            }
            
            // Remap the Chat step to the configured option
            const remappedStep: BaseAgentNextStep<P> = {
                ...nextStep,
                step: mappedStep
            };
            
            // Log the remapping for debugging
            if (params.verbose === true || IsVerboseLoggingEnabled()) {
                LogStatus(`Remapping Chat step to ${chatHandlingOption} based on agent's ChatHandlingOption`);
            }
            
            // Re-validate the remapped step using the appropriate validator
            return await this.validateNextStep(params, remappedStep, currentPayload, agentRun, currentStep);
        }
        
        // Default behavior: let Chat propagate up (no remapping)
        return nextStep;
    }


    /**
     * Checks execution guardrails and modifies next step if limits are exceeded.
     * This method is called after validation but before execution of non-terminal steps.
     * 
     * @param params - Execution parameters
     * @param nextStep - The validated next step
     * @param currentPayload - Current payload
     * @param agentRun - Current agent run
     * @param currentStep - Current execution step
     * @returns Modified next step if guardrails exceeded, or original next step
     * @protected
     */
    protected async checkExecutionGuardrails<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Skip guardrail checks for terminal steps
        if (nextStep.step === 'Success' || nextStep.step === 'Failed' || nextStep.step === 'Chat') {
            return nextStep;
        }

        // Check if any guardrails are exceeded
        const guardrailResult = await this.hasExceededAgentRunGuardrails(params, agentRun);
        
        if (guardrailResult.exceeded) {
            // Log the guardrail violation
            this.logStatus(`⛔ Execution guardrail exceeded: ${guardrailResult.reason}`, false, params);
            
            // Update the current step with guardrail information
            try {
                const outputData = currentStep.OutputData ? JSON.parse(currentStep.OutputData) : {};
                currentStep.OutputData = JSON.stringify({
                    ...outputData,
                    guardrailExceeded: {
                        type: guardrailResult.type,
                        limit: guardrailResult.limit,
                        current: guardrailResult.current,
                        reason: guardrailResult.reason,
                        timestamp: new Date().toISOString()
                    }
                });
                await currentStep.Save();
            } catch (error) {
                this.logError(`Failed to save guardrail violation to step: ${error.message}`, {
                    category: 'Guardrails',
                    metadata: { stepId: currentStep.ID }
                });
            }
            
            // Convert next step to Failed with guardrail reason
            return {
                ...nextStep,
                step: 'Failed',
                terminate: true,
                message: guardrailResult.reason,
                errorMessage: guardrailResult.reason
            };
        }
        
        // No guardrails exceeded, return original next step
        return nextStep;
    }

    /**
     * Checks if any agent run guardrails have been exceeded.
     * Override this method to implement custom guardrail logic.
     * 
     * @param params - Execution parameters
     * @param agentRun - Current agent run
     * @returns Object indicating if guardrails exceeded and details
     * @protected
     */
    protected async hasExceededAgentRunGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<{
        exceeded: boolean;
        type?: 'cost' | 'tokens' | 'iterations' | 'time';
        limit?: number;
        current?: number;
        reason?: string;
    }> {
        const agent = params.agent;

        // Check absolute maximum iterations (safety net to prevent infinite loops)
        const DEFAULT_ABSOLUTE_MAX_ITERATIONS = 5000;
        const absoluteMaxIterations = params.absoluteMaxIterations ?? DEFAULT_ABSOLUTE_MAX_ITERATIONS;

        if (agentRun.TotalPromptIterations && agentRun.TotalPromptIterations >= absoluteMaxIterations) {
            return {
                exceeded: true,
                type: 'iterations',
                limit: absoluteMaxIterations,
                current: agentRun.TotalPromptIterations,
                reason: `Absolute maximum iteration safety limit of ${absoluteMaxIterations} exceeded. Current iterations: ${agentRun.TotalPromptIterations}. This is a system-wide safety measure to prevent infinite loops.`
            };
        }

        // Check cost limit
        if (agent.MaxCostPerRun && agentRun.TotalCost) {
            if (agentRun.TotalCost >= agent.MaxCostPerRun) {
                return {
                    exceeded: true,
                    type: 'cost',
                    limit: agent.MaxCostPerRun,
                    current: agentRun.TotalCost,
                    reason: `Maximum cost limit of $${agent.MaxCostPerRun} exceeded. Current cost: $${agentRun.TotalCost.toFixed(4)}`
                };
            }
        }
        
        // Check token limit
        if (agent.MaxTokensPerRun && agentRun.TotalTokensUsed) {
            if (agentRun.TotalTokensUsed >= agent.MaxTokensPerRun) {
                return {
                    exceeded: true,
                    type: 'tokens',
                    limit: agent.MaxTokensPerRun,
                    current: agentRun.TotalTokensUsed,
                    reason: `Maximum token limit of ${agent.MaxTokensPerRun} exceeded. Current tokens: ${agentRun.TotalTokensUsed}`
                };
            }
        }
        
        // Check iteration limit
        if (agent.MaxIterationsPerRun && agentRun.TotalPromptIterations) {
            if (agentRun.TotalPromptIterations >= agent.MaxIterationsPerRun) {
                return {
                    exceeded: true,
                    type: 'iterations',
                    limit: agent.MaxIterationsPerRun,
                    current: agentRun.TotalPromptIterations,
                    reason: `Maximum iteration limit of ${agent.MaxIterationsPerRun} exceeded. Current iterations: ${agentRun.TotalPromptIterations}`
                };
            }
        }
        
        // Check time limit
        if (agent.MaxTimePerRun && agentRun.StartedAt) {
            const elapsedSeconds = Math.floor((Date.now() - new Date(agentRun.StartedAt).getTime()) / 1000);
            if (elapsedSeconds >= agent.MaxTimePerRun) {
                return {
                    exceeded: true,
                    type: 'time',
                    limit: agent.MaxTimePerRun,
                    current: elapsedSeconds,
                    reason: `Maximum time limit of ${agent.MaxTimePerRun} seconds exceeded. Elapsed time: ${elapsedSeconds} seconds`
                };
            }
        }
        
        // Check validation retry limit
        if (this._generalValidationRetryCount >= BaseAgent.MAX_VALIDATION_RETRIES) {
            return {
                exceeded: true,
                type: 'iterations', // Using iterations type since validation retries are a form of iteration
                limit: BaseAgent.MAX_VALIDATION_RETRIES,
                current: this._generalValidationRetryCount,
                reason: `Maximum validation retries of ${BaseAgent.MAX_VALIDATION_RETRIES} exceeded. The agent is unable to produce valid output after ${this._generalValidationRetryCount} validation failures.`
            };
        }
        
        // No guardrails exceeded
        return { exceeded: false };
    }

    /**
     * Determines if a prompt execution error is fatal and should stop agent execution.
     * Fatal errors are those that won't be resolved by retrying, such as context length
     * exceeded (when no larger model is available), authentication failures, or invalid
     * request format.
     *
     * @param promptResult - The result from prompt execution
     * @returns true if the error is fatal and agent should terminate, false otherwise
     * @protected
     */
    protected isFatalPromptError(promptResult: AIPromptRunResult): boolean {
        // First check error message for template rendering errors
        if (promptResult?.errorMessage) {
            const templateErrorPattern = /Failed to render/i;
            if (templateErrorPattern.test(promptResult.errorMessage)) {
                return true; // Template rendering errors are fatal
            }

            // Credential/configuration errors are permanent — retrying won't help.
            // Check by message pattern as a safety net in case errorInfo is missing.
            if (promptResult.errorMessage.includes('No suitable model found') ||
                promptResult.errorMessage.includes('No credentials found') ||
                promptResult.errorMessage.includes('No valid API credentials')) {
                return true;
            }
        }

        // If no error info, not fatal (might be transient)
        if (!promptResult?.chatResult?.errorInfo) {
            return false;
        }

        const errorInfo = promptResult.chatResult.errorInfo;

        // Check severity first - if marked as Fatal by the error analyzer, respect that
        if (errorInfo.severity === 'Fatal') {
            return true;
        }

        // Fatal error types that should stop agent execution immediately
        // These won't be resolved by retrying the same prompt
        const fatalErrorTypes: AIErrorType[] = [
            'ContextLengthExceeded',  // No model can handle this context size (after failover attempts)
            'Authentication',          // API key is invalid or missing
            'NoCredentials',           // No credentials configured for any model-vendor combination
            'InvalidRequest'           // Request format or parameters are wrong
        ];

        return fatalErrorTypes.includes(errorInfo.errorType);
    }

    /**
     * Determines if an error is a configuration error that cannot be resolved by retrying.
     * Configuration errors indicate issues with agent setup that need manual intervention.
     *
     * This method provides detailed diagnostic information to help identify what configuration
     * is missing or incorrect.
     *
     * @param {any} error - The error object or Error instance
     * @param {string} errorMessage - The error message string
     * @param {AgentConfiguration} [config] - Optional agent configuration to check for missing pieces
     * @returns {{isConfigError: boolean, detailedMessage: string}} Object with determination and detailed diagnostic message
     * @protected
     */
    protected isConfigurationError(
        errorMessage: string,
        config?: AgentConfiguration
    ): { isConfigError: boolean; detailedMessage: string } {
        // Extract the property name from the error up front — used by the
        // narrowed classifier below to decide whether this is a genuine config
        // issue or a generic runtime exception that should bubble up normally.
        const propertyMatch = errorMessage.match(/reading '(\w+)'/i);
        const accessedProperty = propertyMatch ? propertyMatch[1].toLowerCase() : '';

        // Only `.map/.x on undefined` errors that reference config-related
        // properties are treated as configuration errors. Generic runtime
        // errors (e.g. a tool handler crashing on `rows.map`) should not
        // terminate the run as "unrecoverable config issue" — they should
        // fail the step and let the agent try to recover.
        const CONFIG_RELATED_PROPERTIES = new Set([
            'prompt', 'childprompt', 'systemprompt', 'prompts',
            'agent', 'agents', 'agenttype', 'agenttypes',
            'model', 'models', 'vendor', 'vendors',
            'template', 'templates',
        ]);
        const isConfigRelatedProperty = accessedProperty !== ''
            && CONFIG_RELATED_PROPERTIES.has(accessedProperty);

        // Check for common configuration error patterns
        const configErrorPatterns = [
            {
                // Only match when the accessed property is config-related.
                // Without this guard, any runtime `.map on undefined` (e.g.
                // in an artifact tool handler) gets misclassified as a fatal
                // configuration error and the agent run terminates.
                pattern: isConfigRelatedProperty
                    ? /cannot read propert(y|ies) of (undefined|null)/i
                    : /__NEVER_MATCH_GENERIC_UNDEFINED_ACCESS__/,
                getMessage: () => {
                    const property = accessedProperty || 'unknown property';

                    let details = `Attempted to access property '${property}' on an undefined or null object.`;

                    // Provide specific guidance based on the property name
                    if (property.toLowerCase().includes('prompt')) {
                        details += `\n\n🔧 Configuration Issue: Missing prompt configuration.`;
                        if (config) {
                            if (!config.childPrompt) {
                                details += `\n   - Agent does not have a child prompt configured`;
                                // Get agent-type-specific guidance
                                if (this.AgentTypeInstance) {
                                    const guidance = this.AgentTypeInstance.GetPromptConfigurationGuidance();
                                    details += `\n${guidance}`;
                                }
                            }
                            if (!config.systemPrompt) {
                                details += `\n   - Agent type does not have a system prompt configured`;
                            }
                        }
                    } else if (property.toLowerCase().includes('agent')) {
                        details += `\n\n🔧 Configuration Issue: Missing agent configuration.`;
                        details += `\n   - Ensure agent type is properly configured`;
                        details += `\n   - Check that agent metadata is complete`;
                    }

                    return details;
                }
            },
            {
                pattern: /childprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    let details = `Agent is missing required child prompt configuration.\n\n` +
                           `🔧 Configuration Fix:\n`;

                    if (this.AgentTypeInstance) {
                        const guidance = this.AgentTypeInstance.GetPromptConfigurationGuidance();
                        details += `${guidance}`;
                    } else {
                        details += `   - Ensure agent has AI Agent Prompts relationship configured\n` +
                                   `   - Verify that prompt exists in AI Prompts table and is active`;
                    }

                    return details;
                }
            },
            {
                pattern: /systemprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    return `Agent type is missing system prompt configuration.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Check agent type's SystemPromptID in AI Agent Types table\n` +
                           `   - Verify system prompt exists and is active\n` +
                           `   - Some agent types (like Flow) may not require system prompts`;
                }
            },
            {
                pattern: /no prompts configured/i,
                getMessage: () => {
                    return `Agent has no prompts configured.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Add at least one AI Agent Prompt relationship to this agent\n` +
                           `   - Or for Flow agents: Add Prompt-type steps to the agent's step graph`;
                }
            },
            {
                pattern: /agent type not found/i,
                getMessage: () => {
                    return `Agent references an agent type that doesn't exist.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Verify TypeID in AI Agents table matches existing AI Agent Types record\n` +
                           `   - Check that AIEngine.Instance.AgentTypes includes the required type\n` +
                           `   - Ensure Config() has been called to load agent types`;
                }
            },
            {
                pattern: /child prompt not found/i,
                getMessage: () => {
                    return `Referenced child prompt doesn't exist or isn't loaded.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Check AI Agent Prompts relationship has valid PromptID\n` +
                           `   - Verify prompt exists in AI Prompts table\n` +
                           `   - Ensure AIEngine.Instance.Prompts includes the prompt`;
                }
            },
            {
                pattern: /agent configuration/i,
                getMessage: () => {
                    return `General agent configuration error.\n\n` +
                           `🔧 Configuration Check:\n` +
                           `   - Review agent metadata in AI Agents table\n` +
                           `   - Check all foreign key relationships are valid\n` +
                           `   - Verify agent type is properly configured`;
                }
            },
            {
                pattern: /Failed to render.*child prompt templates/i,
                getMessage: () => {
                    return `Template rendering error: ${errorMessage}\n\n` +
                           `🔧 Template Configuration Fix:\n` +
                           `   - Check nunjucks template syntax in prompt content\n` +
                           `   - Use {% raw %}{{}}{% endraw %} for literal braces in examples\n` +
                           `   - Verify all template variables are properly defined\n` +
                           `   - Ensure template variables referenced in content exist in context`;
                }
            }
        ];

        // Check each pattern
        for (const { pattern, getMessage } of configErrorPatterns) {
            if (pattern.test(errorMessage)) {
                const detailedMessage = getMessage();
                return {
                    isConfigError: true,
                    detailedMessage: `Configuration Error: ${detailedMessage}\n\nOriginal Error: ${errorMessage}`
                };
            }
        }

        // Not a configuration error
        return {
            isConfigError: false,
            detailedMessage: errorMessage
        };
    }

    /**
     * Converts ChatMessageContent to a string representation.
     * Handles both simple strings and content block arrays.
     *
     * @param content - The message content to convert
     * @returns String representation of the content
     * @protected
     */
    protected contentToString(content: ChatMessageContent): string {
        if (typeof content === 'string') {
            return content;
        }

        // Content is an array of blocks - convert to string
        return content.map((block: ChatMessageContentBlock) => {
            if (block.type === 'text') {
                return block.content;
            }
            return `[${block.type}: ${block.content}]`;
        }).join('\n');
    }

    /**
     * Smart trimming of message content based on detected format.
     * Attempts to preserve structure while reducing size.
     *
     * @param content - The message content to trim (must be string)
     * @param maxLength - Maximum length for the trimmed content
     * @returns Object with trimmed content and strategy used
     * @protected
     */
    protected smartTrimContent(content: string, maxLength: number = 1000): { trimmed: string; strategy: string; originalLength: number } {
        const originalLength = content.length;

        // Try to parse as JSON
        try {
            const data = JSON.parse(content);

            if (Array.isArray(data)) {
                // JSON array - keep first 10 items
                const itemsToKeep = 10;
                if (data.length > itemsToKeep) {
                    const truncated = data.slice(0, itemsToKeep);
                    const trimmed = JSON.stringify(truncated, null, 2) +
                        `\n\n... (${(data.length - itemsToKeep).toLocaleString()} more items truncated due to context length)`;
                    return {
                        trimmed,
                        strategy: 'JSON array truncation',
                        originalLength
                    };
                }
            } else if (typeof data === 'object' && data !== null) {
                // JSON object - keep structure but truncate long values
                const truncated: any = {};
                let fieldCount = 0;
                const maxFields = 20;

                for (const [key, value] of Object.entries(data)) {
                    if (fieldCount >= maxFields) {
                        truncated['...'] = `(${Object.keys(data).length - maxFields} more fields truncated)`;
                        break;
                    }
                    if (typeof value === 'string' && value.length > 200) {
                        truncated[key] = value.substring(0, 200) + '... (truncated)';
                    } else if (Array.isArray(value) && value.length > 5) {
                        truncated[key] = [...value.slice(0, 5), `... (${value.length - 5} more items)`];
                    } else {
                        truncated[key] = value;
                    }
                    fieldCount++;
                }

                return {
                    trimmed: JSON.stringify(truncated, null, 2),
                    strategy: 'JSON object field truncation',
                    originalLength
                };
            }
        } catch {
            // Not JSON, continue to other strategies
        }

        // Try CSV detection (header + comma-separated values)
        if (content.includes('\n')) {
            const lines = content.split('\n');
            const firstLine = lines[0];

            // Check if first line looks like CSV header (contains commas)
            if (firstLine.includes(',') && lines.length > 1) {
                const rowsToKeep = 10;
                if (lines.length > rowsToKeep + 1) {
                    const header = lines[0];
                    const dataRows = lines.slice(1, rowsToKeep + 1);
                    const trimmed = [header, ...dataRows].join('\n') +
                        `\n... (${(lines.length - rowsToKeep - 1).toLocaleString()} more rows truncated due to context length)`;
                    return {
                        trimmed,
                        strategy: 'CSV row truncation',
                        originalLength
                    };
                }
            }
        }

        // Fallback: simple character truncation
        if (content.length > maxLength) {
            return {
                trimmed: content.substring(0, maxLength) + '\n\n... (truncated due to context length)',
                strategy: 'character truncation',
                originalLength
            };
        }

        // Content is already small enough
        return {
            trimmed: content,
            strategy: 'no truncation needed',
            originalLength
        };
    }

    /**
     * Serializes payload for logging to PayloadAtStart
     * Override in subclasses to customize logging behavior (e.g., summarize large payloads)
     *
     * @param payload - The payload to serialize
     * @returns Serialized string or null to skip logging
     * @protected
     */
    protected serializePayloadAtStart(payload: any): string | null {
        return payload ? JSON.stringify(payload) : null;
    }

    /**
     * Serializes payload for logging to PayloadAtEnd
     * Override in subclasses to customize logging behavior (e.g., summarize large payloads)
     *
     * @param payload - The payload to serialize
     * @returns Serialized string or null to skip logging
     * @protected
     */
    protected serializePayloadAtEnd(payload: any): string | null {
        return payload ? JSON.stringify(payload) : null;
    }

    /**
     * Recovery Strategy 1: Remove oldest tool-result messages.
     * Targets messages older than minAge turns for removal.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @param currentStepCount - Current turn/step number
     * @param minAge - Minimum age in turns for removal (default: 5)
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected recoveryStrategy_RemoveOldestToolResults(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 5
    ): { tokensSaved: number; strategyName: string } {
        let tokensSaved = 0;
        const removedIndices: number[] = [];

        // Find tool-result messages older than minAge turns
        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index: index,
                age: (msg as AgentChatMessage).metadata?.turnAdded
                    ? currentStepCount - (msg as AgentChatMessage).metadata!.turnAdded
                    : 0,
                tokens: this.estimateTokens(msg.content),
                isToolResult: this.IsToolResultMessage(msg)
            }))
            .filter(c => c.isToolResult && c.age >= minAge)
            .sort((a, b) => b.age - a.age); // Oldest first

        // Remove messages until we've saved enough
        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;

            removedIndices.push(candidate.index);
            tokensSaved += candidate.tokens;

            this.logStatus(
                `Removing tool-result from ${candidate.age} turns ago (${candidate.tokens} tokens)`,
                true,
                params
            );
        }

        // Remove in reverse order to maintain indices
        removedIndices.sort((a, b) => b - a).forEach(index => {
            const removed = params.conversationMessages.splice(index, 1)[0];

            // Emit lifecycle event
            this.emitMessageLifecycleEvent({
                type: 'message-removed',
                turn: currentStepCount,
                messageIndex: index,
                message: removed as AgentChatMessage,
                reason: 'Context recovery - oldest tool results',
                tokensSaved: this.estimateTokens(removed.content)
            });
        });

        return {
            tokensSaved,
            strategyName: `Removed ${removedIndices.length} old tool-results (${minAge}+ turns)`
        };
    }

    /**
     * Recovery Strategy 2: Compact old tool-result messages.
     * Uses smart trimming to reduce size while preserving some content.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @param currentStepCount - Current turn/step number
     * @param minAge - Minimum age in turns for compaction (default: 3)
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected async recoveryStrategy_CompactOldToolResults(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 3
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        let tokensSaved = 0;
        let compactedCount = 0;

        // Find tool-result messages to compact
        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index: index,
                age: (msg as AgentChatMessage).metadata?.turnAdded
                    ? currentStepCount - (msg as AgentChatMessage).metadata!.turnAdded
                    : 0,
                tokens: this.estimateTokens(msg.content),
                isToolResult: this.IsToolResultMessage(msg),
                alreadyCompacted: (msg as AgentChatMessage).metadata?.wasCompacted === true
            }))
            .filter(c => c.isToolResult && c.age >= minAge && !c.alreadyCompacted)
            .sort((a, b) => b.age - a.age); // Oldest first

        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;

            const originalTokens = candidate.tokens;
            const originalMessage = candidate.message as AgentChatMessage;
            const originalContent = typeof originalMessage.content === 'string'
                ? originalMessage.content
                : JSON.stringify(originalMessage.content);

            // Use smart trim (faster than AI summary, no API cost)
            const compactedContent = await this.compactMessage(
                originalMessage,
                {
                    compactMode: 'First N Chars',
                    compactLength: 500,
                    compactPromptId: '',
                    originalLength: originalContent.length
                },
                params
            );

            const newTokens = this.estimateTokens(compactedContent);
            const saved = originalTokens - newTokens;

            if (saved > 0) {
                // Update message in place with compacted content
                params.conversationMessages[candidate.index] = {
                    ...originalMessage,
                    content: compactedContent,
                    metadata: {
                        ...originalMessage.metadata,
                        wasCompacted: true,
                        originalLength: originalContent.length,
                        tokensSaved: saved
                    }
                };
                tokensSaved += saved;
                compactedCount++;

                this.logStatus(
                    `Compacted tool-result from ${candidate.age} turns ago (saved ${saved} tokens)`,
                    true,
                    params
                );
            }
        }

        return {
            tokensSaved,
            strategyName: `Compacted ${compactedCount} old tool-results (${minAge}+ turns)`
        };
    }

    /**
     * Recovery Strategy 3: Aggressively compact ALL tool-result messages.
     * Used when gentler strategies haven't freed enough space.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected async recoveryStrategy_CompactAllToolResults(
        params: ExecuteAgentParams,
        tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        let tokensSaved = 0;
        let compactedCount = 0;

        // Find ALL tool-result messages that aren't already compacted
        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index: index,
                tokens: this.estimateTokens(msg.content),
                isToolResult: this.IsToolResultMessage(msg),
                alreadyCompacted: (msg as AgentChatMessage).metadata?.wasCompacted === true
            }))
            .filter(c => c.isToolResult && !c.alreadyCompacted && c.tokens > 200)
            .sort((a, b) => b.tokens - a.tokens); // Largest first

        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;

            const originalTokens = candidate.tokens;
            const originalMessage = candidate.message as AgentChatMessage;
            const originalContent = typeof originalMessage.content === 'string'
                ? originalMessage.content
                : JSON.stringify(originalMessage.content);

            // Aggressive compaction - keep only first 200 chars
            const compactedContent = await this.compactMessage(
                originalMessage,
                {
                    compactMode: 'First N Chars',
                    compactLength: 200,
                    compactPromptId: '',
                    originalLength: originalContent.length
                },
                params
            );

            const newTokens = this.estimateTokens(compactedContent);
            const saved = originalTokens - newTokens;

            if (saved > 0) {
                // Update message in place with compacted content
                params.conversationMessages[candidate.index] = {
                    ...originalMessage,
                    content: compactedContent,
                    metadata: {
                        ...originalMessage.metadata,
                        wasCompacted: true,
                        originalLength: originalContent.length,
                        tokensSaved: saved
                    }
                };
                tokensSaved += saved;
                compactedCount++;
            }
        }

        return {
            tokensSaved,
            strategyName: `Aggressively compacted ${compactedCount} tool-results`
        };
    }

    /**
     * Recovery Strategy 4: Preserve beginning of last user message (fallback).
     * Keeps the first 200-300 tokens of the user's request (which usually contains the core ask)
     * and adds a clear marker that content was trimmed due to context limits.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected recoveryStrategy_TrimLastUserMessage(
        params: ExecuteAgentParams,
        tokensToSave: number
    ): { tokensSaved: number; strategyName: string } {
        // Find the last user message (reverse search for compatibility)
        let lastUserMessageIndex = -1;
        for (let i = params.conversationMessages.length - 1; i >= 0; i--) {
            if (params.conversationMessages[i].role === 'user') {
                lastUserMessageIndex = i;
                break;
            }
        }

        if (lastUserMessageIndex === -1) {
            return { tokensSaved: 0, strategyName: 'No user message to trim' };
        }

        const lastUserMessage = params.conversationMessages[lastUserMessageIndex];
        const originalTokens = this.estimateTokens(lastUserMessage.content);

        // Keep first 200-300 tokens worth (approximately 800-1200 characters)
        const contentString = this.contentToString(lastUserMessage.content);
        const targetChars = 1000; // Roughly 250 tokens

        if (contentString.length <= targetChars) {
            // Message is already short enough
            return { tokensSaved: 0, strategyName: 'User message already short' };
        }

        // Keep the beginning (most important part with the request)
        const trimResult = this.smartTrimContent(contentString, targetChars);

        // Add clear marker that we trimmed it
        const newContent = trimResult.trimmed +
            '\n\n<CONTEXT_LIMIT_REACHED>\n' +
            'Note: The conversation has exceeded the model\'s context window. ' +
            'The remainder of your message was trimmed to fit within the limit. ' +
            'The beginning of your request (shown above) has been preserved.\n' +
            '</CONTEXT_LIMIT_REACHED>';

        const newTokens = this.estimateTokens(newContent);
        const saved = originalTokens - newTokens;

        if (saved > 0) {
            params.conversationMessages[lastUserMessageIndex] = {
                ...lastUserMessage,
                content: newContent
            };
        }

        return {
            tokensSaved: saved,
            strategyName: 'Preserved beginning of user message with context limit marker'
        };
    }

    /**
     * Attempts to recover from a context length exceeded error using multiple strategies.
     * Uses escalating strategies: remove old results → compact old results → compact all → trim user message.
     * This approach preserves the user's original request while removing stale tool results.
     *
     * @param params - Agent execution parameters (conversationMessages will be modified)
     * @param payload - Current payload to carry forward
     * @param errorMessage - The original error message from the failed prompt
     * @param modelSelectionInfo - Model selection information containing the model and vendor used
     * @returns A Retry step with reduced context or Failed if recovery unsuccessful
     * @protected
     */
    protected async attemptContextRecovery<P>(
        params: ExecuteAgentParams,
        payload: P,
        errorMessage: string,
        modelSelectionInfo?: AIModelSelectionInfo
    ): Promise<BaseAgentNextStep<P>> {
        this.logStatus(
            `⚠️ Context length exceeded - attempting recovery with multi-strategy approach`,
            true,
            params
        );

        // Calculate how many tokens we need to save
        const modelLimit = this.getModelContextLimit(modelSelectionInfo);
        const currentTokens = this.estimateConversationTokens(params.conversationMessages);
        const tokensToSave = currentTokens - Math.floor(modelLimit * 0.9); // Target 90% usage

        this.logStatus(
            `Need to save ~${tokensToSave} tokens (current: ${currentTokens}, limit: ${modelLimit})`,
            true,
            params
        );

        if (tokensToSave <= 0) {
            // Already under limit, this shouldn't happen but handle gracefully
            this.logStatus(`Already under context limit, retrying...`, true, params);
            return {
                step: 'Retry' as const,
                retryReason: 'Context recovery - already under limit',
                retryInstructions: 'The context is now within limits.',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
            };
        }

        // Use prompt turn count for age calculations (not step count)
        const currentPromptTurn = this._promptTurnCount;

        // Try multiple recovery strategies in order
        const strategies = [
            () => this.recoveryStrategy_RemoveOldestToolResults(params, tokensToSave, currentPromptTurn, 5),
            () => this.recoveryStrategy_CompactOldToolResults(params, tokensToSave, currentPromptTurn, 3),
            () => this.recoveryStrategy_RemoveOldestToolResults(params, tokensToSave, currentPromptTurn, 2),
            () => this.recoveryStrategy_CompactAllToolResults(params, tokensToSave),
            () => Promise.resolve(this.recoveryStrategy_TrimLastUserMessage(params, tokensToSave))
        ];

        let tokensSaved = 0;
        const strategiesUsed: string[] = [];

        for (const strategy of strategies) {
            const result = await strategy();
            tokensSaved += result.tokensSaved;
            if (result.tokensSaved > 0) {
                strategiesUsed.push(result.strategyName);
                this.logStatus(`${result.strategyName}: saved ${result.tokensSaved} tokens`, true, params);
            }

            if (tokensSaved >= tokensToSave) {
                break;
            }
        }

        // Check if we saved enough
        if (tokensSaved < tokensToSave * 0.5) {
            this.logStatus(
                `❌ Context recovery insufficient: only saved ${tokensSaved}/${tokensToSave} tokens`,
                true,
                params
            );
            return {
                errorMessage: `Context recovery failed: only saved ${tokensSaved}/${tokensToSave} tokens. ${errorMessage}`,
                step: 'Failed' as const,
                terminate: true,
                previousPayload: payload,
                newPayload: payload
            };
        }

        this.logStatus(
            `✅ Context recovery successful: saved ${tokensSaved} tokens using ${strategiesUsed.length} strategies`,
            true,
            params
        );

        // Build detailed description of what was done
        const strategyDescriptions = strategiesUsed.map((strategy, index) =>
            `${index + 1}. ${strategy}`
        ).join('\n');

        // Return Retry step to give agent another chance
        return {
            step: 'Retry' as const,
            retryReason: `Context recovery successful - ${tokensSaved} tokens freed`,
            retryInstructions: `The conversation exceeded the model's context limit (${modelLimit} tokens). I've applied the following context recovery strategies to free up ${tokensSaved} tokens:

${strategyDescriptions}

The context is now within limits. Please retry your request with the recovered context.`,
            terminate: false,
            previousPayload: payload,
            newPayload: payload
        };
    }

    /**
     * Processes the next step based on agent type determination.
     * 
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {MJAIAgentTypeEntity} agentType - The agent type
     * @param {AIPromptRunResult} promptResult - The prompt execution result
     * @returns {Promise<ExecuteAgentResult>} The execution result
     * @protected
     */
    protected async processNextStep<P>(
        nextStep: BaseAgentNextStep<P>,
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const validatedNextStep = await this.validateNextStep<P>(params, nextStep, currentPayload, this._agentRun, currentStep);
        
        // Check guardrails if next step would continue execution
        const guardrailCheckedStep = await this.checkExecutionGuardrails<P>(
            params, 
            validatedNextStep, 
            currentPayload, 
            this._agentRun!, 
            currentStep
        );
        
        this.logStatus(`📌 Next step determined: ${guardrailCheckedStep.step}${guardrailCheckedStep.terminate ? ' (terminating)' : ''}`, true, params);

        // if we need to retry make sure we add the retry message to the conversation messages
        if (guardrailCheckedStep.step === 'Retry' && (guardrailCheckedStep.message || guardrailCheckedStep.errorMessage || guardrailCheckedStep.retryInstructions)) {
            params.conversationMessages.push({
                role: 'user',
                content: `Retrying due to: ${guardrailCheckedStep.retryInstructions || guardrailCheckedStep.message || guardrailCheckedStep.errorMessage}`
            });
        }   

        // Return the next step directly - execution handling is done in execute NextStep
        return guardrailCheckedStep;
    }
 
    /**
     * Executes a batch of artifact tool calls, recording each as its own
     * `Tool` AIAgentRunStep (a sibling of the Prompt step that requested them)
     * with full inputs/outputs captured in InputData/OutputData. Returns the
     * stored results so the caller can render them into a single recall-friendly
     * message for the next prompt turn.
     *
     * Step naming convention: `Artifact Tool: {toolName}` for log/UI clarity.
     *
     * @protected
     */
    protected async executeArtifactToolCallsAsSteps(
        calls: ArtifactToolCall[],
        params: ExecuteAgentParams,
    ): Promise<StoredToolResult[]> {
        // No parentId: artifact tool steps are siblings of the prompt step that
        // requested them, matching how action steps render. ParentID is reserved
        // for genuine control-flow nesting (ForEach/While loops, sub-agents), which
        // artifact tools are never dispatched from.
        const results = await Promise.all(
            calls.map(async (call) => {
                const toolStep = await this.createStepEntity({
                    stepType: 'Tool',
                    stepName: `Artifact Tool: ${call.tool}`,
                    contextUser: params.contextUser,
                    inputData: {
                        artifactId: call.artifactId,
                        tool: call.tool,
                        input: call.input,
                    },
                });

                const stored = await this._artifactToolManager.ExecuteSingleToolCall(call);

                await this.finalizeStepEntity(
                    toolStep,
                    stored.result.success,
                    stored.result.success ? undefined : stored.result.errorMessage,
                    {
                        artifactId: stored.artifactId,
                        tool: stored.tool,
                        input: stored.input,
                        result: stored.result,
                        durationMs: stored.durationMs,
                    },
                );

                return stored;
            }),
        );
        return results;
    }

    /**
     * Pushes a single user-role message containing rendered artifact-tool
     * results into the conversation. This mirrors the action-result
     * "inject once, then expire" pattern — the LLM sees the results on its
     * next turn, and older messages are pruned/compacted by
     * `pruneAndCompactExpiredMessages` instead of being re-rendered into
     * every system-prompt turn.
     *
     * @protected
     */
    protected injectArtifactToolResultsMessage(
        params: ExecuteAgentParams,
        toolResults: StoredToolResult[],
    ): void {
        if (toolResults.length === 0) return;
        const header = toolResults.length === 1
            ? 'Artifact tool result:'
            : `Artifact tool results (${toolResults.length} calls):`;
        const body = toolResults.map((r, i) => {
            const heading = `### ${i + 1}. ${r.artifactId}.${r.tool}(${JSON.stringify(r.input)})`;
            if (r.result.success) {
                const raw = typeof r.result.data === 'string'
                    ? r.result.data
                    : JSON.stringify(r.result.data, null, 2);
                const data = this.capStandaloneToolResultText(raw);
                return `${heading}\n\`\`\`json\n${data}\n\`\`\``;
            }
            return `${heading}\n**Error:** ${r.result.errorMessage}`;
        }).join('\n\n');

        const message: AgentChatMessage = {
            role: 'user',
            content: `${header}\n${body}`,
            metadata: {
                turnAdded: this._promptTurnCount,
                messageType: 'tool-result',
                // Default: keep results visible for a few turns then compact to a
                // first-N-chars preview. The LLM is taught (via the loop-agent
                // system prompt) that older tool results are summarised and that
                // it can re-call the tool if it needs the full result back.
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    /**
     * Character budget (~4 chars/token) for a SINGLE standalone artifact-tool result injected into
     * the conversation. A `get_full` on a large artifact can otherwise dump the whole thing into
     * context and overflow the model's window — the exact failure pipelines exist to avoid. Override
     * in a subclass to tune. Pipelines are unaffected: their intermediate results never flow through
     * here, and the executor already caps a pipeline's final output.
     *
     * @protected
     */
    protected get maxStandaloneToolResultChars(): number {
        return 100_000; // ~25k tokens
    }

    /**
     * Bound a standalone tool result to {@link maxStandaloneToolResultChars}: return a head slice
     * plus a redirect that teaches the agent to page (`get_rows`) or reduce (`pipeline`) instead of
     * reading a whole large artifact. Mirrors how read/search tools cap output at the tool boundary.
     *
     * @protected
     */
    protected capStandaloneToolResultText(text: string): string {
        const budget = this.maxStandaloneToolResultChars;
        if (text.length <= budget) {
            return text;
        }
        const omitted = text.length - budget;
        return (
            text.slice(0, budget) +
            `\n\n…[truncated ${omitted.toLocaleString()} chars. This artifact is too large to read whole ` +
            `(~${Math.round(text.length / 4000)}k tokens) — reading it in full overflows the context window. ` +
            `Instead: page it with get_rows(start, count), or run a pipeline that filters/aggregates it ` +
            `server-side (where / select / groupBy → only the small final result returns to you).]`
        );
    }

    /**
     * Executes a batch of in-flight memory writes, recording each as its own
     * `Tool` AIAgentRunStep (a sibling of the Prompt step that requested them)
     * with full inputs/outcomes captured in InputData/OutputData.
     *
     * Writes run SEQUENTIALLY (not Promise.all like artifact tools) by design:
     * each persisted note is embedded and synced into the in-memory vector
     * service on Save, so write N must be visible to write N+1's near-duplicate
     * check (this is also what makes same-run supersede-own work). The per-run
     * cap bounds the cost of the serialization.
     *
     * Step naming convention: `Memory Write` for log/UI clarity.
     *
     * @protected
     */
    protected async executeMemoryWritesAsSteps(
        writes: MemoryWriteRequest[],
        params: ExecuteAgentParams,
    ): Promise<MemoryWriteResult[]> {
        const results: MemoryWriteResult[] = [];
        for (const write of writes) {
            const writeStep = await this.createStepEntity({
                stepType: 'Tool',
                stepName: 'Memory Write',
                contextUser: params.contextUser,
                inputData: {
                    note: write.note,
                    type: write.type,
                    scopeHint: write.scopeHint,
                },
            });

            const result = await this._memoryWriteManager.ExecuteWrite(write, {
                agentId: params.agent.ID,
                contextUser: params.contextUser,
                agentRunId: this._agentRun?.ID,
                conversationId: this._agentRun?.ConversationID || undefined,
                conversationDetailId: params.conversationDetailId,
                userId: params.userId || params.contextUser?.ID,
                companyId: params.companyId,
                verbose: params.verbose,
                provider: this.ProviderToUse,
            });

            const failed = result.disposition === 'error' || result.disposition === 'rejected-type';
            await this.finalizeStepEntity(
                writeStep,
                !failed,
                failed ? result.reason : undefined,
                {
                    disposition: result.disposition,
                    noteId: result.noteId,
                    finalScope: result.finalScope,
                    reason: result.reason,
                    durationMs: result.durationMs,
                },
            );
            results.push(result);
        }
        return results;
    }

    /**
     * Turn-loop entry point for in-flight memory writes, gated on the agent's
     * AllowMemoryWrite flag. When disabled but the LLM emitted writes anyway
     * (prompt drift / injection attempt), records ONE summary skip step —
     * observable without per-write noise — and tells the agent the memories
     * were NOT saved so it stops re-emitting. When enabled, executes the
     * writes as run steps and injects the results message.
     *
     * @protected
     */
    protected async processMemoryWritesForTurn(
        memoryWrites: MemoryWriteRequest[],
        params: ExecuteAgentParams,
    ): Promise<void> {
        if (params.agent.AllowMemoryWrite !== true) {
            this.logStatus(`[MemoryWrites] LLM emitted ${memoryWrites.length} memory write(s) but AllowMemoryWrite=false — skipping`, true, params);
            const skipStep = await this.createStepEntity({
                stepType: 'Tool',
                stepName: 'Memory Writes: skipped (AllowMemoryWrite=false)',
                contextUser: params.contextUser,
                inputData: { requestedWriteCount: memoryWrites.length },
            });
            await this.finalizeStepEntity(skipStep, true, undefined, { skipped: true, reason: 'AllowMemoryWrite=false' });
            params.conversationMessages.push({
                role: 'user',
                content: 'Memory write result: this agent does not have durable memory writes enabled — the requested memories were NOT saved. Do not emit memoryWrites again.',
                metadata: {
                    turnAdded: this._promptTurnCount,
                    messageType: 'tool-result',
                    expirationTurns: 3,
                    expirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 200,
                    compactPromptId: '',
                },
            });
            return;
        }

        this.logStatus(`[MemoryWrites] LLM requested ${memoryWrites.length} memory write(s)`, true, params);
        const writeResults = await this.executeMemoryWritesAsSteps(memoryWrites, params);
        this.injectMemoryWriteResultsMessage(params, writeResults);
    }

    /**
     * Pushes a single user-role message containing memory-write outcomes into
     * the conversation, mirroring `injectArtifactToolResultsMessage`'s
     * inject-once-then-expire pattern. Closing the loop here is what stops the
     * LLM from re-emitting the same memory on subsequent turns.
     *
     * @protected
     */
    protected injectMemoryWriteResultsMessage(
        params: ExecuteAgentParams,
        results: MemoryWriteResult[],
    ): void {
        if (results.length === 0) return;
        const header = results.length === 1
            ? 'Memory write result:'
            : `Memory write results (${results.length} writes):`;
        const body = results.map((r, i) => {
            const note = r.request.note.length > 120 ? `${r.request.note.slice(0, 120)}…` : r.request.note;
            return `${i + 1}. "${note}" — **${r.disposition}**${r.reason ? `: ${r.reason}` : ''}`;
        }).join('\n');

        const message: AgentChatMessage = {
            role: 'user',
            content: `${header}\n${body}`,
            metadata: {
                turnAdded: this._promptTurnCount,
                messageType: 'tool-result',
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 300,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    /**
     * Builds a per-run {@link PipelineToolRegistry} that unifies the three pipeline-able
     * substrates behind one namespace: built-in transforms, the agent's effective Actions, and
     * the run's artifact tools. Transforms register first so their reserved names win; a source
     * whose name collides with a transform is skipped for pipeline use (still callable normally)
     * and logged, rather than aborting the whole pipeline.
     *
     * @protected
     */
    protected buildPipelineRegistry(params: ExecuteAgentParams): PipelineToolRegistry {
        const registry = new PipelineToolRegistry();
        const register = (invocable: PipelineInvocable): void => {
            try {
                registry.Register(invocable);
            } catch (e) {
                this.logStatus(`[Pipeline] Skipped tool "${invocable.toolName}": ${(e as Error).message}`, true, params);
            }
        };

        // Operators (where/select/map/…) are pure code-defined verbs, not registry tools — only
        // capabilities (Actions + artifact tools) live here as pipeline sources/stages.

        // Actions — each wrapped to run via the existing single-action execution path.
        this.getEffectiveActionsForValidation(params.agent.ID).forEach((actionEntity) =>
            register(
                new ActionInvocable(actionEntity.Name, (p) =>
                    this.ExecuteSingleAction(params, { name: actionEntity.Name, params: p }, actionEntity, params.contextUser),
                ),
            ),
        );

        // Artifact tools — one invocable per distinct tool name; `artifactId` is supplied as a
        // call-time param so the same `{ tool, params }` step shape works across all substrates.
        this._artifactToolManager.GetAvailableToolNames().forEach((toolName) =>
            register(
                new ArtifactToolInvocable(toolName, async (tool, p) => {
                    const stored = await this._artifactToolManager.ExecuteSingleToolCall({
                        artifactId: String(p.artifactId ?? ''),
                        tool,
                        input: p,
                    });
                    return stored.result;
                }),
            ),
        );

        return registry;
    }

    /**
     * Runs a tool pipeline as a single `Tool` step in the run tree (sibling of the prompt step that
     * requested it, matching artifact-tool steps). ALL pipeline observability lives in this step's
     * `OutputData` — the per-stage breakdown, totals, bytes saved, and the tool chain — so there are
     * no dedicated pipeline entities and no extra SQL I/O; the run tree alone carries everything a
     * debug UI needs.
     *
     * @protected
     */
    protected async executePipelineAsStep(
        pipeline: AgentPipelineRequest,
        params: ExecuteAgentParams,
    ): Promise<PipelineExecutionResult> {
        const stepEntity = await this.createStepEntity({
            stepType: 'Tool',
            stepName: `Pipeline: ${pipeline.steps.length} step(s)`,
            contextUser: params.contextUser,
            inputData: { steps: pipeline.steps },
        });

        const registry = this.buildPipelineRegistry(params);
        // The executor converts stage-level errors into a failed RESULT (it doesn't throw for those),
        // but an unexpected throw — e.g. a tool returning a non-serializable value (BigInt/circular)
        // that trips JSON.stringify in the executor's byte-accounting — must NEVER leave this step
        // stuck on 'Running'. Catch it and materialize a failed result so finalize always runs and the
        // failure surfaces as a 'Failed' step (answering "do pipeline errors show as errors?": yes).
        let result: PipelineExecutionResult;
        try {
            result = await new PipelineExecutor(registry).Execute(pipeline.steps as PipelineStage[]);
        } catch (e) {
            result = {
                success: false,
                finalOutput: null,
                steps: [],
                error: `Pipeline crashed: ${(e as Error)?.message ?? String(e)}`,
                contextBytesSaved: 0,
            };
        }

        // A pipeline is ONE run-step — not a parent + a child step per stage. It runs server-side in a
        // single fast pass, so the full per-stage breakdown + totals live in this step's OutputData for
        // a debug UI to visualize — no separate entities, no extra DB writes.
        await this.finalizeStepEntity(stepEntity, result.success, result.success ? undefined : result.error, {
            success: result.success,
            toolChain: summarizePipelineStages(result.steps),
            steps: result.steps,
            contextBytesSaved: result.contextBytesSaved,
            totalBytesStreamed: result.steps.reduce((sum, s) => sum + s.outputSize, 0),
            totalDurationMs: result.steps.reduce((sum, s) => sum + s.durationMs, 0),
            failedStepIndex: result.failedStepIndex,
        });

        return result;
    }

    /**
     * Pushes the pipeline's final output (or its failure message) into the conversation for the
     * LLM's next turn, mirroring the artifact-tool "inject once, then expire" pattern. Only the
     * final output is surfaced — intermediate step outputs never enter the context window.
     *
     * @protected
     */
    protected injectPipelineResultMessage(params: ExecuteAgentParams, result: PipelineExecutionResult): void {
        const diagnostic = result.success && result.diagnostic
            ? `\n⚠ Empty result — ${result.diagnostic}`
            : '';
        // Identify which pipeline this result belongs to (stage chain, e.g. `get_rows → where →
        // select`). Without it, multiple pipeline results across turns are indistinguishable once
        // compacted — mirrors how artifact-tool results name their tool/artifact.
        const label = summarizePipelineStages(result.steps);
        const content = result.success
            ? `Pipeline result [${label}] (final stage value — intermediate stages stayed out of context, ~${result.contextBytesSaved} bytes saved):\n\`\`\`\n${formatFinalOutput(result.finalOutput)}\n\`\`\`${diagnostic}`
            : `Pipeline failed [${label}].\n${result.error}`;

        const message: AgentChatMessage = {
            role: 'user',
            content,
            metadata: {
                turnAdded: this._promptTurnCount,
                messageType: 'tool-result',
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    /**
     * Creates a chat message containing sub-agent execution results.
     *
     * @param {AgentSubAgentRequest} subAgent - The sub-agent that was executed
     * @param {any} result - The result from sub-agent execution
     * @returns {ChatMessage} A formatted message with sub-agent results
     * @protected
     */
    protected createSubAgentResultMessage(subAgent: AgentSubAgentRequest, result: ExecuteAgentResult): ChatMessage {
        return {
            role: 'user',
            content: this.formatSubAgentResultAsMarkdown(subAgent.name, result)
        };
    }


    /**
     * Gathers context data about the agent for use in prompt templates.
     *
     * This method collects information about the agent's sub-agents and available
     * actions, formatting them for injection into prompt templates. The data is
     * structured to provide the LLM with comprehensive context about the agent's
     * capabilities and hierarchical relationships.
     *
     * @param {MJAIAgentEntityExtended} agent - The agent to gather context for
     * @param {UserInfo} [_contextUser] - Optional user context (reserved for future use)
     * @param {any} [extraData] - Optional extra data to include in the context, if provided and keys conflict within the agent context data, the extraData will override the agent context data.
     * @param {ActionChange[]} [actionChanges] - Optional runtime action modifications
     *
     * @returns {Promise<AgentContextData>} Structured context data for prompts
     *
     * @throws {Error} If there's an error accessing agent data
     *
     * @private
     */
    private async gatherPromptTemplateData(
        agent: MJAIAgentEntityExtended,
        _contextUser?: UserInfo,
        extraData?: any,
        actionChanges?: ActionChange[],
        subAgentChanges?: SubAgentChange[]
    ): Promise<AgentContextData> {
        try {
            const engine = AIEngine.Instance;

            // Build (or reuse) the agent-invariant base catalog. This is process-wide cached on
            // AIEngine and wiped on Agent/AgentAction/AgentRelationship/AgentType changes + reloads.
            // It turns the per-step rebuild (sub-agent + action resolution, markdown, JSON.parse of
            // agent-type params) into a once-per-agent cost; the common no-override step reuses it wholesale.
            let catalog = engine.GetAgentBaseCatalog<AgentBaseCatalog>(agent.ID);
            if (!catalog) {
                catalog = this.buildAgentBaseCatalog(agent, engine);
                engine.SetAgentBaseCatalog(agent.ID, catalog);
            }

            const isRoot = this._depth === 0;

            // Sub-agents: reuse cached base unless runtime subAgentChanges apply (then clone + re-format).
            let uniqueActiveSubAgents = catalog.uniqueActiveSubAgents;
            let subAgentDetails = catalog.subAgentDetails;
            let subAgentCount = catalog.subAgentCount;
            if (subAgentChanges?.length) {
                uniqueActiveSubAgents = this.applySubAgentChanges(catalog.uniqueActiveSubAgents, subAgentChanges, agent.ID, isRoot, engine);
                subAgentCount = uniqueActiveSubAgents.length;
                subAgentDetails = this.formatSubAgentDetails(uniqueActiveSubAgents);
            }

            // Actions: reuse cached active set unless runtime actionChanges apply (then clone + re-format).
            //
            // FAST-PATH SHARING CONTRACT: on the no-override path, `activeActions` (and therefore
            // `_effectiveActions`) and `uniqueActiveSubAgents` above are the SAME array references
            // held by the process-wide AIEngine catalog cache. Downstream consumers MUST treat them
            // as read-only — they are only ever read (`.find`/`.map`/`.length`/`.some`), never mutated
            // in place. On the override path a fresh array is built via filter/applyActionChanges, so
            // the cached arrays are never the mutated ones. Keeping the references (vs. copying) avoids
            // a per-step allocation; if a future consumer needs to mutate, it must `.slice()` first.
            let activeActions = catalog.activeActions;
            let actionDetails = catalog.actionDetails;
            if (actionChanges?.length) {
                const result = this.applyActionChanges([...catalog.baseActionsRaw], actionChanges, agent.ID, isRoot);
                activeActions = result.actions.filter(a => a.Status === 'Active');
                this._dynamicActionLimits = result.dynamicLimits;
                actionDetails = this.formatActionDetails(activeActions);
            } else {
                // No actionChanges this step → no dynamically-added actions, hence no dynamic limits.
                // gatherPromptTemplateData runs once per step, and _dynamicActionLimits is keyed to the
                // actionChanges of the CURRENT step (read at validation time in checkActionExecutionLimits).
                // Resetting to {} is correct and required: it prevents a prior step's actionChanges limits
                // from leaking into a step that has none. It is NOT relied upon to persist across steps.
                this._dynamicActionLimits = {};
            }
            // Store for later validation in executeActionsStep
            this._effectiveActions = activeActions;

            // Agent type prompt params: reuse cached base merge unless a runtime override is present.
            const runtimePromptParamOverrides = extraData?.__agentTypePromptParams as Record<string, unknown> | undefined;
            let agentTypePromptParams: Record<string, unknown>;
            if (runtimePromptParamOverrides) {
                const agentType = engine.AgentTypes.find(at => UUIDsEqual(at.ID, agent.TypeID));
                agentTypePromptParams = this.buildAgentTypePromptParams(agentType, agent, runtimePromptParamOverrides);
            } else {
                // Fast path: shallow-clone the cached base params before handing them out. The cached
                // object lives in the process-wide AIEngine catalog and is shared across every run of
                // this agent; the audit shows it is read-only downstream today, but the clone is cheap
                // and removes any cache-poisoning foot-gun should a future consumer write to it.
                agentTypePromptParams = { ...catalog.baseAgentTypePromptParams };
            }

            // Build client tool details for the prompt (per-run; depends on extraData)
            const clientToolDetails = this.buildClientToolPromptSection(agent, extraData);

            // Build app context section if provided in extraData
            const appContext = this.buildAppContextSection(extraData);

            const contextData: AgentContextData = {
                agentName: agent.Name,
                agentDescription: agent.Description,
                parentAgentName: agent.Parent ? agent.Parent.trim() : "",
                subAgentCount: subAgentCount,
                subAgentDetails: subAgentDetails,
                actionCount: activeActions.length,
                actionDetails: actionDetails,
                clientToolDetails: clientToolDetails,
                appContext: appContext,
            };

            // Build the final result with __agentTypePromptParams injected
            // Note: extraData can override contextData properties, but __agentTypePromptParams
            // is built separately with proper merge precedence (schema < agent < runtime)
            const result: AgentContextData & Record<string, unknown> = {
                ...contextData,
                __agentTypePromptParams: agentTypePromptParams
            };

            if (extraData) {
                // Spread extraData but don't let it override __agentTypePromptParams
                // (which was already built with runtime overrides included)
                // Spread extraData into the result but exclude properties that were already
                // processed into formatted prompt sections above. Without this exclusion,
                // the raw objects from extraData would overwrite the formatted markdown strings
                // in contextData (e.g., appContext object would replace the markdown string).
                const { __agentTypePromptParams: _ignored, appContext: _ignoredAppContext, ...restExtraData } = extraData;
                return {
                    ...result,
                    ...restExtraData
                };
            }
            else {
                return result;
            }
        } catch (error) {
            throw new Error(`Error gathering context data: ${error.message}`);
        }
    }

    /**
     * Builds the agent-invariant {@link AgentBaseCatalog} — the resolved sub-agents + actions and
     * their formatted markdown, plus the base agent-type prompt params. Computed once per agent and
     * cached on AIEngine (see gatherPromptTemplateData); does NOT apply any runtime overrides.
     *
     * @protected
     */
    protected buildAgentBaseCatalog(agent: MJAIAgentEntityExtended, engine: AIEngine): AgentBaseCatalog {
        // Resolve sub-agents: direct ParentID children + active relationships, de-duped, ordered.
        const activeSubAgents = engine.Agents.filter(a => UUIDsEqual(a.ParentID, agent.ID) && a.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
        const activeAgentRelationships = engine.AgentRelationships.filter(ar => UUIDsEqual(ar.AgentID, agent.ID) && ar.Status === 'Active');
        const uniqueActiveSubAgentIDs = new Set<string>();
        activeSubAgents.forEach(a => uniqueActiveSubAgentIDs.add(a.ID));
        activeAgentRelationships.forEach(ar => uniqueActiveSubAgentIDs.add(ar.SubAgentID));
        const uniqueActiveSubAgents = Array.from(uniqueActiveSubAgentIDs).map(id => engine.Agents.find(a => UUIDsEqual(a.ID, id)));

        // Resolve actions from the agent's active AIAgentAction junctions.
        const agentActions = engine.AgentActions.filter(aa => UUIDsEqual(aa.AgentID, agent.ID) && aa.Status === 'Active');
        const baseActionsRaw: MJActionEntityExtended[] = ActionEngineServer.Instance.Actions.filter(a => agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID)));
        const activeActions = baseActionsRaw.filter(a => a.Status === 'Active');

        // Base agent-type prompt params (schema defaults + agent config; NO runtime overrides).
        const agentType = engine.AgentTypes.find(at => UUIDsEqual(at.ID, agent.TypeID));
        const baseAgentTypePromptParams = this.buildAgentTypePromptParams(agentType, agent, undefined);

        return {
            uniqueActiveSubAgents,
            subAgentCount: uniqueActiveSubAgents.length,
            subAgentDetails: this.formatSubAgentDetails(uniqueActiveSubAgents),
            baseActionsRaw,
            activeActions,
            actionDetails: this.formatActionDetails(activeActions),
            baseAgentTypePromptParams,
        };
    }

    /**
     * Applies runtime {@link SubAgentChange}s to a base sub-agent set — the sub-agent counterpart of
     * {@link applyActionChanges}. Returns a NEW array (never mutates the cached base set).
     *
     * @protected
     */
    protected applySubAgentChanges(
        baseSubAgents: MJAIAgentEntityExtended[],
        subAgentChanges: SubAgentChange[],
        agentId: string,
        isRoot: boolean,
        engine: AIEngine
    ): MJAIAgentEntityExtended[] {
        let subAgents = [...baseSubAgents];

        for (const change of subAgentChanges) {
            if (!this.doesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
                continue;
            }

            if (change.mode === 'add') {
                for (const subAgentId of change.subAgentIds) {
                    if (!subAgents.some(a => UUIDsEqual(a.ID, subAgentId))) {
                        const toAdd = engine.Agents.find(a => UUIDsEqual(a.ID, subAgentId));
                        if (toAdd) {
                            subAgents.push(toAdd);
                        } else {
                            LogStatus(`Sub-agent with ID '${subAgentId}' not found in AIEngine - skipping add`);
                        }
                    }
                }
            } else if (change.mode === 'remove') {
                subAgents = subAgents.filter(a => !change.subAgentIds.some(id => UUIDsEqual(id, a.ID)));
            }
        }

        return subAgents;
    }

    /**
     * Filters/transforms sub-agent changes for propagation to a sub-agent — the sub-agent counterpart
     * of {@link filterActionChangesForSubAgent} (same propagation rules).
     *
     * @protected
     */
    protected filterSubAgentChangesForSubAgent(
        subAgentChanges: SubAgentChange[] | undefined
    ): SubAgentChange[] | undefined {
        if (!subAgentChanges?.length) {
            return undefined;
        }

        const filtered: SubAgentChange[] = [];
        for (const change of subAgentChanges) {
            switch (change.scope) {
                case 'root':
                    continue; // only applies to root — don't propagate
                case 'global':
                    filtered.push(change);
                    break;
                case 'all-subagents':
                    filtered.push({ ...change, scope: 'global' });
                    break;
                case 'specific':
                    filtered.push(change);
                    break;
            }
        }

        return filtered.length > 0 ? filtered : undefined;
    }

    /**
     * Builds merged agent type prompt params from schema defaults,
     * agent config, and runtime overrides.
     *
     * Merge precedence (lowest to highest):
     * 1. Schema defaults (from AgentType.PromptParamsSchema)
     * 2. Agent config (from AIAgent.AgentTypePromptParams)
     * 3. Runtime overrides (from ExecuteAgentParams.data.__agentTypePromptParams)
     *
     * @param agentType - The agent type entity with schema definition
     * @param agent - The agent entity with configured values
     * @param runtimeOverrides - Optional runtime overrides from ExecuteAgentParams.data
     * @returns Merged prompt params object
     *
     * @protected
     * @since 2.131.0
     */
    protected buildAgentTypePromptParams(
        agentType: MJAIAgentTypeEntity | undefined,
        agent: MJAIAgentEntityExtended,
        runtimeOverrides?: Record<string, unknown>
    ): Record<string, unknown> {
        // 1. Extract defaults from schema
        const schemaJson = agentType?.PromptParamsSchema;
        const schemaDefaults = this.extractSchemaDefaults(schemaJson);

        // 2. Parse agent-level config
        const agentParamsJson = agent.AgentTypePromptParams;
        let agentParams: Record<string, unknown> = {};
        if (agentParamsJson) {
            try {
                agentParams = JSON.parse(agentParamsJson);
            } catch (e) {
                LogError(`Failed to parse AgentTypePromptParams for agent ${agent.Name}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // 3. Merge all layers (lowest to highest precedence)
        const merged = {
            ...schemaDefaults,
            ...agentParams,
            ...(runtimeOverrides || {})
        };

        // 4. Apply auto-alignment for includeResponseTypeDefinition
        // Pass in the explicit response type config from agent/runtime (not schema defaults)
        // to distinguish between explicit user settings and schema defaults
        const explicitResponseType = (runtimeOverrides?.includeResponseTypeDefinition as Record<string, unknown> | undefined) ||
                                     (agentParams.includeResponseTypeDefinition as Record<string, unknown> | undefined);
        this.applyResponseTypeAutoAlignment(merged, explicitResponseType);

        return merged;
    }

    /**
     * Applies auto-alignment rules to includeResponseTypeDefinition based on other flags.
     *
     * When a documentation flag (e.g., includeForEachDocs) is explicitly set to false,
     * the corresponding response type section (e.g., forEach) should also be excluded
     * unless explicitly set otherwise.
     *
     * Auto-alignment mappings:
     * - includePayloadInPrompt → includeResponseTypeDefinition.payload
     * - includeResponseFormDocs → includeResponseTypeDefinition.responseForms
     * - includeCommandDocs → includeResponseTypeDefinition.commands
     * - includeForEachDocs → includeResponseTypeDefinition.forEach
     * - includeWhileDocs → includeResponseTypeDefinition.while
     *
     * @param params - The merged params object to modify in place
     * @param explicitResponseType - The explicitly set response type config from agent/runtime (not schema defaults)
     * @protected
     * @since 2.132.0
     */
    protected applyResponseTypeAutoAlignment(
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>
    ): void {
        // Ensure includeResponseTypeDefinition is an object
        if (!params.includeResponseTypeDefinition || typeof params.includeResponseTypeDefinition !== 'object') {
            params.includeResponseTypeDefinition = {
                payload: true,
                responseForms: true,
                commands: true,
                forEach: true,
                while: true,
                scratchpad: true
            };
        }

        const responseType = params.includeResponseTypeDefinition as Record<string, unknown>;

        // Auto-alignment mappings: docs flag → response type property
        const alignmentMappings: Array<{ docsFlag: string; responseTypeKey: string }> = [
            { docsFlag: 'includePayloadInPrompt', responseTypeKey: 'payload' },
            { docsFlag: 'includeResponseFormDocs', responseTypeKey: 'responseForms' },
            { docsFlag: 'includeCommandDocs', responseTypeKey: 'commands' },
            { docsFlag: 'includeForEachDocs', responseTypeKey: 'forEach' },
            { docsFlag: 'includeWhileDocs', responseTypeKey: 'while' },
            { docsFlag: 'includeScratchpadDocs', responseTypeKey: 'scratchpad' },
            { docsFlag: 'includeArtifactToolsDocs', responseTypeKey: 'artifactToolCalls' },
            { docsFlag: 'includePipelineDocs', responseTypeKey: 'pipeline' },
            { docsFlag: 'includeMemoryWritesDocs', responseTypeKey: 'memoryWrites' }
        ];

        for (const { docsFlag, responseTypeKey } of alignmentMappings) {
            // Check if the user explicitly set this response type property
            // (not from schema defaults, which always provide true)
            const wasExplicitlySet = explicitResponseType &&
                Object.prototype.hasOwnProperty.call(explicitResponseType, responseTypeKey);

            // Auto-align: if docs flag is false AND user didn't explicitly set the response type
            // then auto-align the response type to false
            if (params[docsFlag] === false && !wasExplicitlySet) {
                responseType[responseTypeKey] = false;
            }
            // If user explicitly set the value, respect it regardless of docs flag
            // Otherwise default to true if not set
            else if (responseType[responseTypeKey] === undefined) {
                responseType[responseTypeKey] = true;
            }
        }
    }

    /**
     * Extracts default values from a JSON Schema definition.
     *
     * @param schemaJson - JSON string containing the schema
     * @returns Object with property names and their default values
     *
     * @protected
     * @since 2.131.0
     */
    protected extractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown> {
        if (!schemaJson) return {};

        try {
            const schema = JSON.parse(schemaJson);
            const defaults: Record<string, unknown> = {};

            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    const propDef = prop as { default?: unknown };
                    if (propDef.default !== undefined) {
                        defaults[key] = propDef.default;
                    }
                }
            }

            return defaults;
        } catch (e) {
            LogError(`Failed to parse PromptParamsSchema: ${e instanceof Error ? e.message : String(e)}`);
            return {};
        }
    }


    /**
     * This method executes one action using the MemberJunction Actions framework.
     * The full ActionResult objects are returned, allowing the caller to access result codes, output parameters,
     * and other execution details.
     * 
     * @param {ExecuteAgentParams} params - Parameters from agent execution for context passing
     * @param {AgentAction} action - Action to execute
     * @param {UserInfo} [contextUser] - Optional user context for permissions
     * 
     * @returns {Promise<ActionResult>} ActionResult object from the action execution
     * 
     * @throws {Error} If the action fails to execute
     */
    public async ExecuteSingleAction(params: ExecuteAgentParams, action: AgentAction, actionEntity: MJActionEntityExtended, 
        contextUser?: UserInfo): Promise<ActionResult> {
        
        try {
            const actionEngine = ActionEngineServer.Instance;

            // Convert params object to ActionParam array
            const actionParams = Object.entries(action.params || {}).map(([key, value]) => ({
                Name: key,
                Value: value,
                Type: 'Input' as const
            }));

            // Build action context: preserve the agent's context by reference
            // (do NOT spread — spreading destroys class instances, losing
            // getters/methods on typed contexts like SkipAgentContext).
            // Stamp the calling agent's identity and resolved storage account ID
            // directly onto the original context object.
            const actionContext = typeof params.context === 'object' && params.context ? params.context : {};
            (actionContext as Record<string, unknown>).AgentID = params.agent.ID;
            if (this._resolvedStorageAccountId) {
                (actionContext as Record<string, unknown>).__resolvedStorageAccountId = this._resolvedStorageAccountId;
            }

            // Execute the action and return the full ActionResult
            const result = await actionEngine.RunAction({
                Action: actionEntity,
                Params: actionParams,
                ContextUser: contextUser,
                Filters: [],
                SkipActionLog: false,
                Context: actionContext
            });
            
            if (result.Success) {
                this.logStatus(`   ✅ Action '${action.name}' completed successfully`, true, params);
            } else {
                this.logStatus(`   ❌ Action '${action.name}' failed: ${result.Message || 'Unknown error'}`, false, params);
            }
            
            return result;
            
        } catch (error) {
            this.logError(error, {
                category: 'ActionExecution',
                metadata: {
                    actionName: action.name,
                    actionParams: action.params
                }
            });
            throw new Error(`Error executing actions: ${error.message}`);
        }
    }

    /**
     * Prepares conversation messages for sub-agent execution based on database-configured message mode.
     *
     * Message passing is controlled by MessageMode and MaxMessages fields stored in either:
     * - AIAgentRelationship table (for related sub-agents via AgentRelationships)
     * - AIAgent table (for child sub-agents via ParentID)
     *
     * **Message Modes:**
     * - `'None'`: Fresh start - only context message and task message (default)
     * - `'All'`: Pass complete parent conversation history
     * - `'Latest'`: Pass most recent N messages (where N = MaxMessages)
     * - `'Bookend'`: Pass first 2 messages + indicator + most recent (N-2) messages
     *
     * **Priority:** AIAgentRelationship.MessageMode takes precedence over AIAgent.MessageMode
     * to allow different parent agents to pass messages differently to the same sub-agent.
     *
     * Subclasses can override this method to implement custom message preparation logic
     * specific to their domain (e.g., Skip agents adding special context).
     *
     * @param {ExecuteAgentParams} params - Execution parameters with conversation history
     * @param {AgentSubAgentRequest} subAgentRequest - Sub-agent request details
     * @param {MJAIAgentEntityExtended} subAgent - The sub-agent entity
     * @param {ChatMessage | undefined} contextMessage - Optional context from SubAgentContextPaths
     * @returns {ChatMessage[]} Prepared message array for sub-agent execution
     *
     * @protected
     */
    protected prepareSubAgentMessages(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        contextMessage?: ChatMessage
    ): ChatMessage[] {
        const engine = AIEngine.Instance;
        let messages: ChatMessage[] = [];

        // Check for related sub-agent configuration (AIAgentRelationship)
        const relationship = engine.AgentRelationships.find(
            r => UUIDsEqual(r.AgentID, params.agent.ID) && UUIDsEqual(r.SubAgentID, subAgent.ID)
        );

        // Get MessageMode and MaxMessages from either relationship or child agent
        let messageMode = relationship?.MessageMode || subAgent.MessageMode || 'None';
        let maxMessages = relationship?.MaxMessages || subAgent.MaxMessages || null;

        // Apply message mode
        switch (messageMode) {
            case 'None':
                // Fresh start - no conversation history, only context and task
                // Messages are added after the switch statement
                break;

            case 'All':
                // Pass all parent conversation history
                messages = [...params.conversationMessages];
                break;

            case 'Latest':
                // Pass most recent N messages
                if (maxMessages && maxMessages > 0) {
                    messages = params.conversationMessages.slice(-maxMessages);
                } else {
                    messages = [...params.conversationMessages];
                }
                break;

            case 'Bookend':
                // Pass first 2 + most recent (N-2) with indicator message between
                if (maxMessages && maxMessages > 2 && params.conversationMessages.length > maxMessages) {
                    const firstTwo = params.conversationMessages.slice(0, 2);
                    const remaining = params.conversationMessages.slice(-(maxMessages - 2));
                    const omittedCount = params.conversationMessages.length - maxMessages;

                    messages = [
                        ...firstTwo,
                        {
                            role: 'system',
                            content: `[${omittedCount} messages omitted for context management]`
                        },
                        ...remaining
                    ];
                } else {
                    messages = [...params.conversationMessages];
                }
                break;

            default:
                // Fallback to 'None' for any unrecognized mode
                break;
        }

        // Add context message if provided (for all modes)
        if (contextMessage) {
            messages.push(contextMessage);
        }

        if (subAgentRequest.message) {
            messages.push({
                role: 'user',
                content: subAgentRequest.message
            });
        }

        return messages;
    }

    /**
     * Executes a sub-agent synchronously.
     *
     * This method creates a new instance of AgentRunner to execute a sub-agent.
     * The sub-agent receives the provided message/context and runs to completion.
     * If terminateAfter is true, the parent agent will not continue after the
     * sub-agent completes.
     * 
     * @param {AgentSubAgentRequest} subAgentRequest - Sub-agent execution details
     * @param {ChatMessage[]} conversationMessages - Current conversation history
     * @param {UserInfo} [contextUser] - Optional user context
     * 
     * @returns {Promise<ExecuteAgentResult>} Result from the sub-agent execution
     * 
     * @throws {Error} If sub-agent cannot be found or execution fails
     * 
     * @example
     * ```typescript
     * const result = await this.ExecuteSubAgent({
     *   id: 'agent123',
     *   name: 'DataAnalysisAgent',
     *   message: 'Analyze sales data for Q4',
     *   terminateAfter: false
     * }, messages);
     * ```
     */
    protected async ExecuteSubAgent<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        payload?: SR,
        contextMessage?: ChatMessage,
        stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            this.logStatus(`🤖 Executing sub-agent '${subAgentRequest.name}'`, true, params);

            // Create a new AgentRunner instance with the same isolated provider
            const runner = new AgentRunner(params.provider || this._activeProvider);

            // Prepare messages for sub-agent using database-configured message mode
            const subAgentMessages = this.prepareSubAgentMessages(
                params,
                subAgentRequest,
                subAgent,
                contextMessage
            );
            
            // Set parent run ID in the sub-agent's execution
            // This would need to be passed through the AgentRunner in a real implementation
            // For now, we execute normally and the sub-agent will track its parent relationship
            
            this.logStatus(`📨 Sub-agent message: "${subAgentRequest.message}"`, true, params);
            if (subAgentRequest.templateParameters) {
                this.logStatus(`📎 Template parameters: ${JSON.stringify(subAgentRequest.templateParameters)}`, true, params);
            }
            if (params.effortLevel !== undefined && params.effortLevel !== null) {
                this.logStatus(`🎯 Propagating effort level ${params.effortLevel} to sub-agent '${subAgentRequest.name}'`, true, params);
            }

            const parentStepCountsToPass = [...this._parentStepCounts, stepCount + 1];

            // Filter action / sub-agent changes for sub-agent propagation
            const subAgentActionChanges = this.filterActionChangesForSubAgent(params.actionChanges);
            const subAgentSubAgentChanges = this.filterSubAgentChangesForSubAgent(params.subAgentChanges);

            // Execute the sub-agent with cancellation and streaming support
            // Use subAgentRequest.context if provided, otherwise fall back to params.context
            // This allows Flow agents and Loop agents to propagate context through sub-agent requests
            const subAgentContext = subAgentRequest.context !== undefined ? subAgentRequest.context : params.context;

            const result = await runner.RunAgent<SC, SR>({
                agent: subAgent,
                conversationMessages: subAgentMessages,
                contextUser: params.contextUser,
                cancellationToken: params.cancellationToken,
                onProgress: params.onProgress,
                onStreaming: params.onStreaming,
                parentAgentHierarchy: this._agentHierarchy,
                parentDepth: this._depth,
                parentStepCounts: parentStepCountsToPass,
                parentRun: this._agentRun,
                payload: payload, // pass the payload if provided
                configurationId: params.configurationId, // propagate configuration ID to sub-agent
                effortLevel: params.effortLevel, // propagate effort level to sub-agent
                apiKeys: params.apiKeys, // propagate API keys to sub-agent
                inputArtifacts: params.inputArtifacts, // propagate input artifacts so sub-agents inherit the parent's artifact manifest + tools (e.g. a Codesmith delegate can read a Data Snapshot the parent references)
                data: {
                        ...params.data,
                        ...subAgentRequest.templateParameters,
                      }, // merge parent data first, then override with template parameters so loop agents can dynamically override parent data
                context: subAgentContext, // use subAgentRequest.context if provided, otherwise params.context
                verbose: params.verbose, // pass verbose flag to sub-agent
                actionChanges: subAgentActionChanges, // propagate filtered action changes to sub-agent
                subAgentChanges: subAgentSubAgentChanges, // propagate filtered sub-agent changes to sub-agent
                PrimaryScopeEntityName: params.PrimaryScopeEntityName, // propagate scope to sub-agent
                PrimaryScopeRecordID: params.PrimaryScopeRecordID,
                SecondaryScopes: params.SecondaryScopes,
                onAgentRunCreated: async (agentRunId: string) => {
                    stepEntity.TargetLogID = agentRunId;
                    // Re-apply post-INSERT: this callback can fire while the step's INSERT is still in flight,
                    // and the INSERT's reload would otherwise revert TargetLogID back to null.
                    this.queueStepSave(stepEntity, (s) => { s.TargetLogID = agentRunId; });
                }
            });
            
            // Check if execution was successful
            if (result.success) {
                this.logStatus(`✅ Sub-agent '${subAgentRequest.name}' completed successfully`, true, params);
            }
            else {
                this.logStatus(`Sub-agent '${subAgentRequest.name}' failed: ${result.agentRun?.ErrorMessage || 'Unknown error'}`);
            }
            
            // Return the full result for tracking
            return result;
        } catch (error) {
            this.logError(error, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
                    subAgentName: subAgentRequest.name,
                    message: subAgentRequest.message
                }
            });
            throw new Error(`Error executing sub-agent: ${error.message}`);
        }
    }

    /**
     * Formats sub-agent details as compact markdown for inclusion in prompt context.
     *
     * @param {MJAIAgentEntityExtended[]} subAgents - Array of sub-agent entities
     * @returns {string} Markdown formatted string with sub-agent details
     * @private
     */
    private formatSubAgentDetails(subAgents: MJAIAgentEntityExtended[]): string {
        return subAgents.map(sa => {
            let line = `- **${sa.Name}** — ${sa.Description}`;
            if (sa.ExecutionMode !== 'Sequential') {
                line += ` _(${sa.ExecutionMode}, order: ${sa.ExecutionOrder})_`;
            }
            return line;
        }).join('\n');
    }

    /**
     * Utility method to get agent prompt parameters for a given agent. This gets the 
     * highest priority prompt for the agent, and then gets the parameters for that
     * prompt.
     * @param agent 
     */
    protected getAgentPromptParameters(agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity> {
        const engine = AIEngine.Instance;
        const agentPrompt = engine.AgentPrompts
            .filter(ap => UUIDsEqual(ap.AgentID, agent.ID) && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];

        if (!agentPrompt) return [];

        const prompt = engine.Prompts.find(p => UUIDsEqual(p.ID, agentPrompt.PromptID));
        if (!prompt) return [];

        // Return parameters as key-value pairs
        return prompt.TemplateParams;
    }

    protected getAgentPromptParametersJSON(agent: MJAIAgentEntityExtended): string {
        const params = this.getAgentPromptParameters(agent);
        return JSON.stringify(params.map(param => ({
            Name: param.Name,
            Type: param.Type,
            IsRequired: param.IsRequired,
            DefaultValue: param.DefaultValue,
            Description: param.Description
        })), null, 2);
    }

    /**
     * Formats action details as compact markdown for inclusion in prompt context.
     * Produces ~75% fewer tokens than the previous JSON format while preserving
     * all information the LLM needs to invoke actions correctly.
     *
     * @param {MJActionEntityExtended[]} actions - Array of action entities
     * @returns {string} Markdown formatted string with action details
     * @private
     */
    private formatActionDetails(actions: MJActionEntityExtended[]): string {
        return actions.map(action => {
            const lines: string[] = [];
            lines.push(`### ${action.Name}`);
            lines.push(action.Description);

            const inputParams = action.Params
                .filter(p => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'input' || t === 'both';
                });
            const outputParams = action.Params
                .filter(p => {
                    const t = p.Type.trim().toLowerCase();
                    return t === 'output' || t === 'both';
                });

            if (inputParams.length > 0) {
                lines.push(`**Input:** ${inputParams.map(p => this.formatActionParameter(p)).join(', ')}`);
            }
            if (outputParams.length > 0) {
                lines.push(`**Output:** ${outputParams.map(p => this.formatActionParameter(p)).join(', ')}`);
            }

            if (action.ResultCodes.length > 0) {
                const rcParts = action.ResultCodes.map(rc => {
                    const marker = rc.IsSuccess ? '✓' : '✗';
                    const desc = rc.Description && rc.Description.toLowerCase() !== rc.ResultCode.toLowerCase()
                        ? ` ${rc.Description}`
                        : '';
                    return `${rc.ResultCode} ${marker}${desc}`;
                });
                lines.push(`**Results:** ${rcParts.join(' · ')}`);
            }

            return lines.join('\n');
        }).join('\n\n');
    }

    /**
     * Build the client tool prompt section for system prompt injection.
     *
     * Tool sources (checked in order, all merged — first registration wins):
     * 1. Metadata tools from AI Agent Client Tools junction table
     * 2. Session-level enriched tools from ClientToolRequestManager (set by client SDK)
     * 3. Tools provided directly in extraData.clientTools (runtime override)
     */
    private buildClientToolPromptSection(agent: MJAIAgentEntityExtended, extraData?: Record<string, unknown>): string {
        const toolMap = new Map<string, ClientToolMetadata>();

        // 1. Metadata tools from junction table (authoritative source)
        const engine = AIEngine.Instance;
        const metadataTools = engine.GetClientToolsForAgent(agent.ID);
        for (const tool of metadataTools) {
            toolMap.set(tool.Name, {
                Name: tool.Name,
                Description: tool.Description,
                InputSchema: tool.InputSchemaJSON ? JSON.parse(tool.InputSchemaJSON) : {},
                OutputSchema: tool.OutputSchemaJSON ? JSON.parse(tool.OutputSchemaJSON) : undefined,
                Category: tool.Category || undefined,
                DefaultTimeoutMs: tool.DefaultTimeoutMs || undefined
            });
        }

        // 2. Session-level enriched tools (client SDK decorated tools)
        const sessionID = extraData?.sessionID as string | undefined;
        if (sessionID) {
            for (const tool of ClientToolRequestManager.Instance.GetSessionTools(sessionID)) {
                if (!toolMap.has(tool.Name)) {
                    toolMap.set(tool.Name, tool);
                }
            }
        }

        // 3. Runtime extraData override
        if (extraData?.clientTools) {
            for (const tool of extraData.clientTools as ClientToolMetadata[]) {
                if (!toolMap.has(tool.Name)) {
                    toolMap.set(tool.Name, tool);
                }
            }
        }

        const tools = Array.from(toolMap.values());

        if (tools.length === 0) {
            return ''; // No client tools available
        }

        const lines: string[] = [];
        lines.push('### Client Tools (execute in the user\'s browser)');
        lines.push('Client tools run in the user\'s browser and interact with the UI. Use these when you need');
        lines.push('to navigate the user somewhere, display a specific view, switch dashboard tabs, or show');
        lines.push('records. When you choose client tools, set nextStep.type to "ClientTools".');
        lines.push('');
        lines.push('NOTE: Do NOT use client tools for asking the user questions or collecting input.');
        lines.push('Use the "Chat" step for that. Client tools are for programmatic UI interaction only.');
        lines.push('');

        for (const tool of tools) {
            const categoryTag = tool.Category ? ` [${tool.Category}]` : '';
            lines.push(`- **${tool.Name}**${categoryTag}: ${tool.Description}`);

            // Show input parameters from InputSchema
            const props = (tool.InputSchema as Record<string, unknown>)?.properties as Record<string, Record<string, unknown>> | undefined;
            const required = (tool.InputSchema as Record<string, unknown>)?.required as string[] | undefined;
            if (props) {
                const paramParts = Object.entries(props).map(([name, schema]) => {
                    const req = required?.includes(name) ? '\\*' : '';
                    const desc = schema.description ? ` — ${schema.description}` : '';
                    return `\`${name}\`${req}${desc}`;
                });
                lines.push(`  Inputs: ${paramParts.join(', ')}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Build the app context section for system prompt injection.
     * Reads the AppContextSnapshot from extraData.appContext and formats
     * it as a concise markdown section the LLM can reference.
     */
    private buildAppContextSection(extraData?: Record<string, unknown>): string {
        const ctx = extraData?.appContext as Record<string, unknown> | undefined;
        if (!ctx) return '';

        const app = ctx['App'] as { Name?: string; Description?: string } | undefined;
        const activeNav = ctx['ActiveNavItem'] as { Name?: string; Description?: string; ResourceType?: string } | undefined;
        const otherNavs = ctx['OtherNavItems'] as Array<{ Name?: string; Description?: string }> | undefined;
        const user = ctx['User'] as { Name?: string; Roles?: string[] } | undefined;

        if (!app?.Name) return '';

        const lines: string[] = [];
        lines.push('### Current Application Context');
        lines.push(`The user is currently in the **${app.Name}** application${app.Description ? ` — ${app.Description}` : ''}.`);

        if (activeNav?.Name) {
            lines.push('');
            lines.push(`**Active view:** ${activeNav.Name}${activeNav.Description ? ` — ${activeNav.Description}` : ''}${activeNav.ResourceType ? ` (${activeNav.ResourceType})` : ''}`);
        }

        if (otherNavs && otherNavs.length > 0) {
            lines.push('');
            lines.push('**Other views available in this app:**');
            for (const nav of otherNavs) {
                lines.push(`- ${nav.Name}${nav.Description ? ` — ${nav.Description}` : ''}`);
            }
        }

        if (user?.Name) {
            lines.push('');
            lines.push(`**User:** ${user.Name}${user.Roles?.length ? ` (Roles: ${user.Roles.join(', ')})` : ''}`);
        }

        // Additional context reported by the active view/component
        const dashboardCtx = ctx['AdditionalContext'] as Record<string, unknown> | undefined;
        if (dashboardCtx && Object.keys(dashboardCtx).length > 0) {
            lines.push('');
            lines.push('**Dashboard state:**');
            for (const [key, value] of Object.entries(dashboardCtx)) {
                if (value === null || value === undefined) continue;
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                lines.push(`- ${key}: ${displayValue}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Formats a single action parameter as a compact inline string.
     * Uses \* suffix for required, (array) when IsArray, and only shows
     * ValueType when it is not Scalar/Other.
     *
     * @param {MJActionParamEntity} param - The action parameter to format
     * @returns {string} Compact inline string, e.g. `` `To`\* — Email address ``
     * @private
     */
    private formatActionParameter(param: MJActionParamEntity): string {
        const requiredMarker = param.IsRequired ? '\\*' : '';
        const parts: string[] = [];

        if (param.IsArray) {
            parts.push('array');
        }

        const vt = param.ValueType?.trim();
        if (vt && vt !== 'Scalar' && vt !== 'Other') {
            parts.push(vt);
        }

        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';

        let defaultStr = '';
        if (param.DefaultValue != null && param.DefaultValue !== '') {
            defaultStr = ` (default: ${JSON.stringify(param.DefaultValue)})`;
        }

        const desc = param.Description ? ` — ${param.Description}` : '';
        return `\`${param.Name}\`${requiredMarker}${suffix}${desc}${defaultStr}`;
    }

    /**
     * Formats an array of action result summaries as compact markdown instead of
     * pretty-printed JSON.  This typically saves 60-70 % of the tokens that the
     * old `JSON.stringify(actionSummaries, null, 2)` approach consumed, while
     * remaining equally parseable by LLMs.
     *
     * Format per action:
     * ```
     * ## ActionName ✓          (or ✗ for failure)
     * **Result:** RESULT_CODE — human message
     * **Output:**
     * • `ParamName`: value
     * ```
     *
     * AI directives are intentionally omitted here because they are surfaced
     * as a separate high-priority message (see the caller).
     *
     * @param actionSummaries - The action summary objects built by executeActionStep
     * @returns Compact markdown string
     * @private
     */
    private formatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string {
        return actionSummaries.map(a => {
            const marker = a.success ? '✓' : '✗';
            const lines: string[] = [];

            lines.push(`## ${a.actionName} ${marker}`);
            lines.push(`**Result:** ${a.resultCode} — ${a.message || '(no message)'}`);

            // Format output params as bullet list
            if (a.params && a.params.length > 0) {
                lines.push('**Output:**');
                for (const p of a.params) {
                    lines.push(`• \`${p.Name}\`: ${this.formatParamValueForResult(p.Value)}`);
                }
            }

            return lines.join('\n');
        }).join('\n\n');
    }

    /**
     * Formats an ExecuteAgentResult as compact markdown for inclusion in
     * conversation messages.  Extracts only the fields that are meaningful
     * to the calling agent (success, status, error, and payload) and
     * presents them in a concise format.
     *
     * @param subAgentName - Display name of the sub-agent
     * @param result       - The execution result from the sub-agent
     * @returns Compact markdown string
     * @private
     */
    private formatSubAgentResultAsMarkdown(subAgentName: string, result: ExecuteAgentResult): string {
        const marker = result.success ? '✓' : '✗';
        const lines: string[] = [];

        lines.push(`## Sub-agent: ${subAgentName} ${marker}`);

        // Status / error from the agent run
        const status = result.agentRun?.Status || (result.success ? 'Completed' : 'Failed');
        lines.push(`**Status:** ${status}`);

        if (!result.success && result.agentRun?.ErrorMessage) {
            lines.push(`**Error:** ${result.agentRun.ErrorMessage}`);
        }

        // Payload — the actual result data the parent agent cares about.
        // Not truncated by default — the expiration/compaction lifecycle handles
        // context window management. Truncating here permanently discards data
        // before the LLM ever sees it.
        if (result.payload != null) {
            const payloadStr = typeof result.payload === 'string'
                ? result.payload
                : JSON.stringify(result.payload);
            lines.push(`**Payload:**\n${payloadStr}`);
        }

        return lines.join('\n');
    }

    /**
     * Formats a single output parameter value for inclusion in action result
     * markdown.  Scalars are shown inline with backtick formatting; objects and
     * arrays use compact (single-line) JSON to avoid the indentation overhead
     * of pretty-printed JSON.
     *
     * By default, values are **not truncated** — the expiration/compaction lifecycle
     * handles context window management. Truncating at formatting time permanently
     * discards data before the LLM ever sees it. Pass an explicit maxLength only
     * when you have a specific reason to limit output size.
     *
     * @param value - The parameter value (any type)
     * @param maxLength - Maximum character length before truncation (0 = no limit, default 0)
     * @returns Formatted string
     * @private
     */
    private formatParamValueForResult(value: unknown, maxLength: number = 0): string {
        if (value === null || value === undefined) {
            return '`null`';
        }

        if (typeof value === 'boolean' || typeof value === 'number') {
            return `\`${String(value)}\``;
        }

        let stringValue: string;
        if (typeof value === 'string') {
            stringValue = value;
        } else {
            // Compact JSON (no pretty-printing) for objects/arrays
            stringValue = JSON.stringify(value);
        }

        if (maxLength > 0 && stringValue.length > maxLength) {
            return `${stringValue.substring(0, maxLength)}…`;
        }

        return stringValue;
    }

    /**
     * Formats a parameter value for display in action execution messages.
     * Truncates long strings and formats objects/arrays for readability.
     *
     * @param {any} value - The parameter value to format
     * @param {number} maxLength - Maximum length before truncation (default: 100)
     * @returns {string} Formatted value suitable for message display
     * @private
     */
    private formatParamValueForMessage(value: any, maxLength: number = 100): string {
        if (value === null || value === undefined) {
            return 'null';
        }

        let stringValue: string;

        if (typeof value === 'string') {
            stringValue = value;
        } else if (typeof value === 'object') {
            // For objects/arrays, use compact JSON
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        // Truncate if too long
        if (stringValue.length > maxLength) {
            return `\`${stringValue.substring(0, maxLength)}...\``;
        }

        // Use inline code formatting for values
        return `\`${stringValue}\``;
    }

    /**
     * Gets the agent type name for a given type ID.
     *
     * @param {string} typeID - The agent type ID
     * @returns {string} The agent type name or 'Unknown'
     * @private
     */
    private getAgentTypeName(typeID: string): string {
        const agentType = AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, typeID));
        return agentType?.Name || 'Unknown';
    }

    /**
     * Determines if an action change scope applies to the current agent.
     *
     * @param {ActionChangeScope} scope - The scope of the action change
     * @param {string} agentId - The ID of the current agent
     * @param {boolean} isRoot - Whether this is the root agent
     * @param {string[]} [agentIds] - Array of specific agent IDs (for 'specific' scope)
     * @returns {boolean} True if the change applies to this agent
     * @protected
     * @since 2.123.0
     */
    protected doesChangeScopeApply(
        scope: ActionChangeScope,
        agentId: string,
        isRoot: boolean,
        agentIds?: string[]
    ): boolean {
        switch (scope) {
            case 'global':
                return true;
            case 'root':
                return isRoot;
            case 'all-subagents':
                return !isRoot;
            case 'specific':
                return agentIds?.includes(agentId) ?? false;
            default:
                return false;
        }
    }

    /**
     * Result type for applyActionChanges method.
     * Contains both the modified actions and any dynamic execution limits.
     * @since 2.123.0
     */
    protected applyActionChanges(
        baseActions: MJActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> } {
        let actions = [...baseActions];
        const dynamicLimits: Record<string, number> = {};

        for (const change of actionChanges) {
            // Check if this change applies to this agent
            if (!this.doesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
                continue;
            }

            if (change.mode === 'add') {
                // Add actions that aren't already present
                for (const actionId of change.actionIds) {
                    if (!actions.some(a => UUIDsEqual(a.ID, actionId))) {
                        const actionToAdd = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, actionId));
                        if (actionToAdd) {
                            actions.push(actionToAdd);
                            // Store execution limit if provided
                            if (change.actionLimits?.[actionId] != null) {
                                dynamicLimits[actionId] = change.actionLimits[actionId];
                            }
                        } else {
                            LogStatus(`Action with ID '${actionId}' not found in ActionEngineServer - skipping add`);
                        }
                    }
                }
            } else if (change.mode === 'remove') {
                // Remove actions by ID
                actions = actions.filter(a => !change.actionIds.some(id => UUIDsEqual(id, a.ID)));
            }
        }

        return { actions, dynamicLimits };
    }

    /**
     * Filters and transforms action changes for propagation to a sub-agent.
     *
     * This method applies the following propagation rules:
     * - 'global': Propagated as-is to all sub-agents
     * - 'root': Not propagated (only applies to root agent)
     * - 'all-subagents': Propagated as 'global' (since sub-agent is now in scope)
     * - 'specific': Propagated as-is (sub-agent checks if it's in agentIds)
     *
     * @param {ActionChange[] | undefined} actionChanges - The action changes to filter
     * @returns {ActionChange[] | undefined} Filtered action changes for sub-agent, or undefined if empty
     * @protected
     * @since 2.123.0
     */
    protected filterActionChangesForSubAgent(
        actionChanges: ActionChange[] | undefined
    ): ActionChange[] | undefined {
        if (!actionChanges?.length) {
            return undefined;
        }

        const filtered: ActionChange[] = [];

        for (const change of actionChanges) {
            switch (change.scope) {
                case 'root':
                    // Don't propagate - only applied to root
                    continue;

                case 'global':
                    // Propagate as-is - applies to everyone
                    filtered.push(change);
                    break;

                case 'all-subagents':
                    // Propagate as 'global' since from sub-agent's perspective,
                    // it and its children should all get this
                    filtered.push({ ...change, scope: 'global' });
                    break;

                case 'specific':
                    // Propagate as-is, each agent checks if it's in the list
                    filtered.push(change);
                    break;
            }
        }

        return filtered.length > 0 ? filtered : undefined;
    }

    /**
     * Gets value list items for a parameter.
     * 
     * @param {string} valueListID - The value list ID
     * @returns {string[] | null} Array of allowed values or null
     * @private
     */
    private getValueListItems(valueListID: string): string[] | null {
        // This would need to be implemented based on your value list storage
        // For now, returning null
        return null;
    }

    /**
     * Gets the action category name for a given category ID.
     * 
     * @param {string} categoryID - The action category ID
     * @returns {string} The category name or 'Uncategorized'
     * @private
     */
    private getActionCategoryName(categoryID: string): string {
        // This would need to be implemented based on your category storage
        // For now, returning a placeholder
        return 'General';
    }
 
    /**
     * Initializes the agent run tracking by creating MJAIAgentRunEntityExtended and setting up context.
     * 
     * @private
     * @param {ExecuteAgentParams} params - The execution parameters
     */
    private async initializeAgentRun(params: ExecuteAgentParams): Promise<void> {
        // Handle autoPopulateLastRunPayload if requested
        let modifiedParams = params;
        if (params.lastRunId && params.autoPopulateLastRunPayload) {
            // Load the last run to get its FinalPayload
            const rv = new RunView();
            const lastRunResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${params.lastRunId}'`,
                ResultType: 'simple' // Avoid recursive loading
            }, params.contextUser);
            
            if (lastRunResult.Success && lastRunResult.Results.length > 0) {
                const lastRun = lastRunResult.Results[0];
                if (lastRun.FinalPayload) {
                    try {
                        const lastPayload = JSON.parse(lastRun.FinalPayload);
                        // Only set payload if not explicitly provided
                        if (!params.payload) {
                            modifiedParams = {
                                ...params,
                                payload: lastPayload
                            };
                        }
                    } catch (e) {
                        this.logError(`Failed to parse FinalPayload from last run: ${e}`, {
                            category: 'LastRunPayload',
                            metadata: { lastRunId: params.lastRunId }
                        });
                    }
                }
            }
        }
        
        // Reset prompt turn counter for this execution
        this._promptTurnCount = 0;

        // Create MJAIAgentRunEntity
        this._agentRun = await (params.provider || this._activeProvider).GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        if (params.conversationDetailId) {
            this._agentRun.ConversationDetailID = params.conversationDetailId;
        }
        // Use conversationId from data if available (already passed by AgentRunner)
        // This avoids a redundant network lookup since AgentRunner already loaded this
        if (params.data?.conversationId) {
            this._agentRun.ConversationID = params.data.conversationId;
        }
        // Stamp the realtime/long-lived session id (if any) so every run — including delegated
        // child runs that inherit this value — is groupable under the same MJ: AI Agent Session.
        if (params.agentSessionID) {
            this._agentRun.AgentSessionID = params.agentSessionID;
        }
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.userId || params.contextUser?.ID || null;
        this._agentRun.CompanyID = params.companyId || null;

        // Resolve and save the effort level used (same precedence hierarchy as prompts)
        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            this._agentRun.EffortLevel = params.effortLevel;
        } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
            this._agentRun.EffortLevel = params.agent.DefaultPromptEffortLevel;
        }
        // If neither is set, EffortLevel remains null (no effort level override was used)
        
        // Set parent run ID if we're in a sub-agent context
        this._agentRun.ParentRunID = params.parentRun?.ID;
        
        // Set LastRunID for run chaining (different from ParentRunID)
        if (params.lastRunId) {
            // Check for circular references in the run chain
            await this.validateRunChain(params.lastRunId, params.contextUser);
            
            this._agentRun.LastRunID = params.lastRunId;
        }
        
        // Set StartingPayload if we have a payload (either from params or auto-populated)
        if (modifiedParams.payload) {
            this._agentRun.StartingPayload = JSON.stringify(modifiedParams.payload);
        }
        
        // Set new fields from ExecuteAgentParams
        if (params.configurationId) {
            this._agentRun.ConfigurationID = params.configurationId;
        }
        if (params.override?.modelId) {
            this._agentRun.OverrideModelID = params.override.modelId;
        }
        if (params.override?.vendorId) {
            this._agentRun.OverrideVendorID = params.override.vendorId;
        }
        if (params.data) {
            this._agentRun.Data = JSON.stringify(params.data);
        }
        this._agentRun.Verbose = params.verbose || false;

        // Set TestRunID if provided
        if (params.testRunId) {
            this._agentRun.TestRunID = params.testRunId;
        }

        // Set scope for multi-tenant deployments
        // Resolve from top-level params or data fallback (for GraphQL callers)
        const primaryScopeEntityName = params.PrimaryScopeEntityName ?? (params.data?.PrimaryScopeEntityName as string | undefined);
        const primaryScopeRecordID = params.PrimaryScopeRecordID ?? (params.data?.PrimaryScopeRecordID as string | undefined);
        const secondaryScopes = params.SecondaryScopes ?? (params.data?.SecondaryScopes as Record<string, SecondaryScopeValue> | undefined);

        if (primaryScopeEntityName || primaryScopeRecordID || secondaryScopes) {
            // Parse agent's SecondaryScopeConfig from the ScopeConfig field
            const scopeConfig = this.parseSecondaryScopeConfig(params.agent);

            // Validate and apply secondary scopes with defaults
            const validatedSecondary = this.validateAndApplySecondaryScopes(
                secondaryScopes,
                scopeConfig,
                params.agent.Name
            );

            // Check if secondary-only is allowed
            const hasSecondary = validatedSecondary && Object.keys(validatedSecondary).length > 0;
            const hasPrimary = !!primaryScopeRecordID;
            const allowSecondaryOnly = scopeConfig?.allowSecondaryOnly ?? false;

            if (hasSecondary && !hasPrimary && !allowSecondaryOnly) {
                LogError(
                    `Scoping: Agent "${params.agent.Name}" requires primary scope when using secondary scopes. ` +
                    `Set allowSecondaryOnly=true in ScopeConfig to allow secondary-only scoping.`
                );
            }

            // Resolve primary entity ID from entity name
            if (primaryScopeEntityName) {
                const primaryEntity = this.ProviderToUse.EntityByName(primaryScopeEntityName);
                if (primaryEntity) {
                    this._agentRun.PrimaryScopeEntityID = primaryEntity.ID;
                } else {
                    LogError(`Scoping: Entity "${primaryScopeEntityName}" not found in metadata`);
                }
            }
            // Set primary scope record ID
            if (primaryScopeRecordID) {
                this._agentRun.PrimaryScopeRecordID = primaryScopeRecordID;
            }
            // Set secondary scopes as JSON (with defaults applied)
            if (validatedSecondary && Object.keys(validatedSecondary).length > 0) {
                this._agentRun.SecondaryScopes = JSON.stringify(validatedSecondary);
            }
        }

        // Save the agent run
        if (!await this._agentRun.Save()) {
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(this._agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
        }

        // Hand the now-persisted run (it has a stable ID) to the watchdog so a process restart,
        // crash, or failed terminal-state write can't leave it stuck 'Running' forever. Only the
        // server-side DB provider can heartbeat via SQL; client/non-DB providers simply opt out.
        const runProvider = params.provider || this._activeProvider;
        if (runProvider instanceof DatabaseProviderBase && params.contextUser) {
            AgentRunWatchdog.Instance.Track(this._agentRun.ID, runProvider, params.contextUser);
        }

        // Invoke callback if provided
        if (modifiedParams.onAgentRunCreated) {
            try {
                await modifiedParams.onAgentRunCreated(this._agentRun.ID);
            } catch (callbackError) {
                LogStatus(`Error in onAgentRunCreated callback: ${callbackError.message}`);
                // Don't fail the execution if callback fails
            }
        }

        // Initialize hierarchy tracking
        this._agentHierarchy = params.parentAgentHierarchy
            ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
            : [params.agent.Name || 'Unknown Agent'];
        this._depth = params.parentDepth !== undefined ? params.parentDepth + 1 : 0;
        this._parentStepCounts = params.parentStepCounts || [];

        // Reset execution chain and progress tracking
        this._allProgressSteps = [];
        
        // Update params with the modified payload if auto-populated
        if (modifiedParams !== params && modifiedParams.payload !== undefined) {
            // Directly update the params object's payload property
            // This ensures the rest of the execution uses the correct payload
            params.payload = modifiedParams.payload;
        }
    }

    /**
     * Validates the agent with tracking.
     * 
     * @private
     * @param {MJAIAgentEntityExtended} agent - The agent to validate
     * @returns {Promise<ExecuteAgentResult | null>} - Failure result if validation fails, null if successful
     */
    private async validateAgentWithTracking(agent: MJAIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        try {
            // Original validation logic
            const validationResult = await this.validateAgent(agent);
            
            if (validationResult) {
                // Create validation step
                const stepEntity = await this.createStepEntity({ stepType: 'Validation', stepName: 'Agent Validation', contextUser });
                
                
                // Update step entity
                await this.finalizeStepEntity(stepEntity, false, validationResult.agentRun?.ErrorMessage);
                
                return await this.createFailureResult(validationResult.agentRun?.ErrorMessage || 'Validation failed', contextUser);
            }
            
            // Validation successful - create success step
            const stepEntity = await this.createStepEntity({ stepType: 'Validation', stepName: 'Agent Validation', contextUser });
            
            
            await this.finalizeStepEntity(stepEntity, true);
            
            return null;
        } catch (error) {
            return await this.createFailureResult(`Validation error: ${(error as Error).message}`, contextUser);
        }
    }

    /**
     * Creates a step entity for tracking.
     *
     * Exposed as `protected` so driver sub-classes (e.g. Skip) can author custom
     * `AIAgentRunStep` records with the same setup correctness — `StepNumber`,
     * hierarchy breadcrumb, UUID validation, payload serialization, and the
     * `queueStepSave` coupling that keeps INSERT-then-UPDATE ordering safe.
     *
     * @protected
     * @param params - Step creation parameters
     * @returns {Promise<MJAIAgentRunStepEntityExtended>} - The created step entity
     */
    protected async createStepEntity(params: {
        stepType: MJAIAgentRunStepEntityExtended["StepType"];
        stepName: string;
        contextUser: UserInfo;
        targetId?: string;
        inputData?: any;
        targetLogId?: string;
        payloadAtStart?: any;
        payloadAtEnd?: any;
        parentId?: string;
    }): Promise<MJAIAgentRunStepEntityExtended> {
        const stepEntity = await this._activeProvider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', params.contextUser);
        // Client-generate the PK so the step ID is valid IMMEDIATELY (before the INSERT lands) — child
        // steps link via ParentID and the post-create UPDATE-phase mutations reference this row, and the
        // create INSERT is fire-and-forget (the agent flow must not block on it).
        stepEntity.NewRecord();

        // Step number is based on current count of steps + 1
        const stepNumber = (this._agentRun!.Steps?.length || 0) + 1;
        // Warn on a non-UUID targetId before delegating (initAgentRunStep silently ignores invalid ids).
        if (params.targetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.targetId)) {
            console.warn(`Invalid target ID format: ${params.targetId}`);
        }
        // Populate the started fields via the shared single-source-of-truth helper. Instance-specific
        // concerns (hierarchy breadcrumb, InputData context, payload serialization) are computed here.
        initAgentRunStep(stepEntity, {
            AgentRunID: this._agentRun!.ID,
            StepNumber: stepNumber,
            StepType: params.stepType,
            StepName: this.formatHierarchicalMessage(params.stepName),  // include hierarchy breadcrumb
            TargetID: params.targetId,
            TargetLogID: params.targetLogId,
            ParentID: params.parentId,  // Link to parent step (e.g., loop step)
            PayloadAtStart: this.serializePayloadAtStart(params.payloadAtStart),
            PayloadAtEnd: this.serializePayloadAtEnd(params.payloadAtEnd),
            InputData: params.inputData
                ? JSON.stringify({
                      ...params.inputData,
                      context: {
                          agentHierarchy: this._agentHierarchy,
                          depth: this._depth,
                          stepNumber
                      }
                  })
                : undefined
        });

        // Fire-and-forget the 'started' INSERT — the agent flow never blocks on a step save. The queue
        // tracks the INSERT so every later UPDATE (queueStepSave) chains AFTER it commits.
        this._stepSaveQueue.Insert(stepEntity);

        // Add the step to the agent run's Steps array
        if (this._agentRun) {
            this._agentRun.Steps.push(stepEntity);
        }

        return stepEntity;
    }

    /**
     * Finalizes a step entity with completion status.
     * 
     * @private
     * @param {MJAIAgentRunStepEntityExtended} stepEntity - The step entity to finalize
     * @param {boolean} success - Whether the step was successful
     * @param {string} [errorMessage] - Optional error message
     * @param {any} [outputData] - Optional output data to capture for this step
     */
    /**
     * Builds a summary of payload change results for storage
     * @param changeResult The result from PayloadManager operations
     * @returns A serializable summary object
     */
    private buildPayloadChangeResultSummary(changeResult: PayloadManagerResult<any>): PayloadChangeResultSummary {
        return {
            applied: changeResult.applied,
            warnings: changeResult.warnings,
            requiresFeedback: changeResult.requiresFeedback,
            timestamp: changeResult.timestamp,
            
            // Include blocked operations for payload validation tracking
            payloadValidation: changeResult.blockedOperations && changeResult.blockedOperations.length > 0 ? {
                selfWriteViolations: {
                    deniedOperations: changeResult.blockedOperations,
                    timestamp: changeResult.timestamp.toISOString()
                }
            } : undefined,
            
            // Include analysis summary if available
            analysis: changeResult.analysis ? {
                totalWarnings: changeResult.analysis.summary.totalWarnings,
                warningsByType: changeResult.analysis.summary.warningsByType,
                suspiciousChanges: changeResult.analysis.summary.suspiciousChanges,
                // Only store critical warnings to save space
                criticalWarnings: changeResult.analysis.criticalWarnings.map(w => ({
                    type: w.type,
                    severity: w.severity,
                    path: w.path,
                    message: w.message
                }))
            } : undefined,
            
            // Store compact diff summary instead of full diff
            diffSummary: changeResult.diff ? {
                added: changeResult.diff.summary.added,
                removed: changeResult.diff.summary.removed,
                modified: changeResult.diff.summary.modified,
                totalChanges: changeResult.diff.summary.totalPaths
            } : undefined
        };
    }

    /**
     * Finalizes a step entity with completion status. Pairs with `createStepEntity`
     * — drivers that create custom steps should also finalize them through this
     * method so `Status`/`CompletedAt`/`Success`/`ErrorMessage`/`OutputData` are
     * populated consistently and the UPDATE is sequenced behind the INSERT via
     * `queueStepSave`.
     *
     * @protected
     */
    protected async finalizeStepEntity(stepEntity: MJAIAgentRunStepEntityExtended, success: boolean, errorMessage?: string, outputData?: any): Promise<void> {
        try {
            // Capture the completion timestamp NOW so the duration is accurate regardless of when the
            // mutation is actually applied/persisted.
            const finalizeOpts = {
                success,
                errorMessage,
                outputData: outputData ? CopyScalarsAndArrays(outputData, true) : undefined,
                completedAt: new Date(),
                // Capture any TargetLogID already stamped on the entity (e.g. a prompt-run / sub-agent-run id
                // set before finalize) so the post-INSERT re-apply restores it too — otherwise the INSERT's
                // reload could leave it null on a fast step.
                targetLogID: stepEntity.TargetLogID ?? undefined
            };

            // Apply to the in-memory entity NOW so the run's Steps array / UI see the terminal state
            // immediately. This in-memory copy can be reverted by the INSERT's post-save reload if the step
            // finished while its INSERT was still in flight, which is why we ALSO re-apply it inside the
            // post-INSERT continuation below (idempotent — same completedAt).
            finalizeAgentRunStep(stepEntity, finalizeOpts);

            // Fire-and-forget the UPDATE, but re-assert the finalize state AFTER the INSERT (and its reload)
            // lands so the force-persisted UPDATE never writes stale pre-finalize values. The agent flow
            // never blocks on this UPDATE.
            this.queueStepSave(stepEntity, (s) => finalizeAgentRunStep(s, finalizeOpts));
        }
        catch (e) {
            LogError(`Failed to update agent run step record: ${(e as Error)?.message ?? e}`, undefined, e);
        }
    }

    /**
     * Queues a fire-and-forget UPDATE of a step entity whose fields the caller has ALREADY mutated.
     * Delegates to {@link AgentRunStepSaveQueue.QueueUpdate} — the agent flow never awaits this; the UPDATE
     * chains after the step's INSERT and force-persists (`IgnoreDirtyState`). Kept `protected` so driver
     * subclasses that finalize their own steps get the same non-blocking behavior.
     *
     * @protected
     */
    protected queueStepSave(stepEntity: MJAIAgentRunStepEntityExtended, applyMutation?: (stepEntity: MJAIAgentRunStepEntityExtended) => void): void {
        this._stepSaveQueue.QueueUpdate(stepEntity, applyMutation);
    }

    /**
     * Maps an array through an async worker with bounded concurrency.
     * Preserves input order in the output. Used to cap parallel sub-agent and
     * preload dispatches so a misbehaving LLM (or a runaway data source) can't
     * exhaust the model API or DB pool.
     *
     * Exposed as `protected` so driver sub-classes performing custom parallel
     * work get the same bounded-fan-out + ordered-results contract for free.
     *
     * @protected
     */
    protected async mapWithConcurrency<T, R>(
        items: T[],
        limit: number,
        worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        if (items.length === 0) return [];
        const effectiveLimit = Math.max(1, Math.min(limit, items.length));
        const results: R[] = new Array(items.length);
        let next = 0;
        const runners: Promise<void>[] = [];
        for (let i = 0; i < effectiveLimit; i++) {
            runners.push((async () => {
                while (true) {
                    const idx = next++;
                    if (idx >= items.length) return;
                    results[idx] = await worker(items[idx], idx);
                }
            })());
        }
        await Promise.all(runners);
        return results;
    }

    /**
     * Default parameter resolution for loop body parameters (used by Flow agents)
     * Resolves item.field, payload.field, item, index, or static values
     * @private
     */
    private resolveLoopParams(
        params: Record<string, unknown>,
        item: any,
        index: number,
        payload: any
    ): Record<string, unknown> {
        const resolved: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                if (value.startsWith('item.')) {
                    resolved[key] = this.getValueFromPath(item, value.substring(5));
                } else if (value.startsWith('payload.')) {
                    resolved[key] = this.getValueFromPath(payload, value.substring(8));
                } else if (value === 'item') {
                    resolved[key] = item;
                } else if (value === 'index') {
                    resolved[key] = index;
                } else {
                    resolved[key] = value;  // Static value
                }
            } else {
                resolved[key] = value;
            }
        }

        return resolved;
    }

    /**
     * Formats a message with agent hierarchy for streaming/progress updates.
     *
     * Exposed as `protected` so driver sub-classes emit progress events whose
     * breadcrumbs line up with the framework's own — keeps the Explorer tree
     * view consistent across custom and built-in dispatch.
     *
     * @protected
     * @param {string} baseMessage - The base message to format
     * @returns {string} - The formatted message with hierarchy breadcrumb
     */
    protected formatHierarchicalMessage(baseMessage: string): string {
        if (this._depth > 0) {
            // Build breadcrumb from agent hierarchy (skip root agent)
            const breadcrumb = this._agentHierarchy
                .slice(1)
                .join(' → ');
            return breadcrumb ? `${breadcrumb}: ${baseMessage}` : baseMessage;
        }
        return baseMessage;
    }

    /**
     * Builds hierarchical step string from parent and current step counts.
     *
     * Examples:
     * - Root agent step 2: buildHierarchicalStep(2, []) => "2"
     * - Sub-agent step 1 under root step 2: buildHierarchicalStep(1, [2]) => "2.1"
     * - Nested sub-agent step 3: buildHierarchicalStep(3, [2, 1]) => "2.1.3"
     * - Deep nesting: buildHierarchicalStep(5, [1, 2, 3, 4]) => "1.2.3.4.5"
     *
     * Exposed as `protected` so driver sub-classes can emit step labels that
     * match the framework's `2.1.3` nesting convention.
     *
     * @param currentStep - Current agent's step number (1-based)
     * @param parentSteps - Array of parent step counts from root to immediate parent
     * @returns Formatted hierarchical step string, or undefined if currentStep is undefined/null
     * @protected
     */
    protected buildHierarchicalStep(currentStep: number | undefined, parentSteps: number[]): string | undefined {
        if (currentStep == null) return undefined;

        if (parentSteps.length === 0) {
            // Root agent - just return step number
            return currentStep.toString();
        }

        // Nested agent - concatenate parent steps with current step
        return [...parentSteps, currentStep].join('.');
    }

    /**
     * Gets human-readable reasoning for the next step decision.
     *
     * @private
     * @param {BaseAgentNextStep} nextStep - The next step decision
     * @returns {string} Human-readable reasoning
     */
    private getNextStepReasoning(nextStep: BaseAgentNextStep): string {
        switch (nextStep.step) {
            case 'Failed':
                return nextStep.errorMessage || 'Agent execution failed';
            case 'Retry':
                return nextStep.retryReason || 'Retrying with updated context';
            default:
                return nextStep.reasoning || 'Continuing to next step';
        }
    }

    /**
     * Executes the next step based on the current state.
     * 
     * This method can be overridden by subclasses to customize step execution behavior.
     * It handles the execution of different step types (prompt, actions, sub-agent, chat)
     * based on the previous decision.
     * 
     * @protected
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {AgentConfiguration} config - Agent configuration
     * @param {BaseAgentNextStep | null} previousDecision - Previous step decision
     * @returns {Promise<BaseAgentNextStep<P>>}
     */
    protected async executeNextStep<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        
        // Determine what to execute
        if (!previousDecision) {
            // First execution - ask the agent type what to do
            const initialStep = await this.AgentTypeInstance.DetermineInitialStep<P>(params, params.payload, this.AgentTypeState);
            
            if (initialStep) {
                // Agent type provided an initial step
                return initialStep;
            }
            
            // Default behavior - run the initial prompt
            return await this.executePromptStep(params, config, undefined, stepCount);
        }
        
        // First, ask agent type if it wants to handle the next step in a custom way
        const customNextStep = await this.AgentTypeInstance.PreProcessNextStep(params, previousDecision, previousDecision.newPayload || previousDecision.previousPayload, this.AgentTypeState);

        if (customNextStep) {
            // Agent type provided custom handling
            return customNextStep;
        }

        // Execute based on the previous decision using standard logic
        switch (previousDecision.step) {
            case 'Retry':
                // Check if this is a message expansion request
                if (previousDecision.messageIndex !== undefined) {
                    // Handle message expansion before retrying
                    this.executeExpandMessageStep(previousDecision, params, this._promptTurnCount);
                }
                return await this.executePromptStep(params, config, previousDecision, stepCount);
            case 'Sub-Agent':
                return await this.processSubAgentStep<P, P>(params, previousDecision!, undefined, undefined, stepCount);
            case 'Actions':
                return await this.executeActionsStep(params, previousDecision, undefined, true, stepCount);
            // Type assertion required because 'ClientTools' is not part of the BaseAgentNextStep
            // step union — LoopAgentType.DetermineNextStep() emits it when the LLM chooses client tools.
            case 'ClientTools' as typeof previousDecision.step:
                return await this.executeClientToolsStep(params, config, previousDecision, stepCount);
            case 'Chat':
                return await this.executeChatStep(params, previousDecision);
            case 'Success':
                if (previousDecision.terminate) {
                    // If parent agent previously requested to auto-terminate, after a successful
                    // sub-agent run, we can finalize the agent run
                    return {
                        terminate: true,
                        step: 'Success',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload
                    };
                }
                else {
                    // Ask agent type how to handle this Success step
                    const fallbackStep = await this.AgentTypeInstance.HandleStepFallback(
                        previousDecision,
                        config,
                        params,
                        previousDecision.newPayload || previousDecision.previousPayload,
                        this.AgentTypeState
                    );

                    if (fallbackStep) {
                        // Agent type provided custom handling (e.g., Flow agents terminate)

                        // If agent type wants to terminate, create a step to log this decision for observability
                        if (fallbackStep.terminate) {
                            const terminationMessage = `Agent completed successfully. Agent type '${config.agentType.Name}' terminated execution.`;

                            // Create termination step
                            const stepEntity = await this.createStepEntity({
                                stepType: 'Decision',
                                stepName: terminationMessage,
                                contextUser: params.contextUser,
                                payloadAtStart: fallbackStep.previousPayload,
                                payloadAtEnd: fallbackStep.newPayload
                            });

                            // Finalize immediately as completed
                            await this.finalizeStepEntity(stepEntity, true, undefined, {
                                reason: 'Agent type intervention - Success',
                                agentType: config.agentType.Name,
                                decision: 'Success'
                            });
                        }

                        return fallbackStep;
                    } else {
                        // Agent type wants default behavior (e.g., Loop agents process with prompt)
                        return await this.executePromptStep(params, config, previousDecision, stepCount);
                    }
                }
            case 'Failed':
                if (previousDecision.terminate) {
                    return {
                        terminate: true,
                        step: 'Failed',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload
                    };
                }
                else {
                    // Ask agent type how to handle this Failed step
                    const fallbackStep = await this.AgentTypeInstance.HandleStepFallback(
                        previousDecision,
                        config,
                        params,
                        previousDecision.newPayload || previousDecision.previousPayload,
                        this.AgentTypeState
                    );

                    if (fallbackStep) {
                        // Agent type provided custom handling (e.g., Flow agents terminate)

                        // If agent type wants to terminate, create a step to log this decision for observability
                        if (fallbackStep.terminate) {
                            const errorDetails = fallbackStep.errorMessage || 'No error details provided';
                            const terminationMessage = `Agent failed. Agent type '${config.agentType.Name}' terminated execution: ${errorDetails}`;

                            // Create termination step
                            const stepEntity = await this.createStepEntity({
                                stepType: 'Decision',
                                stepName: terminationMessage,
                                contextUser: params.contextUser,
                                payloadAtStart: fallbackStep.previousPayload,
                                payloadAtEnd: fallbackStep.newPayload
                            });

                            // Finalize as failed with error details
                            await this.finalizeStepEntity(stepEntity, false, errorDetails, {
                                reason: 'Agent type intervention - Failed',
                                agentType: config.agentType.Name,
                                decision: 'Failed'
                            });

                            // Also update the agent run's error message for top-level visibility
                            if (this.AgentRun) {
                                this.AgentRun.ErrorMessage = terminationMessage;
                                await this.AgentRun.Save();
                            }

                            this.logError(`Agent type '${config.agentType.Name}' handling Failed step with termination`, {
                                agent: params.agent,
                                category: 'AgentExecution',
                                metadata: {
                                    errorDetails,
                                    agentType: config.agentType.Name
                                }
                            });
                        }

                        return fallbackStep;
                    } else {
                        // Agent type wants default behavior (e.g., Loop agents retry with prompt)
                        return await this.executePromptStep(params, config, previousDecision, stepCount);
                    }
                }
            case 'ForEach':
                return await this.executeForEachLoop(params, config, previousDecision);
            case 'While':
                return await this.executeWhileLoop(params, config, previousDecision);
            default:
                throw new Error(`Unsupported next step: ${previousDecision.step}`);
        }
    }

    /**
     * Returns the default payload self write paths for the agent. If not specified, it will return undefined
     
     */
    private getDefaultPayloadSelfWritePaths(): string[] | undefined {
        return undefined;
    }

    /**
     * Executes a prompt step and tracks it.
     * 
     * @private
     */
    private async executePromptStep<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision?: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        // Ask the agent type if it has a custom prompt for this step
        const promptToUse = await this.AgentTypeInstance.GetPromptForStep(params, config, previousDecision?.newPayload || previousDecision?.previousPayload, this.AgentTypeState, previousDecision);
        const promptId = promptToUse?.ID;
        const promptName = promptToUse?.Name;
        
        // Prepare input data for the step (includes scratchpad snapshot before LLM response)
        const scratchpadSnapshotBeforeStep = this._scratchpadManager.HasContent() ? this._scratchpadManager.ToJSON() : undefined;
        const inputData = {
            promptId: promptId,
            promptName: promptName,
            isRetry: !!previousDecision,
            retryContext: previousDecision ? {
                reason: previousDecision.retryReason,
                instructions: previousDecision.retryInstructions
            } : undefined,
            conversationMessages: params.conversationMessages,
            ...(scratchpadSnapshotBeforeStep && { scratchpad: scratchpadSnapshotBeforeStep }),
        };
        
        // Prepare prompt parameters
        const payload = previousDecision?.newPayload || params.payload;
        const stepEntity = await this.createStepEntity({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', contextUser: params.contextUser, targetId: promptId, inputData, payloadAtStart: payload });
        
        try {
            // Report prompt execution progress with context
            const isRetry = !!previousDecision;
            const promptMessage = isRetry
                ? `Running ${params.agent.Name} with context from ${previousDecision.retryReason || 'previous actions'}`
                : `Running ${params.agent.Name}'s initial prompt...`;

            const hierarchicalStepToEmit = this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts);

            params.onProgress?.({
                step: 'prompt_execution',
                message: this.formatHierarchicalMessage(promptMessage),
                metadata: {
                    promptId: promptId,
                    isRetry,
                    promptName: promptName,
                    stepCount: stepCount + 1,
                    hierarchicalStep: hierarchicalStepToEmit
                },
                displayMode: 'live' // Only show in live mode
            });
            
            // PayloadAtStart was already serialized from this same `payload` by createStepEntity
            // above (payloadAtStart: payload) — no need to re-serialize the (potentially large) payload here.

            let downstreamPayload = payload; // Start with current payload
            if (params.agent.PayloadSelfReadPaths) {
                const downstreamPaths = JSON.parse(params.agent.PayloadSelfReadPaths);
                // Extract only allowed downstream payload
                downstreamPayload = this._payloadManager.extractDownstreamPayload(
                    `Self: ${params.agent.Name}`,
                    payload, // our inbound payload before prompt
                    downstreamPaths
                );
            }
            // now prep the params using the downstream payload - which is often the full
            // payload but the above allows us to narrow the scope of what we send back to the
            // main prompt if desired in some prompting cases.
            
            // If we have a custom prompt that differs from the default, create a modified config
            const promptConfig = (promptToUse && promptToUse !== config.childPrompt) ? {
                ...config,
                childPrompt: promptToUse,
                systemPrompt: null // Custom prompts may not use system prompts
            } : config;
            
            // Increment prompt iterations counter as we prepare as we are ATTEMPTING a prompt
            // so we want to track this
            if (this._agentRun) {
                this._agentRun.TotalPromptIterations = (this._agentRun.TotalPromptIterations || 0) + 1;
                // don't need to save here, the run will be saved later
            }

            const promptParams = await this.preparePromptParams(promptConfig, downstreamPayload, params);
            
            // Pass cancellation token and streaming callbacks to prompt execution
            promptParams.cancellationToken = params.cancellationToken;
            promptParams.onStreaming = params.onStreaming ? (chunk) => {
                // For streaming, we need to wrap it differently since chunk doesn't have metadata
                // The server resolver should get the agent run from the closure
                params.onStreaming!({
                    ...chunk,
                    stepType: 'prompt',
                    stepEntityId: stepEntity.ID
                });
            } : undefined;
            
            promptParams.onPromptRunCreated = async (promptRunId: string) => {
                stepEntity.TargetLogID = promptRunId;
                // Re-apply post-INSERT: onPromptRunCreated can fire before the step's INSERT lands, and the
                // INSERT's reload would otherwise revert TargetLogID back to null.
                this.queueStepSave(stepEntity, (s) => { s.TargetLogID = promptRunId; });
            };
            
            // Execute the prompt
            const promptResult = await this.executePrompt(promptParams);

            // Increment prompt-specific turn counter (used for expiration age calculations)
            this._promptTurnCount++;

            // Loop and sub-agent results now use the standard expiration/compaction lifecycle
            // (messageType: 'loop-result' / 'sub-agent-result') instead of being deleted after
            // one prompt turn. The processMessageExpiration() method handles their lifecycle.

            // Update step entity with AIPromptRun ID if available
            if (promptResult.promptRun?.ID) {
                stepEntity.TargetLogID = promptResult.promptRun.ID;
                stepEntity.PromptRun = promptResult.promptRun; // transient related object (not a persisted field)
                // don't save here, we save when we call finalizeStepEntity()
            }

            // Check if prompt execution failed
            if (!promptResult.success) {
                // CRITICAL FIX: Preserve payload before finalizing step
                // This matches the success path behavior where PayloadAtEnd is set before finalizeStepEntity
                if (stepEntity && payload) {
                    stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
                }

                await this.finalizeStepEntity(stepEntity, false, promptResult.errorMessage);

                // Check if this is a fatal error that shouldn't be retried
                const isFatal = this.isFatalPromptError(promptResult);

                // Check if this is a context length overflow that we can recover from
                const isContextOverflow = isFatal &&
                    promptResult.chatResult?.errorInfo?.errorType === 'ContextLengthExceeded';

                if (isContextOverflow && this._contextRecoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
                    // Attempt context recovery with multiple strategies
                    this._contextRecoveryAttempts++;

                    this.logStatus(
                        `⚠️ Context length exceeded - attempting recovery by trimming conversation`,
                        true,
                        params
                    );

                    return await this.attemptContextRecovery(params, payload, promptResult.errorMessage || 'Context length exceeded', promptResult.modelSelectionInfo);
                }

                this.logStatus(
                    `❌ Prompt execution failed: ${promptResult.errorMessage} (fatal: ${isFatal})`,
                    true,
                    params
                );

                return {
                    errorMessage: promptResult.errorMessage || 'Prompt execution failed',
                    step: 'Failed' as const,
                    terminate: isFatal, // Terminate for fatal errors, allow retry for transient errors
                    previousPayload: payload,
                    newPayload: payload
                };
            }

            // Check for cancellation after prompt execution
            if (params.cancellationToken?.aborted) {
                // CRITICAL FIX: Preserve payload before finalizing step
                if (stepEntity && payload) {
                    stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
                }

                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during prompt execution');
                const cancelledResult = await this.createCancelledResult('Cancelled during prompt execution', params.contextUser);
                return {
                    ...cancelledResult,
                    terminate: true,
                    step: 'Failed', // Cancelled is treated as failed
                    previousPayload: cancelledResult.payload,
                    newPayload: cancelledResult.payload // No changes, just return the same payload
                }
            }

            // Report decision processing progress
            params.onProgress?.({
                step: 'decision_processing',
                message: this.formatHierarchicalMessage('Analyzing response and determining next steps'),
                metadata: {
                    stepCount: stepCount + 1,
                    hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
                },
                displayMode: 'both' // Show in both live and historical modes
            });
            
            // Determine next step using agent type, this doesn't validate, just gets the LLM response and then we can process payload changes
            const initialNextStep = await this.determineNextStep<P>(params, config.agentType, promptResult, payload);
            
            // Apply payload changes if provided
            let finalPayload = payload; // Start with current payload
            let currentStepPayloadChangeResult = undefined;
            if (initialNextStep.payloadChangeRequest) {
                // Parse the allowed paths if configured
                const allowedPaths = params.agent.PayloadSelfWritePaths 
                    ? JSON.parse(params.agent.PayloadSelfWritePaths) 
                    : this.getDefaultPayloadSelfWritePaths();

                // Apply the changes to the payload with operation control
                const changeResult = this._payloadManager.applyAgentChangeRequest(
                    payload,
                    initialNextStep.payloadChangeRequest,
                    {
                        validateChanges: true,
                        logChanges: true,
                        agentName: params.agent.Name,
                        analyzeChanges: true,
                        generateDiff: true,
                        allowedPaths: allowedPaths,
                        verbose: params.verbose === true || IsVerboseLoggingEnabled()
                    }
                );
                
                if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                    LogStatus(`Payload warnings: ${changeResult.warnings.join('; ')}`);
                }
                
                // Store payload change metadata for audit trail
                // This will be merged into outputData later
                currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(changeResult);

                // Set the final payload - the changeResult already respects the allowed paths
                finalPayload = changeResult.result;
            }

            // Apply scratchpad changes if provided (zero turn cost — processed inline)
            if (initialNextStep.scratchpad) {
                this._scratchpadManager.ApplyScratchpadChanges(initialNextStep.scratchpad);
                // Enforce task limit using the default (50) — the prompt params were already
                // used during prompt preparation. We use a simple default here to avoid
                // re-fetching prompt params just for this value.
                const maxTasks = 50;
                const pruned = this._scratchpadManager.EnforceTaskLimit(maxTasks);
                if (pruned > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                    LogStatus(`Scratchpad: pruned ${pruned} completed tasks (limit: ${maxTasks})`);
                }
            }

            // Execute artifact tool calls if provided (zero turn cost — processed inline)
            const artifactToolCalls = initialNextStep.artifactToolCalls as ArtifactToolCall[] | undefined;
            const artifactToolsExecutedThisTurn = !!(artifactToolCalls?.length);
            if (artifactToolsExecutedThisTurn) {
                this.logStatus(`[ArtifactTools] LLM requested ${artifactToolCalls!.length} tool call(s): ${artifactToolCalls!.map(c => `${c.artifactId}.${c.tool}`).join(', ')}`, true, params);
                // Per-call observability: wrap each invocation in its own AIAgentRunStep
                // (StepType='Tool') so the run tree shows the calls + their inputs/outputs
                // at full fidelity instead of a summary buried inside the parent Prompt
                // step's OutputData. Step naming convention is "Artifact Tool: {tool}".
                // The result is also surfaced to the agent on the NEXT turn via a
                // one-shot ChatMessage push (see injectArtifactToolResultsMessage below),
                // mirroring the action-result inject-once-then-expire pattern instead of
                // the previous re-render-every-turn `_ARTIFACT_TOOL_RESULTS` template var.
                const toolResults = await this.executeArtifactToolCallsAsSteps(
                    artifactToolCalls!,
                    params,
                );
                this.injectArtifactToolResultsMessage(params, toolResults);
            } else if (this._artifactToolManager.HasArtifacts()) {
                this.logStatus(`[ArtifactTools] LLM did not use artifact tools this turn (artifacts available but not accessed)`, true, params);
            }

            // Execute in-flight memory writes if provided (zero turn cost — processed inline)
            const memoryWrites = initialNextStep.memoryWrites as MemoryWriteRequest[] | undefined;
            if (memoryWrites?.length) {
                await this.processMemoryWritesForTurn(memoryWrites, params);
            }

            // Execute a tool pipeline if provided (zero turn cost — processed inline). Each step's
            // output is threaded into the next server-side; only the final step's output returns to
            // the LLM, so intermediate payloads never enter the context window.
            if (initialNextStep.pipeline?.steps?.length) {
                this.logStatus(`[Pipeline] LLM requested a ${initialNextStep.pipeline.steps.length}-stage pipeline: ${(initialNextStep.pipeline.steps as PipelineStage[]).map(s => (s.tool as string) ?? Object.keys(s)[0]).join(' | ')}`, true, params);
                const pipelineResult = await this.executePipelineAsStep(initialNextStep.pipeline, params);
                this.injectPipelineResultMessage(params, pipelineResult);
            }

            // now that we have processed the payload, we can process the next step which does validation and changes the next step if
            // validation fails
            const updatedNextStep = await this.processNextStep<P>(initialNextStep, params, config.agentType!, promptResult, finalPayload, stepEntity);

            // sub-classes may have modified the payload, and we allow that, and so we need to update finalPayload to map to the updatedNextStep.newPayload
            finalPayload = updatedNextStep.newPayload || finalPayload;

            // Prepare output data, these are simple elements of the state that are not typically
            // included in payload but are helpful. We do not include the prompt result here
            // or the payload as those are stored already(prompt result via TargetLogID -> MJAIPromptRunEntityExtended)
            // and payload via the specialied PayloadAtStart/End fields on the step entity.
            const outputData = {
                nextStep: {
                    ...updatedNextStep,
                    reasoning: this.getNextStepReasoning(updatedNextStep),
                },
                // Include payload change metadata if changes were made
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                }),
                // Include scratchpad snapshot after changes for audit/training data
                ...(this._scratchpadManager.HasContent() && {
                    scratchpad: this._scratchpadManager.ToJSON()
                }),
                // Include artifact tools snapshot for audit/training data
                ...(this._artifactToolManager.HasArtifacts() && {
                    artifactTools: this._artifactToolManager.ToJSON()
                }),
                // Include memory attribution for observability
                // This tracks which notes/examples were injected and influenced this step
                ...(this._injectedMemory && (this._injectedMemory.notes.length > 0 || this._injectedMemory.examples.length > 0) && {
                    memoryAttribution: {
                        injectedNoteIds: this._injectedMemory.notes.map(n => n.ID),
                        injectedNotes: this._injectedMemory.notes.map(n => ({
                            id: n.ID,
                            type: n.Type,
                            content: n.Note?.substring(0, 100), // Preview only
                            scope: this.determineNoteScope(n)
                        })),
                        injectedExampleIds: this._injectedMemory.examples.map(e => e.ID),
                        noteCount: this._injectedMemory.notes.length,
                        exampleCount: this._injectedMemory.examples.length
                    }
                })
            };
            
            // Set PayloadAtEnd with the final payload after changes
            if (stepEntity && finalPayload) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(finalPayload);
            }
            
            // Update the agent run's current payload
            if (this._agentRun && finalPayload) {
                this._agentRun.FinalPayloadObject = finalPayload;
            }
            
            // Update nextStep to include the final payload
            updatedNextStep.newPayload = finalPayload;
            updatedNextStep.previousPayload = payload;
            
            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, promptResult.success, 
                promptResult.success ? undefined : promptResult.errorMessage, outputData);
            
            // Return based on next step
            if (updatedNextStep.step === 'Chat') {
                // If artifact tools were called THIS turn, don't terminate yet — the LLM
                // needs one more turn to see the results and incorporate them into its response.
                // Without this, the tool results are wasted because the run exits before
                // the LLM ever sees them.
                if (artifactToolsExecutedThisTurn && this._artifactToolManager.HasArtifacts()) {
                    this.logStatus(`[ArtifactTools] Chat step included tool calls — forcing one more turn so LLM can use results`, true, params);
                    return { ...updatedNextStep, terminate: false, step: 'Retry' as BaseAgentNextStep<P>['step'] };
                }

                // For root agents, create a persistent AIAgentRequest so the request is
                // tracked in the dashboard and can be responded to outside a conversation.
                // This is done here because Chat decisions from executePromptStep terminate
                // immediately and never reach executeChatStep in the main loop.
                if (this._depth === 0) {
                    await this.createFeedbackRequest(params, stepEntity, updatedNextStep);
                }
                return { ...updatedNextStep, terminate: true };
            }
            else if (updatedNextStep.step === 'Success' || updatedNextStep.step === 'Failed') {
                return { ...updatedNextStep, terminate: true };
            } else if (updatedNextStep.step === 'ClientTools' as string) {
                // ClientTools must return terminate: false so the main loop continues
                // to the next iteration where executeClientToolsStep actually dispatches
                // and awaits the tool. The LLM's original terminate intent is preserved in
                // terminateAfterExecution so executeClientToolsStep can honor it post-execution.
                return {
                    ...updatedNextStep,
                    terminate: false,
                    terminateAfterExecution: updatedNextStep.terminate
                };
            } else {
                return { ...updatedNextStep, terminate: false };
            }
            
        } catch (error) {
            // in this case, we have a failed prompt execution. In this situation, let's make sure our payload at end isn't adjusted as
            // that affects downstream things in the agent run
            // Preserve payload on error
            const payload = stepEntity.PayloadAtEnd
                ? JSON.parse(stepEntity.PayloadAtEnd)
                : (previousDecision?.newPayload || params.payload);

            stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead return a helpful message in our return value that the parent loop can review and adjust
            const errString = error?.message || error || 'Unknown error';

            // Classify error type - configuration errors are fatal and should not be retried
            const configCheck = this.isConfigurationError(errString, config);
            const isConfigurationError = configCheck.isConfigError;
            const detailedErrorMessage = configCheck.detailedMessage;

            // Check guardrails to see if we've exceeded limits
            const guardailCheck = await this.hasExceededAgentRunGuardrails(params, this.AgentRun);
            const guardrailsExceeded = guardailCheck && guardailCheck.exceeded;

            // Determine if we should terminate
            // Terminate if: configuration error OR guardrails exceeded
            const shouldTerminate = isConfigurationError || guardrailsExceeded;

            // Build the error message for the step entity and return value
            let finalErrorMessage: string;
            if (isConfigurationError) {
                finalErrorMessage = detailedErrorMessage;
                this.logError(`❌ Configuration error in prompt execution (will terminate):\n${detailedErrorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration',
                    metadata: {
                        error: CopyScalarsAndArrays(error, true)
                    }
                });
            } else if (guardrailsExceeded) {
                finalErrorMessage = `Guardrails exceeded: ${guardailCheck.reason}\n\nOriginal error: ${errString}`;
                this.logError(`⛔ Guardrails exceeded during prompt execution: ${guardailCheck.reason}`, {
                    agent: params.agent,
                    category: 'Guardrails',
                    metadata: {
                        guardrailType: guardailCheck.type,
                        limit: guardailCheck.limit,
                        current: guardailCheck.current,
                        originalError: errString
                    }
                });
            } else {
                finalErrorMessage = `Prompt execution failed: ${errString}`;
                this.logError(`⚠️ Prompt execution error (will retry if guardrails allow): ${errString}`, {
                    agent: params.agent,
                    category: 'PromptExecution',
                    metadata: {
                        attemptNumber: this._agentRun?.TotalPromptIterations || 0,
                        retryable: true,
                        error: CopyScalarsAndArrays(error, true)
                    }
                });
            }

            // Finalize the step entity with the appropriate error message
            await this.finalizeStepEntity(stepEntity, false, finalErrorMessage);

            const errorNextStep = {
                errorMessage: finalErrorMessage,
                step: 'Failed' as const,
                terminate: shouldTerminate,
                previousPayload: payload,
                newPayload: payload
            };

            return errorNextStep;
        }
    }

    /**
     * Computes the upstream and downstream paths for a sub-agent based on the agent's payload paths.
     * @param params 
     * @param subAgentEntity 
     * @param subAgentRequest 
     * @returns 
     */
    private computeUpstreamDownstreamPaths<SC = any>(        
        params: ExecuteAgentParams, 
        subAgentEntity: MJAIAgentEntityExtended, 
        subAgentRequest: AgentSubAgentRequest<SC>
    ): { downstreamPaths: string[], upstreamPaths: string[] } {
        let downstreamPaths: string[] = ['*'];
        let upstreamPaths: string[] = ['*'];
        
        try {
            // Note: TypeScript errors on PayloadDownstreamPaths/PayloadUpstreamPaths are expected
            // until CodeGen runs after the migration to add these fields to MJAIAgentEntity
            if (subAgentEntity.PayloadDownstreamPaths) {
                downstreamPaths = JSON.parse(subAgentEntity.PayloadDownstreamPaths);
            }
            if (subAgentEntity.PayloadUpstreamPaths) {
                upstreamPaths = JSON.parse(subAgentEntity.PayloadUpstreamPaths);
            }
        } catch (parseError) {
            this.logError(`Failed to parse payload paths for sub-agent ${subAgentRequest.name}: ${parseError.message}`, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
                    subAgentName: subAgentRequest.name,
                    subAgentId: subAgentEntity.ID,
                    downstreamPaths: subAgentEntity.PayloadDownstreamPaths,
                    upstreamPaths: subAgentEntity.PayloadUpstreamPaths
                }
            });
        }

        return { downstreamPaths, upstreamPaths };
    }

    /**
     * Computes the payload for a child sub-agent based on the agent's payload paths.
     * @param params 
     * @param subAgentEntity 
     * @param downstreamPaths 
     * @param subAgentRequest 
     * @param previousDecision 
     * @returns 
     */
    private async computeChildSubAgentPayload<SC = any, SR = any>(
        params: ExecuteAgentParams, 
        subAgentEntity: MJAIAgentEntityExtended,
        downstreamPaths: string[],        
        subAgentRequest: AgentSubAgentRequest<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>
    ): Promise<any> {
        // Extract only allowed downstream payload
        let downstreamPayload = this._payloadManager.extractDownstreamPayload(
            subAgentRequest.name,
            previousDecision.newPayload,
            downstreamPaths
        );
        
        // Apply payload scope if defined
        let scopedPayload = downstreamPayload;
        if (subAgentEntity.PayloadScope) {
            scopedPayload = this._payloadManager.applyPayloadScope(downstreamPayload, subAgentEntity.PayloadScope) as Partial<SR>;
            if (scopedPayload === null) {
                // Critical failure - scope path doesn't exist in payload
                const errorMessage = `Critical: Failed to extract payload scope '${subAgentEntity.PayloadScope}' for sub-agent '${subAgentRequest.name}'. The specified path does not exist in the payload.`;
                this.logError(errorMessage, {
                    category: 'SubAgentExecution',
                    metadata: {
                        agentName: params.agent.Name,
                        subAgentName: subAgentRequest.name,
                        payloadScope: subAgentEntity.PayloadScope,
                        availableKeys: Object.keys(downstreamPayload || {})
                    }
                });
                throw new Error(errorMessage);
            }
        }
        return scopedPayload
    }


    /**
     * Executes a child sub-agent step (ParentID relationship) and tracks it.
     * Child agents use direct payload inheritance with downstream/upstream paths.
     *
     * @private
     * @param parentStepId - Optional ID of parent step (e.g., ForEach/While loop step) for proper UI hierarchy
     * @param subAgentPayloadOverride - Optional payload override for sub-agent execution, if provided the normal payload computation is skipped
     */
    private async executeChildSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: any,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision.subAgent as AgentSubAgentRequest<SC>;
        // Check for cancellation before starting
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before sub-agent execution');
        }

        // Report sub-agent execution progress with descriptive context
        params.onProgress?.({
            step: 'subagent_execution',
            message: this.formatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message,
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            }
        });
        
        // Add assistant message indicating we're executing a sub-agent
        // Recorded as a `user`-role environment annotation (not an `assistant` turn) for the same
        // reason as the action record above: the model's real output is the JSON envelope, and
        // storing framework prose as an `assistant` turn trains strong in-context models to imitate
        // the prose and drift off the required JSON format. See the note at the action-record push.
        params.conversationMessages.push({
            role: 'user',
            content: `[You delegated this task to the "${subAgentRequest.name}" agent. Reason: ${subAgentRequest.message}]`
        });
        
        
        // Prepare input data for the step
        const inputData = {
            agentName: params.agent.Name,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._agentHierarchy
        };
        
        // Get sub-agent entity to access payload paths
        const subAgentEntity = AIEngine.Instance.Agents.find(a => a.Name === subAgentRequest.name &&
                                                            UUIDsEqual(a.ParentID, params.agent.ID));
        if (!subAgentEntity) {
            throw new Error(`Sub-agent '${subAgentRequest.name}' not found`);
        }
        const stepEntity = await this.createStepEntity({ stepType: 'Sub-Agent', stepName: `Execute Sub-Agent: ${subAgentRequest.name}`, contextUser: params.contextUser, targetId: subAgentEntity.ID, inputData, payloadAtStart: previousDecision.newPayload, parentId: parentStepId });
        
        // Increment execution count for this sub-agent
        this.incrementExecutionCount(subAgentEntity.ID);
        
        try {
            // Parse payload access paths
            const { downstreamPaths, upstreamPaths } = this.computeUpstreamDownstreamPaths(params, subAgentEntity, subAgentRequest);
            let scopedPayload = null;
            if (!subAgentPayloadOverride) {
                scopedPayload = await this.computeChildSubAgentPayload<SC, SR>(params, subAgentEntity, downstreamPaths, subAgentRequest, previousDecision);
            }
            else {
                scopedPayload = subAgentPayloadOverride; // we received a payload override, use it
            }

            stepEntity.PayloadAtStart = this.serializePayloadAtStart(previousDecision.newPayload);

            // Execute sub-agent with scoped payload
            // Child sub-agents don't use context messages (they inherit payload directly)
            const subAgentResult = await this.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                scopedPayload as SR,
                undefined, // No context message for child sub-agents
                stepCount
            );
            
            let mergedPayload = previousDecision.newPayload; // Start with the original payload
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;
            if (subAgentResult.success) {
                // Handle scope transformation for the result
                let resultPayloadForMerge = subAgentResult.payload;
                if (subAgentEntity.PayloadScope) {
                    // The sub-agent returned a scoped payload, we need to wrap it back
                    resultPayloadForMerge = this._payloadManager.reversePayloadScope(
                        subAgentResult.payload,
                        subAgentEntity.PayloadScope
                    );
                }
                
                // Merge upstream changes back into parent payload
                const mergeResult = this._payloadManager.mergeUpstreamPayload(
                    subAgentRequest.name,
                    previousDecision.newPayload,
                    resultPayloadForMerge,
                    upstreamPaths,
                    params.verbose === true || IsVerboseLoggingEnabled()
                );
                
                // update the merged payload with the result
                mergedPayload = mergeResult.result;                
                
                // Track the merge operation to detect what changed
                // We create a synthetic change request that represents the merge
                const mergeChangeRequest: AgentPayloadChangeRequest<any> = {
                    newElements: {},
                    updateElements: {},
                    removeElements: {}
                };
                
                // Identify what changed in the merge by comparing original and merged payloads
                const originalKeys = Object.keys(previousDecision.newPayload || {});
                const mergedKeys = Object.keys(mergedPayload || {});
                
                // Find updates and additions
                for (const key of mergedKeys) {
                    if (!(key in (previousDecision.newPayload || {}))) {
                        mergeChangeRequest.newElements![key] = mergedPayload[key];
                    } else if (!_.isEqual(previousDecision.newPayload[key], mergedPayload[key])) {
                        mergeChangeRequest.updateElements![key] = mergedPayload[key];
                    }
                }
                
                // Find removals
                for (const key of originalKeys) {
                    if (!(key in (mergedPayload || {}))) {
                        mergeChangeRequest.removeElements![key] = '_DELETE_';
                    }
                }
                
                // Analyze the merge if there were any changes
                if (Object.keys(mergeChangeRequest.newElements!).length > 0 || 
                    Object.keys(mergeChangeRequest.updateElements!).length > 0 || 
                    Object.keys(mergeChangeRequest.removeElements!).length > 0) {
                    
                    const mergeAnalysis = this._payloadManager.applyAgentChangeRequest<SR>(
                        previousDecision.previousPayload,
                        mergeChangeRequest as AgentPayloadChangeRequest<SR>,
                        {
                            validateChanges: false,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (upstream merge)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );
                    
                    // Store merge analysis with upstream violations
                    currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(mergeAnalysis);
                    
                    // Add upstream merge violations if any occurred
                    if (mergeResult.blockedOperations && mergeResult.blockedOperations.length > 0) {
                        if (!currentStepPayloadChangeResult.payloadValidation) {
                            currentStepPayloadChangeResult.payloadValidation = {};
                        }
                        currentStepPayloadChangeResult.payloadValidation.upstreamMergeViolations = {
                            subAgentName: subAgentRequest.name,
                            attemptedOperations: mergeResult.blockedOperations,
                            authorizedPaths: upstreamPaths,
                            timestamp: new Date().toISOString()
                        };
                    }
                    
                    if (mergeAnalysis.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Sub-agent merge warnings: ${mergeAnalysis.warnings.join('; ')}`);
                    }
                }
            }
            else {
                // if we have a failed sub-agent run we do NOT update the payload!!!
                const msg = `Sub-agent '${subAgentRequest.name}' execution failed: ${subAgentResult.agentRun?.ErrorMessage || 'Unknown error'}`;
                LogError(msg);
                // merged payload is already set to the original payload so the rest of the below is okay
                stepEntity.Success = false; // we had a failure
                stepEntity.ErrorMessage = msg;
            }


            // Update step entity with AIAgentRun ID if available
            if (subAgentResult.agentRun?.ID) {
                stepEntity.TargetLogID = subAgentResult.agentRun.ID;
                // Set the SubAgentRun property for hierarchical tracking (transient related object)
                stepEntity.SubAgentRun = subAgentResult.agentRun;
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(mergedPayload);
                // saving happens later by calling finalizeStepEntity()
            }
            
            // Check for cancellation after sub-agent execution
            if (params.cancellationToken?.aborted) {
                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during sub-agent execution');
                throw new Error('Cancelled during sub-agent execution');
            }
            
            // Store sub-agent run for complete tracking
            this._subAgentRuns.push(subAgentResult);

            // Merge sub-agent's media outputs into parent's array.
            // This includes both promoted media and intercepted binary (with refIds) for placeholder resolution.
            if (subAgentResult.mediaOutputs?.length) {
                this._mediaOutputs.push(...subAgentResult.mediaOutputs);
                const refCount = subAgentResult.mediaOutputs.filter(m => m.refId).length;
                if (refCount > 0) {
                    this.logStatus(`📦 Collected ${refCount} media reference(s) from sub-agent '${subAgentRequest.name}'`, true);
                }
            }

            // Merge sub-agent's file outputs into parent's array for unified artifact creation.
            if (subAgentResult.fileOutputs?.length) {
                this._fileOutputs.push(...subAgentResult.fileOutputs);
                this.logStatus(`📄 Collected ${subAgentResult.fileOutputs.length} file output(s) from sub-agent '${subAgentRequest.name}'`, true);
            }

            // Determine if we should terminate after sub-agent
            const shouldTerminate = subAgentRequest.terminateAfter;
            
            // Prepare output data
            const outputData = {
                subAgentResult: {
                    // we have a link to the MJAIAgentRunEntityExtended via the TargetLogID above
                    // but we throw in just a few things here for convenience/summary that are
                    // light - we don't want to store the payload again for example
                    // that is stored in PayloadAtEnd on the step and also in PayloadAtEnd in the sub-agent's run
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                },
                shouldTerminate: shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                // Include payload change metadata if changes were made during merge
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                })
            }; 

            // Finalize step entity
            await this.finalizeStepEntity(stepEntity, subAgentResult.success,
                subAgentResult.agentRun?.ErrorMessage, outputData);

            // Check if sub-agent returned a Chat step
            if (subAgentResult.agentRun?.FinalStep === 'Chat') {
                // Create Chat nextStep but validate it through parent's ChatHandlingOption
                // This allows parent agents to remap Chat -> Success/Failed/Retry if configured
                const chatStep: BaseAgentNextStep<SR, SC> = {
                    step: 'Chat',
                    terminate: true,
                    message: subAgentResult.agentRun?.Message || null,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload, // Preserve sub-agent payload changes
                    responseForm: subAgentResult.responseForm,
                    actionableCommands: subAgentResult.actionableCommands,
                    automaticCommands: subAgentResult.automaticCommands
                };

                // Validate through parent's ChatHandlingOption (if configured)
                // This ensures parent agents can override child Chat steps
                return await this.validateChatNextStep(params, chatStep, mergedPayload, this._agentRun!, stepEntity!);
            }
            
            // Add user message with the sub-agent results using markdown format
            // and expiration metadata so it persists across multiple prompt turns
            const resultMessage = this.formatSubAgentResultAsMarkdown(subAgentRequest.name, subAgentResult);

            const subAgentMetadata: AgentChatMessageMetadata = {
                turnAdded: this._promptTurnCount,
                messageType: 'sub-agent-result',
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentEntity.ID,
                // Default: keep sub-agent results for 3 turns then remove
                expirationTurns: 3,
                expirationMode: 'Remove'
            };

            // Apply global override if configured
            if (params.messageExpirationOverride) {
                const override = params.messageExpirationOverride;
                if (override.expirationTurns != null) {
                    subAgentMetadata.expirationTurns = override.expirationTurns;
                    subAgentMetadata.expirationMode = override.expirationMode || 'Remove';
                    subAgentMetadata.compactMode = override.compactMode;
                    subAgentMetadata.compactLength = override.compactLength;
                    subAgentMetadata.compactPromptId = override.compactPromptId;
                }
            }

            params.conversationMessages.push({
                role: 'user',
                content: resultMessage,
                metadata: subAgentMetadata
            } as AgentChatMessage);

            // Set PayloadAtEnd with the merged payload
            if (stepEntity) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(mergedPayload);
            }

            // Update the agent run's current payload with the merged result
            if (this._agentRun) {
                this._agentRun.FinalPayloadObject = mergedPayload;
            }
            
            return {
                ...subAgentResult,
                step: subAgentResult.success ? 'Success' : 'Failed',
                // Capture error message from sub-agent run for proper error propagation
                errorMessage: subAgentResult.success ? undefined : (subAgentResult.agentRun?.ErrorMessage || 'Sub-agent failed with no error message'),
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload
            };            
        } catch (error) {
            // Preserve payload on error
            const payload = stepEntity.PayloadAtEnd
                ? JSON.parse(stepEntity.PayloadAtEnd)
                : (previousDecision?.newPayload || params.payload);

            stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
            await this.finalizeStepEntity(stepEntity, false, error.message);

            // we had an error, don't throw the exception as that will kill our overall execution/run
            // instead retrun a helpful message in our return value that the parent loop can review and 
            // adjust
            return {
                errorMessage: `Sub-agent execution failed: ${(error as Error).message}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
            };
        }
    }

    /**
     * Routes sub-agent execution to the appropriate handler based on relationship type.
     * Child agents (ParentID) use direct payload coupling.
     * Related agents (AgentRelationships) use message-based coupling with optional output mapping.
     *
     * @private
     * @param parentStepId - Optional ID of parent step (e.g., ForEach/While loop step) for proper UI hierarchy
     * @param subAgentPayloadOverride - Optional payload override for sub-agent execution, if provided the normal payload computation is skipped
     */
    private async processSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: unknown,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        // Multiple sub-agents → parallel fan-out
        if (previousDecision.subAgents && previousDecision.subAgents.length > 0) {
            return await this.executeParallelSubAgents<SC, SR>(
                params,
                previousDecision.subAgents,
                previousDecision,
                parentStepId,
                subAgentPayloadOverride,
                stepCount
            );
        }

        // Single sub-agent path. Use the helper so callers that populated `subAgents`
        // with a single entry (instead of `subAgent`) still resolve correctly.
        const requested = this.getRequestedSubAgents<SR, SC>(previousDecision);
        const subAgentRequest = (requested[0] ?? previousDecision.subAgent) as AgentSubAgentRequest<SC>;
        const name = subAgentRequest?.name;
        if (!name) {
            return {
                step: 'Failed',
                terminate: false,
                errorMessage: 'Sub-agent name is required',
                previousPayload: previousDecision.newPayload,
                newPayload: previousDecision.newPayload
            };
        }

        const resolved = this.resolveSubAgentByName(params, name);
        if (resolved?.relationship) {
            return await this.executeRelatedSubAgentStep<SC, SR>(
                params,
                previousDecision,
                resolved.subAgentEntity,
                resolved.relationship,
                parentStepId,
                subAgentPayloadOverride as SR | undefined,
                stepCount
            );
        }
        if (resolved) {
            return await this.executeChildSubAgentStep<SC, SR>(
                params,
                previousDecision,
                parentStepId,
                subAgentPayloadOverride,
                stepCount
            );
        }

        this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
            agent: params.agent,
            category: 'SubAgentExecution'
        });
        return {
            step: 'Retry',
            terminate: false,
            errorMessage: `Sub-agent '${name}' not found or not active`,
            previousPayload: previousDecision.newPayload,
            newPayload: previousDecision.newPayload
        };
    }

    /**
     * Finds a sub-agent by name, checking child agents (ParentID) first, then
     * related agents (AgentRelationships). Returns `undefined` when the name
     * doesn't resolve to an active agent reachable from `params.agent`.
     *
     * Used by both the single and parallel sub-agent dispatch paths so name
     * resolution is consistent and there's one place to fix lookup bugs.
     *
     * Exposed as `protected` so driver sub-classes with custom routing logic
     * still resolve names through the same case-insensitive child-then-related
     * lookup the framework uses internally.
     *
     * @protected
     */
    protected resolveSubAgentByName(
        params: ExecuteAgentParams,
        name: string
    ): { subAgentEntity: MJAIAgentEntityExtended; relationship?: MJAIAgentRelationshipEntity } | undefined {
        const normalized = name.trim().toLowerCase();
        const childAgent = AIEngine.Instance.Agents.find(a =>
            UUIDsEqual(a.ParentID, params.agent.ID) &&
            a.Status === 'Active' &&
            a.Name.trim().toLowerCase() === normalized
        );
        if (childAgent) {
            return { subAgentEntity: childAgent };
        }
        const activeRelationships = AIEngine.Instance.AgentRelationships.filter(ar =>
            UUIDsEqual(ar.AgentID, params.agent.ID) && ar.Status === 'Active'
        );
        for (const rel of activeRelationships) {
            const relatedAgent = AIEngine.Instance.Agents.find(a =>
                UUIDsEqual(a.ID, rel.SubAgentID) &&
                a.Status === 'Active' &&
                a.Name.trim().toLowerCase() === normalized
            );
            if (relatedAgent) {
                return { subAgentEntity: relatedAgent, relationship: rel };
            }
        }
        return undefined;
    }

    /**
     * Best-effort deep clone for sub-agent payloads. We need this so two parallel
     * sub-agents can each receive their own working copy — without it, mutations
     * by one in-flight sub-agent would race the others' reads.
     *
     * Uses `structuredClone` (Node 17+) where available; falls back to a JSON
     * round-trip for environments without it. Returns the original value on
     * non-cloneable inputs.
     *
     * **JSON fallback caveats** — the round-trip is *not* shape-preserving:
     *   - `Date` → ISO string
     *   - `Map`, `Set`, `RegExp`, typed arrays → `{}`
     *   - `undefined` values and function-valued properties → dropped
     *   - `BigInt` → throws (caught by the outer try/catch, returns original)
     *   - circular refs → throws (returns original)
     * If payloads ever carry those shapes, behavior diverges between the
     * structuredClone path (Node 17+) and the JSON path. Keep sub-agent
     * payloads to plain JSON-safe shapes to avoid this skew.
     *
     * Exposed as `protected` so driver sub-classes performing their own parallel
     * dispatch get the same payload-isolation guarantee.
     *
     * @protected
     */
    protected cloneSubAgentPayload<T>(payload: T): T {
        if (payload === null || payload === undefined) return payload;
        if (typeof payload !== 'object') return payload;
        try {
            if (typeof globalThis.structuredClone === 'function') {
                return globalThis.structuredClone(payload);
            }
            return JSON.parse(JSON.stringify(payload)) as T;
        } catch {
            return payload;
        }
    }

    /**
     * Pre-flight for one parallel sub-agent: resolve the entity, push the
     * delegation message, emit progress. Runs synchronously (no awaits) so the
     * conversation transcript order matches the `subAgents` array's source order
     * regardless of which dispatch races to the front.
     *
     * Returns `undefined` (and pushes a sentinel message) when the sub-agent
     * can't be resolved — the dispatch loop later records this as a failed
     * execution rather than throwing inside `Promise.all`.
     *
     * @private
     */
    private prepareParallelSubAgentDispatch<SC>(
        params: ExecuteAgentParams<SC>,
        request: AgentSubAgentRequest<SC>,
        stepCount: number
    ): ParallelSubAgentDispatch | undefined {
        const resolved = this.resolveSubAgentByName(params, request.name);
        if (!resolved) {
            this.logError(`Sub-agent '${request.name}' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'SubAgentExecution'
            });
            return undefined;
        }
        const { subAgentEntity, relationship } = resolved;

        params.onProgress?.({
            step: 'subagent_execution',
            message: this.formatHierarchicalMessage(`Delegating to parallel sub-agent ${request.name}`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: request.name,
                reason: request.message,
                relationshipType: relationship ? 'related' : 'child',
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            }
        });
        // `user`-role environment annotation (not an `assistant` turn) — see the note on the
        // single-delegation push above for why framework prose must not be stored as assistant turns.
        params.conversationMessages.push({
            role: 'user',
            content: `[You delegated this task to the parallel sub-agent "${request.name}". Reason: ${request.message}]`
        });

        return { request: request as AgentSubAgentRequest<unknown>, subAgentEntity, relationship };
    }

    /**
     * Computes the per-sub-agent input payload + context message based on whether
     * this is a child (PayloadScope / paths) or related (input/output mapping)
     * sub-agent. The parent payload is deep-cloned for child agents so two
     * parallel sub-agents can't see each other's in-flight mutations.
     *
     * @private
     */
    private async buildSubAgentInputs<SC, SR>(
        params: ExecuteAgentParams<SC>,
        dispatch: ParallelSubAgentDispatch,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentPayloadOverride: unknown
    ): Promise<{ initialPayload: unknown; contextMessage: ChatMessage | null; upstreamPaths: string[] }> {
        const { subAgentEntity, relationship, request } = dispatch;
        const parentPayload = previousDecision.newPayload;

        if (relationship) {
            // Related agent path — input/output mapping handles the structural transform.
            let initialPayload: unknown = subAgentPayloadOverride;
            if (!initialPayload && relationship.SubAgentInputMapping) {
                initialPayload = this.applySubAgentInputMapping(
                    parentPayload as unknown as Record<string, unknown>,
                    relationship.SubAgentInputMapping
                );
            }
            const contextPaths = this.parseSubAgentContextPaths(relationship, request.name);
            const contextMessage = this.prepareRelatedSubAgentContextMessage(
                parentPayload as unknown as Record<string, unknown>,
                contextPaths,
                params
            );
            return { initialPayload, contextMessage, upstreamPaths: [] };
        }

        // Child agent path — scoping + downstream/upstream paths, with deep clone
        // so siblings can't mutate each other's input.
        const { downstreamPaths, upstreamPaths } = this.computeUpstreamDownstreamPaths(params, subAgentEntity, request);
        let initialPayload: unknown = subAgentPayloadOverride;
        if (!initialPayload) {
            initialPayload = await this.computeChildSubAgentPayload(
                params,
                subAgentEntity,
                downstreamPaths,
                request as AgentSubAgentRequest<SC>,
                previousDecision
            );
        }
        return { initialPayload: this.cloneSubAgentPayload(initialPayload), contextMessage: null, upstreamPaths };
    }

    /**
     * Safely parses the `SubAgentContextPaths` JSON field on a relationship.
     * @private
     */
    private parseSubAgentContextPaths(relationship: MJAIAgentRelationshipEntity, subAgentName: string): string[] {
        if (!relationship.SubAgentContextPaths) return [];
        try {
            return JSON.parse(relationship.SubAgentContextPaths);
        } catch (parseError) {
            LogError(`Failed to parse SubAgentContextPaths for sub-agent ${subAgentName}: ${(parseError as Error).message}`);
            return [];
        }
    }

    /**
     * Merges one parallel sub-agent's result back into the running parent payload.
     * Returns the new payload AND the payload that should be persisted on this
     * specific sub-agent's step record (the *delta* applied for this sub-agent,
     * not the cumulative state, so audit logs can distinguish each sibling's
     * contribution).
     *
     * @private
     */
    private mergeParallelSubAgentResult<SR>(
        params: ExecuteAgentParams,
        execution: ParallelSubAgentExecution<SR>,
        runningPayload: SR
    ): { mergedPayload: SR; stepPayloadAtEnd: unknown } {
        if (!execution.result.success) {
            // Failures don't contribute to the merged payload, but we still record
            // the sub-agent's own result on its step for forensic visibility.
            return { mergedPayload: runningPayload, stepPayloadAtEnd: execution.result.payload };
        }

        if (execution.relationship) {
            if (!execution.relationship.SubAgentOutputMapping) {
                return { mergedPayload: runningPayload, stepPayloadAtEnd: execution.result.payload };
            }
            const payloadChange = this.applySubAgentOutputMapping(
                execution.result.payload as unknown as Record<string, unknown>,
                runningPayload as unknown as Record<string, unknown>,
                execution.relationship.SubAgentOutputMapping
            );
            if (!payloadChange || !payloadChange.updateElements) {
                return { mergedPayload: runningPayload, stepPayloadAtEnd: execution.result.payload };
            }
            const mergeResult = this._payloadManager.applyAgentChangeRequest<SR>(
                runningPayload,
                payloadChange as AgentPayloadChangeRequest<SR>,
                {
                    validateChanges: true,
                    logChanges: true,
                    analyzeChanges: true,
                    generateDiff: true,
                    agentName: `${execution.request.name} (related agent mapping)`,
                    verbose: params.verbose === true || IsVerboseLoggingEnabled()
                }
            );
            return { mergedPayload: mergeResult.result, stepPayloadAtEnd: execution.result.payload };
        }

        // Child agent merge — reverse-scope then merge along upstream paths.
        let resultPayloadForMerge = execution.result.payload;
        if (execution.subAgentEntity.PayloadScope) {
            resultPayloadForMerge = this._payloadManager.reversePayloadScope(
                execution.result.payload,
                execution.subAgentEntity.PayloadScope
            );
        }
        const mergeResult = this._payloadManager.mergeUpstreamPayload(
            execution.request.name,
            runningPayload,
            resultPayloadForMerge,
            execution.upstreamPaths,
            params.verbose === true || IsVerboseLoggingEnabled()
        );
        return { mergedPayload: mergeResult.result, stepPayloadAtEnd: resultPayloadForMerge };
    }

    /**
     * Builds the aggregated markdown summary of parallel sub-agent results that
     * gets appended to the parent's conversation as a `user` message — gives the
     * Loop agent a single deterministic record of what fanned out and what came
     * back, regardless of completion order.
     *
     * @private
     */
    private buildParallelSubAgentSummary<SR>(executions: ParallelSubAgentExecution<SR>[]): string {
        return executions
            .map(execution => {
                const statusEmoji = execution.result.success ? '✅' : '❌';
                const baseInfo =
                    `${statusEmoji} **Sub-Agent: ${execution.request.name}**\n` +
                    `* Message: "${execution.request.message}"\n` +
                    `* Status: ${execution.result.agentRun?.FinalStep || 'Failed'}`;
                if (execution.result.agentRun?.ErrorMessage) {
                    return `${baseInfo}\n* Error: ${execution.result.agentRun.ErrorMessage}`;
                }
                return baseInfo;
            })
            .join('\n\n---\n\n');
    }

    /**
     * Executes multiple sub-agents in parallel (with a concurrency cap) and
     * merges their output payloads back into the parent sequentially.
     *
     * Pipeline:
     *  1. **Synchronously** prepare each dispatch (resolve entity, push delegation
     *     message, emit progress) so conversation order is deterministic.
     *  2. Create step entities and run sub-agents with bounded concurrency.
     *  3. Merge each result into the parent payload sequentially in source order.
     *  4. Finalize each step entity with its own contribution recorded.
     *  5. Append an aggregated `user` summary message to the parent conversation.
     *
     * Termination semantics: matches the single sub-agent path — if any
     * dispatched child requested `terminateAfter: true`, the parent terminates
     * regardless of whether that child succeeded. The parent's reported step is
     * `Failed` when any child failed, `Success` when terminating cleanly, and
     * `Retry` otherwise.
     *
     * @private
     */
    /**
     * Worker for one parallel sub-agent dispatch: creates the step entity, builds
     * the (isolated) input payload, and invokes `ExecuteSubAgent`. Returns
     * `undefined` for an empty dispatch slot (unresolved sub-agent name) so the
     * caller can record a synthetic failure in source order.
     *
     * @private
     */
    private async runSingleParallelSubAgent<SC, SR>(
        params: ExecuteAgentParams<SC>,
        dispatch: ParallelSubAgentDispatch | undefined,
        previousDecision: BaseAgentNextStep<SR, SC>,
        currentPayload: SR,
        parentStepId: string | undefined,
        subAgentPayloadOverride: unknown,
        stepCount: number
    ): Promise<ParallelSubAgentExecution<SR> | undefined> {
        if (!dispatch) return undefined;
        const { request, subAgentEntity, relationship } = dispatch;
        const stepEntity = await this.createStepEntity({
            stepType: 'Sub-Agent',
            stepName: `Execute Parallel Sub-Agent: ${request.name}`,
            contextUser: params.contextUser,
            targetId: subAgentEntity.ID,
            inputData: {
                agentName: params.agent.Name,
                subAgentName: request.name,
                message: request.message,
                terminateAfter: request.terminateAfter,
                conversationMessages: params.conversationMessages,
                parentAgentHierarchy: this._agentHierarchy,
                relationshipType: relationship ? 'related' : 'child'
            },
            payloadAtStart: currentPayload,
            parentId: parentStepId
        });
        this.incrementExecutionCount(subAgentEntity.ID);

        const { initialPayload, contextMessage, upstreamPaths } = await this.buildSubAgentInputs(
            params, dispatch, previousDecision, subAgentPayloadOverride
        );
        const result = await this.ExecuteSubAgent(
            params,
            request as AgentSubAgentRequest<SC>,
            subAgentEntity,
            stepEntity,
            initialPayload as SR,
            contextMessage,
            stepCount
        );
        return { request, result, subAgentEntity, relationship, stepEntity, upstreamPaths };
    }

    /**
     * Builds a synthetic execution record for an unresolved sub-agent so we can
     * keep source-order alignment between `subAgentRequests` and `executions`
     * without throwing inside `Promise.all`.
     *
     * @private
     */
    private synthesizeUnresolvedSubAgentExecution<SR>(
        request: AgentSubAgentRequest<unknown>,
        runningPayload: SR
    ): ParallelSubAgentExecution<SR> {
        return {
            request,
            result: {
                success: false,
                payload: runningPayload,
                agentRun: {
                    ErrorMessage: `Sub-agent '${request.name}' not found or not active`,
                    FinalStep: 'Failed'
                } as MJAIAgentRunEntityExtended
            } as ExecuteAgentResult<SR>,
            subAgentEntity: { ID: '', Name: request.name } as MJAIAgentEntityExtended,
            upstreamPaths: []
        };
    }

    /**
     * Sequentially merges each sub-agent's result into the parent payload and
     * finalizes its step entity with its own contribution recorded.
     *
     * @private
     */
    private async mergeParallelExecutionsIntoParent<SC, SR>(
        params: ExecuteAgentParams<SC>,
        subAgentRequests: AgentSubAgentRequest<SC>[],
        executions: Array<ParallelSubAgentExecution<SR> | undefined>,
        startingPayload: SR
    ): Promise<{ mergedPayload: SR; anyFailure: boolean; allExecutions: ParallelSubAgentExecution<SR>[] }> {
        let mergedPayload = startingPayload;
        let anyFailure = false;
        const allExecutions: ParallelSubAgentExecution<SR>[] = [];
        for (let idx = 0; idx < subAgentRequests.length; idx++) {
            const execution = executions[idx];
            if (!execution) {
                anyFailure = true;
                allExecutions.push(this.synthesizeUnresolvedSubAgentExecution(
                    subAgentRequests[idx] as AgentSubAgentRequest<unknown>,
                    mergedPayload
                ));
                continue;
            }
            if (!execution.result.success) anyFailure = true;
            if (execution.result.mediaOutputs?.length) this._mediaOutputs.push(...execution.result.mediaOutputs);
            if (execution.result.fileOutputs?.length) this._fileOutputs.push(...execution.result.fileOutputs);

            const { mergedPayload: newMerged, stepPayloadAtEnd } = this.mergeParallelSubAgentResult(
                params, execution, mergedPayload
            );
            mergedPayload = newMerged;
            allExecutions.push(execution);
            await this.recordParallelStepCompletion(execution, stepPayloadAtEnd);
        }
        return { mergedPayload, anyFailure, allExecutions };
    }

    /**
     * Persists per-sibling step state (`PayloadAtEnd` is THIS sub-agent's
     * contribution, not the cumulative parent state) and finalizes its step
     * entity.
     *
     * @private
     */
    private async recordParallelStepCompletion<SR>(
        execution: ParallelSubAgentExecution<SR>,
        stepPayloadAtEnd: unknown
    ): Promise<void> {
        if (!execution.stepEntity) return;
        execution.stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(stepPayloadAtEnd);
        await this.finalizeStepEntity(
            execution.stepEntity,
            execution.result.success,
            execution.result.agentRun?.ErrorMessage,
            {
                subAgentResult: {
                    success: execution.result.success,
                    finalStep: execution.result.agentRun?.FinalStep,
                    errorMessage: execution.result.agentRun?.ErrorMessage,
                    stepCount: execution.result.agentRun?.Steps?.length || 0,
                },
                shouldTerminate: execution.request.terminateAfter === true,
                nextStep: execution.request.terminateAfter === true ? 'success' : 'retry'
            }
        );
    }

    private async executeParallelSubAgents<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        subAgentRequests: AgentSubAgentRequest<SC>[],
        previousDecision: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: unknown,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const currentPayload = previousDecision.newPayload;

        // Synchronous pre-flight — order-stable transcript + progress events.
        const dispatches = subAgentRequests.map(req =>
            this.prepareParallelSubAgentDispatch(params, req, stepCount)
        );

        // Bounded parallel dispatch.
        const executions = await this.mapWithConcurrency(
            dispatches,
            PARALLEL_SUBAGENT_CONCURRENCY_LIMIT,
            (dispatch) => this.runSingleParallelSubAgent<SC, SR>(
                params, dispatch, previousDecision, currentPayload, parentStepId, subAgentPayloadOverride, stepCount
            )
        );

        // Sequential merge + per-sibling step finalization.
        const { mergedPayload, anyFailure, allExecutions } = await this.mergeParallelExecutionsIntoParent(
            params, subAgentRequests, executions, currentPayload
        );

        // Aggregated summary appended to the parent transcript.
        params.conversationMessages.push({
            role: 'user',
            content: `Parallel Sub-Agents Completed:\n\n${this.buildParallelSubAgentSummary(allExecutions)}`
        });

        // Termination semantics: matches the single sub-agent path —
        // `terminateAfter` triggers parent termination regardless of the child's
        // success/failure. The parent's step reflects whether any child failed:
        // Failed if any did, Success if terminating cleanly, otherwise Retry.
        const shouldTerminateParent = allExecutions.some(e =>
            e.request.terminateAfter === true
        );
        return {
            step: anyFailure ? 'Failed' : (shouldTerminateParent ? 'Success' : 'Retry'),
            terminate: shouldTerminateParent,
            newPayload: mergedPayload,
            previousPayload: previousDecision.newPayload
        };
    }

    /**
     * Executes a related sub-agent step (AgentRelationships) and tracks it.
     * Related agents use message-based communication with independent payloads.
     * Optional output mapping can merge sub-agent results back to parent payload.
     *
     * @private
     * @param parentStepId - Optional ID of parent step (e.g., ForEach/While loop step) for proper UI hierarchy
     */
    private async executeRelatedSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentEntity: MJAIAgentEntityExtended,
        relationship: MJAIAgentRelationshipEntity,
        parentStepId?: string,
        subAgentPayloadOverride?: SR,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision.subAgent as AgentSubAgentRequest<SC>;

        // Check for cancellation before starting
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before related sub-agent execution');
        }

        // Report sub-agent execution progress
        params.onProgress?.({
            step: 'subagent_execution',
            percentage: 60,
            message: this.formatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message,
                relationshipType: 'related',
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            }
        });

        // Add assistant message indicating we're executing a related sub-agent
        // Recorded as a `user`-role environment annotation (not an `assistant` turn) for the same
        // reason as the action record above: the model's real output is the JSON envelope, and
        // storing framework prose as an `assistant` turn trains strong in-context models to imitate
        // the prose and drift off the required JSON format. See the note at the action-record push.
        params.conversationMessages.push({
            role: 'user',
            content: `[You delegated this task to the "${subAgentRequest.name}" agent. Reason: ${subAgentRequest.message}]`
        });

        // Prepare input data for the step
        const inputData = {
            agentName: params.agent.Name,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._agentHierarchy,
            relationshipType: 'related'
        };

        const stepEntity = await this.createStepEntity({
            stepType: 'Sub-Agent',
            stepName: `Execute Related Sub-Agent: ${subAgentRequest.name}`,
            contextUser: params.contextUser,
            targetId: subAgentEntity.ID,
            inputData,
            payloadAtStart: previousDecision.newPayload,
            parentId: parentStepId
        });

        // Increment execution count for this sub-agent
        this.incrementExecutionCount(subAgentEntity.ID);

        try {
            // Related agents can receive parent data in two ways:
            // 1. SubAgentInputMapping: Maps parent payload → sub-agent payload (structural data)
            // 2. SubAgentContextPaths: Parent payload → sub-agent conversation context (LLM awareness)
            stepEntity.PayloadAtStart = this.serializePayloadAtStart(previousDecision.newPayload);

            // Prepare initial payload via input mapping (if configured)
            let initialSubAgentPayload: SR | undefined = subAgentPayloadOverride;
            if (!initialSubAgentPayload && relationship.SubAgentInputMapping) {
                const mapped = this.applySubAgentInputMapping(
                    previousDecision.newPayload as unknown as Record<string, unknown>,
                    relationship.SubAgentInputMapping
                );
                if (mapped && Object.keys(mapped).length > 0) {
                    initialSubAgentPayload = mapped as SR;

                    if (params.verbose === true || IsVerboseLoggingEnabled()) {
                        LogStatus(`Related sub-agent '${subAgentRequest.name}' receiving mapped payload: ${JSON.stringify(Object.keys(mapped))}`);
                    }
                }
            }

            // Prepare context message with parent payload data (if configured)
            let contextPaths: string[] = [];
            if (relationship.SubAgentContextPaths) {
                try {
                    contextPaths = JSON.parse(relationship.SubAgentContextPaths);
                } catch (parseError) {
                    LogError(`Failed to parse SubAgentContextPaths for sub-agent ${subAgentRequest.name}: ${parseError.message}`);
                }
            }

            const contextMessage = this.prepareRelatedSubAgentContextMessage(
                previousDecision.newPayload as unknown as Record<string, unknown>,
                contextPaths,
                params
            );

            if (contextMessage && (params.verbose === true || IsVerboseLoggingEnabled())) {
                LogStatus(`Related sub-agent '${subAgentRequest.name}' receiving context from paths: ${contextPaths.join(', ')}`);
            }

            // Execute related agent with prepared payload and context
            const subAgentResult = await this.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                initialSubAgentPayload, // Mapped payload from parent (or undefined if no mapping)
                contextMessage, // Context message with parent payload data (or undefined if no context paths)
                stepCount
            );

            // Merge sub-agent's media outputs into parent's array.
            // This includes both promoted media and intercepted binary (with refIds) for placeholder resolution.
            if (subAgentResult.mediaOutputs?.length) {
                this._mediaOutputs.push(...subAgentResult.mediaOutputs);
                const refCount = subAgentResult.mediaOutputs.filter(m => m.refId).length;
                if (refCount > 0) {
                    this.logStatus(`📦 Collected ${refCount} media reference(s) from related sub-agent '${subAgentRequest.name}'`, true);
                }
            }

            // Merge sub-agent's file outputs into parent's array for unified artifact creation.
            if (subAgentResult.fileOutputs?.length) {
                this._fileOutputs.push(...subAgentResult.fileOutputs);
                this.logStatus(`📄 Collected ${subAgentResult.fileOutputs.length} file output(s) from related sub-agent '${subAgentRequest.name}'`, true);
            }

            let mergedPayload = previousDecision.newPayload; // Start with parent's payload
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;

            if (subAgentResult.success && relationship.SubAgentOutputMapping) {
                // Apply output mapping if configured
                const payloadChange = this.applySubAgentOutputMapping(
                    subAgentResult.payload as unknown as Record<string, unknown>,
                    previousDecision.newPayload as unknown as Record<string, unknown>,
                    relationship.SubAgentOutputMapping
                );

                if (payloadChange && payloadChange.updateElements) {
                    // Merge the mapped changes into parent payload
                    const mergeResult = this._payloadManager.applyAgentChangeRequest<SR>(
                        previousDecision.newPayload,
                        payloadChange as AgentPayloadChangeRequest<SR>,
                        {
                            validateChanges: true,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (related agent mapping)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );

                    mergedPayload = mergeResult.result;

                    // Track the mapping operation
                    currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(mergeResult);

                    if (mergeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Related sub-agent mapping warnings: ${mergeResult.warnings.join('; ')}`);
                    }
                }
            }

            // Check if we should terminate after this sub-agent
            const shouldTerminate = subAgentRequest.terminateAfter === true;

            // Prepare output data
            const outputData = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                    hasMergedPayload: !!(relationship.SubAgentOutputMapping && mergedPayload !== previousDecision.newPayload)
                },
                shouldTerminate: shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                })
            };

            // Set PayloadAtEnd with the merged payload
            if (stepEntity) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(mergedPayload);
            }

            // Finalize step entity
            await this.finalizeStepEntity(
                stepEntity,
                subAgentResult.success,
                subAgentResult.agentRun?.ErrorMessage,
                outputData
            );

            // Check if sub-agent returned a Chat step
            if (subAgentResult.agentRun?.FinalStep === 'Chat') {
                // Create Chat nextStep but validate it through parent's ChatHandlingOption
                // This allows parent agents to remap Chat -> Success/Failed/Retry if configured
                const chatStep: BaseAgentNextStep<SR, SC> = {
                    step: 'Chat',
                    terminate: true,
                    message: subAgentResult.agentRun?.Message || null,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload, // Preserve sub-agent payload changes
                    responseForm: subAgentResult.responseForm,
                    actionableCommands: subAgentResult.actionableCommands,
                    automaticCommands: subAgentResult.automaticCommands
                };

                // Validate through parent's ChatHandlingOption (if configured)
                // This ensures parent agents can override child Chat steps
                return await this.validateChatNextStep(params, chatStep, mergedPayload, this._agentRun!, stepEntity!);
            }

            // Add sub-agent result to conversation as user message using markdown format
            // and expiration metadata so it persists across multiple prompt turns
            const relatedResultMessage = this.formatSubAgentResultAsMarkdown(subAgentRequest.name, subAgentResult);

            const relatedMetadata: AgentChatMessageMetadata = {
                turnAdded: this._promptTurnCount,
                messageType: 'sub-agent-result',
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentEntity.ID,
                expirationTurns: 3,
                expirationMode: 'Remove'
            };

            if (params.messageExpirationOverride) {
                const override = params.messageExpirationOverride;
                if (override.expirationTurns != null) {
                    relatedMetadata.expirationTurns = override.expirationTurns;
                    relatedMetadata.expirationMode = override.expirationMode || 'Remove';
                    relatedMetadata.compactMode = override.compactMode;
                    relatedMetadata.compactLength = override.compactLength;
                    relatedMetadata.compactPromptId = override.compactPromptId;
                }
            }

            params.conversationMessages.push({
                role: 'user',
                content: relatedResultMessage,
                metadata: relatedMetadata
            } as AgentChatMessage);

            // Update the agent run's current payload
            if (this._agentRun) {
                this._agentRun.FinalPayloadObject = mergedPayload;
            }

            return {
                ...subAgentResult,
                step: subAgentResult.success ? 'Success' : 'Failed',
                // Capture error message from sub-agent run for proper error propagation
                errorMessage: subAgentResult.success ? undefined : (subAgentResult.agentRun?.ErrorMessage || 'Related sub-agent failed with no error message'),
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload
            };
        } catch (error) {
            // Preserve payload on error
            const payload = stepEntity.PayloadAtEnd
                ? JSON.parse(stepEntity.PayloadAtEnd)
                : (previousDecision?.newPayload || params.payload);

            stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
            await this.finalizeStepEntity(stepEntity, false, error.message);

            return {
                errorMessage: `Related sub-agent execution failed: ${(error as Error).message}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
            };
        }
    }

    /**
     * Applies sub-agent output mapping to update the parent payload.
     * Maps sub-agent result payload paths to parent payload paths.
     * Mirrors the action output mapping pattern used by Flow agents.
     *
     * @private
     */
    private applySubAgentOutputMapping<P>(
        subAgentResult: Record<string, unknown>,
        _parentPayload: Record<string, unknown>,
        mappingConfig: string
    ): AgentPayloadChangeRequest<P> | null {
        try {
            const mapping: Record<string, string> = JSON.parse(mappingConfig);
            const updateObj: Record<string, unknown> = {};

            for (const [subAgentPath, parentPath] of Object.entries(mapping)) {
                let value: unknown;

                if (subAgentPath === '*') {
                    // Wildcard - capture entire sub-agent result
                    value = subAgentResult;
                } else {
                    // Extract from sub-agent result using dot notation
                    value = this.getValueFromPath(subAgentResult, subAgentPath);
                }

                if (value !== undefined) {
                    // Parse the parent path and build nested object
                    const pathParts = parentPath.split('.');
                    let current = updateObj;

                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        // Remove [] suffix for intermediate path parts
                        const cleanPart = part.endsWith('[]') ? part.slice(0, -2) : part;
                        if (!(cleanPart in current)) {
                            current[cleanPart] = {};
                        }
                        current = current[cleanPart] as Record<string, unknown>;
                    }

                    // Use helper to support array append on final path part
                    this.setMappedValue(current, pathParts[pathParts.length - 1], value);
                }
            }

            if (Object.keys(updateObj).length === 0) {
                return null;
            }

            return {
                updateElements: updateObj as Partial<P>
            };
        } catch (error) {
            LogError(`Failed to parse SubAgentOutputMapping: ${error.message}`);
            return null;
        }
    }

    /**
     * Sets a value in a target object, supporting array append operations.
     * If the key ends with [], the value is appended to an array instead of replacing.
     *
     * @param target - Target object to modify
     * @param key - Property key, optionally ending with [] for array append
     * @param value - Value to set or append
     * @private
     */
    private setMappedValue(
        target: Record<string, unknown>,
        key: string,
        value: unknown
    ): void {
        const isArrayAppend = key.endsWith('[]');
        const actualKey = isArrayAppend ? key.slice(0, -2) : key;

        if (isArrayAppend) {
            // Array append operation
            if (!(actualKey in target)) {
                target[actualKey] = [];
            }

            if (!Array.isArray(target[actualKey])) {
                throw new Error(
                    `Cannot append to '${actualKey}': target is not an array. ` +
                    `Use '${actualKey}' without [] suffix for property update.`
                );
            }

            (target[actualKey] as unknown[]).push(value);
        } else {
            // Normal property assignment
            target[actualKey] = value;
        }
    }

    /**
     * Applies sub-agent input mapping to prepare initial payload for related sub-agent.
     * Maps parent payload paths to sub-agent initial payload paths.
     * Enables structural data transfer from parent to related sub-agent.
     *
     * @param parentPayload - Parent agent's current payload
     * @param mappingConfig - JSON mapping configuration string
     * @returns Mapped payload object for sub-agent initialization, or null if mapping fails or produces empty result
     * @private
     */
    private applySubAgentInputMapping(
        parentPayload: Record<string, unknown>,
        mappingConfig: string
    ): Record<string, unknown> | null {
        try {
            const mapping: Record<string, string> = JSON.parse(mappingConfig);
            const subAgentPayload: Record<string, unknown> = {};

            for (const [parentPath, subAgentPath] of Object.entries(mapping)) {
                let value: unknown;

                if (parentPath === '*') {
                    // Wildcard - send entire parent payload to sub-agent
                    value = parentPayload;
                } else {
                    // Extract from parent payload using dot notation
                    value = this.getValueFromPath(parentPayload, parentPath);
                }

                if (value !== undefined) {
                    // Parse the sub-agent path and build nested object
                    const pathParts = subAgentPath.split('.');
                    let current = subAgentPayload;

                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        if (!(part in current)) {
                            current[part] = {};
                        }
                        current = current[part] as Record<string, unknown>;
                    }

                    current[pathParts[pathParts.length - 1]] = value;
                }
            }

            if (Object.keys(subAgentPayload).length === 0) {
                return null;
            }

            return subAgentPayload;
        } catch (error) {
            LogError(`Failed to parse SubAgentInputMapping: ${error.message}`);
            return null;
        }
    }

    /**
     * Prepares a context message containing parent payload data for related sub-agent.
     * Extracts specified paths from parent payload or conversation messages and formats
     * them as a user message to provide LLM context to the sub-agent.
     *
     * Supports both payload paths and conversation message paths:
     * - Payload paths: "fieldName", "nested.field", etc.
     * - Conversation paths: "conversation.all", "conversation.user.last", "conversation.all.last[5]", etc.
     *
     * @param parentPayload - Parent agent's current payload
     * @param contextPaths - Array of paths to extract, or ["*"] for entire payload
     * @param params - Execution parameters with conversation messages
     * @returns ChatMessage with formatted context, or null if no paths specified or no data found
     * @private
     */
    private prepareRelatedSubAgentContextMessage(
        parentPayload: Record<string, unknown>,
        contextPaths: string[],
        params?: ExecuteAgentParams
    ): ChatMessage | null {
        if (!contextPaths || contextPaths.length === 0) {
            return null;
        }

        // Check for wildcard - send entire payload
        if (contextPaths.includes('*')) {
            return {
                role: 'user',
                content: `Parent Agent Context:\n\n${JSON.stringify(parentPayload, null, 2)}`
            };
        }

        // Extract specific paths (supports both payload paths and conversation paths)
        const contextData: Record<string, unknown> = {};

        for (const path of contextPaths) {
            let value: unknown;

            // Check if this is a conversation reference
            if (ConversationMessageResolver.isConversationReference(path) && params?.conversationMessages) {
                value = ConversationMessageResolver.resolve(path, params.conversationMessages);
            } else {
                // Regular payload path
                value = this.getValueFromPath(parentPayload, path);
            }

            if (value !== undefined) {
                contextData[path] = value;
            }
        }

        if (Object.keys(contextData).length === 0) {
            return null;
        }

        // Format as readable context
        const contextLines = Object.entries(contextData).map(([key, value]) => {
            const valueStr = typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value);
            return `${key}:\n${valueStr}`;
        });

        return {
            role: 'user',
            content: `Parent Agent Context:\n\n${contextLines.join('\n\n')}`
        };
    }

    /**
     * Helper method to get a value from a nested object path.
     * Supports both dot notation (obj.prop) and array indexing (arr[0]).
     *

    /**
     * Executes actions step and tracks it.
     * 
     * @private
     */
    private async executeActionsStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId: string,
        addConversationMessage: boolean = true,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep> {
        
        try {
            const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
            const actions: AgentAction[] = previousDecision.actions || [];
            // Check for cancellation before starting
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled before action execution');
            }

            // Report action execution progress with markdown formatting for parameters
            // Use same format as assistant message for consistency
            let progressMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
                progressMessage = `Executing **${aa.name}** action`;

                // Add parameters if they exist
                if (aa.params && Object.keys(aa.params).length > 0) {
                    const paramsList = Object.entries(aa.params)
                        .map(([key, value]) => {
                            const displayValue = this.formatParamValueForMessage(value);
                            return `• **${key}**: ${displayValue}`;
                        })
                        .join('\n');
                    progressMessage += ` with parameters:\n${paramsList}`;
                } else {
                    progressMessage += '.';
                }
            } else {
                progressMessage = `Executing **${actions.length} actions** in parallel:\n\n` + actions.map((aa, index) => {
                    let actionText = `${index + 1}. **${aa.name}**`;

                    // Add parameters if they exist
                    if (aa.params && Object.keys(aa.params).length > 0) {
                        const paramsList = Object.entries(aa.params)
                            .map(([key, value]) => {
                                const displayValue = this.formatParamValueForMessage(value);
                                return `   • **${key}**: ${displayValue}`;
                            })
                            .join('\n');
                        actionText += `\n${paramsList}`;
                    }

                    return actionText;
                }).join('\n\n');
            }
                
            params.onProgress?.({
                step: 'action_execution',
                message: this.formatHierarchicalMessage(progressMessage),
                metadata: {
                    actionCount: actions.length,
                    actionNames: actions.map(a => a.name),
                    stepCount: stepCount + 1,
                    hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
                },
                displayMode: 'live' // Only show in live mode
            });

            // Build a detailed record of the action(s) invoked, with parameters, in markdown.
            // This is a permanent, lightweight memory of what was requested.
            //
            // IMPORTANT — this record is injected as a `user`-role environment annotation, NOT an
            // `assistant` turn. The model's actual output is the JSON envelope, but we don't store
            // that raw JSON; we store this human-readable summary instead. If it were recorded as an
            // `assistant` turn, then after a few action-heavy turns the model's entire visible
            // assistant history would be prose like "I'm executing the X action with parameters: …",
            // and strong in-context learners (e.g. Gemini Flash) imitate that demonstrated pattern
            // over the system-prompt instruction — drifting into prose and breaking JSON parsing,
            // which (pre-guardrail) looped forever. Phrasing it in second person under the `user`
            // role keeps the memory while removing the false assistant-prose exemplar. The
            // human-facing narration is emitted separately via onProgress above.
            let actionMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
                actionMessage = `[You invoked the **${aa.name}** action`;

                // Add parameters if they exist
                if (aa.params && Object.keys(aa.params).length > 0) {
                    const paramsList = Object.entries(aa.params)
                        .map(([key, value]) => {
                            const displayValue = this.formatParamValueForMessage(value);
                            return `• **${key}**: ${displayValue}`;
                        })
                        .join('\n');
                    actionMessage += ` with parameters:\n${paramsList}\n]`;
                } else {
                    actionMessage += '.]';
                }
            } else {
                actionMessage = `[You invoked **${actions.length} actions** in parallel:\n\n` + actions.map((aa, index) => {
                    let actionText = `${index + 1}. **${aa.name}**`;

                    // Add parameters if they exist
                    if (aa.params && Object.keys(aa.params).length > 0) {
                        const paramsList = Object.entries(aa.params)
                            .map(([key, value]) => {
                                const displayValue = this.formatParamValueForMessage(value);
                                return `   • **${key}**: ${displayValue}`;
                            })
                            .join('\n');
                        actionText += `\n${paramsList}`;
                    }

                    return actionText;
                }).join('\n\n') + '\n]';
            }

            if (addConversationMessage) {
                // Record as a `user`-role environment annotation (no metadata - permanent record).
                // See the note above on why this is NOT an `assistant` turn.
                params.conversationMessages.push({
                    role: 'user',
                    content: actionMessage
                });
            }

            const actionEngine = ActionEngineServer.Instance;
            // Get the AIAgentAction metadata records for this agent (used for expiration settings)
            const agentActions = AIEngine.Instance.AgentActions.filter(aa => UUIDsEqual(aa.AgentID, params.agent.ID));

            // Use _effectiveActions which includes runtime action changes applied in gatherPromptTemplateData
            // Fall back to database-configured actions if _effectiveActions is empty (shouldn't happen in normal flow)
            const effectiveActions = this._effectiveActions.length > 0
                ? this._effectiveActions
                : actionEngine.Actions.filter(a =>
                    agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID))
                  );

            // Call agent type's pre-processing for actions
            try {
                const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
                
                // Pre-process actions - this may modify the actions array in place
                await this.AgentTypeInstance.PreProcessActionStep(
                    actions,
                    currentPayload,
                    this.AgentTypeState,
                    previousDecision,
                    params
                );
            } catch (error) {
                LogError(`Error in PreProcessActionStep: ${error.message}`);
                // Continue with unmodified actions if pre-processing fails
            }

            // Track step numbers for parallel actions
            let numActionsProcessed = 0;
            const baseStepNumber = (this._agentRun!.Steps?.length || 0) + 1;

            // Execute all actions in parallel
            let lastStep: MJAIAgentRunStepEntityExtended | undefined = undefined;
            const actionPromises = actions.map(async (aa) => {
                // Find action entity from the effective actions (which includes runtime changes)
                const actionEntity = effectiveActions.find(a => a.Name === aa.name);
                if (!actionEntity) {
                    throw new Error(`Action "${aa.name}" Not Found for Agent "${params.agent.Name}". Available actions: ${effectiveActions.map(a => a.Name).join(', ')}`);
                }

                // Prepare input data for the action step
                const actionInputData = {
                    actionName: aa.name,
                    actionParams: aa.params
                };
                
                const stepEntity = await this.createStepEntity({ stepType: 'Actions', stepName: `Execute Action: ${aa.name}`, contextUser: params.contextUser, targetId: actionEntity.ID, inputData: actionInputData, payloadAtStart: currentPayload, payloadAtEnd: currentPayload, parentId: parentStepId });
                lastStep = stepEntity;
                // Override step number to ensure unique values for parallel actions
                stepEntity.StepNumber = baseStepNumber + numActionsProcessed++;
                
                // Increment execution count for this action
                this.incrementExecutionCount(actionEntity.ID);
                
                let actionResult: ActionResult;
                try {
                    // Execute the action
                    actionResult = await this.ExecuteSingleAction(params, aa, actionEntity, params.contextUser);
                    
                    // Update step entity with ActionExecutionLog ID if available
                    if (actionResult.LogEntry?.ID) {
                        const logId = actionResult.LogEntry.ID;
                        stepEntity.TargetLogID = logId;
                        // Re-apply post-INSERT: a fast action can finish before the step's INSERT lands, and
                        // the INSERT's reload would otherwise revert TargetLogID back to null.
                        this.queueStepSave(stepEntity, (s) => { s.TargetLogID = logId; });
                    }
                    
                    // Prepare output data with action result
                    const outputData = {
                        actionResult: {
                            success: actionResult.Success,
                            resultCode: actionResult.Result?.ResultCode,
                            message: actionResult.Message,
                            parameters: actionResult.Params
                        }
                    };
                    
                    // Finalize step entity with output data
                    await this.finalizeStepEntity(stepEntity, actionResult.Success, 
                        actionResult.Success ? undefined : actionResult.Message, outputData);
                    
                    return { success: true, result: actionResult, action: aa, actionEntity, stepEntity };
                    
                } catch (error) {
                    await this.finalizeStepEntity(stepEntity, false, error.message);

                    return { success: false, result: actionResult, error: error.message, action: aa, actionEntity, stepEntity };
                }
            });
            
            // Wait for all actions to complete
            const actionResults = await Promise.all(actionPromises);
            
            // Check for cancellation after actions complete
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled after action execution');
            }
            
            // Build a clean summary of action results
            // Apply large binary content interception to prevent context overflow
            const actionSummaries: ActionResultSummary[] = actionResults.map(result => {
                const actionResult = result.success ? result.result : null;

                // Filter to output params only
                const outputParams = result.result?.Params?.filter(p => p.Type === 'Both' || p.Type === 'Output') || [];

                // Intercept large media content (images, audio, video) and replace with placeholders
                // This prevents context overflow from base64 data (~700K tokens per 1024x1024 image)
                // Pass actionEntity for generic ValueType=MediaOutput detection from metadata
                const sanitizedParams = this.interceptLargeBinaryContent(outputParams, result.actionEntity);

                // Collect file outputs (PDF, Excel, Word, etc.) for post-run artifact processing
                const fileOutputs = this.detectFileOutputs(outputParams);
                this._fileOutputs.push(...fileOutputs);

                return {
                    actionName: result.action.name,
                    success: result.success,
                    params: sanitizedParams,
                    resultCode: actionResult?.Result?.ResultCode || (result.success ? 'SUCCESS' : 'ERROR'),
                    message: result.success ? actionResult?.Message || 'Action completed' : result.error || 'Unknown error',
                    aiDirectives: result.success ? actionResult?.AIDirectives : undefined
                };
            });
            
            // Check if any actions failed
            const failedActions = actionSummaries.filter(a => !a.success);

            // Add user message with the results — compact markdown instead of JSON
            const header = failedActions.length > 0
                ? `${failedActions.length} of ${actionSummaries.length} action(s) failed:`
                : `Action results:`;
            const resultsMessage = `${header}\n${this.formatActionResultsAsMarkdown(actionSummaries)}`;

            // Build metadata from AI Agent Actions configuration
            // If multiple actions, use the most restrictive (shortest) expiration settings
            let metadata: AgentChatMessageMetadata | undefined;
            const agentActionConfigs = actionResults
                .map(r => agentActions.find(aa => UUIDsEqual(aa.ActionID, r.actionEntity.ID)))
                .filter(aa => aa != null);

            if (agentActionConfigs.length > 0) {
                // Find the most restrictive expiration settings
                let minExpirationTurns: number | null = null;
                let expirationMode: 'None' | 'Remove' | 'Compact' = 'None';
                let compactMode: 'First N Chars' | 'AI Summary' | undefined;
                let compactLength: number | undefined;
                let compactPromptId: string | undefined;

                for (const agentAction of agentActionConfigs) {
                    // Track shortest expiration (most restrictive)
                    if (agentAction.ResultExpirationTurns != null) {
                        if (minExpirationTurns === null || agentAction.ResultExpirationTurns < minExpirationTurns) {
                            minExpirationTurns = agentAction.ResultExpirationTurns;
                            expirationMode = agentAction.ResultExpirationMode as 'None' | 'Remove' | 'Compact' || 'None';
                            compactMode = agentAction.CompactMode as 'First N Chars' | 'AI Summary' | undefined;
                            compactLength = agentAction.CompactLength;
                            compactPromptId = agentAction.CompactPromptID;
                        }
                    }
                }

                // Only add metadata if we have expiration settings
                if (minExpirationTurns !== null && expirationMode !== 'None') {
                    metadata = {
                        turnAdded: this._promptTurnCount,
                        messageType: 'action-result',
                        expirationTurns: minExpirationTurns,
                        expirationMode: expirationMode,
                        compactMode: compactMode,
                        compactLength: compactLength,
                        compactPromptId: compactPromptId
                    };
                }
            }

            if (addConversationMessage) {
                // Add user message with results and optional metadata
                params.conversationMessages.push({
                    role: 'user',
                    content: resultsMessage,
                    metadata: metadata
                } as AgentChatMessage);

                // Surface explicit AI directives from action results as a separate instruction message.
                // Actions that need the AI to follow specific instructions (not just acknowledge data)
                // populate AIDirectives on their ActionResultSimple return value.
                const allDirectives = actionSummaries
                    .filter(a => a.success && a.aiDirectives && a.aiDirectives.length > 0)
                    .flatMap(a => a.aiDirectives!);
                if (allDirectives.length > 0) {
                    const directiveText = allDirectives
                        .map(d => `[${d.Priority.toUpperCase()}/${d.Type}] ${d.Message}`)
                        .join('\n\n');
                    params.conversationMessages.push({
                        role: 'user',
                        content: `IMPORTANT — Follow these directives from the action results:\n\n${directiveText}`
                    });
                }
            }

            // Call agent type's post-processing for actions
            let finalPayload = currentPayload;
            
            try {
                const actionResultsOnly = actionResults.map(r => r.result).filter(r => r !== undefined) as ActionResult[];
                
                const payloadChangeRequest = await this.AgentTypeInstance.PostProcessActionStep(
                    actionResultsOnly,
                    actions,
                    currentPayload,
                    this.AgentTypeState,
                    previousDecision
                );
                
                // If we got a payload change request, apply it
                if (payloadChangeRequest) {
                    const allowedPaths = params.agent.PayloadSelfWritePaths 
                        ? JSON.parse(params.agent.PayloadSelfWritePaths) 
                        : this.getDefaultPayloadSelfWritePaths();
                    
                    const changeResult = this._payloadManager.applyAgentChangeRequest(
                        currentPayload,
                        payloadChangeRequest,
                        {
                            validateChanges: true,
                            logChanges: true,
                            agentName: params.agent.Name,
                            analyzeChanges: true,
                            generateDiff: true,
                            allowedPaths: allowedPaths,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );
                    
                    finalPayload = changeResult.result;
                    if (lastStep) {
                        lastStep.PayloadAtEnd = this.serializePayloadAtEnd(finalPayload);
                        await lastStep.Save();
                    }
                    
                    if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Action post-processing payload warnings: ${changeResult.warnings.join('; ')}`);
                    }
                }
            } catch (error) {
                LogError(`Error in PostProcessActionStep: ${error.message}`);
            }
            
            // After actions complete, we need to process the results
            // The retry step is used to re-execute the prompt with the action results
            // This allows the agent to analyze the results and determine what to do next
            return {
                terminate: false,
                step: 'Retry',
                previousPayload: previousDecision?.previousPayload || null,
                newPayload: finalPayload, // Use the final payload after any post-processing
                priorStepResult: actionSummaries,
                retryReason: failedActions.length > 0
                    ? `Processing results with ${failedActions.length} failed action(s): ${failedActions.map(a => a.actionName).join(', ')}`
                    : `Analyzing results from ${actionSummaries.length} completed action(s) to formulate response`
            };
        }
        catch (e) {
            return {
                terminate: false,
                step: 'Retry',
                errorMessage: e && e.message ? e.message : e ? e : 'Unknown error executing actions',
                retryReason: 'Error while processing actions, retry',
                newPayload: previousDecision?.newPayload || null, // pass along from last step, no change
                previousPayload: previousDecision?.previousPayload || null, // pass along from last step, no change
            };
        }
    }

    /**
     * Executes a chat step - these should bubble up to the user for interaction.
     * Chat steps are terminal and indicate the agent needs user input.
     *
     * For root agents (depth 0), this also creates a persistent AIAgentRequest row
     * so the request is tracked even when the agent isn't running in a conversation.
     * The feedbackRequestId is returned in ExecuteAgentResult for callers to use
     * (e.g., sending notifications, syncing conversation responses).
     *
     * @private
     */

    // ================================================================
    // Client Tools Step Execution
    // ================================================================

    /**
     * Execute client-side tools requested by the agent.
     * Sends each tool invocation via PubSub, awaits the client's response
     * (or timeout), then adds results to the conversation and continues.
     */
    private async executeClientToolsStep(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep> {
        const clientTools: AgentClientToolInvocation[] = previousDecision.clientTools ?? [];
        if (clientTools.length === 0) {
            // No tools to execute — continue with next prompt
            return await this.executePromptStep(params, config, previousDecision, stepCount);
        }

        if (!params.sessionID) {
            // No session ID — can't communicate with client
            const errorMsg = 'Cannot execute client tools: no sessionID provided in ExecuteAgentParams';
            LogError(errorMsg);
            params.conversationMessages.push({
                role: 'user',
                content: `Client tool execution skipped: ${errorMsg}`
            });
            return await this.executePromptStep(params, config, previousDecision, stepCount);
        }

        const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;

        // Build assistant message describing the tool invocations
        const toolMessage = clientTools.length === 1
            ? `I'm invoking the **${clientTools[0].Name}** client tool${clientTools[0].Description ? ` — ${clientTools[0].Description}` : ''}.`
            : `I'm invoking **${clientTools.length} client tools**:\n\n` +
              clientTools.map((t, i) => `${i + 1}. **${t.Name}**${t.Description ? ` — ${t.Description}` : ''}`).join('\n');

        params.conversationMessages.push({
            role: 'assistant',
            content: toolMessage
        });

        // Report progress
        params.onProgress?.({
            step: 'action_execution', // Reuse action_execution step type for progress reporting
            message: this.formatHierarchicalMessage(toolMessage),
            metadata: {
                toolCount: clientTools.length,
                toolNames: clientTools.map(t => t.Name),
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            },
            displayMode: 'live'
        });

        // Resolve default timeout: per-tool > params > agent config > 30s
        const defaultTimeout = params.clientToolTimeoutMs ?? 30_000;

        const results: ClientToolResultSummary[] = [];
        const agentRunID = this._agentRun?.ID ?? 'unknown';

        // Execute tools sequentially (client may not support parallel UI operations)
        for (const tool of clientTools) {
            const stepEntity = await this.createStepEntity({
                stepType: 'Tool',
                stepName: `Client Tool: ${tool.Name}`,
                inputData: { toolName: tool.Name, params: tool.Params },
                contextUser: params.contextUser,
                payloadAtStart: currentPayload,
                payloadAtEnd: currentPayload
            });

            const timeoutMs = tool.TimeoutMs ?? defaultTimeout;

            const response = await ClientToolRequestManager.Instance.RequestClientTool(
                `ct_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                tool.Name,
                tool.Params,
                params.sessionID,
                agentRunID,
                timeoutMs,
                tool.Description
            );

            await this.finalizeStepEntity(
                stepEntity,
                response.Success,
                response.ErrorMessage,
                { result: response.Result }
            );

            results.push({
                ToolName: tool.Name,
                Success: response.Success,
                Result: response.Result,
                ErrorMessage: response.ErrorMessage
            });
        }

        // Format results as conversation message
        const resultsMarkdown = this.formatClientToolResultsAsMarkdown(results);
        params.conversationMessages.push({
            role: 'user',
            content: resultsMarkdown,
            metadata: {
                turnAdded: this._promptTurnCount,
                messageType: 'client-tool-result'
            }
        } as AgentChatMessage);

        // If the LLM already declared taskComplete=true alongside the client tools,
        // honor that intent now that tools have executed — no need for another LLM call.
        if (previousDecision.terminateAfterExecution) {
            return {
                step: 'Success',
                terminate: true,
                message: previousDecision.message || 'Client tools executed successfully.',
                payloadChangeRequest: previousDecision.payloadChangeRequest,
                scratchpad: previousDecision.scratchpad,
                responseForm: previousDecision.responseForm,
                actionableCommands: previousDecision.actionableCommands,
                automaticCommands: previousDecision.automaticCommands
            };
        }

        return await this.executePromptStep(params, config, previousDecision, stepCount);
    }

    /**
     * Format client tool results as a compact markdown summary for the conversation.
     */
    private formatClientToolResultsAsMarkdown(results: ClientToolResultSummary[]): string {
        const failedCount = results.filter(r => !r.Success).length;
        const header = failedCount > 0
            ? `${failedCount} of ${results.length} client tool(s) failed:`
            : 'Client tool results:';

        const lines = results.map(r => {
            const icon = r.Success ? '✓' : '✗';
            let line = `${icon} **${r.ToolName}**: ${r.Success ? 'succeeded' : 'failed'}`;
            if (r.ErrorMessage) line += ` — ${r.ErrorMessage}`;
            if (r.Success && r.Result != null) {
                const resultStr = typeof r.Result === 'string' ? r.Result : JSON.stringify(r.Result);
                if (resultStr.length <= 500) {
                    line += `\n  Result: ${resultStr}`;
                }
            }
            return line;
        });

        return `${header}\n${lines.join('\n')}`;
    }

    private async executeChatStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const stepEntity = await this.createStepEntity({ stepType: 'Chat', stepName: 'User Interaction', contextUser: params.contextUser });

        // Chat steps are successful - they indicate a need for user interaction
        await this.finalizeStepEntity(stepEntity, true);

        // For root agents, create a persistent AIAgentRequest so the request is
        // tracked in the dashboard and can be responded to outside a conversation.
        if (this._depth === 0) {
            await this.createFeedbackRequest(params, stepEntity, previousDecision);
        }

        return {
            step: 'Chat',
            terminate: true,
            message: previousDecision.message || 'Additional information needed from user',
            priorStepResult: previousDecision.message,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload, // chat steps don't modify the payload
            responseForm: previousDecision.responseForm,
            actionableCommands: previousDecision.actionableCommands,
            automaticCommands: previousDecision.automaticCommands
        };
    }

    /**
     * Creates a persistent AIAgentRequest row when a Chat step fires.
     * Resolves the target user via the assignment chain:
     *   1. contextUser (explicit caller)
     *   2. AgentRun.UserID (run initiator)
     *   3. Conversation.UserID (conversation fallback)
     *   4. Agent.OwnerUserID (agent owner)
     *   5. null (system-level, visible to admins)
     *
     * @private
     */
    private async createFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        previousDecision: BaseAgentNextStep
    ): Promise<void> {
        try {
            const requestTypeId = await this.resolveRequestTypeId(previousDecision, params.contextUser);
            const resolvedStrategy = await this.resolveAssignmentStrategy(params, requestTypeId);
            const requestForUserId = this.resolveUserFromStrategy(resolvedStrategy, params);
            const priority = resolvedStrategy?.priority ?? 50;
            const expirationMinutes = resolvedStrategy?.expirationMinutes;

            const request = await (params.provider || this._activeProvider).GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                params.contextUser
            );
            request.NewRecord();
            request.AgentID = params.agent.ID;
            request.RequestedAt = new Date();
            request.RequestForUserID = requestForUserId;
            request.Status = 'Requested';
            request.Request = previousDecision.message || 'Agent needs user input';
            request.RequestTypeID = requestTypeId;
            request.ResponseSchema = previousDecision.responseForm
                ? JSON.stringify(previousDecision.responseForm)
                : null;
            request.Priority = priority;
            request.OriginatingAgentRunID = this._agentRun?.ID || null;
            request.OriginatingAgentRunStepID = stepEntity.ID;

            if (expirationMinutes != null && expirationMinutes > 0) {
                request.ExpiresAt = new Date(Date.now() + expirationMinutes * 60_000);
            }

            const saved = await request.Save();
            if (saved) {
                this._feedbackRequestId = request.ID;
                this.logStatus(
                    `📋 Created feedback request ${request.ID} for user ${requestForUserId || '(system)'}`,
                    true,
                    params
                );
            } else {
                LogError(`Failed to save AIAgentRequest for agent ${params.agent.Name}`);
            }
        } catch (error) {
            // Don't let request creation failure break the agent execution
            LogError(`Error creating feedback request: ${(error as Error).message}`);
        }
    }

    /**
     * Walks the assignment strategy resolution chain (bottom-up, first-non-null wins):
     * 1. ExecuteAgentParams.assignmentStrategy (per-invocation)
     * 2. Agent Type's AssignmentStrategy
     * 3. Agent's Category AssignmentStrategy (walks up ParentID tree)
     * 4. Request Type's DefaultAssignmentStrategy
     * 5. Fallback: null (caller uses contextUser + warning)
     * @private
     */
    private async resolveAssignmentStrategy(
        params: ExecuteAgentParams,
        requestTypeId: string | null
    ): Promise<AgentRequestAssignmentStrategy | null> {
        // 1. Per-invocation override (highest precedence)
        if (params.assignmentStrategy) {
            return params.assignmentStrategy;
        }

        // 2. Agent Type's AssignmentStrategy
        const agentType = AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, params.agent.TypeID));
        const typeStrategy = parseAssignmentStrategy(agentType?.AssignmentStrategy ?? null);
        if (typeStrategy) {
            return typeStrategy;
        }

        // 3. Agent's Category AssignmentStrategy (walk up ParentID tree)
        const categoryStrategy = await this.resolveCategoryAssignmentStrategy(params);
        if (categoryStrategy) {
            return categoryStrategy;
        }

        // 4. Request Type's DefaultAssignmentStrategy
        if (requestTypeId && this._requestTypeCache) {
            const requestType = this._requestTypeCache.find(t => UUIDsEqual(t.ID, requestTypeId));
            if (requestType) {
                const rtStrategy = parseAssignmentStrategy(requestType.DefaultAssignmentStrategy);
                if (rtStrategy) {
                    return rtStrategy;
                }
            }
        }

        return null;
    }

    /**
     * Walks up the agent's category hierarchy looking for an AssignmentStrategy.
     * Uses AIEngine.Instance.AgentCategories (cached during engine Config).
     */
    private async resolveCategoryAssignmentStrategy(
        params: ExecuteAgentParams
    ): Promise<AgentRequestAssignmentStrategy | null> {
        const categoryId = params.agent.CategoryID;
        if (!categoryId) return null;

        try {
            const categories = AIEngine.Instance.AgentCategories;

            // Walk up the tree from the agent's category to the root
            let currentId: string | null = categoryId;
            const visited = new Set<string>(); // prevent infinite loops
            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                const cat = categories.find(c => UUIDsEqual(c.ID, currentId));
                if (!cat) break;

                const strategy = parseAssignmentStrategy(cat.AssignmentStrategy);
                if (strategy) return strategy;

                currentId = cat.ParentID;
            }
        } catch (error) {
            LogError(`Error resolving category assignment strategy: ${(error as Error).message}`);
        }

        return null;
    }


    /**
     * Resolves the file storage account ID for this agent's file artifacts.
     *
     * Resolution chain (first non-null wins):
     * 1. Runtime override (`params.override?.storageAccountId`)
     * 2. Agent-level (`params.agent.DefaultStorageAccountID`)
     * 3. Category hierarchy — walks up the agent's category tree via `ParentID`
     * 4. Agent Type-level (`agentType.DefaultStorageAccountID`)
     * 5. System fallback — single active storage account, if only one exists
     *
     * This method is `protected` so subclasses can override the resolution logic
     * for custom storage routing (e.g., routing by file type or tenant).
     *
     * @param params - The current agent execution parameters
     * @returns The resolved FileStorageAccount ID, or null if none configured
     */
    protected async getStorageAccountID(params: ExecuteAgentParams): Promise<string | null> {
        // 1. Runtime override — highest priority
        if (params.override?.storageAccountId) {
            return params.override.storageAccountId;
        }

        // 2. Agent-level override
        if (params.agent.DefaultStorageAccountID) {
            return params.agent.DefaultStorageAccountID;
        }

        // 3. Category tree walk
        const categoryId = params.agent.CategoryID;
        if (categoryId) {
            try {
                const categories = AIEngine.Instance.AgentCategories;

                let currentId: string | null = categoryId;
                const visited = new Set<string>();
                while (currentId && !visited.has(currentId)) {
                    visited.add(currentId);
                    const cat = categories.find(c => UUIDsEqual(c.ID, currentId));
                    if (!cat) break;
                    if (cat.DefaultStorageAccountID) return cat.DefaultStorageAccountID;
                    currentId = cat.ParentID;
                }
            } catch (error) {
                LogError(`Error resolving category storage account: ${(error as Error).message}`);
            }
        }

        // 4. Agent Type-level default
        const agentTypeId = params.agent.TypeID;
        if (agentTypeId) {
            const agentType = AIEngine.Instance.AgentTypes.find(
                at => UUIDsEqual(at.ID, agentTypeId)
            );
            if (agentType?.DefaultStorageAccountID) {
                return agentType.DefaultStorageAccountID;
            }
        }

        // 5. System fallback — use cached metadata (already loaded during engine Config)
        const activeAccounts = FileStorageEngineBase.Instance.AccountsWithProviders
            .filter(a => a.provider.IsActive);

        if (activeAccounts.length === 0) {
            // No storage configured — return null, inline base64 fallback handles it downstream
            return null;
        }

        if (activeAccounts.length === 1) {
            return activeAccounts[0].account.ID;
        }

        // 2+ active accounts but nothing configured at any level
        const agentName = params.agent.Name || params.agent.ID;
        const typeName = params.agent.TypeID
            ? AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, params.agent.TypeID))?.Name || params.agent.TypeID
            : 'unknown';
        const categoryName = params.agent.CategoryID
            ? AIEngine.Instance.AgentCategories.find(c => UUIDsEqual(c.ID, params.agent.CategoryID))?.Name || params.agent.CategoryID
            : 'none';
        const accountNames = activeAccounts.map(a => `'${a.account.Name}' (${a.provider.Name})`).join(', ');

        throw new Error(
            `Multiple active file storage accounts detected (${accountNames}) but no DefaultStorageAccountID is configured ` +
            `for agent '${agentName}', category '${categoryName}', or agent type '${typeName}'.\n` +
            `To fix: Set DefaultStorageAccountID on one of the following (in order of priority):\n` +
            `  1. Agent '${agentName}' — for this specific agent\n` +
            `  2. Agent Category '${categoryName}' — for all agents in this category\n` +
            `  3. Agent Type '${typeName}' — for all agents of this type`
        );
    }

    /**
     * Resolves the target user ID from a resolved assignment strategy.
     * For simple strategies (RunUser, AgentOwner, SpecificUser), resolves immediately.
     * For List/SharedInbox strategies, delegates to list-based resolution.
     * Falls back to contextUser with a warning if no strategy is provided.
     * @private
     */
    private resolveUserFromStrategy(
        strategy: AgentRequestAssignmentStrategy | null,
        params: ExecuteAgentParams
    ): string | null {
        if (!strategy) {
            // No strategy resolved anywhere — fall back to contextUser + warning
            if (params.contextUser?.ID) {
                LogStatus(`⚠️ No assignment strategy configured for agent ${params.agent.Name}; defaulting to context user`);
                return params.contextUser.ID;
            }
            LogStatus(`⚠️ No assignment strategy and no context user for agent ${params.agent.Name}; request will be unassigned`);
            return null;
        }

        switch (strategy.type) {
            case 'RunUser':
                return params.contextUser?.ID
                    ?? this._agentRun?.UserID
                    ?? null;

            case 'AgentOwner':
                return params.agent.OwnerUserID ?? null;

            case 'SpecificUser':
                return strategy.userID ?? null;

            case 'List':
                // List-based resolution (RoundRobin, LeastBusy, Random) requires async DB lookups.
                // For now, fall back to contextUser. Full list resolution is a future enhancement
                // that will query ListDetail records and track assignment state.
                LogStatus(`ℹ️ List-based assignment strategy configured but not yet implemented; defaulting to context user`);
                return params.contextUser?.ID ?? null;

            case 'SharedInbox':
                // SharedInbox means "unassigned — anyone in the list can claim it"
                return null;

            default:
                return params.contextUser?.ID ?? null;
        }
    }

    /**
     * Determines the request type ID based on the Chat step's context.
     * - If the responseForm has only approve/reject-style buttons, uses "Approval"
     * - If there's a responseForm with fields, uses "Information"
     * - Otherwise defaults to "Information"
     *
     * Caches the request type lookup for the duration of this agent execution.
     * @private
     */
    private _requestTypeCache: MJAIAgentRequestTypeEntity[] | null = null;

    private async resolveRequestTypeId(
        previousDecision: BaseAgentNextStep,
        contextUser?: UserInfo
    ): Promise<string | null> {
        try {
            // Load request types if not cached
            if (!this._requestTypeCache) {
                const rv = new RunView();
                const result = await rv.RunView<MJAIAgentRequestTypeEntity>({
                    EntityName: 'MJ: AI Agent Request Types',
                    ResultType: 'entity_object'
                }, contextUser);
                this._requestTypeCache = result.Success ? result.Results : [];
            }

            // Determine type name based on responseForm content
            let typeName = 'Information'; // default
            if (previousDecision.responseForm) {
                typeName = this.detectRequestTypeName(previousDecision.responseForm);
            }

            const matchedType = this._requestTypeCache.find(t => t.Name === typeName);
            return matchedType?.ID || null;
        } catch (error) {
            LogError(`Error resolving request type: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Inspects an AgentResponseForm to determine the best request type name.
     * Returns "Approval" if the form is a simple two-option approve/reject pattern,
     * otherwise returns "Information".
     * @private
     */
    private detectRequestTypeName(form: AgentResponseForm): string {
        const q = form.questions?.[0];
        if (!q || form.questions.length !== 1) {
            return 'Information';
        }
        const qType = q.type;
        if ((qType.type === 'buttongroup' || qType.type === 'radio') && 'options' in qType) {
            const opts = qType.options;
            if (opts.length === 2) {
                const labels = opts.map(o => o.label.toLowerCase());
                const hasPositive = labels.some(l => l.includes('approv') || l.includes('yes') || l.includes('accept'));
                const hasNegative = labels.some(l => l.includes('reject') || l.includes('no') || l.includes('deny'));
                if (hasPositive && hasNegative) {
                    return 'Approval';
                }
            }
        }
        return 'Information';
    }

    /**
     * Executes a ForEach loop with actual for loop
     * @private
     */
    private async executeForEachLoop(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const forEach = previousDecision.forEach as ForEachOperation;
        if (!forEach) {
            return this.createFailedStep('ForEach configuration missing', previousDecision);
        }

        const validationMessage = this.validateForEachOperation(forEach);
        if (validationMessage) {
            return this.createFailedStep(`ForEach configuration invalid: ${validationMessage}`, previousDecision);
        }

        const currentPayload = previousDecision.newPayload || previousDecision.previousPayload;
        const collection = this.getCollectionFromPayload(currentPayload, forEach.collectionPath);

        if (!collection) {
            return this.createFailedStep(`Collection path "${forEach.collectionPath}" not an array`, previousDecision);
        }

        const loopStepEntity = await this.createForEachLoopStep(forEach, collection, currentPayload, params);
        const loopResults = await this.executeForEachIterations(forEach, collection, currentPayload, loopStepEntity.ID, params, config);

        return this.completeForEachLoop(forEach, loopStepEntity, loopResults, previousDecision, params);
    }

    private validateWhileOperation(whileOp: WhileOperation): string | null {
        if (!whileOp.condition || whileOp.condition.trim() === '') {
            return 'Condition is required';
        }
        if (!whileOp.itemVariable || whileOp.itemVariable.trim() === '') {
            return 'Item variable is required';
        }

        // now validate the action or sub-agent
        if (whileOp.action) {
            return this.validateActionInAgent(whileOp.action.name);
        }
        else if (whileOp.subAgent) {
            // check to make sure sub-agent is valid
            return this.validateSubAgentInAgent(whileOp.subAgent.name);
        }

        // if we get here, all good
        return null;
    }

    private validateForEachOperation(forEach: ForEachOperation): string | null {
        // make sure that for actions it is valid action and for sub-agents it is valid sub-agent
        if (!forEach.itemVariable || forEach.itemVariable.trim() === '') {
            return 'Item variable is required';
        }
        if (!forEach.collectionPath || forEach.collectionPath.trim() === '') {
            return 'Collection path is required';
        }

        if (forEach.action) {
            return this.validateActionInAgent(forEach.action.name);
        }
        else if (forEach.subAgent) {
            // check to make sure sub-agent is valid
            return this.validateSubAgentInAgent(forEach.subAgent.name);
        }

        // if we get here, all good
        return null;
    }

    protected validateActionInAgent(actionName: string): string | null {
        // Use effective actions which includes runtime action changes
        const effectiveActions = this.getEffectiveActionsForValidation(this._agentRun!.AgentID);
        const normalizedName = actionName.trim().toLowerCase();

        // Try exact match first
        const exactMatch = effectiveActions.find(a => a.Name.trim().toLowerCase() === normalizedName);
        if (exactMatch) {
            return null; // Valid
        }

        // Try partial/contains match
        const partialMatches = effectiveActions.filter(a =>
            a.Name.trim().toLowerCase().includes(normalizedName)
        );

        if (partialMatches.length === 1) {
            return null; // Valid - single partial match
        } else if (partialMatches.length > 1) {
            return `Ambiguous action '${actionName}' specified. Matches: ${partialMatches.map(a => a.Name).join(', ')}`;
        } else {
            return `No action '${actionName}' found. Available: ${effectiveActions.map(a => a.Name).join(', ')}`;
        }
    }

    protected validateSubAgentInAgent(subAgentName: string): string | null {
        // check to make sure sub-agent is valid
        const relatedAgents = AIEngine.Instance.AgentRelationships.filter(ar => UUIDsEqual(ar.AgentID, this._agentRun!.AgentID));
        const childAgents = AIEngine.Instance.Agents.filter(a => UUIDsEqual(a.ParentID, this._agentRun!.AgentID));

        // now check to make sure that subAgentName is either in relatedAgents or childAgents
        let subAgent = relatedAgents.filter(ra => ra.SubAgent?.trim().toLowerCase() === subAgentName.trim().toLowerCase());
        if (subAgent.length === 0) {
            // no exact match, try for partial match
            subAgent = relatedAgents.filter(ra => ra.SubAgent?.trim().toLowerCase().includes(subAgentName.trim().toLowerCase() || ''));
            if (subAgent.length > 1) {
                return `Ambiguous sub-agent '${subAgentName}' specified`;
            } 
            else if (subAgent.length === 0) {
                // try child agents now
                let childAgent = childAgents.filter(ca => ca.Name?.trim().toLowerCase() === subAgentName.trim().toLowerCase());
                if (childAgent.length === 0) {
                    // no exact match, try for partial match
                    childAgent = childAgents.filter(ca => ca.Name?.trim().toLowerCase().includes(subAgentName.trim().toLowerCase() || ''));
                    if (childAgent.length > 1) {
                        return `Ambiguous child agent '${subAgentName}' specified`;
                    } else if (childAgent.length === 0) {
                        return `No child agent '${subAgentName}' found`;
                    }
                } 
                else {
                    // we have one match, so we're good here
                }
            }
        }

        // if we get here, all good
        return null;
    }

    /**
     * Helper: Validate and extract collection from payload
     * Strips "payload." prefix if present (for LLM convenience)
     */
    private getCollectionFromPayload(payload: any, path: string): any[] | null {
        // Support a literal static collection: "static:[1,2,3,4,5]". This lets a ForEach iterate a
        // fixed list/range without a prior step having to build the array in the payload first.
        const trimmed = path.trim();
        if (trimmed.toLowerCase().startsWith('static:')) {
            try {
                const parsed = JSON.parse(trimmed.substring(trimmed.indexOf(':') + 1).trim());
                return Array.isArray(parsed) ? parsed : null;
            } catch {
                return null;
            }
        }

        // Remove "payload." prefix if present
        const cleanPath = path.toLowerCase().startsWith('payload.')
            ? path.substring(8)
            : path;

        const value = this.getValueFromPath(payload, cleanPath);
        return Array.isArray(value) ? value : null;
    }

    /**
     * Helper: Create parent ForEach loop step (not finalized until loop completes)
     */
    private async createForEachLoopStep(
        forEach: ForEachOperation,
        collection: any[],
        payload: any,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        const stepEntity = await this.createStepEntity({
            stepType: 'ForEach',
            stepName: `ForEach: ${forEach.collectionPath} (${collection.length} items)`,
            contextUser: params.contextUser,
            inputData: { forEach, count: collection.length },
            payloadAtStart: payload
        });
        // Don't finalize yet - will finalize after loop completes
        return stepEntity;
    }

    /**
     * Helper: Execute all iterations with actual for loop
     */
    private async executeForEachIterations(
        forEach: ForEachOperation,
        collection: any[],
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any }> {
        const executionMode = forEach.executionMode || 'sequential';

        if (executionMode === 'parallel') {
            return this.executeForEachIterationsParallel(forEach, collection, initialPayload, parentStepId, params, config);
        } else {
            return this.executeForEachIterationsSequential(forEach, collection, initialPayload, parentStepId, params, config);
        }
    }

    /**
     * Execute ForEach iterations sequentially (one at a time).
     * This is the original implementation - safe for state accumulation and maintaining order.
     */
    private async executeForEachIterationsSequential(
        forEach: ForEachOperation,
        collection: any[],
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any }> {
        let currentPayload = initialPayload;
        const maxIterations = forEach.maxIterations ?? 1000;
        const results: Array<BaseAgentNextStep> = [];
        const errors = [];

        // ACTUAL FOR LOOP - simple and clear!
        for (let i = 0; i < Math.min(collection.length, maxIterations); i++) {
            if (i > 0 && forEach.delayBetweenIterationsMs) {
                await new Promise(resolve => setTimeout(resolve, forEach.delayBetweenIterationsMs));
            }

            const iterResult = await this.executeSingleForEachIteration(
                forEach,
                collection[i],
                i,
                currentPayload,
                parentStepId,
                params,
                config
            );

            if (iterResult.error) {
                errors.push(iterResult.error);
                if (!forEach.continueOnError) break;
            } else {
                results.push(iterResult.result);
                currentPayload = iterResult.payload;
            }
        }

        return { results, errors, finalPayload: currentPayload };
    }

    /**
     * Execute ForEach iterations in parallel batches.
     * Processes multiple iterations concurrently for better performance when iterations are independent.
     * Results are collected in parallel but applied to payload sequentially to maintain order.
     */
    private async executeForEachIterationsParallel(
        forEach: ForEachOperation,
        collection: any[],
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any }> {
        const maxIterations = forEach.maxIterations ?? 1000;
        const maxConcurrency = forEach.maxConcurrency ?? 10;
        const itemsToProcess = Math.min(collection.length, maxIterations);

        // Create batches for parallel processing
        const batches = this.createBatches(collection.slice(0, itemsToProcess), maxConcurrency);

        const allResults: Array<{ index: number; result?: BaseAgentNextStep; error?: any; payload?: any }> = [];

        // Process each batch in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // Execute all items in this batch concurrently
            const batchPromises = batch.map(({ item, index }) =>
                this.executeSingleForEachIteration(
                    forEach,
                    item,
                    index,
                    initialPayload, // Pass initial payload (read-only) to all parallel iterations
                    parentStepId,
                    params,
                    config
                ).then(iterResult => ({
                    index,
                    result: iterResult.result,
                    error: iterResult.error,
                    payload: iterResult.payload
                }))
            );

            const batchResults = await Promise.all(batchPromises);
            allResults.push(...batchResults);

            // Optional: Inter-batch delay
            if (forEach.delayBetweenIterationsMs && batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, forEach.delayBetweenIterationsMs));
            }

            // Check for errors that should stop processing
            const hasFailure = batchResults.some(r => r.error);
            if (hasFailure && !forEach.continueOnError) {
                break;
            }
        }

        // Sort results by original index to maintain order
        allResults.sort((a, b) => a.index - b.index);

        // Apply results sequentially to build final payload
        return this.applyForEachResultsSequentially(allResults, initialPayload, forEach.continueOnError || false);
    }

    /**
     * Create batches of items for parallel processing.
     * Each batch contains up to maxConcurrency items with their original indices.
     */
    private createBatches<T>(
        items: T[],
        maxConcurrency: number
    ): Array<Array<{ item: T; index: number }>> {
        const batches: Array<Array<{ item: T; index: number }>> = [];

        for (let i = 0; i < items.length; i += maxConcurrency) {
            const batch = items.slice(i, i + maxConcurrency).map((item, batchOffset) => ({
                item,
                index: i + batchOffset
            }));
            batches.push(batch);
        }

        return batches;
    }

    /**
     * Apply ForEach results sequentially to build final payload.
     * This ensures payload changes are applied in order even when iterations ran in parallel.
     */
    private applyForEachResultsSequentially(
        sortedResults: Array<{ index: number; result?: BaseAgentNextStep; error?: any; payload?: any }>,
        initialPayload: any,
        continueOnError: boolean
    ): { results: BaseAgentNextStep[], errors: any[], finalPayload: any } {
        let currentPayload = initialPayload;
        const results: BaseAgentNextStep[] = [];
        const errors: any[] = [];

        for (const { result, error, payload } of sortedResults) {
            if (error) {
                errors.push(error);
                if (!continueOnError) {
                    break;
                }
            } else if (result) {
                results.push(result);
                // Apply payload change from this iteration
                currentPayload = payload || currentPayload;
            }
        }

        return { results, errors, finalPayload: currentPayload };
    }

    /**
     * Helper: Execute single ForEach iteration
     */
    private async executeSingleForEachIteration(
        forEach: ForEachOperation,
        item: any,
        index: number,
        currentPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ payload?: any, error?: any, result?: BaseAgentNextStep }> {
        try {
            // Resolve params via BeforeLoopIteration hook
            const beforeHook = this.AgentTypeInstance.BeforeLoopIteration?.(
                { item, itemVariable: forEach.itemVariable,index, payload: currentPayload, loopType: 'ForEach', actionParams: forEach.action?.params || {} }
            );
            let resolvedParams = beforeHook?.actionParams || forEach.action?.params || {};

            // Execute action, sub-agent, or prompt
            let result;
            if (forEach.action) {
                // Find the AgentAction with fuzzy matching
                const matchedAction = this.findAgentActionForLoop(forEach.action.name, params.agent.ID, params.agent.Name, params);

                // Create context for template resolution
                const context = {
                    item,
                    index,
                    payload: currentPayload,
                    data: params.data
                };

                // Resolve action parameters using templates
                resolvedParams = this.resolveTemplates(resolvedParams, context, forEach.itemVariable);
                const resolvedAction = {
                    name: matchedAction.Action,
                    params: resolvedParams
                }
                const actionStep = { step: 'Actions' as const, actions: [resolvedAction], newPayload: currentPayload, previousPayload: currentPayload, terminate: false };
                result = await this.executeActionsStep(params, actionStep as BaseAgentNextStep, parentStepId, false);
            } else if (forEach.subAgent) {
                const subAgentStep = { step: 'Sub-Agent' as const, subAgent: forEach.subAgent, newPayload: currentPayload, previousPayload: currentPayload };
                result = await this.processSubAgentStep(params, subAgentStep as BaseAgentNextStep, parentStepId, item);
                // Attach formatted summary as priorStepResult so formatLoopResultsAsMarkdown can render it
                result.priorStepResult = this.formatSubAgentResultAsMarkdown(
                    forEach.subAgent.name,
                    result as unknown as ExecuteAgentResult
                );
            } else {
                throw new Error('ForEach missing action/subAgent');
            }

            // Apply AfterLoopIteration hook
            const iterPayload = result.newPayload || currentPayload;
            const afterHook = this.AgentTypeInstance.AfterLoopIteration?.(
                { currentPayload: iterPayload, item, itemVariable: forEach.itemVariable, index, loopContext: { actionOutputMapping: forEach.action?.outputMapping } }
            );

            return { payload: afterHook || iterPayload, result };

        } catch (error) {
            return { error: { index, item, message: error.message } };
        }
    }

    /**
     * Helper: Complete ForEach and return result
     */
    private async completeForEachLoop(
        forEach: ForEachOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: { results: BaseAgentNextStep[], errors: any[], finalPayload: any },
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        // Finalize the loop step now that loop is complete
        loopStepEntity.PayloadAtEnd = this.serializePayloadAtEnd(loopResults.finalPayload);
        await this.finalizeStepEntity(loopStepEntity,
                                      loopResults.errors.length === 0,
                                      loopResults.errors.join('\n\n'),
                                      loopResults);

        if (this.AgentTypeInstance.InjectLoopResultsAsMessage) {
            this.injectLoopResultsMessage('ForEach', forEach.collectionPath, loopResults.results, loopResults.errors, params, forEach.action?.name);
        }

        return {
            step: 'Retry',
            retryInstructions: `Completed ForEach loop request using collection at '${forEach.collectionPath}'`,
            terminate: false,
            newPayload: loopResults.finalPayload,
            previousPayload: previousDecision.previousPayload
        };
    }

    /**
     * Helper: Inject loop results into conversation with expiration/compaction metadata.
     * Uses the same lifecycle as non-loop action results so results persist for N turns
     * rather than being deleted after a single prompt turn.
     */
    private injectLoopResultsMessage(
        loopType: 'ForEach' | 'While',
        collectionOrCondition: string,
        results: BaseAgentNextStep[],
        errors: unknown[],
        params: ExecuteAgentParams,
        actionName?: string
    ) {
        const label = loopType === 'ForEach' ? 'Collection' : 'Condition';
        const content = `## Loop Completed\n**Type:** ${loopType}\n**${label}:** ${collectionOrCondition}\n` +
                     `**Processed:** ${results.length}, **Errors:** ${errors.length}\n\n` +
                     this.formatLoopResultsAsMarkdown(results, errors);

        // Resolve expiration metadata from the loop's action config (most-restrictive-wins)
        const metadata = this.resolveLoopExpirationMetadata(params, actionName);

        params.conversationMessages.push({
            role: 'user',
            content,
            metadata
        } as AgentChatMessage);
    }

    /**
     * Formats loop iteration results as markdown. Handles two distinct result shapes
     * depending on whether the loop body executed actions or sub-agents:
     *
     * - **Action iterations**: `priorStepResult` is an `ActionResultSummary[]`, set by
     *   `executeActionsStep()` (line ~7003). These are formatted via `formatActionResultsAsMarkdown()`.
     *
     * - **Sub-agent iterations**: `priorStepResult` is a **pre-formatted markdown string**,
     *   set by the loop handlers (`executeSingleForEachIteration` / `executeSingleWhileIteration`)
     *   which call `formatSubAgentResultAsMarkdown()` and assign the result to `priorStepResult`.
     *   Since the markdown is already rendered upstream, this method simply includes it as-is.
     *
     * This two-path design means sub-agent formatting happens at assignment time (in the loop
     * handler), while action formatting happens at render time (here). Both produce the same
     * markdown style used by non-loop results, ensuring consistency across the codebase.
     */
    private formatLoopResultsAsMarkdown(results: BaseAgentNextStep[], errors: unknown[]): string {
        const lines: string[] = [];

        for (let i = 0; i < results.length; i++) {
            const iterResult = results[i].priorStepResult;

            // Action iterations: priorStepResult is ActionResultSummary[] — format via shared helper
            if (Array.isArray(iterResult)) {
                lines.push(`### Iteration ${i + 1}`);
                lines.push(this.formatActionResultsAsMarkdown(iterResult));
            } else if (iterResult != null) {
                // Sub-agent iterations: priorStepResult is already a markdown string from
                // formatSubAgentResultAsMarkdown() called in the loop handler. Non-string
                // results (edge cases) are JSON-stringified as a fallback.
                lines.push(`### Iteration ${i + 1}`);
                const text = typeof iterResult === 'string'
                    ? iterResult
                    : JSON.stringify(iterResult);
                lines.push(text);
            }
            // null/undefined priorStepResult: iteration produced no output — skip silently
        }

        if (errors.length > 0) {
            lines.push(`### Errors`);
            for (const err of errors) {
                const errMsg = typeof err === 'string' ? err : (err as Record<string, unknown>)?.message || JSON.stringify(err);
                lines.push(`• ✗ ${errMsg}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Resolves expiration/compaction metadata for loop result messages by looking up
     * the loop's action config. Uses the same most-restrictive-wins logic as
     * non-loop action result metadata resolution.
     */
    private resolveLoopExpirationMetadata(
        params: ExecuteAgentParams,
        actionName?: string
    ): AgentChatMessageMetadata {
        const baseMetadata: AgentChatMessageMetadata = {
            turnAdded: this._promptTurnCount,
            messageType: 'loop-result'
        };

        // Check for global override first
        if (params.messageExpirationOverride) {
            const override = params.messageExpirationOverride;
            if (override.expirationTurns != null && override.expirationMode !== 'None') {
                return {
                    ...baseMetadata,
                    expirationTurns: override.expirationTurns,
                    expirationMode: override.expirationMode || 'Remove',
                    compactMode: override.compactMode,
                    compactLength: override.compactLength,
                    compactPromptId: override.compactPromptId
                };
            }
        }

        // Look up the loop's action config for expiration settings
        if (actionName) {
            const agentActions = AIEngine.Instance.AgentActions.filter(
                aa => UUIDsEqual(aa.AgentID, params.agent.ID)
            );
            const effectiveActions = this._effectiveActions.length > 0
                ? this._effectiveActions
                : ActionEngineServer.Instance.Actions.filter(a =>
                    agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID))
                );
            const matchedAction = effectiveActions.find(
                a => a.Name.trim().toLowerCase() === actionName.trim().toLowerCase()
            );

            if (matchedAction) {
                const agentAction = agentActions.find(aa => UUIDsEqual(aa.ActionID, matchedAction.ID));
                if (agentAction?.ResultExpirationTurns != null && agentAction.ResultExpirationMode !== 'None') {
                    return {
                        ...baseMetadata,
                        expirationTurns: agentAction.ResultExpirationTurns,
                        expirationMode: agentAction.ResultExpirationMode as 'Remove' | 'Compact',
                        compactMode: agentAction.CompactMode as 'First N Chars' | 'AI Summary' | undefined,
                        compactLength: agentAction.CompactLength ?? undefined,
                        compactPromptId: agentAction.CompactPromptID ?? undefined
                    };
                }
            }
        }

        // Default: keep for 3 turns then remove (safe fallback so results don't vanish after 1 turn)
        return {
            ...baseMetadata,
            expirationTurns: 3,
            expirationMode: 'Remove'
        };
    }

    /**
     * Helper: Find action with fuzzy matching for loops.
     * Uses effective actions which includes both database-configured and dynamically added actions.
     * Returns an object with the resolved action name for use in loop execution.
     *
     * @since 2.123.0 - Updated to use _effectiveActions for dynamic action support
     */
    private findAgentActionForLoop(
        actionName: string,
        agentId: string,
        agentName: string,
        params: ExecuteAgentParams
    ): { Action: string } {
        // Use effective actions which includes runtime action changes
        const effectiveActions = this.getEffectiveActionsForValidation(agentId);
        const normalizedName = actionName.trim().toLowerCase();

        // Try exact match first
        let matchedAction = effectiveActions.find(a =>
            a.Name.trim().toLowerCase() === normalizedName
        );

        // Fallback: CONTAINS search
        if (!matchedAction) {
            const containsMatches = effectiveActions.filter(a =>
                a.Name.trim().toLowerCase().includes(normalizedName)
            );

            if (containsMatches.length === 1) {
                matchedAction = containsMatches[0];
                this.logStatus(`Action fuzzy matched: '${actionName}' → '${matchedAction.Name}'`, true, params);
            } else if (containsMatches.length > 1) {
                throw new Error(`Ambiguous action '${actionName}'. Matches: ${containsMatches.map(a => a.Name).join(', ')}`);
            } else {
                throw new Error(`Action '${actionName}' not found for agent '${agentName}'. Available: ${effectiveActions.map(a => a.Name).join(', ')}`);
            }
        }

        // Return object with Action property for compatibility with existing callers
        return { Action: matchedAction.Name };
    }

    /**
     * Helper: Create failed step
     */
    private createFailedStep(errorMessage: string, previousDecision: BaseAgentNextStep): BaseAgentNextStep {
        return {
            step: 'Failed',
            terminate: false,
            errorMessage,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload
        };
    }
 
    /**
     * Executes a While loop with actual while loop
     * @private
     */
    private async executeWhileLoop(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const whileOp = previousDecision.while as WhileOperation;
        if (!whileOp) {
            return this.createFailedStep('While configuration missing', previousDecision);
        }

        const validationMessage = this.validateWhileOperation(whileOp);
        if (validationMessage) {
            return this.createFailedStep(`While configuration invalid: ${validationMessage}`, previousDecision);
        }

        const currentPayload = previousDecision.newPayload || previousDecision.previousPayload;
        const loopStepEntity = await this.createWhileLoopStep(whileOp, currentPayload, params);
        const loopResults = await this.executeWhileIterations(whileOp, currentPayload, loopStepEntity.ID, params, config);

        return this.completeWhileLoop(whileOp, loopStepEntity, loopResults, previousDecision, params);
    }

    /**
     * Helper: Create parent While loop step
     */
    private async createWhileLoopStep(
        whileOp: WhileOperation,
        payload: any,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        const stepEntity = await this.createStepEntity({
            stepType: 'While',
            stepName: `While: ${whileOp.condition}`,
            contextUser: params.contextUser,
            inputData: { while: whileOp },
            payloadAtStart: payload
        });
        return stepEntity;
    }

    /**
     * Helper: Execute While iterations with actual while loop
     */
    private async executeWhileIterations(
        whileOp: WhileOperation,
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any, iterations: number }> {
        let currentPayload = initialPayload;
        const maxIterations = whileOp.maxIterations ?? 100;
        const results: BaseAgentNextStep[] = [];
        const errors = [];
        let iterationCount = 0;

        const evaluator = new SafeExpressionEvaluator();

        // ACTUAL WHILE LOOP - simple and clear!
        while (iterationCount < maxIterations) {
            if (iterationCount > 0 && whileOp.delayBetweenIterationsMs) {
                await new Promise(resolve => setTimeout(resolve, whileOp.delayBetweenIterationsMs));
            }

            const evalResult = evaluator.evaluate(whileOp.condition, { payload: currentPayload, results, errors });
            if (!evalResult.success || !evalResult.value) {
                break;
            }

            const attemptContext = { attemptNumber: iterationCount + 1, totalAttempts: iterationCount };
            const iterResult = await this.executeSingleWhileIteration(
                whileOp,
                attemptContext,
                iterationCount,
                currentPayload,
                parentStepId,
                params,
                config
            );

            if (iterResult.error) {
                errors.push(iterResult.error);
                if (!whileOp.continueOnError) break;
            } else {
                results.push(iterResult.result);
                currentPayload = iterResult.payload;
            }

            iterationCount++;
        }

        return { results, errors, finalPayload: currentPayload, iterations: iterationCount };
    }

    /**
     * Helper: Execute single While iteration
     */
    private async executeSingleWhileIteration(
        whileOp: WhileOperation,
        attemptContext: any,
        index: number,
        currentPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ payload?: any, error?: any, result?: BaseAgentNextStep }> {
        try {
            // Resolve params via BeforeLoopIteration hook
            const beforeHook = this.AgentTypeInstance.BeforeLoopIteration?.(
                { item: attemptContext, index, itemVariable: whileOp.itemVariable, payload: currentPayload, loopType: 'While', actionParams: whileOp.action?.params || {} }
            );
            let resolvedParams = beforeHook?.actionParams || whileOp.action?.params || {};

            // Execute action or sub-agent
            let result;
            if (whileOp.action) {
                // Find the AgentAction with fuzzy matching
                const matchedAction = this.findAgentActionForLoop(whileOp.action.name, params.agent.ID, params.agent.Name, params);

                // Create context for template resolution
                const context = {
                    item: attemptContext,
                    index,
                    payload: currentPayload,
                    data: params.data
                };
                
                // Resolve action parameters using templates 
                resolvedParams = this.resolveTemplates(resolvedParams, context, whileOp.itemVariable || 'item');

                const resolvedAction = {
                    name: matchedAction.Action,
                    params: resolvedParams
                };
                const actionStep = { step: 'Actions' as const, actions: [resolvedAction], newPayload: currentPayload, previousPayload: currentPayload, terminate: false };
                result = await this.executeActionsStep(params, actionStep as BaseAgentNextStep, parentStepId, false);
            } else if (whileOp.subAgent) {
                const subAgentStep = { step: 'Sub-Agent' as const, subAgent: whileOp.subAgent, newPayload: currentPayload, previousPayload: currentPayload };
                result = await this.processSubAgentStep(params, subAgentStep as BaseAgentNextStep, parentStepId, attemptContext);
                // Attach formatted summary as priorStepResult so formatLoopResultsAsMarkdown can render it
                result.priorStepResult = this.formatSubAgentResultAsMarkdown(
                    whileOp.subAgent.name,
                    result as unknown as ExecuteAgentResult
                );
            } else {
                throw new Error('While missing action/subAgent');
            }

            // Apply AfterLoopIteration hook
            const iterPayload = result.newPayload || currentPayload;
            const afterHook = this.AgentTypeInstance.AfterLoopIteration?.(
                { currentPayload: iterPayload, item: attemptContext, itemVariable: whileOp.itemVariable, index, loopContext: { actionOutputMapping: whileOp.action?.outputMapping } }
            );

            return { payload: afterHook || iterPayload, result };

        } catch (error) {
            return { error: { index, item: attemptContext, message: error.message } };
        }
    }

    /**
     * Helper: Complete While and return result
     */
    private async completeWhileLoop(
        whileOp: WhileOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: { results: BaseAgentNextStep[], errors: any[], finalPayload: any, iterations: number },
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        loopStepEntity.PayloadAtEnd = this.serializePayloadAtEnd(loopResults.finalPayload);

        await this.finalizeStepEntity(loopStepEntity,
                                      loopResults.errors.length === 0,
                                      loopResults.errors.join('\n\n'),
                                      loopResults);

        if (this.AgentTypeInstance.InjectLoopResultsAsMessage) {
            this.injectLoopResultsMessage('While', whileOp.condition, loopResults.results, loopResults.errors, params, whileOp.action?.name);
        }

        return {
            step: 'Retry',
            retryInstructions: `Completed While loop request using condition '${whileOp.condition}' after ${loopResults.iterations} iteration(s)`,
            terminate: false,
            newPayload: loopResults.finalPayload,
            previousPayload: previousDecision.previousPayload
        };
    }
 
    /**
     * Creates a failure result with proper tracking.
     *
     * @private
     */
    private async createFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        if (this._agentRun) {
            this._agentRun.Status = 'Failed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = errorMessage;
            
            // Calculate total tokens even for failed runs
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCacheReadTokensUsed = tokenStats.cacheReadTokens;
            this._agentRun.TotalCacheWriteTokensUsed = tokenStats.cacheWriteTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            await this._agentRun.Save();
        }
        
        return {
            success: false,
            agentRun: this._agentRun!
        };
    }

    /**
     * Creates a cancelled result.
     * 
     * @private
     * @param {string} message - The cancellation message
     * @returns {Promise<ExecuteAgentResult>} The cancelled result
     */
    private async createCancelledResult(message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        if (this._agentRun) {
            this._agentRun.Status = 'Cancelled';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = message;
            
            // Calculate total tokens even for cancelled runs
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCacheReadTokensUsed = tokenStats.cacheReadTokens;
            this._agentRun.TotalCacheWriteTokensUsed = tokenStats.cacheWriteTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            await this._agentRun.Save();
        }
        
        return {
            success: false,
            agentRun: this._agentRun!
        };
    }

    /**
     * Finalizes the agent run with success.
     * 
     * @private
     */
    private async finalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        // Flush every pending step save (success OR failure) via the shared queue, which allSettles so a
        // single failure doesn't shadow the rest and drains itself so a reused instance doesn't leak
        // settled promises. Surface the failure count on the run for visibility.
        const { failures } = await this._stepSaveQueue.Flush();
        if (failures > 0 && this._agentRun) {
            const note = `${failures} step record save(s) failed during this run; see logs for details.`;
            this._agentRun.ErrorMessage = this._agentRun.ErrorMessage
                ? `${this._agentRun.ErrorMessage}\n${note}`
                : note;
        }

        // Only resolve media placeholders for ROOT agents (depth === 0)
        // Sub-agents keep placeholders intact so parent agents don't get huge base64 in their context
        // The root agent resolves all placeholders when returning the final result to the UI
        const isRootAgent = this._depth === 0;
        const resolvedPayload = (payload && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(payload)
            : payload;

        // For root agents: resolve media placeholders in actionable commands
        // (e.g., open:url commands where the URL is a ${media:xxx} placeholder)
        const resolvedActionableCommands = (finalStep.actionableCommands && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(finalStep.actionableCommands)
            : finalStep.actionableCommands;

        if (this._agentRun) {
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = finalStep.step === 'Success' || finalStep.step === 'Chat';
            if (!this._agentRun.Success) {
                // Capture error message from either errorMessage or message field
                const errorText = finalStep.errorMessage || finalStep.message;
                if (errorText) {
                    // Append to any existing error message
                    this._agentRun.ErrorMessage = (this._agentRun.ErrorMessage ? this._agentRun.ErrorMessage + '\n\n' : '') + errorText;
                }
            }
            if (!this._agentRun.Success) {
                // set status to Failed
                this._agentRun.Status = 'Failed';
            }
            else if (finalStep.step === 'Chat') {
                // Chat steps mean the agent is waiting for human input
                this._agentRun.Status = 'AwaitingFeedback';
            }
            else {
                this._agentRun.Status = 'Completed';
            }

            // Serialize the (largest-it-ever-gets) final payload ONCE and reuse for both
            // Result and FinalPayload instead of stringifying the same object three times.
            const finalPayloadJson = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            this._agentRun.Result = finalPayloadJson;
            this._agentRun.FinalStep = finalStep.step;
            this._agentRun.Message = finalStep.message;

            // Set the FinalPayloadObject (populates the object cache; its setter also writes
            // FinalPayload when the value changes). We then assign FinalPayload from the
            // already-computed JSON to guarantee it's set regardless of the setter's change guard.
            this._agentRun.FinalPayloadObject = resolvedPayload;
            this._agentRun.FinalPayload = finalPayloadJson;
            
            // Calculate total tokens from all prompts and sub-agents
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
            this._agentRun.TotalCacheReadTokensUsed = tokenStats.cacheReadTokens;
            this._agentRun.TotalCacheWriteTokensUsed = tokenStats.cacheWriteTokens;
            this._agentRun.TotalCost = tokenStats.totalCost;
            
            const ok = await this._agentRun.Save();
            if (!ok) {
                LogError(`Failed to finalize agent run ${this._agentRun.ID}`);
            }
        }
        
        // Also promote any media from the final step's promoteMediaOutputs
        if (finalStep.promoteMediaOutputs && finalStep.promoteMediaOutputs.length > 0) {
            this.promoteMediaOutputs(finalStep.promoteMediaOutputs);
        }

        // Return unified media outputs — all items are persisted by AgentRunner.
        // Sub-agents pass their mediaOutputs to parent for merging and placeholder resolution.
        return {
            success: finalStep.step === 'Success' || finalStep.step === 'Chat',
            payload: resolvedPayload,
            agentRun: this._agentRun!,
            responseForm: finalStep.responseForm,
            actionableCommands: resolvedActionableCommands,
            automaticCommands: finalStep.automaticCommands,
            memoryContext: this._injectedMemory.notes.length > 0 || this._injectedMemory.examples.length > 0
                ? this._injectedMemory
                : undefined,
            mediaOutputs: this._mediaOutputs.length > 0 ? this._mediaOutputs : undefined,
            fileOutputs: this._fileOutputs.length > 0 ? this._fileOutputs : undefined,
            feedbackRequestId: this._feedbackRequestId || undefined,
            resolvedStorageAccountId: this._resolvedStorageAccountId || undefined
        };
    }


    /**
     * Calculate total token statistics from the agent run's persisted steps.
     * 
     * @returns Token statistics including totals and costs
     * @private
     */
    private calculateTokenStats(): { totalTokens: number; promptTokens: number; completionTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalCost: number } {
        let totalTokens = 0;
        let promptTokens = 0;
        let completionTokens = 0;
        let cacheReadTokens = 0;
        let cacheWriteTokens = 0;
        let totalCost = 0;

        // Iterate through the agent run's steps to sum up tokens
        if (this._agentRun?.Steps) {
            for (const step of this._agentRun.Steps) {
                if (step.StepType === 'Prompt' && step.PromptRun) {
                    // Add tokens from prompt runs (rollup fields include any nested child prompt runs)
                    totalTokens += step.PromptRun.TokensUsedRollup || 0;
                    promptTokens += step.PromptRun.TokensPromptRollup || 0;
                    completionTokens += step.PromptRun.TokensCompletionRollup || 0;
                    cacheReadTokens += step.PromptRun.TokensCacheReadRollup || 0;
                    cacheWriteTokens += step.PromptRun.TokensCacheWriteRollup || 0;
                    totalCost += step.PromptRun.TotalCost || 0;
                } else if (step.StepType === 'Sub-Agent' && step.SubAgentRun) {
                    // Add tokens from sub-agent runs (these should already be calculated recursively)
                    totalTokens += step.SubAgentRun.TotalTokensUsed || 0;
                    promptTokens += step.SubAgentRun.TotalPromptTokensUsed || 0;
                    completionTokens += step.SubAgentRun.TotalCompletionTokensUsed || 0;
                    cacheReadTokens += step.SubAgentRun.TotalCacheReadTokensUsed || 0;
                    cacheWriteTokens += step.SubAgentRun.TotalCacheWriteTokensUsed || 0;
                    totalCost += step.SubAgentRun.TotalCost || 0;
                }
            }
        }

        return { totalTokens, promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens, totalCost };
    }

    /**
     * Gets the count of how many times a specific action has been executed in this agent run.
     * 
     * @param agentRunId - The agent run ID (not used anymore, kept for signature compatibility)
     * @param actionId - The action ID to count
     * @returns The number of times the action has been executed
     */
    protected async getActionExecutionCount(agentRunId: string, actionId: string): Promise<number> {
        return this.getExecutionCount(actionId);
    }

    /**
     * Gets the count of how many times a specific sub-agent has been executed in this agent run.
     * 
     * @param agentRunId - The agent run ID (not used anymore, kept for signature compatibility)
     * @param subAgentId - The sub-agent ID to count
     * @returns The number of times the sub-agent has been executed
     */
    protected async getSubAgentExecutionCount(agentRunId: string, subAgentId: string): Promise<number> {
        return this.getExecutionCount(subAgentId);
    }

    /**
     * Increments the execution count for an item (action or sub-agent).
     *
     * Exposed as `protected` so driver sub-classes performing custom dispatch
     * bump the same per-item counter the framework checks against execution
     * guardrails — without this, custom dispatch silently bypasses limits.
     *
     * @param itemId - The item ID to increment (action ID or sub-agent ID)
     * @protected
     */
    protected incrementExecutionCount(itemId: string): void {
        const currentCount = this._executionCounts.get(itemId) || 0;
        this._executionCounts.set(itemId, currentCount + 1);
    }

    /**
     * Gets the execution count for an item (action or sub-agent).
     *
     * @param itemId - The item ID to get count for
     * @returns The execution count (0 if never executed)
     * @protected
     */
    protected getExecutionCount(itemId: string): number {
        return this._executionCounts.get(itemId) || 0;
    }

    /**
     * Checks if all minimum execution requirements are met for actions and sub-agents.
     *
     * NOTE: This method intentionally uses only database-configured AgentActions, not _effectiveActions.
     * MinExecutionsPerRun is a database-only concept - dynamically added actions via actionChanges
     * do not have minimum execution requirements. If minimum requirements for dynamic actions are
     * needed in the future, consider adding a `minActionLimits` property to the ActionChange interface.
     *
     * @param agent - The agent to check
     * @param agentRun - The current agent run
     * @returns Array of violation messages (empty if all requirements are met)
     */
    protected async checkMinimumExecutionRequirements(agent: MJAIAgentEntityExtended, agentRun: MJAIAgentRunEntityExtended): Promise<string[]> {
        const violations: string[] = [];

        // Check action minimum requirements from database-configured actions only.
        // Dynamically added actions do not have MinExecutionsPerRun requirements.
        const agentActions = AIEngine.Instance.AgentActions.filter(aa =>
            UUIDsEqual(aa.AgentID, agent.ID) &&
            aa.Status === 'Active' &&
            aa.MinExecutionsPerRun != null &&
            aa.MinExecutionsPerRun > 0
        );
        
        for (const agentAction of agentActions) {
            const executionCount = await this.getActionExecutionCount(agentRun.ID, agentAction.ActionID);
            if (executionCount < agentAction.MinExecutionsPerRun) {
                violations.push(`Action '${agentAction.Action}' requires ${agentAction.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`);
            }
        }
        
        // Check sub-agent minimum requirements
        const subAgents = AIEngine.Instance.GetSubAgents(agent.ID, "Active").filter(a => 
            a.MinExecutionsPerRun != null && 
            a.MinExecutionsPerRun > 0
        );

        for (const subAgent of subAgents) {
            const executionCount = await this.getSubAgentExecutionCount(agentRun.ID, subAgent.ID);
            if (executionCount < subAgent.MinExecutionsPerRun) {
                violations.push(`Sub-agent '${subAgent.Name}' requires ${subAgent.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`);
            }
        }
        
        return violations;
    }

    /**
     * Prunes and compacts expired messages in the conversation based on configured expiration rules.
     * Processes messages in three phases: identification, compaction, and removal.
     *
     * @param params - Agent execution parameters containing conversation messages
     * @param currentTurn - Current turn number in the agent execution
     * @protected
     */
    protected async pruneAndCompactExpiredMessages(
        params: ExecuteAgentParams,
        currentTurn: number
    ): Promise<void> {
        const messagesToCompact: Array<{
            index: number;
            message: AgentChatMessage;
            metadata: {
                compactMode: 'First N Chars' | 'AI Summary';
                compactLength: number;
                compactPromptId: string;
                originalLength: number;
            };
        }> = [];
        const messagesToRemove: number[] = [];

        // Phase 1: Identify expired messages
        for (let i = 0; i < params.conversationMessages.length; i++) {
            const msg = params.conversationMessages[i] as AgentChatMessage;

            // Skip messages without expiration metadata
            if (!msg.metadata?.expirationTurns && msg.metadata?.expirationTurns !== 0) {
                continue;
            }

            // Skip if expiration mode is None
            if (msg.metadata.expirationMode === 'None') {
                continue;
            }

            // Calculate age in turns
            const turnAdded = msg.metadata.turnAdded || 0;
            const turnsAlive = currentTurn - turnAdded;

            // Check if expired
            if (turnsAlive > msg.metadata.expirationTurns) {
                msg.metadata.isExpired = true;

                if (msg.metadata.expirationMode === 'Remove') {
                    messagesToRemove.push(i);

                    this.emitMessageLifecycleEvent({
                        type: 'message-expired',
                        turn: currentTurn,
                        messageIndex: i,
                        message: msg,
                        reason: `Expired after ${turnsAlive} turns (limit: ${msg.metadata.expirationTurns})`
                    });
                } else if (msg.metadata.expirationMode === 'Compact') {
                    // Ensure we have compact config
                    if (msg.metadata.compactMode) {
                        messagesToCompact.push({
                            index: i,
                            message: msg,
                            metadata: {
                                compactMode: msg.metadata.compactMode,
                                compactLength: msg.metadata.compactLength || 500,
                                compactPromptId: msg.metadata.compactPromptId || '',
                                originalLength: typeof msg.content === 'string'
                                    ? msg.content.length
                                    : JSON.stringify(msg.content).length
                            }
                        });
                    }
                }
            }
        }

        // Phase 2: Compact messages (may involve async LLM calls)
        const preserveOriginal = params.messageExpirationOverride?.preserveOriginalContent !== false;

        for (const item of messagesToCompact) {
            const originalContent = item.message.content;
            const compacted = await this.compactMessage(
                item.message,
                item.metadata,
                params
            );

            // Calculate token savings
            const originalTokens = this.estimateTokens(originalContent);
            const compactedTokens = this.estimateTokens(compacted);
            const tokensSaved = originalTokens - compactedTokens;

            // Update message in place
            params.conversationMessages[item.index] = {
                ...item.message,
                content: compacted,
                metadata: {
                    ...item.message.metadata,
                    wasCompacted: true,
                    originalContent: preserveOriginal ? originalContent : undefined,
                    originalLength: item.metadata.originalLength,
                    tokensSaved,
                    canExpand: preserveOriginal
                }
            };

            this.emitMessageLifecycleEvent({
                type: 'message-compacted',
                turn: currentTurn,
                messageIndex: item.index,
                message: params.conversationMessages[item.index] as AgentChatMessage,
                reason: `Compacted using ${item.metadata.compactMode} (saved ${tokensSaved} tokens)`,
                tokensSaved
            });
        }

        // Phase 3: Remove expired messages (reverse order to preserve indices)
        for (let i = messagesToRemove.length - 1; i >= 0; i--) {
            const index = messagesToRemove[i];
            const removed = params.conversationMessages.splice(index, 1)[0];

            this.emitMessageLifecycleEvent({
                type: 'message-removed',
                turn: currentTurn,
                messageIndex: index,
                message: removed as AgentChatMessage,
                reason: 'Removed due to expiration'
            });
        }

        // Log summary if verbose
        if (params.verbose && (messagesToCompact.length > 0 || messagesToRemove.length > 0)) {
            const totalSaved = messagesToCompact.reduce((sum, item) => {
                const msg = params.conversationMessages[item.index] as AgentChatMessage;
                return sum + (msg.metadata?.tokensSaved || 0);
            }, 0);

            console.log(`[Turn ${currentTurn}] Message pruning: ` +
                `${messagesToCompact.length} compacted (saved ~${totalSaved} tokens), ` +
                `${messagesToRemove.length} removed`);
        }
    }

    /**
     * Creates an AIAgentRunStep for message compaction operations.
     * Records the compaction attempt with context about the message being compacted.
     *
     * @param prompt - The AI prompt used for compaction
     * @param message - The message being compacted
     * @param params - Agent execution parameters
     * @returns The created run step entity
     * @protected
     */
    protected async createCompactionStep(
        prompt: MJAIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        if (!this._agentRun) {
            throw new Error('Cannot create compaction step: agent run not initialized');
        }

        const step = await (params.provider || this._activeProvider).GetEntityObject<MJAIAgentRunStepEntityExtended>(
            'MJ: AI Agent Run Steps',
            params.contextUser
        );

        step.NewRecord();
        step.AgentRunID = this._agentRun.ID;
        step.StepType = 'Prompt';
        step.Status = 'Running';
        step.InputData = JSON.stringify({
            stepName: 'Message Compaction',
            description: `Compacting message using AI Summary (${message.metadata?.messageType || 'unknown'} from turn ${message.metadata?.turnAdded || 0})`,
            messageType: message.metadata?.messageType,
            turnAdded: message.metadata?.turnAdded,
            originalLength: message.metadata?.originalLength ||
                (typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length),
            compactMode: 'AI Summary',
            promptId: prompt.ID,
            promptName: prompt.Name
        });

        await step.Save();
        return step;
    }

    /**
     * Updates the compaction step with execution results and token usage.
     *
     * @param step - The run step to update
     * @param result - The prompt execution result
     * @param message - The message that was compacted
     * @param params - Agent execution parameters
     * @protected
     */
    protected async updateCompactionStep(
        step: MJAIAgentRunStepEntityExtended,
        result: AIPromptRunResult<{ summary: string }>,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<void> {
        step.Status = result.success ? 'Completed' : 'Failed';
        const promptTokens = result.promptTokens || 0;
        const completionTokens = result.completionTokens || 0;
        step.OutputData = JSON.stringify({
            success: result.success,
            summaryLength: result.result?.summary?.length || 0,
            tokensSaved: message.metadata?.tokensSaved || 0,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            cost: result.cost
        });

        if (!result.success) {
            step.ErrorMessage = result.errorMessage || 'AI Summary compaction failed';
        }

        await step.Save();
    }

    /**
     * Compacts a message using configured compaction mode.
     *
     * @param message - The message to compact
     * @param metadata - Compaction configuration
     * @param params - Agent execution parameters for context
     * @returns Compacted content string
     * @protected
     */
    protected async compactMessage(
        message: AgentChatMessage,
        metadata: {
            compactMode: 'First N Chars' | 'AI Summary';
            compactLength: number;
            compactPromptId: string;
            originalLength: number;
        },
        params: ExecuteAgentParams
    ): Promise<string> {
        const originalContent = typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);

        switch (metadata.compactMode) {
            case 'First N Chars': {
                const length = metadata.compactLength;

                if (originalContent.length <= length) {
                    return originalContent; // Already short enough
                }

                const truncated = originalContent.substring(0, length);
                return `${truncated}...\n\n[Compacted: showing first ${length} of ${originalContent.length} characters. Agent can request expansion if needed.]`;
            }

            case 'AI Summary': {
                try {
                    // Get prompt for summarization with lookup hierarchy:
                    // 1. Runtime override (metadata.compactPromptId from messageExpirationOverride)
                    // 2. AIAgentAction.CompactPromptID
                    // 3. Action.DefaultCompactPromptID
                    // 4. System default compact prompt
                    const promptId = metadata.compactPromptId || this.getSystemDefaultCompactPromptId();
                    const prompt = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, promptId));

                    if (!prompt) {
                        // Fallback to First N Chars if prompt not found
                        console.warn(`Compact prompt ${promptId} not found, falling back to First N Chars`);
                        return this.compactMessage(message,
                            { ...metadata, compactMode: 'First N Chars' },
                            params
                        );
                    }

                    // Create tracking step for this compaction
                    const step = await this.createCompactionStep(prompt, message, params);

                    // Execute summarization prompt
                    const promptParams = new AIPromptParams();
                    promptParams.prompt = prompt;
                    promptParams.data = {
                        originalContent,
                        originalLength: metadata.originalLength,
                        targetLength: metadata.compactLength || 500,
                        messageType: message.metadata?.messageType || 'unknown',
                        turnAdded: message.metadata?.turnAdded || 0
                    };
                    promptParams.contextUser = params.contextUser;

                    const runner = new AIPromptRunner();
                    const result = await runner.ExecutePrompt<{ summary: string }>(promptParams);

                    // Update step with result
                    await this.updateCompactionStep(step, result, message, params);

                    if (!result.success || !result.result?.summary) {
                        // Fallback to First N Chars on failure
                        console.warn('AI summary failed, falling back to First N Chars');
                        return this.compactMessage(message,
                            { ...metadata, compactMode: 'First N Chars' },
                            params
                        );
                    }

                    return `[AI Summary of ${metadata.originalLength} chars. Agent can request full expansion if needed.]\n\n${result.result.summary}`;

                } catch (error) {
                    console.error('Error during AI summary:', error);
                    // Fallback to First N Chars
                    return this.compactMessage(message,
                        { ...metadata, compactMode: 'First N Chars' },
                        params
                    );
                }
            }

            default:
                return originalContent;
        }
    }

    /**
     * Returns the system default prompt ID for message compaction.
     * Looks up the "Compact Agent Message" prompt by name.
     * @protected
     */
    protected getSystemDefaultCompactPromptId(): string {
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Compact Agent Message');
        if (!prompt) {
            console.warn('System default compact prompt not found. Ensure "Compact Agent Message" prompt exists.');
            return '';
        }
        return prompt.ID;
    }

    /**
     * Estimates token count from content.
     * Uses js-tiktoken for accurate counting when available and model info is provided,
     * falls back to improved heuristic otherwise.
     * @param content - The message content to estimate tokens for
     * @param modelName - Optional model name for accurate tokenization
     * @protected
     */
    /**
     * Returns true if the message is a tool result (action or client tool).
     * Used by recovery strategies to identify compactable result messages.
     */
    protected IsToolResultMessage(msg: ChatMessage): boolean {
        const messageType = (msg as AgentChatMessage).metadata?.messageType;
        return messageType === 'action-result'
            || messageType === 'client-tool-result'
            || messageType === 'tool-result';
    }

    protected estimateTokens(content: ChatMessage['content'], modelName?: string): number {
        const text = typeof content === 'string'
            ? content
            : JSON.stringify(content);

        // Use heuristic token estimation (fast, good enough for context management)
        // Avoids heavy tokenizer dependencies while providing ~10-20% accuracy
        return this.heuristicTokenCount(text);
    }

    /**
     * Provides an improved heuristic token count when tokenizer is unavailable.
     * @param text - The text to estimate tokens for
     * @returns Estimated token count
     * @private
     */
    private heuristicTokenCount(text: string): number {
        // More sophisticated heuristic
        const charCount = text.length;

        // Count structural tokens (JSON syntax adds overhead)
        const structuralChars = (text.match(/[\{\}\[\],:]/g) || []).length;
        const whitespaceChars = (text.match(/\s/g) || []).length;

        // Effective character count (whitespace counts less)
        const effectiveChars = charCount - (whitespaceChars * 0.5);

        // Base ratio: 4 chars per token
        // Adjustment: +0.05 token for every structural char
        const baseTokens = effectiveChars / 4;
        const structuralTokens = structuralChars * 0.05;

        return Math.ceil(baseTokens + structuralTokens);
    }

    /**
     * Gets the context limit for the current model.
     * Uses model selection info from the prompt result to determine the actual model's MaxInputTokens.
     * @param modelSelectionInfo - Model selection information from the prompt execution
     * @returns The maximum input tokens for the model
     * @protected
     */
    protected getModelContextLimit(modelSelectionInfo?: AIModelSelectionInfo): number {
        // Default conservative limit if we can't determine the actual limit
        const DEFAULT_LIMIT = 8000;

        if (!modelSelectionInfo) {
            this.logStatus(`No model selection info available, using default limit: ${DEFAULT_LIMIT}`, true);
            return DEFAULT_LIMIT;
        }

        try {
            // Get the selected model and vendor from the model selection info
            const modelSelected = modelSelectionInfo.modelSelected;
            const vendorSelected = modelSelectionInfo.vendorSelected;

            if (!modelSelected) {
                this.logStatus(`No model selected in model selection info, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            // If no vendor selected, can't determine model-specific limit
            if (!vendorSelected) {
                this.logStatus(`No vendor selected, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            // Find the ModelVendor entry that matches the selected vendor
            const modelVendors = modelSelected.ModelVendors;
            if (!modelVendors || modelVendors.length === 0) {
                this.logStatus(`No ModelVendors array found on model, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            // Find the vendor-specific entry
            const vendorEntry = modelVendors.find((mv: any) => UUIDsEqual(mv.VendorID, vendorSelected.ID));
            if (!vendorEntry) {
                this.logStatus(`No matching vendor entry found in ModelVendors, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            // Get MaxInputTokens from the vendor-specific entry
            const maxInputTokens = vendorEntry.MaxInputTokens;
            if (!maxInputTokens || maxInputTokens <= 0) {
                this.logStatus(`MaxInputTokens not set or invalid on vendor entry, using default limit: ${DEFAULT_LIMIT}`, true);
                return DEFAULT_LIMIT;
            }

            this.logStatus(`Using vendor-specific MaxInputTokens: ${maxInputTokens} (Model: ${modelSelected.Name}, Vendor: ${vendorSelected.Name})`, true);
            return maxInputTokens;

        } catch (error) {
            this.logStatus(`Error extracting model context limit: ${error}, using default limit: ${DEFAULT_LIMIT}`, true);
            return DEFAULT_LIMIT;
        }
    }

    /**
     * Estimates total token count across all conversation messages.
     * @param messages - Message array to estimate
     * @returns Total estimated tokens
     * @protected
     */
    protected estimateConversationTokens(messages: ChatMessage[]): number {
        return messages.reduce((total, msg) => {
            return total + this.estimateTokens(msg.content);
        }, 0);
    }

    /**
     * Emits message lifecycle event if callback is registered.
     * @protected
     */
    protected emitMessageLifecycleEvent(event: MessageLifecycleEvent): void {
        if (this._messageLifecycleCallback) {
            this._messageLifecycleCallback(event);
        }
    }

    /**
     * Expands a previously compacted message to its original content.
     *
     * @param request - The expand message request
     * @param params - Agent execution parameters
     * @param currentTurn - Current turn number
     * @protected
     */
    protected executeExpandMessageStep(
        request: BaseAgentNextStep,
        params: ExecuteAgentParams,
        currentTurn: number
    ): void {
        const messageIndex = request.messageIndex;
        const reason = request.expandReason;

        if (messageIndex === undefined || messageIndex < 0 || messageIndex >= params.conversationMessages.length) {
            console.warn(`Cannot expand message: index ${messageIndex} out of bounds`);
            return;
        }

        const message = params.conversationMessages[messageIndex] as AgentChatMessage;

        if (!message.metadata?.canExpand || !message.metadata?.originalContent) {
            console.warn(`Cannot expand message at index ${messageIndex}: not expandable or no original content`);
            return;
        }

        // Restore original content
        message.content = message.metadata.originalContent;
        message.metadata.wasCompacted = false;
        message.metadata.canExpand = false;
        delete message.metadata.originalContent;

        // Emit lifecycle event
        this.emitMessageLifecycleEvent({
            type: 'message-expanded',
            turn: currentTurn,
            messageIndex,
            message,
            reason: reason || 'Agent requested expansion'
        });

        if (params.verbose) {
            console.log(`[Turn ${currentTurn}] Expanded message at index ${messageIndex}`);
        }
    }

    /**
     * Generic template resolver for loop iterations - extracts from LoopAgentType to make available to all agent types
     * Resolves templates like {{item.field}}, {{index}}, etc. in action parameters and sub-agent payloads
     */
    protected resolveTemplates(
        obj: Record<string, unknown>,
        context: Record<string, any>,
        itemVariable: string
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.resolveValueFromContext(value, context, itemVariable);
            } else if (Array.isArray(value)) {
                result[key] = value.map(v =>
                    typeof v === 'string' ? this.resolveValueFromContext(v, context, itemVariable) : v
                );
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.resolveTemplates(value as Record<string, unknown>, context, itemVariable);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Resolves a value from context using variable references - extracts from LoopAgentType
     *
     * This method handles both scalar and complex object iterations in ForEach/While loops.
     *
     * Examples:
     *
     * Scalar array iteration:
     *   candidateEntities = ["Users", "Companies", "Invoices"]
     *   itemVariable = "entityName"
     *   Template: "{{entityName}}" → resolves to "Users", then "Companies", then "Invoices"
     *
     * Object array iteration:
     *   users = [{name: "Alice", age: 30}, {name: "Bob", age: 25}]
     *   itemVariable = "user"
     *   Template: "{{user.name}}" → resolves to "Alice", then "Bob"
     *   Template: "{{user}}" → resolves to entire object {name: "Alice", age: 30}
     */
    protected resolveValueFromContext(value: string, context: Record<string, any>, itemVariable: string): any {
        // check to see if value is wrapped in a nunjucks style template like {{variable}} and
        // if so, remove that wrapping to get the actual variable name.
        // we only do this if the string starts and ends with the {{ }} pattern
        // and we trim whitespace first
        const trimmedValue = value.trim();
        if (trimmedValue.startsWith('{{') && trimmedValue.endsWith('}}')) {
            // Single-variable case: "{{city.name}}" — strip wrappers, fall through to
            // single-variable resolution below which can return non-string types (objects, numbers)
            value = trimmedValue.substring(2, trimmedValue.length - 2).trim();
        } else if (trimmedValue.includes('{{')) {
            // Inline template interpolation: "text {{var.prop}} more {{var2.field}}"
            // The string contains embedded {{}} expressions mixed with literal text.
            // Each expression is resolved individually and stringified back into the template.
            return this.resolveInlineTemplateExpressions(trimmedValue, context, itemVariable);
        }

        // Check itemVariable reference (the custom loop variable name like "entityName" or "user")
        // This handles both direct references and path-based property access
        const ivToLower = itemVariable?.trim().toLowerCase();
        const valueLower = value?.toLowerCase();

        // CRITICAL: Check for exact match FIRST (handles scalar arrays and direct object references)
        // Example: {{entityName}} where context.item = "Users" (scalar)
        // Example: {{user}} where context.item = {name: "Alice", age: 30} (object)
        if (valueLower === ivToLower) {
            return context.item;  // Return the current iteration item (scalar or object)
        }

        // Check for path notation (handles property access on object arrays)
        // Example: {{entityName.property}} - won't work for scalars but handles objects
        // Example: {{user.name}} where context.item = {name: "Alice"} → returns "Alice"
        if (valueLower?.startsWith(`${ivToLower}.`)) {
            const path = value.substring(ivToLower.length + 1);
            return this.getValueFromPath(context.item, path);
        }

        // Check for direct context variable references (index, payload, data, etc.)
        // These are the fixed context properties set up by the loop execution
        for (const [varName, varValue] of Object.entries(context)) {
            if (value === varName) {
                return varValue;
            }

            if (value?.trim().toLowerCase().startsWith(`${varName}.`)) {
                const path = value.substring(varName.length + 1);
                return this.getValueFromPath(varValue, path);
            }
        }

        // Static value - no variable reference found, return as literal string
        return value;
    }

    /**
     * Resolves multiple {{expression}} placeholders embedded within a literal string.
     *
     * Unlike the single-variable path (which can return objects/numbers), this always
     * returns a string because the resolved values are interpolated back into surrounding text.
     *
     * @example
     * // Given itemVariable="cityInfo", context.item={city:"Tokyo", country:"Japan"}
     * resolveInlineTemplateExpressions(
     *   "largest company in {{cityInfo.city}} {{cityInfo.country}}",
     *   context, "cityInfo"
     * )
     * // → "largest company in Tokyo Japan"
     */
    protected resolveInlineTemplateExpressions(
        template: string,
        context: Record<string, any>,
        itemVariable: string
    ): string {
        const expressionPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
        return template.replace(expressionPattern, (_match: string, expr: string) => {
            // Resolve each expression using the single-variable path (without {{ }} wrappers)
            const resolved = this.resolveValueFromContext(expr.trim(), context, itemVariable);
            // If the expression didn't resolve (returned unchanged), keep original {{ }} for transparency
            if (resolved === expr.trim()) {
                return _match;
            }
            return String(resolved ?? '');
        });
    }

    /**
     * Helper to get value from nested object path - extracts from LoopAgentType
     */
    protected getValueFromPath(obj: any, path: string): unknown {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (!part) continue;

            // Check for array indexing
            const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);

            if (arrayMatch) {
                const arrayName = arrayMatch[1];
                const index = parseInt(arrayMatch[2], 10);

                if (current && typeof current === 'object' && arrayName in current) {
                    current = current[arrayName];

                    if (Array.isArray(current) && index >= 0 && index < current.length) {
                        current = current[index];
                    } else {
                        return undefined;
                    }
                } else {
                    return undefined;
                }
            } else {
                // Regular property access
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return undefined;
                }
            }
        }

        return current;
    }

    /**
     * Parse the agent's SecondaryScopeConfig from the ScopeConfig field.
     * Returns null if not configured or invalid JSON.
     *
     * @param agent - The agent entity
     * @returns Parsed SecondaryScopeConfig or null
     */
    private parseSecondaryScopeConfig(agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null {
        const configJson = agent.ScopeConfig;
        if (!configJson) {
            return null;
        }

        try {
            return JSON.parse(configJson) as SecondaryScopeConfig;
        } catch (e) {
            LogError(`Failed to parse SecondaryScopeConfig for agent "${agent.Name}": ${e}`);
            return null;
        }
    }

    /**
     * Validate runtime secondary scopes against the agent's SecondaryScopeConfig and apply defaults.
     *
     * - Checks required dimensions are present (or have defaults)
     * - Applies default values for missing optional dimensions
     * - Warns about extra dimensions if strictValidation is enabled
     *
     * @param secondary - Runtime secondary scope values from ExecuteAgentParams.SecondaryScopes
     * @param scopeConfig - The agent's scope configuration
     * @param agentName - Agent name for logging
     * @returns Validated and enriched secondary scopes
     */
    private validateAndApplySecondaryScopes(
        secondary: Record<string, SecondaryScopeValue> | undefined,
        scopeConfig: SecondaryScopeConfig | null,
        agentName: string
    ): Record<string, SecondaryScopeValue> | undefined {
        if (!scopeConfig) {
            return secondary;
        }

        const result: Record<string, SecondaryScopeValue> = { ...(secondary || {}) };

        // Build set of defined dimension names
        const definedDimensions = new Set<string>();
        if (scopeConfig.dimensions) {
            for (const dim of scopeConfig.dimensions) {
                definedDimensions.add(dim.name);

                // Check required dimensions
                if (dim.required) {
                    if (!(dim.name in result)) {
                        if (dim.defaultValue != null) {
                            // Apply default for required dimension
                            result[dim.name] = dim.defaultValue;
                        } else {
                            LogError(
                                `Scoping: Required dimension "${dim.name}" not provided for agent "${agentName}" ` +
                                `and no defaultValue is configured.`
                            );
                        }
                    }
                } else {
                    // Apply defaults for optional dimensions if not provided
                    if (!(dim.name in result) && dim.defaultValue != null) {
                        result[dim.name] = dim.defaultValue;
                    }
                }
            }
        }

        // Check for extra dimensions if strictValidation is enabled
        if (scopeConfig.strictValidation && secondary) {
            for (const key of Object.keys(secondary)) {
                if (!definedDimensions.has(key)) {
                    LogError(
                        `Scoping: Unknown dimension "${key}" provided for agent "${agentName}". ` +
                        `Agent's SecondaryScopeConfig has strictValidation enabled.`
                    );
                }
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
}

