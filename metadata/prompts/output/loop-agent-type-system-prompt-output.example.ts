/**
 * Response structure expected from the Loop Agent Type system prompt.
 * This interface matches the JSON schema defined in the loop agent type template.
 * 
 * T is the generic type for the payload, allowing flexibility in the data returned
 * by the agent. This can be any structured data type that the agent needs to return
 * to the user or calling system, defaults to any.
 * 
 * @interface LoopAgentResponse
 */
interface LoopAgentResponse<T = any> {
    /**
     * Indicates whether the entire task has been completed successfully.
     * When true, the agent loop will terminate and return the final result.
     * When false, processing will continue based on nextStep.
     */
    taskComplete: boolean;
    
    /**
     * A message that provides information to the caller, which is either a human, another computer system, or 
     * a parent agent. This message should be readable, clear and provide insight. The structured
     * details of the result of the agent's execution should not be here, but rather be included in the @see payload.
     *
     * This message is returned regardless of whether taskComplete is true or false, allowing
     * the agent to communicate with its caller.
     * 
     * In the event of taskComplete being false and the nextStep.type is 'chat', this message
     * will be sent to the user as a chat message.
     * @type {string}
     */
    message: string;

    /**
     * Agent specific payload that contains the result of the task.
     * This can include accumulated results, processed data, or any other
     * information that the agent has gathered during its execution.
     * This payload is returned when taskComplete is true, allowing the agent
     * to return a structured result to the user or calling system.
     * @type {T}
     */
    payload: T;
    
    /**
     * The agent's internal reasoning about the current state and decision made.
     * This should be a clear, concise explanation of why the agent chose
     * the specific next step or to complete, helping with debugging and transparency.
     */
    reasoning: string;
    
    /**
     * The agent's confidence level in its decision (0.0 to 1.0).
     * Higher values indicate greater certainty about the chosen action.
     * Can be used for logging, debugging, or conditional logic.
     * @optional
     */
    confidence?: number;

    /**
     * Defines what the agent should do next. Only required when taskComplete is false.
     * The agent must specify exactly one type of next step (action, sub-agent, or chat).
     * @optional
     */
    nextStep?: {
        /**
         * The type of operation to perform next:
         * - 'action': Execute one or more actions in parallel
         * - 'sub-agent': Delegate to a single sub-agent
         * - 'chat': Send a message back to the user
         */
        type: 'action' | 'sub-agent' | 'chat';
        
        /**
         * Array of actions to execute. Required when type is 'action'.
         * All actions in the array will be executed in parallel.
         * @optional
         */
        actions?: Array<{
            /**
             * The unique identifier (UUID) of the action to execute.
             * Must match an action ID from the available actions list.
             */
            id: string;
            
            /**
             * The human-readable name of the action.
             * Should match the name from the available actions list.
             */
            name: string;
            
            /**
             * Parameters to pass to the action.
             * Keys must match the parameter names defined in the action's schema.
             * Values should match the expected types for each parameter.
             */
            params: Record<string, unknown>;
        }>;
        
        /**
         * Sub-agent to invoke. Required when type is 'sub-agent'.
         * Only one sub-agent can be invoked at a time.
         * @optional
         */
        subAgent?: {
            /**
             * The unique identifier (UUID) of the sub-agent to execute.
             * Must match a sub-agent ID from the available sub-agents list.
             */
            id: string;
            
            /**
             * The human-readable name of the sub-agent.
             * Should match the name from the available sub-agents list.
             */
            name: string;
            
            /**
             * The message to send to the sub-agent to help it understand and complete the task.
             * It is very important that this contains all necessary context for the sub-agent to comprehend
             * and complete it's task correctly, because the current level conversation history is NOT provided 
             * to the sub-agent. 
             * 
             * Remember, some sub-agents will also define template parameters that you fill in to provide
             * structured context. If you think that additional structured context is helpful/needed for the
             * sub-agent beyond its template parameters, then you should include that here in the message and
             * include the structured info in a separate markdown block to make it easy for the sub-agent to parse.
             * ```json
             *    { "key": "value", "anotherKey": 123 }
             * ```
             */
            message: string;

            /**
             * If the sub-agent's system prompt includes any template parameters,
             * this object should provide values for those parameters.
             * Keys **MUST** match the parameter names defined by the sub-aget.
             * Values should match the expected types for each parameter.
             * @optional
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