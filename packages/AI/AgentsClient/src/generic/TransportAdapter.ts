/**
 * @fileoverview Transport abstraction for the Agent Client SDK.
 *
 * Defines the interface that all transport implementations must satisfy,
 * enabling WebSocket, SSE, or custom transport backends.
 *
 * @module @memberjunction/ai-agent-client
 */

import { ClientMessage, ServerMessage, TransportOptions } from './AgentClientTypes';

/**
 * Abstract transport adapter interface.
 *
 * Implementations handle the actual network communication between
 * the client and the agent server. The SDK is transport-agnostic --
 * any implementation of this interface can be used.
 */
export interface TransportAdapter {
    /**
     * Establish a connection to the agent server.
     *
     * @param url - The server URL to connect to
     * @param options - Optional transport configuration
     */
    Connect(url: string, options?: TransportOptions): Promise<void>;

    /**
     * Close the connection to the agent server.
     */
    Disconnect(): Promise<void>;

    /**
     * Send a message to the server.
     *
     * @param message - The client message to send
     */
    Send(message: ClientMessage): Promise<void>;

    /**
     * Register a handler for incoming server messages.
     *
     * @param handler - Callback invoked for each received message
     */
    OnMessage(handler: (message: ServerMessage) => void): void;

    /**
     * Register a handler for transport errors.
     *
     * @param handler - Callback invoked when an error occurs
     */
    OnError(handler: (error: Error) => void): void;

    /**
     * Register a handler for disconnection events.
     *
     * @param handler - Callback invoked when the connection is lost
     */
    OnDisconnect(handler: () => void): void;

    /**
     * Whether the transport is currently connected.
     */
    get IsConnected(): boolean;
}
