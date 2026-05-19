import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { getConversation, type InlineArtifact } from '@/data/mock-thread';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * All artifacts in a conversation — the expanded "dock" sheet.
 * Spec: plans/mobile-app-react-native/html/artifacts-dock-open.html
 *
 * Phase 1 renders as a full screen (RN bottom-sheet polish comes in a follow-up
 * with @gorhom/bottom-sheet). The dismiss action returns to the conversation.
 */
export default function ArtifactsDockScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const conv = getConversation(id);

    if (!conv) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Header subtitle="conversation not found" />
            </SafeAreaView>
        );
    }

    const skipCount = conv.artifacts.filter(a => a.producedBy.id === 'skip').length;
    const researchCount = conv.artifacts.filter(a => a.producedBy.id === 'research').length;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.handle} />
            <Header subtitle={`${conv.artifacts.length} items · from ${conv.participants.map(a => a.name).join(' & ')}`} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
                <FilterChip active label={`All · ${conv.artifacts.length}`} />
                {skipCount > 0 ? <FilterChip label={`Skip · ${skipCount}`} dotColor={Colors.agentSkip} /> : null}
                {researchCount > 0 ? <FilterChip label={`Research · ${researchCount}`} dotColor={Colors.agentResearch} /> : null}
                <FilterChip label="Tables" />
                <FilterChip label="Charts" />
            </ScrollView>

            <ScrollView contentContainerStyle={styles.list}>
                {conv.artifacts.map((a) => (
                    <ArtifactRow key={a.id} artifact={a} />
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

function Header({ subtitle }: { subtitle: string }) {
    return (
        <View style={styles.header}>
            <View>
                <Text style={styles.title}>Artifacts in this conversation</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Pressable hitSlop={8} style={styles.close} onPress={() => router.back()}>
                <Icons.ChevronDown size={14} color={Colors.ink2} strokeWidth={2.5} />
            </Pressable>
        </View>
    );
}

function FilterChip({ label, active, dotColor }: { label: string; active?: boolean; dotColor?: string }) {
    return (
        <View style={[styles.fchip, active && styles.fchipActive]}>
            {dotColor ? <View style={[styles.fdot, { backgroundColor: dotColor }]} /> : null}
            <Text style={[styles.fchipText, active && styles.fchipTextActive]}>{label}</Text>
        </View>
    );
}

function ArtifactRow({ artifact }: { artifact: InlineArtifact }) {
    return (
        <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/artifact/[id]', params: { id: artifact.id } })}
        >
            <View style={[styles.rowIcon, { backgroundColor: hex(artifact.producedBy.color, 0.10) }]}>
                <Icons.Database size={20} color={artifact.producedBy.color} strokeWidth={2.2} />
            </View>
            <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{artifact.title}</Text>
                    <Text style={styles.rowTime}>2m</Text>
                </View>
                <View style={styles.rowMeta}>
                    <View style={[styles.rowMetaAv, { backgroundColor: artifact.producedBy.color }]}>
                        <Text style={styles.rowMetaAvText}>{artifact.producedBy.initial}</Text>
                    </View>
                    <Text style={styles.rowMetaText}>{artifact.producedBy.name} · {artifact.typeLabel}</Text>
                </View>
                {artifact.rows && artifact.rows.length > 0 ? (
                    <View style={styles.preview}>
                        {artifact.rows.slice(0, 3).map((r) => (
                            <View key={r.name} style={styles.previewRow}>
                                <Text style={styles.previewName} numberOfLines={1}>{r.name}</Text>
                                <Text style={styles.previewAmt}>{r.amount}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}
            </View>
        </Pressable>
    );
}

function hex(color: string, alpha: number): string {
    // Convert hex like #264FAF to rgba; falls back to the original if not hex.
    if (!color.startsWith('#') || (color.length !== 7 && color.length !== 4)) return color;
    const c = color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    title: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.2 },
    subtitle: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
    close: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },

    filterRow: { maxHeight: 50 },
    filterRowContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    fchip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, flexDirection: 'row', alignItems: 'center', gap: 5 },
    fchipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    fchipText: { fontSize: 12, fontWeight: Type.semibold, color: Colors.ink2 },
    fchipTextActive: { color: Colors.inverse },
    fdot: { width: 8, height: 8, borderRadius: 4 },

    list: { padding: 16, gap: 8, paddingBottom: 40 },
    row: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, marginBottom: 8, ...Shadow.card },
    rowIcon: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 3 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, flex: 1 },
    rowTime: { fontSize: 11, color: Colors.ink3, fontWeight: Type.medium },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowMetaAv: { width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    rowMetaAvText: { color: Colors.inverse, fontSize: 7, fontWeight: '700' },
    rowMetaText: { fontSize: 12, color: Colors.ink3 },
    preview: { marginTop: 8, padding: 10, backgroundColor: Colors.surface2, borderRadius: 8 },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
    previewName: { fontSize: 11.5, color: Colors.ink2, flex: 1 },
    previewAmt: { fontSize: 11.5, color: Colors.ink, fontWeight: Type.semibold },
});
