import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { LiveKitUserIdentity } from '../livekit-token-service';
import { HandoffOfferRegistry, HANDOFF_OFFER_TIMEOUT_MS } from '../room-handoff/handoff-offer-registry';
import {
  RoomHandoffEngine,
  FINISH_HANDOFF_TOOL,
  HANDOFF_BLIND_LEAVE_DELAY_MS,
  HANDOFF_BRIEF_MAX_MS,
  HANDOFF_JOIN_WAIT_MS,
  HANDOFF_LEAVE_SETTLE_MS,
  HANDOFF_PRESENCE_POLL_MS,
} from '../room-handoff/room-handoff-engine';
import type {
  DialIntoRoomRequest,
  HandoffOfferEvent,
  HandoffRequest,
  RoomHandoffAgentContext,
  StartRoomAgentRequest,
} from '../room-handoff/handoff-types';

const PERSON = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';
const USER = {} as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;

/** A scriptable room: tests decide who is "in" it. */
class FakePresence {
  public readonly Present = new Set<string>();
  public async IsParticipantPresent(_room: string, identity: string): Promise<boolean> {
    return this.Present.has(identity);
  }
}

function makeAgent(room = 'call-1') {
  const notes: string[] = [];
  const state = { left: false };
  const agent: RoomHandoffAgentContext = {
    RoomName: room,
    AgentName: 'Sage',
    CallerLabel: 'Phone caller ****1234',
    ContextUser: USER,
    Provider: PROVIDER,
    LeaveRoom: async () => {
      state.left = true;
    },
    NotifyModel: (note) => notes.push(note),
  };
  return { agent, notes, state };
}

function userRequest(over: Partial<HandoffRequest> = {}, fallback?: string): HandoffRequest {
  return {
    Mode: 'warm',
    Summary: 'Customer wants to cancel their plan',
    Destination: { Kind: 'user', UserID: PERSON, DisplayName: 'Dana', FallbackNumber: fallback },
    ...over,
  };
}

describe('RoomHandoffEngine', () => {
  let engine: RoomHandoffEngine;
  let presence: FakePresence;
  let events: HandoffOfferEvent[];
  let notified: Array<{ offerId: string; userId: string; provider: IMetadataProvider }>;
  let dialed: DialIntoRoomRequest[];

  beforeEach(() => {
    vi.useFakeTimers();
    HandoffOfferRegistry.Instance.Clear();
    HandoffOfferRegistry.Instance.SetClock(() => Date.now());
    engine = RoomHandoffEngine.Instance;
    engine.Reset();
    presence = new FakePresence();
    events = [];
    notified = [];
    dialed = [];
    engine.Configure({
      Presence: presence,
      Publisher: { Publish: (e) => events.push(e) },
      Notifier: { NotifyOffer: async (offer, userId, _user, provider) => void notified.push({ offerId: offer.OfferID, userId, provider }) },
      Dialer: {
        DialIntoRoom: async (req) => {
          dialed.push(req);
        },
      },
    });
  });

  afterEach(() => {
    engine.Reset();
    vi.useRealTimers();
  });

  describe('requesting a handoff', () => {
    it('refuses a handoff with no summary', async () => {
      const { agent } = makeAgent();
      expect(await engine.RequestHandoff(agent, userRequest({ Summary: '   ' }))).toMatchObject({ Ok: false });
    });

    it('refuses a kind whose collaborator is not configured, without starting anything', async () => {
      engine.Reset(); // drops every collaborator
      const { agent } = makeAgent();
      expect(await engine.RequestHandoff(agent, userRequest())).toMatchObject({ Ok: false });
      expect(await engine.RequestHandoff(agent, { Mode: 'blind', Summary: 's', Destination: { Kind: 'number', Number: '+14155550123', DisplayName: 'Desk' } })).toMatchObject({ Ok: false });
      expect(await engine.RequestHandoff(agent, { Mode: 'warm', Summary: 's', Destination: { Kind: 'agent', AgentID: 'a', AgentName: 'Rex' } })).toMatchObject({ Ok: false });
      expect(engine.HasHandoff('call-1')).toBe(false);
    });

    it('allows one handoff per room at a time', async () => {
      const { agent } = makeAgent();
      expect(await engine.RequestHandoff(agent, userRequest())).toEqual({ Ok: true, Status: 'offered' });
      expect(await engine.RequestHandoff(agent, userRequest())).toMatchObject({ Ok: false });
    });

    it('trims an over-long summary', async () => {
      const { agent } = makeAgent();
      await engine.RequestHandoff(agent, userRequest({ Summary: 'x'.repeat(5000) }));
      expect((await engine.ListOffersForUser(PERSON))[0].Summary.length).toBeLessThan(1000);
    });
  });

  describe('a person: offer, accept, join, brief, leave (warm)', () => {
    it('pushes the offer to the person\'s console and notifies them', async () => {
      const { agent } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ UserID: PERSON, Kind: 'offered', Offer: { Status: 'Pending', AgentName: 'Sage', RoomName: 'call-1' } });
      expect(notified).toEqual([{ offerId: events[0].Offer.OfferID, userId: PERSON, provider: PROVIDER }]);
    });

    it('lists the offer for its target and for nobody else', async () => {
      const { agent } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      expect(await engine.ListOffersForUser(PERSON)).toHaveLength(1);
      expect(await engine.ListOffersForUser(OTHER)).toHaveLength(0);
    });

    it('does not let another user accept or decline the offer', async () => {
      const { agent } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      const offerId = (await engine.ListOffersForUser(PERSON))[0].OfferID;
      expect(await engine.AcceptOffer(offerId, OTHER)).toMatchObject({ Ok: false });
      expect(await engine.DeclineOffer(offerId, OTHER)).toMatchObject({ Ok: false });
      expect((await engine.ListOffersForUser(PERSON))[0].Status).toBe('Pending');
    });

    it('briefs the AI once the person is actually in the room, then removes it after it calls finish_handoff', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      const offerId = (await engine.ListOffersForUser(PERSON))[0].OfferID;

      expect(await engine.AcceptOffer(offerId, PERSON)).toMatchObject({ Ok: true, Offer: { Status: 'Accepted' } });
      expect(events.at(-1)).toMatchObject({ Kind: 'updated', Offer: { Status: 'Accepted' } });

      // Accepted, but not in the room yet: the AI is told nothing and does not leave.
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS * 3);
      expect(notes).toHaveLength(0);
      expect(state.left).toBe(false);

      presence.Present.add(LiveKitUserIdentity(PERSON));
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain('Dana has joined');
      expect(notes[0]).toContain(FINISH_HANDOFF_TOOL);
      expect(notes[0]).toContain('Customer wants to cancel their plan');
      expect(state.left).toBe(false);

      expect(engine.AgentReadyToLeave('call-1')).toBe(true);
      await vi.advanceTimersByTimeAsync(HANDOFF_LEAVE_SETTLE_MS);
      expect(state.left).toBe(true);
      expect(engine.HasHandoff('call-1')).toBe(false);
    });

    it('removes the AI after the briefing ceiling if it never calls finish_handoff', async () => {
      const { agent, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      await engine.AcceptOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      presence.Present.add(LiveKitUserIdentity(PERSON));
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS);
      await vi.advanceTimersByTimeAsync(HANDOFF_BRIEF_MAX_MS - 1);
      expect(state.left).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(state.left).toBe(true);
    });

    it('does not accept a finish_handoff when no handoff is waiting for it', async () => {
      expect(engine.AgentReadyToLeave('call-1')).toBe(false);
      const { agent } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      expect(engine.AgentReadyToLeave('call-1')).toBe(false); // still only offered
    });
  });

  describe('a person: blind', () => {
    it('removes the AI shortly after the person appears, with no briefing', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest({ Mode: 'blind' }));
      await engine.AcceptOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      presence.Present.add(LiveKitUserIdentity(PERSON));
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS);
      expect(notes).toHaveLength(0);
      expect(state.left).toBe(false);
      await vi.advanceTimersByTimeAsync(HANDOFF_BLIND_LEAVE_DELAY_MS);
      expect(state.left).toBe(true);
    });
  });

  describe('a person: decline, expiry and no-show', () => {
    it('tells the AI nobody is available when the person declines and there is no fallback', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      const offerId = (await engine.ListOffersForUser(PERSON))[0].OfferID;
      expect(await engine.DeclineOffer(offerId, PERSON)).toEqual({ Ok: true });
      expect(events.at(-1)).toMatchObject({ Kind: 'updated', Offer: { Status: 'Declined' } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain('Nobody could take the conversation');
      expect(state.left).toBe(false);
      expect(dialed).toHaveLength(0);
      expect(engine.HasHandoff('call-1')).toBe(false);
    });

    it('dials the fallback number into the room when the person declines, then briefs and removes the AI', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest({}, '+14155550199'));
      await engine.DeclineOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      await vi.advanceTimersByTimeAsync(0);
      expect(dialed).toHaveLength(1);
      expect(dialed[0]).toMatchObject({ RoomName: 'call-1', Number: '+14155550199', DisplayName: 'Dana' });
      expect(notes[0]).toContain('trying their phone');

      presence.Present.add(dialed[0].ParticipantIdentity);
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS);
      expect(notes.at(-1)).toContain('has joined');
      engine.AgentReadyToLeave('call-1');
      await vi.advanceTimersByTimeAsync(HANDOFF_LEAVE_SETTLE_MS);
      expect(state.left).toBe(true);
    });

    it('expires an unanswered offer, publishes that, and falls back', async () => {
      const { agent, notes } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      await vi.advanceTimersByTimeAsync(HANDOFF_OFFER_TIMEOUT_MS);
      expect(events.at(-1)).toMatchObject({ Kind: 'updated', Offer: { Status: 'Expired' } });
      expect(notes.at(-1)).toContain('did not answer in time');
      expect(engine.HasHandoff('call-1')).toBe(false);
    });

    it('treats an accepted offer whose person never appears as unavailable', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      await engine.AcceptOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      await vi.advanceTimersByTimeAsync(HANDOFF_JOIN_WAIT_MS + HANDOFF_PRESENCE_POLL_MS);
      expect(notes.at(-1)).toContain('accepted but did not join');
      expect(state.left).toBe(false);
    });

    it('gives up cleanly when the fallback dial fails', async () => {
      engine.Configure({
        Dialer: {
          DialIntoRoom: async () => {
            throw new Error('busy');
          },
        },
      });
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest({}, '+14155550199'));
      await engine.DeclineOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      await vi.advanceTimersByTimeAsync(0);
      expect(notes.at(-1)).toContain('could not be reached by phone');
      expect(state.left).toBe(false);
      expect(engine.HasHandoff('call-1')).toBe(false);
    });
  });

  describe('a number', () => {
    const numberRequest: HandoffRequest = { Mode: 'blind', Summary: 'Billing question', Destination: { Kind: 'number', Number: '+14155550123', DisplayName: 'Front desk' } };

    it('dials it into the room and removes the AI once it has answered', async () => {
      const { agent, state } = makeAgent();
      expect(await engine.RequestHandoff(agent, numberRequest)).toEqual({ Ok: true, Status: 'dialing' });
      await vi.advanceTimersByTimeAsync(0);
      expect(dialed[0]).toMatchObject({ Number: '+14155550123', RoomName: 'call-1' });
      presence.Present.add(dialed[0].ParticipantIdentity);
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS + HANDOFF_BLIND_LEAVE_DELAY_MS);
      expect(state.left).toBe(true);
    });

    it('passes FromNumber to Dialer when specified on destination', async () => {
      const { agent } = makeAgent();
      const req: HandoffRequest = {
        Mode: 'blind',
        Summary: 'Billing question',
        Destination: { Kind: 'number', Number: '+14155550123', DisplayName: 'Front desk', FromNumber: '+18005559999' },
      };
      await engine.RequestHandoff(agent, req);
      await vi.advanceTimersByTimeAsync(0);
      expect(dialed[0]).toMatchObject({ Number: '+14155550123', RoomName: 'call-1', FromNumber: '+18005559999' });
    });

    it('tells the AI when the number does not pick up', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, numberRequest);
      await vi.advanceTimersByTimeAsync(HANDOFF_JOIN_WAIT_MS + HANDOFF_PRESENCE_POLL_MS);
      expect(notes.at(-1)).toContain('Front desk did not pick up');
      expect(state.left).toBe(false);
    });
  });

  describe('another agent', () => {
    it('starts the agent with the AI\'s brief, then briefs and removes the first agent', async () => {
      const started: StartRoomAgentRequest[] = [];
      engine.Configure({
        AgentStarter: async (req) => {
          started.push(req);
          return { SessionBridgeID: 'bridge-2' };
        },
      });
      const { agent, notes, state } = makeAgent();
      const result = await engine.RequestHandoff(agent, { Mode: 'warm', Summary: 'Needs legal help', Destination: { Kind: 'agent', AgentID: 'agent-2', AgentName: 'Rex' } });
      expect(result).toEqual({ Ok: true, Status: 'agent-joining' });
      await vi.advanceTimersByTimeAsync(0);
      expect(started[0]).toMatchObject({ RoomName: 'call-1', AgentID: 'agent-2', AgentName: 'Rex', Brief: 'Needs legal help', PreviousAgentName: 'Sage' });
      expect(notes[0]).toContain('Rex has joined');
      engine.AgentReadyToLeave('call-1');
      await vi.advanceTimersByTimeAsync(HANDOFF_LEAVE_SETTLE_MS);
      expect(state.left).toBe(true);
    });

    it('keeps the first agent when the second cannot start', async () => {
      engine.Configure({
        AgentStarter: async () => {
          throw new Error('no capacity');
        },
      });
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, { Mode: 'blind', Summary: 's', Destination: { Kind: 'agent', AgentID: 'agent-2', AgentName: 'Rex' } });
      await vi.advanceTimersByTimeAsync(0);
      expect(notes.at(-1)).toContain('Rex could not be started');
      expect(state.left).toBe(false);
    });
  });

  describe('when the call ends first', () => {
    it('withdraws the offer, tells the console, and refuses a late accept', async () => {
      const { agent } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      const offerId = (await engine.ListOffersForUser(PERSON))[0].OfferID;
      engine.CancelRoom('call-1');
      expect(events.at(-1)).toMatchObject({ Kind: 'updated', Offer: { Status: 'Cancelled' } });
      expect(await engine.AcceptOffer(offerId, PERSON)).toMatchObject({ Ok: false });
      expect(engine.HasHandoff('call-1')).toBe(false);
    });

    it('does not cancel a handoff that is already taking the AI out', async () => {
      const { agent, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest({ Mode: 'blind' }));
      await engine.AcceptOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      presence.Present.add(LiveKitUserIdentity(PERSON));
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS);
      engine.CancelRoom('call-1'); // the AI's own teardown firing during its leave
      await vi.advanceTimersByTimeAsync(HANDOFF_BLIND_LEAVE_DELAY_MS);
      expect(state.left).toBe(true);
    });

    it('stops watching the room once cancelled', async () => {
      const { agent, notes } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      await engine.AcceptOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      engine.CancelRoom('call-1');
      presence.Present.add(LiveKitUserIdentity(PERSON));
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS * 5);
      expect(notes).toHaveLength(0);
    });
  });

  describe('failures in the collaborators', () => {
    it('still makes the offer when the notifier throws (the live console still gets it)', async () => {
      engine.Configure({
        Notifier: {
          NotifyOffer: async () => {
            throw new Error('comms down');
          },
        },
      });
      const { agent } = makeAgent();
      expect(await engine.RequestHandoff(agent, userRequest())).toEqual({ Ok: true, Status: 'offered' });
      await vi.advanceTimersByTimeAsync(0);
      expect(await engine.ListOffersForUser(PERSON)).toHaveLength(1);
    });

    it('keeps watching when a presence check throws', async () => {
      let calls = 0;
      engine.Configure({
        Presence: {
          IsParticipantPresent: async () => {
            calls++;
            if (calls === 1) {
              throw new Error('LiveKit hiccup');
            }
            return true;
          },
        },
      });
      const { agent, notes } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      await engine.AcceptOffer((await engine.ListOffersForUser(PERSON))[0].OfferID, PERSON);
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS * 2);
      expect(notes[0]).toContain('has joined');
    });

    it('survives a publisher that throws', async () => {
      engine.Configure({
        Publisher: {
          Publish: () => {
            throw new Error('pubsub down');
          },
        },
      });
      const { agent } = makeAgent();
      expect(await engine.RequestHandoff(agent, userRequest())).toEqual({ Ok: true, Status: 'offered' });
    });
  });

  describe('cross-instance remote offer changes', () => {
    it('handles remote acceptance on a local flow', async () => {
      const { agent, notes, state } = makeAgent();
      await engine.RequestHandoff(agent, userRequest());
      const offer = (await engine.ListOffersForUser(PERSON))[0];

      // Simulate remote instance accepting the offer
      engine.OnRemoteOfferChange({
        Kind: 'updated',
        Offer: { ...offer, Status: 'Accepted' },
        UserID: PERSON,
      });

      // Presence should be polled now
      presence.Present.add(LiveKitUserIdentity(PERSON));
      await vi.advanceTimersByTimeAsync(HANDOFF_PRESENCE_POLL_MS);
      expect(notes[0]).toContain('Dana has joined');
      engine.AgentReadyToLeave('call-1');
      await vi.advanceTimersByTimeAsync(HANDOFF_LEAVE_SETTLE_MS);
      expect(state.left).toBe(true);
    });
  });

  describe('RegisterObserver', () => {
    it('notifies registered observers on handoff events and unregisters cleanly', async () => {
      const { agent } = makeAgent();
      const events: string[] = [];
      const registration = engine.RegisterObserver({
        OnHandoffEvent: (evt) => {
          events.push(evt.EventType);
        },
      });

      await engine.RequestHandoff(agent, userRequest());
      expect(events).toContain('Offered');
      expect(events).toContain('Escalated');

      events.length = 0;
      registration.Unregister();

      const offer = (await engine.ListOffersForUser(PERSON))[0];
      await engine.AcceptOffer(offer.OfferID, PERSON);
      expect(events).toHaveLength(0);
    });
  });
});
