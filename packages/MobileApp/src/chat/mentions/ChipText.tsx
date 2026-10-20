import { Fragment } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ChatColors, Colors, Type } from '@/theme/tokens';
import type { InsertedMention } from './trigger';

/**
 * @fileoverview Rendering inserted mentions as chips inside the composer.
 *
 * ## Why this is not a `<View>`
 *
 * The web composer is a contenteditable, so a mention chip is a real element with a background, a
 * radius and its own hit area. React Native's `TextInput` cannot host arbitrary views inline — a
 * `<View>` child is not laid out within the text run.
 *
 * What it CAN host is nested `<Text>`, which both platforms render as a styled span inside the same
 * editable run (an `NSAttributedString` on iOS, a `Spannable` on Android). That gives colour,
 * weight and a background fill on the mention while the surrounding text stays plain and the field
 * stays fully editable — the chip appearance, without leaving the text model.
 *
 * The trade-off is honest: no rounded corners and no independent tap target, because a text span
 * has neither. It reads as a chip and edits as text, which is the right compromise on a phone —
 * a user deleting a mention expects backspace to work, not a close button.
 */

/** One run of composer text, either plain or part of an inserted mention. */
type Segment = { Text: string; IsMention: boolean };

/**
 * Splits composer text into plain and mention runs.
 *
 * Matches each tracked mention once, in order, against its own display form — the same rule
 * `SerializeDraft` uses when converting back, so what is highlighted is exactly what will be sent
 * as a mention. A mention the user has partly deleted stops matching and stops being highlighted,
 * which is the correct feedback.
 *
 * @param text The composer's current text.
 * @param mentions The mentions inserted into it, oldest first.
 */
export function SplitMentionSegments(text: string, mentions: InsertedMention[]): Segment[] {
    const segments: Segment[] = [];
    let rest = text;
    let consumed = 0;

    for (const m of mentions) {
        const display = `${m.Prefix}${m.Name}`;
        const at = rest.indexOf(display, consumed);
        if (at === -1) continue;
        if (at > 0) segments.push({ Text: rest.slice(0, at), IsMention: false });
        segments.push({ Text: display, IsMention: true });
        rest = rest.slice(at + display.length);
        consumed = 0;
    }
    if (rest.length > 0) segments.push({ Text: rest, IsMention: false });
    return segments;
}

/**
 * The composer's text, with inserted mentions styled as chips.
 *
 * Rendered as `TextInput` children rather than through `value`: a `TextInput` that has children
 * uses them as its content, which is what allows per-run styling. The parent still owns the string
 * and still receives `onChangeText`, so this is presentation only.
 */
export function ChipText({ Text: text, Mentions }: { Text: string; Mentions: InsertedMention[] }) {
    const segments = SplitMentionSegments(text, Mentions);
    return (
        <>
            {segments.map((s, i) => (
                <Fragment key={`${i}-${s.Text}`}>
                    {s.IsMention ? (
                        <Text style={styles.chip}>{s.Text}</Text>
                    ) : (
                        <Text style={styles.plain}>{s.Text}</Text>
                    )}
                </Fragment>
            ))}
        </>
    );
}

const styles = StyleSheet.create({
    plain: { color: Colors.ink, fontSize: Type.body },
    // Brand-tinted, semibold, on the accent-subtle ground — the same treatment the web chip uses,
    // expressed with the properties a text span actually supports.
    chip: {
        color: ChatColors.bubbleUserBg,
        backgroundColor: Colors.brandSoft,
        fontSize: Type.body,
        fontWeight: Type.semibold,
    },
});
