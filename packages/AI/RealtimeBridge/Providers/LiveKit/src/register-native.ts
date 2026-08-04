/**
 * @fileoverview Registers the LiveKit **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `LiveKitBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `LiveKitBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake in a
 * test instead of the native two-way default.
 *
 * @module @memberjunction/ai-bridge-livekit
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { LiveKitBridge } from './livekit-bridge';
import { BindLiveKitNative } from './livekit-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the LiveKit provider row carries. */
const LIVEKIT_DRIVER_CLASS = 'LiveKitBridge';

/**
 * Registers LiveKit's native two-way binding. Idempotent (latest-wins in the registry), and invoked from the
 * package `index.ts` so merely importing `@memberjunction/ai-bridge-livekit` wires the default binding. Also
 * exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterLiveKitNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(LIVEKIT_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // LiveKitBridge it resolved for 'LiveKitBridge'. BindLiveKitNative() defaults to the lazy native
        // loader, which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as LiveKitBridge).SetSdkFactory(BindLiveKitNative());
    });
}

// Register on import (mirrors the LoadLiveKitBridge() tree-shake pattern in index.ts).
RegisterLiveKitNativeSdk();
