import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Sign-in screen.
 * Spec: plans/mobile-app-react-native/html/login.html
 *
 * Phase 1: not on the boot path (the app skips auth and lands on /conversations
 * directly per src/config/env.ts). Renderable for visual review and Phase 2
 * wiring with expo-auth-session.
 */
export default function LoginScreen() {
    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.hero}>
                <View style={styles.logoMark}>
                    <Text style={styles.logoLetter}>M</Text>
                </View>
                <Text style={styles.wordmark}>MemberJunction</Text>
                <Text style={styles.tagline}>Talk to your data. Anywhere.</Text>
            </View>

            <View style={styles.form}>
                <View style={styles.field}>
                    <Icons.Search size={18} color={Colors.ink3} />
                    <TextInput
                        placeholder="you@company.com"
                        placeholderTextColor={Colors.ink3}
                        style={styles.input}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                </View>
                <Pressable
                    style={styles.continueBtn}
                    onPress={() => router.replace('/conversations')}
                >
                    <Text style={styles.continueText}>Continue</Text>
                    <Icons.ChevronRight size={16} color={Colors.inverse} strokeWidth={2.5} />
                </Pressable>

                <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                </View>

                <SsoBtn label="Continue with passkey" />
                <SsoBtn label="Continue with Microsoft" />
                <SsoBtn label="Continue with Google" />
            </View>

            <Text style={styles.footer}>
                By signing in you agree to MemberJunction's Terms and Privacy Policy.
            </Text>
        </SafeAreaView>
    );
}

function SsoBtn({ label }: { label: string }) {
    return (
        <Pressable style={styles.ssoBtn}>
            <Text style={styles.ssoText}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    hero: { paddingHorizontal: 36, paddingTop: 60, alignItems: 'center' },
    logoMark: { width: 80, height: 80, borderRadius: 22, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 24, ...Shadow.cardLarge },
    logoLetter: { color: Colors.inverse, fontSize: 38, fontWeight: '800', letterSpacing: -1.5 },
    wordmark: { fontSize: 32, fontWeight: '700', letterSpacing: -0.6, color: Colors.ink },
    tagline: { fontSize: 16, color: Colors.ink2, marginTop: 6, textAlign: 'center' },

    form: { paddingHorizontal: 28, marginTop: 56 },
    field: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, ...Shadow.card },
    input: { flex: 1, fontSize: 15.5, color: Colors.ink },

    continueBtn: { width: '100%', height: 52, backgroundColor: Colors.ink, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 8, ...Shadow.cardLarge },
    continueText: { color: Colors.inverse, fontSize: 15.5, fontWeight: Type.semibold },

    divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, marginBottom: 18 },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.line2 },
    dividerText: { color: Colors.ink3, fontSize: 12, fontWeight: Type.medium, letterSpacing: 0.4 },

    ssoBtn: { width: '100%', height: 48, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    ssoText: { color: Colors.ink, fontSize: 14.5, fontWeight: Type.semibold },

    footer: { position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: Colors.ink3, paddingHorizontal: 36, lineHeight: 18 },
});
