import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ChatMessage, ErrorAnalyzer, AIErrorInfo, ResolveFileInputStrategy } from '@memberjunction/ai';
import { AIModelRunner } from './AIModelRunner';
import { ValidationAttempt, AIPromptRunResult, AIModelSelectionInfo } from '@memberjunction/ai-core-plus';
import { LogErrorEx, LogStatus, LogStatusEx, IsVerboseLoggingEnabled, Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { CleanJSON, MJGlobal, JSONValidator, ValidationResult, ValidationErrorInfo, ValidationErrorType, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { MJAIPromptModelEntity, MJAIModelVendorEntity, MJAIConfigurationEntity, MJAIVendorEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { MJAIModelEntityExtended, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';
import { ExecutionPlanner } from './ExecutionPlanner';
import { ParallelExecutionCoordinator } from './ParallelExecutionCoordinator';
import { ResultSelectionConfig } from './ParallelExecution';
import { ModelResolver, ResolvedModelCandidate } from './ModelResolver';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { SystemPlaceholderManager } from '@memberjunction/ai-core-plus';
import {
    TemplateMessageRole,
    ChildPromptParam,
    AIPromptParams
} from '@memberjunction/ai-core-plus';
import * as JSON5 from 'json5';
 






/**
 * Advanced AI Prompt execution engine with comprehensive template support, hierarchical template composition,
 * sophisticated model selection, parallelization, output validation, and execution tracking.
 *
 * ## Core Features
 * - **Template-based prompt generation** using MJ Templates system
 * - **Hierarchical template composition** with depth-first rendering and parallel template processing
 * - **Advanced model selection** strategies (Default, Specific, ByPower)
 * - **Parallel execution** with multiple models and execution groups
 * - **Structured output validation** and type conversion with retry logic
 * - **Comprehensive execution tracking** with agent run linking
 * - **Configuration-driven behavior** with caching and performance optimization
 * - **Real-time progress updates** and streaming response support
 * 
 * ## Hierarchical Template Composition
 * When `childPrompts` array is provided in {@link AIPromptParams}:
 * 1. Renders child prompt templates in depth-first manner (children before parents)
 * 2. At each level, renders sibling templates in parallel for optimal performance
 * 3. Recursively handles grandchild templates (unlimited nesting depth)
 * 4. Substitutes rendered child templates into corresponding placeholders in parent template
 * 5. Executes the final composed prompt as a single operation
 * 
 * This enables complex prompt composition patterns where templates can be built from reusable
 * sub-templates, creating sophisticated prompts through hierarchical template inheritance.
 * 
 * ## Agent Integration
 * - Links executions to agent runs via `agentRunId` parameter
 * - Supports agent decision-making workflows with structured JSON responses
 * - Enables hierarchical template patterns in AI agents
 * 
 * @example Basic Usage
 * ```typescript
 * const runner = new AIPromptRunner();
 * const params = new AIPromptParams();
 * params.prompt = aiPrompt;
 * params.data = { key: 'value' };
 * const result = await runner.ExecutePrompt(params);
 * ```
 * 
 * @example Hierarchical Template Composition
 * ```typescript
 * const params = new AIPromptParams();
 * params.prompt = parentPrompt;
 * params.childPrompts = [
 *   new ChildPromptParam(analysisPrompt, 'analysis'),
 *   new ChildPromptParam(summaryPrompt, 'summary'),
 *   new ChildPromptParam(complexChild, 'complex') // This can have its own child templates
 * ];
 * params.data = { userInput: 'complex data to process' };
 * const result = await runner.ExecutePrompt(params);
 * // Child templates render first, then parent template uses {{ analysis }}, {{ summary }}, {{ complex }}
 * // Final composed prompt is executed once
 * ```
 */
/**
 * `ResolvedModelCandidate` was the runner's private candidate type until PR #2471
 * (Phase 1 extraction). It now lives on `ModelResolver` as the public
 * `ResolvedModelCandidate` (a structural superset adding `vendor`,
 * `credentialsAvailable`, and `unavailableReason`). Internal references in
 * this file use `ResolvedModelCandidate` directly.
 */

/**
 * Configuration for failover behavior when primary model fails
 */
interface FailoverConfiguration {
  strategy: 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank' | 'None';
  maxAttempts: number;
  delaySeconds: number;
  modelStrategy?: 'PreferSameModel' | 'PreferDifferentModel' | 'RequireSameModel';
  errorScope?: 'All' | 'NetworkOnly' | 'RateLimitOnly' | 'ServiceErrorOnly';
}

/**
 * Tracks information about a failover attempt
 */
interface FailoverAttempt {
  attemptNumber: number;
  modelId: string;
  vendorId?: string;
  error: Error;
  errorType: string;
  duration: number;
  timestamp: Date;
}

export class AIPromptRunner {
  private _metadata: Metadata;
  private _templateEngine: TemplateEngineServer;
  private _executionPlanner: ExecutionPlanner;
  private _parallelCoordinator: ParallelExecutionCoordinator;
  private _jsonValidator: JSONValidator;
  private _modelRunner: AIModelRunner;
  private _provider: IMetadataProvider | null = null;

  /**
   * Optional metadata provider override. Callers should set
   * `instance.Provider = providerToUse` before invoking run methods
   * in multi-provider contexts. Falls back to the global default provider when unset.
   */
  public get Provider(): IMetadataProvider {
    return this._provider ?? (this._metadata as unknown as IMetadataProvider);
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  constructor() {
    this._metadata = (this._provider as unknown as Metadata) ?? new Metadata();
    this._templateEngine = TemplateEngineServer.Instance;
    this._executionPlanner = new ExecutionPlanner();
    this._parallelCoordinator = new ParallelExecutionCoordinator();
    this._jsonValidator = new JSONValidator();
    this._modelRunner = new AIModelRunner();
  }

  /**
   * Access the underlying AIModelRunner for embedding and other non-LLM model calls.
   * Use this when you need tracked embedding execution with AIPromptRun record creation.
   */
  public get ModelRunner(): AIModelRunner {
    return this._modelRunner;
  }

  /**
   * Internal logging helper that wraps LogStatusEx with verbose control
   * @param message The message to log
   * @param verboseOnly Whether this is a verbose-only message
   * @param params Optional prompt parameters for custom verbose check
   */
  protected logStatus(message: string, verboseOnly: boolean = false, params?: AIPromptParams): void {
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
    prompt?: MJAIPromptEntityExtended;
    model?: MJAIModelEntityExtended;
    severity?: 'warning' | 'error' | 'critical';
    maxErrorLength?: number;
  }): void {
    let errorMessage = error instanceof Error ? error.message : error;
    const errorObj = error instanceof Error ? error : undefined;

    // Truncate extremely long error messages (like Groq's failed_generation JSON dumps)
    // Only truncate if maxErrorLength is explicitly set
    if (options?.maxErrorLength !== undefined && errorMessage.length > options.maxErrorLength) {
      errorMessage = errorMessage.substring(0, options.maxErrorLength) + '... [truncated]';
    }

    const metadata: Record<string, any> = {
      ...options?.metadata
    };

    // Add prompt information if available
    if (options?.prompt) {
      metadata.promptId = options.prompt.ID;
      metadata.promptName = options.prompt.Name;
    }

    // Add model information if available
    if (options?.model) {
      metadata.modelId = options.model.ID;
      metadata.modelName = options.model.Name;
    }

    LogErrorEx({
      message: errorMessage,
      error: errorObj,
      category: options?.category || 'AIPromptRunner',
      severity: options?.severity || 'error',
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    });
  }


  // -------------------------------------------------------------------------
  // Credential resolution — Phase 1 extraction (PR #2471)
  // -------------------------------------------------------------------------
  // The 7-tier credential hierarchy and the credential pre-flight check now
  // live on `ModelResolver` in this same package. The two methods below are
  // kept as runner-internal shims so existing call sites (`executeModel` for
  // ResolveCredential, `selectModelWithAPIKeyTracked` for HasCredentialsAvailable)
  // don't have to change. The hierarchy itself is byte-for-byte identical —
  // see `packages/AI/Prompts/src/ModelResolver.ts`.

  private async resolveCredentialForExecution(
    driverClass: string,
    promptId: string | undefined,
    modelId: string | undefined,
    vendorId: string | undefined,
    params: AIPromptParams
  ): Promise<string> {
    const result = await ModelResolver.Instance.ResolveCredential(
      driverClass,
      { promptId, modelId, vendorId },
      {
        credentialId: params.credentialId,
        apiKeys: params.apiKeys,
        contextUser: params.contextUser,
        verbose: params.verbose,
        maxErrorLength: params.maxErrorLength,
      }
    );
    // Preserve the runner's pre-extraction Promise<string> contract: when the
    // legacy env-var fallback turns up nothing, GetAIAPIKey returns '' and
    // BaseLLM constructors already accept it. ResolveCredential's null shape
    // (added per PHASE_1_MODEL_RESOLVER_SPEC §2.3) collapses back to '' here.
    return result ?? '';
  }

  private hasCredentialsAvailable(
    driverClass: string,
    promptId: string | undefined,
    modelId: string | undefined,
    vendorId: string | undefined,
    params?: AIPromptParams
  ): boolean {
    return ModelResolver.Instance.HasCredentialsAvailable(
      driverClass,
      { promptId, modelId, vendorId },
      {
        apiKeys: params?.apiKeys,
        contextUser: params?.contextUser,
        credentialId: params?.credentialId,
        verbose: params?.verbose,
      }
    );
  }

  /**
   * Executes an AI prompt with full support for templates, model selection, and validation.
   *
   * @param params Parameters for prompt execution
   * @returns Promise<AIPromptRunResult<T>> The execution result with tracking information
   * 
   * @example
   * ```typescript
   * // Execute with specific result type
   * interface AnalysisResult {
   *   sentiment: string;
   *   score: number;
   *   keywords: string[];
   * }
   * 
   * const result = await promptRunner.ExecutePrompt<AnalysisResult>({
   *   prompt: sentimentPrompt,
   *   data: { text: "Customer feedback text" }
   * });
   * 
   * if (result.success && result.result) {
   *   // result.result is typed as AnalysisResult
   *   console.log(`Sentiment: ${result.result.sentiment}, Score: ${result.result.score}`);
   * }
   * ```
   */
  public async ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
    const startTime = new Date();
    const promptRun: MJAIPromptRunEntityExtended | null = null;

    // AIEngineBase is registered as deferred — its initial load runs in the background
    // after server boot. Make sure the cached metadata (Models, Vendors, ModelVendors,
    // ConfigurationParams, etc.) is loaded before downstream resolution / planning runs.
    // Idempotent: zero cost after first load thanks to BaseEngine._loadingSubject dedup.
    await AIEngineBase.Instance.EnsureLoaded();

    // Check for cancellation at the start
    if (params.cancellationToken?.aborted) {
      const result: AIPromptRunResult<T> = {
        success: false,
        status: 'Cancelled',
        cancelled: true,
        cancellationReason: 'user_requested',
        errorMessage: 'Prompt execution was cancelled before starting',
        executionTimeMS: 0,
        chatResult: { success: false, errorMessage: 'Prompt execution was cancelled before starting' } as ChatResult,
        tokensUsed: 0,
        combinedTokensUsed: 0
      };
      return result;
    }

    try {
      // Use the prompt entity directly from params
      const prompt = params.prompt;
      if (!prompt) {
        throw new Error(`Prompt entity is required`);
      }

      if (prompt.Status !== 'Active') {
        throw new Error(`Prompt ${prompt.Name} is not active (Status: ${prompt.Status})`);
      }

      let renderedPromptText: string = '';

      // For hierarchical prompts, we need to create the parent prompt run first to get its ID
      let parentPromptRun: MJAIPromptRunEntityExtended | undefined;
      let selectedModel: MJAIModelEntityExtended | undefined;
      let childTemplateRenderingResult: { renderedTemplates: Record<string, string> } | undefined;
      let modelSelectionInfo: AIModelSelectionInfo | undefined;

      // Handle different prompt execution modes
      if (params.childPrompts && params.childPrompts.length > 0) {
        // Hierarchical template composition mode - render child templates first, then compose
        //this.logStatus(`🌳 Composing prompt with ${params.childPrompts.length} child templates in hierarchical mode`, true, params);
        
        // Determine which prompt to use for model selection
        let modelSelectionPrompt = prompt;
        if (params.modelSelectionPrompt) {
          modelSelectionPrompt = params.modelSelectionPrompt;
          //this.logStatus(`🎯 Using prompt "${modelSelectionPrompt.Name}" for model selection instead of parent prompt`, true, params);
        }
        
        // Select model using the appropriate prompt
        const modelResult = await this.selectModel(modelSelectionPrompt, params.override?.modelId, params.contextUser, params.configurationId, params.override?.vendorId, params);
        selectedModel = modelResult.model;
        modelSelectionInfo = modelResult.selectionInfo;
        if (!selectedModel) {
          throw new Error(this.buildNoModelFoundMessage(modelSelectionPrompt.Name, modelSelectionInfo));
        }

        // Check if we have a system prompt override
        if (params.systemPromptOverride) {
          // Use the override instead of rendering child templates and parent template
          renderedPromptText = params.systemPromptOverride;
          this.logStatus(`   Using system prompt override for prompt "${prompt.Name}" (bypassing hierarchical template rendering)`, true, params);
        } else {
          // Render all child prompt templates recursively
          childTemplateRenderingResult = await this.renderChildPromptTemplates(params.childPrompts, params, params.cancellationToken);
          // Render the parent prompt with child templates embedded
          renderedPromptText = await this.renderPromptWithChildTemplates(prompt, params, childTemplateRenderingResult.renderedTemplates);
        }

          // Create parent prompt run for the final composed prompt execution
        parentPromptRun = await this.createPromptRun(prompt, selectedModel, params, renderedPromptText, startTime, params.override?.vendorId, modelSelectionInfo);
      } else if (prompt.TemplateID && (!params.conversationMessages || params.templateMessageRole !== 'none')) {
        // Check if we have a system prompt override
        if (params.systemPromptOverride) {
          // Use the override instead of rendering the template
          renderedPromptText = params.systemPromptOverride;
          this.logStatus(`   Using system prompt override for prompt "${prompt.Name}" (bypassing template rendering)`, true, params);
        } else {
          // Regular template rendering mode
          // Initialize template engine
          await this._templateEngine.Config(false, params.contextUser);

          // Load the template for the prompt
          const template = await this.loadTemplate(prompt.TemplateID, params.contextUser);
          if (!template) {
            throw new Error(`Template with ID ${prompt.TemplateID} not found for prompt ${prompt.Name}`);
          }

          // Render the template with full params context
          const renderedPrompt = await this.renderPromptTemplate(template, params);
          if (!renderedPrompt.Success) {
            throw new Error(`Failed to render template for prompt ${prompt.Name}: ${renderedPrompt.Message}`);
          }

          renderedPromptText = renderedPrompt.Output;
        }
      }

      // Check for cancellation after template rendering
      if (params.cancellationToken?.aborted) {
        throw new Error('Prompt execution was cancelled during template rendering');
      }

      // If no model was selected yet (no template case), select one now
      if (!selectedModel) {
        let modelSelectionPrompt = prompt;
        if (params.modelSelectionPrompt) {
          modelSelectionPrompt = params.modelSelectionPrompt;
          this.logStatus(`🎯 Using prompt "${modelSelectionPrompt.Name}" for model selection instead of main prompt`, true, params);
        }
        
        const modelResult = await this.selectModel(modelSelectionPrompt, params.override?.modelId, params.contextUser, params.configurationId, params.override?.vendorId, params);
        selectedModel = modelResult.model;
        modelSelectionInfo = modelResult.selectionInfo;
        if (!selectedModel) {
          throw new Error(this.buildNoModelFoundMessage(modelSelectionPrompt.Name, modelSelectionInfo));
        }
      }


      // Check if we need parallel execution based on ParallelizationMode
      const shouldUseParallelExecution = prompt.ParallelizationMode && prompt.ParallelizationMode !== 'None';

      let result: AIPromptRunResult<T>;
      if (shouldUseParallelExecution) {
        // Use parallel execution path
        result = await this.executePromptInParallel<T>(prompt, renderedPromptText, params, startTime, parentPromptRun, selectedModel, modelSelectionInfo);
      } else {
        // Use traditional single execution path
        result = await this.executeSinglePrompt<T>(prompt, renderedPromptText, params, startTime, parentPromptRun, selectedModel, modelSelectionInfo);
      }

      // Note: With template composition, we only execute once so no rollup calculations needed
      // The final composed prompt is executed as a single operation

      // Model selection info is now included in the result from both execution methods
      return result;
    } catch (error) {
      this.logError(error, {
        prompt: params.prompt,
        metadata: {
          executionPhase: 'main-execution',
          hasChildPrompts: !!params.childPrompts?.length
        },
        maxErrorLength: params.maxErrorLength
      });

      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();

      // Update prompt run with error if it was created
      if (promptRun) {
        promptRun.CompletedAt = endTime;
        promptRun.ExecutionTimeMS = executionTimeMS;
        promptRun.Result = `ERROR: ${error.message}`;
        
        // Set Status and Cancelled based on error type
        if (error.message.includes('cancelled')) {
          promptRun.Status = 'Cancelled';
          promptRun.Cancelled = true;
          promptRun.CancellationReason = 'user_requested';
        } else {
          promptRun.Status = 'Failed';
          promptRun.ErrorDetails = error.message;
        }
        
        const saveResult = await promptRun.Save();
        if (!saveResult) {
          this.logError(`Failed to save error to AIPromptRun: ${promptRun.LatestResult?.CompleteMessage || 'Unknown error'}`, {
            category: 'PromptRunSave',
            metadata: {
              promptRunId: promptRun.ID,
              errorMessage: promptRun.LatestResult?.CompleteMessage
            },
            maxErrorLength: params.maxErrorLength
          });
        }
      }

      // Classify the error so downstream consumers (e.g., isFatalPromptError) can
      // detect fatal conditions like missing credentials without relying on string matching
      const errorInfo = ErrorAnalyzer.analyzeError(error, 'AIPromptRunner');

      const errorResult: AIPromptRunResult<T> = {
        success: false,
        errorMessage: error.message,
        promptRun,
        executionTimeMS,
        chatResult: { success: false, errorMessage: error.message, errorInfo } as ChatResult,
        tokensUsed: 0,
        combinedTokensUsed: 0
      };
      return errorResult;
    }
  }

  /**
   * Executes a single prompt (non-parallel) using traditional model selection.
   *
   * @param prompt - The AI prompt to execute
   * @param renderedPromptText - The rendered prompt text
   * @param params - Original execution parameters
   * @param startTime - Execution start time
   * @returns Promise<AIPromptRunResult<T>> - The execution result
   */
  private async executeSinglePrompt<T = unknown>(
    prompt: MJAIPromptEntityExtended,
    renderedPromptText: string,
    params: AIPromptParams,
    startTime: Date,
    existingPromptRun?: MJAIPromptRunEntityExtended,
    existingModel?: MJAIModelEntityExtended,
    existingModelSelectionInfo?: AIModelSelectionInfo
  ): Promise<AIPromptRunResult<T>> {
    // Check for cancellation before model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled before model selection');
    }

    // Use existing model if provided (hierarchical case) or select one
    let selectedModel = existingModel;
    let modelSelectionInfo = existingModelSelectionInfo;
    let vendorDriverClass: string | undefined;
    let vendorApiName: string | undefined;
    let vendorSupportsEffortLevel: boolean | undefined;
    let modelEffortLevel: number | undefined;
    let allCandidates: ResolvedModelCandidate[] = [];

    if (modelSelectionInfo) {
      // we received model selection info, need to lookup vendor driver class and api name from there
      const vendorID = modelSelectionInfo.vendorSelected?.ID;
      const modelID = modelSelectionInfo.modelSelected.ID;
      const modelVendor = AIEngine.Instance.ModelVendors.find(mv => UUIDsEqual(mv.VendorID, vendorID) &&
                                                                    UUIDsEqual(mv.ModelID, modelID));
      if (modelVendor) {
        vendorDriverClass = modelVendor.DriverClass;
        vendorApiName = modelVendor.APIName;
        vendorSupportsEffortLevel = modelVendor.SupportsEffortLevel;
      }

      // Extract valid candidates from selection info for retry logic
      allCandidates = this.buildCandidatesFromSelectionInfo(modelSelectionInfo);
    }

    if (!selectedModel) {
      // Determine which prompt to use for model selection
      let modelSelectionPrompt = prompt;
      if (params.modelSelectionPrompt) {
        modelSelectionPrompt = params.modelSelectionPrompt;
        this.logStatus(`   Using prompt "${modelSelectionPrompt.Name}" for model selection instead of main prompt`, true, params);
      }

      const modelResult = await this.selectModel(modelSelectionPrompt, params.override?.modelId, params.contextUser, params.configurationId, params.override?.vendorId, params);
      selectedModel = modelResult.model;
      vendorDriverClass = modelResult.vendorDriverClass;
      vendorApiName = modelResult.vendorApiName;
      vendorSupportsEffortLevel = modelResult.vendorSupportsEffortLevel;
      modelEffortLevel = modelResult.modelEffortLevel;
      modelSelectionInfo = modelResult.selectionInfo;
      allCandidates = modelResult.allCandidates || [];
      if (!selectedModel) {
        throw new Error(this.buildNoModelFoundMessage(modelSelectionPrompt.Name, modelSelectionInfo));
      }
    }

    // Check for cancellation after model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled after model selection');
    }

    // Use existing prompt run if provided (hierarchical case) or create new one
    const promptRun = existingPromptRun || await this.createPromptRun(prompt, selectedModel, params, renderedPromptText, startTime, params.override?.vendorId, modelSelectionInfo);

    // Check for cancellation before model execution
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled before model execution');
    }

    // Execute with retry logic for validation failures
    const { modelResult, parsedResult, validationAttempts, cumulativeTokens } = await this.executeWithValidationRetries(
      selectedModel,
      renderedPromptText,
      prompt,
      params,
      promptRun,
      allCandidates,
      vendorDriverClass,
      vendorApiName,
      vendorSupportsEffortLevel,
      modelEffortLevel // Pass model-specific effort level
    );

    // Calculate execution metrics
    const endTime = new Date();
    const executionTimeMS = endTime.getTime() - startTime.getTime();

    // Update the prompt run with results including validation attempts and cumulative tokens
    await this.updatePromptRun(promptRun, prompt, modelResult, parsedResult, endTime, executionTimeMS, validationAttempts, cumulativeTokens);

    const chatResult = modelResult as ChatResult;
    const usage = chatResult.data?.usage;
    
    // CRITICAL: Populate errorMessage field when execution fails
    // This ensures errors are properly propagated to BaseAgent and visible in AgentRunStep logs
    let errorMessage: string | undefined;
    if (!chatResult.success) {
      // Model execution failed
      errorMessage = chatResult.errorMessage;
    } else if (parsedResult.validationResult?.Success === false) {
      // Validation failed (Warn or Strict mode)
      errorMessage = `Validation failed: ${parsedResult.validationResult.Errors?.map(e => e.Message).join('; ')}`;
    }

    return {
      success: chatResult.success,
      rawResult: chatResult.data?.choices?.[0]?.message?.content,
      result: parsedResult?.result ? parsedResult.result as T : parsedResult as T,
      errorMessage, // Include error message for proper error propagation
      chatResult,
      promptRun,
      executionTimeMS,
      // Use cumulative tokens if retries occurred, otherwise use single attempt tokens
      promptTokens: cumulativeTokens.promptTokens || usage?.promptTokens,
      completionTokens: cumulativeTokens.completionTokens || usage?.completionTokens,
      tokensUsed: (cumulativeTokens.promptTokens + cumulativeTokens.completionTokens) || ((usage?.promptTokens || 0) + (usage?.completionTokens || 0)),
      cost: cumulativeTokens.totalCost || usage?.cost,
      costCurrency: usage?.costCurrency,
      validationResult: parsedResult.validationResult,
      validationAttempts,
      combinedTokensUsed: (cumulativeTokens.promptTokens + cumulativeTokens.completionTokens) || ((usage?.promptTokens || 0) + (usage?.completionTokens || 0)),
      // modelInfo: the parallel path populates this; we were silently skipping
      // it here, so callers (e.g., the Runtime-action bridge) saw `undefined`
      // and surfaced `modelUsed: null` on every single-model prompt run.
      modelInfo: selectedModel
        ? {
            modelId: selectedModel.ID,
            modelName: selectedModel.Name,
            vendorId: modelSelectionInfo?.vendorSelected?.ID,
            vendorName: selectedModel.Vendor
          }
        : undefined,
      modelSelectionInfo // Include model selection info if available
    };
  }

  /**
   * Executes a prompt using parallel execution with multiple models/tasks.
   *
   * @param prompt - The AI prompt to execute
   * @param renderedPromptText - The rendered prompt text
   * @param params - Original execution parameters
   * @param startTime - Execution start time
   * @returns Promise<AIPromptRunResult<T>> - The aggregated execution result
   */
  private async executePromptInParallel<T = unknown>(
    prompt: MJAIPromptEntityExtended,
    renderedPromptText: string,
    params: AIPromptParams,
    startTime: Date,
    existingPromptRun?: MJAIPromptRunEntityExtended,
    existingModel?: MJAIModelEntityExtended,
    existingModelSelectionInfo?: AIModelSelectionInfo
  ): Promise<AIPromptRunResult<T>> {
    // Check for cancellation before starting parallel execution
    if (params.cancellationToken?.aborted) {
      throw new Error('Parallel execution was cancelled before starting');
    }

    // Load AI Engine to get models and prompt models
    await AIEngine.Instance.Config(false, params.contextUser);

    let executionTasks: any[];
    
    // If a model is already selected (from hierarchical template composition), 
    // create a single task with that model instead of using the planner
    if (existingModel) {
      // Create a single execution task with the pre-selected model
      executionTasks = [{
        taskId: 'pre-selected',
        model: existingModel,
        vendorDriverClass: undefined, // Would need to look up vendor entity for this
        vendorApiName: existingModel.Vendor, // Vendor is already the name string
        messages: params.conversationMessages || [],
        promptText: renderedPromptText,
        templateMessageRole: params.templateMessageRole || 'system',
        contextUser: params.contextUser
      }];
      this.logStatus(`   Using pre-selected model "${existingModel.Name}" for parallel execution`, true, params);
    } else {
      // Normal parallel execution path - let the planner decide
      // Determine which prompt to use for model selection
      let modelSelectionPrompt = prompt;
      if (params.modelSelectionPrompt) {
        modelSelectionPrompt = params.modelSelectionPrompt;
        this.logStatus(`   Using prompt "${modelSelectionPrompt.Name}" for model selection in parallel execution`, true, params);
      }

      // Get prompt-specific model associations using the model selection prompt
      const promptModels = AIEngine.Instance.PromptModels.filter(
        (pm) =>
          UUIDsEqual(pm.PromptID, modelSelectionPrompt.ID) &&
          (pm.Status === 'Active' || pm.Status === 'Preview') &&
          (!params.configurationId || !pm.ConfigurationID || UUIDsEqual(pm.ConfigurationID, params.configurationId)),
      );

      // Create execution plan using the modelSelectionPrompt for model configurations
      executionTasks = this._executionPlanner.createExecutionPlan(
        modelSelectionPrompt,
        promptModels,
        AIEngine.Instance.Models,
        renderedPromptText,
        params.contextUser,
        params.configurationId,
        params.conversationMessages,
        params.templateMessageRole || 'system',
      );
    }

    if (executionTasks.length === 0) {
      throw new Error(`No execution tasks created for parallel execution of prompt ${prompt.Name}`);
    }

    // Check for cancellation before executing tasks
    if (params.cancellationToken?.aborted) {
      throw new Error('Parallel execution was cancelled before task execution');
    }

    // Execute tasks in parallel
    const parallelResult = await this._parallelCoordinator.executeTasksInParallel(params, executionTasks, undefined, undefined, params.cancellationToken, undefined, params.agentRunId);

    if (!parallelResult.success) {
      throw new Error(`Parallel execution failed: ${parallelResult.errors.join(', ')}`);
    }

    // Select best result if multiple successful results
    const successfulResults = parallelResult.taskResults.filter((r) => r.success);
    if (successfulResults.length === 0) {
      throw new Error(`No successful results from parallel execution`);
    }

    let selectedResult = successfulResults[0]; // Default to first

    // Use result selector if configured
    if (successfulResults.length > 1 && prompt.ResultSelectorPromptID) {
      const selectionConfig: ResultSelectionConfig = {
        method: 'PromptSelector',
        selectorPromptId: prompt.ResultSelectorPromptID,
      };

      const aiSelectedResult = await this._parallelCoordinator.selectBestResult(successfulResults, selectionConfig, undefined, params.cancellationToken);
      if (aiSelectedResult) {
        selectedResult = aiSelectedResult;
      }
    }

    // Calculate total tokens and costs from all parallel executions
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    let hasCost = false;
    
    for (const result of successfulResults) {
      const usage = result.modelResult?.data?.usage;
      if (usage) {
        totalPromptTokens += usage.promptTokens || 0;
        totalCompletionTokens += usage.completionTokens || 0;
        if (usage.cost !== undefined) {
          totalCost += usage.cost;
          hasCost = true;
        }
      }
    }

    // Use existing prompt run if provided (hierarchical case) or create new one
    // Use the model selection info if provided (from hierarchical execution)
    const consolidatedPromptRun = existingPromptRun || await this.createPromptRun(prompt, selectedResult.task.model, params, renderedPromptText, startTime, params.override?.vendorId, existingModelSelectionInfo);

    // Update with parallel execution metadata
    const endTime = new Date();
    consolidatedPromptRun.CompletedAt = endTime;
    consolidatedPromptRun.ExecutionTimeMS = parallelResult.totalExecutionTimeMS;
    consolidatedPromptRun.Result = selectedResult.rawResult || '';
    consolidatedPromptRun.TokensUsed = parallelResult.totalTokensUsed;
    
    // Extract token and cost info from selected result
    const selectedResultUsage = selectedResult.modelResult?.data?.usage;
    if (selectedResultUsage) {
      consolidatedPromptRun.TokensPrompt = selectedResultUsage.promptTokens;
      consolidatedPromptRun.TokensCompletion = selectedResultUsage.completionTokens;
      if (selectedResultUsage.cost !== undefined) {
        consolidatedPromptRun.Cost = selectedResultUsage.cost;
      }
      if (selectedResultUsage.costCurrency !== undefined) {
        consolidatedPromptRun.CostCurrency = selectedResultUsage.costCurrency;
      }
    }

    // Add parallel execution metadata to Messages field
    const parallelMetadata = {
      parallelizationMode: prompt.ParallelizationMode,
      totalTasks: executionTasks.length,
      successfulTasks: parallelResult.successCount,
      failedTasks: parallelResult.failureCount,
      selectedTaskId: selectedResult.task.taskId,
      executionGroups: Array.from(parallelResult.groupResults.keys()),
    };

    if (params.data || params.templateData || parallelMetadata) {
      consolidatedPromptRun.Messages = JSON.stringify({
        data: params.data,
        templateData: params.templateData,
        parallelExecution: parallelMetadata,
        messages: params.conversationMessages || [],
      });
    }

    // For parallel execution, set rollup fields to match totals (no child execution to roll up)
    consolidatedPromptRun.TokensPromptRollup = totalPromptTokens;
    consolidatedPromptRun.TokensCompletionRollup = totalCompletionTokens;
    consolidatedPromptRun.TokensUsedRollup = totalPromptTokens + totalCompletionTokens;
    if (hasCost) {
      consolidatedPromptRun.TotalCost = totalCost;
    }
    
    // Set Status and WasSelectedResult for parallel execution
    consolidatedPromptRun.Status = parallelResult.successCount > 0 ? 'Completed' : 'Failed';
    consolidatedPromptRun.WasSelectedResult = true; // This is the consolidated result chosen by judge

    const saveResult = await consolidatedPromptRun.Save();
    if (!saveResult) {
      this.logError(`Failed to save consolidated AIPromptRun: ${consolidatedPromptRun.LatestResult?.CompleteMessage || 'Unknown error'}`, {
        category: 'ConsolidatedPromptRunSave',
        metadata: {
          promptRunId: consolidatedPromptRun.ID,
          executionTasks: executionTasks.length,
          successfulResults: successfulResults.length
        },
        maxErrorLength: params.maxErrorLength
      });
    }

    // Create additional results from all other successful results (excluding the best one)
    const additionalResults: AIPromptRunResult<T>[] = [];

    // Sort successful results by ranking (if available) or keep original order
    const sortedResults = successfulResults.sort((a, b) => {
      if (a.ranking && b.ranking) {
        return a.ranking - b.ranking;
      }
      return 0;
    });

    for (const result of sortedResults) {
      if (result.task.taskId !== selectedResult.task.taskId) {
        // Parse and validate this result
        const { result: parsedResultData, validationResult } = await this.parseAndValidateResultEnhanced(result.modelResult!, prompt, params.skipValidation, params.cleanValidationSyntax, consolidatedPromptRun, params);
        const parsedResult = { result: parsedResultData, validationResult };

        const resultUsage = result.modelResult?.data?.usage;
        additionalResults.push({
          success: result.success,
          rawResult: result.rawResult,
          result: parsedResult.result as T,
          chatResult: result.modelResult!,
          executionTimeMS: result.executionTimeMS,
          promptTokens: resultUsage?.promptTokens,
          completionTokens: resultUsage?.completionTokens,
          tokensUsed: (resultUsage?.promptTokens || 0) + (resultUsage?.completionTokens || 0),
          cost: resultUsage?.cost,
          costCurrency: resultUsage?.costCurrency,
          validationResult: parsedResult.validationResult,
          ranking: result.ranking,
          judgeRationale: result.judgeRationale,
          modelInfo: {
            modelId: result.task.model.ID,
            modelName: result.task.model.Name,
            vendorId: undefined, // VendorID not directly available on AIModel
            vendorName: result.task.model.Vendor,
          },
          combinedTokensUsed: (resultUsage?.promptTokens || 0) + (resultUsage?.completionTokens || 0)
        });
      }
    }

    // Parse and validate the selected result
    const { result: selectedResultData, validationResult: selectedValidationResult } = await this.parseAndValidateResultEnhanced(selectedResult.modelResult!, prompt, params.skipValidation, params.cleanValidationSyntax, consolidatedPromptRun, params);
    const selectedParsedResult = { result: selectedResultData, validationResult: selectedValidationResult };
    const selectedUsage = selectedResult.modelResult?.data?.usage;

    return {
      success: true,
      rawResult: selectedResult.rawResult,
      result: selectedParsedResult.result as T,
      chatResult: selectedResult.modelResult!,
      promptRun: consolidatedPromptRun,
      executionTimeMS: parallelResult.totalExecutionTimeMS,
      promptTokens: selectedUsage?.promptTokens,
      completionTokens: selectedUsage?.completionTokens,
      tokensUsed: (selectedUsage?.promptTokens || 0) + (selectedUsage?.completionTokens || 0),
      cost: selectedUsage?.cost,
      costCurrency: selectedUsage?.costCurrency,
      // Combined totals for parallel execution
      combinedPromptTokens: totalPromptTokens,
      combinedCompletionTokens: totalCompletionTokens,
      combinedTokensUsed: totalPromptTokens + totalCompletionTokens,
      combinedCost: hasCost ? totalCost : undefined,
      validationResult: selectedParsedResult.validationResult,
      additionalResults: additionalResults.length > 0 ? additionalResults : undefined,
      ranking: selectedResult.ranking || 1,
      judgeRationale: selectedResult.judgeRationale,
      modelInfo: {
        modelId: selectedResult.task.model.ID,
        modelName: selectedResult.task.model.Name,
        vendorId: existingModelSelectionInfo?.vendorSelected?.ID, // VendorID not directly available on AIModel
        vendorName: selectedResult.task.model.Vendor,
      },
      judgeMetadata: selectedResult.judgeMetadata,
      modelSelectionInfo: existingModelSelectionInfo, // Include model selection info if provided
    };
  }

  /**
   * Loads a template entity by ID
   */
  private async loadTemplate(templateId: string, _contextUser?: UserInfo): Promise<MJTemplateEntityExtended | null> {
    try {
      // Use the template engine to find the template
      const template = this._templateEngine.Templates.find((t: MJTemplateEntityExtended) => UUIDsEqual(t.ID, templateId));
      return template || null;
    } catch (error) {
      this.logError(error, {
        category: 'TemplateLoading',
        metadata: {
          templateId,
          phase: 'lookup'
        }
      });
      return null;
    }
  }


  /**
   * Renders child prompt templates in a depth-first manner, composing them into a final template.
   * 
   * @param childPrompts - Array of child prompts to render templates for
   * @param params - Original execution parameters for context
   * @param cancellationToken - Cancellation token for aborting rendering
   * @returns Promise with rendered templates map
   */
  private async renderChildPromptTemplates(
    childPrompts: ChildPromptParam[],
    params: AIPromptParams,
    cancellationToken?: AbortSignal
  ): Promise<{
    renderedTemplates: Record<string, string>;
  }> {
    if (!childPrompts || childPrompts.length === 0) {
      return {
        renderedTemplates: {}
      };
    }

    // Check for cancellation
    if (cancellationToken?.aborted) {
      throw new Error('Child prompt execution was cancelled');
    }

    //this.logStatus(`🔄 Rendering ${childPrompts.length} child prompt templates in parallel`, true, params);

    // Render all child prompt templates in parallel at this level
    const childRenderingPromises = childPrompts.map(async (childParam) => {
      try {
        // Check for cancellation before each child rendering
        if (cancellationToken?.aborted) {
          throw new Error('Child prompt template rendering was cancelled');
        }

        // First, recursively render any grandchild prompt templates
        let childData = { ...childParam.childPrompt.data };
        if (childParam.childPrompt.childPrompts && childParam.childPrompt.childPrompts.length > 0) {
          const grandchildResults = await this.renderChildPromptTemplates(
            childParam.childPrompt.childPrompts,
            params,
            cancellationToken
          );
          
          // Merge grandchild rendered templates into the child's data context
          childData = { ...childData, ...grandchildResults.renderedTemplates };
        }

        // Render the child prompt template with merged data
        //this.logStatus(`  🔹 Rendering child prompt template: ${childParam.childPrompt.prompt.Name} -> ${childParam.parentPlaceholder}`, true, params);
        
        const childPrompt = childParam.childPrompt.prompt;
        let renderedChildTemplate = '';
        
        if (childPrompt.TemplateID) {
          // Initialize template engine if not already done
          await this._templateEngine.Config(false, params.contextUser);
          
          // Load the template for the child prompt
          const template = await this.loadTemplate(childPrompt.TemplateID, params.contextUser);
          if (!template) {
            throw new Error(`Template with ID ${childPrompt.TemplateID} not found for child prompt ${childPrompt.Name}`);
          }

          // Merge child data with original params context
          const mergedChildData = {
            ...params.data,           // Original context
            ...childData,             // Child-specific data with grandchildren
            ...childParam.childPrompt.templateData  // Child template data
          };

          // Render the child template
          const childRenderResult = await this.renderPromptTemplate(template, {
            ...params, // spread original params
            prompt: childPrompt, // THEN, override the prompt for child so we get child related OUTPUT_EXAMPLE and anything else along those lines
            data: mergedChildData,
            templateData: childParam.childPrompt.templateData
          });
          
          if (!childRenderResult.Success) {
            console.error(`[ChildTemplateRender] FAILED for "${childPrompt.Name}": ${childRenderResult.Message}`);
            console.error(`[ChildTemplateRender] Data keys: ${Object.keys(mergedChildData).join(', ')}`);
            throw new Error(`Failed to render child template for prompt ${childPrompt.Name}: ${childRenderResult.Message}`);
          }
          
          renderedChildTemplate = childRenderResult.Output;
        } else {
          // If no template, use empty string (child might be using conversation messages)
          renderedChildTemplate = '';
        }

        // Return the placeholder name and rendered template
        return {
          placeholder: childParam.parentPlaceholder,
          renderedTemplate: renderedChildTemplate,
          success: true
        };

      } catch (error) {
        this.logError(error, {
          category: 'ChildTemplateRendering',
          metadata: {
            placeholder: childParam.parentPlaceholder
          },
          maxErrorLength: params.maxErrorLength
        });
        
        // Return error result but allow other children to continue
        return {
          placeholder: childParam.parentPlaceholder,
          renderedTemplate: `ERROR: ${error.message}`,
          success: false
        };
      }
    });

    // Wait for all child template rendering to complete
    const childResults = await Promise.all(childRenderingPromises);

    // Check if any critical errors occurred
    const failedChildren = childResults.filter(r => !r.success);
    if (failedChildren.length > 0) {
      this.logError(`${failedChildren.length} out of ${childResults.length} child prompt templates failed to render`, {
        category: 'ChildTemplateFailures',
        severity: 'critical',
        metadata: {
          failedCount: failedChildren.length,
          totalCount: childResults.length,
          failedPlaceholders: failedChildren.map(fc => fc.placeholder)
        },
        maxErrorLength: params.maxErrorLength
      });

      // any child render failure means we must throw an error
      throw new Error(`Failed to render ${failedChildren.length} child prompt templates: ${failedChildren.map(fc => fc.placeholder).join(', ')}`);
    }

    // Build rendered templates map
    const renderedTemplatesMap: Record<string, string> = {};
    
    for (const childResult of childResults) {
      renderedTemplatesMap[childResult.placeholder] = childResult.renderedTemplate;
    }

    //this.logStatus(`✅ Completed rendering of ${childResults.length} child prompt templates`, true, params);
    
    return {
      renderedTemplates: renderedTemplatesMap
    };
  }

  /**
   * Renders a prompt template with child prompt templates merged into the data context.
   * 
   * @param prompt - The AI prompt to render
   * @param params - Original execution parameters
   * @param childTemplates - Map of placeholder names to rendered child prompt templates
   * @returns Promise<string> - The rendered prompt text with child templates embedded
   */
  private async renderPromptWithChildTemplates(
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    childTemplates: Record<string, string>
  ): Promise<string> {
    if (!prompt.TemplateID) {
      // If no template, return empty string (will be handled by conversation messages)
      return '';
    }

    try {
      // Initialize template engine
      await this._templateEngine.Config(false, params.contextUser);

      // Load the template for the prompt
      const template = await this.loadTemplate(prompt.TemplateID, params.contextUser);
      if (!template) {
        throw new Error(`Template with ID ${prompt.TemplateID} not found for prompt ${prompt.Name}`);
      }

      // Resolve system placeholders with full prompt context
      const systemPlaceholders = await SystemPlaceholderManager.resolveAllPlaceholders(params);

      // Merge all data sources with proper priority order
      const mergedData = {
        ...systemPlaceholders,    // System placeholders (lowest priority)
        ...params.data,           // Original data context
        ...childTemplates,        // Child prompt templates with placeholder names as keys
        ...params.templateData    // Additional template data (highest priority)
      };

      this.logStatus(`   🔧 ${prompt.Name} [Rendering Prompt Template]`, true, params);

      // Log placeholder replacement for debugging
      for (const [placeholder, template] of Object.entries(childTemplates)) {
        const truncatedTemplate = template.length > 100 ? template.substring(0, 100) + '...' : template;
        //this.logStatus(`  📝 ${placeholder} -> ${truncatedTemplate}`, true, params);
      }

      // Render the template with the full params context
      // We already have system placeholders resolved, so we'll render directly
      const renderedPrompt = await this._templateEngine.RenderTemplate(
        template, 
        template.GetHighestPriorityContent()!, 
        mergedData
      );
      
      if (!renderedPrompt.Success) {
        throw new Error(`Failed to render template for prompt ${prompt.Name}: ${renderedPrompt.Message}`);
      }

      return renderedPrompt.Output;

    } catch (error) {
      this.logError(error, {
        category: 'PromptWithChildTemplatesRendering',
        prompt: prompt,
        metadata: {
          childPromptCount: params.childPrompts?.length || 0,
          templateId: prompt.TemplateID
        },
        maxErrorLength: params.maxErrorLength
      });
      throw error;
    }
  }

  /**
   * Runner-internal shim — Phase 1 extraction (PR #2471).
   *
   * The 3-phase candidate-building algorithm and the credential pre-flight
   * now live on `ModelResolver` in this same package. This method exists to
   * preserve the runner's existing call shape ({@link executeSinglePrompt},
   * {@link executePromptInParallel}, the `ExecutePrompt` orchestration in the
   * hierarchical-template branch) without forcing those call sites to know
   * about `ResolveModelResult`. Behavior is byte-for-byte unchanged: same
   * priority order, same selection-reason narrative, same `allCandidates`
   * contract (full pre-pre-flight list, matching the legacy shape).
   */
  private async selectModel(
    prompt: MJAIPromptEntityExtended,
    explicitModelId?: string,
    contextUser?: UserInfo,
    configurationId?: string,
    vendorId?: string,
    params?: AIPromptParams
  ): Promise<{
    model: MJAIModelEntityExtended | null;
    vendorDriverClass?: string;
    vendorApiName?: string;
    vendorSupportsEffortLevel?: boolean;
    modelEffortLevel?: number;
    selectionInfo?: AIModelSelectionInfo;
    allCandidates?: ResolvedModelCandidate[];
  }> {
    const resolved = await ModelResolver.Instance.ResolveForPrompt(
      prompt,
      {
        modelId: explicitModelId,
        vendorId,
        configurationId,
        credentialId: params?.credentialId,
        apiKeys: params?.apiKeys,
        verbose: params?.verbose,
        maxErrorLength: params?.maxErrorLength,
      },
      contextUser
    );

    // Compute selectionStrategy for the run record — same logic as pre-extraction.
    let selectionStrategy: 'Default' | 'Specific' | 'ByPower' = 'Default';
    if (explicitModelId) {
      selectionStrategy = 'Specific';
    } else if (prompt.SelectionStrategy === 'Specific') {
      selectionStrategy = 'Specific';
    } else if (prompt.SelectionStrategy === 'ByPower' || prompt.MinPowerRank != null) {
      selectionStrategy = 'ByPower';
    }

    // Look up the AIConfiguration entity (for AIModelSelectionInfo.aiConfiguration).
    let configuration: MJAIConfigurationEntity | undefined;
    if (configurationId) {
      configuration = AIEngine.Instance.Configurations.find(c => UUIDsEqual(c.ID, configurationId));
    }

    // Adapt resolver candidates -> AIModelSelectionInfo's `modelsConsidered` shape.
    const modelsConsidered = resolved.consideredAll.map(c => ({
      model: c.model,
      vendor: c.vendor,
      priority: c.priority,
      available: c.credentialsAvailable,
      unavailableReason: c.unavailableReason,
    }));

    // `fallbackUsed` = "selected isn't the first considered candidate" — preserves
    // the runner's pre-extraction semantic (uses indexOf on the full list).
    const fallbackUsed = resolved.primary !== null && resolved.consideredAll.length > 0
      && resolved.consideredAll[0] !== resolved.primary;

    const selectionInfo = this.createSelectionInfo({
      aiConfiguration: configuration,
      modelsConsidered,
      // The selection-info type requires a non-null modelSelected; pass through whatever
      // ResolveForPrompt produced and let downstream consumers treat null as "no selection"
      // exactly as they did before extraction.
      modelSelected: (resolved.primary?.model ?? undefined) as MJAIModelEntityExtended,
      vendorSelected: resolved.primary?.vendor,
      selectionReason: resolved.selectionReason,
      fallbackUsed,
      selectionStrategy,
    });

    return {
      model: resolved.primary?.model ?? null,
      vendorDriverClass: resolved.primary?.driverClass,
      vendorApiName: resolved.primary?.apiName,
      vendorSupportsEffortLevel: resolved.primary?.supportsEffortLevel,
      modelEffortLevel: resolved.primary?.effortLevel,
      // Pass the full pre-pre-flight list to preserve the legacy contract that
      // `executeModelWithFailover` filters dynamically via Authentication errors.
      // Stage C's WithFailover retrofit will switch this to `resolved.candidates`.
      allCandidates: resolved.consideredAll,
      selectionInfo,
    };
  }


  /**
   * Creates a properly typed AIModelSelectionInfo instance.
   * TypeScript requires instantiating the class to get the getValidCandidates() method.
   */
  private createSelectionInfo(data: {
    aiConfiguration?: MJAIConfigurationEntity;
    modelsConsidered: Array<{
      model: MJAIModelEntityExtended;
      vendor?: MJAIVendorEntity;
      priority: number;
      available: boolean;
      unavailableReason?: string;
    }>;
    modelSelected: MJAIModelEntityExtended;
    vendorSelected?: MJAIVendorEntity;
    selectionReason: string;
    fallbackUsed: boolean;
    selectionStrategy?: 'Default' | 'Specific' | 'ByPower';
  }): AIModelSelectionInfo {
    const info = new AIModelSelectionInfo();
    Object.assign(info, data);
    return info;
  }

  /**
   * Converts model selection info into ResolvedModelCandidate array for retry logic.
   * Extracts only the valid candidates (those with available API keys) from the selection info.
   *
   * @param selectionInfo - Model selection information containing considered models
   * @returns Array of valid model-vendor candidates sorted by priority
   */
  private buildCandidatesFromSelectionInfo(
    selectionInfo: AIModelSelectionInfo
  ): ResolvedModelCandidate[] {
    const validModels = selectionInfo.extractValidCandidates();

    return validModels.map(considered => {
      // Find matching model vendor for driver and API info
      const modelVendor = considered.vendor
        ? AIEngine.Instance.ModelVendors.find(mv =>
            UUIDsEqual(mv.ModelID, considered.model.ID) &&
            UUIDsEqual(mv.VendorID, considered.vendor!.ID)
          )
        : undefined;

      return {
        model: considered.model,
        vendorId: considered.vendor?.ID,
        vendorName: considered.vendor?.Name,
        driverClass: modelVendor?.DriverClass || considered.model.DriverClass,
        apiName: modelVendor?.APIName || considered.model.APIName,
        supportsEffortLevel: modelVendor?.SupportsEffortLevel ?? considered.model.SupportsEffortLevel ?? false,
        isPreferredVendor: false, // Can't determine from selection info alone
        priority: considered.priority,
        source: (selectionInfo.selectionStrategy === 'ByPower' ? 'power-rank' : 'model-type') as 'power-rank' | 'model-type',
        // extractValidCandidates() returned only `available: true` rows from
        // the selection info, so by definition these all have credentials.
        credentialsAvailable: true,
      };
    }).sort((a, b) => b.priority - a.priority); // Sort by priority descending
  }


  /**
   * Builds a descriptive error message when no model could be selected for a prompt.
   * Includes details about which models were considered and why they were unavailable
   * so the error message is actionable for end users (e.g., missing API credentials).
   */
  private buildNoModelFoundMessage(promptName: string, selectionInfo?: AIModelSelectionInfo): string {
    const base = `No suitable model found for prompt ${promptName}`;

    if (!selectionInfo?.modelsConsidered || selectionInfo.modelsConsidered.length === 0) {
      return `${base}. No model-vendor candidates were available. Please ensure AI models are configured for this prompt.`;
    }

    // Check if all models were unavailable due to missing credentials
    const unavailableModels = selectionInfo.modelsConsidered.filter(m => !m.available);
    if (unavailableModels.length === selectionInfo.modelsConsidered.length) {
      const triedSummary = unavailableModels.slice(0, 5).map(m => {
        const vendorName = m.vendor?.Name || 'default';
        return `${m.model.Name}/${vendorName}`;
      }).join(', ');

      const suffix = unavailableModels.length > 5 ? ` (${unavailableModels.length} total)` : '';
      return `${base}. No valid API credentials/keys are configured for any of the candidate model-vendor combinations. ` +
        `Tried: ${triedSummary}${suffix}. ` +
        `Please configure API credentials in your environment or AI Credential settings.`;
    }

    return `${base}. ${selectionInfo.selectionReason || 'Unknown reason'}`;
  }

  /**
   * Creates an AIPromptRun entity for execution tracking
   */
  private async createPromptRun(
    prompt: MJAIPromptEntityExtended,
    model: MJAIModelEntityExtended,
    params: AIPromptParams,
    systemPromptText: string, 
    startTime: Date,
    vendorId?: string,
    modelSelectionInfo?: any
  ): Promise<MJAIPromptRunEntityExtended> {
    const provider: IMetadataProvider = params.provider ?? Metadata.Provider;
    const promptRun = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', params.contextUser);
    try {
      promptRun.NewRecord();

      promptRun.PromptID = prompt.ID;
      promptRun.ModelID = model.ID;

      // Set ChildPromptID if this is a hierarchical execution with child prompts
      if (params.childPrompts && params.childPrompts.length > 0) {
        promptRun.ChildPromptID = params.childPrompts[0].childPrompt.prompt.ID;
      }
      
      // Set initial status and tracking fields
      promptRun.Status = 'Running';
      promptRun.Cancelled = false;
      promptRun.CacheHit = false;
      promptRun.StreamingEnabled = false;
      promptRun.WasSelectedResult = false;
      
      // Set model selection tracking fields
      if (modelSelectionInfo) {
        // Convert the rich entity objects to simple IDs/names for database storage
        const dbSelectionInfo = {
          configurationId: modelSelectionInfo.aiConfiguration?.ID,
          configurationName: modelSelectionInfo.aiConfiguration?.Name,
          modelsConsidered: modelSelectionInfo.modelsConsidered.map(mc => ({
            modelId: mc.model.ID,
            modelName: mc.model.Name,
            vendorId: mc.vendor?.ID,
            vendorName: mc.vendor?.Name || 'default',
            priority: mc.priority,
            available: mc.available,
            unavailableReason: mc.unavailableReason
          })),
          modelSelected: modelSelectionInfo.modelSelected?.ID,
          vendorSelected: modelSelectionInfo.vendorSelected?.ID,
          selectionReason: modelSelectionInfo.selectionReason,
          fallbackUsed: modelSelectionInfo.fallbackUsed,
          selectionStrategy: modelSelectionInfo.selectionStrategy
        };
        
        promptRun.ModelSelection = JSON.stringify(dbSelectionInfo);
        promptRun.SelectionStrategy = modelSelectionInfo.selectionStrategy || 'Default';
        
        // Set ModelPowerRank if available
        if (model.PowerRank != null) {
          promptRun.ModelPowerRank = model.PowerRank;
        }
      }
      
      // Set original model tracking for failover
      promptRun.OriginalModelID = model.ID;
      promptRun.OriginalRequestStartTime = startTime;

      // Initialize failover tracking fields
      promptRun.FailoverAttempts = 0;
      promptRun.FailoverErrors = null;
      promptRun.FailoverDurations = null;
      promptRun.TotalFailoverDuration = 0;
      
      // Check if model has pre-selected vendor info from selectModel
      const modelWithVendor = model as MJAIModelEntityExtended & { 
        _selectedVendorId?: string;
      };
      
      if (modelSelectionInfo) {
        promptRun.VendorID = modelSelectionInfo.vendorSelected?.ID || vendorId || modelWithVendor._selectedVendorId;
      } 
      else if (vendorId) {
        // Explicit vendor ID provided
        promptRun.VendorID = vendorId;
      } else if (modelWithVendor._selectedVendorId) {
        // Use vendor selected during model selection (with API key verification)
        promptRun.VendorID = modelWithVendor._selectedVendorId;
      } else {
        // Fallback: grab the highest priority AI Model Vendor record for this model (inference providers only)
        const modelVendors = AIEngine.Instance.ModelVendors
          .filter((mv) => UUIDsEqual(mv.ModelID, model.ID) && mv.Status === 'Active' && ModelResolver.Instance.IsInferenceProvider(mv))
          .sort((a, b) => b.Priority - a.Priority);
        
        if (modelVendors.length > 0) {
          promptRun.VendorID = modelVendors[0].VendorID;
        }
      }
      promptRun.ConfigurationID = params.configurationId;
      promptRun.RunAt = startTime;
      
      // Set AgentRunID if provided for agent-prompt execution tracking
      if (params.agentRunId) {
        promptRun.AgentRunID = params.agentRunId;
      }

      // Resolve and save the effort level used (same precedence as ChatParams resolution)
      if (params.effortLevel !== undefined && params.effortLevel !== null) {
        promptRun.EffortLevel = params.effortLevel;
      } else if (prompt.EffortLevel !== undefined && prompt.EffortLevel !== null) {
        promptRun.EffortLevel = prompt.EffortLevel;
      }
      // If neither is set, EffortLevel remains null (provider default was used)

      // Set ParentID for hierarchical prompt execution tracking
      if (params.parentPromptRunId) {
        promptRun.ParentID = params.parentPromptRunId;
      }

      // Set RerunFromPromptRunID if this is a rerun
      if (params.rerunFromPromptRunID) {
        promptRun.RerunFromPromptRunID = params.rerunFromPromptRunID;
      }

      // Always save the response format from the prompt if it exists
      if (prompt.ResponseFormat && prompt.ResponseFormat !== 'Any') {
        promptRun.ResponseFormat = prompt.ResponseFormat;
      }

      // Save the actual values that will be used (either from prompt defaults or additionalParameters)
      // First, apply defaults from prompt entity 
      if (prompt.Temperature != null) promptRun.Temperature = prompt.Temperature;
      if (prompt.TopP != null) promptRun.TopP = prompt.TopP;
      if (prompt.TopK != null) promptRun.TopK = prompt.TopK;
      if (prompt.MinP != null) promptRun.MinP = prompt.MinP;
      if (prompt.FrequencyPenalty != null) promptRun.FrequencyPenalty = prompt.FrequencyPenalty;
      if (prompt.PresencePenalty != null) promptRun.PresencePenalty = prompt.PresencePenalty;
      if (prompt.Seed != null) promptRun.Seed = prompt.Seed;
      if (prompt.StopSequences) promptRun.StopSequences = prompt.StopSequences;
      if (prompt.AssistantPrefill) promptRun.AssistantPrefill = prompt.AssistantPrefill;
      if (prompt.IncludeLogProbs != null) promptRun.LogProbs = prompt.IncludeLogProbs;
      if (prompt.TopLogProbs != null) promptRun.TopLogProbs = prompt.TopLogProbs;
      
      // Then override with additionalParameters if provided
      if (params.additionalParameters) {
        if (params.additionalParameters.temperature !== undefined) {
          promptRun.Temperature = params.additionalParameters.temperature;
        }
        if (params.additionalParameters.topP !== undefined) {
          promptRun.TopP = params.additionalParameters.topP;
        }
        if (params.additionalParameters.topK !== undefined) {
          promptRun.TopK = params.additionalParameters.topK;
        }
        if (params.additionalParameters.minP !== undefined) {
          promptRun.MinP = params.additionalParameters.minP;
        }
        if (params.additionalParameters.frequencyPenalty !== undefined) {
          promptRun.FrequencyPenalty = params.additionalParameters.frequencyPenalty;
        }
        if (params.additionalParameters.presencePenalty !== undefined) {
          promptRun.PresencePenalty = params.additionalParameters.presencePenalty;
        }
        if (params.additionalParameters.seed !== undefined) {
          promptRun.Seed = params.additionalParameters.seed;
        }
        if (params.additionalParameters.stopSequences !== undefined && params.additionalParameters.stopSequences.length > 0) {
          promptRun.StopSequences = JSON.stringify(params.additionalParameters.stopSequences);
        }
        if (params.additionalParameters.includeLogProbs !== undefined) {
          promptRun.LogProbs = params.additionalParameters.includeLogProbs;
        }
        if (params.additionalParameters.topLogProbs !== undefined) {
          promptRun.TopLogProbs = params.additionalParameters.topLogProbs;
        }
      }

      // Store the input data/context as JSON in Messages field
      if (params.data || params.templateData || systemPromptText) {
        const messages: ChatMessage[] = [];
        if (systemPromptText) {
          // Build the system prompt content, including prefill fallback if applicable
          let systemContent = systemPromptText;
          if (prompt.AssistantPrefill && prompt.PrefillFallbackMode === 'SystemInstruction') {
            const fallbackTemplate = this.resolvePrefillFallbackText(model, vendorId);
            const fallbackInstruction = fallbackTemplate.replace(/\{\{prefill\}\}/g, prompt.AssistantPrefill);
            systemContent += '\n\n' + fallbackInstruction;
          }
          messages.push({
            role: 'system',
            content: systemContent
          });
          messages.push(...params.conversationMessages || []);
        }
        promptRun.Messages = JSON.stringify({
          data: params.data,
          templateData: params.templateData,
          messages: messages || [],
        });
      }

      // Populate new retry tracking columns with initial values
      promptRun.ValidationBehavior = prompt.ValidationBehavior || 'Warn';
      promptRun.RetryStrategy = prompt.RetryStrategy || 'Fixed';
      promptRun.MaxRetriesConfigured = prompt.MaxRetries || 0;
      promptRun.FirstAttemptAt = startTime;
      promptRun.ValidationAttemptCount = 0; // Will be updated during execution
      promptRun.SuccessfulValidationCount = 0;
      promptRun.FinalValidationPassed = false; // Will be updated after execution

      const saveResult = await promptRun.Save();
      if (!saveResult) {
        const error = `Failed to save AIPromptRun: ${promptRun.LatestResult?.CompleteMessage || 'Unknown error'}`;
        this.logError(error, {
          category: 'PromptRunCreation',
          metadata: {
            promptId: prompt.ID,
            modelId: model.ID,
            vendorId
          },
          maxErrorLength: params.maxErrorLength
        });
        throw new Error(error);
      }
      
      // Invoke callback if provided
      if (params.onPromptRunCreated) {
        try {
          await params.onPromptRunCreated(promptRun.ID);
        } catch (callbackError) {
          LogStatus(`Error in onPromptRunCreated callback: ${callbackError.message}`);
          // Don't fail the execution if callback fails
        }
      }
      
      return promptRun;
    } catch (error) {
      const msg = `Error creating prompt run record: ${error.message} - ${promptRun?.LatestResult?.CompleteMessage} - ${promptRun?.LatestResult?.Errors[0]?.Message}`;
      this.logError(msg, {
        category: 'PromptRunSave',
        metadata: {
          promptRunId: promptRun.ID,
          saveError: promptRun.LatestResult?.CompleteMessage
        },
        maxErrorLength: params.maxErrorLength
      });
      throw new Error(msg);
    }
  }

  /**
   * Renders the prompt template with provided data
   */
  private async renderPromptTemplate(
    template: MJTemplateEntityExtended,
    params: AIPromptParams
  ): Promise<TemplateRenderResult> {
    try {
      // Get the highest priority content for the template
      const templateContent = template.GetHighestPriorityContent();
      if (!templateContent) {
        throw new Error(`No content found for template ${template.Name}`);
      }

      // Resolve system placeholders with full params context
      const systemPlaceholders = await SystemPlaceholderManager.resolveAllPlaceholders(params);

      // Merge data contexts with system placeholders having lowest priority
      const mergedData = { 
        ...systemPlaceholders,     // System placeholders first (lowest priority)
        ...params.data,            // User data overrides system placeholders
        ...params.templateData     // Template data has highest priority
      };

      //LogStatus(`🔧 Rendering template '${template.Name}' with ${Object.keys(systemPlaceholders).length} system placeholders`);

      // Render the template
      return await this._templateEngine.RenderTemplate(template, templateContent, mergedData);
    } catch (error) {
      this.logError(error, {
        category: 'TemplateRendering',
        metadata: {
          templateId: template.ID,
          templateName: template.Name,
          hasChildPrompts: !!params.childPrompts?.length
        },
        maxErrorLength: params.maxErrorLength
      });
      throw error;
    }
  }

  /**
   * Executes the AI model with failover support — Phase 1 thin wrapper around
   * `ModelResolver.WithFailover` (PR #2471).
   *
   * The cross-vendor candidate iteration, vendor-level filtering on
   * `Authentication`/`VendorValidationError`, rate-limit retry logic, and
   * `ContextLengthExceeded` short-circuit now live on `ModelResolver`. This
   * wrapper:
   *   1. Computes the legacy `FailoverConfiguration` from the prompt entity.
   *   2. Short-circuits to a single `executeModel` call when there are no
   *      candidates or strategy is `'None'` — preserves the prompt designer's
   *      hard-fail escape hatch (audit §3.5.8).
   *   3. Otherwise calls `ModelResolver.Instance.WithFailover` with the
   *      runner's `executeModel` as the per-candidate function. Re-raises
   *      `ChatResult{success:false, errorInfo:{canFailover:true}}` as a
   *      thrown error so the resolver's loop can react.
   *   4. On success: updates the prompt-run record with failover metadata.
   *   5. On exhaustion: WithFailover throws an aggregate Error carrying
   *      `cause` + `failoverAttempts`; the wrapper converts it back to a
   *      `ChatResult` via the runner's existing `createFailoverErrorResult`.
   */
  protected async executeModelWithFailover(
    model: MJAIModelEntityExtended,
    renderedPrompt: string,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    vendorId: string | null,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
    cancellationToken?: AbortSignal,
    allCandidates?: ResolvedModelCandidate[],
    promptRun?: MJAIPromptRunEntityExtended,
    vendorDriverClass?: string,
    vendorApiName?: string,
    vendorSupportsEffortLevel?: boolean,
    modelEffortLevel?: number
  ): Promise<ChatResult> {
    const failoverConfig = this.getFailoverConfiguration(prompt);

    // No candidates or 'None' strategy → single direct execution. Preserves
    // the runner's pre-extraction "no list-walking on hard-fail" semantic.
    if (!allCandidates || allCandidates.length === 0 || failoverConfig.strategy === 'None') {
      return this.executeModel(
        model, renderedPrompt, prompt, params, vendorId,
        conversationMessages, templateMessageRole, cancellationToken,
        vendorDriverClass, vendorApiName, vendorSupportsEffortLevel, modelEffortLevel
      );
    }

    try {
      const failoverResult = await ModelResolver.Instance.WithFailover<ChatResult>(
        allCandidates,
        async (candidate) => {
          const result = await this.executeModel(
            candidate.model,
            renderedPrompt,
            prompt,
            params,
            candidate.vendorId || null,
            conversationMessages,
            templateMessageRole,
            cancellationToken,
            candidate.driverClass,
            candidate.apiName,
            candidate.supportsEffortLevel,
            candidate.effortLevel
          );

          // Provider drivers (GeminiLLM, OpenAILLM, etc.) catch errors
          // internally and return ChatResult{success:false} instead of
          // throwing — so we re-raise here as an Error with the errorInfo
          // attached, letting the resolver's loop react identically to a
          // thrown exception.
          if (!result.success && result.errorInfo?.canFailover) {
            const err = (result.exception ?? new Error(result.errorMessage || 'Model execution failed')) as Error & {
              errorInfo?: AIErrorInfo;
            };
            err.errorInfo = result.errorInfo;
            throw err;
          }
          return result;
        },
        {
          failoverStrategy: failoverConfig.strategy as 'None' | 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank',
          modelStrategy: failoverConfig.modelStrategy,
          errorScope: failoverConfig.errorScope,
          maxAttempts: failoverConfig.maxAttempts,
          delaySeconds: failoverConfig.delaySeconds,
          maxRateLimitRetries: prompt.MaxRetries ?? 3,
          rateLimitRetryStrategy: (prompt.RetryStrategy as 'Fixed' | 'Linear' | 'Exponential' | undefined),
          rateLimitRetryDelayMs: prompt.RetryDelayMS ?? undefined,
          contextUser: params.contextUser,
          verbose: params.verbose,
          promptId: prompt.ID,
        }
      );

      if (failoverResult.failoverAttempts.length > 0 && promptRun) {
        this.updatePromptRunWithFailoverSuccess(
          promptRun,
          failoverResult.failoverAttempts,
          failoverResult.winner.model,
          failoverResult.winner.vendorId ?? null,
        );
      }
      return failoverResult.result;
    } catch (e) {
      const err = e as Error & { cause?: Error; failoverAttempts?: FailoverAttempt[] };
      const attempts = err.failoverAttempts ?? [];
      if (attempts.length > 0 && promptRun) {
        this.updatePromptRunWithFailoverFailure(promptRun, attempts);
      }
      return this.createFailoverErrorResult((err.cause as Error | null) ?? null, attempts);
    }
  }

  /**
   * Builds failover candidates for a prompt based on available models and type restrictions
   */
  protected async buildFailoverCandidates(prompt: MJAIPromptEntityExtended): Promise<ResolvedModelCandidate[]> {
    const aiEngine = AIEngine.Instance;
    
    // Get all models, filtered by type if specified
    let allModels: MJAIModelEntityExtended[];
    if (prompt.AIModelTypeID) {
      // Find the model type from the prompt
      const modelType = aiEngine.ModelTypes.find(mt => UUIDsEqual(mt.ID, prompt.AIModelTypeID));
      if (!modelType) {
        throw new Error(`Model type ${prompt.AIModelTypeID} not found`);
      }
      
      // Get all models of this specific type
      const targetTypeName = modelType.Name.trim().toLowerCase();
      allModels = aiEngine.Models.filter(m => {
        // Guard against AIModelType being non-string (defensive coding for data issues)
        const mType = typeof m.AIModelType === 'string' ? m.AIModelType.trim().toLowerCase() : '';
        return mType === targetTypeName;
      });
    } else {
      // No type restriction - get all models
      allModels = aiEngine.Models;
    }
    
    return this.createCandidatesFromModels(allModels);
  }

  /**
   * Creates model-vendor candidates from a list of models
   */
  protected createCandidatesFromModels(models: MJAIModelEntityExtended[]): ResolvedModelCandidate[] {
    const candidates: ResolvedModelCandidate[] = [];

    for (const model of models) {
      const vendors = model.ModelVendors || [];
      if (vendors.length === 0) {
        // Model without specific vendors
        candidates.push({
          model: model,
          vendorId: undefined,
          vendorName: undefined,
          driverClass: model.DriverClass,
          apiName: model.APIName,
          supportsEffortLevel: model.SupportsEffortLevel ?? false,
          isPreferredVendor: false,
          priority: model.PowerRank || 0,
          source: 'power-rank',
          // Legacy failover-only path bypasses pre-flight; assume true and let
          // execute-time errors surface missing credentials. Phase 5 deletes
          // this method (audit §6 disposition for buildFailoverCandidates).
          credentialsAvailable: true,
        });
      } else {
        // Add each vendor as a separate candidate
        for (const vendor of vendors) {
          candidates.push({
            model: model,
            vendorId: vendor.VendorID,
            vendorName: vendor.Vendor,
            driverClass: vendor.DriverClass || model.DriverClass,
            apiName: vendor.APIName || model.APIName,
            supportsEffortLevel: vendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
            isPreferredVendor: vendor.Priority > 0,
            priority: (model.PowerRank || 0) + (vendor.Priority || 0),
            source: 'power-rank',
            credentialsAvailable: true,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Updates prompt run with successful failover tracking data
   */
  protected updatePromptRunWithFailoverSuccess(
    promptRun: MJAIPromptRunEntityExtended,
    failoverAttempts: FailoverAttempt[],
    currentModel: MJAIModelEntityExtended,
    currentVendorId: string | null
  ): void {
    promptRun.FailoverAttempts = failoverAttempts.length;
    promptRun.FailoverErrors = JSON.stringify(failoverAttempts.map(a => ({
      model: a.modelId,
      vendor: a.vendorId,
      error: a.error.message,
      errorType: a.errorType
    })));
    promptRun.FailoverDurations = JSON.stringify(failoverAttempts.map(a => a.duration));
    promptRun.TotalFailoverDuration = failoverAttempts.reduce((sum, a) => sum + a.duration, 0);

    // Update ModelID if we ended up using a different model
    if (!UUIDsEqual(currentModel.ID, promptRun.OriginalModelID)) {
      promptRun.ModelID = currentModel.ID;
    }
    if (currentVendorId && !UUIDsEqual(currentVendorId, promptRun.VendorID)) {
      promptRun.VendorID = currentVendorId;
    }
  }

  /**
   * Updates prompt run with failover failure tracking data
   */
  private updatePromptRunWithFailoverFailure(
    promptRun: MJAIPromptRunEntityExtended,
    failoverAttempts: FailoverAttempt[]
  ): void {
    promptRun.FailoverAttempts = failoverAttempts.length;
    promptRun.FailoverErrors = JSON.stringify(failoverAttempts.map(a => ({
      model: a.modelId,
      vendor: a.vendorId,
      error: a.error.message,
      errorType: a.errorType
    })));
    promptRun.FailoverDurations = JSON.stringify(failoverAttempts.map(a => a.duration));
    promptRun.TotalFailoverDuration = failoverAttempts.reduce((sum, a) => sum + a.duration, 0);
  }

  /**
   * Creates an error result for failed failover attempts
   */
  private createFailoverErrorResult(lastError: Error | null, failoverAttempts: FailoverAttempt[]): ChatResult {
    const startTime = new Date();
    const endTime = new Date();

    // Check if this is a ContextLengthExceeded error - if so, mark as Fatal
    const hasContextLengthError = failoverAttempts.some(a =>
      a.errorType === 'ContextLengthExceeded' ||
      ErrorAnalyzer.analyzeError(a.error).errorType === 'ContextLengthExceeded'
    );

    // If ContextLengthExceeded and all failover attempts failed, this is fatal
    let errorInfo: AIErrorInfo | undefined;
    if (lastError) {
      errorInfo = ErrorAnalyzer.analyzeError(lastError);
      // Override severity to Fatal if context length exceeded and no larger models exist
      if (hasContextLengthError && errorInfo.errorType === 'ContextLengthExceeded') {
        errorInfo.severity = 'Fatal';
      }
    }

    return {
      success: false,
      startTime: startTime,
      endTime: endTime,
      errorMessage: lastError?.message || 'Unknown error',
      exception: lastError,
      errorInfo: errorInfo,
      statusText: `Failover failed after ${failoverAttempts.length} attempts`,
      timeElapsed: endTime.getTime() - startTime.getTime(),
      data: null
    };
  }

  /**
   * Executes the AI model with the rendered prompt
   */
  private async executeModel(
    model: MJAIModelEntityExtended,
    renderedPrompt: string,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    vendorId: string | null,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
    cancellationToken?: AbortSignal,
    vendorDriverClass?: string,
    vendorApiName?: string,
    vendorSupportsEffortLevel?: boolean,
    modelEffortLevel?: number
  ): Promise<ChatResult> {
    // define these variables here to ensure they're available in the catch block
    let driverClass: string;
    let apiName: string | undefined;
    let llm: BaseLLM;
    let chatParams: ChatParams;

    try {
      // Get verbose flag for logging
      const verbose = params.verbose === true || IsVerboseLoggingEnabled();

      // Determine if effort level is supported
      let supportsEffortLevel: boolean = false;

      // Get vendor-specific configuration
      // Use passed vendor info if available, otherwise fall back to vendor lookup
      if (vendorDriverClass && vendorApiName) {
        // Vendor info was provided by the caller (from model selection)
        driverClass = vendorDriverClass;
        apiName = vendorApiName;
        // Use provided vendorSupportsEffortLevel, or default to false
        supportsEffortLevel = vendorSupportsEffortLevel ?? false;
      } else {
        // Fallback to model defaults or vendor lookup
        driverClass = model.DriverClass;
        apiName = model.APIName;
        // Start with model's SupportsEffortLevel setting
        supportsEffortLevel = model.SupportsEffortLevel ?? false;

        if (vendorId) {
          // Find the AIModelVendor record for this specific vendor - must be an inference provider
          const modelVendor = AIEngine.Instance.ModelVendors.find(
            (mv) => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active' && ModelResolver.Instance.IsInferenceProvider(mv)
          );

          if (modelVendor) {
            driverClass = modelVendor.DriverClass || driverClass;
            apiName = modelVendor.APIName || apiName;
            // Use modelVendor's SupportsEffortLevel if available
            supportsEffortLevel = modelVendor.SupportsEffortLevel ?? supportsEffortLevel;
          } else {
            // Log warning if vendor was specified but not found or not an inference provider
            this.logStatus(`⚠️ Vendor ${vendorId} not found or is not an inference provider for model ${model.Name}, using model defaults`, true, params);
          }
        }
      }

      // Resolve credentials using hierarchical resolution (Credentials system with legacy fallback)
      const apiKey = await this.resolveCredentialForExecution(
        driverClass,
        prompt.ID,
        model.ID,
        vendorId ?? undefined,
        params
      );

      // Create LLM instance with vendor-specific driver class
      llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driverClass, apiKey);

      // Prepare chat parameters
      chatParams = new ChatParams();
      if (!apiName) {
        throw new Error(`No API name found for model ${model.Name}. Please ensure the model or its vendor configuration includes an APIName.`);
      }
      chatParams.model = apiName;
      chatParams.cancellationToken = cancellationToken;

      // Apply defaults from prompt entity first (if they exist)
      // These can be overridden by additionalParameters
      if (prompt.Temperature != null) chatParams.temperature = prompt.Temperature;
      if (prompt.TopP != null) chatParams.topP = prompt.TopP;
      if (prompt.TopK != null) chatParams.topK = prompt.TopK;
      if (prompt.MinP != null) chatParams.minP = prompt.MinP;
      if (prompt.FrequencyPenalty != null) chatParams.frequencyPenalty = prompt.FrequencyPenalty;
      if (prompt.PresencePenalty != null) chatParams.presencePenalty = prompt.PresencePenalty;
      if (prompt.Seed != null) chatParams.seed = prompt.Seed;
      if (prompt.StopSequences) {
        // Parse comma-delimited stop sequences
        chatParams.stopSequences = prompt.StopSequences.split(',').map((s: string) => s.replace(AIPromptRunner.STOP_SEQUENCE_TRIM_REGEX, '')).filter((s: string) => s.length > 0);
      }
      if (prompt.IncludeLogProbs != null) chatParams.includeLogProbs = prompt.IncludeLogProbs;
      if (prompt.TopLogProbs != null) chatParams.topLogProbs = prompt.TopLogProbs;

      // Apply additional parameters if provided (these override prompt defaults)
      if (params.additionalParameters) {
        // Apply chat-specific parameters from additionalParameters
        if (params.additionalParameters.temperature !== undefined) {
          chatParams.temperature = params.additionalParameters.temperature;
        }
        if (params.additionalParameters.topP !== undefined) {
          chatParams.topP = params.additionalParameters.topP;
        }
        if (params.additionalParameters.topK !== undefined) {
          chatParams.topK = params.additionalParameters.topK;
        }
        if (params.additionalParameters.minP !== undefined) {
          chatParams.minP = params.additionalParameters.minP;
        }
        if (params.additionalParameters.frequencyPenalty !== undefined) {
          chatParams.frequencyPenalty = params.additionalParameters.frequencyPenalty;
        }
        if (params.additionalParameters.presencePenalty !== undefined) {
          chatParams.presencePenalty = params.additionalParameters.presencePenalty;
        }
        if (params.additionalParameters.seed !== undefined) {
          chatParams.seed = params.additionalParameters.seed;
        }
        if (params.additionalParameters.stopSequences !== undefined) {
          chatParams.stopSequences = params.additionalParameters.stopSequences;
        }
        if (params.additionalParameters.includeLogProbs !== undefined) {
          chatParams.includeLogProbs = params.additionalParameters.includeLogProbs;
        }
        if (params.additionalParameters.topLogProbs !== undefined) {
          chatParams.topLogProbs = params.additionalParameters.topLogProbs;
        }
      }

      // Apply effortLevel with precedence hierarchy
      // 1. params.effortLevel (runtime override - highest priority)
      // 2. modelEffortLevel (model-specific override from AIPromptModel - second priority)
      // 3. Agent DefaultPromptEffortLevel (passed via params.effortLevel by BaseAgent - third priority)
      // 4. prompt.EffortLevel (prompt default - fourth priority)
      // 5. No effort level (provider default - lowest priority)
      const hasEffortLevel = (params.effortLevel !== undefined && params.effortLevel !== null) ||
                             (modelEffortLevel !== undefined && modelEffortLevel !== null) ||
                             (prompt.EffortLevel !== undefined && prompt.EffortLevel !== null);

      if (hasEffortLevel) {
        if (supportsEffortLevel) {
          // Vendor/model supports effort level, apply it with precedence
          if (params.effortLevel !== undefined && params.effortLevel !== null) {
            chatParams.effortLevel = params.effortLevel.toString();
          } else if (modelEffortLevel !== undefined && modelEffortLevel !== null) {
            chatParams.effortLevel = modelEffortLevel.toString();
          } else if (prompt.EffortLevel !== undefined && prompt.EffortLevel !== null) {
            chatParams.effortLevel = prompt.EffortLevel.toString();
          }
        } else {
          // Vendor/model does not support effort level, log warning
          const effortValue = params.effortLevel ?? modelEffortLevel ?? prompt.EffortLevel;
          console.log(`⚠️ Effort Level ${effortValue} specified but will be ignored - model ${model.Name} does not support effort levels`);
        }
      }
      // If none are set, effortLevel remains undefined and providers use their defaults

      // Apply response format from prompt settings
      if (prompt.ResponseFormat && prompt.ResponseFormat !== 'Any') {
        chatParams.responseFormat = prompt.ResponseFormat //as 'Any' | 'Text' | 'Markdown' | 'JSON' | 'ModelSpecific';
      } else {
        // if chatParams.responseFormat is not set or set to Any, stay silent on response format
        chatParams.responseFormat = undefined;
      }

      // Build message array with rendered prompt and conversation messages
      chatParams.messages = this.buildMessageArray(renderedPrompt, conversationMessages, templateMessageRole);

      // Resolve native file inputs: check each file against the driver's capabilities
      // and inject qualifying files as content blocks in the last user message.
      this.injectNativeFileInputs(params, llm, chatParams, verbose);

      // Apply assistant prefill (native or fallback) based on prompt config and provider support
      this.applyAssistantPrefill(chatParams, prompt, model, vendorId, llm);

      // Execute the model with cancellation support
      if (cancellationToken) {
        // If cancellation token is provided, wrap the execution to handle cancellation
        return await Promise.race([
          llm.ChatCompletion(chatParams),
          new Promise<never>((_, reject) => {
            if (cancellationToken.aborted) {
              reject(new Error('Chat completion was cancelled'));
            } else {
              cancellationToken.addEventListener('abort', () => {
                reject(new Error('Chat completion was cancelled'));
              });
            }
          }),
        ]);
      } else {
        // No cancellation token, execute normally
        return await llm.ChatCompletion(chatParams);
      }
    } catch (error) {
      const errorInfo = ErrorAnalyzer.analyzeError(error, driverClass)
      this.logError(error, {
        category: 'ModelExecution',
        model: model,
        metadata: {
          vendorId,
          errorInfo
        },
        maxErrorLength: params.maxErrorLength
      });
      throw error;
    }
  }

  /**
   * Builds the message array combining rendered prompt with conversation messages
   */
  /**
   * Checks each nativeFileInput against the resolved driver's FileCapabilities
   * and injects qualifying files as content blocks in the last user message.
   */
  private injectNativeFileInputs(params: AIPromptParams, llm: BaseLLM, chatParams: ChatParams, verbose: boolean): void {
    if (!params.nativeFileInputs?.length) return;

    const caps = llm.GetFileCapabilities();
    let nativeCount = 0;
    const fileBlocks: { type: 'file_url'; content: string; mimeType: string; fileName?: string }[] = [];
    const textFallbackBlocks: { type: 'text'; content: string }[] = [];

    for (const file of params.nativeFileInputs) {
      const strategy = ResolveFileInputStrategy(file.MimeType, file.SizeBytes, caps, null, nativeCount);
      if (strategy.UseNativeFileInput) {
        const dataUrl = file.Base64Content.startsWith('data:')
          ? file.Base64Content
          : 'data:' + file.MimeType + ';base64,' + file.Base64Content;
        fileBlocks.push({ type: 'file_url', content: dataUrl, mimeType: file.MimeType, fileName: file.Name });
        nativeCount++;
        this.logStatus('[NativeFileInput] Attaching \'' + file.Name + '\' (' + file.MimeType + ') natively to prompt', verbose, params);
      } else if (file.TextContent) {
        // Driver doesn't support this file type natively — fall back to
        // injecting pre-extracted text so the LLM can still see the content.
        textFallbackBlocks.push({
          type: 'text',
          content: `--- File: ${file.Name} (${file.MimeType}) ---\n${file.TextContent}\n--- End of file ---`,
        });
        this.logStatus('[NativeFileInput] Text fallback for \'' + file.Name + '\' (' + file.MimeType + '): ' + strategy.Reason, verbose, params);
      } else {
        this.logStatus('[NativeFileInput] Skipping \'' + file.Name + '\': ' + strategy.Reason + ' (no text fallback available)', verbose, params);
      }
    }

    if (fileBlocks.length === 0 && textFallbackBlocks.length === 0) return;

    // Find the last user message and convert its content to content blocks
    for (let i = chatParams.messages.length - 1; i >= 0; i--) {
      const msg = chatParams.messages[i];
      if (msg.role === 'user') {
        const textContent = typeof msg.content === 'string' ? msg.content : '';
        msg.content = [
          ...fileBlocks,
          ...textFallbackBlocks,
          { type: 'text', content: textContent },
        ];
        break;
      }
    }
  }

  private buildMessageArray(renderedPrompt: string, conversationMessages?: ChatMessage[], templateMessageRole: TemplateMessageRole = 'system'): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add rendered template as system or user message if not 'none'
    if (renderedPrompt && templateMessageRole !== 'none') {
      messages.push({
        role: templateMessageRole === 'system' ? ChatMessageRole.system : ChatMessageRole.user,
        content: renderedPrompt,
      });
    }

    // Add conversation messages if provided
    if (conversationMessages && conversationMessages.length > 0) {
      messages.push(...conversationMessages);
    }

    // If no conversation messages and no rendered prompt as user message,
    // add a default user message to ensure we have at least one user message
    if ((!conversationMessages || conversationMessages.length === 0) && templateMessageRole !== 'user' && renderedPrompt) {
      // If we only have a system message, we need a user message too
      if (templateMessageRole === 'system') {
        messages.push({
          role: ChatMessageRole.user,
          content: 'Please proceed with the above instructions.',
        });
      }
    } else if ((!conversationMessages || conversationMessages.length === 0) && !renderedPrompt) {
      // Fallback: if no conversation and no rendered prompt, add a basic user message
      messages.push({
        role: ChatMessageRole.user,
        content: 'Hello',
      });
    }

    return messages;
  }

  /**
   * Default fallback instruction text used when no PrefillFallbackText is configured
   * at any level of the AIModelType → AIModel → AIModelVendor cascade.
   */
  private static readonly DEFAULT_PREFILL_FALLBACK = '# **CRITICAL**\nYour response must start with exactly: {{prefill}}\nDo not add quotes, markdown formatting, or any other characters before it.';

  /**
   * Regex used to trim only horizontal whitespace (spaces and tabs) from the start and end
   * of each stop sequence token after comma-splitting.
   *
   * We intentionally do NOT use String.trim() here because stop sequences can legitimately
   * begin or end with newline characters. For example, the sequence "\n```" is designed to
   * match only a closing code fence (preceded by a newline), distinguishing it from an
   * opening "```json" fence that does not start with a newline. Using trim() would strip
   * that leading "\n", turning "\n```" into "```" and causing the stop to fire on the
   * opening fence instead — producing an empty response for non-native prefill providers.
   */
  private static readonly STOP_SEQUENCE_TRIM_REGEX = /^[ \t]+|[ \t]+$/g;

  /**
   * Resolves whether the current model/vendor supports native assistant prefill.
   *
   * Resolution order:
   *   1. Start with llm.SupportsPrefill (code-level default from BaseLLM subclass)
   *   2. AIModel.SupportsPrefill overrides if non-null
   *   3. AIModelVendor.SupportsPrefill overrides if non-null
   *
   * AIModelType.SupportsPrefill is NOT used because it is NOT NULL DEFAULT 0,
   * so there is no way to distinguish "explicitly disabled" from "never configured."
   * The code-level default (llm.SupportsPrefill) serves as the type-level default instead.
   *
   * - `null` at AIModel/AIModelVendor means "inherit" (defer to code default)
   * - `true` means "force enable" (overrides code default)
   * - `false` means "force disable" (overrides code default, even if the driver says yes)
   */
  private resolveSupportsPrefill(
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    llm: BaseLLM
  ): boolean {
    // Start with the code-level default from the BaseLLM subclass
    let supportsPrefill = llm.SupportsPrefill;

    // Model-level override (null = inherit from code default)
    if (model.SupportsPrefill != null) {
      supportsPrefill = model.SupportsPrefill;
    }

    // Vendor-level override (null = inherit)
    if (vendorId) {
      const modelVendor = AIEngine.Instance.ModelVendors.find(
        mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active'
      );
      if (modelVendor?.SupportsPrefill != null) {
        supportsPrefill = modelVendor.SupportsPrefill;
      }
    }

    return supportsPrefill;
  }

  /**
   * Resolves the prefill fallback instruction text using the cascade:
   * AIModelType → AIModel → AIModelVendor (most specific non-null wins).
   * Falls back to DEFAULT_PREFILL_FALLBACK if none are configured.
   */
  private resolvePrefillFallbackText(
    model: MJAIModelEntityExtended,
    vendorId: string | null
  ): string {
    // Start with model type default
    const modelType = AIEngine.Instance.ModelTypes.find(
      mt => UUIDsEqual(mt.ID, model.AIModelTypeID)
    );
    let fallbackText: string | null = modelType?.PrefillFallbackText ?? null;

    // Model-level override
    if (model.PrefillFallbackText != null) {
      fallbackText = model.PrefillFallbackText;
    }

    // Vendor-level override
    if (vendorId) {
      const modelVendor = AIEngine.Instance.ModelVendors.find(
        mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active'
      );
      if (modelVendor?.PrefillFallbackText != null) {
        fallbackText = modelVendor.PrefillFallbackText;
      }
    }

    return fallbackText ?? AIPromptRunner.DEFAULT_PREFILL_FALLBACK;
  }

  /**
   * Applies assistant prefill to ChatParams based on prompt configuration and provider support.
   * Handles the full prefill resolution logic including fallback to system instructions.
   */
  private applyAssistantPrefill(
    chatParams: ChatParams,
    prompt: MJAIPromptEntityExtended,
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    llm: BaseLLM
  ): void {
    const prefillText = prompt.AssistantPrefill;
    if (!prefillText) {
      return; // No prefill configured on this prompt
    }

    const supportsPrefill = this.resolveSupportsPrefill(model, vendorId, llm);

    if (supportsPrefill) {
      // Provider supports native prefill — use it directly
      chatParams.assistantPrefill = prefillText;
      return;
    }

    // Provider does NOT support native prefill — check fallback mode
    const fallbackMode = prompt.PrefillFallbackMode;

    if (fallbackMode === 'SystemInstruction') {
      // Inject a system instruction telling the model to start with the prefill text.
      // Append to the existing system message rather than adding a new one,
      // since some providers only support a single system message entry.
      const fallbackTemplate = this.resolvePrefillFallbackText(model, vendorId);
      const fallbackInstruction = fallbackTemplate.replace(/\{\{prefill\}\}/g, prefillText);

      const existingSystemMsg = chatParams.messages.find(m => m.role === ChatMessageRole.system);
      if (existingSystemMsg && typeof existingSystemMsg.content === 'string') {
        existingSystemMsg.content += '\n\n' + fallbackInstruction;
      } else {
        // No existing system message — add one
        chatParams.messages.unshift({
          role: ChatMessageRole.system,
          content: fallbackInstruction
        });
      }
    }
    // 'Ignore' and 'None' — silently skip, no action needed
  }

  /**
   * Executes the model with retry logic for validation failures
   */
  private async executeWithValidationRetries(
    selectedModel: MJAIModelEntityExtended,
    renderedPromptText: string,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    promptRun: MJAIPromptRunEntityExtended,
    allCandidates: ResolvedModelCandidate[],
    vendorDriverClass?: string,
    vendorApiName?: string,
    vendorSupportsEffortLevel?: boolean,
    modelEffortLevel?: number
  ): Promise<{
    modelResult: ChatResult;
    parsedResult: { result: unknown; validationResult?: ValidationResult };
    validationAttempts: ValidationAttempt[];
    cumulativeTokens: {
      promptTokens: number;
      completionTokens: number;
      totalCost: number;
    };
  }> {
    const validationAttempts: ValidationAttempt[] = [];
    const maxRetries = Math.max(0, prompt.MaxRetries || 0);
    let lastError: Error | null = null;
    
    // Track cumulative token usage across all attempts
    let cumulativePromptTokens = 0;
    let cumulativeCompletionTokens = 0;
    let cumulativeCost = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check for cancellation before each attempt
        if (params.cancellationToken?.aborted) {
          throw new Error('Execution was cancelled during validation retries');
        }

        if (attempt > 0) {
          LogStatus(`   🔄 Retrying execution due to validation failure, attempt ${attempt + 1}/${maxRetries + 1}`);
          await this.applyRetryDelay(prompt, attempt);
        }

        // Execute the AI model with failover support
        const modelResult = await this.executeModelWithFailover(
          selectedModel,
          renderedPromptText,
          prompt,
          params,
          promptRun.VendorID,
          params.conversationMessages,
          params.templateMessageRole || 'system',
          params.cancellationToken,
          allCandidates, // Pass the candidates from initial selection
          promptRun,
          vendorDriverClass,
          vendorApiName,
          vendorSupportsEffortLevel,
          modelEffortLevel
        );

        // Check for fatal errors - don't attempt validation/retry on these
        // Fatal errors (like ContextLengthExceeded when all models exhausted) cannot be resolved by retrying
        if (!modelResult.success && modelResult.errorInfo?.severity === 'Fatal') {
          // Record the fatal error attempt
          const validationAttempt: ValidationAttempt = {
            attemptNumber: attempt + 1,
            success: false,
            errorMessage: modelResult.errorMessage || 'Fatal error occurred',
            rawOutput: '',
            timestamp: new Date(),
          };
          validationAttempts.push(validationAttempt);

          // Return immediately - no point in validation or retries for fatal errors
          return {
            modelResult,
            parsedResult: {
              result: null,
              validationResult: undefined
            },
            validationAttempts,
            cumulativeTokens: {
              promptTokens: cumulativePromptTokens,
              completionTokens: cumulativeCompletionTokens,
              totalCost: cumulativeCost,
            },
          };
        }

        // Accumulate token usage from this attempt
        if (modelResult.data?.usage) {
          cumulativePromptTokens += modelResult.data.usage.promptTokens || 0;
          cumulativeCompletionTokens += modelResult.data.usage.completionTokens || 0;
          cumulativeCost += modelResult.data.usage.cost || 0;
        }

        // Parse and validate the result
        const { result, validationResult, validationErrors } = await this.parseAndValidateResultEnhanced(
          modelResult,
          prompt,
          params.skipValidation,
          params.cleanValidationSyntax,
          promptRun,
          params,
        );

        // Record this validation attempt
        const validationAttempt: ValidationAttempt = {
          attemptNumber: attempt + 1,
          success: validationResult?.Success || false,
          errorMessage: validationErrors?.length ? validationErrors.map(e => e.Message).join('; ') : undefined,
          validationErrors,
          rawOutput: modelResult.data?.choices?.[0]?.message?.content || '',
          parsedOutput: result,
          timestamp: new Date(),
        };
        validationAttempts.push(validationAttempt);

        if (validationResult?.Success !== false) {
          // Validation succeeded, return the result
          return {
            modelResult,
            parsedResult: { result, validationResult },
            validationAttempts,
            cumulativeTokens: {
              promptTokens: cumulativePromptTokens,
              completionTokens: cumulativeCompletionTokens,
              totalCost: cumulativeCost,
            },
          };
        }

        // Validation failed, check if we should retry
        // BUG FIX: Only retry in Strict mode, not in Warn or None modes
        if (prompt.ValidationBehavior === 'Strict' && attempt < maxRetries) {
          lastError = new Error(`Validation failed: ${validationErrors?.map(e => e.Message).join('; ')}`);
          LogStatus(`   ⚠️ Validation failed on attempt ${attempt + 1}, will retry (Strict mode)`);
          continue; // Retry
        } else {
          // Either not strict mode or no more retries, return what we have
          const reason = prompt.ValidationBehavior !== 'Strict' 
            ? `${prompt.ValidationBehavior || 'None'} mode - continuing with invalid output (no retry)`
            : 'max retries exceeded';
          LogStatus(`   ⚠️ Validation failed on attempt ${attempt + 1}, stopping retries (${reason})`);
          return {
            modelResult,
            parsedResult: { result, validationResult },
            validationAttempts,
            cumulativeTokens: {
              promptTokens: cumulativePromptTokens,
              completionTokens: cumulativeCompletionTokens,
              totalCost: cumulativeCost,
            },
          };
        }
      } catch (error) {
        lastError = error;
        this.logError(error, {
          category: 'ExecutionRetry',
          severity: attempt < maxRetries ? 'warning' : 'error',
          metadata: {
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            modelName: selectedModel.Name
          },
          maxErrorLength: params.maxErrorLength
        });

        // Record failed attempt
        const validationAttempt: ValidationAttempt = {
          attemptNumber: attempt + 1,
          success: false,
          errorMessage: error.message,
          rawOutput: '',
          timestamp: new Date(),
        };
        validationAttempts.push(validationAttempt);

        if (attempt === maxRetries) {
          throw error; // Last attempt, propagate error
        }
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Execution failed after all retry attempts');
  }


  /**
   * Provides a human-readable description of the validation decision
   */
  private getValidationDecisionDescription(
    finalSuccess: boolean, 
    totalAttempts: number, 
    validationBehavior: string
  ): string {
    if (finalSuccess) {
      return totalAttempts === 1 
        ? 'Validation passed on first attempt'
        : `Validation passed after ${totalAttempts} attempts`;
    } else {
      switch (validationBehavior) {
        case 'Strict':
          return `Validation failed after ${totalAttempts} attempts - execution marked as failed (Strict mode)`;
        case 'Warn':
          return `Validation failed after ${totalAttempts} attempts - warning logged, execution continued (Warn mode)`;
        case 'None':
          return `Validation skipped or ignored (None mode)`;
        default:
          return `Validation failed after ${totalAttempts} attempts - behavior: ${validationBehavior}`;
      }
    }
  }

  /**
   * Generates a JSON schema from an example object for validation
   */
  private generateSchemaFromExample(example: unknown): object {
    if (typeof example !== 'object' || example === null) {
      return { type: 'object' };
    }

    const schema: any = {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: true, // Allow additional properties for flexibility with examples
    };

    // Check if this entire object appears to be a placeholder/example
    const isPlaceholderObject = this.isObjectLikelyPlaceholder(example);

    for (const [key, value] of Object.entries(example)) {
      // For placeholder objects, generate very permissive schemas
      if (isPlaceholderObject) {
        // Don't define specific properties for placeholder objects
        // Just indicate it should be an object with any properties
        schema.properties = {};
        schema.required = [];
        break;
      }
      
      // Check if the key ends with '?' to indicate optional property (TypeScript style)
      const isOptional = key.endsWith('?');
      const cleanKey = isOptional ? key.slice(0, -1) : key;
      
      schema.properties[cleanKey] = this.generateSchemaForValue(value);
      
      // Don't make fields required if:
      // 1. They're marked as optional with '?'
      // 2. They look like placeholder/example values
      const isPlaceholder = this.isLikelyPlaceholder(cleanKey, value);
      if (!isOptional && !isPlaceholder) {
        schema.required.push(cleanKey);
      }
    }

    return schema;
  }

  /**
   * Detects if a key/value pair looks like a placeholder or example value
   */
  private isLikelyPlaceholder(key: string, value: unknown): boolean {
    // Check if key contains common placeholder patterns
    const placeholderKeyPatterns = /^(param|example|placeholder|sample|dummy|test)/i;
    if (placeholderKeyPatterns.test(key)) {
      return true;
    }

    // Check if string value contains common placeholder text
    if (typeof value === 'string') {
      const placeholderValuePatterns = /(goes here|placeholder|example|sample value|value\d+|UUID|your .* here|insert .* here)/i;
      if (placeholderValuePatterns.test(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detects if an entire object looks like it contains only placeholder/example data
   */
  private isObjectLikelyPlaceholder(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return false;
    }

    const entries = Object.entries(obj);
    
    // If object has placeholder-like keys (param1, param2, etc)
    const hasPlaceholderKeys = entries.some(([key]) => 
      /^(param\d+|key\d+|value\d+|example\d+|placeholder\d+)$/i.test(key)
    );

    // If all values are simple placeholders
    const allValuesArePlaceholders = entries.every(([key, value]) => 
      this.isLikelyPlaceholder(key, value)
    );

    return hasPlaceholderKeys || allValuesArePlaceholders;
  }

  /**
   * Generates schema for a specific value type
   */
  private generateSchemaForValue(value: unknown): object {
    if (value === null) {
      return { type: 'null' };
    }

    switch (typeof value) {
      case 'string':
        return { type: 'string' };
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'object':
        if (Array.isArray(value)) {
          if (value.length > 0) {
            return {
              type: 'array',
              items: this.generateSchemaForValue(value[0]),
              minItems: 0, // Don't require minimum items for example arrays
            };
          } else {
            return { type: 'array', minItems: 0 };
          }
        } else {
          return this.generateSchemaFromExample(value);
        }
      default:
        return { type: 'string' }; // Fallback
    }
  }

  /**
   * Enhanced parsing and validation with detailed error reporting and JSON repair capabilities.
   * 
   * @param modelResult - The raw result from the AI model
   * @param prompt - The AI prompt entity containing configuration
   * @param skipValidation - Whether to skip validation
   * @param cleanValidationSyntax - Whether to clean validation syntax from results
   * @param params - Optional prompt parameters containing additional configuration like attemptJSONRepair
   * @returns Parsed result with optional validation results and errors
   */
  private async parseAndValidateResultEnhanced(
    modelResult: ChatResult,
    prompt: MJAIPromptEntityExtended,
    skipValidation: boolean = false,
    cleanValidationSyntax: boolean = false,
    currentPromptRun: MJAIPromptRunEntityExtended,
    params?: AIPromptParams,
  ): Promise<{
    result: unknown;
    validationResult?: ValidationResult;
    validationErrors?: ValidationErrorInfo[];
  }> {
    const validationErrors: ValidationErrorInfo[] = [];
    let rawOutput: string | undefined;
    
    try {
      if (!modelResult.success) {
        throw new Error(`Model execution failed: ${modelResult.errorMessage}`);
      }

      rawOutput = modelResult.data?.choices?.[0]?.message?.content;
      if (!rawOutput) {
        throw new Error('No output received from model');
      }

      // Parse based on output type
      let parsedResult: unknown = rawOutput;

      try {
        switch (prompt.OutputType) {
          case 'string':
            parsedResult = this.parseStringOutput(rawOutput);
            break;

          case 'number':
            parsedResult = this.parseNumberOutput(rawOutput, skipValidation, validationErrors);
            break;

          case 'boolean':
            parsedResult = this.parseBooleanOutput(rawOutput, skipValidation, validationErrors);
            break;

          case 'date':
            parsedResult = this.parseDateOutput(rawOutput, skipValidation, validationErrors);
            break;

          case 'object':
            parsedResult = await this.parseObjectOutput(
              rawOutput, 
              prompt, 
              skipValidation, 
              cleanValidationSyntax, 
              validationErrors,
              currentPromptRun,
              params
            );
            break;
            
          default:
            parsedResult = rawOutput;
        }
      } catch (parseError) {
        // Type parsing failed
        const validationResult = new ValidationResult();
        validationResult.Success = false;
        const error = new ValidationErrorInfo('parseAndValidateResultEnhanced', `Invalid OutputExample JSON: ${parseError.message}`, rawOutput, ValidationErrorType.Failure);
        validationErrors.push(error);
        validationResult.Errors = validationErrors;
        return { result: rawOutput, validationResult, validationErrors };
      }

      // Perform JSON schema validation for object types
      if (!skipValidation && prompt.OutputExample && prompt.OutputType === 'object' && parsedResult) {
        try {
          const schemaValidationErrors = await this.validateAgainstSchema(parsedResult, prompt.OutputExample, prompt.ID);
          validationErrors.push(...schemaValidationErrors);
        } catch (schemaError) {
          const error = new ValidationErrorInfo('schema', `Schema validation failed: ${schemaError.message}`, undefined, ValidationErrorType.Failure);
          validationErrors.push(error);
        }
      }

      // Create validation result
      const validationResult = new ValidationResult();
      validationResult.Success = validationErrors.length === 0;
      validationResult.Errors = validationErrors;

      return { result: parsedResult, validationResult, validationErrors };

    } catch (error) {
      this.logError(error, {
        category: 'ResultValidation',
        metadata: {
          rawOutput: rawOutput?.substring(0, 200),
          outputType: prompt.OutputType,
          parseAttempt: true
        },
        maxErrorLength: params?.maxErrorLength
      });

      // Handle validation behavior
      const validationResult = new ValidationResult();
      validationResult.Success = false;
      validationResult.Errors = validationErrors.length > 0 ? validationErrors : [
        new ValidationErrorInfo('general', error.message, undefined, ValidationErrorType.Failure)
      ];

      switch (prompt.ValidationBehavior) {
        case 'Strict':
          return { result: undefined, validationResult, validationErrors: validationResult.Errors };
        case 'Warn':
          this.logError(error, {
            category: 'ValidationWarning',
            severity: 'warning',
            prompt: prompt,
            metadata: {
              validationPath: error.dataPath,
              validationMessage: error.message
            },
            maxErrorLength: params?.maxErrorLength
          });
          return { result: modelResult.data?.choices?.[0]?.message?.content, validationResult, validationErrors: validationResult.Errors };
        case 'None':
        default:
          // For None, we still return the validation result but mark as successful
          validationResult.Success = true;
          return { result: modelResult.data?.choices?.[0]?.message?.content, validationResult, validationErrors: [] };
      }
    }
  }

  /**
   * Parses a string output value.
   * 
   * @param rawOutput - The raw output from the model
   * @returns The parsed string value
   */
  private parseStringOutput(rawOutput: string): string {
    return rawOutput.toString();
  }

  /**
   * Parses a number output value with validation.
   * 
   * @param rawOutput - The raw output from the model
   * @param skipValidation - Whether to skip validation
   * @param validationErrors - Array to collect validation errors
   * @returns The parsed number value
   * @throws Error if the value cannot be parsed as a number and validation is enabled
   */
  private parseNumberOutput(
    rawOutput: string, 
    skipValidation: boolean, 
    validationErrors: ValidationErrorInfo[]
  ): number {
    const numberResult = parseFloat(rawOutput);
    if (isNaN(numberResult)) {
      if (!skipValidation) {
        const error = new ValidationErrorInfo('output', `Expected number output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
        validationErrors.push(error);
        throw new Error(error.Message);
      }
      return numberResult; // Will be NaN if skipValidation is true
    }
    return numberResult;
  }

  /**
   * Parses a boolean output value with flexible input handling.
   * 
   * @param rawOutput - The raw output from the model
   * @param skipValidation - Whether to skip validation
   * @param validationErrors - Array to collect validation errors
   * @returns The parsed boolean value
   * @throws Error if the value cannot be parsed as a boolean and validation is enabled
   */
  private parseBooleanOutput(
    rawOutput: string, 
    skipValidation: boolean, 
    validationErrors: ValidationErrorInfo[]
  ): boolean {
    const lowerOutput = rawOutput.toLowerCase().trim();
    if (['true', 'yes', '1'].includes(lowerOutput)) {
      return true;
    } else if (['false', 'no', '0'].includes(lowerOutput)) {
      return false;
    } else if (!skipValidation) {
      const error = new ValidationErrorInfo('output', `Expected boolean output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
      validationErrors.push(error);
      throw new Error(error.Message);
    }
    return false; // Default to false if skipValidation is true
  }

  /**
   * Parses a date output value with validation.
   * 
   * @param rawOutput - The raw output from the model
   * @param skipValidation - Whether to skip validation
   * @param validationErrors - Array to collect validation errors
   * @returns The parsed Date value
   * @throws Error if the value cannot be parsed as a date and validation is enabled
   */
  private parseDateOutput(
    rawOutput: string, 
    skipValidation: boolean, 
    validationErrors: ValidationErrorInfo[]
  ): Date {
    const dateResult = new Date(rawOutput);
    if (isNaN(dateResult.getTime()) && !skipValidation) {
      const error = new ValidationErrorInfo('output', `Expected date output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
      validationErrors.push(error);
      throw new Error(error.Message);
    }
    return dateResult;
  }

  /**
   * Parses an object (JSON) output value with optional repair capabilities.
   * 
   * @param rawOutput - The raw output from the model
   * @param prompt - The AI prompt entity containing configuration
   * @param skipValidation - Whether to skip validation
   * @param cleanValidationSyntax - Whether to clean validation syntax
   * @param validationErrors - Array to collect validation errors
   * @param params - Optional prompt parameters containing attemptJSONRepair flag
   * @returns The parsed object value
   * @throws Error if the value cannot be parsed as JSON and validation is enabled
   */
  private async parseObjectOutput(
    rawOutput: string,
    prompt: MJAIPromptEntityExtended,
    skipValidation: boolean,
    cleanValidationSyntax: boolean,
    validationErrors: ValidationErrorInfo[],
    currentPromptRun: MJAIPromptRunEntityExtended,
    params?: AIPromptParams
  ): Promise<unknown> {
    let parsedResult: unknown;
    
    try {
      // First attempt: Use CleanJSON to handle common JSON issues
      parsedResult = JSON.parse(CleanJSON(rawOutput));
    } catch (jsonError) {
      // If attemptJSONRepair is enabled and we're dealing with object output
      if (params?.attemptJSONRepair && prompt.OutputType === 'object') {
        parsedResult = await this.attemptJSONRepair(rawOutput, jsonError, params, currentPromptRun);
      } else {
        // Original error handling
        if (!skipValidation) {
          const error = new ValidationErrorInfo('output', `Expected JSON object but got invalid JSON: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
          validationErrors.push(error);
          throw new Error(error.Message);
        }
        return rawOutput; // Return raw output if skipping validation
      }
    }
    
    // Clean validation syntax if needed
    if (parsedResult && (cleanValidationSyntax || (!skipValidation && prompt.OutputExample))) {
      const validator = new JSONValidator();
      parsedResult = validator.cleanValidationSyntax<unknown>(parsedResult);
    }
    
    return parsedResult;
  }

  /**
   * Attempts to repair malformed JSON using a two-step process.
   * 
   * @param rawOutput - The malformed JSON string
   * @param originalError - The original parsing error
   * @param params - Prompt parameters containing contextUser
   * @returns The repaired and parsed JSON object
   * @throws Error if JSON repair fails
   */
  private async attemptJSONRepair(
    rawOutput: string,
    originalError: Error,
    params: AIPromptParams,
    currentPromptRun: MJAIPromptRunEntityExtended
  ): Promise<unknown> {
    // Step 0: First, see if the raw output has any { } [ ] characters at all
    // if not, we KNOW it is not JSON and we should not attempt to repair it
    if (!rawOutput.includes('{') && !rawOutput.includes('[')) {
      this.logError(new Error('Raw output does not contain any JSON-like characters'), {
        category: 'JSONRepairSkipped',
        metadata: {
          originalError: originalError.message,
          rawOutput: rawOutput.substring(0, 500)
        },
        maxErrorLength: params.maxErrorLength
      });
      throw new Error(`JSON repair skipped: raw output does not contain JSON-like characters. Original error: ${originalError.message}`);
    }

    // Step 1: Try JSON5 parsing
    try {
      this.logStatus('   🔧 Attempting JSON repair with JSON5...', true, params);
      // first try to clean JSON in case we have it in a markdown block
      let jsonToParse = rawOutput
      try {
        jsonToParse = CleanJSON(rawOutput);
      }
      catch (cleanError) {
        if (params.verbose) {
          this.logError(cleanError, {
            category: 'JSONCleaningFailed',
            metadata: {
              originalError: originalError.message,
              rawOutput: rawOutput.substring(0, 500)
            },
            maxErrorLength: params.maxErrorLength
          });
        }
      }
      const json5Result = JSON5.parse(jsonToParse);
      if (params.verbose) {
        this.logStatus('   ✅ JSON5 successfully parsed the malformed JSON', true, params);
      }
      return json5Result;
    } catch (json5Error) {
      // Step 2: Use AI to repair the JSON
      if (params.verbose) {
        this.logStatus('   🤖 JSON5 failed, attempting AI-based JSON repair...', true, params);
      }
      
      try {
        // Find the "Repair JSON" prompt in the "MJ: System" category
        const repairPrompt = AIEngine.Instance.Prompts.find(p => p.Name.trim().toLowerCase() === 'repair json' && p.Category.trim().toLowerCase() === 'mj: system');
        if (!repairPrompt) {
          throw new Error('Repair JSON prompt not found in MJ: System category');
        }
        
        // Run the repair prompt
        const repairResult = await this.ExecutePrompt({
          parentPromptRunId: currentPromptRun.ID,
          agentRunId: currentPromptRun.AgentRunID,
          contextUser: params.contextUser,
          prompt: repairPrompt,
          data: {
            ERROR_MESSAGE: originalError.message,
            MALFORMED_JSON: rawOutput
          },
          skipValidation: true // don't want to validate as this would cause recursive infinity scenario if the JSON is invalid. Just one shot, fix or no fix
        });
        
        if (!repairResult.success || !repairResult.result) {
          throw new Error('AI-based JSON repair failed' + (repairResult.errorMessage ? `: ${repairResult.errorMessage}` : ''));
        }
        // if we get here we have the text result in the reapairResult.result so let's try to parse it
        const repairedJSON = JSON.parse(repairResult.result as string);
        // make sure repairedJSON is not this object: { error: "not_json" } -- if it is that means the LLM said it isn't JSOn
        if (repairedJSON && typeof repairedJSON === 'object' && Object.keys(repairedJSON).length === 1 && repairedJSON.error?.trim().toLowerCase() === 'not_json') {
          throw new Error('AI-based JSON repair returned a non-JSON response indicating it could not repair the JSON');
        }

        // if we get here, we successfully repaired the JSON!!!
        this.logStatus('   ✅ AI successfully repaired the JSON', true, params);
        return repairedJSON;
      } catch (aiRepairError) {
        // Both repair attempts failed
        if (params.verbose) {
          this.logError(aiRepairError, {
            category: 'JSONRepairFailed',
            metadata: {
              originalError: originalError.message,
              json5Error: json5Error.message,
              aiError: aiRepairError.message,
              rawOutput: rawOutput.substring(0, 500)
            },
            maxErrorLength: params.maxErrorLength
          });
        }        
        
        throw new Error(`JSON repair failed after both JSON5 and AI attempts: ${originalError.message}`);
      }
    }
  }


  /**
   * Validates parsed result against JSON schema derived from OutputExample
   */
  private async validateAgainstSchema(
    parsedResult: unknown,
    outputExample: string,
    promptId: string,
  ): Promise<ValidationErrorInfo[]> {
    const validationErrors: ValidationErrorInfo[] = [];

    try {
      // Parse the output example
      let exampleObject: unknown;
      try {
        exampleObject = JSON.parse(outputExample);
      } catch (parseError) {
        const error = new ValidationErrorInfo('outputExample', `Invalid OutputExample JSON: ${parseError.message}`, outputExample, ValidationErrorType.Failure);
        validationErrors.push(error);
        return validationErrors;
      }

      // Use the JSONValidator to validate against the example
      const validationResult = this._jsonValidator.validate(parsedResult, exampleObject);
      validationErrors.push(...validationResult.Errors);

      if (validationErrors.length !== 0) {
        LogStatus(`⚠️ Validation found ${validationErrors.length} issues for prompt ${promptId}:`);
        validationErrors.forEach((error, index) => {
          LogStatus(`   ${index + 1}. ${error.Source}: ${error.Message}`);
        });
        LogStatus(`   Note: Validation syntax in OutputExample:`);
        LogStatus(`   - '?' = optional field (e.g., "reasoning?": "...")`);
        LogStatus(`   - '*' = required but any content (e.g., "payload*": {})`);
        LogStatus(`   - ':type' = type validation (e.g., "age:number": 25)`);
        LogStatus(`   - ':[N+]' = array length (e.g., "items:[2+]": [])`);
      }
      
      /* FUTURE IMPLEMENTATION - Keep this commented for reference
      // Get or create cached validator for this prompt using static cache
      let validator = AIPromptRunner._schemaCache.get(promptId);
      
      if (!validator) {
        // Parse the output example
        let exampleObject: unknown;
        try {
          exampleObject = JSON.parse(outputExample);
        } catch (parseError) {
          const error = new ValidationErrorInfo('outputExample', `Invalid OutputExample JSON: ${parseError.message}`, outputExample, ValidationErrorType.Failure);
          validationErrors.push(error);
          return validationErrors;
        }

        // Generate schema from example
        const schema = this.generateSchemaFromExample(exampleObject);
        
        // Compile and cache the validator
        try {
          validator = this._ajv.compile(schema);
          AIPromptRunner._schemaCache.set(promptId, validator);
          const cacheStats = AIPromptRunner.getSchemaCacheStats();
          LogStatus(`📋 Compiled and cached JSON schema for prompt ${promptId} (global cache size: ${cacheStats.size})`);
        } catch (compileError) {
          const error = new ValidationErrorInfo('schema', `Failed to compile schema: ${compileError.message}`, schema, ValidationErrorType.Failure);
          validationErrors.push(error);
          return validationErrors;
        }
      }

      // Validate the result
      const isValid = validator(parsedResult);
      
      if (!isValid && validator.errors) {
        for (const ajvError of validator.errors) {
          const fieldPath = ajvError.instancePath || ajvError.schemaPath || 'root';
          const message = `${ajvError.instancePath || 'root'}: ${ajvError.message}`;
          const error = new ValidationErrorInfo(fieldPath, message, ajvError.data, ValidationErrorType.Failure);
          validationErrors.push(error);
        }
      }

      if (validationErrors.length === 0) {
        //LogStatus(`✅ Schema validation passed for prompt ${promptId}`);
      } else {
        LogStatus(`⚠️ Schema validation found ${validationErrors.length} potential issues for prompt ${promptId}:`);
        validationErrors.forEach((error, index) => {
          LogStatus(`   ${index + 1}. ${error.Source}: ${error.Message}`);
        });
        // Log additional context to help with debugging
        LogStatus(`   Note: The schema was generated from OutputExample. Consider:`);
        LogStatus(`   - Mark optional properties with '?' suffix (e.g., "subAgent?": {...})`)
        LogStatus(`   - Example values like "param1", "value1" are treated as placeholders`);
      }
      */

    } catch (error) {
      const validationError = new ValidationErrorInfo('validation', `Unexpected validation error: ${error.message}`, undefined, ValidationErrorType.Failure);
      validationErrors.push(validationError);
    }

    return validationErrors;
  }


  /**
   * Updates the AIPromptRun entity with execution results
   */
  private async updatePromptRun(
    promptRun: MJAIPromptRunEntityExtended,
    prompt: MJAIPromptEntityExtended,
    modelResult: ChatResult,
    parsedResult: { result: unknown; validationResult?: ValidationResult },
    endTime: Date,
    executionTimeMS: number,
    validationAttempts?: ValidationAttempt[],
    cumulativeTokens?: {
      promptTokens: number;
      completionTokens: number;
      totalCost: number;
    },
  ): Promise<void> {
    try {
      promptRun.CompletedAt = endTime;
      promptRun.ExecutionTimeMS = executionTimeMS;
      
      // Determine what to save as the result
      let resultToSave: string;
      const rawResult = modelResult.data?.choices?.[0]?.message?.content || '';
      
      if (parsedResult.result === undefined || 
          parsedResult.result === null || 
          (typeof parsedResult.result === 'string' && parsedResult.result.trim().length === 0)) {
        // Use raw result as fallback when parsed result is undefined, null, or empty string
        resultToSave = rawResult;
        
        // Also set error message when we have to fall back to raw result
        if (!promptRun.ErrorMessage) {
          const validationErrors = parsedResult.validationResult?.Errors;
          if (validationErrors && validationErrors.length > 0) {
            promptRun.ErrorMessage = `JSON parsing/validation failed: ${validationErrors.map(e => e.Message).join('; ')}`;
          } else {
            promptRun.ErrorMessage = 'Failed to parse result into expected format; raw output saved instead';
          }
        }
      } else if (typeof parsedResult.result === 'string') {
        resultToSave = parsedResult.result;
      } else {
        resultToSave = JSON.stringify(parsedResult.result);
      }
      
      promptRun.Result = resultToSave;

      // Extract token usage and cost - use cumulative if retries occurred
      if (cumulativeTokens && validationAttempts && validationAttempts.length > 1) {
        // Multiple attempts occurred, use cumulative totals
        promptRun.TokensPrompt = cumulativeTokens.promptTokens;
        promptRun.TokensCompletion = cumulativeTokens.completionTokens;
        promptRun.TokensUsed = cumulativeTokens.promptTokens + cumulativeTokens.completionTokens;
        promptRun.Cost = cumulativeTokens.totalCost;
        
        // Cost currency from the last model result
        if (modelResult.data?.usage?.costCurrency !== undefined) {
          promptRun.CostCurrency = modelResult.data.usage.costCurrency;
        }
      } else if (modelResult.data?.usage) {
        // Single attempt, use standard token tracking
        promptRun.TokensUsed = modelResult.data.usage.totalTokens;
        promptRun.TokensPrompt = modelResult.data.usage.promptTokens;
        promptRun.TokensCompletion = modelResult.data.usage.completionTokens;
        
        // Save cost information if available
        if (modelResult.data.usage.cost !== undefined) {
          promptRun.Cost = modelResult.data.usage.cost;
        }
        if (modelResult.data.usage.costCurrency !== undefined) {
          promptRun.CostCurrency = modelResult.data.usage.costCurrency;
        }
        
        // Save timing information if available
        if (modelResult.data.usage.queueTime !== undefined) {
          promptRun.QueueTime = modelResult.data.usage.queueTime;
        }
        if (modelResult.data.usage.promptTime !== undefined) {
          promptRun.PromptTime = modelResult.data.usage.promptTime;
        }
        if (modelResult.data.usage.completionTime !== undefined) {
          promptRun.CompletionTime = modelResult.data.usage.completionTime;
        }
      }
      
      // Save model-specific response details if available
      if (modelResult.modelSpecificResponseDetails) {
        promptRun.ModelSpecificResponseDetails = JSON.stringify(modelResult.modelSpecificResponseDetails);
      }

      // Populate retry tracking columns
      if (validationAttempts && validationAttempts.length > 0) {
        // Update retry tracking columns
        promptRun.ValidationAttemptCount = validationAttempts.length;
        promptRun.SuccessfulValidationCount = validationAttempts.filter(a => a.success).length;
        promptRun.FinalValidationPassed = parsedResult.validationResult?.Success === true;
        promptRun.LastAttemptAt = endTime;
        
        // Calculate total retry duration (excluding first attempt)
        if (validationAttempts.length > 1) {
          const firstAttemptTime = validationAttempts[0].timestamp;
          const lastAttemptTime = validationAttempts[validationAttempts.length - 1].timestamp;
          promptRun.TotalRetryDurationMS = lastAttemptTime.getTime() - firstAttemptTime.getTime();
        } else {
          promptRun.TotalRetryDurationMS = 0;
        }
        
        // Get final validation error if any
        const finalAttempt = validationAttempts[validationAttempts.length - 1];
        if (!finalAttempt.success && finalAttempt.errorMessage) {
          promptRun.FinalValidationError = finalAttempt.errorMessage.substring(0, 500); // Truncate to fit column
          promptRun.ValidationErrorCount = finalAttempt.validationErrors?.length || 0;
        }
        
        // Find most common validation error
        if (validationAttempts.some(a => !a.success)) {
          const errorCounts = new Map<string, number>();
          validationAttempts.forEach(attempt => {
            if (!attempt.success && attempt.errorMessage) {
              const count = errorCounts.get(attempt.errorMessage) || 0;
              errorCounts.set(attempt.errorMessage, count + 1);
            }
          });
          
          if (errorCounts.size > 0) {
            const [commonError] = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
            promptRun.CommonValidationError = commonError.substring(0, 255); // Truncate to fit column
          }
        }
        
        // Store detailed attempts in JSON columns
        promptRun.ValidationAttempts = JSON.stringify(validationAttempts.map(a => ({
          attemptNumber: a.attemptNumber,
          success: a.success,
          errorMessage: a.errorMessage,
          validationErrorCount: a.validationErrors?.length || 0,
          timestamp: a.timestamp.toISOString(),
          outputLength: a.rawOutput?.length || 0
        })));
        
        promptRun.ValidationSummary = JSON.stringify({
          totalAttempts: validationAttempts.length,
          successfulAttempts: validationAttempts.filter(a => a.success).length,
          finalSuccess: parsedResult.validationResult?.Success || false,
          validationBehavior: promptRun.ValidationBehavior,
          retryStrategy: promptRun.RetryStrategy,
          maxRetriesConfigured: promptRun.MaxRetriesConfigured,
          actualRetriesUsed: validationAttempts.length - 1,
          totalDurationMS: executionTimeMS,
          retryDurationMS: promptRun.TotalRetryDurationMS || 0,
          outputType: prompt.OutputType || 'unknown',
          hasOutputExample: !!(prompt.OutputExample),
          schemaValidationUsed: !!(prompt.OutputExample && prompt.OutputType === 'object'),
          finalValidationErrors: parsedResult.validationResult?.Errors?.map(e => ({
            source: e.Source,
            message: e.Message,
            type: e.Type,
            value: e.Value
          })) || [],
          validationDecision: this.getValidationDecisionDescription(
            parsedResult.validationResult?.Success || false,
            validationAttempts.length,
            promptRun.ValidationBehavior || 'Warn'
          )
        });
      } else {
        // No validation attempts (possibly skipped validation)
        promptRun.ValidationAttemptCount = 1; // At least one attempt was made
        promptRun.SuccessfulValidationCount = parsedResult.validationResult?.Success !== false ? 1 : 0;
        promptRun.FinalValidationPassed = parsedResult.validationResult?.Success !== false;
        promptRun.LastAttemptAt = endTime;
        promptRun.TotalRetryDurationMS = 0;
      }

      // Set Success flag based on validation result
      promptRun.Success = modelResult.success && (parsedResult.validationResult?.Success !== false);
      
      // Set final Status based on success
      promptRun.Status = promptRun.Success ? 'Completed' : 'Failed';
      
      // Set ErrorDetails if failed
      if (!promptRun.Success) {
        if (!modelResult.success && modelResult.errorMessage) {
          promptRun.ErrorDetails = modelResult.errorMessage;
        } else if (parsedResult.validationResult?.Success === false) {
          promptRun.ErrorDetails = `Validation failed: ${parsedResult.validationResult.Errors?.map(e => e.Message).join(', ')}`;
        }
      }

      // Note: Failover tracking fields are now updated directly in executeModelWithFailover
      // The promptRun entity already has the failover information set

      // With template composition, we only execute once so rollup equals regular fields
      promptRun.TokensPromptRollup = promptRun.TokensPrompt;
      promptRun.TokensCompletionRollup = promptRun.TokensCompletion;
      promptRun.TokensUsedRollup = promptRun.TokensUsed;
      if (promptRun.Cost !== undefined) {
        promptRun.TotalCost = promptRun.Cost;
      }

      const saveResult = await promptRun.Save();
      if (!saveResult) {
        // Safely extract error message using CompleteMessage getter
        let errorMsg = 'Unknown error';
        try {
          if (promptRun.LatestResult?.CompleteMessage) {
            errorMsg = typeof promptRun.LatestResult.CompleteMessage === 'string'
              ? promptRun.LatestResult.CompleteMessage
              : String(promptRun.LatestResult.CompleteMessage);
          }
        } catch (msgError) {
          errorMsg = 'Error accessing error message';
        }

        this.logError(`Failed to update AIPromptRun with results: ${errorMsg}`, {
          category: 'PromptRunUpdate',
          metadata: {
            promptRunId: promptRun.ID,
            updateError: errorMsg
          }
        });
      }
    } catch (error) {
      this.logError(error, {
        category: 'PromptRunUpdate',
        metadata: {
          promptRunId: promptRun.ID
        }
      });
    }
  }

  // ==================== CONTEXT LENGTH METHODS ====================

  /**
   * Estimates the number of tokens in a rendered prompt and conversation messages.
   * This is a rough estimation based on character count and typical token ratios.
   * 
   * @param renderedPrompt - The rendered prompt text
   * @param conversationMessages - Optional conversation messages
   * @returns Estimated token count
   */

  // ==================== FAILOVER METHODS ====================

  /**
   * Retrieves failover configuration from the prompt entity.
   *
   * @param prompt - The AI prompt entity containing failover settings
   * @returns FailoverConfiguration object with strategy and settings
   *
   * @remarks
   * This method extracts failover configuration from the prompt entity and provides
   * default values when configuration is not specified. Override this method to
   * implement custom failover configuration logic.
   */
  protected getFailoverConfiguration(prompt: MJAIPromptEntityExtended): FailoverConfiguration {
    return {
      strategy: prompt.FailoverStrategy || 'None',
      maxAttempts: prompt.FailoverMaxAttempts || 3,
      delaySeconds: prompt.FailoverDelaySeconds || 1,
      modelStrategy: prompt.FailoverModelStrategy || 'PreferSameModel',
      errorScope: prompt.FailoverErrorScope || 'All'
    };
  }

  /**
   * Validation-retry backoff. Used by `executeWithValidationRetries` when an
   * AI response fails JSON Schema / type validation and the runner re-prompts.
   *
   * NOTE: This is the **validation** retry path — distinct from the
   * **rate-limit** retry path inside the cross-vendor failover loop, which
   * now lives on `ModelResolver.WithFailover` (PR #2471). Both paths happen
   * to consume the same prompt fields (`RetryStrategy`, `RetryDelayMS`), but
   * they are different retry budgets and the validation path stays local to
   * the runner.
   */
  private calculateRetryDelay(
    prompt: MJAIPromptEntityExtended,
    attemptNumber: number,
    suggestedDelaySeconds?: number
  ): number {
    if (suggestedDelaySeconds && suggestedDelaySeconds > 0) {
      return suggestedDelaySeconds * 1000;
    }
    const baseDelay = prompt.RetryDelayMS || 1000;
    switch (prompt.RetryStrategy) {
      case 'Fixed':
        return baseDelay;
      case 'Linear':
        return baseDelay * attemptNumber;
      case 'Exponential':
        return baseDelay * Math.pow(2, attemptNumber - 1);
      default:
        return baseDelay;
    }
  }

  private async applyRetryDelay(prompt: MJAIPromptEntityExtended, attemptNumber: number, suggestedDelaySeconds?: number): Promise<void> {
    const delay = this.calculateRetryDelay(prompt, attemptNumber, suggestedDelaySeconds);
    const delaySeconds = (delay / 1000).toFixed(1);
    LogStatus(`   Waiting ${delaySeconds}s before retry (strategy: ${prompt.RetryStrategy || 'Fixed'})...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

}

