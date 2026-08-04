/**
 * @fileoverview Registers the Google Meet **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `GoogleMeetBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `GoogleMeetBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake or an
 * alternate Google Meet Media API binding instead of the native two-way default.
 *
 * @module @memberjunction/ai-bridge-googlemeet
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { GoogleMeetBridge } from './googlemeet-bridge';
import { BindGoogleMeetNative } from './googlemeet-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Google Meet provider row carries. */
const GOOGLE_MEET_DRIVER_CLASS = 'GoogleMeetBridge';

/**
 * Registers Google Meet's native two-way binding. Idempotent (latest-wins in the registry), and invoked from
 * the package `index.ts` so merely importing `@memberjunction/ai-bridge-googlemeet` wires the default binding.
 * Also exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterGoogleMeetNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(GOOGLE_MEET_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // GoogleMeetBridge it resolved for 'GoogleMeetBridge'. BindGoogleMeetNative() defaults to the lazy
        // native loader, which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as GoogleMeetBridge).SetSdkFactory(BindGoogleMeetNative());
    });
}

// Register on import (mirrors the LoadGoogleMeetBridge() tree-shake pattern in index.ts).
RegisterGoogleMeetNativeSdk();
