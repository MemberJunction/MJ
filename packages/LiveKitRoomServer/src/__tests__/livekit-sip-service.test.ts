import { describe, it, expect, vi } from 'vitest';
import { ParticipantInfo_State } from 'livekit-server-sdk';
import { LiveKitSipService, LIVEKIT_PARTICIPANT_KIND_SIP, type SipClientLike, type RoomServiceClientLike } from '../livekit-sip-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** Builds a fake SIP client; individual tests override what they exercise. Cast: only the used methods are modelled. */
function fakeSip(over: Partial<Record<keyof SipClientLike, unknown>> = {}): SipClientLike {
  return {
    createSipParticipant: vi.fn(async () => ({})),
    listSipInboundTrunk: vi.fn(async () => []),
    listSipOutboundTrunk: vi.fn(async () => []),
    createSipInboundTrunk: vi.fn(async (name: string, numbers: string[]) => ({ sipTrunkId: 'ST_new', name, numbers })),
    listSipDispatchRule: vi.fn(async () => []),
    createSipDispatchRule: vi.fn(async () => ({ sipDispatchRuleId: 'SDR_new' })),
    ...over,
  } as unknown as SipClientLike;
}

function fakeRooms(participants: Array<{ identity: string; name?: string; kind?: number; state: number; attributes?: Record<string, string> }>): RoomServiceClientLike {
  return {
    listParticipants: vi.fn(async () => participants.map((p) => ({ name: '', kind: 0, attributes: {}, ...p }))),
    removeParticipant: vi.fn(async () => undefined),
  } as unknown as RoomServiceClientLike;
}

describe('LiveKitSipService', () => {
  describe('configuration', () => {
    it('reports whether LiveKit credentials are present', () => {
      expect(new LiveKitSipService(CONFIG).IsConfigured).toBe(true);
      expect(new LiveKitSipService({ ServerUrl: '', ApiKey: '', ApiSecret: '' }).IsConfigured).toBe(false);
    });

    it('fails with a clear message when it needs a client but credentials are missing', async () => {
      const service = new LiveKitSipService({ ServerUrl: '', ApiKey: '', ApiSecret: '' });
      await expect(service.ListParticipants('room')).rejects.toThrow(/LIVEKIT_URL/);
    });
  });

  describe('presence', () => {
    it('lists participants, flagging phone legs and connection state', async () => {
      const service = new LiveKitSipService(CONFIG, undefined, fakeRooms([
        { identity: 'sip_+14155550123', kind: LIVEKIT_PARTICIPANT_KIND_SIP, state: ParticipantInfo_State.ACTIVE, attributes: { 'sip.phoneNumber': '+14155550123' } },
        { identity: 'user-abc', state: ParticipantInfo_State.JOINING },
      ]));
      const list = await service.ListParticipants('room');
      expect(list[0]).toMatchObject({ Identity: 'sip_+14155550123', IsSip: true, IsConnected: true, Attributes: { 'sip.phoneNumber': '+14155550123' } });
      expect(list[1]).toMatchObject({ Identity: 'user-abc', IsSip: false, IsConnected: false });
    });

    it('counts a participant present only once it is connected, matching identity case-insensitively', async () => {
      const service = new LiveKitSipService(CONFIG, undefined, fakeRooms([
        { identity: 'User-Abc', state: ParticipantInfo_State.JOINED },
        { identity: 'user-pending', state: ParticipantInfo_State.JOINING },
        { identity: 'user-gone', state: ParticipantInfo_State.DISCONNECTED },
      ]));
      expect(await service.IsParticipantPresent('room', 'user-abc')).toBe(true);
      expect(await service.IsParticipantPresent('room', 'user-pending')).toBe(false);
      expect(await service.IsParticipantPresent('room', 'user-gone')).toBe(false);
      expect(await service.IsParticipantPresent('room', 'nobody')).toBe(false);
    });

    it('removes a participant from a room', async () => {
      const rooms = fakeRooms([]);
      await new LiveKitSipService(CONFIG, undefined, rooms).RemoveParticipant('room', 'sip_1');
      expect(rooms.removeParticipant).toHaveBeenCalledWith('room', 'sip_1');
    });
  });

  describe('dialing out', () => {
    it('creates a SIP participant that waits for the answer, with a stable identity', async () => {
      const sip = fakeSip();
      await new LiveKitSipService(CONFIG, sip).DialIntoRoom({
        RoomName: 'call-1',
        TrunkID: 'ST_out',
        Number: '+14155550123',
        ParticipantIdentity: 'sip-handoff-1',
        DisplayName: 'Dana',
        FromNumber: '+14155550000',
        RingTimeoutSeconds: 30,
      });
      expect(sip.createSipParticipant).toHaveBeenCalledWith(
        'ST_out',
        '+14155550123',
        'call-1',
        expect.objectContaining({ participantIdentity: 'sip-handoff-1', participantName: 'Dana', fromNumber: '+14155550000', ringingTimeout: 30, waitUntilAnswered: true }),
      );
    });

    it('lets the caller opt out of waiting for the answer', async () => {
      const sip = fakeSip();
      await new LiveKitSipService(CONFIG, sip).DialIntoRoom({ RoomName: 'r', TrunkID: 't', Number: '+14155550123', ParticipantIdentity: 'i', WaitUntilAnswered: false });
      expect(vi.mocked(sip.createSipParticipant).mock.calls[0][3]).toMatchObject({ waitUntilAnswered: false });
    });

    it('lets a failed dial (busy, refused) reach the caller', async () => {
      const sip = fakeSip({ createSipParticipant: vi.fn(async () => Promise.reject(new Error('486 busy'))) });
      await expect(new LiveKitSipService(CONFIG, sip).DialIntoRoom({ RoomName: 'r', TrunkID: 't', Number: '+14155550123', ParticipantIdentity: 'i' })).rejects.toThrow('486 busy');
    });
  });

  describe('trunks', () => {
    it('summarises inbound and outbound trunks', async () => {
      const sip = fakeSip({
        listSipInboundTrunk: vi.fn(async () => [{ sipTrunkId: 'ST_in', name: 'in', numbers: ['+1415'] }]),
        listSipOutboundTrunk: vi.fn(async () => [{ sipTrunkId: 'ST_out', name: 'out', numbers: ['+1650'] }]),
      });
      const service = new LiveKitSipService(CONFIG, sip);
      expect(await service.ListInboundTrunks()).toEqual([{ TrunkID: 'ST_in', Name: 'in', Numbers: ['+1415'] }]);
      expect(await service.OutboundTrunkExists('ST_out')).toBe(true);
      expect(await service.OutboundTrunkExists('ST_missing')).toBe(false);
    });
  });

  describe('EnsureInboundRouting', () => {
    const params = { Numbers: ['+14155550123'], RoomPrefix: 'call-', Name: 'MJ' };

    it('creates the trunk and the dispatch rule when neither exists', async () => {
      const sip = fakeSip();
      const result = await new LiveKitSipService(CONFIG, sip).EnsureInboundRouting({ ...params, AllowedAddresses: ['54.172.60.0/30'], AuthUsername: 'u', AuthPassword: 'p' });
      expect(result).toEqual({ TrunkID: 'ST_new', DispatchRuleID: 'SDR_new', CreatedTrunk: true, CreatedDispatchRule: true });
      expect(sip.createSipInboundTrunk).toHaveBeenCalledWith('MJ', ['+14155550123'], expect.objectContaining({ allowedAddresses: ['54.172.60.0/30'], authUsername: 'u', authPassword: 'p' }));
      expect(sip.createSipDispatchRule).toHaveBeenCalledWith({ type: 'individual', roomPrefix: 'call-' }, expect.objectContaining({ trunkIds: ['ST_new'] }));
    });

    it('creates nothing when the trunk and an individual rule with the prefix already exist (idempotent)', async () => {
      const sip = fakeSip({
        listSipInboundTrunk: vi.fn(async () => [{ sipTrunkId: 'ST_have', name: 'have', numbers: ['+14155550123'] }]),
        listSipDispatchRule: vi.fn(async () => [{ sipDispatchRuleId: 'SDR_have', rule: { rule: { case: 'dispatchRuleIndividual', value: { roomPrefix: 'call-' } } } }]),
      });
      const result = await new LiveKitSipService(CONFIG, sip).EnsureInboundRouting(params);
      expect(result).toEqual({ TrunkID: 'ST_have', DispatchRuleID: 'SDR_have', CreatedTrunk: false, CreatedDispatchRule: false });
      expect(sip.createSipInboundTrunk).not.toHaveBeenCalled();
      expect(sip.createSipDispatchRule).not.toHaveBeenCalled();
    });

    it('adds a rule when the trunk exists but its rules use a different room prefix', async () => {
      const sip = fakeSip({
        listSipInboundTrunk: vi.fn(async () => [{ sipTrunkId: 'ST_have', name: 'have', numbers: ['+14155550123'] }]),
        listSipDispatchRule: vi.fn(async () => [{ sipDispatchRuleId: 'SDR_other', rule: { rule: { case: 'dispatchRuleIndividual', value: { roomPrefix: 'other-' } } } }]),
      });
      const result = await new LiveKitSipService(CONFIG, sip).EnsureInboundRouting(params);
      expect(result).toMatchObject({ TrunkID: 'ST_have', DispatchRuleID: 'SDR_new', CreatedTrunk: false, CreatedDispatchRule: true });
    });

    it('does not reuse a trunk that covers only some of the numbers', async () => {
      const sip = fakeSip({
        listSipInboundTrunk: vi.fn(async () => [{ sipTrunkId: 'ST_partial', name: 'partial', numbers: ['+14155550123'] }]),
      });
      const result = await new LiveKitSipService(CONFIG, sip).EnsureInboundRouting({ ...params, Numbers: ['+14155550123', '+14155550124'] });
      expect(result.CreatedTrunk).toBe(true);
    });
  });
});
