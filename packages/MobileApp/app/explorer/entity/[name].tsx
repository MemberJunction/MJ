import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { MOCK_OPPORTUNITIES, type OppRecord } from '@/data/mock-explorer';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Records inside an entity. Card list, never grid.
 * Spec: plans/mobile-app-react-native/html/entity-records.html
 */
export default function EntityRecordsScreen() {
    const { name } = useLocalSearchParams<{ name: string }>();
    const entityName = name ?? 'Opportunities';

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Header title={entityName} sub="247 records · 3 views" />

            <View style={styles.searchRow}>
                <Icons.Search size={16} color={Colors.ink3} />
                <Text style={styles.searchPh}>Search {entityName.toLowerCase()}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
                <Chip active label="All open" />
                <Chip label="Closing this month" />
                <Chip label="My team" />
                <Chip label=">$50K" />
                <Chip label="At risk" />
            </ScrollView>

            <View style={styles.summary}>
                <Text style={styles.summaryCount}>87 of 247 · all open</Text>
                <Text style={styles.summarySort}>Amount ↓</Text>
            </View>

            <ScrollView contentContainerStyle={styles.list}>
                {MOCK_OPPORTUNITIES.map((o) => (
                    <RecordCard key={o.id} opp={o} />
                ))}
            </ScrollView>

            <Pressable
                style={styles.fab}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'c-acme-pipeline-review' } })}
            >
                <View style={styles.fabAv}>
                    <Text style={styles.fabAvText}>S</Text>
                </View>
                <Text style={styles.fabText}>Ask Skip about these</Text>
            </Pressable>
        </SafeAreaView>
    );
}

function Header({ title, sub }: { title: string; sub: string }) {
    return (
        <View style={styles.header}>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>{title}</Text>
                <Text style={styles.headerSub}>{sub}</Text>
            </View>
            <Pressable hitSlop={8} style={styles.iconBtn}>
                <Icons.Sliders size={20} color={Colors.ink} />
            </Pressable>
        </View>
    );
}

function Chip({ label, active }: { label: string; active?: boolean }) {
    return (
        <View style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </View>
    );
}

function stageColors(stage: OppRecord['stage']) {
    switch (stage) {
        case 'Negotiation': return { bg: Colors.warnSoft, fg: Colors.warn };
        case 'Proposal': return { bg: Colors.brandSoft, fg: Colors.brand };
        case 'Discovery': return { bg: Colors.positiveSoft, fg: Colors.positive };
    }
}

function RecordCard({ opp }: { opp: OppRecord }) {
    const c = stageColors(opp.stage);
    return (
        <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/explorer/record/[id]', params: { id: opp.id } })}
        >
            <View style={styles.cardTop}>
                <Text style={styles.cardName}>{opp.name}</Text>
                <Text style={styles.cardAmount}>{opp.amount}</Text>
            </View>
            <View style={styles.cardMeta}>
                <Text style={styles.cardAccount}>{opp.account}</Text>
                <View style={[styles.stagePill, { backgroundColor: c.bg }]}>
                    <Text style={[styles.stagePillText, { color: c.fg }]}>{opp.stage.toUpperCase()}</Text>
                </View>
                <Text style={styles.cardClose}>{opp.closeDate}</Text>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },

    searchRow: { margin: 16, marginBottom: 8, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
    searchPh: { color: Colors.ink3, fontSize: 14 },

    filterRow: { maxHeight: 48 },
    filterRowContent: { paddingHorizontal: 14, paddingVertical: 4, gap: 6, flexDirection: 'row' },
    chip: { paddingHorizontal: 11, paddingVertical: 6, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 9 },
    chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    chipText: { fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    chipTextActive: { color: Colors.inverse },

    summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 12 },
    summaryCount: { fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    summarySort: { fontSize: 12.5, color: Colors.brand, fontWeight: Type.semibold },

    list: { paddingHorizontal: 12, paddingBottom: 100 },
    card: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 6, ...Shadow.card },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardName: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, flex: 1 },
    cardAmount: { fontSize: 14.5, fontWeight: '700', color: Colors.ink },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    cardAccount: { fontSize: 11.5, color: Colors.ink2, fontWeight: Type.medium },
    stagePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    stagePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
    cardClose: { fontSize: 11.5, color: Colors.ink3 },

    fab: { position: 'absolute', bottom: 28, right: 20, backgroundColor: Colors.ink, paddingLeft: 14, paddingRight: 16, paddingVertical: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8, ...Shadow.fab },
    fabAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    fabAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    fabText: { color: Colors.inverse, fontSize: 13.5, fontWeight: Type.semibold },
});
