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
export type BridgeOps = Pick<AIBridgeEngine, 'Config' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'StopBridgeSession'>;

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
  /**
   * Multi-agent meeting mode — set when the agent joins a room that already has agents. Flows to the
   * realtime session so its model's auto-response is disabled (speaks only when addressed).
   */
  MeetingMode?: boolean;
  /** The names the agent answers to (display name + aliases) — phrasing for the meeting prompt. */
  SelfNames?: string[];
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
    // participant — auto-response OFF, speaks only when addressed by name. The first agent in a room stays
    // a normal 1:1 voice (it answers freely; it isn't retroactively re-gated). The names the agent answers
    // to drive both its addressing matcher (the GATE) and the meeting prompt phrasing.
    const roomKey = params.RoomName.trim().toLowerCase();
    const selfNames = [botName, ...(params.AgentAliases ?? [])].map(n => n.trim()).filter(n => n.length > 0);
    const isMeeting = (this.roomRosters.get(roomKey)?.length ?? 0) > 0;

    const session = await this.sessionFactory({
      AgentID: params.AgentID,
      AgentName: params.AgentName,
      TargetAgentID: params.TargetAgentID,
      RealtimeModelID: params.RealtimeModelID,
      RealtimeVoice: params.RealtimeVoice,
      RoomName: params.RoomName,
      ContextUser: params.ContextUser,
      MetadataProvider: params.MetadataProvider,
      MeetingMode: isMeeting || undefined,
      SelfNames: isMeeting ? selfNames : undefined,
    });

    const active = await this.bridgeOps.StartBridgeSession({
      AgentSessionID: params.AgentSessionID,
      Provider: provider,
      RealtimeSession: session,
      Address: botToken.ServerUrl,
      JoinMethod: 'OnDemand',
      TurnMode: params.TurnMode ?? 'Passive',
      // Meeting: gate speech to ADDRESSED turns (RegexAddressedMatcher on the agent's names) AND tell the
      // engine the model's auto-response is off so the bridge becomes the sole trigger. Solo 1:1: respond to
      // ALL the user's speech (AlwaysAddressedMatcher) with the model's own auto-response — Passive's
      // name-match would otherwise leave a single agent silent unless you said its name each turn.
      TurnMatcher: isMeeting ? new RegexAddressedMatcher(selfNames) : new AlwaysAddressedMatcher(),
      DisableAutoResponse: isMeeting || undefined,
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
    LogStatus(
      `[LiveKitAgentRoomCoordinator] Agent ${botName} bridged into LiveKit room ${params.RoomName} ` +
        `(bridge ${active.SessionBridgeID}, ${isMeeting ? 'MEETING — addressed-only' : 'solo 1:1'})`,
    );
    return { SessionBridgeID: active.SessionBridgeID, RoomName: params.RoomName, ServerUrl: botToken.ServerUrl };
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
}
