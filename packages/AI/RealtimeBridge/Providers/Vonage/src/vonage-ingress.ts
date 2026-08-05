/**
 * @fileoverview Vonage inbound-ingress **pure** helpers — request-signature / JWT verification, the
 * inbound-answer NCCO builder, and the webhook→call mapper. These are the framework-free pieces of the
 * MJAPI Vonage ingress: no Express, no network, no DB, so they unit-test directly and the MJAPI router can
 * call them verbatim once the live wiring lands.
 *
 * The remaining **live** ingress — `POST /telephony/vonage/answer` (returns the NCCO), `POST
 * /telephony/vonage/event`, `WSS /telephony/vonage/media`, the `Telephony.PlaceCall` mutation, and the
 * credential config block — is documented in
 * `plans/realtime/bridges-and-widget/spikes/T2-T3-vonage-ringcentral-notes.md` and is gated on real Vonage
 * credentials + a publicly reachable URL.
 *
 * ## Vonage auth deltas vs Twilio
 * Vonage signs each webhook one of two ways (per the account's chosen scheme):
 * - **Signed-request (`sig`)**: an HMAC of the request params (sorted, `&`-joined, with the timestamp)
 *   keyed by the account **signature secret** — {@link verifyVonageSignature}. This is the analogue of
 *   Twilio's `X-Twilio-Signature`, but HMAC-SHA256 over a `&`/`=`-joined param string (Twilio is HMAC-SHA1
 *   over a URL + concatenated params).
 * - **JWT**: a signed JWT in the `Authorization: Bearer` header, HS256-signed with the signature secret —
 *   {@link verifyVonageJwt}. We verify the HS256 signature + `exp` without pulling in a JWT library.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §T2, §4 (B).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { buildConnectNcco, NccoAction } from './real-vonage-bindings';

/**
 * Verifies a Vonage **signed-request** webhook per Vonage's documented scheme:
 *
 * 1. Take the request params (excluding the `sig` param itself), sort by key.
 * 2. Join as `&key=value` pairs (`&` prefix on each), prepended with the signature secret rule, then
 *    HMAC-SHA256 with the account **signature secret** as the key; hex-encode the digest (uppercased).
 * 3. Constant-time-compare against the supplied `sig`.
 *
 * A missing/empty `sig` rejects. Comparison is constant-time ({@link timingSafeEqual}) to avoid leaking
 * the expected signature via timing. Pure + exported so it unit-tests with a known vector and the MJAPI
 * router calls it on every public Vonage endpoint (these can't carry an MJ JWT).
 *
 * @param signatureSecret The Vonage account signature secret (the HMAC key; resolved upstream — never inlined).
 * @param sig The `sig` param Vonage sent (the signature to check).
 * @param params The webhook params (the `sig` param is ignored if present).
 * @returns `true` when the signature is valid; `false` otherwise (including a missing `sig`).
 */
export function verifyVonageSignature(
    signatureSecret: string,
    sig: string | undefined,
    params: Record<string, string>,
): boolean {
    if (!sig) {
        return false;
    }
    const expected = computeVonageSignature(signatureSecret, params);
    return constantTimeEquals(expected, sig);
}

/**
 * Computes the Vonage signed-request signature (uppercased hex HMAC-SHA256) over the sorted params.
 * Exported so tests construct a known-good vector and the live router can sign/verify without duplicating
 * the concat rule. The `sig` param is excluded from the signed set.
 *
 * @param signatureSecret The Vonage signature secret (HMAC key).
 * @param params The webhook params.
 * @returns The uppercased hex HMAC-SHA256 signature.
 */
export function computeVonageSignature(signatureSecret: string, params: Record<string, string>): string {
    const data = concatSortedParams(params);
    return createHmac('sha256', signatureSecret).update(data, 'utf8').digest('hex').toUpperCase();
}

/** The decoded, verified claims of a Vonage webhook JWT (the subset we read). */
export interface VonageJwtClaims {
    /** The application id the JWT was issued for. */
    application_id?: string;
    /** Issued-at epoch seconds. */
    iat?: number;
    /** Expiry epoch seconds (verified against `nowSeconds` when present). */
    exp?: number;
    /** Any other JWT claims, typed without widening to `any`. */
    [claim: string]: unknown;
}

/**
 * Verifies a Vonage webhook **JWT** (HS256, signed with the signature secret) and returns its claims, or
 * `null` when the token is malformed, mis-signed, or expired. Verifies the HS256 signature + `exp`
 * directly (no JWT library): split `header.payload.signature`, recompute `HMAC-SHA256(header.payload)`
 * base64url, constant-time-compare, then check expiry.
 *
 * @param signatureSecret The Vonage signature secret (the HS256 HMAC key; resolved upstream — never inlined).
 * @param bearerToken The `Authorization: Bearer <token>` value (or the raw token).
 * @param nowSeconds The current epoch seconds (injected so the check is deterministic in tests).
 * @returns The verified claims, or `null` when verification fails.
 */
export function verifyVonageJwt(
    signatureSecret: string,
    bearerToken: string | undefined,
    nowSeconds: number,
): VonageJwtClaims | null {
    const token = stripBearer(bearerToken);
    if (!token) {
        return null;
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const expected = base64UrlHmacSha256(signatureSecret, `${headerB64}.${payloadB64}`);
    if (!constantTimeEquals(expected, signatureB64)) {
        return null;
    }
    const claims = decodeJwtClaims(payloadB64);
    if (!claims) {
        return null;
    }
    if (typeof claims.exp === 'number' && claims.exp <= nowSeconds) {
        return null;
    }
    return claims;
}

/**
 * The NCCO returned to an inbound call's **answer** webhook to connect its bidirectional WebSocket media
 * leg. Identical `connect` websocket shape as the outbound path (it reuses {@link buildConnectNcco}), so
 * inbound and outbound legs share one media contract.
 *
 * @param mediaWssUrl The `wss://…/telephony/vonage/media` endpoint to connect the inbound call's audio to.
 * @param contentType Optional wire content-type (defaults to `audio/l16;rate=8000`).
 * @returns The NCCO document (a JSON array) to return to Vonage as the answer-webhook response.
 */
export function buildInboundAnswerNcco(mediaWssUrl: string, contentType?: string): NccoAction[] {
    return buildConnectNcco(mediaWssUrl, contentType);
}

/** The resolved identity of an inbound Vonage call, mapped from the answer/event-webhook params. */
export interface ResolvedInboundCall {
    /** The inbound call UUID (Vonage `uuid` / `conversation_uuid`). */
    callId: string;
    /** The caller's number (Vonage `from`). */
    from: string;
    /** The dialed DID the call came in on (Vonage `to`). */
    to: string;
}

/**
 * Maps the Vonage inbound answer/event-webhook params to a {@link ResolvedInboundCall}. Pure + exported so
 * the MJAPI router resolves the dialed DID → agent identity → `AIBridgeEngine.StartBridgeSession` without
 * re-parsing Vonage's param names. Accepts `uuid` or `conversation_uuid` for the call id. Throws when a
 * required param is absent so a malformed webhook fails loud.
 *
 * @param params The Vonage inbound webhook params.
 * @returns The `{ callId, from, to }` mapping.
 * @throws When the call id (`uuid`/`conversation_uuid`), `from`, or `to` is missing.
 */
export function resolveInboundCall(params: Record<string, string>): ResolvedInboundCall {
    const callId = params['uuid'] || params['conversation_uuid'];
    const from = params['from'];
    const to = params['to'];
    if (!callId || !from || !to) {
        throw new Error(
            'resolveInboundCall: Vonage inbound webhook missing a required param (uuid/conversation_uuid / from / to). ' +
                `Got keys: [${Object.keys(params).join(', ')}].`,
        );
    }
    return { callId, from, to };
}

/** Concatenates params sorted by key as `&key=value` (Vonage's signature input), excluding `sig`. */
function concatSortedParams(params: Record<string, string>): string {
    return Object.keys(params)
        .filter((key) => key !== 'sig')
        .sort()
        .map((key) => `&${key}=${params[key]}`)
        .join('');
}

/** Strips an optional `Bearer ` prefix, returning the bare token (or `undefined` when empty). */
function stripBearer(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const trimmed = value.startsWith('Bearer ') ? value.slice('Bearer '.length) : value;
    return trimmed.length > 0 ? trimmed : undefined;
}

/** Computes the base64url HMAC-SHA256 of `signingInput` keyed by the secret (the JWT signature form). */
function base64UrlHmacSha256(secret: string, signingInput: string): string {
    return createHmac('sha256', secret).update(signingInput, 'utf8').digest('base64url');
}

/** Decodes a base64url JWT payload segment to its claims object, or `null` on malformed JSON. */
function decodeJwtClaims(payloadB64: string): VonageJwtClaims | null {
    try {
        const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
        const parsed: unknown = JSON.parse(json);
        if (parsed && typeof parsed === 'object') {
            return parsed as VonageJwtClaims;
        }
        return null;
    } catch {
        return null;
    }
}

/** Constant-time string compare on the signatures, length-safe (mismatched lengths return false). */
function constantTimeEquals(a: string, b: string): boolean {
    const bufA = new Uint8Array(Buffer.from(a, 'utf8'));
    const bufB = new Uint8Array(Buffer.from(b, 'utf8'));
    if (bufA.length !== bufB.length) {
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}
