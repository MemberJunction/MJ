import { Resolver, Mutation, Arg, Ctx, ObjectType, InputType, Field } from 'type-graphql';
import { randomUUID } from 'crypto';
import { LogError, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { LiveKitTokenService, LiveKitAgentRoomCoordinator, LiveKitEgressService } from '@memberjunction/livekit-room-server';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import { SessionManager } from '../agentSessions/SessionManager.js';

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
