import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { AgentAvatarStack } from '@/components/AgentAvatarStack';
import { useConversationArtifacts } from '@/hooks/useConversations';
import { adaptAgentRef } from '@/data/adapt';
import type { ArtifactSummary, ArtifactTypeCategory } from '@/data/services/artifacts';
import { Colors, Radius, Shadow, Type, colorForAgent } from '@/theme/tokens';

/**
 * All artifacts in a conversation — the expanded "dock" sheet.
 *
 * Loads real artifact summaries (category + preview + agent attribution) and
 * offers a single-select filter row: All · per-agent chips · type chips
 * (Tables / Charts / Documents). Tapping a card opens the artifact detail.
 *
 * Spec: plans/mobile-app-react-native/html/artifacts-dock-open.html
 */

/** The active filter dimension: everything, a specific agent, or a category. */
type ActiveFilter =
    | { type: 'all' }
    | { type: 'agent'; id: string }
    | { type: 'category'; category: ArtifactTypeCategory };

export default function ArtifactsDockScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { artifacts, loading } = useConversationArtifacts(id);
    const [filter, setFilter] = useState<ActiveFilter>({ type: 'all' });

    const list = artifacts ?? [];
    const agents = useMemo(() => distinctAgents(list), [list]);
    const filtered = useMemo(() => applyFilter(list, filter), [list, filter]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.handle} />
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Artifacts in this conversation</Text>
                    <Text style={styles.subtitle}>{artifacts ? `${list.length} items` : 'Loading…'}</Text>
                </View>
                <Pressable hitSlop={8} style={styles.close} onPress={() => router.back()}>
                    <Icons.ChevronDown size={14} color={Colors.ink2} strokeWidth={2.5} />
                </Pressable>
            </View>

            {list.length > 0 ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                    style={styles.filterRowScroll}
                >
                    <FilterChip
                        label={`All (${list.length})`}
                        active={filter.type === 'all'}
                        onPress={() => setFilter({ type: 'all' })}
                    />
                    {agents.map((agent) => (
                        <FilterChip
                            key={agent.id}
                            label={`${agent.name} (${agent.count})`}
                            accent={agent.color}
                            active={filter.type === 'agent' && filter.id === agent.id}
                            onPress={() => setFilter({ type: 'agent', id: agent.id })}
                        />
                    ))}
                    {CATEGORY_ORDER.map((category) => {
                        const count = list.filter((a) => a.category === category).length;
                        if (count === 0) return null;
                        return (
                            <FilterChip
                                key={category}
                                label={`${categoryLabel(category)} (${count})`}
                                active={filter.type === 'category' && filter.category === category}
                                onPress={() => setFilter({ type: 'category', category })}
                            />
                        );
                    })}
                </ScrollView>
            ) : null}

            <ScrollView contentContainerStyle={styles.list}>
                {loading && !artifacts ? (
                    <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /></View>
                ) : null}
                {artifacts && list.length === 0 ? (
                    <Text style={styles.empty}>No artifacts produced in this conversation yet.</Text>
                ) : null}
                {artifacts && list.length > 0 && filtered.length === 0 ? (
                    <Text style={styles.empty}>No artifacts match this filter.</Text>
                ) : null}
                {filtered.map((artifact) => (
                    <ArtifactCard key={artifact.id} artifact={artifact} />
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

/** A single artifact row with agent avatar, category icon, title, and preview. */
function ArtifactCard({ artifact }: { artifact: ArtifactSummary }) {
    const agent = adaptAgentRef(artifact.agentId, artifact.agentName);
    const accent = categoryColor(artifact.category);
    const CategoryIcon = categoryIcon(artifact.category);
    return (
        <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/artifact/[id]', params: { id: artifact.id } })}
        >
            <View style={[styles.rowIcon, { backgroundColor: hexA(accent, 0.1) }]}>
                <CategoryIcon size={20} color={accent} strokeWidth={2.2} />
            </View>
            <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{artifact.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                    {categoryLabel(artifact.category)} · {artifact.typeName}
                </Text>
                {artifact.preview ? (
                    <Text style={styles.rowPreview} numberOfLines={1}>{artifact.preview}</Text>
                ) : null}
            </View>
            {artifact.agentId ? <AgentAvatarStack agents={[agent]} size={26} borderColor={Colors.surface} /> : null}
            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
        </Pressable>
    );
}

/** A selectable filter pill. */
function FilterChip({ label, active, accent, onPress }: { label: string; active: boolean; accent?: string; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
            {accent ? <View style={[styles.chipDot, { backgroundColor: accent }]} /> : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </Pressable>
    );
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: readonly ArtifactTypeCategory[] = ['table', 'chart', 'document'] as const;

type AgentChip = { id: string; name: string; color: string; count: number };

/** Distinct agents that produced at least one artifact, with counts. */
function distinctAgents(artifacts: ArtifactSummary[]): AgentChip[] {
    const byId = new Map<string, AgentChip>();
    for (const a of artifacts) {
        if (!a.agentId) continue;
        const existing = byId.get(a.agentId);
        if (existing) {
            existing.count += 1;
        } else {
            byId.set(a.agentId, { id: a.agentId, name: a.agentName ?? 'Agent', color: colorForAgent(a.agentName), count: 1 });
        }
    }
    return Array.from(byId.values());
}

/** Apply the active filter to the artifact list. */
function applyFilter(artifacts: ArtifactSummary[], filter: ActiveFilter): ArtifactSummary[] {
    switch (filter.type) {
        case 'agent':
            return artifacts.filter((a) => a.agentId === filter.id);
        case 'category':
            return artifacts.filter((a) => a.category === filter.category);
        case 'all':
        default:
            return artifacts;
    }
}

/** Human label for a category. */
function categoryLabel(category: ArtifactTypeCategory): string {
    switch (category) {
        case 'table': return 'Tables';
        case 'chart': return 'Charts';
        case 'document': return 'Documents';
    }
}

/** Accent color for a category badge. */
function categoryColor(category: ArtifactTypeCategory): string {
    switch (category) {
        case 'table': return Colors.brand;
        case 'chart': return Colors.agentResearch;
        case 'document': return Colors.agentAnalyst;
    }
}

/** Icon for a category badge. */
function categoryIcon(category: ArtifactTypeCategory) {
    switch (category) {
        case 'table': return Icons.Database;
        case 'chart': return Icons.Sparkle;
        case 'document': return Icons.Sliders;
    }
}

/** Convert a 6-digit hex to an rgba string at the given alpha. */
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

    filterRowScroll: { maxHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    chipActive: { backgroundColor: Colors.brandSoft, borderColor: Colors.brand },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipText: { fontSize: 12.5, fontWeight: Type.medium, color: Colors.ink2 },
    chipTextActive: { color: Colors.brand, fontWeight: Type.semibold },

    list: { padding: 16, paddingBottom: 40 },
    loadingBlock: { paddingVertical: 32, alignItems: 'center' },
    empty: { textAlign: 'center', color: Colors.ink3, fontSize: 13, paddingVertical: 24 },
    row: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, marginBottom: 8, ...Shadow.card },
    rowIcon: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    rowMeta: { fontSize: 12, color: Colors.ink3, marginTop: 2 },
    rowPreview: { fontSize: 12, color: Colors.ink2, marginTop: 2 },
});
