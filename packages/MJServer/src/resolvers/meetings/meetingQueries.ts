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
} from '@memberjunction/core-entities';
import {
  MeetingType,
  MeetingParticipantType,
  DialInPhoneNumberType,
} from './meetingTypes.js';
import {
  LoadParticipants,
  MapMeetingToType,
} from './meetingHelpers.js';

export async function ExecuteMyMeetings(
  provider: IMetadataProvider,
  user: UserInfo,
  status?: string,
): Promise<MeetingType[]> {
  try {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escapedUserID = EscapeSQLString(user.ID);

    // 1. Find participant rows for this user
    const participantRows = await rv.RunView<MJMeetingParticipantEntity>(
      {
        EntityName: 'MJ: Meeting Participants',
        ExtraFilter: `UserID = '${escapedUserID}'`,
        ResultType: 'entity_object',
      },
      user,
    );

    const participantMeetingIDs = new Set<string>();
    if (participantRows.Success && participantRows.Results) {
      for (const p of participantRows.Results) {
        if (p.MeetingID) {
          participantMeetingIDs.add(p.MeetingID);
        }
      }
    }

    // 2. Query meetings where user is host OR in participantMeetingIDs
    let filter = `HostUserID = '${escapedUserID}'`;
    if (participantMeetingIDs.size > 0) {
      const idList = Array.from(participantMeetingIDs)
        .map((id) => `'${EscapeSQLString(id)}'`)
        .join(', ');
      filter = `(HostUserID = '${escapedUserID}' OR ID IN (${idList}))`;
    }

    if (status && status.trim()) {
      const escapedStatus = EscapeSQLString(status.trim());
      filter = `${filter} AND Status = '${escapedStatus}'`;
    }

    const meetingsResult = await rv.RunView<MJMeetingEntity>(
      {
        EntityName: 'MJ: Meetings',
        ExtraFilter: filter,
        OrderBy: 'ScheduledStartAt DESC, __mj_CreatedAt DESC',
        ResultType: 'entity_object',
      },
      user,
    );

    if (!meetingsResult.Success || !meetingsResult.Results) {
      return [];
    }

    const output: MeetingType[] = [];
    for (const m of meetingsResult.Results) {
      const participants = await LoadParticipants(m.ID, user, provider);
      output.push(MapMeetingToType(m, participants));
    }
    return output;
  } catch (error) {
    LogError(`[MeetingResolver] MyMeetings failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function ExecuteMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  id: string,
): Promise<MeetingType | null> {
  try {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escapedID = EscapeSQLString(id.trim());

    const result = await rv.RunView<MJMeetingEntity>(
      {
        EntityName: 'MJ: Meetings',
        ExtraFilter: `ID = '${escapedID}'`,
        ResultType: 'entity_object',
      },
      user,
    );

    if (!result.Success || !result.Results || result.Results.length === 0) {
      return null;
    }

    const meeting = result.Results[0];
    const participants = await LoadParticipants(meeting.ID, user, provider);

    // Verify authorization: caller must be host or participant
    const isHost = UUIDsEqual(meeting.HostUserID, user.ID);
    const isParticipant = participants.some((p) => p.UserID && UUIDsEqual(p.UserID, user.ID));
    if (!isHost && !isParticipant) {
      return null;
    }

    return MapMeetingToType(meeting, participants);
  } catch (error) {
    LogError(`[MeetingResolver] Meeting query failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function ExecuteMeetingParticipants(
  provider: IMetadataProvider,
  user: UserInfo,
  meetingID: string,
): Promise<MeetingParticipantType[]> {
  try {
    return await LoadParticipants(meetingID.trim(), user, provider);
  } catch (error) {
    LogError(`[MeetingResolver] MeetingParticipants failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function ExecuteAvailableDialInPhoneNumbers(
  provider: IMetadataProvider,
  user: UserInfo,
): Promise<DialInPhoneNumberType[]> {
  try {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();

    const result = await rv.RunView<MJPhoneNumberEntity>(
      {
        EntityName: 'MJ: Phone Numbers',
        ExtraFilter: "Status = 'Active'",
        ResultType: 'entity_object',
      },
      user,
    );

    if (!result.Success || !result.Results) {
      return [];
    }

    return result.Results.map((p) => ({
      ID: p.ID,
      Number: p.Number,
      Label: p.Label ?? undefined,
    }));
  } catch (error) {
    LogError(`[MeetingResolver] AvailableDialInPhoneNumbers failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
