/**
 * @fileoverview MCP Server OAuth Authentication Module
 *
 * This module provides OAuth 2.1 authentication support for the MCP Server,
 * implementing RFC 9728 Protected Resource Metadata and MCP-canonical authorization.
 *
 * Features:
 * - Multiple auth modes: apiKey (default), oauth, both, none
 * - Protected Resource Metadata endpoint (/.well-known/oauth-protected-resource)
 * - WWW-Authenticate headers per RFC 9728
 * - Bearer token validation using MJServer auth providers
 * - User mapping from OAuth claims to MemberJunction users
 *
 * @module @memberjunction/ai-mcp-server/auth
 */

// Types and interfaces
export * from './types.js';

// Configuration
export * from './OAuthConfig.js';

// Protocol helpers
export * from './WWWAuthenticate.js';
export * from './ProtectedResourceMetadata.js';

// Core authentication
export * from './TokenValidator.js';
export * from './AuthGate.js';
