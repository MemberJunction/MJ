/**
 * @fileoverview Phone calls carried by a SIP trunk and landed in a LiveKit room (inbound and outbound), for MJAPI.
 *
 * Every conversation lives in a LiveKit room. For a phone call the carrier's SIP trunk hands the call to LiveKit SIP, which
 * puts the caller into a room as a participant; MJ's job is everything after that: notice the call (a signed LiveKit webhook
 * says a SIP participant joined a room and which number was dialed), route it (the dialed number resolves to an agent identity
 * row), admit it (run-as principal, call-capacity slot), and put the agent into the room with the call's framing and tools.
 *
 * Because the call is a room, the things that are carrier-specific on Twilio/Vonage/RingCentral are not here: the carrier
 * does not move the call and does not run the agent. A transfer brings someone into the room (see `RoomHandoffEngine`); a
 * hang-up removes the phone leg from the room.
 *
 * Guarantees kept from the carrier path: inbound calls run as the configured least-privilege user and are refused without
 * one; the capacity cap applies and a refused call is hung up; outbound calls pass the same destination policy, rate limit
 * and agent-permission gate as every `Place*Call`; a call is capped at `maxCallSeconds`; the caller-identity hook and the
 * phone framing are the same.
 *
 * Collaborators are injected so the routing and admission logic is unit-tested with fakes. The call itself (a real trunk, a
 * real room) is live-only.
 *
 * @module @memberjunction/telephony-adapters
 */

import { randomUUID } from 'node:crypto';
import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { ResolveRealtimeCoAgentID } from '@memberjunction/ai-agents';
import type { BridgeDisconnectReason } from '@memberjunction/ai-bridge-base';
import {
    LiveKitAgentRoomCoordinator,
    LiveKitSipService,
    RoomAuthorizationService,
    RoomHandoffEngine,
    type DialIntoRoomRequest,
    type LiveKitRoomWebhookEvent,
    type StartRoomAgentRequest,
} from '@memberjunction/livekit-room-server';
import type { LiveKitSipSettings } from '../types.js';
import { DefaultAgentSessionManager, type IAgentSessionManager } from '../sessionManager.js';
import { CallLifecycleTracker, type TrackedSession } from './callLifecycleTracker.js';
import { CreateCallerIdentityResolver, type ICallerIdentityResolver } from './callerIdentity.js';
import { TelephonyCapacity, type CallCapacityLease, type ICallCapacity } from './telephonyCapacity.js';
import { AuthorizeOutboundCallOrRelease } from './telephonyCallSession.js';
import { OutboundCallRefusedError, OutboundRateLimiter, ResolveOutboundPolicy, ResolveTransferDirectory, MaskNumber, IsValidE164, type OutboundGuardDeps } from './outboundCallPolicy.js';
import { CreateSipTrunkCarrier } from './sipTrunkCarrier.js';
import { FindInboundRoute, FindPhoneAgentIdentity, LoadActiveAgentIdentity } from './agentIdentityLookup.js';
import { RoomCallSessionStarter } from './roomCallSession.js';
import { InteractionLifecycleService } from './interactionLifecycle.js';
import { GetLiveKitSipInboundHandler, type ILiveKitSipInboundHandler } from './livekit-sip-runtime.js';

/** The part of the bridge engine this service drives (a `Pick` so tests inject a fake). */
type SipBridgeEngine = Pick<AIBridgeEngine, 'Config' | 'ProviderByDriverClass'>;

/** The LiveKit bridge's driver class: the provider row phone identities for this path are registered under. */
const LIVEKIT_PROVIDER_DRIVER = 'LiveKitBridge';

/** The default room-name prefix inbound calls land in. */
export const DEFAULT_LIVEKIT_SIP_ROOM_PREFIX = 'call-';

/** How long an outbound call's number may ring before the call is given up. */
const OUTBOUND_RING_SECONDS = 40;

/** The most calls remembered as already handled; past it the oldest are forgotten (a webhook retry is seconds later, not days). */
const MAX_TRACKED_ROOMS = 5000;

/** The outcome of an inbound call webhook. */
export interface LiveKitSipInboundResult {
    /** Whether the event was a new call that was admitted. */
    accepted: boolean;
    /** Why it was not (no agent for the number, at capacity, not a phone call, a repeat). */
    reason?: string;
    /** Set when the call was refused only because the server is at its concurrent-call cap. */
    Busy?: boolean;
    /** Resolves when the agent's session has started (or failed and been cleaned up). Never rejects. Callers ignore it; tests await it. */
    Started?: Promise<void>;
}

/** Injectable collaborators (production defaults are wired in the constructor; fakes in tests). */
export interface LiveKitSipTelephonyServiceDeps {
    sip?: LiveKitSipService;
    engine?: SipBridgeEngine;
    coordinator?: LiveKitAgentRoomCoordinator;
    handoff?: RoomHandoffEngine;
    sessionManager?: IAgentSessionManager;
    coAgentResolver?: typeof ResolveRealtimeCoAgentID;
    callerResolver?: ICallerIdentityResolver;
    capacity?: ICallCapacity;
    canRunAgent?: OutboundGuardDeps['CanRunAgent'];
    /** Overrides the room-call starter (tests). */
    starter?: RoomCallSessionStarter;
    /** Optional custom inbound handler (e.g. for Contact Center entry point routing). */
    inboundHandler?: ILiveKitSipInboundHandler;
}

/** Admits and places phone calls over LiveKit SIP. One instance per server. */
export class LiveKitSipTelephonyService {
    private readonly sip: LiveKitSipService;
    private readonly engine: SipBridgeEngine;
    private readonly coordinator: LiveKitAgentRoomCoordinator;
    private readonly handoff: RoomHandoffEngine;
    private readonly capacity: ICallCapacity;
    private readonly outboundGuard: OutboundGuardDeps;
    private readonly starter: RoomCallSessionStarter;
    private readonly tracker: CallLifecycleTracker;
    private readonly roomPrefix: string;
    private inboundHandler?: ILiveKitSipInboundHandler;
    /** Rooms already handled as a call (inbound admitted/refused, or placed by us), so a retried webhook or a second phone leg starts nothing. */
    private readonly handledRooms = new Set<string>();
    /** The room each live agent session's bridge is in (the lifecycle tracker only knows bridge ids). */
    private readonly roomByBridge = new Map<string, string>();

    constructor(
        private readonly config: LiveKitSipSettings,
        deps: LiveKitSipTelephonyServiceDeps = {},
    ) {
        this.inboundHandler = deps.inboundHandler;
        this.sip = deps.sip ?? new LiveKitSipService({ ServerUrl: config.serverUrl, ApiKey: config.apiKey, ApiSecret: config.apiSecret });
        this.engine = deps.engine ?? AIBridgeEngine.Instance;
        this.coordinator = deps.coordinator ?? LiveKitAgentRoomCoordinator.Instance;
        this.handoff = deps.handoff ?? RoomHandoffEngine.Instance;
        this.roomPrefix = (config.roomPrefix ?? DEFAULT_LIVEKIT_SIP_ROOM_PREFIX).trim() || DEFAULT_LIVEKIT_SIP_ROOM_PREFIX;
        RoomAuthorizationService.Instance.SetSipRoomPrefix(this.roomPrefix);
        const policy = ResolveOutboundPolicy(config.outbound);
        this.outboundGuard = { Policy: policy, Limiter: new OutboundRateLimiter(policy.MaxCallsPerUserPerHour), CanRunAgent: deps.canRunAgent };
        if (!deps.capacity) {
            TelephonyCapacity.Instance.Configure(config.maxConcurrentCalls);
        }
        this.capacity = deps.capacity ?? TelephonyCapacity.Instance;
        this.starter =
            deps.starter ??
            new RoomCallSessionStarter({
                Coordinator: this.coordinator,
                SessionManager: deps.sessionManager ?? new DefaultAgentSessionManager(),
                CoAgentResolver: deps.coAgentResolver ?? ResolveRealtimeCoAgentID,
                CallerResolver: deps.callerResolver ?? CreateCallerIdentityResolver(),
                Engine: this.handoff,
                Targets: ResolveTransferDirectory(config.transferTargets, policy),
                Destinations: { Policy: policy, CanRunAgent: deps.canRunAgent },
                Capacity: this.capacity,
                InteractionLifecycle: InteractionLifecycleService.Instance,
                CostPerMinute: config.costPerMinute,
            });
        this.tracker = new CallLifecycleTracker((session, reason) => this.stopCall(session, reason), config.maxCallSeconds);
        this.wireHandoffEngine();
    }

    /** Sets or unsets the custom inbound call handler. */
    public SetInboundHandler(handler: ILiveKitSipInboundHandler | undefined): void {
        this.inboundHandler = handler;
    }

    /** Removes one participant (the caller of a refused or completed call). Best-effort. */
    public async HangUpParticipant(roomName: string, identity: string): Promise<void> {
        return this.hangUpLeg(roomName, identity);
    }

    /** Removes every phone (SIP) participant from the room. Best-effort. */
    public async HangUpRoom(roomName: string): Promise<void> {
        return this.hangUpPhoneLegs(roomName);
    }

    /**
     * Startup work that talks to LiveKit: checks the carrier settings, verifies the outbound trunk, and (when
     * `autoProvision` is set) creates the inbound trunk and dispatch rule. Never throws: a LiveKit that is down at boot must
     * not stop the server, and every problem is logged where an operator will read it.
     */
    public async Initialize(): Promise<void> {
        this.checkCarrier();
        try {
            await this.checkOutboundTrunk();
            await this.provisionInbound();
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] startup checks could not reach LiveKit: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Handles one LiveKit webhook event. A new SIP participant in a room under the call prefix is an inbound call: it is
     * routed to an agent by the dialed number and admitted, or hung up. Anything else is ignored. Never throws.
     */
    public async HandleWebhookEvent(event: LiveKitRoomWebhookEvent, contextUser: UserInfo, provider: IMetadataProvider): Promise<LiveKitSipInboundResult> {
        if (event.Event === 'room_finished') {
            this.handledRooms.delete(roomKey(event.RoomName));
            const handler = this.inboundHandler ?? GetLiveKitSipInboundHandler();
            if (handler?.HandleRoomFinished) {
                try {
                    await handler.HandleRoomFinished(event.RoomName, contextUser, provider);
                } catch (finishErr) {
                    LogError(
                        `[Telephony][LiveKitSip] custom inbound handler HandleRoomFinished threw error for room ${event.RoomName}: ${finishErr instanceof Error ? finishErr.message : String(finishErr)}`
                    );
                }
            }
            return { accepted: false, reason: 'room finished' };
        }
        if (event.Event !== 'participant_joined' || !event.IsSipParticipant || !event.RoomName.startsWith(this.roomPrefix)) {
            return { accepted: false, reason: 'not an inbound call' };
        }
        if (!this.claimRoom(event.RoomName)) {
            return { accepted: false, reason: 'already handled' };
        }
        try {
            return await this.admitInbound(event, contextUser, provider);
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] inbound call in ${event.RoomName} failed: ${e instanceof Error ? e.message : String(e)}`);
            await this.hangUpLeg(event.RoomName, event.ParticipantIdentity);
            return { accepted: false, reason: 'Internal error starting the agent.' };
        }
    }

    /** Hangs up a new inbound phone call that cannot be admitted at all (no run-as user). A repeat event for the same room is ignored. */
    public async RefuseInboundCall(event: LiveKitRoomWebhookEvent): Promise<void> {
        if (event.RoomName.startsWith(this.roomPrefix) && this.claimRoom(event.RoomName)) {
            await this.hangUpLeg(event.RoomName, event.ParticipantIdentity);
        }
    }

    /**
     * Places an OUTBOUND call from an agent identity to a number, after the shared outbound gate (agent permission,
     * destination policy, rate limit, capacity) has authorized it. The agent joins a new room, then the room dials the number.
     *
     * @returns The room the call is in.
     * @throws {OutboundCallRefusedError} when the gate refuses the call (the message is caller-safe).
     */
    public async PlaceOutboundCall(agentIdentityId: string, toNumber: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
        const trunkID = this.config.outboundTrunkId;
        if (!trunkID) {
            throw new Error('Outbound calls over LiveKit SIP need telephony.livekitSip.outboundTrunkId.');
        }
        const identity = await LoadActiveAgentIdentity(agentIdentityId, contextUser, provider);
        if (!identity) {
            throw new Error(`Agent identity '${agentIdentityId}' not found or inactive.`);
        }
        await this.engine.Config(false, contextUser, provider);
        const carrier = this.resolveProvider();
        const to = (toNumber ?? '').trim();
        const lease = this.capacity.TryAcquire();
        if (!lease) {
            LogError('[Telephony][LiveKitSip] outbound call refused: at the concurrent-call cap.');
            throw new OutboundCallRefusedError('All agent lines are busy right now; try again shortly.', 'at-capacity');
        }
        const verdict = await AuthorizeOutboundCallOrRelease({ User: contextUser, AgentIdentity: identity, CarrierProviderID: carrier.ID, ToNumber: to }, this.outboundGuard, lease);
        if (!verdict.Allowed) {
            throw new OutboundCallRefusedError(verdict.Reason, verdict.Code);
        }
        const roomName = `${this.roomPrefix}out-${randomUUID()}`;
        this.claimRoom(roomName);
        return this.startAndDial(roomName, identity.AgentID, to, trunkID, lease, contextUser, provider);
    }

    /** Cancels every timer and drops tracked state (server shutdown). */
    public Dispose(): void {
        this.tracker.Dispose();
        this.handledRooms.clear();
        this.roomByBridge.clear();
    }

    // ── inbound ──────────────────────────────────────────────────────────────────

    private async admitInbound(event: LiveKitRoomWebhookEvent, contextUser: UserInfo, provider: IMetadataProvider): Promise<LiveKitSipInboundResult> {
        const handler = this.inboundHandler ?? GetLiveKitSipInboundHandler();
        const dialed = event.DialedNumber ?? '';
        if (handler) {
            try {
                const handledResult = await handler.HandleInboundCall({
                    Event: event,
                    DialedNumber: dialed,
                    CallerNumber: event.CallerNumber,
                    RoomName: event.RoomName,
                    ParticipantIdentity: event.ParticipantIdentity,
                    ContextUser: contextUser,
                    MetadataProvider: provider,
                    HangUp: () => this.hangUpLeg(event.RoomName, event.ParticipantIdentity),
                });
                if (handledResult.Handled) {
                    return handledResult.Outcome ?? { accepted: true };
                }
            } catch (handlerErr) {
                const message = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
                LogError(
                    `[Telephony][LiveKitSip] custom inbound handler threw error for room ${event.RoomName}: ${message}`
                );
                await this.hangUpLeg(event.RoomName, event.ParticipantIdentity);
                void this.recordRefusedInteraction(event, undefined, 'HandlerError', contextUser, provider);
                return { accepted: false, reason: `Custom inbound handler threw: ${message}` };
            }
        }

        await this.engine.Config(false, contextUser, provider);
        const carrier = this.resolveProvider();
        const identity = await FindPhoneAgentIdentity(dialed, carrier.ID, contextUser);
        if (!identity) {
            await this.hangUpLeg(event.RoomName, event.ParticipantIdentity);
            void this.recordRefusedInteraction(event, undefined, 'NoAgent', contextUser, provider);
            return { accepted: false, reason: `No active agent identity for dialed number '${dialed}'.` };
        }
        const lease = this.capacity.TryAcquire();
        if (!lease) {
            LogError(`[Telephony][LiveKitSip] inbound call in ${event.RoomName} refused: at the concurrent-call cap.`);
            await this.hangUpLeg(event.RoomName, event.ParticipantIdentity);
            void this.recordRefusedInteraction(event, undefined, 'Capacity', contextUser, provider);
            return { accepted: false, Busy: true, reason: 'All agent lines are busy.' };
        }
        const Started = this.startInboundInBackground(event, identity.AgentID, lease, contextUser, provider);
        return { accepted: true, Started };
    }

    private async recordRefusedInteraction(
        event: LiveKitRoomWebhookEvent,
        phoneNumberId: string | undefined,
        reason: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        try {
            const lifecycle = InteractionLifecycleService.Instance;
            const interaction = await lifecycle.CreateInteraction({
                Channel: 'Phone',
                Direction: 'Inbound',
                PhoneNumberID: phoneNumberId ?? null,
                RemoteAddress: event.CallerNumber ?? null,
                ExternalID: event.ParticipantIdentity ?? null,
                RoomName: event.RoomName,
                Status: 'Abandoned',
                StartedAt: new Date(),
                ContextUser: contextUser,
                MetadataProvider: provider,
            });
            if (interaction) {
                await lifecycle.CloseInteraction({
                    InteractionID: interaction.ID,
                    EndReason: reason,
                    Abandoned: true,
                    ContextUser: contextUser,
                    MetadataProvider: provider,
                });
            }
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] recording refused interaction failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Starts the inbound agent session; on failure logs, hangs the phone leg up and frees the call's state. Never rejects. */
    private async startInboundInBackground(
        event: LiveKitRoomWebhookEvent,
        agentID: string,
        lease: CallCapacityLease,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        const roomName = event.RoomName;
        try {
            const started = await this.starter.Start({
                RoomName: roomName,
                Agent: { AgentID: agentID },
                Channel: 'phone',
                Direction: 'Inbound',
                RemoteNumber: event.CallerNumber,
                DialedNumber: event.DialedNumber,
                Lease: lease,
                ContextUser: contextUser,
                MetadataProvider: provider,
                HangUp: () => this.hangUpPhoneLegs(roomName),
                OnEnded: () => this.tracker.Release(roomName),
            });
            this.roomByBridge.set(started.SessionBridgeID, roomName);
            await this.tracker.Attach(roomName, { SessionBridgeID: started.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] inbound call in ${roomName} could not start its agent session: ${e instanceof Error ? e.message : String(e)}`);
            this.tracker.Fail(roomName);
            await this.hangUpPhoneLegs(roomName);
        }
    }

    // ── outbound ─────────────────────────────────────────────────────────────────

    private async startAndDial(
        roomName: string,
        agentID: string,
        to: string,
        trunkID: string,
        lease: CallCapacityLease,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string> {
        const started = await this.starter.Start({
            RoomName: roomName,
            Agent: { AgentID: agentID },
            Channel: 'phone',
            Direction: 'Outbound',
            RemoteNumber: to,
            Lease: lease,
            ContextUser: contextUser,
            MetadataProvider: provider,
            HangUp: () => this.hangUpPhoneLegs(roomName),
            OnEnded: () => this.tracker.Release(roomName),
        });
        this.roomByBridge.set(started.SessionBridgeID, roomName);
        try {
            await this.sip.DialIntoRoom({
                RoomName: roomName,
                TrunkID: trunkID,
                Number: to,
                ParticipantIdentity: `sip-out-${randomUUID()}`,
                FromNumber: this.config.outboundFromNumber,
                RingTimeoutSeconds: OUTBOUND_RING_SECONDS,
                WaitUntilAnswered: true,
            });
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] outbound call to ${MaskNumber(to)} was not connected: ${e instanceof Error ? e.message : String(e)}`);
            await this.coordinator.StopAgentRoomSession(started.SessionBridgeID, 'Error', contextUser, provider);
            throw new Error('The call was not answered or could not be connected.');
        }
        await this.tracker.Attach(roomName, { SessionBridgeID: started.SessionBridgeID, ContextUser: contextUser, Provider: provider });
        return roomName;
    }

    // ── ending calls ─────────────────────────────────────────────────────────────

    /** The call hit its cap (or was ended from outside): stop the agent and hang up the phone leg(s). */
    private async stopCall(session: TrackedSession, reason: BridgeDisconnectReason): Promise<boolean> {
        const stopped = await this.coordinator.StopAgentRoomSession(session.SessionBridgeID, reason, session.ContextUser, session.Provider);
        const room = this.roomByBridge.get(session.SessionBridgeID);
        this.roomByBridge.delete(session.SessionBridgeID);
        if (room) {
            await this.hangUpPhoneLegs(room);
        }
        return stopped;
    }

    /** Removes every phone (SIP) participant from the room. Best-effort: a leg that is already gone is not an error. */
    private async hangUpPhoneLegs(roomName: string): Promise<void> {
        try {
            const legs = (await this.sip.ListParticipants(roomName)).filter((p) => p.IsSip);
            await Promise.all(legs.map((p) => this.sip.RemoveParticipant(roomName, p.Identity)));
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] could not hang up the phone legs in ${roomName}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Removes one participant (the caller of a refused call). Best-effort. */
    private async hangUpLeg(roomName: string, identity: string): Promise<void> {
        try {
            await this.sip.RemoveParticipant(roomName, identity);
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] could not hang up ${identity} in ${roomName}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ── wiring and startup checks ────────────────────────────────────────────────

    private cachedTrunkNumbers?: Set<string>;
    private lastMissRefresh = 0;
    private static readonly TRUNK_CACHE_REFRESH_MIN_INTERVAL_MS = 60_000;

    private async loadTrunkNumbers(trunkID?: string): Promise<Set<string>> {
        if (this.cachedTrunkNumbers) {
            return this.cachedTrunkNumbers;
        }
        try {
            const trunks = await this.sip.ListOutboundTrunks();
            const trunk = trunkID ? trunks.find((t) => t.TrunkID === trunkID) : undefined;
            const numbers = trunk?.Numbers ?? [];
            this.cachedTrunkNumbers = new Set(numbers);
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] could not load outbound trunk numbers: ${e instanceof Error ? e.message : String(e)}`);
            this.cachedTrunkNumbers = new Set();
        }
        return this.cachedTrunkNumbers;
    }

    private async refreshTrunkNumbersOnMiss(trunkID?: string): Promise<Set<string>> {
        const now = Date.now();
        if (now - this.lastMissRefresh < LiveKitSipTelephonyService.TRUNK_CACHE_REFRESH_MIN_INTERVAL_MS && this.cachedTrunkNumbers) {
            return this.cachedTrunkNumbers;
        }
        this.lastMissRefresh = now;
        try {
            const trunks = await this.sip.ListOutboundTrunks();
            const trunk = trunkID ? trunks.find((t) => t.TrunkID === trunkID) : undefined;
            const numbers = trunk?.Numbers ?? [];
            this.cachedTrunkNumbers = new Set(numbers);
        } catch (e) {
            LogError(`[Telephony][LiveKitSip] could not refresh outbound trunk numbers: ${e instanceof Error ? e.message : String(e)}`);
        }
        return this.cachedTrunkNumbers ?? new Set();
    }

    private async validateFromNumber(fromNumber: string | undefined, trunkID: string): Promise<string | undefined> {
        const trimmed = typeof fromNumber === 'string' ? fromNumber.trim() : undefined;
        if (!trimmed) {
            return this.config.outboundFromNumber;
        }

        if (!IsValidE164(trimmed)) {
            throw new Error(`FromNumber '${trimmed}' is not a valid E.164 phone number.`);
        }

        let ownedTrunkNumbers = await this.loadTrunkNumbers(trunkID);
        if (ownedTrunkNumbers.has(trimmed)) {
            return trimmed;
        }

        if (this.config.numbers && this.config.numbers.includes(trimmed)) {
            return trimmed;
        }

        // On cache miss, refresh the trunk-numbers cache (throttled to at most once per interval)
        // so a newly added trunk number doesn't require a service restart.
        ownedTrunkNumbers = await this.refreshTrunkNumbersOnMiss(trunkID);
        if (ownedTrunkNumbers.has(trimmed)) {
            return trimmed;
        }

        throw new Error(`FromNumber '${trimmed}' is not owned by this organization.`);
    }

    /** Gives the handoff engine what only the LiveKit SIP path can: dialing a number into a room, and starting another agent in one. */
    private wireHandoffEngine(): void {
        const trunkID = this.config.outboundTrunkId;
        if (trunkID) {
            void this.loadTrunkNumbers(trunkID);
        }
        this.handoff.Configure({
            Presence: this.sip,
            Observer: {
                OnHandoffEvent: (event) => {
                    if (event.ContextUser && event.Provider) {
                        void InteractionLifecycleService.Instance.RecordRoomEvent(
                            event.RoomName,
                            event.EventType,
                            event.ContextUser,
                            event.Provider,
                            event.ActorUserID,
                            event.ActorAgentID,
                            event.Details,
                        );
                    }
                },
            },
            Dialer: trunkID
                ? {
                      DialIntoRoom: async (request: DialIntoRoomRequest): Promise<void> => {
                          const validatedFrom = await this.validateFromNumber(request.FromNumber, trunkID);
                          return this.sip.DialIntoRoom({
                              ...request,
                              TrunkID: trunkID,
                              FromNumber: validatedFrom,
                              WaitUntilAnswered: true,
                          });
                      },
                  }
                : undefined,
            AgentStarter: (request: StartRoomAgentRequest) => this.starter.StartRoomAgent(request),
        });
    }

    private checkCarrier(): void {
        const carrier = CreateSipTrunkCarrier(this.config.carrier);
        if (!carrier) {
            return;
        }
        const check = carrier.ValidateConfig({ Numbers: this.config.numbers ?? [], DialOut: Boolean(this.config.outboundTrunkId) });
        for (const problem of check.Problems) {
            LogError(`[Telephony][LiveKitSip] ${carrier.Name}: ${problem}`);
        }
        for (const warning of check.Warnings) {
            LogStatus(`[Telephony][LiveKitSip] ${carrier.Name}: ${warning}`);
        }
    }

    private async checkOutboundTrunk(): Promise<void> {
        const trunkID = this.config.outboundTrunkId;
        if (trunkID && !(await this.sip.OutboundTrunkExists(trunkID))) {
            LogError(`[Telephony][LiveKitSip] outboundTrunkId '${trunkID}' was not found on LiveKit; dialing out will fail.`);
        }
    }

    private async provisionInbound(): Promise<void> {
        const numbers = this.config.numbers ?? [];
        if (!this.config.autoProvision || numbers.length === 0) {
            return;
        }
        const result = await this.sip.EnsureInboundRouting({
            Numbers: numbers,
            RoomPrefix: this.roomPrefix,
            AllowedAddresses: this.config.allowedAddresses,
        });
        LogStatus(`[Telephony][LiveKitSip] inbound routing ready (trunk ${result.TrunkID}, dispatch rule ${result.DispatchRuleID}).`);
    }

    /** Resolves the seeded LiveKit provider row. */
    private resolveProvider(): MJAIBridgeProviderEntity {
        const provider = this.engine.ProviderByDriverClass(LIVEKIT_PROVIDER_DRIVER);
        if (!provider) {
            throw new Error(`No active 'MJ: AI Bridge Providers' row for the LiveKit bridge (DriverClass '${LIVEKIT_PROVIDER_DRIVER}').`);
        }
        return provider;
    }

    /** Remembers a room as handled; returns false when it already was. Bounded so a long-running server cannot grow without limit. */
    private claimRoom(roomName: string): boolean {
        const key = roomKey(roomName);
        if (this.handledRooms.has(key)) {
            return false;
        }
        if (this.handledRooms.size >= MAX_TRACKED_ROOMS) {
            const oldest = this.handledRooms.values().next().value;
            if (oldest !== undefined) {
                this.handledRooms.delete(oldest);
            }
        }
        this.handledRooms.add(key);
        return true;
    }
}

function roomKey(roomName: string): string {
    return roomName.trim().toLowerCase();
}
