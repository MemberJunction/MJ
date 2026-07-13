/**
 * @fileoverview Registers the Zoom **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `ZoomBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `ZoomBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to use the
 * receive-only RTMS binding (`BindZoomRtms()`) instead of the native two-way default.
 *
 * @module @memberjunction/ai-bridge-zoom
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { ZoomBridge } from './zoom-bridge';
import { BindZoomNative } from './zoom-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Zoom provider row carries. */
const ZOOM_DRIVER_CLASS = 'ZoomBridge';

/**
 * Registers Zoom's native two-way binding. Idempotent (latest-wins in the registry), and invoked from the
 * package `index.ts` so merely importing `@memberjunction/ai-bridge-zoom` wires the default binding. Also
 * exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterZoomNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(ZOOM_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // ZoomBridge it resolved for 'ZoomBridge'. BindZoomNative() defaults to the lazy native loader,
        // which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as ZoomBridge).SetSdkFactory(BindZoomNative());
    });
}

// Register on import (mirrors the LoadZoomBridge() tree-shake pattern in index.ts).
RegisterZoomNativeSdk();
