import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
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
import { AttachmentChip } from '@/components/AttachmentChip';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import { Icons } from '@/components/Icon';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { adaptConversation, adaptConversationToSummary, type AdaptedAgentRef, type AdaptedMessage } from '@/data/adapt';
import { sendMessage, getConversationDetailStatus, type SendProgress } from '@/data/services/agents';
import { composeMessageWithAttachment, type CapturedAttachment } from '@/data/services/attachments';
import { useConversation, useConversations } from '@/hooks/useConversations';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Chat thread (hero screen) — a single MJ conversation with its agent(s).
 *
 * Route: `/chat/:id` (Expo Router dynamic segment, `app/chat/[id].tsx`); also
 *   accepts an optional `?autosend=<text>` query param.
 * Purpose: render one conversation's message list and a composer, drive the
 *   send -> agent-run -> reply loop, and surface artifacts.
 * Data:
 *   - `useConversation(id)` -> `{ data, loading, error, refresh }` (the thread's
 *     MJ `Conversations` + `Conversation Details` via RunView).
 *   - `useConversations()` -> the full list, used to build the recents strip and
 *     to refresh the list after a send.
 *   - `adaptConversation` / `adaptConversationToSummary` (`@/data/adapt`) shape
 *     raw entities into the view model.
 *   - `sendMessage` / `getConversationDetailStatus` (`@/data/services/agents`)
 *     post the user turn, run the agent, and poll the AI `Conversation Detail`
 *     status until it finalizes (the push WebSocket may not deliver completion
 *     on this client, so it polls up to 24× every 2.5s, refreshing as it goes).
 * Interactions: type + send a message (with optimistic pending bubble + live
 *   "Working…" progress), pull-to-refresh, tap a recents chip to switch threads,
 *   open the artifacts dock -> `/artifacts/[id]`, tap mic -> `/voice-mode`,
 *   `+` -> `/new-conversation`, menu -> `/conversations`. Deep-link `?autosend`
 *   fires the send once on open for QA/deep-links.
 * Mockup: `plans/mobile-app-react-native/html/chat-thread.html`.
 */
export default function ChatThreadScreen() {
    const { id, autosend } = useLocalSearchParams<{ id: string; autosend?: string }>();
    const { data, loading, error, refresh } = useConversation(id);
    const { conversations: allConversations, refresh: refreshList } = useConversations();

    const [sending, setSending] = useState(false);
    const [progress, setProgress] = useState<SendProgress | null>(null);
    const [pendingUserText, setPendingUserText] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    const view = useMemo(() => (data ? adaptConversation(data) : null), [data]);

    const handleSend = useCallback(async (text: string) => {
        if (!id || !text.trim()) return;
        setSending(true);
        setSendError(null);
        setPendingUserText(text.trim());
        setProgress({ currentStep: 'starting', message: 'Sending…' });
        try {
            const result = await sendMessage({
                conversationId: id,
                text: text.trim(),
                onProgress: (p) => setProgress(p),
            });
            // The user message + in-progress AI bubble now exist server-side; show them.
            setPendingUserText(null);
            await refresh();
            void refreshList();
            if (!result.success) {
                setSendError(result.errorMessage ?? 'Send failed.');
                return;
            }
            // The push WebSocket may not deliver completion on this client; poll the
            // AI response detail until it finalizes, refreshing the thread as it does.
            if (result.aiMessageId) {
                for (let i = 0; i < 24; i++) {
                    await new Promise((r) => setTimeout(r, 2500));
                    const status = await getConversationDetailStatus(result.aiMessageId).catch(() => null);
                    await refresh();
                    if (status && status !== 'In-Progress') {
                        if (status === 'Error') setSendError('The agent could not complete this request.');
                        break;
                    }
                }
                void refreshList();
            }
        } catch (e) {
            setSendError(e instanceof Error ? e.message : String(e));
        } finally {
            setSending(false);
            setProgress(null);
            setPendingUserText(null);
        }
    }, [id, refresh, refreshList]);

    // Optional deep-link auto-send: /chat/<id>?autosend=<text> sends once on open,
    // running the full send flow (working indicator + agent run + refresh). Useful for
    // deep links / QA without manual typing.
    const autoSentRef = useRef(false);
    useEffect(() => {
        if (autosend && !autoSentRef.current && view && !sending) {
            autoSentRef.current = true;
            void handleSend(autosend);
        }
    }, [autosend, view, sending, handleSend]);

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
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                <ChatHeader title={view.title} participants={view.participants} messageCount={view.messageCount} live={view.live || sending} />
                {recentChips.length > 0 ? <RecentsStrip activeId={view.id} chips={recentChips} /> : null}

                <ScrollView
                    ref={scrollRef}
                    style={styles.thread}
                    contentContainerStyle={styles.threadContent}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={Colors.brand} />}
                >
                    {view.messages.length === 0 && !pendingUserText ? (
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

                    {/* Optimistic pending user message while the agent runs */}
                    {pendingUserText ? (
                        <View style={styles.userMsgWrap}>
                            <Text style={[styles.userMsg, styles.userMsgPending]}>{pendingUserText}</Text>
                        </View>
                    ) : null}

                    {/* Live progress while the agent works */}
                    {sending ? (
                        <View style={styles.agentMsg}>
                            <View style={styles.agentLine}>
                                <View style={[styles.agentAv, { backgroundColor: Colors.brand }]}>
                                    <ActivityIndicator size="small" color={Colors.inverse} />
                                </View>
                                <Text style={styles.agentName}>Working…</Text>
                            </View>
                            {progress?.message ? <Text style={styles.progressText}>{progress.message}</Text> : null}
                        </View>
                    ) : null}

                    {sendError ? (
                        <View style={styles.sendErrorBox}>
                            <Text style={styles.sendErrorText}>{sendError}</Text>
                        </View>
                    ) : null}

                    <View style={{ height: 8 }} />
                </ScrollView>

                <ArtifactDockHandle conversationId={view.id} count={view.artifacts.length} />
                <Composer onSend={handleSend} disabled={sending} conversationId={view.id} />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

/**
 * Thread header bar: menu (-> `/conversations`), centered title with agent
 * avatar stack + participant/message counts + live dot, and `+`
 * (-> `/new-conversation`).
 */
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

/** A recents-strip chip = a conversation summary adapted for the horizontal rail. */
type RecentChip = ReturnType<typeof adaptConversationToSummary>;

/**
 * Horizontal strip of recent-conversation chips above the thread. Tapping a
 * non-active chip `replace`s the route to that conversation (`/chat/[id]`),
 * swapping threads without growing the back stack.
 */
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

/**
 * Renders one message: a right-aligned bubble for `user` messages (with
 * `@mention` highlighting), or an agent block with avatar/name/timing, a
 * {@link MarkdownView} body, an in-progress "Working…" indicator, and any
 * suggested-response chips.
 */
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
            <MarkdownView value={message.body} style={styles.msgBodyWrap} />
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

/** Splits user text on `@mention` tokens and wraps mentions in emphasized `<Text>`. */
function parseUserMessage(text: string): React.ReactNode {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('@')) return <Text key={idx} style={styles.mention}>{part}</Text>;
        return part;
    });
}

/**
 * Sticky "N artifacts in this conversation" handle above the composer. Renders
 * nothing when `count === 0`; otherwise navigates to the artifacts dock
 * (`/artifacts/[id]`) for this conversation.
 */
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

/**
 * Message composer: a multiline input that owns its own draft `text` state plus
 * an optional pending {@link CapturedAttachment}. A paperclip button opens the
 * {@link AttachmentPicker}; a chosen attachment shows a removable preview chip
 * above the input. Shows a send button when there's non-empty text OR a pending
 * attachment (clears the draft and calls `onSend`), otherwise a mic button that
 * opens `/voice-mode`. `disabled` blocks input/send while an agent run is in flight.
 *
 * On send, the attachment is folded into the message via
 * {@link composeMessageWithAttachment} — the documented inline-note fallback,
 * since there is no mobile byte-upload pipeline yet (see `attachments.ts`).
 */
function Composer({ onSend, disabled, conversationId }: { onSend: (text: string) => void; disabled: boolean; conversationId: string }) {
    const [text, setText] = useState('');
    const [attachment, setAttachment] = useState<CapturedAttachment | null>(null);
    const [pickerVisible, setPickerVisible] = useState(false);
    const canSend = (text.trim().length > 0 || attachment != null) && !disabled;

    const submit = () => {
        if (!canSend) return;
        const body = composeMessageWithAttachment(text, attachment);
        setText('');
        setAttachment(null);
        onSend(body);
    };

    return (
        <View style={styles.composerWrap}>
            {attachment ? (
                <View style={styles.attachRow}>
                    <AttachmentChip attachment={attachment} onRemove={() => setAttachment(null)} />
                </View>
            ) : null}
            <View style={styles.composer}>
                <Pressable style={styles.attachBtn} onPress={() => setPickerVisible(true)} disabled={disabled} hitSlop={6}>
                    <Icons.Paperclip size={20} color={Colors.ink3} strokeWidth={2} />
                </Pressable>
                <TextInput
                    placeholder="Reply or @mention an agent…"
                    placeholderTextColor={Colors.ink3}
                    style={styles.composerInput}
                    multiline
                    value={text}
                    onChangeText={setText}
                    editable={!disabled}
                />
                {canSend ? (
                    <Pressable style={styles.sendBtn} onPress={submit}>
                        <Icons.Send size={18} color={Colors.inverse} strokeWidth={2.2} />
                    </Pressable>
                ) : (
                    <Pressable style={styles.micBtn} onPress={() => router.push({ pathname: '/voice-mode', params: { conversationId } })} disabled={disabled}>
                        <Icons.Mic size={18} color={Colors.inverse} strokeWidth={2.2} />
                    </Pressable>
                )}
            </View>
            <AttachmentPicker
                visible={pickerVisible}
                onClose={() => setPickerVisible(false)}
                onPicked={(a) => setAttachment(a)}
            />
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
    userMsgPending: { opacity: 0.55 },
    mention: { fontWeight: Type.semibold, color: Colors.ink },
    progressText: { fontSize: 13, color: Colors.ink3, marginTop: 2, fontStyle: 'italic' },
    sendErrorBox: { backgroundColor: Colors.dangerSoft, borderRadius: Radius.lg, padding: 12, marginTop: 4, marginBottom: 8 },
    sendErrorText: { fontSize: 13, color: Colors.danger, lineHeight: 18 },

    agentMsg: { marginBottom: 18 },
    agentLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    agentAv: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    agentAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    agentName: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink },
    agentMeta: { fontSize: 11, fontWeight: Type.medium, color: Colors.ink3 },

    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, marginTop: 4 },
    stepText: { fontSize: 12, fontWeight: Type.medium, color: Colors.ink3 },

    msgBodyWrap: { marginTop: 8 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    actionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    actionChipText: { fontSize: 12.5, fontWeight: Type.medium, color: Colors.ink },

    dockHandle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: 'rgba(250,250,247,0.92)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    dockIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    dockText: { flex: 1, fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    dockTextBold: { color: Colors.ink, fontWeight: Type.semibold },

    composerWrap: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    attachRow: { paddingBottom: 8 },
    composer: { backgroundColor: Colors.surface, borderRadius: 24, paddingLeft: 8, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, minHeight: 48, ...Shadow.card },
    attachBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    composerInput: { flex: 1, fontSize: 15.5, color: Colors.ink, paddingVertical: 9, maxHeight: 120 },
    micBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
    sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
});
