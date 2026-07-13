/**
 * @fileoverview Microsoft Graph change-notification **ingress** pure helpers — the validation-token
 * handshake, the `clientState` shared-secret check, and the call/participant notification → normalized
 * state mapper, plus a `buildJoinByUrlRequest` convenience. These are the framework-free pieces of the
 * MJAPI Teams ingress: no Express, no network, no DB, so they unit-test directly and the MJAPI router can
 * call them verbatim once the live wiring lands.
 *
 * The remaining **live** ingress — the `POST /meetings/teams/notifications` endpoint, the
 * `Meeting.JoinByUrl(agentIdentityId, joinUrl)` mutation, and the Azure AD app registration (Graph
 * cloud-communications + chat permissions with tenant admin consent) — is documented in
 * `plans/realtime/bridges-and-widget/spikes/M1-teams-binding-notes.md` and is gated on real Teams/Azure
 * credentials + a publicly reachable Graph webhook URL.
 *
 * @module @memberjunction/ai-bridge-teams
 * @author MemberJunction.com
 * @see `/plans/realtime/bridges-and-widget/meeting-vendor-bindings-teams-slack.md` §2 (M1 B/C).
 */

import { timingSafeEqual } from 'node:crypto';
import { buildGraphCreateCallRequest, GraphCallParticipant, GraphCreateCallRequest } from './real-teams-bindings';
import { TeamsJoinArgs } from './teams-sdk';

/**
 * The result of the Graph change-notification **validation-token handshake**. When Microsoft Graph creates
 * (or renews) a subscription, it first calls the notification URL with a `?validationToken=…` query param and
 * expects the endpoint to echo that exact token back as `text/plain` with `200`. {@link validateGraphNotification}
 * returns this discriminated result so the router can either echo the token (handshake) or proceed to process
 * a real notification (with the `clientState` already verified).
 */
export type GraphNotificationValidation =
    | {
          /** A subscription-validation handshake — echo {@link ValidationToken} back as `text/plain` 200. */
          Kind: 'validation';
          /** The exact token to echo back (Graph rejects the subscription on any mismatch). */
          ValidationToken: string;
      }
    | {
          /** A real change notification whose `clientState` matched the expected shared secret — process it. */
          Kind: 'notification';
      }
    | {
          /** Reject — either a missing/blank token on a handshake, or a `clientState` mismatch on a notification. */
          Kind: 'reject';
          /** A short machine-readable reason (for logging; never surfaced to the caller). */
          Reason: 'empty-validation-token' | 'client-state-mismatch';
      };

/**
 * Performs the Graph change-notification gate, pure + exported so the MJAPI router calls it on every
 * `POST /meetings/teams/notifications` request (these can't carry an MJ JWT — the handshake + `clientState`
 * shared secret are the gate):
 *
 * 1. If the request carries a `validationToken` query param, it's the subscription-validation handshake →
 *    return `{ Kind: 'validation', ValidationToken }` (the router echoes it back as `text/plain` 200). A
 *    blank token rejects.
 * 2. Otherwise it's a real notification. Every notification in the batch carries a `clientState`; verify
 *    each (constant-time) against the secret we set when creating the subscription. Any mismatch rejects the
 *    whole batch (an attacker who can't produce the secret must not drive bot behavior).
 *
 * @param validationToken The `?validationToken=…` query param value, when present (the handshake).
 * @param expectedClientState The shared secret set on subscription creation (resolved upstream — never inlined).
 * @param notificationClientStates The `clientState` of each notification in the POST body (empty for handshake).
 * @returns The discriminated validation result.
 */
export function validateGraphNotification(
    validationToken: string | undefined,
    expectedClientState: string,
    notificationClientStates: ReadonlyArray<string | undefined>,
): GraphNotificationValidation {
    if (validationToken !== undefined) {
        return validationToken.length > 0
            ? { Kind: 'validation', ValidationToken: validationToken }
            : { Kind: 'reject', Reason: 'empty-validation-token' };
    }
    for (const state of notificationClientStates) {
        if (!constantTimeEquals(state ?? '', expectedClientState)) {
            return { Kind: 'reject', Reason: 'client-state-mismatch' };
        }
    }
    return { Kind: 'notification' };
}

/** The normalized lifecycle state of a Teams call, mapped from a Graph call/participant notification. */
export type NormalizedCallState = 'establishing' | 'established' | 'terminating' | 'terminated' | 'unknown';

/** A normalized view of a Graph call/participant change notification — what the ingress hands the engine. */
export interface NormalizedCallNotification {
    /** The Graph call id the notification is about (`/communications/calls/{id}`). */
    callId: string;
    /** The normalized call lifecycle state. */
    state: NormalizedCallState;
    /** The current participants, normalized (empty when the notification carries no roster). */
    participants: GraphCallParticipant[];
}

/** One raw Graph change-notification item (the subset of the `value[]` array fields we read). */
export interface GraphChangeNotification {
    /** The resource path the change is about (e.g. `communications/calls/{id}` or `.../participants`). */
    resource?: string;
    /** The shared secret we set on subscription creation (verified by {@link validateGraphNotification}). */
    clientState?: string;
    /** The notification's resource payload (the call or participants snapshot). */
    resourceData?: GraphCallResourceData;
}

/** The `resourceData` payload of a Graph call/participant notification (the subset we read). */
export interface GraphCallResourceData {
    /** The Graph call id, when the notification carries it directly. */
    id?: string;
    /** The call's lifecycle state string (`'establishing'` / `'established'` / `'terminated'`, etc.). */
    state?: string;
    /** The participants snapshot, when the notification is a `participantsUpdated`. */
    participants?: GraphCallParticipant[];
}

/**
 * **Pure** mapping of a Graph call/participant change notification to a {@link NormalizedCallNotification}
 * (`{ callId, state, participants }`). Resolves the call id from `resourceData.id` or the `resource` path,
 * normalizes the lifecycle state, and passes the participants snapshot through unchanged. Exported so the
 * MJAPI router maps each notification → engine session lifecycle without re-parsing Graph's resource shapes.
 *
 * @param notification One Graph change-notification item.
 * @returns The normalized call notification.
 * @throws When no call id can be resolved (a notification with no identifiable call is unactionable).
 */
export function parseCallNotification(notification: GraphChangeNotification): NormalizedCallNotification {
    const callId = notification.resourceData?.id ?? extractCallIdFromResource(notification.resource);
    if (!callId) {
        throw new Error(
            'parseCallNotification: could not resolve a call id from the Graph notification ' +
                `(resourceData.id and resource path both absent). resource='${notification.resource ?? ''}'.`,
        );
    }
    return {
        callId,
        state: normalizeCallState(notification.resourceData?.state),
        participants: notification.resourceData?.participants ?? [],
    };
}

/**
 * Builds the Graph `POST /communications/calls` request body for an on-demand **join-by-URL** trigger, the
 * payload the live `Meeting.JoinByUrl(agentIdentityId, joinUrl)` mutation hands the engine. Thin wrapper over
 * {@link buildGraphCreateCallRequest} that constructs the minimal {@link TeamsJoinArgs} from a join URL + bot
 * name; pure so the router and tests share one request shape.
 *
 * @param joinUrl The Teams meeting join URL to join.
 * @param botDisplayName The bot's display name in the participant list (defaults to `'AI Agent'`).
 * @param tenantId The Azure tenant id, when joining cross-tenant.
 * @returns The Graph create-call request body.
 * @throws When the join URL carries no resolvable meeting thread id.
 */
export function buildJoinByUrlRequest(
    joinUrl: string,
    botDisplayName = 'AI Agent',
    tenantId?: string,
): GraphCreateCallRequest {
    const args: TeamsJoinArgs = {
        JoinUrl: joinUrl,
        BotDisplayName: botDisplayName,
        ...(tenantId ? { TenantId: tenantId } : {}),
    };
    return buildGraphCreateCallRequest(args);
}

/** Maps a free-form Graph call-state string onto the {@link NormalizedCallState} union. */
function normalizeCallState(state?: string): NormalizedCallState {
    switch ((state ?? '').trim().toLowerCase()) {
        case 'establishing':
            return 'establishing';
        case 'established':
            return 'established';
        case 'terminating':
            return 'terminating';
        case 'terminated':
            return 'terminated';
        default:
            return 'unknown';
    }
}

/** Extracts the `{id}` from a `communications/calls/{id}[/...]` Graph resource path, or `undefined`. */
function extractCallIdFromResource(resource?: string): string | undefined {
    if (!resource) {
        return undefined;
    }
    const match = resource.match(/communications\/calls\/([^/?#]+)/i);
    return match ? match[1] : undefined;
}

/** Constant-time string compare, length-safe (mismatched lengths return false) — for `clientState`. */
function constantTimeEquals(a: string, b: string): boolean {
    const bufA = new Uint8Array(Buffer.from(a, 'utf8'));
    const bufB = new Uint8Array(Buffer.from(b, 'utf8'));
    if (bufA.length !== bufB.length) {
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}
