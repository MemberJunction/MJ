/**
 * @fileoverview Server-side singleton that manages pending client tool requests.
 *
 * BaseAgent publishes a request via PubSub and awaits the returned Promise.
 * The GraphQL resolver receives the client's response and resolves that Promise.
 *
 * @module @memberjunction/ai-agents
 */

import { BaseSingleton } from '@memberjunction/global';
import { LogStatus, LogError } from '@memberjunction/core';
import { ClientToolMetadata, ClientToolResponse } from '@memberjunction/ai-core-plus';

/** Internal record for a pending tool request */
interface PendingRequest {
    Resolve: (response: ClientToolResponse) => void;
    Timer: ReturnType<typeof setTimeout>;
}

/** Payload published to the CLIENT_TOOL_REQUEST PubSub topic */
export interface ClientToolRequestNotificationPayload {
    AgentRunID: string;
    SessionID: string;
    RequestID: string;
    ToolName: string;
    /** JSON-encoded parameters */
    Params: string;
    TimeoutMs: number;
    Description: string;
}

/** The PubSub topic used for client tool requests */
export const CLIENT_TOOL_REQUEST_TOPIC = 'CLIENT_TOOL_REQUEST';

/**
 * Singleton that manages pending client tool requests.
 * BaseAgent publishes a request and awaits the Promise.
 * The GraphQL resolver receives the response and resolves the Promise.
 */
export class ClientToolRequestManager extends BaseSingleton<ClientToolRequestManager> {
    private pendingRequests = new Map<string, PendingRequest>();

    /** Enriched tool definitions per session (from client decoration) */
    private sessionTools = new Map<string, ClientToolMetadata[]>();

    /** Optional PubSub publish function — injected by the server at startup */
    private publishFn: ((topic: string, payload: Record<string, unknown>) => void) | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): ClientToolRequestManager {
        return super.getInstance<ClientToolRequestManager>();
    }

    /**
     * Set the publish function used to send tool requests to clients.
     * Called once at server startup after PubSubManager is configured.
     */
    public SetPublishFunction(fn: (topic: string, payload: Record<string, unknown>) => void): void {
        this.publishFn = fn;
    }

    /**
     * Called by BaseAgent to send a request and await the response.
     * Publishes via PubSub and returns a Promise that resolves when
     * the client responds or times out.
     */
    public async RequestClientTool(
        requestID: string,
        toolName: string,
        params: Record<string, unknown>,
        sessionID: string,
        agentRunID: string,
        timeoutMs: number,
        description?: string
    ): Promise<ClientToolResponse> {
        if (!this.publishFn) {
            return {
                RequestID: requestID,
                Success: false,
                ErrorMessage: 'PubSub not configured — cannot send client tool requests'
            };
        }

        return new Promise<ClientToolResponse>((resolve) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestID);
                LogError(`Client tool "${toolName}" timed out after ${timeoutMs}ms (request ${requestID})`);
                resolve({
                    RequestID: requestID,
                    Success: false,
                    ErrorMessage: `Client tool "${toolName}" timed out after ${timeoutMs}ms`
                });
            }, timeoutMs);

            this.pendingRequests.set(requestID, { Resolve: resolve, Timer: timer });

            const notification: ClientToolRequestNotificationPayload = {
                AgentRunID: agentRunID,
                SessionID: sessionID,
                RequestID: requestID,
                ToolName: toolName,
                Params: JSON.stringify(params),
                TimeoutMs: timeoutMs,
                Description: description ?? ''
            };

            this.publishFn!(CLIENT_TOOL_REQUEST_TOPIC, notification as unknown as Record<string, unknown>);
            LogStatus(`ClientToolRequestManager: published "${toolName}" request (${requestID}) for session ${sessionID}`);
        });
    }

    /**
     * Called by the RespondToClientToolRequest GraphQL mutation.
     * Resolves the pending Promise so the agent loop continues.
     */
    public ReceiveResponse(response: ClientToolResponse): boolean {
        const pending = this.pendingRequests.get(response.RequestID);
        if (!pending) {
            LogError(`ClientToolRequestManager: no pending request for ${response.RequestID}`);
            return false;
        }
        clearTimeout(pending.Timer);
        this.pendingRequests.delete(response.RequestID);
        pending.Resolve(response);
        LogStatus(`ClientToolRequestManager: received response for ${response.RequestID} (success=${response.Success})`);
        return true;
    }

    /** Store enriched tool definitions for a session */
    public SetSessionTools(sessionID: string, tools: ClientToolMetadata[]): void {
        this.sessionTools.set(sessionID, tools);
    }

    /** Get enriched tool definitions for prompt injection */
    public GetSessionTools(sessionID: string): ClientToolMetadata[] {
        return this.sessionTools.get(sessionID) ?? [];
    }

    /** Clean up when session ends */
    public ClearSession(sessionID: string): void {
        this.sessionTools.delete(sessionID);
    }

    /** Get the number of pending requests (useful for testing/monitoring) */
    public get PendingRequestCount(): number {
        return this.pendingRequests.size;
    }
}
