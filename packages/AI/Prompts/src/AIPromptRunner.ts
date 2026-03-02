import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ChatMessage, GetAIAPIKey, ErrorAnalyzer, AIErrorInfo } from '@memberjunction/ai';
import { ValidationAttempt, AIPromptRunResult, AIModelSelectionInfo } from '@memberjunction/ai-core-plus';
import { LogErrorEx, LogStatus, LogStatusEx, IsVerboseLoggingEnabled, Metadata, UserInfo } from '@memberjunction/core';
import { CleanJSON, MJGlobal, JSONValidator, ValidationResult, ValidationErrorInfo, ValidationErrorType, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { MJAIPromptModelEntity, MJAIModelVendorEntity, MJAIConfigurationEntity, MJAIVendorEntity, MJTemplateEntityExtended, MJAICredentialBindingEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { MJAIModelEntityExtended, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { CredentialEngine } from '@memberjunction/credentials';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';
import { ExecutionPlanner } from './ExecutionPlanner';
import { ParallelExecutionCoordinator } from './ParallelExecutionCoordinator';
import { ResultSelectionConfig } from './ParallelExecution';
import { AIEngine } from '@memberjunction/aiengine';
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
 * Represents a model-vendor pair candidate for execution
 */
interface ModelVendorCandidate {
  model: MJAIModelEntityExtended;
  vendorId?: string;
  vendorName?: string;
  driverClass: string;
  apiName?: string;
  supportsEffortLevel?: boolean;
  effortLevel?: number;
  isPreferredVendor: boolean;
  priority: number; // Higher is better
  source: 'explicit' | 'prompt-model' | 'model-type' | 'power-rank';
}


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
  
  constructor() {
    this._metadata = new Metadata();
    this._templateEngine = TemplateEngineServer.Instance;
    this._executionPlanner = new ExecutionPlanner();
    this._parallelCoordinator = new ParallelExecutionCoordinator();
    this._jsonValidator = new JSONValidator();
  }

  /**
   * Performs robust validation of an API key
   * @returns true if the API key is valid (not null, undefined, or empty/whitespace)
   */
  private isValidAPIKey(apiKey: string | undefined | null): boolean {
    if (apiKey === undefined || apiKey === null) {
      return false;
    }
    
    // Check if it's just whitespace
    const trimmed = apiKey.trim();
    return trimmed.length > 0;
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

  /**
   * Checks if a model vendor is configured as an inference provider
   * @param modelVendor The model vendor to check
   * @returns true if the vendor is an inference provider
   */
  private isInferenceProvider(modelVendor: MJAIModelVendorEntity): boolean {
    // Find the inference provider type from cached vendor type definitions
    const inferenceProviderType = AIEngine.Instance.VendorTypeDefinitions.find(
      vt => vt.Name === 'Inference Provider'
    );

    if (!inferenceProviderType) {
      // Fallback to checking if it's not a model developer (should rarely happen)
      const modelDeveloperType = AIEngine.Instance.VendorTypeDefinitions.find(
        vt => vt.Name === 'Model Developer'
      );
      return !UUIDsEqual(modelVendor.TypeID, modelDeveloperType?.ID);
    }

    return UUIDsEqual(modelVendor.TypeID, inferenceProviderType.ID);
  }

  /**
   * Resolves credentials for AI model execution using a hierarchical resolution system.
   *
   * Resolution priority (highest to lowest):
   * 1. Per-request override: params.credentialId
   * 2. Prompt-Model specific: AIPromptModel.CredentialID
   * 3. Model-Vendor specific: AIModelVendor.CredentialID
   * 4. Vendor default: AIVendor.CredentialID
   * 5. Legacy: params.apiKeys[] array
   * 6. Legacy: AI_VENDOR_API_KEY__<DRIVER> environment variables
   *
   * IMPORTANT: When ANY credential ID is found (priorities 1-4), the system uses
   * the Credentials path and ignores legacy methods (priorities 5-6).
   *
   * @param driverClass - The driver class name (e.g., 'OpenAILLM')
   * @param promptId - The prompt ID for looking up AIPromptModel credentials
   * @param modelId - The model ID for looking up AIPromptModel and AIModelVendor credentials
   * @param vendorId - The vendor ID for looking up AIModelVendor and AIVendor credentials
   * @param params - The prompt execution parameters containing contextUser and optional credentialId
   * @returns The API key/configuration string to pass to the LLM constructor
   */
  private async resolveCredentialForExecution(
    driverClass: string,
    promptId: string | undefined,
    modelId: string | undefined,
    vendorId: string | undefined,
    params: AIPromptParams
  ): Promise<string> {
    const verbose = params.verbose === true || IsVerboseLoggingEnabled();

    // Priority 1: Per-request override - no failover, explicit choice
    if (params.credentialId) {
      return await this.resolveCredentialById(params.credentialId, 'per-request override', params, verbose);
    }

    // Ensure CredentialEngine is configured for binding lookups
    await CredentialEngine.Instance.Config(false, params.contextUser);

    // Priority 2: PromptModel bindings (most specific) - with failover
    if (promptId && modelId) {
      const promptModel = AIEngine.Instance.PromptModels.find(
        pm => UUIDsEqual(pm.PromptID, promptId) && UUIDsEqual(pm.ModelID, modelId)
      );
      if (promptModel) {
        const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('PromptModel', promptModel.ID);
        const result = await this.tryCredentialBindingsWithFailover(bindings, 'AICredentialBinding(PromptModel)', params, verbose);
        if (result) return result;
      }
    }

    // Priority 3: ModelVendor bindings - with failover
    if (modelId && vendorId) {
      const modelVendor = AIEngine.Instance.ModelVendors.find(
        mv => UUIDsEqual(mv.ModelID, modelId) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active'
      );
      if (modelVendor) {
        const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('ModelVendor', modelVendor.ID);
        const result = await this.tryCredentialBindingsWithFailover(bindings, 'AICredentialBinding(ModelVendor)', params, verbose);
        if (result) return result;
      }
    }

    // Priority 4: Vendor bindings - with failover
    if (vendorId) {
      const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('Vendor', vendorId);
      const result = await this.tryCredentialBindingsWithFailover(bindings, 'AICredentialBinding(Vendor)', params, verbose);
      if (result) return result;
    }

    // Priority 5: Type-based default credential
    // If the vendor declares a CredentialTypeID, try to find a default credential of that type
    if (vendorId) {
      const vendor = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, vendorId));
      if (vendor?.CredentialTypeID) {
        const defaultCredential = this.findDefaultCredentialByType(vendor.CredentialTypeID);
        if (defaultCredential) {
          const result = await this.tryResolveCredential(defaultCredential, 'type-based default', params, verbose);
          if (result) return result;
        }
      }
    }

    // No credential bindings found - fall back to legacy methods
    if (verbose) {
      this.logStatus(`   Using legacy API key resolution for driver ${driverClass}`, true, params);
    }

    // Priority 6 & 7: Legacy apiKeys array and environment variables
    return GetAIAPIKey(driverClass, params.apiKeys, verbose);
  }

  /**
   * Attempts to resolve credentials from bindings with priority-based failover.
   * Tries each binding in priority order until one succeeds.
   */
  private async tryCredentialBindingsWithFailover(
    bindings: MJAICredentialBindingEntity[],
    source: string,
    params: AIPromptParams,
    verbose: boolean
  ): Promise<string | null> {
    if (bindings.length === 0) return null;

    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i];
      const credential = CredentialEngine.Instance.getCredentialById(binding.CredentialID);

      if (!credential) {
        if (verbose) {
          this.logStatus(`   ⚠️ Credential ${binding.CredentialID} not found (priority ${binding.Priority}), trying next...`, true, params);
        }
        continue;
      }

      const result = await this.tryResolveCredential(
        credential,
        `${source} priority ${binding.Priority}`,
        params,
        verbose,
        i < bindings.length - 1  // hasMoreBindings
      );

      if (result) return result;
    }

    return null;
  }

  /**
   * Attempts to resolve a single credential, returning null on failure for failover support.
   */
  private async tryResolveCredential(
    credential: MJCredentialEntity,
    source: string,
    params: AIPromptParams,
    verbose: boolean,
    hasMoreBindings: boolean = false
  ): Promise<string | null> {
    try {
      // Check if credential is active and not expired
      if (!credential.IsActive) {
        if (verbose) {
          this.logStatus(`   ⚠️ Credential "${credential.Name}" is inactive, trying next...`, true, params);
        }
        return null;
      }

      if (credential.ExpiresAt && new Date(credential.ExpiresAt) < new Date()) {
        if (verbose) {
          this.logStatus(`   ⚠️ Credential "${credential.Name}" has expired, trying next...`, true, params);
        }
        return null;
      }

      // Resolve the credential values
      const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
        credentialId: credential.ID,
        contextUser: params.contextUser,
        subsystem: 'AIPromptRunner'
      });

      if (verbose) {
        this.logStatus(`   🔐 Using credential from ${source}: "${credential.Name}"`, true, params);
      }

      return JSON.stringify(resolved.values);

    } catch (error) {
      if (hasMoreBindings) {
        // More bindings to try - log warning and continue
        if (verbose) {
          this.logStatus(`   ⚠️ Failed to resolve credential "${credential.Name}" from ${source}: ${error instanceof Error ? error.message : String(error)}, trying next...`, true, params);
        }
        return null;
      } else {
        // No more bindings - log error but still return null for legacy fallback
        this.logError(error instanceof Error ? error : new Error(String(error)), {
          category: 'CredentialResolution',
          severity: 'warning',
          metadata: {
            credentialId: credential.ID,
            credentialName: credential.Name,
            source
          },
          maxErrorLength: params.maxErrorLength
        });
        return null;
      }
    }
  }

  /**
   * Resolves a credential by its explicit ID (used for per-request override).
   * This does not support failover since it's an explicit choice.
   */
  private async resolveCredentialById(
    credentialId: string,
    source: string,
    params: AIPromptParams,
    verbose: boolean
  ): Promise<string> {
    await CredentialEngine.Instance.Config(false, params.contextUser);

    const credential = CredentialEngine.Instance.getCredentialById(credentialId);
    if (!credential) {
      throw new Error(`Credential with ID ${credentialId} not found`);
    }

    const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
      credentialId,
      contextUser: params.contextUser,
      subsystem: 'AIPromptRunner'
    });

    if (verbose) {
      this.logStatus(`   🔐 Using credential from ${source}: "${credential.Name}"`, true, params);
    }

    return JSON.stringify(resolved.values);
  }

  /**
   * Finds a default credential matching a specific credential type.
   */
  private findDefaultCredentialByType(credentialTypeId: string): MJCredentialEntity | null {
    const credentials = CredentialEngine.Instance.Credentials;
    return credentials.find(c =>
      UUIDsEqual(c.CredentialTypeID, credentialTypeId) &&
      c.IsDefault === true &&
      c.IsActive === true &&
      (!c.ExpiresAt || new Date(c.ExpiresAt) > new Date())
    ) || null;
  }

  /**
   * Checks if credentials are available for a given model-vendor combination.
   * This is a pre-flight check used during model selection to determine which
   * candidates have valid authentication configured.
   *
   * Checks the credential hierarchy:
   * 1. Per-request override: params.credentialId
   * 2. PromptModel bindings: AICredentialBinding WHERE BindingType='PromptModel'
   * 3. ModelVendor bindings: AICredentialBinding WHERE BindingType='ModelVendor'
   * 4. Vendor bindings: AICredentialBinding WHERE BindingType='Vendor'
   * 5. Type-based default: Credential.IsDefault=1 matching AIVendor.CredentialTypeID
   * 6. Legacy: params.apiKeys[] array
   * 7. Legacy: AI_VENDOR_API_KEY__<DRIVER> environment variables
   *
   * @param driverClass - The driver class name (e.g., 'OpenAILLM')
   * @param promptId - The prompt ID for looking up AIPromptModel bindings
   * @param modelId - The model ID for looking up AIPromptModel and AIModelVendor bindings
   * @param vendorId - The vendor ID for looking up AIModelVendor and AIVendor bindings
   * @param params - The prompt execution parameters
   * @returns true if credentials are available, false otherwise
   */
  private hasCredentialsAvailable(
    driverClass: string,
    promptId: string | undefined,
    modelId: string | undefined,
    vendorId: string | undefined,
    params?: AIPromptParams
  ): boolean {
    // Priority 1: Per-request override
    if (params?.credentialId) {
      // Assume valid if credential ID is provided - will be validated at execution time
      return true;
    }

    // Priority 2: PromptModel bindings
    if (promptId && modelId) {
      const promptModel = AIEngine.Instance.PromptModels.find(
        pm => UUIDsEqual(pm.PromptID, promptId) && UUIDsEqual(pm.ModelID, modelId)
      );
      if (promptModel && AIEngine.Instance.HasCredentialBindings('PromptModel', promptModel.ID)) {
        return true;
      }
    }

    // Priority 3: ModelVendor bindings
    if (modelId && vendorId) {
      const modelVendor = AIEngine.Instance.ModelVendors.find(
        mv => UUIDsEqual(mv.ModelID, modelId) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active'
      );
      if (modelVendor && AIEngine.Instance.HasCredentialBindings('ModelVendor', modelVendor.ID)) {
        return true;
      }
    }

    // Priority 4: Vendor bindings
    if (vendorId) {
      if (AIEngine.Instance.HasCredentialBindings('Vendor', vendorId)) {
        return true;
      }
    }

    // Priority 5: Type-based default credential
    if (vendorId) {
      const vendor = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, vendorId));
      if (vendor?.CredentialTypeID) {
        const defaultCredential = this.findDefaultCredentialByType(vendor.CredentialTypeID);
        if (defaultCredential) {
          return true;
        }
      }
    }

    // Priority 6 & 7: Legacy methods - check if API key is available
    const apiKey = GetAIAPIKey(driverClass, params?.apiKeys, params?.verbose);
    return this.isValidAPIKey(apiKey);
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
          throw new Error(`No suitable model found for prompt ${modelSelectionPrompt.Name}`);
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
          throw new Error(`No suitable model found for prompt ${modelSelectionPrompt.Name}`);
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
    let allCandidates: ModelVendorCandidate[] = [];

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
        throw new Error(`No suitable model found for prompt ${modelSelectionPrompt.Name}`);
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
   * Selects the appropriate AI model based on prompt configuration and parameters.
   * Uses the unified buildModelVendorCandidates method to create an ordered list of candidates,
   * then selects the first one with an available API key.
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
    modelEffortLevel?: number; // Model-specific effort level from AIPromptModel
    selectionInfo?: AIModelSelectionInfo;
    allCandidates?: ModelVendorCandidate[];
  }> {
    // Declare variables outside try block for catch block access
    let configurationName: string | undefined;
    let configuration: MJAIConfigurationEntity | undefined;
    
    try {
      // Load AI Engine to access cached models and prompt models
      await AIEngine.Instance.Config(false, contextUser);

      // Determine selection strategy
      let selectionStrategy: 'Default' | 'Specific' | 'ByPower' = 'Default';
      if (explicitModelId) {
        selectionStrategy = 'Specific';
      } else if (prompt.SelectionStrategy === 'Specific') {
        selectionStrategy = 'Specific';
      } else if (prompt.SelectionStrategy === 'ByPower' || prompt.MinPowerRank != null) {
        selectionStrategy = 'ByPower';
      }

      // Get configuration info if provided
      if (configurationId) {
        configuration = AIEngine.Instance.Configurations.find(c => UUIDsEqual(c.ID, configurationId));
        configurationName = configuration?.Name;
      }

      // Build unified list of model-vendor candidates
      const candidates = this.buildModelVendorCandidates(
        prompt,
        explicitModelId,
        configurationId,
        vendorId,
        params.verbose
      );

      // Track all models considered for selection info
      const modelsConsidered: Array<{
        model: MJAIModelEntityExtended;
        vendor?: MJAIVendorEntity;
        priority: number;
        available: boolean;
        unavailableReason?: string;
      }> = [];

      if (candidates.length === 0) {
        this.logError(`No suitable model candidates found for prompt ${prompt.Name}`, {
          category: 'ModelSelection',
          prompt: prompt,
          severity: 'critical',
          maxErrorLength: params?.maxErrorLength
        });
        return {
          model: null,
          vendorDriverClass: undefined,
          vendorApiName: undefined,
          vendorSupportsEffortLevel: undefined,
          allCandidates: [],
          selectionInfo: this.createSelectionInfo({
            aiConfiguration: configuration,
            modelsConsidered: [],
            modelSelected: undefined as any, // Type requirement, but null model means no selection
            selectionReason: 'No suitable model candidates found',
            fallbackUsed: false,
            selectionStrategy
          })
        };
      }

      // this.logStatus(`🔍 Found ${candidates.length} model-vendor candidates for prompt ${prompt.Name}`, true, params);

      // if (candidates.length <= 5) {
      //   candidates.forEach((c, i) => {
      //     this.logStatus(`   ${i + 1}. ${c.model.Name} via ${c.vendorName || 'default'} (${c.driverClass}) - Priority: ${c.priority}${c.isPreferredVendor ? ' [PREFERRED]' : ''}`, true, params);
      //   });
      // }

      // Select the first candidate with available credentials and track all attempts
      const { selected, consideredModels } = await this.selectModelWithAPIKeyTracked(candidates, prompt.ID, params);

      // Merge considered models into our tracking
      modelsConsidered.push(...consideredModels);

      if (!selected) {
        // No models with API keys found
        return {
          model: null,
          vendorDriverClass: undefined,
          vendorApiName: undefined,
          vendorSupportsEffortLevel: undefined,
          modelEffortLevel: undefined,
          allCandidates: candidates,
          selectionInfo: this.createSelectionInfo({
            aiConfiguration: configuration,
            modelsConsidered,
            modelSelected: undefined as any, // Type requirement, but null model means no selection
            selectionReason: 'No API keys found for any model-vendor combination',
            fallbackUsed: false,
            selectionStrategy
          })
        };
      }


      // Determine selection reason
      let selectionReason = `Selected ${selected.model.Name} via ${selected.vendorName || 'default vendor'}`;
      if (selected.source === 'explicit') {
        selectionReason = `Explicitly requested model ${selected.model.Name}`;
      } else if (selected.source === 'prompt-model') {
        selectionReason = `Selected from prompt-specific models (priority: ${selected.priority})`;
      } else if (selected.source === 'model-type') {
        selectionReason = `Selected based on model type filtering`;
      } else if (selected.source === 'power-rank') {
        selectionReason = `Selected by power rank (${selected.model.PowerRank || 0})`;
      }

      if (selected.isPreferredVendor) {
        selectionReason += ' using preferred vendor';
      }

      // Check if fallback was used (not the first candidate)
      const fallbackUsed = candidates.indexOf(selected) > 0;

      // Get selected vendor entity
      let selectedVendor: MJAIVendorEntity | undefined;
      if (selected.vendorId) {
        selectedVendor = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, selected.vendorId));
      }

      return {
        model: selected.model,
        vendorDriverClass: selected.driverClass,
        vendorApiName: selected.apiName,
        vendorSupportsEffortLevel: selected.supportsEffortLevel,
        modelEffortLevel: selected.effortLevel, // Pass through model-specific effort level
        allCandidates: candidates,
        selectionInfo: this.createSelectionInfo({
          aiConfiguration: configuration,
          modelsConsidered,
          modelSelected: selected.model,
          vendorSelected: selectedVendor,
          selectionReason,
          fallbackUsed,
          selectionStrategy
        })
      };
    } catch (error) {
      this.logError(error, {
        category: 'ModelSelection',
        prompt: prompt,
        maxErrorLength: params?.maxErrorLength
      });
      return {
        model: null,
        vendorDriverClass: undefined,
        vendorApiName: undefined,
        vendorSupportsEffortLevel: undefined,
        modelEffortLevel: undefined,
        allCandidates: [],
        selectionInfo: this.createSelectionInfo({
          aiConfiguration: configuration,
          modelsConsidered: [],
          modelSelected: undefined as any, // Type requirement, but null model means no selection
          selectionReason: `Error during model selection: ${error.message}`,
          fallbackUsed: false,
          selectionStrategy: 'Default'
        })
      };
    }
  }

  /**
   * Builds a unified, ordered list of model-vendor candidates based on all selection criteria.
   * Uses a 3-phase approach to properly handle SelectionStrategy='Specific' with AIPromptModel priorities.
   * 
   * Phase 1: Handle explicit model ID (highest priority)
   * Phase 2: Check if SelectionStrategy='Specific' with AIPromptModel entries - use ONLY those with AIPromptModel priorities
   * Phase 3: Use general selection strategy (fallback) - blended priorities from legacy behavior
   * 
   * @param prompt - The AI prompt with selection criteria
   * @param explicitModelId - Explicitly specified model ID (highest priority)
   * @param configurationId - Configuration ID for filtering
   * @param preferredVendorId - Preferred vendor ID
   * @returns Ordered array of model-vendor candidates (highest priority first)
   */
  private buildModelVendorCandidates(
    prompt: MJAIPromptEntityExtended,
    explicitModelId?: string,
    configurationId?: string,
    preferredVendorId?: string,
    verbose?: boolean
  ): ModelVendorCandidate[] {
    // PHASE 1: Handle explicit model ID (highest priority)
    if (explicitModelId) {
      return this.buildCandidatesForExplicitModel(explicitModelId, prompt, preferredVendorId);
    }

    // PHASE 2: SelectionStrategy='Specific' - Use explicit AIPromptModel configuration
    if (prompt.SelectionStrategy === 'Specific') {
      return this.buildCandidatesForSpecificStrategy(prompt, configurationId, verbose);
    }

    // PHASE 3: Build candidates with configuration-aware fallback hierarchy
    // (SelectionStrategy='Default' or 'ByPower')
    return this.buildCandidatesForGeneralSelection(prompt, configurationId, preferredVendorId, verbose);
  }

  /**
   * PHASE 1: Build candidates for explicitly specified model ID.
   * Returns candidates for the single model if it's active and compatible.
   */
  private buildCandidatesForExplicitModel(
    explicitModelId: string,
    prompt: MJAIPromptEntityExtended,
    preferredVendorId?: string
  ): ModelVendorCandidate[] {
    const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, explicitModelId));
    if (!model || !model.IsActive) {
      return [];
    }

    // Check model type compatibility
    if (prompt.AIModelTypeID && model.AIModelTypeID !== prompt.AIModelTypeID) {
      return [];
    }

    const candidates = this.createCandidatesForModel(model, 20000, 'explicit', preferredVendorId);
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates;
  }

  /**
   * PHASE 2: Build candidates for 'Specific' selection strategy.
   * Uses AIPromptModel configuration with clean ranking:
   * 1. Config-matching models first (by priority DESC)
   * 2. Then universal (null config) models (by priority DESC)
   */
  private buildCandidatesForSpecificStrategy(
    prompt: MJAIPromptEntityExtended,
    configurationId?: string,
    verbose?: boolean
  ): ModelVendorCandidate[] {
    // Get all active AIPromptModel records for this prompt
    const allPromptModels = AIEngine.Instance.PromptModels.filter(
      pm => UUIDsEqual(pm.PromptID, prompt.ID) && (pm.Status === 'Active' || pm.Status === 'Preview')
    );

    // Filter by configuration matching rules
    const promptModels = this.filterPromptModelsByConfiguration(allPromptModels, configurationId);

    // Sort: config-specific before universal, then by priority DESC within each group
    const sortedPromptModels = this.sortPromptModelsForSpecificStrategy(promptModels, configurationId);

    // Build candidates maintaining order
    const candidates = this.buildCandidatesFromPromptModels(sortedPromptModels);

    // Strategy='Specific' requires explicit configuration
    if (candidates.length === 0) {
      const configInfo = configurationId ? ` with configuration "${configurationId}"` : '';
      throw new Error(
        `SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found for prompt "${prompt.Name}"${configInfo}. ` +
        `Please configure AIPromptModel records for this prompt.`
      );
    }

    if (verbose) {
      LogStatus(`Using SelectionStrategy='Specific' with ${sortedPromptModels.length} AIPromptModel entries, generated ${candidates.length} candidates`);
    }

    return candidates;
  }

  /**
   * PHASE 3: Build candidates for general selection strategies ('Default' or 'ByPower').
   * Uses configuration-aware fallback hierarchy with legacy blended priority calculation.
   */
  private buildCandidatesForGeneralSelection(
    prompt: MJAIPromptEntityExtended,
    configurationId?: string,
    preferredVendorId?: string,
    verbose?: boolean
  ): ModelVendorCandidate[] {
    const preferredVendorName = preferredVendorId ?
      AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, preferredVendorId))?.Name : undefined;

    // Get prompt models for configuration
    const promptModels = this.getPromptModelsForConfiguration(prompt, configurationId);

    const candidates: ModelVendorCandidate[] = [];

    if (promptModels.length > 0) {
      // Use prompt-specific models with blended priorities
      this.addPromptSpecificCandidates(candidates, promptModels, preferredVendorId);

      // Add configuration fallback candidates if needed
      if (configurationId) {
        this.addConfigurationFallbackCandidates(candidates, prompt, configurationId, preferredVendorId, verbose);
      }
    } else {
      // No prompt-specific models, use selection strategy
      this.addStrategyBasedCandidates(candidates, prompt, preferredVendorName);
    }

    // Sort all candidates by priority (highest first)
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates;
  }

  /**
   * Helper: Filter prompt models by configuration matching rules.
   * Supports configuration inheritance - includes models from the entire inheritance chain.
   */
  private filterPromptModelsByConfiguration(
    allPromptModels: MJAIPromptModelEntity[],
    configurationId?: string
  ): MJAIPromptModelEntity[] {
    if (configurationId) {
      // Get the configuration inheritance chain
      const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
      const chainIds = new Set(chain.map(c => NormalizeUUID(c.ID)));

      // Include models matching any config in the chain, plus null-config (universal fallback)
      return allPromptModels.filter(
        pm => (pm.ConfigurationID && chainIds.has(NormalizeUUID(pm.ConfigurationID))) ||
              pm.ConfigurationID === null
      );
    } else {
      // No config specified - only include null-config models
      return allPromptModels.filter(pm => pm.ConfigurationID === null);
    }
  }

  /**
   * Helper: Sort prompt models for 'Specific' strategy.
   * Respects configuration inheritance chain - child configs first, then parents, then null-config.
   * Within each config level, sorts by priority DESC.
   */
  private sortPromptModelsForSpecificStrategy(
    promptModels: MJAIPromptModelEntity[],
    configurationId?: string
  ): MJAIPromptModelEntity[] {
    if (!configurationId) {
      // No config specified - just sort by priority
      return promptModels.sort((a, b) => (b.Priority || 0) - (a.Priority || 0));
    }

    // Get the configuration inheritance chain and create position map
    const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
    const chainOrder = new Map(chain.map((c, index) => [c.ID, index]));

    return promptModels.sort((a, b) => {
      // Primary: Chain position (lower index = higher priority, null config = last)
      const aChainPos = a.ConfigurationID ? (chainOrder.get(a.ConfigurationID) ?? 999) : 1000;
      const bChainPos = b.ConfigurationID ? (chainOrder.get(b.ConfigurationID) ?? 999) : 1000;

      if (aChainPos !== bChainPos) {
        return aChainPos - bChainPos; // Lower chain position first (child before parent)
      }

      // Secondary: Higher priority first within same config level
      return (b.Priority || 0) - (a.Priority || 0);
    });
  }

  /**
   * Helper: Build candidates from sorted AIPromptModel records.
   * Expands VendorID=null to all vendors for that model.
   */
  private buildCandidatesFromPromptModels(
    promptModels: MJAIPromptModelEntity[]
  ): ModelVendorCandidate[] {
    const candidates: ModelVendorCandidate[] = [];

    for (const pm of promptModels) {
      const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
      if (!model || !model.IsActive) continue;

      if (pm.VendorID) {
        // Specific vendor specified - create single candidate
        const candidate = this.createCandidateForSpecificVendor(model, pm);
        if (candidate) {
          candidates.push(candidate);
        }
      } else {
        // No vendor specified - create candidates for all vendors
        const vendorCandidates = this.createCandidatesForAllVendors(model);
        candidates.push(...vendorCandidates);
      }
    }

    return candidates;
  }

  /**
   * Helper: Create candidate for specific vendor from AIPromptModel.
   */
  private createCandidateForSpecificVendor(
    model: MJAIModelEntityExtended,
    promptModel: MJAIPromptModelEntity
  ): ModelVendorCandidate | null {
    const modelVendor = AIEngine.Instance.ModelVendors.find(
      mv => UUIDsEqual(mv.ModelID, promptModel.ModelID) &&
            UUIDsEqual(mv.VendorID, promptModel.VendorID) &&
            mv.Status === 'Active' &&
            this.isInferenceProvider(mv)
    );

    if (!modelVendor) return null;

    return {
      model,
      vendorId: modelVendor.VendorID,
      vendorName: modelVendor.Vendor,
      driverClass: modelVendor.DriverClass || model.DriverClass,
      apiName: modelVendor.APIName || model.APIName,
      supportsEffortLevel: modelVendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
      effortLevel: promptModel.EffortLevel ?? undefined, // Model-specific effort level override
      isPreferredVendor: false,
      priority: 0,  // Order is determined by promptModels sort
      source: 'prompt-model'
    };
  }

  /**
   * Helper: Create candidates for all vendors of a model, sorted by vendor priority.
   */
  private createCandidatesForAllVendors(
    model: MJAIModelEntityExtended
  ): ModelVendorCandidate[] {
    const vendors = AIEngine.Instance.ModelVendors
      .filter(mv =>
        UUIDsEqual(mv.ModelID, model.ID) &&
        mv.Status === 'Active' &&
        this.isInferenceProvider(mv)
      )
      .sort((a, b) => (b.Priority || 0) - (a.Priority || 0));

    const candidates: ModelVendorCandidate[] = [];

    for (const vendor of vendors) {
      candidates.push({
        model,
        vendorId: vendor.VendorID,
        vendorName: vendor.Vendor,
        driverClass: vendor.DriverClass || model.DriverClass,
        apiName: vendor.APIName || model.APIName,
        supportsEffortLevel: vendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
        isPreferredVendor: false,
        priority: 0,  // Order is determined by promptModels sort
        source: 'prompt-model'
      });
    }

    // If no vendors found, use model defaults
    if (candidates.length === 0 && model.DriverClass) {
      candidates.push({
        model,
        driverClass: model.DriverClass,
        apiName: model.APIName,
        supportsEffortLevel: model.SupportsEffortLevel ?? false,
        isPreferredVendor: false,
        priority: 0,
        source: 'prompt-model'
      });
    }

    return candidates;
  }

  /**
   * Helper: Get prompt models for configuration with inheritance chain fallback.
   * Walks the configuration inheritance chain looking for prompt models.
   * Returns models from the first config in the chain that has any, or falls back to null-config.
   */
  private getPromptModelsForConfiguration(
    prompt: MJAIPromptEntityExtended,
    configurationId?: string
  ): MJAIPromptModelEntity[] {
    if (configurationId) {
      // Get the configuration inheritance chain (child -> parent -> grandparent -> ...)
      const chain = AIEngine.Instance.GetConfigurationChain(configurationId);

      // Walk the chain looking for prompt models
      for (const config of chain) {
        const promptModels = AIEngine.Instance.PromptModels.filter(
          pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
                (pm.Status === 'Active' || pm.Status === 'Preview') &&
                UUIDsEqual(pm.ConfigurationID, config.ID)
        );

        if (promptModels.length > 0) {
          return promptModels;
        }
      }

      // No match in chain, fall back to NULL config models
      LogStatus(`No models found in configuration chain for "${configurationId}", falling back to default models`);
    }

    // Return null-config (universal) models
    return AIEngine.Instance.PromptModels.filter(
      pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
            (pm.Status === 'Active' || pm.Status === 'Preview') &&
            !pm.ConfigurationID
    );
  }

  /**
   * Helper: Add prompt-specific candidates with blended priorities (legacy behavior).
   */
  private addPromptSpecificCandidates(
    candidates: ModelVendorCandidate[],
    promptModels: MJAIPromptModelEntity[],
    preferredVendorId?: string
  ): void {
    for (const pm of promptModels) {
      const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
      if (model && model.IsActive) {
        const modelCandidates = this.createCandidatesForModel(
          model,
          5000,
          'prompt-model',
          preferredVendorId,
          pm.Priority
        );
        candidates.push(...modelCandidates);
      }
    }
  }

  /**
   * Helper: Add configuration fallback candidates from the inheritance chain.
   * Adds models from parent configs (with decreasing priority) and null-config models as final fallback.
   */
  private addConfigurationFallbackCandidates(
    candidates: ModelVendorCandidate[],
    prompt: MJAIPromptEntityExtended,
    configurationId: string,
    preferredVendorId?: string,
    verbose?: boolean
  ): void {
    const chain = AIEngine.Instance.GetConfigurationChain(configurationId);

    // Add models from parent configs (skip index 0 which is the direct config, already handled)
    for (let i = 1; i < chain.length; i++) {
      const parentConfig = chain[i];
      const parentModels = AIEngine.Instance.PromptModels.filter(
        pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
              (pm.Status === 'Active' || pm.Status === 'Preview') &&
              UUIDsEqual(pm.ConfigurationID, parentConfig.ID)
      );

      if (parentModels.length > 0 && verbose) {
        LogStatus(`Adding ${parentModels.length} models from parent config "${parentConfig.Name}" as fallback`);
      }

      for (const pm of parentModels) {
        const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
        if (model && model.IsActive) {
          // Decrease base priority for each level up the chain (3000, 2500, 2000, etc.)
          const basePriority = 3000 - (i * 500);
          const modelCandidates = this.createCandidatesForModel(
            model,
            basePriority,
            'prompt-model',
            preferredVendorId,
            pm.Priority
          );
          candidates.push(...modelCandidates);
        }
      }
    }

    // Finally add NULL config models (universal fallback) with lowest priority
    const nullConfigModels = AIEngine.Instance.PromptModels.filter(
      pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
            (pm.Status === 'Active' || pm.Status === 'Preview') &&
            !pm.ConfigurationID
    );

    if (nullConfigModels.length > 0 && verbose) {
      LogStatus(`Adding ${nullConfigModels.length} NULL configuration models as universal fallback`);
    }

    for (const pm of nullConfigModels) {
      const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
      if (model && model.IsActive) {
        const modelCandidates = this.createCandidatesForModel(
          model,
          1000, // Lowest priority tier
          'prompt-model',
          preferredVendorId,
          pm.Priority
        );
        candidates.push(...modelCandidates);
      }
    }
  }

  /**
   * Helper: Add strategy-based candidates when no prompt models exist.
   */
  private addStrategyBasedCandidates(
    candidates: ModelVendorCandidate[],
    prompt: MJAIPromptEntityExtended,
    preferredVendorName?: string
  ): void {
    let modelPool = this.getModelPoolForStrategy(prompt, preferredVendorName);
    modelPool = this.sortModelPoolByStrategy(modelPool, prompt);

    // Create candidates for each model in the pool
    modelPool.forEach((model, index) => {
      const basePriority = 1000 - index * 10; // Decrease priority by position
      const source = prompt.SelectionStrategy === 'ByPower' ? 'power-rank' : 'model-type';
      candidates.push(...this.createCandidatesForModel(model, basePriority, source));
    });
  }

  /**
   * Helper: Get model pool filtered for strategy.
   */
  private getModelPoolForStrategy(
    prompt: MJAIPromptEntityExtended,
    preferredVendorName?: string
  ): MJAIModelEntityExtended[] {
    return AIEngine.Instance.Models.filter(
      m => m.IsActive &&
           (!prompt.AIModelTypeID || UUIDsEqual(m.AIModelTypeID, prompt.AIModelTypeID)) &&
           (!preferredVendorName ||
            AIEngine.Instance.ModelVendors.some(mv =>
              UUIDsEqual(mv.ModelID, m.ID) &&
              mv.Status === 'Active' &&
              mv.Vendor === preferredVendorName &&
              this.isInferenceProvider(mv)
            ))
    );
  }

  /**
   * Helper: Sort model pool by selection strategy.
   */
  private sortModelPoolByStrategy(
    modelPool: MJAIModelEntityExtended[],
    prompt: MJAIPromptEntityExtended
  ): MJAIModelEntityExtended[] {
    if (prompt.SelectionStrategy === 'ByPower') {
      return this.sortByPowerPreference(modelPool, prompt.PowerPreference);
    } else {
      // Default strategy
      const minPowerRank = prompt.MinPowerRank || 0;
      return modelPool
        .filter(m => m.PowerRank >= minPowerRank)
        .sort((a, b) => b.PowerRank - a.PowerRank);
    }
  }

  /**
   * Helper: Sort models by power preference.
   */
  private sortByPowerPreference(
    modelPool: MJAIModelEntityExtended[],
    powerPreference?: 'Highest' | 'Lowest' | 'Balanced'
  ): MJAIModelEntityExtended[] {
    const pool = [...modelPool];

    switch (powerPreference) {
      case 'Highest':
        return pool.sort((a, b) => b.PowerRank - a.PowerRank);
      case 'Lowest':
        return pool.sort((a, b) => a.PowerRank - b.PowerRank);
      case 'Balanced':
        const avgPower = pool.reduce((sum, m) => sum + m.PowerRank, 0) / pool.length;
        return pool.sort((a, b) =>
          Math.abs(a.PowerRank - avgPower) - Math.abs(b.PowerRank - avgPower)
        );
      default:
        return pool.sort((a, b) => b.PowerRank - a.PowerRank);
    }
  }

  /**
   * Helper: Create candidates for a model with AIModelVendor priorities (legacy behavior).
   */
  private createCandidatesForModel(
    model: MJAIModelEntityExtended,
    basePriority: number,
    source: ModelVendorCandidate['source'],
    preferredVendorId?: string,
    promptModelPriority?: number
  ): ModelVendorCandidate[] {
    const modelCandidates: ModelVendorCandidate[] = [];

    // Get all vendors for this model - filter for inference providers only
    const modelVendors = AIEngine.Instance.ModelVendors
      .filter(mv => UUIDsEqual(mv.ModelID, model.ID) && mv.Status === 'Active' && this.isInferenceProvider(mv))
      .sort((a, b) => b.Priority - a.Priority);

    // First, add preferred vendor if it exists
    if (preferredVendorId) {
      const preferredVendor = modelVendors.find(mv => UUIDsEqual(mv.VendorID, preferredVendorId));
      if (preferredVendor) {
        modelCandidates.push({
          model,
          vendorId: preferredVendor.VendorID,
          vendorName: preferredVendor.Vendor,
          driverClass: preferredVendor.DriverClass || model.DriverClass,
          apiName: preferredVendor.APIName || model.APIName,
          supportsEffortLevel: preferredVendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
          isPreferredVendor: true,
          priority: basePriority + 1000, // Boost priority for preferred vendor
          source
        });
      }
    }

    // Then add other vendors in priority order
    for (const vendor of modelVendors) {
      if (!UUIDsEqual(vendor.VendorID, preferredVendorId)) {
        modelCandidates.push({
          model,
          vendorId: vendor.VendorID,
          vendorName: vendor.Vendor,
          driverClass: vendor.DriverClass || model.DriverClass,
          apiName: vendor.APIName || model.APIName,
          supportsEffortLevel: vendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
          isPreferredVendor: false,
          priority: basePriority + (vendor.Priority || 0),
          source
        });
      }
    }

    // If no vendors found, add model with its default driver
    if (modelCandidates.length === 0 && model.DriverClass) {
      modelCandidates.push({
        model,
        driverClass: model.DriverClass,
        apiName: model.APIName,
        supportsEffortLevel: model.SupportsEffortLevel ?? false,
        isPreferredVendor: false,
        priority: basePriority,
        source
      });
    }

    // Apply prompt model priority if provided (legacy blended approach)
    if (promptModelPriority !== undefined) {
      modelCandidates.forEach(c => c.priority += promptModelPriority * 10);
    }

    return modelCandidates;
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
   * Converts model selection info into ModelVendorCandidate array for retry logic.
   * Extracts only the valid candidates (those with available API keys) from the selection info.
   *
   * @param selectionInfo - Model selection information containing considered models
   * @returns Array of valid model-vendor candidates sorted by priority
   */
  private buildCandidatesFromSelectionInfo(
    selectionInfo: AIModelSelectionInfo
  ): ModelVendorCandidate[] {
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
        source: (selectionInfo.selectionStrategy === 'ByPower' ? 'power-rank' : 'model-type') as 'power-rank' | 'model-type'
      };
    }).sort((a, b) => b.priority - a.priority); // Sort by priority descending
  }

  /**
   * Enhanced version of selectModelWithAPIKey that tracks all considered models
   * for model selection reporting. Uses the hierarchical credential resolution
   * system to check for available credentials.
   *
   * @param candidates - Ordered array of model-vendor candidates
   * @param promptId - The prompt ID for credential resolution
   * @param params - Optional prompt parameters for verbose logging and credential override
   * @returns Object containing selected candidate and all considered models
   */
  private async selectModelWithAPIKeyTracked(
    candidates: ModelVendorCandidate[],
    promptId: string,
    params?: AIPromptParams
  ): Promise<{
    selected: ModelVendorCandidate | null;
    consideredModels: Array<{
      model: MJAIModelEntityExtended;
      vendor?: MJAIVendorEntity;
      priority: number;
      available: boolean;
      unavailableReason?: string;
    }>;
  }> {
    // Cache for credential availability checks
    // Key format: "driverClass:modelId:vendorId" to properly cache credential hierarchy
    const credentialCache = new Map<string, boolean>();
    const consideredModels: Array<{
      model: MJAIModelEntityExtended;
      vendor?: MJAIVendorEntity;
      priority: number;
      available: boolean;
      unavailableReason?: string;
    }> = [];

    // Check ALL candidates to build complete list of valid and invalid options
    for (const candidate of candidates) {
      // Build cache key including model and vendor for proper credential resolution
      const cacheKey = `${candidate.driverClass}:${candidate.model.ID}:${candidate.vendorId || 'default'}`;

      // Check cache first
      let hasCredentials: boolean;
      if (credentialCache.has(cacheKey)) {
        hasCredentials = credentialCache.get(cacheKey)!;
      } else {
        // Check for credentials using hierarchical resolution
        hasCredentials = this.hasCredentialsAvailable(
          candidate.driverClass,
          promptId,
          candidate.model.ID,
          candidate.vendorId,
          params
        );
        credentialCache.set(cacheKey, hasCredentials);
      }

      // Get vendor entity from AIEngine cache if vendorId is available
      let vendorEntity: MJAIVendorEntity | undefined;
      if (candidate.vendorId) {
        vendorEntity = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, candidate.vendorId));
      }

      // Track this model as considered with availability status
      consideredModels.push({
        model: candidate.model,
        vendor: vendorEntity,
        priority: candidate.priority,
        available: hasCredentials,
        unavailableReason: hasCredentials ? undefined : `No credentials configured for driver ${candidate.driverClass}`
      });
    }

    // Select the first available candidate (highest priority with API key)
    const selected = consideredModels.find(m => m.available);
    const selectedCandidate = selected ? candidates.find(c =>
      UUIDsEqual(c.model.ID, selected.model.ID) &&
      UUIDsEqual(c.vendorId, selected.vendor?.ID)
    ) : null;

    if (selectedCandidate) {
      const validCount = consideredModels.filter(m => m.available).length;
      this.logStatus(`   Selected model ${selectedCandidate.model.Name} with ${selectedCandidate.vendorName || 'default'} vendor (driver: ${selectedCandidate.driverClass})`, true);
      if (selectedCandidate.isPreferredVendor) {
        this.logStatus(`   Using preferred vendor${selectedCandidate.vendorId ? ` (${selectedCandidate.vendorName})` : ''}`, true, params);
      }
      this.logStatus(`   Found ${validCount} valid candidate(s) out of ${candidates.length} total`, true, params);
    } else {
      // Log what we tried
      const triedSummary = candidates.slice(0, 5).map(c =>
        `${c.model.Name}/${c.vendorName || 'default'}(${c.driverClass})`
      ).join(', ');

      this.logError(`No credentials found for any model-vendor combination. Tried: ${triedSummary}${candidates.length > 5 ? `... (${candidates.length} total)` : ''}`, {
        category: 'CredentialValidation',
        severity: 'critical',
        metadata: {
          candidatesChecked: candidates.length,
          modelsChecked: consideredModels.length
        },
        maxErrorLength: params?.maxErrorLength
      });
    }

    return { selected: selectedCandidate, consideredModels };
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
    const promptRun = await this._metadata.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', params.contextUser);
    try {
      promptRun.NewRecord();

      promptRun.PromptID = prompt.ID;
      promptRun.ModelID = model.ID;
      
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
          .filter((mv) => UUIDsEqual(mv.ModelID, model.ID) && mv.Status === 'Active' && this.isInferenceProvider(mv))
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
          messages.push({ 
            role: 'system',
            content: systemPromptText
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
   * Executes the AI model with failover support
   * 
   * @remarks
   * This method wraps the core executeModel functionality with intelligent failover
   * capabilities. It will attempt to execute with different models/vendors according
   * to the configured failover strategy when errors occur.
   * 
   * The method calls several smaller, focused helper methods:
   * - buildFailoverCandidates: Creates candidate models based on type restrictions
   * - createCandidatesFromModels: Converts models to vendor-specific candidates
   * - updatePromptRunWithFailoverSuccess: Records successful failover metadata
   * - updatePromptRunWithFailoverFailure: Records failed failover metadata
   * - createFailoverErrorResult: Creates standardized error response
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
    allCandidates?: ModelVendorCandidate[],
    promptRun?: MJAIPromptRunEntityExtended,
    vendorDriverClass?: string,
    vendorApiName?: string,
    vendorSupportsEffortLevel?: boolean,
    modelEffortLevel?: number
  ): Promise<ChatResult> {
    // Get failover configuration (used for errorScope filtering)
    const failoverConfig = this.getFailoverConfiguration(prompt);

    // If no candidates provided or failover disabled, execute normally with first model
    if (!allCandidates || allCandidates.length === 0 || failoverConfig.strategy === 'None') {
      return this.executeModel(
        model, renderedPrompt, prompt, params, vendorId,
        conversationMessages, templateMessageRole, cancellationToken,
        vendorDriverClass, vendorApiName, vendorSupportsEffortLevel, modelEffortLevel
      );
    }

    // Track failover attempts
    const failoverAttempts: FailoverAttempt[] = [];
    let lastError: Error | null = null;

    // Iterate through all candidates in priority order with instant failover
    for (let i = 0; i < allCandidates.length; i++) {
      const candidate = allCandidates[i];
      const attemptStartTime = Date.now();

      try {
        // Log the attempt if not the first one
        if (i > 0) {
          const vendorName = candidate.vendorName || 'default';
          LogStatusEx({
            message: `🔄 Trying candidate ${i + 1}/${allCandidates.length}: ${candidate.model.Name} via ${vendorName}`,
            category: 'AI',
            additionalArgs: [{
              promptId: prompt.ID,
              modelId: candidate.model.ID,
              model: candidate.model.Name,
              vendorId: candidate.vendorId,
              vendor: candidate.vendorName,
              attemptNumber: i + 1
            }]
          });
        }

        // Execute the model with this candidate
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

        // CRITICAL FIX: Check if result failed but is retriable (network errors, rate limits, etc.)
        // Provider drivers (GeminiLLM, OpenAILLM, etc.) catch errors internally and return ChatResult{success: false}
        // instead of throwing, so we must check result.success here.
        if (!result.success && result.errorInfo?.canFailover) {
          lastError = result.exception || new Error(result.errorMessage || 'Model execution failed');

          // Use shared failover error handling logic
          const decision = await this.processFailoverError(
            lastError,
            result.errorInfo,
            candidate,
            attemptStartTime,
            i,
            allCandidates,
            failoverAttempts,
            prompt,
            failoverConfig
          );

          // Update candidates list (may have been filtered)
          allCandidates = decision.updatedCandidates;

          if (decision.shouldRetry) {
            i--; // Retry same model/vendor
            continue;
          }

          if (decision.shouldContinue) {
            continue; // Try next candidate
          }

          // Otherwise break (fatal error or last candidate)
          break;
        }

        // If we reach here, the result was successful
        // Update promptRun with failover information if we had prior failures
        if (failoverAttempts.length > 0 && promptRun) {
          this.updatePromptRunWithFailoverSuccess(promptRun, failoverAttempts, candidate.model, candidate.vendorId || null);
        }

        return result;

      } catch (error) {
        lastError = error as Error;

        // Analyze error to get error info
        const errorInfo = ErrorAnalyzer.analyzeError(lastError);

        // Use shared failover error handling logic
        const decision = await this.processFailoverError(
          lastError,
          errorInfo,
          candidate,
          attemptStartTime,
          i,
          allCandidates,
          failoverAttempts,
          prompt,
          failoverConfig
        );

        // Update candidates list (may have been filtered)
        allCandidates = decision.updatedCandidates;

        if (decision.shouldRetry) {
          i--; // Retry same model/vendor
          continue;
        }

        if (decision.shouldContinue) {
          continue; // Try next candidate
        }

        // Otherwise break (fatal error or last candidate)
        break;
      }
    }

    // All candidates failed
    if (promptRun && failoverAttempts.length > 0) {
      this.updatePromptRunWithFailoverFailure(promptRun, failoverAttempts);
    }

    return this.createFailoverErrorResult(lastError, failoverAttempts);
  }

  /**
   * Builds failover candidates for a prompt based on available models and type restrictions
   */
  protected async buildFailoverCandidates(prompt: MJAIPromptEntityExtended): Promise<ModelVendorCandidate[]> {
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
  protected createCandidatesFromModels(models: MJAIModelEntityExtended[]): ModelVendorCandidate[] {
    const candidates: ModelVendorCandidate[] = [];

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
          source: 'power-rank'
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
            source: 'power-rank'
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
            (mv) => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active' && this.isInferenceProvider(mv)
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
    selectedModel: MJAIModelEntityExtended,
    renderedPromptText: string,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    promptRun: MJAIPromptRunEntityExtended,
    allCandidates: ModelVendorCandidate[],
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
   * Applies retry delay based on the prompt's retry strategy
   */
  /**
   * Calculates retry delay for rate limit and other retriable errors.
   * Uses the prompt's RetryStrategy and can respect suggested delays from provider.
   */
  private calculateRetryDelay(
    prompt: MJAIPromptEntityExtended,
    attemptNumber: number,
    suggestedDelaySeconds?: number
  ): number {
    // Use provider's suggested delay if available
    if (suggestedDelaySeconds && suggestedDelaySeconds > 0) {
      return suggestedDelaySeconds * 1000; // Convert to milliseconds
    }

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

    return delay;
  }

  private async applyRetryDelay(prompt: MJAIPromptEntityExtended, attemptNumber: number, suggestedDelaySeconds?: number): Promise<void> {
    const delay = this.calculateRetryDelay(prompt, attemptNumber, suggestedDelaySeconds);
    const delaySeconds = (delay / 1000).toFixed(1);
    LogStatus(`   Waiting ${delaySeconds}s before retry (strategy: ${prompt.RetryStrategy || 'Fixed'})...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Filters out all candidates from a vendor when a vendor-level error occurs.
   * Vendor-level errors affect all models from that vendor:
   * - Authentication: Invalid API key
   * - VendorValidationError: API schema/validation requirements
   */
  private filterVendorCandidates(
    errorType: string,
    currentVendorId: string | undefined,
    allCandidates: ModelVendorCandidate[]
  ): ModelVendorCandidate[] {
    if (errorType !== 'Authentication' && errorType !== 'VendorValidationError') {
      return allCandidates; // No filtering needed for non-vendor-level errors
    }

    const failedVendorId = currentVendorId || 'default';
    const beforeCount = allCandidates.length;

    // Filter out ALL candidates from this vendor
    const filteredCandidates = allCandidates.filter(c =>
      (c.vendorId || 'default') !== failedVendorId
    );

    const removedCount = beforeCount - filteredCandidates.length;
    if (removedCount > 0) {
      const vendorName = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, failedVendorId))?.Name || failedVendorId;
      const remainingCount = filteredCandidates.length;

      // Log appropriate message based on error type
      let reason: string;
      let icon: string;
      if (errorType === 'Authentication') {
        reason = 'Invalid API key';
        icon = '🔒';
      } else if (errorType === 'VendorValidationError') {
        reason = 'API schema incompatibility';
        icon = '⚠️';
      } else {
        reason = 'Vendor-level error';
        icon = '❌';
      }

      this.logStatus(
        `   ${icon} ${reason} for ${vendorName} - excluding ${removedCount} model${removedCount === 1 ? '' : 's'} from this vendor (${remainingCount} remaining)`,
        true
      );
    }

    return filteredCandidates;
  }

  /**
   * Handles rate limit errors by retrying the same model/vendor with backoff.
   * Returns true if the caller should continue (retry), false if should proceed to failover.
   */
  private async handleRateLimitRetry(
    errorAnalysis: { errorType: string; suggestedRetryDelaySeconds?: number },
    currentModel: MJAIModelEntityExtended,
    currentVendorId: string | undefined,
    failoverAttempts: FailoverAttempt[],
    prompt: MJAIPromptEntityExtended,
    attemptNumber: number,
    maxAttempts: number,
    failoverAttempt: FailoverAttempt
  ): Promise<boolean> {
    const isRateLimit = errorAnalysis.errorType === 'RateLimit';
    if (!isRateLimit) {
      return false; // Not a rate limit error
    }

    // Count how many times we've retried this specific model/vendor for rate limits
    const rateLimitRetryCount = failoverAttempts.filter(a =>
      UUIDsEqual(a.modelId, currentModel.ID) &&
      UUIDsEqual(a.vendorId, currentVendorId) &&
      a.errorType === 'RateLimit'
    ).length;

    // Use MaxRetries from prompt configuration, default to 3 if not set
    const maxRetries = prompt.MaxRetries ?? 3;

    // Retry up to MaxRetries times before giving up and failing over
    const shouldRetry = rateLimitRetryCount <= maxRetries;

    if (shouldRetry) {
      const modelName = currentModel.Name;
      const vendorName = currentVendorId
        ? AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, currentVendorId))?.Name || 'default'
        : 'default';

      this.logStatus(
        `   ⏳ Rate limit hit - retrying ${modelName} (${vendorName}) with backoff (attempt ${rateLimitRetryCount}/${maxRetries})`,
        true
      );
      this.logFailoverAttempt(prompt.ID, failoverAttempt, true);

      // Apply backoff delay before retry
      if (attemptNumber < maxAttempts) {
        await this.applyRetryDelay(prompt, rateLimitRetryCount, errorAnalysis.suggestedRetryDelaySeconds);
      }

      return true; // Signal to continue with same model/vendor
    }

    return false; // Too many retries, proceed to failover
  }

  /**
   * Processes a failover error (either from catch block or from failed ChatResult).
   * Handles vendor filtering, rate limit retries, fatal error detection, and failover logic.
   *
   * @returns Decision object indicating whether to retry same model, continue to next candidate, or stop
   */
  private async processFailoverError(
    error: Error,
    errorInfo: AIErrorInfo,
    candidate: ModelVendorCandidate,
    attemptStartTime: number,
    attemptIndex: number,
    allCandidates: ModelVendorCandidate[],
    failoverAttempts: FailoverAttempt[],
    prompt: MJAIPromptEntityExtended,
    failoverConfig: { strategy: string; errorScope?: 'All' | 'NetworkOnly' | 'RateLimitOnly' | 'ServiceErrorOnly'; delaySeconds?: number; maxAttempts: number }
  ): Promise<{
    shouldRetry: boolean;      // Retry same model/vendor (rate limit)
    shouldContinue: boolean;   // Continue to next candidate
    updatedCandidates: ModelVendorCandidate[];
  }> {
    const attemptDuration = Date.now() - attemptStartTime;

    // Create failover attempt record
    const failoverAttempt: FailoverAttempt = {
      attemptNumber: attemptIndex + 1,
      modelId: candidate.model.ID,
      vendorId: candidate.vendorId,
      error: error,
      errorType: errorInfo.errorType,
      duration: attemptDuration,
      timestamp: new Date()
    };
    failoverAttempts.push(failoverAttempt);

    // Vendor-level errors: filter out all candidates from this vendor
    let updatedCandidates = allCandidates;
    if (errorInfo.errorType === 'Authentication' || errorInfo.errorType === 'VendorValidationError') {
      updatedCandidates = this.filterVendorCandidates(
        errorInfo.errorType,
        candidate.vendorId,
        allCandidates
      );
    }

    const isLastCandidate = attemptIndex === updatedCandidates.length - 1;

    // Fatal errors: stop immediately
    if (errorInfo.severity === 'Fatal') {
      const errorMessage = error?.message || 'Unknown error';
      LogErrorEx(`Stopping failover: Fatal error (${errorInfo.errorType}): ${errorMessage}`);
      this.logFailoverAttempt(prompt.ID, failoverAttempt, false);
      return { shouldRetry: false, shouldContinue: false, updatedCandidates };
    }

    // Check errorScope filter if configured
    if (failoverConfig.errorScope && failoverConfig.errorScope !== 'All') {
      const matchesScope = this.errorMatchesScope(errorInfo.errorType, failoverConfig.errorScope);
      if (!matchesScope) {
        this.logFailoverAttempt(prompt.ID, failoverAttempt, false);
        return { shouldRetry: false, shouldContinue: false, updatedCandidates };
      }
    }

    // Rate limit errors: check if we should retry the same model before failing over
    if (errorInfo.errorType === 'RateLimit') {
      const shouldRetry = await this.handleRateLimitRetry(
        errorInfo,
        candidate.model,
        candidate.vendorId,
        failoverAttempts,
        prompt,
        attemptIndex,
        updatedCandidates.length,
        failoverAttempt
      );
      if (shouldRetry) {
        return { shouldRetry: true, shouldContinue: false, updatedCandidates };
      }
    }

    // If this is the last candidate, we're done
    if (isLastCandidate) {
      this.logFailoverAttempt(prompt.ID, failoverAttempt, false);
      return { shouldRetry: false, shouldContinue: false, updatedCandidates };
    }

    // Log and signal to continue to next candidate
    this.logFailoverAttempt(prompt.ID, failoverAttempt, true);
    return { shouldRetry: false, shouldContinue: true, updatedCandidates };
  }

  /**
   * Transitions to the next failover candidate.
   * Returns the next candidate info or null if no candidates are available.
   */
  private async transitionToNextCandidate(
    currentModel: MJAIModelEntityExtended,
    currentVendorId: string | undefined,
    failoverConfig: FailoverConfiguration,
    allCandidates: ModelVendorCandidate[],
    failoverAttempts: FailoverAttempt[],
    promptId: string,
    failoverAttempt: FailoverAttempt,
    attemptNumber: number
  ): Promise<{
    model: MJAIModelEntityExtended;
    vendorId: string | undefined;
    driverClass: string;
    apiName: string | undefined;
    supportsEffortLevel: boolean;
  } | null> {
    // Select next candidate using failover strategy
    const nextCandidates = this.selectFailoverCandidates(
      currentModel,
      currentVendorId,
      failoverConfig.strategy,
      failoverConfig.modelStrategy,
      allCandidates,
      failoverAttempts
    );

    if (nextCandidates.length === 0) {
      // No more candidates available
      this.logFailoverAttempt(promptId, failoverAttempt, false);
      return null;
    }

    const nextCandidate = nextCandidates[0];

    // Log the successful transition
    this.logFailoverAttempt(promptId, failoverAttempt, true);

    // Apply delay before next attempt (if not the last attempt)
    if (attemptNumber < failoverConfig.maxAttempts) {
      const delay = this.calculateFailoverDelay(attemptNumber, failoverConfig.delaySeconds);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    return {
      model: nextCandidate.model,
      vendorId: nextCandidate.vendorId,
      driverClass: nextCandidate.driverClass,
      apiName: nextCandidate.apiName,
      supportsEffortLevel: nextCandidate.supportsEffortLevel || false
    };
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
   * Determines whether a failover attempt should be made based on the error and configuration.
   *
   * @param error - The error that occurred during execution
   * @param config - The failover configuration
   * @param attemptNumber - The current attempt number (1-based)
   * @returns True if failover should be attempted, false otherwise
   *
   * @remarks
   * This method uses the ErrorAnalyzer to classify errors and determine if they are
   * eligible for failover based on the configured error scope. Override this method
   * to implement custom failover decision logic.
   */
  protected shouldAttemptFailover(
    error: Error,
    config: FailoverConfiguration,
    attemptNumber: number
  ): boolean {
    // Don't failover if strategy is None or we've exceeded max attempts
    if (config.strategy === 'None' || attemptNumber > config.maxAttempts) {
      return false;
    }

    // Analyze the error to determine if it's eligible for failover
    const errorAnalysis = ErrorAnalyzer.analyzeError(error);
    
    // Check if error analysis allows failover
    if (!errorAnalysis.canFailover) {
      return false;
    }

    // Check error scope configuration
    switch (config.errorScope) {
      case 'NetworkOnly':
        return errorAnalysis.errorType === 'NetworkError';
      case 'RateLimitOnly':
        return errorAnalysis.errorType === 'RateLimit';
      case 'ServiceErrorOnly':
        return errorAnalysis.errorType === 'ServiceUnavailable' || 
               errorAnalysis.errorType === 'InternalServerError';
      case 'All':
      default:
        return true;
    }
  }

  /**
   * Checks if an error type matches the configured error scope
   *
   * @param errorType - The error type from ErrorAnalyzer
   * @param scope - The configured error scope
   * @returns True if the error matches the scope
   */
  private errorMatchesScope(errorType: string, scope: 'All' | 'NetworkOnly' | 'RateLimitOnly' | 'ServiceErrorOnly'): boolean {
    switch (scope) {
      case 'NetworkOnly':
        return errorType === 'NetworkError';
      case 'RateLimitOnly':
        return errorType === 'RateLimit';
      case 'ServiceErrorOnly':
        return errorType === 'ServiceUnavailable' || errorType === 'InternalServerError';
      case 'All':
      default:
        return true;
    }
  }

  /**
   * Calculates the delay before the next failover attempt.
   *
   * @param attemptNumber - The current attempt number (1-based)
   * @param baseDelaySeconds - The base delay in seconds from configuration
   * @param previousError - The error from the previous attempt
   * @returns Delay in milliseconds before the next attempt
   *
   * @remarks
   * Implements exponential backoff with jitter by default. The delay increases
   * exponentially with each attempt and includes random jitter to prevent
   * thundering herd problems. Override this method to implement custom delay logic.
   */
  protected calculateFailoverDelay(
    attemptNumber: number,
    baseDelaySeconds: number
  ): number {
    // Exponential backoff: delay = base * 2^(attempt-1)
    const exponentialDelay = baseDelaySeconds * Math.pow(2, attemptNumber - 1);
    
    // Add jitter (0-25% of delay) to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * Math.random();
    
    // Cap at 30 seconds to prevent excessive delays
    const totalDelay = Math.min(exponentialDelay + jitter, 30);
    
    return totalDelay * 1000; // Convert to milliseconds
  }

  /**
   * Selects candidate models for failover based on the strategy and current failure.
   *
   * @param currentModel - The model that just failed
   * @param currentVendorId - The vendor ID that just failed
   * @param strategy - The failover strategy to use
   * @param modelStrategy - The model selection preference
   * @param allCandidates - All available model-vendor candidates
   * @param attemptHistory - History of previous failover attempts
   * @returns Array of candidates sorted by priority (highest first)
   *
   * @remarks
   * This method implements different strategies for selecting failover candidates:
   * - SameModelDifferentVendor: Try the same model with different vendors
   * - NextBestModel: Try different models in order of preference
   * - PowerRank: Use the global power ranking of models
   *
   * Override this method to implement custom candidate selection logic.
   */
  protected selectFailoverCandidates(
    currentModel: MJAIModelEntityExtended,
    currentVendorId: string | undefined,
    strategy: FailoverConfiguration['strategy'],
    modelStrategy: FailoverConfiguration['modelStrategy'],
    allCandidates: ModelVendorCandidate[],
    attemptHistory: FailoverAttempt[]
  ): ModelVendorCandidate[] {
    // Filter out candidates that have already failed
    // Note: Authentication errors are already filtered from allCandidates upstream,
    // so we only need to filter out specific model/vendor pairs that have failed
    const failedPairs = new Set(
      attemptHistory.map(a => `${a.modelId}:${a.vendorId || 'default'}`)
    );

    const availableCandidates = allCandidates.filter(c => {
      const key = `${c.model.ID}:${c.vendorId || 'default'}`;
      return !failedPairs.has(key);
    });

    // Check if we have context length exceeded errors in the attempt history
    const hasContextLengthError = attemptHistory.some(a => 
      a.errorType === 'ContextLengthExceeded' || 
      ErrorAnalyzer.analyzeError(a.error).errorType === 'ContextLengthExceeded'
    );

    // Apply strategy-specific filtering and sorting
    let candidates: ModelVendorCandidate[];
    
    switch (strategy) {
      case 'SameModelDifferentVendor':
        // Only consider same model with different vendors
        candidates = availableCandidates.filter(c =>
          UUIDsEqual(c.model.ID, currentModel.ID) && !UUIDsEqual(c.vendorId, currentVendorId)
        );
        break;
        
      case 'NextBestModel':
        // Consider all models, apply model strategy preference
        candidates = availableCandidates;
        if (modelStrategy === 'RequireSameModel') {
          candidates = candidates.filter(c => UUIDsEqual(c.model.ID, currentModel.ID));
        } else if (modelStrategy === 'PreferSameModel') {
          // Sort to put same model first
          candidates.sort((a, b) => {
            const aSameModel = UUIDsEqual(a.model.ID, currentModel.ID) ? 1 : 0;
            const bSameModel = UUIDsEqual(b.model.ID, currentModel.ID) ? 1 : 0;
            return bSameModel - aSameModel;
          });
        } else if (modelStrategy === 'PreferDifferentModel') {
          // Sort to put different models first
          candidates.sort((a, b) => {
            const aDiffModel = !UUIDsEqual(a.model.ID, currentModel.ID) ? 1 : 0;
            const bDiffModel = !UUIDsEqual(b.model.ID, currentModel.ID) ? 1 : 0;
            return bDiffModel - aDiffModel;
          });
        }
        break;
        
      case 'PowerRank':
        // Use all candidates, they're already sorted by power rank
        candidates = availableCandidates;
        break;
        
      default:
        candidates = [];
    }

    // If we have context length errors, prioritize models with larger context windows
    if (hasContextLengthError) {
      const currentMaxTokens = currentModel.ModelVendors?.length > 0 ?
        Math.max(...currentModel.ModelVendors.map(mv => mv.MaxInputTokens || 0)) : 0;

      // Filter out models with same or smaller context windows
      candidates = candidates.filter(c => {
        const candidateMaxTokens = c.model.ModelVendors?.length > 0 ?
          Math.max(...c.model.ModelVendors.map(mv => mv.MaxInputTokens || 0)) : 0;
        return candidateMaxTokens > currentMaxTokens;
      });

      // If no larger models exist, this is a fatal error - return empty to stop retrying
      if (candidates.length === 0) {
        LogStatusEx({
          message: `❌ Context length exceeded and no models with larger context windows available. Current model: ${currentModel.Name} (${currentMaxTokens} max tokens). This is a fatal error.`,
          category: 'AI',
          additionalArgs: [{
            currentModel: currentModel.Name,
            currentMaxTokens,
            availableModels: allCandidates.map(c => c.model.Name).join(', '),
            reason: 'No models with larger context windows available for failover'
          }]
        });
        // Return empty array - caller will see no candidates and stop retrying
        return [];
      }

      // Sort by priority first (existing algorithm), then by context window size as tiebreaker
      candidates.sort((a, b) => {
        // Primary sort: priority (higher is better) - maintains existing algorithm
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }

        // Secondary sort: context window size (largest first) - only as tiebreaker
        const aMaxTokens = a.model.ModelVendors?.length > 0 ?
          Math.max(...a.model.ModelVendors.map((mv: MJAIModelVendorEntity) => mv.MaxInputTokens || 0)) : 0;
        const bMaxTokens = b.model.ModelVendors?.length > 0 ?
          Math.max(...b.model.ModelVendors.map((mv: MJAIModelVendorEntity) => mv.MaxInputTokens || 0)) : 0;

        return bMaxTokens - aMaxTokens;
      });

      // Log context-aware failover selection
      const bestCandidate = candidates[0];
      const bestCandidateMaxTokens = bestCandidate.model.ModelVendors?.length > 0 ?
        Math.max(...bestCandidate.model.ModelVendors.map((mv: MJAIModelVendorEntity) => mv.MaxInputTokens || 0)) : 0;
      LogStatusEx({
        message: `🔄 Context-aware failover: Selected model ${bestCandidate.model.Name} with ${bestCandidateMaxTokens} max input tokens (vs ${currentMaxTokens} for failed model)`,
        category: 'AI',
        additionalArgs: [{
          currentModel: currentModel.Name,
          currentMaxTokens,
          selectedModel: bestCandidate.model.Name,
          selectedMaxTokens: bestCandidateMaxTokens,
          candidateCount: candidates.length
        }]
      });
    } else {
      // Final sort by priority (higher is better) for non-context-length errors
      candidates.sort((a, b) => b.priority - a.priority);
    }
    
    return candidates;
  }

  /**
   * Logs a failover attempt for tracking and debugging.
   * 
   * @param promptId - The ID of the prompt being executed
   * @param attempt - The failover attempt details
   * @param willRetry - Whether another attempt will be made
   * 
   * @remarks
   * This method logs detailed information about each failover attempt to help with
   * debugging and monitoring. Override this method to implement custom logging or
   * integrate with external monitoring systems.
   */
  protected logFailoverAttempt(
    promptId: string,
    attempt: FailoverAttempt,
    willRetry: boolean
  ): void {
    const message = `Failover attempt ${attempt.attemptNumber} for prompt ${promptId}`;
    const metadata = {
      promptId,
      attemptNumber: attempt.attemptNumber,
      modelId: attempt.modelId,
      vendorId: attempt.vendorId,
      errorType: attempt.errorType,
      duration: attempt.duration,
      willRetry,
      error: attempt.error.message
    };

    if (willRetry) {
      LogStatusEx({
        message: `⚡ ${message}`,
        category: 'AI',
        additionalArgs: [metadata]
      });
    } else {
      LogErrorEx({
        message: message,
        error: attempt.error,
        category: 'AI',
        severity: 'error',
        metadata: metadata
      });
    }
  }
}

