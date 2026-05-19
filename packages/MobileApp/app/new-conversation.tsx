import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * New conversation entry. Wave 3 will replace this stub with the
 * composer + suggested prompts + agent rail per the mockup
 * (plans/mobile-app-react-native/html/new-conversation.html).
 */
export default function NewConversationScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.navTop}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} />
                </Pressable>
                <Text style={styles.title}>New conversation</Text>
                <View style={styles.iconBtn} />
            </View>
            <View style={styles.body}>
                <Text style={styles.heading}>Coming in Wave 3</Text>
                <Text style={styles.copy}>Composer-first start screen with suggested prompts and an agent rail.</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    navTop: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
    body: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
    heading: { fontSize: 22, fontWeight: Type.bold, color: Colors.ink, marginBottom: 8 },
    copy: { fontSize: 14, color: Colors.ink2, lineHeight: 22 },
});
