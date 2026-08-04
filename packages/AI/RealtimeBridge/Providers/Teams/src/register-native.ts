/**
 * @fileoverview Registers the Teams **native two-way** SDK binding into the {@link BridgeNativeSdkRegistry}
 * so `AIBridgeEngine.StartBridgeSession` auto-binds it onto a resolved `TeamsBridge` before connect — no
 * per-deployment wiring needed. The typed downcast + `SetSdkFactory` stay confined here (where the concrete
 * `TeamsBridge` type is known), keeping the engine seam free of provider types.
 *
 * A host can still override per-session via `StartBridgeSessionParams.BindSdk` — e.g. to use a different
 * Teams binding instead of the native two-way default.
 *
 * @module @memberjunction/ai-bridge-teams
 * @author MemberJunction.com
 */

import { BridgeNativeSdkRegistry, BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { TeamsBridge } from './teams-bridge';
import { BindTeamsNative } from './teams-native-sdk';

/** The `MJ: AI Bridge Providers.DriverClass` value the Teams provider row carries. */
const TEAMS_DRIVER_CLASS = 'TeamsBridge';

/**
 * Registers Teams's native two-way binding. Idempotent (latest-wins in the registry), and invoked from the
 * package `index.ts` so merely importing `@memberjunction/ai-bridge-teams` wires the default binding. Also
 * exported as a tree-shake-safe no-op-returning function callers can reference to force-retain the module.
 */
export function RegisterTeamsNativeSdk(): void {
    BridgeNativeSdkRegistry.Instance.Register(TEAMS_DRIVER_CLASS, (driver: BaseRealtimeBridge) => {
        // Safe downcast: the registry is keyed by DriverClass, so the engine only ever applies this to the
        // TeamsBridge it resolved for 'TeamsBridge'. BindTeamsNative() defaults to the lazy native loader,
        // which reads NativeModuleSpecifier from the per-session Configuration.
        (driver as TeamsBridge).SetSdkFactory(BindTeamsNative());
    });
}

// Register on import (mirrors the LoadTeamsBridge() tree-shake pattern in index.ts).
RegisterTeamsNativeSdk();
