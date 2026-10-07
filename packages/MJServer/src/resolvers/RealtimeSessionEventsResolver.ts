/**
 * @fileoverview GraphQL subscription that delivers **realtime session events** to the session they are
 * addressed to — `subscription RealtimeSessionEvents(agentSessionId: String!)`.
 *
 * The event contract lives in `@memberjunction/ai-core-plus` (`realtime-session-events.ts`); the publisher
 * apps call is `RealtimeSessionEventService`. This resolver is the delivery edge, and its whole job is
 * authorization, done twice on purpose:
 *
 * 1. **At subscribe time** ({@link AuthorizeRealtimeSessionSubscription}). The session row is loaded and
 *    {@link AuthorizeSessionAccess} must allow the connection's authenticated principal: the session's
 *    `UserID` must be the caller's user and — for an anonymous widget guest, who shares one Anonymous
 *    user with every other guest — the guest's signed per-session scope must match the session's
 *    conversation. A refusal is an error on THIS subscription only (the socket and its other
 *    subscriptions are untouched) and is the same "not found" whether the session is missing or simply
 *    not yours, so ids cannot be probed.
 * 2. **For every event** ({@link RealtimeSessionEventsFilter}). Each published event carries the owner and
 *    scope snapshot of its session; the filter re-applies the same decision against the CONNECTION's
 *    identity. Authorization therefore does not rest on a single check at one moment, and a replicated
 *    event from another server instance is judged exactly like a local one.
 *
 * In neither check does a client-supplied value decide who receives anything: `agentSessionId` only
 * selects WHICH of the caller's own sessions to listen to; the identity it is checked against comes from
 * the server-authenticated connection context.
 *
 * Events have no replay. A subscriber that was disconnected when an event fired recovers durable state
 * from `RealtimeSessionVerificationStatus` (and from the session itself).
 *
 * @module @memberjunction/server
 */

import { Resolver, Subscription, Root, Arg, ObjectType, Field } from 'type-graphql';
import { withFilter } from 'graphql-subscriptions';
import { PubSubManager } from '../generic/PubSubManager.js';
import {
    AuthorizeRealtimeSessionSubscription,
    RealtimeSessionEventsFilter,
    type RealtimeSessionEventsArgs,
    type RealtimeSessionEventsContext,
    type SubscriptionAuthorizationDeps,
    DEFAULT_SUBSCRIPTION_AUTHORIZATION_DEPS,
} from '../realtimeSessions/subscriptionAuthorization.js';
import { REALTIME_SESSION_EVENTS_TOPIC, type RealtimeSessionEventTopicPayload } from '../realtimeSessions/RealtimeSessionEventService.js';

/** One session event as the client receives it. The routing snapshot is deliberately NOT exposed. */
@ObjectType()
export class RealtimeSessionEventNotification {
    /** Event type, e.g. `identity.verified`. Clients ignore types they do not know. */
    @Field(() => String)
    Type: string;

    /** The session the event is addressed to. */
    @Field(() => String)
    AgentSessionID: string;

    /** ISO-8601 instant the server emitted the event. */
    @Field(() => String)
    OccurredAt: string;

    /** The event payload, JSON-encoded. Parse with `ParseRealtimeSessionEvent` from `@memberjunction/ai-core-plus`. */
    @Field(() => String)
    PayloadJson: string;
}

/**
 * Builds the event stream for one authorized subscription: the shared topic, narrowed by
 * {@link RealtimeSessionEventsFilter}.
 */
function openEventStream(
    root: unknown,
    args: RealtimeSessionEventsArgs,
    context: RealtimeSessionEventsContext,
    info: unknown,
): AsyncIterator<RealtimeSessionEventTopicPayload> {
    const engine = PubSubManager.Instance.PubSubEngine;
    if (!engine) {
        throw new Error('Realtime session events are unavailable: PubSub is not configured.');
    }
    const filtered = withFilter(
        () => engine.asyncIterator<RealtimeSessionEventTopicPayload>(REALTIME_SESSION_EVENTS_TOPIC),
        (payload: RealtimeSessionEventTopicPayload, filterArgs: RealtimeSessionEventsArgs, filterContext: RealtimeSessionEventsContext) =>
            RealtimeSessionEventsFilter({ payload, args: filterArgs, context: filterContext }),
    );
    return filtered(root, args, context, info);
}

/**
 * The `subscribe` function: authorize FIRST (asynchronously), then open the stream. Exported (with an
 * injectable `deps` argument graphql-js never passes) so the whole path is testable end to end.
 *
 * graphql-js awaits the value `subscribe` returns and turns a thrown error into a per-operation error
 * result, which is exactly what a refusal should be (a failure of this subscription, not the socket).
 */
export async function AuthorizeAndSubscribeToRealtimeSessionEvents(
    root: unknown,
    args: RealtimeSessionEventsArgs,
    context: RealtimeSessionEventsContext,
    info: unknown,
    deps: SubscriptionAuthorizationDeps = DEFAULT_SUBSCRIPTION_AUTHORIZATION_DEPS,
): Promise<AsyncIterator<RealtimeSessionEventTopicPayload>> {
    await AuthorizeRealtimeSessionSubscription(args, context, deps);
    return openEventStream(root, args, context, info);
}

@Resolver()
export class RealtimeSessionEventsResolver {
    /**
     * Subscribe to the events addressed to one of YOUR realtime sessions.
     *
     * @param agentSessionId - the `MJ: AI Agent Sessions` id to listen to. Must be a session the
     *   authenticated connection owns (and, for an anonymous widget guest, whose signed scope matches);
     *   otherwise the subscription is refused.
     */
    @Subscription(() => RealtimeSessionEventNotification, {
        // graphql-subscriptions types `ResolverFn` as returning a bare AsyncIterator, but graphql-js
        // AWAITS what `subscribe` returns (execute/subscribe.js: `await resolveFn(...)`), and awaiting is
        // the only way to authorize against the database before opening the stream. The typing gap is in
        // the library; `@ts-expect-error` (not a cast) so this fails to compile the day the type is fixed.
        // @ts-expect-error subscribe may return Promise<AsyncIterator>; see comment above
        subscribe: AuthorizeAndSubscribeToRealtimeSessionEvents,
    })
    RealtimeSessionEvents(
        @Root() payload: RealtimeSessionEventTopicPayload,
        @Arg('agentSessionId', () => String) _agentSessionId: string,
    ): RealtimeSessionEventNotification {
        // OwnerUserID / ScopeKey are server-internal filter keys and are intentionally not returned.
        return {
            Type: payload.Type,
            AgentSessionID: payload.AgentSessionID,
            OccurredAt: payload.OccurredAt,
            PayloadJson: payload.PayloadJson,
        };
    }
}
