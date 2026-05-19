/**
 * Mobile app environment configuration.
 *
 * For Phase 1 dev, these are static. Phase 2+ should drive them from
 * Expo's app.config.js extra block or a real env loader.
 */
export const Env = {
  /** MJAPI GraphQL endpoint. iOS Simulator can hit localhost directly. */
  graphqlUrl: 'http://localhost:4001/graphql',

  /** WebSocket subscription endpoint. Same host, ws protocol. */
  graphqlWsUrl: 'ws://localhost:4001/graphql',

  /**
   * Dev auth token. Phase 1 bypass — replace with real OAuth flow in Phase 2.
   * To use: set this to a JWT minted from your local MJAPI for your dev user.
   * Leave empty during initial scaffolding; the app will still render the UI
   * shell but data calls will fail until a token is provided.
   */
  devAuthToken: '',
} as const;
