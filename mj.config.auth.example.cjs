/**
 * Example authentication provider configuration for MemberJunction
 * 
 * This file demonstrates how to configure multiple authentication providers
 * in the new extensible authentication system.
 * 
 * Copy the authProviders section to your mj.config.cjs file and update
 * with your actual provider settings.
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
     * Microsoft Authentication Library (MSAL) / Azure AD
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
     * AWS Cognito Example
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
     * Google Identity Platform Example
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