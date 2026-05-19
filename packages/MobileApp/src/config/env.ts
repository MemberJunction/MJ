/**
 * Mobile app environment configuration.
 *
 * For Phase 1 dev, these are static. Phase 2+ should drive them from
 * Expo's app.config.js extra block or a real env loader.
 *
 * The MSAL_* values mirror the development environment of MJ Explorer
 * (packages/MJExplorer/src/environments/environment.ts) so the mobile
 * app authenticates against the same Azure AD tenant and client app.
 *
 * Required Azure AD setup (one-time, in Azure portal):
 *   1. Open the existing MJ Explorer app registration.
 *   2. Authentication → Add a platform → Mobile and desktop applications.
 *   3. Add redirect URI: `mjmobile://auth` (matches our app.json scheme).
 *   4. Enable "Allow public client flows" under Advanced settings.
 */
export const Env = {
  /** MJAPI GraphQL endpoint. iOS Simulator can hit localhost directly. */
  graphqlUrl: 'http://localhost:4001/graphql',

  /** WebSocket subscription endpoint. Same host, ws protocol. */
  graphqlWsUrl: 'ws://localhost:4001/graphql',

  /** Azure AD tenant ID (matches MJExplorer's environment.ts) */
  msalTenantId: 'ff10ade7-5d03-40a9-be28-cb7ab99670b1',

  /** Azure AD app registration client ID */
  msalClientId: '7e6e6ecf-66ff-4733-9c60-1e6def949897',

  /** Authority URL derived from tenant */
  get msalAuthority(): string {
    return `https://login.microsoftonline.com/${this.msalTenantId}`;
  },

  /** Scopes requested at sign-in. openid + profile are required for an idToken; User.Read matches Explorer's request. */
  msalScopes: ['openid', 'profile', 'User.Read', 'offline_access'] as const,

  /**
   * Optional dev auth token fallback. Used when MSAL hasn't been wired or
   * we're testing without going through the full OAuth flow. Leave blank
   * in committed code — paste a JWT only in your local working copy when
   * needed for ad-hoc tests.
   */
  devAuthToken: '',
} as const;
