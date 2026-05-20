import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useQueryRun } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Query results — runs a saved query and renders rows as cards.
 * Spec: plans/mobile-app-react-native/html/query-run.html
 */
export default function QueryRunScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { result, loading, run } = useQueryRun(id);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text numberOfLines={1} style={styles.headerTitle}>Query results</Text>
                    <Text style={styles.headerSub}>{result ? `${result.rowCount} rows` : 'Running…'}</Text>
                </View>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => void run()}>
                    <Icons.Sliders size={20} color={Colors.ink} />
                </Pressable>
            </View>

            {loading && !result ? (
                <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /><Text style={styles.loadingText}>Running query…</Text></View>
            ) : result && !result.success ? (
                <View style={styles.loadingBlock}>
                    <Text style={styles.errorText}>{result.errorMessage}</Text>
                    <Pressable onPress={() => void run()}><Text style={styles.retry}>Try again</Text></Pressable>
                </View>
            ) : result && result.rows.length === 0 ? (
                <View style={styles.loadingBlock}><Text style={styles.empty}>No rows returned.</Text></View>
            ) : result ? (
                <ScrollView contentContainerStyle={styles.list}>
                    {result.rows.map((row, idx) => (
                        <View key={idx} style={styles.card}>
                            {result.columns.slice(0, 6).map((col) => (
                                <View key={col} style={styles.cell}>
                                    <Text style={styles.cellKey}>{col}</Text>
                                    <Text style={styles.cellVal} numberOfLines={2}>
                                        {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </ScrollView>
            ) : null}

            {result?.success ? (
                <View style={styles.askBar}>
                    <Pressable style={styles.askBtn} onPress={() => router.push('/new-conversation')}>
                        <View style={styles.askAv}><Text style={styles.askAvText}>S</Text></View>
                        <Text style={styles.askText}>Ask Skip about these results</Text>
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
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
    loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    loadingText: { fontSize: 13, color: Colors.ink3 },
    errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    retry: { fontSize: 14, color: Colors.brand, fontWeight: Type.semibold, marginTop: 8 },
    empty: { fontSize: 13, color: Colors.ink3 },
    list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 100 },
    card: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 6, ...Shadow.card },
    cell: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
    cellKey: { fontSize: 12, color: Colors.ink3, flexShrink: 0, maxWidth: '45%' },
    cellVal: { fontSize: 13, color: Colors.ink, fontWeight: Type.medium, textAlign: 'right', flex: 1 },
    askBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: Colors.bg },
    askBtn: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadow.cardLarge },
    askAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    askAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    askText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
});
