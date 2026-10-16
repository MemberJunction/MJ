import { Redirect } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMJ } from '@/providers/mj-provider';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * Boot gate — what renders until the MJ connection is usable.
 *
 * Purpose: hold the screen while the provider boots, show an inline error with an escape hatch if
 * it fails, and send an unauthenticated user to `/login`. When `status` is `ready` it renders its
 * children — the navigation shell — and gets out of the way.
 *
 * ## Why this is a WRAPPER and no longer a route
 *
 * It used to be `app/index.tsx`: a screen at `/` that redirected to the tab shell once the provider
 * was ready. That redirect raced the user. On a cold launch the app mounted `/`,
 * redirected to the tab shell, and for a moment afterwards the FIRST tab press did nothing at all —
 * the navigation state was still settling and the press was swallowed. Tapping a second time
 * worked, which is exactly the kind of defect that survives testing because the tester taps twice
 * without noticing.
 *
 * Wrapping the shell instead means the ready path performs no navigation: Home IS the initial
 * route, so there is nothing to race. `/login` is still a redirect, but a user who is not signed in
 * has no tab bar to press.

 *
 * Data: `useMJ()` — reads `status`/`error`, calls `signOut()` to clear tokens.
 * Interactions: "Clear tokens & sign in again" / "Sign in again" (both call `signOut`).
 */
export function BootGate({ children }: { children: ReactNode }) {
    const { status, error, signOut } = useMJ();
    const [showEscape, setShowEscape] = useState(false);

    useEffect(() => {
        if (status === 'loading') {
            const t = setTimeout(() => setShowEscape(true), 6000);
            return () => clearTimeout(t);
        }
        setShowEscape(false);
    }, [status]);

    if (status === 'loading') {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={Colors.brand} size="large" />
                <Text style={styles.label}>Connecting…</Text>
                {showEscape ? (
                    <View style={styles.escape}>
                        <Text style={styles.escapeCopy}>
                            Taking longer than expected. The stored token may be invalid or MJAPI may
                            be unreachable.
                        </Text>
                        <Pressable
                            onPress={async () => { await signOut(); }}
                            style={styles.escapeBtn}
                        >
                            <Text style={styles.escapeBtnText}>Clear tokens & sign in again</Text>
                        </Pressable>
                    </View>
                ) : null}
            </View>
        );
    }
    if (status === 'error') {
        // Show what went wrong before the user is sent back to sign in.
        return (
            <View style={styles.center}>
                <Text style={styles.errorTitle}>Couldn't connect</Text>
                <Text style={styles.errorBody}>{error?.message ?? 'Unknown error'}</Text>
                <Pressable onPress={async () => { await signOut(); }} style={styles.escapeBtn}>
                    <Text style={styles.escapeBtnText}>Sign in again</Text>
                </Pressable>
            </View>
        );
    }
    if (status === 'ready') return <>{children}</>;
    return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: 32, gap: 12 },
    label: { fontSize: 13.5, color: Colors.ink3, marginTop: 8 },
    errorTitle: { fontSize: 18, fontWeight: Type.semibold, color: Colors.ink },
    errorBody: { fontSize: 13, color: Colors.danger, textAlign: 'center', lineHeight: 18 },
    escape: { marginTop: 24, gap: 12, alignItems: 'center' },
    escapeCopy: { fontSize: 13, color: Colors.ink3, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
    escapeBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: Radius.lg, backgroundColor: Colors.ink },
    escapeBtnText: { color: Colors.inverse, fontSize: 14, fontWeight: Type.semibold },
});
