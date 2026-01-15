/**
 * Custom SSE (Server-Sent Events) server with authentication middleware
 *
 * This module implements a custom HTTP/HTTPS server for MCP over SSE transport
 * with per-request API key authentication. FastMCP doesn't provide auth hooks,
 * so we intercept requests here before delegating to FastMCP.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import { AuthMiddleware, AuthContext } from './AuthMiddleware.js';
import { APIKeyService } from './APIKeyService.js';

export interface SSEServerOptions {
    /**
     * Port to listen on
     */
    port: number;

    /**
     * SSE endpoint path (e.g., '/mcp')
     */
    endpoint: string;

    /**
     * TLS configuration (optional - omit for HTTP)
     */
    tls?: {
        certPath: string;
        keyPath: string;
    };

    /**
     * Whether authentication is required
     */
    requireAuthentication: boolean;

    /**
     * Callback when client connects with valid authentication
     * @param authContext - Authentication context for this request
     * @param req - HTTP request object
     * @param res - HTTP response object
     */
    onConnect: (authContext: AuthContext, req: http.IncomingMessage, res: http.ServerResponse) => void;

    /**
     * Callback for logging
     */
    onLog?: (message: string) => void;
}

export class SSEServer {
    private server: http.Server | https.Server;
    private clients: Set<http.ServerResponse> = new Set();
    private log: (message: string) => void;

    constructor(private options: SSEServerOptions) {
        this.log = options.onLog || console.log;

        // Create HTTP or HTTPS server
        if (options.tls) {
            const tlsOptions: https.ServerOptions = {
                cert: fs.readFileSync(options.tls.certPath),
                key: fs.readFileSync(options.tls.keyPath)
            };
            this.server = https.createServer(tlsOptions, this.handleRequest.bind(this));
            this.log(`HTTPS server created with TLS certificates`);
        } else {
            this.server = http.createServer(this.handleRequest.bind(this));
            this.log(`HTTP server created (no TLS)`);
        }

        // Handle server errors
        this.server.on('error', (error) => {
            this.log(`Server error: ${error.message}`);
        });
    }

    /**
     * Handle incoming HTTP requests
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const startTime = Date.now();

        // Check if request is for the SSE endpoint
        if (req.url !== this.options.endpoint) {
            this.sendJsonResponse(res, 404, {
                error: 'Not Found',
                message: `Endpoint not found. Try ${this.options.endpoint}`
            });
            return;
        }

        // Handle OPTIONS for CORS preflight
        if (req.method === 'OPTIONS') {
            this.handleCORS(res);
            return;
        }

        // Only accept GET requests for SSE
        if (req.method !== 'GET') {
            this.sendJsonResponse(res, 405, {
                error: 'Method Not Allowed',
                message: 'Only GET requests are supported for SSE'
            });
            return;
        }

        // Authenticate request
        let authContext: AuthContext;

        if (this.options.requireAuthentication) {
            const authHeader = req.headers.authorization;
            authContext = await AuthMiddleware.Authenticate(authHeader);

            if (!authContext.authenticated) {
                const responseTime = Date.now() - startTime;
                this.log(`Authentication failed: ${authContext.errorMessage} (${responseTime}ms)`);

                this.sendJsonResponse(res, 401, {
                    error: 'Unauthorized',
                    message: authContext.errorMessage
                }, {
                    'WWW-Authenticate': 'Bearer realm="MCP Server"'
                });
                return;
            }

            // Log successful authentication
            const responseTime = Date.now() - startTime;
            this.log(`✅ Authenticated: ${authContext.user?.Email || authContext.user?.Name} (${responseTime}ms)`);

            // Log the connection (not a tool usage, but tracks API access)
            if (authContext.apiKeyId) {
                await APIKeyService.LogAPIKeyUsage({
                    apiKeyId: authContext.apiKeyId,
                    operationName: 'SSE_Connect',
                    statusCode: 200,
                    responseTimeMs: responseTime,
                }, authContext.user).catch(err => {
                    this.log(`Failed to log connection: ${err.message}`);
                });
            }
        } else {
            // Authentication disabled - create anonymous context
            authContext = {
                authenticated: true,
                scopes: ['admin:*'] // Grant all permissions when auth is disabled
            };
            this.log(`⚠️  Authentication disabled - allowing anonymous access`);
        }

        // Setup SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*', // Configure based on your CORS policy
            'X-Accel-Buffering': 'no' // Disable nginx buffering
        });

        // Track this client
        this.clients.add(res);

        // Handle client disconnect
        req.on('close', () => {
            this.clients.delete(res);
            this.log(`Client disconnected (${this.clients.size} active connections)`);
        });

        // Delegate to FastMCP handler
        try {
            this.options.onConnect(authContext, req, res);
        } catch (error) {
            this.log(`Error in onConnect handler: ${error instanceof Error ? error.message : String(error)}`);
            res.end();
        }
    }

    /**
     * Handle CORS preflight requests
     */
    private handleCORS(res: http.ServerResponse): void {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '86400' // 24 hours
        });
        res.end();
    }

    /**
     * Send JSON response
     */
    private sendJsonResponse(
        res: http.ServerResponse,
        statusCode: number,
        body: object,
        additionalHeaders: Record<string, string> = {}
    ): void {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            ...additionalHeaders
        });
        res.end(JSON.stringify(body));
    }

    /**
     * Start the server
     */
    listen(): void {
        this.server.listen(this.options.port, () => {
            const protocol = this.options.tls ? 'https' : 'http';
            this.log(`🚀 MCP Server listening on ${protocol}://localhost:${this.options.port}${this.options.endpoint}`);
        });
    }

    /**
     * Stop the server
     */
    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Close all active connections
            for (const client of this.clients) {
                client.end();
            }
            this.clients.clear();

            // Close server
            this.server.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    this.log('Server stopped');
                    resolve();
                }
            });
        });
    }

    /**
     * Get number of active connections
     */
    getActiveConnections(): number {
        return this.clients.size;
    }
}
