/**
 * Boot-time push-notification registration (P2.3 wiring).
 *
 * Installs the foreground notification handler on mount, then — once the MJ
 * provider is `ready` AND the user has the `pushNotifications` preference on —
 * requests permission and registers this device's token exactly once per
 * enable. Turning the preference off re-arms it so a later re-enable registers
 * again. All work is delegated to the simulator-safe notifications service, so
 * this hook never throws.
 */
import { useEffect, useRef } from 'react';
import { useMMKVBoolean } from 'react-native-mmkv';
import { prefsStorage, PrefKeys } from '@/data/preferences';
import { useMJ } from '@/providers/mj-provider';
import { configureNotificationHandler, registerForPushNotifications } from '@/data/services/notifications';

/**
 * Effect-only hook that performs one-time push registration when the provider
 * is ready and the preference is enabled. Rendered via {@link PushNotificationsBoot}.
 */
export function usePushRegistration(): void {
    const { status } = useMJ();
    const [pushOn] = useMMKVBoolean(PrefKeys.pushNotifications, prefsStorage);
    const registeredRef = useRef(false);

    // Foreground handler should be active regardless of registration state.
    useEffect(() => {
        configureNotificationHandler();
    }, []);

    // Re-arm registration whenever the preference is turned off.
    useEffect(() => {
        if (!pushOn) registeredRef.current = false;
    }, [pushOn]);

    useEffect(() => {
        if (status !== 'ready' || !pushOn || registeredRef.current) return;
        registeredRef.current = true;
        void (async () => {
            const result = await registerForPushNotifications();
            console.log('[push] boot registration:', result);
        })();
    }, [status, pushOn]);
}

/**
 * Zero-render component that runs {@link usePushRegistration}. Mount it inside
 * the MJ provider (so `useMJ()` is available) alongside the router stack.
 */
export function PushNotificationsBoot(): null {
    usePushRegistration();
    return null;
}
