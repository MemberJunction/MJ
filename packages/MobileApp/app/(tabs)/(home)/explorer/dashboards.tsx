import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { DashboardList } from '@/explorer/ExplorerLists';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * Dashboard picker screen.
 *
 * Route: `/explorer/dashboards`. Screen chrome plus the compose affordance around
 * {@link DashboardList}, which is shared with the hosted Data Explorer surface resolved by the
 * `DashboardBrowserResource` driver class.
 *
 * The list shows `Type = 'Config'` dashboards only — see `LoadDashboards` for why a `Code`
 * dashboard has nothing a native surface could render.
 */
export default function DashboardsScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.title}>Dashboards</Text>
                <Pressable
                    hitSlop={8}
                    style={styles.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel="New dashboard"
                    onPress={() => router.push('/explorer/dashboard/new')}
                >
                    <Icons.Plus size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
            </View>

            <DashboardList />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
});
