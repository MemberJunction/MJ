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

import { AIAgentTypeEntity,  TemplateParamEntity, ActionParamEntity, AIAgentRelationshipEntity, AIAgentNoteEntity, AIAgentExampleEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { AIAgentRunEntityExtended, AIAgentRunStepEntityExtended, AIPromptEntityExtended, AIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { UserInfo, Metadata, RunView, LogStatus, LogStatusEx, LogError, LogErrorEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ChatMessage, ChatMessageContent, ChatMessageContentBlock, AIErrorType } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { CopyScalarsAndArrays, JSONValidator } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AgentContextInjector } from './agent-context-injector';
import { RerankerService } from '@memberjunction/ai-reranker';
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
    MediaOutput
} from '@memberjunction/ai-core-plus';
import { ActionEntityExtended, ActionResult, ActionParam } from '@memberjunction/actions-base';
import { AgentRunner } from './AgentRunner';
import { PayloadManager, PayloadManagerResult, PayloadChangeResultSummary } from './PayloadManager';
import { AgentPayloadChangeRequest } from '@memberjunction/ai-core-plus';
import { AgentDataPreloader } from './AgentDataPreloader';
import { ConversationMessageResolver } from './utils/ConversationMessageResolver';
import { ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';
import * as _ from 'lodash';

/**
 * Base iteration context for tracking loop execution in BaseAgent.
 * This is agent-type agnostic and handles both ForEach and While loops.
 */
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
export class BaseAgent {
    /**
     * Maximum allowed validation retries before forcing failure.
     * @private
     */
    private static readonly MAX_VALIDATION_RETRIES = 10;

    /**
     * Instance of AIPromptRunner used for executing hierarchical prompts.
     * @private
     */
    private _promptRunner: AIPromptRunner = new AIPromptRunner();

    /**
     * Metadata instance for creating entity objects.
     * @private
     */
    private _metadata: Metadata = new Metadata();

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
    private _agentRun: AIAgentRunEntityExtended | null = null;

    /**
     * Access the current run for the agent
     */
    public get AgentRun(): AIAgentRunEntityExtended | null {
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
     * Intercepts large media content in action results and replaces with placeholder references.
     * This prevents context overflow when action results contain large base64 data (images, audio, video).
     *
     * Uses generic ValueType=MediaOutput detection from action metadata to identify media output params.
     * Intercepted media is stored in _mediaOutputs with refId and persist=false (not saved unless used).
     *
     * @param actionParams - The output parameters from an action result
     * @param actionEntity - Optional action entity metadata for ValueType checking
     * @returns Sanitized parameters with large media content replaced by ${media:ref-id} placeholders
     * @private
     * @since 3.1.0
     */
    private interceptLargeBinaryContent(actionParams: ActionParam[], actionEntity?: ActionEntityExtended): ActionParam[] {
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

                        // Store in unified media outputs with persist=false (won't be saved unless placeholder is used)
                        this._mediaOutputs.push({
                            ...media,
                            refId,
                            persist: false  // Not persisted unless placeholder is resolved in final output
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
                            note: `${extractedCount} media item(s) extracted. Use placeholder syntax in your response: <img src="${references[0]}" alt="description" />`
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

                    // Store in unified media outputs with persist=false
                    this._mediaOutputs.push({
                        modality: 'Image', // Default to image, could be enhanced with mime detection
                        mimeType: 'application/octet-stream',
                        data: param.Value,
                        label: `Media data from ${param.Name}`,
                        refId,
                        persist: false
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
     * Resolves media placeholders in a string.
     * Replaces ${media:ref-id} with actual data URIs (data:mime;base64,...).
     * Sets persist=true on resolved media so it will be saved to AIAgentRunMedia.
     *
     * @param text - The string that may contain media placeholders
     * @returns String with placeholders resolved to actual data URIs
     * @private
     * @since 3.1.0
     */
    private resolveMediaPlaceholdersInString(text: string): string {
        // Check if any media has a refId (meaning we have intercepted media to resolve)
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!text || !hasRefIds) {
            return text;
        }

        // Match ${media:ref-id} pattern
        const placeholderRegex = /\$\{media:([a-z0-9-]+)\}/g;

        return text.replace(placeholderRegex, (match, refId: string) => {
            const media = this._mediaOutputs.find(m => m.refId === refId);
            if (media?.data) {
                // Mark for persistence since it's being used in final output
                media.persist = true;
                return `data:${media.mimeType};base64,${media.data}`;
            }
            // Keep placeholder if not found (shouldn't happen in normal flow)
            this.logStatus(`⚠️ Media reference '${refId}' not found in registry`, true);
            return match;
        });
    }

    /**
     * Resolves media placeholders in a payload of any type.
     * - For strings: resolves placeholders directly
     * - For objects: recursively processes all string properties
     * - For arrays: recursively processes all elements
     *
     * @param payload - The payload that may contain media placeholders in string values
     * @returns Payload with all placeholders resolved to actual data URIs
     * @private
     * @since 3.1.0
     */
    private resolveMediaPlaceholdersInPayload<T>(payload: T): T {
        // Check if any media has a refId (meaning we have intercepted media to resolve)
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!hasRefIds) {
            return payload;
        }

        // Count how many media items have persist=false before resolution
        const unpersisted = this._mediaOutputs.filter(m => m.refId && m.persist === false).length;
        const resolved = this.resolveMediaPlaceholdersRecursive(payload);
        // Count how many were marked for persistence (persist changed from false to true)
        const persistedAfter = this._mediaOutputs.filter(m => m.refId && m.persist === true).length;
        const resolvedCount = persistedAfter - (unpersisted - this._mediaOutputs.filter(m => m.refId && m.persist === false).length);

        if (resolvedCount > 0) {
            this.logStatus(`✅ Resolved ${resolvedCount} media placeholder(s) in final payload`, true);
        }

        return resolved;
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
     * Processes media placeholders in agent messages for conversational agents.
     *
     * Unlike artifact-based agents (which embed images in HTML payload), conversational agents
     * should display images via ConversationDetailAttachment. This method:
     * 1. Detects ${media:xxx} placeholders in the message
     * 2. Sets persist=true on referenced media (triggers save to AIAgentRunMedia)
     * 3. Strips media HTML tags from the message (images display via attachment instead)
     *
     * @param message - The message that may contain media placeholders
     * @returns Cleaned message with media tags stripped
     * @private
     * @since 3.1.0
     */
    private processMessageMediaPlaceholders(message: string): string {
        if (!message) {
            return message;
        }

        // Check if any media has a refId (meaning we have intercepted media)
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!hasRefIds) {
            return message;
        }

        // Find all ${media:xxx} placeholders and mark referenced media for persistence
        const placeholderRegex = /\$\{media:([a-zA-Z0-9_-]+)\}/g;
        let match;
        let promotedCount = 0;

        while ((match = placeholderRegex.exec(message)) !== null) {
            const refId = match[1];
            const media = this._mediaOutputs.find(m => m.refId === refId);
            if (media && media.persist !== true) {
                media.persist = true;  // Triggers save to AIAgentRunMedia
                promotedCount++;
            }
        }

        if (promotedCount > 0) {
            this.logStatus(`📎 Auto-promoted ${promotedCount} media output(s) from message placeholders`, true);
        }

        // Strip <img>, <audio>, <video> tags containing media placeholders
        // The media will display via ConversationDetailAttachment instead
        let cleanedMessage = message
            .replace(/<img[^>]*src=["']\$\{media:[^}]+\}["'][^>]*\/?>/gi, '')
            .replace(/<audio[^>]*src=["']\$\{media:[^}]+\}["'][^>]*>.*?<\/audio>/gi, '')
            .replace(/<video[^>]*src=["']\$\{media:[^}]+\}["'][^>]*>.*?<\/video>/gi, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n')  // Clean up excessive newlines
            .trim();

        return cleanedMessage;
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
     * Payload manager for handling payload access control.
     * @private
     */
    private _payloadManager: PayloadManager = new PayloadManager();

    /**
     * Effective actions available to this agent after applying actionChanges.
     * Populated during gatherPromptTemplateData() and used for validation in executeActionsStep().
     * @private
     * @since 2.123.0
     */
    private _effectiveActions: ActionEntityExtended[] = [];

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
        agent?: AIAgentEntityExtended;
        agentType?: AIAgentTypeEntity;
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

                // Merge with existing data/context/payload (caller values take precedence)
                params.data = {
                    ...preloadedResult.data,
                    ...params.data
                };

                params.context = {
                    ...preloadedResult.context,
                    ...params.context
                };

                params.payload = {
                    ...preloadedResult.payload,
                    ...params.payload
                };
            } else {
                this.logStatus(`📭 No data sources configured for agent '${params.agent.Name}'`, true, params);
            }
        } catch (error) {
            // Log error but don't fail the agent run
            this.logError(`Failed to preload data for agent '${params.agent.Name}': ${error.message}`, {
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
     * @param {AIAgentEntityExtended} params.agent - The agent entity to execute
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
    public async Execute<C = any, R = any>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        try {
            this.logStatus(`🤖 Starting execution of agent '${params.agent.Name}'`, true, params);

            // Check permissions - user must have run permission or be the owner
            const canRun = await AIAgentPermissionHelper.HasPermission(
                params.agent.ID,
                params.contextUser,
                'run'
            );

            if (!canRun) {
                const errorMessage = `User ${params.contextUser.Email} does not have permission to run agent '${params.agent.Name}' (ID: ${params.agent.ID})`;
                this.logStatus(`🚫 ${errorMessage}`, false, params);
                throw new Error(errorMessage);
            }

            // Wrap the progress callback to capture all events
            const wrappedParams = {
                ...params,
                onProgress: this.wrapProgressCallback(params.onProgress)
            };

            // Convert UI markup in conversation messages to plain text if requested (default: true)
            if (params.convertUIMarkupToPlainText !== false) {
                this.convertUIMarkupInMessages(wrappedParams.conversationMessages);
            }

            await this.initializeStartingPayload(wrappedParams);

            // Check for cancellation at start
            if (params.cancellationToken?.aborted) {
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled before start`, true, params);
                return await this.createCancelledResult('Cancelled before execution started', params.contextUser);
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

            // Initialize execution tracking
            await this.initializeAgentRun(wrappedParams);

            // Reset validation retry counters for this run
            this._validationRetryCount = 0;
            this._generalValidationRetryCount = 0;
            this._contextRecoveryAttempts = 0;

            // Reset effective actions and dynamic limits for this run
            this._effectiveActions = [];
            this._dynamicActionLimits = {};

            // Reset media outputs accumulator for this run
            // (unified array now includes both promoted media and intercepted binary with refIds)
            this._mediaOutputs = [];

            // Store message lifecycle callback if provided
            this._messageLifecycleCallback = params.onMessageLifecycle;

            // Initialize engines
            await this.initializeEngines(params.contextUser);

            // Check for cancellation after initialization
            if (params.cancellationToken?.aborted) {
                return await this.createCancelledResult('Cancelled during initialization', params.contextUser);
            }

            // Handle starting payload validation if configured
            const startingValidationResult = await this.handleStartingPayloadValidation(wrappedParams);
            if (startingValidationResult) {
                return startingValidationResult;
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

            // Create and track validation step
            const validationResult = await this.validateAgentWithTracking(params.agent, params.contextUser);
            if (validationResult) return validationResult;

            // Load agent configuration
            this.logStatus(`📋 Loading configuration for agent '${params.agent.Name}'`, true, params);
            const config = await this.loadAgentConfiguration(params.agent);
            if (!config.success) {
                this.logError(`Failed to load agent configuration: ${config.errorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration'
                });
                return await this.createFailureResult(config.errorMessage || 'Failed to load agent configuration', params.contextUser);
            }

            // Preload agent data sources unless disabled
            await this.preloadAgentData(wrappedParams);

            // now initialize the agent type which gets us the instance setup in our class plus also gets the agent type to initialize
            // its state
            await this.initializeAgentType(wrappedParams, config);

            // Inject context memory (notes and examples) before execution
            const userId = params.userId || params.contextUser?.ID;
            const companyId = params.companyId;

            // Extract input text from conversation messages (last user message)
            const lastUserMessage = params.conversationMessages
                .filter(m => m.role === 'user')
                .pop();
            const inputText = lastUserMessage?.content || '';

            // Inject context memory (notes and examples) into conversation messages
            await this.InjectContextMemory(
                typeof inputText === 'string' ? inputText : '',
                params.agent,
                userId,
                companyId,
                params.contextUser,
                wrappedParams.conversationMessages
            );

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
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled: ${error.message}`, true, params);
                return await this.createCancelledResult(error.message || 'Cancelled due to error during execution', params.contextUser);
            }
            this.logError(error, {
                agent: params.agent,
                category: 'AgentExecution',
                severity: 'critical'
            });
            return await this.createFailureResult(error.message, params.contextUser);
        }
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

        while (continueExecution) {
            // Check for cancellation before each step
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            // Prune and compact expired messages before executing the next step
            await this.pruneAndCompactExpiredMessages(params, stepCount);

            // Execute the current step based on previous decision or initial prompt
            this.logStatus(`🔄 Executing step ${stepCount + 1} for agent '${params.agent.Name}'`, true, params);
            const nextStep = await this.executeNextStep<P>(params, config, currentNextStep, stepCount);
            stepCount++;

            // Promote any media outputs from this step to the agent's outputs
            if (nextStep.promoteMediaOutputs && nextStep.promoteMediaOutputs.length > 0) {
                this.promoteMediaOutputs(nextStep.promoteMediaOutputs);
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
        await AIEngine.Instance.Config(false, contextUser);
        await ActionEngineServer.Instance.Config(false, contextUser);
    }

    /**
     * Storage for injected memory context to prepend to prompts
     */
    private _memoryContext: string = '';

    /**
     * Storage for injected notes and examples to include in result
     */
    private _injectedMemory: { notes: AIAgentNoteEntity[]; examples: AIAgentExampleEntity[] } = { notes: [], examples: [] };

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
     * @returns Object containing injected notes and examples
     */
    protected async InjectContextMemory(
        input: string,
        agent: AIAgentEntityExtended,
        userId?: string,
        companyId?: string,
        contextUser?: UserInfo,
        conversationMessages?: ChatMessage[]
    ): Promise<{ notes: AIAgentNoteEntity[]; examples: AIAgentExampleEntity[] }> {
        // Check if injection is enabled
        if (!agent.InjectNotes && !agent.InjectExamples) {
            return { notes: [], examples: [] };
        }

        const injector = new AgentContextInjector();

        // Parse reranker configuration if present
        // Access dynamically since field may not exist until CodeGen runs after migration
        const rerankerConfigJson = agent.Get('RerankerConfiguration') as string | null;
        const rerankerConfig = RerankerService.Instance.parseConfiguration(rerankerConfigJson);

        // Get notes if injection enabled
        const notes = agent.InjectNotes
            ? await injector.GetNotesForContext({
                agentId: agent.ID,
                userId,
                companyId,
                currentInput: input,
                strategy: agent.NoteInjectionStrategy as 'Relevant' | 'Recent' | 'All',
                maxNotes: agent.MaxNotesToInject || 5,
                contextUser: contextUser!,
                rerankerConfig,
                // Pass observability context for run step tracking
                observability: this._agentRun ? {
                    agentRunID: this._agentRun.ID
                } : undefined
            })
            : [];
        this.logStatus(`BaseAgent: Got ${notes.length} notes from injector`, true);

        // Get examples if injection enabled
        const examples = agent.InjectExamples
            ? await injector.GetExamplesForContext({
                agentId: agent.ID,
                userId,
                companyId,
                currentInput: input,
                strategy: agent.ExampleInjectionStrategy as 'Semantic' | 'Recent' | 'Rated',
                maxExamples: agent.MaxExamplesToInject || 3,
                contextUser: contextUser!
            })
            : [];

        // Format and inject memory context into conversation messages
        if ((notes.length > 0 || examples.length > 0) && conversationMessages) {
            const notesText = injector.FormatNotesForInjection(notes);
            const examplesText = injector.FormatExamplesForInjection(examples);

            this._memoryContext = '';
            if (notesText) this._memoryContext += notesText + '\n\n';
            if (examplesText) this._memoryContext += examplesText + '\n\n';

            // Inject as system message at the start
            conversationMessages.unshift({
                role: 'system',
                content: this._memoryContext
            });

            this.logStatus(
                `💾 Injected ${notes.length} notes and ${examples.length} examples into conversation context`,
                true
            );
        }

        // Store for inclusion in result
        this._injectedMemory = { notes, examples };

        return { notes, examples };
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
     * @param {AIAgentEntityExtended} agent - The agent to validate
     * @returns {ExecuteAgentResult | null} Error result if validation fails, null if valid
     * @protected
     */
    protected async validateAgent(agent: AIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
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
     * @param {AIAgentEntityExtended} agent - The agent to load configuration for
     * @returns {Promise<AgentConfiguration>} Configuration object with loaded entities
     * @protected
     */
    protected async loadAgentConfiguration(agent: AIAgentEntityExtended): Promise<AgentConfiguration> {
        const engine = AIEngine.Instance;

        // first check to see if we have a custom driver class if we do, we do NOT validate the rest of
        // the metadata as the custom sub-class can do whatever it wants with/without prompts/etc.
        let metadataOptional: boolean = false;
        if (agent.DriverClass) {
            this.logStatus(`🔧 Using custom driver class '${agent.DriverClass}' for agent '${agent.Name}'`, true);   
            metadataOptional = true;
        }

        // Find the agent type
        const agentType = engine.AgentTypes.find(at => at.ID === agent.TypeID);
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
        const systemPrompt = engine.Prompts.find(p => p.ID === agentType.SystemPromptID);

        if (!systemPrompt) {
            metadataOptional = true; // If no system prompt, we can skip some validations
        }

        // Find the first active agent prompt (optional for agent types that don't require them)
        const agentPrompt = engine.AgentPrompts
            .filter(ap => ap.AgentID === agent.ID && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];

        if (!agentPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`
            };
        }

        // Find the actual prompt entity (will be undefined for agent types with only step-level prompts)
        const childPrompt = agentPrompt ? engine.Prompts.find(p => p.ID === agentPrompt.PromptID) : undefined;

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
     * @param {AIAgentTypeEntity} agentType - The agent type
     * @param {AIPromptEntityExtended} systemPrompt - The system prompt
     * @param {AIPromptEntityExtended} childPrompt - The child prompt
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @returns {Promise<AIPromptParams>} Configured prompt parameters
     * @protected
     */
    protected async preparePromptParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const agentType: AIAgentTypeEntity = config.agentType;
        const systemPrompt: AIPromptEntityExtended = config.systemPrompt;
        const childPrompt: AIPromptEntityExtended = config.childPrompt;

        // Gather context data (including runtime action changes)
        const promptTemplateData = await this.gatherPromptTemplateData(
            params.agent,
            params.contextUser,
            params.data,
            params.actionChanges
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
        agentType: AIAgentTypeEntity,
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
    protected async validateSubAgentNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // check to make sure the current agent can execute the specified sub-agent
        const name = nextStep.subAgent?.name;
        const curAgentSubAgents = AIEngine.Instance.GetSubAgents(params.agent.ID, 'Active');
        const subAgent = curAgentSubAgents.find(a => a.Name.trim().toLowerCase() === name?.trim().toLowerCase());
        
        if (!name || !subAgent) {
            this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'SubAgentExecution'
            });
            // Increment validation retry count since we're changing to Retry
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false, // this will kick it back to the prompt to run again
                errorMessage: `Sub-agent '${name}' not found or not active`
            };
        }

        // Check MaxExecutionsPerRun limit
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
                // Increment validation retry count since we're changing to Retry
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

        // if we get here, the next step is valid and we can return it
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Use effective actions which includes runtime action changes (populated in gatherPromptTemplateData)
        // Fall back to database-configured actions if _effectiveActions is empty
        const effectiveActions = this.getEffectiveActionsForValidation(params.agent.ID);

        // Also get the database-configured agent actions for MaxExecutionsPerRun lookup
        const dbAgentActions = AIEngine.Instance.AgentActions.filter(
            aa => aa.AgentID === params.agent.ID && aa.Status === 'Active'
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
                const dbAgentAction = dbAgentActions.find(aa => aa.ActionID === actionEntity.ID);
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
    protected getEffectiveActionsForValidation(agentId: string): ActionEntityExtended[] {
        if (this._effectiveActions.length > 0) {
            return this._effectiveActions;
        }

        // Fallback: compute from database configuration
        const agentActions = AIEngine.Instance.AgentActions.filter(
            aa => aa.AgentID === agentId && aa.Status === 'Active'
        );
        return ActionEngineServer.Instance.Actions.filter(a =>
            agentActions.some(aa => aa.ActionID === a.ID) && a.Status === 'Active'
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
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
        agentRun: AIAgentRunEntityExtended
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
        // Check for common configuration error patterns
        const configErrorPatterns = [
            {
                pattern: /cannot read propert(y|ies) of (undefined|null)/i,
                getMessage: () => {
                    // Try to extract what property was being accessed
                    const propertyMatch = errorMessage.match(/reading '(\w+)'/i);
                    const property = propertyMatch ? propertyMatch[1] : 'unknown property';

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
     * Recovery Strategy 1: Remove oldest action-result messages.
     * Targets messages older than minAge turns for removal.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @param currentStepCount - Current turn/step number
     * @param minAge - Minimum age in turns for removal (default: 5)
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected recoveryStrategy_RemoveOldestActionResults(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 5
    ): { tokensSaved: number; strategyName: string } {
        let tokensSaved = 0;
        const removedIndices: number[] = [];

        // Find action-result messages older than minAge turns
        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index: index,
                age: (msg as AgentChatMessage).metadata?.turnAdded
                    ? currentStepCount - (msg as AgentChatMessage).metadata!.turnAdded
                    : 0,
                tokens: this.estimateTokens(msg.content),
                isActionResult: (msg as AgentChatMessage).metadata?.messageType === 'action-result'
            }))
            .filter(c => c.isActionResult && c.age >= minAge)
            .sort((a, b) => b.age - a.age); // Oldest first

        // Remove messages until we've saved enough
        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;

            removedIndices.push(candidate.index);
            tokensSaved += candidate.tokens;

            this.logStatus(
                `Removing action-result from ${candidate.age} turns ago (${candidate.tokens} tokens)`,
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
                reason: 'Context recovery - oldest action results',
                tokensSaved: this.estimateTokens(removed.content)
            });
        });

        return {
            tokensSaved,
            strategyName: `Removed ${removedIndices.length} old action-results (${minAge}+ turns)`
        };
    }

    /**
     * Recovery Strategy 2: Compact old action-result messages.
     * Uses smart trimming to reduce size while preserving some content.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @param currentStepCount - Current turn/step number
     * @param minAge - Minimum age in turns for compaction (default: 3)
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected async recoveryStrategy_CompactOldActionResults(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 3
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        let tokensSaved = 0;
        let compactedCount = 0;

        // Find action-result messages to compact
        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index: index,
                age: (msg as AgentChatMessage).metadata?.turnAdded
                    ? currentStepCount - (msg as AgentChatMessage).metadata!.turnAdded
                    : 0,
                tokens: this.estimateTokens(msg.content),
                isActionResult: (msg as AgentChatMessage).metadata?.messageType === 'action-result',
                alreadyCompacted: (msg as AgentChatMessage).metadata?.wasCompacted === true
            }))
            .filter(c => c.isActionResult && c.age >= minAge && !c.alreadyCompacted)
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
                    `Compacted action-result from ${candidate.age} turns ago (saved ${saved} tokens)`,
                    true,
                    params
                );
            }
        }

        return {
            tokensSaved,
            strategyName: `Compacted ${compactedCount} old action-results (${minAge}+ turns)`
        };
    }

    /**
     * Recovery Strategy 3: Aggressively compact ALL action-result messages.
     * Used when gentler strategies haven't freed enough space.
     *
     * @param params - Agent execution parameters
     * @param tokensToSave - Target number of tokens to free
     * @returns Result with tokens saved and strategy description
     * @protected
     */
    protected async recoveryStrategy_CompactAllActionResults(
        params: ExecuteAgentParams,
        tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        let tokensSaved = 0;
        let compactedCount = 0;

        // Find ALL action-result messages that aren't already compacted
        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index: index,
                tokens: this.estimateTokens(msg.content),
                isActionResult: (msg as AgentChatMessage).metadata?.messageType === 'action-result',
                alreadyCompacted: (msg as AgentChatMessage).metadata?.wasCompacted === true
            }))
            .filter(c => c.isActionResult && !c.alreadyCompacted && c.tokens > 200)
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
            strategyName: `Aggressively compacted ${compactedCount} action-results`
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
     * This approach preserves the user's original request while removing stale action results.
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

        // Get current step count for age calculations
        const currentStepCount = this._agentRun?.Steps?.length || 0;

        // Try multiple recovery strategies in order
        const strategies = [
            () => this.recoveryStrategy_RemoveOldestActionResults(params, tokensToSave, currentStepCount, 5),
            () => this.recoveryStrategy_CompactOldActionResults(params, tokensToSave, currentStepCount, 3),
            () => this.recoveryStrategy_RemoveOldestActionResults(params, tokensToSave, currentStepCount, 2),
            () => this.recoveryStrategy_CompactAllActionResults(params, tokensToSave),
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
     * @param {AIAgentTypeEntity} agentType - The agent type
     * @param {AIPromptRunResult} promptResult - The prompt execution result
     * @returns {Promise<ExecuteAgentResult>} The execution result
     * @protected
     */
    protected async processNextStep<P>(
        nextStep: BaseAgentNextStep<P>,
        params: ExecuteAgentParams,
        agentType: AIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
        currentStep: AIAgentRunStepEntityExtended
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
     * Creates a chat message containing action execution results.
     * 
     * @param {AgentAction[]} actions - The actions that were executed
     * @param {any[]} results - The results from action execution
     * @returns {ChatMessage} A formatted message with action results
     * @protected
     */
    protected createActionResultMessage(actions: AgentAction[], results: ActionResult[]): ChatMessage {
        const resultSummary = actions.map((action, index) => {
            const result = results[index];
            const outputParams = result.Params?.filter((p: any) => 
                p.Type === 'Output' || p.Type === 'Both'
            ) || [];
            
            return {
                actionName: action.name,
                success: result.Success,
                resultCode: result.Result?.ResultCode || 'N/A',
                message: result.Message || null,
                outputs: outputParams.reduce((acc: any, param: any) => {
                    acc[param.Name] = param.Value;
                    return acc;
                }, {})
            };
        });

        return {
            role: 'user',
            content: `Action results:\n${JSON.stringify(resultSummary, null, 2)}`
        };
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
            content: `Sub-agent '${subAgent.name}' result:\n${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`
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
     * @param {AIAgentEntityExtended} agent - The agent to gather context for
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
        agent: AIAgentEntityExtended,
        _contextUser?: UserInfo,
        extraData?: any,
        actionChanges?: ActionChange[]
    ): Promise<AgentContextData> {
        try {
            const engine = AIEngine.Instance;

            // Find sub-agents using AIEngine
            const activeSubAgents = engine.Agents.filter(a => a.ParentID === agent.ID && a.Status === 'Active')
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
            const activeAgentRelationships = engine.AgentRelationships.filter(ar => ar.AgentID === agent.ID && ar.Status === 'Active');
            // now combine the child sub-agents from the direct parentID relationships with the agentRelationships array, distinct to not repeat
            // unique ID values
            const uniqueActiveSubAgentIDs = new Set<string>();
            activeSubAgents.forEach(a => uniqueActiveSubAgentIDs.add(a.ID));
            activeAgentRelationships.forEach(ar => uniqueActiveSubAgentIDs.add(ar.SubAgentID));
            const uniqueActiveSubAgents = Array.from(uniqueActiveSubAgentIDs).map(id => engine.Agents.find(a => a.ID === id));

            // Load available actions from database configuration
            const agentActions = engine.AgentActions.filter(aa => aa.AgentID === agent.ID && aa.Status === 'Active');
            let actions: ActionEntityExtended[] = ActionEngineServer.Instance.Actions.filter(a => agentActions.some(aa => aa.ActionID === a.ID));

            // Apply runtime action changes if provided
            if (actionChanges?.length) {
                const isRoot = this._depth === 0;
                const result = this.applyActionChanges(actions, actionChanges, agent.ID, isRoot);
                actions = result.actions;
                this._dynamicActionLimits = result.dynamicLimits;
            }

            // Filter to only active actions and store for later validation in executeActionsStep
            const activeActions = actions.filter(a => a.Status === 'Active');
            this._effectiveActions = activeActions;

            // Build agent type prompt params (merged from schema defaults, agent config, and runtime overrides)
            const agentType = engine.AgentTypes.find(at => at.ID === agent.TypeID);
            const runtimePromptParamOverrides = extraData?.__agentTypePromptParams as Record<string, unknown> | undefined;
            const agentTypePromptParams = this.buildAgentTypePromptParams(
                agentType,
                agent,
                runtimePromptParamOverrides
            );

            const contextData: AgentContextData = {
                agentName: agent.Name,
                agentDescription: agent.Description,
                parentAgentName: agent.Parent ? agent.Parent.trim() : "",
                subAgentCount: uniqueActiveSubAgents.length,
                subAgentDetails: this.formatSubAgentDetails(uniqueActiveSubAgents),
                actionCount: activeActions.length,
                actionDetails: this.formatActionDetails(activeActions),
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
                const { __agentTypePromptParams: _ignored, ...restExtraData } = extraData;
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
        agentType: AIAgentTypeEntity | undefined,
        agent: AIAgentEntityExtended,
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
                while: true
            };
        }

        const responseType = params.includeResponseTypeDefinition as Record<string, unknown>;

        // Auto-alignment mappings: docs flag → response type property
        const alignmentMappings: Array<{ docsFlag: string; responseTypeKey: string }> = [
            { docsFlag: 'includePayloadInPrompt', responseTypeKey: 'payload' },
            { docsFlag: 'includeResponseFormDocs', responseTypeKey: 'responseForms' },
            { docsFlag: 'includeCommandDocs', responseTypeKey: 'commands' },
            { docsFlag: 'includeForEachDocs', responseTypeKey: 'forEach' },
            { docsFlag: 'includeWhileDocs', responseTypeKey: 'while' }
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
    public async ExecuteSingleAction(params: ExecuteAgentParams, action: AgentAction, actionEntity: ActionEntityExtended, 
        contextUser?: UserInfo): Promise<ActionResult> {
        
        try {
            const actionEngine = ActionEngineServer.Instance;

            // Convert params object to ActionParam array
            const actionParams = Object.entries(action.params || {}).map(([key, value]) => ({
                Name: key,
                Value: value,
                Type: 'Input' as const
            }));
            
            // Execute the action and return the full ActionResult
            const result = await actionEngine.RunAction({
                Action: actionEntity,
                Params: actionParams,
                ContextUser: contextUser,
                Filters: [],
                SkipActionLog: false,
                Context: params.context // pass along our context to actions so they can use it however they need
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
     * @param {AIAgentEntityExtended} subAgent - The sub-agent entity
     * @param {ChatMessage | undefined} contextMessage - Optional context from SubAgentContextPaths
     * @returns {ChatMessage[]} Prepared message array for sub-agent execution
     *
     * @protected
     */
    protected prepareSubAgentMessages(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: AIAgentEntityExtended,
        contextMessage?: ChatMessage
    ): ChatMessage[] {
        const engine = AIEngine.Instance;
        let messages: ChatMessage[] = [];

        // Check for related sub-agent configuration (AIAgentRelationship)
        const relationship = engine.AgentRelationships.find(
            r => r.AgentID === params.agent.ID && r.SubAgentID === subAgent.ID
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
        subAgent: AIAgentEntityExtended,
        stepEntity: AIAgentRunStepEntityExtended,
        payload?: SR,
        contextMessage?: ChatMessage,
        stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            this.logStatus(`🤖 Executing sub-agent '${subAgentRequest.name}'`, true, params);

            // Create a new AgentRunner instance
            const runner = new AgentRunner();

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

            // Filter action changes for sub-agent propagation
            const subAgentActionChanges = this.filterActionChangesForSubAgent(params.actionChanges);

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
                data: {
                        ...params.data,
                        ...subAgentRequest.templateParameters,
                      }, // merge parent data first, then override with template parameters so loop agents can dynamically override parent data
                context: subAgentContext, // use subAgentRequest.context if provided, otherwise params.context
                verbose: params.verbose, // pass verbose flag to sub-agent
                actionChanges: subAgentActionChanges, // propagate filtered action changes to sub-agent
                // Add callback to link AgentRun ID immediately when created
                onAgentRunCreated: async (agentRunId: string) => {
                    stepEntity.TargetLogID = agentRunId;
                    await stepEntity.Save();
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
     * Formats sub-agent details for inclusion in prompt context.
     * 
     * @param {AIAgentEntityExtended[]} subAgents - Array of sub-agent entities
     * @returns {string} JSON formatted string with sub-agent details
     * @private
     */
    private formatSubAgentDetails(subAgents: AIAgentEntityExtended[]): string {
        return JSON.stringify(subAgents.map(sa => {
            const result = {
                Name: sa.Name,
                Description: sa.Description
            };
            if (sa.ExecutionMode !== 'Sequential') {
                // no need to include these two attributes for sub-agents
                // that are sequential and the order is implied via the array order
                // saves tokens
                result['ExecutionMode'] = sa.ExecutionMode;
                result['ExecutionOrder'] = sa.ExecutionOrder;
            }

            return result;
        }), null, 2);
    }

    /**
     * Utility method to get agent prompt parameters for a given agent. This gets the 
     * highest priority prompt for the agent, and then gets the parameters for that
     * prompt.
     * @param agent 
     */
    protected getAgentPromptParameters(agent: AIAgentEntityExtended): Array<TemplateParamEntity> {
        const engine = AIEngine.Instance;
        const agentPrompt = engine.AgentPrompts
            .filter(ap => ap.AgentID === agent.ID && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        
        if (!agentPrompt) return [];

        const prompt = engine.Prompts.find(p => p.ID === agentPrompt.PromptID);
        if (!prompt) return [];

        // Return parameters as key-value pairs
        return prompt.TemplateParams;
    }

    protected getAgentPromptParametersJSON(agent: AIAgentEntityExtended): string {
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
     * Formats action details for inclusion in prompt context.
     * 
     * @param {ActionEntityExtended[]} actions - Array of action entities
     * @returns {string} JSON formatted string with comprehensive action details
     * @private
     */
    private formatActionDetails(actions: ActionEntityExtended[]): string {
        return JSON.stringify(actions.map(action => ({
            Name: action.Name,
            Description: action.Description,
            // Parameters with detailed information
            Parameters: {
                Input: action.Params
                    .filter(p => p.Type.trim().toLowerCase() === 'input' || p.Type.trim().toLowerCase() === 'both')
                    .map(param => this.formatActionParameter(param)),
                Output: action.Params
                    .filter(p => p.Type.trim().toLowerCase() === 'output' || p.Type.trim().toLowerCase() === 'both')
                    .map(param => this.formatActionParameter(param))
            },
            // Result codes with detailed information
            ResultCodes: action.ResultCodes.map(rc => ({
                Code: rc.ResultCode,
                IsSuccess: rc.IsSuccess,
                Description: rc.Description || 'No description provided',
            })),
            // Additional metadata
            Category: action.CategoryID ? this.getActionCategoryName(action.CategoryID) : null,
            Status: action.Status
        })), null, 2);
    }

    /**
     * Formats a single action parameter for display.
     * 
     * @param {any} param - The action parameter to format
     * @returns {object} Formatted parameter object
     * @private
     */
    private formatActionParameter(param: ActionParamEntity): object {
        return {
            Name: param.Name,
            Type: param.Type,
            IsRequired: param.IsRequired,
            IsArray: param.IsArray,
            DefaultValue: param.DefaultValue,
            Description: param.Description,
            ValueType: param.ValueType
        };
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
        const agentType = AIEngine.Instance.AgentTypes.find(at => at.ID === typeID);
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
        baseActions: ActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean
    ): { actions: ActionEntityExtended[]; dynamicLimits: Record<string, number> } {
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
                    if (!actions.some(a => a.ID === actionId)) {
                        const actionToAdd = ActionEngineServer.Instance.Actions.find(a => a.ID === actionId);
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
                actions = actions.filter(a => !change.actionIds.includes(a.ID));
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
     * Initializes the agent run tracking by creating AIAgentRunEntityExtended and setting up context.
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
        
        // Create AIAgentRunEntity
        this._agentRun = await this._metadata.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        if (params.conversationDetailId) {
            this._agentRun.ConversationDetailID = params.conversationDetailId;
        }
        // Use conversationId from data if available (already passed by AgentRunner)
        // This avoids a redundant network lookup since AgentRunner already loaded this
        if (params.data?.conversationId) {
            this._agentRun.ConversationID = params.data.conversationId;
        }
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.contextUser?.ID || null;
        
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

        // Set user scope for multi-tenant SaaS deployments
        if (params.userScope) {
            // Resolve primary entity ID from entity name
            if (params.userScope.primaryEntityName) {
                const primaryEntity = this._metadata.Entities.find(
                    e => e.Name === params.userScope!.primaryEntityName
                );
                if (primaryEntity) {
                    this._agentRun.PrimaryScopeEntityID = primaryEntity.ID;
                } else {
                    LogError(`UserScope: Entity "${params.userScope.primaryEntityName}" not found in metadata`);
                }
            }
            // Set primary scope record ID
            if (params.userScope.primaryRecordId) {
                this._agentRun.PrimaryScopeRecordID = params.userScope.primaryRecordId;
            }
            // Set secondary scopes as JSON
            if (params.userScope.secondary && Object.keys(params.userScope.secondary).length > 0) {
                this._agentRun.SecondaryScopes = JSON.stringify(params.userScope.secondary);
            }
        }

        // Save the agent run
        if (!await this._agentRun.Save()) {
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(this._agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
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
     * @param {AIAgentEntityExtended} agent - The agent to validate
     * @returns {Promise<ExecuteAgentResult | null>} - Failure result if validation fails, null if successful
     */
    private async validateAgentWithTracking(agent: AIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
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
     * @private
     * @param params - Step creation parameters
     * @returns {Promise<AIAgentRunStepEntityExtended>} - The created step entity
     */
    private async createStepEntity(params: {
        stepType: AIAgentRunStepEntityExtended["StepType"];
        stepName: string;
        contextUser: UserInfo;
        targetId?: string;
        inputData?: any;
        targetLogId?: string;
        payloadAtStart?: any;
        payloadAtEnd?: any;
        parentId?: string;
    }): Promise<AIAgentRunStepEntityExtended> {
        const stepEntity = await this._metadata.GetEntityObject<AIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', params.contextUser);

        stepEntity.AgentRunID = this._agentRun!.ID;
        // Step number is based on current count of steps + 1
        stepEntity.StepNumber = (this._agentRun!.Steps?.length || 0) + 1;
        stepEntity.StepType = params.stepType;
        // Include hierarchy breadcrumb in StepName for better logging
        stepEntity.StepName = this.formatHierarchicalMessage(params.stepName);
        // check to see if targetId is a valid UUID
        if (params.targetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.targetId)) {
            // If not valid, we can just ignore it, but console.warn
            console.warn(`Invalid target ID format: ${params.targetId}`);
        }
        else {
            stepEntity.TargetID = params.targetId || null;
        }
        stepEntity.TargetLogID = params.targetLogId || null;
        stepEntity.ParentID = params.parentId || null;  // Link to parent step (e.g., loop step)
        stepEntity.Status = 'Running';
        stepEntity.StartedAt = new Date();
        stepEntity.PayloadAtStart = this.serializePayloadAtStart(params.payloadAtStart);
        stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(params.payloadAtEnd);
        
        // Populate InputData if provided
        if (params.inputData) {
            stepEntity.InputData = JSON.stringify({
                ...params.inputData,
                context: {
                    agentHierarchy: this._agentHierarchy,
                    depth: this._depth,
                    stepNumber: stepEntity.StepNumber
                }
            });
        }
        
        if (!await stepEntity.Save()) {
            throw new Error(`Failed to create agent run step record: ${JSON.stringify(stepEntity.LatestResult)}`);
        }
        
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
     * @param {AIAgentRunStepEntityExtended} stepEntity - The step entity to finalize
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

    private async finalizeStepEntity(stepEntity: AIAgentRunStepEntityExtended, success: boolean, errorMessage?: string, outputData?: any): Promise<void> {
        try {
            stepEntity.Status = success ? 'Completed' : 'Failed';
            stepEntity.CompletedAt = new Date();
            stepEntity.Success = success;
            stepEntity.ErrorMessage = errorMessage || null;
            
            // Populate OutputData if provided
            if (outputData) {
                stepEntity.OutputData = JSON.stringify({
                    ...CopyScalarsAndArrays(outputData, true),
                    context: {
                        success,
                        durationMs: stepEntity.CompletedAt.getTime() - stepEntity.StartedAt.getTime(),
                        errorMessage
                    }
                });
            }
            
            if (!await stepEntity.Save()) {
                console.error('Failed to update agent run step record');
            }
        }
        catch (e) {
            console.error('Failed to update agent run step record', e);
        }
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
     * @private
     * @param {string} baseMessage - The base message to format
     * @returns {string} - The formatted message with hierarchy breadcrumb
     */
    private formatHierarchicalMessage(baseMessage: string): string {
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
     * @param currentStep - Current agent's step number (1-based)
     * @param parentSteps - Array of parent step counts from root to immediate parent
     * @returns Formatted hierarchical step string, or undefined if currentStep is undefined/null
     * @private
     */
    private buildHierarchicalStep(currentStep: number | undefined, parentSteps: number[]): string | undefined {
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
                    const currentStepCount = this._agentRun?.Steps?.length || 0;
                    this.executeExpandMessageStep(previousDecision, params, currentStepCount);
                }
                return await this.executePromptStep(params, config, previousDecision, stepCount);
            case 'Sub-Agent':
                return await this.processSubAgentStep<P, P>(params, previousDecision!, undefined, undefined, stepCount);
            case 'Actions':
                return await this.executeActionsStep(params, previousDecision, undefined, true, stepCount);
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
        
        // Prepare input data for the step
        const inputData = {
            promptId: promptId,
            promptName: promptName,
            isRetry: !!previousDecision,
            retryContext: previousDecision ? {
                reason: previousDecision.retryReason,
                instructions: previousDecision.retryInstructions
            } : undefined,
            conversationMessages: params.conversationMessages,
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
            
            // Set PayloadAtStart
            if (stepEntity && payload) {
                stepEntity.PayloadAtStart = this.serializePayloadAtStart(payload);
            }
            
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
            
            // Add callback to link PromptRun ID immediately when created
            promptParams.onPromptRunCreated = async (promptRunId: string) => {
                stepEntity.TargetLogID = promptRunId;
                await stepEntity.Save();
            };
            
            // Execute the prompt
            const promptResult = await this.executePrompt(promptParams);

            // Remove temporary messages before processing prompt results
            // This includes loop results and sub-agent completion messages
            params.conversationMessages = params.conversationMessages.filter(m => {
                const metadata = (m as any).metadata;
                return !metadata?._loopResults && !metadata?._subAgentResult;
            });

            // Update step entity with AIPromptRun ID if available
            if (promptResult.promptRun?.ID) {
                stepEntity.TargetLogID = promptResult.promptRun.ID;
                stepEntity.PromptRun = promptResult.promptRun; // Store the prompt run object
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

            // now that we have processed the payload, we can process the next step which does validation and changes the next step if
            // validation fails
            const updatedNextStep = await this.processNextStep<P>(initialNextStep, params, config.agentType!, promptResult, finalPayload, stepEntity);

            // sub-classes may have modified the payload, and we allow that, and so we need to update finalPayload to map to the updatedNextStep.newPayload
            finalPayload = updatedNextStep.newPayload || finalPayload;

            // Prepare output data, these are simple elements of the state that are not typically
            // included in payload but are helpful. We do not include the prompt result here
            // or the payload as those are stored already(prompt result via TargetLogID -> AIPromptRunEntityExtended)
            // and payload via the specialied PayloadAtStart/End fields on the step entity.
            const outputData = {
                nextStep: {
                    ...updatedNextStep,
                    reasoning: this.getNextStepReasoning(updatedNextStep),
                },
                // Include payload change metadata if changes were made
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
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
                return { ...updatedNextStep, terminate: true };
            }
            else if (updatedNextStep.step === 'Success' || updatedNextStep.step === 'Failed') {
                return { ...updatedNextStep, terminate: true };
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
        subAgentEntity: AIAgentEntityExtended, 
        subAgentRequest: AgentSubAgentRequest<SC>
    ): { downstreamPaths: string[], upstreamPaths: string[] } {
        let downstreamPaths: string[] = ['*'];
        let upstreamPaths: string[] = ['*'];
        
        try {
            // Note: TypeScript errors on PayloadDownstreamPaths/PayloadUpstreamPaths are expected
            // until CodeGen runs after the migration to add these fields to AIAgentEntity
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
        subAgentEntity: AIAgentEntityExtended,
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
        params.conversationMessages.push({
            role: 'assistant',
            content: `I'm delegating this task to the "${subAgentRequest.name}" agent.\n\nReason: ${subAgentRequest.message}`
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
                                                            a.ParentID === params.agent.ID);
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
                // Set the SubAgentRun property for hierarchical tracking
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

            // Determine if we should terminate after sub-agent
            const shouldTerminate = subAgentRequest.terminateAfter;
            
            // Prepare output data
            const outputData = {
                subAgentResult: {
                    // we have a link to the AIAgentRunEntityExtended via the TargetLogID above
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
            
            // Build a clean summary of sub-agent result
            const subAgentSummary = {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentEntity.ID,
                success: subAgentResult.success,
                finalStep: subAgentResult.agentRun?.FinalStep,
                errorMessage: subAgentResult.agentRun?.ErrorMessage || null
                // do NOT include payload here as this goes to the LLM and
                // we don't need that there, too many tokens and LLM already gets
                // payload the normal way
            };
            
            // Add user message with the sub-agent results
            const resultMessage = subAgentResult.success
                ? `Sub-agent completed successfully:\n${JSON.stringify(subAgentSummary, null, 2)}`
                : `Sub-agent failed:\n${JSON.stringify(subAgentSummary, null, 2)}`;

            params.conversationMessages.push({
                role: 'user',
                content: resultMessage,
                metadata: {
                    _temporary: true,
                    _subAgentResult: true,
                    subAgentName: subAgentRequest.name,
                    subAgentId: subAgentEntity.ID
                }
            });

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
        previousDecision?: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: any,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision.subAgent as AgentSubAgentRequest<SC>;
        const name = subAgentRequest?.name;

        if (!name) {
            return {
                step: 'Failed',
                terminate: false,
                errorMessage: 'Sub-agent name is required',
                previousPayload: previousDecision?.newPayload,
                newPayload: previousDecision?.newPayload
            };
        }

        // Find the sub-agent - check both child and related agents
        const childAgents = AIEngine.Instance.Agents.filter(a =>
            a.ParentID === params.agent.ID &&
            a.Status === 'Active'
        );
        const childAgent = childAgents.find(a => a.Name.trim().toLowerCase() === name.trim().toLowerCase());

        if (childAgent) {
            // This is a child agent - use direct payload coupling
            return await this.executeChildSubAgentStep<SC, SR>(params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount);
        }

        // Check for related agent
        const activeRelationships = AIEngine.Instance.AgentRelationships.filter(ar =>
            ar.AgentID === params.agent.ID &&
            ar.Status === 'Active'
        );

        for (const relationship of activeRelationships) {
            const relatedAgent = AIEngine.Instance.Agents.find(a =>
                a.ID === relationship.SubAgentID &&
                a.Status === 'Active'
            );

            if (relatedAgent && relatedAgent.Name.trim().toLowerCase() === name.trim().toLowerCase()) {
                // This is a related agent - use message-based coupling
                return await this.executeRelatedSubAgentStep<SC, SR>(params, previousDecision, relatedAgent, relationship, parentStepId, subAgentPayloadOverride, stepCount);
            }
        }

        // Sub-agent not found
        this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
            agent: params.agent,
            category: 'SubAgentExecution'
        });

        return {
            step: 'Retry',
            terminate: false,
            errorMessage: `Sub-agent '${name}' not found or not active`,
            previousPayload: previousDecision?.newPayload,
            newPayload: previousDecision?.newPayload
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
        subAgentEntity: AIAgentEntityExtended,
        relationship: AIAgentRelationshipEntity,
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
        params.conversationMessages.push({
            role: 'assistant',
            content: `I'm delegating this task to the "${subAgentRequest.name}" agent.\n\nReason: ${subAgentRequest.message}`
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

            // Add sub-agent result to conversation as user message
            const subAgentSummary = {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                success: subAgentResult.success,
                payload: subAgentResult.payload,
                errorMessage: subAgentResult.agentRun?.ErrorMessage
            };

            params.conversationMessages.push({
                role: 'user',
                content: `Related sub-agent "${subAgentRequest.name}" completed:\n${JSON.stringify(subAgentSummary, null, 2)}`
            });

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

            // Build detailed action execution message with parameters using markdown formatting
            // This creates a permanent, lightweight record of what was requested
            let actionMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
                actionMessage = `I'm executing the **${aa.name}** action`;

                // Add parameters if they exist
                if (aa.params && Object.keys(aa.params).length > 0) {
                    const paramsList = Object.entries(aa.params)
                        .map(([key, value]) => {
                            const displayValue = this.formatParamValueForMessage(value);
                            return `• **${key}**: ${displayValue}`;
                        })
                        .join('\n');
                    actionMessage += ` with parameters:\n${paramsList}`;
                } else {
                    actionMessage += '.';
                }
            } else {
                actionMessage = `I'm executing **${actions.length} actions** in parallel:\n\n` + actions.map((aa, index) => {
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

            if (addConversationMessage) {
                // Add assistant message (no metadata - this is a permanent record)
                params.conversationMessages.push({
                    role: 'assistant',
                    content: actionMessage
                });
            }

            const actionEngine = ActionEngineServer.Instance;
            // Get the AIAgentAction metadata records for this agent (used for expiration settings)
            const agentActions = AIEngine.Instance.AgentActions.filter(aa => aa.AgentID === params.agent.ID);

            // Use _effectiveActions which includes runtime action changes applied in gatherPromptTemplateData
            // Fall back to database-configured actions if _effectiveActions is empty (shouldn't happen in normal flow)
            const effectiveActions = this._effectiveActions.length > 0
                ? this._effectiveActions
                : actionEngine.Actions.filter(a =>
                    agentActions.some(aa => aa.ActionID === a.ID)
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
            let lastStep: AIAgentRunStepEntityExtended | undefined = undefined;
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
                        stepEntity.TargetLogID = actionResult.LogEntry.ID;
                        await stepEntity.Save();
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
            const actionSummaries = actionResults.map(result => {
                const actionResult = result.success ? result.result : null;

                // Filter to output params only
                const outputParams = result.result?.Params?.filter(p => p.Type === 'Both' || p.Type === 'Output') || [];

                // Intercept large media content (images, audio, video) and replace with placeholders
                // This prevents context overflow from base64 data (~700K tokens per 1024x1024 image)
                // Pass actionEntity for generic ValueType=MediaOutput detection from metadata
                const sanitizedParams = this.interceptLargeBinaryContent(outputParams, result.actionEntity);

                return {
                    actionName: result.action.name,
                    success: result.success,
                    params: sanitizedParams,
                    resultCode: actionResult?.Result?.ResultCode || (result.success ? 'SUCCESS' : 'ERROR'),
                    message: result.success ? actionResult?.Message || 'Action completed' : result.error
                };
            });
            
            // Check if any actions failed
            const failedActions = actionSummaries.filter(a => !a.success);

            // Add user message with the results
            const resultsMessage = (failedActions.length > 0 ? `${failedActions.length} of ${actionSummaries.length} failed:` : `Action results:`) + `\n${JSON.stringify(actionSummaries, null, 2)}`;

            // Build metadata from AI Agent Actions configuration
            // If multiple actions, use the most restrictive (shortest) expiration settings
            let metadata: AgentChatMessageMetadata | undefined;
            const agentActionConfigs = actionResults
                .map(r => agentActions.find(aa => aa.ActionID === r.actionEntity.ID))
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
                    const currentStepCount = this._agentRun?.Steps?.length || 0;
                    metadata = {
                        turnAdded: currentStepCount,
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
     * @private
     */
    private async executeChatStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const stepEntity = await this.createStepEntity({ stepType: 'Chat', stepName: 'User Interaction', contextUser: params.contextUser });
        
        // Chat steps are successful - they indicate a need for user interaction
        await this.finalizeStepEntity(stepEntity, true);
        
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
        const relatedAgents = AIEngine.Instance.AgentRelationships.filter(ar => ar.AgentID === this._agentRun!.AgentID);
        const childAgents = AIEngine.Instance.Agents.filter(a => a.ParentID === this._agentRun!.AgentID);

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
    ): Promise<AIAgentRunStepEntityExtended> {
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
        loopStepEntity: AIAgentRunStepEntityExtended,
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
            this.injectLoopResultsMessage('ForEach', forEach.collectionPath, loopResults.results, loopResults.errors, params);
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
     * Helper: Inject loop results as temporary message
     */
    private injectLoopResultsMessage(
        loopType: 'ForEach' | 'While',
        collectionOrCondition: string,
        results: BaseAgentNextStep[],
        errors: any[],
        params: ExecuteAgentParams
    ) {
        // grab the priorStepResult from within each result item and put that into a new array
        const extractedResults = results.map(r => r.priorStepResult);
        const label = loopType === 'ForEach' ? 'Collection' : 'Condition';
        params.conversationMessages.push({
            role: 'user',
            content: `## Loop Completed\n**Type:** ${loopType}\n**${label}:** ${collectionOrCondition}\n` +
                     `**Processed:** ${results.length}, **Errors:** ${errors.length}\n\n` +
                     `**Results:**\n\`\`\`json\n${JSON.stringify(extractedResults, null, 2)}\n\`\`\``,
            metadata: { _temporary: true, _loopResults: true }
        } as any);
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
    ): Promise<AIAgentRunStepEntityExtended> {
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

        const { SafeExpressionEvaluator } = require('@memberjunction/global');
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
        loopStepEntity: AIAgentRunStepEntityExtended,
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
            this.injectLoopResultsMessage('While', whileOp.condition, loopResults.results, loopResults.errors, params);
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
        // Only resolve media placeholders for ROOT agents (depth === 0)
        // Sub-agents keep placeholders intact so parent agents don't get huge base64 in their context
        // The root agent resolves all placeholders when returning the final result to the UI
        const isRootAgent = this._depth === 0;
        const resolvedPayload = (payload && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(payload)
            : payload;

        // For root agents: process message for media placeholders
        // This promotes referenced media (sets persist=true) and strips media HTML tags
        // so images display via ConversationDetailAttachment instead of embedded in message
        const processedMessage = (finalStep.message && isRootAgent)
            ? this.processMessageMediaPlaceholders(finalStep.message)
            : finalStep.message;

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
            else {
                this._agentRun.Status = 'Completed';
            }

            this._agentRun.Result = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            this._agentRun.FinalStep = finalStep.step;
            this._agentRun.Message = processedMessage;

            // Set the FinalPayloadObject - this will automatically stringify for the DB
            this._agentRun.FinalPayloadObject = resolvedPayload;
            this._agentRun.FinalPayload = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            
            // Calculate total tokens from all prompts and sub-agents
            const tokenStats = this.calculateTokenStats();
            this._agentRun.TotalTokensUsed = tokenStats.totalTokens;
            this._agentRun.TotalPromptTokensUsed = tokenStats.promptTokens;
            this._agentRun.TotalCompletionTokensUsed = tokenStats.completionTokens;
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

        // Return unified media outputs array which includes:
        // - Explicitly promoted media (persist defaults to true)
        // - Intercepted binary with refIds (persist=false unless placeholder was resolved)
        // Sub-agents pass their full mediaOutputs to parent for merging and placeholder resolution.
        return {
            success: finalStep.step === 'Success' || finalStep.step === 'Chat',
            payload: resolvedPayload,
            agentRun: this._agentRun!,
            responseForm: finalStep.responseForm,
            actionableCommands: finalStep.actionableCommands,
            automaticCommands: finalStep.automaticCommands,
            memoryContext: this._injectedMemory.notes.length > 0 || this._injectedMemory.examples.length > 0
                ? this._injectedMemory
                : undefined,
            mediaOutputs: this._mediaOutputs.length > 0 ? this._mediaOutputs : undefined
        };
    }


    /**
     * Calculate total token statistics from the agent run's persisted steps.
     * 
     * @returns Token statistics including totals and costs
     * @private
     */
    private calculateTokenStats(): { totalTokens: number; promptTokens: number; completionTokens: number; totalCost: number } {
        let totalTokens = 0;
        let promptTokens = 0;
        let completionTokens = 0;
        let totalCost = 0;

        // Iterate through the agent run's steps to sum up tokens
        if (this._agentRun?.Steps) {
            for (const step of this._agentRun.Steps) {
                if (step.StepType === 'Prompt' && step.PromptRun) {
                    // Add tokens from prompt runs
                    totalTokens += step.PromptRun.TokensUsedRollup || 0;
                    promptTokens += step.PromptRun.TokensPromptRollup || 0;  
                    completionTokens += step.PromptRun.TokensCompletionRollup || 0;
                    totalCost += step.PromptRun.TotalCost || 0;
                } else if (step.StepType === 'Sub-Agent' && step.SubAgentRun) {
                    // Add tokens from sub-agent runs (these should already be calculated recursively)
                    totalTokens += step.SubAgentRun.TotalTokensUsed || 0;
                    promptTokens += step.SubAgentRun.TotalPromptTokensUsed || 0;
                    completionTokens += step.SubAgentRun.TotalCompletionTokensUsed || 0;
                    totalCost += step.SubAgentRun.TotalCost || 0;
                }
            }
        }

        return { totalTokens, promptTokens, completionTokens, totalCost };
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
     * @param itemId - The item ID to increment (action ID or sub-agent ID)
     * @private
     */
    private incrementExecutionCount(itemId: string): void {
        const currentCount = this._executionCounts.get(itemId) || 0;
        this._executionCounts.set(itemId, currentCount + 1);
    }

    /**
     * Gets the execution count for an item (action or sub-agent).
     * 
     * @param itemId - The item ID to get count for
     * @returns The execution count (0 if never executed)
     * @private
     */
    private getExecutionCount(itemId: string): number {
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
    protected async checkMinimumExecutionRequirements(agent: AIAgentEntityExtended, agentRun: AIAgentRunEntityExtended): Promise<string[]> {
        const violations: string[] = [];

        // Check action minimum requirements from database-configured actions only.
        // Dynamically added actions do not have MinExecutionsPerRun requirements.
        const agentActions = AIEngine.Instance.AgentActions.filter(aa =>
            aa.AgentID === agent.ID &&
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
        prompt: AIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<AIAgentRunStepEntityExtended> {
        if (!this._agentRun) {
            throw new Error('Cannot create compaction step: agent run not initialized');
        }

        const md = new Metadata();
        const step = await md.GetEntityObject<AIAgentRunStepEntityExtended>(
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
        step: AIAgentRunStepEntityExtended,
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
                    const prompt = AIEngine.Instance.Prompts.find(p => p.ID === promptId);

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
            const vendorEntry = modelVendors.find((mv: any) => mv.VendorID === vendorSelected.ID);
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
            value = trimmedValue.substring(2, trimmedValue.length - 2).trim();
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
}

