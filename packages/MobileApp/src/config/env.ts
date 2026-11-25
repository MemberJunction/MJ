import { Platform } from 'react-native';
import { ResolveApiUrls } from '@/config/resolve-api-urls';
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
// `__DEV__` is injected by Metro; it is undefined under Vitest, where we treat the run as dev.
declare const __DEV__: boolean | undefined;
const IS_DEV: boolean = typeof __DEV__ === 'undefined' || __DEV__ === true;

/**
 * MJAPI URL resolution. Explicit `EXPO_PUBLIC_MJ_GRAPHQL_URL` / `EXPO_PUBLIC_MJ_WS_URL` win; a dev
 * build otherwise falls back to the developer's machine (`localhost`, or `10.0.2.2` from the
 * Android emulator, overridable with `EXPO_PUBLIC_MJ_API_HOST` / `EXPO_PUBLIC_MJ_API_PORT` for a
 * LAN device). A release build has no fallback and throws here at startup, because iOS App
 * Transport Security blocks cleartext to remote hosts and a silent `http://localhost` default
 * would ship an app that fails every request. Rules and tests: `./resolve-api-urls.ts`.
 */
const ResolvedApi = ResolveApiUrls({
  GraphqlUrl: process.env.EXPO_PUBLIC_MJ_GRAPHQL_URL,
  WsUrl: process.env.EXPO_PUBLIC_MJ_WS_URL,
  ApiHost: process.env.EXPO_PUBLIC_MJ_API_HOST,
  ApiPort: process.env.EXPO_PUBLIC_MJ_API_PORT,
  Platform: Platform.OS,
  IsDev: IS_DEV,
});

export const Env = {
  /** MJAPI GraphQL endpoint. */
  graphqlUrl: ResolvedApi.GraphqlUrl,

  /** WebSocket subscription endpoint. */
  graphqlWsUrl: ResolvedApi.GraphqlWsUrl,

  // ---------------------------------------------------------------------
  // Auth0 (primary mobile auth path)
  // ---------------------------------------------------------------------
  auth0Domain: 'bluecypress-dev.us.auth0.com',
  auth0ClientId: 'uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI',
  auth0Scopes: ['openid', 'profile', 'email', 'offline_access'] as const,
  /**
   * Whether sign-out also ends the Auth0 tenant session via `/v2/logout` (see
   * src/auth/auth0-session.ts). Requires `mjmobile://auth` under the Auth0 application's
   * **Allowed Logout URLs**; with it unlisted, Auth0 renders an error page on every sign-out
   * instead of redirecting back. Off until the tenant is updated. User switching still works
   * without it because sign-out raises the one-shot `prompt=login` flag (src/auth/fresh-login.ts).
   */
  auth0EndSessionOnSignOut: false,

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
   * Optional dev JWT fallback for ad-hoc API testing and automated QA.
   *
   * Sourced from `EXPO_PUBLIC_MJ_DEV_JWT`, which Expo inlines at bundle time. Supplying it
   * through the environment rather than pasting it here is deliberate: a token in source is one
   * `git add -A` away from being published, and the previous instruction — "paste a token only in
   * your local working copy" — depended entirely on the developer remembering to take it out.
   *
   * Unset in CI and production, where the value is simply an empty string and the normal OAuth
   * flow runs.
   */
  devAuthToken: process.env.EXPO_PUBLIC_MJ_DEV_JWT ?? '',

  /**
   * Optional companions to `devAuthToken` for auto-refresh (dev-only). When both an
   * id_token AND a refresh_token are provided, the app seeds expo-secure-store with
   * the full bundle at boot and the standard Auth0 refresh path (auth0.ts →
   * refreshAsync → PersistAuth0Tokens) takes over — same code the production OAuth
   * login uses, so the token auto-renews like the Angular Auth0 SDK does. Leave
   * empty in committed code.
   */
  devAuth0RefreshToken: '',
  devAuth0AccessToken: '',
  devAuth0ExpiresAtMs: 0,
} as const;
