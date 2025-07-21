import { AgentPayloadChangeRequest } from "@memberjunction/ai-core-plus";

/**
 * Response structure for Loop Agent Type
 */
export interface LoopAgentResponse<P = any> {
    /**
     * Task completion status. true = terminate loop, false = continue
     */
    taskComplete?: boolean;
    
    /**
     * Plain text message (<100 words). Required for 'Chat' type, omit for others
     */
    message?: string;

    /**
     * Payload changes. Omit if no changes needed
     */
    payloadChangeRequest?: AgentPayloadChangeRequest<P>;
    
    /**
     * Internal reasoning for debugging
     */
    reasoning?: string;
    
    /**
     * Confidence level (0.0-1.0)
     */
    confidence?: number;

    /**
     * Next action. Required when taskComplete=false
     */
    nextStep?: {
        /**
         * Operation type: 'Actions' | 'Sub-Agent' | 'Chat'
         */
        type: 'Actions' | 'Sub-Agent' | 'Chat';
        
        /**
         * Actions to execute (when type='Actions')
         */
        actions?: Array<{
            name: string;
            params: Record<string, unknown>;
        }>;
         
        /**
         * Sub-agent details (when type='Sub-Agent')
         */
        subAgent?: {
            name: string;

            /**
             * Instructions for the sub-agent, NOT the payload, that is handled elsewhere
             */
            message: string;  

            /**
             * Extra parameters - NOT the payload, only use these if the sub-agent 
             * specifically **defines** parameters in its metadata, otherwise these will be
             * ignored and waste tokens!
             */
            templateParameters?: Record<string, any>;

            /**
             * true=end parent, false=continue
             */
            terminateAfter: boolean; 
        };
    };
}

//\n{@include ../../../CorePlus/src/agent-payload-change-request.ts}