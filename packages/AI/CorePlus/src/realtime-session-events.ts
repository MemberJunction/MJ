/**
 * @fileoverview Framework-neutral contract for **realtime session events**.
 *
 * A realtime session event is a small, typed, server-originated message addressed to ONE live
 * realtime session (`MJ: AI Agent Sessions` row). It is how the server tells a running session
 * something the session could not have learned on its own: the person on the other end just
 * verified their email, a limit changed, an app-side handler finished some work.
 *
 * Events are deliberately generic ("verification is the first event type, not a special case").
 * The transport (a GraphQL subscription over MJServer's PubSub) lives in `@memberjunction/server`;
 * this module owns only the **shape**, so the browser runtime, an Angular element, an Open App
 * server subscriber and a test can all agree on it without importing any of those packages.
 *
 * ## Adding an event type
 *
 * 1. Add its payload interface to {@link RealtimeSessionEventPayloadMap}. The map is an
 *    `interface`, so an Open App can extend it from its own package with declaration merging:
 *    ```ts
 *    declare module '@memberjunction/ai-core-plus' {
 *        interface RealtimeSessionEventPayloadMap {
 *            'acme.quote.ready': { QuoteID: string };
 *        }
 *    }
 *    ```
 * 2. Publish it server-side with `RealtimeSessionEventService.Publish(...)`.
 * 3. Handle it client-side by `Type`. A client MUST ignore types it does not know — a newer
 *    server may emit types an older browser bundle has never heard of.
 *
 * ## Wire format
 *
 * On the wire the payload travels as a JSON **string** (`PayloadJson`), the repo's usual pattern
 * for complex GraphQL payloads. {@link ParseRealtimeSessionEvent} is the one place that turns the
 * wire shape back into a {@link RealtimeSessionEvent}; it validates rather than casts.
 *
 * @module @memberjunction/ai-core-plus
 */

/** A JSON-serializable scalar. */
export type RealtimeSessionJSONPrimitive = string | number | boolean | null;

/** Any JSON-serializable value. Event payloads must be representable as one. */
export type RealtimeSessionJSONValue =
    | RealtimeSessionJSONPrimitive
    | RealtimeSessionJSONValue[]
    | { [key: string]: RealtimeSessionJSONValue | undefined };

/** A JSON object — the required shape of every event payload. */
export type RealtimeSessionJSONObject = { [key: string]: RealtimeSessionJSONValue | undefined };

/**
 * Payload of the `identity.verified` event.
 *
 * Emitted exactly once per successful verification (link redemption or typed code), after the
 * server has recorded the verification on the session. The session's principal does **not**
 * change — this event, not a token swap, is how a running session learns the person is verified.
 */
export interface IdentityVerifiedEventPayload {
    /** The email address the person proved they control, lower-cased and trimmed. */
    VerifiedEmail: string;
    /** The name the person gave when they asked for verification, as stored (trimmed, length-capped). */
    VerifiedName: string;
    /** ISO-8601 instant the verification completed (server clock). */
    VerifiedAt: string;
    /** How the person proved it: they followed the emailed link, or typed the emailed code. */
    Method: 'link' | 'code';
    /**
     * The session's NEW absolute deadline (ISO-8601), present only when verification extended it.
     * The server is authoritative: the janitor enforces this value regardless of what a client does
     * with it. A client uses it only to keep its own abuse guard in step.
     */
    MaxSessionDeadlineIso?: string;
}

/**
 * Event type → payload map. Every key is a valid {@link RealtimeSessionEvent.Type}.
 *
 * Declared as an `interface` so Open Apps can add their own event types through declaration
 * merging (see the module header). Keys of the form `<vendor>.<noun>.<verb>` are recommended;
 * unprefixed names are reserved for MemberJunction core.
 */
export interface RealtimeSessionEventPayloadMap {
    'identity.verified': IdentityVerifiedEventPayload;
}

/** Every event type this build of the contract knows about (including merged-in app types). */
export type RealtimeSessionEventType = keyof RealtimeSessionEventPayloadMap;

/** The payload type for event type `T`. */
export type RealtimeSessionEventPayload<T extends RealtimeSessionEventType> = RealtimeSessionEventPayloadMap[T];

/**
 * Constants for the core event types, so call sites never repeat a magic string.
 */
export const REALTIME_SESSION_EVENT_TYPES = {
    /** The person verified their email. See {@link IdentityVerifiedEventPayload}. */
    IdentityVerified: 'identity.verified',
} as const satisfies Record<string, RealtimeSessionEventType>;

/**
 * A session event addressed to one realtime session.
 *
 * @typeParam T - the event type. Defaults to the union of all known types, in which case
 *   {@link RealtimeSessionEvent.Payload} is the matching union (narrow it by checking `Type`).
 */
export type RealtimeSessionEvent<T extends RealtimeSessionEventType = RealtimeSessionEventType> = {
    [K in T]: {
        /** Discriminator. Clients ignore types they do not recognise. */
        Type: K;
        /** The `MJ: AI Agent Sessions` ID the event is addressed to. */
        AgentSessionID: string;
        /** ISO-8601 instant the server emitted the event. */
        OccurredAt: string;
        /** Type-specific data. */
        Payload: RealtimeSessionEventPayload<K>;
    };
}[T];

/**
 * An event whose `Type` is not (yet) in {@link RealtimeSessionEventPayloadMap} — what a client
 * sees when a newer server emits an event type its bundle predates. Carry it, log it, ignore it.
 */
export interface UnknownRealtimeSessionEvent {
    Type: string;
    AgentSessionID: string;
    OccurredAt: string;
    Payload: RealtimeSessionJSONObject;
}

/**
 * The wire shape of an event, as the GraphQL subscription delivers it: the payload is a JSON
 * string. This is the input to {@link ParseRealtimeSessionEvent}.
 */
export interface RealtimeSessionEventWire {
    Type: string;
    AgentSessionID: string;
    OccurredAt: string;
    PayloadJson: string;
}

/** True for a plain (non-array, non-null) object. */
function isJSONObject(value: unknown): value is RealtimeSessionJSONObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for {@link IdentityVerifiedEventPayload}: checks every required field's type, so a
 * handler can trust the payload after the guard instead of trusting the sender.
 */
export function IsIdentityVerifiedEventPayload(value: unknown): value is IdentityVerifiedEventPayload {
    if (!isJSONObject(value)) {
        return false;
    }
    return (
        isNonEmptyString(value['VerifiedEmail']) &&
        typeof value['VerifiedName'] === 'string' &&
        isNonEmptyString(value['VerifiedAt']) &&
        (value['Method'] === 'link' || value['Method'] === 'code') &&
        (value['MaxSessionDeadlineIso'] === undefined || typeof value['MaxSessionDeadlineIso'] === 'string')
    );
}

/**
 * Serializes an event to its wire shape.
 *
 * Accepts any event-shaped object (a {@link RealtimeSessionEvent}, an {@link UnknownRealtimeSessionEvent},
 * or a publisher's generic payload) so a typed publisher needs no cast.
 *
 * @param event - the event to send
 * @returns the wire shape with the payload JSON-encoded
 */
export function SerializeRealtimeSessionEvent(event: {
    Type: string;
    AgentSessionID: string;
    OccurredAt: string;
    Payload: object;
}): RealtimeSessionEventWire {
    return {
        Type: event.Type,
        AgentSessionID: event.AgentSessionID,
        OccurredAt: event.OccurredAt,
        PayloadJson: JSON.stringify(event.Payload),
    };
}

/**
 * Parses a wire event into a typed event, validating instead of casting.
 *
 * - A **known** type whose payload fails its guard returns `null` (a malformed event is dropped,
 *   never delivered half-trusted).
 * - An **unknown** type returns an {@link UnknownRealtimeSessionEvent} so callers can log/ignore it.
 * - Anything structurally broken (missing fields, unparseable JSON, payload not an object) returns `null`.
 *
 * @param wire - the event as delivered by the subscription
 * @returns the parsed event, or `null` when it is malformed
 */
export function ParseRealtimeSessionEvent(
    wire: RealtimeSessionEventWire,
): RealtimeSessionEvent | UnknownRealtimeSessionEvent | null {
    if (!isNonEmptyString(wire.Type) || !isNonEmptyString(wire.AgentSessionID) || !isNonEmptyString(wire.OccurredAt)) {
        return null;
    }
    let payload: unknown;
    try {
        payload = JSON.parse(wire.PayloadJson);
    } catch {
        return null; // a malformed payload is data we cannot interpret; the caller drops the event
    }
    if (!isJSONObject(payload)) {
        return null;
    }
    if (wire.Type === REALTIME_SESSION_EVENT_TYPES.IdentityVerified) {
        if (!IsIdentityVerifiedEventPayload(payload)) {
            return null;
        }
        return { Type: wire.Type, AgentSessionID: wire.AgentSessionID, OccurredAt: wire.OccurredAt, Payload: payload };
    }
    return { Type: wire.Type, AgentSessionID: wire.AgentSessionID, OccurredAt: wire.OccurredAt, Payload: payload };
}

/**
 * Narrowing helper: is `event` the known event type `T`?
 *
 * @example
 * ```ts
 * const event = ParseRealtimeSessionEvent(wire);
 * if (event && IsRealtimeSessionEventOfType(event, 'identity.verified')) {
 *     event.Payload.VerifiedEmail; // typed
 * }
 * ```
 */
export function IsRealtimeSessionEventOfType<T extends RealtimeSessionEventType>(
    event: RealtimeSessionEvent | UnknownRealtimeSessionEvent,
    type: T,
): event is RealtimeSessionEvent<T> {
    return event.Type === type;
}
