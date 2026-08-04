/**
 * App-lock state machine (P2.4).
 *
 * Owns the "is the app content currently hidden behind a biometric prompt?"
 * decision. Locks on cold start and whenever the app returns from the
 * *background* (not merely `inactive` — the biometric sheet itself makes the
 * app `inactive`, so gating on `background` avoids an unlock→prompt→unlock
 * loop). Enabling the lock mid-session does NOT lock the running app; it takes
 * effect on the next cold start / background return.
 *
 * Fail-open by design: if the `faceIdLock` preference is on but biometrics are
 * unavailable (e.g. the user removed their enrollment), the gate unlocks rather
 * than trapping the user out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useMMKVBoolean } from 'react-native-mmkv';
import { prefsStorage, PrefKeys } from '@/data/preferences';
import { authenticate, isBiometricAvailable } from '@/auth/biometric';

/**
 * Lock lifecycle:
 * - `unlocked`       — app content is visible.
 * - `locked`         — content hidden; awaiting a user-initiated unlock.
 * - `authenticating` — a biometric prompt is in flight.
 */
export type AppLockState = 'unlocked' | 'locked' | 'authenticating';

/** Copy shown on the system biometric sheet when unlocking the app. */
const UNLOCK_REASON = 'Unlock MJ Mobile';

/** The value returned by {@link useAppLock}. */
export type AppLock = {
    /** Current lock lifecycle state. */
    state: AppLockState;
    /** Re-trigger the biometric prompt (bound to the lock screen's Unlock button). */
    unlock: () => Promise<void>;
};

/**
 * Hook that manages the biometric app-lock lifecycle. Consumed by
 * {@link AppLockGate}, which renders the lock screen while `state !== 'unlocked'`.
 *
 * @returns The current lock {@link AppLockState} and an imperative `unlock()`.
 */
export function useAppLock(): AppLock {
    const [lockEnabled] = useMMKVBoolean(PrefKeys.faceIdLock, prefsStorage);
    const [state, setState] = useState<AppLockState>(() => (lockEnabled ? 'locked' : 'unlocked'));

    const appState = useRef<AppStateStatus>(AppState.currentState);
    const authInFlight = useRef(false);
    const bootedRef = useRef(false);

    const unlock = useCallback(async () => {
        if (authInFlight.current) return;
        authInFlight.current = true;
        setState('authenticating');
        try {
            // Fail open: if biometrics vanished, never trap the user.
            if (!(await isBiometricAvailable())) {
                setState('unlocked');
                return;
            }
            const ok = await authenticate(UNLOCK_REASON);
            setState(ok ? 'unlocked' : 'locked');
        } finally {
            authInFlight.current = false;
        }
    }, []);

    // Cold-start: attempt an unlock exactly once if the lock is enabled.
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;
        if (lockEnabled) void unlock();
    }, [lockEnabled, unlock]);

    // Re-lock on background; re-prompt when returning to the foreground.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            const prev = appState.current;
            appState.current = next;
            if (!lockEnabled) return;
            if (next === 'background') {
                setState('locked');
            } else if (next === 'active' && prev === 'background') {
                void unlock();
            }
        });
        return () => sub.remove();
    }, [lockEnabled, unlock]);

    return { state, unlock };
}
