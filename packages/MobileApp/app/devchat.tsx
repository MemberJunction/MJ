import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMJ } from '@/providers/mj-provider';
import { createConversation } from '@/data/services/agents';
import { Colors, Spacing, Type } from '@/theme/tokens';

/**
 * DEV-ONLY harness: waits for MJ to be ready, creates a conversation, then opens
 * the real chat thread with ?autosend so the normal send flow runs (working
 * indicator + Sage agent run + refresh). QA without manual typing:
 *   xcrun simctl openurl booted "org.memberjunction.mobile:///devchat"
 */
const PROMPT = 'Reply in markdown ONLY (no preamble). Include: a "## Demo" heading, a one-sentence intro, then a TypeScript fenced code block showing a small function with types, then a 2-row markdown table with columns Name and Value.';

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
