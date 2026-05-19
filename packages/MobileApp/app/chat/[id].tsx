import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentAvatarStack } from '@/components/AgentAvatarStack';
import { Icons } from '@/components/Icon';
import { adaptConversation, adaptConversationToSummary, type AdaptedAgentRef, type AdaptedMessage } from '@/data/adapt';
import { useConversation, useConversations } from '@/hooks/useConversations';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Chat thread (hero) — real MJ conversation rendered from RunView.
 * Spec: plans/mobile-app-react-native/html/chat-thread.html
 */
export default function ChatThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data, loading, error, refresh } = useConversation(id);
    const { conversations: allConversations } = useConversations();

    const view = useMemo(() => (data ? adaptConversation(data) : null), [data]);

    // Recents strip = top 5 most recent conversations excluding the active one
    const recentChips = useMemo(() => {
        if (!allConversations) return [];
        const summaries = allConversations.map(adaptConversationToSummary);
        return summaries
            .filter((s) => s.id !== id)
            .slice(0, 5);
    }, [allConversations, id]);

    if (!view) {
        const stillLoading = loading;
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <View style={styles.notFound}>
                    {stillLoading ? (
                        <>
                            <ActivityIndicator color={Colors.brand} />
                            <Text style={styles.notFoundTitle}>Loading conversation…</Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.notFoundTitle}>Conversation not found</Text>
                            {error ? <Text style={styles.notFoundError}>{error.message}</Text> : null}
                            <Pressable onPress={() => router.replace('/conversations')}>
                                <Text style={styles.notFoundLink}>Back to conversations</Text>
                            </Pressable>
                        </>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <ChatHeader title={view.title} participants={view.participants} messageCount={view.messageCount} live={view.live} />
            {recentChips.length > 0 ? <RecentsStrip activeId={view.id} chips={recentChips} /> : null}

            <ScrollView
                style={styles.thread}
                contentContainerStyle={styles.threadContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={Colors.brand} />}
            >
                {view.messages.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>No messages yet</Text>
                        <Text style={styles.emptyBody}>Start the conversation below.</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.dayDivider}>Conversation</Text>
                        {view.messages.map((msg) => <MessageRenderer key={msg.id} message={msg} />)}
                    </>
                )}
                <View style={{ height: 8 }} />
            </ScrollView>

            <ArtifactDockHandle conversationId={view.id} count={view.artifacts.length} />
            <Composer />
        </SafeAreaView>
    );
}

function ChatHeader({ title, participants, messageCount, live }: {
    title: string;
    participants: AdaptedAgentRef[];
    messageCount: number;
    live: boolean;
}) {
    return (
        <View style={styles.header}>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.push('/conversations')}>
                <Icons.Menu size={22} color={Colors.ink} />
            </Pressable>
            <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
                <View style={styles.headerSubrow}>
                    {participants.length > 0 ? (
                        <AgentAvatarStack agents={participants} size={16} borderColor={Colors.bg} />
                    ) : null}
                    <Text style={styles.headerSub}>
                        {participants.length > 0
                            ? `${participants.length} agent${participants.length > 1 ? 's' : ''}`
                            : 'No agent yet'} · {messageCount} message{messageCount === 1 ? '' : 's'}
                    </Text>
                    {live ? <View style={styles.liveDot} /> : null}
                </View>
            </View>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.push('/new-conversation')}>
                <Icons.Plus size={22} color={Colors.ink} />
            </Pressable>
        </View>
    );
}

type RecentChip = ReturnType<typeof adaptConversationToSummary>;

function RecentsStrip({ activeId, chips }: { activeId: string; chips: RecentChip[] }) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.recents}
            contentContainerStyle={styles.recentsContent}
        >
            {chips.map((chip) => {
                const active = chip.id === activeId;
                return (
                    <Pressable
                        key={chip.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => !active && router.replace({ pathname: '/chat/[id]', params: { id: chip.id } })}
                    >
                        {active && chip.live ? <View style={styles.chipPulse} /> : null}
                        <AgentAvatarStack
                            agents={chip.agents}
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

function MessageRenderer({ message }: { message: AdaptedMessage }) {
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
                    · {message.completionMs ? `${(message.completionMs / 1000).toFixed(1)}s` : message.status}
                </Text>
            </View>
            <Text style={styles.msgBody}>{renderMarkdownInline(message.body)}</Text>
            {message.status === 'In-Progress' ? (
                <View style={styles.stepRow}>
                    <ActivityIndicator size="small" color={Colors.brand} />
                    <Text style={styles.stepText}>Working…</Text>
                </View>
            ) : null}
            {message.suggestedResponses.length > 0 ? (
                <View style={styles.chips}>
                    {message.suggestedResponses.map((action) => (
                        <Pressable key={action} style={styles.actionChip}>
                            <Text style={styles.actionChipText}>{action}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

function renderMarkdownInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <Text key={idx} style={styles.bold}>{part.slice(2, -2)}</Text>;
        }
        return part;
    });
}

function parseUserMessage(text: string): React.ReactNode {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('@')) return <Text key={idx} style={styles.mention}>{part}</Text>;
        return part;
    });
}

function ArtifactDockHandle({ conversationId, count }: { conversationId: string; count: number }) {
    if (count === 0) return null;
    return (
        <Pressable
            style={styles.dockHandle}
            onPress={() => router.push({ pathname: '/artifacts/[id]', params: { id: conversationId } })}
        >
            <View style={styles.dockIcon}>
                <Icons.Database size={13} color={Colors.brand} strokeWidth={2.2} />
            </View>
            <Text style={styles.dockText}>
                <Text style={styles.dockTextBold}>{count} artifact{count === 1 ? '' : 's'}</Text> in this conversation
            </Text>
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
    notFoundError: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    notFoundLink: { fontSize: 14, color: Colors.brand, fontWeight: Type.semibold },

    header: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2, backgroundColor: 'rgba(250,250,247,0.92)' },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 220 },
    headerSubrow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    headerSub: { fontSize: 11, color: Colors.ink3 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ec4a3', marginLeft: 4 },

    recents: { maxHeight: 48 },
    recentsContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, gap: 6, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 999, maxWidth: 180 },
    chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    chipPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ec4a3' },
    chipText: { fontSize: 12.5, fontWeight: Type.medium, color: Colors.ink2 },
    chipTextActive: { color: Colors.inverse },

    thread: { flex: 1 },
    threadContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
    dayDivider: { textAlign: 'center', fontSize: 11, fontWeight: Type.semibold, letterSpacing: 1, color: Colors.ink3, marginVertical: 8, textTransform: 'uppercase' },
    empty: { paddingVertical: 80, paddingHorizontal: 32, alignItems: 'center', gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink },
    emptyBody: { fontSize: 13.5, color: Colors.ink3, textAlign: 'center' },

    userMsgWrap: { alignItems: 'flex-end', marginBottom: 16 },
    userMsg: { maxWidth: '86%', backgroundColor: Colors.userBg, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18, borderBottomRightRadius: 4, fontSize: 15.5, lineHeight: 22, color: Colors.ink },
    mention: { fontWeight: Type.semibold, color: Colors.ink },

    agentMsg: { marginBottom: 18 },
    agentLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    agentAv: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    agentAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    agentName: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink },
    agentMeta: { fontSize: 11, fontWeight: Type.medium, color: Colors.ink3 },

    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, marginTop: 4 },
    stepText: { fontSize: 12, fontWeight: Type.medium, color: Colors.ink3 },

    msgBody: { fontSize: 16, lineHeight: 25, color: Colors.ink, marginTop: 8 },
    bold: { fontWeight: Type.semibold },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    actionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    actionChipText: { fontSize: 12.5, fontWeight: Type.medium, color: Colors.ink },

    dockHandle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: 'rgba(250,250,247,0.92)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    dockIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    dockText: { flex: 1, fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    dockTextBold: { color: Colors.ink, fontWeight: Type.semibold },

    composerWrap: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    composer: { backgroundColor: Colors.surface, borderRadius: 24, paddingLeft: 16, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, minHeight: 48, ...Shadow.card },
    composerInput: { flex: 1, fontSize: 15.5, color: Colors.ink, paddingVertical: 9, maxHeight: 120 },
    micBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
});
