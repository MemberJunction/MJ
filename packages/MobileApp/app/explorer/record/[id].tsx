import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { getOpportunity } from '@/data/mock-explorer';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Read-only record detail.
 * Spec: plans/mobile-app-react-native/html/record-detail.html
 */
export default function RecordDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const opp = getOpportunity(id);

    if (!opp) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Text style={styles.notFound}>Record not found.</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text numberOfLines={1} style={styles.headerTitle}>{opp.name}</Text>
                    <Text style={styles.headerSub}>Opportunity · view only</Text>
                </View>
                <Pressable hitSlop={8} style={styles.iconBtn} />
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroAmount}>{opp.amount}</Text>
                    <Text style={styles.heroName}>{opp.name}</Text>
                    <View style={styles.heroTags}>
                        <View style={[styles.stagePill, stagePillBg(opp.stage)]}>
                            <Text style={[styles.stagePillText, stagePillFg(opp.stage)]}>{opp.stage.toUpperCase()}</Text>
                        </View>
                        <Text style={styles.heroMeta}>· {opp.account} · {opp.closeDate}</Text>
                    </View>
                    <View style={styles.progress}>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${opp.probability}%` }]} />
                        </View>
                        <Text style={styles.progressPct}>{opp.probability}%</Text>
                    </View>
                </View>

                <Section title="Key details">
                    <Row k="Account" v={opp.account} />
                    <Row k="Stage" v={opp.stage} />
                    <Row k="Probability" v={`${opp.probability}%`} />
                    <Row k="Close date" v="Jun 15, 2026" />
                    <Row k="Source" v="Customer referral" />
                    <Row k="Created" v="Mar 28, 2026" />
                </Section>

                <Section title="Owner">
                    <View style={styles.ownerRow}>
                        <View style={styles.ownerAv}>
                            <Text style={styles.ownerAvText}>{opp.owner.initials}</Text>
                        </View>
                        <View>
                            <Text style={styles.ownerName}>{opp.owner.name}</Text>
                            <Text style={styles.ownerSub}>Enterprise AE · last update 2d ago</Text>
                        </View>
                    </View>
                </Section>

                <Section title="Related">
                    <RelatedRow label="Contacts" count={7} />
                    <RelatedRow label="Activities" count={23} />
                    <RelatedRow label="Documents" count={5} />
                    <RelatedRow label="Other opportunities" count={3} />
                </Section>
            </ScrollView>

            <View style={styles.askBar}>
                <Pressable
                    style={styles.askBtn}
                    onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'c-acme-pipeline-review' } })}
                >
                    <View style={styles.askAv}>
                        <Text style={styles.askAvText}>S</Text>
                    </View>
                    <Text style={styles.askText}>Ask Skip about this opportunity</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
            {children}
        </View>
    );
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <View style={styles.kvRow}>
            <Text style={styles.kvK}>{k}</Text>
            <Text style={styles.kvV}>{v}</Text>
        </View>
    );
}

function RelatedRow({ label, count }: { label: string; count: number }) {
    return (
        <View style={styles.relRow}>
            <Text style={styles.relText}>{label}</Text>
            <View style={styles.relMeta}>
                <View style={styles.relCount}><Text style={styles.relCountText}>{count}</Text></View>
                <Icons.ChevronRight size={14} color={Colors.ink3} strokeWidth={2} />
            </View>
        </View>
    );
}

function stagePillBg(stage: 'Negotiation' | 'Proposal' | 'Discovery') {
    return { backgroundColor: stage === 'Negotiation' ? Colors.warnSoft : stage === 'Proposal' ? Colors.brandSoft : Colors.positiveSoft };
}
function stagePillFg(stage: 'Negotiation' | 'Proposal' | 'Discovery') {
    return { color: stage === 'Negotiation' ? Colors.warn : stage === 'Proposal' ? Colors.brand : Colors.positive };
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    notFound: { padding: 24, color: Colors.ink2 },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, maxWidth: 240 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },

    body: { padding: 16, paddingBottom: 100 },
    heroCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, marginBottom: 12, ...Shadow.card },
    heroAmount: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, color: Colors.ink },
    heroName: { fontSize: 17, fontWeight: Type.semibold, marginTop: 2, color: Colors.ink },
    heroTags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
    heroMeta: { fontSize: 11.5, color: Colors.ink3 },
    stagePill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
    stagePillText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 },
    progress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(13,13,16,0.06)', overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: Colors.brand },
    progressPct: { fontSize: 12, fontWeight: Type.semibold, color: Colors.ink2 },

    section: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 10, ...Shadow.card },
    sectionTitle: { fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2, marginBottom: 10 },
    kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    kvK: { color: Colors.ink3, fontSize: 14 },
    kvV: { color: Colors.ink, fontSize: 14, fontWeight: Type.medium, textAlign: 'right' },

    ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ownerAv: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.agentEmailDrafter, alignItems: 'center', justifyContent: 'center' },
    ownerAvText: { color: Colors.inverse, fontWeight: '700', fontSize: 12 },
    ownerName: { fontSize: 14, fontWeight: Type.semibold, color: Colors.ink },
    ownerSub: { fontSize: 11.5, color: Colors.ink3 },

    relRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    relText: { fontSize: 13.5, color: Colors.ink },
    relMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    relCount: { backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    relCountText: { fontSize: 11.5, color: Colors.ink2, fontWeight: Type.semibold },

    askBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: Colors.bg },
    askBtn: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadow.cardLarge },
    askAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    askAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    askText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
});
