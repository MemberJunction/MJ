/**
 * @fileoverview PromptSpec interface and PromptSpecSync class for deterministic AI prompt creation.
 *
 * This module provides a clean, serializable structure for representing AI prompt configurations
 * and a synchronization class for bidirectional conversion between PromptSpec and AIPromptEntity.
 *
 * Similar to AgentSpec, PromptSpec enables:
 * - Deterministic prompt creation with all 50+ configuration fields
 * - Type-safe prompt definitions from Planning Designer
 * - Intelligent defaults for production-ready prompts
 * - Clean separation between specification and persistence
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.108.0
 */

import { AIPromptEntity, AIPromptModelEntity, TemplateEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';

/**
 * Clean, serializable structure representing a complete AI prompt configuration.
 * This interface includes all fields from AIPromptEntity in a type-safe, easy-to-use format.
 *
 * Used by Planning Designer to define prompts and by Agent Manager actions to create
 * production-ready prompts with intelligent defaults.
 *
 * @example
 * ```typescript
 * const promptSpec: PromptSpec = {
 *   Name: 'Data Collector - Main Prompt',
 *   Description: 'System prompt for data collection agent',
 *   PromptText: 'You are a data collector...',
 *   ResponseFormat: 'JSON',
 *   PromptRole: 'System',
 *   OutputType: 'object',
 *   OutputExample: '{ "action": "...", "data": {...} }'
 * };
 * ```
 */
export interface PromptSpec {
    // ==================== Core Identification ====================

    /**
     * Unique name for the prompt (e.g., "Customer Analyzer - Main Prompt")
     */
    Name: string;

    /**
     * Clear description of the prompt's purpose
     */
    Description: string;

    /**
     * The actual prompt text/template content. This will be stored in a Template entity.
     */
    PromptText: string;

    // ==================== Classification ====================

    /**
     * Reference to AI Prompt Type (e.g., "Chat", "Text-to-Image").
     * Defaults to "Chat" if not specified.
     */
    TypeID?: string;

    /**
     * Optional category for organizing prompts (e.g., "Agent Management", "System Utilities")
     */
    CategoryID?: string | null;

    /**
     * Status of the prompt. Defaults to "Active".
     */
    Status?: 'Active' | 'Disabled' | 'Pending';

    // ==================== Response Configuration ====================

    /**
     * Expected response format from the AI model.
     * Defaults to "JSON" for agent prompts.
     */
    ResponseFormat?: 'Any' | 'JSON' | 'Markdown' | 'ModelSpecific' | 'Text';

    /**
     * Model-specific response format instructions (JSON string).
     * Only used when ResponseFormat is "ModelSpecific".
     */
    ModelSpecificResponseFormat?: string | null;

    /**
     * Determines how the prompt is used in conversation.
     * - System: Always first message (default for agent prompts)
     * - User: Positioned by PromptPosition
     * - Assistant: Positioned by PromptPosition
     * - SystemOrUser: Try system first, fallback to user if system slot taken
     */
    PromptRole?: 'System' | 'User' | 'Assistant' | 'SystemOrUser';

    /**
     * Controls message placement for User and Assistant role prompts.
     * - First: Beginning of conversation (default)
     * - Last: End of conversation
     * Not used for System role prompts.
     */
    PromptPosition?: 'First' | 'Last';

    // ==================== Output Validation ====================

    /**
     * Expected data type of the prompt output.
     * Defaults to "object" for structured JSON responses.
     */
    OutputType?: 'string' | 'number' | 'boolean' | 'date' | 'object';

    /**
     * JSON example output when OutputType is "object".
     * Required if OutputType is "object", used for validating structured outputs.
     */
    OutputExample?: string | null;

    /**
     * How validation failures are handled.
     * - Strict: Fail execution on validation error (default for quality)
     * - Warn: Log warning but allow execution to succeed
     * - None: Skip validation entirely
     */
    ValidationBehavior?: 'None' | 'Warn' | 'Strict';

    // ==================== Retry Configuration ====================

    /**
     * Maximum number of retry attempts for API failures.
     * Defaults to 2 for reasonable error handling.
     */
    MaxRetries?: number;

    /**
     * Delay between retry attempts in milliseconds.
     * Defaults to 1000 (1 second).
     */
    RetryDelayMS?: number;

    /**
     * Strategy for calculating retry delays.
     * - Fixed: Same delay each time (default)
     * - Exponential: Doubling delay
     * - Linear: Linearly increasing delay
     */
    RetryStrategy?: 'Fixed' | 'Linear' | 'Exponential';

    // ==================== Model Selection ====================

    /**
     * Determines how models are selected for this prompt.
     * - Default: Use default model selection logic
     * - Specific: Use models defined in PromptModel relationships
     * - ByPower: Select by power rank and preference
     * Defaults to "Specific" for explicit control.
     */
    SelectionStrategy?: 'Default' | 'Specific' | 'ByPower';

    /**
     * When using ByPower selection strategy, determines model preference.
     * - Highest: Best quality models (default)
     * - Balanced: Mid-tier models
     * - Lowest: Cheapest/fastest models
     */
    PowerPreference?: 'Lowest' | 'Balanced' | 'Highest';

    /**
     * Minimum power rank required for models to be considered.
     * Higher values require more capable models.
     */
    MinPowerRank?: number | null;

    /**
     * References the type of AI model this prompt is designed for (LLM, Image, Audio, etc.).
     */
    AIModelTypeID?: string | null;

    // ==================== Parallelization ====================

    /**
     * Controls parallel execution of the prompt.
     * - None: No parallelization (default)
     * - StaticCount: Use ParallelCount for total runs
     * - ConfigParam: Use config param specified in ParallelConfigParam
     * - ModelSpecific: Check each AIPromptModel's individual settings
     */
    ParallelizationMode?: 'None' | 'StaticCount' | 'ConfigParam' | 'ModelSpecific';

    /**
     * Number of parallel executions when ParallelizationMode is StaticCount.
     */
    ParallelCount?: number | null;

    /**
     * Configuration parameter name when ParallelizationMode is ConfigParam.
     */
    ParallelConfigParam?: string | null;

    /**
     * References another prompt that selects the best result from parallel executions.
     */
    ResultSelectorPromptID?: string | null;

    // ==================== Caching ====================

    /**
     * When true, results from this prompt will be cached for potential reuse.
     * Defaults to false.
     */
    EnableCaching?: boolean;

    /**
     * Time-to-live in seconds for cached results. NULL means results never expire.
     */
    CacheTTLSeconds?: number | null;

    /**
     * Method for matching cached results.
     * - Exact: String matching (default)
     * - Vector: Embedding similarity
     */
    CacheMatchType?: 'Exact' | 'Vector';

    /**
     * Threshold (0-1) for vector similarity matching.
     * Higher values require closer matches.
     * Required when CacheMatchType is "Vector".
     */
    CacheSimilarityThreshold?: number | null;

    /**
     * When true, the AI model must match for a cache hit.
     * Defaults to true.
     */
    CacheMustMatchModel?: boolean;

    /**
     * When true, the vendor must match for a cache hit.
     * Defaults to true.
     */
    CacheMustMatchVendor?: boolean;

    /**
     * When true, the agent context must match for a cache hit.
     * Defaults to false.
     */
    CacheMustMatchAgent?: boolean;

    /**
     * When true, the configuration must match for a cache hit.
     * Defaults to false.
     */
    CacheMustMatchConfig?: boolean;

    // ==================== LLM Parameters ====================

    /**
     * Default temperature setting for this prompt.
     * Controls randomness: 0 = focused/deterministic, 2 = random/creative.
     * Can be overridden at runtime.
     */
    Temperature?: number | null;

    /**
     * Top-p (nucleus sampling) parameter.
     * Controls diversity via cumulative probability threshold.
     */
    TopP?: number | null;

    /**
     * Top-k parameter for token selection.
     * Limits consideration to k most likely tokens.
     */
    TopK?: number | null;

    /**
     * Presence penalty to discourage repetition of topics.
     * Positive values encourage exploring new topics.
     */
    PresencePenalty?: number | null;

    /**
     * Frequency penalty to discourage repetition of exact phrases.
     * Positive values encourage more diverse wording.
     */
    FrequencyPenalty?: number | null;


    /**
     * Random seed for deterministic outputs.
     * Same seed with same input produces same output.
     */
    Seed?: number | null;

    /**
     * Effort level for prompt execution (1-100).
     * Higher values may use more capable models or allow more processing time.
     */
    EffortLevel?: number | null;

    // ==================== Model Relationships (Advanced) ====================

    /**
     * Optional array of model-vendor-priority specifications.
     * Used for fine-grained control over which models can execute this prompt.
     */
    Models?: PromptModelSpec[];
}

/**
 * Specification for a model-vendor-priority relationship for a prompt.
 * Defines which AI models can execute a prompt and in what priority order.
 */
export interface PromptModelSpec {
    /**
     * The unique ID of the AI model
     */
    ModelID: string;

    /**
     * The unique ID of the vendor providing the model
     */
    VendorID: string;

    /**
     * Priority for model selection (lower number = higher priority)
     * Priority 1 is tried first, then 2, then 3, etc.
     */
    Priority: number;
}

/**
 * Result of a prompt specification sync operation
 */
export interface PromptSpecSyncResult {
    /**
     * Whether the sync was successful
     */
    Success: boolean;

    /**
     * The ID of the created/updated prompt
     */
    PromptID?: string;

    /**
     * The ID of the created/updated template
     */
    TemplateID?: string;

    /**
     * Error message if sync failed
     */
    ErrorMessage?: string;

    /**
     * Detailed error information for troubleshooting
     */
    Details?: string;
}

/**
 * Bidirectional synchronization class for PromptSpec ↔ AIPromptEntity.
 *
 * Handles:
 * - Creating Templates for prompt text
 * - Converting PromptSpec to AIPromptEntity with all fields
 * - Applying intelligent defaults for production-ready prompts
 * - Validating configurations before database writes
 * - Loading existing prompts back to PromptSpec format
 *
 * @example
 * ```typescript
 * const sync = new PromptSpecSync();
 * const result = await sync.createFromSpec(promptSpec, contextUser);
 * if (result.Success) {
 *   console.log('Prompt created:', result.PromptID);
 * }
 * ```
 */
export class PromptSpecSync {
    private _metadata: Metadata;

    constructor() {
        this._metadata = new Metadata();
    }

    /**
     * Creates a new AI prompt from a PromptSpec, including template creation.
     *
     * @param spec The prompt specification
     * @param contextUser User context for database operations
     * @returns Result with PromptID and TemplateID if successful
     */
    async createFromSpec(spec: PromptSpec, contextUser: UserInfo): Promise<PromptSpecSyncResult> {
        try {
            // 1. Validate the spec
            const validationError = this.validateSpec(spec);
            if (validationError) {
                return {
                    Success: false,
                    ErrorMessage: validationError
                };
            }

            // 2. Apply intelligent defaults
            const completeSpec = this.applyDefaults(spec);

            // 3. Create template for the prompt text
            const templateResult = await this.createTemplate(completeSpec.PromptText, completeSpec.Name, contextUser);
            if (!templateResult.Success) {
                return {
                    Success: false,
                    ErrorMessage: `Failed to create template: ${templateResult.ErrorMessage}`,
                    Details: templateResult.Details
                };
            }

            // 4. Create AIPrompt entity
            const prompt = await this._metadata.GetEntityObject<AIPromptEntity>('AI Prompts', contextUser);
            if (!prompt) {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to create AI Prompt entity object'
                };
            }

            // 5. Set all fields from spec
            prompt.NewRecord();
            this.applySpecToEntity(completeSpec, prompt, templateResult.TemplateID!);

            // 6. Save prompt
            const saved = await prompt.Save();
            if (!saved) {
                return {
                    Success: false,
                    ErrorMessage: prompt.LatestResult?.Message || 'Failed to save prompt'
                };
            }

            // 7. Create model relationships if specified
            if (completeSpec.Models && completeSpec.Models.length > 0) {
                await this.createModelRelationships(prompt.ID, completeSpec.Models, contextUser);
            }

            return {
                Success: true,
                PromptID: prompt.ID,
                TemplateID: templateResult.TemplateID
            };

        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : 'Unknown error during prompt creation',
                Details: error instanceof Error ? error.stack : undefined
            };
        }
    }

    /**
     * Validates a PromptSpec for required fields and correct values.
     *
     * @param spec The spec to validate
     * @returns Error message if invalid, null if valid
     */
    private validateSpec(spec: PromptSpec): string | null {
        // Required fields
        if (!spec.Name || spec.Name.trim() === '') {
            return 'Name is required and cannot be empty';
        }

        if (!spec.Description || spec.Description.trim() === '') {
            return 'Description is required and cannot be empty';
        }

        if (!spec.PromptText || spec.PromptText.trim() === '') {
            return 'PromptText is required and cannot be empty';
        }

        // OutputExample required if OutputType is object
        if (spec.OutputType === 'object' && !spec.OutputExample) {
            return 'OutputExample is required when OutputType is "object"';
        }

        // Validate OutputExample is valid JSON if provided
        if (spec.OutputExample) {
            try {
                JSON.parse(spec.OutputExample);
            } catch {
                return 'OutputExample must be valid JSON';
            }
        }

        // Validate EffortLevel range
        if (spec.EffortLevel != null && (spec.EffortLevel < 1 || spec.EffortLevel > 100)) {
            return 'EffortLevel must be between 1 and 100';
        }

        // Validate CacheSimilarityThreshold
        if (spec.CacheSimilarityThreshold != null &&
            (spec.CacheSimilarityThreshold < 0 || spec.CacheSimilarityThreshold > 1)) {
            return 'CacheSimilarityThreshold must be between 0 and 1';
        }

        // Validate CacheSimilarityThreshold required for Vector cache
        if (spec.CacheMatchType === 'Vector' && spec.CacheSimilarityThreshold == null) {
            return 'CacheSimilarityThreshold is required when CacheMatchType is "Vector"';
        }

        // Validate ParallelCount required for StaticCount mode
        if (spec.ParallelizationMode === 'StaticCount' && spec.ParallelCount == null) {
            return 'ParallelCount is required when ParallelizationMode is "StaticCount"';
        }

        // Validate ParallelConfigParam required for ConfigParam mode
        if (spec.ParallelizationMode === 'ConfigParam' && !spec.ParallelConfigParam) {
            return 'ParallelConfigParam is required when ParallelizationMode is "ConfigParam"';
        }

        return null; // Valid
    }

    /**
     * Applies intelligent defaults to a partial PromptSpec.
     * These defaults are optimized for agent prompts that need structured JSON responses.
     *
     * @param partial Partial spec with at minimum Name, Description, PromptText
     * @returns Complete spec with all defaults applied
     */
    private applyDefaults(partial: PromptSpec): PromptSpec {
        return {
            // Required fields (passed through)
            Name: partial.Name,
            Description: partial.Description,
            PromptText: partial.PromptText,

            // Classification defaults
            Status: partial.Status ?? 'Active',
            TypeID: partial.TypeID,  // Will be resolved to "Chat" in applySpecToEntity if undefined
            CategoryID: partial.CategoryID ?? null,

            // Response configuration defaults (optimized for agents)
            ResponseFormat: partial.ResponseFormat ?? 'JSON',
            ModelSpecificResponseFormat: partial.ModelSpecificResponseFormat ?? null,
            PromptRole: partial.PromptRole ?? 'System',
            PromptPosition: partial.PromptPosition ?? 'First',

            // Output validation defaults
            OutputType: partial.OutputType ?? 'object',
            OutputExample: partial.OutputExample ?? null,
            ValidationBehavior: partial.ValidationBehavior ?? 'Strict',

            // Retry configuration defaults
            MaxRetries: partial.MaxRetries ?? 2,
            RetryDelayMS: partial.RetryDelayMS ?? 1000,
            RetryStrategy: partial.RetryStrategy ?? 'Fixed',

            // Model selection defaults
            SelectionStrategy: partial.SelectionStrategy ?? 'Specific',
            PowerPreference: partial.PowerPreference ?? 'Highest',
            MinPowerRank: partial.MinPowerRank ?? null,
            AIModelTypeID: partial.AIModelTypeID ?? null,

            // Parallelization defaults
            ParallelizationMode: partial.ParallelizationMode ?? 'None',
            ParallelCount: partial.ParallelCount ?? null,
            ParallelConfigParam: partial.ParallelConfigParam ?? null,
            ResultSelectorPromptID: partial.ResultSelectorPromptID ?? null,

            // Caching defaults
            EnableCaching: partial.EnableCaching ?? false,
            CacheTTLSeconds: partial.CacheTTLSeconds ?? null,
            CacheMatchType: partial.CacheMatchType ?? 'Exact',
            CacheSimilarityThreshold: partial.CacheSimilarityThreshold ?? null,
            CacheMustMatchModel: partial.CacheMustMatchModel ?? true,
            CacheMustMatchVendor: partial.CacheMustMatchVendor ?? true,
            CacheMustMatchAgent: partial.CacheMustMatchAgent ?? false,
            CacheMustMatchConfig: partial.CacheMustMatchConfig ?? false,

            // LLM parameters (NULL means use model defaults)
            Temperature: partial.Temperature ?? null,
            TopP: partial.TopP ?? null,
            TopK: partial.TopK ?? null,
            PresencePenalty: partial.PresencePenalty ?? null,
            FrequencyPenalty: partial.FrequencyPenalty ?? null,
            Seed: partial.Seed ?? null,
            EffortLevel: partial.EffortLevel ?? null,

            // Model relationships
            Models: partial.Models ?? []
        };
    }

    /**
     * Creates a Template entity for the prompt text.
     *
     * @param promptText The prompt text/template content
     * @param promptName Name for the template (derived from prompt name)
     * @param contextUser User context
     * @returns Result with TemplateID if successful
     */
    private async createTemplate(
        promptText: string,
        promptName: string,
        contextUser: UserInfo
    ): Promise<PromptSpecSyncResult> {
        try {
            const template = await this._metadata.GetEntityObject<TemplateEntity>('Templates', contextUser);
            if (!template) {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to create Template entity object'
                };
            }

            template.NewRecord();
            template.Name = `${promptName} - Template`;
            template.Description = `Template for ${promptName}`;
            template.CategoryID = null;
            template.UserPrompt = promptText;  // Store prompt text in UserPrompt field
            template.IsActive = true;

            const saved = await template.Save();
            if (!saved) {
                return {
                    Success: false,
                    ErrorMessage: template.LatestResult?.Message || 'Failed to save template'
                };
            }

            return {
                Success: true,
                TemplateID: template.ID
            };

        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : 'Unknown error creating template',
                Details: error instanceof Error ? error.stack : undefined
            };
        }
    }

    /**
     * Applies all fields from a PromptSpec to an AIPromptEntity.
     *
     * @param spec Complete prompt specification
     * @param entity The prompt entity to update
     * @param templateID The template ID to reference
     */
    private applySpecToEntity(spec: PromptSpec, entity: AIPromptEntity, templateID: string): void {
        // Core identification
        entity.Name = spec.Name;
        entity.Description = spec.Description;
        entity.TemplateID = templateID;
        entity.Status = spec.Status ?? 'Active';

        // Classification - TypeID will be set to null, which triggers default in database
        // CategoryID is optional
        entity.CategoryID = spec.CategoryID ?? null;

        // Response configuration
        entity.ResponseFormat = spec.ResponseFormat ?? 'JSON';
        entity.ModelSpecificResponseFormat = spec.ModelSpecificResponseFormat ?? null;
        entity.PromptRole = spec.PromptRole ?? 'System';
        entity.PromptPosition = spec.PromptPosition ?? 'First';

        // Output validation
        entity.OutputType = spec.OutputType ?? 'object';
        entity.OutputExample = spec.OutputExample ?? null;
        entity.ValidationBehavior = spec.ValidationBehavior ?? 'Strict';

        // Retry configuration
        entity.MaxRetries = spec.MaxRetries ?? 2;
        entity.RetryDelayMS = spec.RetryDelayMS ?? 1000;
        entity.RetryStrategy = spec.RetryStrategy ?? 'Fixed';

        // Model selection
        entity.SelectionStrategy = spec.SelectionStrategy ?? 'Specific';
        entity.PowerPreference = spec.PowerPreference ?? 'Highest';
        entity.MinPowerRank = spec.MinPowerRank ?? null;
        entity.AIModelTypeID = spec.AIModelTypeID ?? null;

        // Parallelization
        entity.ParallelizationMode = spec.ParallelizationMode ?? 'None';
        entity.ParallelCount = spec.ParallelCount ?? null;
        entity.ParallelConfigParam = spec.ParallelConfigParam ?? null;
        entity.ResultSelectorPromptID = spec.ResultSelectorPromptID ?? null;

        // Caching
        entity.EnableCaching = spec.EnableCaching ?? false;
        entity.CacheTTLSeconds = spec.CacheTTLSeconds ?? null;
        entity.CacheMatchType = spec.CacheMatchType ?? 'Exact';
        entity.CacheSimilarityThreshold = spec.CacheSimilarityThreshold ?? null;
        entity.CacheMustMatchModel = spec.CacheMustMatchModel ?? true;
        entity.CacheMustMatchVendor = spec.CacheMustMatchVendor ?? true;
        entity.CacheMustMatchAgent = spec.CacheMustMatchAgent ?? false;
        entity.CacheMustMatchConfig = spec.CacheMustMatchConfig ?? false;

        // LLM parameters
        entity.Temperature = spec.Temperature ?? null;
        entity.TopP = spec.TopP ?? null;
        entity.TopK = spec.TopK ?? null;
        entity.PresencePenalty = spec.PresencePenalty ?? null;
        entity.FrequencyPenalty = spec.FrequencyPenalty ?? null;
        entity.Seed = spec.Seed ?? null;
        entity.EffortLevel = spec.EffortLevel ?? null;
    }

    /**
     * Creates AIPromptModel relationships for the prompt.
     *
     * @param promptID The prompt ID
     * @param models Array of model specifications
     * @param contextUser User context
     */
    private async createModelRelationships(
        promptID: string,
        models: PromptModelSpec[],
        contextUser: UserInfo
    ): Promise<void> {
        for (const modelSpec of models) {
            try {
                const promptModel = await this._metadata.GetEntityObject<AIPromptModelEntity>(
                    'MJ: AI Prompt Models',
                    contextUser
                );

                if (promptModel) {
                    promptModel.NewRecord();
                    promptModel.PromptID = promptID;
                    promptModel.ModelID = modelSpec.ModelID;
                    promptModel.VendorID = modelSpec.VendorID;
                    promptModel.Priority = modelSpec.Priority;

                    await promptModel.Save();
                }
            } catch (error) {
                // Log error but don't fail entire operation
                console.error(`Failed to create prompt model relationship: ${error}`);
            }
        }
    }

    /**
     * Loads an existing prompt and converts it to PromptSpec format.
     *
     * @param promptID The prompt ID to load
     * @param contextUser User context
     * @returns PromptSpec representation of the prompt
     */
    async loadFromDatabase(promptID: string, contextUser: UserInfo): Promise<PromptSpec | null> {
        try {
            const prompt = await this._metadata.GetEntityObject<AIPromptEntity>('AI Prompts', contextUser);
            if (!prompt) {
                return null;
            }

            const loaded = await prompt.Load(promptID);
            if (!loaded) {
                return null;
            }

            // Load template to get prompt text
            const template = await this._metadata.GetEntityObject<TemplateEntity>('Templates', contextUser);
            if (!template) {
                return null;
            }

            const templateLoaded = await template.Load(prompt.TemplateID);
            if (!templateLoaded) {
                return null;
            }

            // Get prompt text from template's UserPrompt field
            const promptText = template.UserPrompt || '';

            // Load model relationships
            const rv = new RunView();
            const modelsResult = await rv.RunView<AIPromptModelEntity>({
                EntityName: 'MJ: AI Prompt Models',
                ExtraFilter: `PromptID = '${promptID}'`,
                OrderBy: 'Priority',
                ResultType: 'entity_object'
            }, contextUser);

            const models: PromptModelSpec[] = modelsResult.Success && modelsResult.Results
                ? modelsResult.Results.map(pm => ({
                    ModelID: pm.ModelID,
                    VendorID: pm.VendorID,
                    Priority: pm.Priority
                  }))
                : [];

            // Convert entity to spec
            const spec: PromptSpec = {
                Name: prompt.Name,
                Description: prompt.Description || '',
                PromptText: promptText,
                TypeID: prompt.TypeID,
                CategoryID: prompt.CategoryID,
                Status: prompt.Status,
                ResponseFormat: prompt.ResponseFormat,
                ModelSpecificResponseFormat: prompt.ModelSpecificResponseFormat,
                PromptRole: prompt.PromptRole,
                PromptPosition: prompt.PromptPosition,
                OutputType: prompt.OutputType,
                OutputExample: prompt.OutputExample,
                ValidationBehavior: prompt.ValidationBehavior,
                MaxRetries: prompt.MaxRetries,
                RetryDelayMS: prompt.RetryDelayMS,
                RetryStrategy: prompt.RetryStrategy,
                SelectionStrategy: prompt.SelectionStrategy,
                PowerPreference: prompt.PowerPreference,
                MinPowerRank: prompt.MinPowerRank,
                AIModelTypeID: prompt.AIModelTypeID,
                ParallelizationMode: prompt.ParallelizationMode,
                ParallelCount: prompt.ParallelCount,
                ParallelConfigParam: prompt.ParallelConfigParam,
                ResultSelectorPromptID: prompt.ResultSelectorPromptID,
                EnableCaching: prompt.EnableCaching,
                CacheTTLSeconds: prompt.CacheTTLSeconds,
                CacheMatchType: prompt.CacheMatchType,
                CacheSimilarityThreshold: prompt.CacheSimilarityThreshold,
                CacheMustMatchModel: prompt.CacheMustMatchModel,
                CacheMustMatchVendor: prompt.CacheMustMatchVendor,
                CacheMustMatchAgent: prompt.CacheMustMatchAgent,
                CacheMustMatchConfig: prompt.CacheMustMatchConfig,
                Temperature: prompt.Temperature,
                TopP: prompt.TopP,
                TopK: prompt.TopK,
                PresencePenalty: prompt.PresencePenalty,
                FrequencyPenalty: prompt.FrequencyPenalty,
                Seed: prompt.Seed,
                EffortLevel: prompt.EffortLevel,
                Models: models
            };

            return spec;

        } catch (error) {
            console.error(`Error loading prompt ${promptID}:`, error);
            return null;
        }
    }
}
