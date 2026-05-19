import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth0Auth } from '@/auth/useAuth0Auth';
import { useMsalAuth } from '@/auth/useMsalAuth';
import { Icons } from '@/components/Icon';
import { useMJ } from '@/providers/mj-provider';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Sign-in screen — boot destination when no token is stored.
 *
 * Primary action: "Continue with Auth0" (BlueCypress dev tenant).
 * Secondary: "Continue with Microsoft" (works once Azure AD redirect URI
 *   is registered — falls back to a clear error otherwise).
 * Tertiary: Developer options sheet for paste-JWT testing.
 *
 * On successful auth, MJ provider transitions to 'ready' and the boot
 * gate in app/index.tsx redirects to /conversations.
 */
export default function LoginScreen() {
    const { status, error, bootWithAuth0Tokens, bootWithMsalTokens } = useMJ();
    const { signIn: signInAuth0, ready: auth0Ready } = useAuth0Auth();
    const { signIn: signInMsal, ready: msalReady } = useMsalAuth();

    const [signingIn, setSigningIn] = useState<'auth0' | 'msal' | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [devSheet, setDevSheet] = useState(false);

    // Once the MJ provider goes ready, jump to the conversations list.
    useEffect(() => {
        if (status === 'ready') router.replace('/conversations');
    }, [status]);

    const handleAuth0 = async () => {
        setLocalError(null);
        setSigningIn('auth0');
        try {
            const tokens = await signInAuth0();
            await bootWithAuth0Tokens(tokens);
        } catch (e) {
            setLocalError(e instanceof Error ? e.message : String(e));
        } finally {
            setSigningIn(null);
        }
    };

    const handleMsal = async () => {
        setLocalError(null);
        setSigningIn('msal');
        try {
            const tokens = await signInMsal();
            await bootWithMsalTokens(tokens);
        } catch (e) {
            setLocalError(e instanceof Error ? e.message : String(e));
        } finally {
            setSigningIn(null);
        }
    };

    const busy = signingIn !== null || status === 'loading';

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
                <Pressable
                    style={[styles.primary, (!auth0Ready || busy) && styles.disabled]}
                    onPress={handleAuth0}
                    disabled={!auth0Ready || busy}
                >
                    {signingIn === 'auth0' ? (
                        <ActivityIndicator color={Colors.inverse} />
                    ) : (
                        <>
                            <View style={styles.primaryIcon}>
                                <Text style={styles.primaryIconText}>A</Text>
                            </View>
                            <Text style={styles.primaryText}>Continue with Auth0</Text>
                            <Icons.ChevronRight size={16} color={Colors.inverse} strokeWidth={2.5} />
                        </>
                    )}
                </Pressable>

                <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                </View>

                <Pressable
                    style={[styles.secondary, (!msalReady || busy) && styles.disabled]}
                    onPress={handleMsal}
                    disabled={!msalReady || busy}
                >
                    {signingIn === 'msal' ? (
                        <ActivityIndicator color={Colors.ink} />
                    ) : (
                        <Text style={styles.secondaryText}>Continue with Microsoft</Text>
                    )}
                </Pressable>

                {(localError || error) ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorTitle}>Sign-in failed</Text>
                        <Text style={styles.errorText} numberOfLines={6}>
                            {localError ?? error?.message}
                        </Text>
                    </View>
                ) : null}

                <Pressable onPress={() => setDevSheet(true)} hitSlop={6}>
                    <Text style={styles.devLink}>Developer options</Text>
                </Pressable>
            </View>

            <Text style={styles.footer}>
                By signing in you agree to MemberJunction's Terms and Privacy Policy.
            </Text>

            <DevTokenSheet open={devSheet} onClose={() => setDevSheet(false)} />
        </SafeAreaView>
    );
}

function DevTokenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { setDevToken, status } = useMJ();
    const [token, setToken] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        const t = token.trim();
        if (!t) return;
        setSubmitting(true);
        try {
            await setDevToken(t);
            setToken('');
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Developer · Paste JWT</Text>
                        <Pressable hitSlop={8} onPress={onClose}>
                            <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                        </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={styles.sheetBody}>
                        <Text style={styles.copy}>
                            Paste a JWT to bypass the OAuth flow for ad-hoc API testing. Token is stored in the iOS
                            Keychain via expo-secure-store.
                        </Text>
                        <TextInput
                            value={token}
                            onChangeText={setToken}
                            placeholder="eyJhbGciOiJSUzI1NiIs…"
                            placeholderTextColor={Colors.ink3}
                            style={styles.input}
                            autoCapitalize="none"
                            autoCorrect={false}
                            multiline
                            numberOfLines={6}
                        />
                        <Pressable
                            style={[styles.primary, !token.trim() && styles.disabled]}
                            onPress={handleSubmit}
                            disabled={!token.trim() || submitting}
                        >
                            {submitting || status === 'loading'
                                ? <ActivityIndicator color={Colors.inverse} />
                                : <Text style={styles.primaryText}>Connect</Text>}
                        </Pressable>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },

    hero: { paddingHorizontal: 36, paddingTop: 60, alignItems: 'center' },
    logoMark: {
        width: 80, height: 80, borderRadius: 22,
        backgroundColor: Colors.brand,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        ...Shadow.cardLarge,
    },
    logoLetter: { color: Colors.inverse, fontSize: 38, fontWeight: '800', letterSpacing: -1.5 },
    wordmark: { fontSize: 32, fontWeight: '700', letterSpacing: -0.6, color: Colors.ink },
    tagline: { fontSize: 16, color: Colors.ink2, marginTop: 6, textAlign: 'center' },

    form: { paddingHorizontal: 28, marginTop: 56 },

    primary: {
        height: 52,
        backgroundColor: Colors.ink,
        borderRadius: Radius.lg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingHorizontal: 14,
        ...Shadow.cardLarge,
    },
    primaryIcon: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: Colors.brand,
        alignItems: 'center', justifyContent: 'center',
    },
    primaryIconText: { color: Colors.inverse, fontSize: 11, fontWeight: '700' },
    primaryText: { color: Colors.inverse, fontSize: 15.5, fontWeight: Type.semibold },

    divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.line2 },
    dividerText: { color: Colors.ink3, fontSize: 12, fontWeight: Type.medium, letterSpacing: 0.4 },

    secondary: {
        height: 48, borderRadius: Radius.lg,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
        alignItems: 'center', justifyContent: 'center',
    },
    secondaryText: { color: Colors.ink, fontSize: 14.5, fontWeight: Type.semibold },

    disabled: { opacity: 0.4 },

    errorBox: {
        marginTop: 18,
        padding: 14,
        backgroundColor: Colors.dangerSoft,
        borderRadius: Radius.lg,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
    },
    errorTitle: { fontSize: 12, fontWeight: Type.bold, color: Colors.danger, letterSpacing: 0.8 },
    errorText: { fontSize: 12.5, color: Colors.danger, marginTop: 4, lineHeight: 17 },

    devLink: {
        textAlign: 'center', marginTop: 22,
        fontSize: 12.5, fontWeight: Type.semibold, color: Colors.ink3,
        letterSpacing: 0.2,
    },

    footer: {
        position: 'absolute', bottom: 50, left: 0, right: 0,
        textAlign: 'center', fontSize: 12, color: Colors.ink3,
        paddingHorizontal: 36, lineHeight: 18,
    },

    // Dev token sheet
    sheet: { flex: 1, backgroundColor: Colors.bg },
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2,
    },
    sheetTitle: { fontSize: 18, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.2 },
    sheetBody: { padding: 18, gap: 14 },
    copy: { fontSize: 14, color: Colors.ink2, lineHeight: 21 },
    input: {
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
        borderRadius: Radius.lg, padding: 14,
        fontSize: 13, color: Colors.ink,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        minHeight: 120, textAlignVertical: 'top',
        ...Shadow.card,
    },
});
