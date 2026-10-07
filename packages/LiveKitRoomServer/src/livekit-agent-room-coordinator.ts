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

import { BaseSingleton, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ResolveIsModelFullDuplex, type IRealtimeSession, type RealtimeToolDefinition, type RealtimeSessionCapabilities } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import {
  AlwaysAddressedMatcher,
  RegexAddressedMatcher,
  TURN_TAKING_TOOL_DEFINITIONS,
  type BridgeDisconnectReason,
  type BridgeTurnMode,
  type TurnAddressingMode,
} from '@memberjunction/ai-bridge-base';
import {
  AIBridgeEngine,
  type BridgeTranscriptSink,
  type BridgeTurnTakingToolHandler,
  type RoomTurnSnapshot,
} from '@memberjunction/ai-bridge-server';
import { LiveKitTokenService } from './livekit-token-service';
import { ResolveLiveKitNativeModuleSpecifier } from './livekit-native-module';

/**
 * Static capability map for known realtime drivers when resolving full-duplex capability before session connect.
 * Avoids class-name substring heuristics.
 */
const DRIVER_STATIC_CAPABILITIES: Record<string, { FullDuplex?: boolean }> = {
  OpenAILiveRealtime: { FullDuplex: true },
};

function GetDriverStaticCapabilities(driverClass?: string | null): { FullDuplex?: boolean } | null {
  if (!driverClass) {
    return null;
  }
  const key = driverClass.trim().toLowerCase();
  for (const [cls, caps] of Object.entries(DRIVER_STATIC_CAPABILITIES)) {
    if (cls.toLowerCase() === key) {
      return caps;
    }
  }
  return null;
}

/** The subset of {@link AIBridgeEngine} the coordinator drives — an injectable seam for unit testing. */
export type BridgeOps = Pick<AIBridgeEngine, 'Config' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'StopBridgeSession' | 'ReconfigureSessionToMeeting'>;

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
  /** Tools the host declares and executes itself (call control, handoff). Added to the model's tool set. */
  HostTools?: RealtimeToolDefinition[];
  /**
   * Optional callback allowing the coordinator to resolve host tools dynamically based on
   * the model and driver capabilities actually resolved for the session, before session opening.
   */
  ResolveHostTools?: (resolved: { ModelID?: string; ModelVendorID?: string; DriverClass?: string }) => RealtimeToolDefinition[] | undefined;
  /** Host-authored instructions appended to the system prompt (for example the phone framing). */
  HostFraming?: string;
  /** Role-tagged transcript so far, framed into the prompt when a lost model session is re-opened mid-call. */
  PriorTranscript?: string;
  /** The `MJ: Conversations` row the session writes to — stamped on the co-agent observability run. */
  ConversationID?: string;
}

/**
 * What a HOST that owns the call (a phone call arriving in a room, a web room with handoff tools) adds to an agent's
 * room session beyond the plain "join the room" the coordinator does for the Meet UI. All optional: a session started
 * without it behaves exactly as before.
 */
export interface AgentRoomHostOptions {
  /** Tools the host executes itself. */
  HostTools?: RealtimeToolDefinition[];
  /** Instructions appended to the agent's system prompt. */
  HostFraming?: string;
  /** The conversation the session's transcript belongs to. */
  ConversationID?: string;
  /**
   * Called with every model session opened for this agent (the first one, and any re-opened after a drop) so the host
   * can attach its tool handler to each.
   */
  OnModelSession?: (session: IRealtimeSession) => void;
  /** Where this session's final transcript lines go (instead of the shared room transcript). */
  TranscriptSink?: BridgeTranscriptSink;
  /** The participant talked over the agent (a true barge-in). */
  OnBargeIn?: () => void;
  /** Re-open the model session once, with the conversation so far, if it drops mid-call. */
  RecoverModelSession?: boolean;
  /** Called once when the session has fully ended, for the host's own bookkeeping. */
  OnSessionEnded?: (reason: BridgeDisconnectReason) => void | Promise<void>;
  /** How the agent got into the room. Default `'OnDemand'`. */
  JoinMethod?: 'InboundRoute' | 'OnDemand' | 'Invite';
  /** Whether the agent was called into the room or placed the call. Default: not stated. */
  Direction?: 'Inbound' | 'Outbound';
}

/**
 * Installs the engine's turn-taking tool handler on a model session — the seam that lets this package stay free
 * of the agent runtime. Production binds it to `GetBridgeRealtimeRuntime(session)?.SetLocalToolHandler(handler)`
 * (`@memberjunction/ai-agents`); a test binds a spy.
 */
export type TurnToolBinder = (session: IRealtimeSession, handler: BridgeTurnTakingToolHandler) => void;

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
  /** Explicit override for whether the model is full-duplex. When omitted, resolved from model metadata or driver capabilities. */
  FullDuplex?: boolean;
  /** Extra aliases the agent answers to (for Passive turn-taking). */
  AgentAliases?: string[];
  /** Turn-taking mode. Default: `'Passive'` (speak only when addressed). */
  TurnMode?: BridgeTurnMode;
  /**
   * How the agent decides it was addressed. `'Auto'` (the default) uses the MODEL's own judgement when its model is
   * full-duplex and falls back to name matching otherwise; `'ModelSide'` / `'Regex'` force one. A room in moderator
   * mode (gated meeting) always uses `'Regex'`.
   */
  TurnAddressing?: TurnAddressingMode;
  /** The user the session runs as. */
  ContextUser?: UserInfo;
  /** The metadata provider for the session. */
  MetadataProvider?: IMetadataProvider;
  /** What a host that owns the call adds (tools, framing, transcript, recovery). Absent for a plain Meet room. */
  Host?: AgentRoomHostOptions;
}

/** One agent's membership in a room's roster (for multi-agent meeting detection). */
export interface RoomAgentEntry {
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
   * without all answering every utterance. The first agent stays a normal 1:1 voice (it isn't
   * retroactively re-gated — that needs a live session re-config, a follow-up). See
   * `plans/realtime/multi-agent-meeting-turn-taking.md`.
   */
  private roomRosters = new Map<string, RoomAgentEntry[]>();
  private bridgeOps: BridgeOps = AIBridgeEngine.Instance;
  private turnToolBinder?: TurnToolBinder;
  private turnStateSource: (roomKey: string) => RoomTurnSnapshot | null = (roomKey) => AIBridgeEngine.Instance.GetRoomTurnSnapshot(roomKey);
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
   * Binds the seam that installs the engine's turn-taking tool handler on a model session. Without it a
   * full-duplex model's `i_am_addressed` / `yield_turn` calls cannot be executed (the room's floor gate still
   * protects against overlap; the model just cannot reserve the floor or hand it to a named agent).
   *
   * @param binder The binder, or `undefined` to clear it.
   */
  public SetTurnToolBinder(binder: TurnToolBinder | undefined): void {
    this.turnToolBinder = binder;
  }

  /**
   * Overrides where a room's turn-taking snapshot comes from (an injectable seam for unit testing; production
   * reads the process-wide {@link AIBridgeEngine}).
   *
   * @param source Returns the snapshot for a room key, or `null` when the room holds no agents.
   */
  public SetTurnStateSource(source: (roomKey: string) => RoomTurnSnapshot | null): void {
    this.turnStateSource = source;
  }

  /**
   * A room's live turn-taking state — floor holder, whether a person is speaking, any pending hand-off, the
   * agent-to-agent loop-cap progress, the most recent floor events, and who is seated. Read-only.
   *
   * @param roomName The LiveKit room name (the bridge's room key).
   * @returns The snapshot, or `null` when the room holds no agents.
   */
  public GetRoomTurnState(roomName: string): RoomTurnSnapshot | null {
    return this.turnStateSource(roomName.trim());
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
    // the agents ALREADY in it are retroactively re-gated too (capability-permitting — see below). The names
    // the agent answers to drive both its addressing matcher (the GATE) and the meeting prompt phrasing.
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
    const addressing: TurnAddressingMode = isMeeting ? 'Regex' : params.TurnAddressing ?? 'Auto';

    let resolvedFullDuplex: boolean | undefined = params.FullDuplex;
    if (resolvedFullDuplex === undefined && params.RealtimeModelID) {
      resolvedFullDuplex = this.resolveIsModelFullDuplexFromId(params.RealtimeModelID);
    }

    const host = params.Host;
    const buildToolsForFullDuplex = (isFd: boolean): RealtimeToolDefinition[] | undefined => {
      const turnTakingTools = isFd || addressing === 'Regex' ? [] : [...TURN_TAKING_TOOL_DEFINITIONS];
      return (host?.HostTools?.length ?? 0) > 0 || turnTakingTools.length > 0
        ? [...(host?.HostTools ?? []), ...turnTakingTools]
        : undefined;
    };

    let activeTurnHandler: BridgeTurnTakingToolHandler | undefined = undefined;
    const openModelSession = async (priorTranscript?: string): Promise<IRealtimeSession> => {
      const initialTools = buildToolsForFullDuplex(resolvedFullDuplex ?? false);
      const opened = await this.sessionFactory({
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
        MeetingMode: isMeeting || undefined,
        SelfNames: isMeeting ? selfNames : undefined,
        HostTools: initialTools,
        HostFraming: host?.HostFraming,
        ConversationID: host?.ConversationID,
        PriorTranscript: priorTranscript,
        ResolveHostTools: (resolved) => {
          if (resolvedFullDuplex === undefined) {
            if (resolved.ModelID) {
              const effective = AIEngine.Instance.GetEffectiveModelConfiguration(resolved.ModelID, resolved.ModelVendorID);
              const model = (AIEngine.Instance.Models ?? []).find(m => UUIDsEqual(m.ID, resolved.ModelID!));
              const staticCaps = GetDriverStaticCapabilities(resolved.DriverClass);
              resolvedFullDuplex = ResolveIsModelFullDuplex(effective ?? model?.ModelConfigurationObject, staticCaps);
            } else if (resolved.DriverClass) {
              const staticCaps = GetDriverStaticCapabilities(resolved.DriverClass);
              resolvedFullDuplex = staticCaps?.FullDuplex === true;
            }
          }
          return buildToolsForFullDuplex(resolvedFullDuplex ?? false);
        },
      });
      if (resolvedFullDuplex === undefined) {
        resolvedFullDuplex = opened.Capabilities?.FullDuplex === true;
      } else if (opened.Capabilities?.FullDuplex !== undefined && opened.Capabilities.FullDuplex !== resolvedFullDuplex) {
        LogStatus(
          `[LiveKitAgentRoomCoordinator] WARNING: Session factory opened with Capabilities.FullDuplex=${opened.Capabilities.FullDuplex}, ` +
          `which disagrees with pre-open resolved FullDuplex=${resolvedFullDuplex}. Initial tools may mismatch.`
        );
      }
      host?.OnModelSession?.(opened);
      if (activeTurnHandler) {
        this.bindTurnTools(opened, activeTurnHandler, botName, resolvedFullDuplex);
      }
      return opened;
    };
    const session = await openModelSession();
    const finalFullDuplex = resolvedFullDuplex ?? false;

    // The bridge id is known only after the engine starts the session, but the end-of-session hook is registered at start,
    // so it reaches the id through this holder.
    const started: { SessionBridgeID?: string } = {};
    const active = await this.bridgeOps.StartBridgeSession({
      AgentSessionID: params.AgentSessionID,
      AgentID: params.AgentID,
      Provider: provider,
      RealtimeSession: session,
      FullDuplex: finalFullDuplex,
      Address: botToken.ServerUrl,
      JoinMethod: host?.JoinMethod ?? 'OnDemand',
      Direction: host?.Direction,
      TurnMode: params.TurnMode ?? 'Passive',
      TurnAddressing: addressing,
      // Meeting: gate speech to ADDRESSED turns (RegexAddressedMatcher on the agent's names) AND tell the
      // engine the model's auto-response is off so the bridge becomes the sole trigger. Solo 1:1: respond to
      // ALL the user's speech (AlwaysAddressedMatcher) with the model's own auto-response — Passive's
      // name-match would otherwise leave a single agent silent unless you said its name each turn.
      TurnMatcher: isMeeting ? new RegexAddressedMatcher(selfNames) : new AlwaysAddressedMatcher(),
      DisableAutoResponse: isMeeting || undefined,
      // Roster info for the room turn moderator (the LLM router, when one is wired via SetTurnModerator):
      // the names it answers to + its participation style. `'proactive'` (default) lets the moderator bring
      // it in unaddressed when relevant; per-agent `'addressed-only'` resolution from config is a follow-up.
      AgentNames: selfNames,
      ParticipationMode: 'proactive',
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
      // Host-owned call: its own transcript, barge-in policy, model recovery and end-of-session bookkeeping.
      TranscriptSink: host?.TranscriptSink,
      OnBargeIn: host?.OnBargeIn,
      RecoverRealtimeSession: host?.RecoverModelSession ? (request) => openModelSession(request.PriorTranscript) : undefined,
      OnSessionEnded: async (reason) => {
        // An agent that leaves on its own (every human gone, the model lost, a handoff) must drop off the room's roster too.
        if (started.SessionBridgeID) {
          this.removeFromRoster(started.SessionBridgeID);
        }
        await host?.OnSessionEnded?.(reason);
      },
    });
    started.SessionBridgeID = active.SessionBridgeID;

    this.addToRoster(roomKey, { AgentSessionID: params.AgentSessionID, SessionBridgeID: active.SessionBridgeID, Names: selfNames });
    activeTurnHandler = active.TurnTakingToolHandler;
    this.bindTurnTools(session, active.TurnTakingToolHandler, botName, finalFullDuplex);

    // The room just became (or stayed) multi-agent → retroactively re-gate the agents already in it into
    // meeting mode so the whole room takes turns, not just the newcomers. Capability-gated in the engine:
    // a provider that can't reconfigure a live session (e.g. Gemini) is left conversational, no dead call.
    // Idempotent — agents already in meeting mode are no-ops.
    if (isMeeting) {
      for (const agent of existingAgents) {
        this.bridgeOps.ReconfigureSessionToMeeting(agent.SessionBridgeID, new RegexAddressedMatcher(agent.Names));
      }
    }

    LogStatus(
      `[LiveKitAgentRoomCoordinator] Agent ${botName} bridged into LiveKit room ${params.RoomName} ` +
        `(bridge ${active.SessionBridgeID}, ${isMeeting ? 'MEETING — addressed-only' : 'solo 1:1'})`,
    );
    return { SessionBridgeID: active.SessionBridgeID, RoomName: params.RoomName, ServerUrl: botToken.ServerUrl };
  }

  /** Installs the engine's turn-taking tool handler on the model session, when the session has one (a turn-based model in a room). */
  private bindTurnTools(session: IRealtimeSession, handler: BridgeTurnTakingToolHandler | undefined, botName: string, isFullDuplex: boolean): void {
    if (!handler) {
      return;
    }
    // Full-duplex models never get turn-taking tools; do not bind turn-taking handlers to them
    if (isFullDuplex) {
      return;
    }
    if (!this.turnToolBinder) {
      LogError(
        `[LiveKitAgentRoomCoordinator] ${botName} has turn-taking tools but no turn-tool binder is set (SetTurnToolBinder); ` +
          'its i_am_addressed / yield_turn calls will not execute.',
      );
      return;
    }
    this.turnToolBinder(session, handler);
  }

  /**
   * Resolves whether the model with the given ID is full duplex from model metadata and static driver capabilities.
   */
  private resolveIsModelFullDuplexFromId(modelId: string): boolean | undefined {
    try {
      const model = (AIEngine.Instance.Models ?? []).find(m => UUIDsEqual(m.ID, modelId));
      if (!model) {
        return undefined;
      }
      const vendors = (AIEngine.Instance.ModelVendorsByModelID?.get(NormalizeUUID(model.ID)) ??
        (AIEngine.Instance.ModelVendors ?? []).filter(mv => UUIDsEqual(mv.ModelID, model.ID)))
        .filter(v => v.DriverClass != null && (v.Status === undefined || v.Status === 'Active'))
        .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
      const primaryVendor = vendors[0];
      const effective = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, primaryVendor?.ID);
      const staticCaps = GetDriverStaticCapabilities(primaryVendor?.DriverClass);
      return ResolveIsModelFullDuplex(effective ?? model.ModelConfigurationObject, staticCaps);
    } catch (err) {
      LogError(`[LiveKitAgentRoomCoordinator] resolveIsModelFullDuplexFromId failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
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

  /**
   * Resolves the native LiveKit room-client module specifier for the bridge session (see
   * {@link ResolveLiveKitNativeModuleSpecifier}: the test override, else `LIVEKIT_NATIVE_MODULE`, else the default
   * `@memberjunction/ai-bridge-livekit-native`). Overridable in tests via {@link SetNativeModuleSpecifier}.
   */
  private resolveNativeModuleSpecifier(): string {
    return ResolveLiveKitNativeModuleSpecifier(this.nativeModuleSpecifierOverride);
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

  /**
   * Looks up the room name associated with a session bridge ID if present in the coordinator's active rosters.
   *
   * @param sessionBridgeID The `MJ: AI Agent Session Bridges` row id.
   * @returns The room name, or `undefined` if not tracked in the active rosters.
   */
  public GetRoomForBridge(sessionBridgeID: string): string | undefined {
    for (const [roomKey, roster] of this.roomRosters) {
      if (roster.some((e) => e.SessionBridgeID === sessionBridgeID)) {
        return roomKey;
      }
    }
    return undefined;
  }

  /**
   * Returns the agent sessions currently active in the given room.
   */
  public GetAgentsInRoom(roomName: string): ReadonlyArray<RoomAgentEntry> {
    const roomKey = roomName.trim().toLowerCase();
    return this.roomRosters.get(roomKey) ?? [];
  }
}
