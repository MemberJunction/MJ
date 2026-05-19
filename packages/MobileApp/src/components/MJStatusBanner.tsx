import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal, Platform, Pressable, ScrollView,
    StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useMJ } from '@/providers/mj-provider';
import { useMsalAuth } from '@/auth/useMsalAuth';
import { Env } from '@/config/env';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Floating banner that reflects the MJ provider status. Tapping when
 * disconnected opens the sign-in sheet with Microsoft and dev-token options.
 *
 * Phase 1: shows on every screen until MJ is ready.
 * Phase 2: probably becomes a login screen that gates the entire app.
 */
export function MJStatusBanner() {
    const { status, error } = useMJ();
    const [modalOpen, setModalOpen] = useState(false);

    if (status === 'ready') return null;

    let message = 'Connecting to MJAPI…';
    let tone: 'info' | 'warn' | 'error' = 'info';

    if (status === 'no-token') {
        message = 'Not signed in · tap to connect';
        tone = 'warn';
    } else if (status === 'error') {
        message = `MJAPI error · tap to retry · ${error?.message?.slice(0, 60) ?? ''}`;
        tone = 'error';
    }

    const colors = tone === 'warn'
        ? { bg: Colors.warnSoft, fg: Colors.warn }
        : tone === 'error'
            ? { bg: Colors.dangerSoft, fg: Colors.danger }
            : { bg: Colors.brandSoft, fg: Colors.brand };

    return (
        <>
            <Pressable
                onPress={() => setModalOpen(true)}
                style={[styles.banner, { backgroundColor: colors.bg }]}
                disabled={status === 'loading'}
            >
                {status === 'loading' ? <ActivityIndicator size="small" color={colors.fg} /> : null}
                <Text style={[styles.bannerText, { color: colors.fg }]} numberOfLines={1}>
                    {message}
                </Text>
            </Pressable>
            <SignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
        </>
    );
}

type SignInTab = 'microsoft' | 'dev-token';

function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { setDevToken, bootWithMsalTokens, status, error } = useMJ();
    const { signIn: signInMsal, ready: msalReady } = useMsalAuth();

    const [tab, setTab] = useState<SignInTab>('microsoft');
    const [token, setToken] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msalError, setMsalError] = useState<string | null>(null);

    const handleMsalSignIn = async () => {
        setMsalError(null);
        setSubmitting(true);
        try {
            const tokens = await signInMsal();
            await bootWithMsalTokens(tokens);
            onClose();
        } catch (e) {
            setMsalError(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDevTokenSubmit = async () => {
        const trimmed = token.trim();
        if (!trimmed) return;
        setSubmitting(true);
        try {
            await setDevToken(trimmed);
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
                        <Text style={styles.sheetTitle}>Sign in to MJ</Text>
                        <Pressable hitSlop={8} onPress={onClose}>
                            <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                        </Pressable>
                    </View>

                    <View style={styles.tabs}>
                        <Pressable style={[styles.tab, tab === 'microsoft' && styles.tabActive]} onPress={() => setTab('microsoft')}>
                            <Text style={[styles.tabText, tab === 'microsoft' && styles.tabTextActive]}>Microsoft</Text>
                        </Pressable>
                        <Pressable style={[styles.tab, tab === 'dev-token' && styles.tabActive]} onPress={() => setTab('dev-token')}>
                            <Text style={[styles.tabText, tab === 'dev-token' && styles.tabTextActive]}>Dev JWT</Text>
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.sheetBody}>
                        {tab === 'microsoft' ? (
                            <>
                                <Text style={styles.copy}>
                                    Sign in with your Microsoft work account against the MJ Explorer tenant.
                                </Text>
                                <View style={styles.kvBlock}>
                                    <KV k="Tenant" v={Env.msalTenantId} />
                                    <KV k="Client ID" v={Env.msalClientId} />
                                    <KV k="Redirect" v="mjmobile://auth" />
                                </View>
                                <Pressable
                                    style={[styles.primary, !msalReady && styles.primaryDisabled]}
                                    onPress={handleMsalSignIn}
                                    disabled={!msalReady || submitting}
                                >
                                    {submitting
                                        ? <ActivityIndicator color={Colors.inverse} />
                                        : <Text style={styles.primaryText}>Continue with Microsoft</Text>}
                                </Pressable>
                                {msalError ? (
                                    <Text style={styles.errorText} numberOfLines={4}>{msalError}</Text>
                                ) : null}
                                {error ? (
                                    <Text style={styles.errorText} numberOfLines={3}>Last MJ error: {error.message}</Text>
                                ) : null}
                                <Text style={styles.note}>
                                    One-time Azure AD setup: add a "Mobile and desktop applications" platform on the
                                    app registration with redirect URI <Text style={styles.code}>mjmobile://auth</Text>,
                                    and enable "Allow public client flows" under Advanced settings.
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.copy}>
                                    Paste a JWT for quick testing without going through OAuth. The token is stored in
                                    the iOS Keychain via expo-secure-store.
                                </Text>
                                <Text style={styles.fieldLabel}>JWT</Text>
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
                                {error ? (
                                    <Text style={styles.errorText} numberOfLines={3}>Last error: {error.message}</Text>
                                ) : null}
                                <Pressable
                                    style={[styles.primary, !token.trim() && styles.primaryDisabled]}
                                    onPress={handleDevTokenSubmit}
                                    disabled={!token.trim() || submitting}
                                >
                                    {submitting || status === 'loading'
                                        ? <ActivityIndicator color={Colors.inverse} />
                                        : <Text style={styles.primaryText}>Connect with this token</Text>}
                                </Pressable>
                                <Text style={styles.note}>
                                    To get a token: open MJ Explorer in your browser, sign in, then in DevTools find
                                    the MSAL idToken in localStorage and paste it here.
                                </Text>
                            </>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

function KV({ k, v }: { k: string; v: string }) {
    return (
        <View style={styles.kvRow}>
            <Text style={styles.kvK}>{k}</Text>
            <Text style={styles.kvV} numberOfLines={1}>{v}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 8, paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2,
    },
    bannerText: { flex: 1, fontSize: 12.5, fontWeight: Type.semibold, letterSpacing: 0.1 },

    sheet: { flex: 1, backgroundColor: Colors.bg },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    sheetTitle: { fontSize: 18, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.2 },
    tabs: { flexDirection: 'row', padding: 14, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    tabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    tabText: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink2 },
    tabTextActive: { color: Colors.inverse },
    sheetBody: { padding: 18, gap: 14 },
    copy: { fontSize: 14.5, color: Colors.ink2, lineHeight: 22 },
    code: { fontSize: 13, color: Colors.brand, fontWeight: Type.semibold },

    kvBlock: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 12, gap: 6 },
    kvRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    kvK: { fontSize: 12, color: Colors.ink3, fontWeight: Type.medium },
    kvV: { flex: 1, textAlign: 'right', fontSize: 12, color: Colors.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

    fieldLabel: { fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2, marginTop: 6 },
    input: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, fontSize: 13, color: Colors.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', minHeight: 120, textAlignVertical: 'top', ...Shadow.card },

    errorText: { color: Colors.danger, fontSize: 12.5, lineHeight: 18 },

    primary: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', ...Shadow.cardLarge },
    primaryDisabled: { opacity: 0.5 },
    primaryText: { color: Colors.inverse, fontSize: 15.5, fontWeight: Type.semibold },

    note: { fontSize: 12, color: Colors.ink3, lineHeight: 18, marginTop: 4 },
});
