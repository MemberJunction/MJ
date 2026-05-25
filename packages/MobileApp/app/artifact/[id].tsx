import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useArtifact } from '@/hooks/useConversations';
import type { LoadedArtifact } from '@/data/services/artifacts';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Single-artifact detail. Renders by classified content kind:
 *   json-table → key/value cards per row
 *   json       → pretty-printed JSON
 *   markdown   → lightweight markdown (headings/bold/bullets)
 *   code/text  → monospace / plain
 * Interactive components are a Phase 2 item (react-runtime) — shown as a
 * "view on desktop" notice for now (see plan §4.3).
 *
 * Spec: plans/mobile-app-react-native/html/artifact-detail.html
 */
export default function ArtifactDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { artifact, loading, error } = useArtifact(id);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text numberOfLines={1} style={styles.headerTitle}>{artifact?.name ?? 'Artifact'}</Text>
                    <Text style={styles.headerSub}>
                        {artifact ? `${artifact.typeName} · v${artifact.version}${artifact.versionCount > 1 ? ` of ${artifact.versionCount}` : ''}` : 'Loading…'}
                    </Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            {loading && !artifact ? (
                <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /></View>
            ) : error ? (
                <View style={styles.loadingBlock}><Text style={styles.errorText}>{error.message}</Text></View>
            ) : !artifact ? (
                <View style={styles.loadingBlock}><Text style={styles.errorText}>Artifact not found.</Text></View>
            ) : (
                <ScrollView contentContainerStyle={styles.body}>
                    {artifact.description ? <Text style={styles.description}>{artifact.description}</Text> : null}
                    <ArtifactContent artifact={artifact} />
                </ScrollView>
            )}

            {artifact ? (
                <View style={styles.bottomBar}>
                    <Pressable style={styles.backBtn} onPress={() => router.back()}>
                        <Icons.ChevronLeft size={16} color={Colors.inverse} strokeWidth={2.2} />
                        <Text style={styles.backBtnText}>Back to conversation</Text>
                    </Pressable>
                    <Pressable style={styles.micBtn} onPress={() => router.push('/voice-mode')}>
                        <Icons.Mic size={18} color={Colors.inverse} strokeWidth={2.2} />
                    </Pressable>
                </View>
            ) : null}
        </SafeAreaView>
    );
}

function ArtifactContent({ artifact }: { artifact: LoadedArtifact }) {
    switch (artifact.kind) {
        case 'json-table':
            return (
                <View style={styles.cards}>
                    {(artifact.rows ?? []).slice(0, 100).map((row, idx) => {
                        const keys = Object.keys(row).slice(0, 6);
                        return (
                            <View key={idx} style={styles.recordCard}>
                                {keys.map((k) => (
                                    <View key={k} style={styles.cell}>
                                        <Text style={styles.cellKey}>{k}</Text>
                                        <Text style={styles.cellVal} numberOfLines={2}>
                                            {row[k] === null || row[k] === undefined ? '—' : String(row[k])}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </View>
            );
        case 'json':
            return <Text style={styles.code}>{JSON.stringify(artifact.json, null, 2)}</Text>;
        case 'code':
            return <Text style={styles.code}>{artifact.content}</Text>;
        case 'markdown':
            return <MarkdownView source={artifact.content} />;
        case 'text':
        default:
            return <Text style={styles.text}>{artifact.content}</Text>;
    }
}

/**
 * Lightweight markdown renderer — headings, bold, and bullet lists.
 * Phase 1 placeholder until the shared @memberjunction/markdown-core
 * extraction lands (plan §4.3).
 */
function MarkdownView({ source }: { source: string }) {
    const lines = source.split('\n');
    return (
        <View>
            {lines.map((line, idx) => {
                if (/^#{1,6}\s/.test(line)) {
                    const level = line.match(/^#+/)?.[0].length ?? 1;
                    return <Text key={idx} style={[styles.mdH, level <= 2 ? styles.mdH1 : styles.mdH2]}>{line.replace(/^#+\s/, '')}</Text>;
                }
                if (/^[-*]\s/.test(line)) {
                    return <Text key={idx} style={styles.mdBullet}>• {renderBold(line.replace(/^[-*]\s/, ''))}</Text>;
                }
                if (line.trim() === '') return <View key={idx} style={{ height: 8 }} />;
                return <Text key={idx} style={styles.mdP}>{renderBold(line)}</Text>;
            })}
        </View>
    );
}

function renderBold(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) =>
        part.startsWith('**') && part.endsWith('**')
            ? <Text key={idx} style={styles.bold}>{part.slice(2, -2)}</Text>
            : part,
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 15, fontWeight: Type.semibold, color: Colors.ink, maxWidth: 240 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
    loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    body: { padding: 16, paddingBottom: 100 },
    description: { fontSize: 14, color: Colors.ink2, lineHeight: 21, marginBottom: 14 },

    cards: { gap: 6 },
    recordCard: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 6, ...Shadow.card },
    cell: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
    cellKey: { fontSize: 12, color: Colors.ink3, flexShrink: 0, maxWidth: '45%' },
    cellVal: { fontSize: 13, color: Colors.ink, fontWeight: Type.medium, textAlign: 'right', flex: 1 },

    code: { fontFamily: 'Menlo', fontSize: 12.5, color: Colors.ink, backgroundColor: Colors.surface2, padding: 14, borderRadius: Radius.lg, lineHeight: 18 },
    text: { fontSize: 15, color: Colors.ink, lineHeight: 23 },

    mdH: { color: Colors.ink, fontWeight: Type.bold, marginTop: 12, marginBottom: 4 },
    mdH1: { fontSize: 20, letterSpacing: -0.3 },
    mdH2: { fontSize: 16 },
    mdP: { fontSize: 15, color: Colors.ink, lineHeight: 23, marginBottom: 2 },
    mdBullet: { fontSize: 15, color: Colors.ink, lineHeight: 23, marginBottom: 2, paddingLeft: 4 },
    bold: { fontWeight: Type.semibold },

    bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    backBtn: { flex: 1, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    backBtnText: { color: Colors.inverse, fontSize: 14.5, fontWeight: Type.semibold },
    micBtn: { width: 50, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', ...Shadow.cardLarge },
});
