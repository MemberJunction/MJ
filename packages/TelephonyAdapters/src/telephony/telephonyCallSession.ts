/**
 * @fileoverview Starts ONE phone call's agent session, the same way for every carrier.
 *
 * Twilio, Vonage and RingCentral differ in how a call reaches MJ and how its media is carried, but once a call is
 * admitted the work is identical: pick the co-agent that voices the dialled agent, create the agent session, open
 * the realtime model session with the phone framing and call-control tools, start the bridge session on the bridge
 * engine, and wire what happens next — barge-in, recovery from a dropped model session, the transcript, and
 * cleanup. That used to be copied into each carrier's service (and had drifted); it lives here once.
 *
 * What the helper guarantees:
 * - the **co-agent** is resolved through the shared chain (the browser path's), and the dialled agent is the
 *   TARGET it voices — the two are never collapsed into one id;
 * - the call-capacity lease and the agent-session row are released/closed on EVERY path — a failed start, a
 *   normal hang-up, a model loss — never leaked;
 * - the transcript lands in the call's OWN conversation, with the dialled agent attributed;
 * - a talk-over drops queued spoken progress but leaves delegated work running (the caller cancels it explicitly);
 * - a model session lost mid-call is re-opened once with the conversation so far (the engine owns the retry cap).
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession } from '@memberjunction/ai';
import type { MJAIAgentSessionEntity, MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity, MJInteractionEntity } from '@memberjunction/core-entities';
import type { AIBridgeEngine, ActiveBridgeSession, BridgeRealtimeSessionRecoveryRequest } from '@memberjunction/ai-bridge-server';
import { CreateBridgeRealtimeSession, CreateBridgeSessionTranscriptSink, GetBridgeRealtimeRuntime, ResolveRealtimeCoAgentID } from '@memberjunction/ai-agents';
import {
    CALLER_NUMBER_CONFIG_KEY,
    DIRECTION_CONFIG_KEY,
    FROM_NUMBER_CONFIG_KEY,
    INBOUND_CALL_ID_CONFIG_KEY,
    type BridgeDisconnectReason,
    type BridgeNativeSdkBinding,
} from '@memberjunction/ai-bridge-base';
import type { IAgentSessionManager } from '../sessionManager.js';
import { ResolveCallerSafely, type ICallerIdentityResolver } from './callerIdentity.js';
import type { CallCapacityLease } from './telephonyCapacity.js';
import {
    AuthorizeOutboundCall,
    type OutboundAuthorization,
    type OutboundCallPolicy,
    type OutboundCallRequest,
    type OutboundGuardDeps,
    type TransferTarget,
} from './outboundCallPolicy.js';
import { BuildPhoneFraming, BuildTelephonyTools, TelephonyCallToolExecutor, type TelephonyToolFeatures } from './telephonyCallTools.js';
import { FindPhoneNumber } from './agentIdentityLookup.js';
import { InteractionLifecycleService } from './interactionLifecycle.js';

const AGENT_SESSION_ENTITY = 'MJ: AI Agent Sessions';

/** The part of the bridge engine the starter drives (a `Pick` so tests inject a fake). */
export type TelephonyStartEngine = Pick<AIBridgeEngine, 'Config' | 'StartBridgeSession' | 'StopBridgeSession'>;

/** The collaborators the starter uses (production defaults are wired by each carrier service). */
export interface TelephonyCallStarterDeps {
    Engine: TelephonyStartEngine;
    SessionFactory: typeof CreateBridgeRealtimeSession;
    SessionManager: IAgentSessionManager;
    /** Resolves the co-agent for a target agent (defaults to the shared chain). */
    CoAgentResolver: typeof ResolveRealtimeCoAgentID;
    /** Resolves who an inbound caller is. */
    CallerResolver: ICallerIdentityResolver;
    /** The outbound policy a transfer destination is checked against. */
    OutboundPolicy: OutboundCallPolicy;
    /** The validated transfer directory (`telephony.transferTargets`); empty means the agent cannot transfer. */
    TransferTargets?: readonly TransferTarget[];
    /** Manages Interaction, InteractionEvent, and InteractionLink rows. */
    InteractionLifecycle?: InteractionLifecycleService;
    /** Estimated carrier cost per minute for computing CostEstimate on Interaction. */
    CostPerMinute?: number;
}

/** One call to start. */
export interface TelephonyCallStartArgs {
    /** Resolves the seeded carrier provider row (called after the engine's metadata is loaded; may throw when it is missing). */
    ResolveProvider: () => MJAIBridgeProviderEntity;
    /** The agent identity (the DID the agent answers on, and the agent it pins). */
    Identity: Pick<MJAIBridgeAgentIdentityEntity, 'AgentID' | 'IdentityValue'>;
    Direction: 'Inbound' | 'Outbound';
    /** The other party's number: the caller (inbound) or the number being dialled (outbound). */
    RemoteNumber: string;
    /** The driver configuration — build it with {@link BuildTelephonyCallConfiguration}. */
    Configuration: Record<string, unknown>;
    /** Binds the carrier's real SDK onto the driver. */
    BindSdk: BridgeNativeSdkBinding;
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
    /** The capacity slot the call already holds; the starter owns releasing it. */
    Lease: CallCapacityLease;
}

/** The identifiers a carrier service needs once the call's session is up. */
export interface StartedTelephonyCall {
    /** The carrier's call id (the bridge's external connection id). */
    RoomKey?: string;
    SessionBridgeID: string;
}

/** The inputs of the per-call driver configuration. */
export interface CallConfigurationInput {
    Direction: 'Inbound' | 'Outbound';
    /** Outbound only: the agent's caller-id the call originates from. */
    AgentNumber?: string;
    /** Inbound only: the caller's number. */
    CallerNumber?: string;
    /** Inbound only: the carrier's id for the call being answered. */
    InboundCallId?: string;
    /** Carrier-specific extra keys (e.g. RingCentral's negotiated carrier sample rate). */
    Extra?: Record<string, unknown>;
}

/**
 * Builds the bridge `Configuration` the telephony driver reads. For an inbound call the roster needs the agent's
 * own number and the caller's number kept apart: the driver's `Address` is the agent's DID, and the caller's
 * number rides in {@link CALLER_NUMBER_CONFIG_KEY}.
 */
export function BuildTelephonyCallConfiguration(input: CallConfigurationInput): Record<string, unknown> {
    const config: Record<string, unknown> = { ...(input.Extra ?? {}), [DIRECTION_CONFIG_KEY]: input.Direction };
    if (input.AgentNumber) {
        config[FROM_NUMBER_CONFIG_KEY] = input.AgentNumber;
    }
    if (input.CallerNumber) {
        config[CALLER_NUMBER_CONFIG_KEY] = input.CallerNumber;
    }
    if (input.InboundCallId) {
        config[INBOUND_CALL_ID_CONFIG_KEY] = input.InboundCallId;
    }
    return config;
}

/** The mutable handles the per-call callbacks share (the bridge session exists only after the engine starts). */
interface CallRuntimeRef {
    /** The model session opened first, before the engine has started. */
    Initial?: IRealtimeSession;
    /** The live bridge session once started. */
    Active?: ActiveBridgeSession;
}

/**
 * Runs the outbound gate for a call that already holds a capacity slot, giving the slot back when the gate
 * refuses or throws — a refused call must not keep a line busy.
 */
export async function AuthorizeOutboundCallOrRelease(
    request: OutboundCallRequest,
    guard: OutboundGuardDeps,
    lease: CallCapacityLease,
): Promise<OutboundAuthorization> {
    try {
        const verdict = await AuthorizeOutboundCall(request, guard);
        if (!verdict.Allowed) {
            lease.Release();
        }
        return verdict;
    } catch (e) {
        lease.Release();
        throw e;
    }
}

/** Starts phone calls' agent sessions. One instance per carrier service. */
export class TelephonyCallSessionStarter {
    constructor(private readonly deps: TelephonyCallStarterDeps) {}

    /**
     * Starts the call's agent session. On ANY failure the lease is released, the agent-session row closed and the
     * model session closed before the error is rethrown, its co-agent run finalized as failed with the start's error;
     * on success {@link TelephonyCallStartArgs.Lease} is released when the session ends.
     */
    public async Start(args: TelephonyCallStartArgs): Promise<StartedTelephonyCall> {
        let agentSession: MJAIAgentSessionEntity | undefined;
        let interaction: MJInteractionEntity | null = null;
        const ref: CallRuntimeRef = {};
        const lifecycle = this.deps.InteractionLifecycle ?? InteractionLifecycleService.Instance;
        try {
            await this.deps.Engine.Config(false, args.ContextUser, args.MetadataProvider);
            const carrier = args.ResolveProvider();
            const coAgentID = await this.deps.CoAgentResolver(args.Identity.AgentID, undefined, args.ContextUser, args.MetadataProvider);
            agentSession = await this.deps.SessionManager.CreateSession({ agentID: coAgentID, userID: args.ContextUser.ID }, args.ContextUser, args.MetadataProvider);

            const phone = await FindPhoneNumber(
                args.Direction === 'Inbound' ? args.Identity.IdentityValue : ((args.Configuration[FROM_NUMBER_CONFIG_KEY] as string) ?? ''),
                carrier.ID,
                args.ContextUser,
                args.MetadataProvider,
            );

            interaction = await lifecycle.CreateInteraction({
                Channel: 'Phone',
                Direction: args.Direction,
                PhoneNumberID: phone?.ID ?? null,
                RemoteAddress: args.RemoteNumber,
                ExternalID: (args.Configuration[INBOUND_CALL_ID_CONFIG_KEY] as string) ?? null,
                AgentSessionID: agentSession.ID,
                RoomName: args.RemoteNumber,
                Status: 'Active',
                StartedAt: new Date(),
                ContextUser: args.ContextUser,
                MetadataProvider: args.MetadataProvider,
            });

            return await this.startWithSession(args, carrier, coAgentID, agentSession, ref, interaction?.ID);
        } catch (e) {
            args.Lease.Release();
            await this.closeFailedStartSession(ref.Initial, e);
            if (agentSession) {
                await this.closeAgentSession(agentSession.ID, 'Error', args.ContextUser, args.MetadataProvider);
            }
            if (interaction) {
                await lifecycle.CloseInteraction({
                    InteractionID: interaction.ID,
                    EndReason: 'Error',
                    ContextUser: args.ContextUser,
                    MetadataProvider: args.MetadataProvider,
                });
            }
            throw e;
        }
    }

    private async startWithSession(
        args: TelephonyCallStartArgs,
        carrier: MJAIBridgeProviderEntity,
        coAgentID: string,
        agentSession: MJAIAgentSessionEntity,
        ref: CallRuntimeRef,
        interactionID?: string,
    ): Promise<StartedTelephonyCall> {
        const lifecycle = this.deps.InteractionLifecycle ?? InteractionLifecycleService.Instance;
        const features = readToolFeatures(carrier);
        const executor = this.buildExecutor(args, features, ref);
        const framing = await this.buildFraming(args, features, interactionID);
        const tools = BuildTelephonyTools(features, this.deps.TransferTargets ?? []);

        const openModelSession = async (priorTranscript?: string): Promise<IRealtimeSession> => {
            const session = await this.deps.SessionFactory({
                // The caller sees no video: the session asks the model for no avatar and reports `phone`.
                PhoneCall: true,
                AgentID: coAgentID,
                TargetAgentID: args.Identity.AgentID,
                ContextUser: args.ContextUser,
                MetadataProvider: args.MetadataProvider,
                AgentSessionID: agentSession.ID,
                ConversationID: agentSession.ConversationID ?? undefined,
                RoomName: args.RemoteNumber,
                HostTools: tools,
                HostFraming: framing,
                PriorTranscript: priorTranscript,
            });
            this.bindLocalTools(session, executor);
            return session;
        };

        ref.Initial = await openModelSession();
        const active = await this.deps.Engine.StartBridgeSession({
            AgentSessionID: agentSession.ID,
            AgentID: coAgentID,
            TargetAgentID: args.Identity.AgentID,
            Provider: carrier,
            RealtimeSession: ref.Initial,
            // The agent's own number, always: for an inbound call the caller's number rides in the configuration.
            Address: args.Direction === 'Inbound' ? args.Identity.IdentityValue : args.RemoteNumber,
            Direction: args.Direction,
            // A call is a 1:1 conversation the agent always answers: not a "passive" meeting seat.
            JoinMethod: args.Direction === 'Inbound' ? 'InboundRoute' : 'OnDemand',
            TurnMode: 'Active',
            Configuration: args.Configuration,
            BindSdk: args.BindSdk,
            ContextUser: args.ContextUser,
            MetadataProvider: args.MetadataProvider,
            TranscriptSink: agentSession.ConversationID
                ? CreateBridgeSessionTranscriptSink({ ConversationID: agentSession.ConversationID, AgentSessionID: agentSession.ID, AgentID: args.Identity.AgentID })
                : undefined,
            // HOST POLICY (deliberate, same as the browser): barge-in drops queued progress narration but does NOT
            // abort delegated runs — the caller keeps talking while work runs, and full-duplex models make
            // backchannels ("mm-hm") common, so cancel-on-speech would kill exactly the jobs they asked for. See
            // packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts ~L1956-1963. The phone has no per-job
            // cancel button, so explicit cancellation is the `cancel_pending_work` tool.
            OnBargeIn: () => this.cancelPendingNarration(ref),
            RecoverRealtimeSession: (request: BridgeRealtimeSessionRecoveryRequest) => openModelSession(request.PriorTranscript),
            OnSessionEnded: (reason) => this.onSessionEnded(args, agentSession.ID, reason, interactionID),
        });
        ref.Active = active;
        if (active.RoomKey && interactionID) {
            await lifecycle.UpdateExternalID(interactionID, active.RoomKey, args.ContextUser, args.MetadataProvider);
        }
        LogStatus(`[Telephony] ${args.Direction} call session ${active.SessionBridgeID} started (agent session ${agentSession.ID}).`);
        return { RoomKey: active.RoomKey, SessionBridgeID: active.SessionBridgeID };
    }

    /** What the agent is told about the call: phone etiquette, who is on the line, and the tools it has. */
    private async buildFraming(args: TelephonyCallStartArgs, features: TelephonyToolFeatures, interactionID?: string): Promise<string> {
        const caller =
            args.Direction === 'Inbound'
                ? await ResolveCallerSafely(this.deps.CallerResolver, args.RemoteNumber, args.Identity.IdentityValue, args.ContextUser)
                : undefined;
        if (caller && interactionID) {
            const lifecycle = this.deps.InteractionLifecycle ?? InteractionLifecycleService.Instance;
            if (caller.LinkedRecord) {
                void lifecycle.CreateLink({
                    InteractionID: interactionID,
                    EntityID: caller.LinkedRecord.EntityID,
                    RecordID: caller.LinkedRecord.RecordID,
                    Role: 'Caller',
                    ContextUser: args.ContextUser,
                    MetadataProvider: args.MetadataProvider,
                });
            } else if (caller.PersonRecordID && caller.PersonEntityID) {
                void lifecycle.CreateLink({
                    InteractionID: interactionID,
                    EntityID: caller.PersonEntityID,
                    RecordID: caller.PersonRecordID,
                    Role: 'Caller',
                    ContextUser: args.ContextUser,
                    MetadataProvider: args.MetadataProvider,
                });
            }
        }
        return BuildPhoneFraming({
            Direction: args.Direction,
            RemoteNumber: args.RemoteNumber,
            Caller: caller,
            Features: features,
            TransferTargets: this.deps.TransferTargets ?? [],
        });
    }

    /** The call-control tool executor; it reaches the call's bridge lazily because that exists only after start. */
    private buildExecutor(args: TelephonyCallStartArgs, features: TelephonyToolFeatures, ref: CallRuntimeRef): TelephonyCallToolExecutor {
        return new TelephonyCallToolExecutor({
            Controls: () => ref.Active?.Bridge,
            Policy: this.deps.OutboundPolicy,
            Features: features,
            TransferTargets: this.deps.TransferTargets ?? [],
            CancelPendingWork: () => this.cancelInFlightDelegations(ref),
            EndCall: async (reason) => {
                if (ref.Active) {
                    LogStatus(`[Telephony] agent ended call ${ref.Active.SessionBridgeID}: ${reason}`);
                    await this.deps.Engine.StopBridgeSession(ref.Active.SessionBridgeID, 'Explicit', args.ContextUser, args.MetadataProvider);
                }
            },
            NotifyModel: (note) => ref.Active?.RealtimeSession.SendContextNote?.(note),
        });
    }

    /** Installs the call-control executor on a model session's runtime so its tool calls reach the call. */
    private bindLocalTools(session: IRealtimeSession, executor: TelephonyCallToolExecutor): void {
        const runtime = GetBridgeRealtimeRuntime(session);
        if (!runtime) {
            LogError('[Telephony] the model session has no bridge runtime; transfer_call / send_dtmf / end_call will not work on this call.');
            return;
        }
        runtime.SetLocalToolHandler(executor);
    }

    /** The caller talked over the agent: queued progress narration is stale. Delegated work is left running. */
    private cancelPendingNarration(ref: CallRuntimeRef): void {
        const session = ref.Active?.RealtimeSession ?? ref.Initial;
        if (session) {
            GetBridgeRealtimeRuntime(session)?.CancelPendingNarration();
        }
    }

    /** The caller explicitly asked to cancel (`cancel_pending_work`): abort the delegated runs in flight. */
    private cancelInFlightDelegations(ref: CallRuntimeRef): number {
        const session = ref.Active?.RealtimeSession ?? ref.Initial;
        return session ? GetBridgeRealtimeRuntime(session)?.CancelInFlightDelegations() ?? 0 : 0;
    }

    /** End-of-call bookkeeping: free the capacity slot, close the agent-session row, and close the interaction. Never throws. */
    private async onSessionEnded(args: TelephonyCallStartArgs, agentSessionID: string, reason: BridgeDisconnectReason, interactionID?: string): Promise<void> {
        args.Lease.Release();
        await this.closeAgentSession(agentSessionID, reason, args.ContextUser, args.MetadataProvider);
        if (interactionID) {
            const lifecycle = this.deps.InteractionLifecycle ?? InteractionLifecycleService.Instance;
            await lifecycle.CloseInteraction({
                InteractionID: interactionID,
                EndReason: reason,
                CostPerMinute: this.deps.CostPerMinute,
                ContextUser: args.ContextUser,
                MetadataProvider: args.MetadataProvider,
            });
        }
    }

    /** Moves the agent-session row to `Closed`. A row that is already closed (or missing) is left alone. */
    private async closeAgentSession(agentSessionID: string, reason: BridgeDisconnectReason, user: UserInfo, provider: IMetadataProvider): Promise<void> {
        await CloseAgentSessionRow(agentSessionID, reason, user, provider);
    }

    /**
     * Closes the model session of a call whose start failed (when one was opened), after finalizing its co-agent run as
     * failed with the start's error: the close alone would finalize that run as completed. Neither step throws; a failure
     * is logged, so the caller still sees why the start failed.
     */
    private async closeFailedStartSession(session: IRealtimeSession | undefined, startError: unknown): Promise<void> {
        if (!session) {
            return;
        }
        try {
            await GetBridgeRealtimeRuntime(session)?.Finalize(false, startError instanceof Error ? startError.message : String(startError));
        } catch (e) {
            LogError(`[Telephony] recording a failed start on the call's agent run failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        try {
            await session.Close();
        } catch (e) {
            LogError(`[Telephony] closing the model session after a failed start failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

/**
 * Moves an agent-session row to `Closed`, recording why. A row that is already closed (or missing) is left alone. Never
 * throws: closing is bookkeeping at the end of a call and must not turn a clean hang-up into an error.
 */
export async function CloseAgentSessionRow(agentSessionID: string, reason: BridgeDisconnectReason, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    try {
        const row = await provider.GetEntityObject<MJAIAgentSessionEntity>(AGENT_SESSION_ENTITY, user);
        if (!(await row.Load(agentSessionID)) || row.Status === 'Closed') {
            return;
        }
        row.Status = 'Closed';
        row.ClosedAt = new Date();
        row.CloseReason = mapCloseReason(reason);
        if (!(await row.Save())) {
            LogError(`[Telephony] could not close agent session ${agentSessionID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    } catch (e) {
        LogError(`[Telephony] closing agent session ${agentSessionID} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** Reads which call-control features the provider declares; anything undeclared is unsupported. */
function readToolFeatures(provider: MJAIBridgeProviderEntity): TelephonyToolFeatures {
    const features = provider.SupportedFeaturesObject;
    return { CallTransfer: features?.CallTransfer === true, DTMF: features?.DTMF === true };
}

/** Maps the bridge's disconnect reason onto the agent-session row's narrower close-reason set. */
function mapCloseReason(reason: BridgeDisconnectReason): 'Error' | 'Explicit' | 'Janitor' | 'Shutdown' {
    switch (reason) {
        case 'Error':
        case 'Janitor':
        case 'Shutdown':
            return reason;
        default:
            return 'Explicit';
    }
}
