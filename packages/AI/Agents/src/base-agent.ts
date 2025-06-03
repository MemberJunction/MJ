import { LogError, LogStatus, UserInfo, ValidationResult } from '@memberjunction/core';
import { AIAgentEntityExtended, AIAgentPromptEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-prompts';
import { ChatMessage } from '@memberjunction/ai';

/**
 * Parameters for agent execution
 */
export interface AgentExecutionParams {
  /** User context for authentication and permissions */
  contextUser?: UserInfo;
  /** Data context for template rendering and agent execution */
  data?: Record<string, unknown>;
  /** Optional conversation messages for multi-turn conversations */
  conversationMessages?: ChatMessage[];
  /** Optional cancellation token to abort agent execution */
  cancellationToken?: AbortSignal;
  /** Optional callback for receiving execution progress updates */
  onProgress?: (progress: AgentProgressUpdate) => void;
  /** Optional callback for receiving streaming content updates */
  onStreaming?: (chunk: AgentStreamingUpdate) => void;
}

/**
 * Progress update information during agent execution
 */
export interface AgentProgressUpdate {
  /** Current step in the agent execution process */
  step: 'initialization' | 'context_processing' | 'prompt_execution' | 'subagent_coordination' | 'result_aggregation' | 'completion';
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
  /** Which prompt/subagent is producing this content */
  sourceId?: string;
  /** Source name producing this content */
  sourceName?: string;
}

/**
 * Result of an agent execution
 */
export interface AgentExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** The main result content */
  result?: unknown;
  /** Error message if execution failed */
  errorMessage?: string;
  /** Total execution time in milliseconds */
  executionTimeMS?: number;
  /** Results from individual prompt executions */
  promptResults?: AIPromptRunResult[];
  /** Results from subagent executions */
  subagentResults?: AgentExecutionResult[];
  /** Additional metadata from the execution */
  metadata?: Record<string, unknown>;
  /** Whether the execution was cancelled */
  cancelled?: boolean;
  /** Conversation messages generated during execution */
  conversationMessages?: ChatMessage[];
}

/**
 * Context information maintained during agent execution
 */
export interface AgentExecutionContext {
  /** The agent entity being executed */
  agent: AIAgentEntityExtended;
  /** Current conversation messages */
  conversationMessages: ChatMessage[];
  /** Execution parameters */
  params: AgentExecutionParams;
  /** Data context for template rendering */
  data: Record<string, unknown>;
  /** Agent-specific configuration */
  configuration?: Record<string, unknown>;
  /** Current execution step */
  currentStep: string;
  /** Start time of execution */
  startTime: Date;
}

// Forward declaration to avoid circular dependency
export interface IAgentFactory {
  CreateAgentFromEntity(agentEntity: AIAgentEntityExtended, ...additionalParams: any[]): BaseAgent;
}

/**
 * Concrete base class for all AI agents in the MemberJunction system.
 * 
 * This class provides a comprehensive, metadata-driven framework for creating AI agents
 * that can execute prompts, coordinate with subagents, manage conversation context,
 * and integrate with the broader MJ ecosystem.
 * 
 * Key features:
 * - Metadata-driven configuration using AIAgentEntity
 * - Integration with AI Prompt system for sophisticated prompt execution
 * - Hierarchical agent composition with parent-child relationships
 * - Context compression and management for long conversations
 * - Progress tracking and streaming support
 * - Extensible through subclassing and registration system
 * 
 * Default behavior:
 * - Executes associated prompts in sequence
 * - Coordinates with child agents based on execution mode
 * - Applies context compression when configured
 * - Aggregates results from prompts and child agents
 * 
 * Example usage:
 * ```typescript
 * @RegisterClass(BaseAgent, "CustomAgent")
 * export class CustomAgent extends BaseAgent {
 *   protected async executeCore(context: AgentExecutionContext): Promise<AgentExecutionResult> {
 *     // Custom agent logic
 *     return await this.executePromptSequence(context);
 *   }
 * }
 * ```
 */
export class BaseAgent {
  protected _agentEntity: AIAgentEntityExtended;
  protected _promptRunner: AIPromptRunner;
  protected _contextUser?: UserInfo;
  protected _agentFactory: IAgentFactory;

  /**
   * Creates a new agent instance.
   * 
   * @param agentEntity The AIAgentEntity that defines this agent's configuration
   * @param agentFactory Factory for creating child agent instances
   * @param contextUser Optional user context for authentication and permissions
   */
  constructor(agentEntity: AIAgentEntityExtended, agentFactory: IAgentFactory, contextUser?: UserInfo) {
    this._agentEntity = agentEntity;
    this._agentFactory = agentFactory;
    this._contextUser = contextUser;
    this._promptRunner = new AIPromptRunner();
  }

  /**
   * Gets the agent entity that defines this agent's configuration.
   */
  public get AgentEntity(): AIAgentEntityExtended {
    return this._agentEntity;
  }

  /**
   * Gets the agent's name.
   */
  public get Name(): string {
    return this._agentEntity.Name;
  }

  /**
   * Gets the agent's description.
   */
  public get Description(): string {
    return this._agentEntity.Description || '';
  }

  /**
   * Executes the agent with the provided parameters.
   * 
   * This is the main entry point for agent execution. It handles initialization,
   * context management, prompt execution, subagent coordination, and result aggregation.
   * 
   * @param params Execution parameters including context, data, and callbacks
   * @returns Promise<AgentExecutionResult> The execution result
   */
  public async Execute(params: AgentExecutionParams = {}): Promise<AgentExecutionResult> {
    const startTime = new Date();
    
    try {
      // Initialize execution context
      const context = await this.initializeContext(params, startTime);
      
      // Check for cancellation
      if (params.cancellationToken?.aborted) {
        return this.createCancelledResult(startTime);
      }

      // Report initialization progress
      this.reportProgress(params.onProgress, {
        step: 'initialization',
        percentage: 10,
        message: `Initializing agent '${this.Name}'`,
        metadata: { agentName: this.Name, agentId: this._agentEntity.ID }
      });

      // Load AI Engine for metadata access
      await AIEngine.Instance.Config(false, this._contextUser);

      // Process context (compression, etc.)
      await this.processContext(context);
      
      // Check for cancellation
      if (params.cancellationToken?.aborted) {
        return this.createCancelledResult(startTime);
      }

      // Report context processing progress
      this.reportProgress(params.onProgress, {
        step: 'context_processing',
        percentage: 20,
        message: 'Processing conversation context',
      });

      // Execute the core agent logic with default implementation
      const result = await this.executeCore(context);

      // Calculate final execution time
      const endTime = new Date();
      result.executionTimeMS = endTime.getTime() - startTime.getTime();

      // Report completion
      this.reportProgress(params.onProgress, {
        step: 'completion',
        percentage: 100,
        message: `Agent '${this.Name}' execution completed`,
        metadata: { 
          success: result.success,
          executionTimeMS: result.executionTimeMS
        }
      });

      return result;

    } catch (error) {
      LogError(`Error executing agent '${this.Name}': ${error.message}`);
      
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
   * Core execution logic with default implementation.
   * 
   * The default behavior executes prompts in sequence and then coordinates with child agents.
   * Subclasses can override this method to implement custom logic, or override the individual
   * protected methods (executePromptSequence, executeChildAgents, etc.) for finer control.
   * 
   * @param context The execution context
   * @returns Promise<AgentExecutionResult> The execution result
   */
  protected async executeCore(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    try {
      // Step 1: Execute prompts
      const promptResult = await this.executePromptSequence(context);
      
      // Check for cancellation
      if (context.params.cancellationToken?.aborted) {
        return this.createCancelledResult(context.startTime);
      }

      // Step 2: Execute child agents  
      const childAgentResult = await this.executeChildAgents(context);

      // Step 3: Aggregate results
      return await this.aggregateResults(context, promptResult, childAgentResult);

    } catch (error) {
      LogError(`Error in executeCore for agent '${this.Name}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
        metadata: {
          errorStep: 'executeCore',
          agentName: this.Name
        }
      };
    }
  }

  /**
   * Aggregates results from prompt execution and child agent execution.
   * 
   * Subclasses can override this method to customize how results are combined.
   * 
   * @param context The execution context
   * @param promptResult Results from prompt execution
   * @param childAgentResult Results from child agent execution
   * @returns Promise<AgentExecutionResult> The aggregated result
   */
  protected async aggregateResults(
    context: AgentExecutionContext,
    promptResult: AgentExecutionResult,
    childAgentResult: AgentExecutionResult
  ): Promise<AgentExecutionResult> {
    // Default aggregation logic
    const combinedSuccess = promptResult.success || childAgentResult.success;
    const combinedResult = childAgentResult.result || promptResult.result;
    
    // Combine conversation messages
    const combinedMessages = [
      ...(promptResult.conversationMessages || []),
      ...(childAgentResult.subagentResults?.flatMap(r => r.conversationMessages || []) || [])
    ];

    // Combine metadata
    const combinedMetadata = {
      ...promptResult.metadata,
      ...childAgentResult.metadata,
      agentName: this.Name,
      hasPrompts: (promptResult.promptResults?.length || 0) > 0,
      hasChildAgents: (childAgentResult.subagentResults?.length || 0) > 0,
      aggregatedAt: new Date().toISOString()
    };

    return {
      success: combinedSuccess,
      result: combinedResult,
      promptResults: promptResult.promptResults,
      subagentResults: childAgentResult.subagentResults,
      conversationMessages: combinedMessages,
      metadata: combinedMetadata
    };
  }

  /**
   * Executes the sequence of prompts associated with this agent.
   * 
   * This method loads the agent's associated prompts and executes them in order,
   * managing conversation context and applying any configured behaviors.
   * 
   * @param context The execution context
   * @returns Promise<AgentExecutionResult> The aggregated result from all prompts
   */
  protected async executePromptSequence(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    try {
      // Load agent's associated prompts
      const agentPrompts = await this.loadAgentPrompts();
      
      if (agentPrompts.length === 0) {
        LogStatus(`Agent '${this.Name}' has no associated prompts`);
        return {
          success: true,
          result: null,
          promptResults: [],
          conversationMessages: context.conversationMessages
        };
      }

      const promptResults: AIPromptRunResult[] = [];
      let currentConversation = [...context.conversationMessages];

      // Execute prompts in order
      for (let i = 0; i < agentPrompts.length; i++) {
        const d = agentPrompts[i];
        const agentPrompt = d.agentPrompt;
        const prompt = d.prompt;
        
        // Check for cancellation
        if (context.params.cancellationToken?.aborted) {
          return this.createCancelledResult(context.startTime);
        }

        // Report progress
        this.reportProgress(context.params.onProgress, {
          step: 'prompt_execution',
          percentage: 30 + (40 * i / agentPrompts.length),
          message: `Executing prompt ${i + 1}/${agentPrompts.length}`,
          metadata: { promptName: prompt?.Name || 'Unknown' }
        });

        // Apply context behavior for this prompt
        const filteredMessages = this.applyContextBehavior(
          currentConversation, 
          agentPrompt.ContextBehavior || 'Complete',
          agentPrompt.ContextMessageCount || 0
        );

        // Execute the prompt
        const promptParams: AIPromptParams = {
          prompt: prompt,
          data: context.data,
          contextUser: this._contextUser,
          conversationMessages: filteredMessages,
          cancellationToken: context.params.cancellationToken,
          onProgress: context.params.onProgress,
          onStreaming: context.params.onStreaming
        };

        const promptResult = await this._promptRunner.ExecutePrompt(promptParams);
        promptResults.push(promptResult);

        // Add result to conversation if successful
        if (promptResult.success && promptResult.rawResult) {
          currentConversation.push({
            role: 'assistant',
            content: promptResult.rawResult
          });
        }

        // If prompt failed and we're in strict mode, stop execution
        if (!promptResult.success) {
          LogError(`Prompt execution failed for agent '${this.Name}': ${promptResult.errorMessage}`);
          // Continue with other prompts unless configured otherwise
        }
      }

      // Check if any prompts succeeded
      const successfulResults = promptResults.filter(r => r.success);
      const hasSuccess = successfulResults.length > 0;

      return {
        success: hasSuccess,
        result: hasSuccess ? successfulResults[successfulResults.length - 1].result : null,
        promptResults,
        conversationMessages: currentConversation,
        metadata: {
          totalPrompts: agentPrompts.length,
          successfulPrompts: successfulResults.length,
          failedPrompts: agentPrompts.length - successfulResults.length
        }
      };

    } catch (error) {
      LogError(`Error executing prompt sequence for agent '${this.Name}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
        promptResults: []
      };
    }
  }

  /**
   * Executes child agents if this agent has a hierarchical structure.
   * 
   * @param context The execution context
   * @returns Promise<AgentExecutionResult> The aggregated result from child agents
   */
  protected async executeChildAgents(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    try {
      // Load child agents
      const childAgents = await this.loadChildAgents();
      
      if (childAgents.length === 0) {
        return {
          success: true,
          result: null,
          subagentResults: []
        };
      }

      this.reportProgress(context.params.onProgress, {
        step: 'subagent_coordination',
        percentage: 70,
        message: `Coordinating ${childAgents.length} child agents`,
        metadata: { childAgentCount: childAgents.length }
      });

      const subagentResults: AgentExecutionResult[] = [];

      // Execute based on execution mode
      if (this._agentEntity.ExecutionMode === 'Parallel') {
        // Execute child agents in parallel
        const childPromises = childAgents.map(childAgent => 
          this.executeChildAgent(childAgent, context)
        );
        
        const results = await Promise.allSettled(childPromises);
        for (const result of results) {
          if (result.status === 'fulfilled') {
            subagentResults.push(result.value);
          } else {
            subagentResults.push({
              success: false,
              errorMessage: result.reason?.message || 'Child agent execution failed'
            });
          }
        }
      } else {
        // Execute child agents sequentially
        for (const childAgent of childAgents) {
          if (context.params.cancellationToken?.aborted) {
            break;
          }
          
          const result = await this.executeChildAgent(childAgent, context);
          subagentResults.push(result);
          
          // Update conversation context with child agent results
          if (result.success && result.conversationMessages) {
            context.conversationMessages.push(...result.conversationMessages);
          }
        }
      }

      const successfulResults = subagentResults.filter(r => r.success);
      
      return {
        success: successfulResults.length > 0,
        result: successfulResults.length > 0 ? successfulResults[successfulResults.length - 1].result : null,
        subagentResults,
        metadata: {
          totalChildAgents: childAgents.length,
          successfulChildAgents: successfulResults.length,
          failedChildAgents: childAgents.length - successfulResults.length
        }
      };

    } catch (error) {
      LogError(`Error executing child agents for agent '${this.Name}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
        subagentResults: []
      };
    }
  }

  /**
   * Initializes the execution context for the agent.
   */
  private async initializeContext(params: AgentExecutionParams, startTime: Date): Promise<AgentExecutionContext> {
    return {
      agent: this._agentEntity,
      conversationMessages: params.conversationMessages || [],
      params,
      data: params.data || {},
      currentStep: 'initialization',
      startTime
    };
  }

  /**
   * Processes conversation context, applying compression if needed.
   */
  private async processContext(context: AgentExecutionContext): Promise<void> {
    // Apply context compression if configured
    if (this._agentEntity.EnableContextCompression && 
        this._agentEntity.ContextCompressionMessageThreshold &&
        context.conversationMessages.length > this._agentEntity.ContextCompressionMessageThreshold) {
      
      await this.compressContext(context);
    }
  }

  /**
   * Compresses conversation context using the configured compression prompt.
   */
  private async compressContext(context: AgentExecutionContext): Promise<void> {
    try {
      if (!this._agentEntity.ContextCompressionPromptID) {
        LogStatus(`Context compression enabled but no compression prompt configured for agent '${this.Name}'`);
        return;
      }

      const retentionCount = this._agentEntity.ContextCompressionMessageRetentionCount || 5;
      const messagesToCompress = context.conversationMessages.slice(0, -retentionCount);
      const messagesToKeep = context.conversationMessages.slice(-retentionCount);

      if (messagesToCompress.length === 0) {
        return;
      }

      // Load compression prompt
      const compressionPrompt = AIEngine.Instance.Prompts.find(p => p.ID === this._agentEntity.ContextCompressionPromptID);
      if (!compressionPrompt) {
        LogError(`Compression prompt not found: ${this._agentEntity.ContextCompressionPromptID}`);
        return;
      }

      // Execute compression prompt
      const compressionParams: AIPromptParams = {
        prompt: compressionPrompt,
        data: {
          messages: messagesToCompress,
          messageCount: messagesToCompress.length
        },
        contextUser: this._contextUser
      };

      const compressionResult = await this._promptRunner.ExecutePrompt(compressionParams);

      if (compressionResult.success && compressionResult.rawResult) {
        // Replace compressed messages with summary
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary] ${compressionResult.rawResult}`
        };

        context.conversationMessages = [summaryMessage, ...messagesToKeep];
        LogStatus(`Compressed ${messagesToCompress.length} messages into summary for agent '${this.Name}'`);
      }

    } catch (error) {
      LogError(`Error compressing context for agent '${this.Name}': ${error.message}`);
    }
  }

  /**
   * Loads the prompts associated with this agent.
   */
  private async loadAgentPrompts(): Promise<{ agentPrompt: AIAgentPromptEntity, prompt: AIPromptEntity }[]> {
    try {
      // Get agent prompts ordered by execution order
      const agentPrompts = AIEngine.Instance.AgentPrompts
        .filter(ap => ap.AgentID === this._agentEntity.ID && ap.Status === 'Active')
        .sort((a, b) => (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0));

      const results: { agentPrompt: AIAgentPromptEntity, prompt: AIPromptEntity }[] = [];

      for (const agentPrompt of agentPrompts) {
        const prompt = AIEngine.Instance.Prompts.find(p => p.ID === agentPrompt.PromptID);
        if (prompt && prompt.Status === 'Active') {
          results.push({ agentPrompt, prompt });
        }
      }

      return results;
    } catch (error) {
      LogError(`Error loading agent prompts for '${this.Name}': ${error.message}`);
      return [];
    }
  }

  /**
   * Loads child agents if this agent has hierarchical structure.
   */
  private async loadChildAgents(): Promise<AIAgentEntityExtended[]> {
    try {
      const childAgents = AIEngine.Instance.Agents
        .filter(a => a.ParentID === this._agentEntity.ID)
        .sort((a, b) => (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0));

      return childAgents;
    } catch (error) {
      LogError(`Error loading child agents for '${this.Name}': ${error.message}`);
      return [];
    }
  }

  /**
   * Executes a child agent using the agent factory.
   */
  private async executeChildAgent(
    childAgentEntity: AIAgentEntityExtended, 
    parentContext: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    try {
      // Create child agent instance using the factory
      const childAgent = this._agentFactory.CreateAgentFromEntity(
        childAgentEntity, 
        this._agentFactory, // Pass the factory to the child agent
        this._contextUser
      );

      // Execute child agent with subset of parent context
      const childParams: AgentExecutionParams = {
        ...parentContext.params,
        conversationMessages: [...parentContext.conversationMessages],
        data: { ...parentContext.data }
      };

      return await childAgent.Execute(childParams);
    } catch (error) {
      LogError(`Error executing child agent '${childAgentEntity.Name}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message
      };
    }
  }

  /**
   * Applies context behavior filtering to conversation messages.
   */
  private applyContextBehavior(
    messages: ChatMessage[], 
    behavior: string, 
    messageCount: number
  ): ChatMessage[] {
    switch (behavior) {
      case 'None':
        return [];
      case 'Recent':
        return messageCount > 0 ? messages.slice(-messageCount) : messages;
      case 'Smart':
        // Smart filtering could implement more sophisticated logic
        // For now, just use recent with a reasonable default
        const smartCount = messageCount > 0 ? messageCount : 10;
        return messages.slice(-smartCount);
      case 'Complete':
      default:
        return messages;
    }
  }

  /**
   * Reports progress to the callback if provided.
   */
  private reportProgress(callback: ((progress: AgentProgressUpdate) => void) | undefined, progress: AgentProgressUpdate): void {
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