import { useState } from 'react';
import {
    KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
    StyleSheet, Text, TextInput, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useMJ } from '@/providers/mj-provider';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Floating banner near the top of every screen that reflects the MJ provider
 * status. Tapping when disconnected opens the token-paste modal.
 *
 * Phase 1 dev affordance only. Phase 2 replaces this with real auth + a
 * silent refresh flow.
 */
export function MJStatusBanner() {
    const { status, error } = useMJ();
    const [modalOpen, setModalOpen] = useState(false);

    if (status === 'ready') return null;

    let message = 'Connecting to MJAPI…';
    let tone: 'info' | 'warn' | 'error' = 'info';

    if (status === 'no-token') {
        message = 'Using mock data · tap to connect to MJAPI';
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
            <TokenEntryModal open={modalOpen} onClose={() => setModalOpen(false)} />
        </>
    );
}

function TokenEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { setDevToken, clearToken, status, error } = useMJ();
    const [token, setToken] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        const trimmed = token.trim();
        if (!trimmed) return;
        setSubmitting(true);
        try {
            await setDevToken(trimmed);
        } finally {
            setSubmitting(false);
            setToken('');
            onClose();
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
                        <Text style={styles.sheetTitle}>Connect to MJAPI</Text>
                        <Pressable hitSlop={8} onPress={onClose}>
                            <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.sheetBody}>
                        <Text style={styles.copy}>
                            Phase 1 uses a dev JWT to authenticate against your local MJAPI at{' '}
                            <Text style={styles.code}>{Env_graphqlUrl()}</Text>. To get one:
                        </Text>
                        <View style={styles.steps}>
                            <Step n={1} text="Open MJ Explorer in your browser and sign in via MSAL." />
                            <Step n={2} text="Open DevTools → Application → Local Storage." />
                            <Step n={3} text="Find the access token (often under msal.* / authToken keys) and copy the JWT value." />
                            <Step n={4} text="Paste it below. We'll store it in the Keychain via expo-secure-store." />
                        </View>

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
                            <Text style={styles.errorText} numberOfLines={3}>
                                Last error: {error.message}
                            </Text>
                        ) : null}

                        <Pressable
                            style={[styles.submit, !token.trim() && styles.submitDisabled]}
                            onPress={handleSubmit}
                            disabled={!token.trim() || submitting}
                        >
                            {submitting || status === 'loading'
                                ? <ActivityIndicator color={Colors.inverse} />
                                : <Text style={styles.submitText}>Connect</Text>}
                        </Pressable>

                        <Pressable onPress={async () => { await clearToken(); onClose(); }}>
                            <Text style={styles.clearLink}>Clear stored token</Text>
                        </Pressable>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

function Step({ n, text }: { n: number; text: string }) {
    return (
        <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View>
            <Text style={styles.stepText}>{text}</Text>
        </View>
    );
}

// avoid circular import at module load time
function Env_graphqlUrl(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Env } = require('@/config/env');
    return Env.graphqlUrl;
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
    sheetBody: { padding: 18, gap: 16 },
    copy: { fontSize: 14.5, color: Colors.ink2, lineHeight: 22 },
    code: { fontSize: 13, color: Colors.brand, fontWeight: Type.semibold },

    steps: { gap: 10 },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    stepNumberText: { color: Colors.inverse, fontWeight: '700', fontSize: 12 },
    stepText: { flex: 1, fontSize: 14, color: Colors.ink, lineHeight: 21 },

    fieldLabel: { fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2, marginTop: 6 },
    input: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, fontSize: 13, color: Colors.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', minHeight: 120, textAlignVertical: 'top', ...Shadow.card },

    errorText: { color: Colors.danger, fontSize: 12.5, lineHeight: 18 },

    submit: { height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', ...Shadow.cardLarge },
    submitDisabled: { opacity: 0.5 },
    submitText: { color: Colors.inverse, fontSize: 15.5, fontWeight: Type.semibold },

    clearLink: { color: Colors.danger, fontSize: 13, fontWeight: Type.semibold, textAlign: 'center', marginTop: 4 },
});
