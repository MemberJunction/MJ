/**
 * Example authentication provider configuration for MemberJunction
 *
 * This file demonstrates how to configure multiple authentication providers
 * in the new extensible authentication system.
 *
 * Copy the authProviders section to your mj.config.cjs file and update
 * with your actual provider settings.
 *
 * =============================================================================
 * MCP SERVER OAUTH PROXY - REDIRECT URI CONFIGURATION
 * =============================================================================
 *
 * When using the MCP Server's OAuth Proxy (for MCP clients like Claude Code),
 * you must add the following redirect URI to your identity provider:
 *
 *   http://localhost:3100/oauth/callback   (development)
 *   https://your-mcp-server.com/oauth/callback   (production)
 *
 * This redirect URI should be added to the SAME app registration used by
 * MJExplorer. The OAuth Proxy uses PKCE (no client secret required).
 *
 * Provider-specific setup instructions below.
 * =============================================================================
 */

module.exports = {
  // ... other configuration ...

  /**
   * Authentication Provider Configuration
   *
   * Define multiple OAuth 2.0/OIDC compliant authentication providers.
   * Each provider must have a unique name and all required fields.
   */
  authProviders: [
    /**
     * Microsoft Authentication Library (MSAL) / Azure AD / Entra ID
     *
     * REDIRECT URI SETUP:
     * 1. Go to Azure Portal → App Registrations → Your App → Authentication
     * 2. Under "Single-page application" platform, add:
     *    - http://localhost:3100/oauth/callback (development)
     *    - https://your-mcp-server.com/oauth/callback (production)
     * 3. Ensure "Access tokens" and "ID tokens" are checked under Implicit grant
     * 4. No client secret needed - the proxy uses PKCE (same as MJExplorer)
     */
    {
      name: 'msal',
      type: 'msal',
      issuer: 'https://login.microsoftonline.com/${TENANT_ID}/v2.0',
      audience: '${WEB_CLIENT_ID}',
      jwksUri: 'https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys',
      clientId: '${WEB_CLIENT_ID}',
      tenantId: '${TENANT_ID}'
    },

    /**
     * Auth0
     *
     * REDIRECT URI SETUP:
     * 1. Go to Auth0 Dashboard → Applications → Your App → Settings
     * 2. Under "Allowed Callback URLs", add:
     *    - http://localhost:3100/oauth/callback (development)
     *    - https://your-mcp-server.com/oauth/callback (production)
     * 3. Under "Allowed Web Origins", add your MCP server URL
     * 4. Save changes
     */
    {
      name: 'auth0',
      type: 'auth0',
      issuer: 'https://${AUTH0_DOMAIN}/',
      audience: '${AUTH0_CLIENT_ID}',
      jwksUri: 'https://${AUTH0_DOMAIN}/.well-known/jwks.json',
      clientId: '${AUTH0_CLIENT_ID}',
      clientSecret: '${AUTH0_CLIENT_SECRET}',
      domain: '${AUTH0_DOMAIN}'
    },

    /**
     * Okta
     *
     * REDIRECT URI SETUP:
     * 1. Go to Okta Admin Console → Applications → Your App → General
     * 2. Under "Login redirect URIs", add:
     *    - http://localhost:3100/oauth/callback (development)
     *    - https://your-mcp-server.com/oauth/callback (production)
     * 3. Ensure "Authorization Code" grant type is enabled
     * 4. Save changes
     */
    {
      name: 'okta',
      type: 'okta',
      issuer: 'https://${OKTA_DOMAIN}/oauth2/default',
      audience: '${OKTA_CLIENT_ID}',
      jwksUri: 'https://${OKTA_DOMAIN}/oauth2/default/v1/keys',
      clientId: '${OKTA_CLIENT_ID}',
      clientSecret: '${OKTA_CLIENT_SECRET}',
      domain: '${OKTA_DOMAIN}'
    },

    /**
     * AWS Cognito
     *
     * REDIRECT URI SETUP:
     * 1. Go to AWS Console → Cognito → User Pools → Your Pool → App Integration
     * 2. Under "App client settings", find your app client
     * 3. Add to "Callback URL(s)":
     *    - http://localhost:3100/oauth/callback (development)
     *    - https://your-mcp-server.com/oauth/callback (production)
     * 4. Enable "Authorization code grant" under OAuth 2.0
     * 5. Save changes
     */
    {
      name: 'cognito',
      type: 'cognito',
      issuer: 'https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}',
      audience: '${COGNITO_CLIENT_ID}',
      jwksUri: 'https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json',
      clientId: '${COGNITO_CLIENT_ID}',
      region: '${AWS_REGION}',
      userPoolId: '${USER_POOL_ID}'
    },

    /**
     * Google Identity Platform
     *
     * REDIRECT URI SETUP:
     * 1. Go to Google Cloud Console → APIs & Services → Credentials
     * 2. Edit your OAuth 2.0 Client ID
     * 3. Under "Authorized redirect URIs", add:
     *    - http://localhost:3100/oauth/callback (development)
     *    - https://your-mcp-server.com/oauth/callback (production)
     * 4. Save changes
     */
    {
      name: 'google',
      type: 'google',
      issuer: 'https://accounts.google.com',
      audience: '${GOOGLE_CLIENT_ID}',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      clientId: '${GOOGLE_CLIENT_ID}',
      clientSecret: '${GOOGLE_CLIENT_SECRET}'
    }
  ],

  /**
   * LEGACY CONFIGURATION (Still Supported)
   * 
   * If authProviders array is not provided, the system will fall back to
   * these legacy configuration values for backward compatibility.
   */
  // webClientID: process.env.WEB_CLIENT_ID,
  // tenantID: process.env.TENANT_ID,
  // auth0Domain: process.env.AUTH0_DOMAIN,
  // auth0WebClientID: process.env.AUTH0_CLIENT_ID,
  // auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
};