import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMJ } from '@/providers/mj-provider';
import { createConversation } from '@/data/services/agents';
import { Colors, Spacing, Type } from '@/theme/tokens';

/** Fixed QA prompt that exercises markdown rendering (heading + fenced TS code + a table). */
const PROMPT = 'Reply in markdown ONLY (no preamble). Include: a "## Demo" heading, a one-sentence intro, then a TypeScript fenced code block showing a small function with types, then a 2-row markdown table with columns Name and Value.';

/**
 * DEV HARNESS — not a shipping screen; not linked from in-app navigation.
 *
 * Route: `/devchat` (Expo Router, `app/devchat.tsx`), reached via deep link:
 *   `xcrun simctl openurl booted "org.memberjunction.mobile:///devchat"`.
 * Purpose: automate the end-to-end send flow for QA — waits for `useMJ().status`
 *   to be `ready`, calls `createConversation('Markdown demo')`
 *   (`@/data/services/agents`), then `router.replace`s into `/chat/[id]` with
 *   `?autosend={@link PROMPT}` so the real thread runs the normal send loop
 *   (working indicator + agent run + refresh) with no manual typing.
 * Interactions: none — fully automatic; shows a spinner + status text while it
 *   works.
 * Mockup: none (dev harness).
 */
export default function DevChat() {
    const { status } = useMJ();
    const [msg, setMsg] = useState('waiting for MJ…');
    useEffect(() => {
        if (status !== 'ready') return;
        let cancelled = false;
        (async () => {
            try {
                setMsg('creating conversation…');
                const conv = await createConversation('Markdown demo');
                if (!conv) { setMsg('createConversation returned null'); return; }
                if (!cancelled) {
                    router.replace({ pathname: '/chat/[id]', params: { id: conv.id, autosend: PROMPT } });
                }
            } catch (e) {
                setMsg('ERROR: ' + (e instanceof Error ? e.message : String(e)));
            }
        })();
        return () => { cancelled = true; };
    }, [status]);
    return (
        <View style={styles.c}>
            <ActivityIndicator color={Colors.brand} />
            <Text style={styles.t}>{msg}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: Spacing.xl },
    t: { marginTop: Spacing.md, color: Colors.ink2, fontSize: Type.body, textAlign: 'center' },
});
