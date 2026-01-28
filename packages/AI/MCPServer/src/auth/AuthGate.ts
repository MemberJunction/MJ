/**
 * @fileoverview AuthGate - Unified authentication middleware for MCP Server.
 *
 * AuthGate handles both API key and OAuth Bearer token authentication,
 * supporting all four auth modes: apiKey, oauth, both, none.
 *
 * The middleware:
 * - Extracts credentials from request headers
 * - Routes to appropriate validation (API key or OAuth)
 * - Creates MCPSessionContext with authenticated user
 * - Returns proper HTTP error responses with WWW-Authenticate headers
 *
 * @module @memberjunction/ai-mcp-server/auth/AuthGate
 */

import type { Request, Response } from 'express';
import type * as http from 'http';
import type { UserInfo } from '@memberjunction/core';
import type { MCPSessionContext, AuthMode, AuthResult } from './types.js';
import { getAuthMode, isOAuthEnabled } from './OAuthConfig.js';
import { validateBearerToken, resolveOAuthUser } from './TokenValidator.js';
import { send401Response, send403Response, send503Response } from './WWWAuthenticate.js';

/**
 * Credential extraction result from HTTP request.
 */
interface ExtractedCredentials {
  /** API key from x-api-key or x-mj-api-key header */
  apiKey?: string;
  /** Bearer token from Authorization header */
  bearerToken?: string;
  /** Source of API key if found */
  apiKeySource?: 'x-api-key' | 'x-mj-api-key' | 'authorization' | 'query';
}

/**
 * Configuration for the AuthGate middleware.
 */
export interface AuthGateConfig {
  /** Function to validate API keys (provided by Server.ts) */
  validateApiKey: (
    apiKey: string,
    request: Request | http.IncomingMessage
  ) => Promise<{
    valid: boolean;
    user?: UserInfo;
    apiKeyId?: string;
    apiKeyHash?: string;
    error?: string;
  }>;
  /** Function to get system user for 'none' mode */
  getSystemUser: () => UserInfo | undefined;
}

/**
 * Extracts credentials from an HTTP request.
 *
 * Checks the following sources in order:
 * 1. x-api-key header
 * 2. x-mj-api-key header
 * 3. Authorization: Bearer header (could be API key or OAuth token)
 * 4. Query parameters (apiKey, api_key)
 *
 * @param request - The incoming HTTP request
 * @returns Extracted credentials
 */
export function extractCredentials(request: Request | http.IncomingMessage): ExtractedCredentials {
  const result: ExtractedCredentials = {};

  // Check dedicated API key headers
  const xApiKey = request.headers['x-api-key'] as string | undefined;
  const xMjApiKey = request.headers['x-mj-api-key'] as string | undefined;

  if (xApiKey) {
    result.apiKey = xApiKey;
    result.apiKeySource = 'x-api-key';
  } else if (xMjApiKey) {
    result.apiKey = xMjApiKey;
    result.apiKeySource = 'x-mj-api-key';
  }

  // Check Authorization header
  const authHeader = request.headers['authorization'] as string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Determine if this is an API key or OAuth token
    // API keys start with "mj_sk_" prefix
    if (token.startsWith('mj_sk_') || token.startsWith('mj_pk_')) {
      // This is an MJ API key
      if (!result.apiKey) {
        result.apiKey = token;
        result.apiKeySource = 'authorization';
      }
    } else {
      // This is likely an OAuth Bearer token (JWT)
      result.bearerToken = token;
    }
  }

  // Check query parameters as fallback for API key
  if (!result.apiKey && request.url) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const queryKey = url.searchParams.get('apiKey') || url.searchParams.get('api_key');
      if (queryKey) {
        result.apiKey = queryKey;
        result.apiKeySource = 'query';
      }
    } catch {
      // URL parsing failed, skip query params
    }
  }

  return result;
}

/**
 * Authenticates a request using the configured auth mode.
 *
 * @param request - The incoming HTTP request
 * @param config - AuthGate configuration with validation functions
 * @returns Authentication result
 */
export async function authenticateRequest(
  request: Request | http.IncomingMessage,
  config: AuthGateConfig
): Promise<AuthResult> {
  const mode = getAuthMode();
  const credentials = extractCredentials(request);

  // Mode: none - skip authentication, use system user
  if (mode === 'none') {
    return handleNoneMode(config);
  }

  // Mode: both - try API key first (for backward compatibility), then OAuth
  if (mode === 'both') {
    return handleBothMode(credentials, request, config);
  }

  // Mode: apiKey - only accept API keys
  if (mode === 'apiKey') {
    return handleApiKeyMode(credentials, request, config);
  }

  // Mode: oauth - only accept OAuth tokens
  if (mode === 'oauth') {
    return handleOAuthMode(credentials);
  }

  // Should never reach here
  return {
    authenticated: false,
    method: 'none',
    error: {
      status: 401,
      code: 'invalid_mode',
      message: `Unknown auth mode: ${mode}`,
    },
  };
}

/**
 * Handles mode='none' - no authentication required.
 */
function handleNoneMode(config: AuthGateConfig): AuthResult {
  const systemUser = config.getSystemUser();
  if (!systemUser) {
    console.error('[AuthGate] mode=none but system user not available');
    return {
      authenticated: false,
      method: 'none',
      error: {
        status: 503,
        code: 'system_user_unavailable',
        message: 'System user not available',
      },
    };
  }

  console.log('[AuthGate] mode=none - using system user');
  return {
    authenticated: true,
    method: 'none',
    user: systemUser,
  };
}

/**
 * Handles mode='apiKey' - only API key authentication.
 */
async function handleApiKeyMode(
  credentials: ExtractedCredentials,
  request: Request | http.IncomingMessage,
  config: AuthGateConfig
): Promise<AuthResult> {
  if (!credentials.apiKey) {
    return {
      authenticated: false,
      method: 'apiKey',
      error: {
        status: 401,
        code: 'missing_credentials',
        message: 'API key required. Provide via x-api-key header.',
      },
    };
  }

  return validateApiKeyCredentials(credentials.apiKey, request, config);
}

/**
 * Handles mode='oauth' - only OAuth Bearer token authentication.
 */
async function handleOAuthMode(credentials: ExtractedCredentials): Promise<AuthResult> {
  if (!credentials.bearerToken) {
    return {
      authenticated: false,
      method: 'oauth',
      error: {
        status: 401,
        code: 'missing_credentials',
        message: 'OAuth Bearer token required.',
      },
    };
  }

  return validateOAuthCredentials(credentials.bearerToken);
}

/**
 * Handles mode='both' - accept either API key or OAuth token.
 * API key takes precedence for backward compatibility.
 */
async function handleBothMode(
  credentials: ExtractedCredentials,
  request: Request | http.IncomingMessage,
  config: AuthGateConfig
): Promise<AuthResult> {
  // API key takes precedence (backward compatibility)
  if (credentials.apiKey) {
    const result = await validateApiKeyCredentials(credentials.apiKey, request, config);
    if (result.authenticated) {
      return result;
    }
    // API key validation failed - try OAuth if available
    if (credentials.bearerToken) {
      console.log('[AuthGate] API key invalid, trying OAuth token');
      return validateOAuthCredentials(credentials.bearerToken);
    }
    return result; // Return API key error
  }

  // No API key - try OAuth
  if (credentials.bearerToken) {
    return validateOAuthCredentials(credentials.bearerToken);
  }

  // No credentials provided
  return {
    authenticated: false,
    method: 'oauth',
    error: {
      status: 401,
      code: 'missing_credentials',
      message: 'Authentication required. Provide API key or OAuth token.',
    },
  };
}

/**
 * Validates API key credentials.
 */
async function validateApiKeyCredentials(
  apiKey: string,
  request: Request | http.IncomingMessage,
  config: AuthGateConfig
): Promise<AuthResult> {
  try {
    const validation = await config.validateApiKey(apiKey, request);

    if (!validation.valid || !validation.user) {
      console.log('[AuthGate] API key validation failed:', validation.error);
      return {
        authenticated: false,
        method: 'apiKey',
        error: {
          status: 401,
          code: 'invalid_api_key',
          message: validation.error || 'Invalid API key',
        },
      };
    }

    console.log(`[AuthGate] Authenticated via API key: ${validation.user.Email}`);
    return {
      authenticated: true,
      method: 'apiKey',
      user: validation.user,
      apiKeyContext: {
        apiKey,
        apiKeyId: validation.apiKeyId!,
        apiKeyHash: validation.apiKeyHash!,
      },
    };
  } catch (error) {
    console.error('[AuthGate] API key validation error:', error);
    return {
      authenticated: false,
      method: 'apiKey',
      error: {
        status: 401,
        code: 'validation_error',
        message: error instanceof Error ? error.message : 'API key validation failed',
      },
    };
  }
}

/**
 * Validates OAuth Bearer token credentials.
 *
 * Audience validation uses the auth provider's configured audience
 * (auto-populated from environment variables like WEB_CLIENT_ID for Azure AD),
 * matching the same approach as MJExplorer.
 */
async function validateOAuthCredentials(token: string): Promise<AuthResult> {
  // Validate the token - audience is derived from the auth provider
  const validation = await validateBearerToken(token);

  if (!validation.valid || !validation.userInfo) {
    const errorCode = validation.error?.code || 'invalid_token';
    const errorMessage = validation.error?.message || 'Token validation failed';

    // Check for provider unavailable
    if (errorCode === 'provider_unavailable') {
      console.error('[AuthGate] OAuth provider unavailable');
      return {
        authenticated: false,
        method: 'oauth',
        error: {
          status: 503,
          code: errorCode,
          message: errorMessage,
        },
      };
    }

    console.log(`[AuthGate] OAuth token validation failed: ${errorCode} - ${errorMessage}`);
    return {
      authenticated: false,
      method: 'oauth',
      error: {
        status: 401,
        code: errorCode,
        message: errorMessage,
      },
    };
  }

  // Resolve user in MemberJunction
  const userResult = await resolveOAuthUser(validation.userInfo);

  if (userResult.error) {
    const is403 = userResult.error.code === 'user_not_found' || userResult.error.code === 'user_inactive';
    console.log(`[AuthGate] OAuth user resolution failed: ${userResult.error.message}`);
    return {
      authenticated: false,
      method: 'oauth',
      error: {
        status: is403 ? 403 : 401,
        code: userResult.error.code,
        message: userResult.error.message,
      },
    };
  }

  const payload = validation.payload!;
  console.log(`[AuthGate] Authenticated via OAuth: ${validation.userInfo.email} (issuer: ${payload.iss})`);

  return {
    authenticated: true,
    method: 'oauth',
    user: userResult.user!,
    oauthContext: {
      issuer: payload.iss!,
      subject: payload.sub!,
      email: validation.userInfo.email!,
      expiresAt: new Date((payload.exp || 0) * 1000),
    },
  };
}

/**
 * Converts an AuthResult to MCPSessionContext.
 * This maintains backward compatibility with existing Server.ts code.
 *
 * @param result - The authentication result
 * @returns MCPSessionContext for use with MCP handlers
 */
export function toSessionContext(result: AuthResult): MCPSessionContext {
  if (!result.authenticated || !result.user) {
    throw new Error('Cannot create session context from unauthenticated result');
  }

  // Map oauthContext.expiresAt to oauth.tokenExpiresAt for MCPSessionContext
  const oauth = result.oauthContext
    ? {
        issuer: result.oauthContext.issuer,
        subject: result.oauthContext.subject,
        email: result.oauthContext.email,
        tokenExpiresAt: result.oauthContext.expiresAt,
      }
    : undefined;

  return {
    user: result.user,
    authMethod: result.method,
    apiKey: result.apiKeyContext?.apiKey,
    apiKeyId: result.apiKeyContext?.apiKeyId,
    apiKeyHash: result.apiKeyContext?.apiKeyHash,
    oauth,
  };
}

/**
 * Sends an appropriate error response based on the AuthResult.
 *
 * @param res - Express response object
 * @param result - The authentication result containing error details
 */
export function sendAuthErrorResponse(res: Response, result: AuthResult): void {
  if (result.authenticated) {
    throw new Error('Cannot send error response for authenticated result');
  }

  const error = result.error!;

  if (error.status === 503) {
    send503Response(res, error.message);
  } else if (error.status === 403) {
    send403Response(res, error.message, error.message);
  } else {
    // 401 Unauthorized
    const options = isOAuthEnabled() ? {} : { resourceMetadataUrl: undefined };
    send401Response(res, error.message, options);
  }
}
