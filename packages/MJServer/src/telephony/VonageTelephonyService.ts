/**
 * @fileoverview Orchestrates Vonage telephony bridge sessions (inbound + outbound) for MJAPI.
 *
 * This is the composition layer between the carrier ingress (the public answer/event webhooks + the
 * bidirectional media WSS) and the ONE unified realtime-agent pathway. It does NOT re-implement any
 * bridge logic: it resolves the Vonage provider + the agent identity, opens a server-side realtime
 * session via the agent layer's `CreateBridgeRealtimeSession` factory, binds `RealVonageBindings` (real
 * REST Voice client + the per-call media registry) onto the driver, and hands everything to
 * `AIBridgeEngine.StartBridgeSession` — exactly the seam the Twilio service + LiveKit room coordinator use.
 *
 * Collaborators are injected (engine, session factory, session manager) so the resolution/branching
 * logic is unit-testable with fakes; the actual call placement + media flow are live-only (real Vonage
 * credentials + a publicly reachable media URL — see telephony-vendor-bindings.md §T2).
 *
 * @module @memberjunction/server/telephony
 */

import { RunView, UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import {
    BaseTelephonyBridge,
    type BridgeNativeSdkBinding,
    DIRECTION_CONFIG_KEY,
    FROM_NUMBER_CONFIG_KEY,
    INBOUND_CALL_ID_CONFIG_KEY,
} from '@memberjunction/ai-bridge-base';
import { VonageCallSdk, RealVonageBindings, RealVonageVoiceClient } from '@memberjunction/ai-bridge-vonage';
import type { VonageTelephonyConfig } from '../config.js';
import { SessionManager } from '../agentSessions/SessionManager.js';
import { VonageCallMediaRegistry } from './vonageMediaRegistry.js';

const VONAGE_PROVIDER_DRIVER = 'VonageBridge';
const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';

/** A resolved inbound call's identifying fields (parsed from the Vonage answer/event webhook). */
export interface InboundCallInput {
    /** The Vonage call UUID (`uuid` / `conversation_uuid`). */
    callId: string;
    /** The caller's number (Vonage `from`). */
    from: string;
    /** The dialed DID (Vonage `to`) — resolved to an agent identity. */
    to: string;
}

/** Result of starting an inbound bridge session. */
export interface InboundCallResult {
    /** Whether a pinned agent was resolved + a bridge session started. */
    accepted: boolean;
    /** Why it was rejected (no agent identity for the DID, provider missing, etc.). */
    reason?: string;
}

/** Injectable collaborators (production defaults wired in the constructor; fakes in tests). */
export interface VonageTelephonyServiceDeps {
    engine?: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    sessionFactory?: typeof CreateBridgeRealtimeSession;
    sessionManager?: Pick<SessionManager, 'CreateSession'>;
}

/**
 * Starts Vonage bridge sessions. One instance per server, constructed alongside the telephony router and
 * sharing the {@link VonageCallMediaRegistry} with the media WSS server.
 */
export class VonageTelephonyService {
    private readonly voice: RealVonageVoiceClient;
    private readonly engine: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: Pick<SessionManager, 'CreateSession'>;

    constructor(
        private readonly config: VonageTelephonyConfig,
        private readonly registry: VonageCallMediaRegistry,
        deps: VonageTelephonyServiceDeps = {},
    ) {
        this.voice = new RealVonageVoiceClient({
            ApplicationId: config.applicationId,
            PrivateKey: config.privateKey,
            ApiKey: config.apiKey,
            ApiSecret: config.apiSecret,
        });
        this.engine = deps.engine ?? AIBridgeEngine.Instance;
        this.sessionFactory = deps.sessionFactory ?? CreateBridgeRealtimeSession;
        this.sessionManager = deps.sessionManager ?? new SessionManager();
    }

    /**
     * Resolves the dialed DID to a pinned agent and starts an INBOUND bridge session. The bound
     * `RealVonageBindings` will accept the media socket (opened by the answer webhook's `connect` NCCO)
     * for the call UUID. Returns `{ accepted:false }` (never throws) when no agent identity matches the
     * DID, so the webhook can answer with a polite "no agent" NCCO instead of a 500.
     */
    public async HandleInboundCall(input: InboundCallInput, contextUser: UserInfo, provider: IMetadataProvider): Promise<InboundCallResult> {
        try {
            const identity = await this.resolveAgentIdentityByPhone(input.to, contextUser);
            if (!identity) {
                return { accepted: false, reason: `No active agent identity for dialed number '${input.to}'.` };
            }
            this.registry.RegisterCall(input.callId);
            await this.startBridge({
                agentID: identity.AgentID,
                direction: 'Inbound',
                address: input.from,
                inboundCallId: input.callId,
                contextUser,
                provider,
            });
            return { accepted: true };
        } catch (e) {
            LogError(`[Telephony][Vonage] inbound call ${input.callId} failed: ${e instanceof Error ? e.message : String(e)}`);
            return { accepted: false, reason: 'Internal error starting the agent.' };
        }
    }

    /**
     * Places an OUTBOUND call from a given agent identity to a destination number. The bound
     * `RealVonageBindings.createCall` issues the Voice REST `POST /v1/calls` with the `connect`-websocket
     * NCCO; the returned call UUID is the bridge's external connection id.
     *
     * @returns The placed call UUID.
     */
    public async PlaceOutboundCall(agentIdentityId: string, toNumber: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
        const identity = await this.loadAgentIdentity(agentIdentityId, contextUser, provider);
        if (!identity) {
            throw new Error(`Agent identity '${agentIdentityId}' not found or inactive.`);
        }
        const session = await this.startBridge({
            agentID: identity.AgentID,
            direction: 'Outbound',
            address: toNumber,
            fromNumber: identity.IdentityValue,
            contextUser,
            provider,
        });
        return session.RoomKey ?? '';
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Shared inbound/outbound bridge-start: resolve provider, open the realtime session, bind the SDK, start. */
    private async startBridge(args: {
        agentID: string;
        direction: 'Inbound' | 'Outbound';
        address: string;
        inboundCallId?: string;
        fromNumber?: string;
        contextUser: UserInfo;
        provider: IMetadataProvider;
    }): Promise<{ RoomKey?: string }> {
        await this.engine.Config(false, args.contextUser, args.provider);
        const vonageProvider = this.resolveProvider();

        const agentSession = await this.sessionManager.CreateSession({ agentID: args.agentID, userID: args.contextUser.ID }, args.contextUser, args.provider);
        const realtimeSession = await this.sessionFactory({
            AgentID: args.agentID,
            TargetAgentID: args.agentID,
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
            AgentSessionID: agentSession.ID,
            RoomName: args.address,
        });

        const active = await this.engine.StartBridgeSession({
            AgentSessionID: agentSession.ID,
            AgentID: args.agentID,
            TargetAgentID: args.agentID,
            Provider: vonageProvider,
            RealtimeSession: realtimeSession,
            Address: args.address,
            Direction: args.direction,
            Configuration: this.buildSessionConfiguration(args.direction, args.fromNumber, args.inboundCallId),
            BindSdk: this.buildBindSdk(),
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
        });
        return { RoomKey: active.RoomKey };
    }

    /** Resolves the seeded Vonage provider row (by driver class, falling back to display name). */
    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(VONAGE_PROVIDER_DRIVER) ?? this.engine.ProviderByName('Vonage');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the Vonage bridge (DriverClass '${VONAGE_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    /**
     * Builds the per-session SDK binding that wires the REAL Vonage bindings (REST Voice client + the
     * per-call media registry) onto the telephony driver — overriding the package's default unbound SDK.
     * This is where the offline-complete seams meet the live REST + websocket plumbing.
     */
    public buildBindSdk(): BridgeNativeSdkBinding {
        return (driver) => {
            const telephony = driver as BaseTelephonyBridge;
            telephony.SetSdkFactory(() =>
                new VonageCallSdk(
                    new RealVonageBindings({
                        Voice: this.voice,
                        MediaPump: this.registry,
                        MediaWssUrl: this.config.mediaPublicUrl,
                        EventUrl: this.config.eventUrl,
                    }),
                ),
            );
        };
    }

    /** Assembles the per-session bridge configuration (direction/from-number/inbound-call-id config keys). */
    private buildSessionConfiguration(direction: 'Inbound' | 'Outbound', fromNumber?: string, inboundCallId?: string): Record<string, unknown> {
        // The engine does NOT forward the top-level Direction into the driver's Configuration; the bridge
        // defaults to 'Outbound' when the key is absent. Set it here so an inbound call answers instead of
        // wrongly taking the outbound-dial path ("No 'From' number is specified").
        const config: Record<string, unknown> = { [DIRECTION_CONFIG_KEY]: direction };
        if (fromNumber) {
            config[FROM_NUMBER_CONFIG_KEY] = fromNumber;
        }
        if (inboundCallId) {
            config[INBOUND_CALL_ID_CONFIG_KEY] = inboundCallId;
        }
        return config;
    }

    /** Finds the active agent identity whose phone number matches the dialed DID. */
    private async resolveAgentIdentityByPhone(dialedNumber: string, contextUser: UserInfo): Promise<MJAIBridgeAgentIdentityEntity | null> {
        const normalized = (dialedNumber ?? '').trim();
        if (!normalized) {
            return null;
        }
        const rv = new RunView();
        const result = await rv.RunView<MJAIBridgeAgentIdentityEntity>(
            {
                EntityName: AGENT_IDENTITY_ENTITY,
                ExtraFilter: `IdentityType='${PHONE_IDENTITY_TYPE}' AND IdentityValue='${normalized.replace(/'/g, "''")}' AND IsActive=1`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`[Telephony][Vonage] agent-identity lookup failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results?.[0] ?? null;
    }

    /** Loads a specific agent identity by id (used by outbound PlaceCall), requiring it be active. */
    private async loadAgentIdentity(agentIdentityId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIBridgeAgentIdentityEntity | null> {
        // Use the request-scoped provider (multi-provider safe), not the global Metadata.
        const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
        const loaded = await entity.Load(agentIdentityId);
        if (!loaded || !entity.IsActive) {
            return null;
        }
        return entity;
    }
}
