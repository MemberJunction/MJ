/**
 * @fileoverview Where a server-side LiveKit bot (an agent voice, a hold-music player) finds the native room-client
 * wrapper it joins a room with. One resolution rule for every bot in this package, so an operator who points
 * `LIVEKIT_NATIVE_MODULE` at a custom wrapper changes all of them at once.
 *
 * @module @memberjunction/livekit-room-server
 */

import { RegisterNativeRoomModule } from '@memberjunction/ai-bridge-livekit';
import NativeRoomModuleDefault from '@memberjunction/ai-bridge-livekit-native';

/** The default native room-client wrapper — the `@livekit/rtc-node`-backed package this repo ships. */
export const DEFAULT_LIVEKIT_NATIVE_MODULE = '@memberjunction/ai-bridge-livekit-native';

/**
 * Resolves the module specifier of the native LiveKit room-client wrapper: an explicit override (tests, a host that
 * wires its own), else the `LIVEKIT_NATIVE_MODULE` environment variable (e.g. a deployment's custom-sample-rate
 * wrapper), else {@link DEFAULT_LIVEKIT_NATIVE_MODULE}.
 *
 * @param override An explicit specifier that wins over the environment and the default.
 */
export function ResolveLiveKitNativeModuleSpecifier(override?: string): string {
  return override ?? process.env.LIVEKIT_NATIVE_MODULE ?? DEFAULT_LIVEKIT_NATIVE_MODULE;
}

// The bridge package's loader cannot `import()` the default wrapper itself: it does not (and, to avoid a dependency
// cycle, must not) declare it, so the bare specifier does not resolve from there under pnpm's strict layout. This
// package declares the wrapper, so it imports it statically and registers it for the loader to find. An override
// specifier (`LIVEKIT_NATIVE_MODULE`) that is not registered still goes through the loader's `import()`.
RegisterNativeRoomModule(DEFAULT_LIVEKIT_NATIVE_MODULE, NativeRoomModuleDefault);
