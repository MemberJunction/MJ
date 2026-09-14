import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { ChatColors, Colors, Radius, Type } from '@/theme/tokens';
import type {
    MJChatAgentPresenceProps,
    MJChatEmptyStateProps,
    MJChatHeaderProps,
    MJChatMessageRendererProps,
} from '../slots';

/**
 * @fileoverview The shipped default component for each chat slot.
 *
 * Every one of these is exported, which is the whole point: a consumer who wants to *add* rather
 * than *replace* renders the default inside their own component and keeps its behaviour. That is
 * the containment pattern the Angular slots support, and it only works if the defaults are part of
 * the public surface rather than private internals.
 */

/**
 * Default `emptyState` — greeting, subtext, and a two-column grid of starter cards.
 *
 * Geometry is taken from MJ Explorer at its phone breakpoint rather than invented: 180×78 cards in
 * two columns with 6px gutters, `--mj-bg-surface-card` ground, a 1px `--mj-border-default` hairline
 * and `--mj-radius-md` corners. Someone who starts a conversation on the web and then on a phone
 * should not notice they moved.
 */
export function MJChatEmptyStateDefault({
    Greeting,
    Subtext,
    SuggestedPrompts,
    OnPromptSelected,
}: MJChatEmptyStateProps) {
    return (
        <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
                <Icons.Send size={22} color={Colors.brand} strokeWidth={2} />
            </View>
            <Text style={styles.emptyTitle}>{Greeting}</Text>
            {Subtext ? <Text style={styles.emptyBody}>{Subtext}</Text> : null}
            {SuggestedPrompts?.length ? (
                <View style={styles.promptGrid}>
                    {SuggestedPrompts.map((p) => {
                        // The web shows a bold title and a description; a single string carries both
                        // when separated by an em dash, and degrades to a title-only card otherwise.
                        const [title, ...rest] = p.split(' — ');
                        const description = rest.join(' — ');
                        return (
                            <Pressable
                                key={p}
                                style={styles.promptCard}
                                accessibilityRole="button"
                                accessibilityLabel={title}
                                onPress={() => OnPromptSelected(p)}
                            >
                                <Text style={styles.promptTitle} numberOfLines={1}>{title}</Text>
                                {description ? (
                                    <Text style={styles.promptDesc} numberOfLines={2}>{description}</Text>
                                ) : null}
                            </Pressable>
                        );
                    })}
                </View>
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
    listening: { color: Colors.positive, label: 'Listening' },
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


/**
 * Alternative `messageRenderer` — a side-aligned coloured bubble.
 *
 * MJ ships two message renderers on the web and so does this app: the FEED layout (avatar, name,
 * timestamp) is the default, and this bubble layout is the alternative a host selects by passing it
 * as the `messageRenderer` slot. Identity comes from side and colour rather than from an avatar —
 * user on the right in `--mj-chat-bubble-user-bg`, agent on the left in the card ground.
 *
 * Measurements are the web component's, converted from rem at a 16px root: 70% max width,
 * 10px/14px padding, 16px corners with the speaker's trailing corner tightened to 4px, 15px text
 * at 1.4 line-height.
 *
 * ```tsx
 * <MJChat ConversationID={id} Slots={{ messageRenderer: MJChatMessageBubbleDefault }} />
 * ```
 */
export function MJChatMessageBubbleDefault({ Message }: MJChatMessageRendererProps) {
    if (!Message) return null;
    const isUser = (Message.Role ?? '').toLowerCase() === 'user';
    return (
        <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAgent]}>
                <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAgent]}>
                    {Message.Message ?? ''}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    // 12px side margins, matching Explorer's `.empty-state-container`.
    emptyWrap: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 16 },
    emptyIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    emptyTitle: { fontSize: Type.title, fontWeight: Type.semibold, color: Colors.ink, textAlign: 'center' },
    emptyBody: { fontSize: Type.small, color: Colors.ink3, textAlign: 'center', lineHeight: 20, marginTop: 6, paddingHorizontal: 8 },
    // Two columns with 6px gutters — `flexWrap` is RN's grid here, and `48%` leaves room for the gap.
    promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 18, width: '100%' },
    promptCard: {
        width: '48.5%',
        minHeight: 78,
        backgroundColor: Colors.bg,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.line2,
        padding: 10,
        justifyContent: 'center',
    },
    promptTitle: { fontSize: Type.small, fontWeight: Type.semibold, color: Colors.ink },
    promptDesc: { fontSize: Type.caption, color: Colors.ink3, marginTop: 3, lineHeight: 16 },

    presence: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    presenceProminent: { paddingVertical: 6 },
    presenceDot: { width: 8, height: 8, borderRadius: 4 },
    presenceText: { fontSize: 12.5, color: Colors.ink3, fontWeight: Type.medium },

    // Bubble renderer — the web component's rem measurements at a 16px root.
    bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start', paddingVertical: 4, paddingHorizontal: 12 },
    bubbleRowUser: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '70%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16 },
    bubbleAgent: { backgroundColor: ChatColors.bubbleAgentBg, borderBottomLeftRadius: 4 },
    bubbleUser: { backgroundColor: ChatColors.bubbleUserBg, borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    bubbleTextAgent: { color: ChatColors.bubbleAgentText },
    bubbleTextUser: { color: ChatColors.bubbleUserText },

    header: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 220 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 2 },
    artifactBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    artifactBadgeText: { fontSize: 11.5, fontWeight: '700', color: Colors.brand },
});
