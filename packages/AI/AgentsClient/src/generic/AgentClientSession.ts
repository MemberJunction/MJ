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
    ClientToolMetadata,
    ClientToolDecorator,
    ClientToolDecoratorContext,
} from './AgentClientTypes';
import { ClientToolHandler } from './ClientToolRegistry';

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
    private _sessionId: string | null = null;

    private messageHandlers: ((msg: AgentMessage) => void)[] = [];
    private toolRequestHandlers: ((req: ClientToolRequest) => void)[] = [];
    private progressHandlers: ((progress: AgentProgress) => void)[] = [];
    private errorHandlers: ((error: AgentError) => void)[] = [];

    /** Decorators that enrich base tool metadata with runtime context */
    private toolDecorators = new Map<string, ClientToolDecorator>();
    /** Current runtime context for decorators */
    private decoratorContext: ClientToolDecoratorContext = {
        AvailableEntities: [],
        CurrentAppName: '',
        CustomContext: {}
    };
    /** Callback for sending enriched tool definitions to the server */
    private sendToolDefinitionsFn: ((sessionID: string, tools: ClientToolMetadata[]) => Promise<void>) | null = null;

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

    /**
     * Register handler for agent messages.
     * @returns Unsubscribe function — call it to remove this handler.
     */
    public OnAgentMessage(handler: (msg: AgentMessage) => void): () => void {
        this.messageHandlers.push(handler);
        return () => {
            const idx = this.messageHandlers.indexOf(handler);
            if (idx >= 0) this.messageHandlers.splice(idx, 1);
        };
    }

    /**
     * Register handler for tool requests.
     * @returns Unsubscribe function — call it to remove this handler.
     */
    public OnToolRequest(handler: (req: ClientToolRequest) => void): () => void {
        this.toolRequestHandlers.push(handler);
        return () => {
            const idx = this.toolRequestHandlers.indexOf(handler);
            if (idx >= 0) this.toolRequestHandlers.splice(idx, 1);
        };
    }

    /**
     * Register handler for progress updates.
     * @returns Unsubscribe function — call it to remove this handler.
     */
    public OnProgress(handler: (progress: AgentProgress) => void): () => void {
        this.progressHandlers.push(handler);
        return () => {
            const idx = this.progressHandlers.indexOf(handler);
            if (idx >= 0) this.progressHandlers.splice(idx, 1);
        };
    }

    /**
     * Register handler for errors.
     * @returns Unsubscribe function — call it to remove this handler.
     */
    public OnError(handler: (error: AgentError) => void): () => void {
        this.errorHandlers.push(handler);
        return () => {
            const idx = this.errorHandlers.indexOf(handler);
            if (idx >= 0) this.errorHandlers.splice(idx, 1);
        };
    }

    /**
     * Dispose the session: clear all handlers, decorators, and internal state.
     * Call this when the session is no longer needed to prevent memory leaks.
     */
    public Dispose(): void {
        this.messageHandlers.length = 0;
        this.toolRequestHandlers.length = 0;
        this.progressHandlers.length = 0;
        this.errorHandlers.length = 0;
        this.toolDecorators.clear();
        this.sendToolDefinitionsFn = null;
    }

    // ================================================================
    // Client Tool Decoration & Management
    // ================================================================

    /** The session ID (assigned on connect or generated) */
    public get SessionId(): string | null {
        return this._sessionId;
    }

    /**
     * Register a decorator that enriches a metadata-driven tool with runtime context.
     * Called during session init to inject dynamic data (entity lists, tab names, etc.)
     */
    public RegisterToolDecorator(toolName: string, decorator: ClientToolDecorator): void {
        this.toolDecorators.set(toolName, decorator);
    }

    /**
     * Set the runtime context that decorators receive.
     * Call this whenever the context changes (user navigates, new data loads, etc.)
     */
    public SetDecoratorContext(context: ClientToolDecoratorContext): void {
        this.decoratorContext = context;
    }

    /**
     * Set the callback function for sending enriched tool definitions to the server.
     * This should be called by the app once (typically a GraphQL mutation wrapper).
     */
    public SetToolDefinitionsSender(fn: (sessionID: string, tools: ClientToolMetadata[]) => Promise<void>): void {
        this.sendToolDefinitionsFn = fn;
    }

    /**
     * Decorate base tools with runtime context and notify the server.
     * Call this after setting decorators and context (e.g., on session init).
     */
    public async DecorateAndSendTools(baseTools: ClientToolMetadata[]): Promise<void> {
        const enriched = baseTools.map(tool => {
            const decorator = this.toolDecorators.get(tool.Name);
            return decorator ? decorator(tool, this.decoratorContext) : tool;
        });

        if (this._sessionId && this.sendToolDefinitionsFn) {
            await this.sendToolDefinitionsFn(this._sessionId, enriched);
        }
    }

    /**
     * Add a client tool dynamically at runtime.
     * Registers the handler locally and notifies the server.
     */
    public async AddClientTool(tool: ClientToolMetadata & { Handler: ClientToolHandler }): Promise<void> {
        // Unregister first to allow re-registration
        if (this.toolRegistry.GetTool(tool.Name)) {
            this.toolRegistry.Unregister(tool.Name);
        }
        this.toolRegistry.Register({
            Name: tool.Name,
            Description: tool.Description,
            ParameterSchema: tool.InputSchema,
            Handler: tool.Handler
        });
        await this.notifyToolsChanged();
    }

    /**
     * Remove a client tool at runtime.
     * Removes the handler locally and notifies the server.
     */
    public async RemoveClientTool(toolName: string): Promise<void> {
        this.toolRegistry.Unregister(toolName);
        await this.notifyToolsChanged();
    }

    /** Notify server that client tools changed (add/remove at runtime) */
    private async notifyToolsChanged(): Promise<void> {
        if (!this._sessionId || !this.sendToolDefinitionsFn) return;

        const allTools: ClientToolMetadata[] = this.toolRegistry.GetAllTools().map(t => ({
            Name: t.Name,
            Description: t.Description,
            InputSchema: t.ParameterSchema,
        }));
        await this.sendToolDefinitionsFn(this._sessionId, allTools);
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
        if (message.Payload['SessionId']) {
            this._sessionId = String(message.Payload['SessionId']);
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
