import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';
import type { InlineArtifactCardData as InlineArtifact } from '@/data/types';

const TYPE_GLYPHS = {
    'data-table': (
        <Icons.Database size={16} color={Colors.brand} strokeWidth={2.2} />
    ),
    chart: (
        <Icons.Sparkle size={16} color={Colors.brand} strokeWidth={2.2} />
    ),
    document: (
        <Icons.Search size={16} color={Colors.brand} strokeWidth={2.2} />
    ),
    code: (
        <Icons.Sliders size={16} color={Colors.brand} strokeWidth={2.2} />
    ),
} as const;

/**
 * Inline artifact card rendered within an agent's message bubble.
 * Tap → navigates to the full artifact detail screen.
 *
 * Phase 1 supports preview rendering for data-table type (2–3 rows shown).
 * Other types show the header/meta only; full type-specific renderers live
 * on the artifact detail screen.
 */
export function InlineArtifactCard({ artifact }: { artifact: InlineArtifact }) {
    return (
        <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/artifact/[id]', params: { id: artifact.id } })}
        >
            <View style={styles.head}>
                <View style={styles.iconBox}>{TYPE_GLYPHS[artifact.type]}</View>
                <View style={styles.headText}>
                    <Text style={styles.typeLabel}>{artifact.typeLabel.toUpperCase()}</Text>
                    <Text style={styles.title}>{artifact.title}</Text>
                    <Text style={styles.meta}>{artifact.meta}</Text>
                </View>
            </View>

            {artifact.rows && artifact.rows.length > 0 ? (
                <View style={styles.preview}>
                    {artifact.rows.slice(0, 2).map((row, idx) => (
                        <View
                            key={idx}
                            style={[styles.row, idx > 0 && styles.rowBorder]}
                        >
                            <View style={styles.rowText}>
                                <Text style={styles.rowName}>{row.name}</Text>
                                <Text style={styles.rowSub}>{row.sub}</Text>
                            </View>
                            <Text style={styles.rowAmount}>{row.amount}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            <View style={styles.footer}>
                <Text style={styles.footerText}>Open full view</Text>
                <View style={styles.footerLink}>
                    <Text style={styles.footerLinkText}>View</Text>
                    <Icons.ChevronRight size={12} color={Colors.brand} strokeWidth={2.5} />
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: 12,
        backgroundColor: Colors.surface,
        borderRadius: Radius.xl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        overflow: 'hidden',
        ...Shadow.card,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, paddingBottom: 8 },
    iconBox: {
        width: 32, height: 32,
        borderRadius: 9,
        backgroundColor: Colors.brandSoft,
        alignItems: 'center', justifyContent: 'center',
    },
    headText: { flex: 1 },
    typeLabel: { fontSize: 10, fontWeight: Type.bold, letterSpacing: 1.2, color: Colors.brand },
    title: { fontSize: 14, fontWeight: Type.semibold, color: Colors.ink, marginTop: 1, letterSpacing: -0.1 },
    meta: { fontSize: 11.5, color: Colors.ink3, marginTop: 1 },

    preview: { paddingHorizontal: 14, paddingBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    rowText: { flex: 1 },
    rowName: { fontSize: 13.5, fontWeight: Type.medium, color: Colors.ink },
    rowSub: { fontSize: 11.5, color: Colors.ink3, marginTop: 1 },
    rowAmount: { fontSize: 13.5, fontWeight: Type.semibold, color: Colors.ink },

    footer: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 13, paddingVertical: 9,
        backgroundColor: 'rgba(13,13,16,0.025)',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.line2,
    },
    footerText: { fontSize: 12.5, color: Colors.ink2 },
    footerLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    footerLinkText: { fontSize: 12.5, fontWeight: Type.semibold, color: Colors.brand },
});
