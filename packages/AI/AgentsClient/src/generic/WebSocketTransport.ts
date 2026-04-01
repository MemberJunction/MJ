/**
 * @fileoverview WebSocket transport implementation for the Agent Client SDK.
 *
 * Wraps the native WebSocket API to provide the TransportAdapter interface
 * for bidirectional agent communication.
 *
 * @module @memberjunction/ai-agent-client
 */

import { TransportAdapter } from './TransportAdapter';
import { ClientMessage, ServerMessage, TransportOptions } from './AgentClientTypes';

/**
 * WebSocket-based transport adapter.
 *
 * Uses the native WebSocket API (available in browsers and Node.js 21+)
 * for bidirectional communication with the agent server.
 */
export class WebSocketTransport implements TransportAdapter {
    private ws: WebSocket | null = null;
    private messageHandler: ((message: ServerMessage) => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private disconnectHandler: (() => void) | null = null;
    private _isConnected = false;

    /**
     * Whether the WebSocket is currently connected.
     */
    public get IsConnected(): boolean {
        return this._isConnected;
    }

    /**
     * Establish a WebSocket connection to the agent server.
     */
    public async Connect(url: string, options?: TransportOptions): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                const wsUrl = this.buildWebSocketUrl(url, options);
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    this._isConnected = true;
                    resolve();
                };

                this.ws.onmessage = (event: MessageEvent) => {
                    this.handleIncomingMessage(event);
                };

                this.ws.onerror = (event: Event) => {
                    const error = new Error('WebSocket error occurred');
                    if (this.errorHandler) {
                        this.errorHandler(error);
                    }
                    if (!this._isConnected) {
                        reject(error);
                    }
                };

                this.ws.onclose = () => {
                    this._isConnected = false;
                    if (this.disconnectHandler) {
                        this.disconnectHandler();
                    }
                };
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    /**
     * Close the WebSocket connection.
     */
    public async Disconnect(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this._isConnected = false;
        }
    }

    /**
     * Send a message over the WebSocket.
     */
    public async Send(message: ClientMessage): Promise<void> {
        if (!this.ws || !this._isConnected) {
            throw new Error('WebSocket is not connected');
        }

        this.ws.send(JSON.stringify(message));
    }

    /**
     * Register a handler for incoming server messages.
     */
    public OnMessage(handler: (message: ServerMessage) => void): void {
        this.messageHandler = handler;
    }

    /**
     * Register a handler for transport errors.
     */
    public OnError(handler: (error: Error) => void): void {
        this.errorHandler = handler;
    }

    /**
     * Register a handler for disconnection events.
     */
    public OnDisconnect(handler: () => void): void {
        this.disconnectHandler = handler;
    }

    /**
     * Build the WebSocket URL, appending auth token as query param if provided.
     */
    private buildWebSocketUrl(url: string, options?: TransportOptions): string {
        const wsUrl = url.replace(/^http/, 'ws');
        if (options?.AuthToken) {
            const separator = wsUrl.includes('?') ? '&' : '?';
            return `${wsUrl}${separator}token=${encodeURIComponent(options.AuthToken)}`;
        }
        return wsUrl;
    }

    /**
     * Parse and dispatch an incoming WebSocket message.
     */
    private handleIncomingMessage(event: MessageEvent): void {
        if (!this.messageHandler) {
            return;
        }

        try {
            const message = JSON.parse(String(event.data)) as ServerMessage;
            this.messageHandler(message);
        } catch {
            if (this.errorHandler) {
                this.errorHandler(new Error('Failed to parse incoming WebSocket message'));
            }
        }
    }
}
