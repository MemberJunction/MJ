/**
 * Runtime polyfills + dev log filtering for the React Native / Hermes runtime.
 * This module has import side effects only (no exports) and MUST be imported
 * first in the app entry point, before any `@memberjunction/*` code: it installs
 * a WHATWG-complete `URL`/`URLSearchParams`, backs `crypto.getRandomValues()`
 * with expo-crypto's native CSPRNG (needed by the `uuid` package), and silences
 * expected dev-only LogBox noise from the polling fallback path.
 */

// WHATWG-complete URL/URLSearchParams — RN's built-in URL is incomplete and throws
// "Invalid URL" for inputs graphql-request / subscription clients pass. Must load first.
import 'react-native-url-polyfill/auto';
import { getRandomValues as expoGetRandomValues } from 'expo-crypto';
import { LogBox } from 'react-native';

// The push-status WebSocket isn't reliably available on the RN/simulator client, so
// agent runs fall back to polling the response detail. These dev-only LogBox entries
// are expected and handled — suppress the noise so they don't look like real failures.
LogBox.ignoreLogs([
  /Error running AI agent/,
  /PushStatusUpdates subscription error/,
  /FireAndForget/,
]);

/**
 * Global polyfills — MUST be imported before any `@memberjunction/*` code.
 *
 * The `uuid` package (used throughout the MJ shared layer, e.g. GraphQLDataProvider
 * session ids) calls the Web Crypto `crypto.getRandomValues()`, which Hermes/RN does
 * not provide. Back it with expo-crypto's native CSPRNG (already linked in the build,
 * so no extra native module / rebuild is needed).
 */
type RandomValuesFn = <T extends ArrayBufferView | null>(array: T) => T;
const g = globalThis as unknown as { crypto?: { getRandomValues?: RandomValuesFn } };

if (!g.crypto) {
  g.crypto = { getRandomValues: expoGetRandomValues as RandomValuesFn };
} else if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = expoGetRandomValues as RandomValuesFn;
}
