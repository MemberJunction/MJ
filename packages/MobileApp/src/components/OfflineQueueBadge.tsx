/**
 * Offline queue badge (P3.2) — a small pending-count pill that a screen can drop
 * in to show how many edits are waiting to sync, and to let the user trigger a sync
 * on tap. Renders nothing when the queue is empty, so it is safe to mount
 * unconditionally.
 *
 * Wiring note: this is intended for the record **edit** screen's result area
 * (`app/explorer/record/[id]/edit.tsx`), owned by the record agent — this badge is
 * exported for that screen to mount next to its save affordance so a "Saved offline"
 * result has a visible, tappable follow-up. It is deliberately self-contained
 * (owns its own {@link ../hooks/useOfflineQueue!useOfflineQueue} state) so mounting
 * is a one-liner with no prop plumbing.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * Pending-offline-mutations pill. Shows the count with a tap-to-sync affordance;
 * shows a spinner while a replay pass is in flight. Hidden entirely when nothing
 * is pending.
 */
export function OfflineQueueBadge() {
    const { count, syncing, syncNow } = useOfflineQueue();

    if (count === 0) return null;

    const label = count === 1 ? '1 change pending' : `${count} changes pending`;

    return (
        <Pressable
            onPress={() => void syncNow()}
            disabled={syncing}
            style={styles.pill}
            accessibilityRole="button"
            accessibilityLabel={`${label}. Tap to sync now.`}
        >
            <View style={styles.icon}>
                {syncing ? <ActivityIndicator size="small" color={Colors.warn} /> : <Icons.Database size={14} color={Colors.warn} />}
            </View>
            <Text style={styles.text} numberOfLines={1}>
                {syncing ? 'Syncing…' : `${label} · tap to sync`}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        alignSelf: 'flex-start',
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: Radius.pill,
        backgroundColor: Colors.warnSoft,
    },
    icon: { width: 16, alignItems: 'center', justifyContent: 'center' },
    text: { color: Colors.warn, fontSize: Type.small, fontWeight: Type.semibold, letterSpacing: 0.1 },
});
