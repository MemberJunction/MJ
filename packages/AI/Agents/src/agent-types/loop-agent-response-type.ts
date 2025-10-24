import { AgentPayloadChangeRequest, BaseAgentSuggestedResponse } from "@memberjunction/ai-core-plus";

/**
 * ForEach operation for Loop agents to request iteration over a collection
 */
export interface ForEachOperation {
    /** Path in payload to array to iterate over */
    collectionPath: string;
    /** Variable name for current item (default: "item") */
    itemVariable?: string;
    /** Variable name for loop index (default: "index") */
    indexVariable?: string;
    /** Maximum iterations (undefined=1000, 0=unlimited, >0=limit) */
    maxIterations?: number;
    /** Continue processing if an iteration fails (default: false) */
    continueOnError?: boolean;

    /** Execute action per iteration */
    action?: {
        name: string;
        params: Record<string, unknown>;
    };

    /** Execute sub-agent per iteration */
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, unknown>;
    };
}

/**
 * While operation for Loop agents to request conditional iteration
 */
export interface WhileOperation {
    /** Boolean expression evaluated before each iteration */
    condition: string;
    /** Variable name for attempt context (default: "attempt") */
    itemVariable?: string;
    /** Maximum iterations (undefined=100, 0=unlimited, >0=limit) */
    maxIterations?: number;
    /** Continue processing if an iteration fails (default: false) */
    continueOnError?: boolean;

    /** Execute action per iteration */
    action?: {
        name: string;
        params: Record<string, unknown>;
    };

    /** Execute sub-agent per iteration */
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, unknown>;
    };
}

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
     * Optional, when nextStep.type is 'Chat' or 'Success', this is a list of suggested responses
     * to show the user for quick selection in a UI.
     */
    suggestedResponses?: Array<BaseAgentSuggestedResponse>;

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
         * Operation type: 'Actions' | 'Sub-Agent' | 'Chat' | 'ForEach' | 'While'
         */
        type: 'Actions' | 'Sub-Agent' | 'Chat' | 'ForEach' | 'While';

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

        /**
         * ForEach operation details (when type='ForEach')
         */
        forEach?: ForEachOperation;

        /**
         * While operation details (when type='While')
         */
        while?: WhileOperation;
    };
}

//\n{@include ../../../CorePlus/src/agent-payload-change-request.ts}