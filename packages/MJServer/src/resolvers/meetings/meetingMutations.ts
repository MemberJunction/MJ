import { randomUUID } from 'node:crypto';
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
} from '@memberjunction/core-entities';
import {
  LiveKitTokenService,
  LiveKitAgentRoomCoordinator,
  LiveKitEgressService,
  LiveKitUserIdentity,
} from '@memberjunction/livekit-room-server';
import { SessionManager } from '../../agentSessions/SessionManager.js';
import { CorrelateRecordingStart } from '../meetingRecordingRegistration.js';
import {
  MeetingResult,
  StartMeetingResult,
  CreateMeetingInput,
  UpdateMeetingInput,
  RSVPMeetingInput,
  MeetingParticipantType,
} from './meetingTypes.js';
import * as defaultHelpers from './meetingHelpers.js';

export type MeetingHelpers = typeof defaultHelpers;

function resolveHelpers(overrides?: Partial<MeetingHelpers>): MeetingHelpers {
  return { ...defaultHelpers, ...overrides };
}

export async function ExecuteCreateMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  input: CreateMeetingInput,
  helpers?: Partial<MeetingHelpers>,
): Promise<MeetingResult> {
  const h = resolveHelpers(helpers);
  try {
    const trimmedTitle = input.Title?.trim();
    if (!trimmedTitle) {
      return { Success: false, ErrorMessage: 'Meeting title is required.' };
    }

    if (input.ScheduledStartAt && input.ScheduledEndAt && input.ScheduledEndAt <= input.ScheduledStartAt) {
      return { Success: false, ErrorMessage: 'Scheduled end time must be after scheduled start time.' };
    }

    const allowDialIn = input.AllowPhoneDialIn ?? false;
    let dialInPhoneNumberID = input.DialInPhoneNumberID?.trim();
    let dialInCode: string | undefined;

    if (allowDialIn) {
      if (!dialInPhoneNumberID) {
        // Select default active phone number
        const defaultNumber = await h.ResolveDefaultPhoneNumber(user, provider);
        if (!defaultNumber) {
          return {
            Success: false,
            ErrorMessage: 'Cannot allow phone dial-in: no active phone numbers are configured in the system.',
          };
        }
        dialInPhoneNumberID = defaultNumber.ID;
      }

      // Generate a random unique dial-in code (6 digits)
      dialInCode = await h.GenerateUniqueDialInCode(dialInPhoneNumberID, user, provider);
      if (!dialInCode) {
        return { Success: false, ErrorMessage: 'Failed to generate a unique dial-in code for this phone number.' };
      }
    }

    // Room name is always unguessable and generated: mj-mtg-<uuid>
    const roomName = `mj-mtg-${randomUUID()}`;

    const meeting = await provider.GetEntityObject<MJMeetingEntity>('MJ: Meetings', user);
    meeting.Title = trimmedTitle;
    meeting.Description = input.Description?.trim() || null;
    meeting.HostUserID = user.ID;
    meeting.RoomName = roomName;
    meeting.Status = 'Scheduled';
    meeting.ScheduledStartAt = input.ScheduledStartAt ?? null;
    meeting.ScheduledEndAt = input.ScheduledEndAt ?? null;
    meeting.AllowPhoneDialIn = allowDialIn;
    meeting.DialInPhoneNumberID = allowDialIn ? dialInPhoneNumberID! : null;
    meeting.DialInCode = allowDialIn ? dialInCode! : null;
    meeting.RecordingPolicy = h.NormalizeRecordingPolicy(input.RecordingPolicy);

    if (!(await meeting.Save())) {
      const err = meeting.LatestResult?.CompleteMessage ?? 'Failed to save meeting.';
      LogError(`[MeetingResolver] CreateMeeting save failed: ${err}`);
      return { Success: false, ErrorMessage: err };
    }

    // Add Host as accepted participant
    const hostParticipant = await provider.GetEntityObject<MJMeetingParticipantEntity>('MJ: Meeting Participants', user);
    hostParticipant.MeetingID = meeting.ID;
    hostParticipant.UserID = user.ID;
    hostParticipant.Role = 'Host';
    hostParticipant.InviteStatus = 'Accepted';
    await hostParticipant.Save();

    // Add other participants
    const participants: MeetingParticipantType[] = [h.MapParticipantToType(hostParticipant, user.Name, user.Email)];

    if (input.Participants && input.Participants.length > 0) {
      for (const pInput of input.Participants) {
        // Skip if duplicate of host
        if (pInput.UserID && UUIDsEqual(pInput.UserID, user.ID)) {
          continue;
        }

        const participant = await provider.GetEntityObject<MJMeetingParticipantEntity>('MJ: Meeting Participants', user);
        participant.MeetingID = meeting.ID;

        if (pInput.AgentID && pInput.AgentID.trim()) {
          participant.AgentID = pInput.AgentID.trim();
          participant.Role = 'Agent';
          participant.InviteStatus = 'Accepted';
        } else if (pInput.UserID && pInput.UserID.trim()) {
          participant.UserID = pInput.UserID.trim();
          participant.Role = h.NormalizeParticipantRole(pInput.Role, 'Attendee');
          participant.InviteStatus = 'Invited';
        } else {
          // External guest
          participant.ExternalName = pInput.ExternalName?.trim() || null;
          participant.ExternalEmail = pInput.ExternalEmail?.trim() || null;
          participant.ExternalPhone = pInput.ExternalPhone?.trim() || null;
          participant.Role = h.NormalizeParticipantRole(pInput.Role, 'Attendee');
          participant.InviteStatus = 'Invited';
        }

        if (await participant.Save()) {
          participants.push(h.MapParticipantToType(participant));

          // Send notification for internal users
          if (participant.UserID) {
            void h.SendMeetingInviteNotification(meeting, participant.UserID, user, provider);
          }
        }
      }
    }

    return {
      Success: true,
      Meeting: h.MapMeetingToType(meeting, participants),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`[MeetingResolver] CreateMeeting exception: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}

export async function ExecuteUpdateMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  input: UpdateMeetingInput,
  helpers?: Partial<MeetingHelpers>,
): Promise<MeetingResult> {
  const h = resolveHelpers(helpers);
  try {
    const meeting = await h.LoadMeetingEntity(input.MeetingID, user, provider);
    if (!meeting) {
      return { Success: false, ErrorMessage: 'Meeting not found.' };
    }

    // Check authorization (host or co-host)
    const authorized = await h.IsUserHostOrCoHost(meeting, user, provider);
    if (!authorized) {
      return { Success: false, ErrorMessage: 'Unauthorized: only the host or co-host may modify this meeting.' };
    }

    if (meeting.Status === 'Ended' || meeting.Status === 'Cancelled') {
      return { Success: false, ErrorMessage: `Cannot modify a meeting with status '${meeting.Status}'.` };
    }

    if (input.Title !== undefined) {
      const trimmedTitle = input.Title.trim();
      if (!trimmedTitle) {
        return { Success: false, ErrorMessage: 'Meeting title cannot be empty.' };
      }
      meeting.Title = trimmedTitle;
    }

    if (input.Description !== undefined) {
      meeting.Description = input.Description?.trim() || null;
    }

    if (input.ScheduledStartAt !== undefined) {
      meeting.ScheduledStartAt = input.ScheduledStartAt;
    }

    if (input.ScheduledEndAt !== undefined) {
      meeting.ScheduledEndAt = input.ScheduledEndAt;
    }

    if (meeting.ScheduledStartAt && meeting.ScheduledEndAt && meeting.ScheduledEndAt <= meeting.ScheduledStartAt) {
      return { Success: false, ErrorMessage: 'Scheduled end time must be after scheduled start time.' };
    }

    if (input.RecordingPolicy !== undefined) {
      meeting.RecordingPolicy = h.NormalizeRecordingPolicy(input.RecordingPolicy);
    }

    if (input.AllowPhoneDialIn !== undefined) {
      meeting.AllowPhoneDialIn = input.AllowPhoneDialIn;
      if (meeting.AllowPhoneDialIn && !meeting.DialInCode) {
        let phoneID = input.DialInPhoneNumberID?.trim() || meeting.DialInPhoneNumberID;
        if (!phoneID) {
          const defPhone = await h.ResolveDefaultPhoneNumber(user, provider);
          phoneID = defPhone?.ID;
        }
        if (phoneID) {
          meeting.DialInPhoneNumberID = phoneID;
          meeting.DialInCode = await h.GenerateUniqueDialInCode(phoneID, user, provider);
        }
      }
    }

    if (input.DialInPhoneNumberID !== undefined && input.DialInPhoneNumberID.trim()) {
      meeting.DialInPhoneNumberID = input.DialInPhoneNumberID.trim();
    }

    if (!(await meeting.Save())) {
      const err = meeting.LatestResult?.CompleteMessage ?? 'Failed to update meeting.';
      return { Success: false, ErrorMessage: err };
    }

    // If participants specified in update, sync participants (upsert by UserID/AgentID/ExternalEmail)
    if (input.Participants !== undefined) {
      const existing = await h.LoadParticipants(meeting.ID, user, provider);

      for (const pInput of input.Participants) {
        const isSelf = pInput.UserID && UUIDsEqual(pInput.UserID, user.ID);
        const match = existing.find(
          (e) =>
            (pInput.UserID && e.UserID && UUIDsEqual(e.UserID, pInput.UserID)) ||
            (pInput.AgentID && e.AgentID && UUIDsEqual(e.AgentID, pInput.AgentID)) ||
            (pInput.ExternalEmail && e.ExternalEmail && e.ExternalEmail.toLowerCase() === pInput.ExternalEmail.toLowerCase()),
        );

        if (match) {
          if (!isSelf && pInput.Role) {
            const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
            const escapedPID = EscapeSQLString(match.ID);
            const partRes = await rv.RunView<MJMeetingParticipantEntity>(
              {
                EntityName: 'MJ: Meeting Participants',
                ExtraFilter: `ID = '${escapedPID}'`,
                ResultType: 'entity_object',
              },
              user,
            );
            if (partRes.Success && partRes.Results && partRes.Results.length > 0) {
              const part = partRes.Results[0];
              part.Role = h.NormalizeParticipantRole(pInput.Role, part.Role);
              await part.Save();
            }
          }
        } else {
          // New participant
          const newPart = await provider.GetEntityObject<MJMeetingParticipantEntity>('MJ: Meeting Participants', user);
          newPart.MeetingID = meeting.ID;

          if (pInput.AgentID && pInput.AgentID.trim()) {
            newPart.AgentID = pInput.AgentID.trim();
            newPart.Role = 'Agent';
            newPart.InviteStatus = 'Accepted';
          } else if (pInput.UserID && pInput.UserID.trim()) {
            newPart.UserID = pInput.UserID.trim();
            newPart.Role = h.NormalizeParticipantRole(pInput.Role, 'Attendee');
            newPart.InviteStatus = 'Invited';
          } else {
            newPart.ExternalName = pInput.ExternalName?.trim() || null;
            newPart.ExternalEmail = pInput.ExternalEmail?.trim() || null;
            newPart.ExternalPhone = pInput.ExternalPhone?.trim() || null;
            newPart.Role = h.NormalizeParticipantRole(pInput.Role, 'Attendee');
            newPart.InviteStatus = 'Invited';
          }

          if (await newPart.Save()) {
            if (newPart.UserID) {
              void h.SendMeetingInviteNotification(meeting, newPart.UserID, user, provider);
            }
          }
        }
      }
    }

    const updatedParticipants = await h.LoadParticipants(meeting.ID, user, provider);
    return {
      Success: true,
      Meeting: h.MapMeetingToType(meeting, updatedParticipants),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`[MeetingResolver] UpdateMeeting exception: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}

export async function ExecuteStartMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  meetingID: string,
  sessionManager: SessionManager,
  helpers?: Partial<MeetingHelpers>,
): Promise<StartMeetingResult> {
  const h = resolveHelpers(helpers);
  try {
    const meeting = await h.LoadMeetingEntity(meetingID, user, provider);
    if (!meeting) {
      return { Success: false, ErrorMessage: 'Meeting not found.' };
    }

    const authorized = await h.IsUserHostOrCoHost(meeting, user, provider);
    if (!authorized) {
      return { Success: false, ErrorMessage: 'Unauthorized: only the host or co-host may start this meeting.' };
    }

    if (meeting.Status === 'Ended' || meeting.Status === 'Cancelled') {
      return { Success: false, ErrorMessage: `Meeting cannot be started because its status is '${meeting.Status}'.` };
    }

    const now = new Date();
    meeting.Status = 'Live';
    meeting.StartedAt = meeting.StartedAt ?? now;
    if (!(await meeting.Save())) {
      return { Success: false, ErrorMessage: meeting.LatestResult?.CompleteMessage ?? 'Failed to update meeting status to Live.' };
    }

    // 1. Create or get Interaction row for this meeting
    const interaction = await h.EnsureMeetingInteraction(meeting, user, provider);

    // 2. Start all AI agent participants
    const participants = await h.LoadParticipants(meeting.ID, user, provider);
    const agentParticipants = participants.filter((p) => p.Role === 'Agent' && p.AgentID);

    for (const ap of agentParticipants) {
      try {
        const createdSession = await sessionManager.CreateSession(
          { agentID: ap.AgentID!, userID: user.ID },
          user,
          provider,
        );
        await LiveKitAgentRoomCoordinator.Instance.StartAgentRoomSession({
          AgentSessionID: createdSession.ID,
          RoomName: meeting.RoomName,
          AgentID: ap.AgentID!,
          ContextUser: user,
          MetadataProvider: provider,
          TurnMode: 'Active',
          TurnAddressing: 'Auto',
        });
      } catch (agentErr) {
        LogError(`[MeetingResolver] Failed to start agent participant ${ap.AgentID} in room ${meeting.RoomName}: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`);
      }
    }

    // 3. Initiate recording if RecordingPolicy is 'Automatic'
    if (meeting.RecordingPolicy === 'Automatic') {
      try {
        const egress = await new LiveKitEgressService().StartRoomRecording({ RoomName: meeting.RoomName });
        if (egress && egress.EgressID) {
          void CorrelateRecordingStart(meeting.RoomName, egress.EgressID, user, provider);
          if (interaction) {
            await h.RecordInteractionEvent(interaction.ID, 'RecordingStarted', user, provider, { EgressID: egress.EgressID });
          }
        }
      } catch (recErr) {
        LogError(`[MeetingResolver] Automatic recording initiation failed for room ${meeting.RoomName}: ${recErr instanceof Error ? recErr.message : String(recErr)}`);
      }
    }

    // 4. Mint LiveKit client token for the caller
    const tokenService = new LiveKitTokenService();
    const identity = LiveKitUserIdentity(user.ID);
    const mintedToken = await tokenService.MintClientToken(meeting.RoomName, identity, user.Name ?? user.Email);

    return {
      Success: true,
      Meeting: h.MapMeetingToType(meeting, participants),
      RoomName: meeting.RoomName,
      ClientToken: mintedToken.Token,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`[MeetingResolver] StartMeeting exception: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}

export async function ExecuteEndMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  meetingID: string,
  helpers?: Partial<MeetingHelpers>,
): Promise<MeetingResult> {
  const h = resolveHelpers(helpers);
  try {
    const meeting = await h.LoadMeetingEntity(meetingID, user, provider);
    if (!meeting) {
      return { Success: false, ErrorMessage: 'Meeting not found.' };
    }

    const authorized = await h.IsUserHostOrCoHost(meeting, user, provider);
    if (!authorized) {
      return { Success: false, ErrorMessage: 'Unauthorized: only the host or co-host may end this meeting.' };
    }

    const now = new Date();
    meeting.Status = 'Ended';
    meeting.EndedAt = now;
    if (!(await meeting.Save())) {
      return { Success: false, ErrorMessage: meeting.LatestResult?.CompleteMessage ?? 'Failed to update meeting status to Ended.' };
    }

    // 1. Stop all AI agents in room
    try {
      await LiveKitAgentRoomCoordinator.Instance.StopAllAgentsInRoom(meeting.RoomName, 'Explicit', user, provider);
    } catch (err) {
      LogError(`[MeetingResolver] Error stopping agents for room ${meeting.RoomName}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. Close Interaction record if exists
    await h.CloseMeetingInteraction(meeting.RoomName, user, provider);

    const participants = await h.LoadParticipants(meeting.ID, user, provider);
    return {
      Success: true,
      Meeting: h.MapMeetingToType(meeting, participants),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`[MeetingResolver] EndMeeting exception: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}

export async function ExecuteCancelMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  meetingID: string,
  helpers?: Partial<MeetingHelpers>,
): Promise<MeetingResult> {
  const h = resolveHelpers(helpers);
  try {
    const meeting = await h.LoadMeetingEntity(meetingID, user, provider);
    if (!meeting) {
      return { Success: false, ErrorMessage: 'Meeting not found.' };
    }

    const authorized = await h.IsUserHostOrCoHost(meeting, user, provider);
    if (!authorized) {
      return { Success: false, ErrorMessage: 'Unauthorized: only the host or co-host may cancel this meeting.' };
    }

    meeting.Status = 'Cancelled';
    if (!(await meeting.Save())) {
      return { Success: false, ErrorMessage: meeting.LatestResult?.CompleteMessage ?? 'Failed to cancel meeting.' };
    }

    const participants = await h.LoadParticipants(meeting.ID, user, provider);
    return {
      Success: true,
      Meeting: h.MapMeetingToType(meeting, participants),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`[MeetingResolver] CancelMeeting exception: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}

export async function ExecuteRSVPMeeting(
  provider: IMetadataProvider,
  user: UserInfo,
  input: RSVPMeetingInput,
  helpers?: Partial<MeetingHelpers>,
): Promise<MeetingResult> {
  const h = resolveHelpers(helpers);
  try {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();

    const validStatuses: MJMeetingParticipantEntity['InviteStatus'][] = ['Accepted', 'Declined', 'Tentative'];
    const statusInput = input.InviteStatus.trim();
    const matchedStatus = validStatuses.find((s) => s.toLowerCase() === statusInput.toLowerCase());
    if (!matchedStatus) {
      return { Success: false, ErrorMessage: `Invalid RSVP status: '${statusInput}'. Expected Accepted, Declined, or Tentative.` };
    }

    const escapedMeetingID = EscapeSQLString(input.MeetingID.trim());
    const escapedUserID = EscapeSQLString(user.ID);

    const pResult = await rv.RunView<MJMeetingParticipantEntity>(
      {
        EntityName: 'MJ: Meeting Participants',
        ExtraFilter: `MeetingID = '${escapedMeetingID}' AND UserID = '${escapedUserID}'`,
        ResultType: 'entity_object',
      },
      user,
    );

    if (!pResult.Success || !pResult.Results || pResult.Results.length === 0) {
      return { Success: false, ErrorMessage: 'Participant record not found for the caller in this meeting.' };
    }

    const participant = pResult.Results[0];
    participant.InviteStatus = matchedStatus;
    if (!(await participant.Save())) {
      return { Success: false, ErrorMessage: participant.LatestResult?.CompleteMessage ?? 'Failed to save RSVP response.' };
    }

    const meeting = await h.LoadMeetingEntity(input.MeetingID, user, provider);
    if (!meeting) {
      return { Success: false, ErrorMessage: 'Meeting not found.' };
    }

    const participants = await h.LoadParticipants(meeting.ID, user, provider);
    return {
      Success: true,
      Meeting: h.MapMeetingToType(meeting, participants),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    LogError(`[MeetingResolver] RSVPMeeting exception: ${msg}`);
    return { Success: false, ErrorMessage: msg };
  }
}
