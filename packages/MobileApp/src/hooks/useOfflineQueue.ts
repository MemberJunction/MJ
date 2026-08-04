/**
 * React hook exposing the offline mutation queue to UI (P3.2).
 *
 * Surfaces the live pending `count`, a `syncing` flag, and an imperative
 * `syncNow()` that drains the queue back to MJAPI. The count stays current via the
 * queue's change-subscription, so any enqueue/remove/clear anywhere in the app
 * re-renders subscribers.
 *
 * Auto-reconnect signal (honest limitation): with no NetInfo/expo-network native
 * module available, this hook cannot detect the instant connectivity returns.
 * Instead it replays opportunistically when the app comes to the foreground
 * (`AppState` → `'active'`) — the moment a user is most likely to be back online —
 * and offers the manual `syncNow()` affordance. It is foreground + manual, not
 * instant reconnect.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { count as queueCount, subscribe } from '@/data/offline-queue';
import { syncNow as runSync, type ReplayResult } from '@/data/offline-sync';

/** The value returned by {@link useOfflineQueue}. */
export type OfflineQueueState = {
    /** Number of mutations currently waiting to sync. */
    count: number;
    /** True while a replay pass is in flight. */
    syncing: boolean;
    /** Manually drain the queue; resolves with what synced/failed. */
    syncNow: () => Promise<ReplayResult>;
};

/**
 * Track the pending offline-queue count and drive replay on foreground / manual sync.
 * @returns `{ count, syncing, syncNow }` for a badge or settings row to consume.
 */
export function useOfflineQueue(): OfflineQueueState {
    const [count, setCount] = useState<number>(() => queueCount());
    const [syncing, setSyncing] = useState(false);

    // Keep `count` in lockstep with the persisted queue via its change-subscription.
    useEffect(() => {
        setCount(queueCount());
        return subscribe(setCount);
    }, []);

    const syncNow = useCallback(async (): Promise<ReplayResult> => {
        setSyncing(true);
        try {
            return await runSync();
        } finally {
            setSyncing(false);
            setCount(queueCount());
        }
    }, []);

    // Opportunistic replay when the app returns to the foreground (best available
    // reconnect signal without a network-state native module). Skip when empty.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (next === 'active' && queueCount() > 0) void syncNow();
        });
        return () => sub.remove();
    }, [syncNow]);

    return { count, syncing, syncNow };
}
