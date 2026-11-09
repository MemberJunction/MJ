/**
 * @fileoverview Server-side publisher for **realtime session events** — the hook an app (or MJ itself)
 * calls to push a typed event into ONE live realtime session.
 *
 * The wire contract (event types, payload shapes, parsing) lives in `@memberjunction/ai-core-plus`
 * (`realtime-session-events.ts`). This module owns the transport: it publishes onto MJServer's
 * existing PubSub (`PubSubManager`) so the `RealtimeSessionEvents` GraphQL subscription can deliver it.
 *
 * ## Routing is part of the payload
 *
 * Every published event carries a snapshot of who may see it — the session's owner (`OwnerUserID`) and
 * the session's anonymous scope id (`ScopeKey`). The subscription filter compares that snapshot with
 * the **connection's** authenticated identity, so a subscriber who guesses another session's id still
 * receives nothing. These two fields are server-internal: the GraphQL notification type does not
 * expose them.
 *
 * ## Multiple server instances
 *
 * PubSub is in-process. Behind a load balancer the browser's WebSocket can live on a different replica
 * than the one that handled the verification link. {@link RealtimeSessionEventService.SetReplicationHook}
 * lets the host fan events out (the server wires it to Redis when `REDIS_URL` is set, exactly as it does
 * for push-status updates), and {@link RealtimeSessionEventService.PublishReplicated} republishes an event
 * that arrived from another instance.
 *
 * @example
 * ```ts
 * // From an Open App's server code, after it finished some work for a live session:
 * await RealtimeSessionEventService.Instance.Publish({
 *     AgentSessionID: sessionId,
 *     Type: 'acme.quote.ready',
 *     Payload: { QuoteID: quote.ID },
 *     ContextUser: systemUser,
 * });
 * ```
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import {
    SerializeRealtimeSessionEvent,
    type RealtimeSessionEventPayload,
    type RealtimeSessionEventType,
} from '@memberjunction/ai-core-plus';
import { PubSubManager } from '../generic/PubSubManager.js';
import { LoadSessionForAccess } from './sessionAccess.js';

/** The PubSub topic every realtime session event is published on. */
export const REALTIME_SESSION_EVENTS_TOPIC = 'REALTIME_SESSION_EVENTS';

/**
 * What is actually published on {@link REALTIME_SESSION_EVENTS_TOPIC}: the wire event plus the
 * server-internal routing snapshot.
 */
export type RealtimeSessionEventTopicPayload = {
    Type: string;
    AgentSessionID: string;
    OccurredAt: string;
    /** The event payload, JSON-encoded. */
    PayloadJson: string;
    /** `AIAgentSession.UserID` — compared with the subscriber connection's user. Server-internal. */
    OwnerUserID: string;
    /** `Conversation.ExternalID` — compared with the subscriber's signed scope. Server-internal. */
    ScopeKey: string | null;
    /**
     * `MJGlobal.ProcessUUID` of the instance that first published the event; lets an instance drop its
     * own message when it echoes back from the replication bus.
     */
    SourceServerId?: string;
};

/** Who may receive an event, resolved from the session at publish time. */
export interface RealtimeSessionEventRouting {
    /** The session the event is addressed to. */
    AgentSessionID: string;
    /** The session's owner. */
    OwnerUserID: string;
    /** The session conversation's `ExternalID` (anonymous scope id), or null. */
    ScopeKey: string | null;
}

/** Input to {@link RealtimeSessionEventService.Publish}. */
export interface PublishRealtimeSessionEventInput<T extends RealtimeSessionEventType> {
    /** The session to address. */
    AgentSessionID: string;
    /** Event type — a key of `RealtimeSessionEventPayloadMap`. */
    Type: T;
    /** Type-specific data; must be JSON-serializable. */
    Payload: RealtimeSessionEventPayload<T>;
    /**
     * The identity to read the session under. Server-side publishers pass a system/service user — the
     * session row is being addressed by the server, not on a caller's behalf.
     */
    ContextUser: UserInfo;
    /** Provider to read the session with. Defaults to the process-global provider (server bootstrap use). */
    Provider?: IMetadataProvider;
}

/** Outcome of a publish. A failure is never silent: it is also logged. */
export interface PublishRealtimeSessionEventResult {
    /** True when the event was handed to the PubSub. */
    Success: boolean;
    /** Why it was not, when it was not. */
    ErrorMessage?: string;
}

/** Called for every locally-published event so the host can replicate it to other instances. */
export type RealtimeSessionEventReplicationHook = (payload: RealtimeSessionEventTopicPayload) => void;

/**
 * Publishes realtime session events. A {@link BaseSingleton}: there is one publisher per process, and
 * the replication hook is process-wide state.
 */
export class RealtimeSessionEventService extends BaseSingleton<RealtimeSessionEventService> {
    private replicationHook: RealtimeSessionEventReplicationHook | undefined;

    protected constructor() {
        super();
    }

    /** The process-wide instance. */
    public static get Instance(): RealtimeSessionEventService {
        return super.getInstance<RealtimeSessionEventService>();
    }

    /**
     * Publishes an event to one live session. Reads the session to snapshot its owner and scope, so the
     * caller never supplies (and can never get wrong) who may receive the event.
     *
     * Does not require the session to be open: an event for a closed session simply reaches no
     * subscriber.
     *
     * @returns a result rather than throwing — event delivery is best-effort, durable state lives
     *   elsewhere (the verification status query is the backstop for a missed `identity.verified`).
     */
    public async Publish<T extends RealtimeSessionEventType>(
        input: PublishRealtimeSessionEventInput<T>,
    ): Promise<PublishRealtimeSessionEventResult> {
        try {
            const provider = input.Provider ?? Metadata.Provider; // global-provider-ok: documented last-resort fallback for server-bootstrap publishers
            const loaded = await LoadSessionForAccess(input.AgentSessionID, input.ContextUser, provider);
            if (!loaded) {
                return this.fail(`Realtime session ${input.AgentSessionID} not found; event '${input.Type}' not published.`);
            }
            return this.PublishRouted(
                {
                    AgentSessionID: loaded.Session.ID,
                    OwnerUserID: loaded.Session.UserID,
                    ScopeKey: loaded.ConversationExternalID,
                },
                input.Type,
                input.Payload,
            );
        } catch (error) {
            return this.fail(`Publishing '${input.Type}' to session ${input.AgentSessionID} failed: ${errorText(error)}`);
        }
    }

    /**
     * Publishes an event when the caller already holds the session's routing (the verification service
     * has just loaded the session, so it must not pay a second read).
     */
    public PublishRouted<T extends RealtimeSessionEventType>(
        routing: RealtimeSessionEventRouting,
        type: T,
        payload: RealtimeSessionEventPayload<T>,
    ): PublishRealtimeSessionEventResult {
        const wire = SerializeRealtimeSessionEvent({
            Type: type,
            AgentSessionID: routing.AgentSessionID,
            OccurredAt: new Date().toISOString(),
            Payload: payload,
        });
        const topicPayload: RealtimeSessionEventTopicPayload = {
            ...wire,
            OwnerUserID: routing.OwnerUserID,
            ScopeKey: routing.ScopeKey,
            SourceServerId: MJGlobal.Instance.ProcessUUID,
        };
        if (!PubSubManager.Instance.PubSubEngine) {
            return this.fail(`PubSub is not configured; event '${type}' for session ${routing.AgentSessionID} not published.`);
        }
        PubSubManager.Instance.Publish(REALTIME_SESSION_EVENTS_TOPIC, topicPayload);
        this.replicate(topicPayload);
        return { Success: true };
    }

    /**
     * Republishes an event that arrived from another server instance onto THIS instance's local topic
     * only (never back through the replication hook, so there is no loop). The subscription filter still
     * decides who receives it — a replica has no say in who sees what.
     */
    public PublishReplicated(payload: RealtimeSessionEventTopicPayload): void {
        PubSubManager.Instance.Publish(REALTIME_SESSION_EVENTS_TOPIC, payload);
    }

    /**
     * Registers (or, with no argument, clears) the cross-instance fan-out hook. Inversion of control:
     * this module must not know that Redis exists.
     */
    public SetReplicationHook(hook?: RealtimeSessionEventReplicationHook): void {
        this.replicationHook = hook;
    }

    /** Hands a locally-published event to the replication hook, never letting a bus failure break local delivery. */
    private replicate(payload: RealtimeSessionEventTopicPayload): void {
        if (!this.replicationHook) {
            return;
        }
        try {
            this.replicationHook(payload);
        } catch (error) {
            // Replication is an optimisation over the durable status query; local delivery already happened.
            LogError(`RealtimeSessionEventService: replication hook failed: ${errorText(error)}`);
        }
    }

    private fail(message: string): PublishRealtimeSessionEventResult {
        LogError(`RealtimeSessionEventService: ${message}`);
        return { Success: false, ErrorMessage: message };
    }
}

/**
 * Validates an event received from the cross-instance message bus before it is republished locally.
 *
 * The bus carries messages from other processes, so every field is type-checked. Fails closed: an event
 * with no routing identity can never be delivered safely, so it is dropped.
 *
 * @param raw - the JSON text taken off the bus
 * @param localServerId - this process's `MJGlobal.ProcessUUID`, used to drop our own echo
 * @returns the event to republish, or `null` to drop it
 */
export function ParseReplicatedRealtimeSessionEvent(raw: string, localServerId: string): RealtimeSessionEventTopicPayload | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null; // not JSON: nothing to deliver
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }
    const record = parsed as Record<string, unknown>;
    const { Type, AgentSessionID, OccurredAt, PayloadJson, OwnerUserID, ScopeKey, SourceServerId } = record;
    if (SourceServerId === localServerId) {
        return null; // our own message, echoed back
    }
    const requiredStrings = [Type, AgentSessionID, OccurredAt, PayloadJson, OwnerUserID];
    if (requiredStrings.some((value) => typeof value !== 'string' || value.length === 0)) {
        return null; // includes a missing owner: fail closed
    }
    if (ScopeKey !== null && ScopeKey !== undefined && typeof ScopeKey !== 'string') {
        return null;
    }
    if (SourceServerId !== undefined && typeof SourceServerId !== 'string') {
        return null;
    }
    return {
        Type: Type as string,
        AgentSessionID: AgentSessionID as string,
        OccurredAt: OccurredAt as string,
        PayloadJson: PayloadJson as string,
        OwnerUserID: OwnerUserID as string,
        ScopeKey: typeof ScopeKey === 'string' ? ScopeKey : null,
        SourceServerId: typeof SourceServerId === 'string' ? SourceServerId : undefined,
    };
}

/** Message text of an unknown thrown value. */
function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
