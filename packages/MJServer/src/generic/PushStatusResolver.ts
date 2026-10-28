import 'reflect-metadata';
import { Arg, Field, ID, ObjectType, PubSubEngine, Resolver, ResolverFilterData, Root, Subscription } from 'type-graphql';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { UserPayload } from '../types.js';
import { ResolveSessionScopeIdentity, type SessionAccessPrincipal } from '../realtimeSessions/sessionAccess.js';

export const PUSH_STATUS_UPDATES_TOPIC = 'PUSH_STATUS_UPDATES';

@ObjectType()
export class PushStatusNotification {
  @Field(() => String, { nullable: true })
  message?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field((_type) => Date)
  date!: Date;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field((_type) => ID)
  sessionId!: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
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
  /**
   * `MJGlobal.ProcessUUID` of the instance that first published this update. Used only for
   * cross-instance echo suppression: an instance that receives its own message back from the
   * message bus must drop it, or every push is delivered twice.
   */
  SourceServerId?: string;
}

/** Receives every locally-published status update, for fan-out to other server instances. */
export type PushStatusPublishHook = (payload: PushStatusNotificationPayload) => void;

let _publishHook: PushStatusPublishHook | undefined;

/**
 * Register (or clear, with no arg) the cross-instance fan-out hook.
 *
 * Inversion of control, deliberately: this module must not know that Redis exists. The server
 * registers the hook at startup only when a message bus is configured, so a single-instance
 * deployment behaves exactly as before.
 */
export function SetPushStatusPublishHook(hook?: PushStatusPublishHook): void {
  _publishHook = hook;
}

/**
 * Validate an update received from the cross-instance message bus.
 *
 * The bus carries messages from other processes, so every field is type-checked before the update
 * is republished onto the local topic, where {@link StatusUpdatesFilter} compares `ownerUserId`
 * with the connection's user.
 *
 * @param raw The JSON text taken off the bus.
 * @param localServerId This process's `MJGlobal.ProcessUUID`, used to drop our own echo.
 * @returns The update to republish, or `null` to drop it.
 */
export function ParseReplicatedStatusUpdate(raw: string, localServerId: string): PushStatusNotificationPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const { sessionId, ownerUserId, message, SourceServerId } = parsed as Record<string, unknown>;
  const source = typeof SourceServerId === 'string' ? SourceServerId : undefined;
  const body = typeof message === 'string' ? message : undefined;
  if ((SourceServerId != null && source === undefined) || (message != null && body === undefined)) {
    return null; // a present field of the wrong type
  }
  if (source === localServerId) {
    return null; // our own message, echoed back
  }
  if (typeof sessionId !== 'string' || !sessionId || typeof ownerUserId !== 'string' || !ownerUserId) {
    return null; // fail closed: an update with no valid identity can never be routed safely
  }

  return { sessionId, ownerUserId, message: body, SourceServerId: source };
}

/**
 * Returns the $O(1)$ session-scoped pub/sub topic name for a given `sessionId`.
 * Wildcard (`'*'`) or empty session IDs fall back to the broadcast {@link PUSH_STATUS_UPDATES_TOPIC}.
 */
export function GetSessionStatusTopic(sessionId: string): string {
  const normalized = sessionId?.trim();
  if (!normalized || normalized === '*') {
    return PUSH_STATUS_UPDATES_TOPIC;
  }
  return `${PUSH_STATUS_UPDATES_TOPIC}:session:${normalized}`;
}

interface ParsedMessageCacheEntry {
   parsed: Record<string, unknown> | null;
   isJson: boolean;
}

const _parsedMessageMemo = new WeakMap<PushStatusNotificationPayload, ParsedMessageCacheEntry>();

/**
 * Parses and memoizes the JSON `message` envelope on a {@link PushStatusNotificationPayload}
 * in a `WeakMap` so multiple consumers (`ShouldReplicateStatusUpdate`, filters, hooks) never
 * call `JSON.parse` more than once per payload object.
 */
export function ParseStatusUpdateMessage(
  payload: PushStatusNotificationPayload
): ParsedMessageCacheEntry {
  const cached = _parsedMessageMemo.get(payload);
  if (cached) {
    return cached;
  }
  if (!payload.message) {
    const emptyEntry: ParsedMessageCacheEntry = { parsed: null, isJson: false };
    _parsedMessageMemo.set(payload, emptyEntry);
    return emptyEntry;
  }
  try {
    const raw: unknown = JSON.parse(payload.message);
    const entry: ParsedMessageCacheEntry = {
      parsed: typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null,
      isJson: true,
    };
    _parsedMessageMemo.set(payload, entry);
    return entry;
  } catch {
    const plainEntry: ParsedMessageCacheEntry = { parsed: null, isJson: false };
    _parsedMessageMemo.set(payload, plainEntry);
    return plainEntry;
  }
}

/**
 * Whether an update is worth sending to other server instances.
 *
 * Streaming content is excluded. It arrives at hundreds of messages per second and each one carries
 * a full serialized agent run, so replicating it would cost far more bandwidth than the delivery it
 * buys — and a token delta is worthless to a client that has already missed the ones before it.
 * Progress and completion are low-rate and each is individually meaningful, which is exactly the
 * kind of message that must survive landing on the wrong replica.
 */
export function ShouldReplicateStatusUpdate(
  message?: string,
  payload?: PushStatusNotificationPayload
): boolean {
  if (!message) {
    return false;
  }
  if (payload && payload.message === message) {
    const entry = ParseStatusUpdateMessage(payload);
    if (!entry.isJson) {
      return true;
    }
    return entry.parsed?.type !== 'StreamingContent';
  }
  try {
    const parsed: unknown = JSON.parse(message);
    const type = (parsed as { type?: unknown })?.type;
    return type !== 'StreamingContent';
  } catch {
    // A plain-string message (not the resolvers' JSON envelope) is rare and low-rate. Replicate it.
    return true;
  }
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
export function PublishStatusUpdate(pubSub: PubSubEngine, params: StatusUpdateParams): void {
  const payload: PushStatusNotificationPayload = {
    sessionId: params.sessionId,
    ownerUserId: params.ownerUserId,
    message: params.message,
    SourceServerId: MJGlobal.Instance.ProcessUUID,
  };
  pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, payload);

  // Fan out to other instances. Only reached by updates originating HERE: a message arriving from
  // the bus is republished straight onto the local topic and never comes back through this
  // function, so there is no loop to break beyond the SourceServerId check on the receiving side.
  if (_publishHook && ShouldReplicateStatusUpdate(params.message, payload)) {
    try {
      _publishHook(payload);
    } catch {
      // Fan-out is an optimization over the durable tail query. A message bus that is down must
      // never break local delivery, which is the path that works for the common case.
    }
  }
}

/** @deprecated Use {@link PublishStatusUpdate}. */
export function publishStatusUpdate(pubSub: PubSubEngine, params: StatusUpdateParams): void {
  return PublishStatusUpdate(pubSub, params);
}

/** Minimal shape of the subscription's connection context needed by the filter. */
export interface StatusUpdatesFilterContext {
  userPayload?: UserPayload;
}

/**
 * The owner key of a status update for `user`: its user ID, or, for an anonymous visitor, its user ID plus its scope
 * identity (`ResolveSessionScopeIdentity`). Every anonymous visitor shares one Anonymous user and the session id is
 * chosen by the client (`x-session-id`), so the user ID alone would let one visitor receive another's run events.
 * An anonymous visitor with no scope identity gets no key and receives nothing.
 */
export function StatusUpdateOwnerKey(user: SessionAccessPrincipal | null | undefined): string {
  if (!user?.ID) {
    return '';
  }
  if (!user.IsMagicLinkAnonymous) {
    return user.ID;
  }
  const scope = ResolveSessionScopeIdentity(user);
  return scope ? `${user.ID.toLowerCase()}|${scope}` : '';
}

/**
 * The owner key a status update is published with: that of the request's user, or, on a payload elevated by
 * `ElevateUserPayload`, of the user the elevated principal stands in for (a public widget guest). The guest's socket
 * is authenticated as the guest, so an update stamped with the elevated system user would never pass
 * {@link StatusUpdatesFilter} and the guest would wait forever for its run to finish.
 */
export function StatusUpdateOwnerID(userPayload: UserPayload | undefined): string {
  return StatusUpdateOwnerKey(userPayload?.ElevatedFrom ?? userPayload?.userRecord);
}

/**
 * Filter predicate for the `statusUpdates` subscription. Exported so it can be unit-tested in
 * isolation (it is the security-critical gate). A push reaches a subscriber only when BOTH hold:
 *   1. the push's `sessionId` matches the subscriber's requested `sessionId` (tab routing), or is `'*'`, AND
 *   2. the push's `ownerUserId` matches the owner key ({@link StatusUpdateOwnerKey}) of the subscriber
 *      CONNECTION's authenticated identity (`context.userPayload.userRecord`, established once at WS
 *      connect): the user ID for a named user, compared as a UUID; for an anonymous visitor, the user ID
 *      plus its scope identity, compared exactly because the scope part is case-significant.
 *
 * Condition (2) is the fix for the session-hijack class (B49): `sessionId` is a client-chosen
 * correlation value, so a subscriber who lifts another user's `sessionId` would previously receive
 * their pushes. Binding delivery to the connection's server-authenticated identity means knowing a
 * `sessionId` is no longer sufficient; the scope part does the same between anonymous visitors, who all
 * share one Anonymous user. Fails CLOSED — a missing owner or connection key never matches.
 */
export function StatusUpdatesFilter(data: {
  payload: PushStatusNotificationPayload;
  args: PushStatusNotificationArgs;
  context: StatusUpdatesFilterContext | undefined;
}): boolean {
  const { payload, args, context } = data;
  if (payload.sessionId !== '*' && payload.sessionId !== args.sessionId) {
    return false;
  }
  const connectionUser: SessionAccessPrincipal | undefined = context?.userPayload?.userRecord;
  const connectionKey = StatusUpdateOwnerKey(connectionUser);
  if (!connectionKey || !payload.ownerUserId) {
    return false; // fail closed — no identity on either side means no delivery
  }
  // An anonymous visitor's key carries its scope identity (case-significant), so it must match exactly.
  return connectionUser?.IsMagicLinkAnonymous ? payload.ownerUserId === connectionKey : UUIDsEqual(payload.ownerUserId, connectionKey);
}

/** @deprecated Use {@link StatusUpdatesFilter}. */
export function statusUpdatesFilter(data: {
  payload: PushStatusNotificationPayload;
  args: PushStatusNotificationArgs;
  context: StatusUpdatesFilterContext | undefined;
}): boolean {
  return StatusUpdatesFilter(data);
}

@Resolver()
export class PushStatusResolver {
  @Subscription(() => PushStatusNotification, {
    topics: ({ args }: { args: PushStatusNotificationArgs }) =>
      args?.sessionId && args.sessionId !== '*'
        ? [GetSessionStatusTopic(args.sessionId), PUSH_STATUS_UPDATES_TOPIC]
        : PUSH_STATUS_UPDATES_TOPIC,
    filter: (data: ResolverFilterData<PushStatusNotificationPayload, PushStatusNotificationArgs, StatusUpdatesFilterContext>) =>
      StatusUpdatesFilter(data),
  })
  statusUpdates(  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
    @Root() { message }: PushStatusNotificationPayload,
    @Arg('sessionId', () => String) sessionId: string
  ): PushStatusNotification {
    // NOTE: ownerUserId is intentionally NOT returned — it is a server-side filter key only.
    return { message, date: new Date(), sessionId };
  }
}
