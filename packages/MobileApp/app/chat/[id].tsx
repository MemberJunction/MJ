import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
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
import { AdaptConversation, AdaptConversationToSummary, type AdaptedAgentRef, type AdaptedMessage } from '@/data/adapt';
import { SendMessage, GetConversationDetailStatus, type SendProgress } from '@/data/services/agents';
import { AttachCapturedFile, ComposeMessageWithAttachment, type CapturedAttachment } from '@/data/services/attachments';
import { GetDefaultAgentId } from '@/data/preferences';
import { MentionsToPlainText } from '@/data/mention-display';
import { MJRealtimeSessionCard } from '@/chat/realtime/RealtimeSessionCard';
import { FindActiveTrigger, ApplyMention, MentionedAgentId, SerializeDraft, type InsertedMention } from '@/chat/mentions/trigger';
import { MentionSuggestions } from '@/chat/mentions/MentionSuggestions';
import { MJComposer } from '@/chat/composer/MJComposer';
import { GlobalNav } from '@/components/GlobalNav';
import { useConversation, useConversations } from '@/hooks/useConversations';
import { ChatColors, Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * How long to keep the composer blocked on an agent run before releasing the UI.
 *
 * Generous on purpose: a real run that takes this long is unusual, and interrupting one early
 * would be worse than waiting. This is a recovery path, not a timeout policy — the run itself is
 * never cancelled.
 */
const AGENT_RUN_WATCHDOG_MS = 90_000;

/** Resolves after `ms`. */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


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
 *   - `AdaptConversation` / `AdaptConversationToSummary` (`@/data/adapt`) shape
 *     raw entities into the view model.
 *   - `SendMessage` / `GetConversationDetailStatus` (`@/data/services/agents`)
 *     post the user turn and run the agent. `SendMessage` resolves only once the
 *     run has completed, so the AI `Conversation Detail` status is read once
 *     afterwards rather than polled.
 * Interactions: type + send a message (with optimistic pending bubble + live
 *   "Working…" progress), pull-to-refresh, tap a recents chip to switch threads,
 *   open the artifacts dock -> `/artifacts/[id]`, tap mic -> `/voice-mode`,
 *   `+` -> `/new-conversation`, menu -> `/conversations`. Deep-link `?autosend`
 *   fires the send once on open for QA/deep-links.
 * Mockup: `plans/mobile-app-react-native/html/chat-thread.html`.
 */
export default function ChatThreadScreen() {
    const { id, autosend, autosendAttachment } = useLocalSearchParams<{ id: string; autosend?: string; autosendAttachment?: string }>();
    const { data, loading, error, refresh } = useConversation(id);
    const { conversations: allConversations, refresh: refreshList } = useConversations();

    const [sending, setSending] = useState(false);
    const [stalled, setStalled] = useState(false);
    const [navOpen, setNavOpen] = useState(false);
    const [progress, setProgress] = useState<SendProgress | null>(null);
    const [pendingUserText, setPendingUserText] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    const view = useMemo(() => (data ? AdaptConversation(data) : null), [data]);

    const handleSend = useCallback(async (text: string, attachment: CapturedAttachment | null = null) => {
        if (!id || !text.trim()) return;
        setSending(true);
        setSendError(null);
        setStalled(false);
        setPendingUserText(text.trim());
        setProgress({ currentStep: 'starting', message: 'Sending…' });
        try {
            let attachmentWarning: string | null = null;
            const send = SendMessage({
                conversationId: id,
                text: text.trim(),
                // The Profile screen's default-agent picker was write-only: it stored a choice
                // that nothing ever read, so every message went to the runtime's own default
                // regardless. Passing it as the explicit agent is what makes that setting mean
                // something. Unset leaves resolution to the runtime's chain.
                agentId: GetDefaultAgentId(),
                onProgress: (p) => setProgress(p),
                // Uploads the file in the window between the user's row existing and the agent
                // reading it. It has to be this exact window: earlier and there is no row to hang
                // the attachment off, later and the agent has already answered a message it could
                // not see the attachment on. A failed upload degrades to a warning rather than
                // failing the turn — the text is worth sending either way.
                onUserMessageSaved: attachment
                    ? async (userMessageId) => {
                          const stored = await AttachCapturedFile(attachment, userMessageId);
                          if (!stored.ok) {
                              attachmentWarning = `The message sent, but the attachment did not: ${stored.message}`;
                          }
                      }
                    : undefined,
            });

            // `SendMessage` resolves only when the agent run finishes, which is what lets this
            // screen show a real reply rather than a placeholder. The failure mode is the app being
            // backgrounded, or the status socket dropping: the promise then never settles, and the
            // composer stays disabled behind a bubble that spins for the rest of the session.
            //
            // The run does not need this screen — it is server-side and keeps going — so on a
            // timeout the UI is released and told to refresh, rather than the turn being cancelled.
            const outcome = await Promise.race([
                send.then((r) => ({ kind: 'done' as const, r })),
                delay(AGENT_RUN_WATCHDOG_MS).then(() => ({ kind: 'stalled' as const })),
            ]);

            if (outcome.kind === 'stalled') {
                setStalled(true);
                setPendingUserText(null);
                await refresh();
                void refreshList();
                // Fold the eventual result back in whenever it lands, so a slow-but-successful run
                // still updates the thread without the user doing anything.
                void send
                    .then(async () => {
                        setStalled(false);
                        await refresh();
                        void refreshList();
                    })
                    .catch(() => setStalled(false));
                return;
            }

            const result = outcome.r;
            if (attachmentWarning) setSendError(attachmentWarning);
            // The user message + in-progress AI bubble now exist server-side; show them.
            setPendingUserText(null);
            await refresh();
            void refreshList();
            if (!result.success) {
                setSendError(result.errorMessage ?? 'Send failed.');
                return;
            }
            // `processMessage` resolves only once the run has completed — the fire-and-forget
            // helper awaits the push-status WebSocket, which delivers reliably on this client
            // under Expo SDK 54 (verified: "Completion event received"). The 2.5s x 24 polling
            // loop this replaces existed because that WebSocket used to be unreliable here.
            if (result.aiMessageId) {
                const status = await GetConversationDetailStatus(result.aiMessageId).catch(() => null);
                if (status === 'Error') setSendError('The agent could not complete this request.');
                await refresh();
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
            // A first message started from the new-conversation screen may carry an attachment.
            // Parsing is tolerant: a malformed descriptor costs the attachment, never the message.
            let firstAttachment: CapturedAttachment | null = null;
            if (autosendAttachment) {
                try {
                    firstAttachment = JSON.parse(autosendAttachment) as CapturedAttachment;
                } catch {
                    firstAttachment = null;
                }
            }
            void handleSend(autosend, firstAttachment);
        }
    }, [autosend, autosendAttachment, view, sending, handleSend]);

    // Recents strip = top 5 most recent conversations excluding the active one
    const recentChips = useMemo(() => {
        if (!allConversations) return [];
        const summaries = allConversations.map(AdaptConversationToSummary);
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
            {/*
              * `padding` on BOTH platforms, deliberately. The usual advice is `undefined` on
              * Android because `windowSoftInputMode="adjustResize"` resizes the window for you —
              * but this app runs edge-to-edge (`edgeToEdgeEnabled=true`, the Expo SDK 54 default),
              * and under edge-to-edge the window is NOT resized: the app draws behind the keyboard.
              * With `undefined` the composer and its suggestion list sat under the keyboard,
              * unreachable, on every Android device.
              */}
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior="padding"
                keyboardVerticalOffset={0}
            >
                <ChatHeader title={view.title} participants={view.participants} messageCount={view.messageCount} live={view.live || sending} onOpenNav={() => setNavOpen(true)} />
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
                            {/*
                              * The TIMELINE, not the flat message list. Voice turns are ordinary
                              * `MJ: Conversation Detail` rows stamped with an `AgentSessionID`, so
                              * rendering them flat buried the typed conversation under a whole
                              * call. `BuildThreadTimeline` collapses each session into one card at
                              * the position of its first turn — the same grouping pass the web
                              * message list runs.
                              */}
                            {view.timeline.map((item) =>
                                item.kind === 'message' ? (
                                    <MessageRenderer key={item.message.id} message={item.message} />
                                ) : (
                                    <MJRealtimeSessionCard
                                        key={`session:${item.group.SessionID}`}
                                        Group={item.group}
                                        Meta={item.meta}
                                        Turns={item.turns}
                                    />
                                ),
                            )}
                        </>
                    )}

                    {/* Optimistic pending user message while the agent runs */}
                    {pendingUserText ? (
                        <View style={styles.userMsgWrap}>
                            <Text style={[styles.userMsg, styles.userMsgPending]}>{MentionsToPlainText(pendingUserText)}</Text>
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

                    {stalled ? (
                        <View style={styles.stalledBox}>
                            <Text style={styles.stalledText}>
                                This is taking longer than usual. The agent is still working — pull down to refresh,
                                or leave and come back; the reply will be here.
                            </Text>
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
                <MJComposer OnSend={handleSend} Disabled={sending} ConversationID={view.id} />
            </KeyboardAvoidingView>
            <GlobalNav Visible={navOpen} OnClose={() => setNavOpen(false)} />
        </SafeAreaView>
    );
}

/**
 * Thread header bar: menu (-> `/conversations`), centered title with agent
 * avatar stack + participant/message counts + live dot, and `+`
 * (-> `/new-conversation`).
 */
function ChatHeader({ title, participants, messageCount, live, onOpenNav }: {
    title: string;
    participants: AdaptedAgentRef[];
    messageCount: number;
    live: boolean;
    /** Opens the global navigation sheet — the only route to Apps, Explorer and Profile from here. */
    onOpenNav: () => void;
}) {
    return (
        <View style={styles.header}>
            <Pressable
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Navigate"
                onPress={onOpenNav}
            >
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
type RecentChip = ReturnType<typeof AdaptConversationToSummary>;

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

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    notFoundTitle: { fontSize: 18, fontWeight: Type.semibold, color: Colors.ink },
    notFoundError: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    notFoundLink: { fontSize: 14, color: Colors.brand, fontWeight: Type.semibold },

    header: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2, backgroundColor: Colors.bg },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1, maxWidth: 220 },
    headerSubrow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    headerSub: { fontSize: 11, color: Colors.ink3 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.positive, marginLeft: 4 },

    recents: { maxHeight: 48 },
    recentsContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, gap: 6, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 999, maxWidth: 180 },
    chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    chipPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.positive },
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
    // Informational, not an error: the run did not fail, this screen simply stopped waiting on it.
    stalledBox: { marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    stalledText: { fontSize: 13, lineHeight: 19, color: Colors.ink2 },
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

    dockHandle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    dockIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    dockText: { flex: 1, fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },
    dockTextBold: { color: Colors.ink, fontWeight: Type.semibold },

    composerActions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingBottom: 8, paddingTop: 2 },
    actionBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    sendBtnDisabled: { backgroundColor: Colors.line2 },
    composerWrap: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    attachRow: { paddingBottom: 8 },
    // Explorer's composer is a plain bordered box, not a pill: `--mj-chat-composer-bg` on a 1px
    // `--mj-chat-composer-border` hairline with `--mj-radius-lg` corners, and no shadow.
    composer: { backgroundColor: ChatColors.composerBg, borderRadius: Radius.composer, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderWidth: 1, borderColor: ChatColors.composerBorder, minHeight: 56 },
    attachBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    composerInput: { flex: 1, fontSize: 15.5, color: Colors.ink, paddingVertical: 9, maxHeight: 120 },
    micBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
    sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
});
