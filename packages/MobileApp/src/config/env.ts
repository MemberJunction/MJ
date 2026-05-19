/**
 * Mobile app environment configuration.
 *
 * Mirrors MJ Explorer's environment.ts so the mobile app authenticates
 * against the same Auth0 tenant (and same MJAPI endpoint).
 *
 * One-time Auth0 setup (already configured for the BlueCypress dev tenant):
 *   - Application Type: Native
 *   - Allowed Callback URLs: `mjmobile://auth`
 *   - Allowed Logout URLs:   `mjmobile://auth`
 *   - Refresh Token Rotation: enabled
 *   - Token Settings → Refresh Token Behavior: Rotating
 */
export const Env = {
  /** MJAPI GraphQL endpoint. iOS Simulator can hit localhost directly. */
  graphqlUrl: 'http://localhost:4001/graphql',

  /** WebSocket subscription endpoint. */
  graphqlWsUrl: 'ws://localhost:4001/graphql',

  // ---------------------------------------------------------------------
  // Auth0 (primary mobile auth path)
  // ---------------------------------------------------------------------
  auth0Domain: 'bluecypress-dev.us.auth0.com',
  auth0ClientId: 'uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI',
  auth0Scopes: ['openid', 'profile', 'email', 'offline_access'] as const,

  // ---------------------------------------------------------------------
  // MSAL (Azure AD) — preserved for future enablement; not on the boot path
  // until the mobile redirect URI is registered in Azure AD.
  // ---------------------------------------------------------------------
  msalTenantId: 'ff10ade7-5d03-40a9-be28-cb7ab99670b1',
  msalClientId: '7e6e6ecf-66ff-4733-9c60-1e6def949897',
  get msalAuthority(): string {
    return `https://login.microsoftonline.com/${this.msalTenantId}`;
  },
  msalScopes: ['openid', 'profile', 'User.Read', 'offline_access'] as const,

  /**
   * Optional dev JWT fallback for ad-hoc API testing. Leave empty in
   * committed code — paste a token only in your local working copy if
   * you need to bypass the OAuth flow temporarily.
   */
  devAuthToken: '',
} as const;
