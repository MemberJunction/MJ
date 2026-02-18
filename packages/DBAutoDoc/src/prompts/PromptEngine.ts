/**
 * Prompt execution engine combining Nunjucks templating with AI/Core
 */

import nunjucks from 'nunjucks';
import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { PromptFileLoader } from './PromptFileLoader.js';
import { AIConfig } from '../types/config.js';
import { PromptExecutionResult } from '../types/prompts.js';
import { createLLMInstance } from '../utils/llm-factory.js';
import { CleanAndParseJSON } from '@memberjunction/global';

export type GuardrailCheckFn = () => { canContinue: boolean; reason?: string };

export class PromptEngine {
  private nunjucksEnv: nunjucks.Environment;
  private llm: BaseLLM;
  private guardrailCheck?: GuardrailCheckFn;

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
   * Set guardrail checking callback
   * This will be called before every LLM execution to check if we should continue
   */
  public setGuardrailCheck(checkFn: GuardrailCheckFn): void {
    this.guardrailCheck = checkFn;
  }

  /**
   * Initialize the prompt loader
   */
  public async initialize(): Promise<void> {
    const env = this.nunjucksEnv as { loaders?: PromptFileLoader[] };
    const loader = env.loaders?.[0];
    if (loader) {
      await loader.loadAll();
    }
  }

  /**
   * Create appropriate LLM based on provider configuration
   * Uses MJ ClassFactory pattern for BaseLLM instantiation
   */
  private createLLM(): BaseLLM {
    // Use shared factory (DRY principle)
    return createLLMInstance(this.config.provider, this.config.apiKey);
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
          console.error(`[PromptEngine] FATAL: Template rendering failed for ${promptName}`);
          console.error(`[PromptEngine] Error:`, err.message);
          console.error(`[PromptEngine] Context keys:`, Object.keys(context));
          console.error(`[PromptEngine] Terminating process due to template rendering failure`);
          process.exit(1);
        }
        resolve(result || '');
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
      // Check guardrails before executing
      if (this.guardrailCheck) {
        const check = this.guardrailCheck();
        if (!check.canContinue) {
          return {
            success: false,
            errorMessage: `Guardrail limit exceeded: ${check.reason}`,
            tokensUsed: 0,
            guardrailExceeded: true
          };
        }
      }

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
        maxOutputTokens: options?.maxTokens ?? this.config.maxTokens,
        responseFormat: options?.responseFormat ?? 'JSON',
        ...(options?.temperature != null && { temperature: options.temperature }),
        ...(this.config.temperature != null && options?.temperature == null && { temperature: this.config.temperature }),
        ...(this.config.effortLevel != null && { effortLevel: this.config.effortLevel.toString() }) // Optional 1-100, BaseLLM drivers handle if supported
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
        // Use shared MJGlobal utility for JSON cleaning (handles markdown fences, double-escaping, etc.)
        const parsed = CleanAndParseJSON<T>(content, true);
        if (parsed === null) {
          return {
            success: false,
            errorMessage: `Failed to parse JSON response\n\nRaw content:\n${content}`,
            tokensUsed: usage?.totalTokens || 0,
            promptInput: renderedPrompt,
            promptOutput: content
          };
        }
        parsedResult = parsed;
      } else {
        parsedResult = content as unknown as T;
      }

      return {
        success: true,
        result: parsedResult,
        tokensUsed: usage?.totalTokens || 0,
        cost: usage?.cost,
        promptInput: renderedPrompt,
        promptOutput: content
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
      const paramsArray: ChatParams[] = renderedPrompts.map((prompt, i) => {
        const params: ChatParams = {
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          maxOutputTokens: requests[i].options?.maxTokens ?? this.config.maxTokens,
          responseFormat: requests[i].options?.responseFormat ?? 'JSON'
        };

        // Only add temperature if explicitly provided (don't default to 0.1)
        if (requests[i].options?.temperature != null) {
          params.temperature = requests[i].options!.temperature;
        } else if (this.config.temperature != null) {
          params.temperature = this.config.temperature;
        }

        return params;
      });

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

        // Use shared MJGlobal utility for JSON cleaning (handles markdown fences, double-escaping, etc.)
        const parsed = CleanAndParseJSON<T>(content, true);
        if (parsed === null) {
          return {
            success: false,
            errorMessage: `JSON parse error`,
            tokensUsed: usage?.totalTokens || 0
          };
        }
        return {
          success: true,
          result: parsed,
          tokensUsed: usage?.totalTokens || 0,
          cost: usage?.cost
        };
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
