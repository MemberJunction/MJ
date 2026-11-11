import { BaseEntity, BaseEntityEvent } from '@memberjunction/core';
import { BaseSingleton, MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import type { IPeerSyncTransport, PeerDoorbellNotification } from './types.js';

/**
 * Configuration for a single peer pairing monitored by `PeerSyncDoorbell`.
 */
export interface PeerDoorbellSubscriptionConfig {
    /** Deterministic pairing ID (`ComputePairingID(instanceA, instanceB)`). */
    PairingID: string;
    /** Local `MJ_DEPLOYMENT_ID` / instance ID. */
    LocalInstanceID: string;
    /** Transport used to send `NotifyChangeBatch` to the remote peer. */
    Transport: IPeerSyncTransport;
    /** Entity names actively synced on this pairing. */
    WatchedEntityNames: string[];
    /** Debounce window in milliseconds before dispatching a doorbell notification (default `1500`). */
    DebounceMs?: number;
    /** Initial backoff in milliseconds when the remote peer is unreachable (default `5000`). */
    InitialBackoffMs?: number;
    /** Maximum backoff in milliseconds when the remote peer is unreachable (default `300000`). */
    MaxBackoffMs?: number;
}

interface PairingDoorbellState {
    config: PeerDoorbellSubscriptionConfig;
    watchedLower: Set<string>;
    pendingEntities: Set<string>;
    timer: ReturnType<typeof setTimeout> | null;
    consecutiveFailures: number;
    backoffUntilMs: number;
    dispatchedCount: number;
    lastErrorMessage: string | null;
}

/**
 * Event-driven real-time doorbell service (`PeerSyncDoorbell`) that listens to
 * local `BaseEntity` `save` and `delete` events via `MJGlobal`, filters out
 * inbound sync writes (`baseEntity.SyncContext != null`), coalesces burst writes
 * within a configurable debounce window, and dispatches lightweight
 * `PeerSync.NotifyChangeBatch` notifications to subscribed peers with
 * exponential backoff fallback.
 */
export class PeerSyncDoorbell extends BaseSingleton<PeerSyncDoorbell> {
    private readonly pairings = new Map<string, PairingDoorbellState>();
    private eventSubscription: { unsubscribe(): void } | null = null;

    public constructor() {
        super();
    }

    public static get Instance(): PeerSyncDoorbell {
        return PeerSyncDoorbell.getInstance<PeerSyncDoorbell>();
    }

    /**
     * Registers or updates a peer pairing for real-time doorbell notifications
     * and starts the `MJGlobal` event listener if not already active.
     */
    public RegisterPairing(config: PeerDoorbellSubscriptionConfig): void {
        const existing = this.pairings.get(config.PairingID);
        if (existing?.timer) {
            clearTimeout(existing.timer);
        }

        this.pairings.set(config.PairingID, {
            config,
            watchedLower: new Set(config.WatchedEntityNames.map(n => n.toLowerCase())),
            pendingEntities: new Set<string>(),
            timer: null,
            consecutiveFailures: 0,
            backoffUntilMs: 0,
            dispatchedCount: 0,
            lastErrorMessage: null,
        });

        this.ensureListening();
    }

    /**
     * Unregisters a peer pairing and cancels any pending debounce timer.
     */
    public UnregisterPairing(pairingID: string): void {
        const state = this.pairings.get(pairingID);
        if (state?.timer) {
            clearTimeout(state.timer);
        }
        this.pairings.delete(pairingID);

        if (this.pairings.size === 0 && this.eventSubscription) {
            this.eventSubscription.unsubscribe();
            this.eventSubscription = null;
        }
    }

    /**
     * Stops all pairing timers and unsubscribes from `MJGlobal`.
     */
    public StopAll(): void {
        for (const state of this.pairings.values()) {
            if (state.timer) {
                clearTimeout(state.timer);
                state.timer = null;
            }
        }
        this.pairings.clear();
        if (this.eventSubscription) {
            this.eventSubscription.unsubscribe();
            this.eventSubscription = null;
        }
    }

    /**
     * Processes a `BaseEntityEvent` directly (called automatically from `MJGlobal`
     * listener and exposed for deterministic unit testing).
     */
    public HandleEntityEvent(event: BaseEntityEvent): void {
        if (event.type !== 'save' && event.type !== 'delete') {
            return;
        }

        // Loop prevention: ignore saves/deletes performed by an inbound Peer Sync
        if (event.baseEntity && event.baseEntity.SyncContext != null) {
            return;
        }

        const entityName =
            event.baseEntity?.EntityInfo?.Name ?? event.entityName ?? '';
        if (!entityName) {
            return;
        }

        const lowerName = entityName.toLowerCase();
        for (const state of this.pairings.values()) {
            if (!state.watchedLower.has(lowerName)) {
                continue;
            }
            state.pendingEntities.add(entityName);
            this.scheduleFlush(state);
        }
    }

    /**
     * Immediately flushes any pending doorbell notification for `pairingID`.
     */
    public async FlushPairing(pairingID: string): Promise<boolean> {
        const state = this.pairings.get(pairingID);
        if (!state) return false;
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        return this.dispatchNow(state);
    }

    /**
     * Returns diagnostic status for a registered pairing.
     */
    public GetPairingStats(pairingID: string): {
        PendingEntityNames: string[];
        ConsecutiveFailures: number;
        BackoffUntilMs: number;
        DispatchedCount: number;
        LastErrorMessage: string | null;
    } | null {
        const state = this.pairings.get(pairingID);
        if (!state) return null;
        return {
            PendingEntityNames: Array.from(state.pendingEntities),
            ConsecutiveFailures: state.consecutiveFailures,
            BackoffUntilMs: state.backoffUntilMs,
            DispatchedCount: state.dispatchedCount,
            LastErrorMessage: state.lastErrorMessage,
        };
    }

    private ensureListening(): void {
        if (this.eventSubscription) return;

        const listener = MJGlobal.Instance.GetEventListener(false);
        this.eventSubscription = listener.subscribe((mjEvent: MJEvent) => {
            if (
                mjEvent.event === MJEventType.ComponentEvent &&
                mjEvent.eventCode === BaseEntity.BaseEventCode &&
                mjEvent.args instanceof BaseEntityEvent
            ) {
                this.HandleEntityEvent(mjEvent.args);
            }
        });
    }

    private scheduleFlush(state: PairingDoorbellState): void {
        if (state.timer) {
            return;
        }
        const now = Date.now();
        const debounceMs = state.config.DebounceMs ?? 1500;
        const backoffRemaining = Math.max(0, state.backoffUntilMs - now);
        const delayMs = Math.max(debounceMs, backoffRemaining);

        state.timer = setTimeout(() => {
            state.timer = null;
            void this.dispatchNow(state);
        }, delayMs);
    }

    private async dispatchNow(state: PairingDoorbellState): Promise<boolean> {
        if (state.pendingEntities.size === 0) {
            return false;
        }

        const changedNames = Array.from(state.pendingEntities);
        state.pendingEntities.clear();

        const notification: PeerDoorbellNotification = {
            PairingID: state.config.PairingID,
            SenderInstanceID: state.config.LocalInstanceID,
            ChangedEntityNames: changedNames,
            EmittedAt: new Date().toISOString(),
        };

        try {
            await state.config.Transport.NotifyChangeBatch(notification);
            state.consecutiveFailures = 0;
            state.backoffUntilMs = 0;
            state.lastErrorMessage = null;
            state.dispatchedCount++;
            return true;
        } catch (err) {
            // Re-queue entity names so the next flush or scheduled sync still sees them
            for (const name of changedNames) {
                state.pendingEntities.add(name);
            }
            state.consecutiveFailures++;
            state.lastErrorMessage = err instanceof Error ? err.message : String(err);

            const initialBackoff = state.config.InitialBackoffMs ?? 5000;
            const maxBackoff = state.config.MaxBackoffMs ?? 300000;
            const backoffMs = Math.min(
                maxBackoff,
                initialBackoff * Math.pow(2, state.consecutiveFailures - 1)
            );
            state.backoffUntilMs = Date.now() + backoffMs;
            return false;
        }
    }
}
