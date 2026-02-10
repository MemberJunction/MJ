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
import { AIPromptRunResult, BaseAgentNextStep, AIPromptParams, AgentPayloadChangeRequest, AgentAction, ExecuteAgentParams, AgentConfiguration, ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';
import { LogError, LogStatus, LogStatusEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { AIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { ActionResult } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { PayloadManager } from '../PayloadManager';
import { ConversationMessageResolver } from '../utils/ConversationMessageResolver';

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

    /** Special fields from action output mappings (message, reasoning, confidence) */
    specialFields?: {
        message?: string;
        reasoning?: string;
        confidence?: number;
    };

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
 * Flow Agent-specific execution parameters.
 *
 * These parameters allow callers to customize how a Flow Agent executes,
 * including starting at a specific step or skipping certain steps.
 * Use with ExecuteAgentParams.agentTypeParams for type-safe configuration.
 *
 * @example
 * ```typescript
 * import { FlowAgentExecuteParams } from '@memberjunction/ai-agents';
 *
 * // Get the step to start at
 * const approvalStep = AIEngine.Instance.GetAgentSteps(agentId)
 *   .find(s => s.Name === 'Approval Review');
 *
 * const params: ExecuteAgentParams<any, any, FlowAgentExecuteParams> = {
 *   agent: myFlowAgent,
 *   conversationMessages: messages,
 *   agentTypeParams: {
 *     startAtStep: approvalStep,  // Skip initial steps, start here
 *   }
 * };
 * ```
 *
 * @since 2.127.0
 */
export interface FlowAgentExecuteParams {
    /**
     * Start execution at a specific step instead of the flow's entry point.
     *
     * When provided, the flow agent will begin execution at this step,
     * skipping all steps that would normally precede it. This is useful for:
     * - Resuming a flow from a specific point
     * - Testing specific branches of a flow
     * - Re-running a portion of a flow after a failure
     *
     * The step must belong to the agent being executed.
     * Use AIEngine.Instance.GetAgentSteps(agentId) to retrieve available steps.
     */
    startAtStep?: AIAgentStepEntity;

    /**
     * Steps to skip during execution.
     *
     * When the flow would normally execute one of these steps, it will instead
     * immediately evaluate the step's outgoing paths and continue to the next
     * valid step. This is useful for:
     * - Bypassing steps that have already been completed externally
     * - Testing flows without certain side effects
     * - Conditional step execution based on runtime state
     *
     * Skipped steps are still recorded in the execution path but marked as skipped.
     * The step's output mapping is not applied when skipped.
     */
    skipSteps?: AIAgentStepEntity[];
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

                // Store the prompt step result so path conditions can access it
                // Create a result object with Success: true (prompt executed successfully)
                const promptStepResult = {
                    Success: true,
                    step: 'Success',
                    result: promptResponse,
                    rawResult: promptResult
                };
                flowState.stepResults.set(flowState.currentStepId, promptStepResult);

                // Add to execution path if not already present
                if (!flowState.executionPath.includes(flowState.currentStepId)) {
                    flowState.executionPath.push(flowState.currentStepId);
                }

                // Mark step as completed
                flowState.completedStepIds.add(flowState.currentStepId);
            }

            // Find valid paths from current step
            // Pass params to enable data/context access in path conditions (Phase 1)
            const paths = await this.getValidPaths(flowState.currentStepId, payload, flowState, params);
            
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
     * Gets all paths from a step and evaluates their conditions.
     *
     * The evaluation context includes:
     * - payload: The current agent payload (persistent state)
     * - stepResult: Result from the last executed step
     * - flowContext: Flow execution metadata (current step, completed steps, path)
     * - data: Transient template data from ExecuteAgentParams (NEW in Phase 1)
     * - context: Runtime context from ExecuteAgentParams (NEW in Phase 1)
     *
     * This allows path conditions to access runtime parameters like:
     * - `data.userApproval === true`
     * - `context.environment === 'production'`
     * - `data.retryCount < 3 && payload.status === 'pending'`
     *
     * @private
     */
    private async getValidPaths<P>(
        stepId: string,
        payload: unknown,
        flowState: FlowExecutionState,
        params: ExecuteAgentParams<unknown, P>
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
                // Create enhanced evaluation context
                // Phase 1: Read-only access to data and context for path conditions
                const context = {
                    // Existing context properties
                    payload,
                    stepResult: this.getLastStepResult(flowState),
                    flowContext: {
                        currentStepId: flowState.currentStepId,
                        completedSteps: Array.from(flowState.completedStepIds),
                        executionPath: flowState.executionPath,
                        stepCount: flowState.completedStepIds.size
                    },
                    // NEW: Map params.data and params.context directly
                    // These enable deterministic routing based on runtime state
                    // without polluting the persistent payload
                    data: params.data || {},
                    context: params.context || {}
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
     * Helper to set a value on a target object, supporting array append syntax.
     * If key ends with '[]', the value is pushed to an array (auto-initialized if needed).
     *
     * @private
     */
    private setMappedValue(
        target: Record<string, unknown>,
        key: string,
        value: unknown
    ): void {
        const isArrayAppend = key.endsWith('[]');
        const actualKey = isArrayAppend ? key.slice(0, -2) : key;

        if (isArrayAppend) {
            // Initialize array if it doesn't exist
            if (!(actualKey in target)) {
                target[actualKey] = [];
            }

            // Validate it's actually an array
            if (!Array.isArray(target[actualKey])) {
                throw new Error(
                    `Cannot append to '${actualKey}': target is not an array. ` +
                    `Use '${actualKey}' without [] suffix for property update.`
                );
            }

            // Append the value
            (target[actualKey] as unknown[]).push(value);
        } else {
            // Standard property assignment
            target[actualKey] = value;
        }
    }

    /**
     * Applies action output mapping to update the payload and extract special fields.
     *
     * Special fields ($message, $reasoning, $confidence) are prefixed with $ and are not
     * added to the payload. Instead, they are stored separately in FlowExecutionState
     * for use in the final response.
     *
     * @private
     * @returns Object with payloadChange and specialFields
     */
    private applyActionOutputMapping<P>(
        actionResult: Record<string, unknown>,
        _payload: P,
        mappingConfig: string
    ): { payloadChange: AgentPayloadChangeRequest<P> | null; specialFields?: { message?: string; reasoning?: string; confidence?: number } } {
        try {
            const mapping: ActionOutputMapping = JSON.parse(mappingConfig);
            const updateObj: Record<string, unknown> = {};
            const specialFields: { message?: string; reasoning?: string; confidence?: number } = {};

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
                    // Check if this is a special field mapping (starts with $)
                    if (payloadPath.startsWith('$')) {
                        const fieldName = payloadPath.substring(1).toLowerCase();
                        // Store in special fields instead of payload
                        if (fieldName === 'message' && typeof value === 'string') {
                            specialFields.message = value;
                        } else if (fieldName === 'reasoning' && typeof value === 'string') {
                            specialFields.reasoning = value;
                        } else if (fieldName === 'confidence' && typeof value === 'number') {
                            specialFields.confidence = value;
                        }
                        // Ignore unknown special fields with warning
                        else {
                            LogError(`Unknown special field in ActionOutputMapping: ${payloadPath}. Valid special fields are: $message, $reasoning, $confidence`);
                        }
                    } else {
                        // Regular payload mapping
                        // Parse the path and build nested object
                        const pathParts = payloadPath.split('.');
                        let current = updateObj;

                        for (let i = 0; i < pathParts.length - 1; i++) {
                            const part = pathParts[i];
                            // Remove [] suffix for intermediate path parts
                            const cleanPart = part.endsWith('[]') ? part.slice(0, -2) : part;
                            if (!(cleanPart in current)) {
                                current[cleanPart] = {};
                            }
                            current = current[cleanPart] as Record<string, unknown>;
                        }

                        // Use helper to support array append on final path part
                        this.setMappedValue(current, pathParts[pathParts.length - 1], value);
                    }
                }
            }

            const payloadChange = Object.keys(updateObj).length > 0
                ? { updateElements: updateObj as Partial<P> }
                : null;

            return {
                payloadChange,
                specialFields: Object.keys(specialFields).length > 0 ? specialFields : undefined
            };
        } catch (error) {
            LogError(`Failed to parse ActionOutputMapping: ${error.message}`);
            return { payloadChange: null };
        }
    }
    
    /**
     * Creates a BaseAgentNextStep for a flow node.
     *
     * If the node is in agentTypeParams.skipSteps, the step is marked as skipped
     * and we immediately evaluate paths to find the next step.
     *
     * @private
     */
    private async createStepForFlowNode<P>(
        params: ExecuteAgentParams<P>,
        node: AIAgentStepEntity,
        payload: P,
        flowState: FlowExecutionState
    ): Promise<BaseAgentNextStep<P>> {
        // Check if this step should be skipped
        const flowParams = params.agentTypeParams as FlowAgentExecuteParams | undefined;
        if (flowParams?.skipSteps && flowParams.skipSteps.some(s => s.ID === node.ID)) {
            LogStatus(`Flow Agent: Skipping step '${node.Name}' (via agentTypeParams.skipSteps)`);

            // Update flow state to mark this as current step (for path evaluation)
            flowState.currentStepId = node.ID;

            // Mark the step as completed (skipped)
            flowState.completedStepIds.add(node.ID);
            flowState.executionPath.push(node.ID);

            // Store a skip marker as the step result
            flowState.stepResults.set(node.ID, { skipped: true, stepName: node.Name });

            // Find the next step by evaluating paths from this skipped step
            const paths = await this.getValidPaths(node.ID, payload, flowState, params);

            if (paths.length === 0) {
                // No more paths - flow is complete
                return this.createSuccessStep({
                    message: `Flow completed after skipping step '${node.Name}' - no more paths to follow`,
                    newPayload: payload,
                    previousPayload: payload
                });
            }

            // Get the destination step for the highest priority path
            const nextStep = await this.getStepById(paths[0].DestinationStepID);

            if (!nextStep) {
                return this.createNextStep('Failed', {
                    errorMessage: `Destination step not found after skipping '${node.Name}': ${paths[0].DestinationStepID}`,
                    newPayload: payload,
                    previousPayload: payload
                });
            }

            // Recursively create the step for the next node (which may also be skipped)
            return await this.createStepForFlowNode(params, nextStep, payload, flowState);
        }

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
                // Propagate context to sub-agent so it has access to runtime configuration,
                // API keys, environment settings, etc. from the parent agent
                return this.createNextStep('Sub-Agent', {
                    subAgent: {
                        name: subAgentName,
                        message: node.Description || '',
                        terminateAfter: false,
                        context: params.context // Propagate runtime context to sub-agent
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

        const result = this.applyActionOutputMapping(actionResult, currentPayload || {} as P, outputMapping);
        // Note: Special fields are ignored in this legacy method
        // Use PostProcessActionStep for full special field support
        return result.payloadChange;
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
        currentStep: BaseAgentNextStep<P>,
        params?: ExecuteAgentParams<P>
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
                const resolvedValue = this.resolveNestedValue(mappingValue, currentPayload, params);
                
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
     * Recursively resolves payload, static, data, context, and conversation references in nested objects.
     *
     * Supported prefixes:
     * - `payload.path.to.value` - reads from persistent payload
     * - `static:value` - literal static value
     * - `data.path.to.value` - reads from params.data (template data)
     * - `context.path.to.value` - reads from params.context (runtime context, e.g., API keys, environment)
     * - `conversation[N].content` - reads from conversation messages
     *
     * @private
     */
    private resolveNestedValue(value: unknown, currentPayload: unknown, params?: ExecuteAgentParams): unknown {
        if (typeof value === 'string') {
            // Handle string values with payload/static/data/context/conversation resolution (case-insensitive)
            const trimmedValue = value.trim();

            // Check for conversation message references
            if (ConversationMessageResolver.isConversationReference(trimmedValue) && params?.conversationMessages) {
                return ConversationMessageResolver.resolve(trimmedValue, params.conversationMessages);
            } else if (trimmedValue.toLowerCase().startsWith('static:')) {
                return value.substring(value.indexOf(':') + 1);
            } else if (trimmedValue.toLowerCase().startsWith('payload.')) {
                const pathStart = value.indexOf('.') + 1;
                const path = value.substring(pathStart);
                return this.getValueFromPath(currentPayload, path);
            } else if (trimmedValue.toLowerCase().startsWith('data.') && params?.data) {
                const pathStart = value.indexOf('.') + 1;
                const path = value.substring(pathStart);
                return this.getValueFromPath(params.data, path);
            } else if (trimmedValue.toLowerCase().startsWith('context.') && params?.context) {
                // NEW: Support context. prefix for accessing runtime context
                // This allows action input mappings to reference API keys, environment settings, etc.
                const pathStart = value.indexOf('.') + 1;
                const path = value.substring(pathStart);
                return this.getValueFromPath(params.context, path);
            } else {
                return value;
            }
        } else if (Array.isArray(value)) {
            // Handle arrays - recursively resolve each element
            return value.map(item => this.resolveNestedValue(item, currentPayload, params));
        } else if (value && typeof value === 'object') {
            // Handle objects - recursively resolve each property
            const resolvedObj: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
                resolvedObj[key] = this.resolveNestedValue(val, currentPayload, params);
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
        const result = this.applyActionOutputMapping(outputParams, currentPayload, outputMapping);
        const payloadChange = result.payloadChange;

        // Store special fields in flow state for later use
        const flowState = agentTypeState as FlowExecutionState;
        if (result.specialFields) {
            if (!flowState.specialFields) {
                flowState.specialFields = {};
            }
            // Merge special fields (later values override earlier ones)
            Object.assign(flowState.specialFields, result.specialFields);
        }

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
     * If agentTypeParams.startAtStep is provided, the flow will begin at that step
     * instead of the configured entry point.
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

        // Check for startAtStep in agentTypeParams (FlowAgentExecuteParams)
        const flowParams = params.agentTypeParams as FlowAgentExecuteParams | undefined;
        if (flowParams?.startAtStep) {
            // Validate the step belongs to this agent
            const agentSteps = AIEngine.Instance.GetAgentSteps(flowState.agentId);
            const validStep = agentSteps.find(s => s.ID === flowParams.startAtStep!.ID);

            if (!validStep) {
                return this.createNextStep('Failed', {
                    errorMessage: `startAtStep '${flowParams.startAtStep.Name}' (ID: ${flowParams.startAtStep.ID}) does not belong to agent '${params.agent.Name}'`
                });
            }

            LogStatus(`Flow Agent: Starting at step '${validStep.Name}' (override via agentTypeParams.startAtStep)`);
            return await this.createStepForFlowNode(params, validStep, payloadToUse, flowState);
        }

        // Default behavior: start at the configured entry point
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
        // we only want to do special processing for retry, success, or failed steps
        // Failed steps need to be evaluated for conditional failure paths
        if (step.step !== 'Retry' && step.step !== 'Success' && step.step !== 'Failed') {
            // Not a retry, success, or failed step - use default processing
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

        // Store the step result so path conditions can access it via stepResult
        // The step parameter contains the result from the just-completed step (Sub-Agent, Action, or Prompt)
        flowState.stepResults.set(flowState.currentStepId, step);

        // Add to execution path if not already present
        if (!flowState.executionPath.includes(flowState.currentStepId)) {
            flowState.executionPath.push(flowState.currentStepId);
        }

        // Mark step as completed
        flowState.completedStepIds.add(flowState.currentStepId);

        // Find valid paths from current step using updated payload
        // Pass params to enable data/context access in path conditions (Phase 1)
        const paths = await this.getValidPaths(flowState.currentStepId, currentPayload, flowState, params);

        if (paths.length === 0) {
            // No valid paths found
            // If the previous step failed, propagate the failure with its error message
            if (step.step === 'Failed') {
                LogStatusEx({
                    message: `⚠️ Flow Agent: Step failed with no recovery path. Error: ${step.errorMessage || 'No error message'}`,
                    verboseOnly: false
                });
                return this.createNextStep('Failed', {
                    errorMessage: step.errorMessage || 'Flow step failed with no recovery path',
                    newPayload: currentPayload,
                    previousPayload: currentPayload,
                    terminate: true
                });
            }

            // Otherwise, flow completed successfully
            LogStatusEx({
                message: '✅ Flow Agent: Flow completed successfully - no more paths to follow',
                verboseOnly: true
            });

            // Include special fields from action output mappings if available
            const successStep = this.createSuccessStep({
                message: flowState.specialFields?.message || 'Flow completed - no more paths to follow',
                reasoning: flowState.specialFields?.reasoning,
                confidence: flowState.specialFields?.confidence,
                newPayload: currentPayload,
                previousPayload: currentPayload
            });

            return successStep;
        }
        
        // Get the destination step for the highest priority path
        const nextStep = await this.getStepById(paths[0].DestinationStepID);

        if (!nextStep) {
            return this.createNextStep('Failed', {
                errorMessage: `Destination step not found: ${paths[0].DestinationStepID}`
            });
        }

        // Log when we're navigating to a recovery path after a failure
        if (step.step === 'Failed') {
            LogStatusEx({
                message: `🔄 Flow Agent: Failure detected, navigating to recovery path: '${nextStep.Name}'`,
                verboseOnly: false
            });
        }

        // Check if the step is active
        if (nextStep.Status !== 'Active') {
            // Try alternate paths
            for (let i = 1; i < paths.length; i++) {
                const alternateStep = await this.getStepById(paths[i].DestinationStepID);
                if (alternateStep && alternateStep.Status === 'Active') {
                    if (step.step === 'Failed') {
                        LogStatusEx({
                            message: `🔄 Flow Agent: Using alternate recovery path: '${alternateStep.Name}'`,
                            verboseOnly: false
                        });
                    }
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
                templateParameters: {},
                context: params.context // Propagate runtime context to sub-agent in loop
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
                templateParameters: {},
                context: params.context // Propagate runtime context to sub-agent in loop
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
     * Flow agents don't require agent-level prompts - they use step-level prompts exclusively
     * @override
     */
    public get RequiresAgentLevelPrompts(): boolean {
        return false;
    }

    /**
     * Provides Flow-specific guidance for prompt configuration
     * @override
     */
    public GetPromptConfigurationGuidance(): string {
        return `   - Flow agents use step-level prompts (StepType="Prompt" with PromptID)\n` +
               `   - Prompts should be configured in agent steps, not AI Agent Prompts relationship\n` +
               `   - Verify that prompts exist in AI Prompts table and are active`;
    }

    /**
     * Flow agents should NEVER fall back to prompt execution for Success/Failed steps.
     * Flow agents are deterministic and driven by their graph structure (steps and paths).
     * When a step completes (Success or Failed), the agent should terminate rather than
     * retry with prompts.
     *
     * @override
     * @since 2.113.0
     */
    public async HandleStepFallback<P = any, ATS = any>(
        step: BaseAgentNextStep<P>,
        config: AgentConfiguration,
        params: ExecuteAgentParams<P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P> | null> {
        // Flow agents NEVER fall back to prompt execution
        // They are driven entirely by their graph structure (steps and paths)
        // Success/Failed steps should terminate, not retry prompts

        if (step.step === 'Success' || step.step === 'Failed') {
            // Use spread to preserve all properties and just override terminate
            return {
                ...step,
                terminate: true
            };
        }

        // For other step types, use default behavior (should not reach here)
        return null;
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
        const result = this.applyActionOutputMapping(
            outputParams,
            iterationResult.currentPayload,
            resolvedOutputMapping
        );

        // Note: Special fields are not supported in loop iterations
        // They only apply to final flow steps

        if (result.payloadChange?.updateElements) {
            // Deep merge to preserve existing payload structure
            return this._payloadManager.deepMerge(
                iterationResult.currentPayload,
                result.payloadChange.updateElements
            );
        }

        return null;
    }
 
}

