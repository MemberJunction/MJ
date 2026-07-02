/**
 * @fileoverview Registers the Slack **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `SlackBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `SlackBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake in a
 * test or to supply an alternate Slack huddle media binding.
 *
 * 🚨 REAL-API RISK: the native two-way binding depends on a verified huddle media path (likely Chime-level)
 * that Slack does not publicly document — see `slack-bridge.ts` / `slack-native-sdk.ts`. The binding is
 * registered as the default so the driver is ready the instant that media path is available.
 *
 * @module @memberjunction/ai-bridge-slack
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { SlackBridge } from './slack-bridge';
import { BindSlackNative } from './slack-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Slack provider row carries. */
const SLACK_DRIVER_CLASS = 'SlackBridge';

/**
 * Registers Slack's native two-way binding. Idempotent (latest-wins in the registry), and invoked from the
 * package `index.ts` so merely importing `@memberjunction/ai-bridge-slack` wires the default binding. Also
 * exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterSlackNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(SLACK_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // SlackBridge it resolved for 'SlackBridge'. BindSlackNative() defaults to the lazy native loader,
        // which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as SlackBridge).SetSdkFactory(BindSlackNative());
    });
}

// Register on import (mirrors the LoadSlackBridge() tree-shake pattern in index.ts).
RegisterSlackNativeSdk();
