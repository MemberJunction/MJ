/**
 * @fileoverview Orchestrates Teams meeting bridge sessions (join-by-URL) for MJAPI.
 *
 * @module @memberjunction/telephony-adapters
 */

import { RunView, UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine, type StartBridgeSessionParams } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import { BaseRealtimeBridge, type BridgeNativeSdkBinding } from '@memberjunction/ai-bridge-base';
import { RealTeamsBindings, RealGraphCallsClient, PumpBackedAcsMedia, type TeamsBridge } from '@memberjunction/ai-bridge-teams';
import type { TeamsMeetingsConfig } from '../types.js';
import { IAgentSessionManager, DefaultAgentSessionManager } from '../sessionManager.js';
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
    sessionManager?: IAgentSessionManager;
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
    private readonly sessionManager: IAgentSessionManager;
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
        this.sessionManager = deps.sessionManager ?? new DefaultAgentSessionManager();
        this.graphClientFactory =
            deps.graphClientFactory ?? ((accessToken, tenantId) => new RealGraphCallsClient({ AccessToken: accessToken, TenantId: tenantId }));
    }

    public get Config(): TeamsMeetingsConfig {
        return this.config;
    }

    /**
     * Joins a Teams meeting by URL for a given agent identity and starts the bridge session.
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
     * Drives the retained Graph roster handler for a call from a Graph change notification.
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
     * Builds the {@link StartBridgeSessionParams} for a SCHEDULED Teams join.
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

    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(TEAMS_PROVIDER_DRIVER) ?? this.engine.ProviderByName('Microsoft Teams');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the Teams bridge (DriverClass '${TEAMS_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    public buildBindSdk(graphClient: RealGraphCallsClient): BridgeNativeSdkBinding {
        return (driver: BaseRealtimeBridge) => {
            const teams = driver as TeamsBridge;
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

    private buildSessionConfiguration(): Record<string, unknown> {
        const config: Record<string, unknown> = {};
        if (this.config.tenantId) {
            config.TenantId = this.config.tenantId;
        }
        return config;
    }

    private async loadAgentIdentity(
        agentIdentityId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIBridgeAgentIdentityEntity | null> {
        const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
        const loaded = await entity.Load(agentIdentityId);
        if (!loaded || !entity.IsActive) {
            return null;
        }
        return entity;
    }
}
