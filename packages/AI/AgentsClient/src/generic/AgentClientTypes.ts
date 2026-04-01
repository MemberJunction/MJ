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
