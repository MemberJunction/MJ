import { LogError, LogStatus, UserInfo, Metadata } from '@memberjunction/core';
import { AIAgentEntityExtended, AIPromptEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';
import { ChatMessage } from '@memberjunction/ai';
import { MJGlobal, RegisterClass } from '@memberjunction/global';

/**
 * Input parameters for agent execution.
 */
export interface AgentExecutionParams {
  /** User context for authentication, permissions, and personalization */
  contextUser?: UserInfo;
  /** Data context passed to prompts and templates during execution */
  data?: Record<string, unknown>;
  /** Existing conversation messages for multi-turn conversations */
  conversationMessages?: ChatMessage[];
  /** Cancellation token to abort execution gracefully */
  cancellationToken?: AbortSignal;
  /** Callback for receiving real-time progress updates during execution */
  onProgress?: (progress: AgentProgressUpdate) => void;
  /** Callback for receiving streaming content as it's generated */
  onStreaming?: (chunk: AgentStreamingUpdate) => void;
}

/**
 * Progress update information during agent execution
 */
export interface AgentProgressUpdate {
  /** Current step in the agent execution process */
  step: 'initialization' | 'prompt_execution' | 'completion';
  /** Progress percentage (0-100) */
  percentage: number;
  /** Human-readable status message */
  message: string;
  /** Additional metadata about the current step */
  metadata?: Record<string, unknown>;
}

/**
 * Streaming content update during agent execution
 */
export interface AgentStreamingUpdate {
  /** The content chunk received */
  content: string;
  /** Whether this is the final chunk */
  isComplete: boolean;
  /** Which agent is producing this content */
  sourceId?: string;
  /** Source name producing this content */
  sourceName?: string;
}

/**
 * Result of an AI agent execution.
 * 
 * Contains the final outcome, decision history, and comprehensive metadata from
 * the agent's autonomous execution process.
 * 
 * @public
 * @see {@link AgentExecutionParams} for the corresponding input structure
 */
export interface AgentExecutionResult {
  /** Whether the agent execution completed successfully */
  success: boolean;
  /** The main result content (final response or computed value) */
  result?: unknown;
  /** Error message if the execution failed */
  errorMessage?: string;
  /** Total execution time in milliseconds */
  executionTimeMS?: number;
  /** Additional metadata about the execution process */
  metadata?: Record<string, unknown>;
  /** Whether the execution was cancelled by the user */
  cancelled?: boolean;
  /** All conversation messages generated during execution */
  conversationMessages?: ChatMessage[];
}

// Forward declaration to avoid circular dependency
export interface IAgentFactory {
  CreateAgentFromEntity(agentEntity: AIAgentEntityExtended, key?: string, ...additionalParams: any[]): BaseAgent;
  CreateAgent(agentName: string, key?: string, contextUser?: UserInfo, ...additionalParams: any[]): Promise<BaseAgent>
}

/**
 * Simplified AI Agent that focuses solely on executing its specific prompt/task.
 * 
 * This simplified version removes all the complex orchestration logic and decision-making,
 * focusing only on:
 * - Loading and executing the agent's specific prompts
 * - Processing input data and conversation context
 * - Returning results in a standardized format
 * 
 * Orchestration and decision-making are handled by separate classes (ConductorAgent, AgentRunner).
 * 
 * ## Key Features
 * - **Single Responsibility**: Execute agent-specific prompts only
 * - **Metadata-driven configuration** using AIAgentEntity
 * - **Template rendering** with data context
 * - **Conversation support** for multi-turn interactions
 * - **Progress monitoring** and streaming response support
 * - **Context compression** for long conversations
 * 
 * @example Basic Agent Execution
 * ```typescript
 * const agent = new BaseAgent(agentEntity, factory, contextUser);
 * const result = await agent.Execute({
 *   data: { query: "Analyze this data" },
 *   conversationMessages: []
 * });
 * ```
 */
@RegisterClass(BaseAgent, null)
export class BaseAgent {
  private _agent: AIAgentEntityExtended;
  private _factory: IAgentFactory;
  private _promptRunner: AIPromptRunner;
  private _contextUser?: UserInfo;
  protected _metadata: Metadata;

  /**
   * Creates a new BaseAgent instance for executing a specific agent.
   * 
   * @param agent - The agent entity definition
   * @param factory - Factory for creating additional agent instances
   * @param contextUser - User context for authentication and permissions
   * @param promptRunner - Optional prompt runner instance
   */
  constructor(agent: AIAgentEntityExtended, factory: IAgentFactory, contextUser: UserInfo, promptRunner?: AIPromptRunner) {
    this._agent = agent;
    this._factory = factory;
    this._promptRunner = promptRunner ? promptRunner : new AIPromptRunner();
    this._contextUser = contextUser;
    this._metadata = new Metadata();
  }
  
  public get agent(): AIAgentEntityExtended {
    return this._agent;
  }
  
  // Protected getters for subclasses to access private fields
  protected get factory(): IAgentFactory {
    return this._factory;
  }

  protected get promptRunner(): AIPromptRunner {
    return this._promptRunner;
  }

  protected get contextUser(): UserInfo {
    return this._contextUser;
  }

  /**
   * Executes the agent's specific prompts and returns the result.
   * 
   * This simplified execution focuses only on:
   * 1. Loading agent-specific prompts
   * 2. Processing conversation context (compression if needed)
   * 3. Executing prompts with provided data
   * 4. Returning structured results
   * 
   * @param params - Execution parameters including context, data, and callbacks
   * @returns Promise resolving to the execution result
   */
  public async Execute(params: AgentExecutionParams): Promise<AgentExecutionResult> {
    const startTime = new Date();
    
    try {
      // Report initialization progress
      this.sendProgress(params.onProgress, {
        step: 'initialization',
        percentage: 10,
        message: `Initializing agent '${this.agent.Name}'`,
        metadata: { agentName: this.agent.Name, agentId: this.agent.ID }
      });

      // Check for cancellation
      if (params.cancellationToken?.aborted) {
        return this.createCancelledResult(startTime);
      }

      // Initialize conversation messages
      let conversationMessages = [...(params.conversationMessages || [])];

      // Apply context compression if configured
      if (this.agent.EnableContextCompression && 
          this.agent.ContextCompressionMessageThreshold &&
          conversationMessages.length > this.agent.ContextCompressionMessageThreshold) {
        
        conversationMessages = await this.compressContext(conversationMessages, params);
      }

      // Check for cancellation
      if (params.cancellationToken?.aborted) {
        return this.createCancelledResult(startTime);
      }

      // Report prompt execution progress
      this.sendProgress(params.onProgress, {
        step: 'prompt_execution',
        percentage: 30,
        message: 'Executing agent prompts',
        metadata: { promptCount: await this.getPromptCount() }
      });

      // Execute agent prompts
      const promptResult = await this.executeAgentPrompts(params, conversationMessages);

      // Check for cancellation
      if (params.cancellationToken?.aborted) {
        return this.createCancelledResult(startTime);
      }

      // Calculate final execution time
      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();

      // Report completion
      this.sendProgress(params.onProgress, {
        step: 'completion',
        percentage: 100,
        message: `Agent '${this.agent.Name}' execution completed`,
        metadata: { 
          success: promptResult.success,
          executionTimeMS
        }
      });

      return {
        success: promptResult.success,
        result: promptResult.result,
        errorMessage: promptResult.errorMessage,
        executionTimeMS,
        conversationMessages: promptResult.conversationMessages || conversationMessages,
        metadata: {
          agentName: this.agent.Name,
          agentId: this.agent.ID,
          promptExecutions: promptResult.promptExecutions || 1
        }
      };

    } catch (error) {
      LogError(`Error executing agent '${this.agent?.Name || 'Unknown'}': ${error.message}`);
      
      const endTime = new Date();
      return {
        success: false,
        errorMessage: error.message,
        executionTimeMS: endTime.getTime() - startTime.getTime(),
        cancelled: params.cancellationToken?.aborted || false
      };
    }
  }

  /**
   * Executes all agent-specific prompts in order.
   */
  private async executeAgentPrompts(
    params: AgentExecutionParams, 
    conversationMessages: ChatMessage[]
  ): Promise<{
    success: boolean;
    result?: unknown;
    errorMessage?: string;
    conversationMessages?: ChatMessage[];
    promptExecutions?: number;
  }> {
    try {
      // Load agent prompts
      const prompts = await this.loadAgentPrompts();
      
      if (prompts.length === 0) {
        throw new Error(`No active prompts found for agent '${this.agent.Name}'`);
      }

      let currentMessages = [...conversationMessages];
      let finalResult: unknown = null;
      let promptExecutions = 0;

      // Execute each prompt in order
      for (const prompt of prompts) {
        // Check for cancellation before each prompt
        if (params.cancellationToken?.aborted) {
          return {
            success: false,
            errorMessage: 'Execution cancelled',
            conversationMessages: currentMessages,
            promptExecutions
          };
        }

        // Prepare prompt parameters
        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.data = params.data || {};
        promptParams.conversationMessages = currentMessages;
        promptParams.contextUser = params.contextUser;

        // Execute the prompt
        const promptResult = await this._promptRunner.ExecutePrompt(promptParams);
        promptExecutions++;

        if (!promptResult.success) {
          return {
            success: false,
            errorMessage: `Prompt execution failed: ${promptResult.errorMessage}`,
            conversationMessages: currentMessages,
            promptExecutions
          };
        }

        // Update conversation with result
        if (promptResult.rawResult) {
          currentMessages.push({
            role: 'assistant',
            content: promptResult.rawResult
          });
          finalResult = promptResult.rawResult;
        }

        // Handle streaming if callback provided
        if (params.onStreaming && promptResult.rawResult) {
          params.onStreaming({
            content: promptResult.rawResult,
            isComplete: false,
            sourceId: this.agent.ID,
            sourceName: this.agent.Name
          });
        }
      }

      // Send final streaming update
      if (params.onStreaming) {
        params.onStreaming({
          content: '',
          isComplete: true,
          sourceId: this.agent.ID,
          sourceName: this.agent.Name
        });
      }

      return {
        success: true,
        result: finalResult,
        conversationMessages: currentMessages,
        promptExecutions
      };

    } catch (error) {
      LogError(`Error executing agent prompts for '${this.agent.Name}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message
      };
    }
  }

  /**
   * Loads the prompts associated with this agent.
   */
  protected async loadAgentPrompts(): Promise<AIPromptEntity[]> {
    try {
      // Get agent prompts ordered by execution order
      await AIEngine.Instance.Config(false, this.contextUser);
      const agentPrompts = AIEngine.Instance.AgentPrompts
        .filter(ap => ap.AgentID === this.agent.ID && ap.Status === 'Active')
        .sort((a, b) => (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0));

      const results: AIPromptEntity[] = [];

      for (const agentPrompt of agentPrompts) {
        const prompt = AIEngine.Instance.Prompts.find(p => p.ID === agentPrompt.PromptID);
        if (prompt && prompt.Status === 'Active') {
          results.push(prompt);
        }
      }

      if (results.length === 0) {
        LogStatus(`No active prompts found for agent '${this.agent.Name}'`);
      }

      return results;
    } catch (error) {
      LogError(`Error loading agent prompts for '${this.agent.Name}': ${error.message}`);
      return [];
    }
  }

  /**
   * Gets the count of prompts for progress reporting.
   */
  private async getPromptCount(): Promise<number> {
    const prompts = await this.loadAgentPrompts();
    return prompts.length;
  }

  /**
   * Compresses conversation context using the configured compression prompt.
   */
  private async compressContext(
    conversationMessages: ChatMessage[], 
    params: AgentExecutionParams
  ): Promise<ChatMessage[]> {
    try {
      if (!this.agent.ContextCompressionPromptID) {
        LogStatus(`Context compression enabled but no compression prompt configured for agent '${this.agent.Name}'`);
        return conversationMessages;
      }

      const retentionCount = this.agent.ContextCompressionMessageRetentionCount || 5;
      const messagesToCompress = conversationMessages.slice(0, -retentionCount);
      const messagesToKeep = conversationMessages.slice(-retentionCount);

      if (messagesToCompress.length === 0) {
        return conversationMessages;
      }

      // Load compression prompt
      const compressionPrompt = AIEngine.Instance.Prompts.find(p => p.ID === this.agent.ContextCompressionPromptID);
      if (!compressionPrompt) {
        LogError(`Compression prompt not found: ${this.agent.ContextCompressionPromptID}`);
        return conversationMessages;
      }

      // Execute compression prompt
      const compressionParams = new AIPromptParams();
      compressionParams.prompt = compressionPrompt;
      compressionParams.data = {
        messages: messagesToCompress,
        messageCount: messagesToCompress.length,
        ...(params.data || {})
      };
      compressionParams.contextUser = params.contextUser;

      const compressionResult = await this.promptRunner.ExecutePrompt(compressionParams);

      if (compressionResult.success && compressionResult.rawResult) {
        // Replace compressed messages with summary
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary] ${compressionResult.rawResult}`
        };

        LogStatus(`Compressed ${messagesToCompress.length} messages into summary for agent '${this.agent.Name}'`);
        return [summaryMessage, ...messagesToKeep];
      }

      return conversationMessages;

    } catch (error) {
      LogError(`Error compressing context for agent '${this.agent.Name}': ${error.message}`);
      return conversationMessages;
    }
  }

  /**
   * Sends progress status to the callback if provided.
   */
  private sendProgress(callback: ((progress: AgentProgressUpdate) => void) | undefined, progress: AgentProgressUpdate): void {
    if (callback) {
      try {
        callback(progress);
      } catch (error) {
        LogError(`Error in progress callback: ${error.message}`);
      }
    }
  }

  /**
   * Creates a cancelled result.
   */
  private createCancelledResult(startTime: Date): AgentExecutionResult {
    const endTime = new Date();
    return {
      success: false,
      cancelled: true,
      errorMessage: 'Agent execution was cancelled',
      executionTimeMS: endTime.getTime() - startTime.getTime()
    };
  }
}

export function LoadBaseAgent() {
  // This function ensures the class isn't tree-shaken
}