import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Type } from '@/theme/tokens';
import type {
    MJChatAgentPresenceProps,
    MJChatEmptyStateProps,
    MJChatHeaderProps,
} from '../slots';

/**
 * @fileoverview The shipped default component for each chat slot.
 *
 * Every one of these is exported, which is the whole point: a consumer who wants to *add* rather
 * than *replace* renders the default inside their own component and keeps its behaviour. That is
 * the containment pattern the Angular slots support, and it only works if the defaults are part of
 * the public surface rather than private internals.
 */

/** Default `emptyState` — greeting, optional subtext, and tappable suggested prompts. */
export function MJChatEmptyStateDefault({
    Greeting,
    Subtext,
    SuggestedPrompts,
    OnPromptSelected,
}: MJChatEmptyStateProps) {
    return (
        <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{Greeting}</Text>
            {Subtext ? <Text style={styles.emptyBody}>{Subtext}</Text> : null}
            {SuggestedPrompts?.length ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.promptRow}
                >
                    {SuggestedPrompts.map((p) => (
                        <Pressable
                            key={p}
                            style={styles.prompt}
                            accessibilityRole="button"
                            onPress={() => OnPromptSelected(p)}
                        >
                            <Text style={styles.promptText} numberOfLines={2}>{p}</Text>
                        </Pressable>
                    ))}
                </ScrollView>
            ) : null}
        </View>
    );
}

/**
 * Default `agentPresence` — a status dot and the agent's name.
 *
 * Deliberately restrained. A tutor product replaces this slot with a character; stock chat should
 * not compete with the conversation for attention.
 */
export function MJChatAgentPresenceDefault({ State, AgentName, Mode }: MJChatAgentPresenceProps) {
    const tone = PRESENCE_TONE[State];
    return (
        <View style={[styles.presence, Mode === 'prominent' ? styles.presenceProminent : null]}>
            <View style={[styles.presenceDot, { backgroundColor: tone.color }]} />
            <Text style={styles.presenceText} numberOfLines={1}>
                {AgentName ? `${AgentName} · ${tone.label}` : tone.label}
            </Text>
        </View>
    );
}

/** Colour and wording per presence state, so the dot and the label never disagree. */
const PRESENCE_TONE: Record<MJChatAgentPresenceProps['State'], { color: string; label: string }> = {
    idle: { color: Colors.ink3, label: 'Ready' },
    listening: { color: '#2ec4a3', label: 'Listening' },
    thinking: { color: Colors.warn, label: 'Working' },
    speaking: { color: Colors.brand, label: 'Speaking' },
};

/** Default `header` — back affordance, title, and an optional artifact count. */
export function MJChatHeaderDefault({
    ConversationTitle,
    SharedBy,
    ArtifactCount,
    ShowArtifactIndicator,
    OnBack,
}: MJChatHeaderProps) {
    return (
        <View style={styles.header}>
            {OnBack ? (
                <Pressable style={styles.headerBtn} onPress={OnBack} accessibilityRole="button" accessibilityLabel="Back">
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
            ) : null}
            <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} numberOfLines={1}>{ConversationTitle || 'Conversation'}</Text>
                {SharedBy ? <Text style={styles.headerSub} numberOfLines={1}>Shared by {SharedBy}</Text> : null}
            </View>
            {ShowArtifactIndicator && ArtifactCount ? (
                <View style={styles.artifactBadge}>
                    <Text style={styles.artifactBadgeText}>{ArtifactCount}</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    emptyWrap: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 60, gap: 8 },
    emptyTitle: { fontSize: 19, fontWeight: Type.semibold, color: Colors.ink, textAlign: 'center' },
    emptyBody: { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 20 },
    promptRow: { gap: 8, paddingTop: 14, paddingHorizontal: 2 },
    prompt: { maxWidth: 220, paddingHorizontal: 13, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    promptText: { fontSize: 13.5, color: Colors.ink2 },

    presence: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    presenceProminent: { paddingVertical: 6 },
    presenceDot: { width: 8, height: 8, borderRadius: 4 },
    presenceText: { fontSize: 12.5, color: Colors.ink3, fontWeight: Type.medium },

    header: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 220 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 2 },
    artifactBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    artifactBadgeText: { fontSize: 11.5, fontWeight: '700', color: Colors.brand },
});
