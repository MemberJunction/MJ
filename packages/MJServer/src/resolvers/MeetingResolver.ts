import { Resolver, Mutation, Query, Arg, Ctx } from 'type-graphql';
import {
  IMetadataProvider,
  LogError,
} from '@memberjunction/core';
import type {
  MJMeetingEntity,
  MJMeetingParticipantEntity,
  MJPhoneNumberEntity,
  MJInteractionEntity,
  MJInteractionEventEntity,
} from '@memberjunction/core-entities';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { SessionManager } from '../agentSessions/SessionManager.js';

import {
  MeetingParticipantType,
  MeetingType,
  MeetingResult,
  StartMeetingResult,
  DialInPhoneNumberType,
  CreateMeetingInput,
  UpdateMeetingInput,
  RSVPMeetingInput,
} from './meetings/meetingTypes.js';
import {
  LoadMeetingEntity,
  LoadParticipants,
  IsUserHostOrCoHost,
  ResolveDefaultPhoneNumber,
  GenerateUniqueDialInCode,
  EnsureMeetingInteraction,
  RecordInteractionEvent,
  CloseMeetingInteraction,
  SendMeetingInviteNotification,
  NormalizeParticipantRole,
  NormalizeRecordingPolicy,
  MapMeetingToType,
  MapParticipantToType,
} from './meetings/meetingHelpers.js';
import {
  ExecuteMyMeetings,
  ExecuteMeeting,
  ExecuteMeetingParticipants,
  ExecuteAvailableDialInPhoneNumbers,
} from './meetings/meetingQueries.js';
import {
  ExecuteCreateMeeting,
  ExecuteUpdateMeeting,
  ExecuteStartMeeting,
  ExecuteEndMeeting,
  ExecuteCancelMeeting,
  ExecuteRSVPMeeting,
  type MeetingHelpers,
} from './meetings/meetingMutations.js';

// Re-export all meeting types and helpers for external consumers
export * from './meetings/index.js';

@Resolver()
export class MeetingResolver extends ResolverBase {
  protected readonly sessionManager = new SessionManager();

  // ── Queries ──────────────────────────────────────────────────────────────────

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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        throw new Error('Database provider is not available.');
      }
      return await ExecuteMyMeetings(provider, user, status);
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        throw new Error('Database provider is not available.');
      }
      return await ExecuteMeeting(provider, user, id);
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        throw new Error('Database provider is not available.');
      }
      return await ExecuteMeetingParticipants(provider, user, meetingID);
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        throw new Error('Database provider is not available.');
      }
      return await ExecuteAvailableDialInPhoneNumbers(provider, user);
    } catch (error) {
      LogError(`[MeetingResolver] AvailableDialInPhoneNumbers failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        return { Success: false, ErrorMessage: 'Database provider is not available.' };
      }
      return await ExecuteCreateMeeting(provider, user, input, this.getHelperOverrides());
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        return { Success: false, ErrorMessage: 'Database provider is not available.' };
      }
      return await ExecuteUpdateMeeting(provider, user, input, this.getHelperOverrides());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] UpdateMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /**
   * Starts a meeting: transitions status to 'Live', creates or connects to the
   * meeting Interaction record, launches configured AI agents, initiates recording
   * if configured as Automatic, and returns a LiveKit client token for the caller.
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        return { Success: false, ErrorMessage: 'Database provider is not available.' };
      }
      return await ExecuteStartMeeting(provider, user, meetingID, this.sessionManager, this.getHelperOverrides());
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        return { Success: false, ErrorMessage: 'Database provider is not available.' };
      }
      return await ExecuteEndMeeting(provider, user, meetingID, this.getHelperOverrides());
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        return { Success: false, ErrorMessage: 'Database provider is not available.' };
      }
      return await ExecuteCancelMeeting(provider, user, meetingID, this.getHelperOverrides());
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
      const provider: IMetadataProvider | null = GetReadWriteProvider(context.providers);
      if (!provider) {
        return { Success: false, ErrorMessage: 'Database provider is not available.' };
      }
      return await ExecuteRSVPMeeting(provider, user, input, this.getHelperOverrides());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingResolver] RSVPMeeting exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  // ── Helper Overrides & Delegations ───────────────────────────────────────────

  protected getHelperOverrides(): Partial<MeetingHelpers> {
    return {
      LoadMeetingEntity: (id, user, provider) => this.loadMeetingEntity(id, user, provider),
      LoadParticipants: (meetingID, user, provider) => this.loadParticipants(meetingID, user, provider),
      IsUserHostOrCoHost: (meeting, user, provider) => this.isUserHostOrCoHost(meeting, user, provider),
      ResolveDefaultPhoneNumber: (user, provider) => this.resolveDefaultPhoneNumber(user, provider),
      GenerateUniqueDialInCode: (phoneNumberID, user, provider) => this.generateUniqueDialInCode(phoneNumberID, user, provider),
      EnsureMeetingInteraction: (meeting, user, provider) => this.ensureMeetingInteraction(meeting, user, provider),
      RecordInteractionEvent: (interactionID, eventType, user, provider, details) =>
        this.recordInteractionEvent(interactionID, eventType, user, provider, details),
      CloseMeetingInteraction: (roomName, user, provider) => this.closeMeetingInteraction(roomName, user, provider),
      SendMeetingInviteNotification: (meeting, targetUserID, contextUser, provider) =>
        this.sendMeetingInviteNotification(meeting, targetUserID, contextUser, provider),
      NormalizeParticipantRole: (roleInput, defaultRole) => this.normalizeParticipantRole(roleInput, defaultRole),
      NormalizeRecordingPolicy: (policyInput) => this.normalizeRecordingPolicy(policyInput),
      MapMeetingToType: (m, participants) => this.mapMeetingToType(m, participants),
      MapParticipantToType: (p, userName, userEmail) => this.mapParticipantToType(p, userName, userEmail),
    };
  }

  protected async loadMeetingEntity(
    id: string,
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<MJMeetingEntity | null> {
    return LoadMeetingEntity(id, user, provider);
  }

  protected async loadParticipants(
    meetingID: string,
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<MeetingParticipantType[]> {
    return LoadParticipants(meetingID, user, provider);
  }

  protected async isUserHostOrCoHost(
    meeting: MJMeetingEntity,
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<boolean> {
    return IsUserHostOrCoHost(meeting, user, provider);
  }

  protected async resolveDefaultPhoneNumber(
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<MJPhoneNumberEntity | null> {
    return ResolveDefaultPhoneNumber(user, provider);
  }

  protected async generateUniqueDialInCode(
    phoneNumberID: string,
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<string | undefined> {
    return GenerateUniqueDialInCode(phoneNumberID, user, provider);
  }

  protected async ensureMeetingInteraction(
    meeting: MJMeetingEntity,
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<MJInteractionEntity | null> {
    return EnsureMeetingInteraction(meeting, user, provider);
  }

  protected async recordInteractionEvent(
    interactionID: string,
    eventType: MJInteractionEventEntity['EventType'],
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
    details?: Record<string, unknown>,
  ): Promise<void> {
    return RecordInteractionEvent(interactionID, eventType, user, provider, details);
  }

  protected async closeMeetingInteraction(
    roomName: string,
    user: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<void> {
    return CloseMeetingInteraction(roomName, user, provider);
  }

  protected async sendMeetingInviteNotification(
    meeting: MJMeetingEntity,
    targetUserID: string,
    contextUser: import('@memberjunction/core').UserInfo,
    provider: IMetadataProvider,
  ): Promise<void> {
    return SendMeetingInviteNotification(meeting, targetUserID, contextUser, provider);
  }

  protected normalizeParticipantRole(
    roleInput?: string,
    defaultRole: MJMeetingParticipantEntity['Role'] = 'Attendee',
  ): MJMeetingParticipantEntity['Role'] {
    return NormalizeParticipantRole(roleInput, defaultRole);
  }

  protected normalizeRecordingPolicy(
    policyInput?: string,
  ): MJMeetingEntity['RecordingPolicy'] {
    return NormalizeRecordingPolicy(policyInput);
  }

  protected mapMeetingToType(m: MJMeetingEntity, participants?: MeetingParticipantType[]): MeetingType {
    return MapMeetingToType(m, participants);
  }

  protected mapParticipantToType(
    p: MJMeetingParticipantEntity,
    userNameFallback?: string | null,
    userEmailFallback?: string | null,
  ): MeetingParticipantType {
    return MapParticipantToType(p, userNameFallback, userEmailFallback);
  }
}
