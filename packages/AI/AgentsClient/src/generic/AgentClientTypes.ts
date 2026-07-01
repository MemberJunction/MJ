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

// ============================================================================
// Session Event Types (emitted via RxJS observables)
// ============================================================================

/**
 * Event emitted when a client tool request is received from the server.
 * Raised BEFORE execution — subscribers can observe what tools are being invoked,
 * AND veto the dispatch by setting `Cancel = true` (cancel-enforcement).
 *
 * **Cancel semantics:** the host's RxJS subscriber runs synchronously inside the
 * `Subject.next()` call. After the synchronous notify completes,
 * {@link AgentClientSession.handleToolRequest} reads `event.Cancel`; if `true`,
 * the tool handler is NOT executed, {@link AgentClientSession.ToolExecuted$} does
 * NOT fire, and a failure result is sent back to the server with
 * `Tool dispatch canceled by host[: <CancelReason>]` as the error message.
 *
 * **Use cases:** permission/role gates, destructive-action confirmation dialogs,
 * rate-limit caps, and other host-side policy decisions that must run before a
 * tool side-effect happens. For pure observation (analytics, logging), leave
 * `Cancel` at its default `false`.
 */
export interface ClientToolRequestEvent {
    /** The raw request from the server */
    Request: ClientToolRequest;
    /** The agent run that triggered this request */
    AgentRunID: string;
    /**
     * When set to `true` by any synchronous subscriber, the session will short-circuit
     * dispatch: no tool handler runs, `ToolExecuted$` is NOT emitted, and a failure
     * response is sent to the server. Defaults to `false` (proceed with dispatch).
     */
    Cancel: boolean;
    /**
     * Optional human-readable reason set alongside `Cancel = true`. Surfaced in the
     * server-side error message (`Tool dispatch canceled by host: <reason>`) so the
     * agent can adapt its next turn.
     */
    CancelReason?: string;
}

/**
 * Event emitted after a client tool has been executed.
 * Raised AFTER execution — subscribers can observe results.
 */
export interface ClientToolResultEvent {
    /** The original request */
    Request: ClientToolRequest;
    /** The execution result */
    Result: ClientToolResult;
}

/**
 * Error event emitted by the session.
 */
export interface SessionError {
    /** Human-readable error message */
    Message: string;
    /** Optional request ID if the error is related to a specific tool request */
    RequestID?: string;
}

// ============================================================================
// Agent Execution Parameter Types
// ============================================================================

/**
 * Parameters for running an agent via the SDK.
 * This is a simplified interface wrapping the GraphQL mutation parameters.
 * The SDK handles serialization and session ID injection internally.
 */
export interface RunAgentParams {
    /** The ID of the agent to run */
    AgentId: string;
    /** User message(s) to send to the agent */
    Messages: Array<{ role: string; content: string }>;
    /** Optional conversation ID (for resuming a conversation) */
    ConversationId?: string;
    /** Optional data context passed to the agent */
    Data?: Record<string, unknown>;
    /** Optional payload passed to the agent */
    Payload?: Record<string, unknown> | string;
    /** Optional ID of the last agent run for continuity */
    LastRunId?: string;
    /** Whether to auto-populate payload from last run */
    AutoPopulateLastRunPayload?: boolean;
    /** Configuration ID to use */
    ConfigurationId?: string;
    /** Whether Plan Mode is requested for this run (requires the agent's SupportsPlanMode capability) */
    PlanMode?: boolean;
    /** Optional conversation detail ID (triggers artifact/notification creation) */
    ConversationDetailId?: string;
    /** Whether to create artifacts from the agent's payload */
    CreateArtifacts?: boolean;
    /** Whether to create a user notification on completion */
    CreateNotification?: boolean;
    /** Source artifact ID for versioning */
    SourceArtifactId?: string;
    /** Source artifact version ID for versioning */
    SourceArtifactVersionId?: string;
    /** Optional callback for progress updates */
    OnProgress?: (progress: AgentProgress) => void;
}

/**
 * Parameters for running an agent from an existing conversation detail.
 * This is the optimized path that loads conversation history server-side.
 */
export interface RunAgentFromConversationDetailParams {
    /** The ID of the conversation detail (user's message) */
    ConversationDetailId: string;
    /** The ID of the agent to run */
    AgentId: string;
    /** Maximum number of history messages to include */
    MaxHistoryMessages?: number;
    /** Optional data context passed to the agent */
    Data?: Record<string, unknown>;
    /** Optional payload passed to the agent */
    Payload?: Record<string, unknown> | string;
    /** Optional ID of the last agent run for continuity */
    LastRunId?: string;
    /** Whether to auto-populate payload from last run */
    AutoPopulateLastRunPayload?: boolean;
    /** Configuration ID to use */
    ConfigurationId?: string;
    /** Whether Plan Mode is requested for this run (requires the agent's SupportsPlanMode capability) */
    PlanMode?: boolean;
    /** Whether to create artifacts from the agent's payload */
    CreateArtifacts?: boolean;
    /** Whether to create a user notification on completion */
    CreateNotification?: boolean;
    /** Source artifact ID for versioning */
    SourceArtifactId?: string;
    /** Source artifact version ID for versioning */
    SourceArtifactVersionId?: string;
    /** Optional callback for progress updates */
    OnProgress?: (progress: {
        CurrentStep: string;
        Percentage?: number;
        Message: string;
        Metadata?: Record<string, unknown>;
    }) => void;
}

/**
 * Result from running an agent.
 */
export interface RunAgentResult {
    /** Whether the agent execution was successful */
    Success: boolean;
    /** Error message if execution failed */
    ErrorMessage?: string;
    /** Execution time in milliseconds */
    ExecutionTimeMs?: number;
    /** The raw result payload from the agent */
    Result?: unknown;
}
