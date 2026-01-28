/**
 * @fileoverview OAuth Proxy Router for MCP Server
 *
 * Implements the OAuth 2.0 Authorization Server proxy endpoints:
 * - GET  /.well-known/oauth-authorization-server - Authorization Server Metadata
 * - POST /oauth/register - Dynamic Client Registration (RFC 7591)
 * - GET  /oauth/authorize - Authorization endpoint (proxies to upstream)
 * - GET  /oauth/callback - Callback from upstream provider
 * - POST /oauth/token - Token endpoint
 *
 * @module @memberjunction/ai-mcp-server/auth/OAuthProxyRouter
 */

import { Router, Request, Response, urlencoded, json } from 'express';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  buildAuthorizationServerMetadata,
  type AuthorizationServerMetadataOptions,
} from './AuthorizationServerMetadataBuilder.js';
import { getClientRegistry, type ClientRegistry } from './ClientRegistry.js';
import {
  getAuthorizationStateManager,
  type AuthorizationStateManager,
} from './AuthorizationStateManager.js';
import { createJWTIssuer, type JWTIssuer } from './JWTIssuer.js';
import { loadActiveScopes, getDefaultScopes } from './ScopeService.js';
import { renderConsentPage, renderConsentDeniedPage } from './ConsentPage.js';
import { renderLoginPage, renderErrorPage } from './LoginPage.js';
import type { APIScopeInfo } from './types.js';
import type {
  ClientRegistrationRequest,
  OAuthProxyConfig,
  TokenRequest,
  TokenResponse,
  TokenErrorResponse,
  StoredAuthorizationCode,
} from './OAuthProxyTypes.js';

/**
 * Generates a PKCE code verifier (high entropy random string).
 */
function generateCodeVerifier(): string {
  // 32 bytes = 256 bits of entropy, base64url encoded = 43 chars
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generates a PKCE code challenge from a verifier using S256 method.
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Creates the OAuth Proxy router with all endpoints.
 *
 * @param config - OAuth proxy configuration
 * @returns Express router with OAuth proxy endpoints
 *
 * @example
 * ```typescript
 * const oauthRouter = createOAuthProxyRouter({
 *   baseUrl: 'http://localhost:3100',
 *   upstream: {
 *     authorizationEndpoint: 'https://login.microsoftonline.com/.../oauth2/v2.0/authorize',
 *     tokenEndpoint: 'https://login.microsoftonline.com/.../oauth2/v2.0/token',
 *     clientId: 'your-azure-app-client-id',
 *     clientSecret: 'your-azure-app-client-secret',
 *     scopes: ['openid', 'profile', 'email'],
 *   },
 *   enableDynamicRegistration: true,
 * });
 *
 * app.use(oauthRouter);
 * ```
 */
export function createOAuthProxyRouter(config: OAuthProxyConfig): Router {
  const router = Router();
  const clientRegistry = getClientRegistry();
  const stateManager = getAuthorizationStateManager({ stateTtlMs: config.stateTtlMs });

  // Initialize JWT issuer if configured
  let jwtIssuer: JWTIssuer | undefined;
  if (config.jwt?.signingSecret) {
    jwtIssuer = createJWTIssuer({
      signingSecret: config.jwt.signingSecret,
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.baseUrl,
    });
    console.log(`[OAuth Proxy] JWT issuer configured (issuer: ${config.jwt.issuer})`);
  } else {
    console.log('[OAuth Proxy] JWT signing not configured - passing through upstream tokens');
  }

  // Parse URL-encoded bodies for token endpoint
  router.use(urlencoded({ extended: true }));
  router.use(json());

  // Authorization Server Metadata (RFC 8414)
  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    handleMetadataEndpoint(req, res, config);
  });

  // Dynamic Client Registration (RFC 7591)
  if (config.enableDynamicRegistration) {
    router.post('/oauth/register', (req: Request, res: Response) => {
      handleRegistrationEndpoint(req, res, clientRegistry);
    });
  }

  // Authorization Endpoint
  router.get('/oauth/authorize', (req: Request, res: Response) => {
    handleAuthorizeEndpoint(req, res, config, clientRegistry, stateManager);
  });

  // Callback from upstream provider
  router.get('/oauth/callback', (req: Request, res: Response) => {
    handleCallbackEndpoint(req, res, config, stateManager, jwtIssuer);
  });

  // Token Endpoint
  router.post('/oauth/token', (req: Request, res: Response) => {
    handleTokenEndpoint(req, res, config, clientRegistry, stateManager, jwtIssuer);
  });

  // Scopes Endpoint - returns available scopes
  router.get('/oauth/scopes', (req: Request, res: Response) => {
    handleScopesEndpoint(req, res);
  });

  // Login Endpoint - shows login page with provider selection
  router.get('/oauth/login', (req: Request, res: Response) => {
    handleLoginEndpoint(req, res, config);
  });

  // Consent Endpoints (only enabled if consent screen is configured)
  if (config.enableConsentScreen) {
    router.get('/oauth/consent', (req: Request, res: Response) => {
      handleGetConsentEndpoint(req, res, stateManager);
    });

    router.post('/oauth/consent', (req: Request, res: Response) => {
      handlePostConsentEndpoint(req, res, config, stateManager, jwtIssuer);
    });

    console.log('[OAuth Proxy] Consent screen enabled');
  }

  return router;
}

/**
 * Handles the Authorization Server Metadata endpoint.
 */
function handleMetadataEndpoint(
  req: Request,
  res: Response,
  config: OAuthProxyConfig
): void {
  const options: AuthorizationServerMetadataOptions = {
    baseUrl: config.baseUrl,
    scopes: config.upstream.scopes,
  };

  const metadata = buildAuthorizationServerMetadata(options);
  res.json(metadata);
}

/**
 * Handles the Dynamic Client Registration endpoint.
 */
function handleRegistrationEndpoint(
  req: Request,
  res: Response,
  clientRegistry: ClientRegistry
): void {
  try {
    const request = req.body as ClientRegistrationRequest;

    // Validate required fields
    if (!request.redirect_uris || request.redirect_uris.length === 0) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris is required',
      });
      return;
    }

    // Validate redirect URIs
    for (const uri of request.redirect_uris) {
      if (!isValidRedirectUri(uri)) {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: `Invalid redirect URI: ${uri}`,
        });
        return;
      }
    }

    const response = clientRegistry.registerClient(request);
    res.status(201).json(response);
  } catch (error) {
    console.error('OAuth Proxy: Registration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client',
    });
  }
}

/**
 * Handles the Authorization endpoint.
 * Validates the request and redirects to the upstream provider.
 */
function handleAuthorizeEndpoint(
  req: Request,
  res: Response,
  config: OAuthProxyConfig,
  clientRegistry: ClientRegistry,
  stateManager: AuthorizationStateManager
): void {
  const {
    client_id,
    redirect_uri,
    response_type,
    state,
    scope,
    code_challenge,
    code_challenge_method,
    nonce,
  } = req.query as Record<string, string | undefined>;

  // Validate required parameters
  if (!client_id) {
    sendAuthorizationError(res, redirect_uri, 'invalid_request', 'client_id is required', state);
    return;
  }

  if (!redirect_uri) {
    // Cannot redirect if no redirect_uri - show error page
    sendErrorPage(res, 'Invalid Request', 'redirect_uri is required');
    return;
  }

  if (response_type !== 'code') {
    sendAuthorizationError(res, redirect_uri, 'unsupported_response_type', 'Only code response type is supported', state);
    return;
  }

  // Validate client
  const client = clientRegistry.getClient(client_id);
  if (!client) {
    sendAuthorizationError(res, redirect_uri, 'invalid_client', 'Unknown client_id', state);
    return;
  }

  // Validate redirect URI
  if (!clientRegistry.validateRedirectUri(client, redirect_uri)) {
    sendAuthorizationError(res, redirect_uri, 'invalid_request', 'redirect_uri not registered for this client', state);
    return;
  }

  // OAuth 2.1 requires PKCE
  if (!code_challenge) {
    sendAuthorizationError(res, redirect_uri, 'invalid_request', 'code_challenge is required (PKCE)', state);
    return;
  }

  if (code_challenge_method && code_challenge_method !== 'S256') {
    sendAuthorizationError(res, redirect_uri, 'invalid_request', 'Only S256 code_challenge_method is supported', state);
    return;
  }

  // Generate PKCE for the upstream provider (Azure AD requires PKCE)
  const upstreamCodeVerifier = generateCodeVerifier();
  const upstreamCodeChallenge = generateCodeChallenge(upstreamCodeVerifier);

  // Create state for tracking this authorization flow
  const proxyState = stateManager.createState({
    clientId: client_id,
    redirectUri: redirect_uri,
    originalState: state,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method ?? 'S256',
    scope: scope,
    nonce: nonce,
    upstreamCodeVerifier, // Store verifier for token exchange
  });

  // Build upstream authorization URL
  const upstreamUrl = new URL(config.upstream.authorizationEndpoint);
  upstreamUrl.searchParams.set('client_id', config.upstream.clientId);
  upstreamUrl.searchParams.set('redirect_uri', `${config.baseUrl}/oauth/callback`);
  upstreamUrl.searchParams.set('response_type', 'code');
  upstreamUrl.searchParams.set('state', proxyState);

  // Use upstream scopes
  const upstreamScopes = config.upstream.scopes.join(' ');
  upstreamUrl.searchParams.set('scope', upstreamScopes);

  // Add PKCE challenge for upstream provider (required by Azure AD)
  upstreamUrl.searchParams.set('code_challenge', upstreamCodeChallenge);
  upstreamUrl.searchParams.set('code_challenge_method', 'S256');

  // Pass through nonce for OIDC
  if (nonce) {
    upstreamUrl.searchParams.set('nonce', nonce);
  }

  console.log(`OAuth Proxy: Redirecting client ${client_id} to upstream provider`);

  // Redirect to upstream provider
  res.redirect(upstreamUrl.toString());
}

/**
 * Handles the callback from the upstream provider.
 */
async function handleCallbackEndpoint(
  req: Request,
  res: Response,
  config: OAuthProxyConfig,
  stateManager: AuthorizationStateManager,
  jwtIssuer?: JWTIssuer
): Promise<void> {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  // Handle errors from upstream
  if (error) {
    console.error(`OAuth Proxy: Upstream error: ${error} - ${error_description}`);
    sendErrorPage(res, 'Authentication Failed', error_description ?? error);
    return;
  }

  if (!state) {
    sendErrorPage(res, 'Invalid Callback', 'Missing state parameter');
    return;
  }

  // Look up the original state
  const authState = stateManager.getState(state);
  if (!authState) {
    // Session expired - show error page with guidance
    const html = renderErrorPage({
      title: 'Session Expired',
      message: 'The authentication session has expired. This can happen if you took too long to sign in. Please start the authorization process again from your application.',
      showRetry: false, // Can't retry without original state
    });
    res.status(400).type('html').send(html);
    return;
  }

  if (!code) {
    sendAuthorizationError(res, authState.redirectUri, 'server_error', 'No authorization code received from provider', authState.originalState);
    return;
  }

  try {
    // Exchange upstream code for tokens (include PKCE verifier)
    const upstreamTokens = await exchangeUpstreamCode(code, config, authState.upstreamCodeVerifier);

    // If JWT signing is enabled, validate user and prepare for proxy JWT
    let validatedUser: StoredAuthorizationCode['validatedUser'];
    if (jwtIssuer) {
      const userValidation = await validateUpstreamUser(upstreamTokens, config);
      if (!userValidation.valid) {
        console.error(`OAuth Proxy: User validation failed: ${userValidation.error}`);
        sendErrorPage(res, 'Access Denied', userValidation.error ?? 'User not authorized');
        return;
      }
      validatedUser = userValidation.user;
      console.log(`OAuth Proxy: User validated: ${validatedUser?.email}`);
    }

    // Generate our own authorization code for the MCP client
    const ourCode = stateManager.createAuthorizationCode({
      clientId: authState.clientId,
      redirectUri: authState.redirectUri,
      scope: authState.scope,
      codeChallenge: authState.codeChallenge,
      codeChallengeMethod: authState.codeChallengeMethod,
      upstreamTokens,
      validatedUser,
    });

    // Redirect to MCP client with our code
    const redirectUrl = new URL(authState.redirectUri);
    redirectUrl.searchParams.set('code', ourCode);
    if (authState.originalState) {
      redirectUrl.searchParams.set('state', authState.originalState);
    }

    console.log(`OAuth Proxy: Redirecting to MCP client with authorization code`);
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('OAuth Proxy: Token exchange error:', error);
    sendAuthorizationError(res, authState.redirectUri, 'server_error', 'Failed to exchange authorization code', authState.originalState);
  }
}

/**
 * Handles the Token endpoint.
 */
async function handleTokenEndpoint(
  req: Request,
  res: Response,
  config: OAuthProxyConfig,
  clientRegistry: ClientRegistry,
  stateManager: AuthorizationStateManager,
  jwtIssuer?: JWTIssuer
): Promise<void> {
  const tokenRequest = req.body as TokenRequest;

  // Extract client credentials from Authorization header or body
  const { clientId, clientSecret } = extractClientCredentials(req, tokenRequest);

  if (!clientId) {
    sendTokenError(res, 'invalid_client', 'client_id is required');
    return;
  }

  // Validate client
  const client = clientRegistry.getClient(clientId);
  if (!client) {
    sendTokenError(res, 'invalid_client', 'Unknown client');
    return;
  }

  // Validate client secret if required
  if (client.clientSecretHash && !clientRegistry.validateClientSecret(client, clientSecret ?? '')) {
    sendTokenError(res, 'invalid_client', 'Invalid client credentials');
    return;
  }

  // Handle different grant types
  if (tokenRequest.grant_type === 'authorization_code') {
    await handleAuthorizationCodeGrant(req, res, tokenRequest, client, clientRegistry, stateManager, jwtIssuer);
  } else if (tokenRequest.grant_type === 'refresh_token') {
    await handleRefreshTokenGrant(req, res, tokenRequest, config, jwtIssuer);
  } else {
    sendTokenError(res, 'unsupported_grant_type', 'Grant type not supported');
  }
}

/**
 * Handles the authorization_code grant type.
 */
async function handleAuthorizationCodeGrant(
  req: Request,
  res: Response,
  tokenRequest: TokenRequest,
  client: { clientId: string; redirectUris: string[] },
  clientRegistry: ClientRegistry,
  stateManager: AuthorizationStateManager,
  jwtIssuer?: JWTIssuer
): Promise<void> {
  const { code, redirect_uri, code_verifier } = tokenRequest;

  if (!code) {
    sendTokenError(res, 'invalid_request', 'code is required');
    return;
  }

  if (!redirect_uri) {
    sendTokenError(res, 'invalid_request', 'redirect_uri is required');
    return;
  }

  // Look up the stored authorization code
  const storedCode = stateManager.getAuthorizationCode(code);
  if (!storedCode) {
    sendTokenError(res, 'invalid_grant', 'Invalid or expired authorization code');
    return;
  }

  // Validate client_id matches
  if (storedCode.clientId !== client.clientId) {
    sendTokenError(res, 'invalid_grant', 'Authorization code was not issued to this client');
    return;
  }

  // Validate redirect_uri matches
  if (storedCode.redirectUri !== redirect_uri) {
    sendTokenError(res, 'invalid_grant', 'redirect_uri does not match');
    return;
  }

  // Validate PKCE
  if (storedCode.codeChallenge) {
    if (!code_verifier) {
      sendTokenError(res, 'invalid_request', 'code_verifier is required');
      return;
    }

    const pkceValid = stateManager.validatePKCE(
      code_verifier,
      storedCode.codeChallenge,
      storedCode.codeChallengeMethod ?? 'S256'
    );

    if (!pkceValid) {
      sendTokenError(res, 'invalid_grant', 'PKCE validation failed');
      return;
    }
  }

  const upstreamTokens = storedCode.upstreamTokens;

  // If JWT issuer is configured and we have validated user info, issue proxy JWT
  if (jwtIssuer && storedCode.validatedUser) {
    const { validatedUser } = storedCode;
    const scopes = storedCode.scope?.split(' ') ?? ['openid', 'profile', 'email'];

    const result = jwtIssuer.sign({
      email: validatedUser.email,
      mjUserId: validatedUser.mjUserId,
      scopes,
      upstreamProvider: validatedUser.upstreamProvider,
      upstreamSub: validatedUser.upstreamSub,
    });

    const response: TokenResponse = {
      access_token: result.token,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      scope: storedCode.scope ?? scopes.join(' '),
      // Include refresh token from upstream if available
      refresh_token: upstreamTokens.refresh_token,
    };

    console.log(`OAuth Proxy: Issued proxy JWT to client ${client.clientId} for user ${validatedUser.email}`);
    res.json(response);
    return;
  }

  // Fallback: pass through upstream tokens if JWT signing not configured
  // When upstream provider issues tokens for a different audience (e.g., Microsoft Graph),
  // we should use the ID token instead, which always has the correct audience (app's client ID)
  // and contains user identity claims for authentication purposes.
  let tokenForMcpAuth = upstreamTokens.access_token;

  // Check if we should use ID token instead of access token
  // ID tokens are designed for authentication (proving identity to the client app)
  // Access tokens are designed for authorization (accessing APIs)
  if (upstreamTokens.id_token) {
    // Use ID token for MCP authentication - it has the correct audience
    tokenForMcpAuth = upstreamTokens.id_token;
  }

  // Return the upstream tokens to the MCP client
  const response: TokenResponse = {
    access_token: tokenForMcpAuth,
    token_type: upstreamTokens.token_type,
    expires_in: upstreamTokens.expires_in,
    refresh_token: upstreamTokens.refresh_token,
    scope: storedCode.scope ?? upstreamTokens.scope,
  };

  // Also include the original id_token if present (for clients that need it)
  if (upstreamTokens.id_token) {
    response.id_token = upstreamTokens.id_token;
  }

  console.log(`OAuth Proxy: Issued upstream tokens to client ${client.clientId}`);
  res.json(response);
}

/**
 * Handles the refresh_token grant type.
 */
async function handleRefreshTokenGrant(
  req: Request,
  res: Response,
  tokenRequest: TokenRequest,
  config: OAuthProxyConfig,
  jwtIssuer?: JWTIssuer
): Promise<void> {
  const { refresh_token } = tokenRequest;

  if (!refresh_token) {
    sendTokenError(res, 'invalid_request', 'refresh_token is required');
    return;
  }

  try {
    // Exchange refresh token with upstream provider
    const upstreamTokens = await refreshUpstreamToken(refresh_token, config);

    // If JWT issuer is configured, validate user and issue new proxy JWT
    if (jwtIssuer) {
      const userValidation = await validateUpstreamUser(upstreamTokens, config);
      if (userValidation.valid && userValidation.user) {
        const { user } = userValidation;
        const scopes = upstreamTokens.scope?.split(' ') ?? ['openid', 'profile', 'email'];

        const result = jwtIssuer.sign({
          email: user.email,
          mjUserId: user.mjUserId,
          scopes,
          upstreamProvider: user.upstreamProvider,
          upstreamSub: user.upstreamSub,
        });

        const response: TokenResponse = {
          access_token: result.token,
          token_type: 'Bearer',
          expires_in: result.expiresIn,
          scope: scopes.join(' '),
          refresh_token: upstreamTokens.refresh_token,
        };

        console.log(`OAuth Proxy: Issued refreshed proxy JWT for user ${user.email}`);
        res.json(response);
        return;
      }
      // If user validation fails during refresh, fall through to upstream token passthrough
      console.warn('OAuth Proxy: User validation failed during refresh, falling back to upstream tokens');
    }

    // Fallback: pass through upstream tokens
    let tokenForMcpAuth = upstreamTokens.access_token;
    if (upstreamTokens.id_token) {
      tokenForMcpAuth = upstreamTokens.id_token;
    }

    const response: TokenResponse = {
      access_token: tokenForMcpAuth,
      token_type: upstreamTokens.token_type,
      expires_in: upstreamTokens.expires_in,
      refresh_token: upstreamTokens.refresh_token,
      scope: upstreamTokens.scope,
    };

    if (upstreamTokens.id_token) {
      response.id_token = upstreamTokens.id_token;
    }

    res.json(response);
  } catch (error) {
    console.error('OAuth Proxy: Refresh token error:', error);
    sendTokenError(res, 'invalid_grant', 'Failed to refresh token');
  }
}

/**
 * Exchanges an authorization code with the upstream provider.
 */
async function exchangeUpstreamCode(
  code: string,
  config: OAuthProxyConfig,
  codeVerifier?: string
): Promise<TokenResponse> {
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', `${config.baseUrl}/oauth/callback`);
  params.set('client_id', config.upstream.clientId);

  if (config.upstream.clientSecret) {
    params.set('client_secret', config.upstream.clientSecret);
  }

  // Include PKCE verifier if provided (required by Azure AD)
  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const response = await fetch(config.upstream.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`OAuth Proxy: Upstream token error: ${response.status}`);
    console.error(`OAuth Proxy: Error details: ${errorBody}`);
    console.error(`OAuth Proxy: Request redirect_uri: ${config.baseUrl}/oauth/callback`);
    console.error(`OAuth Proxy: Request client_id: ${config.upstream.clientId}`);

    // Parse and log the specific Azure AD error
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error_description) {
        console.error(`OAuth Proxy: Azure AD error: ${errorJson.error} - ${errorJson.error_description}`);
      }
    } catch {
      // Not JSON, already logged the raw body
    }

    throw new Error(`Upstream token exchange failed: ${response.status}`);
  }

  return await response.json() as TokenResponse;
}

/**
 * Refreshes a token with the upstream provider.
 */
async function refreshUpstreamToken(
  refreshToken: string,
  config: OAuthProxyConfig
): Promise<TokenResponse> {
  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);
  params.set('client_id', config.upstream.clientId);

  if (config.upstream.clientSecret) {
    params.set('client_secret', config.upstream.clientSecret);
  }

  const response = await fetch(config.upstream.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`OAuth Proxy: Upstream refresh error: ${response.status} - ${errorBody}`);
    throw new Error(`Upstream token refresh failed: ${response.status}`);
  }

  return await response.json() as TokenResponse;
}

/**
 * User validation result from upstream tokens.
 */
interface UserValidationResult {
  valid: boolean;
  error?: string;
  user?: {
    mjUserId: string;
    email: string;
    upstreamProvider: string;
    upstreamSub: string;
  };
}

/**
 * Validates user from upstream tokens by extracting email and looking up MJ user.
 * This is only called when JWT signing is enabled.
 */
async function validateUpstreamUser(
  upstreamTokens: TokenResponse,
  config: OAuthProxyConfig
): Promise<UserValidationResult> {
  try {
    // Decode the ID token or access token to get user info
    // ID token is preferred as it contains identity claims
    const tokenToDecode = upstreamTokens.id_token ?? upstreamTokens.access_token;
    if (!tokenToDecode) {
      return { valid: false, error: 'No token available for user extraction' };
    }

    // Decode without verification - we already exchanged with upstream provider
    const decoded = jwt.decode(tokenToDecode) as {
      sub?: string;
      email?: string;
      preferred_username?: string;
      unique_name?: string;
      upn?: string;
    } | null;

    if (!decoded) {
      return { valid: false, error: 'Failed to decode upstream token' };
    }

    // Extract email from various claim locations
    const email = decoded.email
      ?? decoded.preferred_username
      ?? decoded.unique_name
      ?? decoded.upn;

    if (!email) {
      console.error('OAuth Proxy: Token claims:', JSON.stringify(decoded, null, 2));
      return { valid: false, error: 'No email claim found in upstream token' };
    }

    // Extract upstream subject
    const upstreamSub = decoded.sub ?? email;
    const upstreamProvider = config.upstream.providerName ?? 'upstream';

    // Look up MemberJunction user by email
    const mjUser = await lookupMJUser(email);
    if (!mjUser) {
      return { valid: false, error: `User not found in MemberJunction: ${email}` };
    }

    return {
      valid: true,
      user: {
        mjUserId: mjUser.ID,
        email,
        upstreamProvider,
        upstreamSub,
      },
    };
  } catch (error) {
    console.error('OAuth Proxy: User validation error:', error);
    return { valid: false, error: 'Failed to validate user' };
  }
}

/**
 * Looks up a MemberJunction user by email.
 * Uses the MJServer auth provider infrastructure if available.
 */
async function lookupMJUser(email: string): Promise<{ ID: string; Email: string } | null> {
  try {
    // Try to use the MJServer verifyUserRecord function
    const { verifyUserRecord } = await import('@memberjunction/server');
    const user = await verifyUserRecord(email);
    if (user) {
      return { ID: user.ID, Email: user.Email };
    }
    return null;
  } catch (error) {
    console.error('OAuth Proxy: Failed to lookup user:', error);
    return null;
  }
}

/**
 * Extracts client credentials from request.
 */
function extractClientCredentials(
  req: Request,
  tokenRequest: TokenRequest
): { clientId: string | undefined; clientSecret: string | undefined } {
  // Check Authorization header first (Basic auth)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [clientId, clientSecret] = credentials.split(':');
    return { clientId, clientSecret };
  }

  // Fall back to request body
  return {
    clientId: tokenRequest.client_id,
    clientSecret: tokenRequest.client_secret,
  };
}

/**
 * Validates a redirect URI.
 */
function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Allow http for localhost (development)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }
    // Require https for all other hosts
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sends an OAuth authorization error redirect.
 */
function sendAuthorizationError(
  res: Response,
  redirectUri: string | undefined,
  error: string,
  errorDescription: string,
  state: string | undefined
): void {
  if (!redirectUri) {
    sendErrorPage(res, 'Authorization Error', errorDescription);
    return;
  }

  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);
  if (state) {
    url.searchParams.set('state', state);
  }

  res.redirect(url.toString());
}

/**
 * Sends a token error response.
 */
function sendTokenError(
  res: Response,
  error: string,
  errorDescription: string
): void {
  const response: TokenErrorResponse = {
    error,
    error_description: errorDescription,
  };
  res.status(400).json(response);
}

/**
 * Handles the GET /oauth/login endpoint.
 * Displays a login page with the configured OAuth provider.
 */
function handleLoginEndpoint(
  req: Request,
  res: Response,
  config: OAuthProxyConfig
): void {
  const { client_id, redirect_uri, state, scope } = req.query as Record<string, string | undefined>;

  // Build the continue URL to start the OAuth flow
  const continueUrl = new URL(`${config.baseUrl}/oauth/authorize`);
  if (client_id) continueUrl.searchParams.set('client_id', client_id);
  if (redirect_uri) continueUrl.searchParams.set('redirect_uri', redirect_uri);
  if (state) continueUrl.searchParams.set('state', state);
  if (scope) continueUrl.searchParams.set('scope', scope);
  continueUrl.searchParams.set('response_type', 'code');

  // Render the login page
  const html = renderLoginPage({
    clientName: client_id ?? 'An application',
    providerName: config.upstream.providerName ?? 'your identity provider',
    continueUrl: continueUrl.toString(),
    resourceName: 'MemberJunction MCP Server',
  });

  res.type('html').send(html);
}

/**
 * Handles the GET /oauth/scopes endpoint.
 * Returns the list of available API scopes for clients.
 */
async function handleScopesEndpoint(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const scopes = await loadActiveScopes();
    res.json({
      scopes: scopes.map((s) => ({
        name: s.Name,
        description: s.Description,
        category: s.Category,
      })),
    });
  } catch (error) {
    console.error('OAuth Proxy: Failed to load scopes:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to load scopes',
    });
  }
}

/**
 * Handles the GET /oauth/consent endpoint.
 * Displays the consent form for scope selection.
 */
async function handleGetConsentEndpoint(
  req: Request,
  res: Response,
  stateManager: AuthorizationStateManager
): Promise<void> {
  const { request_id } = req.query as Record<string, string | undefined>;

  if (!request_id) {
    sendErrorPage(res, 'Invalid Request', 'Missing request_id parameter');
    return;
  }

  const consentRequest = stateManager.getConsentRequest(request_id);
  if (!consentRequest) {
    sendErrorPage(res, 'Session Expired', 'The consent session has expired. Please start the authorization process again.');
    return;
  }

  // Render the consent page
  const html = renderConsentPage(consentRequest);
  res.type('html').send(html);
}

/**
 * Handles the POST /oauth/consent endpoint.
 * Processes the user's scope selection and completes the OAuth flow.
 */
async function handlePostConsentEndpoint(
  req: Request,
  res: Response,
  config: OAuthProxyConfig,
  stateManager: AuthorizationStateManager,
  jwtIssuer?: JWTIssuer
): Promise<void> {
  const { requestId, action } = req.body as {
    requestId?: string;
    action?: string;
    scopes?: string | string[];
  };

  if (!requestId) {
    sendErrorPage(res, 'Invalid Request', 'Missing requestId');
    return;
  }

  // Consume the consent request (remove from store)
  const consentRequest = stateManager.consumeConsentRequest(requestId);
  if (!consentRequest) {
    sendErrorPage(res, 'Session Expired', 'The consent session has expired. Please start again.');
    return;
  }

  // Handle denial
  if (action === 'deny') {
    // Redirect to client with error
    const redirectUrl = new URL(consentRequest.redirectUri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', 'User denied the authorization request');
    if (consentRequest.state) {
      redirectUrl.searchParams.set('state', consentRequest.state);
    }
    res.redirect(redirectUrl.toString());
    return;
  }

  // Get granted scopes from form submission
  let grantedScopes: string[] = [];
  const formScopes = req.body.scopes;
  if (typeof formScopes === 'string') {
    grantedScopes = [formScopes];
  } else if (Array.isArray(formScopes)) {
    grantedScopes = formScopes;
  }

  // If no scopes selected, log warning but still issue JWT with empty scopes
  // This allows the user to authenticate without any specific permissions
  if (grantedScopes.length === 0) {
    console.warn(`[OAuth Proxy] User ${consentRequest.user.email} granted NO SCOPES - token will have empty scopes array`);
  } else {
    console.log(`[OAuth Proxy] User ${consentRequest.user.email} granted scopes: ${grantedScopes.join(', ')}`);
  }

  // Create authorization code with granted scopes
  const code = stateManager.createAuthorizationCode({
    clientId: consentRequest.clientId,
    redirectUri: consentRequest.redirectUri,
    scope: grantedScopes.join(' '),
    codeChallenge: consentRequest.codeChallenge,
    codeChallengeMethod: consentRequest.codeChallengeMethod,
    upstreamTokens: {
      // For consent flow, we don't have upstream tokens yet
      // The tokens will be created when JWT issuer signs
      access_token: '',
      token_type: 'Bearer',
    },
    validatedUser: {
      mjUserId: consentRequest.user.mjUserId,
      email: consentRequest.user.email,
      upstreamProvider: consentRequest.upstreamProvider,
      upstreamSub: consentRequest.upstreamSub,
    },
  });

  // Redirect to client with code
  const redirectUrl = new URL(consentRequest.redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (consentRequest.state) {
    redirectUrl.searchParams.set('state', consentRequest.state);
  }

  res.redirect(redirectUrl.toString());
}

/**
 * Sends an HTML error page.
 */
function sendErrorPage(
  res: Response,
  title: string,
  message: string
): void {
  res.status(400).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(title)} - MemberJunction MCP Server</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .error-box {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          max-width: 400px;
          text-align: center;
        }
        h1 {
          color: #dc3545;
          margin-top: 0;
        }
        p {
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="error-box">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
      </div>
    </body>
    </html>
  `);
}

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
