import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * Profile & settings stub.
 * Wave 6 spec: plans/mobile-app-react-native/html/profile.html.
 */
export default function ProfileScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.navTop}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} />
                </Pressable>
                <Text style={styles.title}>Profile & settings</Text>
                <View style={styles.iconBtn} />
            </View>
            <View style={styles.body}>
                <Text style={styles.copy}>
                    Wave 6: avatar, preferences (default agent, appearance, voice, push), account
                    (Face ID lock, workspace, help), sign out.
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    navTop: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
    body: { flex: 1, padding: Spacing.xl },
    copy: { fontSize: 14, color: Colors.ink2, lineHeight: 22 },
});
