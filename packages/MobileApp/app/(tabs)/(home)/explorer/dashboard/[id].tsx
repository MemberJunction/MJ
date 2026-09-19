import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * Dashboard view screen — a best-effort mobile render of a dashboard's parts.
 *
 * Route: `/explorer/dashboard/:id` (Expo Router, `app/explorer/dashboard/[id].tsx`).
 * The `id` route param is the dashboard's ID.
 * Purpose: full-screen chrome around {@link DashboardView}, which does the rendering. The same
 * component is mounted by the hosted-application shell for a `Dashboards` nav item, which is why
 * the rendering lives in `src/components` and only the header lives here.
 * Interactions: back chevron -> `router.back()`; part-level interactions belong to the view.
 * Mockup: `plans/mobile-app-react-native/html/dashboard-view.html`.
 */
export default function DashboardViewScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <DashboardView
                id={id}
                renderHeader={({ Name, Subtitle }) => (
                    <View style={styles.header}>
                        <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                            <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                        </Pressable>
                        <View style={styles.headerCenter}>
                            <Text style={styles.headerTitle} numberOfLines={1}>{Name}</Text>
                            <Text style={styles.headerSub}>{Subtitle}</Text>
                        </View>
                        <View style={styles.iconBtn} />
                    </View>
                )}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 240 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
});
