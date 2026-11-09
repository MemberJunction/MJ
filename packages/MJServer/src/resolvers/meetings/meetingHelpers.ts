import {
  IMetadataProvider,
  LogError,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type {
  MJMeetingEntity,
  MJMeetingParticipantEntity,
  MJPhoneNumberEntity,
  MJInteractionEntity,
  MJInteractionEventEntity,
} from '@memberjunction/core-entities';
import { MeetingDialInService } from '@memberjunction/livekit-room-server';
import { NotificationEngine } from '@memberjunction/notifications';
import { MeetingParticipantType, MeetingType } from './meetingTypes.js';

export async function LoadMeetingEntity(
  id: string,
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<MJMeetingEntity | null> {
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const escapedID = EscapeSQLString(id.trim());
  const res = await rv.RunView<MJMeetingEntity>(
    {
      EntityName: 'MJ: Meetings',
      ExtraFilter: `ID = '${escapedID}'`,
      ResultType: 'entity_object',
    },
    user,
  );
  if (res.Success && res.Results && res.Results.length > 0) {
    return res.Results[0];
  }
  return null;
}

export async function LoadParticipants(
  meetingID: string,
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<MeetingParticipantType[]> {
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const escapedID = EscapeSQLString(meetingID.trim());
  const res = await rv.RunView<MJMeetingParticipantEntity>(
    {
      EntityName: 'MJ: Meeting Participants',
      ExtraFilter: `MeetingID = '${escapedID}'`,
      ResultType: 'entity_object',
    },
    user,
  );
  if (!res.Success || !res.Results) {
    return [];
  }
  return res.Results.map((p) => MapParticipantToType(p));
}

export async function IsUserHostOrCoHost(
  meeting: MJMeetingEntity,
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<boolean> {
  if (UUIDsEqual(meeting.HostUserID, user.ID)) {
    return true;
  }
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const escapedID = EscapeSQLString(meeting.ID);
  const escapedUserID = EscapeSQLString(user.ID);
  const res = await rv.RunView<MJMeetingParticipantEntity>(
    {
      EntityName: 'MJ: Meeting Participants',
      ExtraFilter: `MeetingID = '${escapedID}' AND UserID = '${escapedUserID}' AND Role IN ('Host', 'CoHost')`,
      ResultType: 'entity_object',
    },
    user,
  );
  return Boolean(res.Success && res.Results && res.Results.length > 0);
}

export async function ResolveDefaultPhoneNumber(
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<MJPhoneNumberEntity | null> {
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const res = await rv.RunView<MJPhoneNumberEntity>(
    {
      EntityName: 'MJ: Phone Numbers',
      ExtraFilter: "Status = 'Active'",
      OrderBy: '__mj_CreatedAt ASC',
      ResultType: 'entity_object',
    },
    user,
  );
  if (res.Success && res.Results && res.Results.length > 0) {
    return res.Results[0];
  }
  return null;
}

export async function GenerateUniqueDialInCode(
  phoneNumberID: string,
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<string | undefined> {
  return MeetingDialInService.Instance.GenerateUniqueDialInCode(phoneNumberID, user, provider);
}

export async function EnsureMeetingInteraction(
  meeting: MJMeetingEntity,
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<MJInteractionEntity | null> {
  try {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escapedRoom = EscapeSQLString(meeting.RoomName);

    const existing = await rv.RunView<MJInteractionEntity>(
      {
        EntityName: 'MJ: Interactions',
        ExtraFilter: `RoomName = '${escapedRoom}'`,
        ResultType: 'entity_object',
      },
      user,
    );

    if (existing.Success && existing.Results && existing.Results.length > 0) {
      return existing.Results[0];
    }

    const entity = await provider.GetEntityObject<MJInteractionEntity>('MJ: Interactions', user);
    entity.Channel = 'Meeting';
    entity.Direction = 'Inbound';
    entity.Status = 'Active';
    entity.RoomName = meeting.RoomName;
    entity.StartedAt = new Date();
    entity.AnsweredAt = new Date();
    entity.RecordingEnabled = meeting.RecordingPolicy === 'Automatic' || meeting.RecordingPolicy === 'Allowed';

    if (await entity.Save()) {
      await RecordInteractionEvent(entity.ID, 'Created', user, provider, { MeetingID: meeting.ID, RoomName: meeting.RoomName });
      await RecordInteractionEvent(entity.ID, 'Answered', user, provider);
      return entity;
    }
    return null;
  } catch (err) {
    LogError(`[MeetingResolver] ensureMeetingInteraction failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function RecordInteractionEvent(
  interactionID: string,
  eventType: MJInteractionEventEntity['EventType'],
  user: UserInfo,
  provider: IMetadataProvider,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const eventEntity = await provider.GetEntityObject<MJInteractionEventEntity>('MJ: Interaction Events', user);
    eventEntity.InteractionID = interactionID;
    eventEntity.EventType = eventType;
    eventEntity.ActorUserID = user.ID;
    eventEntity.OccurredAt = new Date();
    if (details) {
      eventEntity.Details = JSON.stringify(details);
    }
    await eventEntity.Save();
  } catch (err) {
    LogError(`[MeetingResolver] recordInteractionEvent (${eventType}) failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function CloseMeetingInteraction(
  roomName: string,
  user: UserInfo,
  provider: IMetadataProvider,
): Promise<void> {
  try {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escapedRoom = EscapeSQLString(roomName);

    const res = await rv.RunView<MJInteractionEntity>(
      {
        EntityName: 'MJ: Interactions',
        ExtraFilter: `RoomName = '${escapedRoom}' AND Status = 'Active'`,
        ResultType: 'entity_object',
      },
      user,
    );

    if (res.Success && res.Results && res.Results.length > 0) {
      const interaction = res.Results[0];
      interaction.Status = 'Ended';
      interaction.EndedAt = new Date();
      await interaction.Save();
      await RecordInteractionEvent(interaction.ID, 'Ended', user, provider);
    }
  } catch (err) {
    LogError(`[MeetingResolver] closeMeetingInteraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function SendMeetingInviteNotification(
  meeting: MJMeetingEntity,
  targetUserID: string,
  contextUser: UserInfo,
  provider: IMetadataProvider,
): Promise<void> {
  try {
    await NotificationEngine.Instance.Config(false, contextUser, provider);
    const inviter = contextUser.Name?.trim() || contextUser.Email || 'Someone';
    await NotificationEngine.Instance.SendNotification(
      {
        userId: targetUserID,
        typeNameOrId: 'Meeting Invitation',
        title: `Invitation: ${meeting.Title}`,
        message: `${inviter} invited you to the meeting "${meeting.Title}".`,
        resourceConfiguration: { type: 'meeting', meetingID: meeting.ID, roomName: meeting.RoomName },
      },
      contextUser,
    );
  } catch (err) {
    LogError(`[MeetingResolver] sendMeetingInviteNotification failed for user ${targetUserID}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function NormalizeParticipantRole(
  roleInput?: string,
  defaultRole: MJMeetingParticipantEntity['Role'] = 'Attendee',
): MJMeetingParticipantEntity['Role'] {
  switch (roleInput?.trim().toLowerCase()) {
    case 'host':
      return 'Host';
    case 'cohost':
      return 'CoHost';
    case 'agent':
      return 'Agent';
    case 'attendee':
    default:
      return defaultRole;
  }
}

export function NormalizeRecordingPolicy(
  policyInput?: string,
): MJMeetingEntity['RecordingPolicy'] {
  switch (policyInput?.trim().toLowerCase()) {
    case 'allowed':
      return 'Allowed';
    case 'automatic':
      return 'Automatic';
    case 'off':
    default:
      return 'Off';
  }
}

export function MapMeetingToType(m: MJMeetingEntity, participants?: MeetingParticipantType[]): MeetingType {
  return {
    ID: m.ID,
    Title: m.Title,
    Description: m.Description ?? undefined,
    HostUserID: m.HostUserID,
    HostUserName: m.HostUser ?? undefined,
    RoomName: m.RoomName,
    Status: m.Status,
    ScheduledStartAt: m.ScheduledStartAt ?? undefined,
    ScheduledEndAt: m.ScheduledEndAt ?? undefined,
    StartedAt: m.StartedAt ?? undefined,
    EndedAt: m.EndedAt ?? undefined,
    AllowPhoneDialIn: m.AllowPhoneDialIn,
    DialInPhoneNumberID: m.DialInPhoneNumberID ?? undefined,
    DialInPhoneNumber: m.DialInPhoneNumber ?? undefined,
    DialInCode: m.DialInCode ?? undefined,
    RecordingPolicy: m.RecordingPolicy,
    ConversationID: m.ConversationID ?? undefined,
    Participants: participants,
    CreatedAt: m.__mj_CreatedAt,
    UpdatedAt: m.__mj_UpdatedAt,
  };
}

export function MapParticipantToType(
  p: MJMeetingParticipantEntity,
  userNameFallback?: string | null,
  userEmailFallback?: string | null,
): MeetingParticipantType {
  return {
    ID: p.ID,
    MeetingID: p.MeetingID,
    UserID: p.UserID ?? undefined,
    UserName: p.User ?? userNameFallback ?? undefined,
    UserEmail: userEmailFallback ?? undefined,
    AgentID: p.AgentID ?? undefined,
    AgentName: p.Agent ?? undefined,
    ExternalName: p.ExternalName ?? undefined,
    ExternalEmail: p.ExternalEmail ?? undefined,
    ExternalPhone: p.ExternalPhone ?? undefined,
    Role: p.Role,
    InviteStatus: p.InviteStatus,
    JoinedAt: p.JoinedAt ?? undefined,
    LeftAt: p.LeftAt ?? undefined,
  };
}
