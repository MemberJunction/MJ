import { LogError, LogStatus, UserInfo, Metadata, RunView } from '@memberjunction/core';
import { AIAgentEntityExtended, AIPromptEntity, AIAgentRunEntity, AIAgentRunStepEntity, AIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, AIPromptParams, ChildPromptParam } from '@memberjunction/ai-prompts';
import { ChatMessage } from '@memberjunction/ai';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { MJGlobal, RegisterClass } from '@memberjunction/global';

/**
 * Represents the different types of decisions an AI agent can make during execution.
 * 
 * @public
 * @see {@link AgentDecisionResponse} for the complete decision structure
 */
export type AgentDecisionType = 
  /** Execute one or more actions using the available action framework */
  | 'execute_action' 
  /** Delegate work to one or more specialized sub-agents */
  | 'execute_subagent' 
  /** Signal that the current task has been completed successfully */
  | 'complete_task' 
  /** Request additional information from the user before proceeding */
  | 'request_clarification' 
  /** Continue processing with the current approach (for multi-step workflows) */
  | 'continue_processing';

/**
 * Input structure provided to the LLM for AI-driven decision making.
 * 
 * Contains all the context and available resources needed for the agent to make
 * informed decisions about what actions to take next.
 * 
 * @public
 * @see {@link AgentDecisionResponse} for the corresponding output structure
 * @see {@link AgentRunner.makeDecision} for usage in decision-making process
 */
export interface AgentDecisionInput {
  /** Current conversation context including user messages and previous responses */
  messages: ChatMessage[];
  /** Available actions that can be executed by this agent */
  availableActions: ActionDescription[];
  /** Available sub-agents that can be delegated to for specialized tasks */
  availableSubAgents: SubAgentDescription[];
  /** Primary goal or task the agent is trying to accomplish */
  currentGoal: string;
  /** Historical record of previous execution steps and their outcomes */
  executionHistory: ExecutionHistoryItem[];
  /** Additional context data passed from the parent execution context */
  contextData?: Record<string, unknown>;
}

/**
 * Response structure returned by the LLM containing the agent's decision and execution plan.
 * 
 * This represents the AI agent's autonomous decision about what to do next, including
 * the reasoning behind the decision and a detailed execution plan with proper ordering.
 * 
 * @public
 * @see {@link AgentDecisionInput} for the corresponding input structure
 * @see {@link ExecutionStep} for details about execution plan structure
 * @see {@link AgentRunner.executeDecidedActions} for execution implementation
 */
export interface AgentDecisionResponse {
  /** The type of decision made by the agent */
  decision: AgentDecisionType;
  /** Detailed explanation of why this decision was made */
  reasoning: string;
  /** 
   * Ordered list of execution steps (actions/sub-agents) with proper sequencing.
   * Steps with the same executionOrder run in parallel, different orders run sequentially.
   */
  executionPlan: ExecutionStep[];
  /** Whether this decision completes the overall task */
  isTaskComplete: boolean;
  /** Final response to return to the user if the task is complete */
  finalResponse?: string;
  /** Confidence level in this decision, ranging from 0.0 (low) to 1.0 (high) */
  confidence: number;
  /** Optional metadata providing additional context about the decision */
  metadata?: {
    /** Estimated total time to complete all execution steps (milliseconds) */
    estimatedDuration?: number;
    /** Risk assessment for the chosen execution plan */
    riskLevel?: 'low' | 'medium' | 'high';
    /** Strategy for handling potential failures during execution */
    failureStrategy?: string;
  };
}

/**
 * Describes an available action that can be executed by an agent.
 * 
 * Actions represent discrete operations that an agent can perform, such as
 * API calls, data processing, file operations, or external integrations.
 * 
 * @public
 * @see {@link ActionParameter} for parameter definitions
 * @see {@link AgentRunner.executeAction} for execution implementation
 */
export interface ActionDescription {
  /** Unique identifier for the action */
  id: string;
  /** Human-readable name of the action */
  name: string;
  /** Detailed description of what the action does */
  description: string;
  /** List of parameters that the action accepts */
  parameters: ActionParameter[];
  /** Whether this action can safely run in parallel with other actions */
  supportsParallel: boolean;
  /** Optional performance and operational metadata */
  metadata?: {
    /** Expected execution time in milliseconds */
    estimatedDuration?: number;
    /** Reliability score from 0.0 (unreliable) to 1.0 (very reliable) */
    reliability?: number;
    /** Resource consumption level for cost optimization */
    costLevel?: 'low' | 'medium' | 'high';
  };
}

/**
 * Describes an available sub-agent that can be delegated to for specialized tasks.
 * 
 * Sub-agents are specialized AI agents that handle specific domains or workflows,
 * allowing for hierarchical task decomposition and expertise-based delegation.
 * 
 * @public
 * @see {@link AgentRunner.executeSubAgent} for delegation implementation
 */
export interface SubAgentDescription {
  /** Unique identifier for the sub-agent */
  id: string;
  /** Human-readable name of the sub-agent */
  name: string;
  /** Description of the sub-agent's specialization and capabilities */
  description: string;
  /** Whether this sub-agent can run in parallel with other sub-agents */
  supportsParallel: boolean;
  /** Suggested execution order from metadata (used as default sequencing hint) */
  executionOrder?: number;
  /** Optional operational metadata */
  metadata?: {
    /** Execution context information or prerequisites */
    executionContext?: string;
    /** Current availability status of the sub-agent */
    availabilityStatus?: 'available' | 'busy' | 'offline';
  };
}

/**
 * Describes a parameter that an action accepts.
 * 
 * @public
 * @see {@link ActionDescription} for the containing action structure
 */
export interface ActionParameter {
  /** The parameter name used in action invocation */
  name: string;
  /** TypeScript-style type description (e.g., 'string', 'number', 'boolean') */
  type: string;
  /** Human-readable description of the parameter's purpose */
  description: string;
  /** Whether this parameter must be provided when invoking the action */
  required: boolean;
  /** Default value used when the parameter is not provided */
  defaultValue?: unknown;
}

/**
 * Execution step that can be an action or sub-agent.
 * 
 * Execution Order Logic:
 * - Steps with the SAME executionOrder number run in PARALLEL with each other
 * - Steps with DIFFERENT executionOrder numbers run SEQUENTIALLY (1 first, then 2, then 3, etc.)
 * - The allowParallel field can override parallel behavior within the same execution order
 */
export interface ExecutionStep {
  /** Type of execution step */
  type: 'action' | 'subagent';
  /** ID of action or subagent to execute */
  targetId: string;
  /** Parameters to pass */
  parameters?: Record<string, unknown>;
  /** 
   * Execution order position (1, 2, 3, etc.). 
   * Steps with the same number run in parallel, different numbers run sequentially. 
   */
  executionOrder: number;
  /** 
   * Whether this step can run in parallel with other steps at the same executionOrder.
   * Defaults to true. Set to false to force sequential execution even within the same order.
   * Use false when actions depend on each other or could conflict.
   */
  allowParallel?: boolean;
  /** Human-readable description of what this step accomplishes */
  description?: string;
}

/**
 * Records the history of an executed action, sub-agent, or decision.
 * 
 * Used to provide context about previous execution steps to help the agent
 * make informed decisions about subsequent actions.
 * 
 * @public
 * @see {@link AgentDecisionInput.executionHistory} for usage in decision context
 */
export interface ExecutionHistoryItem {
  /** The type of execution that was performed */
  type: 'action' | 'subagent' | 'decision';
  /** Identifier of the action, sub-agent, or decision that was executed */
  targetId: string;
  /** Parameters that were passed to the execution */
  parameters?: Record<string, unknown>;
  /** The result returned from the execution */
  result: unknown;
  /** Whether the execution completed successfully */
  success: boolean;
  /** Error message if the execution failed */
  errorMessage?: string;
  /** When the execution occurred */
  timestamp: Date;
}

/**
 * Input parameters for agent execution.
 * 
 * Contains all the configuration, context, and callbacks needed to execute an AI agent,
 * including support for multi-turn conversations, progress tracking, and cancellation.
 * 
 * @public
 * @see {@link AgentRunner.Execute} for the main execution method
 * @see {@link AgentExecutionResult} for the corresponding output structure
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
 * Result of an AI agent execution.
 * 
 * Contains the final outcome, decision history, and comprehensive metadata from
 * the agent's autonomous execution process.
 * 
 * @public
 * @see {@link AgentRunner.Execute} for the execution method that returns this
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
  /** Complete history of LLM decisions made during execution */
  decisionHistory?: AgentDecisionResponse[];
  /** Results from all actions that were executed */
  actionResults?: ActionResult[];
  /** The final decision that led to task completion or termination */
  finalDecision?: AgentDecisionResponse;
}

/**
 * State serialization interface for pause/resume functionality
 */
export interface SerializedAgentState {
  /** Current conversation messages */
  conversationMessages: ChatMessage[];
  /** Historical record of execution steps */
  executionHistory: ExecutionHistoryItem[];
  /** Complete history of LLM decisions */
  decisionHistory: AgentDecisionResponse[];
  /** Results from executed actions */
  actionResults: ActionResult[];
  /** Current execution step identifier */
  currentStep: string;
  /** Current step number */
  currentStepNumber: number;
  /** Execution context data */
  contextData: Record<string, unknown>;
  /** Agent configuration at time of serialization */
  agentConfiguration?: Record<string, unknown>;
  /** Timestamp when state was serialized */
  serializedAt: Date;
  /** Version of serialization format */
  version: string;
}

/**
 * Result from executing decided actions containing execution outcomes and history
 */
export interface ActionExecutionResult {
  /** Historical record of executed actions/subagents */
  historyItems: ExecutionHistoryItem[];
  /** Results from executed actions */
  actionResults: ActionResult[];
  /** New conversation messages generated during execution */
  newMessages: ChatMessage[];
}

/**
 * Result from executing a single execution step
 */
export interface SingleStepExecutionResult {
  /** History item representing the completed step */
  historyItem: ExecutionHistoryItem;
  /** Action result if step was an action execution */
  actionResult?: ActionResult;
  /** New message generated from the step execution */
  newMessage?: ChatMessage;
}

/**
 * Agent run history containing the run record and all execution steps
 */
export interface AgentRunHistory {
  /** The agent run database record */
  agentRun: AIAgentRunEntity;
  /** All execution steps for this run, ordered by step number */
  steps: AIAgentRunStepEntity[];
}

/**
 * Result from deserializing agent state containing restored execution data
 */
export interface DeserializedAgentState {
  /** Restored execution history */
  executionHistory: ExecutionHistoryItem[];
  /** Restored decision history */
  decisionHistory: AgentDecisionResponse[];
  /** Restored action results */
  actionResults: ActionResult[];
}

/**
 * Context information maintained during agent execution
 */
export interface AgentExecutionContext {
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
  /** Database run record for tracking */
  agentRun?: AIAgentRunEntity;
  /** Current step number for sequential tracking */
  currentStepNumber: number;
}

// Forward declaration to avoid circular dependency
export interface IAgentFactory {
  CreateAgentFromEntity(agentEntity: AIAgentEntityExtended, key?: string, ...additionalParams: any[]): BaseAgent;
  CreateAgent(agentName: string, key?: string, contextUser?: UserInfo, ...additionalParams: any[]): Promise<BaseAgent>
}

/**
 * AI Agent execution framework that provides autonomous decision-making and action coordination.
 * 
 * The AgentRunner implements a decision-driven architecture where agents make autonomous choices
 * about what actions to take using AI prompt embedding and system prompt control wrappers.
 * 
 * ## Architecture Overview
 * - **Agent-Specific Prompts**: Each agent has domain-specific AI prompts (e.g., DATA_GATHER instructions)
 * - **System Prompt Wrapper**: Database-stored templates that embed agent prompts via {% PromptEmbed %}
 * - **Deterministic Response Format**: System prompts enforce JSON response format for parsing
 * - **Action Coordination**: Agents can execute actions and delegate to sub-agents
 * - **Execution Tracking**: Comprehensive tracking via AIAgentRun and AIPromptRun entities
 * 
 * ## System Prompt Integration
 * AgentRunner delegates all prompt execution to {@link AIPromptRunner} with hierarchical prompt execution:
 * 1. Loads agent-specific prompts from AI Engine
 * 2. Uses agent type's SystemPromptID for hierarchical prompt structure
 * 3. AIPromptRunner executes agent prompt as child and embeds result in system prompt template
 * 4. System prompt provides execution context, available actions, and enforces JSON format
 * 5. LLM returns structured decisions that AgentRunner can deterministically parse
 * 
 * ## Decision-Driven Execution
 * The agent follows a decision loop:
 * 1. **Context Analysis**: Analyze current state and conversation history
 * 2. **Decision Making**: Use AI to choose next action (execute_action, execute_subagent, etc.)
 * 3. **Action Execution**: Execute chosen actions or delegate to sub-agents
 * 4. **Result Integration**: Process results and continue or complete task
 * 
 * ## Key Features
 * - **Metadata-driven configuration** using AIAgentEntity and AIAgentType
 * - **System prompt embedding** for deterministic response format control
 * - **Autonomous decision-making** with structured JSON responses
 * - **Action and sub-agent coordination** with parallel/sequential execution
 * - **Comprehensive tracking** with agent run and prompt run linking
 * - **Context management** for long conversations and execution history
 * - **Progress monitoring** and streaming response support
 * 
 * @example Basic Agent Execution
 * ```typescript
 * const runner = new AgentRunner(agentType, contextUser);
 * const params = new AgentExecutionParams();
 * params.goal = "Analyze sales data for Q4";
 * const result = await runner.Execute(params);
 * ```
 * 
 * @example Custom Agent Implementation
 * ```typescript
 * @RegisterClass(AgentRunner, "DataAnalysisAgent")
 * export class DataAnalysisAgent extends AgentRunner {
 *   protected async executeDecidedActions(
 *     context: AgentExecutionContext, 
 *     decision: AgentDecisionResponse
 *   ): Promise<AgentExecutionResult> {
 *     // Custom action execution logic
 *     return await super.executeDecidedActions(context, decision);
 *   }
 * }
 * ```
 */
export class BaseAgent {
  private _agent: AIAgentEntityExtended;
  private _factory: IAgentFactory;
  private _promptRunner: AIPromptRunner;
  private _contextUser?: UserInfo;
  protected _metadata: Metadata;
  

  /**
   * Creates a new AgentRunner instance for executing agents of a specific type.
   * 
   * The runner is bound to a particular agent type and can only execute agents
   * that match that type. This ensures type safety and proper system prompt usage.
   * 
   * @param agentType - The agent type definition that this runner will handle
   * @param contextUser - User context for authentication and permissions
   * 
   * @throws {Error} When agentType is null or invalid
   * 
   * @example
   * ```typescript
   * const agentType = await manager.GetAgentTypeEntity("Customer Support");
   * const runner = new AgentRunner(agentType, contextUser);
   * ```
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
   * Executes an AI agent using autonomous decision-making and action orchestration.
   * 
   * This is the primary entry point for agent execution. The method implements a sophisticated
   * decision-driven architecture where the LLM autonomously decides what actions to take,
   * in what order, and whether to use parallel or sequential execution.
   * 
   * **Key Features:**
   * - AI-driven decision making (no predetermined execution paths)
   * - Mixed action and sub-agent execution with proper ordering
   * - Context compression for long conversations
   * - Progress tracking and cancellation support
   * - Comprehensive error handling and fallback strategies
   * 
   * @param params - Execution parameters including agent entity, context, and callbacks
   * @returns Promise resolving to the execution result with decision history and outcomes
   * 
   * @throws {Error} When agent entity type doesn't match this runner's type
   * @throws {Error} When required parameters are missing or invalid
   * 
   * @example
   * ```typescript
   * const result = await runner.Execute({
   *   agentEntity: myAgent,
   *   contextUser: user,
   *   data: { customerQuery: "Help with my order" },
   *   conversationMessages: [...],
   *   onProgress: (progress) => console.log(progress.message),
   *   cancellationToken: controller.signal
   * });
   * 
   * if (result.success) {
   *   console.log("Agent completed:", result.finalDecision?.finalResponse);
   * }
   * ```
   * 
   * @see {@link AgentExecutionParams} for parameter details
   * @see {@link AgentExecutionResult} for return value structure
   */
  public async Execute(params: AgentExecutionParams): Promise<AgentExecutionResult> {
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
        message: `Initializing agent '${this.agent.Name}'`,
        metadata: { agentName: this.agent.Name, agentId: this.agent.ID }
      });

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
        message: `Agent '${this.agent.Name}' execution completed`,
        metadata: { 
          success: result.success,
          executionTimeMS: result.executionTimeMS
        }
      });

      return result;

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
   * Core decision-driven execution loop.
   * 
   * Implements the main execution logic using autonomous LLM decision-making.
   * Continues iterating until the task is complete or max iterations reached.
   * 
   * @param context - The execution context containing agent and conversation state
   * @returns Promise resolving to the execution result
   * 
   * @protected
   */
  protected async executeCore(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    let executionStepEntity: AIAgentRunStepEntity | null = null;
    
    try {
      // Create initial execution step for core logic
      executionStepEntity = await this.createExecutionStep(
        context,
        'decision',
        'Agent core execution loop',
        this.agent.ID,
        { maxIterations: 10 }
      );

      const decisionHistory: AgentDecisionResponse[] = [];
      const executionHistory: ExecutionHistoryItem[] = [];
      const actionResults: ActionResult[] = [];
      let currentMessages = [...context.conversationMessages];
      let maxIterations = 10; // Prevent infinite loops
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        
        // Update current step and save state
        context.currentStep = `decision-iteration-${iteration}`;
        await this.updateAgentRunState(context, executionHistory, decisionHistory, actionResults);
        
        // Check for cancellation
        if (context.params.cancellationToken?.aborted) {
          if (executionStepEntity) {
            await this.completeExecutionStep(executionStepEntity, false, null, 'Execution cancelled by user');
          }
          await this.finalizeAgentRun(context, false, 'Execution cancelled by user', null, null, null);
          return this.createCancelledResult(context.startTime);
        }

        // Report progress with run information
        this.sendProgress(context.params.onProgress, {
          step: 'subagent_coordination',
          percentage: 30 + (50 * iteration / maxIterations),
          message: `Decision-making iteration ${iteration}/${maxIterations}`,
          metadata: { 
            iteration, 
            maxIterations,
            runId: context.agentRun?.ID,
            stepNumber: context.currentStepNumber
          }
        });

        // Step 1: Create decision step and input
        const decisionStepEntity = await this.createExecutionStep(
          context,
          'decision',
          `Decision making - iteration ${iteration}`,
          undefined,
          { iteration, maxIterations, messagesCount: currentMessages.length }
        );

        let decision: AgentDecisionResponse;
        try {
          const decisionInput = await this.createDecisionInput(context, currentMessages, executionHistory);
          decision = await this.makeDecision(context, decisionInput);
          decisionHistory.push(decision);
          
          await this.completeExecutionStep(decisionStepEntity, true, {
            decision: decision.decision,
            reasoning: decision.reasoning,
            executionPlanLength: decision.executionPlan.length,
            confidence: decision.confidence
          });
        } catch (error) {
          await this.completeExecutionStep(decisionStepEntity, false, null, error.message);
          throw error;
        }

        // Step 3: Handle the decision outcome
        if (decision.isTaskComplete || decision.decision === 'complete_task') {
          // Create completion step
          const completionStepEntity = await this.createExecutionStep(
            context,
            'completion',
            'Task completion',
            undefined,
            { finalResponse: decision.finalResponse }
          );
          
          await this.completeExecutionStep(completionStepEntity, true, {
            taskComplete: true,
            finalResponse: decision.finalResponse
          });
          
          if (executionStepEntity) {
            await this.completeExecutionStep(executionStepEntity, true, {
              iterations: iteration,
              decisionCount: decisionHistory.length,
              taskCompleted: true
            });
          }
          
          // Finalize the agent run as successful
          const result = {
            success: true,
            result: decision.finalResponse || decision.reasoning,
            conversationMessages: currentMessages,
            decisionHistory,
            actionResults: actionResults,
            finalDecision: decision,
            metadata: {
              iterations: iteration,
              decisionCount: decisionHistory.length,
              actionExecutions: actionResults.length,
              runId: context.agentRun?.ID
            }
          };
          
          await this.finalizeAgentRun(context, true, null, result.result, decisionHistory, actionResults);
          return result;
        }

        if (decision.decision === 'request_clarification') {
          // Create clarification step
          const clarificationStepEntity = await this.createExecutionStep(
            context,
            'clarification',
            'Requesting user clarification',
            undefined,
            { reasoning: decision.reasoning }
          );
          
          await this.completeExecutionStep(clarificationStepEntity, true, {
            clarificationRequest: decision.reasoning
          });
          
          if (executionStepEntity) {
            await this.completeExecutionStep(executionStepEntity, false, null, 'Clarification needed from user');
          }
          
          const result = {
            success: false,
            errorMessage: decision.reasoning,
            conversationMessages: currentMessages,
            decisionHistory,
            metadata: {
              needsClarification: true,
              clarificationRequest: decision.reasoning,
              runId: context.agentRun?.ID
            }
          };
          
          await this.finalizeAgentRun(context, false, decision.reasoning, null, decisionHistory, actionResults);
          return result;
        }

        // Step 4: Execute the decided actions with logging
        let executionResults;
        try {
          executionResults = await this.executeDecidedActions(context, decision, executionHistory);
          
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
        } catch (error) {
          LogError(`Error executing actions in iteration ${iteration}: ${error.message}`);
          // Continue execution loop despite action failures
        }
        
        // Update state with latest results
        await this.updateAgentRunState(context, executionHistory, decisionHistory, actionResults);
      }

      // If we reach here, we hit the max iterations limit
      if (executionStepEntity) {
        await this.completeExecutionStep(executionStepEntity, false, {
          iterations: iteration,
          maxIterationsReached: true
        }, `Reached maximum iterations (${maxIterations}) without task completion`);
      }
      
      const result = {
        success: false,
        errorMessage: `Agent reached maximum iterations (${maxIterations}) without completing the task`,
        conversationMessages: currentMessages,
        decisionHistory,
        actionResults: actionResults,
        metadata: {
          maxIterationsReached: true,
          iterations: iteration,
          decisionCount: decisionHistory.length,
          runId: context.agentRun?.ID
        }
      };
      
      await this.finalizeAgentRun(context, false, result.errorMessage, null, decisionHistory, actionResults);
      return result;
      
    } catch (error) {
      LogError(`Error in executeCore for agent '${this.agent.Name}': ${error.message}`);
      
      if (executionStepEntity) {
        await this.completeExecutionStep(executionStepEntity, false, null, error.message);
      }
      
      const result = {
        success: false,
        errorMessage: error.message,
        metadata: {
          errorStep: 'executeCore',
          agentName: this.agent.Name,
          runId: context.agentRun?.ID
        }
      };
      
      await this.finalizeAgentRun(context, false, error.message, null, [], []);
      return result;
    }
  }
  
  /**
   * Initializes the execution context for the agent and creates the database run record.
   */
  private async initializeContext(params: AgentExecutionParams, startTime: Date): Promise<AgentExecutionContext> {
    // Create the AIAgentRun record
    const agentRun = await this._metadata.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
    agentRun.NewRecord();
    agentRun.AgentID = this.agent.ID;
    agentRun.Status = 'Running';
    agentRun.StartedAt = startTime;
    
    // Set optional context fields
    if (params.contextUser) {
      agentRun.UserID = params.contextUser.ID;
    }
    
    // Extract conversation ID from parameters or data
    const conversationId = params.data?.conversationId as string || 
                          params.data?.conversationID as string;
    if (conversationId) {
      agentRun.ConversationID = conversationId;
    }
    
    // Set parent run ID if this is a sub-agent execution
    const parentRunId = params.data?.parentRunId as string ||
                       params.data?.parentRunID as string;
    if (parentRunId) {
      agentRun.ParentRunID = parentRunId;
    }
    
    // Save the run record
    const saveResult = await agentRun.Save();
    if (!saveResult) {
      throw new Error('Failed to create agent run record in database');
    }
    
    // Initialize and serialize the starting state
    const initialState: SerializedAgentState = {
      conversationMessages: params.conversationMessages || [],
      executionHistory: [],
      decisionHistory: [],
      actionResults: [],
      currentStep: 'initialization',
      currentStepNumber: 1,
      contextData: params.data || {},
      agentConfiguration: {},
      serializedAt: new Date(),
      version: '1.0'
    };
    
    agentRun.AgentState = JSON.stringify(initialState);
    await agentRun.Save();
    
    return {
      conversationMessages: params.conversationMessages || [],
      params,
      data: params.data || {},
      currentStep: 'initialization',
      startTime,
      agentRun,
      currentStepNumber: 1
    };
  }

  /**
   * Processes conversation context, applying compression if needed.
   */
  private async processContext(context: AgentExecutionContext): Promise<void> {
    // Apply context compression if configured
    if (this.agent.EnableContextCompression && 
        this.agent.ContextCompressionMessageThreshold &&
        context.conversationMessages.length > this.agent.ContextCompressionMessageThreshold) {
      
      await this.compressContext(context);
    }
  }

  /**
   * Compresses conversation context using the configured compression prompt.
   */
  private async compressContext(context: AgentExecutionContext): Promise<void> {
    try {
      if (!this.agent.ContextCompressionPromptID) {
        LogStatus(`Context compression enabled but no compression prompt configured for agent '${this.agent.Name}'`);
        return;
      }

      const retentionCount = this.agent.ContextCompressionMessageRetentionCount || 5;
      const messagesToCompress = context.conversationMessages.slice(0, -retentionCount);
      const messagesToKeep = context.conversationMessages.slice(-retentionCount);

      if (messagesToCompress.length === 0) {
        return;
      }

      // Load compression prompt
      const compressionPrompt = AIEngine.Instance.Prompts.find(p => p.ID === this.agent.ContextCompressionPromptID);
      if (!compressionPrompt) {
        LogError(`Compression prompt not found: ${this.agent.ContextCompressionPromptID}`);
        return;
      }

      // Execute compression prompt
      const compressionParams: AIPromptParams = {
        prompt: compressionPrompt,
        data: {
          messages: messagesToCompress,
          messageCount: messagesToCompress.length
        },
        contextUser: context.params.contextUser,
        agentRunId: context.agentRun?.ID  // Link compression prompt to agent run
      };

      const compressionResult = await this.promptRunner.ExecutePrompt(compressionParams);

      if (compressionResult.success && compressionResult.rawResult) {
        // Replace compressed messages with summary
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary] ${compressionResult.rawResult}`
        };

        context.conversationMessages = [summaryMessage, ...messagesToKeep];
        LogStatus(`Compressed ${messagesToCompress.length} messages into summary for agent '${this.agent.Name}'`);
      }

    } catch (error) {
      LogError(`Error compressing context for agent '${this.agent.Name}': ${error.message}`);
    }
  }

  /**
   * Loads the prompts associated this agent.
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
        const agentType = await this.loadAgentType();
        if (agentType && agentType.SystemPromptID) {
          const systemPrompt = AIEngine.Instance.Prompts.find(p => p.ID === agentType.SystemPromptID);
          if (systemPrompt && systemPrompt.Status === 'Active') {
            results.push(systemPrompt);
          } else {
            LogStatus(`System prompt not found or inactive for agent type '${agentType.Name}'`);
          }
        } else {
          LogStatus(`No active prompts found for agent '${this.agent.Name}' and no system prompt configured`);
        }
      }

      return results;
    } catch (error) {
      LogError(`Error loading agent prompts for '${this.agent.Name}': ${error.message}`);
      return [];
    }
  }

  private async loadAgentType(): Promise<AIAgentTypeEntity | null> {
    try {
      if (!this.agent.TypeID) {
        LogStatus(`Agent '${this.agent.Name}' has no AgentTypeID defined`);
        return null;
      }

      // Load the agent type entity from the database
      await AIEngine.Instance.Config(false, this.contextUser);
      const agentType = AIEngine.Instance.AgentTypes.find(at => at.ID === this.agent.TypeID);
      if (!agentType) {
        LogError(`Agent type not found for ID: ${this.agent.TypeID}`);
        return null;
      }
      return agentType;
    } catch (error) {
      LogError(`Error loading agent type for '${this.agent.Name}': ${error.message}`);
      return null;
    }
  }

  /**
   * Loads child agents if the given agent has hierarchical structure.
   */
  private async loadChildAgents(): Promise<AIAgentEntityExtended[]> {
    try {
      const childAgents = AIEngine.Instance.Agents
        .filter(a => a.ParentID === this.agent.ID)
        .sort((a, b) => (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0));

      return childAgents;
    } catch (error) {
      LogError(`Error loading child agents for '${this.agent.Name}': ${error.message}`);
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
   * Creates a new execution step record in the database.
   * 
   * @param context - The execution context containing run information
   * @param stepType - Type of step (decision, action, subagent, etc.)
   * @param stepName - Human-readable name for the step
   * @param targetId - Optional ID of the target being executed
   * @param inputData - Optional input data for the step
   * @returns Promise resolving to the created step entity
   * 
   * @protected
   */
  protected async createExecutionStep(
    context: AgentExecutionContext,
    stepType: string,
    stepName: string,
    targetId?: string,
    inputData?: Record<string, unknown>
  ): Promise<AIAgentRunStepEntity> {
    try {
      if (!context.agentRun) {
        throw new Error('Agent run record not found in context');
      }

      const stepEntity = await this._metadata.GetEntityObject<AIAgentRunStepEntity>('MJ: AI Agent Run Steps', this.contextUser);
      stepEntity.NewRecord();
      stepEntity.AgentRunID = context.agentRun.ID;
      stepEntity.StepNumber = context.currentStepNumber;
      stepEntity.StepType = stepType;
      stepEntity.StepName = stepName;
      stepEntity.Status = 'Running';
      stepEntity.StartedAt = new Date();
      
      if (targetId) {
        stepEntity.TargetID = targetId;
      }
      
      if (inputData) {
        stepEntity.InputData = JSON.stringify(inputData);
      }
      
      const saveResult = await stepEntity.Save();
      if (!saveResult) {
        throw new Error(`Failed to create execution step: ${stepName}`);
      }
      
      // Increment step number for next step
      context.currentStepNumber++;
      
      return stepEntity;
    } catch (error) {
      LogError(`Error creating execution step '${stepName}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Completes an execution step by updating its status and results.
   * 
   * @param stepEntity - The step entity to complete
   * @param success - Whether the step completed successfully
   * @param outputData - Optional output data from the step
   * @param errorMessage - Optional error message if the step failed
   * 
   * @protected
   */
  protected async completeExecutionStep(
    stepEntity: AIAgentRunStepEntity,
    success: boolean,
    outputData?: unknown,
    errorMessage?: string
  ): Promise<void> {
    try {
      stepEntity.Status = success ? 'Completed' : 'Failed';
      stepEntity.Success = success;
      stepEntity.CompletedAt = new Date();
      
      if (outputData) {
        stepEntity.OutputData = JSON.stringify(outputData);
      }
      
      if (errorMessage) {
        stepEntity.ErrorMessage = errorMessage;
      }
      
      await stepEntity.Save();
    } catch (error) {
      LogError(`Error completing execution step: ${error.message}`);
    }
  }

  /**
   * Serializes the current agent state for pause/resume functionality.
   * 
   * @param context - Current execution context
   * @param executionHistory - Historical execution data
   * @param decisionHistory - Decision history
   * @param actionResults - Action execution results
   * @returns Serialized state object
   * 
   * @protected
   */
  protected serializeAgentState(
    context: AgentExecutionContext,
    executionHistory: ExecutionHistoryItem[],
    decisionHistory: AgentDecisionResponse[],
    actionResults: ActionResult[]
  ): SerializedAgentState {
    return {
      conversationMessages: context.conversationMessages,
      executionHistory,
      decisionHistory,
      actionResults,
      currentStep: context.currentStep,
      currentStepNumber: context.currentStepNumber,
      contextData: context.data,
      agentConfiguration: context.configuration || {},
      serializedAt: new Date(),
      version: '1.0'
    };
  }

  /**
   * Deserializes agent state from a saved state object.
   * 
   * @param serializedState - The serialized state to restore
   * @param context - Current execution context to update
   * @returns Restored execution data
   * 
   * @protected
   */
  protected deserializeAgentState(
    serializedState: SerializedAgentState,
    context: AgentExecutionContext
  ): DeserializedAgentState {
    // Update context with restored state
    context.conversationMessages = serializedState.conversationMessages;
    context.currentStep = serializedState.currentStep;
    context.currentStepNumber = serializedState.currentStepNumber;
    context.data = { ...context.data, ...serializedState.contextData };
    context.configuration = { ...context.configuration, ...serializedState.agentConfiguration };
    
    return {
      executionHistory: serializedState.executionHistory,
      decisionHistory: serializedState.decisionHistory,
      actionResults: serializedState.actionResults
    };
  }

  /**
   * Updates the agent run state in the database.
   * 
   * @param context - Current execution context
   * @param executionHistory - Current execution history
   * @param decisionHistory - Current decision history  
   * @param actionResults - Current action results
   * 
   * @protected
   */
  protected async updateAgentRunState(
    context: AgentExecutionContext,
    executionHistory: ExecutionHistoryItem[],
    decisionHistory: AgentDecisionResponse[],
    actionResults: ActionResult[]
  ): Promise<void> {
    try {
      if (!context.agentRun) {
        return;
      }
      
      const serializedState = this.serializeAgentState(context, executionHistory, decisionHistory, actionResults);
      context.agentRun.AgentState = JSON.stringify(serializedState);
      await context.agentRun.Save();
    } catch (error) {
      LogError(`Error updating agent run state: ${error.message}`);
    }
  }

  /**
   * Finalizes the agent run by updating final status, results, and resource metrics.
   * 
   * @param context - Current execution context
   * @param success - Whether the execution was successful
   * @param errorMessage - Error message if execution failed
   * @param finalResult - Final result if execution succeeded
   * @param decisionHistory - Complete decision history
   * @param actionResults - Complete action results
   * 
   * @protected
   */
  protected async finalizeAgentRun(
    context: AgentExecutionContext,
    success: boolean,
    errorMessage: string | null,
    finalResult: unknown,
    decisionHistory: AgentDecisionResponse[] | null,
    actionResults: ActionResult[] | null
  ): Promise<void> {
    try {
      if (!context.agentRun) {
        return;
      }
      
      // Update final status and timing
      context.agentRun.Status = success ? 'Completed' : 'Failed';
      context.agentRun.Success = success;
      context.agentRun.CompletedAt = new Date();
      
      if (errorMessage) {
        context.agentRun.ErrorMessage = errorMessage;
      }
      
      if (finalResult) {
        context.agentRun.Result = typeof finalResult === 'string' ? finalResult : JSON.stringify(finalResult);
      }
      
      // Calculate resource metrics from action results
      if (actionResults && actionResults.length > 0) {
        let totalTokens = 0;
        let totalCost = 0;
        
        for (const actionResult of actionResults) {
          // Extract token usage and cost from action results if available
          if (actionResult.Params) {
            for (const param of actionResult.Params) {
              if (param.Name === 'tokensUsed' && typeof param.Value === 'number') {
                totalTokens += param.Value;
              }
              if (param.Name === 'cost' && typeof param.Value === 'number') {
                totalCost += param.Value;
              }
            }
          }
        }
        
        if (totalTokens > 0) {
          context.agentRun.TotalTokensUsed = totalTokens;
        }
        
        if (totalCost > 0) {
          context.agentRun.TotalCost = totalCost;
        }
      }
      
      // Update final state
      if (decisionHistory && actionResults) {
        const finalState = this.serializeAgentState(context, [], decisionHistory, actionResults);
        context.agentRun.AgentState = JSON.stringify(finalState);
      }
      
      await context.agentRun.Save();
    } catch (error) {
      LogError(`Error finalizing agent run: ${error.message}`);
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
    const availableActions = await this.getAvailableActionDescriptions();
    const availableSubAgents = await this.getAvailableSubAgentDescriptions();
    
    // Determine current goal from context or agent description
    const currentGoal = context.data.goal as string || 
                       context.data.task as string || 
                       this.agent.Description || 
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
   * Makes an autonomous decision using AI prompt execution with system prompt embedding.
   * 
   * This method delegates all prompt execution to {@link AIPromptRunner} with system prompt
   * embedding to ensure deterministic JSON response format and comprehensive execution control.
   * 
   * ## Architecture Flow
   * 1. **Load Agent Prompts**: Gets agent-specific prompts from AI Engine
   * 2. **Prepare Context**: Creates data context with available actions, sub-agents, and execution history
   * 3. **System Prompt Embedding**: Uses AIPromptRunner with systemPromptId to:
   *    - Load system prompt template from database
   *    - Embed agent prompt using {% PromptEmbed %} syntax
   *    - Render complete system prompt with execution context
   * 4. **Execute Decision**: AIPromptRunner handles all template rendering and LLM execution
   * 5. **Parse Response**: Validates and parses structured JSON decision response
   * 
   * ## System Prompt Integration
   * - Uses `this.agentType.SystemPromptID` for hierarchical prompt execution
   * - System prompt enforces deterministic JSON response format
   * - Agent prompt provides domain-specific logic (e.g., DATA_GATHER instructions)
   * - Available actions and sub-agents are injected for decision-making context
   * 
   * ## Response Format
   * The system prompt ensures the LLM returns structured JSON that can be deterministically
   * parsed by the AgentRunner for execution coordination and action planning.
   * 
   * @param context - Current execution context with agent entity and conversation
   * @param decisionInput - Available resources and context for decision-making
   * @returns Promise resolving to structured decision response with execution plan
   * 
   * @protected
   * @see {@link AIPromptRunner.ExecutePrompt} for prompt execution implementation
   * @see {@link parseAndValidateDecision} for response parsing and validation
   */
  protected async makeDecision(
    context: AgentExecutionContext,
    decisionInput: AgentDecisionInput
  ): Promise<AgentDecisionResponse> {
    try {
      // Get agent-specific prompts from AI Engine
      const prompts = await this.loadAgentPrompts();
      const agentType = await this.loadAgentType();
      
      if (prompts.length === 0) {
        throw new Error(`No prompts found for agent ${this.agent.Name}`);
      }

      // Use the first (highest priority) agent prompt
      const primaryprompt = prompts[0];

      // Prepare context-aware decision prompt
      const contextualPrompt = this.buildContextualDecisionPrompt(decisionInput);

      // Prepare data context for system prompt rendering
      const promptData = {
        agentName: this.agent.Name,
        agentDescription: this.agent.Description,
        availableActions: decisionInput.availableActions,
        availableSubAgents: decisionInput.availableSubAgents,
        currentGoal: decisionInput.currentGoal,
        executionHistory: decisionInput.executionHistory,
        contextData: decisionInput.contextData
      };

      // Prepare conversation messages for the AIPromptRunner
      const conversationMessages: ChatMessage[] = [
        ...decisionInput.messages,
        {
          role: 'user',
          content: contextualPrompt
        }
      ];

      // Configure AIPromptRunner parameters with system prompt embedding using new childPrompts approach
      const promptParams = new AIPromptParams();
      
      if (agentType && agentType.SystemPromptID && agentType.SystemPromptID !== primaryprompt.ID) {
        // Use hierarchical prompt execution: system prompt as parent, agent prompt as child
        const systemPrompt = prompts.find(p => p.ID === agentType.SystemPromptID);
        if (systemPrompt) {
          // Create child prompt parameter for the primary agent prompt
          const childPromptParams = new AIPromptParams();
          childPromptParams.prompt = primaryprompt;
          childPromptParams.data = promptData;
          childPromptParams.contextUser = context.params.contextUser;
          
          const childPrompt = new ChildPromptParam(childPromptParams, 'agentPrompt');
          
          // Configure parent (system) prompt with child embedded
          promptParams.prompt = systemPrompt;
          promptParams.childPrompts = [childPrompt];
          promptParams.data = promptData; // System prompt can also access this data
        } else {
          // Fallback to primary prompt if system prompt not found
          promptParams.prompt = primaryprompt;
          promptParams.data = promptData;
        }
      } else {
        // No system prompt embedding needed, use primary prompt directly
        promptParams.prompt = primaryprompt;
        promptParams.data = promptData;
      }
      
      promptParams.conversationMessages = conversationMessages;
      promptParams.templateMessageRole = 'system';
      promptParams.contextUser = context.params.contextUser;
      promptParams.agentRunId = context.agentRun.ID; // Link to agent run for tracking

      // Execute prompt with hierarchical execution (if child prompts are configured)
      const promptResult = await this._promptRunner.ExecutePrompt(promptParams);

      if (!promptResult.success) {
        throw new Error(`AI prompt execution failed: ${promptResult.errorMessage}`);
      }

      // Parse and validate the LLM response
      const decision = await this.parseAndValidateDecision(promptResult.rawResult || '');
      
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
   * Builds a contextual decision prompt based on the current state and goals.
   */
  private buildContextualDecisionPrompt(decisionInput: AgentDecisionInput): string {
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
  private async parseAndValidateDecision(llmResponse: string): Promise<AgentDecisionResponse> {
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
        return this.createFallbackDecision(llmResponse);
      }

      // Validate and normalize the decision
      return this.validateAndNormalizeDecision(decision);
    } catch (error) {
      LogError(`Error parsing decision: ${error.message}`);
      return this.createFallbackDecision(llmResponse);
    }
  }

  /**
   * Creates a fallback decision when JSON parsing fails.
   */
  private createFallbackDecision(llmResponse: string): AgentDecisionResponse {
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
   * Executes the LLM's decided execution plan with proper ordering and parallelization.
   * 
   * Handles mixed actions and sub-agents, respecting execution order for sequential/parallel execution.
   * Groups steps by execution order and executes each group according to parallelization rules.
   * 
   * @param context - Current execution context
   * @param decision - The LLM's decision containing the execution plan
   * @param executionHistory - History of previous executions for context
   * @returns Promise resolving to execution results and history
   * 
   * @protected
   */
  protected async executeDecidedActions(
    context: AgentExecutionContext,
    decision: AgentDecisionResponse,
    executionHistory: ExecutionHistoryItem[]
  ): Promise<ActionExecutionResult> {
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

      // Determine execution strategy for this order
      // If ANY step has allowParallel=false, execute all steps in this order sequentially
      // Otherwise, execute all steps in parallel (default behavior)
      const hasSequentialSteps = steps.some(step => step.allowParallel === false);
      
      if (hasSequentialSteps) {
        // Execute all steps in this order sequentially
        const sequentialResults = await this.executeStepsSequentially(
          context, 
          steps, 
          executionHistory
        );
        
        historyItems.push(...sequentialResults.historyItems);
        actionResults.push(...sequentialResults.actionResults);
        newMessages.push(...sequentialResults.newMessages);
      } else {
        // Execute all steps in this order in parallel (default behavior)
        const parallelResults = await this.executeStepsInParallel(
          context, 
          steps, 
          executionHistory
        );
        
        historyItems.push(...parallelResults.historyItems);
        actionResults.push(...parallelResults.actionResults);
        newMessages.push(...parallelResults.newMessages);
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
  ): Promise<ActionExecutionResult> {
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
  ): Promise<ActionExecutionResult> {
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
  ): Promise<SingleStepExecutionResult> {
    const timestamp = new Date();
    
    // Create database step record
    const stepEntity = await this.createExecutionStep(
      context,
      step.type,
      step.description || `Execute ${step.type} '${step.targetId}'`,
      step.targetId,
      step.parameters
    );
    
    try {
      if (step.type === 'action') {
        // Execute action using ActionEngine
        const actionResult = await this.executeAction(step.targetId, step.parameters || {});
        
        const statusMessage = step.description 
          ? `${step.description} - ${actionResult.Success ? 'Completed' : 'Failed'}`
          : `Executed action '${step.targetId}': ${actionResult.Success ? 'Success' : actionResult.Message}`;
        
        // Complete the database step record
        await this.completeExecutionStep(
          stepEntity,
          actionResult.Success,
          {
            actionResult: {
              success: actionResult.Success,
              message: actionResult.Message,
              paramsCount: actionResult.Params?.length || 0
            }
          },
          actionResult.Success ? undefined : actionResult.Message
        );
        
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
        
        // Complete the database step record
        await this.completeExecutionStep(
          stepEntity,
          subagentResult.success,
          {
            subagentResult: {
              success: subagentResult.success,
              executionTimeMS: subagentResult.executionTimeMS,
              resultLength: subagentResult.result ? JSON.stringify(subagentResult.result).length : 0
            }
          },
          subagentResult.success ? undefined : subagentResult.errorMessage
        );
        
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
        const errorMessage = `Unknown execution step type: ${step.type}`;
        await this.completeExecutionStep(stepEntity, false, null, errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      // Complete the step record with error
      await this.completeExecutionStep(stepEntity, false, null, error.message);
      
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
   * Gets available actions for the given agent entity.
   */
  protected async getAvailableActionDescriptions(): Promise<ActionDescription[]> {
    try {
      // Get agent actions from metadata
      const agentActions = AIEngine.Instance.AgentActions
        .filter(aa => aa.AgentID === this.agent.ID && aa.Status === 'Active');
      
      const actions: ActionDescription[] = [];

      await ActionEngineServer.Instance.Config(false, this.contextUser);
      
      for (const agentAction of agentActions) {
        const action = ActionEngineServer.Instance.Actions.find(a => a.ID === agentAction.ActionID);
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
   * Gets available sub-agents for the given agent entity.
   */
  protected async getAvailableSubAgentDescriptions(): Promise<SubAgentDescription[]> {
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

      return await ActionEngineServer.Instance.RunActionByID({
        ActionID: actionId,
        ContextUser: this.contextUser,
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

      const subAgent = this.factory.CreateAgentFromEntity(subAgentEntity, null, this._contextUser);
      
      // Create execution parameters for sub-agent with hierarchical tracking
      const subAgentParams: AgentExecutionParams = {
        contextUser: parentContext.params.contextUser,
        data: { 
          ...parentContext.data, 
          ...parameters,
          // Pass parent run ID for hierarchical tracking
          parentRunId: parentContext.agentRun?.ID,
          parentRunID: parentContext.agentRun?.ID  // Alternative naming
        },
        conversationMessages: [...parentContext.conversationMessages],
        cancellationToken: parentContext.params.cancellationToken,
        onProgress: parentContext.params.onProgress,
        onStreaming: parentContext.params.onStreaming
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
   * Creates a concise summary of execution results.
   * 
   * @param decision - The decision that was executed
   * @param executionResults - Results from executing the decision
   * @returns Human-readable summary string
   * 
   * @protected
   */
  protected createExecutionSummary(
    decision: AgentDecisionResponse,
    executionResults: ActionExecutionResult
  ): string {
    const { historyItems } = executionResults;
    const successful = historyItems.filter(h => h.success);
    const failed = historyItems.filter(h => !h.success);
    
    const parts: string[] = [
      `Executed ${decision.executionPlan.length} steps: ${decision.reasoning}`
    ];
    
    if (successful.length) {
      parts.push(`✅ Success: ${successful.map(h => h.targetId).join(', ')}`);
    }
    
    if (failed.length) {
      parts.push(`❌ Failed: ${failed.map(h => h.targetId).join(', ')}`);
    }
    
    return parts.join('\n');
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

  /**
   * Retrieves the complete run history for a specific agent run, including all execution steps.
   * 
   * @param agentRunId - ID of the agent run to retrieve
   * @param contextUser - User context for database access
   * @returns Promise resolving to the run details with steps, or null if not found
   * 
   * @public
   */
  public async getRunHistory(agentRunId: string): Promise<AgentRunHistory | null> {
    try {
      // Load the agent run
      const agentRun = await this._metadata.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
      const loadSuccess = await agentRun.Load(agentRunId);
      if (!loadSuccess) {
        return null;
      }
      
      // Load all steps for this run
      const runView = new RunView();
      const stepsResult = await runView.RunView<AIAgentRunStepEntity>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID = '${agentRunId}'`,
        OrderBy: 'StepNumber ASC',
        ResultType: 'entity_object'
      }, this.contextUser);
      
      return {
        agentRun,
        steps: stepsResult.Results
      };
    } catch (error) {
      LogError(`Error retrieving run history for '${agentRunId}': ${error.message}`);
      return null;
    }
  }

  /**
   * Pauses the current execution by serializing state and updating the run status.
   * 
   * Note: This method should be called from within an execution context where 
   * the agent run is already created.
   * 
   * @param context - Current execution context
   * @param reason - Optional reason for pausing
   * @returns Promise resolving to the agent run ID
   * 
   * @public
   */
  public async pauseExecution(
    context: AgentExecutionContext,
    reason: string = 'Execution paused by user'
  ): Promise<string | null> {
    try {
      if (!context.agentRun) {
        throw new Error('No active agent run to pause');
      }
      
      // Update run status to paused
      context.agentRun.Status = 'Paused';
      context.agentRun.ErrorMessage = reason;
      
      // Save current state
      await this.updateAgentRunState(context, [], [], []);
      await context.agentRun.Save();
      
      LogStatus(`Agent run '${context.agentRun.ID}' paused: ${reason}`);
      return context.agentRun.ID;
    } catch (error) {
      LogError(`Error pausing execution: ${error.message}`);
      return null;
    }
  }

  /**
   * Resumes execution from a paused agent run by restoring state and continuing.
   * 
   * @param agentRunId - ID of the paused agent run to resume
   * @param contextUser - User context for the resumed execution
   * @returns Promise resolving to the execution result
   * 
   * @public
   */
  public async resumeExecution(
    agentRunId: string,
    contextUser?: UserInfo
  ): Promise<AgentExecutionResult> {
    try {
      // Load the paused agent run
      const agentRun = await this._metadata.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
      const loadSuccess = await agentRun.Load(agentRunId);
      if (!loadSuccess) {
        throw new Error(`Agent run '${agentRunId}' not found`);
      }
      
      if (agentRun.Status !== 'Paused') {
        throw new Error(`Agent run '${agentRunId}' is not in paused state (current status: ${agentRun.Status})`);
      }
      
      // Load the agent entity
      const agentEntity = AIEngine.Instance.Agents.find(a => a.ID === agentRun.AgentID);
      if (!agentEntity) {
        throw new Error(`Agent entity not found for run '${agentRunId}'`);
      }
      
      // Deserialize the saved state
      let serializedState: SerializedAgentState;
      try {
        serializedState = JSON.parse(agentRun.AgentState || '{}');
      } catch (error) {
        throw new Error(`Failed to parse saved agent state: ${error.message}`);
      }
      
      // Create execution context for resumption
      const resumedContext: AgentExecutionContext = {
        conversationMessages: serializedState.conversationMessages || [],
        params: {
          contextUser,
          data: serializedState.contextData || {},
          conversationMessages: serializedState.conversationMessages || []
        },
        data: serializedState.contextData || {},
        configuration: serializedState.agentConfiguration || {},
        currentStep: serializedState.currentStep || 'resumed',
        startTime: agentRun.StartedAt,
        agentRun,
        currentStepNumber: serializedState.currentStepNumber || 1
      };
      
      // Update status back to running
      agentRun.Status = 'Running';
      agentRun.ErrorMessage = null;
      await agentRun.Save();
      
      // Restore execution data
      const { executionHistory, decisionHistory, actionResults } = 
        this.deserializeAgentState(serializedState, resumedContext);
      
      LogStatus(`Resuming agent run '${agentRunId}' from step: ${resumedContext.currentStep}`);
      
      // Continue execution from where it left off
      return await this.executeCore(resumedContext);
      
    } catch (error) {
      LogError(`Error resuming execution for '${agentRunId}': ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
        metadata: {
          errorStep: 'resumeExecution',
          runId: agentRunId
        }
      };
    }
  }

  /**
   * Cleans up failed or stale agent runs by marking them as failed.
   * 
   * This method can be used to clean up runs that are stuck in 'Running' status
   * due to unexpected termination or system failures.
   * 
   * @param maxAgeHours - Maximum age in hours for running agents before marking as failed
   * @param contextUser - User context for database operations
   * @returns Promise resolving to the number of runs cleaned up
   * 
   * @public
   */
  public async cleanupFailedRuns(
    maxAgeHours: number = 24
  ): Promise<number> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);
      
      const runView = new RunView();
      const staleRunsResult = await runView.RunView<AIAgentRunEntity>({
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `Status = 'Running' AND StartedAt < '${cutoffTime.toISOString()}'`,
        ResultType: 'entity_object'
      }, this.contextUser);
      
      const staleRuns = staleRunsResult.Results;
      let cleanedCount = 0;
      
      for (const run of staleRuns) {
        try {
          run.Status = 'Failed';
          run.Success = false;
          run.CompletedAt = new Date();
          run.ErrorMessage = `Run marked as failed due to cleanup - exceeded maximum age of ${maxAgeHours} hours`;
          
          await run.Save();
          cleanedCount++;
          
          LogStatus(`Cleaned up stale agent run: ${run.ID} (Agent: ${run.AgentID})`);
        } catch (error) {
          LogError(`Failed to clean up run ${run.ID}: ${error.message}`);
        }
      }
      
      LogStatus(`Cleaned up ${cleanedCount} stale agent runs`);
      return cleanedCount;
      
    } catch (error) {
      LogError(`Error during cleanup of failed runs: ${error.message}`);
      return 0;
    }
  }



}

export function LoadBaseAgent() {
  // This function ensures the class isn't tree-shaken
}