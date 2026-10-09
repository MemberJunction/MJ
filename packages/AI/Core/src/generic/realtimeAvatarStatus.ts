/**
 * @fileoverview Reading a live avatar's status back from JSON.
 *
 * The mint result carries the session's {@link RealtimeAvatarStatus} as a JSON string (`AvatarStatusJson`), the way it
 * carries its other optional objects. The browser reads it back with {@link ParseRealtimeAvatarStatus}, which accepts
 * only the shape and the reasons this version knows: anything else reads as no status, so the call shows no notice
 * rather than a wrong one.
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

/** The status a parsed JSON value describes, or `null` when it is not one. */
function readStatus(value: JSONValue): RealtimeAvatarStatus | null {
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
    return isKnownReason(reason) ? { Requested: requested, Granted: granted, Reason: reason } : null;
}

/**
 * Reads a {@link RealtimeAvatarStatus} from its JSON string.
 *
 * @param json The status as JSON (the mint result's `AvatarStatusJson`), or nothing.
 * @returns The status; `null` when there is none, the JSON is malformed, a field is missing or of the wrong type, or the
 *   reason is one this version does not know.
 */
export function ParseRealtimeAvatarStatus(json: string | null | undefined): RealtimeAvatarStatus | null {
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
