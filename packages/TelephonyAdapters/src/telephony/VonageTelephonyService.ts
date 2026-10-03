/**
 * @fileoverview Orchestrates Vonage telephony bridge sessions (inbound + outbound) for MJAPI.
 *
 * @module @memberjunction/telephony-adapters
 */

import { RunView, UserInfo, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import {
    BaseTelephonyBridge,
    GenerateMediaToken,
    type BridgeNativeSdkBinding,
    DIRECTION_CONFIG_KEY,
    FROM_NUMBER_CONFIG_KEY,
    INBOUND_CALL_ID_CONFIG_KEY,
} from '@memberjunction/ai-bridge-base';
import {
    VonageCallSdk,
    RealVonageBindings,
    RealVonageVoiceClient,
    IsTerminalVonageCallStatus,
    IsVonageMachineStatus,
    type IVonageVoiceLike,
} from '@memberjunction/ai-bridge-vonage';
import type { VonageTelephonyConfig } from '../types.js';
import { IAgentSessionManager, DefaultAgentSessionManager } from '../sessionManager.js';
import { VonageCallMediaRegistry } from './vonageMediaRegistry.js';
import { CallLifecycleTracker } from './callLifecycleTracker.js';
import { CallEndObserverSdk } from './callEndObserver.js';
import {
    AuthorizeOutboundCall,
    OutboundCallRefusedError,
    OutboundRateLimiter,
    ResolveOutboundPolicy,
    type OutboundGuardDeps,
} from './outboundCallPolicy.js';

/** The engine surface this service drives (a `Pick` so tests inject a fake). */
type TelephonyEngine = Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'StopBridgeSession' | 'Config'>;

const VONAGE_PROVIDER_DRIVER = 'VonageBridge';
const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';

/** A resolved inbound call's identifying fields (parsed from the Vonage answer/event webhook). */
export interface InboundCallInput {
    /** The Vonage call UUID (`uuid` / `conversation_uuid`). */
    callId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The caller's number (Vonage `from`). */
    from: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The dialed DID (Vonage `to`) — resolved to an agent identity. */
    to: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Result of admitting an inbound call. */
export interface InboundCallResult {
    /** Whether a pinned agent was resolved + the call admitted. */
    accepted: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Why it was rejected (no agent identity for the DID, provider missing, etc.). */
    reason?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The per-call media token to put on the NCCO's websocket URI (`mj_token`); present when accepted. */
    MediaToken?: string;
    /**
     * Resolves when the bridge session has finished starting (or failed and been cleaned up). The call is
     * answered WITHOUT waiting on this — Vonage's answer webhook has a ~5 s budget — so callers ignore it; it
     * exists for tests and diagnostics. Never rejects.
     */
    Started?: Promise<void>;
}

/** Injectable collaborators (production defaults wired in the constructor; fakes in tests). */
export interface VonageTelephonyServiceDeps {
    engine?: TelephonyEngine;
    sessionFactory?: typeof CreateBridgeRealtimeSession;
    sessionManager?: IAgentSessionManager;
    /** The Voice client used to hang up a call whose session failed to start (defaults to the real client). */
    voice?: IVonageVoiceLike;
    /** Overrides the agent-permission check of the outbound gate (defaults to `AIAgentPermissionHelper`). */
    canRunAgent?: OutboundGuardDeps['CanRunAgent'];
}

/**
 * Starts Vonage bridge sessions. One instance per server, constructed alongside the telephony router and
 * sharing the {@link VonageCallMediaRegistry} with the media WSS server.
 */
export class VonageTelephonyService {
    private readonly voice: IVonageVoiceLike;
    private readonly engine: TelephonyEngine;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: IAgentSessionManager;
    private readonly tracker: CallLifecycleTracker;
    private readonly outboundGuard: OutboundGuardDeps;

    constructor(
        private readonly config: VonageTelephonyConfig,
        private readonly registry: VonageCallMediaRegistry,
        deps: VonageTelephonyServiceDeps = {},
    ) {
        this.voice =
            deps.voice ??
            new RealVonageVoiceClient({
                ApplicationId: config.applicationId,
                PrivateKey: config.privateKey,
                ApiKey: config.apiKey,
                ApiSecret: config.apiSecret,
            });
        this.engine = deps.engine ?? AIBridgeEngine.Instance;
        this.sessionFactory = deps.sessionFactory ?? CreateBridgeRealtimeSession;
        this.sessionManager = deps.sessionManager ?? new DefaultAgentSessionManager();
        this.tracker = new CallLifecycleTracker(
            (session, reason) => this.engine.StopBridgeSession(session.SessionBridgeID, reason, session.ContextUser, session.Provider),
            config.maxCallSeconds,
        );
        const policy = ResolveOutboundPolicy(config.outbound);
        this.outboundGuard = { Policy: policy, Limiter: new OutboundRateLimiter(policy.MaxCallsPerUserPerHour), CanRunAgent: deps.canRunAgent };
        this.wireRegistryHooks();
    }

    /**
     * Admits an INBOUND call: resolves the dialed DID to a pinned agent, registers the call + its media-socket
     * token, and starts the bridge session **in the background**. Returns as soon as the call is admitted so the
     * answer webhook can reply inside Vonage's short budget; the media socket (and any audio the caller speaks)
     * is buffered until the session is ready. Returns `{ accepted:false }` (never throws) when no agent
     * identity matches the DID.
     */
    public async HandleInboundCall(input: InboundCallInput, contextUser: UserInfo, provider: IMetadataProvider): Promise<InboundCallResult> {
        try {
            await this.engine.Config(false, contextUser, provider);
            const vonageProvider = this.resolveProvider();
            const identity = await this.resolveAgentIdentityByPhone(input.to, vonageProvider.ID, contextUser);
            if (!identity) {
                return { accepted: false, reason: `No active agent identity for dialed number '${input.to}'.` };
            }
            const token = GenerateMediaToken();
            this.registry.ExpectCall(input.callId, token); // also marks the call as starting in the tracker
            const Started = this.startInboundInBackground(input, identity.AgentID, contextUser, provider);
            return { accepted: true, MediaToken: token, Started };
        } catch (e) {
            LogError(`[Telephony][Vonage] inbound call ${input.callId} failed: ${e instanceof Error ? e.message : String(e)}`);
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
        const verdict = await AuthorizeOutboundCall(
            { User: contextUser, AgentIdentity: identity, CarrierProviderID: this.resolveProvider().ID, ToNumber: to },
            this.outboundGuard,
        );
        if (!verdict.Allowed) {
            throw new OutboundCallRefusedError(verdict.Reason, verdict.Code);
        }
        const session = await this.startBridge({ agentID: identity.AgentID, direction: 'Outbound', address: to, fromNumber: identity.IdentityValue, contextUser, provider });
        const callId = session.RoomKey ?? '';
        await this.tracker.Attach(callId, { SessionBridgeID: session.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        return callId;
    }

    /**
     * Handles a Vonage event-webhook payload. A terminal `status` (busy, failed, rejected, timeout, cancelled,
     * unanswered, completed) ends the call's bridge session — an unanswered outbound call never opens a media
     * socket, so without this the session would linger. A `machine` status hangs up unless `onMachine` is
     * `'continue'`. Other statuses are ignored.
     */
    public async HandleCallEvent(callId: string, status: string | undefined): Promise<void> {
        if (IsVonageMachineStatus(status)) {
            await this.handleMachine(callId);
            return;
        }
        if (!IsTerminalVonageCallStatus(status)) {
            return;
        }
        await this.tracker.RequestEnd(callId, 'carrier-status');
        this.registry.EndCall(callId);
    }

    /** Cancels every timer and drops tracked state (server shutdown). */
    public Dispose(): void {
        this.tracker.Dispose();
        this.registry.Dispose();
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Applies `onMachine` to an answering-machine verdict (Vonage may already have hung up under `hangup`). */
    private async handleMachine(callId: string): Promise<void> {
        if (this.config.onMachine === 'continue') {
            LogStatus(`[Telephony][Vonage] call ${callId} answered by a machine; onMachine=continue, leaving the call up.`);
            return;
        }
        await this.tracker.RequestEnd(callId, 'answering-machine', 'Explicit');
    }

    /** Connects the registry's lifecycle events to the tracker: a known call begins; a never-connected one ends. */
    private wireRegistryHooks(): void {
        this.registry.OnCallRegistered((callId) => this.tracker.Begin(callId));
        this.registry.OnConnectTimeout((callKey) => {
            void this.tracker.RequestEnd(callKey, 'media-connect-timeout').catch((e) =>
                LogError(`[Telephony][Vonage] connect-timeout stop failed for ${callKey}: ${e instanceof Error ? e.message : String(e)}`),
            );
        });
    }

    /** Starts the inbound bridge session; on failure logs, hangs the call up and frees its state. Never rejects. */
    private async startInboundInBackground(input: InboundCallInput, agentID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
        try {
            const session = await this.startBridge({ agentID, direction: 'Inbound', address: input.from, inboundCallId: input.callId, contextUser, provider });
            await this.tracker.Attach(input.callId, { SessionBridgeID: session.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        } catch (e) {
            LogError(`[Telephony][Vonage] inbound call ${input.callId} could not start its agent session: ${e instanceof Error ? e.message : String(e)}`);
            await this.abandonCall(input.callId);
        }
    }

    /** Frees a call's state and hangs it up at the carrier (best-effort) — used when its session cannot start. */
    private async abandonCall(callId: string): Promise<void> {
        this.tracker.Fail(callId);
        this.registry.EndCall(callId);
        try {
            await this.voice.HangupCall(callId);
        } catch (e) {
            LogError(`[Telephony][Vonage] could not hang up call ${callId} after a failed start: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async startBridge(args: {
        agentID: string;
        direction: 'Inbound' | 'Outbound';
        address: string;
        inboundCallId?: string;
        fromNumber?: string;
        contextUser: UserInfo;
        provider: IMetadataProvider;
    }): Promise<{ RoomKey?: string; SessionBridgeID: string }> {
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
            BindSdk: this.BuildBindSdk(),
            ContextUser: args.contextUser,
            MetadataProvider: args.provider,
        });
        return { RoomKey: active.RoomKey, SessionBridgeID: active.SessionBridgeID };
    }

    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(VONAGE_PROVIDER_DRIVER) ?? this.engine.ProviderByName('Vonage');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the Vonage bridge (DriverClass '${VONAGE_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    /**
     * Builds the per-session SDK binding that wires the REAL Vonage bindings onto the telephony driver. The SDK
     * is wrapped so the tracker learns of every call end (releasing the max-duration timer). Outbound calls
     * enable machine detection per `onMachine` (default `'hangup'`).
     */
    public BuildBindSdk(): BridgeNativeSdkBinding {
        return (driver) => {
            const telephony = driver as BaseTelephonyBridge;
            telephony.SetSdkFactory(
                () =>
                    new CallEndObserverSdk(
                        new VonageCallSdk(
                            new RealVonageBindings({
                                Voice: this.voice,
                                MediaPump: this.registry,
                                MediaWssUrl: this.config.mediaPublicUrl,
                                EventUrl: this.config.eventUrl,
                                MachineDetection: this.config.onMachine ?? 'hangup',
                            }),
                        ),
                        (callId) => this.tracker.Release(callId),
                    ),
            );
        };
    }

    /** @deprecated Use {@link BuildBindSdk}. */
    public buildBindSdk(): BridgeNativeSdkBinding {
        return this.BuildBindSdk();
    }

    private buildSessionConfiguration(direction: 'Inbound' | 'Outbound', fromNumber?: string, inboundCallId?: string): Record<string, unknown> {
        const config: Record<string, unknown> = { [DIRECTION_CONFIG_KEY]: direction };
        if (fromNumber) {
            config[FROM_NUMBER_CONFIG_KEY] = fromNumber;
        }
        if (inboundCallId) {
            config[INBOUND_CALL_ID_CONFIG_KEY] = inboundCallId;
        }
        return config;
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
            LogError(`[Telephony][Vonage] agent-identity lookup failed: ${result.ErrorMessage}`);
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
