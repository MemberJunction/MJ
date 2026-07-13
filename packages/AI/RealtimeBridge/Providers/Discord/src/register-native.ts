/**
 * @fileoverview Registers the Discord **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `DiscordBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `DiscordBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to inject a fake
 * in a test.
 *
 * @module @memberjunction/ai-bridge-discord
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { DiscordBridge } from './discord-bridge';
import { BindDiscordNative } from './discord-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Discord provider row carries. */
const DISCORD_DRIVER_CLASS = 'DiscordBridge';

/**
 * Registers Discord's native two-way binding. Idempotent (latest-wins in the registry), and invoked from the
 * package `index.ts` so merely importing `@memberjunction/ai-bridge-discord` wires the default binding. Also
 * exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterDiscordNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(DISCORD_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // DiscordBridge it resolved for 'DiscordBridge'. BindDiscordNative() defaults to the lazy native
        // loader, which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as DiscordBridge).SetSdkFactory(BindDiscordNative());
    });
}

// Register on import (mirrors the LoadDiscordBridge() tree-shake pattern in index.ts).
RegisterDiscordNativeSdk();
