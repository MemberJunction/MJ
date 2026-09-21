import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icons } from '@/components/Icon';
import { AttachmentChip } from '@/components/AttachmentChip';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import { ComposeMessageWithAttachment, type CapturedAttachment } from '@/data/services/attachments';
import { GetDefaultAgentId } from '@/data/preferences';
import { ChatColors, Colors, Radius, Type } from '@/theme/tokens';
import {
    FindActiveTrigger,
    ApplyMention,
    MentionedAgentId,
    SerializeDraft,
    type InsertedMention,
    type MentionTriggerChar,
} from '../mentions/trigger';
import type { MentionSuggestion } from '@memberjunction/conversations-runtime';
import { MentionSuggestions } from '../mentions/MentionSuggestions';
import { ChipText } from '../mentions/ChipText';
import {
    ResolveEnterAction,
    ShiftFromKeyEvent,
    useHardwareKeyboard,
    type EnterPolicy,
} from './enter-key';

/**
 * @fileoverview The one message composer, shared by every surface that sends a message.
 *
 * It was duplicated: the chat thread had the full version with `@` / `#` / `/` triggers and mention
 * chips, while the new-conversation screen had a plain `TextInput` copy — under a line of copy that
 * read "Address a specific agent with @", which did nothing there. Two composers is how a surface
 * ends up advertising a feature it does not have.
 */

/** What a host can configure. Feature switches mirror the Angular composer's inputs by name. */
export type MJComposerProps = {
    /** Called with the composed body and any pending attachment. */
    OnSend: (text: string, attachment: CapturedAttachment | null) => void;
    /** Disables input and sending — e.g. while a turn is in flight. */
    Disabled?: boolean;
    /** Conversation the voice launcher should join, when there is one. */
    ConversationID?: string;
    /** Placeholder copy. */
    Placeholder?: string;
    /** Enable `@` agent/people mentions. */
    EnableMentions?: boolean;
    /** Enable `#` record/query mentions. */
    EnableEntityMentions?: boolean;
    /** Enable `/` skill commands. */
    EnableSkillCommands?: boolean;
    /** Show the attachment button. */
    EnableAttachments?: boolean;
    /** Show the voice-call launcher. */
    EnableRealtime?: boolean;
    /**
     * When Return sends instead of inserting a newline. Defaults to `hardware-keyboard`, which
     * matches the desktop composer wherever a real keyboard is attached without stranding a
     * soft-keyboard user who has no Shift+Enter to fall back on. See `enter-key.ts`.
     */
    SubmitOnEnter?: EnterPolicy;
};

/**
 * Message composer: a multiline input that owns its own draft `text` state plus
 * an optional pending {@link CapturedAttachment}. A paperclip button opens the
 * {@link AttachmentPicker}; a chosen attachment shows a removable preview chip
 * above the input. Shows a send button when there's non-empty text OR a pending
 * attachment (clears the draft and calls `onSend`), otherwise a mic button that
 * opens `/voice-mode`. `disabled` blocks input/send while an agent run is in flight.
 *
 * On send, the attachment travels two ways: {@link ComposeMessageWithAttachment} adds a
 * human-readable note to the message text, and the attachment itself is handed to the
 * parent so it can be uploaded and attached to the created message as a first-class
 * `MJ: Conversation Detail Attachments` row once that message exists.
 */
export function MJComposer({
    OnSend,
    Disabled = false,
    ConversationID,
    Placeholder = 'Reply, @mention an agent, or / for a skill…',
    EnableMentions = true,
    EnableEntityMentions = true,
    EnableSkillCommands = true,
    EnableAttachments = true,
    EnableRealtime = true,
    SubmitOnEnter = 'hardware-keyboard',
}: MJComposerProps) {
    const [text, setText] = useState('');
    const [attachment, setAttachment] = useState<CapturedAttachment | null>(null);
    const [pickerVisible, setPickerVisible] = useState(false);
    // Caret position, tracked because a trigger is resolved against what is LEFT of the caret —
    // editing mid-message must filter on that, not on the whole line.
    const [caret, setCaret] = useState(0);
    // Set only when a mention insert needs to MOVE the caret, then released on the next selection
    // event so the field goes back to managing its own. A permanently controlled `selection` fights
    // the user on every tap.
    const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | undefined>(undefined);
    // The composer holds READABLE text; these carry the ids so it can be re-serialized on send.
    const [inserted, setInserted] = useState<InsertedMention[]>([]);
    const rawTrigger = FindActiveTrigger(text, caret);
    // A host can turn any trigger off; a disabled one must behave as if the character were ordinary
    // text rather than opening a picker the host asked not to have.
    const triggerEnabled: Record<MentionTriggerChar, boolean> = {
        '@': EnableMentions,
        '#': EnableEntityMentions,
        '/': EnableSkillCommands,
    };
    const trigger = rawTrigger && triggerEnabled[rawTrigger.Trigger] ? rawTrigger : null;
    // The `/` picker narrows to the skills the TARGET agent accepts, so it has to use the agent the
    // turn will actually reach — an `@mention` already in the draft outranks the stored default,
    // exactly as the send path resolves it. Narrowing against the default while the message is
    // addressed to someone else offers skills the server will refuse and hides the ones it wants.
    // The `/` picker narrows to the target agent's accepted skills, so it must use the agent the
    // turn will actually reach — an inserted agent mention outranks the stored default, exactly as
    // the send path resolves it.
    const targetAgentId =
        inserted.find((m) => m.Type === 'agent' && text.includes(`${m.Prefix}${m.Name}`))?.ID ??
        MentionedAgentId(text) ??
        GetDefaultAgentId() ??
        null;
    const canSend = (text.trim().length > 0 || attachment != null) && !Disabled;
    // The open picker's current results. Held here (published by `MentionSuggestions`) because the
    // Return key's owner depends on whether there is anything to pick, and only the list knows.
    const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
    const hardwareKeyboard = useHardwareKeyboard();
    const suggestionsOpen = trigger != null && suggestions.length > 0;

    /**
     * What Return does right now.
     *
     * Recomputed every render because `submitBehavior` below has to be in the right mode BEFORE the
     * key is pressed — native RN decides whether to insert the newline or raise a submit event from
     * that prop, and there is no preventDefault to fall back on after the fact.
     */
    const enterAction = (shiftHeld: boolean | undefined) =>
        ResolveEnterAction({
            Policy: SubmitOnEnter,
            ShiftHeld: shiftHeld,
            HardwareKeyboard: hardwareKeyboard,
            SuggestionsOpen: suggestionsOpen,
            CanSend: canSend,
        });
    // Shift is unknowable ahead of the press on native, so the prop is computed for the common
    // (unmodified) case; a platform that DOES report Shift corrects it in `onKeyPress` below.
    const enterSubmits = enterAction(undefined) !== 'newline';
    // Set when `onKeyPress` handled a Return, so the `onSubmitEditing` that may follow on the same
    // press is a no-op rather than a second send.
    const enterHandledRef = useRef(false);

    /**
     * Opens a picker from its toolbar button by typing the trigger for the user.
     *
     * The buttons and the typed characters are the same affordance — pressing the skills button
     * and typing `/` must land in the same place — so the button writes the character rather than
     * driving a parallel code path.
     */
    const insertTrigger = (ch: string) => {
        const needsSpace = text.length > 0 && !/\s$/.test(text);
        const next = `${text}${needsSpace ? ' ' : ''}${ch}`;
        setText(next);
        setCaret(next.length);
    };

    /**
     * Inserts a chosen suggestion — the one path a tap and a Return press both take, so the two
     * can never drift into inserting different things.
     */
    const selectSuggestion = (s: MentionSuggestion) => {
        if (!trigger) return;
        // Insert the readable form and remember the id; `SerializeDraft` converts
        // back to the wire format at send time.
        setInserted((prev) => [...prev, { Type: s.type, ID: s.id, Name: s.name, Prefix: trigger.Trigger }]);
        const next = ApplyMention(text, trigger, `${trigger.Trigger}${s.name}`);
        setText(next.Text);
        setCaret(next.Caret);
        // Push the caret past the inserted token so typing continues after it
        // rather than wherever the field decides to put it.
        setPendingSelection({ start: next.Caret, end: next.Caret });
    };

    /**
     * Runs a resolved Return press.
     *
     * Reached from `onSubmitEditing` (native, where `submitBehavior` already suppressed the
     * newline) and from `onKeyPress` (platforms that report modifiers). `guard` de-duplicates the
     * two on any platform that fires both.
     */
    const runEnter = (action: ReturnType<typeof enterAction>) => {
        if (action === 'select-suggestion') {
            const top = suggestions[0];
            if (top) selectSuggestion(top);
            return;
        }
        if (action === 'send') submit();
    };

    const submit = () => {
        if (!canSend) return;
        // Convert the readable draft back to the wire format the runtime parses.
        const body = ComposeMessageWithAttachment(SerializeDraft(text, inserted), attachment);
        const pending = attachment;
        setText('');
        setInserted([]);
        setAttachment(null);
        OnSend(body, pending);
    };

    return (
        <View style={styles.composerWrap}>
            {trigger ? (
                <MentionSuggestions
                    Trigger={trigger.Trigger}
                    Query={trigger.Query}
                    TargetAgentID={targetAgentId}
                    OnSelect={selectSuggestion}
                    OnResults={setSuggestions}
                />
            ) : null}
            {attachment ? (
                <View style={styles.attachRow}>
                    <AttachmentChip attachment={attachment} onRemove={() => setAttachment(null)} />
                </View>
            ) : null}
            <View style={styles.composer}>
                <TextInput
                    placeholder={Placeholder}
                    placeholderTextColor={Colors.ink3}
                    style={styles.composerInput}
                    multiline
                    onChangeText={(t) => {
                        // Only assume "caret at the end" when the text actually GREW at the end —
                        // i.e. the user appended. The event order between onChangeText and
                        // onSelectionChange differs by platform (iOS fires change first, Android
                        // often fires selection first), so unconditionally writing `t.length` here
                        // clobbered a correct mid-message caret on Android and no trigger ever
                        // opened when editing mid-message.
                        const appended = t.length > text.length && t.startsWith(text);
                        setText(t);
                        if (appended || t.length < caret) setCaret(t.length);
                    }}
                    onSelectionChange={(e) => {
                        setCaret(e.nativeEvent.selection.end);
                        if (pendingSelection) setPendingSelection(undefined);
                    }}
                    selection={pendingSelection}
                    editable={!Disabled}
                    /*
                     * The ONLY lever that stops a multiline field from inserting the newline: RN
                     * decides in the native text view, before JS sees the key, so this has to be
                     * in the right mode ahead of the press. 'submit' raises onSubmitEditing
                     * WITHOUT blurring, which keeps the keyboard up between messages.
                     */
                    submitBehavior={enterSubmits ? 'submit' : 'newline'}
                    onSubmitEditing={() => {
                        if (enterHandledRef.current) {
                            // onKeyPress already ran this press (a platform reporting modifiers).
                            enterHandledRef.current = false;
                            return;
                        }
                        runEnter(enterAction(undefined));
                    }}
                    onKeyPress={(e) => {
                        const shift = ShiftFromKeyEvent(e.nativeEvent);
                        // Nothing to add unless the platform actually told us about the modifier;
                        // native RN's key event carries only `key`, and onSubmitEditing has it.
                        if (e.nativeEvent.key !== 'Enter' || shift === undefined) return;
                        enterHandledRef.current = true;
                        runEnter(enterAction(shift));
                    }}
                >
                    {/*
                      * Children rather than `value`: a TextInput that has children uses them as its
                      * content, which is the only way to style individual runs. That is what turns
                      * an inserted mention into a chip instead of plain text.
                      */}
                    <ChipText Text={text} Mentions={inserted} />
                </TextInput>
            </View>
            {/*
              * The action strip sits BELOW the input, as it does on the web — 32x32 icon buttons on
              * a 34px pitch with a 36x36 send at the end. Order matches Explorer exactly (skills,
              * plan mode, attach, voice, send) so muscle memory carries across.
              */}
            <View style={styles.composerActions}>
                {EnableSkillCommands ? (
                <Pressable
                    style={styles.actionBtn}
                    onPress={() => insertTrigger('/')}
                    disabled={Disabled}
                    accessibilityRole="button"
                    accessibilityLabel="Skills"
                >
                    <Icons.Sparkle size={18} color={Colors.ink2} strokeWidth={2} />
                </Pressable>
                ) : null}
                {EnableMentions ? (
                <Pressable
                    style={styles.actionBtn}
                    onPress={() => insertTrigger('@')}
                    disabled={Disabled}
                    accessibilityRole="button"
                    accessibilityLabel="Mention an agent"
                >
                    <Icons.AtSign size={18} color={Colors.ink2} strokeWidth={2} />
                </Pressable>
                ) : null}
                {EnableAttachments ? (
                <Pressable
                    style={styles.actionBtn}
                    onPress={() => setPickerVisible(true)}
                    disabled={Disabled}
                    accessibilityRole="button"
                    accessibilityLabel="Attach a file"
                >
                    <Icons.Paperclip size={18} color={Colors.ink2} strokeWidth={2} />
                </Pressable>
                ) : null}
                {EnableRealtime ? (
                <Pressable
                    style={styles.actionBtn}
                    onPress={() => router.push({ pathname: '/voice-mode', params: { conversationId: ConversationID } })}
                    disabled={Disabled}
                    accessibilityRole="button"
                    accessibilityLabel="Start a voice call"
                >
                    <Icons.Mic size={18} color={Colors.ink2} strokeWidth={2} />
                </Pressable>
                ) : null}
                <View style={{ flex: 1 }} />
                <Pressable
                    style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                    onPress={submit}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                >
                    <Icons.Send size={17} color={canSend ? Colors.inverse : Colors.ink3} strokeWidth={2.2} />
                </Pressable>
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
    composerWrap: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4, backgroundColor: Colors.bg },
    attachRow: { paddingBottom: 6 },
    // Explorer's composer is a plain bordered box, not a pill.
    composer: {
        backgroundColor: ChatColors.composerBg,
        borderRadius: Radius.composer,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 4,
        borderWidth: 1,
        borderColor: ChatColors.composerBorder,
        minHeight: 56,
    },
    composerInput: { fontSize: Type.body, color: Colors.ink, maxHeight: 120, paddingTop: 2, paddingBottom: 6 },
    composerActions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2, paddingTop: 4 },
    actionBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    sendBtn: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { backgroundColor: Colors.line2 },
});
