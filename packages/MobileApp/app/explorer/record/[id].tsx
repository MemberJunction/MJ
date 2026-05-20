import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useRecordDetail } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Read-only record detail.
 * Spec: plans/mobile-app-react-native/html/record-detail.html
 */
export default function RecordDetailScreen() {
    const { id, entity } = useLocalSearchParams<{ id: string; entity: string }>();
    const { data, loading, error } = useRecordDetail(entity, id);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text numberOfLines={1} style={styles.headerTitle}>{data?.title ?? 'Record'}</Text>
                    <Text style={styles.headerSub}>{data?.entity.DisplayName ?? entity} · view only</Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            {loading && !data ? (
                <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /></View>
            ) : error ? (
                <View style={styles.loadingBlock}><Text style={styles.errorText}>{error.message}</Text></View>
            ) : !data ? (
                <View style={styles.loadingBlock}><Text style={styles.errorText}>Record not found.</Text></View>
            ) : (
                <ScrollView contentContainerStyle={styles.body}>
                    <View style={styles.heroCard}>
                        <Text style={styles.heroTitle}>{data.title}</Text>
                        <Text style={styles.heroSub}>{data.entity.DisplayName}</Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>FIELDS</Text>
                        {data.fields.map((f, idx) => (
                            <View key={f.key} style={[styles.kvRow, idx === 0 && styles.kvRowFirst]}>
                                <Text style={styles.kvK}>{f.label}</Text>
                                <Text style={styles.kvV} numberOfLines={3}>{f.value}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}

            {data ? (
                <View style={styles.askBar}>
                    <Pressable style={styles.askBtn} onPress={() => router.push('/new-conversation')}>
                        <View style={styles.askAv}><Text style={styles.askAvText}>S</Text></View>
                        <Text style={styles.askText}>Ask Skip about this {data.entity.DisplayName?.toLowerCase() ?? 'record'}</Text>
                    </Pressable>
                </View>
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, maxWidth: 240 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
    loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    body: { padding: 16, paddingBottom: 100 },
    heroCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, marginBottom: 12, ...Shadow.card },
    heroTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: Colors.ink },
    heroSub: { fontSize: 13, color: Colors.ink3, marginTop: 4 },
    section: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 10, ...Shadow.card },
    sectionTitle: { fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2, marginBottom: 6 },
    kvRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    kvRowFirst: { borderTopWidth: 0 },
    kvK: { color: Colors.ink3, fontSize: 14, flexShrink: 0, maxWidth: '45%' },
    kvV: { color: Colors.ink, fontSize: 14, fontWeight: Type.medium, textAlign: 'right', flex: 1 },
    askBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: Colors.bg },
    askBtn: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadow.cardLarge },
    askAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    askAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    askText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
});
