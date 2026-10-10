/**
 * @fileoverview Reading a live avatar's status back from JSON.
 *
 * The mint result carries the session's {@link RealtimeAvatarStatus} as a JSON string (`AvatarStatusJson`), the way it
 * carries its other optional objects. The browser reads it back with {@link ParseRealtimeAvatarStatus}, which accepts
 * only the shape: anything else reads as no status, so the call shows no notice rather than a wrong one. A reason this
 * version doesn't know, such as a newer server's, is dropped and the status marked `ReasonUnknown`, so the call can still
 * say it is audio only.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

import type { JSONValue, RealtimeAvatarStatus, RealtimeAvatarUnavailableReason } from './baseRealtime';

/** Every reason this version knows. A reason added to the union and left out here fails to compile. */
const KNOWN_REASONS: Readonly<Record<RealtimeAvatarUnavailableReason, true>> = {
    endpoint: true,
    bridged: true,
    'custom-disabled': true,
    'unknown-avatar': true,
    'no-binding': true,
    host: true,
    browser: true,
    'decoder-missing': true,
    'decoder-failed': true,
    'publish-failed': true,
};

/** Whether a JSON value is a reason this version knows. */
function isKnownReason(value: JSONValue): value is RealtimeAvatarUnavailableReason {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(KNOWN_REASONS, value);
}

/**
 * Every {@link RealtimeAvatarUnavailableReason} this version knows, for code that reads a reason back from text (a meeting
 * bot's `mj.agentAvatar` attribute). Drawn from the same table {@link ParseRealtimeAvatarStatus} reads with, so the two
 * never disagree.
 */
export const REALTIME_AVATAR_UNAVAILABLE_REASONS: readonly RealtimeAvatarUnavailableReason[] = Object.keys(KNOWN_REASONS).filter(isKnownReason);

/** A {@link RealtimeAvatarStatus} as {@link ParseRealtimeAvatarStatus} reads it back from JSON. */
export interface ParsedRealtimeAvatarStatus extends RealtimeAvatarStatus {
    /**
     * `true` when the JSON named a reason this version doesn't know, such as a newer server's: `Reason` is then absent,
     * and `Requested` and `Granted` stand. Absent otherwise.
     */
    ReasonUnknown?: boolean;
}

/** The status a parsed JSON value describes, or `null` when it is not one. */
function readStatus(value: JSONValue): ParsedRealtimeAvatarStatus | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const requested = value['Requested'];
    const granted = value['Granted'];
    if (typeof requested !== 'boolean' || typeof granted !== 'boolean') {
        return null;
    }
    const reason = value['Reason'];
    if (reason === undefined || reason === null) {
        return { Requested: requested, Granted: granted };
    }
    if (isKnownReason(reason)) {
        return { Requested: requested, Granted: granted, Reason: reason };
    }
    // Text is a reason this version doesn't know, such as a newer server's: the status stands without it. A reason that
    // isn't text means the JSON isn't a status.
    return typeof reason === 'string' ? { Requested: requested, Granted: granted, ReasonUnknown: true } : null;
}

/**
 * Reads a {@link RealtimeAvatarStatus} from its JSON string.
 *
 * @param json The status as JSON (the mint result's `AvatarStatusJson`), or nothing.
 * @returns The status; `null` when there is none, the JSON is malformed, or a field is missing or of the wrong type (a
 *   reason that isn't text included). A reason this version does not know, such as a newer server's, is left out and the
 *   status marked `ReasonUnknown`.
 */
export function ParseRealtimeAvatarStatus(json: string | null | undefined): ParsedRealtimeAvatarStatus | null {
    if (!json) {
        return null;
    }
    let parsed: JSONValue;
    try {
        parsed = JSON.parse(json) as JSONValue;
    } catch {
        return null;
    }
    return readStatus(parsed);
}
