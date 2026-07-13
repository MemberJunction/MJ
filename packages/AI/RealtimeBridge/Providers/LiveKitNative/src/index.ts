export * from './livekit-rtc-node-room';

import { CreateLiveKitRtcNodeModule } from './livekit-rtc-node-room';

/**
 * A ready-to-use {@link import('@memberjunction/ai-bridge-livekit').NativeRoomModule} at the default
 * 24 kHz-mono rates, so a deployment can point `LiveKitNativeSdkConfig.NativeModuleSpecifier` **straight at
 * this package** (`'@memberjunction/ai-bridge-livekit-native'`) and get a working two-way LiveKit bot.
 *
 * For non-default rates (e.g. Gemini Live's 16 kHz inbound), write a one-line module that calls
 * {@link CreateLiveKitRtcNodeModule} with overrides and point `NativeModuleSpecifier` at THAT instead.
 */
const defaultModule = CreateLiveKitRtcNodeModule();

// Exported both as default and as a top-level `createRoomClient` so the bridge's lazy loader resolves it
// under either CJS-`.default` or ESM-namespace interop.
export default defaultModule;
export const createRoomClient = defaultModule.createRoomClient;
