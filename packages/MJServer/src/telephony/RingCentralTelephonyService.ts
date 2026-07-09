/**
 * @fileoverview Orchestrates RingCentral telephony bridge sessions (inbound + outbound) for MJAPI over the
 * **SIP softphone** transport.
 *
 * RingCentral's only product that carries bidirectional call audio is a registered SIP softphone (the
 * `ringcentral-softphone` SDK over SIP/TLS + RTP/SRTP) — its WebSocket "Call Streaming" product is
 * receive-only and cannot inject the agent's voice. So unlike the Twilio/Vonage ingresses (public webhook
 * + media WSS), this service owns a **long-lived SIP registration**: one
 * {@link RingCentralSoftphoneHandle} created + registered at boot, shared across all calls. Inbound calls
 * arrive as SIP INVITEs on that registration (no HTTP webhook); outbound calls place SIP calls through it.
 *
 * It does NOT re-implement bridge logic: it resolves the RingCentral provider + the agent identity, opens a
 * server-side realtime session via the agent layer's `CreateBridgeRealtimeSession` factory, binds a
 * {@link RingCentralSoftphoneCallSdk} (drawing its session from the shared handle) onto the driver, and
 * hands everything to `AIBridgeEngine.StartBridgeSession` — the same seam the Twilio/Vonage services use.
 *
 * @module @memberjunction/server/telephony
 */

import { RunView, UserInfo, IMetadataProvider, Metadata, LogError, LogStatus } from '@memberjunction/core';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import {
    BaseTelephonyBridge,
    type BridgeNativeSdkBinding,
    CARRIER_SAMPLE_RATE_CONFIG_KEY,
    DIRECTION_CONFIG_KEY,
    FROM_NUMBER_CONFIG_KEY,
    INBOUND_CALL_ID_CONFIG_KEY,
} from '@memberjunction/ai-bridge-base';
import {
    createRingCentralSoftphone,
    RingCentralSoftphoneCallSdk,
    type RingCentralSoftphoneConfig,
    type RingCentralSoftphoneHandle,
    type InboundInviteInfo,
} from '@memberjunction/ai-bridge-ringcentral';
import type { RingCentralTelephonyConfig } from '../config.js';
import { SessionManager } from '../agentSessions/SessionManager.js';

const RINGCENTRAL_PROVIDER_DRIVER = 'RingCentralBridge';
const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';

/** PCM16 carrier rate (Hz) per softphone codec — the rate the bridge resamples to/from the model rate. */
const CODEC_CARRIER_RATE: Record<NonNullable<RingCentralSoftphoneConfig['codec']>, number> = {
    'OPUS/16000': 16000,
    'OPUS/48000/2': 48000,
    'PCMU/8000': 8000,
};

/** A resolved inbound call's identifying fields (mapped from a RingCentral SIP INVITE). */
export interface InboundCallInput {
    /** The SIP `Call-ID` (the per-call id the handle parked the INVITE under + the bridge's inbound id). */
    sessionId: string;
    /** The caller's number (the INVITE's `From`). */
    from: string;
    /** The dialed DID (the INVITE's `To`) — resolved to an agent identity. */
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
export interface RingCentralTelephonyServiceDeps {
    engine?: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    sessionFactory?: typeof CreateBridgeRealtimeSession;
    sessionManager?: Pick<SessionManager, 'CreateSession'>;
    /** Test seam: a factory that builds the softphone handle (inject a fake to avoid the real SIP SDK). */
    createHandle?: typeof createRingCentralSoftphone;
}

/**
 * Starts RingCentral bridge sessions over a shared SIP-softphone registration. One instance per server,
 * constructed at boot and held by the runtime holder so the outbound `PlaceRingCentralCall` resolver and the
 * inbound INVITE coordinator share the same registration.
 */
export class RingCentralTelephonyService {
    private readonly engine: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: Pick<SessionManager, 'CreateSession'>;
    private readonly createHandle: typeof createRingCentralSoftphone;

    /** The shared SIP registration — created + registered by {@link start}; null until then. */
    private handle: RingCentralSoftphoneHandle | null = null;

    /** The carrier PCM16 rate for the negotiated codec (set in {@link start}). */
    private carrierSampleRate: number = CODEC_CARRIER_RATE['OPUS/16000'];

    constructor(
        private readonly config: RingCentralTelephonyConfig,
        deps: RingCentralTelephonyServiceDeps = {},
    ) {
        this.engine = deps.engine ?? AIBridgeEngine.Instance;
        this.sessionFactory = deps.sessionFactory ?? CreateBridgeRealtimeSession;
        this.sessionManager = deps.sessionManager ?? new SessionManager();
        this.createHandle = deps.createHandle ?? createRingCentralSoftphone;
    }

    /**
     * Creates + registers the shared SIP softphone and wires inbound INVITE handling. Called once at boot
     * (fire-and-forget so SIP registration never blocks server startup); logs success/failure. Inbound calls
     * only flow once this resolves.
     */
    public async start(): Promise<void> {
        try {
            this.carrierSampleRate = CODEC_CARRIER_RATE[this.config.codec ?? 'OPUS/16000'];
            this.handle = await this.createHandle(this.toSoftphoneConfig());
            this.handle.onInvite((info) => void this.onInboundInvite(info));
            await this.handle.register();
            LogStatus('[Telephony][RingCentral] softphone telephony started (inbound + outbound ready).');
        } catch (e) {
            this.handle = null;
            LogError(`[Telephony][RingCentral] softphone start failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Best-effort teardown of the SIP registration (server shutdown). */
    public dispose(): void {
        this.handle?.dispose();
        this.handle = null;
    }

    /**
     * Resolves the dialed DID to a pinned agent and starts an INBOUND bridge session. The bound
     * {@link RingCentralSoftphoneCallSdk} answers the parked INVITE for `sessionId`. Returns
     * `{ accepted:false }` (never throws) when no agent identity matches the DID, so the coordinator can
     * decline the INVITE cleanly.
     */
    public async HandleInboundCall(input: InboundCallInput, contextUser: UserInfo, provider: IMetadataProvider): Promise<InboundCallResult> {
        try {
            const identity = await this.resolveAgentIdentityByPhone(input.to, contextUser);
            if (!identity) {
                return { accepted: false, reason: `No active agent identity for dialed number '${input.to}'.` };
            }
            await this.startBridge({
                agentID: identity.AgentID,
                direction: 'Inbound',
                address: input.from,
                inboundCallId: input.sessionId,
                contextUser,
                provider,
            });
            return { accepted: true };
        } catch (e) {
            LogError(`[Telephony][RingCentral] inbound call ${input.sessionId} failed: ${e instanceof Error ? e.message : String(e)}`);
            return { accepted: false, reason: 'Internal error starting the agent.' };
        }
    }

    /**
     * Places an OUTBOUND call from a given agent identity to a destination number. The bound
     * {@link RingCentralSoftphoneCallSdk} places the SIP call through the shared registration; the returned
     * SIP `Call-ID` is the bridge's external connection id.
     *
     * @returns The placed call's SIP `Call-ID`.
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

    /** Inbound INVITE coordinator: resolve the server principal, start a bridge, decline if no agent matched. */
    private async onInboundInvite(info: InboundInviteInfo): Promise<void> {
        const context = this.resolveServerContext();
        if (!context) {
            LogError('[Telephony][RingCentral] no server context user available; declining inbound call.');
            await this.handle?.declineCall(info.callId);
            return;
        }
        const result = await this.HandleInboundCall({ sessionId: info.callId, from: info.from, to: info.to }, context.user, context.provider);
        if (!result.accepted) {
            LogStatus(`[Telephony][RingCentral] inbound ${info.callId} not accepted: ${result.reason ?? 'unknown'}; declining.`);
            await this.handle?.declineCall(info.callId);
        }
    }

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
        const ringCentralProvider = this.resolveProvider();

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
            Provider: ringCentralProvider,
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

    /** Resolves the seeded RingCentral provider row (by driver class, falling back to display name). */
    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(RINGCENTRAL_PROVIDER_DRIVER) ?? this.engine.ProviderByName('RingCentral');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the RingCentral bridge (DriverClass '${RINGCENTRAL_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    /**
     * Builds the per-session SDK binding that wires a {@link RingCentralSoftphoneCallSdk} (drawing its
     * session from the shared SIP registration handle) onto the telephony driver — overriding the package's
     * default unbound SDK. Reads the handle lazily at call time so a call placed during the brief boot window
     * before registration fails loudly rather than binding a null handle.
     */
    public buildBindSdk(): BridgeNativeSdkBinding {
        return (driver) => {
            const telephony = driver as BaseTelephonyBridge;
            telephony.SetSdkFactory(() => new RingCentralSoftphoneCallSdk(this.requireHandle()));
        };
    }

    /** Returns the live registration handle, or throws if the softphone hasn't registered yet. */
    private requireHandle(): RingCentralSoftphoneHandle {
        if (!this.handle) {
            throw new Error('[Telephony][RingCentral] softphone not registered yet (start() pending or failed).');
        }
        return this.handle;
    }

    /** Assembles the per-session bridge configuration (direction / from-number / inbound-call-id / carrier rate). */
    private buildSessionConfiguration(direction: 'Inbound' | 'Outbound', fromNumber?: string, inboundCallId?: string): Record<string, unknown> {
        // The engine does NOT forward the top-level Direction into the driver's Configuration; set it here so
        // an inbound call answers instead of wrongly taking the outbound-dial path. The carrier rate tells the
        // base bridge the SIP leg is wideband (16 kHz for OPUS/16000), not the 8 kHz G.711 default.
        const config: Record<string, unknown> = {
            [DIRECTION_CONFIG_KEY]: direction,
            [CARRIER_SAMPLE_RATE_CONFIG_KEY]: this.carrierSampleRate,
        };
        if (fromNumber) {
            config[FROM_NUMBER_CONFIG_KEY] = fromNumber;
        }
        if (inboundCallId) {
            config[INBOUND_CALL_ID_CONFIG_KEY] = inboundCallId;
        }
        return config;
    }

    /** Maps the server config block to the softphone SDK's SIP-device config (credentials resolved upstream). */
    private toSoftphoneConfig(): RingCentralSoftphoneConfig {
        return {
            domain: this.config.sipDomain,
            outboundProxy: this.config.sipOutboundProxy,
            username: this.config.sipUsername,
            password: this.config.sipPassword,
            authorizationId: this.config.sipAuthorizationId,
            codec: this.config.codec,
            ignoreTlsCertErrors: this.config.ignoreTlsCertErrors,
        };
    }

    /** Resolves the server-side principal + provider for an inbound call (no MJ JWT on a SIP INVITE). */
    private resolveServerContext(): { user: UserInfo; provider: IMetadataProvider } | null {
        const user = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ?? null;
        const provider = Metadata.Provider as unknown as IMetadataProvider | undefined; // global-provider-ok: inbound SIP INVITE has no MJ JWT / per-request provider; the server's single default provider is correct
        if (!user || !provider) {
            return null;
        }
        return { user, provider };
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
            LogError(`[Telephony][RingCentral] agent-identity lookup failed: ${result.ErrorMessage}`);
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
