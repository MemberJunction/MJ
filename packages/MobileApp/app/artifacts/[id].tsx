import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useConversation } from '@/hooks/useConversations';
import { adaptConversation } from '@/data/adapt';
import { Colors, Radius, Shadow, Type, colorForAgent } from '@/theme/tokens';

/**
 * All artifacts in a conversation — the expanded "dock" sheet.
 * Spec: plans/mobile-app-react-native/html/artifacts-dock-open.html
 */
export default function ArtifactsDockScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data, loading } = useConversation(id);
    const view = data ? adaptConversation(data) : null;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.handle} />
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Artifacts in this conversation</Text>
                    <Text style={styles.subtitle}>{view ? `${view.artifacts.length} items` : 'Loading…'}</Text>
                </View>
                <Pressable hitSlop={8} style={styles.close} onPress={() => router.back()}>
                    <Icons.ChevronDown size={14} color={Colors.ink2} strokeWidth={2.5} />
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.list}>
                {loading && !view ? (
                    <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /></View>
                ) : null}
                {view && view.artifacts.length === 0 ? (
                    <Text style={styles.empty}>No artifacts produced in this conversation yet.</Text>
                ) : null}
                {view?.artifacts.map((a) => {
                    const typeName = (a as { ArtifactType?: string }).ArtifactType ?? 'Artifact';
                    const accent = colorForAgent(typeName);
                    return (
                        <Pressable
                            key={a.ID}
                            style={styles.row}
                            onPress={() => router.push({ pathname: '/artifact/[id]', params: { id: a.ID } })}
                        >
                            <View style={[styles.rowIcon, { backgroundColor: hexA(accent, 0.1) }]}>
                                <Icons.Database size={20} color={accent} strokeWidth={2.2} />
                            </View>
                            <View style={styles.rowBody}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{a.Name}</Text>
                                <Text style={styles.rowMeta} numberOfLines={1}>
                                    {typeName}{a.Description ? ` · ${a.Description}` : ''}
                                </Text>
                            </View>
                            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
                        </Pressable>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

function hexA(color: string, alpha: number): string {
    if (!color.startsWith('#') || color.length !== 7) return color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    title: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.2 },
    subtitle: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
    close: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    list: { padding: 16, paddingBottom: 40 },
    loadingBlock: { paddingVertical: 32, alignItems: 'center' },
    empty: { textAlign: 'center', color: Colors.ink3, fontSize: 13, paddingVertical: 24 },
    row: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, marginBottom: 8, ...Shadow.card },
    rowIcon: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    rowMeta: { fontSize: 12, color: Colors.ink3, marginTop: 2 },
});
