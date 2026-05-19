import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useMJ } from '@/providers/mj-provider';
import { Colors } from '@/theme/tokens';

/**
 * Boot gate. Decides where to land based on MJ provider status:
 *
 *   loading   → spinner (intentionally lightweight to keep cold start fast)
 *   no-token  → /login
 *   error     → /login (login screen shows the error too)
 *   ready     → /conversations
 */
export default function Index() {
    const { status } = useMJ();
    if (status === 'loading') {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={Colors.brand} size="large" />
            </View>
        );
    }
    if (status === 'ready') return <Redirect href="/conversations" />;
    return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
});
