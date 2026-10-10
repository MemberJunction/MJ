import type { RefObject } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { Type } from '@/theme/tokens';
import { TRANSCRIPT_CARD, VoiceStageLayout, type VoiceStageMetrics } from '@/voice/voice-call-layout';

/**
 * @fileoverview The voice call screen under its top row and notice: the orb's stage, the transcript
 * card, and the call controls.
 *
 * The controls sit in flow at the bottom and the middle takes what they leave, so the card always
 * ends above them; how the middle is split is `VoiceStageLayout`'s rule. Part of the voice screen's
 * immersive dark surface, so it uses that screen's static palette rather than the (light) theme
 * tokens. It holds no state and runs no animation (the screen measures, animates and passes
 * everything in), so this package's tests, which have no React Native renderer, can render it.
 */

/** An animated number the screen drives: an `Animated.Value` or an interpolation of one. */
export type VoiceAnimatedNumber = Animated.Value | Animated.AnimatedInterpolation<number>;

/** The orb's motion, driven by the screen's animation loops. */
export type VoiceOrbMotion = {
    /** The orb's breathing scale. */
    OrbScale: VoiceAnimatedNumber;
    /** Each ripple ring's scale and opacity. */
    Ripples: ReadonlyArray<{ Scale: VoiceAnimatedNumber; Opacity: VoiceAnimatedNumber }>;
};

/** What the call body renders. */
export type VoiceCallBodyProps = {
    /** Height of the middle (the stage and the card), as last measured; `null` before the first layout. */
    MiddleHeight: number | null;
    /** Called with the middle's height whenever its layout changes. */
    OnMiddleLayout: (height: number) => void;
    /** The phone's text size against the default (`useWindowDimensions().fontScale`); the card's room grows with it. */
    FontScale: number;
    /** The orb's motion. */
    Motion: VoiceOrbMotion;
    /** The live audio level that scales the waveform's bars, or `null` when the driver doesn't meter audio. */
    LiveLevel: number | null;
    /** The card's label, e.g. "YOU · LIVE". */
    TranscriptLabel: string;
    /** The latest caption, or the status hint before there is one. */
    TranscriptText: string;
    /** The caption's scroll view, which is kept at its end as the caption grows. */
    TranscriptScrollRef: RefObject<ScrollView | null>;
    /** Called when the user taps the stop button ("Stop" to a screen reader). */
    OnStop: () => void;
};

/**
 * Renders the stage, the transcript card and the controls as one column that fills the space under
 * the notice.
 *
 * The middle reports its height through {@link VoiceCallBodyProps.OnMiddleLayout}; the screen keeps
 * it and passes it back as {@link VoiceCallBodyProps.MiddleHeight}, which sizes the stage. The card
 * is as tall as its caption, up to the room under the stage; past that the caption scrolls, kept at
 * its latest words.
 *
 * A screen reader finds the controls as three buttons: "Keyboard", "Stop" and "Menu", the words the
 * screen's hint and the mobile app plan use for them. Only "Stop" acts; the other two are disabled
 * placeholders.
 */
export function VoiceCallBody({
    MiddleHeight,
    OnMiddleLayout,
    FontScale,
    Motion,
    LiveLevel,
    TranscriptLabel,
    TranscriptText,
    TranscriptScrollRef,
    OnStop,
}: VoiceCallBodyProps) {
    return (
        <View style={styles.body}>
            <View style={styles.middle} onLayout={(e) => OnMiddleLayout(e.nativeEvent.layout.height)}>
                <VoiceStage Metrics={VoiceStageLayout(MiddleHeight, FontScale)} Motion={Motion} LiveLevel={LiveLevel} />
                <View style={styles.transcriptCard}>
                    <Text style={styles.transcriptLabel}>{TranscriptLabel}</Text>
                    <ScrollView
                        ref={TranscriptScrollRef}
                        style={styles.transcriptScroll}
                        onContentSizeChange={() => TranscriptScrollRef.current?.scrollToEnd({ animated: true })}
                    >
                        <Text style={styles.transcript}>{TranscriptText}</Text>
                    </ScrollView>
                </View>
            </View>

            <View style={styles.controlsBlock}>
                <View style={styles.controls}>
                    {/* The side buttons are the mobile app plan's keyboard mode and menu, which aren't built yet.
                        They are disabled, so a screen reader says they can't be used rather than offering a
                        button that does nothing. */}
                    <Pressable style={styles.ctrlBtn} disabled accessibilityRole="button" accessibilityLabel="Keyboard">
                        <Icons.ChevronUp size={22} color="#f6f6f8" strokeWidth={2} />
                    </Pressable>
                    <Pressable style={styles.ctrlBtnPrimary} onPress={OnStop} accessibilityRole="button" accessibilityLabel="Stop">
                        <View style={styles.ctrlSquare} />
                    </Pressable>
                    <Pressable style={styles.ctrlBtn} disabled accessibilityRole="button" accessibilityLabel="Menu">
                        <Icons.Sliders size={22} color="#f6f6f8" strokeWidth={2} />
                    </Pressable>
                </View>
                <Text style={styles.ctrlLabel}>Tap to stop · swipe right for keyboard</Text>
            </View>
        </View>
    );
}

/**
 * The orb, its two ripple rings and the waveform, at the sizes {@link VoiceStageLayout} gives.
 *
 * @param Metrics The stage's sizes for the current middle.
 * @param Motion The orb's motion.
 * @param LiveLevel The live audio level, or `null`.
 */
function VoiceStage({ Metrics, Motion, LiveLevel }: { Metrics: VoiceStageMetrics; Motion: VoiceOrbMotion; LiveLevel: number | null }) {
    const frame = { width: Metrics.Frame, height: Metrics.Frame, borderRadius: Metrics.Frame / 2 };
    const orb = { width: Metrics.Orb, height: Metrics.Orb, borderRadius: Metrics.Orb / 2, shadowRadius: Metrics.Glow };
    return (
        <View style={[styles.stage, { height: Metrics.Height, paddingTop: Metrics.TopGap }]}>
            <View style={[styles.orbFrame, frame]}>
                {Motion.Ripples.map((ripple, i) => (
                    <Animated.View
                        key={i}
                        style={[styles.ripple, frame, { transform: [{ scale: ripple.Scale }], opacity: ripple.Opacity }]}
                    />
                ))}
                <Animated.View style={[styles.orb, orb, { transform: [{ scale: Motion.OrbScale }] }]} />
            </View>

            <View style={[styles.waveform, { marginTop: Metrics.WaveGap, height: Metrics.Wave }]}>
                {WAVE_HEIGHTS.map((h, i) => (
                    <View key={i} style={[styles.bar, { height: barHeight(h * Metrics.Scale, LiveLevel) }]} />
                ))}
            </View>
        </View>
    );
}

/** Scales a decorative bar by the live audio level when metered, else uses the static height. */
function barHeight(base: number, level: number | null): number {
    if (level === null) {
        return base;
    }
    return Math.max(6, base * (0.4 + level));
}

/** Static bar heights (pt) for the decorative waveform at full size — scaled by real amplitude when metered. */
const WAVE_HEIGHTS = [18, 32, 52, 42, 28, 48, 36, 22, 40, 30, 50, 24, 38];

const styles = StyleSheet.create({
    // The column under the notice. The middle takes what the controls leave, so the controls (in
    // flow, last) can't be run under.
    body: { flex: 1 },
    middle: { flex: 1 },

    stage: { alignItems: 'center' },
    orbFrame: { alignItems: 'center', justifyContent: 'center' },
    ripple: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' },
    orb: { backgroundColor: '#3a5cd0', shadowColor: '#6688f0', shadowOpacity: 0.6, shadowOffset: { width: 0, height: 0 }, elevation: 24 },

    waveform: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    bar: { width: 4, borderRadius: 2, backgroundColor: '#6688f0' },

    // As tall as its caption, and shrinks to the room under the stage; the caption then scrolls.
    transcriptCard: {
        flexShrink: 1,
        marginHorizontal: 24,
        padding: TRANSCRIPT_CARD.Padding,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: TRANSCRIPT_CARD.Border,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 22,
    },
    transcriptLabel: { fontSize: 11, lineHeight: TRANSCRIPT_CARD.LabelLineHeight, fontWeight: Type.bold, color: 'rgba(170,186,255,0.85)', letterSpacing: 1.4, marginBottom: TRANSCRIPT_CARD.LabelGap },
    transcriptScroll: { flexGrow: 0, flexShrink: 1 },
    transcript: { fontSize: 19, lineHeight: TRANSCRIPT_CARD.CaptionLineHeight, color: '#f6f6f8', fontWeight: Type.medium, letterSpacing: -0.2 },

    controlsBlock: { paddingTop: 16, paddingBottom: 12 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
    ctrlBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
    ctrlBtnPrimary: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#d63a3f', shadowColor: '#ff5a5f', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12, alignItems: 'center', justifyContent: 'center' },
    ctrlSquare: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#ffffff' },
    ctrlLabel: { marginTop: 20, textAlign: 'center', fontSize: 12, color: '#6e6e7a', letterSpacing: 0.4 },
});
