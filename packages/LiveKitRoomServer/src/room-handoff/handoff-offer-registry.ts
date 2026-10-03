/**
 * @fileoverview The in-memory registry of handoff offers.
 *
 * An offer is a short-lived question put to one person: "a caller is waiting, will you take the conversation?".
 * It lives here from the moment the AI asks until it is accepted, declined, expired or cancelled, and is kept for a
 * short while afterwards so a console that was open when it resolved can still show what happened.
 *
 * **This registry is per process.** With more than one MJAPI instance an offer made on instance A is invisible to a
 * console connected to instance B, and an accept that lands on B cannot find it. A multi-instance deployment needs a
 * database-backed registry behind the same interface; that needs a table, which this build deliberately does not add
 * (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF-PR3.md`).
 *
 * An accept or decline is authorised by comparing the offer's target user with the caller, and a mismatch answers
 * exactly as a missing offer does: someone who does not own an offer cannot learn that it exists.
 *
 * @module @memberjunction/livekit-room-server
 */

import { randomUUID } from 'node:crypto';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
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
}

/** What it takes to create an offer. */
export interface CreateOfferInput {
    RoomName: string;
    TargetUserID: string;
    Mode: HandoffMode;
    Summary: string;
    CallerLabel: string;
    AgentName: string;
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

/** Holds handoff offers by id. */
export class HandoffOfferRegistry extends BaseSingleton<HandoffOfferRegistry> {
    private readonly offers = new Map<string, HandoffOfferRecord>();
    private now: () => number = Date.now;

    protected constructor() {
        super();
    }

    /** The process-wide registry. */
    public static get Instance(): HandoffOfferRegistry {
        return super.getInstance<HandoffOfferRegistry>();
    }

    /** Replaces the clock (tests). */
    public SetClock(now: () => number): void {
        this.now = now;
    }

    /** Forgets every offer (tests, shutdown). */
    public Clear(): void {
        this.offers.clear();
    }

    /**
     * Creates a pending offer. Refuses when the person already has {@link MAX_PENDING_OFFERS_PER_USER} pending.
     *
     * @returns The new offer, or `undefined` when the person's pending-offer cap is reached.
     */
    public Create(input: CreateOfferInput, timeoutMs: number = HANDOFF_OFFER_TIMEOUT_MS): HandoffOfferRecord | undefined {
        this.sweep();
        if (this.PendingForUser(input.TargetUserID).length >= MAX_PENDING_OFFERS_PER_USER) {
            return undefined;
        }
        const createdAt = this.now();
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
            ExpiresAtMs: createdAt + timeoutMs,
        };
        this.offers.set(offer.OfferID, offer);
        return offer;
    }

    /** The offer with this id, or `undefined`. */
    public Get(offerID: string): HandoffOfferRecord | undefined {
        return this.offers.get(offerID);
    }

    /** The person's offers that can still be accepted, soonest to expire first. */
    public PendingForUser(userID: string): HandoffOfferRecord[] {
        const now = this.now();
        return [...this.offers.values()]
            .filter((o) => o.Status === 'Pending' && o.ExpiresAtMs > now && UUIDsEqual(o.TargetUserID, userID))
            .sort((a, b) => a.ExpiresAtMs - b.ExpiresAtMs);
    }

    /** The person's offers to show: pending ones, plus ones resolved recently enough to still be retained. */
    public ListForUser(userID: string): HandoffOfferRecord[] {
        this.sweep();
        return [...this.offers.values()]
            .filter((o) => UUIDsEqual(o.TargetUserID, userID))
            .sort((a, b) => b.CreatedAtMs - a.CreatedAtMs);
    }

    /** The offers made from one room, any status. */
    public ForRoom(roomName: string): HandoffOfferRecord[] {
        const key = roomName.trim().toLowerCase();
        return [...this.offers.values()].filter((o) => o.RoomName.trim().toLowerCase() === key);
    }

    /**
     * Moves a pending offer to a terminal status on behalf of the person it was made to. The caller must be the
     * offer's target and the offer must still be pending and unexpired; anything else answers the same way.
     */
    public ResolveForUser(offerID: string, userID: string, status: 'Accepted' | 'Declined'): ResolveOfferResult {
        const offer = this.offers.get(offerID);
        if (!offer || !UUIDsEqual(offer.TargetUserID, userID)) {
            return { Ok: false, Reason: OFFER_UNAVAILABLE };
        }
        if (offer.Status !== 'Pending' || offer.ExpiresAtMs <= this.now()) {
            return { Ok: false, Reason: OFFER_UNAVAILABLE };
        }
        this.finish(offer, status);
        return { Ok: true, Offer: offer };
    }

    /**
     * Moves a pending offer to `Expired` or `Cancelled` (a system decision, not the person's).
     *
     * @returns The offer when it was pending and has now changed; `undefined` when it was already resolved or unknown.
     */
    public Close(offerID: string, status: 'Expired' | 'Cancelled'): HandoffOfferRecord | undefined {
        const offer = this.offers.get(offerID);
        if (!offer || offer.Status !== 'Pending') {
            return undefined;
        }
        this.finish(offer, status);
        return offer;
    }

    private finish(offer: HandoffOfferRecord, status: HandoffOfferStatus): void {
        offer.Status = status;
        offer.ResolvedAtMs = this.now();
    }

    /** Drops offers that resolved longer ago than the retention window. */
    private sweep(): void {
        const cutoff = this.now() - HANDOFF_OFFER_RETENTION_MS;
        for (const [id, offer] of this.offers) {
            if (offer.ResolvedAtMs !== undefined && offer.ResolvedAtMs < cutoff) {
                this.offers.delete(id);
            }
        }
    }
}
