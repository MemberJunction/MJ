import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Metadata } from '@memberjunction/core';
import {
    MentionAutocomplete,
    type MentionSuggestion,
} from '@memberjunction/conversations-runtime';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';
import type { MentionTriggerChar } from './trigger';

/**
 * @fileoverview The suggestion list shown while a `@`, `#` or `/` trigger is open.
 *
 * The list itself is the only part that is mobile's to own. Everything behind it — which agents
 * and skills this user may actually run, the `/` picker's narrowing to what the target agent
 * accepts, and the match ranking — comes from `MentionAutocomplete` in
 * `@memberjunction/conversations-runtime`, the same engine the web composer uses. That engine was
 * extracted out of `ng-conversations` precisely so this screen would not have to reimplement a
 * permission rule.
 */

/** What each trigger searches, for the list's own heading. */
const TRIGGER_LABEL: Record<MentionTriggerChar, string> = {
    '@': 'Agents & people',
    '#': 'Records & queries',
    '/': 'Skills',
};

/**
 * Renders ranked suggestions for the open trigger.
 *
 * @param Trigger Which picker is open.
 * @param Query Text typed after the trigger.
 * @param TargetAgentID The agent this message will go to, when known. Narrows `/` suggestions to
 *   the skills that agent accepts — the server enforces the same intersection, so this keeps the
 *   list honest rather than offering something that would be rejected.
 * @param OnSelect Called with the chosen suggestion.
 */
export function MentionSuggestions({
    Trigger,
    Query,
    TargetAgentID,
    OnSelect,
}: {
    Trigger: MentionTriggerChar;
    Query: string;
    TargetAgentID?: string | null;
    OnSelect: (suggestion: MentionSuggestion) => void;
}) {
    const [ready, setReady] = useState(MentionAutocomplete.Instance.IsInitialized);

    // The engine caches per session; initializing is a no-op once warm, so this is safe to call on
    // every trigger rather than coordinating a one-time warm-up from somewhere else.
    useEffect(() => {
        if (ready) return;
        let cancelled = false;
        void (async () => {
            const md = new Metadata();  // global-provider-ok: single-provider mobile client
            const user = md.CurrentUser;
            if (!user) {
                // No user yet: stop showing a spinner that will never resolve. The list renders
                // empty, and the next trigger re-mounts and retries.
                if (!cancelled) setReady(true);
                return;
            }
            try {
                await MentionAutocomplete.Instance.initialize(user);
            } catch {
                // A failed warm-up shows an empty list rather than blocking the composer.
            }
            if (!cancelled) setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [ready]);

    // Memoised deliberately. `getSuggestions` maps every permitted agent, asks for each one's
    // configuration presets, and sorts with a comparator that rescores both operands on every
    // comparison. Without this it re-ran on every parent render — and the composer's parent
    // re-renders on `sending`, on `progress` (which ticks throughout an agent run), on `stalled`
    // and on `sendError`, none of which can change the answer.
    const suggestions = useMemo(
        () => (ready ? MentionAutocomplete.Instance.getSuggestions(Query, true, Trigger, TargetAgentID ?? null) : []),
        [ready, Query, Trigger, TargetAgentID],
    );

    return (
        <View style={styles.sheet}>
            <Text style={styles.heading}>{TRIGGER_LABEL[Trigger]}</Text>
            {!ready ? (
                <View style={styles.loading}>
                    <ActivityIndicator color={Colors.brand} />
                </View>
            ) : suggestions.length === 0 ? (
                <Text style={styles.empty}>
                    {Query ? `Nothing matching “${Query}”.` : 'Nothing available here.'}
                </Text>
            ) : (
                <FlatList
                    data={suggestions}
                    keyboardShouldPersistTaps="always"
                    keyExtractor={(s) => `${s.type}:${s.id}`}
                    style={styles.list}
                    renderItem={({ item }) => (
                        <Pressable
                            style={styles.row}
                            accessibilityRole="button"
                            accessibilityLabel={`Insert ${item.displayName}`}
                            onPress={() => OnSelect(item)}
                        >
                            <View style={[styles.avatar, item.color ? { backgroundColor: item.color } : null]}>
                                <Text style={styles.avatarText}>
                                    {(item.displayName || item.name || '?').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <View style={styles.body}>
                                <Text style={styles.name} numberOfLines={1}>{item.displayName || item.name}</Text>
                                {item.description ? (
                                    <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
                                ) : null}
                            </View>
                            <Text style={styles.badge}>{item.type}</Text>
                        </Pressable>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    sheet: {
        maxHeight: 260,
        marginHorizontal: 12,
        marginBottom: 6,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        paddingVertical: 8,
        ...Shadow.cardLarge,
    },
    heading: { paddingHorizontal: 14, paddingBottom: 6, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Colors.ink3 },
    loading: { paddingVertical: 22, alignItems: 'center' },
    empty: { paddingHorizontal: 14, paddingVertical: 16, fontSize: 13.5, color: Colors.ink3 },
    list: { flexGrow: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 9 },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: Colors.inverse, fontSize: 13, fontWeight: '700' },
    body: { flex: 1 },
    name: { fontSize: 14.5, color: Colors.ink, fontWeight: Type.medium },
    description: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
    badge: { fontSize: 10.5, color: Colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8 },
});
