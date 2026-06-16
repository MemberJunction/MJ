/**
 * @fileoverview `VonageBridge` — a telephony Realtime Bridge driver, connecting the one realtime agent
 * engine to a **phone call over the Vonage Voice API + websocket media**. It mirrors the reference
 * telephony driver {@link import('@memberjunction/ai-bridge-twilio').TwilioBridge}.
 *
 * `VonageBridge` is intentionally **thin**: nearly all behavior — outbound dial / inbound answer, the
 * single-party audio media seam, DTMF send/receive, call transfer, the trivial caller+agent roster, and
 * the capability gating — is inherited from {@link BaseTelephonyBridge} (`@memberjunction/ai-bridge-base`).
 * The driver supplies only the **Vonage binding**: it points the base's SDK creation seam at the
 * {@link VonageCallSdkFactory}, which builds a {@link VonageCallSdk} over the real Vonage client (Voice
 * API + websocket media). Until a real Vonage client is bound (a deployment concern), the SDK's
 * operations throw an explicit "bind the real Vonage client" error, so `Connect` fails loudly rather than
 * pretending.
 *
 * Vonage capability coverage (per the §8 seed row): inbound DID routing + outbound dial, audio in/out,
 * DTMF, and call transfer. Telephony is **audio only** — no video, no screen, and no Meeting Controls /
 * facilitator surface (a 1:1 call has no roster to facilitate). Those features are absent from the
 * provider row, and the base's `GetMeetingControlsEventSource` returns `null`.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeBridge, BaseTelephonyBridge } from '@memberjunction/ai-bridge-base';
import { VonageCallSdkFactory } from './vonage-call-sdk';

/**
 * The `DriverClass` key {@link VonageBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'VonageBridge'` resolves to this driver via the `ClassFactory`.
 */
export const VONAGE_BRIDGE_DRIVER_CLASS = 'VonageBridge';

/**
 * Realtime Bridge driver for **Vonage** telephony (Voice API + websocket media).
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path); it binds the
 * {@link VonageCallSdkFactory} so a real deployment only needs to wire the Vonage client behind it (or a
 * test injects a `FakeVonageCallSdk` via {@link BaseTelephonyBridge.SetSdkFactory}). Everything else is
 * inherited from {@link BaseTelephonyBridge}.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'VonageBridge')` — the engine resolves any bridge
 * driver against the `BaseRealtimeBridge` root, so a telephony driver registers under that same root.
 */
@RegisterClass(BaseRealtimeBridge, VONAGE_BRIDGE_DRIVER_CLASS)
export class VonageBridge extends BaseTelephonyBridge {
    /**
     * Wires the Vonage SDK factory onto the telephony base. The factory builds a {@link VonageCallSdk}
     * which — until a real Vonage client is bound — throws an explicit "bind the real Vonage client"
     * error from every operation, so `Connect` fails loudly. A deployment binds the real client behind
     * the factory; tests override it via {@link BaseTelephonyBridge.SetSdkFactory}.
     */
    constructor() {
        super();
        this.SetSdkFactory(VonageCallSdkFactory);
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration
 * of {@link VonageBridge} and may eliminate it. Import and call this no-op from a static code path (the
 * package entry point does) so the `ClassFactory` can resolve `'VonageBridge'`.
 */
export function LoadVonageBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
