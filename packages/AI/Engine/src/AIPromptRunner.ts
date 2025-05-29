import { BaseLLM, BaseResult, ChatParams, ChatResult, ChatMessageRole, GetAIAPIKey } from "@memberjunction/ai";
import { LogError, Metadata, UserInfo, ValidationResult, RunView } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import { AIModelEntityExtended, AIPromptEntity, AIPromptRunEntity } from "@memberjunction/core-entities";
import { TemplateEngineServer } from "@memberjunction/templates";
import { TemplateEntityExtended, TemplateRenderResult } from "@memberjunction/templates-base-types";
import { ExecutionPlanner } from "./ExecutionPlanner";
import { ParallelExecutionCoordinator } from "./ParallelExecutionCoordinator";
import { ResultSelectionConfig } from "./ParallelExecution";

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
    data?: any;
    
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
    templateData?: any;
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
     * The raw result from the AI model
     */
    rawResult?: string;
    
    /**
     * The parsed/validated result based on OutputType
     */
    result?: any;
    
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
 */
export class AIPromptRunner {
    private _metadata: Metadata;
    private _templateEngine: TemplateEngineServer;
    private _executionPlanner: ExecutionPlanner;
    private _parallelCoordinator: ParallelExecutionCoordinator;

    constructor() {
        this._metadata = new Metadata();
        this._templateEngine = TemplateEngineServer.Instance;
        this._executionPlanner = new ExecutionPlanner();
        this._parallelCoordinator = new ParallelExecutionCoordinator();
    }

    /**
     * Executes an AI prompt with full support for templates, model selection, and validation.
     * 
     * @param params Parameters for prompt execution
     * @returns Promise<AIPromptRunResult> The execution result with tracking information
     */
    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        const startTime = new Date();
        let promptRun: AIPromptRunEntity | null = null;

        try {
            // Use the prompt entity directly from params
            const prompt = params.prompt;
            if (!prompt) {
                throw new Error(`Prompt entity is required`);
            }

            if (prompt.Status !== 'Active') {
                throw new Error(`Prompt ${prompt.Name} is not active (Status: ${prompt.Status})`);
            }

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

            // Check if we need parallel execution based on ParallelizationMode
            const shouldUseParallelExecution = prompt.ParallelizationMode && prompt.ParallelizationMode !== 'None';
            
            if (shouldUseParallelExecution) {
                // Use parallel execution path
                return await this.executePromptInParallel(prompt, renderedPrompt.Output, params, startTime);
            } else {
                // Use traditional single execution path
                return await this.executeSinglePrompt(prompt, renderedPrompt.Output, params, startTime);
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
                executionTimeMS
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
    private async executeSinglePrompt(
        prompt: AIPromptEntity,
        renderedPromptText: string,
        params: AIPromptParams,
        startTime: Date
    ): Promise<AIPromptRunResult> {
        // Select the model to use based on prompt configuration
        const selectedModel = await this.selectModel(prompt, params.modelId, params.contextUser, params.configurationId, params.vendorId);
        if (!selectedModel) {
            throw new Error(`No suitable model found for prompt ${prompt.Name}`);
        }

        // Create AIPromptRun record for tracking
        const promptRun = await this.createPromptRun(prompt, selectedModel, params, startTime, params.vendorId);

        // Execute the AI model
        const modelResult = await this.executeModel(selectedModel, renderedPromptText, prompt, params.contextUser);
        
        // Parse and validate the result
        const parsedResult = await this.parseAndValidateResult(
            modelResult, 
            prompt, 
            params.skipValidation
        );

        // Calculate execution metrics
        const endTime = new Date();
        const executionTimeMS = endTime.getTime() - startTime.getTime();

        // Update the prompt run with results
        await this.updatePromptRun(promptRun, modelResult, parsedResult, endTime, executionTimeMS);

        const chatResult = modelResult as ChatResult;
        return {
            success: true,
            rawResult: chatResult.data?.choices?.[0]?.message?.content,
            result: parsedResult.result,
            promptRun,
            executionTimeMS,
            tokensUsed: chatResult.data?.usage?.totalTokens,
            validationResult: parsedResult.validationResult
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
        startTime: Date
    ): Promise<AIPromptRunResult> {
        // Load AI Engine to get models and prompt models
        const { AIEngine } = await import('./AIEngine');
        await AIEngine.Instance.Config(false, params.contextUser);

        // Get prompt-specific model associations
        const promptModels = AIEngine.Instance.PromptModels.filter(pm => 
            pm.PromptID === prompt.ID && 
            (pm.Status === 'Active' || pm.Status === 'Preview') &&
            (!params.configurationId || !pm.ConfigurationID || pm.ConfigurationID === params.configurationId)
        );

        // Create execution plan
        const executionTasks = this._executionPlanner.createExecutionPlan(
            prompt,
            promptModels,
            AIEngine.Instance.Models,
            renderedPromptText,
            params.contextUser,
            params.configurationId
        );

        if (executionTasks.length === 0) {
            throw new Error(`No execution tasks created for parallel execution of prompt ${prompt.Name}`);
        }

        // Execute tasks in parallel
        const parallelResult = await this._parallelCoordinator.executeTasksInParallel(executionTasks);

        if (!parallelResult.success) {
            throw new Error(`Parallel execution failed: ${parallelResult.errors.join(', ')}`);
        }

        // Select best result if multiple successful results
        const successfulResults = parallelResult.taskResults.filter(r => r.success);
        if (successfulResults.length === 0) {
            throw new Error(`No successful results from parallel execution`);
        }

        let selectedResult = successfulResults[0]; // Default to first

        // Use result selector if configured
        if (successfulResults.length > 1 && prompt.ResultSelectorPromptID) {
            const selectionConfig: ResultSelectionConfig = {
                method: 'PromptSelector',
                selectorPromptId: prompt.ResultSelectorPromptID
            };
            
            const aiSelectedResult = await this._parallelCoordinator.selectBestResult(successfulResults, selectionConfig);
            if (aiSelectedResult) {
                selectedResult = aiSelectedResult;
            }
        }

        // Create a consolidated AIPromptRun record for the parallel execution
        const consolidatedPromptRun = await this.createPromptRun(
            prompt, 
            selectedResult.task.model, 
            params, 
            startTime,
            params.vendorId
        );

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
            executionGroups: Array.from(parallelResult.groupResults.keys())
        };

        if (params.data || params.templateData || parallelMetadata) {
            consolidatedPromptRun.Messages = JSON.stringify({
                data: params.data,
                templateData: params.templateData,
                parallelExecution: parallelMetadata
            });
        }

        const saveResult = await consolidatedPromptRun.Save();
        if (!saveResult) {
            LogError(`Failed to save consolidated AIPromptRun: ${consolidatedPromptRun.LatestResult?.Message || 'Unknown error'}`);
        }

        return {
            success: true,
            rawResult: selectedResult.rawResult,
            result: selectedResult.parsedResult,
            promptRun: consolidatedPromptRun,
            executionTimeMS: parallelResult.totalExecutionTimeMS,
            tokensUsed: parallelResult.totalTokensUsed,
            validationResult: selectedResult.validationResult
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
        vendorId?: string
    ): Promise<AIModelEntityExtended | null> {
        try {
            // Load AI Engine to access cached models and prompt models
            const { AIEngine } = await import('./AIEngine');
            await AIEngine.Instance.Config(false, contextUser);

            // Resolve vendor ID to vendor name if provided
            let vendorName: string | undefined;
            if (vendorId) {
                try {
                    const rv = new RunView();
                    const vendorResult = await rv.RunView({
                        EntityName: 'AI Vendors',
                        ExtraFilter: `ID='${vendorId}'`,
                        ResultType: 'entity_object'
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
                const model = AIEngine.Instance.Models.find(m => 
                    m.ID === explicitModelId && 
                    (!vendorName || m.Vendor === vendorName)
                );
                if (model && model.IsActive) {
                    return model;
                }
                // If explicit model not found or inactive, log warning but continue with normal selection
                LogError(`Explicit model ${explicitModelId} not found, inactive, or not from specified vendor, using prompt model selection`);
            }

            // Get prompt-specific model associations from AIPromptModels
            const promptModels = AIEngine.Instance.PromptModels.filter(pm => 
                pm.PromptID === prompt.ID && 
                (
                    pm.Status === 'Active' ||
                    pm.Status === 'Preview'
                ) &&
                (!configurationId || !pm.ConfigurationID || pm.ConfigurationID === configurationId)
            );

            let candidateModels: AIModelEntityExtended[] = [];

            if (promptModels.length > 0) {
                // Use prompt-specific models if defined
                candidateModels = promptModels
                    .map(pm => AIEngine.Instance.Models.find(m => m.ID === pm.ModelID))
                    .filter(m => 
                        m && 
                        m.IsActive && 
                        (!vendorName || m.Vendor === vendorName)
                    ) as AIModelEntityExtended[];

                // Sort by priority from AIPromptModels (higher priority first)
                candidateModels.sort((a, b) => {
                    const aPriority = promptModels.find(pm => pm.ModelID === a.ID)?.Priority || 0;
                    const bPriority = promptModels.find(pm => pm.ModelID === b.ID)?.Priority || 0;
                    return bPriority - aPriority;
                });
            } else {
                // Fallback to automatic model selection based on prompt configuration
                const minPowerRank = prompt.MinPowerRank || 0;
                candidateModels = AIEngine.Instance.Models.filter(m => 
                    m.IsActive && 
                    m.PowerRank >= minPowerRank &&
                    (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID) &&
                    (!vendorName || m.Vendor === vendorName)
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
        vendorId?: string
    ): Promise<AIPromptRunEntity> {
        try {
            const promptRun = await this._metadata.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs', params.contextUser);
            promptRun.NewRecord();
            
            promptRun.PromptID = prompt.ID;
            promptRun.ModelID = model.ID;
            promptRun.VendorID = vendorId || model.Vendor;
            promptRun.ConfigurationID = params.configurationId;
            promptRun.RunAt = startTime;
            
            // Store the input data/context as JSON in Messages field
            if (params.data || params.templateData) {
                promptRun.Messages = JSON.stringify({
                    data: params.data,
                    templateData: params.templateData
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
        data?: any,
        templateData?: any
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
        _contextUser?: UserInfo
    ): Promise<ChatResult> {
        try {
            // Create LLM instance
            const apiKey = GetAIAPIKey(model.DriverClass);
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);

            // Prepare chat parameters
            const params = new ChatParams();
            params.model = model.APIName;
            params.messages = [
                {
                    role: ChatMessageRole.user,
                    content: renderedPrompt
                }
            ];

            // Apply response format constraints if specified
            if (prompt.ResponseFormat && prompt.ResponseFormat !== 'Any') {
                // TODO: Implement response format constraints based on prompt.ResponseFormat
                // This would involve setting the appropriate parameters for structured output
            }

            // Execute the model
            return await llm.ChatCompletion(params);

        } catch (error) {
            LogError(`Error executing model ${model.Name}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Parses and validates the AI model result based on prompt configuration
     */
    private async parseAndValidateResult(
        modelResult: ChatResult,
        prompt: AIPromptEntity,
        skipValidation: boolean = false
    ): Promise<{ result: any; validationResult?: ValidationResult }> {
        try {
            if (!modelResult.success) {
                throw new Error(`Model execution failed: ${modelResult.errorMessage}`);
            }

            const rawOutput = modelResult.data?.choices?.[0]?.message?.content;
            if (!rawOutput) {
                throw new Error('No output received from model');
            }

            // Parse based on output type
            let parsedResult: any = rawOutput;
            
            switch (prompt.OutputType) {
                case 'string':
                    parsedResult = rawOutput.toString();
                    break;
                    
                case 'number':
                    parsedResult = parseFloat(rawOutput);
                    if (isNaN(parsedResult)) {
                        throw new Error(`Expected number output but got: ${rawOutput}`);
                    }
                    break;
                    
                case 'boolean':
                    const lowerOutput = rawOutput.toLowerCase().trim();
                    if (['true', 'yes', '1'].includes(lowerOutput)) {
                        parsedResult = true;
                    } else if (['false', 'no', '0'].includes(lowerOutput)) {
                        parsedResult = false;
                    } else {
                        throw new Error(`Expected boolean output but got: ${rawOutput}`);
                    }
                    break;
                    
                case 'date':
                    parsedResult = new Date(rawOutput);
                    if (isNaN(parsedResult.getTime())) {
                        throw new Error(`Expected date output but got: ${rawOutput}`);
                    }
                    break;
                    
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
        parsedResult: { result: any; validationResult?: ValidationResult },
        endTime: Date,
        executionTimeMS: number
    ): Promise<void> {
        try {
            promptRun.CompletedAt = endTime;
            promptRun.ExecutionTimeMS = executionTimeMS;
            promptRun.Result = typeof parsedResult.result === 'string' 
                ? parsedResult.result 
                : JSON.stringify(parsedResult.result);

            // Extract token usage if available
            if (modelResult.data?.usage) {
                promptRun.TokensUsed = modelResult.data.usage.totalTokens;
                promptRun.TokensPrompt = modelResult.data.usage.promptTokens;
                promptRun.TokensCompletion = modelResult.data.usage.completionTokens;
            }

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