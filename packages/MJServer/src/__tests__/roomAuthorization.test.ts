import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { RoomAuthorizationService } from '../resolvers/roomAuthorization.js';
import type {
  MJMeetingEntity,
  MJMeetingParticipantEntity,
  MJInteractionOfferEntity,
} from '@memberjunction/core-entities';

const mockRunView = vi.fn();

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockRunView {
    RunView = mockRunView;
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

  beforeEach(() => {
    mockRunView.mockReset();
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
    it('authorizes access when room is not tied to a meeting or interaction offer', async () => {
      // First call: Meetings -> none found
      // Second call: Interaction Offers -> none found
      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [] })
        .mockResolvedValueOnce({ Success: true, Results: [] });

      const result = await service.AuthorizeRoomAccess('adhoc-room-1', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunView).toHaveBeenCalledTimes(2);
      expect(mockRunView.mock.calls[0][0].EntityName).toBe('MJ: Meetings');
      expect(mockRunView.mock.calls[1][0].EntityName).toBe('MJ: Interaction Offers');
    });
  });

  describe('Rooms tied to Meetings', () => {
    it('refuses access when meeting is cancelled', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'mtg-room',
        HostUserID: user.ID,
        Status: 'Cancelled',
      } as unknown as MJMeetingEntity;

      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockMeeting] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/cancelled/i);
    });

    it('grants access when user is the meeting host', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'mtg-room',
        HostUserID: user.ID,
        Status: 'Scheduled',
      } as unknown as MJMeetingEntity;

      mockRunView.mockResolvedValueOnce({ Success: true, Results: [mockMeeting] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(true);
      expect(mockRunView).toHaveBeenCalledTimes(1);
    });

    it('grants access when user is an accepted participant', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'mtg-room',
        HostUserID: 'host-user-id',
        Status: 'Live',
      } as unknown as MJMeetingEntity;

      const mockParticipant = {
        MeetingID: 'meeting-1',
        UserID: user.ID,
        InviteStatus: 'Accepted',
      } as unknown as MJMeetingParticipantEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [mockMeeting] })
        .mockResolvedValueOnce({ Success: true, Results: [mockParticipant] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(true);
    });

    it('grants access when user is an invited (pending) participant', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'mtg-room',
        HostUserID: 'host-user-id',
        Status: 'Scheduled',
      } as unknown as MJMeetingEntity;

      const mockParticipant = {
        MeetingID: 'meeting-1',
        UserID: user.ID,
        InviteStatus: 'Invited',
      } as unknown as MJMeetingParticipantEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [mockMeeting] })
        .mockResolvedValueOnce({ Success: true, Results: [mockParticipant] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(true);
    });

    it('refuses access when user declined the invitation', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'mtg-room',
        HostUserID: 'host-user-id',
        Status: 'Scheduled',
      } as unknown as MJMeetingEntity;

      const mockParticipant = {
        MeetingID: 'meeting-1',
        UserID: user.ID,
        InviteStatus: 'Declined',
      } as unknown as MJMeetingParticipantEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [mockMeeting] })
        .mockResolvedValueOnce({ Success: true, Results: [mockParticipant] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/declined/i);
    });

    it('refuses access when user is not a host or participant', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'mtg-room',
        HostUserID: 'host-user-id',
        Status: 'Live',
      } as unknown as MJMeetingEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [mockMeeting] })
        .mockResolvedValueOnce({ Success: true, Results: [] });

      const result = await service.AuthorizeRoomAccess('mtg-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not a host or participant/i);
    });
  });

  describe('Rooms tied to Interaction Offers', () => {
    it('grants access when user is the target user and status is Accepted', async () => {
      const mockOffer = {
        RoomName: 'handoff-room',
        TargetUserID: user.ID,
        Status: 'Accepted',
      } as unknown as MJInteractionOfferEntity;

      // No meeting, but offer exists
      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [] })
        .mockResolvedValueOnce({ Success: true, Results: [mockOffer] });

      const result = await service.AuthorizeRoomAccess('handoff-room', user, provider);
      expect(result.Authorized).toBe(true);
    });

    it('refuses access when offer status is Pending', async () => {
      const mockOffer = {
        RoomName: 'handoff-room',
        TargetUserID: user.ID,
        Status: 'Pending',
      } as unknown as MJInteractionOfferEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [] })
        .mockResolvedValueOnce({ Success: true, Results: [mockOffer] });

      const result = await service.AuthorizeRoomAccess('handoff-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not accepted a handoff offer/i);
    });

    it('refuses access when offer target is a different user', async () => {
      const mockOffer = {
        RoomName: 'handoff-room',
        TargetUserID: 'other-user',
        Status: 'Accepted',
      } as unknown as MJInteractionOfferEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [] })
        .mockResolvedValueOnce({ Success: true, Results: [mockOffer] });

      const result = await service.AuthorizeRoomAccess('handoff-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/not accepted a handoff offer/i);
    });
  });

  describe('Error handling', () => {
    it('returns fail-closed result when meeting query fails', async () => {
      mockRunView.mockResolvedValueOnce({ Success: false, ErrorMessage: 'DB connection error' });

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying meeting authorization/i);
    });

    it('returns fail-closed result when participant query fails', async () => {
      const mockMeeting = {
        ID: 'meeting-1',
        RoomName: 'err-room',
        HostUserID: 'host-user',
        Status: 'Live',
      } as unknown as MJMeetingEntity;

      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [mockMeeting] })
        .mockResolvedValueOnce({ Success: false, ErrorMessage: 'DB connection error' });

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying participant authorization/i);
    });

    it('returns fail-closed result when offer query fails', async () => {
      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [] })
        .mockResolvedValueOnce({ Success: false, ErrorMessage: 'DB connection error' });

      const result = await service.AuthorizeRoomAccess('err-room', user, provider);
      expect(result.Authorized).toBe(false);
      expect(result.Reason).toMatch(/verifying interaction offer authorization/i);
    });

    it('returns fail-closed result when RunView throws an unexpected exception', async () => {
      mockRunView.mockRejectedValueOnce(new Error('Fatal exception'));

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
      expect(mockRunView).not.toHaveBeenCalled();
    });
  });
});
