/**
 * @fileoverview Registers the Webex **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `WebexBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `WebexBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk`.
 *
 * @module @memberjunction/ai-bridge-webex
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { WebexBridge } from './webex-bridge';
import { BindWebexNative } from './webex-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Webex provider row carries. */
const WEBEX_DRIVER_CLASS = 'WebexBridge';

/**
 * Registers Webex's native two-way binding. Idempotent (latest-wins in the registry), and invoked from the
 * package `index.ts` so merely importing `@memberjunction/ai-bridge-webex` wires the default binding. Also
 * exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterWebexNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(WEBEX_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // WebexBridge it resolved for 'WebexBridge'. BindWebexNative() defaults to the lazy native loader,
        // which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as WebexBridge).SetSdkFactory(BindWebexNative());
    });
}

// Register on import (mirrors the LoadWebexBridge() tree-shake pattern in index.ts).
RegisterWebexNativeSdk();
