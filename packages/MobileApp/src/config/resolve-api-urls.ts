/**
 * Resolve the MJAPI GraphQL + WebSocket URLs for this build.
 *
 * Pure function (no `react-native`, no `process.env`) so the rules are unit-testable; `env.ts`
 * feeds it the Expo public env vars, the platform, and `__DEV__`.
 *
 * Rules (P0-3 in plans/mobile-app-react-native/V1-LAUNCH-AND-WHITE-LABEL-PLAN.md):
 *  - `EXPO_PUBLIC_MJ_GRAPHQL_URL`, when set, is used as-is. The WebSocket URL derives from it
 *    (`https://` -> `wss://`, `http://` -> `ws://`) unless `EXPO_PUBLIC_MJ_WS_URL` is also set.
 *  - With no explicit URL, a **dev** build falls back to the developer's machine
 *    (`http://localhost:<port>/graphql`, `10.0.2.2` on the Android emulator).
 *  - A **release** build never falls back: iOS App Transport Security blocks cleartext to remote
 *    hosts, so a silent `http://localhost` default would ship an app that fails every request with
 *    an opaque error. It throws at startup with a message naming the missing variable instead, and
 *    rejects a non-`https://` URL for the same reason.
 */

/** Everything the resolver needs; `env.ts` reads these from the Expo public env + runtime. */
export type ApiUrlInputs = {
    /** `EXPO_PUBLIC_MJ_GRAPHQL_URL`, if set. */
    GraphqlUrl?: string;
    /** `EXPO_PUBLIC_MJ_WS_URL`, if set. */
    WsUrl?: string;
    /** `EXPO_PUBLIC_MJ_API_HOST`, if set (dev only; a LAN device needs the machine's IP). */
    ApiHost?: string;
    /** `EXPO_PUBLIC_MJ_API_PORT`, if set (dev only). */
    ApiPort?: string;
    /** `Platform.OS`; only `'android'` changes the dev fallback host. */
    Platform: string;
    /** Metro's `__DEV__`. */
    IsDev: boolean;
};

/** The resolved pair the GraphQL provider is configured with. */
export type ResolvedApiUrls = {
    GraphqlUrl: string;
    GraphqlWsUrl: string;
};

/** MJAPI's default port; override with `EXPO_PUBLIC_MJ_API_PORT` in dev. */
export const DEFAULT_DEV_API_PORT = '4000';

/** Build the dev-only fallback that reaches the developer's machine from a simulator/emulator. */
export function DevFallbackGraphqlUrl(platform: string, apiHost?: string, apiPort?: string): string {
    const host = apiHost ?? (platform === 'android' ? '10.0.2.2' : 'localhost');
    return `http://${host}:${apiPort ?? DEFAULT_DEV_API_PORT}/graphql`;
}

/** `https://` -> `wss://`, `http://` -> `ws://`; anything else is returned unchanged. */
export function DeriveWsUrl(graphqlUrl: string): string {
    return graphqlUrl.replace(/^http/i, 'ws');
}

/**
 * Apply the rules above.
 *
 * @throws In a release build when no `EXPO_PUBLIC_MJ_GRAPHQL_URL` is set, or when it is not `https://`.
 */
export function ResolveApiUrls(inputs: ApiUrlInputs): ResolvedApiUrls {
    const explicit = inputs.GraphqlUrl?.trim();
    if (explicit) {
        if (!inputs.IsDev && !/^https:\/\//i.test(explicit)) {
            throw new Error(
                `EXPO_PUBLIC_MJ_GRAPHQL_URL must be an https:// URL in a release build (got "${explicit}"). ` +
                'iOS App Transport Security blocks cleartext http:// to remote hosts.',
            );
        }
        return { GraphqlUrl: explicit, GraphqlWsUrl: inputs.WsUrl?.trim() || DeriveWsUrl(explicit) };
    }

    if (!inputs.IsDev) {
        throw new Error(
            'EXPO_PUBLIC_MJ_GRAPHQL_URL is not set. A release build has no localhost fallback; ' +
            'set it (and optionally EXPO_PUBLIC_MJ_WS_URL) in the EAS build profile or app config.',
        );
    }

    const fallback = DevFallbackGraphqlUrl(inputs.Platform, inputs.ApiHost, inputs.ApiPort);
    return { GraphqlUrl: fallback, GraphqlWsUrl: inputs.WsUrl?.trim() || DeriveWsUrl(fallback) };
}
