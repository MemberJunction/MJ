/**
 * @fileoverview WebSocket transport implementation for the Agent Client SDK.
 *
 * Wraps the native WebSocket API to provide the TransportAdapter interface
 * for bidirectional agent communication. Supports automatic reconnection
 * with exponential backoff.
 *
 * @module @memberjunction/ai-agent-client
 */

import { TransportAdapter } from './TransportAdapter';
import { ClientMessage, ServerMessage, TransportOptions } from './AgentClientTypes';

/**
 * WebSocket-based transport adapter.
 *
 * Uses the native WebSocket API (available in browsers and Node.js 21+)
 * for bidirectional communication with the agent server. Supports
 * automatic reconnection with configurable exponential backoff when
 * the connection drops unexpectedly.
 */
export class WebSocketTransport implements TransportAdapter {
    private ws: WebSocket | null = null;
    private messageHandler: ((message: ServerMessage) => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private disconnectHandler: (() => void) | null = null;
    private _isConnected = false;

    /** Reconnection state */
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private lastUrl: string | null = null;
    private lastOptions: TransportOptions | undefined;
    private intentionalDisconnect = false;

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
        this.lastUrl = url;
        this.lastOptions = options;
        this.intentionalDisconnect = false;
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();

        return this.connectInternal(url, options);
    }

    /**
     * Close the WebSocket connection.
     * Cancels any pending reconnection attempts.
     */
    public async Disconnect(): Promise<void> {
        this.intentionalDisconnect = true;
        this.clearReconnectTimer();
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
     * Internal connect that can be called for both initial connection and reconnection.
     */
    private connectInternal(url: string, options?: TransportOptions): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                const wsUrl = this.buildWebSocketUrl(url, options);
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    this._isConnected = true;
                    this.reconnectAttempt = 0; // Reset on successful connection
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
                    const wasConnected = this._isConnected;
                    this._isConnected = false;

                    if (this.disconnectHandler) {
                        this.disconnectHandler();
                    }

                    // Only auto-reconnect if this wasn't intentional and reconnect is enabled
                    if (!this.intentionalDisconnect && wasConnected) {
                        this.scheduleReconnect();
                    }
                };
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    /**
     * Schedule a reconnection attempt with exponential backoff.
     * Uses the Reconnect configuration from the last TransportOptions.
     */
    private scheduleReconnect(): void {
        const config = this.lastOptions?.Reconnect;
        if (!config?.Enabled || !this.lastUrl) {
            return; // Reconnection not configured
        }

        if (this.reconnectAttempt >= config.MaxAttempts) {
            if (this.errorHandler) {
                this.errorHandler(new Error(
                    `WebSocket reconnection failed after ${config.MaxAttempts} attempts`
                ));
            }
            return;
        }

        // Exponential backoff: delay * 2^attempt, capped at 30s
        const backoffMs = Math.min(
            config.DelayMs * Math.pow(2, this.reconnectAttempt),
            30_000
        );

        this.reconnectAttempt++;

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connectInternal(this.lastUrl!, this.lastOptions);
            } catch {
                // connectInternal failed — schedule another attempt
                this.scheduleReconnect();
            }
        }, backoffMs);
    }

    /** Clear any pending reconnection timer */
    private clearReconnectTimer(): void {
        if (this.reconnectTimer != null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
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
