/**
 * @fileoverview Orchestrates Twilio telephony bridge sessions (inbound + outbound) for MJAPI.
 *
 * This is the composition layer between the carrier ingress (the public webhook + the Media-Streams
 * WSS) and the ONE unified realtime-agent pathway. It does NOT re-implement any bridge logic: it
 * resolves the Twilio provider + the agent identity, opens a server-side realtime session via the
 * agent layer's `CreateBridgeRealtimeSession` factory, binds `RealTwilioBindings` (real REST client +
 * the per-call media registry) onto the driver, and hands everything to
 * `AIBridgeEngine.StartBridgeSession` — exactly the seam the LiveKit room coordinator uses.
 *
 * Collaborators are injected (engine, session factory, session manager) so the resolution/branching
 * logic is unit-testable with fakes; the actual call placement + media flow are live-only (real Twilio
 * credentials + a publicly reachable stream URL).
 *
 * @module @memberjunction/telephony-adapters
 */

import { RunView, UserInfo, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession, ResolveRealtimeCoAgentID } from '@memberjunction/ai-agents';
import { BaseTelephonyBridge, GenerateMediaToken, type BridgeNativeSdkBinding } from '@memberjunction/ai-bridge-base';
import {
    TwilioCallSdk,
    RealTwilioBindings,
    RealTwilioRestClient,
    IsMachineAnsweredBy,
    IsTerminalTwilioCallStatus,
    type ITwilioRestLike,
} from '@memberjunction/ai-bridge-twilio';
import type { TwilioTelephonyConfig } from '../types.js';
import { IAgentSessionManager, DefaultAgentSessionManager } from '../sessionManager.js';
import { TwilioCallMediaRegistry } from './twilioMediaRegistry.js';
import { CallLifecycleTracker } from './callLifecycleTracker.js';
import { CallEndObserverSdk } from './callEndObserver.js';
import { CreateCallerIdentityResolver, type ICallerIdentityResolver } from './callerIdentity.js';
import { TelephonyCapacity, type CallCapacityLease, type ICallCapacity } from './telephonyCapacity.js';
import { AuthorizeOutboundCallOrRelease, BuildTelephonyCallConfiguration, TelephonyCallSessionStarter } from './telephonyCallSession.js';
import {
    OutboundCallRefusedError,
    OutboundRateLimiter,
    ResolveOutboundPolicy,
    ResolveTransferDirectory,
    type OutboundGuardDeps,
} from './outboundCallPolicy.js';

/** The engine surface this service drives (a `Pick` so tests inject a fake). */
type TelephonyEngine = Pick<AIBridgeEngine, 'ProviderByName' | 'ProviderByDriverClass' | 'StartBridgeSession' | 'StopBridgeSession' | 'Config'>;

const TWILIO_PROVIDER_DRIVER = 'TwilioBridge';
const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';

/** A resolved inbound call's identifying fields (parsed from the Twilio webhook). */
export interface InboundCallInput {
    /** The Twilio Call SID. */
    callSid: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The caller's number (Twilio `From`). */
    from: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The dialed DID (Twilio `To`) — resolved to an agent identity. */
    to: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Result of starting an inbound bridge session. */
export interface InboundCallResult {
    /** Whether a pinned agent was resolved + a bridge session started. */
    accepted: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Why it was rejected (no agent identity for the DID, provider missing, etc.). */
    reason?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Set when the call was refused only because the server is at its concurrent-call cap (the webhook says "all agents are busy"). */
    Busy?: boolean;
    /** The per-call media token to embed in the answer TwiML (`<Parameter name="mjToken">`); present when accepted. */
    MediaToken?: string;
    /**
     * Resolves when the bridge session has finished starting (or failed and been cleaned up). The call is
     * answered WITHOUT waiting on this — Twilio's webhook timeout is short — so callers ignore it; it exists
     * for tests and diagnostics. Never rejects.
     */
    Started?: Promise<void>;
}

/** Injectable collaborators (production defaults wired in the constructor; fakes in tests). */
export interface TwilioTelephonyServiceDeps {
    engine?: TelephonyEngine;
    sessionFactory?: typeof CreateBridgeRealtimeSession;
    sessionManager?: IAgentSessionManager;
    /** The REST client used to hang up a call whose session failed to start (defaults to the real client). */
    rest?: ITwilioRestLike;
    /** Overrides the agent-permission check of the outbound gate (defaults to `AIAgentPermissionHelper`). */
    canRunAgent?: OutboundGuardDeps['CanRunAgent'];
    /** Overrides how the co-agent that voices an agent is resolved (defaults to the shared chain the browser path uses). */
    coAgentResolver?: typeof ResolveRealtimeCoAgentID;
    /** Overrides the caller-identity resolver (defaults to the host's registration, else anonymous). */
    callerResolver?: ICallerIdentityResolver;
    /** Overrides the concurrent-call gate (defaults to the process-wide {@link TelephonyCapacity}). */
    capacity?: ICallCapacity;
}

/**
 * Starts Twilio bridge sessions. One instance per server, constructed alongside the telephony router and
 * sharing the {@link TwilioCallMediaRegistry} with the Media-Streams WSS server.
 */
export class TwilioTelephonyService {
    private readonly rest: ITwilioRestLike;
    private readonly engine: TelephonyEngine;
    private readonly sessionFactory: typeof CreateBridgeRealtimeSession;
    private readonly sessionManager: IAgentSessionManager;
    private readonly tracker: CallLifecycleTracker;
    private readonly outboundGuard: OutboundGuardDeps;
    private readonly starter: TelephonyCallSessionStarter;
    private readonly capacity: ICallCapacity;

    constructor(
        private readonly config: TwilioTelephonyConfig,
        private readonly registry: TwilioCallMediaRegistry,
        deps: TwilioTelephonyServiceDeps = {},
    ) {
        this.rest =
            deps.rest ??
            new RealTwilioRestClient({
                AccountSid: config.accountSid,
                AuthToken: config.authToken,
                ApiKeySid: config.apiKeySid,
                ApiKeySecret: config.apiKeySecret,
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
        if (!deps.capacity) {
            TelephonyCapacity.Instance.Configure(config.maxConcurrentCalls);
        }
        this.capacity = deps.capacity ?? TelephonyCapacity.Instance;
        this.starter = new TelephonyCallSessionStarter({
            Engine: this.engine,
            SessionFactory: this.sessionFactory,
            SessionManager: this.sessionManager,
            CoAgentResolver: deps.coAgentResolver ?? ResolveRealtimeCoAgentID,
            CallerResolver: deps.callerResolver ?? CreateCallerIdentityResolver(),
            OutboundPolicy: policy,
            TransferTargets: ResolveTransferDirectory(config.transferTargets, policy),
        });
        this.wireRegistryHooks();
    }

    /**
     * Admits an INBOUND call: resolves the dialed DID to a pinned agent, registers the call + its media-socket
     * token, and starts the bridge session **in the background**. Returns as soon as the call is admitted so
     * the voice webhook can answer inside Twilio's short timeout; the Media-Streams socket (and any audio the
     * caller speaks) is buffered until the session is ready. Returns `{ accepted:false }` (never throws) when
     * no agent identity matches the DID, so the webhook can answer with a polite "no agent" message.
     */
    public async HandleInboundCall(input: InboundCallInput, contextUser: UserInfo, provider: IMetadataProvider): Promise<InboundCallResult> {
        try {
            await this.engine.Config(false, contextUser, provider);
            const twilioProvider = this.resolveProvider();
            const identity = await this.resolveAgentIdentityByPhone(input.to, twilioProvider.ID, contextUser);
            if (!identity) {
                return { accepted: false, reason: `No active agent identity for dialed number '${input.to}'.` };
            }
            const lease = this.capacity.TryAcquire();
            if (!lease) {
                LogError(`[Telephony][Twilio] inbound call ${input.callSid} refused: at the concurrent-call cap.`);
                return { accepted: false, Busy: true, reason: 'All agent lines are busy.' };
            }
            const token = GenerateMediaToken();
            this.registry.ExpectCall(input.callSid, token); // also marks the call as starting in the tracker
            const Started = this.startInboundInBackground(input, identity, lease, contextUser, provider);
            return { accepted: true, MediaToken: token, Started };
        } catch (e) {
            LogError(`[Telephony][Twilio] inbound call ${input.callSid} failed: ${e instanceof Error ? e.message : String(e)}`);
            return { accepted: false, reason: 'Internal error starting the agent.' };
        }
    }

    /**
     * Places an OUTBOUND call from a given agent identity to a destination number, after the shared outbound
     * gate (agent permission, destination policy, rate limit) has authorized it. The bound
     * `RealTwilioBindings.createCall` issues the Twilio REST `POST /Calls` with the `<Connect><Stream>` TwiML;
     * the returned Call SID is the bridge's external connection id.
     *
     * @returns The placed Call SID.
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
            LogError(`[Telephony][Twilio] outbound call refused: at the concurrent-call cap.`);
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
            Configuration: BuildTelephonyCallConfiguration({ Direction: 'Outbound', AgentNumber: identity.IdentityValue }),
            BindSdk: this.BuildBindSdk(),
            ContextUser: contextUser,
            MetadataProvider: provider,
            Lease: lease,
        });
        const callSid = session.RoomKey ?? '';
        await this.tracker.Attach(callSid, { SessionBridgeID: session.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        return callSid;
    }

    /**
     * Handles a Twilio status-callback event. A terminal status (`busy`, `no-answer`, `failed`, `canceled`,
     * `completed`) ends the call's bridge session — an unanswered outbound call never opens a media socket, so
     * without this the session would linger. Non-terminal statuses are ignored.
     */
    public async HandleStatusCallback(callSid: string, callStatus: string | undefined): Promise<void> {
        if (!IsTerminalTwilioCallStatus(callStatus)) {
            return;
        }
        await this.tracker.RequestEnd(callSid, 'carrier-status');
        this.registry.EndCall(callSid);
    }

    /**
     * Handles Twilio's async answering-machine verdict. A machine or fax hangs the call up unless
     * `onMachine` is `'continue'` (then the verdict is only logged). `human`/`unknown` verdicts are ignored.
     */
    public async HandleAnsweringMachine(callSid: string, answeredBy: string | undefined): Promise<void> {
        if (!IsMachineAnsweredBy(answeredBy)) {
            return;
        }
        if (this.config.onMachine === 'continue') {
            LogStatus(`[Telephony][Twilio] call ${callSid} answered by '${answeredBy}'; onMachine=continue, leaving the call up.`);
            return;
        }
        await this.tracker.RequestEnd(callSid, 'answering-machine', 'Explicit');
    }

    /** Cancels every timer and drops tracked state (server shutdown). */
    public Dispose(): void {
        this.tracker.Dispose();
        this.registry.Dispose();
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Connects the registry's lifecycle events to the tracker: a known call begins; a never-connected one ends. */
    private wireRegistryHooks(): void {
        this.registry.OnCallRegistered((callSid) => this.tracker.Begin(callSid));
        this.registry.OnConnectTimeout((callSid) => {
            void this.tracker.RequestEnd(callSid, 'media-connect-timeout').catch((e) =>
                LogError(`[Telephony][Twilio] connect-timeout stop failed for ${callSid}: ${e instanceof Error ? e.message : String(e)}`),
            );
        });
    }

    /** Starts the inbound bridge session; on failure logs, hangs the call up and frees its state. Never rejects. */
    private async startInboundInBackground(
        input: InboundCallInput,
        identity: MJAIBridgeAgentIdentityEntity,
        lease: CallCapacityLease,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        try {
            const session = await this.starter.Start({
                ResolveProvider: () => this.resolveProvider(),
                Identity: identity,
                Direction: 'Inbound',
                RemoteNumber: input.from,
                Configuration: BuildTelephonyCallConfiguration({ Direction: 'Inbound', CallerNumber: input.from, InboundCallId: input.callSid }),
                BindSdk: this.BuildBindSdk(),
                ContextUser: contextUser,
                MetadataProvider: provider,
                Lease: lease,
            });
            await this.tracker.Attach(input.callSid, { SessionBridgeID: session.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        } catch (e) {
            LogError(`[Telephony][Twilio] inbound call ${input.callSid} could not start its agent session: ${e instanceof Error ? e.message : String(e)}`);
            await this.abandonCall(input.callSid);
        }
    }

    /** Frees a call's state and hangs it up at the carrier (best-effort) — used when its session cannot start. */
    private async abandonCall(callSid: string): Promise<void> {
        this.tracker.Fail(callSid);
        this.registry.EndCall(callSid);
        try {
            await this.rest.UpdateCall(callSid, { Status: 'completed' });
        } catch (e) {
            LogError(`[Telephony][Twilio] could not hang up call ${callSid} after a failed start: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Resolves the seeded Twilio provider row (by driver class, falling back to display name). */
    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(TWILIO_PROVIDER_DRIVER) ?? this.engine.ProviderByName('Twilio');
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the Twilio bridge (DriverClass '${TWILIO_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    /**
     * Builds the per-session SDK binding that wires the REAL Twilio bindings (REST client + the per-call
     * media registry) onto the telephony driver — overriding the package's default unbound SDK. The SDK is
     * wrapped so the tracker learns of every call end (releasing the max-duration timer).
     */
    public BuildBindSdk(): BridgeNativeSdkBinding {
        return (driver) => {
            const telephony = driver as BaseTelephonyBridge;
            telephony.SetSdkFactory(
                () =>
                    new CallEndObserverSdk(
                        new TwilioCallSdk(
                            new RealTwilioBindings({
                                Rest: this.rest,
                                MediaPump: this.registry,
                                StreamUrl: this.config.streamPublicUrl,
                                StatusCallbackUrl: this.config.statusCallbackUrl,
                                AsyncAmdStatusCallbackUrl: this.config.amdStatusCallbackUrl,
                            }),
                        ),
                        (callSid) => this.tracker.Release(callSid),
                    ),
            );
        };
    }

    /** @deprecated Use {@link BuildBindSdk}. */
    public buildBindSdk(): BridgeNativeSdkBinding {
        return this.BuildBindSdk();
    }

    /** Finds the active agent identity whose phone number matches the dialed DID and Twilio provider. */
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
            LogError(`[Telephony][Twilio] agent-identity lookup failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results?.[0] ?? null;
    }

    /** Loads a specific agent identity by id (used by outbound PlaceCall), requiring it be active. */
    private async loadAgentIdentity(agentIdentityId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIBridgeAgentIdentityEntity | null> {
        const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
        const loaded = await entity.Load(agentIdentityId);
        if (!loaded || !entity.IsActive) {
            return null;
        }
        return entity;
    }
}
