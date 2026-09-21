import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
    RealtimeSessionStatusChip,
    RealtimeSessionTimelineGroup,
    RealtimeSessionTimelineMeta,
} from '@memberjunction/conversations-runtime';
import { Icons } from '@/components/Icon';
import type { AdaptedMessage } from '@/data/adapt';
import { Colors, Radius, Type } from '@/theme/tokens';
import { BuildRealtimeSessionCardView } from './session-card-view';

/**
 * @fileoverview The ONE timeline element a realtime voice session collapses to in the thread.
 *
 * Every turn of a live call is persisted as an ordinary `MJ: Conversation Detail`, stamped with its
 * `AgentSessionID`. Rendering those as normal bubbles — which this app did — means a forty-turn
 * call buries the typed conversation around it. The web has collapsed them into a card since the
 * feature shipped; this is that card, natively.
 *
 * Everything the card DECIDES comes from `@memberjunction/conversations-runtime`: the title, the
 * status chip and its tone, and whether the time range needs a second date. Only the drawing is
 * here. That is deliberate — "Timed out" versus "Closed" is a product decision, and having it in
 * two places is how the same session ends up described two different ways on two screens.
 *
 * Where it differs from the web, and why: the web's card opens a session-review OVERLAY. This one
 * expands in place. A modal review screen would be a second way to read a transcript the thread is
 * already showing, and on a phone the expand is both cheaper and more direct. Tapping still reveals
 * exactly the turns the card counted — see `IsVisibleRealtimeTurn`, which selects them.
 */

/** What the card renders. Mirrors the web card's inputs, plus the turns the expansion shows. */
export type MJRealtimeSessionCardProps = {
    /** The collapsed session block computed from the conversation's stamped rows. */
    Group: RealtimeSessionTimelineGroup;
    /** Session-row enrichment (agent name, status, close reason); null degrades to the plain label. */
    Meta: RealtimeSessionTimelineMeta | null;
    /** The session's visible turns, oldest first. */
    Turns: AdaptedMessage[];
    /** Display name used for the user's own turns, matching the thread's sender names. */
    UserName?: string;
};

/** Chip tone → its foreground and background. Live and error are the only ones that draw attention. */
const CHIP_TONE: Record<RealtimeSessionStatusChip['Tone'], { fg: string; bg: string }> = {
    live: { fg: Colors.positive, bg: Colors.positiveSoft },
    error: { fg: Colors.danger, bg: Colors.dangerSoft },
    idle: { fg: Colors.ink3, bg: Colors.surface2 },
    neutral: { fg: Colors.ink3, bg: Colors.surface2 },
};

/**
 * Renders a collapsed voice session, expandable in place to its transcript.
 *
 * @param Group The collapsed block.
 * @param Meta Session-row enrichment, or null when the lookup was unavailable.
 * @param Turns The session's visible turns, oldest first.
 * @param UserName Display name for the user's own turns.
 */
export function MJRealtimeSessionCard({ Group, Meta, Turns, UserName = 'You' }: MJRealtimeSessionCardProps) {
    const [expanded, setExpanded] = useState(false);
    const view = BuildRealtimeSessionCardView(Group, Meta, Turns.length, UserName);

    return (
        <View style={styles.card}>
            <Pressable
                style={styles.head}
                disabled={!view.CanExpand}
                accessibilityRole={view.CanExpand ? 'button' : undefined}
                accessibilityState={view.CanExpand ? { expanded } : undefined}
                accessibilityLabel={`${view.Title}, ${view.TurnLabel}`}
                onPress={() => setExpanded((v) => !v)}
            >
                <View style={styles.icon}>
                    <Icons.Broadcast size={16} color={Colors.brand} strokeWidth={2} />
                </View>

                <View style={styles.body}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title} numberOfLines={1}>{view.Title}</Text>
                        {view.Chip ? (
                            <View style={[styles.chip, { backgroundColor: CHIP_TONE[view.Chip.Tone].bg }]}>
                                <Text style={[styles.chipText, { color: CHIP_TONE[view.Chip.Tone].fg }]}>{view.Chip.Label}</Text>
                            </View>
                        ) : null}
                    </View>

                    <Text style={styles.meta} numberOfLines={1}>{view.MetaLine}</Text>

                    {/* The last thing said, so a collapsed card still tells you what the call was about. */}
                    {!expanded && view.Preview ? (
                        <Text style={styles.preview} numberOfLines={2}>
                            <Text style={styles.previewRole}>{view.Preview.Role}: </Text>
                            {view.Preview.Text}
                        </Text>
                    ) : null}
                </View>

                {view.CanExpand ? (
                    <View style={styles.chevron}>
                        {expanded
                            ? <Icons.ChevronUp size={18} color={Colors.ink3} strokeWidth={2} />
                            : <Icons.ChevronDown size={18} color={Colors.ink3} strokeWidth={2} />}
                    </View>
                ) : null}
            </Pressable>

            {expanded ? (
                <View style={styles.transcript}>
                    {Turns.map((turn) => (
                        <View key={turn.id} style={styles.turn}>
                            <Text style={styles.turnRole}>
                                {turn.kind === 'user' ? UserName : (turn.agent.name || 'Agent')}
                            </Text>
                            <Text style={styles.turnText}>
                                {turn.kind === 'user' ? turn.text : turn.body}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: 12,
        marginVertical: 8,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        overflow: 'hidden',
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 13 },
    icon: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: Colors.surface2,
        alignItems: 'center', justifyContent: 'center',
    },
    body: { flex: 1, gap: 3 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { flexShrink: 1, fontSize: 14, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
    chipText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
    meta: { fontSize: 12, color: Colors.ink3 },
    preview: { fontSize: 12.5, color: Colors.ink2, lineHeight: 18, marginTop: 2 },
    previewRole: { fontWeight: Type.semibold, color: Colors.ink3 },
    chevron: { paddingTop: 5 },

    transcript: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.line2,
        backgroundColor: Colors.surface2,
        paddingHorizontal: 13,
        paddingVertical: 10,
        gap: 10,
    },
    turn: { gap: 2 },
    turnRole: { fontSize: 11, fontWeight: '700', color: Colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase' },
    turnText: { fontSize: 13.5, color: Colors.ink, lineHeight: 19 },
});
