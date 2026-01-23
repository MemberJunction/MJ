import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { AIPromptModelEntity } from '@memberjunction/core-entities';
import { ExecutionTask, ParallelizationStrategy } from './ParallelExecution';
import { ChatMessage } from '@memberjunction/ai';
import { AIModelEntityExtended, AIPromptEntityExtended, TemplateMessageRole } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { v4 as uuidv4 } from 'uuid';

/**
 * Plans and organizes execution tasks for AI prompts based on parallelization configuration.
 *
 * This class analyzes prompt configuration and creates execution plans that determine:
 * - Which models to use
 * - How many parallel executions to perform
 * - How to group executions for coordination
 * - Priority and ordering of tasks
 */
export class ExecutionPlanner {
  /**
   * Creates an execution plan for a prompt based on its parallelization configuration.
   *
   * Analyzes the prompt's ParallelizationMode and associated models to determine
   * the optimal execution strategy and task distribution.
   *
   * @param prompt - The AI prompt to create an execution plan for
   * @param promptModels - Associated model configurations for this prompt
   * @param allModels - All available AI models in the system
   * @param renderedPrompt - The rendered prompt text ready for execution
   * @param contextUser - User context for authentication and permissions
   * @param configurationId - Optional configuration ID for environment-specific behavior
   * @returns ExecutionTask[] - Array of execution tasks to be processed
   */
  public createExecutionPlan(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    renderedPrompt: string,
    contextUser?: UserInfo,
    configurationId?: string,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
  ): ExecutionTask[] {
    LogStatus(`Creating execution plan for prompt "${prompt.Name}" with parallelization mode: ${prompt.ParallelizationMode}`);

    const strategy = prompt.ParallelizationMode as ParallelizationStrategy;

    switch (strategy) {
      case 'None':
        return this.createSingleExecutionPlan(
          prompt,
          promptModels,
          allModels,
          renderedPrompt,
          contextUser,
          configurationId,
          conversationMessages,
          templateMessageRole,
        );

      case 'StaticCount':
        return this.createStaticCountPlan(
          prompt,
          promptModels,
          allModels,
          renderedPrompt,
          contextUser,
          configurationId,
          conversationMessages,
          templateMessageRole,
        );

      case 'ConfigParam':
        return this.createConfigParamPlan(
          prompt,
          promptModels,
          allModels,
          renderedPrompt,
          contextUser,
          configurationId,
          conversationMessages,
          templateMessageRole,
        );

      case 'ModelSpecific':
        return this.createModelSpecificPlan(
          prompt,
          promptModels,
          allModels,
          renderedPrompt,
          contextUser,
          configurationId,
          conversationMessages,
          templateMessageRole,
        );

      default:
        LogError(`Unknown parallelization strategy: ${strategy}, falling back to single execution`);
        return this.createSingleExecutionPlan(
          prompt,
          promptModels,
          allModels,
          renderedPrompt,
          contextUser,
          configurationId,
          conversationMessages,
          templateMessageRole,
        );
    }
  }

  /**
   * Creates a single execution task (no parallelization).
   *
   * Selects the best model based on prompt configuration and creates a single task.
   *
   * @param prompt - The AI prompt to execute
   * @param promptModels - Associated model configurations
   * @param allModels - All available models
   * @param renderedPrompt - Rendered prompt text
   * @param contextUser - User context
   * @param configurationId - Configuration ID
   * @returns ExecutionTask[] - Array containing single execution task
   */
  private createSingleExecutionPlan(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    renderedPrompt: string,
    contextUser?: UserInfo,
    configurationId?: string,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
  ): ExecutionTask[] {
    const selectedModel = this.selectBestModel(prompt, promptModels, allModels, configurationId);

    if (!selectedModel) {
      LogError(`No suitable model found for prompt "${prompt.Name}"`);
      return [];
    }

    const promptModel = promptModels.find((pm) => pm.ModelID === selectedModel.ID);
    const vendorInfo = this.selectVendorForModel(selectedModel);

    const task: ExecutionTask = {
      taskId: uuidv4(),
      prompt,
      model: selectedModel,
      promptModel,
      executionGroup: 0,
      priority: promptModel?.Priority || 0,
      renderedPrompt,
      contextUser,
      configurationId,
      modelParameters: this.parseModelParameters(promptModel?.ModelParameters),
      conversationMessages,
      templateMessageRole,
      vendorId: vendorInfo.vendorId,
      vendorDriverClass: vendorInfo.vendorDriverClass,
      vendorApiName: vendorInfo.vendorApiName,
    };

    LogStatus(`Created single execution plan with model: ${selectedModel.Name}`);
    return [task];
  }

  /**
   * Creates execution tasks based on a static count of parallel executions.
   *
   * Uses the ParallelCount field to determine how many parallel executions to create.
   *
   * @param prompt - The AI prompt to execute
   * @param promptModels - Associated model configurations
   * @param allModels - All available models
   * @param renderedPrompt - Rendered prompt text
   * @param contextUser - User context
   * @param configurationId - Configuration ID
   * @returns ExecutionTask[] - Array of execution tasks for parallel processing
   */
  private createStaticCountPlan(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    renderedPrompt: string,
    contextUser?: UserInfo,
    configurationId?: string,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
  ): ExecutionTask[] {
    const parallelCount = prompt.ParallelCount || 1;

    if (parallelCount <= 1) {
      LogStatus(`StaticCount parallelization with count ${parallelCount}, falling back to single execution`);
      return this.createSingleExecutionPlan(prompt, promptModels, allModels, renderedPrompt, contextUser, configurationId, conversationMessages, templateMessageRole);
    }

    const tasks: ExecutionTask[] = [];
    const availableModels = this.getAvailableModels(prompt, promptModels, allModels, configurationId);

    if (availableModels.length === 0) {
      LogError(`No suitable models found for prompt "${prompt.Name}"`);
      return [];
    }

    // Create tasks by cycling through available models
    for (let i = 0; i < parallelCount; i++) {
      const modelIndex = i % availableModels.length;
      const selectedModel = availableModels[modelIndex];
      const promptModel = promptModels.find((pm) => pm.ModelID === selectedModel.ID);

      const vendorInfo = this.selectVendorForModel(selectedModel);

      const task: ExecutionTask = {
        taskId: uuidv4(),
        prompt,
        model: selectedModel,
        promptModel,
        executionGroup: 0, // All in same group for true parallelization
        priority: promptModel?.Priority || 0,
        renderedPrompt,
        contextUser,
        configurationId,
        modelParameters: this.parseModelParameters(promptModel?.ModelParameters),
        conversationMessages,
        templateMessageRole,
        vendorId: vendorInfo.vendorId,
        vendorDriverClass: vendorInfo.vendorDriverClass,
        vendorApiName: vendorInfo.vendorApiName,
      };

      tasks.push(task);
    }

    LogStatus(`Created StaticCount execution plan with ${tasks.length} parallel tasks`);
    return tasks;
  }

  /**
   * Creates execution tasks based on a configuration parameter.
   *
   * Looks up the parallel count from a configuration parameter specified in ParallelConfigParam.
   *
   * @param prompt - The AI prompt to execute
   * @param promptModels - Associated model configurations
   * @param allModels - All available models
   * @param renderedPrompt - Rendered prompt text
   * @param contextUser - User context
   * @param configurationId - Configuration ID
   * @returns ExecutionTask[] - Array of execution tasks for parallel processing
   */
  private createConfigParamPlan(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    renderedPrompt: string,
    contextUser?: UserInfo,
    configurationId?: string,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
  ): ExecutionTask[] {
    const configParamName = prompt.ParallelConfigParam;

    if (!configParamName) {
      LogError(`ConfigParam parallelization specified but ParallelConfigParam is not set for prompt "${prompt.Name}"`);
      return this.createSingleExecutionPlan(prompt, promptModels, allModels, renderedPrompt, contextUser, configurationId, conversationMessages, templateMessageRole);
    }

    // Look up the configuration parameter to get the parallel count
    const parallelCount = this.getConfigurationParameter(configParamName, configurationId) || 1;

    LogStatus(`ConfigParam parallelization: ${configParamName} = ${parallelCount}`);

    // Create tasks using the resolved parallel count
    if (parallelCount <= 1) {
      return this.createSingleExecutionPlan(prompt, promptModels, allModels, renderedPrompt, contextUser, configurationId, conversationMessages, templateMessageRole);
    }

    const tasks: ExecutionTask[] = [];
    const availableModels = this.getAvailableModels(prompt, promptModels, allModels, configurationId);

    if (availableModels.length === 0) {
      LogError(`No suitable models found for prompt "${prompt.Name}"`);
      return [];
    }

    // Create tasks by cycling through available models
    for (let i = 0; i < parallelCount; i++) {
      const modelIndex = i % availableModels.length;
      const selectedModel = availableModels[modelIndex];
      const promptModel = promptModels.find((pm) => pm.ModelID === selectedModel.ID);

      const vendorInfo = this.selectVendorForModel(selectedModel);

      const task: ExecutionTask = {
        taskId: uuidv4(),
        prompt,
        model: selectedModel,
        promptModel,
        executionGroup: 0, // All in same group for true parallelization
        priority: promptModel?.Priority || 0,
        renderedPrompt,
        contextUser,
        configurationId,
        modelParameters: this.parseModelParameters(promptModel?.ModelParameters),
        conversationMessages,
        templateMessageRole,
        vendorId: vendorInfo.vendorId,
        vendorDriverClass: vendorInfo.vendorDriverClass,
        vendorApiName: vendorInfo.vendorApiName,
      };

      tasks.push(task);
    }

    LogStatus(`Created ConfigParam execution plan with ${tasks.length} parallel tasks`);
    return tasks;
  }

  /**
   * Creates execution tasks based on model-specific parallelization settings.
   *
   * Uses individual AIPromptModel configurations to determine execution groups and parallel counts.
   *
   * @param prompt - The AI prompt to execute
   * @param promptModels - Associated model configurations
   * @param allModels - All available models
   * @param renderedPrompt - Rendered prompt text
   * @param contextUser - User context
   * @param configurationId - Configuration ID
   * @returns ExecutionTask[] - Array of execution tasks organized by execution groups
   */
  private createModelSpecificPlan(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    renderedPrompt: string,
    contextUser?: UserInfo,
    configurationId?: string,
    conversationMessages?: ChatMessage[],
    templateMessageRole: TemplateMessageRole = 'system',
  ): ExecutionTask[] {
    const tasks: ExecutionTask[] = [];
    const activePromptModels = promptModels.filter((pm) => pm.Status === 'Active' || pm.Status === 'Preview');

    if (activePromptModels.length === 0) {
      LogError(`No active prompt models found for ModelSpecific parallelization of prompt "${prompt.Name}"`);
      return this.createSingleExecutionPlan(prompt, promptModels, allModels, renderedPrompt, contextUser, configurationId, conversationMessages, templateMessageRole);
    }

    // Create tasks based on each prompt model's configuration
    for (const promptModel of activePromptModels) {
      const model = allModels.find((m) => m.ID === promptModel.ModelID && m.IsActive);

      if (!model) {
        LogError(`Model ${promptModel.ModelID} not found or inactive for prompt "${prompt.Name}"`);
        continue;
      }

      const parallelCount = this.getModelParallelCount(promptModel);

      // Create multiple tasks for this model if parallel count > 1
      for (let i = 0; i < parallelCount; i++) {
        const vendorInfo = this.selectVendorForModel(model);

        const task: ExecutionTask = {
          taskId: uuidv4(),
          prompt,
          model,
          promptModel,
          executionGroup: promptModel.ExecutionGroup,
          priority: promptModel.Priority,
          renderedPrompt,
          contextUser,
          configurationId,
          modelParameters: this.parseModelParameters(promptModel.ModelParameters),
          conversationMessages,
          templateMessageRole,
          vendorId: vendorInfo.vendorId,
          vendorDriverClass: vendorInfo.vendorDriverClass,
          vendorApiName: vendorInfo.vendorApiName,
        };

        tasks.push(task);
      }
    }

    LogStatus(`Created ModelSpecific execution plan with ${tasks.length} tasks across ${new Set(tasks.map((t) => t.executionGroup)).size} execution groups`);
    return tasks;
  }

  /**
   * Selects the best model based on prompt configuration and available models.
   *
   * @param prompt - The AI prompt requiring a model
   * @param promptModels - Associated model configurations
   * @param allModels - All available models
   * @param configurationId - Configuration ID
   * @returns AIModelEntityExtended | null - The selected model or null if none suitable
   */
  private selectBestModel(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    configurationId?: string,
  ): AIModelEntityExtended | null {
    // First try to use prompt-specific models
    const availablePromptModels = promptModels.filter(
      (pm) => (pm.Status === 'Active' || pm.Status === 'Preview') && (!configurationId || !pm.ConfigurationID || pm.ConfigurationID === configurationId),
    );

    if (availablePromptModels.length > 0) {
      // Sort by priority and return the highest priority model
      availablePromptModels.sort((a, b) => b.Priority - a.Priority);
      const selectedPromptModel = availablePromptModels[0];

      const model = allModels.find((m) => m.ID === selectedPromptModel.ModelID && m.IsActive);
      if (model) {
        return model;
      }
    }

    // Fall back to automatic model selection
    const candidateModels = allModels.filter(
      (m) => m.IsActive && m.PowerRank >= (prompt.MinPowerRank || 0) && (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID),
    );

    if (candidateModels.length === 0) {
      return null;
    }

    // Sort by power preference
    switch (prompt.PowerPreference) {
      case 'Highest':
        candidateModels.sort((a, b) => b.PowerRank - a.PowerRank);
        break;
      case 'Lowest':
        candidateModels.sort((a, b) => a.PowerRank - b.PowerRank);
        break;
      case 'Balanced':
      default:
        candidateModels.sort((a, b) => b.PowerRank - a.PowerRank);
        break;
    }

    return candidateModels[0];
  }

  /**
   * Gets all available models for a prompt considering configuration constraints.
   *
   * @param prompt - The AI prompt
   * @param promptModels - Associated model configurations
   * @param allModels - All available models
   * @param configurationId - Configuration ID
   * @returns AIModelEntityExtended[] - Array of suitable models
   */
  private getAvailableModels(
    prompt: AIPromptEntityExtended,
    promptModels: AIPromptModelEntity[],
    allModels: AIModelEntityExtended[],
    configurationId?: string,
  ): AIModelEntityExtended[] {
    const availablePromptModels = promptModels.filter(
      (pm) => (pm.Status === 'Active' || pm.Status === 'Preview') && (!configurationId || !pm.ConfigurationID || pm.ConfigurationID === configurationId),
    );

    if (availablePromptModels.length > 0) {
      // Use prompt-specific models
      const models = availablePromptModels
        .map((pm) => allModels.find((m) => m.ID === pm.ModelID && m.IsActive))
        .filter((m) => m !== undefined) as AIModelEntityExtended[];

      // Sort by priority from prompt models
      models.sort((a, b) => {
        const aPriority = availablePromptModels.find((pm) => pm.ModelID === a.ID)?.Priority || 0;
        const bPriority = availablePromptModels.find((pm) => pm.ModelID === b.ID)?.Priority || 0;
        return bPriority - aPriority;
      });

      return models;
    }

    // Fall back to all suitable models
    return allModels.filter(
      (m) => m.IsActive && m.PowerRank >= (prompt.MinPowerRank || 0) && (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID),
    );
  }

  /**
   * Determines the parallel count for a specific model configuration.
   *
   * @param promptModel - The prompt model configuration
   * @returns number - Number of parallel executions for this model
   */
  private getModelParallelCount(promptModel: AIPromptModelEntity): number {
    switch (promptModel.ParallelizationMode) {
      case 'StaticCount':
        return promptModel.ParallelCount || 1;

      case 'ConfigParam': {
        const configValue = this.getConfigurationParameter(promptModel.ParallelConfigParam, promptModel.ConfigurationID);
        return configValue || 1;
      }

      case 'None':
      default:
        return 1;
    }
  }

  /**
   * Looks up a configuration parameter value.
   *
   * @param paramName - Name of the configuration parameter
   * @param configurationId - Configuration context ID
   * @returns number | null - The parameter value or null if not found
   */
  private getConfigurationParameter(paramName: string | null, configurationId: string | null): number | null {
    if (!paramName) {
      return null;
    }

    if (!configurationId) {
      LogStatus(`No configuration ID provided for parameter lookup: ${paramName}`);
      return null;
    }

    try {
      const aiEngine = AIEngineBase.Instance;
      const configParam = aiEngine.GetConfigurationParam(configurationId, paramName);
      
      if (!configParam) {
        LogStatus(`Configuration parameter "${paramName}" not found in configuration "${configurationId}"`);
        return null;
      }

      // Parse the value based on the Type
      let value: number | null = null;
      
      switch (configParam.Type) {
        case 'number':
          value = parseFloat(configParam.Value);
          if (isNaN(value)) {
            LogError(`Failed to parse number value for configuration parameter "${paramName}": ${configParam.Value}`);
            return null;
          }
          break;
          
        case 'string':
          // Try to parse string as number
          value = parseFloat(configParam.Value);
          if (isNaN(value)) {
            LogError(`Configuration parameter "${paramName}" is a string but expected a number: ${configParam.Value}`);
            return null;
          }
          break;
          
        default:
          LogError(`Unsupported data type for parallel count configuration parameter "${paramName}": ${configParam.Type}`);
          return null;
      }

      LogStatus(`Retrieved configuration parameter "${paramName}" = ${value} from configuration "${configurationId}"`);
      return value;
      
    } catch (error) {
      LogError(`Error retrieving configuration parameter "${paramName}": ${error.message}`);
      return null;
    }
  }

  /**
   * Parses model parameters from JSON string.
   *
   * @param modelParametersJson - JSON string containing model parameters
   * @returns Record<string, any> | undefined - Parsed parameters or undefined
   */
  private parseModelParameters(modelParametersJson: string | null | undefined): Record<string, unknown> | undefined {
    if (!modelParametersJson) {
      return undefined;
    }

    try {
      return JSON.parse(modelParametersJson);
    } catch (error) {
      LogError(`Failed to parse model parameters JSON: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Selects vendor information for a model, preferring inference providers
   */
  private selectVendorForModel(model: AIModelEntityExtended): { vendorId?: string; vendorDriverClass?: string; vendorApiName?: string } {
    // Find the inference provider type from vendor type definitions
    const inferenceProviderType = AIEngine.Instance.VendorTypeDefinitions.find(
      vt => vt.Name === 'Inference Provider'
    );
    
    if (!inferenceProviderType) {
      // Fallback to model defaults if we can't find the inference provider type
      return {
        vendorDriverClass: model.DriverClass,
        vendorApiName: model.APIName
      };
    }

    // Get active model vendors for this model that are inference providers
    const modelVendors = AIEngine.Instance.ModelVendors
      .filter(mv => 
        mv.ModelID === model.ID && 
        mv.Status === 'Active' && 
        mv.TypeID === inferenceProviderType.ID
      )
      .sort((a, b) => b.Priority - a.Priority);

    if (modelVendors.length === 0) {
      // No vendors found, use model defaults
      return {
        vendorDriverClass: model.DriverClass,
        vendorApiName: model.APIName
      };
    }

    // Use the highest priority vendor
    const selectedVendor = modelVendors[0];

    return {
      vendorId: selectedVendor.VendorID,
      vendorDriverClass: selectedVendor.DriverClass || model.DriverClass,
      vendorApiName: selectedVendor.APIName || model.APIName
    };
  }
}
