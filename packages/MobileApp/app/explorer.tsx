import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * Data Explorer hub stub.
 * Wave 5 spec: plans/mobile-app-react-native/html/explorer-home.html.
 */
export default function ExplorerScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.navTop}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} />
                </Pressable>
                <View style={{ flex: 1 }} />
            </View>
            <View style={styles.body}>
                <Text style={styles.h1}>Data Explorer</Text>
                <Text style={styles.copy}>
                    Wave 5: hub tiles for Entities · Queries · Dashboards, recently viewed,
                    drill-in screens. Each surface ends with an "Ask Skip about this" CTA.
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    navTop: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    body: { flex: 1, padding: Spacing.xl, justifyContent: 'flex-start', paddingTop: Spacing.md },
    h1: { fontSize: 30, fontWeight: Type.bold, color: Colors.ink, letterSpacing: -0.6 },
    copy: { fontSize: 14, color: Colors.ink2, lineHeight: 22, marginTop: 10 },
});
