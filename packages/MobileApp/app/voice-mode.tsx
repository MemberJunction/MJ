import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Spacing, Type } from '@/theme/tokens';

const DARK_BG = '#0d0d12';

/**
 * Voice mode — fullscreen takeover.
 * Spec: plans/mobile-app-react-native/html/voice-mode.html
 *
 * Phase 1: visual scaffold with animated orb and waveform. The actual
 * STT pipeline (record → Whisper → submit as a new Conversation Detail)
 * lands in Phase 2.
 */
export default function VoiceModeScreen() {
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

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.atmospheric} />
            <View style={styles.topRow}>
                <View style={styles.listeningPill}>
                    <View style={styles.listeningDot} />
                    <Text style={styles.listeningText}>Listening</Text>
                </View>
                <Text style={styles.convoMeta}>
                    <Text style={styles.convoMetaBold}>Acme pipeline review</Text>
                </Text>
                <Pressable hitSlop={8} style={styles.closeBtn} onPress={() => router.back()}>
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
                        <View key={i} style={[styles.bar, { height: h }]} />
                    ))}
                </View>
            </View>

            <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>YOU · LIVE</Text>
                <Text style={styles.transcript}>
                    What's the total pipeline for Acme this quarter <Text style={styles.transcriptLive}>and who's the owner on the…</Text>
                </Text>
            </View>

            <View style={styles.controls}>
                <Pressable style={styles.ctrlBtn}>
                    <Icons.ChevronUp size={22} color="#f6f6f8" strokeWidth={2} />
                </Pressable>
                <Pressable style={styles.ctrlBtnPrimary} onPress={() => router.back()}>
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
    listeningPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 14, paddingVertical: 6, backgroundColor: 'rgba(46,196,163,0.14)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(46,196,163,0.30)' },
    listeningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ec4a3' },
    listeningText: { fontSize: 12.5, fontWeight: Type.semibold, color: '#6ce0c0' },
    convoMeta: { fontSize: 12, color: '#b9b9c4', fontWeight: Type.medium },
    convoMetaBold: { color: '#f6f6f8', fontWeight: Type.semibold },
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
    transcriptLive: { color: '#b9b9c4' },

    controls: { position: 'absolute', bottom: 80, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
    ctrlBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
    ctrlBtnPrimary: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#d63a3f', shadowColor: '#ff5a5f', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12, alignItems: 'center', justifyContent: 'center' },
    ctrlSquare: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#ffffff' },
    ctrlLabel: { position: 'absolute', bottom: 36, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#6e6e7a', letterSpacing: 0.4 },
});
