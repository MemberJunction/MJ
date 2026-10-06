import '@/polyfills';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MJProviderRoot } from '@/providers/mj-provider';
import { AppLockGate } from '@/auth/AppLockGate';
import { BootGate } from '@/boot/BootGate';
import { PushNotificationsBoot } from '@/hooks/usePushRegistration';
import { LoadHostedMobileResources } from '@/host/registry';
import { LoadMobileArtifactRenderers } from '@/artifacts/renderers';

// Hosted application surfaces register via `@RegisterClass` module side effects, which a bundler
// will eliminate unless something references them. This call is that reference — see
// `src/host/registry.ts` for why a native host needs a build-time manifest at all.
LoadHostedMobileResources();
// Artifact renderers register the same way and for the same reason — see the file's header.
LoadMobileArtifactRenderers();

// Two warnings fire on every launch, neither actionable from this package: require cycles inside
// the published `@memberjunction/core` and `BaseAIEngine` bundles, and a debugger-connect notice.
// They are suppressed as NOTIFICATIONS only — they still print to the Metro console, where a
// developer actually reads them — because the LogBox toast renders at the bottom of the screen,
// directly over the tab bar, and swallows taps on it. A permanent overlay across the app's primary
// navigation is a worse cost than a warning a developer has already seen a hundred times.
// Deliberately NOT `ignoreAllLogs`: every other warning still surfaces.
LogBox.ignoreLogs([/^Require cycle:/, /^Failed to open debugger/]);
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
                        {/*
                          * BootGate wraps the shell rather than sitting in it as a route. As a
                          * route it redirected to the tab shell once the provider was ready, and
                          * that redirect raced the user: on a cold launch the FIRST tab press was
                          * swallowed while navigation settled, and only a second press worked.
                          * Wrapping means the ready path navigates nowhere — Home is simply the
                          * initial route.
                          */}
                        <BootGate>
                            <Stack
                                screenOptions={{
                                    headerShown: false,
                                    contentStyle: { backgroundColor: Colors.bg },
                                    animation: 'slide_from_right',
                                }}
                            />
                        </BootGate>
                    </AppLockGate>
                </MJProviderRoot>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
