import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { AIAgentEntityExtended, AIAgentPromptEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';
import { ChatMessage } from '@memberjunction/ai';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { TemplateEngineServer } from '@memberjunction/templates';

/**
 * Decision types that an agent can make
 */
export type AgentDecisionType = 'execute_action' | 'execute_subagent' | 'complete_task' | 'request_clarification' | 'continue_processing';

/**
 * Structure for LLM decision-making input
 */
export interface AgentDecisionInput {
  /** Current conversation context */
  messages: ChatMessage[];
  /** Available actions */
  availableActions: ActionDescription[];
  /** Available sub-agents */
  availableSubAgents: SubAgentDescription[];
  /** Current task/goal description */
  currentGoal: string;
  /** Previous decisions and their results */
  executionHistory: ExecutionHistoryItem[];
  /** Additional context data */
  contextData?: Record<string, unknown>;
}

/**
 * Structure for LLM decision-making response
 */
export interface AgentDecisionResponse {
  /** Type of decision being made */
  decision: AgentDecisionType;
  /** Reasoning behind the decision */
  reasoning: string;
  /** Ordered execution steps to take (actions and sub-agents can be mixed) */
  executionPlan: ExecutionStep[];
  /** Whether this completes the current task */
  isTaskComplete: boolean;
  /** Response message if task is complete */
  finalResponse?: string;
  /** Confidence level in this decision (0-1) */
  confidence: number;
  /** Additional metadata about the decision (optional) */
  metadata?: {
    /** Estimated time to complete all execution steps */
    estimatedDuration?: number;
    /** Risk assessment of the chosen execution plan */
    riskLevel?: 'low' | 'medium' | 'high';
    /** Strategy for handling failures (retry, fallback, etc.) */
    failureStrategy?: string;
  };
}

/**
 * Description of available actions
 */
export interface ActionDescription {
  /** Action ID */
  id: string;
  /** Action name */
  name: string;
  /** Action description */
  description: string;
  /** Required parameters */
  parameters: ActionParameter[];
  /** Whether action can run in parallel with others */
  supportsParallel: boolean;
  /** Additional action metadata (optional) */
  metadata?: {
    /** Estimated execution time in milliseconds */
    estimatedDuration?: number;
    /** Reliability rating (0-1) */
    reliability?: number;
    /** Cost or resource usage level */
    costLevel?: 'low' | 'medium' | 'high';
  };
}

/**
 * Description of available sub-agents
 */
export interface SubAgentDescription {
  /** Sub-agent ID */
  id: string;
  /** Sub-agent name */
  name: string;
  /** Sub-agent description */
  description: string;
  /** Whether sub-agent can run in parallel with other sub-agents */
  supportsParallel: boolean;
  /** Execution order from database (used for default sequencing suggestions) */
  executionOrder?: number;
  /** Additional sub-agent metadata (optional) */
  metadata?: {
    /** Suggested execution context or prerequisites */
    executionContext?: string;
    /** Current load or availability */
    availabilityStatus?: 'available' | 'busy' | 'offline';
  };
}

/**
 * Action parameter description
 */
export interface ActionParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: string;
  /** Parameter description */
  description: string;
  /** Whether parameter is required */
  required: boolean;
  /** Default value if any */
  defaultValue?: unknown;
}

/**
 * Execution step that can be an action or sub-agent
 */
export interface ExecutionStep {
  /** Type of execution step */
  type: 'action' | 'subagent';
  /** ID of action or subagent to execute */
  targetId: string;
  /** Parameters to pass */
  parameters?: Record<string, unknown>;
  /** Execution order position (1, 2, 3, etc.) */
  executionOrder: number;
  /** Whether this step can run in parallel with other steps at the same executionOrder */
  allowParallel?: boolean;
  /** Human-readable description of what this step accomplishes */
  description?: string;
}

/**
 * History of previous executions
 */
export interface ExecutionHistoryItem {
  /** Type of execution */
  type: 'action' | 'subagent' | 'decision';
  /** Target ID */
  targetId: string;
  /** Parameters used */
  parameters?: Record<string, unknown>;
  /** Result of execution */
  result: unknown;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Timestamp */
  timestamp: Date;
}

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
  /** Additional metadata from the execution */
  metadata?: Record<string, unknown>;
  /** Whether the execution was cancelled */
  cancelled?: boolean;
  /** Conversation messages generated during execution */
  conversationMessages?: ChatMessage[];
  /** Decision-making history */
  decisionHistory?: AgentDecisionResponse[];
  /** Action execution results */
  actionResults?: ActionResult[];
  /** Final decision that led to completion */
  finalDecision?: AgentDecisionResponse;
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
  protected _actionEngine: ActionEngineServer;
  protected _templateEngine: TemplateEngineServer;
  
  // Enhanced system prompt template for decision-making with dynamic agent prompt embedding
  private static readonly SYSTEM_PROMPT_TEMPLATE = `# System Instructions
You are an AI agent named "{{ agentName }}" operating within the MemberJunction AI Agent framework.

## Your Purpose
{{ agentDescription }}

## Agent-Specific Instructions
{% if agentPrompt %}
The following are your specialized instructions that define your specific behavior and capabilities:

{{ agentPrompt }}
{% endif %}

## Available Actions and Resources

{% if availableActions.length > 0 %}
### Actions Available to You:
{% for action in availableActions %}
- **{{ action.name }}** (ID: {{ action.id }})
  - Description: {{ action.description }}
  - Parameters: {% for param in action.parameters %}{{ param.name }} ({{ param.type }}){% if param.required %} [required]{% endif %}{% if not loop.last %}, {% endif %}{% endfor %}
  - Supports parallel execution: {{ action.supportsParallel }}
{% endfor %}
{% endif %}

{% if availableSubAgents.length > 0 %}
### Sub-Agents Available for Delegation:
{% for subagent in availableSubAgents %}
- **{{ subagent.name }}** (ID: {{ subagent.id }})
  - Purpose: {{ subagent.description }}
  - Supports parallel execution: {{ subagent.supportsParallel }}
{% endfor %}
{% endif %}

## Operational Framework

### Decision-Making Process
You operate using a continuous decision-making loop:

1. **Analyze** the current context and user request
2. **Decide** what action to take next
3. **Execute** the chosen action(s)
4. **Evaluate** the results
5. **Determine** if the task is complete or if further action is needed

### Response Format
You must ALWAYS respond with a valid JSON object following this exact structure:

\`\`\`json
{
  "decision": "execute_action" | "execute_subagent" | "complete_task" | "request_clarification" | "continue_processing",
  "reasoning": "Your detailed thought process and justification for this decision",
  "executionPlan": [
    {
      "type": "action" | "subagent",
      "targetId": "ID of the action or subagent to execute",
      "parameters": {"key": "value"},
      "executionOrder": 1,
      "allowParallel": true | false,
      "description": "What this step accomplishes"
    }
  ],
  "isTaskComplete": true | false,
  "finalResponse": "Your final response to the user if task is complete",
  "confidence": 0.0-1.0
}
\`\`\`

### Decision Types
- **execute_action**: Use one of your available actions to perform a task
- **execute_subagent**: Delegate a subtask to a specialized sub-agent
- **complete_task**: You have successfully completed the requested task
- **request_clarification**: You need more information from the user to proceed
- **continue_processing**: Continue with your current approach (for multi-step processes)

### AI-Driven Execution Planning
**You have complete autonomy in choosing your approach.** There are no predetermined pathways or required sequences. Instead:

- **Evaluate the Goal**: Understand what the user truly wants to accomplish
- **Choose Your Strategy**: Decide which combination of actions and sub-agents will best achieve the goal
- **Design Execution Order**: You determine the sequence - actions and sub-agents can be mixed (e.g., Action1 → SubAgent2 → Action3 → SubAgent1)
- **Decide Parallelization**: 
  - Actions can run in parallel (set allowParallel: true for same executionOrder)
  - Sub-agents should generally run sequentially unless specifically designed for parallel execution
  - Steps with the same executionOrder number can run simultaneously if allowParallel is true
- **Adapt Dynamically**: After each execution round, reassess and choose the next steps

### Execution Guidelines
- **Strategic Thinking**: Choose the most effective path, not just the most obvious one
- **Flexibility**: You can combine any actions and sub-agents in any order that makes sense
- **Parallel Efficiency**: Use parallel execution for actions when it won't cause conflicts
- **Sequential Control**: Use sequential execution when results from one step inform the next
- **Iterative Approach**: After execution, you'll be asked "what's next?" - be prepared to continue or conclude

## What Should We Do Next?

Based on the current conversation context, available actions, and your specific instructions, analyze the situation and decide on the most appropriate next action. Consider:

1. What is the user ultimately trying to accomplish?
2. What information or capabilities do I need to fulfill this request?
3. Which actions or sub-agents would be most effective?
4. Can any actions be performed in parallel to improve efficiency?
5. Do I have enough information to proceed, or do I need clarification?

Respond with your decision following the JSON format specified above.`;

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
    this._actionEngine = ActionEngineServer.Instance;
    this._templateEngine = TemplateEngineServer.Instance;
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
      this.sendProgress(params.onProgress, {
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
      this.sendProgress(params.onProgress, {
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
      this.sendProgress(params.onProgress, {
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
   * Core execution logic with decision-driven implementation.
   * 
   * This new approach uses LLM decision-making to determine what actions to take
   * rather than following a predetermined sequence. The agent will:
   * 1. Analyze the current context
   * 2. Make a decision about what to do next
   * 3. Execute the decided actions (actions/subagents)
   * 4. Repeat until task is complete
   * 
   * @param context The execution context
   * @returns Promise<AgentExecutionResult> The execution result
   */
  protected async executeCore(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    try {
      const decisionHistory: AgentDecisionResponse[] = [];
      const executionHistory: ExecutionHistoryItem[] = [];
      const actionResults: ActionResult[] = [];
      let currentMessages = [...context.conversationMessages];
      let maxIterations = 10; // Prevent infinite loops
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        
        // Check for cancellation
        if (context.params.cancellationToken?.aborted) {
          return this.createCancelledResult(context.startTime);
        }

        // Report progress
        this.sendProgress(context.params.onProgress, {
          step: 'subagent_coordination',
          percentage: 30 + (50 * iteration / maxIterations),
          message: `Decision-making iteration ${iteration}/${maxIterations}`,
          metadata: { iteration, maxIterations }
        });

        // Step 1: Create decision input
        const decisionInput = await this.createDecisionInput(context, currentMessages, executionHistory);

        // Step 2: Make decision using LLM
        const decision = await this.makeDecision(context, decisionInput);
        decisionHistory.push(decision);

        // Step 3: Handle the decision
        if (decision.isTaskComplete || decision.decision === 'complete_task') {
          // Task is complete, return final result
          return {
            success: true,
            result: decision.finalResponse || decision.reasoning,
            conversationMessages: currentMessages,
            decisionHistory,
            actionResults: actionResults,
            finalDecision: decision,
            metadata: {
              iterations: iteration,
              decisionCount: decisionHistory.length,
              actionExecutions: actionResults.length
            }
          };
        }

        if (decision.decision === 'request_clarification') {
          // Need clarification from user
          return {
            success: false,
            errorMessage: decision.reasoning,
            conversationMessages: currentMessages,
            decisionHistory,
            metadata: {
              needsClarification: true,
              clarificationRequest: decision.reasoning
            }
          };
        }

        // Step 4: Execute the decided actions
        const executionResults = await this.executeDecidedActions(context, decision, executionHistory);
        
        // Add execution results to history
        executionHistory.push(...executionResults.historyItems);
        actionResults.push(...executionResults.actionResults);

        // Update conversation messages with results
        if (executionResults.newMessages.length > 0) {
          currentMessages.push(...executionResults.newMessages);
        }

        // Add a summary of what was executed
        const executionSummary = this.createExecutionSummary(decision, executionResults);
        currentMessages.push({
          role: 'assistant',
          content: executionSummary
        });
      }

      // If we reach here, we hit the max iterations limit
      return {
        success: false,
        errorMessage: `Agent reached maximum iterations (${maxIterations}) without completing the task`,
        conversationMessages: currentMessages,
        decisionHistory,
        actionResults: actionResults,
        metadata: {
          maxIterationsReached: true,
          iterations: iteration,
          decisionCount: decisionHistory.length
        }
      };
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
   * Creates decision input for the LLM based on current context.
   */
  protected async createDecisionInput(
    context: AgentExecutionContext,
    currentMessages: ChatMessage[],
    executionHistory: ExecutionHistoryItem[]
  ): Promise<AgentDecisionInput> {
    // Load available actions and subagents
    const availableActions = await this.getAvailableActions();
    const availableSubAgents = await this.getAvailableSubAgents();
    
    // Determine current goal from context or agent description
    const currentGoal = context.data.goal as string || 
                       context.data.task as string || 
                       this._agentEntity.Description || 
                       'Complete the requested task';

    return {
      messages: currentMessages,
      availableActions,
      availableSubAgents,
      currentGoal,
      executionHistory,
      contextData: context.data
    };
  }

  /**
   * Makes a decision using the LLM with the enhanced system prompt template.
   * 
   * This method handles dynamic agent prompt embedding using string manipulation
   * to inject specific agent template content at runtime.
   */
  protected async makeDecision(
    context: AgentExecutionContext,
    decisionInput: AgentDecisionInput
  ): Promise<AgentDecisionResponse> {
    try {
      // Get agent-specific prompt content
      const agentPrompt = await this.getAgentPromptContent();

      // Prepare template data for the system prompt
      const systemPromptData = {
        agentName: this.Name,
        agentDescription: this.Description,
        agentPrompt,
        availableActions: decisionInput.availableActions,
        availableSubAgents: decisionInput.availableSubAgents
      };

      // Render the enhanced system prompt template
      const systemPromptResult = await this._templateEngine.RenderTemplateSimple(
        BaseAgent.SYSTEM_PROMPT_TEMPLATE,
        systemPromptData
      );

      if (!systemPromptResult.Success) {
        throw new Error(`Failed to render system prompt: ${systemPromptResult.Message}`);
      }

      // Prepare context-aware decision prompt
      const contextualPrompt = this.buildContextualDecisionPrompt(decisionInput, context);

      // Prepare messages for LLM with enhanced context
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPromptResult.Output },
        ...decisionInput.messages,
        {
          role: 'user',
          content: contextualPrompt
        }
      ];

      // Execute LLM call using AIEngine
      const lastMessageContent = messages[messages.length - 1].content;
      const userMessage = typeof lastMessageContent === 'string' 
        ? lastMessageContent 
        : lastMessageContent.map(block => block.content).join(' ');
        
      const llmResponse = await AIEngine.Instance.SimpleLLMCompletion(
        userMessage,
        this._contextUser,
        systemPromptResult.Output
      );

      // Parse and validate the LLM response
      const decision = await this.parseAndValidateDecision(llmResponse, decisionInput);
      
      return decision;
    } catch (error) {
      LogError(`Error making decision: ${error.message}`);
      return {
        decision: 'request_clarification',
        reasoning: `Error occurred while making decision: ${error.message}`,
        executionPlan: [],
        isTaskComplete: false,
        confidence: 0.1
      };
    }
  }

  /**
   * Gets the agent-specific prompt content, supporting both template embedding and direct content.
   */
  private async getAgentPromptContent(): Promise<string> {
    try {
      const agentPrompts = await this.loadAgentPrompts();
      
      if (agentPrompts.length === 0) {
        return '';
      }

      // Get the first (highest priority) agent prompt
      const primaryAgentPrompt = agentPrompts[0];
      
      // Try to find the template
      const template = this._templateEngine.FindTemplate(primaryAgentPrompt.prompt.Name);
      if (!template) {
        LogError(`Template not found: ${primaryAgentPrompt.prompt.Name}`);
        return '';
      }

      // Get the highest priority content
      const templateContent = template.GetHighestPriorityContent();
      if (!templateContent?.TemplateText) {
        LogError(`No template content found for: ${primaryAgentPrompt.prompt.Name}`);
        return '';
      }

      // Check if this template should be embedded or rendered directly
      if (this.shouldEmbedTemplate(templateContent.TemplateText)) {
        // For templates that use {% template "..." %} syntax, we need to render them
        // to resolve the embedded templates
        const renderResult = await this._templateEngine.RenderTemplateSimple(
          templateContent.TemplateText,
          {} // Empty context for now, could be enhanced later
        );
        
        if (renderResult.Success) {
          return renderResult.Output;
        } else {
          LogError(`Failed to render template ${primaryAgentPrompt.prompt.Name}: ${renderResult.Message}`);
          return templateContent.TemplateText; // Fallback to raw template text
        }
      } else {
        // Return the template text directly
        return templateContent.TemplateText;
      }
    } catch (error) {
      LogError(`Error getting agent prompt content: ${error.message}`);
      return '';
    }
  }

  /**
   * Determines if a template contains embedding syntax and should be rendered.
   */
  private shouldEmbedTemplate(templateText: string): boolean {
    // Check for template embedding syntax like {% template "..." %}
    return templateText.includes('{% template ') || 
           templateText.includes('{%template ') ||
           templateText.includes('{% AIPrompt ') ||
           templateText.includes('{%AIPrompt ');
  }

  /**
   * Builds a contextual decision prompt based on the current state and goals.
   */
  private buildContextualDecisionPrompt(
    decisionInput: AgentDecisionInput,
    context: AgentExecutionContext
  ): string {
    const executionSummary = decisionInput.executionHistory.length > 0 
      ? this.summarizeExecutionHistory(decisionInput.executionHistory)
      : 'No previous actions taken.';

    // Enhanced action information
    const actionDetails = decisionInput.availableActions.length > 0 
      ? this.formatActionsForDecision(decisionInput.availableActions)
      : '';

    // Enhanced sub-agent information  
    const subAgentDetails = decisionInput.availableSubAgents.length > 0
      ? this.formatSubAgentsForDecision(decisionInput.availableSubAgents)
      : '';

    return `## Current Situation Analysis

**Primary Goal:** ${decisionInput.currentGoal}

**Conversation Context:** ${decisionInput.messages.length} messages in conversation
**Previous Actions:** ${executionSummary}
**Available Actions:** ${decisionInput.availableActions.length} actions
**Available Sub-Agents:** ${decisionInput.availableSubAgents.length} sub-agents${actionDetails}${subAgentDetails}

## Decision Request

Based on your specialized instructions, the current context, and available resources, what should you do next to achieve the goal: "${decisionInput.currentGoal}"?

Consider:
1. Have you fully understood what the user is asking for?
2. Do you have all the information needed to proceed?
3. Which approach would be most effective and efficient?
4. Should any actions be performed in parallel?
5. Are you ready to provide a final response?

**Respond with a JSON object following the specified structure.**`;
  }

  /**
   * Formats action information for decision-making context.
   */
  private formatActionsForDecision(actions: ActionDescription[]): string {
    if (actions.length === 0) return '';
    
    let section = '\n## Available Actions Details\n';
    for (const action of actions.slice(0, 5)) { // Limit to first 5 to avoid overwhelming the LLM
      section += `**${action.name}** (${action.id}): ${action.description}\n`;
      if (action.metadata) {
        if (action.metadata.estimatedDuration) {
          section += `  - Duration: ~${action.metadata.estimatedDuration}ms\n`;
        }
        if (action.metadata.reliability) {
          section += `  - Reliability: ${(action.metadata.reliability * 100).toFixed(0)}%\n`;
        }
        if (action.metadata.costLevel) {
          section += `  - Cost level: ${action.metadata.costLevel}\n`;
        }
      }
    }
    if (actions.length > 5) {
      section += `... and ${actions.length - 5} more actions available\n`;
    }
    return section;
  }

  /**
   * Formats sub-agent information for decision-making context.
   */
  private formatSubAgentsForDecision(subAgents: SubAgentDescription[]): string {
    if (subAgents.length === 0) return '';
    
    let section = '\n## Available Sub-Agents Details\n';
    // Sort by execution order to show suggested sequence
    const sortedAgents = [...subAgents].sort((a, b) => (a.executionOrder || 0) - (b.executionOrder || 0));
    
    for (const agent of sortedAgents.slice(0, 5)) { // Show more sub-agents since they're key to the workflow
      section += `**${agent.name}** (${agent.id}): ${agent.description}\n`;
      section += `  - Suggested execution order: ${agent.executionOrder || 0}\n`;
      section += `  - Supports parallel execution: ${agent.supportsParallel}\n`;
      
      if (agent.metadata) {
        if (agent.metadata.availabilityStatus) {
          section += `  - Status: ${agent.metadata.availabilityStatus}\n`;
        }
        if (agent.metadata.executionContext) {
          section += `  - Context: ${agent.metadata.executionContext}\n`;
        }
      }
      section += '\n';
    }
    if (subAgents.length > 5) {
      section += `... and ${subAgents.length - 5} more sub-agents available\n`;
    }
    
    section += '\n**Note**: Execution order values are suggestions. You have complete autonomy to choose any sequence that best achieves the goal.\n';
    return section;
  }

  /**
   * Summarizes execution history for context.
   */
  private summarizeExecutionHistory(history: ExecutionHistoryItem[]): string {
    if (history.length === 0) return 'None';
    
    const successful = history.filter(h => h.success).length;
    const failed = history.filter(h => !h.success).length;
    const recent = history.slice(-3).map(h => 
      `${h.type}:${h.targetId}(${h.success ? 'success' : 'failed'})`
    ).join(', ');
    
    return `${history.length} total actions (${successful} successful, ${failed} failed). Recent: ${recent}`;
  }

  /**
   * Parses and validates the LLM decision response with enhanced error handling.
   */
  private async parseAndValidateDecision(
    llmResponse: string,
    decisionInput: AgentDecisionInput
  ): Promise<AgentDecisionResponse> {
    try {
      // Try to extract JSON from the response (handle cases where LLM adds extra text)
      const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                       llmResponse.match(/\{[\s\S]*\}/);
      
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : llmResponse;
      
      let decision: Partial<AgentDecisionResponse>;
      try {
        decision = JSON.parse(jsonString.trim());
      } catch (parseError) {
        // If JSON parsing fails, try to create a reasonable fallback
        LogError(`Failed to parse LLM decision response: ${parseError.message}`);
        
        // Attempt to infer intent from the response text
        return this.createFallbackDecision(llmResponse, decisionInput);
      }

      // Validate and normalize the decision
      return this.validateAndNormalizeDecision(decision);
    } catch (error) {
      LogError(`Error parsing decision: ${error.message}`);
      return this.createFallbackDecision(llmResponse, decisionInput);
    }
  }

  /**
   * Creates a fallback decision when JSON parsing fails.
   */
  private createFallbackDecision(
    llmResponse: string,
    decisionInput: AgentDecisionInput
  ): AgentDecisionResponse {
    // Try to infer intent from the response
    const response = llmResponse.toLowerCase();
    
    if (response.includes('complete') || response.includes('finished') || response.includes('done')) {
      return {
        decision: 'complete_task',
        reasoning: `Task appears to be complete based on response: ${llmResponse}`,
        executionPlan: [],
        isTaskComplete: true,
        finalResponse: llmResponse,
        confidence: 0.3
      };
    }
    
    if (response.includes('need') || response.includes('require') || response.includes('clarify')) {
      return {
        decision: 'request_clarification',
        reasoning: `Clarification needed based on response: ${llmResponse}`,
        executionPlan: [],
        isTaskComplete: false,
        confidence: 0.4
      };
    }
    
    // Default fallback
    return {
      decision: 'request_clarification',
      reasoning: `Unable to parse LLM response format. Raw response: ${llmResponse}`,
      executionPlan: [],
      isTaskComplete: false,
      confidence: 0.1
    };
  }

  /**
   * Executes the execution plan decided by the LLM.
   * Handles mixed actions and sub-agents with proper execution order and parallelization.
   */
  protected async executeDecidedActions(
    context: AgentExecutionContext,
    decision: AgentDecisionResponse,
    executionHistory: ExecutionHistoryItem[]
  ): Promise<{
    historyItems: ExecutionHistoryItem[];
    actionResults: ActionResult[];
    newMessages: ChatMessage[];
  }> {
    const historyItems: ExecutionHistoryItem[] = [];
    const actionResults: ActionResult[] = [];
    const newMessages: ChatMessage[] = [];

    if (!decision.executionPlan || decision.executionPlan.length === 0) {
      return { historyItems, actionResults, newMessages };
    }

    // Group execution steps by executionOrder
    const executionGroups = this.groupExecutionStepsByOrder(decision.executionPlan);
    
    // Execute each group in order (1, 2, 3, etc.)
    for (const [order, steps] of executionGroups) {
      // Report progress for this execution order
      this.sendProgress(context.params.onProgress, {
        step: 'subagent_coordination',
        percentage: 40 + (40 * order / executionGroups.size),
        message: `Executing steps at order ${order}`,
        metadata: { 
          executionOrder: order, 
          stepCount: steps.length,
          stepTypes: steps.map(s => s.type)
        }
      });

      // Separate parallel-allowed and sequential steps within this order
      const parallelSteps = steps.filter(step => step.allowParallel !== false);
      const sequentialSteps = steps.filter(step => step.allowParallel === false);

      // Execute parallel steps first (if any)
      if (parallelSteps.length > 0) {
        const parallelResults = await this.executeStepsInParallel(
          context, 
          parallelSteps, 
          executionHistory
        );
        
        historyItems.push(...parallelResults.historyItems);
        actionResults.push(...parallelResults.actionResults);
        newMessages.push(...parallelResults.newMessages);
      }

      // Execute sequential steps (if any)
      if (sequentialSteps.length > 0) {
        const sequentialResults = await this.executeStepsSequentially(
          context, 
          sequentialSteps, 
          executionHistory
        );
        
        historyItems.push(...sequentialResults.historyItems);
        actionResults.push(...sequentialResults.actionResults);
        newMessages.push(...sequentialResults.newMessages);
      }

      // Add a summary message for this execution order
      if (steps.length > 0) {
        const successCount = historyItems.filter(h => h.success).length;
        const orderSummary = `Completed execution order ${order}: ${successCount}/${steps.length} steps successful`;
        newMessages.push({
          role: 'assistant',
          content: orderSummary
        });
      }
    }

    return { historyItems, actionResults, newMessages };
  }

  /**
   * Groups execution steps by their execution order.
   */
  private groupExecutionStepsByOrder(executionPlan: ExecutionStep[]): Map<number, ExecutionStep[]> {
    const groups = new Map<number, ExecutionStep[]>();
    
    for (const step of executionPlan) {
      const order = step.executionOrder || 1; // Default to order 1 if not specified
      if (!groups.has(order)) {
        groups.set(order, []);
      }
      groups.get(order)!.push(step);
    }
    
    // Return sorted by execution order
    return new Map([...groups.entries()].sort(([a], [b]) => a - b));
  }

  /**
   * Executes multiple steps in parallel.
   */
  private async executeStepsInParallel(
    context: AgentExecutionContext,
    steps: ExecutionStep[],
    executionHistory: ExecutionHistoryItem[]
  ): Promise<{
    historyItems: ExecutionHistoryItem[];
    actionResults: ActionResult[];
    newMessages: ChatMessage[];
  }> {
    const promises = steps.map(step => 
      this.executeSingleStep(context, step, executionHistory)
    );
    
    const results = await Promise.allSettled(promises);
    
    const historyItems: ExecutionHistoryItem[] = [];
    const actionResults: ActionResult[] = [];
    const newMessages: ChatMessage[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const step = steps[i];
      
      if (result.status === 'fulfilled') {
        historyItems.push(result.value.historyItem);
        if (result.value.actionResult) {
          actionResults.push(result.value.actionResult);
        }
        if (result.value.newMessage) {
          newMessages.push(result.value.newMessage);
        }
      } else {
        // Create error history item for failed parallel execution
        historyItems.push({
          type: step.type,
          targetId: step.targetId,
          parameters: step.parameters,
          result: null,
          success: false,
          errorMessage: result.reason?.message || 'Parallel execution failed',
          timestamp: new Date()
        });
      }
    }
    
    return { historyItems, actionResults, newMessages };
  }

  /**
   * Executes multiple steps sequentially.
   */
  private async executeStepsSequentially(
    context: AgentExecutionContext,
    steps: ExecutionStep[],
    executionHistory: ExecutionHistoryItem[]
  ): Promise<{
    historyItems: ExecutionHistoryItem[];
    actionResults: ActionResult[];
    newMessages: ChatMessage[];
  }> {
    const historyItems: ExecutionHistoryItem[] = [];
    const actionResults: ActionResult[] = [];
    const newMessages: ChatMessage[] = [];
    
    for (const step of steps) {
      try {
        const result = await this.executeSingleStep(context, step, executionHistory);
        historyItems.push(result.historyItem);
        
        if (result.actionResult) {
          actionResults.push(result.actionResult);
        }
        if (result.newMessage) {
          newMessages.push(result.newMessage);
        }
      } catch (error) {
        historyItems.push({
          type: step.type,
          targetId: step.targetId,
          parameters: step.parameters,
          result: null,
          success: false,
          errorMessage: error.message,
          timestamp: new Date()
        });
      }
    }
    
    return { historyItems, actionResults, newMessages };
  }

  /**
   * Executes a single execution step (action or subagent).
   */
  protected async executeSingleStep(
    context: AgentExecutionContext,
    step: ExecutionStep,
    executionHistory: ExecutionHistoryItem[]
  ): Promise<{
    historyItem: ExecutionHistoryItem;
    actionResult?: ActionResult;
    newMessage?: ChatMessage;
  }> {
    const timestamp = new Date();
    
    try {
      if (step.type === 'action') {
        // Execute action using ActionEngine
        const actionResult = await this.executeAction(step.targetId, step.parameters || {});
        
        const statusMessage = step.description 
          ? `${step.description} - ${actionResult.Success ? 'Completed' : 'Failed'}`
          : `Executed action '${step.targetId}': ${actionResult.Success ? 'Success' : actionResult.Message}`;
        
        return {
          historyItem: {
            type: 'action',
            targetId: step.targetId,
            parameters: step.parameters,
            result: actionResult,
            success: actionResult.Success,
            errorMessage: actionResult.Success ? undefined : actionResult.Message,
            timestamp
          },
          actionResult,
          newMessage: {
            role: 'assistant',
            content: statusMessage
          }
        };
      } else if (step.type === 'subagent') {
        // Execute subagent
        const subagentResult = await this.executeSubAgent(step.targetId, step.parameters || {}, context);
        
        const statusMessage = step.description 
          ? `${step.description} - ${subagentResult.success ? 'Completed' : 'Failed'}`
          : `Executed subagent '${step.targetId}': ${subagentResult.success ? 'Success' : subagentResult.errorMessage}`;
        
        return {
          historyItem: {
            type: 'subagent',
            targetId: step.targetId,
            parameters: step.parameters,
            result: subagentResult,
            success: subagentResult.success,
            errorMessage: subagentResult.success ? undefined : subagentResult.errorMessage,
            timestamp
          },
          newMessage: {
            role: 'assistant',
            content: statusMessage
          }
        };
      } else {
        throw new Error(`Unknown execution step type: ${step.type}`);
      }
    } catch (error) {
      return {
        historyItem: {
          type: step.type,
          targetId: step.targetId,
          parameters: step.parameters,
          result: null,
          success: false,
          errorMessage: error.message,
          timestamp
        }
      };
    }
  }

  /**
   * Gets available actions for this agent.
   */
  protected async getAvailableActions(): Promise<ActionDescription[]> {
    try {
      // Load action engine configuration
      await this._actionEngine.Config(false, this._contextUser);
      
      // Get agent actions from metadata
      const agentActions = AIEngine.Instance.AgentActions
        .filter(aa => aa.AgentID === this._agentEntity.ID && aa.Status === 'Active');
      
      const actions: ActionDescription[] = [];
      
      for (const agentAction of agentActions) {
        const action = this._actionEngine.Actions.find(a => a.ID === agentAction.ActionID);
        if (action && action.Status === 'Active') {
          actions.push({
            id: action.ID,
            name: action.Name,
            description: action.Description || '',
            parameters: action.Params?.map(p => ({
              name: p.Name,
              type: p.Type,
              description: p.Description || '',
              required: p.IsRequired || false,
              defaultValue: p.DefaultValue
            })) || [],
            supportsParallel: true // Most actions can run in parallel
          });
        }
      }
      
      return actions;
    } catch (error) {
      LogError(`Error loading available actions: ${error.message}`);
      return [];
    }
  }

  /**
   * Gets available sub-agents for this agent.
   */
  protected async getAvailableSubAgents(): Promise<SubAgentDescription[]> {
    try {
      const childAgents = await this.loadChildAgents();
      
      return childAgents.map(agent => ({
        id: agent.ID,
        name: agent.Name,
        description: agent.Description || '',
        supportsParallel: agent.ExecutionMode === 'Parallel',
        executionOrder: agent.ExecutionOrder || 0,
        metadata: {
          executionContext: `Default execution order: ${agent.ExecutionOrder || 0}. Mode: ${agent.ExecutionMode || 'Sequential'}`,
          availabilityStatus: 'available'
        }
      }));
    } catch (error) {
      LogError(`Error loading available sub-agents: ${error.message}`);
      return [];
    }
  }

  /**
   * Executes an action using the ActionEngine.
   */
  protected async executeAction(actionId: string, parameters: Record<string, unknown>): Promise<ActionResult> {
    try {
      // Convert parameters to ActionParam format
      const actionParams: ActionParam[] = Object.entries(parameters).map(([name, value]) => ({
        Name: name,
        Value: value,
        Type: 'Input' // ActionParam.Type expects 'Input', 'Output', or 'Both'
      }));

      return await this._actionEngine.RunActionByID({
        ActionID: actionId,
        ContextUser: this._contextUser,
        Params: actionParams,
        SkipActionLog: false
      });
    } catch (error) {
      LogError(`Error executing action '${actionId}': ${error.message}`);
      return {
        Success: false,
        Message: error.message,
        LogEntry: null,
        Params: [],
        RunParams: null
      };
    }
  }

  /**
   * Executes a sub-agent.
   */
  protected async executeSubAgent(
    subAgentId: string, 
    parameters: Record<string, unknown>,
    parentContext: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    try {
      const subAgentEntity = AIEngine.Instance.Agents.find(a => a.ID === subAgentId);
      if (!subAgentEntity) {
        throw new Error(`Sub-agent with ID '${subAgentId}' not found`);
      }

      const subAgent = this._agentFactory.CreateAgentFromEntity(subAgentEntity, this._agentFactory, this._contextUser);
      
      // Create execution parameters for sub-agent
      const subAgentParams: AgentExecutionParams = {
        ...parentContext.params,
        data: { ...parentContext.data, ...parameters },
        conversationMessages: [...parentContext.conversationMessages]
      };

      return await subAgent.Execute(subAgentParams);
    } catch (error) {
      LogError(`Error executing sub-agent '${subAgentId}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message
      };
    }
  }

  /**
   * Validates and normalizes an LLM decision response.
   */
  protected validateAndNormalizeDecision(decision: Partial<AgentDecisionResponse>): AgentDecisionResponse {
    // Normalize execution plan
    let executionPlan: ExecutionStep[] = [];
    if (decision.executionPlan && Array.isArray(decision.executionPlan)) {
      executionPlan = decision.executionPlan.map((step, index) => ({
        type: step.type || 'action',
        targetId: step.targetId || '',
        parameters: step.parameters || {},
        executionOrder: step.executionOrder || (index + 1),
        allowParallel: step.allowParallel !== false, // Default to true
        description: step.description || `Step ${index + 1}: ${step.type} ${step.targetId}`
      }));
    }
    
    return {
      decision: decision.decision || 'request_clarification',
      reasoning: decision.reasoning || 'No reasoning provided',
      executionPlan,
      isTaskComplete: decision.isTaskComplete || false,
      finalResponse: decision.finalResponse,
      confidence: typeof decision.confidence === 'number' ? decision.confidence : 0.5,
      metadata: decision.metadata
    };
  }

  /**
   * Creates a summary of executed execution plan.
   */
  protected createExecutionSummary(
    decision: AgentDecisionResponse,
    executionResults: {
      historyItems: ExecutionHistoryItem[];
      actionResults: ActionResult[];
      newMessages: ChatMessage[];
    }
  ): string {
    const successfulSteps = executionResults.historyItems.filter(h => h.success);
    const failedSteps = executionResults.historyItems.filter(h => !h.success);
    
    let summary = `Executed ${decision.executionPlan.length} execution steps based on decision: ${decision.reasoning}\n`;
    
    if (successfulSteps.length > 0) {
      summary += `✅ Successful: ${successfulSteps.map(a => a.targetId).join(', ')}\n`;
    }
    
    if (failedSteps.length > 0) {
      summary += `❌ Failed: ${failedSteps.map(a => `${a.targetId} (${a.errorMessage})`).join(', ')}\n`;
    }
    
    // Add execution order summary
    const executionOrders = decision.executionPlan.map(step => step.executionOrder).filter((v, i, a) => a.indexOf(v) === i).sort();
    if (executionOrders.length > 1) {
      summary += `📋 Execution order: ${executionOrders.join(' → ')}\n`;
    }
    
    return summary;
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