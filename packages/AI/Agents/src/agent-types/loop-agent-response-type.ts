import { AgentPayloadChangeRequest } from "@memberjunction/ai-core-plus";

/**
 * Response structure expected from the Loop Agent Type.
 * 
 * P is the generic type for the payload, allowing flexibility in the data returned
 * by the agent.
 * 
 * @interface LoopAgentResponse
 */
export interface LoopAgentResponse<P = any> {
    /**
     * Indicates whether the entire task has been completed successfully.
     * When true, the agent loop will terminate
     * Defaults to false. When false, processing continues based on nextStep.
     */
    taskComplete?: boolean;
    
    /**
     * A message that provides information to the caller. 
     * - Should be simple and clear, plain text, < 100 words
     * - When nextStep.type is 'chat', this message will be shown to the user.
     * - Only omit when nextStep.type is 'Sub-Agent' or 'Actions'
     */
    message?: string;

    /**
     * Agent's payload change requests. If no changes are needed, **OMIT** this field entirely.
     */
    payloadChangeRequest?: AgentPayloadChangeRequest<P>;
    
    /**
     * The agent's internal reasoning about the current state and decision made.
     */
    reasoning?: string;
    
    /**
     * The agent's confidence level in its decision (0.0 to 1.0).
     */
    confidence?: number;

    /**
     * Defines what the agent should do next. Only required when taskComplete is false.
     */
    nextStep?: {
        /**
         * The type of operation to perform next:
         * - 'action': Execute 1+ action in parallel
         * - 'sub-agent': Delegate to a single sub-agent
         * - 'chat': Send a message back to the user
         */
        type: 'Actions' | 'Sub-Agent' | 'Chat';
        
        /**
         * Array of actions to execute in parallel. Required when type is 'action'.
         */
        actions?: Array<{
            /**
             * Must match a name from available actions.
             */
            name: string;
            
            /**
             * Parameters to pass to the action.
             * Keys must match the param names defined in the action.
             * Values must match expected types.
             */  
            params: Record<string, unknown>;
        }>;
         
        /**
         * Sub-agent to invoke. Required when type is 'sub-agent'.
         */
        subAgent?: {
            /**
             * Must match a name from available sub-agents.
             */
            name: string;
            
            /**
             * The message to send to the sub-agent to help it understand and complete the task.
             * - Must contain all necessary info for the sub-agent to comprehend the task. 
             * - Your conversation history is NOT provided to the sub-agent. 
             */
            message: string;

            /**
             * If the sub-agent's system prompt includes any template parameters,
             * this object should provide values for those parameters.
             * Keys **MUST** match the parameter names defined by the sub-aget.
             * Values should match the expected types for each parameter.
             */
            templateParameters?: Record<string, any>;
            
            /**
             * Whether to terminate the parent agent after the sub-agent completes.
             * - true: Return sub-agent result directly to user, parent agent stops
             * - false: Return sub-agent result to parent agent for further processing
             */
            terminateAfter: boolean;
        };
    };
}

//\n{@include ../../../CorePlus/src/agent-payload-change-request.ts}