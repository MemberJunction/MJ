/**
 * @fileoverview Shared types for bringing a person (or another agent) into a LiveKit room conversation.
 *
 * A **handoff** moves a conversation from the AI agent that is in a room to someone else, without the caller
 * leaving the room: a person at an Explorer console (who is first OFFERED the conversation and may accept or
 * decline), a phone number the room dials out to, or another AI agent. The caller stays in the room throughout;
 * only the AI agent leaves, and only once the new party is actually present.
 *
 * The types here are the engine's vocabulary. Where a destination comes from (a named entry in the operator's
 * transfer directory, a user looked up by email) is the caller's concern: by the time a request reaches the engine
 * the destination is already resolved to an id or a validated number.
 *
 * @module @memberjunction/livekit-room-server
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * How the AI agent leaves the conversation.
 * - `warm`: the AI briefs the new party in a sentence or two (aloud, in the room), then leaves.
 * - `blind`: the AI leaves as soon as the new party is present, with no briefing.
 */
export type HandoffMode = 'warm' | 'blind';

/** A resolved place to hand the conversation to. */
export type HandoffDestination =
    | {
          Kind: 'user';
          /** The `MJ: Users` id of the person who is offered the conversation. */
          UserID: string;
          /** A name the AI can say (and the console can show). */
          DisplayName: string;
          /** E.164 number the room dials into the call when the person declines or does not answer in time. */
          FallbackNumber?: string;
      }
    | {
          Kind: 'number';
          /** E.164 number the room dials. The caller of the engine has already checked it against the outbound policy. */
          Number: string;
          DisplayName: string;
          /** Optional outbound caller ID to present when dialing. */
          FromNumber?: string;
      }
    | {
          Kind: 'agent';
          /** The `MJ: AI Agents` id of the agent that takes over. */
          AgentID: string;
          AgentName: string;
      };

/** One request to hand the conversation over. */
export interface HandoffRequest {
    Mode: HandoffMode;
    Destination: HandoffDestination;
    /** A short summary of the conversation so far, written by the AI. Shown on the offer and given to a taking-over agent. */
    Summary: string;
}

/** Where a handoff offer stands. */
export type HandoffOfferStatus = 'Pending' | 'Accepted' | 'Declined' | 'Expired' | 'Cancelled';

/** What the console is shown about an offer. Never carries server-only fields (the target user id, the bridge id). */
export interface HandoffOfferView {
    OfferID: string;
    RoomName: string;
    Mode: HandoffMode;
    /** The AI's summary of the conversation so far. */
    Summary: string;
    /** Who is on the other end, in words the person can use (a masked number, "Web visitor"). */
    CallerLabel: string;
    /** The AI agent that is in the room. */
    AgentName: string;
    Status: HandoffOfferStatus;
    /** ISO-8601 UTC. */
    CreatedAt: string;
    /** ISO-8601 UTC; after this the offer can no longer be accepted. */
    ExpiresAt: string;
    /** The MJ interaction ID associated with this conversation/room, if known. */
    InteractionID?: string | null;
}

/** One change to an offer, as published to the person it was offered to. */
export interface HandoffOfferEvent {
    /** The person the offer belongs to. A server-side delivery key: subscribers only ever see their own. */
    UserID: string;
    /** `offered` for a new offer; `updated` when it was accepted, declined, expired or cancelled. */
    Kind: 'offered' | 'updated';
    Offer: HandoffOfferView;
}

/**
 * The live room call one AI agent is part of, as the engine needs to act on it. The host builds one per agent
 * session and hands it to {@link RoomHandoffEngine.RequestHandoff}.
 */
export interface RoomHandoffAgentContext {
    RoomName: string;
    /** The agent's own name (said to the caller, shown on the offer). */
    AgentName: string;
    /** Who is on the other end of the room. */
    CallerLabel: string;
    /** The user the call runs as (a taking-over agent runs as the same user). */
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /** Removes THIS agent from the room. The room, and the caller, stay. */
    LeaveRoom: () => Promise<void>;
    /** Tells THIS agent's model something that happened out-of-band, so it can say it aloud. */
    NotifyModel: (note: string) => void;
}

/** What the engine tells the host synchronously when a handoff is requested. */
export type HandoffStartResult = { Ok: true; Status: 'offered' | 'dialing' | 'agent-joining' } | { Ok: false; Error: string };

/** Delivers a new offer to the person it was made to, outside the live subscription (in-app notification, email). */
export interface IHandoffNotifier {
    NotifyOffer(offer: HandoffOfferView, targetUserID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void>;
}

/** Pushes offer changes to the person's open console. */
export interface IHandoffPublisher {
    Publish(event: HandoffOfferEvent): void;
}

/** Whether a participant is currently in a room. */
export interface IRoomPresence {
    IsParticipantPresent(roomName: string, identity: string): Promise<boolean>;
}

/** What a dial-out into the room needs. */
export interface DialIntoRoomRequest {
    RoomName: string;
    Number: string;
    ParticipantIdentity: string;
    DisplayName?: string;
    /** Caller ID / outbound from number (overrides default outbound from number). */
    FromNumber?: string;
    /** Seconds to let the number ring. */
    RingTimeoutSeconds?: number;
}

/** Dials a phone number into a room as a participant. */
export interface IRoomDialer {
    DialIntoRoom(request: DialIntoRoomRequest): Promise<void>;
}

/** Asks the host to put an AI agent into the room, either to take a conversation over or to start one. */
export interface StartRoomAgentRequest {
    RoomName: string;
    /** The agent the caller is to talk to (the persona; the host resolves the voice front-end that speaks as it). */
    AgentID: string;
    AgentName: string;
    /** When taking over: what the agent that is leaving says about the conversation. Absent when starting a conversation. */
    Brief?: string;
    /** When taking over: the agent that is handing over. */
    PreviousAgentName?: string;
    CallerLabel: string;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /** Optional per-session realtime model override (a developer's choice in the Meet UI). */
    RealtimeModelID?: string;
    /** Optional per-session voice override. */
    RealtimeVoice?: string;
}

/** Observer for handoff lifecycle events (offered, accepted, declined, transferred, escalated). */
export interface IRoomHandoffObserver {
    OnHandoffEvent?: (event: {
        RoomName: string;
        EventType: 'Offered' | 'Accepted' | 'Declined' | 'Transferred' | 'Escalated';
        ActorUserID?: string;
        ActorAgentID?: string;
        Details?: Record<string, unknown>;
        ContextUser?: UserInfo;
        Provider?: IMetadataProvider;
    }) => void | Promise<void>;
}

/** What the host reports back once the agent is in the room. */
export interface StartedRoomAgent {
    /** The `MJ: AI Agent Session Bridges` row id (use it to stop that agent). */
    SessionBridgeID: string;
}

/** Puts an AI agent into the room (the host owns the realtime session, tools and capacity for it). */
export type RoomAgentStarter = (request: StartRoomAgentRequest) => Promise<StartedRoomAgent>;
