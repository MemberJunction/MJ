/**
 * @fileoverview {@link LiveKitAgentRoomCoordinator} — the server-side **session-start harness** for the
 * MJ-native LiveKit room (§1 of the realtime-bridge buildout plan). Given an agent + a room, it:
 *   1. mints the agent bot's scoped LiveKit token ({@link LiveKitTokenService}),
 *   2. opens the realtime model session via an injectable {@link RealtimeSessionFactory} seam, and
 *   3. bridges that session into the room through {@link AIBridgeEngine.StartBridgeSession} (which wires
 *      the transport seam + turn-taking automatically).
 *
 * The realtime-session factory is a seam (mirroring `LiveKitBridge.SetSdkFactory`): production binds it to
 * the real model-resolution path (`@memberjunction/ai-agents`), and tests/de-risk inject a stub session.
 * This keeps the coordinator free of heavy agent-runtime coupling while still owning the orchestration.
 *
 * @module @memberjunction/livekit-room-server
 */

import { BaseSingleton } from '@memberjunction/global';
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { IRealtimeSession } from '@memberjunction/ai';
import { AlwaysAddressedMatcher, RegexAddressedMatcher, type BridgeDisconnectReason, type BridgeTurnMode } from '@memberjunction/ai-bridge-base';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { LiveKitTokenService } from './livekit-token-service';

/** The subset of {@link AIBridgeEngine} the coordinator drives — an injectable seam for unit testing. */
export type BridgeOps = Pick<
  AIBridgeEngine,
  | 'Config'
  | 'ProviderByDriverClass'
  | 'StartBridgeSession'
  | 'StopBridgeSession'
  | 'EnsureSessionMeetingGated'
  | 'GetEffectiveTurnState'
>;

/** The `DriverClass` the LiveKit bridge registers under (must match the `MJ: AI Bridge Providers` row). */
export const LIVEKIT_BRIDGE_DRIVER_CLASS = 'LiveKitBridge';

/** Context passed to the realtime-session factory when starting an agent room session. */
export interface RealtimeSessionStartContext {
  /** The agent to voice in the room, when known. */
  AgentID?: string;
  /** The agent's display name (used for the bot name + turn-taking matcher). */
  AgentName?: string;
  /** The TARGET agent the co-agent voices via `invoke-target-agent` (the one being "called"). */
  TargetAgentID?: string;
  /** Optional per-session Realtime MODEL override (Name or ID). */
  RealtimeModelID?: string;
  /** Optional per-session VOICE override (provider-native voice id). */
  RealtimeVoice?: string;
  /** The room being joined. */
  RoomName: string;
  /** The user the session runs as. */
  ContextUser?: UserInfo;
  /** The metadata provider for the session. */
  MetadataProvider?: IMetadataProvider;
  /** The MJ agent-session id — threaded into the co-agent observability run for session grouping. */
  AgentSessionID?: string;
  /**
   * Multi-agent meeting mode — set when the agent joins a room that already has agents. Flows to the
   * realtime session so its model's auto-response is disabled (speaks only when addressed).
   */
  MeetingMode?: boolean;
  /** The names the agent answers to (display name + aliases) — phrasing for the meeting prompt. */
  SelfNames?: string[];
  /**
   * Optional per-session INSTRUCTIONS — the persona/scenario text for THIS seat, **appended to** the
   * co-agent's companion system prompt by the realtime core (never a replacement, so the framework's
   * framing and safety text always survive). See `BridgeRealtimeSessionContext.Instructions`.
   */
  Instructions?: string;
}

/**
 * Opens a realtime model session for the agent. Production binds this to the real model-resolution path;
 * tests inject a stub. Defaults to a clear "not bound" error so misconfiguration fails loudly.
 */
export type RealtimeSessionFactory = (ctx: RealtimeSessionStartContext) => Promise<IRealtimeSession>;

/** Parameters for {@link LiveKitAgentRoomCoordinator.StartAgentRoomSession}. */
export interface StartAgentRoomSessionParams {
  /** The MJ agent-session id this bridge belongs to. */
  AgentSessionID: string;
  /** The LiveKit room the agent should join. */
  RoomName: string;
  /** The agent to voice, when known. */
  AgentID?: string;
  /** The agent's display name (bot name + addressing). */
  AgentName?: string;
  /**
   * The TARGET agent the co-agent voices (the one being "called"). Passed through to the realtime
   * session factory so the Realtime Co-Agent has someone to delegate to via `invoke-target-agent`.
   */
  TargetAgentID?: string;
  /** Optional per-session Realtime MODEL override (Name or ID) — wins over the co-agent config preference. */
  RealtimeModelID?: string;
  /** Optional per-session VOICE override (provider-native voice id) — gives this agent a distinct voice. */
  RealtimeVoice?: string;
  /** Extra aliases the agent answers to (for Passive turn-taking). */
  AgentAliases?: string[];
  /** Turn-taking mode. Default: `'Passive'` (speak only when addressed). */
  TurnMode?: BridgeTurnMode;
  /**
   * How eagerly this agent takes the floor. `'proactive'` (the default) is an ordinary voice: it
   * auto-responds when alone and the room moderator may bring it in unaddressed in a meeting.
   * `'addressed-only'` is a deliberately QUIET seat — an observer/specialist that stays silent until
   * someone says one of its names — and it is gated that way in a meeting AND when it is the room's only
   * agent (see {@link StartAgentRoomSession}).
   */
  ParticipationMode?: 'proactive' | 'addressed-only';
  /**
   * Optional per-session INSTRUCTIONS for this seat — persona/scenario text **appended to** the
   * co-agent's companion system prompt (never replacing it). This is what lets a room hold a PANEL of
   * distinct characters rather than N copies of the same generic co-agent voice; the model/voice
   * overrides above only make them SOUND different. Passed straight through to the realtime session
   * factory. **Pre-authorized by the caller** — the MJServer resolver gates it behind the
   * `Realtime: Advanced Session Controls` authorization. Omitted ⇒ today's behavior exactly.
   */
  Instructions?: string;
  /** The user the session runs as. */
  ContextUser?: UserInfo;
  /** The metadata provider for the session. */
  MetadataProvider?: IMetadataProvider;
}

/** One agent's membership in a room's roster (for multi-agent meeting detection). */
interface RoomAgentEntry {
  /** The MJ agent-session id of this agent in the room. */
  AgentSessionID: string;
  /** The durable bridge row id — the key {@link LiveKitAgentRoomCoordinator.StopAgentRoomSession} removes by. */
  SessionBridgeID: string;
  /** The names this agent answers to (display name + aliases) — used to build its addressing matcher. */
  Names: string[];
}

/** The result of starting an agent room session. */
export interface AgentRoomSession {
  /** The durable `MJ: AI Agent Session Bridges` row id. */
  SessionBridgeID: string;
  /** The room the agent joined. */
  RoomName: string;
  /** The LiveKit server URL. */
  ServerUrl: string;
  /**
   * Whether this seat ended up **meeting-gated** — model auto-response off + addressed-only. Reported so a
   * caller can ASSERT the turn discipline it asked for instead of discovering by ear that an agent is
   * answering everything. `false` for an ordinary solo 1:1 seat (correct), and `false` for a seat that was
   * *supposed* to be gated but couldn't be (a failure — the engine logs why).
   */
  MeetingGated: boolean;
  /**
   * Whether this seat's realtime provider can change turn mode on a live socket. `false` (Gemini Live) means
   * gating it costs a reconnect — see `AIBridgeEngine.EnsureSessionMeetingGated`.
   */
  CanReconfigureTurnMode: boolean;
}

/**
 * Coordinates starting (and stopping) an agent's presence in a LiveKit room. A process-wide singleton
 * (per MJ convention) so deployment code can bind the realtime-session factory once at startup and the
 * GraphQL resolver can use the same bound instance.
 */
export class LiveKitAgentRoomCoordinator extends BaseSingleton<LiveKitAgentRoomCoordinator> {
  private tokenService: LiveKitTokenService = new LiveKitTokenService();

  /**
   * Per-room roster of the agents currently bridged in (keyed by lowercased room name). Drives
   * **multi-agent meeting detection**: when an agent joins a room that ALREADY holds an agent, the new
   * agent starts in meeting mode (auto-response off + addressed-only) so several agents can share a room
   * without all answering every utterance. The agents already in the room are gated too, retroactively —
   * on their live socket where the provider allows it, otherwise by re-opening the session in meeting mode
   * (`AIBridgeEngine.EnsureSessionMeetingGated`). See `plans/realtime/multi-agent-meeting-turn-taking.md`.
   */
  private roomRosters = new Map<string, RoomAgentEntry[]>();
  private bridgeOps: BridgeOps = AIBridgeEngine.Instance;
  private sessionFactory: RealtimeSessionFactory = () => {
    throw new Error(
      'LiveKitAgentRoomCoordinator has no realtime-session factory bound. Call SetSessionFactory(...) ' +
        'with a factory that resolves a BaseRealtimeModel and returns an IRealtimeSession (see @memberjunction/ai-agents), ' +
        'or inject a stub session in tests/de-risk runs.',
    );
  };

  /** BaseSingleton requires a protected constructor. */
  protected constructor() {
    super();
  }

  /** The process-wide coordinator instance. */
  public static get Instance(): LiveKitAgentRoomCoordinator {
    return super.getInstance<LiveKitAgentRoomCoordinator>();
  }

  /**
   * Binds the realtime-session factory (the model-session creation seam).
   *
   * @param factory The factory that opens an {@link IRealtimeSession} for an agent.
   */
  public SetSessionFactory(factory: RealtimeSessionFactory): void {
    this.sessionFactory = factory;
  }

  /**
   * Overrides the token service used to mint the bot token (e.g. to inject explicit credentials).
   *
   * @param service The token service to use.
   */
  public SetTokenService(service: LiveKitTokenService): void {
    this.tokenService = service;
  }

  /**
   * Overrides the bridge operations used to resolve the provider + start/stop the bridge session (the
   * injectable {@link AIBridgeEngine} seam — primarily for unit testing).
   *
   * @param ops The bridge operations to use.
   */
  public SetBridgeOps(ops: BridgeOps): void {
    this.bridgeOps = ops;
  }

  /**
   * Starts the agent's presence in a LiveKit room: mints the bot token, opens the realtime session, and
   * bridges it into the room.
   *
   * @param params The session parameters.
   * @returns The active session handles.
   * @throws {Error} when the LiveKit provider is not configured/registered or the session factory is unbound.
   */
  public async StartAgentRoomSession(params: StartAgentRoomSessionParams): Promise<AgentRoomSession> {
    await this.bridgeOps.Config(false, params.ContextUser, params.MetadataProvider);
    const provider = this.bridgeOps.ProviderByDriverClass(LIVEKIT_BRIDGE_DRIVER_CLASS);
    if (!provider) {
      throw new Error(
        `No active 'MJ: AI Bridge Providers' row with DriverClass='${LIVEKIT_BRIDGE_DRIVER_CLASS}' was found. ` +
          'Seed/activate the LiveKit provider row before starting a room session.',
      );
    }

    const botName = params.AgentName ?? 'Agent';
    const botIdentity = `agent-${params.AgentSessionID}`;
    const botToken = await this.tokenService.MintBotToken(params.RoomName, botIdentity, botName);

    // Multi-agent MEETING detection: if the room already holds an agent, THIS agent joins as a meeting
    // participant — auto-response OFF, speaks only when addressed by name. When a room becomes multi-agent
    // the agents ALREADY in it are retroactively gated too, reconnecting them if that's what their provider
    // requires (see below). The names the agent answers to drive both its addressing matcher (the GATE) and
    // the meeting prompt phrasing.
    const roomKey = params.RoomName.trim().toLowerCase();
    const selfNames = [botName, ...(params.AgentAliases ?? [])].map(n => n.trim()).filter(n => n.length > 0);
    const existingAgents = this.roomRosters.get(roomKey) ?? [];
    // MODERATOR MODE is OPT-IN (off by default). When OFF (the default / "free-for-all" mode), a multi-agent
    // room is NOT a gated "meeting": every agent stays in plain auto-response, hears all room audio (humans +
    // agents), and decides for itself when to speak — the model's own judgment + barge-in do the turn-taking,
    // with no STT-driven moderator in the loop. Flip MJ_REALTIME_MODERATOR_MODE=on to re-enable the moderator
    // (gated meeting mode + LLM router) for controlled scenarios (webinars, large rooms, weaker models).
    const moderatorMode = process.env.MJ_REALTIME_MODERATOR_MODE === 'on';
    const isMeeting = moderatorMode && existingAgents.length > 0;
    // A caller can also ask for a QUIET seat outright (`'addressed-only'` — an observer/specialist that
    // speaks only when called by name). That request has to hold even when the agent is ALONE in the room:
    // gating it on roster size would leave it auto-responding to every utterance until a second agent
    // happened to join — the same "why is it talking?" surprise meeting detection exists to prevent. So
    // `gated` (not `isMeeting`) is what drives the addressing matcher, the model's auto-response, and the
    // meeting prompt phrasing below. Omitting ParticipationMode leaves behavior exactly as before.
    const participationMode = params.ParticipationMode ?? 'proactive';
    const gated = isMeeting || participationMode === 'addressed-only';

    // The identity half of the factory context — everything that does NOT depend on how the seat is gated.
    // Held as one value because this agent's session may be minted TWICE: once now, and again in meeting mode
    // if the room later becomes multi-agent and this provider can't be reconfigured on a live socket (see the
    // reopen hook below). Both mints must describe the same agent, model, voice and AgentSession — deriving
    // them twice is how the second session quietly becomes a different agent.
    const sessionIdentity: RealtimeSessionStartContext = {
      AgentID: params.AgentID,
      AgentName: params.AgentName,
      TargetAgentID: params.TargetAgentID,
      RealtimeModelID: params.RealtimeModelID,
      RealtimeVoice: params.RealtimeVoice,
      RoomName: params.RoomName,
      ContextUser: params.ContextUser,
      MetadataProvider: params.MetadataProvider,
      // So the co-agent observability run groups under THIS agent session (parity with native chat).
      AgentSessionID: params.AgentSessionID,
      // The seat's persona text (appended to the companion prompt, never replacing it). It belongs to the
      // IDENTITY half precisely because of the re-mint: a re-opened session that dropped it would come back
      // as a different character mid-meeting — the loudest possible version of the drift this value prevents.
      Instructions: params.Instructions,
    };

    const session = await this.sessionFactory({
      ...sessionIdentity,
      MeetingMode: gated || undefined,
      SelfNames: gated ? selfNames : undefined,
    });

    const active = await this.bridgeOps.StartBridgeSession({
      AgentSessionID: params.AgentSessionID,
      AgentID: params.AgentID,
      Provider: provider,
      RealtimeSession: session,
      Address: botToken.ServerUrl,
      JoinMethod: 'OnDemand',
      TurnMode: params.TurnMode ?? 'Passive',
      // Gated (a meeting, or an explicitly addressed-only seat): limit speech to ADDRESSED turns
      // (RegexAddressedMatcher on the agent's names) AND tell the engine the model's auto-response is off so
      // the bridge becomes the sole trigger. Otherwise (a proactive solo 1:1): respond to ALL the user's
      // speech (AlwaysAddressedMatcher) with the model's own auto-response — Passive's name-match would
      // leave a single agent silent unless you said its name each turn.
      TurnMatcher: gated ? new RegexAddressedMatcher(selfNames) : new AlwaysAddressedMatcher(),
      DisableAutoResponse: gated || undefined,
      // How the engine re-gates THIS agent if the room becomes multi-agent later and its provider fixes turn
      // config at connect (Gemini Live): it can't be reconfigured on a live socket, so it has to be re-opened
      // in meeting mode. The engine owns that decision — it holds the live session and the capability flag —
      // but it deliberately doesn't own the session factory, so we hand it the one thing only we can supply:
      // a closure that re-mints THIS agent's session, meeting-gated. Passing a callback down beats exposing
      // the factory up: the engine's interface grows by one optional field and the capability decision stays
      // in exactly one place instead of being re-derived out here.
      ReopenInMeetingMode: () => this.sessionFactory({ ...sessionIdentity, MeetingMode: true, SelfNames: selfNames }),
      // Roster info for the room turn moderator (the LLM router, when one is wired via SetTurnModerator):
      // the names it answers to + its participation style. `'proactive'` (the default) lets the moderator
      // bring it in unaddressed when relevant; `'addressed-only'` keeps it out of every turn it wasn't
      // named in.
      AgentNames: selfNames,
      ParticipationMode: participationMode,
      // The voiced TARGET agent (e.g. Sage) — the moderator resolves its role + per-agent turnTaking.mode.
      TargetAgentID: params.TargetAgentID,
      // NativeModuleSpecifier tells LiveKitNativeMeetingSdk which native room-client wrapper to load — the
      // @livekit/rtc-node-backed @memberjunction/ai-bridge-livekit-native by default, overridable via env
      // (e.g. a one-line module setting Gemini's 16 kHz inbound rate). AccessToken is the pre-signed bot
      // join token; the room ws URL arrives as `Address`.
      Configuration: {
        AccessToken: botToken.Token,
        BotDisplayName: botName,
        RoomName: params.RoomName,
        NativeModuleSpecifier: this.resolveNativeModuleSpecifier(),
      },
      ContextUser: params.ContextUser,
      MetadataProvider: params.MetadataProvider,
    });

    this.addToRoster(roomKey, { AgentSessionID: params.AgentSessionID, SessionBridgeID: active.SessionBridgeID, Names: selfNames });

    // The room just became (or stayed) multi-agent → retroactively gate the agents already in it into meeting
    // mode so the whole room takes turns, not just the newcomers. `EnsureSessionMeetingGated` reconfigures the
    // live socket where the provider allows it and RE-OPENS the session in meeting mode where it doesn't
    // (Gemini) — so a room whose first agent runs a fixed-config provider is gated too, instead of that agent
    // auto-responding over everyone. Idempotent; awaited so room formation completes with the room gated.
    if (isMeeting) {
      const gatedResults = await Promise.all(
        existingAgents.map(async (agent) => ({
          agent,
          ok: await this.bridgeOps.EnsureSessionMeetingGated(agent.SessionBridgeID, new RegexAddressedMatcher(agent.Names)),
        })),
      );
      const ungated = gatedResults.filter((r) => !r.ok).map((r) => r.agent.SessionBridgeID);
      if (ungated.length > 0) {
        // The engine already logged WHY each one failed; this says what it means for the room, which is the
        // part an operator watching a call needs: some seat in here will talk over the others.
        LogError(
          `[LiveKitAgentRoomCoordinator] room ${params.RoomName} is NOT fully meeting-gated — ` +
            `${ungated.length} of ${existingAgents.length} existing agent(s) could not be gated ` +
            `(bridges: ${ungated.join(', ')}). Expect them to respond to all room audio.`,
        );
      }
    }

    // Three distinguishable seats, because "why is/isn't it talking?" is the first question an operator asks.
    const seat = isMeeting ? 'MEETING — addressed-only' : gated ? 'solo — addressed-only (requested)' : 'solo 1:1';
    LogStatus(
      `[LiveKitAgentRoomCoordinator] Agent ${botName} bridged into LiveKit room ${params.RoomName} ` +
        `(bridge ${active.SessionBridgeID}, ${seat})`,
    );
    // The seat's EFFECTIVE gate, read back from the engine rather than re-derived from `gated` here: the two
    // can legitimately differ (a provider that had to be re-opened, a gate that failed), and the whole point
    // of surfacing it is that callers can assert what the seat is actually doing.
    const turnState = this.bridgeOps.GetEffectiveTurnState(active.SessionBridgeID);
    return {
      SessionBridgeID: active.SessionBridgeID,
      RoomName: params.RoomName,
      ServerUrl: botToken.ServerUrl,
      MeetingGated: turnState?.MeetingGated ?? false,
      CanReconfigureTurnMode: turnState?.CanReconfigureTurnMode ?? false,
    };
  }

  /** Appends an agent to a room's roster (creating the room's list on first join). */
  private addToRoster(roomKey: string, entry: RoomAgentEntry): void {
    const roster = this.roomRosters.get(roomKey);
    if (roster) {
      roster.push(entry);
    } else {
      this.roomRosters.set(roomKey, [entry]);
    }
  }

  /** Removes an agent from whatever room roster holds its bridge id; prunes the room when it empties. */
  private removeFromRoster(sessionBridgeID: string): void {
    for (const [roomKey, roster] of this.roomRosters) {
      const next = roster.filter(e => e.SessionBridgeID !== sessionBridgeID);
      if (next.length === roster.length) {
        continue;
      }
      if (next.length === 0) {
        this.roomRosters.delete(roomKey);
      } else {
        this.roomRosters.set(roomKey, next);
      }
      return;
    }
  }

  /** The default native room-client wrapper specifier — the @livekit/rtc-node package this repo ships. */
  private static readonly DEFAULT_NATIVE_MODULE = '@memberjunction/ai-bridge-livekit-native';

  /**
   * Resolves the native LiveKit room-client module specifier for the bridge session. Prefers the
   * `LIVEKIT_NATIVE_MODULE` env override (e.g. a deployment's custom-sample-rate wrapper), else the default
   * {@link DEFAULT_NATIVE_MODULE}. Overridable in tests via {@link SetNativeModuleSpecifier}.
   */
  private resolveNativeModuleSpecifier(): string {
    return (
      this.nativeModuleSpecifierOverride ??
      process.env.LIVEKIT_NATIVE_MODULE ??
      LiveKitAgentRoomCoordinator.DEFAULT_NATIVE_MODULE
    );
  }

  /**
   * Overrides the native room-client module specifier (primarily for unit testing — production resolves it
   * from env / the default).
   *
   * @param specifier The module specifier to use, or `undefined` to clear the override.
   */
  public SetNativeModuleSpecifier(specifier: string | undefined): void {
    this.nativeModuleSpecifierOverride = specifier;
  }

  /** Test/deployment override for the native module specifier (see {@link resolveNativeModuleSpecifier}). */
  private nativeModuleSpecifierOverride?: string;

  /**
   * Stops an agent room session (the bot leaves the room).
   *
   * @param sessionBridgeID The bridge row id returned from {@link StartAgentRoomSession}.
   * @param reason Why the session is stopping. Default: `'Explicit'`.
   * @param contextUser The acting user.
   * @param provider The metadata provider.
   */
  public async StopAgentRoomSession(
    sessionBridgeID: string,
    reason: BridgeDisconnectReason = 'Explicit',
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<boolean> {
    try {
      return await this.bridgeOps.StopBridgeSession(sessionBridgeID, reason, contextUser, provider);
    } catch (err) {
      LogError(`[LiveKitAgentRoomCoordinator] StopAgentRoomSession failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      // Drop this agent from its room roster so the count reflects who's actually present (the NEXT agent's
      // meeting-vs-solo decision reads it). Done in finally — even a failed stop means we asked it to leave.
      this.removeFromRoster(sessionBridgeID);
    }
  }

  /**
   * Ends the meeting for EVERYONE: stops every agent bot currently bridged into a room. This backs the Meet
   * UI's "End meeting for everyone" control, which ANY participant can trigger — including one who only
   * *joined* the room and therefore never tracked the bridge ids locally. The per-room roster is the
   * server-side source of truth, so the teardown works regardless of who originally started the agents.
   *
   * @param roomName The LiveKit room to tear down.
   * @param reason Why the sessions are stopping. Default: `'Explicit'`.
   * @param contextUser The acting user.
   * @param provider The metadata provider.
   * @returns The number of agent sessions asked to stop (0 when the room held no agents).
   */
  public async StopAllAgentsInRoom(
    roomName: string,
    reason: BridgeDisconnectReason = 'Explicit',
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number> {
    const roomKey = roomName.trim().toLowerCase();
    // Snapshot the bridge ids first — StopAgentRoomSession mutates the roster (removeFromRoster) as it runs.
    const bridgeIDs = (this.roomRosters.get(roomKey) ?? []).map((e) => e.SessionBridgeID);
    await Promise.all(bridgeIDs.map((id) => this.StopAgentRoomSession(id, reason, contextUser, provider)));
    return bridgeIDs.length;
  }
}
