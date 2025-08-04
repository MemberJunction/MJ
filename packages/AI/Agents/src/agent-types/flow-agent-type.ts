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
import { AIPromptRunResult, BaseAgentNextStep, AIPromptParams, AgentPayloadChangeRequest, AgentAction, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { LogError, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { ActionResult } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';

/**
 * Flow execution state that tracks the progress through the workflow.
 * This is maintained by the Flow Agent Type during execution.
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
    
    /** The current payload state - CRITICAL for maintaining state across steps */
    currentPayload?: unknown;
    
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
 * Response structure for Flow Agent prompt steps
 */
interface FlowAgentPromptResponse {
    /**
     * The name or ID of the next step to execute
     */
    nextStepName?: string;
    
    /**
     * Reasoning for the decision
     */
    reasoning?: string;
    
    /**
     * Confidence level (0.0-1.0)
     */
    confidence?: number;
    
    /**
     * Whether to terminate the flow
     */
    terminate?: boolean;
    
    /**
     * Message to include with the decision
     */
    message?: string;
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
    
    /**
     * Static map to store flow execution state by agent run ID.
     * This allows us to maintain state across multiple step executions.
     */
    private static _flowStates = new Map<string, FlowExecutionState>();
    
    /**
     * Gets or creates flow execution state for an agent run
     */
    private getOrCreateFlowState(agentRunId: string, agentId: string): FlowExecutionState {
        let state = FlowAgentType._flowStates.get(agentRunId);
        if (!state) {
            state = new FlowExecutionState(agentId);
            FlowAgentType._flowStates.set(agentRunId, state);
        }
        return state;
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
    public async DetermineNextStep<P>(
        promptResult: AIPromptRunResult | null, 
        params: ExecuteAgentParams<any, P>
    ): Promise<BaseAgentNextStep<P>> {
        try {
            // Get agent run ID from parent run or generate a temporary one
            const agentRunId = params.parentRun?.ID || `temp-${params.agent.ID}`;
            const flowState = this.getOrCreateFlowState(agentRunId, params.agent.ID);
            
            // CRITICAL FIX: Use stored payload from flow state to maintain state across steps
            let currentPayload = (flowState.currentPayload as P) || params.payload || {} as P;
            
            //FLOW AGENT DEBUGGING - Log entry to DetermineNextStep
            console.log('FLOW AGENT DEBUGGING - DetermineNextStep called:', {
                agentId: params.agent.ID,
                agentName: params.agent.Name,
                currentStepId: flowState.currentStepId,
                completedSteps: Array.from(flowState.completedStepIds),
                payload: currentPayload
            });
            
            // If no current step, this should have been handled by DetermineInitialStep
            if (!flowState.currentStepId) {
                const startingSteps = await this.getStartingSteps(flowState.agentId);
                
                if (startingSteps.length === 0) {
                    return this.createNextStep('Failed', {
                        errorMessage: 'No starting steps defined for flow agent'
                    });
                }
                
                // For now, execute the first starting step
                // Future enhancement: support parallel starting steps
                return await this.createStepForFlowNode(startingSteps[0], currentPayload, flowState);
            }
            
            // Get current step to check if it was a Prompt step
            const currentStep = await this.getStepById(flowState.currentStepId);
            
            // If current step was a Prompt, update payload with the prompt result
            if (currentStep?.StepType === 'Prompt' && promptResult) {
                //FLOW AGENT DEBUGGING - Log raw prompt result
                console.log('FLOW AGENT DEBUGGING - Raw prompt result:', {
                    success: promptResult.success,
                    result: promptResult.result,
                    resultType: typeof promptResult.result,
                    firstChars: typeof promptResult.result === 'string' ? promptResult.result.substring(0, 100) : 'not a string'
                });
                
                // Parse the prompt result as JSON
                const promptResponse = this.parseJSONResponse<any>(promptResult);
                
                if (promptResponse) {
                    // Update the payload with the prompt result
                    // Merge the prompt response into the current payload
                    currentPayload = {
                        ...currentPayload,
                        ...promptResponse
                    } as P;
                    
                    // CRITICAL: Store the updated payload in flow state for subsequent steps
                    flowState.currentPayload = currentPayload;
                    
                    //FLOW AGENT DEBUGGING - Log updated payload
                    console.log('FLOW AGENT DEBUGGING - Updated payload after prompt:', {
                        payload: currentPayload
                    });
                }
            }
            
            // Find valid paths from current step
            const paths = await this.getValidPaths(flowState.currentStepId, currentPayload, flowState);
            
            //FLOW AGENT DEBUGGING - Log path evaluation
            console.log('FLOW AGENT DEBUGGING - Valid paths from step:', {
                currentStepId: flowState.currentStepId,
                pathCount: paths.length,
                paths: paths.map(p => ({ 
                    destinationStepId: p.DestinationStepID,
                    condition: p.Condition,
                    priority: p.Priority
                }))
            });
            
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
                        return await this.createStepForFlowNode(alternateStep, currentPayload, flowState);
                    }
                }
                
                // No active steps found in any path
                return this.createNextStep('Failed', {
                    errorMessage: `No active steps found. Step '${nextStep.Name}' has status: ${nextStep.Status}`
                });
            }
            
            return await this.createStepForFlowNode(nextStep, currentPayload, flowState);
            
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
    public async InjectPayload<P = any>(
        payload: P, 
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
            const flowState = FlowAgentType._flowStates.get(agentInfo.agentRunId);
            if (flowState) {
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
        return AIEngine.Instance.GetAgentStepById(stepId);
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
                
                //FLOW AGENT DEBUGGING - Log condition evaluation
                console.log('FLOW AGENT DEBUGGING - Evaluating path condition:', {
                    pathId: path.ID,
                    condition: path.Condition,
                    context: JSON.stringify(context, null, 2)
                });
                
                const evalResult = this._evaluator.evaluate(path.Condition, context);
                
                //FLOW AGENT DEBUGGING - Log evaluation result
                console.log('FLOW AGENT DEBUGGING - Condition evaluation result:', {
                    pathId: path.ID,
                    success: evalResult.success,
                    value: evalResult.value,
                    error: evalResult.error
                });
                
                if (evalResult.success && evalResult.value) {
                    validPaths.push(path);
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
            
            //FLOW AGENT DEBUGGING - Log output mapping
            console.log('FLOW AGENT DEBUGGING - Processing action output mapping:', {
                actionResult: actionResult,
                mappingConfig: mapping,
                currentPayload: _payload
            });
            
            for (const [outputParam, payloadPath] of Object.entries(mapping)) {
                let value: unknown;
                
                if (outputParam === '*') {
                    value = actionResult;
                } else {
                    // Case-insensitive lookup for the output parameter
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
            
            //FLOW AGENT DEBUGGING - Log final payload update
            console.log('FLOW AGENT DEBUGGING - Action output mapping result:', {
                updateObj: updateObj
            });
            
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
        node: AIAgentStepEntity,
        payload: P,
        flowState: FlowExecutionState
    ): Promise<BaseAgentNextStep<P>> {
        // Update flow state to mark this as current step
        flowState.currentStepId = node.ID;
        
        //FLOW AGENT DEBUGGING - Log step creation
        console.log('FLOW AGENT DEBUGGING - Creating step for node:', {
            nodeId: node.ID,
            nodeName: node.Name,
            nodeType: node.StepType,
            actionId: node.ActionID,
            promptId: node.PromptID,
            subAgentId: node.SubAgentID
        });
        
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
                
                //FLOW AGENT DEBUGGING - Log action lookup
                console.log('FLOW AGENT DEBUGGING - Looking up action:', {
                    stepName: node.Name,
                    actionId: node.ActionID,
                    actionNameFound: actionName,
                    inputMapping: node.ActionInputMapping,
                    outputMapping: node.ActionOutputMapping
                });
                
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
                
                return this.createNextStep('Retry', {
                    message: node.Description || 'Executing prompt step for flow decision',
                    terminate: false,
                    // Special marker for flow prompt steps
                    flowPromptStepId: node.PromptID,
                    newPayload: payload,
                    previousPayload: payload
                } as any);
                
            default:
                return this.createNextStep('Failed', {
                    errorMessage: `Unknown step type: ${node.StepType}`,
                    newPayload: payload,
                    previousPayload: payload
                });
        }
    }
    
    /**
     * Deep merges two objects, with values from source overwriting values in target
     * 
     * @private
     */
    private deepMergePayloads(target: any, source: any): any {
        if (!source || typeof source !== 'object') {
            return target;
        }
        
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    // If the source value is an object (but not an array), recursively merge
                    result[key] = this.deepMergePayloads(result[key] || {}, source[key]);
                } else {
                    // Otherwise, directly assign the value from source
                    result[key] = source[key];
                }
            }
        }
        
        return result;
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
    public async PreProcessActionStep<P>(
        actions: AgentAction[],
        currentPayload: P,
        currentStep: BaseAgentNextStep<P>
    ): Promise<void> {
        // CRITICAL FIX: For Flow agents, we need to use the payload from flow state
        // because it contains the accumulated state from previous steps
        let actualPayload = currentPayload;
        
        // Try to find the flow state and use its payload if available
        const stepMetadata = currentStep as Record<string, unknown>;
        const stepId = stepMetadata.stepId as string | undefined;
        
        if (stepId) {
            // Find the flow state that has this step as current
            for (const [agentRunId, flowState] of FlowAgentType._flowStates) {
                if (flowState.currentStepId === stepId && flowState.currentPayload) {
                    actualPayload = flowState.currentPayload as P;
                    console.log('FLOW AGENT DEBUGGING - Using payload from flow state in PreProcessActionStep:', {
                        agentRunId,
                        stepId,
                        flowStatePayloadKeys: Object.keys(flowState.currentPayload as any || {}),
                        paramPayloadKeys: Object.keys(currentPayload || {})
                    });
                    break;
                }
            }
        }
        
        //FLOW AGENT DEBUGGING - Log PreProcessActionStep entry
        console.log('FLOW AGENT DEBUGGING - PreProcessActionStep called:', {
            actionCount: actions.length,
            actions: actions.map(a => ({ name: a.name, params: a.params })),
            payloadKeys: Object.keys(actualPayload || {}),
            stepType: currentStep.step
        });
        
        if (!stepId || actions.length === 0) {
            // No step ID or no actions to process
            return;
        }
        
        // Get the AIAgentStep from cached metadata
        const stepEntity = AIEngine.Instance.GetAgentStepById(stepId);
        
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
            
            //FLOW AGENT DEBUGGING - Log input mapping details
            console.log('FLOW AGENT DEBUGGING - Input mapping parsed:', {
                stepName: stepEntity.Name,
                inputMapping: inputMapping,
                currentPayload: actualPayload
            });
            
            const action = actions[0];
            
            // Initialize params if not present
            if (!action.params) {
                action.params = {};
            }
            
            //FLOW AGENT DEBUGGING - Log input mapping
            console.log('FLOW AGENT DEBUGGING - Processing action input mapping:', {
                stepName: stepEntity.Name,
                actionName: action.name,
                inputMapping: inputMapping,
                currentPayload: actualPayload
            });
            
            // Apply each mapping
            for (const [paramName, mappingValue] of Object.entries(inputMapping)) {
                // Use recursive resolution to handle nested objects, arrays, and primitive values
                const resolvedValue = this.resolveNestedValue(mappingValue, actualPayload);
                
                //FLOW AGENT DEBUGGING - Log parameter mapping
                console.log('FLOW AGENT DEBUGGING - Mapped parameter:', {
                    paramName: paramName,
                    mappingValue: mappingValue,
                    resolvedValue: resolvedValue
                });
                
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
     * 
     * @private
     */
    private getValueFromPath(obj: any, path: string): unknown {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return undefined;
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
     * @param {AgentAction[]} _actions - The actions that were executed
     * @param {P} currentPayload - The current payload
     * @param {BaseAgentNextStep<P>} currentStep - The current step being executed
     * 
     * @returns {Promise<AgentPayloadChangeRequest<P> | null>} Payload changes from output mapping
     */
    public async PostProcessActionStep<P>(
        actionResults: ActionResult[],
        _actions: AgentAction[],
        currentPayload: P,
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
        
        // CRITICAL: Update flow state with the modified payload
        // This ensures the payload persists when DetermineNextStep is called again
        if (payloadChange && payloadChange.updateElements) {
            // Try to find the flow state - we need to iterate since we don't have the run ID here
            // This is a temporary workaround - ideally we'd have the run ID passed through
            for (const [agentRunId, flowState] of FlowAgentType._flowStates) {
                if (flowState.currentStepId === stepId) {
                    // CRITICAL FIX: Merge the payload changes with the existing flow state payload
                    // Use the flow state's current payload as the base, not the currentPayload parameter
                    const existingPayload = flowState.currentPayload || currentPayload || {};
                    
                    // Deep merge the update elements into the existing payload
                    flowState.currentPayload = this.deepMergePayloads(
                        existingPayload,
                        payloadChange.updateElements
                    );
                    
                    console.log('FLOW AGENT DEBUGGING - Updated flow state payload after action:', {
                        agentRunId,
                        stepId,
                        updatedPayload: flowState.currentPayload
                    });
                    break;
                }
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
    public async DetermineInitialStep<P = any>(params: ExecuteAgentParams<P>): Promise<BaseAgentNextStep<P> | null> {
        const agentRunId = params.parentRun?.ID || `temp-${params.agent.ID}`;
        const flowState = this.getOrCreateFlowState(agentRunId, params.agent.ID);
        const payload = params.payload || {} as P;
        
        //FLOW AGENT DEBUGGING - Log initial step determination
        console.log('FLOW AGENT DEBUGGING - DetermineInitialStep called:', {
            agentId: params.agent.ID,
            agentName: params.agent.Name,
            agentRunId: agentRunId,
            initialPayload: payload
        });
        
        // Store initial payload in flow state
        flowState.currentPayload = payload;
        
        const startingSteps = await this.getStartingSteps(flowState.agentId);
        
        if (startingSteps.length === 0) {
            return this.createNextStep('Failed', {
                errorMessage: 'No starting steps defined for flow agent'
            });
        }
        
        // Execute the first starting step
        // Future enhancement: support parallel starting steps
        return await this.createStepForFlowNode(startingSteps[0], payload, flowState);
    }

    /**
     * Pre-processes retry steps for flow agent types.
     * 
     * For Flow agents, 'Retry' after actions means evaluate paths from the current step
     * and continue the flow based on the updated payload. The only exception is when
     * executing a Prompt step within the flow, which should execute normally.
     * 
     * @param {ExecuteAgentParams} params - The full execution parameters
     * @param {BaseAgentNextStep} retryStep - The retry step that was returned
     * @returns {Promise<BaseAgentNextStep<P> | null>} The next flow step, or null for prompt execution
     * 
     * @override
     * @since 2.76.0
     */
    public async PreProcessRetryStep<P = any>(
        params: ExecuteAgentParams<P>,
        retryStep: BaseAgentNextStep<P>
    ): Promise<BaseAgentNextStep<P> | null> {
        // Check if this is a special flow prompt step marker
        const stepMetadata = retryStep as any;
        if (stepMetadata.flowPromptStepId) {
            // This is a prompt step in the flow, let it execute normally
            return null;
        }
        
        // Get the updated payload (after action execution)
        const payloadFromRetryStep = retryStep.newPayload || params.payload || {} as P;
        const agentRunId = params.parentRun?.ID || `temp-${params.agent.ID}`;
        const flowState = this.getOrCreateFlowState(agentRunId, params.agent.ID);
        
        // CRITICAL FIX: Don't overwrite the flow state's payload if it already has accumulated data
        // The retry step only contains the action's output mapping result, not the full payload
        // If flow state already has a payload with more data, keep it
        let currentPayload = payloadFromRetryStep;
        
        if (flowState.currentPayload) {
            // Check if the flow state has more complete data
            const flowStateKeys = Object.keys(flowState.currentPayload as any || {});
            const retryStepKeys = Object.keys(payloadFromRetryStep || {});
            
            // If flow state has more keys or different structure, it likely has the accumulated data
            if (flowStateKeys.length > retryStepKeys.length || 
                (flowStateKeys.includes('userData') && !retryStepKeys.includes('userData'))) {
                // Flow state has more complete data - use it as the base
                currentPayload = flowState.currentPayload as P;
                console.log('FLOW AGENT DEBUGGING - Keeping flow state payload in PreProcessRetryStep');
            } else {
                // Update flow state with the new payload
                flowState.currentPayload = currentPayload;
            }
        } else {
            // No existing flow state payload, use what we got from retry step
            flowState.currentPayload = currentPayload;
        }
        
        console.log('FLOW AGENT DEBUGGING - PreProcessRetryStep payload resolution:', {
            agentRunId,
            currentStepId: flowState.currentStepId,
            payloadFromRetryStep: !!retryStep.newPayload,
            flowStateHasPayload: !!flowState.currentPayload,
            currentPayloadKeys: Object.keys(currentPayload || {}),
            currentPayload: currentPayload
        });
        
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
                    return await this.createStepForFlowNode(alternateStep, currentPayload, flowState);
                }
            }
            
            return this.createNextStep('Failed', {
                errorMessage: `No active steps found. Step '${nextStep.Name}' has status: ${nextStep.Status}`,
                newPayload: currentPayload,
                previousPayload: currentPayload
            });
        }
        
        // Create the next step based on the flow node
        return await this.createStepForFlowNode(nextStep, currentPayload, flowState);
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadFlowAgentType() {
    // This function ensures the class isn't tree-shaken
}