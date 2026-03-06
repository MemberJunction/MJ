/**
 * @fileoverview Client Registry for Dynamic Client Registration (RFC 7591)
 *
 * Manages dynamically registered OAuth clients for the MCP Server OAuth proxy.
 * Clients are stored in memory with configurable TTL for cleanup.
 *
 * @module @memberjunction/ai-mcp-server/auth/ClientRegistry
 */

import * as crypto from 'crypto';
import type {
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  RegisteredClient,
} from './OAuthProxyTypes.js';

/**
 * Configuration options for the ClientRegistry.
 */
export interface ClientRegistryOptions {
  /** TTL for registered clients in milliseconds (default: 24 hours) */
  clientTtlMs?: number;
  /** Interval for cleanup of expired clients in milliseconds (default: 1 hour) */
  cleanupIntervalMs?: number;
  /** Whether client secrets expire (default: false for MCP clients) */
  secretsExpire?: boolean;
  /** TTL for client secrets if they expire (default: 0 = never) */
  secretTtlMs?: number;
}

/**
 * Default configuration values.
 */
const DEFAULT_OPTIONS: Required<ClientRegistryOptions> = {
  clientTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  secretsExpire: false,
  secretTtlMs: 0,
};

/**
 * In-memory registry for dynamically registered OAuth clients.
 *
 * Implements RFC 7591 Dynamic Client Registration for MCP clients.
 * Clients are stored with TTL and automatically cleaned up.
 *
 * @example
 * ```typescript
 * const registry = new ClientRegistry();
 *
 * // Register a new client
 * const response = registry.registerClient({
 *   redirect_uris: ['http://localhost:8080/callback'],
 *   client_name: 'Claude Code',
 *   grant_types: ['authorization_code'],
 *   response_types: ['code'],
 * });
 *
 * // Validate a client
 * const client = registry.getClient(response.client_id);
 * if (client && registry.validateClientSecret(client, providedSecret)) {
 *   // Client is valid
 * }
 * ```
 */
export class ClientRegistry {
  private clients: Map<string, RegisteredClient> = new Map();
  private options: Required<ClientRegistryOptions>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: ClientRegistryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startCleanupTimer();
  }

  /**
   * Registers a new OAuth client per RFC 7591.
   *
   * @param request - The client registration request
   * @returns The registration response with client_id and client_secret
   */
  registerClient(request: ClientRegistrationRequest): ClientRegistrationResponse {
    // Generate unique client ID
    const clientId = this.generateClientId();

    // Generate client secret
    const clientSecret = this.generateClientSecret();
    const clientSecretHash = this.hashSecret(clientSecret);

    const now = Date.now();

    // Determine secret expiration
    const secretExpiresAt = this.options.secretsExpire
      ? now + this.options.secretTtlMs
      : 0;

    // Apply defaults for grant types and response types
    const grantTypes = request.grant_types ?? ['authorization_code'];
    const responseTypes = request.response_types ?? ['code'];
    const tokenEndpointAuthMethod = request.token_endpoint_auth_method ?? 'client_secret_basic';

    // Create registered client record
    const client: RegisteredClient = {
      clientId,
      clientSecretHash,
      clientSecret, // Stored temporarily, cleared after response
      registeredAt: now,
      secretExpiresAt,
      redirectUris: request.redirect_uris,
      clientName: request.client_name,
      clientUri: request.client_uri,
      logoUri: request.logo_uri,
      grantTypes,
      responseTypes,
      tokenEndpointAuthMethod,
      scope: request.scope,
    };

    // Store client
    this.clients.set(clientId, client);

    console.log(`OAuth Proxy: Registered client ${clientId} (${request.client_name ?? 'unnamed'})`);

    // Build response per RFC 7591 section 3.2.1
    const response: ClientRegistrationResponse = {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(now / 1000),
      client_secret_expires_at: secretExpiresAt > 0 ? Math.floor(secretExpiresAt / 1000) : 0,
      redirect_uris: request.redirect_uris,
      client_name: request.client_name,
      client_uri: request.client_uri,
      logo_uri: request.logo_uri,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      scope: request.scope,
    };

    // Clear plain text secret from stored client (only hash is kept)
    client.clientSecret = undefined;

    return response;
  }

  /**
   * Gets a registered client by ID.
   *
   * @param clientId - The client ID to look up
   * @returns The registered client, or undefined if not found or expired
   */
  getClient(clientId: string): RegisteredClient | undefined {
    const client = this.clients.get(clientId);
    if (!client) {
      return undefined;
    }

    // Check if client has expired
    if (this.isClientExpired(client)) {
      this.clients.delete(clientId);
      return undefined;
    }

    return client;
  }

  /**
   * Validates a client secret against a registered client.
   *
   * @param client - The registered client
   * @param providedSecret - The secret to validate
   * @returns true if the secret is valid
   */
  validateClientSecret(client: RegisteredClient, providedSecret: string): boolean {
    if (!client.clientSecretHash) {
      // Public client (no secret required)
      return true;
    }

    // Check if secret has expired
    if (client.secretExpiresAt > 0 && Date.now() > client.secretExpiresAt) {
      return false;
    }

    const providedHash = this.hashSecret(providedSecret);
    return crypto.timingSafeEqual(
      Uint8Array.from(Buffer.from(client.clientSecretHash)),
      Uint8Array.from(Buffer.from(providedHash))
    );
  }

  /**
   * Validates that a redirect URI is allowed for a client.
   *
   * @param client - The registered client
   * @param redirectUri - The redirect URI to validate
   * @returns true if the redirect URI is allowed
   */
  validateRedirectUri(client: RegisteredClient, redirectUri: string): boolean {
    // Exact match required per RFC 6749 section 3.1.2.3
    return client.redirectUris.includes(redirectUri);
  }

  /**
   * Validates that a grant type is allowed for a client.
   *
   * @param client - The registered client
   * @param grantType - The grant type to validate
   * @returns true if the grant type is allowed
   */
  validateGrantType(client: RegisteredClient, grantType: string): boolean {
    return client.grantTypes.includes(grantType);
  }

  /**
   * Removes a client from the registry.
   *
   * @param clientId - The client ID to remove
   * @returns true if the client was removed
   */
  removeClient(clientId: string): boolean {
    const removed = this.clients.delete(clientId);
    if (removed) {
      console.log(`OAuth Proxy: Removed client ${clientId}`);
    }
    return removed;
  }

  /**
   * Gets the number of registered clients.
   */
  get size(): number {
    return this.clients.size;
  }

  /**
   * Stops the cleanup timer and clears all clients.
   * Call this when shutting down the server.
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clients.clear();
    console.log('OAuth Proxy: Client registry shut down');
  }

  /**
   * Generates a unique client ID.
   */
  private generateClientId(): string {
    // Format: mcp_{random_bytes}
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `mcp_${randomBytes}`;
  }

  /**
   * Generates a secure client secret.
   */
  private generateClientSecret(): string {
    // 32 bytes = 256 bits of entropy
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Hashes a client secret for storage.
   */
  private hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Checks if a client has expired based on TTL.
   */
  private isClientExpired(client: RegisteredClient): boolean {
    const expirationTime = client.registeredAt + this.options.clientTtlMs;
    return Date.now() > expirationTime;
  }

  /**
   * Starts the periodic cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredClients();
    }, this.options.cleanupIntervalMs);

    // Don't prevent process exit
    this.cleanupTimer.unref();
  }

  /**
   * Removes expired clients from the registry.
   */
  private cleanupExpiredClients(): void {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [clientId, client] of this.clients.entries()) {
      if (this.isClientExpired(client)) {
        this.clients.delete(clientId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`OAuth Proxy: Cleaned up ${cleanedCount} expired client(s)`);
    }
  }
}

/**
 * Singleton instance of the ClientRegistry.
 * Use this for the shared registry across the application.
 */
let registryInstance: ClientRegistry | null = null;

/**
 * Gets the singleton ClientRegistry instance.
 *
 * @param options - Options to use when creating the registry (only used on first call)
 * @returns The shared ClientRegistry instance
 */
export function getClientRegistry(options?: ClientRegistryOptions): ClientRegistry {
  if (!registryInstance) {
    registryInstance = new ClientRegistry(options);
  }
  return registryInstance;
}

/**
 * Resets the singleton registry (for testing).
 */
export function resetClientRegistry(): void {
  if (registryInstance) {
    registryInstance.shutdown();
    registryInstance = null;
  }
}
