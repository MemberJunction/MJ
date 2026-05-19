import { router, useLocalSearchParams } from 'expo-router';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentAvatarStack } from '@/components/AgentAvatarStack';
import { Icons } from '@/components/Icon';
import { InlineArtifactCard } from '@/components/InlineArtifactCard';
import {
    getConversation,
    RECENT_CONVOS,
    type RecentConvoChip,
    type ThreadMessage,
    type Conversation,
} from '@/data/mock-thread';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Chat thread (hero) — multi-agent conversation with step indicators, inline
 * artifact cards, action chips, collapsed artifact-dock handle, and composer.
 *
 * Spec: plans/mobile-app-react-native/html/chat-thread.html
 */
export default function ChatThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const conv = getConversation(id);

    if (!conv) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <View style={styles.notFound}>
                    <Text style={styles.notFoundTitle}>Conversation not found</Text>
                    <Pressable onPress={() => router.replace('/conversations')}>
                        <Text style={styles.notFoundLink}>Back to conversations</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <ChatHeader conv={conv} />
            <RecentsStrip activeId={conv.id} />

            <ScrollView
                style={styles.thread}
                contentContainerStyle={styles.threadContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.dayDivider}>Today · 9:41 AM</Text>
                {conv.messages.map((msg) => (
                    <MessageRenderer key={msg.id} message={msg} />
                ))}
                <View style={{ height: 8 }} />
            </ScrollView>

            <ArtifactDockHandle conv={conv} />
            <Composer />
        </SafeAreaView>
    );
}

function ChatHeader({ conv }: { conv: Conversation }) {
    return (
        <View style={styles.header}>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.push('/conversations')}>
                <Icons.Menu size={22} color={Colors.ink} />
            </Pressable>
            <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} numberOfLines={1}>{conv.title}</Text>
                <View style={styles.headerSubrow}>
                    <AgentAvatarStack agents={conv.participants} size={16} borderColor={Colors.bg} />
                    <Text style={styles.headerSub}>
                        {conv.participants.length} agent{conv.participants.length > 1 ? 's' : ''} · {conv.messageCount} messages
                    </Text>
                    {conv.live ? <View style={styles.liveDot} /> : null}
                </View>
            </View>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.push('/new-conversation')}>
                <Icons.Plus size={22} color={Colors.ink} />
            </Pressable>
        </View>
    );
}

function RecentsStrip({ activeId }: { activeId: string }) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.recents}
            contentContainerStyle={styles.recentsContent}
        >
            {RECENT_CONVOS.map((chip) => {
                const active = chip.id === activeId;
                return (
                    <Pressable
                        key={chip.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => !active && router.replace({ pathname: '/chat/[id]', params: { id: chip.id } })}
                    >
                        {active && chip.live ? <View style={styles.chipPulse} /> : null}
                        <AgentAvatarStack
                            agents={chip.participants}
                            size={13}
                            borderColor={active ? Colors.ink : Colors.surface}
                        />
                        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                            {chip.title}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

function MessageRenderer({ message }: { message: ThreadMessage }) {
    if (message.kind === 'user') {
        return (
            <View style={styles.userMsgWrap}>
                <Text style={styles.userMsg}>{parseUserMessage(message.text)}</Text>
            </View>
        );
    }

    return (
        <View style={styles.agentMsg}>
            <View style={styles.agentLine}>
                <View style={[styles.agentAv, { backgroundColor: message.agent.color }]}>
                    <Text style={styles.agentAvText}>{message.agent.initial}</Text>
                </View>
                <Text style={styles.agentName}>{message.agent.name}</Text>
                <Text style={styles.agentMeta}>
                    · {message.durationMs ? `${(message.durationMs / 1000).toFixed(1)}s` : 'just now'}
                </Text>
            </View>

            {message.steps?.map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                    <View style={styles.stepTick}>
                        <Icons.ChevronRight size={9} color={Colors.positive} strokeWidth={3.5} />
                    </View>
                    <Text style={styles.stepText}>{step.label}</Text>
                </View>
            ))}

            <Text style={styles.msgBody}>{renderMarkdownInline(message.body)}</Text>

            {message.artifact ? <InlineArtifactCard artifact={message.artifact} /> : null}

            {message.actions && message.actions.length > 0 ? (
                <View style={styles.chips}>
                    {message.actions.map((action) => (
                        <Pressable key={action} style={styles.actionChip}>
                            <Text style={styles.actionChipText}>{action}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

/**
 * Minimal inline markdown for **bold**. Phase 1 placeholder until
 * markdown-core lands — see plan §4.3.
 */
function renderMarkdownInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <Text key={idx} style={styles.bold}>{part.slice(2, -2)}</Text>
            );
        }
        return part;
    });
}

/**
 * Bold any @mention tokens (e.g. "@research") inside user messages.
 */
function parseUserMessage(text: string): React.ReactNode {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('@')) {
            return <Text key={idx} style={styles.mention}>{part}</Text>;
        }
        return part;
    });
}

function ArtifactDockHandle({ conv }: { conv: Conversation }) {
    const count = conv.artifacts.length;
    if (count === 0) return null;

    return (
        <Pressable
            style={styles.dockHandle}
            onPress={() => router.push({ pathname: '/artifacts/[id]', params: { id: conv.id } })}
        >
            <View style={styles.dockIcon}>
                <Icons.Database size={13} color={Colors.brand} strokeWidth={2.2} />
            </View>
            <Text style={styles.dockText}>
                <Text style={styles.dockTextBold}>{count} artifacts</Text> in this conversation
            </Text>
            <View style={styles.dockDots}>
                {conv.artifacts.slice(0, 3).map((a, idx) => (
                    <View
                        key={a.id}
                        style={[styles.dockDot, idx > 0 && { marginLeft: -4 }, { backgroundColor: a.producedBy.color }]}
                    />
                ))}
            </View>
            <Icons.ChevronUp size={13} color={Colors.ink3} strokeWidth={2.5} />
        </Pressable>
    );
}

function Composer() {
    return (
        <View style={styles.composerWrap}>
            <View style={styles.composer}>
                <TextInput
                    placeholder="Reply or @mention an agent…"
                    placeholderTextColor={Colors.ink3}
                    style={styles.composerInput}
                    multiline
                />
                <Pressable style={styles.micBtn} onPress={() => router.push('/voice-mode')}>
                    <Icons.Mic size={18} color={Colors.inverse} strokeWidth={2.2} />
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    notFoundTitle: { fontSize: 18, fontWeight: Type.semibold, color: Colors.ink },
    notFoundLink: { fontSize: 14, color: Colors.brand, fontWeight: Type.semibold },

    header: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.line2,
        backgroundColor: 'rgba(250,250,247,0.92)',
    },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 220 },
    headerSubrow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    headerSub: { fontSize: 11, color: Colors.ink3 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ec4a3', marginLeft: 4 },

    recents: { maxHeight: 48 },
    recentsContent: {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 10,
        gap: 6,
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.line2,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 6,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: 999,
        maxWidth: 180,
    },
    chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    chipPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ec4a3' },
    chipText: { fontSize: 12.5, fontWeight: Type.medium, color: Colors.ink2 },
    chipTextActive: { color: Colors.inverse },

    thread: { flex: 1 },
    threadContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
    dayDivider: {
        textAlign: 'center',
        fontSize: 11,
        fontWeight: Type.semibold,
        letterSpacing: 1,
        color: Colors.ink3,
        marginVertical: 8,
        textTransform: 'uppercase',
    },

    userMsgWrap: { alignItems: 'flex-end', marginBottom: 16 },
    userMsg: {
        maxWidth: '86%',
        backgroundColor: Colors.userBg,
        paddingHorizontal: 15,
        paddingVertical: 11,
        borderRadius: 18,
        borderBottomRightRadius: 4,
        fontSize: 15.5,
        lineHeight: 22,
        color: Colors.ink,
    },
    mention: { fontWeight: Type.semibold, color: Colors.ink },

    agentMsg: { marginBottom: 18 },
    agentLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    agentAv: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    agentAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    agentName: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink },
    agentMeta: { fontSize: 11, fontWeight: Type.medium, color: Colors.ink3 },

    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    stepTick: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.positiveSoft, alignItems: 'center', justifyContent: 'center' },
    stepText: { fontSize: 12, fontWeight: Type.medium, color: Colors.ink3 },

    msgBody: { fontSize: 16, lineHeight: 25, color: Colors.ink, marginTop: 8 },
    bold: { fontWeight: Type.semibold },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    actionChip: {
        paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
    },
    actionChipText: { fontSize: 12.5, fontWeight: Type.medium, color: Colors.ink },

    dockHandle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 9,
        backgroundColor: 'rgba(250,250,247,0.92)',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.line2,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.line2,
    },
    dockIcon: {
        width: 22, height: 22, borderRadius: 6,
        backgroundColor: Colors.brandSoft,
        alignItems: 'center', justifyContent: 'center',
    },
    dockText: { flex: 1, fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    dockTextBold: { color: Colors.ink, fontWeight: Type.semibold },
    dockDots: { flexDirection: 'row' },
    dockDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.bg },

    composerWrap: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    composer: {
        backgroundColor: Colors.surface,
        borderRadius: 24,
        paddingLeft: 16,
        paddingRight: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        minHeight: 48,
        ...Shadow.card,
    },
    composerInput: { flex: 1, fontSize: 15.5, color: Colors.ink, paddingVertical: 9, maxHeight: 120 },
    micBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: Colors.brand,
        alignItems: 'center', justifyContent: 'center',
        marginVertical: 4,
    },
});
