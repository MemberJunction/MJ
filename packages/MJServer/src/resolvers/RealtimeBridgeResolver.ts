import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, InputType, Field } from 'type-graphql';
import { randomUUID } from 'crypto';
import { LogError, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { LiveKitTokenService, LiveKitAgentRoomCoordinator, LiveKitEgressService } from '@memberjunction/livekit-room-server';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { CreateBridgeRealtimeSession, GetRealtimeModelVoices } from '@memberjunction/ai-agents';
import { SessionManager } from '../agentSessions/SessionManager.js';
import { NotificationEngine } from '@memberjunction/notifications';

/**
 * Binds the agent realtime-session factory onto the LiveKit room coordinator's model-session creation seam.
 * Module-load side effect — it runs when MJServer builds its GraphQL schema (which imports this resolver),
 * so `StartLiveKitAgentRoomSession` can open a real model session. `@memberjunction/server` is the natural
 * home for the binding: it is the one package that depends on BOTH `@memberjunction/ai-agents` (the factory)
 * and `@memberjunction/livekit-room-server` (the coordinator), keeping each of those decoupled from the
 * other. Idempotent (latest-wins).
 */
LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(CreateBridgeRealtimeSession);

/**
 * GraphQL surface for the MJ-native LiveKit room: mints scoped client access tokens and starts an
 * agent's presence in a room. The thin resolver delegates to `@memberjunction/livekit-room-server`
 * (token service + session-start coordinator) per the Transport-Layer Architecture — no LiveKit logic
 * lives here.
 *
 * `MintLiveKitClientToken` is fully functional given LiveKit credentials. `StartLiveKitAgentRoomSession`
 * opens a real agent model session via the realtime-session factory bound above (the agent must have an
 * Active `Realtime` model + a vendor with a resolvable API key), then bridges it into the room through the
 * coordinator. The native room media client (`@memberjunction/ai-bridge-livekit-native` /
 * `@livekit/rtc-node`) must be installed on the agent host for the bot's audio to flow.
 */

@InputType()
export class MintLiveKitClientTokenInput {
  @Field(() => String)
  RoomName: string;

  @Field(() => String, { nullable: true })
  DisplayName?: string;
}

@ObjectType()
export class LiveKitClientTokenResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => String)
  ServerUrl: string;

  @Field(() => String)
  Token: string;

  @Field(() => String)
  Identity: string;

  @Field(() => String)
  RoomName: string;
}

@InputType()
export class StartLiveKitAgentRoomSessionInput {
  @Field(() => String, { nullable: true })
  AgentID?: string;

  @Field(() => String, { nullable: true })
  AgentName?: string;

  /** The TARGET agent the co-agent voices (the one being "called") — the Realtime Co-Agent delegates to it. */
  @Field(() => String, { nullable: true })
  TargetAgentID?: string;

  /** Optional per-session Realtime MODEL override (Name or ID) — a dev choosing the model for this agent. */
  @Field(() => String, { nullable: true })
  RealtimeModelID?: string;

  /** Optional per-session VOICE override (provider-native voice id) — gives this agent a distinct voice. */
  @Field(() => String, { nullable: true })
  RealtimeVoice?: string;

  @Field(() => String, { nullable: true })
  RoomName?: string;

  @Field(() => String, { nullable: true })
  AgentSessionID?: string;

  @Field(() => String, { nullable: true })
  TurnMode?: string;
}

@ObjectType()
export class LiveKitAgentRoomSessionResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => String)
  SessionBridgeID: string;

  @Field(() => String)
  RoomName: string;

  @Field(() => String)
  ServerUrl: string;

  @Field(() => String)
  ClientToken: string;

  @Field(() => String)
  Identity: string;
}

@InputType()
export class LiveKitRecordingInput {
  @Field(() => String)
  RoomName: string;

  @Field(() => String, { nullable: true })
  Layout?: string;
}

@ObjectType()
export class LiveKitRecordingResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => String)
  EgressID: string;

  @Field(() => String)
  Status: string;
}

/** A selectable provider-native voice for the dev voice picker. */
@ObjectType()
export class RealtimeVoiceOptionResult {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  Name: string;
}

/** An active Realtime model with the voices its driver supports — feeds the dev model/voice picker. */
@ObjectType()
export class RealtimeModelVoicesResult {
  @Field(() => String)
  ModelID: string;

  @Field(() => String)
  ModelName: string;

  @Field(() => [RealtimeVoiceOptionResult])
  Voices: RealtimeVoiceOptionResult[];
}

@Resolver()
export class RealtimeBridgeResolver extends ResolverBase {
  /** Durable `AIAgentSession` record manager — creates the session row the bridge FK-references. */
  private readonly sessionManager = new SessionManager();

  /**
   * Mints a scoped LiveKit access token for the current user to join the given room. The participant
   * identity is derived server-side from the authenticated user (never trusted from the client).
   */
  @Mutation(() => LiveKitClientTokenResult)
  async MintLiveKitClientToken(
    @Arg('input', () => MintLiveKitClientTokenInput) input: MintLiveKitClientTokenInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<LiveKitClientTokenResult> {
    const failure = (msg: string): LiveKitClientTokenResult => ({
      Success: false,
      ErrorMessage: msg,
      ServerUrl: '',
      Token: '',
      Identity: '',
      RoomName: input.RoomName,
    });
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return failure('Unable to determine current user.');
      }
      const tokenService = new LiveKitTokenService();
      const minted = await tokenService.MintClientToken(input.RoomName, this.participantIdentity(user), input.DisplayName ?? user.Name ?? user.Email);
      return { Success: true, ...minted };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`MintLiveKitClientToken failed: ${msg}`);
      return failure(msg);
    }
  }

  /**
   * Starts (or reuses) an agent's presence in a LiveKit room and returns a client token so the calling
   * user can immediately join the same room.
   */
  @Mutation(() => LiveKitAgentRoomSessionResult)
  async StartLiveKitAgentRoomSession(
    @Arg('input', () => StartLiveKitAgentRoomSessionInput) input: StartLiveKitAgentRoomSessionInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<LiveKitAgentRoomSessionResult> {
    const failure = (msg: string, roomName = ''): LiveKitAgentRoomSessionResult => ({
      Success: false,
      ErrorMessage: msg,
      SessionBridgeID: '',
      RoomName: roomName,
      ServerUrl: '',
      ClientToken: '',
      Identity: '',
    });
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return failure('Unable to determine current user.');
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      const roomName = input.RoomName?.trim() || `mj-${randomUUID()}`;

      // Resolve the AIAgentSession the bridge will reference. The bridge row FK-references
      // AIAgentSession(ID), so we must use an EXISTING session — either one the caller supplied, or a
      // freshly-created one. Previously this minted a bare random UUID with no backing row, so the
      // bridge INSERT failed the FK_AIAgentSessionBridge_Session constraint.
      let agentSessionID = input.AgentSessionID?.trim();
      if (!agentSessionID) {
        if (!input.AgentID?.trim()) {
          return failure('An AgentID is required to start an agent room session.', roomName);
        }
        const createdSession = await this.sessionManager.CreateSession(
          { agentID: input.AgentID.trim(), userID: user.ID },
          user,
          provider,
        );
        agentSessionID = createdSession.ID;
      }

      const session = await LiveKitAgentRoomCoordinator.Instance.StartAgentRoomSession({
        AgentSessionID: agentSessionID,
        RoomName: roomName,
        AgentID: input.AgentID,
        AgentName: input.AgentName,
        TargetAgentID: input.TargetAgentID,
        RealtimeModelID: input.RealtimeModelID,
        RealtimeVoice: input.RealtimeVoice,
        TurnMode: this.normalizeTurnMode(input.TurnMode),
        ContextUser: user,
        MetadataProvider: provider,
      });

      const tokenService = new LiveKitTokenService();
      const clientToken = await tokenService.MintClientToken(roomName, this.participantIdentity(user), user.Name ?? user.Email);

      return {
        Success: true,
        SessionBridgeID: session.SessionBridgeID,
        RoomName: session.RoomName,
        ServerUrl: session.ServerUrl,
        ClientToken: clientToken.Token,
        Identity: clientToken.Identity,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`StartLiveKitAgentRoomSession failed: ${msg}`);
      return failure(msg, input.RoomName ?? '');
    }
  }

  /**
   * Stops one agent's presence in a room (the bot leaves) — the remove half of in-room agent management.
   * Identified by the `SessionBridgeID` returned from {@link StartLiveKitAgentRoomSession}. Returns `true`
   * when the bridge was stopped. Best-effort: a missing/already-stopped bridge or any error resolves `false`.
   *
   * @param sessionBridgeID The `MJ: AI Agent Session Bridges` row id of the agent to remove.
   */
  @Mutation(() => Boolean)
  async StopLiveKitAgentRoomSession(
    @Arg('sessionBridgeID', () => String) sessionBridgeID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<boolean> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return false;
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      return await LiveKitAgentRoomCoordinator.Instance.StopAgentRoomSession(sessionBridgeID, 'Explicit', user, provider);
    } catch (error) {
      LogError(`StopLiveKitAgentRoomSession failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Lists active Realtime models with the voices each driver supports — the source for the dev model/voice
   * picker (gated client-side by the `Realtime: Advanced Session Controls` authorization). Read-only; returns
   * an empty list on any error so the picker degrades gracefully to "no overrides".
   */
  @Query(() => [RealtimeModelVoicesResult])
  async GetRealtimeModelVoices(
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<RealtimeModelVoicesResult[]> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return [];
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      return await GetRealtimeModelVoices(user, provider);
    } catch (error) {
      LogError(`GetRealtimeModelVoices failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Invites MJ users to a live room: for each user, sends a **"Live Room Invite"** notification via the
   * unified {@link NotificationEngine} — which writes the in-app notification (clickable → joins the room
   * via the `meet-room` ResourceConfiguration) and ALSO delivers over MJ Comms (email/SMS) when the type's
   * channels + a provider are configured. Best-effort: Comms not being set up never blocks the in-app
   * notification, and a missing "Live Room Invite" type (seed not yet pushed) is caught and returns false.
   *
   * @param roomName The LiveKit room the invitees should join.
   * @param userIDs The `MJ: Users` ids to invite.
   * @returns `true` when at least one invite was delivered.
   */
  @Mutation(() => Boolean)
  async InviteUsersToLiveKitRoom(
    @Arg('roomName', () => String) roomName: string,
    @Arg('userIDs', () => [String]) userIDs: string[],
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<boolean> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return false;
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      await NotificationEngine.Instance.Config(false, user, provider);

      const inviter = user.Name?.trim() || user.Email || 'Someone';
      let anyDelivered = false;
      for (const userId of userIDs ?? []) {
        if (!userId?.trim()) {
          continue;
        }
        const result = await NotificationEngine.Instance.SendNotification(
          {
            userId,
            typeNameOrId: 'Live Room Invite',
            title: `${inviter} invited you to a live room`,
            message: `${inviter} is inviting you to join a live Meet room. Open this notification to join.`,
            resourceConfiguration: { type: 'meet-room', room: roomName },
          },
          user,
        );
        anyDelivered = anyDelivered || result.success;
      }
      return anyDelivered;
    } catch (error) {
      LogError(`InviteUsersToLiveKitRoom failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Starts recording (composite egress) of a room. Server-authorized — the browser never holds egress
   * credentials.
   */
  @Mutation(() => LiveKitRecordingResult)
  async StartLiveKitRecording(
    @Arg('input', () => LiveKitRecordingInput) input: LiveKitRecordingInput,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<LiveKitRecordingResult> {
    try {
      if (!this.GetUserFromPayload(context.userPayload)) {
        return { Success: false, ErrorMessage: 'Unable to determine current user.', EgressID: '', Status: '' };
      }
      const info = await new LiveKitEgressService().StartRoomRecording({ RoomName: input.RoomName, Layout: input.Layout });
      return { Success: true, EgressID: info.EgressID, Status: info.Status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`StartLiveKitRecording failed: ${msg}`);
      return { Success: false, ErrorMessage: msg, EgressID: '', Status: '' };
    }
  }

  /** Stops a recording by egress id. */
  @Mutation(() => LiveKitRecordingResult)
  async StopLiveKitRecording(@Arg('egressID', () => String) egressID: string, @Ctx() context: AppContext = {} as AppContext): Promise<LiveKitRecordingResult> {
    try {
      if (!this.GetUserFromPayload(context.userPayload)) {
        return { Success: false, ErrorMessage: 'Unable to determine current user.', EgressID: egressID, Status: '' };
      }
      const info = await new LiveKitEgressService().StopRecording(egressID);
      return { Success: true, EgressID: info.EgressID, Status: info.Status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`StopLiveKitRecording failed: ${msg}`);
      return { Success: false, ErrorMessage: msg, EgressID: egressID, Status: '' };
    }
  }

  /** Builds a stable, lowercased participant identity from the authenticated user. */
  private participantIdentity(user: UserInfo): string {
    return `user-${user.ID}`.toLowerCase();
  }

  /** Normalizes a turn-mode string to the bridge's accepted values. */
  private normalizeTurnMode(mode?: string): 'Passive' | 'Active' | 'Hybrid' | undefined {
    switch ((mode ?? '').toLowerCase()) {
      case 'active':
        return 'Active';
      case 'hybrid':
        return 'Hybrid';
      case 'passive':
        return 'Passive';
      default:
        return undefined;
    }
  }
}
