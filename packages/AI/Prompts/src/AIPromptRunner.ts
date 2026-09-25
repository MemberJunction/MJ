import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ChatMessage, GetAIAPIKey, ErrorAnalyzer, AIErrorInfo, ResolveFileInputStrategy, AIPromptConfiguration, EncodeToolTurnsAsText } from '@memberjunction/ai';
import {
  BaseModelRunner,
  type ExecutionBound,
  type ModelVendorCandidate,
  type FailoverConfiguration,
  type FailoverAttempt,
  type ResolvedScalarInferenceParams,
} from './BaseModelRunner';
import { GetToolCallingDecision, GetToolCallingMode, NativeToolCallingDecision, RecordToolCallingDecision, RecordToolCallingMode, ResolveNativeToolCalling } from './nativeToolCallingGate';
import { AIModelRunner } from './AIModelRunner';
import { ValidationAttempt, AIPromptRunResult, AIModelSelectionInfo } from '@memberjunction/ai-core-plus';
import { BaseEntitySaveQueue, LogErrorEx, LogStatus, LogStatusEx, IsVerboseLoggingEnabled, Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { CleanJSON, RepairJSONEscaping, MJGlobal, JSONValidator, ValidationResult, ValidationErrorInfo, ValidationErrorType, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { MJAIPromptModelEntity, MJAIModelVendorEntity, MJAIConfigurationEntity, MJAIVendorEntity, MJTemplateEntityExtended, MJAICredentialBindingEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { MJAIModelEntityExtended, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { CredentialEngine } from '@memberjunction/credentials';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';
import { ExecutionPlanner } from './ExecutionPlanner';
import { AIPromptTimeoutError } from './AIPromptTimeoutError';
import { ResultSelectionConfig, type IParallelExecutionCoordinator } from './ParallelExecution';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { SystemPlaceholderManager } from '@memberjunction/ai-core-plus';
import {
    TemplateMessageRole,
    ChildPromptParam,
    AIPromptParams
} from '@memberjunction/ai-core-plus';
// json5 is a CJS module: under this package's ESM output its import namespace has no
// `parse` — only the default export does. `import * as JSON5` made JSON5.parse
// undefined at runtime ("JSON5.parse is not a function"), silently disabling the
// local JSON-repair tier and forcing every malformed payload onto the AI-repair path.
import JSON5 from 'json5';

/**
 * Best-guess MIME family for a ChatMessage content block type when the block
 * doesn't carry its own mimeType. Used by stripUnsupportedMediaBlocks to
 * compare against the driver's GetFileCapabilities() list.
 */
function mimeFromBlockType(type: string): string {
    switch (type) {
        case 'image_url': return 'image/*';
        case 'audio_url': return 'audio/*';
        case 'video_url': return 'video/*';
        case 'file_url': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}

// Both were exported from this module before they moved to BaseModelRunner; keep that import path working.
export type { ExecutionBound, FailoverConfiguration } from './BaseModelRunner';

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
 * Bundles the full output of selectModel so it can be threaded through
 * ExecutePrompt → executeSinglePrompt / executePromptInParallel without
 * discarding vendor-resolution data that would need to be re-derived.
 */
interface ModelSelectionResult {
  model: MJAIModelEntityExtended | null;
  vendorDriverClass?: string;
  vendorApiName?: string;
  vendorSupportsEffortLevel?: boolean;
  modelEffortLevel?: number;
  /** The selected candidate's AIPromptModel `PromptConfiguration`, for the native tool-calling gate. */
  promptModelConfiguration?: AIPromptConfiguration | null;
  selectionInfo?: AIModelSelectionInfo;
  allCandidates: ModelVendorCandidate[];
  /**
   * Per-candidate credential-availability already computed by
   * {@link AIPromptRunner.selectModelWithAPIKeyTracked} during selection, keyed by
   * `driverClass:modelID:vendorId` (the same key {@link AIPromptRunner.executeModelWithFailover}
   * uses for its own cache). Lets failover REUSE selection's credential probes instead of
   * recomputing `hasCredentialsAvailable` for the prefix it already walked.
   *
   * Because selection short-circuits once the highest-priority credentialed candidate is found
   * (see the DECISION note in {@link AIPromptRunner.selectModelWithAPIKeyTracked}), this map
   * only contains the candidates UP TO AND INCLUDING the selected one. The not-evaluated tail is
   * intentionally absent so failover still probes it lazily — only if it ever has to walk down
   * there during an actual failover.
   */
  credentialAvailability?: Map<string, boolean>;
}

export class AIPromptRunner extends BaseModelRunner {
  /**
   * The model type this runner requires. Returns 'LLM' for AIPromptRunner.
   */
  public override get RequiredModelType(): string {
    return 'LLM';
  }

  private _templateEngine: TemplateEngineServer;
  private _executionPlanner: ExecutionPlanner;
  private _parallelCoordinator?: IParallelExecutionCoordinator;
  private _jsonValidator: JSONValidator;
  private _modelRunner: AIModelRunner;

  /**
   * Process-wide cache of parsed `OutputExample` JSON, keyed by the raw example string.
   * A prompt's OutputExample is a static string reused across every run and every validation
   * retry, so re-parsing it each time is pure waste. Keyed by content (not prompt ID) so two
   * prompts sharing an identical example share one parsed entry and an edited example never
   * serves a stale parse. Stores `{ parsed }` on success or `{ error }` on failure so we cache
   * the failure too rather than re-throwing-and-reparsing bad JSON every attempt.
   */
  private static readonly _outputExampleCache = new Map<string, { parsed?: unknown; error?: string }>();

  /**
   * Marker used in `AIModelSelectionInfo.modelsConsidered[].unavailableReason` for candidates
   * that were intentionally NOT credential-checked because a higher-priority candidate had
   * already been selected. See the DECISION note in {@link selectModelWithAPIKeyTracked}.
   */
  private static readonly NOT_EVALUATED_REASON = 'Not evaluated (a higher-priority candidate was already selected; set AIPromptParams.forceFullModelEvaluation to probe all)';

  constructor() {
    super();
    this._metadata = (this._provider as unknown as Metadata) ?? new Metadata();
    this._templateEngine = TemplateEngineServer.Instance;
    this._executionPlanner = new ExecutionPlanner();
    this._jsonValidator = new JSONValidator();
    this._modelRunner = new AIModelRunner();
  }

  /** ClassFactory key the parallel coordinator self-registers under (see {@link ParallelCoordinator}). */
  private static readonly PARALLEL_COORDINATOR_KEY = 'ParallelExecutionCoordinator';

  /**
   * Lazily resolves the parallel execution coordinator.
   *
   * The coordinator is a SUBCLASS of AIPromptRunner — it inherits {@link executeModel} and the rest
   * of the battle-tested execution path so there is a single source of truth for credential / driver
   * / ChatParams / streaming resolution. That subclass relationship means the base cannot statically
   * `new` it without a hard circular import, so we resolve it through the ClassFactory instead (the
   * coordinator self-registers via `@RegisterClass(AIPromptRunner, PARALLEL_COORDINATOR_KEY)`).
   * Created once per runner and reused; the runner's Provider override is propagated. Throws a clear
   * error if the coordinator class was never loaded/registered — otherwise ClassFactory would silently
   * fall back to a plain AIPromptRunner that lacks the parallel methods.
   */
  protected get ParallelCoordinator(): IParallelExecutionCoordinator {
    if (!this._parallelCoordinator) {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<IParallelExecutionCoordinator>(
        AIPromptRunner,
        AIPromptRunner.PARALLEL_COORDINATOR_KEY,
      );
      if (!instance || typeof instance.executeTasksInParallel !== 'function') {
        throw new Error(
          `ParallelExecutionCoordinator is not registered with the ClassFactory. Ensure ` +
          `'@memberjunction/ai-prompts' is fully loaded (it is exported from the package index and ` +
          `picked up by the class-registration manifest).`,
        );
      }
      instance.Provider = this.Provider;
      this._parallelCoordinator = instance;
    }
    return this._parallelCoordinator;
  }

  /**
   * Access the underlying AIModelRunner for embedding and other non-LLM model calls.
   * Use this when you need tracked embedding execution with AIPromptRun record creation.
   */
  public get ModelRunner(): AIModelRunner {
    return this._modelRunner;
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
      let childTemplateRenderingResult: { renderedTemplates: Record<string, string> } | undefined;
      let selection: ModelSelectionResult | undefined;

      // Handle different prompt execution modes
      if (params.childPrompts && params.childPrompts.length > 0) {
        // Hierarchical template composition mode - render child templates first, then compose

        // Determine which prompt to use for model selection
        let modelSelectionPrompt = prompt;
        if (params.modelSelectionPrompt) {
          modelSelectionPrompt = params.modelSelectionPrompt;
        }

        // Select model using the appropriate prompt — capture the FULL result
        selection = await this.selectModel(modelSelectionPrompt, params.override?.modelId, params.contextUser, params.configurationId, params.override?.vendorId, params);
        if (!selection.model) {
          throw new Error(this.buildNoModelFoundMessage(modelSelectionPrompt.Name, selection.selectionInfo));
        }

        // Tell the template which path this run is actually taking, BEFORE it renders. The loop
        // template drops its action catalog and the `'Actions'` step type under native mode
        // (plan §8.4), and that is only safe if the flag is the gate's real answer rather than the
        // caller's intent — a prompt that suppressed its catalog while the model received no tools
        // would leave the agent unable to act at all.
        // Caveat: failover re-resolves the gate per attempt, so a failover onto a model without
        // the capability keeps the already-rendered native wording. The request still degrades
        // correctly (no tools are sent); the prompt is merely quieter than it should be.
        //
        // This must resolve from the SAME inputs the request-time call uses (see
        // `applyNativeToolCalling`), or the template can render for the opposite path: the vendor
        // actually selected — not merely the caller's override, which is usually absent — and the
        // selected candidate's AIPromptModel bag. Resolving without those skips the two layers the
        // capability is normally declared on and silently inverts the decision.
        if (params.tools?.length) {
          const nativeDecision = this.ResolveNativeToolCallingDecision(
            prompt, params, selection.model,
            selection.selectionInfo?.vendorSelected?.ID ?? params.override?.vendorId ?? null,
            selection.promptModelConfiguration);
          params.data = {
            ...(params.data ?? {}),
            _NATIVE_TOOL_CALLING: nativeDecision.useNativeTools,
            // The template renders the implicit-mode section only when this is the gate's REAL answer.
            _NATIVE_CONTROL_FLOW: nativeDecision.controlFlow
          };
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
        parentPromptRun = await this.createPromptRun(prompt, selection.model, params, renderedPromptText, startTime, params.override?.vendorId, selection.selectionInfo);
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

      // If no model was selected yet (non-hierarchical case), select one now — capture the FULL result
      if (!selection?.model) {
        let modelSelectionPrompt = prompt;
        if (params.modelSelectionPrompt) {
          modelSelectionPrompt = params.modelSelectionPrompt;
          this.logStatus(`🎯 Using prompt "${modelSelectionPrompt.Name}" for model selection instead of main prompt`, true, params);
        }

        selection = await this.selectModel(modelSelectionPrompt, params.override?.modelId, params.contextUser, params.configurationId, params.override?.vendorId, params);
        if (!selection.model) {
          throw new Error(this.buildNoModelFoundMessage(modelSelectionPrompt.Name, selection.selectionInfo));
        }
      }

      // Check if we need parallel execution based on ParallelizationMode
      const shouldUseParallelExecution = prompt.ParallelizationMode && prompt.ParallelizationMode !== 'None';

      let result: AIPromptRunResult<T>;
      if (shouldUseParallelExecution) {
        // Use parallel execution path — pass full selection through
        result = await this.executePromptInParallel<T>(prompt, renderedPromptText, params, startTime, parentPromptRun, selection);
      } else {
        // Use traditional single execution path — pass full selection through
        result = await this.executeSinglePrompt<T>(prompt, renderedPromptText, params, startTime, parentPromptRun, selection);
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
        promptRun.Success = false;
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
        // Preserve the original exception on the ChatResult so typed failures (e.g.
        // AIPromptTimeoutError from an exceeded AIPrompt.TimeoutMS) survive to the caller
        // instead of being flattened into a string.
        chatResult: { success: false, errorMessage: error.message, errorInfo, exception: error } as ChatResult,
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
    existingSelection?: ModelSelectionResult
  ): Promise<AIPromptRunResult<T>> {
    // Check for cancellation before model selection
    if (params.cancellationToken?.aborted) {
      throw new Error('Prompt execution was cancelled before model selection');
    }

    // Use existing selection if provided (hierarchical case) or select now
    let selectedModel = existingSelection?.model ?? undefined;
    let modelSelectionInfo = existingSelection?.selectionInfo;
    let vendorDriverClass = existingSelection?.vendorDriverClass;
    let vendorApiName = existingSelection?.vendorApiName;
    let vendorSupportsEffortLevel = existingSelection?.vendorSupportsEffortLevel;
    let modelEffortLevel = existingSelection?.modelEffortLevel;
    let promptModelConfiguration = existingSelection?.promptModelConfiguration;
    let allCandidates: ModelVendorCandidate[] = existingSelection?.allCandidates ?? [];
    // Credential probes already done during selection — reused by failover so it doesn't
    // recompute hasCredentialsAvailable for the prefix it walks before the selected candidate.
    let credentialAvailability = existingSelection?.credentialAvailability;

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
      promptModelConfiguration = modelResult.promptModelConfiguration;
      modelSelectionInfo = modelResult.selectionInfo;
      allCandidates = modelResult.allCandidates || [];
      credentialAvailability = modelResult.credentialAvailability;
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
      modelEffortLevel, // Pass model-specific effort level
      credentialAvailability, // Reuse credential probes from selection
      promptModelConfiguration
    );

    // Calculate execution metrics
    const endTime = new Date();
    const executionTimeMS = endTime.getTime() - startTime.getTime();

    // Layer 4 instrumentation: attribute this run to the path it actually took, before the update
    // persists it. Left NULL when no model call happened, which is the honest value.
    promptRun.ToolCallingMode = GetToolCallingMode(modelResult) ?? null;

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
    existingSelection?: ModelSelectionResult
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
    if (existingSelection?.model) {
      // Create a single execution task with the pre-selected model
      executionTasks = [{
        taskId: 'pre-selected',
        model: existingSelection.model,
        vendorDriverClass: existingSelection.vendorDriverClass,
        vendorApiName: existingSelection.vendorApiName,
        messages: params.conversationMessages || [],
        promptText: renderedPromptText,
        templateMessageRole: params.templateMessageRole || 'system',
        contextUser: params.contextUser
      }];
      this.logStatus(`   Using pre-selected model "${existingSelection.model.Name}" for parallel execution`, true, params);
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
    const parallelResult = await this.ParallelCoordinator.executeTasksInParallel(params, executionTasks, undefined, undefined, params.cancellationToken);

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

      const aiSelectedResult = await this.ParallelCoordinator.selectBestResult(successfulResults, selectionConfig, undefined, params.cancellationToken);
      if (aiSelectedResult) {
        selectedResult = aiSelectedResult;
      }
    }

    // Calculate total tokens and costs from all parallel executions
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let totalCost = 0;
    let hasCost = false;

    for (const result of successfulResults) {
      const usage = result.modelResult?.data?.usage;
      if (usage) {
        totalPromptTokens += usage.promptTokens || 0;
        totalCompletionTokens += usage.completionTokens || 0;
        // Sum cache tokens across every attempt — each was a real provider call, so the billed
        // cache usage is the sum, not the selected result's alone (which feeds the non-rollup field).
        totalCacheReadTokens += usage.cacheReadTokens || 0;
        totalCacheWriteTokens += usage.cacheWriteTokens || 0;
        if (usage.cost !== undefined) {
          totalCost += usage.cost;
          hasCost = true;
        }
      }
    }

    // Use existing prompt run if provided (hierarchical case) or create new one
    // Use the model selection info if provided (from hierarchical execution)
    const consolidatedPromptRun = existingPromptRun || await this.createPromptRun(prompt, selectedResult.task.model, params, renderedPromptText, startTime, params.override?.vendorId, existingSelection?.selectionInfo);

    // Update with parallel execution metadata
    const endTime = new Date();
    consolidatedPromptRun.CompletedAt = endTime;
    consolidatedPromptRun.ExecutionTimeMS = parallelResult.totalExecutionTimeMS;
    consolidatedPromptRun.Result = selectedResult.rawResult || '';
    consolidatedPromptRun.TokensUsed = parallelResult.totalTokensUsed;

    // Layer 4 instrumentation, same as the single-model path. This path reaches the same
    // `executeModel` and therefore declares tools, so leaving the column NULL here would tell the
    // agent loop a NativeImplicit turn was not implicit — every control-flow call would then be
    // rejected as an undeclared tool and the loop would retry on tools it declared itself.
    consolidatedPromptRun.ToolCallingMode = GetToolCallingMode(selectedResult.modelResult) ?? null;
    
    // Extract token and cost info from selected result
    const selectedResultUsage = selectedResult.modelResult?.data?.usage;
    if (selectedResultUsage) {
      consolidatedPromptRun.TokensPrompt = selectedResultUsage.promptTokens;
      consolidatedPromptRun.TokensCompletion = selectedResultUsage.completionTokens;
      // Persist the selected result's cache token counts so (a) they are recorded and (b) any
      // downstream cost recompute (MJAIPromptRunEntityServer, when no provider cost is present)
      // prices the full input including cached tokens rather than dropping them.
      consolidatedPromptRun.TokensCacheRead = selectedResultUsage.cacheReadTokens ?? 0;
      consolidatedPromptRun.TokensCacheWrite = selectedResultUsage.cacheWriteTokens ?? 0;
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
    consolidatedPromptRun.TokensCacheReadRollup = totalCacheReadTokens;
    consolidatedPromptRun.TokensCacheWriteRollup = totalCacheWriteTokens;
    if (hasCost) {
      consolidatedPromptRun.TotalCost = totalCost;
    }
    
    // Set Status and WasSelectedResult for parallel execution
    consolidatedPromptRun.Status = parallelResult.successCount > 0 ? 'Completed' : 'Failed';
    consolidatedPromptRun.WasSelectedResult = true; // This is the consolidated result chosen by judge

    // Persist the consolidated run fire-and-forget; the finalize UPDATE chains after its INSERT via
    // the save queue. These fields are set after all the awaited parallel work, so the INSERT has long
    // landed — a plain Update (no post-INSERT callback) is race-safe here.
    this._promptRunQueue.Update(consolidatedPromptRun);

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
        vendorId: existingSelection?.selectionInfo?.vendorSelected?.ID, // VendorID not directly available on AIModel
        vendorName: selectedResult.task.model.Vendor,
      },
      judgeMetadata: selectedResult.judgeMetadata,
      modelSelectionInfo: existingSelection?.selectionInfo, // Include model selection info if provided
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
   * If a nunjucks render error message contains `[Line N, Column M]`,
   * return that line of the template source (1-based) with a caret pointer
   * for the column. Returns null when we can't parse the location, the
   * template text is missing, or the line is out of range. Surfaces the
   * actual offending source in child-template failure messages so the
   * server log + prompt run + agent step record point at the exact spot
   * instead of just "render failed".
   */
  private extractTemplateSourceExcerpt(
    templateText: string | null | undefined,
    nunjucksError: string | null | undefined,
  ): string | null {
    if (!templateText || !nunjucksError) return null;
    const match = /\[Line (\d+),\s*Column (\d+)\]/.exec(nunjucksError);
    if (!match) return null;
    const lineNum = parseInt(match[1], 10);
    const colNum = parseInt(match[2], 10);
    if (!Number.isFinite(lineNum) || !Number.isFinite(colNum)) return null;
    const lines = templateText.split('\n');
    if (lineNum < 1 || lineNum > lines.length) return null;
    const line = lines[lineNum - 1];
    // Trim very long lines to keep log noise reasonable.
    const trimmed = line.length > 240 ? line.slice(0, 240) + '…' : line;
    const caret = ' '.repeat(Math.max(0, colNum - 1)) + '^';
    return `L${lineNum}:${colNum} ${trimmed}\n        ${caret}`;
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
            // Surface as much diagnostic detail as we have. The nunjucks
            // error string usually carries `[Line X, Column Y]` already;
            // we add the template name, content ID, and the surrounding
            // line of template source so the server log doubles as a
            // "what line in which template" pointer instead of just
            // "render failed".
            const tplContent = template.GetHighestPriorityContent();
            const sourceExcerpt = this.extractTemplateSourceExcerpt(
                tplContent?.TemplateText,
                childRenderResult.Message,
            );
            const dataKeys = Object.keys(mergedChildData).join(', ');
            const detail =
                `child="${childPrompt.Name}" ` +
                `placeholder="${childParam.parentPlaceholder}" ` +
                `templateId=${childPrompt.TemplateID} ` +
                `contentId=${tplContent?.ID ?? 'n/a'} ` +
                `dataKeys=[${dataKeys}]` +
                (sourceExcerpt ? `\n  near: ${sourceExcerpt}` : '');
            console.error(`[ChildTemplateRender] FAILED — ${childRenderResult.Message}`);
            console.error(`[ChildTemplateRender] Context: ${detail}`);
            throw new Error(
                `Failed to render child template for prompt "${childPrompt.Name}" ` +
                `(placeholder="${childParam.parentPlaceholder}"): ${childRenderResult.Message}` +
                (sourceExcerpt ? `\n  near: ${sourceExcerpt}` : ''),
            );
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
          success: true,
          errorMessage: undefined as string | undefined,
        };

      } catch (error) {
        this.logError(error, {
          category: 'ChildTemplateRendering',
          metadata: {
            placeholder: childParam.parentPlaceholder,
            childPromptName: childParam.childPrompt.prompt.Name,
            childPromptId: childParam.childPrompt.prompt.ID,
          },
          maxErrorLength: params.maxErrorLength
        });

        // Return error result but allow other children to continue. The
        // underlying error message is preserved on `errorMessage` so the
        // aggregator below can throw a *useful* error instead of just a
        // placeholder-name list.
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          placeholder: childParam.parentPlaceholder,
          renderedTemplate: `ERROR: ${errMsg}`,
          success: false,
          errorMessage: errMsg,
        };
      }
    });

    // Wait for all child template rendering to complete
    const childResults = await Promise.all(childRenderingPromises);

    // Check if any critical errors occurred
    const failedChildren = childResults.filter(r => !r.success);
    if (failedChildren.length > 0) {
      // Compose a single error message that includes the underlying
      // error from each failed child. Previously this threw just a list
      // of placeholder names ("agentSpecificPrompt") — opaque. Now the
      // thrown error carries the nunjucks message (with [Line X, Column Y])
      // and prompt names, so it propagates into `promptRun.Result` /
      // `promptRun.ErrorDetails` and the agent step's error surface.
      const childErrorDetails = failedChildren
        .map(fc => `  - ${fc.placeholder}: ${fc.errorMessage ?? 'unknown error'}`)
        .join('\n');

      this.logError(`${failedChildren.length} out of ${childResults.length} child prompt templates failed to render`, {
        category: 'ChildTemplateFailures',
        severity: 'critical',
        metadata: {
          failedCount: failedChildren.length,
          totalCount: childResults.length,
          failedPlaceholders: failedChildren.map(fc => fc.placeholder),
          failures: failedChildren.map(fc => ({
            placeholder: fc.placeholder,
            error: fc.errorMessage,
          })),
        },
        maxErrorLength: params.maxErrorLength
      });

      throw new Error(
        `Failed to render ${failedChildren.length} child prompt template(s):\n${childErrorDetails}`,
      );
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
  ): Promise<ModelSelectionResult> {
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
        configuration = AIEngine.Instance.ConfigurationsByID.get(NormalizeUUID(configurationId));
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
      const { selected, consideredModels, credentialAvailability } = await this.selectModelWithAPIKeyTracked(candidates, prompt.ID, params);

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
          credentialAvailability,
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
      } else if (selected.source === 'power-match-fallback') {
        selectionReason = `Fallback: selected ${selected.model.Name} (PowerRank ${selected.model.PowerRank || 0}) as closest match to configured models' power level`;
      }

      if (selected.isPreferredVendor) {
        selectionReason += ' using preferred vendor';
      }

      // Check if fallback was used (not the first candidate)
      const fallbackUsed = candidates.indexOf(selected) > 0;

      // Get selected vendor entity
      let selectedVendor: MJAIVendorEntity | undefined;
      if (selected.vendorId) {
        selectedVendor = AIEngine.Instance.VendorsByID.get(NormalizeUUID(selected.vendorId));
      }

      return {
        model: selected.model,
        vendorDriverClass: selected.driverClass,
        vendorApiName: selected.apiName,
        vendorSupportsEffortLevel: selected.supportsEffortLevel,
        modelEffortLevel: selected.effortLevel, // Pass through model-specific effort level
        promptModelConfiguration: selected.promptModelConfiguration,
        allCandidates: candidates,
        credentialAvailability,
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
    /**
     * The credential-availability cache built while probing candidates, keyed by
     * `driverClass:modelId:vendorId`. Returned so callers (failover) can reuse these probes
     * rather than recomputing them. Contains only the candidates actually evaluated — the
     * short-circuited tail is absent (see the DECISION note below).
     */
    credentialAvailability: Map<string, boolean>;
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

    // DECISION (performance): candidates are ordered by priority, and we only need the
    // highest-priority candidate that has working credentials. So once we find that first
    // hit, we STOP credential-probing the remaining candidates and record them as
    // "not-evaluated" rather than running a `hasCredentialsAvailable` check (which does
    // env-var lookups + binding scans) for every configured model on every prompt run.
    // The remaining candidates are still kept in `consideredModels` (and in the returned
    // `allCandidates` from selectModel, which is the FULL ordered list) so failover and the
    // ordering are unaffected — only the per-candidate availability *telemetry* for the tail
    // is skipped. Callers that need a complete availability report (e.g. an admin diagnostic)
    // can set `AIPromptParams.forceFullModelEvaluation = true` to probe every candidate.
    const forceFullEval = params?.forceFullModelEvaluation === true;
    let selected: typeof consideredModels[number] | undefined;

    for (const candidate of candidates) {
      const vendorEntity = candidate.vendorId
        ? AIEngine.Instance.VendorsByID.get(NormalizeUUID(candidate.vendorId))
        : undefined;

      // Short-circuit: a usable candidate is already selected and full evaluation wasn't requested.
      if (selected && !forceFullEval) {
        consideredModels.push({
          model: candidate.model,
          vendor: vendorEntity,
          priority: candidate.priority,
          available: false,
          unavailableReason: AIPromptRunner.NOT_EVALUATED_REASON
        });
        continue;
      }

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

      // Track this model as considered with availability status
      const considered = {
        model: candidate.model,
        vendor: vendorEntity,
        priority: candidate.priority,
        available: hasCredentials,
        unavailableReason: hasCredentials ? undefined : `No credentials configured for driver ${candidate.driverClass}`
      };
      consideredModels.push(considered);

      // Record the first available candidate as the selection (highest priority with credentials)
      if (hasCredentials && !selected) {
        selected = considered;
      }
    }

    const selectedCandidate = selected ? candidates.find(c =>
      UUIDsEqual(c.model.ID, selected!.model.ID) &&
      UUIDsEqual(c.vendorId, selected!.vendor?.ID)
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

    return { selected: selectedCandidate, consideredModels, credentialAvailability: credentialCache };
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

      // Render the template with validation **downgraded to warnings**.
      // The previous default (SkipValidation=false) hard-failed on any
      // declared-required template param that wasn't supplied — including
      // the surprising case where a system placeholder like `_OUTPUT_EXAMPLE`
      // resolves to `''` for prompts that don't define an OutputExample
      // (ValidateTemplateInput treats trim-empty strings as "not provided").
      // That made "render failure" the dominant failure mode for any prompt
      // that referenced a system placeholder it didn't populate, which is
      // an authoring trap rather than a real correctness issue.
      //
      // With SkipValidation=true + SuppressWarnings=false, missing required
      // params produce a server-side warning log but rendering proceeds —
      // nunjucks itself substitutes empty for undefined data, which is
      // almost always what the author meant. If real param validation is
      // needed (e.g., catching typos at template-author time), it should
      // live in the authoring tools, not in the runtime render path.
      return await this._templateEngine.RenderTemplate(template, templateContent, mergedData, true, false);
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
   * Candidates come from model selection (`allCandidates`), already filtered to the prompt's
   * model type by ID. The method calls several smaller, focused helper methods:
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
    modelEffortLevel?: number,
    credentialAvailability?: Map<string, boolean>,
    promptModelConfiguration?: AIPromptConfiguration | null
  ): Promise<ChatResult> {
    // Get failover configuration (used for errorScope filtering)
    const failoverConfig = this.getFailoverConfiguration(prompt);

    // If no candidates provided or failover disabled, execute normally with first model
    if (!allCandidates || allCandidates.length === 0 || failoverConfig.strategy === 'None') {
      return this.executeModel(
        model, renderedPrompt, prompt, params, vendorId,
        conversationMessages, templateMessageRole, cancellationToken,
        vendorDriverClass, vendorApiName, vendorSupportsEffortLevel, modelEffortLevel,
        promptModelConfiguration
      );
    }

    // Track failover attempts
    const failoverAttempts: FailoverAttempt[] = [];
    let lastError: Error | null = null;

    // Cache credential availability per driver:model:vendor for the duration of this failover
    // scan so we don't repeat env-var / binding lookups while walking the candidate list.
    //
    // PERF: seed it with the probes model SELECTION already performed (same key format). Selection
    // walks the priority list until it finds the first credentialed candidate, so this map holds
    // the prefix it rejected (known false) PLUS the selected candidate (known true) — which is
    // exactly the segment failover re-walks on the happy path. Reusing those results means the
    // common case (and any caller looping failover) does ZERO redundant hasCredentialsAvailable
    // calls. The not-evaluated tail is intentionally absent, so failover still lazily probes it
    // only if a real failure forces it to walk down there.
    const failoverCredentialCache = credentialAvailability
      ? new Map<string, boolean>(credentialAvailability)
      : new Map<string, boolean>();
    const candidateHasCredentials = (c: ModelVendorCandidate): boolean => {
      const key = `${c.driverClass}:${c.model.ID}:${c.vendorId || 'default'}`;
      let has = failoverCredentialCache.get(key);
      if (has === undefined) {
        has = this.hasCredentialsAvailable(c.driverClass, prompt.ID, c.model.ID, c.vendorId, params);
        failoverCredentialCache.set(key, has);
      }
      return has;
    };
    let skippedForCredentials = 0;

    // Iterate through all candidates in priority order with instant failover
    for (let i = 0; i < allCandidates.length; i++) {
      const candidate = allCandidates[i];
      const attemptStartTime = Date.now();

      // Skip candidates with no credentials configured. `allCandidates` is intentionally the
      // FULL priority-ordered list (see the DECISION note in selectModelWithAPIKeyTracked),
      // so it can include vendors that have no API key in this environment. Firing a live
      // request at one of those produces a misleading "401 invalid API key" — and because an
      // Authentication error is treated as fatal, it would halt failover before any
      // credentialed candidate is ever reached. Skipping here makes failover land on the
      // first candidate that can actually authenticate (mirroring model selection's own
      // highest-priority-with-credentials rule).
      if (!candidateHasCredentials(candidate)) {
        skippedForCredentials++;
        continue;
      }

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
          candidate.effortLevel,
          candidate.promptModelConfiguration
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

        // A failure that is not eligible for failover (structural error, or none diagnosed) is
        // returned as-is — but never silently: callers often see only an empty result.
        if (!result.success) {
          this.logError(
            `Model call failed and is not eligible for failover (${result.errorInfo?.errorType ?? 'undiagnosed'}): ${result.errorMessage ?? 'no error message'}`,
            { prompt, model: candidate.model, metadata: { vendorId: candidate.vendorId, driverClass: candidate.driverClass } }
          );
        }

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

    // If every candidate was skipped for missing credentials we never attempted a call and
    // have no underlying error to report — surface an actionable message instead of null.
    if (!lastError && failoverAttempts.length === 0 && skippedForCredentials > 0) {
      lastError = new Error(
        `No API credentials configured for any of the ${skippedForCredentials} candidate model-vendor combination(s) for prompt "${prompt.Name}".`
      );
    }

    return this.createFailoverErrorResult(lastError, failoverAttempts);
  }

  /**
   * Executes the AI model with the rendered prompt.
   *
   * `protected` so the parallel coordinator subclass reuses this exact code path — credential
   * resolution, driver selection, ChatParams construction, prefill, media handling, and streaming
   * all live here ONCE. Do not duplicate this logic elsewhere.
   */
  /**
   * Resolves the native tool-calling gate for THIS (model, vendor) and, when it opens, copies the
   * caller's ephemeral tool surface onto the outgoing request.
   *
   * Called per model call rather than once per run: failover can move the run to a different
   * (model, vendor) whose capability differs, and a decision made before failover would be wrong.
   *
   * @param chatParams The request being assembled (mutated in place)
   * @param prompt The prompt being run — supplies the prompt-layer configuration bag
   * @param params The caller's params — supplies the tool declarations, if any
   * @param model The selected model
   * @param vendorId The selected vendor (`MJ: AI Vendors` ID), or null
   * @param promptModelConfiguration The selected candidate's `AIPromptModel` bag, when it came from one
   */
  /**
   * Resolves the native tool-calling gate WITHOUT touching a request.
   *
   * Split out because the answer is needed twice and must be the same both times: once before the
   * template renders — the loop template drops its action catalog and the `'Actions'` step type
   * when native mode is on (plan §8.4), and it can only do that truthfully if it knows the real
   * decision rather than the caller's intent — and once when the request is assembled.
   *
   * Never throws: the gate is an opt-in enhancement and must not be able to fail a run that would
   * otherwise succeed, so any configuration problem resolves to the path that has always worked.
   */
  public ResolveNativeToolCallingDecision(
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    promptModelConfiguration?: AIPromptConfiguration | null
  ): NativeToolCallingDecision {
    try {
      return ResolveNativeToolCalling({
        catalogConfiguration: AIEngine.Instance.GetEffectiveModelConfiguration(
          model.ID,
          vendorId
            // Must be the INFERENCE PROVIDER row, not the Model Developer row: most models carry
            // two AIModelVendor rows for the same VendorID, and ModelVendors has no guaranteed
            // order. Picking the developer row merges an empty config layer and silently drops any
            // per-serving-path LLM.* knob (notably the SupportsNativeToolCalling kill switch).
            ? model.ModelVendors?.find(mv => UUIDsEqual(mv.VendorID, vendorId)
                && mv.Status === 'Active' && this.isInferenceProvider(mv))?.ID
            : undefined
        ),
        promptConfiguration: prompt.PromptConfigurationObject,
        promptModelConfiguration,
        // Action tools and control-flow tools are counted separately: under the hybrid the control
        // tools are stripped, so on their own they must not open the gate (spec §5).
        toolsProvided: (params.tools ?? []).some((t) => !(params.controlFlowToolNames ?? []).includes(t.name)),
        controlToolsProvided: (params.tools ?? []).some((t) => (params.controlFlowToolNames ?? []).includes(t.name))
      });
    } catch (error) {
      console.warn(
        `AIPromptRunner: could not resolve the native tool-calling gate for prompt "${prompt.Name}" ` +
        `on model "${model.Name}" — defaulting to the envelope path.`,
        error
      );
      return { useNativeTools: false, mode: 'Envelope', controlFlow: 'envelope', toolResults: false };
    }
  }


  /** @deprecated Use {@link ResolveNativeToolCallingDecision}. */
  public resolveNativeToolCallingDecision(
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    promptModelConfiguration?: AIPromptConfiguration | null
  ): NativeToolCallingDecision {
    return this.ResolveNativeToolCallingDecision(prompt, params, model, vendorId, promptModelConfiguration);
  }

  private applyNativeToolCalling(
    chatParams: ChatParams,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    promptModelConfiguration?: AIPromptConfiguration | null
  ): void {
    const decision: NativeToolCallingDecision =
      this.ResolveNativeToolCallingDecision(prompt, params, model, vendorId, promptModelConfiguration);

    if (decision.warning) {
      console.warn(
        `AIPromptRunner: ${decision.warning} (prompt "${prompt.Name}", model "${model.Name}"` +
        `${vendorId ? `, vendor ${vendorId}` : ''})`
      );
    }

    if (decision.useNativeTools) {
      const control = new Set(params.controlFlowToolNames ?? []);
      // Under the hybrid the control tools are stripped: that model's control flow is the envelope,
      // and offering it ask_user or a sub-agent tool would be a protocol it was never told about.
      chatParams.tools = decision.controlFlow === 'implicit'
        ? params.tools
        : params.tools?.filter((t) => !control.has(t.name));
      chatParams.toolChoice = params.toolChoice;
      chatParams.parallelToolCalls = params.parallelToolCalls;
    }

    // Recorded even on the envelope path, so a run is always attributable to a path. The whole
    // decision travels so the agent loop can read `toolResults` off the result later.
    RecordToolCallingDecision(chatParams, decision);
  }

  /**
   * Whether a failed result failed for a TOOLS-specific reason, and so is worth one retry with the
   * declarations stripped.
   *
   * Deliberately narrow. A rate limit, a context-length error or a network failure has nothing to do
   * with tools, and retrying those here would burn the fallback and mask the real cause from the
   * existing retry/failover logic — which already handles them properly.
   *
   * @param result The result of a native-mode call
   * @returns true when the failure looks tool-related
   */
  private isToolSpecificFailure(result: ChatResult): boolean {
    if (result.success) {
      return false;
    }
    // A cancellation is the caller's decision, never a tool problem.
    if (result.errorInfo?.canFailover === false && result.errorInfo?.providerErrorCode === 'request_cancelled') {
      return false;
    }
    return this.isToolSpecificFailureText(`${result.errorMessage ?? ''} ${result.statusText ?? ''}`);
  }

  /**
   * Retries a native call once on today's exact path, with the tool declarations stripped.
   *
   * The retry reuses the SAME execution bound rather than opening a fresh one, so the two attempts
   * share one timeout budget. That is deliberate: the bound exists to cap how long a single model
   * call may take from the caller's point of view, and a fallback is still that one call. It does
   * mean a native attempt that burned most of the budget leaves the retry little — but the
   * alternative, silently doubling the caller's timeout, is worse.
   *
   * @param reason What the provider said, for the warning — a misconfiguration should be visible
   */
  private async retryWithToolsStripped(
    llm: BaseLLM,
    chatParams: ChatParams,
    executionBound: ExecutionBound,
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    prompt: MJAIPromptEntityExtended,
    reason: string
  ): Promise<ChatResult> {
    console.warn(
      `AIPromptRunner: native tool calling failed on ${model.Name}${vendorId ? ` (vendor ${vendorId})` : ''} ` +
      `for prompt "${prompt.Name}" — retrying once on the envelope path with tools stripped. ` +
      `Provider error: ${reason}`
    );
    chatParams.tools = undefined;
    chatParams.toolChoice = undefined;
    chatParams.parallelToolCalls = undefined;
    // A history that already holds native turns — the assistant's call turn, the tool-result turn —
    // is refused once the declarations are gone (Gemini also polices their order), so the retry
    // would fail for a second, different reason and the loop would burn its remaining attempts on
    // the same request. Show the retry what the envelope path has always
    // shown: the calls' prose, and each result as an "[Action Result]" user message.
    chatParams.messages = EncodeToolTurnsAsText(chatParams.messages);
    const fallbackResult = await this.runChatCompletionBounded(llm, chatParams, executionBound);
    RecordToolCallingMode(fallbackResult, 'NativeFallback');
    return fallbackResult;
  }

  /** Scans provider prose for a tools marker. Shared by the thrown-error and failed-result paths. */
  private isToolSpecificFailureText(text: string): boolean {
    const lowered = text.toLowerCase();
    return AIPromptRunner.TOOL_FAILURE_MARKERS.some(marker => lowered.includes(marker));
  }

  protected async executeModel(
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
    modelEffortLevel?: number,
    promptModelConfiguration?: AIPromptConfiguration | null
  ): Promise<ChatResult> {
    // define these variables here to ensure they're available in the catch block
    let driverClass: string;
    let apiName: string | undefined;
    let llm: BaseLLM;
    let chatParams: ChatParams;

    // Compose the caller's cancellation token (if any) with the resolved model-call timeout (if any)
    // into a SINGLE signal that bounds this model call. Both bounds always apply — whichever fires
    // first aborts the call. This is the ONE place the timeout is enforced, so the single-model path
    // and the parallel path (which delegates here) can never diverge.
    const executionBound = this.createExecutionBound(prompt, params, cancellationToken);

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
          const modelVendor = model.ModelVendors.find(
            (mv) => UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active' && this.isInferenceProvider(mv)
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
      // Hand the driver the COMPOSED signal (caller token ∪ prompt timeout), not the raw caller
      // token, so any driver that learns to honor ChatParams.cancellationToken aborts the HTTP
      // request on timeout too — not just on caller cancellation.
      chatParams.cancellationToken = executionBound.Signal;

      // Apply scalar inference params (prompt defaults overridden by additionalParameters) via the
      // shared resolver so ChatParams and the persisted AIPromptRun never drift.
      const resolvedParams = this.resolveScalarInferenceParams(prompt, params.additionalParameters);
      if (resolvedParams.temperature !== undefined) chatParams.temperature = resolvedParams.temperature;
      if (resolvedParams.topP !== undefined) chatParams.topP = resolvedParams.topP;
      if (resolvedParams.topK !== undefined) chatParams.topK = resolvedParams.topK;
      if (resolvedParams.minP !== undefined) chatParams.minP = resolvedParams.minP;
      if (resolvedParams.frequencyPenalty !== undefined) chatParams.frequencyPenalty = resolvedParams.frequencyPenalty;
      if (resolvedParams.presencePenalty !== undefined) chatParams.presencePenalty = resolvedParams.presencePenalty;
      if (resolvedParams.seed !== undefined) chatParams.seed = resolvedParams.seed;
      if (resolvedParams.includeLogProbs !== undefined) chatParams.includeLogProbs = resolvedParams.includeLogProbs;
      if (resolvedParams.topLogProbs !== undefined) chatParams.topLogProbs = resolvedParams.topLogProbs;

      // Stop sequences are handled separately: the prompt value is comma-delimited and gated by
      // driver support; additionalParameters supplies a ready-made array that overrides it.
      if (prompt.StopSequences && this.shouldApplyStopSequences(prompt, model, vendorId, llm)) {
        chatParams.stopSequences = prompt.StopSequences.split(',').map((s: string) => s.replace(AIPromptRunner.STOP_SEQUENCE_TRIM_REGEX, '')).filter((s: string) => s.length > 0);
      }
      if (params.additionalParameters?.stopSequences !== undefined) {
        chatParams.stopSequences = params.additionalParameters.stopSequences;
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

      // Apply response format. A scope-level override (additionalParameters.responseFormat, populated
      // by ApplyScopedPromptConfig from a ScopedPromptConfig row) takes precedence over the prompt
      // default; 'Any' from either source stays silent so providers use their own default.
      const effectiveResponseFormat = this.resolveEffectiveResponseFormat(prompt.ResponseFormat, params.additionalParameters);
      if (effectiveResponseFormat) {
        chatParams.responseFormat = effectiveResponseFormat as typeof prompt.ResponseFormat;

        if (prompt.ModelSpecificResponseFormat) {
          try {
            chatParams.modelSpecificResponseFormat = JSON.parse(prompt.ModelSpecificResponseFormat);
          } catch (e) {
            console.warn(`AIPromptRunner: failed to parse ModelSpecificResponseFormat on prompt ${prompt.Name}; ignoring`, e);
          }
        }
      } else {
        // if response format is not set or set to Any (prompt or override), stay silent
        chatParams.responseFormat = undefined;
      }

      // Native tool calling (Layer 3). This is the ONLY place metadata decides whether tools go out.
      // Resolved HERE rather than once per run because failover may land on a different
      // (model, vendor) that does not support tools.
      this.applyNativeToolCalling(chatParams, prompt, params, model, vendorId, promptModelConfiguration);

      // Build message array with rendered prompt and conversation messages
      chatParams.messages = this.buildMessageArray(renderedPrompt, conversationMessages, templateMessageRole);

      // Declarations and tool turns must travel TOGETHER. The gate above is re-resolved per
      // failover attempt, so an attempt can legitimately come back envelope on a history that
      // earlier turns filled with assistant `toolCalls` and `tool` turns — a candidate whose vendor
      // row lacks the capability, or a catalog change mid-run. Sending those with no `tools` array
      // is rejected outright by Anthropic and OpenAI (Gemini also polices their order), which would
      // make failover — the mechanism meant to rescue a failing run — fail for a second, unrelated
      // reason. Degrade the turns to text, exactly as the tools-stripped retry does.
      if (!chatParams.tools?.length) {
        chatParams.messages = EncodeToolTurnsAsText(chatParams.messages);
      }

      // Resolve native file inputs: check each file against the driver's capabilities
      // and inject qualifying files as content blocks in the last user message.
      this.injectNativeFileInputs(params, llm, chatParams, verbose);

      // Strip media content blocks (image_url / audio_url / video_url / file_url)
      // that the selected driver doesn't support — the conversation builder
      // doesn't know which model the prompt will pick, so unsupported blocks
      // are turned into visible text markers so the agent knows the file is
      // attached but can't process it with the current model. See
      // plans/artifact-attachment-unification.md §4 (modality enforcement).
      this.stripUnsupportedMediaBlocks(llm, chatParams, model, verbose, params);

      // Apply assistant prefill (native or fallback) based on prompt config and provider support
      this.applyAssistantPrefill(chatParams, prompt, model, vendorId, llm);

      // Streaming: wire the prompt-level onStreaming callback into the LLM call. This is the SINGLE
      // place streaming is configured for prompt execution, so the single-model path and the parallel
      // path (which bridges its per-task callbacks into params.onStreaming) stream through identical
      // code — no second streaming implementation that can drift.
      if (params.onStreaming) {
        const onStreaming = params.onStreaming;
        chatParams.streaming = true;
        chatParams.streamingCallbacks = {
          OnContent: (chunk: string, isComplete: boolean) =>
            onStreaming({ content: chunk, isComplete, modelName: model.Name }),
        };
      }

      // Execute the model bounded by the composed abort signal (caller cancellation + prompt TimeoutMS)
      //
      // Layer 4 fallback, part one: some providers REJECT a tools payload instead of returning a
      // failed result. The OpenAI SDK raises a 400 as an exception, so the returned-result check
      // below never sees it and a native run that should degrade hard-fails instead. Observed on
      // gpt-5.6-luna: `400 Function tools with reasoning_effort are not supported
      // for gpt-5.6-luna in /v1/chat/completions`. Both shapes get the same one-shot retry.
      let chatResult: ChatResult;
      try {
        chatResult = await this.runChatCompletionBounded(llm, chatParams, executionBound);
      } catch (error) {
        if (!chatParams.tools?.length || !this.isToolSpecificFailureText(error instanceof Error ? error.message : String(error ?? ''))) {
          throw error;
        }
        return await this.retryWithToolsStripped(
          llm, chatParams, executionBound, model, vendorId, prompt,
          error instanceof Error ? error.message : String(error));
      }
      // Carry the gate's WHOLE decision from the request onto the result, which is what flows back up
      // to the prompt run (mode) and to the agent loop (`toolResults` — the loop answers native
      // calls as tool turns only when the result says so). Copying the mode alone resets `toolResults`
      // to false on the fresh result object, which leaves native tool results inert.
      // A fallback below overwrites the mode with 'NativeFallback'.
      const gatedDecision = GetToolCallingDecision(chatParams);
      if (gatedDecision) {
        RecordToolCallingDecision(chatResult, gatedDecision);
      }

      // Layer 4 fallback, part two: a native-mode call that came back as a failed result for a
      // TOOLS-specific reason retries the same way. Non-tool failures fall through to the existing
      // retry/failover machinery untouched.
      if (chatParams.tools?.length && this.isToolSpecificFailure(chatResult)) {
        return await this.retryWithToolsStripped(
          llm, chatParams, executionBound, model, vendorId, prompt,
          chatResult.errorMessage || chatResult.statusText || 'unspecified');
      }

      return chatResult;
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
    } finally {
      // Always release the timeout timer + abort listener, whether the call succeeded, failed,
      // timed out, or was cancelled. Without this a long-lived process would accumulate timers.
      executionBound.Dispose();
    }
  }


  /**
   * Runs the model call, racing it against the composed execution bound so a hung provider surfaces
   * as a rejected promise the caller's failover/retry logic can act on.
   *
   * A timeout rejects with a typed {@link AIPromptTimeoutError} (classified by ErrorAnalyzer as a
   * retriable NetworkError); a caller cancellation rejects with the same
   * `'Chat completion was cancelled'` error the previous implementation produced, so cancellation
   * semantics are unchanged.
   *
   * NOTE: `Promise.race` ignores the losing `ChatCompletion()` promise's eventual result, but the
   * underlying request IS torn down — the composed signal is on `ChatParams.cancellationToken`, and
   * all 19 drivers now forward it to their SDK/HTTP layer, so aborting the signal (which is exactly
   * what makes the model call lose the race on a timeout or cancellation) aborts the socket rather
   * than leaving it open until the provider closes it.
   */
  private async runChatCompletionBounded(llm: BaseLLM, chatParams: ChatParams, bound: ExecutionBound): Promise<ChatResult> {
    const signal = bound.Signal;
    if (!signal) {
      // Neither a caller token nor a prompt timeout — execute unbounded (legacy behavior).
      return await llm.ChatCompletion(chatParams);
    }

    return await Promise.race([
      llm.ChatCompletion(chatParams),
      new Promise<never>((_, reject) => {
        const fail = () => reject(this.buildAbortError(signal, bound));
        if (signal.aborted) {
          fail();
        } else {
          signal.addEventListener('abort', fail, { once: true });
        }
      }),
    ]);
  }

  /**
   * Builds the rejection error for an aborted model call — a typed {@link AIPromptTimeoutError} when
   * the prompt's TimeoutMS fired, otherwise the legacy cancellation error.
   */
  private buildAbortError(signal: AbortSignal, bound: ExecutionBound): Error {
    if (bound.TimedOut()) {
      const reason = signal.reason;
      return reason instanceof AIPromptTimeoutError ? reason : new Error('Chat completion timed out');
    }
    return new Error('Chat completion was cancelled');
  }

  /**
   * Walks every message in chatParams and rewrites media content blocks
   * (image_url / audio_url / video_url / file_url) into visible text markers
   * when the selected driver doesn't support that MIME modality. Keeps text
   * blocks intact. The replacement message tells the agent the file exists
   * and the model can't view it — much better UX than silent failure (model
   * receives image_url, ignores it, and the agent asks the user to "upload
   * the image" the user already uploaded).
   *
   * No-op when the driver's GetFileCapabilities() returns non-null AND the
   * block's MIME matches the supported list. The driver baseclass returns
   * null by default; only providers that declare vision/file support override
   * it (currently: OpenAI). For everyone else, every media block falls back
   * to text — exactly what you want when running a text-only model.
   */
  private stripUnsupportedMediaBlocks(
    llm: BaseLLM,
    chatParams: ChatParams,
    model: { Name?: string } | null | undefined,
    verbose: boolean,
    params: AIPromptParams,
  ): void {
    const caps = llm.GetFileCapabilities();
    const modelName = model?.Name ?? '<unknown model>';
    let stripped = 0;

    for (const msg of chatParams.messages) {
      // Path 1: replace unsupported media content BLOCKS in array-content messages.
      if (Array.isArray(msg.content)) {
        msg.content = msg.content.map((block) => {
          const blockType = (block as { type?: string }).type;
          if (blockType !== 'image_url' && blockType !== 'audio_url' && blockType !== 'video_url' && blockType !== 'file_url') {
            return block;
          }
          const blockMime = (block as { mimeType?: string }).mimeType ?? mimeFromBlockType(blockType);
          if (this.driverSupportsModality(caps, blockMime)) {
            return block;
          }
          const fileName = (block as { fileName?: string }).fileName ?? '(unnamed file)';
          stripped++;
          return {
            type: 'text' as const,
            content:
              `[Attachment "${fileName}" (${blockMime}) was provided, but the active model "${modelName}" does not support this modality. ` +
              `Tell the user the active model cannot process ${blockMime.split('/')[0]} content rather than guessing what the file contains.]`,
          };
        });
        continue;
      }

      // Path 2: artifacts that went through the tool-dispatch path appear in
      // the artifact manifest section of the rendered system prompt. The model
      // gets the manifest as text and decides whether to call get_full — and
      // for a non-vision model receiving an image manifest entry, get_full
      // returns base64 it can't interpret, so it pattern-matches few-shot
      // examples and pretends. Annotate the manifest inline so the model
      // knows it can't actually view the artifact.
      if (typeof msg.content === 'string' && msg.role === ChatMessageRole.system) {
        const before = msg.content;
        msg.content = this.annotateManifestForUnsupportedMedia(before, caps, modelName);
        if (msg.content !== before) stripped++;
      }
    }

    if (stripped > 0) {
      this.logStatus(
        `[ModalityCheck] Annotated ${stripped} unsupported media artifact reference(s) for model "${modelName}". Driver capabilities: ${caps ? caps.SupportedMimeTypes.join(', ') : 'none (driver declares no file support)'}.`,
        verbose,
        params,
      );
    }
  }

  /**
   * Walks the rendered system-prompt text for the `## Available Artifacts`
   * section emitted by ArtifactToolManager.ToManifestString(). For each
   * artifact entry whose MIME hint indicates a media type the driver cannot
   * process, appends a one-line warning so the model doesn't pretend to view
   * an artifact it can only see as base64.
   */
  private annotateManifestForUnsupportedMedia(
    systemText: string,
    caps: import('@memberjunction/ai').FileCapabilities | null,
    modelName: string,
  ): string {
    if (!systemText.includes('## Available Artifacts')) return systemText;

    const lines = systemText.split('\n');
    const result: string[] = [];
    let inManifest = false;
    let mutated = false;
    const entryRegex = /^\*\*[A-Z]+\*\* — .+? \[(?<mime>[^\]]+)\]/;

    for (const line of lines) {
      if (line.startsWith('## Available Artifacts')) {
        inManifest = true;
        result.push(line);
        continue;
      }
      if (inManifest && /^## /.test(line)) {
        inManifest = false;
      }
      result.push(line);

      if (!inManifest) continue;
      const match = entryRegex.exec(line);
      if (!match) continue;
      const mime = (match.groups?.mime ?? '').toLowerCase();
      const modality = mime.split('/')[0];
      if (modality !== 'image' && modality !== 'audio' && modality !== 'video') continue;
      if (this.driverSupportsModality(caps, mime)) continue;

      result.push(
        `    > ⚠ The active model "${modelName}" cannot process ${modality} content (${mime}). ` +
          `Calling get_full returns base64 you cannot interpret visually — tell the user the model does not support ${modality} input rather than guessing what this file contains.`,
      );
      mutated = true;
    }

    return mutated ? result.join('\n') : systemText;
  }

  /**
   * Returns true when the driver explicitly declares support for this MIME
   * (exact or subtype-wildcard match). Returns false when capabilities are
   * null (driver supports no files) or the MIME isn't on the supported list.
   */
  private driverSupportsModality(caps: import('@memberjunction/ai').FileCapabilities | null, mimeType: string): boolean {
    if (!caps) return false;
    const lower = mimeType.toLowerCase();
    return caps.SupportedMimeTypes.some((pattern) => {
      const p = pattern.toLowerCase();
      // Wildcard on EITHER side must match (the requested mime is often a modality
      // probe like 'image/*' — e.g. an image_url block with no explicit mimeType —
      // and must match a driver that declares any concrete 'image/<x>' type).
      if (p.endsWith('/*')) return lower.startsWith(p.slice(0, -1));
      if (lower.endsWith('/*')) return p.startsWith(lower.slice(0, -1));
      return lower === p;
    });
  }

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
   * Substrings that mark a provider failure as TOOLS-specific, so the native call is worth one
   * envelope retry (see {@link AIPromptRunner.isToolSpecificFailure}). Drawn from how the
   * tool-capable providers word a rejected `tools` payload, an unusable tool call, or a turn whose output
   * they discarded for a tool-related reason.
   *
   * Substring matching over provider prose is inherently approximate. It is deliberately biased
   * toward MISSING a tool failure rather than catching an unrelated one: a missed match just means
   * the existing retry/failover logic handles the error as it does today, whereas a false positive
   * would silently strip tools from a run that should have kept them.
   */
  private static readonly TOOL_FAILURE_MARKERS: readonly string[] = [
    'tool_use',
    'tool use',
    'tool_call',
    'tool call',
    'tool_choice',
    'tool choice',
    'tools',
    'function_call',
    'function call',
    'function_declaration',
    'functiondeclarations',
    'malformed_function_call',
    'input_schema',
    'parametersjsonschema'
  ];

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
  /**
   * Resolves the effective response format for a run. A scope-level override — `additionalParameters.
   * responseFormat`, set by `ApplyScopedPromptConfig` from a `ScopedPromptConfig` row — takes precedence
   * over the prompt's own `ResponseFormat`. `'Any'` (or absent) from either source resolves to
   * `undefined`, i.e. stay silent so the provider uses its own default.
   */
  private resolveEffectiveResponseFormat(
    promptResponseFormat: string | null | undefined,
    additionalParameters: Record<string, unknown> | undefined,
  ): string | undefined {
    const override = additionalParameters?.responseFormat as string | undefined;
    const effective = override ?? promptResponseFormat ?? undefined;
    return effective && effective !== 'Any' ? effective : undefined;
  }

  /**
   * Decides whether a prompt's StopSequences should be sent to the model.
   *
   * StopSequences are commonly paired with AssistantPrefill to fence JSON output:
   * prefill the assistant turn with "```json" and stop on the closing "\n```".
   * That pairing is ONLY safe when native prefill is applied — prefill guarantees the
   * response BEGINS at the fence, so the only "\n```" in the output is the closing one.
   *
   * Without native prefill, a model that adds any preamble before the fence
   * (e.g. Gemini emitting `Here is the JSON requested:\n```json\n{...}`) manufactures a
   * "\n```" at the OPENING fence, so the stop fires immediately and truncates the response
   * to just the preamble (an empty/invalid result). To avoid that, when a prompt uses
   * AssistantPrefill but the resolved model/vendor does NOT support native prefill, we skip
   * the stop sequences entirely and let the full response through — downstream JSON
   * extraction strips the fence/preamble.
   *
   * Prompts that declare StopSequences WITHOUT AssistantPrefill are treated as independent
   * (not part of the prefill/fence optimization) and are always applied.
   */
  private shouldApplyStopSequences(
    prompt: MJAIPromptEntityExtended,
    model: MJAIModelEntityExtended,
    vendorId: string | null,
    llm: BaseLLM
  ): boolean {
    // Not part of the prefill/fence optimization → always honor.
    if (!prompt.AssistantPrefill) {
      return true;
    }
    // Prefill-paired → only safe to apply when native prefill is actually supported.
    return this.resolveSupportsPrefill(model, vendorId, llm);
  }

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
      const modelVendor = model.ModelVendors.find(
        mv => UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active'
      );
      if (modelVendor?.SupportsPrefill != null) {
        supportsPrefill = modelVendor.SupportsPrefill;
      }
    }

    return supportsPrefill;
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
      // Function replacement — prefill text routinely contains `$` (LaTeX `$$`,
      // currency, JSON). See issue #3171.
      const fallbackInstruction = fallbackTemplate.replace(/\{\{prefill\}\}/g, () => prefillText);

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
    allCandidates: ModelVendorCandidate[],
    vendorDriverClass?: string,
    vendorApiName?: string,
    vendorSupportsEffortLevel?: boolean,
    modelEffortLevel?: number,
    credentialAvailability?: Map<string, boolean>,
    promptModelConfiguration?: AIPromptConfiguration | null
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
          modelEffortLevel,
          credentialAvailability, // Reuse credential probes from selection
          promptModelConfiguration
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
        const effectiveValidationBehavior = params?.validationBehavior || prompt.ValidationBehavior;
        if (effectiveValidationBehavior === 'Strict' && attempt < maxRetries) {
          lastError = new Error(`Validation failed: ${validationErrors?.map(e => e.Message).join('; ')}`);
          LogStatus(`   ⚠️ Validation failed on attempt ${attempt + 1}, will retry (Strict mode)`);
          continue; // Retry
        } else {
          // Either not strict mode or no more retries, return what we have
          const reason = effectiveValidationBehavior !== 'Strict' 
            ? `${effectiveValidationBehavior || 'None'} mode - continuing with invalid output (no retry)`
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
  /**
   * Whether `text` parses as JSON once CleanJSON has stripped fences and prose around it — the test
   * for "is this an envelope or plain prose?" under implicit control flow. Never throws.
   */
  private parsesAsJSON(text: string): boolean {
    try {
      JSON.parse(CleanJSON(text) ?? text);
      return true;
    } catch {
      return false;
    }
  }

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
        // A native tool call IS the model's answer. Providers return `content: null` on a turn
        // that is nothing but calls, so reading emptiness as "no output" turns the designed
        // native response into a validation failure — a warning on every native turn under
        // `ValidationBehavior: 'Warn'`, and under `'Strict'` a retry that cannot ever succeed,
        // because retrying asks the same question of a model that already answered it correctly.
        //
        // There is also nothing here to parse: `OutputType` describes the shape of TEXT output,
        // and tool-call arguments arrive already structured and already schema-checked by the
        // provider. The callers that care read them off `chatResult` directly — the agent loop
        // via `LoopAgentType`, the eval harness via its own turn extractor.
        if ((modelResult.data?.choices?.[0]?.message?.toolCalls?.length ?? 0) > 0) {
          return { result: null };
        }
        throw new Error('No output received from model');
      }

      // Implicit control flow: "reply in plain text when the task is complete" — prose IS the
      // designed terminal form, so on a prompt whose OutputType is 'object' a reply that is not JSON is
      // the answer, not a malformed envelope. Validating it as JSON marks every such prompt run
      // Failed and spends a "Repair JSON" model call trying to fix prose.
      // A reply that does parse as JSON — an honoured envelope — takes the normal path.
      if (prompt.OutputType === 'object' && GetToolCallingDecision(modelResult)?.controlFlow === 'implicit' && !this.parsesAsJSON(rawOutput)) {
        const accepted = new ValidationResult();
        accepted.Success = true;
        return { result: rawOutput, validationResult: accepted };
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

      const effectiveValidationBehavior = params?.validationBehavior || prompt.ValidationBehavior;
      switch (effectiveValidationBehavior) {
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
   * Resolves the parse error that actually describes the model's output.
   *
   * The error reaching the repair path comes from `JSON.parse(CleanJSON(rawOutput))`, so it may
   * describe one of CleanJSON's intermediate transforms rather than the response itself. That
   * distinction is not cosmetic: a repair pass needs the failure offset in the *original* bytes,
   * and the AI repair prompt is actively misled by an error describing text it was never shown.
   *
   * Observed in production: an unescaped quote at offset 23011 was reported as
   * `Unexpected token 'm', "mermaid\ns"...` because CleanJSON had extracted a mermaid fence out of
   * a string value before failing. Every downstream consumer — the repair model, the validation
   * record, the logs — inherited that misdiagnosis.
   *
   * @param rawOutput - The model's unmodified output
   * @param originalError - The error caught upstream, used as a fallback
   * @returns The message that best describes what is wrong with `rawOutput`
   */
  private resolveTrueParseError(rawOutput: string, originalError: Error): string {
    try {
      JSON.parse(rawOutput);
    } catch (directError: unknown) {
      return directError instanceof Error ? directError.message : String(directError);
    }
    // rawOutput parses cleanly, so the failure came from a later stage; the caller's error stands.
    return originalError.message;
  }

  /**
   * Attempts to repair malformed JSON using a multi-step process: JSON5, then deterministic
   * lexical repair, then an AI repair prompt.
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
        this.logError(cleanError, {
          category: 'JSONCleaningFailed',
          metadata: {
            originalError: originalError.message,
            rawOutput: rawOutput.substring(0, 500)
          },
          maxErrorLength: params.maxErrorLength
        });
      }
      const json5Result = JSON5.parse(jsonToParse);
      this.logStatus('   ✅ JSON5 successfully parsed the malformed JSON', true, params);
      currentPromptRun._jsonRepairInfo = {
        repaired: true,
        method: 'JSON5',
        originalError: originalError.message,
        rawOutputPrefix: rawOutput.substring(0, 200)
      };
      return json5Result;
    } catch (json5Error) {
      // The error handed to us may describe a CleanJSON transform rather than the model's actual
      // output — CleanJSON rewrites the text through several passes before failing, and the error
      // that escapes describes whatever it was holding at the end. Repairing, and telling a model
      // what to repair, both require the real syntax error against the real bytes.
      const trueError = this.resolveTrueParseError(rawOutput, originalError);

      // Step 2: Deterministic lexical repair. The dominant failure by far is an unescaped quote or
      // raw control character inside a string value — models embed mermaid diagrams, HTML mockups
      // and code samples in markdown fields and miss an escape. JSON5 cannot help (an unescaped
      // quote closes a string in JSON5 too), but the defect is mechanical, so fixing it needs no
      // model call. Runs before the AI stage: it is microseconds against an LLM round-trip on a
      // payload that may be tens of KB, and it cannot invent content the way a model can.
      const lexicalRepair = RepairJSONEscaping(rawOutput);
      if (lexicalRepair.repaired) {
        this.logStatus(
          `   ✅ Lexical repair fixed ${lexicalRepair.repairedOffsets.length} unescaped character(s)`,
          true,
          params
        );
        currentPromptRun._jsonRepairInfo = {
          repaired: true,
          method: 'LexicalEscaping',
          originalError: trueError,
          rawOutputPrefix: rawOutput.substring(0, 200),
          repairedOffsets: lexicalRepair.repairedOffsets
        };
        return lexicalRepair.value;
      }

      // Step 3: Use AI to repair the JSON
      this.logStatus('   🤖 JSON5 and lexical repair failed, attempting AI-based JSON repair...', true, params);

      try {
        // Find the "Repair JSON" prompt in the "MJ: System" category
        const repairPrompt = AIEngine.Instance.Prompts.find(p => p.Name.trim().toLowerCase() === 'repair json' && p.Category.trim().toLowerCase() === 'mj: system');
        if (!repairPrompt) {
          throw new Error('Repair JSON prompt not found in MJ: System category');
        }
        
        // Run the repair prompt
        const repairResult = await this.ExecutePrompt({
          parentPromptRunId: currentPromptRun.ID,
          contextUser: params.contextUser,
          prompt: repairPrompt,
          data: {
            ERROR_MESSAGE: trueError,
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
        currentPromptRun._jsonRepairInfo = {
          repaired: true,
          method: 'AIRepair',
          originalError: trueError,
          rawOutputPrefix: rawOutput.substring(0, 200),
          repairPromptRunId: repairResult.promptRun?.ID
        };
        return repairedJSON;
      } catch (aiRepairError) {
        // Both repair attempts failed — always log, this is unexpected LLM behavior
        this.logError(aiRepairError, {
          category: 'JSONRepairFailed',
          metadata: {
            originalError: trueError,
            json5Error: json5Error.message,
            lexicalRepairReason: lexicalRepair.reason,
            aiError: aiRepairError.message,
            rawOutput: rawOutput.substring(0, 500)
          },
          maxErrorLength: params.maxErrorLength
        });
        
        throw new Error(`JSON repair failed after JSON5, lexical and AI attempts: ${trueError}`);
      }
    }
  }


  /**
   * Returns the parsed form of a prompt's `OutputExample` JSON, memoized by content.
   * Parsing happens at most once per distinct example string for the life of the process;
   * parse failures are cached too (so malformed examples aren't re-parsed every attempt).
   */
  private getParsedOutputExample(outputExample: string): { parsed?: unknown; error?: string } {
    const cached = AIPromptRunner._outputExampleCache.get(outputExample);
    if (cached) {
      return cached;
    }
    let entry: { parsed?: unknown; error?: string };
    try {
      entry = { parsed: JSON.parse(outputExample) };
    } catch (parseError) {
      entry = { error: parseError instanceof Error ? parseError.message : String(parseError) };
    }
    AIPromptRunner._outputExampleCache.set(outputExample, entry);
    return entry;
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
      // Parse the output example (cached by content — it's a static string reused across runs/retries)
      const { parsed: exampleObject, error: exampleParseError } = this.getParsedOutputExample(outputExample);
      if (exampleParseError) {
        const error = new ValidationErrorInfo('outputExample', `Invalid OutputExample JSON: ${exampleParseError}`, outputExample, ValidationErrorType.Failure);
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


}

