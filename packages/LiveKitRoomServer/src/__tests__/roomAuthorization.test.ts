import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { RoomAuthorizationService, SIP_CALL_ROOM_PREFIX } from '../room-authorization.js';

const mockRunView = vi.fn();
const mockRunViews = vi.fn();

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockRunView {
    RunView = mockRunView;
    RunViews = mockRunViews;
    static FromMetadataProvider = () => new MockRunView();
  }
  return {
    ...actual,
    RunView: MockRunView,
  };
});

describe('RoomAuthorizationService', () => {
  const service = RoomAuthorizationService.Instance;
  const user: UserInfo = { ID: 'user-1', Name: 'Alice', Email: 'alice@example.com' } as unknown as UserInfo;
  const provider = {} as IMetadataProvider;

  const emptyBatch = () => [
    { Success: true, Results: [] },
    { Success: true, Results: [] },
    { Success: true, Results: [] },
  ];

  beforeEach(() => {
    mockRunView.mockReset();
    mockRunViews.mockReset();
    service.SetAuthorizerForTesting(undefined);
  });

  it('refuses access when user is not authenticated', async () => {
    const result = await service.AuthorizeRoomAccess('some-room', undefined as unknown as UserInfo, provider);
    expect(result.Authorized).toBe(false);
    expect(result.Reason).toMatch(/not authenticated/i);
  });

  it('refuses access when user has no ID', async () => {
    const result = await service.AuthorizeRoomAccess('some-room', {} as UserInfo, provider);
    expect(result.Authorized).toBe(false);
    expect(result.Reason).toMatch(/not authenticated/i);
  });

  it('refuses access when room name is empty', async () => {
    const result = await service.AuthorizeRoomAccess('   ', user, provider);
    expect(result.Authorized).toBe(false);
    expect(result.Reason).toMatch(/empty/i);
  });

  describe('Ad-hoc rooms', () => {
    it('authorizes access when room is not tied to a meeting, interaction, or offer, and has no SIP prefix', async () => {
      mockRunViews.mockResolvedValueOnce(emptyBatch());

      const result = await service.AuthorizeRoomAccess('adhoc-room-1', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunViews).toHaveBeenCalledTimes(1);
      const batchParams = mockRunViews.mock.calls[0][0];
      expect(batchParams.length).toBe(3);
      expect(batchParams[0].EntityName).toBe('MJ: Meetings');
      expect(batchParams[0].ResultType).toBe('simple');
      expect(batchParams[0].Fields).toEqual(['ID', 'Status', 'HostUserID']);
      expect(batchParams[1].EntityName).toBe('MJ: Interactions');
      expect(batchParams[1].ResultType).toBe('simple');
      expect(batchParams[1].Fields).toEqual(['ID', 'Status', 'AgentSessionID']);
      expect(batchParams[2].EntityName).toBe('MJ: Interaction Offers');
      expect(batchParams[2].ResultType).toBe('simple');
      expect(batchParams[2].Fields).toEqual(['ID', 'Status', 'TargetUserID']);
    });

    it('refuses ad-hoc access when room name starts with SIP call prefix even if no records exist', async () => {
      mockRunViews.mockResolvedValueOnce(emptyBatch());

      const result = await service.AuthorizeRoomAccess(`${SIP_CALL_ROOM_PREFIX}inbound-123`, user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not authorized to access this call/i);
    });
  });

  describe('Rooms tied to Meetings', () => {
    it('refuses access when meeting is cancelled', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Cancelled',
        HostUserID: user.ID,
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/cancelled/i);
    });

    it('grants access when user is the meeting host (case-insensitive UUID)', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Scheduled',
        HostUserID: user.ID.toUpperCase(),
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunView).not.toHaveBeenCalled();
    });

    it('grants access when user is an accepted participant', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Live',
        HostUserID: 'host-user-id',
      };

      const mockParticipant = {
        ID: 'part-1',
        MeetingID: 'meeting-1',
        UserID: user.ID,
        InviteStatus: 'Accepted',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockParticipant] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunView).toHaveBeenCalledTimes(1);
      expect(mockRunView.mock.calls[0][0].EntityName).toBe('MJ: Meeting Participants');
      expect(mockRunView.mock.calls[0][0].ResultType).toBe('simple');
    });

    it('grants access when user is an invited participant', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Scheduled',
        HostUserID: 'host-user-id',
      };

      const mockParticipant = {
        ID: 'part-1',
        MeetingID: 'meeting-1',
        UserID: user.ID,
        InviteStatus: 'Invited',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockParticipant] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(true);
    });

    it('refuses access when user declined the invitation', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Scheduled',
        HostUserID: 'other-host',
      };

      const mockParticipant = {
        ID: 'part-1',
        MeetingID: 'meeting-1',
        UserID: user.ID,
        InviteStatus: 'Declined',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockParticipant] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/declined/i);
    });

    it('refuses access when user is not a host or participant', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Live',
        HostUserID: 'other-host',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not a host or participant/i);
    });
  });

  describe('Rooms tied to Interactions / Calls', () => {
    it('grants access when user is the interaction agent-session owner', async () => {
      const mockInteraction = {
        ID: 'interaction-1',
        Status: 'Active',
        AgentSessionID: 'session-1',
      };
      const mockSession = {
        ID: 'session-1',
        UserID: user.ID,
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [mockInteraction] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockSession] });

      const result = await service.AuthorizeRoomAccess('call-room-owner', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunView).toHaveBeenCalledTimes(1);
      expect(mockRunView.mock.calls[0][0].EntityName).toBe('MJ: AI Agent Sessions');
      expect(mockRunView.mock.calls[0][0].ResultType).toBe('simple');
    });

    it('grants access when user has an Accepted handoff offer for the interaction room', async () => {
      const mockInteraction = {
        ID: 'interaction-1',
        Status: 'Active',
        AgentSessionID: 'session-1',
      };
      const mockOffer = {
        ID: 'offer-1',
        Status: 'Accepted',
        TargetUserID: user.ID,
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [mockInteraction] },
        { Success: true, Results: [mockOffer] },
      ]);

      const result = await service.AuthorizeRoomAccess('call-room-offer', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunView).not.toHaveBeenCalled();
    });

    it('refuses access when user is not the session owner and has no accepted offer', async () => {
      const mockInteraction = {
        ID: 'interaction-1',
        Status: 'Active',
        AgentSessionID: 'session-1',
      };
      const mockSession = {
        ID: 'session-1',
        UserID: 'other-user',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [mockInteraction] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockSession] });

      const result = await service.AuthorizeRoomAccess('call-room-stranger', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not authorized to access this call/i);
    });

    it('grants access to a SIP-prefixed room when user has an Accepted offer even if interaction row is not yet created', async () => {
      const mockOffer = {
        ID: 'offer-1',
        Status: 'Accepted',
        TargetUserID: user.ID,
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
        { Success: true, Results: [mockOffer] },
      ]);

      const result = await service.AuthorizeRoomAccess(`${SIP_CALL_ROOM_PREFIX}inbound-offer`, user, provider);
      expect(result.Authorized).toBe(true);
    });

    it('refuses access to a SIP-prefixed room when user has only a Pending offer', async () => {
      const mockOffer = {
        ID: 'offer-1',
        Status: 'Pending',
        TargetUserID: user.ID,
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
        { Success: true, Results: [mockOffer] },
      ]);

      const result = await service.AuthorizeRoomAccess(`${SIP_CALL_ROOM_PREFIX}inbound-pending`, user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not authorized to access this call/i);
    });
  });

  describe('Rooms tied to standalone Interaction Offers', () => {
    it('grants access when user is target user and status is Accepted', async () => {
      const mockOffer = {
        ID: 'offer-1',
        TargetUserID: user.ID,
        Status: 'Accepted',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
        { Success: true, Results: [mockOffer] },
      ]);

      const result = await service.AuthorizeRoomAccess('web-room-offer', user, provider);
      expect(result.Authorized).toBe(true);
    });

    it('refuses access when offer status is Pending', async () => {
      const mockOffer = {
        ID: 'offer-1',
        TargetUserID: user.ID,
        Status: 'Pending',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
        { Success: true, Results: [mockOffer] },
      ]);

      const result = await service.AuthorizeRoomAccess('web-room-offer', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not accepted a handoff offer/i);
    });

    it('refuses access when offer target is a different user', async () => {
      const mockOffer = {
        ID: 'offer-1',
        TargetUserID: 'other-user',
        Status: 'Accepted',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
        { Success: true, Results: [mockOffer] },
      ]);

      const result = await service.AuthorizeRoomAccess('web-room-offer', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not accepted a handoff offer/i);
    });
  });

  describe('Error handling', () => {
    it('returns fail-closed result when batch query fails for Meetings', async () => {
      mockRunViews.mockResolvedValueOnce([
        { Success: false, ErrorMessage: 'DB connection error' },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying meeting authorization/i);
    });

    it('returns fail-closed result when batch query fails for Interactions', async () => {
      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: false, ErrorMessage: 'Interactions table error' },
        { Success: true, Results: [] },
      ]);

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying interaction authorization/i);
    });

    it('returns fail-closed result when batch query fails for Offers', async () => {
      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
        { Success: false, ErrorMessage: 'Offers table error' },
      ]);

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying interaction offer authorization/i);
    });

    it('returns fail-closed result when participant query fails', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        Status: 'Live',
        HostUserID: 'host-user',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [mockMeeting] },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: false, ErrorMessage: 'DB connection error' });

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying participant authorization/i);
    });

    it('returns fail-closed result when agent session query fails', async () => {
      const mockInteraction = {
        ID: 'int-1',
        Status: 'Active',
        AgentSessionID: 'session-1',
      };

      mockRunViews.mockResolvedValueOnce([
        { Success: true, Results: [] },
        { Success: true, Results: [mockInteraction] },
        { Success: true, Results: [] },
      ]);
      mockRunView.mockResolvedValueOnce({ Success: false, ErrorMessage: 'Session table error' });

      const result = await service.AuthorizeRoomAccess('call-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying session authorization/i);
    });

    it('returns fail-closed result when RunViews throws an unexpected exception', async () => {
      mockRunViews.mockRejectedValueOnce(new Error('Fatal exception'));

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/internal authorization error/i);
    });
  });

  describe('Testing override', () => {
    it('delegates to the override function when provided', async () => {
      service.SetAuthorizerForTesting(async () => ({
        Authorized: false,
        Reason: 'Custom test rejection',
      }));

      const result = await service.AuthorizeRoomAccess('custom-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toBe('Custom test rejection');
      expect(mockRunViews).not.toHaveBeenCalled();
      expect(mockRunView).not.toHaveBeenCalled();
    });
  });
});
