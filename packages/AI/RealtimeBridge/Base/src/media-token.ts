/**
 * @fileoverview Per-call media-socket tokens, shared by every carrier binding.
 *
 * A carrier's media websocket is public — it cannot present an MJ JWT — so MJ mints a random secret per call,
 * hands it to the carrier inside the TwiML / NCCO the carrier will execute, and requires the websocket to
 * present it back. There is exactly ONE implementation of minting and comparing such tokens (here), used by the
 * Twilio and Vonage provider bindings and by the telephony server adapters that verify the sockets.
 *
 * @module @memberjunction/ai-bridge-base
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Byte length of a media token (rendered as hex, so the token is twice this many characters). */
const MEDIA_TOKEN_BYTES = 32;

/** Mints a fresh, unguessable per-call media token (256 bits of CSPRNG output, hex). */
export function GenerateMediaToken(): string {
    return randomBytes(MEDIA_TOKEN_BYTES).toString('hex');
}

/**
 * Constant-time comparison of the registered token against the one a socket presented. A missing token or a
 * length mismatch is a plain `false` (MJ-minted tokens have a fixed length, so this leaks nothing).
 *
 * @param expected The token MJ registered for the call.
 * @param presented The token the connecting socket supplied (may be absent).
 * @returns `true` only when both are present and byte-identical.
 */
export function MediaTokensEqual(expected: string, presented: string | undefined): boolean {
    if (!presented) {
        return false;
    }
    const expectedBytes = new Uint8Array(Buffer.from(expected, 'utf8'));
    const presentedBytes = new Uint8Array(Buffer.from(presented, 'utf8'));
    if (expectedBytes.length !== presentedBytes.length) {
        return false;
    }
    return timingSafeEqual(expectedBytes, presentedBytes);
}
