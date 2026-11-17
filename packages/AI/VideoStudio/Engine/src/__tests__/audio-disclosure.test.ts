import { describe, expect, it } from 'vitest';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import { CollectRenderedAudioIssues, SpecExpectsAudio, SummarizeRenderedAudio } from '../agents/render-agent.js';
import { BuildTimelineTable } from '../review/critic-input.js';
import { ComposeHumanReviewNotes } from '../review/human-review-notes.js';

function audioSpec(audio: VideoGenerationSpec['Audio']): VideoGenerationSpec {
    return { Audio: audio } as VideoGenerationSpec;
}

const SYNTH_AUDIO: VideoGenerationSpec['Audio'] = {
    Music: { Synthesized: { Mood: 'Reflective', Bpm: 72 } },
    Cues: [{ Key: 'w', TimestampSeconds: 2, Kind: 'Sfx', Synth: 'Whoosh', Notes: 'transition' }],
    Captions: 'None',
};

describe('synthesized audio disclosure', () => {
    it('appears in HumanReviewNotes', () => {
        const notes = ComposeHumanReviewNotes(audioSpec(SYNTH_AUDIO));
        expect(notes).toContain('Synthesized audio');
        expect(notes).toContain('- Music: synthesized Reflective bed at 72 BPM (procedurally generated, not a licensed track)');
        expect(notes).toContain('- Sound effects: 1 synthesized (Whoosh at 2.00s)');
    });

    it('appears in the critic timeline, with the cue source named', () => {
        const table = BuildTimelineTable(audioSpec(SYNTH_AUDIO));
        expect(table).toContain('| w | 2.00 | Sfx | — | synthesized Whoosh | transition |');
        expect(table).toContain('### Synthesized audio');
    });

    it('is absent for a supplied-files soundtrack', () => {
        const spec = audioSpec({ Music: { AssetKey: 'track' }, Cues: [], Captions: 'None' });
        expect(ComposeHumanReviewNotes(spec)).not.toContain('Synthesized audio');
        expect(BuildTimelineTable(spec)).not.toContain('Synthesized audio');
    });
});

describe('render-agent audio helpers', () => {
    it('SpecExpectsAudio counts narration, licensed or synthesized music, and effects', () => {
        expect(SpecExpectsAudio(audioSpec({ Cues: [], Captions: 'None' }))).toBe(false);
        expect(SpecExpectsAudio(audioSpec(SYNTH_AUDIO))).toBe(true);
        expect(SpecExpectsAudio(audioSpec({ Cues: [{ Key: 'c', TimestampSeconds: 1, Kind: 'Sfx', Synth: 'Click' }], Captions: 'None' }))).toBe(true);
        expect(
            SpecExpectsAudio(audioSpec({ Narration: { Enabled: false, VoiceID: '', Provider: '', Script: [{ Key: 'l', BeatKey: 'b', Text: 't' }] }, Cues: [], Captions: 'None' })),
        ).toBe(false);
    });

    it('CollectRenderedAudioIssues reports a missing track first, else only worker Errors', () => {
        expect(CollectRenderedAudioIssues('16:9', audioSpec(SYNTH_AUDIO), { HasAudio: false }).map((i) => i.Code)).toEqual(['MissingRenderedAudioTrack']);
        expect(
            CollectRenderedAudioIssues('16:9', audioSpec(SYNTH_AUDIO), {
                HasAudio: true,
                Audio: {
                    Mixed: true,
                    Normalized: true,
                    Measurements: {},
                    Issues: [
                        { Code: 'A', Category: 'Audio', Severity: 'Error', Message: 'a' },
                        { Code: 'B', Category: 'Audio', Severity: 'Warning', Message: 'b' },
                    ],
                    Synthesized: [],
                },
            }).map((i) => i.Code),
        ).toEqual(['A']);
    });

    it('SummarizeRenderedAudio keeps measurements and disclosure', () => {
        expect(SummarizeRenderedAudio({})).toBeUndefined();
        expect(
            SummarizeRenderedAudio({
                Audio: { Mixed: true, Normalized: true, Measurements: { IntegratedLufs: -14, SamplePeakDb: -2 }, Issues: [], Synthesized: ['x'] },
            }),
        ).toEqual({ IntegratedLufs: -14, Synthesized: ['x'] });
    });
});
