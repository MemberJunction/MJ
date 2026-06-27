/**
 * @fileoverview RingCentral inbound-ingress **pure** helpers — the webhook **validation-token** handshake,
 * the delivery **verification-token** check, and the webhook→session mapper. These are the framework-free
 * pieces of the MJAPI RingCentral ingress: no Express, no network, no DB, so they unit-test directly and
 * the MJAPI router can call them verbatim once the live wiring lands.
 *
 * The remaining **live** ingress — the `POST /telephony/ringcentral/*` subscription/notification routes,
 * the media stream, the `Telephony.PlaceCall` mutation, and the OAuth (JWT/3-legged) credential config
 * block — is documented in `plans/realtime/bridges-and-widget/spikes/T2-T3-vonage-ringcentral-notes.md`
 * and is gated on real RingCentral credentials + a publicly reachable URL.
 *
 * ## RingCentral auth deltas vs Twilio / Vonage
 * RingCentral does NOT sign each webhook with an HMAC (that's Twilio/Vonage). Instead:
 * - **Subscription registration** uses a **`Validation-Token` handshake**: when RingCentral first
 *   registers a webhook it sends a `Validation-Token` request header; the endpoint MUST echo it back in
 *   the response `Validation-Token` header (and 200) to prove ownership — {@link handleValidationToken}.
 * - **Delivery** carries a **`verification-token`** (the token the subscription was created with) that the
 *   endpoint compares (constant-time) to its configured value to authenticate each notification —
 *   {@link verifyRingCentralWebhook}.
 * - The Call Control API itself is authenticated by **OAuth (JWT/3-legged)** on the REST client, resolved
 *   upstream — not a per-request webhook signature.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §T3, §4 (B).
 */

import { timingSafeEqual } from 'node:crypto';

/** The result of the RingCentral webhook validation-token handshake the router echoes back. */
export interface ValidationTokenResponse {
    /** The `Validation-Token` response header value to echo (the request's token verbatim). */
    ValidationToken: string;
}

/**
 * Handles the RingCentral webhook **validation-token** handshake: when present, the endpoint MUST echo the
 * incoming `Validation-Token` request-header value back on the response (with 200) to prove endpoint
 * ownership during subscription registration. Returns the echo response when the header is present, or
 * `null` when this is a normal delivery (not a handshake) so the router can fall through to
 * {@link verifyRingCentralWebhook}.
 *
 * Pure + exported so it unit-tests with no network and the MJAPI router calls it on every RingCentral
 * webhook request before processing the body.
 *
 * @param validationTokenHeader The `Validation-Token` request-header value (case-insensitive header name).
 * @returns The echo response, or `null` when no validation token is present.
 */
export function handleValidationToken(validationTokenHeader: string | undefined): ValidationTokenResponse | null {
    if (!validationTokenHeader || validationTokenHeader.length === 0) {
        return null;
    }
    return { ValidationToken: validationTokenHeader };
}

/**
 * Verifies a RingCentral webhook **delivery** by constant-time-comparing the request's `verification-token`
 * header against the token the subscription was created with (resolved upstream — never inlined). A
 * missing/empty header rejects. Comparison is constant-time ({@link timingSafeEqual}) to avoid leaking the
 * expected token via timing. Pure + exported so it unit-tests with a known token and the MJAPI router calls
 * it on every public RingCentral notification (these can't carry an MJ JWT).
 *
 * @param expectedToken The verification token configured on the subscription (resolved upstream).
 * @param verificationTokenHeader The `verification-token` request-header value.
 * @returns `true` when the token matches; `false` otherwise (including a missing header).
 */
export function verifyRingCentralWebhook(
    expectedToken: string,
    verificationTokenHeader: string | undefined,
): boolean {
    if (!verificationTokenHeader) {
        return false;
    }
    return constantTimeEquals(expectedToken, verificationTokenHeader);
}

/** The resolved identity of an inbound RingCentral call, mapped from a telephony-session notification. */
export interface ResolvedInboundCall {
    /** The inbound telephony session id (RingCentral `telephonySessionId`). */
    sessionId: string;
    /** The caller's number (the inbound party's `from`). */
    from: string;
    /** The dialed DID the call came in on (the inbound party's `to`). */
    to: string;
}

/**
 * The shape of a RingCentral telephony-session notification `body` (the subset we read). RingCentral
 * delivers call lifecycle as a `body` with a `telephonySessionId` and a `parties` array; the inbound party
 * carries the `from`/`to` numbers.
 */
export interface RingCentralNotificationBody {
    /** The telephony session id this notification is about. */
    telephonySessionId?: string;
    /** The session's parties (we read the inbound party's `from`/`to`). */
    parties?: Array<{
        /** The originating party (the caller). */
        from?: { phoneNumber?: string };
        /** The destination party (the dialed DID). */
        to?: { phoneNumber?: string };
    }>;
}

/**
 * Maps a RingCentral telephony-session notification body to a {@link ResolvedInboundCall}. Pure + exported
 * so the MJAPI router resolves the dialed DID → agent identity → `AIBridgeEngine.StartBridgeSession` without
 * re-parsing RingCentral's notification shape. Reads the session id + the first party's `from`/`to`. Throws
 * when a required field is absent so a malformed notification fails loud.
 *
 * @param body The RingCentral telephony-session notification body.
 * @returns The `{ sessionId, from, to }` mapping.
 * @throws When `telephonySessionId`, the party `from`, or the party `to` is missing.
 */
export function resolveInboundCall(body: RingCentralNotificationBody): ResolvedInboundCall {
    const sessionId = body.telephonySessionId;
    const party = body.parties?.[0];
    const from = party?.from?.phoneNumber;
    const to = party?.to?.phoneNumber;
    if (!sessionId || !from || !to) {
        throw new Error(
            'resolveInboundCall: RingCentral notification missing a required field ' +
                '(telephonySessionId / parties[0].from.phoneNumber / parties[0].to.phoneNumber).',
        );
    }
    return { sessionId, from, to };
}

/** Constant-time string compare on the tokens, length-safe (mismatched lengths return false). */
function constantTimeEquals(a: string, b: string): boolean {
    const bufA = new Uint8Array(Buffer.from(a, 'utf8'));
    const bufB = new Uint8Array(Buffer.from(b, 'utf8'));
    if (bufA.length !== bufB.length) {
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}
