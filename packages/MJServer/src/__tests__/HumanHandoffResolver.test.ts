// type-graphql decorators on the resolver call Reflect.getMetadata, which only exists when this polyfill
// is loaded first. Vitest does not bring it in automatically — this MUST precede the resolver import.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const h = vi.hoisted(() => ({
  configure: vi.fn(),
  listOffersForUser: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  notificationConfig: vi.fn(async () => undefined),
  sendNotification: vi.fn(async () => ({ success: true, deliveryChannels: { inApp: true, email: false, sms: false } })),
}));

vi.mock('@memberjunction/livekit-room-server', () => ({
  RoomHandoffEngine: {
    Instance: {
      Configure: h.configure,
      ListOffersForUser: h.listOffersForUser,
      AcceptOffer: h.acceptOffer,
      DeclineOffer: h.declineOffer,
    },
  },
  LiveKitSipService: class {},
}));
vi.mock('@memberjunction/notifications', () => ({
  NotificationEngine: { Instance: { Config: h.notificationConfig, SendNotification: h.sendNotification } },
}));

import {
  HumanHandoffResolver,
  HandoffOfferChangeFilter,
  NotificationHandoffNotifier,
  PubSubHandoffPublisher,
  SetHandoffOfferPublishHook,
  ParseReplicatedHandoffOfferUpdate,
  HANDOFF_OFFER_TOPIC,
} from '../resolvers/HumanHandoffResolver';
import { PubSubManager } from '../generic/PubSubManager.js';
import type { AppContext } from '../types.js';

/** Captured at module load: the resolver binds the engine's server-only collaborators then. */
const wiredAtLoad = h.configure.mock.calls[0]?.[0] as { Presence: unknown; Publisher: unknown; Notifier: unknown };

class TestableResolver extends HumanHandoffResolver {
  public user: UserInfo | undefined = { ID: 'U1', Name: 'Dana', Email: 'dana@x.com' } as unknown as UserInfo;
  protected override GetUserFromPayload(): UserInfo | undefined {
    return this.user;
  }
}

const ctx = {} as AppContext;

const VIEW = {
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

describe('HumanHandoffResolver', () => {
  let resolver: TestableResolver;

  beforeEach(() => {
    resolver = new TestableResolver();
    h.listOffersForUser.mockReset();
    h.acceptOffer.mockReset();
    h.declineOffer.mockReset();
    h.sendNotification.mockClear();
    h.notificationConfig.mockClear();
  });

  it('gives the handoff engine its server-only collaborators when the module loads', () => {
    expect(wiredAtLoad.Presence).toBeDefined();
    expect(wiredAtLoad.Publisher).toBeInstanceOf(PubSubHandoffPublisher);
    expect(wiredAtLoad.Notifier).toBeInstanceOf(NotificationHandoffNotifier);
  });

  describe('MyHandoffOffers', () => {
    it('lists the signed-in user\'s offers, and only asks the engine about that user', async () => {
      h.listOffersForUser.mockReturnValue([VIEW]);
      const offers = await resolver.MyHandoffOffers(ctx);
      expect(h.listOffersForUser).toHaveBeenCalledWith('U1', resolver.user);
      expect(offers).toEqual([VIEW]);
    });

    it('returns nothing when there is no signed-in user', async () => {
      resolver.user = undefined;
      expect(await resolver.MyHandoffOffers(ctx)).toEqual([]);
      expect(h.listOffersForUser).not.toHaveBeenCalled();
    });
  });

  describe('AcceptHandoffOffer', () => {
    it('accepts as the signed-in user (never a user id from the client) and returns the room to join', async () => {
      h.acceptOffer.mockReturnValue({ Ok: true, Offer: { ...VIEW, Status: 'Accepted' } });
      const result = await resolver.AcceptHandoffOffer('offer-1', ctx);
      expect(h.acceptOffer).toHaveBeenCalledWith('offer-1', 'U1', resolver.user);
      expect(result).toMatchObject({ Success: true, RoomName: 'call-1', Offer: { Status: 'Accepted' } });
    });

    it('passes the engine\'s refusal back without a room', async () => {
      h.acceptOffer.mockReturnValue({ Ok: false, Reason: 'This conversation offer is no longer available.' });
      expect(await resolver.AcceptHandoffOffer('offer-1', ctx)).toEqual({ Success: false, ErrorMessage: 'This conversation offer is no longer available.', RoomName: '' });
    });

    it('requires a signed-in user', async () => {
      resolver.user = undefined;
      const result = await resolver.AcceptHandoffOffer('offer-1', ctx);
      expect(result.Success).toBe(false);
      expect(h.acceptOffer).not.toHaveBeenCalled();
    });

    it('turns an engine failure into a plain failure', async () => {
      h.acceptOffer.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(await resolver.AcceptHandoffOffer('offer-1', ctx)).toMatchObject({ Success: false, RoomName: '' });
    });
  });

  describe('DeclineHandoffOffer', () => {
    it('declines as the signed-in user', async () => {
      h.declineOffer.mockReturnValue({ Ok: true });
      expect(await resolver.DeclineHandoffOffer('offer-1', ctx)).toEqual({ Success: true });
      expect(h.declineOffer).toHaveBeenCalledWith('offer-1', 'U1', resolver.user);
    });

    it('passes a refusal back, and requires a user', async () => {
      h.declineOffer.mockReturnValue({ Ok: false, Reason: 'gone' });
      expect(await resolver.DeclineHandoffOffer('offer-1', ctx)).toEqual({ Success: false, ErrorMessage: 'gone' });
      resolver.user = undefined;
      expect((await resolver.DeclineHandoffOffer('offer-1', ctx)).Success).toBe(false);
    });
  });

  describe('HandoffOfferChanges (subscription)', () => {
    it('shapes the payload for the client and drops the server-side delivery key', () => {
      const change = resolver.HandoffOfferChanges({ UserID: 'U1', Kind: 'offered', Offer: VIEW as never });
      expect(change).toEqual({ Kind: 'offered', Offer: VIEW });
      expect(JSON.stringify(change)).not.toContain('U1');
    });
  });
});

describe('HandoffOfferChangeFilter', () => {
  const payload = { UserID: 'AAAAAAAA-0000-0000-0000-000000000001', Kind: 'offered' as const, Offer: VIEW as never };
  const context = (id?: string) => ({ userPayload: { userRecord: { ID: id } } });

  it('delivers a change only to the person it belongs to, comparing ids case-insensitively', () => {
    expect(HandoffOfferChangeFilter({ payload, context: context('aaaaaaaa-0000-0000-0000-000000000001') })).toBe(true);
    expect(HandoffOfferChangeFilter({ payload, context: context('BBBBBBBB-0000-0000-0000-000000000002') })).toBe(false);
  });

  it('fails closed when either identity is missing', () => {
    expect(HandoffOfferChangeFilter({ payload, context: undefined })).toBe(false);
    expect(HandoffOfferChangeFilter({ payload, context: context(undefined) })).toBe(false);
    expect(HandoffOfferChangeFilter({ payload: { ...payload, UserID: '' }, context: context('x') })).toBe(false);
  });
});

describe('PubSubHandoffPublisher', () => {
  it('publishes the change on the offer topic, keyed by the person it belongs to', () => {
    const publish = vi.spyOn(PubSubManager.Instance, 'Publish').mockImplementation(() => undefined);
    new PubSubHandoffPublisher().Publish({ UserID: 'U1', Kind: 'updated', Offer: VIEW as never });
    expect(publish).toHaveBeenCalledWith(HANDOFF_OFFER_TOPIC, { UserID: 'U1', Kind: 'updated', Offer: VIEW });
    publish.mockRestore();
  });

  it('forwards the change to the cluster hook if set', () => {
    const hook = vi.fn();
    SetHandoffOfferPublishHook(hook);
    new PubSubHandoffPublisher().Publish({ UserID: 'U1', Kind: 'updated', Offer: VIEW as never });
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ UserID: 'U1', Kind: 'updated', Offer: VIEW }));
    SetHandoffOfferPublishHook(null);
  });
});

describe('ParseReplicatedHandoffOfferUpdate', () => {
  it('parses valid replicated offer payload', () => {
    const raw = JSON.stringify({
      UserID: 'U1',
      Kind: 'updated',
      Offer: VIEW,
    });
    const parsed = ParseReplicatedHandoffOfferUpdate(raw);
    expect(parsed).toMatchObject({
      UserID: 'U1',
      Kind: 'updated',
      Offer: { OfferID: 'offer-1' },
    });
  });

  it('rejects invalid payloads cleanly', () => {
    expect(ParseReplicatedHandoffOfferUpdate('invalid json')).toBeNull();
    expect(ParseReplicatedHandoffOfferUpdate(JSON.stringify({ Kind: 'unknown' }))).toBeNull();
    expect(ParseReplicatedHandoffOfferUpdate(JSON.stringify({ Kind: 'updated' }))).toBeNull();
  });
});

describe('NotificationHandoffNotifier', () => {
  const user = { ID: 'run-as' } as unknown as UserInfo;
  const provider = {} as unknown as IMetadataProvider;

  it('sends a notification to the person, routed to the handoff console, through the dedicated handoff offer type', async () => {
    await new NotificationHandoffNotifier().NotifyOffer(VIEW as never, 'U1', user, provider);
    expect(h.notificationConfig).toHaveBeenCalledWith(false, user, provider);
    expect(h.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'U1',
        typeNameOrId: 'Conversation Handoff Offer',
        title: expect.stringContaining('Phone caller ****0123'),
        message: expect.stringContaining('Wants a refund'),
        resourceConfiguration: { type: 'handoff-offer', offerId: 'offer-1', room: 'call-1' },
      }),
      user,
    );
  });

  it('throws (so the engine logs it) when the notification engine reports a failure', async () => {
    h.sendNotification.mockResolvedValueOnce({ success: false, errors: ['type not found'], deliveryChannels: { inApp: false, email: false, sms: false } } as never);
    await expect(new NotificationHandoffNotifier().NotifyOffer(VIEW as never, 'U1', user, provider)).rejects.toThrow('type not found');
  });
});

