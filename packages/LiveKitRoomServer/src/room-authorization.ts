import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { LiveKitAgentRoomCoordinator } from './livekit-agent-room-coordinator.js';

export const DEFAULT_SIP_CALL_ROOM_PREFIX = 'call-';
export const SIP_CALL_ROOM_PREFIX = DEFAULT_SIP_CALL_ROOM_PREFIX;

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

interface BridgeLookupRow {
  ID: string;
  AgentSessionID: string;
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
  private sipRoomPrefix: string = (process.env.LIVEKIT_SIP_ROOM_PREFIX ?? DEFAULT_SIP_CALL_ROOM_PREFIX).trim() || DEFAULT_SIP_CALL_ROOM_PREFIX;

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
   * Sets or resets the SIP call room prefix (e.g. to match LiveKitSipTelephonyService.roomPrefix).
   */
  public SetSipRoomPrefix(prefix?: string): void {
    this.sipRoomPrefix = (prefix ?? process.env.LIVEKIT_SIP_ROOM_PREFIX ?? DEFAULT_SIP_CALL_ROOM_PREFIX).trim() || DEFAULT_SIP_CALL_ROOM_PREFIX;
  }

  /**
   * Gets the active SIP call room prefix.
   */
  public get SipRoomPrefix(): string {
    return this.sipRoomPrefix;
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
      // Batch initial lookups for Meetings, Interactions, Interaction Offers, and Agent Session Bridges
      const [meetingResult, interactionResult, offerResult, bridgeResult] = await rv.RunViews<
        MeetingLookupRow | InteractionLookupRow | OfferLookupRow | BridgeLookupRow
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
          {
            EntityName: 'MJ: AI Agent Session Bridges',
            ExtraFilter: `ExternalConnectionID = '${escapedRoom}' AND Status = 'Active'`,
            Fields: ['ID', 'AgentSessionID'],
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

      if (!bridgeResult.Success) {
        LogError(`[RoomAuthorizationService] Error querying MJ: AI Agent Session Bridges for room '${trimmedRoom}': ${bridgeResult.ErrorMessage}`);
        return { Authorized: false, Reason: 'Error verifying agent bridge authorization.' };
      }

      const meetings = (meetingResult.Results ?? []) as MeetingLookupRow[];
      const interactions = (interactionResult.Results ?? []) as InteractionLookupRow[];
      const offers = (offerResult.Results ?? []) as OfferLookupRow[];
      const bridges = (bridgeResult.Results ?? []) as BridgeLookupRow[];
      const activeRoster = LiveKitAgentRoomCoordinator.Instance.GetAgentsInRoom(trimmedRoom);

      const agentSessionIDs = new Set<string>();
      for (const i of interactions) {
        if (i.AgentSessionID) agentSessionIDs.add(i.AgentSessionID);
      }
      for (const b of bridges) {
        if (b.AgentSessionID) agentSessionIDs.add(b.AgentSessionID);
      }
      for (const r of activeRoster) {
        if (r.AgentSessionID) agentSessionIDs.add(r.AgentSessionID);
      }

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

      // 2. Check if room is tied to an Interaction, has active agent sessions (e.g. web agent rooms), or has a SIP call prefix (never ad-hoc)
      const isSipCallRoom = trimmedRoom.startsWith(this.sipRoomPrefix);
      if (interactions.length > 0 || isSipCallRoom || agentSessionIDs.size > 0) {
        // User with an Accepted offer for it
        const hasAcceptedOffer = offers.some(
          (o) => UUIDsEqual(o.TargetUserID, user.ID) && o.Status === 'Accepted',
        );
        if (hasAcceptedOffer) {
          return { Authorized: true };
        }

        // User who started it (the Interaction's or Agent Session's owner)
        if (agentSessionIDs.size > 0) {
          const filter = [...agentSessionIDs].map((id) => `ID = '${EscapeSQLString(id)}'`).join(' OR ');
          const sessionResult = await rv.RunView<AgentSessionLookupRow>(
            {
              EntityName: 'MJ: AI Agent Sessions',
              ExtraFilter: filter,
              Fields: ['ID', 'UserID'],
              ResultType: 'simple',
            },
            user,
          );

          if (!sessionResult.Success) {
            LogError(`[RoomAuthorizationService] Error querying MJ: AI Agent Sessions for room '${trimmedRoom}': ${sessionResult.ErrorMessage}`);
            return { Authorized: false, Reason: 'Error verifying session authorization.' };
          }

          const sessions = (sessionResult.Results ?? []) as AgentSessionLookupRow[];
          if (sessions.some((s) => UUIDsEqual(s.UserID, user.ID))) {
            return { Authorized: true };
          }
        }

        return { Authorized: false, Reason: 'User is not authorized to access this call or agent session room.' };
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

      // 4. Ad-hoc rooms: only rooms with no Meeting, no Interaction, no Agent Session, and no Offer row
      return { Authorized: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`[RoomAuthorizationService] Unexpected error authorizing room '${trimmedRoom}': ${msg}`);
      return { Authorized: false, Reason: `Internal authorization error: ${msg}` };
    }
  }
}
