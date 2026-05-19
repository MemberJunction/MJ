import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * Chat thread — hero screen. Currently a stub awaiting the next wave.
 * Spec: plans/mobile-app-react-native/index.html · B3 · "Chat thread (hero)".
 */
export default function ChatThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.navTop}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.Menu size={22} color={Colors.ink} />
                </Pressable>
                <View style={styles.titleStack}>
                    <Text style={styles.title}>Chat thread</Text>
                    <Text style={styles.sub}>conversation {id}</Text>
                </View>
                <Pressable hitSlop={8} style={styles.iconBtn}>
                    <Icons.Plus size={22} color={Colors.ink} />
                </Pressable>
            </View>
            <View style={styles.body}>
                <Text style={styles.heading}>Coming in Wave 3</Text>
                <Text style={styles.copy}>
                    Multi-agent thread, step indicators, inline artifact cards, the collapsed
                    artifact-dock handle, and the composer. See the mockup at
                    plans/mobile-app-react-native/html/chat-thread.html.
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    navTop: {
        height: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2,
    },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    titleStack: { flex: 1, alignItems: 'center' },
    title: { fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    sub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
    body: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
    heading: { fontSize: 22, fontWeight: Type.bold, color: Colors.ink, letterSpacing: -0.3, marginBottom: 8 },
    copy: { fontSize: 14, color: Colors.ink2, lineHeight: 22 },
});
