import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * @fileoverview The artifact card that sits under the turn that produced it.
 *
 * ## Why in the thread and not only in the dock
 *
 * This app already had an artifact dock — a "N artifacts in this conversation" handle above the
 * composer. A dock answers "what did this conversation produce", which is a different question from
 * "what did *that* turn produce", and it is the second one you have while reading. Detached from
 * the turn, an artifact loses the thing that explains it: the request that caused it and the
 * sentence the agent wrote about it.
 *
 * `MJ: Conversation Details` carries `ArtifactID` directly, so the association is a column read.
 * The dock stays — the two answer different questions and neither replaces the other.
 *
 * ## What this deliberately does not do
 *
 * It does not render the artifact. A phone message list is a scrolling surface with a keyboard
 * under it; a table, a chart or a document inside a bubble is a worse version of both. The card
 * identifies and opens — the viewer renders.
 */

/** Icon and tint for a type, so the card is recognisable before the label is read. */
function Appearance(typeName: string | null | undefined): { Icon: keyof typeof Icons; Tint: string } {
    const t = (typeName ?? '').toLowerCase();
    if (t.includes('image') || t.includes('svg')) return { Icon: 'Image', Tint: Colors.agentResearch };
    if (t.includes('data') || t.includes('csv') || t.includes('excel') || t.includes('spreadsheet')) {
        return { Icon: 'Database', Tint: Colors.agentForecaster };
    }
    if (t.includes('sql') || t.includes('json') || t.includes('xml') || t.includes('code')
        || t.includes('script') || t.includes('python') || t.includes('java')) {
        return { Icon: 'FileText', Tint: Colors.agentAnalyst };
    }
    if (t.includes('component')) return { Icon: 'Sparkle', Tint: Colors.agentEmailDrafter };
    return { Icon: 'FileText', Tint: Colors.brand };
}

/** What the card shows. */
export type ArtifactMessageCardProps = {
    /** `MJ: Conversation Artifacts.ID` — what the viewer opens. */
    ArtifactID: string;
    /** Display name, when the conversation's artifact list supplied one. */
    Name?: string | null;
    /** Artifact type name, e.g. "Data", "Image", "Markdown Document". */
    TypeName?: string | null;
    /** Version number, when known — an artifact that has been revised says so. */
    Version?: number | null;
};

/**
 * Renders one artifact as a tappable card.
 *
 * @param ArtifactID The conversation artifact to open.
 * @param Name Display name; falls back to the type, then to "Artifact".
 * @param TypeName Artifact type name, used for the icon and the subtitle.
 * @param Version Version number, shown only when greater than 1.
 */
export function ArtifactMessageCard({ ArtifactID, Name, TypeName, Version }: ArtifactMessageCardProps) {
    const { Icon, Tint } = Appearance(TypeName);
    const Glyph = Icons[Icon];
    const title = Name?.trim() || TypeName?.trim() || 'Artifact';
    const subtitle = [TypeName?.trim(), Version && Version > 1 ? `v${Version}` : null]
        .filter(Boolean)
        .join(' · ');

    return (
        <Pressable
            style={styles.card}
            accessibilityRole="button"
            accessibilityLabel={`Open artifact ${title}`}
            onPress={() => router.push({ pathname: '/artifact/[id]', params: { id: ArtifactID } })}
        >
            <View style={[styles.icon, { backgroundColor: Tint }]}>
                <Glyph size={16} color={Colors.inverse} strokeWidth={2.1} />
            </View>
            <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <Icons.ChevronRight size={17} color={Colors.ink3} strokeWidth={2} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        marginTop: 10,
        paddingVertical: 10,
        paddingHorizontal: 11,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
    },
    icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: 1 },
    title: { fontSize: 14, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    subtitle: { fontSize: 12, color: Colors.ink3 },
});
