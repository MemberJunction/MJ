/**
 * @fileoverview Authorization State Manager for OAuth Proxy
 *
 * Manages temporary state during OAuth authorization flows, including:
 * - State parameter mapping between MCP client and upstream provider
 * - PKCE code challenge storage
 * - Authorization code storage after upstream callback
 *
 * @module @memberjunction/ai-mcp-server/auth/AuthorizationStateManager
 */

import * as crypto from 'crypto';
import type {
  AuthorizationState,
  StoredAuthorizationCode,
  TokenResponse,
} from './OAuthProxyTypes.js';

/**
 * Configuration options for the AuthorizationStateManager.
 */
export interface AuthorizationStateManagerOptions {
  /** TTL for authorization states in milliseconds (default: 10 minutes) */
  stateTtlMs?: number;
  /** TTL for authorization codes in milliseconds (default: 5 minutes) */
  codeTtlMs?: number;
  /** Interval for cleanup of expired items in milliseconds (default: 1 minute) */
  cleanupIntervalMs?: number;
}

/**
 * Default configuration values.
 */
const DEFAULT_OPTIONS: Required<AuthorizationStateManagerOptions> = {
  stateTtlMs: 10 * 60 * 1000, // 10 minutes
  codeTtlMs: 5 * 60 * 1000, // 5 minutes (OAuth spec recommends short-lived)
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

/**
 * Manages authorization state and codes for the OAuth proxy flow.
 *
 * Flow:
 * 1. MCP client calls /oauth/authorize with state and code_challenge
 * 2. We store the state mapping and redirect to upstream provider
 * 3. Upstream provider calls /oauth/callback with its own state
 * 4. We look up the original state, exchange upstream code for tokens
 * 5. We generate our own authorization code and store it with the tokens
 * 6. We redirect to MCP client with our authorization code
 * 7. MCP client calls /oauth/token with our code and code_verifier
 * 8. We validate PKCE and return the upstream tokens
 *
 * @example
 * ```typescript
 * const stateManager = new AuthorizationStateManager();
 *
 * // Store state when starting authorization
 * const proxyState = stateManager.createState({
 *   clientId: 'mcp_abc123',
 *   redirectUri: 'http://localhost:8080/callback',
 *   originalState: 'client-provided-state',
 *   codeChallenge: 'abc...',
 *   codeChallengeMethod: 'S256',
 * });
 *
 * // Later, retrieve state when upstream calls back
 * const state = stateManager.getState(proxyState);
 *
 * // Store authorization code after upstream token exchange
 * const code = stateManager.createAuthorizationCode({
 *   clientId: state.clientId,
 *   redirectUri: state.redirectUri,
 *   codeChallenge: state.codeChallenge,
 *   codeChallengeMethod: state.codeChallengeMethod,
 *   upstreamTokens: { access_token: '...', token_type: 'Bearer' },
 * });
 *
 * // Retrieve code when MCP client exchanges it
 * const storedCode = stateManager.getAuthorizationCode(code);
 * ```
 */
export class AuthorizationStateManager {
  private states: Map<string, AuthorizationState> = new Map();
  private codes: Map<string, StoredAuthorizationCode> = new Map();
  private options: Required<AuthorizationStateManagerOptions>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: AuthorizationStateManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startCleanupTimer();
  }

  /**
   * Creates and stores a new authorization state.
   *
   * @param params - The state parameters
   * @returns The generated state string to use with the upstream provider
   */
  createState(params: Omit<AuthorizationState, 'createdAt'>): string {
    const proxyState = this.generateStateString();
    const now = Date.now();

    const state: AuthorizationState = {
      ...params,
      createdAt: now,
    };

    this.states.set(proxyState, state);

    console.log(`OAuth Proxy: Created state ${proxyState.substring(0, 8)}... for client ${params.clientId}`);

    return proxyState;
  }

  /**
   * Retrieves and removes an authorization state.
   *
   * States are single-use and removed on retrieval to prevent replay.
   *
   * @param proxyState - The state string
   * @returns The authorization state, or undefined if not found/expired
   */
  getState(proxyState: string): AuthorizationState | undefined {
    const state = this.states.get(proxyState);
    if (!state) {
      return undefined;
    }

    // Remove state (single-use)
    this.states.delete(proxyState);

    // Check if expired
    if (this.isStateExpired(state)) {
      return undefined;
    }

    return state;
  }

  /**
   * Creates and stores an authorization code.
   *
   * @param params - The code parameters (excluding code, createdAt, expiresAt)
   * @returns The generated authorization code
   */
  createAuthorizationCode(
    params: Omit<StoredAuthorizationCode, 'code' | 'createdAt' | 'expiresAt'>
  ): string {
    const code = this.generateAuthorizationCode();
    const now = Date.now();

    const storedCode: StoredAuthorizationCode = {
      ...params,
      code,
      createdAt: now,
      expiresAt: now + this.options.codeTtlMs,
    };

    this.codes.set(code, storedCode);

    console.log(`OAuth Proxy: Created authorization code ${code.substring(0, 8)}... for client ${params.clientId}`);

    return code;
  }

  /**
   * Retrieves and removes an authorization code.
   *
   * Codes are single-use and removed on retrieval to prevent replay.
   *
   * @param code - The authorization code
   * @returns The stored code data, or undefined if not found/expired
   */
  getAuthorizationCode(code: string): StoredAuthorizationCode | undefined {
    const storedCode = this.codes.get(code);
    if (!storedCode) {
      return undefined;
    }

    // Remove code (single-use per OAuth spec)
    this.codes.delete(code);

    // Check if expired
    if (Date.now() > storedCode.expiresAt) {
      return undefined;
    }

    return storedCode;
  }

  /**
   * Validates a PKCE code verifier against a stored code challenge.
   *
   * @param codeVerifier - The verifier provided by the client
   * @param codeChallenge - The challenge stored during authorization
   * @param method - The challenge method (S256 or plain)
   * @returns true if the verifier is valid
   */
  validatePKCE(
    codeVerifier: string,
    codeChallenge: string,
    method: string = 'S256'
  ): boolean {
    if (method === 'plain') {
      // Not recommended but supported for compatibility
      return codeVerifier === codeChallenge;
    }

    if (method === 'S256') {
      // SHA256(verifier) base64url encoded must equal challenge
      const computedChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      return computedChallenge === codeChallenge;
    }

    // Unknown method
    return false;
  }

  /**
   * Gets the number of active states.
   */
  get stateCount(): number {
    return this.states.size;
  }

  /**
   * Gets the number of active authorization codes.
   */
  get codeCount(): number {
    return this.codes.size;
  }

  /**
   * Stops the cleanup timer and clears all data.
   * Call this when shutting down the server.
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.states.clear();
    this.codes.clear();
    console.log('OAuth Proxy: Authorization state manager shut down');
  }

  /**
   * Generates a cryptographically secure state string.
   */
  private generateStateString(): string {
    // 32 bytes = 256 bits of entropy
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generates a cryptographically secure authorization code.
   */
  private generateAuthorizationCode(): string {
    // 32 bytes = 256 bits of entropy
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Checks if a state has expired.
   */
  private isStateExpired(state: AuthorizationState): boolean {
    const expirationTime = state.createdAt + this.options.stateTtlMs;
    return Date.now() > expirationTime;
  }

  /**
   * Starts the periodic cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.options.cleanupIntervalMs);

    // Don't prevent process exit
    this.cleanupTimer.unref();
  }

  /**
   * Removes expired states and codes.
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let statesRemoved = 0;
    let codesRemoved = 0;

    // Cleanup expired states
    for (const [key, state] of this.states.entries()) {
      if (this.isStateExpired(state)) {
        this.states.delete(key);
        statesRemoved++;
      }
    }

    // Cleanup expired codes
    for (const [key, code] of this.codes.entries()) {
      if (now > code.expiresAt) {
        this.codes.delete(key);
        codesRemoved++;
      }
    }

    if (statesRemoved > 0 || codesRemoved > 0) {
      console.log(
        `OAuth Proxy: Cleaned up ${statesRemoved} expired state(s), ${codesRemoved} expired code(s)`
      );
    }
  }
}

/**
 * Singleton instance of the AuthorizationStateManager.
 */
let stateManagerInstance: AuthorizationStateManager | null = null;

/**
 * Gets the singleton AuthorizationStateManager instance.
 *
 * @param options - Options to use when creating the manager (only used on first call)
 * @returns The shared AuthorizationStateManager instance
 */
export function getAuthorizationStateManager(
  options?: AuthorizationStateManagerOptions
): AuthorizationStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new AuthorizationStateManager(options);
  }
  return stateManagerInstance;
}

/**
 * Resets the singleton state manager (for testing).
 */
export function resetAuthorizationStateManager(): void {
  if (stateManagerInstance) {
    stateManagerInstance.shutdown();
    stateManagerInstance = null;
  }
}
