/**
 * Biometric app-lock gate (P2.4).
 *
 * Wraps the app's navigation stack. While the lock is engaged it renders a
 * minimal, full-screen {@link LockScreen} over the content — so nothing behind
 * it (or its snapshot in the app switcher) is visible until the user passes a
 * biometric prompt. Unlocking is driven by {@link useAppLock}.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { useAppLock } from '@/auth/useAppLock';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Render `children` when unlocked; otherwise render the lock screen.
 *
 * @param props.children The app content to protect (the router stack).
 */
export function AppLockGate({ children }: { children: ReactNode }) {
    const { state, unlock } = useAppLock();
    if (state === 'unlocked') return <>{children}</>;
    return <LockScreen authenticating={state === 'authenticating'} onUnlock={() => void unlock()} />;
}

/**
 * Minimal lock screen: brand mark, a short prompt, and an Unlock button that
 * re-triggers the biometric prompt. Shows a spinner while a prompt is in flight.
 *
 * @param props.authenticating Whether a biometric prompt is currently showing.
 * @param props.onUnlock Invoked when the user taps Unlock.
 */
function LockScreen({ authenticating, onUnlock }: { authenticating: boolean; onUnlock: () => void }) {
    return (
        <View style={styles.root}>
            <View style={styles.badge}>
                <Icons.Pin size={30} color={Colors.brand} />
            </View>
            <Text style={styles.title}>MJ Mobile is locked</Text>
            <Text style={styles.sub}>Authenticate to continue</Text>

            <Pressable style={styles.unlockBtn} onPress={onUnlock} disabled={authenticating}>
                {authenticating ? (
                    <ActivityIndicator color={Colors.inverse} />
                ) : (
                    <Text style={styles.unlockText}>Unlock</Text>
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    badge: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: Colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: { fontSize: Type.title, fontWeight: Type.bold, color: Colors.ink, letterSpacing: -0.3 },
    sub: { fontSize: Type.body, color: Colors.ink3, marginTop: 6 },
    unlockBtn: {
        marginTop: 28,
        minWidth: 180,
        height: 50,
        borderRadius: Radius.pill,
        backgroundColor: Colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.card,
    },
    unlockText: { fontSize: Type.bodyLarge, fontWeight: Type.semibold, color: Colors.inverse },
});
