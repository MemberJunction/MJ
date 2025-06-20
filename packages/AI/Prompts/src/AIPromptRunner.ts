import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ChatMessage, GetAIAPIKey, ExecutionStatus, CancellationReason, ModelInfo, JudgeMetadata, ValidationAttempt, AIPromptRunResult } from '@memberjunction/ai';
import { LogError, LogStatus, Metadata, UserInfo, ValidationResult, ValidationErrorInfo, ValidationErrorType, RunView } from '@memberjunction/core';
import { CleanJSON, MJGlobal } from '@memberjunction/global';
import { AIModelEntityExtended, AIPromptEntity, AIPromptRunEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateEntityExtended, TemplateRenderResult } from '@memberjunction/templates-base-types';
import { ExecutionPlanner } from './ExecutionPlanner';
import { ParallelExecutionCoordinator } from './ParallelExecutionCoordinator';
import { ResultSelectionConfig } from './ParallelExecution';
import { AIEngine } from '@memberjunction/aiengine';
import Ajv, { JSONSchemaType, ValidateFunction, ErrorObject } from 'ajv';
import { SystemPlaceholderManager } from './SystemPlaceholders';
import { 
    ExecutionProgressCallback, 
    ExecutionStreamingCallback, 
    TemplateMessageRole,
    ChildPromptParam,
    AIPromptParams
} from './types';

// Re-export types that other modules need
export { TemplateMessageRole, AIPromptParams } from './types';












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
    const promptRun: AIPromptRunEntity | null = null;

    // Check for cancellation at the start
    if (params.cancellationToken?.aborted) {
      const result: AIPromptRunResult<T> = {
        success: false,
        status: 'cancelled',
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
      let parentPromptRun: AIPromptRunEntity | undefined;
      let selectedModel: AIModelEntityExtended | undefined;
      let childTemplateRenderingResult: { renderedTemplates: Record<string, string> } | undefined;

      // Handle different prompt execution modes
      if (params.childPrompts && params.childPrompts.length > 0) {
        // Hierarchical template composition mode - render child templates first, then compose
        LogStatus(`🌳 Composing prompt with ${params.childPrompts.length} child templates in hierarchical mode`);
        
        // Select model for parent prompt execution
        selectedModel = await this.selectModel(prompt, params.modelId, params.contextUser, params.configurationId, params.vendorId);
        if (!selectedModel) {
          throw new Error(`No suitable model found for prompt ${prompt.Name}`);
        }

        // Create parent prompt run for the final composed prompt execution
        parentPromptRun = await this.createPromptRun(prompt, selectedModel, params, startTime, params.vendorId);
        LogStatus(`📝 Created prompt run ${parentPromptRun.ID} for hierarchical template composition`);
        
        // Render all child prompt templates recursively
        childTemplateRenderingResult = await this.renderChildPromptTemplates(params.childPrompts, params, params.cancellationToken);
        
        // Render the parent prompt with child templates embedded
        renderedPromptText = await this.renderPromptWithChildTemplates(prompt, params, childTemplateRenderingResult.renderedTemplates);
        
        LogStatus(`✅ Hierarchical template composition completed with ${Object.keys(childTemplateRenderingResult.renderedTemplates).length} child templates embedded`);
        
      } else if (prompt.TemplateID && (!params.conversationMessages || params.templateMessageRole !== 'none')) {
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

      // Check for cancellation after template rendering
      if (params.cancellationToken?.aborted) {
        throw new Error('Prompt execution was cancelled during template rendering');
      }

      // Check if we need parallel execution based on ParallelizationMode
      const shouldUseParallelExecution = prompt.ParallelizationMode && prompt.ParallelizationMode !== 'None';

      let result: AIPromptRunResult<T>;
      if (shouldUseParallelExecution) {
        // Use parallel execution path
        result = await this.executePromptInParallel<T>(prompt, renderedPromptText, params, startTime, parentPromptRun);
      } else {
        // Use traditional single execution path
        result = await this.executeSinglePrompt<T>(prompt, renderedPromptText, params, startTime, parentPromptRun, selectedModel);
      }

      // Note: With template composition, we only execute once so no rollup calculations needed
      // The final composed prompt is executed as a single operation

      return result;
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

      const errorResult: AIPromptRunResult<T> = {
        success: false,
        errorMessage: error.message,
        promptRun,
        executionTimeMS,
        chatResult: { success: false, errorMessage: error.message } as ChatResult,
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
    prompt: AIPromptEntity, 
    renderedPromptText: string, 
    params: AIPromptParams, 
    startTime: Date,
    existingPromptRun?: AIPromptRunEntity,
    existingModel?: AIModelEntityExtended
  ): Promise<AIPromptRunResult<T>> {
    // Check for cancellation before model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled before model selection');
    }

    // Use existing model if provided (hierarchical case) or select one
    const selectedModel = existingModel || await this.selectModel(prompt, params.modelId, params.contextUser, params.configurationId, params.vendorId);
    if (!selectedModel) {
      throw new Error(`No suitable model found for prompt ${prompt.Name}`);
    }

    // Check for cancellation after model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled after model selection');
    }

    // Use existing prompt run if provided (hierarchical case) or create new one
    const promptRun = existingPromptRun || await this.createPromptRun(prompt, selectedModel, params, startTime, params.vendorId);

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
    const usage = chatResult.data?.usage;
    
    return {
      success: true,
      rawResult: chatResult.data?.choices?.[0]?.message?.content,
      result: parsedResult.result as T,
      chatResult,
      promptRun,
      executionTimeMS,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      tokensUsed: (usage?.promptTokens || 0) + (usage?.completionTokens || 0),
      cost: usage?.cost,
      costCurrency: usage?.costCurrency,
      validationResult: parsedResult.validationResult,
      validationAttempts,
      combinedTokensUsed: (usage?.promptTokens || 0) + (usage?.completionTokens || 0) // For single execution, same as tokensUsed
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
    prompt: AIPromptEntity,
    renderedPromptText: string,
    params: AIPromptParams,
    startTime: Date,
    existingPromptRun?: AIPromptRunEntity,
  ): Promise<AIPromptRunResult<T>> {
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
    const consolidatedPromptRun = existingPromptRun || await this.createPromptRun(prompt, selectedResult.task.model, params, startTime, params.vendorId);

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
      });
    }

    // For parallel execution, set rollup fields to match totals (no child execution to roll up)
    consolidatedPromptRun.TokensPromptRollup = totalPromptTokens;
    consolidatedPromptRun.TokensCompletionRollup = totalCompletionTokens;
    consolidatedPromptRun.TokensUsedRollup = totalPromptTokens + totalCompletionTokens;
    if (hasCost) {
      consolidatedPromptRun.TotalCost = totalCost;
    }

    const saveResult = await consolidatedPromptRun.Save();
    if (!saveResult) {
      LogError(`Failed to save consolidated AIPromptRun: ${consolidatedPromptRun.LatestResult?.Message || 'Unknown error'}`);
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
        const { result: parsedResultData, validationResult, validationErrors } = await this.parseAndValidateResultEnhanced(result.modelResult!, prompt, params.skipValidation);
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
    const { result: selectedResultData, validationResult: selectedValidationResult } = await this.parseAndValidateResultEnhanced(selectedResult.modelResult!, prompt, params.skipValidation);
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

    LogStatus(`🔄 Rendering ${childPrompts.length} child prompt templates in parallel`);

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
        LogStatus(`  🔹 Rendering child prompt template: ${childParam.childPrompt.prompt.Name} -> ${childParam.parentPlaceholder}`);
        
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
            ...params,
            data: mergedChildData,
            templateData: childParam.childPrompt.templateData
          });
          
          if (!childRenderResult.Success) {
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
        LogError(`Error rendering child prompt template for placeholder ${childParam.parentPlaceholder}: ${error.message}`);
        
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
      LogError(`${failedChildren.length} out of ${childResults.length} child prompt templates failed to render`);
      // Continue with available results rather than failing completely
    }

    // Build rendered templates map
    const renderedTemplatesMap: Record<string, string> = {};
    
    for (const childResult of childResults) {
      renderedTemplatesMap[childResult.placeholder] = childResult.renderedTemplate;
    }

    LogStatus(`✅ Completed rendering of ${childResults.length} child prompt templates`);
    
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
    prompt: AIPromptEntity,
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

      LogStatus(`🔧 Rendering prompt template with ${Object.keys(childTemplates).length} child templates and ${Object.keys(systemPlaceholders).length} system placeholders`);
      
      // Log placeholder replacement for debugging
      for (const [placeholder, template] of Object.entries(childTemplates)) {
        const truncatedTemplate = template.length > 100 ? template.substring(0, 100) + '...' : template;
        LogStatus(`  📝 ${placeholder} -> ${truncatedTemplate}`);
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
      LogError(`Error rendering prompt with child templates: ${error.message}`);
      throw error;
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
      // use metadata cache
      const vendorName: string | undefined = AIEngine.Instance.Vendors.find((v) => v.ID === vendorId)?.Name;      

      // If explicit model is specified, validate it from cached models
      if (explicitModelId) {
        const model = AIEngine.Instance.Models.find((m) => m.ID === explicitModelId && (!vendorName || m.Vendor === vendorName));
        if (!model) {
          throw new Error(`Specified model ${explicitModelId} not found in available models`);
        }
        if (!model.IsActive) {
          throw new Error(`Specified model ${model.Name} (${explicitModelId}) is not active`);
        }
        
        // Check if model type is compatible with prompt's model type requirement
        if (prompt.AIModelTypeID && model.AIModelTypeID !== prompt.AIModelTypeID) {
          const modelType = AIEngine.Instance.ModelTypes.find(mt => mt.ID === model.AIModelTypeID);
          const promptModelType = AIEngine.Instance.ModelTypes.find(mt => mt.ID === prompt.AIModelTypeID);
          throw new Error(`Specified model ${model.Name} is of type ${modelType?.Name || 'unknown'} but prompt ${prompt.Name} requires model type ${promptModelType?.Name || 'unknown'}`);
        }
        
        return model;
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
      } 
      else {
        // If no prompt-specific models, use all active models that match AIModelTypeID and vendor
        candidateModels = AIEngine.Instance.Models.filter(
          (m) =>
            m.IsActive &&
            (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID) &&
            (!vendorName || m.Vendor === vendorName),
        );
      }
      // Sort by power rank based on preference
      if (prompt.SelectionStrategy === 'ByPower') {
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
      else if (prompt.SelectionStrategy === 'Specific') {
        // rank based on the priority in the AIPromptModels
        candidateModels.sort((a, b) => {
          // get the row from promptModels that match the model ID
          const aPriority = promptModels.find((pm) => pm.ModelID === a.ID)?.Priority || 0;
          const bPriority = promptModels.find((pm) => pm.ModelID === b.ID)?.Priority || 0;
          return bPriority - aPriority; // Use the highest priority first
        });
      }
      else {
        // default ranking order
        const minPowerRank = prompt.MinPowerRank || 0;
        candidateModels = AIEngine.Instance.Models.filter(
          (m) =>
            m.IsActive &&
            m.PowerRank >= minPowerRank &&
            (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID) &&
            (!vendorName || m.Vendor === vendorName),
        );
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
    const promptRun = await this._metadata.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs', params.contextUser);
    try {
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

      // Set ParentID for hierarchical prompt execution tracking
      if (params.parentPromptRunId) {
        promptRun.ParentID = params.parentPromptRunId;
      }

      // Always save the response format from the prompt if it exists
      if (prompt.ResponseFormat && prompt.ResponseFormat !== 'Any') {
        promptRun.ResponseFormat = prompt.ResponseFormat;
      }

      // Save the actual values that will be used (either from prompt defaults or additionalParameters)
      // First, apply defaults from prompt entity (TODO: uncomment after CodeGen)
      // if (prompt.Temperature != null) promptRun.Temperature = prompt.Temperature;
      // if (prompt.TopP != null) promptRun.TopP = prompt.TopP;
      // if (prompt.TopK != null) promptRun.TopK = prompt.TopK;
      // if (prompt.MinP != null) promptRun.MinP = prompt.MinP;
      // if (prompt.FrequencyPenalty != null) promptRun.FrequencyPenalty = prompt.FrequencyPenalty;
      // if (prompt.PresencePenalty != null) promptRun.PresencePenalty = prompt.PresencePenalty;
      // if (prompt.Seed != null) promptRun.Seed = prompt.Seed;
      // if (prompt.StopSequences) promptRun.StopSequences = prompt.StopSequences;
      // if (prompt.IncludeLogProbs != null) promptRun.LogProbs = prompt.IncludeLogProbs;
      // if (prompt.TopLogProbs != null) promptRun.TopLogProbs = prompt.TopLogProbs;
      
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
      const msg = `Error creating prompt run record: ${error.message} - ${promptRun?.LatestResult?.Message} - ${promptRun?.LatestResult?.Errors[0]?.Message}`;
      LogError(msg);
      throw new Error(msg);
    }
  }

  /**
   * Renders the prompt template with provided data
   */
  private async renderPromptTemplate(
    template: TemplateEntityExtended,
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

      LogStatus(`🔧 Rendering template '${template.Name}' with ${Object.keys(systemPlaceholders).length} system placeholders`);

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
    params: AIPromptParams,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
    cancellationToken?: AbortSignal,
  ): Promise<ChatResult> {
    try {
      // Create LLM instance
      const apiKey = GetAIAPIKey(model.DriverClass);
      const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);

      // Prepare chat parameters
      const chatParams = new ChatParams();
      chatParams.model = model.APIName;
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
        chatParams.stopSequences = prompt.StopSequences.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
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

      // Apply response format from prompt settings
      if (prompt.ResponseFormat && prompt.ResponseFormat !== 'Any') {
        chatParams.responseFormat = prompt.ResponseFormat as 'Any' | 'Text' | 'Markdown' | 'JSON' | 'ModelSpecific';
      } else {
        chatParams.responseFormat = 'JSON'; // Default to JSON for backward compatibility
      }

      // Build message array with rendered prompt and conversation messages
      chatParams.messages = this.buildMessageArray(renderedPrompt, conversationMessages, templateMessageRole);

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
          params,
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
          return {
            modelResult,
            parsedResult: { result, validationResult },
            validationAttempts,
          };
        }

        // Validation failed, check if we should retry
        if (prompt.ValidationBehavior === 'Strict' && attempt < maxRetries) {
          lastError = new Error(`Validation failed: ${validationErrors?.map(e => e.Message).join('; ')}`);
          LogStatus(`⚠️ Validation failed on attempt ${attempt + 1}, will retry (Strict mode)`);
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
                if (!skipValidation) {
                const error = new ValidationErrorInfo('output', `Expected number output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
                validationErrors.push(error);
                throw new Error(error.Message);
              }
            }
            else {
              parsedResult = numberResult;
            }
            break;
          }

          case 'boolean': {
            const lowerOutput = rawOutput.toLowerCase().trim();
            if (['true', 'yes', '1'].includes(lowerOutput)) {
              parsedResult = true;
            } else if (['false', 'no', '0'].includes(lowerOutput)) {
              parsedResult = false;
            } else if (!skipValidation){
              const error = new ValidationErrorInfo('output', `Expected boolean output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
              validationErrors.push(error);
              throw new Error(error.Message);
            } 
            break;
          }

          case 'date': {
            const dateResult = new Date(rawOutput);
            if (isNaN(dateResult.getTime()) && !skipValidation) {
              const error = new ValidationErrorInfo('output', `Expected date output but got: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
              validationErrors.push(error);
              throw new Error(error.Message);
            }
            else {
              parsedResult = dateResult;  
            }
            break;
          }

          case 'object':
            try {
              parsedResult = JSON.parse(CleanJSON(rawOutput));
            } catch (jsonError) {
              // if we skip validation, we can allow thisk only emit this if 
              // we are NOT skipping validation
              if (!skipValidation) {
                const error = new ValidationErrorInfo('output', `Expected JSON object but got invalid JSON: ${rawOutput}`, rawOutput, ValidationErrorType.Failure);
                validationErrors.push(error);
                throw new Error(error.Message);
              }
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
   * Recursively validates an object against an example template.
   * Keys ending with '?' are optional, all others are required.
   * Keys ending with '*' are required but can contain any value/structure.
   * 
   * @param result - The actual result to validate
   * @param example - The example template with optional fields marked with '?' and wildcard fields with '*'
   * @param path - Current path in the object hierarchy for error reporting
   * @returns Array of validation errors
   */
  private validateObjectAgainstExample(
    result: unknown,
    example: unknown,
    path: string = ''
  ): ValidationErrorInfo[] {
    const errors: ValidationErrorInfo[] = [];

    // If example is not an object, we don't validate structure
    if (typeof example !== 'object' || example === null || Array.isArray(example)) {
      return errors;
    }

    // Result must be an object if example is an object
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      errors.push(new ValidationErrorInfo(
        path || 'root',
        `Expected object but got ${Array.isArray(result) ? 'array' : typeof result}`,
        result,
        ValidationErrorType.Failure
      ));
      return errors;
    }

    const resultObj = result as Record<string, unknown>;
    const exampleObj = example as Record<string, unknown>;

    // Check each field in the example
    for (const [key, exampleValue] of Object.entries(exampleObj)) {
      const isOptional = key.trim().endsWith('?');
      const isWildcard = key.trim().endsWith('*');
      const cleanKey = key.trim().replace(/[?*]$/, ''); // Remove trailing ? or *
      const fieldPath = path ? `${path}.${cleanKey}` : cleanKey;

      // Check if required field exists
      if (!isOptional && !(cleanKey in resultObj)) {
        errors.push(new ValidationErrorInfo(
          fieldPath,
          `Required field '${cleanKey}' is missing`,
          undefined,
          ValidationErrorType.Failure
        ));
        continue;
      }

      // If field exists and is not a wildcard, validate nested structure
      if (cleanKey in resultObj && !isWildcard) {
        const nestedErrors = this.validateObjectAgainstExample(
          resultObj[cleanKey],
          exampleValue,
          fieldPath
        );
        errors.push(...nestedErrors);
      }
      // If it's a wildcard field, we skip validation of its contents
    }

    return errors;
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

      // Use the recursive validation helper
      const errors = this.validateObjectAgainstExample(parsedResult, exampleObject);
      validationErrors.push(...errors);

      if (validationErrors.length === 0) {
        LogStatus(`✅ Validation passed for prompt ${promptId}`);
      } else {
        LogStatus(`⚠️ Validation found ${validationErrors.length} issues for prompt ${promptId}:`);
        validationErrors.forEach((error, index) => {
          LogStatus(`   ${index + 1}. ${error.Source}: ${error.Message}`);
        });
        LogStatus(`   Note: Field suffixes in OutputExample:`);
        LogStatus(`   - '?' = optional field (e.g., "reasoning?": "...")`);
        LogStatus(`   - '*' = required but any content (e.g., "payload*": {})`);
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
        LogStatus(`✅ Schema validation passed for prompt ${promptId}`);
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

      // Extract token usage and cost if available
      if (modelResult.data?.usage) {
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

      // With template composition, we only execute once so rollup equals regular fields
      promptRun.TokensPromptRollup = promptRun.TokensPrompt;
      promptRun.TokensCompletionRollup = promptRun.TokensCompletion;
      promptRun.TokensUsedRollup = promptRun.TokensUsed;
      if (promptRun.Cost !== undefined) {
        promptRun.TotalCost = promptRun.Cost;
      }

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
