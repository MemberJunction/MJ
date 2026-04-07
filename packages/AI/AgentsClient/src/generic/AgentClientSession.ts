/**
 * @fileoverview Agent Client Session for the MJ Agent Client SDK.
 *
 * Manages the lifecycle of a connection to an MJ agent, including
 * sending/receiving messages, handling client tool requests, and
 * managing conversation state.
 *
 * @module @memberjunction/ai-agent-client
 */

import { TransportAdapter } from './TransportAdapter';
import { ClientToolRegistry } from './ClientToolRegistry';
import {
    AgentMessage,
    AgentProgress,
    AgentError,
    ClientToolRequest,
    ClientToolResponse,
    ServerMessage,
    Attachment,
} from './AgentClientTypes';

/** Generate a simple unique ID for messages */
function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Manages a client session connected to an MJ agent.
 *
 * Handles bidirectional communication: sending user messages,
 * receiving agent responses, and executing client-side tools
 * when requested by the server.
 */
export class AgentClientSession {
    private transport: TransportAdapter;
    private toolRegistry: ClientToolRegistry;
    private _agentId = '';
    private _conversationId: string | null = null;

    private messageHandlers: ((msg: AgentMessage) => void)[] = [];
    private toolRequestHandlers: ((req: ClientToolRequest) => void)[] = [];
    private progressHandlers: ((progress: AgentProgress) => void)[] = [];
    private errorHandlers: ((error: AgentError) => void)[] = [];

    constructor(transport: TransportAdapter, toolRegistry: ClientToolRegistry) {
        this.transport = transport;
        this.toolRegistry = toolRegistry;
        this.setupTransportHandlers();
    }

    /** The agent ID this session is connected to */
    public get AgentId(): string {
        return this._agentId;
    }

    /** The conversation ID (assigned by server on first message) */
    public get ConversationId(): string | null {
        return this._conversationId;
    }

    /** Whether the transport is currently connected */
    public get IsConnected(): boolean {
        return this.transport.IsConnected;
    }

    /**
     * Connect to an agent.
     *
     * @param agentId - The ID of the agent to connect to
     * @param conversationId - Optional existing conversation to resume
     */
    public async Connect(agentId: string, conversationId?: string): Promise<void> {
        this._agentId = agentId;
        this._conversationId = conversationId ?? null;

        // The transport should already be connected. Send a connect message.
        await this.transport.Send({
            Type: 'connect',
            MessageID: generateMessageId(),
            Payload: {
                AgentId: agentId,
                ConversationId: conversationId,
            },
        });
    }

    /**
     * Send a user message to the agent.
     *
     * @param content - The message text
     * @param attachments - Optional file attachments
     */
    public async SendMessage(content: string, attachments?: Attachment[]): Promise<void> {
        await this.transport.Send({
            Type: 'user_message',
            MessageID: generateMessageId(),
            Payload: {
                Content: content,
                ConversationId: this._conversationId,
                Attachments: attachments,
            },
        });
    }

    /**
     * Disconnect from the agent.
     */
    public async Disconnect(): Promise<void> {
        await this.transport.Send({
            Type: 'disconnect',
            MessageID: generateMessageId(),
            Payload: { ConversationId: this._conversationId },
        });
        await this.transport.Disconnect();
    }

    /** Register handler for agent messages */
    public OnAgentMessage(handler: (msg: AgentMessage) => void): void {
        this.messageHandlers.push(handler);
    }

    /** Register handler for tool requests */
    public OnToolRequest(handler: (req: ClientToolRequest) => void): void {
        this.toolRequestHandlers.push(handler);
    }

    /** Register handler for progress updates */
    public OnProgress(handler: (progress: AgentProgress) => void): void {
        this.progressHandlers.push(handler);
    }

    /** Register handler for errors */
    public OnError(handler: (error: AgentError) => void): void {
        this.errorHandlers.push(handler);
    }

    /**
     * Set up handlers for transport messages.
     */
    private setupTransportHandlers(): void {
        this.transport.OnMessage((message) => this.handleServerMessage(message));

        this.transport.OnError((error) => {
            this.notifyError({
                Code: 'TRANSPORT_ERROR',
                Message: error.message,
                IsRecoverable: true,
            });
        });

        this.transport.OnDisconnect(() => {
            this.notifyError({
                Code: 'DISCONNECTED',
                Message: 'Connection to agent server was lost',
                IsRecoverable: true,
            });
        });
    }

    /**
     * Route an incoming server message to the appropriate handler.
     */
    private handleServerMessage(message: ServerMessage): void {
        switch (message.Type) {
            case 'agent_message':
                this.handleAgentMessage(message);
                break;
            case 'tool_request':
                this.handleToolRequest(message);
                break;
            case 'progress':
                this.handleProgress(message);
                break;
            case 'error':
                this.handleServerError(message);
                break;
            case 'connected':
                this.handleConnected(message);
                break;
        }
    }

    /**
     * Handle an agent message from the server.
     */
    private handleAgentMessage(message: ServerMessage): void {
        const agentMsg: AgentMessage = {
            ConversationID: String(message.Payload['ConversationId'] ?? this._conversationId ?? ''),
            Content: String(message.Payload['Content'] ?? ''),
            IsStreaming: Boolean(message.Payload['IsStreaming']),
            Timestamp: new Date(),
            Role: (message.Payload['Role'] as 'assistant' | 'system') ?? 'assistant',
        };

        for (const handler of this.messageHandlers) {
            handler(agentMsg);
        }
    }

    /**
     * Handle a tool request from the server: execute the tool and send the response.
     */
    private async handleToolRequest(message: ServerMessage): Promise<void> {
        const request: ClientToolRequest = {
            RequestID: String(message.Payload['RequestID']),
            ToolName: String(message.Payload['ToolName']),
            Params: (message.Payload['Params'] as Record<string, unknown>) ?? {},
            TimeoutMs: Number(message.Payload['TimeoutMs'] ?? 30000),
        };

        // Notify tool request handlers
        for (const handler of this.toolRequestHandlers) {
            handler(request);
        }

        // Execute the tool
        const result = await this.toolRegistry.Execute(
            request.ToolName,
            request.Params,
            request.TimeoutMs
        );

        // Send the response back
        const response: ClientToolResponse = {
            RequestID: request.RequestID,
            Success: result.Success,
            Result: result.Data,
            ErrorMessage: result.ErrorMessage,
        };

        await this.transport.Send({
            Type: 'tool_response',
            MessageID: generateMessageId(),
            Payload: response as unknown as Record<string, unknown>,
        });
    }

    /**
     * Handle a progress update from the server.
     */
    private handleProgress(message: ServerMessage): void {
        const progress: AgentProgress = {
            StatusMessage: String(message.Payload['StatusMessage'] ?? ''),
            PercentComplete: message.Payload['PercentComplete'] != null
                ? Number(message.Payload['PercentComplete'])
                : undefined,
            IsToolExecution: Boolean(message.Payload['IsToolExecution']),
            ToolName: message.Payload['ToolName'] != null
                ? String(message.Payload['ToolName'])
                : undefined,
        };

        for (const handler of this.progressHandlers) {
            handler(progress);
        }
    }

    /**
     * Handle an error from the server.
     */
    private handleServerError(message: ServerMessage): void {
        this.notifyError({
            Code: String(message.Payload['Code'] ?? 'SERVER_ERROR'),
            Message: String(message.Payload['Message'] ?? 'Unknown server error'),
            IsRecoverable: Boolean(message.Payload['IsRecoverable'] ?? false),
        });
    }

    /**
     * Handle a connected acknowledgment (may include assigned conversation ID).
     */
    private handleConnected(message: ServerMessage): void {
        if (message.Payload['ConversationId']) {
            this._conversationId = String(message.Payload['ConversationId']);
        }
    }

    /**
     * Dispatch an error to all registered error handlers.
     */
    private notifyError(error: AgentError): void {
        for (const handler of this.errorHandlers) {
            handler(error);
        }
    }
}
