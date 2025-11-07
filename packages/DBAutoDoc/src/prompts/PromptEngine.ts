/**
 * Prompt execution engine combining Nunjucks templating with AI/Core
 */

import * as nunjucks from 'nunjucks';
import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { OpenAILLM } from '@memberjunction/ai-openai';
import { AnthropicLLM } from '@memberjunction/ai-anthropic';
import { GroqLLM } from '@memberjunction/ai-groq';
import { PromptFileLoader } from './PromptFileLoader.js';
import { AIConfig } from '../types/config.js';
import { PromptExecutionResult } from '../types/prompts.js';

export class PromptEngine {
  private nunjucksEnv: nunjucks.Environment;
  private llm: BaseLLM;

  constructor(
    private config: AIConfig,
    promptsDir: string
  ) {
    // Initialize Nunjucks with custom loader
    const loader = new PromptFileLoader(promptsDir);
    this.nunjucksEnv = new nunjucks.Environment(loader, {
      autoescape: false,
      dev: true
    });

    // Add custom filters
    this.addCustomFilters();

    // Initialize AI/Core LLM
    this.llm = this.createLLM();
  }

  /**
   * Initialize the prompt loader
   */
  public async initialize(): Promise<void> {
    const loader = this.nunjucksEnv.loaders[0] as PromptFileLoader;
    await loader.loadAll();
  }

  /**
   * Create appropriate LLM based on provider configuration
   */
  private createLLM(): BaseLLM {
    const { provider, apiKey } = this.config;

    switch (provider) {
      case 'openai':
        return new OpenAILLM(apiKey);
      case 'anthropic':
        return new AnthropicLLM(apiKey);
      case 'groq':
        return new GroqLLM(apiKey);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  /**
   * Add custom Nunjucks filters
   * Pattern from Templates package
   */
  private addCustomFilters(): void {
    // JSON formatting with indentation
    this.nunjucksEnv.addFilter('json', (obj: any, indent: number = 2) => {
      try {
        return JSON.stringify(obj, null, indent);
      } catch (error) {
        return `[Error serializing to JSON: ${(error as Error).message}]`;
      }
    });

    // Compact JSON
    this.nunjucksEnv.addFilter('jsoninline', (obj: any) => {
      try {
        return JSON.stringify(obj);
      } catch (error) {
        return `[Error serializing to JSON: ${(error as Error).message}]`;
      }
    });

    // Parse JSON strings
    this.nunjucksEnv.addFilter('jsonparse', (str: string) => {
      try {
        return JSON.parse(str);
      } catch (error) {
        return str;
      }
    });

    // Array join filter
    this.nunjucksEnv.addFilter('join', (arr: any[], separator: string = ', ') => {
      return Array.isArray(arr) ? arr.join(separator) : arr;
    });
  }

  /**
   * Render a Nunjucks template with context
   * Pattern from Templates.renderTemplateAsync()
   */
  private async renderTemplate(promptName: string, context: any): Promise<string> {
    return new Promise((resolve, reject) => {
      this.nunjucksEnv.render(promptName, context, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result || '');
        }
      });
    });
  }

  /**
   * Execute a prompt with AI/Core
   * Main entry point for DBAutoDoc analysis
   */
  public async executePrompt<T>(
    promptName: string,
    context: any,
    options?: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'JSON' | 'Text';
    }
  ): Promise<PromptExecutionResult<T>> {
    try {
      // 1. Render Nunjucks template with context
      const renderedPrompt = await this.renderTemplate(promptName, context);

      // 2. Build ChatParams for AI/Core
      const messages = [];

      // Add system prompt if provided
      if (options?.systemPrompt) {
        messages.push({
          role: 'system' as const,
          content: options.systemPrompt
        });
      }

      // Add rendered user prompt
      messages.push({
        role: 'user' as const,
        content: renderedPrompt
      });

      const params: ChatParams = {
        model: this.config.model,
        messages,
        temperature: options?.temperature ?? this.config.temperature ?? 0.1,
        maxOutputTokens: options?.maxTokens ?? this.config.maxTokens,
        responseFormat: options?.responseFormat ?? 'JSON'
      };

      // 3. Execute with AI/Core (follows RunView pattern - doesn't throw)
      const chatResult: ChatResult = await this.llm.ChatCompletion(params);

      // 4. Check success (IMPORTANT: like RunView, check .success property)
      if (!chatResult.success) {
        return {
          success: false,
          errorMessage: chatResult.errorMessage || 'Unknown error',
          tokensUsed: 0
        };
      }

      // 5. Extract result and parse JSON if needed
      const content = chatResult.data.choices[0].message.content;
      const usage = chatResult.data.usage;

      let parsedResult: T;
      if (options?.responseFormat === 'JSON') {
        try {
          parsedResult = JSON.parse(content) as T;
        } catch (parseError) {
          return {
            success: false,
            errorMessage: `Failed to parse JSON response: ${(parseError as Error).message}\n\nRaw content:\n${content}`,
            tokensUsed: usage.totalTokens
          };
        }
      } else {
        parsedResult = content as unknown as T;
      }

      return {
        success: true,
        result: parsedResult,
        tokensUsed: usage.totalTokens,
        cost: usage.cost
      };

    } catch (error) {
      return {
        success: false,
        errorMessage: `Prompt execution failed: ${(error as Error).message}`,
        tokensUsed: 0
      };
    }
  }

  /**
   * Execute multiple prompts in parallel
   * Uses AI/Core's ChatCompletions for efficiency
   */
  public async executePromptsParallel<T>(
    requests: Array<{
      promptName: string;
      context: any;
      options?: {
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
        responseFormat?: 'JSON' | 'Text';
      };
    }>
  ): Promise<Array<PromptExecutionResult<T>>> {
    try {
      // Render all templates first
      const renderedPrompts = await Promise.all(
        requests.map(req => this.renderTemplate(req.promptName, req.context))
      );

      // Build ChatParams array
      const paramsArray: ChatParams[] = renderedPrompts.map((prompt, i) => ({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: requests[i].options?.temperature ?? this.config.temperature ?? 0.1,
        maxOutputTokens: requests[i].options?.maxTokens ?? this.config.maxTokens,
        responseFormat: requests[i].options?.responseFormat ?? 'JSON'
      }));

      // Execute in parallel using AI/Core
      const results = await this.llm.ChatCompletions(paramsArray);

      // Parse and return
      return results.map((chatResult, i) => {
        if (!chatResult.success) {
          return {
            success: false,
            errorMessage: chatResult.errorMessage,
            tokensUsed: 0
          };
        }

        const content = chatResult.data.choices[0].message.content;
        const usage = chatResult.data.usage;

        try {
          const parsed = JSON.parse(content) as T;
          return {
            success: true,
            result: parsed,
            tokensUsed: usage.totalTokens,
            cost: usage.cost
          };
        } catch (error) {
          return {
            success: false,
            errorMessage: `JSON parse error: ${(error as Error).message}`,
            tokensUsed: usage.totalTokens
          };
        }
      });
    } catch (error) {
      // If rendering or execution fails completely, return array of errors
      return requests.map(() => ({
        success: false,
        errorMessage: `Parallel execution failed: ${(error as Error).message}`,
        tokensUsed: 0
      }));
    }
  }
}
