import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMJ } from '@/providers/mj-provider';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * Boot gate. Decides where to land based on MJ provider status.
 * If 'loading' lingers past 6 seconds we show a diagnostic with a
 * "force sign out" escape hatch so a hung token can't lock the app.
 */
export default function Index() {
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
        // Briefly show the error inline before redirecting to login, so the
        // user can see what went wrong.
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
    if (status === 'ready') return <Redirect href="/conversations" />;
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
