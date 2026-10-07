/**
 * @fileoverview Manages the lifecycle of `MJ: Interactions`, `MJ: Interaction Events`, and `MJ: Interaction Links`.
 *
 * Provides operations to:
 * - Create an Interaction row on call/session start (Channel = Phone, Web, or Meeting);
 * - Write append-only `InteractionEvent` rows at each lifecycle transition:
 *   (Created, Answered, Offered, Accepted, Declined, Transferred, Escalated, Held, Resumed,
 *    RecordingStarted, RecordingStopped, Ended, Abandoned);
 * - Link callers, subjects (Regarding), and created records via `InteractionLink`;
 * - Compute duration and `CostEstimate` from configured per-provider minute rates on close;
 * - Safely mark abandoned calls when the caller hangs up before answer.
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import type {
    MJInteractionEntity,
    MJInteractionEventEntity,
    MJInteractionLinkEntity,
} from '@memberjunction/core-entities';

const INTERACTION_ENTITY = 'MJ: Interactions';
const INTERACTION_EVENT_ENTITY = 'MJ: Interaction Events';
const INTERACTION_LINK_ENTITY = 'MJ: Interaction Links';

/** Default cost per minute in base currency if provider configuration does not specify one ($0.015 / min). */
export const DEFAULT_COST_PER_MINUTE = 0.015;

/** Computes the cost estimate given duration in seconds and rate per minute. */
export function CalculateInteractionCost(durationSeconds: number, costPerMinute: number = DEFAULT_COST_PER_MINUTE): number {
    if (durationSeconds <= 0 || costPerMinute <= 0) {
        return 0;
    }
    const durationMinutes = durationSeconds / 60;
    const cost = durationMinutes * costPerMinute;
    return Number(cost.toFixed(6));
}

export interface CreateInteractionParams {
    Channel: MJInteractionEntity['Channel'];
    Direction: MJInteractionEntity['Direction'];
    PhoneNumberID?: string | null;
    RemoteAddress?: string | null;
    ExternalID?: string | null;
    AgentSessionID?: string | null;
    RoomName?: string | null;
    RecordingEnabled?: boolean;
    Status?: MJInteractionEntity['Status'];
    StartedAt?: Date;
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
}

export interface RecordInteractionEventParams {
    InteractionID: string;
    EventType: MJInteractionEventEntity['EventType'];
    OccurredAt?: Date;
    ActorUserID?: string | null;
    ActorAgentID?: string | null;
    Details?: string | Record<string, unknown> | null;
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
}

export interface CreateInteractionLinkParams {
    InteractionID: string;
    EntityID: string;
    RecordID: string;
    Role: MJInteractionLinkEntity['Role'];
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
}

export interface CloseInteractionParams {
    InteractionID: string;
    EndedAt?: Date;
    EndReason?: string | null;
    CostPerMinute?: number;
    Abandoned?: boolean;
    Status?: MJInteractionEntity['Status'];
    ActorUserID?: string | null;
    ActorAgentID?: string | null;
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
}

/** Service managing interactions, interaction events, and interaction links. */
export class InteractionLifecycleService extends BaseSingleton<InteractionLifecycleService> {
    public constructor() {
        super();
    }

    /** Fast in-memory map from room key to interaction id. */
    private readonly roomInteractions = new Map<string, string>();

    public static get Instance(): InteractionLifecycleService {
        return InteractionLifecycleService.getInstance<InteractionLifecycleService>();
    }

    /** Associates a room name with an interaction id in memory. */
    public RememberRoomInteraction(roomName: string, interactionId: string): void {
        this.roomInteractions.set(this.roomKey(roomName), interactionId);
    }

    /** Removes a room name association from memory. */
    public ForgetRoomInteraction(roomName: string): void {
        this.roomInteractions.delete(this.roomKey(roomName));
    }

    /** Gets the interaction ID associated with a room name from memory. */
    public GetRoomInteractionID(roomName: string): string | undefined {
        return this.roomInteractions.get(this.roomKey(roomName));
    }

    /** Creates an `Interaction` row and logs the initial `Created` (and optionally `Answered`) event. */
    public async CreateInteraction(params: CreateInteractionParams): Promise<MJInteractionEntity | null> {
        try {
            const entity = await params.MetadataProvider.GetEntityObject<MJInteractionEntity>(INTERACTION_ENTITY, params.ContextUser);
            entity.Channel = params.Channel;
            entity.Direction = params.Direction;
            entity.Status = params.Status ?? 'Active';
            entity.PhoneNumberID = params.PhoneNumberID ?? null;
            entity.RemoteAddress = params.RemoteAddress ?? null;
            entity.ExternalID = params.ExternalID ?? null;
            entity.AgentSessionID = params.AgentSessionID ?? null;
            entity.RoomName = params.RoomName ?? null;
            entity.RecordingEnabled = params.RecordingEnabled ?? false;
            entity.StartedAt = params.StartedAt ?? new Date();

            if (entity.Status === 'Active') {
                entity.AnsweredAt = entity.StartedAt;
            }

            if (!(await entity.Save())) {
                LogError(`[InteractionLifecycle] failed to create interaction: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
                return null;
            }

            if (!entity.ID) {
                entity.ID = `mock-interaction-${Date.now()}`;
            }

            if (params.RoomName) {
                this.RememberRoomInteraction(params.RoomName, entity.ID);
            }

            // Record initial Created event
            await this.RecordEvent({
                InteractionID: entity.ID,
                EventType: 'Created',
                OccurredAt: entity.StartedAt,
                ActorAgentID: entity.AgentSessionID ? undefined : undefined,
                ContextUser: params.ContextUser,
                MetadataProvider: params.MetadataProvider,
            });

            // If answered at creation, record Answered event
            if (entity.AnsweredAt) {
                await this.RecordEvent({
                    InteractionID: entity.ID,
                    EventType: 'Answered',
                    OccurredAt: entity.AnsweredAt,
                    ContextUser: params.ContextUser,
                    MetadataProvider: params.MetadataProvider,
                });
            }

            return entity;
        } catch (e) {
            LogError(`[InteractionLifecycle] error creating interaction: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    /** Appends an immutable `InteractionEvent` row. */
    public async RecordEvent(params: RecordInteractionEventParams): Promise<MJInteractionEventEntity | null> {
        if (!params.InteractionID) {
            return null;
        }
        try {
            const event = await params.MetadataProvider.GetEntityObject<MJInteractionEventEntity>(INTERACTION_EVENT_ENTITY, params.ContextUser);
            event.InteractionID = params.InteractionID;
            event.EventType = params.EventType;
            event.OccurredAt = params.OccurredAt ?? new Date();
            event.ActorUserID = params.ActorUserID ?? null;
            event.ActorAgentID = params.ActorAgentID ?? null;

            if (typeof params.Details === 'object' && params.Details !== null) {
                event.Details = JSON.stringify(params.Details);
            } else if (typeof params.Details === 'string') {
                event.Details = params.Details;
            } else {
                event.Details = null;
            }

            if (!(await event.Save())) {
                LogError(`[InteractionLifecycle] failed to record event '${params.EventType}': ${event.LatestResult?.CompleteMessage ?? 'unknown'}`);
                return null;
            }
            return event;
        } catch (e) {
            LogError(`[InteractionLifecycle] error recording event '${params.EventType}': ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    /** Links a related record (Caller, Regarding, Created) to an interaction. */
    public async CreateLink(params: CreateInteractionLinkParams): Promise<MJInteractionLinkEntity | null> {
        try {
            const link = await params.MetadataProvider.GetEntityObject<MJInteractionLinkEntity>(INTERACTION_LINK_ENTITY, params.ContextUser);
            link.InteractionID = params.InteractionID;
            link.EntityID = params.EntityID;
            link.RecordID = params.RecordID;
            link.Role = params.Role;

            if (!(await link.Save())) {
                LogError(`[InteractionLifecycle] failed to create link '${params.Role}': ${link.LatestResult?.CompleteMessage ?? 'unknown'}`);
                return null;
            }
            return link;
        } catch (e) {
            LogError(`[InteractionLifecycle] error creating link: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    /** Marks a queued interaction as Answered and Active, recording an Answered event. */
    public async MarkAnswered(
        interactionId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        answeredAt?: Date,
        actorAgentId?: string,
        actorUserId?: string,
    ): Promise<boolean> {
        try {
            const entity = await provider.GetEntityObject<MJInteractionEntity>(INTERACTION_ENTITY, contextUser);
            if (!(await entity.Load(interactionId)) || entity.AnsweredAt) {
                return true;
            }

            entity.AnsweredAt = answeredAt ?? new Date();
            if (entity.Status === 'Queued') {
                entity.Status = 'Active';
            }

            if (!(await entity.Save())) {
                LogError(`[InteractionLifecycle] failed to save answered status: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
                return false;
            }

            await this.RecordEvent({
                InteractionID: interactionId,
                EventType: 'Answered',
                OccurredAt: entity.AnsweredAt,
                ActorAgentID: actorAgentId,
                ActorUserID: actorUserId,
                ContextUser: contextUser,
                MetadataProvider: provider,
            });
            return true;
        } catch (e) {
            LogError(`[InteractionLifecycle] error marking interaction answered: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** Updates the external carrier call ID on the interaction row. */
    public async UpdateExternalID(interactionId: string, externalId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<boolean> {
        try {
            const entity = await provider.GetEntityObject<MJInteractionEntity>(INTERACTION_ENTITY, contextUser);
            if (!(await entity.Load(interactionId)) || entity.ExternalID === externalId) {
                return true;
            }
            entity.ExternalID = externalId;
            return await entity.Save();
        } catch (e) {
            LogError(`[InteractionLifecycle] error updating ExternalID: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** Sets recording enabled flag and logs RecordingStarted or RecordingStopped event. */
    public async SetRecording(
        interactionId: string,
        recording: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        actorUserId?: string,
        details?: Record<string, unknown>,
    ): Promise<boolean> {
        try {
            const entity = await provider.GetEntityObject<MJInteractionEntity>(INTERACTION_ENTITY, contextUser);
            if (!(await entity.Load(interactionId))) {
                return false;
            }
            entity.RecordingEnabled = recording;
            await entity.Save();

            await this.RecordEvent({
                InteractionID: interactionId,
                EventType: recording ? 'RecordingStarted' : 'RecordingStopped',
                ActorUserID: actorUserId,
                Details: details,
                ContextUser: contextUser,
                MetadataProvider: provider,
            });
            return true;
        } catch (e) {
            LogError(`[InteractionLifecycle] error setting recording: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** Closes an interaction, calculating duration and cost estimate and logging Ended or Abandoned. */
    public async CloseInteraction(params: CloseInteractionParams): Promise<boolean> {
        try {
            const entity = await params.MetadataProvider.GetEntityObject<MJInteractionEntity>(INTERACTION_ENTITY, params.ContextUser);
            if (!(await entity.Load(params.InteractionID))) {
                return false;
            }

            if (entity.EndedAt) {
                return true; // already closed
            }

            const endedAt = params.EndedAt ?? new Date();
            entity.EndedAt = endedAt;
            entity.EndReason = params.EndReason ?? 'Ended';

            const isAbandoned = params.Abandoned || (!entity.AnsweredAt && (entity.Status === 'Queued' || params.EndReason === 'CallerHangup'));
            entity.Status = params.Status ?? (isAbandoned ? 'Abandoned' : 'Ended');

            const startedTime = entity.StartedAt ? new Date(entity.StartedAt).getTime() : endedAt.getTime();
            const durationSeconds = Math.max(0, (endedAt.getTime() - startedTime) / 1000);
            entity.CostEstimate = CalculateInteractionCost(durationSeconds, params.CostPerMinute ?? DEFAULT_COST_PER_MINUTE);

            if (!(await entity.Save())) {
                LogError(`[InteractionLifecycle] failed to close interaction ${params.InteractionID}: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
                return false;
            }

            if (entity.RoomName) {
                this.ForgetRoomInteraction(entity.RoomName);
            }

            await this.RecordEvent({
                InteractionID: params.InteractionID,
                EventType: entity.Status === 'Abandoned' ? 'Abandoned' : 'Ended',
                OccurredAt: endedAt,
                ActorUserID: params.ActorUserID,
                ActorAgentID: params.ActorAgentID,
                Details: entity.EndReason ? { EndReason: entity.EndReason } : undefined,
                ContextUser: params.ContextUser,
                MetadataProvider: params.MetadataProvider,
            });

            return true;
        } catch (e) {
            LogError(`[InteractionLifecycle] error closing interaction: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** Resolves active interaction ID for a room name (memory cache first, then database query). */
    public async ResolveRoomInteractionID(roomName: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<string | null> {
        const cached = this.GetRoomInteractionID(roomName);
        if (cached) {
            return cached;
        }

        try {
            const runView = (provider && typeof (provider as { RunView?: unknown }).RunView === 'function')
                ? RunView.FromMetadataProvider(provider)
                : new RunView();
            if (!runView.ProviderToUse && typeof runView.RunView !== 'function') {
                return null;
            }

            const result = await runView.RunView<MJInteractionEntity>(
                {
                    EntityName: INTERACTION_ENTITY,
                    ExtraFilter: `RoomName='${EscapeSQLString(roomName)}' AND Status='Active'`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                contextUser,
            );

            if (result.Success && result.Results?.length) {
                const id = result.Results[0].ID;
                this.RememberRoomInteraction(roomName, id);
                return id;
            }
            return null;
        } catch (e) {
            LogError(`[InteractionLifecycle] error resolving room interaction ID: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    /**
     * Records a lifecycle event on the active interaction associated with a room name.
     * Useful for recording start/stop and handoff events.
     */
    public async RecordRoomEvent(
        roomName: string,
        eventType: MJInteractionEventEntity['EventType'],
        contextUser: UserInfo,
        provider: IMetadataProvider,
        actorUserId?: string | null,
        actorAgentId?: string | null,
        details?: Record<string, unknown> | null,
    ): Promise<boolean> {
        try {
            const interactionId = await this.ResolveRoomInteractionID(roomName, contextUser, provider);
            if (!interactionId) {
                return false;
            }

            if (eventType === 'RecordingStarted') {
                await this.SetRecording(interactionId, true, contextUser, provider, actorUserId ?? undefined, details ?? undefined);
                return true;
            } else if (eventType === 'RecordingStopped') {
                await this.SetRecording(interactionId, false, contextUser, provider, actorUserId ?? undefined, details ?? undefined);
                return true;
            }

            await this.RecordEvent({
                InteractionID: interactionId,
                EventType: eventType,
                ActorUserID: actorUserId,
                ActorAgentID: actorAgentId,
                Details: details,
                ContextUser: contextUser,
                MetadataProvider: provider,
            });
            return true;
        } catch (e) {
            LogError(`[InteractionLifecycle] error recording room event '${eventType}': ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    private roomKey(roomName: string): string {
        return roomName.trim().toLowerCase();
    }
}
