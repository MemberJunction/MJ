import { BaseSingleton } from '@memberjunction/global';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJMeetingEntity,
  MJMeetingParticipantEntity,
  MJInteractionOfferEntity,
} from '@memberjunction/core-entities';

export interface RoomAuthorizationResult {
  Authorized: boolean;
  Reason?: string;
}

export type RoomAuthorizerFn = (
  roomName: string,
  user: UserInfo,
  provider?: IMetadataProvider,
) => Promise<RoomAuthorizationResult>;

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
 * 2. Rooms tied to an `MJ: Interaction Offers` record:
 *    - User must be the `TargetUserID` AND have `Status === 'Accepted'`.
 *    - Otherwise access is refused.
 *
 * 3. Ad-hoc rooms (not tied to a Meeting or an InteractionOffer):
 *    - Any authenticated user is granted access.
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

    const escapedRoom = trimmedRoom.replace(/'/g, "''");
    const escapedUserID = user.ID.replace(/'/g, "''");

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();

    try {
      // 1. Check if room is tied to an MJ: Meetings record
      const meetingResult = await rv.RunView<MJMeetingEntity>(
        {
          EntityName: 'MJ: Meetings',
          ExtraFilter: `RoomName = '${escapedRoom}'`,
          ResultType: 'entity_object',
        },
        user,
      );

      if (!meetingResult.Success) {
        LogError(`[RoomAuthorizationService] Error querying MJ: Meetings for room '${trimmedRoom}': ${meetingResult.ErrorMessage}`);
        return { Authorized: false, Reason: 'Error verifying meeting authorization.' };
      }

      if (meetingResult.Results && meetingResult.Results.length > 0) {
        const meeting = meetingResult.Results[0];
        if (meeting.Status === 'Cancelled') {
          return { Authorized: false, Reason: 'Meeting is cancelled.' };
        }

        if (meeting.HostUserID === user.ID) {
          return { Authorized: true };
        }

        const participantResult = await rv.RunView<MJMeetingParticipantEntity>(
          {
            EntityName: 'MJ: Meeting Participants',
            ExtraFilter: `MeetingID = '${meeting.ID}' AND UserID = '${escapedUserID}'`,
            ResultType: 'entity_object',
          },
          user,
        );

        if (!participantResult.Success) {
          LogError(`[RoomAuthorizationService] Error querying MJ: Meeting Participants for meeting '${meeting.ID}': ${participantResult.ErrorMessage}`);
          return { Authorized: false, Reason: 'Error verifying participant authorization.' };
        }

        if (participantResult.Results && participantResult.Results.length > 0) {
          const participant = participantResult.Results[0];
          if (participant.InviteStatus === 'Declined') {
            return { Authorized: false, Reason: 'User declined the invitation to this meeting.' };
          }
          return { Authorized: true };
        }

        return { Authorized: false, Reason: 'User is not a host or participant in this meeting.' };
      }

      // 2. Check if room is tied to an MJ: Interaction Offers record
      const offerResult = await rv.RunView<MJInteractionOfferEntity>(
        {
          EntityName: 'MJ: Interaction Offers',
          ExtraFilter: `RoomName = '${escapedRoom}'`,
          ResultType: 'entity_object',
        },
        user,
      );

      if (!offerResult.Success) {
        LogError(`[RoomAuthorizationService] Error querying MJ: Interaction Offers for room '${trimmedRoom}': ${offerResult.ErrorMessage}`);
        return { Authorized: false, Reason: 'Error verifying interaction offer authorization.' };
      }

      if (offerResult.Results && offerResult.Results.length > 0) {
        const acceptedOffer = offerResult.Results.find(
          (o) => o.TargetUserID === user.ID && o.Status === 'Accepted',
        );
        if (acceptedOffer) {
          return { Authorized: true };
        }
        return { Authorized: false, Reason: 'User has not accepted a handoff offer for this room.' };
      }

      // 3. Ad-hoc unmanaged room: allowed for authenticated users
      return { Authorized: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`[RoomAuthorizationService] Unexpected error authorizing room '${trimmedRoom}': ${msg}`);
      return { Authorized: false, Reason: 'Internal authorization error.' };
    }
  }
}
