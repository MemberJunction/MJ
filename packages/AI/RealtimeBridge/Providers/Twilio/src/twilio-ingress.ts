/**
 * @fileoverview Twilio inbound-ingress **pure** helpers — request-signature verification, the inbound
 * voice TwiML, and the webhook→call mapper. These are the framework-free pieces of the MJAPI Twilio
 * ingress: no Express, no network, no DB, so they unit-test directly and the MJAPI router can call them
 * verbatim once the live wiring lands.
 *
 * The remaining **live** ingress — `POST /telephony/twilio/voice`, `WSS /telephony/twilio/media`, the
 * `Telephony.PlaceCall` mutation, and the credential config block — is documented in
 * `plans/realtime/bridges-and-widget/spikes/T1-twilio-ingress-notes.md` and is gated on real Twilio
 * credentials + a publicly reachable URL.
 *
 * @module @memberjunction/ai-bridge-twilio
 * @author MemberJunction.com
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §2 (B), §3 (T1 B/C).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { buildConnectStreamTwiML } from './real-twilio-bindings';

/**
 * Verifies a Twilio webhook request signature per Twilio's documented scheme:
 *
 * 1. Start from the full request URL (scheme + host + path + query, exactly as Twilio called it).
 * 2. Append each POST param, sorted by parameter name, as `key + value` concatenated (no separators).
 * 3. HMAC-SHA1 the resulting string with the account **Auth Token** as the key; base64-encode the digest.
 * 4. Constant-time-compare against the `X-Twilio-Signature` header.
 *
 * A missing/empty signature header rejects. Comparison is constant-time ({@link timingSafeEqual}) to avoid
 * leaking the expected signature via timing. Pure + exported so it unit-tests with a known vector and the
 * MJAPI router calls it on every public Twilio endpoint (these can't carry an MJ JWT).
 *
 * @param authToken The Twilio account Auth Token (the HMAC key; resolved upstream — never inlined).
 * @param signatureHeader The `X-Twilio-Signature` request header value.
 * @param url The full request URL exactly as Twilio invoked it.
 * @param params The POST form parameters Twilio sent.
 * @returns `true` when the signature is valid; `false` otherwise (including a missing header).
 */
export function verifyTwilioSignature(
    authToken: string,
    signatureHeader: string | undefined,
    url: string,
    params: Record<string, string>,
): boolean {
    if (!signatureHeader) {
        return false;
    }
    const expected = computeTwilioSignature(authToken, url, params);
    return constantTimeEquals(expected, signatureHeader);
}

/**
 * Computes the Twilio request signature (base64 HMAC-SHA1) for a URL + sorted params. Exported so tests can
 * construct a known-good vector and the live router can sign/verify without duplicating the concat rule.
 *
 * @param authToken The Twilio Auth Token (HMAC key).
 * @param url The full request URL exactly as Twilio invoked it.
 * @param params The POST form parameters.
 * @returns The base64-encoded HMAC-SHA1 signature.
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
    const data = url + concatSortedParams(params);
    return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

/**
 * The TwiML returned to an inbound call's voice webhook to connect its bidirectional Media-Streams socket.
 * Identical `<Connect><Stream>` shape as the outbound path (it reuses {@link buildConnectStreamTwiML}), so
 * inbound and outbound legs share one media contract.
 *
 * @param streamWssUrl The `wss://…/telephony/twilio/media` endpoint to connect the inbound call's audio to.
 * @returns The TwiML document string to return to Twilio as the webhook response.
 */
export function buildInboundVoiceTwiML(streamWssUrl: string): string {
    return buildConnectStreamTwiML(streamWssUrl);
}

/** The resolved identity of an inbound Twilio call, mapped from the voice-webhook params. */
export interface ResolvedInboundCall {
    /** The inbound Call SID (Twilio `CallSid`). */
    callSid: string;
    /** The caller's number (Twilio `From`). */
    from: string;
    /** The dialed DID the call came in on (Twilio `To`). */
    to: string;
}

/**
 * Maps the Twilio inbound voice-webhook params to a {@link ResolvedInboundCall}. Pure + exported so the
 * MJAPI router resolves the dialed DID → agent identity → `AIBridgeEngine.StartBridgeSession` without
 * re-parsing Twilio's param names. Throws when a required param is absent so a malformed webhook fails loud.
 *
 * @param params The Twilio inbound voice-webhook POST params.
 * @returns The `{ callSid, from, to }` mapping.
 * @throws When `CallSid`, `From`, or `To` is missing.
 */
export function resolveInboundCall(params: Record<string, string>): ResolvedInboundCall {
    const callSid = params['CallSid'];
    const from = params['From'];
    const to = params['To'];
    if (!callSid || !from || !to) {
        throw new Error(
            'resolveInboundCall: Twilio inbound webhook missing a required param (CallSid / From / To). ' +
                `Got keys: [${Object.keys(params).join(', ')}].`,
        );
    }
    return { callSid, from, to };
}

/** Concatenates params sorted by key as `key + value` (Twilio's signature input), with no separators. */
function concatSortedParams(params: Record<string, string>): string {
    return Object.keys(params)
        .sort()
        .map((key) => key + params[key])
        .join('');
}

/** Constant-time string compare on the base64 signatures, length-safe (mismatched lengths return false). */
function constantTimeEquals(a: string, b: string): boolean {
    const bufA = new Uint8Array(Buffer.from(a, 'utf8'));
    const bufB = new Uint8Array(Buffer.from(b, 'utf8'));
    if (bufA.length !== bufB.length) {
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}
