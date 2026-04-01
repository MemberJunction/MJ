/**
 * @fileoverview Type definitions for the MJ Agent Client SDK.
 *
 * Framework-agnostic types for agent communication, tool execution,
 * and transport management.
 *
 * @module @memberjunction/ai-agent-client
 */

/**
 * Message sent from client to server.
 */
export interface ClientMessage {
    /** Message type discriminator */
    Type: ClientMessageType;
    /** Unique message ID for correlation */
    MessageID: string;
    /** Payload varies by message type */
    Payload: Record<string, unknown>;
}

/**
 * Discriminated union of client message types.
 */
export type ClientMessageType =
    | 'connect'
    | 'disconnect'
    | 'user_message'
    | 'tool_response';

/**
 * Message sent from server to client.
 */
export interface ServerMessage {
    /** Message type discriminator */
    Type: ServerMessageType;
    /** Unique message ID for correlation */
    MessageID: string;
    /** Payload varies by message type */
    Payload: Record<string, unknown>;
}

/**
 * Discriminated union of server message types.
 */
export type ServerMessageType =
    | 'agent_message'
    | 'tool_request'
    | 'progress'
    | 'error'
    | 'connected'
    | 'disconnected';

/**
 * A message from the agent to display to the user.
 */
export interface AgentMessage {
    /** The conversation this message belongs to */
    ConversationID: string;
    /** The message content */
    Content: string;
    /** Whether this message is still being streamed */
    IsStreaming: boolean;
    /** Timestamp of the message */
    Timestamp: Date;
    /** Optional role (usually 'assistant') */
    Role: 'assistant' | 'system';
}

/**
 * A request from the server to execute a client-side tool.
 */
export interface ClientToolRequest {
    /** Unique request ID for correlation with the response */
    RequestID: string;
    /** The name of the tool to execute */
    ToolName: string;
    /** Parameters to pass to the tool handler */
    Params: Record<string, unknown>;
    /** Maximum time in ms the server will wait for a response */
    TimeoutMs: number;
}

/**
 * Response from executing a client-side tool.
 */
export interface ClientToolResponse {
    /** Must match the RequestID from the ClientToolRequest */
    RequestID: string;
    /** Whether the tool executed successfully */
    Success: boolean;
    /** The tool result (if successful) */
    Result?: unknown;
    /** Error message (if failed) */
    ErrorMessage?: string;
}

/**
 * The result of executing a client-side tool handler.
 */
export interface ClientToolResult {
    /** Whether the tool executed successfully */
    Success: boolean;
    /** The result data */
    Data?: unknown;
    /** Error message if execution failed */
    ErrorMessage?: string;
}

/**
 * Progress update from the agent.
 */
export interface AgentProgress {
    /** What the agent is currently doing */
    StatusMessage: string;
    /** Optional percentage complete (0-100) */
    PercentComplete?: number;
    /** Whether this is a tool execution progress update */
    IsToolExecution: boolean;
    /** Name of the tool being executed (if IsToolExecution) */
    ToolName?: string;
}

/**
 * Error from the agent session.
 */
export interface AgentError {
    /** Error code for programmatic handling */
    Code: string;
    /** Human-readable error message */
    Message: string;
    /** Whether the error is recoverable */
    IsRecoverable: boolean;
}

// ============================================================================
// Client Tool Metadata & Decoration Types
// ============================================================================

/**
 * Metadata definition for a client tool (mirrors server-side ClientToolMetadata).
 * Used for runtime enrichment and registration.
 */
export interface ClientToolMetadata {
    /** Unique identifier for this tool */
    Name: string;
    /** Human-readable description — what the LLM reads to decide when to use it */
    Description: string;
    /** JSON Schema describing input parameters */
    InputSchema: Record<string, unknown>;
    /** JSON Schema describing what the tool returns (optional) */
    OutputSchema?: Record<string, unknown>;
    /** Category for grouping in prompts (e.g., 'navigation', 'display', 'data') */
    Category?: string;
    /** Default timeout in ms for this tool */
    DefaultTimeoutMs?: number;
}

/**
 * Context provided to decorators — includes app state, user info, etc.
 */
export interface ClientToolDecoratorContext {
    /** Current user's accessible entities */
    AvailableEntities: string[];
    /** Current application name */
    CurrentAppName: string;
    /** Current active tab/dashboard */
    CurrentTabName?: string;
    /** Any additional context the app provides */
    CustomContext: Record<string, unknown>;
}

/**
 * A decorator function that enriches a tool definition with runtime context.
 * Called by the SDK when the agent session initializes or when tools are refreshed.
 */
export type ClientToolDecorator = (
    baseTool: ClientToolMetadata,
    context: ClientToolDecoratorContext
) => ClientToolMetadata;

/**
 * Options for connecting a transport.
 */
export interface TransportOptions {
    /** Authentication token */
    AuthToken?: string;
    /** Additional headers to send with the connection */
    Headers?: Record<string, string>;
    /** Reconnection configuration */
    Reconnect?: {
        /** Whether to auto-reconnect on disconnect */
        Enabled: boolean;
        /** Maximum number of reconnection attempts */
        MaxAttempts: number;
        /** Delay between reconnection attempts in ms */
        DelayMs: number;
    };
}

/**
 * Attachment sent with a user message.
 */
export interface Attachment {
    /** Display name of the attachment */
    Name: string;
    /** MIME type */
    ContentType: string;
    /** Base64-encoded content or URL */
    Content: string;
    /** Whether Content is a URL or base64 data */
    IsURL: boolean;
}
