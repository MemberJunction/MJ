import { UserInfo, Metadata } from '@memberjunction/core';
import { MJAIModelEntity } from '@memberjunction/core-entities';
import { ExecutionLogger } from '../lib/execution-logger';
import { initializeMJProvider } from '../lib/mj-provider';
import { ExecutionResult } from '../lib/output-formatter';

export interface PromptExecutionOptions {
  verbose?: boolean;
  timeout?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  configurationId?: string;
}

export interface PromptInfo {
  name: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class PromptService {
  private initialized = false;
  private contextUser?: UserInfo;
  private metadata?: Metadata;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await initializeMJProvider();
      this.metadata = new Metadata();
      this.contextUser = await this.getContextUser();
      this.initialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize Prompt Service: ${error?.message || 'Unknown error'}`);
    }
  }

  async listPrompts(): Promise<PromptInfo[]> {
    await this.ensureInitialized();

    try {
      // For now, return a simple list indicating prompts can be run dynamically
      // In the future, this could list saved prompts from the database
      return [
        {
          name: 'Direct Prompt Execution',
          model: 'Default model from configuration',
          temperature: 0.7,
          maxTokens: 4000
        }
      ];
    } catch (error: any) {
      throw new Error(`Failed to list prompts: ${error?.message || 'Unknown error'}`);
    }
  }

  async executePrompt(
    prompt: string,
    options: PromptExecutionOptions = {}
  ): Promise<ExecutionResult> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const logger = new ExecutionLogger('prompts:run', 'Direct Prompt', undefined, prompt);

    try {
      logger.logStep('INFO', 'SYSTEM', 'Initializing prompt runner', {
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });

      // For direct prompt execution, we'll use the AI module directly
      const aiModule = await import('@memberjunction/ai');
      const AIEngine = (aiModule as any).AIEngine;
      
      // Build the messages array
      const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];
      
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });

      logger.logStep('INFO', 'AI_MODEL', 'Executing prompt', {
        messageCount: messages.length,
        promptLength: prompt.length
      });

      // Get the LLM instance
      const llm = AIEngine.Instance.LLM;
      
      // Execute the prompt using the LLM directly
      const result = await llm.ChatCompletion({
        messages,
        model: options.model,
        temperature: options.temperature,
        max_tokens: options.maxTokens
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        logger.logStep('SUCCESS', 'AI_MODEL', 'Prompt execution completed', {
          modelUsed: result.model,
          tokensUsed: result.usage?.total_tokens,
          duration
        });

        const executionResult: ExecutionResult = {
          success: true,
          entityName: 'Direct Prompt',
          prompt,
          result: result.result,
          duration,
          executionId: logger.getExecutionId(),
          logFilePath: logger.getLogFilePath()
        };

        // Include model and usage info in the result
        executionResult.result = {
          response: result.data,
          modelSelection: {
            modelUsed: result.model,
            vendorUsed: 'OpenAI', // Default for now
            configurationUsed: options.configurationId
          },
          usage: result.usage
        };

        logger.finalize('SUCCESS', executionResult.result);
        return executionResult;

      } else {
        const errorMessage = result.errorMessage || 'Unknown execution error';
        logger.logError(errorMessage, 'AI_MODEL');

        const executionResult: ExecutionResult = {
          success: false,
          entityName: 'Direct Prompt',
          prompt,
          error: errorMessage,
          duration,
          executionId: logger.getExecutionId(),
          logFilePath: logger.getLogFilePath()
        };

        logger.finalize('FAILED', undefined, errorMessage);
        return executionResult;
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || 'Unknown error';
      
      logger.logError(error, 'SYSTEM');

      const executionResult: ExecutionResult = {
        success: false,
        entityName: 'Direct Prompt',
        prompt,
        error: errorMessage,
        duration,
        executionId: logger.getExecutionId(),
        logFilePath: logger.getLogFilePath()
      };

      logger.finalize('FAILED', undefined, errorMessage);

      // If it's already a formatted error, re-throw as is
      if (errorMessage.startsWith('❌')) {
        throw error;
      } else {
        throw new Error(`❌ Prompt execution failed

Problem: ${errorMessage}
Context: Executing direct prompt with AI model

Next steps:
1. Check that AI models are configured and available
2. Verify database connection is working
3. Try with a simpler prompt to test basic functionality
4. Check execution logs for detailed error information

Log file: ${logger.getLogFilePath()}`);
      }
    }
  }

  async listAvailableModels(): Promise<Array<{name: string, vendor: string, description?: string}>> {
    await this.ensureInitialized();

    try {
      const aiModule = await import('@memberjunction/ai');
      const AIEngine = (aiModule as any).AIEngine;
      const models = AIEngine.Instance.Models;
      
      return models.map((model: MJAIModelEntity) => ({
        name: model.Name,
        vendor: model.Vendor,
        description: model.Description
      }));
    } catch (error: any) {
      throw new Error(`Failed to list available models: ${error?.message || 'Unknown error'}`);
    }
  }

  private async getContextUser(): Promise<UserInfo> {
    const { UserCache } = await import('@memberjunction/sqlserver-dataprovider');
    
    if (!UserCache.Users || UserCache.Users.length === 0) {
      throw new Error(`❌ No users found in UserCache

Problem: UserCache is empty or not properly initialized
Likely cause: Database connection or UserCache refresh issue

Next steps:
1. Verify database connection is working
2. Check that Users table has data
3. Ensure UserCache.Refresh() was called during initialization

This is typically a configuration or database setup issue.`);
    }

    // For CLI usage, we'll use the first available user
    const user = UserCache.Users[0];
    
    if (!user) {
      throw new Error('No valid user found for execution context');
    }

    return user;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}