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
import { AIPromptRunResult, BaseAgentNextStep, AIPromptParams, AgentPayloadChangeRequest } from '@memberjunction/ai-core-plus';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';

/**
 * Flow execution context that tracks the current state of the workflow
 */
interface FlowExecutionContext {
    agentId: string;
    currentStepId?: string;
    completedStepIds: Set<string>;
    stepResults: Map<string, unknown>;
    executionPath: string[];
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
    private _metadata = new Metadata();
    
    /**
     * Determines the next step based on the flow graph structure.
     * 
     * For Flow agents, the next step is determined by:
     * 1. Finding the current position in the graph
     * 2. Evaluating conditions on outgoing paths
     * 3. Following the highest priority valid path
     * 4. Using prompt results only when current step type is 'Prompt'
     * 
     * @param {AIPromptRunResult} promptResult - Result from prompt execution (used for Prompt steps)
     * @param {P} currentPayload - The current payload state
     * 
     * @returns {Promise<BaseAgentNextStep<P>>} The next step to execute
     */
    public async DetermineNextStep<P>(
        promptResult: AIPromptRunResult, 
        currentPayload: P
    ): Promise<BaseAgentNextStep<P>> {
        try {
            const flowContext = this.getFlowContext(currentPayload);
            
            // If no current step, find starting steps
            if (!flowContext.currentStepId) {
                const startingSteps = await this.getStartingSteps(flowContext.agentId);
                
                if (startingSteps.length === 0) {
                    return this.createNextStep('Failed', {
                        errorMessage: 'No starting steps defined for flow agent'
                    });
                }
                
                // For now, execute the first starting step
                // Future enhancement: support parallel starting steps
                return await this.createStepForFlowNode(startingSteps[0], currentPayload);
            }
            
            // Get current step to check if it was a Prompt step
            const currentStep = await this.getStepById(flowContext.currentStepId);
            
            // If current step was a Prompt, use the prompt result to determine next step
            if (currentStep?.StepType === 'Prompt' && promptResult) {
                const promptResponse = this.parseJSONResponse<FlowAgentPromptResponse>(promptResult);
                
                if (promptResponse?.terminate) {
                    return this.createSuccessStep({
                        message: promptResponse.message || 'Flow terminated by prompt decision',
                        reasoning: promptResponse.reasoning
                    });
                }
                
                // If prompt specified a next step, try to find it
                if (promptResponse?.nextStepName) {
                    const nextStep = await this.getStepByName(
                        flowContext.agentId, 
                        promptResponse.nextStepName
                    );
                    
                    if (nextStep) {
                        return await this.createStepForFlowNode(nextStep, currentPayload);
                    }
                }
            }
            
            // Find valid paths from current step
            const paths = await this.getValidPaths(flowContext.currentStepId, currentPayload);
            
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
            
            return await this.createStepForFlowNode(nextStep, currentPayload);
            
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
     */
    public async InjectPayload<P = any>(payload: P, prompt: AIPromptParams): Promise<void> {
        if (!prompt) {
            throw new Error('Prompt parameters are required for payload injection');
        }
        
        if (!prompt.data) {
            prompt.data = {};
        }
        
        // Inject standard payload
        prompt.data[BaseAgentType.CURRENT_PAYLOAD_PLACEHOLDER] = payload || {};
        
        // Add flow-specific context
        const flowContext = this.getFlowContext(payload);
        prompt.data.flowContext = {
            currentStepId: flowContext.currentStepId,
            completedSteps: Array.from(flowContext.completedStepIds),
            executionPath: flowContext.executionPath,
            stepCount: flowContext.completedStepIds.size
        };
    }
    
    /**
     * Extracts flow execution context from the payload
     * 
     * @private
     */
    private getFlowContext(payload: unknown): FlowExecutionContext {
        // Flow context should be stored in a special property of the payload
        const payloadObj = payload as Record<string, unknown>;
        const context = payloadObj?.__flowContext as Record<string, unknown> || {};
        
        return {
            agentId: (context.agentId as string) || '',
            currentStepId: context.currentStepId as string | undefined,
            completedStepIds: new Set((context.completedStepIds as string[]) || []),
            stepResults: new Map(Object.entries((context.stepResults as Record<string, unknown>) || {})),
            executionPath: (context.executionPath as string[]) || []
        };
    }
    
    /**
     * Gets all starting steps for an agent
     * 
     * @private
     */
    private async getStartingSteps(agentId: string): Promise<AIAgentStepEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentStepEntity>({
            EntityName: 'MJ: AI Agent Steps',
            ExtraFilter: `AgentID='${agentId}' AND StartingStep=1`,
            OrderBy: 'Name',
            ResultType: 'entity_object'
        });
        
        if (!result.Success) {
            LogError(`Failed to load starting steps: ${result.ErrorMessage}`);
            return [];
        }
        
        return result.Results || [];
    }
    
    /**
     * Gets a step by ID
     * 
     * @private
     */
    private async getStepById(stepId: string): Promise<AIAgentStepEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentStepEntity>({
            EntityName: 'MJ: AI Agent Steps',
            ExtraFilter: `ID='${stepId}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        });
        
        if (!result.Success || !result.Results || result.Results.length === 0) {
            return null;
        }
        
        return result.Results[0];
    }
    
    /**
     * Gets a step by name within an agent
     * 
     * @private
     */
    private async getStepByName(agentId: string, stepName: string): Promise<AIAgentStepEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentStepEntity>({
            EntityName: 'MJ: AI Agent Steps',
            ExtraFilter: `AgentID='${agentId}' AND Name='${stepName.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        });
        
        if (!result.Success || !result.Results || result.Results.length === 0) {
            return null;
        }
        
        return result.Results[0];
    }
    
    /**
     * Gets all paths from a step and evaluates their conditions
     * 
     * @private
     */
    private async getValidPaths(stepId: string, payload: unknown): Promise<AIAgentStepPathEntity[]> {
        // Load all paths from this step
        const rv = new RunView();
        const result = await rv.RunView<AIAgentStepPathEntity>({
            EntityName: 'MJ: AI Agent Step Paths',
            ExtraFilter: `OriginStepID='${stepId}'`,
            OrderBy: 'Priority DESC',
            ResultType: 'entity_object'
        });
        
        if (!result.Success || !result.Results) {
            LogError(`Failed to load paths from step: ${result.ErrorMessage}`);
            return [];
        }
        
        const allPaths = result.Results;
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
                    stepResult: this.getLastStepResult(payload),
                    flowContext: this.getFlowContext(payload)
                };
                
                const evalResult = this._evaluator.evaluate(path.Condition, context);
                
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
    private getLastStepResult(payload: unknown): unknown {
        const context = this.getFlowContext(payload);
        if (context.executionPath.length === 0) return null;
        
        const lastStepId = context.executionPath[context.executionPath.length - 1];
        return context.stepResults.get(lastStepId) || null;
    }
    
    /**
     * Applies action output mapping to update the payload
     * 
     * @private
     */
    private applyActionOutputMapping<P>(
        actionResult: Record<string, unknown>,
        payload: P,
        mappingConfig: string
    ): AgentPayloadChangeRequest<P> | null {
        try {
            const mapping: ActionOutputMapping = JSON.parse(mappingConfig);
            const updateObj: Record<string, unknown> = {};
            
            for (const [outputParam, payloadPath] of Object.entries(mapping)) {
                const value = outputParam === '*' ? actionResult : actionResult[outputParam];
                
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
        node: AIAgentStepEntity,
        payload: P
    ): Promise<BaseAgentNextStep<P>> {
        // Update flow context to mark this as current step
        const flowContext = this.getFlowContext(payload);
        const updatedContext = {
            ...flowContext,
            currentStepId: node.ID
        };
        
        // Request payload update to track flow state
        // Use replaceElements for complete replacement of flow context
        const payloadChangeRequest: AgentPayloadChangeRequest<P> = {
            replaceElements: {
                __flowContext: updatedContext
            } as Partial<P & { __flowContext: FlowExecutionContext }>
        };
        
        switch (node.StepType) {
            case 'Action':
                if (!node.ActionID) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Action step '${node.Name}' has no ActionID`
                    });
                }
                
                // Need to get the action name
                const actionName = await this.getActionName(node.ActionID);
                if (!actionName) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Action not found for step '${node.Name}'`
                    });
                }
                
                // Check if we have output mapping configured
                const baseStep = this.createNextStep('Actions', {
                    actions: [{
                        name: actionName,
                        params: {} // Future: support parameter mapping
                    }],
                    payloadChangeRequest,
                    terminate: false
                });
                
                // Store the mapping config in a special property for later use
                if (node.ActionOutputMapping) {
                    (baseStep as Record<string, unknown>).actionOutputMapping = node.ActionOutputMapping;
                    (baseStep as Record<string, unknown>).stepId = node.ID;
                }
                
                return baseStep;
                
            case 'Sub-Agent':
                if (!node.SubAgentID) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Sub-Agent step '${node.Name}' has no SubAgentID`
                    });
                }
                
                // Need to get the sub-agent name
                const subAgentName = await this.getAgentName(node.SubAgentID);
                if (!subAgentName) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Sub-Agent not found for step '${node.Name}'`
                    });
                }
                
                return this.createNextStep('Sub-Agent', {
                    subAgent: {
                        name: subAgentName,
                        message: node.Description || `Execute sub-agent: ${subAgentName}`,
                        terminateAfter: false
                    },
                    payloadChangeRequest,
                    terminate: false
                });
                
            case 'Prompt':
                // For prompt steps, we use Retry with a special marker
                // The base agent will need to handle this case
                if (!node.PromptID) {
                    return this.createNextStep('Failed', {
                        errorMessage: `Prompt step '${node.Name}' has no PromptID`
                    });
                }
                
                return this.createNextStep('Retry', {
                    message: node.Description || 'Executing prompt step for flow decision',
                    payloadChangeRequest,
                    terminate: false,
                    // Special marker for flow prompt steps
                    flowPromptStepId: node.PromptID
                } as any);
                
            default:
                return this.createNextStep('Failed', {
                    errorMessage: `Unknown step type: ${node.StepType}`
                });
        }
    }
    
    /**
     * Gets action name by ID
     * 
     * @private
     */
    private async getActionName(actionId: string): Promise<string | null> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Actions',
            ExtraFilter: `ID='${actionId}'`,
            MaxRows: 1,
            ResultType: 'simple'
        });
        
        if (!result.Success || !result.Results || result.Results.length === 0) {
            return null;
        }
        
        return result.Results[0].Name;
    }
    
    /**
     * Gets agent name by ID
     * 
     * @private
     */
    private async getAgentName(agentId: string): Promise<string | null> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'AI Agents',
            ExtraFilter: `ID='${agentId}'`,
            MaxRows: 1,
            ResultType: 'simple'
        });
        
        if (!result.Success || !result.Results || result.Results.length === 0) {
            return null;
        }
        
        return result.Results[0].Name;
    }
    
    /**
     * Processes action results and applies output mapping if configured
     * This should be called by BaseAgent after action execution
     * 
     * @public
     */
    public processActionResult<P>(
        actionResult: Record<string, unknown>,
        stepId: string,
        outputMapping?: string,
        currentPayload?: P
    ): AgentPayloadChangeRequest<P> | null {
        if (!outputMapping) {
            return null;
        }
        
        return this.applyActionOutputMapping(actionResult, currentPayload || {} as P, outputMapping);
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadFlowAgentType() {
    // This function ensures the class isn't tree-shaken
}