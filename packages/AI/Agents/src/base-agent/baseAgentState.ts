/**
 * @fileoverview BaseAgentState - Layer 1 of the BaseAgent modular inheritance hierarchy.
 * Handles state variables, properties, accessors, loggers, step creation/finalization, 
 * payload serialization, and progress reporting context.
 * 
 * @module @memberjunction/ai-agents
 */

import {
    MJAIAgentTypeEntity,
    MJAIAgentNoteEntity,
    MJAIAgentExampleEntity,
    FileStorageEngineBase
} from '@memberjunction/core-entities';
import {
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIAgentEntityExtended,
    ExecuteAgentParams,
    AgentConfiguration,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    MessageLifecycleCallback,
    MediaOutput,
    FileOutputRef,
    ForEachOperation,
    WhileOperation
} from '@memberjunction/ai-core-plus';
import { UserInfo, Metadata, LogStatus, LogStatusEx, LogErrorEx, IsVerboseLoggingEnabled, IMetadataProvider } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { BaseAgentType } from '../agent-types/base-agent-type';
import { AIEngine } from '@memberjunction/aiengine';
import { MJActionEntityExtended, ActionParam, AIDirective } from '@memberjunction/actions-base';
import { PayloadManager, PayloadManagerResult, PayloadChangeResultSummary } from '../PayloadManager';
import { ScratchpadManager } from '../ScratchpadManager';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import { CopyScalarsAndArrays } from '@memberjunction/global';

/**
 * Compact representation of a single action's execution result, used for
 * building the markdown summary that goes into conversation messages.
 */
export interface ActionResultSummary {
    actionName: string;
    success: boolean;
    params: ActionParam[];
    resultCode: string;
    message: string;
    aiDirectives?: AIDirective[];
}

/**
 * Base iteration context for tracking loop execution in BaseAgent.
 * This is agent-type agnostic and handles both ForEach and While loops.
 */
export interface BaseIterationContext {
    /** Type of loop being executed */
    loopType: 'ForEach' | 'While';
    /** Collection array for ForEach loops */
    collection?: any[];
    /** Condition string for While loops */
    condition?: string;
    /** Current index/iteration count */
    currentIndex: number;
    /** Variable name to bind the item to */
    itemVariable: string;
    /** Optional variable name to bind the index to */
    indexVariable?: string;
    /** Maximum number of loop iterations allowed */
    maxIterations: number;
    /** Whether execution should continue if an iteration fails */
    continueOnError: boolean;
    /** Optional delay in milliseconds between iterations */
    delayBetweenIterationsMs?: number;
    /** Accumulator for successful iteration results */
    results: any[];
    /** Accumulator for iteration errors */
    errors: any[];
    /** Configuration object for the loop operation */
    loopConfig: ForEachOperation | WhileOperation;
    /** Parent step ID for database step relationship */
    parentStepId?: string;
    /** Output mapping expression/actions */
    actionOutputMapping?: string;
    /** Custom agent-type specific iteration data */
    agentTypeData?: any;
}

/**
 * Extended progress step that includes additional metadata for execution tracking
 */
export type ExtendedProgressStep = Parameters<AgentExecutionProgressCallback>[0] & {
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
 * BaseAgentState holds all the instance variables, configuration constants,
 * and core utility/logging methods for the linear inheritance hierarchy of BaseAgent.
 */
export class BaseAgentState {
    /** Maximum allowed validation retries before forcing failure. */
    protected static readonly MAX_VALIDATION_RETRIES = 10;

    /**
     * Maximum consecutive failed (non-terminating) steps before forcing termination.
     * Prevents infinite retry loops when an unclassified error repeatedly returns
     * terminate=false. Each successful step resets the counter.
     */
    protected static readonly MAX_CONSECUTIVE_FAILED_STEPS = 10;

    /** Instance of AIPromptRunner used for executing hierarchical prompts. */
    protected _promptRunner: AIPromptRunner = new AIPromptRunner();

    /**
     * Active per-request metadata provider, set at the start of Execute().
     * Defaults to the global Metadata.Provider; overridden when a per-request
     * provider is passed through ExecuteAgentParams.provider for server isolation.
     */
    protected _activeProvider: IMetadataProvider = Metadata.Provider; // global-provider-ok: default until Execute() captures per-request provider

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
    protected _agentTypeState: any = null;

    /** Overridable accessor for the current agent instance's agent-type state */
    protected get AgentTypeState(): any {
        return this._agentTypeState;
    }

    /** The instance of the specific agent type strategy class. */
    protected _agentTypeInstance!: BaseAgentType;

    /** Accessor for the agent's type instance */
    public get AgentTypeInstance(): BaseAgentType {
        return this._agentTypeInstance;
    }

    /**
     * Map to track execution counts for actions and sub-agents.
     * Key is the item ID (action ID or sub-agent ID), value is the count.
     */
    protected _executionCounts: Map<string, number> = new Map();

    /** Callback for message lifecycle events (expiration, compaction, removal, expansion). */
    protected _messageLifecycleCallback: MessageLifecycleCallback | undefined;

    /**
     * Counter for validation-induced retries (when validation changes a step to Retry).
     * This is separate from FinalPayloadValidation retries.
     */
    protected _generalValidationRetryCount: number = 0;

    /** Current agent run entity. */
    protected _agentRun: MJAIAgentRunEntityExtended | null = null;

    /** Access the current run for the agent */
    public get AgentRun(): MJAIAgentRunEntityExtended | null {
        return this._agentRun;
    }

    /**
     * Stores the ID of an AIAgentRequest created when a Chat step fires.
     * Populated by executeChatStep(), returned in ExecuteAgentResult.feedbackRequestId.
     * Only set for root agents (depth 0), not sub-agents.
     */
    protected _feedbackRequestId: string | null = null;

    /** The resolved FileStorageAccount ID for this agent run. */
    protected _resolvedStorageAccountId: string | null = null;

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
     * Accumulated media outputs that agents have explicitly promoted.
     * These are collected during agent execution and returned in ExecuteAgentResult.mediaOutputs.
     * Stored to AIAgentRunMedia when the agent completes.
     */
    protected _mediaOutputs: MediaOutput[] = [];

    /**
     * Accumulated file outputs (PDF, Excel, Word, etc.) produced by file-generation actions.
     * Detected from the FileOutput output param after each action executes.
     * Returned in ExecuteAgentResult.fileOutputs for processing by AgentRunner into MJ: Artifacts.
     */
    protected _fileOutputs: FileOutputRef[] = [];

    /** Payload manager for handling payload access control. */
    protected _payloadManager: PayloadManager = new PayloadManager();

    /**
     * Scratchpad manager for private agent working memory (notes + task list).
     * Instantiated per agent run, garbage collected when the run ends.
     */
    protected _scratchpadManager: ScratchpadManager = new ScratchpadManager();

    /**
     * Manages artifact tools for the current agent run.
     * Allows agents to explore input artifacts on demand.
     */
    protected _artifactToolManager: ArtifactToolManager = new ArtifactToolManager();

    /**
     * Effective actions available to this agent after applying actionChanges.
     * Populated during gatherPromptTemplateData() and used for validation in executeActionsStep().
     */
    protected _effectiveActions: MJActionEntityExtended[] = [];

    /**
     * Counts only prompt (LLM) executions, NOT all agent steps.
     * Used for message expiration age calculations so that `expirationTurns`
     * semantically means "number of LLM calls" rather than "number of steps"
     * (which includes actions, loops, sub-agents, etc.).
     */
    protected _promptTurnCount: number = 0;

    /**
     * Execution limits for dynamically added actions.
     * Maps action IDs to their MaxExecutionsPerRun limit.
     * Populated during gatherPromptTemplateData() when actionChanges include actionLimits.
     */
    protected _dynamicActionLimits: Record<string, number> = {};

    /**
     * Counter for tracking validation retry attempts during FinalPayloadValidation.
     * Reset at the start of each agent run.
     */
    protected _validationRetryCount: number = 0;

    /**
     * Gets the current validation retry count for the agent run.
     * This count tracks how many times the agent has retried validation
     * during the FinalPayloadValidation step.
     */
    public get ValidationRetryCount(): number {
        return this._validationRetryCount;
    }

    /**
     * Counter tracking the number of context recovery attempts made in this run.
     * Context recovery removes/compacts old messages when context length is exceeded.
     * Reset at the start of each agent run.
     */
    protected _contextRecoveryAttempts: number = 0;

    /** Maximum number of context recovery attempts allowed per agent run. */
    protected readonly MAX_RECOVERY_ATTEMPTS: number = 1;

    /**
     * Agent hierarchy for display purposes (e.g., ["Marketing Agent", "Copywriter Agent"]).
     * Tracked separately as it's display-only and doesn't need persistence.
     */
    protected _agentHierarchy: string[] = [];

    /**
     * Current iteration context for ForEach/While loops.
     * Only one active loop per BaseAgent instance (nested loops handled by sub-agent instances).
     */
    protected _iterationContext: BaseIterationContext | null = null;

    /** Current depth in the agent hierarchy (0 = root agent, 1 = first sub-agent, etc.). */
    protected _depth: number = 0;

    /**
     * Parent step counts from root to immediate parent.
     * Example: [2, 1] means root agent is at step 2, parent agent is at step 1.
     * Used to build hierarchical step display (e.g., "2.1.3" for nested agents).
     */
    protected _parentStepCounts: number[] = [];

    /** All progress steps including intermediate ones for complete execution tracking. */
    protected _allProgressSteps: ExtendedProgressStep[] = [];

    /** Sub-agent execution results. */
    protected _subAgentRuns: ExecuteAgentResult[] = [];

    /** Storage for injected memory context to prepend to prompts. */
    protected _memoryContext: string = '';

    /** Storage for injected notes and examples to include in result. */
    protected _injectedMemory: { notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] } = { notes: [], examples: [] };

    /**
     * Storage for injected pre-execution RAG context (Phase 1C of search-scopes-rag-plus).
     * Contains the formatted `<retrieved_context>` system-message block actually injected
     * into `conversationMessages`, plus the structured per-scope / combined result detail
     * for downstream observability and artifact persistence.
     */
    protected _ragContext: string = '';

    /** Storage for detailed RAG search results. */
    protected _injectedRAG: AgentPreExecutionRAGResult | null = null;

    /** Minimum size in characters for binary content to be extracted as a media reference. */
    protected static readonly LARGE_BINARY_THRESHOLD = 10000;

    /**
     * Gets the available configuration presets for an agent.
     * Returns semantic presets like "Fast", "Balanced", "High Quality" that users can choose from.
     * These are actual presets stored in the database with specific AIConfiguration references.
     *
     * @param agentId - The ID of the agent to get presets for
     * @returns Array of configuration presets sorted by Priority, or empty array if none configured
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
     */
    public get MediaOutputs(): MediaOutput[] {
        return [...this._mediaOutputs];
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
     * @param error Error object or string message
     * @param options Log metadata options
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
        
        if (options?.agent) {
            metadata.agentId = options.agent.ID;
            metadata.agentName = options.agent.Name;
        }
        
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
     * Formats a hierarchical step string combining parent steps and current step.
     *
     * @param currentStep - The current step number
     * @param parentSteps - Array of parent step counts from root to immediate parent
     * @returns Formatted hierarchical step string, or undefined if currentStep is undefined/null
     */
    protected buildHierarchicalStep(currentStep: number | undefined, parentSteps: number[]): string | undefined {
        if (currentStep == null) return undefined;

        if (parentSteps.length === 0) {
            return currentStep.toString();
        }

        return [...parentSteps, currentStep].join('.');
    }

    /**
     * Wrapper for progress callbacks that captures all progress events.
     * @param originalCallback Optional original callback passed by caller
     */
    protected wrapProgressCallback(originalCallback?: AgentExecutionProgressCallback): AgentExecutionProgressCallback | undefined {
        if (!originalCallback) return undefined;

        return (progress) => {
            const hierarchicalStep = progress.metadata?.hierarchicalStep as string | undefined
                ?? this.buildHierarchicalStep(
                    progress.metadata?.stepCount as number,
                    this._parentStepCounts
                );

            this._allProgressSteps.push({
                ...progress,
                timestamp: new Date(),
                agentHierarchy: this._agentHierarchy || [],
                depth: this._depth || 0,
                hierarchicalStep
            });

            try {
                const enhancedProgress = {
                    ...progress,
                    metadata: {
                        ...progress.metadata,
                        agentRun: this._agentRun,
                        hierarchicalStep
                    }
                };

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

                originalCallback(progress);
            }
        };
    }

    /**
     * Creates an agent run step record.
     * @param params Configuration parameters for the step creation
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

        stepEntity.AgentRunID = this._agentRun!.ID;
        stepEntity.StepNumber = (this._agentRun!.Steps?.length || 0) + 1;
        stepEntity.StepType = params.stepType;
        stepEntity.StepName = this.formatHierarchicalMessage(params.stepName);
        
        if (params.targetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.targetId)) {
            console.warn(`Invalid target ID format: ${params.targetId}`);
        } else {
            stepEntity.TargetID = params.targetId || null;
        }
        
        stepEntity.TargetLogID = params.targetLogId || null;
        stepEntity.ParentID = params.parentId || null;
        stepEntity.Status = 'Running';
        stepEntity.StartedAt = new Date();
        stepEntity.PayloadAtStart = this.serializePayloadAtStart(params.payloadAtStart);
        stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(params.payloadAtEnd);
        
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
        
        if (this._agentRun) {
            this._agentRun.Steps.push(stepEntity);
        }
        
        return stepEntity;
    }

    /**
     * Finalizes a step entity with completion status.
     * 
     * @param stepEntity - The step entity to finalize
     * @param success - Whether the step was successful
     * @param errorMessage - Optional error message
     * @param outputData - Optional output data to capture for this step
     */
    protected async finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: any
    ): Promise<void> {
        try {
            stepEntity.Status = success ? 'Completed' : 'Failed';
            stepEntity.CompletedAt = new Date();
            stepEntity.Success = success;
            stepEntity.ErrorMessage = errorMessage || null;
            
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
     * Formats a message with agent hierarchy for streaming/progress updates.
     *
     * @param baseMessage - The base message to format
     * @returns The formatted message with hierarchy breadcrumb
     */
    protected formatHierarchicalMessage(baseMessage: string): string {
        if (this._depth > 0) {
            const breadcrumb = this._agentHierarchy
                .slice(1)
                .join(' → ');
            return breadcrumb ? `${breadcrumb}: ${baseMessage}` : baseMessage;
        }
        return baseMessage;
    }

    /**
     * Serializes payload for logging to PayloadAtStart
     * Override in subclasses to customize logging behavior (e.g., summarize large payloads)
     *
     * @param payload - The payload to serialize
     * @returns Serialized string or null to skip logging
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
     */
    protected serializePayloadAtEnd(payload: any): string | null {
        return payload ? JSON.stringify(payload) : null;
    }

    /**
     * Increments the execution count for an item (action or sub-agent).
     * 
     * @param itemId - The item ID to increment (action ID or sub-agent ID)
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
     */
    protected getExecutionCount(itemId: string): number {
        return this._executionCounts.get(itemId) || 0;
    }

    /**
     * Builds a summary of payload change results for storage
     * @param changeResult The result from PayloadManager operations
     * @returns A serializable summary object
     */
    /**
     * Builds a summary of payload change results for storage
     * @param changeResult The result from PayloadManager operations
     * @returns A serializable summary object
     */
    protected buildPayloadChangeResultSummary(changeResult: PayloadManagerResult<any>): PayloadChangeResultSummary {
        return {
            applied: changeResult.applied,
            warnings: changeResult.warnings,
            requiresFeedback: changeResult.requiresFeedback,
            timestamp: changeResult.timestamp,
            
            payloadValidation: changeResult.blockedOperations && changeResult.blockedOperations.length > 0 ? {
                selfWriteViolations: {
                    deniedOperations: changeResult.blockedOperations,
                    timestamp: changeResult.timestamp.toISOString()
                }
            } : undefined,
            
            analysis: changeResult.analysis ? {
                totalWarnings: changeResult.analysis.summary.totalWarnings,
                warningsByType: changeResult.analysis.summary.warningsByType,
                suspiciousChanges: changeResult.analysis.summary.suspiciousChanges,
                criticalWarnings: changeResult.analysis.criticalWarnings.map(w => ({
                    type: w.type,
                    severity: w.severity,
                    path: w.path,
                    message: w.message
                }))
            } : undefined,
            
            diffSummary: changeResult.diff ? {
                added: changeResult.diff.summary.added,
                removed: changeResult.diff.summary.removed,
                modified: changeResult.diff.summary.modified,
                totalChanges: changeResult.diff.summary.totalPaths
            } : undefined
        };
    }

    /**
     * Creates a cancelled execution result and updates the agent run entity status.
     * 
     * @protected
     * @param {string} message - The cancellation message/reason
     * @param {UserInfo} [contextUser] - Optional user context
     * @returns {Promise<ExecuteAgentResult>} The cancelled result structure
     */
    protected async createCancelledResult(message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
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
     * Calculates the token usage statistics for the current agent run by aggregating
     * token metrics across all individual run steps (both prompt and sub-agent steps).
     * 
     * @returns Token statistics including totals and costs
     * @protected
     */
    protected calculateTokenStats(): { totalTokens: number; promptTokens: number; completionTokens: number; totalCost: number } {
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
}
