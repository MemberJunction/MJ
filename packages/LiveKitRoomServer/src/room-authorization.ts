import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

export const SIP_CALL_ROOM_PREFIX = 'call-';

export interface RoomAuthorizationResult {
  Authorized: boolean;
  Reason?: string;
}

export type RoomAuthorizerFn = (
  roomName: string,
  user: UserInfo,
  provider?: IMetadataProvider,
) => Promise<RoomAuthorizationResult>;

interface MeetingLookupRow {
  ID: string;
  Status: string;
  HostUserID: string;
}

interface InteractionLookupRow {
  ID: string;
  Status: string;
  AgentSessionID: string | null;
}

interface OfferLookupRow {
  ID: string;
  Status: string;
  TargetUserID: string;
}

interface ParticipantLookupRow {
  ID: string;
  InviteStatus: string;
  UserID: string;
}

interface AgentSessionLookupRow {
  ID: string;
  UserID: string;
}

/**
 * Service enforcing per-room authorization for LiveKit rooms.
 *
 * Rules:
 * 1. Rooms tied to an `MJ: Meetings` record:
 *    - Cancelled meetings refuse access.
 *    - Host user (`meeting.HostUserID`) is granted access.
 *    - Meeting participants (`MJ: Meeting Participants` where `UserID = user.ID`):
 *      - If `InviteStatus === 'Declined'`, access is refused.
 *      - If `InviteStatus` is `'Invited'`, `'Accepted'`, or `'Tentative'`, access is granted.
 *    - Non-participants are refused access.
 *
 * 2. Rooms tied to an `MJ: Interactions` record OR starting with the SIP call prefix (`call-`):
 *    - Never ad-hoc.
 *    - User who has an `Accepted` offer for this room is granted access.
 *    - User who started it (the Interaction's agent-session owner) is granted access.
 *    - Otherwise access is refused.
 *
 * 3. Rooms tied to an `MJ: Interaction Offers` record:
 *    - User must be the `TargetUserID` AND have `Status === 'Accepted'`.
 *    - Otherwise access is refused.
 *
 * 4. Ad-hoc rooms:
 *    - Only rooms with NO Meeting, NO Interaction, and NO Offer row (and not starting with `call-`)
 *      are ad-hoc and open to authenticated users.
 */
export class RoomAuthorizationService extends BaseSingleton<RoomAuthorizationService> {
  private authorizerOverride?: RoomAuthorizerFn;

  public constructor() {
    super();
  }

  public static get Instance(): RoomAuthorizationService {
    return RoomAuthorizationService.getInstance<RoomAuthorizationService>();
  }

  /**
   * Sets an authorizer override for testing or specialized harnesses.
   */
  public SetAuthorizerForTesting(fn?: RoomAuthorizerFn): void {
    this.authorizerOverride = fn;
  }

  /**
   * Authorizes whether the given user may access the specified LiveKit room.
   */
  public async AuthorizeRoomAccess(
    roomName: string,
    user: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RoomAuthorizationResult> {
    if (!user || !user.ID) {
      return { Authorized: false, Reason: 'User is not authenticated.' };
    }

    if (this.authorizerOverride) {
      return await this.authorizerOverride(roomName, user, provider);
    }

    const trimmedRoom = roomName.trim();
    if (!trimmedRoom) {
      return { Authorized: false, Reason: 'Room name cannot be empty.' };
    }

    const escapedRoom = EscapeSQLString(trimmedRoom);
    const escapedUserID = EscapeSQLString(user.ID);

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();

    try {
      // Batch initial lookups for Meetings, Interactions, and Interaction Offers
      const [meetingResult, interactionResult, offerResult] = await rv.RunViews<
        MeetingLookupRow | InteractionLookupRow | OfferLookupRow
      >(
        [
          {
            EntityName: 'MJ: Meetings',
            ExtraFilter: `RoomName = '${escapedRoom}'`,
            Fields: ['ID', 'Status', 'HostUserID'],
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Interactions',
            ExtraFilter: `RoomName = '${escapedRoom}'`,
            Fields: ['ID', 'Status', 'AgentSessionID'],
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Interaction Offers',
            ExtraFilter: `RoomName = '${escapedRoom}'`,
            Fields: ['ID', 'Status', 'TargetUserID'],
            ResultType: 'simple',
          },
        ],
        user,
      );

      if (!meetingResult.Success) {
        LogError(`[RoomAuthorizationService] Error querying MJ: Meetings for room '${trimmedRoom}': ${meetingResult.ErrorMessage}`);
        return { Authorized: false, Reason: 'Error verifying meeting authorization.' };
      }

      if (!interactionResult.Success) {
        LogError(`[RoomAuthorizationService] Error querying MJ: Interactions for room '${trimmedRoom}': ${interactionResult.ErrorMessage}`);
        return { Authorized: false, Reason: 'Error verifying interaction authorization.' };
      }

      if (!offerResult.Success) {
        LogError(`[RoomAuthorizationService] Error querying MJ: Interaction Offers for room '${trimmedRoom}': ${offerResult.ErrorMessage}`);
        return { Authorized: false, Reason: 'Error verifying interaction offer authorization.' };
      }

      const meetings = (meetingResult.Results ?? []) as MeetingLookupRow[];
      const interactions = (interactionResult.Results ?? []) as InteractionLookupRow[];
      const offers = (offerResult.Results ?? []) as OfferLookupRow[];

      // 1. Check if room is tied to an MJ: Meetings record
      if (meetings.length > 0) {
        const meeting = meetings[0];
        if (meeting.Status === 'Cancelled') {
          return { Authorized: false, Reason: 'Meeting is cancelled.' };
        }

        if (UUIDsEqual(meeting.HostUserID, user.ID)) {
          return { Authorized: true };
        }

        const participantResult = await rv.RunView<ParticipantLookupRow>(
          {
            EntityName: 'MJ: Meeting Participants',
            ExtraFilter: `MeetingID = '${EscapeSQLString(meeting.ID)}' AND UserID = '${escapedUserID}'`,
            Fields: ['ID', 'InviteStatus', 'UserID'],
            ResultType: 'simple',
          },
          user,
        );

        if (!participantResult.Success) {
          LogError(`[RoomAuthorizationService] Error querying MJ: Meeting Participants for meeting '${meeting.ID}': ${participantResult.ErrorMessage}`);
          return { Authorized: false, Reason: 'Error verifying participant authorization.' };
        }

        const participants = (participantResult.Results ?? []) as ParticipantLookupRow[];
        if (participants.length > 0) {
          const participant = participants[0];
          if (participant.InviteStatus === 'Declined') {
            return { Authorized: false, Reason: 'User declined the invitation to this meeting.' };
          }
          return { Authorized: true };
        }

        return { Authorized: false, Reason: 'User is not a host or participant in this meeting.' };
      }

      // 2. Check if room is tied to an Interaction or has a SIP call prefix (never ad-hoc)
      const isSipCallRoom = trimmedRoom.startsWith(SIP_CALL_ROOM_PREFIX);
      if (interactions.length > 0 || isSipCallRoom) {
        // User with an Accepted offer for it
        const hasAcceptedOffer = offers.some(
          (o) => UUIDsEqual(o.TargetUserID, user.ID) && o.Status === 'Accepted',
        );
        if (hasAcceptedOffer) {
          return { Authorized: true };
        }

        // User who started it (the Interaction's agent-session owner)
        if (interactions.length > 0) {
          const interaction = interactions[0];
          if (interaction.AgentSessionID) {
            const sessionResult = await rv.RunView<AgentSessionLookupRow>(
              {
                EntityName: 'MJ: AI Agent Sessions',
                ExtraFilter: `ID = '${EscapeSQLString(interaction.AgentSessionID)}'`,
                Fields: ['ID', 'UserID'],
                ResultType: 'simple',
              },
              user,
            );

            if (!sessionResult.Success) {
              LogError(`[RoomAuthorizationService] Error querying MJ: AI Agent Sessions for session '${interaction.AgentSessionID}': ${sessionResult.ErrorMessage}`);
              return { Authorized: false, Reason: 'Error verifying session authorization.' };
            }

            const sessions = (sessionResult.Results ?? []) as AgentSessionLookupRow[];
            if (sessions.length > 0 && UUIDsEqual(sessions[0].UserID, user.ID)) {
              return { Authorized: true };
            }
          }
        }

        return { Authorized: false, Reason: 'User is not authorized to access this call.' };
      }

      // 3. Rooms tied to an MJ: Interaction Offers record
      if (offers.length > 0) {
        const acceptedOffer = offers.find(
          (o) => UUIDsEqual(o.TargetUserID, user.ID) && o.Status === 'Accepted',
        );
        if (acceptedOffer) {
          return { Authorized: true };
        }
        return { Authorized: false, Reason: 'User has not accepted a handoff offer for this room.' };
      }

      // 4. Ad-hoc rooms: only rooms with no Meeting, no Interaction, and no Offer row
      return { Authorized: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`[RoomAuthorizationService] Unexpected error authorizing room '${trimmedRoom}': ${msg}`);
      return { Authorized: false, Reason: `Internal authorization error: ${msg}` };
    }
  }
}
