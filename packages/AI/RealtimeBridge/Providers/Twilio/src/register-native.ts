/**
 * @fileoverview Registers the Twilio **native two-way** call-SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `TwilioBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `TwilioBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake
 * telephony SDK in a test instead of the native two-way default.
 *
 * @module @memberjunction/ai-bridge-twilio
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { TwilioBridge } from './twilio-bridge';
import { BindTwilioNativeCall } from './twilio-native-call-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Twilio provider row carries. */
const TWILIO_DRIVER_CLASS = 'TwilioBridge';

/**
 * Registers Twilio's native two-way call binding. Idempotent (latest-wins in the registry), and invoked from
 * the package `index.ts` so merely importing `@memberjunction/ai-bridge-twilio` wires the default binding.
 * Also exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterTwilioNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(TWILIO_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // TwilioBridge it resolved for 'TwilioBridge'. TwilioBridge extends BaseTelephonyBridge (a
        // BaseRealtimeBridge), so the registry's BaseRealtimeBridge driver param accommodates it.
        // BindTwilioNativeCall() defaults to the lazy native loader, which reads NativeModuleSpecifier from
        // the per-session Configuration.
        (driver as TwilioBridge).SetSdkFactory(BindTwilioNativeCall());
    });
}

// Register on import (mirrors the LoadTwilioBridge() tree-shake pattern in index.ts).
RegisterTwilioNativeSdk();
