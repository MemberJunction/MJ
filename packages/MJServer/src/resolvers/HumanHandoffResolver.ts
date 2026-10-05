import { Resolver, Mutation, Query, Subscription, Arg, Ctx, Root, ObjectType, Field, ResolverFilterData } from 'type-graphql';
import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { NotificationEngine } from '@memberjunction/notifications';
import {
  LiveKitSipService,
  RoomHandoffEngine,
  type HandoffOfferEvent,
  type HandoffOfferView,
  type IHandoffNotifier,
  type IHandoffPublisher,
} from '@memberjunction/livekit-room-server';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PubSubManager } from '../generic/PubSubManager.js';

/**
 * GraphQL surface for the human side of a room handoff: a person at an Explorer console is OFFERED a conversation an AI
 * agent is having (a phone call that arrived through LiveKit SIP, or a web room), and accepts or declines it. Thin by the
 * Transport-Layer rule: the offer lifecycle, the room watching and the AI's leave step live in `RoomHandoffEngine`
 * (`@memberjunction/livekit-room-server`); this file only authenticates, delegates and shapes the answer.
 *
 * Every operation is scoped to the signed-in user: a person lists, accepts and declines only their OWN offers, and the live
 * subscription delivers only theirs. Accepting returns the room name; the console then joins the room through the same
 * LiveKit token path the Meet room uses (`MintLiveKitClientToken`), under the same identity the engine watches for.
 */

/** The pub/sub topic offer changes are published on. */
export const HANDOFF_OFFER_TOPIC = 'HANDOFF_OFFER_CHANGES';

/** One offer, as the console sees it. */
@ObjectType()
export class HandoffOffer {
  @Field(() => String)
  OfferID: string;

  @Field(() => String)
  RoomName: string;

  /** `warm` (the AI introduces you, then leaves) or `blind` (the AI leaves as soon as you join). */
  @Field(() => String)
  Mode: string;

  /** The AI's summary of the conversation so far. */
  @Field(() => String)
  Summary: string;

  /** Who is on the other end (a masked number, "Web visitor"). */
  @Field(() => String)
  CallerLabel: string;

  /** The AI agent that is in the room. */
  @Field(() => String)
  AgentName: string;

  /** `Pending`, `Accepted`, `Declined`, `Expired` or `Cancelled`. */
  @Field(() => String)
  Status: string;

  @Field(() => String)
  CreatedAt: string;

  /** After this the offer can no longer be accepted. */
  @Field(() => String)
  ExpiresAt: string;
}

/** One change to an offer, pushed to the person it belongs to. */
@ObjectType()
export class HandoffOfferChange {
  /** `offered` for a new offer; `updated` when it was accepted, declined, expired or cancelled. */
  @Field(() => String)
  Kind: string;

  @Field(() => HandoffOffer)
  Offer: HandoffOffer;
}

@ObjectType()
export class AcceptHandoffOfferResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  /** The room to join (through `MintLiveKitClientToken`). Empty on failure. */
  @Field(() => String)
  RoomName: string;

  @Field(() => HandoffOffer, { nullable: true })
  Offer?: HandoffOffer;
}

@ObjectType()
export class DeclineHandoffOfferResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;
}

/** What the subscription filter reads off the connection. */
interface HandoffSubscriptionContext {
  userPayload?: { userRecord?: { ID?: string } };
}

/**
 * Delivery predicate for {@link HumanHandoffResolver.HandoffOfferChanges}: a change reaches only the person it belongs to.
 * **Fails closed**: a missing identity on either side never matches.
 */
export function HandoffOfferChangeFilter(data: { payload: HandoffOfferEvent; context: HandoffSubscriptionContext | undefined }): boolean {
  const connectionUserID = data.context?.userPayload?.userRecord?.ID;
  if (!connectionUserID || !data.payload?.UserID) {
    return false;
  }
  return UUIDsEqual(data.payload.UserID, connectionUserID);
}

/** Redis channel carrying replicated handoff offer updates between server instances. */
export const HANDOFF_OFFER_FANOUT_CHANNEL = 'handoff-offer-changes';

export interface HandoffOfferFanOutPayload {
  UserID: string;
  Kind: 'offered' | 'updated';
  Offer: HandoffOfferView;
  SourceServerId?: string;
}

export type HandoffOfferPublishHook = (payload: HandoffOfferFanOutPayload) => void;

let _handoffPublishHook: HandoffOfferPublishHook | undefined;

export function SetHandoffOfferPublishHook(hook?: HandoffOfferPublishHook): void {
  _handoffPublishHook = hook;
}

export function ParseReplicatedHandoffOfferUpdate(raw: string, localServerId: string): HandoffOfferFanOutPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    LogError('Failed to parse replicated handoff offer update payload', undefined, err);
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.SourceServerId === 'string' && candidate.SourceServerId === localServerId) {
    return null; // echo suppression
  }
  if (typeof candidate.UserID !== 'string' || typeof candidate.Kind !== 'string' || !candidate.Offer) {
    return null;
  }
  const offer = candidate.Offer as Record<string, unknown>;
  if (typeof offer.OfferID !== 'string' || typeof offer.RoomName !== 'string' || typeof offer.Status !== 'string') {
    return null;
  }
  return {
    UserID: candidate.UserID,
    Kind: candidate.Kind as 'offered' | 'updated',
    Offer: offer as unknown as HandoffOfferView,
    SourceServerId: typeof candidate.SourceServerId === 'string' ? candidate.SourceServerId : undefined,
  };
}

/** Publishes offer changes onto the GraphQL subscription topic and forwards across instances. */
export class PubSubHandoffPublisher implements IHandoffPublisher {
  public Publish(event: HandoffOfferEvent): void {
    PubSubManager.Instance.Publish(HANDOFF_OFFER_TOPIC, { UserID: event.UserID, Kind: event.Kind, Offer: event.Offer });
    _handoffPublishHook?.({
      UserID: event.UserID,
      Kind: event.Kind,
      Offer: event.Offer,
      SourceServerId: MJGlobal.Instance.ProcessUUID,
    });
  }
}

/**
 * Tells the person about a new offer outside the live subscription, through the unified notification engine (in-app, and
 * MJ Comms when the type is configured for it), using the dedicated "Conversation Handoff Offer" notification type.
 * The `handoff-offer` resource configuration is what Explorer routes to the Conversation Console.
 */
export class NotificationHandoffNotifier implements IHandoffNotifier {
  public async NotifyOffer(offer: HandoffOfferView, targetUserID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
    await NotificationEngine.Instance.Config(false, contextUser, provider);
    const result = await NotificationEngine.Instance.SendNotification(
      {
        userId: targetUserID,
        typeNameOrId: 'Conversation Handoff Offer',
        title: `Incoming conversation: ${offer.CallerLabel}`,
        message: `${offer.AgentName} is asking you to take over a conversation. ${offer.Summary}`,
        resourceConfiguration: { type: 'handoff-offer', offerId: offer.OfferID, room: offer.RoomName },
      },
      contextUser,
    );
    if (!result.success) {
      throw new Error(`the notification engine could not deliver it: ${(result.errors ?? []).join('; ') || 'unknown error'}`);
    }
  }
}

/**
 * Binds the handoff engine's collaborators that only the server host can supply (same module-load rationale as the other
 * realtime bindings): the pub/sub publisher, the notification sender, and a room-presence check over the LiveKit credentials
 * the Meet room already uses. Idempotent (latest-wins). The telephony extension adds the collaborators that need a carrier
 * (dialing a number into a room, starting another agent).
 */
RoomHandoffEngine.Instance.Configure({
  Presence: new LiveKitSipService(),
  Publisher: new PubSubHandoffPublisher(),
  Notifier: new NotificationHandoffNotifier(),
});

@Resolver()
export class HumanHandoffResolver extends ResolverBase {
  /** The signed-in user's offers: pending ones, plus ones that resolved recently enough to still be shown. */
  @Query(() => [HandoffOffer])
  async MyHandoffOffers(@Ctx() context: AppContext = {} as AppContext): Promise<HandoffOffer[]> {
    const user = this.GetUserFromPayload(context.userPayload);
    if (!user) {
      return [];
    }
    const offers = await RoomHandoffEngine.Instance.ListOffersForUser(user.ID, user);
    return offers.map(toGraphQLOffer);
  }

  /**
   * Accepts an offer. The engine authorises it against the offer's target; a stranger's attempt and a missing offer answer
   * identically. On success the console should join the room, and the AI leaves once the person is actually there.
   */
  @Mutation(() => AcceptHandoffOfferResult)
  async AcceptHandoffOffer(
    @Arg('offerID', () => String) offerID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<AcceptHandoffOfferResult> {
    const failure = (message: string): AcceptHandoffOfferResult => ({ Success: false, ErrorMessage: message, RoomName: '' });
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return failure('Unable to determine current user.');
      }
      const result = await RoomHandoffEngine.Instance.AcceptOffer(offerID, user.ID, user);
      if ('Reason' in result) {
        return failure(result.Reason);
      }
      return { Success: true, RoomName: result.Offer.RoomName, Offer: toGraphQLOffer(result.Offer) };
    } catch (error) {
      LogError(`AcceptHandoffOffer failed: ${error instanceof Error ? error.message : String(error)}`);
      return failure('The offer could not be accepted.');
    }
  }

  /** Declines an offer, so the AI can fall back (the person's phone, or carrying on). */
  @Mutation(() => DeclineHandoffOfferResult)
  async DeclineHandoffOffer(
    @Arg('offerID', () => String) offerID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<DeclineHandoffOfferResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'Unable to determine current user.' };
      }
      const result = await RoomHandoffEngine.Instance.DeclineOffer(offerID, user.ID, user);
      return 'Reason' in result ? { Success: false, ErrorMessage: result.Reason } : { Success: true };
    } catch (error) {
      LogError(`DeclineHandoffOffer failed: ${error instanceof Error ? error.message : String(error)}`);
      return { Success: false, ErrorMessage: 'The offer could not be declined.' };
    }
  }

  /** Live changes to the signed-in user's offers (a new offer, or one that was accepted, declined, expired or cancelled). */
  @Subscription(() => HandoffOfferChange, {
    topics: HANDOFF_OFFER_TOPIC,
    filter: (data: ResolverFilterData<HandoffOfferEvent, Record<string, never>, HandoffSubscriptionContext>) => HandoffOfferChangeFilter(data),
  })
  HandoffOfferChanges(@Root() payload: HandoffOfferEvent): HandoffOfferChange {
    // UserID is a server-side delivery key and is intentionally not returned.
    return { Kind: payload.Kind, Offer: toGraphQLOffer(payload.Offer) };
  }
}

function toGraphQLOffer(offer: HandoffOfferView): HandoffOffer {
  return {
    OfferID: offer.OfferID,
    RoomName: offer.RoomName,
    Mode: offer.Mode,
    Summary: offer.Summary,
    CallerLabel: offer.CallerLabel,
    AgentName: offer.AgentName,
    Status: offer.Status,
    CreatedAt: offer.CreatedAt,
    ExpiresAt: offer.ExpiresAt,
  };
}
