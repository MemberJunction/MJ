import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { GraphQLHandoffClient, type HandoffOfferChange, type HandoffOfferInfo } from '../graphQLHandoffClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

const OFFER: HandoffOfferInfo = {
  OfferID: 'offer-1',
  RoomName: 'call-1',
  Mode: 'warm',
  Summary: 'Wants a refund',
  CallerLabel: 'Phone caller ****0123',
  AgentName: 'Sage',
  Status: 'Pending',
  CreatedAt: '2026-10-03T10:00:00.000Z',
  ExpiresAt: '2026-10-03T10:00:45.000Z',
};

/** The client is a thin transport adapter, tested through a stub provider that records requests and returns canned replies. */
function makeProvider(reply: Record<string, unknown> | (() => never), subscription?: Subject<unknown>) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const provider = {
    ExecuteGQL: vi.fn(async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (typeof reply === 'function') {
        reply();
      }
      return reply;
    }),
    Subscribe: vi.fn(() => subscription ?? new Subject<unknown>()),
  } as unknown as GraphQLDataProvider;
  return { provider, calls };
}

describe('GraphQLHandoffClient', () => {
  describe('GetMyOffers', () => {
    it('returns the offers the server lists for the signed-in user (no user id is sent)', async () => {
      const { provider, calls } = makeProvider({ MyHandoffOffers: [OFFER] });
      const offers = await new GraphQLHandoffClient(provider).GetMyOffers();
      expect(offers).toEqual([OFFER]);
      expect(calls[0].variables).toEqual({});
      expect(calls[0].query).toContain('MyHandoffOffers');
    });

    it('resolves to an empty list when the reply carries none, or the transport fails', async () => {
      expect(await new GraphQLHandoffClient(makeProvider({}).provider).GetMyOffers()).toEqual([]);
      const failing = makeProvider(() => {
        throw new Error('network down');
      });
      expect(await new GraphQLHandoffClient(failing.provider).GetMyOffers()).toEqual([]);
    });
  });

  describe('AcceptOffer', () => {
    it('sends only the offer id and returns the room to join', async () => {
      const { provider, calls } = makeProvider({ AcceptHandoffOffer: { Success: true, RoomName: 'call-1', Offer: { ...OFFER, Status: 'Accepted' } } });
      const result = await new GraphQLHandoffClient(provider).AcceptOffer('offer-1');
      expect(calls[0].variables).toEqual({ offerID: 'offer-1' });
      expect(result).toMatchObject({ Success: true, RoomName: 'call-1', Offer: { Status: 'Accepted' } });
    });

    it('passes a server refusal through', async () => {
      const { provider } = makeProvider({ AcceptHandoffOffer: { Success: false, ErrorMessage: 'This conversation offer is no longer available.', RoomName: '' } });
      expect(await new GraphQLHandoffClient(provider).AcceptOffer('offer-1')).toMatchObject({ Success: false, RoomName: '' });
    });

    it('normalizes a transport error into a failure result (never throws)', async () => {
      const { provider } = makeProvider(() => {
        throw new Error('network down');
      });
      const result = await new GraphQLHandoffClient(provider).AcceptOffer('offer-1');
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/network down/);
      expect(result.RoomName).toBe('');
    });

    it('treats an empty reply as a failure', async () => {
      expect((await new GraphQLHandoffClient(makeProvider({}).provider).AcceptOffer('offer-1')).Success).toBe(false);
    });
  });

  describe('DeclineOffer', () => {
    it('sends only the offer id and returns the result', async () => {
      const { provider, calls } = makeProvider({ DeclineHandoffOffer: { Success: true } });
      expect(await new GraphQLHandoffClient(provider).DeclineOffer('offer-1')).toEqual({ Success: true });
      expect(calls[0].variables).toEqual({ offerID: 'offer-1' });
    });

    it('normalizes a transport error into a failure result', async () => {
      const { provider } = makeProvider(() => {
        throw new Error('boom');
      });
      expect(await new GraphQLHandoffClient(provider).DeclineOffer('offer-1')).toMatchObject({ Success: false, ErrorMessage: 'boom' });
    });
  });

  describe('ObserveOfferChanges', () => {
    it('emits each change from the subscription and ignores empty frames', () => {
      const wire = new Subject<unknown>();
      const { provider } = makeProvider({}, wire);
      const seen: HandoffOfferChange[] = [];
      new GraphQLHandoffClient(provider).ObserveOfferChanges().subscribe((c) => seen.push(c));
      wire.next({ HandoffOfferChanges: { Kind: 'offered', Offer: OFFER } });
      wire.next({});
      wire.next(undefined);
      wire.next({ HandoffOfferChanges: { Kind: 'updated', Offer: { ...OFFER, Status: 'Cancelled' } } });
      expect(seen.map((c) => [c.Kind, c.Offer.Status])).toEqual([
        ['offered', 'Pending'],
        ['updated', 'Cancelled'],
      ]);
    });

    it('subscribes with no variables (the server filters by the connection\'s user)', () => {
      const { provider } = makeProvider({});
      new GraphQLHandoffClient(provider).ObserveOfferChanges().subscribe();
      const [query, variables] = vi.mocked(provider.Subscribe).mock.calls[0] as unknown as [string, unknown];
      expect(query).toContain('HandoffOfferChanges');
      expect(variables).toBeUndefined();
    });
  });
});
