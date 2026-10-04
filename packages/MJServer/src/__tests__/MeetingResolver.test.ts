import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
  MJMeetingEntity,
  MJMeetingParticipantEntity,
  MJPhoneNumberEntity,
  MJInteractionEntity,
  MJInteractionEventEntity,
} from '@memberjunction/core-entities';

const mocks = vi.hoisted(() => ({
  mintClientToken: vi.fn(async (roomName: string, identity: string, name?: string) => ({
    Token: `token-for-${roomName}-${identity}`,
    Identity: identity,
    ServerUrl: 'wss://livekit.example.com',
  })),
  startAgentRoomSession: vi.fn(async () => ({
    SessionBridgeID: 'bridge-123',
    RoomName: 'room-123',
  })),
  stopAllAgentsInRoom: vi.fn(async () => undefined),
  startRoomRecording: vi.fn(async (params: { RoomName: string }) => ({
    EgressID: 'egress-456',
    RoomName: params.RoomName,
    Status: 'EGRESS_STARTING',
  })),
  stopRecording: vi.fn(async (egressID: string) => ({
    EgressID: egressID,
    RoomName: 'room-123',
    Status: 'EGRESS_COMPLETE',
  })),
  sendNotification: vi.fn(async () => ({ success: true })),
  notificationConfig: vi.fn(async () => undefined),
  createSession: vi.fn(async () => ({ ID: 'agent-session-789' })),
}));

vi.mock('@memberjunction/livekit-room-server', () => ({
  LiveKitTokenService: class {
    MintClientToken = mocks.mintClientToken;
  },
  LiveKitAgentRoomCoordinator: {
    Instance: {
      StartAgentRoomSession: mocks.startAgentRoomSession,
      StopAllAgentsInRoom: mocks.stopAllAgentsInRoom,
    },
  },
  LiveKitEgressService: class {
    StartRoomRecording = mocks.startRoomRecording;
    StopRecording = mocks.stopRecording;
  },
  LiveKitUserIdentity: (id: string) => `user_${id.toLowerCase()}`,
}));

vi.mock('@memberjunction/notifications', () => ({
  NotificationEngine: {
    Instance: {
      Config: mocks.notificationConfig,
      SendNotification: mocks.sendNotification,
    },
  },
}));

import {
  MeetingResolver,
  type CreateMeetingInput,
  type UpdateMeetingInput,
  type RSVPMeetingInput,
} from '../resolvers/MeetingResolver.js';
import type { AppContext } from '../types.js';

class MockEntityBase {
  public ID: string = `mock-${Date.now()}-${Math.random()}`;
  public LatestResult?: { CompleteMessage?: string };
  public async Save(): Promise<boolean> {
    return true;
  }
}

class MockMeetingEntity extends MockEntityBase {
  public Title: string = '';
  public Description: string | null = null;
  public HostUserID: string = '';
  public HostUser: string = 'Host User';
  public RoomName: string = '';
  public Status: MJMeetingEntity['Status'] = 'Scheduled';
  public ScheduledStartAt: Date | null = null;
  public ScheduledEndAt: Date | null = null;
  public StartedAt: Date | null = null;
  public EndedAt: Date | null = null;
  public AllowPhoneDialIn: boolean = false;
  public DialInPhoneNumberID: string | null = null;
  public DialInCode: string | null = null;
  public RecordingPolicy: MJMeetingEntity['RecordingPolicy'] = 'Off';
  public ConversationID: string | null = null;
  public __mj_CreatedAt: Date = new Date();
  public __mj_UpdatedAt: Date = new Date();
}

class MockMeetingParticipantEntity extends MockEntityBase {
  public MeetingID: string = '';
  public UserID: string | null = null;
  public User: string | null = null;
  public AgentID: string | null = null;
  public Agent: string | null = null;
  public ExternalName: string | null = null;
  public ExternalEmail: string | null = null;
  public ExternalPhone: string | null = null;
  public Role: MJMeetingParticipantEntity['Role'] = 'Attendee';
  public InviteStatus: MJMeetingParticipantEntity['InviteStatus'] = 'Invited';
  public JoinedAt: Date | null = null;
  public LeftAt: Date | null = null;
}

class MockPhoneNumberEntity extends MockEntityBase {
  public Number: string = '+15551234567';
  public Status: MJPhoneNumberEntity['Status'] = 'Active';
  public Label: string | null = 'Main Dial-In';
  public __mj_CreatedAt: Date = new Date();
}

class MockInteractionEntity extends MockEntityBase {
  public Channel: MJInteractionEntity['Channel'] = 'Meeting';
  public Direction: MJInteractionEntity['Direction'] = 'Inbound';
  public Status: MJInteractionEntity['Status'] = 'Active';
  public RoomName: string | null = null;
  public StartedAt: Date = new Date();
  public AnsweredAt: Date | null = new Date();
  public EndedAt: Date | null = null;
  public RecordingEnabled: boolean = false;
}

class MockInteractionEventEntity extends MockEntityBase {
  public InteractionID: string = '';
  public EventType: MJInteractionEventEntity['EventType'] = 'Created';
  public ActorUserID: string | null = null;
  public OccurredAt: Date = new Date();
  public Details: string | null = null;
}

class TestableMeetingResolver extends MeetingResolver {
  public user: UserInfo | undefined = { ID: 'user-host-1', Name: 'Alice Host', Email: 'alice@example.com' } as unknown as UserInfo;

  public mockMeetings: MockMeetingEntity[] = [];
  public mockParticipants: MockMeetingParticipantEntity[] = [];
  public mockPhoneNumbers: MockPhoneNumberEntity[] = [];
  public mockInteractions: MockInteractionEntity[] = [];
  public mockEvents: MockInteractionEventEntity[] = [];

  protected override GetUserFromPayload(): UserInfo | undefined {
    return this.user;
  }

  public getMockProvider(): IMetadataProvider {
    return {
      RunView: async () => ({ Success: true, Results: [] }),
      GetEntityObject: async <T>(entityName: string) => {
        if (entityName === 'MJ: Meetings') {
          const m = new MockMeetingEntity() as unknown as T;
          this.mockMeetings.push(m as unknown as MockMeetingEntity);
          return m;
        }
        if (entityName === 'MJ: Meeting Participants') {
          const p = new MockMeetingParticipantEntity() as unknown as T;
          this.mockParticipants.push(p as unknown as MockMeetingParticipantEntity);
          return p;
        }
        if (entityName === 'MJ: Interactions') {
          const i = new MockInteractionEntity() as unknown as T;
          this.mockInteractions.push(i as unknown as MockInteractionEntity);
          return i;
        }
        if (entityName === 'MJ: Interaction Events') {
          const e = new MockInteractionEventEntity() as unknown as T;
          this.mockEvents.push(e as unknown as MockInteractionEventEntity);
          return e;
        }
        throw new Error(`Unknown entity: ${entityName}`);
      },
    } as unknown as IMetadataProvider;
  }
}

describe('MeetingResolver', () => {
  let resolver: TestableMeetingResolver;
  let mockProvider: IMetadataProvider;
  let ctx: AppContext;

  beforeEach(() => {
    resolver = new TestableMeetingResolver();
    mockProvider = resolver.getMockProvider();
    ctx = {
      providers: [{ type: 'Read-Write', provider: mockProvider }],
    } as unknown as AppContext;
    mocks.mintClientToken.mockClear();
    mocks.startAgentRoomSession.mockClear();
    mocks.stopAllAgentsInRoom.mockClear();
    mocks.startRoomRecording.mockClear();
    mocks.sendNotification.mockClear();
  });

  describe('CreateMeeting', () => {
    it('creates a scheduled meeting with generated unguessable room name and adds host participant', async () => {
      const input: CreateMeetingInput = {
        Title: 'Sprint Planning',
        Description: 'Bi-weekly sprint planning meeting',
        ScheduledStartAt: new Date(Date.now() + 3600000),
        ScheduledEndAt: new Date(Date.now() + 7200000),
        Participants: [
          { UserID: 'user-guest-2', Role: 'Attendee' },
          { AgentID: 'agent-bot-1', Role: 'Agent' },
        ],
      };

      const result = await resolver.CreateMeeting(input, ctx);
      expect(result.Success).toBe(true);
      expect(result.Meeting).toBeDefined();
      expect(result.Meeting?.Title).toBe('Sprint Planning');
      expect(result.Meeting?.RoomName).toMatch(/^mj-mtg-[a-f0-9-]+$/);
      expect(result.Meeting?.Status).toBe('Scheduled');
      expect(result.Meeting?.HostUserID).toBe('user-host-1');

      // Verify participants were created: host + 2 invitees
      expect(resolver.mockParticipants.length).toBe(3);
      const hostPart = resolver.mockParticipants.find((p) => p.UserID === 'user-host-1');
      expect(hostPart).toBeDefined();
      expect(hostPart?.Role).toBe('Host');
      expect(hostPart?.InviteStatus).toBe('Accepted');

      const agentPart = resolver.mockParticipants.find((p) => p.AgentID === 'agent-bot-1');
      expect(agentPart).toBeDefined();
      expect(agentPart?.Role).toBe('Agent');

      // Notification sent to invited user
      expect(mocks.sendNotification).toHaveBeenCalled();
    });

    it('validates required title', async () => {
      const result = await resolver.CreateMeeting({ Title: '   ' }, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('title is required');
    });

    it('validates scheduled end time is after scheduled start time', async () => {
      const start = new Date(Date.now() + 7200000);
      const end = new Date(Date.now() + 3600000);
      const result = await resolver.CreateMeeting({ Title: 'Invalid Times', ScheduledStartAt: start, ScheduledEndAt: end }, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('must be after');
    });
  });

  describe('UpdateMeeting authorization and validation', () => {
    it('refuses update from non-host/co-host users', async () => {
      // Mock existing meeting where HostUserID is different
      const m = new MockMeetingEntity();
      m.ID = 'mtg-existing-1';
      m.HostUserID = 'other-user';
      m.Title = 'Existing';
      resolver.mockMeetings.push(m);

      // Spy on loadMeetingEntity and isUserHostOrCoHost
      vi.spyOn(resolver as unknown as { loadMeetingEntity: Function }, 'loadMeetingEntity').mockResolvedValue(m);
      vi.spyOn(resolver as unknown as { isUserHostOrCoHost: Function }, 'isUserHostOrCoHost').mockResolvedValue(false);

      const updateInput: UpdateMeetingInput = {
        MeetingID: 'mtg-existing-1',
        Title: 'Hacked Title',
      };

      const result = await resolver.UpdateMeeting(updateInput, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Unauthorized');
    });

    it('allows host to update title and details', async () => {
      const m = new MockMeetingEntity();
      m.ID = 'mtg-existing-1';
      m.HostUserID = 'user-host-1';
      m.Title = 'Old Title';
      resolver.mockMeetings.push(m);

      vi.spyOn(resolver as unknown as { loadMeetingEntity: Function }, 'loadMeetingEntity').mockResolvedValue(m);
      vi.spyOn(resolver as unknown as { isUserHostOrCoHost: Function }, 'isUserHostOrCoHost').mockResolvedValue(true);
      vi.spyOn(resolver as unknown as { loadParticipants: Function }, 'loadParticipants').mockResolvedValue([]);

      const updateInput: UpdateMeetingInput = {
        MeetingID: 'mtg-existing-1',
        Title: 'Updated Title',
        Description: 'New agenda',
      };

      const result = await resolver.UpdateMeeting(updateInput, ctx);
      expect(result.Success).toBe(true);
      expect(m.Title).toBe('Updated Title');
      expect(m.Description).toBe('New agenda');
    });
  });

  describe('StartMeeting and EndMeeting lifecycle', () => {
    it('starts meeting, creates interaction, spins up agent participants, and mints token', async () => {
      const m = new MockMeetingEntity();
      m.ID = 'mtg-live-1';
      m.HostUserID = 'user-host-1';
      m.Title = 'Team Standup';
      m.RoomName = 'mj-mtg-standup-1';
      m.Status = 'Scheduled';
      m.RecordingPolicy = 'Automatic';
      resolver.mockMeetings.push(m);

      const agentPart = new MockMeetingParticipantEntity();
      agentPart.Role = 'Agent';
      agentPart.AgentID = 'agent-co-1';

      vi.spyOn(resolver as unknown as { loadMeetingEntity: Function }, 'loadMeetingEntity').mockResolvedValue(m);
      vi.spyOn(resolver as unknown as { isUserHostOrCoHost: Function }, 'isUserHostOrCoHost').mockResolvedValue(true);
      vi.spyOn(resolver as unknown as { loadParticipants: Function }, 'loadParticipants').mockResolvedValue([
        { ID: 'p-1', MeetingID: m.ID, Role: 'Agent', AgentID: 'agent-co-1', InviteStatus: 'Accepted' },
      ]);
      vi.spyOn((resolver as unknown as { sessionManager: { CreateSession: Function } }).sessionManager, 'CreateSession').mockResolvedValue({
        ID: 'agent-session-789',
      });

      const result = await resolver.StartMeeting(m.ID, ctx);
      expect(result.Success).toBe(true);
      expect(result.RoomName).toBe('mj-mtg-standup-1');
      expect(result.ClientToken).toBeDefined();
      expect(m.Status).toBe('Live');
      expect(m.StartedAt).toBeDefined();

      // Check agent session coordinator was called
      expect(mocks.startAgentRoomSession).toHaveBeenCalledWith(
        expect.objectContaining({
          RoomName: 'mj-mtg-standup-1',
          AgentID: 'agent-co-1',
        }),
      );

      // Check automatic recording initiated
      expect(mocks.startRoomRecording).toHaveBeenCalledWith({ RoomName: 'mj-mtg-standup-1' });

      // Check client token minted
      expect(mocks.mintClientToken).toHaveBeenCalled();
    });

    it('ends meeting, stops agents in room, and marks status Ended', async () => {
      const m = new MockMeetingEntity();
      m.ID = 'mtg-live-1';
      m.HostUserID = 'user-host-1';
      m.RoomName = 'mj-mtg-standup-1';
      m.Status = 'Live';
      resolver.mockMeetings.push(m);

      vi.spyOn(resolver as unknown as { loadMeetingEntity: Function }, 'loadMeetingEntity').mockResolvedValue(m);
      vi.spyOn(resolver as unknown as { isUserHostOrCoHost: Function }, 'isUserHostOrCoHost').mockResolvedValue(true);
      vi.spyOn(resolver as unknown as { loadParticipants: Function }, 'loadParticipants').mockResolvedValue([]);

      const result = await resolver.EndMeeting(m.ID, ctx);
      expect(result.Success).toBe(true);
      expect(m.Status).toBe('Ended');
      expect(m.EndedAt).toBeDefined();
      expect(mocks.stopAllAgentsInRoom).toHaveBeenCalledWith('mj-mtg-standup-1', 'Explicit', resolver.user, mockProvider);
    });
  });

  describe('RSVPMeeting', () => {
    it('validates RSVP response values', async () => {
      const result = await resolver.RSVPMeeting({ MeetingID: 'mtg-1', InviteStatus: 'Maybe' }, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Invalid RSVP status');
    });
  });
});
