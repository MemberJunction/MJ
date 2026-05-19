/**
 * @fileoverview Client-side tool registry for the Agent Client SDK.
 *
 * Manages registration and execution of client-side tools that the
 * server-side agent can invoke. Includes timeout handling.
 *
 * @module @memberjunction/ai-agent-client
 */

import { ClientToolResult } from './AgentClientTypes';

/**
 * Handler function type for client-side tools.
 */
export type ClientToolHandler = (params: Record<string, unknown>) => Promise<ClientToolResult>;

/**
 * Definition of a client-side tool that can be registered and invoked by agents.
 */
export interface ClientToolDefinition {
    /** Unique name identifying this tool */
    Name: string;
    /** Human-readable description of what this tool does */
    Description: string;
    /** JSON Schema describing the parameters this tool accepts */
    ParameterSchema: Record<string, unknown>;
    /** The function that executes the tool */
    Handler: ClientToolHandler;
}

/** Default timeout for tool execution in milliseconds */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * Registry for client-side tools that agents can invoke.
 *
 * Tools are registered by the client application and can be executed
 * when the agent sends a ClientToolRequest over the transport.
 */
export class ClientToolRegistry {
    private tools = new Map<string, ClientToolDefinition>();

    /**
     * Register a client-side tool.
     *
     * @param tool - The tool definition to register
     * @throws Error if a tool with the same name is already registered
     */
    public Register(tool: ClientToolDefinition): void {
        if (this.tools.has(tool.Name)) {
            throw new Error(`Client tool "${tool.Name}" is already registered`);
        }
        this.tools.set(tool.Name, tool);
    }

    /**
     * Unregister a client-side tool.
     *
     * @param toolName - The name of the tool to unregister
     */
    public Unregister(toolName: string): void {
        this.tools.delete(toolName);
    }

    /**
     * Get a tool definition by name.
     *
     * @param name - The tool name to look up
     * @returns The tool definition, or undefined if not found
     */
    public GetTool(name: string): ClientToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tool definitions.
     */
    public GetAllTools(): ClientToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Execute a registered tool with timeout protection.
     *
     * @param name - The name of the tool to execute
     * @param params - Parameters to pass to the tool handler
     * @param timeoutMs - Maximum execution time in ms (default: 30s)
     * @returns The tool result, or a timeout/not-found error result
     */
    public async Execute(
        name: string,
        params: Record<string, unknown>,
        timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS
    ): Promise<ClientToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return {
                Success: false,
                ErrorMessage: `Client tool "${name}" is not registered`,
            };
        }

        return this.executeWithTimeout(tool.Handler, params, timeoutMs);
    }

    /**
     * Execute a tool handler with timeout protection.
     */
    private executeWithTimeout(
        handler: ClientToolHandler,
        params: Record<string, unknown>,
        timeoutMs: number
    ): Promise<ClientToolResult> {
        return new Promise<ClientToolResult>((resolve) => {
            const timer = setTimeout(() => {
                resolve({
                    Success: false,
                    ErrorMessage: `Client tool execution timed out after ${timeoutMs}ms`,
                });
            }, timeoutMs);

            handler(params)
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((error: unknown) => {
                    clearTimeout(timer);
                    const message = error instanceof Error ? error.message : String(error);
                    resolve({
                        Success: false,
                        ErrorMessage: `Client tool execution failed: ${message}`,
                    });
                });
        });
    }
}
