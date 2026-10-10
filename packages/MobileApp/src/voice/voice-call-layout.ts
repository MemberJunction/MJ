/**
 * @fileoverview How the voice call screen shares its height between the orb and the transcript card.
 *
 * The screen is a column: the top row, the avatar notice while it shows, the middle, and the call
 * controls in flow at the bottom. The middle is what the others leave, and the stage (the orb, its
 * ripples and the waveform) and the transcript card share it. The card always keeps room for its
 * label and {@link TRANSCRIPT_CARD.MinCaptionLines} lines of caption at the phone's text size; the
 * stage takes the rest, up to its full size, and scales down evenly below that. So on a short
 * phone, or while the notice shows, the orb gets smaller instead of the card running under the
 * controls (#5344).
 *
 * Free of any React Native import, so the rule can be tested without a renderer.
 */

/** The transcript card's box. Its styles use these numbers, and the room it keeps is built from them. */
export const TRANSCRIPT_CARD = {
    /** Padding inside the card, on every side. */
    Padding: 22,
    /** The card's border width. */
    Border: 1,
    /** Line height of the card's label ("YOU · LIVE"), at the default text size. */
    LabelLineHeight: 14,
    /** Space between the label and the caption. */
    LabelGap: 8,
    /** Line height of the caption, at the default text size. */
    CaptionLineHeight: 26,
    /** Caption lines the card always has room for; a longer caption scrolls. */
    MinCaptionLines: 2,
} as const;

/**
 * The least height the middle leaves the transcript card: its padding, border, label and
 * {@link TRANSCRIPT_CARD.MinCaptionLines} caption lines.
 *
 * @param fontScale The phone's text size against the default (React Native scales font sizes and
 *   line heights by it, not padding); 1 when not given, not a finite number, or not above 0.
 * @returns The height in points: 120 at the default text size.
 */
export function TranscriptMinHeight(fontScale = 1): number {
    const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
    const box = 2 * (TRANSCRIPT_CARD.Padding + TRANSCRIPT_CARD.Border) + TRANSCRIPT_CARD.LabelGap;
    const lines = TRANSCRIPT_CARD.LabelLineHeight + TRANSCRIPT_CARD.MinCaptionLines * TRANSCRIPT_CARD.CaptionLineHeight;
    return box + lines * scale;
}

/** The stage's parts at full size, top to bottom: the spacing of the voice mode mockup. */
export const STAGE_FULL = {
    /** Space above the orb. */
    TopGap: 30,
    /** The square the orb sits in and the ripples fill. */
    Frame: 240,
    /** The orb's diameter. */
    Orb: 200,
    /** The orb's glow (iOS shadow radius). */
    Glow: 80,
    /** Space between the orb's frame and the waveform. */
    WaveGap: 32,
    /** The waveform's height. */
    Wave: 56,
    /** Space between the waveform and the transcript card. */
    BottomGap: 32,
} as const;

/** The stage's height at full size. */
export const STAGE_FULL_HEIGHT =
    STAGE_FULL.TopGap + STAGE_FULL.Frame + STAGE_FULL.WaveGap + STAGE_FULL.Wave + STAGE_FULL.BottomGap;

/** The stage's sizes for one layout, in points. The gap above the card is what is left of {@link Height}. */
export type VoiceStageMetrics = {
    /** The stage's height. */
    Height: number;
    /** The stage's size against full size, from 0 to 1; every part below is scaled by it. */
    Scale: number;
    /** Space above the orb. */
    TopGap: number;
    /** Side of the orb's square frame, which the ripples fill. */
    Frame: number;
    /** The orb's diameter. */
    Orb: number;
    /** The orb's glow radius. */
    Glow: number;
    /** Space between the frame and the waveform. */
    WaveGap: number;
    /** The waveform's height; its bars scale by {@link Scale}. */
    Wave: number;
};

/**
 * Sizes the stage for the middle of the screen, leaving the transcript card its room.
 *
 * @param middleHeight Height of the area the stage and the transcript card share, as measured, or
 *   `null` before the first layout (and for a measurement that isn't a finite number), which gives
 *   the full-size stage.
 * @param fontScale The phone's text size against the default, which the card's room grows with;
 *   see {@link TranscriptMinHeight}.
 * @returns The stage's sizes: full size when the middle has room for it and the card's minimum,
 *   otherwise scaled evenly into the room the card's minimum leaves, down to nothing.
 */
export function VoiceStageLayout(middleHeight: number | null, fontScale = 1): VoiceStageMetrics {
    const room = middleHeight === null || !Number.isFinite(middleHeight)
        ? STAGE_FULL_HEIGHT
        : middleHeight - TranscriptMinHeight(fontScale);
    const height = Math.min(STAGE_FULL_HEIGHT, Math.max(0, room));
    const scale = height / STAGE_FULL_HEIGHT;
    return {
        Height: height,
        Scale: scale,
        TopGap: STAGE_FULL.TopGap * scale,
        Frame: STAGE_FULL.Frame * scale,
        Orb: STAGE_FULL.Orb * scale,
        Glow: STAGE_FULL.Glow * scale,
        WaveGap: STAGE_FULL.WaveGap * scale,
        Wave: STAGE_FULL.Wave * scale,
    };
}
