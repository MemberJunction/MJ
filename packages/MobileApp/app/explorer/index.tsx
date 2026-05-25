import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useExplorerCounts } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

export default function ExplorerHomeScreen() {
    const counts = useExplorerCounts();

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

                <View style={styles.tileGrid}>
                    <Tile
                        wide={false}
                        title="Entities"
                        sub="Browse records by type"
                        stat={counts ? `${counts.entities} entities` : '…'}
                        iconBg={Colors.brandSoft}
                        icon={<Icons.Database size={22} color={Colors.brand} strokeWidth={2} />}
                        onPress={() => router.push('/explorer/entities')}
                    />
                    <Tile
                        wide={false}
                        title="Queries"
                        sub="Run saved queries"
                        stat={counts ? `${counts.queries} available` : '…'}
                        iconBg={Colors.positiveSoft}
                        icon={<Icons.Sliders size={22} color={Colors.positive} strokeWidth={2} />}
                        onPress={() => router.push('/explorer/queries')}
                    />
                    <Tile
                        wide
                        title="Dashboards"
                        sub="Most dashboards are built for desktop and may not render optimally on mobile."
                        stat={counts ? `${counts.dashboards} available` : '…'}
                        iconBg={Colors.warnSoft}
                        icon={<Icons.Sparkle size={22} color={Colors.warn} strokeWidth={2} />}
                        onPress={() => router.push('/explorer/dashboards')}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function Tile({
    wide, title, sub, stat, iconBg, icon, onPress,
}: {
    wide: boolean;
    title: string;
    sub: string;
    stat: string;
    iconBg: string;
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

    tileGrid: { paddingHorizontal: 14, paddingTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: { width: '47.5%', backgroundColor: Colors.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, padding: 16, minHeight: 130, justifyContent: 'space-between', ...Shadow.card },
    tileWide: { width: '100%' },
    tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    tileTitle: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.2 },
    tileSub: { fontSize: 12, color: Colors.ink3, marginTop: 3, lineHeight: 17 },
    tileStat: { fontSize: 11.5, fontWeight: Type.semibold, color: Colors.ink2, marginTop: 10 },
});
