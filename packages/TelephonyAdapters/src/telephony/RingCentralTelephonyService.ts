/**
 * @fileoverview Orchestrates RingCentral telephony bridge sessions (inbound + outbound) for MJAPI over the
 * **SIP softphone** transport.
 *
 * @module @memberjunction/telephony-adapters
 */

import { RunView, UserInfo, IMetadataProvider, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
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
import type { RingCentralTelephonyConfig } from '../types.js';
import { IAgentSessionManager, DefaultAgentSessionManager } from '../sessionManager.js';

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
    sessionManager?: IAgentSessionManager;
    /** Test seam: a factory that builds the softphone handle (inject a fake to avoid the real SIP SDK). */
    createHandle?: typeof createRingCentralSoftphone;
}

/**
 * Starts RingCentral bridge sessions over a shared SIP-softphone registration.
 */
export class RingCentralTelephonyService {
    private readonly engine: Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'Config'>;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: IAgentSessionManager;
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
        this.sessionManager = deps.sessionManager ?? new DefaultAgentSessionManager();
        this.createHandle = deps.createHandle ?? createRingCentralSoftphone;
    }

    /**
     * Creates + registers the shared SIP softphone and wires inbound INVITE handling.
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
     * Resolves the dialed DID to a pinned agent and starts an INBOUND bridge session.
     */
    public async HandleInboundCall(input: InboundCallInput, contextUser: UserInfo, provider: IMetadataProvider): Promise<InboundCallResult> {
        try {
            await this.engine.Config(false, contextUser, provider);
            const ringCentralProvider = this.resolveProvider();
            const identity = await this.resolveAgentIdentityByPhone(input.to, ringCentralProvider.ID, contextUser);
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
     * Places an OUTBOUND call from a given agent identity to a destination number.
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

    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(RINGCENTRAL_PROVIDER_DRIVER) ?? this.engine.ProviderByName('RingCentral');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the RingCentral bridge (DriverClass '${RINGCENTRAL_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    public buildBindSdk(): BridgeNativeSdkBinding {
        return (driver) => {
            const telephony = driver as BaseTelephonyBridge;
            telephony.SetSdkFactory(() => new RingCentralSoftphoneCallSdk(this.requireHandle()));
        };
    }

    private requireHandle(): RingCentralSoftphoneHandle {
        if (!this.handle) {
            throw new Error('[Telephony][RingCentral] softphone not registered yet (start() pending or failed).');
        }
        return this.handle;
    }

    private buildSessionConfiguration(direction: 'Inbound' | 'Outbound', fromNumber?: string, inboundCallId?: string): Record<string, unknown> {
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

    private resolveServerContext(): { user: UserInfo; provider: IMetadataProvider } | null {
        const user = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ?? null;
        const provider = Metadata.Provider; // global-provider-ok: inbound telephony webhook runs in server-global provider context
        if (!user || !provider) {
            return null;
        }
        return { user, provider };
    }

    private async resolveAgentIdentityByPhone(dialedNumber: string, providerId: string, contextUser: UserInfo): Promise<MJAIBridgeAgentIdentityEntity | null> {
        const normalized = (dialedNumber ?? '').trim();
        if (!normalized) {
            return null;
        }
        const rv = new RunView();
        const result = await rv.RunView<MJAIBridgeAgentIdentityEntity>(
            {
                EntityName: AGENT_IDENTITY_ENTITY,
                ExtraFilter: `IdentityType='${PHONE_IDENTITY_TYPE}' AND IdentityValue='${EscapeSQLString(normalized)}' AND ProviderID='${EscapeSQLString(providerId)}' AND IsActive=1`,
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

    private async loadAgentIdentity(agentIdentityId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIBridgeAgentIdentityEntity | null> {
        const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
        const loaded = await entity.Load(agentIdentityId);
        if (!loaded || !entity.IsActive) {
            return null;
        }
        return entity;
    }
}
