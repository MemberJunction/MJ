import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { MOCK_CONVERSATIONS } from '@/data/mock-thread';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Single-artifact detail.
 * Spec: plans/mobile-app-react-native/html/artifact-detail.html
 */
export default function ArtifactDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    // Look up the artifact across all mock conversations (Phase 1)
    const artifact = Object.values(MOCK_CONVERSATIONS)
        .flatMap(c => c.artifacts)
        .find(a => a.id === id);

    if (!artifact) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Header title="Artifact" subtitle="not found" />
                <View style={styles.center}>
                    <Text style={styles.notFound}>Artifact "{id}" not in this conversation.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Header
                title={artifact.title}
                subtitle={`${artifact.producedBy.name} · 3 records · v2`}
                avColor={artifact.producedBy.color}
                avInitial={artifact.producedBy.initial}
            />

            <View style={styles.tabRow}>
                <View style={[styles.tab, styles.tabActive]}><Text style={styles.tabTextActive}>Data</Text></View>
                <View style={styles.tab}><Text style={styles.tabText}>Chart</Text></View>
                <View style={styles.tab}><Text style={styles.tabText}>JSON</Text></View>
                <View style={{ flex: 1 }} />
                <View style={styles.versionPill}>
                    <Text style={styles.versionText}>v2 of 2</Text>
                    <Icons.ChevronDown size={11} color={Colors.ink3} strokeWidth={2.5} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.statRow}>
                    <Stat label="Total open" value="$285K" delta="+12% qtr" />
                    <Stat label="Weighted" value="$148K" delta="52% avg" />
                    <Stat label="Records" value="3" delta="all open" />
                </View>
                <Text style={styles.section}>Opportunities · sorted by value</Text>

                {artifact.rows?.map((row) => (
                    <View key={row.name} style={styles.record}>
                        <View style={styles.recordHead}>
                            <Text style={styles.recordName}>{row.name}</Text>
                            <Text style={styles.recordAmount}>{row.amount}</Text>
                        </View>
                        <Text style={styles.recordMeta}>{row.sub}</Text>
                    </View>
                ))}
            </ScrollView>

            <View style={styles.bottomBar}>
                <Pressable style={styles.backBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={16} color={Colors.inverse} strokeWidth={2.2} />
                    <Text style={styles.backBtnText}>Back to conversation</Text>
                </Pressable>
                <Pressable style={styles.micBtn}>
                    <Icons.Mic size={18} color={Colors.inverse} strokeWidth={2.2} />
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

function Header({ title, subtitle, avColor, avInitial }: {
    title: string; subtitle: string; avColor?: string; avInitial?: string;
}) {
    return (
        <View style={styles.header}>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.headerCenter}>
                <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
                <View style={styles.subRow}>
                    {avColor && avInitial ? (
                        <View style={[styles.avMini, { backgroundColor: avColor }]}>
                            <Text style={styles.avMiniText}>{avInitial}</Text>
                        </View>
                    ) : null}
                    <Text style={styles.headerSub}>{subtitle}</Text>
                </View>
            </View>
            <View style={styles.iconBtn} />
        </View>
    );
}

function Stat({ label, value, delta }: { label: string; value: string; delta: string }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statDelta}>{delta}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 15, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 240 },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
    avMini: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    avMiniText: { color: Colors.inverse, fontSize: 7, fontWeight: '700' },
    headerSub: { fontSize: 11, color: Colors.ink3 },

    tabRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
    tabActive: { backgroundColor: Colors.ink },
    tabText: { fontSize: 12.5, fontWeight: Type.semibold, color: Colors.ink3 },
    tabTextActive: { fontSize: 12.5, fontWeight: Type.semibold, color: Colors.inverse },
    versionPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    versionText: { fontSize: 12, color: Colors.ink3, fontWeight: Type.medium },

    body: { padding: 18, paddingBottom: 100 },
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    stat: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, ...Shadow.card },
    statLabel: { fontSize: 10, fontWeight: Type.bold, letterSpacing: 1.2, color: Colors.ink3 },
    statValue: { fontSize: 22, fontWeight: Type.bold, marginTop: 5, color: Colors.ink, letterSpacing: -0.4 },
    statDelta: { fontSize: 11, color: Colors.positive, marginTop: 3, fontWeight: Type.medium },

    section: { fontSize: 11, fontWeight: Type.bold, letterSpacing: 1.4, color: Colors.ink3, paddingTop: 4, paddingBottom: 8, textTransform: 'uppercase' },
    record: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 14, marginBottom: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, ...Shadow.card },
    recordHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    recordName: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
    recordAmount: { fontSize: 15, fontWeight: Type.bold, color: Colors.ink },
    recordMeta: { fontSize: 11.5, color: Colors.ink3, marginTop: 6 },

    bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    backBtn: { flex: 1, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    backBtnText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
    micBtn: { width: 50, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', ...Shadow.cardLarge },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    notFound: { fontSize: 14, color: Colors.ink2 },
});
