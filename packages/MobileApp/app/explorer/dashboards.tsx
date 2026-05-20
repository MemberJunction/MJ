import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useDashboards } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/** Dashboard picker. */
export default function DashboardsScreen() {
    const dashboards = useDashboards();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.title}>Dashboards</Text>
                <View style={styles.iconBtn} />
            </View>

            <View style={styles.notice}>
                <Icons.Sparkle size={14} color={Colors.warn} strokeWidth={2.2} />
                <Text style={styles.noticeText}>Most dashboards are built for desktop and may not render optimally on mobile.</Text>
            </View>

            <ScrollView contentContainerStyle={styles.list}>
                {dashboards === null ? (
                    <Text style={styles.loading}>Loading…</Text>
                ) : dashboards.length === 0 ? (
                    <Text style={styles.loading}>No dashboards shared with you.</Text>
                ) : (
                    dashboards.map((d) => (
                        <Pressable key={d.id} style={styles.row} onPress={() => router.push({ pathname: '/explorer/dashboard/[id]', params: { id: d.id } })}>
                            <View style={styles.rowIcon}>
                                <Icons.Sparkle size={16} color={Colors.warn} strokeWidth={2.2} />
                            </View>
                            <View style={styles.rowBody}>
                                <Text style={styles.rowTitle}>{d.name}</Text>
                                {d.description ? <Text style={styles.rowSub} numberOfLines={1}>{d.description}</Text> : null}
                            </View>
                            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
                        </Pressable>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
    notice: { flexDirection: 'row', gap: 10, alignItems: 'center', margin: 16, marginBottom: 4, padding: 12, backgroundColor: 'rgba(184,122,31,0.10)', borderWidth: 1, borderColor: 'rgba(184,122,31,0.25)', borderRadius: 12 },
    noticeText: { flex: 1, fontSize: 12.5, color: '#8e5c14', lineHeight: 17 },
    list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 32, gap: 6 },
    loading: { textAlign: 'center', color: Colors.ink3, fontSize: 13, paddingVertical: 24 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 12, padding: 12, marginBottom: 6, ...Shadow.card },
    rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.warnSoft, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
    rowSub: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
});
