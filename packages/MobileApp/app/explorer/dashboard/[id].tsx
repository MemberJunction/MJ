import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Dashboard view — best-effort mobile render.
 * Spec: plans/mobile-app-react-native/html/dashboard-view.html
 *
 * Native renderers for KPI grids, line charts, and list panels. Other part
 * types fall back to a "Desktop-optimized" stub card.
 */
export default function DashboardViewScreen() {
    const { id: _id } = useLocalSearchParams<{ id: string }>();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Sales pulse</Text>
                    <Text style={styles.headerSub}>6 parts · last refreshed 9:30 AM</Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            <View style={styles.notice}>
                <View style={{ marginTop: 1 }}>
                    <Icons.Sparkle size={14} color={Colors.warn} strokeWidth={2.2} />
                </View>
                <Text style={styles.noticeText}>
                    Some dashboard parts are built for larger screens. Tap any panel for the desktop view in your browser.
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                <Panel title="Topline KPIs">
                    <View style={styles.kpiGrid}>
                        <KPI label="Pipeline" value="$2.5M" delta="▲ 12%" up />
                        <KPI label="Open deals" value="47" delta="▲ 5" up />
                        <KPI label="Won this mo." value="$450K" delta="▲ 22%" up />
                        <KPI label="At risk" value="$612K" delta="▲ 3 accts" down />
                    </View>
                </Panel>

                <Panel title="Pipeline · last 90 days">
                    <View style={styles.chart}>
                        <Svg width="100%" height="100%" viewBox="0 0 320 100" preserveAspectRatio="none">
                            <Defs>
                                <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0%" stopColor={Colors.brand} stopOpacity="0.35" />
                                    <Stop offset="100%" stopColor={Colors.brand} stopOpacity="0" />
                                </LinearGradient>
                            </Defs>
                            <Path d="M0,72 L24,68 L48,75 L72,64 L96,60 L120,55 L144,58 L168,46 L192,48 L216,38 L240,40 L264,28 L288,32 L312,22 L320,18 L320,100 L0,100 Z" fill="url(#g)" />
                            <Path d="M0,72 L24,68 L48,75 L72,64 L96,60 L120,55 L144,58 L168,46 L192,48 L216,38 L240,40 L264,28 L288,32 L312,22 L320,18" fill="none" stroke={Colors.brand} strokeWidth={2.4} />
                        </Svg>
                    </View>
                </Panel>

                <Panel title="Top open opportunities">
                    <ListRow primary="Acme · Q2 platform expansion" sub="Sarah Park · close 6/15" amount="$145K" first />
                    <ListRow primary="Globex · Annual contract" sub="Daniel Lin · close 7/2" amount="$120K" />
                    <ListRow primary="Initech · expansion" sub="Maya Rao · close 6/22" amount="$96K" />
                </Panel>

                <Panel title="Renewals at risk">
                    <ListRow primary="Northwind" sub="Renews Jun 28 · health 52" badge="HIGH" first />
                    <ListRow primary="Soylent Corp" sub="Renews Jul 4 · health 58" badge="HIGH" />
                </Panel>

                <Panel title="Sales funnel">
                    <View style={styles.stub}>
                        <Text style={styles.stubLabel}>OPTIMIZED FOR DESKTOP</Text>
                        <Text style={styles.stubName}>Funnel chart with cohort drilldown</Text>
                        <Text style={styles.stubHint}>This panel renders best on a larger screen.</Text>
                        <View style={styles.stubBtn}>
                            <Icons.ChevronRight size={11} color={Colors.brand} strokeWidth={2.2} />
                            <Text style={styles.stubBtnText}>Open on desktop</Text>
                        </View>
                    </View>
                </Panel>
            </ScrollView>

            <View style={styles.askBar}>
                <Pressable
                    style={styles.askBtn}
                    onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'c-acme-pipeline-review' } })}
                >
                    <View style={styles.askAv}>
                        <Text style={styles.askAvText}>S</Text>
                    </View>
                    <Text style={styles.askText}>Ask Skip about this dashboard</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.panel}>
            <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>{title.toUpperCase()}</Text>
                <Icons.ChevronRight size={14} color={Colors.ink3} strokeWidth={2} />
            </View>
            {children}
        </View>
    );
}

function KPI({ label, value, delta, up, down }: { label: string; value: string; delta: string; up?: boolean; down?: boolean }) {
    return (
        <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>{label.toUpperCase()}</Text>
            <Text style={styles.kpiValue}>{value}</Text>
            <Text style={[styles.kpiDelta, up && { color: Colors.positive }, down && { color: Colors.danger }]}>{delta}</Text>
        </View>
    );
}

function ListRow({ primary, sub, amount, badge, first }: { primary: string; sub: string; amount?: string; badge?: string; first?: boolean }) {
    return (
        <View style={[styles.listRow, !first && styles.listRowBorder]}>
            <View style={{ flex: 1 }}>
                <Text style={styles.listName}>{primary}</Text>
                <Text style={styles.listSub}>{sub}</Text>
            </View>
            {amount ? <Text style={styles.listAmount}>{amount}</Text> : null}
            {badge ? (
                <View style={styles.listBadge}>
                    <Text style={styles.listBadgeText}>{badge}</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },

    notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', margin: 16, marginBottom: 0, padding: 12, backgroundColor: 'rgba(184,122,31,0.10)', borderWidth: 1, borderColor: 'rgba(184,122,31,0.25)', borderRadius: 12 },
    noticeText: { flex: 1, fontSize: 12.5, color: '#8e5c14', lineHeight: 17 },

    body: { padding: 14, paddingBottom: 100 },
    panel: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 16, padding: 14, marginBottom: 10, ...Shadow.card },
    panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    panelTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: Colors.ink3 },

    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpi: { width: '47%', backgroundColor: Colors.surface2, borderRadius: 10, padding: 12 },
    kpiLabel: { fontSize: 10.5, color: Colors.ink3, fontWeight: Type.semibold, letterSpacing: 0.8 },
    kpiValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: Colors.ink, marginTop: 4 },
    kpiDelta: { fontSize: 11, marginTop: 2, fontWeight: Type.semibold, color: Colors.ink3 },

    chart: { height: 120, backgroundColor: Colors.surface2, borderRadius: 10, padding: 12 },

    listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 8 },
    listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    listName: { fontSize: 13.5, fontWeight: Type.medium, color: Colors.ink },
    listSub: { fontSize: 11.5, color: Colors.ink3, marginTop: 1 },
    listAmount: { fontSize: 13.5, fontWeight: '700', color: Colors.ink },
    listBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: Colors.warnSoft },
    listBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.warn },

    stub: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.line2, borderStyle: 'dashed', borderRadius: 12, padding: 32, alignItems: 'center' },
    stubLabel: { fontSize: 11, color: Colors.ink3, fontWeight: '700', letterSpacing: 1.4 },
    stubName: { fontSize: 14.5, fontWeight: Type.semibold, marginTop: 8, color: Colors.ink },
    stubHint: { fontSize: 12, color: Colors.ink3, marginTop: 4, textAlign: 'center', lineHeight: 17 },
    stubBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    stubBtnText: { fontSize: 12.5, fontWeight: Type.semibold, color: Colors.brand },

    askBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: Colors.bg },
    askBtn: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadow.cardLarge },
    askAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    askAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    askText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
});
