/**
 * @fileoverview Abstract base runner for MemberJunction AI model executions.
 *
 * Encapsulates modality-agnostic machinery:
 * - Candidate building and selection
 * - Credential resolution and failover
 * - Execution bounds and timeout management
 * - AIPromptRun entity lifecycle tracking and persistence
 * - Retry and failover helpers
 *
 * @module @memberjunction/ai-prompts
 * @author MemberJunction.com
 */

import {
  BaseEntitySaveQueue,
  LogErrorEx,
  LogStatus,
  LogStatusEx,
  IsVerboseLoggingEnabled,
  Metadata,
  UserInfo,
  IMetadataProvider
} from '@memberjunction/core';
import {
  UUIDsEqual,
  NormalizeUUID
} from '@memberjunction/global';
import {
  MJAIPromptModelEntity,
  MJAIModelVendorEntity,
  MJAIConfigurationEntity,
  MJAIVendorEntity,
  MJAICredentialBindingEntity,
  MJCredentialEntity
} from '@memberjunction/core-entities';
import {
  MJAIModelEntityExtended,
  MJAIPromptEntityExtended,
  MJAIPromptRunEntityExtended,
  AIPromptParams,
  AIModelSelectionInfo
} from '@memberjunction/ai-core-plus';
import {
  ChatResult,
  ErrorAnalyzer,
  AIErrorInfo,
  GetAIAPIKey,
  AIPromptConfiguration
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { CredentialEngine } from '@memberjunction/credentials';
import { AIPromptTimeoutError } from './AIPromptTimeoutError';

/**
 * The composed bound applied to a single model call: the caller's cancellation token (if any) merged
 * with the prompt's configured `AIPrompt.TimeoutMS` (if any).
 *
 * Produced by `AIPromptRunner.createExecutionBound` and consumed by the bounded ChatCompletion race.
 * `Dispose()` MUST be called when the call settles so the timeout timer and abort listener are
 * released.
 */
export interface ExecutionBound {
    /** Merged abort signal; `undefined` when there is neither a caller token nor a prompt timeout. */
    Signal?: AbortSignal;
    /** The prompt-configured timeout in ms, when one applies. */
    TimeoutMS?: number;
    /** True once the TIMEOUT (not the caller's token) fired — used to build the right error. */
    TimedOut: () => boolean;
    /** Releases the timer and the caller-token listener. Safe to call multiple times. */
    Dispose: () => void;
}

/**
 * Represents a model-vendor pair candidate for execution
 */
export interface ModelVendorCandidate {
  model: MJAIModelEntityExtended;
  vendorId?: string;
  vendorName?: string;
  driverClass: string;
  apiName?: string;
  supportsEffortLevel?: boolean;
  effortLevel?: number;
  /**
   * The `PromptConfiguration` bag of the `AIPromptModel` row this candidate came from, when it came
   * from one. Threaded like `effortLevel` rather than looked up later, because a candidate sourced
   * from power-rank or model-type has NO prompt-model row and must contribute no override.
   */
  promptModelConfiguration?: AIPromptConfiguration | null;
  isPreferredVendor: boolean;
  priority: number; // Higher is better
  source: 'explicit' | 'prompt-model' | 'model-type' | 'power-rank' | 'power-match-fallback';
}

/**
 * Configuration for failover behavior when primary model fails.
 *
 * Exported because it is the return type of `AIPromptRunner.getFailoverConfiguration`, a
 * `protected` method documented as an override point — a subclass cannot name its own return type
 * otherwise, which made the documented extension point unusable from outside this package.
 */
export interface FailoverConfiguration {
  strategy: 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank' | 'None';
  maxAttempts: number;
  delaySeconds: number;
  modelStrategy?: 'PreferSameModel' | 'PreferDifferentModel' | 'RequireSameModel';
  errorScope?: 'All' | 'NetworkOnly' | 'RateLimitOnly' | 'ServiceErrorOnly';
}

/**
 * Tracks information about a failover attempt
 */
export interface FailoverAttempt {
  attemptNumber: number;
  modelId: string;
  vendorId?: string;
  error: Error;
  errorType: string;
  duration: number;
  timestamp: Date;
}



/**
 * Shared machinery for runners that invoke a model and record the call as an `MJ: AI Prompt Runs`
 * row: candidate model/vendor selection, credential resolution, execution bounds (timeout and
 * cancellation), failover helpers, and the prompt-run save queue.
 *
 * `AIPromptRunner`, the chat runner, is built on it. Subclasses declare the model type they run
 * through {@link BaseModelRunner.RequiredModelType}.
 */
export abstract class BaseModelRunner {
  /**
   * The model type this runner requires. A hard floor — AIPrompt.AIModelTypeID may narrow it
   * or must match, and may never widen it. Declared here but not yet enforced: candidate
   * selection does not read it.
   */
  public abstract get RequiredModelType(): string;

  protected _provider: IMetadataProvider | null = null;
  protected _metadata: Metadata;

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
   * Checks if a model vendor is configured as an inference provider.
   * Delegates to the memoized {@link AIEngine.IsInferenceProvider} helper so the
   * "Inference Provider" vendor-type lookup happens once per engine load rather than on
   * every candidate in every selection pass.
   * @param modelVendor The model vendor to check
   * @returns true if the vendor is an inference provider
   */
  protected isInferenceProvider(modelVendor: MJAIModelVendorEntity): boolean {
    return AIEngine.Instance.IsInferenceProvider(modelVendor);
  }

  /**
   * Fire-and-forget AIPromptRun persistence. Prompt-run logging never blocks the execution path on a
   * DB round-trip; the shared {@link BaseEntitySaveQueue} sequences saves for the SAME entity (the
   * initial 'Running' INSERT always completes before the finalize UPDATE, and the finalize mutation
   * runs INSIDE the post-INSERT task so a slow INSERT can never clobber the finalized row). Failures
   * stay in this runner's structured log stream via the queue's `onError` hook.
   */
  protected _promptRunQueue = new BaseEntitySaveQueue({
    onError: (message) => this.logError(message, { category: 'PromptRunSave' }),
  });

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
  protected async resolveCredentialForExecution(
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
      const modelVendor = AIEngine.Instance.ModelVendorsByModelID.get(NormalizeUUID(modelId))
        ?.find(mv => UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active');
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
      const vendor = AIEngine.Instance.VendorsByID.get(NormalizeUUID(vendorId));
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
  protected hasCredentialsAvailable(
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
      const modelVendor = AIEngine.Instance.ModelVendorsByModelID.get(NormalizeUUID(modelId))
        ?.find(mv => UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active');
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
      const vendor = AIEngine.Instance.VendorsByID.get(NormalizeUUID(vendorId));
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
  protected buildModelVendorCandidates(
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
    const model = AIEngine.Instance.ModelsByID.get(NormalizeUUID(explicitModelId));
    if (!model || !model.IsActive) {
      return [];
    }

    // Check model type compatibility
    if (prompt.AIModelTypeID && !UUIDsEqual(model.AIModelTypeID, prompt.AIModelTypeID)) {
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

    // If RequireSpecificModels is true (or no candidates at all), enforce strict behavior
    if (candidates.length === 0 && prompt.RequireSpecificModels) {
      const configInfo = configurationId ? ` with configuration "${configurationId}"` : '';
      throw new Error(
        `SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found for prompt "${prompt.Name}"${configInfo}. ` +
        `Please configure AIPromptModel records for this prompt.`
      );
    }

    // When RequireSpecificModels is false, append power-matched fallback candidates
    // so that if none of the specific models have valid credentials, the system
    // gracefully falls back to other available models at a similar power level.
    if (!prompt.RequireSpecificModels) {
      this.appendPowerMatchedFallbackCandidates(candidates, prompt, sortedPromptModels, verbose);
    }

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
   * Appends fallback candidates from the global model pool, sorted by proximity to the
   * average power rank of the originally configured models. This ensures that when
   * specific models lack credentials, the fallback uses models of similar capability
   * rather than defaulting to the most or least powerful available model.
   *
   * Fallback candidates are given lower priority than any specific candidate so
   * configured models are always preferred when their credentials are available.
   */
  private appendPowerMatchedFallbackCandidates(
    candidates: ModelVendorCandidate[],
    prompt: MJAIPromptEntityExtended,
    configuredPromptModels: MJAIPromptModelEntity[],
    verbose?: boolean
  ): void {
    // Compute target power rank from the configured models
    const targetPowerRank = this.computeTargetPowerRank(configuredPromptModels);

    // Get all active models matching the prompt's model type, excluding already-present models
    const existingModelIds = new Set(candidates.map(c => c.model.ID));
    const fallbackPool = AIEngine.Instance.Models.filter(
      m => m.IsActive &&
           !existingModelIds.has(m.ID) &&
           (!prompt.AIModelTypeID || UUIDsEqual(m.AIModelTypeID, prompt.AIModelTypeID))
    );

    if (fallbackPool.length === 0) return;

    // Sort by proximity to the target power rank
    const sorted = this.sortByPowerProximity(fallbackPool, targetPowerRank);

    // Assign priorities below the lowest specific candidate
    const lowestSpecificPriority = candidates.length > 0
      ? Math.min(...candidates.map(c => c.priority))
      : 1000;
    const fallbackBasePriority = lowestSpecificPriority - 100;

    sorted.forEach((model, index) => {
      const modelCandidates = this.createCandidatesForModel(
        model,
        fallbackBasePriority - index * 10,
        'power-match-fallback'
      );
      candidates.push(...modelCandidates);
    });

    if (verbose && sorted.length > 0) {
      LogStatus(
        `Appended ${sorted.length} power-matched fallback models (target PowerRank: ${targetPowerRank}) ` +
        `for prompt "${prompt.Name}" since RequireSpecificModels is false`
      );
    }
  }

  /**
   * Computes the target power rank from configured AIPromptModel records.
   * Uses the weighted average (by priority) of the configured models' power ranks,
   * so higher-priority models have more influence on the target.
   * Falls back to simple average if priorities are all zero.
   */
  private computeTargetPowerRank(promptModels: MJAIPromptModelEntity[]): number {
    if (promptModels.length === 0) return 0;

    const modelsWithPower = promptModels
      .map(pm => {
        const model = AIEngine.Instance.ModelsByID.get(NormalizeUUID(pm.ModelID));
        return { powerRank: model?.PowerRank ?? 0, priority: pm.Priority || 1 };
      });

    const totalWeight = modelsWithPower.reduce((sum, m) => sum + m.priority, 0);
    if (totalWeight === 0) {
      // All priorities are 0, use simple average
      return Math.round(modelsWithPower.reduce((sum, m) => sum + m.powerRank, 0) / modelsWithPower.length);
    }

    const weightedSum = modelsWithPower.reduce((sum, m) => sum + m.powerRank * m.priority, 0);
    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Sorts models by proximity to a target power rank (closest first).
   * When two models are equidistant, the higher-powered one is preferred.
   */
  private sortByPowerProximity(
    models: MJAIModelEntityExtended[],
    targetPowerRank: number
  ): MJAIModelEntityExtended[] {
    return [...models].sort((a, b) => {
      const distA = Math.abs((a.PowerRank ?? 0) - targetPowerRank);
      const distB = Math.abs((b.PowerRank ?? 0) - targetPowerRank);
      if (distA !== distB) return distA - distB; // Closer to target first
      return (b.PowerRank ?? 0) - (a.PowerRank ?? 0); // Tie-break: higher power first
    });
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
      AIEngine.Instance.VendorsByID.get(NormalizeUUID(preferredVendorId))?.Name : undefined;

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
    } else if (this.hasAnyPromptModelBindings(prompt)) {
      // Bindings exist for this prompt but none are Active/Preview (e.g. deliberately deactivated) —
      // do NOT silently fall back to the global model pool, which would mask an intentional
      // "no model available for this prompt" state. Leave candidates empty so the caller surfaces
      // a "no suitable model found" failure instead of succeeding against an unrelated model.
    } else {
      // No prompt-specific bindings were ever configured, use the general selection strategy
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

    for (let i = 0; i < promptModels.length; i++) {
      const pm = promptModels[i];
      // Compute priority as inverse of array position so highest-priority (first) gets the largest number
      const computedPriority = promptModels.length - i;
      const model = AIEngine.Instance.ModelsByID.get(NormalizeUUID(pm.ModelID));
      if (!model || !model.IsActive) continue;

      if (pm.VendorID) {
        // Specific vendor specified - create single candidate
        const candidate = this.createCandidateForSpecificVendor(model, pm, computedPriority);
        if (candidate) {
          candidates.push(candidate);
        }
      } else {
        // No vendor specified - create candidates for all vendors
        const vendorCandidates = this.createCandidatesForAllVendors(model, computedPriority);
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
    promptModel: MJAIPromptModelEntity,
    computedPriority: number = 0
  ): ModelVendorCandidate | null {
    // Use the model's precomputed ModelVendors (grouped at engine load) instead of scanning
    // the global ModelVendors array — model.ID === promptModel.ModelID here.
    const modelVendor = model.ModelVendors.find(
      mv => UUIDsEqual(mv.VendorID, promptModel.VendorID) &&
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
      promptModelConfiguration: promptModel.PromptConfigurationObject,
      isPreferredVendor: false,
      priority: computedPriority,
      source: 'prompt-model'
    };
  }

  /**
   * Helper: Create candidates for all vendors of a model, sorted by vendor priority.
   */
  private createCandidatesForAllVendors(
    model: MJAIModelEntityExtended,
    computedPriority: number = 0
  ): ModelVendorCandidate[] {
    const vendors = model.ModelVendors
      .filter(mv =>
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
        priority: computedPriority,
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
        priority: computedPriority,
        source: 'prompt-model'
      });
    }

    return candidates;
  }

  /**
   * Helper: true if this prompt has any AIPromptModel bindings at all, regardless of Status or
   * ConfigurationID. Distinguishes "no bindings were ever configured" (general selection strategy
   * should apply) from "bindings exist but are all Inactive" (no model should be selected).
   */
  private hasAnyPromptModelBindings(prompt: MJAIPromptEntityExtended): boolean {
    return AIEngine.Instance.PromptModels.some(pm => UUIDsEqual(pm.PromptID, prompt.ID));
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
      const model = AIEngine.Instance.ModelsByID.get(NormalizeUUID(pm.ModelID));
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
        const model = AIEngine.Instance.ModelsByID.get(NormalizeUUID(pm.ModelID));
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
      const model = AIEngine.Instance.ModelsByID.get(NormalizeUUID(pm.ModelID));
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
            m.ModelVendors.some(mv =>
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

    // Get all vendors for this model - filter for inference providers only.
    // Uses the model's precomputed ModelVendors (grouped at engine load) rather than scanning
    // the global ModelVendors array.
    const modelVendors = model.ModelVendors
      .filter(mv => mv.Status === 'Active' && this.isInferenceProvider(mv))
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
   * Awaits all in-flight prompt-run saves queued by this runner instance. The normal execution path
   * does NOT call this — prompt-run persistence is intentionally fire-and-forget. Exposed for tests
   * and for callers that need the AIPromptRun rows durably written before proceeding.
   */
  public async WaitForPendingPromptRunSaves(): Promise<void> {
    await this._promptRunQueue.Flush();
  }

  /**
   * Creates the `MJ: AI Prompt Runs` record for one model call, fills the fields every runner shares,
   * lets the subclass add its own request fields, then queues the INSERT (fire-and-forget).
   */
  protected async createRunRecord(
    prompt: MJAIPromptEntityExtended,
    model: MJAIModelEntityExtended,
    params: AIPromptParams,
    startTime: Date,
    vendorId?: string,
    modelSelectionInfo?: any,
    applyRequestFields?: (promptRun: MJAIPromptRunEntityExtended) => void
  ): Promise<MJAIPromptRunEntityExtended> {
    const provider: IMetadataProvider = params.provider ?? Metadata.Provider;
    const promptRun = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', params.contextUser);
    try {
      promptRun.NewRecord();

      promptRun.PromptID = prompt.ID;
      promptRun.ModelID = model.ID;
      // Attribute the run to the agent that caused it, when there is one. PromptID alone cannot do
      // this: agents share agent-type-level prompts, so a parent and its sub-agent produce runs of
      // the SAME prompt. See AIPromptParams.agentId for why this was previously always null.
      if (params.agentId) {
        promptRun.AgentID = params.agentId;
      }

      // Set initial status and tracking fields
      promptRun.Status = 'Running';
      promptRun.Cancelled = false;
      promptRun.CacheHit = false;
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
        const modelVendors = model.ModelVendors
          .filter((mv) => mv.Status === 'Active' && this.isInferenceProvider(mv))
          .sort((a, b) => b.Priority - a.Priority);
        
        if (modelVendors.length > 0) {
          promptRun.VendorID = modelVendors[0].VendorID;
        }
      }
      promptRun.ConfigurationID = params.configurationId;
      promptRun.RunAt = startTime;

      // Set ParentID for hierarchical prompt execution tracking
      if (params.parentPromptRunId) {
        promptRun.ParentID = params.parentPromptRunId;
      }

      // Set RerunFromPromptRunID if this is a rerun
      if (params.rerunFromPromptRunID) {
        promptRun.RerunFromPromptRunID = params.rerunFromPromptRunID;
      }

      applyRequestFields?.(promptRun);

      // Persist the initial 'Running' record fire-and-forget. The ID was already assigned by
      // NewRecord() above, so callers (and the onPromptRunCreated callback) have it immediately —
      // we don't block the model call on the INSERT. The finalize UPDATE chains after this INSERT
      // via the instance-keyed save queue, so ordering is guaranteed.
      this._promptRunQueue.Insert(promptRun);

      // Invoke callback if provided. The ID is available without awaiting the save (client-generated
      // by NewRecord()), so agent-run/step linking that depends on it works immediately.
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
  protected updatePromptRunWithFailoverFailure(
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
  protected createFailoverErrorResult(lastError: Error | null, failoverAttempts: FailoverAttempt[]): ChatResult {
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
   * Engine-level default model-call timeout, in milliseconds, applied when the caller supplies no
   * `AIPromptParams.timeoutMS`. `undefined` (the default) means NO implicit bound — a prompt run
   * with neither a timeout nor a cancellation token stays unbounded, exactly as before, so this
   * change is behavior-preserving for existing callers.
   *
   * Subclasses (or a host application's runner subclass) can override this to impose a global
   * safety ceiling on every prompt call.
   */
  protected get DefaultPromptTimeoutMS(): number | undefined {
    return undefined;
  }

  /**
   * Resolves the per-model-call timeout: the caller's `AIPromptParams.timeoutMS`, else the runner's
   * {@link DefaultPromptTimeoutMS}. Non-positive / non-numeric values mean "no timeout".
   *
   * The bound is applied PER MODEL CALL (not per prompt execution), which mirrors the parallel
   * path's existing `taskTimeoutMS` semantics: each failover candidate / validation retry gets a
   * fresh budget rather than sharing one wall-clock window.
   *
   * NOTE (issue #3064): there is deliberately NO prompt-entity source here yet — the `AIPrompt`
   * table has no `TimeoutMS` column today. Once a migration adds one and CodeGen regenerates the
   * entity, this becomes `prompt.TimeoutMS ?? params.timeoutMS ?? this.DefaultPromptTimeoutMS`
   * and every bound below starts honoring the per-prompt configuration with no other change.
   */
  protected getEffectiveTimeoutMS(params: AIPromptParams): number | undefined {
    const timeoutMS = params.timeoutMS ?? this.DefaultPromptTimeoutMS;
    return typeof timeoutMS === 'number' && timeoutMS > 0 ? timeoutMS : undefined;
  }

  /**
   * Composes the caller-supplied cancellation token with the resolved model-call timeout into a
   * single {@link AbortSignal} that bounds one model call. NEITHER bound is discarded:
   *
   * - caller token only  → the caller's signal is used directly (behavior unchanged)
   * - timeout only       → an internal controller aborts after the timeout elapses
   * - both               → an internal controller relays the caller's abort AND fires on timeout;
   *                        whichever happens first wins
   * - neither            → `Signal` is undefined and the call runs unbounded (legacy behavior)
   *
   * Implemented with an AbortController + relay listener rather than `AbortSignal.any()` so it works
   * on Node 18 (where `AbortSignal.any` does not exist — it landed in Node 20.3).
   */
  protected createExecutionBound(prompt: MJAIPromptEntityExtended, params: AIPromptParams, cancellationToken?: AbortSignal): ExecutionBound {
    const timeoutMS = this.getEffectiveTimeoutMS(params);
    if (timeoutMS === undefined) {
      // No prompt timeout: use the caller's token as-is (or nothing at all).
      return { Signal: cancellationToken, TimeoutMS: undefined, TimedOut: () => false, Dispose: () => { /* nothing to release */ } };
    }

    const controller = new AbortController();
    let timedOut = false;

    const relayCallerAbort = () => {
      if (!controller.signal.aborted) {
        controller.abort(cancellationToken?.reason ?? 'Chat completion was cancelled');
      }
    };
    if (cancellationToken) {
      if (cancellationToken.aborted) {
        relayCallerAbort();
      } else {
        cancellationToken.addEventListener('abort', relayCallerAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        timedOut = true;
        controller.abort(new AIPromptTimeoutError(prompt.Name, timeoutMS));
      }
    }, timeoutMS);

    return {
      Signal: controller.signal,
      TimeoutMS: timeoutMS,
      TimedOut: () => timedOut,
      Dispose: () => {
        clearTimeout(timer);
        cancellationToken?.removeEventListener('abort', relayCallerAbort);
      },
    };
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

  protected async applyRetryDelay(prompt: MJAIPromptEntityExtended, attemptNumber: number, suggestedDelaySeconds?: number): Promise<void> {
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
      const vendorName = AIEngine.Instance.VendorsByID.get(NormalizeUUID(failedVendorId))?.Name || failedVendorId;
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
        ? AIEngine.Instance.VendorsByID.get(NormalizeUUID(currentVendorId))?.Name || 'default'
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
  protected async processFailoverError(
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
   * Queues the finalize UPDATE for a prompt-run record. Inside the queued task: sets the completion
   * timing, lets the subclass apply its result fields, then computes the rollups and TotalCost.
   */
  protected async finalizeRunRecord(
    promptRun: MJAIPromptRunEntityExtended,
    endTime: Date,
    executionTimeMS: number,
    applyResultFields: (promptRun: MJAIPromptRunEntityExtended) => void
  ): Promise<void> {
    // Fire-and-forget finalize UPDATE. The field mutations run INSIDE the post-INSERT task (after the
    // 'Running' INSERT + its finalizeSave reload land), so the reload can never revert them and the
    // chained UPDATE persists the finalized state — the "stuck at Running" race is structurally
    // impossible. The execution flow does NOT await the save.
    this._promptRunQueue.Update(promptRun, () => {
      try {
        promptRun.CompletedAt = endTime;
        promptRun.ExecutionTimeMS = executionTimeMS;

        applyResultFields(promptRun);

        // Note: Failover tracking fields are now updated directly in executeModelWithFailover
        // The promptRun entity already has the failover information set

        // With template composition, we only execute once so rollup equals regular fields
        promptRun.TokensPromptRollup = promptRun.TokensPrompt;
        promptRun.TokensCompletionRollup = promptRun.TokensCompletion;
        promptRun.TokensUsedRollup = promptRun.TokensUsed;
        promptRun.TokensCacheReadRollup = promptRun.TokensCacheRead;
        promptRun.TokensCacheWriteRollup = promptRun.TokensCacheWrite;
        if (promptRun.Cost !== undefined) {
          promptRun.TotalCost = promptRun.Cost;
        }
      } catch (error) {
        this.logError(error, {
          category: 'PromptRunUpdate',
          metadata: {
            promptRunId: promptRun.ID
          }
        });
      }
    });
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
