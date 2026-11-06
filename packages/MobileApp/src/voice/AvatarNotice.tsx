import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { Type } from '@/theme/tokens';

/**
 * @fileoverview The voice screen's "Audio only" notice: one line under the top row saying why the
 * call has no avatar, with a ✕.
 *
 * Part of the voice screen's immersive dark surface, so it uses that screen's static palette rather
 * than the (light) theme tokens: an info tint like the screen's "Connecting" pill. When it shows and
 * for how long is `AvatarNoticePresenter`'s job; this only draws it.
 */

/** The notice's colours on the voice screen's dark ground. */
const NOTICE = {
    bg: 'rgba(120,140,255,0.14)',
    border: 'rgba(120,140,255,0.30)',
    icon: '#aab6ff',
    text: '#e4e8ff',
    dismiss: '#b9b9c4',
} as const;

/** What the notice renders. */
export type AvatarNoticeProps = {
    /** The sentence to show, or `null` when there is no notice. */
    Message: string | null;
    /** Called when the user taps ✕. */
    OnDismiss: () => void;
};

/**
 * Renders the notice, or an empty live region when there is none.
 *
 * The region stays mounted for the whole call so the sentence arrives as new content in it, which
 * TalkBack reads out politely; iOS has no live regions, see {@link AnnounceAvatarNotice}.
 */
export function AvatarNotice({ Message, OnDismiss }: AvatarNoticeProps) {
    return (
        <View accessibilityLiveRegion="polite">
            {Message ? (
                <View style={styles.notice}>
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <Icons.VideoOff size={16} color={NOTICE.icon} strokeWidth={2} />
                    </View>
                    <Text style={styles.text}>{Message}</Text>
                    <Pressable
                        style={styles.dismiss}
                        hitSlop={10}
                        onPress={OnDismiss}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss"
                    >
                        <Icons.X size={14} color={NOTICE.dismiss} strokeWidth={2.4} />
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}

/**
 * Reads a new notice aloud on iOS, queued behind whatever VoiceOver is saying: the polite
 * announcement Android's live region makes. Does nothing on Android, which would otherwise say it twice.
 *
 * @param message The sentence the notice shows.
 */
export function AnnounceAvatarNotice(message: string): void {
    if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    }
}

const styles = StyleSheet.create({
    notice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 18,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 9,
        borderRadius: 14,
        borderWidth: 1,
        backgroundColor: NOTICE.bg,
        borderColor: NOTICE.border,
    },
    text: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: Type.medium, color: NOTICE.text },
    dismiss: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
