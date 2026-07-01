/**
 * @fileoverview Orchestrates Teams meeting bridge sessions (join-by-URL) for MJAPI.
 *
 * This is the composition layer between the Teams meetings ingress (the public Graph change-notification
 * webhook + the server-owned ACS media plane) and the ONE unified realtime-agent pathway. It does NOT
 * re-implement any bridge logic: it resolves the Teams provider + the agent identity, opens a server-side
 * realtime session via the agent layer's `CreateBridgeRealtimeSession` factory, binds the REAL Teams binding
 * (`RealTeamsBindings` over the Graph control plane + the per-call ACS media registry) onto the driver, and
 * hands everything to `AIBridgeEngine.StartBridgeSession` — exactly the seam the Twilio telephony service +
 * the LiveKit room coordinator use.
 *
 * Collaborators are injected (engine, session factory, session manager) so the resolution/branching logic is
 * unit-testable with fakes; the actual Graph call placement + ACS media flow are live-only (real Teams/Azure
 * credentials + a publicly reachable Graph webhook URL — see meeting-vendor-bindings-teams-slack.md M1).
 *
 * @module @memberjunction/server/telephony
 */

import { RunView, UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine, type StartBridgeSessionParams } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import { BaseRealtimeBridge, type BridgeNativeSdkBinding } from '@memberjunction/ai-bridge-base';
import { RealTeamsBindings, RealGraphCallsClient, PumpBackedAcsMedia, type TeamsBridge } from '@memberjunction/ai-bridge-teams';
import type { TeamsMeetingsConfig } from '../config.js';
import { SessionManager } from '../agentSessions/SessionManager.js';
import { TeamsAcsMediaRegistry } from './teamsAcsMediaRegistry.js';

const TEAMS_PROVIDER_DRIVER = 'TeamsBridge';
const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';

/** Result of starting a Teams meeting bridge session. */
export interface JoinMeetingResult {
    /** Whether a bridge session was started for the meeting. */
    accepted: boolean;
    /** The Graph call id the bot joined (the bridge's external connection id), when accepted. */
    callId?: string;
    /** Why it was rejected (no agent identity, provider missing, unparseable join URL, etc.). */
    reason?: string;
}

/** Injectable collaborators (production defaults wired in the constructor; fakes in tests). */
export interface TeamsMeetingsServiceDeps {
    engine?: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    sessionFactory?: typeof CreateBridgeRealtimeSession;
    sessionManager?: Pick<SessionManager, 'CreateSession'>;
    /** Constructs the Graph control-plane client for a session (default: the real lazy-SDK client). */
    graphClientFactory?: (accessToken: string, tenantId?: string) => RealGraphCallsClient;
}

/**
 * Starts Teams meeting bridge sessions. One instance per server, constructed alongside the meetings router and
 * sharing the {@link TeamsAcsMediaRegistry} with the server's ACS media adapter.
 */
export class TeamsMeetingsService {
    private readonly engine: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: Pick<SessionManager, 'CreateSession'>;
    private readonly graphClientFactory: (accessToken: string, tenantId?: string) => RealGraphCallsClient;
    /** Live Graph clients keyed by call id, so the webhook ingress can drive their roster/ended handlers. */
    private readonly graphClientsByCall = new Map<string, RealGraphCallsClient>();

    constructor(
        private readonly config: TeamsMeetingsConfig,
        private readonly registry: TeamsAcsMediaRegistry,
        deps: TeamsMeetingsServiceDeps = {},
    ) {
        this.engine = deps.engine ?? AIBridgeEngine.Instance;
        this.sessionFactory = deps.sessionFactory ?? CreateBridgeRealtimeSession;
        this.sessionManager = deps.sessionManager ?? new SessionManager();
        this.graphClientFactory =
            deps.graphClientFactory ?? ((accessToken, tenantId) => new RealGraphCallsClient({ AccessToken: accessToken, TenantId: tenantId }));
    }

    /**
     * Joins a Teams meeting by URL for a given agent identity and starts the bridge session. The bound
     * `RealTeamsBindings` issues the Graph `POST /communications/calls` and accepts the ACS media transport
     * (attached by the server's media adapter) for the joined call. Returns `{ accepted:false }` (never
     * throws) when the agent identity is missing/inactive, so the caller can answer cleanly.
     *
     * @param agentIdentityId The agent identity to join as (its Teams account/email is the bot's identity).
     * @param joinUrl The Teams meeting join URL.
     * @param contextUser The request-scoped principal.
     * @param provider The request-scoped metadata provider (multi-provider safe — never the global Metadata).
     */
    public async JoinMeetingByUrl(
        agentIdentityId: string,
        joinUrl: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<JoinMeetingResult> {
        try {
            const identity = await this.loadAgentIdentity(agentIdentityId, contextUser, provider);
            if (!identity) {
                return { accepted: false, reason: `Agent identity '${agentIdentityId}' not found or inactive.` };
            }
            const session = await this.startBridge({ agentID: identity.AgentID, joinUrl, contextUser, provider });
            return { accepted: true, callId: session.CallId };
        } catch (e) {
            LogError(`[Meetings][Teams] join meeting failed: ${e instanceof Error ? e.message : String(e)}`);
            return { accepted: false, reason: e instanceof Error ? e.message : 'Internal error starting the agent.' };
        }
    }

    /**
     * Drives the retained Graph roster handler for a call from a Graph change notification (called by the
     * webhook ingress — Graph delivers roster changes over the webhook, not a client subscription).
     */
    public DriveParticipantsUpdated(callId: string, participants: { id: string; displayName?: string; role?: string }[]): void {
        this.graphClientsByCall.get(callId)?.DriveParticipantsUpdated(callId, participants);
    }

    /** Drives the call-ended handler for a call from a Graph change notification, then tears the call down. */
    public DriveCallEnded(callId: string): void {
        this.graphClientsByCall.get(callId)?.DriveCallEnded(callId);
        this.graphClientsByCall.delete(callId);
        this.registry.EndCall(callId);
    }

    /**
     * Builds the {@link StartBridgeSessionParams} for a SCHEDULED Teams join — a bridge the
     * {@link ScheduledBridgeRunner} owns (it created the `MJ: AI Agent Sessions` row and owns the
     * `StartBridgeSession` call). Reuses the same provider resolution, realtime-session factory, Graph
     * client, and bind-sdk as an on-demand join, so a scheduled Teams join is identical to a live one
     * for audio (the ACS media registry is wired via {@link buildBindSdk}).
     *
     * NOTE: an on-demand join also registers the live Graph client by call id for webhook-driven
     * roster/ended routing; the runner abstracts the post-start call id away, so for a SCHEDULED join
     * that notification routing is a documented follow-on. Audio is fully wired here.
     */
    public async BuildScheduledStartParams(args: {
        agentID: string;
        joinUrl: string;
        agentSessionID: string;
        contextUser: UserInfo;
        provider: IMetadataProvider;
    }): Promise<StartBridgeSessionParams> {
        await this.engine.Config(false, args.contextUser, args.provider);
        const teamsProvider = this.resolveProvider();
        const realtimeSession = await this.sessionFactory({
            AgentID: args.agentID,
            TargetAgentID: args.agentID,
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
            AgentSessionID: args.agentSessionID,
            RoomName: args.joinUrl,
        });
        const graphClient = this.graphClientFactory(this.config.botAccessToken ?? '', this.config.tenantId);
        return {
            AgentSessionID: args.agentSessionID,
            AgentID: args.agentID,
            TargetAgentID: args.agentID,
            Provider: teamsProvider,
            RealtimeSession: realtimeSession,
            Address: args.joinUrl,
            Direction: 'Outbound',
            Configuration: this.buildSessionConfiguration(),
            BindSdk: this.buildBindSdk(graphClient),
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
        };
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Resolves provider, opens the realtime session, binds the real Teams SDK, and starts the bridge. */
    private async startBridge(args: {
        agentID: string;
        joinUrl: string;
        contextUser: UserInfo;
        provider: IMetadataProvider;
    }): Promise<{ CallId?: string }> {
        await this.engine.Config(false, args.contextUser, args.provider);
        const teamsProvider = this.resolveProvider();

        const agentSession = await this.sessionManager.CreateSession(
            { agentID: args.agentID, userID: args.contextUser.ID },
            args.contextUser,
            args.provider,
        );
        const realtimeSession = await this.sessionFactory({
            AgentID: args.agentID,
            TargetAgentID: args.agentID,
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
            AgentSessionID: agentSession.ID,
            RoomName: args.joinUrl,
        });

        // The Graph client is created per session; its retained webhook handlers are driven by the ingress.
        const graphClient = this.graphClientFactory(this.config.botAccessToken ?? '', this.config.tenantId);

        const active = await this.engine.StartBridgeSession({
            AgentSessionID: agentSession.ID,
            AgentID: args.agentID,
            TargetAgentID: args.agentID,
            Provider: teamsProvider,
            RealtimeSession: realtimeSession,
            Address: args.joinUrl,
            Direction: 'Outbound',
            Configuration: this.buildSessionConfiguration(),
            BindSdk: this.buildBindSdk(graphClient),
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
        });

        const callId = active.RoomKey;
        if (callId) {
            this.registry.RegisterCall(callId);
            this.graphClientsByCall.set(callId, graphClient);
        }
        return { CallId: callId };
    }

    /** Resolves the seeded Teams provider row (by driver class, falling back to display name). */
    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(TEAMS_PROVIDER_DRIVER) ?? this.engine.ProviderByName('Microsoft Teams');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the Teams bridge (DriverClass '${TEAMS_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    /**
     * Builds the per-session SDK binding that wires the REAL Teams binding (`RealTeamsBindings` over the Graph
     * control plane + the per-call ACS media registry) onto the Teams driver — overriding the package's default
     * native loader. This is where the offline-complete seams meet the live Graph + ACS plumbing.
     */
    public buildBindSdk(graphClient: RealGraphCallsClient): BridgeNativeSdkBinding {
        return (driver: BaseRealtimeBridge) => {
            const teams = driver as TeamsBridge;
            // RealTeamsBindings threads the Graph call id through every media call, so PumpBackedAcsMedia
            // routes onto the shared registry keyed by that id — no call id needed at construction.
            teams.SetSdkFactory(
                () =>
                    new RealTeamsBindings({
                        Graph: graphClient,
                        Media: new PumpBackedAcsMedia(this.registry),
                        ModelSampleRate: this.config.modelSampleRate,
                    }),
            );
        };
    }

    /** Assembles the per-session bridge configuration (carries the resolved tenant for diagnostics). */
    private buildSessionConfiguration(): Record<string, unknown> {
        const config: Record<string, unknown> = {};
        if (this.config.tenantId) {
            config.TenantId = this.config.tenantId;
        }
        return config;
    }

    /** Loads a specific agent identity by id (used by join-by-URL), requiring it be active. */
    private async loadAgentIdentity(
        agentIdentityId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIBridgeAgentIdentityEntity | null> {
        // Use the request-scoped provider (multi-provider safe), not the global Metadata.
        const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
        const loaded = await entity.Load(agentIdentityId);
        if (!loaded || !entity.IsActive) {
            return null;
        }
        return entity;
    }
}
