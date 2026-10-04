/**
 * @fileoverview Starts ONE agent's session in a LiveKit room for a call (a phone call that arrived through SIP, a call the
 * server placed, a web visitor, or an agent taking a conversation over from another).
 *
 * It is the room-call twin of {@link TelephonyCallSessionStarter}: the same guarantees, over the LiveKit room path. The
 * agent is placed in the room through the room coordinator (so it joins the way every other agent does, with the same
 * roster and turn-taking), with what a call needs on top: the phone/room framing and handoff tools, a transcript that lands
 * in the call's own conversation, recovery from a dropped model session, and cleanup on every path.
 *
 * What the starter guarantees:
 * - the capacity slot, the agent-session row and the model session are released/closed on EVERY path, a failed start
 *   included, never leaked;
 * - the **co-agent** is resolved through the shared chain and the dialled agent is the TARGET it voices, never collapsed;
 * - the transcript is written to the call's own conversation, and an agent taking over writes to the SAME conversation, so a
 *   transfer does not split the record of the call;
 * - when an agent's session ends for any reason, a handoff still waiting on it is withdrawn (unless the engine itself is
 *   taking the agent out, which it marks as leaving);
 * - a talk-over drops queued progress narration but leaves delegated work running (the caller cancels it explicitly).
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession } from '@memberjunction/ai';
import { CreateBridgeSessionTranscriptSink, GetBridgeRealtimeRuntime, ResolveRealtimeCoAgentID } from '@memberjunction/ai-agents';
import type { BridgeDisconnectReason } from '@memberjunction/ai-bridge-base';
import type { LiveKitAgentRoomCoordinator, RoomHandoffEngine, StartedRoomAgent, StartRoomAgentRequest } from '@memberjunction/livekit-room-server';
import type { IAgentSessionManager } from '../sessionManager.js';
import { ResolveCallerSafely, type CallerIdentity, type ICallerIdentityResolver } from './callerIdentity.js';
import type { CallCapacityLease, ICallCapacity } from './telephonyCapacity.js';
import type { TransferTarget } from './outboundCallPolicy.js';
import { FindAgentNameByID, ResolveHandoffDestination, type HandoffDestinationDeps } from './handoffDestinations.js';
import { BuildRoomCallFraming, BuildRoomCallTools, ComputeHandoffCapabilities, RoomCallToolExecutor, SupportedRoomTargets } from './roomCallTools.js';
import { CloseAgentSessionRow } from './telephonyCallSession.js';
import { MaskNumber } from './outboundCallPolicy.js';

/** The part of the room coordinator the starter drives (a `Pick` so tests inject a fake). */
export type RoomCallCoordinator = Pick<LiveKitAgentRoomCoordinator, 'StartAgentRoomSession' | 'StopAgentRoomSession'>;

/** The part of the handoff engine the starter drives. */
export type RoomCallHandoffEngine = Pick<RoomHandoffEngine, 'RequestHandoff' | 'AgentReadyToLeave' | 'CancelRoom' | 'Deps'>;

/** The collaborators the starter uses. */
export interface RoomCallStarterDeps {
    Coordinator: RoomCallCoordinator;
    SessionManager: IAgentSessionManager;
    /** Resolves the co-agent for a target agent (defaults to the shared chain). */
    CoAgentResolver: typeof ResolveRealtimeCoAgentID;
    /** Resolves who an inbound phone caller is. */
    CallerResolver: ICallerIdentityResolver;
    Engine: RoomCallHandoffEngine;
    /** The validated transfer directory. */
    Targets: readonly TransferTarget[];
    /** What destination resolution reads (the outbound policy, user and agent lookups). */
    Destinations: HandoffDestinationDeps;
    /** The concurrent-call gate an agent taking over a phone call takes a slot from. */
    Capacity: ICallCapacity;
    /** The display name of an agent by id (defaults to the AI engine's agent cache). */
    AgentNameResolver?: typeof FindAgentNameByID;
}

/** One agent session to start in a room. */
export interface RoomCallStartArgs {
    RoomName: string;
    /** The agent the caller talks to (the persona). The voice front-end that speaks as it is resolved by the starter. */
    Agent: { AgentID: string; Name?: string };
    /** `phone` for a call that went through SIP; `web` for a person in the room from a browser. */
    Channel: 'phone' | 'web';
    Direction: 'Inbound' | 'Outbound';
    /** The phone party's number: the caller (inbound) or the number being dialled (outbound). */
    RemoteNumber?: string;
    /** The number that was dialled (inbound), for the caller-identity hook. */
    DialedNumber?: string;
    /** The capacity slot this agent already holds; the starter owns releasing it. */
    Lease?: CallCapacityLease | null;
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
    /** Who is on the other end, in words a person can use. Defaults to a masked number (phone) or `Web visitor`. */
    CallerLabel?: string;
    /** Set when this agent takes a conversation over from another. */
    Takeover?: { PreviousAgentName: string; Brief: string };
    /** Reuse an existing conversation (a taking-over agent continues the call's record). */
    ConversationID?: string;
    RealtimeModelID?: string;
    RealtimeVoice?: string;
    /** Hangs up the phone leg(s) of the call. Called when the agent ends the call; absent for a web room. */
    HangUp?: () => Promise<void>;
    /** Called once when this agent's session has ended, for the caller's own bookkeeping. */
    OnEnded?: (reason: BridgeDisconnectReason) => void;
}

/** What a started agent session is known by. */
export interface StartedRoomCall {
    SessionBridgeID: string;
    AgentSessionID: string;
    ConversationID?: string;
}

/** What is remembered about a live room call so an agent taking over can continue it. */
interface RoomCallContext {
    Channel: 'phone' | 'web';
    Direction: 'Inbound' | 'Outbound';
    RemoteNumber?: string;
    ConversationID?: string;
    CallerLabel: string;
    HangUp?: () => Promise<void>;
    /** How many agent sessions of this call are live. The context goes when the last one ends. */
    LiveAgents: number;
}

/** The mutable handles the per-call callbacks share (the bridge session exists only after the coordinator starts it). */
interface AgentRef {
    BridgeID?: string;
    /** The latest model session (the first one, then any re-opened after a drop). */
    Session?: IRealtimeSession;
}

/** Starts agent sessions in LiveKit rooms. One instance per server. */
export class RoomCallSessionStarter {
    private readonly rooms = new Map<string, RoomCallContext>();

    constructor(private readonly deps: RoomCallStarterDeps) {}

    /**
     * Starts the agent's session in the room. On ANY failure the lease is released and the agent-session row is closed
     * before the error is rethrown; on success the lease is released when the session ends.
     */
    public async Start(args: RoomCallStartArgs): Promise<StartedRoomCall> {
        const ref: AgentRef = {};
        let agentSessionID: string | undefined;
        try {
            const coAgentID = await this.deps.CoAgentResolver(args.Agent.AgentID, undefined, args.ContextUser, args.MetadataProvider);
            const agentName = await this.resolveAgentName(args);
            const context = this.rooms.get(roomKey(args.RoomName));
            const session = await this.deps.SessionManager.CreateSession(
                { agentID: coAgentID, userID: args.ContextUser.ID, conversationID: args.ConversationID ?? context?.ConversationID },
                args.ContextUser,
                args.MetadataProvider,
            );
            agentSessionID = session.ID;
            return await this.startWithSession(args, coAgentID, agentName, session.ID, session.ConversationID ?? undefined, ref);
        } catch (e) {
            args.Lease?.Release();
            if (agentSessionID) {
                await CloseAgentSessionRow(agentSessionID, 'Error', args.ContextUser, args.MetadataProvider);
            }
            await closeQuietly(ref.Session);
            throw e;
        }
    }

    /**
     * Puts an agent into a room for the handoff engine: an agent taking a conversation over, or the first agent of a web
     * room. The engine's `AgentStarter` seam. An agent joining a PHONE call holds its own capacity slot (it is a live model
     * session); a web room is not a phone call and takes none.
     */
    public async StartRoomAgent(request: StartRoomAgentRequest): Promise<StartedRoomAgent> {
        const context = this.rooms.get(roomKey(request.RoomName));
        const channel = context?.Channel ?? 'web';
        const lease = channel === 'phone' ? this.deps.Capacity.TryAcquire() : null;
        if (channel === 'phone' && !lease) {
            throw new Error('All agent lines are busy right now.');
        }
        const started = await this.Start({
            RoomName: request.RoomName,
            Agent: { AgentID: request.AgentID, Name: request.AgentName },
            Channel: channel,
            Direction: context?.Direction ?? 'Inbound',
            RemoteNumber: context?.RemoteNumber,
            Lease: lease,
            ContextUser: request.ContextUser,
            MetadataProvider: request.Provider,
            CallerLabel: request.CallerLabel,
            Takeover: request.Brief ? { PreviousAgentName: request.PreviousAgentName ?? 'the previous agent', Brief: request.Brief } : undefined,
            ConversationID: context?.ConversationID,
            RealtimeModelID: request.RealtimeModelID,
            RealtimeVoice: request.RealtimeVoice,
            HangUp: context?.HangUp,
        });
        return { SessionBridgeID: started.SessionBridgeID };
    }

    private async startWithSession(
        args: RoomCallStartArgs,
        coAgentID: string,
        agentName: string,
        agentSessionID: string,
        conversationID: string | undefined,
        ref: AgentRef,
    ): Promise<StartedRoomCall> {
        const supported = SupportedRoomTargets(this.deps.Targets, ComputeHandoffCapabilities(this.deps.Engine.Deps));
        const callerLabel = this.callerLabel(args);
        const executor = this.buildExecutor(args, agentName, callerLabel, supported, ref);
        const framing = await this.buildFraming(args, supported);

        const started = await this.deps.Coordinator.StartAgentRoomSession({
            AgentSessionID: agentSessionID,
            RoomName: args.RoomName,
            AgentID: coAgentID,
            AgentName: agentName,
            TargetAgentID: args.Agent.AgentID,
            RealtimeModelID: args.RealtimeModelID,
            RealtimeVoice: args.RealtimeVoice,
            // A call is a conversation the agent always answers, not a "passive" meeting seat.
            TurnMode: 'Active',
            ContextUser: args.ContextUser,
            MetadataProvider: args.MetadataProvider,
            Host: {
                HostTools: BuildRoomCallTools(supported),
                HostFraming: framing,
                ConversationID: conversationID,
                OnModelSession: (session) => this.bindLocalTools(session, executor, ref),
                TranscriptSink: conversationID
                    ? CreateBridgeSessionTranscriptSink({ ConversationID: conversationID, AgentSessionID: agentSessionID, AgentID: args.Agent.AgentID })
                    : undefined,
                // Same host policy as the carrier path: a talk-over drops queued narration but does not abort delegated work.
                OnBargeIn: () => this.cancelPendingNarration(ref),
                RecoverModelSession: true,
                OnSessionEnded: (reason) => this.onSessionEnded(args, agentSessionID, reason),
                JoinMethod: args.Channel === 'phone' && args.Direction === 'Inbound' ? 'InboundRoute' : 'OnDemand',
                Direction: args.Direction,
            },
        });
        ref.BridgeID = started.SessionBridgeID;
        this.rememberRoom(args, callerLabel, conversationID);
        LogStatus(`[Telephony] room call session ${started.SessionBridgeID} started in ${args.RoomName} (agent session ${agentSessionID}).`);
        return { SessionBridgeID: started.SessionBridgeID, AgentSessionID: agentSessionID, ConversationID: conversationID };
    }

    /** The tool executor; it reaches the agent's live room context lazily because the bridge exists only after the agent starts. */
    private buildExecutor(
        args: RoomCallStartArgs,
        agentName: string,
        callerLabel: string,
        supported: readonly TransferTarget[],
        ref: AgentRef,
    ): RoomCallToolExecutor {
        return new RoomCallToolExecutor({
            Targets: supported,
            Engine: this.deps.Engine,
            Agent: () => (ref.BridgeID ? this.agentContext(args, agentName, callerLabel, ref) : undefined),
            ResolveDestination: (target) =>
                ResolveHandoffDestination(target, { User: args.ContextUser, Provider: args.MetadataProvider }, this.deps.Destinations),
            CancelPendingWork: () => (ref.Session ? GetBridgeRealtimeRuntime(ref.Session)?.CancelInFlightDelegations() ?? 0 : 0),
            EndCall: async (reason) => {
                LogStatus(`[Telephony] agent ended room call ${args.RoomName}: ${reason}`);
                await this.stopAgent(args, ref);
                await args.HangUp?.();
            },
        });
    }

    /** What the handoff engine needs to act on this agent's call. */
    private agentContext(args: RoomCallStartArgs, agentName: string, callerLabel: string, ref: AgentRef) {
        return {
            RoomName: args.RoomName,
            AgentName: agentName,
            CallerLabel: callerLabel,
            ContextUser: args.ContextUser,
            Provider: args.MetadataProvider,
            LeaveRoom: () => this.stopAgent(args, ref),
            NotifyModel: (note: string) => ref.Session?.SendContextNote?.(note),
        };
    }

    private async stopAgent(args: RoomCallStartArgs, ref: AgentRef): Promise<void> {
        if (ref.BridgeID) {
            await this.deps.Coordinator.StopAgentRoomSession(ref.BridgeID, 'Explicit', args.ContextUser, args.MetadataProvider);
        }
    }

    private async buildFraming(args: RoomCallStartArgs, supported: readonly TransferTarget[]): Promise<string> {
        const caller: CallerIdentity | undefined =
            args.Channel === 'phone' && args.Direction === 'Inbound' && args.RemoteNumber
                ? await ResolveCallerSafely(this.deps.CallerResolver, args.RemoteNumber, args.DialedNumber ?? '', args.ContextUser)
                : undefined;
        return BuildRoomCallFraming({
            Channel: args.Channel,
            Direction: args.Direction,
            RemoteNumber: args.RemoteNumber,
            Caller: caller,
            SupportedTargets: supported,
            Takeover: args.Takeover,
        });
    }

    /** Installs the room-call executor on a model session's runtime (the first one, and any re-opened after a drop). */
    private bindLocalTools(session: IRealtimeSession, executor: RoomCallToolExecutor, ref: AgentRef): void {
        ref.Session = session;
        const runtime = GetBridgeRealtimeRuntime(session);
        if (!runtime) {
            LogError('[Telephony] the model session has no bridge runtime; transfer_call / finish_handoff / end_call will not work on this call.');
            return;
        }
        runtime.SetLocalToolHandler(executor);
    }

    /** The caller talked over the agent: queued progress narration is stale. Delegated work is left running. */
    private cancelPendingNarration(ref: AgentRef): void {
        if (ref.Session) {
            GetBridgeRealtimeRuntime(ref.Session)?.CancelPendingNarration();
        }
    }

    /** End-of-session bookkeeping: free the slot, close the row, withdraw a handoff that was waiting on this agent. Never throws. */
    private async onSessionEnded(args: RoomCallStartArgs, agentSessionID: string, reason: BridgeDisconnectReason): Promise<void> {
        args.Lease?.Release();
        this.forgetAgent(args.RoomName);
        this.deps.Engine.CancelRoom(args.RoomName);
        await CloseAgentSessionRow(agentSessionID, reason, args.ContextUser, args.MetadataProvider);
        try {
            args.OnEnded?.(reason);
        } catch (e) {
            LogError(`[Telephony] a room call's end hook failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private rememberRoom(args: RoomCallStartArgs, callerLabel: string, conversationID: string | undefined): void {
        const key = roomKey(args.RoomName);
        const existing = this.rooms.get(key);
        if (existing) {
            existing.LiveAgents++;
            return;
        }
        this.rooms.set(key, {
            Channel: args.Channel,
            Direction: args.Direction,
            RemoteNumber: args.RemoteNumber,
            ConversationID: conversationID,
            CallerLabel: callerLabel,
            HangUp: args.HangUp,
            LiveAgents: 1,
        });
    }

    private forgetAgent(roomName: string): void {
        const key = roomKey(roomName);
        const context = this.rooms.get(key);
        if (context && --context.LiveAgents <= 0) {
            this.rooms.delete(key);
        }
    }

    /** Who is on the other end, in words a person can use (a masked number, never the full number). */
    private callerLabel(args: RoomCallStartArgs): string {
        const existing = this.rooms.get(roomKey(args.RoomName));
        if (existing) {
            return existing.CallerLabel;
        }
        if (args.CallerLabel) {
            return args.CallerLabel;
        }
        return args.Channel === 'phone' && args.RemoteNumber ? `Phone caller ${MaskNumber(args.RemoteNumber)}` : 'Web visitor';
    }

    private async resolveAgentName(args: RoomCallStartArgs): Promise<string> {
        if (args.Agent.Name) {
            return args.Agent.Name;
        }
        try {
            const find = this.deps.AgentNameResolver ?? FindAgentNameByID;
            return (await find(args.Agent.AgentID, args.ContextUser, args.MetadataProvider)) ?? 'Agent';
        } catch (e) {
            LogError(`[Telephony] could not resolve the agent's display name; using a generic one: ${e instanceof Error ? e.message : String(e)}`);
            return 'Agent';
        }
    }
}

function roomKey(roomName: string): string {
    return roomName.trim().toLowerCase();
}

async function closeQuietly(session: IRealtimeSession | undefined): Promise<void> {
    try {
        await session?.Close();
    } catch (e) {
        LogError(`[Telephony] closing the model session after a failed start failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}
