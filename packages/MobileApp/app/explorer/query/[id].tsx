import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { MOCK_QUERY_RESULTS } from '@/data/mock-explorer';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Query results — Phase 1 ships read-only result rendering.
 * Spec: plans/mobile-app-react-native/html/query-run.html
 */
export default function QueryRunScreen() {
    const { id: _id } = useLocalSearchParams<{ id: string }>();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text numberOfLines={1} style={styles.headerTitle}>High-value at-risk renewals</Text>
                    <View style={styles.subRow}>
                        <View style={styles.runDot} />
                        <Text style={styles.headerSub}>ran 9:43 · 1.4s</Text>
                    </View>
                </View>
                <View style={styles.iconBtn} />
            </View>

            <View style={styles.paramsCard}>
                <Text style={styles.paramsLabel}>PARAMETERS</Text>
                <View style={styles.paramsRow}>
                    <ParamChip k="Min ARR" v="$50K" />
                    <ParamChip k="Health" v="≤ 70" />
                    <ParamChip k="Renewing" v="Next 90d" />
                </View>
                <View style={styles.paramActions}>
                    <ApBtn label="Edit params" />
                    <ApBtn label="Re-run" primary />
                </View>
            </View>

            <View style={styles.resultsBar}>
                <Text style={styles.resultsCount}>
                    <Text style={styles.resultsCountBold}>8</Text> accounts at risk · total ARR <Text style={styles.resultsCountBold}>$1.24M</Text>
                </Text>
                <Text style={styles.resultsSort}>Risk ↓</Text>
            </View>

            <ScrollView contentContainerStyle={styles.list}>
                {MOCK_QUERY_RESULTS.map((row) => (
                    <ResultCard key={row.id} row={row} />
                ))}
            </ScrollView>

            <View style={styles.askBar}>
                <Pressable
                    style={styles.askBtn}
                    onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'c-acme-pipeline-review' } })}
                >
                    <View style={styles.askAv}>
                        <Text style={styles.askAvText}>S</Text>
                    </View>
                    <Text style={styles.askText}>Ask Skip about these accounts</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

function ParamChip({ k, v }: { k: string; v: string }) {
    return (
        <View style={styles.pchip}>
            <Text style={styles.pchipK}>{k}</Text>
            <Text style={styles.pchipV}>{v}</Text>
        </View>
    );
}
function ApBtn({ label, primary }: { label: string; primary?: boolean }) {
    return (
        <View style={[styles.apBtn, primary && styles.apBtnPrimary]}>
            <Text style={[styles.apBtnText, primary && styles.apBtnTextPrimary]}>{label}</Text>
        </View>
    );
}

function ResultCard({ row }: { row: { id: string; name: string; arr: string; renewsOn: string; health: number; risk: 'high' | 'medium'; riskPct: number } }) {
    return (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <Text style={styles.cardName}>{row.name}</Text>
                <View style={[styles.riskPill, row.risk === 'high' ? styles.riskHigh : styles.riskMed]}>
                    <Text style={[styles.riskText, row.risk === 'high' ? styles.riskTextHigh : styles.riskTextMed]}>
                        {row.risk.toUpperCase()}
                    </Text>
                </View>
            </View>
            <View style={styles.cardMeta}>
                <Text style={styles.cardArr}>{row.arr}</Text>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.cardMetaText}>Renews {row.renewsOn}</Text>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.cardMetaText}>Health {row.health}</Text>
            </View>
            <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${row.riskPct}%` }]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 15, fontWeight: Type.semibold, color: Colors.ink, maxWidth: 240 },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    runDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.positive },
    headerSub: { fontSize: 11, color: Colors.ink3 },

    paramsCard: { margin: 16, marginBottom: 8, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, ...Shadow.card },
    paramsLabel: { fontSize: 10.5, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2 },
    paramsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    pchip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 8 },
    pchipK: { fontSize: 12, color: Colors.ink3, fontWeight: Type.medium },
    pchipV: { fontSize: 12, color: Colors.ink, fontWeight: Type.semibold },
    paramActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
    apBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    apBtnPrimary: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    apBtnText: { fontSize: 12.5, fontWeight: Type.semibold, color: Colors.ink2 },
    apBtnTextPrimary: { color: Colors.inverse },

    resultsBar: { paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resultsCount: { fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    resultsCountBold: { color: Colors.ink, fontWeight: Type.semibold },
    resultsSort: { fontSize: 12.5, color: Colors.brand, fontWeight: Type.semibold },

    list: { paddingHorizontal: 12, paddingBottom: 100 },
    card: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 6, ...Shadow.card },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardName: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, flex: 1 },
    riskPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    riskHigh: { backgroundColor: Colors.dangerSoft },
    riskMed: { backgroundColor: Colors.warnSoft },
    riskText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
    riskTextHigh: { color: Colors.danger },
    riskTextMed: { color: Colors.warn },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
    cardArr: { fontSize: 12, color: Colors.ink, fontWeight: Type.semibold },
    cardMetaText: { fontSize: 11.5, color: Colors.ink3 },
    dot: { color: Colors.ink3, fontSize: 11.5 },
    bar: { marginTop: 9, height: 3, borderRadius: 2, backgroundColor: 'rgba(13,13,16,0.06)', overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: Colors.danger },

    askBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: Colors.bg },
    askBtn: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadow.cardLarge },
    askAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    askAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    askText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
});
