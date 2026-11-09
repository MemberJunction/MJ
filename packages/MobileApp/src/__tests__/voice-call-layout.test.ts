import { describe, it, expect } from 'vitest';
import {
    STAGE_FULL,
    STAGE_FULL_HEIGHT,
    TranscriptMinHeight,
    VoiceStageLayout,
} from '@/voice/voice-call-layout';

/**
 * Tests for how the voice call screen shares its middle between the orb's stage and the transcript
 * card (#5344).
 *
 * The rule: the card always keeps room for its label and two caption lines at the phone's text
 * size; the stage takes the rest, up to full size, and scales down evenly below that. On a
 * 375 × 667 iPhone SE with the avatar notice showing, the middle measures about 380 pt (in a
 * browser harness), so that size is used as the small-phone case below.
 */
const SE_WITH_NOTICE = 380;
const MIN = TranscriptMinHeight();

describe('TranscriptMinHeight', () => {
    it("is the card's padding, border, label and two caption lines", () => {
        // 2 × (22 padding + 1 border) + 14 label + 8 gap + 2 × 26 caption lines.
        expect(MIN).toBe(120);
    });

    it('grows the label and caption lines with the text size, not the padding', () => {
        // React Native scales font sizes and line heights by the text size; padding and the gap stay.
        expect(TranscriptMinHeight(2)).toBe(46 + 8 + (14 + 2 * 26) * 2);
        expect(TranscriptMinHeight(1.5)).toBeGreaterThan(MIN);
    });

    it('uses the default text size for a scale that is missing, not finite, or not above 0', () => {
        for (const scale of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
            expect(TranscriptMinHeight(scale)).toBe(MIN);
        }
    });
});

describe('VoiceStageLayout', () => {
    it('gives the full-size stage before the first layout', () => {
        const stage = VoiceStageLayout(null);
        expect(stage.Height).toBe(STAGE_FULL_HEIGHT);
        expect(stage.Scale).toBe(1);
        expect(stage.Frame).toBe(240);
        expect(stage.Orb).toBe(200);
    });

    it('treats a measurement that is not a finite number as not yet measured', () => {
        expect(VoiceStageLayout(Number.NaN).Height).toBe(STAGE_FULL_HEIGHT);
        expect(VoiceStageLayout(Number.POSITIVE_INFINITY).Height).toBe(STAGE_FULL_HEIGHT);
    });

    it("keeps the full-size stage when the middle has room for it and the card's minimum", () => {
        expect(VoiceStageLayout(STAGE_FULL_HEIGHT + MIN).Scale).toBe(1);
        expect(VoiceStageLayout(900).Height).toBe(STAGE_FULL_HEIGHT);
    });

    it('leaves the card its minimum on a small phone with the notice shown, scaling the stage into the rest', () => {
        const stage = VoiceStageLayout(SE_WITH_NOTICE);
        expect(stage.Height + MIN).toBe(SE_WITH_NOTICE);
        expect(stage.Height).toBe(260);
        expect(stage.Scale).toBeCloseTo(260 / 390);
        expect(stage.Orb).toBeCloseTo(200 * (260 / 390));
    });

    it('gives the card more room at a larger text size, taking it from the stage', () => {
        const larger = VoiceStageLayout(SE_WITH_NOTICE, 1.5);
        expect(larger.Height + TranscriptMinHeight(1.5)).toBe(SE_WITH_NOTICE);
        expect(larger.Height).toBeLessThan(VoiceStageLayout(SE_WITH_NOTICE).Height);
    });

    it('scales every part of the stage by the same factor', () => {
        const stage = VoiceStageLayout(300);
        expect(stage.TopGap / STAGE_FULL.TopGap).toBeCloseTo(stage.Scale);
        expect(stage.Frame / STAGE_FULL.Frame).toBeCloseTo(stage.Scale);
        expect(stage.Orb / STAGE_FULL.Orb).toBeCloseTo(stage.Scale);
        expect(stage.Glow / STAGE_FULL.Glow).toBeCloseTo(stage.Scale);
        expect(stage.WaveGap / STAGE_FULL.WaveGap).toBeCloseTo(stage.Scale);
        expect(stage.Wave / STAGE_FULL.Wave).toBeCloseTo(stage.Scale);
    });

    it('fills the stage with its parts, the gap above the card being what is left', () => {
        for (const middle of [null, 900, SE_WITH_NOTICE, 250, 130]) {
            const stage = VoiceStageLayout(middle);
            const gapAboveCard = stage.Height - (stage.TopGap + stage.Frame + stage.WaveGap + stage.Wave);
            expect(gapAboveCard).toBeCloseTo(STAGE_FULL.BottomGap * stage.Scale);
        }
    });

    it('never gives the stage a negative size', () => {
        for (const middle of [MIN, 60, 0, -40]) {
            const stage = VoiceStageLayout(middle);
            expect(stage.Height).toBe(0);
            expect(stage.Scale).toBe(0);
            expect(stage.Orb).toBe(0);
        }
    });

    it("never takes the card's minimum, and gives up no more of the stage than that needs", () => {
        for (const fontScale of [1, 1.35, 2]) {
            const min = TranscriptMinHeight(fontScale);
            for (let middle = 0; middle <= 1000; middle += 5) {
                const { Height } = VoiceStageLayout(middle, fontScale);
                if (middle >= STAGE_FULL_HEIGHT + min) {
                    // Room for both: the stage stays full size and the card gets the rest.
                    expect(Height).toBe(STAGE_FULL_HEIGHT);
                } else if (middle >= min) {
                    // Short: the card gets exactly its minimum and the stage everything else.
                    expect(Height + min).toBeCloseTo(middle);
                } else {
                    expect(Height).toBe(0);
                }
            }
        }
    });
});
