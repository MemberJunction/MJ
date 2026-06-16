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
import { RegexAddressedMatcher, type BridgeDisconnectReason, type BridgeTurnMode } from '@memberjunction/ai-bridge-base';
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
  /** The room being joined. */
  RoomName: string;
  /** The user the session runs as. */
  ContextUser?: UserInfo;
  /** The metadata provider for the session. */
  MetadataProvider?: IMetadataProvider;
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
  /** Extra aliases the agent answers to (for Passive turn-taking). */
  AgentAliases?: string[];
  /** Turn-taking mode. Default: `'Passive'` (speak only when addressed). */
  TurnMode?: BridgeTurnMode;
  /** The user the session runs as. */
  ContextUser?: UserInfo;
  /** The metadata provider for the session. */
  MetadataProvider?: IMetadataProvider;
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

    const session = await this.sessionFactory({
      AgentID: params.AgentID,
      AgentName: params.AgentName,
      RoomName: params.RoomName,
      ContextUser: params.ContextUser,
      MetadataProvider: params.MetadataProvider,
    });

    const active = await this.bridgeOps.StartBridgeSession({
      AgentSessionID: params.AgentSessionID,
      Provider: provider,
      RealtimeSession: session,
      Address: botToken.ServerUrl,
      JoinMethod: 'OnDemand',
      TurnMode: params.TurnMode ?? 'Passive',
      TurnMatcher: new RegexAddressedMatcher([botName, ...(params.AgentAliases ?? [])]),
      Configuration: { AccessToken: botToken.Token, BotDisplayName: botName, RoomName: params.RoomName },
      ContextUser: params.ContextUser,
      MetadataProvider: params.MetadataProvider,
    });

    LogStatus(`[LiveKitAgentRoomCoordinator] Agent ${botName} bridged into LiveKit room ${params.RoomName} (bridge ${active.SessionBridgeID})`);
    return { SessionBridgeID: active.SessionBridgeID, RoomName: params.RoomName, ServerUrl: botToken.ServerUrl };
  }

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
    }
  }
}
