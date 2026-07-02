/**
 * @fileoverview Registers the RingCentral **native two-way** call-SDK binding into the
 * {@link BridgeNativeSdkRegistry} so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved
 * `RingCentralBridge` before connect — no per-deployment wiring needed. The typed downcast +
 * `SetSdkFactory` stay confined here (where the concrete `RingCentralBridge` type is known), keeping the
 * engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake
 * call SDK in a test, or to swap in an alternate RingCentral binding.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { RingCentralBridge } from './ringcentral-bridge';
import { BindRingCentralNativeCall } from './ringcentral-native-call-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the RingCentral provider row carries. */
const RINGCENTRAL_DRIVER_CLASS = 'RingCentralBridge';

/**
 * Registers RingCentral's native two-way call binding. Idempotent (latest-wins in the registry), and
 * invoked from the package `index.ts` so merely importing `@memberjunction/ai-bridge-ringcentral` wires the
 * default binding. Also exported as a tree-shake-safe no-op-returning function callers can reference to
 * force-retain the module.
 */
export function RegisterRingCentralNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(RINGCENTRAL_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // RingCentralBridge it resolved for 'RingCentralBridge'. BindRingCentralNativeCall() defaults to the
        // lazy native loader, which reads the native module specifier from the per-session Configuration.
        (driver as RingCentralBridge).SetSdkFactory(BindRingCentralNativeCall());
    });
}

// Register on import (mirrors the LoadRingCentralBridge() tree-shake pattern in index.ts).
RegisterRingCentralNativeSdk();
