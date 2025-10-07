/**
 * Skip Proxy Agent
 *
 * A proxy agent that integrates Skip SaaS API into the MemberJunction agent framework.
 * This agent acts as a bridge, allowing Skip to be invoked like any other MJ agent
 * while maintaining compatibility with the existing Skip infrastructure.
 */

import { BaseAgent } from "@memberjunction/ai-agents";
import {
    ExecuteAgentParams,
    AgentConfiguration,
    BaseAgentNextStep
} from "@memberjunction/ai-core-plus";
import {
    SkipAPIResponse,
    SkipAPIAnalysisCompleteResponse,
    SkipAPIClarifyingQuestionResponse,
    SkipMessage
} from "@memberjunction/skip-types";
import { SkipSDK, SkipCallOptions } from "./skip-sdk.js";
import { DataContext } from "@memberjunction/data-context";
import { LogStatus, LogError } from "@memberjunction/core";
import { ChatMessage } from "@memberjunction/ai";

/**
 * Context type for Skip agent execution
 */
export interface SkipAgentContext {
    /**
     * Optional data context ID to load
     */
    dataContextId?: string;

    /**
     * Optional pre-loaded data context
     */
    dataContext?: DataContext;

    /**
     * Conversation ID for tracking Skip conversations
     */
    conversationId?: string;

    /**
     * Force entity metadata refresh
     */
    forceEntityRefresh?: boolean;

    /**
     * Database connection (injected by caller)
     */
    dataSource?: any;
}

/**
 * Payload returned from Skip agent execution
 * Contains the full Skip API response for downstream consumers
 */
export interface SkipAgentPayload {
    /**
     * The full Skip API response
     */
    skipResponse: SkipAPIResponse;

    /**
     * Response phase from Skip
     */
    responsePhase: string;

    /**
     * Conversation ID
     */
    conversationId: string;

    /**
     * User-facing message (title or clarifying question)
     */
    message?: string;
}

/**
 * Skip Proxy Agent
 *
 * This agent provides a simple proxy to the Skip SaaS API, allowing Skip to be
 * invoked through the standard MJ agent framework. It handles:
 * - Converting MJ conversation messages to Skip format
 * - Streaming progress updates from Skip
 * - Mapping Skip responses to MJ agent next steps
 * - Returning full Skip responses in the payload
 */
export class SkipProxyAgent extends BaseAgent {
    private skipSDK: SkipSDK;

    constructor() {
        super();
        this.skipSDK = new SkipSDK();
    }

    /**
     * Execute the Skip agent - proxies to Skip SaaS API
     */
    protected override async executeAgentInternal<P = SkipAgentPayload>(
        params: ExecuteAgentParams<SkipAgentContext, P>,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number; }> {

        LogStatus(`[SkipProxyAgent] Starting Skip agent execution`);

        // Extract context
        const context = params.context || {} as SkipAgentContext;
        const conversationId = context.conversationId || this.generateConversationId();

        // Validate required parameters
        if (!context.dataSource) {
            LogError('[SkipProxyAgent] dataSource is required in context');
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    message: 'Missing required dataSource in context',
                    errorMessage: 'Missing required dataSource in context'
                } as BaseAgentNextStep<P>,
                stepCount: 1
            };
        }

        if (!params.contextUser) {
            LogError('[SkipProxyAgent] contextUser is required');
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    message: 'Missing required contextUser',
                    errorMessage: 'Missing required contextUser'
                } as BaseAgentNextStep<P>,
                stepCount: 1
            };
        }

        // Convert MJ conversation messages to Skip format
        const skipMessages = this.convertMessagesToSkipFormat(params.conversationMessages || []);

        // Prepare Skip SDK call options
        const skipOptions: SkipCallOptions = {
            messages: skipMessages,
            conversationId,
            dataContext: context.dataContext,
            requestPhase: 'initial_request', // Could be parameterized if needed
            contextUser: params.contextUser,
            dataSource: context.dataSource,
            includeEntities: true,
            includeQueries: true,
            includeNotes: true,
            includeRequests: false,
            forceEntityRefresh: context.forceEntityRefresh || false,
            includeCallbackAuth: true,
            onStatusUpdate: (message: string, responsePhase?: string) => {
                // Forward Skip status updates to MJ progress callback
                if (params.onProgress) {
                    params.onProgress({
                        step: 'prompt_execution', // Skip execution is essentially a prompt to an external service
                        message,
                        percentage: 0, // Skip doesn't provide percentage
                        metadata: {
                            conversationId,
                            responsePhase
                        }
                    });
                }
            }
        };

        // Call Skip API
        const result = await this.skipSDK.chat(skipOptions);

        // Handle Skip API errors
        if (!result.success || !result.response) {
            LogError(`[SkipProxyAgent] Skip API call failed: ${result.error}`);
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    message: 'Skip API call failed',
                    errorMessage: result.error
                } as BaseAgentNextStep<P>,
                stepCount: 1
            };
        }

        // Map Skip response to MJ agent next step
        const nextStep = this.mapSkipResponseToNextStep(result.response, conversationId);

        LogStatus(`[SkipProxyAgent] Skip execution completed with phase: ${result.responsePhase}`);

        return {
            finalStep: nextStep as BaseAgentNextStep<P>,
            stepCount: 1 // Skip is a single-step proxy
        };
    }

    /**
     * Convert MJ ChatMessage format to Skip SkipMessage format
     */
    private convertMessagesToSkipFormat(messages: ChatMessage[]): SkipMessage[] {
        return messages.map((msg, index) => ({
            // Skip only accepts 'user' or 'system' roles, map 'assistant' to 'system'
            role: (msg.role === 'assistant' ? 'system' : msg.role) as 'user' | 'system',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            conversationDetailID: `temp-${index}` // Temporary ID for messages without real IDs
        }));
    }

    /**
     * Map Skip API response to MJ agent next step
     */
    private mapSkipResponseToNextStep(
        apiResponse: SkipAPIResponse,
        conversationId: string
    ): BaseAgentNextStep<SkipAgentPayload> {

        // Build the payload with full Skip response
        const payload: SkipAgentPayload = {
            skipResponse: apiResponse,
            responsePhase: apiResponse.responsePhase,
            conversationId
        };

        switch (apiResponse.responsePhase) {
            case 'analysis_complete': {
                // Skip has completed analysis and returned results
                const completeResponse = apiResponse as SkipAPIAnalysisCompleteResponse;
                payload.message = completeResponse.title || 'Analysis complete';

                return {
                    terminate: true,
                    step: 'Success',
                    message: payload.message,
                    newPayload: payload
                };
            }

            case 'clarifying_question': {
                // Skip needs more information from the user
                const clarifyResponse = apiResponse as SkipAPIClarifyingQuestionResponse;
                payload.message = clarifyResponse.clarifyingQuestion;

                return {
                    terminate: true,
                    step: 'Chat',
                    message: clarifyResponse.clarifyingQuestion,
                    newPayload: payload
                };
            }

            default: {
                // Unknown or unexpected response phase
                LogError(`[SkipProxyAgent] Unknown Skip response phase: ${apiResponse.responsePhase}`);
                return {
                    terminate: true,
                    step: 'Failed',
                    message: `Unknown Skip response phase: ${apiResponse.responsePhase}`,
                    errorMessage: `Unknown Skip response phase: ${apiResponse.responsePhase}`,
                    newPayload: payload
                };
            }
        }
    }

    /**
     * Generate a new conversation ID
     */
    private generateConversationId(): string {
        // Use crypto.randomUUID() if available, otherwise fallback
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback UUID generation
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}