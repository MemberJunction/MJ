/**
 * @fileoverview Registers the Vonage **native two-way** call-SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `VonageBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `VonageBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake call
 * SDK in a test instead of the native Vonage Voice API + WebSocket media default.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { VonageBridge, VONAGE_BRIDGE_DRIVER_CLASS } from './vonage-bridge';
import { BindVonageNativeCall } from './vonage-native-call-sdk';

/**
 * Registers Vonage's native two-way call binding. Idempotent (latest-wins in the registry), and invoked from
 * the package `index.ts` so merely importing `@memberjunction/ai-bridge-vonage` wires the default binding.
 * Also exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterVonageNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(VONAGE_BRIDGE_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // VonageBridge it resolved for 'VonageBridge'. BindVonageNativeCall() defaults to the lazy native
        // loader, which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as VonageBridge).SetSdkFactory(BindVonageNativeCall());
    });
}

// Register on import (mirrors the LoadVonageBridge() tree-shake pattern in index.ts).
RegisterVonageNativeSdk();
