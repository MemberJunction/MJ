import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, InputType, Field } from 'type-graphql';
import { randomUUID } from 'node:crypto';
import {
  IMetadataProvider,
  LogError,
  LogStatus,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type {
  MJMeetingEntity,
  MJMeetingParticipantEntity,
  MJPhoneNumberEntity,
  MJInteractionEntity,
  MJInteractionEventEntity,
} from '@memberjunction/core-entities';
import {
  LiveKitTokenService,
  LiveKitAgentRoomCoordinator,
  LiveKitEgressService,
  LiveKitUserIdentity,
} from '@memberjunction/livekit-room-server';
import { NotificationEngine } from '@memberjunction/notifications';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { CorrelateRecordingStart } from './meetingRecordingRegistration.js';
import { SessionManager } from '../agentSessions/SessionManager.js';

// ── Rate Limiter for Phone Dial-In Verification ──────────────────────────────

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export class DialInRateLimiter extends BaseSingleton<DialInRateLimiter> {
  public constructor() {
    super();
  }

  private readonly attempts = new Map<string, RateLimitEntry>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly lockoutMs = 15 * 60 * 1000; // 15 minutes

  public static get Instance(): DialInRateLimiter {
    return DialInRateLimiter.getInstance<DialInRateLimiter>();
  }

  public CheckAllowed(key: string): { allowed: boolean; remainingMs?: number } {
    const entry = this.attempts.get(key);
    if (!entry) {
      return { allowed: true };
    }
    const now = Date.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return { allowed: false, remainingMs: entry.lockedUntil - now };
    }
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true };
    }
    if (entry.attempts >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
      return { allowed: false, remainingMs: this.lockoutMs };
    }
    return { allowed: true };
  }

  public RecordFailure(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { attempts: 1, firstAttemptAt: now });
    } else {
      entry.attempts++;
      if (entry.attempts >= this.maxAttempts) {
        entry.lockedUntil = now + this.lockoutMs;
      }
    }
  }

  public RecordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  public ClearForTesting(): void {
    this.attempts.clear();
  }
}

// ── GraphQL Types ────────────────────────────────────────────────────────────

@ObjectType()
export class MeetingParticipantType {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  MeetingID: string;

  @Field(() => String, { nullable: true })
  UserID?: string;

  @Field(() => String, { nullable: true })
  UserName?: string;

  @Field(() => String, { nullable: true })
  UserEmail?: string;

  @Field(() => String, { nullable: true })
  AgentID?: string;

  @Field(() => String, { nullable: true })
  AgentName?: string;

  @Field(() => String, { nullable: true })
  ExternalName?: string;

  @Field(() => String, { nullable: true })
  ExternalEmail?: string;

  @Field(() => String, { nullable: true })
  ExternalPhone?: string;

  @Field(() => String)
  Role: string;

  @Field(() => String)
  InviteStatus: string;

  @Field(() => Date, { nullable: true })
  JoinedAt?: Date;

  @Field(() => Date, { nullable: true })
  LeftAt?: Date;
}

@ObjectType()
export class MeetingType {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  Title: string;

  @Field(() => String, { nullable: true })
  Description?: string;

  @Field(() => String)
  HostUserID: string;

  @Field(() => String, { nullable: true })
  HostUserName?: string;

  @Field(() => String)
  RoomName: string;

  @Field(() => String)
  Status: string;

  @Field(() => Date, { nullable: true })
  ScheduledStartAt?: Date;

  @Field(() => Date, { nullable: true })
  ScheduledEndAt?: Date;

  @Field(() => Date, { nullable: true })
  StartedAt?: Date;

  @Field(() => Date, { nullable: true })
  EndedAt?: Date;

  @Field(() => Boolean)
  AllowPhoneDialIn: boolean;

  @Field(() => String, { nullable: true })
  DialInPhoneNumberID?: string;

  @Field(() => String, { nullable: true })
  DialInPhoneNumber?: string;

  @Field(() => String, { nullable: true })
  DialInCode?: string;

  @Field(() => String)
  RecordingPolicy: string;

  @Field(() => String, { nullable: true })
  ConversationID?: string;

  @Field(() => [MeetingParticipantType], { nullable: true })
  Participants?: MeetingParticipantType[];

  @Field(() => Date)
  CreatedAt: Date;

  @Field(() => Date)
  UpdatedAt: Date;
}

@ObjectType()
export class MeetingResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => MeetingType, { nullable: true })
  Meeting?: MeetingType;
}

@ObjectType()
export class StartMeetingResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => MeetingType, { nullable: true })
  Meeting?: MeetingType;

  @Field(() => String, { nullable: true })
  RoomName?: string;

  @Field(() => String, { nullable: true })
  ClientToken?: string;
}

@ObjectType()
export class VerifyDialInCodeResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => String, { nullable: true })
  RoomName?: string;

  @Field(() => String, { nullable: true })
  MeetingID?: string;
}

@ObjectType()
export class DialInPhoneNumberType {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  Number: string;

  @Field(() => String, { nullable: true })
  Label?: string;
}

@InputType()
export class MeetingParticipantInput {
  @Field(() => String, { nullable: true })
  UserID?: string;

  @Field(() => String, { nullable: true })
  AgentID?: string;

  @Field(() => String, { nullable: true })
  ExternalName?: string;

  @Field(() => String, { nullable: true })
  ExternalEmail?: string;

  @Field(() => String, { nullable: true })
  ExternalPhone?: string;

  @Field(() => String, { nullable: true })
  Role?: string;
}

@InputType()
export class CreateMeetingInput {
  @Field(() => String)
  Title: string;

  @Field(() => String, { nullable: true })
  Description?: string;

  @Field(() => Date, { nullable: true })
  ScheduledStartAt?: Date;

  @Field(() => Date, { nullable: true })
  ScheduledEndAt?: Date;

  @Field(() => Boolean, { nullable: true })
  AllowPhoneDialIn?: boolean;

  @Field(() => String, { nullable: true })
  DialInPhoneNumberID?: string;

  @Field(() => String, { nullable: true })
  RecordingPolicy?: string;

  @Field(() => [MeetingParticipantInput], { nullable: true })
  Participants?: MeetingParticipantInput[];
}

@InputType()
export class UpdateMeetingInput {
  @Field(() => String)
  MeetingID: string;

  @Field(() => String, { nullable: true })
  Title?: string;

  @Field(() => String, { nullable: true })
  Description?: string;

  @Field(() => Date, { nullable: true })
  ScheduledStartAt?: Date;

  @Field(() => Date, { nullable: true })
  ScheduledEndAt?: Date;

  @Field(() => Boolean, { nullable: true })
  AllowPhoneDialIn?: boolean;

  @Field(() => String, { nullable: true })
  DialInPhoneNumberID?: string;

  @Field(() => String, { nullable: true })
  RecordingPolicy?: string;

  @Field(() => [MeetingParticipantInput], { nullable: true })
  Participants?: MeetingParticipantInput[];
}

@InputType()
export class RSVPMeetingInput {
  @Field(() => String)
  MeetingID: string;

  @Field(() => String)
  InviteStatus: string;
}

@InputType()
export class VerifyDialInCodeInput {
  @Field(() => String)
  PhoneNumberID: string;

  @Field(() => String)
  DialInCode: string;

  @Field(() => String, { nullable: true })
  CallerPhone?: string;
}

// ── Meeting Resolver ─────────────────────────────────────────────────────────

@Resolver()
export class MeetingResolver extends ResolverBase {
  private readonly sessionManager = new SessionManager();

  /**
   * Lists meetings accessible to the caller (meetings where user is host or participant).
   */
  @Query(() => [MeetingType])
  async MyMeetings(
    @Arg('status', () => String, { nullable: true }) status?: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingType[]> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        throw new Error('User is not authenticated.');
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
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
        const participants = await this.loadParticipants(m.ID, user, provider);
        output.push(this.mapMeetingToType(m, participants));
      }
      return output;
    } catch (error) {
      LogError(`[MeetingResolver] MyMeetings failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Gets a single meeting by ID.
   */
  @Query(() => MeetingType, { nullable: true })
  async Meeting(
    @Arg('id', () => String) id: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingType | null> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        throw new Error('User is not authenticated.');
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
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
      const participants = await this.loadParticipants(meeting.ID, user, provider);

      // Verify authorization: caller must be host or participant
      const isHost = UUIDsEqual(meeting.HostUserID, user.ID);
      const isParticipant = participants.some((p) => p.UserID && UUIDsEqual(p.UserID, user.ID));
      if (!isHost && !isParticipant) {
        return null;
      }

      return this.mapMeetingToType(meeting, participants);
    } catch (error) {
      LogError(`[MeetingResolver] Meeting query failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Gets participants for a given meeting.
   */
  @Query(() => [MeetingParticipantType])
  async MeetingParticipants(
    @Arg('meetingID', () => String) meetingID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingParticipantType[]> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        throw new Error('User is not authenticated.');
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      return await this.loadParticipants(meetingID.trim(), user, provider);
    } catch (error) {
      LogError(`[MeetingResolver] MeetingParticipants failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Lists available active phone numbers suitable for dial-in.
   */
  @Query(() => [DialInPhoneNumberType])
  async AvailableDialInPhoneNumbers(
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<DialInPhoneNumberType[]> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        throw new Error('User is not authenticated.');
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
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

  /**
   * Creates and schedules a new meeting.
   */
  @Mutation(() => MeetingResult)
  async CreateMeeting(
    @Arg('input', () => CreateMeetingInput) input: CreateMeetingInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'User is not authenticated.' };
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;

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
          const defaultNumber = await this.resolveDefaultPhoneNumber(user, provider);
          if (!defaultNumber) {
            return {
              Success: false,
              ErrorMessage: 'Cannot allow phone dial-in: no active phone numbers are configured in the system.',
            };
          }
          dialInPhoneNumberID = defaultNumber.ID;
        }

        // Generate a random unique dial-in code (6 digits)
        dialInCode = await this.generateUniqueDialInCode(dialInPhoneNumberID, user, provider);
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
      meeting.RecordingPolicy = this.normalizeRecordingPolicy(input.RecordingPolicy);

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
      const participants: MeetingParticipantType[] = [this.mapParticipantToType(hostParticipant, user.Name, user.Email)];

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
            participant.Role = this.normalizeParticipantRole(pInput.Role, 'Attendee');
            participant.InviteStatus = 'Invited';
          } else {
            // External guest
            participant.ExternalName = pInput.ExternalName?.trim() || null;
            participant.ExternalEmail = pInput.ExternalEmail?.trim() || null;
            participant.ExternalPhone = pInput.ExternalPhone?.trim() || null;
            participant.Role = this.normalizeParticipantRole(pInput.Role, 'Attendee');
            participant.InviteStatus = 'Invited';
          }

          if (await participant.Save()) {
            participants.push(this.mapParticipantToType(participant));

            // Send notification for internal users
            if (participant.UserID) {
              void this.sendMeetingInviteNotification(meeting, participant.UserID, user, provider);
            }
          }
        }
      }

      return {
        Success: true,
        Meeting: this.mapMeetingToType(meeting, participants),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] CreateMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Updates meeting details and participant list. Host or CoHost only.
   */
  @Mutation(() => MeetingResult)
  async UpdateMeeting(
    @Arg('input', () => UpdateMeetingInput) input: UpdateMeetingInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'User is not authenticated.' };
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;

      const meeting = await this.loadMeetingEntity(input.MeetingID, user, provider);
      if (!meeting) {
        return { Success: false, ErrorMessage: 'Meeting not found.' };
      }

      // Check authorization (host or co-host)
      const authorized = await this.isUserHostOrCoHost(meeting, user, provider);
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
        meeting.RecordingPolicy = this.normalizeRecordingPolicy(input.RecordingPolicy);
      }

      if (input.AllowPhoneDialIn !== undefined) {
        meeting.AllowPhoneDialIn = input.AllowPhoneDialIn;
        if (meeting.AllowPhoneDialIn && !meeting.DialInCode) {
          let phoneID = input.DialInPhoneNumberID?.trim() || meeting.DialInPhoneNumberID;
          if (!phoneID) {
            const defPhone = await this.resolveDefaultPhoneNumber(user, provider);
            phoneID = defPhone?.ID;
          }
          if (phoneID) {
            meeting.DialInPhoneNumberID = phoneID;
            meeting.DialInCode = await this.generateUniqueDialInCode(phoneID, user, provider);
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

      // Add new participants if supplied
      if (input.Participants && input.Participants.length > 0) {
        const existingParticipants = await this.loadParticipants(meeting.ID, user, provider);
        for (const pInput of input.Participants) {
          const isUserDuplicate = pInput.UserID && existingParticipants.some((e) => e.UserID && UUIDsEqual(e.UserID, pInput.UserID));
          const isAgentDuplicate = pInput.AgentID && existingParticipants.some((e) => e.AgentID && UUIDsEqual(e.AgentID, pInput.AgentID));
          if (isUserDuplicate || isAgentDuplicate) {
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
            participant.Role = this.normalizeParticipantRole(pInput.Role, 'Attendee');
            participant.InviteStatus = 'Invited';
          } else {
            participant.ExternalName = pInput.ExternalName?.trim() || null;
            participant.ExternalEmail = pInput.ExternalEmail?.trim() || null;
            participant.ExternalPhone = pInput.ExternalPhone?.trim() || null;
            participant.Role = this.normalizeParticipantRole(pInput.Role, 'Attendee');
            participant.InviteStatus = 'Invited';
          }

          if (await participant.Save()) {
            if (participant.UserID) {
              void this.sendMeetingInviteNotification(meeting, participant.UserID, user, provider);
            }
          }
        }
      }

      const updatedParticipants = await this.loadParticipants(meeting.ID, user, provider);
      return {
        Success: true,
        Meeting: this.mapMeetingToType(meeting, updatedParticipants),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] UpdateMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Starts a meeting: transitions status to 'Live', creates the meeting's Interaction,
   * spins up any AI agent participants via LiveKitAgentRoomCoordinator, initiates recording
   * if policy is 'Automatic', and mints a LiveKit client token for the caller.
   */
  @Mutation(() => StartMeetingResult)
  async StartMeeting(
    @Arg('meetingID', () => String) meetingID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<StartMeetingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'User is not authenticated.' };
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;

      const meeting = await this.loadMeetingEntity(meetingID, user, provider);
      if (!meeting) {
        return { Success: false, ErrorMessage: 'Meeting not found.' };
      }

      const authorized = await this.isUserHostOrCoHost(meeting, user, provider);
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
      const interaction = await this.ensureMeetingInteraction(meeting, user, provider);

      // 2. Start all AI agent participants
      const participants = await this.loadParticipants(meeting.ID, user, provider);
      const agentParticipants = participants.filter((p) => p.Role === 'Agent' && p.AgentID);

      for (const ap of agentParticipants) {
        try {
          const createdSession = await this.sessionManager.CreateSession(
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
              await this.recordInteractionEvent(interaction.ID, 'RecordingStarted', user, provider, { EgressID: egress.EgressID });
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
        Meeting: this.mapMeetingToType(meeting, participants),
        RoomName: meeting.RoomName,
        ClientToken: mintedToken.Token,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] StartMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Ends a meeting: transitions status to 'Ended', stops all agents in the room,
   * closes the Interaction record, and records lifecycle events.
   */
  @Mutation(() => MeetingResult)
  async EndMeeting(
    @Arg('meetingID', () => String) meetingID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'User is not authenticated.' };
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;

      const meeting = await this.loadMeetingEntity(meetingID, user, provider);
      if (!meeting) {
        return { Success: false, ErrorMessage: 'Meeting not found.' };
      }

      const authorized = await this.isUserHostOrCoHost(meeting, user, provider);
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
      await this.closeMeetingInteraction(meeting.RoomName, user, provider);

      const participants = await this.loadParticipants(meeting.ID, user, provider);
      return {
        Success: true,
        Meeting: this.mapMeetingToType(meeting, participants),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] EndMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Cancels a scheduled meeting.
   */
  @Mutation(() => MeetingResult)
  async CancelMeeting(
    @Arg('meetingID', () => String) meetingID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'User is not authenticated.' };
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;

      const meeting = await this.loadMeetingEntity(meetingID, user, provider);
      if (!meeting) {
        return { Success: false, ErrorMessage: 'Meeting not found.' };
      }

      const authorized = await this.isUserHostOrCoHost(meeting, user, provider);
      if (!authorized) {
        return { Success: false, ErrorMessage: 'Unauthorized: only the host or co-host may cancel this meeting.' };
      }

      meeting.Status = 'Cancelled';
      if (!(await meeting.Save())) {
        return { Success: false, ErrorMessage: meeting.LatestResult?.CompleteMessage ?? 'Failed to cancel meeting.' };
      }

      const participants = await this.loadParticipants(meeting.ID, user, provider);
      return {
        Success: true,
        Meeting: this.mapMeetingToType(meeting, participants),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] CancelMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Updates RSVP invite status for the authenticated user.
   */
  @Mutation(() => MeetingResult)
  async RSVPMeeting(
    @Arg('input', () => RSVPMeetingInput) input: RSVPMeetingInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<MeetingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'User is not authenticated.' };
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
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

      const meeting = await this.loadMeetingEntity(input.MeetingID, user, provider);
      if (!meeting) {
        return { Success: false, ErrorMessage: 'Meeting not found.' };
      }

      const participants = await this.loadParticipants(meeting.ID, user, provider);
      return {
        Success: true,
        Meeting: this.mapMeetingToType(meeting, participants),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] RSVPMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Verifies a phone caller's DTMF dial-in code and returns the target meeting room name.
   * Rate-limited per caller phone to prevent brute-force code guessing.
   */
  @Mutation(() => VerifyDialInCodeResult)
  async VerifyMeetingDialInCode(
    @Arg('input', () => VerifyDialInCodeInput) input: VerifyDialInCodeInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<VerifyDialInCodeResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();

      const callerKey = (input.CallerPhone?.trim() || 'unknown-caller').toLowerCase();
      const rateLimit = DialInRateLimiter.Instance.CheckAllowed(callerKey);
      if (!rateLimit.allowed) {
        const remainingSeconds = Math.ceil((rateLimit.remainingMs ?? 0) / 1000);
        return {
          Success: false,
          ErrorMessage: `Too many invalid attempts. Please try again in ${remainingSeconds} seconds.`,
        };
      }

      const escapedPhoneID = EscapeSQLString(input.PhoneNumberID.trim());
      const escapedCode = EscapeSQLString(input.DialInCode.trim());

      const result = await rv.RunView<MJMeetingEntity>(
        {
          EntityName: 'MJ: Meetings',
          ExtraFilter: `DialInPhoneNumberID = '${escapedPhoneID}' AND DialInCode = '${escapedCode}' AND Status IN ('Live', 'Scheduled')`,
          ResultType: 'entity_object',
        },
        user,
      );

      if (!result.Success || !result.Results || result.Results.length === 0) {
        DialInRateLimiter.Instance.RecordFailure(callerKey);
        return { Success: false, ErrorMessage: 'Invalid dial-in code.' };
      }

      DialInRateLimiter.Instance.RecordSuccess(callerKey);
      const meeting = result.Results[0];
      return {
        Success: true,
        RoomName: meeting.RoomName,
        MeetingID: meeting.ID,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] VerifyMeetingDialInCode exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  // ── Helper Methods ─────────────────────────────────────────────────────────

  private async loadMeetingEntity(
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

  private async loadParticipants(
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
    return res.Results.map((p) => this.mapParticipantToType(p));
  }

  private async isUserHostOrCoHost(
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

  private async resolveDefaultPhoneNumber(
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

  private async generateUniqueDialInCode(
    phoneNumberID: string,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<string | undefined> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escapedPhoneID = EscapeSQLString(phoneNumberID);

    for (let attempt = 0; attempt < 10; attempt++) {
      // 6-digit numeric code
      const candidate = Math.floor(100000 + Math.random() * 900000).toString();
      const res = await rv.RunView<MJMeetingEntity>(
        {
          EntityName: 'MJ: Meetings',
          ExtraFilter: `DialInPhoneNumberID = '${escapedPhoneID}' AND DialInCode = '${candidate}' AND Status IN ('Live', 'Scheduled')`,
          ResultType: 'entity_object',
        },
        user,
      );
      if (res.Success && (!res.Results || res.Results.length === 0)) {
        return candidate;
      }
    }
    return undefined;
  }

  private async ensureMeetingInteraction(
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
        await this.recordInteractionEvent(entity.ID, 'Created', user, provider, { MeetingID: meeting.ID, RoomName: meeting.RoomName });
        await this.recordInteractionEvent(entity.ID, 'Answered', user, provider);
        return entity;
      }
      return null;
    } catch (err) {
      LogError(`[MeetingResolver] ensureMeetingInteraction failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async recordInteractionEvent(
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

  private async closeMeetingInteraction(
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
        await this.recordInteractionEvent(interaction.ID, 'Ended', user, provider);
      }
    } catch (err) {
      LogError(`[MeetingResolver] closeMeetingInteraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async sendMeetingInviteNotification(
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

  private normalizeParticipantRole(
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

  private normalizeRecordingPolicy(
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

  private mapMeetingToType(m: MJMeetingEntity, participants?: MeetingParticipantType[]): MeetingType {
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
      DialInCode: m.DialInCode ?? undefined,
      RecordingPolicy: m.RecordingPolicy,
      ConversationID: m.ConversationID ?? undefined,
      Participants: participants,
      CreatedAt: m.__mj_CreatedAt,
      UpdatedAt: m.__mj_UpdatedAt,
    };
  }

  private mapParticipantToType(
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
}
