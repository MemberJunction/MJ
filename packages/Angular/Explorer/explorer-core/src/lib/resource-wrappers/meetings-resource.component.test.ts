import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MeetingInfo } from '@memberjunction/graphql-dataprovider';
import { ResourceData } from '@memberjunction/core-entities';

const mockGetMeeting = vi.fn();

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  OnInit: class {},
  inject: vi.fn(),
  ChangeDetectorRef: class {},
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (target: Function) => target,
  };
});

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public Data: ResourceData | null = null;
    public ProviderToUse = {};
    protected NotifyLoadComplete(): void {}
    public ngOnInit(): void {}
  },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => {
  return {
    GraphQLDataProvider: {
      Instance: {},
    },
    GraphQLMeetingClient: class {
      GetMeeting = mockGetMeeting;
    },
  };
});

import { MeetingsResource } from './meetings-resource.component';

describe('MeetingsResource', () => {
  let resource: MeetingsResource;

  const sampleMeeting: MeetingInfo = {
    ID: 'mtg-100',
    Title: 'Architecture Review',
    Description: 'Review telephony and rooms schema',
    RoomName: 'mj-mtg-sample-123',
    HostUserID: 'user-host',
    HostUserName: 'Amith',
    ScheduledStartAt: '2026-10-04T10:00:00.000Z',
    ScheduledEndAt: '2026-10-04T11:00:00.000Z',
    Status: 'Scheduled',
    AllowPhoneDialIn: true,
    DialInCode: '123456',
    DialInPhoneNumber: '+15551234567',
    RecordingPolicy: 'Allowed',
    Participants: [],
    CreatedAt: '2026-10-04T00:00:00.000Z',
    UpdatedAt: '2026-10-04T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resource = new MeetingsResource();
  });

  it('starts in list phase and notifies load completion on init', async () => {
    const notifySpy = vi.spyOn(resource as unknown as { NotifyLoadComplete: () => void }, 'NotifyLoadComplete');
    expect(resource.Phase).toBe('list');
    expect(resource.ActiveMeeting).toBeNull();
    expect(resource.LiveRoomName).toBe('');

    resource.ngOnInit();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(notifySpy).toHaveBeenCalled();
    expect(resource.Phase).toBe('list');
  });

  it('resolves deep-link meeting and transitions to lobby phase', async () => {
    const notifySpy = vi.spyOn(resource as unknown as { NotifyLoadComplete: () => void }, 'NotifyLoadComplete');
    mockGetMeeting.mockResolvedValueOnce(sampleMeeting);
    resource.Data = new ResourceData({
      Configuration: { MeetingID: 'mtg-100' },
    });

    resource.ngOnInit();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockGetMeeting).toHaveBeenCalledWith('mtg-100');
    expect(resource.ActiveMeeting).toEqual(sampleMeeting);
    expect(resource.Phase).toBe('lobby');
    expect(notifySpy).toHaveBeenCalled();
  });

  it('handles schedule requested from list', () => {
    resource.OnScheduleRequested();
    expect(resource.Phase).toBe('schedule');
    expect(resource.EditingMeeting).toBeNull();
  });

  it('handles edit requested from list', () => {
    resource.OnEditMeetingRequested(sampleMeeting);
    expect(resource.Phase).toBe('schedule');
    expect(resource.EditingMeeting).toEqual(sampleMeeting);
  });

  it('handles meeting saved from schedule form', () => {
    resource.Phase = 'schedule';
    resource.EditingMeeting = sampleMeeting;

    resource.OnMeetingSaved(sampleMeeting);

    expect(resource.Phase).toBe('lobby');
    expect(resource.ActiveMeeting).toEqual(sampleMeeting);
    expect(resource.EditingMeeting).toBeNull();
  });

  it('handles schedule cancelled', () => {
    resource.Phase = 'schedule';
    resource.EditingMeeting = sampleMeeting;

    resource.OnScheduleCancelled();

    expect(resource.Phase).toBe('list');
    expect(resource.EditingMeeting).toBeNull();
  });

  it('handles join requested from list into lobby', () => {
    resource.OnJoinMeetingFromList(sampleMeeting);

    expect(resource.Phase).toBe('lobby');
    expect(resource.ActiveMeeting).toEqual(sampleMeeting);
  });

  it('transitions from lobby into live call when join is confirmed', () => {
    resource.ActiveMeeting = sampleMeeting;
    resource.Phase = 'lobby';

    resource.OnJoinConfirmed({ startWithAudio: false, startWithVideo: true });

    expect(resource.Phase).toBe('live');
    expect(resource.StartWithMic).toBe(false);
    expect(resource.StartWithCam).toBe(true);
    expect(resource.LiveRoomName).toBe('mj-mtg-sample-123');
  });

  it('returns to list when lobby is cancelled', () => {
    resource.ActiveMeeting = sampleMeeting;
    resource.Phase = 'lobby';

    resource.OnLobbyCancelled();

    expect(resource.Phase).toBe('list');
    expect(resource.ActiveMeeting).toBeNull();
  });

  it('returns to list and resets room name when disconnected from live call', () => {
    resource.ActiveMeeting = sampleMeeting;
    resource.LiveRoomName = 'mj-mtg-sample-123';
    resource.Phase = 'live';

    resource.OnLiveRoomLeft();

    expect(resource.Phase).toBe('list');
    expect(resource.ActiveMeeting).toBeNull();
    expect(resource.LiveRoomName).toBe('');
  });

  it('computes display name and icon based on active meeting state', async () => {
    const dummyData = new ResourceData({});

    expect(await resource.GetResourceDisplayName(dummyData)).toBe('Meetings');
    expect(await resource.GetResourceIconClass(dummyData)).toBe('fa-solid fa-calendar-users');

    resource.ActiveMeeting = sampleMeeting;
    expect(await resource.GetResourceDisplayName(dummyData)).toBe('Architecture Review');
  });
});
