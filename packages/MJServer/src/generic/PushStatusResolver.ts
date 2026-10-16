import { Arg, Field, ID, ObjectType, PubSubEngine, Resolver, ResolverFilterData, Root, Subscription } from 'type-graphql';
import { UUIDsEqual } from '@memberjunction/global';
import { UserPayload } from '../types.js';

export const PUSH_STATUS_UPDATES_TOPIC = 'PUSH_STATUS_UPDATES';

@ObjectType()
export class PushStatusNotification {
  @Field(() => String, { nullable: true })
  message?: string;

  @Field((_type) => Date)
  date!: Date;

  @Field((_type) => ID)
  sessionId!: string;
}

/**
 * Internal wire payload for a push-status update. Carries `ownerUserId` — the authenticated user
 * the update belongs to — used ONLY server-side by the subscription filter and deliberately NOT
 * exposed on the client-facing {@link PushStatusNotification} (we never leak user IDs to subscribers).
 *
 * `ownerUserId` is REQUIRED: it is the load-bearing security property (see
 * {@link statusUpdatesFilter}), so making it required means the compiler rejects any publish that
 * omits identity. Always publish through {@link publishStatusUpdate} (or the
 * `ResolverBase.PublishStatusUpdate` ergonomic wrapper) rather than calling `pubSub.publish` on
 * this topic directly, so a new publisher can never forget it.
 */
export interface PushStatusNotificationPayload {
  message?: string;
  sessionId: string;
  /** Authenticated user the update belongs to. Server-side filter key; never sent to the client. */
  ownerUserId: string;
}

interface PushStatusNotificationArgs {
  sessionId: string;
}

/** Parameters for {@link publishStatusUpdate} — identity (`ownerUserId`) is required by design. */
export interface StatusUpdateParams {
  /** Session the target client subscribed on (routes the push to the right browser tab). */
  sessionId: string;
  /** Authenticated user the operation belongs to (the trust anchor the filter enforces). */
  ownerUserId: string;
  /** Message envelope (plain string, or the resolvers' JSON `{resolver,type,status,data}` shape). */
  message?: string;
}

/**
 * The single, centralized vehicle for publishing on {@link PUSH_STATUS_UPDATES_TOPIC}. Every
 * publisher — resolver or service — routes through here (resolvers via the
 * `ResolverBase.PublishStatusUpdate` wrapper; non-resolvers by calling this directly), so the
 * payload shape and the required-identity guarantee live in exactly one place. Adding a field to
 * the push is a one-line change here; a new publisher physically cannot omit `ownerUserId`.
 */
export function publishStatusUpdate(pubSub: PubSubEngine, params: StatusUpdateParams): void {
  const payload: PushStatusNotificationPayload = {
    sessionId: params.sessionId,
    ownerUserId: params.ownerUserId,
    message: params.message,
  };
  pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, payload);
}

/** Minimal shape of the subscription's connection context needed by the filter. */
export interface StatusUpdatesFilterContext {
  userPayload?: UserPayload;
}

/**
 * Filter predicate for the `statusUpdates` subscription. Exported so it can be unit-tested in
 * isolation (it is the security-critical gate). A push reaches a subscriber only when BOTH hold:
 *   1. the push's `sessionId` matches the subscriber's requested `sessionId` (tab routing), AND
 *   2. the push's `ownerUserId` matches the subscriber CONNECTION's authenticated identity
 *      (`context.userPayload.userRecord.ID`, established once at WS connect).
 *
 * Condition (2) is the fix for the session-hijack class (B49): `sessionId` is a client-chosen
 * correlation value, so a subscriber who lifts another user's `sessionId` would previously receive
 * their pushes. Binding delivery to the connection's server-authenticated identity means knowing a
 * `sessionId` is no longer sufficient. Fails CLOSED — a missing owner or connection identity never
 * matches.
 */
export function statusUpdatesFilter(data: {
  payload: PushStatusNotificationPayload;
  args: PushStatusNotificationArgs;
  context: StatusUpdatesFilterContext | undefined;
}): boolean {
  const { payload, args, context } = data;
  if (payload.sessionId !== args.sessionId) {
    return false;
  }
  const connectionUserId: string | undefined = context?.userPayload?.userRecord?.ID;
  if (!connectionUserId || !payload.ownerUserId) {
    return false; // fail closed — no identity on either side means no delivery
  }
  return UUIDsEqual(payload.ownerUserId, connectionUserId);
}

@Resolver()
export class PushStatusResolver {
  @Subscription(() => PushStatusNotification, {
    topics: PUSH_STATUS_UPDATES_TOPIC,
    filter: (data: ResolverFilterData<PushStatusNotificationPayload, PushStatusNotificationArgs, StatusUpdatesFilterContext>) =>
      statusUpdatesFilter(data),
  })
  statusUpdates(
    @Root() { message }: PushStatusNotificationPayload,
    @Arg('sessionId', () => String) sessionId: string
  ): PushStatusNotification {
    // NOTE: ownerUserId is intentionally NOT returned — it is a server-side filter key only.
    return { message, date: new Date(), sessionId };
  }
}
