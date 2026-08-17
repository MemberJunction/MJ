import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, InputType, Field } from 'type-graphql';
import { randomUUID } from 'crypto';
import { LogError, LogStatusEx, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { LiveKitTokenService, LiveKitAgentRoomCoordinator, LiveKitEgressService } from '@memberjunction/livekit-room-server';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { CreateBridgeRealtimeSession, FinalizeBridgeCoAgentRuns, GetRealtimeModelVoices, CreateBridgeRoomTranscriptSink, RealtimeTurnModeratorDecision } from '@memberjunction/ai-agents';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { SessionManager } from '../agentSessions/SessionManager.js';
import { NotificationEngine } from '@memberjunction/notifications';
import { registerMeetingRecordingFile, correlateRecordingStart } from './meetingRecordingRegistration.js';
import { UserHasRealtimeAdvancedSessionControls } from './realtimeAdvancedSessionControls.js';

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
 * Binds the co-agent run finalizer onto the bridge engine (same module-load rationale as the factory above).
 * Lets the engine finalize a session's dangling co-agent observability run when it reaps a bridge WITHOUT a
 * live in-memory session (a prior-boot orphan / cross-host reap) — the one teardown path the agent layer's
 * `Close()`-wrapped finalizer can't reach. Idempotent for clean same-process teardowns.
 */
AIBridgeEngine.Instance.SetSessionRunFinalizer(FinalizeBridgeCoAgentRuns);

/**
 * Binds the unified room-transcript sink onto the bridge engine (same module-load rationale). The engine
 * elects one scribe per LiveKit room and feeds its final transcript lines here; the sink persists them as a
 * single `MJ: Conversations` of `Type='Meeting Room'`, scoped `Application` so it stays OUT of the normal
 * chat list (it surfaces in the Meet app's own view), with one `MJ: Conversation Detail` per utterance. The
 * "Meeting Room"/scope choices live HERE (the Meet composition layer), keeping the engine generic.
 */
AIBridgeEngine.Instance.SetTranscriptSink(
  CreateBridgeRoomTranscriptSink({ ConversationType: 'Meeting Room', ApplicationScope: 'Application', ApplicationName: 'Meet' }),
);

/**
 * Binds the room **turn moderator** onto the bridge engine — **OPT-IN, off by default**. When
 * `MJ_REALTIME_MODERATOR_MODE=on`, a multi-agent room routes each turn through a fast LLM prompt that decides
 * who speaks (see `RealtimeTurnModerator` in `@memberjunction/ai-agents`). By default it's OFF: agents run in
 * plain auto-response, hear everything, and self-moderate (no STT-driven router in the loop) — the
 * coordinator likewise skips meeting mode when the flag is off, so the two stay consistent. We keep the
 * moderator wired-but-toggleable for controlled scenarios (webinars, large rooms, weaker models).
 */
if (process.env.MJ_REALTIME_MODERATOR_MODE === 'on') {
  AIBridgeEngine.Instance.SetTurnModerator(RealtimeTurnModeratorDecision);
  console.log('[RealtimeBridge] turn MODERATOR mode is ON (MJ_REALTIME_MODERATOR_MODE=on) — multi-agent rooms use the LLM router.');
} else {
  // Default mode — only surface this at startup when verbose (MJ_VERBOSE) is on; it's the expected state and otherwise just noise.
  LogStatusEx({ message: '[RealtimeBridge] turn moderator mode is OFF (default) — multi-agent rooms run free-for-all: all agents auto-respond + hear everything.', verboseOnly: true });
}

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

  /**
   * How eagerly this agent takes the floor: `'proactive'` (the default — an ordinary voice) or
   * `'addressed-only'` (a deliberately quiet observer/specialist seat that speaks only when named).
   */
  @Field(() => String, { nullable: true })
  ParticipationMode?: string;

  /**
   * Optional per-session INSTRUCTIONS for this seat — the persona/scenario text that makes it a
   * specific character (a panel of distinct voices instead of N copies of one). The realtime core
   * APPENDS it to the co-agent's companion system prompt; it never replaces the framework's framing
   * or safety text.
   *
   * **AUTHORIZATION-GATED**: caller-supplied prompt content is per-session prompt influence, so it
   * requires the `Realtime: Advanced Session Controls` authorization — the same gate the client-direct
   * `configOverridesJson` sits behind, and this is the stronger knob of the two (that path cannot
   * carry prompt text at all). Unauthorized callers get a structured refusal, never a silent drop;
   * omitting the field is the unchanged, ungated everyday flow.
   */
  @Field(() => String, { nullable: true })
  Instructions?: string;
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

  /**
   * Whether the started seat is **meeting-gated** — the agent's model auto-response is off and it speaks only
   * when addressed. Surfaced because turn discipline was previously only *audible*: an agent that keeps
   * auto-responding in a multi-agent room talks over the whole cast, and nothing in the API said so. `false`
   * is correct for an ordinary solo 1:1 seat, and a failure for a seat that was meant to be gated.
   */
  @Field(() => Boolean, { nullable: true })
  MeetingGated?: boolean;

  /**
   * Whether this seat's realtime provider can change turn mode on a LIVE socket. `false` (e.g. Gemini Live)
   * means gating it costs a session reconnect — which the bridge engine performs automatically.
   */
  @Field(() => Boolean, { nullable: true })
  CanReconfigureTurnMode?: boolean;
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

  /** The `MJ: Files` row id of the registered recording (set on stop, once the egress MP4 is registered). */
  @Field(() => String, { nullable: true })
  RecordingFileID?: string;
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
   *
   * Everything but one field is the plain authenticated flow: supplying `Instructions` (caller-authored
   * text appended to the seat's system prompt) additionally requires the `Realtime: Advanced Session
   * Controls` authorization and is refused with a reason when the caller lacks it.
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

      // PROMPT-INFLUENCE GATE. Caller-supplied Instructions are appended to the seat's system prompt, so
      // they are the same class of privilege as the client-direct `configOverridesJson` and sit behind the
      // same `Realtime: Advanced Session Controls` authorization (one shared, fail-closed check). Refused
      // OUT LOUD rather than dropped: a caller who asked for a persona and silently got the generic voice
      // would have no way to tell — and everything else about the start still looks like it worked.
      const instructions = input.Instructions?.trim() || undefined;
      if (instructions && !UserHasRealtimeAdvancedSessionControls(user, provider, 'StartLiveKitAgentRoomSession')) {
        return failure(
          "Not authorized: per-session agent instructions require the 'Realtime: Advanced Session Controls' " +
            'authorization. Omit Instructions to start the agent with its configured persona.',
          roomName,
        );
      }

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
        ParticipationMode: this.normalizeParticipationMode(input.ParticipationMode),
        // Gated above; the coordinator and the realtime core treat it as pre-authorized from here on.
        Instructions: instructions,
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
        // The seat's effective turn discipline, straight from the engine — so a caller can assert the room is
        // gated instead of listening for an agent talking over everyone.
        MeetingGated: session.MeetingGated,
        CanReconfigureTurnMode: session.CanReconfigureTurnMode,
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
   * **Suspends** one agent so a human can take its seat — the agent stops talking but stays in the room.
   * The half of in-room agent management that {@link StopLiveKitAgentRoomSession} is too blunt for: stopping
   * ends the session, finalizes its co-agent run and severs its recording legs, so handing the seat back
   * would mean a brand-new agent with none of the meeting's history. Suspending keeps the provider socket,
   * the agent session, the transcript persistence and the observability run alive — only the agent's voice
   * is gated off. Pair with {@link ResumeBridgeAgent} to hand the seat back.
   *
   * Deliberately NOT named `*LiveKit*`: it goes straight to the transport-agnostic {@link AIBridgeEngine},
   * so it works for any bridged agent (LiveKit, Zoom, Teams, telephony). Best-effort — an unknown bridge, a
   * provider that cannot gate its model mid-session, or any error resolves `false`.
   *
   * @param sessionBridgeID The `MJ: AI Agent Session Bridges` row id of the agent to suspend.
   */
  @Mutation(() => Boolean)
  async SuspendBridgeAgent(
    @Arg('sessionBridgeID', () => String) sessionBridgeID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<boolean> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return false;
      }
      const suspended = AIBridgeEngine.Instance.SuspendBridgeAgent(sessionBridgeID);
      // A seat takeover is worth an audit line — WHO stepped into the agent's place, not just that someone did.
      LogStatusEx({
        message: `[RealtimeBridge] SuspendBridgeAgent(${sessionBridgeID}) by ${user.Email ?? user.ID} → ${suspended}`,
        verboseOnly: true,
      });
      return suspended;
    } catch (error) {
      LogError(`SuspendBridgeAgent failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * **Resumes** an agent suspended by {@link SuspendBridgeAgent} — the human hands the seat back and the
   * agent responds again behind exactly the turn-taking gate it had before the takeover. It does not grab
   * the floor on resume; it speaks when next addressed. Best-effort: any error resolves `false`.
   *
   * @param sessionBridgeID The `MJ: AI Agent Session Bridges` row id of the agent to resume.
   */
  @Mutation(() => Boolean)
  async ResumeBridgeAgent(
    @Arg('sessionBridgeID', () => String) sessionBridgeID: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<boolean> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return false;
      }
      const resumed = AIBridgeEngine.Instance.ResumeBridgeAgent(sessionBridgeID);
      LogStatusEx({
        message: `[RealtimeBridge] ResumeBridgeAgent(${sessionBridgeID}) by ${user.Email ?? user.ID} → ${resumed}`,
        verboseOnly: true,
      });
      return resumed;
    } catch (error) {
      LogError(`ResumeBridgeAgent failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * **Ends the meeting for everyone**: stops EVERY agent bot bridged into a room (by room name, via the
   * coordinator's server-side roster). This is the "End meeting" half of the Zoom-style leave control —
   * usable by any participant, including one who only *joined* the room and never tracked the bridge ids.
   * Returns `true` when the teardown ran (even if the room held zero agents). Best-effort: any error → `false`.
   *
   * @param roomName The LiveKit room to end.
   */
  @Mutation(() => Boolean)
  async EndLiveKitRoom(
    @Arg('roomName', () => String) roomName: string,
    @Ctx() context: AppContext = {} as AppContext,
  ): Promise<boolean> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return false;
      }
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      await LiveKitAgentRoomCoordinator.Instance.StopAllAgentsInRoom(roomName, 'Explicit', user, provider);
      return true;
    } catch (error) {
      LogError(`EndLiveKitRoom failed: ${error instanceof Error ? error.message : String(error)}`);
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
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'Unable to determine current user.', EgressID: '', Status: '' };
      }
      const info = await new LiveKitEgressService().StartRoomRecording({ RoomName: input.RoomName, Layout: input.Layout });

      // Best-effort: correlate the live recording with the room's Meeting-Room Conversation (if it exists
      // yet) by stamping its EgressID. Never fail the start on this — the stop-flow resolves/creates it.
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;
      void correlateRecordingStart(input.RoomName, info.EgressID, user, provider);

      return { Success: true, EgressID: info.EgressID, Status: info.Status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`StartLiveKitRecording failed: ${msg}`);
      return { Success: false, ErrorMessage: msg, EgressID: '', Status: '' };
    }
  }

  /**
   * Stops a recording by egress id, then REGISTERS the completed egress MP4 into MJStorage as an
   * `MJ: Files` row linked to the room's Meeting-Room Conversation (`Conversation.RecordingFileID`).
   * Registration is best-effort: a missing storage config or any failure returns the stop result with no
   * `RecordingFileID` (the recording still stopped) — it never throws.
   */
  @Mutation(() => LiveKitRecordingResult)
  async StopLiveKitRecording(@Arg('egressID', () => String) egressID: string, @Ctx() context: AppContext = {} as AppContext): Promise<LiveKitRecordingResult> {
    try {
      const user = this.GetUserFromPayload(context.userPayload);
      if (!user) {
        return { Success: false, ErrorMessage: 'Unable to determine current user.', EgressID: egressID, Status: '' };
      }
      const info = await new LiveKitEgressService().StopRecording(egressID);
      const provider = GetReadWriteProvider(context.providers) as unknown as IMetadataProvider;

      // Register the completed egress MP4 as a Files row on the Meeting-Room Conversation. Best-effort:
      // any failure (e.g. storage provider not configured) leaves RecordingFileID unset but still
      // returns the successful stop result.
      const registration = await registerMeetingRecordingFile(
        { EgressID: info.EgressID, RoomName: info.RoomName, OutputLocation: info.OutputLocation, OutputSizeBytes: info.OutputSizeBytes },
        user,
        provider,
      );
      if (!registration.Success) {
        LogError(`StopLiveKitRecording: recording stopped but registration did not complete: ${registration.ErrorMessage ?? 'unknown'}`);
      }

      return { Success: true, EgressID: info.EgressID, Status: info.Status, RecordingFileID: registration.RecordingFileID };
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

  /**
   * Normalizes a participation-mode string to the bridge's accepted values. `undefined` (anything
   * unrecognized included) leaves the coordinator on its `'proactive'` default rather than guessing a
   * quiet seat the caller never asked for.
   */
  private normalizeParticipationMode(mode?: string): 'proactive' | 'addressed-only' | undefined {
    switch ((mode ?? '').toLowerCase()) {
      case 'proactive':
        return 'proactive';
      case 'addressed-only':
        return 'addressed-only';
      default:
        return undefined;
    }
  }
}
