/**
 * @fileoverview `TwilioBridge` — the first telephony Realtime Bridge driver, connecting the one realtime
 * agent engine to a **phone call over Twilio Programmable Voice + Media Streams**. It is the reference
 * telephony driver the RingCentral + Vonage drivers copy.
 *
 * `TwilioBridge` is intentionally **thin**: nearly all behavior — outbound dial / inbound answer, the
 * single-party audio media seam, DTMF send/receive, call transfer, the trivial caller+agent roster, and
 * the capability gating — is inherited from {@link BaseTelephonyBridge} (`@memberjunction/ai-bridge-base`).
 * The driver supplies only the **Twilio binding**: it points the base's SDK creation seam at the
 * {@link TwilioCallSdkFactory}, which builds a {@link TwilioCallSdk} over the real Twilio client (REST +
 * Media Streams). Until a real Twilio client is bound (a deployment concern), the SDK's operations throw
 * an explicit "bind the real Twilio client" error, so `Connect` fails loudly rather than pretending.
 *
 * Twilio capability coverage (per the §8 seed row): inbound DID routing + outbound dial, audio in/out,
 * DTMF, and call transfer. Telephony is **audio only** — no video, no screen, and no Meeting Controls /
 * facilitator surface (a 1:1 call has no roster to facilitate). Those features are absent from the
 * provider row, and the base's `GetMeetingControlsEventSource` returns `null`.
 *
 * @module @memberjunction/ai-bridge-twilio
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeBridge, BaseTelephonyBridge } from '@memberjunction/ai-bridge-base';
import { TwilioCallSdkFactory } from './twilio-call-sdk';

/**
 * The `DriverClass` key {@link TwilioBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'TwilioBridge'` resolves to this driver via the `ClassFactory`.
 */
export const TWILIO_BRIDGE_DRIVER_CLASS = 'TwilioBridge';

/**
 * Realtime Bridge driver for **Twilio** telephony (Programmable Voice + Media Streams).
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path); it binds the
 * {@link TwilioCallSdkFactory} so a real deployment only needs to wire the Twilio client behind it (or a
 * test injects a `FakeTwilioCallSdk` via {@link BaseTelephonyBridge.SetSdkFactory}). Everything else is
 * inherited from {@link BaseTelephonyBridge}.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'TwilioBridge')` — the engine resolves any bridge
 * driver against the `BaseRealtimeBridge` root, so a telephony driver registers under that same root.
 */
@RegisterClass(BaseRealtimeBridge, TWILIO_BRIDGE_DRIVER_CLASS)
export class TwilioBridge extends BaseTelephonyBridge {
    /**
     * Wires the Twilio SDK factory onto the telephony base. The factory builds a {@link TwilioCallSdk}
     * which — until a real Twilio client is bound — throws an explicit "bind the real Twilio client"
     * error from every operation, so `Connect` fails loudly. A deployment binds the real client behind
     * the factory; tests override it via {@link BaseTelephonyBridge.SetSdkFactory}.
     */
    constructor() {
        super();
        this.SetSdkFactory(TwilioCallSdkFactory);
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration
 * of {@link TwilioBridge} and may eliminate it. Import and call this no-op from a static code path (the
 * package entry point does) so the `ClassFactory` can resolve `'TwilioBridge'`.
 */
export function LoadTwilioBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
