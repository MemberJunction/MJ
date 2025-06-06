import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ChatMessage, GetAIAPIKey } from '@memberjunction/ai';
import { LogError, LogStatus, Metadata, UserInfo, ValidationResult, ValidationErrorInfo, ValidationErrorType, RunView } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { AIModelEntityExtended, AIPromptEntity, AIPromptRunEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateEntityExtended, TemplateRenderResult } from '@memberjunction/templates-base-types';
import { ExecutionPlanner } from './ExecutionPlanner';
import { ParallelExecutionCoordinator } from './ParallelExecutionCoordinator';
import { ResultSelectionConfig } from './ParallelExecution';
import { AIEngine } from '@memberjunction/aiengine';
import Ajv, { JSONSchemaType, ValidateFunction, ErrorObject } from 'ajv';

/**
 * Callback function type for execution progress updates
 */
export type ExecutionProgressCallback = (progress: {
  /** Current step in the execution process */
  step: 'template_rendering' | 'model_selection' | 'execution' | 'validation' | 'parallel_coordination' | 'result_selection';
  /** Progress percentage (0-100) */
  percentage: number;
  /** Human-readable status message */
  message: string;
  /** Additional metadata about the current step */
  metadata?: Record<string, unknown>;
}) => void;

/**
 * Callback function type for streaming content updates during execution
 */
export type ExecutionStreamingCallback = (chunk: {
  /** The content chunk received */
  content: string;
  /** Whether this is the final chunk */
  isComplete: boolean;
  /** Which task/model is producing this content (for parallel execution) */
  taskId?: string;
  /** Model name producing this content */
  modelName?: string;
}) => void;

/**
 * Template message role type for better type safety
 */
export type TemplateMessageRole = 'system' | 'user' | 'none';

/**
 * Parameters for executing an AI prompt
 */
export class AIPromptParams {
  /**
   * The AI prompt to execute.
   * Note: Get prompts from AIEngine.Instance.Prompts after calling AIEngine.Config()
   */
  prompt: AIPromptEntity;

  /**
   * Data context for template rendering and prompt execution
   */
  data?: Record<string, unknown>;

  /**
   * Optional specific model to use (overrides prompt's model selection)
   */
  modelId?: string;

  /**
   * Optional specific vendor to use for inference routing
   */
  vendorId?: string;

  /**
   * Optional configuration ID for environment-specific behavior
   */
  configurationId?: string;

  /**
   * User context for authentication and permissions
   */
  contextUser?: UserInfo;

  /**
   * Whether to skip validation of the prompt output
   */
  skipValidation?: boolean;

  /**
   * Optional custom template data that augments the main data context
   */
  templateData?: Record<string, unknown>;

  /**
   * Optional conversation messages for multi-turn conversations
   * When provided, these messages will be combined with the rendered template
   * for direct conversation-style prompting
   */
  conversationMessages?: ChatMessage[];

  /**
   * Determines how the rendered template should be used in conversation messages
   * 'system' - Add rendered template as system message (default)
   * 'user' - Add rendered template as user message
   * 'none' - Don't add rendered template to conversation
   */
  templateMessageRole?: TemplateMessageRole;

  /**
   * Optional cancellation token to abort the prompt execution
   * When this signal is aborted, the execution will be cancelled and any
   * running operations will be terminated as gracefully as possible
   */
  cancellationToken?: AbortSignal;

  /**
   * Optional callback for receiving execution progress updates
   * Provides real-time information about the execution progress
   */
  onProgress?: ExecutionProgressCallback;

  /**
   * Optional callback for receiving streaming content updates
   * Called when AI models support streaming responses
   */
  onStreaming?: ExecutionStreamingCallback;

  /**
   * Optional agent run ID to link this prompt execution to a parent agent run
   * When provided, the AIPromptRun record will include this as AgentRunID for comprehensive execution tracking
   */
  agentRunId?: string;
}

/**
 * Execution status enumeration for better type safety
 */
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Cancellation reason enumeration
 */
export type CancellationReason = 'user_requested' | 'timeout' | 'error' | 'resource_limit';

/**
 * Model information type for consistent usage across results
 */
export interface ModelInfo {
  modelId: string;
  modelName: string;
  vendorId?: string;
  vendorName?: string;
  powerRank?: number;
  modelType?: string;
}

/**
 * Judge metadata type for consistent usage
 */
export interface JudgeMetadata {
  judgePromptId: string;
  judgeExecutionTimeMS: number;
  judgeTokensUsed?: number;
  judgeCancelled?: boolean;
  judgeErrorMessage?: string;
}

/**
 * Extended validation result with detailed information about validation attempts
 */
export interface ValidationAttempt {
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** Whether this attempt passed validation */
  success: boolean;
  /** Error message if validation failed */
  errorMessage?: string;
  /** Detailed validation errors */
  validationErrors?: ValidationErrorInfo[];
  /** Raw output that was validated */
  rawOutput: string;
  /** Parsed output if successful */
  parsedOutput?: unknown;
  /** Timestamp of this validation attempt */
  timestamp: Date;
}

/**
 * Result of an AI prompt execution
 */
export class AIPromptRunResult {
  /**
   * Whether the execution was successful
   */
  success: boolean;

  /**
   * Current execution status
   */
  status?: ExecutionStatus;

  /**
   * Whether the execution was cancelled
   */
  cancelled?: boolean;

  /**
   * Reason for cancellation if applicable
   */
  cancellationReason?: CancellationReason;

  /**
   * The raw result from the AI model
   */
  rawResult?: string;

  /**
   * The parsed/validated result based on OutputType
   */
  result?: unknown;

  /**
   * Error message if execution failed
   */
  errorMessage?: string;

  /**
   * The AIPromptRun entity that was created for tracking
   */
  promptRun?: AIPromptRunEntity;

  /**
   * Total execution time in milliseconds
   */
  executionTimeMS?: number;

  /**
   * Tokens used in the execution
   */
  tokensUsed?: number;

  /**
   * Validation result if output validation was performed
   */
  validationResult?: ValidationResult;

  /**
   * Detailed information about all validation attempts made
   */
  validationAttempts?: ValidationAttempt[];

  /**
   * Additional results from parallel execution, ranked by judge
   * Index 0 = second best, Index 1 = third best, etc.
   * (The best result is the main result object itself)
   */
  additionalResults?: AIPromptRunResult[];

  /**
   * Ranking assigned by judge (1 = best, 2 = second best, etc.)
   */
  ranking?: number;

  /**
   * Judge's rationale for this ranking
   */
  judgeRationale?: string;

  /**
   * Model information for this result
   */
  modelInfo?: ModelInfo;

  /**
   * Metadata about the judging process (only present on the main result)
   */
  judgeMetadata?: JudgeMetadata;

  /**
   * Whether streaming was used for this execution
   */
  wasStreamed?: boolean;

  /**
   * Cache information if caching was involved
   */
  cacheInfo?: {
    cacheHit: boolean;
    cacheKey?: string;
    cacheSource?: string;
  };
}

/**
 * Advanced AI Prompt execution engine that supports template-driven prompts,
 * sophisticated model selection, parallelization, output validation, and comprehensive tracking.
 *
 * This class implements the enhanced AI Prompt system with support for:
 * - Template-based prompt generation using MJ Templates system
 * - Advanced model selection strategies (Default, Specific, ByPower)
 * - Parallel execution with multiple models and execution groups
 * - Structured output validation and type conversion
 * - Comprehensive execution tracking and analytics
 * - Configuration-driven behavior
 * - Real-time progress updates and streaming responses
 */
export class AIPromptRunner {
  private _metadata: Metadata;
  private _templateEngine: TemplateEngineServer;
  private _executionPlanner: ExecutionPlanner;
  private _parallelCoordinator: ParallelExecutionCoordinator;
  private _ajv: Ajv;
  
  // Static/global schema cache shared across all instances
  private static _schemaCache: Map<string, ValidateFunction> = new Map();
  private static _ajvInstance: Ajv | null = null;

  constructor() {
    this._metadata = new Metadata();
    this._templateEngine = TemplateEngineServer.Instance;
    this._executionPlanner = new ExecutionPlanner();
    this._parallelCoordinator = new ParallelExecutionCoordinator();
    
    // Use shared AJV instance for consistency
    if (!AIPromptRunner._ajvInstance) {
      AIPromptRunner._ajvInstance = new Ajv({ allErrors: true, verbose: true });
    }
    this._ajv = AIPromptRunner._ajvInstance;
  }

  /**
   * Clears the global schema cache. Useful for testing or when prompt schemas change.
   */
  public static clearSchemaCache(): void {
    AIPromptRunner._schemaCache.clear();
    LogStatus('Cleared global JSON schema cache');
  }

  /**
   * Gets cache statistics for monitoring purposes
   */
  public static getSchemaCacheStats(): { size: number; keys: string[] } {
    return {
      size: AIPromptRunner._schemaCache.size,
      keys: Array.from(AIPromptRunner._schemaCache.keys())
    };
  }

  /**
   * Executes an AI prompt with full support for templates, model selection, and validation.
   *
   * @param params Parameters for prompt execution
   * @returns Promise<AIPromptRunResult> The execution result with tracking information
   */
  public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
    const startTime = new Date();
    const promptRun: AIPromptRunEntity | null = null;

    // Check for cancellation at the start
    if (params.cancellationToken?.aborted) {
      return {
        success: false,
        status: 'cancelled',
        cancelled: true,
        cancellationReason: 'user_requested',
        errorMessage: 'Prompt execution was cancelled before starting',
        executionTimeMS: 0,
      };
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

      // Always render the template (needed for system prompt or user message)
      if (prompt.TemplateID && (!params.conversationMessages || params.templateMessageRole !== 'none')) {
        // Initialize template engine
        await this._templateEngine.Config(false, params.contextUser);

        // Load the template for the prompt
        const template = await this.loadTemplate(prompt.TemplateID, params.contextUser);
        if (!template) {
          throw new Error(`Template with ID ${prompt.TemplateID} not found for prompt ${prompt.Name}`);
        }

        // Render the template with provided data
        const renderedPrompt = await this.renderPromptTemplate(template, params.data, params.templateData);
        if (!renderedPrompt.Success) {
          throw new Error(`Failed to render template for prompt ${prompt.Name}: ${renderedPrompt.Message}`);
        }

        renderedPromptText = renderedPrompt.Output;
      }

      // Check for cancellation after template rendering
      if (params.cancellationToken?.aborted) {
        throw new Error('Prompt execution was cancelled during template rendering');
      }

      // Check if we need parallel execution based on ParallelizationMode
      const shouldUseParallelExecution = prompt.ParallelizationMode && prompt.ParallelizationMode !== 'None';

      if (shouldUseParallelExecution) {
        // Use parallel execution path
        return await this.executePromptInParallel(prompt, renderedPromptText, params, startTime);
      } else {
        // Use traditional single execution path
        return await this.executeSinglePrompt(prompt, renderedPromptText, params, startTime);
      }
    } catch (error) {
      LogError(error);

      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();

      // Update prompt run with error if it was created
      if (promptRun) {
        promptRun.CompletedAt = endTime;
        promptRun.ExecutionTimeMS = executionTimeMS;
        promptRun.Result = `ERROR: ${error.message}`;
        const saveResult = await promptRun.Save();
        if (!saveResult) {
          LogError(`Failed to save error to AIPromptRun: ${promptRun.LatestResult?.Message || 'Unknown error'}`);
        }
      }

      return {
        success: false,
        errorMessage: error.message,
        promptRun,
        executionTimeMS,
      };
    }
  }

  /**
   * Executes a single prompt (non-parallel) using traditional model selection.
   *
   * @param prompt - The AI prompt to execute
   * @param renderedPromptText - The rendered prompt text
   * @param params - Original execution parameters
   * @param startTime - Execution start time
   * @returns Promise<AIPromptRunResult> - The execution result
   */
  private async executeSinglePrompt(prompt: AIPromptEntity, renderedPromptText: string, params: AIPromptParams, startTime: Date): Promise<AIPromptRunResult> {
    // Check for cancellation before model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled before model selection');
    }

    // Select the model to use based on prompt configuration
    const selectedModel = await this.selectModel(prompt, params.modelId, params.contextUser, params.configurationId, params.vendorId);
    if (!selectedModel) {
      throw new Error(`No suitable model found for prompt ${prompt.Name}`);
    }

    // Check for cancellation after model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled after model selection');
    }

    // Create AIPromptRun record for tracking
    const promptRun = await this.createPromptRun(prompt, selectedModel, params, startTime, params.vendorId);

    // Check for cancellation before model execution
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled before model execution');
    }

    // Execute with retry logic for validation failures
    const { modelResult, parsedResult, validationAttempts } = await this.executeWithValidationRetries(
      selectedModel,
      renderedPromptText,
      prompt,
      params,
      promptRun,
    );

    // Calculate execution metrics
    const endTime = new Date();
    const executionTimeMS = endTime.getTime() - startTime.getTime();

    // Update the prompt run with results including validation attempts
    await this.updatePromptRun(promptRun, modelResult, parsedResult, endTime, executionTimeMS, validationAttempts);

    const chatResult = modelResult as ChatResult;
    return {
      success: true,
      rawResult: chatResult.data?.choices?.[0]?.message?.content,
      result: parsedResult.result,
      promptRun,
      executionTimeMS,
      tokensUsed: chatResult.data?.usage?.totalTokens,
      validationResult: parsedResult.validationResult,
      validationAttempts,
    };
  }

  /**
   * Executes a prompt using parallel execution with multiple models/tasks.
   *
   * @param prompt - The AI prompt to execute
   * @param renderedPromptText - The rendered prompt text
   * @param params - Original execution parameters
   * @param startTime - Execution start time
   * @returns Promise<AIPromptRunResult> - The aggregated execution result
   */
  private async executePromptInParallel(
    prompt: AIPromptEntity,
    renderedPromptText: string,
    params: AIPromptParams,
    startTime: Date,
  ): Promise<AIPromptRunResult> {
    // Check for cancellation before starting parallel execution
    if (params.cancellationToken?.aborted) {
      throw new Error('Parallel execution was cancelled before starting');
    }

    // Load AI Engine to get models and prompt models
    await AIEngine.Instance.Config(false, params.contextUser);

    // Get prompt-specific model associations
    const promptModels = AIEngine.Instance.PromptModels.filter(
      (pm) =>
        pm.PromptID === prompt.ID &&
        (pm.Status === 'Active' || pm.Status === 'Preview') &&
        (!params.configurationId || !pm.ConfigurationID || pm.ConfigurationID === params.configurationId),
    );

    // Create execution plan
    const executionTasks = this._executionPlanner.createExecutionPlan(
      prompt,
      promptModels,
      AIEngine.Instance.Models,
      renderedPromptText,
      params.contextUser,
      params.configurationId,
      params.conversationMessages,
      params.templateMessageRole || 'system',
    );

    if (executionTasks.length === 0) {
      throw new Error(`No execution tasks created for parallel execution of prompt ${prompt.Name}`);
    }

    // Check for cancellation before executing tasks
    if (params.cancellationToken?.aborted) {
      throw new Error('Parallel execution was cancelled before task execution');
    }

    // Execute tasks in parallel
    const parallelResult = await this._parallelCoordinator.executeTasksInParallel(executionTasks, undefined, undefined, params.cancellationToken, undefined, params.agentRunId);

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

    // Create a consolidated AIPromptRun record for the parallel execution
    const consolidatedPromptRun = await this.createPromptRun(prompt, selectedResult.task.model, params, startTime, params.vendorId);

    // Update with parallel execution metadata
    const endTime = new Date();
    consolidatedPromptRun.CompletedAt = endTime;
    consolidatedPromptRun.ExecutionTimeMS = parallelResult.totalExecutionTimeMS;
    consolidatedPromptRun.Result = selectedResult.rawResult || '';
    consolidatedPromptRun.TokensUsed = parallelResult.totalTokensUsed;

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
      });
    }

    const saveResult = await consolidatedPromptRun.Save();
    if (!saveResult) {
      LogError(`Failed to save consolidated AIPromptRun: ${consolidatedPromptRun.LatestResult?.Message || 'Unknown error'}`);
    }

    // Create additional results from all other successful results (excluding the best one)
    const additionalResults: AIPromptRunResult[] = [];

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
        const { result: parsedResultData, validationResult, validationErrors } = await this.parseAndValidateResultEnhanced(result.modelResult!, prompt, params.skipValidation);
        const parsedResult = { result: parsedResultData, validationResult };

        additionalResults.push({
          success: result.success,
          rawResult: result.rawResult,
          result: parsedResult.result,
          executionTimeMS: result.executionTimeMS,
          tokensUsed: result.tokensUsed,
          validationResult: parsedResult.validationResult,
          ranking: result.ranking,
          judgeRationale: result.judgeRationale,
          modelInfo: {
            modelId: result.task.model.ID,
            modelName: result.task.model.Name,
            vendorId: undefined, // VendorID not directly available on AIModel
            vendorName: result.task.model.Vendor,
          },
        });
      }
    }

    // Parse and validate the selected result
    const { result: selectedResultData, validationResult: selectedValidationResult } = await this.parseAndValidateResultEnhanced(selectedResult.modelResult!, prompt, params.skipValidation);
    const selectedParsedResult = { result: selectedResultData, validationResult: selectedValidationResult };

    return {
      success: true,
      rawResult: selectedResult.rawResult,
      result: selectedParsedResult.result,
      promptRun: consolidatedPromptRun,
      executionTimeMS: parallelResult.totalExecutionTimeMS,
      tokensUsed: parallelResult.totalTokensUsed,
      validationResult: selectedParsedResult.validationResult,
      additionalResults: additionalResults.length > 0 ? additionalResults : undefined,
      ranking: selectedResult.ranking || 1,
      judgeRationale: selectedResult.judgeRationale,
      modelInfo: {
        modelId: selectedResult.task.model.ID,
        modelName: selectedResult.task.model.Name,
        vendorId: undefined, // VendorID not directly available on AIModel
        vendorName: selectedResult.task.model.Vendor,
      },
      judgeMetadata: selectedResult.judgeMetadata,
    };
  }

  /**
   * Loads a template entity by ID
   */
  private async loadTemplate(templateId: string, _contextUser?: UserInfo): Promise<TemplateEntityExtended | null> {
    try {
      // Use the template engine to find the template
      const template = this._templateEngine.Templates.find((t: TemplateEntityExtended) => t.ID === templateId);
      return template || null;
    } catch (error) {
      LogError(`Error loading template ${templateId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Selects the appropriate AI model based on prompt configuration and parameters.
   * Uses AIPromptModels entity for prompt-specific model associations and fallback logic.
   */
  private async selectModel(
    prompt: AIPromptEntity,
    explicitModelId?: string,
    contextUser?: UserInfo,
    configurationId?: string,
    vendorId?: string,
  ): Promise<AIModelEntityExtended | null> {
    try {
      // Load AI Engine to access cached models and prompt models
      await AIEngine.Instance.Config(false, contextUser);

      // Resolve vendor ID to vendor name if provided
      let vendorName: string | undefined;
      if (vendorId) {
        try {
          const rv = new RunView();
          const vendorResult = await rv.RunView({
            EntityName: 'AI Vendors',
            ExtraFilter: `ID='${vendorId}'`,
            ResultType: 'entity_object',
          });

          if (vendorResult.Results && vendorResult.Results.length > 0) {
            vendorName = vendorResult.Results[0].Name;
          } else {
            LogError(`Vendor with ID ${vendorId} not found`);
            // Continue without vendor filtering rather than fail
          }
        } catch (error) {
          LogError(`Error loading vendor ${vendorId}: ${error.message}`);
          // Continue without vendor filtering rather than fail
        }
      }

      // If explicit model is specified, validate it from cached models
      if (explicitModelId) {
        const model = AIEngine.Instance.Models.find((m) => m.ID === explicitModelId && (!vendorName || m.Vendor === vendorName));
        if (model && model.IsActive) {
          return model;
        }
        // If explicit model not found or inactive, log warning but continue with normal selection
        LogError(`Explicit model ${explicitModelId} not found, inactive, or not from specified vendor, using prompt model selection`);
      }

      // Get prompt-specific model associations from AIPromptModels
      const promptModels = AIEngine.Instance.PromptModels.filter(
        (pm) =>
          pm.PromptID === prompt.ID &&
          (pm.Status === 'Active' || pm.Status === 'Preview') &&
          (!configurationId || !pm.ConfigurationID || pm.ConfigurationID === configurationId),
      );

      let candidateModels: AIModelEntityExtended[] = [];

      if (promptModels.length > 0) {
        // Use prompt-specific models if defined
        candidateModels = promptModels
          .map((pm) => AIEngine.Instance.Models.find((m) => m.ID === pm.ModelID))
          .filter((m) => m && m.IsActive && (!vendorName || m.Vendor === vendorName)) as AIModelEntityExtended[];

        // Sort by priority from AIPromptModels (higher priority first)
        candidateModels.sort((a, b) => {
          const aPriority = promptModels.find((pm) => pm.ModelID === a.ID)?.Priority || 0;
          const bPriority = promptModels.find((pm) => pm.ModelID === b.ID)?.Priority || 0;
          return bPriority - aPriority;
        });
      } else {
        // Fallback to automatic model selection based on prompt configuration
        const minPowerRank = prompt.MinPowerRank || 0;
        candidateModels = AIEngine.Instance.Models.filter(
          (m) =>
            m.IsActive &&
            m.PowerRank >= minPowerRank &&
            (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID) &&
            (!vendorName || m.Vendor === vendorName),
        );

        // Sort by power rank based on preference
        switch (prompt.PowerPreference) {
          case 'Highest':
            candidateModels.sort((a, b) => b.PowerRank - a.PowerRank);
            break;
          case 'Lowest':
            candidateModels.sort((a, b) => a.PowerRank - b.PowerRank);
            break;
          case 'Balanced':
          default:
            // For balanced, we could implement more sophisticated logic
            // For now, just use highest power
            candidateModels.sort((a, b) => b.PowerRank - a.PowerRank);
            break;
        }
      }

      if (candidateModels.length === 0) {
        LogError(`No suitable models found for prompt ${prompt.Name}`);
        return null;
      }

      // Return the top candidate model
      return candidateModels[0];
    } catch (error) {
      LogError(`Error selecting model for prompt ${prompt.Name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Creates an AIPromptRun entity for execution tracking
   */
  private async createPromptRun(
    prompt: AIPromptEntity,
    model: AIModelEntityExtended,
    params: AIPromptParams,
    startTime: Date,
    vendorId?: string,
  ): Promise<AIPromptRunEntity> {
    try {
      const promptRun = await this._metadata.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs', params.contextUser);
      promptRun.NewRecord();

      promptRun.PromptID = prompt.ID;
      promptRun.ModelID = model.ID;
      if (vendorId) {
        promptRun.VendorID = vendorId;
      } else {
        // need to grab the highest priority
        // AI Model Vendor record for this model
        const promptModels = AIEngine.Instance.PromptModels.filter((pm) => pm.ModelID === model.ID).sort((a, b) => b.Priority - a.Priority);
        if (promptModels.length > 0) {
          const highestPriorityModel = promptModels[0];
          promptRun.VendorID = highestPriorityModel.VendorID;
        }
      }
      promptRun.ConfigurationID = params.configurationId;
      promptRun.RunAt = startTime;
      
      // Set AgentRunID if provided for agent-prompt execution tracking
      if (params.agentRunId) {
        promptRun.AgentRunID = params.agentRunId;
      }

      // Store the input data/context as JSON in Messages field
      if (params.data || params.templateData) {
        promptRun.Messages = JSON.stringify({
          data: params.data,
          templateData: params.templateData,
        });
      }

      const saveResult = await promptRun.Save();
      if (!saveResult) {
        const error = `Failed to save AIPromptRun: ${promptRun.LatestResult?.Message || 'Unknown error'}`;
        LogError(error);
        throw new Error(error);
      }
      return promptRun;
    } catch (error) {
      LogError(`Error creating prompt run record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Renders the prompt template with provided data
   */
  private async renderPromptTemplate(
    template: TemplateEntityExtended,
    data?: Record<string, unknown>,
    templateData?: Record<string, unknown>,
  ): Promise<TemplateRenderResult> {
    try {
      // Get the highest priority content for the template
      const templateContent = template.GetHighestPriorityContent();
      if (!templateContent) {
        throw new Error(`No content found for template ${template.Name}`);
      }

      // Merge data contexts
      const mergedData = { ...data, ...templateData };

      // Render the template
      return await this._templateEngine.RenderTemplate(template, templateContent, mergedData);
    } catch (error) {
      LogError(`Error rendering template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Executes the AI model with the rendered prompt
   */
  private async executeModel(
    model: AIModelEntityExtended,
    renderedPrompt: string,
    prompt: AIPromptEntity,
    _contextUser?: UserInfo,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
    cancellationToken?: AbortSignal,
  ): Promise<ChatResult> {
    try {
      // Create LLM instance
      const apiKey = GetAIAPIKey(model.DriverClass);
      const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);

      // Prepare chat parameters
      const params = new ChatParams();
      params.model = model.APIName;
      params.cancellationToken = cancellationToken;

      // Build message array with rendered prompt and conversation messages
      params.messages = this.buildMessageArray(renderedPrompt, conversationMessages, templateMessageRole);

      // Apply response format constraints if specified
      if (prompt.ResponseFormat && prompt.ResponseFormat !== 'Any') {
        // TODO: Implement response format constraints based on prompt.ResponseFormat
        // This would involve setting the appropriate parameters for structured output
      }

      // Execute the model with cancellation support
      if (cancellationToken) {
        // If cancellation token is provided, wrap the execution to handle cancellation
        return await Promise.race([
          llm.ChatCompletion(params),
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
        return await llm.ChatCompletion(params);
      }
    } catch (error) {
      LogError(`Error executing model ${model.Name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Builds the message array combining rendered prompt with conversation messages
   */
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
   * Executes the model with retry logic for validation failures
   */
  private async executeWithValidationRetries(
    selectedModel: AIModelEntityExtended,
    renderedPromptText: string,
    prompt: AIPromptEntity,
    params: AIPromptParams,
    promptRun: AIPromptRunEntity,
  ): Promise<{
    modelResult: ChatResult;
    parsedResult: { result: unknown; validationResult?: ValidationResult };
    validationAttempts: ValidationAttempt[];
  }> {
    const validationAttempts: ValidationAttempt[] = [];
    const maxRetries = Math.max(0, prompt.MaxRetries || 0);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check for cancellation before each attempt
        if (params.cancellationToken?.aborted) {
          throw new Error('Execution was cancelled during validation retries');
        }

        if (attempt > 0) {
          LogStatus(`🔄 Retrying execution due to validation failure, attempt ${attempt + 1}/${maxRetries + 1}`);
          await this.applyRetryDelay(prompt, attempt);
        }

        // Execute the AI model
        const modelResult = await this.executeModel(
          selectedModel,
          renderedPromptText,
          prompt,
          params.contextUser,
          params.conversationMessages,
          params.templateMessageRole || 'system',
          params.cancellationToken,
        );

        // Parse and validate the result
        const { result, validationResult, validationErrors } = await this.parseAndValidateResultEnhanced(
          modelResult,
          prompt,
          params.skipValidation,
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

        // Update prompt run with current attempt information
        await this.updatePromptRunWithValidationAttempt(promptRun, validationAttempt, attempt + 1, maxRetries + 1);

        if (validationResult?.Success !== false) {
          // Validation succeeded, return the result
          LogStatus(`✅ Validation succeeded on attempt ${attempt + 1}/${maxRetries + 1}`);
          return {
            modelResult,
            parsedResult: { result, validationResult },
            validationAttempts,
          };
        }

        // Validation failed, check if we should retry
        if (prompt.ValidationBehavior === 'Strict' && attempt < maxRetries) {
          lastError = new Error(`Validation failed: ${validationErrors?.map(e => e.Message).join('; ')}`);
          LogStatus(`❌ Validation failed on attempt ${attempt + 1}, will retry (Strict mode)`);
          continue; // Retry
        } else {
          // Either not strict mode or no more retries, return what we have
          const reason = prompt.ValidationBehavior !== 'Strict' 
            ? `${prompt.ValidationBehavior} mode - continuing with invalid output`
            : 'max retries exceeded';
          LogStatus(`⚠️ Validation failed on attempt ${attempt + 1}, stopping retries (${reason})`);
          return {
            modelResult,
            parsedResult: { result, validationResult },
            validationAttempts,
          };
        }
      } catch (error) {
        lastError = error;
        LogError(`Execution attempt ${attempt + 1} failed: ${error.message}`);

        // Record failed attempt
        const validationAttempt: ValidationAttempt = {
          attemptNumber: attempt + 1,
          success: false,
          errorMessage: error.message,
          rawOutput: '',
          timestamp: new Date(),
        };
        validationAttempts.push(validationAttempt);

        // Update prompt run with failed attempt
        await this.updatePromptRunWithValidationAttempt(promptRun, validationAttempt, attempt + 1, maxRetries + 1);

        if (attempt === maxRetries) {
          throw error; // Last attempt, propagate error
        }
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Execution failed after all retry attempts');
  }

  /**
   * Applies retry delay based on the prompt's retry strategy
   */
  private async applyRetryDelay(prompt: AIPromptEntity, attemptNumber: number): Promise<void> {
    const baseDelay = prompt.RetryDelayMS || 1000; // Default 1 second
    let delay = baseDelay;

    switch (prompt.RetryStrategy) {
      case 'Fixed':
        delay = baseDelay;
        break;
      case 'Linear':
        delay = baseDelay * attemptNumber;
        break;
      case 'Exponential':
        delay = baseDelay * Math.pow(2, attemptNumber - 1);
        break;
      default:
        delay = baseDelay;
    }

    LogStatus(`Applying retry delay: ${delay}ms (strategy: ${prompt.RetryStrategy})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Updates the prompt run entity with information about a validation attempt
   */
  private async updatePromptRunWithValidationAttempt(
    promptRun: AIPromptRunEntity,
    attempt: ValidationAttempt,
    currentAttempt: number,
    totalAttempts: number,
  ): Promise<void> {
    try {
      // Update the Messages field with validation progress
      const currentMessages = promptRun.Messages ? JSON.parse(promptRun.Messages) : {};
      
      if (!currentMessages.validationAttempts) {
        currentMessages.validationAttempts = [];
      }
      
      currentMessages.validationAttempts.push({
        attempt: currentAttempt,
        totalAttempts,
        success: attempt.success,
        timestamp: attempt.timestamp.toISOString(),
        errorMessage: attempt.errorMessage,
        validationErrorCount: attempt.validationErrors?.length || 0,
        rawOutput: attempt.rawOutput?.substring(0, 500) + (attempt.rawOutput?.length > 500 ? '...' : ''), // Truncate for storage
        parsedOutput: attempt.parsedOutput ? JSON.stringify(attempt.parsedOutput).substring(0, 500) : undefined,
        validationErrors: attempt.validationErrors?.map(e => ({
          source: e.Source,
          message: e.Message,
          type: e.Type,
          value: typeof e.Value === 'string' ? e.Value.substring(0, 100) : e.Value
        })) || []
      });

      promptRun.Messages = JSON.stringify(currentMessages);
      
      // Don't save yet - we'll save at the end with final results
      LogStatus(`Recorded validation attempt ${currentAttempt}/${totalAttempts} for prompt run ${promptRun.ID}`);
    } catch (error) {
      LogError(`Error updating prompt run with validation attempt: ${error.message}`);
    }
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
      additionalProperties: false,
    };

    for (const [key, value] of Object.entries(example)) {
      schema.properties[key] = this.generateSchemaForValue(value);
      schema.required.push(key);
    }

    return schema;
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
            };
          } else {
            return { type: 'array' };
          }
        } else {
          return this.generateSchemaFromExample(value);
        }
      default:
        return { type: 'string' }; // Fallback
    }
  }

  /**
   * Enhanced parsing and validation with detailed error reporting
   */
  private async parseAndValidateResultEnhanced(
    modelResult: ChatResult,
    prompt: AIPromptEntity,
    skipValidation: boolean = false,
  ): Promise<{
    result: unknown;
    validationResult?: ValidationResult;
    validationErrors?: ValidationErrorInfo[];
  }> {
    const validationErrors: ValidationErrorInfo[] = [];
    
    try {
      if (!modelResult.success) {
        throw new Error(`Model execution failed: ${modelResult.errorMessage}`);
      }

      const rawOutput = modelResult.data?.choices?.[0]?.message?.content;
      if (!rawOutput) {
        throw new Error('No output received from model');
      }

      // Parse based on output type
      let parsedResult: unknown = rawOutput;

      try {
        switch (prompt.OutputType) {
          case 'string':
            parsedResult = rawOutput.toString();
            break;

          case 'number': {
            const numberResult = parseFloat(rawOutput);
            if (isNaN(numberResult)) {
              const error = new ValidationErrorInfo('output', `Expected number output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
              validationErrors.push(error);
              throw new Error(error.Message);
            }
            parsedResult = numberResult;
            break;
          }

          case 'boolean': {
            const lowerOutput = rawOutput.toLowerCase().trim();
            if (['true', 'yes', '1'].includes(lowerOutput)) {
              parsedResult = true;
            } else if (['false', 'no', '0'].includes(lowerOutput)) {
              parsedResult = false;
            } else {
              const error = new ValidationErrorInfo('output', `Expected boolean output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
              validationErrors.push(error);
              throw new Error(error.Message);
            }
            break;
          }

          case 'date': {
            const dateResult = new Date(rawOutput);
            if (isNaN(dateResult.getTime())) {
              const error = new ValidationErrorInfo('output', `Expected date output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
              validationErrors.push(error);
              throw new Error(error.Message);
            }
            parsedResult = dateResult;
            break;
          }

          case 'object':
            try {
              parsedResult = JSON.parse(rawOutput);
            } catch (jsonError) {
              const error = new ValidationErrorInfo('output', `Expected JSON object but got invalid JSON: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
              validationErrors.push(error);
              throw new Error(error.Message);
            }
            break;

          default:
            parsedResult = rawOutput;
        }
      } catch (parseError) {
        // Type parsing failed
        const validationResult = new ValidationResult();
        validationResult.Success = false;
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
      LogError(`Error parsing/validating result: ${error.message}`);

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
          LogError(`Validation warning for prompt ${prompt.Name}: ${error.message}`);
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
   * Validates parsed result against JSON schema derived from OutputExample
   */
  private async validateAgainstSchema(
    parsedResult: unknown,
    outputExample: string,
    promptId: string,
  ): Promise<ValidationErrorInfo[]> {
    const validationErrors: ValidationErrorInfo[] = [];

    try {
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
        LogStatus(`✅ Schema validation passed for prompt ${promptId}`);
      } else {
        LogStatus(`❌ Schema validation found ${validationErrors.length} errors for prompt ${promptId}:`);
        validationErrors.forEach((error, index) => {
          LogStatus(`   ${index + 1}. ${error.Source}: ${error.Message}`);
        });
      }

    } catch (error) {
      const validationError = new ValidationErrorInfo('validation', `Unexpected validation error: ${error.message}`, undefined, ValidationErrorType.Failure);
      validationErrors.push(validationError);
    }

    return validationErrors;
  }

  /**
   * Parses and validates the AI model result based on prompt configuration
   */
  private async parseAndValidateResult(
    modelResult: ChatResult,
    prompt: AIPromptEntity,
    skipValidation: boolean = false,
  ): Promise<{ result: unknown; validationResult?: ValidationResult }> {
    try {
      if (!modelResult.success) {
        throw new Error(`Model execution failed: ${modelResult.errorMessage}`);
      }

      const rawOutput = modelResult.data?.choices?.[0]?.message?.content;
      if (!rawOutput) {
        throw new Error('No output received from model');
      }

      // Parse based on output type
      let parsedResult: unknown = rawOutput;

      switch (prompt.OutputType) {
        case 'string':
          parsedResult = rawOutput.toString();
          break;

        case 'number': {
          const numberResult = parseFloat(rawOutput);
          if (isNaN(numberResult)) {
            throw new Error(`Expected number output but got: ${rawOutput}`);
          }
          parsedResult = numberResult;
          break;
        }

        case 'boolean': {
          const lowerOutput = rawOutput.toLowerCase().trim();
          if (['true', 'yes', '1'].includes(lowerOutput)) {
            parsedResult = true;
          } else if (['false', 'no', '0'].includes(lowerOutput)) {
            parsedResult = false;
          } else {
            throw new Error(`Expected boolean output but got: ${rawOutput}`);
          }
          break;
        }

        case 'date': {
          const dateResult = new Date(rawOutput);
          if (isNaN(dateResult.getTime())) {
            throw new Error(`Expected date output but got: ${rawOutput}`);
          }
          parsedResult = dateResult;
          break;
        }

        case 'object':
          try {
            parsedResult = JSON.parse(rawOutput);
          } catch (jsonError) {
            throw new Error(`Expected JSON object but got invalid JSON: ${rawOutput}`);
          }
          break;

        default:
          parsedResult = rawOutput;
      }

      // Validate against example if provided and validation is enabled
      const validationResult = new ValidationResult();
      validationResult.Success = true;

      if (!skipValidation && prompt.OutputExample && prompt.OutputType === 'object') {
        // TODO: Implement JSON schema validation against OutputExample
        // This would validate the structure of the parsed object against the example
      }

      return { result: parsedResult, validationResult };
    } catch (error) {
      LogError(`Error parsing/validating result: ${error.message}`);

      // Handle validation behavior
      switch (prompt.ValidationBehavior) {
        case 'Strict':
          throw error;
        case 'Warn':
          LogError(`Validation warning for prompt ${prompt.Name}: ${error.message}`);
          return { result: modelResult.data?.choices?.[0]?.message?.content };
        case 'None':
        default:
          return { result: modelResult.data?.choices?.[0]?.message?.content };
      }
    }
  }

  /**
   * Updates the AIPromptRun entity with execution results
   */
  private async updatePromptRun(
    promptRun: AIPromptRunEntity,
    modelResult: ChatResult,
    parsedResult: { result: unknown; validationResult?: ValidationResult },
    endTime: Date,
    executionTimeMS: number,
    validationAttempts?: ValidationAttempt[],
  ): Promise<void> {
    try {
      promptRun.CompletedAt = endTime;
      promptRun.ExecutionTimeMS = executionTimeMS;
      promptRun.Result = typeof parsedResult.result === 'string' ? parsedResult.result : JSON.stringify(parsedResult.result);

      // Extract token usage if available
      if (modelResult.data?.usage) {
        promptRun.TokensUsed = modelResult.data.usage.totalTokens;
        promptRun.TokensPrompt = modelResult.data.usage.promptTokens;
        promptRun.TokensCompletion = modelResult.data.usage.completionTokens;
      }

      // Add validation information to Messages field
      if (validationAttempts && validationAttempts.length > 0) {
        try {
          const currentMessages = promptRun.Messages ? JSON.parse(promptRun.Messages) : {};
          
          // Add final validation summary
          currentMessages.validationSummary = {
            totalAttempts: validationAttempts.length,
            successfulAttempts: validationAttempts.filter(a => a.success).length,
            finalValidationSuccess: parsedResult.validationResult?.Success || false,
            validationBehavior: promptRun.Messages ? 'Logged during execution' : 'Updated at completion',
            outputType: currentMessages.data?.prompt?.OutputType || 'unknown',
            hasOutputExample: !!(currentMessages.data?.prompt?.OutputExample),
            schemaValidationUsed: !!(currentMessages.data?.prompt?.OutputExample && currentMessages.data?.prompt?.OutputType === 'object'),
            retryStrategy: currentMessages.data?.prompt?.RetryStrategy || 'Fixed',
            maxRetries: currentMessages.data?.prompt?.MaxRetries || 0,
            finalValidationErrors: parsedResult.validationResult?.Errors?.map(e => ({
              source: e.Source,
              message: e.Message,
              type: e.Type,
              value: e.Value
            })) || [],
            validationDecision: this.getValidationDecisionDescription(
              parsedResult.validationResult?.Success || false,
              validationAttempts.length,
              currentMessages.data?.prompt?.ValidationBehavior || 'Warn'
            )
          };

          promptRun.Messages = JSON.stringify(currentMessages);
          LogStatus(`Updated prompt run ${promptRun.ID} with ${validationAttempts.length} validation attempts`);
        } catch (jsonError) {
          LogError(`Error updating Messages field with validation info: ${jsonError.message}`);
        }
      }

      // Set Success flag based on validation result
      promptRun.Success = modelResult.success && (parsedResult.validationResult?.Success !== false);

      // Calculate cost if possible (would need cost per token data)
      // TODO: Implement cost calculation based on model pricing

      const saveResult = await promptRun.Save();
      if (!saveResult) {
        LogError(`Failed to update AIPromptRun with results: ${promptRun.LatestResult?.Message || 'Unknown error'}`);
      }
    } catch (error) {
      LogError(`Error updating prompt run: ${error.message}`);
    }
  }
}

export function LoadAIPromptRunner() {
  // This function ensures the class isn't tree-shaken
}
