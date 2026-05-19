import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

const RECENT = [
    { type: 'entity' as const, title: 'Opportunities', meta: 'Yesterday · 247 records', target: '/explorer/entity/Opportunities' as const },
    { type: 'query' as const, title: 'High-value at-risk renewals', meta: '2d ago · last run 9:08 AM', target: '/explorer/query/high-value-at-risk' as const },
    { type: 'dashboard' as const, title: 'Sales pulse', meta: '3d ago · 6 parts', target: '/explorer/dashboard/sales-pulse' as const },
];

export default function ExplorerHomeScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.navTop}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={{ flex: 1 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.hero}>
                    <Text style={styles.h1}>Data Explorer</Text>
                    <Text style={styles.copy}>Browse entities, run queries, view dashboards.</Text>
                </View>

                <View style={styles.search}>
                    <Icons.Search size={18} color={Colors.ink3} />
                    <Text style={styles.searchPlaceholder}>Search entities, queries, dashboards</Text>
                </View>

                <View style={styles.tileGrid}>
                    <Tile
                        wide={false}
                        title="Entities"
                        sub="Browse records by type"
                        stat="412 entities"
                        iconBg={Colors.brandSoft}
                        iconColor={Colors.brand}
                        icon={<Icons.Database size={22} color={Colors.brand} strokeWidth={2} />}
                        onPress={() => router.push('/explorer/entity/Opportunities')}
                    />
                    <Tile
                        wide={false}
                        title="Queries"
                        sub="Run saved queries"
                        stat="38 available"
                        iconBg={Colors.positiveSoft}
                        iconColor={Colors.positive}
                        icon={<Icons.Sliders size={22} color={Colors.positive} strokeWidth={2} />}
                        onPress={() => router.push('/explorer/query/high-value-at-risk')}
                    />
                    <Tile
                        wide
                        title="Dashboards"
                        sub="Note: most dashboards are built for desktop and may not render optimally on mobile."
                        stat="12 shared with you"
                        iconBg={Colors.warnSoft}
                        iconColor={Colors.warn}
                        icon={<Icons.Sparkle size={22} color={Colors.warn} strokeWidth={2} />}
                        onPress={() => router.push('/explorer/dashboard/sales-pulse')}
                    />
                </View>

                <Text style={styles.sectionLabel}>Recently viewed</Text>
                <View style={styles.recents}>
                    {RECENT.map((r) => (
                        <Pressable
                            key={r.title}
                            style={styles.recentRow}
                            onPress={() => router.push(r.target as never)}
                        >
                            <View style={[
                                styles.recentIcon,
                                {
                                    backgroundColor: r.type === 'entity' ? Colors.brandSoft : r.type === 'query' ? Colors.positiveSoft : Colors.warnSoft,
                                },
                            ]}>
                                {r.type === 'entity' ? <Icons.Database size={14} color={Colors.brand} strokeWidth={2.2} />
                                    : r.type === 'query' ? <Icons.Sliders size={14} color={Colors.positive} strokeWidth={2.2} />
                                        : <Icons.Sparkle size={14} color={Colors.warn} strokeWidth={2.2} />}
                            </View>
                            <View style={styles.recentBody}>
                                <Text style={styles.recentTitle}>{r.title}</Text>
                                <Text style={styles.recentMeta}>{r.meta}</Text>
                            </View>
                            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
                        </Pressable>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function Tile({
    wide, title, sub, stat, iconBg, iconColor, icon, onPress,
}: {
    wide: boolean;
    title: string;
    sub: string;
    stat: string;
    iconBg: string;
    iconColor: string;
    icon: React.ReactNode;
    onPress: () => void;
}) {
    return (
        <Pressable style={[styles.tile, wide && styles.tileWide]} onPress={onPress}>
            <View style={[styles.tileIcon, { backgroundColor: iconBg }]}>{icon}</View>
            <View style={{ marginTop: 14 }}>
                <Text style={styles.tileTitle}>{title}</Text>
                <Text style={styles.tileSub}>{sub}</Text>
                <Text style={styles.tileStat}>{stat}</Text>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    navTop: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    scroll: { paddingBottom: 32 },

    hero: { paddingHorizontal: 22, paddingTop: 6 },
    h1: { fontSize: 30, fontWeight: Type.bold, letterSpacing: -0.6, color: Colors.ink },
    copy: { color: Colors.ink3, fontSize: 14, lineHeight: 21, marginTop: 6 },

    search: { marginHorizontal: 18, marginTop: 16, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, height: 46, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, ...Shadow.card },
    searchPlaceholder: { color: Colors.ink3, fontSize: 14.5 },

    tileGrid: { paddingHorizontal: 14, paddingTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: { width: '47.5%', backgroundColor: Colors.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, padding: 16, minHeight: 130, justifyContent: 'space-between', ...Shadow.card },
    tileWide: { width: '100%' },
    tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    tileTitle: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.2 },
    tileSub: { fontSize: 12, color: Colors.ink3, marginTop: 3, lineHeight: 17 },
    tileStat: { fontSize: 11.5, fontWeight: Type.semibold, color: Colors.ink2, marginTop: 10 },

    sectionLabel: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 8, fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.4, textTransform: 'uppercase' },
    recents: { paddingHorizontal: 14, gap: 6 },
    recentRow: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    recentIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    recentBody: { flex: 1 },
    recentTitle: { fontSize: 14, fontWeight: Type.semibold, color: Colors.ink },
    recentMeta: { fontSize: 11.5, color: Colors.ink3, marginTop: 1 },
});
