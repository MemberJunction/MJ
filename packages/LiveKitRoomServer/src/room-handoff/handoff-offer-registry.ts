/**
 * @fileoverview Durable registry of handoff offers backed by `MJ: Interaction Offers`.
 *
 * An offer is a short-lived question put to one person: "a caller is waiting, will you take the conversation?".
 * It lives in `MJ: Interaction Offers` from the moment the AI asks until it is accepted, declined, expired or cancelled,
 * and is kept so a console that was open when it resolved can still show what happened.
 *
 * **Durable and cluster-safe.** Offers are stored in the database (`MJ: Interaction Offers`). Accept and decline
 * execute a compare-and-set on `Status = 'Pending'` inside `RunInEntityTransaction` so multiple server instances
 * cannot both accept or race. Expired offers are updated on read and through a periodic sweep. Live changes are
 * published locally and across instances via cluster pub/sub.
 *
 * An accept or decline is authorised by comparing the offer's target user with the caller, and a mismatch answers
 * exactly as a missing offer does: someone who does not own an offer cannot learn that it exists.
 *
 * @module @memberjunction/livekit-room-server
 */

import { randomUUID } from 'node:crypto';
import { type EntityTransactionScope, IMetadataProvider, LogError, Metadata, RunInEntityTransaction, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { MJInteractionOfferEntity, MJInteractionEntity } from '@memberjunction/core-entities';
import type { HandoffMode, HandoffOfferStatus, HandoffOfferView } from './handoff-types';

/** How long a person has to accept an offer before it expires. */
export const HANDOFF_OFFER_TIMEOUT_MS = 45_000;

/** How long a resolved offer stays listed (so a console that was open still sees what happened). */
export const HANDOFF_OFFER_RETENTION_MS = 5 * 60_000;

/** The most pending offers one person can have at once; a flood of offers is refused rather than queued. */
export const MAX_PENDING_OFFERS_PER_USER = 10;

/** What the registry stores for one offer. */
export interface HandoffOfferRecord {
    OfferID: string;
    RoomName: string;
    /** The person the offer was made to. Server-side only. */
    TargetUserID: string;
    Mode: HandoffMode;
    Summary: string;
    CallerLabel: string;
    AgentName: string;
    Status: HandoffOfferStatus;
    CreatedAtMs: number;
    ExpiresAtMs: number;
    /** When the offer left `Pending`, for retention. */
    ResolvedAtMs?: number;
    InteractionID?: string;
    OfferedByAgentID?: string | null;
}

/** What it takes to create an offer. */
export interface CreateOfferInput {
    RoomName: string;
    TargetUserID: string;
    Mode: HandoffMode;
    Summary: string;
    CallerLabel: string;
    AgentName: string;
    InteractionID?: string;
    OfferedByAgentID?: string | null;
    ContextUser?: UserInfo;
    Provider?: IMetadataProvider;
}

/** The result of trying to resolve an offer on a person's behalf. */
export type ResolveOfferResult = { Ok: true; Offer: HandoffOfferRecord } | { Ok: false; Reason: string };

/** The one answer for "no such offer", "not yours" and "too late", so an offer's existence is not leaked. */
const OFFER_UNAVAILABLE = 'This conversation offer is no longer available.';

/** Converts a stored offer to what a console may see. */
export function ToOfferView(offer: HandoffOfferRecord): HandoffOfferView {
    return {
        OfferID: offer.OfferID,
        RoomName: offer.RoomName,
        Mode: offer.Mode,
        Summary: offer.Summary,
        CallerLabel: offer.CallerLabel,
        AgentName: offer.AgentName,
        Status: offer.Status,
        CreatedAt: new Date(offer.CreatedAtMs).toISOString(),
        ExpiresAt: new Date(offer.ExpiresAtMs).toISOString(),
    };
}

export interface HandoffOfferRegistryDeps {
    Provider?: IMetadataProvider;
    ContextUser?: UserInfo;
    Publisher?: (event: { UserID: string; Kind: 'offered' | 'updated'; Offer: HandoffOfferView }) => void;
}

type TransactionCapableProvider = {
    SupportsEntityTransactions?: boolean;
    BeginEntityTransaction?(): Promise<EntityTransactionScope>;
};

function asTransactionCapable(provider: IMetadataProvider | null | undefined): TransactionCapableProvider | undefined {
    if (!provider) return undefined;
    const candidate = provider as TransactionCapableProvider;
    return candidate.SupportsEntityTransactions === true && typeof candidate.BeginEntityTransaction === 'function'
        ? candidate
        : undefined;
}

/** Holds handoff offers in `MJ: Interaction Offers` with in-memory caching and compare-and-set concurrency guards. */
export class HandoffOfferRegistry extends BaseSingleton<HandoffOfferRegistry> {
    private deps: HandoffOfferRegistryDeps = {};
    private readonly offers = new Map<string, HandoffOfferRecord>();
    private now: () => number = Date.now;
    private sweepTimer?: ReturnType<typeof setInterval>;

    protected constructor() {
        super();
        this.sweepTimer = setInterval(() => {
            void this.Sweep().catch((e) => {
                LogError(`[HandoffOfferRegistry] periodic sweep failed: ${e instanceof Error ? e.message : String(e)}`);
            });
        }, 15_000);
        (this.sweepTimer as { unref?: () => void }).unref?.();
    }

    /** The process-wide registry. */
    public static get Instance(): HandoffOfferRegistry {
        return super.getInstance<HandoffOfferRegistry>();
    }

    /** Configures collaborator dependencies. */
    public Configure(deps: HandoffOfferRegistryDeps): void {
        this.deps = { ...this.deps, ...deps };
    }

    /** Stops the periodic background sweep timer (shutdown, tests). */
    public StopPeriodicSweep(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = undefined;
        }
    }

    /** Replaces the clock (tests). */
    public SetClock(now: () => number): void {
        this.now = now;
    }

    /** Forgets every cached offer (tests, shutdown). */
    public Clear(): void {
        this.offers.clear();
    }

    /**
     * Creates a pending offer. Refuses when the person already has {@link MAX_PENDING_OFFERS_PER_USER} pending.
     *
     * @returns The new offer, or `undefined` when the person's pending-offer cap is reached.
     */
    public async Create(input: CreateOfferInput, timeoutMs: number = HANDOFF_OFFER_TIMEOUT_MS): Promise<HandoffOfferRecord | undefined> {
        await this.sweep(input.ContextUser, input.Provider);
        const pending = await this.PendingForUser(input.TargetUserID, input.ContextUser, input.Provider);
        if (pending.length >= MAX_PENDING_OFFERS_PER_USER) {
            return undefined;
        }

        const createdAt = this.now();
        const expiresAt = createdAt + timeoutMs;
        const p = this.getProvider(input.Provider);

        if (p && typeof p.GetEntityObject === 'function') {
            const user = input.ContextUser ?? this.deps.ContextUser;
            try {
                let interactionID = input.InteractionID;
                if (!interactionID) {
                    const rv = this.getRunView(p);
                    const existing = await rv.RunView<MJInteractionEntity>(
                        {
                            EntityName: 'MJ: Interactions',
                            ExtraFilter: `RoomName = '${EscapeSQLString(input.RoomName.trim())}' AND Status = 'Active'`,
                            ResultType: 'entity_object',
                        },
                        user
                    );
                    if (existing.Success && existing.Results && existing.Results.length > 0) {
                        interactionID = existing.Results[0].ID;
                    } else {
                        const interaction = await p.GetEntityObject<MJInteractionEntity>('MJ: Interactions', user);
                        interaction.Channel = 'Web';
                        interaction.Direction = 'Inbound';
                        interaction.RoomName = input.RoomName;
                        interaction.Status = 'Active';
                        interaction.StartedAt = new Date(createdAt);
                        const savedInteraction = await interaction.Save();
                        if (savedInteraction) {
                            interactionID = interaction.ID;
                        }
                    }
                }

                if (interactionID) {
                    const entity = await p.GetEntityObject<MJInteractionOfferEntity>('MJ: Interaction Offers', user);
                    entity.InteractionID = interactionID;
                    entity.TargetUserID = input.TargetUserID;
                    entity.OfferedByAgentID = input.OfferedByAgentID ?? null;
                    entity.Mode = input.Mode.toLowerCase() === 'warm' ? 'Warm' : 'Blind';
                    entity.Status = 'Pending';
                    entity.RoomName = input.RoomName;
                    entity.CallerLabel = input.CallerLabel;
                    entity.Summary = input.Summary;
                    entity.OfferedAt = new Date(createdAt);
                    entity.ExpiresAt = new Date(expiresAt);
                    const saved = await entity.Save();
                    if (saved) {
                        const record = this.entityToRecord(entity, input.AgentName);
                        this.offers.set(record.OfferID, record);
                        return record;
                    }
                    LogError(`[HandoffOfferRegistry] Failed to save offer entity: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
                }
            } catch (err) {
                LogError(`[HandoffOfferRegistry] Failed to create database offer: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // In-memory fallback
        const offer: HandoffOfferRecord = {
            OfferID: randomUUID(),
            RoomName: input.RoomName,
            TargetUserID: input.TargetUserID,
            Mode: input.Mode,
            Summary: input.Summary,
            CallerLabel: input.CallerLabel,
            AgentName: input.AgentName,
            Status: 'Pending',
            CreatedAtMs: createdAt,
            ExpiresAtMs: expiresAt,
            InteractionID: input.InteractionID,
            OfferedByAgentID: input.OfferedByAgentID ?? null,
        };
        this.offers.set(offer.OfferID, offer);
        return offer;
    }

    /** The offer with this id, or `undefined`. */
    public async Get(offerID: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<HandoffOfferRecord | undefined> {
        const p = this.getProvider(provider);
        const now = this.now();
        if (p && typeof p.GetEntityObject === 'function') {
            try {
                const user = contextUser ?? this.deps.ContextUser;
                const entity = await p.GetEntityObject<MJInteractionOfferEntity>('MJ: Interaction Offers', user);
                const loaded = await entity.Load(offerID);
                if (loaded) {
                    const expiresAtMs = entity.ExpiresAt ? new Date(entity.ExpiresAt).getTime() : 0;
                    if (entity.Status === 'Pending' && expiresAtMs <= now) {
                        entity.Status = 'Expired';
                        entity.RespondedAt = new Date(now);
                        await entity.Save();
                        const record = this.entityToRecord(entity);
                        this.offers.set(record.OfferID, record);
                        this.notifyPublisher(record);
                        return record;
                    }
                    const record = this.entityToRecord(entity);
                    this.offers.set(record.OfferID, record);
                    return record;
                }
            } catch (err) {
                LogError(`[HandoffOfferRegistry] Get(${offerID}) failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const cached = this.offers.get(offerID);
        if (cached && cached.Status === 'Pending' && cached.ExpiresAtMs <= now) {
            this.finish(cached, 'Expired');
            this.notifyPublisher(cached);
        }
        return cached;
    }

    /** The person's offers that can still be accepted, soonest to expire first. */
    public async PendingForUser(userID: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<HandoffOfferRecord[]> {
        const p = this.getProvider(provider);
        const now = this.now();
        if (p && typeof p.GetEntityObject === 'function') {
            try {
                const rv = this.getRunView(p);
                const user = contextUser ?? this.deps.ContextUser;
                const result = await rv.RunView<MJInteractionOfferEntity>(
                    {
                        EntityName: 'MJ: Interaction Offers',
                        ExtraFilter: `TargetUserID = '${EscapeSQLString(userID)}' AND Status = 'Pending'`,
                        OrderBy: 'ExpiresAt ASC',
                        ResultType: 'entity_object',
                    },
                    user
                );
                if (result.Success && result.Results) {
                    const records: HandoffOfferRecord[] = [];
                    for (const entity of result.Results) {
                        const expiresAtMs = entity.ExpiresAt ? new Date(entity.ExpiresAt).getTime() : 0;
                        if (expiresAtMs <= now) {
                            entity.Status = 'Expired';
                            entity.RespondedAt = new Date(now);
                            await entity.Save();
                            const rec = this.entityToRecord(entity);
                            this.offers.set(rec.OfferID, rec);
                            this.notifyPublisher(rec);
                        } else {
                            const rec = this.entityToRecord(entity);
                            this.offers.set(rec.OfferID, rec);
                            records.push(rec);
                        }
                    }
                    return records.sort((a, b) => a.ExpiresAtMs - b.ExpiresAtMs);
                }
            } catch (err) {
                LogError(`[HandoffOfferRegistry] PendingForUser query failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // In-memory fallback
        return [...this.offers.values()]
            .filter((o) => o.Status === 'Pending' && o.ExpiresAtMs > now && UUIDsEqual(o.TargetUserID, userID))
            .sort((a, b) => a.ExpiresAtMs - b.ExpiresAtMs);
    }

    /** The person's offers to show: pending ones, plus ones resolved recently enough to still be retained. */
    public async ListForUser(userID: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<HandoffOfferRecord[]> {
        await this.sweep(contextUser, provider);
        const p = this.getProvider(provider);
        const now = this.now();
        if (p && typeof p.GetEntityObject === 'function') {
            try {
                const cutoff = new Date(now - HANDOFF_OFFER_RETENTION_MS).toISOString();
                const rv = this.getRunView(p);
                const user = contextUser ?? this.deps.ContextUser;
                const result = await rv.RunView<MJInteractionOfferEntity>(
                    {
                        EntityName: 'MJ: Interaction Offers',
                        ExtraFilter: `TargetUserID = '${EscapeSQLString(userID)}' AND (Status = 'Pending' OR RespondedAt >= '${cutoff}')`,
                        OrderBy: 'OfferedAt DESC',
                        ResultType: 'entity_object',
                    },
                    user
                );
                if (result.Success && result.Results) {
                    const records = result.Results.map((e) => {
                        const rec = this.entityToRecord(e);
                        this.offers.set(rec.OfferID, rec);
                        return rec;
                    });
                    return records.sort((a, b) => b.CreatedAtMs - a.CreatedAtMs);
                }
            } catch (err) {
                LogError(`[HandoffOfferRegistry] ListForUser query failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // In-memory fallback
        return [...this.offers.values()]
            .filter((o) => UUIDsEqual(o.TargetUserID, userID))
            .sort((a, b) => b.CreatedAtMs - a.CreatedAtMs);
    }

    /** The offers made from one room, any status. */
    public async ForRoom(roomName: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<HandoffOfferRecord[]> {
        const key = roomName.trim().toLowerCase();
        const p = this.getProvider(provider);
        if (p && typeof p.GetEntityObject === 'function') {
            try {
                const rv = this.getRunView(p);
                const user = contextUser ?? this.deps.ContextUser;
                const result = await rv.RunView<MJInteractionOfferEntity>(
                    {
                        EntityName: 'MJ: Interaction Offers',
                        ExtraFilter: `RoomName = '${EscapeSQLString(roomName.trim())}'`,
                        OrderBy: 'OfferedAt DESC',
                        ResultType: 'entity_object',
                    },
                    user
                );
                if (result.Success && result.Results) {
                    return result.Results.map((e) => this.entityToRecord(e));
                }
            } catch (err) {
                LogError(`[HandoffOfferRegistry] ForRoom query failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // In-memory fallback
        return [...this.offers.values()].filter((o) => o.RoomName.trim().toLowerCase() === key);
    }

    /**
     * Moves a pending offer to a terminal status on behalf of the person it was made to. The caller must be the
     * offer's target and the offer must still be pending and unexpired; anything else answers the same way.
     *
     * Compares and sets atomically in a transaction on `Status = 'Pending'` so concurrent requests across
     * multiple instances cannot both succeed.
     */
    public async ResolveForUser(
        offerID: string,
        userID: string,
        status: 'Accepted' | 'Declined',
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<ResolveOfferResult> {
        const p = this.getProvider(provider);
        if (p && typeof p.GetEntityObject === 'function') {
            const user = contextUser ?? this.deps.ContextUser;
            try {
                return await RunInEntityTransaction(asTransactionCapable(p), async () => {
                    const entity = await p.GetEntityObject<MJInteractionOfferEntity>('MJ: Interaction Offers', user);
                    const loaded = await entity.Load(offerID);
                    if (!loaded) {
                        return { Ok: false, Reason: OFFER_UNAVAILABLE };
                    }
                    if (!UUIDsEqual(entity.TargetUserID, userID)) {
                        return { Ok: false, Reason: OFFER_UNAVAILABLE };
                    }
                    const now = this.now();
                    const expiresAtMs = entity.ExpiresAt ? new Date(entity.ExpiresAt).getTime() : 0;
                    if (entity.Status !== 'Pending' || expiresAtMs <= now) {
                        if (entity.Status === 'Pending' && expiresAtMs <= now) {
                            entity.Status = 'Expired';
                            entity.RespondedAt = new Date(now);
                            await entity.Save();
                            const rec = this.entityToRecord(entity);
                            this.offers.set(rec.OfferID, rec);
                            this.notifyPublisher(rec);
                        }
                        return { Ok: false, Reason: OFFER_UNAVAILABLE };
                    }
                    entity.Status = status;
                    entity.RespondedAt = new Date(now);
                    const saved = await entity.Save();
                    if (!saved) {
                        return { Ok: false, Reason: OFFER_UNAVAILABLE };
                    }
                    const record = this.entityToRecord(entity);
                    this.offers.set(record.OfferID, record);
                    this.notifyPublisher(record);
                    return { Ok: true, Offer: record };
                });
            } catch (err) {
                LogError(`[HandoffOfferRegistry] ResolveForUser transaction failed: ${err instanceof Error ? err.message : String(err)}`);
                return { Ok: false, Reason: OFFER_UNAVAILABLE };
            }
        }

        // In-memory fallback
        const offer = this.offers.get(offerID);
        if (!offer || !UUIDsEqual(offer.TargetUserID, userID)) {
            return { Ok: false, Reason: OFFER_UNAVAILABLE };
        }
        if (offer.Status !== 'Pending' || offer.ExpiresAtMs <= this.now()) {
            return { Ok: false, Reason: OFFER_UNAVAILABLE };
        }
        this.finish(offer, status);
        this.notifyPublisher(offer);
        return { Ok: true, Offer: offer };
    }

    /**
     * Moves a pending offer to `Expired` or `Cancelled` (a system decision, not the person's).
     *
     * @returns The offer when it was pending and has now changed; `undefined` when it was already resolved or unknown.
     */
    public async Close(
        offerID: string,
        status: 'Expired' | 'Cancelled',
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<HandoffOfferRecord | undefined> {
        const p = this.getProvider(provider);
        if (p && typeof p.GetEntityObject === 'function') {
            const user = contextUser ?? this.deps.ContextUser;
            try {
                return await RunInEntityTransaction(asTransactionCapable(p), async () => {
                    const entity = await p.GetEntityObject<MJInteractionOfferEntity>('MJ: Interaction Offers', user);
                    const loaded = await entity.Load(offerID);
                    if (!loaded || entity.Status !== 'Pending') {
                        return undefined;
                    }
                    entity.Status = status;
                    entity.RespondedAt = new Date(this.now());
                    const saved = await entity.Save();
                    if (!saved) {
                        return undefined;
                    }
                    const record = this.entityToRecord(entity);
                    this.offers.set(record.OfferID, record);
                    this.notifyPublisher(record);
                    return record;
                });
            } catch (err) {
                LogError(`[HandoffOfferRegistry] Close transaction failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }
        }

        // In-memory fallback
        const offer = this.offers.get(offerID);
        if (!offer || offer.Status !== 'Pending') {
            return undefined;
        }
        this.finish(offer, status);
        this.notifyPublisher(offer);
        return offer;
    }

    /**
     * Sweeps expired pending offers and purges retained resolved offers.
     *
     * @returns How many pending offers were expired by this sweep.
     */
    public async Sweep(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
        return this.sweep(contextUser, provider);
    }

    private async sweep(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
        const now = this.now();
        let swept = 0;
        const p = this.getProvider(provider);
        if (p && typeof p.GetEntityObject === 'function') {
            try {
                const rv = this.getRunView(p);
                const user = contextUser ?? this.deps.ContextUser;
                const result = await rv.RunView<MJInteractionOfferEntity>(
                    {
                        EntityName: 'MJ: Interaction Offers',
                        ExtraFilter: `Status = 'Pending' AND ExpiresAt <= '${new Date(now).toISOString()}'`,
                        ResultType: 'entity_object',
                    },
                    user
                );
                if (result.Success && result.Results) {
                    for (const entity of result.Results) {
                        entity.Status = 'Expired';
                        entity.RespondedAt = new Date(now);
                        const saved = await entity.Save();
                        if (saved) {
                            const record = this.entityToRecord(entity);
                            this.offers.set(record.OfferID, record);
                            this.notifyPublisher(record);
                            swept++;
                        }
                    }
                }
            } catch (e) {
                LogError(`[HandoffOfferRegistry] sweep failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const cutoff = now - HANDOFF_OFFER_RETENTION_MS;
        for (const [id, offer] of this.offers) {
            if (offer.Status === 'Pending' && offer.ExpiresAtMs <= now) {
                this.finish(offer, 'Expired');
                this.notifyPublisher(offer);
                swept++;
            }
            if (offer.ResolvedAtMs !== undefined && offer.ResolvedAtMs < cutoff) {
                this.offers.delete(id);
            }
        }
        return swept;
    }

    private finish(offer: HandoffOfferRecord, status: HandoffOfferStatus): void {
        offer.Status = status;
        offer.ResolvedAtMs = this.now();
    }

    private entityToRecord(entity: MJInteractionOfferEntity, agentNameFallback?: string): HandoffOfferRecord {
        const createdAtMs = entity.OfferedAt
            ? new Date(entity.OfferedAt).getTime()
            : entity.__mj_CreatedAt
            ? new Date(entity.__mj_CreatedAt).getTime()
            : this.now();
        const expiresAtMs = entity.ExpiresAt ? new Date(entity.ExpiresAt).getTime() : createdAtMs + HANDOFF_OFFER_TIMEOUT_MS;
        const resolvedAtMs = entity.RespondedAt ? new Date(entity.RespondedAt).getTime() : undefined;
        const mode = (entity.Mode?.toLowerCase() === 'warm' ? 'warm' : 'blind') as HandoffMode;
        const agentName = entity.OfferedByAgent || agentNameFallback || 'AI Agent';
        return {
            OfferID: entity.ID,
            InteractionID: entity.InteractionID,
            OfferedByAgentID: entity.OfferedByAgentID,
            RoomName: entity.RoomName,
            TargetUserID: entity.TargetUserID,
            Mode: mode,
            Summary: entity.Summary ?? '',
            CallerLabel: entity.CallerLabel ?? '',
            AgentName: agentName,
            Status: entity.Status as HandoffOfferStatus,
            CreatedAtMs: createdAtMs,
            ExpiresAtMs: expiresAtMs,
            ResolvedAtMs: resolvedAtMs,
        };
    }

    private notifyPublisher(record: HandoffOfferRecord): void {
        try {
            this.deps.Publisher?.({
                UserID: record.TargetUserID,
                Kind: 'updated',
                Offer: ToOfferView(record),
            });
        } catch (e) {
            LogError(`[HandoffOfferRegistry] publish failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private getProvider(callProvider?: IMetadataProvider): IMetadataProvider | undefined {
        if (callProvider) {
            return callProvider;
        }
        if (this.deps.Provider) {
            return this.deps.Provider;
        }
        try {
            return Metadata.Provider as IMetadataProvider | undefined;
        } catch {
            return undefined;
        }
    }

    private getRunView(provider: IMetadataProvider): RunView {
        if (typeof (provider as { RunView?: unknown }).RunView === 'function') {
            return RunView.FromMetadataProvider(provider);
        }
        return new RunView();
    }
}
