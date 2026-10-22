import { Platform } from 'react-native';
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
/**
 * Host that reaches the developer's machine from the running app.
 *
 * The iOS Simulator shares the host's network stack, so `localhost` is the machine. An Android
 * emulator does not — `localhost` there is the emulator itself, and the special address `10.0.2.2`
 * is how it reaches the host. Without this the app builds and launches on Android and then fails
 * every request with an opaque `GraphQL Error (Code: unknown)`, which reads like a server problem
 * rather than a networking one.
 *
 * Overridable with `EXPO_PUBLIC_MJ_API_HOST` for a device on the same LAN, where neither default
 * applies and the machine's IP is needed.
 */
const LocalApiHost: string =
  process.env.EXPO_PUBLIC_MJ_API_HOST ?? (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');

export const Env = {
  /** MJAPI GraphQL endpoint. */
  graphqlUrl: `http://${LocalApiHost}:4001/graphql`,

  /** WebSocket subscription endpoint. */
  graphqlWsUrl: `ws://${LocalApiHost}:4001/graphql`,

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
