import '@/polyfills';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MJProviderRoot } from '@/providers/mj-provider';
import { AppLockGate } from '@/auth/AppLockGate';
import { PushNotificationsBoot } from '@/hooks/usePushRegistration';
import { Colors } from '@/theme/tokens';

/**
 * Root layout — the app's navigation shell (Expo Router).
 *
 * Route: matches `app/_layout.tsx` — wraps EVERY route in the app; it is not a
 *   screen itself but the provider/gesture/stack shell all screens render inside.
 * Purpose: establish the global context tree (gestures, safe-area insets, the MJ
 *   data/auth provider) and configure the shared native stack navigator.
 * Data: no data of its own; mounts {@link MJProviderRoot}, which owns the MJ
 *   connection/auth lifecycle (`status`, `signOut`, token boot) consumed by every
 *   screen via `useMJ()`. Also imports `@/polyfills` for its side effects
 *   (RN globals MJ core libraries expect) — this import MUST stay first.
 * Interactions: none directly; sets header-less, right-sliding screen defaults.
 *   Also mounts two device-feature helpers inside the provider: {@link AppLockGate}
 *   (P2.4 — biometric lock over the stack) and {@link PushNotificationsBoot}
 *   (P2.3 — one-time push registration once the provider is ready).
 * Mockup: none — navigation shell / app chrome.
 */
export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
            <SafeAreaProvider>
                <MJProviderRoot>
                    <StatusBar style="dark" />
                    <PushNotificationsBoot />
                    <AppLockGate>
                        <Stack
                            screenOptions={{
                                headerShown: false,
                                contentStyle: { backgroundColor: Colors.bg },
                                animation: 'slide_from_right',
                            }}
                        />
                    </AppLockGate>
                </MJProviderRoot>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
