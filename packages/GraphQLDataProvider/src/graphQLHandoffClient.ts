import { LogError } from '@memberjunction/core';
import { Observable, map, filter } from 'rxjs';
import { gql } from 'graphql-request';
import { GraphQLDataProvider } from './graphQLDataProvider';

/**
 * Typed client for the **human handoff** GraphQL surface (MJServer `HumanHandoffResolver`): the person-at-a-console side of a
 * room handoff. An AI agent in a LiveKit room (a phone call that arrived through SIP, or a web room) can ask for a person to
 * take the conversation over; that person is OFFERED it and may accept or decline. Every call is scoped to the signed-in
 * user server-side, so a user lists, accepts and declines only their own offers.
 *
 * Accepting returns the room to join; the console then joins it through the same LiveKit token path the Meet room uses
 * (`GraphQLLiveKitClient.MintClientToken`), and the AI leaves once the person is in the room.
 *
 * @example
 * ```typescript
 * const handoff = new GraphQLHandoffClient(GraphQLDataProvider.Instance);
 * const offers = await handoff.GetMyOffers();
 * handoff.ObserveOfferChanges().subscribe((change) => refresh(change));
 * const accepted = await handoff.AcceptOffer(offers[0].OfferID);
 * if (accepted.Success) { joinRoom(accepted.RoomName); }
 * ```
 */

/** Where an offer stands. */
export type HandoffOfferStatus = 'Pending' | 'Accepted' | 'Declined' | 'Expired' | 'Cancelled';

/** One conversation offered to the signed-in user. */
export interface HandoffOfferInfo {
  OfferID: string;
  RoomName: string;
  /** `warm` (the AI introduces you, then leaves) or `blind` (the AI leaves as soon as you join). */
  Mode: string;
  /** The AI's summary of the conversation so far. */
  Summary: string;
  /** Who is on the other end (a masked number, "Web visitor"). */
  CallerLabel: string;
  /** The AI agent that is in the room. */
  AgentName: string;
  Status: HandoffOfferStatus;
  /** ISO-8601 UTC. */
  CreatedAt: string;
  /** ISO-8601 UTC; after this the offer can no longer be accepted. */
  ExpiresAt: string;
  /** The MJ interaction ID associated with this conversation/room, if known. */
  InteractionID?: string | null;
}

/** One change to an offer, pushed live. */
export interface HandoffOfferChange {
  /** `offered` for a new offer; `updated` when it was accepted, declined, expired or cancelled. */
  Kind: 'offered' | 'updated';
  Offer: HandoffOfferInfo;
}

/** Result of accepting an offer. */
export interface AcceptHandoffOfferResult {
  Success: boolean;
  ErrorMessage?: string;
  /** The room to join. Empty on failure. */
  RoomName: string;
  Offer?: HandoffOfferInfo;
}

/** Result of declining an offer. */
export interface DeclineHandoffOfferResult {
  Success: boolean;
  ErrorMessage?: string;
}

const OFFER_FIELDS = `
  OfferID
  RoomName
  Mode
  Summary
  CallerLabel
  AgentName
  Status
  CreatedAt
  ExpiresAt
  InteractionID
`;

export class GraphQLHandoffClient {
  private readonly _dataProvider: GraphQLDataProvider;

  /**
   * @param dataProvider The GraphQL data provider that carries the requests (it holds the signed-in session).
   */
  constructor(dataProvider: GraphQLDataProvider) {
    this._dataProvider = dataProvider;
  }

  /**
   * The signed-in user's offers: pending ones, plus ones that resolved recently enough to still be shown. Best-effort: a
   * transport failure is logged and resolves to an empty list so the console shows "nothing waiting" rather than throwing.
   */
  public async GetMyOffers(): Promise<HandoffOfferInfo[]> {
    try {
      const query = gql`
        query MyHandoffOffers {
          MyHandoffOffers {
            ${OFFER_FIELDS}
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(query, {});
      const offers: HandoffOfferInfo[] | undefined = result?.MyHandoffOffers;
      return offers ?? [];
    } catch (error: unknown) {
      LogError('GraphQLHandoffClient.GetMyOffers failed', undefined, error as Error);
      return [];
    }
  }

  /**
   * Accepts an offer. The server authorises it against the offer's target, so another user's offer (or a missing, expired or
   * cancelled one) answers `Success: false`. Never throws.
   *
   * @param offerID The offer to accept.
   */
  public async AcceptOffer(offerID: string): Promise<AcceptHandoffOfferResult> {
    try {
      const mutation = gql`
        mutation AcceptHandoffOffer($offerID: String!) {
          AcceptHandoffOffer(offerID: $offerID) {
            Success
            ErrorMessage
            RoomName
            Offer {
              ${OFFER_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { offerID });
      const raw: AcceptHandoffOfferResult | undefined = result?.AcceptHandoffOffer;
      if (!raw) {
        throw new Error('Invalid response from server');
      }
      return raw;
    } catch (error: unknown) {
      const e = error as Error;
      LogError('GraphQLHandoffClient.AcceptOffer failed', undefined, e);
      return { Success: false, ErrorMessage: e.message || 'Unknown error', RoomName: '' };
    }
  }

  /**
   * Declines an offer, so the AI can fall back (the person's phone, or carrying on). Never throws.
   *
   * @param offerID The offer to decline.
   */
  public async DeclineOffer(offerID: string): Promise<DeclineHandoffOfferResult> {
    try {
      const mutation = gql`
        mutation DeclineHandoffOffer($offerID: String!) {
          DeclineHandoffOffer(offerID: $offerID) {
            Success
            ErrorMessage
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { offerID });
      const raw: DeclineHandoffOfferResult | undefined = result?.DeclineHandoffOffer;
      if (!raw) {
        throw new Error('Invalid response from server');
      }
      return raw;
    } catch (error: unknown) {
      const e = error as Error;
      LogError('GraphQLHandoffClient.DeclineOffer failed', undefined, e);
      return { Success: false, ErrorMessage: e.message || 'Unknown error' };
    }
  }

  /**
   * Live changes to the signed-in user's offers. The server delivers only this user's. The stream completes when the session's
   * token is refreshed (re-subscribe to continue), as every MJ subscription does.
   */
  public ObserveOfferChanges(): Observable<HandoffOfferChange> {
    const subscription = gql`
      subscription HandoffOfferChanges {
        HandoffOfferChanges {
          Kind
          Offer {
            ${OFFER_FIELDS}
          }
        }
      }
    `;
    return this._dataProvider.Subscribe(subscription).pipe(
      map((data: { HandoffOfferChanges?: HandoffOfferChange } | undefined) => data?.HandoffOfferChanges),
      filter((change): change is HandoffOfferChange => change != null),
    );
  }
}
