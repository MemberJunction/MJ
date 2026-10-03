/**
 * @fileoverview Orchestrates RingCentral telephony bridge sessions (inbound + outbound) for MJAPI over the
 * **SIP softphone** transport.
 *
 * @module @memberjunction/telephony-adapters
 */

import { RunView, UserInfo, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession, ResolveRealtimeCoAgentID } from '@memberjunction/ai-agents';
import { BaseTelephonyBridge, type BridgeNativeSdkBinding, CARRIER_SAMPLE_RATE_CONFIG_KEY } from '@memberjunction/ai-bridge-base';
import {
    createRingCentralSoftphone,
    RingCentralSoftphoneCallSdk,
    type RingCentralSoftphoneConfig,
    type RingCentralSoftphoneHandle,
    type InboundInviteInfo,
} from '@memberjunction/ai-bridge-ringcentral';
import type { RingCentralTelephonyConfig } from '../types.js';
import { IAgentSessionManager, DefaultAgentSessionManager } from '../sessionManager.js';
import { ResolveInboundContext } from './runAsIdentity.js';
import { CallLifecycleTracker } from './callLifecycleTracker.js';
import { CallEndObserverSdk } from './callEndObserver.js';
import { CreateCallerIdentityResolver, type ICallerIdentityResolver } from './callerIdentity.js';
import { TelephonyCapacity, type ICallCapacity } from './telephonyCapacity.js';
import { AuthorizeOutboundCallOrRelease, BuildTelephonyCallConfiguration, TelephonyCallSessionStarter } from './telephonyCallSession.js';
import {
    OutboundCallRefusedError,
    OutboundRateLimiter,
    ResolveOutboundPolicy,
    type OutboundGuardDeps,
} from './outboundCallPolicy.js';

/** The engine surface this service drives (a `Pick` so tests inject a fake). */
type TelephonyEngine = Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'StopBridgeSession' | 'Config'>;

const RINGCENTRAL_PROVIDER_DRIVER = 'RingCentralBridge';
const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';

/** PCM16 carrier rate (Hz) per softphone codec — the rate the bridge resamples to/from the model rate. */
const CODEC_CARRIER_RATE: Record<NonNullable<RingCentralSoftphoneConfig['codec']>, number> = {
    'OPUS/16000': 16000,
    'OPUS/48000/2': 48000,
    'PCMU/8000': 8000,
};

/**
 * How long SIP registration may stay pending before the extension reports itself unhealthy. Registration is
 * normally a one-round-trip exchange; a minute of silence means the proxy is unreachable or the credentials are
 * being ignored, and inbound calls to this line are going nowhere.
 */
export const REGISTRATION_DEADLINE_MS = 60_000;

/** The longest registration-failure reason exposed through health reporting. */
const REGISTRATION_REASON_MAX_CHARS = 300;

/** Where the shared SIP registration stands. */
export type RingCentralRegistrationState = 'not-started' | 'pending' | 'registered' | 'failed';

/** The registration state plus a verdict, for health reporting. */
export interface RingCentralRegistrationStatus {
    State: RingCentralRegistrationState;
    /** Why it is unhealthy (the failure, or how long it has been pending); absent when healthy. */
    Reason?: string;
    /** Whether the line can be expected to receive calls: registered, or still within the registration deadline. */
    Healthy: boolean;
}

/** A resolved inbound call's identifying fields (mapped from a RingCentral SIP INVITE). */
export interface InboundCallInput {
    /** The SIP `Call-ID` (the per-call id the handle parked the INVITE under + the bridge's inbound id). */
    sessionId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The caller's number (the INVITE's `From`). */
    from: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The dialed DID (the INVITE's `To`) — resolved to an agent identity. */
    to: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Result of starting an inbound bridge session. */
export interface InboundCallResult {
    /** Whether a pinned agent was resolved + a bridge session started. */
    accepted: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Why it was rejected (no agent identity for the DID, provider missing, etc.). */
    reason?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Set when the call was refused only because the server is at its concurrent-call cap. */
    Busy?: boolean;
}

/** Injectable collaborators (production defaults wired in the constructor; fakes in tests). */
export interface RingCentralTelephonyServiceDeps {
    engine?: TelephonyEngine;
    sessionFactory?: typeof CreateBridgeRealtimeSession;
    sessionManager?: IAgentSessionManager;
    /** Overrides the agent-permission check of the outbound gate (defaults to `AIAgentPermissionHelper`). */
    canRunAgent?: OutboundGuardDeps['CanRunAgent'];
    /** Overrides how the co-agent that voices an agent is resolved (defaults to the shared chain the browser path uses). */
    coAgentResolver?: typeof ResolveRealtimeCoAgentID;
    /** Overrides the caller-identity resolver (defaults to the host's registration, else anonymous). */
    callerResolver?: ICallerIdentityResolver;
    /** Overrides the concurrent-call gate (defaults to the process-wide {@link TelephonyCapacity}). */
    capacity?: ICallCapacity;
    /** Test seam: the clock used for the registration deadline. */
    now?: () => number;
    /** Test seam: a factory that builds the softphone handle (inject a fake to avoid the real SIP SDK). */
    createHandle?: typeof createRingCentralSoftphone;
}

/**
 * Starts RingCentral bridge sessions over a shared SIP-softphone registration.
 */
export class RingCentralTelephonyService {
    private readonly engine: TelephonyEngine;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: IAgentSessionManager;
    private readonly createHandle: typeof createRingCentralSoftphone;
    private readonly tracker: CallLifecycleTracker;
    private readonly outboundGuard: OutboundGuardDeps;
    private readonly starter: TelephonyCallSessionStarter;
    private readonly capacity: ICallCapacity;
    private readonly now: () => number;

    /** Where SIP registration stands (reported by health checks). */
    private registration: { State: RingCentralRegistrationState; Reason?: string; SinceMs: number } = { State: 'not-started', SinceMs: 0 };

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
        this.tracker = new CallLifecycleTracker(
            (session, reason) => this.engine.StopBridgeSession(session.SessionBridgeID, reason, session.ContextUser, session.Provider),
            config.maxCallSeconds,
        );
        const policy = ResolveOutboundPolicy(config.outbound);
        this.outboundGuard = { Policy: policy, Limiter: new OutboundRateLimiter(policy.MaxCallsPerUserPerHour), CanRunAgent: deps.canRunAgent };
        if (!deps.capacity) {
            TelephonyCapacity.Instance.Configure(config.maxConcurrentCalls);
        }
        this.capacity = deps.capacity ?? TelephonyCapacity.Instance;
        this.now = deps.now ?? Date.now;
        this.starter = new TelephonyCallSessionStarter({
            Engine: this.engine,
            SessionFactory: this.sessionFactory,
            SessionManager: this.sessionManager,
            CoAgentResolver: deps.coAgentResolver ?? ResolveRealtimeCoAgentID,
            CallerResolver: deps.callerResolver ?? CreateCallerIdentityResolver(),
            OutboundPolicy: policy,
        });
    }

    /**
     * Whether the SIP line can be expected to receive calls. `Start()` swallows a registration failure (it only
     * logs), so without this the extension would report healthy while every inbound call went unanswered.
     * Pending is healthy only until {@link REGISTRATION_DEADLINE_MS}; a failure is unhealthy with its reason.
     */
    public GetRegistrationStatus(): RingCentralRegistrationStatus {
        const { State, Reason, SinceMs } = this.registration;
        switch (State) {
            case 'registered':
                return { State, Healthy: true };
            case 'failed':
                return { State, Reason, Healthy: false };
            case 'pending': {
                const waitedMs = this.now() - SinceMs;
                return waitedMs > REGISTRATION_DEADLINE_MS
                    ? { State, Reason: `SIP registration has been pending for ${Math.round(waitedMs / 1000)}s.`, Healthy: false }
                    : { State, Healthy: true };
            }
            default:
                return { State, Reason: 'SIP registration has not been started.', Healthy: false };
        }
    }

    /**
     * Creates + registers the shared SIP softphone and wires inbound INVITE handling.
     */
    public async Start(): Promise<void> {
        this.registration = { State: 'pending', SinceMs: this.now() };
        try {
            this.carrierSampleRate = CODEC_CARRIER_RATE[this.config.codec ?? 'OPUS/16000'];
            this.handle = await this.createHandle(this.toSoftphoneConfig());
            this.handle.onInvite((info) => void this.onInboundInvite(info));
            await this.handle.register();
            this.registration = { State: 'registered', SinceMs: this.now() };
            LogStatus('[Telephony][RingCentral] softphone telephony started (inbound + outbound ready).');
        } catch (e) {
            this.handle = null;
            const message = e instanceof Error ? e.message : String(e);
            this.registration = { State: 'failed', Reason: message.slice(0, REGISTRATION_REASON_MAX_CHARS), SinceMs: this.now() };
            LogError(`[Telephony][RingCentral] softphone start failed: ${message}`);
        }
    }

    /** @deprecated Use {@link Start}. */
    public async start(): Promise<void> {
        return this.Start();
    }

    /** Best-effort teardown of the SIP registration (server shutdown). */
    public dispose(): void {
        this.handle?.dispose();
        this.handle = null;
        this.registration = { State: 'not-started', SinceMs: 0 };
        this.tracker.Dispose();
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
            const lease = this.capacity.TryAcquire();
            if (!lease) {
                LogError(`[Telephony][RingCentral] inbound call ${input.sessionId} refused: at the concurrent-call cap.`);
                return { accepted: false, Busy: true, reason: 'All agent lines are busy.' };
            }
            this.tracker.Begin(input.sessionId);
            try {
                const session = await this.starter.Start({
                    ResolveProvider: () => this.resolveProvider(),
                    Identity: identity,
                    Direction: 'Inbound',
                    RemoteNumber: input.from,
                    Configuration: BuildTelephonyCallConfiguration({
                        Direction: 'Inbound',
                        CallerNumber: input.from,
                        InboundCallId: input.sessionId,
                        Extra: { [CARRIER_SAMPLE_RATE_CONFIG_KEY]: this.carrierSampleRate },
                    }),
                    BindSdk: this.BuildBindSdk(),
                    ContextUser: contextUser,
                    MetadataProvider: provider,
                    Lease: lease,
                });
                await this.tracker.Attach(input.sessionId, { SessionBridgeID: session.SessionBridgeID, ContextUser: contextUser, Provider: provider });
            } catch (e) {
                this.tracker.Fail(input.sessionId);
                throw e;
            }
            return { accepted: true };
        } catch (e) {
            LogError(`[Telephony][RingCentral] inbound call ${input.sessionId} failed: ${e instanceof Error ? e.message : String(e)}`);
            return { accepted: false, reason: 'Internal error starting the agent.' };
        }
    }

    /**
     * Places an OUTBOUND call from a given agent identity to a destination number, after the shared outbound
     * gate (agent permission, destination policy, rate limit) has authorized it.
     *
     * @throws {OutboundCallRefusedError} when the gate refuses the call (the message is caller-safe).
     */
    public async PlaceOutboundCall(agentIdentityId: string, toNumber: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
        const identity = await this.loadAgentIdentity(agentIdentityId, contextUser, provider);
        if (!identity) {
            throw new Error(`Agent identity '${agentIdentityId}' not found or inactive.`);
        }
        await this.engine.Config(false, contextUser, provider);
        const to = (toNumber ?? '').trim();
        const lease = this.capacity.TryAcquire();
        if (!lease) {
            LogError(`[Telephony][RingCentral] outbound call refused: at the concurrent-call cap.`);
            throw new OutboundCallRefusedError('All agent lines are busy right now; try again shortly.', 'at-capacity');
        }
        const verdict = await AuthorizeOutboundCallOrRelease(
            { User: contextUser, AgentIdentity: identity, CarrierProviderID: this.resolveProvider().ID, ToNumber: to },
            this.outboundGuard,
            lease,
        );
        if (!verdict.Allowed) {
            throw new OutboundCallRefusedError(verdict.Reason, verdict.Code);
        }
        const session = await this.starter.Start({
            ResolveProvider: () => this.resolveProvider(),
            Identity: identity,
            Direction: 'Outbound',
            RemoteNumber: to,
            Configuration: BuildTelephonyCallConfiguration({
                Direction: 'Outbound',
                AgentNumber: identity.IdentityValue,
                Extra: { [CARRIER_SAMPLE_RATE_CONFIG_KEY]: this.carrierSampleRate },
            }),
            BindSdk: this.BuildBindSdk(),
            ContextUser: contextUser,
            MetadataProvider: provider,
            Lease: lease,
        });
        const callId = session.RoomKey ?? '';
        await this.tracker.Attach(callId, { SessionBridgeID: session.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        return callId;
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /**
     * Inbound INVITE coordinator: resolve the configured run-as user, start a bridge, decline the INVITE when the
     * call cannot be admitted (no run-as user, or no agent matched the dialed number).
     */
    private async onInboundInvite(info: InboundInviteInfo): Promise<void> {
        const context = ResolveInboundContext(this.config.inboundRunAsUserEmail);
        if (!context.Ok) {
            LogError(`[Telephony][RingCentral] rejecting inbound call ${info.callId} to ${info.to}: ${context.Reason}`);
            await this.handle?.declineCall(info.callId);
            return;
        }
        const result = await this.HandleInboundCall({ sessionId: info.callId, from: info.from, to: info.to }, context.User, context.Provider);
        if (!result.accepted) {
            LogStatus(`[Telephony][RingCentral] inbound ${info.callId} not accepted: ${result.reason ?? 'unknown'}; declining.`);
            await this.handle?.declineCall(info.callId);
        }
    }

    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(RINGCENTRAL_PROVIDER_DRIVER) ?? this.engine.ProviderByName('RingCentral');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the RingCentral bridge (DriverClass '${RINGCENTRAL_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    public BuildBindSdk(): BridgeNativeSdkBinding {
        return (driver) => {
            const telephony = driver as BaseTelephonyBridge;
            // Wrapped so the tracker learns of every call end (releasing the max-duration timer).
            telephony.SetSdkFactory(() => new CallEndObserverSdk(new RingCentralSoftphoneCallSdk(this.requireHandle()), (callId) => this.tracker.Release(callId)));
        };
    }

    /** @deprecated Use {@link BuildBindSdk}. */
    public buildBindSdk(): BridgeNativeSdkBinding {
        return this.BuildBindSdk();
    }

    private requireHandle(): RingCentralSoftphoneHandle {
        if (!this.handle) {
            throw new Error('[Telephony][RingCentral] softphone not registered yet (start() pending or failed).');
        }
        return this.handle;
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
