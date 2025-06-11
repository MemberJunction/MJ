import { LogError, UserInfo } from '@memberjunction/core';
import { AIAgentEntityExtended } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ChatMessage } from '@memberjunction/ai';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAgent, IAgentFactory, AgentExecutionParams, AgentExecutionResult } from './base-agent';

export const CONDUCTOR_AGENT_NAME = 'Conductor';

/**
 * Represents the different types of decisions a Conductor can make.
 */
export type ConductorDecisionType = 
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
 * Input structure provided to the Conductor for decision making.
 */
export interface ConductorDecisionInput {
  /** Current conversation context including user messages and previous responses */
  messages: ChatMessage[];
  /** The result from the most recent agent execution */
  currentAgentResult?: AgentExecutionResult;
  /** Available actions that can be executed */
  availableActions: ActionDescription[];
  /** Available sub-agents that can be delegated to for specialized tasks */
  availableSubAgents: SubAgentDescription[];
  /** Primary goal or task being accomplished */
  currentGoal: string;
  /** Historical record of previous execution steps and their outcomes */
  executionHistory: ExecutionHistoryItem[];
  /** Additional context data passed from the parent execution context */
  contextData?: Record<string, unknown>;
}

/**
 * Response structure returned by the Conductor containing the decision and execution plan.
 */
export interface ConductorDecisionResponse {
  /** The type of decision made by the conductor */
  decision: ConductorDecisionType;
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
 * Describes an available action that can be executed.
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
   */
  allowParallel?: boolean;
  /** Human-readable description of what this step accomplishes */
  description?: string;
}

/**
 * Records the history of an executed action, sub-agent, or decision.
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
 * ConductorAgent - Specialized agent for making orchestration decisions.
 * 
 * The ConductorAgent is responsible for analyzing the current state, agent responses,
 * and available resources to make autonomous decisions about what to do next.
 * 
 * It separates the concerns of:
 * - **Execution** (handled by BaseAgent instances)
 * - **Decision-making** (handled by this ConductorAgent)
 * 
 * ## Key Responsibilities
 * - Analyze current context and agent results
 * - Evaluate available actions and sub-agents
 * - Make autonomous decisions about next steps
 * - Plan execution sequences with proper ordering
 * - Determine when tasks are complete
 * 
 * ## Architecture
 * - Extends BaseAgent but specializes in orchestration prompts
 * - Uses conductor-specific system prompts for decision-making
 * - Returns structured JSON decisions for deterministic parsing
 * - Integrates with execution history for context-aware decisions
 * 
 * @example Basic Usage
 * ```typescript
 * const conductor = new ConductorAgent(conductorEntity, factory, contextUser);
 * const decision = await conductor.MakeDecision({
 *   messages: conversationHistory,
 *   currentAgentResult: lastAgentResult,
 *   availableActions: actions,
 *   availableSubAgents: subAgents,
 *   currentGoal: "Complete the user's request",
 *   executionHistory: previousSteps
 * });
 * ```
 */
@RegisterClass(BaseAgent, "Conductor")
export class ConductorAgent extends BaseAgent {

  constructor(agent: AIAgentEntityExtended, factory: IAgentFactory, contextUser: UserInfo) {
    super(agent, factory, contextUser);
  }

  /**
   * Makes an autonomous decision about what to do next based on current context.
   * 
   * This is the core method that analyzes:
   * - Current conversation state
   * - Results from previous agent executions
   * - Available resources (actions and sub-agents)
   * - Execution history and context
   * 
   * @param decisionInput - Complete context for decision-making
   * @returns Promise resolving to structured decision response
   */
  public async MakeDecision(decisionInput: ConductorDecisionInput): Promise<ConductorDecisionResponse> {
    try {
      // Build contextual prompt for decision-making
      const contextualPrompt = this.buildDecisionPrompt(decisionInput);

      // Prepare conversation messages for the conductor
      const conversationMessages: ChatMessage[] = [
        ...decisionInput.messages,
        {
          role: 'user',
          content: contextualPrompt
        }
      ];

      // Execute conductor's decision-making prompt
      const executionParams: AgentExecutionParams = {
        contextUser: this.contextUser,
        data: {
          currentGoal: decisionInput.currentGoal,
          availableActions: decisionInput.availableActions,
          availableSubAgents: decisionInput.availableSubAgents,
          executionHistory: decisionInput.executionHistory,
          currentAgentResult: decisionInput.currentAgentResult,
          contextData: decisionInput.contextData
        },
        conversationMessages
      };

      const result = await this.Execute(executionParams);

      if (!result.success) {
        throw new Error(`Conductor execution failed: ${result.errorMessage}`);
      }

      // Parse and validate the conductor's decision
      const decision = await this.parseAndValidateDecision(result.result as string || '');
      
      return decision;
    } catch (error) {
      LogError(`Error in conductor decision-making: ${error.message}`);
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
   * Executes an action using the ActionEngine.
   */
  public async executeAction(actionId: string, parameters: Record<string, unknown>): Promise<ActionResult> {
    try {
      // Convert parameters to ActionParam format
      const actionParams: ActionParam[] = Object.entries(parameters).map(([name, value]) => ({
        Name: name,
        Value: value,
        Type: 'Input'
      }));

      await ActionEngineServer.Instance.Config(false, this.contextUser);
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
  public async executeSubAgent(
    subAgentId: string, 
    parameters: Record<string, unknown>,
    parentContext?: Record<string, unknown>
  ): Promise<AgentExecutionResult> {
    try {
      const subAgentEntity = AIEngine.Instance.Agents.find(a => a.ID === subAgentId);
      if (!subAgentEntity) {
        throw new Error(`Sub-agent with ID '${subAgentId}' not found`);
      }

      const subAgent = this.factory.CreateAgentFromEntity(subAgentEntity, null, this.contextUser);
      
      // Create execution parameters for sub-agent
      const subAgentParams: AgentExecutionParams = {
        contextUser: this.contextUser,
        data: { 
          ...parentContext, 
          ...parameters
        },
        conversationMessages: []
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
   * Gets available actions for decision-making.
   */
  public async getAvailableActionDescriptions(): Promise<ActionDescription[]> {
    try {
      // This would typically be configured or passed in, but for now get from agent
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
            supportsParallel: true
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
   * Gets available sub-agents for decision-making.
   */
  public async getAvailableSubAgentDescriptions(): Promise<SubAgentDescription[]> {
    try {
      const childAgents = AIEngine.Instance.Agents
        .filter(a => a.ParentID === this.agent.ID)
        .sort((a, b) => (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0));

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
   * Builds a contextual decision prompt based on the current state.
   */
  private buildDecisionPrompt(decisionInput: ConductorDecisionInput): string {
    const executionSummary = decisionInput.executionHistory.length > 0 
      ? this.summarizeExecutionHistory(decisionInput.executionHistory)
      : 'No previous actions taken.';

    const agentResultSummary = decisionInput.currentAgentResult
      ? `Latest agent result: ${decisionInput.currentAgentResult.success ? 'Success' : 'Failed'} - ${decisionInput.currentAgentResult.result || decisionInput.currentAgentResult.errorMessage}`
      : 'No recent agent execution.';

    const actionDetails = decisionInput.availableActions.length > 0 
      ? this.formatActionsForDecision(decisionInput.availableActions)
      : '';

    const subAgentDetails = decisionInput.availableSubAgents.length > 0
      ? this.formatSubAgentsForDecision(decisionInput.availableSubAgents)
      : '';

    return `## Conductor Decision Analysis

**Primary Goal:** ${decisionInput.currentGoal}

**Current Situation:**
- Conversation messages: ${decisionInput.messages.length}
- ${agentResultSummary}
- Previous execution history: ${executionSummary}
- Available actions: ${decisionInput.availableActions.length}
- Available sub-agents: ${decisionInput.availableSubAgents.length}${actionDetails}${subAgentDetails}

## Decision Request

As the Conductor, analyze the current situation and determine the best next step to achieve the goal: "${decisionInput.currentGoal}"

Consider:
1. What has already been accomplished?
2. What information or capabilities are still needed?
3. Which actions or sub-agents would be most effective?
4. Should any operations run in parallel for efficiency?
5. Is the task ready for completion?

**Respond with a JSON object following the required decision format.**`;
  }

  /**
   * Formats action information for decision-making context.
   */
  private formatActionsForDecision(actions: ActionDescription[]): string {
    if (actions.length === 0) return '';
    
    let section = '\n\n**Available Actions:**\n';
    for (const action of actions.slice(0, 5)) {
      section += `- **${action.name}** (${action.id}): ${action.description}\n`;
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
    
    let section = '\n\n**Available Sub-Agents:**\n';
    const sortedAgents = [...subAgents].sort((a, b) => (a.executionOrder || 0) - (b.executionOrder || 0));
    
    for (const agent of sortedAgents.slice(0, 5)) {
      section += `- **${agent.name}** (${agent.id}): ${agent.description}\n`;
      section += `  - Suggested order: ${agent.executionOrder || 0}, Parallel: ${agent.supportsParallel}\n`;
    }
    if (subAgents.length > 5) {
      section += `... and ${subAgents.length - 5} more sub-agents available\n`;
    }
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
    
    return `${history.length} total (${successful} successful, ${failed} failed). Recent: ${recent}`;
  }

  /**
   * Parses and validates the conductor's decision response.
   */
  private async parseAndValidateDecision(llmResponse: string): Promise<ConductorDecisionResponse> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                       llmResponse.match(/\{[\s\S]*\}/);
      
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : llmResponse;
      
      let decision: Partial<ConductorDecisionResponse>;
      try {
        decision = JSON.parse(jsonString.trim());
      } catch (parseError) {
        LogError(`Failed to parse conductor decision response: ${parseError.message}`);
        return this.createFallbackDecision(llmResponse);
      }

      // Validate and normalize the decision
      return this.validateAndNormalizeDecision(decision);
    } catch (error) {
      LogError(`Error parsing conductor decision: ${error.message}`);
      return this.createFallbackDecision(llmResponse);
    }
  }

  /**
   * Creates a fallback decision when JSON parsing fails.
   */
  private createFallbackDecision(llmResponse: string): ConductorDecisionResponse {
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
    
    return {
      decision: 'request_clarification',
      reasoning: `Unable to parse conductor response format. Raw response: ${llmResponse}`,
      executionPlan: [],
      isTaskComplete: false,
      confidence: 0.1
    };
  }

  /**
   * Validates and normalizes a conductor decision response.
   */
  private validateAndNormalizeDecision(decision: Partial<ConductorDecisionResponse>): ConductorDecisionResponse {
    let executionPlan: ExecutionStep[] = [];
    if (decision.executionPlan && Array.isArray(decision.executionPlan)) {
      executionPlan = decision.executionPlan.map((step, index) => ({
        type: step.type || 'action',
        targetId: step.targetId || '',
        parameters: step.parameters || {},
        executionOrder: step.executionOrder || (index + 1),
        allowParallel: step.allowParallel !== false,
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
}

export function LoadConductorAgent() {
  // This function ensures the class isn't tree-shaken
}