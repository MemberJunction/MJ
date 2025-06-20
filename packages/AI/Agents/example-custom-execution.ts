/**
 * Example of how to create a custom agent with different execution behavior
 * by overriding the executeAgentInternal method.
 */

import { BaseAgent } from './src/base-agent';
import { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/aiengine';

/**
 * Example: Parallel execution agent that can execute multiple actions simultaneously
 */
export class ParallelExecutionAgent extends BaseAgent {
    /**
     * Override the internal execution logic to implement parallel execution
     */
    protected async executeAgentInternal(
        params: ExecuteAgentParams, 
        config: AgentConfiguration
    ): Promise<{finalReturnValue: any, stepCount: number}> {
        // Example: Execute initial prompt
        const firstStepResult = await this.executeNextStep(params, config, null);
        let stepCount = 1;
        
        // If the first step returns multiple actions, execute them in parallel
        if (!firstStepResult.terminate && firstStepResult.nextStep?.step === 'actions') {
            const actions = firstStepResult.nextStep.actions!;
            
            // Split actions into batches and execute in parallel
            const batchSize = 3;
            const results = [];
            
            for (let i = 0; i < actions.length; i += batchSize) {
                const batch = actions.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map(action => this.executeNextStep(params, config, {
                        step: 'actions',
                        actions: [action]
                    } as BaseAgentNextStep))
                );
                results.push(...batchResults);
                stepCount += batch.length;
            }
            
            // Process results and determine final outcome
            const allSuccessful = results.every(r => !r.terminate || r.returnValue?.success);
            return {
                finalReturnValue: {
                    step: allSuccessful ? 'success' : 'failed',
                    returnValue: { results, allSuccessful }
                },
                stepCount
            };
        }
        
        // Fall back to default sequential execution
        return super.executeAgentInternal(params, config);
    }
}

/**
 * Example: Event-driven agent that responds to external events
 */
export class EventDrivenAgent extends BaseAgent {
    private eventQueue: BaseAgentNextStep[] = [];
    
    /**
     * Add an event to the queue
     */
    public queueEvent(event: BaseAgentNextStep) {
        this.eventQueue.push(event);
    }
    
    /**
     * Override to process events from queue instead of sequential loop
     */
    protected async executeAgentInternal(
        params: ExecuteAgentParams, 
        config: AgentConfiguration
    ): Promise<{finalReturnValue: any, stepCount: number}> {
        let stepCount = 0;
        let finalReturnValue: any;
        
        // Process initial prompt
        const initialResult = await this.executeNextStep(params, config, null);
        stepCount++;
        
        if (initialResult.terminate) {
            return { finalReturnValue: initialResult.returnValue, stepCount };
        }
        
        // Add initial result to queue
        if (initialResult.nextStep) {
            this.eventQueue.push(initialResult.nextStep);
        }
        
        // Process events from queue
        while (this.eventQueue.length > 0 && !params.cancellationToken?.aborted) {
            const event = this.eventQueue.shift()!;
            const result = await this.executeNextStep(params, config, event);
            stepCount++;
            
            if (result.terminate) {
                finalReturnValue = result.returnValue;
                break;
            } else if (result.nextStep) {
                // Add new events to queue based on priority or other logic
                this.eventQueue.push(result.nextStep);
            }
        }
        
        return { 
            finalReturnValue: finalReturnValue || { step: 'success' }, 
            stepCount 
        };
    }
}

/**
 * Example: State machine agent with predefined state transitions
 */
export class StateMachineAgent extends BaseAgent {
    private states = {
        'initial': ['analyze'],
        'analyze': ['plan', 'fail'],
        'plan': ['execute', 'refine'],
        'refine': ['plan'],
        'execute': ['verify', 'fail'],
        'verify': ['success', 'retry'],
        'retry': ['execute'],
        'success': [],
        'fail': []
    };
    
    protected async executeAgentInternal(
        params: ExecuteAgentParams, 
        config: AgentConfiguration
    ): Promise<{finalReturnValue: any, stepCount: number}> {
        let currentState = 'initial';
        let stepCount = 0;
        let finalReturnValue: any;
        
        while (!['success', 'fail'].includes(currentState) && !params.cancellationToken?.aborted) {
            // Execute step based on current state
            const stateStep = this.mapStateToStep(currentState);
            const result = await this.executeNextStep(params, config, stateStep);
            stepCount++;
            
            // Determine next state based on result
            const possibleNextStates = this.states[currentState];
            currentState = this.determineNextState(result, possibleNextStates);
            
            if (result.terminate) {
                finalReturnValue = result.returnValue;
                break;
            }
        }
        
        return { 
            finalReturnValue: finalReturnValue || { step: currentState as any }, 
            stepCount 
        };
    }
    
    private mapStateToStep(state: string): BaseAgentNextStep | null {
        // Map states to agent steps
        switch (state) {
            case 'initial':
                return null; // Execute initial prompt
            case 'analyze':
                return { 
                    step: 'retry', 
                    retryReason: 'Analyzing request',
                    retryInstructions: 'Analyze the user request and determine the best approach'
                };
            // ... map other states
            default:
                return null;
        }
    }
    
    private determineNextState(result: any, possibleStates: string[]): string {
        // Logic to determine next state based on execution result
        // This is simplified - real implementation would analyze the result
        return possibleStates[0] || 'fail';
    }
}