/**
 * @fileoverview Implementation of the Flow Agent Type for deterministic workflow execution.
 * 
 * The FlowAgentType enables agents to execute predefined workflows using a directed graph
 * of steps and conditional paths. Unlike LoopAgentType which makes decisions based on
 * LLM output, FlowAgentType follows a deterministic execution path based on boolean
 * expressions evaluated against the current payload and step results.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.76.0
 */

import { RegisterClass, SafeExpressionEvaluator } from '@memberjunction/global';
import { BaseAgentType } from './base-agent-type';
import { AIPromptRunResult, BaseAgentNextStep, AIPromptParams, AgentPayloadChangeRequest, AgentAction, AgentSubAgentRequest, ExecuteAgentParams, AgentConfiguration, ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { LogError, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIAgentStepEntity, AIAgentStepPathEntity, AIPromptEntityExtended } from '@memberjunction/core-entities';
import { ActionResult } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { PayloadManager } from '../PayloadManager';

/**
 * Extended BaseAgentNextStep for Flow Agent Type with additional prompt step metadata
 */
interface FlowAgentNextStep<P = any> extends BaseAgentNextStep<P> {
    /** The ID of the prompt to execute for flow prompt steps */
    flowPromptStepId?: string;
}

/**
 * Flow execution state that tracks the progress through the workflow.
 * This is maintained by the Flow Agent Type during execution.
 *
 * Note: Loop iteration tracking is now handled by BaseAgent._iterationContext.
 * FlowExecutionState only tracks flow-specific navigation state.
 */
export class FlowExecutionState {
    /** The agent ID for this flow execution */
    agentId: string;

    /** The current step being executed */
    currentStepId?: string;

    /** Set of completed step IDs */
    completedStepIds: Set<string> = new Set();

    /** Map of step results by step ID */
    stepResults: Map<string, unknown> = new Map();

    /** Ordered list of step IDs in execution order */
    executionPath: string[] = [];

    constructor(agentId: string) {
        this.agentId = agentId;
    }
}

/**
 * Action output mapping configuration
 */
interface ActionOutputMapping {
    [outputParam: string]: string; // Maps output param name to payload path
    '*'?: string; // Optional wildcard to capture entire result
}
 
/**
 * Implementation of the Flow Agent Type pattern.
 * 
 * This agent type enables deterministic workflow execution where agents follow
 * predefined paths through a graph of steps. Key features:
 * - Graph-based workflow definition
 * - Conditional path evaluation using safe boolean expressions
 * - Support for Actions, Sub-Agents, and Prompts as step types
 * - Deterministic execution with optional AI-driven decision points
 * 
 * @class FlowAgentType
 * @extends BaseAgentType
 * 
 * @example
 * ```typescript
 * // Flow agents execute steps based on graph structure
 * const flowAgent = new FlowAgentType();
 * const nextStep = await flowAgent.DetermineNextStep(promptResult, payload);
 * 
 * // Steps are determined by evaluating path conditions
 * // Path: "payload.status == 'approved' && payload.amount < 1000"
 * // Leads to: "Auto-Approve" step
 * ```
 */
@RegisterClass(BaseAgentType, "FlowAgentType")
export class FlowAgentType extends BaseAgentType {
    private _evaluator = new SafeExpressionEvaluator();
    private _payloadManager = new PayloadManager();
         
    /**
     * Handles the initialization of the flow agent state that is specialized, additional state information
     * specific to the Flow Agent Type
     * @param params 
     * @returns 
     */
    public async InitializeAgentTypeState<ATS = any, P = any>(params: ExecuteAgentParams<any, P>): Promise<ATS> {
        const flowState = new FlowExecutionState(params.agent.ID);
        return flowState as ATS;
    }

    /**
     * Determines the next step based on the flow graph structure.
     * 
     * For Flow agents, the next step is determined by:
     * 1. Finding the current position in the graph
     * 2. Evaluating conditions on outgoing paths
     * 3. Following the highest priority valid path
     * 4. Using prompt results only when current step type is 'Prompt'
     * 
     * @param {AIPromptRunResult | null} promptResult - Result from prompt execution (null for non-prompt steps)
     * @param {ExecuteAgentParams} params - The full execution parameters
     * 
     * @returns {Promise<BaseAgentNextStep<P>>} The next step to execute
     */
    public async DetermineNextStep<P = any, ATS = any>(
        promptResult: AIPromptRunResult | null, 
        params: ExecuteAgentParams<any, P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P>> {
        try {
            const flowState = agentTypeState as FlowExecutionState;
            
            // If no current step, this should have been handled by DetermineInitialStep
            if (!flowState.currentStepId) {
                const startingSteps = await this.getStartingSteps(params.agent.ID);
                
                if (startingSteps.length === 0) {
                    return this.createNextStep('Failed', {
                        errorMessage: 'No starting steps defined for flow agent'
                    });
                }
                
                // For now, execute the first starting step
                // Future enhancement: support parallel starting steps
                return await this.createStepForFlowNode(params, startingSteps[0], payload, flowState);
            }
            
            // Get current step to check if it was a Prompt step
            const currentStep = await this.getStepById(flowState.currentStepId);
            
            // If current step was a Prompt, update payload with the prompt result
            if (currentStep?.StepType === 'Prompt' && promptResult) {
                
                // Parse the prompt result as JSON
                const promptResponse = this.parseJSONResponse<any>(promptResult);
                
                if (promptResponse) {
                    // Check if the prompt response contains a Chat step request
                    // This handles the case where a Prompt step wants to return a message to the user
                    if (promptResponse.nextStep?.type === 'Chat' || 
                        (promptResponse.taskComplete && promptResponse.message)) {
                        // Return a Chat step to bubble the message back to the user
                        return this.createNextStep('Chat', {
                            message: promptResponse.message || 'Response from flow prompt step',
                            reasoning: promptResponse.reasoning,
                            confidence: promptResponse.confidence,
                            terminate: true, // Always terminate for chat responses
                            newPayload: payload,
                            previousPayload: payload
                        });
                    }

                    // Deep merge the prompt response into the current payload
                    // This preserves existing nested properties while adding/updating from the prompt
                    // Example: If payload has {decision: {Y: 4, Z: 2}} and prompt returns {decision: {x: "string"}},
                    // the result will be {decision: {x: "string", Y: 4, Z: 2}} instead of losing Y and Z
                    const mergedPayload = this._payloadManager.deepMerge(payload, promptResponse);
                    // Copy merged result back to payload reference (modifying in place for consistency)
                    Object.assign(payload, mergedPayload);
                }
            }
            
            // Find valid paths from current step
            const paths = await this.getValidPaths(flowState.currentStepId, payload, flowState);
            
            if (paths.length === 0) {
                // No valid paths - flow is complete
                return this.createSuccessStep({
                    message: 'Flow completed - no more paths to follow'
                });
            }
            
            // Get the destination step for the highest priority path
            const nextStep = await this.getStepById(paths[0].DestinationStepID);
            
            if (!nextStep) {
                return this.createNextStep('Failed', {
                    errorMessage: `Destination step not found: ${paths[0].DestinationStepID}`
                });
            }
            
            // Check if the step is active
            if (nextStep.Status !== 'Active') {
                // Step is disabled or pending - find next valid path
                for (let i = 1; i < paths.length; i++) {
                    const alternateStep = await this.getStepById(paths[i].DestinationStepID);
                    if (alternateStep && alternateStep.Status === 'Active') {
                        return await this.createStepForFlowNode(params, alternateStep, payload, flowState);
                    }
                }
                
                // No active steps found in any path
                return this.createNextStep('Failed', {
                    errorMessage: `No active steps found. Step '${nextStep.Name}' has status: ${nextStep.Status}`
                });
            }
            
            return await this.createStepForFlowNode(params, nextStep, payload, flowState);
            
        } catch (error) {
            LogError(`Error in FlowAgentType.DetermineNextStep: ${error.message}`);
            return this.createNextStep('Failed', {
                errorMessage: `Flow execution error: ${error.message}`
            });
        }
    }
    
    /**
     * Injects flow-specific context into the prompt parameters.
     * 
     * @param {P} payload - The payload to inject
     * @param {AIPromptParams} prompt - The prompt parameters to update
     * @param {object} agentInfo - Agent identification info
     */
    public async InjectPayload<P = any, ATS = any>(
        payload: P, 
        agentState: ATS,
        prompt: AIPromptParams,
        agentInfo: { agentId: string; agentRunId?: string }
    ): Promise<void> {
        if (!prompt) {
            throw new Error('Prompt parameters are required for payload injection');
        }
        
        if (!prompt.data) {
            prompt.data = {};
        }
        
        // Inject standard payload
        prompt.data[BaseAgentType.CURRENT_PAYLOAD_PLACEHOLDER] = payload || {};
        
        // Add flow-specific context from our state tracking
        if (agentInfo.agentRunId) {
            const flowState = agentState as FlowExecutionState;
            if (agentState) {
                prompt.data.flowContext = {
                    currentStepId: flowState.currentStepId,
                    completedSteps: Array.from(flowState.completedStepIds),
                    executionPath: flowState.executionPath,
                    stepCount: flowState.completedStepIds.size
                };
            }
        }
    }
    
    /**
     * Gets all starting steps for an agent
     * 
     * @private
     */
    private async getStartingSteps(agentId: string): Promise<AIAgentStepEntity[]> {
        const steps = AIEngine.Instance.GetAgentSteps(agentId, 'Active');
        return steps.filter(step => step.StartingStep).sort((a, b) => a.Name.localeCompare(b.Name));
    }
    
    /**
     * Gets a step by ID
     * 
     * @private
     */
    private async getStepById(stepId: string): Promise<AIAgentStepEntity | null> {
        return AIEngine.Instance.GetAgentStepByID(stepId);
    }
    
    /**
     * Gets a step by name within an agent
     * 
     * @private
     */
    private async getStepByName(agentId: string, stepName: string): Promise<AIAgentStepEntity | null> {
        const steps = AIEngine.Instance.GetAgentSteps(agentId);
        return steps.find(step => step.Name === stepName) || null;
    }
    
    /**
     * Gets all paths from a step and evaluates their conditions
     * 
     * @private
     */
    private async getValidPaths(
        stepId: string, 
        payload: unknown,
        flowState: FlowExecutionState
    ): Promise<AIAgentStepPathEntity[]> {
        // Load all paths from this step
        const allPaths = AIEngine.Instance.GetPathsFromStep(stepId)
            .sort((a, b) => b.Priority - a.Priority);
        const validPaths: AIAgentStepPathEntity[] = [];
        
        // Evaluate each path's condition
        for (const path of allPaths) {
            // If no condition, path is always valid
            if (!path.Condition) {
                validPaths.push(path);
                continue;
            }
            
            try {
                // Create evaluation context
                const context = {
                    payload,
                    stepResult: this.getLastStepResult(flowState),
                    flowContext: {
                        currentStepId: flowState.currentStepId,
                        completedSteps: Array.from(flowState.completedStepIds),
                        executionPath: flowState.executionPath,
                        stepCount: flowState.completedStepIds.size
                    }
                };
                
                
                const evalResult = this._evaluator.evaluate(path.Condition, context);

                if (evalResult.success && evalResult.value) {
                    validPaths.push(path);
                }
                else if (!evalResult.success) {
                    // Only log errors when evaluation failed, not when condition is simply false
                    LogError(`Path condition failed: ${path.Condition}\n${evalResult.error}`);
                }
            } catch (error) {
                LogError(`Failed to evaluate path condition: ${error.message}`);
            }
        }
        
        // If no valid paths with conditions, include paths with priority <= 0 (defaults)
        if (validPaths.length === 0) {
            return allPaths.filter(p => p.Priority <= 0 && !p.Condition);
        }
        
        // Sort by priority (already sorted by query, but re-sort valid subset)
        return validPaths.sort((a, b) => b.Priority - a.Priority);
    }
    
    /**
     * Gets the last step result from the flow context
     * 
     * @private
     */
    private getLastStepResult(flowState: FlowExecutionState): unknown {
        if (flowState.executionPath.length === 0) return null;
        
        const lastStepId = flowState.executionPath[flowState.executionPath.length - 1];
        return flowState.stepResults.get(lastStepId) || null;
    }
    
    /**
     * Applies action output mapping to update the payload
     * 
     * @private
     */
    private applyActionOutputMapping<P>(
        actionResult: Record<string, unknown>,
        _payload: P,
        mappingConfig: string
    ): AgentPayloadChangeRequest<P> | null {
        try {
            const mapping: ActionOutputMapping = JSON.parse(mappingConfig);
            const updateObj: Record<string, unknown> = {};
            
            
            for (const [outputParam, payloadPath] of Object.entries(mapping)) {
                let value: unknown;
                
                if (outputParam === '*') {
                    value = actionResult;
                } else if (outputParam.includes('.')) {
                    // Support dot notation for nested property access (e.g., "AgentSpec.ID")
                    const parts = outputParam.split('.');
                    value = actionResult;

                    for (const part of parts) {
                        if (value && typeof value === 'object' && !Array.isArray(value)) {
                            // Case-insensitive lookup at each level
                            const actualKey = Object.keys(value as Record<string, unknown>).find(
                                key => key.toLowerCase() === part.toLowerCase()
                            );
                            value = actualKey ? (value as Record<string, unknown>)[actualKey] : undefined;
                        } else {
                            value = undefined;
                            break;
                        }
                    }
                } else {
                    // Simple case-insensitive lookup for non-dotted output parameters
                    const actualKey = Object.keys(actionResult).find(
                        key => key.toLowerCase() === outputParam.toLowerCase()
                    );
                    value = actualKey ? actionResult[actualKey] : undefined;
                }
                
                if (value !== undefined) {
                    // Parse the path and build nested object
                    const pathParts = payloadPath.split('.');
                    let current = updateObj;
                    
                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        if (!(part in current)) {
                            current[part] = {};
                        }
                        current = current[part] as Record<string, unknown>;
                    }
                    
                    current[pathParts[pathParts.length - 1]] = value;
                }
            }
            
            if (Object.keys(updateObj).length === 0) {
                return null;
            }
            
            
            return {
                updateElements: updateObj as Partial<P>
            };
        } catch (error) {
            LogError(`Failed to parse ActionOutputMapping: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Creates a BaseAgentNextStep for a flow node
     * 
     * @private
     */
    private async createStepForFlowNode<P>(
        params: ExecuteAgentParams<P>,
        node: AIAgentStepEntity,
        payload: P,
        flowState: FlowExecutionState
    ): Promise<BaseAgentNextStep<P>> {
        // Update flow state to mark this as current step
        flowState.currentStepId = node.ID;

        switch (node.StepType) {
            case 'Action':
                if (!node.ActionID) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Action step '${node.Name}' has no ActionID`,
                        newPayload: payload,
                        previousPayload: payload
                    });
                }
                
                // Need to get the action name
                const actionName = await this.getActionName(node.ActionID);
                
                
                if (!actionName) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Action not found for step '${node.Name}'`,
                        newPayload: payload,
                        previousPayload: payload
                    });
                }
                
                // Check if we have output mapping configured
                const baseStep = this.createNextStep<P>('Actions', {
                    actions: [{
                        name: actionName,
                        params: {} // Future: support parameter mapping
                    }],
                    terminate: false,
                    newPayload: payload,
                    previousPayload: payload
                });
                
                // Store the mapping config in a special property for later use
                // Always set stepId for action steps so PreProcessActionStep can access step entity
                (baseStep as Record<string, unknown>).stepId = node.ID;
                
                if (node.ActionOutputMapping) {
                    (baseStep as Record<string, unknown>).actionOutputMapping = node.ActionOutputMapping;
                }
                
                return baseStep;
                
            case 'Sub-Agent':
                if (!node.SubAgentID) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Sub-Agent step '${node.Name}' has no SubAgentID`,
                        newPayload: payload,
                        previousPayload: payload
                    });
                }

                // Need to get the sub-agent name
                const subAgentName = await this.getAgentName(node.SubAgentID);
                if (!subAgentName) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Sub-Agent not found for step '${node.Name}'`,
                        newPayload: payload,
                        previousPayload: payload
                    });
                }

                // Use node description to define the sub-agent's task
                // The full conversation history is preserved in params.conversationMessages
                // and will be available to the sub-agent through BaseAgent.ExecuteSubAgent()
                return this.createNextStep('Sub-Agent', {
                    subAgent: {
                        name: subAgentName,
                        message: node.Description || `Execute sub-agent: ${subAgentName}`,
                        terminateAfter: false
                    },
                    terminate: false,
                    newPayload: payload,
                    previousPayload: payload
                });
                
            case 'Prompt':
                // For prompt steps, we use Retry with a special marker
                // The base agent will need to handle this case
                if (!node.PromptID) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Prompt step '${node.Name}' has no PromptID`,
                        newPayload: payload,
                        previousPayload: payload
                    });
                }

                const retryStep: FlowAgentNextStep<P> = {
                    step: 'Retry',
                    message: node.Description || 'Executing prompt step for flow decision',
                    terminate: false,
                    // Special marker for flow prompt steps
                    flowPromptStepId: node.PromptID,
                    newPayload: payload,
                    previousPayload: payload
                };
                return retryStep;

            case 'ForEach':
                return await this.convertForEachStepToOperation(node, payload, flowState, params);

            case 'While':
                return await this.convertWhileStepToOperation(node, payload, flowState, params);

            default:
                return this.createNextStep('Failed', {
                    errorMessage: `Unknown step type: ${node.StepType}`,
                    newPayload: payload,
                    previousPayload: payload
                });
        }
    }
    
    
    /**
     * Gets action name by ID
     * 
     * @private
     */
    private async getActionName(actionId: string): Promise<string | null> {
        const action = ActionEngineServer.Instance.Actions.find(a => a.ID === actionId);
        return action?.Name || null;
    }
    
    /**
     * Gets agent name by ID
     * 
     * @private
     */
    private async getAgentName(agentId: string): Promise<string | null> {
        const agent = AIEngine.Instance.Agents.find(a => a.ID === agentId);
        return agent?.Name || null;
    }
    
    /**
     * Processes action results and applies output mapping if configured
     * This should be called by BaseAgent after action execution
     * 
     * @public
     */
    public processActionResult<P>(
        actionResult: Record<string, unknown>,
        _stepId: string,
        outputMapping?: string,
        currentPayload?: P
    ): AgentPayloadChangeRequest<P> | null {
        if (!outputMapping) {
            return null;
        }
        
        return this.applyActionOutputMapping(actionResult, currentPayload || {} as P, outputMapping);
    }
    
    /**
     * Override of BaseAgentType's PreProcessActionStep to handle Flow-specific input mapping.
     * 
     * This method checks if the current step has action input mapping configured
     * and applies it to map payload values or static values to action input parameters.
     * 
     * @override
     * @param {AgentAction[]} actions - The actions that will be executed (modified in place)
     * @param {P} currentPayload - The current payload
     * @param {BaseAgentNextStep<P>} currentStep - The current step being executed
     * 
     * @returns {Promise<void>} Actions are modified in place
     * 
     * @since 2.76.0
     */
    public async PreProcessActionStep<P = any, ATS = any>(
        actions: AgentAction[],
        currentPayload: P,
        agentTypeState: ATS,
        currentStep: BaseAgentNextStep<P>
    ): Promise<void> {
        // Try to find the flow state and use its payload if available
        const stepMetadata = currentStep as Record<string, unknown>;
        const stepId = stepMetadata.stepId as string | undefined;
                
        if (!stepId || actions.length === 0) {
            // No step ID or no actions to process
            return;
        }
        
        // Get the AIAgentStep from cached metadata
        const stepEntity = AIEngine.Instance.GetAgentStepByID(stepId);
        
        if (!stepEntity) {
            LogError(`Failed to find AIAgentStep for input mapping: ${stepId}`);
            return;
        }
        
        if (!stepEntity.ActionInputMapping) {
            // No input mapping configured
            return;
        }
        
        // For flow agents, we currently only support single action steps with input mapping
        // Future enhancement: support mapping to multiple actions
        if (actions.length > 1) {
            LogError('Flow agent action input mapping currently only supports single action steps');
            return;
        }
        
        try {
            // Parse the input mapping configuration
            // Expected format: { "paramName": "payload.path.to.value" | "static:value" | 123 | true }
            let inputMapping: Record<string, unknown>;
            
            if (typeof stepEntity.ActionInputMapping === 'string') {
                // ActionInputMapping is a JSON string - parse it
                inputMapping = JSON.parse(stepEntity.ActionInputMapping);
            } else if (typeof stepEntity.ActionInputMapping === 'object' && stepEntity.ActionInputMapping !== null) {
                // ActionInputMapping is already an object - use it directly
                inputMapping = stepEntity.ActionInputMapping as Record<string, unknown>;
            } else {
                // ActionInputMapping is null or invalid
                LogError(`Invalid ActionInputMapping format for step ${stepEntity.Name}: ${stepEntity.ActionInputMapping}`);
                return;
            }
            
            
            const action = actions[0];
            
            // Initialize params if not present
            if (!action.params) {
                action.params = {};
            }
            
            
            // Apply each mapping
            for (const [paramName, mappingValue] of Object.entries(inputMapping)) {
                // Use recursive resolution to handle nested objects, arrays, and primitive values
                const resolvedValue = this.resolveNestedValue(mappingValue, currentPayload);
                
                // Set the parameter value
                action.params[paramName] = resolvedValue;
            }
            
            if (IsVerboseLoggingEnabled()) {
                console.log(`Applied action input mapping for step ${stepEntity.Name}:`, action.params);
            }
        } catch (error) {
            LogError(`Failed to apply action input mapping: ${error.message}`);
        }
    }
    
    /**
     * Helper method to get a value from a nested object path
     * Supports both dot notation (obj.prop) and array indexing (arr[0])
     *
     * @private
     */
    private getValueFromPath(obj: any, path: string): unknown {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (!part) continue;

            // Check if this part contains array indexing like "arrayName[0]"
            const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);

            if (arrayMatch) {
                // Extract array name and index
                const arrayName = arrayMatch[1];
                const index = parseInt(arrayMatch[2], 10);

                // Navigate to the array
                if (current && typeof current === 'object' && arrayName in current) {
                    current = current[arrayName];

                    // Access the array element
                    if (Array.isArray(current) && index >= 0 && index < current.length) {
                        current = current[index];
                    } else {
                        return undefined;
                    }
                } else {
                    return undefined;
                }
            } else {
                // Regular property access
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return undefined;
                }
            }
        }

        return current;
    }
    
    /**
     * Recursively resolves payload and static references in nested objects
     * 
     * @private
     */
    private resolveNestedValue(value: unknown, currentPayload: any): unknown {
        if (typeof value === 'string') {
            // Handle string values with payload/static resolution
            if (value.startsWith('static:')) {
                return value.substring(7);
            } else if (value.startsWith('payload.')) {
                const path = value.substring(8);
                return this.getValueFromPath(currentPayload, path);
            } else {
                return value;
            }
        } else if (Array.isArray(value)) {
            // Handle arrays - recursively resolve each element
            return value.map(item => this.resolveNestedValue(item, currentPayload));
        } else if (value && typeof value === 'object') {
            // Handle objects - recursively resolve each property
            const resolvedObj: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
                resolvedObj[key] = this.resolveNestedValue(val, currentPayload);
            }
            return resolvedObj;
        } else {
            // Handle primitives (numbers, booleans, null, undefined)
            return value;
        }
    }
    
    /**
     * Override of BaseAgentType's PostProcessActionStep to handle Flow-specific logic.
     * 
     * This method checks if the current step has action output mapping configured
     * and applies it to update the payload accordingly.
     * 
     * @override
     * @param {ActionResult[]} actionResults - The results from action execution
     * @param {AgentAction[]} actions - The actions that were executed
     * @param {P} currentPayload - The current payload
     * @param {BaseAgentNextStep<P>} currentStep - The current step being executed
     * 
     * @returns {Promise<AgentPayloadChangeRequest<P> | null>} Payload changes from output mapping
     */
    public async PostProcessActionStep<P = any, ATS = any>(
        actionResults: ActionResult[],
        actions: AgentAction[],
        currentPayload: P,
        agentTypeState: ATS,
        currentStep: BaseAgentNextStep<P>
    ): Promise<AgentPayloadChangeRequest<P> | null> {
        // Check if this step has action output mapping configured
        const stepMetadata = currentStep as Record<string, unknown>;
        const outputMapping = stepMetadata.actionOutputMapping as string | undefined;
        const stepId = stepMetadata.stepId as string | undefined;
        
        if (!outputMapping || !stepId || actionResults.length === 0) {
            // No mapping configured or no results to process
            return null;
        }
        
        // For flow agents, we currently only support single action steps with output mapping
        // Future enhancement: support mapping from multiple actions
        if (actionResults.length > 1) {
            LogError('Flow agent action output mapping currently only supports single action steps');
            return null;
        }
        
        // Extract output parameters from the action result
        const actionResult = actionResults[0];
        const outputParams: Record<string, unknown> = {};
        
        // Filter for output parameters (Type === 'Output' or 'Both')
        if (actionResult.Params) {
            for (const param of actionResult.Params) {
                if (param.Type === 'Output' || param.Type === 'Both') {
                    outputParams[param.Name] = param.Value;
                }
            }
        }
        
        // Apply the mapping using our existing method
        const payloadChange = this.applyActionOutputMapping(outputParams, currentPayload, outputMapping);
        
        // Update flow state with the modified payload
        // This ensures the payload persists when DetermineNextStep is called again
        if (payloadChange && payloadChange.updateElements) {
            const existingPayload = currentPayload || {};
            
            // Apply the payload change using PayloadManager's merge capabilities
            const mergeResult = this._payloadManager.applyAgentChangeRequest(
                existingPayload,
                payloadChange,
                {
                    logChanges: false,
                    verbose: IsVerboseLoggingEnabled()
                }
            ); 
            
            // Log any warnings if present
            if (mergeResult.warnings && mergeResult.warnings.length > 0) {
                LogError(`Warnings during payload merge in flow state: ${mergeResult.warnings.join(', ')}`);
            }
        }
        
        return payloadChange;
    }

    /**
     * Determines the initial step for flow agent types.
     * 
     * Flow agents look up their configured starting step instead of executing a prompt.
     * 
     * @param {ExecuteAgentParams} params - The full execution parameters
     * @returns {Promise<BaseAgentNextStep<P> | null>} The initial step to execute, or null if flow context not ready
     * 
     * @override
     * @since 2.76.0
     */
    public async DetermineInitialStep<P = any, ATS = any>(params: ExecuteAgentParams<P>, payload: P, agentTypeState: ATS): Promise<BaseAgentNextStep<P> | null> {
        const flowState = agentTypeState as FlowExecutionState;
        const payloadToUse = payload || {} as P;
                
        const startingSteps = await this.getStartingSteps(flowState.agentId);
        
        if (startingSteps.length === 0) {
            return this.createNextStep('Failed', {
                errorMessage: 'No starting steps defined for flow agent'
            });
        }
        
        // Execute the first starting step
        // Future enhancement: support parallel starting steps
        return await this.createStepForFlowNode(params, startingSteps[0], payloadToUse, flowState);
    }

    /**
     * Pre-processes steps for flow agent types.
     * 
     * For Flow agents, 'Retry' after actions means evaluate paths from the current step
     * and continue the flow based on the updated payload. The only exception is when
     * executing a Prompt step within the flow, which should execute normally.
     * 
     * Also, 'Success' steps after sub-agents need to be evaluated in the same way as Retry after actions
     * 
     * @param {ExecuteAgentParams} params - The full execution parameters
     * @param {BaseAgentNextStep} step - The retry step that was returned
     * @param {P} payload - The current payload
     * @param {ATS} agentTypeState - The current agent type state
     * @returns {Promise<BaseAgentNextStep<P> | null>} The next flow step, or null for prompt execution
     * 
     * @override
     * @since 2.76.0
     */
    public async PreProcessNextStep<P = any, ATS = any>(
        params: ExecuteAgentParams<P>,
        step: BaseAgentNextStep<P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P> | null> {
        // we only want to do special processing for retry or success steps, other ones can use default logic in Base Agent
        if (step.step !== 'Retry' && step.step !== 'Success') {
            // Not a retry or success step, use default processing
            return null;
        }

        // Check if this is a special flow prompt step marker
        const flowStep = step as FlowAgentNextStep<P>;
        if (flowStep.flowPromptStepId) {
            // This is a prompt step in the flow, let it execute normally
            return null;
        }

        // Get the updated payload (after action execution)
        const payloadFromStep = payload || step.newPayload || params.payload || {} as P;
        const flowState = agentTypeState as FlowExecutionState;
        
        // CRITICAL FIX: Don't overwrite the flow state's payload if it already has accumulated data
        // The retry step only contains the action's output mapping result, not the full payload
        // If flow state already has a payload with more data, keep it
        let currentPayload = payloadFromStep;
        
        // We should have a current step ID from the flow state
        if (!flowState.currentStepId) {
            return this.createNextStep('Failed', {
                errorMessage: 'No current step in flow state after action execution',
                newPayload: currentPayload,
                previousPayload: currentPayload
            });
        }
        
        // Find valid paths from current step using updated payload
        const paths = await this.getValidPaths(flowState.currentStepId, currentPayload, flowState);
        
        if (paths.length === 0) {
            // No valid paths - flow is complete
            return this.createSuccessStep({
                message: 'Flow completed - no more paths to follow',
                newPayload: currentPayload,
                previousPayload: currentPayload
            });
        }
        
        // Get the destination step for the highest priority path
        const nextStep = await this.getStepById(paths[0].DestinationStepID);
        
        if (!nextStep) {
            return this.createNextStep('Failed', {
                errorMessage: `Destination step not found: ${paths[0].DestinationStepID}`
            });
        }
        
        // Check if the step is active
        if (nextStep.Status !== 'Active') {
            // Try alternate paths
            for (let i = 1; i < paths.length; i++) {
                const alternateStep = await this.getStepById(paths[i].DestinationStepID);
                if (alternateStep && alternateStep.Status === 'Active') {
                    return await this.createStepForFlowNode(params, alternateStep, currentPayload, flowState);
                }
            }
            
            return this.createNextStep('Failed', {
                errorMessage: `No active steps found. Step '${nextStep.Name}' has status: ${nextStep.Status}`,
                newPayload: currentPayload,
                previousPayload: currentPayload
            });
        }
        
        // Create the next step based on the flow node
        return await this.createStepForFlowNode(params, nextStep, currentPayload, flowState);
    }

    /**
     * Gets the prompt to use for a specific step.
     * Flow agents may use different prompts for different steps in the flow.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @param {AgentConfiguration} config - The loaded agent configuration
     * @param {BaseAgentNextStep | null} previousDecision - The previous step decision that may contain flow prompt info
     * @returns {Promise<AIPromptEntityExtended | null>} Custom prompt for flow steps, or default config.childPrompt
     * 
     * @override
     * @since 2.76.0
     */
    public async GetPromptForStep<P = any, ATS = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        payload: P,
        agentTypeState: ATS,
        previousDecision?: BaseAgentNextStep<P> | null
    ): Promise<AIPromptEntityExtended | null> {
        // Check if this is a flow prompt step with a specific prompt ID
        const flowDecision = previousDecision as FlowAgentNextStep<P> | null;
        if (flowDecision?.flowPromptStepId) {
            const promptId = flowDecision.flowPromptStepId;
            
            // Get the specific prompt from AIEngine (avoids database hit)
            const promptEntity = AIEngine.Instance.Prompts.find(p => p.ID === promptId);
            if (promptEntity) {
                return promptEntity;
            } else {
                LogError(`Failed to find flow prompt with ID: ${promptId} in AIEngine`);
                // Fall back to default
                return config.childPrompt || null;
            }
        }
        
        // For non-flow-prompt steps, use the default prompt
        return config.childPrompt || null;
    }

    /**
     * Converts a Flow Agent ForEach step into universal ForEachOperation format
     * that BaseAgent can execute
     */
    private async convertForEachStepToOperation<P>(
        node: AIAgentStepEntity,
        payload: P,
        flowState: FlowExecutionState,
        params: ExecuteAgentParams<P>
    ): Promise<BaseAgentNextStep<P>> {
        if (!node.Configuration) {
            return this.createNextStep('Failed', {
                errorMessage: `ForEach step '${node.Name}' has no Configuration`,
                newPayload: payload,
                previousPayload: payload
            });
        }

        // Parse base configuration from AIAgentStep
        const baseConfig = JSON.parse(node.Configuration);

        // Build universal ForEachOperation
        const forEach: ForEachOperation = {
            collectionPath: baseConfig.collectionPath,
            itemVariable: baseConfig.itemVariable,
            indexVariable: baseConfig.indexVariable,
            maxIterations: baseConfig.maxIterations,
            continueOnError: baseConfig.continueOnError,
            delayBetweenIterationsMs: baseConfig.delayBetweenIterationsMs,
            executionMode: baseConfig.executionMode,
            maxConcurrency: baseConfig.maxConcurrency
        };

        // Add action or subAgent based on LoopBodyType (using cached engine data - no await needed)
        if (node.LoopBodyType === 'Action') {
            const action = AIEngine.Instance.Actions.find(a => a.ID === node.ActionID);
            if (!action) {
                return this.createNextStep('Failed', {
                    errorMessage: `Action not found for loop body: ${node.ActionID}`,
                    newPayload: payload,
                    previousPayload: payload
                });
            }

            forEach.action = {
                name: action.Name,
                params: JSON.parse(node.ActionInputMapping || '{}'),
                outputMapping: node.ActionOutputMapping || undefined
            };
        } else if (node.LoopBodyType === 'Sub-Agent') {
            const subAgent = AIEngine.Instance.Agents.find(a => a.ID === node.SubAgentID);
            if (!subAgent) {
                return this.createNextStep('Failed', {
                    errorMessage: `Sub-Agent not found for loop body: ${node.SubAgentID}`,
                    newPayload: payload,
                    previousPayload: payload
                });
            }

            forEach.subAgent = {
                name: subAgent.Name,
                message: node.Description || `Execute sub-agent: ${subAgent.Name}`,
                templateParameters: {}
            };
        } else if (node.LoopBodyType === 'Prompt') {
            return this.createNextStep('Failed', {
                errorMessage: 'Prompt loop bodies not yet fully supported',
                newPayload: payload,
                previousPayload: payload
            });
        }

        // Store stepId in flow state for later (when loop completes, we need to navigate paths)
        flowState.currentStepId = node.ID;

        // Return ForEach decision for BaseAgent to execute
        return {
            step: 'ForEach',
            forEach,
            terminate: false,
            newPayload: payload,
            previousPayload: payload,
            agentTypeData: { stepId: node.ID }  // Flow needs to remember which step this is
        } as BaseAgentNextStep<P> & { agentTypeData?: any };
    }

    /**
     * Converts a Flow Agent While step into universal WhileOperation format
     * that BaseAgent can execute
     */
    private async convertWhileStepToOperation<P>(
        node: AIAgentStepEntity,
        payload: P,
        flowState: FlowExecutionState,
        params: ExecuteAgentParams<P>
    ): Promise<BaseAgentNextStep<P>> {
        if (!node.Configuration) {
            return this.createNextStep('Failed', {
                errorMessage: `While step '${node.Name}' has no Configuration`,
                newPayload: payload,
                previousPayload: payload
            });
        }

        // Parse base configuration
        const baseConfig = JSON.parse(node.Configuration);

        // Build universal WhileOperation
        const whileOp: WhileOperation = {
            condition: baseConfig.condition,
            itemVariable: baseConfig.itemVariable,
            maxIterations: baseConfig.maxIterations,
            continueOnError: baseConfig.continueOnError,
            delayBetweenIterationsMs: baseConfig.delayBetweenIterationsMs
        };

        // Add action or subAgent based on LoopBodyType
        if (node.LoopBodyType === 'Action') {
            const action = AIEngine.Instance.Actions.find(a => a.ID === node.ActionID);
            if (!action) {
                return this.createNextStep('Failed', {
                    errorMessage: `Action not found for loop body: ${node.ActionID}`,
                    newPayload: payload,
                    previousPayload: payload
                });
            }

            whileOp.action = {
                name: action.Name,
                params: JSON.parse(node.ActionInputMapping || '{}'),
                outputMapping: node.ActionOutputMapping || undefined
            };
        } else if (node.LoopBodyType === 'Sub-Agent') {
            const subAgent = AIEngine.Instance.Agents.find(a => a.ID === node.SubAgentID);
            if (!subAgent) {
                return this.createNextStep('Failed', {
                    errorMessage: `Sub-Agent not found for loop body: ${node.SubAgentID}`,
                    newPayload: payload,
                    previousPayload: payload
                });
            }

            whileOp.subAgent = {
                name: subAgent.Name,
                message: node.Description || `Execute sub-agent: ${subAgent.Name}`,
                templateParameters: {}
            };
        } else if (node.LoopBodyType === 'Prompt') {
            return this.createNextStep('Failed', {
                errorMessage: 'Prompt loop bodies not yet fully supported',
                newPayload: payload,
                previousPayload: payload
            });
        }

        // Store stepId for later path navigation
        flowState.currentStepId = node.ID;

        // Return While decision for BaseAgent to execute
        return {
            step: 'While',
            while: whileOp,
            terminate: false,
            newPayload: payload,
            previousPayload: payload,
            agentTypeData: { stepId: node.ID }
        } as BaseAgentNextStep<P> & { agentTypeData?: any };
    }

    /**
     * Flow agents don't need loop results injected as messages - they navigate paths
     * @override
     */
    public get InjectLoopResultsAsMessage(): boolean {
        return false;
    }

    /**
     * Flow agents pass full conversation history to sub-agents to preserve
     * multi-turn context across workflow steps.
     *
     * Unlike the default implementation, Flow agents do NOT add the subAgentRequest.message
     * as a separate user message, because the Flow step's Description field already defines
     * the task and is used as the message. The full conversation history provides all the
     * context the sub-agent needs.
     *
     * @override
     * @since 2.113.0
     */
    public PrepareSubAgentConversation(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        contextMessage?: ChatMessage
    ): ChatMessage[] {
        // Start with full conversation history
        const messages: ChatMessage[] = [...params.conversationMessages];

        // Add context message if provided (from SubAgentContextPaths)
        if (contextMessage) {
            messages.push(contextMessage);
        }

        // Note: We do NOT add subAgentRequest.message here because:
        // 1. Flow step Description already defines the task in createStepForFlowNode
        // 2. The full conversation history already contains all user messages
        // 3. Adding it would duplicate/confuse the context

        return messages;
    }

    /**
     * Flow agents apply ActionOutputMapping after each iteration
     * @override
     */
    public AfterLoopIteration<P>(
        iterationResult: {
            actionResults?: ActionResult[];
            subAgentResult?: any;
            currentPayload: P;
            itemVariable: string;
            item: any;
            index: number;
            loopContext: any;
        } 
    ): P | null {
        const loopContext = iterationResult.loopContext;

        // Only apply for actions with output mapping
        if (!iterationResult.actionResults || !loopContext.actionOutputMapping) {
            return null;
        }

        // Extract output parameters
        const outputParams: Record<string, unknown> = {};
        if (iterationResult.actionResults[0]?.Params) {
            for (const param of iterationResult.actionResults[0].Params) {
                if (param.Type === 'Output' || param.Type === 'Both') {
                    outputParams[param.Name] = param.Value;
                }
            }
        }

        // Replace iteration variables in output mapping paths before applying
        let resolvedOutputMapping = loopContext.actionOutputMapping;
        const indexVar = loopContext.indexVariable || 'index';
        const itemVar = loopContext.itemVariable || 'item';

        // Replace [index] with [0], [1], etc.
        resolvedOutputMapping = resolvedOutputMapping.replace(
            new RegExp(`\\[${indexVar}\\]`, 'g'),
            `[${iterationResult.index}]`
        );

        // Apply output mapping with resolved paths
        const payloadChange = this.applyActionOutputMapping(
            outputParams,
            iterationResult.currentPayload,
            resolvedOutputMapping
        );

        if (payloadChange?.updateElements) {
            // Deep merge to preserve existing payload structure
            return this._payloadManager.deepMerge(
                iterationResult.currentPayload,
                payloadChange.updateElements
            );
        }

        return null;
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadFlowAgentType() {
    // This function ensures the class isn't tree-shaken
}
