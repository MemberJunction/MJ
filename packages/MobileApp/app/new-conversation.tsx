import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator, KeyboardAvoidingView, Pressable,
    ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MJChatEmptyStateDefault } from '@/chat/slots/defaults';
import { MentionsToPlainText } from '@/data/mention-display';
import { MJComposer } from '@/chat/composer/MJComposer';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import { Icons } from '@/components/Icon';
import { useAgents } from '@/hooks/useAgents';
import { CreateConversation } from '@/data/services/agents';
import { ComposeMessageWithAttachment, type CapturedAttachment } from '@/data/services/attachments';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/** A starter-prompt card: display `title`, the full `prompt` it inserts, plus icon/color. */
type Suggestion = { title: string; prompt: string; color: string; icon: React.ReactNode };

/** Static starter prompts shown under "Start a conversation about…"; tapping one fills the composer. */
const SUGGESTIONS: Suggestion[] = [
    { title: "Today's pipeline", prompt: 'What does my pipeline look like today? Show open deals, owners, and what changed.', color: Colors.brand, icon: <Icons.Sparkle size={16} color={Colors.inverse} strokeWidth={2.2} /> },
    { title: "What's on my plate?", prompt: 'What are my open tasks, approvals, and follow-ups right now?', color: Colors.positive, icon: <Icons.Sliders size={16} color={Colors.inverse} strokeWidth={2.2} /> },
    { title: 'Look up a contact', prompt: 'Help me find a contact and see their recent activity.', color: Colors.agentAnalyst, icon: <Icons.Search size={16} color={Colors.inverse} strokeWidth={2.2} /> },
    { title: 'Research an account', prompt: 'Research an account — recent news, signals, and risks.', color: Colors.agentResearch, icon: <Icons.Database size={16} color={Colors.inverse} strokeWidth={2.2} /> },
];

/**
 * New conversation composer — the "start a chat" launcher.
 *
 * Route: `/new-conversation` (Expo Router, `app/new-conversation.tsx`).
 * Purpose: let the user compose their first message (free-form, a starter
 *   prompt, or an `@agent`-addressed prompt), create the MJ conversation, then
 *   hand off to the chat thread which actually runs the send.
 * Data: `useAgents()` (available agents for the `@mention` rail, MJ `AI Agents`);
 *   `CreateConversation(title)` (`@/data/services/agents`) creates the
 *   `Conversations` record — the title is derived from the first ~6 words of the
 *   message.
 * Interactions: type a message and Send; tap a suggestion to prefill; tap an
 *   agent pill to prepend `@AgentName`; mic -> `/voice-mode`. On create it
 *   `router.replace`s to `/chat/[id]?autosend=<text>` so the first message gets
 *   the same working-indicator + reply-polling UX as in-thread sends.
 * Mockup: `plans/mobile-app-react-native/html/new-conversation.html`.
 */
/**
 * Starter prompts, in the `Title — description` shape the empty state splits on.
 *
 * Deliberately the same FOUR the web offers, phrased the same way, so the first thing a user sees
 * is the first thing they saw on the desktop.
 */
const STARTER_PROMPTS = [
    'Search files — Search my files and documents for related information',
    'Search everything — Search everything in my system across all sources',
    'Research compiler — Create an agent to research a topic end to end',
    'Data quality — Analyze my data and find gaps or inconsistencies',
];

export default function NewConversationScreen() {
    const { agents } = useAgents();
    const [text, setText] = useState('');
    const [attachment, setAttachment] = useState<CapturedAttachment | null>(null);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSend = (text.trim().length > 0 || attachment != null) && !busy;

    /**
     * Creates the conversation and hands the first message to the thread.
     *
     * The composer has already composed the body (including any attachment note) and serialized
     * its mentions, so this takes the finished string rather than reaching into composer state —
     * which is what lets the two screens share one composer.
     */
    const submit = async (body: string, attached: CapturedAttachment | null = null) => {
        if (!body.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
            // Title from the first ~6 words of the prompt — of the READABLE prompt. `body` is the
            // wire format, so a message that opens with a mention would otherwise name the
            // conversation `@{"type":"agent","id":"55…` and show that in the thread header and the
            // conversation list. Same conversion the thread applies to message text.
            const title = MentionsToPlainText(body).split(/\s+/).slice(0, 6).join(' ');
            const conv = await CreateConversation(title);
            if (!conv) {
                setError('Could not create the conversation.');
                return;
            }
            // Navigate into the thread and let it run the send — the thread shows the
            // "agent working" indicator and polls for the reply. Passing the message via
            // ?autosend gives the first message the same progress UX as in-thread sends.
            router.replace({
                pathname: '/chat/[id]',
                params: {
                    id: conv.id,
                    autosend: body,
                    // Serialized because route params are strings. Only the small descriptor
                    // travels — the bytes stay on disk at `uri` until the thread uploads them.
                    ...(attached ? { autosendAttachment: JSON.stringify(attached) } : {}),
                },
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                <View style={styles.header}>
                    <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                        <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                    </Pressable>
                    <Text style={styles.title}>New conversation</Text>
                    <View style={styles.iconBtn} />
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/*
                      * The SAME empty state the chat thread renders, so starting a conversation
                      * looks identical wherever you start it — and so a host that replaces the
                      * `emptyState` slot changes both.
                      */}
                    <MJChatEmptyStateDefault
                        Greeting="Welcome to Conversations"
                        Subtext="Start a new conversation by typing a message below, or choose a suggested prompt to get started."
                        SuggestedPrompts={STARTER_PROMPTS}
                        OnPromptSelected={(p) => void submit(p)}
                    />
                </ScrollView>

                {/*
                  * The SAME composer the chat thread uses. This screen previously had its own plain
                  * TextInput — under copy that told the user to "address a specific agent with @",
                  * which did nothing here because the triggers lived only in the other copy.
                  */}
                <MJComposer
                    OnSend={(body, att) => void submit(body, att)}
                    Disabled={busy}
                    Placeholder="Ask anything — your agent will route it…"
                />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
    content: { paddingBottom: 24 },

    heroBlock: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8, alignItems: 'center' },
    heroTitle: { fontSize: 26, fontWeight: Type.bold, color: Colors.ink, letterSpacing: -0.5, textAlign: 'center', lineHeight: 31 },
    heroCopy: { fontSize: 14.5, color: Colors.ink2, lineHeight: 21, marginTop: 8, textAlign: 'center' },
    bold: { fontWeight: Type.semibold, color: Colors.ink },

    composerCard: { marginHorizontal: 18, marginTop: 22, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, padding: 14, ...Shadow.card },
    composerInput: { minHeight: 56, fontSize: 15.5, color: Colors.ink },
    attachRow: { marginTop: 8 },
    attachBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
    composerFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    composerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    micBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    sendBtn: { marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 76, justifyContent: 'center' },
    sendBtnMuted: { backgroundColor: Colors.surface2 },
    sendBtnActive: { backgroundColor: Colors.brand },
    sendBtnText: { fontSize: 13.5, fontWeight: Type.semibold, color: Colors.ink3 },
    sendBtnTextActive: { color: Colors.inverse },
    errorText: { color: Colors.danger, fontSize: 13, paddingHorizontal: 22, paddingTop: 10 },

    sectionLabel: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8, fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.4, textTransform: 'uppercase' },

    suggestions: { paddingHorizontal: 14, gap: 8 },
    sug: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.card },
    sugIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sugBody: { flex: 1 },
    sugTitle: { fontSize: 14, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    sugSub: { fontSize: 12, color: Colors.ink3, marginTop: 2 },

    agentRail: { paddingHorizontal: 14, paddingVertical: 4, flexDirection: 'row', gap: 8 },
    agentPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 8, paddingRight: 13, paddingVertical: 8, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 999 },
    agentPillAv: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    agentPillAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    agentPillName: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink },
});
