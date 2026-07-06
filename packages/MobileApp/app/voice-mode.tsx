import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Type } from '@/theme/tokens';
import { resolveTargetAgent } from '@/data/services/agents';
import {
    RealtimeVoiceService,
    type VoiceSessionState,
    type VoiceTranscript,
    type VoiceUnavailableReason,
} from '@/voice/realtime-voice-service';

/** Dark background for the immersive voice takeover (intentionally static, not a theme token). */
const DARK_BG = '#0d0d12';

/**
 * Voice mode — fullscreen immersive takeover, wired to {@link RealtimeVoiceService}.
 *
 * Route: `/voice-mode` (Expo Router, `app/voice-mode.tsx`); pushed from the chat composer
 *   (with the active `conversationId`) and the new-conversation / artifact mic buttons.
 * Behavior: on mount it resolves the default agent, requests mic permission, mints a
 *   client-direct realtime session (`StartRealtimeClientSession`), and connects the
 *   ElevenLabs driver — surfacing live connection state, an audio-reactive orb/waveform, and
 *   live transcripts. Final transcripts persist to the conversation server-side.
 * Graceful fallback: when the feature can't run (no native PCM audio in this build, denied
 *   mic permission, missing server support, or no configured provider) the screen shows a
 *   clear "Voice isn't available" card instead of crashing — see {@link unavailableCopy}.
 * Mockup: `plans/mobile-app-react-native/html/voice-mode.html`.
 */
export default function VoiceModeScreen() {
    const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();

    const serviceRef = useRef<RealtimeVoiceService | null>(null);
    const [state, setState] = useState<VoiceSessionState>('idle');
    const [reason, setReason] = useState<VoiceUnavailableReason | null>(null);
    const [transcripts, setTranscripts] = useState<VoiceTranscript[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [liveLevel, setLiveLevel] = useState<number | null>(null);

    // ── Session lifecycle ───────────────────────────────────────────────────────
    useEffect(() => {
        const service = new RealtimeVoiceService();
        serviceRef.current = service;

        const unsubscribe = service.on((event) => {
            switch (event.Type) {
                case 'state':
                    setState(event.State);
                    setReason(event.Reason ?? null);
                    break;
                case 'transcript':
                    setTranscripts((prev) => appendTranscript(prev, event.Transcript));
                    break;
                case 'error':
                    setErrorMessage(event.Error.Message);
                    break;
            }
        });

        void (async () => {
            const agent = await resolveTargetAgent('');
            if (!agent) {
                setReason('backend');
                setState('unavailable');
                return;
            }
            await service.start({ TargetAgentID: agent.id, ConversationID: conversationId ?? null });
        })();

        return () => {
            unsubscribe();
            void service.stop();
            serviceRef.current = null;
        };
    }, [conversationId]);

    // ── Live audio-level poll (drives the waveform when the driver meters audio) ──
    useEffect(() => {
        const interval = setInterval(() => {
            const activity = serviceRef.current?.getAudioActivity() ?? null;
            const level = activity ? (activity.OutputLevel ?? activity.InputLevel) : null;
            setLiveLevel(level);
        }, 90);
        return () => clearInterval(interval);
    }, []);

    // ── Decorative breathing orb + ripples (fallback when no live amplitude) ─────
    const pulse = useRef(new Animated.Value(0)).current;
    const ripple1 = useRef(new Animated.Value(0)).current;
    const ripple2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();

        const rippleLoop = (anim: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                    Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
                ])
            );

        rippleLoop(ripple1, 0).start();
        rippleLoop(ripple2, 700).start();
    }, [pulse, ripple1, ripple2]);

    const orbScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
    const ripple1Scale = ripple1.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.32] });
    const ripple1Opacity = ripple1.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
    const ripple2Scale = ripple2.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.32] });
    const ripple2Opacity = ripple2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

    const close = () => {
        void serviceRef.current?.stop();
        router.back();
    };

    // ── Graceful fallback (unavailable / error) ──────────────────────────────────
    if (state === 'unavailable') {
        return <FallbackScreen title="Voice isn't available" body={unavailableCopy(reason)} onClose={close} />;
    }
    if (state === 'error') {
        return (
            <FallbackScreen
                title="Voice call ended"
                body={errorMessage ?? 'The voice session ran into a problem. Please try again.'}
                onClose={close}
            />
        );
    }

    const status = statusFor(state);
    const latest = transcripts.length > 0 ? transcripts[transcripts.length - 1] : null;

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.atmospheric} />
            <View style={styles.topRow}>
                <View style={[styles.listeningPill, { backgroundColor: status.pillBg, borderColor: status.pillBorder }]}>
                    {state === 'connecting' ? (
                        <ActivityIndicator size="small" color={status.accent} />
                    ) : (
                        <View style={[styles.listeningDot, { backgroundColor: status.accent }]} />
                    )}
                    <Text style={[styles.listeningText, { color: status.accent }]}>{status.label}</Text>
                </View>
                <Pressable hitSlop={8} style={styles.closeBtn} onPress={close}>
                    <Icons.ChevronLeft size={18} color="#f6f6f8" strokeWidth={2.2} />
                </Pressable>
            </View>

            <View style={styles.stage}>
                <View style={styles.orbFrame}>
                    <Animated.View style={[styles.ripple, { transform: [{ scale: ripple1Scale }], opacity: ripple1Opacity }]} />
                    <Animated.View style={[styles.ripple, { transform: [{ scale: ripple2Scale }], opacity: ripple2Opacity }]} />
                    <Animated.View style={[styles.orb, { transform: [{ scale: orbScale }] }]} />
                </View>

                <View style={styles.waveform}>
                    {WAVE_HEIGHTS.map((h, i) => (
                        <View key={i} style={[styles.bar, { height: barHeight(h, liveLevel) }]} />
                    ))}
                </View>
            </View>

            <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>
                    {latest ? `${latest.Role === 'User' ? 'YOU' : 'AGENT'} · ${latest.Kind === 'narration' ? 'NOTE' : 'LIVE'}` : status.label.toUpperCase()}
                </Text>
                <Text style={styles.transcript}>
                    {latest ? latest.Text : status.hint}
                </Text>
            </View>

            <View style={styles.controls}>
                <Pressable style={styles.ctrlBtn}>
                    <Icons.ChevronUp size={22} color="#f6f6f8" strokeWidth={2} />
                </Pressable>
                <Pressable style={styles.ctrlBtnPrimary} onPress={close}>
                    <View style={styles.ctrlSquare} />
                </Pressable>
                <Pressable style={styles.ctrlBtn}>
                    <Icons.Sliders size={22} color="#f6f6f8" strokeWidth={2} />
                </Pressable>
            </View>
            <Text style={styles.ctrlLabel}>Tap to stop · swipe right for keyboard</Text>
        </SafeAreaView>
    );
}

/** Full-screen graceful fallback for unavailable / error states. */
function FallbackScreen({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.atmospheric} />
            <View style={styles.topRow}>
                <View style={{ flex: 1 }} />
                <Pressable hitSlop={8} style={styles.closeBtn} onPress={onClose}>
                    <Icons.ChevronLeft size={18} color="#f6f6f8" strokeWidth={2.2} />
                </Pressable>
            </View>
            <View style={styles.fallbackStage}>
                <View style={styles.fallbackIcon}>
                    <Icons.Mic size={26} color="#9a9aa8" strokeWidth={2} />
                </View>
                <Text style={styles.fallbackTitle}>{title}</Text>
                <Text style={styles.fallbackBody}>{body}</Text>
                <Pressable style={styles.fallbackBtn} onPress={onClose}>
                    <Text style={styles.fallbackBtnText}>Back to chat</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

/** Appends a final transcript, replacing the previous same-role turn on a barge-in correction. */
function appendTranscript(prev: VoiceTranscript[], next: VoiceTranscript): VoiceTranscript[] {
    if (next.ReplacesPrevious) {
        for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].Role === next.Role) {
                const copy = prev.slice();
                copy[i] = next;
                return copy;
            }
        }
    }
    // Keep the list bounded — only the most recent turns matter for a live call.
    return [...prev, next].slice(-8);
}

/** Human copy for each reason a voice session couldn't start. */
function unavailableCopy(reason: VoiceUnavailableReason | null): string {
    switch (reason) {
        case 'permission':
            return 'Microphone access is off. Enable it in your device Settings to talk with your agents.';
        case 'backend':
            return "This workspace's server doesn't have voice enabled yet. You can still chat by text.";
        case 'provider':
            return 'No voice provider is configured for this workspace. Ask an administrator to enable one.';
        case 'audio':
        default:
            return 'Real-time voice needs a native audio module that isn’t in this build. Chat by text for now — the voice pipeline activates automatically once low-latency audio streaming is available.';
    }
}

/** Status pill styling + copy per session state. */
function statusFor(state: VoiceSessionState): {
    label: string;
    hint: string;
    accent: string;
    pillBg: string;
    pillBorder: string;
} {
    switch (state) {
        case 'connecting':
            return { label: 'Connecting', hint: 'Setting up your voice session…', accent: '#aab6ff', pillBg: 'rgba(120,140,255,0.14)', pillBorder: 'rgba(120,140,255,0.30)' };
        case 'speaking':
            return { label: 'Speaking', hint: 'The agent is responding…', accent: '#6688f0', pillBg: 'rgba(102,136,240,0.14)', pillBorder: 'rgba(102,136,240,0.30)' };
        case 'thinking':
            return { label: 'Working', hint: 'The agent is working on your request…', accent: '#f0c36b', pillBg: 'rgba(240,195,107,0.14)', pillBorder: 'rgba(240,195,107,0.30)' };
        case 'closed':
            return { label: 'Ended', hint: 'The call has ended.', accent: '#9a9aa8', pillBg: 'rgba(154,154,168,0.14)', pillBorder: 'rgba(154,154,168,0.28)' };
        case 'listening':
        default:
            return { label: 'Listening', hint: 'Go ahead — I’m listening.', accent: '#6ce0c0', pillBg: 'rgba(46,196,163,0.14)', pillBorder: 'rgba(46,196,163,0.30)' };
    }
}

/** Scales a decorative bar by the live audio level when metered, else uses the static height. */
function barHeight(base: number, level: number | null): number {
    if (level === null) {
        return base;
    }
    return Math.max(6, base * (0.4 + level));
}

/** Static bar heights (px) for the decorative waveform — scaled by real amplitude when metered. */
const WAVE_HEIGHTS = [18, 32, 52, 42, 28, 48, 36, 22, 40, 30, 50, 24, 38];

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: DARK_BG },
    atmospheric: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: DARK_BG,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    listeningPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
    listeningDot: { width: 8, height: 8, borderRadius: 4 },
    listeningText: { fontSize: 12.5, fontWeight: Type.semibold },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

    stage: { alignItems: 'center', paddingTop: 30 },
    orbFrame: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
    ripple: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' },
    orb: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#3a5cd0', shadowColor: '#6688f0', shadowOpacity: 0.6, shadowRadius: 80, shadowOffset: { width: 0, height: 0 }, elevation: 24 },

    waveform: { marginTop: 32, flexDirection: 'row', alignItems: 'center', gap: 5, height: 56 },
    bar: { width: 4, borderRadius: 2, backgroundColor: '#6688f0' },

    transcriptCard: { marginHorizontal: 24, marginTop: 32, padding: 22, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 22 },
    transcriptLabel: { fontSize: 11, fontWeight: Type.bold, color: 'rgba(170,186,255,0.85)', letterSpacing: 1.4, marginBottom: 8 },
    transcript: { fontSize: 19, lineHeight: 26, color: '#f6f6f8', fontWeight: Type.medium, letterSpacing: -0.2 },

    controls: { position: 'absolute', bottom: 80, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
    ctrlBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
    ctrlBtnPrimary: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#d63a3f', shadowColor: '#ff5a5f', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12, alignItems: 'center', justifyContent: 'center' },
    ctrlSquare: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#ffffff' },
    ctrlLabel: { position: 'absolute', bottom: 36, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#6e6e7a', letterSpacing: 0.4 },

    // Fallback (unavailable / error)
    fallbackStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 80 },
    fallbackIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    fallbackTitle: { fontSize: 22, fontWeight: Type.bold, color: '#f6f6f8', textAlign: 'center', marginBottom: 12 },
    fallbackBody: { fontSize: 15, lineHeight: 22, color: '#b9b9c4', textAlign: 'center', marginBottom: 28 },
    fallbackBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 999, backgroundColor: '#3a5cd0' },
    fallbackBtnText: { fontSize: 15, fontWeight: Type.semibold, color: '#ffffff' },
});
