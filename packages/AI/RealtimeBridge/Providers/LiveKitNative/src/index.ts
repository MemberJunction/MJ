export * from './livekit-rtc-node-room';
export * from './media-worker-types';
export * from './media-worker-session';
export * from './room-telemetry';
export * from './livekit-worker-room-client';
export * from './video-frame-pixels';
export * from './video-frame-encoder';
export * from './video-encode-protocol';
export * from './video-encode-worker-host';
export * from './room-video-watcher';
export * from './ffmpeg-locator';
export * from './avatar-decoder-process';
export * from './avatar-h264-decoder';
export * from './avatar-aac-decoder';
export * from './avatar-media-clock';
export * from './avatar-publisher';
export * from './avatar-room-outlet';
// Not exported: the two worker entries, which run on import.

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
export const CreateRoomClient = defaultModule.createRoomClient;

/** @deprecated Use {@link CreateRoomClient}. */
export const createRoomClient = CreateRoomClient;
