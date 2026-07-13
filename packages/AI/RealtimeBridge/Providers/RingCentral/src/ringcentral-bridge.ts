/**
 * @fileoverview `RingCentralBridge` — the RingCentral **telephony** Realtime Bridge driver, connecting the
 * one realtime agent engine to a **phone call over the RingCentral Voice / Call Control API**. It copies
 * the reference telephony driver (`TwilioBridge`) exactly: a thin subclass of {@link BaseTelephonyBridge}
 * that only binds a provider SDK factory.
 *
 * `RingCentralBridge` is intentionally **thin**: nearly all behavior — outbound dial / inbound answer, the
 * single-party audio media seam, DTMF send/receive, call transfer, the trivial caller+agent roster, and
 * the capability gating — is inherited from {@link BaseTelephonyBridge} (`@memberjunction/ai-bridge-base`).
 * The driver supplies only the **RingCentral binding**: it points the base's SDK creation seam at the
 * {@link RingCentralCallSdkFactory}, which builds a {@link RingCentralCallSdk} over the real RingCentral
 * client (Call Control REST + media stream). Until a real RingCentral client is bound (a deployment
 * concern — clientId / clientSecret / JWT references resolve via the provider `Configuration`), the SDK's
 * operations throw an explicit "bind the real RingCentral client" error, so `Connect` fails loudly rather
 * than pretending.
 *
 * RingCentral **telephony** capability coverage (the §8 seed row, telephony side): inbound routing +
 * outbound dial, audio in/out, DTMF, and call transfer. Telephony is **audio only** — no video, no
 * screen, and no Meeting Controls / facilitator surface (a 1:1 call has no roster to facilitate). Those
 * features are absent from the telephony provider row, and the base's `GetMeetingControlsEventSource`
 * returns `null`. (RingCentral Video meetings could be a separate provider row / meeting driver later.)
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeBridge, BaseTelephonyBridge } from '@memberjunction/ai-bridge-base';
import { RingCentralCallSdkFactory } from './ringcentral-call-sdk';

/**
 * The `DriverClass` key {@link RingCentralBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'RingCentralBridge'` resolves to this driver via the `ClassFactory`.
 */
export const RINGCENTRAL_BRIDGE_DRIVER_CLASS = 'RingCentralBridge';

/**
 * Realtime Bridge driver for **RingCentral** telephony (Voice / Call Control API).
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path); it binds the
 * {@link RingCentralCallSdkFactory} so a real deployment only needs to wire the RingCentral client behind
 * it (or a test injects a `FakeRingCentralCallSdk` via {@link BaseTelephonyBridge.SetSdkFactory}).
 * Everything else is inherited from {@link BaseTelephonyBridge}.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'RingCentralBridge')` — the engine resolves any
 * bridge driver against the `BaseRealtimeBridge` root, so a telephony driver registers under that same
 * root.
 */
@RegisterClass(BaseRealtimeBridge, RINGCENTRAL_BRIDGE_DRIVER_CLASS)
export class RingCentralBridge extends BaseTelephonyBridge {
    /**
     * Wires the RingCentral SDK factory onto the telephony base. The factory builds a
     * {@link RingCentralCallSdk} which — until a real RingCentral client is bound — throws an explicit
     * "bind the real RingCentral client" error from every operation, so `Connect` fails loudly. A
     * deployment binds the real client behind the factory; tests override it via
     * {@link BaseTelephonyBridge.SetSdkFactory}.
     */
    constructor() {
        super();
        this.SetSdkFactory(RingCentralCallSdkFactory);
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration
 * of {@link RingCentralBridge} and may eliminate it. Import and call this no-op from a static code path
 * (the package entry point does) so the `ClassFactory` can resolve `'RingCentralBridge'`.
 */
export function LoadRingCentralBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
