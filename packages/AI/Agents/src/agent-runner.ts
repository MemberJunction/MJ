import { LogError, LogStatus, UserInfo, Metadata } from '@memberjunction/core';
import { AIAgentEntityExtended, AIAgentRunEntity, AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ChatMessage } from '@memberjunction/ai';
import { ActionResult } from '@memberjunction/actions-base';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseAgent, IAgentFactory, AgentExecutionParams, AgentExecutionResult, AgentProgressUpdate } from './base-agent';
import { 
  ConductorAgent, 
  ConductorDecisionInput, 
  ConductorDecisionResponse, 
  ExecutionHistoryItem,
  ExecutionStep
} from './conductor-agent';

/**
 * Input parameters for AgentRunner execution that extends the base parameters
 * with runner-specific configuration.
 */
export interface AgentRunnerParams extends AgentExecutionParams {
  /** The BaseAgent to execute */
  agent: BaseAgent;
  /** Maximum number of decision-execution cycles before stopping */
  maxIterations?: number;
  /** Primary goal or task description for the agent to accomplish */
  goal?: string;
  /** Whether to enable detailed execution logging */
  enableDetailedLogging?: boolean;
}

/**
 * Enhanced result from AgentRunner execution that includes decision history
 * and comprehensive execution tracking.
 */
export interface AgentRunnerResult extends AgentExecutionResult {
  /** Complete history of conductor decisions made during execution */
  decisionHistory?: ConductorDecisionResponse[];
  /** Results from all actions that were executed */
  actionResults?: ActionResult[];
  /** The final decision that led to task completion or termination */
  finalDecision?: ConductorDecisionResponse;
  /** Number of agent-conductor decision cycles completed */
  iterationCount?: number;
  /** Detailed execution steps taken */
  executionSteps?: ExecutionHistoryItem[];
}

/**
 * Context information maintained during agent runner execution
 */
interface AgentRunnerContext {
  /** Current conversation messages */
  conversationMessages: ChatMessage[];
  /** Execution parameters */
  params: AgentRunnerParams;
  /** Data context for template rendering */
  data: Record<string, unknown>;
  /** Current execution step */
  currentStep: string;
  /** Start time of execution */
  startTime: Date;
  /** Database run record for tracking */
  agentRun?: AIAgentRunEntity;
  /** Current step number for sequential tracking */
  currentStepNumber: number;
  /** Primary goal being pursued */
  goal: string;
}

/**
 * Result from executing decided actions containing execution outcomes and history
 */
interface ActionExecutionResult {
  /** Historical record of executed actions/subagents */
  historyItems: ExecutionHistoryItem[];
  /** Results from executed actions */
  actionResults: ActionResult[];
  /** New conversation messages generated during execution */
  newMessages: ChatMessage[];
}

/**
 * AgentRunner - Orchestrates execution between BaseAgent and ConductorAgent
 * 
 * The AgentRunner implements the separation of concerns pattern discussed in the conversation:
 * - **BaseAgent**: Executes domain-specific prompts and tasks
 * - **ConductorAgent**: Makes orchestration decisions about next steps
 * - **AgentRunner**: Coordinates the interaction between them
 * 
 * ## Architecture Flow
 * 1. **Agent Execution**: Run the BaseAgent to get its response/work product
 * 2. **Decision Making**: Feed agent result to ConductorAgent for decision
 * 3. **Action Execution**: Execute the conductor's decided actions/sub-agents
 * 4. **Iteration**: Repeat until task completion or max iterations
 * 
 * ## Key Benefits
 * - **Separation of Concerns**: Execution vs decision-making are cleanly separated
 * - **Simplified Agents**: BaseAgents focus only on their domain expertise
 * - **Flexible Orchestration**: ConductorAgent can make complex decisions
 * - **User Abstraction**: Users interact with AgentRunner, not the internal complexity
 * - **Reusable Patterns**: Both BaseAgent and ConductorAgent can be reused
 * 
 * ## Comparison to Original Architecture
 * **Before**: BaseAgent did both execution AND decision-making in one complex class
 * **After**: Clean separation with specialized responsibilities:
 * - BaseAgent → Domain execution only
 * - ConductorAgent → Orchestration decisions only  
 * - AgentRunner → Coordination and user interface
 * 
 * @example Basic Usage
 * ```typescript
 * const factory = GetAgentFactory();
 * const runner = factory.GetAgentRunner(conductorEntity, contextUser);
 * const agent = await factory.CreateAgent("DataAnalysisAgent", null, contextUser);
 * 
 * const result = await runner.Run({
 *   agent: agent,
 *   goal: "Analyze sales data and create report",
 *   data: { dataset: salesData },
 *   maxIterations: 10
 * });
 * ```
 * 
 * @example Direct Construction
 * ```typescript
 * const conductor = new ConductorAgent(conductorEntity, factory, contextUser);
 * const runner = new AgentRunner(conductor, contextUser);
 * ```
 */
export class AgentRunner {
  private _conductor: ConductorAgent;
  private _contextUser: UserInfo;
  protected _metadata: Metadata;

  /**
   * Creates a new AgentRunner instance.
   * 
   * @param conductor - The conductor agent that makes orchestration decisions
   * @param contextUser - User context for authentication and permissions
   */
  constructor(
    conductor: ConductorAgent,
    contextUser: UserInfo
  ) {
    this._conductor = conductor;
    this._contextUser = contextUser;
    this._metadata = new Metadata();
  }

  /**
   * Runs the agent runner using the BaseAgent + ConductorAgent pattern.
   * 
   * This method implements the core architecture:
   * 1. Execute BaseAgent to get domain-specific results
   * 2. Feed results to ConductorAgent for orchestration decisions
   * 3. Execute conductor's decided actions/sub-agents
   * 4. Repeat until task completion or max iterations
   * 
   * @param params - Execution parameters including agent, goal, data, and configuration
   * @returns Promise resolving to comprehensive execution result
   */
  public async Run(params: AgentRunnerParams): Promise<AgentRunnerResult> {
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
        message: `Initializing AgentRunner with base agent '${params.agent.agent.Name}'`,
        metadata: { 
          baseAgentName: params.agent.agent.Name,
          conductorName: this._conductor.agent.Name,
          goal: context.goal 
        }
      });

      // Execute the core runner logic
      const result = await this.executeCore(context);

      // Calculate final execution time
      const endTime = new Date();
      result.executionTimeMS = endTime.getTime() - startTime.getTime();

      // Report completion
      this.sendProgress(params.onProgress, {
        step: 'completion',
        percentage: 100,
        message: `AgentRunner execution completed`,
        metadata: { 
          success: result.success,
          executionTimeMS: result.executionTimeMS,
          iterationCount: result.iterationCount
        }
      });

      return result;

    } catch (error) {
      LogError(`Error executing AgentRunner: ${error.message}`);
      
      const endTime = new Date();
      const errorResult: AgentRunnerResult = {
        success: false,
        errorMessage: error.message,
        executionTimeMS: endTime.getTime() - startTime.getTime(),
        cancelled: params.cancellationToken?.aborted || false,
        decisionHistory: [],
        actionResults: [],
        iterationCount: 0,
        executionSteps: []
      };
      
      return errorResult;
    }
  }

  /**
   * Core execution loop implementing the BaseAgent + ConductorAgent pattern.
   */
  private async executeCore(context: AgentRunnerContext): Promise<AgentRunnerResult> {
    let executionStepEntity: AIAgentRunStepEntity | null = null;
    
    try {
      // Create initial execution step for runner logic
      executionStepEntity = await this.createExecutionStep(
        context,
        'runner',
        'AgentRunner core execution loop',
        context.params.agent.agent.ID,
        { 
          maxIterations: context.params.maxIterations || 10,
          goal: context.goal
        }
      );

      const decisionHistory: ConductorDecisionResponse[] = [];
      const executionHistory: ExecutionHistoryItem[] = [];
      const actionResults: ActionResult[] = [];
      let currentMessages = [...context.conversationMessages];
      const maxIterations = context.params.maxIterations || 10;
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        
        // Update current step and save state
        context.currentStep = `iteration-${iteration}`;
        
        // Check for cancellation
        if (context.params.cancellationToken?.aborted) {
          if (executionStepEntity) {
            await this.completeExecutionStep(executionStepEntity, false, null, 'Execution cancelled by user');
          }
          return this.createCancelledResult(context.startTime);
        }

        // Report progress for this iteration
        this.sendProgress(context.params.onProgress, {
          step: 'prompt_execution',
          percentage: 20 + (60 * iteration / maxIterations),
          message: `Iteration ${iteration}/${maxIterations}: Running BaseAgent`,
          metadata: { 
            iteration, 
            maxIterations,
            runId: context.agentRun?.ID,
            stepNumber: context.currentStepNumber,
            goal: context.goal
          }
        });

        // Step 1: Execute BaseAgent to get domain-specific result
        const baseAgentStepEntity = await this.createExecutionStep(
          context,
          'baseagent',
          `BaseAgent execution - iteration ${iteration}`,
          context.params.agent.agent.ID,
          { iteration, goal: context.goal }
        );

        let baseAgentResult: AgentExecutionResult;
        try {
          baseAgentResult = await context.params.agent.Execute({
            contextUser: context.params.contextUser,
            data: context.data,
            conversationMessages: currentMessages,
            cancellationToken: context.params.cancellationToken,
            onProgress: context.params.onProgress,
            onStreaming: context.params.onStreaming
          });
          
          await this.completeExecutionStep(baseAgentStepEntity, baseAgentResult.success, {
            result: baseAgentResult.result,
            executionTimeMS: baseAgentResult.executionTimeMS
          }, baseAgentResult.success ? undefined : baseAgentResult.errorMessage);

          // Update conversation with base agent result
          if (baseAgentResult.conversationMessages) {
            currentMessages = baseAgentResult.conversationMessages;
          }
        } catch (error) {
          await this.completeExecutionStep(baseAgentStepEntity, false, null, error.message);
          throw error;
        }

        // Step 2: Get conductor decision based on base agent result
        const conductorStepEntity = await this.createExecutionStep(
          context,
          'conductor',
          `Conductor decision - iteration ${iteration}`,
          this._conductor.agent.ID,
          { iteration, baseAgentSuccess: baseAgentResult.success }
        );

        let decision: ConductorDecisionResponse;
        try {
          const decisionInput: ConductorDecisionInput = {
            messages: currentMessages,
            currentAgentResult: baseAgentResult,
            availableActions: await this._conductor.getAvailableActionDescriptions(),
            availableSubAgents: await this._conductor.getAvailableSubAgentDescriptions(),
            currentGoal: context.goal,
            executionHistory,
            contextData: context.data
          };

          decision = await this._conductor.MakeDecision(decisionInput);
          decisionHistory.push(decision);
          
          await this.completeExecutionStep(conductorStepEntity, true, {
            decision: decision.decision,
            reasoning: decision.reasoning,
            executionPlanLength: decision.executionPlan.length,
            confidence: decision.confidence
          });

          // Log decision if detailed logging is enabled
          if (context.params.enableDetailedLogging) {
            LogStatus(`Iteration ${iteration}: Conductor decided '${decision.decision}' with confidence ${decision.confidence}. Reasoning: ${decision.reasoning}`);
          }
        } catch (error) {
          await this.completeExecutionStep(conductorStepEntity, false, null, error.message);
          throw error;
        }

        // Step 3: Handle the conductor's decision
        if (decision.isTaskComplete || decision.decision === 'complete_task') {
          // Task completed successfully
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
          
          const result: AgentRunnerResult = {
            success: true,
            result: decision.finalResponse || baseAgentResult.result,
            conversationMessages: currentMessages,
            decisionHistory,
            actionResults,
            finalDecision: decision,
            iterationCount: iteration,
            executionSteps: executionHistory,
            metadata: {
              iterations: iteration,
              decisionCount: decisionHistory.length,
              actionExecutions: actionResults.length,
              runId: context.agentRun?.ID,
              baseAgentName: context.params.agent.agent.Name,
              conductorName: this._conductor.agent.Name
            }
          };
          
          return result;
        }

        if (decision.decision === 'request_clarification') {
          // Need clarification from user
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
          
          const clarificationResult: AgentRunnerResult = {
            success: false,
            errorMessage: decision.reasoning,
            conversationMessages: currentMessages,
            decisionHistory,
            iterationCount: iteration,
            executionSteps: executionHistory,
            metadata: {
              needsClarification: true,
              clarificationRequest: decision.reasoning,
              runId: context.agentRun?.ID
            }
          };
          
          return clarificationResult;
        }

        // Step 4: Execute the conductor's decided actions
        if (decision.executionPlan && decision.executionPlan.length > 0) {
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
      }

      // If we reach here, we hit the max iterations limit
      if (executionStepEntity) {
        await this.completeExecutionStep(executionStepEntity, false, {
          iterations: iteration,
          maxIterationsReached: true
        }, `Reached maximum iterations (${maxIterations}) without task completion`);
      }
      
      const maxIterationsResult: AgentRunnerResult = {
        success: false,
        errorMessage: `AgentRunner reached maximum iterations (${maxIterations}) without completing the task`,
        conversationMessages: currentMessages,
        decisionHistory,
        actionResults,
        iterationCount: iteration,
        executionSteps: executionHistory,
        metadata: {
          maxIterationsReached: true,
          iterations: iteration,
          decisionCount: decisionHistory.length,
          runId: context.agentRun?.ID
        }
      };
      
      return maxIterationsResult;
      
    } catch (error) {
      LogError(`Error in AgentRunner executeCore: ${error.message}`);
      
      if (executionStepEntity) {
        await this.completeExecutionStep(executionStepEntity, false, null, error.message);
      }
      
      const errorResult: AgentRunnerResult = {
        success: false,
        errorMessage: error.message,
        decisionHistory: [],
        actionResults: [],
        iterationCount: 0,
        executionSteps: [],
        metadata: {
          errorStep: 'executeCore',
          runId: context.agentRun?.ID
        }
      };
      
      return errorResult;
    }
  }

  /**
   * Executes the conductor's decided execution plan.
   */
  private async executeDecidedActions(
    context: AgentRunnerContext,
    decision: ConductorDecisionResponse,
    executionHistory: ExecutionHistoryItem[]
  ): Promise<ActionExecutionResult> {
    const historyItems: ExecutionHistoryItem[] = [];
    const actionResults: ActionResult[] = [];
    const newMessages: ChatMessage[] = [];

    if (!decision.executionPlan || decision.executionPlan.length === 0) {
      return { historyItems, actionResults, newMessages };
    }

    // Group execution steps by executionOrder and execute appropriately
    const executionGroups = this.groupExecutionStepsByOrder(decision.executionPlan);
    
    for (const [order, steps] of executionGroups) {
      this.sendProgress(context.params.onProgress, {
        step: 'prompt_execution',
        percentage: 60 + (20 * order / executionGroups.size),
        message: `Executing steps at order ${order}`,
        metadata: { 
          executionOrder: order, 
          stepCount: steps.length,
          stepTypes: steps.map(s => s.type)
        }
      });

      // Execute steps (parallel or sequential based on allowParallel flags)
      const hasSequentialSteps = steps.some(step => step.allowParallel === false);
      
      if (hasSequentialSteps) {
        // Execute sequentially
        for (const step of steps) {
          const result = await this.executeSingleStep(context, step);
          historyItems.push(result.historyItem);
          if (result.actionResult) actionResults.push(result.actionResult);
          if (result.newMessage) newMessages.push(result.newMessage);
        }
      } else {
        // Execute in parallel
        const promises = steps.map(step => this.executeSingleStep(context, step));
        const results = await Promise.allSettled(promises);
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const step = steps[i];
          
          if (result.status === 'fulfilled') {
            historyItems.push(result.value.historyItem);
            if (result.value.actionResult) actionResults.push(result.value.actionResult);
            if (result.value.newMessage) newMessages.push(result.value.newMessage);
          } else {
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
      }
    }

    return { historyItems, actionResults, newMessages };
  }

  /**
   * Executes a single execution step (action or subagent).
   */
  private async executeSingleStep(
    context: AgentRunnerContext,
    step: ExecutionStep
  ): Promise<{
    historyItem: ExecutionHistoryItem;
    actionResult?: ActionResult;
    newMessage?: ChatMessage;
  }> {
    const timestamp = new Date();
    
    try {
      if (step.type === 'action') {
        const actionResult = await this._conductor.executeAction(step.targetId, step.parameters || {});
        
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
        const subagentResult = await this._conductor.executeSubAgent(
          step.targetId, 
          step.parameters || {}, 
          context.data
        );
        
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
        const errorMessage = `Unknown execution step type: ${step.type}`;
        throw new Error(errorMessage);
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
   * Groups execution steps by their execution order.
   */
  private groupExecutionStepsByOrder(executionPlan: ExecutionStep[]): Map<number, ExecutionStep[]> {
    const groups = new Map<number, ExecutionStep[]>();
    
    for (const step of executionPlan) {
      const order = step.executionOrder || 1;
      if (!groups.has(order)) {
        groups.set(order, []);
      }
      groups.get(order)!.push(step);
    }
    
    return new Map([...groups.entries()].sort(([a], [b]) => a - b));
  }

  /**
   * Creates a concise summary of execution results.
   */
  private createExecutionSummary(
    decision: ConductorDecisionResponse,
    executionResults: ActionExecutionResult
  ): string {
    const { historyItems } = executionResults;
    const successful = historyItems.filter(h => h.success);
    const failed = historyItems.filter(h => !h.success);
    
    const parts: string[] = [
      `Executed ${decision.executionPlan.length} steps based on conductor decision: ${decision.reasoning}`
    ];
    
    if (successful.length) {
      parts.push(`✅ Successful: ${successful.map(h => h.targetId).join(', ')}`);
    }
    
    if (failed.length) {
      parts.push(`❌ Failed: ${failed.map(h => h.targetId).join(', ')}`);
    }
    
    return parts.join('\n');
  }

  /**
   * Initializes the execution context for the runner.
   */
  private async initializeContext(
    params: AgentRunnerParams, 
    startTime: Date
  ): Promise<AgentRunnerContext> {
    // Create the AIAgentRun record (using base agent as primary agent)
    const agentRun = await this._metadata.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', this._contextUser);
    agentRun.NewRecord();
    agentRun.AgentID = params.agent.agent.ID;
    agentRun.Status = 'Running';
    agentRun.StartedAt = startTime;
    
    if (params.contextUser) {
      agentRun.UserID = params.contextUser.ID;
    }
    
    // Extract conversation ID and parent run ID if available
    const conversationId = params.data?.conversationId as string || params.data?.conversationID as string;
    if (conversationId) {
      agentRun.ConversationID = conversationId;
    }
    
    const parentRunId = params.data?.parentRunId as string || params.data?.parentRunID as string;
    if (parentRunId) {
      agentRun.ParentRunID = parentRunId;
    }
    
    const saveResult = await agentRun.Save();
    if (!saveResult) {
      throw new Error('Failed to create agent run record in database');
    }
    
    return {
      conversationMessages: params.conversationMessages || [],
      params,
      data: params.data || {},
      currentStep: 'initialization',
      startTime,
      agentRun,
      currentStepNumber: 1,
      goal: params.goal || params.data?.goal as string || 'Complete the requested task'
    };
  }

  /**
   * Creates a new execution step record in the database.
   */
  private async createExecutionStep(
    context: AgentRunnerContext,
    stepType: string,
    stepName: string,
    targetId?: string,
    inputData?: Record<string, unknown>
  ): Promise<AIAgentRunStepEntity> {
    if (!context.agentRun) {
      throw new Error('Agent run record not found in context');
    }

    const stepEntity = await this._metadata.GetEntityObject<AIAgentRunStepEntity>('MJ: AI Agent Run Steps', this._contextUser);
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
    
    context.currentStepNumber++;
    return stepEntity;
  }

  /**
   * Completes an execution step by updating its status and results.
   */
  private async completeExecutionStep(
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
   * Sends progress status to the callback if provided.
   */
  private sendProgress(
    callback: ((progress: AgentProgressUpdate) => void) | undefined, 
    progress: AgentProgressUpdate
  ): void {
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
  private createCancelledResult(startTime: Date): AgentRunnerResult {
    const endTime = new Date();
    return {
      success: false,
      cancelled: true,
      errorMessage: 'AgentRunner execution was cancelled',
      executionTimeMS: endTime.getTime() - startTime.getTime(),
      iterationCount: 0,
      decisionHistory: [],
      actionResults: [],
      executionSteps: []
    };
  }
}

export function LoadAgentRunner() {
  // This function ensures the class isn't tree-shaken
}